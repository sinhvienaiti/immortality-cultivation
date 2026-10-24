// Source: new for the kit, from docs/games/BALANCE.md §3 and §4.2 (log fixes in shared/game-kit/DRIFT.md)
/**
 * FlowMeter (BALANCE.md §3): fed a small, game-agnostic snapshot every sim
 * tick (or once for N ticks), it measures pressure P, idle I, overload O, the
 * HP margin S, near misses N and the median path fraction at death Q, over a
 * sliding window (4 × 300 ticks = 20 s) for the pace director and over the
 * whole stage for the balance report. Counts are integers and fractions per
 * mille (‰), so `state()` can go into a sim hash; bots and people are measured alike.
 */
import { toMilli } from "./math";

export type FlowSnapshot = {
  /** A real threat now: a foe in the close ring, a big attack telegraphed (the game decides). Losing HP counts by itself. */
  readonly danger: boolean;
  /** Own HP (or lives) as a fraction 0–1. */
  readonly hp: number;
  /** Words live on screen. */
  readonly live: number;
  /** Live words are at the game's cap. */
  readonly capped: boolean;
  /** Words waiting to be shown. */
  readonly backlog: number;
  /** The player is typing or has a decision open (shop, placement, skill choice). */
  readonly busy: boolean;
  /** Path fractions (0–1) of the foes killed since the last feed. */
  readonly kills?: readonly number[];
  /** Locks the player dropped since the last feed. */
  readonly abandons?: number;
  /** Damage since the last feed: by typing, and by everything else (traps, troops, skills). */
  readonly damage?: { readonly typed: number; readonly other: number };
};

export type FlowRules = {
  /** Ticks per window bucket (the director judges at each bucket's end). */
  readonly bucketTicks: number;
  /** Buckets in the window: 4 × 300 = 20 s at 60 Hz. */
  readonly windowBuckets: number;
  /** More waiting words than this is overload. */
  readonly backlogMax: number;
  /** This many dropped locks within `abandonTicks` is overload ("bỏ khóa liên tục"). */
  readonly abandonBurst: number;
  readonly abandonTicks: number;
  /** HP lost within this many ticks counts as pressure. */
  readonly hurtTicks: number;
  /** A near miss: HP below `nearBelow` ‰, then back to `nearRecover` ‰ or a won stage. */
  readonly nearBelow: number;
  readonly nearRecover: number;
};

export const FLOW_RULES: FlowRules = { bucketTicks: 300, windowBuckets: 4, backlogMax: 4, abandonBurst: 2, abandonTicks: 300, hurtTicks: 60, nearBelow: 300, nearRecover: 400 };

/** The last ≤ 20 s. p, i, o, hp, hpMin, hpLoss and q in ‰. */
export type FlowWindow = {
  readonly ticks: number;
  readonly p: number;
  readonly i: number;
  readonly o: number;
  /** HP now. */
  readonly hp: number;
  readonly hpMin: number;
  /** HP lost within the window (sum of drops). */
  readonly hpLoss: number;
  /** HP below the near-miss line now. */
  readonly nearDefeat: boolean;
  readonly kills: number;
  /** Median path fraction at death; null with no kills. */
  readonly q: number | null;
};

export type FlowOutcome = "won" | "lost" | "quit";

/** The whole stage. p, i, o, s, hpMin, q and support in ‰; n a count. */
export type FlowSummary = {
  readonly outcome: FlowOutcome;
  readonly ticks: number;
  readonly p: number;
  readonly i: number;
  readonly o: number;
  /** HP left at the end (0 on a loss). */
  readonly s: number;
  readonly hpMin: number;
  readonly n: number;
  readonly kills: number;
  readonly q: number | null;
  /** Share of damage not done by typing ("phần phe ta"); null when the game reports no damage. */
  readonly support: number | null;
};

type Bucket = { index: number; ticks: number; p: number; i: number; o: number; hpMin: number; hpLoss: number; kills: number[] };

const emptyBucket = (): Bucket => ({ index: -1, ticks: 0, p: 0, i: 0, o: 0, hpMin: 1000, hpLoss: 0, kills: [] });

const perMille = (part: number, whole: number): number => (whole > 0 ? Math.round((part * 1000) / whole) : 0);

/** Median of a ‰ histogram (mean of the two middles, floored). */
function histogramMedian(histogram: readonly number[], count: number): number | null {
  if (count === 0) return null;
  const lowRank = (count - 1) >> 1;
  const highRank = count >> 1;
  let seen = 0;
  let low = -1;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]!;
    if (low < 0 && seen > lowRank) low = value;
    if (seen > highRank) return Math.floor((low + value) / 2);
  }
  return low;
}

export class FlowMeter {
  readonly rules: FlowRules;
  private fed = 0;
  private hpNow = -1;
  private hurtAt = -1;
  private armed = false;
  private near = 0;
  private abandonAt: number[] = [];
  private readonly ring: Bucket[];
  private p = 0;
  private i = 0;
  private o = 0;
  private hpMin = 1000;
  private kills = 0;
  private readonly deaths: number[] = new Array<number>(1001).fill(0);
  private typed = 0;
  private other = 0;

  constructor(rules: Partial<FlowRules> = {}) {
    this.rules = { ...FLOW_RULES, ...rules };
    if (!(this.rules.bucketTicks >= 1) || !(this.rules.windowBuckets >= 1)) throw new Error("flow: bucketTicks and windowBuckets must be ≥ 1");
    this.ring = Array.from({ length: this.rules.windowBuckets }, emptyBucket);
  }

  /** Ticks fed so far. */
  get ticks(): number {
    return this.fed;
  }

