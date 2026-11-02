// Motion round 4 (MOTION_PLAN "Vòng 4"): the human proxy's authored fan sweep (slot k4) on the skills lab
// (/skills-lab.html?hero=human&typed=1&fixed=1&ui=0, fixed 60 Hz clock). Run from the game root with the no-HMR
// capture server up (npx vite --config tmp/vite.capture.config.mts --port 3019 --strictPort):
//   MODE=metrics OUT_DIR=tmp/shots/motion/r4-metrics node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-keypose.mjs --width=1920 --height=1080
//   MODE=test    OUT_DIR=tmp/shots/motion/r4-test    node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-keypose.mjs --width=1920 --height=1080
//   MODE=judge   OUT_DIR=tmp/shots/motion/r4-judge   node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-keypose.mjs --width=1920 --height=1080
// metrics: the word typed at WPM through the lab's own path (VFX on, the release event on the last key's frame);
//   writes metrics.json: __labPose.report() (pose rules) and the motion probe's release record for k4.
// test: the blind phase and direction test set, body only (VFX, beasts and the presence ring hidden, the plain
//   material, the sword's glow off): the caster typed at 8 screen directions (targets chosen so the attack goes
//   exactly up, up-right, … on screen) at hero heights 30, 50 and 70 px (whole-field camera; the viewport sets the
//   size, a zoom only for 70 px). Writes items/<random id>.png (stills ×nearest, and strips of 6 frames left to right
//   in time), items-clips/<id>.mp4 (real-speed clips of the same windows) and, outside the items folder, key.json
//   (the answers). Raw frames go to raw/ (prune them once the items exist).
// judge: VFX on, the real typed path at the lab's own k4 target, play camera (whole field) and the close view
//   (__lab.zoom(1)): sheets and real-speed clips without metrics.
// Env: URL, WPM (45), SPEC=1 (preview fan-sweep-spec.ts instead of the baked poses: run with `npx tsx`), SEED.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = [
  ["up", 0],
  ["up-right", 45],
  ["right", 90],
  ["down-right", 135],
  ["down", 180],
  ["down-left", 225],
  ["left", 270],
  ["up-left", 315],
];
const SIZES = [30, 50, 70];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default async function (page) {
  const mode = process.env.MODE ?? "metrics";
  const wpm = Number(process.env.WPM ?? "45");
  const url = process.env.URL ?? "http://127.0.0.1:3019/skills-lab.html?fixed=1&ui=0&typed=1&hero=human&cutin=0.05";
  const out = resolve(process.env.OUT_DIR ?? `tmp/shots/motion/r4-${mode}`);
  mkdirSync(out, { recursive: true });
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 200; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready && window.__labPose)")) break;
    await sleep(250);
  }
  if (!(await page.eval("!!(window.__lab && window.__lab.ready)"))) throw new Error("lab not ready");
  if (process.env.SPEC === "1") {
    const { FAN_SWEEP_SPEC } = await import("../../../src/lab/anim/fan-sweep-spec.ts");
    await page.eval(`window.__labPose.preview('k4', ${JSON.stringify(FAN_SWEEP_SPEC)}).length`);
  }
  await page.eval(`window.__lab.setWpm(${wpm})`);
  await page.eval("window.__lab.camera('play')");
  const result = { mode };

  if (mode === "metrics") {
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.step(40)");
    result.idle = await page.eval("window.__labPose.begin()");
    await page.eval("window.__lab.mark('k4-typed'); window.__lab.type('k4')");
    const frames = [];
    for (let i = 0; i < 200; i += 1) {
      await page.eval("window.__lab.tick(1/60)");
      frames.push(await page.eval("window.__labPose.sample()"));
    }
    result.report = await page.eval("window.__labPose.report()");
    const m = await page.eval("window.__lab.metrics()");
    result.releases = (m.releases ?? m.release ?? []).filter?.((r) => r.slot === "k4") ?? m.releases;
    result.events = await page.eval("window.__lab.events()");
    writeFileSync(join(out, "frames.json"), JSON.stringify(frames));
    writeFileSync(join(out, "metrics.json"), JSON.stringify(result, null, 1));
    return result;
  }

  // Body only: no VFX, beasts or ring; the plain proxy and an unlit sword.
  const bodyOnly = async () => {
    await page.eval("window.__lab.debugShow('fx', false); window.__lab.debugShow('blades', false); window.__lab.setFx(0); window.__lab.forceHandGlow(0, 0); window.__labPose.bodyOnly(true)");
  };
  const raw = join(out, "raw");
  mkdirSync(raw, { recursive: true });
  let shotN = 0;
  /** Square crop round the hero's box centre, side `side` px; returns the file. */
  const crop = async (cx, cy, side, tag) => {
    const x = Math.max(0, Math.round(cx - side / 2));
    const y = Math.max(0, Math.round(cy - side / 2));
    const r = await page.send("Page.captureScreenshot", { format: "png", clip: { x, y, width: side, height: side, scale: 1 } });
    const f = join(raw, `${tag}-${String(shotN++).padStart(5, "0")}.png`);
    writeFileSync(f, Buffer.from(r.data, "base64"));
    return f;
  };

  if (mode === "test") {
    const rand = rng(Number(process.env.SEED ?? "20261103"));
    const items = join(out, "items");
    const clipsDir = join(out, "items-clips");
    rmSync(items, { recursive: true, force: true });
    mkdirSync(items, { recursive: true });
    mkdirSync(clipsDir, { recursive: true });
    const key = [];
    const used = new Set();
    const newId = () => {
      for (;;) {
        const id = "s" + Math.floor(rand() * 1e6).toString(36).padStart(4, "0");
        if (!used.has(id)) {
          used.add(id);
          return id;
        }
      }
    };
    const W = page.width;
    const H = page.height;
    const letters = 6;
    const perLetter = 60 / (wpm * 5);
    // Phases a still or a strip is taken from: frames counted from the first key.
    for (const size of SIZES) {
      // The whole-field camera; a smaller viewport for 30 and 50 px, a zoom for 70.
      await page.viewport(W, H);
      await page.eval("window.__lab.camera('play')");
      await page.eval("window.__lab.reset(); window.__lab.step(30)");
      const h0 = (await page.eval("window.__labPose.size()")).heightPx;
      let vw = W;
      let vh = H;
      let zoom = 0;
      if (size < h0) {
        vh = Math.round((H * size) / h0);
        vw = Math.round((vh * 16) / 9);
        await page.viewport(vw, vh);
        await sleep(200);
        await page.eval("window.__lab.camera('play')");
      } else {
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 14; k += 1) {
          const mid = (lo + hi) / 2;
          await page.eval(`window.__lab.zoom(${mid})`);
          const h = (await page.eval("window.__labPose.size()")).heightPx;
          if (h < size) lo = mid;
          else hi = mid;
        }
        zoom = (lo + hi) / 2;
        await page.eval(`window.__lab.zoom(${zoom})`);
      }
      await page.eval("window.__lab.reset(); window.__lab.step(30)");
      await bodyOnly();
      const sz = await page.eval("window.__labPose.size()");
      result["size" + size] = { viewport: [vw, vh], zoom: Math.round(zoom * 1000) / 1000, heroPx: sz.heightPx };
      for (const [dirName, dirDeg] of DIRS) {
        await page.eval("window.__lab.reset(); window.__lab.step(20)");
        await bodyOnly();
        // A ground target 7 m away whose screen direction from the caster is dirDeg (search the world heading).
        const target = await page.eval(`(() => { const c = window.__lab.caster(); let best = null; for (let a = 0; a < 360; a += 0.5) { const r = a * Math.PI / 180; const x = c.x + Math.sin(r) * 7, z = c.z + Math.cos(r) * 7; let d = window.__labPose.screenDir(x, z) - ${dirDeg}; d = ((d + 540) % 360) - 180; if (!best || Math.abs(d) < Math.abs(best.d)) best = { x, z, d }; } return best; })()`);
        const tx = target.x;
        const tz = target.z;
        // Type the word: keys at perLetter, the last one releases; frames recorded with their stage.
        const rec = [];
        let next = 0;
        let typed = 0;
        let crops = [];
        const side = Math.round(size * 3.2);
        for (let f = 0; f < 130; f += 1) {
          next -= 1 / 60;
          while (typed < letters && next <= 0) {
            typed += 1;
            next += perLetter;
            if (typed >= letters) await page.eval(`window.__labCaster.release('k4', ${tx}, ${tz})`);
            else await page.eval(`window.__labCaster.charge('k4', ${typed / letters}, ${tx}, ${tz}, ${letters - typed})`);
          }
          await page.eval("window.__lab.tick(1/60)");
          await page.eval("window.__lab.debugShow('fx', false)");
          const s = await page.eval("window.__labPose.sample()");
          if (f === 0) crops = [s.cx, s.cy];
          rec.push({ f, stage: s.stage, typed });
          // Every frame from the first key to the end of the recovery is kept (the crop holds on the start centre).
          const file = await crop(crops[0], crops[1], side, `${size}-${dirName}`);
          rec[rec.length - 1].file = file;
        }
        const phaseOf = (st) => (st === "charge" ? "charging" : st === "release" || st === "hold" ? "releasing" : st === "follow" || st === "settle" || st === "recover" ? "recovering" : "rest");
        const charge = rec.filter((r) => r.stage === "charge" && r.typed >= 3);
        const rel = rec.filter((r) => r.stage === "release" || r.stage === "hold");
        const recov = rec.filter((r) => r.stage === "follow" || r.stage === "settle" || r.stage === "recover");
        const relStart = rec.findIndex((r) => r.stage === "release");
        // Stills: one per phase at this size (charging deep in the coil; releasing in the hold; recovering mid-way).
        const stillOf = { charging: charge[Math.floor(charge.length * 0.6)], releasing: rel[Math.min(rel.length - 1, 5)], recovering: recov[Math.floor(recov.length * 0.45)] };
        for (const [phase, r] of Object.entries(stillOf)) {
          if (!r) continue;
          const id = newId();
          spawnSync("magick", [r.file, "-filter", "point", "-resize", "384x384", join(items, id + ".png")]);
          key.push({ id, kind: "still", size, phase, direction: dirName, dirDeg, frame: r.f });
        }
        // Strips at 50 px: six frames left to right in time, one window per phase.
        if (size === 50) {
          const windows = {
            charging: charge.filter((_, i) => i % Math.max(1, Math.floor(charge.length / 6)) === 0).slice(0, 6),
            releasing: rec.slice(Math.max(0, relStart - 1), relStart + 11).filter((_, i) => i % 2 === 0).slice(0, 6),
            recovering: recov.filter((_, i) => i % Math.max(1, Math.floor(recov.length / 6)) === 0).slice(0, 6),
          };
          for (const [phase, rs] of Object.entries(windows)) {
            if (rs.length < 3) continue;
            const id = newId();
            const scaled = rs.map((r, i) => {
              const o = join(raw, `strip-${id}-${i}.png`);
              spawnSync("magick", [r.file, "-filter", "point", "-resize", "256x256", o]);
              return o;
            });
            spawnSync("magick", ["montage", ...scaled, "-tile", `${scaled.length}x1`, "-geometry", "+3+0", "-background", "#000", join(items, id + ".png")]);
            // The real-speed clip of the same window (every frame between its first and last).
            const f0 = rs[0].f;
            const f1 = rs[rs.length - 1].f;
            const list = rec.slice(f0, f1 + 1).map((r) => `file '${r.file}'\nduration ${1 / 60}`).join("\n");
            const lf = join(raw, `clip-${id}.txt`);
            writeFileSync(lf, list);
            spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", "scale=384:384:flags=neighbor,fps=60", "-pix_fmt", "yuv420p", join(clipsDir, id + ".mp4")]);
            key.push({ id, kind: "strip", size, phase, direction: dirName, dirDeg, frames: rs.map((r) => r.f), phases: rs.map((r) => phaseOf(r.stage)) });
          }
        }
        result[`aim-${size}-${dirName}`] = target.d;
      }
    }
    await page.viewport(W, H);
    // The answer key lives outside the items folder.
    writeFileSync(join(out, "key.json"), JSON.stringify(key, null, 1));
    result.items = key.length;
    return result;
  }

  if (mode === "judge") {
    const views = [
      ["play", 0],
      ["close", 1],
    ];
    const sheets = join(out, "sheets");
    const clipsDir = join(out, "clips");
    mkdirSync(sheets, { recursive: true });
    mkdirSync(clipsDir, { recursive: true });
    for (const [view, zoom] of views) {
      await page.eval("window.__lab.reset()");
      await page.eval(`window.__lab.zoom(${zoom})`);
      await page.eval("window.__lab.step(30)");
      const files = [];
      let c = null;
      const sz0 = await page.eval("window.__labPose.size()");
      const side = view === "play" ? Math.round(sz0.heightPx * 4.5) : Math.min(page.height, Math.round(sz0.heightPx * 2.6));
      await page.eval("window.__lab.type('k4')");
      for (let f = 0; f < 170; f += 1) {
        await page.eval("window.__lab.tick(1/60)");
        const s = await page.eval("window.__labPose.sample()");
        if (!c) c = [s.cx, s.cy - (view === "play" ? sz0.heightPx * 0.6 : 0)];
        files.push({ f, stage: s.stage, file: await crop(c[0], c[1], side, `judge-${view}`) });
      }
      // Real-speed clip and a 12-frame sheet (no numbers, phase words only).
      const lf = join(raw, `judge-${view}.txt`);
      writeFileSync(lf, files.map((r) => `file '${r.file}'\nduration ${1 / 60}`).join("\n"));
      spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", "scale=720:720:flags=lanczos,fps=60", "-pix_fmt", "yuv420p", join(clipsDir, `k4-${view}-60fps.mp4`)]);
      spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", "scale=720:720:flags=lanczos,setpts=2.0*PTS,fps=60", "-pix_fmt", "yuv420p", join(clipsDir, `k4-${view}-half.mp4`)]);
      const firstKey = files.findIndex((r) => r.stage === "charge");
      const relAt = files.findIndex((r) => r.stage === "release");
      const pick = [firstKey, firstKey + 20, firstKey + 45, relAt - 4, relAt - 1, relAt, relAt + 2, relAt + 5, relAt + 9, relAt + 16, relAt + 26, relAt + 40].map((k) => files[Math.max(0, Math.min(files.length - 1, k))]);
      const tiles = pick.map((r, i) => {
        const o = join(raw, `sheet-${view}-${i}.png`);
        const label = ["first key", "typing", "typing", "coil", "last coil", "last key", "+2 frames", "+5 frames", "+9 frames", "+16 frames", "+26 frames", "+40 frames"][i];
        spawnSync("magick", [r.file, "-resize", "360x360", "-gravity", "south", "-fill", "white", "-undercolor", "#0008", "-pointsize", "18", "-annotate", "+0+6", label, o]);
        return o;
      });
      spawnSync("magick", ["montage", ...tiles, "-tile", "4x3", "-geometry", "+3+3", "-background", "#111", join(sheets, `k4-${view}.jpg`)]);
    }
    return result;
  }
  throw new Error("unknown MODE " + mode);
}
