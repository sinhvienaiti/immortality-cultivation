// Tĩnh Tu lessons, pools, topic map and the new-word ledger rule (canon §16, §6.4, D39, D40, PB-13). Lane 8.
import { describe, expect, it } from "vitest";
import { NEW_WORDS, TINH_TU } from "../../src/content/rules";
import type { NewWordsSnapshot } from "../../src/content/types";
import {
  NEW_PROGRESS,
  PRETEND,
  addSessionScore,
  buildPools,
  canOpenLesson,
  lessonCounted,
  minutesUntilWords,
  pretendRecords,
  sessionInit,
  type WordRecord,
} from "../../src/tinh-tu/sim/lesson";
import { DISTANCE_TABLE, GROUP_IDS, TOPIC_MAP, farGroups, isPolysemous, senseCount, topicDistance, wordFitsPools } from "../../src/tinh-tu/sim/topics";
import { TRIAL_LESSONS, TRIAL_TOPIC_WORDS as TRIAL_WORDS } from "../../src/content/data/trial-set";
import { createNewWordLedger } from "../../src/typing/new-word-ledger";
import { RECORDS } from "./helpers";

/** Lane 3's ledger (the page's interim stand-in is gone, part A fixes). */
const openLedger = (snapshot: NewWordsSnapshot) => ({ ledger: createNewWordLedger(snapshot) });

const MIN = 60_000;

describe("topic map (canon §16, D40: 15 groups, Tâm ma ≥ 3 steps away)", () => {
  it("has the 15 shared/vocabulary groups on distinct cells", () => {
    expect(GROUP_IDS.length).toBe(TINH_TU.topics);
    expect(new Set(TOPIC_MAP.map((group) => group.id))).toEqual(new Set(GROUP_IDS));
    expect(new Set(TOPIC_MAP.map((group) => group.row + "," + group.col)).size).toBe(15);
  });

  it("distance is a metric (0 on itself, symmetric, triangle inequality)", () => {
    for (let a = 0; a < 15; a += 1) {
      expect(DISTANCE_TABLE[a]![a]).toBe(0);
      for (let b = 0; b < 15; b += 1) {
        expect(DISTANCE_TABLE[a]![b]).toBe(DISTANCE_TABLE[b]![a]);
        if (a !== b) expect(DISTANCE_TABLE[a]![b]).toBeGreaterThan(0);
        for (let c = 0; c < 15; c += 1) expect(DISTANCE_TABLE[a]![c]).toBeLessThanOrEqual(DISTANCE_TABLE[a]![b]! + DISTANCE_TABLE[b]![c]!);
      }
    }
    expect(() => topicDistance("nature-environment", "no-such-group")).toThrow();
  });

  it("every group has far groups for its Tâm ma, all ≥ 3 steps away", () => {
    for (const group of GROUP_IDS) {
      const far = farGroups(group);
      expect(far.length).toBeGreaterThan(0);
      for (const other of far) expect(topicDistance(group, other)).toBeGreaterThanOrEqual(TINH_TU.topicDistance);
      expect(far).not.toContain(group);
    }
  });

  it("polysemous (≥ 3 senses) and multi-group words fit neither pool", () => {
    expect(senseCount("rửa; giặt; lớp sơn mỏng")).toBe(3);
    expect(senseCount("lạnh; rét (thời tiết)")).toBe(2);
    expect(isPolysemous("rửa; giặt; lớp sơn mỏng")).toBe(true);
    expect(wordFitsPools(["food-drink"], "lạnh; rét")).toBe(true);
    expect(wordFitsPools(["food-drink", "home-living"], "lạnh")).toBe(false);
    expect(wordFitsPools(["food-drink"], "rửa; giặt; lớp sơn mỏng")).toBe(false);
    expect(wordFitsPools(["no-such-group"], "lạnh")).toBe(false);
  });
});

describe("trial set (M0A_PLAN §6.8.3)", () => {
  it("three lessons of 6 words, a–z 3–8, own first letters, one group each", () => {
    expect(TRIAL_LESSONS.length).toBe(3);
    for (const lesson of TRIAL_LESSONS) {
      expect(lesson.words.length).toBe(TINH_TU.lessonWords);
      for (const word of lesson.words) expect(word.text).toMatch(/^[a-z]{3,8}$/);
      expect(new Set(lesson.words.map((word) => word.text[0])).size).toBe(6);
      expect(GROUP_IDS).toContain(lesson.group);
    }
    expect(new Set(TRIAL_LESSONS.map((lesson) => lesson.slot))).toEqual(new Set([2, 4, 5]));
  });

  it("pool words are one group each, not polysemous, never a lesson word", () => {
    const lessonWords = new Set(TRIAL_LESSONS.flatMap((lesson) => lesson.words.map((word) => word.text)));
    expect(new Set(TRIAL_WORDS.map((word) => word.text)).size).toBe(TRIAL_WORDS.length);
    for (const word of TRIAL_WORDS) {
      expect(wordFitsPools([word.group], word.vi)).toBe(true);
      expect(lessonWords.has(word.text)).toBe(false);
      expect(word.text).toMatch(/^[a-z]{3,8}$/);
    }
  });

  it("the fallback records make about one word in three known and leave lesson words new", () => {
    const records = pretendRecords(TRIAL_WORDS, TRIAL_LESSONS);
    const known = [...records.values()].filter((record) => !record.due && record.mastery === PRETEND.knownMastery).length;
    expect(known / records.size).toBeGreaterThan(0.2);
    expect(known / records.size).toBeLessThan(0.45);
    for (const lesson of TRIAL_LESSONS) for (const word of lesson.words) expect(records.has(word.text)).toBe(false);
  });
});

