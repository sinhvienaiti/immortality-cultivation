// Source: games/dragon-hold/scripts/balance/meter.ts @06cd4e6 (adapted: canon §18.2's P, I, O on this game's field and Bàn Quyết, Q by the route share at death, the learning gates HC1, HC2, HC8 and CB6 read from events; no lanes, no load track)
/**
 * What a bot run measures, read from the world, the bot's own `local` layer
 * and each tick's events, never from inside a system (Lane 7):
 *
 * The kit FlowMeter (BALANCE.md §3) fed every fight tick (wave, lull, boss)
 * by canon §18.2:
 *  - P: a beast inside the Kết Giới (9 m), Trận Lực lost in the last 2 s, or
 *    a telegraphed attack charging (summon calls strike nothing: not counted);
 *  - I ("nhàn quyết định", D14, D46): (a) no live word outside ô 1 (ô 2–5
 *    cooling, Chân Nguyên not full, no Ấn, no Tẩy), (b) counted from the Trận
 *    Tâm: no beast within 12 m of the heart and none within ô 1's 12 m of the
 *    player, (c) not P;
 *  - O: live words at the match's cap (min(preset cap; A − 3)), or ≥ 3
 *    dropped locks (Esc) in 5 s;
 *  - S: Trận Lực left; N: near misses; Q: the median share of its route a
 *    beast had walked when it was killed.
 * Live words are the words a player can type now (ready or being typed);
 * held Casts are finished words and are counted apart.
 *
 * Also: B4's kill time, damage shares, the learning gates (HC1 by records,
 * HC2, HC8 meetings ≥ 45 s apart before wave 4), CB6 (one Cast per finished
 * word), beasts aiming at a real player (canon §10.1), Ấn, jams, base-word
 * uses, duration, pace steps. Script side: floats are fine here.
 * Owner: Lane 7.
 */
import { DIRECTOR, FIELD, FORMATION, LETTERS, NEW_WORDS, PRESETS, SLOTS } from "../../src/content/rules";
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import type { DeckWord, LocalState, SimEvent, SlotId, World } from "../../src/content/types";
import type { PaceSummary } from "../../src/kit/balance/director";
import { FlowMeter, type FlowOutcome, type FlowSummary } from "../../src/kit/balance/flow";
import { hardControlSharePm } from "../../src/sim/beasts";
import { heartDistance, routeU } from "../../src/sim/field";
import { mmToU, msToTicks, within } from "../../src/sim/fixed";
import { shares } from "../../src/sim/shares";
import { isTypeable } from "./policy";

const SEAT = 0;
const BARRIER_U = mmToU(FORMATION.barrierRadiusMm);
const IDLE_U = mmToU(DIRECTOR.idleRadiusMm);
const HEART_EDGE_U = mmToU(FIELD.heartEdgeMm);
const MEET_GAP_TICKS = msToTicks(NEW_WORDS.meetGapMs);

/** Telegraphs that strike something (summon calls do not: not an attack for P). */
const STRIKES: ReadonlySet<string> = new Set(
  Object.values(TELEGRAPHS)
    .filter((def) => def.strike.formation > 0 || def.strike.formationPm > 0 || def.strike.playerHp > 0 || def.strike.knockMm > 0)
    .map((def) => def.id),
);

export interface LearnCheck {
  /** HC1: a word with no record before the match and not a base word dealt to a folded slot, an Ấn or a Tẩy. */
  hc1Folded: number;
  /** HC1: a fresh new word first met in ô 4 after wave 2. */
  hc1LateSlot4: number;
  /** HC1 report: base-word uses by slot 1–5, Ấn, Tẩy (words.ts stats). */
  baseWordUses: number[];
  /** HC2: the most live words in a tick, ticks over the preset cap, tier-2 first letters seen. */
  hc2MaxLive: number;
  hc2Over: number;
  hc2Tier2: number;
  /** HC8: new words met this match, and those met ≥ 3 (2) times ≥ 45 s apart before wave 4. */
  hc8Words: number;
  hc8Met3: number;
  hc8Met2: number;
  hc8Short: string[];
  /** HC7 hard: a typed word's event says hintUsed false while the meaning showed. */
  hintHidden: number;
}

