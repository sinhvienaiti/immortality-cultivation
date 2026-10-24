// Source: games/space-typing@feat/td-1a6 src/td/typing/letters.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * First letters (docs/td/TYPING_DEFENSE_DESIGN.md 6.5, 25.8). A live word
 * starts with a letter no other live word starts with (tier 1) or, when
 * letters run short, shares it with exactly one untouched word whose second
 * letter differs (tier 2: the second key tells them apart). A released
 * letter rests (rules: 1 s); the reserve kinds leave the last free letters to
 * the higher kinds; the avoided letters start no word up to a vocabulary
 * level. Every number comes from the TypingRules the letters are made with.
 */
import type { TypingRules } from "./config";
import type { Deck } from "./decks";
import { withinOneEdit } from "./distance";

/** What the letters read of the live words; a words store has these columns. */
export type LiveWords = { readonly top: number; readonly used: Uint8Array; readonly word: Int32Array; readonly touched: Uint8Array };

export class Letters {
  /** Word slot holding each letter (−1 none); `partner` is the tier-2 second word. */
  readonly owner = new Int16Array(26).fill(-1);
  readonly partner = new Int16Array(26).fill(-1);
  /** Tick from which a released letter may start a word again. */
  readonly freeAt = new Int32Array(26);

  constructor(readonly rules: TypingRules) {}

  /** Every letter free at once (a new stage). */
  reset(): void {
    this.owner.fill(-1);
    this.partner.fill(-1);
    this.freeAt.fill(0);
  }

  avoided(letter: number, vocab: number): boolean {
    return vocab <= this.rules.letters.avoidUntilLevel && this.rules.avoided.includes(letter);
  }

  /** Letters a new tier-1 word could take now. */
  free(tick: number, vocab: number): number {
    let count = 0;
    for (let c = 0; c < 26; c += 1) if (this.owner[c]! < 0 && tick >= this.freeAt[c]! && !this.avoided(c, vocab)) count += 1;
    return count;
  }

  /**
   * The tier (1, 2) a word starting `c` then `second` may take for `kind`,
   * or 0; `free` is this tick's free(). A second letter of −1 asks whether
   * the first letter is open at all.
   */
  tierOf(deck: Deck, live: LiveWords, c: number, second: number, kind: number, tick: number, vocab: number, free: number): number {
    if (this.avoided(c, vocab) || tick < this.freeAt[c]!) return 0;
    const rules = this.rules.letters;
    // "No free letter left" counts from the kind's own floor: reserve kinds already stop at the reserve.
    const floor = this.rules.reserved.includes(kind) ? rules.reserve : 0;
    const owner = this.owner[c]!;
    if (owner < 0) return free > floor ? 1 : 0;
    const early = vocab <= rules.tier2EarlyMaxLevel && free <= rules.tier2EarlyFree;
    if (this.partner[c]! >= 0 || !(free <= floor || early) || live.touched[owner] !== 0) return 0;
    // Different second letters also mean neither word is the other's prefix (words have ≥ 3 letters).
    return deck.letters[deck.start[live.word[owner]!]! + 1] === second ? 0 : 2;
  }

  /**
   * The tier `word` would go live at, or 0: its letter is closed, it starts
   * like `last` (its source's previous word), or it is a live word or one
   * edit away from one.
   */
  claim(deck: Deck, live: LiveWords, word: number, kind: number, tick: number, vocab: number, last: number, free: number): number {
    const start = deck.start[word]!;
    const c = deck.letters[start]!;
    if (c === last) return 0;
    const tier = this.tierOf(deck, live, c, deck.letters[start + 1]!, kind, tick, vocab, free);
    if (tier === 0) return 0;
    const maxLen = this.rules.letters.maxEditCheckLen;
    for (let s = 0; s < live.top; s += 1) {
      if (live.used[s] === 0) continue;
      const other = live.word[s]!;
      if (other === word || withinOneEdit(deck.letters, start, deck.len[word]!, deck.start[other]!, deck.len[other]!, maxLen)) return 0;
    }
    return tier;
  }

  take(slot: number, letter: number, tier: number): void {
    if (tier === 1) this.owner[letter] = slot;
    else this.partner[letter] = slot;
  }

  /** The word in `slot` gives its letter back; a tier-2 partner keeps it. */
  release(slot: number, letter: number, tick: number): void {
    if (this.owner[letter] === slot) {
      this.owner[letter] = this.partner[letter]!;
      this.partner[letter] = -1;
    } else if (this.partner[letter] === slot) this.partner[letter] = -1;
    else return;
    this.freeAt[letter] = tick + this.rules.cooldownTicks;
  }
}
