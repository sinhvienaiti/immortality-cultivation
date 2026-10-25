import { describe, expect, it } from "vitest";
import type { ReviewQuestion } from "../../src/app/learning";
import { imeHint } from "../../src/ui/ime-banner";
import { LEARN_AHEAD_MS, LearnAheadModel } from "../../src/ui/learn-ahead";
import { CARD_MS, FrameModel, shortMeaning, type FrameWord } from "../../src/ui/learning-frame";
import { ReviewModel } from "../../src/ui/review-card";
import { wordBookSections } from "../../src/ui/word-book";

/** canon §17, §5.2: the learning panels' steps without a DOM. */

const word = (text: string, isNew = false): FrameWord => ({ wordId: text, text, vi: "nghĩa của " + text, ipa: "/" + text + "/", isNew });

describe("the learning frame (canon §17, HC7)", () => {
  it("shows the meaning and IPA of the locked word only with its hint", () => {
    const model = new FrameModel();
    model.lock(word("stone"), 2, false);
    expect(model.view(0)).toMatchObject({ text: "stone", typed: 2, ipa: "", meaning: "", done: false });
    model.lock(word("river", true), 1, true);
    expect(model.view(0)).toMatchObject({ text: "river", ipa: "/river/", meaning: "nghĩa của river" });
  });

  it("cards a typed word only when its meaning was shown, and keeps the last 3 new words", () => {
    const model = new FrameModel();
    model.done(word("stone"), false, 0);
    expect(model.view(10)).toBeNull();
    model.done(word("river", true), true, 0);
    expect(model.view(CARD_MS.fresh - 1)).toMatchObject({ text: "river", done: true, meaning: "nghĩa của river" });
    expect(model.view(CARD_MS.fresh)).toBeNull();
    // A word being typed always wins over the card.
    model.done(word("garden", true), true, 0);
    model.lock(word("moon"), 1, false);
    expect(model.view(1)).toMatchObject({ text: "moon", meaning: "" });
    for (const text of ["meadow", "canyon"]) model.done(word(text, true), true, 0);
    expect(model.recent.map((item) => item.text)).toEqual(["canyon", "meadow", "garden"]);
  });

  it("shortens a meaning to its first sense", () => {
    expect(shortMeaning("tốt; hay")).toBe("tốt");
    expect(shortMeaning("có thể (xảy ra/tồn tại)")).toBe("có thể");
    expect(shortMeaning("một nghĩa rất rất rất dài quá mức")).toBe("một nghĩa rất rất rất…");
  });
});

describe("Học trước (canon §17, §14.2)", () => {
  const words = [
    { wordId: "river", text: "river", vi: "con sông", ipa: "" },
    { wordId: "garden", text: "garden", vi: "khu vườn", ipa: "" },
  ];

  it("answers a right copy at once and waits on a slip for Backspace or Enter", () => {
    const model = new LearnAheadModel(words);
    expect(model.start(0)).toBe(true);
    for (const letter of "rive") expect(model.letter(letter, 100).kind).toBe("none");
    expect(model.letter("r", 900)).toEqual({ kind: "answered", word: words[0], correct: true, typed: "river", responseMs: 900 });
    expect(model.letter("x", 950).kind).toBe("none");
    model.next(1000);
    for (const letter of "gardan") model.letter(letter, 1100);
    expect(model.slip).toBe(true);
    model.backspace();
    model.backspace();
    expect(model.typed).toBe("gard");
    expect(model.enter(2000)).toMatchObject({ kind: "answered", correct: false, typed: "gard", responseMs: 1000 });
    model.next(2100);
    expect(model.open).toBe(false);
    expect(model.results).toEqual([{ wordId: "river", correct: true }, { wordId: "garden", correct: false }]);
  });

  it("skips a word on one Esc, closes on two", () => {
    const model = new LearnAheadModel(words);
    model.start(0);
    expect(model.escape(1000).kind).toBe("skipped");
    expect(model.word?.wordId).toBe("garden");
    expect(model.escape(1000 + LEARN_AHEAD_MS.doubleEsc).kind).toBe("closed");
    expect(model.results).toEqual([]);
    expect(new LearnAheadModel([]).start(0)).toBe(false);
  });
});

describe("Thẻ Ôn (canon §17)", () => {
  const q = (kind: ReviewQuestion["kind"], text = "stone"): ReviewQuestion => ({
    wordId: text, text, vi: "hòn đá", ipa: "/stoʊn/", kind, choices: kind === "meaning-pick" ? ["mặt trời", "hòn đá", "con sông"] : [], answer: 1,
  });

  it("takes typed answers at the word's length and picks with keys 1/2/3", () => {
    const model = new ReviewModel([q("listening"), q("meaning-type", "moon"), q("meaning-pick")]);
    model.start(0);
    expect(model.pick(0, 1).kind).toBe("none");
    for (const letter of "ston") model.letter(letter, 1);
    expect(model.letter("e", 500)).toMatchObject({ kind: "answered", correct: true, answer: "stone", responseMs: 500 });
    model.next(600);
    for (const letter of "mo") model.letter(letter, 700);
    expect(model.enter(800)).toMatchObject({ kind: "answered", correct: false, answer: "mo" });
    model.next(900);
    expect(model.letter("a", 950).kind).toBe("none");
    expect(model.pick(1, 1000)).toMatchObject({ kind: "answered", correct: true, answer: "hòn đá" });
    model.next(1100);
    expect(model.open).toBe(false);
  });

  it("closes on Esc with nothing answered", () => {
    const model = new ReviewModel([q("listening")]);
    model.start(0);
    expect(model.close().kind).toBe("closed");
    expect(model.question).toBeNull();
    expect(new ReviewModel([]).start(0)).toBe(false);
  });
});

describe("Sổ Từ and the IME banner (canon §17, §5.2)", () => {
  it("groups Sổ Từ into new, mistyped, due and drops empty sections", () => {
    const sections = wordBookSections([
      { wordId: "a", text: "a", kind: "due" },
      { wordId: "b", text: "b", kind: "new" },
      { wordId: "c", text: "c", kind: "new" },
    ]);
    expect(sections.map((section) => [section.title, section.entries.length])).toEqual([["Mới học", 2], ["Cần ôn", 1]]);
  });

  it("says how to switch to English typing per platform", () => {
    expect(imeHint("other").how).toContain("Unikey");
    expect(imeHint("mac").how).toContain("ABC");
  });
});
