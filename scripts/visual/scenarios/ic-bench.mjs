// Source: games/dragon-hold/scripts/visual/scenarios/dh-bench.mjs @06cd4e6 (adapted: HN0 cases of canon §20.3 on bench.html, RUNS with medians, validity by renderer string, per-part differences and the over-budget column; self-contained, no lib/**)
/**
 * HN0 bench scenario (canon §20.1–20.3; M0A_PLAN §6.1 step 10, §9). Opens
 * /bench.html?case=…&q=…&count=…&motion=full once per run, waits for
 * window.__icBench, keeps the median of RUNS, writes JSON and pictures to
 * OUT_DIR, marks a run invalid when the renderer string is SwiftShader,
 * llvmpipe or software, and prints each part's cost (base, crowd, swords and
 * VFX, skinned) at every N against its sub-budget ("phần vượt"), with the CPU
 * p95 and draw-call differences. Every case of canon §20.3 is drawn (1b).
 *
 * Windows Chrome with the GPU (Vite in WSL on 3008):
 *   $env:URL="http://127.0.0.1:3008/"; $env:OUT_DIR="…\tmp\shots\bench"
 *   $env:CHROME_FLAGS="--disable-gpu-vsync --disable-frame-rate-limit --enable-precise-memory-info --js-flags=--expose-gc"
 *   $env:Q="high"; $env:CASE="base,crowd-vat,vankiem,impostor,skinned"; $env:COUNT="60,120,300"; $env:RUNS="3"
 *   node src\kit\tools\cdp-run.mjs scripts\visual\scenarios\ic-bench.mjs --width=1920 --height=1080
 * Low 1280×720, Medium 1600×900, High 1920×1080 (canon §20.2).
 * Env: URL, OUT_DIR (tmp/shots/bench), Q (high), CASE (comma list; every case),
 * COUNT (comma list; 60,120,300), SWORDS, SKINNED (case E's rigs; the Thất
 * Tinh run is SKINNED=10 TAG=seven), VAT (a baked VAT's JSON URL for the
 * confirmation pass, `{q}` = the tier), STEPS (ladder steps, e.g. L3 or
 * L1,L3), SECONDS (10), WARMUP (2), RUNS (3), SHOTS (1; 0 none), TAG (file
 * name suffix), ALLOC (seconds, 3; 0 off).
 * Allocation (M0A_PLAN §6.1 note, đã chọn theo đề xuất 25/10): the criterion of
 * record is ALLOC, one more page load per case under the CDP sampling heap
 * profiler: bytes per frame of the game's modules (src/ outside src/view/bench)
 * plus the kit copy, at most ALLOC_NOISE_B (0 is the rule for hot paths; the
 * sampler's noise is a few dozen bytes). The bench driver (src/view/bench) and
 * three.js are printed apart. usedJSHeapSize growth over the window is still
 * printed (after a full GC when Chrome has `--js-flags=--expose-gc`) as a leak
 * signal; uncapped, three.js alone allocates kilobytes a frame, so it is not
 * the verdict.
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
/** Every case is drawn (milestone 1b). */
export const BUILT = [...CASES];

/** Leak signal only (M0A_PLAN §6.1 note): usedJSHeapSize growth over the 10 s window, MB. */
export const HEAP_GROWTH_MB = 2;

/** The heap signal of one median row: null unless every run had a GC before its window. */
export const heapOk = (growthMb, gcBefore) => (gcBefore && typeof growthMb === "number" ? growthMb <= HEAP_GROWTH_MB : null);

/** The allocation criterion of record (M0A_PLAN §6.1 note, 25/10): game modules + kit, bytes per frame, at most the sampler's noise. */
export const ALLOC_NOISE_B = 64;
export const allocOk = (bytesPerFrame) => (typeof bytesPerFrame === "number" ? bytesPerFrame <= ALLOC_NOISE_B : null);

/**
 * Who allocated, by the sampled frame's own script: this game's modules, the bench driver
 * (src/view/bench: herd, meter, page loop), the kit copy, three.js (any other script: Vite's
 * pre-bundled deps, wherever its cache lives), or no script at all.
 */
