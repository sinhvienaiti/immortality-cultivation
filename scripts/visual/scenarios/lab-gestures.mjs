// Motion round 3 captures of the skills lab (dev-only page /skills-lab.html?fixed=1&ui=0&typed=1, fixed 60 Hz clock):
// every casting gesture (anim/gestures.ts) as its slot plays it, typed at WPM, plus the round-2 movement items (a
// wide turn, walk and run stops, the dash, a blow). Each part starts from a reset (caster at (0, 3) facing the field).
// Writes OUT_DIR/:
//   sheets/<NN>-<part>-<view>.jpg  12 frames per part (3 × 4), phase words only (blind-judge sheets print no metrics)
//   clips/<part>-<view>-half.mp4   every 1/60 s step encoded at 30 fps (half speed), cropped on the caster
//   clips/all-<view>-half.mp4      the parts in order; clips/all-<view>-60fps.mp4 real time (OWNER=1 at 1920×1080)
//   frames.json                    per part: frame range, key frames (typing start, last key)
//   raw/                           cropped frames (JPEG); delete with tools/capture-prune once sheets and clips exist
// Views: play = the play camera (whole field), a 360 px square round the caster (scaled ×2 on the sheets); close =
// the 55° close-up (__lab.view("follow", CLOSE_M)), a centred square.
// Run from the game root with the no-HMR capture server up:
//   OUT_DIR=tmp/shots/motion/r3-gest node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-gestures.mjs --width=1920 --height=1080
// Env: URL, WPM (45), PARTS (all), VIEWS (play,close), CLOSE_M (4.5), JPEG_Q (90), SHEETS (1), CLIPS (1).
// Key 7: the lab's key 7 acts Ngự Kiếm's command until skills-main hands "k7" to the caster (round-3 hook); K7_HOOK=1
// (default) releases the caster's own "k7" gesture on the key's frame, primed like a typed word (K7_PRIME s).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => existsSync(f));

const NAMES = {
  auto: "Phi Kiếm · sword-finger flick",
  k1: "Ngự Kiếm Quyết · sword-finger seal",
  k2: "Nhất Tuyến Xuyên Vân · bow-stance thrust",
  guard: "Hồi Kiếm Hộ Thân · planted guard",
  dash: "Lưu Quang Bộ · low dash crouch",
  k4: "Lạc Kiếm Trận · fan-of-blades sweep",
  k5: "Thiên Hà Kiếm Vũ · overhead heaven raise",
  k7: "Vạn Kiếm Triều Tông · two-finger sky edict",
  turn: "Turning in place (150°, then 90°)",
  walkstop: "Walk, stop and settle",
  runstop: "Run, stop and settle",
  hit: "Taking a blow",
};
/** Seconds to keep after the release (or the part's action) before the next reset. */
const AFTER = { auto: 1.3, k1: 2.2, k2: 2.0, guard: 2.1, dash: 1.6, k4: 2.0, k5: 3.6, k7: 2.8 };

