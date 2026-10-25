import { describe, expect, it, vi } from "vitest";
import {
  createLearning, createLearningQueue, isRightRecall, learnAheadWords, learningRuleProblems, loadDeckSource, parseLookup, recordsFrom, reviewQuestions,
  typedWordEvent, wordBookEntries, type IcLearningEvent, type MatchWord,
} from "../../src/app/learning";
import type { DeckWord, SimEvent, World } from "../../src/content/types";
import { createNewWordLedger } from "../../src/typing/new-word-ledger";
import { TRIAL_DECK_WORDS as TRIAL_WORDS } from "../../src/content/data/trial-set";

/** canon §17, D17, D43, §6.4: learning events, dry-run drafts, the queue guard, Thẻ Ôn and Sổ Từ. */

const deck: DeckWord[] = [
  { wordId: "sun", text: "sun", group: "known", mastery: 0, recalls: 0, assumed: true },
  { wordId: "moon", text: "moon", group: "known", mastery: 0, recalls: 0, assumed: true },
  { wordId: "river", text: "river", group: "new", mastery: 0, recalls: 0, assumed: false },
  { wordId: "garden", text: "garden", group: "new", mastery: 0, recalls: 0, assumed: false },
  { wordId: "stone", text: "stone", group: "due", mastery: 50, recalls: 1, assumed: false },
];
const world = { header: { deck } } as unknown as World;
const GLOSS: Record<string, { vi: string; ipa: string }> = {
  sun: { vi: "mặt trời", ipa: "/sʌn/" },
  moon: { vi: "mặt trăng", ipa: "/mun/" },
  river: { vi: "con sông", ipa: "/ˈɹɪvɚ/" },
  garden: { vi: "khu vườn", ipa: "/ˈɡɑɹdən/" },
  stone: { vi: "hòn đá", ipa: "/stoʊn/" },
};
const gloss = (id: string) => GLOSS[id] ?? null;

const complete = (wordId: string, options: Partial<Extract<SimEvent, { type: "word-complete" }>> = {}): SimEvent => ({
  type: "word-complete", tick: 100, seat: 0, word: 0, wordId, text: wordId, grade: "perfect", errors: 0, keyTicks: 30, responseMs: 900,
  activity: "typing-skill", scored: true, hintUsed: false, channel: "typing", ...options,
});

describe("learning events of typed words (canon §17)", () => {
  it("builds one scored event per word with activity, hintUsed, channel; later completions stay local", () => {
    const sent: IcLearningEvent[] = [];
    const session = createLearning({ dryRun: false, ledger: createNewWordLedger({ v: 1, entries: [] }), now: () => 1_000, send: (event) => sent.push(event), gloss });
    session.onEvents([complete("sun", { hintUsed: true }), complete("sun", { scored: false, errors: 2, grade: "sloppy" }), complete("stone", { activity: "typing-elite", errors: 1, grade: "ok" })], world);
    expect(sent).toHaveLength(0);
    session.onEvents([{ type: "wave-end", tick: 200, wave: 1 }], world);
    expect(sent.map((event) => [event.entityId, event.activityType, event.result, event.hintUsed, event.channel])).toEqual([
      ["sun", "typing-skill", "correct", true, "typing"],
      ["stone", "typing-elite", "wrong", false, "typing"],
    ]);
    expect(sent.every((event) => event.gameId === "immortality-cultivation" && event.dryRun === undefined && event.bot === undefined)).toBe(true);
    expect(learningRuleProblems(sent, { queued: true })).toEqual([]);
    const sun = session.matchWords().find((word) => word.wordId === "sun")!;
    expect(sun).toMatchObject({ count: 2, sloppy: true, hintUsed: true, errors: 2 });
  });

  it("maps a word-complete's activity and hint as the sim reports them (typing-boss, a fizzled Cast's word too)", () => {
    const event = typedWordEvent(complete("river", { activity: "typing-boss", hintUsed: true, responseMs: 1234.6 }) as Extract<SimEvent, { type: "word-complete" }>, "2026-10-25T00:00:00.000Z");
    expect(event).toMatchObject({ activityType: "typing-boss", hintUsed: true, responseMs: 1235, channel: "typing", expectedAnswer: "river", result: "correct" });
  });
});

