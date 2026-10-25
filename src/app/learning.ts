// Source: games/dragon-hold/src/app/learning.ts @06cd4e6 (adapted: canon §17 activity table and `channel` on every event; one scored event per word from the sim's word-complete; dry-run drafts for bots and a queue that refuses bot or dry-run events (D43); the new-word ledger's take on word-first-seen (canon §6.4); Thẻ Ôn's three question kinds; records as WordRecord for typing/deck.ts; no Tab replay, no device-only records, no batch timer)
/**
 * Learning glue (canon §17, D17, D43):
 *  - the match's word source: vocabulary (kit/vocab, `sensitive` out and
 *    `mature` for child profiles) and the learning core's records through the
 *    portal bridge (`lookup`, 2 s); no portal or no records: a cold start
 *    (every M0a match, canon §25); no vocabulary: the labelled fallback set
 *    (content/data/trial-set.ts, match-deck part);
 *  - learning events: one scored event per word per match (the sim's
 *    `word-complete.scored`, a fizzled Cast's word too), the activity type of
 *    canon §17, `hintUsed` as the sim reports it (the meaning or IPA was on
 *    screen while typing), `channel` on every event; Học trước always
 *    `review-card` with `hintUsed: true` (never a recall); Thẻ Ôn sends
 *    `listening`, `review-card` or `meaning-recall` (always sent);
 *  - dry run for bots: events are built by the same rules into `drafts` and
 *    never sent; the queue refuses (and logs) any bot or dry-run event;
 *  - the new-word ledger: `take(wordId, now, channel)` on `word-first-seen`
 *    and on each Học trước word; the app saves `.newwords` (onLedgerChange);
 *  - the match's word list for Thẻ Ôn (Ẩu → hintUsed → new) and Sổ Từ.
 * Not pure (wall clock, portal); the sim never reads it.
 * Owner: Lane 3.
 */
import { GAME_ID, LINH_SA, NEW_WORDS } from "../content/rules";
import type { ActivityType, Channel, DeckWord, NewWordChannel, SimEvent, World, WordRecord } from "../content/types";
import { createLearningBridge } from "../kit/learning/bridge";
import { buildCombatLearningEvent, normalizeLearningEntityId, type LearningEvent } from "../kit/learning/events";
import { filterVocabularyEntries, textHasBlockedWord } from "../kit/vocab/content-filter";
import type { VocabularyEntry } from "../kit/vocab/types";
import { loadVocabularyIndex, loadVocabularyLevel } from "../kit/vocab/vocabulary";
import { groupForRecord, isDeckText } from "../typing/deck";
import type { NewWordLedger } from "../typing/new-word-ledger";
import { TRIAL_DECK_WORDS } from "../content/data/trial-set";
import { gameStorage } from "./storage";

// ── Rules of a learning event (canon §17) ───────────────────────────────────

/** Recall activities: always sent; a right answer without a hint is a right recall (canon §17). */
const RECALLS: ReadonlySet<string> = new Set<ActivityType>(["meaning-recall", "listening", "review-card"]);
/** Activity types this game sends (canon §17 table). */
export const ACTIVITY_TYPES: readonly ActivityType[] = ["typing-skill", "typing-elite", "typing-boss", "review-card", "meaning-recall", "listening"];
const TYPING_ACTIVITIES: ReadonlySet<string> = new Set<ActivityType>(["typing-skill", "typing-elite", "typing-boss"]);

/**
 * "A right recall" (canon §17, D17), on this device and in the portal's
 * samples: a right answer in a recall activity with no hint shown. Học trước
 * goes out as `review-card` with `hintUsed`, so it is never one.
 */
export const isRightRecall = (activityType: unknown, result: unknown, hintUsed: unknown): boolean =>
  RECALLS.has(String(activityType)) && result === "correct" && hintUsed !== true;

