#!/usr/bin/env node
/**
 * Frame check for 2D source images before judging or Tripo (plan §4.1,
 * LESSONS §3): the subject must be one connected block on a flat key
 * background with a margin of at least MARGIN % on every side. Uses the
 * ImageMagick CLI (`magick`), no npm dependency.
 *
 *   node scripts/art/check-frame.mjs <image...> [--margin=8] [--fuzz=10] [--pad]
 *
 * Prints one JSON line per image: canvas, background colour (sampled at the
 * four corners, must agree), the subject box after a fuzzy trim, the margins
 * in percent, the number of connected blocks of the subject at 1/8 scale, and
 * `pass`. With --pad, an image that only fails the margin is extended with the
 * background colour into <name>.pad.png (never overwritten) so every margin
 * reaches MARGIN %.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MARGIN = Number(flag("margin", "8"));
const FUZZ = Number(flag("fuzz", "10"));
const PAD = args.includes("--pad");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("Usage: node scripts/art/check-frame.mjs <image...> [--margin=8] [--fuzz=10] [--pad]");
  process.exit(2);
}

const magick = (...a) => execFileSync("magick", a, { encoding: "utf8" }).trim();

/** Mean colour of a small square at (x, y), as "r,g,b" 0–255. */
function sample(file, x, y, size = 6) {
  const out = magick(file, "-crop", `${size}x${size}+${x}+${y}`, "+repage", "-scale", "1x1!", "-format", "%[fx:int(255*r)],%[fx:int(255*g)],%[fx:int(255*b)]", "info:");
  return out.split(",").map(Number);
}

function dist(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

for (const file of files) {
  if (!existsSync(file)) {
    console.log(JSON.stringify({ file, error: "missing" }));
    continue;
  }
  const [w, h] = magick(file, "-format", "%w %h", "info:").split(" ").map(Number);
  const corners = [sample(file, 2, 2), sample(file, w - 8, 2), sample(file, 2, h - 8), sample(file, w - 8, h - 8)];
  const bg = corners[0];
  const bgAgree = Math.max(...corners.map((c) => dist(c, bg)));
  const bgHex = "#" + bg.map((v) => v.toString(16).padStart(2, "0")).join("");
  // Subject box: fuzzy trim against the corner colour.
  const box = magick(file, "-fuzz", `${FUZZ}%`, "-fill", "none", "-trim", "-format", "%w %h %X %Y", "info:").split(" ").map((v) => Number(v));
  const [bw, bh, bx, by] = box;
  const margins = {
    left: (100 * bx) / w,
    top: (100 * by) / h,
    right: (100 * (w - bx - bw)) / w,
    bottom: (100 * (h - by - bh)) / h,
  };
  // Connected blocks of the subject at 1/8 scale (fuzzy key → mask → connected components).
  let blocks = -1;
  try {
    const cc = magick(file, "-fuzz", `${FUZZ}%`, "-fill", "white", "+opaque", bgHex, "-fill", "black", "-opaque", bgHex, "-scale", "12.5%", "-threshold", "50%", "-define", "connected-components:area-threshold=12", "-define", "connected-components:verbose=true", "-connected-components", "8", "null:");
    blocks = cc.split("\n").filter((l) => /^\s+\d+:/.test(l) && /srgb\(255,255,255\)|white|gray\(255\)/.test(l)).length;
  } catch {
    blocks = -1;
  }
  const minMargin = Math.min(margins.left, margins.top, margins.right, margins.bottom);
  const fails = [];
  if (bgAgree > 12) fails.push(`background differs between corners by ${bgAgree}`);
  if (minMargin < MARGIN) fails.push(`margin ${minMargin.toFixed(1)}% < ${MARGIN}%`);
  if (blocks > 1) fails.push(`${blocks} blocks`);
  const result = { file, canvas: [w, h], bg: bgHex, bgAgree, subject: { w: bw, h: bh, x: bx, y: by }, margins: Object.fromEntries(Object.entries(margins).map(([k, v]) => [k, Number(v.toFixed(1))])), blocks, pass: fails.length === 0, fails };
  if (PAD && fails.length === 1 && fails[0].startsWith("margin")) {
    const need = (m) => Math.max(0, Math.ceil((MARGIN / 100) * (m === "x" ? w : h)));
    const target = Math.max(bw / (1 - 2 * MARGIN / 100), w);
    const targetH = Math.max(bh / (1 - 2 * MARGIN / 100), h);
    const outW = Math.ceil(Math.max(target, w + 2 * need("x") - 2 * Math.min(bx, w - bx - bw)));
    const outH = Math.ceil(Math.max(targetH, h + 2 * need("y") - 2 * Math.min(by, h - by - bh)));
    const out = file.replace(/\.(png|jpg|jpeg|webp)$/i, ".pad.png");
    if (!existsSync(out)) {
      magick(file, "-background", bgHex, "-gravity", "center", "-extent", `${outW}x${outH}`, out);
      result.padded = out;
    }
  }
  console.log(JSON.stringify(result));
}
