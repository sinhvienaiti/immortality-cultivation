/**
 * The Tu Tiên Thủ Ải world and its fixed 60 Hz step (canon §23, M0A_PLAN §3.2).
 * Pure TypeScript: no clock, no DOM, no three; randomness only from
 * `world.rng.<stream>` (spawn, combat, words, ai, loot, props; never crit, D09).
 * Every field of `World` is declared in content/types.ts; each lane writes the
 * create function of its own part (`create<X>State(init: WorldInit)`).
 *
 * Step order (fixed): commands → stepWords → stepWaves → stepSpawn →
 * stepDirector → stepBeasts → stepCasts → stepSkills → stepWards →
 * stepConsumables → stepAutoHits → stepMechanisms → stepBeastAttacks →
 * stepBoss → stepPosture → stepFormation → stepEconomy → cleanup (per dead
 * beast: words.onBeastGone, combat.onBeastKilled, economy.onBeastKilled,
 * waves.onBeastGone; then wave end, defeat) → tick + 1.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { BeastRef, BeastState, LocalState, ReplayEntry, ReplayHeader, SimCommand, StageDef, World } from "../content/types";

/** Keys hashWorld skips: static config, wall clock, events (M0A_PLAN §3.1). */
export const HASH_SKIP: ReadonlySet<string> = new Set(["stage", "header", "field", "wall", "events"]);

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/world.ts " + name);
};

/** A new world at tick 0 from the stage, the seed and the replay header (canon §23.2). */
export function createWorld(_stage: StageDef, _seed: number, _header: ReplayHeader): World {
  return todo("createWorld");
}

/** One 60 Hz tick with this tick's commands (`local` already ran, M0A_PLAN §3.2). */
export function step(_world: World, _commands: readonly SimCommand[] = []): void {
  todo("step");
}

/** Routes one command to the system that owns it; systems reject what their phase forbids with `rejected`. */
export function applyCommand(_world: World, _command: SimCommand): void {
  todo("applyCommand");
}

/** Rebuilds `world` and `local` from a replay header and body up to `untilTick` (canon §23.2). */
export function runLog(_header: ReplayHeader, _log: readonly ReplayEntry[], _untilTick: number): { readonly world: World; readonly local: LocalState } {
  return todo("runLog");
}

/** Takes a free beast slot (or a new one) with a fresh serial; the caller fills the species fields. */
export function allocBeast(_world: World): BeastState {
  return todo("allocBeast");
}

/** The live beast a ref names, or null when it died or the slot was reused. */
export function beastAt(_world: World, _ref: BeastRef): BeastState | null {
  return todo("beastAt");
}
