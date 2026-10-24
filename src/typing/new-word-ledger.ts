/**
 * Sổ cái từ mới (canon §6.4, D39, PB-10): ≤ 8 new words in any sliding
 * 20-minute window by `firstSeenMs`, shared by Học trước, Tĩnh Tu and ô 4.
 * A word counts once, at its first meeting, on any channel; a repeated `take`
 * of the same word takes nothing. Pure: no clock (the caller passes `nowMs`),
 * no storage (src/app/storage.ts reads and writes `.newwords`). Not kit
 * BudgetLedger (that is the live-word cap).
 * Owner: Lane 3. TODO(lane-3).
 */
import type { NewWordChannel, NewWordsSnapshot } from "../content/types";

export interface NewWordLedger {
  /** New words still allowed in the window ending at `nowMs`. */
  remaining(nowMs: number): number;
  /** Counts `wordId` at its first meeting; false when it was counted before (nothing taken). */
  take(wordId: string, nowMs: number, channel: NewWordChannel): boolean;
  /** For `.newwords` (storage.ts drops entries older than 20 minutes when it writes). */
  snapshot(): NewWordsSnapshot;
}

export function createNewWordLedger(_snapshot: NewWordsSnapshot): NewWordLedger {
  throw new Error("TODO(lane-3): typing/new-word-ledger.ts createNewWordLedger");
}
