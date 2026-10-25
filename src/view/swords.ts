/**
 * "Vạn kiếm" (canon §12.1, §20.2, §20.3): swords appear behind the caster,
 * rise, fly a curve and meet over the target zone in 3 volleys, stand a
 * moment where they struck, then gather back towards the caster and fold
 * away. Bodies are one InstancedMesh of a low-poly placeholder blade (a few
 * dozen triangles; the M0b blade is the owner's GLB), trails and glows are
 * trails.ts (2 draw calls): 3 draw calls in all. One shared pool per tier
 * (150 / 300 / 500 swords, rules.ts TT_BUDGETS): a cast takes from it, an
 * ally's cast takes its 0.4–0.6 share of it (canon §20.2, PB-34), never more
 * swords than the pool. Every sword lives in preallocated typed arrays and
 * the hot loop passes no float to a call: nothing allocates per frame after
 * creation. Impacts of the frame are listed for the hit effects.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RANDOM_MASK, randomTable } from "./hitfx";
import type { Renderer3D } from "./renderer";
import { createTrails, type Trails } from "./trails";

/** Flight of a cast (view only): 3 volleys 0.3 s apart, each sword staggered up to 0.18 s. */
export const VAN_KIEM = {
  volleys: 3,
  volleyGapS: 0.3,
  staggerS: 0.18,
  flightS: [0.6, 0.85] as readonly [number, number],
  /** Stuck where it struck, then the gather back to the caster. */
  holdS: 0.12,
  gatherS: 0.55,
  /** Behind the caster's back, the climb, the target zone's radius (m). */
  behindM: 1.4,
  riseM: [3.5, 6.5] as readonly [number, number],
  zoneM: 2.6,
  /** Blade length (m). */
  lengthM: 0.95,
  /** Trail samples (1/60 s each). */
  trailSamples: 16,
} as const;

export interface SwordOptions {
  /** Trails and glows (default true). */
  readonly trails?: boolean;
  readonly trailSamples?: number;
  /** L1: 0.5 (half the trail, glow on half the swords); default 1. */
  readonly vfxShare?: number;
  readonly zoneM?: number;
  readonly seed?: number;
}

export interface SwordPool {
  readonly capacity: number;
  readonly live: number;
  /** A volley of up to `count` swords from (x, z) to (toX, toZ) in metres; returns how many it took. */
  volley(count: number, x: number, z: number, toX: number, toZ: number): number;
  /** A whole "vạn kiếm": 3 volleys of `share` of the pool (allies 0.4–0.6); returns the swords it will take. */
  cast(x: number, z: number, toX: number, toZ: number, share?: number): number;
  /** Ground points struck this frame (m). */
  readonly impactX: Float32Array;
  readonly impactZ: Float32Array;
  readonly impactCount: number;
  /** L1 of the ladder: 0.5 halves the trails and keeps the glow on half the swords. */
  setVfxShare(share: number): void;
  update(dt: number): void;
  drawCalls(): number;
  triangles(): number;
  textureBytes(): number;
  dispose(): void;
}

/** The placeholder blade, point +y, grip at the origin side: a flat bipyramid, a guard and a grip (~32 triangles). */
export function bladeGeometry(lengthM: number = VAN_KIEM.lengthM): THREE.BufferGeometry {
  const blade = new THREE.OctahedronGeometry(1, 0);
  blade.scale(0.065, 0.36, 0.016);
  blade.translate(0, 0.14, 0);
  const guard = new THREE.BoxGeometry(0.2, 0.035, 0.05).toNonIndexed();
  guard.translate(0, -0.22, 0);
  const grip = new THREE.BoxGeometry(0.035, 0.16, 0.035).toNonIndexed();
  grip.translate(0, -0.32, 0);
  const merged = mergeGeometries([blade, guard, grip])!;
  merged.scale(lengthM, lengthM, lengthM);
  merged.computeVertexNormals();
  blade.dispose();
  guard.dispose();
  grip.dispose();
  return merged;
}

/** A sword's phase. */
const Phase = { Free: 0, Waiting: 1, Flying: 2, Holding: 3, Gathering: 4, Launch: 5 } as const;

