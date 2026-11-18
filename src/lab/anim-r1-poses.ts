/** Ticket 397: human-only Sword A, authored directions baked by the existing PoseAuthor. */
import * as THREE from "three";
import { type PoseSpec, type SkillSpec } from "./anim/pose-author";
import type { HandShape, KeyPoseSkill } from "./anim/key-pose";
import type { Rig } from "./anim/rig";
import { R2Author, SEAL_HANDS } from "./anim-r2-poses";

export const R1_SLOT = "anim-r1";
export const R1_RELEASE_FRAME = 54;

function fingers(seal: boolean): HandShape {
  const result: Record<string, readonly [number, number, number]> = {};
  for (const side of ["r", "l"] as const) {
    const sign = side === "r" ? -1 : 1;
    for (const finger of ["index", "middle", "ring", "pinky", "thumb"] as const) {
      const curl = seal && (finger === "ring" || finger === "pinky") ? [72, 86, 48]
        : finger === "thumb" ? (seal ? [24, 34, 22] : [9, 12, 9]) : [5, 7, 5];
      for (let j = 0; j < 3; j++) result[`${finger}_0${j + 1}_${side}`] = [0, 0, sign * curl[j]!];
    }
  }
  return result;
}

// Both hands are free: S0 cups at the lower abdomen; S1 leads sword qi with two fingers.
// No held sword is forced through an open palm. The host hides its existing grip prop in this mode.
const ready: PoseSpec = {
  name: "S0 · return to origin", hips: [0.025, 0, 0], pelvis: [-2, 0, 0],
  spine1: [-2, 0, 0], spine2: [-2, 0, 0], spine3: [-3, 0, 0], neck: [0, 0, 0], head: [-3, 0, 0],
  r: { upper: [0.22, -0.95, 0.22], fore: [-0.82, 0.1, 0.56], fingers: [-0.92, 0.08, 0.38], thumb: [0, 0.9, 0.2] },
  l: { upper: [-0.24, -0.96, 0.12], fore: [0.78, 0.02, 0.62], fingers: [0.92, 0.04, 0.38], thumb: [0, 0.95, 0.12] },
  hands: ["S0", "S0"], stance: null,
};

export const R1_SPEC: SkillSpec = {
  id: R1_SLOT, name: "Sword A · S0 to S1", releaseS: 0.18, holdS: 0.075, holdDrift: 0.12,
  followS: 0.12, settleS: 0.09, settleBack: 0.12, recoverS: 0.34,
  circle: { torso: 0.45, arm: 0.6, wrist: 0.12, hz: 0.45 }, armBone: "upperarm_r", wristBone: "hand_r",
  hands: { S0: fingers(false), S1: fingers(true) },
  poses: [
    ready,
    {
      ...ready, name: "open bridge · wrists separate before closing fingers", hips: [0.04, -0.01, 0.005],
      pelvis: [-3, -5, 0], spine1: [-3, -3, 0], spine2: [-3, 0, 0], spine3: [-4, 3, 1],
      r: { upper: [0.46, -0.77, 0.44], fore: [0.25, 0.38, 0.88], fingers: [0.16, 0.32, 0.93], thumb: [-0.6, 0.7, 0.2] },
      l: { upper: [-0.38, -0.75, 0.53], fore: [-0.12, 0.56, 0.82], fingers: [-0.04, 0.6, 0.8], thumb: [0.8, 0.4, 0] },
      stance: { l: [0.15, 0, 8], r: [0, 0, -10], stepS: 0.22, liftM: 0.045, first: "l" },
    },
    {
      ...ready, name: "S1 · sword fingers and hip coil", hips: [0.055, -0.018, 0.01],
      pelvis: [-4, -11, -1], spine1: [-3, -7, 0], spine2: [-3, -2, 0], spine3: [-4, 8, 2],
      r: { upper: [0.62, -0.46, -0.63], fore: [0.18, 0.62, 0.76], fingers: [0.12, 0.52, 0.85], thumb: [-0.8, 0.5, 0.1] },
      l: { upper: [-0.4, -0.52, 0.75], fore: [-0.1, 0.45, 0.88], fingers: [-0.04, 0.32, 0.95], thumb: [0.8, 0.4, 0] },
      hands: ["S1", "S1"],
    },
    {
      ...ready, name: "S1 · loaded behind shoulder", hips: [0.07, -0.025, 0.015],
      pelvis: [-5, -16, -1], spine1: [-4, -9, 0], spine2: [-4, 0, 1], spine3: [-5, 12, 3],
      r: { clav: [0, -3, 3], upper: [0.65, -0.12, -0.75], fore: [0.18, 0.64, 0.75], fingers: [0.08, 0.5, 0.86], thumb: [-0.8, 0.5, 0.1] },
      l: { upper: [-0.35, -0.35, 0.87], fore: [-0.1, 0.35, 0.93], fingers: [-0.04, 0.23, 0.97], thumb: [0.8, 0.4, 0] },
      hands: ["S1", "S1"],
    },
    {
      ...ready, name: "release · hip leads the sword line", hips: [0.05, 0.035, -0.005],
      pelvis: [-7, 6, 0], spine1: [-6, 9, 0], spine2: [-7, 13, 0], spine3: [-8, 17, 1], head: [-4, -3, 0],
      r: { upper: [0.36, -0.05, 0.93], fore: [-0.08, 0.07, 0.99], fingers: [-0.1, 0.04, 0.99], thumb: [-0.7, 0.7, 0] },
      l: { upper: [-0.4, -0.78, -0.48], fore: [0.12, 0.12, 0.98], fingers: [0.08, 0.25, 0.96], thumb: [0.8, 0.4, 0] },
      hands: ["S1", "S1"],
    },
    {
      ...ready, name: "follow · arc crosses and settles", hips: [0.04, 0.028, -0.012],
      pelvis: [-5, 11, 0], spine1: [-5, 15, 0], spine2: [-5, 20, 1], spine3: [-6, 24, 1], head: [-3, -5, 0],
      r: { upper: [-0.18, -0.2, 0.96], fore: [-0.36, -0.08, 0.93], fingers: [-0.4, -0.12, 0.91], thumb: [-0.7, 0.7, 0] },
      l: { upper: [-0.36, -0.85, -0.38], fore: [0.15, 0.05, 0.98], fingers: [0.05, 0.3, 0.95], thumb: [0.8, 0.4, 0] },
      hands: ["S1", "S1"],
    },
  ],
};

export function swordASkill(rig: Rig, root: THREE.Object3D): KeyPoseSkill {
  const r2 = new R2Author(rig, root);
  // Keep Sword A's coil/release/follow; correct the two-hand entry that round 1 could not see.
  return r2.author.skill({ ...R1_SPEC, hands: { ...R1_SPEC.hands, ...SEAL_HANDS },
    poses: [r2.seal(0), { ...r2.bridge(), stance: R1_SPEC.poses[1].stance }, R1_SPEC.poses[2], R1_SPEC.poses[3], R1_SPEC.poses[4], R1_SPEC.poses[5]] });
}
