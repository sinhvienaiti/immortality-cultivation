/**
 * The element layer's contract (canon D59, owner 03/11/2026; docs/games/tu-tien/skills/ELEMENT_LAYER.md): a skill
 * is a weapon's SHAPE (paths, counts, timing, targets, the real sword's silhouette: sword-skills.ts,
 * myriad-swords.ts) drawn in an element's MATERIAL (this kit). The player picks the element apart from the weapon.
 *
 * Hard rule: replace, never stack. Picking Fire draws the same shapes with the Fire kit; Metal's layers are not
 * drawn underneath. Each phase hook below stands for one Metal layer: a hook that returns true has drawn that layer
 * in its element and Metal's is skipped; false (or no hook) lets the base layer draw, in this kit's palette. A kit
 * that is still being built may decline a slot it has not made yet.
 *
 * Metal (element-metal.ts) has no hooks: its layers ARE the base layers of the sword modules, so Metal looks
 * exactly as it did before the element layer (before/after captures, docs/changelog/2026-11-03-lab-element-fire.md).
 * Hooks are called on the frame the shape asks for them, with argument objects reused for every call (read them
 * during the call, keep nothing). View only: nothing here touches the sim.
 */
import type * as THREE from "three";
import type { SwordSlot, SwordSkillTextures } from "./sword-skills";
import type { Rgb, WeaponDef, WeaponElement, WeaponGlow } from "./weapons";
import type { ElementStage } from "./element-stage";

export type ElementId = WeaponElement;

/** VFX_STANDARD §3's five phases. */
export type ElementPhase = "charge" | "release" | "travel" | "impact" | "aftermath";

/** A colour ramp from the hottest to the darkest part of the element's matter (linear; core may be HDR-ready unit). */
export interface ElementRamp {
  /** The thin hottest core (Fire: white-gold). Only cores reach the bloom threshold. */
  readonly core: Rgb;
  /** The edge or rim just outside the core (Fire: amber). */
  readonly edge: Rgb;
  /** The body (Fire: vermilion-orange). Kept ≤ ~0.9 when drawn, so it survives tone mapping in its own hue. */
  readonly body: Rgb;
  /** The dark under-layer and residue (Fire: soot). */
  readonly soot: Rgb;
}

/** The real sword's material mode (sword-material.ts SWORD_LOOK): Metal's steel, Fire's furnace. */
export interface BladeLook {
  readonly mode: "steel" | "furnace";
  /** The edge line's light (linear HDR): Metal's cyan-tinted white EDGE_HOT, Fire's molten white-gold. */
  readonly edge: Rgb;
  /** Furnace: the heat band's light from the spine to the edges (linear, ≤ 0.9) and the body's albedo share (hot iron). */
  readonly heat?: Rgb;
  readonly char?: number;
}

/**
 * A trail drawn as flame (fxkit RibbonPool.setFlame): a clip of the kit's flipbook folder used as the flame band, and
 * the heat ramp it is coloured through (linear: soot edge, deep body, amber body, white-gold core).
 */
export interface FlameTrail {
  readonly clip: string;
  readonly soot: Rgb;
  readonly deep: Rgb;
  readonly amber: Rgb;
  readonly core: Rgb;
}

/** Ribbon trails behind flying swords (sword-skills.ts launch, Nhất Tuyến, the guard): width and HDR core; the rim is the slot's palette rim. */
export interface TrailLook {
  readonly widthM: number;
  readonly core: Rgb;
  /** Share of the slot's rim on a flight's trail (Metal 0.8). */
  readonly rimK: number;
  /** The weapon's silk ribbons fly beside the trail (Clear Wind's tassel). */
  readonly silk: boolean;
  /** Drawn as flame instead of sword-light (absent: light). */
  readonly flame?: FlameTrail;
}

/** Key 7's (myriad-swords.ts) light, drawn from constants before the element layer. */
export interface StreamTone {
  /** Hot cores of strikes, glints and seams (linear, × 2.4–6 where drawn). */
  readonly core: Rgb;
  /** Halos, rims and ground rings (≤ 0.95). */
  readonly halo: Rgb;
  /** The thin trail core behind every sword (HDR). */
  readonly trailCore: Rgb;
  /** The impact light's colour (sRGB hex) and the beast hit tints of a river sword and of the cut (0xRRGGBB). */
  readonly flash: string;
  readonly hitRgb: number;
  readonly cutRgb: number;
  /** The damage numbers' tint for key 7 (linear). */
  readonly number: Rgb;
  /** The finisher's slash (qi-slash.ts): its hot core, its body (dark and lit) and its falloff. */
  readonly slash: { readonly white: Rgb; readonly body: Rgb; readonly bodyLit: Rgb; readonly deep: Rgb };
}

