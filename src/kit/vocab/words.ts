// Source: games/space-typing/src/scene3d/words.ts (kit copy: drops flagged words; log fixes in shared/game-kit/DRIFT.md)
import { typingText } from "../input/text";
import { isAllowedEntry, type ContentFilterOptions } from "./content-filter";
import type { VocabularyEntry } from "./types";

/**
 * Words for the 3D modes' targets (Campaign 3D, Defense), from the player's chosen vocabulary.
 * A target's first letter is unique among the targets on screen (so the
 * first key press says which one you aim at), and a word comes back only
 * after the rest of its band has been used.
 */
/** short: 3–4 letters (Defense Nova); enemy: up to the stage's length; elite: longer; boss: the longest and phrases. */
export type WordBand = "short" | "enemy" | "elite" | "boss";

export type PickedWord = { entry: VocabularyEntry; text: string };

export class WordPicker {
  private readonly pools: Record<WordBand, PickedWord[]>;
  private readonly used = new Set<string>();

  constructor(
    entries: readonly VocabularyEntry[],
    maxEnemyLength: number,
    private readonly random: () => number = Math.random,
    filter: ContentFilterOptions = {},
  ) {
    const seen = new Set<string>();
    const all: PickedWord[] = [];
    for (const entry of entries) {
      if (!isAllowedEntry(entry, filter)) continue;
      const text = typingText(entry.en);
      if (text.length < 2 || seen.has(text)) continue;
      seen.add(text);
      all.push({ entry, text });
    }
    const enemy = all.filter((word) => word.text.length >= 3 && word.text.length <= maxEnemyLength);
    const short = all.filter((word) => word.text.length >= 3 && word.text.length <= 4);
    const elite = all.filter((word) => word.text.length >= 6 && word.text.length <= maxEnemyLength + 3);
    // Bosses: phrases first, then the longest words.
    const boss = [...all].sort((a, b) => score(b) - score(a)).slice(0, Math.max(12, Math.round(all.length * 0.25)));
    this.pools = {
      short: short.length >= 6 ? short : enemy.length >= 6 ? enemy : all,
      enemy: enemy.length >= 6 ? enemy : all,
      elite: elite.length >= 4 ? elite : enemy.length >= 6 ? enemy : all,
      boss: boss.length > 0 ? boss : all,
    };
  }

  get size(): number {
    return this.pools.enemy.length;
  }

  /** A word whose first letter is not in `taken` (null when the band has none). */
  pick(band: WordBand, taken: ReadonlySet<string>): PickedWord | null {
    const pool = this.pools[band];
    if (pool.length === 0) return null;
    const free = pool.filter((word) => !taken.has(word.text[0]!));
    if (free.length === 0) return null;
    let fresh = free.filter((word) => !this.used.has(word.text));
    if (fresh.length === 0) {
      // The band is used up: start it again (keep the other bands' memory).
      for (const word of pool) this.used.delete(word.text);
      fresh = free;
    }
    const word = fresh[Math.floor(this.random() * fresh.length)] ?? fresh[0]!;
    this.used.add(word.text);
    return word;
  }
}

function score(word: PickedWord): number {
  return word.text.length + (word.entry.en.trim().includes(" ") ? 6 : 0);
}
