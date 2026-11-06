/** Ticket 269: playback targets include the nominal event, bus and master gains. */
export type SoundTier = "T2" | "T3" | "T4" | "T5" | "T6" | "voice";
export type SoundBus = "combat" | "voice" | "world";

export const SOUND_TIER: Record<string, SoundTier> = {
  cast: "T2", "release-auto": "T2", flyby: "T2", "flyby-fire": "T2",
  "impact-flesh": "T3", "impact-flesh-fire": "T3",
  "impact-stone": "T3", "impact-stone-fire": "T3",
  "impact-spirit": "T3", "impact-spirit-fire": "T3", death: "T3", "death-fire": "T3",
  release: "T4", "release-k1": "T4", "release-k1-fire": "T4", "release-k2": "T5",
  "release-guard": "T4", "release-dash": "T4", "release-k4": "T5",
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
  "release-k2": 3.0,
  "release-k4": 2.4,
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

// ── The mix pass (06/11/2026; game-art-pipeline references/audio.md §5.4–5.5; REF_VIDEO_LESSONS lesson 11) ──────────

/**
 * Each lab skill's class: normal skills sit near the mix's level, heavy ones about 6 LU over it, ultimates about 9 LU
 * over it in short-term windows. Keys 2 and 5 (release-k2, release-k4) moved to T5 with it: they were as loud as key 1.
 * Keys 8 and 9 take their class from the skill (an ultimate's damage: "ult", else "heavy").
 */
export type SkillClass = "normal" | "heavy" | "ult";
export const SKILL_CLASS: Readonly<Record<string, SkillClass>> = {
  auto: "normal", k1: "normal", guard: "normal", dash: "normal", kc: "normal",
  k2: "heavy", k4: "heavy", km: "heavy",
  k5: "ult", k7: "ult",
};
export const classOf = (slot: string): SkillClass => SKILL_CLASS[slot] ?? "heavy";

/** A callout's trim by its skill's class (dB): every shout played at about −10 LUFS-M, over a normal skill's own blows. */
export const CALLOUT_TRIM_DB: Readonly<Record<SkillClass, number>> = { normal: -6, heavy: -3, ult: 0 };

/** The playback target (LUFS momentary max, bus and master in) of keys 8 and 9's Firefly files by class: T5 and T6. */
export const FIREFLY_TARGET: Readonly<Record<"heavy" | "ult", number>> = { heavy: TIER_TARGET.T5, ult: TIER_TARGET.T6 };

/**
 * Momentary max (LUFS, 400 ms) and true peak (dBTP) of every Firefly take the lab plays, by ffmpeg ebur128 as ticket
 * 269's audit (06/11/2026; tt-sfx-x-immortal-sword-progenitor-avatar take 4 measured −37.3, near silent: take 3 plays).
 */
export const FIREFLY_LEVELS: Readonly<Record<string, readonly [number, number]>> = {
  "tt-sfx-x-myriad-lotus-domain/take1.wav": [-9.1, 0],
  "tt-sfx-x-firmament-sundering-cleave/take3.wav": [-7.4, 0],
  "tt-sfx-x-nine-heavens-tribulation-net/take2.wav": [-7.7, 0],
  "tt-sfx-x-karmic-ember-tempest/take1.wav": [-8.2, 0],
  "tt-sfx-x-glacial-moon-tide/take2.wav": [-6.8, 0.1],
  "tt-sfx-x-samsara-blood-mandala/take2.wav": [-10.4, -0.2],
  "tt-sfx-x-astral-meteor-constellation/take2.wav": [-16, -8.3],
  "tt-sfx-x-miasma-briar-abyss/take2.wav": [-17, 0],
  "tt-sfx-x-azure-cloud-dragon/take4.wav": [-7.8, 0],
  "tt-sfx-x-white-fiend-tiger/take2.wav": [-5.3, 0],
  "tt-sfx-x-vermilion-solar-phoenix/take3.wav": [-5.6, 0],
  "tt-sfx-x-abyssal-xuanwu-tortoise/take4.wav": [-7, 0],
  "tt-sfx-x-auspicious-thunder-qilin/take1.wav": [-8.7, 0],
  "tt-sfx-x-astral-kunpeng-leviathan/take3.wav": [-7.2, -0.3],
  "tt-sfx-x-all-knowing-baize-spirit/take1.wav": [-8, -0.1],
  "tt-sfx-x-nine-tailed-celestial-fox/take4.wav": [-7.1, 0],
  "tt-sfx-x-mountain-crushing-imperial-seal/take4.wav": [-5.4, 0],
  "tt-sfx-x-primordial-chaos-bell/take3.wav": [-3.3, 0],
  "tt-sfx-x-blade-swallowing-immortal-gourd/take4.wav": [-16.7, -0.6],
  "tt-sfx-x-nine-dragon-refining-cauldron/take4.wav": [-6.8, 0],
  "tt-sfx-x-seven-treasure-suppressing-pagoda/take2.wav": [-7.9, -2.1],
  "tt-sfx-x-yin-yang-void-mirror/take3.wav": [-7.7, 0],
  "tt-sfx-x-five-element-heavenly-silk/take2.wav": [-10.3, -1],
  "tt-sfx-x-twelve-stem-nether-banners/take7.wav": [-8.9, 0],
  "tt-sfx-x-asura-six-arms-avatar/take2.wav": [-5.8, 0],
  "tt-sfx-x-myriad-palm-bodhi-avatar/take1.wav": [-7.4, 0],
  "tt-sfx-x-heaven-earth-titan-avatar/take1.wav": [-6.4, 0],
  "tt-sfx-x-polar-star-emperor-avatar/take1.wav": [-10.2, -1],
  "tt-sfx-x-nether-samsara-monarch-avatar/take3.wav": [-7.4, -0.1],
  "tt-sfx-x-immortal-sword-progenitor-avatar/take3.wav": [-15.3, -4.1],
  "tt-sfx-ult-metal-geng/take1.wav": [-8.5, 0.1],
  "tt-sfx-ult-wood-tree/take1.wav": [-6.8, 0],
  "tt-sfx-ult-water-sea/take1.wav": [-6.7, 0],
  "tt-sfx-ult-fire-spark/take1.wav": [-6.9, 0],
  "tt-sfx-ult-earth-peaks/take1.wav": [-8.1, 0],
  "tt-sfx-ult-thunder-edict/take1.wav": [-6.1, 0],
  "tt-sfx-ult-wind-firmament/take1.wav": [-7.5, 0],
  "tt-sfx-ult-ice-silence/take1.wav": [-9.3, 0.1],
  "tt-sfx-ult-dark/take1.wav": [-7.9, -0.2],
  "tt-sfx-ult-light/take1.wav": [-8.5, -0.1],
  "tt-sfx-ult-poison/take1.wav": [-6.8, 0],
  "tt-sfx-ult-blood/take1.wav": [-7, 0],
  "tt-sfx-ult-void/take1.wav": [-7.1, 0.1],
  "tt-sfx-ult-star/take1.wav": [-8.8, 0],
  "tt-sfx-pillar-thunder/take1.wav": [-7.4, 0],
  "tt-sfx-pillar-light/take1.wav": [-13.5, -2.4],
  "tt-sfx-pillar-meteor/take1.wav": [-8, 0],
  "tt-sfx-streak-count/take4.wav": [-30.2, -10.3],
  "tt-sfx-streak-flash/take3.wav": [-15.1, -0.8],
  "tt-sfx-streak-tier-up/take3.wav": [-16.7, -5.4],
  "tt-sfx-streak-break/take4.wav": [-25.9, -10.2],
  "tt-sfx-channel-start/take2.wav": [-8.6, 0],
  "tt-sfx-channel-loop/take8.wav": [-10.8, 0],
  "tt-sfx-channel-pulse/take3.wav": [-5.7, 0],
  "tt-sfx-channel-pulse/take6.wav": [-9.4, 0],
  "tt-sfx-channel-collapse/take1.wav": [-9.4, -0.1],
  "tt-sfx-meteor-slant-fall/take2.wav": [-6.9, 0],
  "tt-sfx-meteor-slant-fall/take7.wav": [-5.1, 0],
};

/** The gain that brings Firefly take `file` to `target` (LUFS-M with its bus and master) without passing −1 dBTP; 1 unmeasured. */
export function fireflyGain(file: string, target: number, bus: SoundBus | "ui"): number {
  const level = FIREFLY_LEVELS[file];
  if (level === undefined) return 1;
  const fixed = 20 * Math.log10((bus === "ui" ? 1 : BUS_GAIN[bus]) * MASTER_GAIN);
  return 10 ** ((Math.min(target - level[0], -1 - level[1]) - fixed) / 20);
}

/**
 * Voices sounding at once per group (audio.md §5.4 voice budget: hits 6, swarm kills 3–4, big events few): a new voice
 * over the cap fades the oldest of its group out over `fade` s, so stacked skills never pile their tails into a drone.
 * "big": keys 8 and 9's files, the ultimate world sounds and releases, the meteor's falls.
 */
export const VOICE_CAP = {
  impact: { max: 6, fade: 0.04 },
  death: { max: 4, fade: 0.05 },
  big: { max: 2, fade: 0.3 },
} as const;
export type VoiceGroup = keyof typeof VOICE_CAP;
/** Keys 8 and 9's files ring 6–7 s; a skill's aftermath lasts 1.5–2.5 s: they fade out from FIREFLY_FADE[0] over [1] s. */
export const FIREFLY_FADE = [3.6, 1.2] as const;

/**
 * The music bus (none in the lab until ?music=<url>) and its pre-duck before a big hit (lesson 11: 6–8 dB in the
 * 0.25–0.4 s before an ultimate or a big blow): down `depth` dB over `ramp` s from `lead` s before the hit, held until
 * `hold` s after it, back over `release` s.
 */
export const MUSIC = { gain: 0.35, lead: 0.3, ramp: 0.06, release: 0.5, depth: { heavy: -6, ult: -7 }, hold: { heavy: 0.35, ult: 0.8 } } as const;

/**
 * Typed keys stay clear (audio.md §5.5: tails, loops and the reverb return dip 2–4 dB at 1–4 kHz, where a key's onset
 * sits): a peaking cut on the reverb return and on loops. Keys get their own bus outside every duck when they arrive.
 */
export const SPEECH_DIP = { freq: 2000, q: 0.7, gain: -3 } as const;

/**
 * The mix's headroom and peak limiter after the master (the files keep their tiers; the sum needs room): skills cast
 * together summed to +3…+10 dBTP before (live had no limiter, so it clipped). The mix sits HEADROOM_DB lower and a
 * limiter (DynamicsCompressorNode: threshold, ratio 20, no knee) holds what is left; Chrome adds about +1.1 dB of
 * automatic make-up gain at these settings, taken off before it. The offline mix applies the same headroom and its own
 * limiter. UI sounds (and keys, when they arrive) join after it: their level stays theirs.
 */
export const LIMITER = { headroomDb: -3, thresholdDb: -2, ratio: 20, attack: 0.003, release: 0.12, makeupDb: 1.1 } as const;