/** What a blow leaves on the ground (GroundDecalPool.spawn), when the kit's aftermath draws a decal. */
export interface GroundAftermath {
  /** Texture name the host resolves (ElementStage.texture): A = coverage, R = detail; null: the pool's procedural char. */
  readonly texture: string | null;
  /** Seconds it lies there; share of its life it grows in over, and the share at which it starts to erode away. */
  readonly life: number;
  readonly growIn: number;
  readonly erodeFrom: number;
  /** Its body colour (normal blend, linear) and opacity. */
  readonly body: Rgb;
  readonly alpha: number;
  /** A glowing edge that cools over its life (linear, HDR allowed; zero: none) and how fast it cools (1/s). */
  readonly heat: Rgb;
  readonly cool: number;
}

/** One reaction state a foe can carry (ELEMENT_LAYER §3 "Foe status"). */
export type FoeStatusKind = "cut" | "burn" | "wet" | "rooted" | "crushed" | "shocked" | "swept" | "frozen";

/** The status a blow of this element leaves on a foe (TargetField.status). */
export interface FoeStatus {
  readonly kind: FoeStatusKind;
  readonly seconds: number;
  /** Its colour on the foe (0xRRGGBB, the rim's tint). */
  readonly rgb: number;
}

/**
 * The element's screen accent (screen-fx.ts): its big-hit flash and the shared distortion pass. Metal has none;
 * Fire's warm flash and heat haze land with the Fire look (the distortion pass only if the budget allows).
 */
export interface ScreenAccent {
  /** Warm or tinted flash on big hits (linear tint, strength 0–1); null: none. */
  readonly flash: { readonly tint: Rgb; readonly strength: number } | null;
  /** Share of the shared distortion pass (heat haze, refraction, pressure); 0: none. */
  readonly distortion: number;
  /**
   * The graphic impact frames' palette (screen-fx.ts ImpactPass; display values): the dark frame's world tone, the
   * inverted frame's paper and the accent round figures and cores. Absent: the frames' own (Metal's navy and cyan).
   */
  readonly frames?: {
    readonly navy: Rgb;
    readonly paper: Rgb;
    readonly accent: Rgb;
    /**
     * The element's own colour per role (screen-fx.ts FramePalette.roles): the dark frame's focus rays and strike,
     * the inverted frame's focus lines (and its light as dark shapes), strokes (cores, brush burst) and the figures'
     * contour. Absent: Metal's roles (cyan rays, a white strike, navy lines, ink strokes, cyan contour).
     */
    readonly roles?: { readonly rays: Rgb; readonly strike: Rgb; readonly lines: Rgb; readonly strokes: Rgb; readonly contour: Rgb };
  };
}

/**
 * How the caster's seal and its rings are drawn (03/11 fixes; sword-skills.ts' seal, fxkit GroundSigil). Absent:
 * Metal's added light in the slot's colours. "solid": matter, not light: every stroke on a soot underlay (normal
 * blend), its body covering the stone in `body` (lit toward `lit` as the seal blazes), and only a thin hot line down its
 * middle added (`core`, HDR with the blaze), so it stays saturated on pale stone instead of bleaching to peach; it
 * comes and goes by erosion.
 */
export interface SigilLook {
  readonly mode: "solid";
  /** The underlay (linear; keep it near neutral, its fringe over pale stone must not tint it) and its opacity. */
  readonly soot: Rgb;
  readonly sootAlpha: number;
  /** The stroke's body, cool and lit (linear, ≤ 0.9 a channel: they never bloom). */
  readonly body: Rgb;
  readonly lit: Rgb;
  /** The thin hot line (linear, unit max; × the seal's glow, HDR while it blazes). */
  readonly core: Rgb;
}

/** The base sprite sheets a kit may swap, by layer (SwordSkillTextures' keys). */
export type SwordTextureLayer = keyof SwordSkillTextures;

export interface CasterPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

// ── Hook arguments (one object per kind, reused) ─────────────────────────────

export interface ChargeKeyArgs {
  slot: SwordSlot;
  /** Typing progress after this key (0..1). */
  p: number;
  hand: THREE.Vector3;
  caster: CasterPose;
  /** Points where something appeared on this key (Ngự Kiếm's blades behind the shoulders, the array's corners): the first `count`. */
  readonly appeared: THREE.Vector3[];
  count: number;
  pal: WeaponGlow;
}

