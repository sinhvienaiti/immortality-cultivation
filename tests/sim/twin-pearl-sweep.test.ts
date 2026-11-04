// Independent §9 audit for ticket 271b; numerical oracles use the approved design.
import { performance } from "node:perf_hooks";
import { beforeAll, describe, expect, it } from "vitest";
import { TWIN_PEARL, TWIN_PEARL_END_TICK } from "../../src/content/data/twin-pearl";
import type { BeastState, Cast, Grade, PointU, SpeciesId, StageDef, World } from "../../src/content/types";
import { HASH_SKIP, hashedFloats, hashWorldHex } from "../../src/sim/hash";
import { createSkillsState, resolveCast, stepSkills } from "../../src/sim/skills";
import { spawnBeast } from "../../src/sim/spawn";
import { buildCastGeometry, headIndex, liveSamples, pickDiscs, volumesAt, type TwinPearlCast } from "../../src/sim/twin-pearl";
import { addBeast, addCluster, advance, at, castOf, makeWorld, setTamNhan, THANH_THACH_AI } from "./combat-fixture";

const M = 60_000;
const ARENA: StageDef = {
  ...THANH_THACH_AI, id: "test-arena",
  field: { ...THANH_THACH_AI.field, minXMm: -20_000, maxXMm: 20_000, minZMm: -20_000, maxZMm: 20_000, mechSlots: [], pillars: [] },
};

// Copied setup only; never import the implementation author's test file.
function twinWorld(options: Parameters<typeof makeWorld>[0] = {}) {
  const made = makeWorld(options);
  (made.world as { header: World["header"] }).header = { ...made.world.header, swordKey2: "twin-pearl" };
  (made.world as { skills: World["skills"] }).skills = createSkillsState({ ...made.world, seats: made.world.seats.length });
  return made;
}

function castNow(world: World, options: Partial<Cast> = {}): TwinPearlCast {
  expect(resolveCast(world, castOf(world, 2, { origin: at(0, 3), ...options }))).toBe(true);
  return world.skills.twinPearl!.casts.at(-1)!;
}

type Point = { x: number; z: number };
type Spec = Point & { y: number; species: SpeciesId; hp: number; cluster: number };
type SampleBeast = Point & { y: number; slot: number; serial: number };

// BigInt rounding makes the reference independent of sim/fixed.ts.
function rounded(n: number, d: number): number {
  const a = BigInt(n), b = BigInt(d);
  return Number((2n * a + b) / (2n * b));
}
const symmetric = (n: number, d: number): number => n < 0 ? -rounded(-n, d) + 0 : rounded(n, d);
const squared = (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
function root(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while ((r + 1) ** 2 <= n) r += 1;
  while (r ** 2 > n) r -= 1;
  return r;
}
const near = (a: Point, b: Point, radius: number): boolean => squared(a, b) <= radius ** 2;
const ground = (y: number): boolean => y >= 0 && y <= 1.5 * M;
const sky = (y: number): boolean => y >= 2.5 * M && y <= 6 * M;
const H: Point = { x: 0, z: 0 };
const C = at(0, 3);
const lastPassed = (passes: number[], t: number): number => passes.reduce((last, pass, i) => pass <= Math.min(t, 48) ? i : last, -1);

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, len = root(squared(a, b));
  if (len === 0) return squared(p, a);
  const along = Math.max(0, Math.min(len, Math.floor(((p.x - a.x) * dx + (p.z - a.z) * dz) / len)));
  return squared(p, { x: a.x + symmetric(dx * along, len), z: a.z + symmetric(dz * along, len) });
}

function referenceVolumes(cast: TwinPearlCast, p: Point & { y: number }, t: number): number {
  let bits = 0;
  const heart = { x: cast.hx, z: cast.hz }, pearl = { x: cast.px, z: cast.pz };
  if (ground(p.y) && t === 0 && near(p, heart, 4.5 * M)) bits |= 1;
  if (t >= 1 && t <= 2 && cast.disc.some((d) => d.on === 1 && (d.sky === 1 ? sky(p.y) : ground(p.y)) && near(p, d, 2.2 * M))) bits |= 2;
  let body = false, air = false;
  let petal = false;
  for (const d of cast.dragons) {
    for (let i = 0; i < d.pass.length; i += 1) {
      const q = { x: d.sx[i]!, z: d.sz[i]! };
      if (d.pass[i]! <= t && t <= d.pass[i]! + 54) {
        if (near(p, q, 1.4 * M)) body = true;
        if (near(p, q, 3 * M)) air = true;
      }
    }
    if (t >= 30 && t <= 56) {
      const head = lastPassed(d.pass, t);
      if (head >= 0) for (let i = 0; i < d.sky.length; i += 2) {
        if (segmentDistance(p, { x: d.sx[head]!, z: d.sz[head]! }, { x: d.sky[i]!, z: d.sky[i + 1]! }) <= (3 * M) ** 2) air = true;
      }
    }
    if (t >= 57 && t <= 77) for (let i = Math.max(0, d.petalFrom - 1); i + 1 < d.sx.length; i += 1) {
      if (segmentDistance(p, { x: d.sx[i]!, z: d.sz[i]! }, { x: d.sx[i + 1]!, z: d.sz[i + 1]! }) <= (2.2 * M) ** 2) petal = true;
    }
  }
  if (ground(p.y) && body) bits |= 4;
  if (sky(p.y) && t >= 30 && t <= 56 && air) bits |= 8;
  if (ground(p.y) && t >= 57 && t <= 77) {
    if (near(p, pearl, 4 * M) || near(p, heart, 4.5 * M) || petal) bits |= 16;
    else if (near(p, pearl, 9 * M)) bits |= 32;
  }
  return bits;
}

