import { describe, expect, it } from "vitest";
import type { DeckWord, Preset, SlotId, WordGroup } from "../../src/content/types";
import { availableLetters, fallbackStages, familiarAccepts, liveWordCap, stageAccepts } from "../../src/typing/fallback";
import { kindAccepts, meaningShown, meanLengthX10, slotAccepts, slotLengths, type SlotAsk } from "../../src/typing/slots";
import { coldDeck } from "./world-fixture";

/** canon §6.2, §6.3, D35: slot word rules and the fallback order. */

const ask = (slot: SlotId | null, options: Partial<SlotAsk> = {}): SlotAsk => ({
  kind: slot === null ? "seal" : "slot",
  slot,
  preset: "balanced",
  wpm: 35,
  wave: 1,
  ...options,
});
const w = (text: string, group: WordGroup, assumed = false): DeckWord => ({ wordId: text, text, group, mastery: 0, recalls: 0, assumed });

describe("slot lengths follow E inside each band (canon §6.3)", () => {
  it("reads ℓ̄ 4.5 under 45 WPM, 5.5 at 45–64, 6.0 from 65", () => {
    expect([meanLengthX10(15), meanLengthX10(44), meanLengthX10(45), meanLengthX10(64), meanLengthX10(65), meanLengthX10(120)]).toEqual([45, 45, 55, 55, 60, 60]);
  });

  it("narrows each band around ℓ̄ and never leaves it", () => {
    expect(slotLengths(ask(1))).toEqual([3, 5]);
    expect(slotLengths(ask(2))).toEqual([4, 6]);
    expect(slotLengths(ask(2, { wpm: 50 }))).toEqual([4, 7]);
    expect(slotLengths(ask(1, { wpm: 70 }))).toEqual([5, 5]);
    expect(slotLengths(ask(5))).toEqual([5, 6]);
    expect(slotLengths(ask(null, { preset: "learn" }))).toEqual([3, 5]);
    expect(slotLengths(ask(null, { preset: "challenge", wpm: 80 }))).toEqual([5, 7]);
    expect(slotLengths({ ...ask(null), kind: "cleanse" })).toEqual([3, 4]);
  });
});

describe("slot kinds (canon §6.3, D35)", () => {
  const base = w("sun", "known", true);
  const fresh = w("river", "new");
  it("folded slots never take a new word, met or not", () => {
    for (const slot of [1, 3, 5] as const) {
      expect(kindAccepts(ask(slot), fresh, 0)).toBe(false);
      expect(kindAccepts(ask(slot), fresh, 2)).toBe(false);
    }
    expect(kindAccepts(ask(null), fresh, 0)).toBe(false);
    expect(kindAccepts({ ...ask(null), kind: "cleanse" }, fresh, 1)).toBe(false);
  });

  it("ô 4 takes a first meeting only in waves 1–2; ô 2 only from the second meeting", () => {
    expect(kindAccepts(ask(4, { wave: 1 }), fresh, 0)).toBe(true);
    expect(kindAccepts(ask(4, { wave: 2 }), fresh, 0)).toBe(true);
    expect(kindAccepts(ask(4, { wave: 3 }), fresh, 0)).toBe(false);
    expect(kindAccepts(ask(2, { wave: 1 }), fresh, 0)).toBe(false);
    expect(kindAccepts(ask(2, { wave: 5 }), fresh, 1)).toBe(true);
    expect(kindAccepts(ask(4, { wave: 5 }), fresh, 2)).toBe(true);
  });

  it("base words go straight to ô 1, ô 3, Tẩy; ô 2, ô 5 and Ấn need the fallback", () => {
    expect(kindAccepts(ask(1), base, 0)).toBe(true);
    expect(kindAccepts(ask(3), base, 0)).toBe(true);
    expect(kindAccepts({ ...ask(null), kind: "cleanse" }, base, 0)).toBe(true);
    for (const target of [ask(2), ask(5), ask(null), ask(4)]) {
      expect(kindAccepts(target, base, 0)).toBe(false);
      expect(familiarAccepts(target, base)).toBe(true);
    }
    expect(kindAccepts(ask(null), w("known", "known"), 0)).toBe(true);
  });

  it("checks length and kind together", () => {
    expect(slotAccepts(ask(1), w("tree", "known", true), 0)).toBe(true);
    expect(slotAccepts(ask(1), w("garden", "known", true), 0)).toBe(false);
    expect(slotAccepts(ask(5), w("garden", "due"), 0)).toBe(true);
    expect(slotAccepts(ask(5), w("garden", "learning"), 0)).toBe(false);
  });
});

