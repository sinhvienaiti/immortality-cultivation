import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/content/data/telegraphs", async () => (await import("./fakes")).telegraphData());

import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import type { EventOf, LocalState, SimEvent, TelegraphShape, Ward, World } from "../../src/content/types";
import { createLocal } from "../../src/local/player";
import { barrierReductionPm, insideShape, stepZones, strikePlayer } from "../../src/local/zones";
import { dist, mToU, msToTicks } from "../../src/sim/fixed";

/** canon §9.1 (D34), §8.2: strikes on this player, its own ward, the Kết Giới buff, knock-back. */
const stage = THANH_THACH_AI;

function fakeWorld(wards: Ward[] = [], preset: World["preset"] = "balanced", gPm = 1000): World {
  return { stage, gPm, preset, wards: { list: wards, nextId: 9 } } as unknown as World;
}

let nextId = 1;
function strike(def: string, shape: TelegraphShape, fromM: [number, number], toM: [number, number], reachM: number, widthM: number, tick = 10): EventOf<"telegraph"> {
  return {
    type: "telegraph", stage: "strike", id: nextId++, def, shape, x: fromM[0], z: fromM[1], toX: toM[0], toZ: toM[1], reachM, widthM, strikeTick: tick, answers: [], source: null, tick,
  };
}

function at(xM: number, zM: number): LocalState {
  const local = createLocal(0, stage, 1000);
  local.x = mToU(xM);
  local.z = mToU(zM);
  local.tick = 11;
  return local;
}

describe("local zones: strikes", () => {
  it("costs Sinh lực only inside the shape at the strike tick, once per telegraph", () => {
    const local = at(0, -14);
    const ring = strike("test-ring", "circle", [0, -20], [0, -15], 2, 4);
    // Outside the Kết Giới (14 m out, long left): the full 40.
    local.barrier.inside = false;
    local.barrier.joinAt = 1_000_000;
    strikePlayer(local, fakeWorld(), [ring]);
    expect(local.hp).toBe(560);
    strikePlayer(local, fakeWorld(), [ring]);
    expect(local.hp).toBe(560);
    strikePlayer(local, fakeWorld(), [strike("test-ring", "circle", [0, -20], [5, -15], 2, 4)]);
    expect(local.hp).toBe(560);
    expect(local.events).toMatchObject([{ type: "player-hit", seat: 0, amount: 40, blocked: false }]);
  });

  it("scales by g(K) and the preset, and the Kết Giới takes 10 % off inside", () => {
    const inside = at(0, 2);
    strikePlayer(inside, fakeWorld([], "challenge", 1120), [strike("test-ring", "circle", [0, -5], [0, 2], 2, 4)]);
    // 40 × 1.12 = 45 (half up), × 1.2 = 54, −10 % = 49 (48.6 half up).
    expect(inside.hp).toBe(600 - 49);
  });

  it("uses the shield first, and nothing hurts a player who is down", () => {
    const local = at(0, -14);
    local.barrier.inside = false;
    local.barrier.joinAt = 1_000_000;
    local.shield = 25;
    strikePlayer(local, fakeWorld(), [strike("test-ring", "circle", [0, -20], [0, -14], 2, 4)]);
    expect([local.shield, local.hp]).toEqual([0, 585]);
    local.down = true;
    strikePlayer(local, fakeWorld(), [strike("test-ring", "circle", [0, -20], [0, -14], 2, 4)]);
    expect(local.hp).toBe(585);
  });

  it("blocks with its own ward with a charge and sends ward-use, one charge per hit", () => {
    const ward: Ward = { id: 4, seat: 0, originU: { x: 0, z: mToU(-14) }, radiusU: mToU(2), untilTick: 300, charges: 1 };
    const other: Ward = { id: 5, seat: 1, originU: { x: 0, z: mToU(-14) }, radiusU: mToU(2), untilTick: 300, charges: 3 };
    const local = at(0, -13);
    local.barrier.inside = false;
    local.barrier.joinAt = 1_000_000;
    const two = [strike("test-ring", "circle", [0, -20], [0, -13], 2, 4), strike("test-cell", "cell", [0, -20], [0, -13], 3, 3)];
    strikePlayer(local, fakeWorld([ward, other]), two);
    expect(local.outbox).toEqual([{ type: "ward-use", seat: 0, wardId: 4 }]);
    // The first hit was blocked, the second (no charge left) went through: 30.
    expect(local.hp).toBe(570);
    expect(local.events.map((e) => (e.type === "player-hit" ? e.blocked : null))).toEqual([true, false]);
  });

  it("is still blocked when the world spent the ward's last charge in the same tick (canon §9.1)", () => {
    const ward: Ward = { id: 6, seat: 0, originU: { x: 0, z: 0 }, radiusU: mToU(2), untilTick: 300, charges: 0 };
    const local = at(0, 1);
    const block: SimEvent = { type: "ward", stage: "block", wardId: 6, seat: 0, origin: { x: 0, z: 0 }, charges: 0, tick: 10 };
    strikePlayer(local, fakeWorld([ward]), [block, strike("test-ring", "circle", [0, -5], [0, 1], 2, 4)]);
    expect(local.hp).toBe(600);
    expect(local.outbox).toEqual([{ type: "ward-use", seat: 0, wardId: 6 }]);
    // A ward that ran out earlier (no block this tick) does not block.
    const later = at(0, 1);
    strikePlayer(later, fakeWorld([ward]), [strike("test-ring", "circle", [0, -5], [0, 1], 2, 4)]);
    expect(later.hp).toBeLessThan(600);
  });

  it("knocks the player 3 m off a line, unless Lưu Quang Bộ makes it unpushable", () => {
    const local = at(1, -10);
    local.barrier.inside = false;
    local.barrier.joinAt = 1_000_000;
    strikePlayer(local, fakeWorld(), [strike("test-line", "line", [0, -20], [0, 0], 20, 2)]);
    expect(local.hp).toBe(540);
    expect(local.x).toBe(mToU(4));
    expect(local.z).toBe(mToU(-10));
    const dashing = at(-0.5, -10);
    dashing.dashUntil = 30;
    strikePlayer(dashing, fakeWorld(), [strike("test-line", "line", [0, -20], [0, 0], 20, 2)]);
    expect([dashing.x, dashing.z]).toEqual([mToU(-0.5), mToU(-10)]);
  });
});

