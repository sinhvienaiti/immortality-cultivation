// Kit module three/: Space's model loading and contracts, 3D stage, rigged hero, particles, shaders and guide view (three is a peer).
export {
  MODEL_CONTRACTS,
  MODEL_KINDS,
  isModelKind,
  missingClips,
  missingSockets,
  modelKey,
  type ModelContract,
  type ModelKind,
  type ModelManifest,
  type ModelManifestEntry,
  type ModelTier,
} from "./model-contracts";
export {
  ModelLibrary,
  SPACE_MODEL_MANIFEST_URL,
  loadModel,
  parseModelManifest,
  pickModelTier,
  resolveModelUrl,
  type ManifestFetch,
  type ModelLibraryOptions,
  type VisualQuality,
} from "./model-loader";
export { SPACE_LIGHTS, STAGE_TIERS, Stage3D, type StageLights, type StageOptions, type StageTier } from "./stage";
export { HERO_CLIPS, Hero, type HeroOptions, type Locomotion, type ShotName } from "./hero";
export { FlameTrail, LightTrail, ParticlePool, Ribbon, type SpawnOptions } from "./particles";
export {
  ATMOSPHERE_FRAGMENT,
  BEAM_FRAGMENT,
  FIREBALL_FRAGMENT,
  FIREBALL_VERTEX,
  FLAME_FRAGMENT,
  FLAME_VERTEX,
  LIGHT_TRAIL_FRAGMENT,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  PILLAR_FRAGMENT,
  RIBBON_FRAGMENT,
  RIBBON_VERTEX,
  SHIELD_FRAGMENT,
  TURNING_PARTICLE_FRAGMENT,
  TURNING_PARTICLE_VERTEX,
  fxMaterial,
  glowSprite,
} from "./materials";
export { fireImages, textures, type FireImageNames, type FireImages, type TextureLibrary } from "./textures";
export { COLORS, approach, clamp, damp, easeOut, emitCount, rand, randomUnit, scratch, type Random } from "./util";
export { GUIDE_CLIPS, createGuideScene, type GuideAction, type GuideScene, type GuideSceneOptions } from "./guide-scene";
