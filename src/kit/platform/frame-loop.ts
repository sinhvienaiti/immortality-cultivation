// Source: games/space-typing/src/platform/frame-loop.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * The requestAnimationFrame loop of a game mode (Campaign canvas, Rift
 * Defense, Campaign 3D), made to survive a throwing frame.
 *
 * The next frame is requested before this one runs, so an exception can no
 * longer end the loop and freeze the canvas while the HUD and keyboard go on.
 * The update (simulation, HUD) and the draw run in their own try/catch: a
 * draw error does not stop the world, and an update error still lets the
 * scene and its pause overlay render. The mode's `onError` pauses its run.
 *
 * A stage that fails `maxErrors` frames in a row is halted instead of
 * throwing every frame, and tried again every `retryMs`; it runs again once
 * the state that broke it is gone (the run is left or restarted).
 */
export type FrameStage = "update" | "draw";

export type FrameError = {
  stage: FrameStage;
  error: unknown;
  /** Frames in a row this stage has failed: 1 on the first. */
  streak: number;
  /** The stage is halted (tried again every `retryMs`). */
  halted: boolean;
};

export type FrameScheduler = {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
};

export type FrameLoopOptions = {
  update(now: number): void;
  draw(now: number): void;
  /** Called on every failed stage, e.g. to pause the run. */
  onError?(failure: FrameError): void;
  /** Failed frames in a row that halt a stage. */
  maxErrors?: number;
  /** How often a halted stage is tried again (frame time, ms). */
  retryMs?: number;
  /** Where the first error of a streak goes; reportError by default. */
  report?(error: unknown): void;
  scheduler?: FrameScheduler;
};

export type FrameLoop = {
  /** Stops for good: cancels the pending frame (the mode is destroyed). */
  stop(): void;
};

const MAX_ERRORS = 3;
const RETRY_MS = 1000;

// Looked up per call, so a test's stubbed globals are used.
const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * reportError raises a window "error" event (the feedback dialog keeps the
 * last few for bug reports) and logs it like an uncaught exception.
 */
function reportFrameError(error: unknown): void {
  if (typeof globalThis.reportError === "function") globalThis.reportError(error);
  else console.error(error);
}

/**
 * Calls `handle` on every item, also after one throws (a frame's events: a
 * broken one must not drop the wave end or the defeat behind it), then
 * rethrows the first error for the frame loop to report.
 */
export function handleEach<T>(items: readonly T[], handle: (item: T) => void): void {
  let failure: { error: unknown } | null = null;
  for (const item of items) {
    try {
      handle(item);
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure !== null) throw failure.error;
}

type StageState = { streak: number; haltedAt: number | null };

export function runFrameLoop(options: FrameLoopOptions): FrameLoop {
  const scheduler = options.scheduler ?? browserFrames;
  const maxErrors = Math.max(1, options.maxErrors ?? MAX_ERRORS);
  const retryMs = options.retryMs ?? RETRY_MS;
  const report = options.report ?? reportFrameError;
  const stages: Record<FrameStage, StageState> = {
    update: { streak: 0, haltedAt: null },
    draw: { streak: 0, haltedAt: null },
  };
  let stopped = false;
  let handle = 0;

  function run(stage: FrameStage, step: (now: number) => void, now: number): void {
    const state = stages[stage];
    if (state.haltedAt !== null && now - state.haltedAt < retryMs) return;
    try {
      step(now);
      state.streak = 0;
      state.haltedAt = null;
    } catch (error) {
      state.streak += 1;
      const halted = state.streak >= maxErrors;
      state.haltedAt = halted ? now : null;
      if (state.streak === 1) report(error);
      try {
        options.onError?.({ stage, error, streak: state.streak, halted });
      } catch (handlerError) {
        report(handlerError);
      }
    }
  }

  function frame(now: number): void {
    if (stopped) return;
    // First: nothing below can end the loop.
    handle = scheduler.request(frame);
    run("update", options.update, now);
    if (!stopped) run("draw", options.draw, now);
  }

  handle = scheduler.request(frame);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      scheduler.cancel(handle);
    },
  };
}
