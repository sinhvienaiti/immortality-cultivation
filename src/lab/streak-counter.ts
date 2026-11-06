/**
 * The word-streak counter (canon D60; docs/work/tasks/streak-counter.md; REF_VIDEO_LESSONS lesson 5; the owner's pick
 * 05/11 22:45: the gold-ink row): a large number in the top-left screen zone counting consecutive CLEAN words (GOOD or
 * better). Visual only: it never changes damage. FLASH and PERFECT add a gold flare (two crossed glints, one glint);
 * FAIR holds the count (no gain, no break); a SLOPPY word breaks it in a slow ink dissolve (BREAK_S), never a pop. It
 * never breaks on time. Tiers 10 / 25 / 50 / 100 cross-fade its emblem (the five plates cut from the approved art).
 * It fades to FADE_NEAR when a beast comes within NEAR_PX of it on screen, so it never sits over a word tag.
 * Every shape is the cut art (art-src/lab/ui/streak-counter/manifest.json: plates, the flakes atlas, the ribbons); the
 * numeral is Cormorant Garamond italic like the damage numbers. DOM over the canvas (the lab's).
 */
import type { Grade } from "../content/types";

/** Tiers (words), the plate each shows. */
export const STREAK_TIERS = [0, 10, 25, 50, 100] as const;
/** The pop on a clean word (scale, s), the break's dissolve (s), the tier change's cross-fade (s). */
const POP = 1.22;
const POP_S = 0.4;
export const BREAK_S = 1.4;
const TIER_S = 0.35;
/** Its opacity when a beast comes within NEAR_PX of its box. */
const FADE_NEAR = 0.25;
const NEAR_PX = 40;

/** The tier a streak of `n` words stands at (0–4). */
export function streakTier(n: number): number {
  let t = 0;
  for (let k = 1; k < STREAK_TIERS.length; k += 1) if (n >= STREAK_TIERS[k]!) t = k;
  return t;
}

/** A sprite of the flakes atlas (the manifest's items). */
interface Sprite {
  readonly kind: "flake" | "glint" | "fleck" | "smoke";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Manifest {
  readonly plates: { readonly frame: readonly [number, number]; readonly items: readonly { readonly tier: number; readonly file: string }[] };
  readonly flakes: { readonly file: string; readonly atlas: readonly [number, number]; readonly items: readonly Sprite[] };
  readonly ribbons: { readonly file: string; readonly w: number; readonly h: number };
}

export class StreakCounter {
  /** Clean words in a row, the best this session, the tier now. */
  count = 0;
  best = 0;
  tier = 0;
  /** What each grade did (the lab's report). */
  readonly grades: Record<Grade, number> = { flash: 0, perfect: 0, good: 0, ok: 0, sloppy: 0 };
  private readonly root: HTMLDivElement;
  private readonly plates: HTMLImageElement[] = [];
  private ribbons: HTMLImageElement | null = null;
  private readonly num: HTMLDivElement;
  private readonly fx: HTMLDivElement;
  private atlas: Manifest["flakes"] | null = null;
  private base = "";
  private breaking = 0;
  private faded = false;

  /** `parent`: where it lives (the lab: document.body); `base`: the layers' folder URL. */
  constructor(parent: HTMLElement, base: string) {
    this.base = base;
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;left:20px;top:10px;z-index:9;pointer-events:none;transition:opacity .2s;opacity:0";
    const num = document.createElement("div");
    num.style.cssText = 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:italic 700 64px "Cormorant Garamond", Georgia, serif;'
      + "line-height:1;letter-spacing:.01em;background:linear-gradient(180deg,#fff7dc 0%,#f6d27a 42%,#c48a2c 78%,#8a5a18 100%);-webkit-background-clip:text;background-clip:text;"
      + "color:transparent;-webkit-text-stroke:1.6px rgba(24,12,4,.88);filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))";
    const fx = document.createElement("div");
    fx.style.cssText = "position:absolute;inset:0;overflow:visible";
    root.append(num, fx);
    parent.append(root);
    this.root = root;
    this.num = num;
    this.fx = fx;
    this.size();
    window.addEventListener("resize", () => this.size());
    void this.load();
  }

