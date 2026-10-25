/**
 * The Bàn Quyết in the sim (canon §6.1–6.4) on kit/typing/session: own first
 * letter (tier 1), no prefixes, edit distance > 1, live-word cap and priority
 * by preset, no word change while typing, 1 s letter rest, Esc keeps errors
 * (`unlockErrors: "keep"`), lock grace. Live only from the wave warning to the
 * wave end and in the boss phase (D42). Deals slot words, Ấn, Tẩy; releases
 * on beast death and when the seat goes down; `word-first-seen` for new words.
 *
 * Layout: each seat owns 8 Bàn Quyết entries in `live` (index seat × 8 + j):
 * j 0–4 the five slots (always bound), j 5–6 two Ấn places, j 7 the Tẩy place
 * (bound by dealSeal / dealCleanse, back in `free` when released). A seat has
 * its own kit session (letters, router, live words; each person sees only
 * their own words, canon §19.1) and its own kit BudgetLedger (cap = min(preset
 * cap; A − 3)). Places go by canon §6.2's priority when several entries wait;
 * an urgent word or the first Ấn takes the place of the lowest-priority word
 * nobody is typing; slot words never push each other out.
 *
 * Words come, in order: the dim preview shown during the cooldown; for ô 2 and
 * ô 4 this match's new words due to be met again (≥ 45 s apart, canon §6.4,
 * HC8); for ô 4 a fresh new word (waves 1–2, within `newWordAllowance`, not
 * while a typed-answer telegraph charges, not below 90 % accuracy or after a
 * new word took > 1.5 s to start in this wave, and only while two more
 * meetings still fit before wave 4); then the slot's bag at each fallback step
 * (typing/fallback.ts). Bags are kit-picker style shuffled rounds of header
 * deck indexes on `world.rng.words` (no repeat until a round runs out); a bag
 * word whose first letter a pending new word of the match needs is passed
 * over while another fits (a soft reservation: an idle ô 3 word must not hold
 * a letter a re-meeting needs, HC8). A slot leaves the cooldown when Lane 4's
 * `cooldownUntil` passes (rules.ts SLOTS if it is absent); ô 5 when Chân
 * Nguyên is full.
 *
 * Events are pushed with the world tick, as sim/events.ts emit does. Wall-clock
 * key times (responseMs) live in `world.wall`, outside hashWorld.
 * Owner: Lane 3.
 */
import { CHAN_NGUYEN, FLOW, NEW_WORDS, PACE, PRESETS, SIM, SLOT3_DASH_COOLDOWN_MS, SLOTS } from "../content/rules";
import { TELEGRAPHS } from "../content/data/telegraphs";
import type {
  BeastRef, BeastState, DeckUse, DeckWord, LiveWord, NodeId, Phase, SimCommand, SimEvent, SlotId, WordGroup, WordReleaseReason, WordSlotKind,
  WordsState, World, WorldInit,
} from "../content/types";
import { BudgetLedger } from "../kit/typing/budget";
import { compileDeck } from "../kit/typing/decks";
import { KEY } from "../kit/typing/router";
import { addWord, createSession, dropWord, typeBackspace as kitBackspace, typeLetter, unlock, wordTiming, type TypingSession } from "../kit/typing/session";
import { IC_RULES, kindIndex, type IcKind } from "../typing/config";
import { SOURCE, SOURCES, fallbackStages, isDeckText, liveWordCap, seatBudget, stageAccepts, type FallbackStage, type FallbackStep } from "../typing/fallback";
import { GRADES, activityFor, eEffX1000, expectedTicks, gradeOf, mqPm } from "../typing/grading";
import { meaningShown, slotLengths, takesFreshNew, takesRemeetings, type SlotAsk } from "../typing/slots";
import { emitCast, nextActionId } from "./cast";
import type { EventBody } from "./events";

// WordsState, LiveWord, SeatHeader.flashEX1000 and WallState word times live in content/types.ts (folded in, part A fixes).

/** Bàn Quyết entries per seat: 5 slots, 2 Ấn, 1 Tẩy. */
export const ENTRIES_PER_SEAT = 8;
const SEAL_ENTRIES = [5, 6] as const;
const CLEANSE_ENTRY = 7;
const LIVE_PHASES: ReadonlySet<Phase> = new Set<Phase>(["warning", "wave", "lull", "boss"]);

const ticksOf = (ms: number): number => Math.round((ms * SIM.tickHz) / 1000);
const msOf = (ticks: number): number => Math.round((ticks * 1000) / SIM.tickHz);
const MEET_GAP_TICKS = ticksOf(NEW_WORDS.meetGapMs);
const SLOW_RECOGNIZE_TICKS = ticksOf(NEW_WORDS.slowRecognizeMs);

/** Pushes `body` stamped with the world tick (sim/events.ts emit does the same). */
function out(world: World, body: EventBody): void {
  world.events.push({ ...body, tick: world.tick } as SimEvent);
}

// ── Creating ───────────────────────────────────────────────────────────────

const blankEntry = (index: number, seat: number, j: number): LiveWord => ({
  index,
  seat,
  kind: j < 5 ? "slot" : j < CLEANSE_ENTRY ? "seal" : "cleanse",
  slot: j < 5 ? ((j + 1) as SlotId) : null,
  beast: null,
  node: null,
  deck: -1,
  wordId: "",
  text: "",
  group: "known",
  assumed: false,
  typed: 0,
  errors: 0,
  firstKeyTick: -1,
  state: "dim",
  until: -1,
  next: -1,
  kitSlot: -1,
  born: -1,
  hint: false,
  jammed: false,
  step: "exact",
  firstLocked: false,
});

