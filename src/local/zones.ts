/**
 * Strikes on this player (canon §9.1, D34): reads the world's `telegraph
 * strike` events; standing inside at the strike tick costs Sinh lực and
 * shield, unless the player stands in a `ward` with charges (then `ward-use`).
 * Kết Giới: −10 % damage inside, 1.5 s grace and 3 s fade after leaving.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { LocalState, World } from "../content/types";

export function stepZones(_local: LocalState, _world: World): void {
  throw new Error("TODO(lane-2): local/zones.ts stepZones");
}
