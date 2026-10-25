import { describe, expect, it } from "vitest";
import { createInputRouter } from "../../src/app/input-router";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { MECHANISMS, SHOP_MODE } from "../../src/content/rules";
import type { LocalInput, MechanismId, Phase, SimCommand, World } from "../../src/content/types";
import { canShop, isMechanism, MAX_LEVEL, refundOf, rowLabel, shopItems, shopRows, ShopModeModel } from "../../src/ui/shop-mode";
import { ShopStripModel } from "../../src/ui/shop-strip";

/** canon §5.1, §8.3, §14.3, D45, M0A_PLAN §6.6: shop mode by keys and the mouse strip, without a DOM. */

function shopWorld(options: { phase?: Phase; built?: readonly (readonly [number, MechanismId, number])[]; linhSa?: number } = {}): World {
  const slots = THANH_THACH_AI.field.mechSlots.map((slot) => ({ index: slot.index, mech: null as MechanismId | null, level: 0, paid: 0, breakId: 0, nextFire: 0 }));
  for (const [index, mech, level] of options.built ?? []) Object.assign(slots[index]!, { mech, level, paid: 150 * level, breakId: 1 });
  return {
    stage: THANH_THACH_AI,
    phase: options.phase ?? "prep",
    tick: 100,
    mechanisms: { slots },
    shop: { breakId: 1 },
    consumables: { seats: [{ slots: [{ item: "hoi-xuan-dan", count: 2 }, { item: null, count: 0 }], cooldownUntil: 0 }] },
    economy: { wallets: [{ linhSa: options.linhSa ?? 500, thuHach: 0 }] },
  } as unknown as World;
}

function setup(world: World = shopWorld()) {
  const commands: SimCommand[] = [];
  let now = 1000;
  const cursor: number[] = [];
  const model = new ShopModeModel((command) => commands.push(command), 0, { now: () => now, onCursor: (index) => cursor.push(index) });
  model.setWorld(world);
  return { model, commands, cursor, advance: (ms: number) => (now += ms) };
}

const itemIndex = (id: string): number => shopItems().indexOf(id as never);

describe("the shop's stock and rows (canon §8.3, §12.3, §14.3)", () => {
  it("sells the three M0a mechanisms and the three đan phù, mechanisms first, fixed (never random)", () => {
    const items = shopItems();
    expect([...items].sort()).toEqual(["hoi-xuan-dan", "kiem-thung", "kim-than-phu", "loi-hoa-phu", "loi-phu-tru", "phong-an-vong"]);
    expect(items.slice(0, 3).every((id) => isMechanism(id))).toBe(true);
    expect(shopItems()).toEqual(items);
  });

  it("walks the 6 mechanism slots of the stage, then the seat's đan phù slots", () => {
    const rows = shopRows(shopWorld({ built: [[2, "loi-phu-tru", 2]] }), 0);
    expect(rows.map((row) => row.kind)).toEqual(["mech", "mech", "mech", "mech", "mech", "mech", "item", "item"]);
    expect(rows.slice(0, 6).map((row) => row.slotKind)).toEqual(THANH_THACH_AI.field.mechSlots.map((slot) => slot.kind));
    expect(rowLabel(rows[2]!)).toContain("cấp 2");
    expect(rowLabel(rows[6]!)).toContain("× 2");
    expect(rowLabel(rows[7]!)).toContain("trống");
  });

  it("opens in prep and breaks only; refunds 70 %, 100 % in the same break; 3 levels", () => {
    expect((["prep", "warning", "wave", "break", "lull", "boss", "victory", "defeat"] as const).filter(canShop)).toEqual(["prep", "break"]);
    expect(refundOf(300, false)).toBe(Math.floor((300 * MECHANISMS.refundPct) / 100));
    expect(refundOf(300, true)).toBe(300);
    expect(MAX_LEVEL).toBe(3);
  });
});

