// Source: games/space-typing@survival-s0 src/feedback/hitstop.ts (kit copy: per-game profile, world scale, held blows; log fixes in shared/game-kit/DRIFT.md)
/**
 * Hit stop (SURVIVAL_MODE_PLAN.md 5.3; dragon-hold 05 §5): which blows earn a
 * short slow-down of the world and for how long. Only the world slows: the
 * game runs its world clock at scale() (or adds worldDt() a frame), down to
 * the profile's stopScale (ship 0, dragon 0.05). The HUD, the word tags, the
 * learning frame and the keyboard never stop.
 *
 * Keys never pass through here: a key goes to the typing core the moment it
 * comes, stop or not. Only the blow of a word just done may wait, in a
 * BlowQueue, until the world runs again (at most holdMaxMs).
 *
 * Two stops are at least stopGapMs apart, a tier's own stops further, and a
 * sweep (30 kills in 0.5 s) earns one short stop, then rests. Times are ms on
 * any clock the caller keeps.
 */
import { SHIP, type FeedbackProfile } from "./profiles";
import { tier } from "./tiers";

const KILL_RING = 64;

export class HitStop {
  private last = -Infinity;
  private readonly lastByTier = new Float64Array(6).fill(-Infinity);
  private readonly kills = new Float64Array(KILL_RING).fill(-Infinity);
  private killCursor = 0;
  private sweepReady = -Infinity;
  /** The stop granted last: from `from` to `until` ms (empty when equal). */
  from = 0;
  until = 0;
  /** Off: no stop is ever granted (a test switch, or a game that does not want them). */
  enabled = true;

  constructor(readonly profile: FeedbackProfile = SHIP) {}

  /** A blow of tier `id` at `now`: the ms of stop granted (0: none). */
  request(id: number, now: number): number {
    const row = tier(id, this.profile.tiers);
    if (!this.enabled || row.stopMs <= 0) return 0;
    const t = Math.max(0, Math.min(5, id | 0));
    if (now - this.last < this.profile.stopGapMs || now - this.lastByTier[t]! < row.stopGapMs) return 0;
    this.lastByTier[t] = now;
    return this.grant(row.stopMs, now);
  }

  /** Counts `count` kills at `now`: the ms of a sweep's stop when this makes enough inside the window (0: none). */
  kill(count: number, now: number): number {
    const sweep = this.profile.sweep;
    for (let index = 0; index < count; index += 1) {
      this.kills[this.killCursor % KILL_RING] = now;
      this.killCursor += 1;
    }
    if (!this.enabled || now < this.sweepReady || this.killCursor < sweep.kills) return 0;
    const oldest = this.kills[(this.killCursor - Math.min(sweep.kills, KILL_RING)) % KILL_RING]!;
    if (now - oldest > sweep.windowMs || now - this.last < this.profile.stopGapMs) return 0;
    this.sweepReady = now + sweep.cooldownMs;
    return this.grant(sweep.stopMs, now);
  }

  private grant(ms: number, now: number): number {
    this.last = now;
    this.from = now;
    this.until = now + ms;
    return ms;
  }

  /** Whether the world is in a stop at `now`. */
  stopped(now: number): boolean {
    return now >= this.from && now < this.until;
  }

  /** The world's speed at `now`: the profile's stopScale inside a stop, else 1. */
  scale(now: number): number {
    return this.stopped(now) ? this.profile.stopScale : 1;
  }

  /** World seconds in a frame of `dt` s that ends at `now` ms: the part inside the stop runs at stopScale. */
  worldDt(dt: number, now: number): number {
    const ms = Math.max(0, dt) * 1000;
    const inside = Math.max(0, Math.min(now, this.until) - Math.max(now - ms, this.from));
    return (ms - inside * (1 - this.profile.stopScale)) / 1000;
  }

  /** Ends any stop now (a pause, a scene change). */
  clear(): void {
    this.until = this.from;
  }
}

/**
 * Blows that wait for the world: a word typed during a stop is done at once
 * (its key already counted), only its blow is held. take() hands blows back
 * in order, all of them once the world runs again, and any that waited
 * holdMaxMs even if it does not (dragon-hold 05 §5: ≤ 70 ms).
 */
export class BlowQueue<T> {
  private readonly blows: T[] = [];
  private readonly at: number[] = [];

  constructor(readonly holdMaxMs = SHIP.holdMaxMs) {}

  get size(): number {
    return this.blows.length;
  }

  push(blow: T, now: number): void {
    this.blows.push(blow);
    this.at.push(now);
  }

  /** The blows to fire at `now`, oldest first, appended to `out`. */
  take(now: number, stopped: boolean, out: T[] = []): T[] {
    let count = 0;
    while (count < this.blows.length && (!stopped || now - this.at[count]! >= this.holdMaxMs)) count += 1;
    for (let index = 0; index < count; index += 1) out.push(this.blows[index]!);
    this.blows.splice(0, count);
    this.at.splice(0, count);
    return out;
  }

  clear(): void {
    this.blows.length = 0;
    this.at.length = 0;
  }
}
