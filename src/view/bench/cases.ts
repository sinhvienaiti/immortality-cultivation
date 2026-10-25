/**
 * HN0 cases (canon §20.3): 0 base, A crowd-proc, B crowd-vat, C vankiem,
 * D impostor, E skinned (the tier's SkinnedMesh cap; an extra High run at
 * 10). B, C, D, E take N = 60 / 120 / 300 (`?count=`); A runs at any N too
 * (the canon's reference is 300). `?vat=` points B and C at a VAT baked by
 * scripts/models/blender/bake_vat.py (the confirmation pass, canon §20.3);
 * `?steps=` turns on fallback steps of the ladder (L1–L5) to re-measure a
 * tier that failed.
 * Owner: Lane 1.
 */
import type { Quality } from "../../content/types";
import { TT_BUDGETS, TT_LIMITS } from "../../content/rules";

export type BenchCaseId = "base" | "crowd-proc" | "crowd-vat" | "vankiem" | "impostor" | "skinned";

export const BENCH_CASE_IDS: readonly BenchCaseId[] = ["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"];

export const BENCH_COUNTS: readonly number[] = [60, 120, 300];

/** Every case is built (milestone 1b). */
export const BUILT_CASES: readonly BenchCaseId[] = BENCH_CASE_IDS;

/** canon §20.3: 2 s warm-up, 10 s measured, 3 runs (the scenario repeats the page). */
export const BENCH_TIMING = { seconds: 10, warmup: 2, runs: 3 } as const;

/** canon §20.3 case C: a "vạn kiếm" every 4 s and about 60 hits a second with sparks and numbers. */
export const BENCH_VANKIEM = { everyS: 4, hitsPerSecond: 60 } as const;

/** Fallback steps of canon §20.3 (L1 VFX, L2 swords, L3–L5 crowd to impostors). */
export type LadderStep = "L1" | "L2" | "L3" | "L4" | "L5";
export const LADDER_STEPS: readonly LadderStep[] = ["L1", "L2", "L3", "L4", "L5"];

/** canon §20.3 L4: plain beasts outside the nearest 100 (Low) / 160 (Medium) to the screen centre draw as impostors; High keeps 160. */
export const L4_KEEP: Readonly<Record<Quality, number>> = { low: 100, medium: 160, high: 160, ultra: 160 };

/** canon §20.3 L2: the sword notches (500 → 300 → 150 → 80); the core never goes under 80. */
export const SWORD_NOTCHES: readonly number[] = [500, 300, 150, TT_LIMITS.swordsFloor];

/** The next lower notch under `swords` (L2), never under the floor. */
export function swordsDown(swords: number): number {
  for (const notch of SWORD_NOTCHES) if (notch < swords) return notch;
  return TT_LIMITS.swordsFloor;
}

export type MotionParam = "full" | "reduce" | "system";

export interface BenchCase {
  readonly id: BenchCaseId;
  readonly quality: Quality;
  /** Beasts N (0 for base). */
  readonly count: number;
  /** Sword pool of the tier (cases C–E); L2 has already lowered it. */
  readonly swords: number;
  /** SkinnedMesh count (case E). */
  readonly skinned: number;
  readonly seconds: number;
  readonly warmup: number;
  /** `?motion=` as given: the bench measures with `full` (the Dell reports reduce, canon §20.3). */
  readonly motion: MotionParam;
  /** Crowd triangles per beast: the tier's LOD budget (canon §20.2). */
  readonly lodTris: number;
  readonly seed: number;
  /** A baked VAT (JSON URL) for B and C instead of the in-page bake (confirmation pass). */
  readonly vat: string | null;
  /** Ladder steps on (empty: full 3D). */
  readonly steps: readonly LadderStep[];
}

const QUALITIES: readonly Quality[] = ["low", "medium", "high", "ultra"];

function int(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function num(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * The case named by `?case=` (null without one: the page shows its menu).
 * `?q=low|medium|high|ultra` (default high), `?count=`, `?seconds=`, `?warmup=`,
 * `?swords=`, `?skinned=`, `?motion=`, `?seed=`, `?tris=`, `?vat=`, `?steps=L1,L3`.
 * An unknown case id or step is an error.
 */
export function parseBenchCase(search: string): BenchCase | { readonly error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get("case");
  if (raw === null || raw === "") return null;
  if (!(BENCH_CASE_IDS as readonly string[]).includes(raw)) return { error: "unknown case '" + raw + "' (" + BENCH_CASE_IDS.join(", ") + ")" };
  const id = raw as BenchCaseId;
  const q = params.get("q") ?? "high";
  const quality: Quality = (QUALITIES as readonly string[]).includes(q) ? (q as Quality) : "high";
  const budget = TT_BUDGETS[quality];
  const motionRaw = params.get("motion");
  const motion: MotionParam = motionRaw === "full" || motionRaw === "reduce" ? motionRaw : "system";
  const stepList = (params.get("steps") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const bad = stepList.find((s) => !(LADDER_STEPS as readonly string[]).includes(s));
  if (bad !== undefined) return { error: "unknown step '" + bad + "' (" + LADDER_STEPS.join(", ") + ")" };
  const steps = LADDER_STEPS.filter((s) => stepList.includes(s));
  const pool = int(params.get("swords"), budget.swords, 0, 2000);
  const vat = params.get("vat");
  return {
    id,
    quality,
    count: id === "base" ? 0 : int(params.get("count"), 300, 1, 600),
    swords: steps.includes("L2") ? swordsDown(pool) : pool,
    skinned: int(params.get("skinned"), budget.skinnedMax, 0, 16),
    seconds: num(params.get("seconds"), BENCH_TIMING.seconds, 0.5, 120),
    warmup: num(params.get("warmup"), BENCH_TIMING.warmup, 0, 30),
    motion,
    lodTris: int(params.get("tris"), budget.lodTris, 12, 20_000),
    seed: int(params.get("seed"), 20_261_025, 1, 2_147_483_647),
    vat: vat !== null && vat.trim() !== "" ? vat.trim() : null,
    steps,
  };
}

/** The page URL of a case (scenario and menu). */
export function benchUrl(
  base: string,
  c: { id: BenchCaseId; quality: Quality; count?: number; seconds?: number; warmup?: number; motion?: MotionParam; skinned?: number; vat?: string; steps?: readonly LadderStep[] },
): string {
  const params = new URLSearchParams({ case: c.id, q: c.quality });
  if (c.count !== undefined && c.id !== "base") params.set("count", String(c.count));
  if (c.seconds !== undefined) params.set("seconds", String(c.seconds));
  if (c.warmup !== undefined) params.set("warmup", String(c.warmup));
  if (c.skinned !== undefined) params.set("skinned", String(c.skinned));
  if (c.vat !== undefined) params.set("vat", c.vat);
  if (c.steps !== undefined && c.steps.length > 0) params.set("steps", c.steps.join(","));
  params.set("motion", c.motion ?? "full");
  return base.replace(/\/$/, "") + "/bench.html?" + params.toString();
}

/** Which draw a case's crowd uses. */
export function crowdModeOf(id: BenchCaseId): "procedural" | "vat" | "impostor" | null {
  if (id === "base") return null;
  if (id === "crowd-proc") return "procedural";
  if (id === "impostor") return "impostor";
  return "vat";
}

/** Cases with the "vạn kiếm" scene, hit sparks, numbers and ink smoke (C, D, E). */
export const hasSwords = (id: BenchCaseId): boolean => id === "vankiem" || id === "impostor" || id === "skinned";
