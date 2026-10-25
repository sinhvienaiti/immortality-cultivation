// Source: games/dragon-hold/scripts/balance/report.ts @06cd4e6 (adapted: the kit's runGates on the shared bands for B1–B9 (D15), then this game's gates of canon §18.4: CB1–CB6, CB9, HC1–HC3, HC7, HC8; damage shares, ô 1's share per bot, the Cơ động comparison and the extras of M0A_PLAN §6.7)
/**
 * The balance report (canon §18.4, M0A_PLAN §6.7, §7). B1–B9 are graded by
 * the kit's `runGates` on the **shared** bands of BALANCE.md §3 and printed
 * as the gate of record (canon D15); no game-only band is used anywhere.
 * Then the game's gates (thresholds in rules.ts GATES), the per bot × preset
 * table, ô 1's share of typed damage per bot (CB3), Ấn, live words, jams,
 * base-word uses by slot, match length (no panel time), pace steps, the
 * Cơ động bot's P, I, O beside Đứng yên's (compare only), the sim's cost.
 * Markdown (Vietnamese) and JSON.
 * Owner: Lane 7.
 */
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { GATES, LETTERS, SIM_BUDGET } from "../../src/content/rules";
import type { Preset } from "../../src/content/types";
import { BANDS, METRIC_LABELS, MODE_LABELS, rangeText, type BandMode } from "../../src/kit/balance/bands";
import { formatGates, pct, runGates, summarizeRuns, type BotModeSummary, type GateResult, type RunRecord } from "../../src/kit/balance/gates";
import { chargeTicks, msToTicksUp, T, answerLetters } from "../../src/sim/telegraph";
import type { BotRun } from "./bot";
import { ALL_BOTS } from "./bots";

export type RunLite = Omit<BotRun, "header" | "log" | "tail"> & { readonly tail: number; readonly deck: number; readonly allowance: number };

export const lite = (run: BotRun): RunLite => {
  const { header, log: _log, tail, ...rest } = run;
  return { ...rest, tail: tail.length, deck: header.deck.length, allowance: header.newWordAllowance };
};

export const MODE_OF: Readonly<Record<Exclude<Preset, "learn">, BandMode>> = { relax: "relax", balanced: "balanced", challenge: "challenge" };

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
const fmt = (value: number | null, digits = 1): string => (value === null ? "—" : value.toFixed(digits));
const pm = (value: number | null): string => (value === null ? "—" : (value / 10).toFixed(1) + " %");

/** canon §18.4 B8 on drafts: HC1, HC7 (rules ≥ 90 %, hard rules), HC8 at the bot's meeting count; null for a bot that never types. */
export function learnOk(run: RunLite): boolean | null {
  const bot = ALL_BOTS.find((row) => row.id === run.bot);
  if (!bot || bot.kit.wpm <= 0) return null;
  const learn = run.metrics.learn;
  const need = bot.id === "child" ? GATES.hc8Meetings.child : GATES.hc8Meetings.standard;
  const met = need >= 3 ? learn.hc8Met3 : learn.hc8Met2;
  const rules = run.drafts.count === 0 || (run.drafts.count - run.drafts.bad) * 100 >= GATES.hc7RulePct * run.drafts.count;
  const hard = learn.hintHidden === 0 && run.drafts.learnAheadNoHint === 0 && run.drafts.queued === 0 && run.drafts.refused === run.drafts.count;
  return learn.hc1Folded === 0 && learn.hc1LateSlot4 === 0 && rules && hard && met === learn.hc8Words;
}

export function runRecord(run: RunLite): RunRecord {
  const ok = learnOk(run);
  return {
    flow: run.metrics.flow,
    pace: run.metrics.pace,
    ...(run.metrics.killSeconds === null ? {} : { killSeconds: run.metrics.killSeconds }),
    ...(ok === null ? {} : { learnOk: ok }),
  };
}

export interface Cell {
  readonly bot: string;
  readonly gateId: string;
  readonly director: boolean;
  readonly preset: Preset;
  readonly runs: readonly RunLite[];
}

export function cellsOf(runs: readonly RunLite[]): Cell[] {
  const map = new Map<string, RunLite[]>();
  for (const run of runs) {
    const key = run.bot + "|" + run.preset;
    const list = map.get(key) ?? [];
    list.push(run);
    map.set(key, list);
  }
  return [...map.values()].map((list) => ({ bot: list[0]!.bot, gateId: list[0]!.gateId, director: list[0]!.director, preset: list[0]!.preset, runs: list.sort((a, b) => a.seed - b.seed) }));
}

