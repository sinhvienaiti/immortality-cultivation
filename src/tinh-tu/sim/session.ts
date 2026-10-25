/**
 * Tĩnh Tu session sim (canon §16, D40, PB-12, PB-13): pure and deterministic
 * (same rules as src/sim: no clock, DOM or Math.random), one step per 60 Hz
 * tick. A 60 s session; paper slips drift onto 3 (Nhập Môn) or 4 (Tham Ngộ)
 * fixed reading points, 2–3 or 3–4 live at once. Minh (the lesson's 6 new
 * words) show ≥ 2 times each, the first time with their meaning; Thường (due
 * words) and Tâm ma (known words of far groups, never to be typed) fill in.
 * Lives L / 1.5 L / 2 L with L = 1.0 + 1.6 × typing time at the profile's
 * E_eff (kit typeSeconds) + 1.0 s. The scheduler never lets two Minh expire
 * within 1.5 s of each other (HC5; it spaces expiries by 1.5 s + the 1.2 s
 * lock grace, since a lock can push an expiry back by that much). Every live
 * word has its own first letter (kit letters, tier 1 only); a word whose life
 * ends while it is being typed gets the 1.2 s lock grace, then the next stray
 * key is forgiven (kit typing/session). While Minh appearances are owed (the
 * opening), a Thường or Tâm ma goes up only if an exact no-typing plan of the
 * spawner (planOwedMinh) still shows every Minh twice before the end, so the
 * "≥ 2 times" holds even for a player who types nothing.
 * Score: completed session (each Minh typed at least once) clamp(40 + 5 Minh
 * + 2 Thường − 3 wrong; 40; 100), otherwise max(0; 5 Minh + 2 Thường − 3
 * wrong) with no floor; 100 over the sessions of a lesson = lĩnh ngộ.
 * Owner: Lane 8.
 */
import { LETTERS, PACE, SIM, TINH_TU } from "../../content/rules";
import { createRng, type RngStream } from "../../kit/platform/rng";
import { TD_TYPING, compileTyping, typingConfig, type TypingRules } from "../../kit/typing/config";
import { compileDeck, type Deck } from "../../kit/typing/decks";
import { withinOneEdit } from "../../kit/typing/distance";
import { KEY, type KeyResult } from "../../kit/typing/router";
import { typeSeconds } from "../../kit/typing/scorer";
import {
  addWord,
  createSession,
  dropWord,
  shieldLock,
  typeBackspace,
  typeLetter,
  unlock,
  wordTiming,
  type TypingSession,
  type TypingStats,
} from "../../kit/typing/session";

export type TinhTuTier = "nhap-mon" | "tham-ngo";
export type PaperKind = "minh" | "thuong" | "tam-ma";
/** A lesson session (Minh, Thường, Tâm ma) or a review session (Thường only, canon §6.4). */
export type SessionMode = "lesson" | "review";

export interface SessionWord {
  /** Learning entity id (the normalised English word). */
  readonly id: string;
  /** a–z, 3–8 letters. */
  readonly text: string;
  /** Topic group (topics.ts), null when unknown. */
  readonly group: string | null;
}

export interface SessionInit {
  readonly seed: number;
  readonly tier: TinhTuTier;
  readonly mode: SessionMode;
  /** E_eff of the profile × 10 (canon §16 L, §23.3). */
  readonly eEffX10: number;
  /** The lesson's topic group (Tham Ngộ shows it; Thường of other groups keep a mark). */
  readonly lessonGroup: string | null;
  readonly minh: readonly SessionWord[];
  readonly thuong: readonly SessionWord[];
  readonly tamMa: readonly SessionWord[];
}

export interface SessionResult {
  readonly completed: boolean;
  readonly minh: number;
  readonly thuong: number;
  readonly wrong: number;
  readonly score: number;
}

/**
 * Scheduling numbers the canon leaves open (this round's proposal; to fold
 * into rules.ts TINH_TU by Lane 2). Patterns: m Minh, t Thường, x Tâm ma;
 * "opening" runs until every Minh has shown TINH_TU.minhPerSession times.
 */
export const TT_SCHEDULE = {
  firstMs: 600,
  /** Next paper this soon when fewer than the low live count are up. */
  refillMs: 300,
  /** Otherwise a seeded gap in [lo, hi] after the last paper. */
  gapMs: [700, 1300] as readonly [number, number],
  /** Opening plan (planOwedMinh): every owed Minh appearance shows at least this long before the end, even if nothing is typed. */
  minhTailMs: 3000,
  opening: { "nhap-mon": "mmmtmmmx", "tham-ngo": "mmxmmt" } as Readonly<Record<TinhTuTier, string>>,
  later: { "nhap-mon": "mtmx", "tham-ngo": "mxmt" } as Readonly<Record<TinhTuTier, string>>,
} as const;