describe("Học trước and Thẻ Ôn events (canon §17, D17)", () => {
  it("Học trước is review-card with hintUsed true, never a right recall; it goes through the ledger", () => {
    const sent: IcLearningEvent[] = [];
    const ledger = createNewWordLedger({ v: 1, entries: [] });
    const saved = vi.fn();
    const session = createLearning({ dryRun: false, ledger, now: () => 5_000, send: (event) => sent.push(event), onLedgerChange: saved });
    const event = session.learnAhead({ wordId: "river", text: "river" }, true, 2000, "river");
    expect(event).toMatchObject({ activityType: "review-card", hintUsed: true, result: "correct", userAnswer: "river" });
    expect(isRightRecall(event.activityType, event.result, event.hintUsed)).toBe(false);
    expect(ledger.snapshot().entries).toEqual([{ wordId: "river", firstSeenMs: 5_000, channel: "learn-ahead" }]);
    expect(saved).toHaveBeenCalledTimes(1);
    // The sim's word-first-seen of the same word takes nothing more.
    session.onEvents([{ type: "word-first-seen", tick: 3, seat: 0, wordId: "river", channel: "learn-ahead" }], world);
    expect(saved).toHaveBeenCalledTimes(1);
    session.flush();
    expect(learningRuleProblems(sent, { learnAhead: new Set(["river"]), queued: true })).toEqual([]);
    expect(learningRuleProblems([{ ...event, hintUsed: false }], { learnAhead: new Set(["river"]) })).toEqual(["river: Học trước without hintUsed"]);
  });

  it("takes a new word met in ô 4 on word-first-seen with the app's clock", () => {
    const ledger = createNewWordLedger({ v: 1, entries: [] });
    const session = createLearning({ dryRun: true, ledger, now: () => 77 });
    session.onEvents([{ type: "word-first-seen", tick: 10, seat: 0, wordId: "garden", channel: "slot4" }], world);
    expect(ledger.snapshot().entries).toEqual([{ wordId: "garden", firstSeenMs: 77, channel: "slot4" }]);
  });

  it("Thẻ Ôn answers are listening, review-card or meaning-recall, with no hint: right ones are recalls", () => {
    const session = createLearning({ dryRun: true, ledger: createNewWordLedger({ v: 1, entries: [] }), now: () => 0, gloss });
    const base = { wordId: "stone", text: "stone", vi: "hòn đá", ipa: "", choices: [], answer: 0 };
    const kinds = (["listening", "meaning-type", "meaning-pick"] as const).map((kind) => session.review({ ...base, kind }, true, 800, "stone"));
    expect(kinds.map((event) => event.activityType)).toEqual(["listening", "review-card", "meaning-recall"]);
    expect(kinds.every((event) => event.hintUsed === false && isRightRecall(event.activityType, event.result, event.hintUsed))).toBe(true);
  });
});

