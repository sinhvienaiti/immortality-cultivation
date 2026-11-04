// Twin Dragons, One Burning Pearl (sim/twin-pearl.ts, content/data/twin-pearl.ts), Kiếm key 2's grey box behind the
// header flag `swordKey2: "twin-pearl"`: the flag off leaves today's world (pinned hashes from 1a78a82); the lanes from
// the flow field; the volumes (hold, touch, head capsules and trail, sky sweep, lotus) at their frames, each checked by
// the hits it deals; ≤ 3 hits a beast (one of each kind, ≥ 20 ticks apart); each side's falloff and budget; one
// swarm-cluster cap per cast; the Thế split; mirror symmetry; the Vương's cap per cast id; determinism and no floats.
import { describe, expect, it } from "vitest";
import { kiemSkill } from "../../src/content/data/school-kiem";
import { TWIN_PEARL, TWIN_PEARL_END_TICK } from "../../src/content/data/twin-pearl";
import { FIELD } from "../../src/content/rules";
import type { BeastState, World } from "../../src/content/types";
import { createReplayHeader, matchRulesHash } from "../../src/app/app";
import { wHpOf } from "../../src/sim/combat";
import { emitCast } from "../../src/sim/cast";
import { gatePoint } from "../../src/sim/field";
import { mToU, mmToU, mulDiv, mulDivSym, uToM } from "../../src/sim/fixed";
import { HASH_SKIP, hashWorldHex, hashedFloats } from "../../src/sim/hash";
import { createSkillsState, resolveCast, stepSkills } from "../../src/sim/skills";
import { POOL_CORRIDOR, POOL_LOTUS, POOL_PARTS, POOL_SKY, POOL_TOUCH, inBody, lotusRegion, twinPearlGeometry, twinPearlPool, volumesAt, type TwinPearlCast } from "../../src/sim/twin-pearl";
import { spawnBeast } from "../../src/sim/spawn";
import { createWorld, step } from "../../src/sim/world";
import { addBeast, addCluster, advance, castOf, makeWorld, setTamNhan, testHeader, THANH_THACH_AI } from "./combat-fixture";

const HOLD = 1;
const TOUCH = 2;
const BODY = 4;
const SKY = 8;
const LOTUS_FULL = 16;
const LOTUS_HALF = 32;

/** A fixture world with the flag on (the header asks for it before the skills state is made). */
function twinWorld(options: Parameters<typeof makeWorld>[0] = {}) {
  const made = makeWorld(options);
  (made.world as { header: World["header"] }).header = { ...made.world.header, swordKey2: "twin-pearl" };
  (made.world as { skills: World["skills"] }).skills = createSkillsState({ ...worldInit(made.world) });
  return made;
}

function worldInit(world: World) {
  return { stage: world.stage, header: world.header, seed: world.seed, preset: world.preset, realm: world.realm, gPm: world.gPm, seats: world.seats.length, rng: world.rng };
}

const m = (u: number): number => Math.round(uToM(u) * 100) / 100;
const slot2Hits = (of: ReturnType<typeof makeWorld>["of"], beast: BeastState) =>
  of("hit").filter((hit) => hit.source === "slot2" && hit.beast.slot === beast.slot && hit.beast.serial === beast.serial);

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
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    expect(world.skills.strikes.map((s) => s.kind)).toEqual(["line"]);
  });

  it("with the flag key 2 goes to the grey box (no line strike), keeps the 8 s cooldown, and holds on an empty field", () => {
    const { world } = twinWorld();
    expect(Object.keys(world.skills)).toEqual(["seats", "strikes", "zones", "nextId", "twinPearl"]);
    const before = hashWorldHex(world);
    expect(resolveCast(world, castOf(world, 2))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    addBeast(world, "nham-vien", { x: 0, z: -15 });
    world.tick = 100;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    expect(world.skills.strikes).toHaveLength(0);
    expect(world.skills.twinPearl!.casts).toHaveLength(1);
    expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(100 + 480);
    expect(kiemSkill(2).cooldownMs).toBe(8000);
  });
});

