/**
 * The player body (canon §9.1, §9.2): position in u, Sinh lực 600 × g(K),
 * shield, 5 m/s, radius 0.4 m; collides with terrain and the Trận Trụ, never
 * with beasts or allies. Starts at the heart.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { LocalState, PointU, StageDef } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): local/player.ts " + name);
};

export function createLocal(_seat: number, _stage: StageDef, _gPm: number): LocalState {
  return todo("createLocal");
}

/** Where the player stands (u); the router quantises it to 100 mm for `origin`. */
export function playerPos(_local: LocalState): PointU {
  return todo("playerPos");
}
