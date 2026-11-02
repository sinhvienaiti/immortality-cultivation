// Re-cast and overlap run of the skills lab VFX (MOTION_PLAN step 3 review, 02/11/2026): the paths
// lab-motion.mjs never takes. Guard blocks (spring parry, early close), Phi Kiếm four times 0.15 s apart,
// casts with no word typed (__lab.cast: K2 twice, K5 after a typed K5, dash twice, K4 twice) and typed
// re-casts while the last cast still runs (guard, K4, K5, K2; the lab has no cooldowns). Writes
// OUT/metrics.json (the motion probe) and returns the fair pop and blade counts (all 0 is the gate).
//   OUT=tmp/shots/motion/stress node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-stress.mjs --width=1280 --height=720
// Env: URL (add &q=low|ultra), HZ (60; 120 steps at 1/120 s), OUT, SHOTS (probe frames to capture, comma list:
// follow and play JPEGs into OUT; delete them once looked at).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function (page) {
  const url = process.env.URL ?? "http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0";
  const hz = Number(process.env.HZ ?? "60");
  const dt = 1 / hz;
  const out = resolve(process.env.OUT ?? "tmp/shots/motion/review-stress");
  const shots = (process.env.SHOTS ?? "").split(",").filter(Boolean).map(Number);
  mkdirSync(out, { recursive: true });
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 160; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await page.eval("window.__lab.setWpm(45)");
  await page.eval("window.__lab.camera('play')");
  await page.eval("window.__lab.reset()");
  let f = 0;
  const step = async (s) => {
    const n = Math.round(s * hz);
    for (let i = 0; i < n; i += 1) {
      const r = await page.eval(`window.__lab.tick(${dt})`);
      f = r[0];
      if (shots.includes(f)) {
        await page.eval("window.__lab.view('follow', 6)");
        const r2 = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
        writeFileSync(join(out, `follow-${String(f).padStart(5, "0")}.jpg`), Buffer.from(r2.data, "base64"));
        await page.eval("window.__lab.view('play')");
        const r3 = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
        writeFileSync(join(out, `play-${String(f).padStart(5, "0")}.jpg`), Buffer.from(r3.data, "base64"));
      }
    }
  };
  const until = async (cond, max) => {
    for (let i = 0; i < Math.round(max * hz) && (await page.eval(cond)); i += 1) await step(dt);
  };
  const mark = (l) => page.eval(`window.__lab.mark(${JSON.stringify(l)})`);
  await step(0.5);
  // 1. Guard typed, three blows parried (spring, break), the barrier closes early, a fourth blow lands.
  await mark("guard-blocks");
  await page.eval("window.__lab.type('guard')");
  await until("window.__lab.typing()", 5);
  await step(0.4);
  for (let s = 0; s < 4; s += 1) {
    await page.eval("window.__lab.enemyShot()");
    await until("window.__lab.boltActive()", 3);
    await step(0.15);
  }
  await step(1.0);
  // 2. Auto spam: four basic attacks 0.15 s apart.
  await mark("auto-spam");
  for (let s = 0; s < 4; s += 1) {
    await page.eval("window.__lab.type('auto')");
    await step(0.15);
  }
  await step(1.2);
  // 3. K2 by button twice, 0.55 s apart (the second lands while the first blade fades).
  await mark("k2-twice");
  await page.eval("window.__lab.cast('k2', 0, -8)");
  await step(0.55);
  await page.eval("window.__lab.cast('k2', 0, -8)");
  await step(1.8);
  // 4. K5 typed, then K5 by button (no word) once it ends.
  await mark("k5-typed");
  await page.eval("window.__lab.type('k5')");
  await until("window.__lab.typing()", 6);
  await step(3.6);
  await mark("k5-button");
  await page.eval("window.__lab.cast('k5', 0, -8)");
  await step(3.6);
  // 5. Dash twice, the second mid-dash; K4 twice, the second while the first holds.
  await mark("dash-twice");
  await page.eval("window.__lab.cast('dash', 4, 3)");
  await step(0.1);
  await page.eval("window.__lab.cast('dash', -4, 3)");
  await step(1.3);
  await mark("k4-twice");
  await page.eval("window.__lab.cast('k4', 0, -8)");
  await step(1.0);
  await page.eval("window.__lab.cast('k4', 3, -8)");
  await step(6.2);
  // 6. K1 typed, an auto during its flights.
  await mark("k1-auto");
  await page.eval("window.__lab.type('k1')");
  await until("window.__lab.typing()", 5);
  await step(0.3);
  await page.eval("window.__lab.type('auto')");
  await step(2.0);
  // 7. Typed re-casts while the effect still runs (the lab has no cooldowns): guard, K4, K5, K2.
  for (const slot of ["guard", "k4", "k5", "k2"]) {
    await mark(slot + "-retyped");
    await page.eval(`window.__lab.type('${slot}')`);
    await until("window.__lab.typing()", 6);
    await step(0.2);
    await page.eval(`window.__lab.type('${slot}')`);
    await until("window.__lab.typing()", 6);
    await step(slot === "k4" ? 6.5 : slot === "guard" ? 5.6 : 3.8);
  }
  await mark("end");
  await step(1.0);
  const m = await page.eval("window.__lab.metrics()");
  writeFileSync(join(out, "metrics.json"), JSON.stringify(m));
  const v = m.summary.vfx;
  const ev = m.events.filter((e) => e.kind === "phase").map((e) => [e.f, e.detail]);
  return { frames: f, fair: { on: v.fair.layerPopsOn, off: v.fair.layerPopsOff, flash: v.fair.flashOn }, byLayer: Object.fromEntries(Object.entries(v.fair.byLayer).filter(([, x]) => x.on || x.off)), blades: v.blades, phases: ev, rows: m.fairPops.filter((r) => r.kind !== "flash-on").slice(0, 60), bladePops: (m.pops || []).filter((p) => ["blade-on","blade-off","blade-size","blade-snap","blade-jump"].includes(p.kind) || /blade/.test(p.layer)).slice(0, 40) };
}
