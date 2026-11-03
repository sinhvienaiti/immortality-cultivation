// Real swords in every skill (03/11/2026, owner: the skill swords must be our approved Clear Wind, not code-styled):
// frames of each skill on the dev-only skills lab, fixed 60 Hz clock, DPR 1, at the play camera, the player's close
// zoom (__lab.zoom(1)) or a close camera on the skill's own zone, for the before / after sheets of
// docs/changelog/2026-11-03-lab-real-swords.md. PNGs go to OUT_DIR/raw-<PHASE>/<id>-<frame>.png and the shot list
// (frame, camera, blade sizes on screen) to OUT_DIR/shots-<PHASE>.json; montage them, then prune the raw folder.
//   BASE=http://127.0.0.1:3046/skills-lab.html PHASE=after OUT_DIR=tmp/shots/real-swords \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-real-swords.mjs --width=1920 --height=1080
// ONLY=k7,k5c limits the plan to those ids.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** id, lab slot, camera ("play", "zoom", or "close:x,z,distance"), frames after the key. */
const PLAN = [
  ["k0", "auto", "zoom", [6, 12]],
  ["k1", "k1", "zoom", [2, 8, 30]],
  ["k2", "k2", "zoom", [6, 12]],
  ["guard", "guard", "zoom", [20, 50]],
  ["k4", "k4", "close:-5,-7,13", [10, 40]],
  ["k5", "k5", "play", [90, 110, 140, 175]],
  ["k5c", "k5", "close:0,-9,20", [100, 125, 140, 200]],
  ["k7", "k7", "play", [40, 90, 186, 194]],
  ["k7c", "k7", "close:-4,-7,13", [40, 90, 150]],
];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3046/skills-lab.html";
  const phase = process.env.PHASE ?? "after";
  const root = resolve(process.env.OUT_DIR ?? "tmp/shots/real-swords");
  const out = join(root, `raw-${phase}`);
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  mkdirSync(out, { recursive: true });
  // cutin=0.9: the K5 frame tables were timed on the 0.9 s cut-in; the lab's default is 1.7 s since 03/11 (style C).
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind&cutin=0.9`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  const shots = [];
  for (const [id, slot, cam, frames] of PLAN) {
    if (only && !only.includes(id)) continue;
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    if (cam === "zoom") await page.eval("window.__lab.zoom(1)");
    else if (cam.startsWith("close:")) {
      const [x, z, d] = cam.slice(6).split(",").map(Number);
      await page.eval(`window.__lab.camera('close', ${x}, ${z}, ${d})`);
    }
    await page.eval("window.__lab.step(40)");
    const r = await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
    if (r && r.evalError) throw new Error(r.evalError);
    let at = 0;
    for (const f of frames) {
      if (f > at) await page.eval(`window.__lab.step(${f - at})`);
      at = Math.max(at, f);
      const file = join(out, `${id}-${String(f).padStart(3, "0")}.png`);
      await page.shot(file);
      shots.push({ id, slot, cam, frame: f, file, bladePx: await page.eval("window.__lab.bladePx()") });
    }
  }
  writeFileSync(join(root, `shots-${phase}.json`), JSON.stringify(shots, null, 1));
  return { phase, shots: shots.length, out };
}
