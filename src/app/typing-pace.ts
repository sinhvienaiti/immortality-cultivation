// Source: games/dragon-hold/src/app/typing-pace.ts @06cd4e6 (adapted: canon §6.5, §7.5, D18, D41 — SeatProfile in permille, a "chưa biết" row at 25 WPM with pace-update after wave 1, the 10 % downward cap once trusted, the Chớp floor from the last 5 sessions; E from finished words with the single d of rules.ts PACE; storage only through storage.ts)
/**
 * The player's typing speed (canon §6.5, §7.5, D18, D41). E sets word
 * lengths and the pace k, so it is never a silent 35:
 *   - `?wpm=` (scenarios, tests, a portal link) is used as given;
 *   - else the measured profile (`immortality-cultivation.skill`, kit
 *     SkillProfile) once a match was measured;
 *   - else the speed card asks (app/pace-card.ts); "chưa biết" plays at 25 WPM
 *     and the first match sends `pace-update` after wave 1 (k from wave 1's
 *     measure, applied from wave 2).
 * Measuring reads finished words only: wall time from the first key to the
 * last (`word-complete.responseMs`) against 12 (ℓ − 1) / (E × 0.86) s, the
 * same t_expected as the grades. After a match the profile updates (kit
 * updateSkill); a drop is capped at 10 % a session once the profile is
 * trusted (≥ 60 words over ≥ 3 sessions; typing/grading.ts). The E_eff of the
 * last 5 sessions is kept (gameStorage) for the Chớp floor (canon §6.5).
 * Owner: Lane 3.
 */
import { GAME_ID, GRADE, PACE } from "../content/rules";
import type { SeatProfile, SimCommand, SimEvent } from "../content/types";
import { SKILL_RULES, blendSkill, updateSkill, type Audience, type SkillMode, type SkillProfile, type SkillSample } from "../kit/balance/profile";
import { capProfileDrop, eEffX1000, flashEX1000 } from "../typing/grading";
import { gameStorage, loadSkill, saveKey, type JsonStore, type KeyStore } from "./storage";

/** Speeds the card or the URL may give (WPM, whole numbers). */
export const WPM_MIN = 10;
export const WPM_MAX = 150;

export const clampWpm = (value: number): number => Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(value)));

/** A profile at E WPM with the default accuracy and CV (canon §7.5: 95 %, 0.25 when not measured). */
export const profileAt = (wpm: number): SeatProfile => ({ e: clampWpm(wpm), a: PACE.defaultAccuracyPm, cv: PACE.defaultCvPm });

/** `?wpm=N` → N (clamped), or null. */
export function wpmFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get("wpm");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? clampWpm(value) : null;
}

/** The measured profile as a header profile, or null when no match was measured yet. */
export function profileOfSkill(skill: SkillProfile | null | undefined): SeatProfile | null {
  if (!skill || !(skill.measures.e.n > 0)) return null;
  const view = blendSkill(skill);
  return {
    e: clampWpm(view.e),
    a: Math.round(Math.min(1, Math.max(0, view.a)) * 1000),
    cv: Math.round(Math.min(1, Math.max(0, view.cv)) * 1000),
  };
}

/** The profile a match starts with (D18): `?wpm=`, else the measured `.skill`; null when the speed card must ask. */
export function startingProfile(search: string, skill?: SkillProfile | null): SeatProfile | null {
  const wpm = wpmFromSearch(search);
  if (wpm !== null) return profileAt(wpm);
  return profileOfSkill(skill);
}

// ── The speed card's rows ───────────────────────────────────────────────────

export interface PaceChoice {
  readonly label: string;
  readonly hint: string;
  readonly profile: SeatProfile;
  /** "Chưa biết": 25 WPM now, k measured again after wave 1 (D18, D41). */
  readonly unknown: boolean;
  readonly measured: boolean;
}