describe("pools (canon §16, PB-13)", () => {
  const groupOf = new Map(TRIAL_WORDS.map((word) => [word.text, word.group]));

  it("Thường are due words; Tâm ma are known (≥ 70, not due) words of groups ≥ 3 steps away; no lesson word", () => {
    for (const lesson of TRIAL_LESSONS) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const pools = buildPools(TRIAL_WORDS, RECORDS, lesson, seed);
        const lessonWords = new Set(lesson.words.map((word) => word.text));
        expect(pools.thuong.length).toBeGreaterThan(0);
        expect(pools.tamMa.length).toBeGreaterThan(0);
        for (const word of pools.thuong) {
          expect(RECORDS.get(word.text)!.due).toBe(true);
          expect(lessonWords.has(word.text)).toBe(false);
        }
        for (const word of pools.tamMa) {
          const record = RECORDS.get(word.text)!;
          expect(record.due).toBe(false);
          expect(record.mastery).toBeGreaterThanOrEqual(TINH_TU.tamMaMastery);
          expect(topicDistance(lesson.group, groupOf.get(word.text)!)).toBeGreaterThanOrEqual(TINH_TU.topicDistance);
          expect(lessonWords.has(word.text)).toBe(false);
        }
        // Plain paper in Tham Ngộ: same-group Thường come first; other groups are fewer and keep their mark.
        const same = pools.thuong.filter((word) => word.group === lesson.group).length;
        expect(same).toBeGreaterThan(0);
      }
    }
  });

  it("a word without a record is new: never Thường or Tâm ma", () => {
    const records = new Map<string, WordRecord>([...RECORDS].slice(0, 40));
    const pools = buildPools(TRIAL_WORDS, records, TRIAL_LESSONS[0]!, 1);
    for (const word of [...pools.thuong, ...pools.tamMa]) expect(records.has(word.text)).toBe(true);
  });

  it("a review session (no lesson) has Thường only", () => {
    const pools = buildPools(TRIAL_WORDS, RECORDS, null, 3);
    expect(pools.tamMa).toEqual([]);
    const init = sessionInit({ seed: 3, tier: "tham-ngo", mode: "review", eEffX10: 294, lesson: null, pools });
    expect(init.minh).toEqual([]);
    expect(init.tamMa).toEqual([]);
    expect(init.thuong.length).toBeGreaterThan(0);
  });

  it("pools do not depend on the order of the catalog", () => {
    const lesson = TRIAL_LESSONS[1]!;
    const a = buildPools(TRIAL_WORDS, RECORDS, lesson, 5);
    const b = buildPools([...TRIAL_WORDS].reverse(), RECORDS, lesson, 5);
    expect(b).toEqual(a);
  });
});

describe("new lessons and the ledger (canon §6.4, §16, D39)", () => {
  const snapshot = (stamps: readonly number[]): NewWordsSnapshot => ({ v: 1, entries: stamps.map((ms, at) => ({ wordId: "w" + at, firstSeenMs: ms, channel: "slot4" })) });

  it("a new lesson opens only with ≥ 6 words left; never half a lesson", () => {
    expect(canOpenLesson(NEW_WORDS.perWindow)).toBe(true);
    expect(canOpenLesson(6)).toBe(true);
    expect(canOpenLesson(5)).toBe(false);
    expect(canOpenLesson(0)).toBe(false);
  });

  it("with 3 words met in the window, 5 are left: no new lesson, and the wait is until the oldest leaves", () => {
    const now = 100 * MIN;
    const { ledger } = openLedger(snapshot([now - 15 * MIN, now - 10 * MIN, now - 1 * MIN]));
    expect(ledger.remaining(now)).toBe(5);
    expect(canOpenLesson(ledger.remaining(now))).toBe(false);
    // 3 in the window, 8 − 6 = 2 may stay: the oldest must leave (at now + 5 min).
    expect(minutesUntilWords(ledger.snapshot(), now)).toBe(5);
    expect(canOpenLesson(ledger.remaining(now + 5 * MIN))).toBe(true);
    expect(minutesUntilWords(ledger.snapshot(), now + 5 * MIN)).toBe(0);
  });

  it("taking a lesson's 6 words counts each once; the same lesson again takes nothing", () => {
    const now = 50 * MIN;
    const { ledger } = openLedger({ v: 1, entries: [] });
    const lesson = TRIAL_LESSONS[0]!.words.map((word) => word.text);
    for (const word of lesson) expect(ledger.take(word, now, "tinh-tu")).toBe(true);
    expect(ledger.remaining(now)).toBe(2);
    expect(lessonCounted(ledger.snapshot(), lesson, now + MIN)).toBe(true);
    for (const word of lesson) expect(ledger.take(word, now + MIN, "tinh-tu")).toBe(false);
    expect(ledger.remaining(now + MIN)).toBe(2);
    expect(lessonCounted(ledger.snapshot(), lesson, now + 21 * MIN)).toBe(false);
    expect(ledger.remaining(now + 21 * MIN)).toBe(8);
  });
});

describe("lĩnh ngộ (canon §16: 100 over the sessions)", () => {
  it("adds session scores up to 100", () => {
    let progress = NEW_PROGRESS;
    progress = addSessionScore(progress, 70);
    expect(progress).toEqual({ points: 70, sessions: 1, linhNgo: false });
    progress = addSessionScore(progress, 0);
    expect(progress).toEqual({ points: 70, sessions: 2, linhNgo: false });
    progress = addSessionScore(progress, 45);
    expect(progress).toEqual({ points: 100, sessions: 3, linhNgo: true });
  });

  it("three sessions with no key reach nothing (D40: no floor for an uncompleted session)", () => {
    let progress = NEW_PROGRESS;
    for (let at = 0; at < 3; at += 1) progress = addSessionScore(progress, 0);
    expect(progress.points).toBe(0);
  });
});
