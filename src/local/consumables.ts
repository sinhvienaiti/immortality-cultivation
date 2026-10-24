/**
 * Đan phù on this player (canon §12.3, D34): on the world's `consumable`
 * event of its own seat, Hồi Xuân Đan heals 25 % over 2 s and Kim Thân Phù
 * shields 20 % of max Sinh lực for 8 s. The sim keeps counts, cooldown, Linh Sa.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { EventOf, LocalState } from "../content/types";

export function onConsumable(_local: LocalState, _event: EventOf<"consumable">): void {
  throw new Error("TODO(lane-2): local/consumables.ts onConsumable");
}

export function stepConsumableEffects(_local: LocalState): void {
  throw new Error("TODO(lane-2): local/consumables.ts stepConsumableEffects");
}
