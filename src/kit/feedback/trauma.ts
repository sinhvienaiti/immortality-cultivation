// Source: games/space-typing@survival-s0 src/feedback/trauma.ts (kit copy: numbers from the profile, random passed in; log fixes in shared/game-kit/DRIFT.md)
/**
 * One camera shake for every blow (SURVIVAL_MODE_PLAN.md 5.2; dragon-hold
 * 05 §5): shake = trauma², trauma falls `decay` a second, at most `maxPx` at
 * 1080p (ship 14, dragon 12); plus a directional kick (2–`kickPx` px against
 * the shot) that springs back in ~120 ms. Both scale with the player's
 * screen-shake setting (0 turns them off) and stop under reduced motion.
 * Output is in CSS pixels for the 3D view only: the HUD, the word tags and
 * the learning frame never move.
 */
import { SHIP, type FeedbackProfile } from "./profiles";

export class Trauma {
  trauma = 0;
  /** The player's setting, 0 … 1. */
  scale = 1;
  reduced = false;
  offsetX = 0;
  offsetY = 0;
  roll = 0;
  private kickX = 0;
  private kickY = 0;
  private time = 0;
  private readonly phase: readonly [number, number, number];

  /** `random` only seeds the noise's phases (pass a seeded one for a repeatable shake). */
  constructor(readonly profile: FeedbackProfile = SHIP, random: () => number = Math.random) {
    this.phase = [random() * 100, random() * 100, random() * 100];
  }

  get enabled(): boolean {
    return this.scale > 0 && !this.reduced;
  }

  add(amount: number): void {
    if (this.enabled) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A push of `px` (2 … kickPx) along the screen direction (dx, dy), e.g. against a muzzle. */
  kick(dx: number, dy: number, px: number): void {
    if (!this.enabled) return;
    const { kickPx } = this.profile.trauma;
    const length = Math.hypot(dx, dy) || 1;
    const size = Math.max(0, Math.min(kickPx, px));
    const cap = (kickPx * 4) / 3;
    this.kickX = Math.max(-cap, Math.min(cap, this.kickX + (dx / length) * size));
    this.kickY = Math.max(-cap, Math.min(cap, this.kickY + (dy / length) * size));
  }

  /** Advances by `dt` s; `height` is the view's CSS height (the shake scales from 1080p). */
  update(dt: number, height: number): void {
    const { maxPx, decay, kickRate } = this.profile.trauma;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - decay * dt);
    const keep = Math.exp(-kickRate * dt);
    this.kickX *= keep;
    this.kickY *= keep;
    if (!this.enabled) {
      this.trauma = 0;
      this.kickX = this.kickY = this.offsetX = this.offsetY = this.roll = 0;
      return;
    }
    const shake = this.trauma * this.trauma * maxPx * (height / 1080) * this.scale;
    const t = this.time;
    const [a, b, c] = this.phase;
    // Smooth noise: three detuned sines per axis, the pair kept inside the unit
    // circle (each axis reaches 1, and both at once would be √2 × maxPx).
    let nx = (Math.sin(t * 37 + a) + Math.sin(t * 61 + b) * 0.6 + Math.sin(t * 97 + c) * 0.3) / 1.9;
    let ny = (Math.sin(t * 41 + c) + Math.sin(t * 67 + a) * 0.6 + Math.sin(t * 89 + b) * 0.3) / 1.9;
    const length = Math.hypot(nx, ny);
    if (length > 1) {
      nx /= length;
      ny /= length;
    }
    this.offsetX = nx * shake + this.kickX * this.scale;
    this.offsetY = ny * shake + this.kickY * this.scale;
    this.roll = Math.sin(t * 29 + b) * this.trauma * this.trauma * 0.012 * this.scale;
  }
}