export function kitSummaries(cells: readonly Cell[]): BotModeSummary[] {
  return cells
    .filter((cell) => cell.preset !== "learn")
    // Only the bots the shared gates name (variants by their gate id); Cơ động is compare-only.
    .filter((cell) => !cell.bot.endsWith("@mobile"))
    .map((cell) => summarizeRuns(cell.gateId, MODE_OF[cell.preset as Exclude<Preset, "learn">], cell.runs.map(runRecord), cell.director));
}

export interface GameGate {
  readonly id: string;
  readonly name: string;
  readonly status: "pass" | "fail" | "skip";
  readonly measured: string;
  readonly threshold: string;
}

const find = (cells: readonly Cell[], bot: string, preset: Preset): Cell | undefined => cells.find((cell) => cell.bot === bot && cell.preset === preset);
const winPm = (cell: Cell): number => Math.round((cell.runs.filter((run) => run.result === "victory").length * 1000) / Math.max(1, cell.runs.length));
const gate = (id: string, name: string, threshold: string, measured: string, pass: boolean | null): GameGate => ({ id, name, threshold, measured, status: pass === null ? "skip" : pass ? "pass" : "fail" });

/** CB5 (canon §18.4, PB-28): every typed-answer telegraph charges ≥ T at the longest answer, k ∈ {0.75; 1; 1.30}, 4 presets. */
export function cb5(): { checked: number; short: string[] } {
  const short: string[] = [];
  let checked = 0;
  for (const def of Object.values(TELEGRAPHS)) {
    if (!def.typedAnswer) continue;
    for (const preset of ["relax", "balanced", "challenge", "learn"] as const) {
      for (const kPm of [750, 1000, 1300]) {
        checked += 1;
        const need = msToTicksUp(T(preset, answerLetters(def, preset), 0));
        const got = chargeTicks(def, preset, kPm);
        if (got < need) short.push(def.id + " " + preset + " k" + kPm + ": " + got + " < " + need);
      }
    }
  }
  return { checked, short };
}

