#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(labRoot, "../..");
const kitRoot = path.join(labRoot, "src/view/skills");
const audioRoot = path.join(repoRoot, "games/immortality-cultivation/art-src/lab/audio");
const sourceRoot = path.join(audioRoot, "../firefly-sprint-2026-11-05/sound");
const manifestPath = path.join(audioRoot, "manifest.json");
const sourcesPath = path.join(audioRoot, "SOURCES.json");
const provenanceKey = "fireflySprint20261105";
const mappings = [
  ["cast", "cast"],
  ["release", "flying-sword-launch"],
  ["release-dash", "dash"],
  ["flyby", "sword-swing"],
  ["impact-flesh", "sword-hit"],
  ["impact-stone", "hit-heavy"],
  ["impact-spirit", "hit-light"],
  ["world-open", "charge-long"],
  ["world-climax", "big-burst"],
  ["world-close", "tail"],
];

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const relative = (file) => path.relative(repoRoot, file).split(path.sep).join("/");
const has = (object, key) => Object.hasOwn(object, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function atomicJSON(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  let owned = false;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 1) + "\n", { flag: "wx" });
    owned = true;
    fs.renameSync(temporary, file);
  } finally {
    if (owned && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// Read the registered kits rather than assuming the element id is its sound suffix.
function elements() {
  const registry = fs.readFileSync(path.join(kitRoot, "elements.ts"), "utf8");
  const imports = new Map([...registry.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+"(\.\/element-[\w-]+)"/g)]
    .map((match) => [match[1], match[2]]));
  const entries = [...registry.matchAll(/\[\s*(\w+)\.id\s*,\s*\1\s*\]/g)];
  if (entries.length !== 14) throw new Error(`Expected 14 registered kits, found ${entries.length}`);
  const kits = entries.map((entry) => {
    const module = imports.get(entry[1]);
    if (!module) throw new Error(`Missing kit import: ${entry[1]}`);
    const text = fs.readFileSync(path.resolve(kitRoot, `${module}.ts`), "utf8");
    const id = text.match(/\bid:\s*"([a-z-]+)"/);
    const sound = text.match(/\bsound:\s*"([a-z-]*)"/);
    if (!id || !sound) throw new Error(`Cannot read literal kit id/sound: ${module}`);
    return { id: id[1], sound: sound[1] };
  });
  if (new Set(kits.map((kit) => kit.id)).size !== kits.length ||
      new Set(kits.map((kit) => kit.sound)).size !== kits.length) {
    throw new Error("Duplicate element id or sound suffix");
  }
  return kits;
}

function readTakes(job) {
  const folder = path.join(sourceRoot, job);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((name) => /^take\d+\.wav$/.test(name))
    .filter((name) => fs.statSync(path.join(folder, name)).isFile())
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .slice(0, 3).map((name, index) => {
      const input = path.join(folder, name);
      const promptFile = input.replace(/\.wav$/, ".prompt.txt");
      const text = fs.readFileSync(promptFile, "utf8");
      const prompt = text.match(/^prompt: ([\s\S]*?)\r?\nduration requested:/m)?.[1];
      if (!prompt) throw new Error(`Missing prompt text: ${promptFile}`);
      return { input, promptFile, prompt, file: `${String(index + 1).padStart(2, "0")}.ogg` };
    });
}

function preserved(before, after, label) {
  for (const [key, value] of Object.entries(before)) {
    if (!has(after, key) || JSON.stringify(after[key]) !== JSON.stringify(value)) {
      throw new Error(`${label} changed during conversion: ${key}; refusing to overwrite`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: lab-element-sounds.mjs [--dry-run]");
  const dryRun = args.includes("--dry-run");
  const manifestBefore = readJSON(manifestPath);
  const sourcesBefore = fs.existsSync(sourcesPath) ? readJSON(sourcesPath) : {};
  if (!record(manifestBefore) || !record(sourcesBefore)) throw new Error("Invalid metadata object");
  const jobs = new Set(readJSON(path.join(repoRoot, "docs/work/tasks/firefly-sprint-sound.json"))
    .jobs.map((job) => job.id));
  const plan = [];
  for (const kit of elements()) {
    for (const [event, kind] of mappings) {
      const id = event + (kit.sound ? `-${kit.sound}` : "");
      const job = `tt-sfx-${kit.id}-${kind}`;
      const row = { element: kit.id, suffix: kit.sound, event, id, job, takes: [] };
      if (fs.existsSync(path.join(audioRoot, id)) || has(manifestBefore, id) ||
          has(sourcesBefore.events ?? {}, id) || has(sourcesBefore[provenanceKey]?.events ?? {}, id)) {
        row.status = "EXISTS";
      } else if (!jobs.has(job)) {
        row.status = "NO_JOB";
      } else {
        row.takes = readTakes(job);
        row.status = row.takes.length ? "ADD" : "NO_TAKES";
      }
      plan.push(row);
    }
  }
  console.log("Hệ\tSự kiện lab\tTrạng thái\tViệc nguồn\tTake");
  for (const row of plan) {
    console.log([row.element, row.id, row.status, row.job,
      row.takes.map((take) => path.basename(take.input)).join(",") || "—"].join("\t"));
  }
  const counts = {};
  for (const row of plan) counts[row.status] = (counts[row.status] ?? 0) + 1;
  console.log(JSON.stringify({ dryRun, counts, files: plan.reduce((sum, row) => sum + row.takes.length, 0) }));
  const additions = plan.filter((row) => row.status === "ADD");
  if (dryRun || !additions.length) return;
  const ffmpeg = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error("ffmpeg is unavailable");
  const encoder = /\blibvorbis\s/.test(ffmpeg.stdout) ? "libvorbis" : "vorbis";
  if (!new RegExp(`\\b${encoder}\\s`).test(ffmpeg.stdout)) throw new Error("ffmpeg has no Vorbis encoder");
  const codecOptions = ["-c:a", encoder, ...(encoder === "vorbis" ? ["-strict", "experimental"] : []), "-q:a", "5"];
  console.log(`Bộ mã hóa: ${encoder}, -q:a 5`);

  for (const row of additions) {
    const folder = path.join(audioRoot, row.id);
    // Exclusive mkdir and ffmpeg -n protect files created by another worker.
    fs.mkdirSync(folder);
    const made = [];
    try {
      for (const take of row.takes) {
        const output = path.join(folder, take.file);
        const converted = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n",
          "-i", take.input, "-map", "0:a:0", ...codecOptions, output], { encoding: "utf8" });
        // No sample-rate option, filters, trim or normalization: preserve the complete take.
        if (converted.error || converted.status !== 0) {
          if (fs.existsSync(output)) made.push(output);
          throw new Error(`ffmpeg failed for ${relative(take.input)}: ${converted.error?.message ?? converted.stderr}`);
        }
        made.push(output);
      }
    } catch (error) {
      // Only this invocation's new files are removed; old event folders never enter this loop.
      for (const file of made) fs.unlinkSync(file);
      fs.rmdirSync(folder);
      throw error;
    }
    console.log(`Đã đổi ${row.id}: ${row.takes.length} file`);

    // Re-read and merge after each event, so completed work survives an interrupted run.
    const manifest = readJSON(manifestPath);
    const sources = fs.existsSync(sourcesPath) ? readJSON(sourcesPath) : {};
    preserved(manifestBefore, manifest, "manifest");
    if (has(manifest, row.id) || has(sources.events ?? {}, row.id) ||
        has(sources[provenanceKey]?.events ?? {}, row.id)) {
      throw new Error(`Metadata already contains ${row.id}; refusing to overwrite`);
    }
    sources.events ??= {};
    sources[provenanceKey] ??= {
      note: "Phiếu 330: lấy ba take đầu có thật; Vorbis q=5, giữ tần số mẫu và toàn bộ âm, không chuẩn hóa. NOT LISTENED; chờ chủ dự án nghe trong lab.",
      events: {},
    };
    if (!record(sources.events) || !record(sources[provenanceKey].events)) {
      throw new Error("Invalid SOURCES event maps");
    }
    sources.events[row.id] = [row.job];
    sources[provenanceKey].events[row.id] = {
      encoder,
      quality: 5,
      variants: row.takes.map((take) => ({
        file: take.file,
        layers: [{ source: row.job, take: relative(take.input), promptFile: relative(take.promptFile), prompt: take.prompt }],
      })),
    };
    manifest[row.id] = row.takes.map((take) => take.file);
    atomicJSON(sourcesPath, sources);
    atomicJSON(manifestPath, manifest);
  }
  console.log(`Hoàn tất: ${additions.length} sự kiện mới.`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
