/**
 * Hộ thân `ward` (canon §9.1, D34, PB-01): a world object at the Cast's
 * `origin`, r 2 m, 5 s, 3 blocks; shields bots and node points inside;
 * halves a big strike when its ring crosses the strike line at the strike
 * tick; `ward-use` from `local` takes one charge (clamped at 0).
 * Owner: Lane 4. TODO(lane-4).
 */
import type { PointU, SimCommand, Ward, WardsState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/wards.ts " + name);
};

export function createWardsState(_init: WorldInit): WardsState {
  return todo("createWardsState");
}

/** Ô 3 resolved with the ward loadout. */
export function createWard(_world: World, _seat: number, _origin: PointU): Ward {
  return todo("createWard");
}

/** The seat's live ward with charges, or null. */
export function wardAt(_world: World, _seat: number): { readonly wardId: number; readonly origin: PointU; readonly radius: number; readonly charges: number } | null {
  return todo("wardAt");
}

/** The seat's ward ring crosses segment a–b (Thiết Bối Xung, canon §10.5). */
export function wardCrosses(_world: World, _seat: number, _a: PointU, _b: PointU): boolean {
  return todo("wardCrosses");
}

export function useWard(_world: World, _command: Extract<SimCommand, { type: "ward-use" }>): void {
  todo("useWard");
}

export function stepWards(_world: World): void {
  todo("stepWards");
}
