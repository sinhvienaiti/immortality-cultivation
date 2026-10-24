/**
 * Live-word cap and the fallback order (canon §6.2, PB-26): cap = min(preset
 * cap; A − 3) with kit BudgetLedger; with no word fitting the rules: (1) length
 * ±1 within 3–8, (2) kinds towards more familiar (new → learning → due → known;
 * base words count as known), (3) the slot waits dim and logs "nghẽn". Never a new word.
 * Owner: Lane 3. TODO(lane-3).
 */
import type { DeckWord, Preset } from "../content/types";

/** min(preset cap; A − 3), A = letters with ≥ 3 valid deck words. */
export function liveWordCap(_preset: Preset, _deck: readonly DeckWord[]): number {
  throw new Error("TODO(lane-3): typing/fallback.ts liveWordCap");
}

export type FallbackStep = "exact" | "length" | "familiar" | "jam";
