// Source: new for the kit, from docs/games/BALANCE.md §4.2 (log fixes in shared/game-kit/DRIFT.md)
/**
 * PaceDirector (BALANCE.md §4.2): every 300 ticks it reads the FlowMeter's
 * 20 s window, works out a tension τ against the mode's band, and after 3 low
 * windows in a row steps one notch harder, after 2 high windows one notch
 * easier. Hysteresis: a dead band (`slack`) and one more window to reverse the
 * last step. At most 2 steps a wave; per stage the spawn interval stays within
 * ±15 % and composition/W within ±10 % (a budget the game reports against).
 * Decisions are typed levers; the game maps them through its own step table.
 * It never touches live foes' HP, typing rules or word scoring. Integer state
 * only, so the same fed snapshots give the same decisions; off for oaths,
 * crowns, ranked and duel.
 */
import type { Band } from "./bands";
import type { FlowMeter, FlowWindow } from "./flow";

/** spawn: next group's spawn interval ±; elite: ± one elite affix; peak: move the wave's peak; lull: the lull after the peak; support: one drop near defeat. */
export const PACE_LEVERS = ["spawn", "elite", "peak", "lull", "support"] as const;
export type PaceLever = (typeof PACE_LEVERS)[number];

/** Why the director is off: fixed parameters for fair scores, or the player's setting. */
export type PaceOff = "oath" | "crown" | "ranked" | "duel" | "setting";

/** The game's step table: which levers a step may use (tried in turn) and how big each is. */
export type PaceTable = {
  /** Levers for a harder step. */
  readonly up: readonly PaceLever[];
  /** Levers for an easier step ("support" is used only near defeat, once a wave). */
  readonly down: readonly PaceLever[];
  /** Spawn interval change per step, ‰ of the stage's base interval (70 = ±7 %). */
  readonly spawnStep: number;
  /** Estimated W change of one elite affix, ‰ of the stage's W (the game may report the real one). */
  readonly eliteCost: number;
  /** How far one step moves the peak, ticks (earlier when harder). */
  readonly peakTicks: number;
  /** How much one step changes the lull, ticks (shorter when harder). */
  readonly lullTicks: number;
};

export const PACE_TABLE: PaceTable = { up: ["spawn", "elite", "peak", "lull"], down: ["support", "spawn", "elite", "lull", "peak"], spawnStep: 70, eliteCost: 30, peakTicks: 180, lullTicks: 180 };

export type PaceRules = {
  /** Ticks between judgements (5 s). */
  readonly everyTicks: number;
  /** A window shorter than this is not judged (after a reset at a wave's start). */
  readonly minTicks: number;
  /** Low windows in a row before a harder step; high windows before an easier one. */
  readonly upAfter: number;
  readonly downAfter: number;
  /** Extra windows needed to step against the last step. */
  readonly reverseExtra: number;
  /** ‰ outside the band that still counts as in it. */
  readonly slack: number;
  readonly perWave: number;
  /** Stage caps: spawn interval scale within 1000 ± spawnCap ‰; composition/W within ± compositionCap ‰. */
  readonly spawnCap: number;
  readonly compositionCap: number;
  /** HP below this ‰ (and still falling) is near defeat. */
  readonly nearDefeat: number;
};

export const PACE_RULES: PaceRules = { everyTicks: 300, minTicks: 600, upAfter: 3, downAfter: 2, reverseExtra: 1, slack: 20, perWave: 2, spawnCap: 150, compositionCap: 100, nearDefeat: 300 };

/** +1 harder, −1 easier. */
export type PaceDir = 1 | -1;

export type PaceDecision = {
  readonly id: number;
  readonly tick: number;
  readonly wave: number;
  readonly dir: PaceDir;
  readonly lever: PaceLever;
  /** spawn: change of the spawn scale, ‰ (negative = shorter gaps); elite: ±1 affix; peak, lull: ± ticks; support: 1 drop. */
  readonly amount: number;
  /** Composition/W change charged to the stage budget, ‰ (elite only; the game may report the real one). */
  readonly cost: number;
  /** τ that triggered the step, ‰ (> 0 too hot, < 0 too calm). */
  readonly tension: number;
  /** Net steps after this one (+ harder). */
  readonly level: number;
  /** Spawn interval scale after this step, ‰ of the stage's base (1000). */
  readonly spawnScale: number;
};

export type PaceEvent = { readonly type: "pace" } & PaceDecision;

