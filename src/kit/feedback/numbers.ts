// Source: games/space-typing@survival-s0 src/feedback/numbers.ts (kit copy: windows, colours and label from the profile; log fixes in shared/game-kit/DRIFT.md)
/**
 * Damage numbers (SURVIVAL_MODE_PLAN.md 5.4; dragon-hold 05 §5), drawn by
 * WebGL from a digit atlas painted on a canvas at load (no DOM per number).
 *
 * NumberField is the rule part, testable without a GPU: blows on one target
 * within the profile's mergeS (150 ms) roll up into one number that pops
 * again; ticks (a beam's pulses, a trap's burn) roll up over tickMergeS
 * (0.3 s) and show "×N"; a number flies along its blow;
 * over the cap the smallest goes first, never one of T3 or above; and no
 * number may cover a protected rectangle (the learning frame, the gun slots,
 * the health bar, the word tags, published by the HUD in screen pixels): it
 * is moved above it or dropped, and one that drifts into one is dropped (its
 * box counts its pop). A number landing on a young one of the same style
 * below T3 is taken into it (a crowd's hits read as one growing number, not a
 * tower); else it moves beside it, and only then above. Live numbers never
 * overlap for more than a frame (settle()).
 * NumberSprites draws the field in one instanced draw call.
 */
import * as THREE from "three";
import { SHIP, type FeedbackProfile } from "./profiles";
import { instancedQuads, uploadQuads } from "./quads";
import { TIERS, tier, type TierProfile } from "./tiers";

export type Rect = { x: number; y: number; w: number; h: number };
/** A number's look: normal, crit (a strong blow; dragon-hold has no random crits), perfect (Flash, Perfect: with the label), tick. */
export const STYLE = { normal: 0, crit: 1, perfect: 2, tick: 3 } as const;
const MAX = 200;
/** Glyph advance and height as shares of the font size. */
const ADVANCE = 0.58;
const LABEL = 0.42;

export class NumberField {
  limit = 160;
  /** Base font size in CSS px (the HUD scales it with the view). */
  fontPx = 20;
  protected: readonly Rect[] = [];
  dropped = 0;
  readonly alive = new Uint8Array(MAX);
  readonly key = new Int32Array(MAX);
  readonly style = new Uint8Array(MAX);
  readonly tier = new Uint8Array(MAX);
  readonly value = new Float64Array(MAX);
  readonly count = new Int32Array(MAX);
  readonly x = new Float32Array(MAX);
  readonly y = new Float32Array(MAX);
  readonly vx = new Float32Array(MAX);
  readonly vy = new Float32Array(MAX);
  readonly born = new Float64Array(MAX);
  readonly age = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly size = new Float32Array(MAX);
  readonly pop = new Float32Array(MAX);
  live = 0;

  private readonly labels: string[] = new Array<string>(MAX).fill("");

  constructor(readonly profile: FeedbackProfile = SHIP) {}

  /** Text shown for number i (digits, then "×N" for rolled-up ticks), kept until it changes. */
  text(i: number): string {
    return this.labels[i]!;
  }

  private relabel(i: number): void {
    const digits = String(Math.max(1, Math.round(this.value[i]!)));
    this.labels[i] = this.style[i] === STYLE.tick && this.count[i]! > 1 ? digits + "×" + this.count[i] : digits;
  }

  /** The number's box in screen px, centred on (x, y), as drawn now (its pop included). */
  box(i: number, out: Rect, x = this.x[i]!, y = this.y[i]!): Rect {
    const px = this.fontPx * this.size[i]! * popScale(this.tier[i]!, this.pop[i]!, this.profile.tiers);
    const glyphs = this.text(i).length;
    out.w = glyphs * ADVANCE * px;
    out.h = px * (this.style[i] === STYLE.perfect ? 1 + LABEL : 1);
    out.x = x - out.w / 2;
    out.y = y - px / 2 - (this.style[i] === STYLE.perfect ? LABEL * px : 0);
    return out;
  }

  private covers(box: Rect): Rect | null {
    for (const rect of this.protected) {
      if (box.x < rect.x + rect.w && box.x + box.w > rect.x && box.y < rect.y + rect.h && box.y + box.h > rect.y) return rect;
    }
    return null;
  }

