// Ticket 269: deterministic audit, one approved attack edit, trims and shared convolution IR.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SOUND_TIER, SOUND_TRIM_DB, TIER_TARGET, staticDb } from "../../src/lab/sound-tiers.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// The worktree has no art-src; never follow a worktree-local media link for writes.
const AUDIO = "/Volumes/SS990TPRO/htdocs/typing-game/games/immortality-cultivation/art-src/lab/audio";
const AUDIT = "/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/sound-audit";
const IR = join(AUDIO, "ir/hall-a.wav");
const IR_JSON = join(AUDIO, "ir/hall-a.json");
const FIXTURE = join(ROOT, "tests/lab/fixtures/sound-audit-summary.json");
const args = process.argv.slice(2);
const force = args.includes("--force");
const check = args.includes("--check");
const [command, ...files] = args.filter((a) => !a.startsWith("--"));
if (args.some((a) => a.startsWith("--") && a !== "--force" && a !== "--check")) throw new Error("Unknown flag");
const SR = 48000;
const RT60 = 2.2;
const json = (value, space) => JSON.stringify(value, (_key, v) => typeof v === "number" && !Number.isFinite(v) ? String(v) : v, space);

function run(program, argv, encoding = null) {
  console.log([program, ...argv].map((v) => /^[\w./:=+,-]+$/.test(v) ? v : `'${v.replaceAll("'", "'\\''")}'`).join(" "));
  const r = spawnSync(program, argv, { encoding, maxBuffer: 1 << 27 });
  if (r.error || r.status !== 0) throw new Error(`${program}: ${r.error?.message ?? r.stderr?.toString().slice(-3000)}`);
  return r;
}
function ffmpeg(argv) {
  return run("ffmpeg", ["-hide_banner", "-nostdin", ...argv]);
}
function audioPath(file) {
  return isAbsolute(file) ? file : existsSync(resolve(file)) ? resolve(file) : join(AUDIO, file);
}
function measure(file) {
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", file], "utf8").stdout);
  const pcm = ffmpeg(["-v", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"]).stdout;
  const samples = pcm.length / 4;
  const energy = new Float64Array(samples + 1);
  for (let i = 0; i < samples; i++) {
    const v = pcm.readFloatLE(i * 4);
    energy[i + 1] = energy[i] + v * v;
  }
  const envelope = [];
  for (let start = 0; start + 160 <= samples; start += 16) envelope.push((energy[start + 160] - energy[start]) / 160);
  const peak = envelope.reduce((best, v, i) => v > envelope[best] ? i : best, 0);
  const peakPower = envelope[peak];
  if (!(peakPower > 0)) throw new Error(`Silent or short file: ${file}`);
  const first = envelope.findIndex((v) => v >= peakPower * 0.01);
  let tail40 = peak;
  for (let i = peak; i < envelope.length; i++) if (envelope[i] >= peakPower * 0.0001) tail40 = i;
  const at500 = envelope[peak + 500] ?? 0;
  // Pad the end so ebur128's 400 ms window also sees short and early transients.
  const meter = ffmpeg(["-i", file, "-af", "apad=pad_dur=1,ebur128=peak=true", "-f", "null", "-"]).stderr.toString();
  const moments = [...meter.matchAll(/\bM:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const peaks = [...meter.matchAll(/Peak:\s*(-?[\d.]+)\s*dBFS/g)];
  if (!moments.length || !peaks.length) throw new Error(`Missing ebur128 measurements: ${file}`);
  return {
    file, duration: samples / 16000, containerDuration: Number(probe.format.duration),
    sampleRate: Number(probe.streams[0].sample_rate), channels: probe.streams[0].channels,
    mMax: Math.max(...moments), tp: Number(peaks.at(-1)[1]),
    tPeak: peak / 1000, atk: peak - first, t40: tail40 - peak,
    at500Db: at500 > 0 ? 10 * Math.log10(at500 / peakPower) : -Infinity,
  };
}
function writable(paths) {
  for (const path of paths) if (existsSync(path) && !force) throw new Error(`Already exists (use --force): ${path}`);
}
function gates(original, edited) {
  const result = {
    duration: edited.duration >= 1,
    tail500: edited.at500Db >= -30,
    momentary: Math.abs(edited.mMax - original.mMax) <= 1.5,
    attack: edited.atk <= 30,
    truePeak: edited.tp <= -1,
  };
  console.log(json({ original, edited, gates: result }, 2));
  if (Object.values(result).some((pass) => !pass)) throw new Error("Attack gates failed");
}
function attack(inputs) {
  if (inputs.length !== 1 || inputs[0] !== "release-k7/03.ogg") throw new Error("This ticket permits attack release-k7/03.ogg only");
  const input = join(AUDIO, inputs[0]);
  const output = join(AUDIO, "release-k7/03a.ogg");
  const manifestPath = join(AUDIO, "manifest.next.json");
  writable([output, manifestPath]);
  const original = measure(input);
  const start = Math.max(0, original.tPeak - 0.030);
  let written = false;
  try {
    ffmpeg([force ? "-y" : "-n", "-i", input, "-ar", "48000", "-af", `atrim=start=${start.toFixed(6)},asetpts=PTS-STARTPTS,afade=t=in:d=0.003`, "-c:a", "libopus", "-b:a", "128k", output]);
    written = true;
    gates(original, measure(output));
  } catch (error) {
    if (written && existsSync(output)) unlinkSync(output);
    throw error;
  }
  const manifest = JSON.parse(readFileSync(join(AUDIO, "manifest.json"), "utf8"));
  manifest["release-k7"] = ["03a.ogg"];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n", { flag: force ? "w" : "wx" });
  console.log(`attack: start=${start.toFixed(6)}; wrote ${output} and ${manifestPath}`);
}
function trims() {
  const summaryPath = join(AUDIT, "summary-by-event.json");
  const manifestPath = join(AUDIO, "manifest.next.json");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const k7 = manifest["release-k7"].map((file) => measure(join(AUDIO, "release-k7", file)));
  if (k7.length !== 1 || manifest["release-k7"][0] !== "03a.ogg") throw new Error("release-k7 must use only 03a.ogg");
  const events = summary.map(({ id, mMax, tp }) => id === "release-k7"
    ? { id, mMax: Math.max(...k7.map((m) => m.mMax)), tp: Math.max(...k7.map((m) => m.tp)) }
    : { id, mMax, tp }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const fixture = {
    source: { audit: summaryPath, releaseK7: { manifest: manifestPath, files: manifest["release-k7"].map((f) => join(AUDIO, "release-k7", f)) } },
    events,
  };
  const bytes = JSON.stringify(fixture, null, 2) + "\n";
  const old = existsSync(FIXTURE) ? readFileSync(FIXTURE, "utf8") : null;
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, bytes);
  console.log(`fixture: ${old === null ? "created" : old === bytes ? "unchanged" : "changed"}`);
  const byId = new Map(events.map((m) => [m.id, m]));
  let mismatches = 0;
  console.log("| id | tier | mMax | tp | staticDb | trim | playback | capped | shortfall LU | missing |");
  console.log("|---|---|---:|---:|---:|---:|---:|---|---:|---|");
  const generated = {};
  for (const id of Object.keys(SOUND_TIER).sort()) {
    const tier = SOUND_TIER[id];
    const m = byId.get(id);
    const voice = tier === "voice";
    const targetDelta = m && !voice ? TIER_TARGET[tier] - m.mMax : 0;
    const ceilingDelta = m && !voice ? -1 - m.tp : 0;
    const capped = !!m && !voice && ceilingDelta < targetDelta;
    const trim = !m || voice ? 0 : Math.round((Math.min(targetDelta, ceilingDelta) - staticDb(id)) * 10) / 10;
    generated[id] = trim;
    const playback = m ? m.mMax + trim + staticDb(id) : null;
    console.log(`| ${id} | ${tier} | ${m?.mMax ?? "—"} | ${m?.tp ?? "—"} | ${staticDb(id).toFixed(2)} | ${trim.toFixed(1)} | ${playback?.toFixed(2) ?? "—"} | ${capped} | ${(capped ? targetDelta - ceilingDelta : 0).toFixed(1)} | ${!m} |`);
    if (SOUND_TRIM_DB[id] === undefined || Math.abs(SOUND_TRIM_DB[id] - trim) > 0.05) mismatches++;
  }
  for (const id of Object.keys(SOUND_TRIM_DB)) if (!(id in generated)) mismatches++;
  console.log(`SOUND_TRIM_DB = ${JSON.stringify(generated, null, 2)};`);
  if (mismatches) throw new Error(`${mismatches} trim table mismatches; update sound-tiers.ts from the printed table`);
}
function mulberry32(seed) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeWav() {
  const count = Math.round(2.4 * SR);
  const channels = [new Float64Array(count), new Float64Array(count)];
  let peak = 0;
  channels.forEach((channel, c) => {
    const random = mulberry32(0x7ab1e + c);
    for (let n = 0; n < count; n++) {
      const t = n / SR;
      const noise = 2 * random() - 1;
      const fade = Math.min(1, (count - 1 - n) / (0.05 * SR));
      const v = t < 0.008 ? 0 : noise * Math.exp(-6.91 * t / RT60) * fade;
      channel[n] = v;
      peak = Math.max(peak, Math.abs(v));
    }
  });
  const wav = Buffer.alloc(44 + count * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(count * 4, 40);
  const scale = 10 ** (-1 / 20) / peak;
  for (let n = 0; n < count; n++) for (let c = 0; c < 2; c++) wav.writeInt16LE(Math.round(channels[c][n] * scale * 32768), 44 + (n * 2 + c) * 2);
  return wav;
}
function readIr() {
  const wav = readFileSync(IR);
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid IR WAV");
  let format, data;
  for (let at = 12; at + 8 <= wav.length;) {
    const name = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (at + 8 + size > wav.length) throw new Error("Truncated IR WAV");
    if (name === "fmt ") format = wav.subarray(at + 8, at + 8 + size);
    if (name === "data") data = wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!format || !data || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 2 || format.readUInt32LE(4) !== SR || format.readUInt16LE(14) !== 16 || data.length !== 2.4 * SR * 4) throw new Error("IR must be PCM16 stereo, 48 kHz, 2.4 s");
  const count = data.length / 4;
  const channels = [new Float64Array(count), new Float64Array(count)];
  let sum = 0;
  for (let n = 0; n < count; n++) for (let c = 0; c < 2; c++) {
    const v = data.readInt16LE((n * 2 + c) * 2) / 32768;
    channels[c][n] = v;
    sum += v * v;
  }
  let power = Math.sqrt(sum / (count * 2));
  if (!Number.isFinite(power) || power < 0.000125) power = 0.000125;
  const webAudioScale = 0.00125 * 44100 / SR / power;
  // Schroeder integration, least-squares T30 slope over -5 .. -35 dB, both channels' energy.
  const schroeder = new Float64Array(count);
  let total = 0;
  for (let n = count - 1; n >= 0; n--) { total += channels[0][n] ** 2 + channels[1][n] ** 2; schroeder[n] = total; }
  let points = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let n = 0; n < count; n++) {
    const db = 10 * Math.log10(schroeder[n] / total);
    if (db > -5 || db < -35) continue;
    const t = n / SR;
    points++; sx += t; sy += db; sxx += t * t; sxy += t * db;
  }
  const slope = (points * sxy - sx * sy) / (points * sxx - sx * sx);
  const measuredRT60 = -60 / slope;
  if (!Number.isFinite(measuredRT60) || Math.abs(measuredRT60 - RT60) > 0.15) throw new Error(`T30 outside range: ${measuredRT60}`);
  return { channels, webAudioScale, measuredRT60 };
}
function impulseTest(channels, scale) {
  const pcm = ffmpeg(["-v", "error", "-f", "lavfi", "-i", "aevalsrc='if(eq(n,0),1,0)|if(eq(n,0),1,0)':s=48000:d=2.5", "-i", IR,
    "-filter_complex", `[0:a][1:a]afir=irnorm=-1:irgain=1,volume=${scale}`, "-f", "f32le", "pipe:1"]).stdout;
  if (pcm.length !== 2.5 * SR * 8) throw new Error(`Unexpected impulse output length: ${pcm.length}`);
  const results = channels.map((h, c) => {
    let expectedEnergy = 0, actualEnergy = 0, peak = 0;
    const actual = new Float64Array(pcm.length / 8);
    for (const v of h) expectedEnergy += (scale * v) ** 2;
    for (let n = 0; n < actual.length; n++) {
      const v = pcm.readFloatLE((n * 2 + c) * 4);
      actual[n] = v; actualEnergy += v * v; peak = Math.max(peak, Math.abs(v));
    }
    const energyDeltaDb = 10 * Math.log10(actualEnergy / expectedEnergy);
    const onset = actual.findIndex((v) => Math.abs(v) > peak * 0.001);
    const expectedOnset = h.findIndex((v) => v !== 0);
    return { channel: c === 0 ? "left" : "right", energyDeltaDb, onset, expectedOnset, pass: Math.abs(energyDeltaDb) <= 0.1 && onset === expectedOnset && onset === 384 };
  });
  console.log(JSON.stringify({ impulse: results }));
  if (results.some((r) => !r.pass)) throw new Error("afir impulse test failed");
  return results;
}
function ir() {
  if (check) {
    const meta = JSON.parse(readFileSync(IR_JSON, "utf8"));
    const measured = readIr();
    const scaleRelativeError = Math.abs(measured.webAudioScale / meta.webAudioScale - 1);
    const rt60Delta = Math.abs(measured.measuredRT60 - meta.measuredRT60);
    console.log(JSON.stringify({ mode: "check", webAudioScale: measured.webAudioScale, measuredRT60: measured.measuredRT60, scaleRelativeError, rt60Delta }));
    if (!(scaleRelativeError <= 1e-6) || !(rt60Delta <= 0.01)) throw new Error("IR metadata differs from WAV");
    impulseTest(measured.channels, meta.webAudioScale);
    return;
  }
  writable([IR, IR_JSON]);
  mkdirSync(dirname(IR), { recursive: true });
  writeFileSync(IR, makeWav(), { flag: force ? "w" : "wx" });
  const measured = readIr();
  const impulse = impulseTest(measured.channels, measured.webAudioScale);
  const meta = {
    algorithm: "Independent mulberry32 white noise [-1,1), exp(-6.91*t/RT60), first 8 ms zero, final 50 ms linear fade, peak -1 dBFS, round to signed PCM16",
    seeds: [0x7ab1e, 0x7ab1f], sampleRate: SR, channels: 2, duration: 2.4, bits: 16,
    RT60, preDelay: 0.008, fadeOut: 0.05, peakDbFS: -1,
    webAudioScale: measured.webAudioScale, measuredRT60: measured.measuredRT60,
    rt60Method: "Schroeder integrated energy, stereo sum, T30 least-squares -5 to -35 dB, extrapolated to -60 dB",
    normalization: "0.00125 * 44100 / 48000 / max(0.000125, RMS of all stored PCM16 samples / 32768)",
    impulse,
    purpose: "IR is a processor, not a replacement sound; owner listening approval pending. Replace with a recorded CC0 IR when available.",
  };
  writeFileSync(IR_JSON, JSON.stringify(meta, null, 2) + "\n", { flag: force ? "w" : "wx" });
  console.log(JSON.stringify({ mode: "created", webAudioScale: measured.webAudioScale, measuredRT60: measured.measuredRT60 }));
}

try {
  if (check && command !== "ir") throw new Error("--check is only for ir");
  if (command === "measure") {
    if (!files.length) throw new Error("measure requires files");
    const measured = files.map((f) => measure(audioPath(f)));
    measured.forEach((m) => console.log(json(m)));
    const audit = JSON.parse(readFileSync(join(AUDIT, "measurements.json"), "utf8"));
    for (const m of measured) {
      const rel = relative(AUDIO, m.file);
      const old = audit.find((r) => `${r.id}/${r.file}` === rel);
      if (old?.id === "release-k7" && (Math.abs(m.mMax - old.momentaryMaxLUFS) > 0.1000001 || Math.abs(m.tp - old.truePeakDBTP) > 0.1000001)) throw new Error(`Audit reproduction differs by > 0.1: ${rel}`);
    }
    for (const m of measured) if (m.file === join(AUDIO, "release-k7/03a.ogg")) gates(measure(join(AUDIO, "release-k7/03.ogg")), m);
  } else if (command === "attack") attack(files);
  else if (command === "trims") trims();
  else if (command === "ir") ir();
  else throw new Error("Usage: lab-sound-tiers.mjs measure <file…> | trims | attack release-k7/03.ogg [--force] | ir [--check|--force]");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
