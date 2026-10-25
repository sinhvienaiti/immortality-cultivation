// Source: games/dragon-hold/src/typing/grading.ts @06cd4e6 (adapted: canon §6.5 table only — no chain, no M_c, no boss-chain allowance; Chớp against the seat's own profile E with the 5-session floor; D41 profile cap; canon §17 activity table)
/**
 * Word grades (canon §6.5, D41): Chớp (0 errors, t ≤ 0.85 × t_expected of the
 * player's own profile, with the 5-session floor), Hoàn hảo, Tốt, Vừa, Ẩu; M_q.
 * No random crits anywhere (D09). Integers only on the sim side.
 *
 *   t_expected = 12 × (ℓ − 1) / (E_eff × 0.86) seconds   (rules.ts PACE, kit gradeWord's form)
 *
 * E_eff comes from the seat's profile (kit balance effectiveE), raised to the
 * median E_eff of the last 5 sessions so a deliberately slow session never
 * makes Chớp easier. After a session the profile may drop at most 10 %, and
 * only once it is trusted (≥ 60 words over ≥ 3 sessions); rises, and any
 * change while trust is low, follow kit updateSkill/blendSkill uncapped (D41).
 * Owner: Lane 3.
 */
import { GRADE, PACE, SIM } from "../content/rules";
import type { ActivityType, Grade, SeatProfile, WordSlotKind } from "../content/types";
import { effectiveE } from "../kit/balance/pace";
import type { SkillProfile } from "../kit/balance/profile";

export const GRADES: readonly Grade[] = ["flash", "perfect", "good", "ok", "sloppy"];

export interface GradeInput {
  readonly errors: number;
  readonly letters: number;
  /** First to last key, ticks. */
  readonly keyTicks: number;
  /** t_expected of this word for the seat's profile, ticks. */
  readonly expectedTicks: number;
}

export function gradeOf(input: GradeInput): Grade {
  if (input.errors >= GRADE.sloppyErrors) return "sloppy";
  if (input.errors > 0) return input.letters >= GRADE.goodMinLetters ? "good" : "ok";
  // t_k ≤ 0.85 t_expected, both sides × 1000 to stay in integers.
  return input.keyTicks * 1000 <= GRADE.flashRatioPm * input.expectedTicks ? "flash" : "perfect";
}

/** M_q × 1000 (rules.ts GRADE.mqPm). */
export function mqPm(grade: Grade): number {
  return GRADE.mqPm[grade];
}

/** E_eff × 1000 of a header profile (e WPM, a and cv in permille), rounded so a replay reads it back. */
export function eEffX1000(profile: SeatProfile): number {
  return Math.round(effectiveE({ e: profile.e, a: profile.a / 1000, cv: profile.cv / 1000 }) * 1000);
}

/** t_expected of a word of `letters` letters at E_eff × 1000, ticks rounded half up; 0 without a speed. */
export function expectedTicks(letters: number, eX1000: number): number {
  if (!(eX1000 > 0)) return 0;
  const numerator = PACE.perCharS * Math.max(0, letters - 1) * SIM.tickHz * 1_000_000;
  const denominator = eX1000 * PACE.dPm;
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Median of integers (lower middle mean, floored). */
function medianInt(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** The Chớp E × 1000: the current E_eff, never under the median of the last 5 sessions' E_eff (canon §6.5). */
export function flashEX1000(current: number, recentSessions: readonly number[]): number {
  const recent = recentSessions.filter((value) => Number.isFinite(value) && value > 0).slice(-GRADE.floorSessions);
  return recent.length === 0 ? current : Math.max(current, medianInt(recent));
}

/** The profile measures enough to cap its drops: ≥ 60 words over ≥ 3 sessions (D41). */
export const profileTrusted = (profile: SkillProfile): boolean =>
  profile.measures.e.n >= GRADE.trustWords && profile.trend.stages >= GRADE.trustSessions;

/** D41: after a session E drops at most 10 % when the profile was trusted; rises and untrusted changes stay as kit updateSkill made them. */
export function capProfileDrop(before: SkillProfile, after: SkillProfile): SkillProfile {
  if (!profileTrusted(before)) return after;
  const floor = (before.measures.e.value * (100 - GRADE.downCapPct)) / 100;
  if (!(after.measures.e.value < floor)) return after;
  return { ...after, measures: { ...after.measures, e: { ...after.measures.e, value: floor } } };
}

/** canon §17: ô 1–5 and Tẩy are `typing-skill`; an Ấn on an elite or general `typing-elite`, on the Thú Vương `typing-boss`. */
export function activityFor(kind: WordSlotKind, onBoss: boolean): ActivityType {
  if (kind === "seal") return onBoss ? "typing-boss" : "typing-elite";
  return "typing-skill";
}
