// Frame cost per element (canon D59, ELEMENT_LAYER.md §5: an element adds at most 0.85 ms p95 over Metal on High,
// 1920×1080, DPR 1; nothing over the 11.5 ms ceiling), on the dev-only skills lab at the play camera: key 1 (Threefold
// Sword Command, its three blades and hits), key 7 (Myriad Swords) in its hunt (F30–F168) and its gather and finisher
// (F168–F215), and K5's waves after its cut-in. Each frame is timed in the page (its CPU, then a 1-pixel read that
// waits for the GPU: __lab.perf, an upper bound since a real frame overlaps them); every number is the median of RUNS.
//   BASE=http://127.0.0.1:3061/skills-lab.html Q=high ELEMENT=metal OUT=tmp/shots/element-fire/perf-metal.json \
//   ../../.local/bin/heavy.sh --perf node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-element-perf.mjs --width=1920 --height=1080 --dpr=1
// QS appends raw query flags (QS="&aura=a"); the sword aura's A/B alternation is lab-sword-aura.mjs PLAN=perf.
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
  const base = process.env.BASE ?? "http://127.0.0.1:3061/skills-lab.html";
  const q = process.env.Q ?? "high";
  const runs = Number(process.env.RUNS ?? "3");
  const element = process.env.ELEMENT ? `&element=${process.env.ELEMENT}` : "";
  const qs = process.env.QS ?? "";
  await page.goto(`${base}?fixed=1&ui=0&probe=0&q=${q}&dpr=1&weapon=clear-wind&cutin=0.9${element}${qs}`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await sleep(1500);
  if (process.env.ELEMENT === "fire" && !qs.includes("impact=lotus")) {
    for (let i = 0; i < 80; i += 1) {
      if (await page.eval("!!window.__lab.fireImpact?.().ready")) break;
      await sleep(250);
    }
  }
  const rows = { idle: [], key1: [], key7Hunt: [], key7Finish: [], k5: [] };
  let gpu = "";
  for (let run = 0; run < runs; run += 1) {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    // Warm-up: one whole cast of each (buffers upload, programs compile), then rest.
    for (const [slot, frames] of [["k1", 100], ["k7", 260], ["k5", 300]]) {
      await page.eval(`window.__lab.type('${slot}')`);
      await page.eval(`window.__lab.step(${frames})`);
    }
    await page.eval("window.__lab.reset()");
    // step() renders without waiting for the GPU, so the first timed frame after it waited for the whole backlog
    // (one 140-670 ms "frame" at index 0 of each window, Metal and Fire alike; 03/11 check): the last frame before
    // each window is a timed one (perf(1)), which drains the queue, and the timeline stays the same length.
    await page.eval("window.__lab.step(29)");
    await page.eval("window.__lab.perf(1)");
    const idle = await page.eval("window.__lab.perf(60)");
    await page.eval("window.__lab.type('k1')");
    const key1 = await page.eval("window.__lab.perf(90)");
    await page.eval("window.__lab.step(60)");
    await page.eval("window.__lab.type('k7')");
    await page.eval("window.__lab.step(29)");
    await page.eval("window.__lab.perf(1)");
    const hunt = await page.eval("window.__lab.perf(138)");
    const finish = await page.eval("window.__lab.perf(47)");
    await page.eval("window.__lab.step(60)");
    await page.eval("window.__lab.type('k5')");
    await page.eval("window.__lab.step(79)");
    await page.eval("window.__lab.perf(1)");
    const k5 = await page.eval("window.__lab.perf(120)");
    for (const r of [idle, key1, hunt, finish, k5]) if (r?.evalError) throw new Error(r.evalError);
    gpu = hunt.gpu;
    rows.idle.push(stats(idle));
    rows.key1.push(stats(key1));
    rows.key7Hunt.push(stats(hunt));
    rows.key7Finish.push(stats(finish));
    rows.k5.push(stats(k5));
    await page.eval("window.__lab.step(120)");
  }
  const pick = (k, f) => median(rows[k].map((s) => s[f]));
  const sum = (k) => ({ mean: pick(k, "mean"), p50: pick(k, "p50"), p95: pick(k, "p95"), max: pick(k, "max"), cpuP95: pick(k, "cpuP95"), drawCalls: rows[k][0].drawCalls, triangles: rows[k][0].triangles });
  const info = { element: await page.eval("typeof window.__lab.element === 'function' ? window.__lab.element() : 'none'") };
  const fire = await page.eval("window.__lab.fireImpact ? window.__lab.fireImpact() : null");
  const report = { q, width: page.width, height: page.height, dpr: 1, runs, gpu, element: info.element, impact: fire?.mode ?? null, brushReady: fire?.ready ?? false, qs, ceilingP95Ms: 11.5, idle: sum("idle"), key1: sum("key1"), key7Hunt: sum("key7Hunt"), key7Finish: sum("key7Finish"), k5Waves: sum("k5"), runsRaw: rows };
  if (process.env.OUT) {
    const out = resolve(process.env.OUT);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 1));
  }
  return report;
}