/** A learning event of this game: the kit's shape with `channel`; drafts carry `dryRun`, bot events `bot`. */
export type IcLearningEvent = LearningEvent & {
  readonly channel: Channel;
  /** Built for a gate, never sent (canon §17.2). */
  readonly dryRun?: true;
  /** Made by a bot seat: never sent (D29, D43). */
  readonly bot?: true;
  /** Drafts only: the wave it happened in (reports). */
  readonly wave?: number;
};

/** Meaning and IPA of a word id, from the loaded vocabulary. */
export interface Gloss {
  readonly vi: string;
  readonly ipa: string;
}
export type GlossOf = (wordId: string) => Gloss | null;

interface Marks {
  readonly dryRun: boolean;
  readonly bot: boolean;
  readonly wave: number;
}

function mark(event: LearningEvent, channel: Channel, marks: Marks): IcLearningEvent {
  return {
    ...event,
    channel,
    ...(marks.dryRun ? { dryRun: true as const, wave: marks.wave } : {}),
    ...(marks.bot ? { bot: true as const } : {}),
  };
}

/** The scored learning event of a typed word (canon §17): correct only with no wrong key; hintUsed as the sim saw it. */
export function typedWordEvent(event: Extract<SimEvent, { type: "word-complete" }>, occurredAt: string, marks: Marks = { dryRun: false, bot: false, wave: 0 }): IcLearningEvent {
  const base = buildCombatLearningEvent({ gameId: GAME_ID, entry: { id: event.wordId, en: event.text, vi: "", ipa: "" }, perfect: event.errors === 0, occurredAt });
  return mark({ ...base, entityId: normalizeLearningEntityId(event.wordId), activityType: event.activity, responseMs: Math.max(0, Math.round(event.responseMs)), hintUsed: event.hintUsed }, event.channel, marks);
}

/** A recall-activity answer (Học trước, Thẻ Ôn): always sent (canon §17). */
export function recallEvent(
  word: { readonly wordId: string; readonly text: string },
  correct: boolean,
  detail: { readonly activity: ActivityType; readonly hintUsed: boolean; readonly responseMs: number; readonly userAnswer: string; readonly occurredAt: string },
  marks: Marks = { dryRun: false, bot: false, wave: 0 },
): IcLearningEvent {
  const base = buildCombatLearningEvent({ gameId: GAME_ID, entry: { id: word.wordId, en: word.text, vi: "", ipa: "" }, perfect: correct, occurredAt: detail.occurredAt });
  return mark(
    {
      ...base,
      entityId: normalizeLearningEntityId(word.wordId),
      activityType: detail.activity,
      responseMs: Math.max(0, Math.round(detail.responseMs)),
      hintUsed: detail.hintUsed,
      userAnswer: detail.userAnswer,
    },
    "typing",
    marks,
  );
}

/**
 * What breaks canon §17 in a list of one match's events (HC7's checker, for
 * the bot report too): an unknown activity type, no `channel`, a second
 * scored typing event of one word, a Học trước event without `hintUsed`
 * (`learnAhead` ids), and in a list meant for the queue any dry-run or bot event.
 */
export function learningRuleProblems(events: readonly IcLearningEvent[], options: { readonly learnAhead?: ReadonlySet<string>; readonly queued?: boolean } = {}): string[] {
  const problems: string[] = [];
  const typed = new Set<string>();
  for (const event of events) {
    const id = event.entityId;
    if (!ACTIVITY_TYPES.includes(event.activityType as ActivityType)) problems.push(id + ": unknown activityType " + event.activityType);
    if (event.channel !== "typing" && event.channel !== "voice" && event.channel !== "hybrid") problems.push(id + ": no channel");
    if (event.gameId !== GAME_ID) problems.push(id + ": gameId " + event.gameId);
    if (TYPING_ACTIVITIES.has(event.activityType)) {
      if (typed.has(id)) problems.push(id + ": a second scored typing event this match");
      typed.add(id);
    }
    if (options.learnAhead?.has(id) && event.activityType === "review-card" && event.hintUsed !== true) problems.push(id + ": Học trước without hintUsed");
    if (options.queued && (event.dryRun === true || event.bot === true)) problems.push(id + ": a " + (event.bot ? "bot" : "dry-run") + " event in the queue");
  }
  return problems;
}

