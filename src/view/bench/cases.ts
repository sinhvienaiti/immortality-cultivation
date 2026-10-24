/**
 * HN0 cases (canon §20.3): 0 base, A crowd-proc (300), B crowd-vat, C vankiem,
 * D impostor, E skinned (tier's SkinnedMesh cap; an extra High run at 10).
 * Owner: Lane 1. TODO(lane-1).
 */

export type BenchCaseId = "base" | "crowd-proc" | "crowd-vat" | "vankiem" | "impostor" | "skinned";

export const BENCH_COUNTS: readonly number[] = [60, 120, 300];

export interface BenchCase {
  readonly id: BenchCaseId;
  readonly count: number;
  readonly swords: number;
  readonly skinned: number;
}
