/**
 * Per-bone inertialization (CHARACTER_ANIMATION §5.5 tier H, MOTION_PLAN
 * step 2.2; Bollo GDC 2018, Holden "Dead Blending" / "Spring Roll Call").
 * On a transition the base pose switches at once to the new clip; the
 * difference between what was on screen (extrapolated one frame) and the new
 * pose is stored per bone as a rotation offset with its velocity, and decays
 * with a critically damped spring. Only one clip is evaluated per frame, the
 * pose and its velocity stay continuous, and nothing falls back to the bind
 * pose (the old `crossFadeTo` + `finished` path did).
 *
 * Offsets are scaled angle-axis vectors applied on the left (q = exp(off)·q).
 * The pelvis position offset is decayed the same way. No allocation per frame.
 */
import * as THREE from "three";
import { angleAxisToQuat, decaySpring, quatToAngleAxis, springY } from "./math";

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _d = new THREE.Quaternion();
const _tmp = new Float32Array(3);

export class Inertializer {
  /** Rotation offsets and their velocities (bones × 3). */
  private readonly offQ: Float32Array;
  private readonly offV: Float32Array;
  /** Pelvis position offset and velocity. */
  private readonly offP = new Float32Array(3);
  private readonly offPV = new Float32Array(3);
  /** The displayed base pose of the last two frames (after offsets), for the source pose and its velocity. */
  private readonly shownQ: Float32Array;
  private readonly prevQ: Float32Array;
  private readonly shownP = new Float32Array(3);
  private readonly prevP = new Float32Array(3);
  /** Angular velocity of the shown pose (bones × 3, rad/s, left frame). */
  private readonly shownW: Float32Array;
  private readonly shownPV = new Float32Array(3);
  private has = false;
  private halflife = 0.08;
  /** Remaining offset size (rad, largest bone) and that bone, for checks. */
  residual = 0;
  residualBone = -1;

  constructor(
    private readonly n: number,
    private readonly pelvis: number,
  ) {
    this.offQ = new Float32Array(n * 3);
    this.offV = new Float32Array(n * 3);
    this.shownQ = new Float32Array(n * 4);
    this.prevQ = new Float32Array(n * 4);
    this.shownW = new Float32Array(n * 3);
  }

  reset(): void {
    this.offQ.fill(0);
    this.offV.fill(0);
    this.offP.fill(0);
    this.offPV.fill(0);
    this.has = false;
    this.residual = 0;
  }

  /**
   * A transition this frame: the new base pose `q`, `p` (bones × 4, × 3) with
   * its velocity from `qPrev`, `pPrev` sampled `h` seconds earlier. The shown
   * pose (last frame + its velocity × dt) becomes the start; the offset
   * decays with `halflife` from the next frame.
   */
  transition(q: Float32Array, p: Float32Array, qPrev: Float32Array, pPrev: Float32Array, h: number, dt: number, halflife: number): void {
    this.halflife = halflife;
    if (!this.has) return;
    const n = this.n;
    const inv = h > 0 ? 1 / h : 0;
    for (let i = 0; i < n; i += 1) {
      const o4 = i * 4;
      const o3 = i * 3;
      // Source: shown pose extrapolated by its own velocity over dt.
      angleAxisToQuat(this.shownW[o3]! * dt, this.shownW[o3 + 1]! * dt, this.shownW[o3 + 2]! * dt, _d);
      _q.set(this.shownQ[o4]!, this.shownQ[o4 + 1]!, this.shownQ[o4 + 2]!, this.shownQ[o4 + 3]!);
      _q.premultiply(_d);
      // Destination.
      _r.set(q[o4]!, q[o4 + 1]!, q[o4 + 2]!, q[o4 + 3]!);
      // off = src·dst⁻¹
      _q.multiply(_r.invert());
      quatToAngleAxis(_q.x, _q.y, _q.z, _q.w, this.offQ, o3);
      // Destination velocity: log(dst·dstPrev⁻¹)/h.
      _r.set(q[o4]!, q[o4 + 1]!, q[o4 + 2]!, q[o4 + 3]!);
      _q.set(qPrev[o4]!, qPrev[o4 + 1]!, qPrev[o4 + 2]!, qPrev[o4 + 3]!).invert();
      _r.multiply(_q);
      quatToAngleAxis(_r.x, _r.y, _r.z, _r.w, _tmp, 0);
      this.offV[o3] = this.shownW[o3]! - _tmp[0]! * inv;
      this.offV[o3 + 1] = this.shownW[o3 + 1]! - _tmp[1]! * inv;
      this.offV[o3 + 2] = this.shownW[o3 + 2]! - _tmp[2]! * inv;
    }
    if (this.pelvis >= 0) {
      const o = this.pelvis * 3;
      for (let k = 0; k < 3; k += 1) {
        this.offP[k] = this.shownP[k]! + this.shownPV[k]! * dt - p[o + k]!;
        this.offPV[k] = this.shownPV[k]! - (p[o + k]! - pPrev[o + k]!) * inv;
      }
    }
  }

