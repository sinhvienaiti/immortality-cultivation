import { describe, expect, it } from "vitest";
import { SWARM } from "../../src/content/data/swarm";
import { matchRulesHash } from "../../src/app/app";
import type { BeastState, Cast, SimEvent, StageDef, World } from "../../src/content/types";
import { scaleHit, wHpOf } from "../../src/sim/combat";
import { mmToU, U_PER_MM } from "../../src/sim/fixed";
import { createSkillsState } from "../../src/sim/skills";
import { resolveSwarm, splitSwarmPool, stepSwarm, swarmTouches, swarmWeight, type SwarmCast, type SwarmDragon } from "../../src/sim/swarm";
import type { SwarmBounds, SwarmPoint } from "../../src/sim/swarm-geometry";
import { addBeast, at, castOf, makeWorld, setTamNhan, THANH_THACH_AI, type TestWorld } from "./combat-fixture";

const ARENA: StageDef = {
  ...THANH_THACH_AI,
  id: "swarm-damage-test",
  field: { ...THANH_THACH_AI.field, minXMm: -20_000, maxXMm: 20_000, minZMm: -20_000, maxZMm: 20_000, mechSlots: [], pillars: [] },
};
const BOUNDS: SwarmBounds = { minXMm: -10_000, maxXMm: 10_000, minZMm: -10_000, maxZMm: 10_000 };
const P: SwarmPoint = { x: 0, y: 1200, z: 0 };
type Phase = "release" | "touch" | "burst";
type Hit = Extract<SimEvent, { type: "hit" }>;

function swarmWorld(): TestWorld {
  const made = makeWorld({ realm: 0, stage: ARENA });
  (made.world as { header: World["header"] }).header = { ...made.world.header, swordKey2: "swarm" };
  (made.world as { skills: World["skills"] }).skills = createSkillsState({ ...made.world, seats: made.world.seats.length });
  setTamNhan(made.world, false);
  return made;
}
function durable(b: BeastState, hp = 1_000_000): BeastState {
  b.hp = b.hpMax = hp;
  b.posture = null;
  b.mode = "walk";
  b.modeUntil = -1;
  return b;
}
function beast(world: World, x = 0, z = 0, options: { boss?: boolean; cluster?: number; hp?: number } = {}): BeastState {
  const b = durable(addBeast(world, options.boss ? "thiet-boi-lang-vuong" : "thach-thu", { x, z, cluster: options.cluster }), options.hp);
  // Contact fixtures put the beast centre directly on the known 1.2 m route.
  b.y = mmToU(1200);
  return b;
}
function castNow(world: World, actionId = 294, options: Partial<Cast> = {}): SwarmCast {
  expect(resolveSwarm(world, castOf(world, 2, { origin: at(0, 0), quality: "good", actionId, ...options }))).toBe(true);
  return world.skills.swarm!.casts.at(-1)!;
}
function tickAt(world: World, cast: SwarmCast, offset: number): void {
  world.tick = cast.startTick + offset;
  stepSwarm(world);
}
function hits(made: TestWorld, phase?: Phase, castId?: number): Hit[] {
  return made.of("hit").filter((h) => h.source === "slot2" && (phase === undefined || h.phase === phase) && (castId === undefined || h.castId === castId));
}
const sum = (values: readonly { amount: number }[]): number => values.reduce((n, v) => n + v.amount, 0);
const budget = (world: World, w100: number): number => scaleHit(world, 0, wHpOf(world, w100), "good", "slot2", null);
const point = (b: BeastState): SwarmPoint => ({ x: b.x / U_PER_MM, y: b.y / U_PER_MM, z: b.z / U_PER_MM });

/** An exact 30 m C(s), independent of the route planner, to exercise occupied spans. */
function line(index = 0, z = 0): SwarmDragon {
  const arc = Array.from({ length: 121 }, (_, i) => i * 250);
  const samples = new Int32Array(arc.flatMap((x) => [x, 1200, z]));
  return {
    index, targets: [], waypoints: [], base: samples.slice(), samples, arc, lengthMm: 30_000,
    smoothed: false, launchTick: 2, diveTick: 115, fallback: false,
  };
}
function useLines(cast: SwarmCast, zs = [0, 0, 0, 0, 0]): void {
  const dragons = zs.map((z, i) => line(i, z));
  const burstTick = Math.max(...dragons.map((d) => d.diveTick)) + SWARM.timing.burstDelayTicks;
  Object.assign(cast, { dragons, burstTick, endTick: burstTick + SWARM.timing.aftermathTicks });
}

