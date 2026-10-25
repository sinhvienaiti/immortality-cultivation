/**
 * The M0a wave plan (canon §13.3) in `WaveDef` shape (canon §23.3), at k = 1,
 * Cân bằng, D_ref 75 W/min (rules.ts REF_OUTPUT, trial until Lane 7 measures
 * it). Wave W = L × D_ref × minutes including the most a summoner may call
 * (Tru Đàn 2 × 3 W in waves 4 and 6, PB-09); sim/waves.ts waveW100 is the
 * analytic filter. A Thạch Thử cluster is 7 beasts (2.31 W); an elite replaces
 * one beast of its group.
 *
 * Timing (canon §13.1: 2–3 peaks of 6–10 s, lulls ≥ 8 s between them, short
 * peaks ≤ 1.15 in a middle wave and ≤ 1.30 in the last): each wave has a load
 * profile, a peak level inside `peaks` and a lower level elsewhere, whose mean
 * is the wave's L. Group i leaves its gate when the profile's work at D_ref
 * reaches the W of the groups before it (a thú tướng counts with the most its
 * howls may call, so its calls have room), rounded to 100 ms; then the gate
 * rule (1.5 s a gate, 0.6 s between any two) stretches. With the mean fixed by
 * the canon's composition, the lulls of waves 5 and 6 cannot sit far below
 * their peaks (mean 1.00 under a 1.15 cap, 1.13 under 1.30).
 * tests/content/waves.test.ts checks composition, W within ± 25 %, mean load
 * bands, the busiest 8 s and 10 s windows (Rồng's PEAK_WINDOW_MS), peaks,
 * lulls and the gate rule. Group times scale by 1 / k at runtime and the gate
 * rule clamps after. When D_ref is measured, the lists change with the new W
 * (canon §13.3).
 * Owner: Lane 2.
 */
import type { BeastId, EliteTraitId, GateId, GeneralId, WaveDef, WaveGroupDef } from "../types";

/** Each wave's load L × 100 and its stated short peak (canon §13.3 table; null: the band's cap, §13.1). */
export const M0A_WAVE_LOADS: readonly { readonly loadX100: number; readonly peakX100: number | null }[] = [
  { loadX100: 60, peakX100: null },
  { loadX100: 75, peakX100: null },
  { loadX100: 85, peakX100: null },
  { loadX100: 93, peakX100: 115 },
  { loadX100: 100, peakX100: null },
  { loadX100: 113, peakX100: 130 },
];

/** Tru Đàn: at most 2 calls a wave × 3 Phong Lang (canon §10.4). */
const HOWL_MAX_W100 = 2 * 3 * 100;

type Row = readonly [atMs: number, gate: GateId, what: "cluster" | BeastId | GeneralId, count?: number, elite?: EliteTraitId];

/** One group from a compact row: "cluster" is a Thạch Thử cluster of 7; the general walks alone. */
function group([atMs, gate, what, count = 1, elite]: Row): WaveGroupDef {
  if (what === "cluster") return { atMs, gate, species: "thach-thu", count: 7, cluster: true };
  if (what === "lang-dau-dan") return { atMs, gate, species: what, count: 1, general: true };
  return elite ? { atMs, gate, species: what, count, elite } : { atMs, gate, species: what, count };
}

function wave(id: string, durationMs: number, peaks: readonly (readonly [fromMs: number, toMs: number])[], summonMaxW100: number, rows: readonly Row[]): WaveDef {
  const groups = rows.map(group);
  const gates: GateId[] = [];
  for (const g of groups) if (!gates.includes(g.gate)) gates.push(g.gate);
  return { id, durationMs, gates, peaks: peaks.map(([fromMs, toMs]) => ({ atMs: fromMs, lenMs: toMs - fromMs })), groups, summonMaxW100 };
}

const PL = "phong-lang";
const HN = "hoa-nha";
const NV = "nham-vien";
const TGT = "thiet-giap-tru";
const LDD = "lang-dau-dan";

/** canon §13.3: 4 clusters + 14 Phong Lang + 3 Nham Viên; gate A; 40 s; L 0.60 (peaks at 0.80). */
const WAVE_1 = wave("m0a-w1", 40_000, [[5000, 13_000], [22_000, 30_000]], 0, [
  [0, "A", PL, 3],
  [5300, "A", "cluster"],
  [7600, "A", PL, 4],
  [11_600, "A", NV],
  [14_000, "A", "cluster"],
  [18_200, "A", PL, 4],
  [23_900, "A", "cluster"],
  [26_200, "A", NV],
  [28_200, "A", PL, 3],
  [32_200, "A", "cluster"],
  [36_400, "A", NV],
]);

/** 5 clusters + 16 Phong Lang + 4 Nham Viên + 2 Thiết Giáp Trư; A, B; 45 s; L 0.75 (peaks at 1.00). */
const WAVE_2 = wave("m0a-w2", 45_000, [[4000, 13_000], [24_000, 33_000]], 0, [
  [0, "A", PL, 4],
  [5000, "B", "cluster"],
  [6800, "A", "cluster"],
  [8700, "B", PL, 4],
  [11_900, "A", NV],
  [13_800, "B", TGT],
  [18_100, "A", PL, 4],
  [23_800, "B", NV],
  [25_500, "A", "cluster"],
  [27_300, "B", PL, 4],
  [30_500, "A", TGT],
  [32_900, "B", "cluster"],
  [36_200, "A", NV],
  [39_100, "B", "cluster"],
  [42_400, "A", NV],
]);