/** Kit typing rules of Tĩnh Tu: tier-1 letters only, 1 s letter rest, 1.2 s lock grace, Esc keeps errors (D19). */
export const TT_TYPING: TypingRules = compileTyping(
  typingConfig(TD_TYPING, {
    kinds: ["minh", "thuong", "tam-ma"],
    reserveKinds: [],
    letters: { cooldownS: LETTERS.restMs / 1000, reserve: 0, avoid: "", avoidUntilLevel: 0, tier2EarlyFree: 0, tier2EarlyMaxLevel: 0 },
    router: { protectS: TINH_TU.lockGraceMs / 1000, protectFrom: "lethal", unlockErrors: "keep" },
    life: { perChar: PACE.perCharS },
  }),
);

const msToTicks = (ms: number): number => Math.round((ms * SIM.tickHz) / 1000);
const KIND_PM: Readonly<Record<PaperKind, number>> = { minh: 1000, thuong: TINH_TU.thuongLifePm, "tam-ma": TINH_TU.tamMaLifePm };

/** Life of a paper in ms: L = 1.0 + 1.6 × typing time at E_eff + 1.0 s; Thường 1.5 L, Tâm ma 2 L (canon §16). */
export function paperLifeMs(kind: PaperKind, len: number, eEffX10: number): number {
  const eEff = Math.max(10, eEffX10) / 10;
  const typeMs = typeSeconds(TT_TYPING, len, eEff, PACE.dPm / 1000) * 1000;
  const lifeMs = TINH_TU.lifeHeadMs + (TINH_TU.lifeTypeX10 * typeMs) / 10 + TINH_TU.lifeTailMs;
  return Math.round((lifeMs * KIND_PM[kind]) / 1000);
}

/** canon §16 scoring (D40). */
export function sessionScore(completed: boolean, minh: number, thuong: number, wrong: number): number {
  const raw = TINH_TU.minhPoints * minh + TINH_TU.thuongPoints * thuong - TINH_TU.wrongPoints * wrong;
  return completed ? Math.min(TINH_TU.full, Math.max(TINH_TU.completeFloor, TINH_TU.completeFloor + raw)) : Math.max(0, raw);
}

export interface Paper {
  readonly serial: number;
  readonly kind: PaperKind;
  /** Deck index of its word. */
  readonly word: number;
  readonly text: string;
  readonly group: string | null;
  /** Reading point 0…points − 1. */
  readonly point: number;
  readonly born: number;
  /** Tick its life ends (a lock may hold it for the grace after that). */
  readonly expires: number;
  /** Its slot in the kit typing session. */
  readonly slot: number;
  /** False only for an unlabelled Tâm ma of Tham Ngộ (looks like plain paper). */
  readonly labelled: boolean;
  /** A Thường of another group than the lesson's: light rim and ink drop. */
  readonly otherGroup: boolean;
  /** Minh's first appearance shows the meaning. */
  readonly showMeaning: boolean;
  /** 1 for the word's first appearance in this session. */
  readonly appearance: number;
  /** Tick the lock grace opened, −1 none. */
  graceFrom: number;
}

export type SessionCommand = { readonly type: "letter"; readonly letter: number } | { readonly type: "backspace" } | { readonly type: "escape" };

export interface Expiry {
  readonly tick: number;
  readonly serial: number;
  readonly kind: PaperKind;
  readonly word: number;
  /** It expired after a lock grace. */
  readonly grace: boolean;
}

export type SessionEvent =
  | { readonly type: "spawn"; readonly tick: number; readonly serial: number; readonly kind: PaperKind; readonly word: number; readonly point: number }
  | { readonly type: "key"; readonly tick: number; readonly serial: number; readonly result: KeyResult }
  | { readonly type: "backspace"; readonly tick: number; readonly acted: boolean }
  | { readonly type: "escape"; readonly tick: number; readonly acted: boolean }
  | {
      readonly type: "done";
      readonly tick: number;
      readonly serial: number;
      readonly kind: PaperKind;
      readonly word: number;
      readonly text: string;
      readonly errors: number;
      /** Ticks from the paper appearing to its last key. */
      readonly totalTicks: number;
      readonly meaningShown: boolean;
      readonly labelled: boolean;
      /** The word's first completion in this session. */
      readonly first: boolean;
    }
  | { readonly type: "expire"; readonly tick: number; readonly serial: number; readonly kind: PaperKind; readonly word: number; readonly grace: boolean }
  | { readonly type: "end"; readonly tick: number; readonly result: SessionResult };

