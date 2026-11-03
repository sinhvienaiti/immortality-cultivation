/**
 * Screen effects by tier (canon D58 (3); docs/games/tu-tien/skills/POWER_RESEARCH.md
 * table "Bậc"): basic blow, skill, ultimate. One module the skills lab uses
 * now and the game can adopt later:
 * - shake from trauma (amplitude = trauma² × the tier's px at 1080p, smooth
 *   value noise, decaying to nothing in the tier's time; the ultimate adds a
 *   roll), along the camera's own axes; `rumble` holds a low floor of trauma
 *   while a field-wide skill lands its many blows;
 * - a camera punch (FOV narrowed by a share);
 * - a hit-stop per tier, counted to the part of a frame, eased out, and cut
 *   by a new release; for 50 ms after a release an older blow's stop or slow
 *   motion is dropped, so the player's key never waits on one (D58 (1));
 * - slow motion as a world-time scale;
 * - world darkening: with the host's `worldLight` hook the world's LIGHTS
 *   dim, so every VFX layer keeps its light over a darker field; a vignette
 *   and a desaturation of the low-saturation (world) pixels in the pass; a
 *   held level while a field-wide skill or an ultimate plays, a short dip on
 *   a skill's release;
 * - GRAPHIC IMPACT FRAMES (round 3a, P2; the diagnosis of 03/11/2026: the
 *   round-2 climax was a linear-space tinted flash, an 80 ms radial blur and
 *   a 12 px chroma fringe, all pushing the frame to one milky mid-grey band):
 *   a display-space pass AFTER the OutputPass draws 1–3 authored frames and
 *   then cuts straight back. Frame "dark": the world a navy silhouette, its
 *   figures (beasts, hero: the host's actor mask) black, the strike's hot
 *   cores white with a narrow cyan fringe. Frame "invert": a near-white high
 *   key, the figures dark with a cyan contour, the cores as ink strokes. A
 *   finisher takes its tier's frames (a skill 1: dark; key 7's finisher 2:
 *   dark, invert; K5's climax 3: dark, dark, invert); a primary blow of the
 *   basic or skill tier takes ONE local frame, an inverted eight-ray burst
 *   round the struck point. No blur, no chroma, no full-screen tint;
 * - one global intensity (0–1, accessibility) scaling shake, roll, punch,
 *   darkening and the graphic frames (0 turns them off); hit-stop and slow
 *   motion are timing and stay.
 * The DOM (word tags, panels) and the overlays drawn after the composer
 * (damage numbers, renderer.addOverlay) are never darkened or inverted. Tiers
 * that draw without the composer (no bloom: Low, Medium) get the darkening
 * only (lights, or an overlay quad without the hook). No allocation per
 * frame. View only: it never touches the sim.
 */
import * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Overlay } from "./renderer";

export type ScreenTier = "basic" | "skill" | "ultimate";
/** A blow's place in its skill: the main hit, a secondary hit of an area (no global stop), or the finisher. */
export type ImpactRole = "primary" | "secondary" | "finisher";

export interface TierFx {
  /** Shake: px at 1080p for one blow, and the time it takes to die (s). */
  readonly shakePx: number;
  readonly shakeS: number;
  /** Roll at the shake's peak (degrees; the ultimate only). */
  readonly rollDeg: number;
  /** Camera punch on a finisher: the FOV narrows by this share, eased back over `punchS`. */
  readonly punch: number;
  readonly punchS: number;
  /** Hit-stop of the primary blow (ms) and of the finisher (ms); secondary hits never stop the world. */
  readonly stopMs: number;
  readonly finisherStopMs: number;
  /** Slow motion on the finisher: world speed and how long (s); 1 = none. */
  readonly slow: number;
  readonly slowS: number;
  /** World darkening dip on the release: share and time (s). */
  readonly dark: number;
  readonly darkS: number;
  /** World darkening held while a field-wide skill or an ultimate plays (share of the world light taken away). */
  readonly hold: number;
  /** Desaturation of the world at full darkening (0–1). */
  readonly desat: number;
  /** Full-screen graphic impact frames on a finisher (0 none; 1 dark; 2 dark, invert; 3 dark, dark, invert). */
  readonly frames: number;
  /** One local graphic frame on a primary blow (an inverted burst at the struck point): on or off, radius (px at 1080p). */
  readonly localFrame: boolean;
  readonly localPx: number;
}

/**
 * POWER_RESEARCH.md's tier table (03/11/2026), round 3a: round 2's shake, stops, slow motion and darkening stay;
 * the round-2 climax (a 0.42 tinted flash, an 80 ms zoom blur and a 12 px fringe, judged "milky fog, a render bug"
 * at 3.5–4.5) and the soft local light discs are replaced by graphic frames.
 */
export const SCREEN_TIERS: Readonly<Record<ScreenTier, TierFx>> = {
  basic: { shakePx: 3, shakeS: 0.09, rollDeg: 0, punch: 0, punchS: 0, stopMs: 0, finisherStopMs: 0, slow: 1, slowS: 0, dark: 0, darkS: 0, hold: 0, desat: 0, frames: 0, localFrame: true, localPx: 72 },
  skill: { shakePx: 7, shakeS: 0.2, rollDeg: 0, punch: 0.015, punchS: 0.2, stopMs: 50, finisherStopMs: 90, slow: 0.6, slowS: 0.14, dark: 0.22, darkS: 0.3, hold: 0.45, desat: 0.45, frames: 1, localFrame: true, localPx: 92 },
  ultimate: { shakePx: 16, shakeS: 0.35, rollDeg: 0.35, punch: 0.04, punchS: 0.3, stopMs: 50, finisherStopMs: 110, slow: 0.3, slowS: 0.28, dark: 0.45, darkS: 0.5, hold: 0.45, desat: 0.6, frames: 2, localFrame: true, localPx: 110 },
};

/**
 * A graphic frames' palette (display values): the dark frame's world, the inverted frame's paper, the accent; with
 * `roles`, an element's own colour for each role (dark frame: focus rays, strike; inverted: focus lines, strokes,
 * contour), and the strike read from its saturated light rather than brightness alone.
 */
export interface FramePalette {
  readonly navy: readonly number[];
  readonly paper: readonly number[];
  readonly accent: readonly number[];
  readonly roles?: { readonly rays: readonly number[]; readonly strike: readonly number[]; readonly lines: readonly number[]; readonly strokes: readonly number[]; readonly contour: readonly number[] };
}

