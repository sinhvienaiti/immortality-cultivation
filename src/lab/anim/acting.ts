/**
 * Body acting for the lab caster (motion rounds 2–3; MOTION_PLAN step 2,
 * CHARACTER_ANIMATION §5.6; style canon D56: anime and mythic, bold poses that
 * read when the caster is 30–70 px tall at the play camera; canon D58 (8):
 * the arms, legs and body detailed and matched to each skill).
 *
 * The lab has only eight clips of its own (Idle, Run, Attack, Skill1, Skill2,
 * Ult, Dash, Hit) plus the Mesh2Motion walk and strafes, so each skill acts a
 * casting gesture (gestures.ts: the vocabulary, and which slot plays which)
 * as a procedural layer on top of a clip section:
 * - anticipation while the word is typed (the centre of mass drops, the
 *   striking arm draws back, the torso counter-twists, the weight goes onto
 *   the back foot), built with the progress and completed over ~8 frames after
 *   the next-to-last key; an automatic attack can be primed the same way;
 * - a decisive release on the last key (the arm to the target, the torso into
 *   the cast, the weight onto the front foot, the stance step): ~85 % of the
 *   way in 6 frames, all of it in ~8;
 * - a hold (longer where the skill's own strikes still land, with a pulse on
 *   each beat), a sustain pose where the gesture has one, an overshoot and
 *   settle over ~0.3 s (underdamped springs), then a 0.5 s recovery while the
 *   base clip cross-fades to Idle and the feet step back to their stance.
 * Hands: the wrist follows the gesture's hand direction (Lam has no finger
 * bones; a rig with fingers forms `fingers` too). Feet: a gesture's stance is
 * handed to the foot lock (foot-ik.ts) as offsets per foot plus a step
 * request; the Animator passes it on each frame.
 * Also the dash (compression, a low glide leaning far forward with the arms
 * trailing, a deep landing compression), the hit stagger (round 3: rises in 2
 * frames, holds 3–4 frames, recovers with a small overshoot; a 0.38 m step back
 * with the feet stepping), the stop sway and the arm tuck of the run.
 *
 * Every output is a spring (critically damped, or underdamped where the
 * overshoot is the point), so a skill typed over another, a walk or a hit in
 * the middle all blend. Arm directions spring along great circles (the angle
 * left to the goal is the spring), so an arm swung from behind to the front
 * keeps an even angular speed instead of whipping through a short vector.
 * Arms are aimed in world space after the torso layers
 * (shoulder → elbow, elbow → wrist, wrist → palm rotated towards a direction in
 * the character frame, by a weight), so the rig's local axes never matter. No
 * allocation per frame.
 */
import * as THREE from "three";
import { GESTURES, GESTURE_GAIN, slotGesture, type ArmPose, type GestureId, type Pose, type SlotGesture, type Stance } from "./gestures";
import { clamp, criticalSpring, DEG, smoothstep, underdampedSpring } from "./math";
import { Rig, rotateBoneWorld, worldQuat } from "./rig";

/** A skill slot (auto, k1, …, k7): its gesture comes from SLOT_GESTURES. */
export type MoveId = string;

/** A slot's gesture resolved for play: poses with the gain applied, the slot's rhythm. */
export interface MoveDef {
  readonly gesture: GestureId;
  readonly antic: Pose;
  readonly release: Pose;
  readonly sustain: Pose | null;
  readonly sustainS: number;
  readonly settle: Pose;
  readonly holdS: number;
  readonly beats: readonly number[] | null;
  readonly intended: boolean;
  /** Lunge towards the target at the release (m, gain applied). */
  readonly stepM: number;
  readonly targetY: number;
  readonly anticStance: Stance | null;
  readonly releaseStance: Stance | null;
  readonly tailWhip: number;
  readonly faceTarget: boolean;
}

/** Deepest pelvis drop a gesture may ask for after the gain (m; Lam's legs are 0.37 m). */
const CROUCH_MAX = 0.11;

function gainPose(p: Pose, k: number): Pose {
  return {
    crouch: Math.min(CROUCH_MAX, p.crouch * k),
    twist: p.twist * k,
    lean: p.lean * k,
    side: p.side * k,
    shiftF: (p.shiftF ?? 0) * k,
    shiftR: (p.shiftR ?? 0) * k,
    head: (p.head ?? 0) * k,
    r: p.r,
    l: p.l,
  };
}

function shareStance(s: Stance | undefined, k: number): Stance | null {
  if (!s || k <= 0) return null;
  return { ...s, lf: s.lf * k, lr: s.lr * k, lyaw: s.lyaw * k, rf: s.rf * k, rr: s.rr * k, ryaw: s.ryaw * k };
}

const defCache = new Map<string, { use: SlotGesture; def: MoveDef }>();

/** The slot's gesture as played (cached until the slot is remapped). */
export function moveDef(slot: MoveId): MoveDef {
  const use = slotGesture(slot);
  const hit = defCache.get(slot);
  if (hit && hit.use === use) return hit.def;
  const g = GESTURES[use.gesture];
  const k = GESTURE_GAIN;
  const share = use.stance ?? 1;
  const release = gainPose(g.release, k);
  const def: MoveDef = {
    gesture: g.id,
    antic: gainPose(g.antic, k),
    release: use.offHand ? { ...release, l: use.offHand } : release,
    sustain: g.sustain && (use.sustainS ?? 0) > 0 ? gainPose(g.sustain, k) : null,
    sustainS: g.sustain ? (use.sustainS ?? 0) : 0,
    settle: gainPose(g.settle, k),
    holdS: use.holdS,
    beats: use.beats ?? null,
    intended: use.intended ?? false,
    stepM: (g.stepM ?? 0) * k * share,
    targetY: use.targetY,
    anticStance: shareStance(g.anticStance, share),
    releaseStance: shareStance(g.releaseStance, share),
    tailWhip: g.tailWhip,
    faceTarget: g.faceTarget,
  };
  defCache.set(slot, { use, def });
  return def;
}

