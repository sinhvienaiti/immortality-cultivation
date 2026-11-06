import { describe, expect, it } from "vitest";
import { STREAK_TIERS, streakTier } from "../../src/lab/streak-counter";

describe("the lab's word-streak counter (canon D60)", () => {
  it("rises a tier at 10, 25, 50 and 100 clean words", () => {
    expect(STREAK_TIERS).toEqual([0, 10, 25, 50, 100]);
    expect([0, 1, 9, 10, 24, 25, 49, 50, 99, 100, 250].map(streakTier)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
