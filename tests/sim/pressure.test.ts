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

import type { World } from "../../src/content/types";
import { initBeast, stepBeasts } from "../../src/sim/beasts";
import { stepBoss } from "../../src/sim/boss";
import { beastDamage, stepBeastAttacks } from "../../src/sim/pressure";
import { U, addBeast, calls, fakeWards, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

/** The world's order for Lane 5's steps, with the telegraph sweep at the end of stepBoss. */
const STEPS = [stepBeasts, stepBeastAttacks, stepBoss];
const heartLost = () => calls.formation.reduce((sum, call) => sum + call.amount, 0);
const strikes = (of: ReturnType<typeof makeWorld>["of"]) => of("telegraph").filter((e) => e.stage === "strike");

describe("beast damage × g(K) × preset (canon §10.8, §13.4)", () => {
  it("scales, half up after each factor", () => {
    expect(beastDamage(makeWorld().world, 40)).toBe(40);
    expect(beastDamage(makeWorld({ preset: "challenge" }).world, 40)).toBe(48);
    expect(beastDamage(makeWorld({ preset: "relax" }).world, 40)).toBe(28);
    expect(beastDamage(makeWorld({ realm: 1, gPm: 1120 }).world, 40)).toBe(45);
    expect(beastDamage(makeWorld({ preset: "relax" }).world, 12)).toBe(8);
  });
});

describe("bites at the heart edge (canon §10.8)", () => {
  it("swarm 1, small 2, medium 4 a second, starting a second after arriving", () => {
    const { world } = makeWorld({ node: null });
    addBeast(world, "thach-thu", { x: 0, z: U(-1.9) });
    addBeast(world, "phong-lang", { x: U(1.9), z: 0 });
    addBeast(world, "nham-vien", { x: U(-1.9), z: 0 }).target = { kind: "heart" };
    run(world, 60, STEPS);
    expect(heartLost()).toBe(0);
    run(world, 1, STEPS);
    expect(calls.formation.map((c) => c.amount).sort()).toEqual([1, 2, 4]);
    run(world, 600, STEPS);
    expect(heartLost()).toBe(11 * 7);
  });

  it("carries below one HP: Thư giãn × 0.7 bites 7 HP in 10 s for a rat", () => {
    const { world } = makeWorld({ preset: "relax", node: null });
    addBeast(world, "thach-thu", { x: 0, z: U(-1.9) });
    run(world, 61 + 600 - 1, STEPS);
    expect(heartLost()).toBe(7);
  });
});

describe("Nham Viên throws (canon §10.2): every 3 s, Trận Trụ blocks", () => {
  function thrower(options: { node?: boolean; pillar?: boolean; cracked?: boolean } = {}) {
    const fixture = makeWorld({
      node: options.node === false ? null : { x: U(2), z: U(1) },
      pillars: options.pillar ? [{ id: "west", at: { x: 0, z: U(-6) }, cracked: options.cracked === true }] : [],
    });
    // Serial 2: even, aims at the heart from 11 m north.
    addBeast(fixture.world, "phong-lang", { x: U(30), z: U(30) }).alive = false;
    const vien = addBeast(fixture.world, "nham-vien", { x: 0, z: U(-10.9) });
    return { ...fixture, vien };
  }

  it("strikes the heart 1.6 s after it starts (−12), then again 3 s after the last start", () => {
    const { world, of, vien } = thrower();
    run(world, 1, STEPS);
    expect(vien.mode).toBe("throw");
    expect(vien.telegraph).toBeGreaterThanOrEqual(0);
    run(world, 96, STEPS);
    expect(strikes(of)).toHaveLength(1);
    expect(calls.formation).toEqual([{ amount: 12, source: "nham-vien:throw" }]);
    run(world, 180 - 96, STEPS);
    expect(of("telegraph").filter((e) => e.stage === "start")).toHaveLength(2);
    expect(of("telegraph").filter((e) => e.stage === "start")[1]!.tick).toBe(180);
  });

  it("a Trận Trụ on the throw line stops the rock, cracked or not: cancel, no damage", () => {
    for (const cracked of [false, true]) {
      const { world, of } = thrower({ pillar: true, cracked });
      run(world, 1 + 96, STEPS);
      expect(of("telegraph").map((e) => e.stage)).toEqual(["start", "cancel"]);
      expect(heartLost()).toBe(0);
    }
  });

  it("a throw at the Tâm nhãn hurts players there (local) but never the heart", () => {
    const { world, of } = makeWorld({ node: { x: U(2), z: U(1) } });
    const vien = addBeast(world, "nham-vien", { x: U(2), z: U(-9.9) }); // serial 1: the node
    run(world, 1 + 96, STEPS);
    expect(vien.target).toEqual({ kind: "node", node: "tam-nhan" });
    expect(strikes(of)[0]).toMatchObject({ def: "nham-vien-throw-node", toX: 2, toZ: 1 });
    expect(heartLost()).toBe(0);
  });

  it("a held thrower loses the throw (Phong Ấn Võng)", () => {
    const { world, of, vien } = thrower();
    run(world, 1, STEPS);
    vien.hardUntil = world.tick + 200;
    run(world, 96, STEPS);
    expect(of("telegraph").map((e) => e.stage)).toEqual(["start", "cancel"]);
    expect(heartLost()).toBe(0);
  });
});

describe("Hỏa Nha dives (canon §10.2)", () => {
  function diver(node: { x: number; z: number } | null, serial: "heart" | "node") {
    const fixture = makeWorld({ node });
    if (serial === "heart") addBeast(fixture.world, "phong-lang", { x: U(30), z: U(30) }).alive = false;
    const nha = addBeast(fixture.world, "hoa-nha", { x: U(-3), z: U(-6) });
    return { ...fixture, nha };
  }

  it("dives at the heart edge: −3 and 30 Sinh lực for players inside, 1.5 s; pillars do not stop it", () => {
    const { world, of } = diver(null, "heart");
    world.formation.pillars.push({ id: "west", at: { x: U(-1), z: U(-3) }, radiusU: U(1), rams: 0, cracked: false });
    run(world, 200, STEPS);
    const dive = strikes(of)[0]!;
    expect(dive.def).toBe("hoa-nha-dive-heart");
    expect(dive.strikeTick - of("telegraph")[0]!.tick).toBe(90);
    expect(Math.hypot(dive.toX, dive.toZ)).toBeCloseTo(2, 2);
    expect(calls.formation[0]).toEqual({ amount: 3, source: "hoa-nha:dive" });
  });

  it("at the Tâm nhãn: −3 only when the zone touches the heart; a ward over the node blocks it with one charge", () => {
    // ~5–9 m to fly at 1.7 m/s inside the Kết Giới, then 1.5 s: one strike within 500 ticks (the next starts 4 s after the first).
    const near = diver({ x: U(2), z: U(1) }, "node");
    run(near.world, 500, STEPS);
    expect(strikes(near.of).map((e) => e.def)).toEqual(["hoa-nha-dive-node"]);
    expect(heartLost()).toBe(3);
    const far = diver({ x: U(5), z: U(3) }, "node");
    run(far.world, 500, STEPS);
    expect(strikes(far.of)).toHaveLength(1);
    expect(heartLost()).toBe(0);
    const warded = diver({ x: U(2), z: U(1) }, "node");
    const ward = fakeWards.createWard(warded.world, 0, { x: U(2), z: U(1) }, 1000);
    run(warded.world, 500, STEPS);
    expect(strikes(warded.of)).toHaveLength(1);
    expect(heartLost()).toBe(0);
    expect(calls.wardUses).toEqual([{ seat: 0, wardId: ward.id }]);
    expect(ward.charges).toBe(2);
  });
});

describe("Thiết Giáp Trư rams then captures (canon §8.2, §10.2)", () => {
  /** A Trư 10 m north of the heart: it rams at tick 0, the strike lands at tick 84. */
  function ram(options: { pillar?: boolean } = {}) {
    const fixture = makeWorld({ node: { x: U(2), z: U(1) }, pillars: options.pillar ? [{ id: "east", at: { x: 0, z: U(-5) } }] : [] });
    const tru = addBeast(fixture.world, "thiet-giap-tru", { x: 0, z: U(-10) });
    return { ...fixture, tru };
  }

  it("rams from 10 m along a 1.4 s line: −40, lands at the heart edge, then walks onto the Tâm nhãn and holds it", () => {
    const { world, of } = makeWorld({ node: { x: U(2), z: U(1) } });
    const tru = addBeast(world, "thiet-giap-tru", { x: 0, z: U(-11) });
    let started = -1;
    for (let n = 0; n < 200 && started < 0; n += 1) {
      run(world, 1, STEPS);
      if (tru.telegraph >= 0) started = world.tick - 1;
    }
    expect(Math.hypot(tru.x, tru.z) / 60_000).toBeLessThanOrEqual(10);
    const line = of("telegraph")[0]!;
    expect(line).toMatchObject({ def: "thiet-giap-tru-ram", shape: "line", toX: 0, toZ: -2 });
    expect(line.strikeTick - started).toBe(84);
    run(world, 84, STEPS);
    expect(calls.formation).toEqual([{ amount: 40, source: "thiet-giap-tru:ram" }]);
    expect(tru.target).toEqual({ kind: "node", node: "tam-nhan" });
    // 3.6 m at 0.85 m/s inside the Kết Giới, then 3 s standing on the node.
    run(world, 500, STEPS);
    expect([tru.x, tru.z]).toEqual([U(2), U(1)]);
    expect(tru.mode).toBe("capture");
    expect(calls.occupy.length).toBeGreaterThan(0);
    expect(world.formation.nodes[0]!.on).toBe(false);
    // On the node, within the heart edge region? (2.24 m: no) — it does not bite from there.
    expect(calls.formation.filter((c) => c.source.endsWith(":bite"))).toEqual([]);
  });

  it("an intact Trận Trụ on the line stops it short: no Trận Lực lost, the strike ends at the pillar", () => {
    const { world, of, tru } = ram({ pillar: true });
    run(world, 1 + 84, STEPS);
    const strike = strikes(of)[0]!;
    // It walked one tick (1 m/s) before the ram started 10 m out; the line ends on the pillar's rim (r 1 m at 5 m).
    expect(strike.z).toBeCloseTo(-10 + 1 / 60, 3);
    expect(strike.toZ).toBeCloseTo(-6, 3);
    expect(strike.reachM).toBeCloseTo(strike.toZ - strike.z, 3);
    expect(heartLost()).toBe(0);
    expect(tru.z).toBe(U(-6));
    expect(calls.pillarHits).toEqual([]);
  });

  it("a ram that only grazes a pillar stops on the line where it meets the rim, never off the line", () => {
    const { world, of } = makeWorld({ node: null, pillars: [{ id: "east", at: { x: U(0.6), z: U(-5) } }] });
    const beast = addBeast(world, "thiet-giap-tru", { x: 0, z: U(-10) });
    run(world, 1 + 84, STEPS);
    const strike = strikes(of)[0]!;
    expect(strike.toX).toBeCloseTo(0, 3);
    // Enters the r 1 m circle at z = −5 − √(1 − 0.36) = −5.8.
    expect(strike.toZ).toBeCloseTo(-5.8, 2);
    expect(beast.x).toBe(0);
  });

  it("a ward ring crossing the line at the strike tick halves it (canon §12.1)", () => {
    const { world } = ram();
    const ward = fakeWards.createWard(world, 0, { x: U(1.5), z: U(-6) });
    run(world, 1 + 84, STEPS);
    expect(heartLost()).toBe(20);
    expect(ward.charges).toBe(2);
  });

  it("a Trư that reaches the heart without a ram goes on to the node; with the node held by another Trư it bites", () => {
    const { world } = makeWorld({ node: { x: U(2), z: U(1) } });
    const first = addBeast(world, "thiet-giap-tru", { x: 0, z: U(-2.5) });
    // Close enough that its ram cooldown keeps it from ramming: it simply walks in.
    first.attackAt = 10_000;
    run(world, 400, STEPS);
    expect([first.x, first.z]).toEqual([U(2), U(1)]);
    expect(first.mode).toBe("capture");
    const second = addBeast(world, "thiet-giap-tru", { x: U(-2.5), z: 0 });
    second.attackAt = 10_000;
    run(world, 200, STEPS);
    expect(second.target).toEqual({ kind: "heart" });
    expect(second.mode).toBe("bite");
    // The holder dies: the node is free again.
    first.alive = false;
    run(world, 2, STEPS);
    expect(second.target).toEqual({ kind: "node", node: "tam-nhan" });
  });

  it("a held Trư loses the ram", () => {
    const { world, of, tru } = ram();
    run(world, 1, STEPS);
    tru.hardUntil = world.tick + 120;
    run(world, 84, STEPS);
    expect(of("telegraph").map((e) => e.stage)).toEqual(["start", "cancel"]);
    expect(heartLost()).toBe(0);
  });
});

describe("no pressure after the match", () => {
  it("does nothing in victory or defeat", () => {
    const { world, of } = makeWorld();
    addBeast(world, "thach-thu", { x: 0, z: U(-1.9) });
    (world as World).phase = "defeat";
    run(world, 300, STEPS);
    expect(heartLost()).toBe(0);
    expect(of("telegraph")).toEqual([]);
  });
});