/** Card presets (WPM, hint); 35 is the reference player (canon §18.3 Chuẩn). */
export const PACE_PRESETS: readonly { readonly wpm: number; readonly hint: string }[] = [
  { wpm: 15, hint: "Mới tập gõ" },
  { wpm: 20, hint: "Còn nhìn phím" },
  { wpm: 25, hint: "Gõ chậm" },
  { wpm: 35, hint: "Vừa, người chơi chuẩn" },
  { wpm: 45, hint: "Khá nhanh" },
  { wpm: 60, hint: "Nhanh" },
  { wpm: 90, hint: "Rất nhanh" },
];

/** Rows of the card: the measured speed first when there is one, "chưa biết", then the presets; and the row to preselect. */
export function paceChoices(skill?: SkillProfile | null, lastPick?: number | null): { choices: PaceChoice[]; selected: number } {
  const choices: PaceChoice[] = [];
  const measured = profileOfSkill(skill);
  if (measured !== null) {
    choices.push({ label: "Số đo: " + measured.e + " WPM", hint: "Đúng " + Math.round(measured.a / 10) + " % phím, đo qua " + skill!.trend.stages + " trận", profile: measured, unknown: false, measured: true });
  }
  choices.push({ label: "Chưa biết", hint: "Chơi ở " + PACE.unknownWpm + " WPM, game đo lại sau đợt 1", profile: profileAt(PACE.unknownWpm), unknown: true, measured: false });
  for (const preset of PACE_PRESETS) choices.push({ label: preset.wpm + " WPM", hint: preset.hint, profile: profileAt(preset.wpm), unknown: false, measured: false });
  let selected = 0;
  if (measured === null && lastPick != null) {
    const at = choices.findIndex((choice) => !choice.unknown && choice.profile.e === clampWpm(lastPick));
    if (at >= 0) selected = at;
  }
  return { choices, selected };
}

// ── Measuring ───────────────────────────────────────────────────────────────

/**
 * Word timings of a match or a wave, from its events: per finished word its
 * letters, wall time first key to last, errors and grade. E = 12 Σ(ℓ − 1) /
 * (0.86 Σ t) with t in seconds (the inverse of t_expected, typing/grading.ts).
 */
export class PaceMeter {
  /** Σ (ℓ − 1) and Σ t (ms). */
  private strokes = 0;
  private ms = 0;
  /** Per-letter times (ms) for CV. */
  private readonly perLetter: number[] = [];
  words = 0;
  cleanWords = 0;
  sloppyWords = 0;

  onEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type !== "word-complete") continue;
      const letters = event.text.length;
      this.words += 1;
      if (event.errors === 0) this.cleanWords += 1;
      if (event.grade === "sloppy") this.sloppyWords += 1;
      if (letters < 2 || !(event.responseMs > 0)) continue;
      this.strokes += letters - 1;
      this.ms += event.responseMs;
      this.perLetter.push(event.responseMs / (letters - 1));
    }
  }

  /** E measured so far (WPM), or 0. */
  get wpm(): number {
    return this.ms > 0 ? (PACE.perCharS * this.strokes * 1000 * 1000) / (PACE.dPm * this.ms) : 0;
  }

  /** CV of the per-letter times, or undefined with too few words. */
  get cv(): number | undefined {
    const n = this.perLetter.length;
    if (n < SKILL_RULES.minWords) return undefined;
    const mean = this.perLetter.reduce((sum, value) => sum + value, 0) / n;
    if (!(mean > 0)) return undefined;
    const variance = this.perLetter.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / n;
    return Math.sqrt(variance) / mean;
  }

  /** The kit sample of a finished match; null when too few words were typed. */
  sample(outcome: "won" | "lost" | "quit", keys: { readonly keys: number; readonly wrongKeys: number; readonly strayKeys: number }, safety: number): SkillSample | null {
    if (this.words < SKILL_RULES.minWords || !(this.wpm > 0)) return null;
    const cv = this.cv;
    return {
      outcome,
      words: this.words,
      wpm: this.wpm,
      keys: keys.keys,
      correctKeys: Math.max(0, keys.keys - keys.wrongKeys - keys.strayKeys),
      cleanWords: this.cleanWords,
      sloppyWords: this.sloppyWords,
      ...(cv === undefined ? {} : { cv }),
      safety: Math.min(1, Math.max(0, safety)),
    };
  }
}

