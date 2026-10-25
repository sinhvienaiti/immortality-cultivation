import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { PLAYER } from "../../src/content/rules";
import type { LocalState } from "../../src/content/types";
import { applyLocalInput } from "../../src/local/input";
import { createNavGrid, findPath, reachableCount } from "../../src/local/nav";
import { createLocal, playerPos, resolveBody, stepMove } from "../../src/local/player";
import { cellAt } from "../../src/sim/field";
import { dist, mToU, mmToU, within } from "../../src/sim/fixed";

/** canon §9.1, §5.1: the player body, arrows, right-click paths; collides with terrain and the Trận Trụ, never with beasts. */
const stage = THANH_THACH_AI;
const RADIUS_U = mmToU(PLAYER.radiusMm);

function walk(local: LocalState, ticks: number): void {
  for (let k = 0; k < ticks; k += 1) {
    stepMove(local, stage);
    local.tick += 1;
  }
}

function clearOfPillars(local: LocalState): boolean {
  return stage.field.pillars.every((pillar) => !within(local.x, local.z, mmToU(pillar.at.xMm), mmToU(pillar.at.zMm), mmToU(pillar.radiusMm) + RADIUS_U - 1));
}

describe("local player body", () => {
  it("starts on the Tâm nhãn with 600 × g(K) Sinh lực", () => {
    const local = createLocal(0, stage, 1000);
    expect(playerPos(local)).toEqual({ x: 0, z: mToU(3) });
    expect([local.hp, local.hpMax, local.shield, local.down]).toEqual([600, 600, 0, false]);
    expect(createLocal(0, stage, 1120).hpMax).toBe(672);
  });

  it("walks 5 m/s with the arrows in screen directions (up is north, −z) and stops on release", () => {
    const local = createLocal(0, stage, 1000);
    applyLocalInput(local, { type: "arrows", mask: 8 }, stage);
    walk(local, 60);
    expect(playerPos(local)).toEqual({ x: mToU(5), z: mToU(3) });
    applyLocalInput(local, { type: "arrows", mask: 1 }, stage);
    walk(local, 30);
    expect(local.z).toBe(mToU(0.5));
    expect([local.facingX, local.facingZ]).toEqual([0, -1000]);
    // Up + left: the diagonal at 5 m/s (707 ‰ each way); up + down cancel.
    applyLocalInput(local, { type: "arrows", mask: 1 | 4 }, stage);
    walk(local, 1);
    expect(Math.abs(dist(local.x, local.z, mToU(5), mToU(0.5)) - PLAYER.speedMmPerS)).toBeLessThanOrEqual(2);
    applyLocalInput(local, { type: "arrows", mask: 1 | 2 }, stage);
    const before = playerPos(local);
    walk(local, 10);
    expect(playerPos(local)).toEqual(before);
    applyLocalInput(local, { type: "arrows", mask: 0 }, stage);
    walk(local, 10);
    expect(playerPos(local)).toEqual(before);
  });

  it("collides with the Trận Trụ and the field's edge, not with anything else", () => {
    const local = createLocal(0, stage, 1000);
    const pillar = stage.field.pillars[0]!;
    // Stand south of the west pillar and walk north into it.
    local.x = mmToU(pillar.at.xMm);
    local.z = mmToU(pillar.at.zMm) + mToU(3);
    applyLocalInput(local, { type: "arrows", mask: 1 }, stage);
    for (let k = 0; k < 120; k += 1) {
      walk(local, 1);
      expect(clearOfPillars(local)).toBe(true);
    }
    // Held against the edge of the field.
    const edge = createLocal(0, stage, 1000);
    applyLocalInput(edge, { type: "arrows", mask: 2 }, stage);
    walk(edge, 600);
    expect(edge.z).toBe(mmToU(stage.field.maxZMm) - RADIUS_U);
    const out = { x: 0, z: 0 };
    resolveBody(stage, mmToU(stage.field.minXMm) - mToU(5), 0, out);
    expect(out).toEqual({ x: mmToU(stage.field.minXMm) + RADIUS_U, z: 0 });
  });

  it("follows a right-click path round a pillar to the point, and arrows take over", () => {
    const local = createLocal(0, stage, 1000);
    const pillar = stage.field.pillars[0]!;
    // From south-east of the west pillar to its far side.
    local.x = mmToU(pillar.at.xMm) + mToU(2);
    local.z = mmToU(pillar.at.zMm) + mToU(2);
    const goal = { x: mmToU(pillar.at.xMm) - mToU(2), z: mmToU(pillar.at.zMm) - mToU(2) };
    applyLocalInput(local, { type: "move-to", point: goal }, stage);
    expect(local.moveTarget).toEqual(goal);
    expect(local.path.length).toBeGreaterThan(1);
    for (let k = 0; k < 300 && local.path.length > 0; k += 1) {
      walk(local, 1);
      expect(clearOfPillars(local)).toBe(true);
    }
    expect(playerPos(local)).toEqual(goal);
    expect(local.moveTarget).toBeNull();
    applyLocalInput(local, { type: "move-to", point: { x: 0, z: 0 } }, stage);
    applyLocalInput(local, { type: "arrows", mask: 8 }, stage);
    expect(local.path).toEqual([]);
    expect(local.moveTarget).toBeNull();
  });

  it("paths to the nearest open spot of a blocked point, over one connected field", () => {
    const grid = createNavGrid(stage);
    const pillar = stage.field.pillars[1]!;
    const into = { x: mmToU(pillar.at.xMm), z: mmToU(pillar.at.zMm) };
    const path = findPath(grid, { x: 0, z: mToU(3) }, into);
    expect(path.length).toBeGreaterThan(0);
    const end = path.at(-1)!;
    expect(grid.blocked[cellAt(grid, end.x, end.z)]).toBe(0);
    expect(dist(end.x, end.z, into.x, into.z)).toBeLessThan(mToU(2));
    const open = grid.blocked.reduce((sum, cell) => sum + (cell === 0 ? 1 : 0), 0);
    expect(reachableCount(grid, cellAt(grid, 0, mToU(3)))).toBe(open);
    expect(findPath(grid, { x: 0, z: 0 }, { x: 0, z: 0 })).toEqual([{ x: 0, z: 0 }]);
  });
});
