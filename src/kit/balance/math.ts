// Source: new for the kit, from docs/games/BALANCE.md §6, §8 (log fixes in shared/game-kit/DRIFT.md)
/**
 * Number helpers for the balance module. `detExp` and `detLn` use only
 * + − × ÷ (Math.exp and Math.log may differ in the last bit between engines),
 * so a seeded bot draws the same timings in Node and in every browser.
 */
import type { RngStream } from "../platform/rng";

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** A fraction 0–1 as an integer per mille (‰); NaN reads as 0. */
export const toMilli = (fraction: number): number => (Number.isFinite(fraction) ? Math.round(clamp(fraction, 0, 1) * 1000) : 0);

/** Rounded to 1/1000, so a value written to a replay reads back the same. */
export const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const LN2 = 0.6931471805599453;

/** e^x from a Taylor series after range reduction (x = k·ln2 + r, |r| ≤ ln2/2). */
export function detExp(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > 709) return Number.POSITIVE_INFINITY;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1;
  let sum = 1;
  for (let index = 1; index <= 18; index += 1) {
    term = (term * r) / index;
    sum += term;
  }
  const step = k > 0 ? 2 : 0.5;
  for (let left = Math.abs(k); left > 0; left -= 1) sum *= step;
  return sum;
}

/** ln x from atanh's series after scaling x into [0.75, 1.5). */
export function detLn(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY;
  let m = x;
  let exponent = 0;
  while (m >= 1.5) {
    m /= 2;
    exponent += 1;
  }
  while (m < 0.75) {
    m *= 2;
    exponent -= 1;
  }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let power = s;
  let sum = s;
  for (let odd = 3; odd <= 41; odd += 2) {
    power *= s2;
    sum += power / odd;
  }
  return 2 * sum + exponent * LN2;
}

/** A standard normal draw (Irwin–Hall: twelve uniforms − 6, bounded to ±6). */
export function normalDraw(rng: RngStream): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += rng.float();
  return sum - 6;
}

/** A log-normal multiplier with mean 1 and coefficient of variation `cv`. */
export function logNormalDraw(rng: RngStream, cv: number): number {
  if (!(cv > 0)) return 1;
  const variance = detLn(1 + cv * cv);
  return detExp(-variance / 2 + Math.sqrt(variance) * normalDraw(rng));
}

/** Median of integers: the mean of the two middle values, floored. Empty → null. */
export function medianInt(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Median of numbers (reports only). Empty → null. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
