/**
 * Screen effects by tier (canon D58 (3); docs/games/tu-tien/skills/POWER_RESEARCH.md
 * table "Bậc"): basic blow, skill, ultimate. One module the skills lab uses
 * now and the game can adopt later:
 * - shake from trauma (amplitude = trauma² × the tier's px at 1080p, smooth
 *   value noise, decaying to nothing in the tier's time; the ultimate adds a
 *   roll of at most 0.1°), along the camera's own axes;
 * - a camera punch (FOV narrowed by a share, about 2 % for the ultimate);
 * - a hit-stop per tier, counted to the part of a frame, eased out, and cut
 *   by a new release (the player's key never waits on it);
 * - slow motion as a world-time scale;
 * - world darkening, a short flash and an edge-only chromatic split in ONE
 *   ShaderPass inserted into the post chain right before its OutputPass, so
 *   it works on linear HDR: dark pixels darken, HDR sword light (luminance
 *   over ~1) keeps its brightness. The DOM (word tags, panels) and the
 *   screen-space overlays drawn after the composer (damage numbers,
 *   renderer.addOverlay) are never darkened, flashed or split. Tiers that
 *   draw without the composer (no bloom: Low, Medium) get the darkening and
 *   the flash from an overlay quad registered before any other overlay.
 * - one global intensity (0–1, accessibility) scaling shake, roll, punch,
 *   darkening, flash and split; hit-stop and slow motion are timing and stay.
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
  /** World darkening on the release: alpha and time (s). */
  readonly dark: number;
  readonly darkS: number;
  /** Flash on a primary blow or finisher: alpha and time (s). */
  readonly flash: number;
  readonly flashS: number;
  /** Edge-only chromatic split on a finisher: px at 1080p (< 50 ms). */
  readonly splitPx: number;
}

/**
 * POWER_RESEARCH.md's tier table (03/11/2026): the middle of ChatGPT's
 * directions A and B, made stronger for the owner's "no screen effect at all".
 */
export const SCREEN_TIERS: Readonly<Record<ScreenTier, TierFx>> = {
  basic: { shakePx: 2, shakeS: 0.075, rollDeg: 0, punch: 0, punchS: 0, stopMs: 14, finisherStopMs: 14, slow: 1, slowS: 0, dark: 0, darkS: 0, flash: 0.05, flashS: 0.04, splitPx: 0 },
  skill: { shakePx: 4, shakeS: 0.12, rollDeg: 0, punch: 0.01, punchS: 0.18, stopMs: 27, finisherStopMs: 30, slow: 0.85, slowS: 0.08, dark: 0.1, darkS: 0.15, flash: 0.1, flashS: 0.045, splitPx: 3 },
  ultimate: { shakePx: 8, shakeS: 0.22, rollDeg: 0.1, punch: 0.02, punchS: 0.26, stopMs: 30, finisherStopMs: 60, slow: 0.45, slowS: 0.18, dark: 0.28, darkS: 0.45, flash: 0.14, flashS: 0.045, splitPx: 6 },
};

