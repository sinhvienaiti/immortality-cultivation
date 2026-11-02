/**
 * Authoring source of the fan-of-blades sweep's key poses (Lạc Kiếm Trận, slot k4; motion round 4). Baked by
 * pose-author.ts (`__labPose.bake("k4")` in the skills lab) into fan-sweep-poses.ts, which the runtime plays.
 * Directions are (right, up, forward) in the character frame; turns are [x, y, z] degrees (key-pose.ts).
 *
 * Designed for the 55° rear play camera at 30–70 px (pose rules, MOTION_PLAN "Vòng 4"): a forehand sweep.
 * - Coil (typing): the hips sink (to ~22 % of hip height), the shoulders wind right against the hips (to ~30°), the
 *   sword hand draws back and up behind the right shoulder (out to the right of the back, never over it), and the
 *   off hand's sword fingers reach out at the target (up the screen from the left shoulder): the direction reads
 *   before the release.
 * - Release (last key, ~5 frames): the torso unwinds past square, the sword arm sweeps round to point at the target,
 *   raised so it clears the head from behind; the off hand flies back to the left as a counterweight; the right foot
 *   drives forward.
 * - Follow-through: the sword carries on across to the front-left, flat and high; the chest keeps turning; settle.
 * Arms are cheated sideways and up wherever an anatomical line would cross the back at the camera.
 */
import type { SkillSpec } from "./pose-author";

const FIST = "fist";
const SEAL = "seal";
const OPEN = "open";

