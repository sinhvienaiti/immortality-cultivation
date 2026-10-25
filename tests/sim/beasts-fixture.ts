/**
 * Lane 5's test world: only the fields the beast files read, plus fake
 * versions of the other lanes' modules they call (fixed, events, world,
 * field, spawn, pace, formation, wards, words), so the tests run on their own
 * while the lanes build side by side. Each test file mocks those modules with
 * the fakes below (`vi.mock(path, () => import("./beasts-fixture").then((f) => f.fakeX))`).
 * The fakes follow the contracts in LANES.md and Lane 2's integer helpers.
 */
import { BEASTS, GENERALS } from "../../src/content/data/beasts";
import { BOSSES } from "../../src/content/data/boss";
import type {
  BeastRef, BeastState, EliteTraitId, EventSink, GateId, NodeId, PillarState, PointU, Preset, SimCommand, SimEvent, SpeciesId, StageDef, WaveGroupDef, Ward, World,
} from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";

// ── Integer helpers (Lane 2's sim/fixed.ts semantics) ───────────────────────

const mulDiv = (a: number, b: number, c: number): number => Math.floor((2 * a * b + c) / (2 * c)) + 0;
function isqrt(n: number): number {
  if (n <= 0) return 0;
  let root = Math.floor(Math.sqrt(n));
  while (root * root > n) root -= 1;
  while ((root + 1) * (root + 1) <= n) root += 1;
  return root;
}
const dist2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const dist = (ax: number, az: number, bx: number, bz: number): number => isqrt(dist2(ax, az, bx, bz));
const within = (ax: number, az: number, bx: number, bz: number, radius: number): boolean => dist2(ax, az, bx, bz) <= radius * radius;
function stepTowards(x: number, z: number, tx: number, tz: number, step: number, out: { x: number; z: number }): number {
  const d = dist(x, z, tx, tz);
  if (d <= step || d === 0) {
    out.x = tx;
    out.z = tz;
    return 0;
  }
  out.x = x + mulDiv(tx - x, step, d);
  out.z = z + mulDiv(tz - z, step, d);
  return d - step;
}

export const fakeFixed = {
  TICK_HZ: 60,
  U_PER_M: 60_000,
  U_PER_MM: 60,
  mToU: (m: number) => Math.round(m * 60_000) + 0,
  uToM: (u: number) => u / 60_000,
  mmToU: (mm: number) => mm * 60,
  msToTicks: (ms: number) => mulDiv(ms, 60, 1000),
  ticksToMs: (ticks: number) => mulDiv(ticks, 1000, 60),
  clamp: (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value),
  mulDiv,
  pm: (value: number, permille: number) => mulDiv(value, permille, 1000),
  pct: (value: number, percent: number) => mulDiv(value, percent, 100),
  isqrt,
  dist2,
  dist,
  within,
  stepTowards,
};

export const U = (m: number): number => Math.round(m * 60_000);

// ── Events ──────────────────────────────────────────────────────────────────

/** Keeps every event (tests read them by type); a class so it fits EventSink with or without `endTick`. */
export class TestSink implements EventSink {
  readonly all: SimEvent[] = [];
  private drained = 0;
  private current: SimEvent[] = [];
  private last: SimEvent[] = [];
  push(event: SimEvent): void {
    this.all.push(event);
    this.current.push(event);
  }
  drain(): SimEvent[] {
    const out = this.all.slice(this.drained);
    this.drained = this.all.length;
    return out;
  }
  lastTick(): readonly SimEvent[] {
    return this.last;
  }
  endTick(): void {
    this.last = this.current;
    this.current = [];
  }
  get length(): number {
    return this.all.length - this.drained;
  }
}

export const fakeEvents = {
  EVENT_QUEUE_CAP: 20_000,
  EventQueue: TestSink,
  emit(world: { readonly tick: number; readonly events: EventSink }, body: object): void {
    world.events.push({ ...body, tick: world.tick } as SimEvent);
  },
};

// ── What the fakes did (reset per test) ─────────────────────────────────────

