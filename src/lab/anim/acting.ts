/**
 * Body acting for the lab caster (motion round 2; MOTION_PLAN step 2,
 * CHARACTER_ANIMATION §5.6; style canon D56: anime and mythic, bold poses that
 * read when the caster is 30–70 px tall at the play camera).
 *
 * The lab has only eight clips of its own (Idle, Run, Attack, Skill1, Skill2,
 * Ult, Dash, Hit) plus the Mesh2Motion walk and strafes, so each skill's
 * acting is a procedural layer on top of a clip section:
 * - anticipation while the word is typed (the centre of mass drops 4–6 cm,
 *   the sword arm and hand draw back, the torso counter-twists 10–15°), built
 *   with the progress and completed over ~8 frames after the next-to-last key;
 * - a decisive release on the last key (the arm extends to the target, the
 *   torso turns into the cast, the head looks at it): ~85 % of the way in 6
 *   frames, all of it in ~8;
 * - a hold of 18 frames (longer where the skill's own strikes still land: K1
 *   blades, K5 waves, with a pulse on each beat), then an overshoot and settle
 *   over ~0.3 s (underdamped springs), then a 0.5 s recovery (arms lower, the
 *   body settles) while the base clip cross-fades to Idle over ~0.22 s.
 * Also the dash (compression, a 26° forward lean with the arms trailing, a
 * braking pose on landing), the hit stagger (an additive directional
 * stagger: torso 18°, head 25°, 0.3 s), the stop sway and the arm tuck of
 * the run.
 *
 * Every output is a spring (critically damped, or underdamped where the
 * overshoot is the point), so a skill typed over another, a walk or a hit in
 * the middle all blend. Arm directions spring along great circles (the angle
 * left to the goal is the spring), so an arm swung from behind to the front
 * keeps an even angular speed instead of whipping through a short vector.
 * Arms are aimed in world space after the torso layers
 * (shoulder → elbow, elbow → wrist rotated towards a direction in the
 * character frame, by a weight), so the rig's local axes never matter. No
 * allocation per frame.
 */
import * as THREE from "three";
import { clamp, criticalSpring, DEG, smoothstep, underdampedSpring } from "./math";
import { Rig, rotateBoneWorld, worldQuat } from "./rig";

export type MoveId = "auto" | "k1" | "k2" | "guard" | "k4" | "k5";

/** A direction in the character frame: forward, right, up (normalised at use). */
type V3 = readonly [number, number, number];

interface ArmPose {
  /** Shoulder → elbow and elbow → wrist directions. */
  readonly up: V3;
  readonly fore: V3;
  /** Weight of the aim over the clip arm (0–1). */
  readonly w: number;
  /** Share of the target direction mixed into both (0–1), and its lift (character frame up, m per m). */
  readonly aim?: number;
  readonly lift?: number;
}

interface Pose {
  /** Pelvis drop (m), torso twist (deg, + turns left: the right shoulder forward), lean (deg, + forward), side lean (deg, + right side down). */
  readonly crouch: number;
  readonly twist: number;
  readonly lean: number;
  readonly side: number;
  readonly r: ArmPose | null;
  readonly l: ArmPose | null;
}

interface MoveDef {
  readonly antic: Pose;
  readonly release: Pose;
  /** After the hold: a pose kept for `sustainS` (K5 directing the rain, the guard stance). */
  readonly sustain?: Pose;
  readonly sustainS?: number;
  readonly settle: Pose;
  /** Hold of the release pose after the snap (s). */
  readonly holdS: number;
  /** Pulses after the release (s): the skill's own later strikes. */
  readonly beats?: readonly number[];
  /** The release pose is held on purpose with both arms up (the arms-out check skips it). */
  readonly intended?: boolean;
  /** Lunge towards the target at the release (m). */
  readonly stepM?: number;
  /** Target height for the aim (m): beasts' chests, or the ground of a zone. */
  readonly targetY: number;
}