export interface ShownCounts {
  minh: number;
  thuong: number;
  tamMa: number;
  tamMaUnlabelled: number;
}

export interface TinhTuSession {
  readonly init: SessionInit;
  readonly deck: Deck;
  /** Per deck word. */
  readonly kinds: readonly PaperKind[];
  readonly groups: readonly (string | null)[];
  readonly texts: readonly string[];
  readonly life: Int32Array;
  readonly typing: TypingSession;
  readonly points: number;
  readonly minLive: number;
  readonly maxLive: number;
  readonly endTick: number;
  readonly minhGapTicks: number;
  tick: number;
  /** Live papers, oldest first. */
  readonly papers: Paper[];
  serial: number;
  lastSpawn: number;
  nextGap: number;
  /** Opening: the shortest filler life the plan refused since the last slip came or left (fillers living as long wait). */
  fillerRefused: number;
  patternAt: number;
  readonly appearances: Int16Array;
  readonly typedCount: Int16Array;
  readonly live: Uint8Array;
  minhQueue: number[];
  readonly minhWords: readonly number[];
  /** First letters of the lesson's words: Thường and Tâm ma leave them free. */
  readonly minhLetters: ReadonlySet<number>;
  readonly thuongOrder: readonly number[];
  thuongAt: number;
  readonly tamMaOrder: readonly number[];
  tamMaAt: number;
  unlabelledAcc: number;
  minhDone: number;
  thuongDone: number;
  wrong: number;
  readonly wrongWords: number[];
  readonly shown: ShownCounts;
  readonly expiries: Expiry[];
  readonly events: SessionEvent[];
  readonly spawnRng: RngStream;
  readonly wordRng: RngStream;
  ended: boolean;
  result: SessionResult | null;
}

const DECK_TEXT = /^[a-z]{3,8}$/;

function shuffled(items: readonly number[], rng: RngStream): number[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    const value = out[index]!;
    out[index] = out[other]!;
    out[other] = value;
  }
  return out;
}

/** One Minh round: every lesson word once, the not-yet-typed ones first; never the same word twice in a row across rounds. */
function minhRound(s: Pick<TinhTuSession, "minhWords" | "typedCount" | "wordRng">, last: number): number[] {
  const untyped = shuffled(s.minhWords.filter((word) => s.typedCount[word] === 0), s.wordRng);
  const typed = shuffled(s.minhWords.filter((word) => s.typedCount[word]! > 0), s.wordRng);
  const round = [...untyped, ...typed];
  if (round.length > 1 && round[0] === last) [round[0], round[1]] = [round[1]!, round[0]!];
  return round;
}

/** Session words: Minh, Thường, Tâm ma in that order, a–z 3–8, each text once; a slip one edit away from a lesson word is left out (kit letters would keep that Minh off the water while it lives). */
function sessionWords(init: SessionInit): { word: SessionWord; kind: PaperKind }[] {
  const all: { word: SessionWord; kind: PaperKind }[] = [];
  const seen = new Set<string>();
  for (const [list, kind] of [
    [init.mode === "lesson" ? init.minh : [], "minh"],
    [init.thuong, "thuong"],
    [init.mode === "lesson" ? init.tamMa : [], "tam-ma"],
  ] as const) {
    for (const word of list) {
      if (!DECK_TEXT.test(word.text) || seen.has(word.text)) continue;
      seen.add(word.text);
      all.push({ word, kind });
    }
  }
  const probe = compileDeck(all.map(({ word }) => ({ id: word.id, text: word.text, level: 1 })));
  const minh = all.flatMap(({ kind }, at) => (kind === "minh" ? [at] : []));
  const near = (at: number) => minh.some((other) => withinOneEdit(probe.letters, probe.start[at]!, probe.len[at]!, probe.start[other]!, probe.len[other]!));
  return all.filter(({ kind }, at) => kind === "minh" || !near(at));
}