// ── The queue (canon §17.2: refuses bot and dry-run events) ─────────────────

export interface LearningQueue {
  /** Sends an event on (the portal, or the bridge's local queue); false and an error log for a bot or dry-run event. */
  push(event: IcLearningEvent): boolean;
  /** Events refused so far (bot or dry run); a healthy run keeps 0. */
  readonly blocked: number;
  readonly sent: number;
}

export function createLearningQueue(send: (event: IcLearningEvent) => void, log: (message: string) => void = (message) => console.error(message)): LearningQueue {
  let blocked = 0;
  let sent = 0;
  return {
    push(event) {
      if (event.dryRun === true || event.bot === true) {
        blocked += 1;
        log("immortality-cultivation: learning queue refused a " + (event.bot === true ? "bot" : "dry-run") + " event for " + event.entityId + " (canon §17.2)");
        return false;
      }
      sent += 1;
      send(event);
      return true;
    },
    get blocked() {
      return blocked;
    },
    get sent() {
      return sent;
    },
  };
}

/** The portal bridge's sender (kit/learning; its local queue goes through storage.ts). */
export function bridgeSender(): { readonly send: (event: IcLearningEvent) => void; dispose(): void } {
  const bridge = createLearningBridge({ gameId: GAME_ID, storage: gameStorage });
  return { send: (event) => bridge.sendAttempt(event), dispose: () => bridge.dispose() };
}

// ── The match's word source (canon §17.1) ───────────────────────────────────

export interface DeckSource {
  /** Candidates in vocabulary order (most frequent first), with their learning group; buildDeck's input. */
  readonly records: WordRecord[];
  readonly gloss: ReadonlyMap<string, Gloss>;
  /** Words due in the records (canon §6.4: > 80 due caps the new words at 4). */
  readonly dueCount: number;
  /** The vocabulary did not load: content/data/trial-set.ts (match-deck part) stands in. */
  readonly fallback: boolean;
}

/** A learning-core record as the game needs it. */
export interface CoreRecord {
  readonly mastery: number;
  readonly due: boolean;
  readonly recalls: number;
}

/** Lookup results in either shape the portal may answer with: `{ items: [...] }`, `{ records: {...} }` or a list. */
export function parseLookup(value: unknown, nowMs: number): Map<string, CoreRecord> {
  const out = new Map<string, CoreRecord>();
  const object = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  let rows: unknown[] = [];
  if (Array.isArray(value)) rows = value;
  else if (object && Array.isArray(object["items"])) rows = object["items"] as unknown[];
  else if (object && object["records"] !== null && typeof object["records"] === "object") {
    rows = Object.entries(object["records"] as Record<string, unknown>).map(([entityId, record]) => ({ entityId, ...(record as object) }));
  }
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = record["entityId"] ?? record["wordKey"];
    if (typeof id !== "string") continue;
    const mastery = typeof record["mastery"] === "number" && Number.isFinite(record["mastery"]) ? Math.max(0, Math.min(100, Math.round(record["mastery"]))) : 0;
    const next = typeof record["nextReviewAt"] === "string" ? Date.parse(record["nextReviewAt"]) : Number.NaN;
    const samples = [record["recentAnswers"], record["recentSamples"]].flatMap((list) => (Array.isArray(list) ? list : []));
    const recalls = samples.filter((sample) => {
      const s = sample as Record<string, unknown> | null;
      return s !== null && typeof s === "object" && isRightRecall(s["activityType"], s["result"], s["hintUsed"]);
    }).length;
    out.set(normalizeLearningEntityId(id), { mastery, due: Number.isFinite(next) && next <= nowMs, recalls });
  }
  return out;
}

