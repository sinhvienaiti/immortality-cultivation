// Source: games/dragon-hold/scripts/visual/scenarios/dh-bench.mjs @06cd4e6 (adapted: HN0 cases of canon §20.3 on bench.html, RUNS with medians, validity by renderer string, per-part differences and the over-budget column; self-contained, no lib/**)
/**
 * HN0 bench scenario (canon §20.1–20.3; M0A_PLAN §6.1 step 10, §9). Opens
 * /bench.html?case=…&q=…&count=…&motion=full once per run, waits for
 * window.__icBench, keeps the median of RUNS, writes JSON and pictures to
 * OUT_DIR, marks a run invalid when the renderer string is SwiftShader,
 * llvmpipe or software, and prints each part's cost (base, crowd, swords and
 * VFX, skinned) against its sub-budget ("phần vượt"). Milestone 1a draws only
 * `base` and `crowd-proc`; the other cases answer "1b" and are skipped.
 *
 * Windows Chrome with the GPU (Vite in WSL on 3008):
 *   $env:URL="http://127.0.0.1:3008/"; $env:OUT_DIR="…\tmp\shots\bench"
 *   $env:CHROME_FLAGS="--disable-gpu-vsync --disable-frame-rate-limit --enable-precise-memory-info --js-flags=--expose-gc"
 *   $env:Q="high"; $env:CASE="base,crowd-proc"; $env:COUNT="60,120,300"; $env:RUNS="3"
 *   node src\kit\tools\cdp-run.mjs scripts\visual\scenarios\ic-bench.mjs --width=1920 --height=1080
 * Low 1280×720, Medium 1600×900, High 1920×1080 (canon §20.2).
 * Env: URL, OUT_DIR (tmp/shots/bench), Q (high), CASE (comma list; base,crowd-proc),
 * COUNT (comma list; 60,120,300), SWORDS, SKINNED, SECONDS (10), WARMUP (2),
 * RUNS (3), SHOTS (1; 0 none), TAG (file name suffix).
 * `--js-flags=--expose-gc` lets the page run one full GC before the window, so
 * the heap growth reads from a clean start (PB-35: ≤ 2 MB in 10 s); without it
 * the growth is printed but not judged (`heapOk` null). Uncapped, young-
 * generation GCs still run inside the window, so the growth tells live-heap
 * drift; allocation per frame comes from ALLOC (seconds, default 3; 0 off): one
 * more page load per case under the CDP sampling heap profiler, bytes per
 * frame split into this game's code, the kit copy and three.js.
 * Owner: Lane 1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** canon §20.2 in ms and MB; tests/view/renderer-bench.test.ts keeps it equal to rules.ts TT_BUDGETS. */
export const BUDGETS = {
  low: { frameMeanMs: null, frameP95Ms: 8, cpuP95Ms: 6, drawCalls: 80, textureMb: 64, sub: { base: 1.5, crowd: 3, swordsFx: 2, skinned: 1.5 } },
  medium: { frameMeanMs: 8, frameP95Ms: 10, cpuP95Ms: 6, drawCalls: 110, textureMb: 128, sub: { base: 2, crowd: 4, swordsFx: 2.5, skinned: 1.5 } },
  high: { frameMeanMs: 8, frameP95Ms: 12, cpuP95Ms: 6, drawCalls: 150, textureMb: 192, sub: { base: 2, crowd: 5, swordsFx: 3.5, skinned: 1.5 } },
  ultra: { frameMeanMs: 8, frameP95Ms: 12, cpuP95Ms: 6, drawCalls: 150, textureMb: 192, sub: { base: 2, crowd: 5, swordsFx: 3.5, skinned: 1.5 } },
};

export const CASES = ["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"];
export const BUILT = ["base", "crowd-proc"];

/** M0A_PLAN §6.1 (PB-35): usedJSHeapSize grows ≤ 2 MB over the 10 s window. */
export const HEAP_GROWTH_MB = 2;