describe("lanes and the meeting point come from the flow field", () => {
  it("each gate's route is its waypoints to the heart edge; the meeting point is the midpoint of the last bends", () => {
    const { world } = twinWorld();
    const geo = twinPearlGeometry(world);
    const [a, b] = geo.lanes;
    expect(a.route.map((p) => [m(p.x), m(p.z)])).toEqual([[-15, -17.75], [-5.25, -9.25], [-0.99, -1.74]]);
    expect(b.route.map((p) => [m(p.x), m(p.z)])).toEqual([[15, -17.75], [5.25, -9.25], [0.99, -1.74]]);
    expect([m(geo.meet.x), m(geo.meet.z)]).toEqual([0, -9.25]);
    // The heads' base path: the meeting point, the bend, the gate.
    expect(a.path.map((p) => [m(p.x), m(p.z)])).toEqual([[0, -9.25], [-5.25, -9.25], [-15, -17.75]]);
    // Sky routes: the far corners in to the heart edge.
    expect([m(a.skyFrom.x), m(a.skyFrom.z), m(b.skyFrom.x)]).toEqual([-20, -18, 20]);
    expect(Math.round(Math.hypot(uToM(a.skyTo.x), uToM(a.skyTo.z)) * 100) / 100).toBe(FIELD.heartEdgeMm / 1000);
  });

  it("the S path starts at the meeting point, ends at the gate, stays within the amplitude, and the two heads mirror", () => {
    const { world } = twinWorld();
    const [a, b] = twinPearlGeometry(world).lanes;
    expect([a.sx[0], a.sz[0]]).toEqual([0, mToU(-9.25)]);
    expect([a.sx[a.sx.length - 1], a.sz[a.sz.length - 1]]).toEqual([a.path[2]!.x, a.path[2]!.z]);
    expect(a.sx.map((x) => -x + 0)).toEqual(b.sx);
    expect(a.sz).toEqual(b.sz);
    // Lateral offset from the base path never past the amplitude (rounding: a unit or two).
    const amp = mToU(TWIN_PEARL.heads.amplitudeMm / 1000);
    let most = 0;
    for (let i = 0; i < a.sx.length; i += 1) {
      const x = a.sx[i]!;
      const z = a.sz[i]!;
      const seg1 = Math.abs(z - mToU(-9.25));
      const dx = a.path[2]!.x - a.path[1]!.x;
      const dz = a.path[2]!.z - a.path[1]!.z;
      const seg2 = Math.abs((x - a.path[1]!.x) * dz - (z - a.path[1]!.z) * dx) / Math.hypot(dx, dz);
      most = Math.max(most, x >= a.path[1]!.x ? seg1 : seg2);
    }
    expect(most).toBeLessThanOrEqual(amp * 1.001);
    expect(most).toBeGreaterThan(amp * 0.9);
    // The head passes the samples in order, from F3 to F42.
    expect(a.pass[0]).toBe(3);
    expect(a.pass[a.pass.length - 1]).toBe(42);
    for (let i = 1; i < a.pass.length; i += 1) expect(a.pass[i]!).toBeGreaterThanOrEqual(a.pass[i - 1]!);
    // About 20 m of S path from the meeting point to the gate on this stage (18.2 m straight).
    expect(uToM(a.sLength)).toBeGreaterThan(18.2);
    expect(uToM(a.sLength)).toBeLessThan(22);
  });
});

