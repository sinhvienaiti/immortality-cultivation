// Source: new for the kit, from docs/games/BALANCE.md §6 (log fixes in shared/game-kit/DRIFT.md)
/**
 * HumanTypist (BALANCE.md §6): a bot that types like a person, so a game's
 * bots play through its real input path. For a word it plans key events in
 * ticks from the moment the word appears: recognition latency by familiarity,
 * a log-normal per-word speed (mean E, spread CV), wrong keys at 1 − a, then
 * Backspace or a dropped lock by chance; slower in a crowd and as fatigue
 * builds. It also picks targets by a mix, takes time to look at menus and
 * placements, and carries a tactics level for the game's own bot logic. All
 * draws come from one seeded RngStream, in a fixed order.
 */
import type { RngStream } from "../platform/rng";
import { clamp, logNormalDraw } from "./math";
import type { Familiarity } from "./profile";

export const TACTICS = ["none", "poor", "fair", "good"] as const;
/** none: never buys or places (the "type only" bot); poor / fair / good: buy order, placement, skill timing. */
export type Tactics = (typeof TACTICS)[number];

export type TargetMix = { readonly danger: number; readonly nearest: number; readonly first: number };

export type TypistParams = {
  /**
   * E: keystrokes a minute / 5, i.e. a clean word's raw WPM over many words
   * (total letters over total time; wrong keys and Backspaces take keystroke
   * time too, so words with errors come out slower). 0 never types.
   */
  readonly wpm: number;
  /** a: chance each keystroke is right. */
  readonly accuracy: number;
  /** CV of per-word time (log-normal). */
  readonly cv: number;
  /** Seconds from a word appearing to its first key, uniform in [lo, hi], by familiarity. */
  readonly recognize: { readonly [F in Familiarity]: readonly [number, number] };
  /** After a wrong key: chance of Backspace before the right key (otherwise the right key follows). */
  readonly backspace: number;
  /** After a wrong key: chance of dropping the lock instead. */
  readonly abandon: number;
  /** How targets are picked: most dangerous, nearest, first shown (weights). */
  readonly target: TargetMix;
  /** Live words at which attention drops, and how much speed it costs then. */
  readonly crowdAt: number;
  readonly crowdDrop: number;
  /** Seconds spent looking at a placement or a menu, uniform in [lo, hi]. */
  readonly lookAway: readonly [number, number];
  readonly tactics: Tactics;
  /** Chance of answering a telegraphed attack right. */
  readonly reflex: number;
  /** Speed lost per 10 minutes of play (at most 30 % in all). */
  readonly fatigue: number;
};

/** BALANCE.md §6: known 0.35–0.6 s · learning 0.5–0.9 s · new 0.8–1.6 s. */
export const RECOGNIZE: TypistParams["recognize"] = { known: [0.35, 0.6], learning: [0.5, 0.9], new: [0.8, 1.6] };

export const TARGET_MIX: { readonly [T in Tactics]: TargetMix } = {
  none: { danger: 0.4, nearest: 0.4, first: 0.2 },
  poor: { danger: 0.2, nearest: 0.4, first: 0.4 },
  fair: { danger: 0.4, nearest: 0.4, first: 0.2 },
  good: { danger: 0.7, nearest: 0.2, first: 0.1 },
};

const REFLEX: { readonly [T in Tactics]: number } = { none: 0.75, poor: 0.5, fair: 0.75, good: 0.9 };

export const BOT_IDS = ["child", "novice", "steady", "standard", "skilled", "sloppy", "fast", "no-type", "type-only"] as const;
export type BotId = (typeof BOT_IDS)[number];

/** One row of the standard bot set; the rest of the typist's parameters. */
export type BotSpec = {
  readonly id: BotId;
  readonly label: string;
  readonly represents: string;
  readonly wpm: number;
  readonly accuracy: number;
  readonly cv: number;
  readonly tactics: Tactics;
  readonly backspace: number;
  readonly abandon: number;
  readonly crowdDrop: number;
  readonly lookAway: readonly [number, number];
  readonly fatigue: number;
};

