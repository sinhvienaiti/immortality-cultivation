import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { SWARM } from "../../src/content/data/swarm";
import { SWORD_KEY2_VARIANTS } from "../../src/content/data/twin-pearl";
import { matchRulesHash } from "../../src/app/app";
import { createMatchRunner, officialCheck, rebuild } from "../../src/app/match";
import type { Cast } from "../../src/content/types";
import { emitCast, stepCasts } from "../../src/sim/cast";
import { mmToU } from "../../src/sim/fixed";
import { HASH_SKIP, hashedFloats, hashWorldHex } from "../../src/sim/hash";
import { createSkillsState, resolveCast, stepSkills } from "../../src/sim/skills";
import { encodeSwarmCast, pearlPoint, pickTargets, planSwarm, rankClusters, regionOf, separated, swarmBodyAt, swarmChecksum, swarmSnapshot, SWARM_PACKET, type SwarmBeast, type SwarmPlan } from "../../src/sim/swarm";
import { DIRECTIONS, SIN, TABLE_SCALE, SWARM_TABLE_VERSION, directionOf, distance, helix, horizontalDistance, inBounds, minimumRadiusMm, pointAt, steerRoute, straightRoute, type SwarmBounds, type SwarmPoint } from "../../src/sim/swarm-geometry";
import { createWorld, step } from "../../src/sim/world";
import { addBeast, at, castOf, makeWorld, testHeader, THANH_THACH_AI } from "./combat-fixture";

const FIELD: SwarmBounds = { minXMm: -20_000, maxXMm: 20_000, minZMm: -18_000, maxZMm: 8000 };
const ORIGIN: SwarmPoint = { x: 0, y: 1200, z: 3000 };
const beast = (id: number, x: number, z: number, sky = false, boss = false, y = 4000): SwarmBeast => ({ id, slot: id - 1, x, z, y: sky ? y : 0, sky, boss });
function layouts(): SwarmBeast[][] {
  let seed = 293;
  const random = (n: number): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  return Array.from({ length: 200 }, () => Array.from({ length: 60 }, (_, i) => beast(i + 1, random(40_001) - 20_000, random(26_001) - 18_000, i % 5 === 0, i % 29 === 0)));
}
const LAYOUTS = layouts();
function swarmWorld(options: Parameters<typeof makeWorld>[0] = {}) {
  const made = makeWorld(options);
  (made.world as { header: typeof made.world.header }).header = { ...made.world.header, swordKey2: "swarm" };
  (made.world as { skills: typeof made.world.skills }).skills = createSkillsState({ ...made.world, seats: made.world.seats.length });
  return made;
}
function request(world: ReturnType<typeof swarmWorld>["world"], actionId = 293): Cast { return castOf(world, 2, { origin: at(0, 3), actionId }); }
function bytes(a: Int32Array): Uint8Array { return new Uint8Array(a.buffer, a.byteOffset, a.byteLength); }
function wireSamples(packet: Int32Array): Int32Array[] {
  const out: Int32Array[] = [];
  let offset = SWARM_PACKET.headerWords;
  for (let i = 0; i < packet[SWARM_PACKET.dragons]!; i += 1) {
    const count = packet[offset + 2]!;
    offset += SWARM_PACKET.dragonHeaderWords;
    out.push(packet.slice(offset, offset + count * 3)); offset += count * 3;
  }
  expect(offset).toBe(packet.length);
  return out;
}