  /**
   * Decays the offsets by dt (skipped on a transition frame) and applies them
   * to the base pose in place; records the shown pose and its velocity.
   */
  apply(q: Float32Array, p: Float32Array, dt: number, decay: boolean): void {
    const n = this.n;
    if (decay && dt > 0) {
      const y = springY(this.halflife);
      const e = Math.exp(-y * dt);
      for (let i = 0; i < n * 3; i += 1) decaySpring(this.offQ, this.offV, i, y, e, dt);
      for (let k = 0; k < 3; k += 1) decaySpring(this.offP, this.offPV, k, y, e, dt);
    }
    let res = 0;
    let resBone = -1;
    for (let i = 0; i < n; i += 1) {
      const o4 = i * 4;
      const o3 = i * 3;
      const ax = this.offQ[o3]!;
      const ay = this.offQ[o3 + 1]!;
      const az = this.offQ[o3 + 2]!;
      const a2 = ax * ax + ay * ay + az * az;
      if (a2 > 1e-12) {
        if (a2 > res) {
          res = a2;
          resBone = i;
        }
        angleAxisToQuat(ax, ay, az, _d);
        _q.set(q[o4]!, q[o4 + 1]!, q[o4 + 2]!, q[o4 + 3]!).premultiply(_d).normalize();
        q[o4] = _q.x;
        q[o4 + 1] = _q.y;
        q[o4 + 2] = _q.z;
        q[o4 + 3] = _q.w;
      }
    }
    this.residual = Math.sqrt(res);
    this.residualBone = resBone;
    if (this.pelvis >= 0) {
      const o = this.pelvis * 3;
      p[o] = p[o]! + this.offP[0]!;
      p[o + 1] = p[o + 1]! + this.offP[1]!;
      p[o + 2] = p[o + 2]! + this.offP[2]!;
    }
    // Shown pose and its velocity.
    const inv = dt > 0 ? 1 / dt : 0;
    this.prevQ.set(this.shownQ);
    this.shownQ.set(q);
    if (this.has && dt > 0) {
      for (let i = 0; i < n; i += 1) {
        const o4 = i * 4;
        _q.set(this.shownQ[o4]!, this.shownQ[o4 + 1]!, this.shownQ[o4 + 2]!, this.shownQ[o4 + 3]!);
        _r.set(this.prevQ[o4]!, this.prevQ[o4 + 1]!, this.prevQ[o4 + 2]!, this.prevQ[o4 + 3]!).invert();
        _q.multiply(_r);
        quatToAngleAxis(_q.x, _q.y, _q.z, _q.w, this.shownW, i * 3);
        this.shownW[i * 3] = this.shownW[i * 3]! * inv;
        this.shownW[i * 3 + 1] = this.shownW[i * 3 + 1]! * inv;
        this.shownW[i * 3 + 2] = this.shownW[i * 3 + 2]! * inv;
      }
    } else this.shownW.fill(0);
    if (this.pelvis >= 0) {
      const o = this.pelvis * 3;
      this.prevP.set(this.shownP);
      this.shownP[0] = p[o]!;
      this.shownP[1] = p[o + 1]!;
      this.shownP[2] = p[o + 2]!;
      for (let k = 0; k < 3; k += 1) this.shownPV[k] = this.has && dt > 0 ? (this.shownP[k]! - this.prevP[k]!) * inv : 0;
    }
    this.has = true;
  }
}
