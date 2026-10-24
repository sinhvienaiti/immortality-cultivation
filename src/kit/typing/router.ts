// Source: games/space-typing@feat/td-1a6 src/td/typing/router.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * The key router (docs/td/TYPING_DEFENSE_DESIGN.md 6.15), run inside the
 * simulation: a key is a command with a tick. With a word locked, the right
 * letter moves it on and a wrong one is an error on it, except the soft
 * switch: at most `router.softSwitchMaxTyped` letters in (none for a word
 * that comes locked, such as a target's next word), no error yet, and the
 * key starts another live word (the lock moves there; the first word goes
 * back to untyped, unpunished). With no lock, a tier-1 first letter locks its
 * word, a tier-2 letter opens the pair and the second key picks one, and
 * anything else is a stray key. Locking never stops a word's clock.
 */
import type { Deck } from "./decks";
import type { Letters, LiveWords } from "./letters";

/** What a key did. `forgiven` is the session's: a stray right after a lock was lost to another source. */
export const KEY = { stray: 0, lock: 1, advance: 2, done: 3, wrong: 4, switch: 5, group: 6, forgiven: 7 } as const;
export type KeyResult = (typeof KEY)[keyof typeof KEY];

/** Word slot locked (−1 none); letter of an open tier-2 pair (−1 none). */
export type Router = { lock: number; group: number };
export type TypedWords = LiveWords & { readonly typed: Uint8Array; readonly errors: Uint8Array; readonly touched: Uint8Array };

export const createRouter = (): Router => ({ lock: -1, group: -1 });

function lockOn(router: Router, live: TypedWords, slot: number, typed: number): void {
  router.lock = slot;
  live.typed[slot] = typed;
  live.touched[slot] = 1;
}

/** One more error on `slot`, held at 255: a macro's flood in one tick must not wrap back to a clean word. */
const miss = (live: TypedWords, slot: number): void => {
  live.errors[slot] = Math.min(255, live.errors[slot]! + 1);
};

/** Routes letter `c` (0–25); returns a KEY code. The word it acted on is then `router.lock` (or the one just done). */
export function routeKey(router: Router, deck: Deck, letters: Letters, live: TypedWords, c: number): KeyResult {
  const lock = router.lock;
  if (lock >= 0) {
    const word = live.word[lock]!;
    if (deck.letters[deck.start[word]! + live.typed[lock]!] === c) {
      live.typed[lock] = live.typed[lock]! + 1;
      if (live.typed[lock] !== deck.len[word]) return KEY.advance;
      router.lock = -1;
      return KEY.done;
    }
    const other = letters.owner[c]!;
    const soft = letters.rules.router.softSwitchMaxTyped;
    if (live.typed[lock]! <= soft && live.errors[lock] === 0 && other >= 0 && other !== lock && letters.partner[c]! < 0) {
      live.typed[lock] = 0;
      live.touched[lock] = 0;
      lockOn(router, live, other, 1);
      return KEY.switch;
    }
    miss(live, lock);
    return KEY.wrong;
  }
  if (router.group >= 0) {
    const group = router.group;
    router.group = -1;
    const owner = letters.owner[group]!;
    for (const slot of [owner, letters.partner[group]!]) {
      if (slot >= 0 && deck.letters[deck.start[live.word[slot]!]! + 1] === c) {
        lockOn(router, live, slot, 2);
        return KEY.advance;
      }
    }
    if (owner < 0) return KEY.stray;
    // No second letter matched: an error on the older word, which keeps its first letter.
    lockOn(router, live, owner, 1);
    miss(live, owner);
    return KEY.wrong;
  }
  const owner = letters.owner[c]!;
  if (owner < 0) return KEY.stray;
  if (letters.partner[c]! >= 0) {
    router.group = c;
    return KEY.group;
  }
  lockOn(router, live, owner, 1);
  return KEY.lock;
}

/** One letter back on the locked word (its errors stay); at 0 the lock goes (a word that came locked has none to take back). An open pair just closes. */
export function routeBackspace(router: Router, live: TypedWords): boolean {
  if (router.group >= 0) {
    router.group = -1;
    return true;
  }
  if (router.lock < 0) return false;
  live.typed[router.lock] = Math.max(0, live.typed[router.lock]! - 1);
  if (live.typed[router.lock] === 0) router.lock = -1;
  return true;
}

/**
 * Esc: lets go of the word and drops what was typed. Its errors go too
 * (typed again, it starts clean) unless `keepErrors` (RouterRules.unlockErrors
 * "keep"): then they stay with the word, as with Backspace.
 */
export function routeUnlock(router: Router, live: TypedWords, keepErrors = false): boolean {
  const had = router.lock >= 0 || router.group >= 0;
  if (router.lock >= 0) {
    live.typed[router.lock] = 0;
    if (!keepErrors) live.errors[router.lock] = 0;
  }
  router.lock = -1;
  router.group = -1;
  return had;
}
