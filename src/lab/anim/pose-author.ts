/**
 * Key-pose authoring for the skills lab (dev-only, never built; motion round 4). A pose is written in the terms the
 * play camera reads (where each arm segment points, where the sword points, how far the hips drop and the torso
 * coils) and baked here into the runtime data: absolute bone turns, Euler degrees, character frame (x right, y up,
 * z back; 'YZX'), under canonical names (key-pose.ts). Directions in a spec are (right, up, forward).
 *
 * - Pelvis, spine, neck and head are given as turns directly ([x, y, z] deg in the runtime convention: x tips a
 *   spine bone back (+) or forward (−), z tips it to the left (+), y turns it left (+)). A clavicle's turn is
 *   relative to the chest (spine_03), so an unnamed one follows the chest's coil.
 * - An arm segment (upper arm, forearm) is given as a direction: the turn is the shortest one from the bone's rest
 *   direction, then `twist` degrees about the new direction.
 * - A hand is given as the fingers' direction and either the held sword's direction (the right hand: the grip of
 *   hand-sword.ts in the hand's frame) or the thumb's direction (the off hand).
 * Bake in the lab with `__labPose.bake(spec)` and paste the result into the skill's pose file; `__labPose.preview`
 * plays a spec without baking it into the file.
 */
import * as THREE from "three";
import type { Euler3, HandShape, KeyPose, KeyPoseSkill, KeyStance } from "./key-pose";
import { BODY_BONES } from "./key-pose";
import type { Rig } from "./rig";

/** (right, up, forward). */
export type Dir = readonly [number, number, number];

export interface ArmSpec {
  readonly clav?: Euler3;
  readonly upper: Dir;
  readonly upperTwist?: number;
  readonly fore: Dir;
  readonly foreTwist?: number;
  /** Fingers' direction, and the sword's (sword hand) or the thumb's (off hand). */
  readonly fingers: Dir;
  readonly sword?: Dir;
  readonly thumb?: Dir;
}

export interface PoseSpec {
  readonly name: string;
  readonly hips: Euler3;
  readonly pelvis: Euler3;
  readonly spine1: Euler3;
  readonly spine2: Euler3;
  readonly spine3: Euler3;
  readonly neck: Euler3;
  readonly head: Euler3;
  readonly r: ArmSpec;
  readonly l: ArmSpec;
  readonly hands: readonly [string, string];
  readonly stance: KeyStance | null;
}

