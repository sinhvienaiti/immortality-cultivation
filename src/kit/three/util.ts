// Source: games/space-typing/src/scene3d/util.ts (kit copy: random draws take an optional source; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";

/**
 * Small numeric helpers shared by the 3D views. View code only: the draws
 * default to Math.random, never use them in a simulation (it has its seeded
 * RNG streams).
 */
export type Random = () => number;

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));
export const approach = (current: number, target: number, step: number): number =>
  current < target ? Math.min(target, current + step) : Math.max(target, current - step);
export const rand = (low: number, high: number, random: Random = Math.random): number => low + random() * (high - low);
export const easeOut = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 3;
/** Particles to emit this frame for `rate` per second, whatever the frame rate. */
export const emitCount = (rate: number, dt: number, random: Random = Math.random): number => {
  const exact = rate * dt;
  return Math.floor(exact) + (random() < exact % 1 ? 1 : 0);
};

/** Scratch objects: valid only until the next helper call (no allocation per frame). */
export const scratch = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  color: new THREE.Color(),
  quaternion: new THREE.Quaternion(),
};

export function randomUnit(out: THREE.Vector3, random: Random = Math.random): THREE.Vector3 {
  const z = rand(-1, 1, random);
  const angle = rand(0, Math.PI * 2, random);
  const r = Math.sqrt(1 - z * z);
  return out.set(Math.cos(angle) * r, Math.sin(angle) * r, z);
}

export const COLORS = {
  cyan: new THREE.Color("#5fe3ff"),
  pink: new THREE.Color("#ff7ad9"),
  gold: new THREE.Color("#ffd36b"),
  red: new THREE.Color("#ff3b6b"),
  white: new THREE.Color("#ffffff"),
  violet: new THREE.Color("#a98bff"),
  ember: new THREE.Color("#ff7a32"),
  hurt: new THREE.Color("#ff6a7a"),
} as const;