export interface ChargeFrameArgs {
  /** The word owning the seal (the one typed, else the last cast). */
  slot: SwordSlot;
  /** The gathering level shown (0..1, eased toward the typing progress; it falls after the release). */
  level: number;
  /** Shown visibility of the level's layers (smoothstep of its first 30 %). */
  vis: number;
  /** The ultimate's size share (0..1) and the layers' scale (1 + 0.5 × big). */
  big: number;
  scale: number;
  /** A word is being typed now. */
  typing: boolean;
  dt: number;
  hand: THREE.Vector3;
  caster: CasterPose;
  pal: WeaponGlow;
}

export interface ReleaseArgs {
  slot: SwordSlot;
  /** The lab skill whose release this is ("k7" for key 7's burst, else the slot). */
  skill: string;
  /** 1 basic, 2 light skill, 3 skill, 5 ultimate. */
  tier: number;
  size: number;
  intensity: number;
  /** Ground ring radius (m; 0 none). */
  ringM: number;
  /** The release point: the hand pushed a little along the blow. */
  at: THREE.Vector3;
  hand: THREE.Vector3;
  caster: CasterPose;
  pal: WeaponGlow;
}

export interface LaunchArgs {
  slot: SwordSlot;
  /** Where the blade leaves from (Ngự Kiếm's shoulder socket) and which of the skill's blades it is. */
  at: THREE.Vector3;
  index: number;
  pal: WeaponGlow;
}

export interface TravelArgs {
  slot: SwordSlot;
  /** The sword's slot in the blade set (a stable seed). */
  blade: number;
  /** The sword's guard point, its unit tip direction, the blade's length to the tip (m). */
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  tipM: number;
  /** Flight progress 0..1 and the world step. */
  u: number;
  dt: number;
  pal: WeaponGlow;
}

export interface ImpactArgs {
  slot: SwordSlot;
  at: THREE.Vector3;
  scale: number;
  /** Unit ground direction of the blow. */
  dx: number;
  dz: number;
  power: number;
  big: boolean;
  pal: WeaponGlow;
}

export interface CutArgs {
  slot: SwordSlot;
  at: THREE.Vector3;
  /** Screen angle of the cut (rad) and its size. */
  rot: number;
  size: number;
  pal: WeaponGlow;
}

export interface AreaHitArgs {
  slot: SwordSlot;
  at: THREE.Vector3;
  dx: number;
  dz: number;
  power: number;
  /** This beast takes the area's marked share (a glint, ink) by tier density. */
  marked: boolean;
  pal: WeaponGlow;
}

export interface AreaBurstArgs {
  slot: SwordSlot;
  x: number;
  y: number;
  z: number;
  beasts: number;
  scale: number;
  pal: WeaponGlow;
}

export interface AftermathArgs {
  slot: SwordSlot;
  x: number;
  z: number;
  r: number;
  life: number;
  /** Motes or embers a second at its start. */
  rate: number;
  pal: WeaponGlow;
}

export interface DeathArgs {
  slot: SwordSlot;
  at: THREE.Vector3;
  dx: number;
  dz: number;
  radius: number;
  pal: WeaponGlow;
}

/** Phase hooks of sword-skills.ts (the Kiếm slots, key 1's Threefold Sword Command among them). */
export interface SwordHooks {
  /**
   * Charge: every frame a blade waits at its place for its launch (Ngự Kiếm's blades behind the shoulders): its guard
   * point, tip direction and length as TravelArgs (`u` is its presence 0..1). Replaces the glint running up it.
   */
  waiting?(a: TravelArgs): boolean;
  /** Charge: one key of a word (keyBeat's glint, star, ground pulse, a blade's arrival). */
  chargeKey?(a: ChargeKeyArgs): boolean;
  /** Charge: every frame while the caster gathers (updateAura's halo, ground glow and dark disc, rising and spiralling motes; the seal stays). */
  chargeFrame?(a: ChargeFrameArgs): boolean;
  /** Release at the caster (releaseFlash's flare, stars, rings, rays, pillar, sparks, motes; the seal's blaze and the impact light stay). */
  release?(a: ReleaseArgs): boolean;
  /** Release: a later blade leaving its place after the cast (Ngự Kiếm's second and third blades at the shoulder). */
  launch?(a: LaunchArgs): boolean;
  /** Travel: every frame of a flying sword (the tip glint and what it sheds; the sword and its trail are drawn by the shape). */
  travel?(a: TravelArgs): boolean;
  /** Impact: a full hit on a beast (impact, basicImpact). */
  impact?(a: ImpactArgs): boolean;
  /** Impact: the crescent cut across a blow (slashAt). */
  cut?(a: CutArgs): boolean;
  /** Impact: one light hit inside an area blow (strikeLight). */
  areaHit?(a: AreaHitArgs): boolean;
  /** Impact: an area blow's one burst (burstAt). */
  areaBurst?(a: AreaBurstArgs): boolean;
  /** Aftermath of a blow (aftermath's ground glow and rising motes). */
  aftermath?(a: AftermathArgs): boolean;
  /** A foe falls (death's smoke, motes and wisp). */
  death?(a: DeathArgs): boolean;
  /** Every frame after the skills (the kit's own emitters). */
  frame?(dt: number): void;
  reset?(): void;
}

