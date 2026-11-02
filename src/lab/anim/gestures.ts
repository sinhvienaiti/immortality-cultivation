/**
 * Casting gesture vocabulary (motion round 3; owner 03/11/2026: "phần
 * animation cử chỉ tay, chân, cơ thể của nhân vật cũng nên được làm thật chi
 * tiết, thật khớp khi thi triển"; canon D58 (8)). Data only: the acting layer
 * (acting.ts) plays a gesture in phases on top of a clip section, and a skill
 * slot picks its gesture from SLOT_GESTURES, so the redesigned catalog can
 * remap slots without touching the code.
 *
 * Every gesture has the same phases, each a full-body pose:
 * - antic: anticipation, built with the typing (centre of mass down, the
 *   striking arm drawn back, the torso counter-twisted, the weight on the
 *   back foot);
 * - release: on the last key, decisive (≈ 85 % in 6 frames), with the root's
 *   lunge and the stance step;
 * - sustain (optional): a pose kept while the skill's later strikes land;
 * - settle: the overshoot settles onto it; then the recovery to Idle.
 * A pose carries the pelvis drop (crouch, m), torso twist (deg, + turns left:
 * the right shoulder forward), lean (deg, + forward), side lean (deg, + right
 * side down), the weight shift (pelvis over the front or a side foot, m), an
 * extra head pitch (deg, + up), each arm as shoulder → elbow and elbow → wrist
 * directions in the character frame (forward, right, up), a weight, a share
 * aimed at the target, and the hand (wrist → palm) direction or "fore" for a
 * straight wrist (Lam has no finger bones: the hand shape is the wrist only;
 * `fingers` names the shape a rig with fingers will form).
 * A stance moves the feet (two-bone IK steps, one foot always planted):
 * per-foot offsets from the clip foot in the facing frame, anchored to where
 * the logical body stands (a lunge leaves the back foot planted).
 *
 * Amplitudes: the play camera shows the caster 30–70 px tall from behind and
 * above (55°), so body scalars and lunges are multiplied by GESTURE_GAIN (the
 * round-2 judges asked for about 1.3×), arms are authored bold and held out of
 * the hood's shadow (a little out to the side and up).
 */

/** A direction in the character frame: forward, right, up (normalised at use). */
export type V3 = readonly [number, number, number];

/** Finger shape a rig with finger bones forms (Lam: the wrist only). */
export type Fingers = "sword" | "palm" | "spread" | "seal" | "fist";

export interface ArmPose {
  /** Shoulder → elbow and elbow → wrist directions. */
  readonly up: V3;
  readonly fore: V3;
  /** Weight of the aim over the clip arm (0–1). */
  readonly w: number;
  /** Share of the target direction mixed into both (0–1), and its lift (character frame up, m per m). */
  readonly aim?: number;
  readonly lift?: number;
  /** Wrist → palm: a direction, or "fore" for a straight wrist (sword fingers continuing the forearm). */
  readonly hand?: V3 | "fore";
  readonly fingers?: Fingers;
}

export interface Pose {
  readonly crouch: number;
  readonly twist: number;
  readonly lean: number;
  readonly side: number;
  /** Weight shift: the pelvis over the front (+) or back foot, and to the right (+) (m). */
  readonly shiftF?: number;
  readonly shiftR?: number;
  /** Head pitch on top of the look-at (deg, + up). */
  readonly head?: number;
  readonly r: ArmPose | null;
  readonly l: ArmPose | null;
}

/** Feet: offsets from each clip foot in the facing frame (forward, right; m) and heading (deg, + turns the toes left). */
export interface Stance {
  readonly lf: number;
  readonly lr: number;
  readonly lyaw: number;
  readonly rf: number;
  readonly rr: number;
  readonly ryaw: number;
  /** The step: duration (s) and lift (m); which foot first ("l", "r", or the farther). */
  readonly stepS: number;
  readonly liftM: number;
  readonly first?: "l" | "r";
}

export type GestureId = "swordSeal" | "skyLift" | "fanSweep" | "bowThrust" | "overheadRaise" | "guardStance" | "dashCrouch";

