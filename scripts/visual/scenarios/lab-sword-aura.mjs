// The flying swords' aura (docs/games/tu-tien/skills/SWORD_AURA.md, direction A + C's tip star) on the dev-only skills
// lab, fixed 60 Hz clock, DPR 1. PNGs go to OUT_DIR/raw-<PHASE>/<id>-<frame>.png, numbers to OUT_DIR/aura-<PHASE>.json.
//   BASE=http://127.0.0.1:3111/skills-lab.html PHASE=metal-a ELEMENT=metal AURA=a [QS="&plates=graded"] [GROUND=#d6d0c2] \
//   [PLAN=dev|owner|solo] [ONLY=k1,k7] OUT_DIR=tmp/shots/sword-aura \
//   ../../.local/bin/heavy.sh --gpu node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-sword-aura.mjs --width=1920 --height=1080
// PLAN=dev (default): key 1 typed at the close zoom (waiting at the shoulders, release, flight, hit), key 1 at the play
// camera, key 7 at the play camera and close on its field. PLAN=owner: the frames of the owner's sheet (§5.5: key 7 F90,
// F140, the gather F180, a key-1 flight; play and close). PLAN=solo: __lab.auraSolo(), one sword's 6 s flight at a fixed
// clock, close and turning (the owner's video scene 1). Compare only runs of the same plan (the lab's clocks carry over).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const SOLO = [["solo", "solo", "close:0,-1.9,16", false, [10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340]]];

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
  const plan = process.env.PLAN === "owner" ? OWNER : process.env.PLAN === "solo" ? SOLO : DEV;
  mkdirSync(out, { recursive: true });
  const shots = [];
  let loaded = "";
  for (const [id, slot, cam, typed, frames] of plan) {
    if (only && !only.includes(id)) continue;
    const url = `${base}?fixed=1&ui=0&dpr=1&probe=0&weapon=clear-wind&cutin=0.9&element=${element}&aura=${aura}${ground}${qs}${typed ? "&typed=1" : ""}`;
    if (url !== loaded) {
      await page.goto(url, { settle: 1500 });
      for (let i = 0; i < 240; i += 1) {
        if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
        await sleep(250);
      }
      // Textures and atlases load after `ready`: wait, then draw.
      await sleep(2500);
      loaded = url;
    }
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
    let at = 0;
    for (const f of frames) {
      if (f > at) await page.eval(`window.__lab.step(${f - at})`);
      at = Math.max(at, f);
      const file = join(out, `${id}-${String(f).padStart(3, "0")}.png`);
      await page.shot(file);
      const bright = await page.eval("window.__lab.bright()");
      // SPLIT=mantle,silk: the same frame (no time passes) with that part hidden, then everything back: <id>-<f>-no<part>.png.
      for (const part of (process.env.SPLIT ?? "").split(",").filter(Boolean)) {
        await page.eval(`window.__lab.auraShow(${JSON.stringify(part)}, false)`);
        await page.shot(file.replace(/\.png$/, `-no${part}.png`));
        await page.eval(`window.__lab.auraShow(${JSON.stringify(part)}, true)`);
      }
      shots.push({ id, slot, cam, typed, frame: f, file, aura: await page.eval("window.__lab.auraInfo()"), bright: { pixels: bright.pixels, share: bright.share, max: bright.max, nonFinite: bright.nonFinite } });
    }
  }
  const report = { phase, element, aura, qs, ground: process.env.GROUND ?? "default", shots };
  writeFileSync(join(root, `aura-${phase}.json`), JSON.stringify(report, null, 1));
  return { phase, shots: shots.length, out };
}