  private async load(): Promise<void> {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch(this.base + "manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const m = (await res.json()) as Manifest;
      for (const it of [...m.plates.items].sort((a, b) => a.tier - b.tier)) {
        const img = document.createElement("img");
        img.src = this.base + it.file;
        img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity ${TIER_S}s`;
        this.root.insertBefore(img, this.num);
        this.plates.push(img);
      }
      const rib = document.createElement("img");
      rib.src = this.base + m.ribbons.file;
      rib.style.cssText = `position:absolute;left:-14%;top:-6%;width:128%;height:auto;opacity:0;transition:opacity ${TIER_S}s`;
      this.root.insertBefore(rib, this.num);
      this.ribbons = rib;
      this.atlas = m.flakes;
      this.show();
    } catch (error) {
      console.warn("[streak] no layers at " + this.base, error);
    }
  }

  /** Its box: 20 % of the view's height (140–230 px), the plates' 538 × 788 shape. */
  private size(): void {
    const h = Math.max(140, Math.min(230, (typeof innerHeight === "number" ? innerHeight : 1080) * 0.2));
    this.root.style.height = `${h}px`;
    this.root.style.width = `${Math.round((h * 538) / 788)}px`;
    this.num.style.fontSize = `${Math.round(h * 0.3)}px`;
  }

  /** A typed word of `grade`. */
  word(grade: Grade): void {
    this.grades[grade] += 1;
    if (grade === "sloppy") {
      this.break();
      return;
    }
    // FAIR holds the streak: no gain, no break.
    if (grade === "ok") return;
    this.breaking = 0;
    this.count += 1;
    this.best = Math.max(this.best, this.count);
    const tier = streakTier(this.count);
    const up = tier > this.tier;
    this.tier = tier;
    this.show();
    this.num.getAnimations().forEach((a) => a.cancel());
    this.num.style.opacity = "1";
    this.num.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,.75))";
    this.num.animate([{ transform: `translateY(-50%) scale(${POP})` }, { transform: "translateY(-50%) scale(1)" }], { duration: POP_S * 1000, easing: "cubic-bezier(.2,.9,.3,1)" });
    // A flake or two for every clean word; FLASH two crossed glints, PERFECT one; a tier's rise a burst.
    this.spray("flake", up ? 8 : grade === "flash" ? 3 : 1, up ? 1.25 : 0.8);
    if (grade === "flash") {
      this.glint(0.62, 0.32, 1.15, -18);
      this.glint(0.38, 0.38, 0.9, 24);
    } else if (grade === "perfect") this.glint(0.6, 0.34, 0.9, 0);
    if (up) {
      this.glint(0.5, 0.2, 1.6, 0);
      this.glint(0.24, 0.6, 1.1, 40);
    }
  }

  /** A SLOPPY word: the number dissolves in ink over BREAK_S, the emblem falls back to the first tier. */
  private break(): void {
    if (this.count === 0) return;
    this.count = 0;
    this.tier = 0;
    this.breaking = BREAK_S;
    this.num.getAnimations().forEach((a) => a.cancel());
    this.num.animate(
      [{ opacity: 1, filter: "blur(0px) drop-shadow(0 2px 3px rgba(0,0,0,.75))", transform: "translateY(-50%) scale(1)" },
        { opacity: 0, filter: "blur(7px) drop-shadow(0 2px 3px rgba(0,0,0,0))", transform: "translateY(-46%) scale(1.06)" }],
      { duration: BREAK_S * 1000, easing: "cubic-bezier(.3,0,.6,1)", fill: "forwards" },
    );
    this.spray("smoke", 3, 1.1, BREAK_S);
    this.spray("fleck", 5, 0.8, BREAK_S * 0.8);
    window.setTimeout(() => {
      if (this.count === 0) this.show();
    }, BREAK_S * 600);
  }

  /** The number and the tier's plate (a cross-fade); nothing shows before the first clean word. */
  private show(): void {
    this.root.style.opacity = this.count > 0 || this.breaking > 0 ? (this.faded ? String(FADE_NEAR) : "1") : "0";
    if (this.count > 0) this.num.textContent = String(this.count);
    this.plates.forEach((p, k) => (p.style.opacity = k === this.tier ? "1" : "0"));
    if (this.ribbons !== null) this.ribbons.style.opacity = this.tier >= 4 ? "1" : "0";
  }

  /** `n` sprites of `kind` thrown out from the number, `scale` of their art's size / 6, over `life` s. */
  private spray(kind: Sprite["kind"], n: number, scale: number, life = 0.9): void {
    const at = this.atlas;
    if (at === null) return;
    const pick = at.items.filter((s) => s.kind === kind);
    if (pick.length === 0) return;
    const box = this.root.getBoundingClientRect();
    const k = (box.height / 788) * scale * 0.55;
    for (let q = 0; q < n; q += 1) {
      const s = pick[Math.floor(Math.random() * pick.length)]!;
      const el = this.sprite(at, s, k);
      const ang = Math.random() * Math.PI * 2;
      const r = box.height * (kind === "smoke" ? 0.12 : 0.3 + Math.random() * 0.25);
      const x0 = box.width * 0.5 - (s.w * k) / 2;
      const y0 = box.height * 0.5 - (s.h * k) / 2;
      el.style.left = `${x0}px`;
      el.style.top = `${y0}px`;
      const spin = (Math.random() - 0.5) * 160;
      el.animate(
        [{ transform: "translate(0,0) rotate(0deg) scale(.6)", opacity: kind === "smoke" ? 0.85 : 1 },
          { transform: `translate(${Math.cos(ang) * r}px,${Math.sin(ang) * r - (kind === "smoke" ? box.height * 0.15 : 0)}px) rotate(${spin}deg) scale(1)`, opacity: 0 }],
        { duration: life * 1000 * (0.8 + Math.random() * 0.4), easing: "cubic-bezier(.15,.8,.3,1)", fill: "forwards" },
      ).onfinish = () => el.remove();
    }
  }

  /** A gold glint at (u, v) of its box, `scale`, turned `rot` degrees: a flash that blooms and fades. */
  private glint(u: number, v: number, scale: number, rot: number): void {
    const at = this.atlas;
    if (at === null) return;
    // A small glint (its art's soft halo stays a halo; the big ones read as a white blob on the ink).
    const glints = at.items.filter((s) => s.kind === "glint").sort((a, b) => a.w * a.h - b.w * b.h);
    const s = glints[Math.floor(glints.length / 3)];
    if (s === undefined) return;
    const box = this.root.getBoundingClientRect();
    const k = (box.height / 788) * scale * 0.55;
    const el = this.sprite(at, s, k);
    el.style.left = `${box.width * u - (s.w * k) / 2}px`;
    el.style.top = `${box.height * v - (s.h * k) / 2}px`;
    el.animate(
      [{ transform: `rotate(${rot}deg) scale(.3)`, opacity: 0 }, { transform: `rotate(${rot}deg) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `rotate(${rot + 12}deg) scale(.9)`, opacity: 0 }],
      { duration: 650, easing: "ease-out", fill: "forwards" },
    ).onfinish = () => el.remove();
  }