const ZERO: Pose = { crouch: 0, twist: 0, lean: 0, side: 0, r: null, l: null };
/**
 * The arms as Idle holds them (character frame), read while nothing acts: the recovery first brings the aimed arms
 * there at full weight, so the base clip's switch to Idle under them does not show, then lets the aim go (round 3:
 * the clip swung the upper arm 95° in ~6 frames as the aim faded over it).
 */
const REST_R = { up: [0, 0.35, -0.94], fore: [0.2, 0.2, -0.96], w: 1 };
const REST_L = { up: [0, -0.35, -0.94], fore: [0.2, -0.2, -0.96], w: 1 };
const REST: Pose = { crouch: 0, twist: 0, lean: 0, side: 0, r: REST_R as unknown as ArmPose, l: REST_L as unknown as ArmPose };
/** Share of the recovery spent at the rest pose before the aim lets go. */
const REST_SHARE = 0.5;
/** A stance with both feet under the body (the clip's own feet). */
const NEUTRAL: Stance = { lf: 0, lr: 0, lyaw: 0, rf: 0, rr: 0, ryaw: 0, stepS: 0.22, liftM: 0.055 };

/** Release snap (s): the arms reach the extreme in ~6 frames. Settle and recovery lengths (s). */
const SNAP_S = 0.1;
const SETTLE_S = 0.3;
const RECOVER_S = 0.5;
/** Dash: compression frames at the start (s), the landing brake (s). */
const COMPRESS_S = 0.083;
const BRAKE_S = 0.28;
/**
 * A blow (round-2 judges: rise in 2 frames, hold 3–4, step back 0.3–0.5 m with a step): the stagger rises over
 * HIT_RISE_S, holds HIT_HOLD_S, then recovers on an underdamped spring (a small overshoot); the shown root steps back
 * over HIT_OUT_S, stays HIT_STAY_S, and comes back over HIT_BACK_S.
 */
const HIT_RISE_S = 2 / 60;
const HIT_HOLD_S = 3.5 / 60;
const HIT_OUT_S = 0.14;
const HIT_STAY_S = 0.3;
const HIT_BACK_S = 0.6;
const OFF_MAX_M = 0.45;
/** The stagger at its peak: lean and side lean along the push (deg), head snap (deg), knees buckling (m). */
const HIT_LEAN = 15;
const HIT_SIDE = 12;
const HIT_HEAD = 20;
const HIT_TWIST = 10;
const HIT_CROUCH = 0.035;

type Phase = "idle" | "charge" | "strike" | "dash" | "land";
/** Strike sub-phases, by age since the release. */
export type StrikeStage = "snap" | "hold" | "sustain" | "settle" | "recover" | "done";

// Channels: 0 crouch, 1 twist, 2 lean, 3 side, 4 shift forward, 5 shift right, 6 head pitch, 7 spare; then per arm
// (R at 8, L at 19): up xyz, fore xyz, weight, hand xyz, hand weight.
const N = 30;
const C_CROUCH = 0;
const C_TWIST = 1;
const C_LEAN = 2;
const C_SIDE = 3;
const C_SHIFTF = 4;
const C_SHIFTR = 5;
const C_HEAD = 6;
const N_BODY = 7;
const ARM_R = 8;
const ARM_L = 19;
const A_W = 6;
const A_HAND = 7;
const A_HW = 10;
/** Segments: R upper, R fore, L upper, L fore, R hand, L hand. */
const SEGS = 6;

const _sp = new Float64Array(2);
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _sw = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fw = new THREE.Vector3();

export class Acting {
  /** Spring state: value, velocity per channel. */
  private readonly s = new Float64Array(N * 2);
  private readonly goal = new Float64Array(N);
  /** Segment directions (character frame, unit) and the angle springs' speed. */
  private readonly dir = new Float64Array(SEGS * 3);
  private readonly dirV = new Float64Array(SEGS);
  /** Where the clip and layers held each segment last frame (character frame, unit), and whether it was read. */
  private readonly clipDir = new Float64Array(SEGS * 3);
  private clipSeen = false;
  /** Each segment's aimed orientation in the character frame (yaw taken out; x, y, z, w), its direction, and whether set. */
  private readonly aimQ = new Float64Array(SEGS * 4);
  private readonly aimD = new Float64Array(SEGS * 3);
  private readonly aimOn = new Uint8Array(SEGS);
  /** Each segment's last clip-to-aim turn (world quaternion), for hemisphere continuity. */
  private readonly turnPrev = new Float64Array(SEGS * 4);
  private phase: Phase = "idle";
  private move: MoveId | null = null;
  private def: MoveDef | null = null;
  /** Anticipation weight (spring) and its goal. */
  private readonly antic = new Float64Array(2);
  private anticGoal = 0;
  private age = 0;
  private beat = 0;
  /** Pulse (underdamped), stop sway (underdamped), dip (landing, underdamped). */
  private readonly pulse = new Float64Array(2);
  private hitF = -1;
  private hitR = 0;
  /** The blow's age (s, −1 none), its recovery spring and the envelope this frame (0–1). */
  private hitT = -1;
  private readonly hitRec = new Float64Array(2);
  private hitE = 0;
  private readonly sway = new Float64Array(2);
  private readonly dip = new Float64Array(2);
  /** Target (world) and the facing it was aimed from. */
  private tx = 0;
  private ty = 1;
  private tz = 0;
  private hasTarget = false;
  /** Run arm tuck weight (0–1), set by the Animator from the gait. */
  tuck = 0;
  // Outputs (deg, m) read by Layers.
  crouchM = 0;
  twistDeg = 0;
  leanDeg = 0;
  sideDeg = 0;
  shiftFM = 0;
  shiftRM = 0;
  headPitchDeg = 0;
  headRollDeg = 0;
  /**
   * The shown root's offset from the logical position (world m): a lunge or a step back, eased out, held, then
   * eased back (review fix: it was added to the logical position the skill code reads, so every K2 and every blow
   * moved the caster for good, 1.08 m after six K2 casts; the sim owns where the caster stands).
   */
  offX = 0;
  offZ = 0;
  private offFromX = 0;
  private offFromZ = 0;
  private offToX = 0;
  private offToZ = 0;
  private offT = 1;
  private offDur = 1;
  /** What holds the offset out: the strike that lunged (until its recovery), a blow (`offHoldS` left), or nothing. */
  private offOwner: "none" | "strike" | "hit" = "none";
  private offHoldS = 0;
  /**
   * Feet: the stance asked for (offsets per foot, the Animator hands them to the foot lock each frame), a counter that
   * changes on each new request (the feet step to it now), and whether the feet stay where the logical body stands (a
   * lunge: the back foot stays planted) or follow the shown root (a blow's step back).
   */
  stance: Stance = NEUTRAL;
  stanceSeq = 0;
  stanceFirst = -1;
  private stanceOn = false;
  private anticStanced = false;
  get anchor(): number {
    return this.offOwner === "hit" ? 0 : 1;
  }
  /** A tail whip asked for this frame (m/s at the tip, against the facing); the Animator takes it. */
  tailKick = 0;