  /**
   * A blow worth `value` on target `key` at screen (x, y), flying along
   * (dx, dy); `size` and `life` from the tier. Returns the number's index,
   * or −1 when it was dropped.
   */
  spawn(key: number, x: number, y: number, value: number, style: number, tierId: number, size: number, life: number, dx: number, dy: number, now: number): number {
    const tick = style === STYLE.tick;
    for (let i = 0; i < MAX; i += 1) {
      if (this.alive[i] === 0 || this.key[i] !== key || (this.style[i] === STYLE.tick) !== tick) continue;
      if (now - this.born[i]! > (tick ? this.profile.numbers.tickMergeS : this.profile.numbers.mergeS)) continue;
      this.value[i] = this.value[i]! + value;
      this.count[i] = this.count[i]! + 1;
      this.style[i] = Math.max(this.style[i]!, style);
      this.tier[i] = Math.max(this.tier[i]!, tierId);
      this.size[i] = Math.max(this.size[i]!, size);
      this.life[i] = Math.max(this.life[i]!, this.age[i]! + life * 0.8);
      this.pop[i] = 1;
      this.relabel(i);
      if (this.covers(this.box(i, SCRATCH)) !== null) this.kill(i);
      return this.alive[i] === 1 ? i : -1;
    }
    let slot = -1;
    for (let i = 0; i < MAX && slot < 0; i += 1) if (this.alive[i] === 0) slot = i;
    if (this.live >= this.limit || slot < 0) {
      // Over the cap: the smallest number below T3 goes (or this one, if it is smaller).
      let victim = -1;
      for (let i = 0; i < MAX; i += 1) {
        if (this.alive[i] === 1 && this.tier[i]! < 3 && (victim < 0 || this.value[i]! < this.value[victim]!)) victim = i;
      }
      if (victim < 0 || (tierId < 3 && value <= this.value[victim]!)) {
        this.dropped += 1;
        return -1;
      }
      this.kill(victim);
      slot = victim;
    }
    const length = Math.hypot(dx, dy) || 1;
    this.alive[slot] = 1;
    this.key[slot] = key;
    this.style[slot] = style;
    this.tier[slot] = tierId;
    this.value[slot] = value;
    this.count[slot] = 1;
    this.born[slot] = now;
    this.age[slot] = 0;
    this.life[slot] = life;
    this.size[slot] = size;
    this.pop[slot] = 1;
    this.relabel(slot);
    // Out along the blow, tilted up (≈15°), then floating.
    this.vx[slot] = (dx / length) * 70;
    this.vy[slot] = (dy / length) * 40 - 90;
    this.x[slot] = x + (dx / length) * 10;
    this.y[slot] = y - 16;
    this.live += 1;
    // Never over a protected rectangle (above it, or not at all); on a young
    // number of its kind it merges, else it goes beside it, then above.
    let side = dx < 0 ? -1 : 1;
    for (let tries = 0; tries < 6; tries += 1) {
      const box = this.box(slot, SCRATCH);
      if (box.y < 0) break;
      const rect = this.covers(box);
      if (rect !== null) {
        this.y[slot] = this.y[slot]! - (box.y + box.h - rect.y) - 3;
        continue;
      }
      const other = this.crowding(slot, box);
      if (other < 0) return slot;
      if (this.mergeable(other, slot, now)) return this.absorb(other, slot);
      const near = this.box(other, OTHER);
      if (tries < 2) {
        this.x[slot] = near.x + near.w / 2 + side * (near.w / 2 + box.w / 2 + 4);
        side = -side;
      } else this.y[slot] = this.y[slot]! - (box.y + box.h - near.y) - 3;
    }
    if (this.covers(this.box(slot, SCRATCH)) === null && SCRATCH.y >= 0) return slot;
    this.kill(slot);
    this.dropped += 1;
    return -1;
  }

  /** Another live number this one's box sits on (its index), or −1. */
  private crowding(slot: number, box: Rect): number {
    for (let i = 0; i < MAX; i += 1) {
      if (i === slot || this.alive[i] === 0) continue;
      const other = this.box(i, OTHER);
      if (box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y) return i;
    }
    return -1;
  }

  /** `slot` (just born) may be taken into `other`: same style, both below T3, `other` younger than the profile's crowdMergeS. */
  private mergeable(other: number, slot: number, now: number): boolean {
    return this.style[other] === this.style[slot] && this.tier[other]! < 3 && this.tier[slot]! < 3 && now - this.born[other]! <= this.profile.numbers.crowdMergeS;
  }

