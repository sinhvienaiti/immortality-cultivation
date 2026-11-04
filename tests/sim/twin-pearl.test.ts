// Field-wide key-2 geometry and the unchanged damage engine, behind the twin-pearl header flag.
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { kiemSkill } from "../../src/content/data/school-kiem";
import { TWIN_PEARL, TWIN_PEARL_END_TICK } from "../../src/content/data/twin-pearl";
import type { BeastState, Cast, StageDef, World } from "../../src/content/types";
import { createReplayHeader, matchRulesHash } from "../../src/app/app";
import { areaClusterLeft, createAreaHit, scaleHit, wHpOf } from "../../src/sim/combat";
import { emitCast } from "../../src/sim/cast";
import { gatePoint } from "../../src/sim/field";
import { dist2, isqrt, mToU, mmToU, mulDiv, mulDivSym, uToM } from "../../src/sim/fixed";
import { HASH_SKIP, hashWorldHex, hashedFloats } from "../../src/sim/hash";
import { createSkillsState, resolveCast, stepSkills } from "../../src/sim/skills";
import { POOL_CORRIDOR, POOL_LOTUS, POOL_PARTS, POOL_SKY, POOL_TOUCH, buildCastGeometry, distSegment2, headIndex, inBody, inDisc, inHoldDisc, inSkyReach, liveSamples, lotusRegion, sampleRoute, sideFor, splitLong, staticCoverage, twinPearlPool, volumesAt, type TwinDragon, type TwinPearlCast } from "../../src/sim/twin-pearl";
import { spawnBeast } from "../../src/sim/spawn";
import { createWorld, step } from "../../src/sim/world";
import { addBeast, addCluster, advance, at, castOf, makeWorld, setTamNhan, testHeader, THANH_THACH_AI } from "./combat-fixture";

function twinWorld(options: Parameters<typeof makeWorld>[0] = {}) {
  const made = makeWorld(options);
  (made.world as { header: World["header"] }).header = { ...made.world.header, swordKey2: "twin-pearl" };
  (made.world as { skills: World["skills"] }).skills = createSkillsState({ ...made.world, seats: made.world.seats.length });
  return made;
}

const ARENA: StageDef = { ...THANH_THACH_AI, id: "test-arena", field: { ...THANH_THACH_AI.field, minXMm: -20_000, maxXMm: 20_000, minZMm: -20_000, maxZMm: 20_000, mechSlots: [], pillars: [] } };
type Layout = "two" | "one" | "three" | "arena" | "behind" | "beast" | "crow" | "empty";
const LAYOUTS: Layout[] = ["two", "one", "three", "arena", "behind", "beast", "crow", "empty"];
type Position = { x: number; z: number; y: number };

/** Exact §9.8 creation order, metres until spawning. */
function layoutPoints(layout: Layout): Position[] {
  const out: Position[] = [];
  const ground = (x: number, z: number): void => { out.push({ x, z, y: 0 }); };
  const crow = (x: number, z: number): void => { out.push({ x, z, y: 4 }); };
  const stream = (ax: number, az: number, bx: number, bz: number, n: number): void => {
    for (let k = 0; k < n; k += 1) { const t = k / (n - 1); ground(ax + (bx - ax) * t + 0.5 * (k % 3 - 1), az + (bz - az) * t); }
  };
  if (layout === "two") { stream(-15, -17.5, -1.8, -2.2, 19); stream(15, -17.5, 1.8, -2.2, 19); crow(-19, -17); crow(19, -17); }
  if (layout === "one") { for (let k = 0; k < 38; k += 1) ground(0.6 * (k % 5 - 2), -17.5 + 15 * Math.floor(k / 5) / 7); crow(-1.5, -16); crow(1.5, -16); }
  if (layout === "three") { stream(-19.5, -6, -2.2, -1, 13); stream(0, -17.5, 0, -2.2, 13); stream(19.5, -6, 2.2, -1, 13); crow(-19, -17); crow(0, -17); crow(19, -17); }
  if (layout === "arena") {
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) for (const r of [5, 8, 11, 14, 17]) ground(x! * r, z! * r);
    crow(15, 0); crow(-15, 0); crow(0, 15); crow(0, -15);
  }
  if (layout === "behind") { for (let k = 0; k < 38; k += 1) ground(-18 + 3 * (k % 13), 4 + 1.5 * Math.floor(k / 13)); crow(-17, 7); crow(17, 7); }
  if (layout === "beast") ground(0, -12);
  if (layout === "crow") crow(-10, -12);
  return out;
}

function populate(world: World, layout: Layout, transform = (p: Position): Position => p): BeastState[] {
  return layoutPoints(layout).map((point) => {
    const p = transform(point);
    return spawnBeast(world, p.y === 0 ? "phong-lang" : "hoa-nha", p.y === 0 ? "A" : "sky", { wave: 0, x: mToU(p.x), z: mToU(p.z) });
  });
}
const request = (world: World, options: Partial<Cast> = {}): Cast => castOf(world, 2, { origin: at(0, 3), ...options });
function castNow(world: World, options: Partial<Cast> = {}): TwinPearlCast {
  expect(resolveCast(world, request(world, options))).toBe(true);
  return world.skills.twinPearl!.casts.at(-1)!;
}
const slot2Hits = (of: ReturnType<typeof makeWorld>["of"], beast: BeastState) => of("hit").filter((hit) => hit.source === "slot2" && hit.beast.slot === beast.slot && hit.beast.serial === beast.serial);
const durable = (beasts: BeastState[]): void => { for (const b of beasts) b.hp = b.hpMax = 100_000; };
const nodeLength = (d: TwinDragon): number => {
  let n = 0;
  for (let k = 2; k < d.nodes.length; k += 2) n += isqrt(dist2(d.nodes[k - 2]!, d.nodes[k - 1]!, d.nodes[k]!, d.nodes[k + 1]!));
  return uToM(n);
};