/** BALANCE.md §6 "Bộ bot chuẩn". "Không gõ" has no a or CV: it never types (1 and 0 are placeholders). */
export const STANDARD_BOTS: readonly BotSpec[] = [
  { id: "child", label: "Trẻ em", represents: "Hồ sơ trẻ em", wpm: 15, accuracy: 0.88, cv: 0.4, tactics: "poor", backspace: 0.7, abandon: 0.05, crowdDrop: 0.4, lookAway: [2.5, 5], fatigue: 0.08 },
  { id: "novice", label: "Mới", represents: "Người mới tập gõ", wpm: 25, accuracy: 0.92, cv: 0.35, tactics: "fair", backspace: 0.85, abandon: 0.04, crowdDrop: 0.3, lookAway: [2, 4], fatigue: 0.05 },
  { id: "steady", label: "Chậm chắc", represents: "Gõ chậm nhưng chuẩn", wpm: 25, accuracy: 0.99, cv: 0.2, tactics: "fair", backspace: 0.95, abandon: 0.01, crowdDrop: 0.25, lookAway: [1.5, 3], fatigue: 0.03 },
  { id: "standard", label: "Chuẩn", represents: "Người chơi tham chiếu", wpm: 35, accuracy: 0.95, cv: 0.25, tactics: "fair", backspace: 0.9, abandon: 0.02, crowdDrop: 0.2, lookAway: [1.2, 2.5], fatigue: 0.03 },
  { id: "skilled", label: "Khá", represents: "", wpm: 50, accuracy: 0.96, cv: 0.2, tactics: "good", backspace: 0.9, abandon: 0.02, crowdDrop: 0.15, lookAway: [1, 2], fatigue: 0.02 },
  { id: "sloppy", label: "Ẩu", represents: "Gõ nhanh nhưng ẩu", wpm: 50, accuracy: 0.85, cv: 0.35, tactics: "fair", backspace: 0.6, abandon: 0.06, crowdDrop: 0.25, lookAway: [0.8, 1.6], fatigue: 0.04 },
  { id: "fast", label: "Nhanh", represents: "Người gõ giỏi", wpm: 70, accuracy: 0.97, cv: 0.15, tactics: "good", backspace: 0.9, abandon: 0.01, crowdDrop: 0.1, lookAway: [0.6, 1.2], fatigue: 0.02 },
  { id: "no-type", label: "Không gõ", represents: "Kiểm \"gõ là sức chính\"", wpm: 0, accuracy: 1, cv: 0, tactics: "good", backspace: 0, abandon: 0, crowdDrop: 0, lookAway: [1, 2], fatigue: 0 },
  { id: "type-only", label: "Chỉ gõ", represents: "Kiểm \"hỗ trợ cần thiết\"", wpm: 35, accuracy: 0.95, cv: 0.25, tactics: "none", backspace: 0.9, abandon: 0.02, crowdDrop: 0.2, lookAway: [1.2, 2.5], fatigue: 0.03 },
];

export function botSpec(id: BotId): BotSpec {
  const spec = STANDARD_BOTS.find((row) => row.id === id);
  if (spec === undefined) throw new Error("typist: unknown bot " + id);
  return spec;
}

/** Full typist parameters for a standard bot (or a spec), with overrides (e.g. a tactics variant for gate B6). */
export function botParams(bot: BotId | BotSpec, overrides: Partial<TypistParams> = {}): TypistParams {
  const spec = typeof bot === "string" ? botSpec(bot) : bot;
  const tactics = overrides.tactics ?? spec.tactics;
  return {
    wpm: spec.wpm,
    accuracy: spec.accuracy,
    cv: spec.cv,
    recognize: RECOGNIZE,
    backspace: spec.backspace,
    abandon: spec.abandon,
    target: TARGET_MIX[tactics],
    crowdAt: 6,
    crowdDrop: spec.crowdDrop,
    lookAway: spec.lookAway,
    tactics,
    reflex: REFLEX[tactics],
    fatigue: spec.fatigue,
    ...overrides,
  };
}

export type KeyEvent =
  | { readonly at: number; readonly kind: "key"; readonly key: string; readonly correct: boolean }
  | { readonly at: number; readonly kind: "backspace" }
  | { readonly at: number; readonly kind: "abandon" };

export type WordContext = {
  readonly familiarity: Familiarity;
  /** Words live now (attention drops at `crowdAt`). */
  readonly live?: number;
  /** Minutes played this session (fatigue). */
  readonly minute?: number;
};

/** A planned word: events in ticks from the word appearing (or the bot turning to it). */
export type TypedWord = {
  readonly events: readonly KeyEvent[];
  /** Ended with a dropped lock (or the bot never types). */
  readonly abandoned: boolean;
  /** Ticks to the first key. */
  readonly recognize: number;
  /** Tick of the last event. */
  readonly ticks: number;
  readonly errors: number;
};

