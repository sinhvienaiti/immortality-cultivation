import { describe, expect, it } from "vitest";
import { DECK } from "../../src/content/rules";
import type { WordGroup, WordRecord } from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";
import { buildDeck, groupForRecord, isColdStart, newWordsOf } from "../../src/typing/deck";

/** canon §17.1, D35, PB-02: the match deck and its cold start. */

/** k-th synthetic a–z word of 4–5 letters (distinct for every k < 26³). */
function word(k: number, prefix = ""): string {
  const a = String.fromCharCode(97 + (k % 26));
  const b = String.fromCharCode(97 + (Math.floor(k / 26) % 26));
  const c = String.fromCharCode(97 + (Math.floor(k / 676) % 26));
  return (prefix + a + b + c + "o").slice(0, 8);
}

function records(count: number, level: number, group: WordGroup = "new", from = 0, prefix = ""): WordRecord[] {
  return Array.from({ length: count }, (_, k) => {
    const text = word(from + k, prefix);
    return { wordId: text, text, group, level, mastery: group === "known" ? 80 : group === "learning" ? 55 : 20, recalls: group === "known" ? 3 : 0 };
  });
}

const rng = (seed = 1) => createRng(seed).words;

describe("buildDeck: cold start (no learning record, every M0a match)", () => {
  const level1 = records(60, 1);
  const level2 = records(30, 2, "new", 100);
  const pool = [...level1, ...level2];

  it("takes ≤ 40 base words one level below, flagged assumed, plus the allowance's new words", () => {
    const deck = buildDeck(pool, 2, 8, rng());
    expect(deck.length).toBe(48);
    const base = deck.filter((w) => w.assumed);
    expect(base).toHaveLength(DECK.baseWords);
    expect(new Set(base.map((w) => w.wordId))).toEqual(new Set(level1.slice(0, 40).map((r) => r.wordId)));
    expect(base.every((w) => w.group === "known")).toBe(true);
    const fresh = newWordsOf(deck);
    expect(new Set(fresh.map((w) => w.wordId))).toEqual(new Set(level2.slice(0, 8).map((r) => r.wordId)));
    expect(fresh.every((w) => !w.assumed)).toBe(true);
  });

  it("never relabels an unrecorded word: every word is a base word or new (no 'learning' filler)", () => {
    for (const allowance of [0, 3, 8]) {
      const deck = buildDeck(pool, 2, allowance, rng(allowance));
      expect(deck.length).toBeGreaterThanOrEqual(DECK.floorWords);
      for (const w of deck) expect(w.assumed ? w.group === "known" : w.group === "new").toBe(true);
      expect(deck.filter((w) => w.group === "new")).toHaveLength(allowance);
    }
  });

  it("takes A1's first words at the lowest level; a short base level shrinks the deck, never borrows harder words", () => {
    const low = buildDeck(pool, 1, 4, rng());
    expect(new Set(low.filter((w) => w.assumed).map((w) => w.wordId))).toEqual(new Set(level1.slice(0, 40).map((r) => r.wordId)));
    const short = [...records(25, 1), ...records(30, 2, "new", 100)];
    const deck = buildDeck(short, 2, 8, rng());
    // canon §17.1: base words only from the base level (1) and below; 25 there, so the deck is 25 + 8 new.
    expect(new Set(deck.filter((w) => w.assumed).map((w) => w.wordId))).toEqual(new Set(short.slice(0, 25).map((r) => r.wordId)));
    expect(deck).toHaveLength(33);
    expect(newWordsOf(deck)).toHaveLength(8);
  });

  it("never flags a word at or above the profile level as a base word (part A review)", () => {
    // Profile level 3: base level 2, then 1; levels 3 and 4 are never assumed even when the base levels are short.
    const pool3 = [...records(10, 1, "new", 0), ...records(12, 2, "new", 100), ...records(50, 3, "new", 200), ...records(50, 4, "new", 300)];
    const level = new Map(pool3.map((r) => [r.wordId, r.level]));
    for (const allowance of [0, 4, 8]) {
      const deck = buildDeck(pool3, 3, allowance, rng(allowance));
      const base = deck.filter((w) => w.assumed);
      expect(base).toHaveLength(22);
      expect(base.every((w) => level.get(w.wordId)! <= 2)).toBe(true);
      // The new words come from the profile level first; nothing relabelled; the deck shrinks to 22 + allowance.
      expect(newWordsOf(deck).every((w) => level.get(w.wordId) === 3)).toBe(true);
      expect(deck).toHaveLength(22 + allowance);
      for (const w of deck) expect(w.assumed ? w.group === "known" : w.group === "new").toBe(true);
    }
    // The base level comes first, then the lower one: with room for all, both levels are in.
    const enough = [...records(30, 1, "new", 0), ...records(30, 2, "new", 100), ...records(20, 3, "new", 200)];
    const deck = buildDeck(enough, 3, 0, rng());
    const levels = deck.filter((w) => w.assumed).map((w) => enough.find((r) => r.wordId === w.wordId)!.level);
    expect(levels.filter((value) => value === 2)).toHaveLength(30);
    expect(levels.filter((value) => value === 1)).toHaveLength(10);
  });

  it("leaves out sensitive words always and mature words for child profiles", () => {
    const risky: WordRecord[] = [
      { wordId: "sex", text: "sex", group: "new", level: 1, mastery: 0, recalls: 0 },
      { wordId: "gun", text: "gun", group: "new", level: 1, mastery: 0, recalls: 0 },
      { wordId: "Bad", text: "Bad", group: "new", level: 1, mastery: 0, recalls: 0 },
      { wordId: "ox", text: "ox", group: "new", level: 1, mastery: 0, recalls: 0 },
      { wordId: "elephants", text: "elephants", group: "new", level: 1, mastery: 0, recalls: 0 },
    ];
    const adult = buildDeck([...risky, ...level1], 1, 0, rng());
    expect(adult.some((w) => w.text === "sex" || w.text === "Bad" || w.text === "ox" || w.text === "elephants")).toBe(false);
    expect(adult.some((w) => w.text === "gun")).toBe(true);
    const child = buildDeck([...risky, ...level1], 1, 0, rng(), { excludeMature: true });
    expect(child.some((w) => w.text === "gun")).toBe(false);
  });

  it("shuffles on its own stream: same seed, same deck", () => {
    const a = buildDeck(pool, 2, 8, rng(5));
    const b = buildDeck(pool, 2, 8, rng(5));
    const c = buildDeck(pool, 2, 8, rng(6));
    expect(a).toEqual(b);
    expect(c.map((w) => w.wordId).sort()).toEqual(a.map((w) => w.wordId).sort());
    expect(c.map((w) => w.wordId)).not.toEqual(a.map((w) => w.wordId));
  });
});

