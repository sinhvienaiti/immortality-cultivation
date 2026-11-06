// Word tags' contrast at each skill's peak (lab-readability, 06/11): the lab's stand-in tags (?tags=1, word-tags.ts)
// over the herd at the play camera, fixed steps. Per skill two JPEGs of the same instant: the field without the tags'
// DOM (scored by scripts/visual/tag-contrast.py: the plate composited over what is behind each tag) and with it (for
// the owner). Skills: every key 8 and 9 item at its first strike; key C (the channel) at a word's pulse and key M (the
// meteor rain) at its fourth landing, in each of the 14 elements.
//   BASE=http://127.0.0.1:3098/skills-lab.html QS="&tagMask=0" OUT=…/lab-readability/before.json \
//   ../../.local/bin/heavy.sh --gpu node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-tag-readability.mjs --width=1920 --height=1080
// ONLY=id,id limits the run; KEYS=8,9,C,M picks the keys.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ELEMENTS = ["metal", "fire", "water", "thunder", "wind", "ice", "earth", "wood", "dark", "light", "poison", "blood", "void", "star"];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3098/skills-lab.html";
  const out = process.env.OUT ?? "tmp/shots/lab-readability/run.json";
  const keys = new Set((process.env.KEYS ?? "8,9,C,M").split(","));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  const dir = join(dirname(resolve(out)), process.env.SHOTS ?? "shots");
  mkdirSync(dir, { recursive: true });
  await page.goto(`${base}?fixed=1&ui=0&tags=1${process.env.QS ?? ""}`, { settle: 1500 });
  for (let i = 0; i < 400; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await sleep(3000);
  await page.eval("window.__lab.camera('play')");
  const shots = [];
  // One instant, twice: without the tags' DOM (scored) and with it (shown).
  // The scored shot is the canvas alone: the lab's own DOM (the skill caption, the streak counter) is not the game's.
  const LAB_DOM = `(on) => { const c = document.querySelector("canvas"); const keep = new Set(); for (let n = c; n; n = n.parentElement) keep.add(n);
    for (const e of document.body.querySelectorAll("*")) if (!keep.has(e) && e.parentElement !== null && keep.has(e.parentElement)) e.style.visibility = on ? "" : "hidden"; }`;
  const capture = async (key, id, extra = {}) => {
    await page.eval("window.__lab.tags(undefined, false)");
    await page.eval(`(${LAB_DOM})(false)`);
    await page.eval("window.__lab.step(1, 0)");
    const bare = await page.shot(join(dir, `k${key}-${id}.jpg`));
    await page.eval(`(${LAB_DOM})(true)`);
    const tags = await page.eval("window.__lab.tags(undefined, true)");
    await page.eval("window.__lab.step(1, 0)");
    const shown = await page.shot(join(dir, `k${key}-${id}-tags.jpg`));
    shots.push({ key, id, file: bare, shown, boxes: tags.boxes, keep: tags.keep, ...extra });
  };
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.step(30)");
  await capture(0, "none");
  const lists = {
    8: keys.has("8") ? (await page.eval("window.__lab.showcase()")).ids : [],
    9: keys.has("9") ? (await page.eval("window.__lab.expansion()")).ids : [],
  };
  for (const key of [8, 9]) {
    for (const id of lists[key]) {
      if (only !== null && !only.has(id)) continue;
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.step(20)");
      await page.eval(key === 8 ? `window.__lab.showcase(${JSON.stringify(id)})` : `window.__lab.expansion(${JSON.stringify(id)})`);
      let rep = null;
      for (let f = 0; f < 480; f += 1) {
        await page.eval("window.__lab.step(1)");
        rep = await page.eval(`window.__lab.clipSkill(${key})`);
        if (rep && rep.strikeAt && rep.strikeAt[0] >= 0) break;
      }
      // A driven video seeks along world time: let the seek land, then draw the same instant again.
      await sleep(350);
      await page.eval("window.__lab.step(1, 0)");
      await sleep(150);
      await capture(key, id, { video: rep?.video ?? false });
    }
  }
  for (const element of ELEMENTS) {
    if (!keys.has("C") && !keys.has("M")) break;
    await page.eval(`window.__lab.element(${JSON.stringify(element)})`);
    await sleep(400);
    if (keys.has("C") && (only === null || only.has("C-" + element))) {
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.step(20)");
      await page.eval("window.__lab.channel('start')");
      await page.eval("window.__lab.step(30)");
      await page.eval("window.__lab.channel('feed')");
      await page.eval("window.__lab.step(3)");
      await capture("C", element, { report: await page.eval("window.__lab.channel()") });
      await page.eval("window.__lab.channel('sloppy')");
    }
    if (keys.has("M") && (only === null || only.has("M-" + element))) {
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.step(20)");
      await page.eval("window.__lab.meteor(true)");
      let rep = null;
      for (let f = 0; f < 240; f += 1) {
        await page.eval("window.__lab.step(1)");
        rep = await page.eval("window.__lab.meteor()");
        if (rep && rep.blows >= Math.min(4, rep.meteors)) break;
      }
      await page.eval("window.__lab.step(2)");
      await capture("M", element, { blows: rep?.blows ?? 0 });
    }
  }
  writeFileSync(resolve(out), JSON.stringify({ width: page.width, height: page.height, qs: process.env.QS ?? "", shots }, null, 1));
  return { out, shots: shots.length };
}
