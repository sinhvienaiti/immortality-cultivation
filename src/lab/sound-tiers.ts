/** Ticket 269: playback targets include the nominal event, bus and master gains. */
export type SoundTier = "T2" | "T3" | "T4" | "T5" | "T6" | "voice";
export type SoundBus = "combat" | "voice" | "world";

export const SOUND_TIER: Record<string, SoundTier> = {
  cast: "T2", "release-auto": "T2", flyby: "T2", "flyby-fire": "T2",
  "impact-flesh": "T3", "impact-flesh-fire": "T3",
  "impact-stone": "T3", "impact-stone-fire": "T3",
  "impact-spirit": "T3", "impact-spirit-fire": "T3", death: "T3", "death-fire": "T3",
  release: "T4", "release-k1": "T4", "release-k1-fire": "T4", "release-k2": "T4",
  "release-guard": "T4", "release-dash": "T4", "release-k4": "T4",
  "release-k5": "T5", "release-k7": "T5", "release-k7-fire": "T5",
  "world-open": "T5", "world-open-fire": "T5", "world-close": "T5", "world-close-fire": "T5",
  "world-climax": "T6", "world-climax-fire": "T6",
  callout: "voice", "callout-k2": "voice", "callout-guard": "voice",
  "callout-k4": "voice", "callout-k5": "voice", "callout-k7": "voice",
};
export const TIER_TARGET = { T2: -18, T3: -18, T4: -13.5, T5: -11.5, T6: -9 } as const;
export const BUS_GAIN: Record<SoundBus, number> = { combat: 0.8, voice: 0.95, world: 0.85 };
export const MASTER_GAIN = 0.9;
export const VERB_RETURN = 0.7;
export const busOf = (id: string): SoundBus => id.startsWith("callout") ? "voice" : id.startsWith("world-") ? "world" : "combat";

export const NOMINAL_GAIN: Record<string, number> = Object.fromEntries(Object.keys(SOUND_TIER).map((id) => {
  const base = id.replace(/-fire$/, "");
  const gain = base === "cast" ? 0.5 : base === "flyby" ? 0.55 : base === "death" ? 0.6
    : base.startsWith("impact-") ? 0.9 : base === "release-auto" ? 0.6
    : base === "release-k5" || base === "world-climax" || busOf(id) === "voice" ? 1 : 0.85;
  return [id, gain];
}));
export function staticDb(id: string): number {
  return 20 * Math.log10((NOMINAL_GAIN[id] ?? 1) * BUS_GAIN[busOf(id)] * MASTER_GAIN);
}

export const SEND_LEVEL: Record<string, number> = Object.fromEntries(Object.entries(SOUND_TIER).map(([id, tier]) => [
  id, tier === "voice" ? 0.08 : id.startsWith("impact-") || id === "cast" ? 0.05
    : id.startsWith("death") || id.startsWith("flyby") || id === "release-auto" ? 0.1
    : tier === "T6" ? 0.45 : tier === "T5" ? 0.4 : 0.25,
]));

// Generated from tests/lab/fixtures/sound-audit-summary.json by scripts/audio/lab-sound-tiers.mjs trims.
// Audit 04/11/2026; release-k7 uses only the measured 03a.ogg. Voice keeps its existing gains.
export const SOUND_TRIM_DB: Record<string, number> = {
  "callout": 0,
  "callout-guard": 0,
  "callout-k2": 0,
  "callout-k4": 0,
  "callout-k5": 0,
  "callout-k7": 0,
  "cast": 7.9,
  "death": 2.3,
  "death-fire": 1.2,
  "flyby": 5.9,
  "flyby-fire": 8.7,
  "impact-flesh": -3.6,
  "impact-flesh-fire": -3.0,
  "impact-spirit": -4.0,
  "impact-spirit-fire": -3.9,
  "impact-stone": -4.1,
  "impact-stone-fire": -3.7,
  "release": 2.2,
  "release-auto": 4.3,
  "release-dash": 5.0,
  "release-guard": -1.6,
  "release-k1": 1.0,
  "release-k1-fire": 4.3,
  "release-k2": 1.0,
  "release-k4": 0.4,
  "release-k5": -0.1,
  "release-k7": 1.1,
  "release-k7-fire": 2.5,
  "world-climax": 2.3,
  "world-climax-fire": 2.1,
  "world-close": 2.4,
  "world-close-fire": 2.9,
  "world-open": 4.1,
  "world-open-fire": 1.4,
};

export function trimGain(id: string): number {
  return 10 ** ((SOUND_TRIM_DB[id] ?? 0) / 20);
}