describe("buildDeck: a profile with records", () => {
  it("keeps every recorded group as recorded and the new words within the allowance", () => {
    const recorded = [...records(30, 2, "due", 0, "d"), ...records(20, 2, "weak", 0, "w"), ...records(30, 2, "learning", 0, "l"), ...records(40, 2, "known", 0, "k")];
    const fresh = records(20, 2, "new", 0, "n");
    const pool = [...recorded, ...fresh];
    expect(isColdStart(pool)).toBe(false);
    const deck = buildDeck(pool, 2, 6, rng());
    expect(deck.length).toBe(DECK.maxWords);
    const byId = new Map(pool.map((r) => [r.wordId, r]));
    for (const w of deck) expect(w.group).toBe(byId.get(w.wordId)!.group);
    expect(deck.filter((w) => w.group === "new")).toHaveLength(6);
    for (const group of ["due", "weak", "learning", "known"] as const) expect(deck.some((w) => w.group === group)).toBe(true);
    expect(deck.some((w) => w.assumed)).toBe(false);
  });

  it("tops a thin profile up to the 40 floor with base words, never with relabelled words", () => {
    const pool = [...records(6, 2, "due", 0, "d"), ...records(4, 2, "learning", 0, "l"), ...records(60, 1, "new", 0, "b"), ...records(20, 2, "new", 0, "n")];
    const deck = buildDeck(pool, 2, 4, rng());
    expect(deck.length).toBe(DECK.floorWords);
    expect(deck.filter((w) => w.assumed)).toHaveLength(40 - 14);
    for (const w of deck) {
      if (w.assumed) expect(w.group).toBe("known");
    }
    expect(deck.filter((w) => !w.assumed && w.group !== "new").length).toBe(10);
  });

  it("groups a learning record: due, weak < 40, learning < 70, known (canon §16, §17)", () => {
    expect(groupForRecord(null)).toBe("new");
    expect(groupForRecord({ mastery: 90, due: true })).toBe("due");
    expect(groupForRecord({ mastery: 39, due: false })).toBe("weak");
    expect(groupForRecord({ mastery: 69, due: false })).toBe("learning");
    expect(groupForRecord({ mastery: 70, due: false })).toBe("known");
  });
});
