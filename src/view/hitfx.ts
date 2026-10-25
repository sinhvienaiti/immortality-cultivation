// Source: games/dragon-hold/src/view/number-field.ts @06cd4e6 (DrawnNumberField, adapted: the drawn box computed in place, no float passed to a call) and src/kit/feedback/numbers.ts NumberSprites (kit 0.1.0, adapted: write() fills the quads in place and marks the uploads without Object.values)
/**
 * Hit effects (canon §20.3, PB-36): hit sparks (instanced additive quads:
 * streaks along their flight and a flash, one draw call, Tuyến Cuối's Glows
 * kind), damage numbers (kit NumberField with Rồng's drawn-size box, small
 * numbers on one target merged every 0.25 s, drawn over the frame in one
 * instanced call), and ink smoke when a beast dies (soft ink blots that swell,
 * rise and fade; canon §10.9: ink smoke and ivory motes, never blood). Damage
 * numbers and ink smoke live only in this lane; Lane 6 wires events to them.
 * Pools are preallocated; nothing allocates per frame (spawning a number
 * builds its label string, once per blow).
 * Owner: Lane 1.
 */
import * as THREE from "three";
import { NUMBER_ATLAS, NumberField, STYLE, digitCellWidth, type Rect } from "../kit/feedback/numbers";
import { DRAGON, type FeedbackProfile } from "../kit/feedback/profiles";
import { TIERS, tier as tierRow, type TierProfile } from "../kit/feedback/tiers";
import type { ScreenPoint } from "../app/contracts";
import type { Overlay, Renderer3D } from "./renderer";

export { STYLE } from "../kit/feedback/numbers";

/**
 * The numbers' profile (canon §20.3: small numbers on one target merge every
 * 0.25 s): the kit's dragon profile (no gold, no random crits) with that window.
 */
export const IC_NUMBERS: FeedbackProfile = { ...DRAGON, numbers: { ...DRAGON.numbers, mergeS: 0.25 } };

/** A float uniform with its own hidden class (crowd.ts: a `{ value }` literal boxes each write). */
class FloatUniform {
  value = 0;
  constructor(value = 0) {
    this.value = value;
  }
}

/** Event calls made at load so V8 compiles spark() and puff() before the first blow (an unoptimised function boxes every float). */
const WARM_EVENTS = 400;

/** Draws in a random table (a power of two): read `table[(cursor = (cursor + 1) & RANDOM_MASK)]`. */
export const RANDOM_SIZE = 4096;
export const RANDOM_MASK = RANDOM_SIZE - 1;

/**
 * View-only randomness: RANDOM_SIZE xorshift32 draws in [0, 1), read round by
 * a cursor in the caller. A method returning a fresh double may run without
 * being inlined, and V8 then boxes every value it returns; a table read is a
 * plain load.
 */
export function randomTable(seed: number): Float32Array {
  const values = new Float32Array(RANDOM_SIZE);
  let s = seed >>> 0 || 1;
  for (let k = 0; k < RANDOM_SIZE; k += 1) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    values[k] = (s >>> 0) / 4_294_967_296;
  }
  return values;
}

// ── Hit sparks ──────────────────────────────────────────────────────────────

export interface HitFx {
  /** A blow of feedback tier `tier` (T0–T5) at a point (m): the tier's sparks and a flash. */
  spark(x: number, y: number, z: number, tier: number): void;
  /** L1 of the ladder: 0.5 spawns half the sparks. */
  setShare(share: number): void;
  readonly live: number;
  update(dt: number): void;
  drawCalls(): number;
  dispose(): void;
}

export interface HitFxOptions {
  /** Live sparks at most (default 1 200). */
  readonly capacity?: number;
  readonly share?: number;
  readonly seed?: number;
}