  private readonly upperR: THREE.Bone | null;
  private readonly lowerR: THREE.Bone | null;
  private readonly handR: THREE.Bone | null;
  private readonly upperL: THREE.Bone | null;
  private readonly lowerL: THREE.Bone | null;
  private readonly handL: THREE.Bone | null;
  /** Palm sockets (wrist → palm is the hand's direction). */
  private readonly palmR: THREE.Object3D | null;
  private readonly palmL: THREE.Object3D | null;
  private readonly pelvis: THREE.Bone | null;
  private readonly neck: THREE.Bone | null;

  constructor(rig: Rig) {
    this.upperR = rig.bone("upperarm_r");
    this.lowerR = rig.bone("lowerarm_r");
    this.handR = rig.bone("hand_r");
    this.upperL = rig.bone("upperarm_l");
    this.lowerL = rig.bone("lowerarm_l");
    this.handL = rig.bone("hand_l");
    this.palmR = rig.model.getObjectByName("FX_HAND_R") ?? null;
    this.palmL = rig.model.getObjectByName("FX_HAND_L") ?? null;
    this.pelvis = rig.bone("pelvis");
    this.neck = rig.bone("neck_01");
    this.reset();
  }

  reset(): void {
    this.s.fill(0);
    this.goal.fill(0);
    this.dir.fill(0);
    this.dirV.fill(0);
    this.clipDir.fill(0);
    this.clipSeen = false;
    this.aimQ.fill(0);
    this.aimD.fill(0);
    this.aimOn.fill(0);
    this.turnPrev.fill(0);
    for (let g = 0; g < SEGS; g += 1) this.dir[g * 3 + 2] = -1;
    this.antic.fill(0);
    this.anticGoal = 0;
    this.pulse.fill(0);
    this.hitT = -1;
    this.hitRec.fill(0);
    this.hitE = 0;
    this.sway.fill(0);
    this.dip.fill(0);
    this.phase = "idle";
    this.move = null;
    this.def = null;
    this.age = 0;
    this.beat = 0;
    this.hasTarget = false;
    this.intendedTail = 0;
    this.offX = this.offZ = this.offFromX = this.offFromZ = this.offToX = this.offToZ = 0;
    this.offT = this.offDur = 1;
    this.offOwner = "none";
    this.offHoldS = 0;
    this.stance = NEUTRAL;
    this.stanceOn = false;
    this.anticStanced = false;
    this.stanceFirst = -1;
    this.tailKick = 0;
    this.tuck = 0;
    this.crouchM = this.twistDeg = this.leanDeg = this.sideDeg = this.shiftFM = this.shiftRM = this.headPitchDeg = this.headRollDeg = 0;
  }

  /** The strike stage now (the Animator holds or releases the base clip by it). */
  get stage(): StrikeStage {
    if (this.phase !== "strike" || !this.def) return "done";
    const d = this.def;
    const a = this.age;
    const hold = SNAP_S + d.holdS;
    const sustain = hold + (d.sustain ? d.sustainS : 0);
    const last = d.beats ? d.beats[d.beats.length - 1]! + 0.1 : 0;
    const keep = Math.max(sustain, last);
    if (a < SNAP_S) return "snap";
    if (a < hold) return "hold";
    if (a < keep) return "sustain";
    if (a < keep + SETTLE_S) return "settle";
    if (a < keep + SETTLE_S + RECOVER_S) return "recover";
    return "done";
  }

  /** Age (s) at which the recovery starts. */
  private recoverAt(): number {
    const d = this.def;
    if (!d) return 0;
    const sustain = SNAP_S + d.holdS + (d.sustain ? d.sustainS : 0);
    const last = d.beats ? d.beats[d.beats.length - 1]! + 0.1 : 0;
    return Math.max(sustain, last) + SETTLE_S;
  }

  /** Both arms are up on purpose (K5's salute while held, and the ~0.12 s the arms take to come down from it). */
  get intended(): boolean {
    return this.intendedNow() || this.intendedTail > 0;
  }

  private intendedNow(): boolean {
    if (this.phase !== "strike" || !this.def?.intended) return false;
    const st = this.stage;
    // The arms come down from the salute over the first frames of the sustain.
    return st === "snap" || st === "hold" || (st === "sustain" && this.age < SNAP_S + this.def.holdS + 0.2);
  }

  /** Seconds the arms still come down after an intended pose ended (a new word typed over it cuts the salute short). */
  private intendedTail = 0;

  get active(): boolean {
    return this.phase !== "idle";
  }

  get moveId(): MoveId | null {
    return this.move;
  }

  /** The blow's stagger right now (0–1), for checks and the chest ring. */
  get hitEnvelope(): number {
    return this.hitE;
  }

  private setTarget(x: number, y: number, z: number): void {
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.hasTarget = true;
  }

  /** Asks the feet for a stance (null: back under the body), stepping now. */
  private requestStance(s: Stance | null, first: "l" | "r" | undefined): void {
    this.stance = s ?? NEUTRAL;
    this.stanceOn = s !== null;
    this.stanceFirst = first === "l" ? 0 : first === "r" ? 1 : -1;
    this.stanceSeq += 1;
  }

