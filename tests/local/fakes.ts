/**
 * Stand-ins for the other lanes' sim modules, so Lane 2's world, waves, spawn,
 * director, field and local layer run end to end before those lanes land
 * (and keep testing Lane 2 alone after). Use in a test file with one line per
 * module, e.g.
 *   vi.mock("../../src/sim/words", async () => (await import("../local/fakes")).words());
 * Beasts follow canon §10.2 (W, speed, tier) and walk the real flow field; a
 * beast "is typed down" when it comes within `fake.killAtU` of the heart (the
 * boss after `fake.bossTicks`); nothing else fights. Counters in `fake` record
 * what the world asked of the other lanes. Not a test file (no .test.ts).
 */
import { BOSS, ELITES, PRESETS, beastHp } from "../../src/content/rules";
import type {
  BeastState,
  ConsumableDef,
  ConsumableId,
  EliteTraitId,
  LiveWord,
  PointU,
  ReplayHeader,
  SimCommand,
  SkillDef,
  SpeciesId,
  TamPhapDef,
  TamPhapId,
  TelegraphDef,
  World,
  WorldInit,
} from "../../src/content/types";
import { dist, mToU } from "../../src/sim/fixed";
import { fieldStep, heartDistance } from "../../src/sim/field";

/** canon §10.2, §10.4, §10.5 at K0 Cân bằng: W × 100, speed mm/s, tier. */
export const CANON_BEASTS: Readonly<Record<SpeciesId, { readonly w100: number; readonly speedMm: number; readonly tier: BeastState["tier"] }>> = {
  "thach-thu": { w100: 33, speedMm: 1600, tier: "swarm" },
  "phong-lang": { w100: 100, speedMm: 1400, tier: "small" },
  "hoa-nha": { w100: 80, speedMm: 2000, tier: "small" },
  "nham-vien": { w100: 200, speedMm: 1000, tier: "medium" },
  "thiet-giap-tru": { w100: 300, speedMm: 1000, tier: "medium" },
  "lang-dau-dan": { w100: 700, speedMm: 1400, tier: "general" },
  "thiet-boi-lang-vuong": { w100: BOSS.w100, speedMm: 1000, tier: "boss" },
};

/** canon §10.3: Cuồng +30 % speed, Thiết Bì +2 W. */
export const CANON_ELITES: Readonly<Record<EliteTraitId, { readonly speedPct: number; readonly extraW100: number }>> = {
  cuong: { speedPct: 30, extraW100: 0 },
  "thiet-bi": { speedPct: 0, extraW100: 200 },
  "hoi-nguyen": { speedPct: 0, extraW100: 0 },
};

/** Knobs and records shared by the fakes (reset by resetFake). */
export const fake = {
  /** A beast within this distance of the heart is typed down this tick (−1: never). */
  killAtU: mToU(12),
  /** The boss falls this many ticks after it walked in. */
  bossTicks: 60 * 120,
  /** Beasts at the heart edge bite Trận Lực (1 a second each). */
  bite: false,
  waveEnds: [] as number[],
  breakStarts: 0,
  downs: [] as number[],
  wardUses: [] as number[],
  autos: [] as SimCommand[],
  learning: [] as string[],
  initCalls: 0,
};

export function resetFake(): void {
  fake.killAtU = mToU(12);
  fake.bossTicks = 60 * 120;
  fake.bite = false;
  fake.waveEnds.length = 0;
  fake.breakStarts = 0;
  fake.downs.length = 0;
  fake.wardUses.length = 0;
  fake.autos.length = 0;
  fake.learning.length = 0;
  fake.initCalls = 0;
}

const noop = (): void => undefined;

