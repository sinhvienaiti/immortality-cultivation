// Lane 4 shop.ts (canon §8.3, §12.3, §14.3): prep and breaks only; slots by kind; upgrade 70 % / 100 % of the base price;
// sell 70 %, what was paid in this same break 100 %; đan phù into 2 slots × 3.
import { describe, expect, it } from "vitest";
import { SHOP_ITEMS } from "../../src/content/data/economy";
import { MECHANISM_DEFS } from "../../src/content/data/mechanisms";
import { CONSUMABLE_DEFS } from "../../src/content/data/consumables";
import { buy, onBreakStart, place, sell, sellRefund, upgrade, upgradePrice } from "../../src/sim/shop";
import { makeWorld } from "./combat-fixture";

const rich = (phase: "prep" | "break" | "wave" = "prep") => {
  const made = makeWorld({ phase });
  made.world.economy.wallets[0]!.linhSa = 2000;
  return made;
};

describe("the fixed shop list (canon §14.3)", () => {
  it("3 mechanisms then 3 đan phù at the canon's prices", () => {
    expect(SHOP_ITEMS).toEqual(["kiem-thung", "loi-phu-tru", "phong-an-vong", "hoi-xuan-dan", "kim-than-phu", "loi-hoa-phu"]);
    expect(Object.values(MECHANISM_DEFS).map((def) => def.price)).toEqual([150, 300, 250]);
    expect(Object.values(CONSUMABLE_DEFS).map((def) => def.price)).toEqual([30, 40, 50]);
  });
});

describe("place, upgrade, sell (canon §8.3)", () => {
  it("only in prep and breaks; a slot of the right kind; Linh Sa paid; `built` event", () => {
    const { world, of } = rich("wave");
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    expect(of("rejected").map((event) => event.reason)).toEqual(["phase"]);
    world.phase = "prep";
    place(world, { type: "place", seat: 0, slot: 0, mech: "loi-phu-tru" });
    place(world, { type: "place", seat: 0, slot: 1, mech: "kiem-thung" });
    place(world, { type: "place", seat: 0, slot: 9, mech: "kiem-thung" });
    expect(of("rejected").map((event) => event.reason)).toEqual(["phase", "kind", "kind", "slot"]);
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    expect(of("rejected").map((event) => event.reason).slice(-1)).toEqual(["taken"]);
    expect(world.economy.wallets[0]!.linhSa).toBe(2000 - 150);
    expect(world.mechanisms.slots[0]).toMatchObject({ mech: "kiem-thung", level: 1, paid: 150 });
    expect(of("mechanism").map((event) => [event.stage, event.slot, event.level])).toEqual([["built", 0, 1]]);
  });

  it("upgrades cost 70 % then 100 % of the base price; level 3 is the top", () => {
    const { world, of } = rich();
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    expect(upgradePrice(world.mechanisms.slots[0]!)).toBe(105);
    upgrade(world, { type: "upgrade", seat: 0, slot: 0 });
    expect(upgradePrice(world.mechanisms.slots[0]!)).toBe(150);
    upgrade(world, { type: "upgrade", seat: 0, slot: 0 });
    upgrade(world, { type: "upgrade", seat: 0, slot: 0 });
    expect(world.mechanisms.slots[0]).toMatchObject({ level: 3, paid: 150 + 105 + 150 });
    expect(of("rejected").map((event) => event.reason)).toEqual(["max"]);
    expect(world.economy.wallets[0]!.linhSa).toBe(2000 - 405);
  });

  it("sell refunds 70 %; what was paid in this same break 100 %; prep counts as break 0", () => {
    const { world } = rich();
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    expect(sellRefund(world, world.mechanisms.slots[0]!)).toBe(150);
    sell(world, { type: "sell", seat: 0, slot: 0 });
    expect(world.economy.wallets[0]!.linhSa).toBe(2000);
    place(world, { type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
    world.phase = "break";
    onBreakStart(world);
    expect(sellRefund(world, world.mechanisms.slots[0]!)).toBe(105);
    // Built in prep, upgraded in break 1, sold in break 1: 70 % of 150 + 100 % of 105.
    upgrade(world, { type: "upgrade", seat: 0, slot: 0 });
    expect(sellRefund(world, world.mechanisms.slots[0]!)).toBe(105 + 105);
    onBreakStart(world);
    expect(sellRefund(world, world.mechanisms.slots[0]!)).toBe(Math.round((255 * 70) / 100));
    const before = world.economy.wallets[0]!.linhSa;
    sell(world, { type: "sell", seat: 0, slot: 0 });
    expect(world.economy.wallets[0]!.linhSa - before).toBe(179);
    expect(world.mechanisms.slots[0]).toMatchObject({ mech: null, level: 0, paid: 0 });
  });

  it("cannot pay: refused, nothing built", () => {
    const { world, of } = makeWorld({ phase: "prep" });
    place(world, { type: "place", seat: 0, slot: 1, mech: "loi-phu-tru" });
    expect(of("rejected").map((event) => event.reason)).toEqual(["linh-sa"]);
    expect(world.mechanisms.slots[1]!.mech).toBeNull();
  });
});

describe("buying đan phù (canon §12.3): 2 slots × 3, Linh Sa", () => {
  it("stacks a kind in its slot up to 3, a new kind takes the empty slot, a third kind has no room", () => {
    const { world, of } = rich();
    for (let k = 0; k < 4; k += 1) buy(world, { type: "buy", seat: 0, item: "hoi-xuan-dan" });
    buy(world, { type: "buy", seat: 0, item: "loi-hoa-phu" });
    buy(world, { type: "buy", seat: 0, item: "kim-than-phu" });
    expect(world.consumables.seats[0]!.slots).toEqual([
      { item: "hoi-xuan-dan", count: 3 },
      { item: "loi-hoa-phu", count: 1 },
    ]);
    expect(of("rejected").map((event) => event.reason)).toEqual(["full", "full"]);
    expect(world.economy.wallets[0]!.linhSa).toBe(2000 - 3 * 30 - 50);
    world.phase = "wave";
    buy(world, { type: "buy", seat: 0, item: "hoi-xuan-dan" });
    expect(of("rejected").map((event) => event.reason).slice(-1)).toEqual(["phase"]);
  });
});
