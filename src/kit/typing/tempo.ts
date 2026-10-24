// Source: new for the kit, from docs/td/TYPING_DEFENSE_DESIGN.md 6.3, 6.6 and dragon-hold 00 §4.3–4.4 (log fixes in shared/game-kit/DRIFT.md)
/**
 * The typist's tempo: the base speed B (kept per account), the expected
 * speed E = max(B, floor) every word is measured against, the word lengths
 * a speed band asks for, the typing capacity C(E) and the pace factor k_E
 * that slows a stage for slow typists (never speeds it up).
 */

/** One row of a length table: from `minE` WPM, words of len[0]…len[1] letters. */
export type SpeedBand = { readonly minE: number; readonly len: readonly [number, number] };

/** The [lo, hi] of the last row whose minE ≤ E (the first row below it). */
export function lengthBand(table: readonly SpeedBand[], expected: number): [number, number] {
  if (table.length === 0) throw new Error("tempo: empty length table");
  let band = table[0]!.len;
  for (const row of table) if (expected >= row.minE) band = row.len;
  return [band[0], band[1]];
}

/** E = max(B, the mode's floor). */
export const expectedSpeed = (baseline: number, floor: number): number => Math.max(baseline, floor);

/** TK 6.6: after ≥ minWords good words, B moves toward their median raw speed, faster up than down, held in [min, max]. */
export type BaselineRules = { readonly minWords: number; readonly up: number; readonly down: number; readonly min: number; readonly max: number };
export const BASELINE: BaselineRules = { minWords: 40, up: 0.2, down: 0.08, min: 12, max: 140 };

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The new B after a stage whose good words were typed at `rawWpms` (first key to last); unchanged under minWords. */
export function updateBaseline(baseline: number, rawWpms: readonly number[], rules: BaselineRules = BASELINE): number {
  const speeds = rawWpms.filter((value) => Number.isFinite(value) && value > 0);
  if (speeds.length < rules.minWords) return baseline;
  const w = median(speeds);
  const next = baseline + (w > baseline ? rules.up : rules.down) * (w - baseline);
  return Math.max(rules.min, Math.min(rules.max, next));
}

/** C(E) = 60 / (react + perChar·(ℓ̄ + 1)/(E·d)) words a minute (dragon-hold 00 §4.3: ≈ 22.7 at E 35, ℓ̄ 4.5, d 0.86). */
export const typingCapacity = (expected: number, avgLen: number, d: number, react = 0.45, perChar = 12): number =>
  60 / (react + (perChar * (avgLen + 1)) / (expected * d));

/** k_E = clamp(C(E)/reference; min; max): spawn gaps × 1/k_E (00 §4.4, only ever slower). */
export const paceFactor = (capacity: number, reference = 22.7, min = 0.75, max = 1): number => Math.max(min, Math.min(max, capacity / reference));