function referenceNodes(beasts: SampleBeast[], side: Map<number, number>, which: number, pearl: Point, origin: Point): number[] {
  const available = beasts.filter((b) => ground(b.y) && side.get(b.serial) === which);
  const selected: SampleBeast[] = [];
  while (selected.length < 3) {
    const score = (b: SampleBeast): number => selected.length === 0 ? squared(b, H) : Math.min(...[origin, pearl, ...selected].map((p) => squared(b, p)));
    const ranked = available.filter((b) => !selected.includes(b)).sort((a, b) => score(b) - score(a) || a.serial - b.serial);
    if (ranked.length === 0 || (selected.length > 0 && score(ranked[0]!) < (3 * M) ** 2)) break;
    selected.push(ranked[0]!);
  }
  const permutations = (xs: SampleBeast[]): SampleBeast[][] => xs.length === 0 ? [[]] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map((tail) => [x, ...tail]));
  const length = (xs: Point[]): number => xs.slice(1).reduce((sum, p, i) => sum + root(squared(xs[i]!, p)), 0);
  let route: Point[];
  if (selected.length === 0) route = [origin, { x: (which === 0 ? -9 : 9) * M, z: 0 }, pearl];
  else {
    const orders = permutations(selected);
    orders.sort((a, b) => length([origin, ...a, pearl]) - length([origin, ...b, pearl]));
    route = [origin, ...orders[0]!, pearl];
  }
  return route.filter((p, i) => i === 0 || squared(p, route[i - 1]!) !== 0).flatMap((p) => [p.x, p.z]);
}

const INVARIANTS = ["split", "pearl", "anchors", "samples", "frozen", "volumes", "frames", "rehits", "falloff", "budgets", "caps", "order", "integers", "firstHit"] as const;
type Invariant = typeof INVARIANTS[number];
type Issue = { seed: number; tick: number; detail: string; actual: unknown; expected: unknown };
class Audit {
  readonly issues = new Map<Invariant, Issue[]>();
  readonly counts = new Map<Invariant, number>();
  check(group: Invariant, ok: boolean, seed: number, tick: number, detail: string, actual: unknown, expected: unknown): void {
    if (ok) return;
    this.counts.set(group, (this.counts.get(group) ?? 0) + 1);
    const list = this.issues.get(group) ?? [];
    if (list.length < 8) list.push({ seed, tick, detail, actual, expected });
    this.issues.set(group, list);
  }
  equal(group: Invariant, actual: unknown, expected: unknown, seed: number, tick: number, detail: string): void {
    this.check(group, JSON.stringify(actual) === JSON.stringify(expected), seed, tick, detail, actual, expected);
  }
}

function specsFor(seed: number): Spec[] {
  let state = seed >>> 0;
  const int = (lo: number, hi: number): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return lo + Math.floor(((value ^ (value >>> 14)) >>> 0) / 4294967296 * (hi - lo + 1));
  };
  const heights = [0, 1.5 * M, 1.5 * M + 1, 2.5 * M - 1, 2.5 * M, 4 * M, 6 * M, 6 * M + 1];
  const count = int(10, 60), usedX = new Set<number>();
  return Array.from({ length: count }, (_, i): Spec => {
    let x = int(-20 * M, 20 * M);
    while (usedX.has(x)) x = int(-20 * M, 20 * M);
    usedX.add(x);
    const z = int(-20 * M, 20 * M), y = heights[int(0, heights.length - 1)]!;
    const cluster = i % 5 === 1 || i % 5 === 2 ? 0 : -1;
    const species: SpeciesId = i === 0 ? "thiet-boi-lang-vuong" : cluster === 0 ? "thach-thu" : sky(y) ? "hoa-nha" : "phong-lang";
    return { x, z, y, species, cluster, hp: cluster === 0 ? int(1, 120) : int(500, 1500) };
  });
}

function geometryStamp(cast: TwinPearlCast): string {
  return JSON.stringify([cast.hx, cast.hz, cast.fx, cast.fz, cast.rx, cast.rz, cast.cut2, cast.px, cast.pz, cast.sideSlot, cast.sideSerial, cast.snapshot, cast.dragons]);
}

