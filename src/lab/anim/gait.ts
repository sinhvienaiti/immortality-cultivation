/**
 * Gait analysis and stance stabilization for in-place locomotion clips
 * (MOTION_PLAN step 2.5 "nhịp bước khớp mặt đất", 2.8; CHARACTER_ANIMATION
 * §5.5). Load time only.
 *
 * In-place clips are authored without root motion, and Lam's Run is a
 * cartoon leap: its planted foot slides back at 0.5 m/s at touch-down, 3 m/s
 * mid-stance and 1.3 m/s at lift-off. Moved at a constant speed, such a clip
 * slides whatever the stride matching, and Lam's 0.37 m legs cannot hold a
 * foot lock through it. So the clip is stabilized: the pelvis gets a small
 * forward offset over the cycle (a few cm, the surge a real runner has) that
 * makes the planted foot move back at one constant speed, the clip's ground
 * speed. Between contacts the offset returns, so the cycle still loops.
 *
 * Reported per clip: ground velocity at rate 1 in the character frame
 * (forward, right; m/s), stride per cycle (m), the left touch-down phase, and
 * the largest offset applied (m).
 */
import * as THREE from "three";
import { ClipSampler, Rig } from "./rig";

export interface GaitInfo {
  forward: number;
  right: number;
  speed: number;
  stride: number;
  phase0: number;
  shiftM: number;
}

export interface GaitFeet {
  ankle: [THREE.Bone, THREE.Bone];
  ball: [THREE.Bone, THREE.Bone];
  /** Idle@0 heights (root frame) of ankle and ball per foot. */
  standA: [number, number];
  standB: [number, number];
}

const RATE = 120;
const PLANT_M = 0.045;

/**
 * Measures the gait of looping `clip` and, when `stabilize`, rewrites its
 * pelvis position track so the planted foot moves at a constant speed.
 * `root`: the caster root (identity at load); the model's front is −z there.
 */
