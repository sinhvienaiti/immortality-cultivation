// The element kits drawn from clips (element-clips.ts; docs/work/tasks/lab-element-kits.md, 05/11/2026): one element's
// Sword keys 0–7 on the dev-only skills lab, fixed 60 Hz clock, DPR 1, the play camera, then its blows on the ground
// close (key 1's hits and the array of key 5). Frames go to OUT_DIR/frames/<n>.jpg in order (one shot every EVERY
// world frames: 2 → a 30 fps video of real time), the segments and the kit's clip counts to OUT_DIR/segments.json;
// make the video with scripts/visual/element-kit-video.py, then delete the frames.
//   BASE=http://127.0.0.1:3068/skills-lab.html ELEMENT=water OUT_DIR=…/captures/tu-tien/lab-elements/water \
//   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-element-kits.mjs --width=1280 --height=720
// KEYS=1,7 limits the keys; CLOSE=0 drops the close ground shots; EVERY=1 shoots every frame; SHOWCASE=1 adds key 8's
// pillars and ultimates (KEYS=none CLOSE=0 SHOWCASE=1: only them).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Key, lab slot, its name (the lab panel's), world frames shown after the key. */
const KEYS = [
  ["0", "auto", "Phi Kiếm · Flying Sword", 80],
  ["1", "k1", "Ngự Kiếm Quyết · Threefold Sword Command", 170],
  ["2", "k2", "Nhất Tuyến Xuyên Vân · Cloud-Piercing Line", 120],
  ["3", "guard", "Hồi Kiếm Hộ Thân · Returning Sword Aegis", 150],
  ["4", "dash", "Lưu Quang Bộ · Flowing-Light Step", 90],
  ["5", "k4", "Lạc Kiếm Trận · Falling Sword Array", 200],
  ["6", "k5", "Thiên Hà Kiếm Vũ · Milky-Way Sword Rain", 300],
  ["7", "k7", "Vạn Kiếm Triều Tông · Ten-Thousand Sword Convergence", 380],
];

/** Close shots of blows on the ground: key, slot, camera (x, z, distance m), frames after the key. */
const CLOSE = [
  ["1", "k1", [-0.3, -5.6, 10], 190],
  ["5", "k4", [0, -6, 12], 220],
];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3068/skills-lab.html";
  const element = process.env.ELEMENT ?? "water";
  const every = Math.max(1, Number(process.env.EVERY ?? "2"));
  const root = resolve(process.env.OUT_DIR ?? `tmp/shots/lab-elements/${element}`);
  const frames = join(root, "frames");
  const only = process.env.KEYS ? process.env.KEYS.split(",") : null;
  mkdirSync(frames, { recursive: true });
  const url = `${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind&cutin=0.9&element=${element}`;
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 240; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  // Atlases arrive after `ready`.
  await sleep(4000);
  const info = { element: await page.eval("window.__lab.element()"), kit: await page.eval("window.__lab.clipKit()") };
  let n = 0;
  const segments = [];
  const shoot = async () => {
    await page.shot(join(frames, String(n).padStart(5, "0") + ".jpg"));
    n += 1;
  };
  const run = async (key, slot, name, after, close) => {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    if (close !== null) await page.eval(`window.__lab.camera('close', ${close[0]}, ${close[1]}, ${close[2]})`);
    await page.eval("window.__lab.step(30)");
    const start = n;
    // A short lead-in, then the key's last letter (the release on that frame).
    for (let i = 0; i < 8; i += every) {
      await shoot();
      await page.eval(`window.__lab.step(${every})`);
    }
    const r = await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
    if (r && r.evalError) throw new Error(r.evalError);
    for (let f = 0; f < after; f += every) {
      await shoot();
      await page.eval(`window.__lab.step(${every})`);
    }
    segments.push({ key, slot, name, close: close !== null, start, count: n - start, kit: await page.eval("window.__lab.clipKit()") });
  };
  for (const [key, slot, name, after] of KEYS) {
    if (only && !only.includes(key)) continue;
    await run(key, slot, name, after, null);
  }
  if (process.env.CLOSE !== "0") {
    for (const [key, slot, cam, after] of CLOSE) {
      if (only && !only.includes(key)) continue;
      const k = KEYS.find((x) => x[0] === key);
      await run(key, slot, k[2], after, cam);
    }
  }
  // SHOWCASE=1: key 8's pillars and ultimates (showcase.ts), each at the play camera.
  if (process.env.SHOWCASE === "1") {
    const ids = (await page.eval("window.__lab.showcase('-').ids")) ?? [];
    for (const id of ids) {
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.camera('play')");
      await page.eval("window.__lab.step(30)");
      const start = n;
      for (let i = 0; i < 8; i += every) {
        await shoot();
        await page.eval(`window.__lab.step(${every})`);
      }
      await page.eval(`window.__lab.showcase(${JSON.stringify(id)})`);
      const after = id.startsWith("ult-") ? 290 : 170;
      for (let f = 0; f < after; f += every) {
        await shoot();
        await page.eval(`window.__lab.step(${every})`);
      }
      segments.push({ key: "8", slot: "showcase", name: id, close: false, start, count: n - start, kit: null });
    }
  }
  const report = { element, every, fps: 60 / every, info, segments, frames: n };
  writeFileSync(join(root, "segments.json"), JSON.stringify(report, null, 1));
  return { element, frames: n, segments: segments.map((s) => `${s.key}${s.close ? "c" : ""}:${s.count}`) };
}