export function createTinhTuSession(init: SessionInit): TinhTuSession {
  const words = sessionWords(init);
  const deck = compileDeck(words.map(({ word }) => ({ id: word.id, text: word.text, level: 1 })));
  if (deck.count !== words.length) throw new Error("tinh-tu: deck lost words");
  const kinds = words.map(({ kind }) => kind);
  const index = (kind: PaperKind) => kinds.flatMap((value, word) => (value === kind ? [word] : []));
  const rng = createRng(init.seed);
  const spawnRng = rng.spawn;
  const wordRng = rng.words;
  const life = new Int32Array(words.length);
  words.forEach(({ word, kind }, at) => (life[at] = msToTicks(paperLifeMs(kind, word.text.length, init.eEffX10))));
  const thamNgo = init.tier === "tham-ngo";
  const minhWords = index("minh");
  const s: TinhTuSession = {
    init,
    deck,
    kinds,
    groups: words.map(({ word }) => word.group),
    texts: words.map(({ word }) => word.text),
    life,
    typing: createSession(TT_TYPING, deck, 8),
    points: TINH_TU.readPoints[thamNgo ? 1 : 0],
    minLive: (thamNgo ? TINH_TU.liveThamNgo : TINH_TU.liveNhapMon)[0],
    maxLive: (thamNgo ? TINH_TU.liveThamNgo : TINH_TU.liveNhapMon)[1],
    endTick: msToTicks(TINH_TU.sessionMs),
    minhGapTicks: msToTicks(TINH_TU.minhExpireGapMs + TINH_TU.lockGraceMs),
    tick: 0,
    papers: [],
    serial: 0,
    lastSpawn: Number.MIN_SAFE_INTEGER,
    nextGap: 0,
    fillerRefused: Number.MAX_SAFE_INTEGER,
    patternAt: 0,
    appearances: new Int16Array(words.length),
    typedCount: new Int16Array(words.length),
    live: new Uint8Array(words.length),
    minhQueue: [],
    minhWords,
    minhLetters: new Set(minhWords.map((word) => deck.letters[deck.start[word]!]!)),
    thuongOrder: shuffled(index("thuong"), wordRng),
    thuongAt: 0,
    tamMaOrder: shuffled(index("tam-ma"), wordRng),
    tamMaAt: 0,
    unlabelledAcc: spawnRng.int(0, 999),
    minhDone: 0,
    thuongDone: 0,
    wrong: 0,
    wrongWords: [],
    shown: { minh: 0, thuong: 0, tamMa: 0, tamMaUnlabelled: 0 },
    expiries: [],
    events: [],
    spawnRng,
    wordRng,
    ended: false,
    result: null,
  };
  const first = minhRound(s, -1);
  s.minhQueue = [...first, ...minhRound(s, first[first.length - 1] ?? -1)];
  return s;
}

const kindIndex = (s: TinhTuSession, kind: PaperKind): number => s.typing.rules.kind[kind]!;

/** The word can go live now with its own first letter (tier 1) and no live word one edit away. */
function claimable(s: TinhTuSession, word: number, kind: PaperKind, tick: number): boolean {
  if (s.live[word] === 1) return false;
  const letters = s.typing.letters;
  return letters.claim(s.deck, s.typing.words, word, kindIndex(s, kind), tick, 1, -1, letters.free(tick, 1)) === 1;
}

/**
 * HC5: a new Minh's expiry stays ≥ 1.5 s + grace away from every live Minh's.
 * A life that would end at or after the session's end never expires (the
 * session clears every slip), so such a pair cannot clash.
 */
function minhGapOk(s: TinhTuSession, word: number, tick: number): boolean {
  const expires = tick + s.life[word]!;
  if (expires >= s.endTick) return true;
  return s.papers.every((paper) => paper.kind !== "minh" || paper.expires >= s.endTick || Math.abs(paper.expires - expires) >= s.minhGapTicks);
}

/** The opening's plan for the Minh appearances still owed: the first word and its tick, and how many owed spawns fit. */
export interface MinhPlan {
  readonly word: number;
  readonly at: number;
  readonly fitted: number;
  readonly owed: number;
}

/** Earliest tick ≥ `from` at which a Minh living `life` keeps the HC5 gap to every expiry in `expiries` (minhGapOk). */
function hc5Earliest(s: TinhTuSession, from: number, life: number, expiries: readonly number[]): number {
  let at = from;
  for (let moved = true; moved; ) {
    moved = false;
    for (const other of expiries) {
      const mine = at + life;
      if (mine >= s.endTick || Math.abs(mine - other) >= s.minhGapTicks) continue;
      at = other + s.minhGapTicks - life;
      moved = true;
    }
  }
  return at;
}

