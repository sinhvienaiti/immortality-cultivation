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
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { M0A_WAVES } from "../../src/content/data/waves";
import { BOSS, GATES, GENERAL, POSTURE } from "../../src/content/rules";
import type { BeastState, PointU, World } from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";
import { effectiveSpeedPm, initBeast, slowFactorPm, stepBeasts } from "../../src/sim/beasts";
import { callW100, phaseFor, stepBoss, summonCapW100 } from "../../src/sim/boss";
import { damageImmune, postureHit, stepPosture } from "../../src/sim/posture";
import { stepBeastAttacks } from "../../src/sim/pressure";
import { speciesW100 } from "../../src/sim/targeting";
import { chargeTicks } from "../../src/sim/telegraph";
import { U, addBeast, calls, fakeWards, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

/** Lane 5's part of the world step, in the world's order. */
const STEPS = [stepBeasts, stepBeastAttacks, stepBoss, stepPosture];
const DEF = BOSSES["thiet-boi-lang-vuong"];
const CHARGE = TELEGRAPHS["vuong-thiet-boi-xung"]!;
const heartLost = () => calls.formation.reduce((sum, call) => sum + call.amount, 0);

type Of = ReturnType<typeof makeWorld>["of"];
const starts = (of: Of, def: string) => of("telegraph").filter((e) => e.stage === "start" && e.def === def);
const strikesOf = (of: Of, def: string) => of("telegraph").filter((e) => e.stage === "strike" && e.def === def);

/** Cleanup's part for a test kill: the slot frees, the live count drops. */
function kill(world: World, beast: BeastState): void {
  beast.alive = false;
  beast.freed = true;
  world.beasts.live -= 1;
  world.beasts.free.push(beast.slot);
}

/** Runs until `done` holds (at most `limit` ticks); returns the ticks it took. */
function runUntil(world: World, done: () => boolean, limit = 6000): number {
  let n = 0;
  while (!done() && n < limit) {
    run(world, 1, STEPS);
    n += 1;
  }
  if (!done()) throw new Error("runUntil: not reached in " + limit + " ticks");
  return n;
}

describe("Thú Vương data (canon §10.5)", () => {
  it("W 64, Thế 100, 3 phases: P1 Vồ Xé + Gọi Đàn 30 s, P2 Thiết Bối Xung and no Gọi Đàn, P3 +25 %, Gọi Đàn 18 s, charge 15 s", () => {
    expect(DEF).toMatchObject({ w100: BOSS.w100, posture: BOSS.posture, tier: "boss" });
    expect(DEF.phases.map((p) => [p.untilHpPct, p.summonEveryMs, p.speedPct])).toEqual([
      [60, 30_000, 0],
      [30, null, 0],
      [0, 18_000, 25],
    ]);
    expect(DEF.phases[2]!.chargeEveryMs).toBe(15_000);
    expect(DEF.phases[0]!.chargeEveryMs).toBeNull();
    expect(DEF.phases[1]!.attacks).not.toContain("vuong-goi-dan");
  });

  it("one Gọi Đàn is 1 Thạch Thử cluster + 2 Phong Lang = 4.31 W; the cap is 30 % W_Vương by seats (19.2 W solo)", () => {
    expect(callW100(DEF)).toBe(431);
    expect(summonCapW100(makeWorld().world, DEF)).toBe(1920);
    expect(summonCapW100(makeWorld({ seats: 2 }).world, DEF)).toBe(3264);
    // Four calls fit solo (~17 W, canon §10.5), a fifth would not.
    expect(4 * 431).toBeLessThanOrEqual(1920);
    expect(5 * 431).toBeGreaterThan(1920);
  });

  it("phase by HP: P1 while > 60 %, P2 while > 30 %, then P3", () => {
    const { world } = makeWorld({ phase: "boss", wave: 0 });
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { wave: 0 });
    const at = (pct: number) => {
      vuong.hp = Math.round((vuong.hpMax * pct) / 100);
      return phaseFor(vuong, DEF);
    };
    expect([at(100), at(61), at(60), at(31), at(30), at(1)]).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("Lang Đầu Đàn: Tru Đàn (canon §10.4)", () => {
  it("rings 1.5 s while the general stands still, then 3 Phong Lang leave the nearest gate as summons of its wave", () => {
    const { world, of } = makeWorld({ wave: 4 });
    const general = addBeast(world, "lang-dau-dan", { x: U(12), z: U(-15), wave: 4 });
    run(world, 1, STEPS);
    const ring = starts(of, "lang-dau-dan-howl");
    expect(ring).toHaveLength(1);
    expect(ring[0]!.strikeTick - ring[0]!.tick).toBe(90);
    const at = { x: general.x, z: general.z };
    run(world, 88, STEPS);
    expect({ x: general.x, z: general.z }).toEqual(at);
    expect(calls.spawns).toEqual([]);
    run(world, 2, STEPS);
    expect(calls.spawns).toEqual([{ species: "phong-lang", count: 3, gate: "B", wave: 4, summoned: true }]);
    const called = world.beasts.list.filter((b) => b.summoned);
    expect(called.map((b) => b.threatW100)).toEqual([50, 50, 50]);
    expect(general.howls).toBe(1);
    // It walks on after the ring.
    run(world, 2, STEPS);
    expect({ x: general.x, z: general.z }).not.toEqual(at);
  });

  it("at most once every 20 s and 2 times a wave", () => {
    const { world, of } = makeWorld({ wave: 4 });
    const general = addBeast(world, "lang-dau-dan", { x: U(-10), z: U(-16), wave: 4 });
    run(world, 60 * 60, STEPS);
    const ticks = starts(of, "lang-dau-dan-howl").map((e) => e.tick);
    expect(ticks).toEqual([0, 1200]);
    expect(general.howls).toBe(2);
    expect(calls.spawns).toHaveLength(2);
  });

  it("two generals in one wave share its cap (summonMaxW100: 2 × 3 W)", () => {
    const { world } = makeWorld({ wave: 6 });
    addBeast(world, "lang-dau-dan", { x: U(-10), z: U(-16), wave: 6 });
    addBeast(world, "lang-dau-dan", { x: U(10), z: U(-16), wave: 6 });
    run(world, 60 * 60, STEPS);
    expect(calls.spawns.reduce((sum, call) => sum + call.count * 100, 0)).toBeLessThanOrEqual(600);
    expect(calls.spawns).toHaveLength(2);
  });

  it("skips its turn when the live cap has no room for the whole call (no queue)", () => {
    const { world, of } = makeWorld({ wave: 4, liveCap: 4 });
    const general = addBeast(world, "lang-dau-dan", { x: U(-10), z: U(-16), wave: 4 });
    const filler = addBeast(world, "phong-lang", { x: U(10), z: U(-16), wave: 4 });
    run(world, 1, STEPS);
    expect(starts(of, "lang-dau-dan-howl")).toEqual([]);
    expect(general.howlReadyAt).toBe(1200);
    // Room comes back at once, the call does not: the next turn is 20 s later.
    kill(world, filler);
    run(world, 600, STEPS);
    expect(starts(of, "lang-dau-dan-howl")).toEqual([]);
    run(world, 700, STEPS);
    expect(starts(of, "lang-dau-dan-howl").map((e) => e.tick)).toEqual([1200]);
  });

  it("stage data: a general is ≤ 35 % of its wave's W, and its wave counts the most its howls may call (canon §10.4, §13.1)", () => {
    const general = GENERALS["lang-dau-dan"];
    const howlW100 = general.howl.perWave * general.howl.count * BEASTS[general.howl.species].w100;
    expect(howlW100).toBe(600);
    for (const wave of M0A_WAVES) {
      const groups = wave.groups;
      if (!groups.some((g) => g.species === "lang-dau-dan")) continue;
      let w100 = wave.summonMaxW100;
      for (const g of groups) w100 += speciesW100(g.species, null) * g.count + (g.elite ? speciesW100(g.species, g.elite) - speciesW100(g.species, null) : 0);
      expect(general.w100 * 100, wave.id).toBeLessThanOrEqual(GENERAL.maxWaveHpPct * w100);
      expect(wave.summonMaxW100, wave.id).toBeGreaterThanOrEqual(howlW100);
    }
  });

  it("a held or broken general loses the call", () => {
    const { world, of } = makeWorld({ wave: 4 });
    const general = addBeast(world, "lang-dau-dan", { x: U(-10), z: U(-16), wave: 4 });
    run(world, 1, STEPS);
    general.hardUntil = world.tick + 120;
    run(world, 120, STEPS);
    expect(of("telegraph").map((e) => e.stage)).toEqual(["start", "cancel"]);
    expect(calls.spawns).toEqual([]);
    expect(general.howls).toBe(0);
  });
});

/** A Vương 12 m north of the heart, adopted in P1 (node off the line unless given). */
function vuongAt(options: { node?: PointU | null; pillar?: PointU; seed?: number } = {}) {
  const fixture = makeWorld({ phase: "boss", wave: 0, node: options.node === undefined ? null : options.node, seed: options.seed, pillars: options.pillar ? [{ id: "west", at: options.pillar }] : [] });
  const vuong = addBeast(fixture.world, "thiet-boi-lang-vuong", { x: 0, z: U(-12), wave: 0 });
  run(fixture.world, 1, STEPS);
  return { ...fixture, vuong };
}

/** Drops the Vương to `pct` % HP and runs through the roar into the next phase. */
function toPhase(world: World, vuong: BeastState, phase: number, pct: number): void {
  vuong.hp = Math.round((vuong.hpMax * pct) / 100);
  runUntil(world, () => world.boss.phase === phase && world.tick >= world.boss.roarUntil);
}

describe("Thiết Bối Lang Vương: phases (canon §10.5)", () => {
  it("is adopted in P1 when it enters; gets an Ấn; Vồ Xé cones the node for 2.0 s, every 8 s", () => {
    const { world, of, vuong } = vuongAt({ node: { x: U(2), z: U(1) } });
    expect(world.boss).toMatchObject({ phase: 1, beast: { slot: vuong.slot, serial: vuong.serial }, nextSummon: 1800 });
    expect(calls.seals.map((s) => s.beast)).toEqual([vuong.serial]);
    runUntil(world, () => starts(of, "vuong-vo-xe").length >= 2);
    const [first, second] = starts(of, "vuong-vo-xe");
    expect(first).toMatchObject({ shape: "cone", reachM: 6, source: { slot: vuong.slot, serial: vuong.serial } });
    expect(Math.hypot(first!.toX - first!.x, first!.toZ - first!.z)).toBeCloseTo(6, 2);
    // Aimed at the node (2; 1): the cone's axis and the line to the node are parallel.
    const cross = (first!.toX - first!.x) * (1 - first!.z) - (first!.toZ - first!.z) * (2 - first!.x);
    expect(Math.abs(cross)).toBeLessThan(0.01);
    expect(first!.strikeTick - first!.tick).toBe(120);
    expect(second!.tick - first!.tick).toBe(480);
    // Players only (local): the heart never loses anything to it.
    expect(strikesOf(of, "vuong-vo-xe").length).toBeGreaterThan(0);
    expect(heartLost()).toBe(0);
  });

  it("P1 calls the pack every 30 s: ring 1.5 s, cluster + 2 wolves at the nearest gate, paying no ĐĐ", () => {
    const { world, of } = vuongAt();
    run(world, 1800, STEPS);
    expect(starts(of, "vuong-goi-dan").map((e) => e.tick)).toEqual([1800]);
    run(world, 91, STEPS);
    expect(calls.spawns).toEqual([
      { species: "thach-thu", count: 7, gate: "A", wave: 0, summoned: true },
      { species: "phong-lang", count: 2, gate: "A", wave: 0, summoned: true },
    ]);
    expect(world.beasts.list.filter((b) => b.summoned).every((b) => b.threatW100 === 0)).toBe(true);
    expect(world.boss.summonedW100).toBe(431);
    run(world, 1800, STEPS);
    expect(starts(of, "vuong-goi-dan").map((e) => e.tick)).toEqual([1800, 3600]);
  });

  it("does not call when the live cap is full; the turn is skipped, not queued", () => {
    const { world, of } = vuongAt();
    const fillers: BeastState[] = [];
    while (world.beasts.live < world.liveCap - 5) fillers.push(addBeast(world, "phong-lang", { x: U(15), z: U(-17) }));
    run(world, 1800, STEPS);
    expect(starts(of, "vuong-goi-dan")).toEqual([]);
    for (const filler of fillers.slice(0, 20)) kill(world, filler);
    run(world, 1700, STEPS);
    expect(starts(of, "vuong-goi-dan")).toEqual([]);
    run(world, 200, STEPS);
    expect(starts(of, "vuong-goi-dan").map((e) => e.tick)).toEqual([3600]);
  });

  it("phase change: roar 2.5 s with no damage, the old Ấn and telegraphs cancelled, Thế full, then P2 with no Gọi Đàn", () => {
    const { world, of, vuong } = vuongAt();
    run(world, 1800, STEPS); // the P1 call is ringing
    expect(world.boss.summonTelegraph).toBeGreaterThanOrEqual(0);
    postureHit(world, vuong, 30, "slot2");
    const seal = vuong.seal;
    expect(seal).toBeGreaterThanOrEqual(0);
    vuong.hp = Math.round(vuong.hpMax * 0.59);
    run(world, 1, STEPS);
    expect(world.boss).toMatchObject({ phase: 2, roarUntil: world.tick - 1 + 150 });
    expect(vuong.mode).toBe("roar");
    expect(damageImmune(world, vuong)).toBe(true);
    expect(calls.releases).toEqual([{ word: seal, reason: "phase" }]);
    expect(vuong.posture).toMatchObject({ value: 100, max: 100 });
    expect(of("telegraph").filter((e) => e.def === "vuong-goi-dan").map((e) => e.stage)).toEqual(["start", "cancel"]);
    // No new Ấn while it roars; one again after.
    const sealsBefore = calls.seals.length;
    run(world, 148, STEPS);
    expect(calls.seals.length).toBe(sealsBefore);
    run(world, 3, STEPS);
    expect(damageImmune(world, vuong)).toBe(false);
    expect(calls.seals.length).toBe(sealsBefore + 1);
    // P2 never calls the pack.
    run(world, 60 * 90, STEPS);
    expect(calls.spawns).toEqual([]);
    expect(starts(of, "vuong-goi-dan")).toHaveLength(1);
  });

  it("P3: Cuồng +25 % speed, Gọi Đàn every 18 s, Thiết Bối Xung 15 s after the last one ended", () => {
    const { world, of, vuong } = vuongAt();
    toPhase(world, vuong, 2, 59);
    toPhase(world, vuong, 3, 29);
    // 1.2 m/s × 1.25 (then the Kết Giới, if it stands inside it).
    expect(effectiveSpeedPm(world, vuong)).toBe(Math.round((1_500_000 * slowFactorPm(world, vuong)) / 1000));
    const p3 = world.boss.roarUntil;
    runUntil(world, () => strikesOf(of, "vuong-thiet-boi-xung").length >= 1 && starts(of, "vuong-thiet-boi-xung").length >= 2, 4000);
    const charges = starts(of, "vuong-thiet-boi-xung");
    const firstStrike = strikesOf(of, "vuong-thiet-boi-xung")[0]!;
    const next = charges.find((e) => e.tick > firstStrike.tick)!;
    expect(next.tick - firstStrike.tick).toBeGreaterThanOrEqual(900);
    expect(next.tick - firstStrike.tick).toBeLessThanOrEqual(902);
    runUntil(world, () => starts(of, "vuong-goi-dan").length >= 2, 4000);
    const calls18 = starts(of, "vuong-goi-dan").filter((e) => e.tick >= p3);
    expect(calls18[0]!.tick - p3).toBe(1080);
    expect(calls18[1]!.tick - calls18[0]!.tick).toBe(1080);
  });

  it("marks the Vương defeated once it is gone", () => {
    const { world, vuong } = vuongAt();
    kill(world, vuong);
    run(world, 2, STEPS);
    expect(world.boss.defeated).toBe(true);
  });
});

describe("Thiết Bối Xung and its four answers (canon §10.5)", () => {
  /** P2 with the Vương back at 12 m; returns once its first charge has started. */
  function charging(options: { pillar?: PointU } = {}) {
    const fixture = vuongAt(options);
    toPhase(fixture.world, fixture.vuong, 2, 59);
    runUntil(fixture.world, () => fixture.vuong.telegraph >= 0);
    const start = starts(fixture.of, "vuong-thiet-boi-xung")[0]!;
    return { ...fixture, start };
  }

  it("a red line from the Vương to the heart charging T (Cân bằng: Ấn of 6 letters, 8.0 s), the Ấn on the Vương", () => {
    const { world, vuong, start } = charging();
    expect(start).toMatchObject({ shape: "line", toX: 0, answers: ["seal", "pillar", "ward", "mech"] });
    expect(start.toZ).toBeCloseTo(-2, 3);
    expect(start.z).toBeCloseTo(-12, 1);
    expect(start.strikeTick - start.tick).toBe(chargeTicks(CHARGE, "balanced", 1000));
    expect((start.strikeTick - start.tick) / 60).toBeGreaterThanOrEqual(8.0);
    expect(vuong.mode).toBe("ram");
    expect(vuong.seal).toBeGreaterThanOrEqual(0);
    void world;
  });

  it("unsolved: Trận Lực −8 %, the strike carries the 3 m push for local, the Vương lands at the heart edge", () => {
    const { world, of, vuong, start } = charging();
    run(world, start.strikeTick - world.tick + 1, STEPS);
    expect(calls.formation).toEqual([{ amount: 80, source: "thiet-boi-xung" }]);
    const strike = strikesOf(of, "vuong-thiet-boi-xung")[0]!;
    expect(strike).toMatchObject({ def: "vuong-thiet-boi-xung", toX: 0 });
    expect(CHARGE.strike.knockMm).toBe(3000);
    expect(Math.hypot(vuong.x, vuong.z) / 60_000).toBeLessThan(2.2);
  });

  it("(a) Ấn and skills break its Thế: the charge is cancelled, nothing lost, the next one 20 s later (P2)", () => {
    const { world, of, vuong } = charging();
    run(world, 120, STEPS);
    postureHit(world, vuong, POSTURE.seal, "seal");
    postureHit(world, vuong, POSTURE.seal, "seal");
    postureHit(world, vuong, 40, "slot5");
    expect(vuong.mode).toBe("downed");
    expect(of("telegraph").filter((e) => e.def === "vuong-thiet-boi-xung").map((e) => e.stage)).toEqual(["start", "cancel"]);
    const broke = world.tick;
    run(world, 2, STEPS);
    expect(world.boss.nextCharge).toBe(broke + 1200);
    run(world, 900, STEPS);
    expect(heartLost()).toBe(0);
  });

  it("(b) an intact Trận Trụ on the line: the Vương rams it, stunned 2 s (not a break), the pillar takes a ram; two rams crack it", () => {
    const { world, of, vuong, start } = charging({ pillar: { x: 0, z: U(-7) } });
    run(world, start.strikeTick - world.tick + 1, STEPS);
    const strike = strikesOf(of, "vuong-thiet-boi-xung")[0]!;
    expect(strike.toZ).toBeCloseTo(-8, 2);
    expect(heartLost()).toBe(0);
    expect(calls.pillarHits).toEqual(["west"]);
    expect(vuong.hardUntil - (world.tick - 1)).toBe(120);
    expect(vuong.posture!.brokenUntil).toBe(-1);
    expect(vuong.z).toBe(U(-8));
    // The second ram cracks it; the third goes through.
    runUntil(world, () => strikesOf(of, "vuong-thiet-boi-xung").length >= 3, 6000);
    expect(calls.pillarHits).toEqual(["west", "west"]);
    expect(world.formation.pillars[0]!.cracked).toBe(true);
    expect(heartLost()).toBe(80);
  });

  it("(c) a ward ring crossing the line at the strike tick halves it and spends a charge; one gone by then does not", () => {
    const crossed = charging();
    const ward = fakeWards.createWard(crossed.world, 0, { x: U(1.5), z: U(-6) }, crossed.start.strikeTick + 10);
    run(crossed.world, crossed.start.strikeTick - crossed.world.tick + 1, STEPS);
    expect(heartLost()).toBe(40);
    expect(ward.charges).toBe(2);
    const missed = charging();
    fakeWards.createWard(missed.world, 0, { x: U(1.5), z: U(-6) }, missed.start.strikeTick - 1);
    run(missed.world, missed.start.strikeTick - missed.world.tick + 1, STEPS);
    expect(heartLost()).toBe(80);
    const aside = charging();
    fakeWards.createWard(aside.world, 0, { x: U(3), z: U(-6) }, aside.start.strikeTick + 10);
    run(aside.world, aside.start.strikeTick - aside.world.tick + 1, STEPS);
    expect(heartLost()).toBe(80);
  });

  it("(d) Phong Ấn Võng holding it while it charges takes 15 Thế; the hold alone does not stop the charge", () => {
    const { world, of, vuong, start } = charging();
    run(world, 60, STEPS);
    vuong.hardUntil = world.tick + 180;
    postureHit(world, vuong, POSTURE.phongAn, "mechanism");
    expect(vuong.posture!.value).toBe(85);
    run(world, start.strikeTick - world.tick + 1, STEPS);
    expect(strikesOf(of, "vuong-thiet-boi-xung")).toHaveLength(1);
    expect(heartLost()).toBe(80);
    expect(vuong.hardTicks).toBe(180);
  });
});

describe("Gọi Đàn stays ≤ 30 % W_Vương (PB-09), property over 20 seeds", () => {
  it("never calls in P2, never over the cap, only with room for the whole call", () => {
    expect(GATES.seeds).toBe(20);
    const cap = summonCapW100(makeWorld().world, DEF);
    let capped = 0;
    for (let seed = 1; seed <= GATES.seeds; seed += 1) {
      const { world, sink } = makeWorld({ seed, phase: "boss", wave: 0, node: { x: 0, z: U(3) } });
      const rng = createRng(seed).ai;
      const vuong = addBeast(world, "thiet-boi-lang-vuong", { wave: 0 });
      let callsSeen = 0;
      let p2Calls = 0;
      let seen = 0;
      // A slow fight (~22 HP/s, about 4 min): P1 and P3 last long enough to ask for more calls than the cap allows.
      for (let t = 0; t < 60 * 420 && vuong.alive; t += 1) {
        const room = world.liveCap - world.beasts.live;
        run(world, 1, STEPS);
        for (; seen < sink.all.length; seen += 1) {
          const event = sink.all[seen]!;
          if (event.type !== "telegraph" || event.def !== "vuong-goi-dan" || event.stage !== "start") continue;
          callsSeen += 1;
          if (world.boss.phase === 2) p2Calls += 1;
          // Room for the whole call (1 cluster of 7 + 2 wolves) when it started.
          expect(room, "seed " + seed).toBeGreaterThanOrEqual(9);
        }
        expect(world.boss.summonedW100).toBeLessThanOrEqual(cap);
        if (t % 60 === 0 && !damageImmune(world, vuong)) vuong.hp -= rng.int(5, 40);
        if (vuong.hp <= 0) kill(world, vuong);
        if (rng.chance(0.02)) {
          const summoned = world.beasts.list.filter((b) => b.alive && b.summoned);
          if (summoned.length > 0) kill(world, summoned[rng.int(0, summoned.length - 1)]!);
        }
      }
      const clusters = calls.spawns.filter((c) => c.species === "thach-thu").length;
      expect(clusters * callW100(DEF), "seed " + seed).toBeLessThanOrEqual(cap);
      expect(p2Calls, "seed " + seed).toBe(0);
      expect(callsSeen, "seed " + seed).toBeGreaterThanOrEqual(clusters);
      expect(clusters, "seed " + seed).toBeGreaterThanOrEqual(2);
      expect(vuong.alive, "seed " + seed).toBe(false);
      if (world.boss.summonedW100 + callW100(DEF) > cap) capped += 1;
    }
    // The cap did bite: most seeds wanted a fifth call and did not get it.
    expect(capped).toBeGreaterThan(10);
  });
});
