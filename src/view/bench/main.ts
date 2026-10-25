/**
 * bench.html entry: the HN0 bench (canon §20.3). `?case=base|crowd-proc` runs
 * a case (milestone 1a; crowd-vat, vankiem, impostor, skinned answer "1b"):
 * `?q=` tier, `?count=` N (60 / 120 / 300), `?seconds=` (10), `?warmup=` (2),
 * `?motion=full` (set when measuring: the Dell's Windows reports reduce).
 * The result lands on `window.__icBench`; `__icBenchStop()` ends the page's
 * loop, `__icBenchCamera(preset)` moves the camera for pictures. Without
 * `?case=` the page lists the cases. Driven by scripts/visual/scenarios/ic-bench.mjs.
 * Owner: Lane 1.
 */
import { createRenderer, fitCamera, placeCamera, type Renderer3D } from "../renderer";
import { createCrowd, type Crowd } from "../crowd";
import { BENCH_COUNTS, BENCH_CASE_IDS, BUILT_CASES, benchUrl, parseBenchCase, type BenchCase } from "./cases";
import { buildBenchField } from "./field";
import { benchRandom, Herd } from "./herd";
import { budgetOf, FrameMeter, GpuTimer, heapMb, reducedMotion, round2, sceneTextureBytes, softwareRenderer, targetBytes, type BenchResult } from "./meter";

export type BenchCameraPreset = "default" | "close" | "heart";

export interface BenchError {
  readonly error: string;
}

declare global {
  interface Window {
    /** The finished run (or why it could not run). */
    __icBench?: BenchResult | BenchError;
    /** Stops the page's loop and frees the GPU. */
    __icBenchStop?: () => void;
    /** Moves the camera for pictures (never while measuring). */
    __icBenchCamera?: (preset: BenchCameraPreset) => void;
    /** Frames drawn so far (the scenario's allocation profile divides by it). */
    __icBenchFrame?: number;
  }
}

const MB = 1024 * 1024;

function pageStyle(doc: Document): HTMLElement {
  doc.body.style.cssText = "margin:0;overflow:hidden;background:#0b0f16;color:#d9dee8;font:14px/1.5 system-ui,sans-serif";
  const host = doc.getElementById("ic-bench") ?? doc.body.appendChild(doc.createElement("div"));
  host.style.cssText = "position:fixed;inset:0";
  return host;
}

function label(host: HTMLElement, text: string): HTMLElement {
  const tag = document.createElement("div");
  tag.dataset.role = "bench-label";
  tag.style.cssText = "position:absolute;left:10px;top:8px;z-index:2;padding:3px 8px;border-radius:4px;background:rgba(11,15,22,.72);color:#e8ecf4;font:12px/1.4 ui-monospace,monospace;pointer-events:none;white-space:pre";
  tag.textContent = text;
  host.append(tag);
  return tag;
}

/** Without ?case=: links to every case and tier (Vietnamese UI). */
function showMenu(host: HTMLElement): void {
  host.style.cssText = "position:fixed;inset:0;overflow:auto;padding:24px;box-sizing:border-box";
  const title = document.createElement("h1");
  title.textContent = "Bench HN0 (canon §20.3)";
  title.style.cssText = "font-size:22px;margin:0 0 8px";
  const note = document.createElement("p");
  note.textContent = "Mốc 1a: ca 0 (nền) và A (đám đông procedural). Ca B–E ở mốc 1b. Đo thật: scripts/visual/scenarios/ic-bench.mjs trên Chrome Windows có GPU.";
  note.style.color = "#aab3c5";
  const list = document.createElement("ul");
  const origin = location.origin;
  for (const quality of ["low", "medium", "high"] as const) {
    for (const id of BENCH_CASE_IDS) {
      const counts = id === "base" ? [0] : BENCH_COUNTS;
      for (const count of counts) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = benchUrl(origin, { id, quality, count: id === "base" ? undefined : count, motion: "full" });
        link.textContent = quality + " · " + id + (id === "base" ? "" : " · N " + count) + (BUILT_CASES.includes(id) ? "" : " (1b)");
        link.style.color = BUILT_CASES.includes(id) ? "#7ff5e0" : "#6b7385";
        item.append(link);
        list.append(item);
      }
    }
  }
  host.append(title, note, list);
}

function showError(host: HTMLElement, error: string): void {
  window.__icBench = { error };
  label(host, "Bench HN0: " + error);
}

