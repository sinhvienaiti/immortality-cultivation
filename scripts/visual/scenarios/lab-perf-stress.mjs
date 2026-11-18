// Perf stress of the skills lab (docs/work/tasks/perf-stress.md, 13/11/2026) on stress.html (src/lab/stress.ts): the lab
// herd marching (86 beasts and the king) plus 13 walkers on a one-lane greybox with ~200 instanced props, and Five Thunders.
//   PART=grid   ?fixed=1: for each DPR in DPRS and each view (Alt+1..4: top, behind, behind25, side), five cases:
//               base (ground and post only), foes (herd and walkers), map (lane and props), thunder (Five Thunders alone,
//               1.0–3.6 s after the cast: the bolts and the finisher) and all (everything, the same window). Each frame
//               through __lab.perf(1): CPU (frame() in JS), total (until a 1-pixel readPixels returns: the GPU has
//               finished the frame) and GPU ≈ total − CPU; draw calls, triangles; texture memory after. One JPEG of
//               "all" at the thunder peak per view.
//   PART=live   no ?fixed: the real rAF loop with ?auto=1 (a cast every 6 s), CHROME_FLAGS uncapped
//               (--disable-gpu-vsync --disable-frame-rate-limit): frame intervals over SECONDS, by view.
//   PART=clip   ?fixed=1: JPEGs at 30 fps over 9 s (casts at 0.3 s and 6.3 s) in VIEW, for a short video (ffmpeg
//               outside; delete the JPEGs after).
// Run (one perf browser at a time):
//   BASE=http://127.0.0.1:3146/stress.html PART=grid OUT=…/perf-stress/grid-1920.json \
//   ../../.local/bin/heavy.sh --perf node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-perf-stress.mjs --width=1920 --height=1080
// Env: BASE, PART (grid), OUT (JSON path; clip: a folder), DPRS (1,0.67), VIEWS (top,behind,behind25,side), CASES
// (base,foes,map,thunder,all), FRAMES (120), SECONDS (live: 8), VIEW (clip: behind), SHOTS (1).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? null : Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] * 100) / 100;
};
const stats = (a) => ({ p50: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1), mean: a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null });

const HELPERS = `
window.__vis = (c) => {
  const s = window.__stress;
  if (c === "base") s.show({ decor: false, walkers: false, actors: false, fx: true });
  else if (c === "foes") s.show({ decor: false, walkers: true, actors: true, fx: true });
  else if (c === "map") s.show({ decor: true, walkers: false, actors: false, fx: true });
  else if (c === "thunder") s.show({ decor: false, walkers: false, actors: false, fx: true });
  else s.show({ decor: true, walkers: true, actors: true, fx: true });
};
window.__measure = (n) => {
  const cpu = [], total = [], draws = [], tris = [];
  for (let i = 0; i < n; i++) {
    const p = window.__lab.perf(1);
    cpu.push(p.cpu[0]); total.push(p.total[0]); draws.push(p.drawCalls); tris.push(p.triangles);
  }
  return { cpu, total, draws, tris };
};
true`;

async function ready(page) {
  for (let i = 0; i < 240; i += 1) {
    const ok = await page.eval("!!(window.__lab && window.__lab.ready && window.__stress && window.__stress.ready)");
    if (ok === true) return true;
    await page.eval("try { window.__lab && window.__lab.step && window.__lab.step(1) } catch (e) {}");
    await sleep(250);
  }
  return false;
}