/** The graphic frames' own palette (display values): navy world, paper, cyan (Metal's; an element may swap it). */
const FRAME_PALETTE = { navy: [0.035, 0.06, 0.15], paper: [0.95, 0.975, 1.0], accent: [0.22, 0.82, 1.0] } as const;

/** Graphic frame modes (ImpactPass uMode). */
export const IMPACT_DARK = 1;
export const IMPACT_INVERT = 2;
/**
 * The authored impact masks a host may give (white ink on black, used as alpha; the lab's are ChatGPT-made 1024 px
 * sheets in art-src/skills/impact-tex, 03/11/2026): radial focus rays, a sword-shaped radial streak field, a burst
 * star, a slash crescent and a cracked brush burst. Rotated, scaled and mirrored per use; without them the local
 * burst falls back to a procedural eight-ray star and full frames carry no overlay.
 */
export type ImpactShape = "rays" | "streaks" | "burst" | "slash" | "crack";
/** One graphic frame: its mode, an area shape A and an accent shape B with their sizes (shares of the view's height; local: × the burst's radius). */
interface ImpactStep {
  readonly mode: number;
  readonly a: ImpactShape | null;
  readonly aSize: number;
  readonly b: ImpactShape | null;
  readonly bSize: number;
}
/**
 * The frames of a finisher by count (each held STEP_S, at least one drawn frame, then a hard return): a dark
 * frame with dim cyan focus rays (or the sword-streak field) behind the figures; the inverted frame with ink focus
 * lines and an ink brush burst at the strike.
 */
const SEQUENCES: readonly (readonly ImpactStep[])[] = [
  [],
  [{ mode: IMPACT_DARK, a: "rays", aSize: 2.4, b: null, bSize: 0 }],
  [
    { mode: IMPACT_DARK, a: "streaks", aSize: 2.2, b: null, bSize: 0 },
    { mode: IMPACT_INVERT, a: "rays", aSize: 2.4, b: "crack", bSize: 0.6 },
  ],
  [
    { mode: IMPACT_DARK, a: "rays", aSize: 2.4, b: null, bSize: 0 },
    { mode: IMPACT_DARK, a: "streaks", aSize: 2.2, b: null, bSize: 0 },
    { mode: IMPACT_INVERT, a: "rays", aSize: 2.4, b: "crack", bSize: 0.7 },
  ],
  // The ultimate's own climax (round 3b, K5's heaven sword): a dark frame with a white burst star at the strike over
  // the focus rays, then the inverted frame with a wide ink brush burst; key 7 keeps the sword-streak field.
  [
    { mode: IMPACT_DARK, a: "rays", aSize: 2.6, b: "burst", bSize: 0.75 },
    { mode: IMPACT_INVERT, a: "rays", aSize: 2.6, b: "crack", bSize: 1.15 },
  ],
];
/** SEQUENCES index of the ultimate's own climax. */
export const ULT_CLIMAX_FRAMES = 4;
/** The local frame: the burst star bounds an inverted patch, a slash crescent cuts across it in ink along the blow. */
const LOCAL_STEP: ImpactStep = { mode: IMPACT_INVERT, a: "burst", aSize: 2.3, b: "slash", bSize: 1.7 };
/**
 * How long each graphic state holds (round 3b: round 3a's single 1/60 s frames read as flicker to both judges): a
 * full-screen state 4 frames at 60 Hz (67 ms), a local burst 3 (50 ms). A new release cuts any hold (cut()).
 */
const STEP_S = 4 / 60;
const LOCAL_STEP_S = 3 / 60;

/** Largest shake (px at 1080p) trauma 1 stands for. */
const MAX_PX = 18;
/** World speed while a stop holds, and the eased exit (s). */
const STOP_SCALE = 0.05;
const STOP_EXIT_S = 0.03;
/** Slow motion eases back to full speed over this (s). */
const SLOW_EXIT_S = 0.06;
/**
 * After a release (cut), no blow may stop or slow the world for this long (real s): an older skill's strike
 * landing a frame after the key held the new release's body and blades (key to body release 83 ms, gate 50).
 */
const RELEASE_GUARD_S = 0.05;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Value noise in [−1, 1] at `t` on lattice `seed` (smoothstep between hashed lattice values). */
function vnoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}
function hash(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * The linear pass before the OutputPass: darkening (when the host has no light hook), vignette, desaturation, and an
 * element's warm flash on a big blow (Fire: the world, not its hot light, lifts toward amber for ~0.16 s; a gain, not
 * an added tint, so no milky veil).
 */
const SCREEN_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDark: { value: 0 },
    uVignette: { value: 0 },
    uDesat: { value: 0 },
    uAspect: { value: 16 / 9 },
    uWarm: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uDark;