/** Runs one case; resolves with the result and keeps drawing until __icBenchStop(). */
export function runBench(host: HTMLElement, c: BenchCase): Promise<BenchResult> {
  const renderer: Renderer3D = createRenderer(host, c.quality);
  const field = buildBenchField(c.seed);
  renderer.layers.ground.add(field);
  let crowd: Crowd | null = null;
  let herd: Herd | null = null;
  if (c.id === "crowd-proc") {
    crowd = createCrowd(renderer, "procedural", { capacity: c.count + 8, lodTris: c.lodTris, seed: c.seed });
    herd = new Herd(crowd, c.count, benchRandom(c.seed));
    herd.update(0);
    crowd.update(0);
  }
  const tag = label(host, "HN0 · " + c.id + " · " + c.quality + (c.count > 0 ? " · N " + c.count : "") + " · " + renderer.stage.size.width + "×" + renderer.stage.size.height);
  const gl = renderer.stage.renderer.getContext() as WebGL2RenderingContext;
  const gpuTimer = new GpuTimer(gl);
  // Every material compiled before the clock starts.
  renderer.stage.renderer.compile(renderer.scene, renderer.camera);
  const meter = new FrameMeter();
  const gpu = renderer.info().gpu;
  const invalid = softwareRenderer(gpu);
  let manualCamera = false;
  window.__icBenchCamera = (preset) => {
    manualCamera = preset !== "default";
    // Closer looks for pictures (readability), never measured: gate A's corridor, the heart.
    if (preset === "close") placeCamera(renderer.camera, 50, 27, -8, -11, 0);
    else if (preset === "heart") placeCamera(renderer.camera, 52, 26, 0, -3, 0);
    else fitCamera(renderer.camera, renderer.stage.size.width / renderer.stage.size.height);
  };

  // Chrome with --js-flags=--expose-gc: one full GC just before the window, so the heap growth
  // starts from a clean heap (live-heap drift). Uncapped, three.js alone allocates a few KB a
  // frame and young-generation GCs run inside the window: allocation per frame is measured by the
  // scenario's sampling heap profile (ALLOC), not by this growth.
  const forceGc = (window as Window & { gc?: () => void }).gc;
  const start = performance.now();
  let last = start;
  let frameIndex = 0;
  let gcFrame = -1;
  let heapStart: number | null = null;
  let measuringFrom = -1;
  let finished = false;
  let running = true;
  let resolveDone: (result: BenchResult) => void = () => {};
  const done = new Promise<BenchResult>((resolve) => (resolveDone = resolve));

  const finish = (): BenchResult => {
    finished = true;
    const summary = meter.summary();
    const heapEnd = heapMb();
    const size = renderer.stage.size;
    const textureBytes = sceneTextureBytes(renderer.scene);
    const result: BenchResult = {
      case: c.id,
      quality: c.quality,
      count: c.count,
      frames: meter.frames,
      ...summary,
      ...gpuTimer.reading(summary.frameMeanMs, gpu),
      drawCalls: meter.lastDrawCalls,
      triangles: meter.lastTriangles,
      drawCallsMax: meter.drawCallsMax,
      instances: { procedural: crowd?.size ?? 0 },
      textureMb: round2(textureBytes / MB),
      targetsMb: round2(targetBytes(renderer.stage) / MB),
      heapStartMb: heapStart === null ? null : round2(heapStart),
      heapEndMb: heapEnd === null ? null : round2(heapEnd),
      heapGrowthMb: heapStart === null || heapEnd === null ? null : round2(heapEnd - heapStart),
      heapGc: forceGc !== undefined,
      gpu,
      width: size.width,
      height: size.height,
      dpr: renderer.stage.renderer.getPixelRatio(),
      reducedMotion: reducedMotion(),
      motion: c.motion,
      valid: invalid === null,
      invalidReason: invalid,
      seconds: c.seconds,
      warmup: c.warmup,
      budget: budgetOf(c.quality),
      at: new Date().toISOString(),
    };
    tag.textContent += "\nTB " + result.frameMeanMs + " ms · p95 " + result.frameP95Ms + " ms · CPU p95 " + result.cpuP95Ms + " ms · " + result.drawCalls + " draw" + (result.valid ? "" : " · KHÔNG HỢP LỆ: " + invalid);
    return result;
  };

  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const interval = now - last;
    last = now;
    const elapsed = (now - start) / 1000;
    frameIndex += 1;
    window.__icBenchFrame = frameIndex;
    if (gcFrame < 0 && elapsed > c.warmup - 0.25) {
      gcFrame = frameIndex;
      forceGc?.();
    }
    // The frame after the GC carries its pause in its interval: the window starts one frame later.
    const measuring = !finished && !manualCamera && elapsed > c.warmup && gcFrame >= 0 && frameIndex > gcFrame + 1;
    if (measuring && measuringFrom < 0) {
      measuringFrom = now;
      heapStart = heapMb();
    }
    const t0 = performance.now();
    const dt = Math.min(0.05, interval / 1000);
    if (herd !== null && crowd !== null) {
      herd.update(dt);
      crowd.update(dt);
    }
    const query = gpuTimer.begin();
    renderer.render(dt);
    gpuTimer.end(query, measuring);
    gpuTimer.poll();
    const spent = performance.now() - t0;
    if (!measuring) return;
    // The first measured frame's interval still spans the warm-up's last frame: keep it (it is a real frame).
    const info = renderer.stage.renderer.info.render;
    meter.record(interval, spent, info.calls, info.triangles);
    if ((now - measuringFrom) / 1000 >= c.seconds) {
      const result = finish();
      window.__icBench = result;
      resolveDone(result);
    }
  };
  requestAnimationFrame(frame);
  window.__icBenchStop = () => {
    if (!running) return;
    running = false;
    gpuTimer.dispose();
    crowd?.dispose();
    renderer.dispose();
  };
  return done;
}

function main(): void {
  const host = pageStyle(document);
  const parsed = parseBenchCase(location.search);
  if (parsed === null) {
    showMenu(host);
    return;
  }
  if ("error" in parsed) {
    showError(host, parsed.error);
    return;
  }
  if (!BUILT_CASES.includes(parsed.id)) {
    showError(host, "case '" + parsed.id + "' arrives in milestone 1b (Lane 1)");
    return;
  }
  const fail = (error: unknown): void => showError(host, String(error instanceof Error ? error.message : error));
  try {
    void runBench(host, parsed).catch(fail);
  } catch (error) {
    fail(error);
  }
}

main();
