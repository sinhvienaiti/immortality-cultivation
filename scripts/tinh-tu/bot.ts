// Tĩnh Tu bots (canon §16, §18.3, §18.4 HC4–HC7, M0A_PLAN §6.8.6): kit
// HumanTypist hands playing a session through its real key commands. The
// Chuẩn policy types Minh (untyped first), then Thường, never a labelled Tâm
// ma; in Tham Ngộ it judges every plain slip by the lesson's topic group,
// misreading at the typist's error rate (1 − a). "type-all" types every slip,
// Tâm ma included; "no-type" never types. Bots only build dry-run learning
// drafts, never sent (canon §17.2, D43).
// Owner: Lane 8.
import { effectiveE } from "../../src/kit/balance/pace";
import type { Familiarity } from "../../src/kit/balance/profile";
import { HumanTypist, botParams, type BotId, type KeyEvent, type TypistParams } from "../../src/kit/balance/typist";
import { createRng, type RngStream } from "../../src/kit/platform/rng";
import { khauQuyetDraft, sessionDrafts, type DraftRecord } from "../../src/tinh-tu/sim/learning";
import { NEW_PROGRESS, addSessionScore, buildPools, pretendRecords, sessionInit, type LessonDef, type LessonProgress } from "../../src/tinh-tu/sim/lesson";
import {
  createTinhTuSession,
  drainEvents,
  minhExpiryClashes,
  paperLook,
  stepTinhTu,
  summarize,
  type Paper,
  type SessionCommand,
  type SessionEvent,
  type SessionInit,
  type SessionSummary,
  type TinhTuSession,
  type TinhTuTier,
} from "../../src/tinh-tu/sim/session";
import { TRIAL_LESSONS, TRIAL_WORDS } from "../../src/tinh-tu/sim/trial-set";

export type TtPolicy = "standard" | "no-type" | "type-all";

export interface TtBot {
  readonly id: string;
  readonly label: string;
  readonly policy: TtPolicy;
  readonly params: TypistParams;
  /** E of the profile the session's lives are set from. */
  readonly profileWpm: number;
}

const bot = (id: string, label: string, base: BotId, wpm: number, policy: TtPolicy = "standard"): TtBot => {
  const params = botParams(base, { wpm });
  return { id, label, policy, params, profileWpm: wpm };
};

/** HC4: 15 / 25 / 35 / 60 / 90 WPM; a and CV of the kit's Trẻ em, Mới, Chuẩn, Nhanh rows. */
export const HC4_BOTS: readonly TtBot[] = [
  bot("wpm15", "15 WPM (Trẻ em)", "child", 15),
  bot("wpm25", "25 WPM (Mới)", "novice", 25),
  bot("wpm35", "35 WPM (Chuẩn)", "standard", 35),
  bot("wpm60", "60 WPM (a, CV của Nhanh)", "fast", 60),
  bot("wpm90", "90 WPM (a, CV của Nhanh)", "fast", 90),
];
export const STANDARD_BOT: TtBot = HC4_BOTS[2]!;
/** HC4b: never types; its sessions keep the Chuẩn profile's lives. */
export const NO_TYPE_BOT: TtBot = { ...bot("no-type", "Không gõ", "standard", 35, "no-type") };
/** HC4b report: types every slip, Tâm ma too (Chuẩn hands). */
export const TYPE_ALL_BOT: TtBot = bot("type-all", "Gõ mọi chữ (35 WPM)", "standard", 35, "type-all");

export const TIERS: readonly TinhTuTier[] = ["nhap-mon", "tham-ngo"];

/** The fallback trial records the page uses without a portal. */
export const TRIAL_RECORDS = pretendRecords(TRIAL_WORDS, TRIAL_LESSONS);

export interface SessionRun {
  readonly summary: SessionSummary;
  readonly drafts: readonly DraftRecord[];
  /** HC5: Minh expiries closer than 1.5 s. */
  readonly clashes: number;
  readonly tamMaIds: readonly string[];
  /** Tâm ma typed that showed without a label (Tham Ngộ). */
  readonly wrongUnlabelled: number;
  /** Plain slips the bot judged against their real kind. */
  readonly misread: number;
  /** Plain slips it judged. */
  readonly judged: number;
}

