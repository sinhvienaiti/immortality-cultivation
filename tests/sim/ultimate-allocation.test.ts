import { describe, expect, it } from "vitest";
import type { Preset, World } from "../../src/content/types";
import { hashWorldHex } from "../../src/sim/hash";
import {
  dealCleanse, dealSeal, liveWords, onBeastGone, releaseLock, releaseWord, slotEntry, stepWords, typeBackspace, typeKey,
} from "../../src/sim/words";
import { applyCommand, createWorld } from "../../src/sim/world";
import { banQuyetView } from "../../src/ui/ban-quyet";
import { coldDeck, key } from "../typing/world-fixture";
import { addBeast, at, makeWorld, testHeader, THANH_THACH_AI } from "./combat-fixture";

function assertBudget(world: World): void {
  const words = liveWords(world, 0);
  expect(words.length).toBeLessThanOrEqual(world.words.liveCap);
  expect(world.words.ledgers[0]!.total).toBe(words.length);
  expect(new Set(words.map(word => word.text[0])).size).toBe(words.length);
  for (const a of words) for (const b of words) {
    if (a.index !== b.index) expect(a.text.startsWith(b.text)).toBe(false);
  }
}

function fullWithSeal(preset: Preset = "relax", seed = 7) {
  const fx = makeWorld({ preset, seed });
  stepWords(fx.world);
  const beast = addBeast(fx.world, "phong-lang");
  const seal = dealSeal(fx.world, 0, beast);
  expect(liveWords(fx.world, 0)).toHaveLength(5);
  return { ...fx, seal };
}

/** Four eligible initial letters give a real A − 3 cap of one. */
function oneWordWorld(): World {
  const header = { ...testHeader({ preset: "relax" }), deck: coldDeck(0).filter(word => "abcf".includes(word.text[0]!)) };
  const world = createWorld(THANH_THACH_AI, header.seed, header);
  world.phase = "wave";
  stepWords(world);
  expect(world.words.liveCap).toBe(1);
  return world;
}

function fill(world: World): void {
  world.seats[0]!.chanNguyenPm = 100_000;
  stepWords(world);
}

function typeUltimate(world: World): void {
  const ultimate = slotEntry(world, 0, 5)!;
  expect(ultimate.kitSlot).toBeGreaterThanOrEqual(0);
  for (const letter of ultimate.text) {
    typeKey(world, key(world, letter));
    world.tick += 4;
    stepWords(world);
    assertBudget(world);
  }
  expect(world.casts.prepared[0]).not.toBeNull();
}