  /** Adds number `slot` into `other` and frees `slot`; returns `other` (or −1 if it now covers a protected rectangle). */
  private absorb(other: number, slot: number): number {
    this.value[other] = this.value[other]! + this.value[slot]!;
    this.count[other] = this.count[other]! + this.count[slot]!;
    this.size[other] = Math.max(this.size[other]!, this.size[slot]!);
    this.life[other] = Math.max(this.life[other]!, this.age[other]! + this.life[slot]! * 0.8);
    this.pop[other] = 1;
    this.relabel(other);
    this.kill(slot);
    if (this.covers(this.box(other, SCRATCH)) !== null) {
      this.kill(other);
      this.dropped += 1;
      return -1;
    }
    return other;
  }

  kill(i: number): void {
    if (this.alive[i] === 0) return;
    this.alive[i] = 0;
    this.live -= 1;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i += 1) {
      if (this.alive[i] === 0) continue;
      this.age[i] = this.age[i]! + dt;
      if (this.age[i]! >= this.life[i]!) {
        this.kill(i);
        continue;
      }
      const drag = Math.exp(-4 * dt);
      this.vx[i] = this.vx[i]! * drag;
      this.vy[i] = this.vy[i]! * drag;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
      this.pop[i] = Math.max(0, this.pop[i]! - dt * 7);
      if (this.covers(this.box(i, SCRATCH)) !== null) {
        this.kill(i);
        this.dropped += 1;
      }
    }
    this.settle();
  }

  /**
   * Numbers that grew (a longer label) or drifted onto each other: the
   * younger merges into the older (same style, both below T3), else it moves
   * above it. update() runs it every frame; call it after moving numbers by hand.
   */
  settle(): void {
    for (let i = 0; i < MAX; i += 1) {
      if (this.alive[i] === 0) continue;
      for (let j = i + 1; j < MAX && this.alive[i] === 1; j += 1) {
        if (this.alive[j] === 0) continue;
        const a = this.box(i, SCRATCH);
        const b = this.box(j, OTHER);
        if (!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)) continue;
        const older = this.born[i]! <= this.born[j]! ? i : j;
        const younger = older === i ? j : i;
        if (this.style[i] === this.style[j] && this.tier[i]! < 3 && this.tier[j]! < 3) this.absorb(older, younger);
        else {
          const top = older === i ? a.y : b.y;
          const bottom = younger === i ? a.y + a.h : b.y + b.h;
          this.y[younger] = this.y[younger]! - (bottom - top) - 2;
        }
      }
    }
  }

  /** Live numbers that cover a protected rectangle (must stay 0). */
  overlaps(): number {
    let count = 0;
    for (let i = 0; i < MAX; i += 1) if (this.alive[i] === 1 && this.covers(this.box(i, SCRATCH)) !== null) count += 1;
    return count;
  }
}

const SCRATCH: Rect = { x: 0, y: 0, w: 0, h: 0 };
const OTHER: Rect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * NumberSprites' glyph atlas and how its quads map it to the screen
 * (exported so a game can size a number's box as drawn). Digits sit in one
 * row of cells, each wider than its glyph's ink (italic glyphs with their
 * outline overran the old 48 px cells into the next one); the label has its
 * own row, far enough below that its accents (À, Ả) stay out of the digits.
 * The drawn scale is unchanged: a glyph quad is 1.25 font sizes tall for the
 * 64 rows of a cell and 1.4 advances wide for 48 of its columns (`refCellW`),
 * the label 1.3 label heights tall for 64 rows of its row, its middle 0.4
 * label heights above the digits' top.
 */
export const NUMBER_ATLAS = {
  glyphs: "0123456789×",
  width: 1024,
  height: 256,
  /** Digit row: cells `cellH` tall at the top; each glyph painted at its cell's middle, `digitMidY` down, with a `digitOutline` px stroke. */
  cellH: 64,
  minCellW: 64,
  refCellW: 48,
  digitFont: 'italic 800 52px "Exo 2", "Be Vietnam Pro", system-ui, sans-serif',
  digitMidY: 34,
  digitOutline: 9,
  /** Ink kept clear of a cell's edge, px (edge smoothing and mipmaps). */
  edgePx: 3,
  glyphQuadH: 1.25,
  glyphQuadW: 1.4,
  /** Label row: `labelRowH` rows from `labelTop`, painted at its middle with a `labelOutline` px stroke. */
  labelFont: '800 40px "Be Vietnam Pro", "Exo 2", system-ui, sans-serif',
  labelTop: 128,
  labelRowH: 128,
  labelOutline: 8,
  labelQuadH: 1.3,
  labelMidUp: 0.4,
  /** Glyph advance and label height as shares of the font size (NumberField.box). */
  advance: ADVANCE,
  label: LABEL,
} as const;

