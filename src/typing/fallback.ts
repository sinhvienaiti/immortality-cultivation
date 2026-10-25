/**
 * Live-word cap and the fallback order (canon §6.2, PB-26): cap = min(preset
 * cap; A − 3) with kit BudgetLedger; with no word fitting the rules: (1) length
 * ±1 within 3–8, (2) kinds towards more familiar (new → learning → due → known;
 * base words count as known), (3) the slot waits dim and logs "nghẽn". Never a new word.
 *
 * The steps are cumulative (step 2 keeps step 1's lengths). An Ấn never grows
 * past its preset's top length: the telegraph's T is computed from that top
 * (canon §10.6), so its fallback only widens downwards. Pure.
 * Owner: Lane 3.
 */
import { LETTERS } from "../content/rules";
import type { DeckWord, Preset } from "../content/types";
import { POOL, type BudgetSource, type LetterBudget } from "../kit/typing/budget";
import { FAMILIARITY, kindAccepts, slotGroups, slotLengths, type SlotAsk } from "./slots";

/** Words the deck may hold: a–z only, 3–8 letters (canon §6.2). */
export const isDeckText = (text: string): boolean => text.length >= LETTERS.minLen && text.length <= LETTERS.maxLen && /^[a-z]+$/.test(text);

/** A: letters that start at least 3 valid deck words (canon §6.2). */
export function availableLetters(deck: readonly Pick<DeckWord, "text">[]): number {
  const per = new Array<number>(26).fill(0);
  const seen = new Set<string>();
  for (const word of deck) {
    if (!isDeckText(word.text) || seen.has(word.text)) continue;
    seen.add(word.text);
    const code = word.text.charCodeAt(0) - 97;
    per[code] = per[code]! + 1;
  }
  return per.filter((count) => count >= LETTERS.minWordsPerLetter).length;
}

/** min(preset cap; A − 3), A = letters with ≥ 3 valid deck words; at least 1 so a tiny deck still plays. */
export function liveWordCap(preset: Preset, deck: readonly Pick<DeckWord, "text">[]): number {
  return Math.max(1, Math.min(LETTERS.liveCap[preset], availableLetters(deck) - LETTERS.alphabetMargin));
}

/** The kit ledger's budget for a seat: every word counts against the one cap, nothing reserved. */
export function seatBudget(cap: number): LetterBudget {
  return { total: cap, enemy: cap, urgent: 0, other: 0 };
}

/** Ledger sources of a seat (index order is SOURCE): 5 slots, ≤ 2 Ấn, ≤ 1 urgent word (canon §6.2). */
export const SOURCES: readonly BudgetSource[] = [
  { id: "slot", pool: POOL.enemy, cap: 5 },
  { id: "seal", pool: POOL.enemy, cap: LETTERS.sealsPerSeat },
  { id: "urgent", pool: POOL.enemy, cap: LETTERS.urgentPerSeat },
];
export const SOURCE = { slot: 0, seal: 1, urgent: 2 } as const;

export type FallbackStep = "exact" | "length" | "familiar" | "jam";

export interface FallbackStage {
  readonly step: Exclude<FallbackStep, "jam">;
  readonly lengths: readonly [number, number];
}

/** The steps tried in order (canon §6.2); "jam" is what is left when all fail. */
export function fallbackStages(ask: SlotAsk): readonly FallbackStage[] {
  const exact = slotLengths(ask);
  const lo = Math.max(LETTERS.minLen, exact[0] - 1);
  const hi = ask.kind === "seal" ? exact[1] : Math.min(LETTERS.maxLen, exact[1] + 1);
  const wide: readonly [number, number] = [lo, hi];
  return [
    { step: "exact", lengths: exact },
    { step: "length", lengths: wide },
    { step: "familiar", lengths: wide },
  ];
}

/** Step 2: groups more familiar than every group the ask takes, and base words for any ask; never a new word. */
export function familiarAccepts(ask: SlotAsk, word: Pick<DeckWord, "group" | "assumed">): boolean {
  if (word.group === "new") return false;
  if (word.assumed) return true;
  let top = 0;
  for (const group of slotGroups(ask)) top = Math.max(top, FAMILIARITY[group]);
  return FAMILIARITY[word.group] > top;
}

/** Whether `word` fits `stage` of the ask (meetings: times this match met it). */
export function stageAccepts(stage: FallbackStage, ask: SlotAsk, word: Pick<DeckWord, "text" | "group" | "assumed">, meetings: number): boolean {
  const length = word.text.length;
  if (length < stage.lengths[0] || length > stage.lengths[1]) return false;
  if (kindAccepts(ask, word, meetings)) return true;
  return stage.step === "familiar" && familiarAccepts(ask, word);
}
