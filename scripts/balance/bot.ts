// Source: games/dragon-hold/scripts/balance/bot.ts @06cd4e6 runBot (adapted: the page's match runner (src/app/match.ts) with the `local` layer, the kit's HumanTypist and KeyPlayer driving the Bàn Quyết through real `key` commands, Học trước, Thẻ Ôn, shop and đan phù commands, dry-run learning drafts (D43), the replay tail as the golden hashes)
/**
 * One headless bot match (canon §18.3, M0A_PLAN §6.7), through the same path
 * as the page: the header the page would write (header.ts), the page's match
 * runner (src/app/match.ts: commands into the world at once, the `local`
 * layer before each world tick, the replay log and its tail of hashWorld and
 * hashLocal every 600 ticks and at the end), and the same commands a keyboard
 * sends: `key` letters with `origin` and no `aim` (ground skills take the
 * densest cluster in reach), `release` (Esc), `backspace`, `consumable`
 * (keys 1/2/3), the shop, `learn-ahead`, `review-card`, `start`, `continue`,
 * and Cơ động's right clicks (`move-to`). Đứng yên sends no local input.
 *
 * Typing: the kit's HumanTypist plans each word (recognition by familiarity,
 * a log-normal speed around E with CV, wrong keys at 1 − a, Backspace, a
 * dropped lock now and then, crowd and fatigue); a correct key sends the
 * letter the word needs now; a wrong one sends the plan's wrong letter (it
 * never enters the word: kit session), a Backspace takes back a right letter
 * (owed again at the word's pace), a dropped lock is Esc. A plan ends when
 * its word is finished or gone.
 *
 * Learning: a dry-run, bot-marked learning session (app/learning.ts) builds
 * every event as the page would and never sends one (canon §17.2, D43).
 * The bot's dice are its own stream from the run seed and the bot id, never
 * the world's. Script side.
 * Owner: Lane 7.
 */
import { createMatchRunner, type MatchRunner } from "../../src/app/match";
import { createLearning, createLearningQueue, learnAheadWords, learningRuleProblems, type IcLearningEvent, type LearningSession } from "../../src/app/learning";
import { PRESETS } from "../../src/content/rules";
import type { Familiarity } from "../../src/kit/balance/profile";
import { HumanTypist, KeyPlayer, botParams, type KeyEvent } from "../../src/kit/balance/typist";
import type { FlowOutcome } from "../../src/kit/balance/flow";
import type { LiveWord, LocalState, Preset, ReplayHashes, ReplayHeader, SimCommand, SimEvent, StageDef, World } from "../../src/content/types";
import { createRng, type RngStream } from "../../src/kit/platform/rng";
import { starsFor } from "../../src/sim/waves";
import { isBanQuyetLive } from "../../src/sim/words";
import { createNewWordLedger } from "../../src/typing/new-word-ledger";
import { botProfile, type IcBot } from "./bots";
import { botHeader } from "./header";
import { RunMeter, type RunMetrics } from "./meter";
import { consumableToUse, isTypeable, mobileGoal, newPickState, nextPurchase, originOf, pickWord, softTargetFor, threatOn } from "./policy";
import { BOT_VOCAB_LEVEL, glossOf } from "./vocab";
import type { DeckSource } from "../../src/app/learning";

const SEAT = 0;
export const TICK_MS = 1000 / 60;
/** Default cap: 40 sim minutes (the stage takes about 10). */
export const DEFAULT_MAX_TICKS = 40 * 60 * 60;
/** A wave still running after this long is a stall (no system ends it). */
const STALL_WAVE_TICKS = 10 * 60 * 60;
/** Bot wall clock for learning events (ISO dates), a fixed epoch: deterministic. */
const EPOCH_MS = Date.UTC(2026, 9, 25);

