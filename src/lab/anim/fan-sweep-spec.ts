/**
 * Authoring source of the fan-of-blades sweep's key poses (Lạc Kiếm Trận, slot k4; motion round 4b). Baked by
 * `npx tsx scripts/lab/bake-key-poses.ts` into fan-sweep-poses.ts, which the runtime plays. Directions are (right,
 * up, forward) in the character frame; turns are [x, y, z] degrees (key-pose.ts: y + turns left).
 *
 * Round 4b is a new performance, not a retune of round 4's v3 (ChatGPT approach 2, docs/games/tu-tien/source/
 * motion-approach2-chatgpt-2026-11-03.md §1 and §6; blind judge of v3: 4.6, "a near-static V", "summon, not throw").
 * It splits the two jobs v1–v3 gave the sword hand:
 * - the target: the lead hand's two-finger seal points at it (along the screen-space attack direction D), and the
 *   head and chest lead towards it;
 * - the power: the sword arm loads sideways and back (hand about −0.25 H along D and +0.4 H across it, elbow well
 *   outside the torso), the blade trailing flat out to the side (across D on screen), against an S torso: the
 *   pelvis turned 12° away (to the right, with the load), the chest turned towards the sweep (left), about 30° of
 *   separation; hips down to 25 % of hip height, weight back.
 * Each typed key visibly moves the load: the sword from low at the hip, out to the side at the waist, to the
 * shoulder, to cocked high and back with the elbow up; the seal from the chest to full reach.
 * The release follows the spacing chart: the weapon first (F1 30 %, F2 65 %, F3 90 %, F4 100 %, overshoot at
 * F5–F6, a one-frame accent at F7 that still moves), the lead hand snapping back almost as fast, the chest and the
 * pelvis lagging (the chest at 65 % on F4, the pelvis at 45 %), then a curved recovery over F8–F14 and a fade to
 * Idle. The sweep goes right to left: arm round to point at the zone (F4), carried past to the front-left (F6).
 * Directional cheat: an attack towards the camera loads with the body turned up to 70° to its left, so the sword
 * arm loads on the near side; the seal and the head stay on the target.
 */
import type { SkillSpec } from "./pose-author";

const FIST = "fist";
const SEAL = "seal";
const OPEN = "open";

