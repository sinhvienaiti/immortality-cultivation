/**
 * Local feedback profile (canon §21.1, D44, PB-20): the kit FeedbackProfile
 * frame with `id: "dragon"` (the kit's profile ids are closed), T0–T5 numbers,
 * hit-stop and shake overridden for a fixed camera that shows the whole pass
 * and a sword storm of ~60 hits a second (canon §20.3): only T3+ blows stop
 * the world, the shake is smaller than Rồng's, and reduced motion (canon §24)
 * takes the shake off and keeps stops short. Only the numbers and timing of
 * kit/feedback are used (tiers, profiles, hitstop, trauma, reaction, imported
 * file by file, never the barrel): no AudioCues. Moves to the kit as "tutien"
 * at M0b (docs/SYNC_DEBT.md). Every number below is this round's proposal
 * (đề xuất của vòng này, chờ chủ dự án xác nhận): the canon names the tiers,
 * not their values.
 * Owner: Lane 6.
 */
import { DRAGON, type FeedbackProfile } from "../kit/feedback/profiles";
import type { TierProfile } from "../kit/feedback/tiers";
import type { FeedbackTier } from "../content/types";

export interface TierFeedback {
  readonly hitStopMs: number;
  readonly shake: number;
  readonly flash: number;
}

/** Per tier T0–T5: hit stop (ms), trauma added, hot flash frames, recoil (m), damage-number size. */
const ROWS: readonly { readonly stopMs: number; readonly trauma: number; readonly flash: number; readonly recoil: number; readonly size: number | null }[] = [
  // T0: đánh nền, a swarm beast's death: no stop, no shake, no number.
  { stopMs: 0, trauma: 0, flash: 0, recoil: 0, size: null },
  // T1: one sword of ô 1, a mechanism tick.
  { stopMs: 0, trauma: 0, flash: 1, recoil: 0.14, size: 1 },
  // T2: Xuyên Vân, a Phong Lang's death: still no stop (vạn kiếm lands ~60 hits a second).
  { stopMs: 0, trauma: 0.04, flash: 2, recoil: 0.24, size: 1.25 },
  // T3: a Vừa beast's death, Thiết Bối Xung on a pillar.
  { stopMs: 30, trauma: 0.12, flash: 3, recoil: 0.3, size: 1.5 },
  // T4: an elite or a general falls, phá thế.
  { stopMs: 45, trauma: 0.24, flash: 4, recoil: 0.4, size: 1.75 },
  // T5: the Thú Vương's phase, its fall, Thiên Hà Kiếm Vũ's last volley.
  { stopMs: 70, trauma: 0.42, flash: 4, recoil: 0.55, size: 2.2 },
];

const tiers: readonly TierProfile[] = DRAGON.tiers.map((row, id) => {
  const own = ROWS[id]!;
  return {
    ...row,
    stopMs: own.stopMs,
    trauma: own.trauma,
    flashFrames: own.flash,
    recoil: own.recoil,
    number: own.size === null ? null : { size: own.size, life: row.number?.life ?? 0.6, pop: row.number?.pop ?? 1.2 },
  };
});

/**
 * The game's profile: Rồng's frame (world slowed to 0.05 inside a stop, never
 * held; damage numbers without money gold) with the rows above, a smaller
 * shake (10 px at 1080p), a wider gap between stops (250 ms) and a sweep stop
 * only for 40 kills in 0.5 s.
 */
export const IC_FEEDBACK_PROFILE: FeedbackProfile = {
  ...DRAGON,
  id: "dragon",
  tiers,
  stopGapMs: 250,
  sweep: { ...DRAGON.sweep, kills: 40 },
  trauma: { ...DRAGON.trauma, maxPx: 10, kickPx: 4 },
  numbers: { ...DRAGON.numbers, label: "CHỚP" },
};

/** canon §24 "không dừng hình dài": the longest stop with reduced motion on, ms. */
export const REDUCED_STOP_MS = 30;

/** Reduced motion (canon §24): no camera shake, stops at most REDUCED_STOP_MS, the sweep stop off. */
export function reducedProfile(profile: FeedbackProfile = IC_FEEDBACK_PROFILE): FeedbackProfile {
  return {
    ...profile,
    tiers: profile.tiers.map((row) => ({ ...row, trauma: 0, recoil: 0, stopMs: Math.min(row.stopMs, REDUCED_STOP_MS) })),
    sweep: { ...profile.sweep, stopMs: 0 },
    trauma: { ...profile.trauma, maxPx: 0, kickPx: 0 },
  };
}

const REDUCED_PROFILE = reducedProfile();

/** The profile for the motion setting. */
export function feedbackFor(reduced: boolean): FeedbackProfile {
  return reduced ? REDUCED_PROFILE : IC_FEEDBACK_PROFILE;
}

/** T0–T5 at a glance (hit stop ms, shake trauma, flash frames), from the profile's rows. */
export const IC_FEEDBACK: Readonly<Record<FeedbackTier, TierFeedback>> = {
  0: rowOf(0),
  1: rowOf(1),
  2: rowOf(2),
  3: rowOf(3),
  4: rowOf(4),
  5: rowOf(5),
};

function rowOf(id: FeedbackTier): TierFeedback {
  const row = IC_FEEDBACK_PROFILE.tiers[id]!;
  return { hitStopMs: row.stopMs, shake: row.trauma, flash: row.flashFrames };
}
