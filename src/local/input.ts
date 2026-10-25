/**
 * Local inputs (canon §5.1): `move-to` (right click: a path on the 0.5 m grid)
 * and `arrows` (screen directions; release stops; held arrows win over a
 * path). The router sends arrows 0 when shop mode opens, so the player never
 * walks in it (D45). Nothing moves while the player is down.
 * Owner: Lane 2.
 */
import type { LocalInput, LocalState, StageDef } from "../content/types";
import { createNavGrid, findPath } from "./nav";

export function applyLocalInput(local: LocalState, input: LocalInput, stage: StageDef): void {
  switch (input.type) {
    case "arrows":
      local.arrows = input.mask & 15;
      // Arrows take over from a right-click path.
      if (local.arrows !== 0) {
        local.path.length = 0;
        local.moveTarget = null;
      }
      return;
    case "move-to": {
      if (local.down) return;
      const path = findPath(createNavGrid(stage), { x: local.x, z: local.z }, input.point);
      local.path.length = 0;
      for (const point of path) local.path.push(point);
      local.moveTarget = path.length > 0 ? { x: input.point.x, z: input.point.z } : null;
      return;
    }
  }
}