export interface RunMetrics {
  flow: FlowSummary;
  /** Fight ticks fed to the meter. */
  fightTicks: number;
  /** Seconds from a beast's spawn to its death (killed beasts), mean (B4). */
  killSeconds: number | null;
  killCount: number;
  /** Damage shares (canon §7.3), ‰. */
  shares: { typedPm: number; autoPm: number; supportPm: number; slot1OfTypedPm: number };
  /** Effective damage by source, HP. */
  damage: { slot1: number; slot2: number; slot4: number; slot5: number; seal: number; cleanse: number; auto: number; mechanism: number; consumable: number; formation: number };
  learn: LearnCheck;
  /** CB6: finished words, Casts (distinct actionIds), Casts whose word is not the finished word in order, duplicates dropped by cast.ts. */
  cb6: { completed: number; casts: number; mismatched: number; duplicates: number };
  /** canon §10.1: beast-ticks aiming at a real player. */
  targetsPlayer: number;
  /** Most held Casts at once; Ấn dealt and finished; Tẩy finished. */
  maxHeld: number;
  seals: { dealt: number; done: number };
  cleanses: number;
  /** words.ts stats. */
  jams: { firstLetter: number; fallback: number };
  /** Match length in ticks (no panel time: the bot answers panels in no tick) and each wave's length. */
  ticks: number;
  waveTicks: number[];
  bossTicks: number;
  /** The kit director's summary (B7). */
  pace: PaceSummary;
  hardControlPm: number;
  downs: number;
  playerHits: number;
  linhSa: { earned: number; spent: number; end: number };
  /** Grades flash, perfect, good, ok, sloppy; keys, wrong keys. */
  grades: number[];
  keys: { all: number; wrong: number; stray: number };
  casts: { held: number; resolved: number; fizzled: number };
}

export class RunMeter {
  readonly flow: FlowMeter;
  private readonly deckById = new Map<string, DeckWord>();
  private readonly spawnTick = new Map<number, number>();
  private killTicks = 0;
  private killCount = 0;
  private lastTyped = 0;
  private lastOther = 0;
  private lastHeart = -1;
  private hurtAt = -1;
  private fightTicks = 0;
  private wordsWave = 0;
  private waveStart = new Map<number, number>();
  private readonly waveTicks: number[] = [];
  private bossFrom = -1;
  private bossTicks = 0;
  private abandons = 0;
  private maxHeld = 0;
  private targetsPlayer = 0;
  private playerHits = 0;
  private readonly learn: LearnCheck = { hc1Folded: 0, hc1LateSlot4: 0, baseWordUses: [], hc2MaxLive: 0, hc2Over: 0, hc2Tier2: 0, hc8Words: 0, hc8Met3: 0, hc8Met2: 0, hc8Short: [], hintHidden: 0 };
  /** New word id → meetings (tick, words wave). */
  private readonly meetings = new Map<string, { tick: number; wave: number }[]>();
  /** Word store index → the hint shown when it was dealt. */
  private readonly hint = new Map<number, boolean>();
  private readonly casts = new Map<number, string>();
  private readonly completed: string[] = [];
  private sealsDealt = 0;
  private sealsDone = 0;
  private cleanses = 0;
  private readonly cap: number;

  constructor(world: World) {
    for (const word of world.header.deck) this.deckById.set(word.wordId, word);
    this.flow = new FlowMeter({
      bucketTicks: DIRECTOR.everyTicks,
      windowBuckets: Math.round(DIRECTOR.windowMs / ((DIRECTOR.everyTicks * 1000) / 60)),
      hurtTicks: msToTicks(DIRECTOR.hurtMs),
      abandonBurst: DIRECTOR.abandonBurst,
      abandonTicks: msToTicks(DIRECTOR.abandonWindowMs),
    });
    this.cap = LETTERS.liveCap[world.preset];
    this.lastHeart = world.formation.heart;
  }

  /** A dropped lock the bot made (Esc) this tick. */
  release(): void {
    this.abandons += 1;
  }

  /** After each world tick: that tick's events, then a sample of the world. */
  tick(world: World, local: LocalState, events: readonly SimEvent[]): void {
    const kills: number[] = [];
    for (const event of events) this.onEvent(world, event, kills);
    this.sample(world, local, kills);
  }

