/**
 * The match deck (canon §17.1, D35, PB-02): 70–100 words through kit/vocab and
 * the learning core's `query`/`lookup`; `sensitive` filtered (and `mature` for
 * child profiles); groups (known, learning, due, new, weak) by learning record.
 * Cold start: ≤ 40 base words (one level below, `assumed: true`) + new words
 * within `allowance`; a short group shrinks the deck (floor 40), never relabels.
 * Owner: Lane 3. TODO(lane-3): from games/dragon-hold/src/typing/deck.ts WITHOUT its
 * empty-profile "known" branch (lines 89–92) and its `isNew ? "learning"` filler
 * (lines 101–105); record both in docs/SYNC_DEBT.md.
 */
import type { RngStream } from "../kit/platform/rng";
import type { DeckWord, WordRecord } from "../content/types";

/** `records`: candidate words with their learning state (empty learning data → group "new"); `rng`: the deck's own stream. */
export function buildDeck(_records: readonly WordRecord[], _level: number, _allowance: number, _rng: RngStream): DeckWord[] {
  throw new Error("TODO(lane-3): typing/deck.ts buildDeck");
}
