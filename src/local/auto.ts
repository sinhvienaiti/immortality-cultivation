/**
 * Đánh nền (canon §9.3, §12.1): `auto{seat, beast, origin}` at the school's
 * rate (Phi Kiếm every 1.2 s, 10 m): the soft target, else the beast nearest
 * the heart in range (sim/targeting.ts). Reads the world only.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { LocalState, World } from "../content/types";

export function stepAuto(_local: LocalState, _world: World): void {
  throw new Error("TODO(lane-2): local/auto.ts stepAuto");
}
