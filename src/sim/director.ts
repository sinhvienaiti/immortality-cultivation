/**
 * The pace director (canon §13.2; kit balance/director.ts PaceDirector):
 * every 5 s, tension from P, I, O and the Trận Lực margin of the last 20 s;
 * ≤ 2 steps a wave; spawn gaps ±15 %, HP and species ±10 % a match; one
 * Linh Dịch (+5 % Trận Lực) a wave near defeat. Never changes live beasts,
 * boss phases, words or grading. Off when `header.pacing` is false.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { DirectorState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/director.ts " + name);
};

export function createDirectorState(_init: WorldInit): DirectorState {
  return todo("createDirectorState");
}

export function stepDirector(_world: World): void {
  todo("stepDirector");
}
