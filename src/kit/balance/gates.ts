// Source: new for the kit, from docs/games/BALANCE.md §7 (log fixes in shared/game-kit/DRIFT.md)
/**
 * Balance gates B1–B9 (BALANCE.md §7). A game runs its bot × mode × seed
 * matrix, folds each cell's runs with `summarizeRuns`, and `runGates` returns
 * pass / fail / skip with the measured numbers; `formatGates` prints the same
 * table in every game's balance report. A gate with missing cells is "skip",
 * never "pass". Fractions are ‰ as everywhere in this module.
 */
import { BANDS, MODE_LABELS, METRIC_LABELS, scoreBand, type Band, type BandMetric, type BandMode } from "./bands";
import type { PaceSummary } from "./director";
import type { FlowSummary } from "./flow";
import { mean, median } from "./math";

/** One stage run of one bot in one mode. */
export type RunRecord = {
  readonly flow: FlowSummary;
  readonly pace?: PaceSummary;
  /** Mean seconds from a foe appearing to its death (B4). */
  readonly killSeconds?: number;
  /** The game's own learning gate held in this run (B8). */
  readonly learnOk?: boolean;
};

/** A bot in a mode over its seeds. Bot ids are free strings: standard ids, or variants like "standard@poor". */
export type BotModeSummary = {
  readonly bot: string;
  readonly mode: BandMode;
  /** The pace director was on. */
  readonly director: boolean;
  readonly runs: number;
  /** Win rate ‰. */
  readonly win: number;
  /** Median HP left ‰ (losses count as 0). */
  readonly s: number;
  /** Mean P, I, O ‰. */
  readonly p: number;
  readonly i: number;
  readonly o: number;
  /** Mean near misses a stage. */
  readonly n: number;
  /** Median of the runs' Q ‰; null with no kills. */
  readonly q: number | null;
  readonly support: number | null;
  readonly killSeconds: number | null;
  readonly stepsPerWave: number | null;
  readonly maxWaveSteps: number | null;
  readonly spawnMin: number | null;
  readonly spawnMax: number | null;
  /** All runs passed the learning gate; null when not reported. */
  readonly learnOk: boolean | null;
};

const nonNull = <T>(values: readonly (T | null | undefined)[]): T[] => values.filter((value): value is T => value !== null && value !== undefined);

export function summarizeRuns(bot: string, mode: BandMode, runs: readonly RunRecord[], director = true): BotModeSummary {
  const flows = runs.map((run) => run.flow);
  const paces = nonNull(runs.map((run) => run.pace));
  const learn = nonNull(runs.map((run) => run.learnOk));
  const round = (value: number | null): number => (value === null ? 0 : Math.round(value));
  const roundOrNull = (value: number | null): number | null => (value === null ? null : Math.round(value));
  return {
    bot,
    mode,
    director,
    runs: runs.length,
    win: runs.length > 0 ? Math.round((flows.filter((flow) => flow.outcome === "won").length * 1000) / runs.length) : 0,
    s: round(median(flows.map((flow) => flow.s))),
    p: round(mean(flows.map((flow) => flow.p))),
    i: round(mean(flows.map((flow) => flow.i))),
    o: round(mean(flows.map((flow) => flow.o))),
    n: mean(flows.map((flow) => flow.n)) ?? 0,
    q: roundOrNull(median(nonNull(flows.map((flow) => flow.q)))),
    support: roundOrNull(mean(nonNull(flows.map((flow) => flow.support)))),
    killSeconds: mean(nonNull(runs.map((run) => run.killSeconds))),
    stepsPerWave: mean(paces.map((pace) => pace.stepsPerWave)),
    maxWaveSteps: paces.length > 0 ? Math.max(...paces.map((pace) => pace.maxWaveSteps)) : null,
    spawnMin: paces.length > 0 ? Math.min(...paces.map((pace) => pace.spawnMin)) : null,
    spawnMax: paces.length > 0 ? Math.max(...paces.map((pace) => pace.spawnMax)) : null,
    learnOk: learn.length > 0 ? learn.every(Boolean) : null,
  };
}