// Independent acceptance measurement, using BigInt for exact circumradius threshold comparisons.
function assertRadius(base: Int32Array, p: SwarmPoint): void {
  for (let i = 4; i + 4 < base.length / 3; i += 1) {
    const a = pointAt(base, i - 4), b = pointAt(base, i), c = pointAt(base, i + 4);
    if ([a, b, c].some((v) => Math.hypot(v.x - p.x, v.z - p.z) <= 8000)) continue;
    const ab2 = BigInt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
    const bc2 = BigInt((b.x - c.x) ** 2 + (b.z - c.z) ** 2);
    const ac2 = BigInt((a.x - c.x) ** 2 + (a.z - c.z) ** 2);
    const cross = BigInt((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    expect(ab2 * bc2 * ac2 >= 4n * cross * cross * 4400n * 4400n).toBe(true);
  }
}

describe("swarm ownership, cells and pearl", () => {
  it("uses five half-open strips, X on ties, includes maximum, and switches to Z on tall fields", () => {
    expect([-20000, -12001, -12000, -4000, 4000, 12000, 20000].map((x) => regionOf({ ...ORIGIN, x }, FIELD))).toEqual([0, 0, 1, 2, 3, 4, 4]);
    const tall = { minXMm: -2000, maxXMm: 2000, minZMm: -20000, maxZMm: 20000 };
    expect(regionOf({ ...ORIGIN, x: 0, z: 12000 }, tall)).toBe(4);
    expect(regionOf({ ...ORIGIN, x: -12000, z: 15000 }, { ...FIELD, maxZMm: 22000 })).toBe(1);
  });
  it("a boss contributes exactly two, rather than three, and cell ties use cost then coordinates", () => {
    const c = rankClusters([beast(1, -19000, -17000, false, true), beast(2, -15000, -17000), beast(3, -14900, -17000), beast(4, 0, -1000)], ORIGIN, FIELD, false);
    expect(c.map((v) => v.score)).toEqual([2, 2, 1]);
    expect(c[0]!.medoid.id).toBe(2); // Same score, lower caster cost.
    const tied = rankClusters([beast(2, 6000, -5000), beast(1, -6000, -5000)], ORIGIN, FIELD, false);
    expect(tied[0]!.medoid.id).toBe(1);
  });
  it("includes an exact field maximum in the final 4 m cell", () => {
    const c = rankClusters([beast(1, 20000, -18000)], ORIGIN, FIELD)[0]!;
    expect(c.cellX).toBe(9); expect(c.cellZ).toBe(0); expect(c.region).toBe(4);
  });
  it("diagonal pearl rounding never exceeds either radius in integer millimetres", () => {
    const wide = { minXMm: -100000, maxXMm: 100000, minZMm: -100000, maxZMm: 100000 };
    for (let i = 0; i < 100; i += 1) {
      const p = pearlPoint([beast(1, 80001 + i * 11, 71237 + i * 17)], { x: 0, y: 1200, z: 0 }, wide);
      expect(p.x * p.x + p.z * p.z).toBeLessThanOrEqual(60000 * 60000);
      const h = beast(1, -80000, -80000, true), g = beast(2, 80000 - i, 79977 + i);
      const pulled = pearlPoint([h, { ...h, id: 3 }, g], { ...h, y: 1200 }, wide);
      expect((pulled.x - h.x) ** 2 + (pulled.z - h.z) ** 2).toBeLessThanOrEqual(12000 * 12000);
    }
  });
  it("medoid minimizes total planar distance, ties use serial even if input order changes", () => {
    const points = [beast(8, -19000, -17000), beast(2, -18800, -17000)];
    expect(rankClusters(points, ORIGIN, FIELD)[0]!.medoid.id).toBe(2);
    expect(rankClusters(points.reverse(), ORIGIN, FIELD)[0]!.medoid.id).toBe(2);
    expect(rankClusters([...points, beast(9, -18900, -17000)], ORIGIN, FIELD)[0]!.medoid.id).toBe(9);
  });
  it("picks at most two separated cells owned by each region", () => {
    const clusters = rankClusters(LAYOUTS[0]!, ORIGIN, FIELD);
    for (let i = 0; i < 5; i += 1) {
      const targets = pickTargets(clusters, i, null);
      expect(targets.length).toBeLessThanOrEqual(2);
      expect(targets.every((c) => c.region === i)).toBe(true);
      if (targets.length === 2) expect(separated(targets[0]!, targets[1]!)).toBe(true);
    }
    const c = clusters[0]!;
    expect(separated(c, { ...c, cellX: c.cellX + 1, cellZ: c.cellZ + 1 })).toBe(false);
    expect(separated(c, { ...c, cellX: c.cellX + 2 })).toBe(true);
  });
  it("computes H from the globally strongest cell and G from ground only, with the 3/5 pull", () => {
    const points = [beast(1, -10000, -10000), beast(2, -9900, -10000), beast(3, 10000, 0), beast(4, 15000, -15000, true)];
    expect(pearlPoint(points, ORIGIN, FIELD)).toEqual({ x: -5980, y: 1200, z: -8000 });
  });
  it("caps the H-to-G pull at 12 m, then applies inset and 60 m caster range in that order", () => {
    const wide = { minXMm: -100000, maxXMm: 100000, minZMm: -10000, maxZMm: 10000 };
    const points = [beast(1, -80000, 0, true), beast(2, -80100, 0, true), beast(3, -80200, 0, true), beast(4, 80000, 0)];
    const p = pearlPoint(points, { x: 0, y: 1200, z: 0 }, wide);
    expect(p).toEqual({ x: -60000, y: 1200, z: 0 });
  });
  it("uses all beasts when there is no ground and collapses an axis narrower than 4 m to its centre", () => {
    const narrow = { minXMm: 0, maxXMm: 3000, minZMm: -18000, maxZMm: 8000 };
    expect(pearlPoint([beast(1, 0, -18000, true)], ORIGIN, narrow)).toEqual({ x: 1500, y: 1200, z: -16000 });
    expect(pearlPoint([beast(1, -10000, -10000, true), beast(2, 10000, 0, true)], ORIGIN, FIELD)).toEqual({ x: 4000, y: 1200, z: -3000 });
  });
  it("dragon 0's first target is the nearest cluster across regions when release has no beast in 6 m", () => {
    const points = [beast(1, 8000, 3000), beast(2, -18000, -15000), beast(3, -17900, -15000)];
    const clusters = rankClusters(points, ORIGIN, FIELD);
    const nearest = clusters.slice().sort((a, b) => a.costMm - b.costMm)[0]!;
    expect(nearest.medoid.id).toBe(1);
    expect(pickTargets(clusters, 0, nearest)[0]!.medoid.id).toBe(1);
    const plan = planSwarm(FIELD, ORIGIN, points);
    expect(plan.dragons[0]!.targets[0]!.medoid.id).toBe(1);
  });
});

describe("swarm integer flight and spatial helix", () => {
  it("has versioned literal 4096-direction and sine tables and nearest directions on every quadrant", () => {
    expect(SIN.length).toBe(4096); expect(DIRECTIONS.length).toBe(8192);
    expect(SWARM_TABLE_VERSION).toBe(SWARM.versions.tables);
    expect(SIN[1024]).toBe(TABLE_SCALE);
    expect([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([x, z]) => directionOf(x!, z!))).toEqual([0, 512, 1024, 1536, 2048, 2560, 3072, 3584]);
  });
  it("passes radius, inset bounds, length, continuity and monotone final dive on 200 fixed-seed layouts", () => {
    for (const layout of LAYOUTS) {
      const plan = planSwarm(FIELD, ORIGIN, layout);
      for (const d of plan.dragons) {
        expect(d.lengthMm).toBeLessThanOrEqual(75000); expect(d.arc.length).toBeLessThanOrEqual(301);
        expect(minimumRadiusMm(d.base, plan.pearl)).toBeGreaterThanOrEqual(4400); assertRadius(d.base, plan.pearl);
        expect(d.arc.every(Number.isSafeInteger)).toBe(true);
        expect(pointAt(d.base, 0)).toEqual(ORIGIN);
        expect(pointAt(d.samples, d.arc.length - 1)).toEqual(plan.pearl);
        for (let i = 0; i < d.arc.length; i += 1) {
          expect(inBounds(pointAt(d.base, i), FIELD)).toBe(true);
          if (i > 0) {
            expect(distance(pointAt(d.samples, i - 1), pointAt(d.samples, i))).toBeLessThanOrEqual(600);
            if (d.lengthMm - d.arc[i - 1]! <= 7800) expect(horizontalDistance(pointAt(d.base, i), plan.pearl)).toBeLessThanOrEqual(horizontalDistance(pointAt(d.base, i - 1), plan.pearl) + 1);
          }
        }
      }
    }
  }, 30000);
  it("excludes a radius triple when even one member reaches the pearl exclusion", () => {
    const p = { x: 0, y: 1200, z: 0 };
    const base = new Int32Array(Array.from({ length: 9 }, (_, i) => [8000 + (4 - i) * 250, 1200, i === 4 ? 200 : 0]).flat());
    expect(minimumRadiusMm(base, p)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("bakes a spatially fixed helix, with distinct phases and zero offset at C and P", () => {
    const p = { x: 0, y: 1200, z: -20000 };
    const d = straightRoute(ORIGIN, p, 0), other = helix(d.base, d.arc, 1);
    expect(helix(d.base, d.arc, 0)).toEqual(d.samples);
    expect(other).not.toEqual(d.samples);
    expect(pointAt(d.samples, 0)).toEqual(ORIGIN); expect(pointAt(d.samples, d.arc.length - 1)).toEqual(p);
    // A station shared by head/body/tail at different times is the same immutable C(s).
    const saved = d.samples.slice();
    for (let t = 0; t < 400; t += 1) swarmBodyAt({ ...d, index: 0, targets: [], waypoints: [], launchTick: 2, diveTick: 89, fallback: false }, t);
    expect(d.samples).toEqual(saved);
  });
  it("rejects unreachable altitude and permits a reachable sky route with slope 1:2", () => {
    const pearl = { ...ORIGIN, z: -14000 };
    expect(steerRoute(ORIGIN, [{ ...ORIGIN, z: 2500, y: 20000 }], pearl, FIELD, 0)).toBeNull();
    const path = steerRoute(ORIGIN, [{ x: 0, y: 4000, z: -10000 }], pearl, FIELD, 0)!;
    expect(path).not.toBeNull();
    expect(Math.max(...Array.from({ length: path.arc.length }, (_, i) => pointAt(path.base, i).y))).toBeGreaterThan(3900);
    for (let i = 1; i < path.arc.length; i += 1) {
      const a = pointAt(path.base, i - 1), b = pointAt(path.base, i);
      expect(Math.abs(b.y - a.y) * 2).toBeLessThanOrEqual(horizontalDistance(a, b) + 4);
    }
  });
  it("the radius check is active: ordinary routes retain targets and use the spline", () => {
    const dragons = LAYOUTS.flatMap((layout) => planSwarm(FIELD, ORIGIN, layout).dragons);
    expect(dragons.filter((d) => d.targets.length > 0).length).toBeGreaterThan(500);
    expect(dragons.filter((d) => d.smoothed).length).toBeGreaterThan(900);
  });
});

describe("swarm round-3 timing and edge cases", () => {
  it("short paths arrive early with no waiting ring and burst is max(dive)+32, end is burst+40", () => {
    const plan = planSwarm(FIELD, ORIGIN, [beast(1, 0, 2500)]);
    expect(plan.dragons[2]!.diveTick).toBeLessThan(100);
    expect(plan.burstTick).toBe(Math.max(...plan.dragons.map((d) => d.diveTick)) + 32);
    expect(plan.endTick).toBe(plan.burstTick + 40);
    for (const d of plan.dragons) expect(d.waypoints.every((p) => inBounds(p, FIELD))).toBe(true);
  });
  it("launches at F2+6i, arrives exactly at P, moves at 16 m/s and retracts in 30 ticks", () => {
    for (const layout of LAYOUTS) {
      const plan = planSwarm(FIELD, ORIGIN, layout);
      expect(plan.endTick).toBeLessThanOrEqual(379);
      for (const d of plan.dragons) {
        expect(d.launchTick).toBe(2 + 6 * d.index);
        expect(d.diveTick).toBe(d.launchTick + Math.ceil(d.lengthMm * 60 / 16000));
        const actualSpeed = d.lengthMm * 60 / (d.diveTick - d.launchTick);
        // A one-tick endpoint quantization bounds average speed by 16/t; interior ticks are exactly 16 m/s.
        expect(actualSpeed).toBeLessThanOrEqual(16000);
        expect(16000 - actualSpeed).toBeLessThanOrEqual(16000 / Math.max(1, d.diveTick - d.launchTick));
        if (d.diveTick - d.launchTick >= 80) expect(actualSpeed).toBeGreaterThanOrEqual(15800);
        expect(swarmBodyAt(d, d.launchTick - 1).visible).toBe(false);
        expect(swarmBodyAt(d, d.diveTick).headMm).toBe(d.lengthMm);
        expect(swarmBodyAt(d, d.diveTick - 1).headMm).toBeLessThan(d.lengthMm);
        expect(swarmBodyAt(d, d.diveTick + 30)).toEqual({ visible: false, headMm: d.lengthMm, tailMm: d.lengthMm });
        expect(d.diveTick + 30).toBeLessThanOrEqual(plan.burstTick - 2);
      }
    }
  });
  it.each([
    ["one", [beast(1, -15000, -14000)]],
    ["two", [beast(1, -15000, -14000), beast(2, 15000, -14000)]],
    ["one region", [beast(1, -19000, -15000), beast(2, -18000, -14000), beast(3, -17000, -12000)]],
    ["sky only", [beast(1, -10000, -12000, true), beast(2, 10000, -12000, true)]],
    ["boss", [beast(1, 0, -14000, false, true)]],
    ["corners", [beast(1, -20000, -18000), beast(2, 20000, 8000)]],
  ] as const)("handles %s and gives every empty region a patrol point or an explicit fallback", (_, layout) => {
    const plan = planSwarm(FIELD, ORIGIN, layout);
    expect(plan.dragons).toHaveLength(5);
    for (const d of plan.dragons) {
      expect(d.arc.length).toBeLessThanOrEqual(301);
      expect(pointAt(d.samples, d.arc.length - 1)).toEqual(plan.pearl);
      if (d.targets.length === 0 && !d.fallback) expect(d.waypoints).toHaveLength(1);
    }
  });
  it("caps the late dragon at F379 by rejecting optional routes above 74,933 mm", () => {
    // All earlier dragons can use 75 m. Dragon 4 has only 281 flight ticks under the end cap.
    const allowed = Math.floor((SWARM.timing.maxEndTick - 26 - 32 - 40) * 16000 / 60);
    expect(allowed).toBe(74933);
    expect(26 + Math.ceil(allowed * 60 / 16000) + 32 + 40).toBe(379);
    expect(26 + Math.ceil(75000 * 60 / 16000) + 32 + 40).toBe(380);
    const d = straightRoute({ x: 0, y: 1200, z: 0 }, { x: 75000, y: 1200, z: 0 }, 4);
    expect(d.lengthMm).toBe(75000); expect(d.arc).toHaveLength(301);
  });
  it("a caster at the actual corner keeps its true C and explicitly falls back instead of moving C inward", () => {
    const c = { x: FIELD.minXMm, y: 1200, z: FIELD.maxZMm };
    const plan = planSwarm(FIELD, c, [beast(1, 10000, -12000)]);
    expect(plan.dragons.every((d) => d.fallback)).toBe(true);
    expect(inBounds(c, FIELD)).toBe(false); // An exact corner cannot also satisfy the 1.8 m inset.
    for (const d of plan.dragons) expect(pointAt(d.base, 0)).toEqual(c);
  });
  it("narrow field: all 2/1/0 attempts fail, then the straight path and packet carry fallback", () => {
    const narrow = { minXMm: 0, maxXMm: 2000, minZMm: -18000, maxZMm: 8000 };
    // Even a straight flight is impossible inside a literal 1.8 m margin on a 2 m axis.
    const plan = planSwarm(narrow, { x: 1000, y: 1200, z: 3000 }, [beast(1, 1000, -14000)]);
    expect(plan.dragons.some((d) => d.fallback)).toBe(true);
    const packet = encodeSwarmCast(plan, 1, 0, 0);
    expect(packet[SWARM_PACKET.flags]).toBe(1);
    for (const d of plan.dragons.filter((d) => d.fallback)) {
      expect(d.waypoints).toHaveLength(0);
      expect(d.samples).toEqual(straightRoute(plan.origin, plan.pearl, d.index).samples);
    }
  });
});

describe("swarm packed contract, replay and integration", () => {
  it("is opt-in, changes only its rulesHash and does not add damage or line strikes", () => {
    expect(SWORD_KEY2_VARIANTS).toContain("swarm");
    expect(makeWorld().world.skills.swarm).toBeUndefined();
    const old = matchRulesHash(THANH_THACH_AI), twin = matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" });
    const swarm = matchRulesHash(THANH_THACH_AI, { swordKey2: "swarm" });
    const version = SWARM.versions as { geometry: number };
    try { version.geometry += 1; expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "swarm" })).not.toBe(swarm); expect(matchRulesHash(THANH_THACH_AI)).toBe(old); expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).toBe(twin); }
    finally { version.geometry -= 1; }
    const { world, of } = swarmWorld();
    const target = addBeast(world, "nham-vien", { x: 0, z: -10 });
    const hp = target.hp;
    expect(resolveCast(world, request(world))).toBe(true);
    expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(480);
    const cast = world.skills.swarm!.casts[0]!;
    expect(world.skills.strikes).toHaveLength(0);
    for (let t = 0; t <= cast.endTick; t += 1) { world.tick = t; stepSkills(world); }
    expect(target.hp).toBe(hp); expect(of("hit")).toHaveLength(0);
    expect(of("skill-fx").map((e) => [e.stage, e.tick, e.castId])).toEqual([["swarm-cast", 0, 293], ["swarm-burst", cast.burstTick, 293], ["swarm-end", cast.endTick, 293]]);
    expect(of("skill-fx")[0]!.swarm).toBeInstanceOf(Int32Array);
    expect(world.skills.swarm!.casts).toHaveLength(0);
    expect(hashedFloats(world, HASH_SKIP)).toEqual([]);
  });
  it("an empty or immune-only snapshot stays held and fizzles after the existing 3 seconds", () => {
    const { world, of } = swarmWorld();
    emitCast(world, request(world));
    expect(world.casts.held).toHaveLength(1); expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(0);
    for (let t = 0; t <= 180; t += 1) { world.tick = t; stepCasts(world); }
    expect(world.casts.fizzled).toBe(1); expect(of("skill-fx")).toHaveLength(0);
    const b = addBeast(world, "nham-vien", { x: 0, z: -10 }); b.mode = "roar"; b.modeUntil = 1000;
    expect(resolveCast(world, request(world, 294))).toBe(false);
  });
  it("a held cast resolves on a later target and preserves the 8-second cooldown", () => {
    const { world, of } = swarmWorld(); emitCast(world, request(world));
    world.tick = 30; addBeast(world, "nham-vien", { x: 0, z: -10 }); stepCasts(world);
    expect(world.casts.held).toHaveLength(0);
    expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(510);
    expect(of("cast").at(-1)!.state).toBe("resolved");
    expect(of("skill-fx")[0]!.tick).toBe(30);
  });
  it("overlapping casts have independent ids, snapshots, events and end ticks", () => {
    const { world, of } = swarmWorld(); const b = addBeast(world, "nham-vien", { x: -10, z: -10 });
    resolveCast(world, request(world, 300));
    const first = world.skills.swarm!.casts[0]!, bytesBefore = first.packet.slice();
    world.tick = 20; b.x = mmToU(12000); resolveCast(world, request(world, 301));
    expect(world.skills.swarm!.casts).toHaveLength(2);
    const second = world.skills.swarm!.casts[1]!;
    expect(first.packet).toEqual(bytesBefore); expect(first.pearl).not.toEqual(second.pearl);
    for (let t = 20; t <= Math.max(first.endTick, 20 + second.endTick); t += 1) { world.tick = t; stepSkills(world); }
    expect(of("skill-fx").filter((e) => e.stage === "swarm-end").map((e) => e.castId).sort()).toEqual([300, 301]);
    expect(world.skills.swarm!.casts).toHaveLength(0);
  });
  it("late arrivals, dead beasts and out-of-field beasts never change a committed path", () => {
    const { world } = swarmWorld(); const b = addBeast(world, "nham-vien", { x: -10, z: -10 });
    const outside = addBeast(world, "nham-vien", { x: 10, z: 0 }); outside.x = mmToU(1_000_000);
    resolveCast(world, request(world)); const cast = world.skills.swarm!.casts[0]!;
    const packet = cast.packet.slice(); b.alive = false;
    addBeast(world, "hoa-nha", { x: 10, z: -10, gate: "sky" });
    expect(swarmSnapshot(world)).toHaveLength(1);
    world.tick = 1; stepSkills(world); expect(cast.packet).toEqual(packet);
    expect(cast.snapshot).toHaveLength(1);
  });
  it("packs exact samples and tick metadata, has a verifiable checksum and rejects >24 KiB", () => {
    const plan = planSwarm(FIELD, ORIGIN, LAYOUTS[0]!);
    const packet = encodeSwarmCast(plan, 12, 1, 99);
    expect(Array.from(packet.slice(0, 7))).toEqual([1, 1, 1, 12, 1, 2, 99]);
    expect(packet[SWARM_PACKET.burstTick]).toBe(plan.burstTick); expect(packet[SWARM_PACKET.endTick]).toBe(plan.endTick);
    expect(packet[SWARM_PACKET.checksum]).toBe(swarmChecksum(packet));
    const corrupted = packet.slice(); corrupted[10] = corrupted[10]! + 1; expect(swarmChecksum(corrupted)).not.toBe(packet[SWARM_PACKET.checksum]);
    expect(wireSamples(packet)).toEqual(plan.dragons.map((d) => d.samples));
    const worst: SwarmPlan = { ...plan, dragons: plan.dragons.map((d) => ({ ...d, samples: new Int32Array(301 * 3) })) };
    expect(encodeSwarmCast(worst, 1, 0, 0).byteLength).toBe(18280);
    const tooBig = { ...plan, dragons: plan.dragons.map((d) => ({ ...d, samples: new Int32Array(5000) })) };
    expect(() => encodeSwarmCast(tooBig, 1, 0, 0)).toThrow("24 KiB");
  });
  it("200 layouts: samples and packet bytes are identical over three reruns", () => {
    for (const layout of LAYOUTS) {
      const original = planSwarm(FIELD, ORIGIN, layout), packet = encodeSwarmCast(original, 293, 0, 0);
      for (let rerun = 0; rerun < 3; rerun += 1) {
        const next = planSwarm(FIELD, ORIGIN, layout);
        expect(bytes(encodeSwarmCast(next, 293, 0, 0))).toEqual(bytes(packet));
        expect(next.dragons.map((d) => d.base)).toEqual(original.dragons.map((d) => d.base));
      }
    }
  }, 30000);
  it("200 complete fights replay with identical cast packets, lifecycle and final world hashes", () => {
    const fight = (layout: readonly SwarmBeast[], seed: number): { hash: string; packets: Uint8Array[]; lifecycle: string[] } => {
      const world = createWorld(THANH_THACH_AI, seed, { ...testHeader({ seed }), swordKey2: "swarm" });
      world.phase = "wave"; world.phaseEndsAt = -1;
      for (const p of layout) {
        const b = addBeast(world, p.boss ? "thiet-boi-lang-vuong" : p.sky ? "hoa-nha" : "nham-vien", { x: p.x / 1000, z: p.z / 1000, gate: p.sky ? "sky" : "A" });
        b.hp = b.hpMax = 100000;
      }
      const packets: Uint8Array[] = [], lifecycle: string[] = [];
      for (let t = 0; t < 390; t += 1) {
        if (t === 0 || t === 20) emitCast(world, request(world, 293 + t));
        step(world, []);
        for (const e of world.events.drain()) if (e.type === "skill-fx" && e.stage.startsWith("swarm-")) {
          lifecycle.push(e.stage + ":" + e.tick + ":" + e.castId); if (e.swarm) packets.push(bytes(e.swarm));
        }
        world.formation.heart = world.formation.heartMax;
      }
      expect(hashedFloats(world, HASH_SKIP)).toEqual([]);
      return { hash: hashWorldHex(world), packets, lifecycle };
    };
    for (let i = 0; i < LAYOUTS.length; i += 1) expect(fight(LAYOUTS[i]!, i + 1)).toEqual(fight(LAYOUTS[i]!, i + 1));
  }, 120000);
  it("200 matches reach defeat and replay through the real header/log with identical packet bytes and world/local hashes", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const runner = createMatchRunner({ ...testHeader({ seed }), swordKey2: "swarm" });
      const packets: Uint8Array[] = [];
      runner.send({ type: "start" });
      while (!runner.finished && runner.world.tick < 43200) {
        const w = runner.world, locked = w.words.seats[0]!.locked;
        const next = locked >= 0 ? w.words.live[locked] : w.words.live.find((word) => word.slot === 2 && word.state === "ready");
        if (next && (w.phase === "wave" || w.phase === "boss")) runner.send({ type: "key", seat: 0, letter: next.text.charCodeAt(next.typed) - 97, ms: w.tick * 17, origin: at(0, 3), aim: null });
        runner.tick();
        for (const e of runner.drain()) if (e.type === "skill-fx" && e.swarm) packets.push(bytes(e.swarm));
      }
      expect(runner.world.phase).toBe("defeat"); // Part A intentionally deals no key-2 damage.
      expect(packets.length).toBeGreaterThan(0);
      const replay = rebuild(runner.header, runner.log, runner.world.tick, runner.localStepped);
      expect(replay.hashes()).toEqual(runner.hashes());
      const replayPackets: Uint8Array[] = [];
      for (const e of replay.drain()) if (e.type === "skill-fx" && e.swarm) replayPackets.push(bytes(e.swarm));
      expect(replayPackets).toEqual(packets);
      expect(officialCheck(runner)?.same).toBe(true);
    }
  }, 120000);
  it("builds five routes for 60 beasts below 2 ms mean and reports the 200-layout envelope", () => {
    for (let i = 0; i < 200; i += 1) planSwarm(FIELD, ORIGIN, LAYOUTS[i]!);
    const rows = LAYOUTS.map((layout) => {
      const start = performance.now(); const p = planSwarm(FIELD, ORIGIN, layout); const ms = performance.now() - start;
      return { radius: Math.min(...p.dragons.map((d) => minimumRadiusMm(d.base, p.pearl))), length: Math.max(...p.dragons.map((d) => d.lengthMm)), samples: Math.max(...p.dragons.map((d) => d.arc.length)), bytes: encodeSwarmCast(p, 293, 0, 0).byteLength, ms, fallback: p.dragons.filter((d) => d.fallback).length };
    });
    const meanMs = rows.reduce((n, r) => n + r.ms, 0) / rows.length;
    console.log("SWARM_293_METRICS", JSON.stringify({ layouts: 200, minRadiusMm: Math.min(...rows.map((r) => r.radius)), maxLengthMm: Math.max(...rows.map((r) => r.length)), maxSamples: Math.max(...rows.map((r) => r.samples)), maxPacketBytes: Math.max(...rows.map((r) => r.bytes)), meanMs, maxMs: Math.max(...rows.map((r) => r.ms)), fallback: rows.reduce((n, r) => n + r.fallback, 0) }));
    expect(meanMs).toBeLessThanOrEqual(2);
  });
});
