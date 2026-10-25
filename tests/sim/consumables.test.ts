// Lane 4 consumables.ts (canon §12.3, D34): counts, one shared 8 s cooldown, not while down, `consumable{seat, kind}`;
// Lôi Hỏa Phù on the world (1.6 W magic in r 3 m at the cursor or the densest cluster in 14 m, cluster cap 60 %);
// Hồi Xuân Đan and Kim Thân Phù touch nothing in the world (local/consumables.ts applies them).
import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import type { World } from "../../src/content/types";
import { onConsumable } from "../../src/local/consumables";
import { createLocal } from "../../src/local/index";
import { useConsumable } from "../../src/sim/consumables";
import { hashWorldHex } from "../../src/sim/hash";
import { addBeast, addCluster, at, makeWorld } from "./combat-fixture";

function stock(world: World, slots: [string | null, number][]): void {
  slots.forEach(([item, count], index) => {
    const slot = world.consumables.seats[0]!.slots[index]!;
    slot.item = item as typeof slot.item;
    slot.count = count;
  });
}

const use = (world: World, slot: number, aim: { x: number; z: number } | null = null) => useConsumable(world, { type: "consumable", seat: 0, slot, origin: at(0, 3), aim });

describe("the sim side of đan phù", () => {
  it("one shared 8 s cooldown; counts go down; an empty slot or one past the 2nd is refused", () => {
    const { world, of } = makeWorld();
    stock(world, [["hoi-xuan-dan", 2], ["kim-than-phu", 1]]);
    use(world, 0);
    use(world, 1);
    expect(of("rejected").map((event) => event.reason)).toEqual(["cooldown"]);
    world.tick += 479;
    use(world, 1);
    world.tick += 1;
    use(world, 1);
    use(world, 2);
    expect(of("rejected").map((event) => event.reason)).toEqual(["cooldown", "cooldown", "slot"]);
    expect(world.consumables.seats[0]!.slots).toEqual([
      { item: "hoi-xuan-dan", count: 1 },
      { item: null, count: 0 },
    ]);
    world.tick += 480;
    use(world, 1);
    expect(of("rejected").map((event) => event.reason).slice(-1)).toEqual(["empty"]);
    expect(of("consumable").map((event) => [event.kind, event.seat])).toEqual([
      ["hoi-xuan-dan", 0],
      ["kim-than-phu", 0],
    ]);
  });

  it("not while down", () => {
    const { world, of } = makeWorld();
    stock(world, [["hoi-xuan-dan", 1], [null, 0]]);
    world.seats[0]!.downUntil = world.tick + 60;
    use(world, 0);
    expect(of("rejected").map((event) => event.reason)).toEqual(["down"]);
    expect(world.consumables.seats[0]!.slots[0]!.count).toBe(1);
  });

  it("Hồi Xuân Đan and Kim Thân Phù change nothing in the world but the count and the cooldown; `local` applies them", () => {
    const { world, of } = makeWorld();
    stock(world, [["hoi-xuan-dan", 1], ["kim-than-phu", 1]]);
    const wolf = addBeast(world, "phong-lang");
    const without = (w: World) => {
      const keep = { slots: w.consumables.seats[0]!.slots.map((slot) => ({ ...slot })), cooldown: w.consumables.seats[0]!.cooldownUntil };
      w.consumables.seats[0]!.slots.forEach((slot) => {
        slot.item = null;
        slot.count = 0;
      });
      w.consumables.seats[0]!.cooldownUntil = 0;
      const hash = hashWorldHex(w);
      w.consumables.seats[0]!.slots.forEach((slot, index) => Object.assign(slot, keep.slots[index]));
      w.consumables.seats[0]!.cooldownUntil = keep.cooldown;
      return hash;
    };
    const before = without(world);
    use(world, 0);
    world.tick += 480;
    use(world, 1);
    world.tick -= 480;
    expect(without(world)).toBe(before);
    expect(wolf.hp).toBe(wolf.hpMax);
    // local/consumables.ts heals over 2 s and shields 20 % for 8 s on its own seat's event.
    const local = createLocal(0, THANH_THACH_AI, world.gPm);
    local.hp = 300;
    for (const event of of("consumable")) onConsumable(local, event);
    expect(local.healTotal).toBe(150);
    expect(local.shield).toBe(120);
  });

  it("Lôi Hỏa Phù: 1.6 W magic on every beast within 3 m of the cursor (on the field)", () => {
    const { world, of } = makeWorld();
    stock(world, [["loi-hoa-phu", 2], [null, 0]]);
    const near = addBeast(world, "nham-vien", { x: 5, z: -5 });
    const edge = addBeast(world, "nham-vien", { x: 7.9, z: -5 });
    const out = addBeast(world, "nham-vien", { x: 8.5, z: -5 });
    use(world, 0, at(5, -5));
    // 1.6 W = 144 HP, resist G0.
    expect(near.hpMax - near.hp).toBe(144);
    expect(edge.hpMax - edge.hp).toBe(144);
    expect(out.hp).toBe(out.hpMax);
    expect(of("consumable")[0]).toMatchObject({ kind: "loi-hoa-phu", x: 5, z: -5 });
    expect(of("hit").every((hit) => hit.source === "consumable" && hit.damageType === "magic")).toBe(true);
  });

  it("no cursor: the densest cluster within 14 m; the swarm cluster cap holds; nothing there: refused, kept", () => {
    const { world, of } = makeWorld();
    stock(world, [["loi-hoa-phu", 2], [null, 0]]);
    use(world, 0);
    expect(of("rejected").map((event) => event.reason)).toEqual(["target"]);
    expect(world.consumables.seats[0]!.slots[0]!.count).toBe(2);
    expect(world.consumables.seats[0]!.cooldownUntil).toBe(0);
    const rats = addCluster(world, 7, 2, -4);
    addBeast(world, "phong-lang", { x: -9, z: -6 });
    use(world, 0);
    const dealt = rats.reduce((sum, rat) => sum + (rat.hpMax - rat.hp), 0);
    expect(dealt).toBe(Math.floor((210 * 60) / 100));
    expect(rats.filter((rat) => !rat.alive)).toHaveLength(4);
  });
});
