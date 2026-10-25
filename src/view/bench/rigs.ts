/**
 * Placeholder rigs for HN0 case E (canon §20.3, PB-21, PB-34): primitive
 * blocks with bones, never a modelled creature (canon D27): a biped
 * cultivator of ~15 000 triangles (20 bones) and a quadruped of ~45 000 (the
 * Vương) or ~15 000 (a general; 22 bones), never over the target, each part bound rigidly to one
 * bone so the GPU skins every vertex as a real rig would. Clips are built in
 * code from the local model contract's names (Idle, Run, Dash, Cast_Short,
 * Hit; Idle, Move, Attack, Death, Hit, Roar, Charge, Stagger) and played by
 * src/view/walker-rig.ts. An ink hull (back faces pushed out along the skinned
 * normal) is a second SkinnedMesh on the same skeleton, as the game draws
 * cultivators, generals and the Vương (canon §21.1).
 * Owner: Lane 1.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { triangleCount } from "../crowd";

export type RigKind = "cultivator" | "general" | "boss";

export interface PlaceholderRig {
  readonly kind: RigKind;
  readonly object: THREE.Group;
  readonly clips: THREE.AnimationClip[];
  readonly bones: number;
  /** Body triangles (the ink hull draws them again). */
  readonly triangles: number;
  readonly heightM: number;
}

/** Target triangles per kind, never passed (canon §20.3: người 15 000, Vương 45 000; a general as a small beast-king). */
export const RIG_TRIS: Readonly<Record<RigKind, number>> = { cultivator: 15_000, general: 15_000, boss: 45_000 };

/** Case E's cast (canon §20.3): the player, 2 bots, a general, the Vương, then spares (cultivators). */
export function skinnedRoles(count: number): RigKind[] {
  const roles: RigKind[] = ["cultivator", "cultivator", "cultivator", "general", "boss"];
  const out: RigKind[] = roles.slice(0, Math.max(0, count));
  while (out.length < count) out.push("cultivator");
  return out;
}

interface BoneDef {
  readonly name: string;
  readonly parent: string | null;
  /** Bind position in the model (m). */
  readonly at: readonly [number, number, number];
}

interface PartDef {
  readonly bone: string;
  readonly shape: "capsule" | "sphere" | "box" | "cone";
  /** Size: capsule (radius, length), sphere (radius), box (w, h, d), cone (radius, height). */
  readonly size: readonly number[];
  /** Centre in the model (m) and the axis the long side follows. */
  readonly at: readonly [number, number, number];
  readonly axis?: "x" | "y" | "z";
  /** Share of the detail (tiny parts get fewer segments). */
  readonly weight?: number;
}

const BIPED_BONES: readonly BoneDef[] = [
  { name: "Root", parent: null, at: [0, 0, 0] },
  { name: "Hips", parent: "Root", at: [0, 0.98, 0] },
  { name: "Spine", parent: "Hips", at: [0, 1.12, 0] },
  { name: "Chest", parent: "Spine", at: [0, 1.32, 0] },
  { name: "Neck", parent: "Chest", at: [0, 1.52, 0] },
  { name: "Head", parent: "Neck", at: [0, 1.6, 0] },
  ...(["L", "R"] as const).flatMap((side): BoneDef[] => {
    const s = side === "L" ? 1 : -1;
    return [
      { name: "Shoulder_" + side, parent: "Chest", at: [0.12 * s, 1.46, 0] },
      { name: "UpperArm_" + side, parent: "Shoulder_" + side, at: [0.22 * s, 1.45, 0] },
      { name: "ForeArm_" + side, parent: "UpperArm_" + side, at: [0.24 * s, 1.17, 0] },
      { name: "Hand_" + side, parent: "ForeArm_" + side, at: [0.25 * s, 0.92, 0] },
      { name: "Thigh_" + side, parent: "Hips", at: [0.1 * s, 0.94, 0] },
      { name: "Shin_" + side, parent: "Thigh_" + side, at: [0.1 * s, 0.52, 0] },
      { name: "Foot_" + side, parent: "Shin_" + side, at: [0.1 * s, 0.08, 0] },
    ];
  }),
];