describe("swarm burst weights and integer allocation", () => {
  it("uses 1000 at the pearl, 800 halfway along a ray and 600 on the field boundary", () => {
    for (const p of [{ x: 0, y: 1200, z: 0 }, { x: -2000, y: 9000, z: 3000 }]) {
      expect(swarmWeight(p, p, BOUNDS)).toBe(1000);
      const edge = { x: BOUNDS.maxXMm, y: -5000, z: p.z };
      expect(swarmWeight(edge, p, BOUNDS)).toBe(600);
      expect(swarmWeight({ ...edge, x: (p.x + edge.x) / 2 }, p, BOUNDS)).toBe(800);
      const diagonal = { x: BOUNDS.maxXMm, y: p.y, z: BOUNDS.maxZMm };
      expect(swarmWeight(diagonal, p, BOUNDS)).toBe(600);
      expect(swarmWeight({ x: (p.x + diagonal.x) / 2, y: 0, z: (p.z + diagonal.z) / 2 }, p, BOUNDS)).toBe(800);
    }
  });

  it("reserves one per victim and resolves equal largest remainders by smaller id", () => {
    const victims = [{ id: 30, weight: 600 }, { id: 10, weight: 1000 }, { id: 20, weight: 600 }];
    const expected = [{ id: 10, amount: 45 }, { id: 20, amount: 28 }, { id: 30, amount: 27 }];
    const sorted = (input: typeof victims) => splitSwarmPool(100, input).sort((a, b) => a.id - b.id);
    expect(sorted(victims)).toEqual(expected);
    expect(sorted([...victims].reverse())).toEqual(expected);
    expect(sorted([victims[1]!, victims[2]!, victims[0]!])).toEqual(expected);
    expect(splitSwarmPool(1, victims).every((v) => v.amount === 1)).toBe(true);
    expect(splitSwarmPool(0, [])).toEqual([]);
  });

  it("conserves max(pool,N) before caps for varied counts, weights and input orders", () => {
    for (const n of [1, 2, 3, 7, 60]) {
      const victims = Array.from({ length: n }, (_, i) => ({ id: n - i, weight: 600 + (i * 73) % 401 }));
      for (const pool of [0, 1, n - 1, n, n + 1, 225, 10_001]) {
        const result = splitSwarmPool(pool, victims);
        expect(sum(result)).toBe(Math.max(pool, n));
        expect(result.every((v) => Number.isSafeInteger(v.amount) && v.amount >= 1)).toBe(true);
        expect([...result].sort((a, b) => a.id - b.id)).toEqual(splitSwarmPool(pool, [...victims].reverse()).sort((a, b) => a.id - b.id));
      }
    }
  });
});

describe("swarm contact is the clipped occupied 3D capsule", () => {
  it("uses 850 mm plus hurtbox, includes the exact boundary, and respects height", () => {
    const d = line();
    expect(swarmTouches(d, 32, { x: 5000, y: 2050, z: 0 }, 0)).toBe(true);
    expect(swarmTouches(d, 32, { x: 5000, y: 2051, z: 0 }, 0)).toBe(false);
    expect(swarmTouches(d, 32, { x: 5000, y: 1200, z: 1200 }, 350)).toBe(true);
    expect(swarmTouches(d, 32, { x: 5000, y: 1200, z: 1201 }, 350)).toBe(false);
    expect(swarmTouches(d, 32, { x: 5000, y: 1800, z: 603 }, 0)).toBe(false);
    expect(swarmTouches(d, 32, { x: 5000, y: 1800, z: 600 }, 0)).toBe(true);
  });

  it("clips both ends between samples and removes the capsule before launch and after retraction", () => {
    const d = line();
    // F4 head = 533 mm; extending to the next 750 mm sample would hit 1384 incorrectly.
    expect(swarmTouches(d, 4, { x: 1383, y: 1200, z: 0 }, 0)).toBe(true);
    expect(swarmTouches(d, 4, { x: 1384, y: 1200, z: 0 }, 0)).toBe(false);
    // F81 tail = 5066 mm; retaining the preceding 5000 mm sample would hit 4215 incorrectly.
    expect(swarmTouches(d, 81, { x: 4216, y: 1200, z: 0 }, 0)).toBe(true);
    expect(swarmTouches(d, 81, { x: 4215, y: 1200, z: 0 }, 0)).toBe(false);
    expect(swarmTouches(d, 1, P, 0)).toBe(false);
    expect(swarmTouches(d, 130, { x: 21_149, y: 1200, z: 0 }, 0)).toBe(false);
    expect(swarmTouches(d, 145, { x: 30_000, y: 1200, z: 0 }, 1000)).toBe(false);
  });
});

