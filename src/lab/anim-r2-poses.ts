/** Ticket 403: ten research-393 seals and two action families, on the existing human only. */
import * as THREE from "three";
import { PoseAuthor, type ArmSpec, type Dir, type PoseSpec, type SkillSpec } from "./anim/pose-author";
import type { HandShape, KeyPoseSkill } from "./anim/key-pose";
import type { Rig } from "./anim/rig";

export const FAMILIES = ["sword", "palm", "array"] as const;
export type Family = typeof FAMILIES[number];
export const FAMILY_SLOT: Record<Family, string> = { sword: "anim-r1", palm: "anim-r2-palm", array: "anim-r2-array" };
export const FAMILY_WORD: Record<Family, string> = { sword: "sword", palm: "palm", array: "array" };
export const SEAL_NAMES = ["Return to Origin", "Sword Fingers", "Sprouting Branches", "Guiding Flow", "Banked Flame",
  "Mountain Guard", "Guiding Thunder", "Frozen Crystal", "Guiding Wind", "Opening Heaven"] as const;
export const FINGERS = ["index", "middle", "ring", "pinky", "thumb"] as const;

// Degrees relative to the parent rest frame. The thumb stays outside the folded fingers.
const OPEN = [5, 8, 5] as const, SOFT = [18, 23, 15] as const, HALF = [35, 46, 28] as const;
const FOLD = [66, 76, 44] as const, THUMB = [12, 20, 12] as const;
type Curl = readonly [number, number, number];
const curls: readonly (readonly [Curl, Curl, Curl, Curl, Curl])[] = [
  [OPEN, OPEN, OPEN, OPEN, THUMB], [OPEN, OPEN, FOLD, FOLD, [23, 30, 20]],
  [SOFT, SOFT, HALF, HALF, [9, 14, 9]], [SOFT, SOFT, SOFT, SOFT, [9, 17, 10]],
  [HALF, HALF, HALF, HALF, [12, 18, 12]], [OPEN, OPEN, OPEN, OPEN, THUMB],
  [FOLD, FOLD, FOLD, FOLD, [23, 30, 20]], [OPEN, OPEN, OPEN, OPEN, THUMB],
  [OPEN, OPEN, HALF, HALF, [8, 13, 8]], [OPEN, OPEN, FOLD, FOLD, [23, 30, 20]],
];
export function sealShape(id: number): HandShape {
  const shape: Record<string, Curl> = {};
  for (const side of ["r", "l"] as const) {
    const sign = side === "r" ? -1 : 1;
    let c = curls[id]!;
    if (side === "l" && id === 5) c = [FOLD, FOLD, FOLD, FOLD, [23, 30, 20]];
    if (side === "l" && id === 6) c = [HALF, HALF, HALF, HALF, THUMB];
    if (side === "l" && (id === 8 || id === 9)) c = [SOFT, SOFT, SOFT, SOFT, THUMB];
    FINGERS.forEach((finger, i) => {
      for (let j = 0; j < 3; j++) {
        // A small metacarpal fan leaves a visible gap even in the curled poses.
        const fan = finger === "thumb" ? -10 : [3, 0, -3, -6][i]!;
        shape[`${finger}_0${j + 1}_${side}`] = [0, j === 0 ? sign * fan : 0, sign * c[i]![j]!];
      }
    });
  }
  return shape;
}
export const SEAL_HANDS: Record<string, HandShape> = Object.fromEntries(SEAL_NAMES.map((_, i) => [`S${i}`, sealShape(i)]));
SEAL_HANDS.open = sealShape(0);
SEAL_HANDS.flameRelease = { ...sealShape(0) };