uniform float uVignette;
uniform float uDesat;
uniform float uAspect;
uniform vec3 uWarm;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 e = vUv - 0.5;
  float r = length(vec2(e.x * uAspect, e.y)) / length(vec2(0.5 * uAspect, 0.5));
  // Linear HDR before tone mapping: light over ~1 (sword cores) keeps its level and its colour.
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float keep = smoothstep(0.8, 2.2, lum);
  if (uDesat > 0.0) {
    // The world loses its colour; saturated light (cyan, gold VFX) keeps it.
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-4);
    float k = uDesat * (1.0 - keep) * (1.0 - smoothstep(0.35, 0.8, sat));
    c.rgb = mix(c.rgb, vec3(lum), k);
  }
  float vig = 1.0 - uVignette * smoothstep(0.3, 1.05, r);
  c.rgb *= mix((1.0 - uDark) * vig, 1.0, keep);
  c.rgb *= vec3(1.0) + uWarm * (1.0 - keep);
  gl_FragColor = c;
}`,
};

/** The post pass: reads its buffer's aspect. */
class ScreenPass extends ShaderPass {
  constructor() {
    super(SCREEN_SHADER);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const u = this.uniforms as typeof SCREEN_SHADER.uniforms;
    u.uAspect.value = readBuffer.width / Math.max(1, readBuffer.height);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

/**
 * The graphic impact frame, on DISPLAY values (after the OutputPass's tone mapping and sRGB encode). Colours are
 * display values: navy, ink, paper, cyan, white. The strike is read from the frame itself (its hottest light: the
 * tone-mapped HDR cores reach the top of the range); the figures from the host's actor mask (alpha).
 */
const IMPACT_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tMask;
uniform sampler2D tShapeA;
uniform sampler2D tShapeB;
uniform float uHasA;
uniform float uHasB;
uniform vec4 uA;
uniform vec4 uB;
uniform vec2 uMirror;
uniform float uHasMask;
uniform float uMode;
uniform float uMix;
uniform vec4 uLocal;
uniform float uRot;
uniform vec2 uTexel;
uniform vec2 uMaskTexel;
uniform float uAspect;
uniform vec3 uNavy;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uCyan;
#ifdef ROLES
// An element's own roles (element-kit.ts ScreenAccent.frames, Fire): the dark frame's focus rays and strike, the
// inverted frame's focus lines, strokes and contour (display values).
uniform vec3 uRays;
uniform vec3 uStrike;
uniform vec3 uLines;
uniform vec3 uStrokes;
uniform vec3 uContour;
#endif
varying vec2 vUv;
/** An authored mask placed at xf.xy (uv), xf.z the sheet's size (share of the view's height), turned xf.w on screen. */
float shapeAt(sampler2D t, vec4 xf, float mirror) {
  vec2 p = vec2((vUv.x - xf.x) * uAspect, vUv.y - xf.y) / max(xf.z, 1e-4);
  float c = cos(xf.w);
  float s = sin(xf.w);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  p.x *= mirror;
  vec2 st = p + 0.5;
  if (st.x < 0.0 || st.y < 0.0 || st.x > 1.0 || st.y > 1.0) return 0.0;
  return smoothstep(0.3, 0.7, texture2D(t, st).r);
}
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  float l = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(src.r, max(src.g, src.b));
  float sat = mx - min(src.r, min(src.g, src.b));
  float m = 0.0;
  float edge = 0.0;
  if (uHasMask > 0.5) {
    float m0 = texture2D(tMask, vUv).a;
    vec2 d = uMaskTexel * 1.6;
    float n = max(max(texture2D(tMask, vUv + vec2(d.x, 0.0)).a, texture2D(tMask, vUv - vec2(d.x, 0.0)).a), max(texture2D(tMask, vUv + vec2(0.0, d.y)).a, texture2D(tMask, vUv - vec2(0.0, d.y)).a));
    edge = clamp((n - m0) * 1.6, 0.0, 1.0);
    m = smoothstep(0.3, 0.7, m0);
  }
  // The strike: its hot cores (the top of the tone-mapped range) and the narrow coloured light round them.
  float core = smoothstep(0.8, 0.92, l);
  float glow = smoothstep(0.5, 0.8, max(l, sat * 1.15)) * (1.0 - core);
  float sa = uHasA > 0.5 ? shapeAt(tShapeA, uA, uMirror.x) : 0.0;
  float sb = uHasB > 0.5 ? shapeAt(tShapeB, uB, uMirror.y) : 0.0;
#ifdef ROLES
  // The strike is the element's saturated light and its hottest cores, so pale ground is never read as the strike
  // (by brightness alone light stone counted as glow and cores and the frame washed out).
  core = max(smoothstep(0.86, 0.95, l), smoothstep(0.72, 0.88, l) * smoothstep(0.12, 0.3, sat));
  glow = smoothstep(0.3, 0.55, sat) * smoothstep(0.3, 0.6, mx) * (1.0 - core);
#endif
  vec3 g;
  float a = uMix;
  if (uLocal.w > 0.0) {
    // A local frame: the burst star (or a procedural eight-ray star) bounds an inverted patch: paper, the figure
    // dark with a cyan contour, the strike's cores and a slash crescent in ink.
    g = uPaper * (1.0 - 0.22 * smoothstep(0.08, 0.5, l));
#ifdef ROLES
    g = mix(g, uLines, glow);
    g = mix(g, uInk, m);
    g = mix(g, uContour, edge);
    g = mix(g, uStrokes, max(core, sb));
#else
    g = mix(g, uInk, m);
    g = mix(g, uCyan, max(edge, glow));
    g = mix(g, uInk, max(core, sb));
#endif
    float region;
    if (uHasA > 0.5) region = sa;
    else {
      vec2 q = vec2((vUv.x - uLocal.x) * uAspect, vUv.y - uLocal.y);
      float r = length(q) / max(uLocal.z, 1e-4);
      float ang = atan(q.y, q.x) + uRot;
      float shape = 0.5 + 0.5 * pow(abs(cos(ang * 4.0)), 8.0) + 0.22 * pow(abs(cos(ang * 4.0 + 0.7854)), 12.0);
      float px = 1.5 * uTexel.y / max(uLocal.z, 1e-4);
      region = 1.0 - smoothstep(shape - px, shape + px, r);
    }
    a *= region;
  } else if (uMode < 1.5) {
    // Dark frame: a navy world keeping a trace of its values, dim cyan focus rays behind the figures, the figures
    // black, the strike white with cyan round it.
    g = uNavy * (0.55 + 0.9 * smoothstep(0.04, 0.45, l));
#ifdef ROLES
    g = mix(g, uRays, sa * (1.0 - m));
    g = mix(g, uInk, m);
    g = mix(g, uCyan, glow);
    g = mix(g, uStrike, max(core, sb * (1.0 - m)));
#else
    g = mix(g, uCyan * 0.42, sa * (1.0 - m));
    g = mix(g, uInk, m);
    g = mix(g, uCyan, glow);
    g = mix(g, vec3(1.0), max(core, sb * (1.0 - m)));
#endif
  } else {
    // Inverted high key: paper (darker where the world was lighter), ink focus lines behind the figures, dark
    // figures with a cyan contour, the strike's cores as ink strokes in a cyan rim, an ink brush burst at the strike.
    g = uPaper * (1.0 - 0.22 * smoothstep(0.08, 0.5, l));
#ifdef ROLES
    // The inverse of the dark frame: the element's ground (Fire: vermilion-amber), its light as dark soot shapes, dark
    // figures with a white-gold contour, the cores and brush burst as soot strokes.
    g = mix(g, uLines, sa * 0.85 * (1.0 - m));
    g = mix(g, uLines, glow);
    g = mix(g, uInk, m);
    g = mix(g, uContour, edge);
    g = mix(g, uStrokes, max(core, sb));
#else
    g = mix(g, uNavy * 0.6, sa * 0.85 * (1.0 - m));
    g = mix(g, uInk, m);
    g = mix(g, uCyan, max(edge, glow));
    g = mix(g, uInk, max(core, sb));
#endif
  }
  gl_FragColor = vec4(mix(src.rgb, g, a), 1.0);
}`;

class ImpactPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tMask: { value: null as THREE.Texture | null },
    tShapeA: { value: null as THREE.Texture | null },
    tShapeB: { value: null as THREE.Texture | null },
    uHasA: { value: 0 },
    uHasB: { value: 0 },
    uA: { value: new THREE.Vector4(0.5, 0.5, 1, 0) },
    uB: { value: new THREE.Vector4(0.5, 0.5, 1, 0) },
    uMirror: { value: new THREE.Vector2(1, 1) },
    uHasMask: { value: 0 },
    uMode: { value: IMPACT_DARK },
    uMix: { value: 1 },
    uLocal: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0) },
    uRot: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    uMaskTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
    uAspect: { value: 16 / 9 },
    uNavy: { value: new THREE.Vector3(0.035, 0.06, 0.15) },
    uInk: { value: new THREE.Vector3(0.0, 0.004, 0.02) },
    uPaper: { value: new THREE.Vector3(0.95, 0.975, 1.0) },
    uCyan: { value: new THREE.Vector3(0.22, 0.82, 1.0) },
    uRays: { value: new THREE.Vector3() },
    uStrike: { value: new THREE.Vector3(1, 1, 1) },
    uLines: { value: new THREE.Vector3() },
    uStrokes: { value: new THREE.Vector3() },
    uContour: { value: new THREE.Vector3() },
  };
  /** Draws the figures' coverage (alpha) into the mask; null: the frame reads the strike alone. */
  drawMask: ((renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) => void) | null = null;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });

  constructor() {
    super();
    this.needsSwap = true;
    this.enabled = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SCREEN_SHADER.vertexShader,
      fragmentShader: IMPACT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Whether the frames draw an element's own roles (ROLES); true when the program changed (prewarm it again). */
  setRoles(on: boolean): boolean {
    const d = this.material.defines as Record<string, string>;
    if (on === "ROLES" in d) return false;
    if (on) d.ROLES = "";
    else delete d.ROLES;
    this.material.needsUpdate = true;
    return true;
  }

  override setSize(width: number, height: number): void {
    // The mask at half size: figures are tens of px tall, the contour samples it at 1.6 texels.
    this.mask.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
  }

  /** Compiles the mask's and the frame's programs before the first hit (a first-use compile is a frame hitch). */
  prewarm(renderer: THREE.WebGLRenderer): void {
    const target = renderer.getRenderTarget();
    if (this.drawMask !== null) this.drawMask(renderer, this.mask);
    this.uniforms.tDiffuse.value = this.mask.texture;
    this.uniforms.tMask.value = this.mask.texture;
    this.uniforms.tShapeA.value ??= this.mask.texture;
    this.uniforms.tShapeB.value ??= this.mask.texture;
    renderer.setRenderTarget(this.mask);
    this.quad.render(renderer);
    renderer.setRenderTarget(target);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.uniforms;
    if (this.drawMask !== null) {
      this.drawMask(renderer, this.mask);
      u.uHasMask.value = 1;
    } else u.uHasMask.value = 0;
    u.tDiffuse.value = readBuffer.texture;
    u.tMask.value = this.mask.texture;
    u.uTexel.value.set(1 / Math.max(1, readBuffer.width), 1 / Math.max(1, readBuffer.height));
    u.uMaskTexel.value.set(1 / Math.max(1, this.mask.width), 1 / Math.max(1, this.mask.height));
    u.uAspect.value = readBuffer.width / Math.max(1, readBuffer.height);
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.quad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.quad.render(renderer);
    }
  }

  override dispose(): void {
    this.material.dispose();
    this.mask.dispose();
  }
}

/** The fallback for tiers without the composer: a full-screen dark quad before other overlays. */
class ScreenQuad implements Overlay {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  dark = 0;

  constructor() {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.darkMat);
    a.frustumCulled = false;
    this.scene.add(a);
  }

  draw(renderer: THREE.WebGLRenderer): void {
    if (this.dark <= 0.001) return;
    this.darkMat.opacity = this.dark;
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = clear;
  }
}

/** Where the effects go: the post chain (High, Ultra), the overlay list (the fallback) and the world's lights. */
export interface ScreenFxHost {
  readonly composer: EffectComposer;
  /** True when frames go through the composer (renderer.stage.bloom.enabled). */
  composerOn(): boolean;
  addOverlay(overlay: Overlay): () => void;
  /**
   * The world's light as a share of its own (1 normal): the host scales its lights and image-based light. With
   * this hook the darkening dims the world and leaves every additive VFX layer at full light; without it the pass
   * (or the fallback quad) darkens the frame.
   */
  worldLight?(scale: number): void;
  /**
   * The figures (beasts, hero, held weapon) as coverage in the target's alpha, transparent elsewhere, drawn from
   * this frame's camera: the graphic frames turn them into silhouettes. Called only on a graphic frame.
   */
  drawActorMask?(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void;
}

/** How much of the darkening becomes a vignette in the pass when the lights carry the rest. */
const VIGNETTE_SHARE = 0.55;

export class ScreenFx {
  /** Accessibility scale 0–1 for shake, roll, punch, darkening and the graphic frames. */
  intensity = 1;
  /** Lab captures (round 3a, P0): the passes draw nothing while true (the chain without the screen effects). */
  bypass = false;
  /** Camera offset this frame (world metres) and roll (rad); read by `applyCamera`. */
  readonly offset = new THREE.Vector3();
  roll = 0;
  /** FOV share removed by the punch this frame (0.02 = 2 % narrower). */
  punchNow = 0;

