/**
 * Lưu Quang Bộ (canon §12.1): on this seat's `cast resolved` of ô 3 with the
 * dash loadout, glide 5 m along the walk direction (the `cast` event carries
 * no cursor, so the last walk direction; north before any move), 0.3 s
 * unpushable, no invulnerability. Not while down.
 * Owner: Lane 2.
 */
import type { EventOf, GuardChoice, LocalState } from "../content/types";
import { startDash } from "./player";

export function onCastResolved(local: LocalState, event: EventOf<"cast">, guard: GuardChoice): void {
  if (event.seat !== local.seat || event.state !== "resolved" || event.slot !== 3 || guard !== "dash" || local.down) return;
  startDash(local);
}
