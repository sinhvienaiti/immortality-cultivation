/**
 * Arms-out check for the skills lab (dev-only; motion round 2, both judges:
 * "arms held out after K5"). Each drawn frame it measures how far each upper
 * arm is abducted: the angle of shoulder → elbow from hanging down, in the
 * torso's coronal plane (lateral from the shoulder line, up from pelvis →
 * neck): 0° hanging, 90° straight out to the side, 180° overhead. An arm that
 * points mostly forward or back (its coronal share under 0.5) counts as 0°,
 * so a thrust is not "out". A frame is flagged when both arms are past 70°;
 * a run of more than 3 flagged frames outside an intended pose (the Animator
 * says when it holds one on purpose, the K5 sky salute) is a failure.
 * Read after the frame is drawn (fresh world matrices). No allocation per
 * frame; the report allocates.
 */
import * as THREE from "three";

export const ARMS_OUT = {
  /** Both upper arms abducted past this (deg). */
  deg: 70,
  /** More than this many frames running is a hold. */
  frames: 3,
} as const;

const CAP = 1 << 14;
const DEG = 180 / Math.PI;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _up = new THREE.Vector3();
const _d = new THREE.Vector3();

export interface ArmRun {
  /** First frame, length (frames), peak of the lower arm's angle (deg), intended. */
  f: number;
  n: number;
  peakDeg: number;
  intended: boolean;
}

export class ArmCheck {
  private readonly upper: [THREE.Object3D, THREE.Object3D] | null;
  private readonly lower: [THREE.Object3D, THREE.Object3D] | null;
  private readonly pelvis: THREE.Object3D | null;
  private readonly neck: THREE.Object3D | null;
  private readonly abdL = new Float32Array(CAP);
  private readonly abdR = new Float32Array(CAP);
  private readonly intent = new Uint8Array(CAP);
  private last = -1;

  constructor(model: THREE.Object3D) {
    const get = (n: string): THREE.Object3D | null => model.getObjectByName(n) ?? null;
    const ul = get("upperarm_l");
    const ur = get("upperarm_r");
    const ll = get("lowerarm_l");
    const lr = get("lowerarm_r");
    this.upper = ul && ur ? [ul, ur] : null;
    this.lower = ll && lr ? [ll, lr] : null;
    this.pelvis = get("pelvis");
    this.neck = get("neck_01") ?? get("head");
  }

  reset(): void {
    this.last = -1;
  }

  /** Probe frame `f` (what was drawn): both arms' abduction, and whether the pose is held on purpose. */
  sample(f: number, intended: boolean): void {
    if (f < 0 || f >= CAP || !this.upper || !this.lower || !this.pelvis || !this.neck) return;
    // Lateral: left shoulder → right shoulder; up: pelvis → neck, made orthogonal to it.
    this.upper[0].getWorldPosition(_a);
    this.upper[1].getWorldPosition(_b);
    _lat.subVectors(_b, _a).normalize();
    this.pelvis.getWorldPosition(_a);
    this.neck.getWorldPosition(_b);
    _up.subVectors(_b, _a);
    _up.addScaledVector(_lat, -_up.dot(_lat)).normalize();
    for (let s = 0; s < 2; s += 1) {
      this.upper[s]!.getWorldPosition(_a);
      this.lower[s]!.getWorldPosition(_b);
      _d.subVectors(_b, _a).normalize();
      // Outward: towards the arm's own side (left arm: −lateral).
      const out = _d.dot(_lat) * (s === 0 ? -1 : 1);
      const up = _d.dot(_up);
      const share = Math.hypot(out, up);
      const deg = share < 0.5 ? 0 : Math.atan2(out, -up) * DEG;
      if (s === 0) this.abdL[f] = deg;
      else this.abdR[f] = deg;
    }
    this.intent[f] = intended ? 1 : 0;
    this.last = Math.max(this.last, f);
  }

  /** Runs of both arms past ARMS_OUT.deg, the failing ones (> ARMS_OUT.frames, not intended), and per-frame angles. */
  report(): Record<string, unknown> {
    const n = this.last + 1;
    const runs: ArmRun[] = [];
    let start = -1;
    let peak = 0;
    let intendedAll = true;
    let maxBoth = 0;
    let maxBothF = -1;
    const close = (end: number): void => {
      if (start >= 0) runs.push({ f: start, n: end - start, peakDeg: Math.round(peak * 10) / 10, intended: intendedAll });
      start = -1;
    };
    for (let f = 0; f < n; f += 1) {
      const both = Math.min(this.abdL[f]!, this.abdR[f]!);
      if (both > maxBoth) {
        maxBoth = both;
        maxBothF = f;
      }
      if (both > ARMS_OUT.deg) {
        if (start < 0) {
          start = f;
          peak = 0;
          intendedAll = true;
        }
        peak = Math.max(peak, both);
        if (!this.intent[f]) intendedAll = false;
      } else close(f);
    }
    close(n);
    // A run partly intended fails on its unintended frames only when those run longer than the limit.
    let failFrames = 0;
    let failRuns = 0;
    for (const r of runs) {
      let k = 0;
      let longest = 0;
      for (let f = r.f; f < r.f + r.n; f += 1) {
        k = this.intent[f] ? 0 : k + 1;
        longest = Math.max(longest, k);
      }
      if (longest > ARMS_OUT.frames) {
        failRuns += 1;
        failFrames += longest;
      }
    }
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    return {
      gate: ARMS_OUT,
      frames: n,
      flaggedFrames: runs.reduce((s, r) => s + r.n, 0),
      failRuns,
      failFrames,
      maxBothDeg: r1(maxBoth),
      maxBothF,
      runs,
      series: { abdL: Array.from(this.abdL.subarray(0, n), r1), abdR: Array.from(this.abdR.subarray(0, n), r1), intended: Array.from(this.intent.subarray(0, n)) },
    };
  }
}