describe("dry run and the queue (canon §17.2, D43)", () => {
  it("a dry-run session builds drafts by the same rules and never sends", () => {
    const send = vi.fn();
    const session = createLearning({ dryRun: true, bot: true, ledger: createNewWordLedger({ v: 1, entries: [] }), now: () => 0, send });
    session.onEvents([{ type: "phase", tick: 0, phase: "warning", wave: 2, endsAtTick: 300 }, complete("sun"), { type: "wave-end", tick: 9, wave: 2 }], world);
    session.learnAhead({ wordId: "river", text: "river" }, true, 1, "river");
    session.flush();
    session.dispose();
    expect(send).not.toHaveBeenCalled();
    expect(session.drafts).toHaveLength(2);
    expect(session.drafts.every((event) => event.dryRun === true && event.bot === true)).toBe(true);
    expect(session.drafts[0]).toMatchObject({ entityId: "sun", wave: 2 });
    expect(session.queue.blocked).toBe(0);
  });

  it("the queue refuses and logs any bot or dry-run event", () => {
    const sent: IcLearningEvent[] = [];
    const log = vi.fn();
    const queue = createLearningQueue((event) => sent.push(event), log);
    const human = typedWordEvent(complete("sun") as Extract<SimEvent, { type: "word-complete" }>, "2026-10-25T00:00:00.000Z");
    expect(queue.push(human)).toBe(true);
    expect(queue.push({ ...human, dryRun: true })).toBe(false);
    expect(queue.push({ ...human, bot: true })).toBe(false);
    expect(sent).toEqual([human]);
    expect(queue.blocked).toBe(2);
    expect(log).toHaveBeenCalledTimes(2);
    expect(learningRuleProblems([{ ...human, bot: true }], { queued: true })).toEqual(["sun: a bot event in the queue"]);
  });

  it("a bot session that forgets dry run still never reaches the portal", () => {
    const send = vi.fn();
    const log = vi.fn();
    const session = createLearning({ dryRun: false, bot: true, ledger: createNewWordLedger({ v: 1, entries: [] }), now: () => 0, send, log });
    session.onEvents([complete("sun"), { type: "victory", tick: 5, stars: 3 }], world);
    expect(send).not.toHaveBeenCalled();
    expect(session.queue.blocked).toBe(1);
  });

  it("flags a second scored typing event of one word and unknown activity types (HC7 checker)", () => {
    const one = typedWordEvent(complete("sun") as Extract<SimEvent, { type: "word-complete" }>, "2026-10-25T00:00:00.000Z");
    expect(learningRuleProblems([one, one])).toEqual(["sun: a second scored typing event this match"]);
    expect(learningRuleProblems([{ ...one, activityType: "typing" }])).toEqual(["sun: unknown activityType typing"]);
  });
});

describe("Thẻ Ôn questions and Sổ Từ (canon §17)", () => {
  const word = (wordId: string, options: Partial<MatchWord> = {}): MatchWord => ({ wordId, text: wordId, isNew: false, wasDue: false, wave: 2, count: 1, sloppy: false, hintUsed: false, errors: 0, ...options });

  it("asks ≤ 3 words of the wave: Ẩu, then typed with the meaning shown, then new; kinds rotate", () => {
    const words = [word("sun"), word("river", { isNew: true }), word("moon", { hintUsed: true }), word("stone", { sloppy: true }), word("garden", { wave: 1, sloppy: true })];
    const questions = reviewQuestions(words, 2, gloss, 0, deck.map((item) => item.wordId));
    expect(questions.map((question) => question.wordId)).toEqual(["stone", "moon", "river"]);
    expect(questions.map((question) => question.kind)).toEqual(["listening", "meaning-type", "meaning-pick"]);
    const pick = questions[2]!;
    expect(pick.choices).toHaveLength(3);
    expect(pick.choices[pick.answer]).toBe("con sông");
    expect(new Set(pick.choices).size).toBe(3);
    expect(reviewQuestions(words, 2, gloss, 1).map((question) => question.kind)).toEqual(["meaning-type", "meaning-pick", "listening"]);
  });

  it("asks a word with no meaning only by ear, and continues the rotation across breaks", () => {
    const session = createLearning({ dryRun: true, ledger: createNewWordLedger({ v: 1, entries: [] }), now: () => 0, gloss });
    session.onEvents([{ type: "wave-start", tick: 0, wave: 1, waves: 6, gates: ["A"] }, complete("sun", { grade: "sloppy", errors: 2 }), complete("moon", { hintUsed: true })], world);
    expect(session.reviewQuestions(1).map((question) => question.kind)).toEqual(["listening", "meaning-type"]);
    session.onEvents([{ type: "wave-start", tick: 0, wave: 2, waves: 6, gates: ["A"] }, complete("stone", { grade: "sloppy", errors: 3 })], world);
    expect(session.reviewQuestions(2).map((question) => question.kind)).toEqual(["meaning-pick"]);
    expect(reviewQuestions([word("zzz", { sloppy: true })], 2, gloss, 1).map((question) => question.kind)).toEqual(["listening"]);
  });

  it("Sổ Từ lists new, mistyped, then due words, each once", () => {
    const entries = wordBookEntries([word("river", { isNew: true, errors: 1 }), word("sun", { errors: 1 }), word("stone", { wasDue: true }), word("moon")], gloss);
    expect(entries.map((entry) => [entry.wordId, entry.kind])).toEqual([["river", "new"], ["sun", "mistyped"], ["stone", "due"]]);
    expect(entries[0]).toMatchObject({ vi: "con sông", ipa: "/ˈɹɪvɚ/" });
  });

  it("Học trước offers the deck's new words in deck order with their gloss", () => {
    expect(learnAheadWords(deck, gloss)).toEqual([
      { wordId: "river", text: "river", vi: "con sông", ipa: "/ˈɹɪvɚ/" },
      { wordId: "garden", text: "garden", vi: "khu vườn", ipa: "/ˈɡɑɹdən/" },
    ]);
  });
});

