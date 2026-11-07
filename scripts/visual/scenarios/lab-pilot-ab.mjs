// Run only through src/kit/tools/cdp-run.mjs, outside the Codex sandbox.
// 60 Hz simulation; every second tick becomes one 30 fps video frame. No wall-clock recording.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const REVIEW = resolve(REPO, "../typing-game-review");
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ACTION = 12;
const TICKS = 180;
const VIEWS = ["play", "close"];
const MIN_SHARE = 0.005;
export const SCENES = [
  {
    id: "TP", source: "pillar-thunder-single", element: "thunder", views: ["play", "caster"],
    trigger: "window.__lab.showcase('pillar-thunder-single')",
    // Seven letters at 120 WPM: six intervals after the first key, then the unchanged clip clocks.
    samples: [[12, "word start"], [18, "charge"], [30, "charge"], [42, "charge"],
      [48, "last letter window"], [50, "release window"], [52, "seal erosion"],
      [58, "ring peak"], [64, "seal tail"], [78, "impact window"], [108, "impact tail"], [178, "aftermath"]],
  },
  {
    id: "P1", source: "boss-entrance-vortex", kit: "boss", element: "metal", greybox: true, ticks: 360, probeTicks: 120,
    trigger: "window.__lab.twinPearl.boss()",
    // An entrance has no typed charge or projectile travel; do not invent those phases.
    samples: [[0, "charge: n/a"], [10, "before entrance"], [14, "release"], [18, "release"],
      [24, "travel: n/a"], [32, "opening"], [44, "opening"], [60, "hold"],
      [100, "hold"], [132, "baseline peak window"], [240, "decay"], [358, "aftermath"]],
  },
  {
    id: "P2", source: "blood-ring-burst", kit: "blood", element: "blood", probeTicks: 6,
    // Real Blood K1 release hook, including its ring under the caster's feet.
    trigger: "window.__lab.cast('k1', 0, -6)",
    samples: [[0, "before cast"], [10, "before release"], [12, "release"], [16, "ring attack"],
      [18, "ring peak window"], [24, "impact"], [32, "ring tail"], [44, "ring tail"],
      [68, "decay"], [100, "aftermath"], [138, "aftermath"], [178, "aftermath"]],
  },
  {
    id: "P3", source: "fire-comet", kit: "fire", element: "fire",
    trigger: "window.__lab.type('km')",
    // km has 2 letters at 120 WPM: release after about 7 ticks, first landing 0.45 s later.
    // This is the opening 3 s of the shower (the full shower lasts over 6 s).
    samples: [[14, "charge"], [16, "charge"], [20, "release"], [24, "release"],
      [30, "travel"], [38, "travel"], [46, "impact window"], [52, "impact window"],
      [64, "first impact tail"], [90, "tail + later falls"], [132, "tail + later falls"], [178, "tail + later falls"]],
  },
  {
    id: "P4", source: "beast-hit-spark-burst", kit: "beast", element: "metal", ticks: 360, probeTicks: 216,
    // Exactly one non-directional light hit through herd.hit + the shared impact bus.
    trigger: "window.__lab.hit()",
    samples: [[0, "charge: n/a"], [10, "before release"], [12, "release"], [14, "travel / hit bucket"],
      [18, "impact"], [24, "impact"], [32, "impact"], [44, "impact tail"],
      [100, "baseline rise"], [226, "baseline peak window"], [280, "baseline decay"], [358, "aftermath"]],
  },
];

// RGB screenshots, display luminance in 0..255. The optional same-frame hidden-source
// image excludes unrelated animation/lighting; the pre-trigger difference is always required.
export function measureDifference(before, current, width, height, hidden) {
  const length = width * height * 3;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      before.length !== length || current.length !== length || (hidden && hidden.length !== length)) {
    throw new Error("Kích thước ảnh RGB không khớp");
  }
  let pixels = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
  const delta = (a, b, i) => Math.abs(0.2126 * (a[i] - b[i]) + 0.7152 * (a[i + 1] - b[i + 1]) + 0.0722 * (a[i + 2] - b[i + 2]));
  for (let i = 0; i < length; i += 3) {
    if (delta(current, before, i) <= 8 || (hidden && delta(current, hidden, i) <= 8)) continue;
    const p = i / 3, x = p % width, y = Math.floor(p / width);
    pixels++;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { pixels, share: pixels / (width * height), threshold255: 8,
    bounds: pixels ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null };
}

function requireCoverage(measurement) {
  if (measurement.share < MIN_SHARE) throw new Error(`Hiệu ứng ngoài khung hoặc quá nhỏ: ${(100 * measurement.share).toFixed(4)}% < 0,5%`);
}

function hash(text) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n || 1;
}

function note(folder, purpose) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "ABOUT.md"), `purpose: ${purpose}\nmade-by: Codex · lab-pilot-ab\ndoc: docs/codex-queue/lanePilot-report.md\ndelete-when: Anh đã xem và đã chấm xong thử nghiệm pilot\n`);
}