export interface DeckSourceOptions {
  /** Child profile: `mature` words out too (canon D20). */
  readonly excludeMature?: boolean;
  /** Entries of these vocabulary levels with their level (tests pass a fake); default kit/vocab from /vocabulary/. */
  readonly loadEntries?: (levels: readonly number[]) => Promise<(VocabularyEntry & { readonly level: number })[]>;
  /** The learning core's records for up to 200 ids; default the portal bridge (fails without a portal: cold start). */
  readonly lookup?: (ids: readonly string[]) => Promise<unknown>;
  readonly nowMs?: number;
}

async function defaultEntries(levels: readonly number[], excludeMature: boolean): Promise<(VocabularyEntry & { readonly level: number })[]> {
  const index = await loadVocabularyIndex();
  const lists = await Promise.all(
    levels
      .filter((level) => index.levels.some((item) => item.level === level))
      .map(async (level) => (await loadVocabularyLevel(level, index, { excludeMature })).map((entry) => ({ ...entry, level }))),
  );
  return lists.flat();
}

async function defaultLookup(ids: readonly string[]): Promise<unknown> {
  const bridge = createLearningBridge({ gameId: GAME_ID, storage: gameStorage });
  try {
    return await bridge.lookup(ids);
  } finally {
    bridge.dispose();
  }
}

/** Vocabulary entries → WordRecord rows (one a–z word of 3–8 letters each, first spelling only, no blocked word). */
export function recordsFrom(entries: readonly (VocabularyEntry & { readonly level: number })[], core: ReadonlyMap<string, CoreRecord>, excludeMature = false): { records: WordRecord[]; gloss: Map<string, Gloss> } {
  const records: WordRecord[] = [];
  const gloss = new Map<string, Gloss>();
  const seen = new Set<string>();
  for (const entry of filterVocabularyEntries(entries, { excludeMature })) {
    const text = normalizeLearningEntityId(entry.en);
    if (!isDeckText(text) || seen.has(text) || textHasBlockedWord(text, { excludeMature })) continue;
    seen.add(text);
    const record = core.get(text) ?? null;
    records.push({ wordId: text, text, group: groupForRecord(record), level: entry.level, mastery: record?.mastery ?? 0, recalls: record?.recalls ?? 0 });
    gloss.set(text, { vi: entry.vi, ipa: entry.ipa });
  }
  return { records, gloss };
}

/**
 * The match's candidates (canon §17.1): the profile level and the levels on
 * either side (a cold start takes its base words one level below), with the
 * learning core's records when the portal answers. Never throws.
 */
export async function loadDeckSource(level: number, options: DeckSourceOptions = {}): Promise<DeckSource> {
  const nowMs = options.nowMs ?? Date.now();
  const excludeMature = options.excludeMature === true;
  const base = Math.max(1, Math.floor(level));
  const levels = [base - 1, base, base + 1].filter((value) => value >= 1);
  let entries: (VocabularyEntry & { readonly level: number })[] = [];
  try {
    entries = await (options.loadEntries ? options.loadEntries(levels) : defaultEntries(levels, excludeMature));
  } catch (error) {
    console.warn("immortality-cultivation: vocabulary did not load; using the fallback set", error);
  }
  const fallback = entries.length === 0;
  if (fallback) entries = TRIAL_DECK_WORDS.map((word, index) => ({ id: "trial-" + index, en: word.en, vi: word.vi, ipa: word.ipa, level: word.level }));
  const ids = [...new Set(entries.map((entry) => normalizeLearningEntityId(entry.en)).filter(isDeckText))].slice(0, 200);
  let core = new Map<string, CoreRecord>();
  if (!fallback && ids.length > 0) {
    try {
      core = parseLookup(await (options.lookup ?? defaultLookup)(ids), nowMs);
    } catch {
      // No portal, or it did not answer in 2 s: a cold start (canon §17.1, §25).
    }
  }
  const { records, gloss } = recordsFrom(entries, core, excludeMature);
  return { records, gloss, dueCount: records.filter((record) => record.group === "due").length, fallback };
}