async function open(page, url) {
  // The lab's dev server reloads the page when another session saves a lab file: one more try.
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
    await page.goto(url, { settle: 1500 });
    ok = await ready(page);
  }
  if (!ok) throw new Error("lab or stress not ready: " + url);
  await page.eval(HELPERS);
  await page.eval("window.__lab.setHerd('march'); window.__lab.step(90); true");
}

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3146/stress.html";
  const part = process.env.PART ?? "grid";
  const out = resolve(process.env.OUT ?? "perf-stress.json");
  const frames = Number(process.env.FRAMES ?? "120");
  const views = (process.env.VIEWS ?? "top,behind,behind25,side").split(",");
  const cases = (process.env.CASES ?? "base,foes,map,thunder,all").split(",");
  const dprs = (process.env.DPRS ?? "1,0.67").split(",").map(Number);
  const shots = process.env.SHOTS !== "0";
  mkdirSync(part === "clip" ? out : dirname(out), { recursive: true });

  if (part === "live") {
    const seconds = Number(process.env.SECONDS ?? "8");
    const result = { part, views: {} };
    await page.goto(base + "?ui=0&dpr=1&auto=1&herd=march", { settle: 1500 });
    if (!(await ready(page))) throw new Error("not ready");
    result.gpu = await page.eval("window.__lab.perf(1).gpu");
    for (const v of views) {
      await page.eval(`window.__lab.viewMode(${JSON.stringify(v)}); true`);
      await sleep(1000);
      const iv = await page.eval(`new Promise((res) => { const a = []; let t = performance.now(); const end = t + ${seconds * 1000};
        const f = (now) => { a.push(now - t); t = now; if (now < end) requestAnimationFrame(f); else res(a); }; requestAnimationFrame(f); })`);
      result.views[v] = { frames: iv.length, interval: stats(iv), fps: Math.round((1000 / (iv.reduce((x, y) => x + y, 0) / iv.length)) * 10) / 10, over16_7: iv.filter((x) => x > 16.7).length, onScreen: await page.eval("window.__lab.beastsOnScreen().n"), casts: await page.eval("window.__stress.casts") };
    }
    writeFileSync(out, JSON.stringify(result, null, 1));
    return result;
  }

  if (part === "r4") {
    // Round 4 (15/11): the ground's packed and KTX2 maps in look.ts. The picture in views 1 (top) and 2b (behind25):
    // direct renders jpg / orm / ktx2 on one page (exact when unchanged) and whole frames for the owner; the cost A/B;
    // then the real loop (no ?fixed, uncapped, a Five Thunders cast every 6 s) on fresh pages, ?groundTex=jpg against the
    // default, alternated, with a jpg-against-jpg control for the noise between runs.
    const dir = out;
    mkdirSync(dir, { recursive: true });
    const res = { part };
    const savePng = async (name, expr) => {
      const url = await page.eval(expr);
      if (typeof url === "string" && url.startsWith("data:image/png;base64,")) writeFileSync(join(dir, name), Buffer.from(url.slice(22), "base64"));
    };
    const file = process.env.PROOF_ONLY === "1" ? "r4-proof.json" : "r4.json";
    const log = (k, v) => { res[k] = v; console.log(k, JSON.stringify(v).slice(0, 500)); writeFileSync(join(dir, file), JSON.stringify(res, null, 1)); };
    if (process.env.LIVE_ONLY !== "1") {
      await open(page, base + "?fixed=1&ui=0&dpr=1&herd=march");
      log("defaultMode", await page.eval("window.__opt.groundReady()"));
      await page.eval("window.__vis('all'); window.__lab.step(30); true");
      for (const v of ["top", "behind25"]) {
        await page.eval(`window.__lab.viewMode(${JSON.stringify(v)}); window.__lab.step(30); true`);
        const r = {};
        await page.eval("window.__opt.groundMaps('jpg').then(() => { window.__J = window.__opt.direct(); return window.__opt.groundMaps('orm'); }).then(() => { window.__O = window.__opt.direct(); return window.__opt.groundMaps('ktx2'); }).then(() => { window.__K = window.__opt.direct(); return true; })");
        r.ormVsJpg = await page.eval("window.__opt.constructor.compareF(window.__J, window.__O)");
        r.ktx2VsJpg = await page.eval("window.__opt.constructor.compareF(window.__J, window.__K)");
        r.costOrm = await page.eval("window.__opt.abDirect(() => window.__opt.groundMaps('jpg'), () => window.__opt.groundMaps('orm'))");
        r.costKtx2 = await page.eval("window.__opt.abDirect(() => window.__opt.groundMaps('jpg'), () => window.__opt.groundMaps('ktx2'))");
        r.frameKtx2 = await page.eval("window.__opt.ab(() => window.__opt.groundMaps('jpg'), () => window.__opt.groundMaps('ktx2'), 5, 60)");
        // whole frames for the owner (the post chain on): jpg then ktx2, the same frozen frame
        await page.eval("window.__opt.groundMaps('jpg').then(() => { window.__FJ = window.__opt.stable(); return window.__opt.groundMaps('ktx2'); }).then(() => { window.__FK = window.__opt.stable(); window.__FK2 = window.__opt.stable(); return true; })");
        r.frameCompare = await page.eval("window.__opt.constructor.compare(window.__FJ, window.__FK)");
        r.frameFloor = await page.eval("window.__opt.constructor.compare(window.__FK, window.__FK2)");
        await savePng(`${v}-jpg.png`, "window.__opt.png(window.__FJ)");
        await savePng(`${v}-ktx2.png`, "window.__opt.png(window.__FK)");
        log(v, r);
      }
    }
    if (process.env.PROOF_ONLY === "1") return { out: dir };
    // The real loop. Each run: a fresh page, 3 s settle, then SECONDS of rAF intervals in the view.
    const seconds = Number(process.env.SECONDS ?? "8");
    const live = async (mode, view) => {
      await page.goto(base + `?ui=0&dpr=1&auto=1&herd=march${mode === "jpg" ? "&groundTex=jpg" : ""}`, { settle: 1500 });
      if (!(await ready(page))) throw new Error("not ready");
      const got = await page.eval("window.__opt.groundReady()");
      await page.eval(`window.__lab.viewMode(${JSON.stringify(view)}); true`);
      await sleep(3000);
      const iv = await page.eval(`new Promise((res) => { const a = []; let t = performance.now(); const end = t + ${seconds * 1000};
        const f = (now) => { a.push(now - t); t = now; if (now < end) requestAnimationFrame(f); else res(a); }; requestAnimationFrame(f); })`);
      return { mode: got, view, frames: iv.length, p50: pct(iv, 0.5), p95: pct(iv, 0.95), p99: pct(iv, 0.99), mean: Math.round((iv.reduce((a, b) => a + b, 0) / iv.length) * 100) / 100, over16_7: iv.filter((x) => x > 16.7).length };
    };
    const runs = [];
    for (const view of ["top", "behind25"]) {
      for (const mode of ["jpg", "ktx2", "jpg", "ktx2", "jpg", "jpg"]) runs.push(await live(mode, view));
    }
    log("live", runs);
    return { out: dir };
  }

  if (part === "r3") {
    // Round 3 (15/11): the ground's light baked, its maps packed and compressed; the formation's cards trimmed
    // (five-thunder.ts stillTrim). Proofs on direct renders (bit-exact when nothing changed), costs A/B as in round 2.
    const view = process.env.VIEW ?? "behind";
    const dir = out;
    mkdirSync(dir, { recursive: true });
    const res = { part, view };
    const savePng = async (name, expr) => {
      const url = await page.eval(expr);
      if (typeof url === "string" && url.startsWith("data:image/png;base64,")) writeFileSync(join(dir, name), Buffer.from(url.slice(22), "base64"));
    };
    const log = (k, v) => { res[k] = v; console.log(k, JSON.stringify(v).slice(0, 500)); writeFileSync(join(dir, "r3.json"), JSON.stringify(res, null, 1)); };
    await open(page, base + "?fixed=1&ui=0&dpr=1&herd=march");
    await page.eval(`window.__lab.viewMode(${JSON.stringify(view)}); window.__lab.step(30); true`);
    res.null = await page.eval("(() => { const a = window.__opt.direct(), b = window.__opt.direct(); return window.__opt.constructor.compareF(a, b); })()");
    const variants = {
      baked: ["window.__opt.bakeGround(true, 'baked')", "window.__opt.bakeGround(false)"],
      lite: ["window.__opt.bakeGround(true, 'lite')", "window.__opt.bakeGround(false)"],
      orm: ["window.__opt.groundMaps('orm')", "window.__opt.groundMaps('jpg')"],
      ktx2: ["window.__opt.groundMaps('ktx2')", "window.__opt.groundMaps('jpg')"],
    };
    await page.eval("window.__opt.groundMaps('jpg').then(() => window.__opt.bakeGround(true)).then(() => window.__opt.bakeGround(false))");
    for (const [label, vis] of [["groundBase", "base"], ["groundAll", "all"]]) {
      await page.eval(`window.__vis(${JSON.stringify(vis)}); window.__lab.step(30); true`);
      const rows = { scene: await page.eval("window.__opt.directThroughput(40)") };
      for (const [k, [on, off]] of Object.entries(variants)) {
        await page.eval(`Promise.resolve(${off}).then(() => { window.__A = window.__opt.direct(); return ${on}; }).then(() => { window.__B = window.__opt.direct(); return ${off}; })`);
        const proof = await page.eval("window.__opt.constructor.compareF(window.__A, window.__B)");
        if (vis === "base") {
          await savePng(`ground-orig.png`, "window.__opt.pngF(window.__A)");
          await savePng(`ground-${k}.png`, "window.__opt.pngF(window.__B)");
        }
        const cost = await page.eval(`window.__opt.abDirect(() => ${off}, () => ${on})`);
        rows[k] = { proof, cost };
      }
      log(label, rows);
    }
    // The formation's cards: trimmed (as five-thunder.ts has them now) against the shader before the trim.
    await page.eval("window.__vis('all'); window.__lab.step(240); window.__lab.thunder(true, 1111); true");
    const trim = [];
    let t = 0;
    for (const at of [72, 108, 150, 205]) {
      await page.eval(`window.__lab.step(${at - t}); true`);
      t = at;
      await page.eval("window.__opt.formationTrim(false); window.__A = window.__opt.direct(); window.__opt.formationTrim(true); window.__B = window.__opt.direct(); true");
      const proof = await page.eval("window.__opt.constructor.compareF(window.__A, window.__B)");
      if (at === 108) {
        await savePng("formation-before.png", "window.__opt.pngF(window.__A)");
        await savePng("formation-trimmed.png", "window.__opt.pngF(window.__B)");
      }
      const cost = await page.eval("window.__opt.abDirect(() => window.__opt.formationTrim(false), () => window.__opt.formationTrim(true), 7, 40)");
      const cards = await page.eval("(() => { let n = 0; window.__opt.scene.traverse((x) => { if (/^flipbook-five-thunder-formation(Shade|Rim)?$/.test(x.name)) n += x.geometry.instanceCount; }); return n; })()");
      trim.push({ t: +(at / 60).toFixed(2), cards, proof, cost });
    }
    log("formationTrim", trim);
    return { out: dir };
  }

  if (part === "opt") {
    // Round 2 (keep the picture): src/lab/stress-opt.ts (window.__opt). OUT is a folder: opt.json and the compare PNGs.
    // Proofs and scene costs on direct renders (__opt.direct: the scene drawn straight into a float target, frame() not
    // called, so nothing spawns, eases or moves: two draws of one state are equal bit for bit). Costs: A/B alternated, the
    // median of 7 rounds of 40 back-to-back draws with one sync. Post-chain costs on the whole frame (__opt.ab).
    const view = process.env.VIEW ?? "behind";
    const dir = out;
    mkdirSync(dir, { recursive: true });
    const res = { part, view };
    const savePng = async (name, expr) => {
      const url = await page.eval(expr);
      if (typeof url === "string" && url.startsWith("data:image/png;base64,")) writeFileSync(join(dir, name), Buffer.from(url.slice(22), "base64"));
    };
    const fresh = async (q = "") => {
      await open(page, base + `?fixed=1&ui=0&dpr=1&herd=march${q}`);
      await page.eval(`window.__lab.viewMode(${JSON.stringify(view)}); window.__vis('all'); window.__lab.step(30); true`);
    };
    const log = (k, v) => { res[k] = v; console.log(k, JSON.stringify(v).slice(0, 600)); writeFileSync(join(dir, "opt.json"), JSON.stringify(res, null, 1)); };
    const moments = [42, 72, 108, 150, 205];
    await fresh();
    res.null = await page.eval("(() => { const a = window.__opt.direct(), b = window.__opt.direct(); return window.__opt.constructor.compareF(a, b); })()");

    // 1. Tight meshes: proof and cost at five moments of Five Thunders.
    await page.eval("window.__opt.tight(true).then(() => window.__opt.tight(false)).then(() => { window.__stress.cast(1111); return true; })");
    const tight = [];
    let t = 0;
    for (const at of moments) {
      await page.eval(`window.__lab.step(${at - t}); true`);
      t = at;
      const proof = await page.eval("window.__opt.checkTight()");
      const cost = await page.eval("window.__opt.abDirect(() => window.__opt.tight(false), () => window.__opt.tight(true))");
      tight.push({ t: +(at / 60).toFixed(2), proof: { identical: proof.identical, maxDiff: proof.maxDiff, tested: proof.tested.length, bad: proof.bad }, cost });
      if (at === 108) {
        await page.eval("window.__opt.tight(false).then(() => { window.__A = window.__opt.direct(); return window.__opt.tight(true); }).then(() => { window.__B = window.__opt.direct(); return window.__opt.tight(false); })");
        await savePng("tight-off.png", "window.__opt.pngF(window.__A)");
        await savePng("tight-on.png", "window.__opt.pngF(window.__B)");
      }
    }
    log("tight", tight);
    log("tightKept", await page.eval("window.__opt.tight(true)"));
    log("tightBad", await page.eval("[...window.__opt.bad]"));
    await page.eval("window.__opt.tight(false)");

    // 2. Herd LOD (no cast running): the picture (direct renders) and the cost.
    await page.eval("window.__lab.step(300); true");
    log("beastsPx", await page.eval("window.__lab.beastsOnScreen()"));
    for (const tris of [3000, 1800]) {
      const info = await page.eval(`window.__opt.lod(true, ${tris})`);
      const cost = await page.eval(`window.__opt.abDirect(() => window.__opt.lod(false), () => window.__opt.lod(true, ${tris}))`);
      await page.eval(`window.__opt.lod(false); window.__A = window.__opt.direct(); window.__opt.lod(true, ${tris}); window.__B = window.__opt.direct(); window.__opt.lod(false); true`);
      const cmp = await page.eval("window.__opt.constructor.compareF(window.__A, window.__B)");
      log("lod" + tris, { tris: info, cost, compare: cmp });
      await savePng(`lod-off.png`, "window.__opt.pngF(window.__A)");
      await savePng(`lod-${tris}.png`, "window.__opt.pngF(window.__B)");
    }

    // 4. Base split: the scene parts on direct renders, the post chain on the whole frame; the base alone and everything.
    for (const [label, vis] of [["baseSplit", "base"], ["allSplit", "all"]]) {
      await page.eval(`window.__vis(${JSON.stringify(vis)}); window.__lab.step(60); true`);
      const split = { sceneDirect: await page.eval("window.__opt.directThroughput(40)") };
      for (const v of ["unlit", "noShadowPass", "noGround"]) {
        split[v] = await page.eval(`(() => { let u = null; return window.__opt.abDirect(() => { if (u) { u(); u = null; } }, () => { if (!u) u = window.__opt.base(${JSON.stringify(v)}); }); })()`);
      }
      for (const v of ["noScreenPass", "direct"]) {
        split["frame:" + v] = await page.eval(`(() => { let u = null; return window.__opt.ab(() => { if (u) { u(); u = null; } }, () => { if (!u) u = window.__opt.base(${JSON.stringify(v)}); }, 5, 60); })()`);
      }
      log(label, split);
    }
    await page.eval("window.__vis('base'); window.__A = window.__opt.direct(); window.__u = window.__opt.base('unlit'); window.__B = window.__opt.direct(); window.__u(); window.__vis('all'); true");
    log("groundUnlitPicture", await page.eval("window.__opt.constructor.compareF(window.__A, window.__B)"));
    await savePng("ground-lit.png", "window.__opt.pngF(window.__A)");
    await savePng("ground-unlit.png", "window.__opt.pngF(window.__B)");

    // 5. Five Thunders: each layer's footprint and cost, the overlap per pixel, at four moments.
    await page.eval("window.__lab.step(300); window.__stress.cast(1111); true");
    const layers = [];
    t = 0;
    for (const at of [72, 108, 150, 205]) {
      await page.eval(`window.__lab.step(${at - t}); true`);
      t = at;
      layers.push({ t: +(at / 60).toFixed(2), ...(await page.eval("window.__opt.layers(5)")) });
    }
    log("thunderLayers", layers);

    // 3c. KTX2 against the PNGs they were encoded from (same page): the picture and the cost.
    await page.eval("window.__lab.step(300); window.__stress.cast(1111); window.__lab.step(108); true");
    await page.eval("window.__opt.atlasPng(false).then(() => { window.__A = window.__opt.direct(); return window.__opt.atlasPng(true); }).then((r) => { window.__memP = r; window.__B = window.__opt.direct(); return window.__opt.atlasPng(false); })");
    const texCmp = await page.eval("window.__opt.constructor.compareF(window.__A, window.__B)");
    await savePng("atlas-ktx2.png", "window.__opt.pngF(window.__A)");
    await savePng("atlas-png.png", "window.__opt.pngF(window.__B)");
    const texCost = await page.eval("window.__opt.abDirect(() => window.__opt.atlasPng(false), () => window.__opt.atlasPng(true))");
    log("ktx2", { memory: await page.eval("window.__memP"), compare: texCmp, costKtxMinusPng: texCost });

    // 3b. First cast on a fresh page, without and with the prewarm, twice each.
    const firstCast = async (warm) => {
      await fresh();
      const pw = warm ? await page.eval("window.__opt.prewarm()") : null;
      await page.eval("window.__stress.cast(1111); true");
      const m = await page.eval("window.__measure(108)");
      return { prewarm: pw, max: Math.round(Math.max(...m.total) * 10) / 10, over33: m.total.filter((x) => x > 33).length, firstFive: m.total.slice(0, 5).map((x) => Math.round(x * 10) / 10), p50: pct(m.total, 0.5) };
    };
    log("firstCast", { cold: await firstCast(false), warm: await firstCast(true), cold2: await firstCast(false), warm2: await firstCast(true) });
    return { out: dir };
  }

  if (part === "cuts") {
    // Quick cuts on the worst case ("all" at the thunder window, view VIEW): what each saves.
    const view = process.env.VIEW ?? "behind";
    const variants = [
      ["high (as measured)", "", ""],
      ["no bloom (q=medium)", "&q=medium", ""],
      ["render scale 0.67", "&dpr=0.67", ""],
      ["screen effects off", "", "window.__lab.post({ screen: false });"],
      ["no herd (cost of 100 foes)", "", "window.__stress.show({ actors: false, walkers: false });"],
      ["low (no bloom, scale 0.67)", "&q=low&dpr=0.67", ""],
    ];
    const result = { part, view, variants: [] };
    for (const [label, q, js] of variants) {
      await open(page, base + `?fixed=1&ui=0&herd=march${q.includes("dpr") ? "" : "&dpr=1"}${q}`);
      await page.eval(`window.__lab.viewMode(${JSON.stringify(view)}); window.__vis('all'); ${js} window.__lab.step(30); window.__stress.cast(); window.__lab.step(60); true`);
      const m = await page.eval("window.__measure(156)");
      if (m.evalError) throw new Error(m.evalError);
      const gpu = m.total.map((t, i) => Math.max(0, t - m.cpu[i]));
      const row = { label, gpu: stats(gpu), cpu: stats(m.cpu), total: stats(m.total), draws: pct(m.draws, 1), tris: pct(m.tris, 1) };
      result.variants.push(row);
      console.log(JSON.stringify({ label, gpu50: row.gpu.p50, gpu95: row.gpu.p95, cpu95: row.cpu.p95 }));
    }
    writeFileSync(out, JSON.stringify(result, null, 1));
    return result;
  }

  if (part === "clip") {
    const view = process.env.VIEW ?? "behind";
    await open(page, base + "?fixed=1&ui=0&dpr=1&herd=march");
    await page.eval(`window.__lab.viewMode(${JSON.stringify(view)}); window.__vis('all'); window.__lab.step(30); true`);
    let n = 0;
    for (let f = 0; f < 9 * 60; f += 1) {
      if (f === 18 || f === 378) await page.eval("window.__stress.cast(); true");
      await page.eval("window.__lab.step(1); true");
      if (f % 2 === 0) {
        const r = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
        writeFileSync(join(out, `f${String(n++).padStart(4, "0")}.jpg`), Buffer.from(r.data, "base64"));
      }
    }
    return { part, frames: n, out };
  }

  const result = { part, frames, runs: [] };
  for (const dpr of dprs) {
    await open(page, base + `?fixed=1&ui=0&dpr=${dpr}&herd=march`);
    const info = await page.eval("({ gpu: window.__lab.perf(1).gpu, w: innerWidth, h: innerHeight, view: window.__lab.viewMode(), stress: window.__stress.report() })");
    result.gpu ??= info.gpu;
    result.stress ??= info.stress;
    for (const v of views) {
      await page.eval(`window.__lab.viewMode(${JSON.stringify(v)}); window.__lab.step(30); true`);
      for (const c of cases) {
        await page.eval(`window.__vis(${JSON.stringify(c)}); window.__lab.step(20); true`);
        const thunder = c === "thunder" || c === "all";
        if (thunder) await page.eval("window.__stress.cast(); window.__lab.step(60); true");
        const n = thunder ? Math.round(2.6 * 60) : frames;
        // Thunder windows in two halves: the "all" picture is taken between them, 2.0 s after the cast (the bolts' peak).
        const half = thunder ? 60 : n;
        const m = await page.eval(`window.__measure(${half})`);
        if (m.evalError) throw new Error(m.evalError);
        if (thunder && c === "all" && shots && dpr === 1) {
          const r = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
          writeFileSync(out.replace(/\.json$/, "") + `-${v}-all-peak.jpg`, Buffer.from(r.data, "base64"));
        }
        if (n > half) {
          const m2 = await page.eval(`window.__measure(${n - half})`);
          if (m2.evalError) throw new Error(m2.evalError);
          for (const k of ["cpu", "total", "draws", "tris"]) m[k].push(...m2[k]);
        }
        const gpu = m.total.map((t, i) => Math.max(0, t - m.cpu[i]));
        const row = {
          dpr, view: v, case: c, frames: n, size: [Math.round(info.w * dpr), Math.round(info.h * dpr)],
          cpu: stats(m.cpu), gpu: stats(gpu), total: stats(m.total),
          draws: { p50: pct(m.draws, 0.5), max: pct(m.draws, 1) }, tris: { p50: pct(m.tris, 0.5), max: pct(m.tris, 1) },
          onScreen: await page.eval("window.__lab.beastsOnScreen().n"),
          memory: await page.eval("(() => { const m = window.__lab.memory(); return { textures: m.gl.textures, geometries: m.gl.geometries, uploadedMB: Math.round(m.uploadedMB * 10) / 10, heapMB: Math.round(m.heapMB) }; })()"),
        };
        result.runs.push(row);
        console.log(JSON.stringify({ dpr, v, c, cpu: row.cpu.p50, gpu: row.gpu.p50, gpu95: row.gpu.p95, total95: row.total.p95, draws: row.draws.max, tris: row.tris.max }));
        if (thunder) await page.eval("window.__lab.step(240); true");
      }
    }
  }
  writeFileSync(out, JSON.stringify(result, null, 1));
  return { runs: result.runs.length, out };
}
