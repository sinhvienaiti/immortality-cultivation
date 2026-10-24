/**
 * Đan, phù in the sim (canon §12.3, D34): 2 slots × 3, keys 1/2/3, shared
 * cooldown 8 s; the sim keeps counts, cooldown and Linh Sa, emits
 * `consumable{seat, kind}` and applies Lôi Hỏa Phù to the world; Hồi Xuân Đan
 * and Kim Thân Phù are applied by local/consumables.ts. Not while down.
 * Owner: Lane 4. TODO(lane-4).
 */
import type { ConsumablesState, SimCommand, World, WorldInit } from "../content/types";

export function createConsumablesState(_init: WorldInit): ConsumablesState {
  throw new Error("TODO(lane-4): sim/consumables.ts createConsumablesState");
}

export function useConsumable(_world: World, _command: Extract<SimCommand, { type: "consumable" }>): void {
  throw new Error("TODO(lane-4): sim/consumables.ts useConsumable");
}

export function stepConsumables(_world: World): void {
  throw new Error("TODO(lane-4): sim/consumables.ts stepConsumables");
}