export default async function (page) {
  const url = process.env.URL ?? "http://127.0.0.1:3019/skills-lab.html?fixed=1&ui=0&typed=1&cutin=0.05";
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/motion/r3-gest");
  const raw = join(out, "raw");
  const sheets = join(out, "sheets");
  const clips = join(out, "clips");
  for (const d of [raw, sheets, clips]) mkdirSync(d, { recursive: true });
  const wpm = Number(process.env.WPM ?? "45");
  const views = (process.env.VIEWS ?? "play,close").split(",").filter(Boolean);
  const closeM = Number(process.env.CLOSE_M ?? "4.5");
  const quality = Number(process.env.JPEG_Q ?? "90");
  const parts = (process.env.PARTS ?? "auto,k1,k2,guard,dash,k4,k5,k7,turn,walkstop,runstop,hit").split(",").filter(Boolean);
  const k7Hook = process.env.K7_HOOK !== "0";
  const k7Prime = Number(process.env.K7_PRIME ?? "0.8");
  const W = page.width;
  const H = page.height;
  const sc = W / 1920;
  const PLAY = Math.round(360 * sc);
  const CLOSE = Math.round(900 * sc);

  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 200; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready && window.__labCaster && window.__labCaster.anim)")) break;
    await sleep(250);
  }
  if (!(await page.eval("!!(window.__lab && window.__lab.ready)"))) throw new Error("lab not ready");
  await page.eval(`window.__lab.setWpm(${wpm})`);
  await page.eval("window.__lab.camera('play')");

  const shoot = async (file, clip) => {
    const r = await page.send("Page.captureScreenshot", { format: "jpeg", quality, clip: { ...clip, scale: 1 } });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  };
  let n = 0; // running frame index over all parts
  const tick = async (partFrames) => {
    const res = await page.eval("window.__lab.tick(1/60)");
    if (!Array.isArray(res)) throw new Error("tick failed: " + JSON.stringify(res));
    const [, sx, sy] = res;
    const id = String(n).padStart(5, "0");
    if (views.includes("play")) {
      const x = Math.max(0, Math.min(W - PLAY, Math.round(sx - PLAY / 2)));
      const y = Math.max(0, Math.min(H - PLAY, Math.round(sy - PLAY * 0.55)));
      await shoot(join(raw, `play-${id}.jpg`), { x, y, width: PLAY, height: PLAY });
    }
    if (views.includes("close")) {
      await page.eval(`window.__lab.view('follow', ${closeM})`);
      const s = Math.min(CLOSE, H);
      await shoot(join(raw, `close-${id}.jpg`), { x: Math.round((W - s) / 2), y: Math.round((H - s) / 2), width: s, height: s });
      await page.eval("window.__lab.view('play')");
    }
    partFrames.push(n);
    n += 1;
  };
  const advance = async (seconds, partFrames) => {
    const k = Math.round(seconds * 60);
    for (let i = 0; i < k; i += 1) await tick(partFrames);
  };
  const until = async (cond, maxSeconds, partFrames) => {
    const max = Math.round(maxSeconds * 60);
    for (let i = 0; i < max && (await page.eval(cond)); i += 1) await tick(partFrames);
  };

  const record = [];
  for (const part of parts) {
    await page.eval("window.__lab.reset()");
    await page.eval(`window.__lab.mark(${JSON.stringify(part)})`);
    const frames = [];
    const keys = {};
    await advance(0.35, frames);
    if (["k1", "k2", "guard", "dash", "k4", "k5"].includes(part)) {
      keys.start = n;
      await page.eval(`window.__lab.type(${JSON.stringify(part)})`);
      await until("window.__lab.typing()", 6, frames);
      keys.release = n;
      await advance(AFTER[part], frames);
    } else if (part === "auto") {
      // The automatic attack is primed by its timer 0.25 s before it fires (caster.prime, the round-3 hook).
      keys.start = n;
      await page.eval("window.__labCaster.prime('auto', 0, -8, 0.25)");
      await advance(0.25, frames);
      keys.release = n;
      await page.eval("window.__lab.type('auto')");
      await advance(AFTER.auto, frames);
    } else if (part === "k7") {
      keys.start = n;
      if (k7Hook) {
        await page.eval(`window.__labCaster.prime('k7', 0, -8, ${k7Prime})`);
        await advance(k7Prime, frames);
      }
      keys.release = n;
      await page.eval("window.__lab.type('k7')");
      if (k7Hook) await page.eval("window.__labCaster.release('k7', 0, -8)");
      await advance(AFTER.k7, frames);
    } else if (part === "turn") {
      const c = await page.eval("window.__lab.caster()");
      keys.start = n;
      // 150° to the right, then 90° back to the left.
      const turnTo = async (deg) => {
        const cc = await page.eval("window.__lab.caster()");
        const th = (deg * Math.PI) / 180;
        const dx = cc.fx * Math.cos(th) - cc.fz * Math.sin(th);
        const dz = cc.fz * Math.cos(th) + cc.fx * Math.sin(th);
        await page.eval(`window.__lab.faceTo(${cc.x + dx * 5}, ${cc.z + dz * 5})`);
      };
      void c;
      await turnTo(150);
      await advance(1.3, frames);
      keys.release = n;
      await turnTo(-90);
      await advance(1.1, frames);
    } else if (part === "walkstop" || part === "runstop") {
      const v = part === "walkstop" ? 0.6 : 3.0;
      const d = part === "walkstop" ? 1.6 : 4.5;
      keys.start = n;
      await page.eval(`window.__lab.walkTo(0, ${3 - d}, ${v})`);
      await until("window.__lab.moving()", 8, frames);
      keys.release = n;
      await advance(1.3, frames);
    } else if (part === "hit") {
      keys.start = n;
      await page.eval("window.__lab.enemyShot()");
      await until("window.__lab.boltActive()", 4, frames);
      keys.release = n;
      await advance(1.4, frames);
    }
    record.push({ part, first: frames[0], last: frames[frames.length - 1], keys });
  }
  const metrics = await page.eval("window.__lab.metrics()");
  writeFileSync(join(out, "frames.json"), JSON.stringify({ width: W, height: H, views, closeM, url, wpm, parts: record }));
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics));

  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(-600)}`);
  };
  const made = { sheets: [], clips: [] };
  if (process.env.SHEETS !== "0") {
    record.forEach((r, idx) => {
      // 12 moments: the wind-up (or the run-up), the release and its first frames, hold, settle, recovery, rest.
      const R = r.keys.release ?? r.first;
      const S = r.keys.start ?? r.first;
      const isSkill = !["turn", "walkstop", "runstop", "hit"].includes(r.part);
      let picks;
      if (isSkill) {
        const wind = R - S;
        picks = [
          [r.first + 6, "rest"],
          [S + Math.round(wind * 0.35), "wind-up"],
          [S + Math.round(wind * 0.75), "wind-up"],
          [R - 1, "last key"],
          [R + 2, "release"],
          [R + 4, "release"],
          [R + 7, "release"],
          [R + 14, "hold"],
          [R + 26, "hold / settle"],
          [R + 44, "settle"],
          [R + 66, "recovery"],
          [r.last - 2, "rest"],
        ];
      } else {
        const a = S;
        const b = r.last;
        picks = Array.from({ length: 12 }, (_, k) => [Math.round(a + ((b - a) * k) / 11), k === 0 ? "start" : k === 11 ? "end" : r.part === "hit" && Math.abs(a + ((b - a) * k) / 11 - R) < (b - a) / 22 ? "blow" : ""]);
        if (r.part !== "turn") {
          // The stop (or the blow) and the frames right after it.
          picks = [
            [S, "start"],
            [S + Math.round((R - S) * 0.3), r.part === "hit" ? "bolt" : "moving"],
            [S + Math.round((R - S) * 0.6), r.part === "hit" ? "bolt" : "moving"],
            [R - 3, r.part === "hit" ? "blow" : "stopping"],
            [R, r.part === "hit" ? "blow" : "stop"],
            [R + 2, ""],
            [R + 4, ""],
            [R + 8, ""],
            [R + 16, ""],
            [R + 30, ""],
            [R + 50, ""],
            [r.last - 2, "end"],
          ];
        }
      }
      for (const v of views) {
        const tile = v === "play" ? Math.round(360 * sc) * 2 : 450;
        const args = ["-background", "#11151c", "-fill", "#e6e9ef", "-pointsize", "18"];
        if (FONT) args.push("-font", FONT);
        for (const [f0, label] of picks) {
          const f = Math.max(r.first, Math.min(r.last, f0));
          const t = ((f - (isSkill ? R : S)) / 60).toFixed(2);
          args.push("-label", `${label}${label ? "  " : ""}${Number(t) >= 0 ? "+" : ""}${t} s`, join(raw, `${v}-${String(f).padStart(5, "0")}.jpg`));
        }
        const name = `${String(idx).padStart(2, "0")}-${r.part}-${v}.jpg`;
        args.push("-tile", "4x", "-geometry", `${tile}x${tile}+4+4`, "-quality", "88", "-title", `${NAMES[r.part] ?? r.part} · ${v === "play" ? "play camera (crop round the caster, ×2)" : "close view 55°"}`, join(sheets, name));
        run("montage", args);
        made.sheets.push(name);
      }
    });
  }
  if (process.env.CLIPS !== "0") {
    for (const v of views) {
      const size = v === "play" ? `${PLAY * 2}:${PLAY * 2}` : "900:900";
      for (const r of record) {
        const file = join(clips, `${r.part}-${v}-half.mp4`);
        run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-start_number", String(r.first), "-i", join(raw, `${v}-%05d.jpg`), "-frames:v", String(r.last - r.first + 1), "-vf", `scale=${size}:flags=lanczos`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", file]);
        made.clips.push(file);
      }
      for (const [rate, tag] of [
        [30, "half"],
        [60, "60fps"],
      ]) {
        const file = join(clips, `all-${v}-${tag}.mp4`);
        run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(rate), "-start_number", "0", "-i", join(raw, `${v}-%05d.jpg`), "-frames:v", String(n), "-vf", `scale=${size}:flags=lanczos`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", file]);
        made.clips.push(file);
      }
    }
  }
  return { out, frames: n, parts: record.map((r) => `${r.part}:${r.first}-${r.last}`), made: { sheets: made.sheets.length, clips: made.clips.length }, summary: metrics?.summary?.releases };
}