const BIPED_PARTS: readonly PartDef[] = [
  { bone: "Hips", shape: "capsule", size: [0.16, 0.12], at: [0, 1.0, 0], axis: "x" },
  { bone: "Spine", shape: "capsule", size: [0.15, 0.14], at: [0, 1.16, 0] },
  { bone: "Chest", shape: "capsule", size: [0.19, 0.22], at: [0, 1.34, 0] },
  { bone: "Neck", shape: "capsule", size: [0.05, 0.06], at: [0, 1.54, 0], weight: 0.4 },
  { bone: "Head", shape: "sphere", size: [0.12], at: [0, 1.7, 0.01] },
  // A robe from the hips (cultivator placeholder: a cone frustum).
  { bone: "Hips", shape: "cone", size: [0.3, 0.6], at: [0, 0.7, 0] },
  ...(["L", "R"] as const).flatMap((side): PartDef[] => {
    const s = side === "L" ? 1 : -1;
    return [
      { bone: "UpperArm_" + side, shape: "capsule", size: [0.055, 0.2], at: [0.23 * s, 1.31, 0] },
      { bone: "ForeArm_" + side, shape: "capsule", size: [0.045, 0.18], at: [0.245 * s, 1.04, 0] },
      { bone: "Hand_" + side, shape: "sphere", size: [0.05], at: [0.25 * s, 0.87, 0.01], weight: 0.6 },
      { bone: "Thigh_" + side, shape: "capsule", size: [0.075, 0.3], at: [0.1 * s, 0.73, 0] },
      { bone: "Shin_" + side, shape: "capsule", size: [0.06, 0.32], at: [0.1 * s, 0.3, 0] },
      { bone: "Foot_" + side, shape: "box", size: [0.09, 0.07, 0.22], at: [0.1 * s, 0.04, 0.05], weight: 0.5 },
    ];
  }),
];

/** A quadruped `scale` times a 1.2 m wolf (nose +z). */
function quadBones(scale: number): BoneDef[] {
  const v = (x: number, y: number, z: number): readonly [number, number, number] => [x * scale, y * scale, z * scale];
  const legs = (["FL", "FR", "BL", "BR"] as const).flatMap((leg): BoneDef[] => {
    const sx = leg.endsWith("L") ? 1 : -1;
    const front = leg.startsWith("F");
    const hz = front ? 0.45 : -0.45;
    const parent = front ? "Chest" : "Spine1";
    return [
      { name: "Leg_" + leg, parent, at: v(0.2 * sx, 0.78, hz) },
      { name: "Shank_" + leg, parent: "Leg_" + leg, at: v(0.2 * sx, 0.42, hz + (front ? 0.02 : -0.04)) },
      { name: "Paw_" + leg, parent: "Shank_" + leg, at: v(0.2 * sx, 0.06, hz + 0.03) },
    ];
  });
  return [
    { name: "Root", parent: null, at: [0, 0, 0] },
    { name: "Spine1", parent: "Root", at: v(0, 0.86, -0.3) },
    { name: "Spine2", parent: "Spine1", at: v(0, 0.88, 0.05) },
    { name: "Chest", parent: "Spine2", at: v(0, 0.92, 0.4) },
    { name: "Neck", parent: "Chest", at: v(0, 1.02, 0.62) },
    { name: "Head", parent: "Neck", at: v(0, 1.14, 0.86) },
    { name: "Jaw", parent: "Head", at: v(0, 1.04, 0.96) },
    { name: "Tail1", parent: "Spine1", at: v(0, 0.9, -0.62) },
    { name: "Tail2", parent: "Tail1", at: v(0, 0.86, -0.88) },
    { name: "Tail3", parent: "Tail2", at: v(0, 0.8, -1.12) },
    ...legs,
  ];
}

