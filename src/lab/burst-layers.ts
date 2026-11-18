/** Owner 16/11: v3 thunder and blood bursts stay the main layer; library components are stacked on top.
 * Components only (existing flipbooks), placed, tinted and staggered here. No shapes are drawn in code. */
import * as THREE from "three";
import { FlipbookPlayer, FlipbookPool, ONE_FRAME, type FlipbookMode, type FlipOptions } from "../view/skills/flipbook";
import { layFlat } from "../view/skills/element-clips";

const FRAME = 1 / 12;
const owners = new WeakMap<FlipbookPool, FlipbookPlayer>();
const flat = new WeakSet<FlipbookPool>();
const at = new THREE.Vector3();
const o: FlipOptions = {};
let installed = false;

/** Deterministic per burst, so captures repeat. */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

function layer(player: FlipbookPlayer, folder: string, id: string, mode: FlipbookMode, ground = false): FlipbookPool | null {
  const pool = player.pool(folder, id, { mode, capacity: 8 });
  if (!pool.ready) { void player.library(folder).fetchAtlas(id); return null; }
  if (ground && !flat.has(pool)) { layPool(pool); flat.add(pool); }
  return pool;
}

/** Owner 16/11: the pool read as standing or floating with square edges. A decal on XZ centred on the contact
 * (pivot forced to the cell centre, not the clip's ground pivot) with a noisy radial falloff, so no card edge shows. */
function layPool(pool: FlipbookPool): void {
  layFlat(pool);
  const material = pool.mesh.material, base = material.onBeforeCompile;
  material.customProgramCacheKey = () => "burst-blood-pool-decal";
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    const v = shader.vertexShader.replace(/uv\.x - uPivot\.x\) \* spanX/, "uv.x - 0.5) * spanX").replace(/uv\.y - uPivot\.y\) \* iData\.x;/, "uv.y - 0.5) * iData.x;");
    const smoke = "    gl_FragColor = vec4(c * a * soft, a * soft);\n    return;";
    if (v === shader.vertexShader || !shader.fragmentShader.includes(smoke)) throw new Error("[burst-layers] pool decal anchors missing");
    shader.vertexShader = v;
    shader.fragmentShader = shader.fragmentShader.replace(smoke,
      "    float rr = length(vUv - 0.5) * 2.0 + (n - 0.5) * 0.18;\n    a *= 1.0 - smoothstep(0.55, 0.95, rr);\n" + smoke);
  };
  material.needsUpdate = true;
}

function put(pool: FlipbookPool | null, x: number, y: number, z: number, size: number, opts: FlipOptions): void {
  if (pool === null) return;
  for (const key of Object.keys(o) as (keyof FlipOptions)[]) delete o[key];
  Object.assign(o, opts);
  pool.spawn(at.set(x, y, z), size, o);
}

// Pale violet-white, every channel <= 0.9 after intensity: the v3 strike stays the only accent.
const BOLT_TINT = new THREE.Color(0.62, 0.58, 0.9);
const BOLTS = ["thunder-single-bolt-a-wg-lo", "thunder-single-bolt-b-wg-lo", "thunder-single-bolt-c-wg-lo"] as const;
let burstSeed = 7;

function thunder(player: FlipbookPlayer, c: THREE.Vector3, size: number): void {
  const r = rng(burstSeed++);
  const count = 3;
  const yaw0 = r() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const yaw = yaw0 + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.9;
    const radius = size * (0.3 + r() * 0.12);
    const h = size * (0.42 + r() * 0.18);
    // Bolt cells are pivoted at their middle: lift by half the height so the tip meets the ground.
    put(layer(player, "thunder", BOLTS[i % BOLTS.length]!, "fire"), c.x + Math.cos(yaw) * radius, h * 0.4, c.z + Math.sin(yaw) * radius * 0.6, h, {
      frame: 1, delay: (3 + Math.floor(r() * 3)) * FRAME, life: 0.6, rot: (r() - 0.5) * 0.35,
      tint: BOLT_TINT, intensity: 0.9, alpha: 0.85, fadeOut: 0.25, occlude: 0, ground: -1e5,
    });
  }
}