export interface RunOptions {
  readonly seed: number;
  readonly preset: Preset;
  readonly source: DeckSource;
  readonly maxTicks?: number;
  /** Keep the replay body (golden, ic replays). */
  readonly keepLog?: boolean;
  /** Time each world step (performance.now), the sim budget report. */
  readonly timeSteps?: boolean;
  /** No Học trước (as `?prelearn=0`). */
  readonly prelearn?: boolean;
  /** Called after each tick with its events (tests, calibrate.ts). */
  readonly onTick?: (world: World, events: readonly SimEvent[], local: LocalState) => void;
  /** Another stage (calibrate.ts's test field); default Thanh Thạch Ải. */
  readonly stage?: StageDef;
  /** Runs once on the new match before tick 0 (calibrate.ts). */
  readonly setup?: (runner: MatchRunner) => void;
  /** Play this header instead of building one (golden replays keep theirs, so a vocabulary change never moves them). */
  readonly header?: ReplayHeader;
}

export type RunResult = "victory" | "defeat" | "timeout" | "stalled";

export interface BotRun {
  readonly bot: string;
  readonly gateId: string;
  readonly director: boolean;
  readonly seed: number;
  readonly preset: Preset;
  readonly result: RunResult;
  readonly outcome: FlowOutcome;
  /** Waves whose end was handled; the wave when it ended. */
  readonly endedThrough: number;
  readonly wave: number;
  readonly heart: number;
  readonly heartMax: number;
  readonly stars: number;
  readonly metrics: RunMetrics;
  /** HC7: drafts, drafts that break a rule, the problems (first 10); the queue refused every draft. */
  readonly drafts: { readonly count: number; readonly bad: number; readonly problems: readonly string[]; readonly queued: number; readonly refused: number; readonly learnAheadNoHint: number };
  readonly typist: { readonly words: number; readonly releases: number; readonly backspaces: number; readonly wrong: number };
  readonly bought: Record<string, number>;
  readonly tail: readonly ReplayHashes[];
  readonly header: ReplayHeader;
  readonly log: readonly unknown[] | null;
  readonly steps: { meanUs: number; p95Us: number; maxUs: number; beastsMax: number } | null;
}

