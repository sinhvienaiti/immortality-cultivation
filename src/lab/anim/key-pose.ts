/**
 * Authored key poses for a skill (motion round 4, MOTION_PLAN "Vòng 4"; ChatGPT's step 1, accepted by Claude on
 * 03/11/2026 after three rounds of procedural acting scored 5.4 → 6.1/6.5 → 5.3/5.7). The procedural layers stay
 * (inertialization, foot IK, springs, the probe); what was missing was strong poses designed for the 55° rear play
 * camera at 30–70 px. So a skill with key poses plays them as data, driven by the typing:
 *
 *   ready → early anticipation → mid coil → maximum coil   (the word's letters move through these)
 *   → release (the last key: there in 50–100 ms, an explosive ease-out) → hold (a short drift on)
 *   → follow-through (the overshoot) → settle → recovery (the weight hands back to Idle in ~0.2 s).
 *
 * Between keys the coil keeps creeping towards the next key's value and a circulating hold runs on the torso and the
 * sword arm, so no stretch of the typing looks frozen; each key still adds a visible step of compression. The last
 * key starts the release on its own frame (the gameplay event fires on that frame in the skills lab).
 *
 * Pose data (anim/fan-sweep-poses.ts): bone rotations under canonical names, Euler degrees in the character frame
 * (x right, y up, z back; 'YZX' order: x applied first, then z, then y), each the bone's ABSOLUTE turn from its rest
 * in that frame (the T-pose rest of the Mesh2Motion human: arms out along ±x, palms down, spine up). So an arm's x is
 * its twist about its own length, z raises or lowers it, y swings it forward or back. Bones not named keep the rest
 * orientation. Fingers are relative to their parent, in the frame the parent has at rest (a curl is a turn about z).
 * Pelvis offsets (down, forward, right; m) and a stance per pose (feet offsets for the foot lock) complete a pose.
 * At load the absolute turns become parent-relative ones (d = D_parent⁻¹·D), so the poses interpolate along FK arcs
 * and the circulating hold composes on top. The legs are not posed: the foot lock's two-bone IK bends them to the
 * planted feet under the lowered pelvis. Writes happen after the world layers (lean, breathing, look-at) and before
 * the foot IK; most procedural acting is off for these skills. No allocation per frame.
 */
import * as THREE from "three";
import { clamp, criticalSpring, DEG, smoothstep } from "./math";
import { Rig } from "./rig";
import { FAN_SWEEP } from "./fan-sweep-poses";

export type Euler3 = readonly [number, number, number];

/** Feet for the foot lock: per foot forward, right (m) and heading (deg, + toes left) from the clip foot. */
export interface KeyStance {
  readonly l: Euler3;
  readonly r: Euler3;
  /** The step (s), its lift (m) and which foot first. */
  readonly stepS: number;
  readonly liftM: number;
  readonly first?: "l" | "r";
}

export interface KeyPose {
  readonly name: string;
  /** Pelvis offset in the facing frame (m): down, forward, right. */
  readonly hips: Euler3;
  /** Absolute bone turns from rest (character frame, Euler deg, 'YZX'). */
  readonly body: Readonly<Record<string, Euler3>>;
  /** Finger shapes by name (KeyPoseSkill.hands) for the right and left hand. */
  readonly hands: readonly [string, string];
  /** Feet from this pose on (null keeps the previous stance). */
  readonly stance: KeyStance | null;
}

/** A finger shape: finger bone → Euler deg relative to its parent's rest frame. */
export type HandShape = Readonly<Record<string, Euler3>>;

export interface KeyPoseSkill {
  readonly id: string;
  readonly name: string;
  /** ready, early anticipation, mid coil, maximum coil, release, follow-through. */
  readonly poses: readonly [KeyPose, KeyPose, KeyPose, KeyPose, KeyPose, KeyPose];
  readonly hands: Readonly<Record<string, HandShape>>;
  /** Release (s): maximum coil to the release pose, explosive ease-out. */
  readonly releaseS: number;
  /** Hold on the release pose (s), drifting this far towards the follow-through (share). */
  readonly holdS: number;
  readonly holdDrift: number;
  /** Follow-through (s), settle back (s, share of the way back towards the release), recovery to Idle (s). */
  readonly followS: number;
  readonly settleS: number;
  readonly settleBack: number;
  readonly recoverS: number;
  /** Circulating hold: torso (deg), sword arm (deg), wrist (deg), frequency (Hz). */
  readonly circle: { readonly torso: number; readonly arm: number; readonly wrist: number; readonly hz: number };
  /** The bone the circulating hold turns as the sword arm, and the hand its wrist tremor shakes. */
  readonly armBone: string;
  readonly wristBone: string;
}

