// Source: games/dragon-hold/scripts/balance/bot.ts @06cd4e6 BOTS, standardBot (adapted: canon §18.3's table on the kit's STANDARD_BOTS: Đứng yên is the walking policy of the 9 first bots (D46), Cơ động a variant of Chuẩn; B6 and B7 variants; buying by tactics; learning answers by accuracy)
/**
 * The bots of canon §18.3 (BALANCE.md §6): the kit's 9 standard bots, each
 * with the walking policy **Đứng yên** (stands on the Tâm nhãn, never moves,
 * ô 3 is Hộ thân; D46), plus Chuẩn variants: tactics Tốt and Kém (B6), the
 * pace director off (B7), and **Cơ động** (walks to keep the crowd within
 * 12 m and out of telegraphs; CB4, and its P, I, O are printed to compare).
 * Owner: Lane 7.
 */
import { PACE } from "../../src/content/rules";
import { STANDARD_BOTS, type BotId, type BotSpec as KitBotSpec, type Tactics } from "../../src/kit/balance/typist";

export type MovePolicy = "stand" | "mobile";
/** none: never buys (Chỉ gõ); best: the no-type bot's best buys; poor / fair / good by tactics. */
export type BuyPlan = "none" | "poor" | "fair" | "good" | "best";

export interface IcBot {
  /** Gate id: a kit id ("standard") or a variant ("standard@good", "standard@mobile", "standard@off"). */
  readonly id: string;
  /** The id the kit's gates look up (B7's control run is "standard" with the director off). */
  readonly gateId: string;
  readonly label: string;
  readonly kit: KitBotSpec;
  readonly tactics: Tactics;
  readonly move: MovePolicy;
  readonly buy: BuyPlan;
  /** The pace director (header.pacing); B7 also runs Chuẩn without it. */
  readonly director: boolean;
  /** Chance of a right answer in Học trước and Thẻ Ôn (dragon-hold's rule: by accuracy). */
  readonly recall: number;
}

const kitBot = (id: BotId): KitBotSpec => {
  const row = STANDARD_BOTS.find((bot) => bot.id === id);
  if (!row) throw new Error("bots: no kit bot " + id);
  return row;
};

function bot(id: string, label: string, kit: KitBotSpec, extra: Partial<Pick<IcBot, "tactics" | "move" | "director" | "gateId">> = {}): IcBot {
  const tactics = extra.tactics ?? kit.tactics;
  const typing = kit.wpm > 0;
  const buy: BuyPlan = tactics === "none" ? "none" : !typing ? "best" : tactics === "poor" ? "poor" : tactics === "good" ? "good" : "fair";
  const recall = !typing ? 0 : kit.accuracy >= 0.95 ? 0.85 : kit.accuracy >= 0.9 ? 0.75 : 0.6;
  return { id, gateId: extra.gateId ?? id, label, kit, tactics, move: extra.move ?? "stand", buy, director: extra.director ?? true, recall };
}

const LABEL: Readonly<Record<BotId, string>> = {
  child: "Trẻ em 15 WPM 88 %",
  novice: "Mới 25 WPM 92 %",
  steady: "Chậm chắc 25 WPM 99 %",
  standard: "Chuẩn 35 WPM 95 %",
  skilled: "Khá 50 WPM 96 %",
  sloppy: "Ẩu 50 WPM 85 %",
  fast: "Nhanh 70 WPM 97 %",
  "no-type": "Không gõ",
  "type-only": "Chỉ gõ 35 WPM",
};

/** The 9 first bots (B1–B8), Đứng yên. */
export const FIRST_BOTS: readonly IcBot[] = STANDARD_BOTS.map((row) => bot(row.id, LABEL[row.id] + " · Đứng yên", row));

const standard = kitBot("standard");

/** Chuẩn variants: B6 tactics pair, B7 director off, CB4 Cơ động. */
export const VARIANT_BOTS: readonly IcBot[] = [
  bot("standard@good", "Chuẩn, chiến thuật Tốt", standard, { tactics: "good" }),
  bot("standard@poor", "Chuẩn, chiến thuật Kém", standard, { tactics: "poor" }),
  bot("standard@off", "Chuẩn, tắt bộ điều nhịp", standard, { director: false, gateId: "standard" }),
  bot("standard@mobile", "Chuẩn · Cơ động", standard, { move: "mobile" }),
];

export const ALL_BOTS: readonly IcBot[] = [...FIRST_BOTS, ...VARIANT_BOTS];

export function botById(id: string): IcBot {
  const found = ALL_BOTS.find((row) => row.id === id);
  if (!found) throw new Error("bots: no bot " + id + "; have " + ALL_BOTS.map((row) => row.id).join(", "));
  return found;
}

/** The bot's typing profile in the header: e WPM, a and cv in permille (no-type: the page's "unknown" default speed). */
export function botProfile(row: IcBot): { e: number; a: number; cv: number } {
  if (row.kit.wpm <= 0) return { e: PACE.unknownWpm, a: PACE.defaultAccuracyPm, cv: PACE.defaultCvPm };
  return { e: row.kit.wpm, a: Math.round(row.kit.accuracy * 1000), cv: Math.round(row.kit.cv * 1000) };
}
