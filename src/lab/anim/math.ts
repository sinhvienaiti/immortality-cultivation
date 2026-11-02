/**
 * Springs, easing and quaternion helpers for the lab Animator (MOTION_PLAN
 * step 2, appendix C §2.2–2.3). Springs follow Holden ("Spring-It-On",
 * "Spring roll call"): exact critically damped updates written by half-life,
 * so they are frame-rate independent. Nothing here allocates per call.
 */
import * as THREE from "three";

export const LN2 = Math.LN2;
export const DEG = Math.PI / 180;

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(x: number): number {
  const t = 1 - clamp01(x);
  return 1 - t * t * t;
}

export function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Exact damper: moves `x` towards `g`, halving the gap every `halflife` seconds. */
export function damp(x: number, g: number, halflife: number, dt: number): number {
  return x + (g - x) * (1 - Math.exp((-LN2 * dt) / (halflife + 1e-5)));
}

/** The `y` of a critically damped spring with this half-life (Holden: damping / 2). */
export function springY(halflife: number): number {
  return (2 * LN2) / (halflife + 1e-5);
}

/**
 * Critically damped spring towards `goal` (state x, v at `o`, `o + 1` of `s`).
 * No overshoot; velocity stays continuous when the goal jumps.
 */
export function criticalSpring(s: Float64Array | Float32Array, o: number, goal: number, halflife: number, dt: number): void {
  const y = springY(halflife);
  const j0 = s[o]! - goal;
  const j1 = s[o + 1]! + j0 * y;
  const e = Math.exp(-y * dt);
  s[o] = e * (j0 + j1 * dt) + goal;
  s[o + 1] = e * (s[o + 1]! - j1 * y * dt);
}

/** Critically damped decay to 0 of offset x and its velocity v (component `i` of offsets `x`, velocities `v`). */
export function decaySpring(x: Float32Array, v: Float32Array, i: number, y: number, e: number, dt: number): void {
  const j1 = v[i]! + x[i]! * y;
  x[i] = e * (x[i]! + j1 * dt);
  v[i] = e * (v[i]! - j1 * y * dt);
}

/**
 * Damped spring with its own frequency and damping ratio (recoil, overshoot),
 * semi-implicit Euler in sub-steps of at most 1/240 s. State x, v at `o`.
 */
export function underdampedSpring(s: Float64Array, o: number, goal: number, freqHz: number, zeta: number, dt: number): void {
  const k = (2 * Math.PI * freqHz) ** 2;
  const c = zeta * 2 * Math.sqrt(k);
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i += 1) {
    const a = -k * (s[o]! - goal) - c * s[o + 1]!;
    s[o + 1] = s[o + 1]! + a * h;
    s[o] = s[o]! + s[o + 1]! * h;
  }
}

/** Quaternion → scaled angle axis (angle × axis, shortest arc) into out[o..o+2]. */
export function quatToAngleAxis(x: number, y: number, z: number, w: number, out: Float32Array, o: number): void {
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-9) {
    out[o] = 2 * x;
    out[o + 1] = 2 * y;
    out[o + 2] = 2 * z;
    return;
  }
  const a = (2 * Math.atan2(s, w)) / s;
  out[o] = x * a;
  out[o + 1] = y * a;
  out[o + 2] = z * a;
}

/** Scaled angle axis → quaternion. */
export function angleAxisToQuat(ax: number, ay: number, az: number, q: THREE.Quaternion): THREE.Quaternion {
  const a = Math.sqrt(ax * ax + ay * ay + az * az);
  if (a < 1e-9) return q.set(ax * 0.5, ay * 0.5, az * 0.5, 1).normalize();
  const h = a * 0.5;
  const s = Math.sin(h) / a;
  return q.set(ax * s, ay * s, az * s, Math.cos(h));
}

/** log of a unit quaternion (half-angle × axis) into v. */
export function quatLog(q: THREE.Quaternion, v: THREE.Vector3): THREE.Vector3 {
  const s = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
  if (s < 1e-9) return v.set(q.x, q.y, q.z);
  const h = Math.atan2(s, q.w) / s;
  return v.set(q.x * h, q.y * h, q.z * h);
}

/** exp of a pure quaternion v (half-angle × axis). */
export function quatExp(v: THREE.Vector3, q: THREE.Quaternion): THREE.Quaternion {
  const h = v.length();
  if (h < 1e-9) return q.set(v.x, v.y, v.z, 1).normalize();
  const s = Math.sin(h) / h;
  return q.set(v.x * s, v.y * s, v.z * s, Math.cos(h));
}

/** Angle (rad) between two unit quaternions. */
export function quatAngle(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const d = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return 2 * Math.acos(d);
}

/** Small deterministic RNG for the lab (mulberry32): fidget timing, breathing phase. */
export class LabRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
