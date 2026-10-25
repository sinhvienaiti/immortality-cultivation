/**
 * The typist's speed for Tĩnh Tu lives (canon §16: L uses E_eff of the
 * profile; §23.3): `?wpm=` first, then the measured `.skill` profile; with
 * neither the page asks, "chưa biết" meaning 25 WPM (canon §4.3, D18: never
 * an unspoken 35). Missing a or CV read as 95 % and 0.25 (canon §7.5).
 * Owner: Lane 8.
 */
import { PACE, TINH_TU } from "../../content/rules";
import { effectiveE } from "../../kit/balance/pace";
import { blendSkill, type SkillProfile } from "../../kit/balance/profile";

export interface Speed {
  readonly wpm: number;
  readonly a: number;
  readonly cv: number;
  readonly source: "flag" | "profile" | "choice";
}

/** Choices on the Tĩnh Thất speed row (rules.ts TINH_TU.speedChoices); 0 is "chưa biết" (rules.ts PACE.unknownWpm, 25 WPM). */
export const SPEED_CHOICES: readonly number[] = TINH_TU.speedChoices;
export const UNKNOWN_WPM: number = PACE.unknownWpm;
const DEFAULT_A = 0.95;
const DEFAULT_CV = 0.25;

export function flagSpeed(search: URLSearchParams): Speed | null {
  const raw = Number(search.get("wpm"));
  if (!Number.isFinite(raw) || raw < 5 || raw > 200) return null;
  return { wpm: raw, a: DEFAULT_A, cv: DEFAULT_CV, source: "flag" };
}

/** The measured profile, or null while nothing was measured. */
export function profileSpeed(profile: SkillProfile): Speed | null {
  const view = blendSkill(profile);
  if (!(view.confidence.e > 0)) return null;
  return { wpm: view.e, a: view.a, cv: view.cv, source: "profile" };
}

export const choiceSpeed = (choice: number): Speed => ({ wpm: choice > 0 ? choice : UNKNOWN_WPM, a: DEFAULT_A, cv: DEFAULT_CV, source: "choice" });

/** E_eff × 10 for SessionInit. */
export const eEffX10 = (speed: Speed): number => Math.max(10, Math.round(effectiveE({ e: speed.wpm, a: speed.a, cv: speed.cv }) * 10));
