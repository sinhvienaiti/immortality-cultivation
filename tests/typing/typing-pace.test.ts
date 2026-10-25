import { describe, expect, it } from "vitest";
import { PACE } from "../../src/content/rules";
import type { SimEvent } from "../../src/content/types";
import { newSkillProfile, updateSkill } from "../../src/kit/balance/profile";
import { loadSkill, saveKey } from "../../src/app/storage";
import {
  PACE_MEMORY_KEY, PaceMeter, finishMatch, flashFloorFor, paceChoices, paceUpdateAfterWave1, profileAt, readPaceMemory, startingProfile, wpmFromSearch,
} from "../../src/app/typing-pace";
import { eEffX1000 } from "../../src/typing/grading";

/** canon §6.5, §7.5, D18, D41: the player's speed, its measure, the profile cap and the Chớp floor. */

const keyStore = () => {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => (map.set(key, value), true) };
};
const jsonStore = () => {
  const map = new Map<string, unknown>();
  return { map, readJson: (key: string) => map.get(key) ?? null, writeJson: (key: string, value: unknown) => (map.set(key, JSON.parse(JSON.stringify(value))), true) };
};

/** `count` words of `letters` letters typed evenly at E WPM (t = 12 (ℓ − 1) / (0.86 E) s). */
function evenWords(count: number, letters: number, wpm: number): SimEvent[] {
  const ms = (12 * (letters - 1) * 1000) / (0.86 * wpm);
  return Array.from({ length: count }, (_, k) => ({
    type: "word-complete", tick: k, seat: 0, word: 0, wordId: "w" + k, text: "x".repeat(letters), grade: "perfect", errors: 0, keyTicks: 0, responseMs: ms,
    activity: "typing-skill", scored: true, hintUsed: false, channel: "typing",
  }));
}

describe("the starting speed (D18): never a silent 35", () => {
  it("takes ?wpm= first, then the measured profile, else asks", () => {
    expect(wpmFromSearch("?wpm=42")).toBe(42);
    expect(wpmFromSearch("?wpm=abc")).toBeNull();
    expect(wpmFromSearch("?wpm=999")).toBe(150);
    expect(startingProfile("?wpm=40")).toEqual({ e: 40, a: PACE.defaultAccuracyPm, cv: PACE.defaultCvPm });
    expect(startingProfile("")).toBeNull();
    expect(startingProfile("", newSkillProfile())).toBeNull();
    const measured = updateSkill(newSkillProfile(), { outcome: "won", words: 60, wpm: 48, keys: 400, correctKeys: 380, cv: 0.2 }).profile;
    expect(startingProfile("", measured)).toEqual({ e: 48, a: 950, cv: 200 });
  });

  it("offers 'chưa biết' at 25 WPM before the presets, the measured speed first when there is one", () => {
    const fresh = paceChoices(null, 45);
    expect(fresh.choices[0]).toMatchObject({ label: "Chưa biết", unknown: true, profile: { e: PACE.unknownWpm } });
    expect(fresh.choices[fresh.selected]!.profile.e).toBe(45);
    const measured = updateSkill(newSkillProfile(), { outcome: "won", words: 60, wpm: 52 }).profile;
    const rows = paceChoices(measured).choices;
    expect(rows[0]).toMatchObject({ measured: true, profile: { e: 52 } });
    expect(rows[1]!.unknown).toBe(true);
  });
});

describe("measuring and pace-update after wave 1 (canon §6.5, D41)", () => {
  it("measures E from finished words with the grades' t_expected", () => {
    const meter = new PaceMeter();
    meter.onEvents(evenWords(10, 5, 35));
    expect(meter.wpm).toBeCloseTo(35, 6);
    expect(meter.cv).toBeCloseTo(0, 9);
    expect(meter.sample("won", { keys: 60, wrongKeys: 3, strayKeys: 0 }, 0.9)).toMatchObject({ words: 10, correctKeys: 57, safety: 0.9 });
  });

  it("re-measures k after wave 1 of an unknown profile, from wave 1's words only", () => {
    const meter = new PaceMeter();
    meter.onEvents(evenWords(5, 5, 60));
    expect(paceUpdateAfterWave1(meter, 0, profileAt(25), { keys: 30, wrongKeys: 0, strayKeys: 0 }, () => 1000)).toBeNull();
    meter.onEvents(evenWords(5, 5, 60));
    const seen: number[] = [];
    const command = paceUpdateAfterWave1(meter, 0, profileAt(25), { keys: 50, wrongKeys: 1, strayKeys: 1 }, (profile) => (seen.push(profile.e, profile.a), 1234));
    expect(command).toEqual({ type: "pace-update", seat: 0, kPm: 1234 });
    expect(seen).toEqual([60, 960]);
  });
});

describe("after a match: the profile and the Chớp floor (canon §6.5, D41)", () => {
  it("saves the profile, caps a drop at 10 % once trusted, and keeps 5 sessions for the floor", () => {
    const store = keyStore();
    const memory = jsonStore();
    const options = { audience: "adult" as const, mode: "balanced" as const, nowMs: 0, store, memoryStore: memory };
    for (let k = 0; k < 3; k += 1) expect(finishMatch({ outcome: "won", words: 30, wpm: 40 }, options).accepted).toBe(true);
    const trusted = loadSkill("adult", "balanced", store);
    expect(trusted.measures.e.n).toBe(90);
    // 20 WPM is no outlier (≥ 0.4 E) but would pull E down 12.5 %: capped at 10 %.
    const after = finishMatch({ outcome: "won", words: 30, wpm: 20 }, options).profile;
    expect(after.measures.e.value).toBeCloseTo(trusted.measures.e.value * 0.9, 9);
    expect(readPaceMemory(memory).sessionsEX1000).toHaveLength(4);
    for (let k = 0; k < 3; k += 1) finishMatch({ outcome: "won", words: 30, wpm: 40 }, options);
    expect(readPaceMemory(memory).sessionsEX1000).toHaveLength(5);
    expect(finishMatch(null, options).accepted).toBe(false);
    expect(memory.map.has(PACE_MEMORY_KEY)).toBe(true);
  });

  it("never lets a slow session lower the Chớp E under the last sessions' median", () => {
    const memory = { v: 1 as const, sessionsEX1000: [30_000, 31_000, 29_000], lastPick: null };
    const slow = profileAt(20);
    expect(flashFloorFor(slow, memory)).toBe(30_000);
    const fast = profileAt(60);
    expect(flashFloorFor(fast, memory)).toBe(eEffX1000(fast));
  });

  it("reads the stored profile back through storage.ts", () => {
    const store = keyStore();
    const profile = updateSkill(newSkillProfile(), { outcome: "won", words: 20, wpm: 33 }).profile;
    saveKey("skill", profile, 0, store);
    expect(loadSkill("adult", "balanced", store).measures.e.value).toBeCloseTo(33, 9);
  });
});
