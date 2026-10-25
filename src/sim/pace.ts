/**
 * Pace k per seat (canon §7.5; kit balance/pace.ts paceK, effectiveE):
 * k = clamp(C(E_eff) / C_ref; 0.75; 1.30) with C_ref = C(E_eff of the Chuẩn
 * bot) ≈ 19.6 words a minute, ℓ̄ by the band of E (canon §6.3) and d 0.86.
 * k only scales time (spawn gaps, wave clocks, telegraph charge, Chân Nguyên,
 * Dưỡng × 1 / k); HP, composition and hashes never depend on it. The kit's
 * float maths is rounded to 1/1000 and enters the replay header as kPm, so
 * the sim itself only ever sees integers. `pace-update` (first match of an
 * "unknown" profile) changes a seat's k from wave 2 (canon §6.5, D41).
 * Owner: Lane 2.
 */
import { LENGTH_BY_E, PACE } from "../content/rules";
import type { SeatProfile, SimCommand, World } from "../content/types";
import { capacity, effectiveE, paceK } from "../kit/balance/pace";
import { emit } from "./events";
import { clamp } from "./fixed";

/** A profile's pace, fixed at load and written into the replay header. */
export interface PaceInfo {
  /** k × 1000. */
  readonly kPm: number;
  /** E_eff × 1000 (WPM). */
  readonly eEffX1000: number;
  /** One word's time at E_eff, ticks (0 for a player who does not type). */
  readonly wordTicks: number;
}

/** ℓ̄ by the band of E (canon §6.3, Rồng 01 §3.4): 4.5 under 45 WPM, 5.5 at 45–64, 6.0 from 65. */
export function meanLength(e: number): number {
  let x10 = LENGTH_BY_E[0]!.meanX10;
  for (const row of LENGTH_BY_E) if (e >= row.minWpm) x10 = row.meanX10;
  return x10 / 10;
}

const D = PACE.dPm / 1000;
const RANGE = { min: PACE.kMinPm / 1000, max: PACE.kMaxPm / 1000 } as const;
const eEffOf = (profile: SeatProfile): number => effectiveE({ e: profile.e, a: profile.a / 1000, cv: profile.cv / 1000 });

/** C_ref: the Chuẩn bot's capacity (canon §7.5: ≈ 19.6 words a minute). */
export const C_REF = capacity(eEffOf(PACE.refProfile), meanLength(PACE.refProfile.e), D, PACE.reactMs / 1000, PACE.perCharS);

/** Pace from a profile (e WPM, a and cv permille). */
export function paceFor(profile: SeatProfile): PaceInfo {
  const eEff = eEffOf(profile);
  const length = meanLength(profile.e);
  const k = paceK(eEff, { len: length, d: D, ref: C_REF }, RANGE);
  const words = capacity(eEff, length, D, PACE.reactMs / 1000, PACE.perCharS);
  return {
    kPm: clamp(Math.round(k * 1000), PACE.kMinPm, PACE.kMaxPm),
    eEffX1000: Math.round(eEff * 1000),
    wordTicks: words > 0 ? Math.round(3600 / words) : 0,
  };
}

/** The seat's current k × 1000 (1000 for an unknown seat). */
export function kForSeat(world: World, seat: number): number {
  return world.seats[seat]?.kPm ?? 1000;
}

/** k × 1000 the shared world runs at: the mean of the seats (solo: the player's; canon §19.1 elites and boss). */
export function worldKPm(world: World): number {
  if (world.seats.length === 0) return 1000;
  let sum = 0;
  for (const seat of world.seats) sum += seat.kPm;
  return Math.round(sum / world.seats.length);
}

/** ticks × 1000 / kPm, rounded, at least 1 (kit scaleTicks in integers). */
export function scaleTicks(ticks: number, kPm: number): number {
  const k = kPm > 0 ? kPm : 1000;
  const scaled = Math.floor((2 * ticks * 1000 + k) / (2 * k));
  return scaled < 1 ? 1 : scaled;
}

/**
 * `pace-update{seat, kPm}`: accepted after wave 1 ends and before wave 2
 * starts (the break and wave 2's warning), so the new k applies from wave 2
 * (canon §6.5); clamped to 0.75–1.30. HP and composition never change.
 */
export function applyPaceUpdate(world: World, command: Extract<SimCommand, { type: "pace-update" }>): void {
  const seat = world.seats[command.seat];
  const between = world.waves.index === 1 && world.waves.endedThrough >= 1 && (world.phase === "break" || world.phase === "warning");
  if (!seat || !between || !Number.isSafeInteger(command.kPm)) {
    emit(world, { type: "rejected", command: "pace-update", reason: !seat ? "seat" : !between ? "phase" : "value" });
    return;
  }
  seat.kPm = clamp(command.kPm, PACE.kMinPm, PACE.kMaxPm);
  emit(world, { type: "pace-update", seat: command.seat, kPm: seat.kPm });
}