export const words = () => ({
  createWordsState: (init: WorldInit) => ({
    live: [] as LiveWord[],
    free: [] as number[],
    seats: Array.from({ length: init.seats }, () => ({ locked: -1, slots: [-1, -1, -1, -1, -1, -1], seals: [] as number[], cleanse: -1 })),
    deckUse: init.header.deck.map(() => ({ meetings: 0, lastMeetTick: -1, scored: false, firstSeenTick: -1 })),
    newUsed: 0,
    letterRest: new Array<number>(26).fill(0),
    liveCap: PRESETS[init.preset].liveWords,
    bags: [] as number[][],
  }),
  stepWords: noop,
  typeKey: noop,
  typeBackspace: noop,
  releaseLock: noop,
  isBanQuyetLive: (world: World) => world.phase === "warning" || world.phase === "wave" || world.phase === "lull" || world.phase === "boss",
  dealSlotWord: noop,
  dealSeal: noop,
  dealCleanse: noop,
  releaseWord: noop,
  onBeastGone: noop,
  onSeatDown: noop,
  onLearnAhead: (_world: World, command: Extract<SimCommand, { type: "learn-ahead" }>) => {
    fake.learning.push("met:" + command.wordId);
  },
});

export const cast = () => ({
  createCastsState: (init: WorldInit) => ({ held: [], nextAction: new Array<number>(init.seats).fill(0), resolved: 0, fizzled: 0 }),
  nextActionId: () => 0,
  emitCast: noop,
  stepCasts: noop,
});

/** Beasts within `fake.killAtU` of the heart are typed down; the boss after `fake.bossTicks`. */
function typeDown(world: World): void {
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    const due = beast.boss ? world.tick - beast.bornAt >= fake.bossTicks : fake.killAtU >= 0 && heartDistance(world, beast) <= fake.killAtU;
    if (!due) continue;
    beast.alive = false;
    beast.hp = 0;
    beast.killedBy = "slot1";
    beast.killedBySeat = 0;
  }
}

export const skills = () => ({
  createSkillsState: (init: WorldInit) => ({
    seats: Array.from({ length: init.seats }, () => ({ cooldownUntil: [0, 0, 0, 0, 0, 0], bands: 0, kiemTamReadyAt: 0, tichKiemPm: 0 })),
    strikes: [],
    zones: [],
    nextId: 1,
  }),
  resolveCast: () => false,
  stepSkills: typeDown,
});

export const wards = () => ({
  createWardsState: () => ({ list: [], nextId: 1 }),
  createWard: (world: World, seat: number, origin: PointU) => {
    const ward = { id: world.wards.nextId++, seat, originU: origin, radiusU: mToU(2), untilTick: world.tick + 300, charges: 3 };
    world.wards.list.push(ward);
    return ward;
  },
  wardAt: () => null,
  wardCrosses: () => false,
  useWard: (world: World, command: Extract<SimCommand, { type: "ward-use" }>) => {
    fake.wardUses.push(command.wardId);
    const ward = world.wards.list.find((item) => item.id === command.wardId);
    if (ward && ward.charges > 0) ward.charges -= 1;
  },
  stepWards: noop,
});

export const formation = () => ({
  createFormationState: () => ({ heart: 1000, heartMax: 1000, nodes: [], pillars: [], duongHealed: 0, lastHeartHitTick: -1 }),
  damageFormation: (world: World, amount: number) => {
    world.formation.heart -= amount;
    world.formation.lastHeartHitTick = world.tick;
    return amount;
  },
  inBarrier: () => false,
  nodeState: () => {
    throw new Error("fake formation: nodeState");
  },
  occupyNode: noop,
  pillarOnSegment: () => null,
  hitPillar: noop,
  applyDown: (world: World, command: Extract<SimCommand, { type: "down" }>) => {
    fake.downs.push(command.seat);
    world.formation.heart -= Math.round((world.formation.heartMax * 5) / 100);
    world.formation.lastHeartHitTick = world.tick;
  },
  stepFormation: noop,
});

export const mechanisms = () => ({
  createMechanismsState: () => ({ slots: [0, 1, 2, 3, 4, 5].map((index) => ({ index, mech: null, level: 0, paid: 0, breakId: 0, nextFire: 0 })) }),
  stepMechanisms: noop,
});

