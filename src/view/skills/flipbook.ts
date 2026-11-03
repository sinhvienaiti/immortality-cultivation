// Source: games/dragon-hold/src/view/flipbook.ts @62f2f8c (adapted: id-agnostic clips per element folder and a lenient manifest; modes "fire" (its premultiplied fire-on-black blend with ground occlusion, kept), "smoke" (density) and a new "rgba" (straight-alpha clips with real alpha, crossfaded premultiplied, eroded instead of faded); its test A/B/C modes, the mask output and the burn-lift dropped; vxNoise/vxSoftGround copied from its vfx-layers.ts @c2a6f9b)
/**
 * Flipbook sprites for the element layer (canon D59, ELEMENT_LAYER §3 "FlipbookPlayer"): Fire, Thunder and Wind
 * clips, and RGBA clips with real alpha of every element, cut from Adobe Firefly Video into atlases. Media stays
 * out of Git: art-src/lab/vfx/<element>/manifest.json and its atlases (dev assets of the lab).
 *
 * Manifest (one per element folder):
 *   { "version": 1, "flipbooks": { "<id>": { "file": "<id>.png", "cols": 4, "rows": 4, "frames": 16, "fps": 24,
 *     "cell": 256 | [w, h], "loop": false, "mode": "rgba" | "fire" | "smoke", "pivot": [0.5, 0.5], "start": 0,
 *     "heading": 0, "alpha": "straight" } } }
 * "clips" may stand for "flipbooks" (an object, or an array of entries with "id"), "atlas" for "file", "grid":
 * [cols, rows] for cols and rows. URLs are built from the folder and the file name, never taken from the JSON.
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
 * The material: frames blended in time, a pivot, billboards that turn to follow a world direction on screen (a
 * flame along a flight), analytic soft particles against the ground, and an exact depth lift.
 */
import * as THREE from "three";

export type FlipbookMode = "rgba" | "fire" | "smoke";

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
    const mode: FlipbookMode = entry.mode === "fire" || entry.mode === "smoke" || entry.mode === "rgba" ? entry.mode : straight ? "rgba" : entry.blend === "normal" ? "smoke" : "fire";
    const md5 = typeof entry.md5 === "string" && /^[0-9a-f]{32}$/.test(entry.md5) ? "?v=" + entry.md5 : "";
    out.set(id, {
      id,
      url: base + file + md5,
      cols,
      rows,
      frames,
      fps,
      loop: entry.loop === true,
      mode,
      aspect: cw / ch,
      pivot: [Math.min(1, Math.max(0, px[0]!)), Math.min(1, Math.max(0, px[1]!))],
      start,
      heading: typeof entry.heading === "number" && Number.isFinite(entry.heading) ? (entry.heading * Math.PI) / 180 : 0,
    });
  }
  return out;
}

