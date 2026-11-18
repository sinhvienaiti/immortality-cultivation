import { WORD_FX, type WordFx } from "./word-fx";
import type { Rect } from "./screen-zones";
import { WORD_GLINT_COLOR, WORD_GLINT_URL } from "./styles/word-fx-css";

/** Disjoint visible rectangles: overlapping keepouts cannot reopen a hole in the clip. */
export function wordFlightRegions(width: number, height: number, keepouts: readonly Rect[]): Rect[] {
  let regions: Rect[] = [{ x: 0, y: 0, w: width, h: height }];
  for (const keep of keepouts) {
    const next: Rect[] = [];
    for (const r of regions) {
      const x0 = Math.max(r.x, keep.x - 4), x1 = Math.min(r.x + r.w, keep.x + keep.w + 4);
      const y0 = Math.max(r.y, keep.y - 4), y1 = Math.min(r.y + r.h, keep.y + keep.h + 4);
      if (x1 <= x0 || y1 <= y0) { next.push(r); continue; }
      if (y0 > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: y0 - r.y });
      if (y1 < r.y + r.h) next.push({ x: r.x, y: y1, w: r.w, h: r.y + r.h - y1 });
      if (x0 > r.x) next.push({ x: r.x, y: y0, w: x0 - r.x, h: y1 - y0 });
      if (x1 < r.x + r.w) next.push({ x: x1, y: y0, w: r.x + r.w - x1, h: y1 - y0 });
    }
    regions = next;
  }
  return regions;
}

interface Glyph { text: string; x: number; y: number; radius: number }
interface Flight { fx: WordFx; release: number; font: string; glyphs: Glyph[]; count: number }

const EDGE = 4;
const inside = (value: number, radius: number, extent: number): number => Math.max(EDGE + radius, Math.min(extent - EDGE - radius, value));

/** One presentation canvas; snapshots and glyph records are recycled between casts. */
export function createWordFlight(host: HTMLElement) {
  const doc = host.ownerDocument;
  const canvas = doc.createElement("canvas");
  canvas.className = "ic-word-flight";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const active = new Map<WordFx, Flight>();
  const pool: Flight[] = [];
  let glint: HTMLCanvasElement | null = null;
  let disposed = false;
  let dirty = false;
  if (ctx) {
    const image = doc.createElement("img");
    image.onload = () => {
      if (disposed) return;
      const tint = doc.createElement("canvas");
      tint.width = tint.height = 32;
      const ink = tint.getContext("2d");
      if (!ink) return;
      ink.drawImage(image, 0, 0, 32, 32);
      ink.globalCompositeOperation = "source-in";
      ink.fillStyle = WORD_GLINT_COLOR;
      ink.fillRect(0, 0, 32, 32);
      glint = tint;
    };
    image.src = WORD_GLINT_URL;
  }
  return {
    capture(fx: WordFx, word: HTMLElement, letters: readonly HTMLElement[]): void {
      if (!ctx || active.get(fx)?.release === fx.release) return;
      const record = active.get(fx) ?? pool.pop() ?? { fx, release: 0, font: "", glyphs: [], count: 0 };
      record.fx = fx;
      record.release = fx.release;
      const style = doc.defaultView!.getComputedStyle(word);
      record.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      record.count = letters.length;
      letters.forEach((letter, i) => {
        const rect = letter.getBoundingClientRect();
        const glyph = record.glyphs[i] ?? (record.glyphs[i] = { text: "", x: 0, y: 0, radius: 0 });
        glyph.text = letter.textContent ?? "";
        glyph.x = rect.left + rect.width / 2;
        glyph.y = rect.top + rect.height / 2;
        // A circumscribed circle reserves the whole rotated glyph, not just its centre.
        glyph.radius = Math.hypot(rect.width, rect.height) / 2;
      });
      active.set(fx, record);
    },
    has(fx: WordFx): boolean { return active.has(fx); },
    paint(now: number, reduced: boolean, keepouts: () => readonly Rect[]): void {
      if (!ctx) return;
      for (const [fx, flight] of active) if (!fx.leaving(now)) { active.delete(fx); pool.push(flight); }
      if (!active.size && !dirty) return;
      const width = doc.defaultView!.innerWidth, height = doc.defaultView!.innerHeight;
      const dpr = Math.min(2, doc.defaultView!.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      dirty = active.size > 0 && !reduced;
      if (!dirty) return;
      ctx.save();
      ctx.beginPath();
      for (const r of wordFlightRegions(width, height, keepouts())) ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#E5C77B";
      for (const flight of active.values()) {
        const fx = flight.fx;
        if (fx.phase(now) !== "depart") continue;
        ctx.font = flight.font;
        for (let i = 0; i < flight.count; i += 1) {
          const glyph = flight.glyphs[i]!;
          const motion = fx.travel(i, now, false, height - EDGE - glyph.y - glyph.radius);
          ctx.save();
          ctx.globalAlpha = motion.opacity;
          ctx.translate(inside(glyph.x + motion.x, glyph.radius, width), inside(glyph.y + motion.y, glyph.radius, height));
          ctx.rotate(motion.turn * Math.PI / 180);
          ctx.fillText(glyph.text, 0, 0);
          ctx.restore();
        }
        if (glint) for (let i = 0; i < WORD_FX.motes; i += 1) {
          const glyph = flight.glyphs[Math.round(i / (WORD_FX.motes - 1) * (flight.count - 1))];
          if (!glyph) continue;
          const mote = fx.moteTravel(i, now, false, height - EDGE - glyph.y - glyph.radius);
          if (mote.opacity <= 0) continue;
          ctx.globalAlpha = mote.opacity;
          const size = WORD_FX.motePx * mote.scale;
          ctx.drawImage(glint, inside(glyph.x + mote.x, size / 2, width) - size / 2, inside(glyph.y + mote.y, size / 2, height) - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    dispose(): void { disposed = true; active.clear(); pool.length = 0; glint = null; canvas.remove(); },
  };
}
