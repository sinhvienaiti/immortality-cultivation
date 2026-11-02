/**
 * The ultimate's cut-in (canon D58 (4): "Tuyệt kỹ có cảnh cận kiểu anime
 * khoảng 1 s, dừng cả game lẫn giờ gõ"; dev-only lab). On the last key the
 * world and the typing timer stop for about 0.9 s while a slanted band
 * crosses the screen. Round 2 (both blind judges: "a static banner ad, half
 * of it flat empty teal, Chinese first in an English game") animates it:
 * - an ink-splash wipe reveals the band left to right (a soft wipe whose edge
 *   is torn by CC0 splatter masks), flinging dark ink blots past its edges;
 * - speed lines race along the band, light streaks cross it, gold and white
 *   motes drift over it;
 * - the owner-approved roster painting (art-src/roster/kiem-nu.png, canon
 *   D49; never a character drawn in code) pushes in on the left, a sword-glint
 *   sweeps across it;
 * - gold-foil edges with a running sheen;
 * - the right half: the English name leads (Cormorant Garamond, gold foil,
 *   tracking in), the hanzi is the secondary brush calligraphy (Ma Shan
 *   Zheng) above it, a huge faint hanzi watermark behind, a gold rule, and a
 *   red seal with the skill's hanzi stamps down at 0.42 s;
 * then the band collapses to its middle line and the skill fires. Both fonts
 * are OFL through @fontsource, the textures Kenney CC0 (THIRD_PARTY.md). Driven
 * by lab time, not CSS animations, so the fixed-step captures show the same
 * frames every run. DOM over the canvas: the 3D view and its overlays sit
 * under it; the panel stays usable (pointer-events none).
 */
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/ma-shan-zheng/400.css";
import { LAB_ASSETS } from "./look";

/** The painting (dev server path; art-src is never built or committed). */
const PORTRAIT = "/art-src/roster/kiem-nu.png";
/** CC0 particle textures (Kenney, art-src/lab/tex): splatter masks, ink blots, motes, the glint's star. */
const TEX = LAB_ASSETS + "tex/";
const SPLAT = [TEX + "dirt_03.png", TEX + "scorch_02.png", TEX + "dirt_02.png", TEX + "scorch_01.png"] as const;
const MOTE = TEX + "star_07.png";
const GRAIN = TEX + "smoke_07.png";
/** Sparse speckles: the seal's print wears through where they are. */
const SPECKLE = TEX + "dirt_01.png";
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
/** The wipe's run (s) and when the seal stamps (s). */
const WIPE_S = 0.2;
const STAMP_AT = 0.42;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
/** An overshoot ease (back out): 0 → past 1 → 1. */
const backOut = (t: number): number => {
  const x = clamp01(t) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};

export interface CutInSpec {
  /** English name (what the player reads) and the hanzi of the skill. */
  readonly name: string;
  readonly hanzi: string;
  /** Seconds the world holds. */
  readonly seconds: number;
}

/** Light streaks: start time (s), run (s), vertical place across the band (0 top … 1 bottom), length (share of width), thickness (px). */
const STREAKS: readonly [number, number, number, number, number][] = [
  [0.02, 0.2, 0.5, 0.7, 3],
  [0.12, 0.22, 0.28, 0.45, 2],
  [0.2, 0.2, 0.74, 0.5, 2],
  [0.34, 0.26, 0.4, 0.6, 2],
  [0.5, 0.22, 0.62, 0.4, 3],
  [0.62, 0.24, 0.2, 0.55, 2],
];
/** Speed lines: vertical place (0–1), length (share of width), thickness (px), speed (widths/s), phase (0–1). */
const SPEED_N = 18;
/** Drifting motes and ink blots. */
const MOTES_N = 26;
const BLOTS_N = 7;

