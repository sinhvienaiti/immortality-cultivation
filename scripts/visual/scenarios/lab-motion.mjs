// Motion capture of the skills lab (MOTION_PLAN step 1, step 4 sequence): on the
// dev-only page /skills-lab.html?fixed=1&ui=0, on a fixed clock, the caster idles,
// walks, runs on an arc, stops, turns 90° and 180°, strafes, dashes, then casts
// auto, K1, K2, guard, K4 and K5 typed at WPM, takes a hit and goes back to Idle.
// Writes OUT_DIR/<RUN>/:
//   metrics.json        the motion probe's report (window.__lab.metrics()) + this run's meta
//   sheets/NN-<f>-<label>.jpg   6 frames (f−2 … f+3) round each state change: close-up row, play-camera crop row
//   segments/NN-<phase>-{play,close}.jpg   12 frames per phase (step 4 contact sheets for judges without
//                        video, scripts/visual/motion-segments.mjs): evenly spaced, snapped to clip changes, last
//                        keys, strikes and hits; play = a third of the frame round the caster, close = whole frame
//   frames.json          the caster's screen point per captured frame (to rebuild sheets while raw/ exists)
//   clip-<view>-half.mp4 every 1/60 s step encoded at 30 fps (half speed), clip-<view>-60fps.mp4 real time
//   raw/                 the frames (JPEG) — delete them once the sheets and clips are made (AGENTS.md "Test captures")
// Crops scale with --width (laid out for 1280×720), so 1920×1080 gives the same sheets.
// HZ=120 writes metrics.json only (the frame-rate check: a true snap doubles its per-second rate at 120 Hz).
// Run from the game root with Vite dev up:
//   OUT_DIR=tmp/shots/motion RUN=baseline node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-motion.mjs --width=1280 --height=720
// Env: URL, WPM (45), HZ (60; 120 steps at 1/120 s, metrics only), CAPTURE (1; 0 = metrics only),
// SPEEDS (baseline = step 1's speeds), WALK_MPS, RUN_MPS, STRAFE_MPS, STRAFE_M,
// VIEWS (play,follow), FOLLOW_M (6, the close-up distance at 55°), JPEG_Q (90), WEAPON (sword id),
// SEGMENT_SHEETS (1; 0 = skip the per-phase contact sheets).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSegmentSheets } from "../motion-segments.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Speeds (m/s). SPEEDS=baseline keeps step 1's (walk 1.4, run 3.4, strafe 3 m at 1.4) for like-for-like
// numbers; the default suits Lam's legs (0.37 m: Mesh2Motion Walk ≈ 0.34 m/s, Run ≈ 3.1 m/s at rate 1).
const BASE = process.env.SPEEDS === "baseline";
const WALK = Number(process.env.WALK_MPS ?? (BASE ? 1.4 : 0.6));
const RUN = Number(process.env.RUN_MPS ?? (BASE ? 3.4 : 3.0));
const STRAFE = Number(process.env.STRAFE_MPS ?? (BASE ? 1.4 : 0.45));
const STRAFE_M = Number(process.env.STRAFE_M ?? (BASE ? 3 : 1.5));
// Arc for the run: centre (−0.5, 4.5), radius 2.5, from θ = π (−3, 4.5) through (−0.5, 7) to θ = 0 (2, 4.5).
const ARC = [];
for (let k = 1; k <= 12; k += 1) {
  const th = Math.PI - (k / 12) * Math.PI;
  ARC.push(-0.5 + 2.5 * Math.cos(th), 4.5 + 2.5 * Math.sin(th), RUN);
}

/** The step 4 sequence: [op, …args]. Times in seconds. */
const SEQUENCE = [
  ["phase", "idle"], ["wait", 3],
  ["phase", "walk"], ["path", [-3, 4.5, WALK, ...ARC]], ["untilStill", 16],
  ["phase", "stopped"], ["wait", 1],
  ["phase", "turn90"], ["turn", 90], ["wait", 1],
  ["phase", "turn180"], ["turn", 180], ["wait", 1],
  ["phase", "strafe"], ["strafe", STRAFE_M, STRAFE], ["untilStill", 10], ["wait", 0.5],
  ["phase", "dash"], ["type", "dash"], ["untilTyped", 5], ["wait", 1.2],
  ["phase", "auto"], ["type", "auto"], ["wait", 1.2],
  ["phase", "k1"], ["type", "k1"], ["untilTyped", 5], ["wait", 2],
  ["phase", "k2"], ["type", "k2"], ["untilTyped", 5], ["wait", 1.8],
  ["phase", "guard"], ["type", "guard"], ["untilTyped", 5], ["wait", 2],
  ["phase", "k4"], ["type", "k4"], ["untilTyped", 5], ["wait", 3],
  ["phase", "k5"], ["type", "k5"], ["untilTyped", 5], ["wait", 3.5],
  ["phase", "hit"], ["shot"], ["untilBolt", 4], ["wait", 1.5],
  ["phase", "idle-end"], ["wait", 2.5],
];