export const economy = () => ({
  createEconomyState: (init: WorldInit) => ({
    wallets: Array.from({ length: init.seats }, () => ({ linhSa: 200, thuHach: 0 })),
    sumThreatW100: 0,
    fund: 1125,
    paidKills: 0,
    paidWaveEnds: 0,
    paidLearning: 0,
  }),
  earn: noop,
  spend: () => true,
  payWaveEnd: (_world: World, wave: number) => {
    fake.waveEnds.push(wave);
  },
  payLearning: (_world: World, _seat: number, kind: string) => {
    fake.learning.push(kind);
  },
  payKill: noop,
  onBeastKilled: noop,
  stepEconomy: noop,
});

export const shop = () => ({
  createShopState: () => ({ breakId: 0 }),
  buy: noop,
  place: noop,
  upgrade: noop,
  sell: noop,
  onBreakStart: (world: World) => {
    fake.breakStarts += 1;
    world.shop.breakId += 1;
  },
});

export const consumables = () => ({
  createConsumablesState: (init: WorldInit) => ({
    seats: Array.from({ length: init.seats }, () => ({ slots: [{ item: null, count: 0 }, { item: null, count: 0 }], cooldownUntil: 0 })),
  }),
  useConsumable: noop,
  stepConsumables: noop,
});

export const shares = () => ({
  createShareLedger: () => ({ typedBySlot: [0, 0, 0, 0, 0, 0], seal: 0, cleanse: 0, auto: 0, mechanism: 0, consumable: 0, formation: 0 }),
  bucketAdd: noop,
  shares: () => ({ typedPm: 0, autoPm: 0, supportPm: 0, slot1OfTypedPm: 0 }),
});

export const combat = () => ({
  damageBeast: () => 0,
  applyAuto: (_world: World, command: SimCommand) => {
    fake.autos.push(command);
  },
  stepAutoHits: noop,
  onBeastKilled: noop,
});

export const telegraph = () => ({
  createTelegraphsState: () => ({ active: [], nextId: 1 }),
  T: () => 0,
  chargeTicks: () => 0,
  telegraph: () => {
    throw new Error("fake telegraph: telegraph");
  },
  cancelTelegraph: noop,
  stepTelegraphs: noop,
});

export const boss = () => ({
  createBossState: () => ({ beast: null, phase: 0, roarUntil: -1, nextSummon: -1, nextCharge: -1, summonedW100: 0 }),
  stepBoss: noop,
});

export const beasts = () => ({
  initBeast: (world: World, beast: BeastState, species: SpeciesId, elite: EliteTraitId | null) => {
    fake.initCalls += 1;
    const def = CANON_BEASTS[species];
    const trait = elite ? CANON_ELITES[elite] : null;
    const smallTier = def.tier === "swarm" || def.tier === "small";
    const w100 = elite ? Math.round((def.w100 * ELITES.wPm) / 1000) + trait!.extraW100 : def.w100;
    beast.tier = def.tier;
    beast.hp = beastHp(w100, world.realm, smallTier ? 1000 : PRESETS[world.preset].hpPm);
    beast.hpMax = beast.hp;
    beast.threatW100 = w100;
    beast.speedPm = Math.round((def.speedMm * PRESETS[world.preset].speedPm * (100 + (trait?.speedPct ?? 0))) / 100);
  },
  stepBeasts: (world: World) => {
    for (const beast of world.beasts.list) if (beast.alive) fieldStep(world, beast);
  },
});

export const pressure = () => ({
  stepBeastAttacks: (world: World) => {
    if (!fake.bite || world.tick % 60 !== 0) return;
    for (const beast of world.beasts.list) {
      if (!beast.alive || dist(beast.x, beast.z, 0, 0) > mToU(2) + 1) continue;
      world.formation.heart -= 1;
      world.formation.lastHeartHitTick = world.tick;
    }
  },
});

export const posture = () => ({ postureHit: noop, isBroken: () => false, stepPosture: noop });

export const elites = () => ({ applyElite: noop, stepElites: noop });

