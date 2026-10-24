// Source: games/space-typing/src/scene3d/util.ts (clamp, rand) plus the audio URL rule.

export const DEFAULT_AUDIO_BASE = "/assets/audio/";

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
export const rand = (low: number, high: number): number => low + Math.random() * (high - low);

/** A sound path under the audio base; absolute paths and full URLs are kept as given. */
export function audioUrl(path: string, audioBase = DEFAULT_AUDIO_BASE): string {
  if (path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return (audioBase.endsWith("/") ? audioBase : audioBase + "/") + path;
}