interface Hands {
  target: number;
  queue: { at: number; event: KeyEvent }[];
  readonly judged: Map<number, boolean>;
  misread: number;
}

function familiarity(paper: Paper): Familiarity {
  if (paper.kind === "minh") return paper.appearance === 1 ? "new" : "learning";
  return paper.kind === "thuong" ? "learning" : "known";
}

/** Whether the bot will type this slip (unlabelled ones judged once, by topic, with misreads). */
function wantsToType(s: TinhTuSession, paper: Paper, hands: Hands, policy: TtPolicy, rng: RngStream, accuracy: number): boolean {
  if (policy === "type-all") return true;
  const look = paperLook(paper);
  if (look === "tamma") return false;
  if (look !== "plain" || s.init.tier !== "tham-ngo" || s.init.lessonGroup === null) return true;
  let verdict = hands.judged.get(paper.serial);
  if (verdict === undefined) {
    const belongs = paper.group === s.init.lessonGroup;
    const misread = rng.float() >= accuracy;
    verdict = misread ? !belongs : belongs;
    if (misread) hands.misread += 1;
    hands.judged.set(paper.serial, verdict);
  }
  return verdict;
}

function choose(s: TinhTuSession, hands: Hands, target: TtBot, rng: RngStream): Paper | null {
  const options = s.papers.filter((paper) => wantsToType(s, paper, hands, target.policy, rng, target.params.accuracy));
  if (options.length === 0) return null;
  const rank = (paper: Paper) =>
    target.policy === "type-all" ? 0 : paper.kind === "minh" ? (s.typedCount[paper.word] === 0 ? 0 : 1) : 2;
  return [...options].sort((a, b) => rank(a) - rank(b) || a.expires - b.expires || a.serial - b.serial)[0]!;
}

function plan(hands: Hands, typist: HumanTypist, text: string, context: { familiarity: Familiarity; live: number }, tick: number): void {
  hands.queue = typist.word(text, context).events.map((event) => ({ at: tick + event.at, event }));
}

/** At most one command a tick, following the router like a person watching the slip. */
function botCommands(s: TinhTuSession, hands: Hands, target: TtBot, typist: HumanTypist, rng: RngStream): SessionCommand[] {
  if (target.policy === "no-type") return [];
  const tick = s.tick;
  let paper = s.papers.find((item) => item.serial === hands.target);
  if (paper === undefined) {
    hands.target = -1;
    hands.queue = [];
    const next = choose(s, hands, target, rng);
    if (next === null) return [];
    paper = next;
    hands.target = paper.serial;
    plan(hands, typist, paper.text, { familiarity: familiarity(paper), live: s.papers.length }, tick);
  }
  const router = s.typing.router;
  const onTarget = router.lock === paper.slot;
  const typed = onTarget ? s.typing.words.typed[paper.slot]! : 0;
  if (hands.queue.length === 0) {
    // Keys ran out (a switch or Esc took letters back): read the rest again and go on.
    plan(hands, typist, paper.text.slice(typed), { familiarity: "known", live: s.papers.length }, tick);
    if (hands.queue.length === 0) return [];
  }
  const next = hands.queue[0]!;
  if (next.at > tick) return [];
  if (router.lock >= 0 && !onTarget) {
    // The lock went to another slip (a slip of the finger): let go first, then the same key.
    next.at = tick + 1;
    return [{ type: "escape" }];
  }
  hands.queue.shift();
  const event = next.event;
  if (event.kind === "abandon") {
    hands.target = -1;
    hands.queue = [];
    return onTarget ? [{ type: "escape" }] : [];
  }
  // A wrong key never enters the word (kit router), so a Backspace after it would undo a right letter: skipped.
  if (event.kind === "backspace") return [];
  if (!event.correct) return [{ type: "letter", letter: event.key.charCodeAt(0) - 97 }];
  if (typed >= paper.text.length) return [];
  return [{ type: "letter", letter: paper.text.charCodeAt(typed) - 97 }];
}

