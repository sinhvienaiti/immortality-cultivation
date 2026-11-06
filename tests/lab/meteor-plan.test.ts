import { describe, expect, it } from "vitest";
import { blastsAt, MAX_BLASTS, planShower, SHOWER } from "../../src/lab/meteor-plan";

describe("the meteor shower's plan (meteor-plan.ts; owner 06/11 12:50, 12:52)", () => {
  it("lands 18–24 meteors 0.2–0.4 s apart, dense in the middle, over about 6 s from the first, never more than MAX_BLASTS blasts at once", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const p = planShower(seed);
      const n = p.landAt.length;
      expect(n).toBeGreaterThanOrEqual(SHOWER.min);
      expect(n).toBeLessThanOrEqual(SHOWER.max);
      expect(p.landAt[0]).toBe(SHOWER.firstS);
      const gaps = p.landAt.slice(1).map((x, k) => x - p.landAt[k]!);
      for (const g of gaps) {
        expect(g).toBeGreaterThanOrEqual(SHOWER.gapMin - 1e-9);
        expect(g).toBeLessThanOrEqual(SHOWER.gapMax + 1e-9);
      }
      const span = p.landAt[n - 1]! - p.landAt[0]!;
      expect(span).toBeGreaterThan(5);
      expect(span).toBeLessThanOrEqual(SHOWER.spanS + SHOWER.gapMax);
      // Denser in the middle third than in the outer thirds.
      const third = Math.floor(gaps.length / 3);
      const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
      expect(mean(gaps.slice(third, gaps.length - third))).toBeLessThan(mean([...gaps.slice(0, third), ...gaps.slice(gaps.length - third)]));
      for (const at of p.landAt) expect(blastsAt(p, at + 1e-6)).toBeLessThanOrEqual(MAX_BLASTS);
    }
  });

  it("opens on a big one, ends on the king (into a group), ~30 % big and ~60 % on groups", () => {
    let big = 0;
    let cluster = 0;
    let all = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const p = planShower(seed);
      expect(p.cls[0]).toBe("big");
      expect(p.cls.at(-1)).toBe("king");
      expect(p.cls.filter((c) => c === "king").length).toBe(1);
      expect(p.cluster.at(-1)).toBe(true);
      big += p.cls.filter((c) => c === "big" || c === "king").length;
      cluster += p.cluster.filter(Boolean).length;
      all += p.cls.length;
    }
    expect(big / all).toBeGreaterThan(0.25);
    expect(big / all).toBeLessThan(0.4);
    expect(cluster / all).toBeGreaterThan(0.55);
    expect(cluster / all).toBeLessThan(0.65);
  });

  it("is the same shower from the same seed", () => {
    expect(planShower(7)).toEqual(planShower(7));
  });
});
