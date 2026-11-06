// The skills lab's memory, frame time and word-tag readability under keys 8 and 9 (lab-castable-skills, 06/11):
//   PART=memory   the player's page (no URL flags): two rounds of 20 casts (keys 8 and 9 in turn, 2 s apart, each a
//                 different clip), the Chrome processes' footprint (macOS `footprint`, GPU memory included), three's
//                 texture count, the uploaded texture bytes and the video slots after each, then after a GC.
//   PART=frames   the player's page: rAF intervals with the herd alone, then with 2 and with 3 videos playing at once.
//   PART=fallback the player's page: four casts at once (MAX_VIDEOS is 3): the fourth fetches its deferred atlas, shows
//                 it, and lets it go ATLAS_RELEASE_S after its card (showcase.ts); the atlas memory before, during, after.
//   PART=contrast ?fixed=1&ui=0: each key 8 and 9 skill cast alone, stepped to its first strike (the clip's peak), one
//                 JPEG and the stand-in word tags' spots (0.3 m over each live beast's head) per skill; scored offline
//                 by scripts/visual/tag-contrast.py.
//   BASE=http://127.0.0.1:3098/skills-lab.html PART=memory OUT=…/lab-perf/memory.json \
//   ../../.local/bin/heavy.sh --perf node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-perf-memory.mjs --width=1920 --height=1080
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 10) / 10;
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? null : s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};

/** The headless Chrome this run started (its profile is a fresh st-cdp- folder) and its helpers, by kind. */
function chromeTree() {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 1 << 24 }).split("\n");
  const procs = rows.map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], cmd: m[3] }));
  const roots = procs.filter((p) => p.cmd.includes("--remote-debugging-port=") && p.cmd.includes("st-cdp-") && !p.cmd.includes("--type="));
  const tree = [];
  const add = (pid) => {
    for (const p of procs.filter((q) => q.ppid === pid)) {
      tree.push(p);
      add(p.pid);
    }
  };
  for (const r of roots) {
    tree.push(r);
    add(r.pid);
  }
  return tree.map((p) => ({ pid: p.pid, kind: (p.cmd.match(/--type=([a-z-]+)/) ?? [, "browser"])[1] + (p.cmd.includes("--utility-sub-type=") ? ":" + p.cmd.match(/--utility-sub-type=([\w.]+)/)[1].split(".").pop() : "") }));
}

