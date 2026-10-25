// Tĩnh Tu gates HC4, HC4b, HC5, HC6, HC6b, HC7 (canon §18.4, M0A_PLAN §8)
// over the bot matrix: HumanTypist 15 / 25 / 35 / 60 / 90 WPM × seeds × Nhập
// Môn and Tham Ngộ, the no-typing bot (10 sessions) and the type-everything
// bot (reported against the Chuẩn bot). Bot drafts are dry runs: HC7 also
// proves the page's sender refuses every one of them.
// Owner: Lane 8.
import { GATES, TINH_TU } from "../../src/content/rules";
import { checkDrafts, type DraftCheck, type DraftRecord } from "../../src/tinh-tu/sim/learning";
import type { TinhTuTier } from "../../src/tinh-tu/sim/session";
import { createLearningSender } from "../../src/tinh-tu/ui/sender";
import { HC4_BOTS, NO_TYPE_BOT, SEEDS, STANDARD_BOT, TIERS, TYPE_ALL_BOT, runLesson, type LessonRun, type SessionRun } from "./bot";

export interface GateLine {
  readonly id: "HC4" | "HC4b" | "HC5" | "HC6" | "HC6b" | "HC7";
  readonly pass: boolean;
  readonly value: string;
  readonly threshold: string;
}

export interface Hc4Row {
  readonly bot: string;
  readonly tier: TinhTuTier;
  readonly seeds: number;
  /** Most sessions any seed needed (null: some seed did not reach 100 within 3). */
  readonly maxSessions: number | null;
  readonly meanSessions: number;
  readonly firstScoreMean: number;
  readonly firstCompletedPct: number;
  readonly minhTwicePct: number;
}