export const FAN_SWEEP_SPEC: SkillSpec = {
  id: "fanSweep",
  name: "Fan-of-blades sweep (扇形剑雨)",
  releaseS: 0.083,
  holdS: 0.12,
  holdDrift: 0.12,
  followS: 0.16,
  settleS: 0.1,
  settleBack: 0.12,
  recoverS: 0.22,
  circle: { torso: 2.5, arm: 4.5, wrist: 2, hz: 2 },
  armBone: "upperarm_r",
  wristBone: "hand_r",
  hands: {
    // The sword hand closed round the grip (right: a curl is a negative turn about z).
    fist: {
      index_01_r: [0, 0, -62], index_02_r: [0, 0, -85], index_03_r: [0, 0, -50],
      middle_01_r: [0, 0, -68], middle_02_r: [0, 0, -88], middle_03_r: [0, 0, -50],
      ring_01_r: [0, 0, -72], ring_02_r: [0, 0, -88], ring_03_r: [0, 0, -50],
      pinky_01_r: [0, 0, -76], pinky_02_r: [0, 0, -85], pinky_03_r: [0, 0, -50],
      thumb_01_r: [0, 0, -12], thumb_02_r: [0, 0, -30], thumb_03_r: [0, 0, -25],
    },
    // 剑指 on the off hand: index and middle straight and together, ring and little finger folded, the thumb over them.
    seal: {
      index_01_l: [0, 0, 4], index_02_l: [0, 0, 0], index_03_l: [0, 0, 0],
      middle_01_l: [0, 0, 2], middle_02_l: [0, 0, 0], middle_03_l: [0, 0, 0],
      ring_01_l: [0, 0, 78], ring_02_l: [0, 0, 95], ring_03_l: [0, 0, 55],
      pinky_01_l: [0, 0, 82], pinky_02_l: [0, 0, 92], pinky_03_l: [0, 0, 55],
      thumb_01_l: [0, 0, 28], thumb_02_l: [0, 0, 38], thumb_03_l: [0, 0, 30],
    },
    // An open, flung hand (fingers loose, a little spread).
    open: {
      index_01_l: [0, 6, 8], middle_01_l: [0, 2, 10], ring_01_l: [0, -3, 12], pinky_01_l: [0, -8, 14],
      index_02_l: [0, 0, 8], middle_02_l: [0, 0, 10], ring_02_l: [0, 0, 12], pinky_02_l: [0, 0, 14],
    },
  },
  poses: [
    {
      // Key 1: weight down, the sword hand low out to the right, the seal raised before the face.
      name: "ready",
      hips: [0.05, 0, 0],
      pelvis: [-4, -4, 0],
      spine1: [-3, -5, 0],
      spine2: [-4, -6, 0],
      spine3: [-5, -8, 0],
      neck: [-2, -4, 0],
      head: [-6, 0, 0],
      r: { upper: [0.6, -0.72, -0.35], fore: [0.55, -0.55, -0.62], fingers: [0.45, -0.6, -0.65], sword: [0.5, -0.5, -0.7] },
      l: { upper: [-0.5, -0.3, 0.8], upperTwist: -30, fore: [-0.05, 0.95, 0.3], fingers: [0, 1, 0.25], thumb: [0.6, 0, 0.5] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // The coil starts: shoulders wind right (12° over the hips), the seal reaches out at the target, the sword draws
      // back to the right; the left foot steps forward and out, the right turns out.
      name: "early anticipation",
      hips: [0.1, -0.01, 0.01],
      pelvis: [-5, -6, 0],
      spine1: [-5, -9, -1],
      spine2: [-6, -13, -2],
      spine3: [-8, -18, -3],
      neck: [-3, -8, 0],
      head: [-7, 0, 0],
      r: { clav: [0, -6, 3], upper: [0.82, -0.2, -0.53], fore: [0.78, 0.1, -0.6], fingers: [0.7, 0.05, -0.7], sword: [0.78, 0.05, -0.62] },
      l: { upper: [-0.45, 0.05, 0.9], fore: [-0.3, 0.15, 0.95], fingers: [-0.2, 0.12, 1], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: { l: [0.12, -0.1, 10], r: [-0.1, 0.12, -30], stepS: 0.16, liftM: 0.05, first: "l" },
    },
    {
      name: "mid coil",
      hips: [0.15, -0.02, 0.02],
      pelvis: [-7, -9, -1],
      spine1: [-7, -15, -2],
      spine2: [-9, -23, -4],
      spine3: [-11, -31, -5],
      neck: [-4, -14, 0],
      head: [-8, 0, 0],
      r: { clav: [0, -10, 6], upper: [0.78, 0.12, -0.6], fore: [0.62, 0.45, -0.62], fingers: [0.55, 0.45, -0.7], sword: [0.82, 0.3, -0.48] },
      l: { upper: [-0.35, 0.15, 0.92], fore: [-0.25, 0.2, 0.95], fingers: [-0.18, 0.2, 1], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Maximum coil: hips ~23 % down, shoulders 32° over the hips, the sword cocked out flat to the right of the back
      // (on screen: a bar out to the right), the seal at full reach up the screen.
      name: "maximum coil",
      hips: [0.19, -0.03, 0.03],
      pelvis: [-9, -12, -2],
      spine1: [-9, -22, -3],
      spine2: [-11, -31, -6],
      spine3: [-13, -40, -8],
      neck: [-5, -20, 0],
      head: [-9, 0, 0],
      r: { clav: [0, -14, 10], upper: [0.7, 0.35, -0.62], fore: [0.45, 0.7, -0.55], fingers: [0.4, 0.65, -0.65], sword: [0.72, 0.55, -0.42] },
      l: { upper: [-0.3, 0.2, 0.93], fore: [-0.2, 0.22, 0.95], fingers: [-0.15, 0.22, 1], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Release: the torso unwinds 18° past square and leans in, the sword arm comes round to point at the target,
      // raised so arm and blade stand clear above and right of the head; the off hand flies back to the left.
      name: "release",
      hips: [0.17, 0.12, 0],
      pelvis: [-12, 10, 0],
      spine1: [-14, 16, 1],
      spine2: [-16, 22, 2],
      spine3: [-18, 28, 2],
      neck: [-8, 12, 0],
      head: [-10, 0, 0],
      r: { clav: [0, 12, 4], upper: [0.35, 0.35, 0.87], fore: [0.2, 0.35, 0.92], fingers: [0.15, 0.25, 0.96], sword: [0.15, 0.3, 0.94] },
      l: { clav: [0, 10, 0], upper: [-0.8, -0.15, -0.55], fore: [-0.7, -0.3, -0.65], fingers: [-0.6, -0.35, -0.7], thumb: [0, 1, 0] },
      hands: [FIST, OPEN],
      stance: { l: [0.08, -0.12, 15], r: [0.18, 0.08, -15], stepS: 0.12, liftM: 0.05, first: "r" },
    },
    {
      // Follow-through: the chest keeps turning, the blade carries on across and down to the front-left (still towards
      // the target's side), the off hand back and a little up.
      name: "follow-through",
      hips: [0.16, 0.14, -0.01],
      pelvis: [-12, 16, 0],
      spine1: [-13, 24, 1],
      spine2: [-14, 32, 2],
      spine3: [-15, 40, 2],
      neck: [-7, 18, 0],
      head: [-9, 2, 0],
      r: { clav: [0, 14, 2], upper: [0.1, 0.25, 0.96], fore: [-0.25, 0.1, 0.96], fingers: [-0.35, 0.0, 0.94], sword: [-0.5, -0.25, 0.83] },
      l: { clav: [0, 10, 0], upper: [-0.75, 0.1, -0.65], fore: [-0.6, 0.0, -0.8], fingers: [-0.55, 0.0, -0.83], thumb: [0, 1, 0] },
      hands: [FIST, OPEN],
      stance: null,
    },
  ],
};
