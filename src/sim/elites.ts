/**
 * Tinh anh (canon §10.3, data/elites.ts): one trait, W × 1.6, Thế 40, one Ấn
 * when revealed (the elite nearest the heart first; ≤ 2 live Ấn per person).
 * Owner: Lane 5. TODO(lane-5).
 */
import type { BeastState, EliteTraitId, World } from "../content/types";

export function applyElite(_world: World, _beast: BeastState, _trait: EliteTraitId): void {
  throw new Error("TODO(lane-5): sim/elites.ts applyElite");
}

/** Hồi Nguyên regen and Ấn requests (words.ts dealSeal). */
export function stepElites(_world: World): void {
  throw new Error("TODO(lane-5): sim/elites.ts stepElites");
}