export function allocBucket(url) {
  const u = String(url ?? "");
  if (u === "") return "other";
  if (/\/src\/kit\//.test(u)) return "kit";
  if (/\/src\/view\/bench\//.test(u)) return "bench";
  if (/\/src\//.test(u)) return "game";
  return "three";
}

/**
 * Bytes per bucket of a CDP sampling heap profile (GC'd objects included) and the top game, bench and
 * kit sites. A native frame (no script URL: a builtin, a WebGL call) counts for the nearest script above it.
 */
export function allocSummary(profile) {
  const bytes = { game: 0, bench: 0, kit: 0, three: 0, other: 0 };
  const sites = new Map();
  const walk = (node, owner) => {
    const frame = node.callFrame ?? {};
    const here = frame.url ? { bucket: allocBucket(frame.url), site: (frame.functionName || "(anonymous)") + " " + String(frame.url).replace(/^.*?\/src\//, "src/").replace(/\?.*$/, "") } : owner;
    if (node.selfSize > 0) {
      bytes[here.bucket] += node.selfSize;
      if (here.bucket === "game" || here.bucket === "bench" || here.bucket === "kit") sites.set(here.site, (sites.get(here.site) ?? 0) + node.selfSize);
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
    bytesPerFrame: {
      game: per(bytes.game),
      bench: per(bytes.bench),
      kit: per(bytes.kit),
      three: per(bytes.three),
      other: per(bytes.other),
      total: per(bytes.game + bytes.bench + bytes.kit + bytes.three + bytes.other),
    },
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
 * The totals of canon §20.2 for one median row (frame mean, p95, CPU p95, draw calls, texture
 * memory): every failed total by name; empty when it passes (a tier passes HN0 when case E at the
 * rule's N passes, canon §20.3).
 */
export function totalsFailed(m, quality) {
  const b = BUDGETS[quality] ?? BUDGETS.high;
  const failed = [];
  if (!m) return ["no run"];
  if (b.frameMeanMs !== null && !(m.frameMeanMs <= b.frameMeanMs)) failed.push("frameMean " + m.frameMeanMs + " > " + b.frameMeanMs);
  if (!(m.frameP95Ms <= b.frameP95Ms)) failed.push("frameP95 " + m.frameP95Ms + " > " + b.frameP95Ms);
  if (!(m.cpuP95Ms <= b.cpuP95Ms)) failed.push("cpuP95 " + m.cpuP95Ms + " > " + b.cpuP95Ms);
  if (!(m.drawCallsMax <= b.drawCalls)) failed.push("drawCalls " + m.drawCallsMax + " > " + b.drawCalls);
  if (!(m.textureMb <= b.textureMb)) failed.push("textureMb " + m.textureMb + " > " + b.textureMb);
  return failed;
}

/**
 * Per-part cost at each N (canon §20.3, D36): base = p95(0); crowd = p95(B) − p95(0);
 * swords, VFX, numbers = p95(C) − p95(B); skinned = p95(E) − p95(C). Without B the crowd line
 * uses A (procedural) as a reference and says so. Also CPU p95 and draw calls.
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
    else row("crowd", n, medians["crowd-proc@" + n], base, sub.crowd, "p95(A procedural) − p95(0): chỉ tham chiếu, phần chính thức là B (VAT)");
    row("swords-fx", n, medians["vankiem@" + n], vat, sub.swordsFx, "p95(C) − p95(B)");
    row("skinned", n, medians["skinned@" + n], medians["vankiem@" + n], sub.skinned, "p95(E) − p95(C)");
  }
  return rows;
}

const list = (value, fallback) => (value ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

/** The page URL of one run (the page parses the same names: src/view/bench/cases.ts). */
export function caseUrl(base, id, quality, count, env) {
  const params = new URLSearchParams({ case: id, q: quality, motion: "full", seconds: String(env.seconds), warmup: String(env.warmup) });
  if (id !== "base") params.set("count", String(count));
  if (env.swords) params.set("swords", env.swords);
  if (env.skinned) params.set("skinned", env.skinned);
  if (env.vat && id !== "base" && id !== "crowd-proc") params.set("vat", env.vat);
  if (env.steps) params.set("steps", env.steps);
  return base + "/bench.html?" + params.toString();
}

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:3008/").replace(/\/$/, "");
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/bench");
  const quality = process.env.Q ?? "high";
  const cases = list(process.env.CASE, CASES.join(",")).filter((c) => CASES.includes(c));
  const counts = list(process.env.COUNT, "60,120,300").map(Number).filter((n) => n > 0);
  const env = {
    seconds: Number(process.env.SECONDS ?? "10"),
    warmup: Number(process.env.WARMUP ?? "2"),
    runs: Math.max(1, Number(process.env.RUNS ?? "3")),
    swords: process.env.SWORDS ?? "",
    skinned: process.env.SKINNED ?? "",
    vat: process.env.VAT ?? "",
    steps: process.env.STEPS ?? "",
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
  const verdictRows = Object.entries(medians).map(([key, m]) => {
    const a = alloc[key];
    const gameKit = a ? a.bytesPerFrame.game + a.bytesPerFrame.kit : null;
    const failed = totalsFailed(m, quality);
    return {
      key,
      meanMs: m.frameMeanMs,
      p95Ms: m.frameP95Ms,
      maxMs: m.frameMaxMs,
      cpuP95Ms: m.cpuP95Ms,
      drawCalls: m.drawCallsMax,
      textureMb: m.textureMb,
      // Totals of canon §20.2; the tier's verdict reads case E at the rule's N (canon §20.3).
      withinTotals: failed.length === 0,
      failed,
      // Allocation criterion of record: game modules + kit bytes per frame (bench driver and three.js apart).
      gameKitBytesPerFrame: gameKit,
      allocOk: allocOk(gameKit),
      benchBytesPerFrame: a ? a.bytesPerFrame.bench : null,
      threeBytesPerFrame: a ? a.bytesPerFrame.three : null,
      // Leak signal only.
      heapGrowthMb: m.heapGrowthMb,
      heapOk: heapOk(m.heapGrowthMb, heapGc),
    };
  });
  // Case E at each N (canon §20.3): the tier passes at N when every total of §20.2 holds.
  const verdict = counts.map((n) => {
    const m = medians["skinned@" + n];
    const failed = m ? totalsFailed(m, quality) : null;
    return { n, ran: m !== undefined, pass: failed === null ? null : failed.length === 0, failed, meanMs: m?.frameMeanMs ?? null, p95Ms: m?.frameP95Ms ?? null, drawCalls: m?.drawCallsMax ?? null };
  });
  const over = parts.filter((p) => p.overMs !== null && p.overMs > 0).map((p) => p.part + "@" + p.n + " +" + p.overMs + " ms");
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
    over,
    verdict,
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
  return { file, renderer, valid, heapGc, verdict, over, rows: verdictRows, parts, alloc: allocTop, skipped, badResources, pictures: pictures.length };
}