  private trauma = 0;
  private traumaRate = 0;
  private rollPeak = 0;
  /** A floor of trauma held for `rumbleLeft` s (a field-wide skill's many blows). */
  private rumbleLevel = 0;
  private rumbleLeft = 0;
  private time = 0;
  private punchAmp = 0;
  private punchAge = 1;
  private punchS = 0.2;
  private stopLeft = 0;
  private stopExit = STOP_EXIT_S;
  private slowScale = 1;
  private slowLeft = 0;
  private slowExit = SLOW_EXIT_S;
  /** Real seconds left in which a stop or slow motion is dropped (a release just happened). */
  private guardLeft = 0;
  private darkAmp = 0;
  private darkAge = 1;
  private darkS = 0.2;
  /** The element's warm flash (setAccent, warm): its tint (zero: none), strength, age and length. */
  private readonly warmTint = new THREE.Vector3();
  private warmAmp = 0;
  private warmAge = 1;
  private warmS = 0.16;
  /** A held darkening a running skill sets (its world change), 0 when none; and its desaturation. */
  private darkHoldGoal = 0;
  private darkHold = 0;
  private desatPerDark = 0.6;
  /** The running full-screen sequence (SEQUENCES row), its step (−1 none), the step's age, and a step set this frame. */
  private seq: readonly ImpactStep[] = SEQUENCES[0]!;
  private step = -1;
  private stepAge = 0;
  private stepFresh = false;
  /** The running local frame: its world point, radius (px at 1080p), spin, and the same step clock. */
  private readonly localAt = new THREE.Vector3();
  private localPx = 80;
  private localRot = 0;
  private localStep = -1;
  private localAge = 0;
  private localFresh = false;
  private localSpin = 0;
  /** The blow's ground direction at the local burst (its slash turns along it on screen). */
  private localDx = 0;
  private localDz = -1;
  /** The full frames' focus (the strike's middle; the view's middle when unset), their spin and mirror. */
  private readonly focusAt = new THREE.Vector3();
  private focusSet = false;
  private fullRot = 0;
  private fullMirror = 1;
  /** The host's authored masks (setShapes). */
  private readonly shapes: Partial<Record<ImpactShape, THREE.Texture>> = {};
  private readonly projB = new THREE.Vector3();
  private readonly proj = new THREE.Vector3();
  private readonly pass: ScreenPass;
  private readonly impactPass: ImpactPass;
  private readonly quad = new ScreenQuad();
  private readonly removeQuad: () => void;
  /** The world light last sent to the host (sent only on change). */
  private lightSent = 1;
  /** What applyCamera changed, undone by restoreCamera, and the camera as it left it (a camera placed again since keeps its new pose). */
  private appliedRoll = 0;
  private appliedFov = 0;
  private fovAfter = 0;
  private readonly quatAfter = new THREE.Quaternion();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  /**
   * Shown values this frame (checks and captures). impactStep: the graphic frame's index in its sequence (−1 none);
   * impactMode: 0 none, 1 dark, 2 invert; impactLocal: a local burst shows (1) or the whole screen (0).
   */
  readonly shown = { dark: 0, light: 1, desat: 0, warm: 0, impactStep: -1, impactMode: 0, impactLocal: 0, impactFrames: 0, shakePx: 0, rollDeg: 0, punch: 0, worldScale: 1, stopping: false };

  constructor(private readonly host: ScreenFxHost) {
    this.pass = new ScreenPass();
    this.pass.enabled = false;
    this.impactPass = new ImpactPass();
    if (host.drawActorMask !== undefined) {
      const draw = host.drawActorMask.bind(host);
      this.impactPass.drawMask = draw;
    }
    const composer = host.composer;
    // Right before the OutputPass (tone mapping and sRGB), found now: the chain may have grown. The graphic frame
    // goes right after it, on display values.
    let at = composer.passes.findIndex((p) => p instanceof OutputPass);
    if (at < 0) at = composer.passes.length;
    composer.insertPass(this.pass, at);
    composer.insertPass(this.impactPass, at + 2);
    // The fallback quad goes first in the overlay list, so later overlays (damage numbers) draw over it.
    this.removeQuad = host.addOverlay(this.quad);
  }

  /**
   * An element's accent (canon D59, element-kit.ts ScreenAccent): the warm flash's tint (linear gain per channel at
   * full strength; null: none) and the graphic frames' palette (display values: the dark frame's world tone, the
   * inverted frame's paper, the accent round figures and cores; null: Metal's navy, paper and cyan).
   */
  setAccent(warm: readonly number[] | null, frames: FramePalette | null): boolean {
    if (warm === null) this.warmTint.set(0, 0, 0);
    else this.warmTint.set(warm[0]!, warm[1]!, warm[2]!);
    const u = this.impactPass.uniforms;
    const f = frames ?? FRAME_PALETTE;
    u.uNavy.value.set(f.navy[0]!, f.navy[1]!, f.navy[2]!);
    u.uPaper.value.set(f.paper[0]!, f.paper[1]!, f.paper[2]!);
    u.uCyan.value.set(f.accent[0]!, f.accent[1]!, f.accent[2]!);
    // An element's own roles (all five, or none: Metal's frames are drawn by their own program, unchanged).
    const r = frames?.roles;
    if (r !== undefined) {
      u.uRays.value.set(r.rays[0]!, r.rays[1]!, r.rays[2]!);
      u.uStrike.value.set(r.strike[0]!, r.strike[1]!, r.strike[2]!);
      u.uLines.value.set(r.lines[0]!, r.lines[1]!, r.lines[2]!);
      u.uStrokes.value.set(r.strokes[0]!, r.strokes[1]!, r.strokes[2]!);
      u.uContour.value.set(r.contour[0]!, r.contour[1]!, r.contour[2]!);
    }
    return this.impactPass.setRoles(r !== undefined);
  }

  /** The element's warm flash on a big blow: `strength` (0–1) of its tint, rising in 20 ms and gone in `seconds`. */
  warm(strength: number, seconds = 0.16): void {
    const now = this.warmLevel();
    if (strength <= now || (this.warmTint.x === 0 && this.warmTint.y === 0 && this.warmTint.z === 0)) return;
    this.warmAmp = strength;
    this.warmAge = 0;
    this.warmS = Math.max(0.05, seconds);
  }

  private warmLevel(): number {
    if (this.warmAge >= this.warmS) return 0;
    const rise = smooth01(this.warmAge / 0.02);
    const fall = 1 - smooth01((this.warmAge - 0.03) / Math.max(0.02, this.warmS - 0.03));
    return this.warmAmp * rise * fall;
  }

  /** The authored impact masks (white on black, read as alpha); missing ones fall back as the class comment says. */
  setShapes(shapes: Partial<Record<ImpactShape, THREE.Texture>>): void {
    Object.assign(this.shapes, shapes);
  }

  /** The next full frames' focus (the strike's middle, a world point): their rays and brush burst centre on it. */
  focus(x: number, y: number, z: number): void {
    this.focusAt.set(x, y, z);
    this.focusSet = true;
  }

  /** Compiles the graphic frame's programs (and the host's mask) now: the first climax must not compile them. */
  prewarm(renderer: THREE.WebGLRenderer): void {
    this.impactPass.prewarm(renderer);
  }