export function gameGates(cells: readonly Cell[], all: readonly RunLite[]): GameGate[] {
  const out: GameGate[] = [];
  // CB1: no typing loses every seed before wave 3 ends (Cân bằng, Thử thách); Thư giãn: loses every seed.
  {
    const parts: string[] = [];
    let pass: boolean | null = true;
    for (const preset of ["relax", "balanced", "challenge"] as const) {
      const cell = find(cells, "no-type", preset);
      if (!cell) {
        pass = null;
        continue;
      }
      const lost = cell.runs.filter((run) => run.result === "defeat" && (preset === "relax" || run.endedThrough < GATES.cb1LoseByWave)).length;
      parts.push(MODE_LABELS[preset] + " " + lost + "/" + cell.runs.length);
      if (lost !== cell.runs.length && pass !== null) pass = false;
    }
    out.push(gate("CB1", "Gõ là sức chính", "Không gõ thua 20/20 trước khi hết đợt 3 (Cân bằng, Thử thách); Thư giãn thua 20/20", parts.join(", "), pass));
  }
  // CB2: typed share of the Chuẩn bot at Cân bằng.
  {
    const cell = find(cells, "standard", "balanced");
    const values = cell?.runs.map((run) => run.metrics.shares.typedPm) ?? [];
    const avg = mean(values);
    const min = values.length > 0 ? Math.min(...values) : null;
    out.push(gate("CB2", "Phần gõ", "TB ≥ " + GATES.cb2TypedMinPct + " % (đích ≥ 60 %), không seed < " + GATES.cb2SeedMinPct + " %", "TB " + pm(avg) + ", thấp nhất " + pm(min), avg === null ? null : avg >= GATES.cb2TypedMinPct * 10 && (min ?? 0) >= GATES.cb2SeedMinPct * 10));
  }
  // CB3: ô 1 ≤ 30 % of typed damage for every bot Mới → Nhanh at Cân bằng.
  {
    const parts: string[] = [];
    let pass: boolean | null = true;
    for (const bot of ["novice", "steady", "standard", "skilled", "sloppy", "fast"]) {
      const cell = find(cells, bot, "balanced");
      if (!cell) {
        pass = null;
        continue;
      }
      const avg = mean(cell.runs.map((run) => run.metrics.shares.slot1OfTypedPm)) ?? 0;
      parts.push(bot + " " + pm(avg));
      if (avg > GATES.cb3Slot1MaxPct * 10 && pass !== null) pass = false;
    }
    out.push(gate("CB3", "Ô liên tục có trần", "Ô 1 ≤ " + GATES.cb3Slot1MaxPct + " % sát thương gõ ở mọi bot", parts.join(", "), pass));
  }
  // CB4: Đứng yên vs Cơ động, win gap.
  {
    const stand = find(cells, "standard", "balanced");
    const mobile = find(cells, "standard@mobile", "balanced");
    const pass = stand && mobile ? Math.abs(winPm(stand) - winPm(mobile)) <= GATES.cb4WinGapPct * 10 : null;
    out.push(gate("CB4", "Đứng trận chơi trọn vẹn", "Chênh thắng ≤ " + GATES.cb4WinGapPct + " điểm % (Cân bằng)", stand && mobile ? "Đứng yên " + pm(winPm(stand)) + " vs Cơ động " + pm(winPm(mobile)) : "thiếu", pass));
  }
  // CB5: data (Lane 5's tests check it too).
  {
    const result = cb5();
    out.push(gate("CB5", "Báo trước đủ", "chargeTicks ≥ T, k ∈ {0,75; 1; 1,30}, 4 preset", result.checked + " ca, " + result.short.length + " ngắn" + (result.short.length > 0 ? ": " + result.short.slice(0, 3).join("; ") : ""), result.short.length === 0));
  }
  // CB6: one Cast per finished word, in every run.
  {
    const bad = all.filter((run) => run.metrics.cb6.mismatched > 0 || run.metrics.cb6.duplicates > 0);
    const words = all.reduce((sum, run) => sum + run.metrics.cb6.completed, 0);
    const casts = all.reduce((sum, run) => sum + run.metrics.cb6.casts, 0);
    out.push(gate("CB6", "Không cast đôi", "Mỗi từ xong đúng một Cast; 0 Cast không có từ (mọi lượt; tạm dừng, dừng hình: tests/sim/bot-cb6.test.ts)", words + " từ, " + casts + " Cast, " + bad.length + " lượt lệch", all.length === 0 ? null : bad.length === 0));
  }
  // CB9: the M0a stage takes 9–10.5 minutes with the Chuẩn bot (won runs; no panel time); Trẻ em printed.
  {
    const cell = find(cells, "standard", "balanced");
    const won = cell?.runs.filter((run) => run.result === "victory") ?? [];
    const minutes = mean(won.map((run) => run.metrics.ticks / 3600));
    const child = find(cells, "child", "relax");
    const childWon = child?.runs.filter((run) => run.result === "victory") ?? [];
    const [lo, hi] = GATES.cb9MinutesX10;
    out.push(
      gate(
        "CB9",
        "Thời lượng",
        (lo / 10).toFixed(1) + "–" + (hi / 10).toFixed(1) + " phút (Chuẩn, Cân bằng, lượt thắng)",
        "Chuẩn " + fmt(minutes) + " phút (" + won.length + " lượt thắng; mọi lượt TB " + fmt(mean(cell?.runs.map((run) => run.metrics.ticks / 3600) ?? [])) + "); Trẻ em Thư giãn " + fmt(mean(childWon.map((run) => run.metrics.ticks / 3600))) + " phút thắng, TB " + fmt(mean(child?.runs.map((run) => run.metrics.ticks / 3600) ?? [])),
        cell === undefined ? null : minutes !== null && minutes * 10 >= lo && minutes * 10 <= hi,
      ),
    );
  }
  // HC1: by record: no unrecorded non-base word in a folded slot, Ấn or Tẩy; ô 4's new words only in waves 1–2.
  {
    const folded = all.reduce((sum, run) => sum + run.metrics.learn.hc1Folded, 0);
    const late = all.reduce((sum, run) => sum + run.metrics.learn.hc1LateSlot4, 0);
    const uses = [1, 2, 3, 4, 5, 6, 7].map((slot) => all.reduce((sum, run) => sum + (run.metrics.learn.baseWordUses[slot] ?? 0), 0));
    out.push(gate("HC1", "Từ mới không ở ô gấp", "0 (theo bản ghi); ô 4 nhận từ mới chỉ ở đợt 1–2", folded + " ở ô gấp, " + late + " ô 4 sau đợt 2; từ nền theo ô 1–5, Ấn, Tẩy: " + uses.join(" / "), all.length === 0 ? null : folded === 0 && late === 0));
  }
  // HC2: live words ≤ the preset cap every tick; no tier-2 first letter.
  {
    const parts: string[] = [];
    let pass: boolean | null = all.length === 0 ? null : true;
    for (const preset of ["relax", "balanced", "challenge", "learn"] as const) {
      const runs = all.filter((run) => run.preset === preset);
      if (runs.length === 0) continue;
      const most = Math.max(...runs.map((run) => run.metrics.learn.hc2MaxLive));
      const over = runs.reduce((sum, run) => sum + run.metrics.learn.hc2Over, 0);
      const tier2 = runs.reduce((sum, run) => sum + run.metrics.learn.hc2Tier2, 0);
      parts.push(preset + " tối đa " + most + "/" + LETTERS.liveCap[preset] + (over > 0 ? " (" + over + " tick vượt)" : "") + (tier2 > 0 ? ", bậc 2 " + tier2 : ""));
      if (over > 0 || tier2 > 0 || most > LETTERS.liveCap[preset]) pass = false;
    }
    out.push(gate("HC2", "Trần chữ sống", "≤ 8 (Cân bằng, Thử thách), ≤ 5 (Thư giãn, Học); 0 chữ đầu bậc 2", parts.join("; "), pass));
  }
  // HC3: Trẻ em wins ≥ 85 % at Thư giãn.
  {
    const cell = find(cells, "child", "relax");
    out.push(gate("HC3", "Trẻ em đi được", "Thắng ≥ " + GATES.hc3WinPct + " % (Thư giãn)", cell ? "thắng " + pm(winPm(cell)) : "thiếu", cell ? winPm(cell) >= GATES.hc3WinPct * 10 : null));
  }
  // HC7: learning events by rule on the drafts (Chuẩn × 20 seeds at Cân bằng; every bot printed).
  {
    const cell = find(cells, "standard", "balanced");
    const runs = cell?.runs ?? [];
    const count = runs.reduce((sum, run) => sum + run.drafts.count, 0);
    const bad = runs.reduce((sum, run) => sum + run.drafts.bad, 0);
    const hidden = all.reduce((sum, run) => sum + run.metrics.learn.hintHidden, 0);
    const ahead = all.reduce((sum, run) => sum + run.drafts.learnAheadNoHint, 0);
    const queued = all.reduce((sum, run) => sum + run.drafts.queued, 0);
    const offered = all.reduce((sum, run) => sum + run.drafts.count, 0);
    const refused = all.reduce((sum, run) => sum + run.drafts.refused, 0);
    const okPct = count > 0 ? ((count - bad) * 100) / count : null;
    out.push(
      gate(
        "HC7",
        "Sự kiện học đúng luật",
        "≥ " + GATES.hc7RulePct + " % đúng luật (Chuẩn × 20 seed); cứng: 0 hintUsed false khi nghĩa hiện, Học trước luôn hintUsed, 0 sự kiện bot vào hàng đợi",
        fmt(okPct) + " % của " + count + " nháp (" + bad + " sai); nghĩa hiện mà hintUsed false: " + hidden + "; Học trước thiếu hintUsed: " + ahead + "; vào hàng đợi " + queued + ", hàng đợi từ chối " + refused + "/" + offered,
        cell === undefined ? null : (okPct ?? 100) >= GATES.hc7RulePct && hidden === 0 && ahead === 0 && queued === 0 && refused === offered,
      ),
    );
  }
  // HC8: each new word met ≥ 3 times (≥ 45 s apart, before wave 4) in 100 % of Chuẩn runs; ≥ 2 for Trẻ em.
  {
    const std = find(cells, "standard", "balanced");
    const child = find(cells, "child", "relax");
    const stdOk = std?.runs.filter((run) => run.metrics.learn.hc8Met3 === run.metrics.learn.hc8Words).length ?? 0;
    const childOk = child?.runs.filter((run) => run.metrics.learn.hc8Met2 === run.metrics.learn.hc8Words).length ?? 0;
    const short = (std?.runs ?? []).flatMap((run) => run.metrics.learn.hc8Short.map((word) => run.seed + ":" + word)).slice(0, 6);
    out.push(
      gate(
        "HC8",
        "Từ mới gặp lại",
        "≥ 3 lần ở 100 % lượt Chuẩn; ≥ 2 lần ở Trẻ em",
        "Chuẩn " + stdOk + "/" + (std?.runs.length ?? 0) + ", Trẻ em " + childOk + "/" + (child?.runs.length ?? 0) + (short.length > 0 ? "; thiếu (seed:từ:gặp đủ khoảng/gặp): " + short.join(", ") : ""),
        std && child ? stdOk === std.runs.length && childOk === child.runs.length : null,
      ),
    );
  }
  // canon §10.1 (Lane 5's property, with bots): no beast ever aims at a real player.
  {
    const ticks = all.reduce((sum, run) => sum + run.metrics.targetsPlayer, 0);
    out.push(gate("§10.1", "Không thú nào nhắm người thật", "0 (mọi bot, mọi seed)", ticks + " tick-thú nhắm người thật trong " + all.length + " lượt", all.length === 0 ? null : ticks === 0));
  }
  return out;
}

