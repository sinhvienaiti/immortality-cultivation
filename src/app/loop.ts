// Source: games/dragon-hold/src/app/loop.ts @06cd4e6 (adapted: FrameInfo carries the local layer; the world clock comes from the view's hit stop, worldDt(dt, now))
/**
 * The frame loop: fixed 60 Hz sim steps from an accumulator (at most 5 per
 * frame at normal speed), world time from the view's hit stop (`worldDt`),
 * keys never eaten (the app applies them to the world at once, so a hit-stop
 * only slows the world, never the typing, canon §6.1). Built on kit/platform
 * runFrameLoop: a throwing frame is reported and the loop keeps going.
 * Owner: step 0 / integration (LANES.md).
 */
import { runFrameLoop, type FrameLoop, type FrameScheduler } from "../kit/platform";

/** One sim tick in seconds. */
export const TICK_S = 1 / 60;
/** Steps one frame may run at world speed 1 (a slow frame drops the backlog past this). */
export const MAX_STEPS = 5;
/** Real frame time is clamped to this (tab switches, breakpoints). */
export const MAX_FRAME_S = 0.1;

/** Timing of one frame; the app adds the local layer to make a FrameInfo (contracts.ts). */
export interface LoopTiming {
  readonly dt: number;
  readonly worldDt: number;
  readonly alpha: number;
  readonly now: number;
}

export interface LoopHooks {
  /** One sim tick (local layer, then world). */
  step(): void;
  /** Once a frame after the steps. */
  frame(timing: LoopTiming): void;
  /** World seconds of a frame of `dt` real seconds ending at `now` (the hit stop, view/fx.ts); dt by default. */
  worldDt?(dt: number, now: number): number;
  /** Dev `?speed=`: world time × this (rules unchanged); 1 by default. */
  speed?(): number;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Paused loops render but do not step (focus loss, menu, open panels, 3-2-1). */
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  /** Steps run since start (tests, scenarios). */
  readonly steps: number;
}

export interface LoopOptions {
  /** Frame source; requestAnimationFrame by default (tests pass a manual one). */
  readonly scheduler?: FrameScheduler;
  readonly onError?: (error: unknown) => void;
}

export function createLoop(hooks: LoopHooks, options: LoopOptions = {}): Loop {
  let running: FrameLoop | null = null;
  let paused = false;
  let carry = 0;
  let last = -1;
  let steps = 0;
  // One mutable timing object: no allocation per frame.
  const timing = { dt: 0, worldDt: 0, alpha: 0, now: 0 };

  const update = (now: number): void => {
    const dt = last < 0 ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    const speed = Math.max(0, hooks.speed?.() ?? 1);
    const base = paused ? 0 : Math.max(0, hooks.worldDt ? hooks.worldDt(dt, now) : dt);
    const worldDt = base * speed;
    carry += worldDt;
    const cap = MAX_STEPS * Math.max(1, Math.ceil(speed));
    let ran = 0;
    while (carry >= TICK_S && ran < cap) {
      carry -= TICK_S;
      ran += 1;
      steps += 1;
      hooks.step();
    }
    // Behind by more than the cap: drop the backlog instead of spiralling.
    if (carry >= TICK_S) carry = 0;
    timing.dt = dt;
    timing.worldDt = worldDt;
    timing.alpha = carry / TICK_S;
    timing.now = now;
  };

  const draw = (): void => {
    hooks.frame(timing);
  };

  return {
    start(): void {
      if (running) return;
      last = -1;
      running = runFrameLoop({
        update,
        draw,
        scheduler: options.scheduler,
        onError: options.onError ? (failure) => options.onError!(failure.error) : undefined,
      });
    },
    stop(): void {
      running?.stop();
      running = null;
    },
    setPaused(next: boolean): void {
      paused = next;
      if (next) carry = 0;
    },
    get paused() {
      return paused;
    },
    get steps() {
      return steps;
    },
  };
}
