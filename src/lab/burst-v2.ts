/** Tickets 421/422: lab-only source substitution and per-clip calibration. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, parseFlipbookManifest, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";

// Standalone black-background probe: 1280x720, fitCamera(55 degrees), caller size 4 m.
// These factors multiply caller settings; old mode never enters the calibration path.
export const BURST_V2 = [
  { id: "fire-impact", key: "fire-impact", ground: false, scale: 2.4, intensity: 2 },
  // Fire's burst role uses the W2 key; retain fire-burst's existing release/impact source.
  { id: "fire-big-burst", key: "style-w2-fire-qi-burst", ground: false, scale: 1.687, intensity: 1,
    gradient: [[1, 0.42, 0.02], [1, 0.72, 0.22]] },
  { id: "earth-ring-burst", key: "earth-ring-burst", ground: true, flat: true, scale: 1.6, intensity: 2.4 },
  { id: "metal-impact", key: "metal-impact", ground: false, scale: 2.4, intensity: 2 },
  { id: "metal-big-burst", key: "metal-big-burst", ground: false, scale: 1.615, intensity: 1 },
  { id: "void-big-burst", key: "void-big-burst", ground: false, scale: 2.036, intensity: 1 },
  { id: "wind-ring-burst", key: "wind-ring-burst", ground: true, scale: 0.773, intensity: 1.323 },
  { id: "dark-ring-burst", key: "dark-ring-burst", ground: true, scale: 1.4, intensity: 2 },
  { id: "water-ring-burst", key: "water-ring-burst", ground: true, scale: 1.6, intensity: 1.983 },
  { id: "poison-ring-burst", key: "poison-ring-burst", ground: true, scale: 1.127, intensity: 1 },
  { id: "poison-big-burst", key: "poison-big-burst", suffix: "-v5b", ground: true, scale: 1.4, intensity: 1 },
  // Owner 16/11: v3 read as neon; graded toward deep crimson (burst-layers.ts adds droplets and a wet stain).
  { id: "blood-big-burst", key: "blood-big-burst", suffix: "-v4", ground: true, scale: 0.401, intensity: 2.2, occlude: 0.85,
    gradient: [[0.4, 0.0, 0.02], [0.9, 0.32, 0.28]] },
  { id: "wood-big-burst", key: "wood-big-burst", ground: true, scale: 0.505, intensity: 1.15 },
  { id: "dark-big-burst-white", key: "dark-big-burst-white", suffix: "-v2b", ground: true, scale: 1.246, intensity: 0.85 },
  { id: "dark-ground-impact-white", key: "dark-ground-impact-white", suffix: "-v2b", ground: true, scale: 1.421, intensity: 0.85 },
  // Owner 16/11: thunder goes back to the old clip; the v3 files stay.   { id: "thunder-impact", key: "thunder-impact", suffix: "-v3", ground: true, scale: 0.585, intensity: 1.15 },
  { id: "star-ring-burst", key: "star-ring-burst", ground: true, scale: 0.819, intensity: 1.15 },
] as const;
export const BURST_BOTTOM_FADE = 0.15;
type BurstRow = typeof BURST_V2[number];
const burstId = (row: BurstRow): string => row.id + ("suffix" in row ? row.suffix : "-v2");
type Transform = (original: Map<string, FlipbookMeta>, base: string) => Promise<Map<string, FlipbookMeta>>;
interface BurstInfo {
  readonly ground: boolean;
  readonly flat?: boolean;
  readonly scale: number;
  readonly intensity: number;
  /** Fire-mode ground darkening (default 0): a wet, deep colour instead of pure added light. */
  readonly occlude?: number;
  readonly gradient?: readonly [readonly [number, number, number], readonly [number, number, number]];
}
const info = new Map<string, BurstInfo>();
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const modes = { rgba: 0, fire: 1, smoke: 2, heat: 3 } as const;