const SPARK_VERTEX = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
varying vec2 vUv;
varying vec4 vColor;
varying float vKind;
void main() {
  vUv = uv;
  vColor = vec4(iC.rgb, iB.w);
  vKind = iC.a;
  vec4 p = viewMatrix * vec4(iA.xyz, 1.0);
  vec2 offset;
  if (iC.a < 0.5) {
    // A streak along its flight on screen.
    vec4 q = viewMatrix * vec4(iA.xyz + iB.xyz * 0.035, 1.0);
    vec2 dir = q.xy - p.xy;
    float len = length(dir);
    dir = len > 1e-5 ? dir / len : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    offset = perp * position.x * iA.w * 0.35 + dir * (position.y * (len + iA.w));
  } else {
    offset = position.xy * iA.w;
  }
  gl_Position = projectionMatrix * vec4(p.xy + offset, p.z, 1.0);
}`;

const SPARK_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vKind;
void main() {
  vec2 c = vUv - 0.5;
  float a = vKind < 0.5 ? (1.0 - smoothstep(0.1, 0.5, abs(c.x))) * (1.0 - smoothstep(0.25, 0.5, abs(c.y))) : pow(1.0 - smoothstep(0.0, 0.5, length(c)), 2.0);
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

/** Spark colours (HDR, they bloom at Medium/High): ivory, pale jade. Never gold (money) or red (enemy danger). */
const SPARK_COLOURS = [new THREE.Color("#fff4e2").multiplyScalar(2.4), new THREE.Color("#bff7ec").multiplyScalar(2.2)];

class HitFxImpl implements HitFx {
  private readonly capacity: number;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly c: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly size0: Float32Array;
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly random: Float32Array;
  private rc = 0;
  private cursor = 0;
  private high = 0;
  private liveCount = 0;
  private share = 1;
  private dt = 0.5;

  constructor(renderer: Renderer3D, options: HitFxOptions) {
    const n = Math.max(8, Math.floor(options.capacity ?? 1200));
    this.capacity = n;
    this.a = new Float32Array(n * 4);
    this.b = new Float32Array(n * 4);
    this.c = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.total = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.random = randomTable(options.seed ?? 99);
    this.share = options.share ?? 1;
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iA", new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iB", new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iC", new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({ vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = "hit-sparks";
    renderer.layers.fx.add(this.mesh);
    // Warm-up (swords.ts warm()): spark() compiled at load, then the pool emptied.
    for (let k = 0; k < WARM_EVENTS; k += 1) this.spark(k % 5, 0.5, -k % 7, 1 + (k % 3));
    this.life.fill(0);
    this.a.fill(0);
    this.b.fill(0);
    this.cursor = 0;
    this.high = 0;
    this.rc = 0;
  }

  get live(): number {
    return this.liveCount;
  }

  setShare(share: number): void {
    this.share = Math.min(1, Math.max(0, share));
  }

  /** Takes the next slot (the oldest goes when the pool is full). */
  private take(): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (i + 1 > this.high) this.high = i + 1;
    return i;
  }

  spark(x: number, y: number, z: number, tier: number): void {
    const row: TierProfile = tierRow(tier, TIERS);
    const jade = tier >= 3 ? 1 : 0;
    const count = Math.max(1, Math.round(row.sparks * this.share));
    const random = this.random;
    for (let k = 0; k < count; k += 1) {
      const i = this.take();
      const angle = random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * Math.PI * 2;
      const up = 0.25 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.75;
      const speed = 4 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 5 + tier;
      this.a[i * 4] = x;
      this.a[i * 4 + 1] = y;
      this.a[i * 4 + 2] = z;
      this.size0[i] = 0.05 + 0.015 * tier;
      this.vel[i * 3] = Math.cos(angle) * speed * (1 - up * 0.5);
      this.vel[i * 3 + 1] = up * speed;
      this.vel[i * 3 + 2] = Math.sin(angle) * speed * (1 - up * 0.5);
      const life = 0.22 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.2;
      this.life[i] = life;
      this.total[i] = life;
      const colour = SPARK_COLOURS[jade]!;
      this.c[i * 4] = colour.r;
      this.c[i * 4 + 1] = colour.g;
      this.c[i * 4 + 2] = colour.b;
      this.c[i * 4 + 3] = 0;
    }
    // The flash: one soft glow, bigger with the tier.
    const i = this.take();
    this.a[i * 4] = x;
    this.a[i * 4 + 1] = y;
    this.a[i * 4 + 2] = z;
    this.size0[i] = 0.5 + 0.22 * tier;
    this.vel[i * 3] = 0;
    this.vel[i * 3 + 1] = 0;
    this.vel[i * 3 + 2] = 0;
    this.life[i] = 0.12 + 0.02 * tier;
    this.total[i] = this.life[i]!;
    const colour = SPARK_COLOURS[jade]!;
    this.c[i * 4] = colour.r;
    this.c[i * 4 + 1] = colour.g;
    this.c[i * 4 + 2] = colour.b;
    this.c[i * 4 + 3] = 1;
  }

  update(dt: number): void {
    this.dt = Math.max(0, dt);
    const step = this.dt;
    const drag = Math.exp(-2.2 * step);
    let live = 0;
    let high = 0;
    for (let i = 0; i < this.high; i += 1) {
      if (this.life[i]! <= 0) {
        this.b[i * 4 + 3] = 0;
        this.a[i * 4 + 3] = 0;
        continue;
      }
      const left = this.life[i]! - step;
      this.life[i] = left;
      if (left <= 0) {
        this.b[i * 4 + 3] = 0;
        this.a[i * 4 + 3] = 0;
        continue;
      }
      live += 1;
      high = i + 1;
      const v = i * 3;
      this.vel[v] = this.vel[v]! * drag;
      this.vel[v + 1] = this.vel[v + 1]! * drag - 9 * step;
      this.vel[v + 2] = this.vel[v + 2]! * drag;
      this.a[i * 4] = this.a[i * 4]! + this.vel[v]! * step;
      this.a[i * 4 + 1] = this.a[i * 4 + 1]! + this.vel[v + 1]! * step;
      this.a[i * 4 + 2] = this.a[i * 4 + 2]! + this.vel[v + 2]! * step;
      const k = left / this.total[i]!;
      this.a[i * 4 + 3] = this.size0[i]! * (this.c[i * 4 + 3]! > 0.5 ? 1 + (1 - k) * 0.8 : 1);
      this.b[i * 4] = this.vel[v]!;
      this.b[i * 4 + 1] = this.vel[v + 1]!;
      this.b[i * 4 + 2] = this.vel[v + 2]!;
      this.b[i * 4 + 3] = k;
    }
    this.liveCount = live;
    // Draw up to the last live spark (spark() raises it again).
    this.high = high;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = high;
    if (high > 0) {
      geometry.attributes.iA!.needsUpdate = true;
      geometry.attributes.iB!.needsUpdate = true;
      geometry.attributes.iC!.needsUpdate = true;
    }
  }

  drawCalls(): number {
    return this.mesh.geometry.instanceCount > 0 ? 1 : 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Hit sparks on the renderer's fx layer. */
export function createHitFx(renderer: Renderer3D, options: HitFxOptions = {}): HitFx {
  return new HitFxImpl(renderer, options);
}

// ── Damage numbers ──────────────────────────────────────────────────────────

const A = NUMBER_ATLAS;
/** Breathing room so neighbours do not kiss (CSS px). */
const PAD_PX = 3;
/** Edge smoothing past the stroke, atlas px. */
const SMOOTH = 1;

/** Where the glyphs' and the label's ink sit in the atlas, atlas px. */
interface Ink {
  readonly digitHalf: number;
  readonly digitTop: number;
  readonly digitBottom: number;
  readonly labelWidth: number;
  readonly labelUp: number;
  readonly labelDown: number;
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
// Fractional starts: the fields are doubles from the first write.
const SCRATCH_A: Rect = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };

/**
 * kit/feedback's NumberField with a box as big as what the sprites draw (Rồng
 * number-field.ts: the kit's box() counts the digits' advances and one font
 * size of height, but italic glyphs' ink reaches past their advance, glyph
 * quads are 1.25 font sizes tall and the "HOÀN HẢO" label is wider than the
 * digits; settle() runs until no two boxes touch). Kit drift: the box belongs
 * in shared/game-kit feedback/numbers.ts.
 */
export class DrawnNumberField extends NumberField {
  /** The atlas ink (Ink fields in order: digitHalf, digitTop, digitBottom, labelWidth, labelUp, labelDown), measured once. */
  private readonly inkv = new Float64Array(6);
  private inkReady = false;
  /** This update's step, seconds. */
  private stepS = 0.5;
  /** Each live number's drawn box for one settle pass. */
  private readonly bx = new Float32Array(this.alive.length);
  private readonly by = new Float32Array(this.alive.length);
  private readonly bw = new Float32Array(this.alive.length);
  private readonly bh = new Float32Array(this.alive.length);

  constructor(profile: FeedbackProfile) {
    super(profile);
  }

  /** Measures the atlas ink once with the atlas fonts (without a canvas: the whole quads) into inkv. */
  private measureInk(): void {
    const label = this.profile.numbers.label;
    let ink: Ink = { digitHalf: A.minCellW / 2, digitTop: 0, digitBottom: A.cellH, labelWidth: Math.min(A.width - 8, label.length * 26 + 16), labelUp: A.labelRowH / 2, labelDown: A.labelRowH / 2 };
    const canvas = globalThis.document?.createElement("canvas");
    const paint = canvas?.getContext("2d");
    if (paint) {
      paint.textAlign = "center";
      paint.textBaseline = "middle";
      paint.font = A.digitFont;
      let half = 0;
      for (const glyph of A.glyphs) {
        const m = paint.measureText(glyph);
        half = Math.max(half, finite(m.actualBoundingBoxLeft) && finite(m.actualBoundingBoxRight) ? Math.max(m.actualBoundingBoxLeft, m.actualBoundingBoxRight) : m.width * 0.75);
      }
      const digits = paint.measureText(A.glyphs);
      paint.font = A.labelFont;
      const words = paint.measureText(label);
      if (half > 0 && finite(digits.actualBoundingBoxAscent) && finite(words.actualBoundingBoxAscent)) {
        const inked = finite(words.actualBoundingBoxLeft) && finite(words.actualBoundingBoxRight) ? words.actualBoundingBoxLeft + words.actualBoundingBoxRight : words.width;
        ink = {
          digitHalf: half + A.digitOutline / 2 + SMOOTH,
          digitTop: Math.max(0, A.digitMidY - digits.actualBoundingBoxAscent - A.digitOutline / 2 - SMOOTH),
          digitBottom: Math.min(A.cellH, A.digitMidY + digits.actualBoundingBoxDescent + A.digitOutline / 2 + SMOOTH),
          labelWidth: Math.max(words.width, inked) + A.labelOutline + 2 * SMOOTH,
          labelUp: Math.min(A.labelRowH / 2, words.actualBoundingBoxAscent + A.labelOutline / 2 + SMOOTH),
          labelDown: Math.min(A.labelRowH / 2, words.actualBoundingBoxDescent + A.labelOutline / 2 + SMOOTH),
        };
      }
    }
    const v = this.inkv;
    v[0] = ink.digitHalf;
    v[1] = ink.digitTop;
    v[2] = ink.digitBottom;
    v[3] = ink.labelWidth;
    v[4] = ink.labelUp;
    v[5] = ink.labelDown;
    this.inkReady = true;
  }

  /**
   * The kit's settle() with its rule (the younger of two touching numbers
   * merges into the older when both are below T3 and of one style, else it
   * moves above it), over boxes computed once a pass instead of once a pair
   * (the kit's loop calls box() for every pair, every frame); passes run
   * until no two boxes touch (at most 4), since one pass can leave a lifted
   * number on another.
   */
  override settle(): void {
    for (let pass = 0; pass < 4; pass += 1) if (!this.settlePass()) return;
  }

  /**
   * The kit's update() (age, drift with drag, pop, a number over a protected
   * rectangle dropped, then settle) with its numbers, the step read from a
   * field: the drag is worked out once a frame, and the protected test runs
   * only when the HUD has published rectangles (the kit's `for … of` over them
   * builds an iterator a call).
   */
  override update(dt: number): void {
    this.stepS = dt > 0 ? dt : 0;
    const step = this.stepS;
    const drag = Math.exp(-4 * step);
    const guarded = this.protected.length > 0;
    for (let i = 0; i < this.alive.length; i += 1) {
      if (this.alive[i] === 0) continue;
      this.age[i] = this.age[i]! + step;
      if (this.age[i]! >= this.life[i]!) {
        this.kill(i);
        continue;
      }
      this.vx[i] = this.vx[i]! * drag;
      this.vy[i] = this.vy[i]! * drag;
      this.x[i] = this.x[i]! + this.vx[i]! * step;
      this.y[i] = this.y[i]! + this.vy[i]! * step;
      this.pop[i] = Math.max(0, this.pop[i]! - step * 7);
      if (guarded && this.overlapsProtected(i)) {
        this.kill(i);
        this.dropped += 1;
      }
    }
    this.settle();
  }

  /** Whether number `i`'s drawn box covers a protected rectangle (the kit's covers()). */
  private overlapsProtected(i: number): boolean {
    const box = this.box(i, SCRATCH_A);
    for (let k = 0; k < this.protected.length; k += 1) {
      const rect = this.protected[k]!;
      if (box.x < rect.x + rect.w && box.x + box.w > rect.x && box.y < rect.y + rect.h && box.y + box.h > rect.y) return true;
    }
    return false;
  }

  /** Box `i` into the cache arrays. */
  private cache(i: number): void {
    this.measure(i);
  }

  /** One pass; true when two boxes touched (and were merged or moved). */
  private settlePass(): boolean {
    const alive = this.alive;
    const n = alive.length;
    for (let i = 0; i < n; i += 1) if (alive[i] === 1) this.cache(i);
    let touched = false;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n && alive[i] === 1; j += 1) {
        if (alive[j] !== 1) continue;
        if (!(this.bx[i]! < this.bx[j]! + this.bw[j]! && this.bx[i]! + this.bw[i]! > this.bx[j]! && this.by[i]! < this.by[j]! + this.bh[j]! && this.by[i]! + this.bh[i]! > this.by[j]!)) continue;
        touched = true;
        const older = this.born[i]! <= this.born[j]! ? i : j;
        const younger = older === i ? j : i;
        if (this.style[i] === this.style[j] && this.tier[i]! < 3 && this.tier[j]! < 3) {
          // The kit's own merge (TypeScript-private in kit/feedback/numbers.ts).
          (this as unknown as { absorb(other: number, slot: number): number }).absorb(older, younger);
          if (alive[older] === 1) this.cache(older);
        } else {
          this.y[younger] = this.y[younger]! - (this.by[younger]! + this.bh[younger]! - this.by[older]!) - 2;
          this.cache(younger);
        }
      }
    }
    return touched;
  }

  /**
   * The drawn box (kit box() widened by the ink), from measure(): a box does
   * not depend on where the number stands, so a box at (atX, atY) is the
   * measured one moved there. Optional parameters read into locals (a default
   * parameter value, `x = this.x[i]`, makes Chrome's V8 box the double on
   * every call).
   */
  override box(i: number, out: Rect, atX?: number, atY?: number): Rect {
    this.measure(i);
    out.x = atX === undefined ? this.bx[i]! : this.bx[i]! + (atX - this.x[i]!);
    out.y = atY === undefined ? this.by[i]! : this.by[i]! + (atY - this.y[i]!);
    out.w = this.bw[i]!;
    out.h = this.bh[i]!;
    return out;
  }

  /** Number `i`'s drawn box where it stands, into bx, by, bw, bh (typed arrays: no object written per call). */
  private measure(i: number): void {
    const x = this.x[i]!;
    const y = this.y[i]!;
    // `row.number?.pop ?? 1` would be boxed on every call (Chrome's V8): an explicit null test is not.
    const number = tierRow(this.tier[i]!, this.profile.tiers).number;
    const pop = number === null ? 1 : 1 + (number.pop - 1) * this.pop[i]!;
    const px = this.fontPx * this.size[i]! * pop;
    const perfect = this.style[i] === STYLE.perfect;
    if (!this.inkReady) this.measureInk();
    const ink = this.inkv;
    const advance = A.advance * px;
    const glyphs = this.text(i).length;
    const column = (advance * A.glyphQuadW) / A.refCellW;
    const rowPx = (px * A.glyphQuadH) / A.cellH;
    let width = glyphs * advance + 2 * Math.max(0, ink[0]! * column - advance / 2);
    const lh = px * A.label;
    if (perfect) width = Math.max(width, (lh * ink[3]!) / A.refCellW);
    width += PAD_PX;
    const glyphTop = y - px / 2;
    let top = glyphTop + ink[1]! * rowPx;
    let bottom = glyphTop + ink[2]! * rowPx;
    if (perfect) {
      const middle = glyphTop - A.labelMidUp * lh;
      const labelRow = (lh * A.labelQuadH) / A.cellH;
      top = Math.min(top, middle - ink[4]! * labelRow);
      bottom = Math.max(bottom, middle + ink[5]! * labelRow);
    }
    this.bx[i] = x - width / 2;
    this.bw[i] = width;
    this.by[i] = top - PAD_PX / 2;
    this.bh[i] = bottom - top + PAD_PX;
  }
}

const NUMBER_VERTEX = /* glsl */ `
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
const NUMBER_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(texel.rgb * vColor.rgb, texel.a * vColor.a);
}`;

const GLYPHS = NUMBER_ATLAS.glyphs;
const MAX_QUADS = 200 * 8;

/**
 * The kit's NumberSprites (one instanced draw in screen space over the frame,
 * the same digit atlas painted on a canvas at load), with write() filling the
 * quads in place from fields and marking its three attributes for upload:
 * no float crosses a call and no array is built per frame.
 */
export class IcNumberSprites {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly rect = new Float32Array(MAX_QUADS * 4);
  private readonly uv = new Float32Array(MAX_QUADS * 4);
  private readonly color = new Float32Array(MAX_QUADS * 4);
  private readonly rectAttr: THREE.InstancedBufferAttribute;
  private readonly uvAttr: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly screen = new THREE.Vector2(1, 1);
  readonly cellWidth: number;
  private readonly labelWidth: number;
  private readonly colors: THREE.Color[];
  private readonly labelColor: THREE.Color;
  // The next quad, set field by field before quad(n).
  private qx = 0.5;
  private qy = 0.5;
  private qw = 0.5;
  private qh = 0.5;
  private u0 = 0.5;
  private v0 = 0.5;
  private u1 = 0.5;
  private v1 = 0.5;
  private qa = 0.5;

  constructor(readonly profile: FeedbackProfile) {
    const { colors, label, labelColor } = profile.numbers;
    this.colors = colors.map((color) => new THREE.Color(color));
    this.labelColor = new THREE.Color(labelColor);
    const canvas = document.createElement("canvas");
    canvas.width = A.width;
    canvas.height = A.height;
    const paint = canvas.getContext("2d");
    let cellWidth: number = A.minCellW;
    let labelWidth = 0;
    if (paint !== null) {
      paint.textAlign = "center";
      paint.textBaseline = "middle";
      paint.lineJoin = "round";
      paint.font = A.digitFont;
      const glyph = (text: string, x: number, y: number, outline: number): void => {
        paint.lineWidth = outline;
        paint.strokeStyle = "rgba(6,8,22,0.93)";
        paint.strokeText(text, x, y);
        paint.fillStyle = "#ffffff";
        paint.fillText(text, x, y);
      };
      cellWidth = digitCellWidth((char) => paint.measureText(char));
      [...GLYPHS].forEach((char, index) => glyph(char, index * cellWidth + cellWidth / 2, A.digitMidY, A.digitOutline));
      paint.font = A.labelFont;
      const metrics = paint.measureText(label);
      const inked = Number.isFinite(metrics.actualBoundingBoxLeft) && Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight : 0;
      labelWidth = Math.min(A.width - 8, Math.ceil(Math.max(metrics.width, inked)) + 16);
      glyph(label, labelWidth / 2, A.labelTop + A.labelRowH / 2, A.labelOutline);
    }
    this.cellWidth = cellWidth;
    this.labelWidth = labelWidth;
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.flipY = false;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0.5, 0.5, 0);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    this.rectAttr = new THREE.InstancedBufferAttribute(this.rect, 4).setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.InstancedBufferAttribute(this.uv, 4).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("iRect", this.rectAttr);
    geometry.setAttribute("iUv", this.uvAttr);
    geometry.setAttribute("iColor", this.colorAttr);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uScreen: { value: this.screen } },
      vertexShader: NUMBER_VERTEX,
      fragmentShader: NUMBER_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Writes quad `n` from the q* fields in `color`; returns n + 1 (or n when full). */
  private quad(n: number, color: THREE.Color): number {
    if (n >= MAX_QUADS) return n;
    const o = n * 4;
    this.rect[o] = this.qx;
    this.rect[o + 1] = this.qy;
    this.rect[o + 2] = this.qw;
    this.rect[o + 3] = this.qh;
    this.uv[o] = this.u0;
    this.uv[o + 1] = this.v0;
    this.uv[o + 2] = this.u1;
    this.uv[o + 3] = this.v1;
    this.color[o] = color.r;
    this.color[o + 1] = color.g;
    this.color[o + 2] = color.b;
    this.color[o + 3] = this.qa;
    return n + 1;
  }

  /** Writes the field's glyphs for a view `width` × `height` CSS px (NumberSprites.write, same layout). */
  write(field: NumberField, width: number, height: number): void {
    this.screen.x = width;
    this.screen.y = height;
    const W = A.width;
    const H = A.height;
    const cell = this.cellWidth;
    const cellScale = cell / A.refCellW;
    const labelRows = A.labelRowH / A.cellH;
    let n = 0;
    for (let i = 0; i < field.alive.length; i += 1) {
      if (field.alive[i] === 0) continue;
      const text = field.text(i);
      const style = field.style[i]!;
      const k = field.age[i]! / field.life[i]!;
      this.qa = Math.min(1, (1 - k) * 3.5);
      const number = tierRow(field.tier[i]!, field.profile.tiers).number;
      const px = field.fontPx * field.size[i]! * (number === null ? 1 : 1 + (number.pop - 1) * field.pop[i]!);
      const color = this.colors[style] ?? this.colors[0]!;
      const advance = px * A.advance;
      let x = field.x[i]! - (text.length * advance) / 2;
      const y = field.y[i]! - px / 2;
      const times = text.indexOf("×");
      for (let c = 0; c < text.length; c += 1) {
        const g = GLYPHS.indexOf(text.charAt(c));
        const s = times >= 0 && c >= times ? 0.68 : 1;
        const middle = x - advance * 0.2 + (advance * A.glyphQuadW * s) / 2;
        const w = advance * A.glyphQuadW * s * cellScale;
        this.qx = middle - w / 2;
        this.qy = y + px * (1 - s) * 0.9;
        this.qw = w;
        this.qh = px * A.glyphQuadH * s;
        this.u0 = (g * cell) / W;
        this.v0 = 0;
        this.u1 = ((g + 1) * cell) / W;
        this.v1 = A.cellH / H;
        n = this.quad(n, color);
        x += advance * s;
      }
      if (style === STYLE.perfect) {
        const lh = px * A.label;
        const lw = lh * (this.labelWidth / A.refCellW);
        const h = lh * A.labelQuadH * labelRows;
        this.qx = field.x[i]! - lw / 2;
        this.qy = y - lh * A.labelMidUp - h / 2;
        this.qw = lw;
        this.qh = h;
        this.u0 = 0;
        this.v0 = A.labelTop / H;
        this.u1 = this.labelWidth / W;
        this.v1 = (A.labelTop + A.labelRowH) / H;
        n = this.quad(n, this.labelColor);
      }
    }
    this.mesh.geometry.instanceCount = n;
    this.rectAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
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

export interface DamageNumbers {
  /** Metres; `target` merges small numbers per target every 0.25 s. `style`: STYLE (default normal). */
  show(target: number, amount: number, x: number, y: number, z: number, tier: number, style?: number): void;
  /** The rule part (live numbers, protected rectangles the HUD publishes). */
  readonly field: NumberField;
  readonly live: number;
  update(dt: number): void;
  drawCalls(): number;
  /** The digit atlas once built (RGBA8 with mipmaps). */
  textureBytes(): number;
  dispose(): void;
}

class DamageNumbersImpl implements DamageNumbers, Overlay {
  readonly field: DrawnNumberField;
  private sprites: IcNumberSprites | null = null;
  private readonly screen: ScreenPoint = { x: 0, y: 0, visible: false };
  private now = 0.5;
  /** The view's CSS size, from the last draw (Stage3D.size builds an object per read). */
  private width = 1600;
  private height = 900;
  private readonly removeOverlay: () => void;

  constructor(private readonly renderer: Renderer3D, capacity: number) {
    this.field = new DrawnNumberField(IC_NUMBERS);
    this.field.limit = Math.max(1, Math.floor(capacity));
    this.removeOverlay = renderer.addOverlay(this);
  }

  get live(): number {
    return this.field.live;
  }

  show(target: number, amount: number, x: number, y: number, z: number, tier: number, style?: number): void {
    const row = tierRow(tier, this.field.profile.tiers);
    if (row.number === null || amount <= 0) return;
    this.renderer.project(x, y + 0.4, z, this.screen);
    if (!this.screen.visible) return;
    this.field.spawn(target, this.screen.x, this.screen.y, amount, style === undefined ? STYLE.normal : style, tier, row.number.size, row.number.life, 0, -1, this.now);
  }

  update(dt: number): void {
    this.now += Math.max(0, dt);
    // Rồng's UI scale: 20 px at 1600 × 900, kept within 0.8–1.2.
    const fontPx = 20 * Math.max(0.8, Math.min(1.2, Math.min(this.width / 1600, this.height / 900)));
    if (fontPx !== this.field.fontPx) this.field.fontPx = fontPx;
    // The caller's own number goes on (the field clamps it): a new double passed to a call is boxed.
    this.field.update(dt);
  }

  draw(gl: THREE.WebGLRenderer, width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.field.live === 0) return;
    this.sprites ??= new IcNumberSprites(IC_NUMBERS);
    this.sprites.write(this.field, width, height);
    this.sprites.render(gl);
  }

  drawCalls(): number {
    return this.field.live > 0 ? 1 : 0;
  }

  textureBytes(): number {
    return this.sprites === null ? 0 : Math.round(A.width * A.height * 4 * (4 / 3));
  }

  dispose(): void {
    this.removeOverlay();
    this.sprites?.dispose();
  }
}

/** Damage numbers over the frame: at most `capacity` live (rules.ts TT_BUDGETS numbers: 50 / 100 / 160). */
export function createDamageNumbers(renderer: Renderer3D, capacity: number): DamageNumbers {
  return new DamageNumbersImpl(renderer, capacity);
}

// ── Ink smoke ───────────────────────────────────────────────────────────────

export interface InkSmoke {
  /** A death's smoke at a point (m), `size` the body's size (m). */
  puff(x: number, y: number, z: number, size: number): void;
  readonly live: number;
  update(dt: number): void;
  drawCalls(): number;
  dispose(): void;
}

const SMOKE_VERTEX = /* glsl */ `
attribute vec4 iA;
attribute vec4 iB;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vAlpha = iB.x;
  vSeed = iB.y;
  vec3 right = vec3(viewMatrix[0].x, viewMatrix[1].x, viewMatrix[2].x);
  vec3 up = vec3(viewMatrix[0].y, viewMatrix[1].y, viewMatrix[2].y);
  vec3 world = iA.xyz + (right * position.x + up * position.y) * iA.w;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SMOKE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
