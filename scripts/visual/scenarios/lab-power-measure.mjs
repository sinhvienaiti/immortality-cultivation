// Power pass round 2 measurements (03/11/2026) on the dev-only skills lab, fixed 60 Hz clock, play camera:
// frames of key 7 and K5 for the mean field luminance (whole frame, and the world alone with the VFX layer hidden
// for that frame: __lab.debugShow), the damage numbers spawned per key 7 (__lab.numbers), and the screen state per
// frame (__lab.screen). JPEGs go to OUT_DIR/<skill>-<NN>-<label>[-world].jpg; read their means with ImageMagick:
//   for f in OUT_DIR/*.jpg; do magick "$f" -colorspace Gray -format "%[fx:mean*255] $f\n" info:; done
//   BASE=http://127.0.0.1:3022/skills-lab.html OUT_DIR=tmp/shots/power-r2/measure \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power-measure.mjs --width=1920 --height=1080
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Frames after the key (k5: after the key that starts its cut-in, ~61 frames, then the release). */
const PLAN = {
  k7: [[0, "idle"], [1, "F1"], [6, "F6"], [20, "F20"], [45, "F45-hunt"], [90, "F90-hunt"], [140, "F140-hunt"], [186, "F186-stroke"], [192, "F192-fin"], [194, "F194"], [197, "F197"], [205, "F205"], [230, "F230-after"], [260, "F260-back"], [290, "F290-back2"]],
  k5: [[0, "idle"], [10, "cutin10"], [40, "cutin40"], [62, "fire"], [92, "wave1"], [137, "wave2"], [182, "wave3"], [185, "wave3+3"], [215, "after"], [260, "late"], [320, "back"], [360, "back2"]],
};

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3022/skills-lab.html";
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/power-r2/measure");
  const skills = (process.env.SKILLS ?? "k7,k5").split(",");
  const world = process.env.WORLD !== "0";
  const zoom = Number(process.env.ZOOM ?? "0");
  mkdirSync(out, { recursive: true });
  // cutin=0.9: the K5 frame tables were timed on the 0.9 s cut-in; the lab's default is 1.7 s since 03/11 (style C).
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind&cutin=0.9`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  const report = {};
  for (const skill of skills) {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    if (zoom > 0) await page.eval(`window.__lab.zoom(${zoom})`);
    await page.eval("window.__lab.step(40)");
    const n0 = await page.eval("window.__lab.numbers()");
    const rows = [];
    let since = 0;
    let n = 0;
    for (const [f, label] of PLAN[skill]) {
      if (f === 0 && label === "idle") {
        await page.shot(join(out, `${skill}-${String(n).padStart(2, "0")}-idle.jpg`));
        if (world) {
          await page.eval("window.__lab.debugShow('fx', false)");
          await page.shot(join(out, `${skill}-${String(n).padStart(2, "0")}-idle-world.jpg`));
          await page.eval("window.__lab.debugShow('fx', true)");
        }
        n += 1;
        await page.eval(`window.__lab.type(${JSON.stringify(skill)})`);
        await page.eval("window.__lab.step(1)");
        since = 1;
        continue;
      }
      if (f > since) await page.eval(`window.__lab.step(${f - since})`);
      since = Math.max(since, f);
      const name = `${skill}-${String(n).padStart(2, "0")}-${label}`;
      await page.shot(join(out, name + ".jpg"));
      const scr = await page.eval("window.__lab.screen()");
      if (world) {
        await page.eval("window.__lab.debugShow('fx', false)");
        await page.shot(join(out, name + "-world.jpg"));
        await page.eval("window.__lab.debugShow('fx', true)");
      }
      rows.push({ f, label, screen: scr, framing: await page.eval("window.__lab.framing ? window.__lab.framing() : null") });
      n += 1;
    }
    if (skill === "k7") await page.eval("window.__lab.step(120)");
    const n1 = await page.eval("window.__lab.numbers()");
    report[skill] = { rows, numbers: { shown: n1.shown - n0.shown, clusters: n1.clusters - n0.clusters, dropped: n1.dropped - n0.dropped }, events: await page.eval("window.__lab.events()") };
  }
  return report;
}