  private sprite(at: Manifest["flakes"], s: Sprite, k: number): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;width:${s.w * k}px;height:${s.h * k}px;background:url("${this.base + at.file}") no-repeat;`
      + `background-size:${at.atlas[0] * k}px ${at.atlas[1] * k}px;background-position:${-s.x * k}px ${-s.y * k}px;will-change:transform,opacity`;
    this.fx.append(el);
    return el;
  }

  /**
   * Once a frame: where it sits (`left` px: right of the lab's panel when that shows), whether a beast is within NEAR_PX
   * of it on screen (`near(rect)`), and the break's dissolve running out.
   */
  update(dt: number, left: number, near: (r: DOMRect, px: number) => boolean): void {
    this.root.style.left = `${left}px`;
    if (this.breaking > 0) {
      this.breaking = Math.max(0, this.breaking - dt);
      if (this.breaking === 0) this.show();
    }
    const faded = (this.count > 0 || this.breaking > 0) && near(this.root.getBoundingClientRect(), NEAR_PX);
    if (faded !== this.faded) {
      this.faded = faded;
      this.show();
    }
  }

  /** The box it fills on screen (__lab). */
  rect(): DOMRect {
    return this.root.getBoundingClientRect();
  }

  reset(): void {
    this.count = 0;
    this.tier = 0;
    this.breaking = 0;
    this.show();
  }
}
