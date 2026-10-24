// Source: games/space-typing@feat/td-1a6 src/td/typing/decks.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Word decks (docs/td/TYPING_DEFENSE_DESIGN.md 25.5, 6.5). The vocabulary is
 * compiled once into letter codes (a = 0 … z = 25) in one Uint8Array with
 * each word's start, length and vocabulary level: the simulation never holds
 * a word as a string. A band is the words of a length range up to a level;
 * its A (letters that start at least 3 of its words) sets the live-word
 * budget. Each word also keeps its Vietnamese meaning and IPA: the view reads
 * them, the simulation and the hash never do.
 */

/** One vocabulary word, already reduced to a–z (typingText). Order matters: it is the deck order. */
export type DeckEntry = { id: string; text: string; level: number; vi?: string; ipa?: string };

export type Deck = {
  readonly count: number;
  readonly letters: Uint8Array;
  readonly start: Int32Array;
  readonly len: Uint8Array;
  readonly level: Uint8Array;
  readonly ids: readonly string[];
  /** Meaning and IPA ("" when the source has none): the view's only. */
  readonly vi: readonly string[];
  readonly ipa: readonly string[];
  /** FNV-1a of the letters and levels: a replay checks it has the same deck. */
  readonly hash: string;
};

const A = 97;

/** Keeps the a–z words of `bounds.min`…`bounds.max` letters (TD: 3–8), the first of each spelling only. */
export function compileDeck(entries: readonly DeckEntry[], bounds: { readonly min: number; readonly max: number } = { min: 3, max: 8 }): Deck {
  const seen = new Set<string>();
  const kept = entries.filter((entry) => {
    const ok = entry.text.length >= bounds.min && entry.text.length <= bounds.max && /^[a-z]+$/.test(entry.text) && !seen.has(entry.text);
    if (ok) seen.add(entry.text);
    return ok;
  });
  const letters = new Uint8Array(kept.reduce((sum, entry) => sum + entry.text.length, 0));
  const start = new Int32Array(kept.length);
  const len = new Uint8Array(kept.length);
  const level = new Uint8Array(kept.length);
  let at = 0;
  let hash = 0x811c9dc5;
  kept.forEach((entry, index) => {
    start[index] = at;
    len[index] = entry.text.length;
    level[index] = entry.level;
    for (let k = 0; k < entry.text.length; k += 1) {
      letters[at] = entry.text.charCodeAt(k) - A;
      hash = Math.imul(hash ^ letters[at]!, 0x01000193);
      at += 1;
    }
    hash = Math.imul(hash ^ (32 + entry.level), 0x01000193);
  });
  return {
    count: kept.length, letters, start, len, level, ids: kept.map((entry) => entry.id), vi: kept.map((entry) => entry.vi ?? ""), ipa: kept.map((entry) => entry.ipa ?? ""),
    hash: (hash >>> 0).toString(16).padStart(8, "0"),
  };
}

/**
 * A short meaning for a card: notes in brackets left out, the first sense, then more while it stays within 22 letters
 * (BUILD_1A6 §7). One over 26 keeps its words whole: up to its last comma that fits, else its last whole word and "…".
 */
export function gloss(deck: Deck, word: number): string {
  const senses = (deck.vi[word] ?? "").replace(/\s*\([^)]*\)/g, "").split(";").map((sense) => sense.trim());
  const [first = "", ...rest] = senses.filter((sense) => sense !== "");
  let out = first;
  for (const sense of rest) if (out.length + sense.length + 2 <= 22) out += "; " + sense;
  if (out.length <= 26) return out;
  const comma = out.lastIndexOf(",", 26);
  const space = out.lastIndexOf(" ", 25);
  return comma > 0 ? out.slice(0, comma) : out.slice(0, space > 0 ? space : 25) + "…";
}

export const wordText = (deck: Deck, word: number): string =>
  String.fromCharCode(...deck.letters.subarray(deck.start[word]!, deck.start[word]! + deck.len[word]!).map((code) => code + A));

/** The deck index of `text`, or −1 (a linear scan: tests and tools, not the simulation). */
export function wordIndex(deck: Deck, text: string): number {
  for (let word = 0; word < deck.count; word += 1) if (wordText(deck, word) === text) return word;
  return -1;
}

/** The first letter's code of deck word `word`. */
export const firstLetterOf = (deck: Deck, word: number): number => deck.letters[deck.start[word]!]!;

/** Deck indices of the words of length lo..hi from vocabulary levels 1..maxLevel, in deck order. */
export function bandWords(deck: Deck, maxLevel: number, lo: number, hi: number): Int32Array {
  const out: number[] = [];
  for (let word = 0; word < deck.count; word += 1) if (deck.level[word]! <= maxLevel && deck.len[word]! >= lo && deck.len[word]! <= hi) out.push(word);
  return Int32Array.from(out);
}

/** A: how many letters start at least `minWordsPerLetter` of the band's words. */
export function availableLetters(deck: Deck, words: Int32Array, minWordsPerLetter = 3): number {
  const per = new Int32Array(26);
  for (const word of words) {
    const c = deck.letters[deck.start[word]!]!;
    per[c] = per[c]! + 1;
  }
  return per.filter((count) => count >= minWordsPerLetter).length;
}