// ── The match's words: Thẻ Ôn and Sổ Từ (canon §17) ─────────────────────────

/** One word met this match. */
export interface MatchWord {
  readonly wordId: string;
  readonly text: string;
  /** New to the player this match (header deck group "new"). */
  readonly isNew: boolean;
  /** Was due or weak before the match. */
  readonly wasDue: boolean;
  /** Wave of its last completion (0: only met in Học trước). */
  wave: number;
  count: number;
  sloppy: boolean;
  hintUsed: boolean;
  errors: number;
}

export type ReviewKind = "listening" | "meaning-type" | "meaning-pick";

/** A Thẻ Ôn question (canon §17): hear then type, read the meaning then type, or pick the meaning 1 of 3 (keys 1/2/3). */
export interface ReviewQuestion {
  readonly wordId: string;
  readonly text: string;
  readonly vi: string;
  readonly ipa: string;
  readonly kind: ReviewKind;
  /** meaning-pick: three meanings, the right one at `answer`. */
  readonly choices: readonly string[];
  readonly answer: number;
}

const REVIEW_KINDS: readonly ReviewKind[] = ["listening", "meaning-type", "meaning-pick"];
/** canon §17: Thẻ Ôn chọn nghĩa → meaning-recall; nghe rồi gõ → listening; xem nghĩa rồi gõ → review-card. */
export const REVIEW_ACTIVITY: Readonly<Record<ReviewKind, ActivityType>> = { listening: "listening", "meaning-type": "review-card", "meaning-pick": "meaning-recall" };

/**
 * Up to 3 questions from the words of `wave` (canon §17): Ẩu words, then words
 * typed with the meaning shown, then new words; kinds rotate from `turn`
 * (listen, meaning then type, pick the meaning). A pick question needs two
 * other meanings (the deck's next words with a different one) or becomes
 * "meaning then type"; a word with no meaning only takes "listen".
 */
export function reviewQuestions(words: readonly MatchWord[], wave: number, gloss: GlossOf, turn: number, others: readonly string[] = []): ReviewQuestion[] {
  const ofWave = words.filter((word) => word.wave === wave);
  const ranked = [
    ...ofWave.filter((word) => word.sloppy),
    ...ofWave.filter((word) => !word.sloppy && word.hintUsed),
    ...ofWave.filter((word) => !word.sloppy && !word.hintUsed && word.isNew),
  ];
  const pool = [...new Set([...others, ...words.map((word) => word.wordId)])];
  return ranked.slice(0, LINH_SA.reviewPerBreak).map((word, index) => {
    const g = gloss(word.wordId) ?? { vi: "", ipa: "" };
    let kind = REVIEW_KINDS[(turn + index) % REVIEW_KINDS.length]!;
    let choices: string[] = [];
    let answer = 0;
    if (g.vi === "") kind = "listening";
    if (kind === "meaning-pick") {
      const start = Math.max(0, pool.indexOf(word.wordId));
      const wrong: string[] = [];
      for (let k = 1; k < pool.length && wrong.length < 2; k += 1) {
        const other = gloss(pool[(start + k) % pool.length]!)?.vi ?? "";
        if (other !== "" && other !== g.vi && !wrong.includes(other)) wrong.push(other);
      }
      if (wrong.length < 2) kind = "meaning-type";
      else {
        answer = (turn + index) % 3;
        choices = [...wrong];
        choices.splice(answer, 0, g.vi);
      }
    }
    return { wordId: word.wordId, text: word.text, vi: g.vi, ipa: g.ipa, kind, choices, answer };
  });
}