function auditGeometry(audit: Audit, seed: number, cast: TwinPearlCast, beasts: BeastState[], origin: Point): void {
  const ordered = beasts.slice().sort((a, b) => a.x - b.x || b.z - a.z || a.serial - b.serial);
  const side = new Map(ordered.map((b, i) => [b.serial, i < Math.ceil(beasts.length / 2) ? 0 : 1]));
  audit.equal("split", [cast.fx, cast.fz, cast.rx, cast.rz], [0, -1000, 1000, 0], seed, 0, "F and R at C=(0,3)");
  audit.equal("split", cast.snapshot, beasts.flatMap((b) => [b.slot, b.serial]), seed, 0, "F0 references in list order");
  for (const b of beasts) audit.equal("split", [cast.sideSlot[b.slot], cast.sideSerial[b.slot]], [side.get(b.serial)! + 1, b.serial], seed, 0, `side of serial ${b.serial}`);
  const cut = ordered[Math.ceil(ordered.length / 2) - 1]!.x + ordered[Math.ceil(ordered.length / 2)]!.x;
  audit.equal("split", cast.cut2, cut, seed, 0, "cut2 is the sum at the median");
  const basis = beasts.filter((b) => ground(b.y));
  const centroid = basis.length === 0 ? beasts : basis;
  let px = symmetric(symmetric(centroid.reduce((n, b) => n + b.x, 0), centroid.length) * 600, 1000);
  let pz = symmetric(symmetric(centroid.reduce((n, b) => n + b.z, 0), centroid.length) * 600, 1000);
  const len = root(px ** 2 + pz ** 2);
  if (len > 12 * M) { px = symmetric(px * 12 * M, len); pz = symmetric(pz * 12 * M, len); }
  px = Math.max(-18 * M, Math.min(18 * M, px)); pz = Math.max(-18 * M, Math.min(18 * M, pz));
  audit.equal("pearl", [cast.px, cast.pz], [px, pz], seed, 0, "ground centroid, symmetric rounding, 12 m cap and 2 m inset");
  for (const which of [0, 1]) {
    const d = cast.dragons[which]!;
    audit.equal("anchors", d.nodes, referenceNodes(beasts, side, which, { x: px, z: pz }, origin), seed, 0, `farthest-point anchors and first shortest permutation, side ${which}`);
    audit.equal("split", d.sky, beasts.filter((b) => sky(b.y) && side.get(b.serial) === which).flatMap((b) => [b.x, b.z]), seed, 0, `sky anchors, side ${which}`);
    let segments = 0;
    for (let i = 2; i < d.nodes.length; i += 2) segments += Math.max(1, Math.ceil(root(squared({ x: d.nodes[i - 2]!, z: d.nodes[i - 1]! }, { x: d.nodes[i]!, z: d.nodes[i + 1]! })) / (32 * M)));
    audit.check("samples", d.sx.length <= 257 + segments, seed, 0, `sample bound, side ${which}`, d.sx.length, `<= ${257 + segments}`);
    audit.equal("samples", [d.sz.length, d.arc.length, d.pass.length], [d.sx.length, d.sx.length, d.sx.length], seed, 0, "parallel sample arrays");
    audit.equal("samples", [d.sx[0], d.sz[0], d.sx.at(-1), d.sz.at(-1)], [origin.x, origin.z, px, pz], seed, 0, "C and P are the route endpoints");
    let arc = 0;
    for (let i = 0; i < d.sx.length; i += 1) {
      if (i > 0) arc += root(squared({ x: d.sx[i - 1]!, z: d.sz[i - 1]! }, { x: d.sx[i]!, z: d.sz[i]! }));
      audit.equal("samples", d.arc[i], arc, seed, 0, `clamped arc side ${which}, sample ${i}`);
      audit.equal("samples", d.pass[i], 3 + (d.arc.at(-1) === 0 ? 0 : rounded(d.arc[i]! * 45, d.arc.at(-1)!)), seed, 0, `pass side ${which}, sample ${i}`);
      audit.check("samples", Math.abs(d.sx[i]!) <= 20 * M && Math.abs(d.sz[i]!) <= 20 * M, seed, 0, "sample inside the field", [d.sx[i], d.sz[i]], "[-1200000,1200000]");
    }
    audit.equal("samples", d.petalFrom, d.arc.findIndex((v) => d.arc.at(-1)! - v <= 13 * M), seed, 0, "first sample of the final 13 m");
  }
}

type HitRow = [serial: number, tick: number, kind: number, amount: number];
type Run = { cast: TwinPearlCast; hits: HitRow[]; hashes: string[]; ticks: number; positive: number; count: number };
const GRADES: Grade[] = ["good", "ok", "flash", "perfect", "sloppy"];