const ZERO: Pose = { crouch: 0, twist: 0, lean: 0, side: 0, r: null, l: null };

// Arm shapes (character frame f, r, u). Right is the sword arm. The play camera sits behind and above the caster
// (55°), where the hood hides an arm straight ahead: releases keep the arm a little out to the side and up, so the
// gesture shows beside the head at 30–70 px while still pointing at the target.
const R_COCK: ArmPose = { up: [-0.55, 0.6, -0.2], fore: [0.55, -0.25, 0.8], w: 0.9 };
const L_SEAL: ArmPose = { up: [0.35, -0.45, -0.8], fore: [0.55, 0.75, 0.3], w: 0.75 };
const L_BACK: ArmPose = { up: [-0.45, -0.6, -0.65], fore: [-0.5, -0.45, -0.75], w: 0.65 };
const R_POINT: ArmPose = { up: [0.7, 0.62, 0.2], fore: [0.75, 0.5, 0.35], w: 1, aim: 0.6, lift: 0.25 };
const R_LOWER: ArmPose = { up: [0.55, 0.35, -0.75], fore: [0.8, 0.1, -0.35], w: 0.55, aim: 0.3, lift: 0 };

/** The six skills (the dash and the hit are their own paths). Amplitudes are sized for the play camera. */
export const MOVES: Record<MoveId, MoveDef> = {
  // Phi Kiếm: a flick of the sword fingers; no typed word, so the anticipation is the clip's own 50 ms.
  auto: {
    antic: { crouch: 0.03, twist: -10, lean: -2, side: 0, r: R_COCK, l: L_SEAL },
    release: { crouch: 0.025, twist: 13, lean: 8, side: 0, r: R_POINT, l: L_BACK },
    settle: { crouch: 0.01, twist: 4, lean: 3, side: 0, r: R_LOWER, l: { up: [-0.2, -0.5, -0.85], fore: [0.1, -0.2, -1], w: 0.3 } },
    holdS: 0.27,
    targetY: 1.0,
  },
  // Ngự Kiếm Quyết: sword fingers raised by the ear, then pointed; each of the three blades leaves on a pulse.
  k1: {
    antic: { crouch: 0.05, twist: -12, lean: -4, side: 0, r: { up: [-0.25, 0.8, 0.2], fore: [0.15, -0.25, 0.95], w: 0.95 }, l: L_SEAL },
    release: { crouch: 0.03, twist: 13, lean: 8, side: 0, r: R_POINT, l: L_SEAL },
    settle: { crouch: 0.012, twist: 4, lean: 3, side: 0, r: R_LOWER, l: { up: [0.2, -0.5, -0.85], fore: [0.4, 0.4, -0.5], w: 0.35 } },
    holdS: 0.3,
    // Blades 2 and 3 (kiem.ts T_K1_HITS 36, 66 ticks: launched 0.1 s before).
    beats: [0.5, 1.0],
    targetY: 1.0,
  },
  // Nhất Tuyến Xuyên Vân: a deep coil to the right hip, then a lunge: the arm drives straight through the line.
  k2: {
    antic: { crouch: 0.06, twist: -16, lean: 5, side: 0, r: { up: [-0.75, 0.4, -0.45], fore: [0.45, -0.2, -0.35], w: 0.95 }, l: { up: [0.6, -0.3, -0.35], fore: [0.85, 0.25, 0.05], w: 0.8, aim: 0.5, lift: 0 } },
    release: { crouch: 0.045, twist: 17, lean: 16, side: 0, r: { up: [0.8, 0.5, 0.1], fore: [0.85, 0.4, 0.12], w: 1, aim: 0.75, lift: 0.12 }, l: { up: [-0.55, -0.65, -0.4], fore: [-0.65, -0.55, -0.35], w: 0.95 } },
    settle: { crouch: 0.02, twist: 5, lean: 6, side: 0, r: R_LOWER, l: { up: [-0.35, -0.5, -0.8], fore: [-0.3, -0.3, -0.9], w: 0.45 } },
    holdS: 0.32,
    stepM: 0.18,
    targetY: 1.0,
  },
  // Hồi Kiếm Hộ Thân: a defensive stance; the sword arm comes across the body, the off hand raised in a seal.
  guard: {
    antic: { crouch: 0.05, twist: -12, lean: 2, side: 0, r: R_COCK, l: { up: [0.2, -0.5, -0.85], fore: [0.6, 0.45, -0.2], w: 0.6 } },
    release: { crouch: 0.06, twist: 8, lean: -5, side: 0, r: { up: [0.3, 0.9, -0.05], fore: [0.35, -0.9, 0.2], w: 1 }, l: { up: [0.3, -0.6, -0.4], fore: [0.25, -0.05, 0.97], w: 0.95 } },
    sustain: { crouch: 0.05, twist: 5, lean: -3, side: 0, r: { up: [0.3, 0.85, -0.25], fore: [0.4, -0.88, 0.15], w: 0.9 }, l: { up: [0.3, -0.6, -0.45], fore: [0.3, -0.05, 0.95], w: 0.85 } },
    sustainS: 0.55,
    settle: { crouch: 0.025, twist: 2, lean: -1, side: 0, r: { up: [0.3, 0.6, -0.7], fore: [0.5, -0.6, -0.1], w: 0.5 }, l: { up: [0.3, -0.5, -0.8], fore: [0.4, 0.3, 0.3], w: 0.4 } },
    holdS: 0.3,
    targetY: 1.0,
  },
  // Lạc Kiếm Trận: the sword hand raised high behind, then swept down onto the zone; the array lands on a second beat.
  k4: {
    antic: { crouch: 0.05, twist: -12, lean: -7, side: 0, r: { up: [-0.3, 0.35, 0.9], fore: [-0.1, 0.05, 1], w: 1 }, l: { up: [0.3, -0.45, -0.8], fore: [0.55, 0.3, -0.4], w: 0.6 } },
    release: { crouch: 0.055, twist: 14, lean: 18, side: 0, r: { up: [0.65, 0.6, -0.35], fore: [0.7, 0.45, -0.5], w: 1, aim: 0.5, lift: -0.15 }, l: L_BACK },
    settle: { crouch: 0.02, twist: 4, lean: 5, side: 0, r: R_LOWER, l: { up: [-0.2, -0.5, -0.85], fore: [0.1, -0.2, -1], w: 0.3 } },
    holdS: 0.3,
    // The blades land on the array (kiem.ts T_K4_OPEN, 12 ticks).
    beats: [0.2],
    targetY: 0,
  },
  // Thiên Hà Kiếm Vũ: gathered low while the long word is typed, both arms thrown to the sky, then the sword hand
  // brings the rain down on the zone, pulsing with each wave.
  k5: {
    antic: { crouch: 0.06, twist: -9, lean: 7, side: 0, r: { up: [-0.75, 0.4, -0.55], fore: [-0.55, 0.2, -0.6], w: 0.65 }, l: { up: [-0.75, -0.4, -0.55], fore: [-0.55, -0.2, -0.6], w: 0.65 } },
    release: { crouch: -0.01, twist: 0, lean: -10, side: 0, r: { up: [0.15, 0.62, 0.75], fore: [0.1, 0.5, 0.86], w: 1 }, l: { up: [0.15, -0.62, 0.75], fore: [0.1, -0.5, 0.86], w: 1 } },
    sustain: { crouch: 0.035, twist: 12, lean: 9, side: 0, r: { up: [0.75, 0.6, -0.1], fore: [0.8, 0.45, -0.2], w: 1, aim: 0.55, lift: 0.1 }, l: L_SEAL },
    sustainS: 1.35,
    settle: { crouch: 0.015, twist: 4, lean: 3, side: 0, r: R_LOWER, l: { up: [0.2, -0.5, -0.85], fore: [0.4, 0.4, -0.5], w: 0.35 } },
    holdS: 0.3,
    // The three waves (kiem.ts T_K5_HITS 30, 75, 120 ticks).
    beats: [0.5, 1.25, 2.0],
    intended: true,
    targetY: 0,
  },
};