export class CutIn {
  private readonly root: HTMLDivElement;
  private readonly shade: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly wash: HTMLDivElement;
  private readonly portrait: HTMLDivElement;
  private readonly glint: HTMLDivElement;
  private readonly edgeTop: HTMLDivElement;
  private readonly edgeBot: HTMLDivElement;
  private readonly watermark: HTMLDivElement;
  private readonly hanzi: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly rule: HTMLDivElement;
  private readonly seal: HTMLDivElement;
  private readonly sealText: HTMLDivElement;
  private readonly streaks: HTMLDivElement[] = [];
  private readonly speed: HTMLDivElement[] = [];
  private readonly speedSpec: [number, number, number, number, number][] = [];
  private readonly motes: HTMLDivElement[] = [];
  private readonly moteSpec: [number, number, number, number, number][] = [];
  private readonly blots: HTMLDivElement[] = [];
  private readonly blotSpec: [number, number, number, number, number][] = [];
  private t = -1;
  private spec: CutInSpec = { name: "", hanzi: "", seconds: 0.9 };

  constructor(parent: HTMLElement) {
    const div = (css: string): HTMLDivElement => {
      const d = document.createElement("div");
      d.style.cssText = css;
      return d;
    };
    // A fixed seed: the same lines, motes and blots every run (captures repeat).
    let seed = 20261103;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    this.root = div("position:fixed;inset:0;z-index:9;pointer-events:none;display:none;overflow:hidden");
    this.shade = div("position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(6,14,16,0.35), rgba(2,5,8,0.82));opacity:0");
    this.band = div("position:absolute;inset:0;background:linear-gradient(100deg,#03100e 0%,#082422 30%,#0d3434 56%,#0a2230 78%,#050f18 100%)");
    // An ink-wash grain over the band (CC0 smoke), drifting the other way from the painting's push.
    this.wash = div(`position:absolute;inset:-10%;background-image:url(${GRAIN});background-size:38% auto;background-repeat:repeat;opacity:0.16;filter:brightness(0.35) sepia(0.5) hue-rotate(120deg);mix-blend-mode:screen`);
    this.band.append(this.wash);
    for (let k = 0; k < SPEED_N; k += 1) {
      const thick = rnd() < 0.3 ? 2 : 1;
      this.speedSpec.push([0.06 + 0.88 * rnd(), 0.18 + 0.3 * rnd(), thick, 2.4 + 2.2 * rnd(), rnd()]);
      const d = div(`position:absolute;left:0;top:0;height:${thick}px;background:linear-gradient(90deg,rgba(210,255,240,0) 0%,rgba(225,255,245,0.75) 70%,rgba(255,248,225,0.95) 100%);mix-blend-mode:screen;opacity:0`);
      this.band.append(d);
      this.speed.push(d);
    }
    this.watermark = div("position:absolute;white-space:nowrap;font-family:'Ma Shan Zheng',serif;color:#bff5e2;line-height:1;opacity:0;mix-blend-mode:screen");
    this.band.append(this.watermark);
    this.portrait = div(
      `position:absolute;top:0;bottom:0;left:2%;width:50%;background-image:url(${PORTRAIT});background-repeat:no-repeat;overflow:hidden;` +
        "-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 14%,#000 72%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0%,#000 14%,#000 72%,transparent 100%)",
    );
    // The sword-glint: a bright diagonal bar sweeping across the painting once.
    this.glint = div(
      "position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,250,235,0) 40%,rgba(255,250,235,0.0) 46%,rgba(255,252,240,0.95) 50%,rgba(255,226,160,0.55) 52.5%,rgba(255,226,160,0) 58%);" +
        "background-size:260% 100%;background-repeat:no-repeat;mix-blend-mode:screen;opacity:0",
    );
    this.portrait.append(this.glint);
    this.band.append(this.portrait);
    for (const s of STREAKS) {
      const d = div(`position:absolute;left:0;height:${s[4]}px;width:${s[3] * 100}%;background:linear-gradient(90deg,rgba(150,255,220,0) 0%,rgba(205,255,236,0.95) 55%,rgba(255,236,190,0.9) 80%,rgba(255,236,190,0) 100%);mix-blend-mode:screen;opacity:0`);
      this.band.append(d);
      this.streaks.push(d);
    }
    // The secondary calligraphy (the hanzi) over the English name, which leads.
    this.hanzi = div(
      "position:absolute;white-space:nowrap;font-family:'Ma Shan Zheng',serif;color:#e8f6ee;line-height:1;transform-origin:0 50%;" +
        "-webkit-text-stroke:1px rgba(6,22,20,0.6);text-shadow:0 0 18px rgba(110,235,195,0.45),0 2px 3px rgba(0,0,0,0.85)",
    );
    this.name = div(
      "position:absolute;white-space:nowrap;font-family:'Cormorant Garamond',serif;font-weight:700;line-height:1;transform-origin:0 50%;" +
        "background:linear-gradient(100deg,#8a5a1c 0%,#f6d483 18%,#fff7d8 30%,#d8a447 44%,#f8dc8e 58%,#fffbe8 66%,#b98232 82%,#f3cf73 100%);background-size:220% 100%;" +
        "-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.2px rgba(40,22,4,0.65);" +
        "filter:drop-shadow(0 2px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 14px rgba(255,214,120,0.35))",
    );
    this.rule = div("position:absolute;height:3px;transform-origin:0 50%;background:linear-gradient(90deg,rgba(246,212,131,0) 0%,#f6d483 12%,#fff4cf 40%,#c99542 80%,rgba(201,149,66,0) 100%);box-shadow:0 0 8px rgba(255,214,120,0.55)");
    // The seal: a vermilion stamp, its print roughened by a CC0 grain mask, the hanzi cut in white (two columns).
    this.seal = div(
      "position:absolute;transform-origin:50% 50%;background:#b8231c;border-radius:6%;box-shadow:inset 0 0 0 3px rgba(255,236,220,0.35),0 3px 10px rgba(0,0,0,0.6);opacity:0;" +
        `-webkit-mask-image:url(${SPECKLE}), linear-gradient(#000,#000);-webkit-mask-size:95% 95%, 100% 100%;-webkit-mask-repeat:no-repeat;-webkit-mask-composite:source-out;mask-image:url(${SPECKLE}), linear-gradient(#000,#000);mask-size:95% 95%, 100% 100%;mask-repeat:no-repeat;mask-composite:exclude`,
    );
    this.sealText = div("position:absolute;inset:8%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;grid-auto-flow:column;direction:rtl;font-family:'Ma Shan Zheng',serif;color:#fff2e8;line-height:1;text-align:center;align-items:center;justify-items:center");
    this.seal.append(this.sealText);
    this.band.append(this.hanzi, this.name, this.rule, this.seal);
    for (let k = 0; k < MOTES_N; k += 1) {
      this.moteSpec.push([rnd(), 0.08 + 0.84 * rnd(), 8 + 16 * rnd(), 0.08 + 0.18 * rnd(), rnd()]);
      const d = div(`position:absolute;left:0;top:0;background-image:url(${MOTE});background-size:contain;background-repeat:no-repeat;mix-blend-mode:screen;opacity:0;filter:drop-shadow(0 0 4px rgba(255,220,140,0.9))`);
      this.band.append(d);
      this.motes.push(d);
    }
    // The band's two edges: gold foil with a running sheen.
    const edge =
      "position:absolute;left:-2%;width:104%;height:6px;transform-origin:0 50%;" +
      "background:linear-gradient(90deg,#6b4a17 0%,#f6d27a 12%,#fff6d0 22%,#c9963f 34%,#f3cf73 48%,#8a6222 60%,#f6d27a 74%,#fff6d0 84%,#b07c2c 100%);background-size:200% 100%;" +
      "box-shadow:0 0 0 1px rgba(20,12,2,0.75),0 0 12px rgba(255,210,120,0.55)";
    this.edgeTop = div(edge);
    this.edgeBot = div(edge);
    // Ink blots flung past the band's edges as the wipe passes them (CC0 splatter, black).
    for (let k = 0; k < BLOTS_N; k += 1) {
      this.blotSpec.push([0.06 + 0.88 * (k / (BLOTS_N - 1)) + (rnd() - 0.5) * 0.06, k % 2, 0.1 + 0.08 * rnd(), rnd() * 6.28, Math.floor(rnd() * SPLAT.length)]);
      const d = div(`position:absolute;left:0;top:0;background-image:url(${SPLAT[this.blotSpec[k]![4]]!});background-size:contain;background-repeat:no-repeat;filter:brightness(0);opacity:0`);
      this.blots.push(d);
    }
    this.root.append(this.shade, this.band, this.edgeTop, this.edgeBot, ...this.blots);
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
    this.watermark.textContent = spec.hanzi;
    this.name.textContent = spec.name;
    this.sealText.replaceChildren();
    for (const ch of spec.hanzi) {
      const c = document.createElement("div");
      c.textContent = ch;
      this.sealText.append(c);
    }
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
    // Open at once to its full height (the wipe reveals it); close over the last 0.14 s to its middle line.
    const close = smooth((t - (T - 0.14)) / 0.14);
    const open = 1 - close;
    const midL = (TOP_L + BOT_L) / 2;
    const midR = (TOP_R + BOT_R) / 2;
    const tl = midL + (TOP_L - midL) * open;
    const bl = midL + (BOT_L - midL) * open;
    const tr = midR + (TOP_R - midR) * open;
    const br = midR + (BOT_R - midR) * open;
    const slide = (1 - easeOut(t / 0.2)) * -3 + close * 5;
    this.band.style.clipPath = `polygon(0% ${tl * 100}%, 100% ${tr * 100}%, 100% ${br * 100}%, 0% ${bl * 100}%)`;
    this.band.style.transform = `translateX(${slide}%)`;
    // The ink-splash wipe: a soft wipe left to right whose edge is torn by splatter masks riding it.
    const w = easeOut(t / WIPE_S);
    const edgeX = -12 + 124 * w;
    if (w < 1) {
      const m =
        `linear-gradient(90deg,#000 0%,#000 ${Math.max(0, edgeX - 6)}%,rgba(0,0,0,0) ${edgeX + 2}%),` +
        `url(${SPLAT[0]}),url(${SPLAT[1]}),url(${SPLAT[2]}),url(${SPLAT[3]})`;
      const pos = `0 0,${edgeX - 9}% 18%,${edgeX - 4}% 72%,${edgeX - 12}% 46%,${edgeX - 2}% 30%`;
      const size = `100% 100%,${42 + 20 * w}% auto,${36 + 18 * w}% auto,${30 + 16 * w}% auto,${28 + 12 * w}% auto`;
      this.band.style.setProperty("-webkit-mask-image", m);
      this.band.style.setProperty("mask-image", m);
      this.band.style.setProperty("-webkit-mask-position", pos);
      this.band.style.setProperty("mask-position", pos);
      this.band.style.setProperty("-webkit-mask-size", size);
      this.band.style.setProperty("mask-size", size);
      this.band.style.setProperty("-webkit-mask-repeat", "no-repeat");
      this.band.style.setProperty("mask-repeat", "no-repeat");
      this.band.style.setProperty("-webkit-mask-composite", "source-over");
      this.band.style.setProperty("mask-composite", "add");
    } else {
      this.band.style.setProperty("-webkit-mask-image", "none");
      this.band.style.setProperty("mask-image", "none");
    }
    this.shade.style.opacity = String(0.85 * smooth(t / 0.1) * open);
    this.wash.style.transform = `translateX(${-3 * clamp01(t / T)}%)`;
    // The painting: her face at ~42 % of the height in the band's left half, a slow push in; the glint crosses it.
    const pw = 0.5 * W;
    const push = 1 + 0.08 * clamp01(t / T);
    const bgW = 1.15 * pw * push;
    const bgH = (bgW * IMG_H) / IMG_W;
    const bx = pw * 0.5 - FACE_X * bgW;
    const by = 0.43 * H - FACE_Y * bgH - 0.04 * H * clamp01(t / T);
    this.portrait.style.backgroundSize = `${bgW}px ${bgH}px`;
    this.portrait.style.backgroundPosition = `${bx}px ${by}px`;
    this.portrait.style.opacity = String(smooth((t - 0.04) / 0.1));
    // The glint: linear across, at full light through the middle of its run.
    const g = (t - 0.24) / 0.26;
    this.glint.style.opacity = g > 0 && g < 1 ? String(Math.min(1, 6.4 * g * (1 - g))) : "0";
    this.glint.style.backgroundPosition = `${100 - 100 * clamp01(g)}% 0`;
    // Edges follow the band; they flare on opening; their foil's sheen runs.
    const angle = Math.atan2((TOP_R - TOP_L) * H, W);
    const len = Math.hypot(W, (TOP_R - TOP_L) * H);
    const flare = 1 + 1.2 * (1 - smooth(t / 0.2));
    this.edgeTop.style.top = `${tl * H - 3}px`;
    this.edgeBot.style.top = `${bl * H - 3}px`;
    for (const e of [this.edgeTop, this.edgeBot]) {
      e.style.width = `${len * 1.04}px`;
      e.style.transform = `rotate(${angle}rad) scaleY(${flare})`;
      e.style.opacity = String(open * smooth(t / 0.06));
      e.style.backgroundPosition = `${-160 * (t / T)}% 0`;
      // The foil draws in with the wipe.
      e.style.clipPath = `inset(0 ${(1 - w) * 100}% 0 0)`;
    }
    // A point on the band at screen x (share), v across it (0 top … 1 bottom): y in px.
    const yAt = (xs: number, v: number): number => {
      const top = tl + (tr - tl) * xs;
      const bot = bl + (br - bl) * xs;
      return (top + (bot - top) * v) * H;
    };
    // Speed lines race right to left along the slope, all through the hold.
    for (let k = 0; k < SPEED_N; k += 1) {
      const [v, ln, , sp, ph] = this.speedSpec[k]!;
      const d = this.speed[k]!;
      const u = (ph + t * sp) % 1.6;
      const x = (1.25 - u) * W;
      d.style.width = `${ln * W}px`;
      d.style.opacity = String(0.7 * smooth(t / 0.08) * open);
      d.style.transform = `translate(${x}px, ${yAt(x / W, v)}px) rotate(${angle}rad)`;
    }
    // Light streaks run along the band, each once.
    for (let k = 0; k < STREAKS.length; k += 1) {
      const [s0, run, v] = STREAKS[k]!;
      const d = this.streaks[k]!;
      const u = (t - s0) / run;
      if (u < 0 || u > 1) {
        d.style.opacity = "0";
        continue;
      }
      const x = -0.6 * W + 1.9 * W * easeOut(u);
      d.style.opacity = String(Math.sin(Math.PI * u));
      d.style.transform = `translate(${x}px, ${yAt(Math.max(0, x / W), v)}px) rotate(${angle}rad)`;
    }
    // The right half: a huge faint hanzi watermark, the hanzi (secondary) over the English name (leading), a gold
    // rule drawing in, the seal stamping down.
    const wz = Math.round(0.34 * H);
    this.watermark.style.fontSize = `${wz}px`;
    this.watermark.style.left = `${0.5 * W}px`;
    this.watermark.style.top = `${yAt(0.5, 0.5) - wz * 0.55}px`;
    this.watermark.style.transform = `rotate(${angle}rad) translateX(${-2 * W * 0.01 * clamp01(t / T)}px)`;
    this.watermark.style.opacity = String(0.13 * smooth((t - 0.08) / 0.2) * open);
    const nx = 0.46 * W;
    const nz = Math.round(0.062 * H);
    const ny = yAt(0.6, 0.6) - nz * 0.5;
    const track = 1 - smooth((t - 0.12) / 0.32);
    this.name.style.fontSize = `${nz}px`;
    this.name.style.letterSpacing = `${0.05 + 0.3 * track}em`;
    this.name.style.left = `${nx}px`;
    this.name.style.top = `${ny}px`;
    this.name.style.transform = `rotate(${angle}rad) translateX(${30 * track}px)`;
    this.name.style.opacity = String(smooth((t - 0.1) / 0.12) * open);
    this.name.style.backgroundPosition = `${100 - 120 * clamp01((t - 0.15) / 0.6)}% 0`;
    const hz = Math.round(0.058 * H);
    this.hanzi.style.fontSize = `${hz}px`;
    this.hanzi.style.left = `${nx + 0.01 * W}px`;
    this.hanzi.style.top = `${ny - hz * 1.08}px`;
    const rv = smooth((t - 0.16) / 0.28);
    this.hanzi.style.clipPath = `inset(-20% ${(1 - rv) * 100}% -20% -5%)`;
    this.hanzi.style.transform = `rotate(${angle}rad) scale(${1.06 - 0.06 * rv})`;
    this.hanzi.style.opacity = String(0.92 * open);
    const rw = 0.44 * W * easeOut((t - 0.22) / 0.25);
    this.rule.style.width = `${rw}px`;
    this.rule.style.left = `${nx}px`;
    this.rule.style.top = `${ny + nz * 1.12}px`;
    this.rule.style.transform = `rotate(${angle}rad)`;
    this.rule.style.opacity = String(open);
    // The seal slams down at STAMP_AT after the hanzi (it signs the calligraphy): big and turned, then home with an
    // overshoot.
    const sz = Math.round(0.1 * H);
    const st = (t - STAMP_AT) / 0.12;
    const sx = nx + 0.01 * W + hz * 4.5 + sz * 0.5;
    this.seal.style.width = `${sz}px`;
    this.seal.style.height = `${sz}px`;
    this.seal.style.left = `${sx - sz / 2}px`;
    this.seal.style.top = `${ny - hz * 1.08 + hz * 0.5 + (sx - nx) * Math.tan(angle) - sz / 2}px`;
    this.sealText.style.fontSize = `${Math.round(sz * 0.36)}px`;
    if (st <= 0) this.seal.style.opacity = "0";
    else {
      const k = backOut(st);
      this.seal.style.opacity = String(Math.min(1, st * 3) * open);
      this.seal.style.transform = `rotate(${-8 + 4 * k}deg) scale(${1.9 - 0.9 * k})`;
      this.seal.style.setProperty("-webkit-mask-position", `${40 + 10 * Math.min(1, st)}% 45%, 0 0`);
      this.seal.style.setProperty("mask-position", `${40 + 10 * Math.min(1, st)}% 45%, 0 0`);
    }
    // Motes drift over the band, twinkling.
    for (let k = 0; k < MOTES_N; k += 1) {
      const [x0, v, size, drift, ph] = this.moteSpec[k]!;
      const d = this.motes[k]!;
      const xs = (x0 - drift * t + 1) % 1;
      const tw = 0.55 + 0.45 * Math.sin((t * 9 + ph * 6.28) * 1.3);
      d.style.width = d.style.height = `${size}px`;
      d.style.opacity = String(tw * smooth((t - 0.06) / 0.15) * open * (xs * W < edgeX * 0.01 * W ? 1 : 0));
      d.style.transform = `translate(${xs * W}px, ${yAt(xs, v) - size * 0.5 - t * 18}px)`;
    }
    // Ink blots flung past the edges as the wipe passes them: they pop out, then fade.
    for (let k = 0; k < BLOTS_N; k += 1) {
      const [xs, side, size, rot] = this.blotSpec[k]!;
      const d = this.blots[k]!;
      const born = WIPE_S * xs * 0.9;
      const a = (t - born) / 0.5;
      if (a < 0 || a > 1) {
        d.style.opacity = "0";
        continue;
      }
      const s = size * H * (0.6 + 0.6 * easeOut(a * 2));
      const y = (side === 0 ? (TOP_L + (TOP_R - TOP_L) * xs) * H - s * 0.62 : (BOT_L + (BOT_R - BOT_L) * xs) * H - s * 0.38) + (side === 0 ? -1 : 1) * 10 * a;
      d.style.width = d.style.height = `${s}px`;
      d.style.opacity = String(0.85 * (1 - smooth((a - 0.45) / 0.55)) * open);
      d.style.transform = `translate(${xs * W - s / 2}px, ${y}px) rotate(${rot}rad)`;
    }
  }
}