function runLayout(seed: number, specs: Spec[], audit?: Audit, transform: (p: Point) => Point = (p) => p, origin: PointU = C, swapGates = false): Run {
  const made = twinWorld({ stage: ARENA, seed, realm: seed % 4 });
  const { world, sink } = made;
  world.tick = 37 + seed;
  setTamNhan(world, seed % 2 === 0);
  const beasts = specs.map((s) => {
    const p = transform(s);
    const b = spawnBeast(world, s.species, sky(s.y) ? "sky" : swapGates ? "B" : "A", { wave: 0, x: p.x, z: p.z, cluster: s.cluster });
    b.y = s.y; b.hp = b.hpMax = s.hp;
    return b;
  });
  const cast = castNow(world, { origin, actionId: 271_000 + seed, quality: GRADES[seed % GRADES.length]! });
  if (audit) auditGeometry(audit, seed, cast, beasts, origin);
  const immutable = geometryStamp(cast), poolStart = cast.poolStart.slice();
  const masks = new Map<number, number>(), previousBook = new Map<number, { hits: number; last: number }>();
  const spent = new Array<number>(8).fill(0), byCluster = new Map<number, number>();
  const clusterCaps = new Map<number, number>();
  for (const b of beasts) if (b.cluster >= 0) clusterCaps.set(b.cluster, (clusterCaps.get(b.cluster) ?? 0) + b.hp);
  for (const [id, hp] of clusterCaps) clusterCaps.set(id, Math.floor(hp * 60 / 100));
  let bossDamage = 0, cursor = sink.all.length;
  const hits: HitRow[] = [], hashes: string[] = [];
  if (audit) {
    const mq: Record<Grade, number> = { good: 1000, ok: 900, flash: 1250, perfect: 1100, sloppy: 600 };
    const scale = (w: number): number => {
      const base = rounded(w * 90 * world.gPm, 100_000);
      const grade = rounded(base * mq[cast.grade], 1000);
      return seed % 2 === 0 ? rounded(grade * 1080, 1000) : grade;
    };
    const one = [rounded(scale(200) * 15, 100), rounded(scale(200) * 45, 100), scale(80), rounded(scale(200) * 40, 100)];
    audit.equal("budgets", poolStart, [...one, ...one], seed, -1, "2.0 W ground 15/45/40 plus 0.8 W sky, grade and bucket");
    audit.equal("caps", cast.bossCap, rounded(150 * 90 * world.gPm, 100_000), seed, -1, "1.5 W boss cap");
  }
  for (let t = 0; t <= 110; t += 1) {
    const before = beasts.map((b) => ({ x: b.x, z: b.z, y: b.y, hp: b.hp, alive: b.alive, immune: b.mode === "roar" && b.modeUntil > world.tick }));
    advance(world, 1, [stepSkills]);
    const emitted = sink.all.slice(cursor).filter((e) => e.type === "hit" && e.source === "slot2");
    cursor = sink.all.length;
    const tickOrder: number[][] = [];
    for (const event of emitted) {
      if (event.type !== "hit") continue;
      const b = beasts[event.beast.slot]!, entry = cast.book.find((v) => v.serial === event.beast.serial)!;
      const kind = entry.kinds ^ (masks.get(entry.serial) ?? 0);
      const p = before[b.slot]!;
      hits.push([b.serial, t, kind, event.amount]);
      tickOrder.push([kind, squared(p, H), b.serial]);
      if (kind === 1 || kind === 2 || kind === 4) {
        const part = kind === 1 ? 0 : kind === 4 ? 3 : sky(p.y) ? 2 : 1;
        spent[entry.side * 4 + part]! += event.amount;
      }
      if (b.cluster >= 0) byCluster.set(b.cluster, (byCluster.get(b.cluster) ?? 0) + event.amount);
      if (b.boss) bossDamage += event.amount;
      if (audit) {
        const bits = referenceVolumes(cast, p, t);
        const eligible = kind === 1 ? (bits & 3) !== 0 && ground(p.y) : kind === 2 ? ground(p.y) ? (bits & 4) !== 0 : sky(p.y) && (bits & 10) !== 0 : kind === 4 && (bits & 48) !== 0;
        audit.check("volumes", eligible, seed, t, `positive hit must occupy its independent volume, serial ${b.serial}`, { kind, bits, p }, "matching volume and band");
        audit.check("frames", kind === 1 ? t >= 0 && t <= 2 : kind === 4 ? t >= 57 && t <= 77 : kind === 2 && (ground(p.y) ? t >= 3 && t <= 102 : (t >= 1 && t <= 2) || (t >= 30 && t <= 56)), seed, t, `hit window, serial ${b.serial}`, { kind, y: p.y }, "touch F0–2; ground corridor F3–102; sky F1–2/F30–56; lotus F57–77");
        audit.check("caps", p.alive && !p.immune && event.amount > 0 && event.amount <= p.hp, seed, t, "only a live damageable recipient loses effective HP", { p, amount: event.amount }, "0 < amount <= prior HP");
      }
    }
    if (audit) {
      audit.equal("order", tickOrder, tickOrder.slice().sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!), seed, t, "one global (kind, straight-line dist2, serial) order");
      audit.equal("frozen", geometryStamp(cast), immutable, seed, t, "F0 geometry and snapshot stay fixed");
      audit.equal("frozen", cast.poolStart, poolStart, seed, t, "initial budget stays fixed");
      audit.equal("integers", hashedFloats(cast), [], seed, t, "every cast number is a safe integer");
      audit.equal("integers", hashedFloats(world, HASH_SKIP), [], seed, t, "every hashed world number is a safe integer");
      for (const array of [cast.sideSlot, cast.sideSerial, cast.bookAt]) audit.check("integers", Array.from({ length: array.length }, (_, i) => i in array).every(Boolean), seed, t, "dense reference arrays", array, "no holes");
      for (let i = 0; i < 8; i += 1) {
        audit.check("budgets", cast.pool[i]! >= 0 && cast.pool[i]! <= poolStart[i]!, seed, t, `side ${Math.floor(i / 4)}, part ${i % 4}`, cast.pool[i], `[0,${poolStart[i]}]`);
        audit.equal("budgets", poolStart[i]! - cast.pool[i]!, spent[i], seed, t, `effective HP debited only to side ${Math.floor(i / 4)}, part ${i % 4}`);
      }
      audit.equal("budgets", cast.dealt, hits.reduce((sum, h) => sum + h[3], 0), seed, t, "cast total equals emitted effective HP");
      audit.equal("caps", bossDamage, cast.bossDealt, seed, t, "boss ledger equals effective HP");
      audit.check("caps", bossDamage <= cast.bossCap, seed, t, "boss cap after every tick", bossDamage, `<= ${cast.bossCap}`);
      for (const [id, cap] of clusterCaps) {
        const dealt = byCluster.get(id) ?? 0, pos = cast.area.clusters.indexOf(id);
        audit.check("caps", dealt <= cap, seed, t, `one 60% area cap across both sides and all kinds, cluster ${id}`, dealt, `<= ${cap}`);
        if (pos >= 0) audit.equal("caps", cast.area.left[pos], cap - dealt, seed, t, `remaining cluster cap ${id}`);
      }
      audit.equal("rehits", new Set(cast.book.map((v) => v.serial)).size, cast.book.length, seed, t, "one entry per victim reference");
      for (const entry of cast.book) {
        const old = previousBook.get(entry.serial), popcount = [1, 2, 4].filter((bit) => (entry.kinds & bit) !== 0).length;
        audit.check("rehits", entry.hits <= 3 && entry.hits === popcount, seed, t, `at most three hits, one of each kind, serial ${entry.serial}`, [entry.hits, entry.kinds], "hits <= 3 and hits = popcount(kinds)");
        if (old && old.hits !== entry.hits) audit.check("rehits", entry.hits === old.hits + 1 && entry.last - old.last >= 20, seed, t, `rehit spacing, serial ${entry.serial}`, [entry.hits - old.hits, entry.last - old.last], "one hit, gap >= 20 ticks");
      }
      const sideCounts = [0, 0];
      for (const entry of cast.book) {
        const n = sideCounts[entry.side]!++;
        audit.equal("falloff", entry.factorPm, Math.max(400, 1000 - 150 * n), seed, t, `independent side falloff, serial ${entry.serial}`);
        audit.equal("split", cast.sideSlot[entry.slot], entry.side + 1, seed, t, `frozen victim side, serial ${entry.serial}`);
      }
      audit.equal("falloff", [cast.sideVictims, cast.victims], [sideCounts, cast.book.length], seed, t, "distinct-victim counters per side");
      audit.equal("frames", world.skills.twinPearl!.casts.length, t < 102 ? 1 : 0, seed, t, "cast removed only after processing F102");
      for (const b of beasts) {
        const lost = before[b.slot]!.hp - b.hp;
        audit.equal("budgets", lost, emitted.reduce((sum, e) => sum + (e.type === "hit" && e.beast.serial === b.serial ? e.amount : 0), 0), seed, t, `HP conservation, serial ${b.serial}`);
        const bits = volumesAt(cast, b.x, b.y, b.z, t);
        audit.equal("volumes", bits, referenceVolumes(cast, b, t), seed, t, `independent geometry at current position, serial ${b.serial}`);
      }
    }
    for (const entry of cast.book) {
      masks.set(entry.serial, entry.kinds);
      previousBook.set(entry.serial, { hits: entry.hits, last: entry.last });
    }
    hashes.push(hashWorldHex(world));
  }
  if (audit) audit.check("firstHit", hits.length > 0 && hits[0]![1] <= 1, seed, hits[0]?.[1] ?? -1, "first positive hit on a nonempty damageable layout", hits[0], "F0 or F1");
  return { cast, hits, hashes, ticks: 111, positive: hits.length, count: beasts.length };
}