/**
 * canon §6.5, D41: the first match of an "unknown" profile re-measures k after
 * wave 1: wave 1's E, a (keys) and CV → kPm by the pace rules (`kPmOf`, Lane
 * 2's sim/pace.ts paceFor). Null with fewer words than the kit needs (8): the
 * match keeps 25 WPM.
 */
export function paceUpdateAfterWave1(
  meter: PaceMeter,
  seat: number,
  base: SeatProfile,
  keys: { readonly keys: number; readonly wrongKeys: number; readonly strayKeys: number },
  kPmOf: (profile: SeatProfile) => number,
): Extract<SimCommand, { type: "pace-update" }> | null {
  if (meter.words < SKILL_RULES.minWords || !(meter.wpm > 0)) return null;
  const a = keys.keys > 0 ? Math.round((Math.max(0, keys.keys - keys.wrongKeys - keys.strayKeys) * 1000) / keys.keys) : base.a;
  const cv = meter.cv;
  const profile: SeatProfile = { e: clampWpm(meter.wpm), a, cv: cv === undefined ? base.cv : Math.round(Math.min(1, cv) * 1000) };
  return { type: "pace-update", seat, kPm: kPmOf(profile) };
}

// ── After a match: the profile and the Chớp floor ──────────────────────────

/** Session memory: E_eff × 1000 of the last sessions (Chớp floor) and the last card pick. */
export interface PaceMemory {
  readonly v: 1;
  readonly sessionsEX1000: readonly number[];
  readonly lastPick: number | null;
}

export const PACE_MEMORY_KEY = GAME_ID + ":pace:v1";

export function readPaceMemory(store: JsonStore = gameStorage): PaceMemory {
  const raw = store.readJson(PACE_MEMORY_KEY) as Partial<PaceMemory> | null;
  const sessions = Array.isArray(raw?.sessionsEX1000) ? raw!.sessionsEX1000.filter((value): value is number => Number.isInteger(value) && value > 0).slice(-GRADE.floorSessions) : [];
  const lastPick = typeof raw?.lastPick === "number" && Number.isFinite(raw.lastPick) ? clampWpm(raw.lastPick) : null;
  return { v: 1, sessionsEX1000: sessions, lastPick };
}

export function rememberPick(wpm: number, store: JsonStore = gameStorage): void {
  store.writeJson(PACE_MEMORY_KEY, { ...readPaceMemory(store), lastPick: clampWpm(wpm) });
}

/** The Chớp E × 1000 of a seat (canon §6.5): its E_eff, never under the median of the last 5 sessions' (the replay header's `flashEX1000`). */
export const flashFloorFor = (profile: SeatProfile, memory: PaceMemory): number => flashEX1000(eEffX1000(profile), memory.sessionsEX1000);

export interface FinishOptions {
  readonly audience: Audience;
  readonly mode: SkillMode;
  readonly nowMs: number;
  readonly store?: KeyStore;
  readonly memoryStore?: JsonStore;
}

/**
 * Folds a finished match into `.skill` (kit updateSkill, BALANCE §2: after a
 * match, never mid-word) with D41's downward cap, and keeps this session's
 * E_eff for the Chớp floor. Returns the stored profile and whether the sample counted.
 */
export function finishMatch(sample: SkillSample | null, options: FinishOptions): { readonly profile: SkillProfile; readonly accepted: boolean } {
  const before = loadSkill(options.audience, options.mode, options.store);
  if (sample === null) return { profile: before, accepted: false };
  const update = updateSkill(before, sample);
  const profile = capProfileDrop(before, update.profile);
  saveKey("skill", profile, options.nowMs, options.store);
  if (update.accepted) {
    const seat = profileOfSkill(profile);
    const memory = readPaceMemory(options.memoryStore);
    if (seat !== null) {
      (options.memoryStore ?? gameStorage).writeJson(PACE_MEMORY_KEY, { ...memory, sessionsEX1000: [...memory.sessionsEX1000, eEffX1000(seat)].slice(-GRADE.floorSessions) });
    }
  }
  return { profile, accepted: update.accepted };
}
