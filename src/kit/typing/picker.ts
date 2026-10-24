// Source: games/space-typing@feat/td-1a6 src/td/typing/picker.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * The next word of a stream (docs/td/TYPING_DEFENSE_DESIGN.md 25.8): drawn
 * from a shuffled bag of the band's words that repeats no word until the
 * band runs out. The first of up to `picker.tries` candidates the letters
 * accept wins; a candidate whose first letter is closed anyway is passed over
 * without counting. A round's rest that fits nowhere now is never dropped: it
 * opens the next round, ahead of the words just dealt. Shuffles draw on the
 * RNG stream the caller passes (TD: `words`).
 */
import type { RngStream } from "../platform/rng";
import type { Deck } from "./decks";
import type { Letters, LiveWords } from "./letters";

/** What the picker draws on: any seeded stream with int(min, max), both included. */
export type PickRng = Pick<RngStream, "int">;

/** `order` holds indices into `words`; those before `next` were dealt this round. */
export type Bag = { readonly words: Int32Array; readonly order: Int32Array; next: number };

export const createBag = (words: Int32Array): Bag => ({ words, order: Int32Array.from(words.keys()), next: words.length });

/** Shuffles order[from..] and starts a round. */
function shuffle(bag: Bag, rng: PickRng, from: number): void {
  const { order } = bag;
  for (let index = order.length - 1; index > from; index -= 1) {
    const other = rng.int(from, index);
    const value = order[index]!;
    order[index] = order[other]!;
    order[other] = value;
  }
  bag.next = 0;
}

/**
 * Deals a word for `kind` at a source whose last word started with `last`
 * (−1 none): returns word × 4 + tier, or −1 when none fits (a letter jam).
 */
export function pickWord(bag: Bag, deck: Deck, letters: Letters, live: LiveWords, kind: number, tick: number, vocab: number, last: number, rng: PickRng): number {
  const size = bag.order.length;
  const tries = letters.rules.picker.tries;
  const free = letters.free(tick, vocab);
  if (bag.next >= size) shuffle(bag, rng, 0);
  let tried = 0;
  let from = bag.next;
  for (let round = 0; round < 2 && from < size && tried < tries; round += 1) {
    if (round === 1) {
      // Nothing left in this round fits now: the rest opens the next round, then the dealt words reshuffled.
      from = size - bag.next;
      bag.order.set([...bag.order.subarray(bag.next), ...bag.order.subarray(0, bag.next)]);
      shuffle(bag, rng, from);
    }
    for (let at = from; at < size && tried < tries; at += 1) {
      const word = bag.words[bag.order[at]!]!;
      const c = deck.letters[deck.start[word]!]!;
      if (c === last || letters.tierOf(deck, live, c, -1, kind, tick, vocab, free) === 0) continue;
      tried += 1;
      const tier = letters.claim(deck, live, word, kind, tick, vocab, last, free);
      if (tier === 0) continue;
      const dealt = bag.order[at]!;
      bag.order.copyWithin(bag.next + 1, bag.next, at); // the words still to come keep their order: a carried rest stays first
      bag.order[bag.next] = dealt;
      bag.next += 1;
      return word * 4 + tier;
    }
  }
  return -1;
}
