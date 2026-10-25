/**
 * HN0 meter (canon §20.1, §20.3, PB-35): frame interval (rAF to rAF, Chrome
 * uncapped), main-thread CPU time around update + draw, renderer.info after
 * the whole frame (post passes included), estimated texture memory (assets
 * apart from the post chain's render targets), usedJSHeapSize growth over the
 * measured window, the renderer string (SwiftShader, llvmpipe or software
 * runs are invalid), prefers-reduced-motion; mean, p95, max. The GPU timer is
 * kept only when it can be trusted (Rồng bench.ts: on ANGLE over Metal it
 * reads longer than the frame). Samples go into preallocated arrays: nothing
 * allocates per frame while measuring.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { Stage3D } from "../../kit/three/stage";
import type { Quality } from "../../content/types";
import { TT_BUDGETS } from "../../content/rules";

export interface BenchSample {
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

/** Budgets of the tier (canon §20.2, rules.ts TT_BUDGETS), ms and MB, for the report. */
export interface BenchBudget {
  readonly frameMeanMs: number | null;
  readonly frameP95Ms: number;
  readonly cpuP95Ms: number;
  readonly drawCalls: number;
  readonly textureMb: number;
}

export interface BenchResult {
  readonly case: string;
  readonly quality: Quality;
  readonly count: number;
  readonly frames: number;
  readonly frameMeanMs: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly fps: number;
  readonly cpuMeanMs: number;
  readonly cpuP95Ms: number;
  /** Trusted GPU timer mean, or null (gpuNote says why). */
  readonly gpuMeanMs: number | null;
  readonly gpuNote: string | null;
  /** Last measured frame: draw calls (post passes included) and triangles. */
  readonly drawCalls: number;
  readonly triangles: number;
  /** Max draw calls over the measured window. */
  readonly drawCallsMax: number;
  /** Instances drawn per crowd draw mode. */
  readonly instances: Readonly<Record<string, number>>;
  /** VAT, atlases, images, data textures (the canon §20.2 budget), MB. */
  readonly textureMb: number;
  /** Render targets of the post chain (not in the canon budget), MB. */
  readonly targetsMb: number;
  /** usedJSHeapSize at the start and end of the measured window; null when the browser has no performance.memory. */
  readonly heapStartMb: number | null;
  readonly heapEndMb: number | null;
  readonly heapGrowthMb: number | null;
  /** A full GC ran just before the window (Chrome --js-flags=--expose-gc): only then is the growth an allocation reading. */
  readonly heapGc: boolean;
  readonly gpu: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** prefers-reduced-motion: reduce at run time, and the page's ?motion=. */
  readonly reducedMotion: boolean;
  readonly motion: string;
  /** SwiftShader, llvmpipe or software: the run does not count (canon §20.1). */
  readonly valid: boolean;
  readonly invalidReason: string | null;
  readonly seconds: number;
  readonly warmup: number;
  readonly budget: BenchBudget;
  readonly at: string;
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export function mean(values: ArrayLike<number>, count = values.length): number {
  if (count <= 0) return 0;
  let sum = 0;
  for (let k = 0; k < count; k += 1) sum += values[k]!;
  return sum / count;
}

/** Nearest-rank percentile (as Rồng's bench): sorted[floor(n × p)], clamped. */
export function percentile(values: ArrayLike<number>, p: number, count = values.length): number {
  if (count <= 0) return 0;
  const sorted = Float64Array.from({ length: count }, (_, k) => values[k]!).sort();
  return sorted[Math.min(count - 1, Math.max(0, Math.floor(count * p)))]!;
}

/** canon §20.1: software rasterisers make a run invalid. */
export function softwareRenderer(gpu: string): string | null {
  const match = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.exec(gpu);
  return match === null ? null : "vẽ phần mềm (" + match[0] + ")";
}

export function budgetOf(quality: Quality): BenchBudget {
  const row = TT_BUDGETS[quality];
  return {
    frameMeanMs: row.frameMeanUs === null ? null : row.frameMeanUs / 1000,
    frameP95Ms: row.frameP95Us / 1000,
    cpuP95Ms: row.cpuP95Us / 1000,
    drawCalls: row.drawCalls,
    textureMb: row.textureMb,
  };
}

/** Bytes per texel of a texture's format and type (estimate; compressed formats count 1). */
export function bytesPerTexel(format: number, type: number): number {
  const channels =
    format === THREE.RedFormat || format === THREE.RedIntegerFormat || format === THREE.AlphaFormat || format === THREE.DepthFormat
      ? 1
      : format === THREE.RGFormat || format === THREE.RGIntegerFormat || format === THREE.DepthStencilFormat
        ? 2
        : format === THREE.RGBFormat
          ? 3
          : 4;
  const size =
    type === THREE.FloatType || type === THREE.UnsignedIntType || type === THREE.IntType || type === THREE.UnsignedInt248Type
      ? 4
      : type === THREE.HalfFloatType || type === THREE.ShortType || type === THREE.UnsignedShortType
        ? 2
        : 1;
  return channels * size;
}

function textureBytes(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number; depth?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const depth = image?.depth ?? 1;
  const mips = texture.generateMipmaps && texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter ? 4 / 3 : 1;
  return width * height * depth * bytesPerTexel(texture.format, texture.type) * mips;
}

/** Asset textures under `scene` (material maps and shader uniforms), each counted once. */
export function sceneTextureBytes(scene: THREE.Object3D): number {
  const seen = new Set<string>();
  let bytes = 0;
  const take = (value: unknown): void => {
    if (!(value instanceof THREE.Texture) || seen.has(value.uuid)) return;
    seen.add(value.uuid);
    bytes += textureBytes(value);
  };
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (material === undefined) return;
    for (const one of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(one)) take(value);
      const uniforms = (one as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }> | undefined;
      if (uniforms !== undefined) for (const uniform of Object.values(uniforms)) take(uniform?.value);
    }
  });
  if ((scene as THREE.Scene).background instanceof THREE.Texture) take((scene as THREE.Scene).background);
  return bytes;
}

