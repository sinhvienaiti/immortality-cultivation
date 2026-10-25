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

import { BEASTS, GENERALS } from "../../src/content/data/beasts";
import { BOSSES } from "../../src/content/data/boss";
import { BEAST_TIERS, BOSS, FIELD, GENERAL, PRESSURE, REF_OUTPUT, STAGE_M0A } from "../../src/content/rules";
import type { BeastId } from "../../src/content/types";
import { effectiveSpeedPm, hardControlSharePm, initBeast, isAirborne, slowFactorPm, stepBeasts, threatW100 } from "../../src/sim/beasts";
import { stepBeastAttacks } from "../../src/sim/pressure";
import { U, addBeast, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

const dist = (x: number, z: number, px = 0, pz = 0): number => Math.hypot(x - px, z - pz);

describe("the five families (canon §10.2) and Lang Đầu Đàn (§10.4)", () => {
  it("match the canon table: W, speed, role, armour, group size", () => {
    const rows: Record<BeastId, [string, number, number, boolean, number]> = {
      "thach-thu": ["T01", 33, 1600, false, 0],
      "phong-lang": ["T02", 100, 1400, false, 0],
      "hoa-nha": ["T03", 80, 2000, true, 0],
      "nham-vien": ["T04", 200, 1000, false, 0],
      "thiet-giap-tru": ["T05", 300, 1000, false, 2],
    };
    for (const [id, [code, w100, speed, flying, armour]] of Object.entries(rows)) {
      expect(BEASTS[id as BeastId]).toMatchObject({ id, code, w100, speedMm: speed, flying, armour, element: null });
    }
    expect(BEASTS["thach-thu"].groupSize).toEqual([6, 8]);
    expect(BEASTS["phong-lang"].groupSize).toEqual([3, 5]);
    expect(BEASTS["nham-vien"].standOffMm).toBe(11_000);
    expect(BEASTS["thiet-giap-tru"].capturesNodes).toBe(true);
    expect(STAGE_M0A.clusterSize).toBeGreaterThanOrEqual(BEASTS["thach-thu"].groupSize[0]);
    const general = GENERALS["lang-dau-dan"];
    expect(general).toMatchObject({ w100: 700, posture: GENERAL.posture, aura: { radiusMm: 6000, speedPct: 15, family: "lang" } });
    expect(general.howl).toEqual({ telegraph: "lang-dau-dan-howl", species: "phong-lang", count: 3, cooldownMs: 20_000, perWave: 2 });
  });

  it("sit in their tier's W band and bite like their tier (swarm 1, small 2, medium 4 a second)", () => {
    for (const def of [...Object.values(BEASTS), ...Object.values(GENERALS)]) {
      const band = BEAST_TIERS[def.tier as keyof typeof BEAST_TIERS];
      expect(def.w100, def.id).toBeGreaterThanOrEqual(band[0]);
      expect(def.w100, def.id).toBeLessThanOrEqual(band[1]);
    }
    for (const def of Object.values(BEASTS)) {
      if (def.flying) expect(def.bitePerS).toBe(0);
      else expect(def.bitePerS, def.id).toBe(PRESSURE.bitePerS[def.tier as "swarm" | "small" | "medium"]);
    }
  });

  it("place one placeholder colour per family (canon D27, §10.9)", () => {
    const byFamily = new Map<string, string>();
    for (const def of Object.values(BEASTS)) {
      expect(byFamily.has(def.family)).toBe(false);
      byFamily.set(def.family, def.placeholder.colour);
    }
    expect(new Set(byFamily.values()).size).toBe(5);
    expect(Object.values(BEASTS).map((def) => def.placeholder.gait).sort()).toEqual(["biped", "flyer", "quadruped", "quadruped", "swarm"]);
  });
});

describe("initBeast: HP = round(W × 90 × g(K) × preset), integers (canon §7.1, D38)", () => {
  it("gives the canon's K0 Cân bằng HP: Thạch Thử 30, Phong Lang 90, Hỏa Nha 72, Nham Viên 180, Thiết Giáp Trư 270", () => {
    const { world } = makeWorld();
    const hp = (species: BeastId) => addBeast(world, species).hpMax;
    expect([hp("thach-thu"), hp("phong-lang"), hp("hoa-nha"), hp("nham-vien"), hp("thiet-giap-tru")]).toEqual([30, 90, 72, 180, 270]);
  });

  it("scales medium beasts by preset but never swarm or small ones (§13.4), and by g(K)", () => {
    const relax = makeWorld({ preset: "relax" }).world;
    const challenge = makeWorld({ preset: "challenge" }).world;
    expect(addBeast(relax, "nham-vien").hpMax).toBe(153);
    expect(addBeast(challenge, "nham-vien").hpMax).toBe(207);
    expect(addBeast(relax, "phong-lang").hpMax).toBe(90);
    expect(addBeast(challenge, "thach-thu").hpMax).toBe(30);
    const k1 = makeWorld({ realm: 1, gPm: 1120 }).world;
    expect(addBeast(k1, "phong-lang").hpMax).toBe(101);
  });

  it("fills the beast: tier, flags, Thế, threat, behaviour fields", () => {
    const { world } = makeWorld();
    const lang = addBeast(world, "phong-lang");
    expect(lang).toMatchObject({ tier: "small", general: false, boss: false, posture: null, telegraph: -1, seal: -1, attackAt: -1, threatW100: 100, mode: "walk" });
    const general = addBeast(world, "lang-dau-dan");
    expect(general).toMatchObject({ tier: "general", general: true, hpMax: 630, posture: { value: 60, max: 60 }, howls: 0, howlReadyAt: world.tick });
    const vuong = addBeast(world, "thiet-boi-lang-vuong");
    expect(vuong).toMatchObject({ tier: "boss", boss: true, hpMax: 5760, posture: { value: 100, max: 100 }, threatW100: 0 });
  });

  it("threat ĐĐ (canon §14.2): own W, elite W × 1.6 + extra, summons 50 %, the Vương 0", () => {
    expect(threatW100("phong-lang", null, false)).toBe(100);
    expect(threatW100("phong-lang", "cuong", false)).toBe(160);
    expect(threatW100("thiet-giap-tru", "thiet-bi", false)).toBe(680);
    expect(threatW100("phong-lang", null, true)).toBe(50);
    expect(threatW100("thiet-boi-lang-vuong", null, false)).toBe(0);
  });
});

describe("the Thú Vương's size (canon §10.5)", () => {
  it("W 64 = round(0.7 × D_đơn × 120 s / 60) at the trial D_đơn; HP 5 760 solo, × 1.7 / 2.4 for 2 / 3 seats", () => {
    const def = BOSSES["thiet-boi-lang-vuong"];
    const wanted = Math.round((0.7 * (REF_OUTPUT.dSingleW100PerMin / 100) * BOSS.targetMs) / 60_000);
    expect(BOSS.targetMs).toBe(120_000);
    expect(def.w100).toBe(wanted * 100);
    expect(def.w100).toBe(BOSS.w100);
    expect(addBeast(makeWorld().world, "thiet-boi-lang-vuong").hpMax).toBe(5760);
    expect(addBeast(makeWorld({ seats: 2 }).world, "thiet-boi-lang-vuong").hpMax).toBe(9792);
    expect(addBeast(makeWorld({ seats: 3 }).world, "thiet-boi-lang-vuong").hpMax).toBe(13_824);
  });
});

describe("speed: preset × Cuồng × aura × slows (canon §7.2, §8.1)", () => {
  /** Seconds from a gate to the Kết Giới edge at this speed. */
  const secondsTo9m = (speedPm: number, routeMm: number) => ((routeMm - 9000) * 60) / (speedPm / 1000) / 60;

  it("small beasts reach the Kết Giới in 8–12 s at k 1 Cân bằng; Cuồng, aura and both stay ≥ 6 s (canon §8.1, PB-08)", () => {
    const { world } = makeWorld();
    const far = { x: U(-15), z: U(-17) };
    const lang = addBeast(world, "phong-lang", far);
    const thu = addBeast(world, "thach-thu", far);
    const nha = addBeast(world, "hoa-nha", { x: U(-20), z: U(-18) });
    const range = FIELD.approachMs.map((ms) => ms / 1000);
    expect(secondsTo9m(effectiveSpeedPm(world, lang), FIELD.routeMm)).toBeCloseTo(10.71, 1);
    expect(secondsTo9m(effectiveSpeedPm(world, thu), FIELD.routeMm)).toBeCloseTo(9.38, 1);
    expect(secondsTo9m(effectiveSpeedPm(world, nha), FIELD.skyRouteMm)).toBeCloseTo(8.95, 1);
    for (const beast of [lang, thu, nha]) {
      const route = beast === nha ? FIELD.skyRouteMm : FIELD.routeMm;
      const s = secondsTo9m(effectiveSpeedPm(world, beast), route);
      expect(s).toBeGreaterThanOrEqual(range[0]!);
      expect(s).toBeLessThanOrEqual(range[1]!);
    }
    const cuong = addBeast(world, "phong-lang", { ...far, elite: "cuong" });
    expect(secondsTo9m(effectiveSpeedPm(world, cuong), FIELD.routeMm)).toBeCloseTo(8.24, 1);
    addBeast(world, "lang-dau-dan", { x: far.x + U(2), z: far.z });
    const inAura = secondsTo9m(effectiveSpeedPm(world, lang), FIELD.routeMm);
    const both = secondsTo9m(effectiveSpeedPm(world, cuong), FIELD.routeMm);
    expect(inAura).toBeCloseTo(9.32, 1);
    // Multiplied, not added (canon §8.1: both 7.2 s).
    expect(both).toBeCloseTo(7.17, 1);
    expect(Math.min(inAura, both)).toBeGreaterThanOrEqual(FIELD.approachFloorMs / 1000);
  });

  it("the aura reaches wolves within 6 m only, never the general itself", () => {
    const { world } = makeWorld();
    const general = addBeast(world, "lang-dau-dan", { x: U(-10), z: U(-15) });
    const near = addBeast(world, "phong-lang", { x: U(-10), z: U(-9.5) });
    const far = addBeast(world, "phong-lang", { x: U(-10), z: U(-8.5) });
    const rat = addBeast(world, "thach-thu", { x: U(-10), z: U(-14) });
    expect(effectiveSpeedPm(world, near)).toBe(1_610_000);
    expect(effectiveSpeedPm(world, far)).toBe(1_400_000);
    expect(effectiveSpeedPm(world, general)).toBe(1_400_000);
    expect(effectiveSpeedPm(world, rat)).toBe(1_600_000);
  });

  it("slows: the Kết Giới 15 %, same source keeps the strongest, sources multiply, total ≤ 60 %", () => {
    const { world } = makeWorld();
    const lang = addBeast(world, "phong-lang", { x: U(0), z: U(-8) });
    expect(slowFactorPm(world, lang)).toBe(850);
    lang.slows.push({ source: "kiem-thung", pct: 25, until: 100 }, { source: "kiem-thung", pct: 10, until: 100 });
    expect(slowFactorPm(world, lang)).toBe(638); // 0.85 × 0.75
    lang.slows.push({ source: "dinh-than", pct: 40, until: 100 });
    expect(slowFactorPm(world, lang)).toBe(400); // 0.85 × 0.75 × 0.6 = 0.38 → capped at 0.40
    world.tick = 100;
    expect(slowFactorPm(world, lang)).toBe(850);
    const preset = makeWorld({ preset: "relax" }).world;
    expect(effectiveSpeedPm(preset, addBeast(preset, "phong-lang", { x: U(-15), z: U(-17) }))).toBe(1_260_000);
  });
});

describe("movement", () => {
  it("a ground beast walks to the heart edge and bites there; it never moves while held, and counts the hold", () => {
    const { world } = makeWorld();
    const lang = addBeast(world, "phong-lang", { x: U(-15), z: U(-17) });
    // 13.7 m at 1.4 m/s, then 7 m at 1.19 m/s inside the Kết Giới: ~15.6 s.
    run(world, 1200, [stepBeasts]);
    expect(dist(lang.x, lang.z)).toBeLessThanOrEqual(U(2) + 1);
    expect(lang.mode).toBe("bite");
    expect(lang.speedPm).toBe(0);
    const other = addBeast(world, "phong-lang", { x: U(-15), z: U(-17) });
    other.hardUntil = world.tick + 60;
    run(world, 60, [stepBeasts]);
    expect([other.x, other.z]).toEqual([U(-15), U(-17)]);
    expect(other.mode).toBe("stunned");
    expect(other.hardTicks).toBe(60);
  });

  it("Nham Viên stops 11 m from its target and throws with a 1.6 s telegraph (PB-17, PB-27)", () => {
    const { world, of } = makeWorld({ node: { x: U(2), z: U(1) } });
    // Serial 1 (odd) aims at the Tâm nhãn, serial 2 (even) at the heart.
    const atNode = addBeast(world, "nham-vien", { x: U(-15), z: U(-17) });
    const atHeart = addBeast(world, "nham-vien", { x: U(15), z: U(-17) });
    const steps = [stepBeasts, stepBeastAttacks];
    let stoppedNode = -1;
    let stoppedHeart = -1;
    for (let n = 0; n < 1800 && (stoppedNode < 0 || stoppedHeart < 0); n += 1) {
      run(world, 1, steps);
      if (stoppedNode < 0 && atNode.telegraph >= 0) stoppedNode = world.tick;
      if (stoppedHeart < 0 && atHeart.telegraph >= 0) stoppedHeart = world.tick;
    }
    expect(atNode.target).toEqual({ kind: "node", node: "tam-nhan" });
    expect(atHeart.target).toEqual({ kind: "heart" });
    const step = 1000 / 60; // mm a tick at 1 m/s
    expect(dist(atNode.x / 60, atNode.z / 60, 2000, 1000)).toBeLessThanOrEqual(11_000);
    expect(dist(atNode.x / 60, atNode.z / 60, 2000, 1000)).toBeGreaterThan(11_000 - 2 * step);
    expect(dist(atHeart.x / 60, atHeart.z / 60)).toBeLessThanOrEqual(11_000);
    expect(dist(atHeart.x / 60, atHeart.z / 60)).toBeGreaterThan(11_000 - 2 * step);
    // ~13 s from a gate (canon §8.1), outside the Kết Giới, and the ring lasts 1.6 s at k 1.
    expect(stoppedHeart / 60).toBeGreaterThan(11);
    expect(stoppedHeart / 60).toBeLessThan(15);
    const starts = of("telegraph").filter((e) => e.stage === "start");
    expect(starts.map((e) => e.def).sort()).toEqual(["nham-vien-throw-heart", "nham-vien-throw-node"]);
    for (const start of starts) expect(start.strikeTick - start.tick).toBe(96);
    const heartThrow = starts.find((e) => e.def === "nham-vien-throw-heart")!;
    expect([heartThrow.toX, heartThrow.toZ, heartThrow.reachM]).toEqual([0, 0, 2]);
  });

  it("Hỏa Nha flies straight from its sky entry, hovers 3 m from its dive point, 4 m up; a hold pulls it down (canon §8.3)", () => {
    const { world } = makeWorld({ node: null });
    const nha = addBeast(world, "hoa-nha", { x: U(-20), z: U(-18) });
    expect(isAirborne(nha)).toBe(true);
    let path = 0;
    let last = { x: nha.x, z: nha.z };
    run(world, 30, [stepBeasts]);
    path += dist(nha.x - last.x, nha.z - last.z);
    // Straight at the heart: the bearing does not change.
    expect(Math.abs(nha.x / nha.z - -20 / -18)).toBeLessThan(0.01);
    expect(nha.cell).toBe(-1);
    expect(nha.y).toBe(U(4));
    last = { x: nha.x, z: nha.z };
    nha.hardUntil = world.tick + 30;
    run(world, 30, [stepBeasts]);
    expect([nha.x, nha.z]).toEqual([last.x, last.z]);
    expect(nha.y).toBe(0);
    expect(isAirborne(nha)).toBe(false);
    run(world, 1200, [stepBeasts]);
    expect(isAirborne(nha)).toBe(true);
    // The heart dive point is on the heart edge under its approach; it hovers 3 m from it (5 m from the centre).
    expect(dist(nha.x, nha.z) / 60_000).toBeCloseTo(5, 1);
    expect(nha.mode).toBe("dive");
    expect(path).toBeGreaterThan(0);
  });

  it("counts life and hard control for the 35 % measure (canon §8.3, Rồng G15)", () => {
    const { world } = makeWorld();
    const a = addBeast(world, "phong-lang", { x: U(-15), z: U(-17) });
    addBeast(world, "phong-lang", { x: U(15), z: U(-17) });
    a.hardUntil = 30;
    run(world, 100, [stepBeasts]);
    expect(world.stats.foeTicks).toBe(200);
    expect(world.stats.hardControlTicks).toBe(30);
    expect(hardControlSharePm(world)).toBe(150);
  });

  it("the Vương's straight retreat stops at the field's edge and holds there", () => {
    const { world } = makeWorld({ phase: "boss", wave: 0, node: null });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: U(0), z: U(4), wave: 0 });
    world.boss.phase = 2;
    // South of the heart the field ends at z = 8 m: it cannot back off to 12 m.
    run(world, 600, [stepBeasts]);
    expect(vuong.z).toBeLessThanOrEqual(U(8));
    expect(vuong.mode).toBe("hold");
  });

  it("never reads a player: the world holds no player position, beasts aim at heart, node or pillar points only", () => {
    const { world } = makeWorld();
    for (const species of ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru", "lang-dau-dan"] as const) addBeast(world, species);
    run(world, 600, [stepBeasts, stepBeastAttacks]);
    for (const beast of world.beasts.list) expect(["heart", "node"]).toContain(beast.target?.kind);
    expect(Object.keys(world.seats[0]!).filter((key) => /^(x|z|pos|position)$/i.test(key))).toEqual([]);
  });
});
