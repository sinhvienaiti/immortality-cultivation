/**
 * A minimal World for Lane 3's sim tests: only the fields words.ts and cast.ts
 * read, built without Lane 2's createWorld (still a stub while the lanes run
 * side by side). Lane 4's resolveCast, addChanNguyen and Lane 5's postureHit
 * are mocked in each test file.
 */
import { createRng } from "../../src/kit/platform/rng";
import { quantizeOrigin } from "../../src/content/rules";
import type {
  BeastState, DeckWord, EventSink, Phase, Preset, ReplayHeader, RunStats, SeatProfile, SimCommand, SimEvent, StageDef, World, WorldInit,
} from "../../src/content/types";
import { createCastsState } from "../../src/sim/cast";
import { createWordsState } from "../../src/sim/words";

/** 40 base words (A1-like, assumed known; 13 first letters with ≥ 3 words, so A − 3 = 10) and 8 new words: a cold deck as buildDeck makes it. */
export const BASE_TEXTS = [
  "apple", "arm", "ant", "bird", "book", "bread", "cat", "chair", "cloud", "door", "dog", "drum", "fish", "frog", "farm", "goat", "gift", "glass", "hand", "house",
  "hill", "lamp", "leaf", "lion", "milk", "map", "moon", "pen", "pear", "park", "rock", "rain", "road", "sun", "star", "ship", "tree", "toy", "table", "egg",
];
export const NEW_TEXTS = ["lantern", "harbor", "meadow", "canyon", "garden", "tundra", "bridge", "spring"];

/** The M0a stage's wave clocks, seconds (canon §13.3). */
export const M0A_WAVE_SECONDS = [40, 45, 50, 55, 55, 60];

export function coldDeck(newCount = NEW_TEXTS.length): DeckWord[] {
  return [
    ...BASE_TEXTS.map((text) => ({ wordId: text, text, group: "known" as const, mastery: 0, recalls: 0, assumed: true })),
    ...NEW_TEXTS.slice(0, newCount).map((text) => ({ wordId: text, text, group: "new" as const, mastery: 0, recalls: 0, assumed: false })),
  ];
}

export interface Fixture {
  readonly world: World;
  readonly events: SimEvent[];
  /** Events of a type since the start. */
  of<T extends SimEvent["type"]>(type: T): Extract<SimEvent, { type: T }>[];
}

const blankStats = (): RunStats => ({
  keys: 0, wrongKeys: 0, strayKeys: 0, words: 0, grades: [0, 0, 0, 0, 0], castsHeld: 0, castsResolved: 0, castsFizzled: 0, kills: 0, maxLive: 0,
  maxLiveWords: 0, firstLetterJams: 0, fallbackJams: 0, baseWordUses: [0, 0, 0, 0, 0, 0, 0, 0], foeTicks: 0, hardControlTicks: 0, heartLost: 0, downs: 0,
  linhSaEarned: 0, linhSaSpent: 0,
});

export function makeWorld(options: { deck?: DeckWord[]; preset?: Preset; phase?: Phase; wave?: number; seed?: number; allowance?: number; profile?: SeatProfile } = {}): Fixture {
  const deck = options.deck ?? coldDeck();
  const preset = options.preset ?? "balanced";
  const seed = options.seed ?? 7;
  const profile = options.profile ?? { e: 35, a: 950, cv: 250 };
  const header: ReplayHeader = {
    v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed, stageId: "test", preset, pacing: true,
    seats: [{ seat: 0, profile, kPm: 1000 }], deck, newWordAllowance: options.allowance ?? 8, loadout: { guard: "ward", tamPhap: "kiem-tam" },
  };
  // Only what words.ts reads of the stage: the M0a wave clocks (canon §13.3) for the HC8 deadline.
  const stage = { id: "test", kind: "m0a", waves: M0A_WAVE_SECONDS.map((seconds, k) => ({ id: "w" + (k + 1), durationMs: seconds * 1000 })) } as unknown as StageDef;
  const rng = createRng(seed);
  const init: WorldInit = { stage, header, seed, preset, realm: 0, gPm: 1000, seats: 1, rng };
  const events: SimEvent[] = [];
  let drained = 0;
  const sink: EventSink = {
    push: (event) => void events.push(event),
    drain: () => {
      const batch = events.slice(drained);
      drained = events.length;
      return batch;
    },
    lastTick: () => events.filter((event) => event.tick === world.tick - 1),
    get length() {
      return events.length - drained;
    },
  };
  const world = {
    stage, header, field: { cols: 80, rows: 52, cellMm: 500, version: 0 }, seed, preset, realm: 0, gPm: 1000, liveCap: 60, newWordAllowance: header.newWordAllowance, rng,
    tick: 0, phase: options.phase ?? "wave", phaseEndsAt: -1,
    seats: [{ seat: 0, human: true, profile, kPm: 1000, loadout: { guard: "ward", tamPhap: "kiem-tam" }, chanNguyenPm: 0, downUntil: -1, softTarget: null, lastResolvedTick: -1 }],
    beasts: { list: [] as BeastState[], free: [], nextSerial: 1, live: 0, nextCluster: 0 },
    waves: { index: options.wave ?? 1, total: 6, startedAt: 0, groupsTotal: 0, groupsSpawned: 0, breaks: 0, breakHeld: false, lullStarted: false, bossStarted: false, liveByWave: [] },
    words: createWordsState(init),
    casts: createCastsState(init),
    // −1: Lane 4 set no cooldown yet, so words.ts falls back to rules.ts SLOTS (a test may set one).
    skills: { seats: [{ cooldownUntil: [-1, -1, -1, -1, -1, -1], bands: 0, kiemTamReadyAt: 0, tichKiemPm: 0 }], strikes: [], zones: [], nextId: 0 },
    formation: {
      heart: 1000, heartMax: 1000, duongHealed: 0, lastHeartHitTick: -1, pillars: [],
      nodes: [{ id: "tam-nhan", at: { x: 0, z: 0 }, on: true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 }],
    },
    telegraphs: { active: [], nextId: 0 },
    stats: blankStats(),
    wall: { lastKeyMs: [0] },
    events: sink,
  } as unknown as World;
  return { world, events, of: (type) => events.filter((event) => event.type === type) as never };
}

/** A live beast in the store (an elite or the boss for Ấn tests). */
export function addBeast(world: World, options: { boss?: boolean } = {}): BeastState {
  const slot = world.beasts.list.length;
  const beast = { slot, serial: world.beasts.nextSerial, alive: true, freed: false, boss: options.boss === true, seal: -1, x: 0, z: 0 } as unknown as BeastState;
  world.beasts.nextSerial += 1;
  world.beasts.list.push(beast);
  return beast;
}

const ORIGIN = quantizeOrigin({ x: 0, z: 0 });

export function key(world: World, letter: string, ms = world.tick * 16): Extract<SimCommand, { type: "key" }> {
  return { type: "key", seat: 0, letter: letter.charCodeAt(0) - 97, ms, origin: ORIGIN, aim: null };
}
