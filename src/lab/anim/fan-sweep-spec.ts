/**
 * Authoring source of the fan-of-blades sweep's key poses (Lạc Kiếm Trận, slot k4; motion round 4). Baked by
 * pose-author.ts (`__labPose.bake("k4")` in the skills lab) into fan-sweep-poses.ts, which the runtime plays.
 * Directions are (right, up, forward) in the character frame; turns are [x, y, z] degrees (key-pose.ts).
 *
 * Designed for the 55° rear play camera at 30–70 px (pose rules, MOTION_PLAN "Vòng 4"), version 2. The first
 * blind phase and direction test (v1, a forehand sweep cocked back to the right) failed: at this size a still is
 * read by the sword's line (where the blade points is where the attack goes), so a blade drawn back pointed the
 * attack the wrong way, and a follow-through still read as a release. So the phases are told apart by the blade's
 * height and the blade always points along the attack:
 * - Coil (typing): the hips sink (to ~23 % of hip height), the shoulders wind right over the hips (to ~30°), the
 *   sword hand climbs above the right shoulder with the elbow high and out, the blade raised and aimed over the head
 *   at the target, and the off hand's sword fingers point at it at full reach: raised = gathering, aimed = where.
 * - Release (last key, ~5 frames): a diagonal sweep down onto the line: the torso unwinds past square and the body
 *   lunges (the right foot drives forward), the arm comes down straight and level at the target, the blade on the
 *   line; the off hand flies back to the left hip.
 * - Follow-through (v3): the body rises out of the lunge and the back foot closes up, the arm lowers with the blade
 *   still on the line ~30° down, the off hand down at the side (an extended arm read as a release in a still);
 *   settle; the recovery hands back to Idle.
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
  holdS: 0.1,
  holdDrift: 0.12,
  followS: 0.14,
  settleS: 0.1,
  settleBack: 0.12,
  recoverS: 0.22,
  circle: { torso: 3, arm: 6.5, wrist: 3, hz: 2.2 },
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
      // Key 1: weight down, the sword hand up beside the right shoulder with the blade aimed at the target, the seal
      // raised before the chest.
      name: "ready",
      hips: [0.06, 0, 0],
      pelvis: [-4, -4, 0],
      spine1: [-3, -5, 0],
      spine2: [-4, -7, 0],
      spine3: [-5, -9, 0],
      neck: [-2, -4, 0],
      head: [-6, 0, 0],
      r: { upper: [0.7, -0.35, -0.6], fore: [0.2, 0.75, 0.6], fingers: [0.15, 0.7, 0.7], sword: [0.05, 0.4, 0.92] },
      l: { upper: [-0.5, -0.45, 0.72], upperTwist: -30, fore: [-0.1, 0.45, 0.88], fingers: [-0.05, 0.4, 0.92], thumb: [0.6, 0.6, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // The coil starts: shoulders wind right, the sword hand climbs, the seal reaches out at the target; the left
      // foot steps forward and out, the right turns out.
      name: "early anticipation",
      hips: [0.11, -0.01, 0.01],
      pelvis: [-5, -6, 0],
      spine1: [-5, -9, -1],
      spine2: [-6, -14, -2],
      spine3: [-8, -19, -3],
      neck: [-3, -8, 0],
      head: [-7, 0, 0],
      r: { clav: [0, 0, 6], upper: [0.75, 0.25, -0.6], fore: [0.25, 0.85, 0.45], fingers: [0.2, 0.8, 0.55], sword: [0.02, 0.5, 0.86] },
      l: { upper: [-0.4, 0.0, 0.92], fore: [-0.25, 0.08, 0.96], fingers: [-0.2, 0.08, 0.98], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: { l: [0.12, -0.1, 10], r: [-0.1, 0.12, -30], stepS: 0.16, liftM: 0.05, first: "l" },
    },
    {
      name: "mid coil",
      hips: [0.15, -0.02, 0.02],
      pelvis: [-7, -9, -1],
      spine1: [-6, -15, -2],
      spine2: [-7, -23, -4],
      spine3: [-8, -31, -5],
      neck: [-4, -14, 0],
      head: [-7, 0, 0],
      r: { clav: [0, 0, 12], upper: [0.7, 0.55, -0.45], fore: [0.25, 0.9, 0.35], fingers: [0.2, 0.85, 0.45], sword: [0, 0.58, 0.81] },
      l: { upper: [-0.32, 0.12, 0.94], fore: [-0.22, 0.15, 0.96], fingers: [-0.18, 0.15, 0.97], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Maximum coil: hips ~23 % down, shoulders ~30° over the hips, the sword hand high over the right shoulder (elbow
      // up and out), the blade raised and aimed at the target over the head; the seal at full reach on the same line.
      name: "maximum coil",
      hips: [0.19, -0.03, 0.03],
      pelvis: [-8, -12, -2],
      spine1: [-6, -21, -3],
      spine2: [-6, -34, -6],
      spine3: [-6, -45, -8],
      neck: [-4, -20, 0],
      head: [-6, 0, 0],
      r: { clav: [0, 0, 18], upper: [0.62, 0.72, -0.32], fore: [0.3, 0.88, 0.38], fingers: [0.25, 0.85, 0.45], sword: [-0.02, 0.62, 0.78] },
      l: { upper: [-0.25, 0.2, 0.95], fore: [-0.18, 0.22, 0.96], fingers: [-0.15, 0.22, 0.97], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Release: the diagonal sweep lands on the line: the torso unwinds 18° past square and leans in, the hips lunge,
      // the sword arm straight and level at the target, the blade on the line; the off hand flies back to the hip.
      name: "release",
      hips: [0.16, 0.15, 0],
      pelvis: [-12, 10, 0],
      spine1: [-14, 16, 1],
      spine2: [-16, 22, 2],
      spine3: [-18, 28, 2],
      neck: [-8, 12, 0],
      head: [-10, 0, 0],
      r: { clav: [0, 14, 0], upper: [0.22, 0.12, 0.97], fore: [0.1, 0.02, 0.99], fingers: [0.08, 0, 1], sword: [-0.04, -0.1, 0.99] },
      l: { clav: [0, -6, 0], upper: [-0.6, -0.6, -0.52], fore: [-0.45, -0.65, -0.6], fingers: [-0.4, -0.7, -0.6], thumb: [0, 1, 0] },
      hands: [FIST, OPEN],
      stance: { l: [0.06, -0.1, 15], r: [0.22, 0.06, -15], stepS: 0.12, liftM: 0.05, first: "r" },
    },
    {
      // Follow-through into the recovery (v3: tester 2 read v2's still extended follow-through as a release): the body
      // rises out of the lunge and the back foot closes up, the sword arm lowers with the blade still on the attack
      // line, ~30° down; the off hand comes down to the side.
      name: "follow-through",
      hips: [0.07, 0.1, 0],
      pelvis: [-5, 12, 0],
      spine1: [-5, 16, 0],
      spine2: [-5, 20, 1],
      spine3: [-5, 24, 1],
      neck: [-3, 10, 0],
      head: [-8, 0, 0],
      r: { clav: [0, 4, -6], upper: [0.3, -0.8, 0.52], fore: [0.12, -0.45, 0.88], fingers: [0.08, -0.4, 0.92], sword: [0, -0.5, 0.87] },
      l: { clav: [0, 0, -4], upper: [-0.3, -0.92, -0.15], fore: [-0.15, -0.95, 0.2], fingers: [-0.1, -0.95, 0.25], thumb: [0, 0, 1] },
      hands: [FIST, OPEN],
      stance: { l: [0.17, -0.07, 5], r: [0.22, 0.06, -10], stepS: 0.16, liftM: 0.04, first: "l" },
    },
  ],
};
