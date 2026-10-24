/**
 * Local inputs (canon §5.1): `move-to` (right click, path on the grid) and
 * `arrows` (screen directions; release stops). The router sends arrows 0 when
 * shop mode opens, so the player never walks in it.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { LocalInput, LocalState } from "../content/types";

export function applyLocalInput(_local: LocalState, _input: LocalInput): void {
  throw new Error("TODO(lane-2): local/input.ts applyLocalInput");
}
