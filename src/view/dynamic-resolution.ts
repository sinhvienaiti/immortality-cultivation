/**
 * Dynamic resolution (canon D57, 03/11/2026): High and Ultra may draw up to
 * the display's pixel ratio, but on the M4 at 1920 × 1080 CSS a full DPR 2
 * frame costs 3–6 × the DPR 1 frame (tmp/shots/d57/perf). So the pixel ratio
 * floats between `minDpr` and the tier's DPR on the frame pacing: a window
 * with many late frames steps it down, several clean windows in a row step it
 * up, and a drop blocks raises for a while so it never oscillates. The target
 * interval is the shortest frame seen lately (the display's refresh), never
 * longer than 60 Hz: a frame rate stuck below 60 still counts as late.
 * Pure logic, fed frame intervals in ms; the renderer applies the result.
 */

const FRAME_60_MS = 1000 / 60;

export interface DynamicResolutionRule {
  /** Lowest pixel ratio the governor uses. */
  readonly minDpr: number;
  /** Pixel ratio change per step. */
  readonly step: number;
  /** Length of one judging window, ms. */
  readonly windowMs: number;
  /** A frame is late when longer than refresh × this. */
  readonly lateFactor: number;
  /** Share of late frames in a window that steps down. */
  readonly dropShare: number;
  /** Share of late frames at or under which a window counts as clean. */
  readonly cleanShare: number;
  /** Clean windows in a row before a step up. */
  readonly raiseAfter: number;
  /** After a step down, no step up for this long, ms. */
  readonly holdAfterDropMs: number;
  /** Frame intervals over this are pauses (hidden tab, breakpoint), not frames. */
  readonly ignoreOverMs: number;
}

export class DynamicResolution {
  private dpr: number;
  private maxDpr: number;
  private windowMs = 0;
  private frames = 0;
  private late = 0;
  private clean = 0;
  private holdMs = 0;
  /** Shortest interval of the last window and the one before (the refresh estimate). */
  private minNow = Infinity;
  private minPrev = Infinity;

  constructor(
    private readonly rule: DynamicResolutionRule,
    maxDpr: number,
    startDpr?: number,
  ) {
    this.maxDpr = Math.max(rule.minDpr, maxDpr);
    this.dpr = this.clamp(startDpr ?? (rule.minDpr + this.maxDpr) / 2);
  }

  get pixelRatio(): number {
    return this.dpr;
  }

  /** A new ceiling (tier or display change); keeps the current ratio when it still fits. */
  setMax(maxDpr: number): void {
    this.maxDpr = Math.max(this.rule.minDpr, maxDpr);
    this.dpr = this.clamp(this.dpr);
    this.resetWindow();
    this.clean = 0;
  }

  /** One frame's interval in ms; returns true when the pixel ratio changed. */
  frame(intervalMs: number): boolean {
    if (!(intervalMs > 0) || intervalMs > this.rule.ignoreOverMs) return false;
    this.minNow = Math.min(this.minNow, intervalMs);
    const refresh = Math.min(this.minNow, this.minPrev, FRAME_60_MS);
    this.frames += 1;
    if (intervalMs > refresh * this.rule.lateFactor) this.late += 1;
    this.windowMs += intervalMs;
    this.holdMs = Math.max(0, this.holdMs - intervalMs);
    if (this.windowMs < this.rule.windowMs) return false;
    const share = this.late / this.frames;
    this.minPrev = this.minNow;
    this.resetWindow();
    if (share >= this.rule.dropShare && this.dpr > this.rule.minDpr) {
      this.dpr = this.clamp(this.dpr - this.rule.step);
      this.clean = 0;
      this.holdMs = this.rule.holdAfterDropMs;
      return true;
    }
    this.clean = share <= this.rule.cleanShare ? this.clean + 1 : 0;
    if (this.clean >= this.rule.raiseAfter && this.holdMs === 0 && this.dpr < this.maxDpr) {
      this.dpr = this.clamp(this.dpr + this.rule.step);
      this.clean = 0;
      return true;
    }
    return false;
  }

  private resetWindow(): void {
    this.windowMs = 0;
    this.frames = 0;
    this.late = 0;
    this.minNow = Infinity;
  }

  private clamp(v: number): number {
    const snapped = Math.round(v / this.rule.step) * this.rule.step;
    return Math.min(this.maxDpr, Math.max(this.rule.minDpr, snapped));
  }
}