interface HandPlan { wrist: Dir; fingers: Dir; thumb: Dir }
interface SealPlan { r: HandPlan; l: HandPlan }
const hand = (wrist: Dir, fingers: Dir, thumb: Dir): HandPlan => ({ wrist, fingers, thumb });
// Wrist positions in metres (right, height, forward); avoid interlacing and keep the face unobscured.
const plans: readonly SealPlan[] = [
  { r: hand([0.08, .99, .29], [-.95, .05, .3], [0, .1, -1]), l: hand([-.08, .89, .28], [.95, .05, .3], [0, .1, -1]) },
  { r: hand([.22, 1.24, .32], [.1, .5, .86], [-.8, .5, .1]), l: hand([-.27, 1.04, .27], [0, .35, .94], [.8, .4, 0]) },
  { r: hand([.105, 1.16, .31], [.45, .84, .15], [0, .2, -1]), l: hand([-.105, 1.16, .31], [-.45, .84, .15], [0, .2, -1]) },
  { r: hand([.13, 1.08, .36], [-.7, .2, .3], [0, .6, -.5]), l: hand([-.14, .89, .3], [.7, -.1, .3], [0, -.6, -.5]) },
  { r: hand([.29, 1.05, .22], [0, .82, .57], [-1, 0, 0]), l: hand([-.14, .92, .28], [.5, .1, .86], [0, .85, -.3]) },
  { r: hand([.25, 1.23, .34], [0, 1, .05], [-1, 0, 0]), l: hand([-.28, .94, .16], [.3, .15, .9], [0, .9, 0]) },
  { r: hand([.24, 1.37, .24], [.1, .8, .58], [-1, .1, 0]), l: hand([-.04, 1.2, .28], [.25, .6, .76], [0, .7, -.4]) },
  { r: hand([.07, 1.14, .34], [.04, 1, 0], [0, 0, -1]), l: hand([-.07, 1.14, .34], [-.04, 1, 0], [0, 0, -1]) },
  { r: hand([.4, 1.27, .18], [.35, .05, .94], [-.1, -.9, .1]), l: hand([-.27, .96, .3], [-.3, .1, .95], [.1, .9, 0]) },
  { r: hand([.17, 1.41, .28], [.25, .78, .58], [-1, .1, 0]), l: hand([-.04, 1.22, .32], [.85, .2, .4], [0, 1, 0]) },
];

