/**
 * Telegraphs (canon §10.6, D10, PB-27, PB-28): one formula
 * T = 1.6 × (0.4 + 0.5 + 12 (ℓ + 1) / (0.86 × E_floor) + 0.2 + t_channel);
 * charge = max(T, base charge / k) through `chargeTicks` only (no
 * telegraphScale at M0a); no typed answer: ≥ 1.2 s + half width ÷ 5 m/s.
 * Shapes circle, cone, line, cell; events start, strike, cancel.
 * Owner: Lane 5. TODO(lane-5).
 */
import type { ActiveTelegraph, BeastRef, PointU, Preset, TelegraphDef, TelegraphsState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-5): sim/telegraph.ts " + name);
};

export function createTelegraphsState(_init: WorldInit): TelegraphsState {
  return todo("createTelegraphsState");
}

/** T of the preset for a word of `letters` letters, ms (canon §10.6 table: ℓ 5 Cân bằng 7.1 s). */
export function T(_preset: Preset, _letters: number, _channelMs: number): number {
  return todo("T");
}

/** Charge ticks of `def` at `preset` and pace kPm: max(T, base / k), never under T (CB5). */
export function chargeTicks(_def: TelegraphDef, _preset: Preset, _kPm: number): number {
  return todo("chargeTicks");
}

/** Starts a telegraph; emits `telegraph start`. */
export function telegraph(_world: World, _def: TelegraphDef, _source: BeastRef | null, _from: PointU, _to: PointU): ActiveTelegraph {
  return todo("telegraph");
}

export function cancelTelegraph(_world: World, _id: number): void {
  todo("cancelTelegraph");
}

/** Strikes due telegraphs (`telegraph strike`; `local` applies the player part). */
export function stepTelegraphs(_world: World): void {
  todo("stepTelegraphs");
}