describe("the flag off leaves today's key 2", () => {
  it("default headers carry no swordKey2, the skills state has today's keys only, and key 2 queues today's line", () => {
    const header = testHeader();
    expect("swordKey2" in header).toBe(false);
    const app = createReplayHeader(
      { seed: 1, stage: THANH_THACH_AI, preset: "balanced", pacing: true, profile: { e: 35, a: 950, cv: 250 }, loadout: { guard: "ward", tamPhap: "kiem-tam" }, records: [], level: 1, dueCount: 0, nowMs: 0 } as never,
      [],
      0,
      1000,
      "00000000",
    );
    expect("swordKey2" in app).toBe(false);
    const { world } = makeWorld();
    expect(Object.keys(world.skills)).toEqual(["seats", "strikes", "zones", "nextId"]);
    addBeast(world, "nham-vien", { x: 0, z: -6 });
    expect(resolveCast(world, castOf(world, 2, { origin: at(0, 3) }))).toBe(true);
    expect(world.skills.strikes.map((s) => s.kind)).toEqual(["line"]);
  });

  it("with the flag key 2 goes to the grey box (no line strike), keeps the 8 s cooldown, and holds on an empty field", () => {
    const { world } = twinWorld();
    expect(Object.keys(world.skills)).toEqual(["seats", "strikes", "zones", "nextId", "twinPearl"]);
    const before = hashWorldHex(world);
    expect(resolveCast(world, castOf(world, 2, { origin: at(0, 3) }))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    addBeast(world, "nham-vien", { x: 0, z: -15 });
    world.tick = 100;
    expect(resolveCast(world, castOf(world, 2, { origin: at(0, 3) }))).toBe(true);
    expect(world.skills.strikes).toHaveLength(0);
    expect(world.skills.twinPearl!.casts).toHaveLength(1);
    expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(100 + 480);
    expect(kiemSkill(2).cooldownMs).toBe(8000);
  });
});


describe("F0 geometry from the lateral axis and snapshot (§9.3–9.4)", () => {
  it("splits the two-gate snapshot 20/20 by x, with dense slot/serial arrays and cut2 for n=0,1,2", () => {
    const { world } = twinWorld();
    const beasts = populate(world, "two");
    const g = buildCastGeometry(world, request(world));
    expect([g.fx, g.fz, g.rx, g.rz]).toEqual([0, -1000, 1000, 0]);
    expect(g.sideSlot.filter((s) => s === 1)).toHaveLength(20);
    expect(g.sideSlot.filter((s) => s === 2)).toHaveLength(20);
    for (const b of beasts) expect(g.sideSlot[b.slot]).toBe(b.x < 0 ? 1 : 2);
    expect(g.snapshot).toEqual(beasts.flatMap((b) => [b.slot, b.serial]));
    for (const [xs, cut] of [[[], 0], [[-3], -6], [[-3, 5], 2]] as const) {
      const { world: w } = twinWorld();
      for (const x of xs) addBeast(w, "phong-lang", { x, z: -8 });
      expect(buildCastGeometry(w, request(w)).cut2).toBe(mToU(cut));
    }
  });

  it("late beasts use cut2 once, tie by serial parity, and a reused slot receives its own side even with no budget", () => {
    const { world } = twinWorld();
    addBeast(world, "phong-lang", { x: -5, z: -8 });
    addBeast(world, "phong-lang", { x: 5, z: -8 });
    const cast = castNow(world);
    const late = [-1, 1, 0, 0].map((x) => addBeast(world, "phong-lang", { x, z: 0 }));
    expect(late.map((b) => sideFor(cast, b))).toEqual([0, 1, late[2]!.serial % 2, late[3]!.serial % 2]);
    late[0]!.x = mToU(10);
    expect(sideFor(cast, late[0]!)).toBe(0);
    const reused = { ...late[0]!, serial: late[0]!.serial + 100 };
    expect(sideFor(cast, reused)).toBe(1);
    const next = addBeast(world, "phong-lang", { x: -1, z: 0 });
    cast.pool.fill(0);
    advance(world, 1, [stepSkills]);
    expect(cast.sideSlot[next.slot]).toBe(1);
    expect(cast.sideSerial[next.slot]).toBe(next.serial);
    expect(cast.book.some((b) => b.serial === next.serial)).toBe(false);
    expect(cast.sideSlot.every(Number.isInteger)).toBe(true);
  });

  it("pearl: two gates near (0,-5.9), a far centroid capped at 12 m, and empty/narrow fields clamped inward", () => {
    const { world } = twinWorld();
    populate(world, "two");
    const g = buildCastGeometry(world, request(world));
    expect(Math.hypot(uToM(g.px), uToM(g.pz) + 5.9)).toBeLessThanOrEqual(0.15);
    const far = twinWorld().world;
    for (let k = 0; k < 10; k += 1) addBeast(far, "phong-lang", { x: -15 + (k % 5 - 2) * 0.1, z: -16 + Math.floor(k / 5) * 0.1 });
    const p = buildCastGeometry(far, request(far));
    expect(Math.abs(isqrt(dist2(p.px, p.pz, p.hx, p.hz)) - mToU(12))).toBeLessThanOrEqual(2);
    const empty = twinWorld().world;
    expect(Object.values(buildCastGeometry(empty, request(empty))).length).toBeGreaterThan(0);
    const e = buildCastGeometry(empty, request(empty));
    expect([e.px, e.pz]).toEqual([0, mToU(-9)]);
    const edge = buildCastGeometry(empty, request(empty, { origin: at(0, -3) }));
    expect([edge.fx, edge.fz, edge.px, edge.pz]).toEqual([0, 1000, 0, mToU(6)]);
    const narrow = twinWorld({ stage: { ...ARENA, field: { ...ARENA.field, minXMm: -1000, maxXMm: 1000 } } }).world;
    expect(buildCastGeometry(narrow, request(narrow)).px).toBe(0);
  });

  it("uses three ground anchors per side, includes the farthest beast, and matches prototype route lengths", () => {
    const { world } = twinWorld();
    const beasts = populate(world, "two");
    const g = buildCastGeometry(world, request(world));
    for (const side of [0, 1]) {
      const d = g.dragons[side]!;
      expect(d.nodes).toHaveLength(10);
      const far = beasts.filter((b) => b.y === 0 && g.sideSlot[b.slot] === side + 1).sort((a, b) => dist2(b.x, b.z, 0, 0) - dist2(a.x, a.z, 0, 0) || a.serial - b.serial)[0]!;
      expect(d.nodes.some((x, i) => i % 2 === 0 && x === far.x && d.nodes[i + 1] === far.z)).toBe(true);
      expect(Math.abs(nodeLength(d) - [45.1, 43.9][side]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(uToM(d.arc.at(-1)!) - [50.3, 49.2][side]!)).toBeLessThanOrEqual(1);
      expect([d.sx[0], d.sz[0], d.sx.at(-1), d.sz.at(-1)]).toEqual([0, mToU(3), g.px, g.pz]);
      expect(d.petalFrom === 0 || d.arc.at(-1)! - d.arc[d.petalFrom - 1]! > mmToU(TWIN_PEARL.lotus.petalLengthMm)).toBe(true);
    }
    const single = twinWorld().world;
    populate(single, "beast");
    const wing = buildCastGeometry(single, request(single));
    expect(wing.dragons[1].nodes).toEqual([0, mToU(3), mToU(9), 0, wing.px, wing.pz]);
  });

  it("bounds samples, monotone F3–F48 passes and adaptive sample count, including long and degenerate paths", () => {
    for (const layout of LAYOUTS) {
      const { world } = twinWorld({ stage: layout === "arena" ? ARENA : THANH_THACH_AI });
      populate(world, layout);
      const g = buildCastGeometry(world, request(world));
      for (const d of g.dragons) {
        for (let k = 0; k < d.sx.length; k += 1) {
          expect(d.sx[k]).toBeGreaterThanOrEqual(mmToU(world.stage.field.minXMm));
          expect(d.sx[k]).toBeLessThanOrEqual(mmToU(world.stage.field.maxXMm));
          expect(d.sz[k]).toBeGreaterThanOrEqual(mmToU(world.stage.field.minZMm));
          expect(d.sz[k]).toBeLessThanOrEqual(mmToU(world.stage.field.maxZMm));
          if (k > 0) expect(d.pass[k]).toBeGreaterThanOrEqual(d.pass[k - 1]!);
        }
        const segments = splitLong(d.nodes, mmToU(TWIN_PEARL.heads.maxSegmentMm)).length / 2 - 1;
        expect(d.sx.length).toBeLessThanOrEqual(257 + segments);
        expect(d.pass[0]).toBe(3);
        expect(d.pass.at(-1)).toBe(48);
      }
    }
    const split = splitLong([mToU(-20), 0, mToU(20), 0], mmToU(TWIN_PEARL.heads.maxSegmentMm));
    expect(split).toHaveLength(6);
    for (let k = 2; k < split.length; k += 2) expect(isqrt(dist2(split[k - 2]!, split[k - 1]!, split[k]!, split[k + 1]!))).toBeLessThanOrEqual(mmToU(TWIN_PEARL.heads.maxSegmentMm));
    const bounds = { minXMm: -30_000, maxXMm: 30_000, minZMm: -30_000, maxZMm: 30_000 };
    const nodes = [-25, -25, 25, -25, 25, 25, -25, 25, -25, -25, 25, 25].map(mToU);
    const sampled = sampleRoute(nodes, 1, bounds);
    expect(sampled.step).toBeGreaterThan(mToU(0.5));
    expect(sampled.sx.length).toBeLessThanOrEqual(257 + splitLong(nodes, mmToU(TWIN_PEARL.heads.maxSegmentMm)).length / 2 - 1);
    expect(sampleRoute([0, 0], 1, bounds)).toMatchObject({ sx: [0], sz: [0], arc: [0], pass: [3] });
    expect(distSegment2(3, 4, 0, 0, 0, 0)).toBe(25);
  });
});

describe("F0/F1 discs select damageable snapshot targets", () => {
  it("uses round 4.5 m and 2.2 m boundaries, with ground and sky bands kept separate", () => {
    const { world, of } = twinWorld();
    const inside = addBeast(world, "phong-lang", { x: 4.5, z: 0 });
    const outside = addBeast(world, "phong-lang", { x: 4.5, z: 0.1 });
    const cast = castNow(world); cast.pool.fill(10 ** 9);
    advance(world, 1, [stepSkills]);
    expect(slot2Hits(of, inside).map((h) => h.tick - cast.startTick)).toEqual([0]);
    expect(slot2Hits(of, outside)).toHaveLength(0);
    expect(volumesAt(cast, mToU(4.5), mToU(1.5), 0, 0) & 1).toBe(1);
    expect(volumesAt(cast, mToU(4.5), mToU(1.501), 0, 0) & 1).toBe(0);
    const disc = { on: 1, x: mToU(-8), z: mToU(-8), sky: 0 };
    expect(inDisc(disc, disc.x + mToU(2.2), disc.z)).toBe(true);
    expect(inDisc(disc, disc.x + mToU(2.2), disc.z + 1)).toBe(false);
    cast.disc[0] = disc;
    expect(volumesAt(cast, disc.x, 0, disc.z, 1) & 2).toBe(2);
    expect(volumesAt(cast, disc.x, mToU(4), disc.z, 1) & 2).toBe(0);
    disc.sky = 1;
    expect(volumesAt(cast, disc.x, 0, disc.z, 1) & 2).toBe(0);
    expect(volumesAt(cast, disc.x, mToU(4), disc.z, 1) & 2).toBe(2);
    expect(volumesAt(cast, disc.x, mToU(4), disc.z, 3) & 2).toBe(0);
  });

  it("F0 reaches the 4.5 m heart disc, F1 picks each side's nearest eligible ground beast with unlimited budgets", () => {
    const { world, of } = twinWorld();
    const beasts = populate(world, "two"); durable(beasts);
    const cast = castNow(world); cast.pool.fill(10 ** 9);
    advance(world, 1, [stepSkills]);
    for (const b of beasts.filter((b) => b.y === 0 && inHoldDisc(cast, b.x, b.z))) expect(slot2Hits(of, b)[0]?.tick).toBe(cast.startTick);
    for (const side of [0, 1]) {
      const nearest = beasts.filter((b) => b.y === 0 && cast.sideSlot[b.slot] === side + 1 && !inHoldDisc(cast, b.x, b.z)).sort((a, b) => dist2(a.x, a.z, 0, 0) - dist2(b.x, b.z, 0, 0) || a.serial - b.serial)[0]!;
      advance(world, side === 0 ? 1 : 0, [stepSkills]);
      expect(cast.disc[side]).toEqual({ on: 1, x: nearest.x, z: nearest.z, sky: 0 });
      expect(slot2Hits(of, nearest)[0]?.tick).toBe(cast.startTick + 1);
    }
    expect(volumesAt(cast, cast.disc[0].x, mToU(2), cast.disc[0].z, 1) & 2).toBe(0);
  });

  it("spent F0 touch budgets leave no ground disc; crows instead receive a sky disc and a corridor hit at F1", () => {
    for (const crows of [false, true]) {
      const { world, of } = twinWorld();
      const beasts = populate(world, "two");
      if (!crows) for (const b of beasts) if (b.y > 0) b.alive = false;
      const cast = castNow(world);
      advance(world, 2, [stepSkills]);
      for (const side of [0, 1]) {
        expect(cast.pool[side * POOL_PARTS + POOL_TOUCH]).toBe(0);
        expect(cast.disc[side]!.on).toBe(crows ? 1 : 0);
        if (crows) {
          const crow = beasts.find((b) => b.y > 0 && cast.sideSlot[b.slot] === side + 1)!;
          expect(cast.disc[side]).toEqual({ on: 1, x: crow.x, z: crow.z, sky: 1 });
          expect(slot2Hits(of, crow).map((h) => h.tick - cast.startTick)).toEqual([1]);
          expect(cast.book.find((v) => v.serial === crow.serial)?.kinds).toBe(2);
          expect(cast.pool[side * POOL_PARTS + POOL_SKY]).toBeLessThan(cast.poolStart[side * POOL_PARTS + POOL_SKY]!);
          expect(volumesAt(cast, crow.x, 0, crow.z, 1) & 2).toBe(0);
        }
      }
    }
  });

  it("skips zero-cap clusters without mutating the area book, and ignores dead/reused/immunity and new refs at F1", () => {
    const { world } = twinWorld();
    const rat = addCluster(world, 1, -2, -6)[0]!; rat.hp = rat.hpMax = 1;
    const next = addBeast(world, "phong-lang", { x: -2, z: -8 });
    const dead = addBeast(world, "phong-lang", { x: -1, z: -5 });
    const reused = addBeast(world, "phong-lang", { x: -1, z: -5.5 });
    const boss = addBeast(world, "thiet-boi-lang-vuong", { x: 1, z: -5 });
    for (let k = 0; k < 6; k += 1) addBeast(world, "phong-lang", { x: 10 + k, z: -12 });
    const cast = castNow(world);
    const area = createAreaHit();
    expect(areaClusterLeft(world, area, rat.cluster)).toBe(0);
    expect(area).toEqual({ clusters: [], left: [] });
    area.clusters.push(rat.cluster); area.left.push(7);
    expect(areaClusterLeft(world, area, rat.cluster)).toBe(7);
    advance(world, 1, [stepSkills]);
    dead.alive = false;
    (reused as { serial: number }).serial += 100;
    boss.mode = "roar"; boss.modeUntil = world.tick + 100;
    const late = addBeast(world, "phong-lang", { x: -1, z: -4.8 });
    advance(world, 1, [stepSkills]);
    expect(cast.disc[0]).toEqual({ on: 1, x: next.x, z: next.z, sky: 0 });
    expect(cast.snapshot).not.toContain(late.serial);
  });
});

describe("timed bodies, sky capsules and lotus", () => {
  it("keeps each sample's exact 1.4 m radius and inclusive 54-tick trail; sky also reaches live samples without anchors", () => {
    const { world } = twinWorld();
    const b = addBeast(world, "phong-lang", { x: 0, z: -12 });
    const cast = castNow(world);
    const d: TwinDragon = { nodes: [0, 0], sx: [0], sz: [0], arc: [0], pass: [3], petalFrom: 0, sky: [] };
    expect(inBody(d, mToU(1.4), 0, 2)).toBe(false);
    expect(inBody(d, mToU(1.4), 0, 3)).toBe(true);
    expect(inBody(d, mToU(1.4) + 1, 0, 3)).toBe(false);
    expect(inBody(d, 0, 0, 57)).toBe(true);
    expect(inBody(d, 0, 0, 58)).toBe(false);
    const dragon = cast.dragons[0], i = headIndex(dragon, 30);
    expect(dragon.sky).toEqual([]);
    expect(volumesAt(cast, dragon.sx[i]!, mToU(4), dragon.sz[i]!, 30) & 8).toBe(8);
    expect(distSegment2(5, 3, 0, 0, 10, 0)).toBe(9);
    expect(distSegment2(-2, 0, 0, 0, 10, 0)).toBe(4);
    expect(distSegment2(12, 0, 0, 0, 10, 0)).toBe(4);
    expect(cast.snapshot).toEqual([b.slot, b.serial]);
  });

  it("body samples hit when passed and for 54 more ticks, never outside the ground band or after F102", () => {
    const { world, of } = twinWorld();
    const b = addBeast(world, "thiet-giap-tru", { x: -2.4, z: -10.1 }); durable([b]);
    const cast = castNow(world); cast.pool.fill(10 ** 9);
    const d = cast.dragons[0];
    const i = Math.floor(d.sx.length / 2), t = d.pass[i]!;
    expect(inBody(d, d.sx[i]!, d.sz[i]!, t)).toBe(true);
    expect(inBody(d, d.sx[i]!, d.sz[i]!, t + TWIN_PEARL.trailTicks)).toBe(true);
    expect(volumesAt(cast, d.sx[i]!, mToU(2), d.sz[i]!, t) & 4).toBe(0);
    const range = { first: 0, last: 0 }; liveSamples(d, 2, range); expect(range.last).toBe(-1);
    expect(headIndex(d, 2)).toBe(-1);
    expect(headIndex(d, 100)).toBe(d.sx.length - 1);
    expect(volumesAt(cast, cast.px, 0, cast.pz, 102) & 4).toBe(4);
    expect(volumesAt(cast, cast.px, 0, cast.pz, 103)).toBe(0);
    advance(world, 120, [stepSkills]);
    expect(slot2Hits(of, b).map((h) => h.tick - cast.startTick)).toEqual([1, 34, 57]);
    expect(world.skills.twinPearl!.casts).toHaveLength(0);
    expect(TWIN_PEARL_END_TICK).toBe(102);
  });

  it("crows bypassed at F1 take their own sky-anchor capsule at F30; sky never hits beasts below it", () => {
    const { world, of } = twinWorld();
    const beasts = populate(world, "two"); durable(beasts);
    const cast = castNow(world); cast.pool.fill(10 ** 9);
    const crow = beasts.find((b) => b.y > 0)!;
    expect(inSkyReach(cast, crow.x, crow.z, 29)).toBe(false);
    expect(inSkyReach(cast, crow.x, crow.z, 30)).toBe(true);
    expect(inSkyReach(cast, crow.x, crow.z, 56)).toBe(true);
    expect(inSkyReach(cast, crow.x, crow.z, 57)).toBe(false);
    expect(volumesAt(cast, crow.x, 0, crow.z, 30) & 8).toBe(0);
    expect(volumesAt(cast, crow.x, mToU(6.5), crow.z, 30) & 8).toBe(0);
    advance(world, 103, [stepSkills]);
    expect(slot2Hits(of, crow).map((h) => h.tick - cast.startTick)).toEqual([30]);
    expect(cast.book.find((v) => v.serial === crow.serial)?.kinds).toBe(2);
  });

  it("lotus is full in its 4 m core, H disc and sampled petals, half elsewhere in 9 m, F57–F77 only", () => {
    const { world, of } = twinWorld(); populate(world, "two");
    const cast = castNow(world);
    expect(lotusRegion(cast, cast.px, cast.pz)).toBe(2);
    expect(lotusRegion(cast, 0, mToU(4.4))).toBe(2);
    const d = cast.dragons[0];
    expect(lotusRegion(cast, d.sx[d.petalFrom]!, d.sz[d.petalFrom]!)).toBe(2);
    const regions = new Map<number, Position>();
    for (let x = -19; x <= 19; x += 0.5) for (let z = -17; z <= 7; z += 0.5) {
      const p = { x: mToU(x), z: mToU(z), y: 0 };
      const region = lotusRegion(cast, p.x, p.z);
      if (region === 1) expect(dist2(p.x, p.z, cast.px, cast.pz)).toBeLessThanOrEqual(mToU(9) ** 2);
      if (!regions.has(region)) regions.set(region, p);
    }
    expect([...regions.keys()].sort()).toEqual([0, 1, 2]);
    for (const [region, p] of regions) {
      expect(volumesAt(cast, p.x, 0, p.z, 57) & 48).toBe(region === 2 ? 16 : region === 1 ? 32 : 0);
      expect(volumesAt(cast, p.x, 0, p.z, 77) & 48).toBe(region === 2 ? 16 : region === 1 ? 32 : 0);
      expect(volumesAt(cast, p.x, 0, p.z, 56) & 48).toBe(0);
      expect(volumesAt(cast, p.x, 0, p.z, 78) & 48).toBe(0);
    }
    // A late target in the half region checks the actual half-strength hit, with no previous kind or falloff.
    for (const b of world.beasts.list) b.alive = false;
    world.tick = cast.startTick + 57;
    const p = regions.get(1)!;
    const target = spawnBeast(world, "thiet-giap-tru", "A", { wave: 0, x: p.x, z: p.z });
    durable([target]);
    cast.pool.fill(10 ** 9);
    advance(world, 1, [stepSkills]);
    const entry = cast.book.find((v) => v.serial === target.serial)!;
    expect(entry.kinds).toBe(4);
    const full = scaleHit(world, 0, mulDiv(cast.baseHp, 40, 100), cast.grade, "slot2", null);
    expect(slot2Hits(of, target).map((h) => h.amount)).toEqual([mulDiv(full, 500, 1000)]);
  });
});

describe("seven layouts plus an empty field (§9.8)", () => {
  for (const layout of LAYOUTS) it(layout + ": immediate first positive hit, static coverage and non-negative budgets", () => {
    const { world, of } = twinWorld({ stage: layout === "arena" ? ARENA : THANH_THACH_AI });
    const beasts = populate(world, layout);
    const points = beasts.map((b) => ({ x: b.x, z: b.z, y: b.y }));
    if (layout === "empty") {
      const g = buildCastGeometry(world, request(world));
      expect(staticCoverage(g, points)).toBe(0);
      expect(resolveCast(world, request(world))).toBe(false);
      advance(world, 103, [stepSkills]);
      expect(of("hit")).toHaveLength(0);
      return;
    }
    const cast = castNow(world);
    advance(world, 2, [stepSkills]);
    expect(of("hit").find((h) => h.source === "slot2" && h.amount > 0)!.tick - cast.startTick).toBeLessThanOrEqual(1);
    const coverage = staticCoverage(cast, points) / points.length;
    const min = layout === "two" || layout === "three" ? 0.95 : layout === "one" || layout === "behind" ? 0.85 : layout === "arena" ? 0.75 : 1;
    expect(coverage).toBeGreaterThanOrEqual(min);
    advance(world, 110, [stepSkills]);
    const hit = new Set(of("hit").filter((h) => h.source === "slot2" && h.amount > 0).map((h) => h.beast.serial));
    expect(hit.size).toBeLessThanOrEqual(beasts.length);
    for (const left of cast.pool) expect(left).toBeGreaterThanOrEqual(0);
    expect(cast.dealt).toBeLessThanOrEqual(cast.poolStart.reduce((a, b) => a + b, 0));
  });
});

/** Records hit kind at the tick it enters the book, before later kinds can hide an error. */
function fight(layout: Layout, transform = (p: Position): Position => p, origin = at(0, 3), swapGates = false) {
  const made = twinWorld({ stage: layout === "arena" ? ARENA : THANH_THACH_AI });
  const { world, of } = made;
  const beasts = populate(world, layout, transform); durable(beasts);
  if (swapGates) for (const b of beasts) if (b.y === 0) (b as { gate: string }).gate = "B";
  const cast = castNow(world, { origin });
  const hits: number[][] = [];
  let seen = 0;
  const masks = new Map<number, number>();
  for (let t = 0; t <= 110; t += 1) {
    advance(world, 1, [stepSkills]);
    const events = of("hit").filter((h) => h.source === "slot2");
    for (const h of events.slice(seen)) {
      const entry = cast.book.find((b) => b.serial === h.beast.serial)!;
      const old = masks.get(entry.serial) ?? 0;
      hits.push([entry.serial, h.tick - cast.startTick, entry.kinds ^ old, h.amount]);
      masks.set(entry.serial, entry.kinds);
    }
    seen = events.length;
  }
  return { ...made, beasts, cast, hits };
}

describe("exact symmetry and gate independence", () => {
  it("mirrors x at fixed serials: sides swap, all nodes, samples, passes and hits agree at 0 u tolerance", () => {
    const a = fight("two"), b = fight("two", (p) => ({ ...p, x: -p.x + 0 }));
    expect(b.hits).toEqual(a.hits);
    for (const beast of a.beasts) expect(b.cast.sideSlot[beast.slot]).toBe(3 - a.cast.sideSlot[beast.slot]!);
    for (const side of [0, 1]) {
      const p = a.cast.dragons[side]!, q = b.cast.dragons[1 - side]!;
      expect(q.nodes).toEqual(p.nodes.map((v, k) => k % 2 === 0 ? -v + 0 : v));
      expect(q.sx).toEqual(p.sx.map((x) => -x + 0)); expect(q.sz).toEqual(p.sz); expect(q.pass).toEqual(p.pass);
    }
  });

  it("rotates arena and C by 90 degrees: samples and every hit agree at 0 u tolerance", () => {
    const a = fight("arena"), b = fight("arena", (p) => ({ ...p, x: -p.z + 0, z: p.x }), at(-3, 0));
    expect(b.hits).toEqual(a.hits);
    for (const side of [0, 1]) {
      const p = a.cast.dragons[side]!, q = b.cast.dragons[side]!;
      expect(q.nodes).toEqual(p.nodes.map((v, k) => k % 2 === 0 ? -p.nodes[k + 1]! + 0 : p.nodes[k - 1]!));
      expect(q.sx).toEqual(p.sz.map((z) => -z + 0)); expect(q.sz).toEqual(p.sx); expect(q.pass).toEqual(p.pass);
    }
  });

  it("changing every ground gate A to B leaves geometry and hits identical", () => {
    const a = fight("two"), b = fight("two", undefined, undefined, true);
    expect(b.hits).toEqual(a.hits);
    expect(b.cast.dragons).toEqual(a.cast.dragons);
  });
});

describe("unchanged damage rules", () => {
  it("three kinds at least 20 ticks apart, 15/45/40 HP shares and 3/9/8 posture", () => {
    const { world, of } = twinWorld(); setTamNhan(world, false);
    const beast = addBeast(world, "lang-dau-dan", { x: -2.4, z: -10.1 }); durable([beast]);
    const cast = castNow(world, { quality: "good" }); cast.pool.fill(10 ** 9);
    advance(world, 110, [stepSkills]);
    const p = wHpOf(world, 250);
    expect(slot2Hits(of, beast).map((h) => [h.tick - cast.startTick, h.amount])).toEqual([[1, mulDiv(p, 15, 100)], [34, mulDiv(p, 45, 100)], [57, mulDiv(p, 40, 100)]]);
    const after = (t: number) => of("posture").filter((e) => e.tick === cast.startTick + t && e.beast.slot === beast.slot).at(-1)?.value;
    expect([after(1), after(34), after(57)]).toEqual([57, 47, 38]);
    expect(cast.book[0]).toMatchObject({ hits: 3, kinds: 7 });
  });

  it("a dense tide keeps per-side falloff 100/85/70/55/40%, no repeated kind and no fourth hit", () => {
    const { world, of } = twinWorld();
    const beasts = populate(world, "two"); durable(beasts);
    const cast = castNow(world); cast.pool.fill(10 ** 9);
    advance(world, 110, [stepSkills]);
    let three = 0;
    for (const b of beasts) {
      const hits = slot2Hits(of, b);
      expect(hits.length).toBeLessThanOrEqual(3);
      for (let k = 1; k < hits.length; k += 1) expect(hits[k]!.tick - hits[k - 1]!.tick).toBeGreaterThanOrEqual(20);
      const entry = cast.book.find((v) => v.serial === b.serial);
      if (entry) expect(entry.hits).toBe([1, 2, 4].filter((mask) => entry.kinds & mask).length);
      if (hits.length === 3) three += 1;
    }
    expect(three).toBeGreaterThan(0);
    for (const side of [0, 1]) expect(cast.book.filter((v) => v.side === side).map((v) => v.factorPm).slice(0, 6)).toEqual([1000, 850, 700, 550, 400, 400]);
    expect(cast.sideVictims.reduce((a, b) => a + b, 0)).toBe(cast.victims);
  });

  it("2 W per side split 15/45/40 plus 0.8 W sky, scaled by grade and bucket", () => {
    const { world } = twinWorld(); setTamNhan(world, false);
    const one = [27, 81, 72, 72];
    expect(twinPearlPool(world, 0, "good")).toEqual([...one, ...one]);
    const side = wHpOf(world, 200);
    const flash = twinPearlPool(world, 0, "flash");
    for (let i = 0; i < flash.length; i += 1) expect(flash[i]).toBe(i % 4 === POOL_SKY ? mulDiv(72, 1250, 1000) : mulDiv(mulDiv(side, 1250, 1000), [15, 45, 0, 40][i % 4]!, 100));
    setTamNhan(world, true);
    expect(twinPearlPool(world, 0, "good")[0]).toBeGreaterThan(one[0]!);
  });

  it("each side/part only spends its budget, independently, and their sum matches emitted effective HP", () => {
    const { world, of } = twinWorld(); const beasts = populate(world, "two"); durable(beasts);
    const cast = castNow(world);
    const spent = new Array<number>(8).fill(0), masks = new Map<number, number>();
    let seen = 0;
    for (let t = 0; t <= 110; t += 1) {
      advance(world, 1, [stepSkills]);
      const events = of("hit").filter((h) => h.source === "slot2");
      for (const h of events.slice(seen)) {
        const v = cast.book.find((v) => v.serial === h.beast.serial)!;
        const kind = v.kinds ^ (masks.get(v.serial) ?? 0); masks.set(v.serial, v.kinds);
        const b = beasts.find((b) => b.serial === v.serial)!;
        const part = kind === 1 ? POOL_TOUCH : kind === 4 ? POOL_LOTUS : b.y > 0 ? POOL_SKY : POOL_CORRIDOR;
        spent[v.side * 4 + part]! += h.amount;
      }
      seen = events.length;
      for (let i = 0; i < 8; i += 1) { expect(cast.pool[i]).toBeGreaterThanOrEqual(0); expect(cast.poolStart[i]! - cast.pool[i]!).toBe(spent[i]); }
    }
    expect(cast.dealt).toBe(spent.reduce((a, b) => a + b, 0));
    expect(new Set(cast.book.map((v) => v.serial)).size).toBeLessThan(beasts.length);
  });

  it("one swarm-cluster cap covers every kind and both sides for the whole cast", () => {
    const { world } = twinWorld();
    const rats = addCluster(world, 6, -0.75, -3);
    const hp = rats.reduce((sum, b) => sum + b.hp, 0);
    const cast = castNow(world, { quality: "flash" }); cast.pool.fill(10 ** 9);
    advance(world, 110, [stepSkills]);
    expect(hp - rats.reduce((sum, b) => sum + (b.alive ? b.hp : 0), 0)).toBe(Math.floor(hp * 60 / 100));
    expect(cast.area.clusters).toHaveLength(1);
    expect(cast.area.left).toEqual([0]);
  });

  it("boss cap is 1.5 W per cast id; only damage-immune beasts keep a cast held", () => {
    const { world, of } = twinWorld();
    const boss = addBeast(world, "thiet-boi-lang-vuong", { x: -2.4, z: -10.1 }); durable([boss]);
    boss.mode = "roar"; boss.modeUntil = world.tick + 300;
    expect(resolveCast(world, request(world))).toBe(false);
    const rat = addBeast(world, "thach-thu", { x: 2, z: -3 });
    const immune = castNow(world);
    expect(immune.snapshot).toEqual([rat.slot, rat.serial]);
    advance(world, 110, [stepSkills]);
    expect(slot2Hits(of, boss)).toHaveLength(0);
    boss.mode = "walk"; boss.modeUntil = -1;
    for (let k = 0; k < 2; k += 1) {
      const cast = castNow(world, { quality: "flash" }); cast.pool.fill(10 ** 9);
      advance(world, 110, [stepSkills]);
      expect(cast.bossDealt).toBe(wHpOf(world, 150));
    }
    expect(slot2Hits(of, boss).reduce((sum, h) => sum + h.amount, 0)).toBe(wHpOf(world, 300));
  });
});

describe("determinism with movement and overlapping casts; integer hashed state", () => {
  function run(seed: number) {
    const made = twinWorld({ seed }); const { world } = made;
    populate(world, "two");
    const hashes: string[] = [], floats: string[] = [], hits: string[] = [];
    for (let tick = 0; tick < 150; tick += 1) {
      if (tick === 0 || tick === 25) emitCast(world, request(world, { actionId: tick + 1, quality: "good" }));
      step(world, []);
      for (const e of world.events.drain()) if (e.type === "hit" && e.source === "slot2") hits.push(e.tick + ":" + e.beast.serial + ":" + e.amount);
      if (tick === 30) { expect(world.skills.twinPearl!.casts).toHaveLength(2); floats.push(...hashedFloats(world, HASH_SKIP)); }
      floats.push(...hashedFloats(world.skills.twinPearl));
      hashes.push(hashWorldHex(world));
      world.formation.heart = world.formation.heartMax;
    }
    return { hashes, hits, floats };
  }
  it("matches every tick hash and hit with two live casts and moving beasts", () => {
    const a = run(11), b = run(11);
    expect(a.hits.length).toBeGreaterThan(0); expect(b).toEqual(a); expect(a.floats).toEqual([]);
  });
});

describe("performance smoke: 60 beasts, two overlapping casts, three warmups", () => {
  it("prints geometry ms and tick µs/cast; fails only above 4× the target", () => {
    const builds: number[] = [], ticks: number[] = [];
    for (let run = 0; run < 12; run += 1) {
      const { world } = twinWorld();
      const beasts = populate(world, "two");
      for (let k = 0; k < 20; k += 1) beasts.push(addBeast(world, "phong-lang", { x: -15 + 30 * k / 19, z: -12 }));
      durable(beasts);
      const req = request(world);
      const start = performance.now();
      for (let k = 0; k < 20; k += 1) buildCastGeometry(world, req);
      const build = (performance.now() - start) / 20;
      const a = castNow(world), b = castNow(world);
      a.pool.fill(10 ** 9); b.pool.fill(10 ** 9);
      const t0 = performance.now();
      advance(world, 102, [stepSkills]);
      const perCast = (performance.now() - t0) * 1000 / (102 * 2);
      if (run >= 3) { builds.push(build); ticks.push(perCast); }
    }
    const median = (a: number[]): number => a.sort((a, b) => a - b)[Math.floor(a.length / 2)]!;
    const buildMs = median(builds), tickUs = median(ticks);
    console.info(`Twin Pearl: geometry median ${buildMs.toFixed(4)} ms; tick median ${tickUs.toFixed(2)} µs/cast (60 beasts, 2 casts, 3 warmups)`);
    expect(buildMs).toBeLessThanOrEqual(0.8); expect(tickUs).toBeLessThanOrEqual(200);
  });
});

describe("the replay header's rulesHash covers the trial table only when the header asks for it", () => {
  it("no variant: the hash is today's; twin-pearl: another, stable", () => {
    expect(matchRulesHash(THANH_THACH_AI, {})).toBe(matchRulesHash(THANH_THACH_AI));
    expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).not.toBe(matchRulesHash(THANH_THACH_AI));
    expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).toBe(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" }));
  });

  it("changing the trial table changes only the enabled rulesHash", () => {
    const table = TWIN_PEARL.pool as { sideW100: number };
    const saved = table.sideW100;
    const off = matchRulesHash(THANH_THACH_AI);
    const on = matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" });
    try {
      table.sideW100 += 1;
      expect(matchRulesHash(THANH_THACH_AI)).toBe(off);
      expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).not.toBe(on);
    } finally {
      table.sideW100 = saved;
    }
  });
});

