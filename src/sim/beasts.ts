/**
 * Beast behaviour (canon §10, data/beasts.ts): fill a spawned beast from its
 * def (HP = round(W × 90 × g(K) × preset), PB-06), walk the flow field
 * (field.ts), slow in the Kết Giới, Nham Viên stops 11 m from its target
 * (PB-17), flyers fly the sky route; never chase or touch a real player (D07).
 * Owner: Lane 5. TODO(lane-5).
 */
import type { BeastState, EliteTraitId, SpeciesId, World } from "../content/types";

/** Fills species fields of a beast that allocBeast just gave (spawn.ts calls it). */
export function initBeast(_world: World, _beast: BeastState, _species: SpeciesId, _elite: EliteTraitId | null): void {
  throw new Error("TODO(lane-5): sim/beasts.ts initBeast");
}

export function stepBeasts(_world: World): void {
  throw new Error("TODO(lane-5): sim/beasts.ts stepBeasts");
}
