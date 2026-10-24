// Source: games/space-typing@feat/td-1a6 src/td/content/rules.ts (typing numbers only; kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * The typing rules a game passes in. TD kept these numbers as constants in
 * its rules.ts (LETTERS, SCORE, LIFE, EMIT/CAP, KIND_PRIORITY); here they are
 * one parameter, so each game keeps its own numbers in its content data.
 * TD_TYPING is TD 1A.6 exactly; a game starts from it and changes what its
 * design says (typingConfig). Times are seconds; compileTyping turns them
 * into ticks once.
 */

export type LetterRules = {
  /** A released first letter rests this long before it may start a word again. */
  readonly cooldownS: number;
  /** Free letters the reserve kinds leave to the others. */
  readonly reserve: number;
  /** Letters that start no word up to `avoidUntilLevel` (vocabulary level). */
  readonly avoid: string;
  readonly avoidUntilLevel: number;
  /** Tier 2 opens early (at ≤ this many free letters) up to this vocabulary level. */
  readonly tier2EarlyFree: number;
  readonly tier2EarlyMaxLevel: number;
  /** Words longer than this are never checked for one edit apart. */
  readonly maxEditCheckLen: number;
  /** A letter counts as available (A) when it starts at least this many words. */
  readonly minWordsPerLetter: number;
};

export type RouterRules = {
  /** A lock with at most this many letters in and no error may soft-switch (TD 6.15: 1). */
  readonly softSwitchMaxTyped: number;
  /** Seconds a lock with ≥ 1 letter in keeps its target alive against other sources (0: off). */
  readonly protectS: number;
  /** The window opens at the first lethal blow from another source, or at the lock's first letter. */
  readonly protectFrom: "lethal" | "lock";
  /**
   * Esc (unlock) always drops the letters typed. "drop" (TD, and the default
   * when absent) also wipes the word's wrong keys, so typed again it starts
   * clean; "keep" leaves them on the word until it is done or gone, as
   * Backspace does, so its grade and learning event still count them
   * (dragon-hold 01 §3.3).
   */
  readonly unlockErrors?: "drop" | "keep";
};

/** TD 6.4's word life L_w = clamp(base + perChar·(len + 1)/(E·d); min; max) × k. */
export type LifeRules = { readonly base: number; readonly perChar: number; readonly min: number; readonly max: number };

/** TD 6.6's quality Q_w (accuracy, speed against the word's life). */
export type ScoreRules = {
  readonly errNum: number;
  readonly errMin: number;
  readonly errMax: number;
  readonly fastBase: number;
  readonly fastK: number;
  readonly effBase: number;
  readonly effK: number;
  readonly qA: number;
  readonly qS: number;
  /** TD's Flash: no error and S_w at least this. */
  readonly flashS: number;
};

/** A word's grade from its keys alone (gradeWord): errors, then the time from first key to last. */
export type GradeRules = {
  /** t_exp = perChar × (len − 1) / (E × d) seconds. */
  readonly perChar: number;
  /** Flash: no error and t_k ≤ flashPct % of t_exp. */
  readonly flashPct: number;
  /** One error is Good from this many letters, OK below. */
  readonly goodLen: number;
  /** Errors allowed before Sloppy; from `longLen` letters (0: never) `longErrors`. */
  readonly allowed: number;
  readonly longLen: number;
  readonly longErrors: number;
};

/** The live-word budget from A, the letters the stage's words start with (budget.ts). */
export type BudgetRules = {
  readonly totalMax: number;
  readonly slack: number;
  readonly enemyMin: number;
  /** Enemy share of the total, in %. */
  readonly enemyPct: number;
  readonly urgent: number;
  readonly otherMax: number;
};

/** TD 6.5's stream cap: clamp(A − slack; min; max). */
export type StreamRules = { readonly slack: number; readonly min: number; readonly max: number };