/** One session played by `target` (its own typist stream); `session` names it uniquely. */
export function runBotSession(target: TtBot, init: SessionInit, rng: RngStream, session: string): SessionRun {
  const s = createTinhTuSession(init);
  const typist = new HumanTypist(target.params, rng);
  const hands: Hands = { target: -1, queue: [], judged: new Map(), misread: 0 };
  const events: SessionEvent[] = [];
  const unlabelled = new Set<number>();
  while (!s.ended) {
    stepTinhTu(s, botCommands(s, hands, target, typist, rng));
    for (const paper of s.papers) if (!paper.labelled) unlabelled.add(paper.serial);
    events.push(...drainEvents(s));
  }
  const tamMaIds = s.kinds.flatMap((kind, word) => (kind === "tam-ma" ? [s.deck.ids[word]!] : []));
  const wrongUnlabelled = events.filter((event) => event.type === "done" && event.kind === "tam-ma" && unlabelled.has(event.serial)).length;
  return {
    summary: summarize(s),
    drafts: sessionDrafts(s, events, { bot: true, session }),
    clashes: minhExpiryClashes(s.expiries),
    tamMaIds,
    wrongUnlabelled,
    misread: hands.misread,
    judged: hands.judged.size,
  };
}

export interface LessonRun {
  readonly bot: string;
  readonly tier: TinhTuTier;
  readonly seed: number;
  readonly lesson: string;
  readonly sessions: readonly SessionRun[];
  /** Khẩu Quyết drafts (one card before each session). */
  readonly cardDrafts: readonly DraftRecord[];
  readonly progress: LessonProgress;
  /** Sessions it took to reach 100 (null: not within maxSessions). */
  readonly sessionsTo100: number | null;
}

export const lessonFor = (seed: number): LessonDef => TRIAL_LESSONS[seed % TRIAL_LESSONS.length]!;

/** A lesson played until lĩnh ngộ (or `maxSessions`, or every session when `untilDone` is false); `tag` keeps session ids of separate runs apart. */
export function runLesson(target: TtBot, tier: TinhTuTier, seed: number, maxSessions: number, untilDone = true, tag = "run"): LessonRun {
  const lesson = lessonFor(seed);
  const rng = createRng(seed).ai;
  const eEff = effectiveE({ e: target.profileWpm, a: target.params.accuracy, cv: target.params.cv });
  const eEffX10 = Math.max(10, Math.round(eEff * 10));
  const sessions: SessionRun[] = [];
  const cardDrafts: DraftRecord[] = [];
  let progress = NEW_PROGRESS;
  let sessionsTo100: number | null = null;
  const card = new HumanTypist(target.params, rng);
  for (let number = 1; number <= maxSessions; number += 1) {
    const session = [tag, target.id, tier, seed, number].join("|");
    if (target.policy !== "no-type") {
      for (const word of lesson.words) {
        const typedWord = card.word(word.text, { familiarity: "new" });
        cardDrafts.push(khauQuyetDraft({ id: word.text, text: word.text }, typedWord.errors, (typedWord.ticks * 1000) / 60, { bot: true, session }));
      }
    }
    const sessionSeed = (Math.imul(seed, 1_000_003) + number * 7919) >>> 0;
    const pools = buildPools(TRIAL_WORDS, TRIAL_RECORDS, lesson, sessionSeed);
    const init = sessionInit({ seed: sessionSeed, tier, mode: "lesson", eEffX10, lesson, pools });
    const run = runBotSession(target, init, rng, session);
    sessions.push(run);
    progress = addSessionScore(progress, run.summary.score);
    if (progress.linhNgo && sessionsTo100 === null) sessionsTo100 = number;
    if (progress.linhNgo && untilDone) break;
  }
  return { bot: target.id, tier, seed, lesson: lesson.id, sessions, cardDrafts, progress, sessionsTo100 };
}

export const SEEDS = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);