export const GATE_IDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"] as const;
export type GateId = (typeof GATE_IDS)[number];

export const GATE_NAMES: { readonly [G in GateId]: string } = {
  B1: "Cùng vùng cuốn",
  B2: "Không quá dễ",
  B3: "Không quá khó",
  B4: "Chuẩn thắng ẩu",
  B5: "Gõ là sức chính",
  B6: "Chiến thuật có nghĩa",
  B7: "Bộ điều nhịp nhẹ tay",
  B8: "Học không bị lấn",
  B9: "Khớp người thật",
};

export type GateStatus = "pass" | "fail" | "skip";
export type GateCheck = { readonly label: string; readonly measured: string; readonly threshold: string; readonly pass: boolean };
export type GateResult = { readonly id: GateId; readonly name: string; readonly status: GateStatus; readonly checks: readonly GateCheck[]; readonly missing: readonly string[] };

/** A human play-test and the bot run with the same profile on the same stage (B9). */
export type HumanMatch = { readonly label: string; readonly human: BandValuesLike; readonly bot: BandValuesLike };
type BandValuesLike = { readonly [M in BandMetric]?: number | null };

export type GateOptions = {
  readonly bands?: { readonly [M in BandMode]: Band };
  /** B1: bots that must sit in the Balanced band. */
  readonly flowBots?: readonly string[];
  /** B5: modes where the no-type bot may win (typing-defense: ["relax"]), and its highest allowed win rate ‰. */
  readonly noTypeExempt?: readonly BandMode[];
  readonly noTypeMaxWin?: number;
  /** B6: the same E and a with good and poor tactics. */
  readonly tacticsPair?: readonly [good: string, poor: string];
  /** B7: highest mean steps a wave; spawn scale cap ‰. */
  readonly maxStepsPerWave?: number;
  readonly spawnCap?: number;
  /** B9: allowed deviation (15 %) relative to max(|human|, floor); floor 200 ‰ for fractions, 1 for N. */
  readonly humanTolerance?: number;
  readonly human?: readonly HumanMatch[];
};

export type GateInput = { readonly summaries: readonly BotModeSummary[]; readonly options?: GateOptions };

const FLOW_BOTS = ["novice", "steady", "standard", "skilled", "sloppy", "fast"];
const B1_METRICS: readonly BandMetric[] = ["win", "s", "p", "i", "o"];

/** ‰ as "75 %" (one decimal below 10 %). */
export const pct = (milli: number | null): string => (milli === null ? "—" : milli < 100 && milli % 10 !== 0 ? (milli / 10).toFixed(1) + " %" : Math.round(milli / 10) + " %");

function find(summaries: readonly BotModeSummary[], bot: string, mode: BandMode, director = true): BotModeSummary | undefined {
  return summaries.find((row) => row.bot === bot && row.mode === mode && row.director === director);
}

function result(id: GateId, checks: GateCheck[], missing: string[]): GateResult {
  const status: GateStatus = missing.length > 0 || checks.length === 0 ? "skip" : checks.every((check) => check.pass) ? "pass" : "fail";
  return { id, name: GATE_NAMES[id], status, checks, missing };
}

function inBandChecks(row: BotModeSummary, band: Band, label: string): GateCheck {
  const score = scoreBand(row, band, B1_METRICS);
  const off = score.rows.filter((entry) => entry.verdict !== "in");
  return {
    label,
    measured: B1_METRICS.map((metric) => METRIC_LABELS[metric] + " " + pct(row[metric] as number)).join(", "),
    threshold: off.length === 0 ? "trong dải" : "lệch: " + off.map((entry) => METRIC_LABELS[entry.metric] + " " + (entry.verdict === "below" ? "thấp" : entry.verdict === "above" ? "cao" : "thiếu")).join(", "),
    pass: score.inBand,
  };
}

