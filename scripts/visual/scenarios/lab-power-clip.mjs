// Clip frames for the power pass (03/11/2026) from the dev-only skills lab on its fixed clock: one JPEG per drawn
// frame, for ffmpeg at 60 fps. CLIP=seq: idle, K1, K2, key 7 (Vạn Kiếm Triều Tông), K5 with its cut-in, at 1/60 s a
// frame (real time). CLIP=k7half: key 7 alone at 1/120 s a frame (half speed at 60 fps).
//   CLIP=seq OUT_DIR=tmp/shots/power/raw-clip-seq BASE=http://127.0.0.1:3020/skills-lab.html \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-power-clip.mjs --width=1920 --height=1080
//   ffmpeg -framerate 60 -i tmp/shots/power/raw-clip-seq/f%04d.jpg -c:v libx264 -crf 23 -pix_fmt yuv420p out.mp4
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (page) {
  const clip = process.env.CLIP ?? "seq";
  const base = process.env.BASE ?? "http://127.0.0.1:3020/skills-lab.html";
  const out = resolve(process.env.OUT_DIR ?? `tmp/shots/power/raw-clip-${clip}`);
  mkdirSync(out, { recursive: true });
  await page.goto(`${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind`, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.camera('play')");
  // Warm-up off camera time: compile every program once, then reset.
  await page.eval("window.__lab.type('k7'); window.__lab.step(250); window.__lab.type('k5'); window.__lab.step(300); window.__lab.type('k1'); window.__lab.type('k2'); window.__lab.step(120)");
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.step(30)");
  // [frame, key]: the keys pressed at those frames.
  const plan =
    clip === "k7half"
      ? { dt: 1 / 120, frames: 480, keys: [[20, "k7"]] }
      : { dt: 1 / 60, frames: 780, keys: [[30, "k1"], [130, "k2"], [215, "k7"], [480, "k5"]] };
  let n = 0;
  for (let f = 0; f < plan.frames; f += 1) {
    for (const [at, key] of plan.keys) if (at === f) await page.eval(`window.__lab.type(${JSON.stringify(key)})`);
    await page.eval(`window.__lab.step(1, ${plan.dt})`);
    await page.shot(join(out, `f${String(n++).padStart(4, "0")}.jpg`));
  }
  return { clip, frames: n, out };
}
