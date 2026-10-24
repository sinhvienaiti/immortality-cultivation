// Source: games/space-typing@survival-s0 src/feedback/reaction.ts (kit copy: tiers from the profile; log fixes in shared/game-kit/DRIFT.md)
/**
 * How a struck foe reacts (SURVIVAL_MODE_PLAN.md 5.5; dragon-hold 05 §5), as
 * numbers a crowd writes into its instances (no extra draw call): a white-hot
 * flash for 1–4 frames by tier, a fake knock-back along the blow that springs
 * home (the simulated position never moves), and a squash 0.91 / stretch 1.07
 * over 120 ms. One record per crowd slot; a reused slot (new id) starts clean.
 */
import { SHIP, type FeedbackProfile } from "./profiles";
import { tier } from "./tiers";

export class Reactions {
  private readonly at: Float64Array;
  private readonly id: Int32Array;
  private readonly tierOf: Uint8Array;
  private readonly dirX: Float32Array;
  private readonly dirZ: Float32Array;

  constructor(capacity: number, readonly profile: FeedbackProfile = SHIP) {
    this.at = new Float64Array(capacity).fill(-1e9);
    this.id = new Int32Array(capacity);
    this.tierOf = new Uint8Array(capacity);
    this.dirX = new Float32Array(capacity);
    this.dirZ = new Float32Array(capacity);
  }

  /** A blow of tier `t` on slot `slot` (its owner `id`) at `now` s, along (dx, dz). A weaker blow does not cut a stronger one short. */
  hit(slot: number, id: number, t: number, dx: number, dz: number, now: number): void {
    const fresh = this.id[slot] !== id || now - this.at[slot]! > 0.12 || t >= this.tierOf[slot]!;
    if (!fresh) return;
    this.id[slot] = id;
    this.at[slot] = now;
    this.tierOf[slot] = t;
    const length = Math.hypot(dx, dz) || 1;
    this.dirX[slot] = dx / length;
    this.dirZ[slot] = dz / length;
  }

  /**
   * Writes [flash 0 … 1, offset x, offset z (m), squash y, stretch xz] for
   * slot `slot` owned by `id` at `now` s.
   */
  sample(slot: number, id: number, now: number, out: Float32Array): Float32Array {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    out[4] = 1;
    if (this.id[slot] !== id) return out;
    const age = now - this.at[slot]!;
    if (age < 0 || age > 0.25) return out;
    const row = tier(this.tierOf[slot]!, this.profile.tiers);
    const hot = row.flashFrames / 60;
    out[0] = age <= hot ? 1 : Math.max(0, 1 - (age - hot) / 0.05);
    // A kick that peaks at 30 ms and settles by ~150 ms.
    const k = age / 0.03;
    const push = row.recoil * k * Math.exp(1 - k);
    out[1] = this.dirX[slot]! * push;
    out[2] = this.dirZ[slot]! * push;
    const squash = squashAt(age);
    out[3] = squash;
    out[4] = 2 - squash;
    return out;
  }
}

/** 0.91 at the blow, 1.07 at 40 ms, back to 1 at 120 ms. */
export function squashAt(age: number): number {
  if (age < 0 || age >= 0.12) return 1;
  if (age < 0.04) return 0.91 + (1.07 - 0.91) * (age / 0.04);
  return 1.07 + (1 - 1.07) * ((age - 0.04) / 0.08);
}