  /** A key of the word for `move` (progress 0…1, `keysLeft` still to type) aimed at (tx, tz). */
  charge(move: MoveId, progress: number, keysLeft: number, tx: number, tz: number): void {
    const def = moveDef(move);
    if (this.phase !== "charge" || this.move !== move) {
      this.phase = "charge";
      this.move = move;
      this.def = def;
      this.age = 0;
      this.antic[1] = 0;
      this.anticStanced = false;
    }
    this.setTarget(tx, def.targetY, tz);
    // Builds with the word; after the next-to-last key it completes (~8 frames, the anticipation proper).
    this.anticGoal = keysLeft <= 1 ? 1 : 0.25 + 0.45 * clamp(progress, 0, 1);
  }

  /** The dash word: the body compresses as it is typed. */
  chargeDash(progress: number, keysLeft: number): void {
    if (this.phase !== "charge" || this.move !== null) {
      this.phase = "charge";
      this.move = null;
      this.def = null;
      this.age = 0;
    }
    this.anticGoal = keysLeft <= 1 ? 1 : 0.3 + 0.4 * clamp(progress, 0, 1);
  }

  /**
   * The last key: the release pose, the hold, the settle and the recovery run on their own from here. Aimed at
   * (tx, tz): the typed target, or for a cast from code the point ahead, so no stale target is aimed at.
   */
  release(move: MoveId, tx: number, tz: number): void {
    const def = moveDef(move);
    this.phase = "strike";
    this.move = move;
    this.def = def;
    this.age = 0;
    this.beat = 0;
    this.setTarget(tx, def.targetY, tz);
    this.anticGoal = 0;
    if (def.stepM > 0) {
      // The lunge towards the target, held while the strike holds; its recovery steps back (view only).
      const dx = tx - this.rootX;
      const dz = tz - this.rootZ;
      const l = Math.hypot(dx, dz);
      if (l > 1e-3) {
        this.offsetTo((dx / l) * def.stepM, (dz / l) * def.stepM, 0.12);
        this.offOwner = "strike";
      }
    }
    if (def.releaseStance) this.requestStance(def.releaseStance, def.releaseStance.first);
    this.tailKick += def.tailWhip;
  }

  /** The caster's root and facing this frame (for the lunge direction). */
  private rootX = 0;
  private rootZ = 0;

  dashStart(): void {
    this.phase = "dash";
    this.move = null;
    this.def = null;
    this.age = 0;
    this.anticGoal = 0;
    this.stance = NEUTRAL;
    this.stanceOn = false;
    this.tailKick += GESTURES.dashCrouch.tailWhip;
  }

  /** Touch-down after a dash: the braking pose (a deep compression), then the recovery. */
  dashLand(): void {
    this.phase = "land";
    this.age = 0;
    this.dip[1] = this.dip[1]! + 1.6;
    this.tailKick += 0.8;
  }

  /** Walking off (or anything that drops the skill): the pose lets go on the recovery springs. */
  cancel(): void {
    if (this.phase === "idle") return;
    this.phase = "idle";
    this.move = null;
    this.def = null;
    this.anticGoal = 0;
    // Moving, the feet follow the gait: the stance goes without a step request.
    this.stance = NEUTRAL;
    this.stanceOn = false;
  }

