// Source: games/dragon-hold/src/sim/fixed.ts @06cd4e6 (adapted: constants from rules.ts SIM, half-up mulDiv of canon §7.2, unit vectors)
/**
 * Integer helpers for the sim (canon §7.1, M0A_PLAN §3.1: no trig, pow, hypot
 * or ** in sim/). Ticks at 60 Hz; u with 1 m = 60 000 u (N mm/s = N u per
 * tick); `mulDiv` rounds half up at every step of the damage order (canon §7.2,
 * D38). Products stay below 2^53 for fields up to ±150 m, so plain numbers hold
 * them exactly.
 * Owner: Lane 2.
 */
import { SIM } from "../content/rules";

export const TICK_HZ = SIM.tickHz;
export const U_PER_M = SIM.uPerM;
export const U_PER_MM = SIM.uPerMm;

/** Metres (content, readers) to u, rounded. */
export const mToU = (m: number): number => Math.round(m * U_PER_M) + 0;
/** u to metres, for readers only (events, view); never fed back into rules. */
export const uToM = (u: number): number => u / U_PER_M;
export const mmToU = (mm: number): number => mm * U_PER_MM;
/** Milliseconds to whole ticks, rounded half up (16.67 ms each). */
export const msToTicks = (ms: number): number => mulDiv(ms, TICK_HZ, 1000);
export const ticksToMs = (ticks: number): number => mulDiv(ticks, 1000, TICK_HZ);

export const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

/**
 * round half up of a × b / c for integers; c > 0 (canon §7.2: every step of the
 * damage order). Exact while |a × b| < 2^53; −0 never comes out.
 */
export const mulDiv = (a: number, b: number, c: number): number => {
  const p = a * b;
  // floor((2p + c) / (2c)) is round-half-up for any sign of p.
  return Math.floor((2 * p + c) / (2 * c)) + 0;
};

/**
 * round half away from zero of a × b / c, for movement and directions: a
 * mirror image (−a) rounds to the exact negative, so mirrored beasts and
 * players walk mirrored paths. Damage keeps `mulDiv` (half up, canon §7.2).
 */
export const mulDivSym = (a: number, b: number, c: number): number => (a < 0 ? -mulDiv(-a, b, c) + 0 : mulDiv(a, b, c));

/** `value` × `permille` / 1000, half up. */
export const pm = (value: number, permille: number): number => mulDiv(value, permille, 1000);
/** `value` × `percent` / 100, half up. */
export const pct = (value: number, percent: number): number => mulDiv(value, percent, 100);

/** floor(√n) for a non-negative integer (sqrt is correctly rounded in IEEE 754; the fix-up guards the edge). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let root = Math.floor(Math.sqrt(n));
  while (root * root > n) root -= 1;
  while ((root + 1) * (root + 1) <= n) root += 1;
  return root;
}

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax: number, az: number, bx: number, bz: number): number => isqrt(dist2(ax, az, bx, bz));
/** (ax, az) within `radius` u of (bx, bz), without a square root. */
export const within = (ax: number, az: number, bx: number, bz: number, radius: number): boolean => dist2(ax, az, bx, bz) <= radius * radius;

/**
 * Moves (x, z) towards (tx, tz) by at most `step` u; returns the new point in `out`
 * and the distance still left after the move. Integer only.
 */
export function stepTowards(x: number, z: number, tx: number, tz: number, step: number, out: { x: number; z: number }): number {
  const dx = tx - x;
  const dz = tz - z;
  const d = isqrt(dx * dx + dz * dz);
  if (d <= step || d === 0) {
    out.x = tx;
    out.z = tz;
    return 0;
  }
  out.x = x + mulDivSym(dx, step, d);
  out.z = z + mulDivSym(dz, step, d);
  return d - step;
}

/** A direction as a unit vector × 1000 (‰), (0, 0) for a zero vector. */
export function unitPm(dx: number, dz: number, out: { x: number; z: number }): void {
  const d = isqrt(dx * dx + dz * dz);
  if (d === 0) {
    out.x = 0;
    out.z = 0;
    return;
  }
  out.x = mulDivSym(dx, 1000, d);
  out.z = mulDivSym(dz, 1000, d);
}
