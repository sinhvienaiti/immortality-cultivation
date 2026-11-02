// Segment contact sheets of a lab-motion.mjs run (MOTION_PLAN step 4, for judges without video): per phase,
// 12 frames at the play camera (a third of the frame round the caster) and 12 at the close-up, 3 × 4 tiles of
// 640×360. Frames are evenly spaced from the phase's first to its last frame; the nearest free sample between
// them snaps to each clip change, last key, strike (last key + 0.15 s), hit and recoil (hit + 0.1 s). lab-motion.mjs calls it after capture; to rebuild while raw/ still exists:
//   node scripts/visual/motion-segments.mjs tmp/shots/motion/<run>
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => existsSync(f));
const STRIKE_S = 0.15;
const RECOIL_S = 0.1;

/** n frames evenly over [a, z]; the nearest free sample within one spacing snaps to each key frame. */
export function pickFrames(a, z, n, keys) {
  const gap = (z - a) / (n - 1);
  const picks = [];
  for (let i = 0; i < n; i += 1) picks.push(Math.round(a + gap * i));
  // The phase's first and last frames stay.
  const locked = new Set([0, n - 1]);
  for (const kf of [...new Set(keys)].sort((p, q) => p - q)) {
    if (kf <= a || kf >= z) continue;
    let best = -1;
    for (let i = 0; i < n; i += 1) {
      if (locked.has(i)) continue;
      if (best < 0 || Math.abs(picks[i] - kf) < Math.abs(picks[best] - kf)) best = i;
    }
    if (best >= 0 && Math.abs(picks[best] - kf) <= gap) {
      picks[best] = kf;
      locked.add(best);
    }
  }
  return [...new Set(picks)].sort((p, q) => p - q);
}

/**
 * Writes <out>/segments/NN-<phase>-{play,close}.jpg and returns how many sheets it made.
 * screen: Map probe frame → [x, y] of the caster on the play view.
 */
export function buildSegmentSheets({ out, metrics, screen, width, height, hz, views, followM }) {
  const raw = join(out, "raw");
  const segs = join(out, "segments");
  mkdirSync(segs, { recursive: true });
  const frames = [...screen.keys()];
  const first = Math.min(...frames);
  const last = Math.max(...frames);
  const strike = Math.round(STRIKE_S * hz);
  const recoil = Math.round(RECOIL_S * hz);
  const keys = [];
  const notes = new Map();
  const note = (f, text) => notes.set(f, (notes.has(f) ? notes.get(f) + " · " : "") + text);
  for (const ev of metrics.events) {
    if (ev.kind === "clip") {
      keys.push(ev.f);
      note(ev.f, `clip ${ev.detail}`);
    } else if (ev.kind === "lastKey") {
      keys.push(ev.f, ev.f + strike);
      note(ev.f, `last key ${ev.detail}`);
      note(ev.f + strike, "strike +0.15 s");
    } else if (ev.kind === "hit") {
      keys.push(ev.f, ev.f + recoil);
      note(ev.f, "hit");
      note(ev.f + recoil, "recoil +0.10 s");
    }
  }
  const cw = Math.round(width / 3);
  const ch = Math.round(height / 3);
  const lift = Math.round((20 * width) / 1280);
  let made = 0;
  let si = 0;
  for (const ph of metrics.phases) {
    const a = Math.max(first, ph.f0);
    const z = Math.min(last, ph.f1 - 1);
    if (z < a) continue;
    const picks = pickFrames(a, z, 12, keys);
    const tag = `${String(si).padStart(2, "0")}-${String(ph.phase).replace(/[^a-z0-9]+/gi, "-")}`;
    for (const v of views) {
      const args = ["-background", "#11151c", "-fill", "#e6e9ef", "-pointsize", "17"];
      if (FONT) args.push("-font", FONT);
      for (const k of picks) {
        const id = String(k).padStart(5, "0");
        const n = notes.get(k);
        const label = `#${k}  ${(k / hz).toFixed(2)} s  +${((k - ph.f0) / hz).toFixed(2)} s${n ? "  " + n.slice(0, 44) : ""}`;
        let src = join(raw, `${v}-${id}.jpg`);
        if (v === "play") {
          const [sx, sy] = screen.get(k) ?? [width / 2, height / 2];
          const x = Math.max(0, Math.min(width - cw, Math.round(sx - cw / 2)));
          const y = Math.max(0, Math.min(height - ch, Math.round(sy - lift - ch / 2)));
          src += `[${cw}x${ch}+${x}+${y}]`;
        }
        args.push("-label", label, src);
      }
      const what = v === "play" ? "play camera, a third of the frame round the caster" : `close-up 55°, ${followM} m`;
      const title = `[${ph.phase}]  #${ph.f0}–#${ph.f1 - 1}  ${((ph.f1 - ph.f0) / hz).toFixed(2)} s  ·  ${what}  ·  ${width}×${height}`;
      args.push("-tile", "3x", "-geometry", "640x360+4+4", "-quality", "88", "-title", title, join(segs, `${tag}-${v === "play" ? "play" : "close"}.jpg`));
      const r = spawnSync("montage", args, { encoding: "utf8", maxBuffer: 1 << 26 });
      if (r.status !== 0) throw new Error(`montage failed (${r.status}): ${(r.stderr || "").slice(-800)}`);
      made += 1;
    }
    si += 1;
  }
  return made;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = resolve(process.argv[2] ?? ".");
  const metrics = JSON.parse(readFileSync(join(out, "metrics.json"), "utf8"));
  const fr = JSON.parse(readFileSync(join(out, "frames.json"), "utf8"));
  const screen = new Map(fr.screen.map(([f, x, y]) => [f, [x, y]]));
  const made = buildSegmentSheets({ out, metrics, screen, width: fr.width, height: fr.height, hz: fr.hz, views: metrics.run.views, followM: metrics.run.followM });
  console.log(`${made} segment sheets in ${join(out, "segments")}`);
}
