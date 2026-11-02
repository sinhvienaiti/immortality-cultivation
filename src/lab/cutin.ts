/**
 * The ultimate's cut-in (canon D58 (4): "Tuyệt kỹ có cảnh cận kiểu anime
 * khoảng 1 s, dừng cả game lẫn giờ gõ"; dev-only lab). On the last key the
 * world and the typing timer stop for about 1 s while a slanted band crosses
 * the screen: the owner-approved roster painting of the Kiếm heroine
 * (art-src/roster/kiem-nu.png, canon D49) cropped to her face and shoulders,
 * light streaks running along the band, the skill's hanzi in brush
 * calligraphy (Ma Shan Zheng) revealed like a stroke, and its English name
 * (Cormorant Garamond); then the band closes and the skill fires. Both fonts
 * are OFL through @fontsource (THIRD_PARTY.md). Driven by lab time, not CSS
 * animations, so the fixed-step captures show the same frames every run.
 * DOM over the canvas: the 3D view and its overlays sit under it; the panel
 * stays usable (pointer-events none).
 */
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/ma-shan-zheng/400.css";

/** The painting (dev server path; art-src is never built or committed). */
const PORTRAIT = "/art-src/roster/kiem-nu.png";
/** The painting's size and where her face sits (shares of its width and height). */
const IMG_W = 1024;
const IMG_H = 1536;
const FACE_X = 0.5;
const FACE_Y = 0.17;

/** The band's edges at the left and right of the screen (shares of the height), open. */
const TOP_L = 0.3;
const TOP_R = 0.13;
const BOT_L = 0.77;
const BOT_R = 0.6;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export interface CutInSpec {
  /** English name (what the player reads) and the hanzi of the skill. */
  readonly name: string;
  readonly hanzi: string;
  /** Seconds the world holds. */
  readonly seconds: number;
}

/** Streaks: start time (s), run (s), vertical place across the band (0 top … 1 bottom), length (share of width), thickness (px). */
const STREAKS: readonly [number, number, number, number, number][] = [
  [0.02, 0.2, 0.5, 0.7, 3],
  [0.12, 0.22, 0.28, 0.45, 2],
  [0.2, 0.2, 0.74, 0.5, 2],
  [0.34, 0.26, 0.4, 0.6, 2],
  [0.5, 0.22, 0.62, 0.4, 3],
  [0.62, 0.24, 0.2, 0.55, 2],
];

export class CutIn {
  private readonly root: HTMLDivElement;
  private readonly shade: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly portrait: HTMLDivElement;
  private readonly edgeTop: HTMLDivElement;
  private readonly edgeBot: HTMLDivElement;
  private readonly hanzi: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly streaks: HTMLDivElement[] = [];
  private t = -1;
  private spec: CutInSpec = { name: "", hanzi: "", seconds: 1 };

  constructor(parent: HTMLElement) {
    const div = (css: string): HTMLDivElement => {
      const d = document.createElement("div");
      d.style.cssText = css;
      return d;
    };
    this.root = div("position:fixed;inset:0;z-index:9;pointer-events:none;display:none;overflow:hidden");
    this.shade = div("position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(6,14,16,0.35), rgba(2,5,8,0.82));opacity:0");
    this.band = div("position:absolute;inset:0;background:linear-gradient(100deg,#04100f 0%,#0a2724 34%,#103a3a 62%,#0a1d26 100%)");
    this.portrait = div(
      `position:absolute;top:0;bottom:0;left:2%;width:50%;background-image:url(${PORTRAIT});background-repeat:no-repeat;` +
        "-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 14%,#000 72%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0%,#000 14%,#000 72%,transparent 100%)",
    );
    this.band.append(this.portrait);
    for (const s of STREAKS) {
      const d = div(`position:absolute;left:0;height:${s[4]}px;width:${s[3] * 100}%;background:linear-gradient(90deg,rgba(150,255,220,0) 0%,rgba(205,255,236,0.95) 55%,rgba(255,236,190,0.9) 80%,rgba(255,236,190,0) 100%);mix-blend-mode:screen;opacity:0`);
      this.band.append(d);
      this.streaks.push(d);
    }
    this.hanzi = div(
      "position:absolute;white-space:nowrap;font-family:'Ma Shan Zheng',serif;color:#f3f0e4;line-height:1;" +
        "-webkit-text-stroke:1px rgba(8,26,24,0.55);text-shadow:0 0 22px rgba(110,235,195,0.55),0 0 2px rgba(0,0,0,0.8)",
    );
    this.name = div(
      "position:absolute;white-space:nowrap;font-family:'Cormorant Garamond',serif;font-weight:600;color:#eaf6ef;" +
        "text-shadow:0 0 14px rgba(100,230,190,0.6),0 1px 2px rgba(0,0,0,0.9)",
    );
    this.band.append(this.hanzi, this.name);
    // The band's two edges: thin jade-to-gold light lines.
    const edge = "position:absolute;left:-2%;width:104%;height:3px;transform-origin:0 50%;background:linear-gradient(90deg,rgba(120,240,200,0) 0%,rgba(150,245,215,0.95) 30%,rgba(242,205,120,0.95) 70%,rgba(242,205,120,0) 100%)";
    this.edgeTop = div(edge);
    this.edgeBot = div(edge);
    this.root.append(this.shade, this.band, this.edgeTop, this.edgeBot);
    parent.append(this.root);
  }