// Install before application imports: seed unowned Math.random users and track detached video elements.
// The lab's own seeded streams are retained; each A/B page starts from their same built-in seeds.
export function bootstrap(seed) {
  return `(() => {
    let state = ${seed};
    window.__pilotReseed = () => { state = ${seed}; };
    Math.random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
    window.__pilotVideos = [];
    const handles = new WeakMap();
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback;
    const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    if (request && cancel) {
      HTMLVideoElement.prototype.requestVideoFrameCallback = function (fn) {
        let set = handles.get(this);
        if (!set) { set = new Set(); handles.set(this, set); }
        const id = request.call(this, (...args) => { set.delete(id); fn(...args); });
        set.add(id);
        return id;
      };
      HTMLVideoElement.prototype.cancelVideoFrameCallback = function (id) {
        handles.get(this)?.delete(id);
        return cancel.call(this, id);
      };
    }
    window.__pilotDecoded = v => (handles.get(v)?.size ?? 0) === 0;
    const create = document.createElement.bind(document);
    document.createElement = function (...args) {
      const el = create(...args);
      if (String(args[0]).toLowerCase() === 'video') window.__pilotVideos.push(el);
      return el;
    };
  })()`;
}

// Preserve the current B8 flags; the only A/B difference is tp2.
export function tpUrl(base, enabled) {
  const url = new URL(base);
  if (url.pathname !== "/skills-lab.html") throw new Error("URL phải trỏ tới /skills-lab.html");
  url.searchParams.delete("tp2");
  for (const [k, v] of Object.entries({ fixed: "1", video: "0", ui: "0", bar: "0", dpr: "1", q: "high", typed: "1", wpm: "120", element: "thunder" })) url.searchParams.set(k, v);
  if (url.searchParams.get("fivephase") === "0") throw new Error("TP cần B8 fivephase bật");
  if (enabled) url.searchParams.set("tp2", "1");
  return url;
}

// Readiness must include the asynchronously loaded B8/R2 atlases, not just lab.ready.
export async function prepareTp(ev, enabled) {
  const wait = async (test, message) => {
    for (let i = 0; i < 450; i++) {
      if (await test()) return;
      await sleep(200);
    }
    throw new Error("Hết thời gian: " + message);
  };
  await wait(() => ev("!!window.__lab?.ready"), "TP lab.ready");
  if (await ev("window.__lab.element('thunder')") !== "thunder") throw new Error("Không chọn được hệ Lôi");
  await wait(async () => (await ev("window.__lab.showcase('pillar-thunder-single')"))?.played === "pillar-thunder-single", "mục Cột Lôi");
  const ids = ["thunder-charge", "thunder-release", "thunder-ribbon-loop", "thunder-impact", "thunder-ground-impact", "thunder-sparkle", "thunder-hit-affliction",
    ...(enabled ? ["thunder-caster-seal", "thunder-ring-burst"] : [])];
  await wait(async () => {
    const loaded = await ev(`${JSON.stringify(ids)}.every(id => window.__lab.fxShowNamed('flipbook-' + id, true) > 0)`);
    if (!loaded) await ev("window.__lab.step(15, 1/60)");
    return loaded;
  }, "atlas B8/tp2");
  await wait(() => ev("window.__pilotVideos.every(v => !v.getAttribute('src') || (!v.seeking && v.readyState >= 2 && window.__pilotDecoded(v)))"), "video Cột Lôi");
}

