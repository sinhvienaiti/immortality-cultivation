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
 * - world darkening (round 2: "the sky darkens" must read): with the host's
 *   `worldLight` hook the world's LIGHTS dim, so every additive VFX layer
 *   keeps its full light over a dark field and the hit lights pop; a vignette
 *   and a desaturation of the low-saturation (world) pixels in the pass; a
 *   held level while a field-wide skill or an ultimate plays (35–50 % lower
 *   mean field luminance), a short dip on a skill's release;
 * - the finisher's climax: a sharp 2–3 frame flash (never a held milky wash),
 *   an ~80 ms radial (zoom) blur toward the focus and a chromatic fringe;
 * - primary blows of the basic tier and of skills marked local (slot 1) get a
 *   local flash at the struck point only, never a full-screen tint;
 * - all in ONE ShaderPass inserted into the post chain right before its
 *   OutputPass, on linear HDR: HDR sword light (luminance over ~1) keeps its
 *   level. The DOM (word tags, panels) and the screen-space overlays drawn
 *   after the composer (damage numbers, renderer.addOverlay) are never
 *   darkened, flashed, blurred or split. Tiers that draw without the composer
 *   (no bloom: Low, Medium) get the darkening (lights, or an overlay quad
 *   without the hook) and the full-screen flash only.
 * - one global intensity (0–1, accessibility) scaling shake, roll, punch,
 *   darkening, flash, blur and split; hit-stop and slow motion are timing and stay.
 * No allocation per frame. View only: it never touches the sim.
 */
import * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
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
  /** Full-screen flash on a finisher only: alpha and time (s; 50 ms is three frames, eased out). */
  readonly flash: number;
  readonly flashS: number;
  /** Local flash at the struck point on a primary blow: alpha, time (s) and radius (px at 1080p). */
  readonly local: number;
  readonly localS: number;
  readonly localPx: number;
  /** Chromatic fringe on a finisher: px at 1080p (< 50 ms). */
  readonly splitPx: number;
  /** Radial (zoom) blur on a finisher: the share of the way to the focus sampled, and its time (s). */
  readonly blur: number;
  readonly blurS: number;
}

/**
 * POWER_RESEARCH.md's tier table (03/11/2026), round 2 (both blind judges saw
 * no screen response at real speed: 5.8 and 5.5): shake about twice, hit-stop
 * 3 frames on skills and 6 on the ultimate's climax, the world's light held
 * down while a big skill plays, the climax a sharp flash with a zoom blur and
 * a fringe, the basic blow and slot 1 a local flash only.
 */
export const SCREEN_TIERS: Readonly<Record<ScreenTier, TierFx>> = {
  basic: { shakePx: 3, shakeS: 0.09, rollDeg: 0, punch: 0, punchS: 0, stopMs: 0, finisherStopMs: 0, slow: 1, slowS: 0, dark: 0, darkS: 0, hold: 0, desat: 0, flash: 0, flashS: 0, local: 0.4, localS: 0.07, localPx: 130, splitPx: 0, blur: 0, blurS: 0 },
  skill: { shakePx: 7, shakeS: 0.2, rollDeg: 0, punch: 0.015, punchS: 0.2, stopMs: 50, finisherStopMs: 67, slow: 0.6, slowS: 0.14, dark: 0.22, darkS: 0.3, hold: 0.45, desat: 0.45, flash: 0.3, flashS: 0.05, local: 0.42, localS: 0.08, localPx: 190, splitPx: 6, blur: 0.035, blurS: 0.08 },
  ultimate: { shakePx: 16, shakeS: 0.35, rollDeg: 0.35, punch: 0.04, punchS: 0.3, stopMs: 50, finisherStopMs: 100, slow: 0.3, slowS: 0.28, dark: 0.45, darkS: 0.5, hold: 0.45, desat: 0.6, flash: 0.42, flashS: 0.05, local: 0.6, localS: 0.1, localPx: 300, splitPx: 12, blur: 0.08, blurS: 0.08 },
};

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


