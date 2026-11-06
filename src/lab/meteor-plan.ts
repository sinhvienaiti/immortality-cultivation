/**
 * The meteor shower's plan (key M, canon D62; owner 06/11 12:45, 12:50, 12:52: "thiên thạch phải làm dạng mưa thiên
 * thạch, rơi nhiều nơi trong map, và rơi trong khoảng 5-8s", "cục thiên thạch cũng cần làm to hơn";
 * docs/work/tasks/skill-five-phase-samples.md): when each meteor lands and how big it is, made at the cast from a seed
 * (the same shower after a reset, for captures). 18–24 meteors over about 6 s, 0.2–0.4 s apart with a random lean,
 * densest in the middle and sparser at both ends; about 30 % big, 50 % middling, 20 % small; it opens on a big one and
 * ends on the biggest of all (the king) into the densest group. About 60 % fall on groups of beasts, the rest anywhere
 * on the field. Pure: no three, no clock.
 */
import { Rand } from "../view/skills/fxkit";

export type MeteorClass = "small" | "mid" | "big" | "king";

/** A meteor's size and weight by class (m, s, px at 1080p). */
export interface MeteorSize {
  /** The comet card's height: its head's ball is about 0.28 of it, its bright body about as long as it. */
  readonly cardM: number;
  /** The blast's eruption across, the shockwave ring's end diameter, the burnt ground's mark. */
  readonly blastM: number;
  readonly ringM: number;
  readonly burnM: number;
  /** Beasts within this of the landing are struck, with this power; `launch`: small beasts under it are flung (2–3 m). */
  readonly hitR: number;
  readonly power: number;
  readonly launch: boolean;
  /** Embers and sparks flung out (count) and how far (m). */
  readonly flung: number;
  readonly flingM: number;
  /** The blast's additive layers last this long (s; the plan may cut it: no more than MAX_BLASTS at once). */
  readonly blastS: number;
  /** The world's hit-stop (ms), the jolt (px, s; never stacks), the warm full-screen flash (≤ 0.6, two frames), the
   * landing light's strength, the camera's kick down (px). */
  readonly stopMs: number;
  readonly shakePx: number;
  readonly shakeS: number;
  readonly warm: number;
  readonly light: number;
  readonly kickPx: number;
}

export const METEOR_SIZES: Readonly<Record<MeteorClass, MeteorSize>> = {
  // Head ~2 m.
  small: { cardM: 7, blastM: 3.5, ringM: 5, burnM: 3, hitR: 2.2, power: 0.7, launch: false, flung: 5, flingM: 3.5, blastS: 1.1, stopMs: 0, shakePx: 3, shakeS: 0.14, warm: 0, light: 4, kickPx: 0 },
  // Head ~3 m.
  mid: { cardM: 10.5, blastM: 5.5, ringM: 7.5, burnM: 4.5, hitR: 3.2, power: 0.9, launch: true, flung: 9, flingM: 5, blastS: 1.5, stopMs: 0, shakePx: 6, shakeS: 0.2, warm: 0, light: 6, kickPx: 1.5 },
  // Head ~4.2 m, its bright body ~15 m: blast 8 m, ring 11 m.
  big: { cardM: 15, blastM: 8, ringM: 11, burnM: 7, hitR: 4.5, power: 1, launch: true, flung: 14, flingM: 7, blastS: 1.9, stopMs: 50, shakePx: 12, shakeS: 0.3, warm: 0.45, light: 10, kickPx: 3 },
  // The last: head ~4.8 m, blast 10 m, ring 12 m, stop 0.12 s.
  king: { cardM: 17, blastM: 10, ringM: 12, burnM: 8, hitR: 5.5, power: 1, launch: true, flung: 18, flingM: 8, blastS: 2.2, stopMs: 120, shakePx: 16, shakeS: 0.4, warm: 0.6, light: 12, kickPx: 4 },
};

export const SHOWER = {
  /** The first lands this long after the key (the release streaks up first). */
  firstS: 0.45,
  /** From the first landing to the last (s): the whole shower ~6.5 s after the key. */
  spanS: 6.0,
  min: 18,
  max: 24,
  gapMin: 0.2,
  gapMax: 0.4,
  /** Of them, on groups of beasts (the rest anywhere on the field). */
  clusterShare: 0.6,
  /** The first meteor's hit-stop (s), longer than a big one's. */
  firstStopMs: 100,
} as const;

