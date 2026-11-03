// Frame cost of Thiên Hà Kiếm Vũ's swarm in the skills lab (Clear Wind's model test, 02/11/2026): on the
// dev-only page /skills-lab.html?fixed=1&ui=0&probe=0, for each swarm size (?k5n=) and each swarm geometry
// (__lab.swarm: "standin" the stand-in jian, "full" the weapon's whole GLB, "lod" its swarm LOD), it times
// an idle window (no skill: the base, the caster and its hand prop) and the K5 peak (every swarm blade on
// screen, 0.5–2.5 s after the cast, the three waves and their hit-stops included). Each frame is timed in the
// page: the frame's CPU, then a 1-pixel read that waits for the GPU (__lab.perf), so "total" is CPU + GPU of
// one frame, serialized (an upper bound: a real frame overlaps them). Means drop the slowest 2 % of frames;
// every number is the median of RUNS. The K5 cost is
// peak − idle, judged against canon §20.2's "swords, VFX" sub-budget (Dell numbers; on the M4 × the tier's
// factor: High 3.5 ms, Low 2 × 2 = 4 ms) and the tier's frame p95 on the M4 (High 12 ms, Low 16 ms).
//   Q=high K5N=300,500 node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-k5-perf.mjs --width=1920 --height=1080
//   Q=low K5N=150 node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-k5-perf.mjs --width=1280 --height=720
// Env: BASE (http://127.0.0.1:3018/skills-lab.html), Q (high), K5N (comma list; the tier's own when empty),
// MODES (standin,full,lod), RUNS (3), FRAMES (120), IDLE (60), TRIM (0: draw every slot, the old way),
// OUT (a JSON file to write; optional).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUDGET = { low: { frameP95: 16, swords: 4 }, medium: { frameP95: 12, swords: 3 }, high: { frameP95: 12, swords: 3.5 }, ultra: { frameP95: 12, swords: 3.5 } };

const sorted = (a) => [...a].sort((x, y) => x - y);
const pct = (a, p) => {
  const s = sorted(a);
  return s.length === 0 ? null : s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const mean = (a) => (a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const median = (a) => pct(a, 0.5);
/** Mean without the slowest 2 % (a GC or a driver stall once in a run says nothing about the swarm). */
const trimmed = (a) => mean(sorted(a).slice(0, Math.max(1, Math.ceil(a.length * 0.98))));
const stats = (r) => ({ mean: r2(trimmed(r.total)), p50: r2(pct(r.total, 0.5)), p95: r2(pct(r.total, 0.95)), max: r2(Math.max(...r.total)), cpuMean: r2(mean(r.cpu)), cpuP95: r2(pct(r.cpu, 0.95)), drawCalls: r.drawCalls, triangles: r.triangles, swarm: r.swarm, hero: r.hero });

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3018/skills-lab.html";
  const q = process.env.Q ?? "high";
  const sizes = (process.env.K5N ?? "").split(",").filter(Boolean).map(Number);
  const modes = (process.env.MODES ?? "standin,full,lod").split(",").filter(Boolean);
  const runs = Number(process.env.RUNS ?? "3");
  const frames = Number(process.env.FRAMES ?? "120");
  const idleFrames = Number(process.env.IDLE ?? "60");
  const budget = BUDGET[q] ?? BUDGET.high;
  const report = { q, width: page.width, height: page.height, runs, frames, budget, gpu: "", sizes: [] };
  for (const n of sizes.length > 0 ? sizes : [0]) {
    // TRIM=0: every blade slot drawn, hidden ones too (BladeSet before 02/11), for the before/after of the trim.
    const url = `${base}?fixed=1&ui=0&probe=0&q=${q}${n > 0 ? `&k5n=${n}` : ""}${process.env.TRIM === "0" ? "&trim=0" : ""}`;
    await page.goto(url, { settle: 1500 });
    for (let i = 0; i < 240; i += 1) {
      if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
      await sleep(250);
    }
    const raw = Object.fromEntries(modes.map((m) => [m, { idle: [], peak: [], tris: 0 }]));
    for (let run = 0; run < runs; run += 1) {
      for (const mode of modes) {
        const tris = await page.eval(`window.__lab.swarm(${JSON.stringify(mode)})`);
        raw[mode].tris = tris;
        // No file for this geometry (the LOD before it is built): skipped.
        if (typeof tris !== "number" || tris < 0) continue;
        await page.eval("window.__lab.reset()");
        await page.eval("window.__lab.camera('play')");
        // Warm-up: one whole cast with this geometry (its buffers upload, every program compiles), then rest.
        await page.eval("window.__lab.cast('k5', 0, -8)");
        await page.eval("window.__lab.step(200)");
        await page.eval("window.__lab.reset()");
        // step() renders without waiting for the GPU, so the first timed frame after it would absorb the whole backlog
        // (lab-element-perf.mjs, 03/11 check): the last frame before each window is a timed one (perf(1)), which drains
        // the queue, and the timeline keeps its length.
        await page.eval("window.__lab.step(19)");
        await page.eval("window.__lab.perf(1)");
        const idle = await page.eval(`window.__lab.perf(${idleFrames})`);
        await page.eval("window.__lab.cast('k5', 0, -8)");
        await page.eval("window.__lab.step(29)");
        await page.eval("window.__lab.perf(1)");
        const peak = await page.eval(`window.__lab.perf(${frames})`);
        if (idle?.evalError || peak?.evalError) throw new Error(idle.evalError ?? peak.evalError);
        report.gpu = peak.gpu;
        raw[mode].idle.push(stats(idle));
        raw[mode].peak.push(stats(peak));
        // Let the cast finish before the next mode.
        await page.eval("window.__lab.step(180)");
      }
    }
    const k5n = n > 0 ? n : null;
    const rows = modes.filter((mode) => raw[mode].peak.length > 0).map((mode) => {
      const r = raw[mode];
      const pick = (side, key) => r2(median(r[side].map((s) => s[key])));
      const idleP95 = pick("idle", "p95");
      const peakP95 = pick("peak", "p95");
      const idleMean = pick("idle", "mean");
      const peakMean = pick("peak", "mean");
      const k5Cost = peakMean !== null && idleMean !== null ? r2(peakMean - idleMean) : null;
      const k5CostP95 = peakP95 !== null && idleP95 !== null ? r2(peakP95 - idleP95) : null;
      return {
        mode,
        swarmTriangles: r.tris,
        swarmBlades: r.peak[0]?.swarm ?? null,
        idle: { mean: idleMean, p95: idleP95, cpuP95: pick("idle", "cpuP95"), drawCalls: r.idle[0]?.drawCalls, triangles: r.idle[0]?.triangles },
        peak: { mean: peakMean, p95: peakP95, max: pick("peak", "max"), cpuMean: pick("peak", "cpuMean"), cpuP95: pick("peak", "cpuP95"), drawCalls: r.peak[0]?.drawCalls, triangles: r.peak[0]?.triangles },
        k5CostMs: k5Cost,
        k5CostP95Ms: k5CostP95,
        overSwordsBudget: k5CostP95 !== null ? k5CostP95 > budget.swords : null,
        overFrameP95: peakP95 !== null ? peakP95 > budget.frameP95 : null,
        runs: r.peak.map((s, i) => ({ idleP95: r.idle[i].p95, peakP95: s.p95, peakMean: s.mean })),
      };
    });
    report.sizes.push({ k5n, rows });
  }
  if (process.env.OUT) {
    const out = resolve(process.env.OUT);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 1));
  }
  return report;
}
