import { describe, expect, it } from "vitest";
import { clamp, dist, isqrt, mToU, msToTicks, mulDiv, pct, pm, stepTowards, ticksToMs, uToM, unitPm, within } from "../../src/sim/fixed";

/** canon §7.1, §7.2 (D38): integer helpers, half-up rounding at every step. */
describe("sim/fixed", () => {
  it("converts metres, millimetres and milliseconds", () => {
    expect(mToU(1)).toBe(60_000);
    expect(mToU(-0.1)).toBe(-6000);
    expect(Object.is(mToU(-0), 0)).toBe(true);
    expect(uToM(90_000)).toBe(1.5);
    expect(msToTicks(1500)).toBe(90);
    expect(msToTicks(600)).toBe(36);
    expect(msToTicks(8)).toBe(0);
    expect(msToTicks(9)).toBe(1);
    expect(ticksToMs(90)).toBe(1500);
  });

  it("rounds a × b / c half up, for both signs, without −0", () => {
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(3, 1, 2)).toBe(2);
    expect(mulDiv(-5, 1, 2)).toBe(-2);
    expect(mulDiv(-3, 1, 2)).toBe(-1);
    expect(mulDiv(100, 600, 1000)).toBe(60);
    expect(mulDiv(90, 1250, 1000)).toBe(113);
    expect(Object.is(mulDiv(-1, 1, 4), 0)).toBe(true);
    // Exact far past 2^31.
    expect(mulDiv(3_000_000_000, 7, 3)).toBe(7_000_000_000);
    expect(pm(1000, 333)).toBe(333);
    expect(pct(600, 25)).toBe(150);
  });

  it("takes integer square roots", () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 2 ** 40, 2 ** 40 - 1, 9_007_199_254_740_000]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    expect(isqrt(-5)).toBe(0);
    expect(dist(0, 0, 3 * 60_000, 4 * 60_000)).toBe(5 * 60_000);
    expect(within(0, 0, 3, 4, 5)).toBe(true);
    expect(within(0, 0, 3, 4, 4)).toBe(false);
    expect(clamp(5, 0, 3)).toBe(3);
  });

  it("steps towards a point and gives unit vectors in ‰", () => {
    const out = { x: 0, z: 0 };
    expect(stepTowards(0, 0, 300, 400, 100, out)).toBe(400);
    expect(out).toEqual({ x: 60, z: 80 });
    expect(stepTowards(0, 0, 30, 40, 100, out)).toBe(0);
    expect(out).toEqual({ x: 30, z: 40 });
    unitPm(3, 4, out);
    expect(out).toEqual({ x: 600, z: 800 });
    unitPm(0, 0, out);
    expect(out).toEqual({ x: 0, z: 0 });
  });
});
