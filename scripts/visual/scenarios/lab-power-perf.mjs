// Frame cost of key 7, Vạn Kiếm Triều Tông (power pass, 03/11/2026), on the dev-only skills lab at the play camera:
// an idle window, the hunt (F30–F168: the river at full size and 30–40 dives every 100 ms) and the gather and
// finisher (F168–F215: the stroke, the two-way cut, the fold), each frame timed in the page (its CPU, then a
// 1-pixel read that waits for the GPU: __lab.perf, an upper bound since a real frame overlaps them). Means drop
// the slowest 2 %; every number is the median of RUNS. Budget: High p95 ≤ 12 ms on the M4 at 1920×1080, DPR 1.
//   BASE=http://127.0.0.1:3020/skills-lab.html Q=high OUT=tmp/shots/power/perf-high.json \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power-perf.mjs --width=1920 --height=1080 --dpr=1
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sorted = (a) => [...a].sort((x, y) => x - y);
const pct = (a, p) => {
  const s = sorted(a);
  return s.length === 0 ? null : s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const mean = (a) => (a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const trimmed = (a) => mean(sorted(a).slice(0, Math.max(1, Math.ceil(a.length * 0.98))));
const stats = (r) => ({ mean: r2(trimmed(r.total)), p50: r2(pct(r.total, 0.5)), p95: r2(pct(r.total, 0.95)), max: r2(Math.max(...r.total)), cpuP95: r2(pct(r.cpu, 0.95)), drawCalls: r.drawCalls, triangles: r.triangles });
const median = (a) => r2(pct(a, 0.5));

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3020/skills-lab.html";
  const q = process.env.Q ?? "high";
  const runs = Number(process.env.RUNS ?? "3");
  // cutin=0.9: the K5 frame tables were timed on the 0.9 s cut-in; the lab's default is 1.7 s since 03/11 (style C).
  await page.goto(`${base}?fixed=1&ui=0&probe=0&q=${q}&dpr=1&weapon=clear-wind&cutin=0.9`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  const rows = { idle: [], hunt: [], finish: [], k5: [] };
  let gpu = "";
  let shown = 0;
  for (let run = 0; run < runs; run += 1) {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    // Warm-up: one whole cast (buffers upload, programs compile), then rest.
    await page.eval("window.__lab.type('k7')");
    await page.eval("window.__lab.step(260)");
    await page.eval("window.__lab.type('k5')");
    await page.eval("window.__lab.step(300)");
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.step(30)");
    const idle = await page.eval("window.__lab.perf(60)");
    await page.eval("window.__lab.type('k7')");
    await page.eval("window.__lab.step(30)");
    const hunt = await page.eval("window.__lab.perf(138)");
    shown = Math.max(shown, (await page.eval("window.__lab.van()")).shown);
    const finish = await page.eval("window.__lab.perf(47)");
    await page.eval("window.__lab.step(60)");
    // Thiên Hà after its cut-in (61 frames), its three waves.
    await page.eval("window.__lab.type('k5')");
    await page.eval("window.__lab.step(80)");
    // K5_FRAMES: a longer window for round 3b's sword rain (its waves and climax run past 120 frames).
    const k5 = await page.eval(`window.__lab.perf(${Number(process.env.K5_FRAMES ?? "120")})`);
    for (const r of [idle, hunt, finish, k5]) if (r?.evalError) throw new Error(r.evalError);
    gpu = hunt.gpu;
    rows.idle.push(stats(idle));
    rows.hunt.push(stats(hunt));
    rows.finish.push(stats(finish));
    rows.k5.push(stats(k5));
    await page.eval("window.__lab.step(120)");
  }
  const pick = (k, f) => median(rows[k].map((s) => s[f]));
  const sum = (k) => ({ mean: pick(k, "mean"), p50: pick(k, "p50"), p95: pick(k, "p95"), max: pick(k, "max"), cpuP95: pick(k, "cpuP95"), drawCalls: rows[k][0].drawCalls, triangles: rows[k][0].triangles });
  const report = {
    q,
    width: page.width,
    height: page.height,
    dpr: 1,
    runs,
    gpu,
    budgetP95Ms: 12,
    swordsShownPeak: shown,
    idle: sum("idle"),
    key7Hunt: sum("hunt"),
    key7Finish: sum("finish"),
    k5Waves: sum("k5"),
    runsRaw: rows,
  };
  report.key7PeakP95 = Math.max(report.key7Hunt.p95, report.key7Finish.p95);
  report.overBudget = report.key7PeakP95 > 12;
  if (process.env.OUT) {
    const out = resolve(process.env.OUT);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 1));
  }
  return report;
}
