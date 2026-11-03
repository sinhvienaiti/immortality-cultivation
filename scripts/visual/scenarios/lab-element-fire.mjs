// Sword × Fire frames and gate numbers (canon D59, 03/11/2026) on the dev-only skills lab, fixed 60 Hz clock, DPR 1:
// key 1 (Threefold Sword Command) at the play camera and the player's close zoom, key 1 typed at the WPM (its charge),
// key 7 (Myriad Swords) at the play camera and close on its field. Per shot: the bloom buffer's non-finite pixels
// (__lab.bright) and the screen state. Per release: the motion probe's key-to-VFX time, and the pixels that changed
// round the caster between the frame before the key and the key's frame (the release is visible on that frame).
// PNGs go to OUT_DIR/raw-<PHASE>/<id>-<frame>.png (WORLD=1 adds <id>-<frame>-world.png, the same frame without the VFX
// layer), numbers to OUT_DIR/fire-<PHASE>.json; make sheets, then delete raw.
//   BASE=http://127.0.0.1:3071/skills-lab.html PHASE=fire-mid ELEMENT=fire [GROUND=#d6d0c2] [ONLY=k1,k7] [PLAN=fixes|linger] \
//   OUT_DIR=tmp/shots/element-fire node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/lab-element-fire.mjs --width=1920 --height=1080
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** id, lab slot, camera ("play", "zoom", "close:x,z,d"), typed (the word typed at 45 WPM first), frames after the key. */
const PLAN = [
  ["k1", "k1", "play", false, [1, 3, 6, 10, 16, 24, 40, 60, 90]],
  ["k1z", "k1", "zoom", false, [1, 3, 8, 16, 26, 40, 70]],
  // 5 letters at 45 WPM: one every 16 frames; the release on the fifth (frame ~65 after the key that starts it).
  ["k1t", "k1", "zoom", true, [10, 26, 42, 58, 66, 68, 74]],
  ["k7", "k7", "play", false, [1, 10, 40, 90, 150, 186, 194, 200, 215, 260]],
  ["k7c", "k7", "close:-4,-7,13", false, [40, 90, 150, 194, 215]],
];

/**
 * PLAN=fixes (03/11 look fixes, part 4): the same items with the aftermath to its end (embers, scorch), key 1 close on
 * its hits, the first keys of the typed charge, and key 7's graphic frames (local F15, dark F197, inverted F201), its
 * slash, cut seams and the hero victims' plants.
 */
const FIXES = [
  ["k1", "k1", "play", false, [1, 3, 6, 8, 10, 16, 24, 40, 60, 90, 120, 150, 180, 240]],
  ["k1c", "k1", "close:-0.3,-5.6,10", false, [8, 16, 40, 60, 90, 120, 150, 180, 240]],
  ["k1t", "k1", "zoom", true, [10, 18, 26, 42, 58, 66, 68, 74]],
  ["k7", "k7", "play", false, [1, 10, 15, 40, 90, 150, 186, 194, 197, 201, 205, 215, 240, 260, 300, 360]],
  ["k7c", "k7", "close:-4,-7,13", false, [40, 60, 90, 150, 194, 197, 201, 205, 215, 240, 260, 300]],
];

/**
 * PLAN=linger (round 3, the owner's 03/11 note "the flames vanish a little fast"): how long each fire lasts, frames
 * after the hit. Key 1 close on its first hit (the lotus, embers, the ground fire and the burnt ground; the hit is the
 * frame the lab's first impact event fires, found by stepping), and key 7 close on its finisher (the flame slash, the
 * burning seams and the plants) from frame 192 (T_FIN) after the key.
 */
const AFTER_HIT = [0, 6, 12, 24, 36, 48, 60, 90, 120, 180];
const LINGER = [
  ["k1h", "k1", "close:-0.3,-5.6,10", false, "hit", AFTER_HIT],
  ["k1hp", "k1", "play", false, "hit", AFTER_HIT],
  ["k7f", "k7", "close:-4,-7,13", false, 192, AFTER_HIT],
];

