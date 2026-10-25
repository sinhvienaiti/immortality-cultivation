/**
 * Sổ cái từ mới (canon §6.4, D39, PB-10): ≤ 8 new words in any sliding
 * 20-minute window by `firstSeenMs`, shared by Học trước, Tĩnh Tu and ô 4.
 * A word counts once, at its first meeting, on any channel; a repeated `take`
 * of the same word takes nothing. Pure: no clock (the caller passes `nowMs`),
 * no storage (src/app/storage.ts reads and writes `.newwords`). Not kit
 * BudgetLedger (that is the live-word cap).
 *
 * A word is in the window while `nowMs − firstSeenMs < 20 min` (storage keeps
 * the same entries when it prunes); an entry stamped in the future (a clock
 * moved back) still counts. A `take` past the budget is still recorded: the
 * word was met, and `remaining` stays at 0 until the window frees it.
 * Owner: Lane 3.
 */
import { NEW_WORDS } from "../content/rules";
import type { NewWordChannel, NewWordEntry, NewWordsSnapshot } from "../content/types";

export interface NewWordLedger {
  /** New words still allowed in the window ending at `nowMs`. */
  remaining(nowMs: number): number;
  /** Counts `wordId` at its first meeting; false when it was counted before (nothing taken). */
  take(wordId: string, nowMs: number, channel: NewWordChannel): boolean;
  /** For `.newwords` (storage.ts drops entries older than 20 minutes when it writes). */
  snapshot(): NewWordsSnapshot;
}

const CHANNELS: ReadonlySet<string> = new Set<NewWordChannel>(["learn-ahead", "tinh-tu", "slot4"]);

function assertTime(nowMs: number): void {
  if (!Number.isFinite(nowMs)) throw new TypeError("new-word ledger: nowMs must be a finite number");
}

/** In the window ending at `nowMs` (future stamps count). */
const inWindow = (entry: NewWordEntry, nowMs: number): boolean => nowMs - entry.firstSeenMs < NEW_WORDS.windowMs;

/** Valid entries of a snapshot, first meeting of each word only, in snapshot order. */
function cleanEntries(snapshot: NewWordsSnapshot | null | undefined): NewWordEntry[] {
  const seen = new Set<string>();
  const out: NewWordEntry[] = [];
  for (const entry of snapshot?.entries ?? []) {
    if (typeof entry?.wordId !== "string" || entry.wordId === "" || !Number.isFinite(entry.firstSeenMs) || !CHANNELS.has(entry.channel)) continue;
    if (seen.has(entry.wordId)) continue;
    seen.add(entry.wordId);
    out.push({ wordId: entry.wordId, firstSeenMs: entry.firstSeenMs, channel: entry.channel });
  }
  return out;
}

/** Words counted in the window ending at `nowMs`. */
export function usedInWindow(snapshot: NewWordsSnapshot, nowMs: number): number {
  assertTime(nowMs);
  return cleanEntries(snapshot).filter((entry) => inWindow(entry, nowMs)).length;
}

/**
 * Milliseconds until the window allows `need` new words (0: it does now;
 * Infinity: never, `need` is over the budget). Tĩnh Thất's "còn N phút nữa đủ 6 từ".
 */
export function msUntilFree(snapshot: NewWordsSnapshot, need: number, nowMs: number): number {
  assertTime(nowMs);
  if (need > NEW_WORDS.perWindow) return Number.POSITIVE_INFINITY;
  const stamps = cleanEntries(snapshot)
    .filter((entry) => inWindow(entry, nowMs))
    .map((entry) => entry.firstSeenMs)
    .sort((a, b) => a - b);
  const leave = stamps.length - (NEW_WORDS.perWindow - Math.max(0, need));
  if (leave <= 0) return 0;
  return Math.max(0, stamps[leave - 1]! + NEW_WORDS.windowMs - nowMs);
}

export function createNewWordLedger(snapshot: NewWordsSnapshot): NewWordLedger {
  const entries = cleanEntries(snapshot);
  const known = new Set(entries.map((entry) => entry.wordId));
  return {
    remaining(nowMs: number): number {
      assertTime(nowMs);
      let used = 0;
      for (const entry of entries) if (inWindow(entry, nowMs)) used += 1;
      return Math.max(0, NEW_WORDS.perWindow - used);
    },
    take(wordId: string, nowMs: number, channel: NewWordChannel): boolean {
      assertTime(nowMs);
      if (typeof wordId !== "string" || wordId === "") throw new TypeError("new-word ledger: wordId is empty");
      if (!CHANNELS.has(channel)) throw new TypeError("new-word ledger: unknown channel " + String(channel));
      if (known.has(wordId)) return false;
      known.add(wordId);
      entries.push({ wordId, firstSeenMs: nowMs, channel });
      return true;
    },
    snapshot(): NewWordsSnapshot {
      return { v: 1, entries: entries.map((entry) => ({ wordId: entry.wordId, firstSeenMs: entry.firstSeenMs, channel: entry.channel })) };
    },
  };
}