/** MB of phys_footprint per process kind (macOS `footprint`: dirty memory plus IOKit/GPU allocations). */
function footprints() {
  const tree = chromeTree();
  const out = { total: 0 };
  for (const p of tree) {
    let mb = 0;
    try {
      const text = execFileSync("footprint", ["-p", String(p.pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const m = text.match(/Footprint:\s*([\d.]+)\s*(KB|MB|GB)/);
      if (m) mb = +m[1] * (m[2] === "GB" ? 1024 : m[2] === "KB" ? 1 / 1024 : 1);
    } catch {}
    const k = p.kind === "gpu-process" ? "gpu" : p.kind;
    out[k] = r1((out[k] ?? 0) + mb);
    out.total = r1(out.total + mb);
  }
  return out;
}

async function open(page, url) {
  await page.goto(url, { settle: 1500 });
  for (let i = 0; i < 400; i += 1) {
    if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
    await sleep(250);
  }
  await sleep(3000);
  return page.eval(`(() => { const c = document.createElement("canvas").getContext("webgl2"); const x = c && c.getExtension("WEBGL_debug_renderer_info"); return x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : "?"; })()`);
}

async function memoryPart(page, base) {
  const gpu = await open(page, base);
  const sample = async (label) => ({ label, t: r1(performance.now() / 1000), fp: footprints(), lab: await page.eval("window.__lab.memory()") });
  const samples = [await sample("loaded")];
  // The lists: one cast each returns them (and counts as the first cast of the round).
  const first8 = await page.eval("window.__lab.showcase()");
  await sleep(2000);
  const first9 = await page.eval("window.__lab.expansion()");
  const ids8 = first8.ids;
  const ids9 = first9.ids;
  await sleep(2000);
  samples.push(await sample("cast 2"));
  let n8 = 1;
  let n9 = 1;
  for (const round of [1, 2]) {
    const from = round === 1 ? 3 : 1;
    for (let k = from; k <= 20; k += 1) {
      if (k % 2 === 1) await page.eval(`window.__lab.showcase(${JSON.stringify(ids8[n8++ % ids8.length])})`);
      else await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[n9++ % ids9.length])})`);
      await sleep(2000);
      if (k % 5 === 0) samples.push(await sample(`round ${round} cast ${k}`));
    }
    await sleep(6000);
    samples.push(await sample(`round ${round} +6 s`));
    await page.send("HeapProfiler.enable");
    await page.send("HeapProfiler.collectGarbage");
    await sleep(2500);
    samples.push(await sample(`round ${round} after GC`));
  }
  return { gpu, ids8: ids8.length, ids9: ids9.length, samples };
}

async function framesPart(page, base) {
  const gpu = await open(page, base);
  await page.eval(`(() => { window.__rafd = []; let last = 0; const f = (t) => { if (last) window.__rafd.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  const ids8 = (await page.eval("window.__lab.showcase()")).ids;
  await sleep(7000);
  const ids9 = (await page.eval("window.__lab.expansion()")).ids;
  await sleep(7000);
  const window_ = async (label, ms) => {
    await page.eval("window.__rafd.length = 0");
    await sleep(ms);
    const d = await page.eval("window.__rafd.slice()");
    const mem = await page.eval("window.__lab.memory()");
    return { label, frames: d.length, mean: r1(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)), p50: r1(pct(d, 0.5)), p95: r1(pct(d, 0.95)), p99: r1(pct(d, 0.99)), max: r1(Math.max(...d)), over20: d.filter((x) => x > 20).length, over33: d.filter((x) => x > 33.4).length, videosPlaying: mem.videos.filter((v) => v.left > 0 && !v.paused).length, atlasesLeased: mem.atlasesLeased ?? 0 };
  };
  const rows = [];
  for (const run of [0, 1]) {
    rows.push(await window_(`herd only (${run + 1})`, 3000));
    // Two videos at once: a pillar and an area skill.
    await page.eval(`window.__lab.showcase(${JSON.stringify(ids8[(run * 5 + 2) % ids8.length])})`);
    await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[(run * 7 + 3) % ids9.length])})`);
    await sleep(250);
    rows.push(await window_(`2 videos (${run + 1})`, 2500));
    await sleep(5000);
    await page.eval(`window.__lab.showcase(${JSON.stringify(ids8[(run * 5 + 4) % ids8.length])})`);
    await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[(run * 7 + 9) % ids9.length])})`);
    await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[(run * 7 + 15) % ids9.length])})`);
    await sleep(250);
    rows.push(await window_(`3 videos (${run + 1})`, 2500));
    await sleep(5000);
  }
  return { gpu, rows };
}

async function fallbackPart(page, base) {
  // QS="?atlases=all": the same burst with every atlas resident (before 06/11).
  const gpu = await open(page, base + (process.env.QS ?? ""));
  const atlasMB = (m) => (m.byFolder.ult?.mb ?? 0) + (m.byFolder.expansion?.mb ?? 0);
  const read = async (label) => {
    const m = await page.eval("window.__lab.memory()");
    return { label, leased: m.atlasesLeased, atlasMB: atlasMB(m), videos: m.videos.filter((v) => v.left > 0).length, uploadedMB: m.uploadedMB };
  };
  const rows = [await read("loaded")];
  const ids9 = (await page.eval("window.__lab.expansion()")).ids;
  await sleep(6000);
  await page.eval(`(() => { window.__rafd = []; let last = 0; const f = (t) => { if (last) window.__rafd.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  await sleep(1000);
  await page.eval("window.__rafd.length = 0");
  for (const k of [1, 2, 3, 4].slice(0, Number(process.env.BURST ?? "4"))) await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[k])})`);
  const fourth = await page.eval("window.__lab.clipSkill(9)");
  await sleep(1200);
  const d = await page.eval("window.__rafd.slice()");
  rows.push({ ...(await read("4 casts +1.2 s")), frames: d.length, p95: r1(pct(d, 0.95)), max: r1(Math.max(...d)), worst3: [...d].sort((a, b) => b - a).slice(0, 3).map(r1) });
  if (process.env.REPEAT === "1") {
    // The same burst again while the fourth's atlas is still lent (no fetch, no first upload).
    await sleep(4000);
    await page.eval("window.__rafd.length = 0");
    for (const k of [1, 2, 3, 4]) await page.eval(`window.__lab.expansion(${JSON.stringify(ids9[k])})`);
    await sleep(1200);
    const e = await page.eval("window.__rafd.slice()");
    rows.push({ ...(await read("again +1.2 s")), frames: e.length, p95: r1(pct(e, 0.95)), max: r1(Math.max(...e)), worst3: [...e].sort((a, b) => b - a).slice(0, 3).map(r1) });
  }
  await sleep(5000);
  rows.push(await read("+6 s (cards ending)"));
  await sleep(12000);
  rows.push(await read("+18 s (released)"));
  return { gpu, fourth: { id: fourth?.id, video: fourth?.video, blows: fourth?.blows }, rows };
}

async function contrastPart(page, base, out) {
  const gpu = await open(page, base + "?fixed=1&ui=0" + (process.env.QS ?? ""));
  const dir = join(dirname(resolve(out)), process.env.QS ? "contrast-readable" : "contrast");
  mkdirSync(dir, { recursive: true });
  await page.eval("window.__lab.camera('play')");
  const shots = [];
  // The field without a skill: the reference.
  await page.eval("window.__lab.reset()");
  await page.eval("window.__lab.step(30)");
  shots.push({ key: 0, id: "none", file: await page.shot(join(dir, "none.jpg")), tags: await page.eval("window.__lab.tagSpots()"), video: false });
  const lists = { 8: (await page.eval("window.__lab.showcase()")).ids, 9: (await page.eval("window.__lab.expansion()")).ids };
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
  for (const key of [8, 9]) {
    for (const id of lists[key]) {
      if (only !== null && !only.has(id)) continue;
      await page.eval("window.__lab.reset()");
      await page.eval("window.__lab.step(20)");
      await page.eval(key === 8 ? `window.__lab.showcase(${JSON.stringify(id)})` : `window.__lab.expansion(${JSON.stringify(id)})`);
      // Step to the first strike (the clip showing its peak frame); 8 s at most.
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
      await page.eval("window.__lab.step(1, 0)");
      const file = await page.shot(join(dir, `k${key}-${id}.jpg`));
      shots.push({ key, id, file, tags: await page.eval("window.__lab.tagSpots()"), video: rep?.video ?? false, strikeAt: rep?.strikeAt?.[0] ?? -1 });
    }
  }
  return { gpu, shots };
}

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3098/skills-lab.html";
  const part = process.env.PART ?? "memory";
  const out = process.env.OUT ?? `tmp/shots/lab-perf/${part}.json`;
  const result = part === "memory" ? await memoryPart(page, base) : part === "frames" ? await framesPart(page, base)
    : part === "fallback" ? await fallbackPart(page, base) : await contrastPart(page, base, out);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify({ part, width: page.width, height: page.height, dpr: page.dpr, ...result }, null, 1));
  return { out, part };
}