export default async function (page) {
  const base = process.env.BASE ?? "http://127.0.0.1:3071/skills-lab.html";
  const phase = process.env.PHASE ?? "fire";
  const element = process.env.ELEMENT ?? "fire";
  const ground = process.env.GROUND ? `&ground=${encodeURIComponent(process.env.GROUND)}` : "";
  // QS appends raw query flags (the sword aura's re-measure of the Fire gates: QS="&aura=a", "&bladeHeat=furnace").
  const qs = process.env.QS ?? "";
  const root = resolve(process.env.OUT_DIR ?? "tmp/shots/element-fire");
  const out = join(root, `raw-${phase}`);
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  const world = process.env.WORLD === "1";
  mkdirSync(out, { recursive: true });
  const shots = [];
  const releases = [];
  let loaded = "";
  const plan = process.env.PLAN === "fixes" ? FIXES : process.env.PLAN === "linger" ? LINGER : PLAN;
  for (const item of plan) {
    const [id, slot, cam, typed] = item;
    // A linger item: [.., hit ("hit": the first impact event, or a frame after the key), offsets after it].
    const hitAt = item.length > 5 ? item[4] : null;
    let frames = item.length > 5 ? item[5] : item[4];
    if (only && !only.includes(id)) continue;
    const url = `${base}?fixed=1&ui=0&dpr=1&weapon=clear-wind&cutin=0.9&element=${element}${ground}${qs}${typed ? "&typed=1" : ""}`;
    if (url !== loaded) {
      await page.goto(url, { settle: 1500 });
      for (let i = 0; i < 240; i += 1) {
        if (await page.eval("!!(window.__lab && window.__lab.ready)")) break;
        await sleep(250);
      }
      // Textures and atlases load after `ready`: wait, then draw.
      await sleep(2500);
      loaded = url;
    }
    await page.eval("window.__lab.reset()");
    await page.eval("window.__lab.camera('play')");
    if (cam === "zoom") await page.eval("window.__lab.zoom(1)");
    if (cam.startsWith("close:")) {
      const [x, z, d] = cam.slice(6).split(",").map(Number);
      await page.eval(`window.__lab.camera('close', ${x}, ${z}, ${d})`);
    }
    await page.eval("window.__lab.step(40)");
    const before = join(out, `${id}-pre.png`);
    await page.shot(before);
    const r = await page.eval(`window.__lab.type(${JSON.stringify(slot)})`);
    if (r && r.evalError) throw new Error(r.evalError);
    let at = 0;
    let maxNonFinite = 0;
    let hit = 0;
    if (hitAt === "hit") {
      // Step to the frame the first blow lands (the lab's impact event), at most 120 frames.
      while (at < 120 && (await page.eval("window.__lab.events().impact")) === 0) {
        await page.eval("window.__lab.step(1)");
        at += 1;
      }
      hit = at;
    } else if (typeof hitAt === "number") hit = hitAt;
    const offsets = hitAt === null ? null : frames;
    if (hitAt !== null) frames = frames.map((f) => hit + f);
    for (let fi = 0; fi < frames.length; fi += 1) {
      const f = frames[fi];
      if (f > at) await page.eval(`window.__lab.step(${f - at})`);
      at = Math.max(at, f);
      const name = offsets === null ? String(f).padStart(3, "0") : "h" + String(offsets[fi]).padStart(3, "0");
      const file = join(out, `${id}-${name}.png`);
      await page.shot(file);
      const bright = await page.eval("window.__lab.bright()");
      // WORLD=1: the same frame with the VFX layer hidden (no time passes), to tell the effect's pixels from the world's.
      if (world) {
        await page.eval("window.__lab.debugShow('fx', false)");
        await page.shot(file.replace(/\.png$/, "-world.png"));
        await page.eval("window.__lab.debugShow('fx', true)");
      }
      maxNonFinite = Math.max(maxNonFinite, bright.nonFinite ?? 0);
      shots.push({ id, slot, cam, typed, frame: f, hit: hitAt === null ? undefined : hit, file, bright: { pixels: bright.pixels, share: bright.share, max: bright.max, nonFinite: bright.nonFinite }, screen: await page.eval("window.__lab.screen()") });
    }
    const m = await page.eval("window.__lab.metrics()");
    const rel = (m.releases ?? []).map((x) => ({ slot: x.slot, keyToVfxMs: x.keyToVfxMs, keyToBodyMs: x.keyToBodyMs }));
    releases.push({ id, releases: rel, maxNonFinite, before });
  }
  const info = { weapon: await page.eval("window.__lab.weapon()"), element: await page.eval("window.__lab.element()"), sound: await page.eval("window.__lab.sound()") };
  const report = { phase, element, qs, ground: process.env.GROUND ?? "default", info, releases, shots };
  writeFileSync(join(root, `fire-${phase}.json`), JSON.stringify(report, null, 1));
  return { phase, info, shots: shots.length, releases };
}
