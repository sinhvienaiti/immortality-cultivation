import type { SigilMaskId } from "../../src/view/skills/painted-sigils";

export const SIGIL_SOURCES: Readonly<Record<SigilMaskId, { file: string; crop: "square" | "box"; flop: boolean }>> = {
  line: { file: "metal-sigil-line.v1-try1.png", crop: "box", flop: false },
  arrow: { file: "metal-sigil-arrow.v1-try2.png", crop: "box", flop: false },
  arcs: { file: "metal-sigil-arcs.v1-try2.png", crop: "square", flop: false },
  hex: { file: "metal-sigil-hex.v1-try2.png", crop: "square", flop: false },
  spiral: { file: "metal-sigil-spiral.v1-try2.png", crop: "square", flop: true },
  crack: { file: "metal-crack-star.v1-try1.png", crop: "box", flop: false },
  rift: { file: "metal-rift-groove.v1-try3.png", crop: "box", flop: false },
};

export interface BrightBox { x: number; y: number; w: number; h: number }

export function brightBox(maxCh: Uint8Array, w: number, h: number): BrightBox | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (maxCh[y * w + x]! < 13) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function cropOf(box: BrightBox, crop: "square" | "box"): BrightBox {
  const m = Math.max(24, Math.round(0.04 * Math.max(box.w, box.h)));
  if (crop === "box") return { x: box.x - m, y: box.y - m, w: box.w + 2 * m, h: box.h + 2 * m };
  const side = Math.max(box.w, box.h) + 2 * m;
  return { x: Math.round(box.x + box.w / 2 - side / 2), y: Math.round(box.y + box.h / 2 - side / 2), w: side, h: side };
}

export const ceilPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(n));

export function maskSize(metres: number, cropW: number, cropH: number): [number, number] {
  const long = Math.min(ceilPow2(metres * 38 * 2), ceilPow2(cropW));
  return [long, Math.max(32, ceilPow2(long / (cropW / cropH)))];
}

function kernel(sigma: number): Float64Array {
  if (sigma <= 0) return new Float64Array([1]);
  const radius = Math.ceil(3 * sigma);
  const weights = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights[i + radius] = weight;
    sum += weight;
  }
  for (let i = 0; i < weights.length; i += 1) weights[i] = weights[i]! / sum;
  return weights;
}

/** Separable Gaussian with zero outside the image, including at the corners. */
function gaussian(lines: Float64Array, w: number, h: number, sigmaX: number, sigmaY: number): Float64Array {
  const kx = kernel(sigmaX), ky = kernel(sigmaY);
  const rx = (kx.length - 1) / 2, ry = (ky.length - 1) / 2;
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = Math.max(-rx, -x); k <= Math.min(rx, w - 1 - x); k += 1) sum += lines[y * w + x + k]! * kx[k + rx]!;
      tmp[y * w + x] = sum;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = Math.max(-ry, -y); k <= Math.min(ry, h - 1 - y); k += 1) sum += tmp[(y + k) * w + x]! * ky[k + ry]!;
      out[y * w + x] = Math.min(1, 2.5 * sum);
    }
  }
  return out;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const hotAt = (v: number, t: number): number => {
  const x = clamp01((v - t) / (Math.min(1, t + 0.2) - t));
  return x * x * (3 - 2 * x);
};

export function packChannels(rgb: Uint8Array, w: number, h: number, sigmaX: number, sigmaY: number): { data: Uint8Array; hotT: number; hotShare: number } {
  const values = new Float64Array(w * h), lines = new Float64Array(w * h);
  let lit = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = Math.max(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!) / 255;
    values[i] = v;
    lines[i] = clamp01((v - 0.03) / 0.97);
    if (lines[i]! > 0.1) lit += 1;
  }
  const glow = gaussian(lines, w, h, sigmaX, sigmaY);
  let hotT = 0.75, hotShare = 0;
  for (;;) {
    let sum = 0;
    for (const v of values) sum += hotAt(v, hotT);
    hotShare = lit > 0 ? sum / lit : 0;
    if (hotShare <= 0.05 || hotT >= 0.95) break;
    hotT += 0.02;
  }
  const data = new Uint8Array(w * h * 3);
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const i = y * w + x;
      data[i * 3] = Math.round(lines[i]! * 255);
      data[i * 3 + 1] = Math.round(glow[i]! * 255);
      data[i * 3 + 2] = Math.round(hotAt(values[i]!, hotT) * 255);
    }
  }
  return { data, hotT, hotShare };
}