describe("the fallback order (canon §6.2, PB-26)", () => {
  it("widens length by 1 within 3–8, then kinds towards more familiar, never towards new", () => {
    const stages = fallbackStages(ask(2));
    expect(stages.map((stage) => stage.step)).toEqual(["exact", "length", "familiar"]);
    expect(stages[1]!.lengths).toEqual([3, 7]);
    expect(fallbackStages(ask(1)).at(1)!.lengths).toEqual([3, 6]);
    expect(fallbackStages(ask(5, { wpm: 90 })).at(1)!.lengths).toEqual([4, 8]);
    // ô 2 (learning, due) → known; ô 4 (new, learning) → weak, due, known; ô 5 (due, weak) → known.
    expect(familiarAccepts(ask(2), w("x", "known"))).toBe(true);
    expect(familiarAccepts(ask(2), w("x", "weak"))).toBe(false);
    expect(familiarAccepts(ask(4), w("x", "due"))).toBe(true);
    expect(familiarAccepts(ask(5), w("x", "learning"))).toBe(false);
    for (const target of [ask(1), ask(2), ask(3), ask(4), ask(5), ask(null)]) expect(familiarAccepts(target, w("river", "new"))).toBe(false);
  });

  it("never lets an Ấn grow past its preset's top length (T is computed from it, canon §10.6)", () => {
    for (const preset of ["relax", "balanced", "challenge", "learn"] as Preset[]) {
      const exact = slotLengths(ask(null, { preset }));
      for (const stage of fallbackStages(ask(null, { preset }))) expect(stage.lengths[1]).toBe(exact[1]);
    }
  });

  it("no stage of any slot takes a word new to the match, except ô 4's own first meetings in waves 1–2", () => {
    const deck = coldDeck();
    for (const slot of [1, 2, 3, 4, 5, null] as const) {
      for (const wave of [1, 2, 3]) {
        const target = ask(slot, { wave });
        for (const stage of fallbackStages(target)) {
          for (const word of deck.filter((item) => item.group === "new")) {
            const fits = word.text.length >= stage.lengths[0] && word.text.length <= stage.lengths[1];
            expect(stageAccepts(stage, target, word, 0)).toBe(slot === 4 && wave <= 2 && fits);
          }
        }
      }
    }
  });
});

describe("the live-word cap (canon §6.2)", () => {
  it("is min(preset cap; A − 3)", () => {
    const deck = coldDeck();
    const a = availableLetters(deck);
    expect(liveWordCap("balanced", deck)).toBe(Math.min(8, a - 3));
    expect(liveWordCap("relax", deck)).toBe(Math.min(5, a - 3));
    const tiny = [w("sun", "known", true), w("sand", "known", true), w("salt", "known", true), w("tree", "known", true)];
    expect(availableLetters(tiny)).toBe(1);
    expect(liveWordCap("balanced", tiny)).toBe(1);
  });
});

describe("meaning on the Bàn Quyết (canon §13.4, §17)", () => {
  it("always at Thư giãn and Học, by right recalls at Cân bằng, first meeting only at Thử thách", () => {
    const known = { group: "known" as const, recalls: 2, mastery: 80 };
    const fresh = { group: "new" as const, recalls: 0, mastery: 0 };
    expect(meaningShown("relax", known, 3)).toBe(true);
    expect(meaningShown("learn", known, 3)).toBe(true);
    expect(meaningShown("balanced", known, 3)).toBe(false);
    expect(meaningShown("balanced", { ...known, recalls: 1 }, 3)).toBe(true);
    expect(meaningShown("challenge", fresh, 1)).toBe(true);
    expect(meaningShown("challenge", fresh, 2)).toBe(false);
    expect(meaningShown("challenge", { ...known, recalls: 0 }, 1)).toBe(false);
  });
});