  /** An enemy blow pushing the body along (pushF, pushR) in the character frame (unit). */
  hit(pushF: number, pushR: number, stepM: number, fromX: number, fromZ: number): void {
    const l = Math.hypot(pushF, pushR) || 1;
    this.hitF = pushF / l;
    this.hitR = pushR / l;
    this.hitT = 0;
    this.hitRec[0] = 1;
    this.hitRec[1] = 0;
    // The step back, away from the blow (view only): held a moment, then the feet bring the body back.
    const dx = this.rootX - fromX;
    const dz = this.rootZ - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      this.offsetTo(this.offX + (dx / d) * stepM, this.offZ + (dz / d) * stepM, HIT_OUT_S);
      this.offOwner = "hit";
      this.offHoldS = HIT_OUT_S + HIT_STAY_S;
      // Both feet hop back with the body (a blow throws it faster than one foot at a time can follow).
      this.stance = { ...NEUTRAL, stepS: 0.17, liftM: 0.05 };
      this.stanceOn = false;
      this.stanceFirst = -2;
      this.stanceSeq += 1;
    }
    this.tailKick += 1.2;
  }

  /** Arriving from a walk or run: the body sways on past the stop and settles (a balance step's weight). */
  stopSway(speed: number): void {
    this.sway[1] = this.sway[1]! + 110 + 35 * Math.min(3, speed);
    this.tailKick += 0.4 + 0.25 * Math.min(3, speed);
  }

  /** Eases the view offset from where it is to (x, z) over `dur` s (smoothstep). */
  private offsetTo(x: number, z: number, dur: number): void {
    const l = Math.hypot(x, z);
    const k = l > OFF_MAX_M ? OFF_MAX_M / l : 1;
    this.offFromX = this.offX;
    this.offFromZ = this.offZ;
    this.offToX = x * k;
    this.offToZ = z * k;
    this.offT = 0;
    this.offDur = Math.max(1e-3, dur);
  }

  /** Advances the timeline and the springs; (x, z) the root. */
  update(dt: number, x: number, z: number): void {
    this.rootX = x;
    this.rootZ = z;
    this.intendedTail = this.intendedNow() ? 0.12 : Math.max(0, this.intendedTail - dt);
    this.age += dt;
    criticalSpring(this.antic, 0, this.anticGoal, this.anticGoal >= 1 ? 0.035 : 0.07, dt);
    const a = Math.max(0, this.antic[0]!);
    let hlScalar = 0.1;
    let hlArm = 0.1;
    let under = false;
    let underHz = 3.2;
    let underZeta = 0.45;
    const dash = GESTURES.dashCrouch;
    switch (this.phase) {
      case "idle":
        this.setGoal(ZERO, 1, null);
        hlScalar = 0.12;
        hlArm = 0.11;
        break;
      case "charge":
        if (this.def) {
          this.setGoal(this.def.antic, a, this.def);
          // Past half of the word the feet take the anticipation's stance (the ultimate widens its base).
          if (this.def.anticStance && !this.anticStanced && a > 0.5) {
            this.anticStanced = true;
            this.requestStance(this.def.anticStance, this.def.anticStance.first);
          }
        } else this.setGoal(gained(dash.antic), a, null);
        hlScalar = a > 0.95 ? 0.035 : 0.06;
        hlArm = a > 0.95 ? 0.035 : 0.06;
        break;
      case "strike": {
        const d = this.def!;
        const st = this.stage;
        if (st === "snap" || st === "hold") {
          this.setGoal(d.release, 1, d);
          hlArm = 0.045;
          hlScalar = 0.035;
          // The twist and lean whip through and back (underdamped): the decisive release.
          under = true;
          underHz = 4.2;
          underZeta = 0.55;
        } else if (st === "sustain") {
          this.setGoal(d.sustain ?? d.release, 1, d);
          hlArm = 0.07;
          hlScalar = 0.08;
        } else if (st === "settle") {
          this.setGoal(d.settle, 1, d);
          hlArm = 0.07;
          under = true;
          underHz = 3.2;
          underZeta = 0.45;
        } else {
          // Recovery: the arms to where Idle holds them at full weight, then the aim lets go (the clip is Idle by then).
          const into = this.age - this.recoverAt();
          this.setGoal(st === "recover" && into < RECOVER_S * REST_SHARE ? REST : ZERO, 1, null);
          hlScalar = 0.12;
          hlArm = st === "recover" && into < RECOVER_S * REST_SHARE ? 0.09 : 0.08;
          // The feet come back under the body with the recovery.
          if (this.stanceOn) this.requestStance(null, undefined);
          if (st === "done") this.phase = "idle";
        }
        // Beats: the skill's later strikes pulse through the body.
        if (d.beats && this.beat < d.beats.length && this.age >= d.beats[this.beat]!) {
          this.pulse[1] = this.pulse[1]! + 90;
          this.beat += 1;
        }
        break;
      }
      case "dash":
        this.setGoal(gained(this.age < COMPRESS_S ? dash.release : dash.sustain!), 1, null);
        hlScalar = this.age < COMPRESS_S ? 0.025 : 0.045;
        hlArm = this.age < COMPRESS_S ? 0.03 : 0.05;
        break;
      case "land":
        if (this.age < BRAKE_S) {
          this.setGoal(gained(dash.settle), 1, null);
          hlArm = 0.05;
          hlScalar = 0.03;
          under = true;
          underHz = 3.4;
          underZeta = 0.5;
        } else {
          this.setGoal(ZERO, 1, null);
          hlScalar = 0.12;
          hlArm = 0.11;
          if (this.age > BRAKE_S + RECOVER_S) this.phase = "idle";
        }
        break;
    }
    // A charge or strike dropped for a walk keeps no stance (the gait owns the feet).
    if (this.phase === "idle" && this.stanceOn) this.requestStance(null, undefined);
    for (let c = 0; c < N_BODY; c += 1) {
      if (under && c !== C_CROUCH && c !== C_SHIFTF && c !== C_SHIFTR) underdampedSpring(this.s, c * 2, this.goal[c]!, underHz, underZeta, dt);
      else criticalSpring(this.s, c * 2, this.goal[c]!, hlScalar, dt);
    }
    // An arm unseen before this frame's step (weight ~0) follows where the clip holds it (last frame). A new aim then
    // takes its weight at once, leaving from that direction, so nothing jumps and the arm turns along one great
    // circle. Review fix: the old test read the weight after its step and needed the goal at 0, so a new aim swept in
    // from the last pose's stale direction; and a weight fading in over Attack's own swing (~40°/frame, the clip and
    // the aim 130–150° apart) turned the partial swing's axis: the upper arm jumped 142° in one frame.
    const unseenR = this.s[(ARM_R + A_W) * 2]! < 0.02;
    const unseenL = this.s[(ARM_L + A_W) * 2]! < 0.02;
    const unseenHR = this.s[(ARM_R + A_HW) * 2]! < 0.02;
    const unseenHL = this.s[(ARM_L + A_HW) * 2]! < 0.02;
    criticalSpring(this.s, (ARM_R + A_W) * 2, this.goal[ARM_R + A_W]!, hlArm, dt);
    criticalSpring(this.s, (ARM_L + A_W) * 2, this.goal[ARM_L + A_W]!, hlArm, dt);
    criticalSpring(this.s, (ARM_R + A_HW) * 2, this.goal[ARM_R + A_HW]!, hlArm, dt);
    criticalSpring(this.s, (ARM_L + A_HW) * 2, this.goal[ARM_L + A_HW]!, hlArm, dt);
    for (let g = 0; g < SEGS; g += 1) {
      const arm = g === 0 || g === 1 || g === 4 ? ARM_R : ARM_L;
      const o = g < 4 ? arm + (g % 2) * 3 : arm + A_HAND;
      const unseen = g < 4 ? (g < 2 ? unseenR : unseenL) : g === 4 ? unseenHR : unseenHL;
      const ch = g < 4 ? arm + A_W : arm + A_HW;
      if (unseen && this.clipSeen) {
        const k = g * 3;
        this.dir[k] = this.clipDir[k]!;
        this.dir[k + 1] = this.clipDir[k + 1]!;
        this.dir[k + 2] = this.clipDir[k + 2]!;
        this.dirV[g] = 0;
        if (this.goal[ch]! >= 0.02) {
          this.s[ch * 2] = this.goal[ch]!;
          this.s[ch * 2 + 1] = 0;
        }
      }
      this.sphereStep(g, this.goal[o]!, this.goal[o + 1]!, this.goal[o + 2]!, unseen && !this.clipSeen ? 0 : hlArm, dt);
    }
    underdampedSpring(this.pulse, 0, 0, 5, 0.4, dt);
    underdampedSpring(this.sway, 0, 0, 2.6, 0.45, dt);
    underdampedSpring(this.dip, 0, 0, 3.5, 0.7, dt);
    this.updateHit(dt);
    const p = this.pulse[0]!;
    const e = this.hitE;
    this.crouchM = this.s[C_CROUCH * 2]! + 0.012 * p + 0.035 * this.dip[0]! + HIT_CROUCH * e;
    this.twistDeg = this.s[C_TWIST * 2]! + 4 * p + this.hitR * HIT_TWIST * e;
    this.leanDeg = this.s[C_LEAN * 2]! + 4 * p + this.hitF * HIT_LEAN * e + this.sway[0]!;
    this.sideDeg = this.s[C_SIDE * 2]! + this.hitR * HIT_SIDE * e;
    this.shiftFM = this.s[C_SHIFTF * 2]!;
    this.shiftRM = this.s[C_SHIFTR * 2]!;
    this.headPitchDeg = this.s[C_HEAD * 2]! - this.hitF * HIT_HEAD * e;
    this.headRollDeg = this.hitR * HIT_HEAD * 0.5 * e;
    // The view offset (lunge, step back): held by what made it, then eased back to the logical position.
    if (this.offOwner === "strike") {
      const st = this.stage;
      const held = this.phase === "strike" && this.def !== null && this.def.stepM > 0 && (st === "snap" || st === "hold" || st === "sustain" || st === "settle");
      if (!held) {
        this.offOwner = "none";
        this.offsetTo(0, 0, RECOVER_S);
      }
    } else if (this.offOwner === "hit") {
      this.offHoldS -= dt;
      if (this.offHoldS <= 0) {
        this.offOwner = "none";
        this.offsetTo(0, 0, HIT_BACK_S);
      }
    }
    this.offT += dt;
    const u = this.offT / this.offDur;
    // Out fast (the body is thrown or drives in), back eased both ways.
    const k = this.offOwner === "none" ? smoothstep(0, 1, u) : 1 - (1 - clamp(u, 0, 1)) ** 3;
    this.offX = this.offFromX + (this.offToX - this.offFromX) * k;
    this.offZ = this.offFromZ + (this.offToZ - this.offFromZ) * k;
  }

  /** The blow's envelope: up in 2 frames, held 3–4, then down on an underdamped spring (a small overshoot). */
  private updateHit(dt: number): void {
    if (this.hitT < 0) {
      this.hitE = 0;
      return;
    }
    this.hitT += dt;
    const t = this.hitT;
    if (t < HIT_RISE_S) {
      const v = t / HIT_RISE_S;
      this.hitE = 1 - (1 - v) * (1 - v);
    } else if (t < HIT_RISE_S + HIT_HOLD_S) {
      this.hitE = 1;
    } else {
      underdampedSpring(this.hitRec, 0, 0, 2.2, 0.62, dt);
      this.hitE = this.hitRec[0]!;
      if (t > 1.4) {
        this.hitT = -1;
        this.hitE = 0;
      }
    }
  }

  /**
   * Segment `g` towards the direction (x, y, z) along the great circle: the angle left is a critically damped
   * spring (its speed kept in dirV), so the arm turns at an even angular speed whatever the swing. Half-life 0 snaps.
   */
  private sphereStep(g: number, x: number, y: number, z: number, halflife: number, dt: number): void {
    const l = Math.hypot(x, y, z);
    if (l < 1e-6) return;
    const gx = x / l;
    const gy = y / l;
    const gz = z / l;
    const o = g * 3;
    let dx = this.dir[o]!;
    let dy = this.dir[o + 1]!;
    let dz = this.dir[o + 2]!;
    const dot = clamp(dx * gx + dy * gy + dz * gz, -1, 1);
    const th = Math.acos(dot);
    if (halflife <= 0 || th < 1e-4) {
      this.dir[o] = gx;
      this.dir[o + 1] = gy;
      this.dir[o + 2] = gz;
      if (halflife <= 0) this.dirV[g] = 0;
      return;
    }
    _sp[0] = th;
    _sp[1] = this.dirV[g]!;
    criticalSpring(_sp, 0, 0, halflife, dt);
    const left = Math.max(0, _sp[0]!);
    this.dirV[g] = left > 0 ? _sp[1]! : 0;
    const turn = th - left;
    // Axis d × g (an arbitrary perpendicular when the two are opposite).
    let ax = dy * gz - dz * gy;
    let ay = dz * gx - dx * gz;
    let az = dx * gy - dy * gx;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-6) {
      ax = dy;
      ay = -dx;
      az = 0;
      al = Math.hypot(ax, ay, az) || 1;
    }
    ax /= al;
    ay /= al;
    az /= al;
    // Rodrigues: d' = d cos φ + (a × d) sin φ + a (a·d)(1 − cos φ).
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const ad = ax * dx + ay * dy + az * dz;
    const cx = ay * dz - az * dy;
    const cy = az * dx - ax * dz;
    const cz = ax * dy - ay * dx;
    dx = dx * c + cx * sn + ax * ad * (1 - c);
    dy = dy * c + cy * sn + ay * ad * (1 - c);
    dz = dz * c + cz * sn + az * ad * (1 - c);
    const dl = Math.hypot(dx, dy, dz) || 1;
    this.dir[o] = dx / dl;
    this.dir[o + 1] = dy / dl;
    this.dir[o + 2] = dz / dl;
  }

  /** Goals from a pose at weight k (an arm's weight scales; its directions keep their goal). */
  private setGoal(pose: Pose, k: number, def: MoveDef | null): void {
    this.goal[C_CROUCH] = pose.crouch * k;
    this.goal[C_TWIST] = pose.twist * k;
    this.goal[C_LEAN] = pose.lean * k;
    this.goal[C_SIDE] = pose.side * k;
    this.goal[C_SHIFTF] = (pose.shiftF ?? 0) * k;
    this.goal[C_SHIFTR] = (pose.shiftR ?? 0) * k;
    this.goal[C_HEAD] = (pose.head ?? 0) * k;
    this.armGoal(ARM_R, pose.r, k, def);
    this.armGoal(ARM_L, pose.l, k, def);
  }

  private armGoal(o: number, arm: ArmPose | null, k: number, def: MoveDef | null): void {
    if (!arm) {
      this.goal[o + A_W] = 0;
      this.goal[o + A_HW] = 0;
      return;
    }
    let ux = arm.up[0];
    let uy = arm.up[1];
    let uz = arm.up[2];
    let fx = arm.fore[0];
    let fy = arm.fore[1];
    let fz = arm.fore[2];
    const aim = arm.aim ?? 0;
    if (aim > 0 && def && this.hasTarget) {
      // The target in the character frame from the shoulder (≈1.2 m up, 0.25 m to the side).
      const f0 = this.facingX;
      const f1 = this.facingZ;
      const side = o === ARM_R ? 0.25 : -0.25;
      const sx = this.rootX - f1 * side;
      const sz = this.rootZ + f0 * side;
      const dx = this.tx - sx;
      const dz = this.tz - sz;
      const tf = dx * f0 + dz * f1;
      const tr = -dx * f1 + dz * f0;
      const th = Math.hypot(tf, tr) || 1;
      const tu = (this.ty - 1.2) / th + (arm.lift ?? 0);
      const tl = Math.hypot(tf / th, tr / th, tu) || 1;
      const bx = tf / th / tl;
      const by = tr / th / tl;
      const bz = tu / tl;
      const lu = Math.hypot(ux, uy, uz) || 1;
      const lf = Math.hypot(fx, fy, fz) || 1;
      ux = (ux / lu) * (1 - aim) + bx * aim;
      uy = (uy / lu) * (1 - aim) + by * aim;
      uz = (uz / lu) * (1 - aim) + bz * aim;
      fx = (fx / lf) * (1 - aim) + bx * aim;
      fy = (fy / lf) * (1 - aim) + by * aim;
      fz = (fz / lf) * (1 - aim) + bz * aim;
    }
    this.goal[o] = ux;
    this.goal[o + 1] = uy;
    this.goal[o + 2] = uz;
    this.goal[o + 3] = fx;
    this.goal[o + 4] = fy;
    this.goal[o + 5] = fz;
    this.goal[o + A_W] = arm.w * k;
    const hand = arm.hand;
    if (hand === undefined) this.goal[o + A_HW] = 0;
    else {
      // A straight wrist continues the forearm; else the hand's own direction.
      const h = hand === "fore" ? null : hand;
      this.goal[o + A_HAND] = h ? h[0] : fx;
      this.goal[o + A_HAND + 1] = h ? h[1] : fy;
      this.goal[o + A_HAND + 2] = h ? h[2] : fz;
      this.goal[o + A_HW] = arm.w * k;
    }
  }

  /** The facing used for the aim (set by the Animator before update). */
  facingX = 0;
  facingZ = 1;

  /**
   * The arm aims, on fresh world matrices after the torso layers: each upper arm, forearm then hand turns from where
   * the clip and layers put it towards its direction by its weight. `fx, fz`: the facing.
   */
  applyArms(fx: number, fz: number): void {
    this.aimArm(this.upperR, this.lowerR, this.handR, this.palmR, ARM_R, fx, fz);
    this.aimArm(this.upperL, this.lowerL, this.handL, this.palmL, ARM_L, fx, fz);
  }

  private aimArm(upper: THREE.Bone | null, lower: THREE.Bone | null, hand: THREE.Bone | null, palm: THREE.Object3D | null, o: number, fx: number, fz: number): void {
    if (!upper || !lower || !hand || !upper.parent || !lower.parent) return;
    const w = clamp(this.s[(o + A_W) * 2]!, 0, 1);
    const seg = o === ARM_R ? 0 : 2;
    _qy.setFromAxisAngle(_Y, Math.atan2(fx, fz));
    // Upper arm: shoulder → elbow towards its goal. The clip's direction is kept (character frame) for a new aim's start.
    upper.getWorldPosition(_a);
    lower.getWorldPosition(_b);
    _c.subVectors(_b, _a).normalize();
    this.keepClipDir(seg * 3, fx, fz);
    if (w >= 1e-3) this.aimSegment(upper, seg, w, fx, fz);
    else this.aimOn[seg] = 0;
    // Forearm: elbow → wrist.
    lower.getWorldPosition(_a);
    hand.getWorldPosition(_b);
    _c.subVectors(_b, _a).normalize();
    this.keepClipDir((seg + 1) * 3, fx, fz);
    if (w >= 1e-3) this.aimSegment(lower, seg + 1, w, fx, fz);
    else this.aimOn[seg + 1] = 0;
    // Idle's arm (nothing acting on it): the recovery's rest pose.
    if (this.phase === "idle" && w < 0.01 && this.hitT < 0) {
      const rest = o === ARM_R ? REST_R : REST_L;
      const k = seg * 3;
      rest.up[0] = this.clipDir[k]!;
      rest.up[1] = this.clipDir[k + 1]!;
      rest.up[2] = this.clipDir[k + 2]!;
      rest.fore[0] = this.clipDir[k + 3]!;
      rest.fore[1] = this.clipDir[k + 4]!;
      rest.fore[2] = this.clipDir[k + 5]!;
    }
    // Hand: wrist → palm.
    if (palm) {
      const hs = o === ARM_R ? 4 : 5;
      const hw = clamp(this.s[(o + A_HW) * 2]!, 0, 1);
      hand.getWorldPosition(_a);
      palm.getWorldPosition(_b);
      _c.subVectors(_b, _a);
      if (_c.lengthSq() > 1e-10) {
        _c.normalize();
        this.keepClipDir(hs * 3, fx, fz);
        if (hw >= 1e-3) this.aimSegment(hand, hs, hw, fx, fz);
        else this.aimOn[hs] = 0;
      }
    }
    this.clipSeen = true;
  }

  /** The bone's direction `_c` (world, unit) into the character frame at `clipDir[k…]`. */
  private keepClipDir(k: number, fx: number, fz: number): void {
    this.clipDir[k] = _c.x * fx + _c.z * fz;
    this.clipDir[k + 1] = -_c.x * fz + _c.z * fx;
    this.clipDir[k + 2] = _c.y;
  }

  /**
   * Turns segment `seg`'s bone (its direction `_c`, world) to the aimed pose by weight `w`. The aimed orientation is
   * carried from frame to frame in the character frame and turned by the small swing from last frame's aimed direction
   * to this frame's, so its roll stays continuous; the clip only gives where an aim starts. Review fix: rebuilding it
   * every frame as the shortest swing from the clip's moving arm spun the roll when the two were far apart (the upper
   * arm turned 178° in one frame at a Phi Kiếm release, the hand and sleeve with it).
   */
  private aimSegment(bone: THREE.Bone, seg: number, w: number, fx: number, fz: number): void {
    if (!bone.parent) return;
    const k = seg * 3;
    const q = seg * 4;
    const rx = -fz;
    const rz = fx;
    _t.set(this.dir[k]! * fx + this.dir[k + 1]! * rx, this.dir[k + 2]!, this.dir[k]! * fz + this.dir[k + 1]! * rz);
    if (_t.lengthSq() < 1e-8) return;
    _t.normalize();
    worldQuat(bone, _qc);
    const fresh = this.aimOn[seg] === 0;
    if (fresh) {
      // The aim starts from the clip's pose: its orientation and direction, in the character frame.
      _qt.copy(_qy).invert().multiply(_qc);
      this.aimQ[q] = _qt.x;
      this.aimQ[q + 1] = _qt.y;
      this.aimQ[q + 2] = _qt.z;
      this.aimQ[q + 3] = _qt.w;
      this.aimD[k] = _c.x * fx + _c.z * fz;
      this.aimD[k + 1] = -_c.x * fz + _c.z * fx;
      this.aimD[k + 2] = _c.y;
      this.aimOn[seg] = 1;
    }
    // Last frame's aimed orientation and direction, in the world, swung to this frame's direction.
    _qt.set(this.aimQ[q]!, this.aimQ[q + 1]!, this.aimQ[q + 2]!, this.aimQ[q + 3]!).premultiply(_qy);
    _d.set(this.aimD[k]! * fx + this.aimD[k + 1]! * rx, this.aimD[k + 2]!, this.aimD[k]! * fz + this.aimD[k + 1]! * rz);
    if (_d.lengthSq() > 1e-8) {
      _d.normalize();
      _sw.setFromUnitVectors(_d, _t);
      _qt.premultiply(_sw).normalize();
    }
    _qi.copy(_qy).invert().multiply(_qt);
    this.aimQ[q] = _qi.x;
    this.aimQ[q + 1] = _qi.y;
    this.aimQ[q + 2] = _qi.z;
    this.aimQ[q + 3] = _qi.w;
    this.aimD[k] = this.dir[k]!;
    this.aimD[k + 1] = this.dir[k + 1]!;
    this.aimD[k + 2] = this.dir[k + 2]!;
    // The turn from the clip's orientation to the aimed one (world space), kept on last frame's hemisphere: a shortest-
    // arc slerp switches sides as the turn passes 180°, and a partial weight (a wind-up) then jumped (the forearm 68° in
    // one frame as K1's word started). Matrix decomposition also flips the sign of the clip's quaternion at will.
    _sw.copy(_qt).multiply(_qi.copy(_qc).invert());
    const dot = _sw.x * this.turnPrev[q]! + _sw.y * this.turnPrev[q + 1]! + _sw.z * this.turnPrev[q + 2]! + _sw.w * this.turnPrev[q + 3]!;
    if (fresh ? _sw.w < 0 : dot < 0) _sw.set(-_sw.x, -_sw.y, -_sw.z, -_sw.w);
    this.turnPrev[q] = _sw.x;
    this.turnPrev[q + 1] = _sw.y;
    this.turnPrev[q + 2] = _sw.z;
    this.turnPrev[q + 3] = _sw.w;
    // A share `w` of that turn from the identity, along it (not the shortest arc).
    const half = Math.acos(clamp(_sw.w, -1, 1));
    const sh = Math.sin(half);
    if (sh < 1e-6) _q.set(0, 0, 0, 1);
    else {
      const k2 = Math.sin(half * w) / sh;
      _q.set(_sw.x * k2, _sw.y * k2, _sw.z * k2, Math.cos(half * w));
    }
    worldQuat(bone.parent, _p);
    rotateBoneWorld(bone, _p, _q);
    bone.updateMatrixWorld(true);
  }

  /**
   * Run tuck limiter: past ~62°, an upper arm thrown out to the side is brought in towards its side in the torso's
   * coronal plane (soft, the forward/back swing kept). Applied with the tuck weight while a gait shows.
   */
  limitArms(): void {
    const k = this.tuck;
    if (k < 1e-3 || !this.upperL || !this.upperR || !this.lowerL || !this.lowerR || !this.pelvis || !this.neck) return;
    this.upperL.getWorldPosition(_a);
    this.upperR.getWorldPosition(_b);
    _lat.subVectors(_b, _a).normalize();
    this.pelvis.getWorldPosition(_a);
    this.neck.getWorldPosition(_b);
    _up.subVectors(_b, _a);
    _up.addScaledVector(_lat, -_up.dot(_lat)).normalize();
    _fw.crossVectors(_lat, _up).normalize();
    for (let s = 0; s < 2; s += 1) {
      const upper = s === 0 ? this.upperL : this.upperR;
      const lower = s === 0 ? this.lowerL : this.lowerR;
      if (!upper.parent) continue;
      upper.getWorldPosition(_a);
      lower.getWorldPosition(_b);
      _c.subVectors(_b, _a).normalize();
      const sign = s === 0 ? -1 : 1;
      const out = _c.dot(_lat) * sign;
      const up = _c.dot(_up);
      if (Math.hypot(out, up) < 0.5) continue;
      const abd = Math.atan2(out, -up) / DEG;
      const soft = abd <= 52 ? abd : 52 + 12 * Math.tanh((abd - 52) / 12);
      const cut = (abd - soft) * k;
      if (cut < 0.05) continue;
      // Rotate about the forward axis, bringing the arm down towards its side.
      // _fw = lateral × up: a positive turn raises the right arm, so the right arm turns by −cut, the left by +cut.
      _q.setFromAxisAngle(_fw, -cut * DEG * sign);
      worldQuat(upper.parent, _p);
      rotateBoneWorld(upper, _p, _q);
      upper.updateMatrixWorld(true);
    }
  }
}

const gainedCache = new Map<Pose, Pose>();
/** A dash pose with the gain applied (cached). */
function gained(p: Pose | undefined): Pose {
  if (!p) return ZERO;
  let g = gainedCache.get(p);
  if (!g) {
    g = gainPose(p, GESTURE_GAIN);
    gainedCache.set(p, g);
  }
  return g;
}
