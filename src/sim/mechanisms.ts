/**
 * Mechanisms (canon §8.3, data/mechanisms.ts): Kiếm Thung, Lôi Phù Trụ,
 * Phong Ấn Võng on 6 slots, levels 1–3, trigger by themselves; hard control
 * ≤ 35 % of each beast's life; flyers ignore ground mechanisms (Phong Ấn Võng pulls them down).
 * Owner: Lane 4. TODO(lane-4).
 */
import type { MechanismsState, World, WorldInit } from "../content/types";

export function createMechanismsState(_init: WorldInit): MechanismsState {
  throw new Error("TODO(lane-4): sim/mechanisms.ts createMechanismsState");
}

export function stepMechanisms(_world: World): void {
  throw new Error("TODO(lane-4): sim/mechanisms.ts stepMechanisms");
}