function quadParts(scale: number): PartDef[] {
  const v = (x: number, y: number, z: number): readonly [number, number, number] => [x * scale, y * scale, z * scale];
  const legs = (["FL", "FR", "BL", "BR"] as const).flatMap((leg): PartDef[] => {
    const sx = leg.endsWith("L") ? 1 : -1;
    const hz = leg.startsWith("F") ? 0.45 : -0.45;
    return [
      { bone: "Leg_" + leg, shape: "capsule", size: [0.09 * scale, 0.26 * scale], at: v(0.2 * sx, 0.6, hz) },
      { bone: "Shank_" + leg, shape: "capsule", size: [0.065 * scale, 0.28 * scale], at: v(0.2 * sx, 0.25, hz + 0.01) },
      { bone: "Paw_" + leg, shape: "box", size: [0.12 * scale, 0.07 * scale, 0.18 * scale], at: v(0.2 * sx, 0.04, hz + 0.05), weight: 0.5 },
    ];
  });
  return [
    { bone: "Spine1", shape: "capsule", size: [0.27 * scale, 0.3 * scale], at: v(0, 0.86, -0.3), axis: "z" },
    { bone: "Spine2", shape: "capsule", size: [0.28 * scale, 0.3 * scale], at: v(0, 0.9, 0.05), axis: "z" },
    { bone: "Chest", shape: "capsule", size: [0.31 * scale, 0.26 * scale], at: v(0, 0.95, 0.4), axis: "z" },
    { bone: "Neck", shape: "capsule", size: [0.15 * scale, 0.22 * scale], at: v(0, 1.05, 0.66), axis: "z" },
    { bone: "Head", shape: "box", size: [0.26 * scale, 0.22 * scale, 0.34 * scale], at: v(0, 1.14, 0.9) },
    { bone: "Jaw", shape: "box", size: [0.18 * scale, 0.07 * scale, 0.24 * scale], at: v(0, 1.02, 1.0), weight: 0.6 },
    { bone: "Tail1", shape: "capsule", size: [0.08 * scale, 0.22 * scale], at: v(0, 0.89, -0.75), axis: "z" },
    { bone: "Tail2", shape: "capsule", size: [0.06 * scale, 0.2 * scale], at: v(0, 0.84, -1.0), axis: "z", weight: 0.7 },
    { bone: "Tail3", shape: "capsule", size: [0.045 * scale, 0.18 * scale], at: v(0, 0.78, -1.22), axis: "z", weight: 0.5 },
    ...legs,
  ];
}

function partGeometry(part: PartDef, detail: number): THREE.BufferGeometry {
  // Segment counts round separately, so the triangles follow `detail` in small steps.
  const d = Math.max(0.5, detail * (part.weight ?? 1));
  const n = (k: number, min: number): number => Math.max(min, Math.round(k * d));
  let geometry: THREE.BufferGeometry;
  if (part.shape === "capsule") geometry = new THREE.CapsuleGeometry(part.size[0]!, part.size[1]!, n(2, 1), n(8, 4));
  else if (part.shape === "sphere") geometry = new THREE.SphereGeometry(part.size[0]!, n(10, 6), n(7, 4));
  else if (part.shape === "cone") geometry = new THREE.CylinderGeometry(part.size[0]! * 0.45, part.size[0]!, part.size[1]!, n(10, 6), n(3, 1));
  else geometry = new THREE.BoxGeometry(part.size[0]!, part.size[1]!, part.size[2]!, n(2, 1), n(2, 1), n(2, 1));
  if (part.axis === "x") geometry.rotateZ(Math.PI / 2);
  else if (part.axis === "z") geometry.rotateX(Math.PI / 2);
  geometry.translate(part.at[0], part.at[1], part.at[2]);
  return geometry;
}

