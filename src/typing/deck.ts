// Source: games/dragon-hold/src/typing/deck.ts @06cd4e6 (adapted: canon §17.1, D35, PB-02 — no "known" relabel of an empty profile's first 50 words, no `isNew ? "learning"` filler; cold start = ≤ 40 base words flagged `assumed` + new words within the ledger's allowance; a short group shrinks the deck to its 40 floor; WordRecord in, DeckWord out; a–z words of 3–8 letters)
/**
 * The match deck (canon §17.1, D35, PB-02): 70–100 words through kit/vocab and
 * the learning core's `query`/`lookup`; `sensitive` filtered (and `mature` for
 * child profiles); groups (known, learning, due, new, weak) by learning record.
 * Cold start: ≤ 40 base words (one level below, `assumed: true`) + new words
 * within `allowance`; a short group shrinks the deck (floor 40), never relabels.
 * Base words come only from the base level and below (canon §17.1): when those
 * run short the deck shrinks (the picker repeats sooner) rather than flag a
 * harder word, at or above the profile level, as assumed known.
 *
 * `records` come in vocabulary list order (most frequent first), one per
 * candidate word, with the group the learning record gives (no record:
 * "new"). Every word without a record stays "new" unless it is one of the
 * base words, which are flagged `assumed` and count as known for slot rules.
 * A warm deck keeps every recorded group (due and weak first, then learning,
 * then known, taken in turns up to 100 words) and tops up with base words only
 * when it would fall under the 40 floor. Pure: the app loads vocabulary and
 * records first (app/learning.ts); the shuffle draws on the deck's own stream.
 * Owner: Lane 3.
 */
import { DECK, LEARNING_LEVELS } from "../content/rules";
import type { DeckWord, WordGroup, WordRecord } from "../content/types";
import type { RngStream } from "../kit/platform/rng";
import { textHasBlockedWord } from "../kit/vocab/content-filter";
import { isDeckText } from "./fallback";

export { isDeckText } from "./fallback";

export interface DeckOptions {
  /** Child profiles: `mature` words out too (canon D20); `sensitive` words are always out. */
  readonly excludeMature?: boolean;
}

/** The group a learning record gives a word (no record: "new"); weak under 40 mastery, known from 70 (canon §16, §17). */
export function groupForRecord(record: { readonly mastery: number; readonly due: boolean } | null): WordGroup {
  if (record === null) return "new";
  if (record.due) return "due";
  if (record.mastery < LEARNING_LEVELS.weakMastery) return "weak";
  return record.mastery < LEARNING_LEVELS.knownMastery ? "learning" : "known";
}

/** No learning record at all: the first match of a new player, and every M0a match (canon §25). */
export const isColdStart = (records: readonly Pick<WordRecord, "group">[]): boolean => records.every((record) => record.group === "new");

/** Candidate words the deck may hold, first spelling and first id only. */
function usable(records: readonly WordRecord[], options: DeckOptions): WordRecord[] {
  const texts = new Set<string>();
  const ids = new Set<string>();
  return records.filter((record) => {
    const ok =
      typeof record.wordId === "string" && record.wordId !== "" && isDeckText(record.text) && !texts.has(record.text) && !ids.has(record.wordId) &&
      !textHasBlockedWord(record.text, { excludeMature: options.excludeMature === true });
    if (ok) {
      texts.add(record.text);
      ids.add(record.wordId);
    }
    return ok;
  });
}

/**
 * Unrecorded words by level, nearest `level` first: that level, lower ones (easiest first), then
 * higher ones unless `orBelow` (base words never come from above the base level, canon §17.1).
 */
function byLevelFrom(pool: readonly WordRecord[], level: number, orBelow = false): WordRecord[] {
  const levels = [...new Set(pool.map((record) => record.level))].sort((a, b) => a - b);
  const order = [level, ...levels.filter((value) => value < level), ...(orBelow ? [] : levels.filter((value) => value > level))];
  return order.flatMap((value) => pool.filter((record) => record.level === value));
}

const asWord = (record: WordRecord, group: WordGroup, assumed: boolean): DeckWord => ({
  wordId: record.wordId,
  text: record.text,
  group,
  mastery: record.mastery,
  recalls: record.recalls,
  assumed,
});

/** `records`: candidate words with their learning state (empty learning data → group "new"); `rng`: the deck's own stream. */
export function buildDeck(records: readonly WordRecord[], level: number, allowance: number, rng: RngStream, options: DeckOptions = {}): DeckWord[] {
  const pool = usable(records, options);
  const profileLevel = Math.max(1, Math.floor(level));
  const newMax = Math.max(0, Math.floor(allowance));
  const out: DeckWord[] = [];
  const taken = new Set<string>();
  const add = (record: WordRecord, group: WordGroup, assumed: boolean): void => {
    taken.add(record.wordId);
    out.push(asWord(record, group, assumed));
  };
  const unrecorded = pool.filter((record) => record.group === "new");
  const takeBase = (count: number): void => {
    // Base words: the most frequent words one level below the profile (A1's first words at the lowest level),
    // only from that level and below; short there, the deck shrinks instead of borrowing harder words.
    for (const record of byLevelFrom(unrecorded, Math.max(1, profileLevel - 1), true)) {
      if (count <= 0) break;
      if (taken.has(record.wordId)) continue;
      add(record, "known", true);
      count -= 1;
    }
  };
  const takeNew = (): void => {
    let left = newMax;
    for (const record of byLevelFrom(unrecorded, profileLevel)) {
      if (left <= 0) break;
      if (taken.has(record.wordId)) continue;
      add(record, "new", false);
      left -= 1;
    }
  };

  if (isColdStart(pool)) {
    takeBase(DECK.baseWords);
    takeNew();
  } else {
    takeNew();
    const room = DECK.maxWords - out.length;
    const rank = (group: WordGroup) => pool.filter((record) => record.group === group);
    const byMastery = (list: WordRecord[]) => list.map((record, index) => ({ record, index })).sort((a, b) => a.record.mastery - b.record.mastery || a.index - b.index).map((item) => item.record);
    const queues = [byMastery(rank("due")), byMastery(rank("weak")), rank("learning"), rank("known")];
    let added = 0;
    for (let round = 0; added < room && queues.some((queue) => round < queue.length); round += 1) {
      for (const queue of queues) {
        const record = queue[round];
        if (record === undefined || added >= room) continue;
        add(record, record.group, false);
        added += 1;
      }
    }
    // A thin profile: base words keep the deck at its floor (never a relabelled unrecorded word).
    if (out.length < DECK.floorWords) takeBase(Math.min(DECK.baseWords, DECK.floorWords - out.length));
  }

  // A seeded shuffle; the picker shuffles its bags again on the world's `words` stream.
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    const value = out[index]!;
    out[index] = out[other]!;
    out[other] = value;
  }
  return out;
}

/** The deck's new words in deck order: the match's Học trước list (canon §17). */
export const newWordsOf = (deck: readonly DeckWord[]): DeckWord[] => deck.filter((word) => word.group === "new");