describe("271b: independent numerical sweep (§9.2–9.6, §9.12 D)", () => {
  const audit = new Audit(), runs = new Map<number, Run>();
  let elapsedMs = 0;
  beforeAll(() => {
    const start = performance.now();
    for (let seed = 1; seed <= 200; seed += 1) runs.set(seed, runLayout(seed, specsFor(seed), audit));
    elapsedMs = performance.now() - start;
    console.info(`271b sweep: 200 seeds; ${[...runs.values()].reduce((n, r) => n + r.count, 0)} beasts; 20600 ticks F0–F102 + 1600 expiry ticks; ${elapsedMs.toFixed(1)} ms; violations ${JSON.stringify(Object.fromEntries(audit.counts))}`);
  }, 120_000);

  it("executes all 200 layouts through F102 and beyond, with non-vacuous hits of all three kinds", () => {
    expect(runs.size).toBe(200);
    expect([...runs.values()].every((r) => r.ticks === 111 && r.count >= 10 && r.count <= 60)).toBe(true);
    expect(new Set([...runs.values()].flatMap((r) => r.hits.map((h) => h[2])))).toEqual(new Set([1, 2, 4]));
    expect(elapsedMs).toBeGreaterThan(0);
  });
  for (const invariant of INVARIANTS) it(`every tick: ${invariant}`, () => {
    expect(audit.issues.get(invariant) ?? [], `${audit.counts.get(invariant) ?? 0} violations (first eight shown)`).toEqual([]);
  });

  it("replays five spread-out random seeds with identical full-world hashes at every tick", () => {
    for (const seed of [1, 37, 80, 149, 200]) {
      const repeat = runLayout(seed, specsFor(seed));
      expect(repeat.hashes, `seed ${seed}`).toEqual(runs.get(seed)!.hashes);
      expect(repeat.hits, `seed ${seed}`).toEqual(runs.get(seed)!.hits);
    }
  });

  it("mirrors 20 random even snapshots with unique lateral coordinates at exact integer tolerance", () => {
    const seeds = [...runs.keys()].filter((seed) => specsFor(seed).length % 2 === 0).slice(0, 20);
    expect(seeds).toHaveLength(20);
    for (const seed of seeds) {
      const a = runs.get(seed)!, b = runLayout(seed, specsFor(seed), undefined, (p) => ({ x: -p.x + 0, z: p.z }));
      expect(b.hits, `mirror seed ${seed}`).toEqual(a.hits);
      expect([b.cast.px, b.cast.pz]).toEqual([-a.cast.px + 0, a.cast.pz]);
      expect(b.cast.sideSlot).toEqual(a.cast.sideSlot.map((side) => 3 - side));
      for (const side of [0, 1]) {
        const p = a.cast.dragons[side]!, q = b.cast.dragons[1 - side]!;
        expect(q.nodes, `mirror nodes seed ${seed}, side ${side}`).toEqual(p.nodes.map((v, i) => i % 2 === 0 ? -v + 0 : v));
        expect(q.sx).toEqual(p.sx.map((x) => -x + 0)); expect(q.sz).toEqual(p.sz);
        expect(q.arc).toEqual(p.arc); expect(q.pass).toEqual(p.pass);
      }
    }
  });

  it("rotates 20 random snapshots and the caster by 90 degrees with identical hits and paths", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = runs.get(seed)!, b = runLayout(seed, specsFor(seed), undefined, (p) => ({ x: -p.z + 0, z: p.x }), at(-3, 0));
      expect(b.hits, `rotation seed ${seed}`).toEqual(a.hits);
      expect([b.cast.px, b.cast.pz]).toEqual([-a.cast.pz + 0, a.cast.px]);
      expect(b.cast.sideSlot).toEqual(a.cast.sideSlot);
      for (const side of [0, 1]) {
        const p = a.cast.dragons[side]!, q = b.cast.dragons[side]!;
        expect(q.nodes).toEqual(p.nodes.map((_, i) => i % 2 === 0 ? -p.nodes[i + 1]! + 0 : p.nodes[i - 1]!));
        expect(q.sx).toEqual(p.sz.map((z) => -z + 0)); expect(q.sz).toEqual(p.sx);
        expect(q.arc).toEqual(p.arc); expect(q.pass).toEqual(p.pass);
      }
    }
  });

  it("ignores ground gate labels in five random layouts", () => {
    for (const seed of [1, 37, 80, 149, 200]) {
      const changed = runLayout(seed, specsFor(seed), undefined, undefined, C, true), original = runs.get(seed)!;
      expect(changed.hits).toEqual(original.hits);
      expect(changed.cast.dragons).toEqual(original.cast.dragons);
    }
  });
});

