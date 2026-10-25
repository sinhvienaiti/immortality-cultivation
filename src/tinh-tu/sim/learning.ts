/**
 * Learning events of Tĩnh Tu (canon §16, §17, D17, D43, PB-31), as drafts
 * the page turns into kit/learning events (it adds `occurredAt`) and the bots
 * only ever keep (dry run):
 * - Khẩu Quyết and every Minh typed: `review-card` with `hintUsed: true`,
 *   every time (never a recall, even the second Minh that shows no meaning);
 * - Thường typed: `typing-skill`, one scored event per word per session,
 *   `hintUsed` = whether its meaning was showing (Thường shows none);
 * - Tâm ma: no learning event, ever (typed by mistake: only a local "chọn
 *   nhầm"; recognised: nothing). No negative event can come from a Tâm ma (HC6).
 * checkDrafts is the HC7 rule checker. Pure.
 * Owner: Lane 8.
 */
import { GAME_ID, SIM } from "../../content/rules";
import type { TinhTuSession, SessionEvent } from "./session";

export type DraftSource = "khau-quyet" | "minh" | "thuong";
export type DraftActivity = "review-card" | "typing-skill";

/** A kit/learning LearningEvent without `occurredAt`, plus the canon's `channel` (§17). */
export interface LearningDraft {
  readonly version: 1;
  readonly entityType: "vocabulary";
  readonly entityId: string;
  readonly gameId: typeof GAME_ID;
  readonly activityType: DraftActivity;
  readonly result: "correct" | "wrong";
  readonly responseMs: number;
  readonly hintUsed: boolean;
  readonly replayUsed: boolean;
  readonly expectedAnswer: string;
  readonly errorType?: "spelling";
  readonly channel: "typing";
}

/** Who made a draft and in which session (one scored event per word per session); `session` is unique per session played. */
export interface DraftAuthor {
  readonly bot: boolean;
  readonly session: string;
}

export interface DraftContext {
  readonly source: DraftSource;
  /** The meaning (or IPA) was on screen while the word was typed. */
  readonly meaningShown: boolean;
  /** The word's one scored event of the session. */
  readonly scored: boolean;
  readonly session: string;
  readonly bot: boolean;
  /** Bots build drafts only, never sent (canon §17.2, D43). */
  readonly dryRun: boolean;
}

export interface DraftRecord {
  readonly draft: LearningDraft;
  readonly context: DraftContext;
}

function draft(entityId: string, text: string, activityType: DraftActivity, errors: number, responseMs: number, hintUsed: boolean): LearningDraft {
  const correct = errors === 0;
  return {
    version: 1,
    entityType: "vocabulary",
    entityId,
    gameId: GAME_ID,
    activityType,
    result: correct ? "correct" : "wrong",
    responseMs: Math.max(0, Math.round(responseMs)),
    hintUsed,
    replayUsed: false,
    expectedAnswer: text,
    ...(correct ? {} : { errorType: "spelling" as const }),
    channel: "typing",
  };
}

const contextOf = (author: DraftAuthor, source: DraftSource, meaningShown: boolean, scored: boolean): DraftContext => ({
  source,
  meaningShown,
  scored,
  session: author.session,
  bot: author.bot,
  dryRun: author.bot,
});

/** Khẩu Quyết: word, IPA and meaning on the card, typed once: review-card, hintUsed (canon §16). */
export function khauQuyetDraft(word: { readonly id: string; readonly text: string }, errors: number, responseMs: number, author: DraftAuthor): DraftRecord {
  return { draft: draft(word.id, word.text, "review-card", errors, responseMs, true), context: contextOf(author, "khau-quyet", true, false) };
}

/** Drafts for a session's `done` events (Tâm ma make none). */
export function sessionDrafts(s: TinhTuSession, events: readonly SessionEvent[], author: DraftAuthor): DraftRecord[] {
  const out: DraftRecord[] = [];
  for (const event of events) {
    if (event.type !== "done" || event.kind === "tam-ma") continue;
    const id = s.deck.ids[event.word]!;
    const responseMs = (event.totalTicks * 1000) / SIM.tickHz;
    if (event.kind === "minh") {
      // PB-31: always hintUsed, also when this appearance shows no meaning.
      out.push({ draft: draft(id, event.text, "review-card", event.errors, responseMs, true), context: contextOf(author, "minh", event.meaningShown, false) });
    } else if (event.first) {
      // One scored event per word per session; later ones stay local.
      out.push({ draft: draft(id, event.text, "typing-skill", event.errors, responseMs, event.meaningShown), context: contextOf(author, "thuong", event.meaningShown, true) });
    }
  }
  return out;
}

export interface DraftCheck {
  readonly total: number;
  readonly ok: number;
  /** One line per broken draft. */
  readonly problems: readonly string[];
  /** Hard rules (HC6, HC7): each must be 0. */
  readonly hard: {
    readonly hintFalseWhileShown: number;
    readonly minhOrCardWithoutHint: number;
    readonly tamMaEvents: number;
    readonly botNotDryRun: number;
  };
}

/** HC7 (and HC6): every draft against the rules of canon §16, §17. `tamMa`: Tâm ma entity ids of the sessions. */
export function checkDrafts(records: readonly DraftRecord[], tamMa: ReadonlySet<string> = new Set()): DraftCheck {
  const problems: string[] = [];
  const hard = { hintFalseWhileShown: 0, minhOrCardWithoutHint: 0, tamMaEvents: 0, botNotDryRun: 0 };
  const scored = new Map<string, number>();
  let ok = 0;
  for (const { draft: event, context } of records) {
    const bad: string[] = [];
    if (event.version !== 1 || event.entityType !== "vocabulary" || event.gameId !== GAME_ID) bad.push("identity");
    if (event.channel !== "typing") bad.push("channel " + String(event.channel));
    if (event.result !== "correct" && event.result !== "wrong") bad.push("result");
    if ((event.result === "wrong") !== (event.errorType === "spelling")) bad.push("errorType");
    if (!Number.isInteger(event.responseMs) || event.responseMs < 0) bad.push("responseMs");
    if (event.entityId === "" || event.expectedAnswer === "") bad.push("empty word");
    const expected: DraftActivity = context.source === "thuong" ? "typing-skill" : "review-card";
    if (event.activityType !== expected) bad.push("activityType " + event.activityType + " for " + context.source);
    if (context.meaningShown && !event.hintUsed) {
      hard.hintFalseWhileShown += 1;
      bad.push("hintUsed false while the meaning shows");
    }
    if (context.source !== "thuong" && !event.hintUsed) {
      hard.minhOrCardWithoutHint += 1;
      bad.push("Minh or Khẩu Quyết without hintUsed");
    }
    if (context.source === "thuong" && event.hintUsed !== context.meaningShown) bad.push("hintUsed does not follow the meaning");
    if (tamMa.has(event.entityId)) {
      hard.tamMaEvents += 1;
      bad.push("event for a Tâm ma word");
    }
    if (context.bot && !context.dryRun) {
      hard.botNotDryRun += 1;
      bad.push("bot draft not dry run");
    }
    if (event.activityType === "typing-skill") {
      const key = context.session + "|" + event.entityId;
      const count = (scored.get(key) ?? 0) + 1;
      scored.set(key, count);
      if (count > 1 || !context.scored) bad.push("more than one scored event for the word in the session");
    }
    if (bad.length === 0) ok += 1;
    else problems.push(event.entityId + " (" + context.source + ", session " + context.session + "): " + bad.join("; "));
  }
  return { total: records.length, ok, problems, hard };
}