/** Release snap (s): the arms reach the extreme in ~6 frames. Settle and recovery lengths (s). */
const SNAP_S = 0.1;
const SETTLE_S = 0.3;
const RECOVER_S = 0.5;
/** Dash: compression frames at the start (s), the landing brake (s). */
const COMPRESS_S = 0.083;
const BRAKE_S = 0.26;
/** A blow's step back (view offset): out (s), held (s), back (s); the offset never goes further than OFF_MAX_M. */
const HIT_OUT_S = 0.17;
const HIT_HOLD_S = 0.12;
const HIT_BACK_S = 0.45;
const OFF_MAX_M = 0.3;

type Phase = "idle" | "charge" | "strike" | "dash" | "land";
/** Strike sub-phases, by age since the release. */
export type StrikeStage = "snap" | "hold" | "sustain" | "settle" | "recover" | "done";

// Channels: 0 crouch, 1 twist, 2 lean, 3 side, then per arm (R at 4, L at 12): up xyz, fore xyz, weight, (spare).
const N = 20;
const C_CROUCH = 0;
const C_TWIST = 1;
const C_LEAN = 2;
const C_SIDE = 3;
const ARM_R = 4;
const ARM_L = 12;

const DASH_COMPRESS: Pose = { crouch: 0.06, twist: 0, lean: 14, side: 0, r: { up: [-0.45, 0.55, -0.7], fore: [-0.3, 0.3, -0.9], w: 0.55 }, l: { up: [-0.45, -0.55, -0.7], fore: [-0.3, -0.3, -0.9], w: 0.55 } };
const DASH_GLIDE: Pose = { crouch: 0.015, twist: 0, lean: 26, side: 0, r: { up: [-0.8, 0.38, -0.48], fore: [-0.85, 0.25, -0.45], w: 0.9 }, l: { up: [-0.8, -0.38, -0.48], fore: [-0.85, -0.25, -0.45], w: 0.9 } };
const DASH_BRAKE: Pose = { crouch: 0.06, twist: 0, lean: -12, side: 0, r: { up: [0.45, 0.7, -0.45], fore: [0.65, 0.35, -0.1], w: 0.65 }, l: { up: [0.45, -0.7, -0.45], fore: [0.65, -0.35, -0.1], w: 0.65 } };
const DASH_CHARGE: Pose = { crouch: 0.055, twist: 0, lean: 7, side: 0, r: { up: [-0.35, 0.6, -0.7], fore: [-0.1, 0.3, -0.95], w: 0.45 }, l: { up: [-0.35, -0.6, -0.7], fore: [-0.1, -0.3, -0.95], w: 0.45 } };

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
  /** Arm segment directions (character frame, unit): R upper, R fore, L upper, L fore; and the angle springs' speed. */
  private readonly dir = new Float64Array(12);
  private readonly dirV = new Float64Array(4);
  /** Where the clip and layers held each arm segment last frame (character frame, unit), and whether it was read. */
  private readonly clipDir = new Float64Array(12);
  private clipSeen = false;
  /** Each segment's aimed orientation in the character frame (yaw taken out; x, y, z, w), its direction, and whether set. */
  private readonly aimQ = new Float64Array(16);
  private readonly aimD = new Float64Array(12);
  private readonly aimOn = new Uint8Array(4);
  /** Each segment's last clip-to-aim turn (world quaternion), for hemisphere continuity. */
  private readonly turnPrev = new Float64Array(16);
  private phase: Phase = "idle";
  private move: MoveId | null = null;
  private def: MoveDef | null = null;
  /** Anticipation weight (spring) and its goal. */
  private readonly antic = new Float64Array(2);
  private anticGoal = 0;
  private age = 0;
  private beat = 0;
  /** Pulse (underdamped), hit stagger (torso, head), stop sway (underdamped). */
  private readonly pulse = new Float64Array(2);
  private readonly hitS = new Float64Array(2);
  private readonly headS = new Float64Array(2);
  private hitF = -1;
  private hitR = 0;
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

  private readonly upperR: THREE.Bone | null;
  private readonly lowerR: THREE.Bone | null;
  private readonly handR: THREE.Bone | null;
  private readonly upperL: THREE.Bone | null;
  private readonly lowerL: THREE.Bone | null;
  private readonly handL: THREE.Bone | null;
  private readonly pelvis: THREE.Bone | null;
  private readonly neck: THREE.Bone | null;

  constructor(rig: Rig) {
    this.upperR = rig.bone("upperarm_r");
    this.lowerR = rig.bone("lowerarm_r");
    this.handR = rig.bone("hand_r");
    this.upperL = rig.bone("upperarm_l");
    this.lowerL = rig.bone("lowerarm_l");
    this.handL = rig.bone("hand_l");
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
    for (let g = 0; g < 4; g += 1) this.dir[g * 3 + 2] = -1;
    this.antic.fill(0);
    this.anticGoal = 0;
    this.pulse.fill(0);
    this.hitS.fill(0);
    this.headS.fill(0);
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
    this.tuck = 0;
    this.crouchM = this.twistDeg = this.leanDeg = this.sideDeg = this.headPitchDeg = this.headRollDeg = 0;
  }

  /** The strike stage now (the Animator holds or releases the base clip by it). */
  get stage(): StrikeStage {
    if (this.phase !== "strike" || !this.def) return "done";
    const d = this.def;
    const a = this.age;
    const hold = SNAP_S + d.holdS;
    const sustain = hold + (d.sustain ? (d.sustainS ?? 0) : 0);
    const last = d.beats ? d.beats[d.beats.length - 1]! + 0.1 : 0;
    const keep = Math.max(sustain, last);
    if (a < SNAP_S) return "snap";
    if (a < hold) return "hold";
    if (a < keep) return "sustain";
    if (a < keep + SETTLE_S) return "settle";
    if (a < keep + SETTLE_S + RECOVER_S) return "recover";
    return "done";
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

  private setTarget(x: number, y: number, z: number): void {
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.hasTarget = true;
  }

  /** A key of the word for `move` (progress 0…1, `keysLeft` still to type) aimed at (tx, tz). */
  charge(move: MoveId, progress: number, keysLeft: number, tx: number, tz: number): void {
    const def = MOVES[move];
    if (this.phase !== "charge" || this.move !== move) {
      this.phase = "charge";
      this.move = move;
      this.def = def;
      this.age = 0;
      this.antic[1] = 0;
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
    const def = MOVES[move];
    this.phase = "strike";
    this.move = move;
    this.def = def;
    this.age = 0;
    this.beat = 0;
    this.setTarget(tx, def.targetY, tz);
    this.anticGoal = 0;
    if (def.stepM) {
      // The lunge towards the target, held while the strike holds; its recovery steps back (view only).
      const dx = tx - this.rootX;
      const dz = tz - this.rootZ;
      const l = Math.hypot(dx, dz);
      if (l > 1e-3) {
        this.offsetTo((dx / l) * def.stepM, (dz / l) * def.stepM, 0.14);
        this.offOwner = "strike";
      }
    }
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
  }

  /** Touch-down after a dash: the braking pose, then the recovery. */
  dashLand(): void {
    this.phase = "land";
    this.age = 0;
  }

  /** Walking off (or anything that drops the skill): the pose lets go on the recovery springs. */
  cancel(): void {
    if (this.phase === "idle") return;
    this.phase = "idle";
    this.move = null;
    this.def = null;
    this.anticGoal = 0;
  }

  /** An enemy blow pushing the body along (pushF, pushR) in the character frame (unit). */
  hit(pushF: number, pushR: number, stepM: number, fromX: number, fromZ: number): void {
    const l = Math.hypot(pushF, pushR) || 1;
    this.hitF = pushF / l;
    this.hitR = pushR / l;
    // Underdamped kicks: the torso peaks ~18° at ~60 ms (3.2 Hz, ζ 0.6), the head ~25° at ~50 ms (4 Hz, ζ 0.5).
    this.hitS[1] = this.hitS[1]! + 726;
    this.headS[1] = this.headS[1]! + 1150;
    this.dip[1] = this.dip[1]! + 0.9;
    // The step back, away from the blow (view only): held a moment, then the feet bring the body back.
    const dx = this.rootX - fromX;
    const dz = this.rootZ - fromZ;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      this.offsetTo(this.offX + (dx / d) * stepM, this.offZ + (dz / d) * stepM, HIT_OUT_S);
      this.offOwner = "hit";
      this.offHoldS = HIT_OUT_S + HIT_HOLD_S;
    }
  }

  /** Arriving from a walk or run: the body sways on past the stop and settles (a balance step's weight). */
  stopSway(speed: number): void {
    this.sway[1] = this.sway[1]! + 110 + 35 * Math.min(3, speed);
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

  /** Advances the timeline and the springs; `fx, fz` the facing, (x, z) the root. */
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
    switch (this.phase) {
      case "idle":
        this.setGoal(ZERO, 1, null);
        hlScalar = 0.12;
        hlArm = 0.11;
        break;
      case "charge":
        if (this.def) this.setGoal(this.def.antic, a, this.def);
        else this.setGoal(DASH_CHARGE, a, null);
        hlScalar = a > 0.95 ? 0.035 : 0.06;
        hlArm = a > 0.95 ? 0.035 : 0.06;
        break;
      case "strike": {
        const d = this.def!;
        const st = this.stage;
        if (st === "snap" || st === "hold") {
          this.setGoal(d.release, 1, d);
          hlArm = 0.04;
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
          this.setGoal(ZERO, 1, null);
          hlScalar = 0.12;
          hlArm = 0.11;
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
        this.setGoal(this.age < COMPRESS_S ? DASH_COMPRESS : DASH_GLIDE, 1, null);
        hlScalar = this.age < COMPRESS_S ? 0.025 : 0.045;
        hlArm = this.age < COMPRESS_S ? 0.03 : 0.05;
        break;
      case "land":
        if (this.age < BRAKE_S) {
          this.setGoal(DASH_BRAKE, 1, null);
          hlArm = 0.05;
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
    for (let c = 0; c < ARM_R; c += 1) {
      if (under && c !== C_CROUCH) underdampedSpring(this.s, c * 2, this.goal[c]!, underHz, underZeta, dt);
      else criticalSpring(this.s, c * 2, this.goal[c]!, hlScalar, dt);
    }
    // An arm unseen before this frame's step (weight ~0) follows where the clip holds it (last frame). A new aim then
    // takes its weight at once, leaving from that direction, so nothing jumps and the arm turns along one great
    // circle. Review fix: the old test read the weight after its step and needed the goal at 0, so a new aim swept in
    // from the last pose's stale direction; and a weight fading in over Attack's own swing (~40°/frame, the clip and
    // the aim 130–150° apart) turned the partial swing's axis: the upper arm jumped 142° in one frame.
    const unseenR = this.s[(ARM_R + 6) * 2]! < 0.02;
    const unseenL = this.s[(ARM_L + 6) * 2]! < 0.02;
    criticalSpring(this.s, (ARM_R + 6) * 2, this.goal[ARM_R + 6]!, hlArm, dt);
    criticalSpring(this.s, (ARM_L + 6) * 2, this.goal[ARM_L + 6]!, hlArm, dt);
    for (let g = 0; g < 4; g += 1) {
      const o = (g < 2 ? ARM_R : ARM_L) + (g % 2) * 3;
      const unseen = g < 2 ? unseenR : unseenL;
      if (unseen && this.clipSeen) {
        const k = g * 3;
        this.dir[k] = this.clipDir[k]!;
        this.dir[k + 1] = this.clipDir[k + 1]!;
        this.dir[k + 2] = this.clipDir[k + 2]!;
        this.dirV[g] = 0;
        const ch = g < 2 ? ARM_R + 6 : ARM_L + 6;
        if (this.goal[ch]! >= 0.02) {
          this.s[ch * 2] = this.goal[ch]!;
          this.s[ch * 2 + 1] = 0;
        }
      }
      this.sphereStep(g, this.goal[o]!, this.goal[o + 1]!, this.goal[o + 2]!, unseen && !this.clipSeen ? 0 : hlArm, dt);
    }
    underdampedSpring(this.pulse, 0, 0, 5, 0.4, dt);
    underdampedSpring(this.hitS, 0, 0, 3.2, 0.6, dt);
    underdampedSpring(this.headS, 0, 0, 4, 0.5, dt);
    underdampedSpring(this.sway, 0, 0, 2.6, 0.45, dt);
    underdampedSpring(this.dip, 0, 0, 3.5, 0.7, dt);
    const p = this.pulse[0]!;
    const h = this.hitS[0]!;
    const hh = this.headS[0]!;
    this.crouchM = this.s[C_CROUCH * 2]! + 0.012 * p + 0.03 * this.dip[0]!;
    this.twistDeg = this.s[C_TWIST * 2]! + 4 * p;
    this.leanDeg = this.s[C_LEAN * 2]! + 4 * p + this.hitF * h + this.sway[0]!;
    this.sideDeg = this.s[C_SIDE * 2]! + this.hitR * h;
    this.headPitchDeg = -this.hitF * hh;
    this.headRollDeg = this.hitR * hh * 0.6;
    // The view offset (lunge, step back): held by what made it, then eased back to the logical position.
    if (this.offOwner === "strike") {
      const st = this.stage;
      const held = this.phase === "strike" && this.def !== null && this.def.stepM !== undefined && (st === "snap" || st === "hold" || st === "sustain" || st === "settle");
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
    const u = smoothstep(0, 1, this.offT / this.offDur);
    this.offX = this.offFromX + (this.offToX - this.offFromX) * u;
    this.offZ = this.offFromZ + (this.offToZ - this.offFromZ) * u;
  }

  /**
   * Arm segment `g` towards the direction (x, y, z) along the great circle: the angle left is a critically damped
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
    this.armGoal(ARM_R, pose.r, k, def);
    this.armGoal(ARM_L, pose.l, k, def);
  }

  private armGoal(o: number, arm: ArmPose | null, k: number, def: MoveDef | null): void {
    if (!arm) {
      this.goal[o + 6] = 0;
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
    this.goal[o + 6] = arm.w * k;
  }

  /** The facing used for the aim (set by the Animator before update). */
  facingX = 0;
  facingZ = 1;

  /**
   * The arm aims, on fresh world matrices after the torso layers: each upper arm then forearm turns from where
   * the clip and layers put it towards its direction by its weight. `fx, fz`: the facing.
   */
  applyArms(fx: number, fz: number): void {
    this.aimArm(this.upperR, this.lowerR, this.handR, ARM_R, fx, fz);
    this.aimArm(this.upperL, this.lowerL, this.handL, ARM_L, fx, fz);
  }

  private aimArm(upper: THREE.Bone | null, lower: THREE.Bone | null, hand: THREE.Bone | null, o: number, fx: number, fz: number): void {
    if (!upper || !lower || !hand || !upper.parent || !lower.parent) return;
    const w = clamp(this.s[(o + 6) * 2]!, 0, 1);
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
