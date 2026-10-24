// Source: games/space-typing@feat/td-1a6 src/td/sim/stores/words.ts, src/td/sim/systems/calls.ts (typeKey, dropWord), src/td/sim/commands.ts (unlock); kit copy, TD world types removed (log fixes in shared/game-kit/DRIFT.md)
/**
 * A typing session: the live words, their first letters, the router and the
 * numbers a game needs to grade a word, without any game's world. The game
 * owns its targets (an enemy, a call…) and keeps a word slot per target;
 * keys come in with the tick they act on, in order, and are never dropped
 * (a hit stop slows the world, not this).
 *
 * Lock protection (rules.router.protectS, dragon-hold 01 §3.3: 1.2 s): while
 * a word is locked with ≥ 1 letter in, shieldLock tells the game to keep its
 * target alive (at 1 hit point) against other sources, for protectTicks from
 * the first lethal blow (or from the lock's first letter). Once the window
 * is over the game lets the target die and drops its word: the lock goes
 * unpunished, counted as lost, and the next key that starts nothing is
 * forgiven instead of being a stray.
 */
import type { TypingRules } from "./config";
import { firstLetterOf, type Deck } from "./decks";
import { Letters } from "./letters";
import { pickWord, type Bag, type PickRng } from "./picker";
import { createRouter, KEY, routeBackspace, routeKey, routeUnlock, type KeyResult, type Router, type TypedWords } from "./router";

/** Live words as columns over slots (TD's WordStore without its calls). A new word takes the lowest free slot. */
export class WordSlots implements TypedWords {
  readonly used: Uint8Array;
  readonly word: Int32Array;
  readonly kind: Uint8Array;
  readonly tier: Uint8Array;
  /** Tick the word went live: total time counts from here. */
  readonly born: Int32Array;
  readonly typed: Uint8Array;
  readonly errors: Uint8Array;
  /** A letter was typed on it (a soft switch away takes this back). */
  readonly touched: Uint8Array;
  /** Ticks of its first and last letter (−1 none yet). */
  readonly firstTick: Int32Array;
  readonly lastTick: Int32Array;
  /** The game's id of what the word stands on (an enemy, a call), −1 none. */
  readonly owner: Int32Array;
  top = 0;
  count = 0;

  constructor(readonly cap: number) {
    this.used = new Uint8Array(cap);
    this.word = new Int32Array(cap);
    this.kind = new Uint8Array(cap);
    this.tier = new Uint8Array(cap);
    this.born = new Int32Array(cap);
    this.typed = new Uint8Array(cap);
    this.errors = new Uint8Array(cap);
    this.touched = new Uint8Array(cap);
    this.firstTick = new Int32Array(cap).fill(-1);
    this.lastTick = new Int32Array(cap).fill(-1);
    this.owner = new Int32Array(cap).fill(-1);
  }

  /** The lowest free slot, filled; −1 when full. */
  add(word: number, kind: number, tier: number, tick: number, owner = -1): number {
    for (let slot = 0; slot < this.cap; slot += 1) {
      if (this.used[slot] !== 0) continue;
      this.used[slot] = 1;
      this.word[slot] = word;
      this.kind[slot] = kind;
      this.tier[slot] = tier;
      this.born[slot] = tick;
      this.typed[slot] = this.errors[slot] = this.touched[slot] = 0;
      this.firstTick[slot] = this.lastTick[slot] = -1;
      this.owner[slot] = owner;
      this.count += 1;
      if (slot >= this.top) this.top = slot + 1;
      return slot;
    }
    return -1;
  }

  release(slot: number): void {
    if (this.used[slot] === 0) return;
    this.used[slot] = 0;
    this.count -= 1;
    while (this.top > 0 && this.used[this.top - 1] === 0) this.top -= 1;
  }

  /** Used slots in slot order (tests, tools and the view; systems loop inline). */
  live(): number[] {
    const out: number[] = [];
    for (let slot = 0; slot < this.top; slot += 1) if (this.used[slot] === 1) out.push(slot);
    return out;
  }
}