#include <fog_pars_fragment>
float smokeHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 91.7) * 43758.5453); }
float smokeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(smokeHash(i), smokeHash(i + vec2(1.0, 0.0)), f.x), mix(smokeHash(i + vec2(0.0, 1.0)), smokeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0 + (smokeNoise(vUv * 5.0) - 0.5) * 0.6 + (smokeNoise(vUv * 13.0) - 0.5) * 0.2;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.07, 0.075, 0.095, a);
  #include <fog_fragment>
}`;

class InkSmokeImpl implements InkSmoke {
  private readonly capacity: number;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly size0: Float32Array;
  private readonly rise: Float32Array;
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly random: Float32Array;
  private rc = 0;
  private cursor = 0;
  private liveCount = 0;
  private dt = 0.5;

  constructor(renderer: Renderer3D, capacity: number, seed: number) {
    const n = Math.max(8, Math.floor(capacity));
    this.capacity = n;
    this.a = new Float32Array(n * 4);
    this.b = new Float32Array(n * 4);
    this.life = new Float32Array(n);
    this.total = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.rise = new Float32Array(n);
    this.random = randomTable(seed);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iA", new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iB", new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = "ink-smoke";
    renderer.layers.fx.add(this.mesh);
    // Warm-up (swords.ts warm()): puff() compiled at load, then the pool emptied.
    for (let k = 0; k < WARM_EVENTS; k += 1) this.puff(k % 5, 0, -k % 7, 1 + (k % 3) * 0.25);
    this.life.fill(0);
    this.a.fill(0);
    this.b.fill(0);
    this.cursor = 0;
    this.rc = 0;
  }

  get live(): number {
    return this.liveCount;
  }

  puff(x: number, y: number, z: number, size: number): void {
    const blots = 5;
    const random = this.random;
    for (let k = 0; k < blots; k += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const angle = random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * Math.PI * 2;
      const r = random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * size * 0.45;
      this.a[i * 4] = x + Math.cos(angle) * r;
      this.a[i * 4 + 1] = y + size * (0.2 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.5);
      this.a[i * 4 + 2] = z + Math.sin(angle) * r;
      this.size0[i] = size * (0.55 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.4);
      this.a[i * 4 + 3] = this.size0[i]!;
      this.rise[i] = 0.4 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.5;
      const life = 0.9 + random[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.5;
      this.life[i] = life;
      this.total[i] = life;
      this.b[i * 4] = 0;
      this.b[i * 4 + 1] = random[(this.rc = (this.rc + 1) & RANDOM_MASK)]!;
    }
  }

  update(dt: number): void {
    this.dt = Math.max(0, dt);
    const step = this.dt;
    let live = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i]! <= 0) continue;
      const left = this.life[i]! - step;
      this.life[i] = left;
      if (left <= 0) {
        this.b[i * 4] = 0;
        this.a[i * 4 + 3] = 0;
        continue;
      }
      live += 1;
      const k = 1 - left / this.total[i]!;
      this.a[i * 4 + 1] = this.a[i * 4 + 1]! + this.rise[i]! * step;
      this.a[i * 4 + 3] = this.size0[i]! * (1 + 1.4 * k);
      // In fast, out slow.
      this.b[i * 4] = Math.min(1, k * 8) * (1 - k) * 0.8;
    }
    this.liveCount = live;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = live > 0 ? this.capacity : 0;
    if (live > 0) {
      geometry.attributes.iA!.needsUpdate = true;
      geometry.attributes.iB!.needsUpdate = true;
    }
  }

  drawCalls(): number {
    return this.mesh.geometry.instanceCount > 0 ? 1 : 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Ink smoke on the renderer's fx layer (`capacity` blots, 5 a puff; default 320). */
export function createInkSmoke(renderer: Renderer3D, capacity = 320, seed = 77): InkSmoke {
  return new InkSmokeImpl(renderer, capacity, seed);
}
