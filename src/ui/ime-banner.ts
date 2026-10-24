/**
 * IME banner (canon §5.2): a Vietnamese input method is on (Unikey/EVKey in
 * Telex/VNI): say how to switch it to E. Never changes difficulty.
 * Owner: Lane 3. TODO(lane-3).
 */

export interface ImeBanner {
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createImeBanner(_host: HTMLElement): ImeBanner {
  throw new Error("TODO(lane-3): ui/ime-banner.ts createImeBanner");
}
