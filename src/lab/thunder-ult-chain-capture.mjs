/** Ticket 434b. Claude runs on the existing worktree host via src/kit/tools/cdp-run.mjs. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default async function(page) {
  const out = process.env.OUT;
  if (!out || !out.startsWith("/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/"))
    throw new Error("OUT phải nằm trong typing-game-review/captures/tu-tien/");
  if (page.width !== 1280 || page.height !== 720 || page.dpr !== 1) throw new Error("Cần 1280×720, DPR 1");
  mkdirSync(out, { recursive: true });
  const about = "purpose: Phiếu 434b, mây và sét dây chuyền ở ba góc nhìn\nmade-by: Claude chạy scenario Codex\ndoc: docs/codex-queue/434b-report.md\ndelete-when: Owner duyệt xong và không cần đối chiếu\n";
  writeFileSync(join(out, "ABOUT.md"), about);
  const url = new URL(process.env.BASE || "http://127.0.0.1:3146/stress.html");
  for (const [k, v] of Object.entries({ fixed: "1", ui: "0", dpr: "1", q: "high", herd: "march" })) url.searchParams.set(k, v);
  for (const k of ["auto", "thunderUlt", "ultCam"]) url.searchParams.delete(k);
  const ev = async code => {
    const r = await page.eval(code); if (r?.evalError) throw new Error(r.evalError); return r;
  };
  const wait = async code => {
    for (let i = 0; i < 240; i++) { if (await ev(code)) return; await page.sleep(250); }
    throw new Error("Chưa sẵn sàng: " + code);
  };
  await page.goto(url.href, { settle: 1500 });
  await wait("window.__lab?.ready && window.__stress?.ready");
  await wait("window.__lab.thunderUlt().ready");
  const start = view => ev(`(() => {
    const l = window.__lab;
    l.view('play'); l.reset(); l.setHerd('march'); l.viewMode('top'); l.camera('play'); l.step(45);
    l.viewMode(${JSON.stringify(view === "behind" ? "behind" : "top")}); l.step(45);
    const population = Array.from({ length: 87 }, (_, i) => l.beast(i)).filter(b => b.alive).length
      + window.__stress.report().walkers.instances;
    if (population !== 100) throw new Error('Cảnh chưa đủ 100 quái: ' + population);
    l.showcase('ult-thunder-nine-heavens-v2');
    const r = l.thunderUlt();
    if (r.mode !== 'chain' || !r.active || !r.last.cloud) throw new Error('Host chưa có phiếu 434b');
    return { population, cloud: r.last.cloud, camera: l.captureCamera() };
  })()`);
  const seek = time => ev(`(() => {
    const l = window.__lab;
    for (let i = 0; i < 1800 && l.thunderUlt().last.clock < ${time} - 1e-8; i++)
      l.step(1, Math.min(1/60, ${time} - l.thunderUlt().last.clock));
    const r = l.thunderUlt().last;
    if (Math.abs(r.clock - ${time}) > 1e-7) throw new Error('Sai mốc: ' + r.clock);
    return r;
  })()`);
  await start("play"); await ev("window.__lab.step(300); true");
  const phases = [];
  for (const view of ["play", "top", "behind"]) {
    const initial = await start(view);
    for (const time of [0.4, 1.2, 2.2, 3.0]) {
      const report = await seek(time);
      // Orbit redraws the exact same frame; it advances neither timeline nor monsters.
      if (view === "top") await ev("window.__lab.setOrbit(0, 82, false); window.__lab.view('orbit', 100); true");
      const camera = await ev("window.__lab.captureCamera()");
      await page.shot(join(out, `434b-${view}-${time.toFixed(1)}s.png`));
      phases.push({ view, time, initial, camera, report });
      if (view === "top") await ev("window.__lab.view('play'); true");
    }
  }
  const initial = await start("play");
  const measured = await ev(`(() => {
    const rows = [];
    for (let i = 0; i < 240; i++) {
      const p = window.__lab.perf(1);
      rows.push({ cpu: p.cpu[0], total: p.total[0], draws: p.drawCalls, triangles: p.triangles, gpu: p.gpu });
    }
    return { rows, state: window.__lab.thunderUlt(), memory: window.__lab.memory() };
  })()`);
  const sorted = measured.rows.map(r => r.total).sort((a, b) => a - b), p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const realGpu = measured.rows.every(r => r.gpu && !/swiftshader|llvmpipe|software|unknown/i.test(r.gpu));
  const cleanPool = !measured.state.active && measured.state.live === 0;
  const frames = join(out, "frames"); mkdirSync(frames, { recursive: true });
  writeFileSync(join(frames, "ABOUT.md"), about);
  await start("play");
  for (let f = 0; f < 120; f++) {
    await ev("window.__lab.step(2); true");
    const shot = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    writeFileSync(join(frames, `f${String(f).padStart(4, "0")}.jpg`), Buffer.from(shot.data, "base64"));
  }
  const renderErrors = [...page.logs, ...page.exceptions].filter(r => /GL_INVALID|shader error|could not compile|404|failed to load/i.test(JSON.stringify(r)));
  const result = { url: url.href, viewport: [1280, 720], dpr: 1, quality: "high", initial,
    population: 100, targetSlots: 87, renderOnlyWalkers: 13, p95TotalMs: p95, gateMs: 16.7,
    realGpu, cleanPool, pass: p95 <= 16.7 && realGpu && cleanPool && renderErrors.length === 0,
    phases, measured, renderErrors,
    note: "total = CPU + chờ GPU qua readPixels; không phải rAF. Width là bao mesh, cần xem alpha trong ảnh. Clip chưa có âm." };
  writeFileSync(join(out, "434b-stress.json"), JSON.stringify(result, null, 2));
  return { out, p95TotalMs: p95, realGpu, cleanPool, pass: result.pass, renderErrors };
}