/** FNV-1a of a name: each bot its own dice on the same run seed (dragon-hold bot.ts). */
export function nameSeed(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) hash = Math.imul(hash ^ name.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

const familiarity = (entry: LiveWord): Familiarity => (entry.group === "new" ? "new" : entry.group === "known" ? "known" : "learning");

interface Plan {
  readonly entry: number;
  readonly wordId: string;
  readonly player: KeyPlayer;
  readonly start: number;
  /** Ticks per key at the plan's pace (keys owed after a Backspace). */
  readonly perKey: number;
  nextOwed: number;
}

/** The header of a bot's match (the page's, header.ts). */
export function headerFor(bot: IcBot, seed: number, preset: Preset, source: DeckSource, stage?: StageDef): ReplayHeader {
  return botHeader({
    seed, preset, pacing: bot.director, loadout: { guard: "ward", tamPhap: "kiem-tam" }, profile: botProfile(bot), records: source.records, level: BOT_VOCAB_LEVEL, dueCount: source.dueCount,
    ...(stage ? { stage } : {}),
  });
}

export function runBot(bot: IcBot, options: RunOptions): BotRun {
  const header = options.header ?? headerFor(bot, options.seed, options.preset, options.source, options.stage);
  const runner: MatchRunner = options.stage ? createMatchRunner(header, options.stage) : createMatchRunner(header);
  options.setup?.(runner);
  const world = runner.world;
  const local = runner.local;
  const dice = createRng((options.seed ^ nameSeed(bot.id)) >>> 0);
  const params = botParams(bot.kit, { tactics: bot.tactics });
  const typist = bot.kit.wpm > 0 ? new HumanTypist(params, dice.ai, 60) : null;
  const meter = new RunMeter(world);
  const gloss = glossOf(options.source);
  const ledger = createNewWordLedger({ v: 1, entries: [] });
  const learning: LearningSession = createLearning({ dryRun: true, bot: true, ledger, now: () => EPOCH_MS + Math.round(world.tick * TICK_MS), gloss, log: () => undefined });
  /** The Học trước drafts themselves (a later Thẻ Ôn review-card of the same word rightly has hintUsed false). */
  const learnAheadDrafts = new Set<IcLearningEvent>();
  const pick = newPickState();
  const noticed = new Map<number, boolean>();
  const isNoticed = (id: number): boolean => {
    let seen = noticed.get(id);
    if (seen === undefined) {
      seen = typist ? typist.handlesTelegraph() : dice.props.chance(params.reflex);
      noticed.set(id, seen);
    }
    return seen;
  };
  const lookAway = (): number => (typist ? typist.lookAway() : Math.round((params.lookAway[0] + dice.props.float() * (params.lookAway[1] - params.lookAway[0])) * 60));
  const maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
  const bought: Record<string, number> = {};
  const stats = { words: 0, releases: 0, backspaces: 0, wrong: 0 };
  const times: number[] = [];
  let beastsMax = 0;

  let plan: Plan | null = null;
  // Shop and phase flow.
  let shopVisit = "";
  let shopBought = 0;
  let nextShopAt = 0;
  let shopDone = false;
  let reviewed = 0;
  let nextConsumableAt = 0;
  let nextMoveAt = 0;
  let lastGoal: { x: number; z: number } | null = null;
  let waveStartedAt = -1;
  let result: RunResult | null = null;

  const send = (command: SimCommand): void => {
    if (command.type === "buy" || command.type === "place" || command.type === "upgrade") bought[command.type === "buy" ? command.item : command.type === "place" ? command.mech : "upgrade"] = (bought[command.type === "buy" ? command.item : command.type === "place" ? command.mech : "upgrade"] ?? 0) + 1;
    runner.send(command);
  };
  const keyCommand = (letter: number): SimCommand => ({ type: "key", seat: SEAT, letter, ms: Math.round(world.tick * TICK_MS), origin: originOf(local), aim: null });

  /** Học trước (prep, before the clock runs in the page): each new word typed, right with the bot's recall. */
  const learnAhead = (): void => {
    if (options.prelearn === false || bot.recall <= 0) return;
    for (const word of learnAheadWords(header.deck, gloss)) {
      const correct = dice.props.chance(bot.recall);
      const responseMs = Math.round(1000 + (word.text.length * 12_000) / Math.max(1, bot.kit.wpm));
      send({ type: "learn-ahead", seat: SEAT, wordId: word.wordId, correct });
      learnAheadDrafts.add(learning.learnAhead(word, correct, responseMs, correct ? word.text : word.text.slice(0, -1)));
    }
  };

  /** Thẻ Ôn in a break (the page holds the world while it is open): up to 3 answers. */
  const review = (wave: number): void => {
    if (bot.recall <= 0) return;
    for (const question of learning.reviewQuestions(wave)) {
      const correct = dice.props.chance(Math.max(0, bot.recall - 0.05));
      const responseMs = Math.round(1500 + (question.text.length * 12_000) / Math.max(1, bot.kit.wpm));
      send({ type: "review-card", seat: SEAT, wordId: question.wordId, correct });
      learning.review(question, correct, responseMs, question.kind === "meaning-pick" ? String(correct ? question.answer + 1 : ((question.answer + 1) % 3) + 1) : correct ? question.text : question.text.slice(0, -1));
    }
  };

  /** Prep and breaks: Học trước once, Thẻ Ôn once a break, purchases a look-away apart, then Enter where it waits. */
  const shop = (): void => {
    const visit = world.phase + ":" + world.waves.index;
    if (visit !== shopVisit) {
      shopVisit = visit;
      shopBought = 0;
      shopDone = false;
      nextShopAt = world.tick + lookAway();
      if (world.phase === "prep") learnAhead();
      if (world.phase === "break" && reviewed < world.waves.index) {
        reviewed = world.waves.index;
        review(world.waves.index);
      }
    }
    if (world.tick < nextShopAt) return;
    if (!shopDone) {
      const command = nextPurchase(world, bot, shopBought, dice.props);
      if (command !== null) {
        send(command);
        shopBought += 1;
        nextShopAt = world.tick + lookAway();
        return;
      }
      shopDone = true;
      nextShopAt = world.tick + lookAway();
      return;
    }
    if (world.phase === "prep") send({ type: "start" });
    else if (world.phase === "break" && PRESETS[world.preset].breakMs === "enter") send({ type: "continue" });
    nextShopAt = Number.MAX_SAFE_INTEGER;
  };

  const entryOf = (index: number): LiveWord | null => world.words.live[index] ?? null;

  /** One key of the plan (or an owed one), sent against the word as it stands now. */
  const playKey = (event: KeyEvent | null): boolean => {
    if (plan === null) return false;
    const entry = entryOf(plan.entry);
    if (entry === null || !isTypeable(entry) || entry.wordId !== plan.wordId) {
      plan = null;
      return false;
    }
    if (event === null || (event.kind === "key" && event.correct)) {
      send(keyCommand(entry.text.charCodeAt(entry.typed) - 97));
    } else if (event.kind === "key") {
      stats.wrong += 1;
      send(keyCommand(event.key.charCodeAt(0) - 97));
      // A wrong first key may lock another word: Esc, as a person would.
      const locked = world.words.seats[SEAT]!.locked;
      if (locked >= 0 && locked !== plan.entry) {
        send({ type: "release", seat: SEAT });
        meter.release();
        stats.releases += 1;
      }
    } else if (event.kind === "backspace") {
      if (entry.typed > 0 && world.words.seats[SEAT]!.locked === plan.entry) {
        send({ type: "backspace", seat: SEAT });
        stats.backspaces += 1;
      }
    } else {
      // A dropped lock: Esc (the errors stay, D19).
      if (world.words.seats[SEAT]!.locked >= 0) {
        send({ type: "release", seat: SEAT });
        meter.release();
        stats.releases += 1;
      }
      plan = null;
      return false;
    }
    const after = entryOf(plan.entry);
    if (after === null || !isTypeable(after) || after.wordId !== plan.wordId) {
      if (after !== null && after.wordId === plan.wordId && !isTypeable(after)) stats.words += 1;
      plan = null;
      return false;
    }
    return true;
  };

  const typing = (): void => {
    if (typist === null || local.down || !isBanQuyetLive(world, SEAT)) {
      plan = null;
      return;
    }
    if (plan !== null) {
      const entry = entryOf(plan.entry);
      if (entry === null || !isTypeable(entry) || entry.wordId !== plan.wordId) plan = null;
    }
    if (plan === null) {
      const threat = threatOn(world, local, undefined, isNoticed) >= 0;
      const entry = pickWord(world, local, bot, pick, dice.props, threat);
      if (entry === null) return;
      // Another word still holds the lock (it never should): Esc first.
      const locked = world.words.seats[SEAT]!.locked;
      if (locked >= 0 && locked !== entry.index) {
        send({ type: "release", seat: SEAT });
        meter.release();
        stats.releases += 1;
      }
      // A left click on the beast this word is for (ô 1, ô 2), by the typist's target mix.
      const soft = softTargetFor(world, local, entry, (options) => typist.choose(options));
      const current = world.seats[SEAT]!.softTarget;
      if (soft !== null && (current === null || current.slot !== soft.slot || current.serial !== soft.serial)) send({ type: "soft-target", seat: SEAT, beast: { slot: soft.slot, serial: soft.serial } });
      const rest = entry.text.slice(entry.typed);
      const live = world.words.live.filter((item) => item.seat === SEAT && isTypeable(item)).length;
      const word = typist.word(rest, { familiarity: familiarity(entry), live, minute: world.tick / 3600 });
      const perKey = Math.max(1, Math.round((12 / Math.max(1, typist.speed({ live, minute: world.tick / 3600 }))) * 60));
      plan = { entry: entry.index, wordId: entry.wordId, player: new KeyPlayer(word, world.tick), start: world.tick, perKey, nextOwed: -1 };
    }
    const current: Plan = plan;
    for (const event of current.player.due(world.tick)) if (!playKey(event)) return;
    if (plan !== current) return;
    if (current.player.done) {
      // Keys still owed (a Backspace took one back): at the word's pace.
      if (current.nextOwed < 0) current.nextOwed = world.tick + current.perKey;
      if (world.tick >= current.nextOwed) {
        current.nextOwed = world.tick + current.perKey;
        playKey(null);
      }
      // A word that never finishes (it cannot: guard) is let go after 20 s.
      if (plan === current && world.tick - current.start > 20 * 60) {
        send({ type: "release", seat: SEAT });
        meter.release();
        stats.releases += 1;
        plan = null;
      }
    }
  };

  const fight = (): void => {
    if (world.tick >= nextConsumableAt && bot.buy !== "none") {
      nextConsumableAt = world.tick + 30;
      const threat = threatOn(world, local, undefined, isNoticed) >= 0;
      const command = consumableToUse(world, local, threat);
      if (command !== null) {
        send(command);
        nextConsumableAt = world.tick + lookAway();
      }
    }
    if (bot.move === "mobile" && world.tick >= nextMoveAt) {
      nextMoveAt = world.tick + 20;
      const goal = mobileGoal(world, local, isNoticed);
      if (goal !== null && (lastGoal === null || Math.abs(goal.x - lastGoal.x) + Math.abs(goal.z - lastGoal.z) > 60_000)) {
        runner.input({ type: "move-to", point: goal });
        lastGoal = goal;
      }
    }
  };

  while (!runner.finished && world.tick < maxTicks) {
    if (world.phase === "prep" || world.phase === "break") shop();
    else fight();
    typing();
    const started = options.timeSteps === true ? performance.now() : 0;
    runner.tick();
    if (options.timeSteps === true) {
      times.push(performance.now() - started);
      if (world.beasts.live > beastsMax) beastsMax = world.beasts.live;
    }
    const events = runner.drain();
    learning.onEvents(events, world);
    meter.tick(world, local, events);
    options.onTick?.(world, events, local);
    if (world.phase === "wave") {
      if (waveStartedAt < 0) waveStartedAt = world.tick;
      else if (world.tick - waveStartedAt > STALL_WAVE_TICKS) {
        result = "stalled";
        break;
      }
    } else waveStartedAt = -1;
  }
  if (!runner.finished) runner.stop();
  result ??= world.phase === "victory" ? "victory" : world.phase === "defeat" ? "defeat" : "timeout";
  const outcome: FlowOutcome = result === "victory" ? "won" : result === "defeat" ? "lost" : "quit";
  const metrics = meter.finish(world, local, outcome);

  // HC7: the drafts by canon §17's rules (Lane 3's checker; its Học trước rule is checked on the Học trước drafts
  // only, since it would also flag a later Thẻ Ôn review-card of the same word); then every draft offered to a
  // queue, which must refuse them all.
  const drafts: readonly IcLearningEvent[] = learning.drafts;
  const problems = learningRuleProblems(drafts);
  const badIds = new Set(problems.map((line) => line.split(":")[0]));
  let refused = 0;
  let queued = 0;
  const queue = createLearningQueue(
    () => void (queued += 1),
    () => undefined,
  );
  for (const draft of drafts) if (!queue.push(draft)) refused += 1;
  const learnAheadNoHint = [...learnAheadDrafts].filter((draft) => draft.activityType !== "review-card" || draft.hintUsed !== true).length;
  learning.dispose();
  const sorted = [...times].sort((a, b) => a - b);
  return {
    bot: bot.id,
    gateId: bot.gateId,
    director: bot.director,
    seed: options.seed,
    preset: options.preset,
    result,
    outcome,
    endedThrough: world.waves.endedThrough,
    wave: world.waves.index,
    heart: world.formation.heart,
    heartMax: world.formation.heartMax,
    stars: result === "victory" ? starsFor(world) : 0,
    metrics,
    drafts: {
      count: drafts.length,
      bad: drafts.filter((draft) => badIds.has(draft.entityId)).length,
      problems: problems.slice(0, 10),
      queued: queued + learning.queue.sent,
      refused,
      learnAheadNoHint,
    },
    typist: stats,
    bought,
    tail: runner.tail.slice(),
    header,
    log: options.keepLog === true ? runner.log.slice() : null,
    steps:
      sorted.length === 0
        ? null
        : {
            meanUs: (sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 1000,
            p95Us: sorted[Math.floor(sorted.length * 0.95)]! * 1000,
            maxUs: sorted[sorted.length - 1]! * 1000,
            beastsMax,
          },
  };
}

export type { RngStream };