export function createWordsState(init: WorldInit): WordsState {
  const deck = init.header.deck;
  const seats = Math.max(1, init.seats);
  // The kit deck holds every dealable word once, in header order.
  const deckOf: number[] = [];
  const kitOf = new Array<number>(deck.length).fill(-1);
  const texts = new Set<string>();
  deck.forEach((word, index) => {
    if (!isDeckText(word.text) || texts.has(word.text)) return;
    texts.add(word.text);
    kitOf[index] = deckOf.length;
    deckOf.push(index);
  });
  const kitDeck = compileDeck(deckOf.map((index) => ({ id: deck[index]!.wordId, text: deck[index]!.text, level: 0 })), IC_RULES.words);
  const cap = liveWordCap(init.preset, deck);
  const fallbackProfile = { e: PACE.unknownWpm, a: PACE.defaultAccuracyPm, cv: PACE.defaultCvPm };
  const live: LiveWord[] = [];
  const free: number[] = [];
  const seatWords: WordsState["seats"] = [];
  const sessions: TypingSession[] = [];
  const ledgers: BudgetLedger[] = [];
  const flashE: number[] = [];
  const wpm: number[] = [];
  for (let seat = 0; seat < seats; seat += 1) {
    for (let j = 0; j < ENTRIES_PER_SEAT; j += 1) {
      const index = seat * ENTRIES_PER_SEAT + j;
      live.push(blankEntry(index, seat, j));
      if (j >= 5) free.push(index);
    }
    seatWords.push({ locked: -1, slots: [-1, ...[0, 1, 2, 3, 4].map((j) => seat * ENTRIES_PER_SEAT + j)], seals: [], cleanse: -1 });
    sessions.push(createSession(IC_RULES, kitDeck, ENTRIES_PER_SEAT));
    ledgers.push(new BudgetLedger(seatBudget(cap), SOURCES));
    const header = init.header.seats.find((row) => row.seat === seat) ?? init.header.seats[0];
    const profile = header?.profile ?? fallbackProfile;
    flashE.push(header?.flashEX1000 ?? eEffX1000(profile));
    wpm.push(profile.e);
  }
  const deckUse: DeckUse[] = [];
  for (let k = 0; k < seats * deck.length; k += 1) deckUse.push({ meetings: 0, lastMeetTick: -1, scored: false, firstSeenTick: -1 });
  return {
    live,
    free,
    seats: seatWords,
    deckUse,
    newUsed: 0,
    letterRest: new Array<number>(26 * seats).fill(0),
    liveCap: cap,
    bags: [],
    sessions,
    ledgers,
    deckOf,
    kitOf,
    bagKeys: [],
    bagNext: [],
    flashE,
    wpm,
    awake: new Array<boolean>(seats).fill(false),
    newPauseWave: new Array<number>(seats).fill(0),
    lastKeyTick: new Array<number>(seats).fill(-1),
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

/** The live beast `ref` points to, or null (a local beastAt: world.ts imports this file). */
export function liveBeast(world: World, ref: BeastRef): BeastState | null {
  const beast = world.beasts.list[ref.slot];
  return beast !== undefined && beast.alive && !beast.freed && beast.serial === ref.serial ? beast : null;
}

const sameBeast = (a: BeastRef | null, b: BeastRef): boolean => a !== null && a.slot === b.slot && a.serial === b.serial;

/** The Bàn Quyết takes letters for this seat now. */
export function isBanQuyetLive(world: World, seat: number): boolean {
  if (!LIVE_PHASES.has(world.phase)) return false;
  const state = world.seats[seat];
  if (state === undefined) return false;
  return !(state.downUntil >= 0 && world.tick < state.downUntil);
}

/** The wave the Bàn Quyết's words belong to: the coming one during its warning (WaveState.index moves when the wave begins). */
export function wordsWave(world: World): number {
  return world.phase === "warning" ? world.waves.index + 1 : world.waves.index;
}

/** The entry of `slot` (1–5) for `seat`. */
export function slotEntry(world: World, seat: number, slot: SlotId): LiveWord | null {
  const index = world.words.seats[seat]?.slots[slot] ?? -1;
  return index >= 0 ? (world.words.live[index] ?? null) : null;
}

/** This match's use of header deck word `deck` by `seat`. */
export function deckUseOf(world: World, seat: number, deck: number): DeckUse {
  return world.words.deckUse[seat * world.header.deck.length + deck]!;
}

const entryJ = (entry: LiveWord): number => entry.index - entry.seat * ENTRIES_PER_SEAT;
const kitKind = (entry: LiveWord): IcKind => (entry.kind === "cleanse" ? "urgent" : entry.kind === "seal" ? "seal" : "slot");
const sourceOf = (entry: LiveWord): number => (entry.kind === "cleanse" ? SOURCE.urgent : entry.kind === "seal" ? SOURCE.seal : SOURCE.slot);
/** stats.baseWordUses index: slots 1–5, Ấn 6, Tẩy 7. */
const baseUseIndex = (entry: LiveWord): number => (entry.kind === "slot" ? entry.slot! : entry.kind === "seal" ? 6 : 7);
const isLive = (entry: LiveWord): boolean => entry.kitSlot >= 0;

function askOf(world: World, entry: LiveWord): SlotAsk {
  return { kind: entry.kind, slot: entry.slot, preset: world.preset, wpm: world.words.wpm[entry.seat] ?? PACE.unknownWpm, wave: wordsWave(world) };
}

function chanFull(world: World, seat: number): boolean {
  return (world.seats[seat]?.chanNguyenPm ?? 0) >= CHAN_NGUYEN.full * 1000;
}

/** A charging telegraph with a typed answer: no new word on any slot (canon §10.6). */
function typedAnswerCharging(world: World): boolean {
  const active = world.telegraphs?.active ?? [];
  return active.some((telegraph) => !telegraph.cancelled && telegraph.strikeTick > world.tick && TELEGRAPHS[telegraph.def]?.typedAnswer === true);
}

/** A wave's clock at the seat's pace (canon §23.3: plan times × 1 / k), ticks. */
function waveTicks(world: World, seat: number, wave: number): number {
  const def = world.stage.waves?.[wave - 1];
  if (def === undefined) return 0;
  const kPm = Math.max(1, world.seats[seat]?.kPm ?? 1000);
  return ticksOf(Math.floor((def.durationMs * 1000) / kPm));
}

/** A timed break in ticks; a break that waits for Enter counts 0 (the player may go on at once). */
function breakTicksAtLeast(world: World): number {
  const row = PRESETS[world.preset].breakMs;
  if (row === "enter") return 0;
  return ticksOf(world.stage.kind === "grand" && world.preset === "balanced" ? FLOW.grandBreakMs : row);
}

/**
 * Ticks until wave `NEW_WORDS.meetBeforeWave` begins at the nominal schedule:
 * the running wave's clock, then each break, warning and wave clock (a wave
 * may run longer, never shorter: a lower bound). −1 when there is no such wave.
 */
export function ticksToMeetDeadline(world: World, seat: number): number {
  const last = NEW_WORDS.meetBeforeWave;
  if ((world.stage.waves?.length ?? 0) < last) return -1;
  const wave = wordsWave(world);
  if (wave >= last) return 0;
  let left = 0;
  if (world.phase === "warning") left += Math.max(0, world.phaseEndsAt - world.tick) + waveTicks(world, seat, wave);
  else if (world.phase === "wave") left += Math.max(0, world.waves.startedAt + waveTicks(world, seat, wave) - world.tick);
  const between = breakTicksAtLeast(world) + ticksOf(FLOW.warningMs);
  for (let next = wave + 1; next < last; next += 1) left += between + waveTicks(world, seat, next);
  return left + between;
}

/** Ticks two more meetings of a fresh word need: each ≥ 45 s after the last, plus one ô 2 cooldown to come round (canon §6.4, HC8). */
const REMEET_SPAN_TICKS = (NEW_WORDS.meetings - 1) * ticksOf(NEW_WORDS.meetGapMs + SLOTS[2].cooldownMs);
/** Re-meetings counted on before the deadline: one per ô 4 cooldown (ô 2 and ô 4 together come round at least that often). */
const REMEET_EVERY_TICKS = ticksOf(SLOTS[4].cooldownMs);

/** Meetings this match's new words met 1–2 times still need (HC8). */
function pendingMeetings(world: World, seat: number): number {
  let pending = 0;
  world.header.deck.forEach((word, index) => {
    if (word.group !== "new") return;
    const meetings = deckUseOf(world, seat, index).meetings;
    if (meetings >= 1 && meetings < NEW_WORDS.meetings) pending += NEW_WORDS.meetings - meetings;
  });
  return pending;
}

/** Ô 4 may bring a fresh new word to this seat now (canon §6.4, §10.6). */
function freshNewAllowed(world: World, seat: number): boolean {
  const w = world.words;
  if (w.newUsed >= world.newWordAllowance) return false;
  if (w.newPauseWave[seat] === wordsWave(world)) return false;
  const stats = w.sessions[seat]!.stats;
  const right = stats.keys - stats.errors - stats.strays;
  if (stats.keys > 0 && right * 1000 < NEW_WORDS.lowAccuracyPm * stats.keys) return false;
  // HC8: a word met now must still meet twice more before wave 4, after the meetings already owed.
  const deadline = ticksToMeetDeadline(world, seat);
  if (deadline >= 0) {
    if (deadline < REMEET_SPAN_TICKS) return false;
    if (pendingMeetings(world, seat) + NEW_WORDS.meetings - 1 > Math.floor(deadline / REMEET_EVERY_TICKS)) return false;
  }
  return !typedAnswerCharging(world);
}

/**
 * First letters (bit per letter) of this match's new words still to be met:
 * those met 1–2 times, and in waves 1–2 the unmet ones while the allowance
 * lasts. Other words pass over them while another word fits (HC8).
 */
function reservedLetters(world: World, seat: number): number {
  const w = world.words;
  const freshOpen = wordsWave(world) <= NEW_WORDS.slot4LastWave && w.newUsed < world.newWordAllowance;
  let mask = 0;
  world.header.deck.forEach((word, index) => {
    if (word.group !== "new" || w.kitOf[index]! < 0) return;
    const meetings = deckUseOf(world, seat, index).meetings;
    if ((meetings >= 1 && meetings < NEW_WORDS.meetings) || (meetings === 0 && freshOpen)) mask |= 1 << (word.text.charCodeAt(0) - 97);
  });
  return mask;
}

const letterBit = (world: World, deck: number): number => 1 << (world.header.deck[deck]!.text.charCodeAt(0) - 97);

/** The seat's locked live word index, or −1. */
function lockedIndex(world: World, seat: number): number {
  const session = world.words.sessions[seat]!;
  return session.router.lock >= 0 ? session.words.owner[session.router.lock]! : -1;
}

function wallTimes(world: World): { first: number[]; last: number[] } {
  const wall = world.wall;
  wall.wordFirstMs ??= [];
  wall.wordLastMs ??= [];
  return { first: wall.wordFirstMs, last: wall.wordLastMs };
}

// ── Bags ───────────────────────────────────────────────────────────────────

function shuffleFrom(order: number[], from: number, world: World): void {
  const rng = world.rng.words;
  for (let index = order.length - 1; index > from; index -= 1) {
    const other = rng.int(from, index);
    const value = order[index]!;
    order[index] = order[other]!;
    order[other] = value;
  }
}

/** The bag of (seat, ask, stage): every non-new deck word the stage accepts, in deck order until its first shuffle. */
function bagFor(world: World, seat: number, ask: SlotAsk, stage: FallbackStage): number {
  const w = world.words;
  const key = seat + "|" + ask.kind + "|" + (ask.slot ?? 0) + "|" + stage.step + "|" + stage.lengths[0] + "-" + stage.lengths[1];
  const found = w.bagKeys.indexOf(key);
  if (found >= 0) return found;
  const order: number[] = [];
  world.header.deck.forEach((word, index) => {
    if (w.kitOf[index]! >= 0 && word.group !== "new" && stageAccepts(stage, ask, word, 0)) order.push(index);
  });
  w.bagKeys.push(key);
  w.bags.push(order);
  w.bagNext.push(order.length);
  return w.bags.length - 1;
}

/** Marks `deck` dealt in bag `b` (it moves to the dealt part, the rest keeps its order). */
function markDealt(world: World, b: number, deck: number): void {
  const w = world.words;
  const order = w.bags[b]!;
  const next = w.bagNext[b]!;
  const at = next < order.length ? order.indexOf(deck, next) : -1;
  if (at < 0) return;
  for (let k = at; k > next; k -= 1) order[k] = order[k - 1]!;
  order[next] = deck;
  w.bagNext[b] = next + 1;
}

/**
 * kit picker's rounds over bag `b`: the first word `claim` accepts (≤ picker.tries
 * tries) that `prefer` likes, else the first one it accepts, or −1.
 */
function pickFromBag(world: World, b: number, open: (deck: number) => boolean, claim: (deck: number) => boolean, prefer: (deck: number) => boolean): number {
  const w = world.words;
  const order = w.bags[b]!;
  const size = order.length;
  if (size === 0) return -1;
  if (w.bagNext[b]! >= size) {
    shuffleFrom(order, 0, world);
    w.bagNext[b] = 0;
  }
  const tries = IC_RULES.picker.tries;
  let tried = 0;
  let second = -1;
  let from = w.bagNext[b]!;
  for (let round = 0; round < 2 && from < size && tried < tries; round += 1) {
    if (round === 1) {
      if (second >= 0) break;
      // Nothing left in this round fits now: the rest opens the next round, the dealt words reshuffled behind it.
      const next = w.bagNext[b]!;
      const rotated = [...order.slice(next), ...order.slice(0, next)];
      for (let k = 0; k < size; k += 1) order[k] = rotated[k]!;
      from = size - next;
      shuffleFrom(order, from, world);
      w.bagNext[b] = 0;
    }
    for (let at = from; at < size && tried < tries; at += 1) {
      const deck = order[at]!;
      if (!open(deck)) continue;
      tried += 1;
      if (!claim(deck)) continue;
      if (!prefer(deck)) {
        if (second < 0) second = deck;
        continue;
      }
      markDealt(world, b, deck);
      return deck;
    }
  }
  if (second >= 0) markDealt(world, b, second);
  return second;
}

// ── Dealing ────────────────────────────────────────────────────────────────

interface Choice {
  readonly deck: number;
  readonly step: FallbackStep;
}

/** A new word of this match met before, due again (≥ 45 s since the last meeting, fewer than 3 meetings). */
function remeetDue(world: World, seat: number, deck: number, atTick: number): boolean {
  const use = deckUseOf(world, seat, deck);
  return use.meetings >= 1 && use.meetings < NEW_WORDS.meetings && atTick - use.lastMeetTick >= MEET_GAP_TICKS;
}

/** New words due to be met again: those with more meetings still to come first (they need more time), then the oldest meeting. */
function remeetCandidates(world: World, seat: number, ask: SlotAsk, atTick: number): number[] {
  if (!takesRemeetings(ask)) return [];
  const [lo, hi] = fallbackStages(ask)[1]!.lengths;
  const out: number[] = [];
  world.header.deck.forEach((word, index) => {
    if (word.group === "new" && world.words.kitOf[index]! >= 0 && word.text.length >= lo && word.text.length <= hi && remeetDue(world, seat, index, atTick)) out.push(index);
  });
  return out.sort((a, b) => {
    const ua = deckUseOf(world, seat, a);
    const ub = deckUseOf(world, seat, b);
    return ua.meetings - ub.meetings || ua.lastMeetTick - ub.lastMeetTick || a - b;
  });
}

/** Fresh new words for ô 4, those of the exact length first. */
function freshCandidates(world: World, seat: number, ask: SlotAsk): number[] {
  if (!takesFreshNew(ask) || !freshNewAllowed(world, seat)) return [];
  const [elo, ehi] = slotLengths(ask);
  const [lo, hi] = fallbackStages(ask)[1]!.lengths;
  const exact: number[] = [];
  const wide: number[] = [];
  world.header.deck.forEach((word, index) => {
    if (word.group !== "new" || world.words.kitOf[index]! < 0 || deckUseOf(world, seat, index).meetings > 0) return;
    const length = word.text.length;
    if (length >= elo && length <= ehi) exact.push(index);
    else if (length >= lo && length <= hi) wide.push(index);
  });
  return [...exact, ...wide];
}

/** The step a non-new word fits the ask at now, or null. */
function stepFor(world: World, seat: number, ask: SlotAsk, deck: number): FallbackStage | null {
  const word = world.header.deck[deck]!;
  if (word.group === "new") return null;
  for (const stage of fallbackStages(ask)) if (stageAccepts(stage, ask, word, deckUseOf(world, seat, deck).meetings)) return stage;
  return null;
}

/** The word to show dim while `entry` cools down (canon §6.2): a best guess, dealt first when the slot is ready if it still fits. */
function peekNext(world: World, entry: LiveWord): number {
  // Ô 5 shows its word only once Chân Nguyên is full (canon §6.3).
  if (entry.slot === 5) return -1;
  const seat = entry.seat;
  const ask = askOf(world, entry);
  const until = entry.until >= 0 ? entry.until : world.tick;
  const remeet = remeetCandidates(world, seat, ask, until);
  if (remeet.length > 0) return remeet[0]!;
  const fresh = freshCandidates(world, seat, ask);
  if (fresh.length > 0) return fresh[0]!;
  const reserved = reservedLetters(world, seat);
  for (const stage of fallbackStages(ask)) {
    const b = bagFor(world, seat, ask, stage);
    const order = world.words.bags[b]!;
    const next = world.words.bagNext[b]!;
    if (next >= order.length) continue;
    for (let at = next; at < order.length; at += 1) if ((reserved & letterBit(world, order[at]!)) === 0) return order[at]!;
    return order[next]!;
  }
  return -1;
}

/** Puts header deck word `deck` live on `entry`. */
function goLive(world: World, entry: LiveWord, deck: number, step: FallbackStep, bag: number): boolean {
  const w = world.words;
  const seat = entry.seat;
  const session = w.sessions[seat]!;
  const ledger = w.ledgers[seat]!;
  const source = sourceOf(entry);
  if (!ledger.canAdd(source)) return false;
  const kitSlot = addWord(session, w.kitOf[deck]!, kindIndex(kitKind(entry)), 1, world.tick, entry.index);
  if (kitSlot < 0) return false;
  ledger.add(source);
  if (bag >= 0) markDealt(world, bag, deck);
  const word = world.header.deck[deck]!;
  const use = deckUseOf(world, seat, deck);
  use.meetings += 1;
  use.lastMeetTick = world.tick;
  const first = word.group === "new" && use.meetings === 1;
  if (first) {
    use.firstSeenTick = world.tick;
    w.newUsed += 1;
  }
  entry.deck = deck;
  entry.wordId = word.wordId;
  entry.text = word.text;
  // A new word met again is shown and counted as "đang học" (canon §6.3).
  entry.group = word.group === "new" && !first ? "learning" : word.group;
  entry.assumed = word.assumed;
  entry.typed = 0;
  entry.errors = 0;
  entry.firstKeyTick = -1;
  entry.state = "ready";
  entry.until = -1;
  entry.next = -1;
  entry.kitSlot = kitSlot;
  entry.born = world.tick;
  entry.hint = meaningShown(world.preset, word, use.meetings);
  entry.jammed = false;
  entry.step = step;
  entry.firstLocked = false;
  const wall = wallTimes(world);
  wall.first[entry.index] = -1;
  wall.last[entry.index] = -1;
  if (word.assumed) world.stats.baseWordUses[baseUseIndex(entry)] = (world.stats.baseWordUses[baseUseIndex(entry)] ?? 0) + 1;
  if (ledger.total > world.stats.maxLiveWords) world.stats.maxLiveWords = ledger.total;
  out(world, {
    type: "word-assigned", seat, word: entry.index, kind: entry.kind, slot: entry.slot, wordId: word.wordId, text: word.text, group: entry.group,
    assumed: word.assumed, beast: entry.beast, node: entry.node,
  });
  if (first) out(world, { type: "word-first-seen", seat, wordId: word.wordId, channel: "slot4" });
  return true;
}

/** Deals `entry` a word now; false (a jam, counted once) when none fits. */
function tryDeal(world: World, entry: LiveWord): boolean {
  const w = world.words;
  const seat = entry.seat;
  const session = w.sessions[seat]!;
  const ask = askOf(world, entry);
  const free = session.letters.free(world.tick, 0);
  const kind = kindIndex(kitKind(entry));
  const kitDeck = session.deck;
  const open = (deck: number): boolean => session.letters.tierOf(kitDeck, session.words, kitDeck.letters[kitDeck.start[w.kitOf[deck]!]!]!, -1, kind, world.tick, 0, free) === 1;
  const claim = (deck: number): boolean => session.letters.claim(kitDeck, session.words, w.kitOf[deck]!, kind, world.tick, 0, -1, free) === 1;
  let blockedByLetters = false;

  // 1. The preview shown while it cooled down.
  const preview = entry.next;
  entry.next = -1;
  if (preview >= 0 && w.kitOf[preview]! >= 0) {
    const word = world.header.deck[preview]!;
    let step: FallbackStep | null = null;
    let bag = -1;
    if (word.group === "new") {
      const meetings = deckUseOf(world, seat, preview).meetings;
      if (meetings === 0 ? freshCandidates(world, seat, ask).includes(preview) : remeetCandidates(world, seat, ask, world.tick).includes(preview)) step = "exact";
    } else {
      const stage = stepFor(world, seat, ask, preview);
      if (stage !== null) {
        step = stage.step;
        bag = bagFor(world, seat, ask, stage);
      }
    }
    if (step !== null) {
      if (claim(preview)) return goLive(world, entry, preview, step, bag);
      blockedByLetters = true;
    }
  }

  // 2. New words of this match due again (ô 2, ô 4), then 3. a fresh new word (ô 4).
  for (const list of [remeetCandidates(world, seat, ask, world.tick), freshCandidates(world, seat, ask)]) {
    let tried = 0;
    for (const deck of list) {
      if (tried >= IC_RULES.picker.tries) break;
      if (!open(deck)) {
        blockedByLetters = true;
        continue;
      }
      tried += 1;
      if (claim(deck)) return goLive(world, entry, deck, "exact", -1);
      blockedByLetters = true;
    }
  }

  // 4. The slot's bags, step by step (canon §6.2), passing over letters pending new words need.
  const reserved = reservedLetters(world, seat);
  const prefer = (deck: number): boolean => (reserved & letterBit(world, deck)) === 0;
  for (const stage of fallbackStages(ask)) {
    const b = bagFor(world, seat, ask, stage);
    if (w.bags[b]!.length === 0) continue;
    const deck = pickFromBag(world, b, open, claim, prefer);
    if (deck >= 0) return goLive(world, entry, deck, stage.step, -1);
    blockedByLetters = true;
  }

  // 5. Nghẽn: the entry waits dim.
  if (!entry.jammed) {
    entry.jammed = true;
    world.stats.fallbackJams += 1;
    if (blockedByLetters) world.stats.firstLetterJams += 1;
  }
  return false;
}

/** Entries of a seat in canon §6.2 priority: Tẩy, the first Ấn, ô 3, ô 1, ô 2, ô 5, ô 4 (Học: ô 4 before ô 5), the second Ấn. */
function priorityList(world: World, seat: number): number[] {
  const words = world.words.seats[seat]!;
  const slot = (n: SlotId): number => words.slots[n]!;
  const list: number[] = [];
  if (words.cleanse >= 0) list.push(words.cleanse);
  if (words.seals.length > 0) list.push(words.seals[0]!);
  list.push(slot(3), slot(1), slot(2));
  if (world.preset === "learn") list.push(slot(4), slot(5));
  else list.push(slot(5), slot(4));
  for (const seal of words.seals.slice(1)) list.push(seal);
  return list;
}

/** Fills waiting entries by priority within the cap; an urgent word or the first Ấn takes the place of the lowest untouched word. */
function allocate(world: World, seat: number): void {
  const w = world.words;
  if (!w.awake[seat]) return;
  const ledger = w.ledgers[seat]!;
  const list = priorityList(world, seat);
  const locked = lockedIndex(world, seat);
  for (let p = 0; p < list.length; p += 1) {
    const entry = w.live[list[p]!]!;
    if (entry.state !== "waiting") continue;
    if (ledger.total >= ledger.budget.total) {
      const urgent = entry.kind === "cleanse" || (entry.kind === "seal" && w.seats[seat]!.seals[0] === entry.index);
      if (!urgent) continue;
      let victim = -1;
      for (let q = list.length - 1; q > p; q -= 1) {
        const other = w.live[list[q]!]!;
        if (isLive(other) && other.typed === 0 && other.index !== locked) {
          victim = other.index;
          break;
        }
      }
      if (victim < 0) continue;
      const loser = w.live[victim]!;
      const keep = loser.deck;
      dropLive(world, loser, "replaced");
      loser.state = "waiting";
      loser.next = keep;
    }
    tryDeal(world, entry);
  }
}

// ── Releasing ──────────────────────────────────────────────────────────────

/** Takes a live word out of the seat's session: its letter rests 1 s, a lock on it goes, the ledger gets the place back. */
function dropLive(world: World, entry: LiveWord, reason: WordReleaseReason): void {
  if (!isLive(entry)) return;
  const w = world.words;
  const seat = entry.seat;
  const session = w.sessions[seat]!;
  const letter = session.deck.letters[session.deck.start[session.words.word[entry.kitSlot]!]!]!;
  dropWord(session, entry.kitSlot, world.tick);
  w.ledgers[seat]!.remove(sourceOf(entry));
  w.letterRest[seat * 26 + letter] = session.letters.freeAt[letter]!;
  entry.kitSlot = -1;
  entry.typed = 0;
  entry.errors = 0;
  entry.firstKeyTick = -1;
  entry.born = -1;
  w.seats[seat]!.locked = lockedIndex(world, seat);
  out(world, { type: "word-released", seat, word: entry.index, reason });
}

/** An Ấn or Tẩy place goes back to `free`; the beast or node forgets it. */
function unbind(world: World, entry: LiveWord): void {
  const w = world.words;
  const words = w.seats[entry.seat]!;
  if (entry.kind === "seal") {
    const at = words.seals.indexOf(entry.index);
    if (at >= 0) words.seals.splice(at, 1);
    const beast = entry.beast !== null ? liveBeast(world, entry.beast) : null;
    if (beast !== null && beast.seal === entry.index) beast.seal = -1;
  } else if (entry.kind === "cleanse") {
    if (words.cleanse === entry.index) words.cleanse = -1;
    const node = world.formation?.nodes.find((item) => item.id === entry.node);
    if (node !== undefined && node.cleanse === entry.index) node.cleanse = -1;
  } else return;
  entry.beast = null;
  entry.node = null;
  entry.deck = -1;
  entry.wordId = "";
  entry.text = "";
  entry.state = "dim";
  entry.until = -1;
  entry.next = -1;
  entry.jammed = false;
  if (!w.free.includes(entry.index)) w.free.push(entry.index);
}

export function releaseWord(world: World, word: number, reason: WordReleaseReason): void {
  const entry = world.words.live[word];
  if (entry === undefined) return;
  dropLive(world, entry, reason);
  if (entry.kind !== "slot") unbind(world, entry);
  else if (entry.state === "ready" || entry.state === "typing") entry.state = world.words.awake[entry.seat] ? "waiting" : "dim";
  allocate(world, entry.seat);
}

/** The Bàn Quyết of `seat` stops (phase or down): live words leave (a word being typed as with Esc), entries dim; bindings stay. */
function sleepSeat(world: World, seat: number, reason: WordReleaseReason): void {
  const w = world.words;
  unlock(w.sessions[seat]!);
  for (let j = 0; j < ENTRIES_PER_SEAT; j += 1) {
    const entry = w.live[seat * ENTRIES_PER_SEAT + j]!;
    dropLive(world, entry, reason);
    if (entry.state !== "held") entry.state = "dim";
    entry.next = -1;
  }
  w.seats[seat]!.locked = -1;
  w.awake[seat] = false;
}

/** The Bàn Quyết of `seat` comes alive: slots out of cooldown and bound Ấn, Tẩy wait for words. */
function wakeSeat(world: World, seat: number): void {
  const w = world.words;
  w.awake[seat] = true;
  for (let j = 0; j < ENTRIES_PER_SEAT; j += 1) {
    const entry = w.live[seat * ENTRIES_PER_SEAT + j]!;
    if (entry.state !== "dim") continue;
    if (entry.kind === "slot") {
      const ready = entry.slot === 5 ? chanFull(world, seat) : !(entry.until > world.tick);
      entry.state = ready ? "waiting" : "cooldown";
      if (entry.slot === 5) entry.until = -1;
      if (!ready) entry.next = peekNext(world, entry);
    } else if (entry.beast !== null || entry.node !== null) entry.state = "waiting";
  }
}

// ── Casts coming back ──────────────────────────────────────────────────────

/** Cooldown end of a slot after a resolved Cast: Lane 4's `cooldownUntil` when it set one, else rules.ts SLOTS; −1 for ô 5. */
function cooldownEnd(world: World, seat: number, slot: SlotId): number {
  if (slot === 5) return -1;
  const lane4 = world.skills?.seats?.[seat]?.cooldownUntil?.[slot];
  if (typeof lane4 === "number" && lane4 >= world.tick) return lane4;
  const ms = slot === 3 && world.seats[seat]?.loadout.guard === "dash" ? SLOT3_DASH_COOLDOWN_MS : SLOTS[slot].cooldownMs;
  return world.tick + ticksOf(ms);
}

/** cast.ts calls this when a slot's Cast is held, resolved or fizzled (Ấn, Tẩy places were freed at completion). */
export function onCastSettled(world: World, cast: { readonly seat: number; readonly slot: SlotId | "seal" | "cleanse"; readonly heldUntil: number }, outcome: "held" | "resolved" | "fizzled"): void {
  if (typeof cast.slot !== "number") return;
  const entry = slotEntry(world, cast.seat, cast.slot);
  if (entry === null) return;
  const awake = world.words.awake[cast.seat] === true;
  if (outcome === "held") {
    entry.state = "held";
    entry.until = cast.heldUntil;
    return;
  }
  // Fizzled: the slot takes its next word at once, no cooldown (canon §6.1).
  entry.until = outcome === "resolved" ? cooldownEnd(world, cast.seat, cast.slot) : -1;
  if (!awake) {
    entry.state = "dim";
    return;
  }
  const ready = outcome === "fizzled" || (cast.slot === 5 ? chanFull(world, cast.seat) : entry.until <= world.tick);
  if (ready) {
    entry.state = "waiting";
    allocate(world, cast.seat);
  } else {
    entry.state = "cooldown";
    entry.next = peekNext(world, entry);
  }
}

// ── Keys ───────────────────────────────────────────────────────────────────

/** Copies the session's numbers of a live word onto its entry (readers read LiveWord only). */
function sync(world: World, entry: LiveWord): void {
  if (!isLive(entry)) return;
  const session = world.words.sessions[entry.seat]!;
  entry.typed = session.words.typed[entry.kitSlot]!;
  entry.errors = session.words.errors[entry.kitSlot]!;
  entry.firstKeyTick = session.words.firstTick[entry.kitSlot]!;
  entry.state = entry.typed > 0 || session.router.lock === entry.kitSlot ? "typing" : "ready";
}

const entryOfKitSlot = (world: World, seat: number, kitSlot: number): LiveWord | null =>
  kitSlot >= 0 ? (world.words.live[world.words.sessions[seat]!.words.owner[kitSlot]!] ?? null) : null;

/** A letter key, a–z as 0–25; `ms` is wall time for learning only. Emits `word-progress`, and on completion `grade`, `word-complete`, then the Cast. */
export function typeKey(world: World, command: Extract<SimCommand, { type: "key" }>): void {
  const w = world.words;
  const seat = command.seat;
  const letter = command.letter;
  const session = w.sessions[seat];
  if (session === undefined || !Number.isInteger(letter) || letter < 0 || letter > 25) return;
  if (world.wall.lastKeyMs[seat] !== undefined) world.wall.lastKeyMs[seat] = command.ms;
  if (!w.awake[seat] || !isBanQuyetLive(world, seat)) {
    out(world, { type: "word-progress", seat, word: -1, typed: 0, result: "asleep", letter });
    return;
  }
  world.stats.keys += 1;
  const previousKey = w.lastKeyTick[seat]!;
  w.lastKeyTick[seat] = world.tick;
  const before = entryOfKitSlot(world, seat, session.router.lock);
  const { result, slot } = typeLetter(session, letter, world.tick);
  const entry = entryOfKitSlot(world, seat, slot);
  const wall = wallTimes(world);
  switch (result) {
    case KEY.forgiven:
      break;
    case KEY.done:
      if (entry !== null) complete(world, entry, command);
      break;
    case KEY.wrong:
      world.stats.wrongKeys += 1;
      if (entry !== null) {
        sync(world, entry);
        out(world, { type: "word-progress", seat, word: entry.index, typed: entry.typed, result: "wrong", letter });
      }
      break;
    case KEY.lock:
    case KEY.switch:
    case KEY.advance: {
      if (result === KEY.switch && before !== null) {
        // The soft switch: the first word goes back to untyped, unpunished.
        sync(world, before);
        wall.first[before.index] = -1;
        wall.last[before.index] = -1;
        out(world, { type: "word-progress", seat, word: before.index, typed: 0, result: "back", letter });
      }
      if (entry === null) break;
      sync(world, entry);
      if (result !== KEY.advance) {
        wall.first[entry.index] = command.ms;
        if (!entry.firstLocked) {
          entry.firstLocked = true;
          // A fresh new word slow to start keeps further new words away this wave (canon §6.4): the pause before
          // its first key, counted from the seat's previous key or from when it appeared, whichever is later.
          if (entry.group === "new" && world.tick - Math.max(entry.born, previousKey) > SLOW_RECOGNIZE_TICKS) w.newPauseWave[seat] = wordsWave(world);
        }
      }
      wall.last[entry.index] = command.ms;
      out(world, { type: "word-progress", seat, word: entry.index, typed: entry.typed, result: result === KEY.advance ? "advance" : "lock", letter });
      break;
    }
    default:
      // A stray key (tier-2 pairs never open: a pair key is a stray too).
      session.router.group = -1;
      world.stats.strayKeys += 1;
      out(world, { type: "word-progress", seat, word: -1, typed: 0, result: "stray", letter });
  }
  w.seats[seat]!.locked = lockedIndex(world, seat);
}

/** A finished word: grade, learning flags, out of the session, then exactly one Cast (canon §6.1). */
function complete(world: World, entry: LiveWord, command: Extract<SimCommand, { type: "key" }>): void {
  const w = world.words;
  const seat = entry.seat;
  const session = w.sessions[seat]!;
  const timing = wordTiming(session, entry.kitSlot, world.tick);
  const grade = gradeOf({ errors: timing.errors, letters: timing.len, keyTicks: timing.typing, expectedTicks: expectedTicks(timing.len, w.flashE[seat]!) });
  world.stats.words += 1;
  const gradeIndex = GRADES.indexOf(grade);
  world.stats.grades[gradeIndex] = (world.stats.grades[gradeIndex] ?? 0) + 1;
  const use = deckUseOf(world, seat, entry.deck);
  const scored = !use.scored;
  use.scored = true;
  const wall = wallTimes(world);
  const firstMs = wall.first[entry.index] ?? -1;
  const responseMs = firstMs >= 0 && command.ms >= firstMs ? command.ms - firstMs : msOf(timing.typing);
  const beast = entry.beast !== null ? liveBeast(world, entry.beast) : null;
  out(world, { type: "grade", seat, word: entry.index, grade, mqPm: mqPm(grade) });
  out(world, {
    type: "word-complete", seat, word: entry.index, wordId: entry.wordId, text: entry.text, grade, errors: timing.errors, keyTicks: timing.typing,
    responseMs, activity: activityFor(entry.kind, beast?.boss === true), scored, hintUsed: entry.hint, channel: "typing",
  });
  const wordId = entry.wordId;
  const target = entry.beast;
  const node = entry.node;
  const castSlot = entry.kind === "slot" ? entry.slot! : entry.kind;
  dropLive(world, entry, "done");
  wall.first[entry.index] = -1;
  wall.last[entry.index] = -1;
  if (entry.kind === "slot") {
    entry.state = "held";
    entry.until = -1;
  } else unbind(world, entry);
  emitCast(world, {
    seat,
    slot: castSlot,
    actionId: nextActionId(world, seat),
    wordId,
    tick: world.tick,
    channel: "typing",
    quality: grade,
    origin: command.origin,
    aim: command.aim,
    state: "held",
    heldUntil: -1,
    target,
    node,
  });
  if (castSlot === "seal" || castSlot === "cleanse") allocate(world, seat);
}

/** Backspace: one letter back on the locked word (errors stay). */
export function typeBackspace(world: World, seat: number): void {
  const w = world.words;
  const session = w.sessions[seat];
  if (session === undefined || !w.awake[seat] || !isBanQuyetLive(world, seat)) return;
  const before = entryOfKitSlot(world, seat, session.router.lock);
  if (!kitBackspace(session)) return;
  if (before !== null) {
    sync(world, before);
    out(world, { type: "word-progress", seat, word: before.index, typed: before.typed, result: "back", letter: -1 });
  }
  w.seats[seat]!.locked = lockedIndex(world, seat);
}

/** Esc while locked: drop typed letters, keep the error count (D19). */
export function releaseLock(world: World, seat: number): void {
  const w = world.words;
  const session = w.sessions[seat];
  if (session === undefined) return;
  const before = entryOfKitSlot(world, seat, session.router.lock);
  if (!unlock(session)) return;
  w.seats[seat]!.locked = -1;
  if (before === null) return;
  sync(world, before);
  const wall = wallTimes(world);
  wall.first[before.index] = -1;
  wall.last[before.index] = -1;
  out(world, { type: "word-progress", seat, word: before.index, typed: 0, result: "back", letter: -1 });
}

// ── Dealing on request (Lane 4, Lane 5) ────────────────────────────────────

/** A slot is ready again (cooldown over, Chân Nguyên full for ô 5): deal its word. Idempotent; the step finds ready slots by itself too. */
export function dealSlotWord(world: World, seat: number, slot: SlotId): void {
  const entry = slotEntry(world, seat, slot);
  if (entry === null || entry.state !== "cooldown") return;
  entry.state = "waiting";
  allocate(world, seat);
}

/** A free Ấn or Tẩy place of the seat, bound to its target. */
function bindPlace(world: World, seat: number, kind: WordSlotKind, places: readonly number[]): LiveWord | null {
  const w = world.words;
  for (const j of places) {
    const index = seat * ENTRIES_PER_SEAT + j;
    const at = w.free.indexOf(index);
    if (at < 0) continue;
    w.free.splice(at, 1);
    const entry = w.live[index]!;
    entry.kind = kind;
    entry.state = w.awake[seat] ? "waiting" : "dim";
    entry.jammed = false;
    entry.next = -1;
    return entry;
  }
  return null;
}

/** An Ấn on an elite, general or boss (never a new word): its word index, or −1 when the seat has 2 Ấn or the beast is gone. */
export function dealSeal(world: World, seat: number, beast: BeastRef): number {
  const w = world.words;
  const words = w.seats[seat];
  const target = liveBeast(world, beast);
  if (words === undefined || target === null) return -1;
  for (const index of words.seals) if (sameBeast(w.live[index]!.beast, beast)) return index;
  const entry = bindPlace(world, seat, "seal", SEAL_ENTRIES);
  if (entry === null) return -1;
  entry.beast = { slot: target.slot, serial: target.serial };
  entry.node = null;
  words.seals.push(entry.index);
  target.seal = entry.index;
  allocate(world, seat);
  return entry.index;
}

/** Tẩy on a captured node: its word index, or −1 when the seat already has one for another node. */
export function dealCleanse(world: World, seat: number, node: NodeId): number {
  const w = world.words;
  const words = w.seats[seat];
  if (words === undefined) return -1;
  if (words.cleanse >= 0) return w.live[words.cleanse]!.node === node ? words.cleanse : -1;
  const entry = bindPlace(world, seat, "cleanse", [CLEANSE_ENTRY]);
  if (entry === null) return -1;
  entry.node = node;
  entry.beast = null;
  words.cleanse = entry.index;
  const state = world.formation?.nodes.find((item) => item.id === node);
  if (state !== undefined) state.cleanse = entry.index;
  allocate(world, seat);
  return entry.index;
}

// ── Other commands ─────────────────────────────────────────────────────────

/**
 * Học trước typed one of this match's new words in prep (the `learn-ahead`
 * command; Lane 4 pays its Linh Sa): its first meeting, through the ledger
 * (`word-first-seen` channel "learn-ahead", canon §6.4). A wrong answer is a
 * meeting too (the word, IPA and meaning were on screen). CHANGE REQUEST
 * (Lane 2): world.ts applyCommand "learn-ahead" calls this before paying.
 */
export function onLearnAhead(world: World, command: Extract<SimCommand, { type: "learn-ahead" }>): void {
  if (world.phase !== "prep" || world.words.sessions[command.seat] === undefined) return;
  const deck = world.header.deck.findIndex((word) => word.wordId === command.wordId && word.group === "new");
  if (deck < 0) return;
  const use = deckUseOf(world, command.seat, deck);
  if (use.meetings > 0 || world.words.newUsed >= world.newWordAllowance) return;
  use.meetings = 1;
  use.lastMeetTick = world.tick;
  use.firstSeenTick = world.tick;
  world.words.newUsed += 1;
  out(world, { type: "word-first-seen", seat: command.seat, wordId: command.wordId, channel: "learn-ahead" });
}

// ── The step and cleanup ───────────────────────────────────────────────────

/** Wakes or sleeps each seat's Bàn Quyết, ends cooldowns, fills places by priority. */
export function stepWords(world: World): void {
  const w = world.words;
  for (let seat = 0; seat < w.sessions.length; seat += 1) {
    if (!isBanQuyetLive(world, seat)) {
      if (w.awake[seat]) sleepSeat(world, seat, LIVE_PHASES.has(world.phase) ? "down" : "phase");
      continue;
    }
    if (!w.awake[seat]) wakeSeat(world, seat);
    for (const slot of [1, 2, 3, 4, 5] as const) {
      const entry = slotEntry(world, seat, slot)!;
      if (entry.state !== "cooldown") continue;
      if (slot === 5 ? chanFull(world, seat) : entry.until >= 0 && world.tick >= entry.until) entry.state = "waiting";
    }
    allocate(world, seat);
  }
}

/** Cleanup: release the Ấn of a dead beast; a soft target on it goes. */
export function onBeastGone(world: World, beast: BeastState): void {
  const w = world.words;
  const ref = { slot: beast.slot, serial: beast.serial };
  for (let seat = 0; seat < w.seats.length; seat += 1) {
    for (const index of [...w.seats[seat]!.seals]) if (sameBeast(w.live[index]!.beast, ref)) releaseWord(world, index, "target-gone");
    const state = world.seats[seat];
    if (state !== undefined && state.softTarget !== null && sameBeast(state.softTarget, ref)) state.softTarget = null;
  }
}

/** The seat went down: release its typing (as Esc) and dim the bar. */
export function onSeatDown(world: World, seat: number): void {
  if (world.words.awake[seat]) sleepSeat(world, seat, "down");
}

/** Live word indexes of a seat in entry order (UI, bots). */
export function liveWords(world: World, seat: number): LiveWord[] {
  return world.words.live.filter((entry) => entry.seat === seat && isLive(entry));
}

/** The deck word a live or dim entry shows (its word, or the dim preview while it cools down). */
export function shownWord(world: World, entry: LiveWord): DeckWord | null {
  const deck = isLive(entry) || entry.state === "held" ? entry.deck : entry.next;
  return deck >= 0 ? (world.header.deck[deck] ?? null) : null;
}

/** Words of `group` met this match by `seat` (reports, HC8). */
export function metWords(world: World, seat: number, group: WordGroup): { readonly wordId: string; readonly meetings: number }[] {
  return world.header.deck.flatMap((word, index) => (word.group === group && deckUseOf(world, seat, index).meetings > 0 ? [{ wordId: word.wordId, meetings: deckUseOf(world, seat, index).meetings }] : []));
}

/** Entry position 0–7 inside its seat (UI). */
export const entryPosition = entryJ;