describe("swarm release pool and per-cast contact", () => {
  it("F1 shares one release pool equally, with the remainder in serial order and a strict horizontal 6 m radius", () => {
    const made = swarmWorld(), { world } = made;
    const inside = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([x, z]) => beast(world, x!, z!));
    inside[0]!.y = mmToU(50_000); // Release is horizontal, regardless of height.
    const outside = [beast(world, 6.001, 0), beast(world, 6, 0.001)];
    const cast = castNow(world);
    tickAt(world, cast, 0);
    expect(hits(made)).toHaveLength(0);
    tickAt(world, cast, 1);
    const release = hits(made, "release", cast.castId), pool = budget(world, SWARM.damage.releaseW100);
    expect(sum(release)).toBe(pool);
    expect(release.map((h) => h.beast.serial)).toEqual(inside.map((b) => b.serial));
    expect(release.map((h) => h.amount)).toEqual(inside.map((_, i) => Math.floor(pool / inside.length) + (i < pool % inside.length ? 1 : 0)));
    expect(outside.every((b) => b.hp === b.hpMax)).toBe(true);
    expect(release.every((h) => h.tick === cast.startTick + 1 && h.dragon === undefined)).toBe(true);
    expect(cast.firstHitTick).toBe(1);
    expect(cast.channels.release).toMatchObject({ allocated: pool, dealt: pool, capped: 0, overkill: 0, immune: 0 });
  });

  it("does not inflate a small release pool to guarantee one HP per victim", () => {
    const made = swarmWorld(), { world } = made;
    for (let i = 0; i < 60; i += 1) beast(world, 0, 0);
    const cast = castNow(world);
    tickAt(world, cast, 1);
    const pool = budget(world, SWARM.damage.releaseW100), release = hits(made, "release");
    expect(pool).toBeLessThan(60);
    expect(sum(release)).toBe(pool);
    expect(release.map((h) => h.beast.serial)).toEqual(world.beasts.list.slice(0, pool).map((b) => b.serial));
  });

  it("keeps the cast grade and applies its release multipliers once", () => {
    const made = swarmWorld(), { world } = made;
    beast(world);
    const cast = castNow(world, 941, { quality: "flash" });
    expect(cast.grade).toBe("flash");
    tickAt(world, cast, 1);
    expect(sum(hits(made, "release"))).toBe(scaleHit(world, 0, wHpOf(world, SWARM.damage.releaseW100), "flash", "slot2", null));
  });

  it("touches a beast only once across all five dragons and later ticks", () => {
    const made = swarmWorld(), { world } = made;
    const b = beast(world, 10, 0), cast = castNow(world);
    useLines(cast);
    for (let t = 40; t <= 144; t += 1) tickAt(world, cast, t);
    const touch = hits(made, "touch", cast.castId);
    expect(touch).toHaveLength(1);
    expect(touch[0]).toMatchObject({ beast: { serial: b.serial }, dragon: 0, tick: cast.startTick + 40, amount: budget(world, SWARM.damage.touchW100) });
    expect(cast.victims.get(b.serial)).toMatchObject({ touched: true, hits: 1, dealt: touch[0]!.amount });
    expect(cast.firstHitTick).toBe(40);
  });

  it("orders simultaneous touch hits by dragon then beast id rather than slot order", () => {
    const made = swarmWorld(), { world } = made;
    const beasts = [beast(world, 10, 0), beast(world, 10, 0), beast(world, 10, -8), beast(world, 10, -8)];
    [40, 10, 30, 20].forEach((serial, i) => { beasts[i]!.serial = serial; });
    const cast = castNow(world);
    useLines(cast, [0, -8000, -16_000, -16_000, -16_000]);
    tickAt(world, cast, 40);
    expect(hits(made, "touch").map((h) => [h.dragon, h.beast.serial])).toEqual([[0, 10], [0, 40], [1, 20], [1, 30]]);
  });

  it("a reused slot with a new serial has an independent touch allowance", () => {
    const made = swarmWorld(), { world } = made;
    const b = beast(world, 10, 0), cast = castNow(world), first = b.serial;
    useLines(cast);
    tickAt(world, cast, 40);
    b.serial += 1000;
    durable(b);
    tickAt(world, cast, 41);
    expect(hits(made, "touch").map((h) => h.beast.serial)).toEqual([first, b.serial]);
    expect(cast.victims.has(first)).toBe(true);
    expect(cast.victims.has(b.serial)).toBe(true);
  });

  it("overlapping casts keep their own touch allowance and castId on hit events", () => {
    const made = swarmWorld(), { world } = made;
    beast(world, 10, 0);
    const first = castNow(world, 101), second = castNow(world, 102);
    useLines(first); useLines(second);
    tickAt(world, first, 40);
    tickAt(world, first, 41);
    expect(hits(made, "touch").map((h) => [h.castId, h.dragon])).toEqual([[101, 0], [102, 0]]);
    expect(first.area).not.toBe(second.area);
    expect(first.victims).not.toBe(second.victims);
  });
});

