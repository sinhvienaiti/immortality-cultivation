import { describe, expect, it } from "vitest";
import { PACE } from "../../src/content/rules";
import { C_REF, meanLength, paceFor, scaleTicks } from "../../src/sim/pace";

/** canon §7.5: k = clamp(C(E_eff) / C_ref; 0.75; 1.30), k only scales time. */
describe("sim/pace", () => {
  it("takes C_ref from the Chuẩn bot (≈ 19.6 words a minute) so its k is exactly 1", () => {
    expect(Math.round(C_REF * 10)).toBe(PACE.cRefX10);
    expect(paceFor({ e: 35, a: 950, cv: 250 }).kPm).toBe(1000);
  });

  it("clamps slow and fast typists to 0.75–1.30 and rises with E inside each ℓ̄ band", () => {
    expect(paceFor({ e: 15, a: 880, cv: 400 }).kPm).toBe(750);
    expect(paceFor({ e: 90, a: 970, cv: 150 }).kPm).toBe(1300);
    expect(paceFor({ e: 0, a: 950, cv: 250 })).toMatchObject({ kPm: 750, wordTicks: 0 });
    // canon §7.5 takes ℓ̄ by the band of E (§6.3): at 45 WPM words grow from 4.5 to 5.5 letters, so C(E) and k
    // step down there by the formula itself (40 WPM ≈ 1.12, 45 WPM ≈ 1.07); inside a band k never falls.
    let last = 0;
    let band = meanLength(15);
    for (let e = 15; e <= 90; e += 1) {
      const k = paceFor({ e, a: 950, cv: 250 }).kPm;
      if (meanLength(e) !== band) {
        band = meanLength(e);
        last = 0;
      }
      expect(k).toBeGreaterThanOrEqual(last);
      expect(k).toBeGreaterThanOrEqual(PACE.kMinPm);
      expect(k).toBeLessThanOrEqual(PACE.kMaxPm);
      last = k;
    }
    // "Chưa biết" plays at 25 WPM (D18): slower than the reference.
    expect(paceFor({ e: PACE.unknownWpm, a: 950, cv: 250 }).kPm).toBeLessThan(1000);
  });

  it("gives one word's time at E_eff (≈ 3.06 s for the Chuẩn bot) and ℓ̄ by the band of E", () => {
    const pace = paceFor({ e: 35, a: 950, cv: 250 });
    expect(pace.wordTicks).toBe(Math.round(3600 / C_REF));
    expect(Math.abs(pace.eEffX1000 - 29_434)).toBeLessThanOrEqual(5);
    expect([meanLength(30), meanLength(45), meanLength(64), meanLength(65), meanLength(90)]).toEqual([4.5, 5.5, 5.5, 6, 6]);
  });

  it("scales ticks by 1 / k in integers, never under one tick", () => {
    expect(scaleTicks(600, 1000)).toBe(600);
    expect(scaleTicks(600, 750)).toBe(800);
    expect(scaleTicks(600, 1300)).toBe(462);
    expect(scaleTicks(0, 1000)).toBe(1);
    expect(scaleTicks(90, 0)).toBe(90);
  });
});