/** Volleys a cast still has to send (fixed queue). */
const QUEUE = 16;

/** Calls that warm an event function at load (see warm()). */
export const WARM_CALLS = 600;

class SwordPoolImpl implements SwordPool {
  readonly capacity: number;
  readonly impactX: Float32Array;
  readonly impactZ: Float32Array;
  impactCount = 0;
  private readonly mesh: THREE.InstancedMesh;
  private readonly trails: Trails | null;
  private readonly phase: Uint8Array;
  private readonly t: Float32Array;
  private readonly delay: Float32Array;
  private readonly dur: Float32Array;
  /** Control points of the current curve: 4 × xyz. */
  private readonly ctrl: Float32Array;
  /** Where the sword goes home (the caster), xz. */
  private readonly home: Float32Array;
  /** A volley's order until the sword's first frame: from x, z to x, z. */
  private readonly order: Float32Array;
  private readonly free: Int32Array;
  private freeCount: number;
  private high = 0;
  private liveCount = 0;
  private readonly zoneM: number;
  private readonly samples: number;
  /** View-only draws (hitfx.ts randomTable) and their cursor. */
  private readonly rand: Float32Array;
  private rc = 0;
  private readonly qT = new Float32Array(QUEUE);
  private readonly qCount = new Int32Array(QUEUE);
  private readonly qPos = new Float32Array(QUEUE * 4);
  private qLen = 0;
  /** Scratch of this sword's position, forward and scale (fields: no float crosses a call). */
  private px = 0.5;
  private py = 0.5;
  private pz = 0.5;
  private fx = 0.5;
  private fy = 0.5;
  private fz = 0.5;
  private scale = 0.5;
  private dt = 0.5;
  /** Where on the curve curve() reads (a field: a float argument would be boxed per sword). */
  private u = 0.5;

  constructor(renderer: Renderer3D, capacity: number, options: SwordOptions) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const n = this.capacity;
    this.zoneM = options.zoneM ?? VAN_KIEM.zoneM;
    this.rand = randomTable(options.seed ?? 12_345);
    this.phase = new Uint8Array(n);
    this.t = new Float32Array(n);
    this.delay = new Float32Array(n);
    this.dur = new Float32Array(n);
    this.ctrl = new Float32Array(n * 12);
    this.home = new Float32Array(n * 2);
    this.order = new Float32Array(n * 4);
    this.impactX = new Float32Array(n);
    this.impactZ = new Float32Array(n);
    this.free = new Int32Array(n);
    // Pops give the lowest index first, so the drawn range stays short.
    for (let k = 0; k < n; k += 1) this.free[k] = n - 1 - k;
    this.freeCount = n;
    const material = new THREE.MeshLambertMaterial({ color: "#dfe6ea", emissive: "#7ff5e0", emissiveIntensity: 0.35 });
    this.mesh = new THREE.InstancedMesh(bladeGeometry(), material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = "swords";
    renderer.layers.fx.add(this.mesh);
    this.samples = options.trailSamples ?? VAN_KIEM.trailSamples;
    this.trails = options.trails === false ? null : createTrails(renderer, n, this.samples);
    this.setVfxShare(options.vfxShare ?? 1);
    this.warm();
  }

  /**
   * Draws up a few hundred flights on slot 0 and frees it again: V8 compiles
   * launch() at load, not during the first "vạn kiếm" (an unoptimised function
   * boxes every float it computes, a few hundred swords at once).
   */
  private warm(): void {
    for (let k = 0; k < WARM_CALLS; k += 1) {
      this.order[0] = k % 7;
      this.order[1] = 1.6;
      this.order[2] = -7.5;
      this.order[3] = -10;
      this.launch(0);
    }
    this.phase[0] = Phase.Free;
    this.t[0] = 0;
    this.trails?.reset(0);
    this.rc = 0;
  }

  get live(): number {
    return this.liveCount;
  }

  setVfxShare(share: number): void {
    if (this.trails === null) return;
    this.trails.setLength(Math.max(2, Math.round(this.samples * Math.min(1, Math.max(0.1, share)))));
    this.trails.setGlowShare(share);
  }