describe("swarm damage caps and live burst", () => {
  it.each([false, true])("shares one per-beast cap across release, touch and burst (boss=%s)", (boss) => {
    const made = swarmWorld(), { world } = made;
    const b = beast(world, 0, 0, { boss }), cast = castNow(world);
    useLines(cast);
    tickAt(world, cast, 1); tickAt(world, cast, 3); tickAt(world, cast, cast.burstTick);
    const events = hits(made, undefined, cast.castId);
    const cap = wHpOf(world, boss ? SWARM.damage.bossCapW100 : SWARM.damage.ordinaryCapW100);
    expect(events.map((h) => h.phase)).toEqual(["release", "touch", "burst"]);
    expect(sum(events)).toBe(cap);
    expect(b.hpMax - b.hp).toBe(cap);
    expect(cast.victims.get(b.serial)).toMatchObject({ dealt: cap, touched: true, hits: 3 });
    expect(cast.channels.burst.capped).toBeGreaterThan(0);
    expect(cast.channels.burst.overkill).toBe(0);
  });

  it("caps each boss independently rather than sharing a single boss budget", () => {
    const made = swarmWorld(), { world } = made;
    const bosses = [beast(world, 0, 0, { boss: true }), beast(world, 0, 0, { boss: true })], cast = castNow(world);
    useLines(cast);
    tickAt(world, cast, 1); tickAt(world, cast, 3); tickAt(world, cast, cast.burstTick);
    for (const b of bosses) expect(b.hpMax - b.hp).toBe(wHpOf(world, SWARM.damage.bossCapW100));
  });

  it("all three channels consume the same 60% cluster cap", () => {
    const made = swarmWorld(), { world } = made;
    const beasts = [beast(world, 0, 0, { cluster: 77, hp: 100 }), beast(world, 0, 0, { cluster: 77, hp: 100 })];
    const cast = castNow(world);
    useLines(cast);
    tickAt(world, cast, 1); tickAt(world, cast, 3); tickAt(world, cast, cast.burstTick);
    expect(sum(hits(made, "release"))).toBe(budget(world, SWARM.damage.releaseW100));
    expect(sum(hits(made, "touch"))).toBe(2 * budget(world, SWARM.damage.touchW100));
    expect(sum(hits(made))).toBe(120);
    expect(beasts.reduce((n, b) => n + b.hpMax - b.hp, 0)).toBe(120);
    expect(cast.area.clusters).toEqual([77]);
    expect(cast.area.left).toEqual([0]);
    expect(cast.channels.burst.capped).toBe(budget(world, SWARM.damage.burstW100) - sum(hits(made, "burst")));
  });

  it("does not redistribute burst allocations cut by a boss cap", () => {
    const made = swarmWorld(), { world } = made;
    const boss = beast(world, 0, 0, { boss: true }), other = beast(world, 10, 0), cast = castNow(world);
    useLines(cast, [0, -8000, -16_000, -16_000, -16_000]);
    tickAt(world, cast, 1); tickAt(world, cast, 3);
    const shares = splitSwarmPool(budget(world, SWARM.damage.burstW100), [boss, other].map((b) => ({ id: b.serial, weight: swarmWeight(point(b), cast.pearl, cast.bounds) })));
    tickAt(world, cast, cast.burstTick);
    const burst = hits(made, "burst"), otherShare = shares.find((s) => s.id === other.serial)!.amount;
    expect(burst.find((h) => h.beast.serial === other.serial)!.amount).toBe(otherShare);
    expect(sum(burst)).toBeLessThan(budget(world, SWARM.damage.burstW100));
    expect(boss.hpMax - boss.hp).toBe(wHpOf(world, SWARM.damage.bossCapW100));
  });

  it("uses the living in-field snapshot at the dynamic burst tick, including late spawns and exact boundaries", () => {
    const made = swarmWorld(), { world } = made;
    const dead = beast(world, 0, 0), cast = castNow(world);
    dead.alive = false; dead.hp = 0;
    const late = beast(world, cast.pearl.x / 1000, cast.pearl.z / 1000);
    const boundary = beast(world, ARENA.field.maxXMm / 1000, 0);
    const outside = beast(world, 0, 0);
    outside.x = mmToU(ARENA.field.maxXMm + 1);
    expect(cast.burstTick).toBe(Math.max(...cast.dragons.map((d) => d.diveTick)) + 32);
    expect(cast.burstTick).not.toBe(260);
    tickAt(world, cast, cast.burstTick - 1);
    expect(hits(made, "burst")).toHaveLength(0);
    tickAt(world, cast, cast.burstTick);
    const burst = hits(made, "burst");
    expect(burst.map((h) => h.beast.serial)).toEqual([late.serial, boundary.serial]);
    expect(sum(burst)).toBe(budget(world, SWARM.damage.burstW100));
    expect(burst.every((h) => h.tick === cast.startTick + cast.burstTick && h.castId === cast.castId && h.dragon === undefined)).toBe(true);
    expect(outside.hp).toBe(outside.hpMax);
    expect(made.of("skill-fx").filter((e) => e.stage === "swarm-burst").map((e) => e.tick)).toEqual([cast.startTick + cast.burstTick]);
    tickAt(world, cast, cast.burstTick + 1);
    expect(hits(made, "burst")).toHaveLength(2);
    tickAt(world, cast, cast.endTick);
    expect(world.skills.swarm!.casts).toHaveLength(0);
  });

  it("records effective damage only when HP left is smaller than the assigned share", () => {
    const made = swarmWorld(), { world } = made;
    const weak = beast(world, 0, 0, { hp: 2 }), strong = beast(world, 10, 0), cast = castNow(world);
    tickAt(world, cast, cast.burstTick);
    const events = hits(made, "burst");
    expect(events.find((h) => h.beast.serial === weak.serial)!.amount).toBe(2);
    expect(weak.alive).toBe(false);
    expect(sum(events)).toBe(2 + events.find((h) => h.beast.serial === strong.serial)!.amount);
    expect(sum(events)).toBeLessThan(budget(world, SWARM.damage.burstW100));
    expect(cast.victims.get(weak.serial)!.dealt).toBe(2);
    expect(cast.channels.burst.overkill).toBeGreaterThan(0);
    expect(cast.channels.burst.capped).toBe(0);
  });

  it("an immune boss retains its burst allocation without dealing or redistributing that share", () => {
    const made = swarmWorld(), { world } = made;
    const boss = beast(world, 0, 0, { boss: true }), other = beast(world, 10, 0), cast = castNow(world);
    boss.mode = "roar";
    boss.modeUntil = cast.startTick + cast.burstTick + 100;
    const pool = budget(world, SWARM.damage.burstW100);
    const shares = splitSwarmPool(pool, [boss, other].map((b) => ({ id: b.serial, weight: swarmWeight(point(b), cast.pearl, cast.bounds) })));
    const immuneShare = shares.find((s) => s.id === boss.serial)!.amount;
    const liveShare = shares.find((s) => s.id === other.serial)!.amount;
    tickAt(world, cast, cast.burstTick);
    expect(hits(made, "burst").map((h) => [h.beast.serial, h.amount])).toEqual([[other.serial, liveShare]]);
    expect(boss.hp).toBe(boss.hpMax);
    expect(cast.channels.burst).toMatchObject({ allocated: pool, dealt: liveShare, immune: immuneShare, capped: 0, overkill: 0 });
    expect(cast.victims.get(boss.serial)!.dealt).toBe(0);
    expect(cast.firstHitTick).toBe(cast.burstTick);
  });

  it.each(["collision", "damage"] as const)("hashes the %s version only for swarm", (key) => {
    const versions = SWARM.versions as { collision: number; damage: number };
    const before = {
      line: matchRulesHash(ARENA),
      twin: matchRulesHash(ARENA, { swordKey2: "twin-pearl" }),
      swarm: matchRulesHash(ARENA, { swordKey2: "swarm" }),
    };
    const original = versions[key];
    try {
      versions[key] += 1;
      expect(matchRulesHash(ARENA, { swordKey2: "swarm" })).not.toBe(before.swarm);
      expect(matchRulesHash(ARENA)).toBe(before.line);
      expect(matchRulesHash(ARENA, { swordKey2: "twin-pearl" })).toBe(before.twin);
    } finally {
      versions[key] = original;
    }
  });
});