export const calls = {
  formation: [] as { amount: number; source: string }[],
  occupy: [] as { beast: number; node: NodeId }[],
  pillarHits: [] as string[],
  wardUses: [] as { seat: number; wardId: number }[],
  seals: [] as { seat: number; beast: number }[],
  releases: [] as { word: number; reason: string }[],
  spawns: [] as { species: SpeciesId; count: number; gate: GateId; wave: number; summoned: boolean }[],
};

export function resetCalls(): void {
  for (const list of Object.values(calls)) list.length = 0;
}

// ── World (allocBeast, beastAt) ─────────────────────────────────────────────

function allocBeast(world: World): BeastState {
  const store = world.beasts;
  const reuse = store.free.pop();
  const slot = reuse ?? store.list.length;
  const beast: BeastState = {
    slot, serial: store.nextSerial, alive: true, freed: false, species: "thach-thu", tier: "swarm", wave: 0, gate: "A", summoned: false, elite: null,
    general: false, boss: false, cluster: -1, x: 0, z: 0, y: 0, cell: -1, speedPm: 0, bornAt: world.tick, hp: 1, hpMax: 1, armour: 0, resist: 0,
    threatW100: 0, lastHitTick: -1, killedBy: null, killedBySeat: -1, mode: "walk", modeUntil: -1, target: null, attackAt: -1, telegraph: -1, posture: null,
    slows: [], hardUntil: -1, hardTicks: 0, seal: -1, howls: 0, howlReadyAt: 0,
  };
  store.nextSerial += 1;
  store.live += 1;
  if (reuse === undefined) store.list.push(beast);
  else store.list[slot] = beast;
  return beast;
}

function beastAt(world: World, ref: BeastRef): BeastState | null {
  const beast = world.beasts.list[ref.slot];
  return beast && beast.alive && beast.serial === ref.serial ? beast : null;
}

export const fakeWorld = { allocBeast, beastAt, HASH_SKIP: new Set<string>() };

// ── Field: a 0.5 m grid, ground beasts walk straight at the heart edge ──────

const EDGE = U(2);
const cellOf = (x: number, z: number): number => Math.floor((z + U(18)) / U(0.5)) * 80 + Math.floor((x + U(20)) / U(0.5));
const cellCentre = (cell: number): PointU => ({ x: -U(20) + (cell % 80) * U(0.5) + U(0.25), z: -U(18) + Math.floor(cell / 80) * U(0.5) + U(0.25) });

export const fakeField = {
  createField: () => ({ cols: 80, rows: 52, cellMm: 500, version: 1 }),
  rebuildField: () => undefined,
  fieldStep(_world: World, beast: BeastState, stepU: number = mulDiv(beast.speedPm, 1, 1000)): void {
    const d = dist(beast.x, beast.z, 0, 0);
    if (stepU > 0 && d > EDGE) {
      const out = { x: 0, z: 0 };
      stepTowards(beast.x, beast.z, 0, 0, Math.min(stepU, d - EDGE), out);
      beast.x = out.x;
      beast.z = out.z;
    }
    beast.cell = cellOf(beast.x, beast.z);
  },
  fieldDistance(_world: World, _gate: GateId, cell: number): number {
    const at = cellCentre(cell);
    return dist(at.x, at.z, 0, 0);
  },
};

// ── Spawn: whole groups at the gate point, never past the live cap ──────────

export const hooks = {
  initBeast: null as null | ((world: World, beast: BeastState, species: SpeciesId, elite: EliteTraitId | null) => void),
};

export function gatePoint(world: World, gate: GateId): PointU {
  if (gate === "sky") return { x: -U(20), z: -U(18) };
  const def = world.stage.field.gates.find((g) => g.id === gate)!;
  return { x: def.at.xMm * 60, z: def.at.zMm * 60 };
}