  /**
   * A release of `tier` (the last key): the world dips dark for skills and ultimates (not for a `local` skill:
   * slot 1 and the basic blow never tint the screen); the ultimate punches in.
   */
  release(tier: ScreenTier, local = false): void {
    const t = SCREEN_TIERS[tier];
    if (t.dark > 0 && !local) this.darken(t.dark, t.darkS);
    if (tier === "ultimate") this.punch(t.punch * 0.5, t.punchS);
  }

  /**
   * A blow of `tier` landing: shake and hit-stop; a finisher adds slow motion, the punch and its graphic frames
   * (`frames` overrides the tier's: K5's climax takes 3). Primary blows burst locally only (`localFlash`, which the
   * host calls with the struck point).
   */
  impact(tier: ScreenTier, role: ImpactRole, frames?: number): void {
    const t = SCREEN_TIERS[tier];
    if (role === "secondary") {
      this.shake(t.shakePx * 0.45, t.shakeS * 0.7, 0);
      return;
    }
    const fin = role === "finisher";
    this.shake(t.shakePx, t.shakeS, t.rollDeg);
    // The basic blow's stop is local to its target (the field holds that beast): no world stop here.
    if (tier !== "basic") this.hitStop(fin ? t.finisherStopMs : t.stopMs);
    if (fin) {
      if (t.slow < 1) this.slow(t.slow, t.slowS);
      if (t.punch > 0) this.punch(t.punch, t.punchS);
      this.graphicFrames(frames ?? t.frames);
    }
  }

  /** Starts `count` full-screen graphic frames (0–3: SEQUENCES); a running sequence restarts. */
  graphicFrames(count: number): void {
    const n = Math.max(0, Math.min(SEQUENCES.length - 1, Math.round(count)));
    if (n === 0) return;
    this.seq = SEQUENCES[n]!;
    this.step = 0;
    this.stepAge = 0;
    this.stepFresh = true;
    this.fullRot += 2.39996;
    this.fullMirror = -this.fullMirror;
    // A full-screen frame takes over a local one.
    this.localStep = -1;
  }

  /**
   * One local graphic frame (an inverted burst) at the world point (x, y, z), `tier`'s radius × `scale`; (dx, dz) the
   * blow's ground direction (its slash crescent turns along it).
   */
  localFlash(x: number, y: number, z: number, tier: ScreenTier, scale = 1, dx = 0, dz = -1): void {
    const t = SCREEN_TIERS[tier];
    if (!t.localFrame || this.step >= 0) return;
    // One burst at a time: a burst already showing this frame keeps its place.
    if (this.localStep >= 0 && this.localFresh) return;
    this.localAt.set(x, y, z);
    this.localDx = dx;
    this.localDz = dz;
    this.localPx = t.localPx * Math.max(0.5, scale);
    this.localStep = 0;
    this.localAge = 0;
    this.localFresh = true;
    this.localSpin += 0.9;
    this.localRot = this.localSpin;
  }

  /** Adds trauma for a shake of `px` (1080p) dying in `seconds`, rolling up to `rollDeg` at its peak. */
  shake(px: number, seconds: number, rollDeg = 0): void {
    const add = Math.sqrt(Math.max(0, Math.min(MAX_PX, px)) / MAX_PX);
    const left = this.traumaRate > 0 ? this.trauma / this.traumaRate : 0;
    this.trauma = Math.min(1, this.trauma + add);
    this.traumaRate = this.trauma / Math.max(seconds, left, 1e-3);
    if (rollDeg > this.rollPeak || this.trauma - add <= 0.01) this.rollPeak = rollDeg;
  }

  /** Holds the shake at least at `px` (1080p) for `seconds` (a rumble under many small blows; never stacks). */
  rumble(px: number, seconds: number): void {
    const lv = Math.sqrt(Math.max(0, Math.min(MAX_PX, px)) / MAX_PX);
    if (lv >= this.rumbleLevel || this.rumbleLeft <= 0) this.rumbleLevel = lv;
    this.rumbleLeft = Math.max(this.rumbleLeft, seconds);
  }

  hitStop(ms: number): void {
    if (this.guardLeft > 0) return;
    this.stopLeft = Math.max(this.stopLeft, ms / 1000);
  }

  slow(scale: number, seconds: number): void {
    if (this.guardLeft > 0) return;
    if (this.slowLeft > 0 && scale > this.slowScale) {
      this.slowLeft = Math.max(this.slowLeft, seconds);
      return;
    }
    this.slowScale = Math.min(1, Math.max(0.05, scale));
    this.slowLeft = Math.max(this.slowLeft, seconds);
    this.slowExit = 0;
  }

  darken(alpha: number, seconds: number): void {
    const now = this.darkLevel();
    if (alpha < now) return;
    this.darkAmp = alpha;
    this.darkAge = 0;
    this.darkS = Math.max(0.05, seconds);
  }

  /**
   * A held world change (a running field-wide skill, an ultimate from its cut-in): the darkening eases toward
   * `alpha` until it is set back to 0; `desat` is the desaturation at that level (default the ultimate's).
   */
  holdDark(alpha: number, desat: number = SCREEN_TIERS.ultimate.desat): void {
    this.darkHoldGoal = Math.max(0, Math.min(0.95, alpha));
    if (alpha > 0) this.desatPerDark = desat / Math.max(0.05, alpha);
  }

  punch(share: number, seconds: number): void {
    this.punchAmp = Math.max(this.punchLevel(), share);
    this.punchAge = 0;
    this.punchS = Math.max(0.05, seconds);
  }

  /**
   * A new release cuts a hit-stop and slow motion still running, and for RELEASE_GUARD_S drops new ones (the
   * key never waits on a stop, an older blow's included).
   */
  cut(): void {
    this.stopLeft = 0;
    this.stopExit = STOP_EXIT_S;
    this.slowLeft = 0;
    this.slowExit = SLOW_EXIT_S;
    this.slowScale = 1;
    this.guardLeft = RELEASE_GUARD_S;
    // A held graphic frame ends with the key too: the new release is never drawn under an old blow's frame.
    this.step = -1;
    this.localStep = -1;
    this.stepFresh = this.localFresh = false;
  }

  /** True while a hit-stop holds the world. */
  get stopping(): boolean {
    return this.stopLeft > 0;
  }