describe("volumes at their frames (60 Hz frames = sim ticks after F0)", () => {
  const ground = 0;
  const air = mToU(4);
  it("F0 hold strike 8 × 8 m in front of the formation centre, ground only", () => {
    const { world } = twinWorld();
    const geo = twinPearlGeometry(world);
    expect(volumesAt(geo, null, mToU(-3.9), ground, mToU(-7.9), 0) & HOLD).toBe(HOLD);
    expect(volumesAt(geo, null, mToU(-4.1), ground, mToU(-4), 0) & HOLD).toBe(0);
    expect(volumesAt(geo, null, 0, ground, mToU(-8.1), 0) & HOLD).toBe(0);
    expect(volumesAt(geo, null, 0, ground, mToU(0.5), 0) & HOLD).toBe(0);
    expect(volumesAt(geo, null, 0, ground, mToU(-4), 1) & HOLD).toBe(0);
    expect(volumesAt(geo, null, 0, air, mToU(-4), 0) & HOLD).toBe(0);
  });

  it("head capsule r 1.4 m along the S path from F3, its trail still hits 54 ticks after the head passed, never the sky", () => {
    const { world } = twinWorld();
    const geo = twinPearlGeometry(world);
    const lane = geo.lanes[0];
    const k = lane.pass.findIndex((p) => p >= 20);
    const x = lane.sx[k]!;
    const z = lane.sz[k]!;
    const at = lane.pass[k]!;
    // Five ticks earlier the head was about 2.5 m back (0.5 m a tick): not there yet.
    expect(inBody(lane, x, z, at - 5)).toBe(false);
    expect(inBody(lane, x, z, at)).toBe(true);
    expect(inBody(lane, x + mToU(1.39), z, at)).toBe(true);
    expect(volumesAt(geo, null, x, ground, z, at + TWIN_PEARL.trailTicks) & BODY).toBe(BODY);
    // Next samples may still be within 1.4 m: well past the trail, nothing.
    expect(volumesAt(geo, null, x, ground, z, at + TWIN_PEARL.trailTicks + 20) & BODY).toBe(0);
    expect(volumesAt(geo, null, x, air, z, at) & BODY).toBe(0);
    // The gate end is reached at F42 and burns to F96, the cast's last hitting tick.
    const g = lane.sx.length - 1;
    expect(volumesAt(geo, null, lane.sx[g]!, ground, lane.sz[g]!, 42) & BODY).toBe(BODY);
    expect(volumesAt(geo, null, lane.sx[g]!, ground, lane.sz[g]!, 96) & BODY).toBe(BODY);
    expect(TWIN_PEARL_END_TICK).toBe(96);
  });

  it("F30–F50 the tail sweeps each sky route from the corner in, 2.5–6 m high only", () => {
    const { world } = twinWorld();
    const geo = twinPearlGeometry(world);
    const corner = geo.lanes[0].skyFrom;
    expect(volumesAt(geo, null, corner.x, air, corner.z, 30) & SKY).toBe(SKY);
    expect(volumesAt(geo, null, corner.x, air, corner.z, 29) & SKY).toBe(0);
    expect(volumesAt(geo, null, corner.x, mToU(1), corner.z, 30) & SKY).toBe(0);
    expect(volumesAt(geo, null, corner.x, mToU(6.5), corner.z, 30) & SKY).toBe(0);
    // The front reaches the heart edge at F50; a crow midway is swept around F40.
    const mid = { x: corner.x / 2, z: corner.z / 2 };
    const swept = [];
    for (let t = 30; t <= 50; t += 1) if (volumesAt(geo, null, mid.x, air, mid.z, t) & SKY) swept.push(t);
    expect(swept.length).toBeGreaterThan(0);
    expect(swept[0]!).toBeGreaterThanOrEqual(36);
    expect(swept[swept.length - 1]!).toBeLessThanOrEqual(44);
    const end = geo.lanes[0].skyTo;
    expect(volumesAt(geo, null, end.x, air, end.z, 50) & SKY).toBe(SKY);
    expect(volumesAt(geo, null, end.x, air, end.z, 51) & SKY).toBe(0);
  });

  it("F51–F71 the lotus: full on the two long petals and the hold zone, half elsewhere within r 9 m", () => {
    const { world } = twinWorld();
    const geo = twinPearlGeometry(world);
    const lane = geo.lanes[0];
    // 10 m from the meeting point along lane A (5.25 m to the bend, then 4.75 m towards the gate): past the 9 m bloom,
    // still on the long petal.
    const dx = lane.path[2]!.x - lane.path[1]!.x;
    const dz = lane.path[2]!.z - lane.path[1]!.z;
    const len = Math.hypot(dx, dz);
    const onPetal = { x: Math.round(lane.path[1]!.x + (dx * mToU(4.75)) / len), z: Math.round(lane.path[1]!.z + (dz * mToU(4.75)) / len) };
    expect(lotusRegion(geo, onPetal.x, onPetal.z)).toBe(2);
    expect(volumesAt(geo, null, onPetal.x, ground, onPetal.z, 51) & LOTUS_FULL).toBe(LOTUS_FULL);
    expect(volumesAt(geo, null, onPetal.x, ground, onPetal.z, 50) & (LOTUS_FULL | LOTUS_HALF)).toBe(0);
    expect(volumesAt(geo, null, onPetal.x, ground, onPetal.z, 72) & (LOTUS_FULL | LOTUS_HALF)).toBe(0);
    // Between the petals, 6 m north of the meeting point: inside r 9 m, off both petals.
    expect(lotusRegion(geo, 0, mToU(-15.25))).toBe(1);
    expect(volumesAt(geo, null, 0, ground, mToU(-15.25), 60) & LOTUS_HALF).toBe(LOTUS_HALF);
    // The hold zone is full even inside the disc; past r 9 m and off the hold zone, nothing.
    expect(lotusRegion(geo, 0, mToU(-2))).toBe(2);
    expect(lotusRegion(geo, mToU(10), mToU(-2))).toBe(0);
    // A petal is 13 m long: 14 m along lane A from the meeting point is past it (and past r 9 m).
    const far = { x: Math.round(lane.path[1]!.x + (dx * mToU(8.75)) / len), z: Math.round(lane.path[1]!.z + (dz * mToU(8.75)) / len) };
    expect(lotusRegion(geo, far.x, far.z)).toBe(0);
    expect(volumesAt(geo, null, 0, mToU(4), mToU(-15.25), 60) & (LOTUS_FULL | LOTUS_HALF)).toBe(0);
  });
});

