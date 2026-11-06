/** Dragon Skill §10; ticket 293 round 3 replaces the original fixed flight ticks. */
export const SWARM = {
  id: "swarm",
  versions: { geometry: 1, tables: 1, schema: 1, collision: 1, damage: 1 },
  dragons: 5,
  cellMm: 4000,
  bossScore: 2,
  maxTargets: 2,
  separatedCells: 2,
  pearl: { pullNumerator: 3, pullDenominator: 5, maxPullMm: 12_000, insetMm: 2000, casterRangeMm: 60_000, yMm: 1200 },
  geometry: { stepMm: 250, directions: 4096, maxTurn: 36, turnRadiusMm: 4500, radiusFloorMm: 4400, radiusProbeMm: 1000, radiusExclusionMm: 8000, diveMm: 7800, diveInnerMm: 7000, diveMinRadiusMm: 600, maxLengthMm: 75_000, maxSamples: 301, marginMm: 1800, groundYMm: 1200, maxSlopeDenominator: 2 },
  helix: { horizontalMm: 1800, verticalMm: 800, wavelengthMm: 15_000, riseMm: 3000, fadeMm: 8000 },
  timing: { releaseTick: 1, launchTick: 2, launchStride: 6, speedMmPerSecond: 16_000, tickHz: 60, retractTicks: 30, burstDelayTicks: 32, aftermathTicks: 40, maxEndTick: 379 },
  bodyMm: 16_000,
  packetMaxBytes: 24_576,
  /** Reserved for ticket 294; no damage is applied by the part-A sim. */
  damage: { releaseW100: 50, releaseRadiusMm: 6000, touchW100: 15, bodyRadiusMm: 850, burstW100: 250, boundaryWeightPm: 600, ordinaryCapW100: 250, bossCapW100: 150, clusterCapPct: 60, maxHits: 3 },
} as const;