/** The heap verdict of one median row: null unless every run had a GC before its window. */
export const heapOk = (growthMb, gcBefore) => (gcBefore && typeof growthMb === "number" ? growthMb <= HEAP_GROWTH_MB : null);

/**
 * Who allocated, by the sampled frame's own script: this game's code, the kit copy, three.js (any
 * other script: Vite's pre-bundled deps, wherever its cache lives), or no script at all.
 */
export function allocBucket(url) {
  const u = String(url ?? "");
  if (u === "") return "other";
  if (/\/src\/kit\//.test(u)) return "kit";
  if (/\/src\//.test(u)) return "game";
  return "three";
}

/**
 * Bytes per bucket of a CDP sampling heap profile (GC'd objects included) and the top game and kit
 * sites. A native frame (no script URL: a builtin, a WebGL call) counts for the nearest script above it.
 */
export function allocSummary(profile) {
  const bytes = { game: 0, kit: 0, three: 0, other: 0 };
  const sites = new Map();
  const walk = (node, owner) => {
    const frame = node.callFrame ?? {};
    const here = frame.url ? { bucket: allocBucket(frame.url), site: (frame.functionName || "(anonymous)") + " " + String(frame.url).replace(/^.*?\/src\//, "src/").replace(/\?.*$/, "") } : owner;
    if (node.selfSize > 0) {
      bytes[here.bucket] += node.selfSize;
      if (here.bucket === "game" || here.bucket === "kit") sites.set(here.site, (sites.get(here.site) ?? 0) + node.selfSize);
    }
    for (const child of node.children ?? []) walk(child, here);
  };
  if (profile?.head) walk(profile.head, { bucket: "other", site: "" });
  const top = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([site, b]) => ({ site, bytes: b }));
  return { bytes, top };
}

/**
 * Allocation per frame of one case (canon §20.2: nothing allocates per frame in the hot paths): a
 * separate page load, the sampling heap profiler over `seconds` after the warm-up, frames counted
 * by the page (`__icBenchFrame`). Not part of the timed runs (sampling costs a little time).
 */
async function allocProfile(page, url, seconds) {
  await page.goto(url, { settle: 300 });
  await page.sleep(2500);
  const f0 = await page.eval("window.__icBenchFrame ?? 0");
  await page.send("HeapProfiler.enable");
  await page.send("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.sleep(seconds * 1000);
  const { profile } = await page.send("HeapProfiler.stopSampling");
  const f1 = await page.eval("window.__icBenchFrame ?? 0");
  await page.send("HeapProfiler.disable");
  await page.eval("window.__icBenchStop && window.__icBenchStop()");
  const frames = Math.max(1, Number(f1) - Number(f0));
  const { bytes, top } = allocSummary(profile);
  const per = (b) => Math.round(b / frames);
  return {
    seconds,
    frames,
    bytesPerFrame: { game: per(bytes.game), kit: per(bytes.kit), three: per(bytes.three), other: per(bytes.other), total: per(bytes.game + bytes.kit + bytes.three + bytes.other) },
    top: top.map((t) => ({ site: t.site, bytesPerFrame: per(t.bytes) })),
  };
}

/** canon §20.1: SwiftShader, llvmpipe or software drawing does not count. */
export const isSoftware = (renderer) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(renderer ?? ""));

export function median(values) {
  const list = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 1 ? list[mid] : Math.round(((list[mid - 1] + list[mid]) / 2) * 100) / 100;
}

const METRICS = ["frameMeanMs", "frameP95Ms", "frameMaxMs", "cpuMeanMs", "cpuP95Ms", "gpuMeanMs", "drawCalls", "drawCallsMax", "triangles", "textureMb", "targetsMb", "heapGrowthMb", "fps"];

/** The median run of one (case, count): every metric's median over the runs. */
export function medianOf(runs) {
  const out = { runs: runs.length };
  for (const key of METRICS) out[key] = median(runs.map((r) => r[key]));
  return out;
}

const diff = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : Math.round((a - b) * 100) / 100);

/**
 * Per-part cost at each N (canon §20.3, D36): base = p95(0); crowd = p95(B) − p95(0);
 * swords, VFX, numbers = p95(C) − p95(B); skinned = p95(E) − p95(C). Until B exists
 * (1b) the crowd line uses A (procedural) and says so. Also CPU p95 and draw calls.
 * `medians` maps "case@count" to medianOf(); `quality` picks the sub-budgets.
 */
export function partsOf(medians, quality, counts) {
  const sub = (BUDGETS[quality] ?? BUDGETS.high).sub;
  const base = medians["base@0"];
  const rows = [];
  // `b` undefined: the case to subtract was not run, so the part cannot be told; "none": the part is the case itself.
  const row = (part, n, a, b, budget, note) => {
    if (!a || b === undefined) return;
    const alone = b === "none";
    const p95 = alone ? a.frameP95Ms : diff(a.frameP95Ms, b.frameP95Ms);
    rows.push({
      part,
      n,
      p95Ms: p95,
      cpuP95Ms: alone ? a.cpuP95Ms : diff(a.cpuP95Ms, b.cpuP95Ms),
      drawCalls: alone ? a.drawCalls : diff(a.drawCalls, b.drawCalls),
      subMs: budget,
      overMs: p95 === null ? null : Math.max(0, Math.round((p95 - budget) * 100) / 100),
      note,
    });
  };
  row("base", 0, base, "none", sub.base, "p95(0)");
  for (const n of counts) {
    const vat = medians["crowd-vat@" + n];
    if (vat) row("crowd", n, vat, base, sub.crowd, "p95(B) − p95(0)");
    else row("crowd", n, medians["crowd-proc@" + n], base, sub.crowd, "p95(A procedural) − p95(0): tham chiếu 1a, phần chính thức dùng B (VAT) ở 1b");
    row("swords-fx", n, medians["vankiem@" + n], vat, sub.swordsFx, "p95(C) − p95(B)");
    row("skinned", n, medians["skinned@" + n], medians["vankiem@" + n], sub.skinned, "p95(E) − p95(C)");
  }
  return rows;
}

const list = (value, fallback) => (value ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

function caseUrl(base, id, quality, count, env) {
  const params = new URLSearchParams({ case: id, q: quality, motion: "full", seconds: String(env.seconds), warmup: String(env.warmup) });
  if (id !== "base") params.set("count", String(count));
  if (env.swords) params.set("swords", env.swords);
  if (env.skinned) params.set("skinned", env.skinned);
  return base + "/bench.html?" + params.toString();
}

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:3008/").replace(/\/$/, "");
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/bench");
  const quality = process.env.Q ?? "high";
  const cases = list(process.env.CASE, "base,crowd-proc").filter((c) => CASES.includes(c));
  const counts = list(process.env.COUNT, "60,120,300").map(Number).filter((n) => n > 0);
  const env = {
    seconds: Number(process.env.SECONDS ?? "10"),
    warmup: Number(process.env.WARMUP ?? "2"),
    runs: Math.max(1, Number(process.env.RUNS ?? "3")),
    swords: process.env.SWORDS ?? "",
    skinned: process.env.SKINNED ?? "",
    shots: process.env.SHOTS !== "0",
    allocSeconds: process.env.ALLOC === "0" ? 0 : Number(process.env.ALLOC ?? "3"),
  };
  const tag = quality + "-" + page.width + "x" + page.height + (process.env.TAG ? "-" + process.env.TAG : "");
  mkdirSync(out, { recursive: true });
  const runs = [];
  const skipped = [];
  const pictures = [];
  const badResources = [];
  const alloc = {};
  for (const id of cases) {
    for (const count of id === "base" ? [0] : counts) {
      let finished = 0;
      for (let run = 1; run <= env.runs; run += 1) {
        await page.goto(caseUrl(base, id, quality, count, env), { settle: 300 });
        let result = null;
        const limit = (env.warmup + env.seconds) * 1000 + 30_000;
        for (let waited = 0; waited < limit && !result; waited += 250) {
          await page.sleep(250);
          result = await page.eval("window.__icBench ?? null");
        }
        if (!result || result.evalError || result.error) {
          skipped.push({ case: id, count, run, reason: result?.error ?? result?.evalError ?? "bench did not finish" });
          await page.eval("window.__icBenchStop && window.__icBenchStop()");
          break;
        }
        runs.push({ run, ...result, valid: result.valid && !isSoftware(result.gpu) });
        finished += 1;
        if (run === 1 && env.shots) {
          const stem = join(out, "ic-bench-" + id + (count > 0 ? "-n" + count : "") + "-" + tag);
          pictures.push(await page.shot(stem + ".png"));
          if (count > 0) {
            await page.eval("window.__icBenchCamera && window.__icBenchCamera('close')");
            await page.sleep(400);
            pictures.push(await page.shot(stem + "-close.png"));
          }
        }
        const bad = await page.eval("performance.getEntriesByType('resource').filter((r) => (r.responseStatus ?? 200) >= 400).map((r) => r.name + ' ' + r.responseStatus)");
        if (Array.isArray(bad)) badResources.push(...bad);
        await page.eval("window.__icBenchStop && window.__icBenchStop()");
      }
      if (finished > 0 && env.allocSeconds > 0) {
        const url = caseUrl(base, id, quality, count, { ...env, seconds: env.allocSeconds + 60, warmup: 1 });
        alloc[id + "@" + count] = await allocProfile(page, url, env.allocSeconds);
      }
    }
  }
  const groups = {};
  for (const r of runs) (groups[r.case + "@" + r.count] ??= []).push(r);
  const medians = Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, medianOf(value)]));
  const parts = partsOf(medians, quality, counts);
  const renderer = runs[0]?.gpu ?? null;
  const valid = runs.length > 0 && runs.every((r) => r.valid);
  const budget = BUDGETS[quality] ?? BUDGETS.high;
  const heapGc = runs.length > 0 && runs.every((r) => r.heapGc === true);
  const verdictRows = Object.entries(medians).map(([key, m]) => ({
    key,
    meanMs: m.frameMeanMs,
    p95Ms: m.frameP95Ms,
    maxMs: m.frameMaxMs,
    cpuP95Ms: m.cpuP95Ms,
    drawCalls: m.drawCalls,
    heapGrowthMb: m.heapGrowthMb,
    heapOk: heapOk(m.heapGrowthMb, heapGc),
    // Bytes allocated per frame by this game's code and the kit (three.js apart): 0 is the rule for hot paths.
    gameBytesPerFrame: alloc[key] ? alloc[key].bytesPerFrame.game + alloc[key].bytesPerFrame.kit : null,
    threeBytesPerFrame: alloc[key] ? alloc[key].bytesPerFrame.three : null,
    // Totals of canon §20.2 (informative in 1a: the verdict is case E at the rule's N, milestone 1b).
    withinTotals:
      (budget.frameMeanMs === null || m.frameMeanMs <= budget.frameMeanMs) && m.frameP95Ms <= budget.frameP95Ms && m.cpuP95Ms <= budget.cpuP95Ms && m.drawCalls <= budget.drawCalls,
  }));
  const report = {
    quality,
    viewport: page.width + "x" + page.height,
    renderer,
    valid,
    reducedMotion: runs[0]?.reducedMotion ?? null,
    motion: runs[0]?.motion ?? null,
    heapGc,
    env: { ...env, chromeFlags: process.env.CHROME_FLAGS ?? "", url: base },
    budget,
    medians,
    parts,
    alloc,
    runs,
    skipped,
    badResources,
    pictures,
    at: new Date().toISOString(),
  };
  const file = join(out, "ic-bench-" + tag + ".json");
  writeFileSync(file, JSON.stringify(report, null, 1));
  const allocTop = Object.fromEntries(Object.entries(alloc).map(([key, a]) => [key, { frames: a.frames, bytesPerFrame: a.bytesPerFrame, top: a.top.slice(0, 3) }]));
  return { file, renderer, valid, heapGc, rows: verdictRows, parts, alloc: allocTop, skipped, badResources, pictures: pictures.length };
}
