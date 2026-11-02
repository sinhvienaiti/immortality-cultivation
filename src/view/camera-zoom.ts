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
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number): number => t * t * (3 - 2 * t);

export class CameraZoom {
  /** The zoom the player asked for, 0 (whole field) to 1 (closest). */
  wanted = 0;
  private now = 0;

  /** The smoothed zoom shown this frame. */
  get value(): number {
    return this.now;
  }

  /** True while the camera is off the whole-field fit (the caller then lets this class place it every frame). */
  get active(): boolean {
    return this.wanted > 0 || this.now > 1e-4;
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

  /** Jumps without smoothing (captures and tests). */
  set(value: number): void {
    this.wanted = clamp01(value);
    this.now = this.wanted;
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
    const t = ease(this.now);
    const far = Math.log(fit.distanceM);
    const near = Math.log(Math.min(ZOOM.closeDistanceM, fit.distanceM));
    const distance = Math.exp(far + (near - far) * t);
    const x = centreX + (heroX - centreX) * t;
    const z = fit.targetZ + (heroZ - fit.targetZ) * t;
    placeCamera(camera, fit.tiltDeg, distance, x, z, ZOOM.heroLookY * t);
  }
}
