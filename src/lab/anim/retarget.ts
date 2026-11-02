/**
 * Retargets a clip between two rigs that share bone names (Mesh2Motion's
 * human rig → Lam; MOTION_PLAN step 2 "missing clips"), in memory at load.
 *
 * Bone rolls and rest poses differ (Mesh2Motion rests in a T-pose, Lam in an
 * A-pose; thigh and foot axes differ by up to 178°), so local rotations are
 * not copied. Per bone, in armature space (the rig's top node removed, so
 * both face +z): the source rest is first turned so the bone points where
 * the target's bone points at rest (A = fromUnitVectors(src dir, tgt dir));
 * the source's world rotation relative to that aligned rest is then applied
 * to the target's rest: Wt(t) = Ws(t)·(A·Ws_rest)⁻¹·Wt_rest, and local
 * rotations come back through the target's parents. The pelvis offset from
 * rest scales by the hip-height ratio. Bones the source lacks (tail, ears,
 * bag) take `fill`. Retargeted at the source keys, then resampled to 60 fps.
 */
import * as THREE from "three";
import { resampleClip } from "./resample";
import { ClipSampler, Rig } from "./rig";

/** Direction child per bone (the bone points at it); bones without one borrow their parent's alignment. */
const DIRECTION_CHILD: Record<string, string> = {
  pelvis: "spine_01",
  spine_01: "spine_02",
  spine_02: "spine_03",
  spine_03: "neck_01",
  neck_01: "head",
  clavicle_l: "upperarm_l",
  upperarm_l: "lowerarm_l",
  lowerarm_l: "hand_l",
  clavicle_r: "upperarm_r",
  upperarm_r: "lowerarm_r",
  lowerarm_r: "hand_r",
  thigh_l: "calf_l",
  calf_l: "foot_l",
  foot_l: "ball_l",
  thigh_r: "calf_r",
  calf_r: "foot_r",
  foot_r: "ball_r",
};

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Armature-space FK over flat local arrays (parents first; scale 1 inside the armature). */
function fk(rig: Rig, q: Float32Array, p: Float32Array, wq: Float32Array, wp: Float32Array): void {
  for (let i = 0; i < rig.count; i += 1) {
    const par = rig.parent[i]!;
    _q.fromArray(q, i * 4);
    _v.fromArray(p, i * 3);
    if (par < 0) {
      _q.toArray(wq, i * 4);
      _v.toArray(wp, i * 3);
      continue;
    }
    _r.fromArray(wq, par * 4);
    _v.applyQuaternion(_r);
    wp[i * 3] = wp[par * 3]! + _v.x;
    wp[i * 3 + 1] = wp[par * 3 + 1]! + _v.y;
    wp[i * 3 + 2] = wp[par * 3 + 2]! + _v.z;
    _r.multiply(_q).toArray(wq, i * 4);
  }
}

export interface RetargetOptions {
  /** Target local rotations (bones × 4) for bones the source lacks; default the target rest. */
  fill?: Float32Array;
  loop: boolean;
  name?: string;
}

