/**
 * Stand-in word tags over the lab's herd (lab-readability, 06/11): the game's beast tags are not designed yet, so the
 * lab floats a few in Dragonhold's tag colours (ivory #FFF4D6 on a warm ink plate) to check that every skill keeps
 * them readable (≥ 7:1). DOM over the canvas, so no skill draws over the letters; the risk is the light behind a
 * see-through plate. A non-overlapping set of up to MAX_TAGS beasts, the big ones first, each tag's bottom 0.3 m over
 * its head; the boxes go to the tag mask (view/skills/tag-mask.ts), so the skills keep only `keep` of their light
 * behind them. ?tags=1 or T shows them; ?tagPlate=<0–1> the plate's opacity (default PLATE); ?tagMask=0 turns the
 * mask off to compare.
 */
import "@fontsource/be-vietnam-pro/700.css";
import type { TagBox } from "../view/skills/tag-mask";

export const MAX_TAGS = 24;
/** The plate's opacity: see-through enough to keep the beast under it (Dragonhold's is 0.9). */
export const PLATE = 0.6;
/** Text px at a 1600 × 900 view (scaled like the kit's --ui). */
const FONT_PX = 18;
const PAD_X = 8;
const PAD_Y = 3;
const GAP_PX = 4;
/** Words the tags show (English, as the game teaches). */
const WORDS = ["river", "thank", "silver", "dragon", "window", "garden", "bright", "mountain", "lantern", "stone", "cloud", "forest",
  "harbor", "quiet", "season", "temple", "letter", "spirit", "ember", "jade", "thunder", "meadow", "candle", "travel",
  "winter", "market", "anchor", "pepper", "rocket", "valley", "orange", "mirror"];

/** What the tags read from the lab each frame. */
export interface TagHost {
  /** Beasts in the herd (indices 0…count − 1). */
  readonly count: number;
  /** The CSS px point over beast `i`'s head, or false when it is not alive or off screen. */
  spot(i: number, out: { x: number; y: number }): boolean;
  /** Its size class (bigger first). */
  tier(i: number): number;
}

export class LabWordTags {
  readonly root: HTMLDivElement;
  private readonly els: HTMLDivElement[] = [];
  private readonly widths = new Map<string, number>();
  private readonly ctx: CanvasRenderingContext2D | null;
  private chosen: number[] = [];
  private readonly spot = { x: 0, y: 0 };
  /** The boxes drawn this frame (CSS px). */
  readonly boxes: (TagBox & { i: number })[] = [];
  private fontPx = FONT_PX;

  constructor(parent: HTMLElement, plate = PLATE, public shown = false) {
    this.root = document.createElement("div");
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden";
    this.root.hidden = !shown;
    parent.append(this.root);
    for (let k = 0; k < MAX_TAGS; k += 1) {
      const el = document.createElement("div");
      el.style.cssText =
        `position:absolute;left:0;top:0;white-space:nowrap;box-sizing:border-box;border-radius:6px;` +
        `font-family:"Be Vietnam Pro","Segoe UI",system-ui,sans-serif;font-weight:700;letter-spacing:0.02em;line-height:1.15;` +
        `color:#FFF4D6;background:rgba(35,28,23,${plate});border:1px solid rgba(255,244,214,0.28);display:none`;
      this.root.append(el);
      this.els.push(el);
    }
    this.ctx = document.createElement("canvas").getContext("2d");
  }

  /** The word on beast `i`. */
  static word(i: number): string {
    return WORDS[(i * 7) % WORDS.length]!;
  }

  private width(word: string): number {
    let w = this.widths.get(word);
    if (w === undefined) {
      if (this.ctx !== null) {
        this.ctx.font = `700 ${this.fontPx}px "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif`;
        w = Math.ceil(this.ctx.measureText(word).width * 1.02 + word.length * 0.02 * this.fontPx);
      } else w = Math.ceil(word.length * this.fontPx * 0.6);
      this.widths.set(word, w);
    }
    return w + 2 * PAD_X + 2;
  }

  /**
   * Places the tags for this frame (a `width` × `height` CSS px view): keeps last frame's beasts while they stay alive and
   * clear, then adds the biggest, nearest-the-middle ones that do not overlap; writes the DOM only when shown.
   */
  update(host: TagHost, width: number, height: number): readonly (TagBox & { i: number })[] {
    const font = Math.round(FONT_PX * Math.min(1.2, Math.max(0.8, Math.min(width / 1600, height / 900))));
    if (font !== this.fontPx) {
      this.fontPx = font;
      this.widths.clear();
    }
    const h = Math.round(font * 1.15) + 2 * PAD_Y + 2;
    const boxes = this.boxes;
    boxes.length = 0;
    const clear = (x: number, y: number, w: number): boolean => {
      if (x < 0 || y < 0 || x + w > width || y + h > height) return false;
      for (const b of boxes) if (x < b.x + b.w + GAP_PX && b.x < x + w + GAP_PX && y < b.y + b.h + GAP_PX && b.y < y + h + GAP_PX) return false;
      return true;
    };
    const take = (i: number): void => {
      if (boxes.length >= MAX_TAGS || boxes.some((b) => b.i === i) || !host.spot(i, this.spot)) return;
      const w = this.width(LabWordTags.word(i));
      const x = Math.round(this.spot.x - w / 2);
      const y = Math.round(this.spot.y - h);
      if (clear(x, y, w)) boxes.push({ i, x, y, w, h });
    };
    for (const i of this.chosen) take(i);
    const order: number[] = [];
    const dist: number[] = [];
    for (let i = 0; i < host.count; i += 1) {
      order.push(i);
      dist.push(host.spot(i, this.spot) ? Math.hypot(this.spot.x - width / 2, this.spot.y - height / 2) : Infinity);
    }
    order.sort((a, b) => host.tier(b) - host.tier(a) || dist[a]! - dist[b]!);
    for (const i of order) if (dist[i]! < Infinity) take(i);
    this.chosen = boxes.map((b) => b.i);
    if (this.shown) {
      for (let k = 0; k < this.els.length; k += 1) {
        const el = this.els[k]!;
        const b = boxes[k];
        if (b === undefined) {
          el.style.display = "none";
          continue;
        }
        const word = LabWordTags.word(b.i);
        if (el.textContent !== word) el.textContent = word;
        el.style.display = "block";
        el.style.fontSize = font + "px";
        el.style.padding = `${PAD_Y}px ${PAD_X}px`;
        el.style.width = b.w + "px";
        el.style.height = b.h + "px";
        el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
    }
    return boxes;
  }

  /** Shows or hides the tags (their boxes still drive the mask while the lab asks for them). */
  show(on: boolean): void {
    this.shown = on;
    this.root.hidden = !on;
  }
}
