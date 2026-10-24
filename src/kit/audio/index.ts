// Multi-bus Web Audio mixer that plays a game's own sound table, plus the dragon voices.
export { DEFAULT_AUDIO_BASE, audioUrl } from "./util";
export {
  AUDIO_GROUPS,
  AUDIO_GROUP_GAIN,
  BusMix,
  DEFAULT_BUSES,
  PRONUNCIATION_DUCK,
  mixedSfxGain,
  setPronunciationBoost,
  type AudioGroup,
  type BusSpec,
  type BusTable,
} from "./mix";
export {
  DRAGON_SAMPLES,
  SCENE_VOICES,
  bufferStats,
  noiseBuffer,
  recordedVoice,
  synthVoice,
  voiceBus,
  voiceStats,
  type DragonSample,
  type SceneVoice,
} from "./dragon-voice";
export {
  SceneAudio,
  type PlayOptions,
  type SceneAudioOptions,
  type SoundSpec,
  type SoundTable,
} from "./scene-audio";
