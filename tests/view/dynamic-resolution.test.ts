import { describe, expect, it } from "vitest";
import { DYNAMIC_RES } from "../../src/content/rules";
import { DynamicResolution } from "../../src/view/dynamic-resolution";

const RULE = { ...DYNAMIC_RES, minDpr: 1 };
/** Feeds `seconds` of frames at `ms` each; returns how many times the ratio changed. */
const run = (gov: DynamicResolution, ms: number, seconds: number): number => {
  let changes = 0;
  for (let t = 0; t < seconds * 1000; t += ms) if (gov.frame(ms)) changes += 1;
  return changes;
};

describe("dynamic resolution (canon D57)", () => {
  it("starts halfway between the floor and the ceiling, snapped to the step", () => {
    expect(new DynamicResolution(RULE, 2).pixelRatio).toBe(1.5);
    expect(new DynamicResolution(RULE, 1.25).pixelRatio).toBe(1.25);
  });

  it("steps down while frames run late, to the floor and no further", () => {
    const gov = new DynamicResolution(RULE, 2);
    run(gov, 1000 / 60, 2); // learn the 60 Hz refresh
    run(gov, 30, 6);
    expect(gov.pixelRatio).toBe(1);
  });

  it("counts a frame rate stuck under 60 Hz as late even with no faster frame seen", () => {
    const gov = new DynamicResolution(RULE, 2);
    run(gov, 33, 3);
    expect(gov.pixelRatio).toBeLessThan(1.5);
  });

  it("climbs to the ceiling on clean 60 and 120 Hz frames, one step per 3 clean windows", () => {
    for (const ms of [1000 / 60, 1000 / 120]) {
      const gov = new DynamicResolution(RULE, 2);
      run(gov, ms, 3.2);
      expect(gov.pixelRatio).toBe(1.75);
      run(gov, ms, 3.2);
      expect(gov.pixelRatio).toBe(2);
    }
  });

  it("holds after a drop instead of oscillating", () => {
    const gov = new DynamicResolution(RULE, 2);
    run(gov, 1000 / 60, 1);
    run(gov, 30, 1.2);
    const dropped = gov.pixelRatio;
    run(gov, 1000 / 60, 6); // clean, but inside the 8 s hold
    expect(gov.pixelRatio).toBe(dropped);
    run(gov, 1000 / 60, 6);
    expect(gov.pixelRatio).toBeGreaterThan(dropped);
  });

  it("ignores pauses (hidden tab) and keeps the ratio inside a new ceiling", () => {
    const gov = new DynamicResolution(RULE, 2);
    expect(gov.frame(1000)).toBe(false);
    gov.setMax(1.25);
    expect(gov.pixelRatio).toBe(1.25);
  });
});
