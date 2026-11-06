// Ticket 326. Run through cdp-run.mjs under heavy.sh --perf; all captures stay in the owner's review folder.
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const round = (n) => Math.round(n * 1000) / 1000;
function stats(d) {
  return { frames: d.length, mean: round(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)), p50: round(pct(d, 0.5)), p95: round(pct(d, 0.95)), p99: round(pct(d, 0.99)), max: round(Math.max(0, ...d)), over20: d.filter((n) => n > 20).length, over33: d.filter((n) => n > 33).length };
}

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3126/skills-lab.html";
  const out = resolve(process.env.OUT_DIR ?? "/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/hybrid-ab");
  const part = process.env.PART ?? "all";
  const scenes = (process.env.SCENES ?? "meteor,azure-cloud-dragon").split(",").filter(Boolean);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ABOUT.md"), "purpose: Demo và số đo A/B video hiện tại với flipbook lai của phiếu 326\nmade-by: codex 326\ndoc: docs/codex-queue/326-report.md\ndelete-when: Anh đã chọn cách đóng gói và Claude đã kiểm xong phiếu 326\n");
  const result = { part, base, width: page.width, height: page.height, dpr: page.dpr, transcoder: null, scenes: {}, warnings: [], exceptions: [] };
  const save = () => {
    result.warnings = [...page.logs]; result.exceptions = [...page.exceptions];
    writeFileSync(join(out, "hybrid-ab.json"), JSON.stringify(result, null, 2));
  };
  let first = true;
  async function open(scene, extra = {}) {
    const url = new URL(base);
    for (const [k, v] of Object.entries({ ab: scene, ui: "0", bar: "0", dpr: "1", element: "fire", ...extra })) url.searchParams.set(k, v);
    const fixed = url.searchParams.get("fixed") === "1";
    const logStart = page.logs.length;
    await page.goto(url.href);
    const until = Date.now() + 100_000;
    let ready = false;
    while (Date.now() < until) {
      if (await page.eval("!!window.__lab?.ready")) {
        if (fixed) await page.eval("window.__lab.step(1, 1/30)");
        const ab = await page.eval("window.__lab.ab()");
        if (ab?.error) throw new Error(ab.error);
        if (ab?.ready) { ready = true; break; }
      }
      await sleep(100);
    }
    if (!ready) throw new Error("A/B readiness timed out: " + url.href + " " + JSON.stringify(await page.eval("window.__lab?.ab()")));
    await page.eval("window.__lab.camera('play')");
    if (first) {
      first = false;
      const entries = await page.eval(`performance.getEntriesByType('resource').filter((r) => r.name.includes('basis_transcoder.') && !r.name.includes('?import')).map((r) => ({name:r.name, responseStatus:r.responseStatus}))`);
      result.transcoder = { entries, ok: entries.length === 2 && entries.every((r) => r.responseStatus === 200) };
      save();
    }
    return { url: url.href, state: await page.eval("window.__lab.ab()"), warnings: page.logs.slice(logStart) };
  }
  const measure = async () => page.eval(`new Promise((resolve) => {
    const d = []; let last = 0; const end = performance.now() + 8000;
    const f = (t) => { if(last) d.push(t-last); last=t; if(t<end) requestAnimationFrame(f); else resolve(d); }; requestAnimationFrame(f);
  })`);
  try {
    for (const scene of scenes) {
      const rows = result.scenes[scene] = {};
      if (part === "capture" || part === "all") {
        const opened = await open(scene, { fixed: "1", autostart: "0" });
        await page.eval("window.__lab.abStart(); window.__lab.step(60, 1/30); window.__lab.reset(); window.__lab.abStart()");
        const raw = mkdtempSync(join(out, scene + "-raw-"));
        let unsettled = 0;
        for (let f = 0; f < 240; f++) {
          await page.eval("window.__lab.step(1, 1/30)");
          if (!(await page.eval("window.__lab.abSettle()"))) unsettled++;
          await page.shot(join(raw, "f" + String(f).padStart(4, "0") + ".jpg"));
        }
        const mp4 = join(out, scene + "-ab.mp4");
        const sheet = join(out, scene + "-ab-sheet.jpg");
        await run("ffmpeg", ["-y", "-framerate", "30", "-i", join(raw, "f%04d.jpg"), "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
        await run("ffmpeg", ["-y", "-i", mp4, "-vf", "select='not(mod(n,40))',scale=640:-2,tile=3x2", "-frames:v", "1", sheet]);
        rmSync(raw, { recursive: true });
        rows.capture = { ...opened, frames: 240, fps: 30, seconds: 8, mp4, bytes: statSync(mp4).size, sheet, unsettled, final: await page.eval("window.__lab.ab()") };
        save();
      }
      if (part === "perf" || part === "all") {
        rows.perf = [];
        for (const only of [null, "left", "right"]) {
          const opened = await open(scene, { autostart: "0", ...(only ? { only } : {}) });
          await page.eval("window.__lab.abStart()"); await sleep(500);
          const d = await measure();
          rows.perf.push({ only, ...opened, ...stats(d), ab: await page.eval("window.__lab.ab()"), memory: await page.eval("window.__lab.memory()") });
          save();
        }
      }
      if (part === "hitch" || part === "all") {
        rows.hitch = [];
        for (const [only, prewarm] of [["right", "0"], ["right", "1"], ["left", "0"]]) {
          const opened = await open(scene, { only, prewarm, autostart: "0" });
          await page.eval(`(() => { window.__abRaf = {before:[], after:[], started:false, stop:false}; let last=0;
            const f = (t) => { const r=window.__abRaf; if(last) (r.started?r.after:r.before).push(t-last); last=t; if(!r.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
          await sleep(1000);
          await page.eval("window.__abRaf.started=true; window.__lab.abStart()");
          await sleep(1500);
          const d = await page.eval("window.__abRaf.stop=true; ({before:window.__abRaf.before,after:window.__abRaf.after})");
          rows.hitch.push({ only, prewarm: prewarm === "1", ...opened, before: stats(d.before), after: stats(d.after), ab: await page.eval("window.__lab.ab()") });
          save();
        }
      }
    }
  } catch (e) { result.error = String(e); save(); throw e; }
  save();
  return { out: join(out, "hybrid-ab.json"), scenes, transcoder: result.transcoder };
}
