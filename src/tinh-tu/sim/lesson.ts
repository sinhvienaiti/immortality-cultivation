/**
 * Lessons and word pools of a Tĩnh Tu session (canon §16, §6.4, D40, PB-13):
 * a lesson (công pháp) is 6 new words of one topic; Thường are due words
 * (Tham Ngộ: plain paper only from the lesson's group, other groups keep their
 * own mark); Tâm ma are known words (mastery ≥ 70) from groups ≥ 3 steps away,
 * never new; words of ≥ 2 groups and polysemous words are in neither pool.
 * A new lesson opens only with ≥ 6 words left in the new-word ledger;
 * otherwise a review session (Thường only).
 * Without the portal the page uses the fallback trial records (pretendRecords):
 * clearly labelled guesses, never sent anywhere as learning data.
 * Pure and deterministic: no clock (nowMs comes in), no storage.
 * Owner: Lane 8.
 */
import { NEW_WORDS, TINH_TU } from "../../content/rules";
import type { NewWordsSnapshot } from "../../content/types";
import type { SessionInit, SessionMode, SessionWord, TinhTuTier } from "./session";
import { farGroups, topicDistance, wordFitsPools, type GroupId } from "./topics";

/** A word of the topic catalog that may become Thường or Tâm ma (one group, not polysemous). */
export interface CatalogWord {
  readonly text: string;
  readonly group: GroupId;
  readonly topic: string;
  readonly level: number;
  readonly vi: string;
  readonly ipa: string;
}

export interface LessonWord {
  readonly text: string;
  readonly level: number;
  readonly vi: string;
  readonly ipa: string;
}

/** A công pháp's lesson: 6 words of one topic (canon §15.6, §16). */
export interface LessonDef {
  readonly id: string;
  /** Bàn Quyết slot of the công pháp's skill (Kiếm: ô 2, ô 4, ô 5). */
  readonly slot: 2 | 4 | 5;
  readonly name: string;
  readonly topic: string;
  readonly topicLabel: string;
  readonly group: GroupId;
  readonly words: readonly LessonWord[];
}

/** What the game knows of a word (portal lookup, or the fallback trial records). */
export interface WordRecord {
  /** 0–100. */
  readonly mastery: number;
  /** Due for review (Thường). */
  readonly due: boolean;
}

export type RecordSource = "portal" | "trial";