export type PaceVerdict = { readonly tick: number; readonly tension: number; readonly low: number; readonly high: number; readonly judged: boolean };

export type PaceSummary = {
  readonly steps: number;
  readonly waves: number;
  readonly stepsPerWave: number;
  readonly maxWaveSteps: number;
  readonly spawnMin: number;
  readonly spawnMax: number;
  readonly spawnScale: number;
  readonly composition: number;
  readonly supports: number;
};

/**
 * τ in ‰: how far the window sits outside the band. Too hot (> 0): P above
 * its max, O above its max, or HP still falling and below the band's S min
 * or the near-defeat line. Too calm (< 0): P below its min or I above its max.
 * Hot wins over calm; within `slack` it is 0.
 */
export function paceTension(window: FlowWindow, band: Band, rules: Pick<PaceRules, "slack" | "nearDefeat"> = PACE_RULES): number {
  const over = (value: number, max: number | undefined): number => (max !== undefined && value > max ? value - max : 0);
  const under = (value: number, min: number | undefined): number => (min !== undefined && value < min ? min - value : 0);
  const falling = window.hpLoss > 0;
  const hot = Math.max(
    over(window.p, band.p.max),
    over(window.o, band.o.max),
    falling ? under(window.hp, band.s.min) : 0,
    falling ? under(window.hp, rules.nearDefeat) : 0,
  );
  if (hot > rules.slack) return hot;
  const calm = Math.max(under(window.p, band.p.min), over(window.i, band.i.max));
  return calm > rules.slack ? -calm : 0;
}

export type PaceDirectorOptions = {
  readonly band: Band;
  readonly table?: PaceTable;
  /** Set for oaths, crowns, ranked, duel or the player's "off": no decisions at all. */
  readonly off?: PaceOff | null;
  readonly rules?: Partial<PaceRules>;
};

export class PaceDirector {
  readonly band: Band;
  readonly table: PaceTable;
  readonly rules: PaceRules;
  readonly off: PaceOff | null;
  /** Every step as a `pace` event, in order. */
  readonly log: PaceEvent[] = [];
  /** The last judgement (for a debug overlay). */
  last: PaceVerdict | null = null;
  private wave = 0;
  private waves = 0;
  private waveSteps = 0;
  private maxWaveSteps = 0;
  private supportUsed = false;
  private supports = 0;
  private low = 0;
  private high = 0;
  private lastDir: 0 | PaceDir = 0;
  private judgedAt = 0;
  private spawn = 1000;
  private spawnMin = 1000;
  private spawnMax = 1000;
  private composition = 0;
  private level = 0;
  private cursorUp = 0;
  private cursorDown = 0;
  private nextId = 1;

  constructor(options: PaceDirectorOptions) {
    this.band = options.band;
    this.table = options.table ?? PACE_TABLE;
    this.rules = { ...PACE_RULES, ...options.rules };
    this.off = options.off ?? null;
    if (!(this.rules.everyTicks >= 1)) throw new Error("pace: everyTicks must be ≥ 1");
  }

  get enabled(): boolean {
    return this.off === null;
  }

  /** A new wave: its step count, support drop and window streaks start over. */
  beginWave(wave: number): void {
    this.wave = wave;
    this.waves += 1;
    this.waveSteps = 0;
    this.supportUsed = false;
    this.low = 0;
    this.high = 0;
  }

  /** Call every tick (or after each feed): judges once per `everyTicks` fed ticks. */
  step(meter: FlowMeter): PaceDecision | null {
    const boundary = Math.floor(meter.ticks / this.rules.everyTicks);
    if (boundary <= this.judgedAt) return null;
    this.judgedAt = boundary;
    return this.evaluate(meter.window(), meter.ticks);
  }

  /** One judgement of a window at `tick`. */
  evaluate(window: FlowWindow, tick: number): PaceDecision | null {
    const tension = paceTension(window, this.band, this.rules);
    const judged = this.enabled && window.ticks >= this.rules.minTicks;
    if (judged) {
      if (tension > 0) {
        this.high += 1;
        this.low = 0;
      } else if (tension < 0) {
        this.low += 1;
        this.high = 0;
      } else {
        this.low = 0;
        this.high = 0;
      }
    }
    this.last = { tick, tension, low: this.low, high: this.high, judged };
    if (!judged) return null;
    const needUp = this.rules.upAfter + (this.lastDir === -1 ? this.rules.reverseExtra : 0);
    const needDown = this.rules.downAfter + (this.lastDir === 1 ? this.rules.reverseExtra : 0);
    if (this.high >= needDown) return this.move(-1, tension, tick, window);
    if (this.low >= needUp) return this.move(1, tension, tick, window);
    return null;
  }