export const FAN_SWEEP_SPEC: SkillSpec = {
  id: "fanSweep",
  name: "Fan-of-blades sweep (扇形剑雨)",
  // Unused under a spacing chart (kept for the type).
  releaseS: 0.083,
  holdS: 0.1,
  holdDrift: 0.1,
  followS: 0.14,
  settleS: 0.1,
  settleBack: 0.1,
  recoverS: 0.22,
  spacing: {
    weapon: [0, 0.3, 0.65, 0.9, 1, 1.55, 1.92, 1.97],
    lead: [0, 0.22, 0.55, 0.82, 0.96, 1.3, 1.6, 1.75],
    chest: [0, 0.08, 0.2, 0.4, 0.65, 0.85, 1, 1.25, 1.5, 1.68, 1.78],
    pelvis: [0, 0.04, 0.1, 0.25, 0.45, 0.7, 0.9, 1, 1.2, 1.38, 1.5],
  },
  recoverTo: 1.35,
  fadeS: 0.38,
  cheatDeg: 70,
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
    // 剑指 on the lead hand: index and middle straight and together, ring and little finger folded, the thumb over them.
    seal: {
      index_01_l: [0, 0, 4], index_02_l: [0, 0, 0], index_03_l: [0, 0, 0],
      middle_01_l: [0, 0, 2], middle_02_l: [0, 0, 0], middle_03_l: [0, 0, 0],
      ring_01_l: [0, 0, 78], ring_02_l: [0, 0, 95], ring_03_l: [0, 0, 55],
      pinky_01_l: [0, 0, 82], pinky_02_l: [0, 0, 92], pinky_03_l: [0, 0, 55],
      thumb_01_l: [0, 0, 28], thumb_02_l: [0, 0, 38], thumb_03_l: [0, 0, 30],
    },
    // The lead hand opened as it snaps back.
    open: {
      index_01_l: [0, 6, 8], middle_01_l: [0, 2, 10], ring_01_l: [0, -3, 12], pinky_01_l: [0, -8, 14],
      index_02_l: [0, 0, 8], middle_02_l: [0, 0, 10], ring_02_l: [0, 0, 12], pinky_02_l: [0, 0, 14],
    },
  },
  poses: [
    {
      // Key 1: the weight sinks, the seal comes up before the chest, the sword hangs low at the right hip.
      name: "ready",
      hips: [0.07, -0.01, 0],
      pelvis: [-3, -3, 0],
      spine1: [-3, -1, 0],
      spine2: [-3, 2, 0],
      spine3: [-4, 4, 1],
      neck: [-2, 2, 0],
      head: [-6, 0, 0],
      r: { upper: [0.35, -0.9, -0.25], fore: [0.3, -0.6, -0.75], fingers: [0.3, -0.62, -0.72], sword: [0.3, -0.55, -0.78] },
      l: { clav: [0, -4, 2], upper: [-0.45, -0.55, 0.7], upperTwist: -25, fore: [-0.1, 0.55, 0.83], fingers: [-0.05, 0.5, 0.87], thumb: [0.6, 0.5, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // The load starts: the sword hand draws out to the side at the waist, the seal reaches half way to the target;
      // the lead (left) foot steps forward, the back foot turns out.
      name: "early anticipation",
      hips: [0.12, -0.02, 0.01],
      pelvis: [-4, -6, -1],
      spine1: [-3, -2, 0],
      spine2: [-3, 4, 1],
      spine3: [-4, 12, 2],
      neck: [-2, 5, 0],
      head: [-6, 0, 0],
      r: { clav: [0, -3, 4], upper: [0.82, -0.4, -0.42], fore: [0.45, -0.05, -0.89], fingers: [0.5, -0.05, -0.86], sword: [0.62, -0.15, -0.77] },
      l: { clav: [0, -7, 4], upper: [-0.25, -0.2, 0.95], fore: [-0.1, 0.3, 0.95], fingers: [-0.08, 0.28, 0.96], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: { l: [0.15, -0.08, 12], r: [-0.1, 0.1, -35], stepS: 0.16, liftM: 0.05, first: "l" },
    },
    {
      // The sword hand at chest height out to the right and back; the seal at full reach on the target.
      name: "mid coil",
      hips: [0.16, -0.03, 0.02],
      pelvis: [-5, -9, -1],
      spine1: [-4, -3, 0],
      spine2: [-4, 6, 2],
      spine3: [-5, 20, 4],
      neck: [-3, 8, 0],
      head: [-7, 0, 0],
      r: { clav: [0, -5, 7], upper: [0.88, -0.05, -0.47], fore: [0.3, 0.3, -0.9], fingers: [0.35, 0.3, -0.88], sword: [0.78, 0.25, -0.57] },
      l: { clav: [0, -5, 5], upper: [-0.18, 0.08, 0.98], fore: [-0.1, 0.12, 0.99], fingers: [-0.08, 0.12, 0.99], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Maximum coil: hips 25 % of hip height down and back over the back foot; the S torso (pelvis 12° right, chest
      // 18° left, 30° apart); the sword cocked high, back and out (elbow up and out), the blade trailing back over
      // the shoulder; the seal on the target, the target-side shoulder low and reaching, the head on the target.
      name: "maximum coil",
      hips: [0.2, -0.04, 0.03],
      pelvis: [-6, -12, -2],
      spine1: [-5, -4, 0],
      spine2: [-5, 10, 3],
      spine3: [-6, 26, 6],
      neck: [-3, 11, 0],
      head: [-8, 0, 0],
      r: { clav: [0, -7, 12], upper: [0.93, 0.08, -0.36], fore: [0.36, 0.32, -0.88], fingers: [0.4, 0.32, -0.86], sword: [0.85, 0.4, -0.35] },
      l: { clav: [0, -5, 6], upper: [-0.15, 0.1, 0.98], fore: [-0.08, 0.12, 0.99], fingers: [-0.06, 0.12, 0.99], thumb: [0.3, 0.8, 0] },
      hands: [FIST, SEAL],
      stance: null,
    },
    {
      // Release (the weapon's F4): the arm swept round to point at the zone, level, a little right of the line; the
      // chest unwound past square, the pelvis turning after it; the lunge; the seal hand snapped back to the left hip.
      name: "release",
      hips: [0.16, 0.12, -0.01],
      pelvis: [-12, 4, 0],
      spine1: [-13, 12, 1],
      spine2: [-15, 20, 2],
      spine3: [-16, 28, 2],
      neck: [-8, 10, 0],
      head: [-10, 0, 0],
      r: { clav: [0, 12, 2], upper: [0.25, 0.1, 0.96], fore: [0.1, 0.05, 0.99], fingers: [0.08, 0.02, 1], sword: [-0.05, -0.05, 1] },
      l: { clav: [0, 8, -4], upper: [-0.55, -0.6, -0.58], fore: [-0.4, -0.55, -0.73], fingers: [-0.35, -0.6, -0.72], thumb: [0, 1, 0] },
      hands: [FIST, OPEN],
      stance: { l: [0.1, -0.12, 15], r: [0.2, 0.06, -15], stepS: 0.12, liftM: 0.05, first: "r" },
    },
    {
      // Overshoot (the weapon's F6): the sword carried past the target to the front-left and a little down, the chest
      // still turning, the pelvis catching up, the lead hand flung further back.
      name: "follow-through",
      hips: [0.15, 0.15, -0.02],
      pelvis: [-14, 14, 0],
      spine1: [-15, 22, 1],
      spine2: [-17, 30, 2],
      spine3: [-18, 40, 2],
      neck: [-9, 16, 0],
      head: [-10, 4, 0],
      r: { clav: [0, 16, 0], upper: [-0.1, 0, 0.99], fore: [-0.45, -0.1, 0.89], fingers: [-0.5, -0.12, 0.86], sword: [-0.75, -0.2, 0.62] },
      l: { clav: [0, 10, -4], upper: [-0.7, -0.3, -0.65], fore: [-0.55, -0.35, -0.76], fingers: [-0.5, -0.4, -0.76], thumb: [0, 1, 0] },
      hands: [FIST, OPEN],
      stance: null,
    },
  ],
};
