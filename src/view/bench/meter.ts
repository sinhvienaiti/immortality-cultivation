/**
 * HN0 meter (canon §20.3, PB-35): rAF intervals, CPU time around update +
 * draw, renderer.info, estimated texture memory, usedJSHeapSize, the
 * renderer string, prefers-reduced-motion; mean, p95, max.
 * Owner: Lane 1. TODO(lane-1).
 */

export interface BenchSample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface BenchResult {
  readonly frameMeanMs: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly cpuMeanMs: number;
  readonly cpuP95Ms: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textureMb: number;
  readonly heapGrowthMb: number;
  readonly gpu: string;
  readonly reducedMotion: boolean;
  /** SwiftShader, llvmpipe or software: the run does not count (canon §20.1). */
  readonly valid: boolean;
}