/** Key-pose skills by id (HeroProfile.keyPoses maps slots to these). */
export const KEY_POSE_SKILLS: Record<string, KeyPoseSkill> = { fanSweep: FAN_SWEEP };

/** Bones every pose writes (absolute turns; missing in a pose: rest). Parents before children. */
export const BODY_BONES: readonly string[] = [
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "head",
  "clavicle_l",
  "upperarm_l",
  "lowerarm_l",
  "hand_l",
  "clavicle_r",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
];

const FINGERS = ["index", "middle", "ring", "pinky", "thumb"];
/** Finger bones per side (three joints each), parents before children. */
function fingerBones(side: "l" | "r"): string[] {
  const out: string[] = [];
  for (const f of FINGERS) for (let j = 1; j <= 3; j += 1) out.push(`${f}_0${j}_${side}`);
  return out;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _a = new THREE.Quaternion();
const _b = new THREE.Quaternion();
const _c = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

function eulerQuat(e: Euler3 | undefined, out: THREE.Quaternion): THREE.Quaternion {
  if (!e) return out.identity();
  _e.set(e[0] * DEG, e[1] * DEG, e[2] * DEG, "YZX");
  return out.setFromEuler(_e);
}

/** A restart over a shown pose cross-fades from it over this long (s). */
const XFADE_S = 0.12;

export type KeyStage = "off" | "charge" | "release" | "hold" | "follow" | "settle" | "recover";

/** One skill baked for one rig: per pose and bone, the parent-relative turn (x y z w). */
interface Baked {
  readonly skill: KeyPoseSkill;
  /** [pose][bone slot] quaternions, flat. */
  readonly q: Float32Array;
  readonly hips: Float32Array;
}

/**
 * Plays key-pose skills on one rig. The Animator calls charge / release / cancel from its commands, `update(dt)` in
 * its state step and `apply()` after the world layers; it reads `stance`, `stanceSeq`, `weight` and `done`.
 */
export class KeyPoser {
  private readonly bySlot = new Map<string, Baked>();
  /** Bone slots: body bones then each side's fingers. */
  private readonly names: string[];
  private readonly bones: (THREE.Bone | null)[];
  /** Per slot: the parent's rest turn in the character frame (P), and the bone's rest local rotation (L). */
  private readonly restParent: THREE.Quaternion[];
  private readonly restLocal: THREE.Quaternion[];
  private readonly pelvis: THREE.Bone | null;
  private cur: Baked | null = null;
  private slot = "";
  stage: KeyStage = "off";
  /** Pose phase 0…5 shown (0–3 typed, 4 release, 5 follow-through), its spring velocity, and the typed goal. */
  private readonly phaseS = new Float64Array(2);
  private phaseGoal = 0;
  private creepCap = 0;
  private creepRate = 0;
  private lastKeyT = -1;
  private keyInterval = 0.25;
  /** Seconds since the charge began, since the release (−1 before). */
  private t = 0;
  releaseAge = -1;
  /** Weight of the pose over the base (spring while charging, eased in recovery). */
  private readonly w = new Float64Array(2);
  private wGoal = 0;
  private relFrom = 3;
  private relW0 = 1;
  private circleT = 0;
  /** Circulation amplitude (0–1, grows with the coil). */
  private circleK = 0;
  /** Feet asked for (the Animator hands them to the foot lock each frame) and a counter of step requests. */
  stance: KeyStance | null = null;
  stanceSeq = 0;
  private stanceAt = -1;
  /** Keys typed into key-pose skills so far (the probe marks each). */
  keyCount = 0;
  /** Frames since the last key (for the probe): the release started on frame `releaseFrame` of `frames`. */
  frames = 0;
  releaseFrame = -1;

  constructor(
    private readonly rig: Rig,
    private readonly root: THREE.Object3D,
  ) {
    this.names = [...BODY_BONES, ...fingerBones("r"), ...fingerBones("l")];
    this.lastQ = new Float32Array(this.names.length * 4);
    this.fromQ = new Float32Array(this.names.length * 4);
    this.bones = this.names.map((n) => rig.bone(n));
    this.pelvis = rig.bone("pelvis");
    this.restParent = this.names.map(() => new THREE.Quaternion());
    this.restLocal = this.names.map(() => new THREE.Quaternion());
    // Rest turns in the character frame: the rig at rest under the caster root (identity at load).
    const q = new Float32Array(rig.count * 4);
    const p = new Float32Array(rig.count * 3);
    rig.restPose(q, p);
    rig.writePose(q, p);
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    root.matrixWorld.decompose(_p, rootInv, _s);
    rootInv.invert();
    for (let i = 0; i < this.names.length; i += 1) {
      const b = this.bones[i];
      if (!b) continue;
      this.restLocal[i]!.copy(b.quaternion);
      const parent = b.parent;
      if (parent) {
        parent.matrixWorld.decompose(_p, this.restParent[i]!, _s);
        this.restParent[i]!.premultiply(rootInv);
      }
    }
  }

  /** Authoring stills: holds `slot`'s pose at `phase` (0–5) at full weight, no circulation, until unfrozen. */
  freeze(slot: string, phase: number): void {
    if (!this.bySlot.has(slot)) return;
    this.cur = this.bySlot.get(slot)!;
    this.slot = slot;
    this.stage = phase >= 3.999 ? "hold" : "charge";
    this.frozen = clamp(phase, 0, 5);
    this.phaseS[0] = this.frozen;
    this.phaseS[1] = 0;
    this.w[0] = 1;
    this.w[1] = 0;
    this.circleK = 0;
    this.xfade = -1;
    this.stanceAt = -1;
  }

  unfreeze(): void {
    this.frozen = -1;
    this.reset();
    this.setStance(null);
  }

  private frozen = -1;

  /** Back to nothing playing (a reset). */
  reset(): void {
    this.frozen = -1;
    this.stage = "off";
    this.cur = null;
    this.w[0] = this.w[1] = 0;
    this.phaseS[0] = this.phaseS[1] = 0;
    this.releaseAge = -1;
    this.stance = null;
    this.saved = false;
    this.xfade = -1;
    this.circleK = 0;
  }

  /** Authored skill `skill` on slot `slot` (baked for this rig now). */
  add(slot: string, skill: KeyPoseSkill): void {
    const n = this.names.length;
    const q = new Float32Array(6 * n * 4);
    const hips = new Float32Array(6 * 3);
    const abs: THREE.Quaternion[] = this.names.map(() => new THREE.Quaternion());
    const index = new Map(this.names.map((nm, i) => [nm, i]));
    for (let k = 0; k < 6; k += 1) {
      const pose = skill.poses[k]!;
      hips.set(pose.hips, k * 3);
      for (let i = 0; i < BODY_BONES.length; i += 1) {
        const nm = BODY_BONES[i]!;
        eulerQuat(pose.body[nm], abs[i]!);
        // Parent-relative: d = D_parent⁻¹ · D (the nearest posed ancestor; the pelvis's parent is unposed).
        const b = this.bones[i];
        let pi = -1;
        for (let o = b?.parent ?? null; o && pi < 0; o = o.parent) {
          const j = index.get(o.name);
          if (j !== undefined && j < BODY_BONES.length) pi = j;
          if (o === this.root) break;
        }
        _q.copy(abs[i]!);
        if (pi >= 0) _q.premultiply(_a.copy(abs[pi]!).invert());
        _q.toArray(q, (k * n + i) * 4);
      }
      // Fingers: relative to the parent already.
      for (let side = 0; side < 2; side += 1) {
        const shape = skill.hands[pose.hands[side]!] ?? {};
        const list = fingerBones(side === 0 ? "r" : "l");
        for (const nm of list) {
          const i = index.get(nm)!;
          eulerQuat(shape[nm], _q).toArray(q, (k * n + i) * 4);
        }
      }
    }
    this.bySlot.set(slot, { skill, q, hips });
  }

  has(slot: string): boolean {
    return this.bySlot.has(slot);
  }

  get active(): boolean {
    return this.stage !== "off";
  }

  /** The pose weight over the base (0–1). */
  get weight(): number {
    return this.stage === "off" ? 0 : clamp(this.w[0]!, 0, 1);
  }

  /** The phase shown (0–5). */
  get phase(): number {
    return this.phaseS[0]!;
  }

  get slotId(): string {
    return this.slot;
  }

  /** Arms held out on purpose (the arms-out check skips it). */
  get intended(): boolean {
    return this.stage !== "off" && this.stage !== "recover";
  }

  private begin(slot: string): void {
    const baked = this.bySlot.get(slot)!;
    const fresh = this.stage === "off" || this.slot !== slot || this.stage !== "charge";
    this.cur = baked;
    this.slot = slot;
    if (fresh) {
      if (this.saved && this.weight > 0.02) {
        this.fromQ.set(this.lastQ);
        this.fromHips.set(this.lastHips);
        this.xfade = 0;
      }
      this.stage = "charge";
      this.t = 0;
      this.phaseS[0] = 0;
      this.phaseS[1] = 0;
      this.phaseGoal = 0;
      this.creepCap = 0;
      this.lastKeyT = -1;
      this.releaseAge = -1;
      this.releaseFrame = -1;
      this.frames = 0;
      this.stanceAt = -1;
      if (this.w[0]! < 0.02) this.w[1] = 0;
    }
  }

  /** A key of the word (progress 0…1, `keysLeft` still to type). */
  charge(slot: string, progress: number, keysLeft: number): void {
    if (!this.bySlot.has(slot)) return;
    this.begin(slot);
    this.keyCount += 1;
    const p = clamp(progress, 0, 0.999);
    const total = Math.max(1, Math.round(keysLeft / (1 - p)));
    const typed = total - keysLeft;
    // Keys 1 … total−1 move ready → maximum coil; the last key releases.
    const goal = keysLeft <= 1 || total <= 2 ? 3 : (3 * clamp(typed - 1, 0, total - 2)) / (total - 2);
    const step = total <= 2 ? 3 : 3 / (total - 2);
    if (this.lastKeyT >= 0) this.keyInterval = clamp(this.t - this.lastKeyT, 0.08, 0.6);
    this.lastKeyT = this.t;
    this.phaseGoal = Math.max(this.phaseGoal, goal);
    // Between keys the coil keeps creeping on towards the next key's value (60 % of the step over one interval).
    this.creepCap = keysLeft <= 1 ? 3 : Math.min(3, goal + 0.6 * step);
    this.creepRate = (0.6 * step) / this.keyInterval;
    this.wGoal = 1;
  }

  /** The last key: the release starts on this frame. */
  release(slot: string): void {
    if (!this.bySlot.has(slot)) return;
    const instant = this.stage !== "charge" || this.slot !== slot;
    this.begin(slot);
    this.stage = "release";
    this.releaseAge = 0;
    this.releaseFrame = this.frames;
    // An instant cast (no typed coil): from the base pose straight into the release as the weight comes in.
    this.relFrom = instant ? 3 : this.phaseS[0]!;
    this.relW0 = instant ? 0 : this.w[0]!;
    this.wGoal = 1;
  }

  /** Walking off or another skill: the pose lets go quickly. */
  cancel(): void {
    if (this.stage === "off") return;
    this.stage = "recover";
    this.releaseAge = Math.max(0, this.releaseAge);
    this.recoverFrom = this.w[0]!;
    this.recoverT = 0;
    this.recoverLen = 0.12;
    this.setStance(null);
  }

  private recoverFrom = 1;
  private recoverT = 0;
  private recoverLen = 0.2;

  /** The recovery is over: the Animator returns to Idle. */
  get done(): boolean {
    return this.stage === "off";
  }

  private setStance(s: KeyStance | null): void {
    this.stance = s;
    this.stanceSeq += 1;
  }

  update(dt: number): void {
    const cur = this.cur;
    if (this.stage === "off" || !cur) return;
    const sk = cur.skill;
    this.t += dt;
    this.frames += 1;
    this.circleT += dt;
    if (this.frozen >= 0) {
      this.phaseS[0] = this.frozen;
      this.w[0] = 1;
      this.circleK = 0;
      this.updateStance(sk);
      return;
    }
    switch (this.stage) {
      case "charge": {
        this.phaseGoal = Math.min(this.creepCap, this.phaseGoal + this.creepRate * dt);
        criticalSpring(this.phaseS, 0, this.phaseGoal, 0.045, dt);
        criticalSpring(this.w, 0, this.wGoal, 0.05, dt);
        this.circleK = 0.35 + 0.65 * clamp(this.phaseS[0]! / 3, 0, 1);
        break;
      }
      case "release":
      case "hold":
      case "follow":
      case "settle": {
        this.releaseAge += dt;
        const a = this.releaseAge;
        const r = sk.releaseS;
        const h = r + sk.holdS;
        const f = h + sk.followS;
        const s = f + sk.settleS;
        let ph: number;
        if (a < r) {
          this.stage = "release";
          // Explosive: most of the travel in the first frames (1 − (1 − u)^2.6).
          const u = a / r;
          const e = 1 - Math.pow(1 - u, 2.6);
          ph = this.relFrom + (4 - this.relFrom) * e;
          this.w[0] = this.relW0 + (1 - this.relW0) * e;
        } else if (a < h) {
          this.stage = "hold";
          ph = 4 + sk.holdDrift * smoothstep(0, 1, (a - r) / sk.holdS);
          this.w[0] = 1;
        } else if (a < f) {
          this.stage = "follow";
          ph = 4 + sk.holdDrift + (1 - sk.holdDrift) * smoothstep(0, 1, (a - h) / sk.followS);
        } else if (a < s) {
          this.stage = "settle";
          ph = 5 - sk.settleBack * smoothstep(0, 1, (a - f) / sk.settleS);
        } else {
          ph = 5 - sk.settleBack;
          this.stage = "recover";
          this.recoverFrom = 1;
          this.recoverT = 0;
          this.recoverLen = sk.recoverS;
          this.setStance(null);
        }
        this.phaseS[0] = ph;
        this.phaseS[1] = 0;
        this.w[1] = 0;
        this.circleK = this.stage === "hold" ? 0.5 : 0.25;
        break;
      }
      case "recover": {
        this.recoverT += dt;
        const u = clamp(this.recoverT / Math.max(1e-3, this.recoverLen), 0, 1);
        this.w[0] = this.recoverFrom * (1 - smoothstep(0, 1, u));
        this.circleK = 0.2 * (1 - u);
        if (u >= 1) {
          this.stage = "off";
          this.w[0] = 0;
          this.cur = null;
        }
        break;
      }
    }
    if (this.stage !== "recover" && this.stage !== "off") this.updateStance(sk);
  }

  /** Feet: the stance of the latest pose passed that names one (asked once per pose). */
  private updateStance(sk: KeyPoseSkill): void {
    const k = Math.min(5, Math.floor(this.phaseS[0]! + 0.35));
    for (let i = k; i > this.stanceAt; i -= 1) {
      const st = sk.poses[i]!.stance;
      if (st) {
        this.stanceAt = k;
        this.setStance(st);
        break;
      }
    }
    if (this.stanceAt < k) this.stanceAt = k;
  }

  /** Writes the pose over the base (after the world layers, before the foot IK; the character frame is the root's). */
  apply(dt: number, scale = 1): void {
    const cur = this.cur;
    const w = this.weight * clamp(scale, 0, 1);
    if (!cur || w <= 1e-4) {
      this.saved = false;
      return;
    }
    const n = this.names.length;
    const ph = clamp(this.phaseS[0]!, 0, 5);
    const k0 = Math.min(4, Math.floor(ph));
    const u = ph - k0;
    const sk = cur.skill;
    // A restart over a pose still shown (a new word on top) cross-fades from what was shown.
    const x = this.xfade >= 0 ? smoothstep(0, 1, this.xfade / XFADE_S) : 1;
    if (this.xfade >= 0) {
      this.xfade += dt;
      if (this.xfade >= XFADE_S) this.xfade = -1;
    }
    // Circulating hold: a slow loop on the torso and the sword arm, a quicker tremor in the wrist.
    const c = this.circleK;
    const wt = this.circleT * Math.PI * 2 * sk.circle.hz;
    const cs = Math.sin(wt);
    const cc = Math.cos(wt);
    const tremor = Math.sin(this.circleT * Math.PI * 2 * 7.3) * sk.circle.wrist * c;
    for (let i = 0; i < n; i += 1) {
      const b = this.bones[i];
      if (!b) continue;
      _a.fromArray(cur.q, (k0 * n + i) * 4);
      _b.fromArray(cur.q, ((k0 + 1) * n + i) * 4);
      _a.slerp(_b, u);
      const nm = this.names[i]!;
      if (c > 0) {
        if (nm === "spine_03") _a.premultiply(_c.setFromAxisAngle(_Y, sk.circle.torso * c * cs * DEG));
        else if (nm === "spine_02") _a.premultiply(_c.setFromAxisAngle(_X, sk.circle.torso * 0.6 * c * cc * DEG));
        else if (nm === sk.armBone) {
          _a.premultiply(_c.setFromAxisAngle(_Z, sk.circle.arm * c * cs * DEG));
          _a.premultiply(_c.setFromAxisAngle(_Y, sk.circle.arm * c * cc * DEG));
        } else if (nm === sk.wristBone) _a.premultiply(_c.setFromAxisAngle(_Z, tremor * DEG));
      }
      // L = P⁻¹ · d · P · L_rest, blended over the base's local rotation.
      const P = this.restParent[i]!;
      _q.copy(P).invert().multiply(_a).multiply(P).multiply(this.restLocal[i]!);
      b.quaternion.slerp(_q, w);
      if (x < 1) b.quaternion.slerp(_c.fromArray(this.fromQ, i * 4), 1 - x);
      b.quaternion.toArray(this.lastQ, i * 4);
    }
    // Pelvis offset (down, forward, right) in the facing frame, into the pelvis parent's frame.
    const pelvis = this.pelvis;
    if (pelvis && pelvis.parent) {
      const h0 = k0 * 3;
      const h1 = (k0 + 1) * 3;
      let down = (cur.hips[h0]! + (cur.hips[h1]! - cur.hips[h0]!) * u) * w;
      let fwd = (cur.hips[h0 + 1]! + (cur.hips[h1 + 1]! - cur.hips[h0 + 1]!) * u) * w;
      let right = (cur.hips[h0 + 2]! + (cur.hips[h1 + 2]! - cur.hips[h0 + 2]!) * u) * w;
      if (x < 1) {
        down += (this.fromHips[0]! - down) * (1 - x);
        fwd += (this.fromHips[1]! - fwd) * (1 - x);
        right += (this.fromHips[2]! - right) * (1 - x);
      }
      this.lastHips[0] = down;
      this.lastHips[1] = fwd;
      this.lastHips[2] = right;
      // Root frame: right +x, up +y, forward −z; then world, then the pelvis parent's frame.
      this.root.matrixWorld.decompose(_p, _c, _s);
      _v.set(right, -down, -fwd).applyQuaternion(_c);
      pelvis.parent.updateWorldMatrix(true, false);
      pelvis.parent.matrixWorld.decompose(_p, _c, _s);
      _v.applyQuaternion(_c.invert()).multiplyScalar(1 / (_s.x || 1));
      pelvis.position.add(_v);
    }
    this.saved = true;
    this.root.updateMatrixWorld(true);
  }

  /** The last shown pose (local rotations of the posed bones, the pelvis offset) and the cross-fade from it (s, −1 off). */
  private readonly lastQ: Float32Array;
  private readonly fromQ: Float32Array;
  private readonly lastHips = new Float64Array(3);
  private readonly fromHips = new Float64Array(3);
  private saved = false;
  private xfade = -1;
}