export interface Gesture {
  readonly id: GestureId;
  /** English name and the source term. */
  readonly name: string;
  readonly antic: Pose;
  readonly release: Pose;
  readonly sustain?: Pose;
  readonly settle: Pose;
  /** Feet while the anticipation is past half, and from the release to the recovery. */
  readonly anticStance?: Stance;
  readonly releaseStance?: Stance;
  /** Lunge of the shown root towards the target at the release (m, before the gain). */
  readonly stepM?: number;
  /** Tail whip at the release (m/s at the tip, against the release). */
  readonly tailWhip: number;
  /** Turn the body to face the target when the word starts or the cast comes (the guard holds its ground). */
  readonly faceTarget: boolean;
}

/** Body scalars and lunges are multiplied by this at the play camera (round-2 judges: ×1.3). */
export const GESTURE_GAIN = 1.3;

/** A skill slot's use of a gesture: the clip section under it and the skill's own rhythm. */
export interface SlotGesture {
  readonly gesture: GestureId;
  /** Hold of the release pose after the snap (s). */
  readonly holdS: number;
  /** Sustain length (s) when the gesture has a sustain pose (0: none). */
  readonly sustainS?: number;
  /** Pulses after the release (s): the skill's own later strikes. */
  readonly beats?: readonly number[];
  /** The release pose holds both arms up on purpose (the arms-out check skips it). */
  readonly intended?: boolean;
  /** Target height for the aim (m): beasts' chests, or the ground of a zone. */
  readonly targetY: number;
  /** Stance and lunge share for this slot (1 full; 0 keeps the feet, for a repeated basic attack). */
  readonly stance?: number;
  /** The off hand's release pose instead of the gesture's (a seal kept at the chest). */
  readonly offHand?: ArmPose;
}

// Shared arm shapes (right arm; mirror the right component for the left).
const R_POINT: ArmPose = { up: [0.7, 0.62, 0.22], fore: [0.75, 0.5, 0.38], w: 1, aim: 0.6, lift: 0.25, hand: "fore", fingers: "sword" };
const R_LOWER: ArmPose = { up: [0.55, 0.35, -0.75], fore: [0.8, 0.1, -0.35], w: 0.55, aim: 0.3, lift: 0 };
const L_SEAL: ArmPose = { up: [0.35, -0.45, -0.8], fore: [0.55, 0.75, 0.3], w: 0.8, hand: [0.15, 0.1, 1], fingers: "seal" };
const L_HIP: ArmPose = { up: [-0.5, -0.6, -0.62], fore: [-0.5, -0.42, -0.75], w: 0.75, hand: "fore", fingers: "palm" };
const L_REST: ArmPose = { up: [-0.2, -0.5, -0.85], fore: [0.1, -0.2, -1], w: 0.3 };

