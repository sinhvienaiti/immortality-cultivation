/**
 * The only file of the game that touches browser storage (canon §23.1,
 * M0A_PLAN §2.1; tests/boundary.test.ts enforces it). Wraps kit safe-storage
 * for the four keys `immortality-cultivation.save`, `.skill`, `.newwords`,
 * `.settings`: each has a reader, a writer and a migration with sample files
 * in tests/app/save-migrate.test.ts. A value that fails to parse or migrate
 * falls back to its backup slot (`<key>.bak`, the last good value), then to
 * the default (Rồng 06 §1). Other app keys (learning queue, pace memory) go
 * through `gameStorage`.
 * Owner: step 0 / integration (LANES.md).
 */
import { SKILL_VERSION, parseSkill, serializeSkill, type Audience, type SkillMode, type SkillProfile } from "../kit/balance/profile";
import { safeLocalStorage, type SafeStorage } from "../kit/platform/safe-storage";
import { SAVE } from "../content/rules";
import type { MechanismId, NewWordChannel, NewWordEntry, NewWordsSnapshot, Quality } from "../content/types";

// ── Shapes (canon §23.1) ────────────────────────────────────────────────────

/** `.save` v1: progression (M1; M0a keeps no progression, canon §25). */
export interface SaveV1 {
  readonly v: 1;
  readonly realm: number;
  readonly tuVi: number;
  readonly congPhap: readonly { readonly id: string; readonly tier: number; readonly points: number; readonly ngoChieu: string | null }[];
  readonly daoQua: readonly string[];
  readonly phapBao: { readonly id: string; readonly level: number } | null;
  readonly mechLevels: Readonly<Partial<Record<MechanismId, number>>>;
  readonly thuLau: number;
  readonly vanKhi: number;
  readonly thuHach: number;
  readonly stars: Readonly<Record<string, number>>;
  readonly wavesPaid: Readonly<Record<string, readonly number[]>>;
}

/** `.newwords` v1: the new-word ledger's snapshot (canon §6.4; typing/new-word-ledger.ts). */
export type NewWordsV1 = NewWordsSnapshot;

export type MotionSetting = "system" | "full" | "reduce";
export type TextScale = 100 | 125 | 150;

/** `.settings` v1 (canon §23.1). `keymap`: action → event.code overrides of rules.ts KEYS. */
export interface SettingsV1 {
  readonly v: 1;
  readonly motion: MotionSetting;
  readonly textScale: TextScale;
  readonly keymap: Readonly<Record<string, string>>;
  readonly pacing: boolean;
  readonly quality: Exclude<Quality, "ultra"> | null;
}

/** What each key holds once read. `.skill` is the kit profile (serializeSkill / parseSkill). */
export interface SaveKeys {
  save: SaveV1;
  skill: SkillProfile;
  newwords: NewWordsV1;
  settings: SettingsV1;
}
export type SaveKey = keyof SaveKeys;

export const SAVE_KEY_NAMES: readonly SaveKey[] = ["save", "skill", "newwords", "settings"];

/** Full storage key of a save key: `immortality-cultivation.<name>`. */
export const storageKey = (name: SaveKey): string => SAVE.prefix + name;
const backupKey = (name: SaveKey): string => storageKey(name) + ".bak";

// ── Defaults ────────────────────────────────────────────────────────────────

export function defaultValue<K extends SaveKey>(name: K): SaveKeys[K] {
  const values: SaveKeys = {
    save: { v: 1, realm: 0, tuVi: 0, congPhap: [], daoQua: [], phapBao: null, mechLevels: {}, thuLau: 0, vanKhi: 0, thuHach: 0, stars: {}, wavesPaid: {} },
    skill: parseSkill(null),
    newwords: { v: 1, entries: [] },
    settings: { v: 1, motion: "system", textScale: 100, keymap: {}, pacing: true, quality: null },
  };
  return values[name];
}

// ── Migrations: raw parsed JSON (or text for .skill) → current shape, or null ─

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isNonNegInt = (value: unknown): value is number => isInt(value) && value >= 0;
const NEW_WORD_CHANNELS: readonly NewWordChannel[] = ["learn-ahead", "tinh-tu", "slot4"];

function migrateSave(raw: unknown): SaveV1 | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  const base = defaultValue("save");
  const congPhap = Array.isArray(raw.congPhap)
    ? raw.congPhap.filter(isRecord).flatMap((row) =>
        typeof row.id === "string" && isNonNegInt(row.tier) && isNonNegInt(row.points)
          ? [{ id: row.id, tier: row.tier, points: row.points, ngoChieu: typeof row.ngoChieu === "string" ? row.ngoChieu : null }]
          : [],
      )
    : base.congPhap;
  const phapBao = isRecord(raw.phapBao) && typeof raw.phapBao.id === "string" && isNonNegInt(raw.phapBao.level) ? { id: raw.phapBao.id, level: raw.phapBao.level } : null;
  const numbers = (value: unknown): Record<string, number> =>
    isRecord(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isNonNegInt(entry[1]))) : {};
  const lists = (value: unknown): Record<string, number[]> =>
    isRecord(value)
      ? Object.fromEntries(Object.entries(value).flatMap(([key, list]) => (Array.isArray(list) ? [[key, list.filter(isNonNegInt)] as [string, number[]]] : [])))
      : {};
  return {
    v: 1,
    realm: isNonNegInt(raw.realm) ? raw.realm : base.realm,
    tuVi: isNonNegInt(raw.tuVi) ? raw.tuVi : base.tuVi,
    congPhap,
    daoQua: Array.isArray(raw.daoQua) ? raw.daoQua.filter((id): id is string => typeof id === "string") : base.daoQua,
    phapBao,
    mechLevels: numbers(raw.mechLevels),
    thuLau: isNonNegInt(raw.thuLau) ? raw.thuLau : base.thuLau,
    vanKhi: isNonNegInt(raw.vanKhi) ? raw.vanKhi : base.vanKhi,
    thuHach: isNonNegInt(raw.thuHach) ? raw.thuHach : base.thuHach,
    stars: numbers(raw.stars),
    wavesPaid: lists(raw.wavesPaid),
  };
}