/** The body: every part at `detail`, skinned rigidly to its bone, merged into one geometry. */
function bodyGeometry(parts: readonly PartDef[], boneIndex: ReadonlyMap<string, number>, detail: number): THREE.BufferGeometry {
  const pieces = parts.map((part) => {
    const geometry = partGeometry(part, detail);
    const count = geometry.getAttribute("position").count;
    const index = boneIndex.get(part.bone) ?? 0;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let k = 0; k < count; k += 1) {
      skinIndex[k * 4] = index;
      skinWeight[k * 4] = 1;
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    return geometry;
  });
  const merged = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return merged;
}

/** The detail level whose body comes closest to `target` triangles without passing it (the contract's maximum). */
function fitDetail(parts: readonly PartDef[], boneIndex: ReadonlyMap<string, number>, target: number): THREE.BufferGeometry {
  const one = bodyGeometry(parts, boneIndex, 1);
  const base = triangleCount(one);
  one.dispose();
  const guess = Math.sqrt(target / Math.max(1, base));
  let best: THREE.BufferGeometry | null = null;
  let bestError = Infinity;
  for (let k = -16; k <= 8; k += 1) {
    const detail = Math.max(0.5, guess + k * 0.0625);
    const geometry = bodyGeometry(parts, boneIndex, detail);
    const tris = triangleCount(geometry);
    const error = tris > target ? Infinity : target - tris;
    if (error < bestError) {
      best?.dispose();
      best = geometry;
      bestError = error;
    } else geometry.dispose();
  }
  return best ?? bodyGeometry(parts, boneIndex, Math.max(1, guess));
}

function skeletonOf(defs: readonly BoneDef[]): { bones: THREE.Bone[]; index: Map<string, number>; root: THREE.Bone } {
  const bones: THREE.Bone[] = [];
  const index = new Map<string, number>();
  const byName = new Map<string, { bone: THREE.Bone; def: BoneDef }>();
  for (const def of defs) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    const parent = def.parent === null ? null : byName.get(def.parent)!;
    // Local position: the bind position less the parent's (no rotations at bind).
    bone.position.set(def.at[0] - (parent?.def.at[0] ?? 0), def.at[1] - (parent?.def.at[1] ?? 0), def.at[2] - (parent?.def.at[2] ?? 0));
    parent?.bone.add(bone);
    index.set(def.name, bones.length);
    bones.push(bone);
    byName.set(def.name, { bone, def });
  }
  return { bones, index, root: bones[0]! };
}

// ── Clips ───────────────────────────────────────────────────────────────────

/** A rotation track about one axis: `angles` (degrees) at evenly spaced keys over `seconds`, looping back to the first. */
function swing(bone: string, axis: "x" | "y" | "z", seconds: number, angles: readonly number[], loop = true): THREE.QuaternionKeyframeTrack {
  const keys = loop ? [...angles, angles[0]!] : [...angles];
  const times = keys.map((_, k) => (k / (keys.length - 1)) * seconds);
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const unit = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  for (const angle of keys) values.push(...q.setFromAxisAngle(unit, THREE.MathUtils.degToRad(angle)).toArray());
  return new THREE.QuaternionKeyframeTrack(bone + ".quaternion", times, values);
}

function bob(bone: string, base: readonly [number, number, number], seconds: number, heights: readonly number[]): THREE.VectorKeyframeTrack {
  const keys = [...heights, heights[0]!];
  const times = keys.map((_, k) => (k / (keys.length - 1)) * seconds);
  const values = keys.flatMap((h) => [base[0], base[1] + h, base[2]]);
  return new THREE.VectorKeyframeTrack(bone + ".position", times, values);
}

