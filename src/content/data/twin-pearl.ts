/**
 * Twin Dragons, One Burning Pearl: field-wide key-2 grey box (DRAGON_SKILL.md §9).
 * Each cast snapshots damageable beasts, divides them across the caster's lateral
 * axis and sends two sampled S paths through ground anchors to one pearl.
 * Frames are tick offsets from F0 at 60 Hz. Damage keeps the three kinds,
 * 15/45/40 shares, per-side falloff, cluster cap and per-cast boss cap.
 * Only ReplayHeader.swordKey2 enables this table; default matches stay unchanged.
 */
/** Key 2 variants a match may run (ReplayHeader.swordKey2); absent: today's line. */
export type SwordKey2 = "twin-pearl";

export const SWORD_KEY2_VARIANTS: readonly SwordKey2[] = ["twin-pearl"];

export const TWIN_PEARL = {
  id: "twin-pearl",
  name: "Twin Dragons, One Burning Pearl",
  /** F0: ground disc around the formation centre. */
  hold: { tick: 0, radiusMm: 4500 },
  /** F1–F2: one ground or sky disc per side, fixed at its F1 target. */
  touch: { fromTick: 1, toTick: 2, radiusMm: 2200 },
  pearl: { pullPm: 600, maxMm: 12_000, insetMm: 2000, emptyMm: 9000, fromTick: 3, arriveTick: 48 },
  anchors: { max: 3, minGapMm: 3000 },
  wingMm: 9000,
  heads: { fromTick: 3, toTick: 48, radiusMm: 1400, amplitudeMm: 900, halfWaveMm: 4000, sampleMm: 500, maxSamples: 256, maxSegmentMm: 32_000 },
  trailTicks: 54,
  groundTopMm: 1500,
  sky: { fromTick: 30, toTick: 56, radiusMm: 3000, bottomMm: 2500, topMm: 6000 },
  /** View only. */
  roar: { fromTick: 49, toTick: 56 },
  lotus: { fromTick: 57, toTick: 77, radiusMm: 9000, coreMm: 4000, petalLengthMm: 13_000, petalHalfWidthMm: 2200, outsidePm: 500 },
  sharesPct: { touch: 15, corridor: 45, lotus: 40 },
  /** Effective HP budget: 2 W per side split 15/45/40, plus 0.8 W for sky hits (§9.11). */
  pool: { sideW100: 200, skyW100: 80 },
  maxHits: 3,
  rehitTicks: 20,
  bossCapW100: 150,
} as const;

/** Last damaging tick: the final head sample's trail. */
export const TWIN_PEARL_END_TICK = Math.max(TWIN_PEARL.heads.toTick + TWIN_PEARL.trailTicks, TWIN_PEARL.lotus.toTick, TWIN_PEARL.sky.toTick);