/** One beast at (x, z) (default: its gate), its species filled by Lane 5's initBeast. */
export function addBeast(world: World, species: SpeciesId, options: { x?: number; z?: number; gate?: GateId; wave?: number; elite?: EliteTraitId | null; summoned?: boolean } = {}): BeastState {
  const gate = options.gate ?? (species === "hoa-nha" ? "sky" : "A");
  const at = gatePoint(world, gate);
  const beast = allocBeast(world);
  beast.species = species;
  beast.wave = options.wave ?? world.waves.index;
  beast.gate = gate;
  beast.summoned = options.summoned === true;
  beast.elite = options.elite ?? null;
  beast.general = species in GENERALS;
  beast.boss = species in BOSSES;
  beast.x = options.x ?? at.x;
  beast.z = options.z ?? at.z;
  beast.cell = gate === "sky" ? -1 : cellOf(beast.x, beast.z);
  beast.bornAt = world.tick;
  if (hooks.initBeast === null) throw new Error("fixture: set hooks.initBeast to Lane 5's initBeast");
  hooks.initBeast(world, beast, species, beast.elite);
  return beast;
}

export const fakeSpawn = {
  liveCount: (world: World) => world.beasts.live,
  liveRoom: (world: World) => Math.max(0, world.liveCap - world.beasts.live),
  spawnGroup(world: World, group: WaveGroupDef, options: { readonly wave: number; readonly summoned: boolean }): BeastState[] {
    if (world.beasts.live + group.count > world.liveCap) return [];
    calls.spawns.push({ species: group.species, count: group.count, gate: group.gate, wave: options.wave, summoned: options.summoned });
    const out: BeastState[] = [];
    for (let k = 0; k < group.count; k += 1) out.push(addBeast(world, group.species, { gate: group.gate, wave: options.wave, summoned: options.summoned }));
    return out;
  },
};

// ── Pace ────────────────────────────────────────────────────────────────────

export const fakePace = {
  kForSeat: (world: World, seat: number) => world.seats[seat]?.kPm ?? 1000,
  worldKPm: (world: World) => world.seats[0]?.kPm ?? 1000,
  scaleTicks: (ticks: number, kPm: number) => Math.max(1, mulDiv(ticks, 1000, kPm)),
  paceFor: () => ({ kPm: 1000, eEffX1000: 35_000, wordTicks: 180 }),
};

// ── Formation (Lane 4): the heart, the Tâm nhãn, Trận Trụ ───────────────────

/** Distance from p to segment a–b ≤ r (integer test). */
function segmentNear(a: PointU, b: PointU, p: PointU, r: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return within(p.x, p.z, a.x, a.z, r);
  const t = (p.x - a.x) * dx + (p.z - a.z) * dz;
  if (t <= 0) return within(p.x, p.z, a.x, a.z, r);
  if (t >= len2) return within(p.x, p.z, b.x, b.z, r);
  const cross = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx);
  return cross <= r * isqrt(len2);
}

export const fakeFormation = {
  createFormationState: () => ({}),
  damageFormation(world: World, amount: number, source: string): number {
    calls.formation.push({ amount, source });
    world.formation.heart -= amount;
    return amount;
  },
  inBarrier: (x: number, z: number) => within(x, z, 0, 0, U(9)),
  nodeState: (world: World, node: NodeId) => world.formation.nodes.find((n) => n.id === node)!,
  occupyNode(world: World, beast: BeastState, node: NodeId): void {
    calls.occupy.push({ beast: beast.serial, node });
    const state = world.formation.nodes.find((n) => n.id === node)!;
    if (state.capturedBy === null || state.capturedBy.serial !== beast.serial) {
      state.capturedBy = { slot: beast.slot, serial: beast.serial };
      state.captureFrom = world.tick;
    } else if (world.tick - state.captureFrom >= 180) state.on = false;
  },
  pillarOnSegment(world: World, a: PointU, b: PointU): PillarState | null {
    return world.formation.pillars.find((pillar) => segmentNear(a, b, pillar.at, pillar.radiusU)) ?? null;
  },
  hitPillar(_world: World, pillar: PillarState): void {
    calls.pillarHits.push(pillar.id);
    pillar.rams += 1;
    if (pillar.rams >= 2) pillar.cracked = true;
  },
  applyDown: () => undefined,
  stepFormation: () => undefined,
};

