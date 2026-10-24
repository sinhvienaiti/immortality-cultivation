// Source: new for the kit, from docs/games/BALANCE.md §4.1 and §4.3 (log fixes in shared/game-kit/DRIFT.md)
/**
 * Before-stage levers (BALANCE.md §4.1), set from the profile and written to
 * the replay: effective speed E_eff, the two-way pace k, the new-word share,
 * telegraph time, peak lanes, a difficulty suggestion and a short advice id.
 * Results that feed a sim are rounded to 1/1000 so a replay reads them back.
 * C(E) is the same formula as typing/tempo's typingCapacity; k here goes both
 * ways (0.75–1.30) and replaces tempo's slow-only paceFactor for new work.
 */
import { clamp, round3 } from "./math";
import { FAMILIARITY_SPEED, type Familiarity, type SkillTrend, type SkillValues } from "./profile";

export type EffectiveInput = { readonly e: number; readonly a: number; readonly cv: number; readonly fatigue?: number };

/** Fatigue never takes more than this off E before the formula. */
export const MAX_FATIGUE = 0.15;

/**
 * E_eff = E × (0.6 + 0.4·a²) × (1 − 0.5·CV), held in [0.7E, E].
 * In-session fatigue first lowers E itself: E × (1 − min(fatigue, 0.15)).
 */
export function effectiveE({ e, a, cv, fatigue = 0 }: EffectiveInput): number {
  if (!(e > 0)) return 0;
  const base = e * (1 - clamp(fatigue, 0, MAX_FATIGUE));
  const raw = base * (0.6 + 0.4 * a * a) * (1 - 0.5 * cv);
  return clamp(raw, 0.7 * base, base);
}

/** C(E) = 60 / (0.45 + 12·(ℓ̄ + 1)/(E·d)) words a minute (dragon-hold 00 §4.3). */
export function capacity(e: number, len: number, d: number, react = 0.45, perChar = 12): number {
  if (!(e > 0) || !(d > 0)) return 0;
  return 60 / (react + (perChar * (len + 1)) / (e * d));
}

/** d from the familiarity mix of a stage's words (shares need not sum to 1). */
export function familiarityMix(shares: { readonly [F in Familiarity]?: number }): number {
  let weight = 0;
  let sum = 0;
  for (const familiarity of ["new", "learning", "known"] as const) {
    const share = Math.max(0, shares[familiarity] ?? 0);
    weight += share;
    sum += share * FAMILIARITY_SPEED[familiarity];
  }
  return weight > 0 ? sum / weight : 1;
}

/** What the game supplies for k: ℓ̄ for this E, d, and its reference capacity C_ref. */
export type PaceGame = { readonly len: number; readonly d: number; readonly ref: number };
export type PaceRange = { readonly min: number; readonly max: number };
export const PACE_RANGE: PaceRange = { min: 0.75, max: 1.3 };

/** Dragonhold's reference: 35 WPM, ℓ̄ 4.5, d 0.86 → ≈ 22.7 words a minute. */
export const DRAGON_C_REF = capacity(35, 4.5, 0.86);

/** k = clamp(C(E_eff)/C_ref; 0.75; 1.30), rounded to 1/1000. Spawn gaps and wave clocks × 1/k. */
export function paceK(eEff: number, game: PaceGame, range: PaceRange = PACE_RANGE): number {
  if (!(game.ref > 0)) return 1;
  return round3(clamp(capacity(eEff, game.len, game.d) / game.ref, range.min, range.max));
}

/** A spawn gap or wave clock at pace k: ticks / k, rounded, at least 1. */
export const scaleTicks = (ticks: number, k: number): number => Math.max(1, Math.round(ticks / (k > 0 ? k : 1)));

