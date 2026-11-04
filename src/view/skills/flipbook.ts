// Source: games/dragon-hold/src/view/flipbook.ts @62f2f8c (adapted: id-agnostic clips per element folder and a lenient manifest; modes "fire" (its premultiplied fire-on-black blend with ground occlusion, kept), "smoke" (density), a new "rgba" (straight-alpha clips with real alpha, crossfaded premultiplied, eroded instead of faded) and a new "heat" (a clip's light read as heat and coloured through a soot-rimmed ramp); its test A/B/C modes, the mask output and the burn-lift dropped; a full pool drops a new sprite instead of cutting a live one short; a two-rate time map (an attack at one rate, then a slower linger) and a per-pool alpha sharpen that keeps a slowed clip solid (between frames each pixel's coverage switches at its own moment, colours crossfading); vxNoise/vxSoftGround copied from its vfx-layers.ts @c2a6f9b)
/**
 * Flipbook sprites for the element layer (canon D59, ELEMENT_LAYER §3 "FlipbookPlayer"): Fire, Thunder and Wind
 * clips, and RGBA clips with real alpha of every element, cut from Adobe Firefly Video into atlases. Media stays
 * out of Git: art-src/lab/vfx/<element>/manifest.json and its atlases (dev assets of the lab).
 *
 * Manifest (one per element folder):
 *   { "version": 1, "flipbooks": { "<id>": { "file": "<id>.png", "cols": 4, "rows": 4, "frames": 16, "fps": 24,
 *     "cell": 256 | [w, h], "loop": false, "mode": "rgba" | "fire" | "smoke" | "heat", "pivot": [0.5, 0.5], "start": 0,
 *     "heading": 0, "alpha": "straight" } } }
 * "clips" may stand for "flipbooks" (an object, or an array of entries with "id"), "atlas" for "file", "grid":
 * [cols, rows] for cols and rows. URLs are built from the folder and the file name, never taken from the JSON.
 * Optional v2 fields: loopMode ("none": one pass, "stepped": held loop, "holderode": per-pixel switching loop),
 * frameRange [first, last], controlA, controlB and timingProfile. Any of these selects the v2 shader; otherwise the
 * original vertex/fragment shaders stay unchanged, including the crossfade across an old `loop: true` seam.
 * In v2, `frames` is the number of frames in ONE variant: variant v starts at cell v * frames; `variants` is ignored
 * entirely on old entries (including the existing glint atlases). `anchor` overrides pivot, and `sourceFps` records
 * the source rate without changing playback. Neither selects v2. Mask A stores hull/ink/hot line/survival order in
 * RGBA; mask B stores reveal order/motion influence in RG. Masks are linear data, aligned with the atlas cells.
 *
 * Modes (the kit picks one per clip; the manifest's "mode" is used when the kit names none):
 * - "rgba": straight alpha (the colour as filmed, the coverage in alpha): frames crossfade premultiplied, drawn with
 *   a normal premultiplied blend. Its alpha is real coverage, so a fire body on pale stone stays solid (never the
 *   brightness-as-alpha veil of DRAGON_FIRE_DIAGNOSIS); it can burn out by erosion (`cool`) instead of fading. The
 *   atlas must have dilated colour under its transparent texels (mip levels average them in).
 * - "fire": fire on black (Dragonhold's): its light is added and the ground under it darkens by its luminance ×
 *   `occlude`; with occlude 0 it is purely additive. Use it only for thin energy (embers, sparks, cores), never as a
 *   fire body over the ground.
 * - "smoke": a density (alpha, else luminance) coloured by `tint`, lit from the top, normal blend.
 * - "heat" (Gemini's heat field, ELEMENT_LAYER research 03/11/2026): a clip on black (Dragonhold's fire atlases) read as a
 *   HEAT field 0..1 (its light, perceptual, × the sprite's intensity) and coloured here through four bands, drawn
 *   premultiplied: under ~0.12 eroded away with noise (crisp tongues); 0.12–0.35 the cooling edge in soot at alpha 0.85
 *   (it covers the pale floor round the flame: the anti-veil); 0.35–0.8 the body from deep orange to amber at 0.95;
 *   over 0.8 the white-gold core (× 2.2, the only part that blooms). The ramp is the pool's (`setHeatRamp`); a pool's
 *   `taper` cools the clip from its head (cell right, the way `dir` points) to its tail (a trail behind a blade).
 * The material: frames blended in time (a crossfade between neighbouring frames, so a clip slowed down never steps;
 * a pool's `sharpen` keeps it solid: between frames each pixel's coverage switches at its own moment, hold and erode,
 * so the parts leaving the clip never fade see-through), a pivot, billboards that turn to follow a world direction on screen (a
 * flame along a flight), analytic soft particles against the ground, and an exact depth lift.
 */
import * as THREE from "three";

export type FlipbookMode = "rgba" | "fire" | "smoke" | "heat";
export type FlipbookLoopMode = "none" | "stepped" | "holderode";

export interface FlipbookTiming {
  readonly revealTicks: number;
  readonly holdEnd: number;
  readonly tearEnd: number;
  readonly tearE: number;
  readonly erodeEnd: number;
  readonly width: number;
  readonly rampTicks: number;
}

export const FLIPBOOK_TIMING = {
  // TRIAL (INTEGRATION_PLAN §2.6): reveal 0–3, hold 4–9, tear 10–20, soot and dust 20–42.
  "impact-key1": { revealTicks: 4, holdEnd: 9, tearEnd: 20, tearE: 0.85, erodeEnd: 42, width: 0.08, rampTicks: 4 },
} as const satisfies Readonly<Record<string, FlipbookTiming>>;
export type FlipbookTimingName = keyof typeof FLIPBOOK_TIMING;
export const FLIPBOOK_ERODE_WIDTH = 0.08;

export type FlipbookVec3 = readonly [number, number, number];
export type FlipbookVec4 = readonly [number, number, number, number];

export interface FlipbookMaskedLook {
  readonly ink: FlipbookVec4;
  readonly bodyCap: number;
  readonly hot: FlipbookVec4;
  readonly hotLead: number;
  /** Strength 0–1: r = min(r, mix(1, 0.4, rampCool * smoothstep(0.2, 0.85, e))); default 0. */
  readonly rampCool: number;
  readonly ramp: readonly [FlipbookVec3, FlipbookVec3, FlipbookVec3];
  readonly soot: FlipbookVec3;
  readonly sharpen: readonly [number, number];
  readonly grade: FlipbookVec4;
}

export const FLIPBOOK_MASKED_LOOK: FlipbookMaskedLook = {
  ink: [0.03, 0.022, 0.02, 0.55],
  bodyCap: 0.88,
  hot: [1, 0.982, 0.871, 2.2],
  hotLead: 0.1,
  rampCool: 0,
  ramp: [[1, 0.982, 0.871], [1, 0.473, 0.001], [0.693, 0.04, 0]],
  soot: [0.03, 0.022, 0.02],
  sharpen: [0, 0],
  grade: [0, 0, 0, 0],
};

export interface FlipbookMeta {
  readonly id: string;
  readonly url: string;
  readonly cols: number;
  readonly rows: number;
  /** Frames used (≤ cols × rows, row-major from the top-left cell). */
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  /** The manifest's mode (the kit's choice wins). */
  readonly mode: FlipbookMode;
  /** Cell width ÷ height. */
  readonly aspect: number;
  /** Where the effect's origin sits in a cell: x from the left, y from the top (0–1). */
  readonly pivot: readonly [number, number];
  /** First frame a one-shot plays from. */
  readonly start: number;
  /** Which way the effect travels in its cell (radians, 0 = to the right): a sprite turned along a direction undoes it. */
  readonly heading: number;
  /** v2 playback policy; overrides `loop`. */
  readonly loopMode?: FlipbookLoopMode;
  /** Inclusive frame segment inside one variant (0 … frames − 1). */
  readonly frameRange?: readonly [number, number];
  /** v2 only: variants × frames ≤ cols × rows; variant v starts at cell v × frames. Ignored on old entries. */
  readonly variants?: number;
  /** Linear masks: A = hull, ink, hot line, survival order; B = reveal order, motion influence. */
  readonly controlA?: string;
  readonly controlB?: string;
  /** Origin in the cell, from the top left (0–1); overrides pivot. */
  readonly anchor?: readonly [number, number];
  /** Source rate for tooling only; playback still uses fps. */
  readonly sourceFps?: number;
  /** Default reveal/erosion schedule; requires controlA. */
  readonly timingProfile?: FlipbookTimingName;
}

export function isFlipbookV2(meta: FlipbookMeta): boolean {
  return meta.loopMode !== undefined || meta.frameRange !== undefined || meta.controlA !== undefined || meta.controlB !== undefined || meta.timingProfile !== undefined;
}

