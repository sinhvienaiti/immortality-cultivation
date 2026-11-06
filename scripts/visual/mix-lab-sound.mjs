// Mixes a skills-lab capture's sound offline (03/11/2026): fixed-step captures have no live audio, so the lab records
// what it would play (src/lab/sound.ts record()/takes(), through __lab.soundRecord() and __lab.soundTakes()) and this
// rebuilds it on the capture's clock with ffmpeg: each take at its time, its bus gain, its ±5 % rate, a pan like Web
// Audio's StereoPannerNode (its stereo law for stereo files, its mono law for mono ones), callouts cut where the lab
// reset (live, reset() stops them), the hush ducks as a per-sample gain with the live 12 ms / 10 ms ramps, then the
// master gain (0.9, as live) and a limiter. Mux the result with the frames' video. A take's time is the lab clock at
// the start of the frame that asked for it, so when a capture shoots each frame after its step (frame k = step k + 1
// since soundRecord()), the offset is 0; pass --offset=<1/fps> when frame 0 is shot before the first step.
//   node scripts/visual/mix-lab-sound.mjs <takes.json> <out.wav> [--duration=<s>] [--offset=<s>] [--root=<dir>] [--ir=<file>]
// takes.json: the array of takes; root: the folder served at "/" (default: this repo), so "/art-src/…" urls resolve.
// A send is relative to the recorded dry bus gain. Old takes have send=0. The shared wet return joins before
// hush and master, as live; its silent full-length bed preserves afir's tail after the final take.
// Default duration: longest take + 25 ms + IR duration with sends; otherwise longest take + 250 ms.
// The mix pass (06/11): a take may start into its file (`from`), fade out (`fade`: from s after its start, over s) and
// belong to a capped voice group (`group`, sound-tiers.ts VOICE_CAP: a new voice over the cap fades the oldest, as live);
// the wet return dips at 1–4 kHz (SPEECH_DIP); --music=<file> lays a looped bed at MUSIC.gain under the mix with the
// recorded pre-ducks (`musicDuck`); --raw writes 32-bit float without the limiter (to read the true peak).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LIMITER, MUSIC, SPEECH_DIP, VOICE_CAP } from "../../src/lab/sound-tiers.ts";

