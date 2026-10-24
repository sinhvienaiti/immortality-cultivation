// Source: games/space-typing@feat/td-1a6 src/td/typing/scorer.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Word life and scoring (docs/td/TYPING_DEFENSE_DESIGN.md 6.4, 6.6). Two
 * ways to grade a finished word, both from numbers the session keeps
 * (wordTiming: errors, ticks to the first key, first key to last, birth to
 * done):
 *
 * - scoreWord, TD's: errors weigh most, with slack for long words; speed
 *   counts from the moment the word appeared, against the word's life L_w.
 *     L_w = clamp(base + perChar·(len + 1)/(E·d); min; max) × k
 *     A_w = clamp(1 − e·clamp(errNum/len; errMin; errMax); 0; 1)
 *     S_w = clamp((L_w − t_done)/(L_w − t_fast); 0; 1),  t_fast = fastBase + fastK·perChar·(len + 1)/(E·d)
 *     Q_w = qA·A_w + qS·S_w·(effBase + effK·A_w)
 * - gradeWord, from the keys alone (dragon-hold 01 §3.7): errors, then
 *   Flash when the keys took at most flashPct % of t_exp = perChar·(len − 1)/(E·d).
 *   Integer arithmetic only (d in per mille), so a replay grades the same.
 */
import type { GradeRules, TypingRules } from "./config";

export type Grade = "flash" | "perfect" | "good" | "ok" | "sloppy";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Seconds to type a word at the expected speed E (perChar s per WPM-minute of 5 letters plus the space). */
export const typeSeconds = (rules: TypingRules, len: number, expected: number, d: number): number => (rules.life.perChar * (len + 1)) / (expected * d);

/** L_w × `k` (a mode's k_L), at least `floor` seconds. */
export function lifeSeconds(rules: TypingRules, len: number, expected: number, d: number, k = 1, floor = 0): number {
  const { base, min, max } = rules.life;
  return Math.max(floor, clamp(base + typeSeconds(rules, len, expected, d), min, max) * k);
}

export const lifeTicks = (rules: TypingRules, len: number, expected: number, d: number, k = 1, floor = 0): number =>
  Math.round(lifeSeconds(rules, len, expected, d, k, floor) * rules.tickHz);

export type Score = { grade: Grade; accuracy: number; speed: number; speedEff: number; quality: number };

/** Errors allowed before a word is sloppy: `allowed`, or `longErrors` from `longLen` letters. */
export const allowedErrors = (grade: GradeRules, len: number): number => (grade.longLen > 0 && len >= grade.longLen ? grade.longErrors : grade.allowed);

/** TD's score of a finished word of `len` letters, `errors` wrong keys, `doneTicks` after it appeared, with life `life` ticks. */
export function scoreWord(rules: TypingRules, len: number, errors: number, life: number, doneTicks: number, expected: number, d: number): Score {
  const S = rules.score;
  const hz = rules.tickHz;
  const accuracy = clamp(1 - errors * clamp(S.errNum / len, S.errMin, S.errMax), 0, 1);
  const lifeS = life / hz;
  const fast = S.fastBase + S.fastK * typeSeconds(rules, len, expected, d);
  const speed = lifeS > fast ? clamp((lifeS - doneTicks / hz) / (lifeS - fast), 0, 1) : doneTicks <= life ? 1 : 0;
  const speedEff = speed * (S.effBase + S.effK * accuracy);
  const quality = S.qA * accuracy + S.qS * speedEff;
  let grade: Grade;
  if (errors === 0) grade = speed >= S.flashS ? "flash" : "perfect";
  else if (errors <= allowedErrors(rules.grade, len)) grade = len >= rules.grade.goodLen ? "good" : "ok";
  else grade = "sloppy";
  return { grade, accuracy, speed, speedEff, quality };
}

/** What gradeWord reads: a word's length, its errors and the ticks from its first key to its last (t_k). */
export type GradeInput = { readonly len: number; readonly errors: number; readonly typing: number };

/** t_exp in ticks (a float): perChar·(len − 1)/(E·d) seconds, d in per mille. */
export const expectedTicks = (rules: TypingRules, len: number, expected: number, dPermille: number): number =>
  (rules.grade.perChar * Math.max(0, len - 1) * rules.tickHz * 1000) / (expected * dPermille);

/**
 * The grade from the keys alone. `allowed` overrides the errors allowed before
 * Sloppy (dragon-hold's boss chains allow 2). E in WPM (> 0), d in per mille.
 */
export function gradeWord(rules: TypingRules, input: GradeInput, expected: number, dPermille: number, allowed = allowedErrors(rules.grade, input.len)): Grade {
  const G = rules.grade;
  if (input.errors === 0) {
    // t_k ≤ flashPct % · perChar·(len − 1)/(E·d), both sides × 100·E·d·1000 to stay in integers.
    const lhs = input.typing * 100 * expected * dPermille;
    const rhs = G.flashPct * G.perChar * Math.max(0, input.len - 1) * rules.tickHz * 1000;
    return lhs <= rhs ? "flash" : "perfect";
  }
  if (input.errors <= allowed) return input.len >= G.goodLen ? "good" : "ok";
  return "sloppy";
}

/** Raw typing speed, first key to last (TK 6.6): only for the baseline B, never for scoring. Any clock in ms. */
export const rawWpm = (len: number, firstMs: number, lastMs: number): number => (lastMs > firstMs ? ((len - 1) / 5) * (60000 / (lastMs - firstMs)) : 0);