export function flipbookLoopMode(meta: FlipbookMeta): FlipbookLoopMode {
  return meta.loopMode ?? (meta.loop ? "stepped" : "none");
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;
const ID = /^[a-z0-9][a-z0-9._-]*$/;
const FILE = /^[a-z0-9][a-z0-9._-]*\.(png|webp)$/i;

/** Reads an element folder's manifest (format above). Unknown fields are ignored; a bad entry throws. */
export function parseFlipbookManifest(value: unknown, base: string): Map<string, FlipbookMeta> {
  if (!record(value) || (value.version !== undefined && value.version !== 1)) throw new Error("Invalid flipbook manifest");
  const raw = value.flipbooks ?? value.clips;
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((e): [string, unknown] => [record(e) && typeof e.id === "string" ? e.id : "", e])
    : record(raw)
      ? Object.entries(raw)
      : [];
  if (entries.length === 0 && raw === undefined) throw new Error("Invalid flipbook manifest: no flipbooks");
  const out = new Map<string, FlipbookMeta>();
  for (const [id, entry] of entries) {
    if (!ID.test(id)) throw new Error("Invalid flipbook id: " + id);
    if (!record(entry)) throw new Error("Invalid flipbook entry: " + id);
    const file = entry.file ?? entry.atlas;
    if (typeof file !== "string" || !FILE.test(file)) throw new Error("Invalid flipbook file: " + id);
    const grid = Array.isArray(entry.grid) && entry.grid.length === 2 ? entry.grid : [entry.cols, entry.rows];
    const cols = grid[0];
    const rows = grid[1];
    if (!count(cols, 64) || !count(rows, 64)) throw new Error("Invalid flipbook grid: " + id);
    const frames = entry.frames === undefined ? cols * rows : entry.frames;
    if (!count(frames, cols * rows)) throw new Error("Invalid flipbook frames: " + id);
    const fps = entry.fps === undefined ? 24 : entry.fps;
    if (typeof fps !== "number" || !(fps > 0 && fps <= 120)) throw new Error("Invalid flipbook fps: " + id);
    const cell = entry.cell;
    const [cw, ch] = typeof cell === "number" ? [cell, cell] : Array.isArray(cell) && cell.length === 2 ? [cell[0], cell[1]] : [256, 256];
    if (!count(cw, 4096) || !count(ch, 4096)) throw new Error("Invalid flipbook cell: " + id);
    const pivot = Array.isArray(entry.pivot) && entry.pivot.length === 2 && entry.pivot.every((v) => typeof v === "number" && Number.isFinite(v)) ? (entry.pivot as number[]) : [0.5, 0.5];
    // A pivot in pixels (either value over 1) is read in the cell's own pixels.
    const px = pivot[0]! > 1 || pivot[1]! > 1 ? [pivot[0]! / cw, pivot[1]! / ch] : pivot;
    const start = typeof entry.start === "number" && Number.isInteger(entry.start) && entry.start >= 0 && entry.start < frames ? entry.start : 0;
    const straight = entry.alpha === true || entry.alpha === "straight";
    const mode: FlipbookMode = entry.mode === "fire" || entry.mode === "smoke" || entry.mode === "rgba" || entry.mode === "heat" ? entry.mode : straight ? "rgba" : entry.blend === "normal" ? "smoke" : "fire";
    const md5 = typeof entry.md5 === "string" && /^[0-9a-f]{32}$/.test(entry.md5) ? "?v=" + entry.md5 : "";
    const v2 = entry.loopMode !== undefined || entry.frameRange !== undefined || entry.controlA !== undefined || entry.controlB !== undefined || entry.timingProfile !== undefined;
    const extra: {
      loopMode?: FlipbookLoopMode; frameRange?: readonly [number, number]; variants?: number;
      controlA?: string; controlB?: string; anchor?: readonly [number, number]; sourceFps?: number; timingProfile?: FlipbookTimingName;
    } = {};
    let loop = entry.loop === true;
    if (entry.loopMode !== undefined) {
      if (entry.loopMode !== "none" && entry.loopMode !== "stepped" && entry.loopMode !== "holderode") throw new Error("Invalid flipbook loopMode: " + id);
      extra.loopMode = entry.loopMode;
      loop = entry.loopMode !== "none";
    } else if (v2) extra.loopMode = loop ? "stepped" : "none";
    if (entry.frameRange !== undefined) {
      const r = entry.frameRange;
      if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== "number" || !Number.isInteger(r[0]) || typeof r[1] !== "number" || !Number.isInteger(r[1]) || r[0] < 0 || r[0] > r[1] || r[1] >= frames) throw new Error("Invalid flipbook frameRange: " + id);
      extra.frameRange = [r[0], r[1]];
    }
    if (v2 && entry.variants !== undefined) {
      if (!count(entry.variants, cols * rows) || entry.variants * frames > cols * rows) throw new Error("Invalid flipbook variants: " + id);
      extra.variants = entry.variants;
    }
    for (const name of ["controlA", "controlB"] as const) {
      const file = entry[name];
      if (file === undefined) continue;
      if (typeof file !== "string" || !FILE.test(file) || mode !== "rgba" || (name === "controlB" && entry.controlA === undefined)) throw new Error("Invalid flipbook " + name + ": " + id);
      extra[name] = base + file + md5;
    }
    if (entry.anchor !== undefined) {
      const a = entry.anchor;
      if (!Array.isArray(a) || a.length !== 2 || typeof a[0] !== "number" || !Number.isFinite(a[0]) || a[0] < 0 || typeof a[1] !== "number" || !Number.isFinite(a[1]) || a[1] < 0) throw new Error("Invalid flipbook anchor: " + id);
      const anchor: readonly [number, number] = a[0] > 1 || a[1] > 1 ? [a[0] / cw, a[1] / ch] : [a[0], a[1]];
      if (anchor[0] > 1 || anchor[1] > 1) throw new Error("Invalid flipbook anchor: " + id);
      extra.anchor = anchor;
    }
    if (entry.sourceFps !== undefined) {
      if (typeof entry.sourceFps !== "number" || !Number.isFinite(entry.sourceFps) || entry.sourceFps <= 0 || entry.sourceFps > 240) throw new Error("Invalid flipbook sourceFps: " + id);
      extra.sourceFps = entry.sourceFps;
    }
    if (entry.timingProfile !== undefined) {
      if (typeof entry.timingProfile !== "string" || !Object.prototype.hasOwnProperty.call(FLIPBOOK_TIMING, entry.timingProfile) || entry.controlA === undefined) throw new Error("Invalid flipbook timingProfile: " + id);
      extra.timingProfile = entry.timingProfile as FlipbookTimingName;
    }
    out.set(id, {
      id,
      url: base + file + md5,
      cols,
      rows,
      frames,
      fps,
      loop,
      mode,
      aspect: cw / ch,
      pivot: extra.anchor ?? [Math.min(1, Math.max(0, px[0]!)), Math.min(1, Math.max(0, px[1]!))],
      start,
      heading: typeof entry.heading === "number" && Number.isFinite(entry.heading) ? (entry.heading * Math.PI) / 180 : 0,
      ...extra,
    });
  }
  return out;
}

export interface FlipbookControls {
  readonly a?: THREE.Texture;
  readonly b?: THREE.Texture;
}

interface Entry {
  meta: FlipbookMeta;
  texture: THREE.Texture;
  controls: FlipbookControls | null;
}

/** One element folder's atlases (loaded once; pools attach as they arrive). */
export class FlipbookLibrary {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<(id: string) => void>();
  private loading: Promise<void> | null = null;

  constructor(readonly base: string) {}

