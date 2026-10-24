/**
 * Pace k per seat (canon §7.5; kit balance/pace.ts paceK, effectiveE):
 * k = clamp(C(E_eff) / C_ref; 0.75; 1.30). k only scales time (spawn gaps,
 * wave clocks, telegraph charge, Chân Nguyên, Dưỡng × 1 / k); HP, composition
 * and hashes never depend on it. `pace-update` (first match of an "unknown"
 * profile) changes a seat's k from wave 2 (canon §6.5).
 * Owner: Lane 2. TODO(lane-2).
 */
import type { SeatProfile, SimCommand, World } from "../content/types";

/** A profile's pace, fixed at load and written into the replay header. */
export interface PaceInfo {
  /** k × 1000. */
  readonly kPm: number;
  /** E_eff × 1000 (WPM). */
  readonly eEffX1000: number;
  /** One word's time at E_eff, ticks. */
  readonly wordTicks: number;
}

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/pace.ts " + name);
};

/** Pace from a profile (e WPM, a and cv permille). */
export function paceFor(_profile: SeatProfile): PaceInfo {
  return todo("paceFor");
}

/** The seat's current k × 1000. */
export function kForSeat(_world: World, _seat: number): number {
  return todo("kForSeat");
}

/** ticks × 1000 / kPm, at least 1 (kit scaleTicks in integers). */
export function scaleTicks(_ticks: number, _kPm: number): number {
  return todo("scaleTicks");
}

export function applyPaceUpdate(_world: World, _command: Extract<SimCommand, { type: "pace-update" }>): void {
  todo("applyPaceUpdate");
}