function migrateNewWords(raw: unknown): NewWordsV1 | null {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.entries)) return null;
  const seen = new Set<string>();
  const entries: NewWordEntry[] = [];
  for (const row of raw.entries) {
    if (!isRecord(row) || typeof row.wordId !== "string" || row.wordId === "" || !isNonNegInt(row.firstSeenMs)) continue;
    const channel = NEW_WORD_CHANNELS.find((name) => name === row.channel);
    // One word counts once, at its first meeting (canon §6.4).
    if (channel === undefined || seen.has(row.wordId)) continue;
    seen.add(row.wordId);
    entries.push({ wordId: row.wordId, firstSeenMs: row.firstSeenMs, channel });
  }
  return { v: 1, entries };
}

function migrateSettings(raw: unknown): SettingsV1 | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  const base = defaultValue("settings");
  const motion = (["system", "full", "reduce"] as const).find((value) => value === raw.motion) ?? base.motion;
  const textScale = ([100, 125, 150] as const).find((value) => value === raw.textScale) ?? base.textScale;
  const quality = raw.quality === null ? null : ((["low", "medium", "high"] as const).find((value) => value === raw.quality) ?? base.quality);
  const keymap = isRecord(raw.keymap)
    ? Object.fromEntries(Object.entries(raw.keymap).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""))
    : base.keymap;
  return { v: 1, motion, textScale, keymap, pacing: typeof raw.pacing === "boolean" ? raw.pacing : base.pacing, quality };
}

/**
 * The stored text of a key → its current shape, or null when it cannot be read
 * (the caller then tries the backup slot). Pure: tests feed it sample files.
 */
export function migrate<K extends SaveKey>(name: K, text: string): SaveKeys[K] | null {
  if (name === "skill") {
    // kit/balance owns the profile; it turns broken or unknown versions into a fresh profile, so refuse them here (backup slot).
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isRecord(raw) || raw.version !== SKILL_VERSION) return null;
    return parseSkill(text) as SaveKeys[K];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const value = name === "save" ? migrateSave(raw) : name === "newwords" ? migrateNewWords(raw) : migrateSettings(raw);
  return value as SaveKeys[K] | null;
}

/** The value written for a key (`.newwords` drops entries older than 20 minutes at `nowMs`, canon §23.1). */
export function encode<K extends SaveKey>(name: K, value: SaveKeys[K], nowMs: number): string {
  if (name === "skill") return serializeSkill(value as SkillProfile);
  if (name === "newwords") {
    const words = value as NewWordsV1;
    const keepFrom = nowMs - SAVE.newWordsKeepMs;
    return JSON.stringify({ v: 1, entries: words.entries.filter((entry) => entry.firstSeenMs > keepFrom) });
  }
  return JSON.stringify(value);
}

// ── Read and write ──────────────────────────────────────────────────────────

/** Storage for tests and the Tĩnh Tu page; the browser's local storage by default. */
export type KeyStore = Pick<SafeStorage, "getItem" | "setItem">;

export interface LoadResult<K extends SaveKey> {
  readonly value: SaveKeys[K];
  /** Where it came from: the key, its backup slot, or the default. */
  readonly from: "key" | "backup" | "default";
}

export function loadKey<K extends SaveKey>(name: K, store: KeyStore = safeLocalStorage): LoadResult<K> {
  for (const [key, from] of [
    [storageKey(name), "key"],
    [backupKey(name), "backup"],
  ] as const) {
    const text = store.getItem(key);
    if (text === null) continue;
    const value = migrate(name, text);
    if (value !== null) return { value, from };
  }
  return { value: defaultValue(name), from: "default" };
}

/**
 * Writes a key; the last good value moves to the backup slot first. Returns
 * whether it reached the browser (false: kept in this page's memory, kit
 * safe-storage). `nowMs` is the wall clock (only `.newwords` reads it).
 */
export function saveKey<K extends SaveKey>(name: K, value: SaveKeys[K], nowMs: number = Date.now(), store: KeyStore = safeLocalStorage): boolean {
  const previous = store.getItem(storageKey(name));
  if (previous !== null && migrate(name, previous) !== null) store.setItem(backupKey(name), previous);
  return store.setItem(storageKey(name), encode(name, value, nowMs));
}

/**
 * The typing profile for the current audience and preset: kit parseSkill lets
 * the settings win over what was stored (audience, mode), keeping the measures.
 */
export function loadSkill(audience: Audience, mode: SkillMode, store: KeyStore = safeLocalStorage): SkillProfile {
  const { value, from } = loadKey("skill", store);
  return from === "default" ? parseSkill(null, audience, mode) : parseSkill(serializeSkill(value), audience, mode);
}

// ── Other keys of the game ──────────────────────────────────────────────────

/** JSON storage for the app's other keys (learning queue, vocabulary level, pace memory); kit safe-storage underneath. */
export interface JsonStore {
  readJson(key: string): unknown;
  writeJson(key: string, value: unknown): boolean;
}

export const gameStorage: JsonStore = {
  readJson: (key) => safeLocalStorage.readJson(key),
  writeJson: (key, value) => safeLocalStorage.writeJson(key, value),
};
