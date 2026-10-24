/**
 * Lưu Quang Bộ (canon §12.1): on this seat's `cast resolved` of ô 3 with the
 * dash loadout, glide 5 m along the walk direction or towards the cursor;
 * 0.3 s unpushable; no invulnerability.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { EventOf, LocalState } from "../content/types";

export function onCastResolved(_local: LocalState, _event: EventOf<"cast">): void {
  throw new Error("TODO(lane-2): local/dash.ts onCastResolved");
}