  private onEvent(world: World, event: SimEvent, kills: number[]): void {
    switch (event.type) {
      case "phase":
        if (event.phase === "warning") this.wordsWave = event.wave;
        if (event.phase === "boss") this.bossFrom = event.tick;
        break;
      case "wave-start":
        this.wordsWave = event.wave;
        this.waveStart.set(event.wave, event.tick);
        break;
      case "wave-end": {
        const start = this.waveStart.get(event.wave);
        if (start !== undefined) this.waveTicks[event.wave - 1] = event.tick - start;
        break;
      }
      case "spawn":
        this.spawnTick.set(event.beast.serial, event.tick);
        break;
      case "death": {
        const born = this.spawnTick.get(event.beast.serial);
        if (born !== undefined) {
          this.killTicks += event.tick - born;
          this.killCount += 1;
          this.spawnTick.delete(event.beast.serial);
        }
        const beast = world.beasts.list[event.beast.slot];
        if (beast && beast.serial === event.beast.serial) {
          const route = routeU(world, beast.gate);
          if (route > 0) {
            const left = heartDistance(world, beast) - HEART_EDGE_U;
            const walked = route - (left > 0 ? left : 0);
            kills.push(walked <= 0 ? 0 : walked >= route ? 1 : walked / route);
          }
        }
        break;
      }
      case "word-assigned": {
        if (event.seat !== SEAT) break;
        const deck = this.deckById.get(event.wordId);
        const fresh = deck !== undefined && deck.group === "new";
        if (fresh) {
          const folded = event.kind !== "slot" || SLOTS[event.slot as SlotId].folded;
          if (folded) this.learn.hc1Folded += 1;
          const list = this.meetings.get(event.wordId) ?? [];
          list.push({ tick: event.tick, wave: this.wordsWave });
          this.meetings.set(event.wordId, list);
        }
        if (event.kind === "seal") this.sealsDealt += 1;
        this.hint.set(event.word, world.words.live[event.word]?.hint === true);
        break;
      }
      case "word-first-seen":
        if (event.seat !== SEAT) break;
        if (event.channel === "slot4" && this.wordsWave > NEW_WORDS.slot4LastWave) this.learn.hc1LateSlot4 += 1;
        if (event.channel === "learn-ahead") {
          const list = this.meetings.get(event.wordId) ?? [];
          list.push({ tick: event.tick, wave: 0 });
          this.meetings.set(event.wordId, list);
        }
        break;
      case "word-complete":
        if (event.seat !== SEAT) break;
        this.completed.push(event.wordId);
        if (this.hint.get(event.word) === true && !event.hintUsed) this.learn.hintHidden += 1;
        break;
      case "cast":
        if (event.seat !== SEAT) break;
        if (!this.casts.has(event.actionId)) this.casts.set(event.actionId, event.wordId);
        if (event.slot === "cleanse" && event.state === "resolved") this.cleanses += 1;
        if (event.slot === "seal" && event.state === "resolved") this.sealsDone += 1;
        break;
      case "player-hit":
        this.playerHits += 1;
        break;
      default:
        break;
    }
  }

  private sample(world: World, local: LocalState, kills: number[]): void {
    const tick = world.tick;
    // Live words and held Casts (HC2), tier-2 first letters.
    let live = 0;
    let others = 0;
    let held = 0;
    for (const entry of world.words.live) {
      if (entry.seat !== SEAT) continue;
      if (isTypeable(entry)) {
        live += 1;
        if (!(entry.kind === "slot" && entry.slot === 1)) others += 1;
      } else if (entry.state === "held") held += 1;
    }
    if (live > this.learn.hc2MaxLive) this.learn.hc2MaxLive = live;
    if (live > this.cap) this.learn.hc2Over += 1;
    if (held > this.maxHeld) this.maxHeld = held;
    const session = world.words.sessions[SEAT];
    if (session) for (let slot = 0; slot < session.words.top; slot += 1) if (session.words.used[slot] && session.words.tier[slot] === 2) this.learn.hc2Tier2 += 1;
    // canon §10.1: never a real player.
    for (const beast of world.beasts.list) {
      if (!beast.alive || beast.target === null) continue;
      const target = beast.target;
      if ((target.kind === "bot" || target.kind === "taunt") && world.seats[target.seat]?.human === true) this.targetsPlayer += 1;
    }
    const heart = world.formation.heart;
    if (heart < this.lastHeart) this.hurtAt = tick;
    this.lastHeart = heart;
    const fight = world.phase === "wave" || world.phase === "lull" || world.phase === "boss";
    const ledger = world.shares;
    let typed = ledger.seal + ledger.cleanse;
    for (const amount of ledger.typedBySlot) typed += amount;
    const other = ledger.auto + ledger.mechanism + ledger.consumable + ledger.formation;
    if (!fight) {
      this.lastTyped = typed;
      this.lastOther = other;
      this.abandons = 0;
      return;
    }
    this.fightTicks += 1;
    let inBarrier = false;
    let near = false;
    for (const beast of world.beasts.list) {
      if (!beast.alive) continue;
      if (within(beast.x, beast.z, 0, 0, BARRIER_U)) inBarrier = true;
      if (within(beast.x, beast.z, 0, 0, IDLE_U) || within(beast.x, beast.z, local.x, local.z, IDLE_U)) near = true;
      if (inBarrier && near) break;
    }
    let telegraphed = false;
    for (const t of world.telegraphs.active) if (!t.cancelled && t.strikeTick >= tick && STRIKES.has(t.def)) telegraphed = true;
    const hurt = this.hurtAt >= 0 && tick - this.hurtAt < msToTicks(DIRECTOR.hurtMs);
    const danger = inBarrier || telegraphed;
    this.flow.feed({
      danger,
      hp: world.formation.heartMax > 0 ? heart / world.formation.heartMax : 0,
      // I: idle only with no live word outside ô 1, nothing near the heart or the player, and not P.
      live: others + (near ? 1 : 0) + (danger || hurt ? 1 : 0),
      capped: world.words.liveCap > 0 && live >= world.words.liveCap,
      backlog: 0,
      busy: false,
      kills,
      abandons: this.abandons,
      damage: { typed: typed - this.lastTyped, other: other - this.lastOther },
    });
    this.lastTyped = typed;
    this.lastOther = other;
    this.abandons = 0;
  }