export function retargetClip(src: Rig, clip: THREE.AnimationClip, tgt: Rig, opts: RetargetOptions): THREE.AnimationClip {
  const ns = src.count;
  const nt = tgt.count;
  // Rest poses in armature space.
  const sWqRest = new Float32Array(ns * 4);
  const sWpRest = new Float32Array(ns * 3);
  fk(src, src.restQ, src.restP, sWqRest, sWpRest);
  const tWqRest = new Float32Array(nt * 4);
  const tWpRest = new Float32Array(nt * 3);
  fk(tgt, tgt.restQ, tgt.restP, tWqRest, tWpRest);

  // Map target bone → source bone, and each mapped bone's aligned source rest inverse (A·Ws_rest)⁻¹.
  const map = new Int16Array(nt).fill(-1);
  const align: (THREE.Quaternion | null)[] = new Array(nt).fill(null);
  for (let i = 0; i < nt; i += 1) {
    const s = src.find(tgt.names[i]!);
    if (s < 0) continue;
    map[i] = s;
  }
  const a = new THREE.Quaternion();
  const ds = new THREE.Vector3();
  const dt = new THREE.Vector3();
  /** A for bone i: from its own direction child, else the nearest ancestor's (hands, head, toes). */
  const alignFor = (i: number): THREE.Quaternion => {
    a.set(0, 0, 0, 1);
    for (let b = i; b >= 0; b = tgt.parent[b]!) {
      const sb = map[b]!;
      const childName = DIRECTION_CHILD[tgt.names[b]!];
      const tc = childName ? tgt.find(childName) : -1;
      const sc = childName ? src.find(childName) : -1;
      if (sb < 0 || tc < 0 || sc < 0) continue;
      ds.fromArray(sWpRest, sc * 3).sub(_v.fromArray(sWpRest, sb * 3)).normalize();
      dt.fromArray(tWpRest, tc * 3).sub(_v.fromArray(tWpRest, b * 3)).normalize();
      return a.setFromUnitVectors(ds, dt);
    }
    return a;
  };
  for (let i = 0; i < nt; i += 1) {
    const s = map[i]!;
    if (s < 0) continue;
    // (A·Ws_rest)⁻¹
    align[i] = alignFor(i).clone().multiply(_q.fromArray(sWqRest, s * 4)).invert();
  }

  const pelvisT = tgt.find("pelvis");
  const pelvisS = src.find("pelvis");
  const hipScale = pelvisT >= 0 && pelvisS >= 0 ? tWpRest[pelvisT * 3 + 1]! / Math.max(1e-6, sWpRest[pelvisS * 3 + 1]!) : 1;

  // Source key times (the densest track).
  let times: Float32Array | null = null;
  for (const tr of clip.tracks) if (times === null || tr.times.length > times.length) times = tr.times as Float32Array;
  const keyTimes = times ?? new Float32Array([0, clip.duration]);

  const sampler = new ClipSampler(clip, src);
  const sq = new Float32Array(ns * 4);
  const sp = new Float32Array(ns * 3);
  const sWq = new Float32Array(ns * 4);
  const sWp = new Float32Array(ns * 3);
  const tWq = new Float32Array(nt * 4);
  const outQ: Float32Array[] = [];
  const outP = new Float32Array(keyTimes.length * 3);
  for (let i = 0; i < nt; i += 1) outQ.push(new Float32Array(keyTimes.length * 4));
  const fill = opts.fill ?? tgt.restQ;
  const rootT = tgt.find("root");
  const d = new THREE.Quaternion();
  const w = new THREE.Quaternion();
  const pw = new THREE.Quaternion();
  for (let k = 0; k < keyTimes.length; k += 1) {
    src.restPose(sq, sp);
    sampler.sample(keyTimes[k]!, sq, sp);
    fk(src, sq, sp, sWq, sWp);
    for (let i = 0; i < nt; i += 1) {
      const par = tgt.parent[i]!;
      if (par >= 0) pw.fromArray(tWq, par * 4);
      else pw.set(0, 0, 0, 1);
      const s = map[i]!;
      if (s < 0 || i === rootT) {
        // Unmapped (or the static root): the fill local rotation.
        _q.fromArray(i === rootT ? tgt.restQ : fill, i * 4);
        _q.toArray(outQ[i]!, k * 4);
        w.copy(pw).multiply(_q).toArray(tWq, i * 4);
        continue;
      }
      // Wt = Ws·(A·Ws_rest)⁻¹·Wt_rest
      d.fromArray(sWq, s * 4).multiply(align[i]!);
      w.copy(d).multiply(_q.fromArray(tWqRest, i * 4)).normalize();
      w.toArray(tWq, i * 4);
      // Local = parent⁻¹·W
      _r.copy(pw).invert().multiply(w).normalize();
      if (k > 0) {
        const o = outQ[i]!;
        const dot = o[(k - 1) * 4]! * _r.x + o[(k - 1) * 4 + 1]! * _r.y + o[(k - 1) * 4 + 2]! * _r.z + o[(k - 1) * 4 + 3]! * _r.w;
        if (dot < 0) _r.set(-_r.x, -_r.y, -_r.z, -_r.w);
      }
      _r.toArray(outQ[i]!, k * 4);
    }
    // Pelvis: armature-space offset from rest × hip ratio, back into the pelvis parent's frame.
    if (pelvisT >= 0 && pelvisS >= 0) {
      const ox = (sWp[pelvisS * 3]! - sWpRest[pelvisS * 3]!) * hipScale;
      const oy = (sWp[pelvisS * 3 + 1]! - sWpRest[pelvisS * 3 + 1]!) * hipScale;
      const oz = (sWp[pelvisS * 3 + 2]! - sWpRest[pelvisS * 3 + 2]!) * hipScale;
      const par = tgt.parent[pelvisT]!;
      _v.set(tWpRest[pelvisT * 3]! + ox, tWpRest[pelvisT * 3 + 1]! + oy, tWpRest[pelvisT * 3 + 2]! + oz);
      if (par >= 0) {
        _v.x -= tWpRest[par * 3]!;
        _v.y -= tWpRest[par * 3 + 1]!;
        _v.z -= tWpRest[par * 3 + 2]!;
        _v.applyQuaternion(_r.fromArray(tWqRest, par * 4).invert());
      }
      _v.toArray(outP, k * 3);
    }
  }
  if (opts.loop) closeLoop(outQ, outP, keyTimes, pelvisT >= 0);
  const tracks: THREE.KeyframeTrack[] = [];
  const tArr = Array.from(keyTimes);
  for (let i = 0; i < nt; i += 1) tracks.push(new THREE.QuaternionKeyframeTrack(tgt.names[i] + ".quaternion", tArr, Array.from(outQ[i]!)));
  if (pelvisT >= 0) tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", tArr, Array.from(outP)));
  const raw = new THREE.AnimationClip(opts.name ?? clip.name, clip.duration, tracks);
  return resampleClip(raw, opts.loop);
}

