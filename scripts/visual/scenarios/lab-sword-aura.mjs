// The flying swords' aura (docs/games/tu-tien/skills/SWORD_AURA.md, direction A + C's tip star) on the dev-only skills
// lab, fixed 60 Hz clock, DPR 1. PNGs go to OUT_DIR/raw-<PHASE>/<id>-<frame>.png, numbers to OUT_DIR/aura-<PHASE>.json.
//   BASE=http://127.0.0.1:3111/skills-lab.html PHASE=metal-a ELEMENT=metal AURA=a [QS="&plates=graded"] [GROUND=#d6d0c2] \
//   [PLAN=dev|owner|solo|gates|hz|smooth] [ONLY=k1,k7] [LAYERS=TipStar:0] [SPLIT=mantle,star,silk,halo,all] OUT_DIR=tmp/shots/sword-aura \
//   ../../.local/bin/heavy.sh --gpu node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-sword-aura.mjs --width=1920 --height=1080
// PLAN=dev (default): key 1 typed at the close zoom (waiting at the shoulders, release, flight, hit), key 1 at the play
// camera, key 7 at the play camera and close on its field. PLAN=owner: the frames of the owner's sheet (§5.5: key 7 F90,
// F140, the gather F180, a key-1 flight; play and close). PLAN=solo: __lab.auraSolo(), one sword's 6 s flight at a fixed
// clock, close (the owner's video scene 1).
// PLAN=gates (§6): key 7 F60–F160 and its gather and finisher, key 1's waiting, release and flight, the solo at the play
// camera; per frame, without time passing: <f>-on.png, <f>-off.png (the aura hidden: auraShow all), the same two with
// the bloom at 0 (-onnb, -offnb), the swords' geometric mask (-mask.png, aura-gates.ts), the bloom buffer's bright share
// on and off, and the aura parts' overlap (auraParts). tmp/shots/sword-aura/tools/gates.py reads them.
// PLAN=hz: the solo at t = 2.5 s reached in 60 Hz steps and in 120 Hz steps (same page, reset between): -60.png, -120.png.
// PLAN=smooth: the solo every frame through its release (F55–F80) and its hit (F205–F225), on and off.
// Compare only runs of the same plan (the lab's clocks carry over from one item to the next).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);

