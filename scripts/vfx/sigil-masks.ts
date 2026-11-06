import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SIGIL_MASK_IDS, SIGIL_PLANES } from "../../src/view/skills/painted-sigils";
import { brightBox, cropOf, maskSize, packChannels, SIGIL_SOURCES } from "./sigil-masks-lib";

const magick = process.env.ART_MAGICK ?? "magick";
const maxBuffer = 64 * 1024 * 1024;

function main(): void {
  const args = process.argv.slice(2);
  let src = "art-src/lab/firefly-sprint-2026-11-05/stills/skills/";
  let out = "art-src/lab/vfx/sigils/";
  let force = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--force") { force = true; continue; }
    if (arg === "--src" || arg === "--out" || arg.startsWith("--src=") || arg.startsWith("--out=")) {
      const equal = arg.indexOf("=");
      const name = equal >= 0 ? arg.slice(0, equal) : arg;
      const value = equal >= 0 ? arg.slice(equal + 1) : args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
      if (name === "--src") src = value;
      else out = value;
    } else throw new Error(`Unknown flag: ${arg}`);
  }
  src = resolve(src); out = resolve(out);
  const outputs = [...SIGIL_MASK_IDS.map((id) => join(out, `metal-${id}.png`)), join(out, "manifest.json")];
  if (!force && outputs.some((file) => existsSync(file))) throw new Error("Output already exists; use --force. Nothing written.");
  for (const id of SIGIL_MASK_IDS) {
    const file = join(src, SIGIL_SOURCES[id].file);
    if (!existsSync(file)) throw new Error(`Missing source: ${file}`);
  }
  mkdirSync(out, { recursive: true });
  const masks = SIGIL_MASK_IDS.map((id) => {
    const source = SIGIL_SOURCES[id];
    const input = join(src, source.file);
    const dims = execFileSync(magick, [input, "-format", "%w %h", "info:"], { encoding: "utf8", maxBuffer }).trim().split(/\s+/).map(Number);
    const [w, h] = dims as [number, number];
    const rgb = execFileSync(magick, [input, "-alpha", "off", "-depth", "8", "rgb:-"], { maxBuffer });
    const maxCh = new Uint8Array(w * h);
    for (let i = 0; i < maxCh.length; i += 1) maxCh[i] = Math.max(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
    const box = brightBox(maxCh, w, h);
    if (box === null) throw new Error(`Empty source: ${input}`);
    const crop = cropOf(box, source.crop);
    const metres = SIGIL_PLANES[id];
    const px = maskSize(metres, crop.w, crop.h);
    const aspect = crop.w / crop.h;
    const resized = execFileSync(magick, [input, "-alpha", "off", "-bordercolor", "black", "-border", "1024", "-crop", `${crop.w}x${crop.h}+${crop.x + 1024}+${crop.y + 1024}`, "+repage", ...(source.flop ? ["-flop"] : []), "-filter", "Lanczos", "-resize", `${px[0]}x${px[1]}!`, "-depth", "8", "rgb:-"], { maxBuffer });
    const packed = packChannels(resized, px[0], px[1], 0.15 * px[0] / metres, 0.15 * px[1] / (metres / aspect));
    const file = `metal-${id}.png`;
    execFileSync(magick, ["-size", `${px[0]}x${px[1]}`, "-depth", "8", "rgb:-", "-strip", "-define", "png:color-type=2", join(out, file)], { input: packed.data, maxBuffer });
    const md5 = createHash("md5").update(readFileSync(join(out, file))).digest("hex");
    return { id, file, source: source.file, md5, metres, aspect: Number(aspect.toFixed(4)), px, crop: [crop.x, crop.y, crop.w, crop.h], flop: source.flop, hotT: packed.hotT, hotShare: packed.hotShare };
  });
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ version: 1, kind: "sigil-masks", element: "metal", channels: { lines: "r", glow: "g", hot: "b" }, pxPerMetre: 38, masks }, null, 2) + "\n");
  console.table(masks.map((m) => ({ id: m.id, crop: m.crop.join(","), px: m.px.join("×"), aspect: m.aspect, hotT: m.hotT.toFixed(2), hotShare: m.hotShare.toFixed(6), md5: m.md5 })));
}

try { main(); } catch (error) {
  console.error(`[sigil-masks] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