/** FNV-1a of a word: the fallback records' stable split. */
function fnv(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

/** Fallback trial records (no portal): about 1 word in 3 known (mastery 80), the rest due (mastery 45); lesson words stay new (rules.ts TINH_TU.pretend). */
export const PRETEND = TINH_TU.pretend;

export function pretendRecords(words: readonly CatalogWord[], lessons: readonly LessonDef[]): Map<string, WordRecord> {
  const lessonTexts = new Set(lessons.flatMap((lesson) => lesson.words.map((word) => word.text)));
  const out = new Map<string, WordRecord>();
  for (const word of words) {
    if (lessonTexts.has(word.text)) continue;
    const known = fnv(word.text) % PRETEND.knownEvery === 0;
    out.set(word.text, known ? { mastery: PRETEND.knownMastery, due: false } : { mastery: PRETEND.dueMastery, due: true });
  }
  return out;
}

const DECK_TEXT = /^[a-z]{3,8}$/;

/** Most Thường of the lesson's group and of other groups, and Tâm ma, a session carries (rules.ts TINH_TU.poolCaps). */
export const POOL_CAPS = TINH_TU.poolCaps;

export interface SessionPools {
  readonly thuong: readonly SessionWord[];
  readonly tamMa: readonly SessionWord[];
}

/** Stable order: sorted by text, then a seeded rotation, so pools do not depend on input order. */
function ordered(words: readonly CatalogWord[], seed: number): CatalogWord[] {
  const sorted = [...words].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  if (sorted.length === 0) return sorted;
  const shift = (seed >>> 0) % sorted.length;
  return [...sorted.slice(shift), ...sorted.slice(0, shift)];
}

const asSessionWord = (word: CatalogWord): SessionWord => ({ id: word.text, text: word.text, group: word.group });

/**
 * Thường and Tâm ma for a session. Lesson words never enter a pool; Thường
 * are due words (Tham Ngộ keeps plain paper for the lesson's group only,
 * other groups get their mark in the view); Tâm ma are known (≥ 70), not due,
 * from groups ≥ 3 steps away. A review session (no lesson) has Thường only.
 */
export function buildPools(
  words: readonly CatalogWord[],
  records: ReadonlyMap<string, WordRecord>,
  lesson: LessonDef | null,
  seed: number,
  excluded: ReadonlySet<string> = new Set(),
): SessionPools {
  const lessonTexts = new Set(lesson?.words.map((word) => word.text) ?? []);
  const usable = words.filter((word) => DECK_TEXT.test(word.text) && wordFitsPools([word.group], word.vi) && !lessonTexts.has(word.text) && !excluded.has(word.text));
  const due = usable.filter((word) => records.get(word.text)?.due === true);
  if (lesson === null) return { thuong: ordered(due, seed).slice(0, POOL_CAPS.sameGroup + POOL_CAPS.otherGroup).map(asSessionWord), tamMa: [] };
  const same = ordered(due.filter((word) => word.group === lesson.group), seed).slice(0, POOL_CAPS.sameGroup);
  const other = ordered(due.filter((word) => word.group !== lesson.group), seed).slice(0, POOL_CAPS.otherGroup);
  const far = new Set<string>(farGroups(lesson.group));
  const tamMa = ordered(
    usable.filter((word) => {
      const record = records.get(word.text);
      return record !== undefined && !record.due && record.mastery >= TINH_TU.tamMaMastery && far.has(word.group);
    }),
    seed,
  ).slice(0, POOL_CAPS.tamMa);
  return { thuong: [...same, ...other].map(asSessionWord), tamMa: tamMa.map(asSessionWord) };
}

/** The session's start state (session.ts createTinhTuSession takes it). */
export function sessionInit(options: {
  readonly seed: number;
  readonly tier: TinhTuTier;
  readonly mode: SessionMode;
  readonly eEffX10: number;
  readonly lesson: LessonDef | null;
  readonly pools: SessionPools;
}): SessionInit {
  const { lesson } = options;
  return {
    seed: options.seed >>> 0,
    tier: options.tier,
    mode: options.mode,
    eEffX10: options.eEffX10,
    lessonGroup: lesson?.group ?? null,
    minh: options.mode === "lesson" && lesson !== null ? lesson.words.map((word) => ({ id: word.text, text: word.text, group: lesson.group })) : [],
    thuong: options.pools.thuong,
    tamMa: options.mode === "lesson" ? options.pools.tamMa : [],
  };
}

/** canon §16, §6.4: a new lesson needs ≥ 6 words left in the ledger; never half a lesson. */
export const canOpenLesson = (remaining: number): boolean => remaining >= TINH_TU.lessonWords;

/**
 * Whole minutes until the ledger has `need` words again ("còn N phút nữa đủ 6
 * từ"): the oldest entries leave the sliding 20-minute window first. 0 when
 * there are enough already.
 */
export function minutesUntilWords(snapshot: NewWordsSnapshot, nowMs: number, need: number = TINH_TU.lessonWords): number {
  const from = nowMs - NEW_WORDS.windowMs;
  const inWindow = snapshot.entries.map((entry) => entry.firstSeenMs).filter((ms) => ms > from).sort((a, b) => a - b);
  const mustLeave = inWindow.length - (NEW_WORDS.perWindow - need);
  if (mustLeave <= 0) return 0;
  const freeAt = inWindow[mustLeave - 1]! + NEW_WORDS.windowMs;
  return Math.max(1, Math.ceil((freeAt - nowMs) / 60_000));
}

/** Every word of the lesson is already counted in the ledger's window: opening it again takes nothing (moved from the removed ui/ledger.ts). */
export function lessonCounted(snapshot: NewWordsSnapshot, words: readonly string[], nowMs: number): boolean {
  const from = nowMs - NEW_WORDS.windowMs;
  return words.every((word) => snapshot.entries.some((entry) => entry.wordId === word && entry.firstSeenMs > from));
}

/** Distance of a Tâm ma word from the lesson (end screen: "cách bài N bậc"). */
export const tamMaDistance = (lesson: LessonDef, group: string): number => topicDistance(lesson.group, group);

/** Cumulative points of a lesson across sessions (canon §16: 100 = lĩnh ngộ). */
export interface LessonProgress {
  readonly points: number;
  readonly sessions: number;
  readonly linhNgo: boolean;
}

export const NEW_PROGRESS: LessonProgress = { points: 0, sessions: 0, linhNgo: false };

export function addSessionScore(progress: LessonProgress, score: number): LessonProgress {
  const points = Math.min(TINH_TU.full, progress.points + Math.max(0, score));
  return { points, sessions: progress.sessions + 1, linhNgo: points >= TINH_TU.full };
}