/** The seven gestures. Values before GESTURE_GAIN (body scalars, lunges). */
export const GESTURES: Record<GestureId, Gesture> = {
  // 剑指 sword-finger seal: the sword fingers drawn up by the ear over a chest seal, then flicked at the target, the off
  // hand snapping back to the hip, the weight onto the front foot with a half step.
  swordSeal: {
    id: "swordSeal",
    name: "Sword-finger seal (剑指)",
    antic: { crouch: 0.04, twist: -13, lean: -3, side: 0, shiftF: -0.03, r: { up: [-0.45, 0.62, 0.35], fore: [0.45, -0.32, 0.82], w: 0.95, hand: "fore", fingers: "sword" }, l: L_SEAL },
    release: { crouch: 0.03, twist: 14, lean: 8, side: 0, shiftF: 0.04, r: R_POINT, l: L_HIP },
    settle: { crouch: 0.012, twist: 4, lean: 3, side: 0, shiftF: 0.01, r: R_LOWER, l: L_REST },
    releaseStance: { lf: 0.11, lr: 0, lyaw: 0, rf: 0, rr: 0, ryaw: -12, stepS: 0.13, liftM: 0.055, first: "l" },
    tailWhip: 0.8,
    faceTarget: true,
  },
  // 敕令 two-finger lift that commands the sky: the sword fingers held upright before the face, then lifted straight up
  // with the body rising onto the toes and the eyes on the sky, the off hand pressed down and out; the hand then sweeps
  // forward over the field while the blades hunt.
  skyLift: {
    id: "skyLift",
    name: "Two-finger sky edict (敕令剑指)",
    antic: { crouch: 0.06, twist: -8, lean: 6, side: 0, head: -8, r: { up: [0.35, 0.38, -0.85], fore: [0.3, -0.32, 0.9], w: 0.95, hand: [0.1, -0.05, 1], fingers: "sword" }, l: { up: [0.35, -0.42, -0.84], fore: [0.62, 0.72, 0.18], w: 0.85, hand: [0.3, 0.6, 0.75], fingers: "palm" } },
    release: { crouch: -0.02, twist: 6, lean: -8, side: 0, head: 18, r: { up: [0.18, 0.2, 0.96], fore: [0.12, 0.08, 0.99], w: 1, hand: "fore", fingers: "sword" }, l: { up: [0.0, -0.75, -0.66], fore: [0.25, -0.62, -0.75], w: 0.95, hand: [0.55, -0.45, -0.7], fingers: "palm" } },
    sustain: { crouch: 0.03, twist: 10, lean: 6, side: 0, head: 0, shiftF: 0.03, r: { up: [0.75, 0.45, 0.48], fore: [0.85, 0.3, 0.44], w: 1, aim: 0.35, lift: 0.35, hand: "fore", fingers: "sword" }, l: { up: [0.0, -0.72, -0.7], fore: [0.3, -0.55, -0.78], w: 0.8, hand: [0.5, -0.4, -0.75], fingers: "palm" } },
    settle: { crouch: 0.015, twist: 4, lean: 3, side: 0, r: R_LOWER, l: L_REST },
    releaseStance: { lf: 0, lr: -0.06, lyaw: 12, rf: 0, rr: 0.06, ryaw: -12, stepS: 0.15, liftM: 0.055 },
    tailWhip: 0.9,
    faceTarget: true,
  },
  // The arm sweep that throws a fan of blades: the sword hand wound across to the left shoulder (backhand, the torso
  // turned left, the weight on the left foot), then swept out to the right-front and down onto the zone, the off hand
  // flung back, the right foot stepping out into the sweep.
  fanSweep: {
    id: "fanSweep",
    name: "Fan-of-blades sweep (扇形剑雨)",
    antic: { crouch: 0.06, twist: 22, lean: 4, side: -5, shiftR: -0.045, r: { up: [0.45, -0.52, 0.6], fore: [-0.3, -0.58, 0.76], w: 1, hand: "fore", fingers: "spread" }, l: { up: [-0.45, -0.5, -0.74], fore: [-0.4, -0.3, -0.86], w: 0.75, hand: "fore", fingers: "palm" } },
    release: { crouch: 0.06, twist: -20, lean: 13, side: 5, shiftR: 0.05, r: { up: [0.55, 0.82, -0.08], fore: [0.62, 0.76, -0.2], w: 1, aim: 0.35, lift: -0.15, hand: "fore", fingers: "spread" }, l: { up: [-0.42, -0.74, -0.5], fore: [-0.6, -0.6, -0.5], w: 0.9, hand: "fore", fingers: "palm" } },
    settle: { crouch: 0.02, twist: -5, lean: 5, side: 1, shiftR: 0.01, r: R_LOWER, l: L_REST },
    releaseStance: { lf: 0, lr: 0, lyaw: 0, rf: 0.04, rr: 0.09, ryaw: -18, stepS: 0.14, liftM: 0.055, first: "r" },
    tailWhip: 1.1,
    faceTarget: true,
  },
  // 弓步 forward thrust: a deep coil with the sword hand chambered at the right hip and the off hand reaching out as the
  // guide, then the bow stance (the left foot steps out, the back leg straightens, the knee over the toes) and the arm
  // drives straight through the line while the off hand pulls back to the hip.
  bowThrust: {
    id: "bowThrust",
    name: "Bow-stance thrust (弓步刺)",
    antic: { crouch: 0.065, twist: -20, lean: 4, side: 0, shiftF: -0.05, r: { up: [-0.72, 0.38, -0.58], fore: [0.95, 0.12, 0.08], w: 1, hand: "fore", fingers: "sword" }, l: { up: [0.82, -0.3, 0.12], fore: [0.9, -0.1, 0.15], w: 0.9, aim: 0.55, lift: 0, hand: [0.2, 0.1, 0.98], fingers: "palm" } },
    release: { crouch: 0.075, twist: 20, lean: 15, side: 0, shiftF: 0.07, r: { up: [0.8, 0.52, 0.16], fore: [0.92, 0.3, 0.14], w: 1, aim: 0.6, lift: 0.08, hand: "fore", fingers: "sword" }, l: L_HIP },
    settle: { crouch: 0.025, twist: 5, lean: 6, side: 0, shiftF: 0.02, r: R_LOWER, l: { up: [-0.35, -0.5, -0.8], fore: [-0.3, -0.3, -0.9], w: 0.45 } },
    releaseStance: { lf: 0.27, lr: -0.02, lyaw: 0, rf: 0, rr: 0.02, ryaw: -35, stepS: 0.14, liftM: 0.055, first: "l" },
    stepM: 0.13,
    tailWhip: 1.2,
    faceTarget: true,
  },
  // Both hands raised overhead for the ultimate: gathered low with the hands behind, then thrown up into a V with the
  // body rising and the eyes on the sky (held on purpose), then the sword hand brings the sky down on the zone.
  overheadRaise: {
    id: "overheadRaise",
    name: "Overhead heaven raise (举天)",
    antic: { crouch: 0.075, twist: -8, lean: 10, side: 0, head: -10, r: { up: [-0.75, 0.42, -0.52], fore: [-0.55, 0.22, -0.6], w: 0.7 }, l: { up: [-0.75, -0.42, -0.52], fore: [-0.55, -0.22, -0.6], w: 0.7 } },
    release: { crouch: -0.02, twist: 0, lean: -11, side: 0, head: 20, r: { up: [0.15, 0.55, 0.82], fore: [0.1, 0.35, 0.93], w: 1, hand: "fore", fingers: "spread" }, l: { up: [0.15, -0.55, 0.82], fore: [0.1, -0.35, 0.93], w: 1, hand: "fore", fingers: "spread" } },
    sustain: { crouch: 0.035, twist: 12, lean: 9, side: 0, shiftF: 0.03, r: { up: [0.75, 0.6, -0.1], fore: [0.8, 0.45, -0.2], w: 1, aim: 0.55, lift: 0.1, hand: "fore", fingers: "sword" }, l: L_SEAL },
    settle: { crouch: 0.015, twist: 4, lean: 3, side: 0, r: R_LOWER, l: { up: [0.2, -0.5, -0.85], fore: [0.4, 0.4, -0.5], w: 0.35 } },
    anticStance: { lf: 0, lr: -0.07, lyaw: 15, rf: 0, rr: 0.07, ryaw: -15, stepS: 0.2, liftM: 0.055 },
    releaseStance: { lf: 0, lr: -0.07, lyaw: 15, rf: 0, rr: 0.07, ryaw: -15, stepS: 0.2, liftM: 0.055 },
    tailWhip: 1.4,
    faceTarget: true,
  },
  // A planted guard: the feet step wide into a low horse stance, the sword arm across the chest, the off hand raised in
  // a palm seal by the head, the torso square to the threat.
  guardStance: {
    id: "guardStance",
    name: "Planted guard (马步护身)",
    antic: { crouch: 0.065, twist: -10, lean: 8, side: 0, head: -6, r: { up: [-0.55, 0.45, -0.7], fore: [-0.25, 0.25, -0.93], w: 0.85, hand: "fore" }, l: { up: [-0.55, -0.45, -0.7], fore: [-0.25, -0.25, -0.93], w: 0.85, hand: "fore" } },
    release: { crouch: 0.085, twist: 6, lean: -2, side: 0, r: { up: [0.3, 0.9, -0.05], fore: [0.35, -0.9, 0.22], w: 1, hand: "fore", fingers: "sword" }, l: { up: [0.3, -0.6, -0.4], fore: [0.25, -0.05, 0.97], w: 0.95, hand: [0.35, 0.05, 0.94], fingers: "palm" } },
    sustain: { crouch: 0.075, twist: 4, lean: -1, side: 0, r: { up: [0.3, 0.85, -0.25], fore: [0.4, -0.88, 0.15], w: 0.9, hand: "fore", fingers: "sword" }, l: { up: [0.3, -0.6, -0.45], fore: [0.3, -0.05, 0.95], w: 0.85, hand: [0.35, 0.05, 0.94], fingers: "palm" } },
    settle: { crouch: 0.025, twist: 2, lean: -1, side: 0, r: { up: [0.3, 0.6, -0.7], fore: [0.5, -0.6, -0.1], w: 0.5 }, l: { up: [0.3, -0.5, -0.8], fore: [0.4, 0.3, 0.3], w: 0.4 } },
    releaseStance: { lf: 0.02, lr: -0.08, lyaw: 18, rf: -0.02, rr: 0.08, ryaw: -18, stepS: 0.12, liftM: 0.055 },
    tailWhip: 0.7,
    faceTarget: false,
  },
  // The low dash crouch: compressed with the word, a low glide leaning far forward with both arms trailing, and a deep
  // landing compression on a braking step (acting.ts plays these through the dash's own phases).
  dashCrouch: {
    id: "dashCrouch",
    name: "Low dash crouch (伏身疾步)",
    antic: { crouch: 0.065, twist: 0, lean: 10, side: 0, r: { up: [-0.4, 0.6, -0.68], fore: [-0.15, 0.3, -0.94], w: 0.5 }, l: { up: [-0.4, -0.6, -0.68], fore: [-0.15, -0.3, -0.94], w: 0.5 } },
    release: { crouch: 0.08, twist: 0, lean: 16, side: 0, head: -4, r: { up: [-0.5, 0.55, -0.66], fore: [-0.35, 0.3, -0.88], w: 0.6 }, l: { up: [-0.5, -0.55, -0.66], fore: [-0.35, -0.3, -0.88], w: 0.6 } },
    sustain: { crouch: 0.045, twist: 0, lean: 28, side: 0, head: 6, r: { up: [-0.82, 0.36, -0.45], fore: [-0.88, 0.25, -0.4], w: 0.95, hand: "fore" }, l: { up: [-0.82, -0.36, -0.45], fore: [-0.88, -0.25, -0.4], w: 0.95, hand: "fore" } },
    settle: { crouch: 0.085, twist: 0, lean: -10, side: 0, head: -4, r: { up: [0.45, 0.7, -0.45], fore: [0.65, 0.4, -0.1], w: 0.7 }, l: { up: [0.45, -0.7, -0.45], fore: [0.65, -0.4, -0.1], w: 0.7 } },
    tailWhip: 1.5,
    faceTarget: false,
  },
};