export function analyseGait(clip: THREE.AnimationClip, rig: Rig, root: THREE.Object3D, feet: GaitFeet, stabilize: boolean): GaitInfo {
  const sampler = new ClipSampler(clip, rig);
  const dur = sampler.duration;
  const n = Math.max(8, Math.round(dur * RATE));
  const dt = dur / n;
  const q = new Float32Array(rig.count * 4);
  const p = new Float32Array(rig.count * 3);
  const v = new THREE.Vector3();
  const pelvisI = rig.find("pelvis");
  // Contact point (root frame xz) and height over the stance per foot and frame.
  const cx = [new Float64Array(n), new Float64Array(n)];
  const cz = [new Float64Array(n), new Float64Array(n)];
  const rel = [new Float64Array(n), new Float64Array(n)];
  const pelvis = new Float32Array(n * 3);
  let mostFwd = Infinity;
  let td = 0;
  for (let k = 0; k < n; k += 1) {
    rig.restPose(q, p);
    sampler.sample(k * dt, q, p);
    rig.writePose(q, p);
    root.updateMatrixWorld(true);
    if (pelvisI >= 0) {
      pelvis[k * 3] = p[pelvisI * 3]!;
      pelvis[k * 3 + 1] = p[pelvisI * 3 + 1]!;
      pelvis[k * 3 + 2] = p[pelvisI * 3 + 2]!;
    }
    for (let s = 0; s < 2; s += 1) {
      const a = root.worldToLocal(feet.ankle[s]!.getWorldPosition(v)).clone();
      const b = root.worldToLocal(feet.ball[s]!.getWorldPosition(v));
      const ra = a.y - feet.standA[s]!;
      const rb = b.y - feet.standB[s]!;
      // The point on the ground: the ball once the heel is up, else the ankle.
      const onBall = rb < ra - 0.012;
      cx[s]![k] = onBall ? b.x : a.x;
      cz[s]![k] = onBall ? b.z : a.z;
      rel[s]![k] = Math.min(ra, rb);
      if (s === 0 && a.z < mostFwd) {
        mostFwd = a.z;
        td = k;
      }
    }
  }
  // The planted foot's mean direction over the ground frames (a back step plants feet moving forward).
  let gx = 0;
  let gz = 0;
  for (let k = 0; k < n; k += 1) {
    const low = rel[0]![k]! <= rel[1]![k]! ? 0 : 1;
    if (rel[low]![k]! > PLANT_M) continue;
    gx += cx[low]![(k + 1) % n]! - cx[low]![(k + n - 1) % n]!;
    gz += cz[low]![(k + 1) % n]! - cz[low]![(k + n - 1) % n]!;
  }
  const gl = Math.hypot(gx, gz) || 1;
  gx /= gl;
  gz /= gl;
  // Stance velocity per frame: the lower foot near the ground, not swinging against that direction.
  const ux = new Float64Array(n);
  const uz = new Float64Array(n);
  const stance = new Uint8Array(n);
  let sx = 0;
  let sz = 0;
  let cnt = 0;
  for (let k = 0; k < n; k += 1) {
    const kp = (k + n - 1) % n;
    const kn = (k + 1) % n;
    const low = rel[0]![k]! <= rel[1]![k]! ? 0 : 1;
    if (rel[low]![k]! > PLANT_M) continue;
    const vx = (cx[low]![kn]! - cx[low]![kp]!) / (2 * dt);
    const vz = (cz[low]![kn]! - cz[low]![kp]!) / (2 * dt);
    // A foot moving against the planted direction is swinging, not planted.
    if (vx * gx + vz * gz < -0.15) continue;
    stance[k] = 1;
    ux[k] = vx;
    uz[k] = vz;
    sx += vx;
    sz += vz;
    cnt += 1;
  }
  const mx = cnt > 0 ? sx / cnt : 0;
  const mz = cnt > 0 ? sz / cnt : 0;
  let shiftM = 0;
  if (stabilize && cnt > 0 && pelvisI >= 0) {
    // Correction velocity: planted frames reach the mean; the others give it back so the cycle closes.
    const corrX = new Float64Array(n);
    const corrZ = new Float64Array(n);
    let tx = 0;
    let tz = 0;
    for (let k = 0; k < n; k += 1) {
      if (!stance[k]) continue;
      corrX[k] = mx - ux[k]!;
      corrZ[k] = mz - uz[k]!;
      tx += corrX[k]!;
      tz += corrZ[k]!;
    }
    const free = n - cnt;
    for (let k = 0; k < n; k += 1) {
      if (free > 0) {
        if (!stance[k]) {
          corrX[k] = -tx / free;
          corrZ[k] = -tz / free;
        }
      } else {
        corrX[k] = corrX[k]! - tx / n;
        corrZ[k] = corrZ[k]! - tz / n;
      }
    }
    // Offset = integral of the correction, centred, then smoothed (periodic, 5 frames).
    const dx = new Float64Array(n);
    const dz = new Float64Array(n);
    let ax = 0;
    let az = 0;
    for (let k = 0; k < n; k += 1) {
      dx[k] = ax;
      dz[k] = az;
      ax += corrX[k]! * dt;
      az += corrZ[k]! * dt;
    }
    let ox = 0;
    let oz = 0;
    for (let k = 0; k < n; k += 1) {
      ox += dx[k]!;
      oz += dz[k]!;
    }
    ox /= n;
    oz /= n;
    const fx = new Float64Array(n);
    const fz = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      let a = 0;
      let b = 0;
      for (let j = -2; j <= 2; j += 1) {
        a += dx[(k + j + n) % n]! - ox;
        b += dz[(k + j + n) % n]! - oz;
      }
      fx[k] = a / 5;
      fz[k] = b / 5;
      shiftM = Math.max(shiftM, Math.hypot(fx[k]!, fz[k]!));
    }
    // Root-frame offsets into the pelvis parent's frame (scale included); the root is identity at load.
    const parent = rig.bones[pelvisI]!.parent!;
    const toLocal = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
    const rootRot = new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
    const times: number[] = [];
    const values: number[] = [];
    for (let k = 0; k <= n; k += 1) {
      const kk = k % n;
      v.set(fx[kk]!, 0, fz[kk]!).applyMatrix3(rootRot).applyMatrix3(toLocal);
      times.push(k * dt);
      values.push(pelvis[kk * 3]! + v.x, pelvis[kk * 3 + 1]! + v.y, pelvis[kk * 3 + 2]! + v.z);
    }
    const name = rig.names[pelvisI] + ".position";
    const track = new THREE.VectorKeyframeTrack(name, times, values);
    const at = clip.tracks.findIndex((t) => t.name === name);
    if (at >= 0) clip.tracks[at] = track;
    else clip.tracks.push(track);
    clip.resetDuration();
    clip.duration = dur;
  }
  rig.writePose(rig.restQ, rig.restP);
  root.updateMatrixWorld(true);
  // Character frame: forward −z, right +x; the body moves against the planted foot.
  const forward = mz;
  const right = -mx;
  const speed = Math.hypot(forward, right);
  return { forward, right, speed, stride: speed * dur, phase0: td / n, shiftM };
}