describe("hits: ≤ 3 a beast a cast, one of each kind, ≥ 20 ticks apart", () => {
  it("a beast on lane A by the meeting point: touch F1, corridor F21 (its 20-tick gap), lotus F51", () => {
    const { world, of } = twinWorld();
    const beast = addBeast(world, "thiet-giap-tru", { x: -2.4, z: -10.1, gate: "A" });
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    advance(world, 120, [stepSkills]);
    const hits = slot2Hits(of, beast);
    expect(hits.map((h) => h.tick - start)).toEqual([1, 21, 51]);
    const book = world.skills.twinPearl!.casts;
    expect(book).toHaveLength(0);
  });

  it("the shares: 15 % touch, 45 % corridor, 40 % lotus of today's 2.5 W (first beast: no falloff)", () => {
    const { world, of } = twinWorld();
    const beast = addBeast(world, "phong-lang", { x: -2.4, z: -10.1, gate: "A" });
    beast.hp = beast.hpMax = 100_000;
    expect(beast.posture).toBeNull();
    // M_q 1.00 ("good"), Tâm nhãn's +8 % bucket off: P lands as is.
    world.formation.nodes[0]!.on = false;
    expect(resolveCast(world, castOf(world, 2, { quality: "good" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    const p = wHpOf(world, 250);
    expect(slot2Hits(of, beast).map((h) => h.amount)).toEqual([Math.round((p * 15) / 100), Math.round((p * 45) / 100), Math.round((p * 40) / 100)]);
  });

  it("in a crowd every beast takes at most 3, never two of a kind, each ≥ 20 ticks after its last; later victims fall off to 40 %", () => {
    const { world, of } = twinWorld();
    const geo = twinPearlGeometry(world);
    const beasts: BeastState[] = [];
    for (const lane of geo.lanes) {
      for (let k = 0; k < lane.sx.length; k += 3) {
        const b = spawnBeast(world, "thiet-giap-tru", lane.gate, { wave: 0, x: lane.sx[k]!, z: lane.sz[k]! });
        b.hp = b.hpMax = 100_000;
        beasts.push(b);
      }
    }
    for (const [x, z] of [[-1, -3], [1.5, -5], [0, -12], [-3, -6]] as const) {
      const b = addBeast(world, "thiet-giap-tru", { x, z });
      b.hp = b.hpMax = 100_000;
      beasts.push(b);
    }
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    const cast = world.skills.twinPearl!.casts[0]!;
    // The hit caps alone: no budget limit in this crowd (the budget has its own tests).
    cast.pool.fill(10 ** 9);
    advance(world, 100, [stepSkills]);
    let three = 0;
    for (const beast of beasts) {
      const ticks = slot2Hits(of, beast).map((h) => h.tick - start);
      expect(ticks.length).toBeLessThanOrEqual(TWIN_PEARL.maxHits);
      for (let i = 1; i < ticks.length; i += 1) expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(TWIN_PEARL.rehitTicks);
      if (ticks.length === 3) three += 1;
    }
    expect(three).toBeGreaterThan(0);
    const entries = cast.book;
    expect(entries.length).toBe(beasts.length);
    for (const entry of entries) expect(entry.hits).toBeLessThanOrEqual(3);
    // Each side's own falloff by first contact: 100 %, 85 %, 70 %, 55 %, then the 40 % floor.
    for (const side of [0, 1]) expect(entries.filter((e) => e.side === side).map((e) => e.factorPm).slice(0, 6)).toEqual([1000, 850, 700, 550, 400, 400]);
    expect(cast.sideVictims[0]! + cast.sideVictims[1]!).toBe(cast.victims);
  });

  it("a crow takes the sky sweep only; the ground under it is not hit by the sky", () => {
    const { world, of } = twinWorld();
    const geo = twinPearlGeometry(world);
    const corner = geo.lanes[0].skyFrom;
    const crow = spawnBeast(world, "hoa-nha", "sky", { wave: 0, x: corner.x / 2, z: corner.z / 2 });
    expect(crow.y).toBe(mToU(4));
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    advance(world, 100, [stepSkills]);
    const hits = slot2Hits(of, crow).map((h) => h.tick - start);
    expect(hits).toHaveLength(1);
    expect(hits[0]!).toBeGreaterThanOrEqual(30);
    expect(hits[0]!).toBeLessThanOrEqual(50);
  });
});

describe("the Vương's cap per cast id", () => {
  it("he takes at most 1.5 W a cast; a new cast id gets a new cap", () => {
    const { world, of } = twinWorld();
    const boss = spawnBeast(world, "thiet-boi-lang-vuong", "A", { wave: 0, x: mToU(-2.4), z: mToU(-10.1) });
    expect(boss.boss).toBe(true);
    boss.hp = boss.hpMax = 100_000;
    const cap = wHpOf(world, TWIN_PEARL.bossCapW100);
    expect(resolveCast(world, castOf(world, 2, { quality: "flash" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    const first = slot2Hits(of, boss).reduce((sum, h) => sum + h.amount, 0);
    expect(first).toBe(cap);
    expect(resolveCast(world, castOf(world, 2, { quality: "flash" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    const both = slot2Hits(of, boss).reduce((sum, h) => sum + h.amount, 0);
    expect(both).toBe(2 * cap);
  });
});

describe("determinism (same seed, same result) and integer state", () => {
  function run(seed: number): { hash: string; hits: string; floats: string[] } {
    const header = { ...testHeader({ seed }), swordKey2: "twin-pearl" as const };
    const world = createWorld(THANH_THACH_AI, seed, header);
    world.phaseEndsAt = -1;
    const rng = world.rng.spawn;
    for (let k = 0; k < 36; k += 1) {
      const gate = k % 2 === 0 ? "A" : "B";
      const lane = twinPearlGeometry(world).lanes[k % 2]!;
      const at = rng.int(0, lane.sx.length - 1);
      spawnBeast(world, k % 3 === 0 ? "phong-lang" : "thach-thu", gate, { wave: -1, x: lane.sx[at]! + rng.int(-30_000, 30_000), z: lane.sz[at]! });
    }
    spawnBeast(world, "hoa-nha", "sky", { wave: -1 });
    const floats: string[] = [];
    const hits: string[] = [];
    for (let tick = 0; tick < 400; tick += 1) {
      if (tick === 30) emitCast(world, { seat: 0, slot: 2, actionId: tick, wordId: "w" + tick, tick: world.tick, channel: "typing", quality: "good", origin: { x: 0, z: mToU(3) }, aim: null, state: "held", heldUntil: -1, target: null, node: null });
      step(world, []);
      for (const e of world.events.drain()) if (e.type === "hit" && e.source === "slot2") hits.push(e.tick + ":" + e.beast.serial + ":" + e.amount);
      if (tick === 60) floats.push(...hashedFloats(world, HASH_SKIP));
      world.formation.heart = world.formation.heartMax;
    }
    return { hash: hashWorldHex(world), hits: hits.join(","), floats };
  }

  it("two runs of one seed match hit for hit and hash for hash; the cast's state holds integers only", () => {
    const a = run(11);
    const b = run(11);
    expect(a.hits.length).toBeGreaterThan(0);
    expect(b.hits).toBe(a.hits);
    expect(b.hash).toBe(a.hash);
    expect(a.floats).toEqual([]);
    expect(run(12).hits).not.toBe(a.hits);
  });
});

describe("each volume is checked by the hits it deals (review 04/11: a mutation of any of these fails a test)", () => {
  const hitsOf = (of: ReturnType<typeof makeWorld>["of"], beast: BeastState, start: number) => slot2Hits(of, beast).map((h) => [h.tick - start, h.amount]);

  it("F0 hold strike: a beast in front of the formation centre takes its touch on F0, then the full lotus", () => {
    const { world, of } = twinWorld();
    setTamNhan(world, false);
    const beast = addBeast(world, "thiet-giap-tru", { x: 0, z: -4, gate: "A" });
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2, { quality: "good" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    const p = wHpOf(world, 250);
    expect(hitsOf(of, beast, start)).toEqual([[0, mulDiv(p, 15, 100)], [51, mulDiv(p, 40, 100)]]);
  });

  it("lane B has its own touch box, head and petal: the mirror of lane A's beast takes the same three hits", () => {
    const { world, of } = twinWorld();
    const beast = addBeast(world, "thiet-giap-tru", { x: 2.4, z: -10.1, gate: "B" });
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    advance(world, 100, [stepSkills]);
    expect(slot2Hits(of, beast).map((h) => h.tick - start)).toEqual([1, 21, 51]);
  });

  it("the lotus deals half outside its petals and the hold zone (a lone beast 6 m north of the meeting point)", () => {
    const { world, of } = twinWorld();
    setTamNhan(world, false);
    const beast = addBeast(world, "thiet-giap-tru", { x: 0, z: -15.25, gate: "A" });
    const geo = twinPearlGeometry(world);
    expect(lotusRegion(geo, beast.x, beast.z)).toBe(1);
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2, { quality: "good" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    const p = wHpOf(world, 250);
    // Its touch box is round it (its lane's nearest beast); no head passes within 1.4 m; the lotus at half.
    expect(hitsOf(of, beast, start)).toEqual([[1, mulDiv(p, 15, 100)], [51, mulDiv(mulDiv(p, 40, 100), TWIN_PEARL.lotus.outsidePm, 1000)]]);
  });

  it("the sky sweep never hits the ground: a crow pulled down under the sweep takes nothing, one in the air takes it", () => {
    const { world, of } = twinWorld();
    const corner = twinPearlGeometry(world).lanes[0].skyFrom;
    const down = spawnBeast(world, "hoa-nha", "sky", { wave: 0, x: corner.x / 2, z: corner.z / 2 });
    down.y = 0;
    const up = spawnBeast(world, "hoa-nha", "sky", { wave: 0, x: corner.x / 2, z: corner.z / 2 + mToU(0.5) });
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    advance(world, 100, [stepSkills]);
    expect(slot2Hits(of, down)).toHaveLength(0);
    expect(slot2Hits(of, up)).toHaveLength(1);
  });

  it("each hit carries its share of today's Thế −20 (touch 3, corridor 9, lotus 8) on a beast with Thế", () => {
    const { world, of } = twinWorld();
    setTamNhan(world, false);
    const beast = addBeast(world, "lang-dau-dan", { x: -2.4, z: -10.1, gate: "A" });
    expect(beast.posture!.value).toBe(60);
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2, { quality: "good" }))).toBe(true);
    advance(world, 100, [stepSkills]);
    expect(slot2Hits(of, beast).map((h) => h.tick - start)).toEqual([1, 21, 51]);
    // After each hit: the split Thế, plus 1 for each whole W of typed damage so far (posture.ts, 1 W = 90 HP at K0):
    // 34 HP (none), 135 HP (1), 225 HP (2).
    const after = (t: number) => of("posture").filter((e) => e.tick === start + t && e.beast.slot === beast.slot).map((e) => e.value).pop();
    expect([after(1), after(21), after(51)]).toEqual([57, 47, 38]);
  });

  it("the whole cast is one area hit: a swarm cluster loses at most 60 % of its HP to it (today's line: one hit, 60 %)", () => {
    const { world } = twinWorld();
    const rats = addCluster(world, 6, -0.75, -4);
    const hp = rats.reduce((sum, r) => sum + r.hp, 0);
    expect(resolveCast(world, castOf(world, 2, { quality: "flash" }))).toBe(true);
    world.skills.twinPearl!.casts[0]!.pool.fill(10 ** 9);
    advance(world, 100, [stepSkills]);
    const left = rats.reduce((sum, r) => sum + (r.alive ? r.hp : 0), 0);
    expect(hp - left).toBe(Math.floor((hp * 60) / 100));
    expect(rats.filter((r) => r.alive).length).toBeGreaterThanOrEqual(2);
  });
});

describe("each dragon holds its side: its own falloff and budget, mirror-symmetric whatever the order", () => {
  /** A mirrored crowd: beasts on lane A's S samples and their mirror on lane B, plus a crow over each sky route. */
  function mirrored(eastFirst: boolean) {
    const made = twinWorld();
    const { world } = made;
    const lane = twinPearlGeometry(world).lanes[0];
    const corner = lane.skyFrom;
    const pairs: [BeastState, BeastState][] = [];
    for (let k = 2; k < lane.sx.length; k += 4) {
      const place = (side: number): BeastState =>
        spawnBeast(world, k % 8 === 2 ? "nham-vien" : "thiet-giap-tru", side === 0 ? "A" : "B", { wave: 0, x: side === 0 ? lane.sx[k]! : -lane.sx[k]!, z: lane.sz[k]! });
      const first = place(eastFirst ? 1 : 0);
      const second = place(eastFirst ? 0 : 1);
      pairs.push(eastFirst ? [second, first] : [first, second]);
    }
    const crows = [
      spawnBeast(world, "hoa-nha", "sky", { wave: 0, x: corner.x / 2, z: corner.z / 2 }),
      spawnBeast(world, "hoa-nha", "sky", { wave: 0, x: -corner.x / 2, z: corner.z / 2 }),
    ];
    pairs.push(eastFirst ? [crows[1]!, crows[0]!] : [crows[0]!, crows[1]!]);
    if (eastFirst) pairs.forEach((p) => p.reverse());
    const start = world.tick;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    const cast = world.skills.twinPearl!.casts[0]!;
    advance(world, 100, [stepSkills]);
    const dealt = (b: BeastState) => slot2Hits(made.of, b).map((h) => [h.tick - start, h.amount].join(":")).join(",");
    return { pairs, dealt, cast };
  }

  it("a mirrored crowd takes mirrored hits: the same ticks and amounts on both sides, an even split", () => {
    const { pairs, dealt, cast } = mirrored(false);
    let west = 0;
    let east = 0;
    for (const [w, e] of pairs) {
      expect(dealt(e)).toBe(dealt(w));
      west += cast.book.filter((v) => v.slot === w.slot).length;
      east += cast.book.filter((v) => v.slot === e.slot).length;
    }
    expect(west).toBe(east);
    expect(cast.sideVictims[0]).toBe(cast.sideVictims[1]);
    for (let part = 0; part < POOL_PARTS; part += 1) expect(cast.pool[part]).toBe(cast.pool[POOL_PARTS + part]);
  });

  it("spawning the east side first changes nothing on either side", () => {
    const a = mirrored(false);
    const b = mirrored(true);
    expect(b.pairs.map(([w, e]) => [b.dealt(w), b.dealt(e)])).toEqual(a.pairs.map(([w, e]) => [a.dealt(w), a.dealt(e)]));
    expect(b.cast.dealt).toBe(a.cast.dealt);
  });
});

describe("the cast's budget (content pool): per side and part, M_q and the bucket like every hit, spent first come", () => {
  it("each side gets 2.5 W split 15 / 45 / 40 and 0.8 W for its sky; a Chớp's M_q (1.25) grows it", () => {
    const { world } = twinWorld();
    setTamNhan(world, false);
    const good = twinPearlPool(world, 0, "good");
    const side = wHpOf(world, TWIN_PEARL.pool.sideW100);
    const one = [mulDiv(side, 15, 100), mulDiv(side, 45, 100), wHpOf(world, TWIN_PEARL.pool.skyW100), mulDiv(side, 40, 100)];
    expect(good).toEqual([...one, ...one]);
    expect([one[POOL_TOUCH], one[POOL_CORRIDOR], one[POOL_SKY], one[POOL_LOTUS]]).toEqual([34, 101, 72, 90]);
    const flash = twinPearlPool(world, 0, "flash");
    for (let i = 0; i < good.length; i += 1) expect(flash[i]).toBe(i % POOL_PARTS === POOL_SKY ? mulDiv(72, 1250, 1000) : mulDiv(mulDiv(side, 1250, 1000), [15, 45, 0, 40][i % POOL_PARTS]!, 100));
  });

  it("a crowd on lane A: no part deals past its budget, the spent corridor leaves later beasts unhit, the east keeps its whole budget", () => {
    const { world, of } = twinWorld();
    const lane = twinPearlGeometry(world).lanes[0];
    const beasts: BeastState[] = [];
    for (let k = 1; k < lane.sx.length; k += 2) beasts.push(spawnBeast(world, "thiet-giap-tru", "A", { wave: 0, x: lane.sx[k]!, z: lane.sz[k]! }));
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    const cast: TwinPearlCast = world.skills.twinPearl!.casts[0]!;
    advance(world, 100, [stepSkills]);
    for (let i = 0; i < cast.pool.length; i += 1) expect(cast.pool[i]!).toBeGreaterThanOrEqual(0);
    expect(cast.dealt).toBeLessThanOrEqual(cast.poolStart.reduce((sum, v) => sum + v, 0));
    expect(cast.dealt).toBe(of("hit").filter((h) => h.source === "slot2").reduce((sum, h) => sum + h.amount, 0));
    // The west corridor is spent within a few beasts from the meeting point; the rest of the lane takes no corridor hit.
    expect(cast.pool[POOL_CORRIDOR]).toBeLessThan(mulDiv(cast.baseHp, 45 * 400, 100 * 1000));
    const corridorHit = new Set(cast.book.filter((v) => v.kinds & 2).map((v) => v.slot));
    expect(corridorHit.size).toBeGreaterThan(0);
    expect(corridorHit.size).toBeLessThan(beasts.length);
    // Nothing on the east: its budget is untouched.
    for (let part = 0; part < POOL_PARTS; part += 1) expect(cast.pool[POOL_PARTS + part]).toBe(cast.poolStart[POOL_PARTS + part]);
  });
});

describe("the cast resolves only on a beast that can take damage (review 04/11)", () => {
  it("a roaring Vương alone holds the Cast; a beast beside him lets it resolve, and the roar keeps him out of the book", () => {
    const { world, of } = twinWorld();
    const boss = spawnBeast(world, "thiet-boi-lang-vuong", "A", { wave: 0, x: mToU(-2), z: mToU(-5) });
    boss.mode = "roar";
    boss.modeUntil = world.tick + 200;
    expect(resolveCast(world, castOf(world, 2))).toBe(false);
    const rat = addBeast(world, "thach-thu", { x: 2, z: -5, gate: "B" });
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    const cast = world.skills.twinPearl!.casts[0]!;
    advance(world, 10, [stepSkills]);
    // He stands in the hold zone: the F0 strike passed him by, so he holds no falloff place and no kind of hit.
    expect(cast.book.map((v) => v.slot)).not.toContain(boss.slot);
    expect(cast.book.map((v) => v.slot)).toContain(rat.slot);
    advance(world, 90, [stepSkills]);
    expect(slot2Hits(of, rat).length).toBeGreaterThan(0);
    expect(slot2Hits(of, boss)).toHaveLength(0);
    expect(world.skills.twinPearl!.casts).toHaveLength(0);
  });
});

describe("the replay header's rulesHash covers the trial table only when the header asks for it", () => {
  it("no variant: the hash is today's; twin-pearl: another, stable", () => {
    expect(matchRulesHash(THANH_THACH_AI, {})).toBe(matchRulesHash(THANH_THACH_AI));
    expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).not.toBe(matchRulesHash(THANH_THACH_AI));
    expect(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" })).toBe(matchRulesHash(THANH_THACH_AI, { swordKey2: "twin-pearl" }));
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
