// Power pass capture (canon D58, dev-only page /skills-lab.html?fixed=1&ui=0): frames of K1, K5 (with its
// cut-in) and key 7 (Vạn Kiếm Triều Tông) on the fixed 60 Hz clock, at the play camera and at __lab.zoom(1),
// for the before / after frame sheets of docs/changelog/2026-11-03-lab-power-pass.md. PNGs go to
// OUT_DIR/raw-<PHASE>/<skill>-<view>-NN-<label>.png (montage them into sheets, then prune the raw folder).
//   PHASE=after OUT_DIR=tmp/shots/power node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power.mjs --width=1920 --height=1080
// PHASE=before types each word at WPM (the lab before the power pass: release on the last letter);
// PHASE=after casts at once (instant cast, the default since the power pass). SKILLS (k1,k5,k7), VIEWS (play,zoom).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Frames after the release to shoot, with labels; `charge` (before only) as shares of the typed word. */
const PLAN = {
  before: {
    k1: { word: 5, charge: [0.9], after: [[0, "release"], [6, "impact1"], [8, "impact1+2"], [36, "impact2"], [66, "impact3"], [95, "aftermath"]] },
    k5: { word: 8, charge: [0.8], after: [[0, "release"], [10, "belts"], [30, "wave1"], [32, "wave1+2"], [75, "wave2"], [120, "wave3"], [150, "aftermath"]] },
  },
  after: {
    k1: { word: 0, after: [[0, "release"], [2, "release+2"], [6, "impact1"], [8, "impact1+2"], [36, "impact2"], [66, "impact3"], [95, "aftermath"]] },
    // The cut-in holds the world 0.9 s (54 frames, round 2; 1 s and 60 frames before) from the key; the skill fires
    // when it ends. "cleared" is a second after the last wave (the kills stay read: no respawn in the crater yet).
    k5: { word: 0, after: [[0, "cutin0"], [4, "cutin4"], [14, "cutin14"], [26, "cutin26"], [42, "cutin42"], [56, "fire"], [66, "belts"], [86, "wave1"], [88, "wave1+2"], [131, "wave2"], [176, "wave3"], [178, "wave3+2"], [209, "aftermath"], [270, "cleared"]] },
    k7: { word: 0, after: [[0, "F0"], [3, "F3-dark"], [10, "F10-seeds"], [24, "F24-river"], [45, "F45-hunt"], [90, "F90-hunt"], [140, "F140-hunt"], [172, "F172-climb"], [186, "F186-stroke"], [192, "F192-finisher"], [194, "F194"], [197, "F197"], [200, "F200-fold"], [215, "F215-after"], [245, "F245-scars"]] },
  },
};

export default async function (page) {
  const phase = process.env.PHASE ?? "after";
  const base = process.env.BASE ?? "http://127.0.0.1:3018/skills-lab.html";
  const url = process.env.URL ?? `${base}?fixed=1&ui=0&weapon=clear-wind${phase === "before" ? "" : ""}`;
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/power", "raw-" + phase);
  const skills = (process.env.SKILLS ?? (phase === "before" ? "k1,k5" : "k1,k5,k7")).split(",");
  const views = (process.env.VIEWS ?? "play,zoom").split(",");
  const wpm = 45;
  const fpl = Math.round(3600 / (wpm * 5));
  mkdirSync(out, { recursive: true });
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 160; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await page.eval(`window.__lab.setWpm(${wpm})`);
  if (phase === "latency") {
    // Key to release with a hit-stop running (the kit BlowQueue would hold a blow up to 70 ms in a stop): Nhất
    // Tuyến's finisher stops the world 30 ms; each key below lands on a frame of that stop. The probe reads the
    // VFX release (first flash, or key 7's blades leaving) and the body release (the clip's release mark).
    const rows = [];
    for (const slot of ["auto", "k1", "k2", "guard", "dash", "k4", "k7", "k5"]) {
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.step(20)");
      await page.eval("window.__lab.type('k2')");
      let stopping = false;
      for (let i = 0; i < 40 && !stopping; i += 1) {
        await page.eval("window.__lab.step(1)");
        stopping = (await page.eval("window.__lab.screen()")).stopping === true;
      }
      await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
      // K5: the cut-in (61 frames) runs first; its release is measured from the frame the cut-in ends.
      await page.eval(`window.__lab.step(${slot === "k5" ? 75 : 12})`);
      const m = await page.eval("window.__lab.metrics()");
      const rel = (m.releases ?? []).filter((r) => r.slot === slot).pop();
      rows.push({ slot, stopRunning: stopping, keyToVfxMs: rel?.keyToVfxMs ?? null, keyToBodyMs: rel?.keyToBodyMs ?? null, note: rel?.note ?? "" });
    }
    return { phase, rows, gateMs: 50 };
  }
  const taken = [];
  for (const view of views) {
    for (const skill of skills) {
      const plan = PLAN[phase]?.[skill];
      if (!plan) continue;
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.camera('play')");
      if (view === "zoom") await page.eval("window.__lab.zoom(1)");
      await page.eval("window.__lab.step(40)");
      let n = 0;
      const shot = async (label) => {
        const file = join(out, `${skill}-${view}-${String(n++).padStart(2, "0")}-${label}.png`);
        await page.shot(file);
        taken.push(file);
      };
      const r = await page.eval(`window.__lab.type(${JSON.stringify(skill)})`);
      if (r && r.evalError) throw new Error(r.evalError);
      let elapsed = 0;
      const total = plan.word > 0 ? 1 + (plan.word - 1) * fpl : 0;
      for (const p of plan.charge ?? []) {
        const f = Math.max(1, Math.round(total * p)) - elapsed;
        if (f > 0) await page.eval(`window.__lab.step(${f})`);
        elapsed += Math.max(0, f);
        await shot(`charge${Math.round(p * 100)}`);
      }
      // Typed: step to the last key's frame. Instant: the key fired outside a frame; one frame draws the release.
      const toRelease = plan.word > 0 ? Math.max(0, total - elapsed) : 1;
      if (toRelease > 0) await page.eval(`window.__lab.step(${toRelease})`);
      let since = 0;
      for (const [f, label] of plan.after) {
        if (f > since) await page.eval(`window.__lab.step(${f - since})`);
        since = Math.max(since, f);
        await shot(label);
      }
    }
  }
  return { phase, taken: taken.length, out };
}