describe("271b: exact phase and boundary probes", () => {
  it("pins the design's frame table rather than deriving expectations from the implementation table", () => {
    expect([TWIN_PEARL.hold.tick, TWIN_PEARL.touch.fromTick, TWIN_PEARL.touch.toTick, TWIN_PEARL.heads.fromTick, TWIN_PEARL.heads.toTick, TWIN_PEARL.sky.fromTick, TWIN_PEARL.sky.toTick, TWIN_PEARL.roar.fromTick, TWIN_PEARL.roar.toTick, TWIN_PEARL.lotus.fromTick, TWIN_PEARL.lotus.toTick, TWIN_PEARL_END_TICK]).toEqual([0, 1, 2, 3, 48, 30, 56, 49, 56, 57, 77, 102]);
    expect([TWIN_PEARL.pearl.fromTick, TWIN_PEARL.pearl.arriveTick, TWIN_PEARL.trailTicks]).toEqual([3, 48, 54]);
  });

  it("orders equal-distance recipients by serial even when their slots have a different order", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const points = [[3, 0], [0, 1], [-1, 0], [0, -3]];
    for (const [i, p] of points.entries()) {
      const b = addBeast(world, "phong-lang", { x: p[0], z: p[1] });
      b.serial = [30, 10, 40, 20][i]!; b.hp = b.hpMax = 1;
    }
    castNow(world);
    advance(world, 1, [stepSkills]);
    expect(of("hit").filter((h) => h.source === "slot2").map((h) => h.beast.serial)).toEqual([10, 40, 20, 30]);
  });

  it("checks each milestone and adjacent ticks, including every sample's inclusive trail endpoints", () => {
    const { world } = twinWorld({ stage: ARENA });
    addBeast(world, "phong-lang", { x: -12, z: -16 });
    addBeast(world, "hoa-nha", { x: 16, z: -14, gate: "sky" });
    const cast = castNow(world);
    advance(world, 2, [stepSkills]);
    const probes = [H, { x: cast.px, z: cast.pz }, ...cast.disc.filter((d) => d.on), ...cast.dragons.flatMap((d) => d.sx.map((x, i) => ({ x, z: d.sz[i]! })))];
    const heights = [0, 1.5 * M, 1.5 * M + 1, 2 * M, 2.5 * M - 1, 2.5 * M, 6 * M, 6 * M + 1];
    for (const t of [-1, 0, 1, 2, 3, 29, 30, 48, 49, 56, 57, 77, 78, 101, 102, 103, 300]) {
      for (const p of probes) for (const y of heights) expect(volumesAt(cast, p.x, y, p.z, t), `F${t}, (${p.x},${y},${p.z})`).toBe(referenceVolumes(cast, { ...p, y }, t));
      for (const d of cast.dragons) {
        const live = d.pass.flatMap((pass, i) => pass <= t && t <= pass + 54 ? [i] : []);
        const span = { first: 0, last: -1 }; liveSamples(d, t, span);
        expect(span.last < span.first ? [] : Array.from({ length: span.last - span.first + 1 }, (_, i) => span.first + i)).toEqual(live);
        expect(headIndex(d, t)).toBe(lastPassed(d.pass, t));
      }
    }
  });

  it("sorts lateral ties by longitudinal coordinate then serial, including odd populations", () => {
    const { world } = twinWorld({ stage: ARENA });
    const beasts = [[0, 8], [0, -2], [0, -2], [0, 2], [0, -8]].map(([x, z]) => addBeast(world, "phong-lang", { x, z }));
    const g = buildCastGeometry(world, castOf(world, 2, { origin: C }));
    // u=-z: positive z sorts first; serial breaks the tie across the median.
    expect(beasts.map((b) => g.sideSlot[b.slot])).toEqual([1, 1, 2, 1, 2]);
    expect(g.cut2).toBe(0);
  });

  it("uses field-centre and final north fallbacks when caster equals H, including non-centred bounds", () => {
    const square = twinWorld({ stage: ARENA }).world;
    expect(buildCastGeometry(square, castOf(square, 2, { origin: H }))).toMatchObject({ fx: 0, fz: -1000, rx: 1000, rz: 0, px: 0, pz: -9 * M });
    const shifted = twinWorld({ stage: { ...ARENA, field: { ...ARENA.field, minXMm: -10_000, maxXMm: 30_000 } } }).world;
    expect(buildCastGeometry(shifted, castOf(shifted, 2, { origin: H }))).toMatchObject({ fx: 1000, fz: 0, rx: 0, rz: 1000, px: 9 * M, pz: 0 });
  });

  it("takes the pearl centroid from sky snapshots only when no ground beast exists", () => {
    const { world } = twinWorld({ stage: ARENA });
    const a = addBeast(world, "hoa-nha", { x: -9, z: -12, gate: "sky" });
    const b = addBeast(world, "hoa-nha", { x: 3, z: -8, gate: "sky" });
    let g = buildCastGeometry(world, castOf(world, 2, { origin: C }));
    expect([g.px, g.pz]).toEqual([-1.8 * M, -6 * M]);
    const wolf = addBeast(world, "phong-lang", { x: 10, z: 5 });
    g = buildCastGeometry(world, castOf(world, 2, { origin: C }));
    expect([g.px, g.pz]).toEqual([6 * M, 3 * M]);
    a.alive = b.alive = wolf.alive = false;
    expect(resolveCast(world, castOf(world, 2, { origin: C }))).toBe(false);
  });
});