const SCREEN_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDark: { value: 0 },
    uVignette: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uSplit: { value: 0 },
    uBlur: { value: 0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    uLocal: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0) },
    uLocalColor: { value: new THREE.Color(1, 1, 1) },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    uAspect: { value: 16 / 9 },
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
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uSplit;
uniform float uBlur;
uniform vec2 uFocus;
uniform vec4 uLocal;
uniform vec3 uLocalColor;
uniform vec2 uTexel;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 d = vUv - uFocus;
  vec4 c;
  if (uBlur > 0.0) {
    // Radial (zoom) blur toward the climax's focus: taps along the ray, the pixel's own weighted most.
    vec4 acc = vec4(0.0);
    float ws = 0.0;
    for (int i = 0; i < 10; i++) {
      float f = float(i) / 9.0;
      float w = 1.0 - 0.65 * f;
      acc += texture2D(tDiffuse, vUv - d * uBlur * f) * w;
      ws += w;
    }
    c = acc / ws;
  } else {
    c = texture2D(tDiffuse, vUv);
  }
  vec2 e = vUv - 0.5;
  float r = length(vec2(e.x * uAspect, e.y)) / length(vec2(0.5 * uAspect, 0.5));
  if (uSplit > 0.0) {
    // A chromatic fringe out from the focus, growing toward the edges (never the middle of the action).
    float rf = length(vec2(d.x * uAspect, d.y)) / length(vec2(0.5 * uAspect, 0.5));
    float edge = smoothstep(0.12, 0.9, max(r, rf));
    vec2 off = normalize(d + 1e-5) * uSplit * edge * uTexel;
    c.r = texture2D(tDiffuse, vUv + off).r;
    c.b = texture2D(tDiffuse, vUv - off).b;
  }
  // Linear HDR before tone mapping: light over ~1 (sword light, cores) keeps its level and its colour.
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float keep = smoothstep(0.8, 2.2, lum);
  if (uDesat > 0.0) {
    // The world loses its colour; saturated light (jade, cyan, gold VFX) keeps it.
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / max(mx, 1e-4);
    float k = uDesat * (1.0 - keep) * (1.0 - smoothstep(0.35, 0.8, sat));
    c.rgb = mix(c.rgb, vec3(lum), k);
  }
  float vig = 1.0 - uVignette * smoothstep(0.3, 1.05, r);
  c.rgb *= mix((1.0 - uDark) * vig, 1.0, keep);
  if (uLocal.w > 0.0) {
    // A local flash: a soft disc of light at the struck point (radius in shares of the view height).
    vec2 q = vec2((vUv.x - uLocal.x) * uAspect, vUv.y - uLocal.y) / max(uLocal.z, 1e-4);
    c.rgb += uLocalColor * uLocal.w * exp(-2.2 * dot(q, q));
  }
  c.rgb = mix(c.rgb, uFlashColor, uFlash);
  gl_FragColor = c;
}`,
};

/** The post pass: reads its buffer's size for the fringe's pixel offset. */
class ScreenPass extends ShaderPass {
  /** The fringe this frame in px at 1080p (the buffer's own px are set at draw: its pixel ratio floats, D57). */
  splitPx = 0;

  constructor() {
    super(SCREEN_SHADER);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const u = this.uniforms as typeof SCREEN_SHADER.uniforms;
    u.uTexel.value.set(1 / Math.max(1, readBuffer.width), 1 / Math.max(1, readBuffer.height));
    u.uAspect.value = readBuffer.width / Math.max(1, readBuffer.height);
    u.uSplit.value = (this.splitPx * readBuffer.height) / 1080;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

/** The fallback for tiers without the composer: a full-screen quad, darkening then flash, before other overlays. */
class ScreenQuad implements Overlay {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private readonly flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  dark = 0;
  flash = 0;

  constructor() {
    const g = new THREE.PlaneGeometry(2, 2);
    const a = new THREE.Mesh(g, this.darkMat);
    const b = new THREE.Mesh(g, this.flashMat);
    a.renderOrder = 0;
    b.renderOrder = 1;
    a.frustumCulled = b.frustumCulled = false;
    this.scene.add(a, b);
  }

  setFlashColor(c: THREE.Color): void {
    this.flashMat.color.copy(c);
  }

  draw(renderer: THREE.WebGLRenderer): void {
    if (this.dark <= 0.001 && this.flash <= 0.001) return;
    this.darkMat.opacity = this.dark;
    this.flashMat.opacity = this.flash;
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
}

/** How much of the darkening becomes a vignette in the pass when the lights carry the rest. */
const VIGNETTE_SHARE = 0.55;

export class ScreenFx {
  /** Accessibility scale 0–1 for shake, roll, punch, darkening, flash, blur and split. */
  intensity = 1;
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
  /** A held darkening a running skill sets (its world change), 0 when none; and its desaturation. */
  private darkHoldGoal = 0;
  private darkHold = 0;
  private desatPerDark = 0.6;
  private flashAmp = 0;
  private flashAge = 1;
  private flashS = 0.045;
  private splitAmp = 0;
  private splitAge = 1;
  private splitS = 0.045;
  private blurAmp = 0;
  private blurAge = 1;
  private blurS = 0.08;
  private localAmp = 0;
  private localAge = 1;
  private localS = 0.08;
  private localPx = 200;
  /** World points of the local flash and the climax's focus, projected in update() (has: set). */
  private readonly localAt = new THREE.Vector3();
  private readonly focusAt = new THREE.Vector3();
  private focusSet = false;
  private readonly proj = new THREE.Vector3();
  private readonly flashColor = new THREE.Color(0.9, 1, 0.97);
  private readonly localColor = new THREE.Color(0.9, 1, 0.97);
  private readonly pass: ScreenPass;
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

  /** Shown values this frame (checks and captures). */
  readonly shown = { dark: 0, light: 1, desat: 0, flash: 0, local: 0, blur: 0, split: 0, shakePx: 0, rollDeg: 0, punch: 0, worldScale: 1, stopping: false };

  constructor(private readonly host: ScreenFxHost) {
    this.pass = new ScreenPass();
    this.pass.enabled = false;
    const composer = host.composer;
    // Right before the OutputPass (tone mapping and sRGB), found now: the chain may have grown.
    let at = composer.passes.findIndex((p) => p instanceof OutputPass);
    if (at < 0) at = composer.passes.length;
    composer.insertPass(this.pass, at);
    // The fallback quad goes first in the overlay list, so later overlays (damage numbers) draw over it.
    this.removeQuad = host.addOverlay(this.quad);
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
   * A blow of `tier` landing: shake and hit-stop; a finisher adds slow motion, the punch, the sharp full-screen
   * flash, the zoom blur and the fringe toward the focus (`focus`). Primary blows flash locally only
   * (`localFlash`, which the host calls with the struck point). Shake and flash are the tier's (one row per tier).
   */
  impact(tier: ScreenTier, role: ImpactRole): void {
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
      if (t.flash > 0) this.flash(t.flash, t.flashS);
      if (t.slow < 1) this.slow(t.slow, t.slowS);
      if (t.punch > 0) this.punch(t.punch, t.punchS);
      if (t.splitPx > 0) this.split(t.splitPx, 0.045);
      if (t.blur > 0) this.blur(t.blur, t.blurS);
    }
  }

  /** A local flash at the world point (x, y, z) at `tier`'s strength (the basic blow's and every primary's). */
  localFlash(x: number, y: number, z: number, tier: ScreenTier, scale = 1): void {
    const t = SCREEN_TIERS[tier];
    const a = t.local * scale;
    if (a <= 0 || a < this.localLevel() * 0.8) return;
    this.localAt.set(x, y, z);
    this.localAmp = a;
    this.localAge = 0;
    this.localS = t.localS;
    this.localPx = t.localPx * Math.max(0.5, scale);
    this.localColor.copy(this.flashColor);
  }

  /** The climax's focus (world point) for the zoom blur and the fringe; null: the screen's middle. */
  focus(x: number, y: number, z: number): void {
    this.focusAt.set(x, y, z);
    this.focusSet = true;
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

  flash(alpha: number, seconds: number, colour?: THREE.ColorRepresentation): void {
    if (colour !== undefined) this.flashColor.set(colour);
    if (alpha < this.flashLevel()) return;
    this.flashAmp = alpha;
    this.flashAge = 0;
    this.flashS = Math.max(0.016, seconds);
  }

  /** The flash colour for the next flashes (linear, sRGB hex or a Color). */
  setFlashColor(colour: THREE.ColorRepresentation): void {
    this.flashColor.set(colour);
  }

  split(px: number, seconds: number): void {
    this.splitAmp = Math.max(this.splitLevel(), px);
    this.splitAge = 0;
    this.splitS = Math.min(0.05, Math.max(0.016, seconds));
  }

  /** A radial blur toward the focus: `share` of the way sampled, gone in `seconds` (ease out). */
  blur(share: number, seconds: number): void {
    this.blurAmp = Math.max(this.blurLevel(), share);
    this.blurAge = 0;
    this.blurS = Math.max(0.016, seconds);
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

  private flashLevel(): number {
    // Full on its first frame, then a fast ease out: about 1, 0.45 and 0.1 of it on three frames of 50 ms.
    if (this.flashAge >= this.flashS) return 0;
    const k = 1 - this.flashAge / this.flashS;
    return this.flashAmp * k * k;
  }

  private localLevel(): number {
    if (this.localAge >= this.localS) return 0;
    const k = 1 - this.localAge / this.localS;
    return this.localAmp * k * k;
  }

  private splitLevel(): number {
    if (this.splitAge >= this.splitS) return 0;
    return this.splitAmp * (1 - this.splitAge / this.splitS);
  }

  private blurLevel(): number {
    if (this.blurAge >= this.blurS) return 0;
    const k = 1 - this.blurAge / this.blurS;
    return this.blurAmp * k * k;
  }

  private punchLevel(): number {
    if (this.punchAge >= this.punchS) return 0;
    // Snaps in over 40 ms, eases back.
    const rise = smooth01(this.punchAge / 0.04);
    const fall = 1 - smooth01((this.punchAge - 0.04) / Math.max(0.01, this.punchS - 0.04));
    return this.punchAmp * rise * fall;
  }

  /** Projects a world point to the pass's uv (0–1, y up); false when behind the camera. */
  private toUv(p: THREE.Vector3, camera: THREE.PerspectiveCamera, out: THREE.Vector2 | THREE.Vector4): boolean {
    this.proj.copy(p).project(camera);
    if (this.proj.z > 1) return false;
    out.x = this.proj.x * 0.5 + 0.5;
    out.y = this.proj.y * 0.5 + 0.5;
    return true;
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
    // The flash, fringe, blur and local flash age after they are read (end of update): a blow that lands before
    // this frame's update shows its full level on the next drawn frame at any frame rate. Aged first, the climax's
    // 0.42 flash drew 0.19 then 0.05 at 60 Hz, 0.05 alone at 30 Hz.
    // The held darkening eases (half-life 80 ms) toward its goal.
    this.darkHold += (this.darkHoldGoal - this.darkHold) * (1 - Math.pow(0.5, dt / 0.08));
    if (Math.abs(this.darkHold - this.darkHoldGoal) < 1e-4) this.darkHold = this.darkHoldGoal;
    const dark = Math.max(this.darkLevel(), this.darkHold) * k;
    const desat = Math.min(1, this.darkHold * this.desatPerDark) * k;
    const flash = this.flashLevel() * k;
    const split = this.splitLevel() * k;
    const blur = this.blurLevel() * k;
    const local = this.localLevel() * k;
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
    u.uFlash.value = flash;
    u.uFlashColor.value.copy(this.flashColor);
    u.uBlur.value = blur;
    // The focus holds while the blur or the fringe runs, then falls back to the middle of the view.
    if (blur > 0 || split > 0) {
      if (!this.focusSet || !this.toUv(this.focusAt, camera, u.uFocus.value)) u.uFocus.value.set(0.5, 0.5);
    } else {
      u.uFocus.value.set(0.5, 0.5);
      this.focusSet = false;
    }
    u.uLocal.value.w = 0;
    if (local > 0.002 && this.toUv(this.localAt, camera, u.uLocal.value)) {
      u.uLocal.value.z = this.localPx / 1080;
      u.uLocal.value.w = local;
      u.uLocalColor.value.copy(this.localColor);
    }
    // px at 1080p; the pass turns them into its buffer's px when it draws.
    this.pass.splitPx = split;
    const active = u.uDark.value > 0.002 || u.uVignette.value > 0.002 || desat > 0.002 || flash > 0.002 || split > 0.05 || blur > 1e-4 || u.uLocal.value.w > 0.002;
    const viaComposer = this.host.composerOn();
    this.pass.enabled = active && viaComposer;
    this.quad.dark = viaComposer || lights ? 0 : dark;
    this.quad.flash = viaComposer ? 0 : flash;
    this.quad.setFlashColor(this.flashColor);
    const s = this.shown;
    s.dark = dark;
    s.light = light;
    s.desat = desat;
    s.flash = flash;
    s.local = u.uLocal.value.w;
    s.blur = blur;
    s.split = split;
    s.shakePx = px;
    s.rollDeg = THREE.MathUtils.radToDeg(this.roll);
    s.punch = this.punchNow;
    this.flashAge += dt;
    this.splitAge += dt;
    this.blurAge += dt;
    this.localAge += dt;
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
    this.punchAge = this.darkAge = this.flashAge = this.splitAge = this.blurAge = this.localAge = 10;
    this.darkHold = this.darkHoldGoal = 0;
    this.focusSet = false;
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
    const at = this.host.composer.passes.indexOf(this.pass);
    if (at >= 0) this.host.composer.removePass(this.pass);
    this.pass.dispose();
    this.removeQuad();
    if (this.host.worldLight !== undefined) this.host.worldLight(1);
  }
}