/** The spawner's seeded gap after slip `serial`: a pure function of the seed, so the opening plan sees the same gaps. */
export function gapAfter(seed: number, serial: number): number {
  let h = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul(serial + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  const [lo, hi] = TT_SCHEDULE.gapMs;
  return msToTicks(lo + ((h >>> 0) % (hi - lo + 1)));
}

/** A slip the plan puts on the water now: a Minh (its index in the queue) or a filler (−1) of deck word `word`. */
export interface PlanExtra {
  readonly word: number;
  readonly queueAt: number;
}

/**
 * Opening plan (canon §16: every Minh ≥ 2 times a session): what this
 * spawner does with the Minh appearances the opening queue still owes if
 * nothing is typed from now on and no filler comes. A slip leaves at the end
 * of its life (the locked one after its lock grace), a word shows again after
 * its letter's rest, the spawner keeps its first tick, live counts, refill
 * and seeded gaps (gapAfter), and at each spawn the first queue word that may
 * show (HC5, minhGapOk) goes up. `extra` puts one more slip up first, now.
 * `fitted` counts the owed spawns that come by minhTailMs before the end.
 * Typing only takes slips off sooner. Pure; a few hundred steps.
 */
export function planOwedMinh(s: TinhTuSession, tick: number, extra: PlanExtra | null = null): MinhPlan {
  const queue = [...s.minhQueue];
  const grace = msToTicks(TINH_TU.lockGraceMs);
  const rest = msToTicks(LETTERS.restMs);
  const refill = msToTicks(TT_SCHEDULE.refillMs);
  const firstTick = msToTicks(TT_SCHEDULE.firstMs);
  const last = s.endTick - msToTicks(TT_SCHEDULE.minhTailMs);
  const lock = s.typing.router.lock;
  const free: number[] = [];
  // First letter → tick it may start a word again (a Minh's letter is never a filler's).
  const letterFree = new Map<number, number>();
  const letterOf = (word: number) => s.deck.letters[s.deck.start[word]!]!;
  const expiries: number[] = [];
  for (const paper of s.papers) {
    const locked = paper.slot === lock && s.typing.words.typed[paper.slot]! > 0;
    const leaves = paper.graceFrom >= 0 ? paper.graceFrom + grace : locked ? paper.expires + grace : paper.expires;
    free.push(leaves);
    if (paper.kind !== "minh") continue;
    letterFree.set(letterOf(paper.word), leaves + rest);
    if (paper.expires < s.endTick) expiries.push(paper.expires);
  }
  for (let c = 0; c < 26; c += 1) {
    const freeAt = s.typing.letters.freeAt[c]!;
    if (freeAt > tick && !letterFree.has(c)) letterFree.set(c, freeAt);
  }
  let prev = s.lastSpawn;
  let gap = s.nextGap;
  let serial = s.serial;
  const put = (word: number, at: number, minh: boolean): void => {
    const life = s.life[word]!;
    free.push(at + life);
    if (minh) {
      letterFree.set(letterOf(word), at + life + rest);
      if (at + life < s.endTick) expiries.push(at + life);
    }
    prev = at;
    gap = gapAfter(s.init.seed, serial);
    serial += 1;
  };
  if (extra !== null) {
    if (extra.queueAt >= 0) queue.splice(extra.queueAt, 1);
    put(extra.word, tick, extra.queueAt >= 0);
  }
  const owed = queue.length;
  if (owed === 0) return { word: -1, at: tick, fitted: 0, owed: 0 };
  let first = -1;
  let firstAt = tick;
  let fitted = 0;
  let t = Math.max(tick + (extra === null ? 0 : 1), firstTick);
  while (queue.length > 0) {
    // The spawner's own gate: a free point, then refill (below the low live count) or the seeded gap.
    for (;;) {
      let live = 0;
      let nextFree = Number.MAX_SAFE_INTEGER;
      for (const at of free) {
        if (at > t) {
          live += 1;
          nextFree = Math.min(nextFree, at);
        }
      }
      const wait = prev + (live < s.minLive ? refill : gap);
      if (live < s.maxLive && t >= wait) break;
      t = live >= s.maxLive ? nextFree : Math.min(wait, nextFree);
    }
    let pick = -1;
    let next = Number.MAX_SAFE_INTEGER;
    for (let at = 0; at < queue.length; at += 1) {
      const word = queue[at]!;
      const ready = hc5Earliest(s, Math.max(t, letterFree.get(letterOf(word)) ?? t), s.life[word]!, expiries);
      if (ready === t) {
        pick = at;
        break;
      }
      next = Math.min(next, ready);
    }
    if (pick < 0) {
      // No word may show at t: the queue is scanned again when the first one may.
      t = next;
      continue;
    }
    const word = queue[pick]!;
    if (first < 0) {
      first = word;
      firstAt = t;
    }
    if (t > last) break;
    fitted += 1;
    put(word, t, true);
    queue.splice(pick, 1);
  }
  return { word: first, at: firstAt, fitted, owed };
}

function takeMinh(s: TinhTuSession, at: number): number {
  return s.minhQueue.splice(at, 1)[0]!;
}

function pickMinh(s: TinhTuSession, tick: number): number {
  const opening = !minhShownEnough(s);
  for (let refill = 0; refill < 2; refill += 1) {
    let firstReady = -1;
    for (let at = 0; at < s.minhQueue.length; at += 1) {
      const word = s.minhQueue[at]!;
      if (!claimable(s, word, "minh", tick) || !minhGapOk(s, word, tick)) continue;
      // Later rounds: the first word of the queue that may show now.
      if (!opening) return takeMinh(s, at);
      // Opening: the first that keeps every owed Minh in the plan (the plain choice when the plan fits already).
      if (firstReady < 0) firstReady = at;
      const plan = planOwedMinh(s, tick, { word, queueAt: at });
      if (plan.fitted === plan.owed) return takeMinh(s, at);
    }
    if (firstReady >= 0) return takeMinh(s, firstReady);
    if (opening || s.minhQueue.length > 0 || s.minhWords.length === 0) return -1;
    s.minhQueue = minhRound(s, -1);
  }
  return -1;
}

function pickFiller(s: TinhTuSession, kind: "thuong" | "tam-ma", tick: number): number {
  const order = kind === "thuong" ? s.thuongOrder : s.tamMaOrder;
  const from = kind === "thuong" ? s.thuongAt : s.tamMaAt;
  const opening = !minhShownEnough(s);
  for (let step = 0; step < order.length; step += 1) {
    const at = (from + step) % order.length;
    const word = order[at]!;
    if (s.minhLetters.has(s.deck.letters[s.deck.start[word]!]!)) continue;
    if (!claimable(s, word, kind, tick)) continue;
    if (opening) {
      // While Minh are owed, a filler may take a point only if every owed Minh still shows in the plan.
      // A refused life stays refused (a longer one too) until a slip comes or leaves.
      const life = s.life[word]!;
      if (life >= s.fillerRefused) continue;
      const plan = planOwedMinh(s, tick, { word, queueAt: -1 });
      if (plan.fitted < plan.owed) {
        s.fillerRefused = life;
        continue;
      }
    }
    if (kind === "thuong") s.thuongAt = (at + 1) % order.length;
    else s.tamMaAt = (at + 1) % order.length;
    return word;
  }
  return -1;
}

const KIND_OF: Readonly<Record<string, PaperKind>> = { m: "minh", t: "thuong", x: "tam-ma" };

function available(s: TinhTuSession, kind: PaperKind): boolean {
  if (s.init.mode === "review") return kind === "thuong" && s.thuongOrder.length > 0;
  return kind === "minh" ? s.minhWords.length > 0 : kind === "thuong" ? s.thuongOrder.length > 0 : s.tamMaOrder.length > 0;
}

/** Every Minh has shown minhPerSession times. */
const minhShownEnough = (s: TinhTuSession): boolean => s.minhWords.every((word) => s.appearances[word]! >= TINH_TU.minhPerSession);

function desiredKind(s: TinhTuSession): PaperKind | null {
  const pattern = (minhShownEnough(s) ? TT_SCHEDULE.later : TT_SCHEDULE.opening)[s.init.tier];
  for (let step = 0; step < pattern.length; step += 1) {
    const kind = KIND_OF[pattern[(s.patternAt + step) % pattern.length]!]!;
    if (!available(s, kind)) continue;
    s.patternAt = (s.patternAt + step) % pattern.length;
    return kind;
  }
  return null;
}

/** Tham Ngộ: one Tâm ma in three unlabelled (Bresenham on tamMaUnlabelledPm, seeded phase). */
function nextUnlabelled(s: TinhTuSession): boolean {
  s.unlabelledAcc += TINH_TU.tamMaUnlabelledPm;
  if (s.unlabelledAcc < 1000) return false;
  s.unlabelledAcc -= 1000;
  return true;
}

function spawn(s: TinhTuSession, kind: PaperKind, word: number, point: number, tick: number): void {
  const slot = addWord(s.typing, word, kindIndex(s, kind), 1, tick);
  if (slot < 0) throw new Error("tinh-tu: typing store full");
  s.appearances[word] = s.appearances[word]! + 1;
  const unlabelled = kind === "tam-ma" && s.init.tier === "tham-ngo" && nextUnlabelled(s);
  const group = s.groups[word] ?? null;
  const paper: Paper = {
    serial: s.serial,
    kind,
    word,
    text: s.texts[word]!,
    group,
    point,
    born: tick,
    expires: tick + s.life[word]!,
    slot,
    labelled: !unlabelled,
    otherGroup: kind === "thuong" && s.init.lessonGroup !== null && group !== s.init.lessonGroup,
    showMeaning: kind === "minh" && s.appearances[word] === 1,
    appearance: s.appearances[word]!,
    graceFrom: -1,
  };
  s.serial += 1;
  s.papers.push(paper);
  s.live[word] = 1;
  s.fillerRefused = Number.MAX_SAFE_INTEGER;
  if (kind === "minh") s.shown.minh += 1;
  else if (kind === "thuong") s.shown.thuong += 1;
  else {
    s.shown.tamMa += 1;
    if (unlabelled) s.shown.tamMaUnlabelled += 1;
  }
  s.events.push({ type: "spawn", tick, serial: paper.serial, kind, word, point });
}

function freePoints(s: TinhTuSession): number[] {
  const used = new Set(s.papers.map((paper) => paper.point));
  const free: number[] = [];
  for (let point = 0; point < s.points; point += 1) if (!used.has(point)) free.push(point);
  return free;
}

function trySpawn(s: TinhTuSession, tick: number): boolean {
  const free = freePoints(s);
  if (free.length === 0) return false;
  const desired = desiredKind(s);
  if (desired === null) return false;
  const order: readonly PaperKind[] =
    desired === "minh" ? ["minh", "thuong", "tam-ma"] : desired === "thuong" ? ["thuong", "minh", "tam-ma"] : ["tam-ma", "thuong", "minh"];
  for (const kind of order) {
    if (!available(s, kind)) continue;
    const word = kind === "minh" ? pickMinh(s, tick) : pickFiller(s, kind, tick);
    if (word < 0) continue;
    spawn(s, kind, word, free[s.spawnRng.int(0, free.length - 1)]!, tick);
    if (kind === desired) s.patternAt += 1;
    return true;
  }
  return false;
}

function spawnPapers(s: TinhTuSession, tick: number): void {
  if (tick < msToTicks(TT_SCHEDULE.firstMs) || s.papers.length >= s.maxLive) return;
  const wait = s.papers.length < s.minLive ? msToTicks(TT_SCHEDULE.refillMs) : s.nextGap;
  if (tick < s.lastSpawn + wait) return;
  if (!trySpawn(s, tick)) return;
  s.lastSpawn = tick;
  s.nextGap = gapAfter(s.init.seed, s.serial - 1);
}

function removePaper(s: TinhTuSession, paper: Paper, tick: number): void {
  dropWord(s.typing, paper.slot, tick);
  s.papers.splice(s.papers.indexOf(paper), 1);
  s.live[paper.word] = 0;
  // A point is free again: the opening plan may take fillers again.
  s.fillerRefused = Number.MAX_SAFE_INTEGER;
}

function completePaper(s: TinhTuSession, paper: Paper, tick: number): void {
  const timing = wordTiming(s.typing, paper.slot, tick);
  removePaper(s, paper, tick);
  s.typedCount[paper.word] = s.typedCount[paper.word]! + 1;
  if (paper.kind === "minh") s.minhDone += 1;
  else if (paper.kind === "thuong") s.thuongDone += 1;
  else {
    s.wrong += 1;
    s.wrongWords.push(paper.word);
  }
  s.events.push({
    type: "done",
    tick,
    serial: paper.serial,
    kind: paper.kind,
    word: paper.word,
    text: paper.text,
    errors: timing.errors,
    totalTicks: timing.total,
    meaningShown: paper.showMeaning,
    labelled: paper.labelled,
    first: s.typedCount[paper.word] === 1,
  });
}

const paperAt = (s: TinhTuSession, slot: number): Paper | undefined => (slot < 0 ? undefined : s.papers.find((paper) => paper.slot === slot));

function applyCommand(s: TinhTuSession, command: SessionCommand, tick: number): void {
  if (command.type === "backspace") {
    s.events.push({ type: "backspace", tick, acted: typeBackspace(s.typing) });
    return;
  }
  if (command.type === "escape") {
    s.events.push({ type: "escape", tick, acted: unlock(s.typing) });
    return;
  }
  const outcome = typeLetter(s.typing, command.letter, tick);
  const paper = paperAt(s, outcome.slot);
  s.events.push({ type: "key", tick, serial: paper?.serial ?? -1, result: outcome.result });
  if (outcome.result === KEY.done && paper !== undefined) completePaper(s, paper, tick);
}

function expirePapers(s: TinhTuSession, tick: number): void {
  for (const paper of [...s.papers]) {
    if (tick < paper.expires) continue;
    const locked = s.typing.router.lock === paper.slot && s.typing.words.typed[paper.slot]! > 0;
    if (locked && shieldLock(s.typing, paper.slot, tick)) {
      if (paper.graceFrom < 0) paper.graceFrom = tick;
      continue;
    }
    const grace = paper.graceFrom >= 0;
    removePaper(s, paper, tick);
    s.expiries.push({ tick, serial: paper.serial, kind: paper.kind, word: paper.word, grace });
    s.events.push({ type: "expire", tick, serial: paper.serial, kind: paper.kind, word: paper.word, grace });
  }
}

/** Every lesson word typed at least once (canon §16, D40). */
export const isCompleted = (s: TinhTuSession): boolean => s.init.mode === "lesson" && s.minhWords.length > 0 && s.minhWords.every((word) => s.typedCount[word]! > 0);

export function currentResult(s: TinhTuSession): SessionResult {
  const completed = isCompleted(s);
  return { completed, minh: s.minhDone, thuong: s.thuongDone, wrong: s.wrong, score: sessionScore(completed, s.minhDone, s.thuongDone, s.wrong) };
}

function endSession(s: TinhTuSession): void {
  // The clock never stops nor stretches (canon §16): what is still up just leaves.
  for (const paper of [...s.papers]) removePaper(s, paper, s.tick);
  s.ended = true;
  s.result = currentResult(s);
  s.events.push({ type: "end", tick: s.tick, result: s.result });
}

/** One 60 Hz tick: the keys of this tick in order, then expiries, then at most one new paper. */
export function stepTinhTu(s: TinhTuSession, commands: readonly SessionCommand[] = []): void {
  if (s.ended) return;
  const tick = s.tick;
  for (const command of commands) applyCommand(s, command, tick);
  expirePapers(s, tick);
  spawnPapers(s, tick);
  s.tick = tick + 1;
  if (s.tick >= s.endTick) endSession(s);
}

/** Events since the last drain, oldest first. */
export function drainEvents(s: TinhTuSession): SessionEvent[] {
  return s.events.splice(0, s.events.length);
}

/** What a reader sees of a slip: an unlabelled Tâm ma looks exactly like plain Thường paper (canon §16 Tham Ngộ). */
export type PaperLook = "minh" | "plain" | "other" | "tamma";

export function paperLook(paper: Pick<Paper, "kind" | "labelled" | "otherGroup">): PaperLook {
  if (paper.kind === "minh") return "minh";
  if (paper.kind === "tam-ma") return paper.labelled ? "tamma" : "plain";
  return paper.otherGroup ? "other" : "plain";
}

/** Letters typed on a paper (the view's underline). */
export const typedLetters = (s: TinhTuSession, paper: Paper): number => s.typing.words.typed[paper.slot]!;

/** The paper the keyboard is locked on, or null. */
export const lockedPaper = (s: TinhTuSession): Paper | null => paperAt(s, s.typing.router.lock) ?? null;

/** What the end screen and the bots read. */
export interface SessionSummary extends SessionResult {
  readonly mode: SessionMode;
  readonly tier: TinhTuTier;
  readonly minhTyped: readonly string[];
  readonly minhMissing: readonly string[];
  readonly minhAppearances: readonly number[];
  readonly thuongTyped: readonly string[];
  readonly wrongWords: readonly string[];
  readonly shown: Readonly<ShownCounts>;
  readonly expired: { readonly minh: number; readonly thuong: number; readonly tamMa: number };
  readonly keys: Readonly<TypingStats>;
}

export function summarize(s: TinhTuSession): SessionSummary {
  const result = s.result ?? currentResult(s);
  const textOf = (word: number) => s.texts[word]!;
  const typedOf = (kind: PaperKind) => s.kinds.flatMap((value, word) => (value === kind && s.typedCount[word]! > 0 ? [textOf(word)] : []));
  const expired = (kind: PaperKind) => s.expiries.filter((expiry) => expiry.kind === kind).length;
  return {
    ...result,
    mode: s.init.mode,
    tier: s.init.tier,
    minhTyped: typedOf("minh"),
    minhMissing: s.minhWords.filter((word) => s.typedCount[word] === 0).map(textOf),
    minhAppearances: s.minhWords.map((word) => s.appearances[word]!),
    thuongTyped: typedOf("thuong"),
    wrongWords: s.wrongWords.map(textOf),
    shown: { ...s.shown },
    expired: { minh: expired("minh"), thuong: expired("thuong"), tamMa: expired("tam-ma") },
    keys: { ...s.typing.stats },
  };
}

/** HC5 audit: pairs of Minh expiries closer than 1.5 s. */
export function minhExpiryClashes(expiries: readonly Expiry[]): number {
  const ticks = expiries.filter((expiry) => expiry.kind === "minh").map((expiry) => expiry.tick).sort((a, b) => a - b);
  const gap = msToTicks(TINH_TU.minhExpireGapMs);
  let clashes = 0;
  for (let at = 1; at < ticks.length; at += 1) if (ticks[at]! - ticks[at - 1]! < gap) clashes += 1;
  return clashes;
}
