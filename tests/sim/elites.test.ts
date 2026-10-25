import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/fixed", () => import("./beasts-fixture").then((f) => f.fakeFixed));
vi.mock("../../src/sim/events", () => import("./beasts-fixture").then((f) => f.fakeEvents));
vi.mock("../../src/sim/world", () => import("./beasts-fixture").then((f) => f.fakeWorld));
vi.mock("../../src/sim/field", () => import("./beasts-fixture").then((f) => f.fakeField));
vi.mock("../../src/sim/spawn", () => import("./beasts-fixture").then((f) => f.fakeSpawn));
vi.mock("../../src/sim/pace", () => import("./beasts-fixture").then((f) => f.fakePace));
vi.mock("../../src/sim/formation", () => import("./beasts-fixture").then((f) => f.fakeFormation));
vi.mock("../../src/sim/wards", () => import("./beasts-fixture").then((f) => f.fakeWards));
vi.mock("../../src/sim/words", () => import("./beasts-fixture").then((f) => f.fakeWords));

import { ELITE_TRAITS } from "../../src/content/data/elites";
import { ELITES } from "../../src/content/rules";
import { effectiveSpeedPm, initBeast } from "../../src/sim/beasts";
import { stepElites } from "../../src/sim/elites";
import { speciesW100 } from "../../src/sim/targeting";
import { U, addBeast, calls, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

describe("tinh anh (canon §10.3)", () => {
  it("has the three MVP traits: Cuồng +30 % speed, Thiết Bì +2 W and armour +1, Hồi Nguyên 1.5 %/s after 3 s", () => {
    expect(ELITE_TRAITS.cuong).toMatchObject({ speedPct: 30, extraW100: 0, armourStep: 0, regenPmPerS: 0 });
    expect(ELITE_TRAITS["thiet-bi"]).toMatchObject({ speedPct: 0, extraW100: 200, armourStep: 1, regenPmPerS: 0 });
    expect(ELITE_TRAITS["hoi-nguyen"]).toMatchObject({ speedPct: 0, extraW100: 0, regenPmPerS: 15, regenAfterMs: 3000 });
  });

  it("is W × 1.6 (+ Thiết Bì's 2 W) with Thế 40, armour one tier up, faster with Cuồng", () => {
    const { world } = makeWorld();
    const far = { x: U(-15), z: U(-17) };
    const cuong = addBeast(world, "phong-lang", { ...far, elite: "cuong" });
    expect(cuong).toMatchObject({ elite: "cuong", hpMax: 144, hp: 144, armour: 0, posture: { value: ELITES.posture, max: 40 } });
    expect(effectiveSpeedPm(world, cuong)).toBe(1_820_000);
    const tru = addBeast(world, "thiet-giap-tru", { ...far, elite: "thiet-bi" });
    // (3 × 1.6 + 2) W = 6.8 W = 612 HP; armour G2 → G3.
    expect(tru).toMatchObject({ hpMax: 612, armour: 3, threatW100: 680 });
    const vien = addBeast(makeWorld({ preset: "relax" }).world, "nham-vien", { elite: "hoi-nguyen" });
    // 3.2 W × 90 × 0.85 (medium beasts take the preset factor).
    expect(vien.hpMax).toBe(245);
  });

  it("makes the canon §13.3 wave sums: wave 5 = 68.6 W with Trư Thiết Bì and Viên Hồi Nguyên", () => {
    const cluster = 7 * speciesW100("thach-thu", null);
    const wave5 = 9 * cluster + 13 * 100 + 6 * 80 + 4 * 200 + speciesW100("nham-vien", "hoi-nguyen") + 4 * 300 + speciesW100("thiet-giap-tru", "thiet-bi");
    expect(wave5 / 100).toBeCloseTo(68.6, 1);
    const wave6 = 11 * cluster + 9 * 100 + speciesW100("phong-lang", "cuong") + 8 * 80 + 6 * 200 + speciesW100("nham-vien", "thiet-bi") + 4 * 300 + 700 + 600;
    expect(wave6 / 100).toBeCloseTo(84.6, 1);
  });

  it("Hồi Nguyên heals 1.5 % a second once 3 s pass without a hit, up to full", () => {
    const { world } = makeWorld({ preset: "balanced" });
    const vien = addBeast(world, "nham-vien", { x: U(0), z: U(-15), elite: "hoi-nguyen" });
    expect(vien.hpMax).toBe(288);
    vien.hp = 200;
    vien.lastHitTick = 0;
    run(world, 180, [stepElites]);
    expect(vien.hp).toBe(200);
    run(world, 61, [stepElites]);
    expect(vien.hp).toBe(204); // + round(288 × 1.5 %)
    run(world, 60, [stepElites]);
    expect(vien.hp).toBe(208);
    // A hit resets the 3 s.
    vien.lastHitTick = world.tick;
    run(world, 150, [stepElites]);
    expect(vien.hp).toBe(208);
    run(world, 60 * 30, [stepElites]);
    expect(vien.hp).toBe(288);
  });
});

describe("Ấn requests (canon §6.2, §10.3)", () => {
  it("goes to the elite nearest the heart first, at most 2 live, only while the Bàn Quyết is live", () => {
    const { world } = makeWorld({ phase: "break" });
    const far = addBeast(world, "phong-lang", { x: U(0), z: U(-16), elite: "cuong" });
    const near = addBeast(world, "phong-lang", { x: U(0), z: U(-6), elite: "hoi-nguyen" });
    const mid = addBeast(world, "nham-vien", { x: U(0), z: U(-11), elite: "thiet-bi" });
    addBeast(world, "phong-lang", { x: U(0), z: U(-3) });
    stepElites(world);
    expect(calls.seals).toEqual([]);
    world.phase = "wave";
    stepElites(world);
    expect(calls.seals.map((s) => s.beast)).toEqual([near.serial]);
    stepElites(world);
    expect(calls.seals.map((s) => s.beast)).toEqual([near.serial, mid.serial]);
    stepElites(world);
    expect(far.seal).toBe(-1);
    near.alive = false;
    near.seal = -1;
    stepElites(world);
    expect(far.seal).toBeGreaterThanOrEqual(0);
  });

  it("gives no new Ấn to a beast whose Thế cannot drop (broken, the 15 s after)", () => {
    const { world } = makeWorld();
    const broken = addBeast(world, "phong-lang", { x: U(0), z: U(-4), elite: "cuong" });
    const next = addBeast(world, "phong-lang", { x: U(0), z: U(-9), elite: "cuong" });
    broken.posture!.brokenUntil = 100;
    broken.posture!.immuneUntil = 1000;
    stepElites(world);
    expect(calls.seals.map((s) => s.beast)).toEqual([next.serial]);
    world.tick = 1000;
    stepElites(world);
    expect(calls.seals.map((s) => s.beast)).toEqual([next.serial, broken.serial]);
  });

  it("puts the Vương first, a general next, and none on a down seat", () => {
    const { world } = makeWorld({ phase: "boss" });
    const elite = addBeast(world, "phong-lang", { x: U(0), z: U(-3), elite: "cuong" });
    const general = addBeast(world, "lang-dau-dan", { x: U(0), z: U(-5) });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: U(0), z: U(-12) });
    world.seats[0]!.downUntil = 100;
    stepElites(world);
    expect(calls.seals).toEqual([]);
    world.seats[0]!.downUntil = -1;
    stepElites(world);
    stepElites(world);
    expect(calls.seals.map((s) => s.beast)).toEqual([vuong.serial, elite.serial]);
    expect(general.seal).toBe(-1);
  });
});
