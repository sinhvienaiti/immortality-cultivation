// Mixes a skills-lab capture's sound offline (03/11/2026): fixed-step captures have no live audio, so the lab records
// what it would play (src/lab/sound.ts record()/takes(), through __lab.soundRecord() and __lab.soundTakes()) and this
// rebuilds it on the capture's clock with ffmpeg: each take at its time, its bus gain, its ±5 % rate, a pan like Web
// Audio's StereoPannerNode (its stereo law for stereo files, its mono law for mono ones), callouts cut where the lab
// reset (live, reset() stops them), the hush ducks as a per-sample gain with the live 12 ms / 10 ms ramps, then the
// master gain (0.9, as live) and a limiter. Mux the result with the frames' video. A take's time is the lab clock at
// the start of the frame that asked for it, so when a capture shoots each frame after its step (frame k = step k + 1
// since soundRecord()), the offset is 0; pass --offset=<1/fps> when frame 0 is shot before the first step.
//   node scripts/visual/mix-lab-sound.mjs <takes.json> <out.wav> [--duration=<s>] [--offset=<s>] [--root=<dir>]
// takes.json: the array of takes; root: the folder served at "/" (default: this repo), so "/art-src/…" urls resolve.
// Default duration: until the longest take ends (pass the video's length, frames / fps, to match a capture).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SR = 48000;
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

const fileOf = (url) => {
  let path = url;
  try {
    path = decodeURIComponent(url);
  } catch {
    // a literal "%" in a file name: use it as it is
  }
  return join(root, path);
};
/** Duration (s) and channel count of each file, probed once. */
const probes = new Map();
const probe = (file) => {
  if (!probes.has(file)) {
    const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=channels", "-of", "json", file], { encoding: "utf8" });
    const j = r.status === 0 ? JSON.parse(r.stdout) : {};
    probes.set(file, { duration: Number(j.format?.duration ?? 0), channels: Number(j.streams?.[0]?.channels ?? 2) });
  }
  return probes.get(file);
};

// Web Audio's StereoPannerNode (equal power). Stereo input: pan ≤ 0 folds right into left, pan > 0 left into right.
// Mono input: left cos, right sin of (pan + 1) / 2 × π/2.
const panStereo = (p) => {
  const x = ((p <= 0 ? p + 1 : p) * Math.PI) / 2;
  const c = Math.cos(x).toFixed(4);
  const s = Math.sin(x).toFixed(4);
  return p <= 0 ? `pan=stereo|c0=c0+${c}*c1|c1=${s}*c1` : `pan=stereo|c0=${c}*c0|c1=c1+${s}*c0`;
};
const panMono = (p) => {
  const x = (((p + 1) / 2) * Math.PI) / 2;
  return `pan=stereo|c0=${Math.cos(x).toFixed(4)}*c0|c1=${Math.sin(x).toFixed(4)}*c0`;
};

const stops = takes.filter((t) => t.stopVoices).map((t) => t.at + offset);
const ducks = takes.filter((t) => t.duck).map((t) => [t.at + offset, t.duck]);
const sounding = [];
let missing = 0;
for (const t of takes) {
  if (!t.url) continue;
  const file = fileOf(t.url);
  if (!existsSync(file)) {
    missing += 1;
    continue;
  }
  const { duration: len, channels } = probe(file);
  const at = Math.max(0, t.at + offset);
  let end = at + len / t.rate;
  // A callout still sounding when the lab reset stops there.
  if (t.voice) for (const s of stops) if (s > at && s < end) end = s;
  sounding.push({ ...t, file, at, end, channels, cut: end < at + len / t.rate - 1e-4 });
}
const lastEnd = sounding.reduce((m, t) => Math.max(m, t.end), 0);
const duration = Number(flag("duration", String(lastEnd + 0.25)));