/** Key counts of a session (the bots' G11: lost locks against locks). */
export type TypingStats = { keys: number; strays: number; errors: number; switches: number; locks: number; done: number; lost: number; forgiven: number };

export type TypingSession = {
  readonly rules: TypingRules;
  readonly deck: Deck;
  readonly letters: Letters;
  readonly router: Router;
  readonly words: WordSlots;
  readonly stats: TypingStats;
  /** Tick of the key that opened a tier-2 pair (the word's first key once the pair resolves). */
  groupTick: number;
  /** The protected lock (−1 none) and the tick its window opened. */
  guardSlot: number;
  guardAt: number;
  /** The next key that starts nothing is forgiven (a lock was just lost to another source). */
  forgive: boolean;
};

export function createSession(rules: TypingRules, deck: Deck, capacity = 24): TypingSession {
  return {
    rules, deck, letters: new Letters(rules), router: createRouter(), words: new WordSlots(capacity),
    stats: { keys: 0, strays: 0, errors: 0, switches: 0, locks: 0, done: 0, lost: 0, forgiven: 0 },
    groupTick: -1, guardSlot: -1, guardAt: -1, forgive: false,
  };
}

/** Puts deck word `word` live for `kind`, taking its first letter at `tier`: its slot, or −1 when the store is full. */
export function addWord(t: TypingSession, word: number, kind: number, tier: number, tick: number, owner = -1): number {
  const slot = t.words.add(word, kind, tier, tick, owner);
  if (slot >= 0) t.letters.take(slot, firstLetterOf(t.deck, word), tier);
  return slot;
}

/** Deals the next word of `bag` for `kind` and puts it live: its slot, or −1 (a letter jam, or the store is full). */
export function dealWord(t: TypingSession, bag: Bag, kind: number, tick: number, vocab: number, last: number, rng: PickRng, owner = -1): number {
  if (t.words.count >= t.words.cap) return -1;
  const pick = pickWord(bag, t.deck, t.letters, t.words, kind, tick, vocab, last, rng);
  return pick < 0 ? -1 : addWord(t, pick >> 2, kind, pick & 3, tick, owner);
}

/**
 * Word `slot` leaves: typed, its target gone, or hidden. Its letter rests, a
 * tier-2 partner left behind is told by one key now, and a lock on it goes.
 * A lock with letters in that ends here unfinished was lost to another
 * source: counted, unpunished, and the next stray key is forgiven.
 */
export function dropWord(t: TypingSession, slot: number, tick: number): void {
  const { words, letters, router } = t;
  if (words.used[slot] === 0) return;
  const c = firstLetterOf(t.deck, words.word[slot]!);
  letters.release(slot, c, tick);
  if (letters.owner[c]! >= 0) words.tier[letters.owner[c]!] = 1;
  if (router.lock === slot) {
    if (words.typed[slot]! > 0 && words.typed[slot]! < t.deck.len[words.word[slot]!]!) {
      t.stats.lost += 1;
      t.forgive = true;
    }
    router.lock = -1;
  }
  if (t.guardSlot === slot) t.guardSlot = -1;
  words.release(slot);
}

/** A target's next word comes locked with no letter in (TD's call words, dragon-hold's soft lock): its first key goes on, another word's first letter switches. */
export function lockNext(t: TypingSession, slot: number): void {
  if (t.words.used[slot] === 0) return;
  t.router.lock = slot;
  t.router.group = -1;
  t.words.touched[slot] = 1;
  t.guardSlot = -1;
}

export type KeyOutcome = { result: KeyResult; /** The word acted on (the one just done for KEY.done), −1 none. */ slot: number };

