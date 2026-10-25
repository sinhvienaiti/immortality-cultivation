/**
 * Chân Nguyên (canon §6.6, D42, PB-32): +5 for a Chớp or Hoàn hảo word, +3
 * for a word with errors, +2 more for an Ấn, × 1 / k of the seat (‰, half
 * up), so the bar fills in the same time for k 0.75–1.30; resolved Casts only
 * (cast.ts calls this for each one, the ultimate's own word too). Full at 100:
 * ô 5 shows its word (words.ts, skills.ts); the ultimate spends it all; kept
 * across breaks.
 * Owner: Lane 4.
 */
import { CHAN_NGUYEN } from "../content/rules";
import type { Grade, World } from "../content/types";
import { mulDiv } from "./fixed";

const FULL_PM = CHAN_NGUYEN.full * 1000;

/** Points a resolved word gives before × 1 / k. */
export function chanNguyenPoints(grade: Grade, isSeal: boolean): number {
  const base = grade === "flash" || grade === "perfect" ? CHAN_NGUYEN.clean : CHAN_NGUYEN.withErrors;
  return isSeal ? base + CHAN_NGUYEN.sealBonus : base;
}

export function addChanNguyen(world: World, seat: number, grade: Grade, isSeal: boolean): void {
  const state = world.seats[seat];
  if (state === undefined) return;
  const kPm = state.kPm > 0 ? state.kPm : 1000;
  const gain = mulDiv(chanNguyenPoints(grade, isSeal) * 1000, 1000, kPm);
  const next = state.chanNguyenPm + gain;
  state.chanNguyenPm = next > FULL_PM ? FULL_PM : next;
}

export function chanNguyenFull(world: World, seat: number): boolean {
  return (world.seats[seat]?.chanNguyenPm ?? 0) >= FULL_PM;
}

/** Ô 5 cast: empties the bar; false when it was not full. */
export function spendChanNguyen(world: World, seat: number): boolean {
  const state = world.seats[seat];
  if (state === undefined || state.chanNguyenPm < FULL_PM) return false;
  state.chanNguyenPm = 0;
  return true;
}
