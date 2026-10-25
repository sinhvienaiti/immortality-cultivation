import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/fixed", () => import("./beasts-fixture").then((f) => f.fakeFixed));
vi.mock("../../src/sim/events", () => import("./beasts-fixture").then((f) => f.fakeEvents));
vi.mock("../../src/sim/world", () => import("./beasts-fixture").then((f) => f.fakeWorld));
vi.mock("../../src/sim/field", () => import("./beasts-fixture").then((f) => f.fakeField));
vi.mock("../../src/sim/spawn", () => import("./beasts-fixture").then((f) => f.fakeSpawn));
vi.mock("../../src/sim/pace", () => import("./beasts-fixture").then((f) => f.fakePace));
vi.mock("../../src/sim/formation", () => import("./beasts-fixture").then((f) => f.fakeFormation));
vi.mock("../../src/sim/wards", () => import("./beasts-fixture").then((f) => f.fakeWards));
vi.mock("../../src/sim/words", () => import("./beasts-fixture").then((f) => f.fakeWords));

import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { SEAL_WORDS, TELEGRAPH } from "../../src/content/rules";
import type { Preset, TelegraphDef } from "../../src/content/types";
import { initBeast } from "../../src/sim/beasts";
import {
  T, answerLetters, cancelTelegraph, chargeTicks, inTelegraph, shapeFromEvent, stepTelegraphs, strikeTelegraph, telegraph, telegraphKPm, touchesHeart, typedTelegraphActive,
} from "../../src/sim/telegraph";
import { U, addBeast, hooks, makeWorld } from "./beasts-fixture";

hooks.initBeast = initBeast;

const PRESETS: readonly Preset[] = ["relax", "balanced", "challenge", "learn"];
const DEFS: readonly TelegraphDef[] = Object.values(TELEGRAPHS);

/** canon §10.6 in plain floats, seconds: T = 1.6 × (0.4 + 0.5 + 12 (ℓ + 1) / (0.86 × E_floor) + 0.2 + t_channel). */
function canonT(preset: Preset, letters: number, channelS = 0): number {
  const e = { relax: 15, balanced: 25, challenge: 35, learn: 15 }[preset];
  return 1.6 * (0.4 + 0.5 + (12 * (letters + 1)) / (0.86 * e) + 0.2 + channelS);
}

describe("T, the one telegraph formula (canon §10.6)", () => {
  it("matches the canon table to 0.1 s, never under the exact value", () => {
    const table: Record<"relax" | "balanced" | "challenge", readonly number[]> = {
      relax: [9.2, 10.7, 12.2, 13.7],
      balanced: [6.2, 7.1, 8.0, 8.9],
      challenge: [4.9, 5.6, 6.2, 6.9],
    };
    for (const preset of ["relax", "balanced", "challenge"] as const) {
      [4, 5, 6, 7].forEach((letters, index) => {
        const exact = canonT(preset, letters);
        expect(Math.round(exact * 10) / 10).toBe(table[preset][index]);
        expect(T(preset, letters, 0) / 1000).toBeGreaterThanOrEqual(exact);
        expect(Math.abs(T(preset, letters, 0) / 1000 - table[preset][index]!)).toBeLessThan(0.06);
      });
    }
    // Học uses Thư giãn's E_floor 15 (PB-28).
    expect(T("learn", 5, 0)).toBe(T("relax", 5, 0));
  });

  it("is never under the exact formula (rounded up to the ms) and grows with t_channel", () => {
    for (const preset of PRESETS) {
      for (let letters = 3; letters <= 8; letters += 1) {
        const ms = T(preset, letters, 0);
        expect(ms / 1000).toBeGreaterThanOrEqual(canonT(preset, letters));
        expect(ms / 1000 - canonT(preset, letters)).toBeLessThan(0.001);
      }
      expect(T(preset, 5, 300)).toBeGreaterThan(T(preset, 5, 0));
    }
  });

  it("reads the Ấn's longest word for each preset (Thư giãn, Học 5 · Cân bằng 6 · Thử thách 7)", () => {
    const charge = TELEGRAPHS["vuong-thiet-boi-xung"]!;
    expect(PRESETS.map((preset) => answerLetters(charge, preset))).toEqual([5, 6, 7, 5]);
    for (const preset of PRESETS) expect(answerLetters(charge, preset)).toBe(SEAL_WORDS.lengths[preset][1]);
  });
});

