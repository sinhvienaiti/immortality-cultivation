/**
 * Twin Dragons, One Burning Pearl (`twin-pearl`, 雙龍戲珠): the grey box of
 * Kiếm key 2 that the owner chose on 04/11/2026 (docs/games/tu-tien/skills/
 * DRAGON_SKILL.md §3 A, §6 step 1). Trial numbers only: canon §12 and
 * school-kiem.ts are unchanged, and the skill runs only when a match's
 * ReplayHeader carries `swordKey2: "twin-pearl"` (sim/twin-pearl.ts); off by
 * default, so no default match, golden or rulesHash sees this table.
 *
 * Frames: the design doc counts frames at 60 Hz from F0 (the word's last
 * correct key); the sim ticks at 60 Hz (rules.ts SIM.tickHz), so frame Fn is
 * the n-th tick after the Cast resolves, one to one. Every `*Tick` below is
 * such an offset.
 *
 * Damage: each beast takes at most one hit of each kind a cast (touch,
 * corridor, lotus), at least `rehitTicks` apart, `maxHits` in all. The kinds
 * split today's key-2 damage on that beast (school-kiem.ts Nhất Tuyến Xuyên
 * Vân: 2.5 W on the first beast, −15 % each next distinct beast, floor 40 %,
 * Thế −20) as 15 / 45 / 40 %; the lotus deals half outside its two long petals
 * and the hold zone. The Vương takes at most `bossCapW100` a cast (cast id =
 * the Cast's actionId).
 * Owner: Lane 4 (trial, behind a flag).
 */

/** Key 2 variants a match may run (ReplayHeader.swordKey2); absent: today's line. */
export type SwordKey2 = "twin-pearl";

export const SWORD_KEY2_VARIANTS: readonly SwordKey2[] = ["twin-pearl"];

export const TWIN_PEARL = {
  id: "twin-pearl",
  name: "Twin Dragons, One Burning Pearl",
  /** F0: the hold strike on 8 × 8 m in front of the formation centre (x ±4 m, from the heart 8 m towards the gates). */
  hold: { tick: 0, halfWidthMm: 4000, depthMm: 8000 },
  /**
   * F1–F2: one touch box on each ground lane, round the lane's beast nearest the heart outside the hold zone,
   * 4 m along the lane and the corridor's width across (the beam from the sword to it is drawn by the view).
   */
  touch: { fromTick: 1, toTick: 2, halfLengthMm: 2000, halfWidthMm: 2200 },
  /**
   * F3–F42: each head runs from the lanes' meeting point up its lane to the gate on a ground S path (half-waves
   * of about `halfWaveMm`, `amplitudeMm` off the lane's line), sampled every `sampleMm`; its body capsule is
   * `radiusMm` round the path, 0.2–1.5 m high, and what it passed keeps damaging for `trailTicks` (0.9 s).
   */
  heads: { fromTick: 3, toTick: 42, radiusMm: 1400, amplitudeMm: 900, halfWaveMm: 4000, sampleMm: 500 },
  trailTicks: 54,
  /** Ground volumes hit beasts standing at most this high (the body capsule's top, 1.5 m); crows fly at 4 m. */
  groundTopMm: 1500,
  /** F30–F50: each tail sweeps its side's sky route from the far corner in to the heart edge, 2.5–6 m high. */
  sky: { fromTick: 30, toTick: 50, radiusMm: 2500, bottomMm: 2500, topMm: 6000 },
  /** The pearl flies from the sword to the meeting point over the heads' run and hangs there (view only, no hit). */
  pearl: { fromTick: 3, arriveTick: 42 },
  /**
   * F51: the lotus at the meeting point, r 9 m (18 m across); full on its two long petals (the corridor's
   * half-width round each head's base path, `petalLengthMm` from the meeting point) and in the hold zone,
   * `outsidePm` ‰ elsewhere in it. Live until F71 so a beast hit up to F51 can take it after its 20-tick gap.
   */
  lotus: { fromTick: 51, toTick: 71, radiusMm: 9000, petalLengthMm: 13_000, petalHalfWidthMm: 2200, outsidePm: 500 },
  /** Each kind's share of the beast's key-2 damage, %; Thế (posture) splits the same way. */
  sharesPct: { touch: 15, corridor: 45, lotus: 40 },
  maxHits: 3,
  rehitTicks: 20,
  /** The Vương's cap a cast, W × 100 (trial: 60 % of one beast's 2.5 W). */
  bossCapW100: 150,
  /** Where the lanes meet when a lane has no bend (canon §8.1: within 10 m of the heart): this far along it from the heart. */
  meetFallbackMm: 10_000,
} as const;

/** The last tick a cast still hits on: the heads' trail at the gates. */
export const TWIN_PEARL_END_TICK = Math.max(TWIN_PEARL.heads.toTick + TWIN_PEARL.trailTicks, TWIN_PEARL.lotus.toTick, TWIN_PEARL.sky.toTick);