describe("the flag off: world hashes pinned on 1a78a82 (before the grey box)", () => {
  /** A scripted fight with key 2 (today's line), key 4 and key 1 casts; world hash and beasts alive every 300 ticks. */
  function scripted(seed: number, swordKey2 = false): string[] {
    const header = swordKey2 ? { ...testHeader({ seed }), swordKey2: "twin-pearl" as const } : testHeader({ seed });
    const world = createWorld(THANH_THACH_AI, seed, header);
    world.phaseEndsAt = -1;
    const rng = world.rng.spawn;
    const tide = (): void => {
      for (let k = 0; k < 36; k += 1) {
        const gate = k % 2 === 0 ? "A" : "B";
        const from = gatePoint(world.stage, gate);
        const f = rng.int(150, 900);
        spawnBeast(world, k % 3 === 0 ? "phong-lang" : "thach-thu", gate, { wave: -1, x: mulDivSym(from.x, f, 1000) + rng.int(-15_000, 15_000), z: mulDivSym(from.z, f, 1000) });
      }
      spawnBeast(world, "hoa-nha", "sky", { wave: -1 });
      spawnBeast(world, "hoa-nha", "sky", { wave: -1, x: mmToU(17_000), z: mmToU(-16_000) });
    };
    const out: string[] = [];
    let action = 0;
    for (let tick = 0; tick < 1200; tick += 1) {
      if (tick % 400 === 0) tide();
      const slot = tick % 500 === 20 ? 2 : tick % 240 === 100 ? 4 : tick % 90 === 7 ? 1 : 0;
      if (slot !== 0) {
        action += 1;
        emitCast(world, { seat: 0, slot, actionId: action, wordId: "w" + action, tick: world.tick, channel: "typing", quality: "good", origin: { x: 0, z: mmToU(3000) }, aim: null, state: "held", heldUntil: -1, target: null, node: null });
      }
      step(world, []);
      world.events.drain();
      world.formation.heart = world.formation.heartMax;
      if ((tick + 1) % 300 === 0) out.push(hashWorldHex(world) + "@" + world.beasts.live);
    }
    return out;
  }

  it("default headers give the same world, tick for tick, as the commit before the grey box", () => {
    // Computed by this same script on a clean export of 1a78a82 (04/11/2026) and on the current tree: identical.
    expect(scripted(5)).toEqual(["844c012d@22", "1cb00f08@36", "527f8f69@58", "7b865d13@35"]);
    expect(scripted(9)).toEqual(["aa8ae3cc@23", "4ba2160f@38", "753240f5@56", "29c48d76@34"]);
    // The script does reach key 2: with the flag on, the same fight differs.
    expect(scripted(5, true)).not.toEqual(scripted(5));
  });
});