export interface SkillSpec extends Omit<KeyPoseSkill, "poses"> {
  readonly poses: readonly [PoseSpec, PoseSpec, PoseSpec, PoseSpec, PoseSpec, PoseSpec];
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _t = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _n = new THREE.Matrix4();
const _e = new THREE.Euler();

/** (right, up, forward) → the character frame (x right, y up, z back), normalised. */
function frame(d: Dir, out: THREE.Vector3): THREE.Vector3 {
  return out.set(d[0], d[1], -d[2]).normalize();
}

/** Runtime-convention turn (deg, 'YZX') → quaternion. */
function eulerQ(e: Euler3, out: THREE.Quaternion): THREE.Quaternion {
  const k = Math.PI / 180;
  return out.setFromEuler(_e.set(e[0] * k, e[1] * k, e[2] * k, "YZX"));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function toEuler(q: THREE.Quaternion): Euler3 {
  _e.setFromQuaternion(q, "YZX");
  const k = 180 / Math.PI;
  return [round1(_e.x * k), round1(_e.y * k), round1(_e.z * k)];
}

/** Orthonormal basis from a primary axis and a secondary hint (columns: primary, secondary ⟂, their cross). */
function basis(p: THREE.Vector3, s: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  _a.copy(p).normalize();
  _b.copy(s).addScaledVector(_a, -s.dot(_a)).normalize();
  _c.crossVectors(_a, _b);
  return out.makeBasis(_a, _b, _c);
}

export class PoseAuthor {
  /** Rest world turn of each bone in the character frame. */
  private readonly restW = new Map<string, THREE.Quaternion>();
  /** Rest position of each bone in the character frame. */
  private readonly restP = new Map<string, THREE.Vector3>();

  constructor(
    rig: Rig,
    private readonly root: THREE.Object3D,
    /** The sword's direction in hand_r's frame (hand-sword.ts grip: tilt from +z towards +y). */
    private readonly swordLocal: THREE.Vector3,
  ) {
    const q = new Float32Array(rig.count * 4);
    const p = new Float32Array(rig.count * 3);
    const saveQ = new Float32Array(rig.count * 4);
    const saveP = new Float32Array(rig.count * 3);
    rig.readPose(saveQ, saveP);
    rig.restPose(q, p);
    rig.writePose(q, p);
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const rootM = root.matrixWorld.clone().invert();
    root.matrixWorld.decompose(pos, rootInv, s);
    rootInv.invert();
    for (let i = 0; i < rig.count; i += 1) {
      const b = rig.bones[i]!;
      const wq = new THREE.Quaternion();
      b.matrixWorld.decompose(pos, wq, s);
      this.restW.set(b.name, wq.premultiply(rootInv));
      this.restP.set(b.name, b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM));
    }
    rig.writePose(saveQ, saveP);
    root.updateMatrixWorld(true);
  }

  /** A segment's turn: shortest from its rest direction (bone → child) to `dir`, then `twist` about it. */
  private segment(bone: string, child: string, dir: Dir, twist: number): Euler3 {
    const p0 = this.restP.get(bone);
    const p1 = this.restP.get(child);
    if (!p0 || !p1) return [0, 0, 0];
    _d.subVectors(p1, p0).normalize();
    frame(dir, _c);
    _q.setFromUnitVectors(_d, _c);
    if (twist !== 0) _q.premultiply(_t.setFromAxisAngle(_c, (twist * Math.PI) / 180));
    return toEuler(_q);
  }

  /** A hand's turn: its fingers along `fingers`, the held sword (or the thumb) towards `second`. */
  private hand(side: "l" | "r", fingers: Dir, second: Dir, sword: boolean): Euler3 {
    const R0 = this.restW.get("hand_" + side);
    const h = this.restP.get("hand_" + side);
    const mid = this.restP.get("middle_01_" + side);
    const th = this.restP.get("thumb_02_" + side);
    if (!R0 || !h || !mid || !th) return [0, 0, 0];
    // Rest: the fingers' direction, and the sword (its grip direction turned by the hand's rest) or the thumb.
    const f0 = new THREE.Vector3().subVectors(mid, h).normalize();
    const s0 = sword ? this.swordLocal.clone().applyQuaternion(R0).normalize() : new THREE.Vector3().subVectors(th, h).normalize();
    // With a sword, it is the primary axis (where the blade points matters most at the play camera).
    const f1 = frame(fingers, new THREE.Vector3());
    const s1 = frame(second, new THREE.Vector3());
    if (sword) {
      basis(s0, f0, _m);
      basis(s1, f1, _n);
    } else {
      basis(f0, s0, _m);
      basis(f1, s1, _n);
    }
    _n.multiply(_m.transpose());
    _q.setFromRotationMatrix(_n);
    return toEuler(_q);
  }

  /** Bakes one pose spec into runtime data. */
  pose(spec: PoseSpec): KeyPose {
    const body: Record<string, Euler3> = {
      pelvis: spec.pelvis,
      spine_01: spec.spine1,
      spine_02: spec.spine2,
      spine_03: spec.spine3,
      neck_01: spec.neck,
      head: spec.head,
    };
    const chest = eulerQ(spec.spine3, new THREE.Quaternion());
    for (const side of ["r", "l"] as const) {
      const a = spec[side];
      body["clavicle_" + side] = toEuler(eulerQ(a.clav ?? [0, 0, 0], _t).premultiply(chest));
      body["upperarm_" + side] = this.segment("upperarm_" + side, "lowerarm_" + side, a.upper, a.upperTwist ?? 0);
      body["lowerarm_" + side] = this.segment("lowerarm_" + side, "hand_" + side, a.fore, a.foreTwist ?? 0);
      body["hand_" + side] = this.hand(side, a.fingers, a.sword ?? a.thumb ?? [0, -1, 0], a.sword !== undefined);
    }
    for (const nm of Object.keys(body)) if (!BODY_BONES.includes(nm)) delete body[nm];
    return { name: spec.name, hips: spec.hips, body, hands: spec.hands, stance: spec.stance };
  }

  skill(spec: SkillSpec): KeyPoseSkill {
    const poses = spec.poses.map((p) => this.pose(p)) as unknown as KeyPoseSkill["poses"];
    return { ...spec, poses };
  }
}

/** Formats a baked skill's poses as TypeScript (pasted into the pose file). */
export function posesSource(skill: KeyPoseSkill): string {
  const fmt = (e: Euler3): string => `[${e.join(", ")}]`;
  const lines: string[] = [];
  for (const p of skill.poses) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(p.name)},`);
    lines.push(`    hips: ${fmt(p.hips)},`);
    lines.push("    body: {");
    for (const [k, v] of Object.entries(p.body)) lines.push(`      ${k}: ${fmt(v)},`);
    lines.push("    },");
    lines.push(`    hands: [${JSON.stringify(p.hands[0])}, ${JSON.stringify(p.hands[1])}],`);
    lines.push(`    stance: ${p.stance === null ? "null" : JSON.stringify(p.stance)},`);
    lines.push("  },");
  }
  return lines.join("\n");
}

export type { HandShape };
