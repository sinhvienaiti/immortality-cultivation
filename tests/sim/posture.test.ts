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

import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { POSTURE } from "../../src/content/rules";
import { initBeast, stepBeasts } from "../../src/sim/beasts";
import { damageImmune, isBroken, postureFromTypedHp, postureHit, refillPosture, sealPosture, stepPosture } from "../../src/sim/posture";
import { telegraph } from "../../src/sim/telegraph";
import { U, addBeast, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

describe("Thế and phá thế (canon §10.7)", () => {
  it("drops by each hit, breaks at 0 for 6 s (× 1.5 is combat's, via isBroken), then 15 s without loss, then fills again", () => {
    const { world, of } = makeWorld();
    const elite = addBeast(world, "phong-lang", { x: U(0), z: U(-12), elite: "cuong" });
    expect(elite.posture).toMatchObject({ value: 40, max: 40 });
    postureHit(world, elite, POSTURE.seal, "seal");
    expect(elite.posture!.value).toBe(5);
    expect(isBroken(world, elite)).toBe(false);
    postureHit(world, elite, 20, "slot2");
    expect(elite.posture!.value).toBe(0);
    expect(isBroken(world, elite)).toBe(true);
    expect(elite.posture!.brokenUntil).toBe(world.tick + 360);
    expect(elite.mode).toBe("downed");
    expect(of("posture").map((e) => [e.stage, e.value])).toEqual([
      ["change", 5],
      ["change", 0],
      ["break", 0],
    ]);
    // Broken: no movement, counted as hard control.
    const at = { x: elite.x, z: elite.z };
    run(world, 360, [stepBeasts, stepPosture]);
    expect({ x: elite.x, z: elite.z }).toEqual(at);
    expect(elite.hardTicks).toBe(360);
    expect(isBroken(world, elite)).toBe(false);
    // 15 s of no loss after the break, then full again.
    postureHit(world, elite, 35, "seal");
    expect(elite.posture!.value).toBe(0);
    run(world, 900, [stepPosture]);
    expect(elite.posture!.value).toBe(0);
    run(world, 1, [stepPosture]);
    expect(elite.posture).toMatchObject({ value: 40, brokenUntil: -1, immuneUntil: -1 });
    expect(of("posture").at(-1)).toMatchObject({ stage: "recover", value: 40, max: 40 });
    postureHit(world, elite, 10, "mechanism");
    expect(elite.posture!.value).toBe(30);
  });

  it("a break cancels the beast's telegraphs (Thiết Bối Xung answer (a))", () => {
    const { world, of } = makeWorld({ phase: "boss" });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: U(0), z: U(-12) });
    const charge = telegraph(world, TELEGRAPHS["vuong-thiet-boi-xung"]!, { slot: vuong.slot, serial: vuong.serial }, { x: vuong.x, z: vuong.z }, { x: 0, z: U(-2) });
    vuong.telegraph = charge.id;
    postureHit(world, vuong, 100, "seal");
    expect(of("telegraph").map((e) => e.stage)).toEqual(["start", "cancel"]);
    expect(vuong.telegraph).toBe(-1);
    expect(world.telegraphs.active).toEqual([]);
  });

  it("Ấn takes 35 solo, 35 / √seats in a team", () => {
    expect(sealPosture(1)).toBe(35);
    expect(sealPosture(2)).toBe(25);
    expect(sealPosture(3)).toBe(20);
  });

  it("typed damage takes 1 Thế per whole W (90 HP at K0), carrying the rest", () => {
    const { world } = makeWorld();
    const elite = addBeast(world, "nham-vien", { x: U(0), z: U(-12), elite: "thiet-bi" });
    for (let sword = 0; sword < 3; sword += 1) postureFromTypedHp(world, elite, 33, "slot1");
    expect(elite.posture!.value).toBe(39);
    expect(elite.posture!.typedHp).toBe(9);
    postureFromTypedHp(world, elite, 225, "slot2");
    expect(elite.posture!.value).toBe(37);
    const k1 = makeWorld({ realm: 1, gPm: 1120 }).world;
    const other = addBeast(k1, "nham-vien", { x: U(0), z: U(-12), elite: "cuong" });
    postureFromTypedHp(k1, other, 100, "slot1");
    expect(other.posture!.value).toBe(40); // 1 W = 101 HP at K1: not yet
  });

  it("the Vương's roar: no damage, no Thế loss; refill brings it back to full with `recover`", () => {
    const { world, of } = makeWorld({ phase: "boss" });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: U(0), z: U(-12) });
    postureHit(world, vuong, 30, "slot2");
    vuong.mode = "roar";
    vuong.modeUntil = world.tick + 150;
    expect(damageImmune(world, vuong)).toBe(true);
    postureHit(world, vuong, 30, "seal");
    expect(vuong.posture!.value).toBe(70);
    refillPosture(world, vuong);
    expect(vuong.posture!.value).toBe(100);
    expect(of("posture").at(-1)?.stage).toBe("recover");
    world.tick += 150;
    expect(damageImmune(world, vuong)).toBe(false);
    // Plain beasts have no Thế.
    const lang = addBeast(world, "phong-lang");
    postureHit(world, lang, 35, "seal");
    expect(lang.posture).toBeNull();
  });
});