const SR = 48000;
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const [takesPath, outPath] = args.filter((a) => !a.startsWith("--"));
if (takesPath === undefined || outPath === undefined) {
  console.error("Usage: node scripts/visual/mix-lab-sound.mjs <takes.json> <out.wav> [--duration=<s>] [--offset=<s>] [--root=<dir>] [--ir=<file>]");
  process.exit(2);
}
const root = resolve(flag("root", join(dirname(fileURLToPath(import.meta.url)), "..", "..")));
const offset = Number(flag("offset", "0"));
const musicFile = flag("music", "");
const raw = args.includes("--raw");
const takes = JSON.parse(readFileSync(takesPath, "utf8"));
const hasWet = takes.some((t) => t.url && (t.send ?? 0) > 0);
const irFile = resolve(flag("ir", join(root, "art-src/lab/audio/ir/hall-a.wav")));
const irMeta = irFile.replace(/\.[^.]+$/, "") + ".json";
let irScale = 0;
if (hasWet) {
  if (!existsSync(irFile) || !existsSync(irMeta)) throw new Error(`Reverb send requires IR and metadata: ${irFile}, ${irMeta}`);
  irScale = JSON.parse(readFileSync(irMeta, "utf8")).webAudioScale;
  if (!(irScale > 0) || !Number.isFinite(irScale)) throw new Error(`Invalid webAudioScale: ${irMeta}`);
}

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
    if (r.status !== 0) throw new Error(`Cannot probe ${file}: ${r.stderr}`);
    const j = JSON.parse(r.stdout);
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
  const { duration: fileLen, channels } = probe(file);
  const from = Math.max(0, t.from ?? 0);
  const len = Math.max(0.01, (fileLen - from) / t.rate);
  const at = Math.max(0, t.at + offset);
  let end = at + len;
  let fadeLen = 0.01;
  // A long file shortened to its skill fades out.
  if (t.fade && t.fade[0] + t.fade[1] < len) {
    end = at + t.fade[0] + t.fade[1];
    fadeLen = t.fade[1];
  }
  // A callout still sounding when the lab reset stops there.
  if (t.voice) for (const s of stops) if (s > at && s < end) {
    end = s;
    fadeLen = 0.01;
  }
  sounding.push({ ...t, file, from, at, end, fadeLen, channels, cut: end < at + len - 1e-4 });
}
// Capped voice groups, as live: a voice over its group's cap fades the oldest still sounding.
for (const [group, cap] of Object.entries(VOICE_CAP)) {
  const live = [];
  for (const t of sounding.filter((x) => x.group === group).sort((a, b) => a.at - b.at)) {
    for (let k = live.length - 1; k >= 0; k -= 1) if (live[k].end <= t.at) live.splice(k, 1);
    while (live.length >= cap.max) {
      const old = live.shift();
      if (t.at + cap.fade < old.end) {
        old.end = t.at + cap.fade;
        old.fadeLen = cap.fade;
        old.cut = true;
      }
    }
    live.push(t);
  }
}
const lastEnd = sounding.reduce((m, t) => Math.max(m, t.end), 0);
const duration = Number(flag("duration", String(lastEnd + (hasWet ? 0.025 + probe(irFile).duration : 0.25))));

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
const wetLabels = [];
/** UI takes join after the headroom and the limiter, at the master's gain (live: their own node to the output). */
const uiLabels = [];
sounding.forEach((t, j) => {
  const i = files.indexOf(t.file);
  const k = next.get(t.file);
  next.set(t.file, k + 1);
  const ms = Math.round(t.at * 1000);
  const pan = t.channels === 1 ? `aformat=channel_layouts=mono,${panMono(t.pan)}` : `aformat=channel_layouts=stereo,${panStereo(t.pan)}`;
  const len = t.end - t.at;
  const fl = Math.min(t.fadeLen, len);
  const cut = t.cut ? `,atrim=end=${len.toFixed(4)},afade=t=out:st=${Math.max(0, len - fl).toFixed(4)}:d=${fl.toFixed(4)}` : "";
  const start = t.from > 0 ? `atrim=start=${t.from.toFixed(4)},asetpts=PTS-STARTPTS,` : "";
  const split = (t.send ?? 0) > 0 ? `,asplit=2[t${j}][w${j}]` : `[t${j}]`;
  lines.push(`[f${i}u${k}]${start}asetrate=${Math.round(SR * t.rate)},aresample=${SR}${cut},aformat=sample_fmts=fltp,${pan},volume=${t.gain},adelay=${ms}|${ms}${split}`);
  if ((t.send ?? 0) > 0) {
    lines.push(`[w${j}]volume=${t.send}[ws${j}]`);
    wetLabels.push(`[ws${j}]`);
  }
  (t.ui ? uiLabels : labels).push(`[t${j}]`);
});
lines.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${duration.toFixed(4)}[base]`);
labels.push("[base]");
if (hasWet) {
  // afir emits only as many samples as its main input: keep silence running for the full capture.
  lines.push(`anullsrc=r=${SR}:cl=stereo,atrim=0:${duration.toFixed(4)}[wetBase]`);
  wetLabels.push("[wetBase]");
  lines.push(`${wetLabels.join("")}amix=inputs=${wetLabels.length}:normalize=0:duration=longest,adelay=25|25,highpass=f=200:t=q:w=0.7071[wetIn]`);
  lines.push(`[wetIn][${files.length}:a]afir=irnorm=-1:irgain=1,volume=${irScale},lowpass=f=6500:t=q:w=0.7071,equalizer=f=${SPEECH_DIP.freq}:t=q:w=${SPEECH_DIP.q}:g=${SPEECH_DIP.gain},volume=0.7[wet]`);
  labels.push("[wet]");
}

// The hush: every bus to 8 % over 12 ms, held, back over 10 ms (LabSound.duck), as a per-sample gain.
const duckGain = ducks.map(([a, s]) => {
  const b = a + 0.012;
  const c = a + s;
  const d = c + 0.01;
  return `if(lt(t,${a.toFixed(4)}),1,if(lt(t,${b.toFixed(4)}),1-0.92*(t-${a.toFixed(4)})/0.012,if(lt(t,${c.toFixed(4)}),0.08,if(lt(t,${d.toFixed(4)}),0.08+0.92*(t-${c.toFixed(4)})/0.01,1))))`;
});
const gain = duckGain.length === 0 ? "" : duckGain.reduce((acc, g) => (acc === "" ? g : `min(${acc},${g})`), "");
// The music bed and its pre-ducks (sound.ts preDuck): down over MUSIC.ramp from MUSIC.lead before each hit, held, back.
if (musicFile !== "") {
  const ducksM = takes.filter((t) => t.musicDuck).map((t) => {
    const [hitIn, depth, hold] = t.musicDuck;
    const hit = t.at + offset + hitIn;
    return { a: Math.max(0, hit - MUSIC.lead), b: Math.max(0, hit - MUSIC.lead) + MUSIC.ramp, c: hit + hold, d: hit + hold + MUSIC.release, low: 10 ** (depth / 20) };
  });
  const env = ducksM.map(({ a, b, c, d, low }) => `if(lt(t,${a.toFixed(4)}),1,if(lt(t,${b.toFixed(4)}),1-${(1 - low).toFixed(5)}*(t-${a.toFixed(4)})/${(b - a).toFixed(4)},if(lt(t,${c.toFixed(4)}),${low.toFixed(5)},if(lt(t,${d.toFixed(4)}),${low.toFixed(5)}+${(1 - low).toFixed(5)}*(t-${c.toFixed(4)})/${(d - c).toFixed(4)},1))))`);
  const g = env.length === 0 ? "1" : env.reduce((acc, e) => (acc === "" ? e : `min(${acc},${e})`), "");
  const idx = files.length + (hasWet ? 1 : 0);
  lines.push(`[${idx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${duration.toFixed(4)},asetpts=N/SR/TB,volume=${MUSIC.gain},aeval=exprs='val(0)*(${g})|val(1)*(${g})':c=same[music]`);
  labels.push("[music]");
}
const fadeAt = Math.max(0, duration - 0.05).toFixed(4);
const post = [
  `amix=inputs=${labels.length}:normalize=0:duration=longest`,
  // Sample-count timestamps: the ducks and the trim land on exact samples whatever the inputs' frame sizes.
  "asetpts=N/SR/TB",
  // Quoted: the expression's commas would otherwise split the filter chain.
  ...(gain ? [`aeval=exprs='val(0)*(${gain})|val(1)*(${gain})':c=same`] : []),
  "volume=0.9",
  // The mix's headroom before the limiter (LIMITER; live: before its DynamicsCompressorNode).
  `volume=${(10 ** (LIMITER.headroomDb / 20)).toFixed(5)}`,
  ...(raw ? [] : [`aresample=192000,alimiter=limit=0.89:attack=1:release=50:level=0,aresample=${SR}`]),
  "asetpts=N/SR/TB",
  `atrim=end_sample=${Math.round(duration * SR)}`,
  `afade=t=out:st=${fadeAt}:d=0.05`,
].join(",");
if (uiLabels.length === 0) lines.push(`${labels.join("")}${post}[out]`);
else {
  lines.push(`${labels.join("")}${post}[mixed]`);
  lines.push(`${uiLabels.join("")}amix=inputs=${uiLabels.length}:normalize=0:duration=longest,volume=0.9,apad=whole_dur=${duration.toFixed(4)}[uiMix]`);
  lines.push(`[mixed][uiMix]amix=inputs=2:normalize=0:duration=first,asetpts=N/SR/TB[out]`);
}

const dir = mkdtempSync(join(tmpdir(), "mix-lab-sound-"));
const script = join(dir, "graph.txt");
writeFileSync(script, lines.join(";\n"));
const inputs = files.flatMap((f) => ["-i", f]);
if (hasWet) inputs.push("-i", irFile);
if (musicFile !== "") inputs.push("-stream_loop", "-1", "-i", resolve(musicFile));
// ffmpeg 7.1+ reads an option's value from a file with "-/option" (-filter_complex_script is gone).
const ffmpegArgs = ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-/filter_complex", script, "-map", "[out]", "-c:a", raw ? "pcm_f32le" : "pcm_s16le", resolve(outPath)];
console.log(["ffmpeg", ...ffmpegArgs].map((v) => /^[\w./:=+,-]+$/.test(v) ? v : `'${v.replaceAll("'", "'\\''")}'`).join(" "));
const run = spawnSync("ffmpeg", ffmpegArgs, { encoding: "utf8", maxBuffer: 1 << 26 });
rmSync(dir, { recursive: true, force: true });
if (run.status !== 0) {
  console.error(run.stderr.slice(-1500));
  process.exit(1);
}
console.log(JSON.stringify({ out: resolve(outPath), takes: sounding.length, cut: sounding.filter((t) => t.cut).length, ducks: ducks.length, missing, duration: +duration.toFixed(3) }));