export const targeting = () => ({
  chooseTarget: () => ({ kind: "heart" as const }),
  /** The live beast nearest the heart (field distance) within `rangeU` of `from`; ties to the smaller serial. */
  nearestToHeart: (world: World, from: PointU, rangeU: number) => {
    let best: BeastState | null = null;
    let bestD = 0;
    for (const beast of world.beasts.list) {
      if (!beast.alive || dist(beast.x, beast.z, from.x, from.z) > rangeU) continue;
      const d = heartDistance(world, beast);
      if (best === null || d < bestD || (d === bestD && beast.serial < best.serial)) {
        best = beast;
        bestD = d;
      }
    }
    return best;
  },
  densestPoint: () => null,
});

/** A replay header for tests (canon §23.2): the M0a stage, the Chuẩn profile at k 1, Cân bằng. */
export function testHeader(over: Partial<ReplayHeader> = {}): ReplayHeader {
  return {
    v: 1,
    gameId: "immortality-cultivation",
    rulesHash: "00000000",
    seed: 7,
    stageId: "m0a-thanh-thach-ai",
    preset: "balanced",
    pacing: true,
    seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000 }],
    deck: [],
    newWordAllowance: 0,
    loadout: { guard: "ward", tamPhap: "kiem-tam" },
    ...over,
  };
}

/** Data stand-ins (canon §10.6 shapes, §12.1 đánh nền, §12.3 đan phù). */
export const FAKE_TELEGRAPHS: Readonly<Record<string, TelegraphDef>> = {
  "test-ring": { id: "test-ring", shape: "circle", sizeMm: { reach: 2000, width: 4000 }, typedAnswer: false, answers: ["move", "ward"], chargeMs: 1600, strike: { formation: 0, formationPm: 0, playerHp: 40, knockMm: 0 } },
  "test-line": { id: "test-line", shape: "line", sizeMm: { reach: 20_000, width: 2000 }, typedAnswer: true, answers: ["seal", "move", "ward", "pillar"], chargeMs: "T", strike: { formation: 0, formationPm: 80, playerHp: 60, knockMm: 3000 } },
  "test-cone": { id: "test-cone", shape: "cone", sizeMm: { reach: 6000, width: 6000 }, typedAnswer: false, answers: ["move", "ward"], chargeMs: 2000, strike: { formation: 0, formationPm: 0, playerHp: 60, knockMm: 0 } },
  "test-cell": { id: "test-cell", shape: "cell", sizeMm: { reach: 3000, width: 3000 }, typedAnswer: false, answers: ["move", "ward"], chargeMs: 1500, strike: { formation: 0, formationPm: 0, playerHp: 30, knockMm: 0 } },
};

export const telegraphData = () => ({ TELEGRAPHS: FAKE_TELEGRAPHS });

export const consumableData = () => ({
  CONSUMABLE_DEFS: {
    "hoi-xuan-dan": { id: "hoi-xuan-dan", name: "Hồi Xuân Đan", price: 30, target: "self", effect: { kind: "heal", pct: 25, durationMs: 2000 } },
    "kim-than-phu": { id: "kim-than-phu", name: "Kim Thân Phù", price: 40, target: "self", effect: { kind: "shield", pct: 20, durationMs: 8000 } },
    "loi-hoa-phu": { id: "loi-hoa-phu", name: "Lôi Hỏa Phù", price: 50, target: "world", effect: { kind: "bomb", radiusMm: 3000, rangeMm: 14_000, w100: 160 } },
  } satisfies Record<ConsumableId, ConsumableDef>,
});

export const schoolData = () => ({
  SCHOOL_KIEM: [
    { id: "kiem-auto", school: "kiem", slot: "auto", name: "Phi Kiếm", cooldownMs: 1200, castStyle: "move", effect: { kind: "auto", everyMs: 1200, w100: 25, rangeMm: 10_000, hitTick: 18 } },
  ] satisfies SkillDef[],
  TAM_PHAP: {
    "kiem-tam": { id: "kiem-tam", name: "Kiếm Tâm", kind: "S" },
    "tich-kiem": { id: "tich-kiem", name: "Tích Kiếm", kind: "R" },
  } satisfies Record<TamPhapId, TamPhapDef>,
});