/**
 * Which gesture each lab slot acts, with the skill's own rhythm (beats on its hit ticks, kiem.ts). The redesigned
 * catalog remaps slots here (or through `setSlotGesture`).
 */
export const SLOT_GESTURES: Record<string, SlotGesture> = {
  // Phi Kiếm: a quick flick of the sword fingers; a repeated basic attack keeps the feet.
  auto: { gesture: "swordSeal", holdS: 0.22, targetY: 1.0, stance: 0 },
  // Ngự Kiếm Quyết: the seal kept at the chest while the three blades leave (+0.5 s, +1.0 s).
  k1: { gesture: "swordSeal", holdS: 0.3, beats: [0.5, 1.0], targetY: 1.0, offHand: L_SEAL },
  // Nhất Tuyến Xuyên Vân: the bow-stance thrust through the line.
  k2: { gesture: "bowThrust", holdS: 0.32, targetY: 1.0 },
  // Hồi Kiếm Hộ Thân: the planted guard, held while the blades orbit.
  guard: { gesture: "guardStance", holdS: 0.3, sustainS: 0.55, targetY: 1.0 },
  // Lưu Quang Bộ: the dash's own phases.
  dash: { gesture: "dashCrouch", holdS: 0, targetY: 1.0 },
  // Lạc Kiếm Trận: the sweep that throws the array's blades; they land on a second beat.
  k4: { gesture: "fanSweep", holdS: 0.3, beats: [0.2], targetY: 0 },
  // Thiên Hà Kiếm Vũ: both hands to the sky, then the rain brought down, a pulse on each wave.
  k5: { gesture: "overheadRaise", holdS: 0.3, sustainS: 1.35, beats: [0.5, 1.25, 2.0], intended: true, targetY: 0 },
  // Vạn Kiếm Triều Tông (key 7, field-wide prototype): the two-finger edict lift, the hand then directing the hunt.
  k7: { gesture: "skyLift", holdS: 0.4, sustainS: 1.1, targetY: 1.0 },
};

/** Remaps a slot to a gesture (the redesigned catalog), keeping or replacing its rhythm. */
export function setSlotGesture(slot: string, use: SlotGesture): void {
  SLOT_GESTURES[slot] = use;
}

/** The slot's gesture use, or the sword-finger flick for an unknown slot. */
export function slotGesture(slot: string): SlotGesture {
  return SLOT_GESTURES[slot] ?? SLOT_GESTURES.auto!;
}