export function gate(id: GateId, input: GateInput): GateResult {
  const all = input.summaries;
  const options = input.options ?? {};
  const bands = options.bands ?? BANDS;
  const checks: GateCheck[] = [];
  const missing: string[] = [];
  const need = (bot: string, mode: BandMode, director = true): BotModeSummary | undefined => {
    const row = find(all, bot, mode, director);
    if (row === undefined) missing.push(`${bot} · ${MODE_LABELS[mode]}${director ? "" : " · tắt nhịp"}`);
    return row;
  };

  switch (id) {
    case "B1":
      for (const bot of options.flowBots ?? FLOW_BOTS) {
        const row = need(bot, "balanced");
        if (row !== undefined) checks.push(inBandChecks(row, bands.balanced, bot));
      }
      break;
    case "B2":
      for (const row of all.filter((entry) => entry.mode === "balanced" && entry.director)) {
        checks.push({ label: row.bot, measured: `S ${pct(row.s)}, I ${pct(row.i)}`, threshold: "không đồng thời S ≥ 90 % và I ≥ 20 %", pass: !(row.s >= 900 && row.i >= 200) });
      }
      break;
    case "B3": {
      const novice = need("novice", "balanced");
      const child = need("child", "relax");
      if (novice !== undefined) checks.push({ label: "novice · Cân bằng", measured: "thắng " + pct(novice.win), threshold: "≥ 70 %", pass: novice.win >= 700 });
      if (child !== undefined) checks.push({ label: "child · Thư giãn", measured: "thắng " + pct(child.win), threshold: "≥ 85 %", pass: child.win >= 850 });
      break;
    }
    case "B4": {
      const steady = need("steady", "balanced");
      const sloppy = need("sloppy", "balanced");
      const standard = need("standard", "balanced");
      if (steady !== undefined && sloppy !== undefined) checks.push({ label: "steady vs sloppy", measured: `S ${pct(steady.s)} vs ${pct(sloppy.s)}`, threshold: "S chậm chắc > S ẩu", pass: steady.s > sloppy.s });
      if (standard !== undefined && sloppy !== undefined) {
        if (standard.killSeconds !== null && sloppy.killSeconds !== null) {
          checks.push({ label: "standard vs sloppy", measured: `hạ quái ${standard.killSeconds.toFixed(2)} s vs ${sloppy.killSeconds.toFixed(2)} s`, threshold: "chuẩn nhanh hơn", pass: standard.killSeconds < sloppy.killSeconds });
        } else if (standard.q !== null && sloppy.q !== null) {
          checks.push({ label: "standard vs sloppy", measured: `Q ${pct(standard.q)} vs ${pct(sloppy.q)}`, threshold: "chuẩn hạ sớm hơn (Q thấp hơn)", pass: standard.q < sloppy.q });
        } else missing.push("standard/sloppy · thời gian hạ quái hoặc Q");
      }
      break;
    }
    case "B5": {
      const exempt = options.noTypeExempt ?? [];
      const maxWin = options.noTypeMaxWin ?? 0;
      for (const mode of ["relax", "balanced", "challenge"] as const) {
        if (exempt.includes(mode)) continue;
        const row = need("no-type", mode);
        if (row !== undefined) checks.push({ label: "no-type · " + MODE_LABELS[mode], measured: "thắng " + pct(row.win), threshold: "≤ " + pct(maxWin), pass: row.win <= maxWin });
      }
      break;
    }
    case "B6": {
      const [good, poor] = options.tacticsPair ?? ["standard@good", "standard@poor"];
      for (const mode of ["balanced", "challenge"] as const) {
        const high = need(good, mode);
        const low = need(poor, mode);
        if (high !== undefined && low !== undefined) {
          checks.push({ label: MODE_LABELS[mode], measured: `thắng ${pct(high.win)} vs ${pct(low.win)}`, threshold: "Tốt hơn Kém ≥ 10 điểm %", pass: high.win - low.win >= 100 });
        }
      }
      break;
    }
    case "B7": {
      const maxSteps = options.maxStepsPerWave ?? 3;
      const cap = options.spawnCap ?? 150;
      for (const row of all.filter((entry) => entry.director)) {
        if (row.stepsPerWave === null || row.spawnMin === null || row.spawnMax === null) continue;
        const label = `${row.bot} · ${MODE_LABELS[row.mode]}`;
        checks.push({ label, measured: `${row.stepsPerWave.toFixed(2)} bậc/đợt, khoảng sinh ${pct(row.spawnMin)}–${pct(row.spawnMax)}`, threshold: `≤ ${maxSteps} bậc/đợt, trong ±${pct(cap)}`, pass: row.stepsPerWave <= maxSteps && row.spawnMin >= 1000 - cap && row.spawnMax <= 1000 + cap });
      }
      if (checks.length === 0) missing.push("nhật ký bộ điều nhịp");
      const off = need("standard", "balanced", false);
      if (off !== undefined) checks.push(inBandChecks(off, bands.balanced, "standard · tắt nhịp"));
      break;
    }
    case "B8":
      for (const row of all.filter((entry) => entry.learnOk !== null)) checks.push({ label: `${row.bot} · ${MODE_LABELS[row.mode]}`, measured: row.learnOk ? "đạt" : "trượt", threshold: "cổng học của game", pass: row.learnOk === true });
      if (checks.length === 0) missing.push("cổng học của game");
      break;
    case "B9": {
      const tolerance = options.humanTolerance ?? 0.15;
      for (const match of options.human ?? []) {
        const off: string[] = [];
        const measured: string[] = [];
        for (const metric of ["s", "p", "i", "o", "n", "q"] as const) {
          const human = match.human[metric];
          const bot = match.bot[metric];
          if (human === null || human === undefined || bot === null || bot === undefined) continue;
          const allowed = tolerance * Math.max(Math.abs(human), metric === "n" ? 1 : 200);
          measured.push(`${METRIC_LABELS[metric]} ${metric === "n" ? human.toFixed(1) : pct(human)}/${metric === "n" ? bot.toFixed(1) : pct(bot)}`);
          if (Math.abs(bot - human) > allowed) off.push(METRIC_LABELS[metric]);
        }
        checks.push({ label: match.label, measured: measured.join(", "), threshold: off.length === 0 ? `lệch ≤ ${Math.round(tolerance * 100)} %` : "lệch: " + off.join(", "), pass: off.length === 0 });
      }
      if (checks.length === 0) missing.push("buổi chơi thử của người thật");
      break;
    }
  }
  return result(id, checks, missing);
}

export function runGates(input: GateInput): GateResult[] {
  return GATE_IDS.map((id) => gate(id, input));
}

const STATUS_TEXT: { readonly [S in GateStatus]: string } = { pass: "ĐẠT", fail: "TRƯỢT", skip: "THIẾU SỐ" };

/** The shared Markdown table for a game's balance report. */
export function formatGates(results: readonly GateResult[]): string {
  const cell = (text: string): string => text.replace(/\|/g, "\\|");
  const lines = ["| # | Cổng | Kết quả | Số đo |", "|---|---|---|---|"];
  for (const row of results) {
    const parts = row.checks.map((check) => `${check.pass ? "✓" : "✗"} ${check.label}: ${check.measured} (${check.threshold})`);
    if (row.missing.length > 0) parts.push("thiếu: " + row.missing.join(", "));
    lines.push(`| ${row.id} | ${row.name} | ${STATUS_TEXT[row.status]} | ${cell(parts.join("; ")) || "—"} |`);
  }
  return lines.join("\n");
}
