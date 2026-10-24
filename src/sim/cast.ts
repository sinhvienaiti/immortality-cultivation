/**
 * The Cast transaction (canon §6.1, D08, D42): one finished word = exactly one
 * Cast{seat, slot, actionId, wordId, tick, channel, quality, origin}; a
 * duplicate actionId is dropped. No valid target: `held` 3 s at no cooldown,
 * then `fizzled` (the slot takes its next word at once). Only `resolved`
 * Casts give Chân Nguyên, Dưỡng and practice points (addChanNguyen).
 * Owner: Lane 3. TODO(lane-3).
 */
import type { Cast, CastsState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-3): sim/cast.ts " + name);
};

export function createCastsState(_init: WorldInit): CastsState {
  return todo("createCastsState");
}

/** seat × 2^20 + n (rules.ts CAST.actionSeatStride). */
export function nextActionId(_world: World, _seat: number): number {
  return todo("nextActionId");
}

/** Last correct letter: Lane 4's resolveCast looks for a target; none → held. */
export function emitCast(_world: World, _cast: Cast): void {
  todo("emitCast");
}

/** Retries held Casts and fizzles them at 3 s. */
export function stepCasts(_world: World): void {
  todo("stepCasts");
}
