/**
 * Resamples clips from their 24 fps linear keys to 60 fps (MOTION_PLAN step
 * 2.4, appendix B #24): quaternions by squad (C¹ through the keys), positions
 * by Catmull-Rom. Done once at load, in memory; the GLB is not changed.
 * Constant and STEP tracks are kept as they are.
 */
import * as THREE from "three";

const _a = new THREE.Quaternion();
const _b = new THREE.Quaternion();
const _c = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _t1 = new THREE.Quaternion();
const _l1 = new THREE.Vector3();
const _l2 = new THREE.Vector3();

function log(q: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
  if (s < 1e-9) return out.set(q.x, q.y, q.z);
  const h = Math.atan2(s, q.w) / s;
  return out.set(q.x * h, q.y * h, q.z * h);
}

function exp(v: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const h = v.length();
  if (h < 1e-9) return out.set(v.x, v.y, v.z, 1).normalize();
  const s = Math.sin(h) / h;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(h));
}

/** Squad inner control point of key `q` between `prev` and `next`: q·exp(−(log(q⁻¹·next) + log(q⁻¹·prev)) / 4). */
function control(prev: THREE.Quaternion, q: THREE.Quaternion, next: THREE.Quaternion, out: THREE.Quaternion): THREE.Quaternion {
  _inv.copy(q).invert();
  log(_t1.copy(_inv).multiply(next), _l1);
  log(_t1.copy(_inv).multiply(prev), _l2);
  _l1.add(_l2).multiplyScalar(-0.25);
  return out.copy(q).multiply(exp(_l1, _t1));
}

function isConstant(values: ArrayLike<number>, stride: number): boolean {
  for (let i = stride; i < values.length; i += 1) if (Math.abs(values[i]! - values[i % stride]!) > 1e-6) return false;
  return true;
}

function resampleQuat(track: THREE.KeyframeTrack, times: Float32Array, loop: boolean): THREE.QuaternionKeyframeTrack {
  const T = track.times;
  const V = track.values;
  const n = T.length;
  // Keys on one hemisphere, so every segment takes the short way.
  const keys: THREE.Quaternion[] = [];
  for (let i = 0; i < n; i += 1) {
    const q = new THREE.Quaternion(V[i * 4]!, V[i * 4 + 1]!, V[i * 4 + 2]!, V[i * 4 + 3]!).normalize();
    if (i > 0 && q.dot(keys[i - 1]!) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    keys.push(q);
  }
  // A loop whose last key repeats the first wraps its neighbours.
  const wraps = loop && n > 3 && Math.abs(keys[0]!.dot(keys[n - 1]!)) > 0.9999;
  const at = (i: number): THREE.Quaternion => {
    if (i < 0) return wraps ? keys[n - 2]! : keys[0]!;
    if (i >= n) return wraps ? keys[1]! : keys[n - 1]!;
    return keys[i]!;
  };
  const ctrl: THREE.Quaternion[] = keys.map((q, i) => {
    if (!wraps && (i === 0 || i === n - 1)) return q.clone();
    const prev = at(i - 1).clone();
    const next = at(i + 1).clone();
    if (prev.dot(q) < 0) prev.set(-prev.x, -prev.y, -prev.z, -prev.w);
    if (next.dot(q) < 0) next.set(-next.x, -next.y, -next.z, -next.w);
    return control(prev, q, next, new THREE.Quaternion());
  });
  const out = new Float32Array(times.length * 4);
  let seg = 0;
  for (let k = 0; k < times.length; k += 1) {
    const t = times[k]!;
    while (seg < n - 2 && t > T[seg + 1]!) seg += 1;
    const t0 = T[seg]!;
    const t1 = T[Math.min(n - 1, seg + 1)]!;
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const q0 = keys[seg]!;
    const q1 = keys[Math.min(n - 1, seg + 1)]!;
    const s0 = ctrl[seg]!;
    const s1 = ctrl[Math.min(n - 1, seg + 1)]!;
    // squad(q0, q1, s0, s1, u) = slerp(slerp(q0, q1, u), slerp(s0, s1, u), 2u(1 − u))
    _a.slerpQuaternions(q0, q1, u);
    _b.slerpQuaternions(s0, s1, u);
    _c.slerpQuaternions(_a, _b, 2 * u * (1 - u)).normalize();
    if (k > 0) {
      const d = out[(k - 1) * 4]! * _c.x + out[(k - 1) * 4 + 1]! * _c.y + out[(k - 1) * 4 + 2]! * _c.z + out[(k - 1) * 4 + 3]! * _c.w;
      if (d < 0) _c.set(-_c.x, -_c.y, -_c.z, -_c.w);
    }
    _c.toArray(out, k * 4);
  }
  return new THREE.QuaternionKeyframeTrack(track.name, Array.from(times), Array.from(out));
}

function resampleVec(track: THREE.KeyframeTrack, times: Float32Array, loop: boolean): THREE.VectorKeyframeTrack {
  const T = track.times;
  const V = track.values;
  const n = T.length;
  const wraps = loop && n > 3 && Math.abs(V[0]! - V[(n - 1) * 3]!) + Math.abs(V[1]! - V[(n - 1) * 3 + 1]!) + Math.abs(V[2]! - V[(n - 1) * 3 + 2]!) < 1e-5;
  const idx = (i: number): number => (i < 0 ? (wraps ? n - 2 : 0) : i >= n ? (wraps ? 1 : n - 1) : i);
  const out = new Float32Array(times.length * 3);
  let seg = 0;
  for (let k = 0; k < times.length; k += 1) {
    const t = times[k]!;
    while (seg < n - 2 && t > T[seg + 1]!) seg += 1;
    const t0 = T[seg]!;
    const t1 = T[Math.min(n - 1, seg + 1)]!;
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const i0 = idx(seg - 1);
    const i1 = idx(seg);
    const i2 = idx(seg + 1);
    const i3 = idx(seg + 2);
    const u2 = u * u;
    const u3 = u2 * u;
    for (let d = 0; d < 3; d += 1) {
      const p0 = V[i0 * 3 + d]!;
      const p1 = V[i1 * 3 + d]!;
      const p2 = V[i2 * 3 + d]!;
      const p3 = V[i3 * 3 + d]!;
      out[k * 3 + d] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    }
  }
  return new THREE.VectorKeyframeTrack(track.name, Array.from(times), Array.from(out));
}

/** A copy of `clip` with its moving rotation and position tracks resampled to `fps` (squad, Catmull-Rom). */
export function resampleClip(clip: THREE.AnimationClip, loop: boolean, fps = 60): THREE.AnimationClip {
  const dur = clip.duration;
  const n = Math.max(1, Math.round(dur * fps));
  const times = new Float32Array(n + 1);
  for (let k = 0; k <= n; k += 1) times[k] = (k * dur) / n;
  const tracks = clip.tracks.map((track) => {
    const interp = track.getInterpolation();
    const linear = interp === THREE.InterpolateLinear;
    if (!linear || track.times.length < 3) return track.clone();
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      if (isConstant(track.values, 4)) return track.clone();
      return resampleQuat(track, times, loop);
    }
    if (track instanceof THREE.VectorKeyframeTrack && track.name.endsWith(".position")) {
      if (isConstant(track.values, 3)) return track.clone();
      return resampleVec(track, times, loop);
    }
    return track.clone();
  });
  return new THREE.AnimationClip(clip.name, dur, tracks);
}