describe("shop mode by keys (canon §5.1, D45)", () => {
  it("drops letters, moves both cursors with wrap, and tells the stage which slot to light", () => {
    const t = setup();
    t.model.open();
    expect(t.model.isOpen).toBe(true);
    expect(t.model.handleLetter("a")).toBe(false);
    t.model.handleAction("arrow-left");
    expect(t.model.item).toBe(shopItems().length - 1);
    t.model.handleAction("arrow-right");
    expect(t.model.item).toBe(0);
    t.model.handleAction("arrow-up");
    expect(t.model.row).toBe(7);
    t.model.handleAction("arrow-down");
    t.model.handleAction("arrow-down");
    expect(t.model.row).toBe(1);
    // Slot 0 on open, then −1 on the đan phù row 7, then slots 0 and 1.
    expect(t.cursor).toEqual([0, -1, 0, 1]);
    expect(t.commands).toEqual([]);
  });

  it("Enter places a mechanism on an empty slot of its kind and buys a đan phù", () => {
    const t = setup();
    t.model.open();
    t.model.pick(itemIndex("kiem-thung"));
    t.model.point(0);
    t.model.handleAction("enter");
    expect(t.commands).toEqual([{ type: "place", seat: 0, slot: 0, mech: "kiem-thung" }]);
    // A post mechanism on the strip slot: a hint, no command.
    t.model.pick(itemIndex("loi-phu-tru"));
    t.model.handleAction("enter");
    expect(t.commands).toHaveLength(1);
    expect(t.model.message).toContain("trụ");
    t.model.pick(itemIndex("hoi-xuan-dan"));
    t.model.handleAction("enter");
    expect(t.commands.at(-1)).toEqual({ type: "buy", seat: 0, item: "hoi-xuan-dan" });
    // A mechanism on a đan phù row: a hint only.
    t.model.point(6);
    t.model.pick(itemIndex("phong-an-vong"));
    t.model.handleAction("enter");
    expect(t.commands).toHaveLength(2);
  });

  it("= upgrades and - sells only on a second press within the window, on the same slot", () => {
    const t = setup(shopWorld({ phase: "break", built: [[1, "loi-phu-tru", 1], [3, "phong-an-vong", MAX_LEVEL]] }));
    t.model.open();
    t.model.point(1);
    t.model.handleAction("upgrade");
    expect(t.commands).toEqual([]);
    expect(t.model.message).toContain("Bấm = lần nữa");
    t.advance(SHOP_MODE.confirmMs - 1);
    t.model.handleAction("upgrade");
    expect(t.commands).toEqual([{ type: "upgrade", seat: 0, slot: 1 }]);
    // Too slow: the second press only asks again.
    t.model.handleAction("sell");
    t.advance(SHOP_MODE.confirmMs + 1);
    t.model.handleAction("sell");
    expect(t.commands).toHaveLength(1);
    t.model.handleAction("sell");
    expect(t.commands.at(-1)).toEqual({ type: "sell", seat: 0, slot: 1 });
    // Moving the cursor cancels a pending press; a top-level mechanism cannot go up.
    t.model.handleAction("upgrade");
    t.model.handleAction("arrow-down");
    t.model.handleAction("arrow-up");
    t.model.handleAction("upgrade");
    expect(t.commands).toHaveLength(2);
    t.model.point(3);
    t.model.handleAction("upgrade");
    t.model.handleAction("upgrade");
    expect(t.commands).toHaveLength(2);
    expect(t.model.message).toContain("tối đa");
    // An empty slot: nothing to upgrade or sell.
    t.model.point(0);
    t.model.handleAction("sell");
    t.model.handleAction("sell");
    expect(t.commands).toHaveLength(2);
  });

  it("Esc leaves; through the real key router the arrows never reach the player while it is open", () => {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const win = {
      performance: { now: () => 0 },
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      removeEventListener: () => undefined,
    };
    const fire = (code: string, key: string) => {
      for (const listener of listeners.get("keydown") ?? []) listener({ code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 0, timeStamp: 1, preventDefault() {} });
    };
    const t = setup(shopWorld({ built: [[1, "loi-phu-tru", 1]] }));
    const locals: LocalInput[] = [];
    const commands: SimCommand[] = [];
    createInputRouter(win as unknown as Window, { command: (command) => commands.push(command), local: (input) => locals.push(input) }, {
      seat: 0,
      origin: () => ({ x: 0, z: 0 }),
      shop: () => t.model,
      canShop: () => true,
      banQuyetLive: () => false,
    });
    fire("ArrowUp", "ArrowUp");
    expect(locals).toEqual([{ type: "arrows", mask: 1 }]);
    fire("Backquote", "`");
    expect(t.model.isOpen).toBe(true);
    // Opening stops the walk; arrows, Enter, = and - now belong to the shop.
    expect(locals.at(-1)).toEqual({ type: "arrows", mask: 0 });
    for (const [code, key] of [["ArrowDown", "ArrowDown"], ["ArrowLeft", "ArrowLeft"], ["ArrowRight", "ArrowRight"], ["Equal", "="], ["Equal", "="], ["KeyA", "a"]] as const) fire(code, key);
    expect(locals).toHaveLength(2);
    expect(t.commands).toEqual([{ type: "upgrade", seat: 0, slot: 1 }]);
    expect(commands).toEqual([]);
    fire("Escape", "Escape");
    expect(t.model.isOpen).toBe(false);
    fire("ArrowLeft", "ArrowLeft");
    expect(locals.at(-1)).toEqual({ type: "arrows", mask: 4 });
  });
});

describe("the mouse strip (canon §14.3)", () => {
  it("buys a đan phù on a click, arms a mechanism then places it on an empty slot", () => {
    const t = setup();
    const strip = new ShopStripModel(t.model);
    strip.clickItem(itemIndex("kim-than-phu"));
    expect(t.commands).toEqual([{ type: "buy", seat: 0, item: "kim-than-phu" }]);
    strip.clickItem(itemIndex("phong-an-vong"));
    expect(strip.armed).toBe(itemIndex("phong-an-vong"));
    strip.clickRow(1);
    expect(t.commands.at(-1)).toEqual({ type: "place", seat: 0, slot: 1, mech: "phong-an-vong" });
    expect(strip.armed).toBe(-1);
    // A second click on the armed item disarms it.
    strip.clickItem(itemIndex("kiem-thung"));
    strip.clickItem(itemIndex("kiem-thung"));
    expect(strip.armed).toBe(-1);
  });

  it("selects a built slot; Nâng and Bán act on the second click", () => {
    const t = setup(shopWorld({ phase: "break", built: [[4, "loi-phu-tru", 1]] }));
    const strip = new ShopStripModel(t.model);
    strip.clickRow(4);
    expect(strip.selected).toBe(4);
    strip.act("upgrade");
    expect(t.commands).toEqual([]);
    strip.act("upgrade");
    expect(t.commands).toEqual([{ type: "upgrade", seat: 0, slot: 4 }]);
    strip.act("sell");
    strip.act("sell");
    expect(t.commands.at(-1)).toEqual({ type: "sell", seat: 0, slot: 4 });
    strip.clickRow(0);
    expect(strip.selected).toBe(-1);
  });
});
