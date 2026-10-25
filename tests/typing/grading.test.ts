import { describe, expect, it } from "vitest";
import { GRADE } from "../../src/content/rules";
import { newSkillProfile, updateSkill, type SkillProfile } from "../../src/kit/balance/profile";
import { activityFor, capProfileDrop, eEffX1000, expectedTicks, flashEX1000, gradeOf, mqPm, profileTrusted } from "../../src/typing/grading";

/** canon §6.5, §6.6, §17, D41: grades, Chớp against the player's own profile, the profile cap. */

describe("word grades (canon §6.5)", () => {
  const t = expectedTicks(5, 35_000);
  it("grades Chớp, Hoàn hảo, Tốt, Vừa, Ẩu", () => {
    expect(gradeOf({ errors: 0, letters: 5, keyTicks: Math.floor((t * 85) / 100), expectedTicks: t })).toBe("flash");
    expect(gradeOf({ errors: 0, letters: 5, keyTicks: t, expectedTicks: t })).toBe("perfect");
    expect(gradeOf({ errors: 1, letters: 6, keyTicks: 1, expectedTicks: t })).toBe("good");
    expect(gradeOf({ errors: 1, letters: 5, keyTicks: 1, expectedTicks: t })).toBe("ok");
    expect(gradeOf({ errors: 2, letters: 8, keyTicks: 1, expectedTicks: t })).toBe("sloppy");
    expect([mqPm("flash"), mqPm("perfect"), mqPm("good"), mqPm("ok"), mqPm("sloppy")]).toEqual([1250, 1100, 1000, 900, 600]);
  });

  it("gives 25 and 60 WPM typists who type evenly at their own speed the same Chớp (canon §6.5)", () => {
    for (const wpm of [25, 60]) {
      const e = eEffX1000({ e: wpm, a: 950, cv: 250 });
      for (const letters of [3, 5, 8]) {
        const expected = expectedTicks(letters, e);
        // This typist's own pace is 12 (ℓ − 1) / E_eff seconds; 5 % quicker is Chớp, 10 % slower is not, at any speed.
        const own = (12 * (letters - 1) * 60 * 1000) / e;
        expect(gradeOf({ errors: 0, letters, keyTicks: Math.round(own * 0.95), expectedTicks: expected })).toBe("flash");
        expect(gradeOf({ errors: 0, letters, keyTicks: Math.round(own * 1.1), expectedTicks: expected })).toBe("perfect");
      }
    }
  });

  it("t_expected = 12 (ℓ − 1) / (E × 0.86) s in ticks, rounded half up; E_eff from the profile", () => {
    expect(expectedTicks(5, 35_000)).toBe(96);
    expect(expectedTicks(1, 35_000)).toBe(0);
    expect(expectedTicks(5, 0)).toBe(0);
    // 35 × (0.6 + 0.4 × 0.95²) × (1 − 0.5 × 0.25) = 29.43 WPM.
    expect(eEffX1000({ e: 35, a: 950, cv: 250 })).toBe(29_431);
  });
});

describe("the Chớp floor and the profile cap (canon §6.5, D41)", () => {
  it("never lets a slow session lower the Chớp E under the median of the last 5", () => {
    expect(flashEX1000(30_000, [])).toBe(30_000);
    expect(flashEX1000(20_000, [30_000, 31_000, 29_000, 30_500, 30_200])).toBe(30_200);
    expect(flashEX1000(40_000, [30_000, 31_000])).toBe(40_000);
    expect(flashEX1000(20_000, [10_000, 50_000, 30_000, 30_000, 30_000, 30_000])).toBe(30_000);
  });

  const trusted = (): SkillProfile => {
    let profile = newSkillProfile();
    for (let k = 0; k < 3; k += 1) profile = updateSkill(profile, { outcome: "won", words: 30, wpm: 40 }).profile;
    return profile;
  };

  it("caps a drop at 10 % a session once ≥ 60 words over ≥ 3 sessions", () => {
    const before = trusted();
    expect(profileTrusted(before)).toBe(true);
    const after = updateSkill(before, { outcome: "won", words: 30, wpm: 20 }).profile;
    expect(after.measures.e.value).toBeLessThan(before.measures.e.value * 0.9);
    const capped = capProfileDrop(before, after);
    expect(capped.measures.e.value).toBeCloseTo(before.measures.e.value * (1 - GRADE.downCapPct / 100), 9);
    expect(capped.measures.e.n).toBe(after.measures.e.n);
  });

  it("never caps a rise, nor anything while trust is low", () => {
    const before = trusted();
    const up = updateSkill(before, { outcome: "won", words: 30, wpm: 90 }).profile;
    expect(capProfileDrop(before, up)).toBe(up);
    const young = updateSkill(newSkillProfile(), { outcome: "won", words: 20, wpm: 60 }).profile;
    expect(profileTrusted(young)).toBe(false);
    const down = updateSkill(young, { outcome: "won", words: 20, wpm: 15 }).profile;
    expect(capProfileDrop(young, down)).toBe(down);
  });
});

describe("activity types (canon §17)", () => {
  it("maps slots and Tẩy to typing-skill, an Ấn to typing-elite or typing-boss", () => {
    expect(activityFor("slot", false)).toBe("typing-skill");
    expect(activityFor("cleanse", false)).toBe("typing-skill");
    expect(activityFor("seal", false)).toBe("typing-elite");
    expect(activityFor("seal", true)).toBe("typing-boss");
  });
});
