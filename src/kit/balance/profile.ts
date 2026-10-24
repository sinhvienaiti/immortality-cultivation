// Source: new for the kit, from docs/games/BALANCE.md §2 and §4.3 (log fixes in shared/game-kit/DRIFT.md)
/**
 * The player's skill profile (BALANCE.md §2): thirteen factors, each a value
 * and a confidence (the samples behind it). `updateSkill` runs once per stage
 * or wave: an EWMA weighted 0.25 for the new stage, with quit, AFK, short and
 * wildly-off runs left out. `blendSkill` reads it, sliding from the mode's
 * defaults to the measurements as samples grow. Storage stays in the game:
 * `serializeSkill` / `parseSkill` only make and read the text (key `<game>.skill`).
 * Profiles are plain data and never mutated.
 */
import { clamp } from "./math";

export const FAMILIARITIES = ["new", "learning", "known"] as const;
export type Familiarity = (typeof FAMILIARITIES)[number];
export const SKILL_MODES = ["relax", "balanced", "challenge", "learn"] as const;
export type SkillMode = (typeof SKILL_MODES)[number];
export const AUDIENCES = ["adult", "child"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Typing speed by familiarity, relative to known words (dragon-hold 00 §4.3: d mixes these). */
export const FAMILIARITY_SPEED: Readonly<Record<Familiarity, number>> = { new: 0.7, learning: 0.85, known: 1 };

export type ByFamiliarity<T> = { readonly [F in Familiarity]: T };

/**
 * Factor values with no confidence (defaults, or a blend). Units: e and
 * speedBy in WPM; recognize in seconds; everything else a fraction 0–1
 * (backspace is Backspaces per key and may pass 1 for a very messy typist).
 */
export type SkillValues = {
  /** 1 E: real WPM in battle. */
  readonly e: number;
  /** 1 E by word familiarity. */
  readonly speedBy: ByFamiliarity<number>;
  /** 2 a: correct keys / keys. */
  readonly a: number;
  /** 2 words with no error / words. */
  readonly cleanWords: number;
  /** 3 Backspaces / keys. */
  readonly backspace: number;
  /** 3 sloppy words / words. */
  readonly sloppy: number;
  /** 3 dropped locks / (words + dropped locks). */
  readonly abandon: number;
  /** 4 coefficient of variation of per-word time. */
  readonly cv: number;
  /** 5 seconds from a word appearing to its first key, by familiarity. */
  readonly recognize: ByFamiliarity<number>;
  /** 6 mastery of the current word level (from the learning core). */
  readonly vocab: number;
  /** 7 how much speed falls with ≥ 6 live words. */
  readonly crowdDrop: number;
  /** 8 the game's tactics score. */
  readonly tactics: number;
  /** 9 telegraphed attacks handled right / telegraphed. */
  readonly telegraph: number;
  /** 11 speed lost since the start of this session. */
  readonly fatigue: number;
};

export type Measure = { readonly value: number; readonly n: number };
type MeasureOf<T> = T extends number ? Measure : ByFamiliarity<Measure>;
export type SkillMeasures = { readonly [K in keyof SkillValues]: MeasureOf<SkillValues[K]> };

/** 10: recent results. Not blended; read by `suggestDifficulty`. */
export type SkillTrend = {
  /** Stages seen, quits included (AFK runs are not). */
  readonly stages: number;
  /** Wins in a row (> 0) or losses in a row (< 0). Quits leave it. */
  readonly streak: number;
  /** Easy wins in a row (S ≥ 90 % and I ≥ 20 %). */
  readonly easyWins: number;
  /** Quits in a row. */
  readonly quits: number;
  /** EWMA of the HP left at the end (S, 0–1). */
  readonly safety: Measure;
  /** EWMA of near misses a stage (N). */
  readonly nearMisses: Measure;
};

/** 13: input hints only; they never change difficulty. */
export type SkillInput = { readonly ime: boolean; readonly weakKeys: readonly string[] };

export const SKILL_VERSION = 1;

export type SkillProfile = {
  readonly version: typeof SKILL_VERSION;
  /** 12: who plays and the goal they picked. */
  readonly audience: Audience;
  readonly mode: SkillMode;
  readonly measures: SkillMeasures;
  /** 6: the word level being learned. */
  readonly vocabLevel: number;
  /** 11: WPM of this session's first stage, the base fatigue is measured from (0: none yet). */
  readonly sessionWpm: number;
  readonly trend: SkillTrend;
  readonly input: SkillInput;
};

/** The blended profile a game reads. `confidence` is each factor's weight 0–1 on the measurement. */
export type SkillView = SkillValues & {
  readonly audience: Audience;
  readonly mode: SkillMode;
  readonly vocabLevel: number;
  readonly trend: SkillTrend;
  readonly input: SkillInput;
  readonly confidence: SkillValues;
};

const SCALARS = ["e", "a", "cleanWords", "backspace", "sloppy", "abandon", "cv", "vocab", "crowdDrop", "tactics", "telegraph", "fatigue"] as const;
type ScalarKey = (typeof SCALARS)[number];
const PER_FAMILIARITY = ["speedBy", "recognize"] as const;
type FamiliarKey = (typeof PER_FAMILIARITY)[number];

const by = <T>(make: (familiarity: Familiarity) => T): ByFamiliarity<T> => ({ new: make("new"), learning: make("learning"), known: make("known") });

/** Samples at which a factor reads fully from its measurement (words, keys, stages or events). */
export const SKILL_FULL: SkillValues = {
  e: 60,
  speedBy: by(() => 30),
  a: 400,
  cleanWords: 60,
  backspace: 400,
  sloppy: 60,
  abandon: 60,
  cv: 60,
  recognize: by(() => 30),
  vocab: 1,
  crowdDrop: 3,
  tactics: 3,
  telegraph: 12,
  fatigue: 1,
};

/** Accepted range of each factor; values outside are clamped on update and rejected on parse. */
export const SKILL_RANGE: { readonly [K in ScalarKey | FamiliarKey]: readonly [number, number] } = {
  e: [0, 250],
  speedBy: [0, 250],
  a: [0, 1],
  cleanWords: [0, 1],
  backspace: [0, 2],
  sloppy: [0, 1],
  abandon: [0, 1],
  cv: [0, 2],
  recognize: [0, 10],
  vocab: [0, 1],
  crowdDrop: [0, 0.9],
  tactics: [0, 1],
  telegraph: [0, 1],
  fatigue: [0, 0.5],
};

/** Default E by goal (WPM): the mode's floor before anything is measured. */
const DEFAULT_E: { readonly [A in Audience]: Readonly<Record<SkillMode, number>> } = {
  adult: { relax: 25, balanced: 35, challenge: 45, learn: 25 },
  child: { relax: 15, balanced: 15, challenge: 20, learn: 15 },
};

/** Defaults per audience and mode (adult balanced = the standard bot: 35 WPM, 95 %, CV 0.25). */
export function skillDefaults(audience: Audience, mode: SkillMode): SkillValues {
  const e = DEFAULT_E[audience][mode];
  const child = audience === "child";
  return {
    e,
    speedBy: by((familiarity) => e * FAMILIARITY_SPEED[familiarity]),
    a: child ? 0.88 : 0.95,
    cleanWords: child ? 0.6 : 0.8,
    backspace: child ? 0.1 : 0.05,
    sloppy: child ? 0.12 : 0.05,
    abandon: child ? 0.06 : 0.03,
    cv: child ? 0.4 : 0.25,
    recognize: child ? { new: 1.6, learning: 0.9, known: 0.6 } : { new: 1.2, learning: 0.7, known: 0.45 },
    vocab: 0.5,
    crowdDrop: child ? 0.35 : 0.2,
    tactics: child ? 0.3 : 0.5,
    telegraph: child ? 0.6 : 0.75,
    fatigue: 0,
  };
}

const fresh = (value: number): Measure => ({ value, n: 0 });

export function newSkillProfile(audience: Audience = "adult", mode: SkillMode = "balanced"): SkillProfile {
  const base = skillDefaults(audience, mode);
  const measures = {} as Record<string, unknown>;
  for (const key of SCALARS) measures[key] = fresh(base[key]);
  for (const key of PER_FAMILIARITY) measures[key] = by((familiarity) => fresh(base[key][familiarity]));
  return {
    version: SKILL_VERSION,
    audience,
    mode,
    measures: measures as SkillMeasures,
    vocabLevel: 1,
    sessionWpm: 0,
    trend: { stages: 0, streak: 0, easyWins: 0, quits: 0, safety: fresh(0), nearMisses: fresh(0) },
    input: { ime: false, weakKeys: [] },
  };
}

/** Blend weight: 0 with no samples, 1 from `full` samples on. */
const weight = (n: number, full: number): number => (full > 0 ? clamp(n / full, 0, 1) : 1);

/** Defaults blended into measurements by confidence (BALANCE.md §2: "trộn dần sang số đo"). */
export function blendSkill(profile: SkillProfile): SkillView {
  const base = skillDefaults(profile.audience, profile.mode);
  const values = {} as Record<string, unknown>;
  const confidence = {} as Record<string, unknown>;
  for (const key of SCALARS) {
    const measure = profile.measures[key];
    const w = weight(measure.n, SKILL_FULL[key]);
    values[key] = base[key] + w * (measure.value - base[key]);
    confidence[key] = w;
  }
  for (const key of PER_FAMILIARITY) {
    values[key] = by((familiarity) => {
      const measure = profile.measures[key][familiarity];
      return base[key][familiarity] + weight(measure.n, SKILL_FULL[key][familiarity]) * (measure.value - base[key][familiarity]);
    });
    confidence[key] = by((familiarity) => weight(profile.measures[key][familiarity].n, SKILL_FULL[key][familiarity]));
  }
  return {
    ...(values as SkillValues),
    audience: profile.audience,
    mode: profile.mode,
    vocabLevel: profile.vocabLevel,
    trend: profile.trend,
    input: profile.input,
    confidence: confidence as SkillValues,
  };
}

/** What a game reports after a stage or wave. Leave out what it does not measure. */
export type SkillSample = {
  readonly outcome: "won" | "lost" | "quit";
  /** The game saw the player away (no keys for a long time with words live). */
  readonly afk?: boolean;
  /** Words finished. */
  readonly words: number;
  readonly wpm?: number;
  readonly keys?: number;
  readonly correctKeys?: number;
  readonly backspaces?: number;
  readonly cleanWords?: number;
  readonly sloppyWords?: number;
  /** Locks dropped. */
  readonly abandons?: number;
  /** CV of per-letter word time (time / letters, so lengths do not add spread). */
  readonly cv?: number;
  /** Per familiarity: words, their WPM, mean seconds to the first key. */
  readonly byFamiliarity?: { readonly [F in Familiarity]?: { readonly words: number; readonly wpm?: number; readonly recognize?: number } };
  /** Words typed and WPM while ≥ 6 words were live. */
  readonly crowded?: { readonly words: number; readonly wpm: number };
  /** The game's tactics score 0–1 (own-side damage share, gold left, placements, counters). */
  readonly tactics?: number;
  readonly telegraph?: { readonly handled: number; readonly total: number };
  /** From the learning core's lookup: mastery 0–1 of the current level. */
  readonly vocab?: { readonly mastery: number; readonly level: number };
  /** HP left at the end, 0–1 (S). */
  readonly safety?: number;
  /** Idle share of the stage, 0–1 (I). */
  readonly idle?: number;
  readonly nearMisses?: number;
  /** `first`: the first stage of a play session (resets the fatigue base). */
  readonly session?: { readonly first: boolean };
  readonly ime?: boolean;
  readonly weakKeys?: readonly string[];
};

export type SkillRules = {
  /** EWMA weight of the new stage (a measure with no samples takes the stage as is). */
  readonly weight: number;
  /** Fatigue reacts faster: it lives one session. */
  readonly fatigueWeight: number;
  /** Fewer finished words than this: skill is left alone (trend still counts). */
  readonly minWords: number;
  /** Once E is established, a stage WPM outside [low·E, high·E] is an outlier. */
  readonly outlierLow: number;
  readonly outlierHigh: number;
  /** Crowded words needed to measure the attention drop. */
  readonly crowdMinWords: number;
  /** An easy win: S ≥ easySafety and I ≥ easyIdle. */
  readonly easySafety: number;
  readonly easyIdle: number;
  /** Sample counts stop growing here. */
  readonly maxSamples: number;
};

export const SKILL_RULES: SkillRules = {
  weight: 0.25,
  fatigueWeight: 0.5,
  minWords: 8,
  outlierLow: 0.4,
  outlierHigh: 2.5,
  crowdMinWords: 5,
  easySafety: 0.9,
  easyIdle: 0.2,
  maxSamples: 1_000_000,
};

export type SkillRejection = "quit" | "afk" | "short" | "outlier";
export type SkillUpdate = { readonly profile: SkillProfile; readonly accepted: boolean; readonly reason: SkillRejection | null };

const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function ewma(measure: Measure, value: number | undefined, samples: number, range: readonly [number, number], rules: SkillRules, alpha = rules.weight): Measure {
  if (!finite(value) || !(samples > 0)) return measure;
  const v = clamp(value, range[0], range[1]);
  const step = measure.n === 0 ? 1 : alpha;
  return { value: measure.value + step * (v - measure.value), n: Math.min(rules.maxSamples, measure.n + Math.round(samples)) };
}

function nextTrend(trend: SkillTrend, sample: SkillSample, rules: SkillRules): SkillTrend {
  const range: readonly [number, number] = [0, 1];
  if (sample.outcome === "quit") return { ...trend, stages: trend.stages + 1, easyWins: 0, quits: trend.quits + 1 };
  const won = sample.outcome === "won";
  const easy = won && finite(sample.safety) && finite(sample.idle) && sample.safety >= rules.easySafety && sample.idle >= rules.easyIdle;
  return {
    stages: trend.stages + 1,
    streak: won ? Math.max(0, trend.streak) + 1 : Math.min(0, trend.streak) - 1,
    easyWins: easy ? trend.easyWins + 1 : 0,
    quits: 0,
    safety: ewma(trend.safety, sample.safety, 1, range, rules),
    nearMisses: ewma(trend.nearMisses, sample.nearMisses, 1, [0, 100], rules),
  };
}

const ratio = (part: number | undefined, whole: number | undefined): number | undefined => (finite(part) && finite(whole) && whole > 0 ? part / whole : undefined);

/** One stage or wave folded into the profile (BALANCE.md §2: after a stage, never mid-word). */
export function updateSkill(profile: SkillProfile, sample: SkillSample, rules: SkillRules = SKILL_RULES): SkillUpdate {
  if (sample.afk === true) return { profile, accepted: false, reason: "afk" };
  const trend = nextTrend(profile.trend, sample, rules);
  const input: SkillInput = {
    ime: sample.ime ?? profile.input.ime,
    weakKeys: sample.weakKeys !== undefined ? sample.weakKeys.slice(0, 8) : profile.input.weakKeys,
  };
  const reject = (reason: SkillRejection): SkillUpdate => ({ profile: { ...profile, trend, input }, accepted: false, reason });
  if (sample.outcome === "quit") return reject("quit");
  if (!(sample.words >= rules.minWords)) return reject("short");
  const m = profile.measures;
  if (finite(sample.wpm) && m.e.n >= SKILL_FULL.e && (sample.wpm < rules.outlierLow * m.e.value || sample.wpm > rules.outlierHigh * m.e.value)) return reject("outlier");

  const words = sample.words;
  const keys = sample.keys ?? 0;
  const R = SKILL_RANGE;
  const fam = sample.byFamiliarity ?? {};
  const crowded = sample.crowded;
  const crowdDrop =
    crowded !== undefined && crowded.words >= rules.crowdMinWords && finite(sample.wpm) && sample.wpm > 0 ? 1 - crowded.wpm / sample.wpm : undefined;
  const telegraph = sample.telegraph;

  let sessionWpm = profile.sessionWpm;
  let fatigue = m.fatigue;
  if (sample.session?.first === true) {
    sessionWpm = finite(sample.wpm) && sample.wpm > 0 ? sample.wpm : 0;
    fatigue = { value: 0, n: 0 };
  } else if (sample.session !== undefined && sessionWpm > 0 && finite(sample.wpm) && sample.wpm > 0) {
    fatigue = ewma(fatigue, 1 - sample.wpm / sessionWpm, 1, R.fatigue, rules, rules.fatigueWeight);
  }

  const measures: SkillMeasures = {
    e: ewma(m.e, sample.wpm, words, R.e, rules),
    speedBy: by((familiarity) => ewma(m.speedBy[familiarity], fam[familiarity]?.wpm, fam[familiarity]?.words ?? 0, R.speedBy, rules)),
    a: ewma(m.a, ratio(sample.correctKeys, keys), keys, R.a, rules),
    cleanWords: ewma(m.cleanWords, ratio(sample.cleanWords, words), words, R.cleanWords, rules),
    backspace: ewma(m.backspace, ratio(sample.backspaces, keys), keys, R.backspace, rules),
    sloppy: ewma(m.sloppy, ratio(sample.sloppyWords, words), words, R.sloppy, rules),
    abandon: ewma(m.abandon, ratio(sample.abandons, words + (sample.abandons ?? 0)), words + (sample.abandons ?? 0), R.abandon, rules),
    cv: ewma(m.cv, sample.cv, words, R.cv, rules),
    recognize: by((familiarity) => ewma(m.recognize[familiarity], fam[familiarity]?.recognize, fam[familiarity]?.words ?? 0, R.recognize, rules)),
    vocab: sample.vocab !== undefined && finite(sample.vocab.mastery) ? { value: clamp(sample.vocab.mastery, 0, 1), n: Math.max(1, m.vocab.n) } : m.vocab,
    crowdDrop: ewma(m.crowdDrop, crowdDrop, 1, R.crowdDrop, rules),
    tactics: ewma(m.tactics, sample.tactics, 1, R.tactics, rules),
    telegraph: ewma(m.telegraph, ratio(telegraph?.handled, telegraph?.total), telegraph?.total ?? 0, R.telegraph, rules),
    fatigue,
  };
  const vocabLevel = sample.vocab !== undefined && Number.isInteger(sample.vocab.level) && sample.vocab.level > 0 ? sample.vocab.level : profile.vocabLevel;
  return { profile: { ...profile, measures, vocabLevel, sessionWpm, trend, input }, accepted: true, reason: null };
}

/** The game's storage key for the profile (BALANCE.md §2). */
export const skillStorageKey = (gameId: string): string => gameId + ".skill";

export function serializeSkill(profile: SkillProfile): string {
  return JSON.stringify(profile);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readMeasure(raw: unknown, range: readonly [number, number], fallback: number): Measure {
  if (!isRecord(raw)) return fresh(fallback);
  const { value, n } = raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < range[0] || value > range[1]) return fresh(fallback);
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return fresh(fallback);
  return { value, n };
}

const readInt = (raw: unknown, fallback: number, min = Number.MIN_SAFE_INTEGER): number =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= min ? raw : fallback;

/**
 * Text from storage → a profile for the current audience and mode (the
 * settings win over what was stored). Anything unreadable falls back field by
 * field to a fresh value; a missing, broken or unknown version gives a fresh profile.
 */
export function parseSkill(text: string | null | undefined, audience: Audience = "adult", mode: SkillMode = "balanced"): SkillProfile {
  const base = newSkillProfile(audience, mode);
  if (typeof text !== "string" || text.length === 0) return base;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return base;
  }
  if (!isRecord(raw) || raw.version !== SKILL_VERSION) return base;
  const stored = isRecord(raw.measures) ? raw.measures : {};
  const defaults = skillDefaults(audience, mode);
  const measures = {} as Record<string, unknown>;
  for (const key of SCALARS) measures[key] = readMeasure(stored[key], SKILL_RANGE[key], defaults[key]);
  for (const key of PER_FAMILIARITY) {
    const group = isRecord(stored[key]) ? stored[key] : {};
    measures[key] = by((familiarity) => readMeasure(group[familiarity], SKILL_RANGE[key], defaults[key][familiarity]));
  }
  const trendRaw = isRecord(raw.trend) ? raw.trend : {};
  const inputRaw = isRecord(raw.input) ? raw.input : {};
  const sessionWpm = typeof raw.sessionWpm === "number" && Number.isFinite(raw.sessionWpm) && raw.sessionWpm >= 0 && raw.sessionWpm <= 250 ? raw.sessionWpm : 0;
  return {
    ...base,
    measures: measures as SkillMeasures,
    vocabLevel: readInt(raw.vocabLevel, 1, 1),
    sessionWpm,
    trend: {
      stages: readInt(trendRaw.stages, 0, 0),
      streak: readInt(trendRaw.streak, 0),
      easyWins: readInt(trendRaw.easyWins, 0, 0),
      quits: readInt(trendRaw.quits, 0, 0),
      safety: readMeasure(trendRaw.safety, [0, 1], 0),
      nearMisses: readMeasure(trendRaw.nearMisses, [0, 100], 0),
    },
    input: {
      ime: inputRaw.ime === true,
      weakKeys: Array.isArray(inputRaw.weakKeys) ? inputRaw.weakKeys.filter((key): key is string => typeof key === "string" && key.length > 0 && key.length <= 4).slice(0, 8) : [],
    },
  };
}