/** Sổ Từ (canon §17): new words learnt, words typed wrong, words due; each word once, in that order. */
export interface WordBookEntry {
  readonly wordId: string;
  readonly text: string;
  readonly kind: "new" | "mistyped" | "due";
  readonly vi?: string;
  readonly ipa?: string;
}

export function wordBookEntries(words: readonly MatchWord[], gloss: GlossOf): WordBookEntry[] {
  const out: WordBookEntry[] = [];
  const add = (word: MatchWord, kind: WordBookEntry["kind"]) => {
    const g = gloss(word.wordId);
    out.push({ wordId: word.wordId, text: word.text, kind, ...(g ? { vi: g.vi, ipa: g.ipa } : {}) });
  };
  for (const word of words) if (word.isNew) add(word, "new");
  for (const word of words) if (!word.isNew && (word.errors > 0 || word.sloppy)) add(word, "mistyped");
  for (const word of words) if (!word.isNew && word.errors === 0 && !word.sloppy && word.wasDue) add(word, "due");
  return out;
}

// ── The session ─────────────────────────────────────────────────────────────

export interface LearningOptions {
  /** Bots and reports: build events, never send them. */
  readonly dryRun: boolean;
  readonly ledger: NewWordLedger;
  /** Wall clock for `take` and `occurredAt` (Date.now in the page; the bot's clock in reports). */
  readonly now: () => number;
  /** A bot seat: its events carry `bot` and the queue refuses them (D29, D43). */
  readonly bot?: boolean;
  /** Where real events go; default the portal bridge (bridgeSender). Never used in a dry run. */
  readonly send?: (event: IcLearningEvent) => void;
  readonly gloss?: GlossOf;
  /** The ledger took a word: the app saves `.newwords` (storage.ts). */
  readonly onLedgerChange?: (ledger: NewWordLedger) => void;
  /** Error log of the queue (tests). */
  readonly log?: (message: string) => void;
}

export interface LearningSession {
  onEvents(events: readonly SimEvent[], world: World): void;
  /** Dry-run events built so far (bots, HC gates). */
  readonly drafts: readonly IcLearningEvent[];
  readonly queue: LearningQueue;
  /** Sends the events waiting for the next batch (wave end, match end, page hide). */
  flush(): void;
  /** One Học trước word typed (canon §17): review-card, hintUsed true, never a recall; its first meeting goes through the ledger. */
  learnAhead(word: { readonly wordId: string; readonly text: string }, correct: boolean, responseMs: number, answer: string): IcLearningEvent;
  /** One Thẻ Ôn answer (canon §17): always sent; no hint (the word and IPA stay hidden while the player answers). */
  review(question: ReviewQuestion, correct: boolean, responseMs: number, answer: string): IcLearningEvent;
  /** Up to 3 Thẻ Ôn questions from `wave`; each call moves the kind rotation on. */
  reviewQuestions(wave: number): ReviewQuestion[];
  matchWords(): readonly MatchWord[];
  wordBook(): WordBookEntry[];
  dispose(): void;
}