export type TargetOption = {
  /** Higher is more dangerous. */
  readonly danger: number;
  /** Distance to the player's side (lower is nearer). */
  readonly distance: number;
  /** When it appeared (lower is first). */
  readonly shown: number;
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** Wrong keys before the right one is forced (keeps a plan finite). */
const MAX_MISSES = 4;
const MAX_FATIGUE_DROP = 0.3;

export class HumanTypist {
  readonly params: TypistParams;
  readonly hz: number;
  private readonly rng: RngStream;

  constructor(params: TypistParams, rng: RngStream, hz = 60) {
    this.params = params;
    this.rng = rng;
    this.hz = hz;
  }

  /** WPM now: E, less the crowd drop at ≥ crowdAt live words, less fatigue. */
  speed(context: Pick<WordContext, "live" | "minute"> = {}): number {
    const p = this.params;
    const crowd = (context.live ?? 0) >= p.crowdAt ? 1 - clamp(p.crowdDrop, 0, 0.9) : 1;
    const tired = 1 - clamp((p.fatigue * Math.max(0, context.minute ?? 0)) / 10, 0, MAX_FATIGUE_DROP);
    return Math.max(0, p.wpm) * crowd * tired;
  }

  private uniform(range: readonly [number, number]): number {
    return range[0] + this.rng.float() * (range[1] - range[0]);
  }

  private wrongKey(right: string): string {
    const lower = right.toLowerCase();
    let key = LETTERS[this.rng.int(0, LETTERS.length - 1)]!;
    if (key === lower) key = LETTERS[(LETTERS.indexOf(key) + 1 + this.rng.int(0, LETTERS.length - 2)) % LETTERS.length]!;
    return key;
  }

  /** Plan the key events for `text`. */
  word(text: string, context: WordContext): TypedWord {
    const p = this.params;
    const wpm = this.speed(context);
    const recognizeSeconds = this.uniform(p.recognize[context.familiarity]);
    const recognize = Math.round(recognizeSeconds * this.hz);
    if (!(wpm > 0) || text.length === 0) return { events: [], abandoned: wpm <= 0, recognize, ticks: 0, errors: 0 };
    const perKey = (12 / wpm) * logNormalDraw(this.rng, p.cv);
    const events: KeyEvent[] = [];
    let seconds = recognizeSeconds;
    let started = false;
    let errors = 0;
    const press = (): number => {
      if (started) seconds += perKey * (0.85 + 0.3 * this.rng.float());
      started = true;
      return Math.round(seconds * this.hz);
    };
    for (const right of text) {
      for (let misses = 0; ; misses += 1) {
        const wrong = misses < MAX_MISSES && this.rng.float() >= p.accuracy;
        if (!wrong) {
          events.push({ at: press(), kind: "key", key: right, correct: true });
          break;
        }
        errors += 1;
        events.push({ at: press(), kind: "key", key: this.wrongKey(right), correct: false });
        if (this.rng.float() < p.abandon) {
          events.push({ at: press(), kind: "abandon" });
          return { events, abandoned: true, recognize, ticks: events[events.length - 1]!.at, errors };
        }
        if (this.rng.float() < p.backspace) events.push({ at: press(), kind: "backspace" });
      }
    }
    return { events, abandoned: false, recognize, ticks: events[events.length - 1]!.at, errors };
  }

  /** Index of the target to lock by the mix (−1 for none). Ties go to the earlier option. */
  choose(options: readonly TargetOption[]): number {
    if (options.length === 0) return -1;
    const mix = this.params.target;
    const total = Math.max(0, mix.danger) + Math.max(0, mix.nearest) + Math.max(0, mix.first);
    const roll = this.rng.float() * (total > 0 ? total : 1);
    const pick = total <= 0 || roll < Math.max(0, mix.danger) ? "danger" : roll < Math.max(0, mix.danger) + Math.max(0, mix.nearest) ? "nearest" : "first";
    let best = 0;
    for (let index = 1; index < options.length; index += 1) {
      const option = options[index]!;
      const top = options[best]!;
      const better =
        pick === "danger"
          ? option.danger > top.danger || (option.danger === top.danger && option.distance < top.distance)
          : pick === "nearest"
            ? option.distance < top.distance
            : option.shown < top.shown;
      if (better) best = index;
    }
    return best;
  }

  /** Ticks spent on a placement or a menu. */
  lookAway(): number {
    return Math.round(this.uniform(this.params.lookAway) * this.hz);
  }

  /** Whether the bot answers a telegraphed attack right this time. */
  handlesTelegraph(): boolean {
    return this.rng.chance(this.params.reflex);
  }
}

/** Plays a planned word from a start tick: `due(tick)` hands out the events whose time has come. */
export class KeyPlayer {
  readonly word: TypedWord;
  readonly start: number;
  private next = 0;

  constructor(word: TypedWord, start: number) {
    this.word = word;
    this.start = start;
  }

  get done(): boolean {
    return this.next >= this.word.events.length;
  }

  due(tick: number): KeyEvent[] {
    const out: KeyEvent[] = [];
    while (this.next < this.word.events.length && this.start + this.word.events[this.next]!.at <= tick) out.push(this.word.events[this.next++]!);
    return out;
  }
}