describe("CB5: chargeTicks never charges a typed answer under T (PB-28)", () => {
  const typed = DEFS.filter((def) => def.typedAnswer);

  it("covers at least the Thiết Bối Xung", () => {
    expect(typed.map((def) => def.id)).toContain("vuong-thiet-boi-xung");
  });

  it("gives ≥ T at k 0.75, 1 and 1.30 with the answer's longest word, in all 4 presets", () => {
    expect(TELEGRAPH.checkKPm).toEqual([750, 1000, 1300]);
    for (const def of typed) {
      for (const preset of PRESETS) {
        const letters = SEAL_WORDS.lengths[preset][1];
        for (const kPm of TELEGRAPH.checkKPm) {
          const seconds = chargeTicks(def, preset, kPm) / 60;
          expect(seconds, def.id + " " + preset + " k " + kPm).toBeGreaterThanOrEqual(canonT(preset, letters));
        }
      }
    }
  });

  it("stretches by 1 / k for slow typists only (max(T, T / k))", () => {
    const charge = TELEGRAPHS["vuong-thiet-boi-xung"]!;
    const slow = chargeTicks(charge, "balanced", 750);
    const normal = chargeTicks(charge, "balanced", 1000);
    const fast = chargeTicks(charge, "balanced", 1300);
    expect(normal).toBe(Math.ceil((T("balanced", 6, 0) * 60) / 1000));
    expect(slow).toBeGreaterThanOrEqual(Math.ceil((normal * 1000) / 750) - 1);
    expect(fast).toBe(normal);
    // The canon's minimum charges of the Thiết Bối Xung: 10.7 / 8.0 / 6.9 s (Thư giãn, Cân bằng, Thử thách).
    expect(chargeTicks(charge, "relax", 1300) / 60).toBeGreaterThanOrEqual(10.7);
    expect(chargeTicks(charge, "balanced", 1300) / 60).toBeGreaterThanOrEqual(8.0);
    expect(chargeTicks(charge, "challenge", 1300) / 60).toBeGreaterThanOrEqual(6.86);
  });
});

describe("telegraph data (canon §23.3 TelegraphDef)", () => {
  it("has a typed answer exactly when Ấn answers it, and charge T only then", () => {
    for (const def of DEFS) {
      expect(def.typedAnswer, def.id).toBe(def.answers.includes("seal"));
      if (def.chargeMs === "T") expect(def.typedAnswer, def.id).toBe(true);
      else expect(def.chargeMs, def.id).toBeGreaterThan(0);
    }
  });

  it("every damaging attack has ≥ 2 answers, ≥ 1 of them without typing (canon §10.5, §9.1 CB4)", () => {
    const damaging = DEFS.filter((def) => def.strike.formation > 0 || def.strike.formationPm > 0 || def.strike.playerHp > 0 || def.strike.knockMm > 0);
    expect(damaging.length).toBeGreaterThanOrEqual(7);
    for (const def of damaging) {
      expect(def.answers.length, def.id).toBeGreaterThanOrEqual(2);
      expect(def.answers.some((answer) => answer !== "seal"), def.id).toBe(true);
    }
  });

  it("has consistent sizes per shape", () => {
    for (const def of DEFS) {
      expect(def.sizeMm.reach, def.id).toBeGreaterThan(0);
      expect(def.sizeMm.width, def.id).toBeGreaterThan(0);
      if (def.shape === "circle") expect(def.sizeMm.width, def.id).toBe(2 * def.sizeMm.reach);
      if (def.shape === "cell") expect(def.sizeMm.width, def.id).toBe(def.sizeMm.reach);
    }
  });

  it("keeps the canon's numbers: Nham Viên 1.6 s r 2 m, Hỏa Nha 1.5 s r 1.5 m, Vồ Xé 6 m 2.0 s 60, Thiết Bối Xung −8 % push 3 m", () => {
    expect(TELEGRAPHS["nham-vien-throw-heart"]).toMatchObject({ shape: "circle", chargeMs: 1600, sizeMm: { reach: 2000 }, strike: { formation: 12 } });
    expect(TELEGRAPHS["nham-vien-throw-node"]).toMatchObject({ shape: "circle", chargeMs: 1600, sizeMm: { reach: 2000 }, strike: { formation: 0, playerHp: 40 } });
    expect(TELEGRAPHS["hoa-nha-dive-heart"]).toMatchObject({ shape: "circle", chargeMs: 1500, sizeMm: { reach: 1500 }, strike: { formation: 3, playerHp: 30 } });
    expect(TELEGRAPHS["thiet-giap-tru-ram"]).toMatchObject({ shape: "line", strike: { formation: 40 } });
    expect(TELEGRAPHS["vuong-vo-xe"]).toMatchObject({ shape: "cone", chargeMs: 2000, sizeMm: { reach: 6000 }, strike: { playerHp: 60 } });
    expect(TELEGRAPHS["vuong-thiet-boi-xung"]).toMatchObject({ shape: "line", chargeMs: "T", strike: { formationPm: 80, knockMm: 3000 } });
    expect(TELEGRAPHS["lang-dau-dan-howl"]?.chargeMs).toBe(1500);
    expect(TELEGRAPHS["vuong-goi-dan"]?.chargeMs).toBe(1500);
  });
});

