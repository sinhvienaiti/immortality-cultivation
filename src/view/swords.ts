/**
 * "Vạn kiếm" (canon §12.1, §20.2, §20.3): swords spawn behind the caster, fly
 * an arc, 3 volleys meet over the target zone, then gather; bodies are a
 * low-poly InstancedMesh; one shared pool per tier (150 / 300 / 500), allies
 * draw from it (×0.4–0.6); no allocation per frame.
 * Owner: Lane 1 (milestone 1b). TODO(lane-1).
 */
import type { Renderer3D } from "./renderer";

export interface SwordPool {
  readonly capacity: number;
  readonly live: number;
  /** A volley of up to `count` swords from (x, z) to (toX, toZ) in metres; returns how many it took. */
  volley(count: number, x: number, z: number, toX: number, toZ: number): number;
  update(dt: number): void;
  dispose(): void;
}

export function createSwords(_renderer: Renderer3D, _pool: number): SwordPool {
  throw new Error("TODO(lane-1): view/swords.ts createSwords");
}
