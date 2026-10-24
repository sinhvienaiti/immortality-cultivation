/**
 * Local feedback profile (canon §21.1, D44, PB-20): the kit FeedbackProfile
 * frame with `id: "dragon"`, T0–T5 numbers, hit-stop and shake overridden.
 * Only the numbers and timing of kit/feedback (import kit/feedback/tiers,
 * profiles, hitstop directly, never the barrel): no AudioCues. Moves to the
 * kit as "tutien" at M0b (SYNC_DEBT.md).
 * Owner: Lane 6. TODO(lane-6).
 */

export interface TierFeedback {
  readonly hitStopMs: number;
  readonly shake: number;
  readonly flash: number;
}

/** TODO(lane-6): T0–T5 (stub cast until filled). */
export const IC_FEEDBACK = {} as Readonly<Record<0 | 1 | 2 | 3 | 4 | 5, TierFeedback>>;
