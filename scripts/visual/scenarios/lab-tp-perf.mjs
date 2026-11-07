// Run through cdp-run outside the Codex sandbox. Same CPU + 1-pixel GPU wait as lab-element-perf.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootstrap, prepareTp, tpUrl } from "./lab-pilot-ab.mjs";

const percentile = (values, p) => {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error("Mẫu hiệu năng rỗng hoặc không hữu hạn");
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const median = values => percentile(values, 0.5);
const stats = values => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), max: Math.max(...values) });
const SEED = 711;
const CASTS = 10;
const FRAMES = 180;

export default async function (page) {
  const base = process.env.BASE ?? process.env.URL ?? "http://127.0.0.1:3146/skills-lab.html";
  const runs = Number(process.env.RUNS ?? "3");
  if (!Number.isInteger(runs) || runs < 3 || runs % 2 === 0) throw new Error("RUNS phải là số lẻ ≥ 3 (mặc định 3)");
  const out = resolve(process.env.OUT_DIR ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/r2-step1/tp-perf");
  if (existsSync(join(out, "tp-perf.json"))) throw new Error("OUT_DIR đã có kết quả; dùng thư mục mới");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Đo CPU + chờ GPU Cột Lôi B8 tắt/bật tp2\nmade-by: Codex · lab-tp-perf\ndoc: docs/codex-queue/laneR2-report.md\ndelete-when: Chủ dự án đã xem và chốt bước R2-1\n");
  await page.viewport(1920, 1080, 1);
  const ev = async expression => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  const report = { width: 1920, height: 1080, dpr: 1, q: "high", hz: 60, seed: SEED, runs, castsPerRun: CASTS, framesPerCast: FRAMES,
    method: "CPU frame(dt), rồi readPixels RGBA 1×1 chờ GPU qua __lab.perf(1); không cắt ngoại lệ; trung vị thống kê từng lượt",
    herd: "Bầy quái mặc định của lab (still), không thay số lượng hoặc độ bền", ceilingP95Ms: 11.5, deltaP95BudgetMs: 1,
    variants: { A: { tp2: false, runs: [] }, B: { tp2: true, runs: [] } }, status: "đang đo" };
  const save = () => writeFileSync(join(out, "tp-perf.json"), JSON.stringify(report, null, 2) + "\n");
  let preloadId;
  try {
    for (let run = 0; run < runs; run++) {
      // Alternate order to reduce thermal/order bias. Each variant/run gets a fresh page and identical seed.
      for (const label of run % 2 ? ["B", "A"] : ["A", "B"]) {
        const enabled = label === "B", variant = report.variants[label];
        const url = tpUrl(base, enabled);
        url.searchParams.delete("herd"); // Default herd, including all default beasts.
        variant.url = url.href;
        if (preloadId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
        preloadId = (await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap(SEED) })).identifier;
        const logStart = page.logs.length, exceptionStart = page.exceptions.length;
        await page.goto(url.href);
        await prepareTp(ev, enabled);
        await ev(`window.__tpSettle = async () => {
          const end = performance.now() + 15000;
          while (!window.__pilotVideos.every(v => !v.getAttribute('src') || (!v.seeking && v.readyState >= 2 && window.__pilotDecoded(v)))) {
            if (window.__pilotVideos.some(v => v.error)) throw new Error('Video TP lỗi');
            if (performance.now() > end) throw new Error('Video TP chưa giải mã');
            await new Promise(ok => setTimeout(ok, 10));
          }
        }`);
        // A whole warm cast compiles programs/uploads textures before measured samples.
        await ev("window.__lab.reset(); window.__lab.camera('play'); window.__lab.showcase('pillar-thunder-single')");
        await ev(`(async () => { for (let i = 0; i < ${FRAMES}; i++) { window.__lab.perf(1); await window.__tpSettle(); } })()`);
        await ev("window.__pilotReseed(); window.__lab.reset(); window.__lab.camera('play'); window.__lab.step(29); window.__lab.perf(1)");
        await ev("window.__tpSettle()");
        const row = await ev(`(async () => {
          const cpu = [], total = [], calls = [], casts = [];
          let gpu = '';
          for (let cast = 0; cast < ${CASTS}; cast++) {
            const played = window.__lab.showcase('pillar-thunder-single').played;
            if (played !== 'pillar-thunder-single') throw new Error('Không tung được Cột Lôi');
            for (let frame = 0; frame < ${FRAMES}; frame++) {
              const r = window.__lab.perf(1, 1/60);
              cpu.push(r.cpu[0]); total.push(r.total[0]);
              if (Number.isFinite(r.drawCalls)) calls.push(r.drawCalls);
              gpu = r.gpu;
              // Decode work/wall-clock polling stays outside the CPU/GPU timed interval.
              await window.__tpSettle();
            }
            const r = window.__lab.clipSkill(8);
            if (r?.id !== 'pillar-thunder-single' || r.blows < 1) throw new Error('Cast không có điểm giáng');
            casts.push(r);
          }
          return { cpu, total, calls, casts, gpu };
        })()`);
        if (row.cpu.length !== CASTS * FRAMES || row.total.length !== CASTS * FRAMES) throw new Error("Thiếu mẫu khung");
        const warnings = page.logs.slice(logStart);
        if (page.exceptions.length > exceptionStart || warnings.some(s => /\[(five-phase-clip|thunder-caster-r2)\]/i.test(s))) throw new Error("Lỗi lab khi đo TP: " + warnings.join("; "));
        variant.runs.push({ run: run + 1, frameMs: stats(row.total), cpuMs: stats(row.cpu),
          drawCalls: row.calls.length ? stats(row.calls) : null, gpu: row.gpu, casts: row.casts,
          samples: { totalMs: row.total, cpuMs: row.cpu, drawCalls: row.calls } });
        save();
      }
    }
    for (const variant of Object.values(report.variants)) {
      variant.median = {};
      for (const field of ["frameMs", "cpuMs", "drawCalls"]) {
        variant.median[field] = variant.runs.every(r => r[field] !== null)
          ? Object.fromEntries(["p50", "p95", "p99", "max"].map(p => [p, median(variant.runs.map(r => r[field][p]))])) : null;
      }
    }
    const a = report.variants.A.median, b = report.variants.B.median;
    report.deltaP95Ms = b.frameMs.p95 - a.frameMs.p95;
    report.deltaDrawCallsMax = a.drawCalls && b.drawCalls ? b.drawCalls.max - a.drawCalls.max : null;
    // Gate unrounded values; baseline also has to meet the same absolute budget.
    report.status = report.deltaP95Ms <= 1 && Math.max(a.frameMs.p95, b.frameMs.p95) <= 11.5 ? "ĐẠT" : "TRƯỢT";
    report.conclusion = `${report.status}: Δp95=${report.deltaP95Ms.toFixed(3)} ms (≤ 1,0); p95 A=${a.frameMs.p95.toFixed(3)} ms, B=${b.frameMs.p95.toFixed(3)} ms (≤ 11,5)`;
    save();
    console.log(report.conclusion);
    return { out: join(out, "tp-perf.json"), conclusion: report.conclusion, A: a, B: b, deltaP95Ms: report.deltaP95Ms };
  } catch (error) {
    report.status = "lỗi"; report.error = String(error?.stack ?? error); save(); throw error;
  } finally {
    try {
      if (preloadId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
    } finally {
      execFileSync(process.execPath, [fileURLToPath(new URL("../../../../../scripts/review-index.mjs", import.meta.url)),
        process.env.REVIEW_ROOT ?? "/Volumes/SS990TPRO/htdocs/typing-game-review"], { stdio: "pipe" });
    }
  }
}