  /** World seconds for a frame of `dt` real seconds (hit-stop, then slow motion). */
  advance(dt: number): number {
    this.guardLeft = Math.max(0, this.guardLeft - dt);
    let rest = dt;
    let world = 0;
    if (this.stopLeft > 0) {
      const h = Math.min(this.stopLeft, rest);
      world += h * STOP_SCALE;
      this.stopLeft -= h;
      rest -= h;
      this.stopExit = 0;
    }
    if (rest > 0 && this.stopExit < STOP_EXIT_S) {
      const h = Math.min(STOP_EXIT_S - this.stopExit, rest);
      const m = smooth01((this.stopExit + h * 0.5) / STOP_EXIT_S);
      world += h * (STOP_SCALE + (1 - STOP_SCALE) * m);
      this.stopExit += h;
      rest -= h;
    }
    world += rest;
    // Slow motion scales what the stop let through.
    let scale = 1;
    if (this.slowLeft > 0) {
      scale = this.slowScale;
      this.slowLeft = Math.max(0, this.slowLeft - dt);
      if (this.slowLeft === 0) this.slowExit = 0;
    } else if (this.slowExit < SLOW_EXIT_S) {
      this.slowExit = Math.min(SLOW_EXIT_S, this.slowExit + dt);
      scale = this.slowScale + (1 - this.slowScale) * smooth01(this.slowExit / SLOW_EXIT_S);
      if (this.slowExit >= SLOW_EXIT_S) this.slowScale = 1;
    }
    this.shown.worldScale = dt > 0 ? (world * scale) / dt : 1;
    this.shown.stopping = this.stopLeft > 0;
    return world * scale;
  }

  private darkLevel(): number {
    if (this.darkAge >= this.darkS) return 0;
    // In over 30 ms, held to 55 %, out by the end.
    const rise = smooth01(this.darkAge / 0.03);
    const fall = 1 - smooth01((this.darkAge - this.darkS * 0.55) / (this.darkS * 0.45));
    return this.darkAmp * rise * fall;
  }

  private punchLevel(): number {
    if (this.punchAge >= this.punchS) return 0;
    // Snaps in over 40 ms, eases back.
    const rise = smooth01(this.punchAge / 0.04);
    const fall = 1 - smooth01((this.punchAge - 0.04) / Math.max(0.01, this.punchS - 0.04));
    return this.punchAmp * rise * fall;
  }

  /** Projects a world point to the pass's uv (0–1, y up); false when behind the camera. */
  private toUv(p: THREE.Vector3, camera: THREE.PerspectiveCamera, out: THREE.Vector4): boolean {
    this.proj.copy(p).project(camera);
    if (this.proj.z > 1) return false;
    out.x = this.proj.x * 0.5 + 0.5;
    out.y = this.proj.y * 0.5 + 0.5;
    return true;
  }

  /**
   * Steps a graphic sequence's clock: a step set this frame shows now; later steps advance once ~1/60 s has passed
   * (at least one drawn frame each, at most one step a frame). Returns the step to show (−1: done).
   */
  private advanceStep(step: number, fresh: boolean, age: number, dt: number, len: number, hold = STEP_S): [number, number] {
    if (step < 0) return [-1, 0];
    if (fresh || dt <= 0) return [step, age];
    const a = age + dt;
    if (a >= hold - 1e-4) return [step + 1 >= len ? -1 : step + 1, 0];
    return [step, a];
  }