/** The parts of canvas TextMetrics the atlas reads. */
export type GlyphMetrics = { readonly width: number; readonly actualBoundingBoxLeft?: number; readonly actualBoundingBoxRight?: number };

/** Ink half-width (px, outline and edge included) of a centred glyph: its measured box, or its advance plus an italic lean when the canvas gives no box. */
function inkHalf(metrics: GlyphMetrics, outline: number): number {
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  const half = Number.isFinite(left) && Number.isFinite(right) ? Math.max(left!, right!) : metrics.width * 0.75;
  return half + outline / 2 + NUMBER_ATLAS.edgePx;
}

/**
 * The digit cell width (px) that holds every glyph's ink, given its metrics in
 * the digit font: at least `minCellW`, even, at most what fits the atlas.
 */
export function digitCellWidth(measure: (glyph: string) => GlyphMetrics): number {
  const { glyphs, digitOutline, minCellW, width } = NUMBER_ATLAS;
  let half = 0;
  for (const glyph of glyphs) half = Math.max(half, inkHalf(measure(glyph), digitOutline));
  const most = Math.floor(width / glyphs.length / 2) * 2;
  return Math.min(most, Math.max(minCellW, Math.ceil(half) * 2));
}

const GLYPHS = NUMBER_ATLAS.glyphs;
const CELL_H = NUMBER_ATLAS.cellH;

const VERTEX = /* glsl */ `
attribute vec4 iRect;
attribute vec4 iUv;
attribute vec4 iColor;
uniform vec2 uScreen;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = mix(iUv.xy, iUv.zw, uv);
  vColor = iColor;
  vec2 p = iRect.xy + position.xy * iRect.zw;
  gl_Position = vec4(p.x / uScreen.x * 2.0 - 1.0, 1.0 - p.y / uScreen.y * 2.0, 0.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(texel.rgb * vColor.rgb, texel.a * vColor.a);
}`;

/** The field's numbers as instanced quads in screen space, over the 3D view. */
export class NumberSprites {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly rect: Float32Array;
  private readonly uv: Float32Array;
  private readonly color: Float32Array;
  private readonly capacity = MAX * 8;
  private readonly atlasWidth: number;
  /** Width of a digit cell in the atlas (px): every glyph's ink fits in its own cell. */
  readonly cellWidth: number;
  private readonly labelWidth: number;
  private readonly colors: THREE.Color[];
  private readonly labelColor: THREE.Color;

