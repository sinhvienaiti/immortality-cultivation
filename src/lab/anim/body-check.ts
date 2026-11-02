/**
 * Body heading check for the skills lab (dev-only; motion round 3, both round-2
 * judges: "the body turns ~150° in 4 frames", "head and torso should lead a
 * turn by 4–6 frames"). The probe measures the root's turn only; this reads
 * what was drawn above it each frame: the chest (spine_03) and the head, each
 * as a heading on the ground from a forward axis calibrated on the first frame
 * (local axis that pointed along the facing), so the rig's axes do not matter.
 *
 * Report: the fastest chest and head turn (deg/s) and the largest heading
 * change over any 4 frames, frames over the cap (720°/s), and per turn episode
 * of the root (its heading moving > 40°/s for ≥ 6 frames) how many frames the
 * chest and head reached half of the turn before the root did (the lead).
 * Read after the frame is drawn (fresh world matrices). No allocation per
 * frame; the report allocates.
 */
import * as THREE from "three";

/** Heading speed cap (deg/s) the round-2 judges asked for (600–720 with easing). */
export const TURN_CAP_DEG_S = 720;

const CAP = 1 << 14;
const RAD = 180 / Math.PI;

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function wrap180(a: number): number {
  let x = a;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

export class BodyCheck {
  private readonly chest: THREE.Object3D | null;
  private readonly head: THREE.Object3D | null;
  private readonly chestFwd = new THREE.Vector3();
  private readonly headFwd = new THREE.Vector3();
  private calibrated = false;
  /** Unwrapped headings (deg) per frame: root, chest, head; and dt. */
  private readonly root = new Float32Array(CAP);
  private readonly chestH = new Float32Array(CAP);
  private readonly headH = new Float32Array(CAP);
  private readonly dt = new Float32Array(CAP);
  private last = -1;

  constructor(model: THREE.Object3D) {
    this.chest = model.getObjectByName("spine_03") ?? null;
    this.head = model.getObjectByName("head") ?? null;
  }

  reset(): void {
    this.last = -1;
  }

  private heading(bone: THREE.Object3D, fwd: THREE.Vector3): number {
    bone.matrixWorld.decompose(_p, _q, _s);
    _v.copy(fwd).applyQuaternion(_q);
    return Math.atan2(_v.x, _v.z) * RAD;
  }

  /** Probe frame `f` was drawn with the root facing (fx, fz) after a step of `dt` seconds. */
  sample(f: number, fx: number, fz: number, dt: number): void {
    if (f < 0 || f >= CAP || !this.chest || !this.head) return;
    if (!this.calibrated) {
      // The local axis of each bone that points along the facing now (Idle: chest and head face forward).
      for (const [bone, out] of [
        [this.chest, this.chestFwd],
        [this.head, this.headFwd],
      ] as const) {
        bone.matrixWorld.decompose(_p, _q, _s);
        out.set(fx, 0, fz).applyQuaternion(_q.invert()).normalize();
      }
      this.calibrated = true;
    }
    const r = Math.atan2(fx, fz) * RAD;
    const c = this.heading(this.chest, this.chestFwd);
    const h = this.heading(this.head, this.headFwd);
    if (f > 0 && this.last === f - 1) {
      // Unwrapped: continue from last frame's value.
      this.root[f] = this.root[f - 1]! + wrap180(r - this.root[f - 1]!);
      this.chestH[f] = this.chestH[f - 1]! + wrap180(c - this.chestH[f - 1]!);
      this.headH[f] = this.headH[f - 1]! + wrap180(h - this.headH[f - 1]!);
    } else {
      this.root[f] = r;
      this.chestH[f] = c;
      this.headH[f] = h;
    }
    this.dt[f] = dt;
    this.last = f;
  }

  report(): Record<string, unknown> {
    const n = this.last + 1;
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const part = (s: Float32Array): Record<string, number> => {
      let maxRate = 0;
      let maxRateF = -1;
      let over = 0;
      let max4 = 0;
      let max4F = -1;
      for (let f = 1; f < n; f += 1) {
        const dt = this.dt[f]! > 1e-6 ? this.dt[f]! : 1 / 60;
        const rate = Math.abs(s[f]! - s[f - 1]!) / dt;
        if (rate > maxRate) {
          maxRate = rate;
          maxRateF = f;
        }
        if (rate > TURN_CAP_DEG_S) over += 1;
        if (f >= 4) {
          const d4 = Math.abs(s[f]! - s[f - 4]!);
          if (d4 > max4) {
            max4 = d4;
            max4F = f;
          }
        }
      }
      return { maxDegS: r1(maxRate), maxF: maxRateF, framesOverCap: over, max4FramesDeg: r1(max4), max4F };
    };
    // Turn episodes of the root: heading moving faster than 40°/s for at least 6 frames.
    const episodes: Record<string, number>[] = [];
    let start = -1;
    const close = (end: number): void => {
      if (start < 0 || end - start < 6) {
        start = -1;
        return;
      }
      const a = Math.max(0, start - 12);
      const b = Math.min(n - 1, end + 12);
      const turn = this.root[b]! - this.root[a]!;
      const half = (s: Float32Array): number => {
        const s0 = s[a]!;
        for (let f = a; f <= b; f += 1) if (Math.abs(s[f]! - s0) >= Math.abs(turn) * 0.5) return f;
        return b;
      };
      const tr = half(this.root);
      episodes.push({ f: start, frames: end - start, turnDeg: r1(turn), chestLeadFrames: tr - half(this.chestH), headLeadFrames: tr - half(this.headH) });
      start = -1;
    };
    for (let f = 1; f < n; f += 1) {
      const dt = this.dt[f]! > 1e-6 ? this.dt[f]! : 1 / 60;
      const moving = Math.abs(this.root[f]! - this.root[f - 1]!) / dt > 40;
      if (moving && start < 0) start = f;
      else if (!moving && start >= 0) close(f);
    }
    close(n);
    const big = episodes.filter((e) => Math.abs(e.turnDeg!) >= 45);
    const mean = (k: string): number => (big.length > 0 ? r1(big.reduce((s, e) => s + e[k]!, 0) / big.length) : 0);
    return {
      capDegS: TURN_CAP_DEG_S,
      frames: n,
      chest: part(this.chestH),
      head: part(this.headH),
      root: part(this.root),
      turns: episodes,
      meanLeadFrames: { chest: mean("chestLeadFrames"), head: mean("headLeadFrames"), turns: big.length },
      series: { root: Array.from(this.root.subarray(0, n), r1), chest: Array.from(this.chestH.subarray(0, n), r1), head: Array.from(this.headH.subarray(0, n), r1) },
    };
  }
}