const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => existsSync(f));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(-800)}`);
}

export default async function (page) {
  const url = process.env.URL ?? "http://127.0.0.1:3018/skills-lab.html?fixed=1&ui=0";
  const runName = process.env.RUN ?? "run-" + new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/motion", runName);
  const wpm = Number(process.env.WPM ?? "45");
  const hz = Number(process.env.HZ ?? "60");
  const dt = 1 / hz;
  const capture = process.env.CAPTURE !== "0" && hz === 60;
  const views = (process.env.VIEWS ?? "play,follow").split(",").filter(Boolean);
  const followM = Number(process.env.FOLLOW_M ?? "6");
  const quality = Number(process.env.JPEG_Q ?? "90");
  const raw = join(out, "raw");
  mkdirSync(raw, { recursive: true });

  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 160; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  if (!(await page.eval("!!(window.__lab && window.__lab.ready)"))) throw new Error("lab not ready");
  if (process.env.WEAPON) await page.eval(`window.__lab.setWeapon(${JSON.stringify(process.env.WEAPON)})`);
  const weapon = await page.eval("window.__lab.weapon()");
  await page.eval(`window.__lab.setWpm(${wpm})`);
  await page.eval("window.__lab.camera('play')");
  await page.eval("window.__lab.reset()");

  const screen = new Map(); // probe frame → [x, y] of the caster on the play view
  let frames = 0;
  const t0 = Date.now();
  const shoot = async (file) => {
    const r = await page.send("Page.captureScreenshot", { format: "jpeg", quality });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  };
  /** One frame: step, then the captures of each view. */
  const tick = async () => {
    const res = await page.eval(`window.__lab.tick(${dt})`);
    if (!Array.isArray(res)) throw new Error("tick failed: " + JSON.stringify(res));
    const [f, sx, sy] = res;
    frames += 1;
    if (!capture) return f;
    screen.set(f, [sx, sy]);
    const id = String(f).padStart(5, "0");
    if (views.includes("play")) await shoot(join(raw, `play-${id}.jpg`));
    if (views.includes("follow")) {
      await page.eval(`window.__lab.view('follow', ${followM})`);
      await shoot(join(raw, `follow-${id}.jpg`));
      await page.eval("window.__lab.view('play')");
    }
    return f;
  };
  const advance = async (seconds) => {
    const n = Math.round(seconds * hz);
    if (!capture) {
      if (n > 0) await page.eval(`window.__lab.step(${n}, ${dt})`);
      frames += n;
      return;
    }
    for (let i = 0; i < n; i += 1) await tick();
  };
  const until = async (cond, maxSeconds) => {
    const max = Math.round(maxSeconds * hz);
    for (let i = 0; i < max && (await page.eval(cond)); i += 1) {
      if (capture) await tick();
      else {
        await page.eval(`window.__lab.step(1, ${dt})`);
        frames += 1;
      }
    }
  };

  for (const [op, a, b] of SEQUENCE) {
    switch (op) {
      case "phase":
        await page.eval(`window.__lab.mark(${JSON.stringify(a)})`);
        break;
      case "wait":
        await advance(a);
        break;
      case "path":
        await page.eval(`window.__lab.walkPath(${JSON.stringify(a)})`);
        break;
      case "turn": {
        // Turn right by `a` degrees from the current facing (y up: right of (fx, fz) is (−fz, fx)).
        const c = await page.eval("window.__lab.caster()");
        const th = (a * Math.PI) / 180;
        const rx = -c.fz;
        const rz = c.fx;
        const dx = c.fx * Math.cos(th) + rx * Math.sin(th);
        const dz = c.fz * Math.cos(th) + rz * Math.sin(th);
        await page.eval(`window.__lab.faceTo(${c.x + dx * 5}, ${c.z + dz * 5})`);
        break;
      }
      case "strafe": {
        const c = await page.eval("window.__lab.caster()");
        await page.eval(`window.__lab.walkTo(${c.x - c.fz * a}, ${c.z + c.fx * a}, ${b}, true)`);
        break;
      }
      case "type":
        await page.eval(`window.__lab.type(${JSON.stringify(a)})`);
        break;
      case "shot":
        await page.eval("window.__lab.enemyShot()");
        break;
      case "untilStill":
        await until("window.__lab.moving()", a);
        break;
      case "untilTyped":
        await until("window.__lab.typing()", a);
        break;
      case "untilBolt":
        await until("window.__lab.boltActive()", a);
        break;
      default:
        throw new Error("unknown op " + op);
    }
  }

  const metrics = await page.eval("window.__lab.metrics()");
  if (!metrics || metrics.evalError) throw new Error("metrics failed: " + JSON.stringify(metrics).slice(0, 400));
  metrics.run = { name: runName, url, wpm, hz, weapon, speeds: { walk: WALK, run: RUN, strafe: STRAFE, strafeM: STRAFE_M }, anim: await page.eval("window.__lab.anim ? window.__lab.anim() : null"), frames, capture, views, followM, width: page.width, height: page.height, wallS: Math.round((Date.now() - t0) / 1000), sequence: SEQUENCE.map((s) => s.join(" ")) };
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics));

  const made = { sheets: 0, segments: 0, clips: [] };
  // Crops are laid out for 1280×720 and scale with the page width.
  const sc = page.width / 1280;
  const px = (v) => Math.round(v * sc);
  if (capture) {
    writeFileSync(join(out, "frames.json"), JSON.stringify({ width: page.width, height: page.height, hz, screen: [...screen].map(([f, [sx, sy]]) => [f, Math.round(sx), Math.round(sy)]) }));
    // Transition sheets: 6 frames round each state change (clip, move, face) and each phase mark.
    const sheets = join(out, "sheets");
    mkdirSync(sheets, { recursive: true });
    const byFrame = new Map();
    for (const ev of metrics.events) {
      if (!["clip", "move", "face", "phase", "hit", "lastKey"].includes(ev.kind)) continue;
      const label = ev.kind === "phase" ? `[${ev.detail}]` : `${ev.kind} ${ev.detail}`.trim();
      byFrame.set(ev.f, (byFrame.has(ev.f) ? byFrame.get(ev.f) + " · " : "") + label);
    }
    const tr = new Map(metrics.transitions.map((t) => [t.f, t]));
    const first = Math.min(...screen.keys());
    const last = Math.max(...screen.keys());
    let n = 0;
    for (const [f, label] of [...byFrame].sort((p, q) => p[0] - q[0])) {
      const picks = [-2, -1, 0, 1, 2, 3].map((k) => f + k).filter((k) => k >= first && k <= last);
      if (picks.length === 0) continue;
      const args = ["-background", "#11151c", "-fill", "#e6e9ef", "-pointsize", "13"];
      if (FONT) args.push("-font", FONT);
      for (const k of picks) {
        const id = String(k).padStart(5, "0");
        if (views.includes("follow")) args.push("-label", `f${k - f >= 0 ? "+" : ""}${k - f}  #${k}`, `${join(raw, `follow-${id}.jpg`)}[${px(540)}x${px(720)}+${px(370)}+0]`);
      }
      for (const k of picks) {
        const id = String(k).padStart(5, "0");
        const [sx, sy] = screen.get(k) ?? [page.width / 2, page.height / 2];
        const x = Math.max(0, Math.min(page.width - px(180), Math.round(sx - px(90))));
        const y = Math.max(0, Math.min(page.height - px(180), Math.round(sy - px(100))));
        if (views.includes("play")) args.push("-label", "play camera", `${join(raw, `play-${id}.jpg`)}[${px(180)}x${px(180)}+${x}+${y}]`);
      }
      const t = tr.get(f);
      const extra = t ? `  ratio ${t.ratio} (bone ${t.bone} ${t.maxBoneDegS}°/s vs ${t.refPeakDegS})  min bind ${t.minBindRmsDeg}°  w ${t.minWeightSum}  turn ${t.maxTurnDegS}°/s` : "";
      const name = `${String(n).padStart(2, "0")}-f${String(f).padStart(5, "0")}-${label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48)}.jpg`;
      args.push("-tile", `${picks.length}x`, "-geometry", "270x360+3+3", "-quality", "90", "-title", `#${f}  ${label}${extra}`, join(sheets, name));
      run("montage", args);
      n += 1;
    }
    made.sheets = n;
    // Segment contact sheets (step 4): 12 frames per phase, play camera and close-up (motion-segments.mjs).
    if (process.env.SEGMENT_SHEETS !== "0") {
      made.segments = buildSegmentSheets({ out, metrics, screen, width: page.width, height: page.height, hz, views, followM });
    }
    // Clips: every 1/60 s step at 30 fps (half speed) and at 60 fps (real time).
    for (const v of views) {
      for (const [fps, tag] of [
        [30, "half"],
        [60, "60fps"],
      ]) {
        const file = join(out, `clip-${v}-${tag}.mp4`);
        run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-start_number", String(first), "-i", join(raw, `${v}-%05d.jpg`), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", file]);
        made.clips.push(file);
      }
    }
  }
  return { out, frames, weapon, made, summary: metrics.summary, wallS: Math.round((Date.now() - t0) / 1000) };
}