// ── Wards (Lane 4) ──────────────────────────────────────────────────────────

function liveWard(world: World, seat: number): Ward | null {
  return world.wards.list.find((ward) => ward.seat === seat && ward.untilTick > world.tick && ward.charges > 0) ?? null;
}

export const fakeWards = {
  createWardsState: () => ({ list: [], nextId: 1 }),
  wardAt(world: World, seat: number) {
    const ward = liveWard(world, seat);
    return ward === null ? null : { wardId: ward.id, origin: ward.originU, radius: ward.radiusU, charges: ward.charges };
  },
  wardCrosses(world: World, seat: number, a: PointU, b: PointU): boolean {
    const ward = liveWard(world, seat);
    return ward !== null && segmentNear(a, b, ward.originU, ward.radiusU);
  },
  useWard(world: World, command: Extract<SimCommand, { type: "ward-use" }>): void {
    calls.wardUses.push({ seat: command.seat, wardId: command.wardId });
    const ward = world.wards.list.find((w) => w.id === command.wardId);
    if (ward) ward.charges = Math.max(0, ward.charges - 1);
  },
  /** canon §12.1: r 2 m, 5 s, 3 blocks (`untilTick` overrides the 5 s for long tests). */
  createWard(world: World, seat: number, origin: PointU, untilTick: number = world.tick + 300): Ward {
    const ward: Ward = { id: world.wards.nextId, seat, originU: origin, radiusU: U(2), untilTick, charges: 3 };
    world.wards.nextId += 1;
    world.wards.list.push(ward);
    return ward;
  },
  stepWards: () => undefined,
};

// ── Words (Lane 3): Ấn places, the live Bàn Quyết ───────────────────────────

let nextWord = 100;
export const fakeWords = {
  isBanQuyetLive: (world: World) => world.phase === "warning" || world.phase === "wave" || world.phase === "lull" || world.phase === "boss",
  dealSeal(world: World, seat: number, ref: BeastRef): number {
    const beast = beastAt(world, ref);
    if (beast === null) return -1;
    if (beast.seal >= 0) return beast.seal;
    const live = world.beasts.list.filter((b) => b.alive && b.seal >= 0).length;
    if (live >= 2) return -1;
    calls.seals.push({ seat, beast: beast.serial });
    beast.seal = nextWord;
    nextWord += 1;
    return beast.seal;
  },
  releaseWord(world: World, word: number, reason: string): void {
    calls.releases.push({ word, reason });
    for (const beast of world.beasts.list) if (beast.seal === word) beast.seal = -1;
  },
  dealSlotWord: () => undefined,
  dealCleanse: () => -1,
  onBeastGone: () => undefined,
  onSeatDown: () => undefined,
};

// ── The world ───────────────────────────────────────────────────────────────

export interface TestWorldOptions {
  preset?: Preset;
  realm?: number;
  gPm?: number;
  phase?: World["phase"];
  wave?: number;
  kPm?: number;
  seats?: number;
  /** The Tâm nhãn point (null: a stage without one). */
  node?: PointU | null;
  pillars?: { id: "west" | "east"; at: PointU; radiusU?: number; cracked?: boolean }[];
  boss?: boolean;
  liveCap?: number;
  summonMaxW100?: number;
  seed?: number;
}

export interface TestWorld {
  readonly world: World;
  readonly sink: TestSink;
  of<T extends SimEvent["type"]>(type: T): Extract<SimEvent, { type: T }>[];
}