  get(id: string): Entry | null {
    return this.entries.get(id) ?? null;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Calls `listener(id)` for each atlas as it arrives (and at once for those already in). Returns the unsubscribe. */
  watch(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    for (const id of this.entries.keys()) listener(id);
    return () => this.listeners.delete(listener);
  }

  /** Fetches the manifest and every atlas in it (once). No manifest: no clips (the kit's hooks draw without them). */
  load(anisotropy = 4): Promise<void> {
    if (this.loading !== null) return this.loading;
    if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return (this.loading = Promise.resolve());
    this.loading = (async () => {
      let metas: Map<string, FlipbookMeta>;
      try {
        const response = await fetch(this.base + "manifest.json", { cache: "no-cache" });
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return;
        metas = parseFlipbookManifest(await response.json(), this.base);
      } catch (error) {
        console.warn("[flipbook] no manifest at " + this.base, error);
        return;
      }
      const loader = new THREE.TextureLoader();
      await Promise.all(
        [...metas.values()].map(async (meta) => {
          const loaded: THREE.Texture[] = [];
          try {
            const texture = await loader.loadAsync(meta.url);
            loaded.push(texture);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = anisotropy;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            // Straight alpha as stored: the shader premultiplies after sampling.
            texture.premultiplyAlpha = false;
            const controls: { a?: THREE.Texture; b?: THREE.Texture } = {};
            for (const [key, url] of [["a", meta.controlA], ["b", meta.controlB]] as const) {
              if (url === undefined) continue;
              const mask = await loader.loadAsync(url);
              loaded.push(mask);
              mask.colorSpace = THREE.NoColorSpace;
              mask.premultiplyAlpha = false;
              mask.generateMipmaps = true;
              mask.minFilter = THREE.LinearMipmapLinearFilter;
              mask.magFilter = THREE.LinearFilter;
              mask.anisotropy = anisotropy;
              mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
              controls[key] = mask;
            }
            this.add(meta, texture, meta.controlA !== undefined || meta.controlB !== undefined ? controls : null);
          } catch (error) {
            console.warn("[flipbook] " + meta.url + " did not load", error);
            for (const texture of loaded) texture.dispose();
          }
        }),
      );
    })();
    return this.loading;
  }

  /** Tests and captures: an atlas from memory. */
  add(meta: FlipbookMeta, texture: THREE.Texture, controls: FlipbookControls | null = null): void {
    this.entries.set(meta.id, { meta, texture, controls });
    for (const listener of this.listeners) listener(meta.id);
  }

  reset(): void {
    for (const entry of this.entries.values()) {
      entry.texture.dispose();
      entry.controls?.a?.dispose();
      entry.controls?.b?.dispose();
    }
    this.entries.clear();
    this.loading = null;
  }
}

const NOISE_GLSL = /* glsl */ `
float vxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vxHash(i), vxHash(i + vec2(1.0, 0.0)), u.x), mix(vxHash(i + vec2(0.0, 1.0)), vxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/** Analytic soft particles: the distance down the view ray to the ground at `ground` fades a sprite out before the depth test cuts it. */
const SOFT_GLSL = /* glsl */ `
float vxSoftGround(vec3 world, float ground, float fadeM) {
  if (ground < -1e4) return 1.0;
  vec3 ray = normalize(world - cameraPosition);
  float down = max(0.12, -ray.y);
  return smoothstep(0.0, fadeM, (world.y - ground) / down);
}`;

const VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec4 iColor;
attribute vec4 iDir;
attribute vec4 iAge;
attribute vec2 iLift;
uniform vec2 uPivot;
uniform float uAspect;
uniform float uHeading;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
varying vec4 vAge;
void main() {
  vUv = uv;
  vAge = iAge;
  vFrame = iData.z;
  vAlpha = iData.w;
  vTint = iColor.rgb;
  vGround = iColor.a;
  vOcclude = iDir.w;
  vec4 view = modelViewMatrix * vec4(iPos, 1.0);
  float angle = iData.y;
  vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
  // Turned to follow a world direction on screen (a flame along a flight); with a span (iLift.y, m) its width is that
  // length along the direction as the camera sees it (foreshortened like the blade it wraps), its height the size.
  if (dot(iDir.xyz, iDir.xyz) > 1e-8) {
    vec3 d = mat3(viewMatrix) * iDir.xyz;
    if (dot(d.xy, d.xy) > 1e-10) {
      angle += atan(d.y, d.x) - uHeading;
      if (iLift.y > 0.0) local.x = (uv.x - uPivot.x) * length(d.xy) / max(length(d), 1e-5) * iLift.y;
    }
  }
  float c = cos(angle);
  float s = sin(angle);
  vec2 corner = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  view.xy += corner;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = (modelMatrix * vec4(iPos, 1.0)).xyz + right * corner.x + up * corner.y;
  gl_Position = projectionMatrix * view;
  // Drawn nearer the eye by iLift (depth only: it projects where it stands).
  if (iLift.x != 0.0) {
    vec4 moved = projectionMatrix * vec4(view.xy, view.z + iLift.x, 1.0);
    gl_Position.z = moved.z / moved.w * gl_Position.w;
  }
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uLoop;
uniform float uMode;
uniform float uStep;
uniform float uSoftM;
uniform float uVignette;
uniform vec3 uSoot;
uniform vec3 uHeatDeep;
uniform vec3 uHeatAmber;
uniform vec3 uHeatCore;
uniform float uTaper;
uniform float uBlur;
uniform vec2 uSharpen;
uniform vec4 uGrade;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
varying vec4 vAge;
${NOISE_GLSL}
${SOFT_GLSL}
vec2 vxCell(float f, vec2 uv) {
  float col = mod(f, uGrid.x);
  float row = floor(f / uGrid.x);
  return (vec2(col, uGrid.y - 1.0 - row) + uv) / uGrid;
}
void main() {
  if (vAlpha <= 0.0) discard;
  // Frames blend in time (uStep: held cels); a loop wraps to its first frame.
  float f = uLoop > 0.5 ? mod(vFrame, uFrames) : clamp(vFrame, 0.0, uFrames - 1.0);
  float f0 = floor(f);
  float f1 = uLoop > 0.5 ? mod(f0 + 1.0, uFrames) : min(f0 + 1.0, uFrames - 1.0);
  float w = uStep > 0.5 ? 0.0 : f - f0;
  // A cell's last texel row and column never bleed into the next (mip levels): fade a thin border.
  vec2 uv = clamp(vUv, 0.004, 0.996);
  vec4 t0 = texture2D(uMap, vxCell(f0, uv), uBlur);
  vec4 t1 = texture2D(uMap, vxCell(f1, uv), uBlur);
  float border = smoothstep(0.0, 0.025, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  border *= 1.0 - uVignette * smoothstep(0.6, 0.98, length(vUv - 0.5) * 2.0);
  float soft = vxSoftGround(vWorld, vGround, uSoftM) * border * vAlpha;
  // From vAge.y of its life (0: never) it burns out: a threshold rising through its coverage eats it from the thin
  // parts in, and what is left darkens toward the soot (never a see-through fade).
  float burn = vAge.y > 0.0 ? clamp((vAge.x - vAge.y) / max(0.05, 1.0 - vAge.y), 0.0, 1.0) : 0.0;
  float n = vxNoise(vUv * 6.0 + vec2(vAge.z * 13.1, vAge.z * 7.3)) * 0.65 + vxNoise(vUv * 15.0 - vec2(vAge.z * 5.7, 0.0)) * 0.35;
  if (uMode < 0.5) {
    // RGBA, straight alpha: premultiply each frame, then crossfade (a straight crossfade fringes at the edges).
    vec3 pm = mix(t0.rgb * t0.a, t1.rgb * t1.a, w);
    float a = mix(t0.a, t1.a, w);
    if (uSharpen.y > 0.0) {
      // Between two frames each pixel's coverage switches from this frame to the next at its own moment (hold and
      // erode: the clip's noise through a logistic spreads the moments over the interval, eating the leaving parts from
      // their low-noise blobs in), in the frames' own colours. A crossfaded coverage, sharpened, faded every part leaving
      // the clip see-through in one burst near the end of each frame: a ghost and a step every ~7 frames once the lotus
      // was slowed (round-3 recheck, 03/11).
      vec3 col = a > 1e-4 ? pm / a : mix(t0.rgb, t1.rgb, w);
      float ws = smoothstep(-0.08, 0.08, w - mix(0.08, 0.92, 1.0 / (1.0 + exp(-8.0 * (n - 0.5)))));
      a = mix(t0.a, t1.a, ws);
      pm = col * a;
      // Sharpened coverage: a soft clip's thin haze is remapped through a threshold, broken by noise, so it stays
      // matter or goes (erosion), never a see-through veil over pale stone.
      // Its root's soft fade into the ground erodes the same way (a see-through band along the ground otherwise).
      float g = vxSoftGround(vWorld, vGround, uSoftM);
      float sa = smoothstep(uSharpen.x, uSharpen.y, a * g + (n - 0.5) * 0.12);
      pm *= a > 1e-4 ? sa / a : 0.0;
      a = sa;
      soft = border * vAlpha;
    }
    if (uGrade.w > 0.0 && a > 1e-4) {
      // Thin cores only: the clip's broad white-hot parts turn to gold matter (saturated on pale stone); only its
      // whitest, brightest heart stays white (and alone reaches the bloom).
      vec3 c = pm / a;
      float mxc = max(c.r, max(c.g, c.b));
      float wht = min(c.r, min(c.g, c.b)) / max(mxc, 1e-4);
      float heart = smoothstep(uGrade.w, 1.0, wht) * smoothstep(0.93, 1.0, mxc);
      c = mix(c, uGrade.rgb * mix(0.8, 1.0, mxc), smoothstep(0.1, 0.5, wht) * (1.0 - heart));
      pm = c * a;
    }
    if (vAge.w > 0.0) {
      // Eased in (or held part-shown) by erosion, thin parts first: its alpha keeps its matte, never see-through.
      float thrE = vAge.w * 1.05 - 0.03;
      float keepE = smoothstep(thrE, thrE + 0.05, a + (n - 0.5) * 0.2);
      pm *= keepE;
      a *= keepE;
    }
    if (burn > 0.0) {
      float thr = burn * 1.05 - 0.03;
      float keep = smoothstep(thr, thr + 0.04, a + (n - 0.5) * 0.18);
      vec3 rgb = a > 1e-4 ? pm / a : vec3(0.0);
      rgb = mix(rgb, uSoot, smoothstep(0.0, 0.8, burn) * 0.85);
      a *= keep;
      pm = rgb * a;
    }
    gl_FragColor = vec4(pm * vTint * soft, a * soft);
    return;
  }
  vec4 t = mix(t0, t1, w);
  float lum = max(t.r, max(t.g, t.b));
  if (uMode > 2.5) {
    // Heat field: the clip's light (perceptual) × the sprite's intensity, cooled toward the tail and as it burns out.
    // Its fades cool it (the heat falls through the bands and erodes) instead of making it see-through.
    float heat = pow(clamp(lum, 0.0, 1.0), 0.4545) * max(vTint.r, max(vTint.g, vTint.b)) * vAlpha;
    if (uTaper > 0.0) heat *= mix(1.0, smoothstep(0.0, 0.85, vUv.x), uTaper);
    heat *= 1.0 - 0.75 * burn;
    soft = vxSoftGround(vWorld, vGround, uSoftM) * border;
    float edge = 0.12 + (n - 0.5) * 0.1 + burn * 0.12;
    float a = smoothstep(edge, edge + 0.04, heat);
    if (a <= 0.002) discard;
    float b = smoothstep(0.3, 0.4, heat);
    float c = smoothstep(0.76, 0.9, heat);
    vec3 col = mix(uSoot, mix(uHeatDeep, uHeatAmber, smoothstep(0.35, 0.8, heat)), b);
    col = mix(col, uHeatCore * 2.2, c);
    a *= mix(0.85, 0.95, b) + 0.05 * c;
    gl_FragColor = vec4(col * a * soft, a * soft);
    return;
  }
  if (uMode > 1.5) {
    // Smoke: a density (its alpha, else its light), coloured here; lighter toward the top; eroded as it burns out.
    float d = t.a < 0.999 ? t.a : sqrt(lum);
    float a = smoothstep(0.05, 0.5, d + (n - 0.5) * 0.25) * smoothstep(burn * 1.1 - 0.14, burn * 1.1 + 0.1, n * 0.6 + d * 0.55);
    vec3 c = mix(vTint * 0.95, vTint * 1.4, smoothstep(0.25, 0.95, vUv.y));
    gl_FragColor = vec4(c * a * soft, a * soft);
    return;
  }
  // Fire on black, premultiplied: the light is added, the ground under it darkens by its luminance × occlude.
  vec3 rgb = t.rgb * vTint;
  float body = smoothstep(0.02, 0.45, lum);
  if (burn > 0.0) {
    float luma = dot(t.rgb, vec3(0.3, 0.59, 0.11));
    rgb *= mix(vec3(1.0), vec3(0.85, 0.3, 0.12), smoothstep(0.0, 0.3, burn));
    float left = smoothstep(burn * 0.45, burn * 0.45 + 0.12, luma + (n - 0.5) * 0.16) * (1.0 - smoothstep(0.2, 0.75, burn));
    rgb *= left;
    body *= left;
  }
  gl_FragColor = vec4(rgb * soft, body * vOcclude * soft);
}`;

function replaceOnce(src: string, anchor: string, text: string): string {
  const at = src.indexOf(anchor);
  if (at < 0 || src.indexOf(anchor, at + 1) >= 0) throw new Error("[flipbook] v2 shader anchor not found once: " + anchor.trim().slice(0, 48));
  return src.slice(0, at) + text + src.slice(at + anchor.length);
}

export const FB_COMPOSE_GLSL = /* glsl */ `
// FlipbookPool v2, mask A (R hull, G ink, B hot line, A survival order): its survival order recoloured through the
// stepped ramp (uRamp0 white-gold, uRamp1 orange, uRamp2 crimson, uSoot soot).
vec3 fbRamp(float r) {
  vec3 c = uSoot;
  c = mix(c, uRamp2, smoothstep(0.23, 0.27, r));
  c = mix(c, uRamp1, smoothstep(0.48, 0.52, r));
  return mix(c, uRamp0, smoothstep(0.73, 0.77, r));
}
// Ink under the body under the hot core in one fragment (INTEGRATION_PLAN §2.3), premultiplied; \`soft\` once at the end.
// ctl = iCtl: x reveal threshold T, y erosion threshold e, z band width, w ramp mix.
vec4 fbComposeMasked(vec4 t0, vec4 t1, vec4 m0, vec4 m1, float b0, float b1, float w, vec4 ctl, vec3 tint, float soft) {
  vec3 pm = mix(t0.rgb * t0.a, t1.rgb * t1.a, w);
  float aAt = mix(t0.a, t1.a, w);
  vec3 cAt = aAt > 1e-4 ? pm / aAt : mix(t0.rgb, t1.rgb, w);
  if (uSharpen.y > 0.0) aAt = smoothstep(uSharpen.x, uSharpen.y, aAt);
  if (uGrade.w > 0.0) {
    float mxc = max(cAt.r, max(cAt.g, cAt.b));
    float wht = min(cAt.r, min(cAt.g, cAt.b)) / max(mxc, 1e-4);
    float heart = smoothstep(uGrade.w, 1.0, wht) * smoothstep(0.93, 1.0, mxc);
    cAt = mix(cAt, uGrade.rgb * mix(0.8, 1.0, mxc), smoothstep(0.1, 0.5, wht) * (1.0 - heart));
  }
  vec4 m = mix(m0, m1, w);
  float rev = step(mix(b0, b1, w), ctl.x + 0.002);
  float e = ctl.y;
  float wd = max(ctl.z, 1e-4);
  float eh = e + uHotLead * ctl.w;
  float live = smoothstep(e, e + wd, m.a);
  float liveH = smoothstep(eh, eh + wd, m.a);
  float ai = m.g * uInk.a * rev * live;
  float ab = min(aAt, m.r) * rev * live;
  float ah = m.b * rev * liveH;
  float r = clamp((m.a - e) / max(1.0 - e, 1e-4), 0.0, 1.0);
  if (uRampCool > 0.0) r = min(r, mix(1.0, 0.40, uRampCool * smoothstep(0.2, 0.85, e)));
  vec3 ci = uInk.rgb;
  vec3 cb = min(mix(cAt, fbRamp(r), ctl.w) * tint, vec3(uBodyCap));
  vec3 ch = uHot.rgb * uHot.a * tint;
  float alpha = 1.0 - (1.0 - ai) * (1.0 - ab) * (1.0 - ah);
  vec3 rgb = ci * ai * (1.0 - ab) * (1.0 - ah) + cb * ab * (1.0 - ah) + ch * ah;
  return vec4(rgb * soft, alpha * soft);
}
`;

const PICK_V1 = `  // Frames blend in time (uStep: held cels); a loop wraps to its first frame.
  float f = uLoop > 0.5 ? mod(vFrame, uFrames) : clamp(vFrame, 0.0, uFrames - 1.0);
  float f0 = floor(f);
  float f1 = uLoop > 0.5 ? mod(f0 + 1.0, uFrames) : min(f0 + 1.0, uFrames - 1.0);
  float w = uStep > 0.5 ? 0.0 : f - f0;
`;

export const FB_PICK_GLSL = /* glsl */ `  // FlipbookPool v2: the frame pair inside the clip's segment [uRange.x, uRange.x + uRange.y - 1] (frames of its
  // variant; vVar: the variant's first cell). No loop mode crossfades the segment's last frame into its first.
  float fbVar = floor(vVar + 0.5);
  float fbN = max(uRange.y, 1.0);
  float fbLast = uRange.x + fbN - 1.0;
#if FB_LOOP == 0
  float f = clamp(vFrame, uRange.x, fbLast);
  float f0 = floor(f);
  float f1 = min(f0 + 1.0, fbLast);
  float w = uStep > 0.5 ? 0.0 : f - f0;
#else
  float f = uRange.x + mod(vFrame - uRange.x, fbN);
  float f0 = clamp(floor(f), uRange.x, fbLast);
#if FB_LOOP == 1
  float f1 = f0;
  float w = 0.0;
#else
  float f1 = f0 + 1.0 > fbLast ? uRange.x : f0 + 1.0;
  float w = uStep > 0.5 ? 0.0 : clamp(f - f0, 0.0, 1.0);
#endif
#endif
#if FB_LOOP == 2 || defined(FB_CTRL_A)
  // Hold and erode between two frames: each pixel switches from f0 to f1 at its own moment (its survival order in
  // mask A, else the clip's noise through a logistic), never a see-through crossfade. Always in "holderode"; with
  // mask A also when the pool sharpens (setSharpen).
#if FB_LOOP == 2
  bool fbSwitch = true;
#else
  bool fbSwitch = uSharpen.y > 0.0;
#endif
  if (fbSwitch && w > 0.0) {
#ifdef FB_CTRL_A
    float order = texture2D(uCtlA, vxCell(f0 + fbVar, clamp(vUv, uInsetA, 1.0 - uInsetA))).a;
#else
    float nO = vxNoise(vUv * 6.0 + vec2(vAge.z * 13.1, vAge.z * 7.3)) * 0.65 + vxNoise(vUv * 15.0 - vec2(vAge.z * 5.7, 0.0)) * 0.35;
    float order = 1.0 / (1.0 + exp(-8.0 * (nO - 0.5)));
#endif
    w = smoothstep(-0.08, 0.08, w - mix(0.08, 0.92, order));
  }
#endif
  f0 += fbVar;
  f1 += fbVar;
`;

export const FB_MASKED_GLSL = /* glsl */ `#ifdef FB_CTRL_A
    vec2 uvA = clamp(vUv, uInsetA, 1.0 - uInsetA);
    vec4 m0 = texture2D(uCtlA, vxCell(f0, uvA));
    vec4 m1 = texture2D(uCtlA, vxCell(f1, uvA));
#ifdef FB_CTRL_B
    vec2 uvB = clamp(vUv, uInsetB, 1.0 - uInsetB);
    float b0 = texture2D(uCtlB, vxCell(f0, uvB)).r;
    float b1 = texture2D(uCtlB, vxCell(f1, uvB)).r;
#else
    float b0 = 0.0;
    float b1 = 0.0;
#endif
    gl_FragColor = fbComposeMasked(t0, t1, m0, m1, b0, b1, w, vCtl, vTint, soft);
    return;
#endif
`;

const VERTEX_V2 = replaceOnce(replaceOnce(replaceOnce(VERTEX,
  "attribute vec2 iLift;\n", "attribute vec2 iLift;\nattribute vec4 iCtl;\nattribute float iVar;\n"),
  "varying vec4 vAge;\n", "varying vec4 vAge;\nvarying vec4 vCtl;\nvarying float vVar;\n"),
  "  vAge = iAge;\n", "  vAge = iAge;\n  vCtl = iCtl;\n  vVar = iVar;\n");

const FRAGMENT_V2 = replaceOnce(replaceOnce(replaceOnce(replaceOnce(replaceOnce(FRAGMENT,
  "uniform vec4 uGrade;\n", `uniform vec4 uGrade;
uniform vec2 uRange;
uniform sampler2D uCtlA;
uniform sampler2D uCtlB;
uniform vec2 uInsetA;
uniform vec2 uInsetB;
uniform vec4 uInk;
uniform float uBodyCap;
uniform vec4 uHot;
uniform float uHotLead;
uniform float uRampCool;
uniform vec3 uRamp0;
uniform vec3 uRamp1;
uniform vec3 uRamp2;
`),
  "varying vec4 vAge;\n", "varying vec4 vAge;\nvarying vec4 vCtl;\nvarying float vVar;\n"),
  "void main() {\n", FB_COMPOSE_GLSL + "void main() {\n"),
  PICK_V1, FB_PICK_GLSL),
  "  if (uMode < 0.5) {\n", "  if (uMode < 0.5) {\n" + FB_MASKED_GLSL);

export interface FlipOptions {
  /** Seconds it lives (default: one pass of the clip at `rate`; a loop: one second). ONE_FRAME: drawn this frame only. */
  life?: number;
  /** Playback speed × the clip's fps (default 1); 0 holds `frame`. */
  rate?: number;
  /**
   * A linger: from this frame on the clip plays at `slowRate` instead (the attack stays at `rate`, the peak and the
   * burn-down last longer; neighbouring frames crossfade, so it never steps). Undefined: one rate.
   */
  slowFrom?: number;
  slowRate?: number;
  /** First frame (fractional; a loop: any phase). */
  frame?: number;
  /** Last frame a one-shot plays to. */
  until?: number;
  rot?: number;
  spin?: number;
  /** Size multiplier reached at the end of its life (ease-out); 0: no growth. */
  grow?: number;
  alpha?: number;
  /** Colour × intensity the clip is multiplied by (keep an RGBA body ≤ ~0.9 so it survives tone mapping in its hue). */
  tint?: THREE.Color;
  intensity?: number;
  /** "fire" mode: how much the ground under it darkens by its luminance (0: purely additive). */
  occlude?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  drag?: number;
  /** Up is positive (smoke rises with a negative gravity). */
  gravity?: number;
  /** A world direction the sprite's +x follows on screen (null: free, turned by `rot`). */
  dir?: THREE.Vector3 | null;
  /** Ground height under it for the soft fade (undefined: none). */
  ground?: number;
  /** Seconds to come in (0: full on its first frame) and to go out at the end (an RGBA body: 0, and `cool` instead). */
  fadeIn?: number;
  fadeOut?: number;
  /** Seconds before it is drawn at all. */
  delay?: number;
  /** From this share of its life (0–1) it burns out by erosion toward the soot; 0: never. */
  cool?: number;
  /** Drawn this much nearer the eye (m, depth only). */
  lift?: number;
  /** With `dir`: the sprite's width is this many metres along `dir` as the camera sees it (foreshortened); 0: size × aspect. */
  span?: number;
  /**
   * "rgba": how much of it is eroded away (0 whole … 1 gone), thin parts first, through its life: a sprite eased in
   * (or held part-shown) keeps its matte instead of turning see-through (the alpha law; `alpha` fades it).
   */
  erode?: number;
  /**
   * A clip declaring controlA: reveal/erosion schedule (name or table), overriding timingProfile; ignored without
   * controlA. Its default life is (erodeEnd + 1) / 60 s in every pool, including pools without mask A (playLife always
   * matches spawn's life). Only an rgba pool attached with controls.a applies reveal/erosion, ignores cool and defaults
   * fadeOut to 0. Other pools retain the old cool, erode and fadeOut behavior.
   */
  timing?: FlipbookTimingName | FlipbookTiming;
  /** v2 variants: clamped index, starting at cell v × frames; omitted: round-robin, reset by clear. Old clips ignore it. */
  variant?: number;
}

const WHITE = new THREE.Color(1, 1, 1);
const EMPTY_OPTIONS: FlipOptions = {};

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const mix = (a: number, b: number, w: number): number => a * (1 - w) + b * w;
function smoothstep(lo: number, hi: number, x: number): number {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

export function flipbookTick(ageS: number): number {
  return Math.max(0, Math.floor(ageS * 60 + 1e-3));
}

export function revealThreshold(tick: number, revealTicks = 4): number {
  return clamp((tick + 1) / revealTicks, 0, 1);
}

export function erodeThreshold(tick: number, t: FlipbookTiming): number {
  if (tick <= t.holdEnd) return -t.width;
  if (tick <= t.tearEnd) {
    const x = (tick - t.holdEnd) / (t.tearEnd - t.holdEnd);
    return -t.width + (t.tearE + t.width) * (1 - (1 - x) ** 2);
  }
  if (tick < t.erodeEnd) return t.tearE + (1 - t.tearE) * (tick - t.tearEnd) / (t.erodeEnd - t.tearEnd);
  return 1;
}

export function rampMixAt(tick: number, t: FlipbookTiming): number {
  return clamp((tick - t.holdEnd) / t.rampTicks, 0, 1);
}

/** Only manifest controlA enables a schedule; pool mask availability does not change its default life. */
export function flipbookTimingOf(meta: FlipbookMeta, o: FlipOptions): FlipbookTiming | null {
  if (meta.controlA === undefined) return null;
  const t = o.timing ?? meta.timingProfile;
  if (typeof t === "string") return Object.prototype.hasOwnProperty.call(FLIPBOOK_TIMING, t) ? FLIPBOOK_TIMING[t] : null;
  return t ?? null;
}

export function flipbookControl(age: number, life: number, cool: number, erode: number, timing: FlipbookTiming | null, out: { [i: number]: number }, at = 0): void {
  let T = 1, wd = FLIPBOOK_ERODE_WIDTH, e = -wd, mix = 0;
  if (timing !== null) {
    const tick = flipbookTick(age);
    T = revealThreshold(tick, timing.revealTicks); wd = timing.width; e = erodeThreshold(tick, timing); mix = rampMixAt(tick, timing);
  } else if (cool > 0) {
    // The old cool fraction now erodes through mask A's survival order.
    const burn = Math.min(1, Math.max(0, (age / life - cool) / Math.max(0.05, 1 - cool)));
    e = -wd + burn * (1 + wd); mix = Math.min(1, burn * 4);
  }
  // The old erode amount still removes the thin parts first, now the low A.a values.
  if (erode > 0) e = Math.max(e, -wd + erode * (1 + wd));
  out[at] = T; out[at + 1] = e; out[at + 2] = wd; out[at + 3] = mix;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Frame pair before per-pixel switching and the variant cell offset; matches FB_PICK_GLSL. */
export function flipbookFramePair(vFrame: number, lo: number, count: number, loop: FlipbookLoopMode, step: boolean, out: { f0: number; f1: number; w: number }): void {
  const n = Math.max(count, 1);
  const last = lo + n - 1;
  if (loop === "none") {
    const f = clamp(vFrame, lo, last);
    out.f0 = Math.floor(f);
    out.f1 = Math.min(out.f0 + 1, last);
    out.w = step ? 0 : f - out.f0;
  } else {
    const x = vFrame - lo;
    const f = lo + (x - n * Math.floor(x / n));
    out.f0 = clamp(Math.floor(f), lo, last);
    if (loop === "stepped") {
      out.f1 = out.f0;
      out.w = 0;
    } else {
      out.f1 = out.f0 + 1 > last ? lo : out.f0 + 1;
      out.w = step ? 0 : clamp(f - out.f0, 0, 1);
    }
  }
}

export function flipbookSwitch(w: number, order: number): number {
  return w > 0 ? smoothstep(-0.08, 0.08, w - mix(0.08, 0.92, order)) : w;
}

/** Ink, body, then hot core, returned premultiplied. */
export function composeLayers(ai: number, ab: number, ah: number, ci: FlipbookVec3, cb: FlipbookVec3, ch: FlipbookVec3, out: { [i: number]: number }): void {
  const alpha = 1 - (1 - ai) * (1 - ab) * (1 - ah);
  for (let k = 0; k < 3; k += 1) out[k] = ci[k]! * ai * (1 - ab) * (1 - ah) + cb[k]! * ab * (1 - ah) + ch[k]! * ah;
  out[3] = alpha;
}

export interface FlipbookMaskedSample {
  /** Atlas samples as read by the shader: linear RGB, straight alpha. */
  readonly t0: FlipbookVec4;
  readonly t1: FlipbookVec4;
  readonly m0: FlipbookVec4;
  readonly m1: FlipbookVec4;
  readonly b0: number;
  readonly b1: number;
  readonly w: number;
  readonly ctl: FlipbookVec4;
  readonly tint: FlipbookVec3;
  readonly soft: number;
}

/** CPU counterpart of fbComposeMasked; atlas RGB must already be decoded from sRGB. */
export function composeFlipbookMasked(s: FlipbookMaskedSample, look: FlipbookMaskedLook, out: { [i: number]: number }): void {
  const { t0, t1, m0, m1, w, ctl, tint, soft } = s;
  const pmR = mix(t0[0] * t0[3], t1[0] * t1[3], w);
  const pmG = mix(t0[1] * t0[3], t1[1] * t1[3], w);
  const pmB = mix(t0[2] * t0[3], t1[2] * t1[3], w);
  let aAt = mix(t0[3], t1[3], w);
  let cR = aAt > 1e-4 ? pmR / aAt : mix(t0[0], t1[0], w);
  let cG = aAt > 1e-4 ? pmG / aAt : mix(t0[1], t1[1], w);
  let cB = aAt > 1e-4 ? pmB / aAt : mix(t0[2], t1[2], w);
  if (look.sharpen[1] > 0) aAt = smoothstep(look.sharpen[0], look.sharpen[1], aAt);
  if (look.grade[3] > 0) {
    const mxc = Math.max(cR, Math.max(cG, cB));
    const wht = Math.min(cR, Math.min(cG, cB)) / Math.max(mxc, 1e-4);
    const heart = smoothstep(look.grade[3], 1, wht) * smoothstep(0.93, 1, mxc);
    const gain = mix(0.8, 1, mxc);
    const gradeW = smoothstep(0.1, 0.5, wht) * (1 - heart);
    cR = mix(cR, look.grade[0] * gain, gradeW);
    cG = mix(cG, look.grade[1] * gain, gradeW);
    cB = mix(cB, look.grade[2] * gain, gradeW);
  }
  const mr = mix(m0[0], m1[0], w);
  const mg = mix(m0[1], m1[1], w);
  const mb = mix(m0[2], m1[2], w);
  const ma = mix(m0[3], m1[3], w);
  const rev = ctl[0] + 0.002 < mix(s.b0, s.b1, w) ? 0 : 1;
  const e = ctl[1];
  const wd = Math.max(ctl[2], 1e-4);
  const eh = e + look.hotLead * ctl[3];
  const live = smoothstep(e, e + wd, ma);
  const liveH = smoothstep(eh, eh + wd, ma);
  const ai = mg * look.ink[3] * rev * live;
  const ab = Math.min(aAt, mr) * rev * live;
  const ah = mb * rev * liveH;
  let r = clamp((ma - e) / Math.max(1 - e, 1e-4), 0, 1);
  if (look.rampCool > 0) r = Math.min(r, mix(1, 0.4, look.rampCool * smoothstep(0.2, 0.85, e)));
  const alpha = 1 - (1 - ai) * (1 - ab) * (1 - ah);
  for (let k = 0; k < 3; k += 1) {
    let ramp = look.soot[k]!;
    ramp = mix(ramp, look.ramp[2][k]!, smoothstep(0.23, 0.27, r));
    ramp = mix(ramp, look.ramp[1][k]!, smoothstep(0.48, 0.52, r));
    ramp = mix(ramp, look.ramp[0][k]!, smoothstep(0.73, 0.77, r));
    const ci = look.ink[k]!;
    const cAt = k === 0 ? cR : k === 1 ? cG : cB;
    const cb = Math.min(mix(cAt, ramp, ctl[3]) * tint[k]!, look.bodyCap);
    const ch = look.hot[k]! * look.hot[3] * tint[k]!;
    const rgb = ci * ai * (1 - ab) * (1 - ah) + cb * ab * (1 - ah) + ch * ah;
    out[k] = rgb * soft;
  }
  out[3] = alpha * soft;
}

export function blendPremultiplied(src: FlipbookVec4, dst: FlipbookVec3, out: { [i: number]: number }): void {
  for (let k = 0; k < 3; k += 1) out[k] = src[k]! + dst[k]! * (1 - src[3]);
}

/** Exclusive end inside one variant. Old metadata: frames. */
function frameEnd(meta: FlipbookMeta): number {
  return meta.frameRange !== undefined ? meta.frameRange[1] + 1 : meta.frames;
}

function firstOf(meta: FlipbookMeta, o: FlipOptions): number {
  if (o.frame !== undefined) return o.frame;
  const lo = meta.frameRange?.[0] ?? 0;
  if (meta.loop) return lo;
  return Math.min(frameEnd(meta) - 1, Math.max(lo, meta.start));
}

/** `life` for a sprite drawn on this frame only (a head or a core the caller redraws every frame). */
export const ONE_FRAME = 1e-4;

/** The frame shown at `age` s: `first` + `fps` a second, then from `slowFrom` (≥ 0) on at `slowFps`. */
export function frameAt(first: number, fps: number, slowFrom: number, slowFps: number, age: number): number {
  const f = first + age * fps;
  if (slowFrom < 0 || f <= slowFrom || fps <= 0) return f;
  return slowFrom + (age - (slowFrom - first) / fps) * slowFps;
}

/** The frame a one-shot's linger starts at (FlipOptions.slowFrom inside its frames), or −1 for none. */
function slowFromOf(meta: FlipbookMeta, o: FlipOptions): number {
  const first = firstOf(meta, o);
  const last = Math.min(frameEnd(meta), o.until !== undefined ? o.until + 1 : frameEnd(meta));
  return o.slowFrom !== undefined && o.slowRate !== undefined && o.slowFrom > first && o.slowFrom < last ? o.slowFrom : -1;
}

/**
 * Seconds a sprite spawned with `o` lives: its life, else a controlA schedule's (erodeEnd + 1) / 60 in every pool,
 * even without an attached mask A; otherwise one pass at its rate (and its linger's). Reveal/erosion needs a masked pool.
 */
export function playLife(meta: FlipbookMeta, o: FlipOptions): number {
  if (o.life !== undefined) return o.life;
  const timing = flipbookTimingOf(meta, o);
  if (timing !== null) return (timing.erodeEnd + 1) / 60;
  const rate = o.rate ?? 1;
  if (meta.loop || rate <= 0) return 1;
  const first = firstOf(meta, o);
  const last = Math.min(frameEnd(meta), o.until !== undefined ? o.until + 1 : frameEnd(meta));
  const fps = Math.max(1e-3, meta.fps * rate);
  const slow = slowFromOf(meta, o);
  if (slow < 0) return Math.max(1 / 60, (last - first) / fps);
  return Math.max(1 / 60, (slow - first) / fps + (last - slow) / (meta.fps * Math.max(0.01, o.slowRate!)));
}

/** Fragment shader modes (uMode). */
const MODE_INDEX: Record<FlipbookMode, number> = { rgba: 0, fire: 1, smoke: 2, heat: 3 };

/**
 * One clip's sprites in one draw call (hidden while empty). Built at load with a blank texture and its mode, so its
 * blend state is final; `attach` gives it the atlas when it arrives (it draws nothing before).
 */
export class FlipbookPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  meta: FlipbookMeta | null = null;
  private readonly iPos: Float32Array;
  private readonly iData: Float32Array;
  private readonly iColor: Float32Array;
  private readonly iDir: Float32Array;
  private readonly iAge: Float32Array;
  private readonly iLift: Float32Array;
  private readonly iCtl: Float32Array;
  private readonly iVar: Float32Array;
  private readonly ctlAttribute: THREE.InstancedBufferAttribute;
  private readonly varAttribute: THREE.InstancedBufferAttribute;
  private readonly varCell: Float32Array;
  private readonly timings: (FlipbookTiming | null)[];
  private v2Key: string | null = null;
  private masked = false;
  private variantTurn = 0;
  /** x y z, vx vy vz, size, grow, rot, spin, age, life, frame, fps, alpha, drag, gravity, fadeIn, fadeOut, ground, occlude, r g b, dx dy dz, delay, cool, seed, lift, span, erode, slowFrom, slowFps */
  private readonly state: Float32Array;
  private static readonly STRIDE = 35;
  private cursor = 0;
  live = 0;
  /** Sprites dropped since the last clear because every slot held a live one. */
  dropped = 0;

  constructor(
    readonly id: string,
    readonly mode: FlipbookMode,
    readonly capacity: number,
    renderOrder: number,
    private readonly blank: THREE.Texture,
  ) {
    this.iPos = new Float32Array(capacity * 3);
    this.iData = new Float32Array(capacity * 4);
    this.iColor = new Float32Array(capacity * 4);
    this.iDir = new Float32Array(capacity * 4);
    this.iAge = new Float32Array(capacity * 4);
    this.iLift = new Float32Array(capacity * 2);
    this.iCtl = new Float32Array(capacity * 4);
    this.iVar = new Float32Array(capacity);
    this.ctlAttribute = new THREE.InstancedBufferAttribute(this.iCtl, 4).setUsage(THREE.DynamicDrawUsage);
    this.varAttribute = new THREE.InstancedBufferAttribute(this.iVar, 1).setUsage(THREE.DynamicDrawUsage);
    this.varCell = new Float32Array(capacity);
    this.timings = new Array<FlipbookTiming | null>(capacity).fill(null);
    this.state = new Float32Array(capacity * FlipbookPool.STRIDE);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.iData, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.iColor, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iDir", new THREE.InstancedBufferAttribute(this.iDir, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iAge", new THREE.InstancedBufferAttribute(this.iAge, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iLift", new THREE.InstancedBufferAttribute(this.iLift, 2).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: blank },
        uGrid: { value: new THREE.Vector2(1, 1) },
        uFrames: { value: 1 },
        uLoop: { value: 0 },
        uMode: { value: MODE_INDEX[mode] },
        uStep: { value: 0 },
        uSoftM: { value: 0.8 },
        uVignette: { value: 0 },
        uSoot: { value: new THREE.Vector3(...FLIPBOOK_MASKED_LOOK.soot) },
        // The heat ramp (mode "heat"): Gemini's vermilion #D93800, amber #FFB703 and white-gold #FFFDF0 (linear).
        uHeatDeep: { value: new THREE.Vector3(0.693, 0.04, 0) },
        uHeatAmber: { value: new THREE.Vector3(1, 0.473, 0.001) },
        uHeatCore: { value: new THREE.Vector3(1, 0.982, 0.871) },
        uTaper: { value: 0 },
        uBlur: { value: 0 },
        uSharpen: { value: new THREE.Vector2(...FLIPBOOK_MASKED_LOOK.sharpen) },
        uGrade: { value: new THREE.Vector4(...FLIPBOOK_MASKED_LOOK.grade) },
        uPivot: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uHeading: { value: 0 },
        uRange: { value: new THREE.Vector2(0, 1) },
        uCtlA: { value: blank },
        uCtlB: { value: blank },
        uInsetA: { value: new THREE.Vector2(0.004, 0.004) },
        uInsetB: { value: new THREE.Vector2(0.004, 0.004) },
        uInk: { value: new THREE.Vector4(...FLIPBOOK_MASKED_LOOK.ink) },
        uBodyCap: { value: FLIPBOOK_MASKED_LOOK.bodyCap },
        uHot: { value: new THREE.Vector4(...FLIPBOOK_MASKED_LOOK.hot) },
        uHotLead: { value: FLIPBOOK_MASKED_LOOK.hotLead },
        uRampCool: { value: FLIPBOOK_MASKED_LOOK.rampCool },
        uRamp0: { value: new THREE.Vector3(...FLIPBOOK_MASKED_LOOK.ramp[0]) },
        uRamp1: { value: new THREE.Vector3(...FLIPBOOK_MASKED_LOOK.ramp[1]) },
        uRamp2: { value: new THREE.Vector3(...FLIPBOOK_MASKED_LOOK.ramp[2]) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      // Premultiplied in every mode: "fire" adds its light and darkens the ground by its alpha; "rgba" and "smoke"
      // cover what is under them by their alpha.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "flipbook-" + id;
  }

  get ready(): boolean {
    return this.meta !== null;
  }

  /** Gives the pool its atlas (FlipbookLibrary.watch). */
  attach(meta: FlipbookMeta, texture: THREE.Texture, controls: FlipbookControls | null = null): void {
    this.meta = meta;
    const u = this.mesh.material.uniforms;
    u.uMap!.value = texture;
    (u.uGrid!.value as THREE.Vector2).set(meta.cols, meta.rows);
    u.uFrames!.value = meta.frames;
    u.uLoop!.value = meta.loop ? 1 : 0;
    (u.uPivot!.value as THREE.Vector2).set(meta.pivot[0], 1 - meta.pivot[1]);
    u.uAspect!.value = meta.aspect;
    u.uHeading!.value = meta.heading;
    const material = this.mesh.material;
    const geometry = this.mesh.geometry;
    if (!isFlipbookV2(meta)) {
      if (this.v2Key !== null) {
        material.vertexShader = VERTEX;
        material.fragmentShader = FRAGMENT;
        material.defines = {};
        geometry.deleteAttribute("iCtl");
        geometry.deleteAttribute("iVar");
        u.uCtlA!.value = u.uCtlB!.value = this.blank;
        this.masked = false;
        this.v2Key = null;
        material.needsUpdate = true;
      }
      return;
    }
    const loop = flipbookLoopMode(meta);
    this.masked = this.mode === "rgba" && controls?.a !== undefined;
    const reveal = this.masked && controls?.b !== undefined;
    const [lo, hi] = meta.frameRange ?? [0, meta.frames - 1];
    (u.uRange!.value as THREE.Vector2).set(lo, hi - lo + 1);
    u.uCtlA!.value = this.masked ? controls!.a : this.blank;
    u.uCtlB!.value = reveal ? controls!.b : this.blank;
    maskInset(u.uInsetA!.value as THREE.Vector2, controls?.a, meta);
    maskInset(u.uInsetB!.value as THREE.Vector2, controls?.b, meta);
    const key = loop + "|" + this.masked + "|" + reveal;
    if (key !== this.v2Key) {
      material.vertexShader = VERTEX_V2;
      material.fragmentShader = FRAGMENT_V2;
      material.defines = { FB_LOOP: loop === "none" ? 0 : loop === "stepped" ? 1 : 2 };
      if (this.masked) material.defines.FB_CTRL_A = 1;
      if (reveal) material.defines.FB_CTRL_B = 1;
      if (!geometry.hasAttribute("iCtl")) geometry.setAttribute("iCtl", this.ctlAttribute);
      if (!geometry.hasAttribute("iVar")) geometry.setAttribute("iVar", this.varAttribute);
      material.needsUpdate = true;
      this.v2Key = key;
    }
  }

  setInk(r: number, g: number, b: number, alpha: number): void {
    (this.mesh.material.uniforms.uInk!.value as THREE.Vector4).set(r, g, b, alpha);
  }

  setHot(r: number, g: number, b: number, gain: number): void {
    (this.mesh.material.uniforms.uHot!.value as THREE.Vector4).set(r, g, b, gain);
  }

  setRamp(hot: readonly number[], mid: readonly number[], low: readonly number[]): void {
    const u = this.mesh.material.uniforms;
    (u.uRamp0!.value as THREE.Vector3).set(hot[0]!, hot[1]!, hot[2]!);
    (u.uRamp1!.value as THREE.Vector3).set(mid[0]!, mid[1]!, mid[2]!);
    (u.uRamp2!.value as THREE.Vector3).set(low[0]!, low[1]!, low[2]!);
  }

  set bodyCap(v: number) {
    this.mesh.material.uniforms.uBodyCap!.value = v;
  }

  set hotLead(v: number) {
    this.mesh.material.uniforms.uHotLead!.value = v;
  }

  /** Masked v2 strength 0–1: r = min(r, mix(1, 0.4, rampCool * smoothstep(0.2, 0.85, e))); default 0. */
  set rampCool(v: number) {
    this.mesh.material.uniforms.uRampCool!.value = v;
  }

  /** Soft fade distance against the ground (m). */
  set softM(value: number) {
    this.mesh.material.uniforms.uSoftM!.value = value;
  }

  /** Rounds off the cell's corners (0 off … 1): a burst whose smoke reaches the cell's edge would show the square. */
  set vignette(value: number) {
    this.mesh.material.uniforms.uVignette!.value = value;
  }

  /** Held cel frames (no crossfade): drawn cels ghost when two frames blend. */
  set stepped(on: boolean) {
    this.mesh.material.uniforms.uStep!.value = on ? 1 : 0;
  }

  /** What a burning-out RGBA sprite darkens toward (linear); in mode "heat", its cooling edge. */
  setSoot(r: number, g: number, b: number): void {
    (this.mesh.material.uniforms.uSoot!.value as THREE.Vector3).set(r, g, b);
  }

  /** Mode "heat": the body's deep and amber ends and the core (linear; the core is drawn × 2.2). */
  setHeatRamp(deep: readonly number[], amber: readonly number[], core: readonly number[]): void {
    const u = this.mesh.material.uniforms;
    (u.uHeatDeep!.value as THREE.Vector3).set(deep[0]!, deep[1]!, deep[2]!);
    (u.uHeatAmber!.value as THREE.Vector3).set(amber[0]!, amber[1]!, amber[2]!);
    (u.uHeatCore!.value as THREE.Vector3).set(core[0]!, core[1]!, core[2]!);
  }

  /**
   * A mip bias on the atlas (0: sharp): a heat-field band read soft, so a lava-like clip's dark cells close into a
   * flame body instead of a crust.
   */
  set blur(value: number) {
    this.mesh.material.uniforms.uBlur!.value = value;
  }

  /**
   * Mode "rgba": its coverage remapped through [lo, hi] (0, 0: off): a crossfade of a slowed clip (and a soft clip's
   * haze) stays solid matter or erodes instead of showing the ground through it.
   */
  setSharpen(lo: number, hi: number): void {
    (this.mesh.material.uniforms.uSharpen!.value as THREE.Vector2).set(lo, hi);
  }

  /**
   * Mode "rgba": the clip's broad white-hot parts drawn in `gold` (linear, ≤ 0.9 a channel) and only its whitest
   * heart (whiteness, min ÷ max channel, over `heart`) kept white; null: the clip's own colours.
   */
  setGrade(gold: readonly number[] | null, heart = 0.9): void {
    const g = this.mesh.material.uniforms.uGrade!.value as THREE.Vector4;
    if (gold === null) g.set(0, 0, 0, 0);
    else g.set(gold[0]!, gold[1]!, gold[2]!, Math.min(0.999, Math.max(0.01, heart)));
  }

  /** Mode "heat": 0 the clip as it is … 1 it cools from its head (cell right) to soot at its tail (a trail). */
  set taper(value: number) {
    this.mesh.material.uniforms.uTaper!.value = value;
  }

  /** Seconds one pass of the clip lasts at `rate`. */
  clipS(rate = 1): number {
    if (this.meta !== null && isFlipbookV2(this.meta)) return (frameEnd(this.meta) - firstOf(this.meta, EMPTY_OPTIONS)) / (this.meta.fps * Math.max(0.05, rate));
    return this.meta === null ? 0.5 : (this.meta.frames - this.meta.start) / (this.meta.fps * Math.max(0.05, rate));
  }

  /**
   * One sprite at `at`, `size` m tall (its width by the cell's aspect), in a free slot. Draws nothing until an atlas is
   * attached. A live sprite is never cut short (a flame lotus vanishing in one frame is a pop): when every slot holds a
   * live one, the new sprite is dropped (counted in `dropped`; size the pool so it stays 0).
   */
  spawn(at: THREE.Vector3, size: number, options: FlipOptions = {}): void {
    const meta = this.meta;
    if (meta === null) return;
    const S = FlipbookPool.STRIDE;
    let i = -1;
    for (let k = 0, j = this.cursor; k < this.capacity; k += 1) {
      const life = this.state[j * S + 11]!;
      if (life <= 0 || this.state[j * S + 10]! >= life) {
        i = j;
        break;
      }
      j = (j + 1) % this.capacity;
    }
    if (i < 0) {
      this.dropped += 1;
      return;
    }
    this.cursor = (i + 1) % this.capacity;
    const rate = options.rate ?? 1;
    const fps = meta.fps * rate;
    const first = firstOf(meta, options);
    const slowFrom = slowFromOf(meta, options);
    const slowFps = slowFrom >= 0 ? meta.fps * Math.max(0.01, options.slowRate!) : 0;
    const timing = this.masked ? flipbookTimingOf(meta, options) : null;
    const life = playLife(meta, options);
    const vars = this.v2Key !== null ? meta.variants ?? 1 : 1;
    let v = 0;
    if (vars > 1) {
      if (options.variant !== undefined && Number.isFinite(options.variant)) v = Math.min(vars - 1, Math.max(0, Math.floor(options.variant)));
      else {
        v = this.variantTurn % vars;
        this.variantTurn += 1;
      }
    }
    this.timings[i] = timing;
    this.varCell[i] = v * meta.frames;
    const tint = options.tint ?? WHITE;
    const k = options.intensity ?? 1;
    const dir = options.dir ?? null;
    const st = this.state;
    const o = i * FlipbookPool.STRIDE;
    st[o] = at.x;
    st[o + 1] = at.y;
    st[o + 2] = at.z;
    st[o + 3] = options.vx ?? 0;
    st[o + 4] = options.vy ?? 0;
    st[o + 5] = options.vz ?? 0;
    st[o + 6] = size;
    st[o + 7] = options.grow ?? 0;
    st[o + 8] = options.rot ?? 0;
    st[o + 9] = options.spin ?? 0;
    st[o + 10] = 0;
    st[o + 11] = Math.max(1e-4, life);
    st[o + 12] = first;
    st[o + 13] = fps;
    st[o + 14] = options.alpha ?? 1;
    st[o + 15] = options.drag ?? 0;
    st[o + 16] = options.gravity ?? 0;
    st[o + 17] = options.fadeIn ?? 0;
    st[o + 18] = options.fadeOut ?? (timing !== null || (this.mode === "rgba" && (options.cool ?? 0) > 0) ? 0 : Math.min(0.12, life * 0.3));
    st[o + 19] = options.ground ?? -1e5;
    st[o + 20] = options.occlude ?? 0.5;
    st[o + 21] = tint.r * k;
    st[o + 22] = tint.g * k;
    st[o + 23] = tint.b * k;
    st[o + 24] = dir?.x ?? 0;
    st[o + 25] = dir?.y ?? 0;
    st[o + 26] = dir?.z ?? 0;
    st[o + 27] = Math.max(0, options.delay ?? 0);
    st[o + 28] = options.cool ?? 0;
    st[o + 29] = (i * 0.618034) % 1;
    st[o + 30] = options.lift ?? 0;
    st[o + 31] = options.span ?? 0;
    st[o + 32] = Math.min(1, Math.max(0, options.erode ?? 0));
    st[o + 33] = slowFrom;
    st[o + 34] = slowFps;
  }

  /** Draws each sprite at its age (frame 0 at age 0, full alpha unless it fades in), then ages it by `dt`. */
  update(dt: number): void {
    let n = 0;
    const S = FlipbookPool.STRIDE;
    const st = this.state;
    for (let i = 0; i < this.capacity; i += 1) {
      const o = i * S;
      const life = st[o + 11]!;
      const age = st[o + 10]!;
      if (life <= 0 || age >= life) {
        st[o + 11] = 0;
        continue;
      }
      if (st[o + 27]! > 0) {
        st[o + 27] = st[o + 27]! - dt;
        if (st[o + 27]! > 1e-6) continue;
        st[o + 27] = 0;
      }
      const k = age / life;
      const fadeIn = st[o + 17]! > 0 ? Math.min(1, (age + 1 / 60) / st[o + 17]!) : 1;
      const fadeOut = st[o + 18]! > 0 ? Math.min(1, (life - age) / st[o + 18]!) : 1;
      const grow = 1 + st[o + 7]! * (1 - (1 - k) * (1 - k));
      this.iPos[n * 3] = st[o]!;
      this.iPos[n * 3 + 1] = st[o + 1]!;
      this.iPos[n * 3 + 2] = st[o + 2]!;
      this.iData[n * 4] = st[o + 6]! * grow;
      this.iData[n * 4 + 1] = st[o + 8]!;
      this.iData[n * 4 + 2] = frameAt(st[o + 12]!, st[o + 13]!, st[o + 33]!, st[o + 34]!, age);
      this.iData[n * 4 + 3] = st[o + 14]! * fadeIn * fadeOut;
      this.iColor[n * 4] = st[o + 21]!;
      this.iColor[n * 4 + 1] = st[o + 22]!;
      this.iColor[n * 4 + 2] = st[o + 23]!;
      this.iColor[n * 4 + 3] = st[o + 19]!;
      this.iDir[n * 4] = st[o + 24]!;
      this.iDir[n * 4 + 1] = st[o + 25]!;
      this.iDir[n * 4 + 2] = st[o + 26]!;
      this.iDir[n * 4 + 3] = st[o + 20]!;
      this.iAge[n * 4] = k;
      this.iAge[n * 4 + 1] = st[o + 28]!;
      this.iAge[n * 4 + 2] = st[o + 29]!;
      this.iAge[n * 4 + 3] = st[o + 32]!;
      this.iLift[n * 2] = st[o + 30]!;
      this.iLift[n * 2 + 1] = st[o + 31]!;
      if (this.v2Key !== null) {
        flipbookControl(age, life, st[o + 28]!, st[o + 32]!, this.timings[i]!, this.iCtl, n * 4);
        this.iVar[n] = this.varCell[i]!;
      }
      n += 1;
      const keep = Math.exp(-st[o + 15]! * dt);
      st[o + 3] = st[o + 3]! * keep;
      st[o + 4] = st[o + 4]! * keep + st[o + 16]! * dt;
      st[o + 5] = st[o + 5]! * keep;
      st[o] = st[o]! + st[o + 3]! * dt;
      st[o + 1] = st[o + 1]! + st[o + 4]! * dt;
      st[o + 2] = st[o + 2]! + st[o + 5]! * dt;
      st[o + 8] = st[o + 8]! + st[o + 9]! * dt;
      st[o + 10] = age + dt;
    }
    this.live = n;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const name of ATTRS) geometry.getAttribute(name).needsUpdate = true;
    if (this.v2Key !== null) {
      this.ctlAttribute.needsUpdate = true;
      this.varAttribute.needsUpdate = true;
    }
  }

  clear(): void {
    this.variantTurn = 0;
    for (let i = 0; i < this.capacity; i += 1) this.state[i * FlipbookPool.STRIDE + 11] = 0;
    this.live = 0;
    this.dropped = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const ATTRS = ["iPos", "iData", "iColor", "iDir", "iAge", "iLift"] as const;

function maskInset(out: THREE.Vector2, texture: THREE.Texture | undefined, meta: FlipbookMeta): void {
  const image: unknown = texture?.image;
  if (record(image) && typeof image.width === "number" && typeof image.height === "number" && image.width > 0 && image.height > 0) {
    out.set(Math.max(0.004, 0.5 * meta.cols / image.width), Math.max(0.004, 0.5 * meta.rows / image.height));
  } else out.set(0.004, 0.004);
}

export interface FlipbookPoolOptions {
  /** Draw mode (default: the manifest's, else "rgba"). */
  readonly mode?: FlipbookMode;
  readonly capacity?: number;
  readonly renderOrder?: number;
}

/**
 * Every clip pool of a scene: made at load (a kit's attach), attached as each element folder's atlases arrive,
 * updated once a frame, hidden while empty (no draw cost unless a clip plays).
 */
export class FlipbookPlayer {
  readonly group = new THREE.Group();
  private readonly libraries = new Map<string, FlipbookLibrary>();
  private readonly pools = new Map<string, FlipbookPool>();
  private readonly unwatch: (() => void)[] = [];
  private readonly blank: THREE.Texture;

  /** `base`: the folder holding one subfolder per element (the lab's /art-src/lab/vfx/). */
  constructor(readonly base: string) {
    const data = new Uint8Array([0, 0, 0, 0]);
    this.blank = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    this.blank.needsUpdate = true;
    this.group.name = "fx-flipbooks";
  }

  /** The library of an element folder (loaded on first use). */
  library(folder: string): FlipbookLibrary {
    let lib = this.libraries.get(folder);
    if (lib === undefined) {
      lib = new FlipbookLibrary(this.base + folder + "/");
      this.libraries.set(folder, lib);
      this.unwatch.push(
        lib.watch((id) => {
          const entry = lib!.get(id);
          const pool = this.pools.get(folder + "/" + id);
          if (entry !== null && pool !== undefined) pool.attach(entry.meta, entry.texture, entry.controls);
        }),
      );
      void lib.load();
    }
    return lib;
  }

  /** The pool of clip `id` in `folder` (made now, attached when its atlas arrives). Load time only. */
  pool(folder: string, id: string, opts: FlipbookPoolOptions = {}): FlipbookPool {
    const key = folder + "/" + id;
    let pool = this.pools.get(key);
    if (pool !== undefined) return pool;
    const lib = this.library(folder);
    const entry = lib.get(id);
    pool = new FlipbookPool(id, opts.mode ?? entry?.meta.mode ?? "rgba", opts.capacity ?? 24, opts.renderOrder ?? 12, this.blank);
    if (entry !== null) pool.attach(entry.meta, entry.texture, entry.controls);
    this.pools.set(key, pool);
    this.group.add(pool.mesh);
    return pool;
  }

  /** Clip ids loaded in `folder` so far. */
  loaded(folder: string): string[] {
    return this.libraries.get(folder)?.ids() ?? [];
  }

  /** Waits for a folder's manifest and atlases. */
  ready(folder: string): Promise<void> {
    return this.library(folder).load();
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) pool.update(dt);
  }

  clear(): void {
    for (const pool of this.pools.values()) pool.clear();
  }

  /** Live sprites (stats). */
  get live(): number {
    let n = 0;
    for (const pool of this.pools.values()) n += pool.live;
    return n;
  }

  dispose(): void {
    for (const stop of this.unwatch) stop();
    for (const pool of this.pools.values()) pool.dispose();
    this.blank.dispose();
    this.group.removeFromParent();
  }
}