/** Largest shake (px at 1080p) trauma 1 stands for. */
const MAX_PX = 8;
/** World speed while a stop holds, and the eased exit (s). */
const STOP_SCALE = 0.05;
const STOP_EXIT_S = 0.03;
/** Slow motion eases back to full speed over this (s). */
const SLOW_EXIT_S = 0.06;

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
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uSplit: { value: 0 },
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
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uSplit;
uniform vec2 uTexel;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  if (uSplit > 0.0) {
    // Edge only: the outer ~18 % of the view, never the middle where the beasts and their words are.
    vec2 d = vUv - 0.5;
    float r = length(vec2(d.x * uAspect, d.y)) / length(vec2(0.5 * uAspect, 0.5));
    float edge = smoothstep(0.62, 1.0, r);
    vec2 off = normalize(d + 1e-5) * uSplit * edge * uTexel;
    c.r = texture2D(tDiffuse, vUv + off).r;
    c.b = texture2D(tDiffuse, vUv - off).b;
  }
  // Linear HDR before tone mapping: the world darkens, light over ~1 (sword light, cores) keeps its level.
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float keep = smoothstep(0.8, 2.2, lum);
  c.rgb *= mix(1.0 - uDark, 1.0, keep);
  c.rgb = mix(c.rgb, uFlashColor, uFlash);
  gl_FragColor = c;
}`,
};

/** The post pass: reads its buffer's size for the split's pixel offset. */
class ScreenPass extends ShaderPass {
  constructor() {
    super(SCREEN_SHADER);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const u = this.uniforms as typeof SCREEN_SHADER.uniforms;
    u.uTexel.value.set(1 / Math.max(1, readBuffer.width), 1 / Math.max(1, readBuffer.height));
    u.uAspect.value = readBuffer.width / Math.max(1, readBuffer.height);
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

/** Where the effects go: the post chain (High, Ultra) and the overlay list (the fallback). */
export interface ScreenFxHost {
  readonly composer: EffectComposer;
  /** True when frames go through the composer (renderer.stage.bloom.enabled). */
  composerOn(): boolean;
  addOverlay(overlay: Overlay): () => void;
}

export class ScreenFx {
  /** Accessibility scale 0–1 for shake, roll, punch, darkening, flash and split. */
  intensity = 1;
  /** Camera offset this frame (world metres) and roll (rad); read by `applyCamera`. */
  readonly offset = new THREE.Vector3();
  roll = 0;
  /** FOV share removed by the punch this frame (0.02 = 2 % narrower). */
  punchNow = 0;

  private trauma = 0;
  private traumaRate = 0;
  private rollPeak = 0;
  private time = 0;
  private punchAmp = 0;
  private punchAge = 1;
  private punchS = 0.2;
  private stopLeft = 0;
  private stopExit = STOP_EXIT_S;
  private slowScale = 1;
  private slowLeft = 0;
  private slowExit = SLOW_EXIT_S;
  private darkAmp = 0;
  private darkAge = 1;
  private darkS = 0.2;
  /** A held darkening a running skill sets every frame (its world change), 0 when none. */
  private darkHoldGoal = 0;
  private darkHold = 0;
  private flashAmp = 0;
  private flashAge = 1;
  private flashS = 0.045;
  private splitAmp = 0;
  private splitAge = 1;
  private splitS = 0.045;
  private readonly flashColor = new THREE.Color(0.9, 1, 0.97);
  private readonly pass: ScreenPass;
  private readonly quad = new ScreenQuad();
  private readonly removeQuad: () => void;
  /** What applyCamera changed, undone by restoreCamera, and the camera as it left it (a camera placed again since keeps its new pose). */
  private appliedRoll = 0;
  private appliedFov = 0;
  private fovAfter = 0;
  private readonly quatAfter = new THREE.Quaternion();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  /** Shown values this frame (checks and captures). */
  readonly shown = { dark: 0, flash: 0, split: 0, shakePx: 0, rollDeg: 0, punch: 0, worldScale: 1, stopping: false };

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

  /** A release of `tier` (the last key): the world darkens for skills and ultimates; the ultimate punches in. */
  release(tier: ScreenTier): void {
    const t = SCREEN_TIERS[tier];
    if (t.dark > 0) this.darken(t.dark, t.darkS);
    if (tier === "ultimate") this.punch(t.punch * 0.5, t.punchS);
  }

  /** A blow of `tier` landing: shake, hit-stop, flash; a finisher adds slow motion, the punch and the edge split. */
  impact(tier: ScreenTier, role: ImpactRole): void {
    const t = SCREEN_TIERS[tier];
    if (role === "secondary") {
      this.shake(t.shakePx * 0.45, t.shakeS * 0.7, 0);
      return;
    }
    const fin = role === "finisher";
    this.shake(fin ? t.shakePx * 1.25 : t.shakePx, fin ? t.shakeS * 1.3 : t.shakeS, t.rollDeg);
    // The basic blow's stop is local to its target (the field holds that beast): no world stop here.
    if (tier !== "basic") this.hitStop(fin ? t.finisherStopMs : t.stopMs);
    this.flash(fin ? t.flash * 1.2 : t.flash, t.flashS);
    if (fin) {
      if (t.slow < 1) this.slow(t.slow, t.slowS);
      if (t.punch > 0) this.punch(t.punch, t.punchS);
      if (t.splitPx > 0) this.split(t.splitPx, 0.045);
    }
  }

  /** Adds trauma for a shake of `px` (1080p) dying in `seconds`, rolling up to `rollDeg` at its peak. */
  shake(px: number, seconds: number, rollDeg = 0): void {
    const add = Math.sqrt(Math.max(0, Math.min(MAX_PX, px)) / MAX_PX);
    const left = this.traumaRate > 0 ? this.trauma / this.traumaRate : 0;
    this.trauma = Math.min(1, this.trauma + add);
    this.traumaRate = this.trauma / Math.max(seconds, left, 1e-3);
    if (rollDeg > this.rollPeak || this.trauma - add <= 0.01) this.rollPeak = rollDeg;
  }

  hitStop(ms: number): void {
    this.stopLeft = Math.max(this.stopLeft, ms / 1000);
  }

  slow(scale: number, seconds: number): void {
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

  /** A held world change (a running field-wide skill): the darkening eases toward `alpha` until it is set back to 0. */
  holdDark(alpha: number): void {
    this.darkHoldGoal = Math.max(0, alpha);
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

  punch(share: number, seconds: number): void {
    this.punchAmp = Math.max(this.punchLevel(), share);
    this.punchAge = 0;
    this.punchS = Math.max(0.05, seconds);
  }

  /** A new release cuts a hit-stop and slow motion still running (the key never waits on a stop). */
  cut(): void {
    this.stopLeft = 0;
    this.stopExit = STOP_EXIT_S;
    this.slowLeft = 0;
    this.slowExit = SLOW_EXIT_S;
    this.slowScale = 1;
  }

  /** True while a hit-stop holds the world. */
  get stopping(): boolean {
    return this.stopLeft > 0;
  }

  /** World seconds for a frame of `dt` real seconds (hit-stop, then slow motion). */
  advance(dt: number): number {
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
    // Full on its first frame, gone by the end (ease out).
    if (this.flashAge >= this.flashS) return 0;
    const k = 1 - this.flashAge / this.flashS;
    return this.flashAmp * k * k;
  }

  private splitLevel(): number {
    if (this.splitAge >= this.splitS) return 0;
    return this.splitAmp * (1 - this.splitAge / this.splitS);
  }

  private punchLevel(): number {
    if (this.punchAge >= this.punchS) return 0;
    // Snaps in over 40 ms, eases back.
    const rise = smooth01(this.punchAge / 0.04);
    const fall = 1 - smooth01((this.punchAge - 0.04) / Math.max(0.01, this.punchS - 0.04));
    return this.punchAmp * rise * fall;
  }

  /**
   * Steps every effect on real time (they play through a hit-stop and a
   * cut-in pause) and writes the camera offset for `camera` (metres along its
   * own axes; px at 1080p turned into metres at the ground point it looks at)
   * and the pass uniforms. `heightPx`: the view's CSS height.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, heightPx: number): void {
    this.time += dt;
    const k = clamp01(this.intensity);
    this.trauma = Math.max(0, this.trauma - this.traumaRate * dt);
    if (this.trauma === 0) {
      this.traumaRate = 0;
      this.rollPeak = 0;
    }
    const tt = this.trauma * this.trauma;
    const px = tt * MAX_PX * k;
    // Smooth noise at ~22 Hz, two octaves, three channels (x, y, roll).
    const t = this.time * 22;
    const nx = vnoise(t, 11) * 0.7 + vnoise(t * 2.3, 13) * 0.3;
    const ny = vnoise(t, 17) * 0.7 + vnoise(t * 2.3, 19) * 0.3;
    const nr = vnoise(t * 0.8, 23);
    camera.getWorldDirection(this.fwd);
    // Metres per px at the ground point on the view axis (the field's middle at the play camera).
    const toGround = this.fwd.y < -0.05 ? camera.position.y / -this.fwd.y : 30;
    const mPerPx = (2 * toGround * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / 1080;
    const scalePx = (px * Math.max(1, heightPx)) / 1080;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const ox = nx * scalePx * mPerPx;
    const oy = ny * scalePx * mPerPx;
    this.offset.set(this.right.x * ox + this.up.x * oy, this.right.y * ox + this.up.y * oy, this.right.z * ox + this.up.z * oy);
    this.roll = THREE.MathUtils.degToRad(this.rollPeak) * tt * nr * k;
    this.punchAge += dt;
    this.punchNow = this.punchLevel() * k;
    this.darkAge += dt;
    this.flashAge += dt;
    this.splitAge += dt;
    // The held darkening eases (half-life 80 ms) toward its goal.
    this.darkHold += (this.darkHoldGoal - this.darkHold) * (1 - Math.pow(0.5, dt / 0.08));
    if (Math.abs(this.darkHold - this.darkHoldGoal) < 1e-4) this.darkHold = this.darkHoldGoal;
    const dark = Math.max(this.darkLevel(), this.darkHold) * k;
    const flash = this.flashLevel() * k;
    const split = this.splitLevel() * k;
    const u = this.pass.uniforms as typeof SCREEN_SHADER.uniforms;
    u.uDark.value = dark;
    u.uFlash.value = flash;
    u.uFlashColor.value.copy(this.flashColor);
    // px at 1080p into the buffer's px (the shader multiplies by its texel size).
    u.uSplit.value = (split * Math.max(1, heightPx)) / 1080;
    const active = dark > 0.002 || flash > 0.002 || split > 0.05;
    const viaComposer = this.host.composerOn();
    this.pass.enabled = active && viaComposer;
    this.quad.dark = viaComposer ? 0 : dark;
    this.quad.flash = viaComposer ? 0 : flash;
    this.quad.setFlashColor(this.flashColor);
    const s = this.shown;
    s.dark = dark;
    s.flash = flash;
    s.split = split;
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
    this.punchAge = this.darkAge = this.flashAge = this.splitAge = 10;
    this.darkHold = this.darkHoldGoal = 0;
    this.cut();
    this.offset.set(0, 0, 0);
    this.roll = 0;
    this.punchNow = 0;
  }

  dispose(): void {
    const at = this.host.composer.passes.indexOf(this.pass);
    if (at >= 0) this.host.composer.removePass(this.pass);
    this.pass.dispose();
    this.removeQuad();
  }
}
