// Source: games/space-typing/src/platform/canvas-state.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Puts a 2D canvas back in its first state, scaled to `dpr`, after a draw
 * that threw midway: its unmatched save(), transform, clip and alpha would
 * otherwise leak into every later frame (a shifted, cut or faded scene until
 * the next resize). The canvas is cleared; the next frame draws it again.
 */
export function resetCanvas2D(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  dpr: number,
): void {
  if (typeof context.reset === "function") context.reset();
  // Older browsers: setting the width, even to its own value, resets the
  // context the same way.
  else canvas.width = canvas.width;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}