/** The stage the beast files read: gates, sky entries, waves' summon caps, the boss. */
function stageOf(options: TestWorldOptions): StageDef {
  const waves = Array.from({ length: 6 }, (_, index) => ({ id: "w" + (index + 1), durationMs: 50_000, gates: ["A", "B"] as GateId[], peaks: [], groups: [], summonMaxW100: options.summonMaxW100 ?? 600 }));
  return {
    id: "test",
    name: "test",
    realm: options.realm ?? 0,
    kind: "m0a",
    liveCap: options.liveCap ?? 60,
    boss: options.boss === false ? null : "thiet-boi-lang-vuong",
    waves,
    field: {
      minXMm: -20_000, maxXMm: 20_000, minZMm: -18_000, maxZMm: 8000, barrierRadiusMm: 9000,
      gates: [
        { id: "A", at: { xMm: -15_000, zMm: -18_000 }, ground: true },
        { id: "B", at: { xMm: 15_000, zMm: -18_000 }, ground: true },
      ],
      skyEntries: [{ xMm: -20_000, zMm: -18_000 }, { xMm: 20_000, zMm: -18_000 }],
      pillars: [],
      mechSlots: [],
      nodes: [],
      blocked: [],
    },
  };
}

export function makeWorld(options: TestWorldOptions = {}): TestWorld {
  resetCalls();
  const sink = new TestSink();
  const seats = options.seats ?? 1;
  const node = options.node === undefined ? { x: U(2), z: U(1) } : options.node;
  const world = {
    stage: stageOf(options),
    header: {},
    field: fakeField.createField(),
    seed: options.seed ?? 1,
    preset: options.preset ?? "balanced",
    realm: options.realm ?? 0,
    gPm: options.gPm ?? 1000,
    liveCap: options.liveCap ?? 60,
    newWordAllowance: 0,
    rng: createRng(options.seed ?? 1),
    tick: 0,
    phase: options.phase ?? "wave",
    phaseEndsAt: -1,
    seats: Array.from({ length: seats }, (_, seat) => ({
      seat, human: seat === 0, profile: { e: 35, a: 950, cv: 250 }, kPm: options.kPm ?? 1000, loadout: { guard: "ward", tamPhap: "kiem-tam" },
      chanNguyenPm: 0, downUntil: -1, softTarget: null, lastResolvedTick: -1,
    })),
    beasts: { list: [] as BeastState[], free: [] as number[], nextSerial: 1, live: 0, nextCluster: 0 },
    waves: { index: options.wave ?? 1, total: 6, liveByWave: [0, 0, 0, 0, 0, 0, 0] },
    director: { enabled: true, hpPm: 1000, spawnPm: 1000 },
    wards: { list: [] as Ward[], nextId: 1 },
    formation: {
      heart: 1000,
      heartMax: 1000,
      duongHealed: 0,
      lastHeartHitTick: -1,
      nodes: node === null ? [] : [{ id: "tam-nhan" as NodeId, at: node, on: true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 }],
      pillars: (options.pillars ?? []).map((p) => ({ id: p.id, at: p.at, radiusU: p.radiusU ?? U(1), rams: p.cracked ? 2 : 0, cracked: p.cracked === true })),
    },
    telegraphs: { active: [], nextId: 1 },
    boss: { beast: null, phase: 0, roarUntil: -1, nextSummon: -1, nextCharge: -1, summonedW100: 0, defeated: false, summonTelegraph: -1, chargeTelegraph: -1, waveSummonWave: 0, waveSummonW100: 0 },
    stats: { hardControlTicks: 0, foeTicks: 0 },
    wall: { lastKeyMs: [0] },
    events: sink,
  } as unknown as World;
  return {
    world,
    sink,
    of: <T extends SimEvent["type"]>(type: T) => sink.all.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type),
  };
}

/** Runs `ticks` world ticks of the given steps, then tick + 1 (the world's order: beasts, attacks, boss, posture). */
export function run(world: World, ticks: number, steps: readonly ((world: World) => void)[]): void {
  for (let n = 0; n < ticks; n += 1) {
    for (const step of steps) step(world);
    (world.events as { endTick?: () => void }).endTick?.();
    world.tick += 1;
  }
}

export const speciesList = [...Object.keys(BEASTS), ...Object.keys(GENERALS)] as SpeciesId[];
