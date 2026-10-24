// Source: new for the kit, from docs/games/BALANCE.md §3 (log fixes in shared/game-kit/DRIFT.md)
/**
 * Target bands per mode (BALANCE.md §3), the same for every typing speed.
 * Fractions are per mille (‰, 0–1000); `n` is a count (mean near misses a
 * stage). A range may leave out min or max.
 */
import type { Audience, SkillMode } from "./profile";

export const BAND_MODES = ["relax", "balanced", "challenge"] as const;
export type BandMode = (typeof BAND_MODES)[number];
export const BAND_METRICS = ["win", "s", "p", "i", "o", "n", "q"] as const;
export type BandMetric = (typeof BAND_METRICS)[number];

export type Range = { readonly min?: number; readonly max?: number };
export type Band = { readonly [M in BandMetric]: Range };

export const BANDS: { readonly [M in BandMode]: Band } = {
  relax: { win: { min: 920 }, s: { min: 700 }, p: { min: 50, max: 150 }, i: { max: 200 }, o: { max: 30 }, n: { max: 0.2 }, q: { max: 450 } },
  balanced: { win: { min: 750, max: 900 }, s: { min: 350, max: 650 }, p: { min: 150, max: 350 }, i: { max: 100 }, o: { max: 80 }, n: { min: 0.3, max: 1 }, q: { min: 500, max: 700 } },
  challenge: { win: { min: 500, max: 750 }, s: { min: 150, max: 450 }, p: { min: 300, max: 500 }, i: { max: 50 }, o: { max: 150 }, n: { min: 1, max: 2 }, q: { min: 600, max: 800 } },
};

export const MODE_LABELS: { readonly [M in BandMode]: string } = { relax: "Thư giãn", balanced: "Cân bằng", challenge: "Thử thách" };
export const METRIC_LABELS: { readonly [M in BandMetric]: string } = {
  win: "Thắng",
  s: "Biên S",
  p: "Áp lực P",
  i: "Nhàn I",
  o: "Ngộp O",
  n: "Gần thua N",
  q: "Quãng Q",
};

/** Band mode for a player: children use Relax unless a parent picked another; Learn plays at Relax. */
export function bandModeFor(audience: Audience, mode: SkillMode, parentChoice?: BandMode): BandMode {
  if (audience === "child") return parentChoice ?? "relax";
  return mode === "learn" ? "relax" : mode;
}

export type BandVerdict = "in" | "below" | "above" | "missing";
export type BandRow = { readonly metric: BandMetric; readonly value: number | null; readonly min: number | null; readonly max: number | null; readonly verdict: BandVerdict };
export type BandScore = { readonly rows: readonly BandRow[]; readonly inBand: boolean };
export type BandValues = { readonly [M in BandMetric]?: number | null };

export function verdict(value: number | null | undefined, range: Range): BandVerdict {
  if (value === null || value === undefined || !Number.isFinite(value)) return "missing";
  if (range.min !== undefined && value < range.min) return "below";
  if (range.max !== undefined && value > range.max) return "above";
  return "in";
}

/** Each metric against the band; `inBand` only when every scored metric is in. */
export function scoreBand(values: BandValues, band: Band, metrics: readonly BandMetric[] = BAND_METRICS): BandScore {
  const rows = metrics.map((metric): BandRow => {
    const value = values[metric] ?? null;
    const range = band[metric];
    return { metric, value, min: range.min ?? null, max: range.max ?? null, verdict: verdict(value, range) };
  });
  return { rows, inBand: rows.every((row) => row.verdict === "in") };
}

/** "15–35 %", "≥ 92 %", "≤ 3 %", "0.3–1" for a report. */
export function rangeText(metric: BandMetric, range: Range): string {
  const show = (value: number): string => (metric === "n" ? String(value) : Math.round(value / 10) + " %");
  if (range.min !== undefined && range.max !== undefined) return metric === "n" ? `${range.min}–${range.max}` : `${Math.round(range.min / 10)}–${show(range.max)}`;
  if (range.min !== undefined) return "≥ " + show(range.min);
  if (range.max !== undefined) return "≤ " + show(range.max);
  return "—";
}