export type TypingConfig = {
  readonly tickHz: number;
  /** Word kinds by priority (index 0 first): a word keeps its kind's index. */
  readonly kinds: readonly string[];
  /** Kinds that leave `letters.reserve` free letters to the others. */
  readonly reserveKinds: readonly string[];
  /** Word lengths a deck keeps. */
  readonly words: { readonly min: number; readonly max: number };
  readonly letters: LetterRules;
  readonly router: RouterRules;
  /** Candidates the picker tries before a letter jam. */
  readonly picker: { readonly tries: number };
  readonly life: LifeRules;
  readonly score: ScoreRules;
  readonly grade: GradeRules;
  readonly budget: BudgetRules;
  readonly stream: StreamRules;
};

/** TD 1A.6's numbers (src/td/content/rules.ts), with the kit's additions off or at their design values. */
export const TD_TYPING: TypingConfig = {
  tickHz: 60,
  kinds: ["seal", "direct", "ultWord", "finisher", "pickup", "spellWord", "rare", "call", "review"],
  reserveKinds: ["call", "review"],
  words: { min: 3, max: 8 },
  letters: { cooldownS: 1.0, reserve: 3, avoid: "qxzj", avoidUntilLevel: 10, tier2EarlyFree: 5, tier2EarlyMaxLevel: 3, maxEditCheckLen: 8, minWordsPerLetter: 3 },
  router: { softSwitchMaxTyped: 1, protectS: 0, protectFrom: "lethal", unlockErrors: "drop" },
  picker: { tries: 12 },
  life: { base: 1.2, perChar: 12, min: 3.0, max: 6.0 },
  score: { errNum: 1.5, errMin: 0.15, errMax: 0.4, fastBase: 0.35, fastK: 0.8, effBase: 0.4, effK: 0.6, qA: 0.6, qS: 0.4, flashS: 0.7 },
  grade: { perChar: 12, flashPct: 85, goodLen: 6, allowed: 1, longLen: 12, longErrors: 2 },
  budget: { totalMax: 16, slack: 3, enemyMin: 6, enemyPct: 60, urgent: 2, otherMax: 4 },
  stream: { slack: 6, min: 4, max: 12 },
};

type Patch<T> = { readonly [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? Partial<T[K]> : T[K] };

/** `base` with `patch` laid over it, one level deep (a section's missing numbers keep the base's). */
export function typingConfig(base: TypingConfig, patch: Patch<TypingConfig>): TypingConfig {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const before = (base as Record<string, unknown>)[key];
    const section = typeof value === "object" && !Array.isArray(value) && typeof before === "object" && before !== null && !Array.isArray(before);
    out[key] = section ? { ...before, ...value } : value;
  }
  return out as TypingConfig;
}

/** A config with its times in ticks and its names as indices: what the typing code reads. */
export type TypingRules = TypingConfig & {
  /** Kind name → priority index. */
  readonly kind: Readonly<Record<string, number>>;
  readonly reserved: readonly number[];
  /** Letter codes (a = 0) of `letters.avoid`. */
  readonly avoided: readonly number[];
  readonly cooldownTicks: number;
  readonly protectTicks: number;
};

export function compileTyping(config: TypingConfig): TypingRules {
  const kind: Record<string, number> = {};
  config.kinds.forEach((name, index) => (kind[name] = index));
  for (const name of config.reserveKinds) if (kind[name] === undefined) throw new Error("typing: reserve kind " + name + " is not a kind");
  if (config.kinds.length > 255) throw new Error("typing: at most 255 kinds");
  return {
    ...config,
    kind,
    reserved: config.reserveKinds.map((name) => kind[name]!),
    avoided: [...config.letters.avoid].map((letter) => letter.charCodeAt(0) - 97).filter((code) => code >= 0 && code < 26),
    cooldownTicks: Math.round(config.letters.cooldownS * config.tickHz),
    protectTicks: Math.round(config.router.protectS * config.tickHz),
  };
}
