// Kit module feedback/: Sinh Tồn S0's combat feedback (feat/survival-s0 src/feedback) with a per-game profile (ship, dragon, td).
export { STOP_GAP_MS, SWEEP, TIERS, tier, type SweepRules, type TierId, type TierProfile } from "./tiers";
export { DRAGON, FEEDBACK_PROFILES, PRONUNCIATION_EVENT, SHIP, TD, feedbackProfile, type FeedbackProfile, type FeedbackProfileId } from "./profiles";
export { BlowQueue, HitStop } from "./hitstop";
export { Trauma } from "./trauma";
export { Reactions, squashAt } from "./reaction";
export { Debris, type DebrisOptions } from "./debris";
export { NUMBER_ATLAS, NumberField, NumberSprites, STYLE, digitCellWidth, popScale, type GlyphMetrics, type Rect } from "./numbers";
export { instancedQuads, uploadQuads } from "./quads";
export { AudioCues, CUE_BUS_GAIN, keyStepRatio, pentatonicRatio, type AudioCuesOptions, type CueBus } from "./audio-cues";
export {
  DEFAULT_KILL_TRANSLATION_SETTINGS,
  KillTranslationQueue,
  hasVisibleKillTranslation,
  sanitizeKillTranslationSettings,
  usesKillPositionTranslation,
  usesTopKillTranslation,
  type KillTranslationMode,
  type KillTranslationSettings,
  type KillTranslationSize,
  type TranslatedWord,
} from "./kill-translation";
