/**
 * Player zoom (canon D57, amends D48): the default frame is the whole field
 * (fitCamera); the wheel or keys move smoothly toward a close view that
 * follows the hero, at the same tilt, and one action returns to the whole
 * field. The distance blends in log space so each wheel step feels the same.
 * No allocation per frame.
 */
import type * as THREE from "three";
import { placeCamera, type CameraFit } from "./renderer";

export const ZOOM = {
  /**
   * Camera distance at full zoom, metres. At 22 m the hero was still about a tenth of the frame height in the
   * lab (03/11/2026); at 12 m (FOV 28°: about 6 m of ground in view) the hero and the sword read about a
   * quarter of it, the anime close view the owner asked for (D57).
   */
  closeDistanceM: 12,
  /** Zoom change per key press (0 = whole field, 1 = closest). */
  step: 0.2,
  /** Zoom change per wheel pixel: a 100 px mouse notch moves one step; a trackpad's small deltas add up smoothly. */
  perWheelPx: 0.002,
  /** Most zoom one wheel event may move (fast flicks of a free-spinning wheel). */
  maxPerWheel: 0.25,
  /** Half-life of the smoothing toward the wanted zoom, seconds. */
  halfLifeS: 0.11,
  /** Height of the look-at point over the hero's feet at full zoom, metres (chest height). */
  heroLookY: 0.9,
  /** A big skill's wide framing: out to the whole field in this time (s), back to the player's zoom in this. */
  wideInS: 0.25,
  wideOutS: 0.5,
  /** The dolly push at the field fit: share of the distance, in (s) and back (s). */
  pushShare: 0.06,
  pushInS: 0.09,
  pushOutS: 0.45,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number): number => t * t * (3 - 2 * t);
/** Smootherstep: zero speed and acceleration at both ends (a tween restarted mid-way never jerks). */
const ease5 = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (6 * x - 15) + 10);
};

export class CameraZoom {
  /** The zoom the player asked for, 0 (whole field) to 1 (closest). */
  wanted = 0;
  private now = 0;
  /** The wide framing's weight shown (0 the player's zoom, 1 the whole field) and its tween (from, goal, age, length). */
  private wide = 0;
  private wideFrom = 0;
  private wideGoal = 0;
  private wideAge = 1;
  private wideDur: number = ZOOM.wideInS;
  /** The dolly push's age (s) and share; age ≥ in + out: none. */
  private pushAge = 10;
  private pushAmt = 0;

  /** The smoothed zoom shown this frame. */
  get value(): number {
    return this.now;
  }

  /** True while the camera is off the whole-field fit (the caller then lets this class place it every frame). */
  get active(): boolean {
    return this.wanted > 0 || this.now > 1e-4 || this.pushAge < ZOOM.pushInS + ZOOM.pushOutS;
  }

  /** A wheel event (WheelEvent deltaY and deltaMode): scrolling up (negative deltaY) zooms in. */
  wheel(deltaY: number, deltaMode = 0): void {
    if (deltaY === 0) return;
    const px = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 800 : deltaY;
    const change = Math.max(-ZOOM.maxPerWheel, Math.min(ZOOM.maxPerWheel, -px * ZOOM.perWheelPx));
    this.wanted = clamp01(this.wanted + change);
  }

  zoomIn(): void {
    this.wanted = clamp01(this.wanted + ZOOM.step);
  }

  zoomOut(): void {
    this.wanted = clamp01(this.wanted - ZOOM.step);
  }

  /** Back to the whole field. */
  reset(): void {
    this.wanted = 0;
  }

  /** One action between the whole field and the closest view. */
  toggle(): void {
    this.wanted = this.wanted > 0 ? 0 : 1;
  }

  /** Jumps without smoothing (captures and tests); drops a wide framing and a push. */
  set(value: number): void {
    this.wanted = clamp01(value);
    this.now = this.wanted;
    this.wide = this.wideFrom = this.wideGoal = 0;
    this.wideAge = 1;
    this.pushAge = 10;
  }

  /**
   * A big skill's framing, called every frame (or on change): true eases the view out to the whole field within
   * ZOOM.wideInS and holds it; false eases back to the player's zoom over ZOOM.wideOutS. A tween restarts from
   * what is shown, so turning it on and off never jumps.
   */
  holdWide(on: boolean): void {
    const goal = on ? 1 : 0;
    if (goal === this.wideGoal) return;
    this.wideFrom = this.wide;
    this.wideGoal = goal;
    this.wideAge = 0;
    // Part of the way already: the rest of the move takes its share of the time (a short hold never crawls).
    const left = Math.abs(goal - this.wide);
    this.wideDur = (on ? ZOOM.wideInS : ZOOM.wideOutS) * Math.max(0.35, left);
  }

  /** The wide framing's weight shown this frame (0 none, 1 the whole field). */
  get wideShown(): number {
    return this.wide;
  }

  /** True while the view is held wide or easing (the camera is not the player's own zoom). */
  get framing(): boolean {
    return this.wideGoal > 0 || this.wide > 1e-4;
  }

  /** A dolly push of `share` of the distance and back (the big skill's beat at the field fit). */
  push(share: number = ZOOM.pushShare): void {
    this.pushAmt = Math.max(this.pushLevel(), share);
    this.pushAge = 0;
  }

  private pushLevel(): number {
    const a = this.pushAge;
    if (a >= ZOOM.pushInS + ZOOM.pushOutS) return 0;
    return this.pushAmt * (a < ZOOM.pushInS ? ease5(a / ZOOM.pushInS) : 1 - ease5((a - ZOOM.pushInS) / ZOOM.pushOutS));
  }

  /**
   * Places `camera` for this frame between the whole-field `fit` (centred on
   * `centreX`) and the close view on the hero at (`heroX`, `heroZ`). At zoom 0
   * this is exactly the fitCamera placement.
   */
  update(camera: THREE.PerspectiveCamera, fit: CameraFit, centreX: number, heroX: number, heroZ: number, dtS: number): void {
    const k = dtS <= 0 ? 1 : 1 - Math.pow(0.5, dtS / ZOOM.halfLifeS);
    this.now += (this.wanted - this.now) * k;
    if (Math.abs(this.wanted - this.now) < 1e-4) this.now = this.wanted;
    // The wide framing on real time (it plays through a hit-stop and the cut-in's pause).
    if (this.wideAge < 1 || this.wide !== this.wideGoal) {
      this.wideAge = Math.min(1, this.wideAge + Math.max(0, dtS) / Math.max(1e-3, this.wideDur));
      if (this.wideAge >= 1 - 1e-9) this.wideAge = 1;
      this.wide = this.wideAge >= 1 ? this.wideGoal : this.wideFrom + (this.wideGoal - this.wideFrom) * ease5(this.wideAge);
    }
    this.pushAge += Math.max(0, dtS);
    const t = ease(this.now) * (1 - this.wide);
    const far = Math.log(fit.distanceM);
    const near = Math.log(Math.min(ZOOM.closeDistanceM, fit.distanceM));
    const distance = Math.exp(far + (near - far) * t) * (1 - this.pushLevel());
    const x = centreX + (heroX - centreX) * t;
    const z = fit.targetZ + (heroZ - fit.targetZ) * t;
    placeCamera(camera, fit.tiltDeg, distance, x, z, ZOOM.heroLookY * t);
  }
}
