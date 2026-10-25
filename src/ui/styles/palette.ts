/**
 * The game's UI palette over the kit tokens (canon §21.1, §24): ink panels on
 * dó-paper text, the four semantic colours only from kit/ui (danger = enemy
 * danger, urgent = khẩn, money = Linh Sa and drops, typing = sức gõ), every
 * other colour the game's own and never one of those four.
 * Owner: Lane 6.
 */
import { SEMANTIC_COLORS } from "../../kit/ui/tokens";

export const SEMANTIC = SEMANTIC_COLORS;

export const PALETTE = {
  /** Ink panel behind HUD parts, cards and the shop (same family as the Bàn Quyết). */
  panel: "rgba(14, 18, 24, 0.86)",
  panelSolid: "#11161d",
  panelEdge: "rgba(242, 235, 221, 0.18)",
  text: "#F2EBDD",
  muted: "#CFC6B3",
  faint: "rgba(242, 235, 221, 0.42)",
  /** Sinh lực: jade green (red is the enemy's). */
  life: "#78b98a",
  /** Khiên over Sinh lực: silver blue. */
  shield: "#cfe3ff",
  /** Chân Nguyên fills by typing: the typing colour. */
  chanNguyen: SEMANTIC_COLORS.typing,
  /** Trận Lực: stone ivory; urgent orange under 30 % (canon §22 priority "Trận Lực < 30 %"). */
  heart: "#e8dcc0",
  heartLow: SEMANTIC_COLORS.urgent,
  /** Thế of an elite, general or the Vương: lilac (the crowd's aura tint); broken: ivory. */
  posture: "#c9b3e6",
  postureBroken: "#f1ead6",
  /** Linh Sa (money). */
  money: SEMANTIC_COLORS.money,
  good: "#a9dcb8",
  bad: "#e6a5a0",
} as const;

/**
 * Presentation thresholds (view and HUD agree): Trận Lực under 30 % is the
 * warning of canon §22's priority list ("Trận Lực < 30 %"); the HUD bar and
 * the rune ring turn urgent orange there.
 */
export const HEART_LOW_PCT = 30;

/** PALETTE entries that carry a semantic meaning on purpose (typing power, urgent, money). */
export const SEMANTIC_USES: readonly (keyof typeof PALETTE)[] = ["chanNguyen", "heartLow", "money"];

/** The game's own hex colours (tests: none of them close to a semantic colour). */
export function ownColours(): [string, string][] {
  return Object.entries(PALETTE).filter(([key, value]) => value.startsWith("#") && !SEMANTIC_USES.includes(key as keyof typeof PALETTE));
}