/** Adapt packaging JSON without inheriting stale hashes, motion maps or videos. */
export function parseBurstV2(raw: unknown, row: BurstRow, base: string, old?: FlipbookMeta): FlipbookMeta {
  if (!record(raw) || raw.id !== burstId(row) || raw.image !== burstId(row) + ".atlas.png"
    || raw.loop !== false || !record(raw.trim) || !Number.isInteger(raw.trim.tailFade)
    || typeof raw.trim.tailFade !== "number" || raw.trim.tailFade < 0
    || typeof raw.frames !== "number" || raw.trim.tailFade > raw.frames
    || (raw.start !== undefined && (typeof raw.start !== "number" || !Number.isInteger(raw.start) || raw.start < 0 || raw.start >= raw.frames))
    || !Array.isArray(raw.pivot) || raw.pivot.length !== 2
    || !raw.pivot.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)
    || (raw.channels !== "rgb" && raw.channels !== "rgba")
    || raw.blend !== (raw.channels === "rgba" ? "normal" : "additive")) throw new Error("Invalid burst JSON: " + row.id);
  const meta = parseFlipbookManifest({ version: 1, flipbooks: { [row.key]: {
    file: raw.image, cols: raw.cols, rows: raw.rows, frames: raw.frames, fps: raw.fps, cell: raw.cell,
    pivot: raw.pivot, loop: false, mode: raw.channels === "rgba" ? "rgba" : "fire",
    role: old?.role ?? raw.role, layer: old?.layer, start: raw.start ?? 0, heading: 0,
    ktx2: { yFlip: true, uastc: { file: burstId(row) + ".uastc.ktx2", bytes: 0 } },
  } } }, base).get(row.key)!;
  // trim.tailFade is baked into the atlas. Keep alpha=1 to avoid applying it twice.
  const result: FlipbookMeta = { ...meta, playback: {
    durationS: (meta.frames - meta.start) / meta.fps,
    sample(_t, out) { out.scale = 1; out.alpha = 1; out.erosion = 0; },
  } };
  info.set(result.url, row);
  return result;
}

/** Cache each JSON request; old mode returns the input Map without fetching v2. */
export function createBurstV2Overrides(search: string | URLSearchParams, fetcher: typeof fetch = fetch, warn = console.warn): Transform {
  const enabled = new URLSearchParams(search).get("burst") !== "old";
  const pending = new Map<string, Promise<unknown>>();
  return async (original, base) => {
    if (!enabled) return original;
    const folder = base.match(/\/art-src\/lab\/vfx\/([a-z]+)\/$/)?.[1];
    if (folder === undefined) return original;
    const rows = BURST_V2.filter(row => row.id.split("-")[0] === folder);
    if (rows.length === 0) return original;
    const result = new Map(original);
    await Promise.all(rows.map(async row => {
      const url = base + burstId(row) + ".json";
      let request = pending.get(url);
      if (request === undefined) {
        request = fetcher(url, { cache: "no-cache" }).then(response => {
          if (!response.ok) throw new Error("HTTP " + response.status + ": " + url);
          return response.json() as Promise<unknown>;
        });
        pending.set(url, request);
      }
      try { result.set(row.key, parseBurstV2(await request, row, base, original.get(row.key))); }
      catch (error) { warn("[burst-v2] " + row.id + ": keeping old source", error); }
    }));
    return result;
  };
}

/** Y-axis billboard: an upright above the contact pivot and a ground skirt below it.
 * Compensate projection to retain the source's 55-degree ellipse and cell aspect.
 * Every vertex stays at or above the ground; the source's contact pivot remains fixed. */
export const BURST_GROUND_VERTEX = /* glsl */ `
  vec3 origin = (modelMatrix * vec4(iPos, 1.0)).xyz;
  vec3 eye = cameraPosition - origin;
  float horizontal = max(length(eye.xz), 1e-4);
  float distanceToEye = max(length(eye), 1e-4);
  vec3 toward = vec3(eye.x / horizontal, 0.0, eye.z / horizontal);
  vec3 right = vec3(toward.z, 0.0, -toward.x);
  vec2 corner = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
  float upright = max(corner.y, 0.0) * distanceToEye / horizontal;
  float skirt = -min(corner.y, 0.0) * distanceToEye / max(abs(eye.y), 1e-4);
  vWorld = origin + right * corner.x + vec3(0.0, upright, 0.0) + toward * skirt;
  vec4 view = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * view;
}`;

/** A real XZ decal: the mesh's local +Z faces +Y, independent of the camera.
 * Undo its -90-degree X rotation for instance centres, which callers supply in world axes. */
