/**
 * Phases and waves (canon §4.1, §13): prep 20 s, warning 5 s, wave, break by
 * preset, lull 8 s, boss. A wave's clock only drives its spawn schedule; the
 * wave ends when every group has spawned and none of its beasts lives. The
 * lull before the boss starts when the last wave has spawned all its groups.
 * Owner: Lane 2. TODO(lane-2): from games/dragon-hold/src/sim/waves.ts (end-of-wave rule kept, lull 8 s).
 */
import type { BeastState, WaveState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/waves.ts " + name);
};

export function createWaveState(_init: WorldInit): WaveState {
  return todo("createWaveState");
}

export function stepWaves(_world: World): void {
  todo("stepWaves");
}

/** Queues wave `wave`'s groups (atMs × 1 / k, gate rule after scaling). */
export function scheduleWave(_world: World, _wave: number): void {
  todo("scheduleWave");
}

/** Every group of the wave spawned and 0 of its beasts alive (canon §4.1). */
export function isWaveOver(_world: World, _wave: number): boolean {
  return todo("isWaveOver");
}

/** Cleanup calls this for every dead beast. */
export function onBeastGone(_world: World, _beast: BeastState): void {
  todo("onBeastGone");
}

/** `start` in prep. */
export function startMatch(_world: World): void {
  todo("startMatch");
}

/** `continue` in a break that waits for Enter. */
export function continueBreak(_world: World): void {
  todo("continueBreak");
}
