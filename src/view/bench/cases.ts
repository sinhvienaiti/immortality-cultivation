/**
 * HN0 cases (canon §20.3): 0 base, A crowd-proc, B crowd-vat, C vankiem,
 * D impostor, E skinned (the tier's SkinnedMesh cap; an extra High run at 10).
 * Milestone 1a builds 0 and A; B–E come with milestone 1b. A runs at any
 * COUNT (60 / 120 / 300; the canon's reference is 300) so B − A isolates the
 * VAT cost at the same N and the same triangles (`lodTris` of the tier).
 * Owner: Lane 1.
 */
import type { Quality } from "../../content/types";
import { TT_BUDGETS } from "../../content/rules";

export type BenchCaseId = "base" | "crowd-proc" | "crowd-vat" | "vankiem" | "impostor" | "skinned";

export const BENCH_CASE_IDS: readonly BenchCaseId[] = ["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"];

export const BENCH_COUNTS: readonly number[] = [60, 120, 300];

/** Cases milestone 1a draws; the others answer with a "milestone 1b" error. */
export const BUILT_CASES: readonly BenchCaseId[] = ["base", "crowd-proc"];

/** canon §20.3: 2 s warm-up, 10 s measured, 3 runs (the scenario repeats the page). */
export const BENCH_TIMING = { seconds: 10, warmup: 2, runs: 3 } as const;

export type MotionParam = "full" | "reduce" | "system";

export interface BenchCase {
  readonly id: BenchCaseId;
  readonly quality: Quality;
  /** Beasts N (0 for base). */
  readonly count: number;
  /** Sword pool of the tier (cases C–E, milestone 1b). */
  readonly swords: number;
  /** SkinnedMesh count (case E, milestone 1b). */
  readonly skinned: number;
  readonly seconds: number;
  readonly warmup: number;
  /** `?motion=` as given: the bench measures with `full` (the Dell reports reduce, canon §20.3). */
  readonly motion: MotionParam;
  /** Crowd triangles per beast: the tier's LOD budget (canon §20.2). */
  readonly lodTris: number;
  readonly seed: number;
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
 * `?swords=`, `?skinned=`, `?motion=`, `?seed=`. An unknown case id is an error.
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
  return {
    id,
    quality,
    count: id === "base" ? 0 : int(params.get("count"), 300, 1, 600),
    swords: int(params.get("swords"), budget.swords, 0, 2000),
    skinned: int(params.get("skinned"), budget.skinnedMax, 0, 16),
    seconds: num(params.get("seconds"), BENCH_TIMING.seconds, 0.5, 120),
    warmup: num(params.get("warmup"), BENCH_TIMING.warmup, 0, 30),
    motion,
    lodTris: int(params.get("tris"), budget.lodTris, 12, 20_000),
    seed: int(params.get("seed"), 20_261_025, 1, 2_147_483_647),
  };
}

/** The page URL of a case (scenario and menu). */
export function benchUrl(base: string, c: { id: BenchCaseId; quality: Quality; count?: number; seconds?: number; warmup?: number; motion?: MotionParam }): string {
  const params = new URLSearchParams({ case: c.id, q: c.quality });
  if (c.count !== undefined && c.id !== "base") params.set("count", String(c.count));
  if (c.seconds !== undefined) params.set("seconds", String(c.seconds));
  if (c.warmup !== undefined) params.set("warmup", String(c.warmup));
  params.set("motion", c.motion ?? "full");
  return base.replace(/\/$/, "") + "/bench.html?" + params.toString();
}
