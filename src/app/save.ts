/**
 * Minimal v1 save of M0a on top of storage.ts (canon §23.1, M0A_PLAN §6.9):
 * the typing profile and the new-word ledger after each match, and the
 * settings. `.save` (progression) waits for M1; M0a never writes it.
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
    newwords: saveKey("newwords", save.newWords, nowMs, store),
  };
}

export function loadSettings(store?: KeyStore): SettingsV1 {
  return loadKey("settings", store).value;
}

export function saveSettings(settings: SettingsV1, store?: KeyStore): boolean {
  return saveKey("settings", settings, Date.now(), store);
}
