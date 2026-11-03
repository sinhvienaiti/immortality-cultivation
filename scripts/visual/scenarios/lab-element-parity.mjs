// Element layer parity (canon D59, 03/11/2026): frames of key 1 (Threefold Sword Command), key 7 (Myriad Swords) and
// K5 (Milky-Way Sword Rain, key 6) on the dev-only skills lab, fixed 60 Hz clock, DPR 1, at the play camera (key 1 also
// at the player's close zoom), so two builds or two elements can be compared frame by frame (Metal before and after
// the element layer: the pixel difference must be near zero). PNGs go to OUT_DIR/raw-<PHASE>/<id>-<frame>.png.
//   BASE=http://127.0.0.1:3061/skills-lab.html PHASE=before OUT_DIR=tmp/shots/element-fire [ELEMENT=metal] \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-element-parity.mjs --width=1920 --height=1080
// ONLY=k1,k7 limits the plan to those ids; ELEMENT adds ?element= (absent: the lab's default). Compare only runs of the
// same plan: the lab's clocks (caster, herd) carry over from one plan item to the next, so ONLY changes later frames.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** id, lab slot, camera ("play" or "zoom"), frames after the key. */
const PLAN = [
  ["k1", "k1", "play", [2, 8, 20, 40, 70]],
  ["k1z", "k1", "zoom", [2, 8, 40]],
  ["k7", "k7", "play", [10, 40, 90, 150, 186, 194, 205]],
  // K5's cut-in holds 0.9 s (54 frames) here; the release comes after it.
  ["k5", "k5", "play", [70, 90, 110, 140, 175, 230]],
];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3061/skills-lab.html";
  const phase = process.env.PHASE ?? "after";
  const element = process.env.ELEMENT ? `&element=${process.env.ELEMENT}` : "";
  const root = resolve(process.env.OUT_DIR ?? "tmp/shots/element-fire");
  const out = join(root, `raw-${phase}`);
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  mkdirSync(out, { recursive: true });
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&probe=0&weapon=clear-wind&cutin=0.9${element}`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  // Textures load after `ready` (TextureLoader): wait, then draw a frame, so the first shot has them.
  await sleep(1500);
  const shots = [];
  for (const [id, slot, cam, frames] of PLAN) {
    if (only && !only.includes(id)) continue;
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    if (cam === "zoom") await page.eval("window.__lab.zoom(1)");
    await page.eval("window.__lab.step(40)");
    const r = await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
    if (r && r.evalError) throw new Error(r.evalError);
    let at = 0;
    for (const f of frames) {
      if (f > at) await page.eval(`window.__lab.step(${f - at})`);
      at = Math.max(at, f);
      const file = join(out, `${id}-${String(f).padStart(3, "0")}.png`);
      await page.shot(file);
      shots.push({ id, slot, cam, frame: f, file });
    }
  }
  const info = { weapon: await page.eval("window.__lab.weapon()"), element: await page.eval("typeof window.__lab.element === 'function' ? window.__lab.element() : 'none'") };
  writeFileSync(join(root, `shots-${phase}.json`), JSON.stringify({ info, shots }, null, 1));
  return { phase, info, shots: shots.length, out };
}
