// Power pass round 3a (03/11/2026, the VFX art-direction reset, step one) on the dev-only skills lab, fixed 60 Hz
// clock, play camera, DPR 1. MODE picks the run:
//   chain   (P0) the post chain: __lab.pipeline(), and for idle, key 7's hunt, its climax frames and K5's climax the
//           same frame drawn five ways (the game's chain; bloom 0; no screen pass; linear instead of Neutral; no fog)
//           with __lab.hdr() (the linear HDR buffer as it enters the bloom: histogram, sword cores). PNGs + JSON.
//   frames  before / after frames of K0 (Phi Kiếm), K1, key 7 and K5 at the play camera (PHASE names the folder),
//           with key 7's hunt again at bloom 0 (P3's gate) and the climax frames for the grayscale gate (P2).
//   numbers (P7) every frame of a stress run (key 7, K5 and basic blows together): live numbers, headline count.
//   victims (P6) hero, secondary and background victims per cast and their screen displacement.
// Output: OUT_DIR/raw-<PHASE>/… and OUT_DIR/<mode>-<PHASE>.json. Montage and prune the raw folder afterwards.
//   BASE=http://127.0.0.1:3024/skills-lab.html MODE=chain PHASE=before OUT_DIR=tmp/shots/power-r3a \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power-r3a.mjs --width=1920 --height=1080
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Frames after the key, with labels (K5: its cut-in runs first, ~55 frames, then the release). */
const FRAMES = {
  auto: [[1, "release"], [4, "F4"], [10, "F10-flight"], [16, "F16"], [18, "F18-hit"], [19, "F19"], [20, "F20"], [26, "F26"], [40, "F40-after"]],
  k1: [[1, "release"], [5, "F5"], [6, "F6-hit1"], [7, "F7"], [8, "F8"], [20, "F20"], [36, "F36-hit2"], [37, "F37"], [66, "F66-hit3"], [67, "F67"], [90, "F90-after"]],
  k7: [[1, "F1"], [8, "F8-volley"], [15, "F15-lead-hit"], [30, "F30"], [45, "F45-hunt"], [90, "F90-hunt"], [140, "F140-hunt"], [172, "F172-gather"], [186, "F186-stroke"]],
  k5: [[1, "cutin"], [56, "fire"], [86, "wave1"], [131, "wave2"]],
};
/**
 * Hit-stops slow each cast's clock, so a climax lands some frames after its nominal tick: the run steps one frame at
 * a time until the climax's first frame (the round-2 flash at ≥ 0.3, or round 3a's graphic impact frame 0), then
 * shoots these frames after it.
 */
const CLIMAX = { k7: [[-1, "C-1"], [0, "C0"], [1, "C+1"], [2, "C+2"], [3, "C+3"], [8, "C+8-fold"], [24, "C+24-after"], [54, "C+54-scars"], [100, "C+100-late"]], k5: [[-1, "C-1"], [0, "C0"], [1, "C+1"], [2, "C+2"], [3, "C+3"], [8, "C+8"], [33, "C+33-after"], [84, "C+84-late"]] };
const AT_CLIMAX = "(() => { const s = window.__lab.screen(); return (s.flash ?? 0) >= 0.3 || s.impactStep === 0; })()";

/** Steps one frame at a time (at most `limit`) until the climax's first frame; returns the frames stepped, −1 if none. */
async function toClimax(page, limit = 160) {
  for (let i = 0; i < limit; i += 1) {
    await page.eval("window.__lab.step(1)");
    if (await page.eval(AT_CLIMAX)) return i + 1;
  }
  return -1;
}
/** Key 7's frames shot again at bloom 0 (P3's gate: the swords read without bloom). */
const BLOOM_OFF = { k7: [45, 90, 140, 186] };
/** The chain run's states: [skill, frames after the key, label]. */
const CHAIN = [
  ["idle", 0, "idle"],
  ["k7", 90, "k7-F90-hunt"],
  ["k7", -1, "k7-C0-climax"],
  ["k7", -2, "k7-C+1"],
  ["k5", -1, "k5-C0-climax"],
];
const VARIANTS = [
  ["game", {}],
  ["bloom0", { bloom: 0 }],
  ["noscreen", { screen: false }],
  ["linear", { tone: "linear" }],
  ["nofog", { fog: false }],
];