/**
 * Closes a loop: each bone's miss between the last and the first key (left
 * offset d = q₀·q_N⁻¹, and p₀ − p_N for the pelvis) is spread over the cycle,
 * q'(t) = slerp(1, d, t/T)·q(t), so the last key equals the first and the
 * seam carries no jump (Holden, "Creating Looping Animations").
 */
function closeLoop(outQ: Float32Array[], outP: Float32Array, times: Float32Array, hasPelvis: boolean): void {
  const n = times.length;
  if (n < 3) return;
  const t0 = times[0]!;
  const span = times[n - 1]! - t0 || 1;
  const first = new THREE.Quaternion();
  const last = new THREE.Quaternion();
  const d = new THREE.Quaternion();
  const s = new THREE.Quaternion();
  const id = new THREE.Quaternion();
  for (const q of outQ) {
    first.fromArray(q, 0);
    last.fromArray(q, (n - 1) * 4);
    d.copy(first).multiply(last.invert());
    if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
    if (1 - d.w < 1e-9) continue;
    for (let k = 1; k < n; k += 1) {
      s.slerpQuaternions(id, d, (times[k]! - t0) / span);
      last.fromArray(q, k * 4);
      last.premultiply(s).normalize();
      // Keep the hemisphere of the previous key.
      const o = (k - 1) * 4;
      if (q[o]! * last.x + q[o + 1]! * last.y + q[o + 2]! * last.z + q[o + 3]! * last.w < 0) last.set(-last.x, -last.y, -last.z, -last.w);
      last.toArray(q, k * 4);
    }
  }
  if (!hasPelvis) return;
  for (let c = 0; c < 3; c += 1) {
    const miss = outP[c]! - outP[(n - 1) * 3 + c]!;
    for (let k = 1; k < n; k += 1) outP[k * 3 + c] = outP[k * 3 + c]! + (miss * (times[k]! - t0)) / span;
  }
}
