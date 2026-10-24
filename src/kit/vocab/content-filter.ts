/**
 * Sensitive-word filter (00-canon D15, 01-core-combat-learning §6.1).
 * Entries flagged `sensitive` never reach a game; entries flagged `mature`
 * are hidden when the profile asks for it (child profiles). Until
 * shared/vocabulary carries the flags, these block lists stand in for them.
 */
import type { VocabularyEntry, VocabularyFlag } from "./types";

/** Profanity, slurs and sexual words found in shared/vocabulary (scanned 23/10/2026). */
export const SENSITIVE_WORDS: ReadonlySet<string> = new Set([
  "arse", "ass", "asshole", "bastard", "bitch", "bitches", "bollocks", "boob", "boobs", "bugger",
  "bullshit", "cock", "condom", "crap", "cunt", "damn", "dick", "dildo", "erotic", "fag",
  "faggot", "fuck", "fucked", "fucker", "fucking", "fucks", "goddamn", "hooker", "horny",
  "masturbate", "masturbation", "motherfucker", "naked", "nigga", "nigger", "nude", "nudity",
  "orgasm", "penis", "piss", "pissed", "porn", "porno", "pornographic", "pornography",
  "prostitute", "prostitution", "pussy", "rape", "raped", "rapist", "retard", "retarded",
  "sex", "sexual", "sexually", "sexy", "shit", "shitty", "slut", "tits", "twat", "vagina",
  "wank", "wanker", "whore",
]);

/** Violence, weapons, drugs and alcohol: removed for child profiles. */
export const MATURE_WORDS: ReadonlySet<string> = new Set([
  "alcohol", "bloody", "cigarette", "cocaine", "corpse", "drug", "drugs", "drunk", "execution",
  "gambling", "gun", "guns", "hell", "heroin", "kill", "killed", "killer", "killing", "kills",
  "marijuana", "murder", "murderer", "overdose", "shoot", "shooting", "stab", "suicide",
  "terrorism", "terrorist", "tobacco", "torture", "vodka",
]);

export type ContentFilterOptions = {
  /** Also drop `mature` words (child profiles). Sensitive words are always dropped. */
  excludeMature?: boolean;
};

function wordsOf(text: string): string[] {
  return text.normalize("NFKC").toLocaleLowerCase("en-US").match(/[a-z]+/g) ?? [];
}

function hasFlag(entry: VocabularyEntry, flag: VocabularyFlag): boolean {
  return entry[flag] === true || (Array.isArray(entry.flags) && entry.flags.includes(flag));
}

/** True when any word of the text is on the block list. */
export function textHasBlockedWord(text: string, options: ContentFilterOptions = {}): boolean {
  return wordsOf(text).some(
    (word) => SENSITIVE_WORDS.has(word) || (options.excludeMature === true && MATURE_WORDS.has(word)),
  );
}

export function isSensitiveEntry(entry: VocabularyEntry): boolean {
  return hasFlag(entry, "sensitive") || wordsOf(entry.en).some((word) => SENSITIVE_WORDS.has(word));
}

export function isMatureEntry(entry: VocabularyEntry): boolean {
  return hasFlag(entry, "mature") || wordsOf(entry.en).some((word) => MATURE_WORDS.has(word));
}

/** An entry a game may show under these options. */
export function isAllowedEntry(entry: VocabularyEntry, options: ContentFilterOptions = {}): boolean {
  if (isSensitiveEntry(entry)) return false;
  return options.excludeMature !== true || !isMatureEntry(entry);
}

export function filterVocabularyEntries<T extends VocabularyEntry>(
  entries: readonly T[],
  options: ContentFilterOptions = {},
): T[] {
  return entries.filter((entry) => isAllowedEntry(entry, options));
}
