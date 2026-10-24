/**
 * UI tokens shared by every battle game (05-presentation §2.2, §4.1, §4.4).
 * Four semantic colours mean the same thing in all games; everything else
 * (palette, frames, icons) belongs to each game.
 */

export const SEMANTIC_COLORS = {
  /** Danger from the enemy: telegraphs, enemy blast zones, the "near" mark on a tag. */
  danger: "#FF4A4A",
  /** Urgent: interrupt words, a trap about to break, a unit about to fall. */
  urgent: "#FFB020",
  /** Money: gold, drops. Never for numbers that are not money. */
  money: "#FFC83A",
  /** Typing power: typed letters, strong hits from clean typing. */
  typing: "#7FF5E0",
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

/** What each semantic colour must never be used for (review checklist). */
export const SEMANTIC_COLOR_FORBIDDEN: Readonly<Record<SemanticColor, string>> = {
  danger: "foliage, flowers, unaffordable prices, our side's spells",
  urgent: "foliage near a path",
  money: "elite tag frames, spells, damage numbers",
  typing: "water near a path, tree canopies",
};

/** Battle font of all four games; the game imports @fontsource/be-vietnam-pro (400, 700, 800). */
export const BATTLE_FONT_FAMILY = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
/** Be Vietnam Pro lacks most IPA glyphs: an IPA-complete font goes first (05 §4.4). */
export const IPA_FONT_FAMILY = '"Noto Sans", "Charis SIL", "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
export const BATTLE_FONT_WEIGHTS = [400, 700, 800] as const;

/** `--ui`: clamp(0.8, min(width / 1600, height / 900), 1.2). */
export function uiScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.min(1.2, Math.max(0.8, Math.min(width / 1600, height / 900)));
}

/** The CSS custom properties the kit defines on :root. */
export const KIT_CSS_VARIABLES: Readonly<Record<string, string>> = {
  "--ui": "1",
  "--kit-danger": SEMANTIC_COLORS.danger,
  "--kit-urgent": SEMANTIC_COLORS.urgent,
  "--kit-money": SEMANTIC_COLORS.money,
  "--kit-typing": SEMANTIC_COLORS.typing,
  "--kit-font-battle": BATTLE_FONT_FAMILY,
  "--kit-font-ipa": IPA_FONT_FAMILY,
  "--kit-learning-bg": "rgba(20, 16, 13, 0.9)",
  "--kit-learning-text": "#FFF4D6",
  "--kit-learning-muted": "#D9CDB0",
  "--kit-z-learning": "40",
};
