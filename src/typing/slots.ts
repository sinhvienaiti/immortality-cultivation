/**
 * Slot word rules (canon §6.3): kind and length band per slot by E and preset
 * (Ấn at Học = Thư giãn 3–5); folded slots never take new words; ô 4 takes
 * new words only in waves 1–2; ô 2 takes this match's new words only from
 * their second meeting; base words go straight to ô 1, ô 3, Tẩy.
 * Owner: Lane 3. TODO(lane-3).
 */
import type { DeckWord, Preset, SlotId, WordSlotKind } from "../content/types";

export interface SlotAsk {
  readonly kind: WordSlotKind;
  readonly slot: SlotId | null;
  readonly preset: Preset;
  /** The seat's E (WPM). */
  readonly wpm: number;
  /** Current wave (ô 4 new words only in waves 1–2). */
  readonly wave: number;
}

/** Length band [min, max] for the ask (ℓ̄ by E, canon §6.3). */
export function slotLengths(_ask: SlotAsk): readonly [number, number] {
  throw new Error("TODO(lane-3): typing/slots.ts slotLengths");
}

/** Whether `word` may take the slot (meetings: times this match met it). */
export function slotAccepts(_ask: SlotAsk, _word: DeckWord, _meetings: number): boolean {
  throw new Error("TODO(lane-3): typing/slots.ts slotAccepts");
}