// One input per file, split for its takes; paths go to ffmpeg as arguments, so no filter-graph escaping.
const files = [...new Set(sounding.map((t) => t.file))];
const uses = new Map(files.map((f) => [f, sounding.filter((t) => t.file === f).length]));
const lines = [];
const next = new Map();
files.forEach((f, i) => {
  const n = uses.get(f);
  const outs = Array.from({ length: n }, (_, k) => `[f${i}u${k}]`).join("");
  lines.push(`[${i}:a]aresample=${SR},asplit=${n}${outs}`);
  next.set(f, 0);
});
const labels = [];
sounding.forEach((t, j) => {
  const i = files.indexOf(t.file);
  const k = next.get(t.file);
  next.set(t.file, k + 1);
  const ms = Math.round(t.at * 1000);
  const pan = t.channels === 1 ? `aformat=channel_layouts=mono,${panMono(t.pan)}` : `aformat=channel_layouts=stereo,${panStereo(t.pan)}`;
  const len = t.end - t.at;
  const cut = t.cut ? `,atrim=end=${len.toFixed(4)},afade=t=out:st=${Math.max(0, len - 0.01).toFixed(4)}:d=0.01` : "";
  lines.push(`[f${i}u${k}]asetrate=${Math.round(SR * t.rate)},aresample=${SR}${cut},aformat=sample_fmts=fltp,${pan},volume=${t.gain.toFixed(4)},adelay=${ms}|${ms}[t${j}]`);
  labels.push(`[t${j}]`);
});
lines.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${duration.toFixed(4)}[base]`);
labels.push("[base]");

// The hush: every bus to 8 % over 12 ms, held, back over 10 ms (LabSound.duck), as a per-sample gain.
const duckGain = ducks.map(([a, s]) => {
  const b = a + 0.012;
  const c = a + s;
  const d = c + 0.01;
  return `if(lt(t,${a.toFixed(4)}),1,if(lt(t,${b.toFixed(4)}),1-0.92*(t-${a.toFixed(4)})/0.012,if(lt(t,${c.toFixed(4)}),0.08,if(lt(t,${d.toFixed(4)}),0.08+0.92*(t-${c.toFixed(4)})/0.01,1))))`;
});
const gain = duckGain.length === 0 ? "" : duckGain.reduce((acc, g) => (acc === "" ? g : `min(${acc},${g})`), "");
const fadeAt = Math.max(0, duration - 0.05).toFixed(4);
const post = [
  `amix=inputs=${labels.length}:normalize=0:duration=longest`,
  // Sample-count timestamps: the ducks and the trim land on exact samples whatever the inputs' frame sizes.
  "asetpts=N/SR/TB",
  // Quoted: the expression's commas would otherwise split the filter chain.
  ...(gain ? [`aeval=exprs='val(0)*(${gain})|val(1)*(${gain})':c=same`] : []),
  "volume=0.9",
  `aresample=192000,alimiter=limit=0.89:attack=1:release=50:level=0,aresample=${SR}`,
  "asetpts=N/SR/TB",
  `atrim=end_sample=${Math.round(duration * SR)}`,
  `afade=t=out:st=${fadeAt}:d=0.05`,
].join(",");
lines.push(`${labels.join("")}${post}[out]`);

const dir = mkdtempSync(join(tmpdir(), "mix-lab-sound-"));
const script = join(dir, "graph.txt");
writeFileSync(script, lines.join(";\n"));
const inputs = files.flatMap((f) => ["-i", f]);
// ffmpeg 7.1+ reads an option's value from a file with "-/option" (-filter_complex_script is gone).
const run = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-/filter_complex", script, "-map", "[out]", "-c:a", "pcm_s16le", resolve(outPath)], { encoding: "utf8", maxBuffer: 1 << 26 });
rmSync(dir, { recursive: true, force: true });
if (run.status !== 0) {
  console.error(run.stderr.slice(-1500));
  process.exit(1);
}
console.log(JSON.stringify({ out: resolve(outPath), takes: sounding.length, cut: sounding.filter((t) => t.cut).length, ducks: ducks.length, missing, duration: +duration.toFixed(3) }));