/** id, lab slot, camera ("play", "zoom", "close:x,z,d"), typed (the word typed at 45 WPM first), frames after the key. */
const DEV = [
  ["k1t", "k1", "zoom", true, [26, 42, 58, 64, 66, 67, 68, 70, 74]],
  ["k1", "k1", "play", false, [2, 4, 6, 8, 20]],
  ["k7", "k7", "play", false, [10, 40, 90, 150, 180, 194]],
  ["k7c", "k7", "close:-4,-7,13", false, [40, 90, 150, 180]],
];
const OWNER = [
  ["k1t", "k1", "zoom", true, [42, 58, 66, 68]],
  ["k1", "k1", "play", false, [3, 6]],
  ["k1c", "k1", "close:-0.3,-5.6,10", false, [3, 5, 8]],
  ["k7", "k7", "play", false, [90, 140, 180, 194]],
  ["k7c", "k7", "close:-4,-7,13", false, [90, 140, 180]],
];
const SOLO = [["solo", "solo", "close:0,-1.9,16", false, range(10, 340, 30)]];
const GATES = [
  ["k7", "k7", "play", false, [60, 80, 100, 120, 140, 160, 172, 184, 194, 207]],
  ["k1t", "k1", "zoom", true, [42, 58, 67]],
  ["k1", "k1", "play", false, [2, 4]],
  ["solop", "solo", "play", false, [40, 100, 160, 205, 280]],
  ["soloc", "solo", "close:0,-1.9,16", false, [100, 160, 211]],
];
const SMOOTH = [["solo", "solo", "close:0,-1.9,16", false, [...range(55, 80), ...range(205, 225)]]];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3111/skills-lab.html";
  const phase = process.env.PHASE ?? "aura";
  const element = process.env.ELEMENT ?? "metal";
  const aura = process.env.AURA ?? "a";
  const qs = process.env.QS ?? "";
  const ground = process.env.GROUND ? `&ground=${encodeURIComponent(process.env.GROUND)}` : "";
  const root = resolve(process.env.OUT_DIR ?? "tmp/shots/sword-aura");
  const out = join(root, `raw-${phase}`);
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  const planName = process.env.PLAN ?? "dev";
  const plan = { owner: OWNER, solo: SOLO, gates: GATES, smooth: SMOOTH, hz: [["solo", "solo", "close:0,-1.9,16", false, [150]]] }[planName] ?? DEV;
  const gates = planName === "gates";
  const split = planName === "smooth" ? ["all"] : (process.env.SPLIT ?? "").split(",").filter(Boolean);
  mkdirSync(out, { recursive: true });
  const shots = [];
  let loaded = "";
  const open = async (typed) => {
    const url = `${base}?fixed=1&ui=0&dpr=1&probe=0&weapon=clear-wind&cutin=0.9&element=${element}&aura=${aura}${ground}${qs}${typed ? "&typed=1" : ""}`;
    if (url === loaded) return;
    await page.goto(url, { settle: 1500 });
    for (let i = 0; i < 240; i += 1) {
      if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
      await sleep(250);
    }
    // Textures and atlases load after `ready`: wait, then draw.
    await sleep(2500);
    loaded = url;
  };
  const begin = async (slot, cam) => {
    await page.eval("window.__lab.reset()");
    // LAYERS="TipStar:0,MantleSheath:0.5": a layer off or at an intensity (the judges score each layer alone).
    for (const spec of (process.env.LAYERS ?? "").split(",").filter(Boolean)) {
      const [name, k] = spec.split(":");
      await page.eval(`window.__lab.auraLayer(${JSON.stringify(name)}, ${Number(k) > 0}, ${Number(k)})`);
    }
    await page.eval("window.__lab.camera('play')");
    if (cam === "zoom") await page.eval("window.__lab.zoom(1)");
    if (cam.startsWith("close:")) {
      const [x, z, d] = cam.slice(6).split(",").map(Number);
      await page.eval(`window.__lab.camera('close', ${x}, ${z}, ${d})`);
    }
    await page.eval("window.__lab.step(40)");
    const r = slot === "solo" ? await page.eval("window.__lab.auraSolo()") : await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
    if (r && r.evalError) throw new Error(r.evalError);
  };
  for (const [id, slot, cam, typed, frames] of plan) {
    if (only && !only.includes(id)) continue;
    await open(typed);
    if (planName === "hz") {
      // The same moment (2.5 s into the solo) reached at 60 Hz and at 120 Hz: the aura must look the same.
      for (const [hz, dt, n] of [[60, 1 / 60, 150], [120, 1 / 120, 300]]) {
        await begin(slot, cam);
        await page.eval(`window.__lab.step(${n}, ${dt})`);
        const file = join(out, `${id}-${hz}.png`);
        await page.shot(file);
        shots.push({ id, hz, file });
      }
      continue;
    }
    await begin(slot, cam);
    let at = 0;
    for (const f of frames) {
      if (f > at) await page.eval(`window.__lab.step(${f - at})`);
      at = Math.max(at, f);
      const name = `${id}-${String(f).padStart(3, "0")}`;
      const file = join(out, gates ? `${name}-on.png` : `${name}.png`);
      const bright = await page.eval("window.__lab.bright()");
      await page.shot(file);
      const row = { id, slot, cam, typed, frame: f, file, aura: await page.eval("window.__lab.auraInfo()"), bright: { pixels: bright.pixels, share: bright.share, max: bright.max, nonFinite: bright.nonFinite } };
      // SPLIT=mantle,silk: the same frame (no time passes) with that part hidden, then everything back: <id>-<f>-no<part>.png.
      for (const part of split) {
        await page.eval(`window.__lab.auraShow(${JSON.stringify(part)}, false)`);
        await page.shot(file.replace(/\.png$/, `-no${part}.png`));
        await page.eval(`window.__lab.auraShow(${JSON.stringify(part)}, true)`);
      }
      if (gates) {
        await page.eval("window.__lab.auraShow('all', false)");
        const brightOff = await page.eval("window.__lab.bright()");
        await page.shot(join(out, `${name}-off.png`));
        await page.eval("window.__lab.post({ bloom: 0 })");
        await page.shot(join(out, `${name}-offnb.png`));
        await page.eval("window.__lab.auraShow('all', true)");
        await page.shot(join(out, `${name}-onnb.png`));
        await page.eval("window.__lab.post({})");
        await page.eval("window.__lab.swordMask(true)");
        await page.shot(join(out, `${name}-mask.png`));
        await page.eval("window.__lab.swordMask(false)");
        row.brightOff = { pixels: brightOff.pixels, share: brightOff.share, max: brightOff.max, nonFinite: brightOff.nonFinite };
        row.parts = await page.eval("window.__lab.auraParts()");
      }
      shots.push(row);
    }
  }
  const report = { phase, plan: planName, element, aura, qs, ground: process.env.GROUND ?? "default", shots };
  writeFileSync(join(root, `aura-${phase}.json`), JSON.stringify(report, null, 1));
  return { phase, shots: shots.length, out };
}