  get active(): boolean {
    return this.t >= 0;
  }

  /** The cut-in's time (s), −1 when idle. */
  get time(): number {
    return this.t;
  }

  start(spec: CutInSpec): void {
    this.spec = spec;
    this.t = 0;
    this.hanzi.textContent = spec.hanzi;
    this.name.textContent = spec.name;
    this.root.style.display = "block";
    this.draw();
  }

  /** Steps the cut-in by `dt` real seconds; true on the frame it ends (the skill fires then). */
  update(dt: number): boolean {
    if (this.t < 0) return false;
    this.t += dt;
    if (this.t >= this.spec.seconds) {
      this.stop();
      return true;
    }
    this.draw();
    return false;
  }

  stop(): void {
    this.t = -1;
    this.root.style.display = "none";
  }

  private draw(): void {
    const T = this.spec.seconds;
    const t = this.t;
    const W = innerWidth;
    const H = innerHeight;
    // Open over 0.12 s from a line through its middle; close over the last 0.15 s.
    const open = easeOut(t / 0.12) * (1 - smooth((t - (T - 0.15)) / 0.15));
    const midL = (TOP_L + BOT_L) / 2;
    const midR = (TOP_R + BOT_R) / 2;
    const tl = midL + (TOP_L - midL) * open;
    const bl = midL + (BOT_L - midL) * open;
    const tr = midR + (TOP_R - midR) * open;
    const br = midR + (BOT_R - midR) * open;
    const slide = (1 - easeOut(t / 0.16)) * -8 + smooth((t - (T - 0.15)) / 0.15) * 6;
    this.band.style.clipPath = `polygon(0% ${tl * 100}%, 100% ${tr * 100}%, 100% ${br * 100}%, 0% ${bl * 100}%)`;
    this.band.style.transform = `translateX(${slide}%)`;
    this.shade.style.opacity = String(0.85 * smooth(t / 0.1) * (1 - smooth((t - (T - 0.15)) / 0.15)));
    // The painting: her face at ~42 % of the height in the band's left half, a slow push in.
    const pw = 0.5 * W;
    const push = 1 + 0.07 * clamp01(t / T);
    const bgW = 1.15 * pw * push;
    const bgH = (bgW * IMG_H) / IMG_W;
    const bx = pw * 0.5 - FACE_X * bgW;
    const by = 0.43 * H - FACE_Y * bgH - 0.04 * H * clamp01(t / T);
    this.portrait.style.backgroundSize = `${bgW}px ${bgH}px`;
    this.portrait.style.backgroundPosition = `${bx}px ${by}px`;
    this.portrait.style.opacity = String(smooth((t - 0.03) / 0.12));
    // Edges follow the band; they flare on opening.
    const angle = Math.atan2((TOP_R - TOP_L) * H, W);
    const len = Math.hypot(W, (TOP_R - TOP_L) * H);
    const flare = 1 + 1.5 * (1 - smooth(t / 0.2));
    this.edgeTop.style.top = `${tl * H}px`;
    this.edgeBot.style.top = `${bl * H}px`;
    for (const e of [this.edgeTop, this.edgeBot]) {
      e.style.width = `${len * 1.04}px`;
      e.style.transform = `rotate(${angle}rad) scaleY(${flare})`;
      e.style.opacity = String(open);
    }
    // Light streaks run along the band (its slope), each once.
    for (let k = 0; k < STREAKS.length; k += 1) {
      const [s0, run, v, , ] = STREAKS[k]!;
      const d = this.streaks[k]!;
      const u = (t - s0) / run;
      if (u < 0 || u > 1) {
        d.style.opacity = "0";
        continue;
      }
      const yL = tl + (bl - tl) * v;
      const x = -0.6 * W + 1.9 * W * easeOut(u);
      const y = yL * H + (x / W) * (tr - tl) * H;
      d.style.opacity = String(Math.sin(Math.PI * u));
      d.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
    }
    // The hanzi: a brush stroke reveal from the right edge of her portrait, then a slight settle.
    const hz = Math.round(0.135 * H);
    this.hanzi.style.fontSize = `${hz}px`;
    const hx = 0.47 * W;
    const hy = (tl + (tr - tl) * 0.47) * H + 0.05 * H;
    const rv = smooth((t - 0.1) / 0.3);
    this.hanzi.style.left = `${hx}px`;
    this.hanzi.style.top = `${hy}px`;
    this.hanzi.style.clipPath = `inset(-20% ${(1 - rv) * 100}% -20% -5%)`;
    this.hanzi.style.transform = `rotate(${angle}rad) scale(${1.08 - 0.08 * smooth((t - 0.1) / 0.5)})`;
    this.hanzi.style.opacity = String(open);
    // The English name under it, tracking in.
    const nz = Math.round(0.034 * H);
    this.name.style.fontSize = `${nz}px`;
    this.name.style.letterSpacing = `${0.32 + 0.25 * (1 - smooth((t - 0.2) / 0.3))}em`;
    this.name.style.left = `${hx + 0.01 * W}px`;
    this.name.style.top = `${hy + hz * 1.12}px`;
    this.name.style.transform = `rotate(${angle}rad)`;
    this.name.style.opacity = String(smooth((t - 0.2) / 0.14) * open);
  }
}
