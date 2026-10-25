// Lane 4 wards.ts (canon §9.1, §12.1, D34): r 2 m, 5 s, 3 blocks; shields bots and nodes inside its ring;
// halves a strike whose line it crosses; `ward-use` clamps at 0; every charge taken emits `ward block`.
import { describe, expect, it } from "vitest";
import { wardHalves, wardShields } from "../../src/sim/pressure";
import { blockAt, createWard, stepWards, useWard, wardAt, wardCovering, wardCrosses } from "../../src/sim/wards";
import { advance, at, makeWorld } from "./combat-fixture";

describe("a ward (canon §9.1)", () => {
  it("r 2 m, 5 s, 3 blocks at the Cast's origin; wardAt reads it", () => {
    const { world, of } = makeWorld();
    const ward = createWard(world, 0, at(1, 3));
    expect(ward).toEqual({ id: 1, seat: 0, originU: at(1, 3), radiusU: 120_000, untilTick: world.tick + 300, charges: 3 });
    expect(wardAt(world, 0)).toEqual({ wardId: 1, origin: at(1, 3), radius: 120_000, charges: 3 });
    expect(wardAt(world, 1)).toBeNull();
    expect(of("ward").map((event) => event.stage)).toEqual(["start"]);
  });

  it("`ward-use` takes one charge each, clamped at 0; a block event per charge taken", () => {
    const { world, of } = makeWorld();
    const ward = createWard(world, 0, at(0, 3));
    for (let k = 0; k < 4; k += 1) useWard(world, { type: "ward-use", seat: 0, wardId: ward.id });
    expect(ward.charges).toBe(0);
    expect(of("ward").filter((event) => event.stage === "block").map((event) => event.charges)).toEqual([2, 1, 0]);
    expect(wardAt(world, 0)).toBeNull();
    // A ward of another seat or an unknown id is refused.
    useWard(world, { type: "ward-use", seat: 0, wardId: 99 });
    expect(of("rejected").map((event) => event.reason)).toEqual(["ward"]);
  });

  it("blocks a strike on a bot or node point inside its ring, not outside", () => {
    const { world } = makeWorld();
    const node = world.formation.nodes[0]!;
    createWard(world, 0, { x: node.at.x, z: node.at.z - 60_000 });
    expect(wardCovering(world, node.at)?.id).toBe(1);
    expect(blockAt(world, node.at)).toBe(true);
    expect(blockAt(world, at(0, 3.5))).toBe(true);
    expect(blockAt(world, at(5, 5))).toBe(false);
    expect(world.wards.list[0]!.charges).toBe(1);
    // Lane 5's pressure.ts asks through wardAt: the node strike is shielded, one charge less.
    expect(wardShields(world, node.at)).toBe(true);
    expect(world.wards.list[0]!.charges).toBe(0);
    expect(wardShields(world, node.at)).toBe(false);
  });

  it("wardCrosses: the ring crosses the line a–b at the strike tick (Thiết Bối Xung halves)", () => {
    const { world } = makeWorld();
    createWard(world, 0, at(0, 4));
    // A charge line from 12 m north to the heart edge passes 4 m from the ward: no.
    expect(wardCrosses(world, 0, at(-12, -8), at(-1, -1))).toBe(false);
    // A line down x = 1.5 m passes 1.5 m from it: yes; x = 2.5 m: no.
    expect(wardCrosses(world, 0, at(1.5, -10), at(1.5, 10))).toBe(true);
    expect(wardCrosses(world, 0, at(2.5, -10), at(2.5, 10))).toBe(false);
    // The end of a short segment counts by its end point.
    expect(wardCrosses(world, 0, at(0, -5), at(0, 2.5))).toBe(true);
    expect(wardCrosses(world, 0, at(0, -5), at(0, 1.5))).toBe(false);
    expect(wardHalves(world, at(1.5, -10), at(1.5, 10))).toBe(true);
    expect(world.wards.list[0]!.charges).toBe(2);
    expect(wardCrosses(world, 1, at(1.5, -10), at(1.5, 10))).toBe(false);
  });

  it("ends after 5 s or when spent (spent late in a tick: listed until the next tick's step)", () => {
    const { world, of } = makeWorld();
    const ward = createWard(world, 0, at(0, 3));
    advance(world, 299, [stepWards]);
    expect(wardAt(world, 0)?.wardId).toBe(ward.id);
    advance(world, 2, [stepWards]);
    expect(world.wards.list).toHaveLength(0);
    expect(of("ward").map((event) => event.stage)).toEqual(["start", "end"]);
    const spent = createWard(world, 0, at(0, 3));
    stepWards(world);
    for (let k = 0; k < 3; k += 1) useWard(world, { type: "ward-use", seat: 0, wardId: spent.id });
    expect(world.wards.list).toContain(spent);
    advance(world, 1, []);
    stepWards(world);
    expect(world.wards.list).toHaveLength(0);
  });
});
