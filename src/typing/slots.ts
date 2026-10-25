/**
 * Slot word rules (canon §6.3, D35): kind and length band per slot by E and
 * preset (Ấn at Học = Thư giãn 3–5); folded slots (ô 1, ô 3, ô 5, Ấn, Tẩy)
 * never take new words; ô 4 takes new words only in waves 1–2; ô 2 takes this
 * match's new words only from their second meeting (as "đang học"); base words
 * (`assumed`, counted as known) go straight to ô 1, ô 3 and Tẩy, and reach
 * ô 2, ô 5 and Ấn only through the fallback (typing/fallback.ts).
 *
 * Length inside a slot's band follows E (canon §6.3: ℓ̄ 4.5 under 45 WPM, 5.5
 * at 45–64, 6.0 from 65): the window ⌊ℓ̄⌋ − 1 … ⌈ℓ̄⌉ + 1 kept inside the band
 * (the nearest edge when they miss each other). Pure.
 * Owner: Lane 3.
 */
import { CLEANSE_WORDS, LEARNING_LEVELS, LENGTH_BY_E, NEW_WORDS, PRESETS, SEAL_WORDS, SLOTS } from "../content/rules";
import type { DeckWord, Preset, SlotId, WordGroup, WordSlotKind } from "../content/types";

export interface SlotAsk {
  readonly kind: WordSlotKind;
  readonly slot: SlotId | null;
  readonly preset: Preset;
  /** The seat's E (WPM). */
  readonly wpm: number;
  /** Current wave (ô 4 new words only in waves 1–2). */
  readonly wave: number;
}

/** Familiarity ladder of canon §6.2's fallback: new → learning → due (weak with it) → known; base words are known. */
export const FAMILIARITY: Readonly<Record<WordGroup, number>> = { new: 0, learning: 1, weak: 2, due: 2, known: 3 };

/** ℓ̄ × 10 for E (rules.ts LENGTH_BY_E). */
export function meanLengthX10(wpm: number): number {
  let mean = LENGTH_BY_E[0]!.meanX10;
  for (const row of LENGTH_BY_E) if (wpm >= row.minWpm) mean = row.meanX10;
  return mean;
}

/** The rules' band [min, max] of a slot, Ấn (by preset) or Tẩy. */
export function slotBand(ask: Pick<SlotAsk, "kind" | "slot" | "preset">): readonly [number, number] {
  if (ask.kind === "seal") return SEAL_WORDS.lengths[ask.preset];
  if (ask.kind === "cleanse") return [CLEANSE_WORDS.minLen, CLEANSE_WORDS.maxLen];
  const rule = SLOTS[ask.slot ?? 1];
  return [rule.minLen, rule.maxLen];
}

/** Length band [min, max] for the ask (ℓ̄ by E, canon §6.3). */
export function slotLengths(ask: SlotAsk): readonly [number, number] {
  const [min, max] = slotBand(ask);
  const mean = meanLengthX10(ask.wpm);
  const lo = Math.floor(mean / 10) - 1;
  const hi = Math.ceil(mean / 10) + 1;
  if (hi < min) return [min, min];
  if (lo > max) return [max, max];
  return [Math.max(min, lo), Math.min(max, hi)];
}

/** Word groups the ask takes as they are (base words aside). */
export function slotGroups(ask: Pick<SlotAsk, "kind" | "slot">): readonly WordGroup[] {
  if (ask.kind === "seal") return SEAL_WORDS.groups;
  if (ask.kind === "cleanse") return CLEANSE_WORDS.groups;
  return SLOTS[ask.slot ?? 1].groups;
}

/** Ô gấp: never a new word (canon §6.3): ô 1, ô 3, ô 5, Ấn, Tẩy. */
export function isFolded(ask: Pick<SlotAsk, "kind" | "slot">): boolean {
  return ask.kind !== "slot" || SLOTS[ask.slot ?? 1].folded;
}

/** Base words go straight to ô 1, ô 3 and Tẩy (D35). */
export function takesBaseWords(ask: Pick<SlotAsk, "kind" | "slot">): boolean {
  return ask.kind === "cleanse" || (ask.kind === "slot" && (ask.slot === 1 || ask.slot === 3));
}

/** This match's new words come back (as "đang học") in ô 2 and ô 4 only (canon §6.4). */
export function takesRemeetings(ask: Pick<SlotAsk, "kind" | "slot">): boolean {
  return ask.kind === "slot" && (ask.slot === 2 || ask.slot === 4);
}

/** Ô 4 may bring a new word in this wave (canon §6.3: waves 1–2). */
export function takesFreshNew(ask: Pick<SlotAsk, "kind" | "slot" | "wave">): boolean {
  return ask.kind === "slot" && ask.slot === 4 && ask.wave >= 1 && ask.wave <= NEW_WORDS.slot4LastWave;
}

/** The kind rule alone (no length): `meetings` is how often this match met the word. */
export function kindAccepts(ask: SlotAsk, word: Pick<DeckWord, "group" | "assumed">, meetings: number): boolean {
  if (word.group === "new") {
    if (isFolded(ask)) return false;
    return meetings >= 1 ? takesRemeetings(ask) : meetings === 0 && takesFreshNew(ask);
  }
  if (word.assumed) return takesBaseWords(ask);
  return slotGroups(ask).includes(word.group);
}

/** Whether `word` may take the slot (meetings: times this match met it). */
export function slotAccepts(ask: SlotAsk, word: DeckWord, meetings: number): boolean {
  const [lo, hi] = slotLengths(ask);
  return word.text.length >= lo && word.text.length <= hi && kindAccepts(ask, word, meetings);
}

/**
 * The meaning and IPA show on the Bàn Quyết while the word is typed (canon
 * §6.3, §13.4, §17): always at Thư giãn and Học; a new word's first meeting
 * always; Cân bằng until the word is remembered (≥ 2 right recalls and
 * known mastery); Thử thách only at a new word's first meeting. The sim stores
 * it on the word and reports it as `hintUsed` (HC7: never false while shown).
 */
export function meaningShown(preset: Preset, word: Pick<DeckWord, "group" | "recalls" | "mastery">, meetings: number): boolean {
  const meaning = PRESETS[preset].meaning;
  if (meaning === "always") return true;
  if (word.group === "new" && meetings <= 1) return true;
  if (meaning === "first") return false;
  return word.recalls < LEARNING_LEVELS.recallsToHide || word.mastery < LEARNING_LEVELS.knownMastery;
}
