/**
 * The new-word ledger for the Tĩnh Tu page (canon §6.4, D39): Lane 3's
 * typing/new-word-ledger.ts, read and written through src/app/storage.ts
 * (`.newwords`). While Lane 3's stub still throws TODO(lane-3), the page runs
 * on an interim ledger with the same contract and says so on screen; remove
 * it once Lane 3 delivers (integration).
 * Owner: Lane 8.
 */
import { NEW_WORDS } from "../../content/rules";
import type { NewWordEntry, NewWordsSnapshot } from "../../content/types";
import { createNewWordLedger, type NewWordLedger } from "../../typing/new-word-ledger";

export interface OpenedLedger {
  readonly ledger: NewWordLedger;
  /** The interim stand-in is in use (Lane 3 not delivered yet). */
  readonly interim: boolean;
}

export function openLedger(snapshot: NewWordsSnapshot): OpenedLedger {
  try {
    return { ledger: createNewWordLedger(snapshot), interim: false };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("TODO(lane-3)")) throw error;
    return { ledger: interimLedger(snapshot), interim: true };
  }
}

/** canon §6.4 as written: ≤ 8 first meetings in any sliding 20-minute window; a word counts once. */
function interimLedger(snapshot: NewWordsSnapshot): NewWordLedger {
  const entries: NewWordEntry[] = [...snapshot.entries];
  return {
    remaining(nowMs) {
      const from = nowMs - NEW_WORDS.windowMs;
      return Math.max(0, NEW_WORDS.perWindow - entries.filter((entry) => entry.firstSeenMs > from).length);
    },
    take(wordId, nowMs, channel) {
      if (entries.some((entry) => entry.wordId === wordId)) return false;
      entries.push({ wordId, firstSeenMs: nowMs, channel });
      return true;
    },
    snapshot: () => ({ v: 1, entries: [...entries] }),
  };
}

/** Every word of the lesson is already counted in the window: opening it again takes nothing. */
export function lessonCounted(snapshot: NewWordsSnapshot, words: readonly string[], nowMs: number): boolean {
  const from = nowMs - NEW_WORDS.windowMs;
  return words.every((word) => snapshot.entries.some((entry) => entry.wordId === word && entry.firstSeenMs > from));
}