function bipedClips(hips: readonly [number, number, number]): THREE.AnimationClip[] {
  const legs = (amp: number, seconds: number): THREE.KeyframeTrack[] => [
    swing("Thigh_L", "x", seconds, [amp, 0, -amp, 0]),
    swing("Thigh_R", "x", seconds, [-amp, 0, amp, 0]),
    swing("Shin_L", "x", seconds, [10, 50, 10, 5]),
    swing("Shin_R", "x", seconds, [10, 5, 10, 50]),
    swing("UpperArm_L", "x", seconds, [-amp * 0.8, 0, amp * 0.8, 0]),
    swing("UpperArm_R", "x", seconds, [amp * 0.8, 0, -amp * 0.8, 0]),
    swing("ForeArm_L", "x", seconds, [-30, -20, -30, -20]),
    swing("ForeArm_R", "x", seconds, [-30, -20, -30, -20]),
    bob("Hips", hips, seconds, [0, 0.05, 0, 0.05]),
  ];
  return [
    new THREE.AnimationClip("Idle", 2, [swing("Chest", "x", 2, [0, 3, 0, -1]), swing("Head", "y", 2, [0, 6, 0, -6]), swing("UpperArm_L", "z", 2, [4, 7, 4, 2]), swing("UpperArm_R", "z", 2, [-4, -7, -4, -2])]),
    new THREE.AnimationClip("Run", 0.7, [...legs(38, 0.7), swing("Spine", "x", 0.7, [8, 10, 8, 10])]),
    new THREE.AnimationClip("Dash", 0.45, [...legs(55, 0.45), swing("Spine", "x", 0.45, [24, 26, 24, 26])]),
    new THREE.AnimationClip("Cast_Short", 0.6, [swing("UpperArm_R", "x", 0.6, [0, -120, -110, 0], false), swing("ForeArm_R", "x", 0.6, [0, -40, -30, 0], false), swing("Chest", "y", 0.6, [0, -15, -10, 0], false)]),
    new THREE.AnimationClip("Hit", 0.4, [swing("Chest", "x", 0.4, [0, -16, -6, 0], false), swing("Head", "x", 0.4, [0, -12, -4, 0], false)]),
  ];
}

function quadClips(scale: number): THREE.AnimationClip[] {
  const gait = (amp: number, seconds: number): THREE.KeyframeTrack[] => [
    swing("Leg_FL", "x", seconds, [amp, 0, -amp, 0]),
    swing("Leg_BR", "x", seconds, [amp, 0, -amp, 0]),
    swing("Leg_FR", "x", seconds, [-amp, 0, amp, 0]),
    swing("Leg_BL", "x", seconds, [-amp, 0, amp, 0]),
    swing("Shank_FL", "x", seconds, [-10, -40, -10, 0]),
    swing("Shank_FR", "x", seconds, [-10, 0, -10, -40]),
    swing("Shank_BL", "x", seconds, [10, 40, 10, 0]),
    swing("Shank_BR", "x", seconds, [10, 0, 10, 40]),
    swing("Spine2", "x", seconds, [3, -3, 3, -3]),
    swing("Tail1", "y", seconds, [12, -12, 12, -12]),
    bob("Spine1", [0, 0.86 * scale, -0.3 * scale], seconds, [0, 0.06 * scale, 0, 0.06 * scale]),
  ];
  return [
    new THREE.AnimationClip("Idle", 2.4, [swing("Chest", "x", 2.4, [0, 2, 0, -2]), swing("Head", "y", 2.4, [0, 10, 0, -10]), swing("Tail1", "y", 2.4, [8, -8, 8, -8])]),
    new THREE.AnimationClip("Move", 0.6, gait(32, 0.6)),
    new THREE.AnimationClip("Attack", 0.8, [swing("Neck", "x", 0.8, [0, -20, 25, 0], false), swing("Jaw", "x", 0.8, [0, 30, 0, 0], false)]),
    new THREE.AnimationClip("Death", 1.5, [swing("Spine1", "z", 1.5, [0, 30, 80, 90], false), swing("Neck", "x", 1.5, [0, 20, 40, 45], false)]),
    new THREE.AnimationClip("Hit", 0.4, [swing("Chest", "x", 0.4, [0, -12, -4, 0], false)]),
    new THREE.AnimationClip("Roar", 1.2, [swing("Neck", "x", 1.2, [0, -35, -40, 0], false), swing("Jaw", "x", 1.2, [0, 45, 45, 0], false)]),
    new THREE.AnimationClip("Charge", 0.5, gait(50, 0.5)),
    new THREE.AnimationClip("Stagger", 1, [swing("Spine2", "z", 1, [0, 14, -10, 0], false), swing("Head", "x", 1, [0, 20, 10, 0], false)]),
  ];
}

