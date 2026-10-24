import { describe, expect, it } from "vitest";
import { createReplayHeader, loadMatch, matchRulesHash, newWordAllowance, type MatchDeps, type MatchRequest } from "../../src/app/app";
import { contentHash } from "../../src/content/rules";
import type { DeckWord, StageDef } from "../../src/content/types";
import type { NewWordLedger } from "../../src/typing/new-word-ledger";

/** canon §6.4, §23.2, M0A_PLAN §6.9: match loading writes the replay header before tick 0. */

const STAGE = { id: "m0a-thanh-thach-ai" } as StageDef;

const REQUEST: MatchRequest = {
  seed: 42,
  stage: STAGE,
  preset: "balanced",
  pacing: true,
  loadout: { guard: "ward", tamPhap: "kiem-tam" },
  profile: { e: 35, a: 950, cv: 250 },
  records: [],
  level: 1,
  dueCount: 0,
  nowMs: 10_000_000,
};

const DECK: DeckWord[] = [
  { wordId: "sun", text: "sun", group: "known", mastery: 0, recalls: 0, assumed: true },
  { wordId: "river", text: "river", group: "new", mastery: 0, recalls: 0, assumed: false },
];

function fakeDeps(remaining: number, seen: { allowance?: number; rngFirst?: number }): MatchDeps {
  const ledger: NewWordLedger = {
    remaining: () => remaining,
    take: () => true,
    snapshot: () => ({ v: 1, entries: [] }),
  };
  return {
    ledger: () => ledger,
    buildDeck: (_records, _level, allowance, rng) => {
      seen.allowance = allowance;
      seen.rngFirst = rng.next();
      return DECK;
    },
    kPm: () => 1000,
    rulesHash: () => "0badc0de",
  };
}

describe("match loading and the replay header", () => {
  it("allows the ledger's remaining words, at most 4 with more than 80 due (canon §6.4)", () => {
    expect(newWordAllowance(8, 0)).toBe(8);
    expect(newWordAllowance(8, 80)).toBe(8);
    expect(newWordAllowance(8, 81)).toBe(4);
    expect(newWordAllowance(2, 200)).toBe(2);
    expect(newWordAllowance(-3, 0)).toBe(0);
  });

  it("writes canon §23.2's header in its field order", () => {
    const header = createReplayHeader(REQUEST, DECK, 3, 1000, "0badc0de");
    expect(Object.keys(header)).toEqual(["v", "gameId", "rulesHash", "seed", "stageId", "preset", "pacing", "seats", "deck", "newWordAllowance", "loadout"]);
    expect(header).toMatchObject({ v: 1, gameId: "immortality-cultivation", seed: 42, stageId: "m0a-thanh-thach-ai", newWordAllowance: 3 });
    expect(header.seats).toEqual([{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000 }]);
    expect(Object.keys(header.deck[0]!)).toEqual(["wordId", "text", "group", "mastery", "recalls", "assumed"]);
  });

  it("snapshots the ledger once and builds the deck from its own seeded stream", () => {
    const first: { allowance?: number; rngFirst?: number } = {};
    const second: { allowance?: number; rngFirst?: number } = {};
    const a = loadMatch({ ...REQUEST, dueCount: 100 }, fakeDeps(7, first));
    const b = loadMatch({ ...REQUEST, dueCount: 100 }, fakeDeps(7, second));
    expect(first.allowance).toBe(4);
    expect(a.header.newWordAllowance).toBe(4);
    expect(a.header.deck).toEqual(DECK);
    expect(a.header.rulesHash).toBe("0badc0de");
    // Same seed, same deck stream: replays rebuild the same deck.
    expect(first.rngFirst).toBe(second.rngFirst);
    expect(JSON.stringify(a.header)).toBe(JSON.stringify(b.header));
  });

  it("hashes rules and data into 8 hex digits that follow the content", () => {
    const hash = matchRulesHash(STAGE);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(matchRulesHash(STAGE)).toBe(hash);
    expect(matchRulesHash({ ...STAGE, id: "other" })).not.toBe(hash);
    expect(contentHash([{ a: 1 }])).not.toBe(contentHash([{ a: 2 }]));
  });
});
