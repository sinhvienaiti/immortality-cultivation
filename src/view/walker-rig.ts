/**
 * Walking rigged characters (canon §21.2, D44, PB-21): clip blending and
 * sockets taken from kit/three/hero.ts; locomotion idle | run | dash, no
 * flight pitch. Players, bots, generals and the boss use it (SkinnedMesh).
 * Owner: Lane 1 (milestone 1b). TODO(lane-1): Source src/kit/three/hero.ts (blend and sockets only); SYNC_DEBT.md.
 */
import type * as THREE from "three";

export type WalkerLocomotion = "idle" | "run" | "dash";

export interface Walker {
  readonly root: THREE.Object3D;
  setLocomotion(state: WalkerLocomotion): void;
  play(clip: string, fadeS?: number): void;
  socket(name: string): THREE.Object3D | null;
  update(dt: number): void;
  dispose(): void;
}

export function createWalker(_rig: THREE.Object3D, _clips: readonly THREE.AnimationClip[]): Walker {
  throw new Error("TODO(lane-1): view/walker-rig.ts createWalker");
}
