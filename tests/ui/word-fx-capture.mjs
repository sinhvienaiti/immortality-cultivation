// Run outside the Codex sandbox, with Vite already serving port 3008.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const game = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repo = resolve(game, "../..");
const review = resolve(repo, "../typing-game-review");
const topic = process.env.WORD_FX_TOPIC ?? "word-fx";
const ticket = process.env.WORD_FX_TICKET ?? "400";
const out = join(review, "owner-review/2026-11-16/tu-tien", topic);
const captures = join(review, "captures/tu-tien", topic);
const url = process.env.URL ?? "http://127.0.0.1:3008/";
const sleep = ms => new Promise(done => setTimeout(done, ms));
const about = `purpose: Clip vòng đời chữ phiếu ${ticket}: tấn công, phòng thủ và gõ sai; preflight, chưa phải chấm mù\nmade-by: Claude chạy kiểm tra CDP do Codex chuẩn bị\ndoc: docs/codex-queue/${ticket}-report.md\ndelete-when: Owner đã duyệt và lưu số đo cần thiết\n`;

if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) throw new Error("ffmpeg is required");
await fetch(url); // Fail before launching Chrome if the host is unavailable.
for (const dir of [out, captures]) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "ABOUT.md"), about); }
const profile = mkdtempSync(join(tmpdir(), "word-fx-400-"));
const browser = spawn(process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile,
  "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "about:blank",
], { stdio: "ignore" });
let socket, next = 0, recording = null, launchError;
browser.on("error", error => { launchError = error; });
const pending = new Map();
const acceptanceFailures = [];
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = ++next;
  const timeout = setTimeout(() => { pending.delete(id); fail(new Error(method + " timed out")); }, 15000);
  pending.set(id, result => { clearTimeout(timeout); result.error ? fail(new Error(JSON.stringify(result.error))) : done(result.result); });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
};
const press = async key => {
  const code = key.length === 1 ? "Key" + key.toUpperCase() : key;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(key.length === 1 ? { text: key } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
};
let lastKeyAt = 0;
const type = async text => { for (const key of text) { await press(key); lastKeyAt = Date.now() / 1000; await sleep(Number(process.env.KEY_INTERVAL_MS ?? 120)); } };
const wait = async (expression, label) => {
  for (let i = 0; i < 200; i += 1) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error("Timed out: " + label);
};

// Observe actual canvas draw centres after viewport clamping, in CSS pixels.
// Keepout clipping can still hide ink; these are not raster-visibility measurements.
function installWordFlightProbe() {
  const proto = CanvasRenderingContext2D.prototype;
  const clearRect = proto.clearRect, fillText = proto.fillText;
  let probe = null, glyphIndex = 0;
  window.__wordFlightProbe = {
    arm(slot, direction) {
      probe = { slot, direction, origin: [], peakPx: [], samples: 0, firstDrawMs: null, lastDrawMs: null };
    },
    result() {
      if (!probe) return null;
      const { direction, peakPx, samples, firstDrawMs, lastDrawMs } = probe;
      return { direction, perGlyphPeakPx: peakPx, minPx: peakPx.length ? Math.min(...peakPx) : null,
        maxPx: peakPx.length ? Math.max(...peakPx) : null, samples, firstDrawMs, lastDrawMs,
        targetPx: direction === "attack" ? [80, 110] : [50, 80],
        method: "canvas draw centres after viewport clamp; peak observed while alpha >= 0.5; before keepout clipping" };
    },
  };
  const cell = () => document.querySelectorAll(".ic-bq__words > .ic-bq__cell")[probe.slot];
  proto.clearRect = function (...args) {
    if (probe && this.canvas.classList.contains("ic-word-flight")) {
      glyphIndex = 0;
      if (!probe.origin.length && cell()?.dataset.wordPhase === "flash") {
        probe.origin = [...cell().querySelectorAll(".ic-bq__letter")].map(letter => {
          const rect = letter.getBoundingClientRect();
          return { text: letter.textContent, y: rect.top + rect.height / 2 };
        });
        probe.peakPx = probe.origin.map(() => 0);
      }
    }
    return clearRect.apply(this, args);
  };
  proto.fillText = function (...args) {
    if (probe?.origin.length && this.canvas.classList.contains("ic-word-flight") && cell()?.dataset.wordPhase === "depart") {
      const index = glyphIndex++, origin = probe.origin[index];
      if (origin && args[0] === origin.text && this.globalAlpha >= .5) {
        const matrix = this.getTransform();
        const dpr = this.canvas.width / innerWidth;
        const y = (matrix.b * args[1] + matrix.d * args[2] + matrix.f) / dpr;
        const delta = (y - origin.y) * (probe.direction === "attack" ? -1 : 1);
        probe.peakPx[index] = Math.max(probe.peakPx[index], delta);
        probe.samples += 1;
        probe.firstDrawMs ??= performance.now();
        probe.lastDrawMs = performance.now();
      }
    }
    return fillText.apply(this, args);
  };
}

try {
  const active = join(profile, "DevToolsActivePort");
  for (let i = 0; !existsSync(active) && i < 100; i += 1) { if (launchError) throw launchError; await sleep(100); }
  const port = readFileSync(active, "utf8").split("\n")[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === "Page.screencastFrame") {
      const { data, metadata, sessionId } = message.params;
      void send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      if (recording) {
        const file = join(recording.dir, String(recording.frames.length).padStart(5, "0") + ".jpg");
        writeFileSync(file, Buffer.from(data, "base64"));
        recording.frames.push({ file, time: metadata.timestamp });
      }
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await wait("Boolean(window.__ic)", "app");
    await wait("(document.querySelector('.ic-pace__row[data-wpm=\"35\"]')?.click(), window.__ic?.state().ready)", "match");
    await press("Shift");
    await wait("!window.__ic.state().paused", "focus");
    await press("Enter");
    await wait("window.__ic.state().phase === 'wave'", "wave");
    await evaluate(`(async () => {
      const { spawnBeast } = await import('/src/sim/spawn.ts');
      const w = window.__ic.world(), p = window.__ic.local();
      w.waves.groupsTotal = 999;
      for (let i = 0; i < 12; i++) {
        const beast = spawnBeast(w, 'phong-lang', 'A', { wave: -1, x: p.x + (i % 3 - 1) * 30000, z: p.z - 180000 - i * 1000, elite: null, cluster: -1 });
        if (beast) beast.hp = beast.hpMax = 100000;
      }
    })()`);
    await evaluate(`(${installWordFlightProbe.toString()})()`);
    const dir = mkdtempSync(join(captures, "frames-" + width + "x" + height + "-"));
    writeFileSync(join(dir, "ABOUT.md"), about);
    recording = { dir, frames: [] };
    await send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
    await sleep(300);
    const attack = await evaluate("window.__ic.words().slots[0].text");
    if (!attack) throw new Error("No attack word");
    const before = await evaluate("window.__ic.world().casts.resolved");
    const wrongBefore = await evaluate("window.__ic.world().stats.wrongKeys");
    await evaluate("window.__wordFlightProbe.arm(0, 'attack')");
    await type(attack.slice(0, 2));
    await type(attack[2] === "z" ? "x" : "z");
    await sleep(220);
    await press("Backspace");
    await type(attack.slice(1));
    const attackAt = lastKeyAt;
    await sleep(850);
    const attackTravel = await evaluate("window.__wordFlightProbe.result()");
    const defence = await evaluate("window.__ic.words().slots[2].text");
    if (!defence) throw new Error("No defence word");
    await evaluate("window.__wordFlightProbe.arm(2, 'defence')");
    await type(defence);
    const defenceAt = lastKeyAt;
    await sleep(900);
    const defenceTravel = await evaluate("window.__wordFlightProbe.result()");
    const after = await evaluate("window.__ic.world().casts.resolved");
    const wrongKeys = await evaluate("window.__ic.world().stats.wrongKeys") - wrongBefore;
    if (after - before < 2) throw new Error("The attack/defence did not both resolve");
    if (wrongKeys < 1) throw new Error("The deliberate error was not recorded");
    await send("Page.stopScreencast");
    await sleep(150);
    const clip = recording;
    recording = null;
    if (clip.frames.length < 10) throw new Error("Too few capture frames");
    const list = join(dir, "frames.ffconcat");
    writeFileSync(list, "ffconcat version 1.0\n" + clip.frames.map((frame, i) =>
      `file '${frame.file}'\nduration ${Math.max(1 / 240, (clip.frames[i + 1]?.time ?? frame.time + 1 / 60) - frame.time)}\n`).join(""));
    const video = join(out, `word-fx-${width}x${height}.mp4`);
    const encoded = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-safe", "0", "-f", "concat", "-i", list, "-vf", "fps=60", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], { stdio: "inherit" });
    if (encoded.status !== 0) throw new Error("ffmpeg failed; raw frames preserved");
    if (["406", "406b", "413"].includes(ticket)) {
      const magick = "/opt/homebrew/bin/magick";
      for (const [name, at] of [["attack", attackAt], ["defence", defenceAt]]) {
        const tiles = [];
        for (const [i, offset] of [-.08, 0, .08, .16, .28, .42, .56, .7].entries()) {
          const frame = clip.frames.reduce((best, frame) => Math.abs(frame.time - at - offset) < Math.abs(best.time - at - offset) ? frame : best);
          const tile = join(dir, `${name}-tile-${i}.png`);
          const result = spawnSync(magick, [frame.file, "-crop", `${width}x240+0+${height-240}`, "+repage", "-resize", "640x", "-background", "#0B0F16", "-fill", "#E5D9BC", "-font", "/System/Library/Fonts/Supplemental/Arial.ttf", "-gravity", "South", "-splice", "0x22", "-pointsize", "13", "-annotate", "+0+4", `${name} · ${Math.round((frame.time-at)*1000)} ms`, tile], { stdio:"inherit" });
          if (result.status !== 0) throw new Error("Frame tile failed; raw frames preserved");
          tiles.push(tile);
        }
        const result = spawnSync(magick, ["montage", ...tiles, "-tile", "2x", "-geometry", "+4+4", "-background", "#0B0F16", join(out, `${name}-${width}x${height}-strip.jpg`)], { stdio:"inherit" });
        if (result.status !== 0) throw new Error("Frame strip failed; raw frames preserved");
      }
    }
    const perf = await evaluate("window.__ic.perf()");
    const failures = [];
    for (const travel of [attackTravel, defenceTravel]) {
      if (!travel?.samples || !travel.perGlyphPeakPx.length || travel.perGlyphPeakPx.some(px => px <= 0)) failures.push(`missing ${travel?.direction ?? "word"} travel samples`);
    }
    if (/swiftshader|llvmpipe/i.test(perf.gpu)) failures.push("software GPU capture");
    if (!perf.keys || !perf.casts) failures.push("missing latency samples");
    if (perf.keyLatencyMaxMs > 50 || perf.castLatencyMaxMs > 50) failures.push("key/Cast latency exceeds 50 ms");
    acceptanceFailures.push(...failures.map(problem => ({ width, height, problem })));
    const metrics = { width, height, attack, defence, wrongKeys, casts: after - before, frames: clip.frames.length, perf, failures,
      travelPx: { attack: attackTravel, defence: defenceTravel },
      captureFps: (clip.frames.length - 1) / (clip.frames.at(-1).time - clip.frames[0].time),
      note: "CDP variable frame timestamps preserved; 60 fps encoding may duplicate frames. Preflight only." };
    writeFileSync(join(out, `word-fx-${width}x${height}.json`), JSON.stringify(metrics, null, 2));
    // Only this run's raw frames; keep them if either prune check fails.
    const prune = join(repo, "tools/capture-prune/prune.mjs");
    for (const flags of [[], ["--apply"]]) {
      const result = spawnSync(process.execPath, [prune, dir, "--min-age-min", "0", ...flags], { cwd: repo, stdio: "inherit" });
      if (result.status !== 0) throw new Error("Capture pruning failed");
    }
  }
  if (acceptanceFailures.length) throw new Error(JSON.stringify(acceptanceFailures));
} finally {
  socket?.close();
  browser.kill();
  await sleep(800);
  rmSync(profile, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [join(repo, "scripts/review-index.mjs")], { cwd: repo, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = 1;
}