  /** Steps add up in ‰ of the stage's base interval: 1000 → 930 → 860, never past ± spawnCap. */
  private spawnAfter(dir: PaceDir): number {
    return this.spawn - dir * this.table.spawnStep;
  }

  private allowed(lever: PaceLever, dir: PaceDir, window: FlowWindow): boolean {
    switch (lever) {
      case "spawn":
        return Math.abs(this.spawnAfter(dir) - 1000) <= this.rules.spawnCap;
      case "elite":
        return Math.abs(this.composition + dir * this.table.eliteCost) <= this.rules.compositionCap;
      case "support":
        return dir === -1 && !this.supportUsed && window.hp < this.rules.nearDefeat;
      default:
        return true;
    }
  }

  private move(dir: PaceDir, tension: number, tick: number, window: FlowWindow): PaceDecision | null {
    if (this.waveSteps >= this.rules.perWave) return null;
    const list = dir === 1 ? this.table.up : this.table.down;
    let lever: PaceLever | null = null;
    if (dir === -1 && list.includes("support") && this.allowed("support", dir, window)) lever = "support";
    else {
      const start = dir === 1 ? this.cursorUp : this.cursorDown;
      for (let offset = 0; offset < list.length; offset += 1) {
        const index = (start + offset) % list.length;
        const candidate = list[index]!;
        if (candidate === "support" || !this.allowed(candidate, dir, window)) continue;
        lever = candidate;
        if (dir === 1) this.cursorUp = index + 1;
        else this.cursorDown = index + 1;
        break;
      }
    }
    if (lever === null) return null;

    let amount = 1;
    let cost = 0;
    switch (lever) {
      case "spawn": {
        const next = this.spawnAfter(dir);
        amount = next - this.spawn;
        this.spawn = next;
        this.spawnMin = Math.min(this.spawnMin, next);
        this.spawnMax = Math.max(this.spawnMax, next);
        break;
      }
      case "elite":
        amount = dir;
        cost = dir * this.table.eliteCost;
        this.composition += cost;
        break;
      case "peak":
        amount = -dir * this.table.peakTicks;
        break;
      case "lull":
        amount = -dir * this.table.lullTicks;
        break;
      case "support":
        this.supportUsed = true;
        this.supports += 1;
        break;
    }
    this.level += dir;
    this.waveSteps += 1;
    this.maxWaveSteps = Math.max(this.maxWaveSteps, this.waveSteps);
    this.lastDir = dir;
    this.low = 0;
    this.high = 0;
    const decision: PaceDecision = { id: this.nextId++, tick, wave: this.wave, dir, lever, amount, cost, tension, level: this.level, spawnScale: this.spawn };
    this.log.push({ type: "pace", ...decision });
    return decision;
  }

  /** The game reports what an elite step really changed (‰ of W; 0 if it could not apply it). */
  report(id: number, cost: number): void {
    const index = this.log.findIndex((event) => event.id === id);
    const event = this.log[index];
    if (event === undefined || event.lever !== "elite") return;
    const actual = Math.round(cost);
    this.composition += actual - event.cost;
    this.log[index] = { ...event, cost: actual };
  }

  /** Composition/W budget left in a direction, ‰. */
  budget(dir: PaceDir): number {
    return Math.max(0, this.rules.compositionCap - dir * this.composition);
  }

  summary(): PaceSummary {
    const waves = Math.max(1, this.waves);
    return {
      steps: this.log.length,
      waves,
      stepsPerWave: this.log.length / waves,
      maxWaveSteps: this.maxWaveSteps,
      spawnMin: this.spawnMin,
      spawnMax: this.spawnMax,
      spawnScale: this.spawn,
      composition: this.composition,
      supports: this.supports,
    };
  }

  /** Every number of the director's state, for a sim hash. */
  state(): number[] {
    return [
      this.wave, this.waves, this.waveSteps, this.maxWaveSteps, this.supportUsed ? 1 : 0, this.supports, this.low, this.high, this.lastDir,
      this.judgedAt, this.spawn, this.spawnMin, this.spawnMax, this.composition, this.level, this.cursorUp, this.cursorDown, this.nextId,
    ];
  }
}
