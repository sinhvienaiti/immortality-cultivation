/**
 * Chân Nguyên (canon §6.6, D42, PB-32): +5 clean / +3 with errors / +2 more
 * for an Ấn, × 1 / k of the seat (‰, half up), resolved Casts only; full at
 * 100 asks ô 5 for its word; the ultimate spends it all; kept across breaks.
 * Owner: Lane 4. TODO(lane-4).
 */
import type { Grade, World } from "../content/types";

export function addChanNguyen(_world: World, _seat: number, _grade: Grade, _isSeal: boolean): void {
  throw new Error("TODO(lane-4): sim/chan-nguyen.ts addChanNguyen");
}

/** Ô 5 cast: empties the bar; false when it was not full. */
export function spendChanNguyen(_world: World, _seat: number): boolean {
  throw new Error("TODO(lane-4): sim/chan-nguyen.ts spendChanNguyen");
}