/** The post chain's render targets when bloom is on (composer buffers, bloom mips). */
export function targetBytes(stage: Stage3D): number {
  if (!stage.bloom.enabled) return 0;
  const targets: THREE.WebGLRenderTarget[] = [stage.composer.renderTarget1, stage.composer.renderTarget2];
  const bloom = stage.bloom as unknown as { renderTargetsHorizontal?: THREE.WebGLRenderTarget[]; renderTargetsVertical?: THREE.WebGLRenderTarget[]; renderTargetBright?: THREE.WebGLRenderTarget };
  targets.push(...(bloom.renderTargetsHorizontal ?? []), ...(bloom.renderTargetsVertical ?? []));
  if (bloom.renderTargetBright !== undefined) targets.push(bloom.renderTargetBright);
  let bytes = 0;
  for (const target of targets) bytes += target.width * target.height * bytesPerTexel(target.texture.format, target.texture.type);
  return bytes;
}

/** GPU frame time through EXT_disjoint_timer_query_webgl2, queries reused (no allocation per frame). */
export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private readonly samples: Float64Array;
  private count = 0;

  constructor(private readonly gl: WebGL2RenderingContext, capacity = 50_000) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.samples = new Float64Array(this.ext === null ? 0 : capacity);
  }

  get available(): boolean {
    return this.ext !== null;
  }

  begin(): WebGLQuery | null {
    if (this.ext === null || this.pending.length > 6) return null;
    const query = this.free.pop() ?? this.gl.createQuery();
    if (query === null) return null;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    return query;
  }

  end(query: WebGLQuery | null, record: boolean): void {
    if (this.ext === null || query === null) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    if (record) this.pending.push(query);
    else this.free.push(query);
  }

  poll(): void {
    if (this.ext === null) return;
    const gl = this.gl;
    while (this.pending.length > 0) {
      const query = this.pending[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint && this.count < this.samples.length) this.samples[this.count++] = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      this.pending.shift();
      this.free.push(query);
    }
  }

  /** The mean, or null with the reason it is not trusted. */
  reading(frameMeanMs: number, gpu: string): { gpuMeanMs: number | null; gpuNote: string | null } {
    if (this.ext === null || this.count === 0) return { gpuMeanMs: null, gpuNote: "không có bộ đếm GPU" };
    const value = mean(this.samples, this.count);
    if (/angle/i.test(gpu) && /metal/i.test(gpu)) return { gpuMeanMs: null, gpuNote: "không tin cậy trên ANGLE/Metal (đo được " + round2(value) + " ms)" };
    if (value > frameMeanMs * 1.05) return { gpuMeanMs: null, gpuNote: "không tin cậy: dài hơn cả khung (" + round2(value) + " ms)" };
    return { gpuMeanMs: round2(value), gpuNote: null };
  }

  dispose(): void {
    for (const query of [...this.free, ...this.pending]) this.gl.deleteQuery(query);
    this.free.length = 0;
    this.pending.length = 0;
  }
}

/** Frame and CPU samples in preallocated arrays. */
export class FrameMeter {
  private readonly frame: Float64Array;
  private readonly cpu: Float64Array;
  private count = 0;
  drawCallsMax = 0;
  lastDrawCalls = 0;
  lastTriangles = 0;

  constructor(capacity = 60_000) {
    this.frame = new Float64Array(capacity);
    this.cpu = new Float64Array(capacity);
  }

  get frames(): number {
    return this.count;
  }

  /** One frame (positional: no sample object per frame). */
  record(frameMs: BenchSample["frameMs"], cpuMs: number, drawCalls: number, triangles: number): void {
    if (this.count >= this.frame.length) return;
    this.frame[this.count] = frameMs;
    this.cpu[this.count] = cpuMs;
    this.count += 1;
    this.lastDrawCalls = drawCalls;
    this.lastTriangles = triangles;
    if (drawCalls > this.drawCallsMax) this.drawCallsMax = drawCalls;
  }

  summary(): { frameMeanMs: number; frameP95Ms: number; frameMaxMs: number; cpuMeanMs: number; cpuP95Ms: number; fps: number } {
    const n = this.count;
    const frameMean = mean(this.frame, n);
    let max = 0;
    for (let k = 0; k < n; k += 1) max = Math.max(max, this.frame[k]!);
    return {
      frameMeanMs: round2(frameMean),
      frameP95Ms: round2(percentile(this.frame, 0.95, n)),
      frameMaxMs: round2(max),
      cpuMeanMs: round2(mean(this.cpu, n)),
      cpuP95Ms: round2(percentile(this.cpu, 0.95, n)),
      fps: round2(1000 / Math.max(0.001, frameMean)),
    };
  }
}

/** usedJSHeapSize in MB (Chrome; precise with --enable-precise-memory-info), or null. */
export function heapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory === undefined ? null : memory.usedJSHeapSize / (1024 * 1024);
}

export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
