import { describe, expect, it } from "vitest";
import { rectUnionArea } from "../../src/ui/coverage";

describe("DOM coverage union", () => {
  it("counts nested/overlapping panels once and includes disjoint notices", () => {
    expect(rectUnionArea([])).toBe(0);
    expect(rectUnionArea([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 10, y: 10, w: 10, h: 10 },
      { x: 50, y: 50, w: 100, h: 100 },
      { x: 200, y: 0, w: 20, h: 20 },
    ])).toBe(17_900);
  });
});