export function formatGameGates(gates: readonly GameGate[]): string {
  const cell = (text: string): string => text.replace(/\|/g, "\\|");
  const status = { pass: "ĐẠT", fail: "TRƯỢT", skip: "THIẾU SỐ" } as const;
  return ["| # | Cổng | Kết quả | Số đo | Ngưỡng |", "|---|---|---|---|---|", ...gates.map((g) => `| ${g.id} | ${g.name} | ${status[g.status]} | ${cell(g.measured)} | ${cell(g.threshold)} |`)].join("\n");
}

/** One row per bot × preset. */
export function cellRow(cell: Cell): string {
  const runs = cell.runs;
  const flows = runs.map((run) => run.metrics.flow);
  const m = (pick: (run: RunLite) => number | null): number | null => mean(runs.map(pick).filter((value): value is number => value !== null));
  const minutes = m((run) => run.metrics.ticks / 3600);
  const won = runs.filter((run) => run.result === "victory").length;
  return [
    cell.bot + (cell.director ? "" : " (tắt nhịp)"),
    MODE_LABELS[MODE_OF[cell.preset as Exclude<Preset, "learn">] ?? "relax"],
    String(runs.length),
    pm((won * 1000) / Math.max(1, runs.length)),
    pm(m((run) => run.metrics.flow.s)),
    pm(mean(flows.map((flow) => flow.p))),
    pm(mean(flows.map((flow) => flow.i))),
    pm(mean(flows.map((flow) => flow.o))),
    fmt(mean(flows.map((flow) => flow.n)), 2),
    pm(mean(flows.map((flow) => flow.q).filter((q): q is number => q !== null))),
    fmt(m((run) => run.metrics.killSeconds), 1),
    fmt(minutes, 1),
    fmt(m((run) => run.endedThrough), 1),
    pm(m((run) => run.metrics.shares.typedPm)),
    pm(m((run) => run.metrics.shares.autoPm)),
    pm(m((run) => run.metrics.shares.supportPm)),
    pm(m((run) => run.metrics.shares.slot1OfTypedPm)),
    fmt(m((run) => run.metrics.seals.done), 1) + "/" + fmt(m((run) => run.metrics.seals.dealt), 1),
    String(Math.max(...runs.map((run) => run.metrics.learn.hc2MaxLive))),
    fmt(m((run) => run.metrics.jams.firstLetter), 1) + " / " + fmt(m((run) => run.metrics.jams.fallback), 1),
    fmt(m((run) => run.metrics.pace.steps), 1),
  ].join(" | ");
}