export const BURST_FLAT_VERTEX = /* glsl */ `
  vec2 corner = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
  vec3 centre = vec3(iPos.x, -iPos.z, iPos.y);
  vWorld = (modelMatrix * vec4(centre + vec3(corner, 0.01), 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

let poolsInstalled = false;
/** Install only from the lab hook; retain constructors, capacities and overflow behavior. */
export function installBurstV2Pools(): void {
  if (poolsInstalled) return;
  poolsInstalled = true;
  const attach = FlipbookPool.prototype.attach, spawn = FlipbookPool.prototype.spawn, update = FlipbookPool.prototype.update;
  const hooks = new WeakMap<FlipbookPool, () => void>();
  const groundAt = new THREE.Vector3();
  const options: FlipOptions = {};
  const white = new THREE.Color(1, 1, 1);
  const configure = (pool: FlipbookPool): void => {
    const meta = pool.meta, config = meta === null ? undefined : info.get(meta.url);
    if (meta === null || config === undefined) return;
    const material = pool.mesh.material;
    material.uniforms.uMode!.value = modes[meta.mode];
    // Legacy callers may layFlat after attach; restore the card before update/draw.
    let hook = hooks.get(pool);
    if (hook === undefined) {
      // A vertex row at the pivot prevents interpolation from lifting the ground contact.
      if (config.ground && !config.flat) {
        const base = new THREE.PlaneGeometry(1, 1, 1, 2);
        pool.mesh.geometry.index = base.index;
        pool.mesh.geometry.setAttribute("position", base.getAttribute("position"));
        pool.mesh.geometry.setAttribute("uv", base.getAttribute("uv"));
        base.dispose();
      }
      let pivot = -1;
      const compile: typeof material.onBeforeCompile = shader => {
        if (config.ground) {
          const anchor = "  vec4 view = modelViewMatrix * vec4(iPos, 1.0);";
          const start = shader.vertexShader.indexOf(anchor);
          if (start < 0) throw new Error("[burst-v2] ground-card vertex anchor missing");
          shader.vertexShader = shader.vertexShader.slice(0, start) + (config.flat ? BURST_FLAT_VERTEX : BURST_GROUND_VERTEX);
        }
        // Fade the final premultiplied output, including RGB light with zero additive alpha.
        // Applying it after vxTagMain also covers its early returns and sharpened RGBA.
        const anchor = "  gl_FragColor.rgb *= vxTagKeep();";
        if (!shader.fragmentShader.includes(anchor)) throw new Error("[burst-v2] bottom-fade fragment anchor missing");
        // Grade premultiplied light without dividing by alpha (additive clips have alpha=0).
        // Normalise the ramp by its strongest channel (owner 16/11): luma normalisation pushed red past 1 (neon).
        const gradient = config.gradient === undefined ? "" : `
  const vec3 burstLuma = vec3(0.2126, 0.7152, 0.0722);
  float burstLight = dot(gl_FragColor.rgb, burstLuma);
  vec3 burstColour = mix(vec3(${config.gradient[0].join(", ")}), vec3(${config.gradient[1].join(", ")}), smoothstep(0.0, 1.0, burstLight));
  gl_FragColor.rgb = burstColour * (burstLight / max(burstColour.r, max(burstColour.g, burstColour.b)));`;
        shader.fragmentShader = shader.fragmentShader.replace(anchor,
          gradient + "\n" + anchor + `\n  gl_FragColor *= smoothstep(0.0, ${BURST_BOTTOM_FADE}, vUv.y);`);
      };
      const key = () => "lab-burst-v2-422b-" + (config.flat ? "flat" : config.ground ? "ground" : "billboard") + JSON.stringify(config.gradient ?? null);
      hook = () => {
        if (config.flat) pool.mesh.rotation.set(-Math.PI / 2, 0, 0);
        const current = pool.meta!.pivot[1];
        if (config.ground && !config.flat && pivot !== current) {
          const uv = pool.mesh.geometry.getAttribute("uv"), position = pool.mesh.geometry.getAttribute("position");
          uv.setY(2, 1 - current); uv.setY(3, 1 - current); uv.needsUpdate = true;
          position.setY(2, 0.5 - current); position.setY(3, 0.5 - current); position.needsUpdate = true;
          pivot = current;
        }
        if (material.onBeforeCompile !== compile || material.customProgramCacheKey !== key) {
          material.onBeforeCompile = compile; material.customProgramCacheKey = key; material.needsUpdate = true;
        }
      };
      hooks.set(pool, hook);
      const before = pool.mesh.onBeforeRender;
      pool.mesh.onBeforeRender = function (...args) { before.apply(this, args); hook!(); };
    }
    hook();
  };
  FlipbookPool.prototype.attach = function (...args) { attach.apply(this, args); configure(this); };
  FlipbookPool.prototype.spawn = function (at, size, supplied = {}) {
    const meta = this.meta, config = meta === null ? undefined : info.get(meta.url);
    if (meta === null || config === undefined) return spawn.call(this, at, size, supplied);
    // Retain ONE_FRAME scrubbing; otherwise play the complete JSON segment at its native rate.
    for (const key of Object.keys(options) as (keyof FlipOptions)[]) delete options[key];
    Object.assign(options, supplied, {
      rate: supplied.life === ONE_FRAME ? supplied.rate : 1,
      frame: supplied.life === ONE_FRAME ? supplied.frame : meta.start,
      life: supplied.life === ONE_FRAME ? ONE_FRAME : (meta.frames - meta.start) / meta.fps,
      intensity: (supplied.intensity ?? 1) * config.intensity,
      until: undefined, slowFrom: undefined, slowRate: undefined,
      cool: 0, erode: 0, fadeIn: 0, fadeOut: 0, grow: 0,
      occlude: meta.mode === "fire" ? config.occlude ?? 0 : supplied.occlude,
      // The new silver smoke carries its own RGBA color rather than a tinted density.
      tint: meta.mode === "rgba" ? white : supplied.tint,
    });
    if (config.ground) {
      const floor = supplied.ground;
      groundAt.set(at.x, floor !== undefined && Number.isFinite(floor) && floor > -1e4 ? floor : 0, at.z);
      Object.assign(options, { rot: 0, spin: 0, dir: undefined, span: undefined, vx: 0, vy: 0, vz: 0, gravity: 0, ground: -1e5, lift: 0 });
    }
    spawn.call(this, config.ground ? groundAt : at, size * config.scale, options);
  };
  FlipbookPool.prototype.update = function (dt) { configure(this); update.call(this, dt); };
}

export function burstComparisonUrl(href: string): string {
  const url = new URL(href);
  if (url.searchParams.get("burst") === "old") url.searchParams.delete("burst");
  else url.searchParams.set("burst", "old");
  return url.href;
}

interface GridHost { clip(folder: string, id: string, x: number, y: number, z: number, size: number): Promise<boolean> }
/** Call after __lab.ready; capture old/v2 at the same camera and tick. */
export async function burstGrid(host: GridHost): Promise<{ id: string; key: string; played: boolean; x: number; z: number }[]> {
  // A five-column grid in BURST_V2 order.
  return Promise.all(BURST_V2.map(async (row, i) => {
    const x = (i % 5 - 2) * 6, z = -17 + Math.floor(i / 5) * 7;
    return { id: burstId(row), key: row.key, x, z, played: await host.clip(row.id.split("-")[0]!, row.key, x, 0, z, 4) };
  }));
}

let runtime: Transform | undefined;
/** One-line integration in pilot-overrides; retain its transform, tracing and ?pilot=1. */
export async function overrideBursts(previous: Transform, original: Map<string, FlipbookMeta>, base: string, search: string | URLSearchParams): Promise<Map<string, FlipbookMeta>> {
  if (runtime === undefined) {
    runtime = createBurstV2Overrides(search);
    installBurstV2Pools();
    if (new URLSearchParams(search).get("burst") !== "old" && new URLSearchParams(search).get("layers") !== "0") await import("./burst-layers").then(m => m.installBurstLayers());
    if (typeof window !== "undefined") {
      Object.assign(window, { __burstV2: {
        mode: new URLSearchParams(search).get("burst") === "old" ? "old" : "v2",
        rows: BURST_V2,
        grid: () => burstGrid((window as unknown as { __lab: GridHost }).__lab),
      } });
      window.addEventListener("keydown", event => {
        const target = event.target;
        if (event.repeat || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey || event.code !== "KeyB"
          || (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
        event.preventDefault(); event.stopImmediatePropagation();
        window.location.assign(burstComparisonUrl(window.location.href));
      }, { capture: true });
    }
  }
  return runtime(await previous(original, base), base);
}