async function open(page, base, extra = "") {
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind${extra}`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) return;
    await sleep(250);
  }
  throw new Error("lab not ready");
}

async function fresh(page) {
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.camera('play')");
  await page.eval("window.__lab.step(40)");
}

async function check(r) {
  if (r && r.evalError) throw new Error(r.evalError);
  return r;
}

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3024/skills-lab.html";
  const mode = process.env.MODE ?? "frames";
  const phase = process.env.PHASE ?? "after";
  const outRoot = resolve(process.env.OUT_DIR ?? "tmp/shots/power-r3a");
  const out = join(outRoot, `raw-${phase}`);
  mkdirSync(out, { recursive: true });
  await open(page, base);
  const report = { mode, phase };

  if (mode === "chain") {
    report.pipeline = await check(await page.eval("window.__lab.pipeline()"));
    report.states = [];
    for (const [skill, f, label] of CHAIN) {
      await fresh(page);
      if (skill !== "idle") {
        await check(await page.eval(`window.__lab.type(${JSON.stringify(skill)})`));
        if (f > 0) await page.eval(`window.__lab.step(${f})`);
        else {
          await page.eval(`window.__lab.step(${skill === "k7" ? 150 : 140})`);
          if ((await toClimax(page)) < 0) throw new Error("no climax: " + skill);
          if (f === -2) await page.eval("window.__lab.step(1)");
        }
      }
      const row = { label, screen: await page.eval("window.__lab.screen()"), shots: {}, hdr: null };
      row.hdr = await check(await page.eval("window.__lab.hdr()"));
      for (const [name, opts] of VARIANTS) {
        await check(await page.eval(`window.__lab.post(${JSON.stringify(opts)})`));
        const file = join(out, `chain-${label}-${name}.png`);
        await page.shot(file);
        row.shots[name] = file;
      }
      await page.eval("window.__lab.post({})");
      report.states.push(row);
    }
  } else if (mode === "frames") {
    const skills = (process.env.SKILLS ?? "auto,k1,k7,k5").split(",");
    report.taken = 0;
    report.state = {};
    for (const skill of skills) {
      await fresh(page);
      await check(await page.eval(`window.__lab.type(${JSON.stringify(skill)})`));
      let since = 0;
      let n = 0;
      const rows = [];
      for (const [f, label] of FRAMES[skill]) {
        if (f > since) await page.eval(`window.__lab.step(${f - since})`);
        since = Math.max(since, f);
        const name = `${skill}-${String(n++).padStart(2, "0")}-${label}`;
        await page.shot(join(out, name + ".png"));
        report.taken += 1;
        rows.push({ f, label, screen: await page.eval("window.__lab.screen()"), numbers: await page.eval("window.__lab.numbers()") });
        if ((BLOOM_OFF[skill] ?? []).includes(f)) {
          await check(await page.eval("window.__lab.post({ bloom: 0 })"));
          await page.shot(join(out, name + "-bloom0.png"));
          await page.eval("window.__lab.post({})");
          report.taken += 1;
        }
      }
      const cl = CLIMAX[skill];
      if (cl) {
        // One frame before the climax is kept from the search: shoot C-1 on the way.
        await page.eval(`window.__lab.step(${Math.max(0, (skill === "k7" ? 150 : 140) - since)})`);
        let c = -1;
        let prev = null;
        for (let i = 0; i < 160 && c < 0; i += 1) {
          const tmp = join(out, `${skill}-climax-search.png`);
          await page.shot(tmp);
          prev = tmp;
          await page.eval("window.__lab.step(1)");
          if (await page.eval(AT_CLIMAX)) c = i;
        }
        if (c < 0) throw new Error("no climax: " + skill);
        let at = 0;
        for (const [d, label] of cl) {
          const name = `${skill}-${String(n++).padStart(2, "0")}-${label}`;
          if (d < 0) {
            const { renameSync } = await import("node:fs");
            renameSync(prev, join(out, name + ".png"));
          } else {
            if (d > at) await page.eval(`window.__lab.step(${d - at})`);
            at = Math.max(at, d);
            await page.shot(join(out, name + ".png"));
          }
          report.taken += 1;
          rows.push({ climax: d, label, screen: await page.eval("window.__lab.screen()"), numbers: await page.eval("window.__lab.numbers()") });
        }
      }
      report.state[skill] = rows;
    }
  } else if (mode === "numbers") {
    // A stress run: key 7, then K5 on top of it, basic blows and slot 1 every few frames; numbers live per frame.
    await fresh(page);
    const seen = [];
    let maxLive = 0;
    await page.eval("window.__lab.type('k7')");
    for (let f = 0; f < 520; f += 1) {
      if (f === 60) await page.eval("window.__lab.cast('k1', 0, -8)");
      if (f % 23 === 0) await page.eval("window.__lab.cast('auto', 0, -8)");
      if (f === 250) await page.eval("window.__lab.type('k5')");
      await page.eval("window.__lab.step(1)");
      const nb = await check(await page.eval("window.__lab.numbers()"));
      maxLive = Math.max(maxLive, nb.live);
      seen.push(nb.live);
    }
    report.maxLive = maxLive;
    report.perFrame = seen;
    report.final = await page.eval("window.__lab.numbers()");
  } else if (mode === "victims") {
    report.casts = {};
    for (const skill of (process.env.SKILLS ?? "k7,k5").split(",")) {
      await fresh(page);
      await check(await page.eval(`window.__lab.type(${JSON.stringify(skill)})`));
      const frames = skill === "k5" ? 330 : 300;
      const samples = [];
      for (let f = 0; f < frames; f += 1) {
        await page.eval("window.__lab.step(1)");
        const v = await page.eval("window.__lab.victims ? window.__lab.victims() : null");
        if (v) samples.push(v);
      }
      report.casts[skill] = samples.length > 0 ? samples[samples.length - 1] : null;
    }
  }
  writeFileSync(join(outRoot, `${mode}-${phase}.json`), JSON.stringify(report, null, 1));
  return { mode, phase, out, taken: report.taken ?? null };
}
