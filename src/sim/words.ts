/**
 * The Bàn Quyết in the sim (canon §6.1–6.4) on kit/typing/session: own first
 * letter (tier 1), no prefixes, edit distance > 1, live-word cap and priority
 * by preset, no word change while typing, 1 s letter rest, Esc keeps errors
 * (`unlockErrors: "keep"`), lock grace. Live only from the wave warning to the
 * wave end and in the boss phase (D42). Deals slot words, Ấn, Tẩy; releases
 * on beast death and when the seat goes down; `word-first-seen` for new words.
 * Owner: Lane 3. TODO(lane-3).
 */
import type { BeastRef, BeastState, NodeId, SimCommand, SlotId, WordReleaseReason, WordsState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-3): sim/words.ts " + name);
};

export function createWordsState(_init: WorldInit): WordsState {
  return todo("createWordsState");
}

export function stepWords(_world: World): void {
  todo("stepWords");
}

export function typeKey(_world: World, _command: Extract<SimCommand, { type: "key" }>): void {
  todo("typeKey");
}

export function typeBackspace(_world: World, _seat: number): void {
  todo("typeBackspace");
}

/** Esc while locked: drop typed letters, keep the error count (D19). */
export function releaseLock(_world: World, _seat: number): void {
  todo("releaseLock");
}

/** The Bàn Quyết takes letters for this seat now. */
export function isBanQuyetLive(_world: World, _seat: number): boolean {
  return todo("isBanQuyetLive");
}

/** A slot is ready again (cooldown over, Chân Nguyên full for ô 5): deal its word. */
export function dealSlotWord(_world: World, _seat: number, _slot: SlotId): void {
  todo("dealSlotWord");
}

/** An Ấn on an elite, general or boss (never a new word). */
export function dealSeal(_world: World, _seat: number, _beast: BeastRef): void {
  todo("dealSeal");
}

/** Tẩy on a captured node. */
export function dealCleanse(_world: World, _seat: number, _node: NodeId): void {
  todo("dealCleanse");
}

export function releaseWord(_world: World, _word: number, _reason: WordReleaseReason): void {
  todo("releaseWord");
}

/** Cleanup: release the Ấn of a dead beast. */
export function onBeastGone(_world: World, _beast: BeastState): void {
  todo("onBeastGone");
}

/** The seat went down: release its typing (as Esc) and dim the bar. */
export function onSeatDown(_world: World, _seat: number): void {
  todo("onSeatDown");
}
