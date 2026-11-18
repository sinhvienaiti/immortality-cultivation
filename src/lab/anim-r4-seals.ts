/** Seals r4: poses solved in Blender from MediaPipe landmarks of sheet 411 (arm IK + per-bone aim),
 * art-src/lab/anim/seals-r4/pose_seals.py. F6 cycles S0–S9 on the `human` hero, Shift+F6 releases the pose.
 * The pose overrides local bone rotations after the animator; it eases in over BLEND_S. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAB_ASSETS } from "./look";
import { HERO } from "./hero-select";

const URL_R4 = LAB_ASSETS + "anim/seals-r4/seals-r4.glb";
const BLEND_S = 0.14;
export const R4_NAMES = ["Origin Rest", "Sword Fingers", "Sprouting Branches", "Guiding Flow", "Hidden Ember",
  "Mountain Ward", "Thunder Command", "Crystal Closure", "Guiding Wind", "Opening Heaven"] as const;

type Pose = Map<string, THREE.Quaternion>;

export interface AnimR4Lab { key(e: KeyboardEvent): boolean; afterBody(dt: number): void; reset(): void }

export function installAnimR4(root: THREE.Object3D): AnimR4Lab | null {
  if (HERO.id !== "human") return null;
  const poses: Pose[] = [];
  let seal = -1, weight = 0, keyAt = 0, latencyMs = -1;
  const bones = new Map<string, THREE.Object3D>();
  new GLTFLoader().load(URL_R4, gltf => {
    for (let i = 0; i < 10; i++) {
      const clip = gltf.animations.find(c => c.name === `S${i}`);
      const pose: Pose = new Map();
      for (const t of clip?.tracks ?? []) {
        if (!t.name.endsWith(".quaternion")) continue;
        const v = t.values, n = v.length;
        pose.set(t.name.slice(0, -11), new THREE.Quaternion(v[n - 4], v[n - 3], v[n - 2], v[n - 1]));
      }
      poses.push(pose);
    }
  });
  const bone = (name: string): THREE.Object3D | undefined => {
    let b = bones.get(name);
    if (!b) { b = root.getObjectByName(name); if (b) bones.set(name, b); }
    return b;
  };
  const api = {
    version: "r4", seal: (id: number) => { seal = id; weight = 0; keyAt = performance.now(); latencyMs = -1; },
    stop: () => { seal = -1; }, loaded: () => poses.length === 10,
    report: () => ({ seal, name: seal >= 0 ? R4_NAMES[seal] : null, weight, latencyMs, loaded: poses.length === 10 }),
  };
  (window as unknown as Record<string, unknown>).__labAnimR4 = api;
  return {
    key(e) {
      if (e.code !== "F6" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
      e.preventDefault();
      if (e.shiftKey) api.stop(); else api.seal((seal + 1) % 10);
      return true;
    },
    afterBody(dt) {
      const pose = poses[seal];
      if (seal < 0 || !pose) return;
      weight = Math.min(1, weight + Math.max(dt, 1 / 120) / BLEND_S);
      const w = weight * weight * (3 - 2 * weight);
      for (const [name, q] of pose) bone(name)?.quaternion.slerp(q, w);
      if (latencyMs < 0) latencyMs = performance.now() - keyAt;
    },
    reset() { seal = -1; bones.clear(); },
  };
}