interface Entry {
  meta: FlipbookMeta;
  texture: THREE.Texture;
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
          try {
            const texture = await loader.loadAsync(meta.url);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = anisotropy;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            // Straight alpha as stored: the shader premultiplies after sampling.
            texture.premultiplyAlpha = false;
            this.add(meta, texture);
          } catch (error) {
            console.warn("[flipbook] " + meta.url + " did not load", error);
          }
        }),
      );
    })();
    return this.loading;
  }

  /** Tests and captures: an atlas from memory. */
  add(meta: FlipbookMeta, texture: THREE.Texture): void {
    this.entries.set(meta.id, { meta, texture });
    for (const listener of this.listeners) listener(meta.id);
  }

  reset(): void {
    for (const entry of this.entries.values()) entry.texture.dispose();
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
attribute vec3 iAge;
attribute float iLift;
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
varying vec3 vAge;
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
  // Turned to follow a world direction on screen (a flame along a flight).
  if (dot(iDir.xyz, iDir.xyz) > 1e-8) {
    vec3 d = mat3(viewMatrix) * iDir.xyz;
    if (dot(d.xy, d.xy) > 1e-10) angle += atan(d.y, d.x) - uHeading;
  }
  float c = cos(angle);
  float s = sin(angle);
  vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
  vec2 corner = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  view.xy += corner;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = (modelMatrix * vec4(iPos, 1.0)).xyz + right * corner.x + up * corner.y;
  gl_Position = projectionMatrix * view;
  // Drawn nearer the eye by iLift (depth only: it projects where it stands).
  if (iLift != 0.0) {
    vec4 moved = projectionMatrix * vec4(view.xy, view.z + iLift, 1.0);
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
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
varying vec3 vAge;
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
  vec4 t0 = texture2D(uMap, vxCell(f0, uv));
  vec4 t1 = texture2D(uMap, vxCell(f1, uv));
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

export interface FlipOptions {
  /** Seconds it lives (default: one pass of the clip at `rate`; a loop: one second). ONE_FRAME: drawn this frame only. */
  life?: number;
  /** Playback speed × the clip's fps (default 1); 0 holds `frame`. */
  rate?: number;
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
}

const WHITE = new THREE.Color(1, 1, 1);

/** `life` for a sprite drawn on this frame only (a head or a core the caller redraws every frame). */
export const ONE_FRAME = 1e-4;

/** Fragment shader modes (uMode). */
const MODE_INDEX: Record<FlipbookMode, number> = { rgba: 0, fire: 1, smoke: 2 };

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
  /** x y z, vx vy vz, size, grow, rot, spin, age, life, frame, fps, alpha, drag, gravity, fadeIn, fadeOut, ground, occlude, r g b, dx dy dz, delay, cool, seed, lift */
  private readonly state: Float32Array;
  private static readonly STRIDE = 31;
  private cursor = 0;
  live = 0;

  constructor(
    readonly id: string,
    readonly mode: FlipbookMode,
    readonly capacity: number,
    renderOrder: number,
    blank: THREE.Texture,
  ) {
    this.iPos = new Float32Array(capacity * 3);
    this.iData = new Float32Array(capacity * 4);
    this.iColor = new Float32Array(capacity * 4);
    this.iDir = new Float32Array(capacity * 4);
    this.iAge = new Float32Array(capacity * 3);
    this.iLift = new Float32Array(capacity);
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
    geometry.setAttribute("iAge", new THREE.InstancedBufferAttribute(this.iAge, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iLift", new THREE.InstancedBufferAttribute(this.iLift, 1).setUsage(THREE.DynamicDrawUsage));
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
        uSoot: { value: new THREE.Vector3(0.03, 0.022, 0.02) },
        uPivot: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uHeading: { value: 0 },
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
  attach(meta: FlipbookMeta, texture: THREE.Texture): void {
    this.meta = meta;
    const u = this.mesh.material.uniforms;
    u.uMap!.value = texture;
    (u.uGrid!.value as THREE.Vector2).set(meta.cols, meta.rows);
    u.uFrames!.value = meta.frames;
    u.uLoop!.value = meta.loop ? 1 : 0;
    (u.uPivot!.value as THREE.Vector2).set(meta.pivot[0], 1 - meta.pivot[1]);
    u.uAspect!.value = meta.aspect;
    u.uHeading!.value = meta.heading;
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

  /** What a burning-out RGBA sprite darkens toward (linear). */
  setSoot(r: number, g: number, b: number): void {
    (this.mesh.material.uniforms.uSoot!.value as THREE.Vector3).set(r, g, b);
  }

  /** Seconds one pass of the clip lasts at `rate`. */
  clipS(rate = 1): number {
    return this.meta === null ? 0.5 : (this.meta.frames - this.meta.start) / (this.meta.fps * Math.max(0.05, rate));
  }

  /** One sprite at `at`, `size` m tall (its width by the cell's aspect). Draws nothing until an atlas is attached. */
  spawn(at: THREE.Vector3, size: number, options: FlipOptions = {}): void {
    const meta = this.meta;
    if (meta === null) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const rate = options.rate ?? 1;
    const fps = meta.fps * rate;
    const first = options.frame ?? (meta.loop ? 0 : meta.start);
    const last = Math.min(meta.frames, options.until !== undefined ? options.until + 1 : meta.frames);
    const life = options.life ?? (meta.loop || rate <= 0 ? 1 : Math.max(1 / 60, (last - first) / Math.max(1e-3, fps)));
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
    st[o + 18] = options.fadeOut ?? (this.mode === "rgba" && (options.cool ?? 0) > 0 ? 0 : Math.min(0.12, life * 0.3));
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
      this.iData[n * 4 + 2] = st[o + 12]! + age * st[o + 13]!;
      this.iData[n * 4 + 3] = st[o + 14]! * fadeIn * fadeOut;
      this.iColor[n * 4] = st[o + 21]!;
      this.iColor[n * 4 + 1] = st[o + 22]!;
      this.iColor[n * 4 + 2] = st[o + 23]!;
      this.iColor[n * 4 + 3] = st[o + 19]!;
      this.iDir[n * 4] = st[o + 24]!;
      this.iDir[n * 4 + 1] = st[o + 25]!;
      this.iDir[n * 4 + 2] = st[o + 26]!;
      this.iDir[n * 4 + 3] = st[o + 20]!;
      this.iAge[n * 3] = k;
      this.iAge[n * 3 + 1] = st[o + 28]!;
      this.iAge[n * 3 + 2] = st[o + 29]!;
      this.iLift[n] = st[o + 30]!;
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
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i += 1) this.state[i * FlipbookPool.STRIDE + 11] = 0;
    this.live = 0;
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
          if (entry !== null && pool !== undefined) pool.attach(entry.meta, entry.texture);
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
    if (entry !== null) pool.attach(entry.meta, entry.texture);
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