export interface TinhTuReport {
  readonly seeds: number;
  readonly gates: readonly GateLine[];
  readonly hc4: readonly Hc4Row[];
  readonly hc4b: {
    readonly noTypeMaxPoints: number;
    readonly perTier: readonly {
      readonly tier: TinhTuTier;
      readonly standardMean: number;
      readonly typeAllMean: number;
      /** 5 Minh + 2 Thường − 3 chọn nhầm before the 40 floor and the 100 cap (the cap hides the difference). */
      readonly standardRawMean: number;
      readonly typeAllRawMean: number;
      readonly typeAllWrongMean: number;
    }[];
  };
  readonly hc5: { readonly sessions: number; readonly clashes: number; readonly minhExpiries: number };
  /** canon §16 schedule: sessions (every bot, the no-typing one too) where a Minh showed fewer than 2 times. */
  readonly minhSchedule: { readonly sessions: number; readonly short: number };
  readonly hc6b: { readonly unlabelledShown: number; readonly tamMaShown: number; readonly wrong: number; readonly wrongUnlabelled: number; readonly typedWords: number; readonly judged: number; readonly misread: number };
  readonly hc7: DraftCheck & { readonly refused: number; readonly queued: number };
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
const pct = (part: number, whole: number): number => (whole === 0 ? 0 : (part * 100) / whole);
const fixed = (value: number, digits = 1): string => value.toFixed(digits);

export function runTinhTuGates(seedCount: number = GATES.seeds, hc6bSessions = 5): TinhTuReport {
  const seeds = SEEDS(seedCount);
  const lessons: LessonRun[] = [];
  const hc4: Hc4Row[] = [];
  for (const target of HC4_BOTS) {
    for (const tier of TIERS) {
      const runs = seeds.map((seed) => runLesson(target, tier, seed, GATES.hc4Sessions + 1, true, "hc4"));
      lessons.push(...runs);
      const needed = runs.map((run) => run.sessionsTo100);
      const first = runs.map((run) => run.sessions[0]!.summary);
      hc4.push({
        bot: target.label,
        tier,
        seeds: runs.length,
        maxSessions: needed.some((value) => value === null) ? null : Math.max(...(needed as number[])),
        meanSessions: mean(needed.map((value) => value ?? GATES.hc4Sessions + 1)),
        firstScoreMean: mean(first.map((summary) => summary.score)),
        firstCompletedPct: pct(first.filter((summary) => summary.completed).length, first.length),
        minhTwicePct: pct(
          runs.flatMap((run) => run.sessions.flatMap((session) => session.summary.minhAppearances)).filter((count) => count >= TINH_TU.minhPerSession).length,
          runs.flatMap((run) => run.sessions.flatMap((session) => session.summary.minhAppearances)).length,
        ),
      });
    }
  }

  // HC4b: no typing never reaches lĩnh ngộ in 10 sessions; type-everything against Chuẩn (report only).
  const noType = TIERS.flatMap((tier) => seeds.map((seed) => runLesson(NO_TYPE_BOT, tier, seed, GATES.hc4bSessions, false, "hc4b")));
  lessons.push(...noType);
  const perTier = TIERS.map((tier) => {
    const standard = seeds.map((seed) => runLesson(STANDARD_BOT, tier, seed, hc6bSessions, false, "hc6b"));
    const typeAll = seeds.map((seed) => runLesson(TYPE_ALL_BOT, tier, seed, 2, false, "hc4b"));
    lessons.push(...standard, ...typeAll);
    const scores = (runs: readonly LessonRun[]) => runs.flatMap((run) => run.sessions.map((session) => session.summary.score));
    const raw = (runs: readonly LessonRun[]) =>
      runs.flatMap((run) =>
        run.sessions.map(({ summary }) => TINH_TU.minhPoints * summary.minh + TINH_TU.thuongPoints * summary.thuong - TINH_TU.wrongPoints * summary.wrong),
      );
    return {
      tier,
      standardMean: mean(scores(standard)),
      typeAllMean: mean(scores(typeAll)),
      standardRawMean: mean(raw(standard)),
      typeAllRawMean: mean(raw(typeAll)),
      typeAllWrongMean: mean(typeAll.flatMap((run) => run.sessions.map((session) => session.summary.wrong))),
      standard,
    };
  });

  const sessions: SessionRun[] = lessons.flatMap((run) => run.sessions);
  const clashes = sessions.reduce((sum, session) => sum + session.clashes, 0);
  const minhExpiries = sessions.reduce((sum, session) => sum + session.summary.expired.minh, 0);
  const minhSchedule = {
    sessions: sessions.length,
    short: sessions.filter((session) => session.summary.minhAppearances.some((count) => count < TINH_TU.minhPerSession)).length,
  };

  // HC6b: the Chuẩn bot in Tham Ngộ (its own longer runs).
  const thamNgo = perTier.find((row) => row.tier === "tham-ngo")!.standard.flatMap((run) => run.sessions);
  const hc6b = {
    unlabelledShown: thamNgo.reduce((sum, session) => sum + session.summary.shown.tamMaUnlabelled, 0),
    tamMaShown: thamNgo.reduce((sum, session) => sum + session.summary.shown.tamMa, 0),
    wrong: thamNgo.reduce((sum, session) => sum + session.summary.wrong, 0),
    wrongUnlabelled: thamNgo.reduce((sum, session) => sum + session.wrongUnlabelled, 0),
    typedWords: thamNgo.reduce((sum, session) => sum + session.summary.minh + session.summary.thuong + session.summary.wrong, 0),
    judged: thamNgo.reduce((sum, session) => sum + session.judged, 0),
    misread: thamNgo.reduce((sum, session) => sum + session.misread, 0),
  };

  // HC6, HC7 over every bot draft (cards and sessions).
  const drafts: DraftRecord[] = lessons.flatMap((run) => [...run.cardDrafts, ...run.sessions.flatMap((session) => session.drafts)]);
  const tamMa = new Set(sessions.flatMap((session) => session.tamMaIds));
  const check = checkDrafts(drafts, tamMa);
  let queued = 0;
  const sender = createLearningSender({ sendAttempt: () => void (queued += 1) }, () => {});
  for (const record of drafts) sender.send(record, 0);

  const noTypeMax = Math.max(...noType.map((run) => run.progress.points));
  const hc4Pass = hc4.every((row) => row.maxSessions !== null && row.maxSessions <= GATES.hc4Sessions);
  const rate = pct(hc6b.wrongUnlabelled, hc6b.unlabelledShown);
  const rulePct = pct(check.ok, check.total);
  const hard = check.hard;
  const gates: GateLine[] = [
    { id: "HC4", pass: hc4Pass, value: "tối đa " + Math.max(...hc4.map((row) => row.maxSessions ?? GATES.hc4Sessions + 1)) + " phiên", threshold: "≤ " + GATES.hc4Sessions + " phiên ở mọi bot, mọi bậc, mọi seed" },
    { id: "HC4b", pass: noTypeMax < TINH_TU.full, value: "bot Không gõ: tối đa " + noTypeMax + " điểm sau " + GATES.hc4bSessions + " phiên", threshold: "không lĩnh ngộ (< " + TINH_TU.full + ")" },
    { id: "HC5", pass: clashes === 0, value: clashes + " lần trong " + sessions.length + " phiên (" + minhExpiries + " Minh hết hạn)", threshold: "0" },
    { id: "HC6", pass: hard.tamMaEvents === 0, value: hard.tamMaEvents + " sự kiện cho từ Tâm ma", threshold: "0 sự kiện học âm từ Tâm ma" },
    { id: "HC6b", pass: hc6b.unlabelledShown > 0 && rate <= GATES.hc6bWrongMaxPct, value: fixed(rate) + " % (" + hc6b.wrongUnlabelled + "/" + hc6b.unlabelledShown + " Tâm ma không nhãn)", threshold: "≤ " + GATES.hc6bWrongMaxPct + " %" },
    {
      id: "HC7",
      pass: rulePct >= GATES.hc7RulePct && hard.hintFalseWhileShown === 0 && hard.minhOrCardWithoutHint === 0 && hard.botNotDryRun === 0 && queued === 0,
      value: fixed(rulePct) + " % đúng luật (" + check.ok + "/" + check.total + "); hintUsed false khi nghĩa hiện: " + hard.hintFalseWhileShown + "; Minh/Khẩu Quyết thiếu hintUsed: " + hard.minhOrCardWithoutHint + "; sự kiện bot vào hàng đợi: " + queued,
      threshold: "≥ " + GATES.hc7RulePct + " % (đích 100 %); cứng: 0, 0, 0",
    },
  ];
  return {
    seeds: seedCount,
    gates,
    hc4,
    hc4b: { noTypeMaxPoints: noTypeMax, perTier: perTier.map(({ standard: _standard, ...row }) => row) },
    hc5: { sessions: sessions.length, clashes, minhExpiries },
    minhSchedule,
    hc6b,
    hc7: { ...check, refused: sender.refused, queued },
  };
}

const TIER_VI: Readonly<Record<TinhTuTier, string>> = { "nhap-mon": "Nhập Môn", "tham-ngo": "Tham Ngộ" };

/** The report in Vietnamese Markdown. */
export function reportMarkdown(report: TinhTuReport): string {
  const lines = [
    "# Tĩnh Tu thử: báo cáo bot (" + report.seeds + " seed)",
    "",
    "| Cổng | Kết quả | Số đo | Ngưỡng |",
    "|---|---|---|---|",
    ...report.gates.map((gate) => "| " + gate.id + " | " + (gate.pass ? "ĐẠT" : "TRƯỢT") + " | " + gate.value + " | " + gate.threshold + " |"),
    "",
    "## HC4 theo bot và bậc",
    "",
    "| Bot | Bậc | Số phiên tối đa tới 100 | TB | Điểm phiên 1 (TB) | Phiên 1 hoàn thành | Minh hiện ≥ 2 lần |",
    "|---|---|---|---|---|---|---|",
    ...report.hc4.map(
      (row) =>
        "| " + row.bot + " | " + TIER_VI[row.tier] + " | " + (row.maxSessions ?? "> 3") + " | " + fixed(row.meanSessions, 2) + " | " + fixed(row.firstScoreMean) + " | " + fixed(row.firstCompletedPct) + " % | " + fixed(row.minhTwicePct) + " % |",
    ),
    "",
    "## HC4b",
    "",
    "- Bot Không gõ: tối đa " + report.hc4b.noTypeMaxPoints + " điểm sau 10 phiên ở cả hai bậc.",
    ...report.hc4b.perTier.map(
      (row) =>
        "- " + TIER_VI[row.tier] + ": điểm phiên TB của bot Chuẩn " + fixed(row.standardMean) + ", của bot gõ mọi chữ " + fixed(row.typeAllMean) +
        "; điểm thô trước sàn 40 và trần 100 (5 Minh + 2 Thường − 3 chọn nhầm) " + fixed(row.standardRawMean) + " so với " + fixed(row.typeAllRawMean) +
        " (chọn nhầm TB " + fixed(row.typeAllWrongMean) + " mỗi phiên). Chỉ báo cáo, không chấm (canon §18.4).",
    ),
    "",
    "## HC5",
    "",
    "- " + report.hc5.clashes + " lần hai Minh hết hạn cách nhau < 1,5 s, trong " + report.hc5.sessions + " phiên (" + report.hc5.minhExpiries + " lần Minh hết hạn).",
    "- Lịch Minh (canon §16, mỗi Minh ≥ 2 lần mỗi phiên): " + report.minhSchedule.short + "/" + report.minhSchedule.sessions + " phiên có Minh hiện dưới 2 lần (mọi bot, kể cả bot Không gõ).",
    "",
    "## HC6b (bot Chuẩn, Tham Ngộ)",
    "",
    "- Tâm ma hiện: " + report.hc6b.tamMaShown + ", trong đó không nhãn: " + report.hc6b.unlabelledShown + ".",
    "- Chọn nhầm: " + report.hc6b.wrong + " (không nhãn: " + report.hc6b.wrongUnlabelled + "); trên mọi Tâm ma: " + fixed(pct(report.hc6b.wrong, report.hc6b.tamMaShown)) + " %; trên mọi từ đã gõ: " + fixed(pct(report.hc6b.wrong, report.hc6b.typedWords)) + " %.",
    "- Lá giấy trơn bot phải xét theo chủ đề: " + report.hc6b.judged + "; đọc nhầm (lỗi đọc 1 − a): " + report.hc6b.misread + ".",
    "",
    "## HC6, HC7",
    "",
    "- Sự kiện nháp của bot: " + report.hc7.total + "; đúng luật: " + report.hc7.ok + "; sự kiện cho từ Tâm ma: " + report.hc7.hard.tamMaEvents + ".",
    "- Bộ gửi của trang từ chối " + report.hc7.refused + " sự kiện của bot; vào hàng đợi: " + report.hc7.queued + ".",
    ...(report.hc7.problems.length === 0 ? ["- Không có sự kiện sai luật."] : ["- Sự kiện sai luật:", ...report.hc7.problems.map((line) => "  - " + line)]),
    "",
  ];
  return lines.join("\n");
}