export function createLearning(options: LearningOptions): LearningSession {
  const now = options.now;
  const gloss: GlossOf = options.gloss ?? (() => null);
  let sender: { readonly send: (event: IcLearningEvent) => void; dispose(): void } | null = null;
  const send = (event: IcLearningEvent): void => {
    if (options.send) return options.send(event);
    sender ??= bridgeSender();
    sender.send(event);
  };
  const queue = createLearningQueue(send, options.log);
  const drafts: IcLearningEvent[] = [];
  const pending: IcLearningEvent[] = [];
  const words = new Map<string, MatchWord>();
  let deck: readonly DeckWord[] = [];
  let deckIds: string[] = [];
  let wave = 0;
  let turn = 0;
  let disposed = false;

  const marks = (): Marks => ({ dryRun: options.dryRun, bot: options.bot === true, wave });
  const occurredAt = (): string => new Date(now()).toISOString();
  const out = (event: IcLearningEvent): IcLearningEvent => {
    if (options.dryRun) drafts.push(event);
    else pending.push(event);
    return event;
  };
  const take = (wordId: string, channel: NewWordChannel): void => {
    if (options.ledger.take(wordId, now(), channel)) options.onLedgerChange?.(options.ledger);
  };
  const flush = (): void => {
    const batch = pending.splice(0, pending.length);
    for (const event of batch) queue.push(event);
  };
  const deckWord = (wordId: string): DeckWord | undefined => deck.find((word) => word.wordId === wordId);
  const matchWord = (wordId: string, text: string): MatchWord => {
    let word = words.get(wordId);
    if (word === undefined) {
      const source = deckWord(wordId);
      word = {
        wordId, text, isNew: source?.group === "new", wasDue: source?.group === "due" || source?.group === "weak", wave: 0, count: 0, sloppy: false, hintUsed: false, errors: 0,
      };
      words.set(wordId, word);
    }
    return word;
  };

  return {
    get drafts() {
      return drafts;
    },
    queue,
    flush,

    onEvents(events: readonly SimEvent[], world: World): void {
      if (deck !== world.header.deck) {
        deck = world.header.deck;
        deckIds = deck.map((word) => word.wordId);
      }
      for (const event of events) {
        switch (event.type) {
          case "phase":
            // A warning's words belong to the wave it announces (sim/words.ts wordsWave).
            if (event.phase === "warning") wave = event.wave;
            break;
          case "wave-start":
            wave = event.wave;
            break;
          case "word-first-seen":
            take(event.wordId, event.channel);
            break;
          case "word-complete": {
            const word = matchWord(event.wordId, event.text);
            word.wave = wave;
            word.count += 1;
            word.sloppy ||= event.grade === "sloppy";
            word.hintUsed ||= event.hintUsed;
            word.errors += event.errors;
            // One scored event per word per match (canon §17); later ones stay local (Sổ Từ, Thẻ Ôn picks).
            if (event.scored) out(typedWordEvent(event, occurredAt(), marks()));
            break;
          }
          case "wave-end":
          case "victory":
          case "defeat":
            flush();
            break;
          default:
            break;
        }
      }
    },

    learnAhead(word, correct, responseMs, answer) {
      matchWord(word.wordId, word.text);
      take(word.wordId, "learn-ahead");
      return out(recallEvent(word, correct, { activity: "review-card", hintUsed: true, responseMs, userAnswer: answer, occurredAt: occurredAt() }, marks()));
    },

    review(question, correct, responseMs, answer) {
      return out(recallEvent(question, correct, { activity: REVIEW_ACTIVITY[question.kind], hintUsed: false, responseMs, userAnswer: answer, occurredAt: occurredAt() }, marks()));
    },

    reviewQuestions(forWave: number): ReviewQuestion[] {
      const list = reviewQuestions([...words.values()], forWave, gloss, turn, deckIds);
      turn += list.length;
      return list;
    },

    matchWords: () => [...words.values()],
    wordBook: () => wordBookEntries([...words.values()], gloss),

    dispose(): void {
      if (disposed) return;
      disposed = true;
      flush();
      sender?.dispose();
    },
  };
}

/** Học trước's words: this match's new words in deck order, at most 8 (canon §14.2, §17). */
export function learnAheadWords(deck: readonly DeckWord[], gloss: GlossOf): { readonly wordId: string; readonly text: string; readonly vi: string; readonly ipa: string }[] {
  return deck
    .filter((word) => word.group === "new")
    .slice(0, Math.min(LINH_SA.learnAheadWords, NEW_WORDS.perWindow))
    .map((word) => {
      const g = gloss(word.wordId);
      return { wordId: word.wordId, text: word.text, vi: g?.vi ?? "", ipa: g?.ipa ?? "" };
    });
}
