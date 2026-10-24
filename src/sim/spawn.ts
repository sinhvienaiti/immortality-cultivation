/**
 * Spawning (canon §13.1, §13.3): each gate releases at most one group every
 * 1.5 s, two gates ≥ 0.6 s apart (the rule only stretches); the live cap 60
 * holds groups at their gate while the wave clock keeps running.
 * `liveRoom` tells summoners (Tru Đàn, Gọi Đàn) whether a whole call fits.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { BeastState, SpawnState, WaveGroupDef, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/spawn.ts " + name);
};

export function createSpawnState(_init: WorldInit): SpawnState {
  return todo("createSpawnState");
}

export function stepSpawn(_world: World): void {
  todo("stepSpawn");
}

/** Spawns a group now (summons skip the gate queue but never the live cap). */
export function spawnGroup(_world: World, _group: WaveGroupDef, _options: { readonly wave: number; readonly summoned: boolean }): BeastState[] {
  return todo("spawnGroup");
}

/** Live beasts now. */
export function liveCount(_world: World): number {
  return todo("liveCount");
}

/** Free places under the live cap (summoners call only when their whole call fits, else skip). */
export function liveRoom(_world: World): number {
  return todo("liveRoom");
}