describe("the match's word source (canon §17.1, §25)", () => {
  const entries = [
    { id: "1", en: "Sun", vi: "mặt trời", ipa: "/sʌn/", level: 1 },
    { id: "2", en: "sun", vi: "dup", ipa: "", level: 1 },
    { id: "3", en: "ice cream", vi: "kem", ipa: "", level: 1 },
    { id: "4", en: "river", vi: "con sông", ipa: "", level: 2 },
    { id: "5", en: "sex", vi: "x", ipa: "", level: 2 },
    { id: "6", en: "gun", vi: "súng", ipa: "", level: 2 },
  ];

  it("reads lookup answers in each shape: mastery, due by date, right recalls only without a hint", () => {
    const now = Date.parse("2026-10-25T00:00:00Z");
    const records = parseLookup(
      {
        items: [
          { entityId: "River", mastery: 55, nextReviewAt: "2026-10-24T00:00:00Z", recentAnswers: [{ activityType: "listening", result: "correct" }, { activityType: "review-card", result: "correct", hintUsed: true }] },
          { wordKey: "sun", mastery: 120 },
        ],
      },
      now,
    );
    expect(records.get("river")).toEqual({ mastery: 55, due: true, recalls: 1 });
    expect(records.get("sun")).toEqual({ mastery: 100, due: false, recalls: 0 });
    expect(parseLookup({ records: { moon: { mastery: 80 } } }, now).get("moon")).toEqual({ mastery: 80, due: false, recalls: 0 });
  });

  it("turns vocabulary into deck records: a–z words, first spelling, blocked words out, groups by record", () => {
    const core = new Map([["river", { mastery: 50, due: false, recalls: 1 }]]);
    const adult = recordsFrom(entries, core);
    expect(adult.records.map((record) => [record.wordId, record.group, record.level])).toEqual([["sun", "new", 1], ["river", "learning", 2], ["gun", "new", 2]]);
    expect(adult.gloss.get("sun")).toEqual({ vi: "mặt trời", ipa: "/sʌn/" });
    expect(recordsFrom(entries, core, true).records.map((record) => record.wordId)).toEqual(["sun", "river"]);
  });

  it("is a cold start without a portal, and falls back to the labelled set without vocabulary", async () => {
    const cold = await loadDeckSource(2, { loadEntries: async () => entries, lookup: async () => Promise.reject(new Error("no-portal")), nowMs: 0 });
    expect(cold.fallback).toBe(false);
    expect(cold.records.every((record) => record.group === "new")).toBe(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = await loadDeckSource(1, { loadEntries: async () => Promise.reject(new Error("404")), nowMs: 0 });
    warn.mockRestore();
    expect(fallback.fallback).toBe(true);
    expect(fallback.records).toHaveLength(TRIAL_WORDS.length);
    expect(fallback.records.filter((record) => record.level === 1)).toHaveLength(48);
    expect(fallback.gloss.get("good")?.vi).toBe("tốt; hay");
  });
});