// ── Building ────────────────────────────────────────────────────────────────

const OUTLINE_PUSH = /* glsl */ `
#include <skinning_vertex>
transformed += normalize(objectNormal + vec3(0.0, 1e-5, 0.0)) * uOutlineM;
`;

function inkHull(geometry: THREE.BufferGeometry, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4, widthM: number): THREE.SkinnedMesh {
  const material = new THREE.MeshBasicMaterial({ color: "#15171c", side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineM = { value: widthM };
    shader.vertexShader = "uniform float uOutlineM;\n" + shader.vertexShader.replace("#include <skinning_vertex>", OUTLINE_PUSH);
  };
  material.customProgramCacheKey = () => "ic-rig-outline-v1";
  const hull = new THREE.SkinnedMesh(geometry, material);
  hull.bind(skeleton, bindMatrix);
  hull.frustumCulled = false;
  hull.name = "rig-outline";
  return hull;
}

/** A placeholder rig of `kind` (colour per kind; ~RIG_TRIS triangles unless `tris`). */
export function buildPlaceholderRig(kind: RigKind, tris: number = RIG_TRIS[kind], ramp?: THREE.Texture): PlaceholderRig {
  const scale = kind === "boss" ? 3.6 : kind === "general" ? 1.5 : 1;
  const boneDefs = kind === "cultivator" ? BIPED_BONES : quadBones(scale);
  const parts = kind === "cultivator" ? BIPED_PARTS : quadParts(scale);
  const { bones, index, root } = skeletonOf(boneDefs);
  const geometry = fitDetail(parts, index, tris);
  const colour = kind === "cultivator" ? "#e7e2d4" : kind === "general" ? "#2f4766" : "#3a3f52";
  const material = new THREE.MeshToonMaterial({ color: colour, ...(ramp !== undefined ? { gradientMap: ramp } : {}) });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(root);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  mesh.name = "rig-body";
  const hull = inkHull(geometry, skeleton, mesh.bindMatrix, kind === "boss" ? 0.05 : 0.025);
  const object = new THREE.Group();
  object.name = "rig-" + kind;
  object.add(mesh, hull);
  // Sockets (model contract): the cast hand, the back the swords rise from, the core, the mouth.
  const socket = (name: string, bone: string, at: readonly [number, number, number]): void => {
    const empty = new THREE.Object3D();
    empty.name = name;
    empty.position.set(...at);
    bones[index.get(bone) ?? 0]!.add(empty);
  };
  if (kind === "cultivator") {
    socket("FX_CORE", "Chest", [0, 0, 0]);
    socket("FX_CAST_R", "Hand_R", [0, -0.05, 0]);
    socket("FX_BACK", "Chest", [0, 0.1, -0.35]);
  } else {
    socket("FX_CORE", "Chest", [0, 0, 0]);
    socket("FX_MOUTH", "Jaw", [0, 0, 0.12 * scale]);
  }
  const hips: readonly [number, number, number] = [0, 0.98, 0];
  const clips = kind === "cultivator" ? bipedClips(hips) : quadClips(scale);
  return { kind, object, clips, bones: bones.length, triangles: triangleCount(geometry), heightM: kind === "cultivator" ? 1.85 : 1.25 * scale };
}