export interface StreamStrikeArgs {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  /** The blow's size: 0.6 a far sword, 0.9 a mid sword, 1.3 a lead blade, 2 a lead blade grown in the river. */
  k: number;
}

export interface StreamGlintArgs {
  x: number;
  y: number;
  z: number;
  /** Size share (glint), or the stream's brightness there × 3 (river glitter). */
  k: number;
  /** True for the river's glitter (riverLight), false for a glint shed by a sword. */
  river: boolean;
}

export interface StreamSegmentArgs {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface StreamSparkArgs {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** A key-7 sword as drawn this frame (myriad-swords.ts drawSwords). */
export interface StreamTravelArgs {
  /** The sword's middle (m), unit tip direction, shown length (m). */
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  /** 0 lead blade, 1 mid sword, 2 far sword. */
  cls: number;
  /** Its stream brightness (0..1), its dissolve (0 whole … 1 gone), and whether it dives on a beast now. */
  bright: number;
  dissolve: number;
  diving: boolean;
  /** The trail length Metal would draw behind its pommel (m; 0 for a lead blade, which has its ribbon). */
  trailM: number;
}

export interface StreamSeamArgs {
  /** The beast and the stroke's ground direction. */
  target: number;
  ux: number;
  uz: number;
}

/** Phase hooks of myriad-swords.ts (key 7). Its release is sword-skills' `release` with skill "k7". */
export interface StreamHooks {
  /** Travel: every sword drawn this frame (its trail behind its pommel; the sword is drawn by the shape). */
  travel?(a: StreamTravelArgs): boolean;
  /** Impact: a river sword or lead blade reaches its beast (impactAt). */
  strike?(a: StreamStrikeArgs): boolean;
  /** Impact and aftermath: a lead blade's heavy blow on the ground (leadImpact). */
  leadStrike?(a: { x: number; z: number }): boolean;
  /** Travel: a glint shed by a sword, and the river's glitter. */
  glint?(a: StreamGlintArgs): boolean;
  /** Aftermath: the finisher's cut on the ground (finisherBeam's scar and seam). */
  finisher?(a: StreamSegmentArgs): boolean;
  /** Impact: a spark thrown off the finisher's slash (slashSpark). */
  slashSpark?(a: StreamSparkArgs): boolean;
  /** Impact: a big beast's slice seam (cutReact). */
  cutSeam?(a: StreamSeamArgs): boolean;
  frame?(dt: number): void;
  reset?(): void;
}

export interface ElementHooks {
  readonly sword?: SwordHooks;
  readonly stream?: StreamHooks;
}

export interface ElementKit {
  readonly id: ElementId;
  /** English name the lab shows. */
  readonly name: string;
  /** Its law, read at 40–100 px before its colour (ELEMENT_LAYER §2). */
  readonly verb: string;
  /** The kit this one draws as until its own look lands (the lab names it); absent once it is built. */
  readonly fallback?: ElementId;
  readonly ramp: ElementRamp;
  /** Each sword slot's colours with the equipped weapon (load time; may allocate). */
  palette(def: WeaponDef, slot: SwordSlot): WeaponGlow;
  readonly stream: StreamTone;
  readonly trail: TrailLook;
  readonly blade: BladeLook;
  /**
   * Sprite sheets it swaps in for base layers (names the host resolves; the whole pool of that layer takes it).
   * When the host gives sparks or motes the glow's sheet (the lab does), they share the glow's pool and only `glow`
   * swaps them; a kit that wants its own sparks draws them in a pool of its own (ElementStage.pool).
   */
  readonly textures: Partial<Record<SwordTextureLayer, string>>;
  /** Flipbook clips it draws, by phase (ids in art-src/lab/vfx/<id>/manifest.json); the stage loads them with the kit. */
  readonly flipbooks: Partial<Record<ElementPhase, readonly string[]>>;
  readonly ground: GroundAftermath | null;
  readonly foe: FoeStatus | null;
  readonly screen: ScreenAccent;
  /** The caster's seal and its rings (absent: Metal's added light). */
  readonly sigil?: SigilLook;
  /** Sound suffix: the lab's bus plays "<event>-<sound>" when it has files, else "<event>" ("" for Metal). */
  readonly sound: string;
  /** Builds the kit's own layers once per stage (load time: pools, flipbooks, decals) and returns its hooks. */
  attach?(stage: ElementStage): ElementHooks;
}
