/**
 * Minimal v1 save of M0a on top of storage.ts (canon §23.1, M0A_PLAN §6.9):
 * the typing profile and the new-word ledger after each match (the ledger
 * also at each `take`), and the settings. `.save` (progression) waits for M1;
 * M0a never writes it.
 * Owner: step 0 / integration (LANES.md).
 */
import type { SkillProfile } from "../kit/balance/profile";
import { loadKey, saveKey, type KeyStore, type NewWordsV1, type SettingsV1 } from "./storage";

export interface MatchSave {
  /** The profile after kit/balance updateSkill with this match's measures. */
  readonly skill: SkillProfile;
  /** The ledger snapshot after every `take` of this match (typing/new-word-ledger.ts). */
  readonly newWords: NewWordsV1;
}

/** After a match (win, loss or retreat): learning results never wait on this (canon §23.1). */
export function saveAfterMatch(save: MatchSave, nowMs: number = Date.now(), store?: KeyStore): { readonly skill: boolean; readonly newwords: boolean } {
  return {
    skill: saveKey("skill", save.skill, nowMs, store),
    newwords: saveNewWords(save.newWords, nowMs, store),
  };
}

/** `.newwords` after the ledger took a word (canon §6.4: the sliding window survives a reload); entries over 20 minutes old are dropped. */
export function saveNewWords(snapshot: NewWordsV1, nowMs: number = Date.now(), store?: KeyStore): boolean {
  return saveKey("newwords", snapshot, nowMs, store);
}

export function loadSettings(store?: KeyStore): SettingsV1 {
  return loadKey("settings", store).value;
}

export function saveSettings(settings: SettingsV1, store?: KeyStore): boolean {
  return saveKey("settings", settings, Date.now(), store);
}