  constructor(readonly profile: FeedbackProfile = SHIP) {
    const { colors, label, labelColor } = profile.numbers;
    const A = NUMBER_ATLAS;
    this.colors = colors.map((color) => new THREE.Color(color));
    this.labelColor = new THREE.Color(labelColor);
    const canvas = document.createElement("canvas");
    this.atlasWidth = A.width;
    canvas.width = A.width;
    canvas.height = A.height;
    const paint = canvas.getContext("2d");
    this.labelWidth = 0;
    this.cellWidth = A.minCellW;
    if (paint !== null) {
      paint.textAlign = "center";
      paint.textBaseline = "middle";
      paint.lineJoin = "round";
      paint.font = A.digitFont;
      // White glyphs in a dark outline (the outline stays dark under any tint).
      const glyph = (text: string, x: number, y: number, outline: number) => {
        paint.lineWidth = outline;
        paint.strokeStyle = "rgba(6,8,22,0.93)";
        paint.strokeText(text, x, y);
        paint.fillStyle = "#ffffff";
        paint.fillText(text, x, y);
      };
      const cell = digitCellWidth((char) => paint.measureText(char));
      this.cellWidth = cell;
      [...GLYPHS].forEach((char, index) => glyph(char, index * cell + cell / 2, A.digitMidY, A.digitOutline));
      paint.font = A.labelFont;
      const metrics = paint.measureText(label);
      const inked = Number.isFinite(metrics.actualBoundingBoxLeft) && Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight : 0;
      this.labelWidth = Math.min(A.width - 8, Math.ceil(Math.max(metrics.width, inked)) + 16);
      glyph(label, this.labelWidth / 2, A.labelTop + A.labelRowH / 2, A.labelOutline);
    }
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = THREE.SRGBColorSpace;
    // Canvas rows top down (v 0 at the top), as the quads are laid out on screen.
    atlas.flipY = false;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    this.rect = new Float32Array(this.capacity * 4);
    this.uv = new Float32Array(this.capacity * 4);
    this.color = new Float32Array(this.capacity * 4);
    const geometry = instancedQuads({ iRect: [this.rect, 4], iUv: [this.uv, 4], iColor: [this.color, 4] }, true);
    const material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uScreen: { value: new THREE.Vector2(1, 1) } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Screen y grows down, which turns the quads round: draw both faces.
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  private quad(n: number, x: number, y: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number, color: THREE.Color, alpha: number): number {
    if (n >= this.capacity) return n;
    const o = n * 4;
    const { rect, uv, color: rgba } = this;
    rect[o] = x; rect[o + 1] = y; rect[o + 2] = w; rect[o + 3] = h;
    uv[o] = u0; uv[o + 1] = v0; uv[o + 2] = u1; uv[o + 3] = v1;
    rgba[o] = color.r; rgba[o + 1] = color.g; rgba[o + 2] = color.b; rgba[o + 3] = alpha;
    return n + 1;
  }

  /** Writes the field's glyphs for a view `width` × `height` CSS px. */
  write(field: NumberField, width: number, height: number): void {
    (this.mesh.material.uniforms.uScreen!.value as THREE.Vector2).set(width, height);
    const A = NUMBER_ATLAS;
    const W = this.atlasWidth;
    const H = A.height;
    const cell = this.cellWidth;
    // A cell wider than the 48 columns 1.4 advances stand for keeps the glyph's drawn scale: the quad grows, not the glyph.
    const cellScale = cell / A.refCellW;
    const labelRows = A.labelRowH / CELL_H;
    let n = 0;
    for (let i = 0; i < field.alive.length; i += 1) {
      if (field.alive[i] === 0) continue;
      const text = field.text(i);
      const style = field.style[i]!;
      const k = field.age[i]! / field.life[i]!;
      const alpha = Math.min(1, (1 - k) * 3.5);
      // The field's tiers, so the drawn size is the size its box() counts.
      const px = field.fontPx * field.size[i]! * popScale(field.tier[i]!, field.pop[i]!, field.profile.tiers);
      const color = this.colors[style] ?? this.colors[0]!;
      const advance = px * ADVANCE;
      let x = field.x[i]! - (text.length * advance) / 2;
      const y = field.y[i]! - px / 2;
      const times = text.indexOf("×");
      for (let c = 0; c < text.length; c += 1) {
        const g = GLYPHS.indexOf(text[c]!);
        const s = times >= 0 && c >= times ? 0.68 : 1;
        // The glyph's middle, as it always was: the middle of the old quad (advance × 1.4, from 0.2 advance left of x).
        const middle = x - advance * 0.2 + (advance * A.glyphQuadW * s) / 2;
        const w = advance * A.glyphQuadW * s * cellScale;
        n = this.quad(n, middle - w / 2, y + px * (1 - s) * 0.9, w, px * A.glyphQuadH * s, (g * cell) / W, 0, ((g + 1) * cell) / W, CELL_H / H, color, alpha);
        x += advance * s;
      }
      if (style === STYLE.perfect) {
        const lh = px * LABEL;
        const lw = lh * (this.labelWidth / A.refCellW);
        const h = lh * A.labelQuadH * labelRows;
        // The label's middle sits labelMidUp label heights above the digits' top.
        n = this.quad(n, field.x[i]! - lw / 2, y - lh * A.labelMidUp - h / 2, lw, h, 0, A.labelTop / H, this.labelWidth / W, (A.labelTop + A.labelRowH) / H, this.labelColor, alpha);
      }
    }
    uploadQuads(this.mesh.geometry, n);
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (this.mesh.geometry.instanceCount === 0) return;
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = clear;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material.uniforms.uAtlas!.value as THREE.Texture).dispose();
    this.mesh.material.dispose();
  }
}

/** The scale a number of tier `tierId` is drawn at while popping (`pop` 1 → 0), from `table`'s pop. */
export function popScale(tierId: number, pop: number, table: readonly TierProfile[] = TIERS): number {
  return 1 + ((tier(tierId, table).number?.pop ?? 1) - 1) * pop;
}