const DROP_TINT = new THREE.Color(0.2, 0.0, 0.012);
const STAIN_TINT = new THREE.Color(0.17, 0.0, 0.012);

function blood(player: FlipbookPlayer, c: THREE.Vector3, size: number): void {
  const r = rng(burstSeed++);
  // Wet pool (owner 16/11: "solid, irregular"): two held late cells of blood-ground-impact as the dense body,
  // and three blood-ground-mark cells overlapped at other turns and sizes so their gaps close. Near-black crimson.
  for (let i = 0; i < 2; i++) {
    put(layer(player, "blood", "blood-ground-impact", "smoke", true), c.x, 0.016, c.z, size * (0.5 - 0.1 * i), {
      frame: 18 + 4 * i, rate: 0, life: 2.8, delay: (3 + i) * FRAME, rot: r() * Math.PI * 2, tint: STAIN_TINT,
      alpha: 1, fadeIn: 0.2, fadeOut: 1.4, cool: 0, grow: 1.35, ground: -1e5, lift: 0.025,
    });
  }
  for (let i = 0; i < 3; i++) {
    const yaw = r() * Math.PI * 2, off = size * 0.05 * r();
    put(layer(player, "blood", "blood-ground-mark", "smoke", true), c.x + Math.cos(yaw) * off, 0.015, c.z + Math.sin(yaw) * off, size * (0.24 + 0.05 * i), {
      frame: 4 + i * 6, rate: 0, life: 2.6, delay: (2 + i) * FRAME, rot: yaw + i * 2.1, tint: STAIN_TINT,
      alpha: 0.45, fadeIn: 0.25, fadeOut: 1.2, cool: 0, grow: 1.2 + 0.06 * i, ground: -1e5, lift: 0.02,
    });
  }
  // Flying droplets and splatter: two blood-impact cards thrown up and falling, darkening what they cover.
  for (let i = 0; i < 2; i++) {
    const yaw = r() * Math.PI * 2, speed = size * (0.35 + r() * 0.25);
    // Owner 16/11: at full size this card read as the pool standing up behind the burst; kept small, as droplets only.
    put(layer(player, "blood", "blood-impact", "fire"), c.x, size * 0.15, c.z, size * (0.26 + r() * 0.08), {
      frame: 3, delay: (1 + i) * FRAME, rot: r() * Math.PI * 2, spin: (r() - 0.5) * 1.2,
      vx: Math.cos(yaw) * speed * 0.5, vy: size * 0.9, vz: Math.sin(yaw) * speed * 0.3, gravity: -size * 3.2, drag: 0.6,
      tint: DROP_TINT, intensity: 1, occlude: 0.9, fadeOut: 0.3, ground: 0,
    });
  }
}

// Scale = the v3 row's calibration in burst-v2.ts, so layers follow the drawn size.
const SOURCES: [string, number, (p: FlipbookPlayer, c: THREE.Vector3, size: number) => void][] = [
  // Owner 16/11: side bolts off with the v3 thunder.   ["/thunder/thunder-impact-v3.", 0.585, thunder],
  ["/blood/blood-big-burst-v3.", 0.401, blood],
];

/** Call after installBurstV2Pools, so the v2 spawn (scale, ground pivot) runs first. */
export function installBurstLayers(): void {
  if (installed) return;
  installed = true;
  const pool = FlipbookPlayer.prototype.pool;
  FlipbookPlayer.prototype.pool = function (...args) {
    const made = pool.apply(this, args);
    owners.set(made, this);
    return made;
  };
  const spawn = FlipbookPool.prototype.spawn;
  FlipbookPool.prototype.spawn = function (where, size, supplied = {}) {
    spawn.call(this, where, size, supplied);
    const url = this.meta?.url, player = owners.get(this);
    if (url === undefined || player === undefined || supplied.life === ONE_FRAME) return;
    const source = SOURCES.find(([part]) => url.includes(part));
    if (source === undefined) return;
    const c = new THREE.Vector3(where.x, 0, where.z);
    source[2](player, c, size * source[1]);
  };
}
