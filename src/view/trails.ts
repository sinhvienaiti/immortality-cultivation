/**
 * Sword trails and glows (canon §20.3): one instanced ribbon draw reading old
 * positions from a ring DataTexture, one additive instanced glow draw.
 * Owner: Lane 1 (milestone 1b). TODO(lane-1).
 */
import type { Renderer3D } from "./renderer";

export interface Trails {
  update(dt: number): void;
  dispose(): void;
}

export function createTrails(_renderer: Renderer3D, _capacity: number, _samples: number): Trails {
  throw new Error("TODO(lane-1): view/trails.ts createTrails");
}