describe("271b: live recipients and F1 selection", () => {
  it("refuses empty, dead-only and roar-only worlds without changing state or cooldown", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const dead = addBeast(world, "phong-lang", { x: 0, z: 0 }); dead.alive = false; dead.hp = 0;
    const boss = addBeast(world, "thiet-boi-lang-vuong", { x: 1, z: 0 }); boss.mode = "roar"; boss.modeUntil = world.tick + 200;
    const before = hashWorldHex(world);
    expect(resolveCast(world, castOf(world, 2, { origin: C }))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    advance(world, 103, [stepSkills]);
    expect(of("hit")).toEqual([]);
  });

  // Claude confirmed §9.2: hold until a living nonimmune beast is in a damage band (271c).
  it("A1: holds outside both damage bands, then resolves when a ground recipient arrives", () => {
    const { world, of } = twinWorld({ stage: ARENA, seed: 3 });
    const a = addBeast(world, "phong-lang", { x: -8, z: -8 }); a.y = 2.5 * M - 1;
    const b = addBeast(world, "hoa-nha", { x: 8, z: -8, gate: "sky" }); b.y = 1.5 * M + 1;
    const cast = castOf(world, 2, { origin: C });
    const cooldown = world.skills.seats[0]!.cooldownUntil[2];
    const before = hashWorldHex(world);
    expect(resolveCast(world, cast)).toBe(false);
    expect(world.skills.twinPearl!.casts).toHaveLength(0);
    expect(world.skills.seats[0]!.cooldownUntil[2]).toBe(cooldown);
    expect(hashWorldHex(world)).toBe(before);
    advance(world, 103, [stepSkills]);
    expect(of("hit").filter((h) => h.source === "slot2")).toEqual([]);
    const ground = addBeast(world, "phong-lang", { x: 0, z: 0 });
    expect(resolveCast(world, cast)).toBe(true);
    expect(world.skills.twinPearl!.casts).toHaveLength(1);
    const resolved = world.skills.twinPearl!.casts[0]!;
    expect(resolved.castId).toBe(cast.actionId);
    advance(world, 2, [stepSkills]);
    expect(of("hit").some((h) => h.source === "slot2" && h.beast.serial === ground.serial && h.amount > 0 && [0, 1].includes(h.tick - resolved.startTick))).toBe(true);
  });

  it("reaches actual moving sky recipients at F30 at the design's 2.73 m/s speed", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    addBeast(world, "phong-lang", { x: -5, z: -5 });
    addBeast(world, "phong-lang", { x: 5, z: -5 });
    const birds = [-18, 18].map((x) => addBeast(world, "hoa-nha", { x, z: -18, gate: "sky" }));
    const cast = castNow(world), stamp = JSON.stringify(cast.dragons);
    for (let t = 0; t <= 56; t += 1) {
      for (const b of birds) b.z = -18 * M + 2730 * t;
      advance(world, 1, [stepSkills]);
      expect(JSON.stringify(cast.dragons)).toBe(stamp);
    }
    for (const bird of birds) expect(of("hit").filter((h) => h.source === "slot2" && h.beast.serial === bird.serial).map((h) => h.tick - cast.startTick)).toEqual([30]);
  });

  it("aims F1 at the current F1 position, freezes its disc at F2, and checks actual recipient positions", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const west = addBeast(world, "phong-lang", { x: -10, z: -10 });
    const east = addBeast(world, "phong-lang", { x: 10, z: -10 });
    // A 1 HP first target leaves real touch budget for the F2 newcomer.
    west.hp = west.hpMax = 1; east.hp = east.hpMax = 10_000;
    const cast = castNow(world), stamp = JSON.stringify(cast.dragons);
    advance(world, 1, [stepSkills]);
    west.x = -8 * M; west.z = -6 * M;
    east.x = 8 * M; east.z = -6 * M;
    advance(world, 1, [stepSkills]);
    expect(cast.disc.map(({ on, x, z }) => [on, x, z])).toEqual([[1, -8 * M, -6 * M], [1, 8 * M, -6 * M]]);
    const discs = JSON.stringify(cast.disc);
    expect(cast.pool[0]).toBeGreaterThan(0);
    west.x = -18 * M; west.z = 18 * M;
    const late = addBeast(world, "phong-lang", { x: -8, z: -6 });
    advance(world, 1, [stepSkills]);
    expect(of("hit").filter((e) => e.source === "slot2" && e.beast.serial === late.serial).map((e) => e.tick - cast.startTick)).toEqual([2]);
    expect(JSON.stringify(cast.disc)).toBe(discs);
    expect(JSON.stringify(cast.dragons)).toBe(stamp);
    expect(cast.snapshot.filter((_, i) => i % 2 === 1)).not.toContain(late.serial);
  });

  it("can deliver an actual final trail hit at F102 and cannot hit a new recipient at F103", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const initial = addBeast(world, "phong-lang", { x: -12, z: -14 });
    const cast = castNow(world);
    initial.alive = false; initial.hp = 0;
    advance(world, 102, [stepSkills]);
    const target = spawnBeast(world, "phong-lang", "A", { wave: 0, x: cast.px, z: cast.pz });
    advance(world, 1, [stepSkills]);
    expect(of("hit").filter((h) => h.source === "slot2" && h.beast.serial === target.serial).map((h) => h.tick - cast.startTick)).toEqual([102]);
    const late = spawnBeast(world, "phong-lang", "A", { wave: 0, x: cast.px, z: cast.pz });
    advance(world, 1, [stepSkills]);
    expect(of("hit").filter((h) => h.source === "slot2" && h.beast.serial === late.serial)).toEqual([]);
    expect(world.skills.twinPearl!.casts).toEqual([]);
  });

  it("does not use a snapshot position for a target that leaves the ground band before F1", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const b = addBeast(world, "phong-lang", { x: -8, z: -8 });
    const cast = castNow(world);
    advance(world, 1, [stepSkills]); b.y = 2 * M;
    advance(world, 102, [stepSkills]);
    expect(cast.disc[0].on).toBe(0);
    expect(of("hit").filter((h) => h.source === "slot2")).toEqual([]);
    expect(cast.pool).toEqual(cast.poolStart);
  });

  it("checks roar immunity at each live tick even after a damageable F0 snapshot", () => {
    const { world, of } = twinWorld({ stage: ARENA });
    const b = addBeast(world, "thiet-boi-lang-vuong", { x: -10, z: -10 });
    const cast = castNow(world);
    b.mode = "roar"; b.modeUntil = world.tick + 200;
    advance(world, 111, [stepSkills]);
    expect(of("hit").filter((h) => h.source === "slot2")).toEqual([]);
    expect(cast.book).toEqual([]); expect(cast.pool).toEqual(cast.poolStart);
  });

  it("skips an exhausted boss and a zero-cap cluster when choosing the next F1 recipient", () => {
    const { world } = twinWorld({ stage: ARENA });
    const rat = addCluster(world, 1, -1, -6)[0]!; rat.hp = rat.hpMax = 1;
    addBeast(world, "thiet-boi-lang-vuong", { x: -1, z: -5 });
    const next = addBeast(world, "phong-lang", { x: -1, z: -8 });
    for (let i = 0; i < 3; i += 1) addBeast(world, "phong-lang", { x: 10 + i, z: -12 });
    const cast = castNow(world);
    cast.bossDealt = cast.bossCap;
    advance(world, 1, [stepSkills]);
    // Isolate target selection; an overlapping disc hit may legitimately reserve a cluster.
    pickDiscs(world, cast);
    expect(cast.disc[0]).toEqual({ on: 1, x: next.x, z: next.z, sky: 0 });
    expect(cast.area.clusters).toEqual([]);
  });
});
