// Lane 4 chan-nguyen.ts (canon §6.6, D42, PB-32) through the real cast.ts: +5 clean, +3 with errors, +2 more for an Ấn,
// × 1 / k (‰, half up), full at 100; only resolved Casts give it (held and fizzled give nothing), and only they stamp the
// Dưỡng window (canon §8.2); the bar stays across breaks.
import { describe, expect, it } from "vitest";
import { CHAN_NGUYEN, PACE } from "../../src/content/rules";
import type { Grade } from "../../src/content/types";
import { emitCast, stepCasts } from "../../src/sim/cast";
import { addChanNguyen, chanNguyenFull, chanNguyenPoints, spendChanNguyen } from "../../src/sim/chan-nguyen";
import { step } from "../../src/sim/world";
import { addBeast, advance, castOf, makeWorld } from "./combat-fixture";

const FULL = CHAN_NGUYEN.full * 1000;

describe("points and × 1 / k (canon §6.6)", () => {
  it("+5 for Chớp and Hoàn hảo, +3 for a word with errors, +2 more for an Ấn", () => {
    const table: [Grade, number][] = [
      ["flash", 5],
      ["perfect", 5],
      ["good", 3],
      ["ok", 3],
      ["sloppy", 3],
    ];
    for (const [grade, points] of table) {
      expect(chanNguyenPoints(grade, false)).toBe(points);
      expect(chanNguyenPoints(grade, true)).toBe(points + 2);
    }
  });

  it("× 1 / k in permille, half up: k 1 → 5 000, k 0.75 → 6 667, k 1.30 → 3 846", () => {
    for (const [kPm, gain] of [
      [1000, 5000],
      [PACE.kMinPm, 6667],
      [PACE.kMaxPm, 3846],
    ] as const) {
      const { world } = makeWorld({ kPm });
      addChanNguyen(world, 0, "perfect", false);
      expect(world.seats[0]!.chanNguyenPm).toBe(gain);
    }
  });

  it("the bar fills in the same time across k 0.75–1.30 (a faster seat types more words for it)", () => {
    const wordsToFill = (kPm: number): number => {
      const { world } = makeWorld({ kPm });
      let words = 0;
      while (!chanNguyenFull(world, 0)) {
        addChanNguyen(world, 0, "perfect", false);
        words += 1;
      }
      return words;
    };
    // Words at a pace k take 1 / k of the time: 20 at k 1; 15 at k 0.75 (20 time units); 27 at k 1.30 (20.8).
    expect([wordsToFill(1000), wordsToFill(750), wordsToFill(1300)]).toEqual([20, 15, 27]);
  });

  it("stops at 100; the ultimate spends it all", () => {
    const { world } = makeWorld();
    for (let k = 0; k < 30; k += 1) addChanNguyen(world, 0, "flash", true);
    expect(world.seats[0]!.chanNguyenPm).toBe(FULL);
    expect(spendChanNguyen(world, 0)).toBe(true);
    expect(world.seats[0]!.chanNguyenPm).toBe(0);
    expect(spendChanNguyen(world, 0)).toBe(false);
  });
});

describe("resolved Casts only (canon §6.1, D42), through cast.ts", () => {
  it("a held Cast gives nothing; it fizzles at 3 s with nothing; a resolved one gives its points and stamps Dưỡng", () => {
    const { world, of } = makeWorld();
    emitCast(world, castOf(world, 2, { quality: "perfect" }));
    expect(of("cast").map((event) => event.state)).toEqual(["held"]);
    expect(world.seats[0]!.chanNguyenPm).toBe(0);
    expect(world.seats[0]!.lastResolvedTick).toBe(-1);
    advance(world, 181, [stepCasts]);
    expect(of("cast").map((event) => event.state)).toEqual(["held", "fizzled"]);
    expect(world.seats[0]!.chanNguyenPm).toBe(0);
    expect(world.seats[0]!.lastResolvedTick).toBe(-1);
    addBeast(world, "nham-vien", { z: -5 });
    emitCast(world, castOf(world, 2, { quality: "perfect" }));
    expect(of("cast").map((event) => event.state)).toEqual(["held", "fizzled", "resolved"]);
    expect(world.seats[0]!.chanNguyenPm).toBe(5000);
    expect(world.seats[0]!.lastResolvedTick).toBe(world.tick);
  });

  it("a held Cast that finds its target within 3 s resolves then, and only then gives its points", () => {
    const { world, of } = makeWorld();
    emitCast(world, castOf(world, 1, { quality: "good" }));
    advance(world, 60, [stepCasts]);
    expect(world.seats[0]!.chanNguyenPm).toBe(0);
    addBeast(world, "phong-lang", { z: -5 });
    advance(world, 1, [stepCasts]);
    expect(of("cast").map((event) => event.state)).toEqual(["held", "resolved"]);
    expect(world.seats[0]!.chanNguyenPm).toBe(3000);
  });

  it("an Ấn gives its +2 more (cast.ts asks with isSeal)", () => {
    const { world } = makeWorld({ kPm: 1000 });
    const elite = addBeast(world, "phong-lang", { elite: "cuong" });
    emitCast(world, castOf(world, "seal", { quality: "flash", target: { slot: elite.slot, serial: elite.serial } }));
    expect(world.seats[0]!.chanNguyenPm).toBe(7000);
  });

  it("the bar stays across a break (canon §6.6)", () => {
    const { world } = makeWorld({ phase: "break" });
    world.seats[0]!.chanNguyenPm = 42_000;
    world.phaseEndsAt = world.tick + 1000;
    for (let k = 0; k < 120; k += 1) step(world, []);
    expect(world.phase).toBe("break");
    expect(world.seats[0]!.chanNguyenPm).toBe(42_000);
  });
});