/** Additive blasts showing at once at most (the plan shortens an older one's tail). */
export const MAX_BLASTS = 6;

export interface ShowerPlan {
  /** Seconds after the key: each meteor's landing, its class, whether it seeks a group of beasts. */
  readonly landAt: readonly number[];
  readonly cls: readonly MeteorClass[];
  readonly cluster: readonly boolean[];
  /** Each blast's additive layers' length (s), cut so no more than MAX_BLASTS show at once. */
  readonly blastS: readonly number[];
}

/** The shower from `seed` (`count`: fixed instead of 18–24). */
export function planShower(seed: number, count?: number): ShowerPlan {
  const R = new Rand(seed);
  const n = Math.max(2, count ?? SHOWER.min + Math.min(SHOWER.max - SHOWER.min, Math.floor(R.next() * (SHOWER.max - SHOWER.min + 1))));
  // Gaps: dense in the middle, sparse at both ends, a random lean; scaled toward the span inside [gapMin, gapMax].
  const gaps: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const mid = Math.sin((Math.PI * (k + 0.5)) / (n - 1));
    gaps.push(SHOWER.gapMax - (SHOWER.gapMax - SHOWER.gapMin) * mid + R.range(-0.04, 0.04));
  }
  for (let pass = 0; pass < 6; pass += 1) {
    const sum = gaps.reduce((s, g) => s + g, 0);
    const k = SHOWER.spanS / sum;
    for (let j = 0; j < gaps.length; j += 1) gaps[j] = Math.min(SHOWER.gapMax, Math.max(SHOWER.gapMin, gaps[j]! * k));
  }
  // The king comes a full beat after the one before it.
  gaps[gaps.length - 1] = SHOWER.gapMax;
  const landAt: number[] = [SHOWER.firstS];
  for (const g of gaps) landAt.push(landAt[landAt.length - 1]! + g);
  // Classes: the first big, the last the king, the rest ~30 % big, 50 % middling, 20 % small, shuffled.
  const rest = n - 2;
  const bigs = Math.round(rest * 0.3);
  const smalls = Math.round(rest * 0.2);
  const middle: MeteorClass[] = [];
  for (let k = 0; k < rest; k += 1) middle.push(k < bigs ? "big" : k < bigs + smalls ? "small" : "mid");
  shuffle(middle, R);
  const cls: MeteorClass[] = ["big", ...middle, "king"];
  // Groups: ~60 %, the king always and the big ones first; the rest anywhere on the field.
  const want = Math.round(n * SHOWER.clusterShare);
  const order = cls.map((c, k) => ({ k, w: (c === "king" ? 3 : c === "big" ? 2 : c === "mid" ? 1 : 0) + R.next() * 1.5 })).sort((x, y) => y.w - x.w);
  const cluster = cls.map(() => false);
  for (let j = 0; j < want; j += 1) cluster[order[j]!.k] = true;
  // Blasts: no more than MAX_BLASTS at once (an older blast's tail is cut short, never under 0.6 s).
  const blastS = cls.map((c) => METEOR_SIZES[c].blastS);
  for (let k = 0; k < n; k += 1) {
    for (;;) {
      const live = [];
      for (let j = 0; j < k; j += 1) if (landAt[j]! + blastS[j]! > landAt[k]!) live.push(j);
      if (live.length < MAX_BLASTS) break;
      // The one ending first goes out as this one lands.
      const j = live.sort((x, y) => landAt[x]! + blastS[x]! - (landAt[y]! + blastS[y]!))[0]!;
      const cut = Math.max(0.6, landAt[k]! - landAt[j]! - 1e-3);
      if (cut >= blastS[j]!) break;
      blastS[j] = cut;
    }
  }
  return { landAt, cls, cluster, blastS };
}

/** Additive blasts showing at time `t` (s after the key). */
export function blastsAt(plan: ShowerPlan, t: number): number {
  let n = 0;
  for (let k = 0; k < plan.landAt.length; k += 1) if (plan.landAt[k]! <= t && plan.landAt[k]! + plan.blastS[k]! > t) n += 1;
  return n;
}

function shuffle<T>(a: T[], R: Rand): void {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(R.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
}