  /**
   * Steps every effect on real time (they play through a hit-stop and a
   * cut-in pause) and writes the camera offset for `camera` (metres along its
   * own axes; px at 1080p, a share of the view's height, turned into metres at
   * the ground point it looks at, so it reads the same at any view size), the
   * world light and the pass uniforms.
   */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.time += dt;
    const k = clamp01(this.intensity);
    this.trauma = Math.max(0, this.trauma - this.traumaRate * dt);
    if (this.trauma === 0) {
      this.traumaRate = 0;
      this.rollPeak = 0;
    }
    this.rumbleLeft = Math.max(0, this.rumbleLeft - dt);
    const tr = Math.max(this.trauma, this.rumbleLeft > 0 ? this.rumbleLevel : 0);
    const tt = tr * tr;
    const px = tt * MAX_PX * k;
    // Smooth noise at ~22 Hz, two octaves, three channels (x, y, roll).
    const t = this.time * 22;
    const nx = vnoise(t, 11) * 0.7 + vnoise(t * 2.3, 13) * 0.3;
    const ny = vnoise(t, 17) * 0.7 + vnoise(t * 2.3, 19) * 0.3;
    const nr = vnoise(t * 0.8, 23);
    camera.getWorldDirection(this.fwd);
    // Metres per 1080p px at the ground point on the view axis (the field's middle at the play camera).
    const toGround = this.fwd.y < -0.05 ? camera.position.y / -this.fwd.y : 30;
    const mPerPx = (2 * toGround * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / 1080;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const ox = nx * px * mPerPx;
    const oy = ny * px * mPerPx;
    this.offset.set(this.right.x * ox + this.up.x * oy, this.right.y * ox + this.up.y * oy, this.right.z * ox + this.up.z * oy);
    this.roll = THREE.MathUtils.degToRad(this.rollPeak) * (this.trauma * this.trauma) * nr * k;
    this.punchAge += dt;
    this.punchNow = this.punchLevel() * k;
    this.darkAge += dt;
    // The held darkening eases (half-life 80 ms) toward its goal.
    this.darkHold += (this.darkHoldGoal - this.darkHold) * (1 - Math.pow(0.5, dt / 0.08));
    if (Math.abs(this.darkHold - this.darkHoldGoal) < 1e-4) this.darkHold = this.darkHoldGoal;
    const dark = Math.max(this.darkLevel(), this.darkHold) * k;
    const desat = Math.min(1, this.darkHold * this.desatPerDark) * k;
    // Graphic frames: a step set this frame (a blow before this update) shows on this frame's draw.
    [this.step, this.stepAge] = this.advanceStep(this.step, this.stepFresh, this.stepAge, dt, this.seq.length);
    this.stepFresh = false;
    [this.localStep, this.localAge] = this.advanceStep(this.localStep, this.localFresh, this.localAge, dt, 1, LOCAL_STEP_S);
    this.localFresh = false;
    const u = this.pass.uniforms as typeof SCREEN_SHADER.uniforms;
    // With the light hook the world's lights carry the darkening (VFX keep their light) and the pass adds a vignette.
    const lights = this.host.worldLight !== undefined;
    const light = lights ? 1 - dark : 1;
    if (lights && Math.abs(light - this.lightSent) > 1e-4) {
      this.host.worldLight!(light);
      this.lightSent = light;
    }
    u.uDark.value = lights ? 0 : dark;
    u.uVignette.value = lights ? dark * VIGNETTE_SHARE : 0;
    u.uDesat.value = desat;
    this.warmAge += dt;
    const warm = this.warmLevel() * k;
    u.uWarm.value.copy(this.warmTint).multiplyScalar(warm);
    const active = u.uDark.value > 0.002 || u.uVignette.value > 0.002 || desat > 0.002 || warm > 0.002;
    const viaComposer = this.host.composerOn();
    this.pass.enabled = active && viaComposer && !this.bypass;
    // The graphic frame: the full-screen step wins over a local burst.
    const ip = this.impactPass.uniforms;
    let mode = 0;
    let local = 0;
    let st: ImpactStep | null = null;
    if (this.step >= 0) {
      st = this.seq[this.step]!;
      mode = st.mode;
      // The focus: the strike's middle on screen, else the view's middle.
      if (!this.focusSet || !this.toUv(this.focusAt, camera, ip.uA.value)) ip.uA.value.set(0.5, 0.5, 1, 0);
      ip.uB.value.x = ip.uA.value.x;
      ip.uB.value.y = ip.uA.value.y;
      ip.uA.value.z = st.aSize;
      ip.uA.value.w = this.fullRot + this.step * 0.37;
      ip.uB.value.z = st.bSize;
      ip.uB.value.w = this.fullRot * 0.5;
      ip.uMirror.value.set(this.fullMirror, -this.fullMirror);
    } else if (this.localStep >= 0 && this.toUv(this.localAt, camera, ip.uLocal.value)) {
      st = LOCAL_STEP;
      mode = IMPACT_INVERT;
      local = 1;
      ip.uLocal.value.z = this.localPx / 1080;
      ip.uRot.value = this.localRot;
      ip.uA.value.set(ip.uLocal.value.x, ip.uLocal.value.y, (this.localPx / 1080) * st.aSize, this.localRot);
      // The slash crescent opens along the blow on screen.
      this.projB.copy(this.localAt).addScaledVector(this.fwd.set(this.localDx, 0, this.localDz), 1).project(camera);
      const ang = Math.atan2(this.projB.y * 0.5 + 0.5 - ip.uLocal.value.y, (this.projB.x * 0.5 + 0.5 - ip.uLocal.value.x) * (ip.uAspect.value || 1));
      ip.uB.value.set(ip.uLocal.value.x, ip.uLocal.value.y, (this.localPx / 1080) * st.bSize, ang);
      ip.uMirror.value.set(1, this.localSpin % 1.8 < 0.9 ? 1 : -1);
    }
    const ta = st !== null && st.a !== null ? this.shapes[st.a] : undefined;
    const tb = st !== null && st.b !== null ? this.shapes[st.b] : undefined;
    ip.uHasA.value = ta !== undefined ? 1 : 0;
    ip.uHasB.value = tb !== undefined ? 1 : 0;
    if (ta !== undefined) ip.tShapeA.value = ta;
    if (tb !== undefined) ip.tShapeB.value = tb;
    ip.uLocal.value.w = local;
    ip.uMode.value = mode === 0 ? IMPACT_DARK : mode;
    ip.uMix.value = k;
    this.impactPass.enabled = mode !== 0 && k > 0.01 && viaComposer && !this.bypass;
    this.quad.dark = viaComposer || lights ? 0 : dark;
    const s = this.shown;
    s.dark = dark;
    s.light = light;
    s.desat = desat;
    s.warm = warm;
    s.impactStep = this.impactPass.enabled ? (local === 1 ? 0 : this.step) : -1;
    s.impactMode = this.impactPass.enabled ? mode : 0;
    s.impactLocal = local;
    s.impactFrames = this.seq.length;
    if (this.step < 0 && this.localStep < 0) this.focusSet = false;
    s.shakePx = px;
    s.rollDeg = THREE.MathUtils.radToDeg(this.roll);
    s.punch = this.punchNow;
  }

  /**
   * Undoes last frame's roll and punch (call before the host places the camera this frame). A camera the host
   * placed or refitted since (a resize, a view change) is left as it is: undoing then would leave a lasting error.
   */
  restoreCamera(camera: THREE.PerspectiveCamera): void {
    if (this.appliedRoll !== 0 && camera.quaternion.equals(this.quatAfter)) camera.rotateZ(-this.appliedRoll);
    this.appliedRoll = 0;
    if (this.appliedFov !== 0 && camera.fov === this.fovAfter) {
      camera.fov += this.appliedFov;
      camera.updateProjectionMatrix();
    }
    this.appliedFov = 0;
  }

  /** Adds this frame's roll and punch to the placed camera (its position offset is `offset`, the host adds it). */
  applyCamera(camera: THREE.PerspectiveCamera): void {
    if (this.roll !== 0) {
      camera.rotateZ(this.roll);
      this.appliedRoll = this.roll;
    }
    if (this.punchNow > 0) {
      const d = camera.fov * this.punchNow;
      camera.fov -= d;
      this.appliedFov = d;
      camera.updateProjectionMatrix();
    }
    this.fovAfter = camera.fov;
    this.quatAfter.copy(camera.quaternion);
    camera.updateMatrixWorld(true);
  }

  reset(): void {
    this.trauma = this.traumaRate = this.rollPeak = 0;
    this.rumbleLevel = this.rumbleLeft = 0;
    this.punchAge = this.darkAge = this.warmAge = 10;
    this.darkHold = this.darkHoldGoal = 0;
    this.step = this.localStep = -1;
    this.stepFresh = this.localFresh = false;
    this.impactPass.enabled = false;
    this.cut();
    this.guardLeft = 0;
    this.offset.set(0, 0, 0);
    this.roll = 0;
    this.punchNow = 0;
    if (this.host.worldLight !== undefined && this.lightSent !== 1) {
      this.host.worldLight(1);
      this.lightSent = 1;
    }
  }

  dispose(): void {
    for (const p of [this.pass, this.impactPass]) {
      if (this.host.composer.passes.indexOf(p) >= 0) this.host.composer.removePass(p);
      p.dispose();
    }
    this.removeQuad();
    if (this.host.worldLight !== undefined) this.host.worldLight(1);
  }
}
