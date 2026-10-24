// Source: games/space-typing@survival-s0 src/feedback/kill-translation.ts (kit copy: any word with en / vi / ipa; log fixes in shared/game-kit/DRIFT.md)
/**
 * The meaning shown when a word's foe goes down: its IPA and Vietnamese, at
 * the top of the view, where it fell, or both; settings a game keeps and
 * sanitizes, and a queue that never lets fast kills pile up.
 */

/** What a kill translation shows (a vocabulary entry has these fields). */
export type TranslatedWord = { en: string; vi: string; ipa: string };

export type KillTranslationSize = "small" | "medium" | "large";
export type KillTranslationMode = "top" | "kill-position" | "both";

export type KillTranslationSettings = {
  enabled: boolean;
  mode: KillTranslationMode;
  showIpa: boolean;
  showVietnamese: boolean;
  size: KillTranslationSize;
  durationSeconds: number;
};

export const DEFAULT_KILL_TRANSLATION_SETTINGS: Readonly<KillTranslationSettings> = {
  enabled: true,
  mode: "top",
  showIpa: true,
  showVietnamese: true,
  size: "large",
  durationSeconds: 2.4,
};

export function sanitizeKillTranslationSettings(value: unknown): KillTranslationSettings {
  const raw = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const duration = raw.durationSeconds;
  return {
    enabled: typeof raw.enabled === "boolean"
      ? raw.enabled
      : DEFAULT_KILL_TRANSLATION_SETTINGS.enabled,
    mode:
      raw.mode === "top" || raw.mode === "kill-position" || raw.mode === "both"
        ? raw.mode
        : DEFAULT_KILL_TRANSLATION_SETTINGS.mode,
    showIpa: typeof raw.showIpa === "boolean"
      ? raw.showIpa
      : DEFAULT_KILL_TRANSLATION_SETTINGS.showIpa,
    showVietnamese: typeof raw.showVietnamese === "boolean"
      ? raw.showVietnamese
      : DEFAULT_KILL_TRANSLATION_SETTINGS.showVietnamese,
    size:
      raw.size === "small" || raw.size === "medium" || raw.size === "large"
        ? raw.size
        : DEFAULT_KILL_TRANSLATION_SETTINGS.size,
    durationSeconds: typeof duration === "number" && Number.isFinite(duration)
      ? Math.round(Math.max(0.8, Math.min(5, duration)) * 10) / 10
      : DEFAULT_KILL_TRANSLATION_SETTINGS.durationSeconds,
  };
}

export function usesTopKillTranslation(
  settings: KillTranslationSettings,
): boolean {
  return settings.enabled && (settings.mode === "top" || settings.mode === "both");
}

export function usesKillPositionTranslation(
  settings: KillTranslationSettings,
): boolean {
  return settings.enabled && (
    settings.mode === "kill-position" || settings.mode === "both"
  );
}

export function hasVisibleKillTranslation(
  entry: TranslatedWord,
  settings: KillTranslationSettings,
): boolean {
  return settings.enabled && (
    (settings.showIpa && entry.ipa.trim().length > 0) ||
    (settings.showVietnamese && entry.vi.trim().length > 0)
  );
}

/** FIFO active item plus at most two pending words; excess replaces oldest pending. Entries are copied. */
export class KillTranslationQueue<T extends TranslatedWord = TranslatedWord> {
  private active: T | null = null;
  private readonly pending: T[] = [];

  enqueue(entry: T): boolean {
    if (this.active === null) {
      this.active = { ...entry };
      return true;
    }
    if (this.pending.length >= 2) this.pending.shift();
    this.pending.push({ ...entry });
    return false;
  }

  peek(): T | null {
    return this.active === null ? null : { ...this.active };
  }

  advance(): T | null {
    this.active = this.pending.shift() ?? null;
    return this.peek();
  }

  clear(): void {
    this.active = null;
    this.pending.length = 0;
  }

  get queuedCount(): number {
    return this.pending.length;
  }
}