  /** One snapshot standing for `ticks` sim ticks (kills, drops and damage count once). */
  feed(snapshot: FlowSnapshot, ticks = 1): void {
    const count = Math.floor(ticks);
    if (!(count >= 1)) return;
    const rules = this.rules;
    const hp = toMilli(snapshot.hp);
    let loss = 0;
    if (this.hpNow >= 0 && hp < this.hpNow) {
      loss = this.hpNow - hp;
      this.hurtAt = this.fed;
    }
    this.hpNow = hp;
    if (hp < this.hpMin) this.hpMin = hp;
    if (!this.armed && hp < rules.nearBelow) this.armed = true;
    else if (this.armed && hp >= rules.nearRecover) {
      this.armed = false;
      this.near += 1;
    }
    const drops = Math.max(0, Math.floor(snapshot.abandons ?? 0));
    for (let index = 0; index < drops; index += 1) this.abandonAt.push(this.fed);
    const kills = (snapshot.kills ?? []).map(toMilli);
    for (const fraction of kills) this.deaths[fraction]! += 1;
    this.kills += kills.length;
    if (snapshot.damage !== undefined) {
      if (snapshot.damage.typed > 0) this.typed += snapshot.damage.typed;
      if (snapshot.damage.other > 0) this.other += snapshot.damage.other;
    }
    const idle = snapshot.live <= 0 && !snapshot.busy;
    const crowded = snapshot.capped || snapshot.backlog > rules.backlogMax;

    for (let step = 0; step < count; step += 1) {
      const tick = this.fed;
      while (this.abandonAt.length > 0 && this.abandonAt[0]! <= tick - rules.abandonTicks) this.abandonAt.shift();
      const pressure = snapshot.danger || (this.hurtAt >= 0 && tick - this.hurtAt < rules.hurtTicks);
      const overload = crowded || this.abandonAt.length >= rules.abandonBurst;
      const bucket = this.bucketAt(tick);
      bucket.ticks += 1;
      if (pressure) bucket.p += 1;
      if (idle) bucket.i += 1;
      if (overload) bucket.o += 1;
      if (hp < bucket.hpMin) bucket.hpMin = hp;
      if (step === 0) {
        bucket.hpLoss += loss;
        bucket.kills.push(...kills);
      }
      if (pressure) this.p += 1;
      if (idle) this.i += 1;
      if (overload) this.o += 1;
      this.fed += 1;
    }
  }

  private bucketAt(tick: number): Bucket {
    const index = Math.floor(tick / this.rules.bucketTicks);
    const slot = index % this.rules.windowBuckets;
    let bucket = this.ring[slot]!;
    if (bucket.index !== index) {
      bucket = emptyBucket();
      bucket.index = index;
      this.ring[slot] = bucket;
    }
    return bucket;
  }

  /** The last ≤ windowBuckets buckets (the current one may be partial). */
  window(): FlowWindow {
    const last = Math.floor((this.fed - 1) / this.rules.bucketTicks);
    let ticks = 0;
    let p = 0;
    let i = 0;
    let o = 0;
    let hpMin = 1000;
    let hpLoss = 0;
    const kills: number[] = [];
    for (const bucket of this.ring) {
      if (bucket.index < 0 || bucket.ticks === 0 || bucket.index <= last - this.rules.windowBuckets || bucket.index > last) continue;
      ticks += bucket.ticks;
      p += bucket.p;
      i += bucket.i;
      o += bucket.o;
      hpMin = Math.min(hpMin, bucket.hpMin);
      hpLoss += bucket.hpLoss;
      kills.push(...bucket.kills);
    }
    const hp = this.hpNow < 0 ? 1000 : this.hpNow;
    kills.sort((a, b) => a - b);
    const mid = kills.length >> 1;
    const q = kills.length === 0 ? null : kills.length % 2 === 1 ? kills[mid]! : Math.floor((kills[mid - 1]! + kills[mid]!) / 2);
    return { ticks, p: perMille(p, ticks), i: perMille(i, ticks), o: perMille(o, ticks), hp, hpMin: ticks > 0 ? hpMin : hp, hpLoss, nearDefeat: hp < this.rules.nearBelow, kills: kills.length, q };
  }

  /** Empty the window (stage totals stay), e.g. when a wave starts after a break. */
  resetWindow(): void {
    for (let slot = 0; slot < this.ring.length; slot += 1) this.ring[slot] = emptyBucket();
  }

  /** The whole stage so far; a dip still below the line counts as a near miss only on a win. */
  summary(outcome: FlowOutcome): FlowSummary {
    const hp = this.hpNow < 0 ? 1000 : this.hpNow;
    const damage = this.typed + this.other;
    return {
      outcome,
      ticks: this.fed,
      p: perMille(this.p, this.fed),
      i: perMille(this.i, this.fed),
      o: perMille(this.o, this.fed),
      s: outcome === "lost" ? 0 : hp,
      hpMin: this.fed > 0 ? this.hpMin : hp,
      n: this.near + (this.armed && outcome === "won" ? 1 : 0),
      kills: this.kills,
      q: histogramMedian(this.deaths, this.kills),
      support: damage > 0 ? Math.round((this.other * 1000) / damage) : null,
    };
  }

  /** Every number of the meter's state, for a sim hash. */
  state(): number[] {
    const out = [this.fed, this.hpNow, this.hurtAt, this.armed ? 1 : 0, this.near, this.p, this.i, this.o, this.hpMin, this.kills, this.typed, this.other, this.abandonAt.length, ...this.abandonAt];
    for (const bucket of this.ring) out.push(bucket.index, bucket.ticks, bucket.p, bucket.i, bucket.o, bucket.hpMin, bucket.hpLoss, bucket.kills.length, ...bucket.kills);
    this.deaths.forEach((count, fraction) => {
      if (count > 0) out.push(fraction, count);
    });
    return out;
  }
}
