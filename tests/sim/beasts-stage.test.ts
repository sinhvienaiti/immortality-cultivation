import { describe, expect, it, vi } from "vitest";

/**
 * Lane 5's beasts on the real Thanh Thạch Ải with Lane 2's real flow field
 * (fixed, field, events, pace are not mocked); only the lanes still being
 * built are faked (formation, wards: Lane 4; words: Lane 3; the beast store).
 * Skipped while Lane 2's field or stage is still a step-0 stub.
 */
vi.mock("../../src/sim/world", () => import("./beasts-fixture").then((f) => f.fakeWorld));
vi.mock("../../src/sim/spawn", () => import("./beasts-fixture").then((f) => f.fakeSpawn));
vi.mock("../../src/sim/formation", () => import("./beasts-fixture").then((f) => f.fakeFormation));
vi.mock("../../src/sim/wards", () => import("./beasts-fixture").then((f) => f.fakeWards));
vi.mock("../../src/sim/words", () => import("./beasts-fixture").then((f) => f.fakeWords));

import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FIELD } from "../../src/content/rules";
import type { BeastState, FieldRuntime, PointU, SpeciesId, StageDef, World } from "../../src/content/types";
import { initBeast, stepBeasts } from "../../src/sim/beasts";
import { stepBoss } from "../../src/sim/boss";
import { createField } from "../../src/sim/field";
import { stepPosture } from "../../src/sim/posture";
import { stepBeastAttacks } from "../../src/sim/pressure";
import { U, addBeast, calls, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

function realField(): FieldRuntime | null {
  try {
    return THANH_THACH_AI.field === undefined ? null : createField(THANH_THACH_AI);
  } catch {
    return null;
  }
}
const FIELD_RT = realField();
const STEPS = [stepBeasts, stepBeastAttacks, stepBoss, stepPosture];

/** A fixture world on the real stage: its field, its Tâm nhãn and Trận Trụ. */
function stageWorld(options: { phase?: World["phase"]; wave?: number } = {}) {
  const fixture = makeWorld({ ...options, node: null });
  const world = fixture.world as unknown as { stage: StageDef; field: FieldRuntime } & World;
  const stage = THANH_THACH_AI;
  world.stage = stage;
  world.field = createField(stage);
  for (const node of stage.field.nodes) {
    world.formation.nodes.push({ id: node.id, at: { x: U(node.at.xMm / 1000), z: U(node.at.zMm / 1000) }, on: true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 });
  }
  for (const pillar of stage.field.pillars) {
    world.formation.pillars.push({ id: pillar.id, at: { x: U(pillar.at.xMm / 1000), z: U(pillar.at.zMm / 1000) }, radiusU: U(pillar.radiusMm / 1000), rams: 0, cracked: false });
  }
  return { ...fixture, world };
}

/** Gate A's spawn point, half a cell inside the field (Lane 2's gatePoint). */
const GATE_A: PointU = { x: U(-15), z: U(-17.75) };
const GATE_B: PointU = { x: U(15), z: U(-17.75) };
const meters = (b: { x: number; z: number }, p: PointU = { x: 0, z: 0 }) => Math.hypot(b.x - p.x, b.z - p.z) / 60_000;

/** Lane 2's FIELD.clearanceMm (room kept round obstacles; 0.4 m when this file was written). */
const CLEARANCE_MM = (FIELD as { readonly clearanceMm?: number }).clearanceMm ?? 400;

/** No beast ever stands inside a Trận Trụ (radius + the field's clearance, less one cell of slack for the pulled path). */
function outsidePillars(world: World, beast: BeastState): boolean {
  return world.formation.pillars.every((p) => meters(beast, p.at) >= p.radiusU / 60_000 + CLEARANCE_MM / 1000 - FIELD.cellMm / 1000);
}

describe.skipIf(FIELD_RT === null)("beasts on the real Thanh Thạch Ải field (Lane 2's flow field)", () => {
  it("each family from its gate reaches its attack: bite, 11 m throw (~13 s), dive, ram then the node; never inside a pillar", () => {
    const { world, of } = stageWorld();
    const add = (species: SpeciesId, at: PointU, gate: "A" | "B" | "sky" = "A") => addBeast(world, species, { x: at.x, z: at.z, gate });
    const lang = add("phong-lang", GATE_A);
    // Serials 2 and 3: the even one aims at the heart, the odd one at the Tâm nhãn.
    const vienB = add("nham-vien", GATE_B, "B");
    const vienA = add("nham-vien", GATE_A);
    const nha = add("hoa-nha", { x: U(-20), z: U(-18) }, "sky");
    const tru = add("thiet-giap-tru", GATE_B, "B");
    const vienes = [vienB, vienA];
    const firstThrow: Record<number, number> = {};
    for (let t = 0; t < 60 * 40; t += 1) {
      run(world, 1, STEPS);
      for (const beast of [lang, vienB, vienA, tru]) expect(outsidePillars(world, beast), beast.species + " at " + meters(beast)).toBe(true);
      for (const vien of vienes) if (firstThrow[vien.serial] === undefined && vien.telegraph >= 0) firstThrow[vien.serial] = world.tick;
    }
    expect(lang.mode).toBe("bite");
    expect(meters(lang)).toBeLessThanOrEqual(2.02);
    expect(vienes.map((v) => v.target!.kind).sort()).toEqual(["heart", "node"]);
    for (const vien of vienes) {
      const target = vien.target!.kind === "node" ? world.formation.nodes[0]!.at : { x: 0, z: 0 };
      expect(meters(vien, target)).toBeLessThanOrEqual(11);
      expect(meters(vien, target)).toBeGreaterThan(10.9);
    }
    // The heart thrower walks ~13 m from its gate at 1 m/s (canon §8.1: "dừng ném ở 11 m sau ~13 s").
    const heartVien = vienes.find((v) => v.target!.kind === "heart")!;
    expect(firstThrow[heartVien.serial]! / 60).toBeGreaterThan(11);
    expect(firstThrow[heartVien.serial]! / 60).toBeLessThan(16);
    expect(of("telegraph").some((e) => e.def === "hoa-nha-dive-heart" || e.def === "hoa-nha-dive-node")).toBe(true);
    expect(nha.cell).toBe(-1);
    expect(of("telegraph").some((e) => e.def === "thiet-giap-tru-ram")).toBe(true);
    expect(tru.target).toEqual({ kind: "node", node: "tam-nhan" });
    expect(tru.mode).toBe("capture");
    expect([tru.x, tru.z]).toEqual([world.formation.nodes[0]!.at.x, world.formation.nodes[0]!.at.z]);
  });

  it("steps 300 beasts (Lane 5's part of the tick) in linear time (canon §18.4 budget: ≤ 0.3 ms for the whole step)", () => {
    const { world } = stageWorld();
    (world as { liveCap: number }).liveCap = 300;
    const mix: SpeciesId[] = ["thach-thu", "thach-thu", "phong-lang", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru"];
    for (let n = 0; n < 300; n += 1) {
      const species = n === 0 ? "lang-dau-dan" : mix[n % mix.length]!;
      const gate = species === "hoa-nha" ? "sky" : n % 2 === 0 ? "A" : "B";
      const at = gate === "sky" ? { x: U(n % 4 === 0 ? -20 : 20), z: U(-18) } : gate === "A" ? GATE_A : GATE_B;
      addBeast(world, species, { x: at.x + U((n % 7) / 10), z: at.z + U((n % 5) / 10), gate, elite: n % 50 === 7 ? "hoi-nguyen" : null });
    }
    run(world, 120, STEPS);
    const t0 = performance.now();
    run(world, 600, STEPS);
    const perTickMs = (performance.now() - t0) / 600;
    console.log("lane 5 steps, 300 beasts: " + perTickMs.toFixed(3) + " ms a tick");
    expect(world.beasts.live).toBe(300 + calls.spawns.reduce((sum, c) => sum + c.count, 0));
    // Vitest's module transform about doubles the cost (bundled with esbuild it measured ~0.09 ms, lane 5 changelog);
    // this bound catches an O(n²) slip, not the budget itself (Lane 7's headless gate measures the whole step).
    expect(perTickMs).toBeLessThan(0.6);
  });

  it("the Vương walks in from gate A, cones the Tâm nhãn in P1, then charges from 12 m inside the field in P2", () => {
    const { world, of } = stageWorld({ phase: "boss", wave: 0 });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: GATE_A.x, z: GATE_A.z, gate: "A", wave: 0 });
    run(world, 60 * 30, STEPS);
    expect(world.boss.phase).toBe(1);
    expect(of("telegraph").some((e) => e.def === "vuong-vo-xe" && e.stage === "strike")).toBe(true);
    expect(outsidePillars(world, vuong)).toBe(true);
    vuong.hp = Math.round(vuong.hpMax * 0.59);
    let charge = -1;
    for (let t = 0; t < 60 * 30 && charge < 0; t += 1) {
      run(world, 1, STEPS);
      if (vuong.telegraph >= 0 && vuong.mode === "ram") charge = vuong.telegraph;
    }
    expect(world.boss.phase).toBe(2);
    expect(charge).toBeGreaterThan(0);
    const start = of("telegraph").find((e) => e.id === charge && e.stage === "start")!;
    expect(Math.hypot(start.x, start.z)).toBeGreaterThan(11.9);
    expect(Math.hypot(start.x, start.z)).toBeLessThan(12.1);
    expect(start.z).toBeGreaterThanOrEqual(-18);
    expect(Math.hypot(start.toX, start.toZ)).toBeCloseTo(2, 2);
    // It lands: on a Trận Trụ (answer (b)) or at the heart edge (−8 %).
    run(world, start.strikeTick - world.tick + 1, STEPS);
    expect(calls.pillarHits.length + calls.formation.filter((c) => c.source === "thiet-boi-xung").length).toBe(1);  });
});
