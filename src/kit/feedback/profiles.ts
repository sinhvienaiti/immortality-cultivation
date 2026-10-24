// Source: new for the kit: one feedback profile per game (ship: Sinh Tồn S0's numbers; dragon: dragon-hold 05 §5, §7.2; td: a calmer start)
/**
 * A game's feedback profile: the tier table and every number the feedback
 * modules used to keep as constants. `ship` is Sinh Tồn S0's numbers; the
 * others start from it and change what their design says. Every module takes
 * a profile and defaults to `ship`.
 */
import { STOP_GAP_MS, SWEEP, TIERS, type SweepRules, type TierProfile } from "./tiers";

export type FeedbackProfileId = "ship" | "dragon" | "td";

/** Kit speech's PRONUNCIATION_EVENT (speech/speech.ts): detail { active }. */
export const PRONUNCIATION_EVENT = "game-kit:pronunciation";

export type FeedbackProfile = {
  readonly id: FeedbackProfileId;
  readonly tiers: readonly TierProfile[];
  readonly stopGapMs: number;
  readonly sweep: SweepRules;
  /** World speed during a hit stop: 0 holds it, dragon-hold slows it to 0.05. Keys and the HUD never stop. */
  readonly stopScale: number;
  /** A word's blow typed during a stop waits at most this long (ms) before it fires. */
  readonly holdMaxMs: number;
  /** Shake: px at 1080p for trauma 1, fall a second; the kick's spring rate and largest push (px). */
  readonly trauma: { readonly maxPx: number; readonly decay: number; readonly kickRate: number; readonly kickPx: number };
  /** Debris: seconds lying on the floor, then fading. */
  readonly debris: { readonly restS: number; readonly fadeS: number };
  /**
   * Damage numbers: roll-up windows (s) on one target, the window in which a
   * number landing on another's young number of its style (below T3) is taken
   * into it, colours by STYLE (normal, crit, perfect, tick), the Perfect label.
   */
  readonly numbers: { readonly mergeS: number; readonly tickMergeS: number; readonly crowdMergeS: number; readonly colors: readonly [string, string, string, string]; readonly label: string; readonly labelColor: string };
  /**
   * Sound: the key style ("click": 5 clicks; "wood": a knock and a bell up a
   * semitone a letter, at most `keySteps`), the window event that ducks shots
   * and hits by `duckDb` while a word is spoken.
   */
  readonly audio: { readonly keys: "click" | "wood"; readonly keySteps: number; readonly pronunciationEvent: string; readonly duckDb: number };
};

export const SHIP: FeedbackProfile = {
  id: "ship",
  tiers: TIERS,
  stopGapMs: STOP_GAP_MS,
  sweep: SWEEP,
  stopScale: 0,
  holdMaxMs: 70,
  trauma: { maxPx: 14, decay: 1.8, kickRate: 38, kickPx: 6 },
  debris: { restS: 8, fadeS: 0.7 },
  numbers: { mergeS: 0.15, tickMergeS: 0.3, crowdMergeS: 0.3, colors: ["#fff4e2", "#ffc93a", "#d9fffb", "#ffd9a8"], label: "HOÀN HẢO", labelColor: "#5ff5e6" },
  audio: { keys: "click", keySteps: 0, pronunciationEvent: PRONUNCIATION_EVENT, duckDb: 6 },
};

/**
 * Dragon-hold 05 §5: the same tiers, the world slowed to 0.05 instead of held,
 * shake at most 12 px, shards lie 6 s, no gold numbers (gold is money): no
 * random crits, so "crit" is a strong blow in cream; Flash and Perfect white
 * with a teal label. Keys (§7.2): wood and a small bell, a semitone up a
 * letter, at most 12.
 */
export const DRAGON: FeedbackProfile = {
  ...SHIP,
  id: "dragon",
  stopScale: 0.05,
  trauma: { ...SHIP.trauma, maxPx: 12 },
  debris: { restS: 6, fadeS: 0.7 },
  numbers: { ...SHIP.numbers, colors: ["#fff4e2", "#ffe9cf", "#f2fffd", "#f5e6c8"], labelColor: "#5ff5e6" },
  audio: { ...SHIP.audio, keys: "wood", keySteps: 12 },
};

/** Lời Gọi (TD): a calm top-down view: stops only from T3 and shorter, a smaller shake, shards gone sooner. */
export const TD: FeedbackProfile = {
  ...DRAGON,
  id: "td",
  tiers: TIERS.map((row, id) => ({ ...row, stopMs: [0, 0, 0, 25, 35, 50][id]! })),
  stopScale: 0.1,
  trauma: { ...SHIP.trauma, maxPx: 8 },
  debris: { restS: 4, fadeS: 0.5 },
  audio: { ...SHIP.audio },
};

export const FEEDBACK_PROFILES: Readonly<Record<FeedbackProfileId, FeedbackProfile>> = { ship: SHIP, dragon: DRAGON, td: TD };

export const feedbackProfile = (id: FeedbackProfileId): FeedbackProfile => FEEDBACK_PROFILES[id];