export const CELL_HEADER =
  "| Bot | Preset | Lượt | Thắng | Biên S | P | I | O | N | Q | Hạ thú (s) | Phút | Đợt xong | Gõ | Đánh nền | Hỗ trợ | Ô 1/gõ | Ấn xong/cấp | Chữ sống max | Nghẽn chữ đầu / nghẽn | Bước nhịp |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";

export interface ReportInput {
  readonly runs: readonly RunLite[];
  readonly seeds: number;
  readonly base: number;
  readonly wallS: number;
  readonly jobs: number;
  readonly notes?: readonly string[];
}

export interface Report {
  readonly bGates: GateResult[];
  readonly gates: GameGate[];
  readonly summaries: BotModeSummary[];
  readonly markdown: string;
}

export function buildReport(input: ReportInput): Report {
  const cells = cellsOf(input.runs);
  const summaries = kitSummaries(cells);
  const bGates = runGates({ summaries });
  const gates = gameGates(cells, input.runs);
  const lines: string[] = [];
  lines.push("# Báo cáo cân bằng M0a (bot, `pnpm ic:balance`)");
  lines.push("");
  lines.push("Seed " + input.base + "…" + (input.base + input.seeds - 1) + " (" + input.seeds + " seed mỗi bot, mỗi preset), " + input.runs.length + " lượt, " + input.jobs + " tiến trình, " + input.wallS.toFixed(0) + " s.");
  for (const note of input.notes ?? []) lines.push("- " + note);
  lines.push("");
  lines.push("## Cổng chung B1–B9 (dải chung BALANCE §3, `runGates` của kit; cổng chính thức, canon D15)");
  lines.push("");
  lines.push(formatGates(bGates));
  lines.push("");
  lines.push("Dải Cân bằng: " + (["win", "s", "p", "i", "o", "n", "q"] as const).map((metric) => METRIC_LABELS[metric] + " " + rangeText(metric, BANDS.balanced[metric])).join(", ") + ".");
  lines.push("");
  lines.push("## Cổng của game (canon §18.4)");
  lines.push("");
  lines.push(formatGameGates(gates));
  lines.push("");
  lines.push("## Bot × preset");
  lines.push("");
  lines.push(CELL_HEADER);
  for (const cell of cells) lines.push("| " + cellRow(cell) + " |");
  lines.push("");
  // Cơ động beside Đứng yên (compare only, D46).
  const stand = cells.find((cell) => cell.bot === "standard" && cell.preset === "balanced");
  const mobile = cells.find((cell) => cell.bot === "standard@mobile" && cell.preset === "balanced");
  if (stand && mobile) {
    const pio = (cell: Cell): string => (["p", "i", "o"] as const).map((key) => key.toUpperCase() + " " + pm(mean(cell.runs.map((run) => run.metrics.flow[key])))).join(", ");
    lines.push("Chuẩn Cơ động (chỉ so, không chấm): " + pio(mobile) + "; Chuẩn Đứng yên: " + pio(stand) + ".");
    lines.push("");
  }
  // Damage by source (Chuẩn, Cân bằng).
  if (stand) {
    const sum = (pick: (run: RunLite) => number): number => stand.runs.reduce((total, run) => total + pick(run), 0);
    const total = sum((run) => Object.values(run.metrics.damage).reduce((a, b) => a + b, 0));
    const part = (label: string, value: number): string => label + " " + ((value * 100) / Math.max(1, total)).toFixed(1) + " %";
    lines.push(
      "Phần sát thương, Chuẩn Cân bằng (canon §7.3): " +
        [
          part("ô 1", sum((run) => run.metrics.damage.slot1)),
          part("ô 2", sum((run) => run.metrics.damage.slot2)),
          part("ô 4", sum((run) => run.metrics.damage.slot4)),
          part("ô 5", sum((run) => run.metrics.damage.slot5)),
          part("Ấn", sum((run) => run.metrics.damage.seal)),
          part("Tẩy", sum((run) => run.metrics.damage.cleanse)),
          part("đánh nền", sum((run) => run.metrics.damage.auto)),
          part("cơ quan", sum((run) => run.metrics.damage.mechanism)),
          part("đan phù", sum((run) => run.metrics.damage.consumable)),
          part("trận pháp", sum((run) => run.metrics.damage.formation)),
        ].join(", ") +
        ".",
    );
    lines.push("");
  }
  // Sim cost.
  const steps = input.runs.map((run) => run.steps).filter((value): value is NonNullable<RunLite["steps"]> => value !== null);
  if (steps.length > 0) {
    const meanUs = mean(steps.map((value) => value.meanUs)) ?? 0;
    const p95 = Math.max(...steps.map((value) => value.p95Us));
    lines.push(
      "Chi phí sim (headless, cả bước gồm `local`): TB " + meanUs.toFixed(1) + " µs/tick, p95 lớn nhất " + p95.toFixed(1) + " µs, ≈ " + Math.round(16_667 / Math.max(1, meanUs)) + "× thời gian thực (ngân sách " + SIM_BUDGET.stepMicros + " µs ở " + SIM_BUDGET.beasts + " thú, ≥ " + SIM_BUDGET.realtimeFactor + "×).",
    );
    lines.push("");
  }
  return { bGates, gates, summaries, markdown: lines.join("\n") };
}

export { pct };
