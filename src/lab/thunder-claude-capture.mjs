/** Claude's by-eye loop for the Thunder ult and the shared cloud. MODE=thunder|cloud|perf|video, OUT=<folder>. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export default async function (page) {
  const out = process.env.OUT, mode = process.env.MODE || "thunder", base = process.env.BASE || "http://localhost:3148/stress.html";
  mkdirSync(out, { recursive: true });
  const ev = async code => { const r = await page.eval(code); if (r?.evalError) throw new Error(r.evalError); return r; };
  const wait = async code => { for (let i = 0; i < 240; i++) { if (await ev(code)) return; await page.sleep(250); } throw new Error("not ready: " + code); };
  const hideDom = () => ev(`(() => { for (const e of document.body.querySelectorAll('*')) {
    if (e.tagName === 'CANVAS' || e.querySelector('canvas')) continue;
    const s = getComputedStyle(e); if (/fixed|absolute/.test(s.position) && e.closest('body') && !e.closest('[data-keep]')) e.style.visibility = 'hidden'; } return true; })()`);
  if (mode === "cloud") {
    for (const kind of (process.env.KINDS || "thunder,poison,dark").split(",")) {
      const url = new URL(base); url.search = "fixed=1&ui=0&dpr=1&herd=march&cloud=" + kind;
      await page.goto(url.href, { settle: 1500 });
      await wait("!!(window.__lab?.ready && window.__stress?.ready && window.__cloud438)");
      await page.key("q", { code: "KeyQ" }); await ev("window.__lab.step(90); true"); await hideDom();
      for (const [label, key] of [["play", "0"], ["top", "1"], ["behind", "2"]]) {
        await page.key(key, { code: "Digit" + key }); await ev("window.__lab.step(30); true"); await hideDom();
        await page.shot(join(out, `cloud-${kind}-${label}.png`));
      }
    }
    return { out };
  }
  const url = new URL(base);
  for (const [k, v] of Object.entries({ fixed: "1", ui: "0", dpr: "1", q: "high", herd: "march" })) url.searchParams.set(k, v);
  await page.goto(url.href, { settle: 1500 });
  await wait("window.__lab?.ready && window.__stress?.ready");
  await wait("window.__lab.thunderUlt().ready");
  const start = view => ev(`(() => { const l = window.__lab;
    l.view('play'); l.reset(); l.setHerd('march'); l.viewMode('top'); l.camera('play'); l.step(45);
    l.viewMode(${JSON.stringify(view === "behind" ? "behind" : "top")}); l.step(45);
    l.showcase('ult-thunder-nine-heavens-v2'); return true; })()`);
  const seek = time => ev(`(() => { const l = window.__lab;
    for (let i = 0; i < 1800 && l.thunderUlt().last.clock < ${time} - 1e-8; i++) l.step(1, Math.min(1/60, ${time} - l.thunderUlt().last.clock));
    return l.thunderUlt().last.clock; })()`);
  if (mode === "perf") {
    await start("play");
    const rows = await ev(`(() => { const rows = []; for (let i = 0; i < 240; i++) { const p = window.__lab.perf(1); rows.push(p.total[0]); } return rows; })()`);
    const s = [...rows].sort((a, b) => a - b), p95 = s[Math.ceil(s.length * 0.95) - 1];
    const gpu = await ev("window.__lab.perf(1).gpu");
    writeFileSync(join(out, "perf.json"), JSON.stringify({ p95, max: s.at(-1), median: s[120], gpu }, null, 2));
    return { p95, gpu };
  }
  if (mode === "video") {
    await start("play"); await hideDom();
    for (let f = 0; f < 120; f++) {
      await ev("window.__lab.step(1, 1/30); true");
      const shot = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
      writeFileSync(join(out, `f${String(f).padStart(4, "0")}.jpg`), Buffer.from(shot.data, "base64"));
    }
    return { out };
  }
  for (const view of (process.env.VIEWS || "play,behind").split(",")) {
    await start(view); await hideDom();
    for (const time of [0.4, 1.2, 2.2, 3.0]) {
      await seek(time); await hideDom();
      await page.shot(join(out, `${view}-${time.toFixed(1)}s.png`));
    }
  }
  return { out };
}