export type NewWordRules = {
  /** Below this accuracy the share drops by `lowAccuracy`. */
  readonly accuracy: number;
  readonly lowAccuracy: number;
  /** Above this many seconds to recognise a new word the share drops by `slowRecognize`. */
  readonly recognize: number;
  readonly slowRecognize: number;
};
export const NEW_WORD_RULES: NewWordRules = { accuracy: 0.9, lowAccuracy: 0.6, recognize: 1.5, slowRecognize: 0.7 };

/** The stage's new-word share: lower for a < 90 % or new words recognised > 1.5 s; never below the learning stage's promise. */
export function newWordShare(view: Pick<SkillValues, "a" | "recognize">, base: number, floor = 0, rules: NewWordRules = NEW_WORD_RULES): number {
  let share = base;
  if (view.a < rules.accuracy) share *= rules.lowAccuracy;
  if (view.recognize.new > rules.recognize) share *= rules.slowRecognize;
  return round3(clamp(Math.max(share, floor), 0, 1));
}

/** Telegraph time × 0.85–1.5 from telegraph reflex: 0.35 → 1.5, 0.75 (default) → 1.0, 0.95 → 0.85, linear between. */
export function telegraphScale(reflex: number): number {
  const r = clamp(reflex, 0.35, 0.95);
  const scale = r <= 0.75 ? 1.5 - ((r - 0.35) / 0.4) * 0.5 : 1 - ((r - 0.75) / 0.2) * 0.15;
  return round3(clamp(scale, 0.85, 1.5));
}

/** A telegraph's ticks at a scale, never under the game's minimum. */
export const telegraphTicks = (ticks: number, scale: number, minTicks: number): number => Math.max(minTicks, Math.round(ticks * scale));

/** One lane fewer at the peak when speed falls > 35 % in a crowd. */
export function peakLanes(lanes: number, crowdDrop: number, minLanes = 1, threshold = 0.35): number {
  return crowdDrop > threshold ? Math.max(minLanes, lanes - 1) : lanes;
}

export type DifficultySuggestion = "up" | "down" | "stay";

/** Two easy wins in a row (S ≥ 90 %, I ≥ 20 %): suggest up; two losses in a row: down. A suggestion only. */
export function suggestDifficulty(trend: Pick<SkillTrend, "easyWins" | "streak">, after = 2): DifficultySuggestion {
  if (trend.streak <= -after) return "down";
  if (trend.easyWins >= after) return "up";
  return "stay";
}

export type AdviceId = "rest" | "slow-down" | "accuracy" | "steady" | "new-words" | "crowd" | "keep-going";

/** Short lines for the end-of-stage screen and the typing profile (games may use their own). */
export const ADVICE_VI: Readonly<Record<AdviceId, string>> = {
  rest: "Tay bạn đang chậm dần: nghỉ vài phút rồi chơi tiếp nhé.",
  "slow-down": "Bạn gõ nhanh nhưng hay sai: chậm lại một nhịp sẽ được Hoàn hảo nhiều hơn.",
  accuracy: "Gõ chắc từng chữ trước, tốc độ sẽ tự lên.",
  steady: "Nhịp gõ chưa đều: giữ một tốc độ vừa phải cho mọi từ.",
  "new-words": "Từ mới còn lạ: đọc nghĩa và nghe phát âm trước khi gõ.",
  crowd: "Khi đông quái, chọn một từ và gõ dứt điểm rồi mới sang từ khác.",
  "keep-going": "Bạn đang tiến bộ đều. Giữ phong độ!",
};

/** The one most useful piece of advice for this profile. */
export function skillAdvice(view: Pick<SkillValues, "e" | "a" | "cv" | "recognize" | "crowdDrop" | "fatigue">): AdviceId {
  if (view.fatigue >= 0.1) return "rest";
  if (view.a < 0.93 && view.e >= 40) return "slow-down";
  if (view.a < 0.9) return "accuracy";
  if (view.cv > 0.35) return "steady";
  if (view.recognize.new > 1.5) return "new-words";
  if (view.crowdDrop > 0.35) return "crowd";
  return "keep-going";
}