describe("telegraph lifecycle and shapes", () => {
  beforeEach(() => undefined);

  it("starts with a strike tick from chargeTicks at the slowest seat's k, then strikes or cancels once", () => {
    const { world, of } = makeWorld({ kPm: 750, seats: 2 });
    world.seats[1]!.kPm = 1300;
    expect(telegraphKPm(world)).toBe(750);
    const def = TELEGRAPHS["vuong-thiet-boi-xung"]!;
    const t = telegraph(world, def, null, { x: U(-10), z: 0 }, { x: U(-2), z: 0 });
    expect(t.strikeTick).toBe(chargeTicks(def, "balanced", 750));
    expect(t.reachU).toBe(U(8));
    expect(typedTelegraphActive(world)).toBe(true);
    expect(of("telegraph").map((e) => e.stage)).toEqual(["start"]);
    expect(of("telegraph")[0]).toMatchObject({ shape: "line", x: -10, toX: -2, reachM: 8, answers: def.answers, strikeTick: t.strikeTick });
    // A line stopped by a Trận Trụ reports its shortened reach, so `local` never hits beyond the impact.
    strikeTelegraph(world, t, { x: U(-6), z: 0 });
    const strike = of("telegraph")[1]!;
    expect(strike).toMatchObject({ stage: "strike", toX: -6, reachM: 4 });
    expect(world.telegraphs.active).toHaveLength(0);
    expect(typedTelegraphActive(world)).toBe(false);
    const other = telegraph(world, TELEGRAPHS["hoa-nha-dive-heart"]!, null, { x: 0, z: U(-2) }, { x: 0, z: U(-2) });
    cancelTelegraph(world, other.id);
    cancelTelegraph(world, other.id);
    expect(of("telegraph").filter((e) => e.stage === "cancel")).toHaveLength(1);
  });

  it("the sweep cancels a telegraph whose source died and strikes a due one", () => {
    const { world, of } = makeWorld();
    const vien = addBeast(world, "nham-vien", { x: U(0), z: U(-11) });
    const throwDef = TELEGRAPHS["nham-vien-throw-heart"]!;
    const a = telegraph(world, throwDef, { slot: vien.slot, serial: vien.serial }, { x: 0, z: 0 }, { x: 0, z: 0 });
    vien.telegraph = a.id;
    const b = telegraph(world, TELEGRAPHS["vuong-vo-xe"]!, null, { x: 0, z: U(-6) }, { x: 0, z: 0 });
    world.tick = b.strikeTick;
    vien.alive = false;
    stepTelegraphs(world);
    expect(of("telegraph").filter((e) => e.stage !== "start").map((e) => [e.id, e.stage])).toEqual([
      [a.id, "cancel"],
      [b.id, "strike"],
    ]);
  });

  it("tests points inside circle, cell, line and cone shapes, and the heart disk", () => {
    const { world } = makeWorld();
    const circle = telegraph(world, TELEGRAPHS["nham-vien-throw-node"]!, null, { x: U(3), z: 0 }, { x: U(3), z: 0 });
    expect(inTelegraph(circle, U(4.9), 0)).toBe(true);
    expect(inTelegraph(circle, U(5.1), 0)).toBe(false);
    expect(inTelegraph(circle, U(5.1), 0, U(0.4))).toBe(true);
    expect(touchesHeart(circle)).toBe(true); // 3 m away, r 2 m + heart edge 2 m
    const line = telegraph(world, TELEGRAPHS["thiet-giap-tru-ram"]!, null, { x: 0, z: U(-10) }, { x: 0, z: U(-2) });
    expect(inTelegraph(line, U(0.9), U(-5))).toBe(true);
    expect(inTelegraph(line, U(1.1), U(-5))).toBe(false);
    expect(inTelegraph(line, 0, U(-11))).toBe(false);
    expect(touchesHeart(line)).toBe(true);
    const cone = telegraph(world, TELEGRAPHS["vuong-vo-xe"]!, null, { x: 0, z: U(-8) }, { x: 0, z: U(-1) });
    expect(cone.to).toEqual({ x: 0, z: U(-2) }); // aimed at the node, 6 m long
    expect(inTelegraph(cone, 0, U(-3))).toBe(true);
    expect(inTelegraph(cone, U(3), U(-2.5))).toBe(true); // half chord 3.46 m at the far end
    expect(inTelegraph(cone, U(3), U(-6))).toBe(false); // near the apex the cone is narrow
    expect(inTelegraph(cone, 0, U(-1.5))).toBe(false);
    // A strike event's shape reads back to the same u (local's view of it).
    const event = { def: line.def, x: 0, z: -10, toX: 0, toZ: -2, reachM: 8, widthM: 2 };
    expect(shapeFromEvent(event)).toEqual({ def: line.def, from: line.from, to: line.to, reachU: line.reachU, widthU: line.widthU });
  });
});
