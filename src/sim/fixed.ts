/**
 * Integer helpers for the sim (canon §7.1, M0A_PLAN §3.1: no trig, pow, hypot
 * or ** in sim/). Ticks at 60 Hz; u with 1 m = 60 000 u (N mm/s = N u per
 * tick); `mulDiv` rounds half up at every step of the damage order (canon §7.2, D38).
 * Owner: Lane 2. TODO(lane-2): copy games/dragon-hold/src/sim/fixed.ts with a `// Source:` header.
 */
import { SIM } from "../content/rules";

export const TICK_HZ = SIM.tickHz;
export const U_PER_M = SIM.uPerM;
export const U_PER_MM = SIM.uPerMm;

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/fixed.ts " + name);
};

/** Metres (content, readers) to u, rounded. */
export const mToU = (_m: number): number => todo("mToU");
/** u to metres, for readers only (events, view); never fed back into rules. */
export const uToM = (_u: number): number => todo("uToM");
export const mmToU = (_mm: number): number => todo("mmToU");
export const msToTicks = (_ms: number): number => todo("msToTicks");
export const ticksToMs = (_ticks: number): number => todo("ticksToMs");
export const clamp = (_value: number, _min: number, _max: number): number => todo("clamp");
/** round half up of a × b / c for integers; c > 0 (canon §7.2). */
export const mulDiv = (_a: number, _b: number, _c: number): number => todo("mulDiv");
/** floor(√n) for a non-negative integer. */
export const isqrt = (_n: number): number => todo("isqrt");
export const dist2 = (_ax: number, _az: number, _bx: number, _bz: number): number => todo("dist2");
export const dist = (_ax: number, _az: number, _bx: number, _bz: number): number => todo("dist");
/** (ax, az) within `radius` u of (bx, bz), without a square root. */
export const within = (_ax: number, _az: number, _bx: number, _bz: number, _radius: number): boolean => todo("within");
