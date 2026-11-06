import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SIGIL_MASK_IDS, SIGIL_PLANES } from "../../src/view/skills/painted-sigils";
import { brightBox, COLOR_SIGIL_ELEMENTS, cropOf, maskSize, packChannels, packColor, sigilSourcesFor } from "./sigil-masks-lib";

const magick = process.env.ART_MAGICK ?? "magick";
const maxBuffer = 64 * 1024 * 1024;

function main(): void {
  const args = process.argv.slice(2);
  let src = "art-src/lab/firefly-sprint-2026-11-05/stills/skills/";
  let out = "art-src/lab/vfx/sigils/";
  let force = false;
  let element = "metal";
  let allColors = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--force") { force = true; continue; }
    if (arg === "--all-colors") { allColors = true; continue; }
    if (["--src", "--out", "--element"].some((name) => arg === name || arg.startsWith(name + "="))) {
      const equal = arg.indexOf("=");
      const name = equal >= 0 ? arg.slice(0, equal) : arg;
      const value = equal >= 0 ? arg.slice(equal + 1) : args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
      if (name === "--src") src = value;
      else if (name === "--out") out = value;
      else element = value;
    } else throw new Error(`Unknown flag: ${arg}`);
  }
  src = resolve(src); out = resolve(out);
  const elements = allColors ? [...COLOR_SIGIL_ELEMENTS] : [element];
  // Preflight the whole batch before writing anything.
  for (const el of elements) {
    const sources = sigilSourcesFor(el);
    const dest = el === "metal" ? out : join(out, el);
    const outputs = [...SIGIL_MASK_IDS.map((id) => join(dest, `${el}-${id}.png`)), join(dest, "manifest.json")];
    if (!force && outputs.some((file) => existsSync(file))) throw new Error("Output already exists; use --force. Nothing written.");
    for (const id of SIGIL_MASK_IDS) {
      const file = join(src, sources[id].file);
      if (!existsSync(file)) throw new Error(`Missing source: ${file}`);
    }
  }
  for (const el of elements) generate(src, el === "metal" ? out : join(out, el), el);
}

function generate(src: string, out: string, element: string): void {
  const sources = sigilSourcesFor(element);
  const color = element !== "metal";
  mkdirSync(out, { recursive: true });
  const masks = SIGIL_MASK_IDS.map((id) => {
    const source = sources[id];
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
    // Never hide a clipped stroke by clearing its edge pixels.
    if (color) {
      for (let y = 0; y < px[1]; y += 1) for (let x = 0; x < px[0]; x += 1) {
        if (x >= 2 && y >= 2 && x < px[0] - 2 && y < px[1] - 2) continue;
        const i = (y * px[0] + x) * 3;
        if (Math.max(resized[i]!, resized[i + 1]!, resized[i + 2]!) >= 13) throw new Error(`Clipped stroke: ${element}/${id}`);
      }
    }
    const packed = color ? { data: packColor(resized, px[0], px[1]), hotT: 0, hotShare: 0 }
      : packChannels(resized, px[0], px[1], 0.15 * px[0] / metres, 0.15 * px[1] / (metres / aspect));
    const file = `${element}-${id}.png`;
    execFileSync(magick, ["-size", `${px[0]}x${px[1]}`, "-depth", "8", "rgb:-", "-strip", "-define", "png:color-type=2", join(out, file)], { input: packed.data, maxBuffer });
    const md5 = createHash("md5").update(readFileSync(join(out, file))).digest("hex");
    return { id, file, source: source.file, md5, metres, aspect: Number(aspect.toFixed(4)), px, crop: [crop.x, crop.y, crop.w, crop.h], flop: source.flop, ...(!color ? { hotT: packed.hotT, hotShare: packed.hotShare } : {}) };
  });
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ version: 1, kind: "sigil-masks", element,
    ...(color ? { mode: "color", channels: { color: "rgb", erosion: "max(rgb)" } } : { channels: { lines: "r", glow: "g", hot: "b" } }), pxPerMetre: 38, masks }, null, 2) + "\n");
  // WebGL RGB8 uploads use RGBA8 storage; include the complete mip chain.
  const gpuBytes = masks.reduce((sum, { px: [w, h] }) => {
    for (;;) { sum += w * h * 4; if (w === 1 && h === 1) return sum; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  }, 0);
  console.info(`[sigil-masks] ${element}: ${masks.length} masks, GPU ${gpuBytes} bytes (${(gpuBytes / 1048576).toFixed(2)} MiB)`);
}

try { main(); } catch (error) {
  console.error(`[sigil-masks] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
