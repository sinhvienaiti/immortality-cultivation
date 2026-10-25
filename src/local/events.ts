/**
 * The local layer's own events (player-hit, player-down, player-up): kept in
 * `local.events`, stamped with the world tick the layer ran before, drained by
 * the app with the world's (M0A_PLAN §3.4). Not hashed.
 * Owner: Lane 2.
 */
import type { LocalState, SimEvent } from "../content/types";
import type { EventBody } from "../sim/events";

export function localEmit(local: LocalState, body: EventBody): void {
  local.events.push({ ...body, tick: local.tick } as SimEvent);
}