export class R2Author {
  readonly author: PoseAuthor;
  private readonly rest = new Map<string, THREE.Vector3>();
  constructor(readonly rig: Rig, readonly root: THREE.Object3D) {
    this.author = new PoseAuthor(rig, root, new THREE.Vector3(0, .2, 1));
    const q = new Float32Array(rig.count * 4), p = new Float32Array(rig.count * 3);
    rig.readPose(q, p); rig.writePose(rig.restQ, rig.restP); root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    rig.bones.forEach(b => { const v = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); v.z *= -1; this.rest.set(b.name, v); });
    rig.writePose(q, p); root.updateMatrixWorld(true);
  }
  arm(side: "r" | "l", plan: HandPlan): ArmSpec {
    const shoulder = this.rest.get(`upperarm_${side}`)!, elbow = this.rest.get(`lowerarm_${side}`)!;
    const wrist = this.rest.get(`hand_${side}`)!;
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    const target = new THREE.Vector3(...plan.wrist), line = target.clone().sub(shoulder);
    const d = THREE.MathUtils.clamp(line.length(), Math.abs(a - b) + .005, (a + b) * .97);
    line.normalize();
    const pole = new THREE.Vector3(side === "r" ? 1 : -1, -.65, -.3);
    pole.addScaledVector(line, -pole.dot(line)).normalize();
    const along = (a * a - b * b + d * d) / (2 * d);
    const bend = shoulder.clone().addScaledVector(line, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    const end = shoulder.clone().addScaledVector(line, d);
    return { upper: bend.clone().sub(shoulder).normalize().toArray(), fore: end.sub(bend).normalize().toArray(),
      fingers: plan.fingers, thumb: plan.thumb };
  }
  seal(id: number): PoseSpec {
    const plan = plans[id]!;
    return { name: `S${id} · ${SEAL_NAMES[id]}`, hips: [.035, 0, 0], pelvis: [-2, 0, 0],
      spine1: [-2, 0, 0], spine2: [-2, 0, 0], spine3: [-3, 0, 0], neck: [0, 0, 0], head: [-3, 0, 0],
      r: this.arm("r", plan.r), l: this.arm("l", plan.l), hands: [`S${id}`, `S${id}`], stance: null };
  }
  bridge(): PoseSpec {
    return { ...this.seal(0), name: "Open bridge", hands: ["open", "open"],
      r: this.arm("r", hand([.3, 1.08, .3], [.25, .6, .76], [-1, .3, 0])),
      l: this.arm("l", hand([-.3, 1.08, .3], [-.25, .6, .76], [1, .3, 0])) };
  }
  family(family: Exclude<Family, "sword">): KeyPoseSkill {
    const base = this.seal(0), bridge = this.bridge(), palm = family === "palm";
    const coil = { ...this.seal(palm ? 4 : 7), hips: [.055, -.018, .008] as const,
      pelvis: [-4, -12, 0] as const, spine1: [-3, -8, 0] as const, spine2: [-3, -2, 0] as const,
      spine3: [-4, 7, 1] as const };
    const release: PoseSpec = palm ? { ...coil, name: "Palm · hip leads an open push", hips: [.05, .032, -.005],
      pelvis: [-5, 6, 0], spine1: [-5, 9, 0], spine2: [-6, 13, 0], spine3: [-7, 17, 1], hands: ["open", "S5"],
      r: this.arm("r", hand([.23, 1.24, .47], [0, 1, .12], [-1, 0, 0])),
      l: this.arm("l", hand([-.3, 1.02, .16], [.1, .7, .7], [1, .2, 0])) }
      : { ...coil, name: "Array · both palms press down", hips: [.06, .025, 0], pelvis: [-8, 3, 0],
        spine1: [-7, 5, 0], spine2: [-8, 8, 0], spine3: [-10, 11, 0], hands: ["open", "open"],
        r: this.arm("r", hand([.22, .94, .4], [.1, -.1, .99], [-1, 0, 0])),
        l: this.arm("l", hand([-.22, .94, .4], [-.1, -.1, .99], [1, 0, 0])) };
    const follow: PoseSpec = palm ? { ...release, name: "Palm · arrest wrist and settle", hips: [.052, .04, -.006],
      pelvis: [-5, 10, 0], spine3: [-7, 22, 1], r: this.arm("r", hand([.19, 1.2, .49], [0, 1, .17], [-1, 0, 0])) }
      : { ...release, name: "Array · complete the downward arc", hips: [.062, .03, 0],
        r: this.arm("r", hand([.26, .85, .38], [.25, -.2, .95], [-1, 0, 0])),
        l: this.arm("l", hand([-.26, .85, .38], [-.25, -.2, .95], [1, 0, 0])) };
    const spec: SkillSpec = { id: FAMILY_SLOT[family], name: palm ? "Palm" : "Ground Array", hands: SEAL_HANDS,
      releaseS: .24, holdS: palm ? .1 : .13, holdDrift: .12, followS: .12, settleS: .09, settleBack: .12, recoverS: palm ? .38 : .42,
      circle: { torso: .4, arm: .55, wrist: .12, hz: .45 }, armBone: "upperarm_r", wristBone: "hand_r",
      poses: [base, { ...bridge, stance: { l: [.12, 0, 8], r: [0, 0, -10], stepS: .22, liftM: .045, first: "l" } },
        { ...coil, name: palm ? "Palm · gather at the flank" : "Array · draw the upper seal", r: palm ? coil.r : this.seal(9).r, l: palm ? coil.l : this.seal(9).l },
        coil, release, follow] };
    return this.author.skill(spec);
  }
}