  /** HC8 for one new word: meetings ≥ 45 s apart counted greedily, all before wave 4. */
  private meetCount(list: readonly { tick: number; wave: number }[]): number {
    let count = 0;
    let last = -Infinity;
    for (const meeting of list) {
      if (meeting.wave >= NEW_WORDS.meetBeforeWave) break;
      if (meeting.tick - last >= MEET_GAP_TICKS) {
        count += 1;
        last = meeting.tick;
      }
    }
    return count;
  }

  finish(world: World, local: LocalState, outcome: FlowOutcome): RunMetrics {
    if (this.bossFrom >= 0) this.bossTicks = world.tick - this.bossFrom;
    void local;
    for (const [wordId, list] of this.meetings) {
      this.learn.hc8Words += 1;
      const met = this.meetCount(list);
      if (met >= 3) this.learn.hc8Met3 += 1;
      if (met >= 2) this.learn.hc8Met2 += 1;
      if (met < 3) this.learn.hc8Short.push(wordId + ":" + met + "/" + list.length);
    }
    this.learn.baseWordUses = [...world.stats.baseWordUses];
    const order = [...this.casts.entries()].sort((a, b) => a[0] - b[0]).map(([, wordId]) => wordId);
    let mismatched = Math.abs(order.length - this.completed.length);
    for (let k = 0; k < Math.min(order.length, this.completed.length); k += 1) if (order[k] !== this.completed[k]) mismatched += 1;
    const summary = shares(world);
    const ledger = world.shares;
    const pace = world.director.kit.pace.summary();
    const wallet = world.economy.wallets[SEAT]!;
    return {
      flow: this.flow.summary(outcome),
      fightTicks: this.fightTicks,
      killSeconds: this.killCount > 0 ? this.killTicks / this.killCount / 60 : null,
      killCount: this.killCount,
      shares: summary,
      damage: {
        slot1: ledger.typedBySlot[1]!, slot2: ledger.typedBySlot[2]!, slot4: ledger.typedBySlot[4]!, slot5: ledger.typedBySlot[5]!, seal: ledger.seal, cleanse: ledger.cleanse,
        auto: ledger.auto, mechanism: ledger.mechanism, consumable: ledger.consumable, formation: ledger.formation,
      },
      learn: this.learn,
      cb6: { completed: this.completed.length, casts: order.length, mismatched, duplicates: world.casts.duplicates },
      targetsPlayer: this.targetsPlayer,
      maxHeld: this.maxHeld,
      seals: { dealt: this.sealsDealt, done: this.sealsDone },
      cleanses: this.cleanses,
      jams: { firstLetter: world.stats.firstLetterJams, fallback: world.stats.fallbackJams },
      ticks: world.tick,
      waveTicks: [...this.waveTicks],
      bossTicks: this.bossTicks,
      pace,
      hardControlPm: hardControlSharePm(world),
      downs: world.stats.downs,
      playerHits: this.playerHits,
      linhSa: { earned: world.stats.linhSaEarned, spent: world.stats.linhSaSpent, end: wallet.linhSa },
      grades: [...world.stats.grades],
      keys: { all: world.stats.keys, wrong: world.stats.wrongKeys, stray: world.stats.strayKeys },
      casts: { held: world.stats.castsHeld, resolved: world.stats.castsResolved, fizzled: world.stats.castsFizzled },
    };
  }
}

/** The preset's live-word cap of canon §13.4 (HC2: ≤ 8 Cân bằng, Thử thách; ≤ 5 Thư giãn, Học). */
export const presetCap = (preset: keyof typeof PRESETS): number => LETTERS.liveCap[preset];
