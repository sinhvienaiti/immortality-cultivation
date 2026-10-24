/**
 * Pause menu (canon §4.1, §5.1, §24): continue, typing speed, reduced motion,
 * retreat, key remap.
 * Owner: Lane 6. TODO(lane-6).
 */
import type { KeyPanel } from "../app/input-router";

export type PauseMenu = KeyPanel & { open(): void; close(): void; dispose(): void };

export function createMenu(_host: HTMLElement): PauseMenu {
  throw new Error("TODO(lane-6): ui/menu.ts createMenu");
}