describe("Ultimate allocation at the live-word cap (394c)", () => {
  it.each(["relax", "learn"] as const)("replaces the lowest untouched skill in %s, keeping the Seal and UI word", preset => {
    const { world, seal, of } = fullWithSeal(preset);
    const sealBefore = { ...world.words.live[seal]! };
    fill(world);
    const ultimate = slotEntry(world, 0, 5)!;
    expect(ultimate.kitSlot).toBeGreaterThanOrEqual(0);
    expect(ultimate.state).toBe("ready");
    expect(slotEntry(world, 0, 4)!.kitSlot).toBe(-1);
    expect(of("word-released").filter(event => event.reason === "replaced").map(event => event.word)).toEqual([3]);
    expect(world.words.live[seal]).toEqual(sealBefore);
    expect(banQuyetView(world, 0).slots[4]?.text).toBe(ultimate.text);
    expect(ultimate.text.length).toBeGreaterThan(0);
    assertBudget(world);
  });

  it.each([false, true])("preserves the lowest-priority skill being typed, including after Backspace (%s)", backspace => {
    const { world, seal, of } = fullWithSeal();
    const locked = slotEntry(world, 0, 4)!;
    typeKey(world, key(world, locked.text[0]!));
    if (backspace) {
      typeKey(world, key(world, locked.text[1]!));
      typeBackspace(world, 0);
    }
    const before = { ...locked };
    fill(world);
    expect(slotEntry(world, 0, 5)!.kitSlot).toBeGreaterThanOrEqual(0);
    expect(locked).toEqual(before);
    expect(world.words.seats[0]!.locked).toBe(locked.index);
    expect(slotEntry(world, 0, 2)!.kitSlot).toBe(-1);
    expect(world.words.live[seal]!.kitSlot).toBeGreaterThanOrEqual(0);
    expect(of("word-released").filter(event => event.reason === "replaced").map(event => event.word)).toEqual([1]);
    assertBudget(world);
  });

  it.each(["seal", "cleanse"] as const)("waits behind an urgent %s and allocates immediately when it is released", kind => {
    const world = oneWordWorld();
    const beast = addBeast(world, "phong-lang");
    const urgent = kind === "seal" ? dealSeal(world, 0, beast) : dealCleanse(world, 0, "tam-nhan");
    const before = { ...world.words.live[urgent]! };
    fill(world);
    for (let n = 0; n < 3; n += 1) {
      world.tick += 1;
      stepWords(world);
      expect(slotEntry(world, 0, 5)!.kitSlot).toBe(-1);
      expect(slotEntry(world, 0, 5)!.state).toBe("waiting");
      expect(world.words.live[urgent]).toEqual(before);
      assertBudget(world);
    }
    if (kind === "seal") {
      beast.alive = false;
      onBeastGone(world, beast);
    } else releaseWord(world, urgent, "target-gone");
    expect(slotEntry(world, 0, 5)!.kitSlot).toBeGreaterThanOrEqual(0);
    assertBudget(world);
  });

  it("waits when the only skill is being typed, then allocates on the first step after Esc", () => {
    const world = oneWordWorld();
    const locked = liveWords(world, 0)[0]!;
    typeKey(world, key(world, locked.text[0]!));
    expect(locked.typed).toBe(1);
    fill(world);
    expect(slotEntry(world, 0, 5)!.kitSlot).toBe(-1);
    expect(world.words.seats[0]!.locked).toBe(locked.index);
    releaseLock(world, 0);
    stepWords(world);
    expect(slotEntry(world, 0, 5)!.kitSlot).toBeGreaterThanOrEqual(0);
    assertBudget(world);
  });

  it("handles repeated full meters deterministically, without duplicating prepared words", () => {
    const run = (seed: number) => {
      const { world, sink, of } = fullWithSeal("relax", seed);
      const hashes: string[] = [];
      for (let n = 0; n < 3; n += 1) {
        fill(world);
        assertBudget(world);
        typeUltimate(world);
        const assigned = of("word-assigned").filter(event => event.slot === 5).length;
        for (let k = 0; k < 3; k += 1) stepWords(world);
        expect(of("word-assigned").filter(event => event.slot === 5)).toHaveLength(assigned);
        expect(banQuyetView(world, 0).slots[4]?.note).toBe("Ultimate ready · Space");
        applyCommand(world, { type: "ultimate", seat: 0, origin: at(0, 0), aim: at(0, -6) });
        expect(world.casts.prepared[0]).toBeNull();
        expect(world.seats[0]!.chanNguyenPm).toBeLessThan(100_000);
        world.tick += 61;
        stepWords(world);
        expect(liveWords(world, 0)).toHaveLength(5);
        assertBudget(world);
        hashes.push(hashWorldHex(world));
      }
      expect(of("word-complete").filter(event => event.word === slotEntry(world, 0, 5)!.index)).toHaveLength(3);
      expect(of("cast").filter(event => event.slot === 5 && event.state === "resolved")).toHaveLength(3);
      return { hashes, events: sink.all };
    };
    for (const seed of [7, 19, 99]) expect(run(seed)).toEqual(run(seed));
  });

  it("discards readiness at wave end and requires a new word before Space in the next warning", () => {
    const { world, of } = fullWithSeal();
    fill(world);
    typeUltimate(world);
    world.phase = "break";
    stepWords(world);
    expect(world.casts.prepared[0]).toBeNull();
    expect(world.seats[0]!.chanNguyenPm).toBe(100_000);
    world.tick += 61;
    world.phase = "warning";
    stepWords(world);
    expect(slotEntry(world, 0, 5)!.kitSlot).toBeGreaterThanOrEqual(0);
    expect(banQuyetView(world, 0).slots[4]?.state).toBe("ready");
    applyCommand(world, { type: "ultimate", seat: 0, origin: at(0, 0), aim: at(0, -6) });
    expect(of("cast").filter(event => event.slot === 5)).toHaveLength(0);
    assertBudget(world);
  });
});