/** A letter key (0–25) acting on `tick`. On KEY.done the word is typed: grade it (wordTiming), then dropWord. */
export function typeLetter(t: TypingSession, c: number, tick: number): KeyOutcome {
  const { router, words, stats } = t;
  if (!Number.isInteger(c) || c < 0 || c > 25) throw new Error("typing: letter " + c + " is not 0–25");
  stats.keys += 1;
  const before = router.lock;
  let result: KeyResult = routeKey(router, t.deck, t.letters, words, c);
  const slot = result === KEY.done ? before : router.lock;
  if (t.forgive) {
    t.forgive = false;
    if (result === KEY.stray) result = KEY.forgiven;
  }
  if (result === KEY.group) t.groupTick = tick;
  if (slot >= 0 && slot !== before) {
    // Its first letter: the lock came with this key (or with the pair's first key).
    words.firstTick[slot] = before < 0 && t.groupTick >= 0 ? t.groupTick : tick;
  } else if (slot >= 0 && result === KEY.advance && words.typed[slot] === 1) words.firstTick[slot] = tick; // it came locked
  if (result !== KEY.group) t.groupTick = -1;
  if (result === KEY.lock || result === KEY.switch || result === KEY.advance || result === KEY.done) words.lastTick[slot] = tick;
  if (router.lock !== before) t.guardSlot = -1;
  switch (result) {
    case KEY.stray:
      stats.strays += 1;
      break;
    case KEY.wrong:
    case KEY.switch:
      stats.errors += 1;
      if (result === KEY.switch) stats.switches += 1;
      break;
    case KEY.forgiven:
      stats.forgiven += 1;
      break;
    case KEY.done:
      stats.done += 1;
      break;
  }
  if (slot >= 0 && slot !== before && result !== KEY.done) stats.locks += 1;
  return { result, slot };
}

/** Backspace: one letter back on the locked word (errors stay), at 0 the lock goes; an open pair closes. */
export function typeBackspace(t: TypingSession): boolean {
  const before = t.router.lock;
  const acted = routeBackspace(t.router, t.words);
  if (t.router.lock !== before) t.guardSlot = -1;
  return acted;
}

/** Esc: lets go of the locked word, what was typed dropped; its errors go too unless rules.router.unlockErrors is "keep". */
export function unlock(t: TypingSession): boolean {
  t.guardSlot = -1;
  return routeUnlock(t.router, t.words, t.rules.router.unlockErrors === "keep");
}

/**
 * Another source would kill the target of word `slot` at `tick`: true while
 * the lock protects it (the game keeps it at 1 hit point). Opens the window
 * on the first call ("lethal") or counts from the lock's first letter ("lock").
 */
export function shieldLock(t: TypingSession, slot: number, tick: number): boolean {
  const { rules, router, words } = t;
  if (rules.protectTicks <= 0 || slot < 0 || slot !== router.lock || words.typed[slot]! < 1) return false;
  if (rules.router.protectFrom === "lock") return tick - words.firstTick[slot]! < rules.protectTicks;
  if (t.guardSlot !== slot) {
    t.guardSlot = slot;
    t.guardAt = tick;
  }
  return tick - t.guardAt < rules.protectTicks;
}

/** Ticks of protection word `slot` has left at `tick` (0: none), without opening a window: for the view's "being typed" rim. */
export function shieldLeft(t: TypingSession, slot: number, tick: number): number {
  const { rules, router, words } = t;
  if (rules.protectTicks <= 0 || slot < 0 || slot !== router.lock || words.typed[slot]! < 1) return 0;
  const from = rules.router.protectFrom === "lock" ? words.firstTick[slot]! : t.guardSlot === slot ? t.guardAt : tick;
  return Math.max(0, rules.protectTicks - (tick - from));
}

/** What a game grades a finished word by, in ticks: from birth to the first key, first key to last (t_k), birth to `tick`. */
export type WordTiming = { len: number; errors: number; toFirstKey: number; typing: number; total: number };

export function wordTiming(t: TypingSession, slot: number, tick: number): WordTiming {
  const { words } = t;
  const born = words.born[slot]!;
  const first = words.firstTick[slot]!;
  const last = words.lastTick[slot]!;
  return {
    len: t.deck.len[words.word[slot]!]!,
    errors: words.errors[slot]!,
    toFirstKey: first < 0 ? tick - born : first - born,
    typing: first < 0 || last < first ? 0 : last - first,
    total: tick - born,
  };
}