/** 6 clusters + 14 Phong Lang + 8 Hỏa Nha + 4 Nham Viên + 3 Thiết Giáp Trư; 1 elite (Phong Lang Cuồng); A, B, sky; 50 s; L 0.85 (peaks at 1.05). */
const WAVE_3 = wave("m0a-w3", 50_000, [[2000, 10_000], [20_000, 28_000], [38_000, 46_000]], 0, [
  [0, "A", PL, 4],
  [3900, "B", PL, 3],
  [6200, "sky", HN, 2],
  [7400, "A", "cluster"],
  [9100, "B", "cluster"],
  [11_500, "A", NV],
  [14_100, "B", TGT],
  [18_000, "sky", HN, 2],
  [20_000, "A", "cluster"],
  [21_800, "B", PL, 4, "cuong"],
  [25_300, "A", PL, 3],
  [27_600, "sky", HN, 2],
  [29_300, "B", "cluster"],
  [32_300, "A", TGT],
  [36_200, "B", NV],
  [38_400, "A", "cluster"],
  [40_200, "B", NV],
  [41_700, "sky", HN, 2],
  [43_000, "A", NV],
  [44_500, "B", TGT],
  [47_300, "A", "cluster"],
]);

/** Lang Đầu Đàn + 7 clusters + 8 Phong Lang + 6 Hỏa Nha + 5 Nham Viên + 4 Thiết Giáp Trư; Tru Đàn ≤ 2; 55 s; L 0.93 (peaks at 1.08, canon 1.15). */
const WAVE_4 = wave("m0a-w4", 55_000, [[3000, 12_000], [21_000, 31_000], [40_000, 49_000]], HOWL_MAX_W100, [
  [0, "A", PL, 4],
  [3800, "B", "cluster"],
  [5500, "sky", HN, 2],
  [6700, "A", "cluster"],
  [8400, "B", NV],
  [9900, "A", TGT],
  [12_200, "B", LDD],
  [24_300, "A", "cluster"],
  [26_100, "B", PL, 4],
  [29_000, "sky", HN, 2],
  [30_200, "A", NV],
  [32_000, "B", "cluster"],
  [34_400, "A", TGT],
  [37_500, "A", "cluster"],
  [39_900, "B", NV],
  [41_400, "sky", HN, 2],
  [42_600, "A", NV],
  [44_100, "B", TGT],
  [46_300, "A", "cluster"],
  [48_000, "B", "cluster"],
  [50_000, "A", NV],
  [52_100, "B", TGT],
]);

/** 9 clusters + 13 Phong Lang + 6 Hỏa Nha + 5 Nham Viên + 5 Thiết Giáp Trư; 2 elites (Trư Thiết Bì, Viên Hồi Nguyên); 55 s; L 1.00 (peaks at 1.08). */
const WAVE_5 = wave("m0a-w5", 55_000, [[2000, 12_000], [21_000, 31_000], [40_000, 50_000]], 0, [
  [0, "A", PL, 4],
  [3300, "B", "cluster"],
  [5000, "sky", HN, 2],
  [6200, "A", "cluster"],
  [7900, "B", PL, 3],
  [10_100, "A", NV],
  [11_600, "B", TGT],
  [14_200, "A", "cluster"],
  [16_300, "B", "cluster"],
  [18_400, "A", PL, 3],
  [21_100, "sky", HN, 2],
  [22_300, "B", TGT, 1, "thiet-bi"],
  [27_300, "A", "cluster"],
  [29_000, "B", NV, 1, "hoi-nguyen"],
  [31_500, "A", TGT],
  [34_200, "B", "cluster"],
  [36_200, "A", "cluster"],
  [38_300, "B", PL, 3],
  [40_800, "sky", HN, 2],
  [42_000, "A", NV],
  [43_500, "B", "cluster"],
  [45_200, "A", TGT],
  [47_400, "B", NV],
  [48_900, "A", "cluster"],
  [50_800, "B", TGT],
  [53_500, "A", NV],
]);

/** Lang Đầu Đàn + 11 clusters + 10 Phong Lang + 8 Hỏa Nha + 7 Nham Viên + 4 Thiết Giáp Trư; 2 elites (Phong Lang Cuồng, Viên Thiết Bì); Tru Đàn ≤ 2; 60 s; L 1.13 (peaks at 1.22, canon 1.30). */
const WAVE_6 = wave("m0a-w6", 60_000, [[2000, 12_000], [21_000, 31_000], [40_000, 50_000]], HOWL_MAX_W100, [
  [0, "A", PL, 4, "cuong"],
  [3300, "B", "cluster"],
  [4800, "sky", HN, 2],
  [5900, "A", "cluster"],
  [7400, "B", NV],
  [8700, "A", "cluster"],
  [10_200, "B", TGT],
  [12_200, "A", NV],
  [13_800, "B", "cluster"],
  [15_600, "A", LDD],
  [25_000, "B", PL, 3],
  [26_900, "sky", HN, 2],
  [28_000, "A", "cluster"],
  [29_500, "B", "cluster"],
  [31_000, "A", NV, 1, "thiet-bi"],
  [35_000, "B", TGT],
  [37_400, "A", "cluster"],
  [39_200, "B", "cluster"],
  [40_800, "A", PL, 3],
  [42_800, "sky", HN, 2],
  [43_800, "B", NV],
  [45_100, "A", "cluster"],
  [46_600, "B", "cluster"],
  [48_200, "A", NV],
  [49_500, "B", TGT],
  [51_700, "A", TGT],
  [54_000, "sky", HN, 2],
  [55_300, "B", NV],
  [56_800, "A", "cluster"],
  [58_600, "B", NV],
]);

/** The six waves of canon §13.3. */
export const M0A_WAVES: readonly WaveDef[] = [WAVE_1, WAVE_2, WAVE_3, WAVE_4, WAVE_5, WAVE_6];