describe("local zones: shapes (types.ts telegraph event)", () => {
  const cone = strike("test-cone", "cone", [0, 0], [0, -10], 6, 6);
  const line = strike("test-line", "line", [0, 0], [10, 0], 8, 2);
  const cell = strike("test-cell", "cell", [0, 0], [5, 5], 3, 3);
  it.each([
    [cone, 0, -5900, true],
    [cone, 2900, -5900, true],
    [cone, 2000, -2000, false],
    [cone, 0, 100, false],
    [cone, 0, -6100, false],
    [line, 7900, 900, true],
    [line, 8100, 0, false],
    [line, 4000, -1100, false],
    [line, -100, 0, false],
    [cell, 6400, 3600, true],
    [cell, 6600, 5000, false],
  ] as const)("%#", (event, xMm, zMm, inside) => {
    expect(insideShape(event, xMm, zMm)).toBe(inside);
  });
});

describe("local zones: Kết Giới buff (canon §8.2)", () => {
  it("keeps −10 % for 1.5 s after leaving, fades over 3 s, rejoins after 1 s, never stacks", () => {
    const local = at(0, 3);
    const world = fakeWorld();
    expect(barrierReductionPm(local)).toBe(100);
    // Step out at tick 100.
    local.tick = 100;
    local.z = mToU(10);
    stepZones(local, world);
    expect(local.barrier.inside).toBe(false);
    expect(barrierReductionPm(local, 100 + msToTicks(1500) - 1)).toBe(100);
    expect(barrierReductionPm(local, 100 + msToTicks(1500) + msToTicks(1500))).toBe(50);
    expect(barrierReductionPm(local, 100 + msToTicks(4500))).toBe(0);
    // Back in at 400 (faded out): it joins after 1 s.
    local.tick = 400;
    local.z = mToU(3);
    stepZones(local, world);
    expect(barrierReductionPm(local, 400)).toBe(0);
    expect(barrierReductionPm(local, 400 + msToTicks(1000))).toBe(100);
    // Out and in again within the grace: no gap, no more than 10 %.
    local.tick = 500;
    local.z = mToU(10);
    stepZones(local, world);
    local.tick = 520;
    local.z = mToU(3);
    stepZones(local, world);
    for (let tick = 520; tick < 900; tick += 20) expect(barrierReductionPm(local, tick)).toBe(100);
    expect(dist(local.x, local.z, 0, 0)).toBeLessThan(mToU(9));
  });
});