export default async function (page) {
  const base = process.env.URL ?? process.env.BASE ?? "http://127.0.0.1:3146/skills-lab.html";
  const out = resolve(process.env.OUT_DIR ?? join(REVIEW, "captures/tu-tien/pilot-ab-v3"));
  const reviewRoot = resolve(process.env.REVIEW_ROOT ?? REVIEW);
  const magick = process.env.ART_MAGICK ?? "/opt/homebrew/bin/magick";
  const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
  const seedText = process.env.SEED ?? "711";
  const seed = hash(seedText);
  const requested = [...new Set((process.env.EFFECTS ?? "P1,P2,P3,P4").split(",").map((s) => s.trim()))];
  if (requested.some((id) => !["P1", "P2", "P3", "P4", "TP"].includes(id))) throw new Error("EFFECTS: chỉ nhận P1,P2,P3,P4,TP");
  if (new URL(base).pathname !== "/skills-lab.html") throw new Error("URL phải trỏ tới /skills-lab.html");
  if (!existsSync(FONT)) throw new Error("Thiếu font Arial: " + FONT);
  if (existsSync(join(out, "pilot-ab.json")) || existsSync(join(out, "_private"))) {
    throw new Error("OUT_DIR đã có kết quả; dùng OUT_DIR mới để giữ nguyên lần quay trước.");
  }
  await run(ffmpeg, ["-version"]);
  await run(magick, ["-version"]);
  await page.viewport(1920, 1080, 1);
  note(out, "Quay mù X/Y nguồn pilot trong lab, 1080p, đồng hồ cố định 60 Hz");
  const privateDir = join(out, "_private");
  note(privateDir, "Khóa và bằng chứng kỹ thuật; không gửi thư mục này cho giám khảo");
  const key = { seed: seedText, randomSeed: seed, scenes: {} };
  const result = { seed: seedText, width: 1920, height: 1080, dpr: 1, hz: 60, fps: 30, seconds: 3,
    secondsByScene: Object.fromEntries(SCENES.map((s) => [s.id, (s.ticks ?? TICKS) / 60])),
    silent: true, views: VIEWS, scenes: [], note: "Video hình ảnh không thu âm; P1/P4 quay 6 giây, P2/P3/TP quay 3 giây. P3 chỉ là đầu mưa sao băng. Nhãn pha là mốc kịch bản, chưa được kiểm bằng trình duyệt." };
  const evidence = {};
  let preloadId;
  const ev = async (expression) => {
    const value = await page.eval(expression);
    if (value?.evalError) throw new Error(value.evalError);
    return value;
  };
  const save = () => {
    writeFileSync(join(out, "pilot-ab.json"), JSON.stringify(result, null, 2) + "\n");
    writeFileSync(join(privateDir, "key.json"), JSON.stringify(key, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(join(privateDir, "evidence.json"), JSON.stringify({ ...evidence, logs: page.logs, exceptions: page.exceptions }, null, 2) + "\n", { mode: 0o600 });
  };
  async function until(test, description, timeout = 90_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await test()) return;
      await sleep(200);
    }
    throw new Error("Hết thời gian: " + description);
  }
  async function settleVideos() {
    // VideoTexture uses detached <video>s. Wait for decode without advancing the simulation.
    await ev(`Promise.all(window.__pilotVideos.filter(v => v.getAttribute('src')).map(v => new Promise((ok, fail) => {
      const timer = setTimeout(() => { clearInterval(poll); fail(new Error('Video chưa giải mã')); }, 15000);
      const poll = setInterval(() => {
        if (v.error) { clearInterval(poll); clearTimeout(timer); fail(new Error(v.error.message)); }
        else if (!v.seeking && v.readyState >= 2 && window.__pilotDecoded(v)) { clearInterval(poll); clearTimeout(timer); ok(true); }
      }, 10);
    })))`);
    // abSettle renders view.render(0) even on a page without an AB scene: no extra simulation tick.
    await ev("window.__lab.abSettle()");
  }
  async function reset() {
    await ev("window.__pilotReseed(); window.__lab.reset(); window.__lab.setHerd('still'); window.__lab.setTyped(true); window.__lab.setWpm(120); window.__lab.camera('play'); window.__lab.step(30, 1/60)");
  }
  const drawn = (scene) => ev(scene.id === "P3"
    ? `(() => {
        const head = window.__lab.meteor()?.head ?? '';
        return head.startsWith('fire-comet') && window.__lab.fxNamed().some(m => m.count > 0 && ['flipbook-fire-comet', 'flipbook-comet-video'].includes(m.name));
      })()`
    : `window.__lab.fxNamed().some(m => m.count > 0 && m.name === ${JSON.stringify("flipbook-" + scene.source)})`);

  const cameras = {};
  async function pixels(file) {
    const { stdout } = await run(magick, [file, "-alpha", "off", "-depth", "8", "rgb:-"], { encoding: "buffer", maxBuffer: 1920 * 1080 * 3 + 4096 });
    return stdout;
  }
  async function sourceHidden(scene, file) {
    const prefix = JSON.stringify("flipbook-" + scene.source);
    await ev(`window.__lab.fxShowNamed(${prefix}, false)`);
    try { await page.shot(file); return await pixels(file); }
    finally { await ev(`window.__lab.fxShowNamed(${prefix}, true)`); }
  }
  async function capture(scene, pilot, label, folder, viewName) {
    const ticks = scene.ticks ?? TICKS;
    if (preloadId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
    const installed = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap(hash(seedText + ":" + scene.id)) });
    preloadId = installed.identifier;
    // Discard inherited query flags so A and B differ only by pilot=1.
    const url = new URL(base);
    url.search = "";
    for (const [k, v] of Object.entries({ fixed: "1", video: "0", ui: "0", bar: "0", dpr: "1", q: "high", herd: "still", typed: "1", wpm: "120", element: scene.element,
      ...(scene.greybox ? { key2: "twin-pearl" } : {}), ...(pilot ? { pilot: "1" } : {}) })) url.searchParams.set(k, v);
    const logStart = page.logs.length;
    const exceptionStart = page.exceptions.length;
    await page.goto(url.href);
    await until(() => ev("!!window.__lab?.ready"), scene.id + " lab.ready");
    if (await ev(`window.__lab.element(${JSON.stringify(scene.element)})`) !== scene.element) throw new Error("Không chọn được hệ " + scene.element);
    if (scene.greybox && !(await ev("!!window.__lab.twinPearl"))) throw new Error("Thiếu twinPearl.boss");

    if (scene.id === "P3") await until(() => ev("!!window.__lab.five()?.ready"), "five-phase Fire chưa nạp xong");
    // First load the real source. Then repeat one fixed probe after reset on both pages:
    // a hit emitted before its asynchronous atlas loaded may have been discarded.
    await reset();
    await ev(scene.trigger);
    await ev(`window.__lab.step(${scene.id === "P3" ? 30 : 12}, 1/60)`);
    await until(() => ev(`window.__lab.fxShowNamed(${JSON.stringify("flipbook-" + scene.source)}, true) > 0`), scene.id + " chưa nạp pool " + scene.source);
    await until(() => ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}]?.loaded === true`), scene.id + " atlas chưa nạp");
    await settleVideos();
    await reset();
    await ev(scene.trigger);
    await ev(`window.__lab.step(${scene.probeTicks ?? 30}, 1/60)`);
    await settleVideos();
    const raw = mkdtempSync(join(out, "raw-" + scene.id + "-" + viewName + "-" + label + "-"));
    note(raw, "Khung thô riêng của lần quay này; tự dọn sau khi xuất video và bằng chứng");
    const details = { url: url.href, view: viewName, raw, coverage: { minimumShare: MIN_SHARE, frames: [], peak: { pixels: 0, share: 0, tick: null } } };
    evidence[scene.id][viewName][label] = details;
    save();
    try {
      const cameraKey = scene.id + ":" + viewName;
      if (!cameras[cameraKey]) {
        if (pilot) throw new Error("Bản gốc chưa có tư thế camera hợp lệ: " + cameraKey);
        // Probe the actual source instance, not a guessed gate/field/monster coordinate.
        // The first meteor is already in flight at this warm-up frame; P4 is on its struck beast.
        const instances = await ev(`window.__lab.fxInstances(${JSON.stringify("flipbook-" + scene.source)})`);
        const anchor = instances.sort((a, b) => b.sizeM - a.sizeM)[0];
        if (!anchor) throw new Error(scene.id + " không có vị trí hiệu ứng sống để đặt camera");
        const fit = await ev("window.__lab.captureCamera()");
        const target = { x: anchor.x, y: anchor.y, z: anchor.z, distanceM: viewName === "play" ? fit.distanceM : Math.max(3, anchor.sizeM / (2 * Math.tan(fit.fov * Math.PI / 360) * 0.48)) };
        if (viewName === "play" && scene.id !== "P3") {
          // Keep the actual play frame; only the diagnostic close view follows the source.
          target.x = fit.position[0];
          target.y = fit.position[1] - fit.distanceM * Math.sin(55 * Math.PI / 180);
          target.z = fit.position[2] - fit.distanceM * Math.cos(55 * Math.PI / 180);
        }
        if (viewName === "close") {
          // Refine using the source's real pixels (transparent atlas margins are not its main shape).
          for (let attempt = 0; attempt < 5; attempt++) {
            await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
            const preview = join(raw, "camera-preview.png");
            await page.shot(preview);
            const current = await pixels(preview);
            const hidden = await sourceHidden(scene, join(raw, "camera-hidden.png"));
            const measure = measureDifference(hidden, current, 1920, 1080);
            const heightShare = (measure.bounds?.height ?? 0) / 1080;
            details.calibration = { ...measure, heightShare, attempt };
            if (heightShare >= 0.35 && heightShare <= 0.60) break;
            if (heightShare === 0) throw new Error(scene.id + " không thấy pixel nguồn khi căn cận cảnh");
            const screenHeightM = 2 * target.distanceM * Math.tan(fit.fov * Math.PI / 360);
            const upM = (0.5 - (measure.bounds.y + measure.bounds.height / 2) / 1080) * screenHeightM;
            target.x += ((measure.bounds.x + measure.bounds.width / 2) / 1920 - 0.5) * screenHeightM * 1920 / 1080;
            target.y += upM * Math.cos(55 * Math.PI / 180);
            target.z -= upM * Math.sin(55 * Math.PI / 180);
            target.distanceM *= heightShare / 0.48;
            if (attempt === 4) throw new Error(scene.id + " không căn được hình chính vào 35–60% chiều cao");
          }
        }
        cameras[cameraKey] = target;
      }
      const target = cameras[cameraKey];
      await reset();
      const pose = await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
      details.camera = { target, ...pose };
      const framing = await ev("window.__lab.framing()");
      const beforePlays = await ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}].plays`);
      const beforeFile = join(raw, "before-trigger.png");
      let before;
      save();
      const samples = new Map(scene.samples);
      const tiles = [];
      let sawSource = false;
      let sawPilotMedia = !pilot;
      for (let tick = 0; tick < ticks; tick++) {
        if (tick === ACTION) {
          await settleVideos();
          await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
          await page.shot(beforeFile);
          before = await pixels(beforeFile);
          details.triggerResult = await ev(scene.trigger);
          if (scene.id === "P4" && !Number.isInteger(details.triggerResult?.target)) throw new Error("P4 chưa phát được đòn nhẹ đơn lẻ");
        }
        if (tick % 2 === 0) {
          await settleVideos();
          // Freeze exactly the same pose for X and Y, including during camera-kick frames.
          await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
          const file = join(raw, "f" + String(tick / 2).padStart(4, "0") + ".png");
          await page.shot(file);
          const sourceLive = (await drawn(scene)) && await ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}].plays > ${beforePlays}`);
          sawSource ||= sourceLive;
          if (tick >= ACTION) {
            const measurement = sourceLive
              ? measureDifference(before, await pixels(file), 1920, 1080, await sourceHidden(scene, join(raw, "source-hidden.png")))
              : { pixels: 0, share: 0, threshold255: 8, bounds: null };
            const record = { tick, ...measurement };
            details.coverage.frames.push(record);
            if (measurement.share > details.coverage.peak.share) details.coverage.peak = record;
          }
          if (pilot && !sawPilotMedia) sawPilotMedia = await ev(`(() => {
            const s = window.__lab.pilotStatus()[${JSON.stringify(scene.source)}];
            const root = ${JSON.stringify("/vfx-pilot-2026-11-07/" + scene.kit + "/")};
            return s.override && s.loaded && s.plays > ${beforePlays} && s.atlasUrl?.includes(root) && s.textureUrl?.includes(root);
          })()`);
          if (samples.has(tick)) tiles.push([file, `${label} · ${samples.get(tick)} · ${(tick / 60).toFixed(2)} s`]);
        }
        // Keep each tick separate: video seeks finish before the next tick changes their target time.
        await ev("window.__lab.step(1, 1/60)");
        await settleVideos();
      }
      Object.assign(details, { framing, sourceDrawn: sawSource, pilotSourceVerified: sawPilotMedia,
        pilotStatus: await ev("window.__lab.pilotStatus()"), warnings: page.logs.slice(logStart),
        five: await ev("window.__lab.five()"), meteor: await ev("window.__lab.meteor()"), channel: await ev("window.__lab.channel()") });
      save(); // Coverage survives every failure, including an empty/off-screen source.
      requireCoverage(details.coverage.peak);
      if (!sawSource || !sawPilotMedia || tiles.length !== 12) throw new Error("Thiếu nguồn/nguồn pilot/12 khung: " + scene.id + "; " + JSON.stringify(await ev("window.__lab.pilotStatus()")));
      const warnings = page.logs.slice(logStart);
      if (warnings.some((s) => /\[pilot\]/i.test(s)) || page.exceptions.length > exceptionStart) throw new Error("Có lỗi pilot hoặc ngoại lệ; xem _private/evidence.json");
      const mp4 = join(folder, label + ".mp4");
      const sheet = join(folder, label + "-sheet.jpg");
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-framerate", "30", "-i", join(raw, "f%04d.png"), "-frames:v", String(ticks / 2), "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
      const args = ["montage", "-font", FONT, "-pointsize", "18", "-background", "#11151c", "-fill", "#e6e9ef"];
      for (const [file, caption] of tiles) args.push("-label", caption, file);
      args.push("-tile", "4x3", "-geometry", "480x270+4+4", "-quality", "92", sheet);
      await run(magick, args);
      return { mp4, sheet };
    } finally {
      // Keep only the pre-trigger and measured peak, even when the visibility gate fails.
      const peakTick = details.coverage.peak.tick;
      for (const [name, source] of [["before", "before-trigger.png"],
        ["peak", peakTick === null ? "camera-preview.png" : "f" + String(peakTick / 2).padStart(4, "0") + ".png"]]) {
        if (!existsSync(join(raw, source))) continue;
        const destination = join(privateDir, `${scene.id}-${viewName}-${label}-${name}.png`);
        copyFileSync(join(raw, source), destination);
        details[name + "Frame"] = destination;
      }
      save();
      const prune = [join(REPO, "tools/capture-prune/prune.mjs"), raw, "--min-age-min", "0", "--review-root", reviewRoot];
      await run(process.execPath, prune); // Dry run limited to this invocation's mkdtemp folder.
      await run(process.execPath, [...prune, "--apply"]);
      if (readdirSync(raw).some((name) => /\.png$/i.test(name))) throw new Error("Prune giữ lại khung thô: " + raw);
      rmSync(raw, { recursive: true });
    }
  }

  async function captureTp(scene, enabled, label, folder, viewName) {
    if (preloadId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
    preloadId = (await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap(hash(seedText + ":TP")) })).identifier;
    const url = tpUrl(base, enabled);
    const logStart = page.logs.length, exceptionStart = page.exceptions.length;
    await page.goto(url.href);
    await prepareTp(ev, enabled);
    await reset();
    await ev(scene.trigger);
    await ev("window.__lab.step(180, 1/60)");
    await settleVideos();
    await reset();
    const raw = mkdtempSync(join(out, `raw-TP-${viewName}-${label}-`));
    note(raw, "Khung TP tạm của lần quay này; giữ trước/đỉnh và dọn sau xuất");
    const details = { url: url.href, view: viewName, releaseTick: null, coverage: { minimumShare: MIN_SHARE, frames: [], peak: { share: 0, tick: null } } };
    evidence.TP[viewName][label] = details;
    const poseKey = "TP:" + viewName;
    try {
      const caster = await ev("window.__lab.caster()");
      if (!cameras[poseKey]) {
        if (enabled) throw new Error("Chưa có camera A cho TP");
        const fit = await ev("window.__lab.captureCamera()");
        // The play pose is the unmodified lab play camera, frozen against kicks.
        const target = { x: 0, y: 0, z: 0, distanceM: fit.distanceM };
        // Recover the actual play target from the camera pose and the fixed 55-degree tilt.
        target.x = fit.position[0];
        target.y = fit.position[1] - fit.distanceM * Math.sin(55 * Math.PI / 180);
        target.z = fit.position[2] - fit.distanceM * Math.cos(55 * Math.PI / 180);
        if (viewName === "caster") {
          Object.assign(target, { x: caster.x, y: 0.9, z: caster.z, distanceM: 6 });
          let calibrated = false;
          for (let attempt = 0; attempt < 6; attempt++) {
            await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
            const preview = join(raw, "camera-preview.png"), hiddenFile = join(raw, "actors-hidden.png");
            await page.shot(preview);
            await ev("window.__lab.debugShow('actors', false)");
            try { await page.shot(hiddenFile); }
            finally { await ev("window.__lab.debugShow('actors', true)"); }
            const visible = await pixels(preview), hidden = await pixels(hiddenFile);
            const chest = await ev(`window.__lab.project(${caster.x}, 0.9, ${caster.z})`);
            // Select the connected actor silhouette nearest the caster's chest; excludes distant beasts.
            const mask = new Uint8Array(1920 * 1080);
            for (let i = 0; i < mask.length; i++) {
              const k = i * 3;
              mask[i] = Math.abs(0.2126 * (visible[k] - hidden[k]) + 0.7152 * (visible[k+1] - hidden[k+1]) + 0.0722 * (visible[k+2] - hidden[k+2])) > 8 ? 1 : 0;
            }
            let start = -1, nearest = Infinity;
            for (let i = 0; i < mask.length; i++) if (mask[i]) {
              const d = (i % 1920 - chest.x) ** 2 + (Math.floor(i / 1920) - chest.y) ** 2;
              if (d < nearest) { nearest = d; start = i; }
            }
            if (start < 0 || nearest > 120 ** 2) throw new Error("Không tìm thấy thân người tung");
            const queue = [start]; mask[start] = 0;
            let y0 = 1080, y1 = 0;
            for (let i = 0; i < queue.length; i++) {
              const p = queue[i], x = p % 1920, y = Math.floor(p / 1920);
              y0 = Math.min(y0, y); y1 = Math.max(y1, y);
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy, n = ny * 1920 + nx;
                if (nx >= 0 && nx < 1920 && ny >= 0 && ny < 1080 && mask[n]) { mask[n] = 0; queue.push(n); }
              }
            }
            const heightShare = (y1 - y0 + 1) / 1080;
            details.calibration = { heightShare, y0, y1, pixels: queue.length, attempt };
            if (heightShare >= 0.35 && heightShare <= 0.50 && y0 > 0 && y1 < 1079) { calibrated = true; break; }
            target.distanceM *= heightShare / 0.425;
          }
          if (!calibrated) throw new Error("Người tung chưa đạt 35–50% chiều cao");
        }
        cameras[poseKey] = target;
      }
      const target = cameras[poseKey];
      details.camera = target;
      await reset();
      await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
      const beforeFile = join(raw, "before-trigger.png");
      let before, castReport, sawB8 = false, sawR2 = !enabled;
      const tiles = [], samples = new Map(scene.samples);
      for (let tick = 0; tick < TICKS; tick++) {
        if (tick === ACTION) {
          await settleVideos();
          await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
          await page.shot(beforeFile); before = await pixels(beforeFile);
          if ((await ev(scene.trigger))?.played !== scene.source) throw new Error("Không tung được Cột Lôi");
          if (!await ev("window.__lab.typing()")) throw new Error("TP thiếu từ đang gõ");
        }
        if (tick > ACTION && details.releaseTick === null && !await ev("window.__lab.typing()")) details.releaseTick = tick;
        if (tick % 2 === 0) {
          await settleVideos();
          await ev(`window.__lab.captureCamera(${JSON.stringify(target)})`);
          const file = join(raw, "f" + String(tick / 2).padStart(4, "0") + ".png");
          await page.shot(file);
          if (tick >= ACTION) {
            const current = await pixels(file), hiddenFile = join(raw, "fx-hidden.png");
            await ev("window.__lab.debugShow('fx', false)");
            try { await page.shot(hiddenFile); }
            finally { await ev("window.__lab.debugShow('fx', true)"); }
            const measurement = { tick, ...measureDifference(before, current, 1920, 1080, await pixels(hiddenFile)) };
            details.coverage.frames.push(measurement);
            if (measurement.share > details.coverage.peak.share) details.coverage.peak = measurement;
            castReport = await ev("window.__lab.clipSkill(8)");
            sawB8 ||= (await ev("window.__lab.fxInstances('flipbook-thunder-release')")).length > 0;
            if (enabled && !sawR2) sawR2 = (await ev("window.__lab.fxInstances('flipbook-thunder-caster-seal')")).length > 0;
            if (viewName === "play") {
              const anchors = await ev("window.__lab.fxInstances('flipbook-thunder-ground-impact')");
              if (anchors.length) {
                details.impactInstances = anchors;
                for (const a of anchors) {
                  const point = await ev(`window.__lab.project(${a.x}, ${a.y}, ${a.z})`);
                  if (point.x < 24 || point.x > 1896 || point.y < 24 || point.y > 1056) throw new Error("Điểm giáng ngoài khung camera chơi");
                }
              }
            }
          }
          if (samples.has(tick)) tiles.push([file, `${label} · ${samples.get(tick)} · t=${(tick / 60).toFixed(2)} s`]);
        }
        await ev("window.__lab.step(1, 1/60)");
        await settleVideos();
      }
      details.cast = castReport;
      Object.assign(details, { sourceDrawn: sawB8, r2SourceVerified: sawR2 });
      if (!sawB8 || !sawR2) throw new Error("Thiếu pixel nguồn B8 hoặc tp2");
      const casterTop = new URL(base).searchParams.get("hero") === "human" ? 1.65 : 1.75;
      for (const y of [0, casterTop]) {
        const p = await ev(`window.__lab.project(${caster.x}, ${y}, ${caster.z})`);
        if (p.x < 24 || p.x > 1896 || p.y < 24 || p.y > 1056) throw new Error("Người tung ngoài khung");
      }
      details.warnings = page.logs.slice(logStart);
      requireCoverage(details.coverage.peak);
      if (viewName === "play") {
        if (!details.impactInstances?.length) throw new Error("Không tìm được điểm giáng trong camera chơi");
        // Validate the target at the measured peak, retained below, rather than silently zooming the play camera.
        const peak = details.coverage.peak.bounds;
        if (!peak || peak.x <= 0 || peak.y <= 0 || peak.x + peak.width >= 1920 || peak.y + peak.height >= 1080) throw new Error("Đỉnh hiệu ứng chạm mép camera chơi");
      }
      if (details.releaseTick === null || tiles.length !== 12 || castReport?.id !== scene.source || castReport.blows < 1) throw new Error("Thiếu khung phóng, 12 khung hoặc điểm giáng Cột Lôi");
      if (page.exceptions.length > exceptionStart || details.warnings.some(s => /\[(five-phase-clip|thunder-caster-r2)\]/i.test(s))) throw new Error("Lỗi TP; xem bằng chứng riêng");
      await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-framerate", "30", "-i", join(raw, "f%04d.png"), "-frames:v", "90", "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(folder, label + ".mp4")]);
      const args = ["montage", "-font", FONT, "-pointsize", "18", "-background", "#11151c", "-fill", "#e6e9ef"];
      for (const [file, caption] of tiles) args.push("-label", caption, file);
      await run(magick, [...args, "-tile", "4x3", "-geometry", "480x270+4+4", "-quality", "92", join(folder, label + "-sheet.jpg")]);
    } finally {
      for (const [name, source] of [["before", "before-trigger.png"], ["peak", details.coverage.peak.tick === null ? "camera-preview.png" : "f" + String(details.coverage.peak.tick / 2).padStart(4, "0") + ".png"]]) {
        if (existsSync(join(raw, source))) copyFileSync(join(raw, source), join(privateDir, `TP-${viewName}-${label}-${name}.png`));
      }
      save();
      const prune = [join(REPO, "tools/capture-prune/prune.mjs"), raw, "--min-age-min", "0", "--review-root", reviewRoot];
      await run(process.execPath, prune);
      await run(process.execPath, [...prune, "--apply"]);
      if (readdirSync(raw).some(name => /\.png$/i.test(name))) throw new Error("Prune giữ khung TP: " + raw);
      rmSync(raw, { recursive: true });
    }
  }

  try {
    for (const id of requested) {
      const scene = SCENES.find((s) => s.id === id);
      const folder = join(out, id);
      note(folder, `${id}: tấm 12 khung 4 × 3 và video mù X/Y, không chứa khóa`);
      const xIsPilot = (hash(seedText + ":blind:" + id) & 1) === 1;
      const variant = scene.id === "TP" ? "B: tp2=1" : "B: pilot=1";
      key.scenes[id] = { X: xIsPilot ? variant : "A: baseline", Y: xIsPilot ? "A: baseline" : variant };
      const row = { id, source: scene.source, seconds: (scene.ticks ?? TICKS) / 60, ...(scene.views ? { views: scene.views } : {}), status: "running", files: [] };
      result.scenes.push(row);
      evidence[id] = {};
      save();
      try {
        for (const viewName of scene.views ?? VIEWS) {
          const viewFolder = join(folder, viewName);
          note(viewFolder, `${id}: góc ${viewName}, cùng camera cho X/Y`);
          evidence[id][viewName] = {};
          // Baseline fixes the pose once; pilot reuses it verbatim, never reframes to flatter Y.
          for (const pilot of [false, true]) {
            const label = pilot === xIsPilot ? "X" : "Y";
            try {
              await (id === "TP" ? captureTp : capture)(scene, pilot, label, viewFolder, viewName);
              row.files.push(`${id}/${viewName}/${label}-sheet.jpg`, `${id}/${viewName}/${label}.mp4`);
            } catch (error) {
              row.status = "failed";
              (evidence[id].errors ??= []).push({ view: viewName, label, error: String(error?.stack ?? error) });
            }
            save();
          }
        }
        if (row.status !== "failed") row.status = "captured";
      } catch (error) {
        row.status = "failed";
        // Full error/URLs belong only in private evidence. Continue the other independent effects.
        evidence[id].error = String(error?.stack ?? error);
      }
      save();
    }
  } finally {
    if (preloadId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
    save();
    await run(process.execPath, [join(REPO, "scripts/review-index.mjs"), reviewRoot]);
  }
  const failed = result.scenes.filter((s) => s.status === "failed").map((s) => s.id);
  if (failed.length) throw new Error("Quay lỗi " + failed.join(", ") + "; xem " + join(privateDir, "evidence.json"));
  return { out, captured: result.scenes.filter((s) => s.status === "captured").map((s) => s.id), skipped: result.scenes.filter((s) => s.status === "skipped").map((s) => s.id), files: result.scenes.flatMap((s) => s.files ?? []) };
}

// Small offline test: no browser, game imports, ports or captures.
if (process.argv[2] === "--self-test" && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { default: assert } = await import("node:assert/strict");
  const { test } = await import("node:test");
  test("đo vùng chênh sáng RGB và ngưỡng 0,5%", () => {
    const width = 100, height = 100;
    const before = Buffer.alloc(width * height * 3, 100), frame = Buffer.from(before);
    assert.equal(measureDifference(before, frame, width, height).pixels, 0);
    for (let p = 0; p < 100; p++) frame.fill(108, p * 3, p * 3 + 3);
    assert.equal(measureDifference(before, frame, width, height).pixels, 0); // strictly > 8
    for (let p = 0; p < 49; p++) frame.fill(109, p * 3, p * 3 + 3);
    assert.throws(() => requireCoverage(measureDifference(before, frame, width, height)));
    frame.fill(109, 49 * 3, 50 * 3);
    assert.doesNotThrow(() => requireCoverage(measureDifference(before, frame, width, height)));
    assert.deepEqual(measureDifference(before, frame, width, height).bounds, { x: 0, y: 0, width: 50, height: 1 });
    const hidden = Buffer.from(frame); // unrelated moving light alone must never pass
    assert.equal(measureDifference(before, frame, width, height, hidden).pixels, 0);
    hidden.fill(100, 0, 30);
    assert.equal(measureDifference(before, frame, width, height, hidden).pixels, 10);
    const dark = Buffer.alloc(before.length, 91);
    assert.equal(measureDifference(before, dark, width, height).share, 1);
    assert.throws(() => measureDifference(before, frame, 99, height));
  });
  test("P1/P2/P4 có nguồn thật, 12 mẫu hợp lệ và đủ thời gian quay đỉnh clip cũ", () => {
    for (const id of ["P1", "P2", "P4"]) {
      const scene = SCENES.find(s => s.id === id);
      assert.equal(scene.samples.length, 12);
      assert.equal(new Set(scene.samples.map(([tick]) => tick)).size, 12);
      assert.ok(scene.samples.every(([tick]) => tick % 2 === 0 && tick >= 0 && tick < (scene.ticks ?? TICKS)));
      assert.ok(!scene.trigger.includes("channel"));
    }
    assert.equal(SCENES.find(s => s.id === "P2").trigger, "window.__lab.cast('k1', 0, -6)");
    assert.equal(SCENES.find(s => s.id === "P4").trigger, "window.__lab.hit()");
    for (const id of ["P1", "P4"]) assert.ok(SCENES.find(s => s.id === id).ticks >= 360);
    assert.equal(MIN_SHARE, 0.005);
  });
}
