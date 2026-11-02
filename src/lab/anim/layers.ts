/**
 * Procedural layers on top of the clip pose (CHARACTER_ANIMATION §5.6,
 * MOTION_PLAN steps 2.7 and 2.10, appendix C §2.3, §2.6, §2.9): breathing,
 * the wind-up coil (the torso turns away from the strike as the word is
 * typed and springs through on the release: anticipation and follow-through),
 * release recoil, hit flinch (directional spring + the Hit clip as an
 * upper-body additive), lean into turns and starts, the dash crouch, and the
 * spring look-at (head 0.6, neck 0.4 of the clamped angle, spine_03 0.2 of
 * the rest). Rotations are applied in world space (L' = P⁻¹·d·P·L), so the
 * rig's local axes do not matter. No allocation per frame.
 */
import * as THREE from "three";
import { clamp, criticalSpring, DEG, smoothstep, underdampedSpring, wrapPi } from "./math";
import { ClipSampler, Rig, rotateBoneWorld, worldQuat } from "./rig";

/** Upper-body bones the Hit clip moves as an additive layer (no legs, no pelvis lift). */
const HIT_BONES = ["spine_01", "spine_02", "spine_03", "neck_01", "head", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"];
const HIT_IN = 0.03;
const HIT_OUT = 0.25;
/** Look-at clamp (td_lookAt in lam.glb: past ~25° the hood rim stretches). */
const LOOK_MAX = 20 * DEG;
const LOOK_SPINE_MAX = 15 * DEG;
/** Wind-up coil at full charge: torso turn and lean back (deg). */
const COIL_DEG = 30;
const COIL_BACK_DEG = 6;

const _q = new THREE.Quaternion();
const _d = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _h = new THREE.Vector3();
const _id = new THREE.Quaternion();

export class Layers {
  private readonly pelvis: THREE.Bone | null;
  private readonly spine1: THREE.Bone | null;
  private readonly spine2: THREE.Bone | null;
  private readonly spine3: THREE.Bone | null;
  private readonly neck: THREE.Bone | null;
  private readonly head: THREE.Bone | null;
  private readonly clavL: THREE.Bone | null;
  private readonly clavR: THREE.Bone | null;
  // Breathing.
  private breath = 0;
  /** 0–1: how much breathing shows (1 idle, less in action). */
  breathWeight = 1;
  private breathW = new Float64Array(2);
  // Recoil: angle (deg) spring, 5 Hz, ζ 0.6; direction in the character frame (forward, right).
  private readonly recoil = new Float64Array(2);
  private recoilF = 1;
  private recoilR = 0;
  // Hit: clip additive + envelope.
  private hitSampler: ClipSampler | null = null;
  private hitT = -1;
  private readonly hitBones: number[] = [];
  private readonly hitRef: Float32Array;
  private readonly hitQ: Float32Array;
  private readonly hitP: Float32Array;
  // Lean (deg) springs: forward, side.
  private readonly lean = new Float64Array(4);
  leanForwardGoal = 0;
  leanSideGoal = 0;
  // Crouch (0–1) spring.
  private readonly crouch = new Float64Array(2);
  crouchGoal = 0;
  // Coil (−1…1, sign = the side the torso turns to) on an underdamped spring: overshoot is the follow-through.
  private readonly coil = new Float64Array(2);
  coilGoal = 0;
  // Look-at: yaw, pitch springs (rad) and weight.
  private readonly look = new Float64Array(6);
  readonly lookTarget = new THREE.Vector3();
  lookWeightGoal = 0;
  /** Pelvis drop (m) the crouch applied this frame. */
  pelvisDrop = 0;

  constructor(
    private readonly rig: Rig,
    hitClip: THREE.AnimationClip | null,
  ) {
    this.pelvis = rig.bone("pelvis");
    this.spine1 = rig.bone("spine_01");
    this.spine2 = rig.bone("spine_02");
    this.spine3 = rig.bone("spine_03");
    this.neck = rig.bone("neck_01");
    this.head = rig.bone("head");
    this.clavL = rig.bone("clavicle_l");
    this.clavR = rig.bone("clavicle_r");
    const n = rig.count;
    this.hitRef = new Float32Array(n * 4);
    this.hitQ = new Float32Array(n * 4);
    this.hitP = new Float32Array(n * 3);
    if (hitClip) {
      this.hitSampler = new ClipSampler(hitClip, rig);
      rig.restPose(this.hitRef, this.hitP);
      this.hitSampler.sample(0, this.hitRef, this.hitP);
      for (const name of HIT_BONES) {
        const i = rig.find(name);
        if (i >= 0) this.hitBones.push(i);
      }
    }
    this.breathW[0] = 1;
  }

  reset(): void {
    this.recoil.fill(0);
    this.lean.fill(0);
    this.crouch.fill(0);
    this.coil.fill(0);
    this.coilGoal = 0;
    this.look.fill(0);
    this.hitT = -1;
    this.leanForwardGoal = this.leanSideGoal = this.crouchGoal = this.lookWeightGoal = 0;
    // Idle breathing in full again (a reset during a strike left it at the strike's 0.3).
    this.breathWeight = 1;
    this.breathW[0] = 1;
    this.breathW[1] = 0;
    this.pelvisDrop = 0;
  }

  /** A recoil kick (deg/s of tilt velocity) along the character-frame direction (forward f, right r) the body is pushed to. */
  kick(degPerS: number, f: number, r: number): void {
    const l = Math.hypot(f, r) || 1;
    this.recoilF = f / l;
    this.recoilR = r / l;
    this.recoil[1] = this.recoil[1]! + degPerS;
  }

  /** Starts the Hit additive. */
  hit(): void {
    if (this.hitSampler) this.hitT = 0;
  }

  get hitActive(): boolean {
    return this.hitT >= 0;
  }

  /** Advances the springs and timers (world dt). */
  step(dt: number): void {
    this.breath += dt * 0.25 * Math.PI * 2;
    if (this.breath > Math.PI * 2) this.breath -= Math.PI * 2;
    criticalSpring(this.breathW, 0, this.breathWeight, 0.4, dt);
    underdampedSpring(this.recoil, 0, 0, 5, 0.6, dt);
    criticalSpring(this.lean, 0, this.leanForwardGoal, 0.12, dt);
    criticalSpring(this.lean, 2, this.leanSideGoal, 0.12, dt);
    criticalSpring(this.crouch, 0, this.crouchGoal, 0.05, dt);
    underdampedSpring(this.coil, 0, this.coilGoal, 3.2, 0.55, dt);
    criticalSpring(this.look, 4, this.lookWeightGoal, 0.15, dt);
    if (this.hitT >= 0) {
      this.hitT += dt;
      if (this.hitSampler && this.hitT > this.hitSampler.duration) this.hitT = -1;
    }
  }

  /** The Hit clip as an additive on the upper body (local q·(ref⁻¹·hit(t))^w). Call on the bones before the world layers. */
  applyHit(): void {
    const s = this.hitSampler;
    if (!s || this.hitT < 0) return;
    const dur = s.duration;
    const w = smoothstep(0, HIT_IN, this.hitT) * (1 - smoothstep(dur - HIT_OUT, dur, this.hitT));
    if (w <= 0) return;
    s.sample(this.hitT, this.hitQ, this.hitP);
    for (const i of this.hitBones) {
      const o = i * 4;
      _q.set(this.hitRef[o]!, this.hitRef[o + 1]!, this.hitRef[o + 2]!, this.hitRef[o + 3]!).invert();
      _d.set(this.hitQ[o]!, this.hitQ[o + 1]!, this.hitQ[o + 2]!, this.hitQ[o + 3]!);
      _q.multiply(_d); // ref⁻¹·hit
      _d.slerpQuaternions(_id, _q, w);
      this.rig.bones[i]!.quaternion.multiply(_d);
    }
  }

  /** World-space layers on fresh world matrices (subtrees refreshed after each bone). `fx, fz`: the facing. */
  applyWorld(fx: number, fz: number): void {
    const rx = -fz;
    const rz = fx;
    this.pelvisDrop = 0;
    const crouch = this.crouch[0]!;
    const rec = this.recoil[0]!;
    // Pelvis: lean (forward about the right axis, side about forward), crouch (drop), recoil push.
    const pelvis = this.pelvis;
    if (pelvis && pelvis.parent) {
      const leanF = this.lean[0]! + crouch * 9;
      const leanS = this.lean[2]!;
      worldQuat(pelvis.parent, _p);
      if (Math.abs(leanF) > 1e-3) rotateBoneWorld(pelvis, _p, _d.setFromAxisAngle(_h.set(rx, 0, rz), -leanF * DEG));
      if (Math.abs(leanS) > 1e-3) rotateBoneWorld(pelvis, _p, _d.setFromAxisAngle(_h.set(fx, 0, fz), leanS * DEG));
      const drop = crouch * 0.05;
      const push = rec * 0.0025;
      if (drop > 1e-4 || Math.abs(push) > 1e-4) {
        // World offset (down, and along the push) into the pelvis parent's frame.
        _v.set((this.recoilF * fx + this.recoilR * rx) * push, -drop, (this.recoilF * fz + this.recoilR * rz) * push);
        const sc = pelvis.parent.matrixWorld.getMaxScaleOnAxis() || 1;
        _v.applyQuaternion(_q.copy(_p).invert()).multiplyScalar(1 / sc);
        pelvis.position.add(_v);
        this.pelvisDrop = drop;
      }
      pelvis.updateMatrixWorld(true);
    }
    // Coil: the torso turns about up (spine_01 0.25, spine_02 0.35, spine_03 0.4 of COIL_DEG) and leans back a little.
    const coil = this.coil[0]!;
    if (Math.abs(coil) > 1e-3) {
      const yaw = coil * COIL_DEG * DEG;
      const back = -Math.abs(coil) * COIL_BACK_DEG * DEG;
      this.turn(this.spine1, fx, fz, yaw * 0.25, back * 0.3);
      this.turn(this.spine2, fx, fz, yaw * 0.35, back * 0.35);
      this.turn(this.spine3, fx, fz, yaw * 0.4, back * 0.35);
    }
    // Spine: breathing (pitch), recoil tilt towards the push, crouch counter-pitch.
    const bw = this.breathW[0]!;
    const b = Math.sin(this.breath) * bw;
    const pitch = (b * 1.0 - rec * this.recoilF - crouch * 4) * 0.5;
    const roll = rec * this.recoilR * 0.5;
    this.tilt(this.spine2, fx, fz, pitch, roll);
    this.tilt(this.spine3, fx, fz, pitch, roll);
    // Clavicles rise a little with the in-breath.
    const lift = Math.max(0, b) * 0.7;
    if (lift > 1e-3) {
      this.tilt(this.clavL, fx, fz, 0, -lift);
      this.tilt(this.clavR, fx, fz, 0, lift);
    }
    this.applyLook(fx, fz);
  }

  /** Pitch (deg, + leans back) about the right axis and roll (deg, + to the right) about the facing, in world space. */
  private tilt(bone: THREE.Bone | null, fx: number, fz: number, pitchDeg: number, rollDeg: number): void {
    if (!bone || !bone.parent || (Math.abs(pitchDeg) < 1e-3 && Math.abs(rollDeg) < 1e-3)) return;
    worldQuat(bone.parent, _p);
    if (Math.abs(pitchDeg) >= 1e-3) rotateBoneWorld(bone, _p, _d.setFromAxisAngle(_h.set(-fz, 0, fx), pitchDeg * DEG));
    if (Math.abs(rollDeg) >= 1e-3) rotateBoneWorld(bone, _p, _d.setFromAxisAngle(_h.set(fx, 0, fz), rollDeg * DEG));
    bone.updateMatrixWorld(true);
  }

  /** Spring look-at towards `lookTarget`: yaw and pitch relative to the facing, clamped, spread over spine_03, neck and head. */
  private applyLook(fx: number, fz: number): void {
    const head = this.head;
    if (!head) return;
    head.getWorldPosition(_v);
    const dx = this.lookTarget.x - _v.x;
    const dy = this.lookTarget.y - _v.y;
    const dz = this.lookTarget.z - _v.z;
    const horiz = Math.hypot(dx, dz);
    let yawGoal = 0;
    let pitchGoal = 0;
    if (horiz > 0.05) {
      // Heading difference (rotation about +y turns the heading atan2(x, z) up).
      yawGoal = wrapPi(Math.atan2(dx, dz) - Math.atan2(fx, fz));
      // Behind: the side the body turns to, so the goal does not flip across ±180° as the bearing wobbles.
      if (Math.abs(yawGoal) > 120 * DEG && Math.abs(this.turnHint) > 30 * DEG && yawGoal * this.turnHint < 0) yawGoal += yawGoal < 0 ? 2 * Math.PI : -2 * Math.PI;
      pitchGoal = Math.atan2(dy, horiz);
    }
    // A target the body comes close to (a dash passing it) eases the eyes to straight ahead, so its bearing flipping
    // round does not swing the head; the springs below keep that easing smooth however fast the body moves.
    const near = smoothstep(0.4, 1.2, horiz);
    yawGoal = clamp(yawGoal, -100 * DEG, 100 * DEG) * near;
    pitchGoal = clamp(pitchGoal, -30 * DEG, 30 * DEG) * near;
    const w = this.look[4]!;
    if (w < 1e-3) {
      // Unseen: the yaw and pitch wait on the goal, so a new look only fades in (no stale angle springing across).
      this.look[0] = yawGoal;
      this.look[1] = 0;
      this.look[2] = pitchGoal;
      this.look[3] = 0;
      return;
    }
    criticalSpring(this.look, 0, yawGoal, 0.09, this.lastDt);
    criticalSpring(this.look, 2, pitchGoal, 0.09, this.lastDt);
    const yaw = this.look[0]! * w;
    const pitch = this.look[2]! * w;
    const cy = clamp(yaw, -LOOK_MAX, LOOK_MAX);
    const cp = clamp(pitch, -LOOK_MAX, LOOK_MAX);
    const sy = clamp((yaw - cy) * 0.2, -LOOK_SPINE_MAX, LOOK_SPINE_MAX);
    const sp = clamp((pitch - cp) * 0.2, -LOOK_SPINE_MAX, LOOK_SPINE_MAX);
    this.turn(this.spine3, fx, fz, sy, sp);
    this.turn(this.neck, fx, fz, cy * 0.4, cp * 0.4);
    this.turn(this.head, fx, fz, cy * 0.6, cp * 0.6);
  }

  /** Yaw (rad, about +y) then pitch (rad, + looks up: about the right axis) in world space. */
  private turn(bone: THREE.Bone | null, fx: number, fz: number, yaw: number, pitch: number): void {
    if (!bone || !bone.parent || (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5)) return;
    worldQuat(bone.parent, _p);
    _d.setFromAxisAngle(_h.set(0, 1, 0), yaw);
    _q.setFromAxisAngle(_h.set(-fz, 0, fx), pitch);
    rotateBoneWorld(bone, _p, _d.multiply(_q));
    bone.updateMatrixWorld(true);
  }

  /** The frame's dt, for the look springs that run inside applyWorld. */
  lastDt = 1 / 60;
  /** The body's turn still to come (rad, signed as the yaw spring goes), set by the Animator each frame. */
  turnHint = 0;
}
