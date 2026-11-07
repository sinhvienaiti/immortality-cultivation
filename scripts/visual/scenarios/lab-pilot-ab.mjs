// Run only through src/kit/tools/cdp-run.mjs, outside the Codex sandbox.
// 60 Hz simulation; every second tick becomes one 30 fps video frame. No wall-clock recording.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const REVIEW = resolve(REPO, "../typing-game-review");
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ACTION = 12;
const TICKS = 180;
const SCENES = [
  {
    id: "P1", source: "boss-entrance-vortex", kit: "boss", element: "metal", greybox: true,
    trigger: "window.__lab.twinPearl.boss()",
    // An entrance has no typed charge or projectile travel; do not invent those phases.
    samples: [[0, "charge: n/a"], [10, "before entrance"], [14, "release"], [18, "release"],
      [24, "travel: n/a"], [32, "opening"], [44, "opening"], [60, "hold"],
      [80, "decay"], [100, "aftermath"], [138, "aftermath"], [178, "aftermath"]],
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
    id: "P4", source: "beast-hit-spark-burst", kit: "beast", element: "metal",
    // auto/k1 are directional and select beast-hit-ink-streak, not this source (hitClip).
    // The existing channel API emits real non-directional light hits: 0.605 pulse, 0.22 ticks.
    trigger: "window.__lab.channel('start')",
    alternative: "Đòn nhẹ channel (C); 0/1 chọn beast-hit-ink-streak do directional=true.",
    samples: [[0, "charge: n/a"], [10, "before release"], [12, "release"], [14, "travel / hit bucket"],
      [18, "impact"], [24, "impact"], [32, "impact"], [44, "impact tail"],
      [68, "aftermath"], [100, "aftermath"], [138, "aftermath"], [178, "aftermath"]],
  },
];
const SKIPPED = {
  id: "P2", source: "blood-ring-burst", status: "skipped",
  reason: "Manifest khai báo ringBurst, nhưng CLIP_ROLES trong src/view/skills/element-clips.ts không nhận vai trò này; FIVE_RECIPES chỉ có fire. Chưa có chiêu Blood gọi đúng nguồn. Cần nối ringBurst vào chiêu và cung cấp API tung chiêu; không thay bằng phát clip rời để chấm hiệu ứng ghép.",
};

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
function bootstrap(seed) {
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

export default async function (page) {
  const base = process.env.URL ?? process.env.BASE ?? "http://127.0.0.1:3146/skills-lab.html";
  const out = resolve(process.env.OUT_DIR ?? join(REVIEW, "captures/tu-tien/pilot-ab"));
  const reviewRoot = resolve(process.env.REVIEW_ROOT ?? REVIEW);
  const magick = process.env.ART_MAGICK ?? "/opt/homebrew/bin/magick";
  const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
  const seedText = process.env.SEED ?? "711";
  const seed = hash(seedText);
  const requested = [...new Set((process.env.EFFECTS ?? "P1,P2,P3,P4").split(",").map((s) => s.trim()))];
  if (requested.some((id) => !["P1", "P2", "P3", "P4"].includes(id))) throw new Error("EFFECTS: chỉ nhận P1,P2,P3,P4");
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
    silent: true, scenes: [], note: "Video hình ảnh không thu âm; P3 chỉ là 3 giây đầu mưa sao băng. Nhãn pha là mốc kịch bản, chưa được kiểm bằng trình duyệt." };
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

  async function capture(scene, pilot, label, folder) {
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
    // One identical warm-up per page. Poll only mesh creation (the atlas is attached before the pool is added).
    // Repeated warm-up casts would consume RNG streams and age ambient motion differently between A and B.
    await reset();
    await ev(scene.trigger);
    await ev(`window.__lab.step(${scene.id === "P3" ? 30 : 12}, 1/60)`);
    await until(() => ev(`window.__lab.fxShowNamed(${JSON.stringify("flipbook-" + scene.source)}, true) > 0`), scene.id + " chưa nạp pool " + scene.source);
    await until(() => ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}]?.loaded === true`), scene.id + " atlas chưa nạp");
    await settleVideos();
    await reset();
    const beforePlays = await ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}].plays`);
    const framing = await ev("window.__lab.framing()");
    const raw = mkdtempSync(join(out, "raw-" + scene.id + "-" + label + "-"));
    note(raw, "Khung thô riêng của lần quay này; tự dọn sau khi ghép thành công");
    const samples = new Map(scene.samples);
    const tiles = [];
    let sawSource = false;
    let sawPilotMedia = !pilot;
    for (let tick = 0; tick < TICKS; tick++) {
      if (tick === ACTION) await ev(scene.trigger);
      if (tick % 2 === 0) {
        await settleVideos();
        const file = join(raw, "f" + String(tick / 2).padStart(4, "0") + ".png");
        await page.shot(file);
        sawSource ||= (await drawn(scene)) && await ev(`window.__lab.pilotStatus()[${JSON.stringify(scene.source)}].plays > ${beforePlays}`);
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
    if (!sawSource || !sawPilotMedia || tiles.length !== 12) throw new Error("Thiếu nguồn/nguồn pilot/12 khung: " + scene.id + "; " + JSON.stringify(await ev("window.__lab.pilotStatus()")));
    const warnings = page.logs.slice(logStart);
    if (warnings.some((s) => /\[pilot\]/i.test(s)) || page.exceptions.length > exceptionStart) throw new Error("Có lỗi pilot hoặc ngoại lệ; xem _private/evidence.json");
    const mp4 = join(folder, label + ".mp4");
    const sheet = join(folder, label + "-sheet.jpg");
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-framerate", "30", "-i", join(raw, "f%04d.png"), "-frames:v", "90", "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    const args = ["montage", "-font", FONT, "-pointsize", "18", "-background", "#11151c", "-fill", "#e6e9ef"];
    for (const [file, caption] of tiles) args.push("-label", caption, file);
    args.push("-tile", "4x3", "-geometry", "480x270+4+4", "-quality", "92", sheet);
    await run(magick, args);
    const prune = [join(REPO, "tools/capture-prune/prune.mjs"), raw, "--min-age-min", "0", "--review-root", reviewRoot];
    await run(process.execPath, prune); // Required dry run, restricted to this invocation's mkdtemp folder.
    await run(process.execPath, [...prune, "--apply"]);
    if (readdirSync(raw).some((name) => /\.png$/i.test(name))) throw new Error("Prune giữ lại khung thô: " + raw);
    rmSync(raw, { recursive: true });
    return { mp4, sheet, evidence: { url: url.href, framing, sourceDrawn: sawSource, pilotSourceVerified: sawPilotMedia, pilotStatus: await ev("window.__lab.pilotStatus()"), warnings,
      five: await ev("window.__lab.five()"), meteor: await ev("window.__lab.meteor()"), channel: await ev("window.__lab.channel()") } };
  }

  try {
    for (const id of requested) {
      if (id === "P2") { result.scenes.push(SKIPPED); save(); continue; }
      const scene = SCENES.find((s) => s.id === id);
      const folder = join(out, id);
      note(folder, `${id}: tấm 12 khung 4 × 3 và video mù X/Y, không chứa khóa`);
      const xIsPilot = (hash(seedText + ":blind:" + id) & 1) === 1;
      key.scenes[id] = { X: xIsPilot ? "B: pilot=1" : "A: baseline", Y: xIsPilot ? "A: baseline" : "B: pilot=1" };
      const row = { id, source: scene.source, status: "running", ...(scene.alternative ? { alternative: scene.alternative } : {}), files: [] };
      result.scenes.push(row);
      evidence[id] = {};
      save();
      const takes = {};
      try {
        // Capture A first, B second; presentation order is seeded independently.
        for (const pilot of [false, true]) {
          const label = pilot === xIsPilot ? "X" : "Y";
          const take = await capture(scene, pilot, label, folder);
          takes[label] = take;
          evidence[id][label] = take.evidence;
          row.files.push(`${id}/${label}-sheet.jpg`, `${id}/${label}.mp4`);
          save();
        }
        const pair = join(folder, "X-Y.mp4");
        await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-n", "-i", takes.X.mp4, "-i", takes.Y.mp4,
          "-filter_complex", `[0:v]scale=960:540[l];[1:v]scale=960:540[r];[l][r]hstack=inputs=2,drawtext=fontfile='${FONT}':text='X | Y':fontsize=32:fontcolor=white:box=1:boxcolor=black@0.75:x=(w-tw)/2:y=12[v]`,
          "-map", "[v]", "-an", "-frames:v", "90", "-r", "30", "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", pair]);
        row.files.push(`${id}/X-Y.mp4`);
        row.status = "captured";
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
