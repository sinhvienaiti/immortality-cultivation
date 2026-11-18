import { expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { createNavGrid, findPath, reachableCount } from "../../src/local/nav";
import { cellAt, laneDistanceSqMm } from "../../src/sim/field";
import { mmToU } from "../../src/sim/fixed";

it("keeps every slot and Tâm nhãn reachable across the entire player field", () => {
  const stage = THANH_THACH_AI;
  const grid = createNavGrid(stage);
  const from = { x: 0, z: 0 };
  expect(reachableCount(grid, cellAt(grid, 0, 0))).toBe(grid.blocked.length - grid.blocked.reduce((a, b) => a + b, 0));
  for (const target of [...stage.field.mechSlots, ...stage.field.nodes]) {
    const to = { x: mmToU(target.at.xMm), z: mmToU(target.at.zMm) };
    expect(grid.blocked[cellAt(grid, to.x, to.z)]).toBe(0);
    const path = findPath(grid, from, to);
    expect(path.at(-1)).toEqual(to);
  }
  for (const slot of stage.field.mechSlots.filter((s) => s.kind === "strip")) {
    expect(laneDistanceSqMm(slot.at.xMm, slot.at.zMm, stage.field.lane!.pointsMm)).toBeLessThanOrEqual(2000 * 2000);
    expect(slot.alongPm).toBeDefined();
  }
});
