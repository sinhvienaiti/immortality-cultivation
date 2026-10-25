import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/skills", () => ({ resolveCast: vi.fn(() => true) }));
vi.mock("../../src/sim/chan-nguyen", () => ({ addChanNguyen: vi.fn() }));
vi.mock("../../src/sim/posture", () => ({ postureHit: vi.fn() }));

import type { World } from "../../src/content/types";
import { stepCasts } from "../../src/sim/cast";
import { resolveCast } from "../../src/sim/skills";
import { dealSeal, slotEntry, stepWords, typeKey } from "../../src/sim/words";
import { banQuyetView, slotLabel, wordParts } from "../../src/ui/ban-quyet";
import { addBeast, key, makeWorld } from "../typing/world-fixture";

/** canon §6.1–6.3, §12.1, §12.3, D42: what the Bàn Quyết shows. */

beforeEach(() => {
  vi.mocked(resolveCast).mockReset().mockReturnValue(true);
});

function typeWord(world: World, text: string): void {
  for (const letter of text) {
    typeKey(world, key(world, letter));
    world.tick += 4;
    stepWords(world);
    stepCasts(world);
  }
}

describe("the Bàn Quyết view", () => {
  it("is dim with no live word outside the wave warning, waves and the boss phase", () => {
    const fx = makeWorld({ phase: "break", wave: 1 });
    stepWords(fx.world);
    const view = banQuyetView(fx.world, 0);
    expect(view.live).toBe(false);
    expect(view.slots.map((cell) => cell.state)).toEqual(["dim", "dim", "dim", "dim", "dim"]);
    expect(view.slots.every((cell) => cell.text === "")).toBe(true);
  });

  it("shows five slots with their skill names, ô 4's new word marked, ô 5 filling with Chân Nguyên", () => {
    const fx = makeWorld({ phase: "warning", wave: 0 });
    fx.world.seats[0]!.chanNguyenPm = 40_000;
    stepWords(fx.world);
    const view = banQuyetView(fx.world, 0);
    expect(view.live).toBe(true);
    expect(view.slots.map((cell) => cell.label)).toEqual(["Ngự Kiếm Quyết", "Nhất Tuyến Xuyên Vân", "Hồi Kiếm Hộ Thân", "Lạc Kiếm Trận", "Thiên Hà Kiếm Vũ"]);
    expect(view.slots.slice(0, 4).every((cell) => cell.state === "ready" && cell.text.length >= 3)).toBe(true);
    expect(view.slots[3]!.fresh).toBe(true);
    expect(view.slots[4]).toMatchObject({ state: "cooldown", text: "", cool: 0.6, note: "Chân Nguyên 40/100" });
    expect(view.chanNguyen).toBe(40);
    fx.world.seats[0]!.loadout = { guard: "dash", tamPhap: "kiem-tam" };
    expect(slotLabel(fx.world, 0, 3)).toBe("Lưu Quang Bộ");
  });

  it("follows typing, the held state, and the cooldown ring with the next word dim", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    const text = slotEntry(fx.world, 0, 2)!.text;
    typeKey(fx.world, key(fx.world, text[0]!));
    expect(banQuyetView(fx.world, 0).slots[1]).toMatchObject({ state: "typing", typed: 1, text });
    vi.mocked(resolveCast).mockReturnValue(false);
    typeWord(fx.world, text.slice(1));
    expect(banQuyetView(fx.world, 0).slots[1]).toMatchObject({ state: "held", text, note: "Chờ đích" });
    vi.mocked(resolveCast).mockReturnValue(true);
    fx.world.tick += 1;
    stepWords(fx.world);
    stepCasts(fx.world);
    const cooling = banQuyetView(fx.world, 0).slots[1]!;
    expect(cooling.state).toBe("cooldown");
    expect(cooling.preview).toBe(true);
    expect(cooling.text).not.toBe("");
    expect(cooling.cool).toBeCloseTo(1, 1);
  });

  it("adds an Ấn place while the seat has one, and đan phù cells with counts and the shared cooldown", () => {
    const fx = makeWorld({ phase: "wave", wave: 1 });
    stepWords(fx.world);
    dealSeal(fx.world, 0, addBeast(fx.world));
    (fx.world as unknown as { consumables: unknown }).consumables = {
      seats: [{ slots: [{ item: "hoi-xuan-dan", count: 2 }, { item: null, count: 0 }], cooldownUntil: fx.world.tick + 240 }],
    };
    const view = banQuyetView(fx.world, 0);
    expect(view.extras.map((cell) => [cell.key, cell.label])).toEqual([["seal-0", "Ấn"]]);
    expect(view.extras[0]!.text.length).toBeGreaterThanOrEqual(3);
    expect(view.items.map((cell) => [cell.key, cell.label, cell.count, cell.empty])).toEqual([
      ["item-1", "Hồi Xuân Đan", 2, false],
      ["item-2", "", 0, true],
      ["item-3", "", 0, true],
    ]);
    expect(view.items[0]!.cool).toBeCloseTo(0.5, 5);
  });

  it("splits a word into typed letters, the underlined first letter and the rest", () => {
    expect(wordParts("stone", 0)).toEqual({ done: "", first: "s", rest: "tone" });
    expect(wordParts("stone", 2)).toEqual({ done: "st", first: "", rest: "one" });
    expect(wordParts("", 0)).toEqual({ done: "", first: "", rest: "" });
  });
});
