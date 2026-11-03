// Mixes a skills-lab capture's sound offline (03/11/2026): fixed-step captures have no live audio, so the lab records
// what it would play (src/lab/sound.ts record()/takes(), through __lab.soundRecord() and __lab.soundTakes()) and this
// rebuilds it on the capture's clock with ffmpeg: each take at its time, its bus gain, its ±5 % rate, a pan like Web
// Audio's StereoPannerNode on a stereo source, the hush ducks, then the master gain (0.9, as live) and a limiter. Mux
// the result with the frames' video. A take's time is the lab clock at the start of the step that asked for it, so
// when a capture shoots each frame after its step (frame k = step k + 1 since soundRecord()), the offset is 0; pass
// --offset=<1/fps> when frame 0 is shot before the first step.
//   node scripts/visual/mix-lab-sound.mjs <takes.json> <out.wav> [--duration=<s>] [--offset=<s>] [--root=<dir>]
// takes.json: the array of takes; root: the folder served at "/" (default: this repo), so "/art-src/…" urls resolve.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const [takesPath, outPath] = args.filter((a) => !a.startsWith("--"));
if (takesPath === undefined || outPath === undefined) {
  console.error("Usage: node scripts/visual/mix-lab-sound.mjs <takes.json> <out.wav> [--duration=<s>] [--offset=<s>] [--root=<dir>]");
  process.exit(2);
}
const root = resolve(flag("root", join(dirname(fileURLToPath(import.meta.url)), "..", "..")));
const offset = Number(flag("offset", "0"));
const takes = JSON.parse(readFileSync(takesPath, "utf8"));
const last = takes.reduce((m, t) => Math.max(m, t.at + offset), 0);
const duration = Number(flag("duration", String(last + 4)));

// Web Audio's StereoPannerNode on a stereo input (equal power): pan ≤ 0 folds right into left, pan > 0 left into right.
const panExpr = (p) => {
  const x = ((p <= 0 ? p + 1 : p) * Math.PI) / 2;
  const c = Math.cos(x).toFixed(4);
  const s = Math.sin(x).toFixed(4);
  return p <= 0 ? `pan=stereo|c0=c0+${c}*c1|c1=${s}*c1` : `pan=stereo|c0=${c}*c0|c1=c1+${s}*c0`;
};
const esc = (p) => p.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/:/g, "\\:");

const lines = [];
const labels = [];
let missing = 0;
takes.forEach((t, i) => {
  if (!t.url) return;
  const file = join(root, decodeURIComponent(t.url));
  if (!existsSync(file)) {
    missing += 1;
    return;
  }
  const ms = Math.max(0, Math.round((t.at + offset) * 1000));
  lines.push(
    `amovie='${esc(file)}',aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      `asetrate=${Math.round(48000 * t.rate)},aresample=48000,volume=${t.gain.toFixed(4)},${panExpr(t.pan)},adelay=${ms}|${ms}[t${i}]`,
  );
  labels.push(`[t${i}]`);
});
const ducks = takes
  .filter((t) => t.duck)
  .map((t) => `volume=0.08:enable='between(t,${(t.at + offset).toFixed(3)},${(t.at + offset + t.duck).toFixed(3)})'`);
const silence = `anullsrc=r=48000:cl=stereo,atrim=0:${duration.toFixed(3)}[base]`;
lines.push(silence);
labels.push("[base]");
const post = [`amix=inputs=${labels.length}:normalize=0:duration=longest`, ...ducks, "volume=0.9", "aresample=192000", "alimiter=limit=0.89:attack=1:release=50:level=0", "aresample=48000", `atrim=0:${duration.toFixed(3)}`].join(",");
lines.push(`${labels.join("")}${post}[out]`);

const dir = mkdtempSync(join(tmpdir(), "mix-lab-sound-"));
const script = join(dir, "graph.txt");
writeFileSync(script, lines.join(";\n"));
// ffmpeg 7.1+ reads an option's value from a file with "-/option" (-filter_complex_script is gone).
const run = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-/filter_complex", script, "-map", "[out]", "-c:a", "pcm_s16le", resolve(outPath)], { encoding: "utf8" });
rmSync(dir, { recursive: true, force: true });
if (run.status !== 0) {
  console.error(run.stderr.slice(-1500));
  process.exit(1);
}
console.log(JSON.stringify({ out: resolve(outPath), takes: labels.length - 1, ducks: ducks.length, missing, duration: +duration.toFixed(3) }));
