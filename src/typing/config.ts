/**
 * Tu Tiên Thủ Ải numbers for kit/typing (canon §6.1–6.2): TD 1A.6 defaults
 * changed where the canon differs. Tier-1 first letters only (tier 2 never
 * opens: chữ sống ≤ 8, canon §6.2), no avoided letters (A counts every
 * letter), letter rest 1 s, words of 3–8 letters, edit distance checked on
 * every length the match deals, Esc keeps a word's wrong keys (D19,
 * `unlockErrors: "keep"`). No lock protection (no number in the canon for the
 * battle); a lock lost to another source still forgives the next stray key
 * (kit session). The live-word cap and grades are this game's own
 * (typing/fallback.ts, typing/grading.ts). Pure.
 * Owner: Lane 3.
 */
import { LETTERS, SIM } from "../content/rules";
import { TD_TYPING, compileTyping, typingConfig, type TypingConfig, type TypingRules } from "../kit/typing/config";

/** Kit word kinds (index = priority); none reserves letters. */
export const IC_KINDS = ["urgent", "seal", "slot"] as const;
export type IcKind = (typeof IC_KINDS)[number];

export const IC_TYPING: TypingConfig = typingConfig(TD_TYPING, {
  tickHz: SIM.tickHz,
  kinds: IC_KINDS,
  reserveKinds: [],
  words: { min: LETTERS.minLen, max: LETTERS.maxLen },
  letters: {
    cooldownS: LETTERS.restMs / 1000,
    reserve: 0,
    avoid: "",
    avoidUntilLevel: 0,
    // Tier 2 would need "no free letter" or an early level: neither can happen with these numbers.
    tier2EarlyFree: 0,
    tier2EarlyMaxLevel: -1,
    maxEditCheckLen: LETTERS.maxLen,
    minWordsPerLetter: LETTERS.minWordsPerLetter,
  },
  router: { unlockErrors: "keep" },
});

/** IC_TYPING compiled once: times in ticks, kinds as indices. */
export const IC_RULES: TypingRules = compileTyping(IC_TYPING);

/** Kit kind index of a Bàn Quyết entry. */
export const kindIndex = (kind: IcKind): number => IC_RULES.kind[kind]!;