  volley(count: number, x: number, z: number, toX: number, toZ: number): number {
    // Only the order is kept here; the flight is drawn up in step() on the sword's first frame,
    // inside the per-frame loop V8 has optimised (an event function may run unoptimised and box).
    let taken = 0;
    for (; taken < count && this.freeCount > 0; taken += 1) {
      const i = this.free[--this.freeCount]!;
      this.order[i * 4] = x;
      this.order[i * 4 + 1] = z;
      this.order[i * 4 + 2] = toX;
      this.order[i * 4 + 3] = toZ;
      this.phase[i] = Phase.Launch;
      this.t[i] = 0;
      if (i + 1 > this.high) this.high = i + 1;
      this.liveCount += 1;
    }
    return taken;
  }

  /** Sword i's flight from its order: 4 control points, its stagger and flight time (first frame, in step()). */
  private launch(i: number): void {
    const o = i * 4;
    const x = this.order[o]!;
    const z = this.order[o + 1]!;
    const toX = this.order[o + 2]!;
    const toZ = this.order[o + 3]!;
    let dx = toX - x;
    let dz = toZ - z;
    const length = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= length;
    dz /= length;
    // Right of the throw.
    const rx = dz;
    const rz = -dx;
    const rand = this.rand;
    const c = i * 12;
    const spread = (rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! - 0.5) * 2.6;
    // P0 behind the caster's back, P1 high above it, P2 above the zone, P3 the ground point struck.
    this.ctrl[c] = x - dx * VAN_KIEM.behindM + rx * spread;
    this.ctrl[c + 1] = 1.3 + rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 1.4;
    this.ctrl[c + 2] = z - dz * VAN_KIEM.behindM + rz * spread;
    const rise = VAN_KIEM.riseM[0] + rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * (VAN_KIEM.riseM[1] - VAN_KIEM.riseM[0]);
    this.ctrl[c + 3] = this.ctrl[c]! - dx * 1.2 + rx * spread * 0.6;
    this.ctrl[c + 4] = this.ctrl[c + 1]! + rise;
    this.ctrl[c + 5] = this.ctrl[c + 2]! - dz * 1.2 + rz * spread * 0.6;
    const angle = rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * Math.PI * 2;
    const radius = Math.sqrt(rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]!) * this.zoneM;
    const hx = toX + Math.cos(angle) * radius;
    const hz = toZ + Math.sin(angle) * radius;
    this.ctrl[c + 6] = hx - dx * 2 + rx * spread * 0.4;
    this.ctrl[c + 7] = 5 + rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 2.5;
    this.ctrl[c + 8] = hz - dz * 2 + rz * spread * 0.4;
    this.ctrl[c + 9] = hx;
    this.ctrl[c + 10] = 0.25;
    this.ctrl[c + 11] = hz;
    this.home[i * 2] = x;
    this.home[i * 2 + 1] = z;
    this.phase[i] = Phase.Waiting;
    this.t[i] = 0;
    this.delay[i] = rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * VAN_KIEM.staggerS;
    this.dur[i] = VAN_KIEM.flightS[0] + rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * (VAN_KIEM.flightS[1] - VAN_KIEM.flightS[0]);
    this.trails?.reset(i);
  }

  cast(x: number, z: number, toX: number, toZ: number, share?: number): number {
    const part = share === undefined ? 1 : Math.min(1, Math.max(0, share));
    const each = Math.floor((this.capacity * part) / VAN_KIEM.volleys);
    for (let v = 0; v < VAN_KIEM.volleys && this.qLen < QUEUE; v += 1) {
      const q = this.qLen++;
      this.qT[q] = v * VAN_KIEM.volleyGapS;
      this.qCount[q] = each;
      this.qPos[q * 4] = x;
      this.qPos[q * 4 + 1] = z;
      this.qPos[q * 4 + 2] = toX;
      this.qPos[q * 4 + 3] = toZ;
    }
    return each * VAN_KIEM.volleys;
  }

  private release(i: number): void {
    this.phase[i] = Phase.Free;
    this.free[this.freeCount++] = i;
    this.liveCount -= 1;
    while (this.high > 0 && this.phase[this.high - 1] === Phase.Free) this.high -= 1;
  }

  /** The point and forward of sword i's curve at the `u` field into the px … fz fields (cubic Bézier). */
  private curve(i: number): void {
    const c = i * 12;
    const k = this.ctrl;
    const u = this.u;
    const v = 1 - u;
    const b0 = v * v * v;
    const b1 = 3 * u * v * v;
    const b2 = 3 * u * u * v;
    const b3 = u * u * u;
    this.px = b0 * k[c]! + b1 * k[c + 3]! + b2 * k[c + 6]! + b3 * k[c + 9]!;
    this.py = b0 * k[c + 1]! + b1 * k[c + 4]! + b2 * k[c + 7]! + b3 * k[c + 10]!;
    this.pz = b0 * k[c + 2]! + b1 * k[c + 5]! + b2 * k[c + 8]! + b3 * k[c + 11]!;
    const d0 = -3 * v * v;
    const d1 = 3 * v * v - 6 * u * v;
    const d2 = 6 * u * v - 3 * u * u;
    const d3 = 3 * u * u;
    this.fx = d0 * k[c]! + d1 * k[c + 3]! + d2 * k[c + 6]! + d3 * k[c + 9]!;
    this.fy = d0 * k[c + 1]! + d1 * k[c + 4]! + d2 * k[c + 7]! + d3 * k[c + 10]!;
    this.fz = d0 * k[c + 2]! + d1 * k[c + 5]! + d2 * k[c + 8]! + d3 * k[c + 11]!;
  }

  /** Writes sword i's matrix from the px … fz and scale fields: blade (+y) along the forward. */
  private write(i: number): void {
    let fx = this.fx;
    let fy = this.fy;
    let fz = this.fz;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // X = forward × reference (up, or +x when the blade is near vertical), Z = X × forward.
    const vertical = Math.abs(fy) > 0.95;
    let xx = vertical ? 0 : fz;
    let xy = vertical ? -fz : 0;
    let xz = vertical ? fy : -fx;
    const xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const zx = xy * fz - xz * fy;
    const zy = xz * fx - xx * fz;
    const zz = xx * fy - xy * fx;
    const s = this.scale;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const at = i * 16;
    m[at] = xx * s;
    m[at + 1] = xy * s;
    m[at + 2] = xz * s;
    m[at + 3] = 0;
    m[at + 4] = fx * s;
    m[at + 5] = fy * s;
    m[at + 6] = fz * s;
    m[at + 7] = 0;
    m[at + 8] = zx * s;
    m[at + 9] = zy * s;
    m[at + 10] = zz * s;
    m[at + 11] = 0;
    m[at + 12] = this.px;
    m[at + 13] = this.py;
    m[at + 14] = this.pz;
    m[at + 15] = 1;
    if (this.trails !== null) {
      const h = this.trails.heads;
      const tip = VAN_KIEM.lengthM * 0.5 * s;
      h[i * 4] = this.px + fx * tip;
      h[i * 4 + 1] = this.py + fy * tip;
      h[i * 4 + 2] = this.pz + fz * tip;
      h[i * 4 + 3] = s;
    }
  }

  private hide(i: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    m.fill(0, i * 16, i * 16 + 16);
    m[i * 16 + 15] = 1;
    if (this.trails !== null) this.trails.heads[i * 4 + 3] = 0;
  }

  update(dt: number): void {
    this.dt = Math.max(0, dt);
    this.impactCount = 0;
    this.sendQueued();
    for (let i = 0; i < this.high; i += 1) this.step(i);
    this.mesh.count = this.high;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.trails !== null) {
      this.trails.count = this.high;
      this.trails.stepS = this.dt;
      this.trails.sync();
    }
  }

  private sendQueued(): void {
    for (let q = 0; q < this.qLen; ) {
      this.qT[q] = this.qT[q]! - this.dt;
      if (this.qT[q]! > 0) {
        q += 1;
        continue;
      }
      this.volley(this.qCount[q]!, this.qPos[q * 4]!, this.qPos[q * 4 + 1]!, this.qPos[q * 4 + 2]!, this.qPos[q * 4 + 3]!);
      // Close the gap with the last entry.
      const last = --this.qLen;
      this.qT[q] = this.qT[last]!;
      this.qCount[q] = this.qCount[last]!;
      for (let k = 0; k < 4; k += 1) this.qPos[q * 4 + k] = this.qPos[last * 4 + k]!;
    }
  }

  private step(i: number): void {
    let phase = this.phase[i]!;
    if (phase === Phase.Free) {
      this.hide(i);
      return;
    }
    if (phase === Phase.Launch) {
      this.launch(i);
      phase = Phase.Waiting;
    }
    this.t[i] = this.t[i]! + this.dt;
    const t = this.t[i]!;
    if (phase === Phase.Waiting) {
      // Appears behind the caster, pointing up the climb.
      this.u = 0;
      this.curve(i);
      this.scale = Math.min(1, t / Math.max(0.05, this.delay[i]! + 0.05));
      if (t >= this.delay[i]!) {
        this.phase[i] = Phase.Flying;
        this.t[i] = 0;
      }
    } else if (phase === Phase.Flying) {
      const u = Math.min(1, t / this.dur[i]!);
      // Ease in: slow off the back, fast into the target.
      this.u = u * u * (1.6 - 0.6 * u);
      this.curve(i);
      this.scale = 1;
      if (u >= 1) {
        this.impactX[this.impactCount] = this.ctrl[i * 12 + 9]!;
        this.impactZ[this.impactCount] = this.ctrl[i * 12 + 11]!;
        this.impactCount += 1;
        this.phase[i] = Phase.Holding;
        this.t[i] = 0;
      }
    } else if (phase === Phase.Holding) {
      const c = i * 12;
      this.px = this.ctrl[c + 9]!;
      this.py = this.ctrl[c + 10]! + 0.2;
      this.pz = this.ctrl[c + 11]!;
      this.fx = 0;
      this.fy = -1;
      this.fz = 0.0001;
      this.scale = 1;
      if (t >= VAN_KIEM.holdS) {
        // The gather: from the struck point up and back to the caster's back.
        this.ctrl[c] = this.ctrl[c + 9]!;
        this.ctrl[c + 1] = this.ctrl[c + 10]! + 0.2;
        this.ctrl[c + 2] = this.ctrl[c + 11]!;
        this.ctrl[c + 3] = this.ctrl[c]!;
        this.ctrl[c + 4] = 4.5;
        this.ctrl[c + 5] = this.ctrl[c + 2]!;
        this.ctrl[c + 6] = this.home[i * 2]!;
        this.ctrl[c + 7] = 5;
        this.ctrl[c + 8] = this.home[i * 2 + 1]! + 1.5;
        this.ctrl[c + 9] = this.home[i * 2]!;
        this.ctrl[c + 10] = 2.2;
        this.ctrl[c + 11] = this.home[i * 2 + 1]! + 0.8;
        this.phase[i] = Phase.Gathering;
        this.t[i] = 0;
      }
    } else {
      const u = Math.min(1, t / VAN_KIEM.gatherS);
      this.u = u;
      this.curve(i);
      // Folds away as it comes home.
      this.scale = 1 - u * u;
      if (u >= 1) {
        this.release(i);
        this.hide(i);
        return;
      }
    }
    this.write(i);
  }

  drawCalls(): number {
    return (this.high > 0 ? 1 : 0) + (this.trails?.drawCalls() ?? 0);
  }

  triangles(): number {
    const index = this.mesh.geometry.getIndex();
    const tris = (index !== null ? index.count : this.mesh.geometry.getAttribute("position").count) / 3;
    return this.high * tris;
  }

  textureBytes(): number {
    return this.trails?.textureBytes() ?? 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.trails?.dispose();
  }
}

/** The shared sword pool of the tier (`pool` swords: TT_BUDGETS swords, 150 / 300 / 500). */
export function createSwords(renderer: Renderer3D, pool: number, options: SwordOptions = {}): SwordPool {
  return new SwordPoolImpl(renderer, pool, options);
}
