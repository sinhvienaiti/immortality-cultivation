/**
 * Damage (canon §7.2, D38): whole HP; order P → × M_q → × M_hệ → × (1 + Σ
 * bucket) → × vulnerable → armour or resist (non-typed only) → cluster cap →
 * HP left, each step a half-up `mulDiv`; typed hits ignore armour; armour
 * G / (G + 100) capped at 75 %; break × 1.5; cluster cap 60 %; a hit on a dead
 * beast goes to the nearest within 4 m at 50 %. The share ledger adds
 * effective damage only.
 * Owner: Lane 4. TODO(lane-4): the damage part of games/dragon-hold/src/sim/combat.ts.
 */
import type { BeastState, DamageType, Grade, HitSource, SimCommand, World } from "../content/types";

/** Who dealt a hit (share bucket and reports follow `source`). */
export interface HitBy {
  readonly seat: number;
  readonly source: HitSource;
  readonly grade: Grade | null;
}

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/combat.ts " + name);
};

/** Deals `amount` (P before multipliers) to `beast`; returns the effective damage (≤ HP left). Emits `hit`, and `death` on a kill. */
export function damageBeast(_world: World, _beast: BeastState, _amount: number, _type: DamageType, _by: HitBy): number {
  return todo("damageBeast");
}

/** `auto` command: range check from `origin`, schedules the hit at +18 ticks. */
export function applyAuto(_world: World, _command: Extract<SimCommand, { type: "auto" }>): void {
  todo("applyAuto");
}

/** Lands đánh nền hits on their tick. */
export function stepAutoHits(_world: World): void {
  todo("stepAutoHits");
}

/** Cleanup: kill consequences of combat (stats). */
export function onBeastKilled(_world: World, _beast: BeastState): void {
  todo("onBeastKilled");
}
