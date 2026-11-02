/**
 * Bakes the key-pose authoring specs into the runtime pose files (skills lab, motion round 4):
 *   npx tsx scripts/lab/bake-key-poses.ts
 * Builds the human proxy's skeleton at rest from its GLB (art-src/lab/anim/human-base-animations.glb, read as JSON:
 * no textures, no WebGL), wrapped in the half turn the lab gives a +z model, and runs pose-author.ts on each spec.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { FAN_SWEEP_SPEC } from "../../src/lab/anim/fan-sweep-spec";
import { PoseAuthor, posesSource, type SkillSpec } from "../../src/lab/anim/pose-author";
import { Rig } from "../../src/lab/anim/rig";
import { heroProfile } from "../../src/lab/hero-select";

interface GltfNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

const root = resolve(import.meta.dirname, "../..");
const hero = heroProfile("human");

function skeleton(file: string): THREE.Object3D {
  const buf = readFileSync(resolve(root, "art-src/lab", file));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8")) as { nodes: GltfNode[]; skins: { joints: number[] }[]; scenes: { nodes: number[] }[] };
  const joints = new Set(json.skins[0]!.joints);
  const objs = json.nodes.map((n, i) => {
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name ?? "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => objs[i]!.add(objs[c]!)));
  const scene = new THREE.Group();
  for (const i of json.scenes[0]!.nodes) scene.add(objs[i]!);
  const model = new THREE.Group();
  model.add(scene);
  if (hero.front === "+z") scene.rotation.y = Math.PI;
  return model;
}

function swordLocal(): THREE.Vector3 {
  const g = hero.grip;
  const t = (g.tiltDeg * Math.PI) / 180;
  return new THREE.Vector3(0, Math.sin(t), Math.cos(t)).applyAxisAngle(new THREE.Vector3(0, 1, 0), (g.yawDeg * Math.PI) / 180);
}

function bake(spec: SkillSpec, constName: string, specName: string, specFile: string, out: string): void {
  const model = skeleton(hero.file);
  const casterRoot = new THREE.Group();
  casterRoot.add(model);
  casterRoot.updateMatrixWorld(true);
  const author = new PoseAuthor(new Rig(model), casterRoot, swordLocal());
  const skill = author.skill(spec);
  const src = `/**
 * ${spec.name}: key poses as played (motion round 4). Generated from ${specFile}.ts by
 * \`npx tsx scripts/lab/bake-key-poses.ts\`; do not edit by hand. Bone rotations under canonical names: absolute
 * turns from the human proxy's T-pose rest, Euler degrees, character frame (x right, y up, z back; 'YZX'; key-pose.ts).
 */
import type { KeyPoseSkill } from "./key-pose";
import { ${specName} } from "./${specFile}";

export const ${constName}: KeyPoseSkill = {
  ...${specName},
  poses: [
${posesSource(skill)
  .split("\n")
  .map((l) => "  " + l)
  .join("\n")}
  ],
};
`;
  writeFileSync(resolve(root, out), src);
  console.log("baked", out);
}

bake(FAN_SWEEP_SPEC, "FAN_SWEEP", "FAN_SWEEP_SPEC", "fan-sweep-spec", "src/lab/anim/fan-sweep-poses.ts");
