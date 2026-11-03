/**
 * The Kiếm school's skill VFX in five phases (VFX_STANDARD §3: charge while
 * typing, release at the caster ≤ 50 ms after the last key, travel, impact,
 * aftermath), after docs/games/tu-tien/skills/SKILL_CATALOG.md K0–K5 and the
 * canon hit ticks (§12.1: Phi Kiếm +18, Ngự Kiếm +6/+36/+66, Nhất Tuyến +12,
 * Lạc Kiếm Trận opens +12 then a beat every 30, Thiên Hà Kiếm Vũ
 * +30/+75/+120). Colours (owner D55, 02/11/2026): every blade, trail,
 * glow card, sigil, flash and spark copies the EQUIPPED sword (`setWeapon`):
 * its blade geometry, its rail and its element accent (weapons.ts, derived
 * with the bloom and white-core rules); steel stays cold silver, ink for
 * hits, ink smoke and spirit motes for deaths.
 * Style (owner D56, 02/11/2026): anime and mythic spectacle, not realism. The
 * caster gathers a radiant seal, halo and rising motes with the word; the
 * release bursts (flare, star, shock ring, rays, a light pillar for big
 * skills); blades fly as sword-light (hot core in a coloured halo); impacts
 * stack core flash, star, shock ring, sparks and a crescent cut, with light
 * pillars on big hits; an aura and motes linger after. Only thin HDR cores
 * bloom; halos, rings and glows stay ≤ 0.9; dark layers sit under the light.
 * Real swords (owner 03/11/2026: "hình kiếm đang rất xấu… rõ ràng chúng ta đã
 * có hình ảnh kiếm r"): every sword of these skills is the equipped weapon's
 * own textured model under the scene's light (blades.ts, sword-material.ts):
 * the full GLB for hero swords (Phi Kiếm, Ngự Kiếm, Nhất Tuyến, Hộ thân, Lạc
 * Kiếm Trận, the rain's leads, the heaven sword), its textured LOD for mid
 * swords (Thiên Hà's halo and rain), impostors of it for the gate's ring
 * (real-swords.ts). Around a sword only a narrow white-hot edge line, a thin
 * cyan trail behind it, a soft rim and impact flashes: no glow cards over the
 * blade, no graphic or flat-tinted stand-in.
 * Element layer (canon D59, ELEMENT_LAYER.md): these are the Sword's SHAPES; the material comes from the element
 * kit (`setElement`, element-kit.ts): each slot's palette, the trail, the blade's edge light, the sprite sheets,
 * and phase hooks that replace a layer (charge, release, travel, impact, aftermath, death; replace, never stack).
 * The layers drawn here are Metal's (element-metal.ts holds their colours); a kit hook that draws its own
 * skips the Metal layer it stands for.
 * View only: hits shown here are the lab's stand-ins for sim events.
 * Smooth motion (owner 02/11/2026, MOTION_PLAN step 3): no layer pops on or
 * off outside a flash (long-lived layers ease in and out, sigils reveal with
 * soft edges at a smoothed progress), blades scale in and out and turn
 * through damped directions, trails sample world time and retract when they
 * stop, and every rate is per second, so 60 and 120 Hz show the same thing.
 * Impact and identity (round 2, MOTION_PLAN; judges 5.4/5.4): every strike
 * stops the world 3–5 frames and shakes the camera (host.hitStop, host.shake),
 * K5 cracks the ground and pulls the beasts into its vortex (host.pull), the
 * release flash rises over 2–3 frames and burns behind the caster instead of
 * over it, each skill has its own seal glyph and accent inside the weapon's
 * palette (skillGlow), K2's cut cools from a glowing seam to pale ash, and
 * the flying blades carry an edge glow and a guard-to-tip gradient.
 */
import * as THREE from "three";
import { BladeSet, loadSwordModels, overlayModel } from "./blades";
import type { AftermathArgs, AreaBurstArgs, AreaHitArgs, ChargeFrameArgs, ChargeKeyArgs, CutArgs, DeathArgs, ElementKit, ImpactArgs, LaunchArgs, ReleaseArgs, SwordHooks, SwordTextureLayer, TravelArgs } from "./element-kit";
import { METAL } from "./element-metal";
import type { ElementStage } from "./element-stage";
import { approach, BeamPool, clamp01, easeInCubic, easeOutCubic, easeOutQuad, GroundSigil, pulse, Rand, RibbonPool, SEAL_SHAPE, smooth01, SpritePool, type SpriteSpec } from "./fxkit";
import { loadSwordAtlas, SwordImpostors } from "./real-swords";
import { applyBladeLook, FaceRoll } from "./sword-material";
import { AURA_FADE, AURA_FLY, AURA_LEAD, AURA_STRIKE, AURA_WAIT, type SwordAura } from "./sword-aura";
import { GroundMarks, LightStrips, MARK_RIFT, MARK_STAR, SkyGate, GATE_SWORDS } from "./sword-rain";
import type { TargetField } from "./targets";
import { DEFAULT_WEAPON, weaponById, type Rgb, type WeaponDef, type WeaponGlow, type WeaponId } from "./weapons";
import type { RibbonFlame } from "./fxkit";

export type SwordSlot = "auto" | "k1" | "k2" | "guard" | "dash" | "k4" | "k5";

export interface SwordSkillTextures {
  readonly glow: THREE.Texture; // soft round light
  readonly flare: THREE.Texture; // bright lens flare
  readonly star: THREE.Texture; // four-point star
  readonly spark: THREE.Texture; // thin spark
  readonly trace: THREE.Texture; // streak
  readonly slash: THREE.Texture; // crescent slash
  readonly mote: THREE.Texture; // small round dot
  readonly smoke: THREE.Texture; // soft smoke puff
  readonly splash: THREE.Texture; // ragged ink splash
  readonly scorch: THREE.Texture; // ground ink stain
  readonly ring: THREE.Texture; // thin ring
  readonly shock: THREE.Texture; // thick glowing ring (shock waves)
  readonly halo: THREE.Texture; // radiant concentric halo (auras, mandorlas)
  readonly twirl: THREE.Texture; // swirling crescent (spinning guard)
}

export interface SwordSkillHost {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly targets: TargetField;
  /** Caster position and facing (unit) on the ground. */
  caster(out: { x: number; z: number; fx: number; fz: number }): void;
  /** The casting hand (world). */
  hand(out: THREE.Vector3): void;
  flash(at: THREE.Vector3, colour: string, intensity: number): void;
  /** Camera kick in px along the ground direction (dx, dz). */
  impulse(px: number, dx: number, dz: number): void;
  hitStop(ms: number): void;
  /** Camera shake of about `metres` that dies in ~120 ms (the host scales it by tier and keeps it subtle). */
  shake?(metres: number): void;
  /** The field pulls the beasts within `r` of (x, z) into a swirl toward it for `seconds` (K5's vortex). */
  pull?(x: number, z: number, r: number, seconds: number): void;
  moveCaster(x: number, z: number): void;
  play(clip: "attack" | "skill1" | "skill2" | "ult" | "dash" | "idle"): void;
  /**
   * A blow landed on beast `target` from (dx, dz) (unit), the view's stand-in for the sim's hit event (the
   * lab's damage numbers, beast reactions and sounds answer it on this frame; the striking slot is `striking`).
   * `light`: one of an area's many hits. `killed`: the field says it fell.
   */
  struck?(target: number, dx: number, dz: number, power: number, light: boolean, killed: boolean): void;
}

/** Construction options: `k5Blades` overrides the tier's swarm size (lab measurements; at most K5_MAX). */
export interface SwordSkillOptions {
  readonly k5Blades?: number;
}

/** What the caster's presence layer reads each frame (src/lab/presence.ts): typing level, which skill, releases so far. */
export interface SwordSkillPresence {
  /** Typing progress shown (0..1), 0 when idle. */
  charge: number;
  slot: SwordSlot;
  /** Releases so far (a counter: a change is a new release) and the last one's tier. */
  releases: number;
  tier: number;
}

/**
 * Dark layers stay neutral whatever the weapon (linear). Light layers come
 * from the weapon's glow (weapons.ts) and scale all three channels by one
 * factor, so the accent's hue survives.
 */
const INK = [0.045, 0.05, 0.065] as const;
const SMOKE = [0.1, 0.11, 0.13] as const;
/** Sigil light level (× unit rim colour): ≤ 0.64 so the shader's 1.4 cap keeps it ≤ 0.9. */
const SIGIL_LIGHT = 0.62;

/** The flying blade of the basic shot and slot 1 (× 1.1 m): 1.55 is ~75 px at the play camera (round 3a; was 1.3). */
const FLIGHT_SCALE = 1.55;
/** Canon §12.1 hit ticks in seconds (60 Hz). */
const TICK = 1 / 60;
const T_AUTO_HIT = 18 * TICK;
const T_K1_HITS = [6 * TICK, 36 * TICK, 66 * TICK] as const;
const T_K2_HIT = 12 * TICK;
const T_K4_OPEN = 12 * TICK;
const T_K4_BEAT = 30 * TICK;
const T_K4_LIFE = 5;
const T_K5_HITS = [30 * TICK, 75 * TICK, 120 * TICK] as const;
/** Typing progress at which each Ngự Kiếm blade appears behind the shoulders. */
const K1_SHOW = [0.15, 0.45, 0.75] as const;

// Reserved sword slots. Nhất Tuyến takes two in turn, Lạc Kiếm Trận two sets of six and Phi Kiếm six
// (AUTO_N), so a new cast never steals a sword that is still on screen (folding in a wound, standing in an
// array, fading out): it would jump or pop. [0, HERO.halo) draw the full model; from HERO.halo on, the LOD.
// The rain's hero swords: its six leads, a spare, then up to six planted leads (the heaven sword has its own set).
const HERO = { k1: 0, k2: 3, guard: 5, k4: 8, auto: 20, rain: 26, halo: 40 } as const;
const AUTO_N = 6;
const HALO_N = 24;
const RAIN_PLANT_LEAD0 = HERO.rain + 7;
const RAIN_PLANT_LEADS = HERO.halo - RAIN_PLANT_LEAD0;
/** First mid sword of the rain (the LOD mesh): one slot per drop, then the planted mid swords. */
const POOL0 = HERO.halo + HALO_N;
const RAIN_DROPS = 200;
/** Kept for the lab's ?k5n= (the round-2 swarm's tier sizes); the rain draws a fixed pool. */
export const K5_MAX = 500;
/**
 * Lạc Kiếm Trận's falling swords (× 1.1 m guard to tip): 1.7 puts the whole sword at ~3 m, 2.9× the hand sword
 * (owner brief 03/11: skill swords 1.5–3× the hand sword, ≥ 20 px at the play camera).
 */
const K4_SWORD = 1.7;
/** Ribbons: sword-light trails, and a weapon's silk trails (WeaponMotif.silk) beside the flying ones. */
const RIBBONS = 64;
const EMITTERS = 16;

/**
 * Texture-space radius of the visible shape, as a share of the sprite's size
 * (measured on the Kenney CC0 sheets): circle_02 thin ring 0.28, circle_03
 * shock ring 0.36, circle_05 soft disc 0.2 (alpha ≈ 0.25), twirl_01 arc 0.44.
 */
const R_RING = 0.28;
const R_SHOCK = 0.36;
const R_DISC = 0.2;
const R_TWIRL = 0.44;
/**
 * Crops of the same sheets (SpritePoolOptions.crop): where the texture is
 * still visible. circle_05 light: an additive card adds under 1 % past radius
 * 0.25, so the quad keeps the middle 0.56 (radius 0.28). circle_05 as dark
 * ink: alpha is 4 % at radius 0.32, so 0.64. circle_02: alpha is 0 past
 * radius 0.38, so 0.78 with the fade after it. Measured 02/11 with ImageMagick.
 */
const CROP_LIGHT = 0.56;
const CROP_INK = 0.64;
const CROP_RING = 0.78;
/** Depth (m) the caster's halo sits behind the feet, so the body hides it (body radius ≈ 0.15 m plus room). */
const BEHIND_M = 0.25;
/** Per-second rates of the effects shed every frame (60 a second matches one a frame at 60 Hz). */
const SHED_RATE = 60;
const K2_SPLIT_RATE = 360;
const K5_TWINKLE_RATE = 240;
/**
 * Blade scale-in and fade-out (s), smoothstep: the first frame shows ~5 % of
 * the length and no frame changes it by more than ~21 % at 60 Hz (the 30 %
 * rule). easeOutBack (MOTION_PLAN appendix C §2.8) reaches ~50 % on its first
 * frame, so it is not used (step 1 report).
 */
const BLADE_IN_S = 0.12;
const BLADE_OUT_S = 0.12;
/** Smoothstep fade-in (s) of timed sprites in non-flash pools: ≤ ~24 % of their level per frame at 60 Hz. */
const NON_FLASH_IN_S = 0.1;
/** Shortest flare life (s): (1 − t³)² with ≥ 8 frames keeps each frame's drop under 30 % at 60 Hz. */
const FLARE_MIN_S = 0.14;
/** A typed skill's sigil (its ink base too) fades in over this time (s) from the word's first key. */
const SIGIL_IN_S = 0.15;
/** The caster's seal fades in no faster than over this time (s; drawn through smoothstep, so ≤ ~11 % a frame at 60 Hz). */
const SEAL_IN_S = 0.22;
/** Qi motes spiralling in while a word is typed (pool size). */
const QI_MOTES = 72;
/** Slots whose word draws a ground sigil. */
const SIGIL_SLOTS: readonly SwordSlot[] = ["k2", "guard", "dash", "k4", "k5"];
/** Inverse of smoothstep on [0, 1]: the share x with smooth01(x) = y. */
const invSmooth01 = (y: number): number => {
  const v = y <= 0 ? 0 : y >= 1 ? 1 : y;
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
};
/** Floats per blade pose: x y z, tip direction, scale, glow share. */
const BP = 8;
/** Typing progress shown by sigils and blades eases toward the keys at this half-life (s): no step per key (≈ 12/s). */
const REVEAL_HALF_S = 0.06;
/** A flight turns from its launch pose to its path over max(30 % of the flight, this) (s), at most 90 % of it: ≤ ~27°/frame for a 100° turn at 60 Hz. */
const FLIGHT_TURN_S = 0.09;
/** After the hit a flown blade stands in the wound, then folds away (s). */
const FLIGHT_HOLD_S = 0.08;
const FLIGHT_FOLD_S = 0.2;
/** Nhất Tuyến: the blade runs past the line's end by this much (m) and comes to rest there. */
const K2_OVERSHOOT_M = 0.5;
/**
 * Nhất Tuyến: the blade leaves from where it was shown (at the hand, drawn back by the wind-up) and joins
 * the line over this time (s, smoothstep), instead of jumping onto the line's start (3.3 m in one frame).
 */
const K2_JOIN_S = 0.1;
/** Lưu Quang Bộ: dash length (m) and time (s); the speed eases in over the first DASH_IN share and out over the last DASH_OUT share. */
const DASH_M = 5;
const DASH_S = 0.2;
const DASH_IN = 0.2;
const DASH_OUT = 0.45;
/** Hộ thân: the parrying blade reaches the blow on a critical spring of this half-life (s), then breaks after GUARD_BREAK_S. */
const GUARD_SPRING_S = 0.035;
const GUARD_BREAK_S = 0.16;
/** Hộ thân: open and close fades (s); an early end (no charges left) closes the same way. */
const GUARD_OPEN_S = 0.15;
/** Thiên Hà Kiếm Vũ: belt spin while typing and after the release (rad/s), eased with this half-life (s). */
const K5_SPIN_CHARGE = 0.35;
const K5_SPIN_LIVE = 1.1;
const K5_SPIN_HALF_S = 0.12;
/** The galaxy arm of the spiral sigil (fxkit SPIRAL): r = 0.18·e^(0.32·θ) of the half size, blades ride θ ∈ [K5_ARM_T0, K5_ARM_T1]. */
const K5_ARM_R = 6.75;
const K5_ARM_T0 = 0.05;
const K5_ARM_T1 = 4.85;
/** Before the blades dive, the halo of swords behind the caster spins on and shrinks away over this time (s). */
const K5_HALO_OUT_S = 0.3;
/**
 * Thiên Hà Kiếm Vũ's sword rain (round 3b; sword-rain.ts), seconds from its release (after the cut-in): the gate
 * opens (0–0.35), four columns link it to the ground (0.1–0.31), six lead swords drop on the gravest prey
 * (0.36–0.95), three dense waves rain over the field (0.62–1.35), the heaven sword falls from the gate (1.29) and
 * lands at the climax (1.55); the planted swords and the rift hold the aftermath until RAIN_END_AT.
 */
const RAIN_GATE_Y = 24;
const RAIN_GATE_OPEN_S = 0.35;
const RAIN_GATE_CLOSE_AT = 2.4;
const RAIN_COLUMN_X = [-0.95, -0.33, 0.33, 0.95] as const;
const RAIN_LEADS = 6;
const RAIN_LEAD_AT = 0.36;
const RAIN_LEAD_GAP = 0.07;
const RAIN_LEAD_FALL_S = 0.24;
const RAIN_WAVES = [0.62, 0.86, 1.1] as const;
const RAIN_PER_WAVE = 48;
const RAIN_WAVE_SPREAD_S = 0.22;
const RAIN_CLIMAX_AT = 1.55;
const RAIN_COLOSSUS_FALL_S = 0.26;
/** The heaven sword (the climax's one giant from the gate, round 3b's composition) and the rain's swords, pommel to tip (m): leads 3×, rain 2.4× the hand sword. */
const RAIN_COLOSSUS_M = 20;
const RAIN_LEAD_M = 3.06;
const RAIN_MID_M = 2.45;
const RAIN_RIFT_M = 22;
const RAIN_END_AT = 3.9;
const RAIN_PLANT_CAP = 16;
const BLADE_CAP = POOL0 + RAIN_DROPS + RAIN_PLANT_CAP;
/** The rain's footprint (m): the whole beast field, flanks and the king included. */
const RAIN_FIELD = { x0: -18, x1: 18, z0: -18, z1: -1 } as const;

interface RainDrop {
  active: boolean;
  /** Its sword slot (a lead's hero slot, a rain sword's mid slot). */
  slot: number;
  kind: number;
  x: number;
  z: number;
  t0: number;
  dur: number;
  y0: number;
  target: number;
  wave: number;
  landed: boolean;
  lean: number;
}
/** Lạc Kiếm Trận cast again while it holds: the old array's light fades over this time (s). */
const K4_OLD_S = 0.3;

// ── Round 2, impact lane ───────────────────────────────────────────────────
/** The release flash rises over ~2.5 frames at 60 Hz (smoothstep) and decays over ~5 (it blazed on full and erased the caster at the 6 m close-up). */
const RELEASE_RISE_S = 0.04;
const RELEASE_LIFE_S = 0.14;
/** Bursts that ease in over ≥ 3 frames at 60 Hz: K5's vortex core, K1's arriving swords and glints, the key glints. */
const SOFT_RISE_S = 0.05;
/** Hit-stop per strike (ms): 3–5 frames at 60 Hz, world time × 0.05 (feel.ts HitStop). */
const STOP_MS = { auto: 50, k1: 50, k2: 67, block: 67, k4Open: 67, k4Beat: 50, k5: 67, k5Last: 83 } as const;
/** Camera shake per strike (m; it dies in ~120 ms, the host scales it by tier and keeps it subtle at the play camera). */
const SHAKE_M = { auto: 0.1, k1: 0.1, k2: 0.15, block: 0.12, k4Open: 0.15, k4Beat: 0.07, k5: 0.15, k5Last: 0.2, dash: 0.06 } as const;
/** Sigils and the caster seal fade out over this time (s), eased in alpha and size (round 2: 0.25–0.35 s). */
const SIGIL_OUT_S = 0.3;
/** Hộ thân closes over this time (s): blades, ring and arcs together. */
const GUARD_FADE_S = 0.35;
/** The caster seal's fall: an exponential approach with this half-life (s), ~0.3 s to nothing as drawn (smoothstep). */
const SEAL_OUT_HALF_S = 0.07;
/** Nhất Tuyến: the cut glows (a seam with embers) and cools into pale ash; times (s) after the hit tick. */
const K2_HEAT_PEAK = 1.4;
const K2_COOL_S = 0.5;
const K2_LIFE_S = 2.4;
/** Ground cracks (L6): K5's zone and Lạc Kiếm Trận's heart; decal lives (s) after the last strike (VFX_STANDARD §3.4: skill 4–7 s). */
const CRACK_LIFE_K5 = 6.5;
const CRACK_LIFE_K4 = 4;
const CRACK_OUT_S = 1;

/** The seal glyph each slot draws under the caster (fxkit SEAL_SHAPE). */
const SLOT_SHAPE: Readonly<Record<SwordSlot, number>> = {
  // Round 3a (P8): the basic shot takes the Sword glyph too, so its seal flares under the caster on the release.
  auto: SEAL_SHAPE.k1,
  k1: SEAL_SHAPE.k1,
  k2: SEAL_SHAPE.k2,
  guard: SEAL_SHAPE.guard,
  dash: SEAL_SHAPE.dash,
  k4: SEAL_SHAPE.k4,
  k5: SEAL_SHAPE.k5,
};
const SLOTS: readonly SwordSlot[] = ["auto", "k1", "k2", "guard", "dash", "k4", "k5"];
/** Metal draws its own layers: no hooks. */
const NO_HOOKS: SwordHooks = {};
/** A colour set the hook arguments hold until their first call (each call sets the slot's). */
const START_GLOW: WeaponGlow = weaponById(DEFAULT_WEAPON)!.glow;

/** A kit's flame trail on `stage` for RibbonPool.setFlame (null: sword-light; also while its clip has not loaded). */
export function flameOf(kit: ElementKit, stage: ElementStage | null): RibbonFlame | null {
  const f = kit.trail.flame;
  if (f === undefined || stage === null) return null;
  const c = stage.clip(kit.id, f.clip);
  if (c === null) return null;
  return { texture: c.texture, cols: c.meta.cols, rows: c.meta.rows, frames: c.meta.frames, fps: c.meta.fps, soot: f.soot, deep: f.deep, amber: f.amber, core: f.core };
}
const casterPose = (): { x: number; z: number; fx: number; fz: number } => ({ x: 0, z: 0, fx: 0, fz: -1 });

interface Flight {
  active: boolean;
  blade: number;
  ribbon: number;
  /** The weapon's silk trail beside the sword-light (−1 none). */
  silk: number;
  /** Its trail is the aura's SilkTail (one silk ribbon in place of the sword-light and the silk, SWORD_AURA §4.6). */
  tail: boolean;
  t: number;
  dur: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  arc: number;
  target: number;
  pierce: number;
  power: number;
  big: boolean;
  /** −1 in flight; after the hit, seconds since it (the blade stands in the wound, then folds away). */
  hit: number;
  sx: number;
  sy: number;
  sz: number;
  acc: number; // motes owed along the path (rate × dt)
  /** Launch direction (the pose the blade showed before it flew; 0 0 0: none), turned into the path over `turn` s. */
  d0x: number;
  d0y: number;
  d0z: number;
  turn: number;
  /** Last drawn direction: kept through the hit, so the blade never flips upright in the wound. */
  ldx: number;
  ldy: number;
  ldz: number;
  /** The skill that flew it (its colours). */
  slot: SwordSlot;
}

/** A lingering aftermath: spirit motes rising off the ground for a while. */
interface Emitter {
  active: boolean;
  x: number;
  y: number;
  z: number;
  r: number;
  t: number;
  life: number;
  rate: number;
  acc: number;
  slot: SwordSlot;
}

type Rgbish = { r: number; g: number; b: number };

/** A ground-crack decal (startCrack, updateCrack): age (−1 off) and life (s), place, drawn and goal spread, heat, ink, ash. */
interface CrackState {
  t: number;
  life: number;
  x: number;
  z: number;
  reveal: number;
  goal: number;
  heat: number;
  peak: number;
  ash: number;
  ink: number;
}

export class SwordSkillFx {
  readonly blades: BladeSet;
  private readonly glow: SpritePool;
  private readonly flare: SpritePool;
  private readonly star: SpritePool;
  private readonly spark: SpritePool;
  private readonly slash: SpritePool;
  private readonly motes: SpritePool;
  private readonly smoke: SpritePool;
  private readonly splash: SpritePool;
  private readonly groundInk: SpritePool;
  private readonly groundRing: SpritePool;
  private readonly groundShock: SpritePool;
  private readonly groundGlow: SpritePool;
  private readonly groundDark: SpritePool;
  private readonly twirl: SpritePool;
  private readonly aura: SpritePool;
  private readonly shock: SpritePool;
  private readonly beams: BeamPool;
  private readonly ribbons: RibbonPool;
  private readonly sigHex: GroundSigil;
  private readonly sigSpiral: GroundSigil;
  private readonly sigArcs: GroundSigil;
  private readonly sigLine: GroundSigil;
  private readonly sigArrow: GroundSigil;
  private readonly sigSeal: GroundSigil;
  private readonly pools: readonly SpritePool[];
  private readonly sigils: readonly GroundSigil[];
  private readonly rand = new Rand(1301);
  private readonly c = { x: 0, z: 0, fx: 0, fz: -1 };
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly camW = new THREE.Vector3();
  private readonly camF = new THREE.Vector3();
  private readonly hits = new Int32Array(128);
  private readonly flights: Flight[] = [];
  private readonly emitters: Emitter[] = [];
  private ribbonCursor = 0;
  private time = 0;
  private readonly poolN: number;
  /** Burst counts and shed rates per tier (low halves them). */
  private readonly dens: number;
  /** Low tier: one light card per blade, and the secondary layers (twirl, second halo, camera shock rings, flare and ground-shock sheets) fold into other pools or go, to stay near 12 draw calls. */
  private readonly lite: boolean;
  /** Share of the area-hit glints and ink splashes owed (dens per beast). */
  private lightAcc = 0;
  /** The equipped sword and its VFX colours (D55). */
  private weaponDef: WeaponDef;
  /** The equipped weapon's guard is a ring (WeaponMotif.ring): the blade-light cards leave it clear. */
  private ringGuard = false;
  private pal: WeaponGlow;
  private weaponSeq = 0;
  /** Each skill's colours inside the weapon's palette (skillGlow); `use(slot)` points `pal` at one. */
  private skillPal: Record<SwordSlot, WeaponGlow>;
  /** The slot `pal` points at (use). */
  private palSlot: SwordSlot = "auto";
  /** Fade-in (s) the shared emit helpers give their sprites and beams: 0 (flashes, full at once) or SOFT_RISE_S. */
  private riseS = 0;
  /** Blade roll round its axis (rad) on top of the face roll (show's `roll`): Ngự Kiếm's waiting blades rock slowly. */
  private readonly bRoll = new Float32Array(BLADE_CAP);
  /** Ngự Kiếm's waiting blades' extra roll as drawn (rad): it eases to 0 before each launch, as a flight shows only the face roll. */
  private readonly k1Roll = new Float32Array(3);
  /** Turns each sword's flat to the camera (no allocation per sword). */
  private readonly faces = new FaceRoll();
  /** Per sword: its dissolve into light (0 whole … 1 gone; the rain's swords appear and melt with it). */
  private readonly bDis = new Float32Array(BLADE_CAP);
  /** Read by the caster's presence layer (src/lab/presence.ts). */
  readonly presence: SwordSkillPresence = { charge: 0, slot: "auto", releases: 0, tier: 0 };
  /** The weapon in the hand is out (updateHand): Nhất Tuyến's blade or a Phi Kiếm blade is on screen. */
  private handOut = false;
  /** The seal's glyph: shown, wanted next, its share (it crossfades), the slot it colours from, its colours as drawn. */
  private sealShape = 0;
  private sealNext = 0;
  private glyphK = 0;
  private sealSlot: SwordSlot = "auto";
  private readonly sealCol = new THREE.Color();
  private readonly sealCore = new THREE.Color();
  private readonly tmpCol = new THREE.Color();
  /** Release light burning behind the caster (pushed along the view ray, behindCaster; no pull): the body stays readable. */
  private readonly backGlow: SpritePool;
  private readonly backStar: SpritePool;
  /**
   * Round 3a (P8): the basic shot and slot 1 read at the play camera: a seal ring that flares at the hand on the
   * release and spins out over the flight, and a graphic hit (a white star, the slash, a thin ring; no soft glow).
   * The flying sword itself is the real model with its edge line (03/11: no spine or rim strip over it).
   */
  private readonly handRing: SpritePool;
  /** Ground cracks: K5's zone and Lạc Kiếm Trận's heart. */
  private readonly sigCrack: GroundSigil;
  private readonly sigCrackS: GroundSigil;
  private readonly crack: CrackState = { t: -1, life: 0, x: 0, z: 0, reveal: 0, goal: 0, heat: 0, peak: 0, ash: 0, ink: 0 };
  private readonly crackS: CrackState = { t: -1, life: 0, x: 0, z: 0, reveal: 0, goal: 0, heat: 0, peak: 0, ash: 0, ink: 0 };

  // Charge state per slot (typing progress 0..1, -1 idle).
  private charge: Record<SwordSlot, number> = { auto: -1, k1: -1, k2: -1, guard: -1, dash: -1, k4: -1, k5: -1 };
  private chargeShown: Record<SwordSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };
  /** Typing progress as drawn: eases toward `charge` (REVEAL_HALF_S), so sigils grow smoothly instead of one step a key. */
  private reveal: Record<SwordSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };
  /** Seconds since each word's first key: its sigil (ink base included) fades in over SIGIL_IN_S instead of appearing whole. */
  private chargeAge: Record<SwordSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };

  // Blades: every pose goes through show(); settleBlades() eases each blade's presence in and out once a frame.
  /** Presence 0..1 (scale × smoothstep(presence)). */
  private readonly bPres = new Float32Array(BLADE_CAP);
  /** 1: shown this frame; 2: shown with no scale-in (the caller animates its scale). */
  private readonly bShown = new Uint8Array(BLADE_CAP);
  /** Last pose per blade (BP floats), kept while a blade fades out. */
  private readonly bPose = new Float32Array(BLADE_CAP * BP);
  /** Glow card share per blade this frame (presence × the caller's glow share). */
  private readonly bCard = new Float32Array(BLADE_CAP);
  /** Ngự Kiếm: the three blades' drawn tip directions (they turn to aim once the word is cast). */
  private readonly k1Dir = new Float32Array(9);
  private readonly k1Aim = new THREE.Vector3();
  /** Hộ thân: each blade's drawn pose and velocity (the parry springs from the orbit to the blow). */
  private readonly gPos = new Float32Array(9);
  private readonly gVel = new Float32Array(9);
  private readonly gDir = new Float32Array(9);
  /** Thiên Hà: the shared phase when each wave began to dive, and the spin then (the planted blades keep their angle). */
  private readonly k5PhaseAt = new Float32Array(3);
  private readonly k5SpinAt = new Float32Array(3);
  private readonly k5DiveSet = new Uint8Array(3);
  /** Thiên Hà cast again while it ran: belt blades still on screen from the old cast (they fade out where they are first). */
  private readonly k5Old = new Uint8Array(BLADE_CAP);
  /** Thiên Hà: halo blades (behind the caster) shown when the word was cast, and the halo's turning angle. */
  private haloN = 0;
  private haloAng = 0;
  /** The halo's drawn size share (updateHalo). */
  private haloK = 1;
  /** k5Belt's output: a belt point (x, z) and its world angle ψ. */
  private readonly belt = { x: 0, z: 0, psi: 0 };
  /** Phi Kiếm's last auto slot (of AUTO_N): the next cast takes the next free one (pickAutoSlot). */
  private autoSlot = 0;
  /** True while cast() runs for a word that was typed (its blades and sigils are on screen from the keys). */
  private castTyped = false;
  /** The caster's seal: its shown fade, rising at most 1/SEAL_IN_S a second (a release with no word typed blazed it on in 2 frames). */
  private sealFade = 0;
  private chargeTarget = { x: 0, z: -8 };
  /** The caster's gathering aura: shown level, ultimate size, release blaze, spawn accumulators. */
  private auraP = 0;
  private auraBig = 0;
  /** Seal blaze: the goal is set by keys and releases and falls 4.5/s; the shown blaze rises to it in a few frames. */
  private blaze = 0;
  private blazeGoal = 0;
  private moteAcc = 0;
  private gatherAcc = 0;
  private zoneAcc = 0;
  /**
   * Qi motes spiralling in to the hand while a word is typed (round 3b, item 5): start angle, radius and height,
   * age, life (0.32–0.48 s of gather) and spin, drawn as one-frame streaks along their spiral.
   */
  private readonly qmA = new Float32Array(QI_MOTES);
  private readonly qmR = new Float32Array(QI_MOTES);
  private readonly qmY = new Float32Array(QI_MOTES);
  private readonly qmAge = new Float32Array(QI_MOTES);
  private readonly qmLife = new Float32Array(QI_MOTES);
  private readonly qmSpin = new Float32Array(QI_MOTES);
  private readonly qmOn = new Uint8Array(QI_MOTES);
  private qmNext = 0;
  private readonly qmP = new THREE.Vector3();

  // Running skills.
  private k1 = { active: false, t: 0, launched: 0, tx: 0, tz: 0 };
  // blade: the slot the running line uses (HERO.k2 or HERO.k2 + 1); the next word's blade takes the other one.
  // heat, ash: the cut's afterglow and its ash as drawn (eased); embers, wisps: shed accumulators.
  private k2 = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, hit: false, ribbon: 0, silk: -1, acc: 0, sparks: 0, glow0: 0, ribbonOn: false, jx: 0, jy: 0, jz: 0, blade: HERO.k2 + 1, heat: 0, ash: 0, embers: 0, wisps: 0 };
  // refresh: cast again while it ran (it reopens from lay0, the barrier's level then, and its blades stay up);
  // lay: the barrier's level this frame; ret: a parrying or broken blade springing back to its orbit (1 → 0).
  private guard = { active: false, t: 0, charges: 0, shownCharges: 0, spin: 0, closeT: -1, blockT: [-1, -1, -1], blockX: [0, 0, 0], blockZ: [0, 0, 0], ribbon: [0, 0, 0], refresh: false, lay0: 0, lay: 0, ret: [0, 0, 0] };
  private dash = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, ghosts: 0, ribbon: 0, arrived: false, glow0: 0 };
  // set: which six blades (HERO.k4 + 6·set); hold, dark: the array's held light and dark disc this frame.
  private k4 = { active: false, t: 0, x: 0, z: 0, beats: 0, landed: false, closed: false, beatAge: -1, set: 0, hold: 0, dark: 0 };
  /** An array cast over while it held: its held light fades out over K4_OLD_S where it stood (t < 0: none). */
  private k4Old = { t: -1, x: 0, z: 0, hold: 0, dark: 0 };
  private k5 = { active: false, t: 0, x: 0, z: 0, wave: 0, done: false, dissolved: false, acc: 0, glow0: 0 };
  /** The sword rain's drawing (round 3b): the gate and its ring of real swords (impostors), light strips and ground marks. */
  private readonly gate = new SkyGate(2);
  private readonly gateSwords = new SwordImpostors(GATE_SWORDS, 3, false);
  /** The heaven sword: the full model in the transparent pass after the gate (it falls out of the gate's heart). */
  private readonly heaven = new BladeSet(1, 1.1, 1, { hero: true, mid: false });
  private readonly rainStrips = new LightStrips(160, 15);
  private readonly rainMarks = new GroundMarks(80, 4);
  private readonly drops: RainDrop[] = Array.from({ length: RAIN_DROPS }, (_, i) => ({ active: false, slot: POOL0 + i, kind: 0, x: 0, z: 0, t0: 0, dur: 0, y0: 0, target: -1, wave: 0, landed: false, lean: 0 }));
  private readonly planted = Array.from({ length: RAIN_PLANT_CAP }, () => ({ active: false, slot: -1, kind: 0, x: 0, z: 0, lean: 0, t: 0 }));
  private readonly marks = Array.from({ length: 72 }, () => ({ active: false, kind: 0, x: 0, z: 0, size: 0, t0: 0, life: 0, angle: 0, seed: 0 }));
  private readonly columns = Array.from({ length: RAIN_COLUMN_X.length }, () => ({ gx: 0, gz: 0, rimA: 0, t0: 0 }));
  private readonly rift = { t: -1, x: 0, z: 0, angle: 0, seed: 0 };
  private readonly colossus = { active: false, done: false, t0: 0, sx: 0, sy: 0, sz: 0 };
  private readonly rainWaveHit = new Uint8Array(RAIN_WAVES.length);
  private rainNextLead = 0;
  private plantedN = 0;
  private rainEmberAcc = 0;

  // ── Sword aura (SWORD_AURA; the host's shared owner) ────────────────────────
  /** The flying swords' aura (null or off: the layers below as they were). */
  private swordAura: SwordAura | null = null;
  /** Per blade this frame: it wears the aura (its state + 1; 0 none), its waiting tier's width, its release age, its fade. */
  private readonly bAura = new Uint8Array(BLADE_CAP);
  private readonly bAuraLevel = new Float32Array(BLADE_CAP);
  private readonly bAuraRelease = new Float32Array(BLADE_CAP);
  private readonly bAuraFade = new Float32Array(BLADE_CAP);

  // ── Element layer (canon D59, element-kit.ts) ─────────────────────────────
  /** The element kit these shapes are drawn in (Metal: the layers of this file, no hooks). */
  private kit: ElementKit = METAL;
  /** Its phase hooks on the stage (none for Metal): a hook that returns true replaces the Metal layer it stands for. */
  private hooks: SwordHooks = NO_HOOKS;
  /** The host's base sheets, and the pools and ribbons drawn with each (a kit's `textures` swap them). */
  private readonly baseTex: SwordSkillTextures;
  private readonly texTargets: Record<SwordTextureLayer, { texture: THREE.Texture }[]>;
  // Hook arguments: one object per kind, reused for every call.
  private readonly aKey: ChargeKeyArgs = { slot: "auto", p: 0, hand: new THREE.Vector3(), caster: casterPose(), appeared: Array.from({ length: 6 }, () => new THREE.Vector3()), count: 0, pal: START_GLOW };
  private readonly aFrame: ChargeFrameArgs = { slot: "auto", level: 0, vis: 0, big: 0, scale: 1, typing: false, dt: 0, hand: new THREE.Vector3(), caster: casterPose(), pal: START_GLOW };
  private readonly aRelease: ReleaseArgs = { slot: "auto", skill: "auto", tier: 1, size: 0, intensity: 0, ringM: 0, at: new THREE.Vector3(), hand: new THREE.Vector3(), caster: casterPose(), pal: START_GLOW };
  private readonly aLaunch: LaunchArgs = { slot: "k1", at: new THREE.Vector3(), index: 0, pal: START_GLOW };
  private readonly aTravel: TravelArgs = { slot: "auto", blade: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, tipM: 0, u: 0, dt: 0, pal: START_GLOW, aura: false };
  private readonly aImpact: ImpactArgs = { slot: "auto", at: new THREE.Vector3(), scale: 1, dx: 0, dz: -1, power: 0, big: false, pal: START_GLOW };
  private readonly aCut: CutArgs = { slot: "auto", at: new THREE.Vector3(), rot: 0, size: 1, pal: START_GLOW };
  private readonly aArea: AreaHitArgs = { slot: "auto", at: new THREE.Vector3(), dx: 0, dz: -1, power: 0, marked: false, pal: START_GLOW };
  private readonly aBurst: AreaBurstArgs = { slot: "auto", x: 0, y: 0, z: 0, beasts: 0, scale: 1, pal: START_GLOW };
  private readonly aAfter: AftermathArgs = { slot: "auto", x: 0, z: 0, r: 0, life: 0, rate: 0, pal: START_GLOW };
  private readonly aDeath: DeathArgs = { slot: "auto", at: new THREE.Vector3(), dx: 0, dz: -1, radius: 0, pal: START_GLOW };

  constructor(
    private readonly host: SwordSkillHost,
    tex: SwordSkillTextures,
    quality: "low" | "medium" | "high" | "ultra",
    opts: SwordSkillOptions = {},
  ) {
    const tierN = quality === "low" ? 150 : quality === "medium" ? 225 : 300;
    this.poolN = Math.max(1, Math.min(K5_MAX, Math.round(opts.k5Blades ?? tierN)));
    this.dens = quality === "low" ? 0.5 : quality === "medium" ? 0.75 : 1;
    this.lite = quality === "low";
    this.baseTex = tex;
    // Hero swords draw the full model (and cast shadows); from the halo on, the textured LOD (WeaponDef.swarm).
    this.blades = new BladeSet(BLADE_CAP, 1.1, HERO.halo);
    const L = host.layer;
    // Dark layers first, light on top (VFX_STANDARD §3.4: a dark layer behind bright ones).
    // Big soft discs and rings show only the cropped middle of their sheet (fewer pixels drawn, same look).
    // Long-lived layers that are not flashes (dark discs, ink, smoke, ground glows) ease in over NON_FLASH_IN_S,
    // a few frames after the flash they sit under (§3.4 layers 2–3 frames apart): nothing pops on.
    this.groundDark = new SpritePool(48, tex.glow, "ink", "ground", 3, { crop: CROP_INK, fadeIn: NON_FLASH_IN_S });
    this.groundInk = new SpritePool(160, tex.scorch, "ink", "ground", 4, { fadeIn: NON_FLASH_IN_S });
    this.groundGlow = new SpritePool(96, tex.glow, "add", "ground", 5, { crop: CROP_LIGHT, fadeIn: NON_FLASH_IN_S });
    this.groundRing = new SpritePool(96, tex.ring, "add", "ground", 6, { crop: CROP_RING, cropFade: 0.97 });
    this.groundShock = new SpritePool(64, tex.shock, "add", "ground", 6);
    this.twirl = new SpritePool(32, tex.twirl, "add", "ground", 7);
    this.smoke = new SpritePool(240, tex.smoke, "ink", "camera", 8, { fadeIn: NON_FLASH_IN_S });
    this.splash = new SpritePool(160, tex.splash, "ink", "camera", 9, { fadeIn: NON_FLASH_IN_S });
    // The caster's halo is placed behind the body (behindCaster): no pull; it fades out at the ground instead.
    this.aura = new SpritePool(48, tex.halo, "add", "camera", 10, { pull: 0, groundFade: 0.15 });
    // Layers on the same sheet, blend and facing share one pool, so one draw call: the glows always; sparks and
    // motes too when they use the glow's sheet (the lab's circle_05). Additive layers add up in any order, so the
    // shared pool's render order changes nothing.
    const sparkInGlow = tex.spark === tex.glow;
    const moteInGlow = tex.mote === tex.glow;
    this.glow = new SpritePool(620 + (sparkInGlow ? 800 : 0) + (moteInGlow ? 700 : 0), tex.glow, "add", "camera", 11, { crop: CROP_LIGHT });
    this.slash = new SpritePool(96, tex.slash, "add", "camera", 12);
    // Beams: light pillars and rays, and the thin one-frame trails behind falling swords (≤ RAIN_DROPS a frame).
    this.beams = new BeamPool(640 + RAIN_DROPS, 13);
    this.spark = sparkInGlow ? this.glow : new SpritePool(800, tex.spark, "add", "camera", 13);
    this.motes = moteInGlow ? this.glow : new SpritePool(700, tex.mote, "add", "camera", 13);
    this.shock = new SpritePool(64, tex.shock, "add", "camera", 14);
    this.star = new SpritePool(320, tex.star, "add", "camera", 14);
    this.flare = new SpritePool(48, tex.flare, "add", "camera", 15);
    this.ribbons = new RibbonPool(RIBBONS, 18, tex.trace);
    // Steel-set colours here; applyColours below recolours them from the weapon.
    this.sigHex = new GroundSigil("hex", 7.2, 7.2, "#9fb2cc", "#ffffff");
    this.sigSpiral = new GroundSigil("spiral", 13.5, 13.5, "#a7b6cc", "#ffffff");
    this.sigArcs = new GroundSigil("arcs", 4.8, 4.8, "#a9b8c8", "#ffffff");
    this.sigLine = new GroundSigil("line", 14, 1.8, "#b3c2d6", "#ffffff");
    this.sigArrow = new GroundSigil("arrow", 5, 0.9, "#b3c2d6", "#ffffff");
    this.sigSeal = new GroundSigil("seal", 4, 4, "#a9b8c8", "#ffffff");
    // Cracks lie under the other sigils (a decal on the stone).
    this.sigCrack = new GroundSigil("crack", 13, 13, "#a7b6cc", "#ffffff");
    this.sigCrackS = new GroundSigil("crack", 7, 7, "#a7b6cc", "#ffffff");
    this.sigCrack.mesh.renderOrder = 4;
    this.sigCrackS.mesh.renderOrder = 4;
    // The release's big light burns behind the caster (behindCaster), so these pools never pull toward the camera;
    // they fade out at the ground like the aura. Low: the star goes (one draw call fewer).
    this.backGlow = new SpritePool(48, tex.glow, "add", "camera", 10, { pull: 0, groundFade: 0.15, crop: CROP_LIGHT });
    this.backStar = this.lite ? this.backGlow : new SpritePool(32, tex.star, "add", "camera", 10, { pull: 0, groundFade: 0.15 });
    this.handRing = new SpritePool(24, tex.ring, "add", "camera", 14, { pull: 0.4 });
    // Each pool once (shared pools appear under several names): it is updated once a frame.
    this.pools = [
      ...new Set([
        this.groundDark, this.groundInk, this.groundGlow, this.groundRing, this.groundShock, this.twirl, this.smoke, this.splash,
        this.aura, this.backGlow, this.backStar, this.glow, this.slash, this.spark, this.motes, this.shock, this.star, this.flare, this.handRing,
      ]),
    ];
    this.sigils = [this.sigCrack, this.sigCrackS, this.sigHex, this.sigSpiral, this.sigArcs, this.sigLine, this.sigArrow, this.sigSeal];
    for (const s of this.sigils) L.add(s.mesh);
    for (const p of this.pools) L.add(p.mesh);
    L.add(this.blades.mesh, this.ribbons.mesh, this.beams.mesh);
    L.add(this.gate.mesh, this.gateSwords.mesh, this.heaven.mesh, this.rainStrips.mesh, this.rainMarks.mesh);
    this.heaven.mesh.renderOrder = 4;
    for (let i = 0; i < 24; i += 1) {
      this.flights.push({ active: false, blade: 0, ribbon: 0, silk: -1, tail: false, t: 0, dur: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, target: -1, pierce: -1, power: 0, big: false, hit: -1, sx: 0, sy: 0, sz: 0, acc: 0, d0x: 0, d0y: 0, d0z: 0, turn: FLIGHT_TURN_S, ldx: 0, ldy: 0, ldz: 1, slot: "auto" });
    }
    for (let i = 0; i < EMITTERS; i += 1) this.emitters.push({ active: false, x: 0, y: 0, z: 0, r: 0, t: 0, life: 0, rate: 0, acc: 0, slot: "auto" });
    // Which pools draw each base sheet (sparks and motes in the glow's pool swap with `glow`; Low's back star is the back glow).
    this.texTargets = {
      glow: [this.groundDark, this.groundGlow, this.glow, this.backGlow],
      flare: [this.flare],
      star: this.lite ? [this.star] : [this.star, this.backStar],
      spark: sparkInGlow ? [] : [this.spark],
      trace: [this.ribbons],
      slash: [this.slash],
      mote: moteInGlow ? [] : [this.motes],
      smoke: [this.smoke],
      splash: [this.splash],
      scorch: [this.groundInk],
      ring: [this.groundRing, this.handRing],
      shock: [this.groundShock, this.shock],
      halo: [this.aura],
      twirl: [this.twirl],
    };
    // The signature sword's colours until setWeapon; the swords stay the stand-in jian until a GLB loads.
    this.weaponDef = weaponById(DEFAULT_WEAPON)!;
    this.pal = this.weaponDef.glow;
    this.skillPal = this.skillPals(this.weaponDef);
    this.applyColours(this.weaponDef);
  }

  /** Every slot's colours for a weapon in the element's palette (load time). */
  private skillPals(def: WeaponDef): Record<SwordSlot, WeaponGlow> {
    const out = {} as Record<SwordSlot, WeaponGlow>;
    for (const s of SLOTS) out[s] = this.kit.palette(def, s);
    return out;
  }

  // ── Element (canon D59) ───────────────────────────────────────────────────

  /** The element kit the skills are drawn in. */
  get element(): ElementKit {
    return this.kit;
  }

  /**
   * Draws every skill in `kit`'s material from now on (load time, not per frame: it may allocate): its palette per
   * slot, its trail and blade light, its sprite sheets, and its phase hooks on `stage` (null: none, the base layers
   * in its palette). The shapes, counts and timing stay the weapon's.
   */
  setElement(kit: ElementKit, stage: ElementStage | null): void {
    this.kit = kit;
    this.hooks = stage !== null ? (stage.hooksOf(kit).sword ?? NO_HOOKS) : NO_HOOKS;
    for (const layer of Object.keys(this.texTargets) as SwordTextureLayer[]) {
      const name = kit.textures[layer];
      const t = name !== undefined && stage !== null ? stage.texture(name) : this.baseTex[layer];
      for (const target of this.texTargets[layer]) target.texture = t;
    }
    applyBladeLook(kit.blade);
    this.ribbons.setFlame(flameOf(kit, stage));
    // The caster's seal and its rings in the element's material (Metal: its added light, unchanged).
    this.sigSeal.setSolid(kit.sigil ?? null);
    this.skillPal = this.skillPals(this.weaponDef);
    this.use(this.palSlot);
    this.applyColours(this.weaponDef);
  }

  /**
   * The flying swords' aura (SWORD_AURA §4.8: the host makes one and hands it to every sword module). Key 1's swords
   * wear it (waiting at the shoulders and in flight); while it is on, the layers it stands for go (§4.6): the glint
   * running up a waiting blade, the tip glint, the trail and the silk (one SilkTail), Fire's sheath.
   */
  setAura(aura: SwordAura | null): void {
    this.swordAura = aura;
  }

  /** The aura is drawn now. */
  private get auraOn(): boolean {
    return this.swordAura !== null && this.swordAura.on;
  }

  /** The ribbons' mesh (the lab hides it to look at one aura layer alone; no time passes). */
  get ribbonMesh(): THREE.Object3D {
    return this.ribbons.mesh;
  }

  /** Compiles the ribbons' moded program (the aura's SilkTail) now; it stays off until the aura is on. */
  prewarmAura(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const was = this.ribbons.mesh.material;
    const vis = this.ribbons.mesh.visible;
    this.ribbons.setModed(true);
    this.ribbons.mesh.visible = true;
    renderer.compile(this.ribbons.mesh, camera);
    this.ribbons.mesh.material = was;
    this.ribbons.mesh.visible = vis;
  }

  /** Blade `i` wears the aura this frame in `state` (pushed in settleBlades with its drawn pose). */
  private markAura(i: number, state: number, level: number, releaseAge: number, fade: number): void {
    this.bAura[i] = state + 1;
    this.bAuraLevel[i] = level;
    this.bAuraRelease[i] = releaseAge;
    this.bAuraFade[i] = fade;
  }

  /** The colours of `slot` with the equipped weapon (the presence layer and the lab read them). */
  paletteOf(slot: SwordSlot): WeaponGlow {
    return this.skillPal[slot];
  }

  /** The slot whose colours the emit helpers use now: the one striking when SwordSkillHost.hitStop or shake is called. */
  get striking(): SwordSlot {
    return this.palSlot;
  }

  /** Points the emit helpers at a slot's colours. */
  private use(slot: SwordSlot): void {
    this.pal = this.skillPal[slot];
    this.palSlot = slot;
  }

  /** Which skill a blade slot belongs to (its colours). */
  private bladeSlot(i: number): SwordSlot {
    if (i < HERO.k2) return "k1";
    if (i < HERO.guard) return "k2";
    if (i < HERO.k4) return "guard";
    if (i < HERO.auto) return "k4";
    if (i < HERO.halo) return "auto";
    return "k5";
  }

  // ── Equipped weapon (D55) ────────────────────────────────────────────────

  get weapon(): WeaponId {
    return this.weaponDef.id;
  }

  /** The equipped weapon's definition (the lab's hand prop reads its model, hold and motifs). */
  get weaponInfo(): WeaponDef {
    return this.weaponDef;
  }

  /**
   * True while the weapon itself is out of the hand: Phi Kiếm throws the
   * weapon and Nhất Tuyến drives it down its line (WEAPON_DESIGN §5: "Phi
   * Kiếm is the weapon itself"), from the word's first key to its blade's
   * fold. A hand prop hides (melts into the light) while it is true and comes
   * back when it turns false, with a glint at the hand (updateHand).
   */
  get handAway(): boolean {
    return this.handOut;
  }

  /**
   * Equips a sword: its textured models (the full GLB for hero swords, its
   * LOD for mid swords, impostors of it for the gate; the stand-in jian while
   * a file is missing) and every light layer's colour swap together once they
   * are ready. Only family "sword" is accepted: the sabre and spear skill sets
   * are not built yet. Resolves false when refused or overtaken by a later
   * call. Not per frame: it may allocate.
   */
  setWeapon(def: WeaponDef): Promise<boolean> {
    if (def.family !== "sword") {
      console.warn(`[sword-skills] ${def.name} is a ${def.family}: the Kiếm skills take swords only (the ${def.family} skills are not built yet).`);
      return Promise.resolve(false);
    }
    const seq = (this.weaponSeq += 1);
    return Promise.all([loadSwordModels(def), loadSwordAtlas(def.impostor)]).then(([models, atlas]) => {
      if (seq !== this.weaponSeq) return false;
      this.blades.setModel(models.full, models.lod);
      this.heaven.setModel(overlayModel(models.full));
      this.gateSwords.setAtlas(atlas);
      this.weaponDef = def;
      this.ringGuard = def.motif?.ring === true;
      this.skillPal = this.skillPals(def);
      this.use("auto");
      this.applyColours(def);
      return true;
    });
  }

  private applyColours(def: WeaponDef): void {
    // Each sigil in its skill's colours (the seal follows the skill being typed, updateAura).
    this.sigilColours(this.sigLine, "k2");
    this.sigilColours(this.sigArcs, "guard");
    this.sigilColours(this.sigArrow, "dash");
    this.sigilColours(this.sigHex, "k4");
    this.sigilColours(this.sigSpiral, "k5");
    this.sigilColours(this.sigCrack, "k5");
    this.sigilColours(this.sigCrackS, "k4");
    this.sigilColours(this.sigSeal, this.sealSlot);
    // The weapon's motif on every sigil (fxkit biRing, cloudCurl): Clear Wind's jade rings and cloud curls.
    const motif = def.motif;
    for (const sig of this.sigils) {
      sig.uniforms.uMotif.value = motif !== undefined && motif.ring ? 1 : 0;
      if (motif !== undefined) sig.uniforms.uJade.value.setRGB(motif.jade[0], motif.jade[1], motif.jade[2]);
      else sig.uniforms.uJade.value.setRGB(0, 0, 0);
    }
    this.sealCol.copy(this.sigSeal.uniforms.uColor.value);
    this.sealCore.copy(this.sigSeal.uniforms.uCore.value);
  }

  /**
   * A sigil's light (≤ 0.64 × the shader's 1.4 cap) and HDR line colours from a slot's palette: the lines take
   * the skill's own rim with a quarter of white (≤ 30 %), so a seal reads in its skill's colour, not white.
   */
  private sigilColours(sig: GroundSigil, slot: SwordSlot): void {
    sig.uniforms.uColor.value.copy(this.tmpSigil(slot, false));
    sig.uniforms.uCore.value.copy(this.tmpSigil(slot, true));
  }

  /** A slot's sigil light (`core` false: ≤ 0.64 a channel) or HDR line colour (true), into tmpCol (no allocation). */
  private tmpSigil(slot: SwordSlot, core: boolean): THREE.Color {
    const g = this.skillPal[slot];
    const m = Math.max(g.rim[0], g.rim[1], g.rim[2], 1e-3);
    if (core) return this.tmpCol.setRGB(0.25 + 0.75 * (g.rim[0] / m), 0.25 + 0.75 * (g.rim[1] / m), 0.25 + 0.75 * (g.rim[2] / m));
    const k = SIGIL_LIGHT / m;
    return this.tmpCol.setRGB(g.rim[0] * k, g.rim[1] * k, g.rim[2] * k);
  }

  /**
   * A sword's skill light (sword-material.ts) from the old tint level `k`: 1 the plain sword, 1.2–2 a steady charge
   * (the edge line rises), over 2 a hit flash; the soft rim in its skill's colour; the texture is never tinted.
   */
  private bladeTint(i: number, k: number): void {
    const rim = this.skillPal[this.bladeSlot(i)].rim;
    const glow = clamp01(k - 1);
    const flash = Math.max(0, (k - 2) / 1.2);
    this.blades.look(i, glow, flash, rim[0], rim[1], rim[2], this.bDis[i]!);
  }

  /** Reset every running effect (lab: before a capture). */
  reset(): void {
    this.blades.hideAll();
    this.bDis.fill(0);
    this.bPres.fill(0);
    this.bShown.fill(0);
    this.bCard.fill(0);
    for (const f of this.flights) {
      f.active = false;
      f.silk = -1;
    }
    for (const e of this.emitters) e.active = false;
    for (let i = 0; i < RIBBONS; i += 1) this.ribbons.kill(i);
    for (const p of this.pools) p.clear();
    this.beams.clear();
    for (const s of this.sigils) {
      s.hide();
      s.spin = 0;
      s.uniforms.uPhase.value = 0;
    }
    this.k1.active = this.k2.active = this.guard.active = this.dash.active = this.k4.active = this.k5.active = false;
    this.k2.ribbonOn = false;
    this.k2.silk = -1;
    this.k2.blade = HERO.k2 + 1;
    this.k4.set = 0;
    this.k4Old.t = -1;
    for (const k of Object.keys(this.charge) as SwordSlot[]) {
      this.charge[k] = -1;
      this.chargeShown[k] = 0;
      this.reveal[k] = 0;
      this.chargeAge[k] = 0;
    }
    for (const d of this.drops) d.active = false;
    for (const q of this.planted) q.active = false;
    for (const m of this.marks) m.active = false;
    this.rift.t = -1;
    this.colossus.active = this.colossus.done = false;
    this.gate.hide();
    this.heaven.hide(0);
    this.heaven.sync();
    this.haloN = 0;
    this.haloAng = 0;
    this.haloK = 1;
    // Every capture after a reset starts from the same slots (Phi Kiếm's glint turns with its blade index).
    this.autoSlot = 0;
    this.castTyped = false;
    this.sealFade = 0;
    this.auraP = this.auraBig = this.blaze = this.blazeGoal = 0;
    this.qmOn.fill(0);
    this.moteAcc = this.gatherAcc = this.zoneAcc = this.lightAcc = 0;
    this.k2.heat = this.k2.ash = this.k2.embers = this.k2.wisps = 0;
    this.crack.t = this.crackS.t = -1;
    this.bRoll.fill(0);
    this.riseS = 0;
    this.sealShape = this.sealNext = 0;
    this.glyphK = 0;
    this.sealSlot = "auto";
    this.presence.charge = 0;
    this.presence.slot = "auto";
    this.presence.releases = 0;
    this.presence.tier = 0;
    this.handOut = false;
    this.use("auto");
    this.k1Roll.fill(0);
    this.rand.reseed(1301);
    this.hooks.reset?.();
  }

  // ── Blades: scale in, fade out, never pop ────────────────────────────────

  /**
   * Blade `i` this frame at (x, y, z), tip along (dx, dy, dz), `scale` × its
   * length. A blade that was not shown scales in over BLADE_IN_S (`ramp`), or
   * shows at once when the caller animates its own scale (`ramp` false); a
   * blade no longer shown fades out from its last pose (settleBlades).
   * `glow`: share of its light cards (the caller's own fade).
   */
  private show(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, scale: number, ramp = true, glow = 1, roll = 0): void {
    this.bRoll[i] = roll;
    const o = i * BP;
    const P = this.bPose;
    P[o] = x;
    P[o + 1] = y;
    P[o + 2] = z;
    P[o + 3] = dx;
    P[o + 4] = dy;
    P[o + 5] = dz;
    P[o + 6] = scale;
    P[o + 7] = glow;
    this.bShown[i] = ramp ? 1 : 2;
  }

  /** Drops blade `i` at once (its scale is already ~0, or a reset). */
  private drop(i: number): void {
    this.bPres[i] = 0;
    this.bShown[i] = 0;
    this.bCard[i] = 0;
    this.blades.hide(i);
  }

  /**
   * Writes every blade's pose once a frame: presence eases in while shown and out from the last pose when not.
   * Every blade turns its flat to the camera round its own axis (faceRoll; WEAPON_DESIGN §2 rule 4: the motifs lie
   * on the face toward the camera), the caller's roll (Ngự Kiếm's rocking) on top: Clear Wind's hollow ring reads
   * as an O on every copy, the swarm's at 25–60 px included.
   */
  private settleBlades(dt: number): void {
    const P = this.bPose;
    this.host.camera.getWorldPosition(this.camW);
    const up = dt / BLADE_IN_S;
    const down = dt / BLADE_OUT_S;
    for (let i = 0; i < BLADE_CAP; i += 1) {
      const shown = this.bShown[i]!;
      let p = this.bPres[i]!;
      if (shown === 0 && p <= 0) continue;
      if (shown === 2) p = 1;
      else if (shown === 1) p = Math.min(1, p + up);
      else p = Math.max(0, p - down);
      this.bPres[i] = p;
      this.bShown[i] = 0;
      if (p <= 0) {
        this.bCard[i] = 0;
        this.blades.hide(i);
        continue;
      }
      const o = i * BP;
      const k = smooth01(p);
      this.bCard[i] = k * P[o + 7]!;
      const roll = this.bRoll[i]! + this.faceRoll(P[o]!, P[o + 1]!, P[o + 2]!, P[o + 3]!, P[o + 4]!, P[o + 5]!);
      this.blades.set(i, P[o]!, P[o + 1]!, P[o + 2]!, P[o + 3]!, P[o + 4]!, P[o + 5]!, P[o + 6]! * k, roll);
      const aura = this.bAura[i]!;
      this.bAura[i] = 0;
      if (aura > 0 && this.swordAura !== null && this.swordAura.on) {
        // The aura wears the pose as drawn: guard point, tip direction, its length with the scale-in.
        const a = this.swordAura.input;
        a.id = i;
        a.gx = P[o]!;
        a.gy = P[o + 1]!;
        a.gz = P[o + 2]!;
        a.dx = P[o + 3]!;
        a.dy = P[o + 4]!;
        a.dz = P[o + 5]!;
        a.blade = 1.1 * P[o + 6]! * k;
        a.pommelY = 1 - this.blades.span(i);
        // The rocking roll on top of the face roll turns the blade's flat away: it reads narrower.
        a.widthK = Math.max(0.25, Math.abs(Math.cos(this.bRoll[i]!)));
        a.cls = AURA_LEAD;
        a.state = aura - 1;
        a.level = this.bAuraLevel[i]!;
        a.releaseAge = this.bAuraRelease[i]!;
        a.presence = k;
        a.dissolve = Math.max(this.bAuraFade[i]!, this.bDis[i]!);
        a.bright = 1;
        a.diving = aura - 1 === AURA_FLY;
        a.hero = true;
        this.swordAura.push();
      }
    }
  }

  // ── Typing → charge ──────────────────────────────────────────────────────

  /** Typing progress of the word on `slot` (0 first key … 1 last key); −1 cancels. `tx, tz`: where it will land. */
  setCharge(slot: SwordSlot, progress: number, tx = 0, tz = -8): void {
    const before = this.charge[slot];
    // A new word starts its sigil from nothing (the drawn progress then eases toward the keys); while the
    // slot's last cast still runs, that cast keeps the sigil (sigilFree) and this word takes it over at its cast.
    if (before < 0 && progress >= 0 && !this.running(slot)) {
      this.reveal[slot] = 0;
      this.chargeAge[slot] = 0;
    }
    this.charge[slot] = progress;
    this.chargeTarget.x = tx;
    this.chargeTarget.z = tz;
    if (progress >= 0 && progress > before) this.keyBeat(slot, progress);
  }

  /** One key on a word: a glint, a star and a ground pulse that grow with progress (T0, VFX_STANDARD §3.3). */
  private keyBeat(slot: SwordSlot, p: number): void {
    this.host.hand(this.v);
    this.host.caster(this.c);
    this.use(slot);
    // The element's charge layer (its hook), with what appeared on this key; the seal's blaze stays the shape's.
    const hook = this.hooks.chargeKey;
    if (hook !== undefined) {
      const a = this.aKey;
      a.slot = slot;
      a.p = p;
      a.hand.copy(this.v);
      this.poseOf(a.caster);
      a.pal = this.pal;
      a.count = 0;
      if (slot === "k1") {
        for (let j = 0; j < 3; j += 1) {
          const th = K1_SHOW[j]!;
          if (p >= th && this.chargeShown.k1 < th) this.k1Socket(j, a.appeared[a.count++]!);
        }
      } else if (slot === "k4") {
        const corners = Math.floor(p * 6 + 1e-6);
        for (let k = Math.floor(this.chargeShown.k4 * 6 + 1e-6); k < corners && a.count < a.appeared.length; k += 1) {
          const th = (k * Math.PI) / 3 + Math.PI / 6;
          a.appeared[a.count++]!.set(this.chargeTarget.x + Math.cos(th) * 3.55, 0.15, this.chargeTarget.z - Math.sin(th) * 3.55);
        }
      }
      if (hook(a)) {
        this.blazeGoal = Math.max(this.blazeGoal, 0.35 + 0.35 * p);
        if (slot === "k1") this.chargeShown.k1 = p;
        if (slot === "k4") this.chargeShown.k4 = p;
        return;
      }
    }
    // Key glints and K1's arriving swords ease in over ≥ 3 frames (round 2), still starting on the key's frame.
    this.riseS = SOFT_RISE_S;
    const s = this.glow.spec.reset();
    s.x = this.v.x;
    s.y = this.v.y;
    s.z = this.v.z;
    s.life = 0.2;
    s.size0 = 0.6 + 0.6 * p;
    s.size1 = 0.35;
    this.col(s, this.pal.halo, 1);
    s.a = 0.9;
    s.fadeIn = SOFT_RISE_S;
    this.glow.emit();
    this.twinkle(this.v.x, this.v.y, this.v.z, 0.45 + 0.55 * p, 0.16, 0.8);
    const big = slot === "k5" ? 1.4 : 1;
    this.ring(this.c.x, this.c.z, 0.35, (1.1 + 0.9 * p) * big, 0.28, 0.4 + 0.3 * p);
    this.blazeGoal = Math.max(this.blazeGoal, 0.35 + 0.35 * p);
    if (slot === "k1") {
      for (let j = 0; j < 3; j += 1) {
        const th = K1_SHOW[j]!;
        if (p >= th && this.chargeShown.k1 < th) {
          this.k1Socket(j, this.w);
          this.burstMotes(this.w, this.n(8), 0.7);
          // The blade arrives as a stroke of light.
          this.beamAt(this.w.x, this.w.y - 0.7, this.w.z, 0, 1, 0, 1.9, 0.5, 0.28, 0.8, 0.8, 0.05, 0.6, 0);
          this.twinkle(this.w.x, this.w.y + 0.2, this.w.z, 0.9, 0.18, 1);
        }
      }
      this.chargeShown.k1 = p;
    }
    if (slot === "k4") {
      // Corners of the array light one by one with the word, each with a short column of light.
      const corners = Math.floor(p * 6 + 1e-6);
      const shown = Math.floor(this.chargeShown.k4 * 6 + 1e-6);
      for (let k = shown; k < corners; k += 1) {
        const th = (k * Math.PI) / 3 + Math.PI / 6;
        this.w.set(this.chargeTarget.x + Math.cos(th) * 3.55, 0.15, this.chargeTarget.z - Math.sin(th) * 3.55);
        this.burstMotes(this.w, this.n(7), 0.6);
        this.pillar(this.w.x, this.w.z, 2.2, 0.45, 0.35, 0.8);
        this.twinkle(this.w.x, 0.4, this.w.z, 0.9, 0.18, 1);
      }
      this.chargeShown.k4 = p;
    }
    this.riseS = 0;
  }

  // ── Release ───────────────────────────────────────────────────────────────

  /** The word's last key: release now (≤ 50 ms), toward (tx, tz). */
  cast(slot: SwordSlot, tx: number, tz: number): void {
    this.castTyped = this.charge[slot] >= 0;
    // Cast with no word typed (lab API): its sigil fades and draws in from the release, or, if it is still on
    // screen from a cast that runs, carries on from the fade and reveal it shows (it dropped to 0 in one frame).
    if (!this.castTyped) {
      const sig = this.sigilOf(slot);
      const on = sig !== null && sig.mesh.visible;
      this.chargeAge[slot] = on ? SIGIL_IN_S * invSmooth01(sig.uniforms.uFade.value) : 0;
      if (!on) this.reveal[slot] = 0;
      // Thiên Hà's halo shows only the blades its word gathered: none here (a stale count drew a ring of 24).
      if (slot === "k5") this.haloN = 0;
    }
    this.charge[slot] = -1;
    this.host.caster(this.c);
    this.use(slot);
    // The seal under the caster takes this skill's glyph and colours (a cast with no word typed too).
    this.sealNext = SLOT_SHAPE[slot];
    this.sealSlot = slot;
    switch (slot) {
      case "auto":
        return this.castAuto();
      case "k1":
        return this.castK1(tx, tz);
      case "k2":
        return this.castK2(tx, tz);
      case "guard":
        return this.castGuard();
      case "dash":
        return this.castDash(tx, tz);
      case "k4":
        return this.castK4(tx, tz);
      case "k5":
        return this.castK5(tx, tz);
    }
  }

  /** The ground sigil a slot's word draws (null: none). */
  private sigilOf(slot: SwordSlot): GroundSigil | null {
    switch (slot) {
      case "k2":
        return this.sigLine;
      case "guard":
        return this.sigArcs;
      case "dash":
        return this.sigArrow;
      case "k4":
        return this.sigHex;
      case "k5":
        return this.sigSpiral;
      default:
        return null;
    }
  }

  /** Nhất Tuyến's blade for the word being typed and its cast: the slot the running line does not use. */
  private k2Next(): number {
    return this.k2.blade === HERO.k2 ? HERO.k2 + 1 : HERO.k2;
  }

  /** A blade is busy while it is on screen (in a flight, folding, or fading out). */
  private bladeBusy(blade: number): boolean {
    if (this.bPres[blade]! > 0) return true;
    for (const q of this.flights) if (q.active && q.blade === blade) return true;
    return false;
  }

  /** Phi Kiếm's next slot: the next free one of AUTO_N in turn, else the next in turn (its old flight ends). */
  private pickAutoSlot(): number {
    for (let k = 1; k <= AUTO_N; k += 1) {
      const s = (this.autoSlot + k) % AUTO_N;
      if (!this.bladeBusy(HERO.auto + s)) return s;
    }
    return (this.autoSlot + 1) % AUTO_N;
  }

  /**
   * The release at the hand (round 2): a small hot flare and star at the
   * hand, pushed a little along the blow, rising over ~2.5 frames and gone in
   * ~5 more; the big coloured star and glow burn BEHIND the caster (along the
   * view ray to behind the feet, behindCaster), so the body is drawn over its
   * own burst and stays readable at the 6 m close-up (the full-strength flash
   * erased it); a thin shock ring and short rays round the hand; a ground ring
   * and shock; from tier 3 a light pillar behind the caster; the seal blazes.
   * `tier`: 1 basic, 2 light skill, 3 skill, 5 ultimate.
   */
  private releaseFlash(size: number, intensity: number, ringM: number, tier: number, skill: string = this.palSlot): void {
    this.host.hand(this.v);
    const v = this.v;
    const hx = v.x + this.c.fx * 0.22;
    const hy = v.y;
    const hz = v.z + this.c.fz * 0.22;
    this.host.camera.getWorldPosition(this.camW);
    this.host.camera.getWorldDirection(this.camF);
    // The element's release (its hook); the seal's blaze, the presence count and the impact light stay the shape's.
    const hook = this.hooks.release;
    if (hook !== undefined) {
      const a = this.aRelease;
      a.slot = this.palSlot;
      a.skill = skill;
      a.tier = tier;
      a.size = size;
      a.intensity = intensity;
      a.ringM = ringM;
      a.at.set(hx, hy, hz);
      a.hand.copy(v);
      this.poseOf(a.caster);
      a.pal = this.pal;
      if (hook(a)) {
        if (!this.lite) this.blazeGoal = Math.max(this.blazeGoal, 0.9 + 0.35 * Math.max(2, tier));
        this.presence.releases += 1;
        this.presence.tier = tier;
        this.host.flash(v, this.pal.flash, intensity);
        return;
      }
    }
    const rot = this.rand.range(-0.3, 0.3);
    this.riseS = RELEASE_RISE_S;
    this.flareAt(hx, hy, hz, RELEASE_LIFE_S, size * 0.85, size * 1.25);
    const h = this.star.spec.reset();
    h.x = hx;
    h.y = hy;
    h.z = hz;
    h.life = RELEASE_LIFE_S;
    h.size0 = size * 1.9;
    h.size1 = size * 2.3;
    h.rot = rot;
    h.fadeIn = RELEASE_RISE_S;
    this.col(h, this.pal.core, 1);
    this.star.emit();
    // Behind the body: the big star in the skill's colour and a soft glow (≤ 0.9, no bloom).
    if (!this.lite) {
      const c = this.backStar.spec.reset();
      c.x = hx;
      c.y = hy;
      c.z = hz;
      c.life = RELEASE_LIFE_S * 1.25;
      c.size0 = size * 3.4;
      c.size1 = size * 4.3;
      c.rot = rot;
      c.fadeIn = RELEASE_RISE_S;
      this.col(c, this.pal.rim, 1);
      this.behindCaster(c, this.c.x, this.c.z);
      this.backStar.emit();
    }
    if (tier >= 3) {
      const g = this.backGlow.spec.reset();
      g.x = hx;
      g.y = hy;
      g.z = hz;
      g.life = 0.28;
      g.size0 = size * 3.6;
      g.size1 = size * 4.6;
      g.fadeIn = RELEASE_RISE_S;
      this.col(g, this.pal.rim, 1);
      g.a = 0.6;
      this.behindCaster(g, this.c.x, this.c.z);
      this.backGlow.emit();
    } else {
      // The basic shot and slot 1 (round 3a, P8): no broad soft glow; a bigger hot star and eight speed lines at
      // the hand, a seal ring that flares there (full on its first frame) and spins out over the flight, a second
      // one inside it, both in the skill's cyan.
      const b = this.star.spec.reset();
      b.x = hx;
      b.y = hy;
      b.z = hz;
      b.life = 0.11;
      b.size0 = 2.1;
      b.size1 = 2.6;
      b.rot = rot + Math.PI / 4;
      this.col(b, this.pal.core, 1.1);
      this.star.emit();
      this.rays(hx, hy, hz, this.n(8), 2.2, 0.12, 0.14, 0.45);
      for (let k = 0; k < 2; k += 1) {
        const r = this.handRing.spec.reset();
        r.x = hx;
        r.y = hy;
        r.z = hz;
        r.life = k === 0 ? 0.32 : 0.2;
        r.size0 = k === 0 ? 1.2 : 0.7;
        r.size1 = k === 0 ? 2.1 : 1.0;
        r.rot = this.rand.range(0, 6.28);
        r.rotV = k === 0 ? 5 : -7;
        this.col(r, this.pal.rim, 1);
        r.a = 0.95;
        this.handRing.emit();
      }
    }
    this.shockAt(hx, hy, hz, 0.8 + 0.4 * tier, 0.2 + 0.03 * tier, 0.65);
    this.rays(hx, hy, hz, this.n(4 + 2 * tier), 1.1 + 0.45 * tier, 0.12 + 0.03 * tier, 0.16 + 0.02 * tier, 0.55);
    this.riseS = 0;
    if (ringM > 0) {
      this.darkDisc(this.c.x, this.c.z, ringM * 1.1, 0.4, 0.7);
      this.ring(this.c.x, this.c.z, 0.3, ringM * 1.2, 0.32, 0.75);
      this.groundShockAt(this.c.x, this.c.z, 0.3, ringM * 1.1, 0.42, 0.7);
      this.glowDisc(this.c.x, this.c.z, ringM * 0.6, 0.4, 0.45);
    }
    if (tier >= 3) {
      // The pillar stands behind the caster (0.8 m deeper along the view), so it frames the body instead of crossing it.
      const fl = Math.hypot(this.camF.x, this.camF.z) || 1;
      this.riseS = RELEASE_RISE_S;
      this.pillar(this.c.x + (this.camF.x / fl) * 0.8, this.c.z + (this.camF.z / fl) * 0.8, 3 + 1.6 * tier, 0.4 + 0.16 * tier, 0.3 + 0.05 * tier, 0.85);
      this.riseS = 0;
    }
    this.sparkBurst(hx, hy, hz, this.n(6 + 4 * tier), 0.8 + 0.2 * tier);
    this.burstMotes(v, this.n(5 + 3 * tier), 1.3);
    // The caster's seal blazes on every release (round 3a: the basic shot's too, its charge sigil; Low: none).
    if (!this.lite) this.blazeGoal = Math.max(this.blazeGoal, 0.9 + 0.35 * Math.max(2, tier));
    this.presence.releases += 1;
    this.presence.tier = tier;
    this.host.flash(v, this.pal.flash, intensity);
  }

  private castAuto(): void {
    this.host.play("attack");
    const target = this.host.targets.nearest(this.c.x, this.c.z, 10);
    if (target < 0) return;
    // Phi Kiếm is the weapon itself (WEAPON_DESIGN §5): it leaves the hand (the hand prop melts into it, handAway),
    // a short rise then the dive (lands at +18 ticks), and comes back to the hand once it has folded.
    this.host.hand(this.v);
    this.autoSlot = this.pickAutoSlot();
    this.launch(HERO.auto + this.autoSlot, this.v.x, this.v.y, this.v.z, target, T_AUTO_HIT, 0.9, 0.35, -1, 0.24, false, "auto");
    this.releaseFlash(0.7, 3.5, 1.2, 1);
  }

  private k1Socket(j: number, out: THREE.Vector3): THREE.Vector3 {
    // Behind the shoulders: left, top, right, in the caster's frame (facing f, right r = (-fz, fx)).
    const rx = -this.c.fz;
    const rz = this.c.fx;
    const side = j === 0 ? -0.62 : j === 1 ? 0 : 0.62;
    const up = j === 1 ? 2.05 : 1.7;
    const back = 0.42;
    this.host.caster(this.c);
    out.set(this.c.x + rx * side - this.c.fx * back, up, this.c.z + rz * side - this.c.fz * back);
    return out;
  }

  private castK1(tx: number, tz: number): void {
    this.host.play("attack");
    this.k1.active = true;
    this.k1.t = 0;
    this.k1.launched = 0;
    this.k1.tx = tx;
    this.k1.tz = tz;
    this.releaseFlash(0.75, 4, 1.8, 2);
    this.k1Launch(0);
    this.k1.launched = 1;
  }

  /** Blade j leaves its socket from the pose it shows (no hidden frame, no jump): launch() starts the flight there. */
  private k1Launch(j: number): void {
    const target = this.host.targets.nearest(this.c.x, this.c.z, 12);
    this.k1Socket(j, this.v);
    if (target < 0) {
      // No beast in reach: the blade breaks into motes (it is no longer shown, so it fades out where it stands).
      this.burstMotes(this.v, this.n(8), 0.8);
      return;
    }
    const pierce = this.host.targets.nearest(this.host.targets.x(target), this.host.targets.z(target), 3, target);
    this.launch(HERO.k1 + j, this.v.x, this.v.y, this.v.z, target, 0.1, 1.0, 0.15, pierce, 0.26, j === 2, "k1");
  }

  private castK2(tx: number, tz: number): void {
    this.host.play("skill1");
    let dx = tx - this.c.x;
    let dz = tz - this.c.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const k = this.k2;
    if (k.active && k.ribbonOn) this.ribbons.stop(k.ribbon);
    if (k.silk >= 0) this.ribbons.stop(k.silk);
    k.silk = -1;
    // The new line takes the other blade slot: a line still running leaves its blade, which fades out where
    // it is (settleBlades) instead of being pulled onto the new line.
    const blade = this.k2Next();
    k.blade = blade;
    k.active = true;
    k.t = 0;
    k.hit = false;
    k.acc = 0;
    k.sparks = 0;
    k.ax = this.c.x + dx * 0.6;
    k.az = this.c.z + dz * 0.6;
    k.bx = this.c.x + dx * 14.6;
    k.bz = this.c.z + dz * 14.6;
    k.dx = dx;
    k.dz = dz;
    k.glow0 = this.sigLine.mesh.visible ? this.sigLine.uniforms.uGlow.value : 0;
    // The blade shown at the hand while the word was typed: its offset from the line's start, closed over K2_JOIN_S.
    // Only a typed word put it at the hand; otherwise its last pose is a line two casts old (it pulled the new
    // blade 14 m back across the field), so a remnant of that is dropped (its fold left it at ~0 size).
    const o = blade * BP;
    const shown = this.castTyped && this.bPres[blade]! > 0;
    if (!shown && this.bPres[blade]! > 0) this.drop(blade);
    k.jx = shown ? this.bPose[o]! - k.ax : 0;
    k.jy = shown ? this.bPose[o + 1]! - 0.9 : 0;
    k.jz = shown ? this.bPose[o + 2]! - k.az : 0;
    this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
    this.releaseFlash(0.8, 5, 1.8, 3);
    this.host.impulse(1, dx, dz);
    // The sword runs the whole line in 0.2 s (hit at +12 ticks): a sword-light beam sweeps out with it, and a thin
    // trail follows its pommel.
    const r = this.nextRibbon();
    const tr = this.kit.trail;
    this.ribbons.start(r, k.ax + k.jx, 0.9 + k.jy, k.az + k.jz, tr.widthM, tr.core[0], tr.core[1], tr.core[2], 1);
    this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    k.ribbon = r;
    k.ribbonOn = true;
    k.silk = tr.silk ? this.startSilk(k.ax + k.jx, 0.9 + k.jy, k.az + k.jz, 0.1) : -1;
    // Narrow, and fading at its head where the sword runs (03/11: a 1.5 m beam hid the real sword inside it).
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 0.5, 0.55, 0.8, 0.55, 0.02, 0.3, T_K2_HIT);
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 0.16, 0.5, 1.2, 0.4, 0.02, 0.3, T_K2_HIT);
  }

  private castGuard(): void {
    this.host.play("skill2");
    const g = this.guard;
    // Cast again while it runs (the lab has no cooldown): the ward refreshes where it is. Its orbit, blades and
    // barrier carry on (they used to restart 4 m up with the barrier at 0: 5 m blade jumps, 167° snaps), blades
    // that parried spring back to their places, and a closing ward reopens from the level it had.
    const refresh = g.active;
    const closing = g.closeT >= 0;
    g.refresh = refresh;
    g.lay0 = refresh ? g.lay : 0;
    g.active = true;
    g.t = 0;
    g.charges = 3;
    if (!refresh) {
      g.shownCharges = 3;
      g.spin = 0;
    }
    g.closeT = -1;
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.releaseFlash(0.7, 4, 2.4, 3);
    // The barrier rings out round the caster.
    this.shockAt(this.c.x, 1.0, this.c.z, 2.6, 0.32, 0.8);
    for (let j = 0; j < 3; j += 1) {
      const blade = HERO.guard + j;
      const a = g.spin + (j * Math.PI * 2) / 3;
      let x = this.c.x + Math.cos(a) * 2;
      let y = 1.0 + 4;
      let z = this.c.z + Math.sin(a) * 2;
      g.ret[j] = 0;
      if (refresh) {
        const orbiting = g.blockT[j]! < 0;
        // An orbiting blade keeps its live trail; a closing ward's trails were stopped, so they start again.
        if (orbiting && !closing) continue;
        if (!orbiting) g.ret[j] = this.bPres[blade]! > 0 ? 1 : 0;
        y = 1.0;
        if (this.bPres[blade]! > 0) {
          x = this.gPos[j * 3]!;
          y = this.gPos[j * 3 + 1]!;
          z = this.gPos[j * 3 + 2]!;
        }
        this.ribbons.stop(g.ribbon[j]!);
      } else {
        this.bladeTint(blade, 1);
      }
      g.blockT[j] = -1;
      const r = this.nextRibbon();
      const tr = this.kit.trail;
      this.ribbons.start(r, x, y, z, tr.widthM, tr.core[0], tr.core[1], tr.core[2], 1);
      this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
      g.ribbon[j] = r;
    }
  }

  /** An enemy blow reaching the Hộ thân ring from (fromX, fromZ): the nearest blade parries. Returns false when no charge is left. */
  block(fromX: number, fromZ: number): boolean {
    const g = this.guard;
    if (!g.active || g.charges <= 0 || g.closeT >= 0) return false;
    this.host.caster(this.c);
    this.use("guard");
    const ang = Math.atan2(fromZ - this.c.z, fromX - this.c.x);
    // The live blade whose orbit angle is closest to the blow.
    let best = -1;
    let bestD = 9;
    for (let j = 0; j < 3; j += 1) {
      if (g.blockT[j]! >= 0) continue;
      const a = g.spin + (j * Math.PI * 2) / 3;
      const d = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) return false;
    g.blockT[best] = 0;
    g.blockX[best] = this.c.x + Math.cos(ang) * 2.05;
    g.blockZ[best] = this.c.z + Math.sin(ang) * 2.05;
    g.charges -= 1;
    this.v.set(g.blockX[best]!, 1.0, g.blockZ[best]!);
    this.impact(this.v, 1.2, Math.cos(ang), Math.sin(ang), 1.0, false);
    this.slashAt(this.v, ang + Math.PI / 2, 1.8);
    this.rays(this.v.x, this.v.y, this.v.z, this.n(7), 1.6, 0.14, 0.16, 0.6);
    this.groundShockAt(this.v.x, this.v.z, 0.2, 1.8, 0.32, 0.75);
    this.pillar(this.v.x, this.v.z, 3.2, 0.6, 0.3, 0.9);
    this.shockAt(this.v.x, this.v.y, this.v.z, 2.4, 0.24, 0.8);
    this.host.flash(this.v, this.pal.flash, 6);
    this.host.hitStop(STOP_MS.block);
    this.host.shake?.(SHAKE_M.block);
    return true;
  }

  private castDash(tx: number, tz: number): void {
    this.host.play("dash");
    let dx = tx - this.c.x;
    let dz = tz - this.c.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const d = this.dash;
    if (d.active) this.ribbons.stop(d.ribbon);
    d.active = true;
    d.t = 0;
    d.ghosts = 0;
    d.arrived = false;
    d.ax = this.c.x;
    d.az = this.c.z;
    d.bx = this.c.x + dx * DASH_M;
    d.bz = this.c.z + dz * DASH_M;
    d.dx = dx;
    d.dz = dz;
    d.glow0 = this.sigArrow.mesh.visible ? this.sigArrow.uniforms.uGlow.value : 0;
    this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, DASH_M);
    this.releaseFlash(0.6, 3, 1.2, 2);
    this.dust(this.c.x, this.c.z, this.n(5), 0.7);
    const r = this.nextRibbon();
    this.ribbons.start(r, this.c.x, 1.0, this.c.z, 0.42, this.pal.body[0] * 2.0, this.pal.body[1] * 2.0, this.pal.body[2] * 2.0, 1);
    this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    d.ribbon = r;
    // Speed lines sweep along the path with the caster (thin: they pass the body).
    const rx = -dz;
    const rz = dx;
    for (let i = 0; i < 4; i += 1) {
      const off = (i - 1.5) * 0.42;
      const y = 0.35 + this.rand.range(0, 1.3);
      this.beamAt(this.c.x + rx * off, y, this.c.z + rz * off, dx, 0, dz, 5.2, 0.1, 0.42, 0.65, 0.55, 0.55, 0.1, 0.2);
    }
  }

  private castK4(tx: number, tz: number): void {
    this.host.play("skill2");
    const k = this.k4;
    if (k.active) {
      // The array still holds: its six blades are left to fade where they stand (the new array takes the other
      // set; reusing them jumped 6.7 m in one frame) and its held light fades out there.
      const o = this.k4Old;
      o.t = 0;
      o.x = k.x;
      o.z = k.z;
      o.hold = k.hold;
      o.dark = k.dark;
      k.set = 1 - k.set;
    }
    k.active = true;
    k.t = 0;
    k.beats = 0;
    k.landed = false;
    k.closed = false;
    k.beatAge = -1;
    k.x = tx;
    k.z = tz;
    this.sigHex.place(tx, tz, 0);
    this.releaseFlash(0.7, 4, 1.8, 3);
  }

  private castK5(tx: number, tz: number): void {
    this.host.play("ult");
    const k = this.k5;
    k.active = true;
    k.t = 0;
    k.acc = 0;
    k.wave = 0;
    k.done = false;
    k.dissolved = false;
    k.x = tx;
    k.z = tz;
    k.glow0 = this.sigSpiral.mesh.visible ? this.sigSpiral.uniforms.uFade.value : 0;
    for (const d of this.drops) d.active = false;
    for (const p of this.planted) p.active = false;
    for (const m of this.marks) m.active = false;
    this.plantedN = 0;
    this.rainNextLead = 0;
    this.rainWaveHit.fill(0);
    this.rift.t = -1;
    this.colossus.active = false;
    // The gate opens over the far field, ~46 % of the view wide, high in the frame (f5), for this camera.
    this.gate.place(this.host.camera as THREE.PerspectiveCamera, 0.74, RAIN_GATE_Y, 0.44);
    // The columns hang from the gate's rim to four ground points across the field (left flank to right flank).
    for (let i = 0; i < this.columns.length; i += 1) {
      const c = this.columns[i]!;
      const s = RAIN_COLUMN_X[i]!;
      c.gx = s * 14;
      c.gz = -14 + 5 * Math.abs(s) + this.rand.range(-1, 1);
      c.rimA = Math.PI * (1.12 + 0.76 * (i / (this.columns.length - 1))) ;
      c.t0 = 0.1 + 0.07 * i;
    }
    this.releaseFlash(1.1, 8, 3.2, 5);
    this.host.impulse(2, tx - this.c.x, tz - this.c.z);
    // The caster's command: one column of light up from the hand into the sky.
    this.host.hand(this.v);
    this.beamAt(this.v.x, this.v.y + 0.2, this.v.z, 0, 1, 0, 26, 0.34, 0.5, 1.1, 0.85, 0.02, 0.9, 0.06);
    this.groundShockAt(this.c.x, this.c.z, 0.4, 3.2, 0.4, 0.8);
  }

  // ── Shared pieces ────────────────────────────────────────────────────────

  /** The caster's pose as last read (this.c) into a hook's argument. */
  private poseOf(out: { x: number; z: number; fx: number; fz: number }): void {
    out.x = this.c.x;
    out.z = this.c.z;
    out.fx = this.c.fx;
    out.fz = this.c.fz;
  }

  /** Burst count scaled by the quality tier (low halves). */
  private n(count: number): number {
    return Math.max(1, Math.round(count * this.dens));
  }

  private col(s: Rgbish, c: Rgb, k: number): void {
    s.r = c[0] * k;
    s.g = c[1] * k;
    s.b = c[2] * k;
  }

  private beamCol(b: { cr: number; cg: number; cb: number; hr: number; hg: number; hb: number }, kCore: number, kRim: number): void {
    const c = this.pal.core;
    const r = this.pal.rim;
    b.cr = c[0] * kCore;
    b.cg = c[1] * kCore;
    b.cb = c[2] * kCore;
    // Halo ≤ 0.9: kRim ≤ 1 on a rim of max 0.86.
    const kr = Math.min(kRim, 1);
    b.hr = r[0] * kr;
    b.hg = r[1] * kr;
    b.hb = r[2] * kr;
  }

  /** One beam from (x, y, z) along unit (dx, dy, dz). `grow` > 0 sweeps the tip out; life ≤ 0 is one frame. */
  private beamAt(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, width: number, life: number, kCore: number, kRim: number, fadeBase: number, fadeTip: number, grow: number): void {
    const b = this.beams.spec.reset();
    b.x = x;
    b.y = y;
    b.z = z;
    b.dx = dx;
    b.dy = dy;
    b.dz = dz;
    b.len0 = len;
    b.len1 = len;
    b.grow = grow;
    b.w0 = width;
    b.w1 = width * 0.55;
    b.life = life;
    this.beamCol(b, kCore, kRim);
    b.fadeBase = fadeBase;
    b.fadeTip = fadeTip;
    b.rise = this.riseS;
    this.beams.emit();
  }

  /** A pillar of light rising from the ground, with a glow at its foot. */
  private pillar(x: number, z: number, height: number, width: number, life: number, k: number): void {
    const b = this.beams.spec.reset();
    b.x = x;
    b.y = 0.02;
    b.z = z;
    b.len0 = height * 0.75;
    b.len1 = height;
    b.grow = 0.05;
    b.w0 = width * 0.5;
    b.w1 = width;
    b.life = life;
    this.beamCol(b, 0.8 * k, 0.85 * k);
    b.fadeBase = 0.02;
    b.fadeTip = 0.7;
    b.rise = this.riseS;
    this.beams.emit();
    this.glowDisc(x, z, width * 1.3, 0.7 * k, life * 1.4);
  }

  /** Rays bursting out of a point (anime speed lines), mostly level, some rising. */
  private rays(x: number, y: number, z: number, count: number, len: number, width: number, life: number, rise: number): void {
    const a0 = this.rand.range(0, Math.PI * 2);
    for (let i = 0; i < count; i += 1) {
      const a = a0 + (i / count) * Math.PI * 2 + this.rand.range(-0.25, 0.25);
      const e = this.rand.range(-0.15, rise);
      const ce = Math.cos(e);
      const b = this.beams.spec.reset();
      b.x = x;
      b.y = y;
      b.z = z;
      b.dx = Math.cos(a) * ce;
      b.dy = Math.sin(e);
      b.dz = Math.sin(a) * ce;
      const l = len * this.rand.range(0.7, 1.25);
      b.len0 = l * 0.6;
      b.len1 = l;
      b.grow = 0.03;
      b.w0 = width;
      b.w1 = width * 0.35;
      b.life = life * this.rand.range(0.8, 1.2);
      this.beamCol(b, 0.9, 0.7);
      b.fadeBase = 0.18;
      b.fadeTip = 0.6;
      b.rise = this.riseS;
      this.beams.emit();
    }
  }

  /** A core flare, full on its first frame; at Low it goes to the star sheet (one draw call fewer). */
  private flareAt(x: number, y: number, z: number, life: number, size0: number, size1: number): void {
    const pool = this.lite ? this.star : this.flare;
    const f = pool.spec.reset();
    f.x = x;
    f.y = y;
    f.z = z;
    // At least FLARE_MIN_S: a shorter flare loses over 30 % of its light on its last frame at 60 Hz.
    f.life = Math.max(FLARE_MIN_S, life);
    f.size0 = size0;
    f.size1 = size1;
    f.fadeIn = this.riseS;
    this.col(f, this.pal.core, 1);
    pool.emit();
  }

  /** A camera-facing shock ring of radius `r` m, full on its first frame (Low: none, the ground rings carry the shock). */
  private shockAt(x: number, y: number, z: number, r: number, life: number, alpha: number): void {
    if (this.lite) return;
    const s = this.shock.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = life;
    s.size0 = (r * 0.2) / R_SHOCK;
    s.size1 = r / R_SHOCK;
    s.rot = this.rand.range(0, 6.28);
    this.col(s, this.pal.rim, 1);
    s.a = alpha;
    s.fadeIn = this.riseS;
    this.shock.emit();
  }

  /** A thick shock ring on the ground from r0 to r1 m (Low: a thin ring on the ring sheet, one draw call fewer). */
  private groundShockAt(x: number, z: number, r0: number, r1: number, life: number, alpha: number): void {
    const pool = this.lite ? this.groundRing : this.groundShock;
    const R = this.lite ? R_RING : R_SHOCK;
    const s = pool.spec.reset();
    s.x = x;
    s.y = 0.05;
    s.z = z;
    s.life = life;
    s.size0 = r0 / R;
    s.size1 = r1 / R;
    s.rot = this.rand.range(0, 6.28);
    this.col(s, this.pal.rim, 1);
    s.a = alpha;
    s.fadeIn = this.riseS;
    pool.emit();
  }

  /** A soft additive glow on the ground of radius `r` m; life ≤ 0 is one frame. */
  private glowDisc(x: number, z: number, r: number, alpha: number, life: number): void {
    const s = this.groundGlow.spec.reset();
    s.x = x;
    s.y = 0.03;
    s.z = z;
    s.life = life;
    s.size0 = r / R_DISC;
    s.size1 = (r * 1.15) / R_DISC;
    this.col(s, this.pal.rim, 1);
    s.a = alpha;
    this.groundGlow.emit();
  }

  /** A dark soft disc under an effect (normal blend), so its light reads on pale stone; life ≤ 0 is one frame. */
  private darkDisc(x: number, z: number, r: number, alpha: number, life: number): void {
    const s = this.groundDark.spec.reset();
    s.x = x;
    s.y = 0.015;
    s.z = z;
    s.life = life;
    s.size0 = s.size1 = r / R_DISC;
    s.r = INK[0];
    s.g = INK[1];
    s.b = INK[2];
    s.a = alpha;
    this.groundDark.emit();
  }

  /**
   * A four-point glint; life ≤ 0 is one frame. `rot` (rad) for a glint
   * re-emitted every frame (a tip star): a steady turn, not a random angle a
   * frame that strobes; NaN picks a random one.
   */
  private twinkle(x: number, y: number, z: number, size: number, life: number, k: number, rot = Number.NaN): void {
    const s = this.star.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = life;
    // Shrinks to 70 %, not 40 %: a 0.1 s glint lost a third of its light on its second frame.
    s.size0 = size * 1.35;
    s.size1 = size * 0.95;
    s.rot = Number.isNaN(rot) ? this.rand.range(-0.4, 0.4) : rot;
    s.fadeIn = life > 0 ? this.riseS : 0;
    this.col(s, this.pal.core, 0.75 * k);
    this.star.emit();
  }

  /**
   * A star burst in two layers (white-core rule, VFX_STANDARD §3.5.3): a big
   * star in the weapon's rim colour (≤ 0.9, no bloom) and a hot HDR star at
   * 45 % of its size inside it, both full on their first frame.
   */
  private starPair(x: number, y: number, z: number, size: number, life: number, rot: number): void {
    const c = this.star.spec.reset();
    c.x = x;
    c.y = y;
    c.z = z;
    c.life = life * 1.2;
    c.size0 = size;
    c.size1 = size * 1.25;
    c.rot = rot;
    c.fadeIn = this.riseS;
    this.col(c, this.pal.rim, 1);
    this.star.emit();
    const h = this.star.spec.reset();
    h.x = x;
    h.y = y;
    h.z = z;
    h.life = life;
    h.size0 = size * 0.45;
    h.size1 = size * 0.55;
    h.rot = rot;
    h.fadeIn = this.riseS;
    this.col(h, this.pal.core, 1);
    this.star.emit();
  }

  private sparkBurst(x: number, y: number, z: number, count: number, speed: number): void {
    for (let i = 0; i < count; i += 1) {
      const s = this.spark.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      const a = this.rand.range(0, Math.PI * 2);
      const sp = this.rand.range(4, 10) * speed;
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(-1, 5) * speed;
      s.gravity = -10;
      s.drag = 2.4;
      s.life = this.rand.range(0.2, 0.4);
      s.size0 = 0.11;
      s.size1 = 0.05;
      s.stretch = 0.05;
      s.fadeIn = this.riseS;
      this.col(s, this.pal.core, 0.8);
      this.spark.emit();
    }
  }

  private nextRibbon(): number {
    const r = this.ribbonCursor;
    this.ribbonCursor = (this.ribbonCursor + 1) % RIBBONS;
    return r;
  }

  /**
   * A silk-ribbon trail beside a flying copy, in the weapon's tassel colours (WeaponMotif.silk): a pale-blue body
   * (the ribbon's halo, ≤ 0.7 × 0.95) with a paler sheen down its middle (its core, 0.22 of unit), so its brightest
   * line stays ≤ 0.9 and never blooms (the sword-light beside it keeps the HDR); −1 without one.
   */
  private startSilk(x: number, y: number, z: number, fadeIn: number): number {
    const m = this.weaponDef.motif;
    if (m === undefined || !m.silk) return -1;
    const r = this.nextRibbon();
    const l = m.silkLight;
    const k = 0.22 / Math.max(l[0], l[1], l[2], 1e-3);
    this.ribbons.start(r, x, y, z, 0.11, l[0] * k, l[1] * k, l[2] * k, 0.9, fadeIn);
    this.ribbons.setRim(r, l[0], l[1], l[2]);
    return r;
  }

  /**
   * The silk trail's head: `back` m behind the blade's guard (where the hand sword's tassel hangs), fluttering
   * across the flight (two waves on world time, so a hit-stop holds it) and a little up and down.
   */
  private pushSilk(r: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, back: number, phase: number): void {
    let sx = -dz;
    let sz = dx;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-4) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    // up' = side × dir
    const ux = -sz * dy;
    const uy = sz * dx - sx * dz;
    const uz = sx * dy;
    const t = this.time;
    const f = Math.sin(t * 15 + phase) * 0.2 + Math.sin(t * 23 + phase * 1.7) * 0.06;
    const v = Math.cos(t * 11 + phase) * 0.06;
    this.ribbons.push(r, x - dx * back + sx * f + ux * v, y - dy * back + uy * v, z - dz * back + sz * f + uz * v);
  }

  private launch(blade: number, fx: number, fy: number, fz: number, target: number, dur: number, power: number, arc: number, pierce: number, width: number, big: boolean, slot: SwordSlot): void {
    let f: Flight | null = null;
    for (const q of this.flights) {
      if (!q.active) {
        f = q;
        break;
      }
    }
    if (f === null) return;
    const T = this.host.targets;
    // A blade still in another flight (or folding in a wound) leaves it: that flight ends and its trail fades.
    let free = true;
    for (const q of this.flights) {
      if (q.active && q !== f && q.blade === blade) {
        q.active = false;
        this.ribbons.stop(q.ribbon);
        if (q.silk >= 0) this.ribbons.stop(q.silk);
        q.silk = -1;
        free = false;
      }
    }
    if (!free) this.drop(blade);
    // A blade already on screen (Ngự Kiếm's sockets) flies from the pose it shows and turns into its path;
    // a new one (Phi Kiếm) scales in from its start point along the path.
    if (free && this.bPres[blade]! > 0) {
      const o = blade * BP;
      fx = this.bPose[o]!;
      fy = this.bPose[o + 1]!;
      fz = this.bPose[o + 2]!;
      // Unit length: slerpDir's angle assumes it (poses keep the caller's raw tip vector).
      const dl = Math.hypot(this.bPose[o + 3]!, this.bPose[o + 4]!, this.bPose[o + 5]!);
      f.d0x = dl > 1e-6 ? this.bPose[o + 3]! / dl : 0;
      f.d0y = dl > 1e-6 ? this.bPose[o + 4]! / dl : 0;
      f.d0z = dl > 1e-6 ? this.bPose[o + 5]! / dl : 0;
    } else {
      f.d0x = f.d0y = f.d0z = 0;
    }
    f.turn = Math.min(dur * 0.9, Math.max(dur * 0.3, FLIGHT_TURN_S));
    f.slot = slot;
    f.active = true;
    f.blade = blade;
    f.ribbon = this.nextRibbon();
    f.t = 0;
    f.dur = dur;
    f.fx = fx;
    f.fy = fy;
    f.fz = fz;
    f.tx = T.x(target);
    f.ty = T.midY(target);
    f.tz = T.z(target);
    f.arc = arc;
    f.target = target;
    f.pierce = pierce;
    f.power = power;
    f.big = big;
    f.hit = -1;
    f.sx = fx;
    f.sy = fy;
    f.sz = fz;
    f.acc = 0;
    // The direction held on a frame with no step (a hit-stop, the impact): this flight's own, never the
    // last one this record flew.
    if (f.d0x !== 0 || f.d0y !== 0 || f.d0z !== 0) {
      f.ldx = f.d0x;
      f.ldy = f.d0y;
      f.ldz = f.d0z;
    } else {
      const lx = f.tx - fx;
      const ly = f.ty - fy;
      const lz = f.tz - fz;
      const ll = Math.hypot(lx, ly, lz);
      f.ldx = ll > 1e-6 ? lx / ll : 0;
      f.ldy = ll > 1e-6 ? ly / ll : 0;
      f.ldz = ll > 1e-6 ? lz / ll : 1;
    }
    // The trail grows with the flight: on a short flight (Ngự Kiếm, 0.1 s) it eases in over half of it, or the
    // fade-in and the growing length together put over 30 % of its light into the last frame (fxkit RibbonPool).
    // A thin cyan trail behind the pommel (03/11: never a wide light band over the sword): a cyan-tinted white core
    // in the skill's rim. `width` was the old band's; the real sword carries its own width now.
    void width;
    const tr = this.kit.trail;
    this.ribbons.start(f.ribbon, fx, fy, fz, tr.widthM, tr.core[0], tr.core[1], tr.core[2], 1, Math.min(0.1, dur * 0.5));
    this.ribbons.setRim(f.ribbon, this.pal.rim[0] * tr.rimK, this.pal.rim[1] * tr.rimK, this.pal.rim[2] * tr.rimK);
    // The aura's SilkTail (SWORD_AURA §3.A, §4.6): one silk ribbon in the tassel's colours replaces the sword-light and
    // the silk beside it on key 1's swords (Metal; Fire's flame trail is its SilkTail), 0.9 of the sword long.
    const motif = this.weaponDef.motif;
    f.tail = slot === "k1" && this.auraOn && tr.flame === undefined && motif !== undefined && motif.silk && this.swordAura!.weight("SilkTail") > 0;
    if (f.tail && motif !== undefined) {
      const sw = this.swordAura!.weight("SilkTail");
      const b = this.swordAura!.silkBody;
      this.ribbons.start(f.ribbon, fx, fy, fz, 0.16, 0, 0, 0, Math.min(1, sw), Math.min(0.1, dur * 0.5));
      this.ribbons.setSilk(f.ribbon, motif.silkDeep, b, 0.9 * FLIGHT_SCALE * 1.1 * this.blades.span(blade));
      f.silk = -1;
    } else f.silk = tr.silk ? this.startSilk(fx, fy, fz, Math.min(0.1, dur * 0.5)) : -1;
    this.bladeTint(blade, 1.8);
  }

  /**
   * A full hit at `at`: core star, a crossing glint, halo, shock ring, sparks
   * along the blow, ink splash and stain; `big` adds a light pillar and a
   * ground shock. Layers start on the same frame at full brightness and fall
   * off at different rates (the star in 6 frames, the ring in 12, the ink last).
   */
  private impact(at: THREE.Vector3, scale: number, dx: number, dz: number, power: number, big: boolean): void {
    const hook = this.hooks.impact;
    if (hook !== undefined) {
      const a = this.aImpact;
      a.slot = this.palSlot;
      a.at.copy(at);
      a.scale = scale;
      a.dx = dx;
      a.dz = dz;
      a.power = power;
      a.big = big;
      a.pal = this.pal;
      if (hook(a)) return;
    }
    if (this.palSlot === "auto" || this.palSlot === "k1") {
      this.basicImpact(at, scale, dx, dz, power);
      return;
    }
    const rot = this.rand.range(0, Math.PI);
    this.starPair(at.x, at.y, at.z, 3.8 * scale, 0.12, rot);
    const x = this.star.spec.reset();
    x.x = at.x;
    x.y = at.y;
    x.z = at.z;
    x.life = 0.17;
    x.size0 = 1.2 * scale;
    x.size1 = 5.0 * scale;
    x.rot = rot + Math.PI / 4;
    this.col(x, this.pal.rim, 1);
    this.star.emit();
    this.darkDisc(at.x, at.z, 1.2 * scale, 0.32, 0.5);
    this.rays(at.x, at.y, at.z, this.n(3 + 4 * power), 1.7 * scale, 0.14, 0.14, 0.6);
    this.groundShockAt(at.x, at.z, 0.2, 1.3 * scale, 0.28, 0.55);
    const g = this.glow.spec.reset();
    g.x = at.x;
    g.y = at.y;
    g.z = at.z;
    g.life = 0.22;
    g.size0 = 3.2 * scale;
    g.size1 = 4.2 * scale;
    this.col(g, this.pal.rim, 1);
    g.a = 0.6;
    this.glow.emit();
    this.shockAt(at.x, at.y, at.z, 1.9 * scale, 0.22, 0.85);
    this.hitSparks(at.x, at.y, at.z, dx, dz, this.n(6 + 10 * power), power, true);
    // Ink: a splash flung along the blow and a stain on the ground (Low: an ink puff and a soft dark spot, two sheets fewer).
    const inkPool = this.lite ? this.smoke : this.splash;
    const k = inkPool.spec.reset();
    k.x = at.x + dx * 0.15;
    k.y = at.y;
    k.z = at.z + dz * 0.15;
    k.vx = dx * 2.2;
    k.vz = dz * 2.2;
    k.vy = 0.6;
    k.drag = 4;
    k.life = 0.42;
    k.size0 = 0.9 * scale;
    k.size1 = 1.5 * scale;
    k.rot = this.rand.range(0, 6.28);
    k.r = INK[0];
    k.g = INK[1];
    k.b = INK[2];
    k.a = 0.9;
    inkPool.emit();
    if (this.lite) {
      this.darkDisc(at.x + dx * 0.3, at.z + dz * 0.3, 0.45 * scale, 0.5, 2.6);
    } else {
      const gi = this.groundInk.spec.reset();
      gi.x = at.x + dx * 0.3;
      gi.y = 0.025;
      gi.z = at.z + dz * 0.3;
      gi.life = 2.6;
      gi.size0 = 0.7 * scale;
      gi.size1 = 1.05 * scale;
      gi.rot = this.rand.range(0, 6.28);
      gi.aspect = 1.4;
      gi.r = INK[0];
      gi.g = INK[1];
      gi.b = INK[2];
      gi.a = 0.5;
      this.groundInk.emit();
    }
    if (big) {
      this.pillar(at.x, at.z, 4.2 * scale, 0.75 * scale, 0.4, 0.9);
      this.groundShockAt(at.x, at.z, 0.2, 1.8 * scale, 0.35, 0.7);
    }
    this.motifAt(at.x, at.z, scale);
  }

  /**
   * The basic shot's and slot 1's hit (round 3a, P8; judges: "a soft green bloom beside the pack, no hit spark, no
   * flinch"): centred on the target and graphic: a hot white star and a crossing glint, short speed rays, a thin
   * cyan ring on the ground and a camera-facing one, sparks along the blow, the ink splash and stain under it; the
   * screen's local graphic frame (an inverted burst) and the beast's one-frame silhouette come from the host. No
   * broad soft glow, no big rim-coloured star.
   */
  private basicImpact(at: THREE.Vector3, scale: number, dx: number, dz: number, power: number): void {
    const rot = this.rand.range(0, Math.PI);
    this.starPair(at.x, at.y, at.z, 2.2 * scale, 0.1, rot);
    this.darkDisc(at.x, at.z, 1.0 * scale, 0.4, 0.45);
    this.rays(at.x, at.y, at.z, this.n(6), 1.5 * scale, 0.1, 0.12, 0.5);
    this.groundShockAt(at.x, at.z, 0.2, 1.4 * scale, 0.26, 0.75);
    this.shockAt(at.x, at.y, at.z, 1.2 * scale, 0.16, 0.9);
    this.hitSparks(at.x, at.y, at.z, dx, dz, this.n(8 + 8 * power), power, true);
    const inkPool = this.lite ? this.smoke : this.splash;
    const k = inkPool.spec.reset();
    k.x = at.x + dx * 0.15;
    k.y = at.y;
    k.z = at.z + dz * 0.15;
    k.vx = dx * 2.2;
    k.vz = dz * 2.2;
    k.vy = 0.6;
    k.drag = 4;
    k.life = 0.42;
    k.size0 = 0.8 * scale;
    k.size1 = 1.3 * scale;
    k.rot = this.rand.range(0, 6.28);
    k.r = INK[0];
    k.g = INK[1];
    k.b = INK[2];
    k.a = 0.9;
    inkPool.emit();
    if (!this.lite) {
      const gi = this.groundInk.spec.reset();
      gi.x = at.x + dx * 0.3;
      gi.y = 0.025;
      gi.z = at.z + dz * 0.3;
      gi.life = 2.2;
      gi.size0 = 0.6 * scale;
      gi.size1 = 0.9 * scale;
      gi.rot = this.rand.range(0, 6.28);
      gi.aspect = 1.4;
      gi.r = INK[0];
      gi.g = INK[1];
      gi.b = INK[2];
      gi.a = 0.5;
      this.groundInk.emit();
    }
  }

  /**
   * The weapon's own mark where a blow lands (WeaponMotif; Clear Wind): a hollow jade ring opening on the ground
   * (its outer and inner edge, a bi disc seen from above) and two silver-jade cloud curls swirling out of it, all
   * ≤ 0.9 (no bloom), over the skill's own impact layers. Low: the ring only.
   */
  private motifAt(x: number, z: number, scale: number): void {
    const m = this.weaponDef.motif;
    if (m === undefined) return;
    if (m.ring) {
      for (let k = 0; k < 2; k += 1) {
        const R = (k === 0 ? 1 : 0.62) * scale;
        const s = this.groundRing.spec.reset();
        s.x = x;
        s.y = 0.045;
        s.z = z;
        s.life = 0.55;
        s.size0 = (0.3 * R) / R_RING;
        s.size1 = (0.85 * R) / R_RING;
        this.col(s, m.jade, 1);
        s.a = k === 0 ? 0.9 : 0.7;
        s.fadeIn = Math.max(this.riseS, SOFT_RISE_S);
        this.groundRing.emit();
      }
    }
    if (m.cloud && !this.lite) {
      const rot = this.rand.range(0, Math.PI * 2);
      for (let k = 0; k < 2; k += 1) {
        const t = this.twirl.spec.reset();
        t.x = x;
        t.y = 0.05;
        t.z = z;
        t.life = 0.6;
        t.size0 = (0.35 * scale) / R_TWIRL;
        t.size1 = (0.95 * scale) / R_TWIRL;
        t.rot = rot + k * Math.PI;
        t.rotV = 2.4;
        this.col(t, k === 0 ? m.jade : m.silver, 0.85);
        t.a = 0.75;
        t.fadeIn = SOFT_RISE_S;
        this.twirl.emit();
      }
    }
  }

  /**
   * Sparks thrown off a hit point along the blow (round 2: hits read weak): a
   * hot contact glint (`glint`), fast stretched streaks in a cone along the
   * blow, and a few slower embers in the skill's colour that arc down.
   */
  private hitSparks(x: number, y: number, z: number, dx: number, dz: number, n: number, power: number, glint: boolean): void {
    if (glint) {
      const c = this.star.spec.reset();
      c.x = x;
      c.y = y;
      c.z = z;
      c.life = 0.12;
      c.size0 = 0.75;
      c.size1 = 0.5;
      c.rot = this.rand.range(0, Math.PI);
      this.col(c, this.pal.core, 1);
      this.star.emit();
    }
    const a0 = Math.atan2(dz, dx);
    for (let i = 0; i < n; i += 1) {
      const s = this.spark.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      const a = a0 + this.rand.range(-0.95, 0.95);
      const sp = this.rand.range(6, 14) * (0.7 + 0.5 * power);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(0.5, 4.5);
      s.gravity = -14;
      s.drag = 2.2;
      s.life = this.rand.range(0.14, 0.3);
      s.size0 = 0.15;
      s.size1 = 0.05;
      s.stretch = 0.06;
      this.col(s, this.pal.core, 0.9);
      this.spark.emit();
    }
    const embers = Math.max(1, Math.round(n / 4));
    for (let i = 0; i < embers; i += 1) {
      const s = this.spark.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      const a = a0 + this.rand.range(-1.4, 1.4);
      const sp = this.rand.range(2, 5);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(2, 4);
      s.gravity = -9;
      s.drag = 1.2;
      s.life = this.rand.range(0.4, 0.7);
      s.size0 = 0.14;
      s.size1 = 0.04;
      s.stretch = 0.02;
      this.col(s, this.pal.mote, 0.6);
      this.spark.emit();
    }
  }

  /** A crescent cut across the blow (camera-facing; `rot` in screen radians). */
  private slashAt(at: THREE.Vector3, rot: number, size: number): void {
    const hook = this.hooks.cut;
    if (hook !== undefined) {
      const a = this.aCut;
      a.slot = this.palSlot;
      a.at.copy(at);
      a.rot = rot;
      a.size = size;
      a.pal = this.pal;
      if (hook(a)) return;
    }
    const s = this.slash.spec.reset();
    s.x = at.x;
    s.y = at.y;
    s.z = at.z;
    s.rot = rot;
    s.life = 0.16;
    s.size0 = size * 1.5;
    s.size1 = size * 2.0;
    this.col(s, this.pal.core, 0.85);
    this.slash.emit();
    // A wider coloured crescent under the hot one.
    const h = this.slash.spec.reset();
    h.x = at.x;
    h.y = at.y;
    h.z = at.z;
    h.rot = rot;
    h.life = 0.2;
    h.size0 = size * 2.1;
    h.size1 = size * 2.7;
    this.col(h, this.pal.rim, 1);
    h.a = 0.8;
    this.slash.emit();
  }

  /** Screen angle of a crescent across a blow along ground direction (dx, dz): the camera looks north (−z). */
  private cutAngle(dx: number, dz: number): number {
    return Math.atan2(-dz, dx) + Math.PI / 2;
  }

  /** A beast hit by Kiếm: impact layers, the field's reaction, death smoke and motes when it falls. */
  private strike(target: number, fromX: number, fromZ: number, power: number, scale: number, big: boolean): void {
    const T = this.host.targets;
    if (!T.alive(target)) return;
    let dx = T.x(target) - fromX;
    let dz = T.z(target) - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.v.set(T.x(target), T.midY(target), T.z(target));
    this.impact(this.v, scale, dx, dz, power, big);
    const killed = T.hit(target, dx, dz, power, this.pal.flashHex);
    if (!killed) this.foeStatus(target);
    this.host.struck?.(target, dx, dz, power, false, killed);
    if (killed) this.death(this.v, dx, dz, T.radius(target));
  }

  /**
   * A light hit inside an area blow (VFX_STANDARD §3.3: one burst of size √N
   * for the area, about two particles per beast): a glint, two sparks, ink.
   */
  private strikeLight(target: number, fromX: number, fromZ: number, power: number): void {
    const T = this.host.targets;
    if (!T.alive(target)) return;
    let dx = T.x(target) - fromX;
    let dz = T.z(target) - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.u.set(T.x(target), T.midY(target), T.z(target));
    // The glint and the ink go to a share of the beasts (all at High, half at Low).
    this.lightAcc += this.dens;
    const marked = this.lightAcc >= 1;
    if (marked) this.lightAcc -= 1;
    const hook = this.hooks.areaHit;
    if (hook !== undefined) {
      const a = this.aArea;
      a.slot = this.palSlot;
      a.at.copy(this.u);
      a.dx = dx;
      a.dz = dz;
      a.power = power;
      a.marked = marked;
      a.pal = this.pal;
    }
    if (hook === undefined || !hook(this.aArea)) this.areaHitMetal(dx, dz, power, marked);
    const killed = T.hit(target, dx, dz, power, this.pal.flashHex);
    if (!killed) this.foeStatus(target);
    this.host.struck?.(target, dx, dz, power, true, killed);
    if (killed) this.death(this.u, dx, dz, T.radius(target));
  }

  /** Metal's light hit at `this.u`: a glint on the marked share, sparks at every beast, ink on the marked share. */
  private areaHitMetal(dx: number, dz: number, power: number, marked: boolean): void {
    if (marked) this.twinkle(this.u.x, this.u.y, this.u.z, 1.2, 0.1, 1);
    // Impact sparks at every beast the area strikes (the marked share has its glint above).
    this.hitSparks(this.u.x, this.u.y, this.u.z, dx, dz, this.n(4), power, false);
    if (marked) {
      const inkPool = this.lite ? this.smoke : this.splash;
      const k = inkPool.spec.reset();
      k.x = this.u.x;
      k.y = this.u.y;
      k.z = this.u.z;
      k.vx = dx * 1.6;
      k.vz = dz * 1.6;
      k.vy = 0.5;
      k.drag = 4;
      k.life = 0.36;
      k.size0 = 0.6;
      k.size1 = 1.0;
      k.rot = this.rand.range(0, 6.28);
      k.r = INK[0];
      k.g = INK[1];
      k.b = INK[2];
      k.a = 0.85;
      inkPool.emit();
    }
  }

  /** The element's status on a beast it struck and did not kill (TargetField.status; Metal leaves none). */
  private foeStatus(target: number): void {
    const foe = this.kit.foe;
    if (foe !== null) this.host.targets.status?.(target, foe.kind, foe.seconds, foe.rgb);
  }

  /** The area's one burst, sized by √N of the beasts it hit. */
  private burstAt(x: number, y: number, z: number, beasts: number, scale: number): void {
    const hook = this.hooks.areaBurst;
    if (hook !== undefined) {
      const a = this.aBurst;
      a.slot = this.palSlot;
      a.x = x;
      a.y = y;
      a.z = z;
      a.beasts = beasts;
      a.scale = scale;
      a.pal = this.pal;
      if (hook(a)) return;
    }
    const k = Math.min(2.6, 0.6 + Math.sqrt(Math.max(1, beasts)) * 0.4) * scale;
    this.starPair(x, y, z, 3.4 * k, 0.15, this.rand.range(0, Math.PI));
    this.darkDisc(x, z, 1.8 * k, 0.35, 0.6);
    const g = this.glow.spec.reset();
    g.x = x;
    g.y = y;
    g.z = z;
    g.life = 0.3;
    g.size0 = 3.5 * k;
    g.size1 = 4.8 * k;
    this.col(g, this.pal.rim, 1);
    g.a = 0.7;
    g.fadeIn = this.riseS;
    this.glow.emit();
    this.shockAt(x, y, z, 1.6 * k, 0.26, 0.8);
    this.sparkBurst(x, y, z, Math.min(20, this.n(2 * beasts + 6)), 1.0);
    this.motifAt(x, z, 1.4 * k);
  }

  private death(at: THREE.Vector3, dx: number, dz: number, radius: number): void {
    const hook = this.hooks.death;
    if (hook !== undefined) {
      const a = this.aDeath;
      a.slot = this.palSlot;
      a.at.copy(at);
      a.dx = dx;
      a.dz = dz;
      a.radius = radius;
      a.pal = this.pal;
      if (hook(a)) return;
    }
    for (let i = 0; i < 3; i += 1) {
      const s = this.smoke.spec.reset();
      s.x = at.x + this.rand.range(-0.2, 0.2) + dx * 0.2 * i;
      s.y = at.y * 0.7;
      s.z = at.z + this.rand.range(-0.2, 0.2) + dz * 0.2 * i;
      s.vx = dx * 0.6;
      s.vz = dz * 0.6;
      s.vy = 0.45;
      s.drag = 0.8;
      s.life = this.rand.range(1.0, 1.5);
      s.size0 = radius * 1.4;
      s.size1 = radius * 3.2;
      s.rot = this.rand.range(0, 6.28);
      s.rotV = this.rand.range(-0.6, 0.6);
      s.r = SMOKE[0];
      s.g = SMOKE[1];
      s.b = SMOKE[2];
      s.a = 0.62;
      this.smoke.emit();
    }
    // The spirit leaves: motes and a thin rising wisp of light.
    this.burstMotes(at, this.n(6), 1.0);
    const b = this.beams.spec.reset();
    b.x = at.x;
    b.y = at.y;
    b.z = at.z;
    b.vy = 1.6;
    b.len0 = 0.4;
    b.len1 = 1.6;
    b.w0 = 0.3;
    b.w1 = 0.12;
    b.life = 0.55;
    this.beamCol(b, 0.45, 0.6);
    b.fadeBase = 0.3;
    b.fadeTip = 0.6;
    this.beams.emit();
  }

  private burstMotes(at: THREE.Vector3, n: number, scale: number): void {
    for (let i = 0; i < n; i += 1) {
      const s = this.motes.spec.reset();
      s.x = at.x + this.rand.range(-0.15, 0.15);
      s.y = at.y + this.rand.range(-0.1, 0.2);
      s.z = at.z + this.rand.range(-0.15, 0.15);
      s.vx = this.rand.range(-0.6, 0.6) * scale;
      s.vz = this.rand.range(-0.6, 0.6) * scale;
      s.vy = this.rand.range(1.0, 2.4) * scale;
      s.drag = 1.4;
      s.life = this.rand.range(0.6, 1.1);
      s.size0 = 0.24;
      s.size1 = 0.1;
      s.fadeIn = this.riseS;
      this.col(s, this.pal.mote, 1);
      this.motes.emit();
    }
  }

  /** One mote rising from the ground inside radius `r` of (x, z). */
  private riseMote(x: number, y: number, z: number, r: number, size: number): void {
    const a = this.rand.range(0, Math.PI * 2);
    const d = r * Math.sqrt(this.rand.next());
    const s = this.motes.spec.reset();
    s.x = x + Math.cos(a) * d;
    s.y = y;
    s.z = z + Math.sin(a) * d;
    s.vx = this.rand.range(-0.25, 0.25);
    s.vz = this.rand.range(-0.25, 0.25);
    s.vy = this.rand.range(1.0, 2.6);
    s.drag = 0.6;
    s.life = this.rand.range(0.7, 1.3);
    s.size0 = size * 2.6;
    s.size1 = size;
    this.col(s, this.pal.mote, 1);
    this.motes.emit();
  }

  /** The aftermath of a blow: a ground glow that fades and spirit motes rising for `life` s. */
  private aftermath(x: number, z: number, r: number, life: number, rate: number): void {
    const hook = this.hooks.aftermath;
    if (hook !== undefined) {
      const a = this.aAfter;
      a.slot = this.palSlot;
      a.x = x;
      a.z = z;
      a.r = r;
      a.life = life;
      a.rate = rate;
      a.pal = this.pal;
      if (hook(a)) return;
    }
    this.glowDisc(x, z, r, 0.75, life);
    for (const e of this.emitters) {
      if (e.active) continue;
      e.active = true;
      e.x = x;
      e.y = 0.1;
      e.z = z;
      e.r = r;
      e.t = 0;
      e.life = life;
      e.rate = rate;
      e.acc = 0;
      e.slot = this.palSlot;
      return;
    }
  }

  private ring(x: number, z: number, r0: number, r1: number, life: number, alpha: number): void {
    const s = this.groundRing.spec.reset();
    s.x = x;
    s.y = 0.04;
    s.z = z;
    s.life = life;
    s.size0 = r0 / R_RING;
    s.size1 = r1 / R_RING;
    this.col(s, this.pal.halo, 1);
    s.a = alpha;
    s.fadeIn = this.riseS;
    this.groundRing.emit();
  }

  private dust(x: number, z: number, n: number, size: number): void {
    for (let i = 0; i < n; i += 1) {
      const s = this.smoke.spec.reset();
      s.x = x + this.rand.range(-0.3, 0.3);
      s.y = 0.15;
      s.z = z + this.rand.range(-0.3, 0.3);
      s.vx = this.rand.range(-1, 1);
      s.vz = this.rand.range(-1, 1);
      s.vy = 0.3;
      s.drag = 2;
      s.life = 0.7;
      s.size0 = size * 0.6;
      s.size1 = size * 1.6;
      s.rot = this.rand.range(0, 6.28);
      s.r = 0.2;
      s.g = 0.21;
      s.b = 0.23;
      s.a = 0.4;
      this.smoke.emit();
    }
  }

  private placeLine(sig: GroundSigil, x: number, z: number, dx: number, dz: number, length: number): void {
    // Plane x axis along (dx, dz); centre half way.
    sig.place(x + dx * length * 0.5, z + dz * length * 0.5, Math.atan2(-dz, dx));
  }

  /**
   * The roll (rad, BladeSet.set's) that turns a sword along (dx, dy, dz) at (x, y, z) round its own axis so its
   * flat faces the camera (camW, set this frame): the hollow ring stays an O at 25–60 px instead of a sliver.
   */
  private faceRoll(x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
    return this.faces.of(this.camW, x, y, z, dx, dy, dz);
  }

  /** How far (m) behind its guard a hero sword at `scale` ends (its pommel): trails start there, never over the sword. */
  private pommelBack(scale: number): number {
    return -this.blades.models().hero.pommelY * scale * 1.1;
  }

  /** Whether the weapon in the hand is out this frame (handAway); on its return a glint and motes at the hand. */
  private updateHand(): void {
    let out = this.charge.k2 >= 0 || this.bPres[HERO.k2]! > 0 || this.bPres[HERO.k2 + 1]! > 0;
    for (let s = 0; !out && s < AUTO_N; s += 1) if (this.bPres[HERO.auto + s]! > 0) out = true;
    if (this.handOut && !out) this.handReturn();
    this.handOut = out;
  }

  /** The weapon back in the hand: a soft glint and a few motes (with a ring motif, a small jade ring closes round the grip). */
  private handReturn(): void {
    this.host.hand(this.v);
    this.use("auto");
    this.riseS = SOFT_RISE_S;
    this.twinkle(this.v.x, this.v.y, this.v.z, 0.75, 0.2, 0.85);
    this.burstMotes(this.v, this.n(5), 0.45);
    this.riseS = 0;
    const m = this.weaponDef.motif;
    if (m !== undefined && m.ring && !this.lite) {
      const s = this.shock.spec.reset();
      s.x = this.v.x;
      s.y = this.v.y;
      s.z = this.v.z;
      s.life = 0.3;
      s.size0 = 0.34 / R_SHOCK;
      s.size1 = 0.12 / R_SHOCK;
      this.col(s, m.jade, 1);
      s.a = 0.7;
      s.fadeIn = SOFT_RISE_S;
      this.shock.emit();
    }
  }

  // ── Per frame ────────────────────────────────────────────────────────────

  /**
   * One frame. `dt`: world seconds (a hit-stop shrinks them); `realDt`: the
   * frame's unscaled seconds. The Lạc Kiếm Trận timeline runs on `realDt`:
   * the sim's beats keep their ticks through a hit-stop (canon §12.1), so
   * its own stop at the opening must not push every beat a frame late.
   */
  update(dt: number, realDt = dt): void {
    this.time += dt;
    // Last frame's one-frame cards go before this frame's are emitted, so they never hold capacity.
    for (const p of this.pools) p.dropOneFrame();
    this.beams.dropOneFrame();
    for (const s of this.sigils) s.tick(dt);
    // The dash moves the caster first: every layer drawn round the caster this frame centres on where
    // the body now is, not where it was a frame ago (appendix B #12).
    this.use("dash");
    this.updateDash(dt);
    this.host.caster(this.c);
    this.updateReveal(dt);
    this.updateCharge(dt);
    this.updateAura(dt);
    this.updateFlights(dt);
    // Timelines on the sim's ticks run on real time, like Lạc Kiếm Trận's: the strikes' own hit-stops
    // (3–5 frames each, round 2) must not push the next blade or wave late.
    this.use("k1");
    this.updateK1(realDt);
    this.use("k2");
    this.updateK2(dt);
    this.use("guard");
    this.updateGuard(dt);
    this.use("k4");
    this.updateK4(realDt);
    this.use("k5");
    this.updateK5(realDt);
    this.updateHalo(dt);
    this.updateCracks(dt);
    this.updateEmitters(dt);
    this.settleBlades(dt);
    this.updateHand();
    this.hooks.frame?.(dt);
    for (const p of this.pools) p.update(dt);
    this.beams.update(dt);
    // The aura's SilkTail needs the ribbons' moded program while it is on (every other ribbon draws as before in it).
    this.ribbons.setModed(this.auraOn);
    this.ribbons.update(dt, this.host.camera);
    this.blades.sync();
  }

  /**
   * The caster gathers power while a word is typed (VFX_STANDARD §3.3 skill A:
   * a seal under the feet, motes drawn in, light growing): a rotating seal, a
   * radiant halo behind the body, a ground glow over a dark disc, motes
   * rising and light streaks converging on the hand, all growing with the
   * word; the seal blazes at each key and at the release, then fades.
   */
  /** The drawn typing progress of each word being typed eases toward its keys (no step a key, no hard sigil edge). */
  private updateReveal(dt: number): void {
    const ch = this.charge;
    const rv = this.reveal;
    const age = this.chargeAge;
    if (ch.k1 >= 0) rv.k1 = approach(rv.k1, ch.k1, REVEAL_HALF_S, dt);
    // A slot whose last cast still runs leaves its progress and age to that cast (its sigil keeps them).
    for (let i = 0; i < SIGIL_SLOTS.length; i += 1) {
      const k = SIGIL_SLOTS[i]!;
      if (ch[k] < 0 || this.running(k)) continue;
      age[k] += dt;
      rv[k] = approach(rv[k], ch[k], REVEAL_HALF_S, dt);
    }
  }

  /** True while the slot's last cast still runs (the lab frames the whole field while K5 plays). */
  isRunning(slot: SwordSlot): boolean {
    return this.running(slot);
  }

  /** True while the slot's last cast still runs (and owns its sigil). */
  private running(slot: SwordSlot): boolean {
    switch (slot) {
      case "k2":
        return this.k2.active;
      case "guard":
        return this.guard.active;
      case "dash":
        return this.dash.active;
      case "k4":
        return this.k4.active;
      case "k5":
        return this.k5.active;
      default:
        return false;
    }
  }

  /**
   * May the word being typed on `slot` draw its sigil? Not while the slot's
   * last cast still runs (two writers made the sigil dip at the new word's
   * first key and the K5 zone draw two dark discs). Taking it over from a
   * hidden state (the cast ended mid-word), it fades in from nothing.
   */
  private sigilFree(slot: SwordSlot, sig: GroundSigil): boolean {
    if (this.running(slot)) return false;
    if (!sig.mesh.visible) {
      this.chargeAge[slot] = 0;
      this.reveal[slot] = 0;
    }
    return true;
  }

  /** After the release a skill's sigil finishes drawing fast but not in one frame (the last key's share eases in). */
  private revealAfterCast(slot: SwordSlot, dt: number): number {
    const v = approach(this.reveal[slot], 1, REVEAL_HALF_S * 0.5, dt);
    this.reveal[slot] = v;
    return v;
  }

  private updateAura(dt: number): void {
    this.drawQiMotes(dt);
    let p = -1;
    let big = 0;
    let slot: SwordSlot = this.sealSlot;
    const ch = this.charge;
    if (ch.k1 > p) {
      p = ch.k1;
      slot = "k1";
    }
    if (ch.k2 > p) {
      p = ch.k2;
      slot = "k2";
    }
    if (ch.guard > p) {
      p = ch.guard;
      slot = "guard";
    }
    if (ch.dash > p) {
      p = ch.dash;
      slot = "dash";
    }
    if (ch.k4 > p) {
      p = ch.k4;
      slot = "k4";
    }
    if (ch.k5 >= 0 && ch.k5 >= p) {
      p = ch.k5;
      big = 1;
      slot = "k5";
    }
    // The word being typed owns the seal: its glyph and colours (the cast keeps them while the seal fades).
    if (p >= 0) {
      this.sealSlot = slot;
      this.sealNext = SLOT_SHAPE[slot];
    }
    this.use(this.sealSlot);
    if (p >= 0) this.auraP += (p - this.auraP) * (1 - Math.exp(-14 * dt));
    else this.auraP = Math.max(0, this.auraP - dt * 2.2);
    // The ultimate's size eases back when idle too, so the next skill's aura does not start at ×1.5 (appendix B #25).
    this.auraBig += (big - this.auraBig) * (1 - Math.exp(-10 * dt));
    // The blaze rises to its goal in a few frames (half-life 35 ms) and falls with it: a key or a release
    // brightens the seal at once without a one-frame step.
    this.blazeGoal = Math.max(0, this.blazeGoal - dt * 4.5);
    this.blaze = this.blaze < this.blazeGoal ? approach(this.blaze, this.blazeGoal, 0.035, dt) : this.blazeGoal;
    const a = this.auraP;
    this.presence.charge = a;
    this.presence.slot = this.sealSlot;
    // Layers keyed to the aura ease in and out with it (smoothstep on its first 30 %), never pop at the first key or the end.
    const vis = smooth01(a / 0.3);
    const seal = this.sigSeal;
    const scale = 1 + 0.5 * this.auraBig;
    // The seal rises over SEAL_IN_S at most (with no word typed before it, a release's blaze lit it from nothing
    // in one frame) and falls on an eased approach, drawn through smoothstep: ~0.3 s to nothing, its size
    // swelling a little as it goes (round 2: it dropped with the aura in a few frames).
    const goal = a <= 0.01 && this.blaze <= 0.01 ? 0 : Math.min(1, a * 3 + this.blaze);
    if (goal >= this.sealFade) this.sealFade = Math.min(goal, this.sealFade + dt / SEAL_IN_S);
    else this.sealFade = approach(this.sealFade, goal, SEAL_OUT_HALF_S, dt);
    if (goal <= 0 && this.sealFade < 0.02) {
      seal.hide();
      this.sealFade = 0;
      // Hidden: the next word's glyph and colours start fresh with it.
      this.sealShape = this.sealNext;
      this.glyphK = 1;
      this.sealCol.copy(this.tmpSigil(this.sealSlot, false));
      this.sealCore.copy(this.tmpSigil(this.sealSlot, true));
    } else {
      const shown = smooth01(this.sealFade);
      const yaw = Math.atan2(-this.c.fz, this.c.fx);
      seal.place(this.c.x, this.c.z, yaw);
      const sw = scale * (1 + 0.08 * (1 - shown));
      seal.mesh.scale.set(sw, sw, 1);
      // The ring draws round with the word and closes after the release, eased both ways: a new word's first
      // key used to cut a closed ring back to the aura's level in one frame. A seal coming up from hidden
      // starts where the word is.
      const rGoal = p >= 0 ? Math.max(0.08, a) : 1;
      const ru = seal.uniforms.uReveal;
      ru.value = shown <= 0.001 ? rGoal : approach(ru.value, rGoal, rGoal >= ru.value ? REVEAL_HALF_S * 0.5 : REVEAL_HALF_S, dt);
      seal.uniforms.uGlow.value = 0.5 + 0.8 * a + 0.6 * this.blaze;
      seal.uniforms.uInk.value = 0.55 * Math.min(1, a * 2);
      seal.uniforms.uFade.value = shown;
      seal.uniforms.uCount.value = 1;
      // A new skill's glyph crossfades in: the old one dims over 0.1 s, the new one rises over 0.15 s.
      if (this.sealNext !== this.sealShape) {
        this.glyphK = Math.max(0, this.glyphK - dt / 0.1);
        if (this.glyphK <= 0) this.sealShape = this.sealNext;
      } else {
        this.glyphK = Math.min(1, this.glyphK + dt / 0.15);
      }
      seal.uniforms.uShape.value = this.sealShape;
      seal.uniforms.uGlyph.value = smooth01(this.glyphK);
      // Its colours ease to the skill's (half-life 0.08 s): no colour pop when one skill follows another.
      const kc = 1 - Math.pow(2, -dt / 0.08);
      this.sealCol.lerp(this.tmpSigil(this.sealSlot, false), kc);
      this.sealCore.lerp(this.tmpSigil(this.sealSlot, true), kc);
      seal.uniforms.uColor.value.copy(this.sealCol);
      seal.uniforms.uCore.value.copy(this.sealCore);
    }
    if (a <= 0.01) return;
    // The element's gathering layers (its hook) in place of the halo, glows and motes below; the seal stays.
    const hook = this.hooks.chargeFrame;
    if (hook !== undefined) {
      const f = this.aFrame;
      f.slot = this.sealSlot;
      f.level = a;
      f.vis = vis;
      f.big = this.auraBig;
      f.scale = scale;
      f.typing = p >= 0;
      f.dt = dt;
      this.host.hand(f.hand);
      this.poseOf(f.caster);
      f.pal = this.pal;
      if (hook(f)) return;
    }
    const x = this.c.x;
    const z = this.c.z;
    // Radiant halo behind the body: placed round the head, then pushed along its view ray to behind the
    // feet (same place and size on screen), so the body hides it; the pool fades it out at the ground.
    this.host.camera.getWorldPosition(this.camW);
    this.host.camera.getWorldDirection(this.camF);
    const hy = 1.15 + 0.25 * this.auraBig;
    const h = this.aura.spec.reset();
    h.x = x;
    h.y = hy;
    h.z = z - 0.35;
    h.life = -1;
    h.size0 = h.size1 = (1.6 + 2.4 * a) * scale;
    h.rot = this.time * 0.5;
    this.col(h, this.pal.rim, 0.45 + 0.5 * a);
    h.a = vis;
    this.behindCaster(h, x, z);
    this.aura.emit();
    if (!this.lite) {
      const h2 = this.aura.spec.reset();
      h2.x = x;
      h2.y = hy;
      h2.z = z - 0.36;
      h2.life = -1;
      h2.size0 = h2.size1 = (1.0 + 1.3 * a) * scale;
      h2.rot = -this.time * 0.8;
      this.col(h2, this.pal.halo, 0.35 + 0.45 * a);
      h2.a = vis;
      this.behindCaster(h2, x, z);
      this.aura.emit();
    }
    this.glowDisc(x, z, (0.9 + 0.9 * a) * scale, (0.3 + 0.4 * a) * vis, -1);
    this.darkDisc(x, z, (1.6 + 0.8 * a) * scale, 0.35 * a * vis, -1);
    // Motes rise round the feet; light streaks converge on the hand.
    this.moteAcc += (10 + 46 * a) * scale * this.dens * dt;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      this.riseMote(x, 0.1, z, 1.5 * scale, 0.07 + 0.05 * a);
    }
    // Qi motes spiral in to the hand (round 3b, item 5: straight streaks read as a HUD's lines).
    this.gatherAcc += (12 + 40 * a) * scale * this.dens * dt;
    while (this.gatherAcc >= 1) {
      this.gatherAcc -= 1;
      const k = this.qmNext;
      this.qmNext = (k + 1) % QI_MOTES;
      this.qmOn[k] = 1;
      this.qmA[k] = this.rand.range(0, Math.PI * 2);
      this.qmR[k] = this.rand.range(1.5, 2.7) * scale;
      this.qmY[k] = this.rand.range(0.1, 1.9);
      this.qmAge[k] = 0;
      this.qmLife[k] = this.rand.range(0.32, 0.48);
      this.qmSpin[k] = this.rand.range(2.2, 3.2);
    }
  }

  /** Mote k's place after share e (0–1) of its life, round the hand at `h`. */
  private qiMoteAt(k: number, e: number, h: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r = this.qmR[k]! * Math.pow(1 - e, 1.4);
    const ang = this.qmA[k]! + this.qmSpin[k]! * (1 - (1 - e) * (1 - e));
    const y = this.qmY[k]! + (h.y - this.qmY[k]!) * smooth01(e);
    return out.set(h.x + Math.cos(ang) * r, y, h.z + Math.sin(ang) * r * 0.8);
  }

  /** The spiralling qi motes: each a short streak along its path, brightening as it reaches the hand. */
  private drawQiMotes(dt: number): void {
    let any = false;
    for (let k = 0; k < QI_MOTES; k += 1) if (this.qmOn[k] === 1) any = true;
    if (!any) return;
    this.host.hand(this.v);
    const h = this.v;
    for (let k = 0; k < QI_MOTES; k += 1) {
      if (this.qmOn[k] !== 1) continue;
      this.qmAge[k] = this.qmAge[k]! + dt;
      const life = this.qmLife[k]!;
      const e = this.qmAge[k]! / life;
      if (e >= 1) {
        this.qmOn[k] = 0;
        continue;
      }
      const p = this.qiMoteAt(k, e, h, this.qmP);
      const x = p.x;
      const y = p.y;
      const z = p.z;
      const q = this.qiMoteAt(k, Math.max(0, e - 0.04), h, this.qmP);
      const inv = 1 / (0.04 * life);
      const s = this.spark.spec.reset();
      s.x = x;
      s.y = Math.max(0.08, y);
      s.z = z;
      s.vx = (x - q.x) * inv;
      s.vy = (y - q.y) * inv;
      s.vz = (z - q.z) * inv;
      s.life = 0;
      s.size0 = s.size1 = 0.06 + 0.06 * e;
      s.stretch = 0.03;
      this.col(s, this.pal.core, 0.45 + 0.9 * e);
      s.a = smooth01(e / 0.18);
      this.spark.emit();
    }
  }

  /**
   * A release burst at the caster for a skill cast outside this class (key 7, round 3b item 5): the release column
   * behind the body, the ground ring and shock, and the seal's blaze, in `slot`'s palette at `tier`.
   */
  burst(slot: SwordSlot, tier: number, skill: string = slot): void {
    this.host.caster(this.c);
    this.use(slot);
    this.releaseFlash(1.1, 3, 3.4, tier, skill);
  }

  /**
   * Moves a camera-facing sprite along its view ray until it lies BEHIND_M
   * deeper than the caster's feet at (x, z), scaling its size by the same
   * ratio: its place and size on screen stay, and the body (opaque,
   * depth-tested) now hides it instead of the halo washing over the body.
   * Needs camW and camF set this frame.
   */
  private behindCaster(s: SpriteSpec, x: number, z: number): void {
    const c = this.camW;
    const f = this.camF;
    const feet = f.x * (x - c.x) - f.y * c.y + f.z * (z - c.z) + BEHIND_M;
    const depth = f.x * (s.x - c.x) + f.y * (s.y - c.y) + f.z * (s.z - c.z);
    if (depth <= 1e-3 || depth >= feet) return;
    const k = feet / depth;
    s.x = c.x + (s.x - c.x) * k;
    s.y = c.y + (s.y - c.y) * k;
    s.z = c.z + (s.z - c.z) * k;
    s.size0 *= k;
    s.size1 *= k;
  }

  private updateEmitters(dt: number): void {
    for (const e of this.emitters) {
      if (!e.active) continue;
      e.t += dt;
      if (e.t >= e.life) {
        e.active = false;
        continue;
      }
      e.acc += e.rate * (1 - e.t / e.life) * this.dens * dt;
      if (e.acc >= 1) this.use(e.slot);
      while (e.acc >= 1) {
        e.acc -= 1;
        this.riseMote(e.x, e.y, e.z, e.r, 0.08);
      }
    }
  }

  /** Where Ngự Kiếm's waiting blades aim: the beast the next blade will fly at, else the cast point. */
  private k1AimAt(): void {
    const T = this.host.targets;
    const t = T.nearest(this.c.x, this.c.z, 12);
    if (t >= 0) this.k1Aim.set(T.x(t), T.midY(t), T.z(t));
    else this.k1Aim.set(this.k1.tx, 1.0, this.k1.tz);
  }

  private updateCharge(dt: number): void {
    const rv = this.reveal;
    // K1: three blades behind the shoulders, each scaling in at its key. They hover while they wait (round 2:
    // they stood frozen for 0.4 s): each bobs on its own phase, sways a little, turns slowly round its axis and
    // sheds a glint along its edge now and then. Once the word is cast the waiting blades turn (damped,
    // half-life 0.06 s) to aim at their beast, so each flies off along the way it points.
    const p1 = this.charge.k1;
    const k1 = this.k1;
    if (p1 >= 0 || (k1.active && k1.launched < 3)) {
      this.use("k1");
      const L = 1.1 * 1.35;
      const kf = 1 - Math.pow(2, -dt / 0.06);
      // The first blade flies at the release with no time to turn: it starts leaning toward its beast over
      // the word's last letters (progress 0.6 → 1), so its launch turn stays under 30° a frame.
      const lead = k1.active ? 1 : smooth01((p1 - 0.6) / 0.4);
      if (k1.active || lead > 0) this.k1AimAt();
      const rx = -this.c.fz;
      const rz = this.c.fx;
      const D = this.k1Dir;
      for (let j = 0; j < 3; j += 1) {
        const th = K1_SHOW[j]!;
        const alive = k1.active ? j >= k1.launched : p1 >= th;
        if (!alive) continue;
        this.k1Socket(j, this.v);
        const ph = j * 2.09;
        const bob = Math.sin(this.time * 2.7 + ph) * 0.06 + Math.sin(this.time * 5.9 + ph * 1.7) * 0.012;
        const sway = Math.sin(this.time * 1.9 + ph) * 0.07;
        const lean = (j === 0 ? -0.35 : j === 2 ? 0.35 : 0) + sway;
        // Centre of the upright blade (its guard 0.55 m under the socket): it turns about its middle.
        const cx = this.v.x;
        const cy = this.v.y - 0.55 + bob + L * 0.5;
        const cz = this.v.z;
        let gx = rx * lean - this.c.fx * 0.15;
        let gy = 1;
        let gz = rz * lean - this.c.fz * 0.15;
        const w = k1.active ? 1 : j === 0 ? lead : 0;
        if (w > 0) {
          let ax = this.k1Aim.x - cx;
          let ay = this.k1Aim.y - cy;
          let az = this.k1Aim.z - cz;
          const al = Math.hypot(ax, ay, az) || 1;
          ax /= al;
          ay /= al;
          az /= al;
          const ul = Math.hypot(gx, gy, gz) || 1;
          gx = (gx / ul) * (1 - w) + ax * w;
          gy = (gy / ul) * (1 - w) + ay * w;
          gz = (gz / ul) * (1 - w) + az * w;
        }
        const gl = Math.hypot(gx, gy, gz) || 1;
        gx /= gl;
        gy /= gl;
        gz /= gl;
        const o = j * 3;
        if (this.bPres[HERO.k1 + j]! <= 0) {
          D[o] = gx;
          D[o + 1] = gy;
          D[o + 2] = gz;
        } else {
          const dx = D[o]! + (gx - D[o]!) * kf;
          const dy = D[o + 1]! + (gy - D[o + 1]!) * kf;
          const dz = D[o + 2]! + (gz - D[o + 2]!) * kf;
          const dl = Math.hypot(dx, dy, dz) || 1;
          D[o] = dx / dl;
          D[o + 1] = dy / dl;
          D[o + 2] = dz / dl;
        }
        const dx = D[o]!;
        const dy = D[o + 1]!;
        const dz = D[o + 2]!;
        const bx = cx - dx * L * 0.5;
        const by = cy - dy * L * 0.5;
        const bz = cz - dz * L * 0.5;
        // The roll rocks slowly (±0.75 rad) while the blade waits and eases to 0 as it aims (the first blade over the
        // word's last letters, the others once cast): a flight shows no roll, and the waiting blade's unbounded
        // turn snapped back to 0 on its launch frame (review fix).
        const rollGoal = (k1.active ? 0 : j === 0 ? 1 - lead : 1) * 0.75 * Math.sin(this.time * 1.3 + ph);
        const R = this.k1Roll;
        R[j] = this.bPres[HERO.k1 + j]! <= 0 ? rollGoal : R[j]! + (rollGoal - R[j]!) * kf;
        this.show(HERO.k1 + j, bx, by, bz, dx, dy, dz, 1.35, true, 1, R[j]!);
        this.bladeTint(HERO.k1 + j, 1.3 + 0.5 * Math.max(0, p1) + 0.15 * Math.sin(this.time * 3.3 + ph));
        // The aura grows with the typing in three tiers (SWORD_AURA §4.9): one, two, three blades shown.
        const shown = k1.active ? 3 : p1 >= K1_SHOW[2] ? 3 : p1 >= K1_SHOW[1] ? 2 : 1;
        this.markAura(HERO.k1 + j, AURA_WAIT, shown === 3 ? 1 : shown === 2 ? 0.7 : 0.4, -1, 0);
        const pres = smooth01(this.bPres[HERO.k1 + j]!);
        // The element's waiting blade (its hook) in place of the glint below.
        const waiting = this.hooks.waiting;
        if (waiting !== undefined && pres > 0.01) {
          const a = this.aTravel;
          a.slot = "k1";
          a.blade = HERO.k1 + j;
          a.x = bx;
          a.y = by;
          a.z = bz;
          a.dx = dx;
          a.dy = dy;
          a.dz = dz;
          a.tipM = L;
          a.u = pres;
          a.dt = dt;
          a.pal = this.pal;
          a.aura = this.auraOn;
          if (waiting(a)) continue;
        }
        // A glint runs from the guard to the tip every 0.9 s (0.3 s a run), its size eased: one-frame cards. The aura's
        // seams carry their own travelling glints instead (SWORD_AURA §4.6).
        const gp = ((this.time + j * 0.31) % 0.9) / 0.3;
        if (gp < 1 && pres > 0.01 && !this.auraOn) {
          const e = Math.sin(Math.PI * gp) * pres;
          const along = L * (0.12 + 0.82 * gp);
          this.twinkle(bx + dx * along, by + dy * along, bz + dz * along, 0.55 * e, -1, 0.85, this.time * 3 + ph);
        }
      }
    }
    // K2: the line reveals along the ground with the word (eased, soft front); the blade lies along it at the hand.
    const p2 = this.charge.k2;
    this.use("k2");
    if (p2 >= 0) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // A line still running keeps its sigil until this word is cast (sigilFree).
      if (this.sigilFree("k2", this.sigLine)) {
        this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
        this.sigLine.uniforms.uReveal.value = easeOutQuad(rv.k2);
        this.sigLine.uniforms.uGlow.value = 0.25 + 0.4 * rv.k2;
        this.sigLine.uniforms.uInk.value = 0.2;
        this.sigLine.uniforms.uFade.value = smooth01(this.chargeAge.k2 / SIGIL_IN_S);
      }
      this.host.hand(this.v);
      const hb = this.k2Next();
      this.show(hb, this.v.x, this.v.y, this.v.z, dx, 0.05, dz, 1.5);
      this.bladeTint(hb, 1.2 + 1.2 * rv.k2);
    } else if (!this.k2.active) {
      this.sigLine.fadeOutEased(dt, SIGIL_OUT_S);
    }
    // Hộ thân: the three arcs draw themselves round the caster.
    const pg = this.charge.guard;
    if (pg >= 0) {
      if (this.sigilFree("guard", this.sigArcs)) {
        this.sigArcs.place(this.c.x, this.c.z, 0);
        this.sigArcs.uniforms.uReveal.value = rv.guard;
        this.sigArcs.uniforms.uGlow.value = 1.0;
        this.sigArcs.uniforms.uInk.value = 0.35;
        this.sigArcs.uniforms.uFade.value = smooth01(this.chargeAge.guard / SIGIL_IN_S);
        this.sigArcs.uniforms.uCount.value = 3;
      }
    } else if (!this.guard.active) {
      this.sigArcs.fadeOutEased(dt, SIGIL_OUT_S);
    }
    // Thân pháp: the arrow of the dash.
    const pd = this.charge.dash;
    if (pd >= 0 && this.sigilFree("dash", this.sigArrow)) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, DASH_M);
      this.sigArrow.uniforms.uReveal.value = rv.dash;
      this.sigArrow.uniforms.uGlow.value = 0.9;
      this.sigArrow.uniforms.uInk.value = 0.25;
      this.sigArrow.uniforms.uFade.value = smooth01(this.chargeAge.dash / SIGIL_IN_S);
    } else if (pd < 0 && !this.dash.active) {
      this.sigArrow.fadeOutEased(dt, SIGIL_OUT_S);
    }
    // Lạc Kiếm Trận: the hexagon at the target, its corners lit one by one (soft, with the eased progress).
    const p4 = this.charge.k4;
    if (p4 >= 0) {
      if (this.sigilFree("k4", this.sigHex)) {
        this.sigHex.place(this.chargeTarget.x, this.chargeTarget.z, 0);
        this.sigHex.uniforms.uReveal.value = rv.k4;
        this.sigHex.uniforms.uGlow.value = 0.9 + 0.3 * rv.k4;
        this.sigHex.uniforms.uInk.value = 0.45;
        this.sigHex.uniforms.uFade.value = smooth01(this.chargeAge.k4 / SIGIL_IN_S);
      }
    } else if (!this.k4.active) {
      this.sigHex.fadeOutEased(dt, SIGIL_OUT_S);
    }
    // Thiên Hà Kiếm Vũ: the three belts draw on the ground, the zone darkens and qi rises off it (the halo of
    // blades behind the caster: updateHalo).
    const p5 = this.charge.k5;
    this.use("k5");
    if (p5 >= 0 && this.sigilFree("k5", this.sigSpiral)) {
      const tx = this.chargeTarget.x;
      const tz = this.chargeTarget.z;
      this.sigSpiral.place(tx, tz, 0);
      this.sigSpiral.spin = approach(this.sigSpiral.spin, K5_SPIN_CHARGE, K5_SPIN_HALF_S, dt);
      this.sigSpiral.uniforms.uReveal.value = rv.k5;
      this.sigSpiral.uniforms.uGlow.value = 0.65 + 0.45 * rv.k5;
      this.sigSpiral.uniforms.uInk.value = 0.6 * rv.k5;
      this.sigSpiral.uniforms.uFade.value = smooth01(this.chargeAge.k5 / SIGIL_IN_S);
      this.darkDisc(tx, tz, 7.2, 0.45 * rv.k5, -1);
      this.zoneAcc += (14 + 70 * p5) * this.dens * dt;
      while (this.zoneAcc >= 1) {
        this.zoneAcc -= 1;
        this.riseMote(tx, 0.1, tz, 6, 0.09);
      }
    } else if (p5 < 0 && !this.k5.active) {
      // A word given up: the zone's dark disc fades with its sigil (a one-frame card, it vanished at once).
      const sp = this.sigSpiral;
      sp.fadeOutEased(dt, SIGIL_OUT_S);
      if (sp.mesh.visible) this.darkDisc(sp.mesh.position.x, sp.mesh.position.z, 7.2, 0.45 * this.reveal.k5 * sp.uniforms.uFade.value, -1);
    }
  }

  /**
   * Thiên Hà's halo: blades gather in a ring behind the caster with the word,
   * each scaling in at its key; at the release the ring spins up and shrinks
   * away over K5_HALO_OUT_S while the belts take over (it used to stand still
   * for 0.3 s and vanish in one frame, appendix B #4).
   */
  private updateHalo(dt: number): void {
    const p5 = this.charge.k5;
    const k = this.k5;
    let n = 0;
    let shrink = 1;
    if (p5 >= 0) {
      n = Math.round(HALO_N * p5);
      this.haloN = n;
    } else if (k.active && k.t < K5_HALO_OUT_S) {
      n = this.haloN;
      shrink = 1 - smooth01(k.t / K5_HALO_OUT_S);
    }
    if (n <= 0) {
      this.haloK = 1;
      return;
    }
    // The size follows the shrink down at once but grows back over 0.12 s at most: a new word begun while
    // the last halo shrank away put its first blades back at full size in one frame.
    this.haloK = shrink <= this.haloK ? shrink : Math.min(shrink, this.haloK + dt / 0.12);
    shrink = this.haloK;
    this.haloAng += dt * (0.9 + 2.4 * (1 - shrink));
    const rx = -this.c.fz;
    const rz = this.c.fx;
    for (let i = 0; i < n; i += 1) {
      const a = (i / HALO_N) * Math.PI * 2 + this.haloAng;
      const ox = Math.cos(a) * 1.5;
      const oy = Math.sin(a) * 1.5;
      const x = this.c.x + rx * ox - this.c.fx * 0.7;
      const z = this.c.z + rz * ox - this.c.fz * 0.7;
      const y = 2.1 + oy;
      // Blades point outward from the ring's centre, like a mandorla of swords.
      this.show(HERO.halo + i, x, y, z, rx * Math.cos(a), Math.sin(a), rz * Math.cos(a), 0.95 * shrink, true, shrink);
      this.bladeTint(HERO.halo + i, 1.4 + 0.6 * Math.max(0, p5));
    }
  }

  /** Angle-true blend of unit directions a → b by w (slerp; a straight lerp turns fastest mid-way). Into this.u. */
  private slerpDir(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): THREE.Vector3 {
    const d = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    const th = Math.acos(d);
    if (th < 1e-3) return this.u.set(ax + (bx - ax) * w, ay + (by - ay) * w, az + (bz - az) * w).normalize();
    if (d < -0.9999) {
      // Opposite: the arc is not defined (sin θ ≈ 0, the blend passed through a zero vector mid-way). Turn
      // through the vertical plane of a, or round x when a is vertical.
      const h = Math.hypot(ax, az);
      let px = h > 1e-3 ? (-ax * ay) / h : 1;
      let py = h > 1e-3 ? h : 0;
      let pz = h > 1e-3 ? (-az * ay) / h : 0;
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl;
      py /= pl;
      pz /= pl;
      const c = Math.cos(w * Math.PI);
      const s = Math.sin(w * Math.PI);
      return this.u.set(ax * c + px * s, ay * c + py * s, az * c + pz * s).normalize();
    }
    const s = Math.sin(th);
    const ka = Math.sin((1 - w) * th) / s;
    const kb = Math.sin(w * th) / s;
    return this.u.set(ax * ka + bx * kb, ay * ka + by * kb, az * ka + bz * kb).normalize();
  }

  private updateFlights(dt: number): void {
    const T = this.host.targets;
    for (const f of this.flights) {
      if (!f.active) continue;
      this.use(f.slot);
      if (f.hit >= 0) {
        // After the hit the blade keeps its last flight direction (it no longer flips upright), rides the beast
        // as it is pushed back, eases 0.2 m out of the wound, then folds away; its trail retracts and fades.
        f.hit += dt;
        if (T.alive(f.target)) {
          f.tx = T.x(f.target);
          f.ty = T.midY(f.target);
          f.tz = T.z(f.target);
        }
        const fold = smooth01((f.hit - FLIGHT_HOLD_S) / FLIGHT_FOLD_S);
        if (fold >= 1) {
          this.drop(f.blade);
          f.active = false;
          continue;
        }
        const back = 0.2 * easeOutCubic(clamp01(f.hit / (FLIGHT_HOLD_S + FLIGHT_FOLD_S)));
        this.show(f.blade, f.tx - f.ldx * back, f.ty - f.ldy * back, f.tz - f.ldz * back, f.ldx, f.ldy, f.ldz, FLIGHT_SCALE * (1 - fold), false, 1 - fold);
        // The aura is struck with it, then melts before the blade as it folds into light.
        if (f.slot === "k1") this.markAura(f.blade, f.hit < FLIGHT_HOLD_S ? AURA_STRIKE : AURA_FADE, 1, f.t, fold);
        continue;
      }
      f.t += dt;
      // Track the target while it moves.
      if (T.alive(f.target)) {
        f.tx = T.x(f.target);
        f.tz = T.z(f.target);
        f.ty = T.midY(f.target);
      }
      const u = clamp01(f.t / f.dur);
      const e = easeInCubic(u) * 0.35 + u * 0.65;
      const x = f.fx + (f.tx - f.fx) * e;
      const z = f.fz + (f.tz - f.fz) * e;
      const y = f.fy + (f.ty - f.fy) * e + Math.sin(u * Math.PI) * f.arc * Math.hypot(f.tx - f.fx, f.tz - f.fz) * 0.15;
      let dx = x - f.sx;
      let dy = y - f.sy;
      let dz = z - f.sz;
      const dl = Math.hypot(dx, dy, dz);
      // On the impact frame the blade keeps the way it flew: a beast knocked back toward it made the last
      // step point backwards and the blade flipped ~166° (measured, MOTION_PLAN step 3).
      if (dl > 1e-6 && u < 1) {
        dx /= dl;
        dy /= dl;
        dz /= dl;
      } else {
        dx = f.ldx;
        dy = f.ldy;
        dz = f.ldz;
      }
      // A blade launched from a pose it showed turns from that pose into its path (no 90° snap at the launch).
      if (f.d0x !== 0 || f.d0y !== 0 || f.d0z !== 0) {
        const w = smooth01(f.t / f.turn);
        if (w < 1) {
          const d = this.slerpDir(f.d0x, f.d0y, f.d0z, dx, dy, dz, w);
          dx = d.x;
          dy = d.y;
          dz = d.z;
        }
      }
      f.ldx = dx;
      f.ldy = dy;
      f.ldz = dz;
      this.show(f.blade, x, y, z, dx, dy, dz, FLIGHT_SCALE);
      if (f.slot === "k1") this.markAura(f.blade, AURA_FLY, 1, f.t, 0);
      const back = this.pommelBack(FLIGHT_SCALE);
      if (f.tail) this.pushSilk(f.ribbon, x, y, z, dx, dy, dz, back, f.blade * 1.3);
      else this.ribbons.push(f.ribbon, x - dx * back, y - dy * back, z - dz * back);
      if (f.silk >= 0) this.pushSilk(f.silk, x, y, z, dx, dy, dz, back, f.blade * 1.3);
      const travel = this.hooks.travel;
      if (u < 1 && travel !== undefined) {
        const a = this.aTravel;
        a.slot = f.slot;
        a.blade = f.blade;
        a.x = x;
        a.y = y;
        a.z = z;
        a.dx = dx;
        a.dy = dy;
        a.dz = dz;
        a.tipM = FLIGHT_SCALE * 1.1;
        a.u = u;
        a.dt = dt;
        a.pal = this.pal;
        a.aura = this.auraOn && f.slot === "k1";
      }
      if (u < 1 && (travel === undefined || !travel(this.aTravel))) {
        // A small glint riding the very tip (turning steadily, not a random angle a frame; small, so the blade
        // itself reads) and sparkle shed along the path. With the aura on, its tip star takes the glint's place.
        const tip = FLIGHT_SCALE * 1.1;
        if (!(this.auraOn && f.slot === "k1")) this.twinkle(x + dx * tip, y + dy * tip, z + dz * tip, 0.42, -1, 0.9, this.time * 2.5 + f.blade);
        // Sparkle shed at a rate (per second, by tier), not one a frame: the same at any frame rate.
        f.acc += SHED_RATE * this.dens * dt;
        while (f.acc >= 1) {
          f.acc -= 1;
          const m = this.motes.spec.reset();
          m.x = x;
          m.y = y;
          m.z = z;
          m.vx = this.rand.range(-0.8, 0.8);
          m.vy = this.rand.range(0.2, 1.2);
          m.vz = this.rand.range(-0.8, 0.8);
          m.drag = 2;
          m.life = this.rand.range(0.25, 0.45);
          m.size0 = 0.2;
          m.size1 = 0.08;
          this.col(m, this.pal.mote, 1);
          this.motes.emit();
        }
      }
      f.sx = x;
      f.sy = y;
      f.sz = z;
      if (u >= 1) {
        const tdx = f.tx - f.fx;
        const tdz = f.tz - f.fz;
        const tl = Math.hypot(tdx, tdz) || 1;
        this.v.set(f.tx, f.ty, f.tz);
        this.slashAt(this.v, this.cutAngle(tdx / tl, tdz / tl), 1.5);
        this.strike(f.target, f.fx, f.fz, f.power, 1.05, f.big);
        if (f.pierce >= 0 && T.alive(f.pierce)) this.strike(f.pierce, f.fx, f.fz, f.power * 0.6, 0.8, false);
        this.aftermath(f.tx, f.tz, 1.1, 1.2, 18);
        // Weight (round 2): the world stops 3 frames on the strike and the camera shakes a little.
        this.host.hitStop(f.slot === "k1" ? STOP_MS.k1 : STOP_MS.auto);
        this.host.shake?.(f.slot === "k1" ? SHAKE_M.k1 : SHAKE_M.auto);
        f.hit = 0;
        this.bladeTint(f.blade, 2.6);
        // The silk tail lingers as the silk did (0.32 s); the sword-light retracts in 0.18 s.
        this.ribbons.stop(f.ribbon, f.tail ? 0.32 : 0.18);
        if (f.silk >= 0) this.ribbons.stop(f.silk, 0.32);
        f.silk = -1;
      }
    }
  }

  private updateK1(dt: number): void {
    const k = this.k1;
    if (!k.active) return;
    k.t += dt;
    // Blade j launches 0.1 s before its hit tick, with its own flash at the shoulder.
    while (k.launched < 3 && k.t >= T_K1_HITS[k.launched]! - 0.1) {
      if (k.launched > 0) {
        this.k1Socket(k.launched, this.v);
        const hook = this.hooks.launch;
        const a = this.aLaunch;
        if (hook !== undefined) {
          a.slot = "k1";
          a.at.copy(this.v);
          a.index = k.launched;
          a.pal = this.pal;
        }
        if (hook === undefined || !hook(a)) {
          this.flareAt(this.v.x, this.v.y, this.v.z, 0.1, 0.6, 0.85);
          this.twinkle(this.v.x, this.v.y, this.v.z, 1.3, 0.14, 1);
          this.shockAt(this.v.x, this.v.y, this.v.z, 0.9, 0.18, 0.75);
          this.rays(this.v.x, this.v.y, this.v.z, this.n(5), 1.1, 0.1, 0.13, 0.5);
        }
        this.k1Launch(k.launched);
      }
      k.launched += 1;
    }
    if (k.t > 1.5) k.active = false;
  }

  private updateK2(dt: number): void {
    const k = this.k2;
    if (!k.active) return;
    k.t += dt;
    // The blade-light runs the line, passes its end at the hit tick still fast, slides K2_OVERSHOOT_M on to
    // rest, then dims and shrinks away (it used to stop dead at the end and vanish there, appendix B #6).
    const L = 14;
    const run = L + K2_OVERSHOOT_M;
    const travel = T_K2_HIT / (1 - Math.sqrt(K2_OVERSHOOT_M / run)); // easeOutQuad reaches L/run at the hit tick
    const u = clamp01(k.t / travel);
    const s = run * easeOutQuad(u);
    // From the hand onto the line: the offset closes over K2_JOIN_S, so the trail curves out of the hand.
    const join = 1 - smooth01(k.t / K2_JOIN_S);
    const hx = k.ax + k.dx * s + k.jx * join;
    const hy = 0.9 + k.jy * join;
    const hz = k.az + k.dz * s + k.jz * join;
    const fold = smooth01((k.t - T_K2_HIT - 0.05) / 0.25);
    if (fold < 1) {
      this.show(k.blade, hx, hy, hz, k.dx, 0, k.dz, 1.7 * (1 - fold), true, 1 - fold);
      this.bladeTint(k.blade, 1.2 + 1.4 * (1 - smooth01((k.t - T_K2_HIT) / 0.3)));
    }
    if (k.ribbonOn) {
      const back = this.pommelBack(1.7);
      this.ribbons.push(k.ribbon, hx - k.dx * back, hy, hz - k.dz * back);
      if (k.silk >= 0) this.pushSilk(k.silk, hx, hy, hz, k.dx, 0, k.dz, back, 2.1);
      if (k.t >= travel) {
        this.ribbons.stop(k.ribbon, 0.18);
        k.ribbonOn = false;
        if (k.silk >= 0) this.ribbons.stop(k.silk, 0.35);
        k.silk = -1;
      }
    }
    // The piercing tip: a blazing star riding the blade; past the hit it dims over 0.12 s as the blade slides
    // on (the 2.7 m star vanished in one frame at the line's end).
    const tip = 1 - smooth01((k.t - T_K2_HIT) / 0.12);
    if (tip > 0.01) this.twinkle(hx + k.dx * 1.9, hy, hz + k.dz * 1.9, 2.0, -1, tip, this.time * 2.5);
    if (k.t < T_K2_HIT + 0.02) {
      // The air splits to both sides behind the tip.
      k.acc += K2_SPLIT_RATE * this.dens * dt;
      while (k.acc >= 1) {
        k.acc -= 1;
        const side = k.sparks % 2 === 0 ? 1 : -1;
        k.sparks += 1;
        const sp = this.spark.spec.reset();
        sp.x = hx;
        sp.y = 0.9 + this.rand.range(-0.3, 0.4);
        sp.z = hz;
        const v = this.rand.range(4, 9);
        sp.vx = -k.dz * side * v - k.dx * 2;
        sp.vz = k.dx * side * v - k.dz * 2;
        sp.vy = this.rand.range(0, 3);
        sp.drag = 3;
        sp.life = this.rand.range(0.2, 0.35);
        sp.size0 = 0.1;
        sp.size1 = 0.04;
        sp.stretch = 0.045;
        this.col(sp, this.pal.core, 0.75);
        this.spark.emit();
      }
    }
    // Light on the line: ignites over 60 ms at the release and holds to the hit. Then the cut glows on as a
    // seam with embers (uHeat) that cools into pale ash (uAsh) and fades, eased in alpha and width (round 2: it
    // cooled into a dark ink smear across the field).
    const sig = this.sigLine;
    sig.uniforms.uReveal.value = easeOutQuad(this.revealAfterCast("k2", dt));
    const since = k.t - T_K2_HIT;
    // 0.1 s: the line's ink is faint now (no dark slit), so a 60 ms ignition put over 30 % of its level in a frame.
    const ignite = k.glow0 + (2.2 - k.glow0) * smooth01(k.t / 0.1);
    const glow = since < 0 ? ignite : 2.2 * (1 - smooth01(since / 0.35));
    sig.uniforms.uGlow.value = Math.max(0, glow);
    sig.uniforms.uInk.value = 0.12 + 0.13 * smooth01(k.t / 0.25);
    k.heat = approach(k.heat, since < 0 ? 0 : K2_HEAT_PEAK * Math.exp(-since / K2_COOL_S), 0.03, dt);
    k.ash = approach(k.ash, since < 0.15 ? 0 : 0.85 * smooth01((since - 0.15) / 0.6), 0.06, dt);
    sig.uniforms.uHeat.value = k.heat;
    sig.uniforms.uAsh.value = k.ash;
    const out = smooth01((k.t - (K2_LIFE_S - 0.45)) / 0.4);
    sig.uniforms.uFade.value = smooth01((this.chargeAge.k2 + k.t) / SIGIL_IN_S) * (1 - out);
    sig.mesh.scale.set(1, 1 + 0.25 * out, 1);
    // Embers rise off the hot seam; pale ash drifts up as it cools.
    if (since > 0 && k.heat > 0.05) {
      k.embers += 70 * (k.heat / K2_HEAT_PEAK) * this.dens * dt;
      while (k.embers >= 1) {
        k.embers -= 1;
        const t = this.rand.next();
        this.riseMote(k.ax + (k.bx - k.ax) * t, 0.05, k.az + (k.bz - k.az) * t, 0.18, 0.05);
      }
    }
    if (since > 0.2 && since < 1.3) {
      k.wisps += 9 * this.dens * dt;
      while (k.wisps >= 1) {
        k.wisps -= 1;
        const t = this.rand.next();
        const w = this.smoke.spec.reset();
        w.x = k.ax + (k.bx - k.ax) * t + this.rand.range(-0.15, 0.15);
        w.y = 0.12;
        w.z = k.az + (k.bz - k.az) * t + this.rand.range(-0.15, 0.15);
        w.vy = 0.35;
        w.vx = this.rand.range(-0.15, 0.15);
        w.vz = this.rand.range(-0.15, 0.15);
        w.drag = 0.6;
        w.life = 1.2;
        w.size0 = 0.45;
        w.size1 = 1.3;
        w.rot = this.rand.range(0, 6.28);
        w.rotV = this.rand.range(-0.4, 0.4);
        w.r = 0.3;
        w.g = 0.31;
        w.b = 0.33;
        w.a = 0.22;
        this.smoke.emit();
      }
    }
    if (!k.hit && k.t >= T_K2_HIT) {
      k.hit = true;
      const n = this.host.targets.inCapsule(k.ax, k.az, k.bx, k.bz, 0.6 + 0.4, this.hits);
      const T = this.host.targets;
      for (let i = 0; i < n; i += 1) {
        const b = this.hits[i]!;
        // Push away from the line, to the side the beast stands on.
        const side = (T.x(b) - k.ax) * -k.dz + (T.z(b) - k.az) * k.dx;
        const sx = -k.dz * Math.sign(side || 1);
        const sz = k.dx * Math.sign(side || 1);
        this.v.set(T.x(b), T.midY(b), T.z(b));
        this.slashAt(this.v, this.cutAngle(k.dx, k.dz), 1.6);
        this.strike(b, T.x(b) - sx, T.z(b) - sz, 0.9, 0.95, false);
      }
      // The after-cut: the whole line ignites at once, crescent cuts and glints all along it, and the far end bursts.
      this.beamAt(k.ax, 0.9, k.az, k.dx, 0, k.dz, 14, 0.7, 0.2, 1.6, 0.9, 0.03, 0.06, 0);
      const cuts = this.n(9);
      for (let i = 1; i <= cuts; i += 1) {
        const t = i / (cuts + 1);
        this.v.set(k.ax + (k.bx - k.ax) * t, 0.9, k.az + (k.bz - k.az) * t);
        this.twinkle(this.v.x, 0.9, this.v.z, 1.1, 0.2, 0.9);
        this.slashAt(this.v, this.cutAngle(k.dx, k.dz) + this.rand.range(-0.25, 0.25), 0.9);
      }
      this.v.set(k.bx, 0.9, k.bz);
      this.burstAt(k.bx, 0.9, k.bz, 4, 1);
      this.groundShockAt(k.bx, k.bz, 0.3, 2.2, 0.35, 0.7);
      this.host.flash(this.v, this.pal.flash, 5);
      this.host.impulse(1.5, k.dx, k.dz);
      this.host.hitStop(STOP_MS.k2);
      this.host.shake?.(SHAKE_M.k2);
      for (let i = 1; i <= 3; i += 1) {
        const t = i / 4;
        this.aftermath(k.ax + (k.bx - k.ax) * t, k.az + (k.bz - k.az) * t, 1.2, 1.0, 14);
      }
    }
    if (k.t > K2_LIFE_S) {
      k.active = false;
      k.heat = k.ash = 0;
      sig.uniforms.uHeat.value = 0;
      sig.uniforms.uAsh.value = 0;
      sig.hide();
    }
  }

  /** Hộ thân blade `o` (×3 floats) on a critical spring to (x, y, z) (Holden; GUARD_SPRING_S half-life). */
  private guardSpring(o: number, x: number, y: number, z: number, dt: number): void {
    const P = this.gPos;
    const V = this.gVel;
    const k = (2 * Math.LN2) / GUARD_SPRING_S;
    const e = Math.exp(-k * dt);
    const j0x = P[o]! - x;
    const j0y = P[o + 1]! - y;
    const j0z = P[o + 2]! - z;
    const j1x = V[o]! + j0x * k;
    const j1y = V[o + 1]! + j0y * k;
    const j1z = V[o + 2]! + j0z * k;
    P[o] = e * (j0x + j1x * dt) + x;
    P[o + 1] = e * (j0y + j1y * dt) + y;
    P[o + 2] = e * (j0z + j1z * dt) + z;
    V[o] = e * (V[o]! - j1x * k * dt);
    V[o + 1] = e * (V[o + 1]! - j1y * k * dt);
    V[o + 2] = e * (V[o + 2]! - j1z * k * dt);
  }

  private updateGuard(dt: number): void {
    const g = this.guard;
    if (!g.active) return;
    g.t += dt;
    g.spin += dt * 2.3 * (1 + (g.closeT < 0 ? 0 : 1.5 * smooth01(g.closeT / GUARD_FADE_S)));
    const life = 5;
    // Open, hold, close: the barrier eases in over GUARD_OPEN_S and out over GUARD_FADE_S, at the end of its
    // life or as soon as its last charge is spent (it used to switch off at full light then, appendix B #14).
    let settled = true;
    for (let j = 0; j < 3; j += 1) if (g.blockT[j]! >= 0 && g.blockT[j]! <= GUARD_BREAK_S + 0.25) settled = false;
    if (g.closeT < 0 && (g.t >= life - GUARD_FADE_S || (g.charges <= 0 && g.t > 0.5 && settled))) {
      g.closeT = 0;
      // The blades still orbiting break into light as they shrink away.
      for (let j = 0; j < 3; j += 1) {
        if (g.blockT[j]! >= 0) continue;
        this.ribbons.stop(g.ribbon[j]!, GUARD_FADE_S * 0.85);
        if (this.bPres[HERO.guard + j]! <= 0) continue;
        this.v.set(this.gPos[j * 3]!, this.gPos[j * 3 + 1]!, this.gPos[j * 3 + 2]!);
        this.burstMotes(this.v, this.n(8), 0.8);
        this.twinkle(this.v.x, this.v.y, this.v.z, 1.0, 0.16, 1);
      }
      this.aftermath(this.c.x, this.c.z, 1.8, 0.8, 20);
    } else if (g.closeT >= 0) {
      g.closeT += dt;
    }
    // A refreshed ward reopens from its level then (lay0); its blades stay up.
    const open = g.lay0 + (1 - g.lay0) * smooth01(g.t / GUARD_OPEN_S);
    // The close (round 2): blades, ring, crescent and arcs fade together over GUARD_FADE_S (eased alpha and size),
    // the blades lifting, widening and spinning up as they go.
    const fade = g.closeT < 0 ? 1 : 1 - smooth01(g.closeT / GUARD_FADE_S);
    const going = 1 - fade;
    // Arrival: the blades drop in from above in 0.15 s, scaling in (a refreshed ward's blades are already up).
    const arrive = g.refresh ? 1 : easeOutCubic(clamp01(g.t / 0.15));
    // Blade size: the close, and a refreshed ward's reopening from a closing level.
    const bladeK = g.refresh ? fade * open : fade;
    const kd = 1 - Math.pow(2, -dt / 0.03);
    for (let j = 0; j < 3; j += 1) {
      const bt = g.blockT[j]!;
      const o = j * 3;
      if (bt >= 0) {
        g.blockT[j] = bt + dt;
        if (bt < GUARD_BREAK_S) {
          // The parrying blade swings from its orbit to the blow on a critical spring (no 2 m jump), its
          // edge turning across the blow (damped), and flares; then it breaks into motes and fades out.
          const a = Math.atan2(g.blockZ[j]! - this.c.z, g.blockX[j]! - this.c.x);
          this.guardSpring(o, g.blockX[j]!, 1.0, g.blockZ[j]!, dt);
          const D = this.gDir;
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          const dx = D[o]! + (tx - D[o]!) * kd;
          const dy = D[o + 1]! + (0.1 - D[o + 1]!) * kd;
          const dz = D[o + 2]! + (tz - D[o + 2]!) * kd;
          const dl = Math.hypot(dx, dy, dz) || 1;
          D[o] = dx / dl;
          D[o + 1] = dy / dl;
          D[o + 2] = dz / dl;
          this.show(HERO.guard + j, this.gPos[o]!, this.gPos[o + 1]!, this.gPos[o + 2]!, D[o]!, D[o + 1]!, D[o + 2]!, 1.4);
          this.bladeTint(HERO.guard + j, 3.2);
          if (bt + dt >= GUARD_BREAK_S) {
            // Its last frame: it breaks into motes (and, no longer shown, fades out where it stands).
            this.v.set(this.gPos[o]!, this.gPos[o + 1]!, this.gPos[o + 2]!);
            this.burstMotes(this.v, this.n(12), 1.2);
            this.ribbons.stop(g.ribbon[j]!, 0.18);
          }
        }
        continue;
      }
      const a = g.spin + (j * Math.PI * 2) / 3;
      const R = 2.0 + 0.45 * going;
      const x = this.c.x + Math.cos(a) * R;
      const z = this.c.z + Math.sin(a) * R;
      const y = 1.0 + (1 - arrive) * 4 + Math.sin(this.time * 2 + j) * 0.05 + 0.5 * going;
      // Tip along the orbit's tangent, flat; a ribbon of light follows each blade round.
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      if (g.ret[j]! > 0) {
        // Back from a parry (a refreshed ward): springs from where it was to its orbit place, turning to the tangent.
        g.ret[j] = Math.max(0, g.ret[j]! - dt / 0.25);
        this.guardSpring(o, x, y, z, dt);
        const D = this.gDir;
        const dx = D[o]! + (tx - D[o]!) * kd;
        const dy = D[o + 1]! + (0 - D[o + 1]!) * kd;
        const dz = D[o + 2]! + (tz - D[o + 2]!) * kd;
        const dl = Math.hypot(dx, dy, dz) || 1;
        D[o] = dx / dl;
        D[o + 1] = dy / dl;
        D[o + 2] = dz / dl;
      } else {
        this.gPos[o] = x;
        this.gPos[o + 1] = y;
        this.gPos[o + 2] = z;
        this.gVel[o] = tx * 2.3 * 2.0;
        this.gVel[o + 1] = 0;
        this.gVel[o + 2] = tz * 2.3 * 2.0;
        this.gDir[o] = tx;
        this.gDir[o + 1] = 0;
        this.gDir[o + 2] = tz;
      }
      const px = this.gPos[o]!;
      const py = this.gPos[o + 1]!;
      const pz = this.gPos[o + 2]!;
      if (bladeK > 0.001) {
        this.show(HERO.guard + j, px, py, pz, this.gDir[o]!, this.gDir[o + 1]!, this.gDir[o + 2]!, 1.35 * bladeK, true, bladeK);
        this.bladeTint(HERO.guard + j, 1.5);
      }
      this.ribbons.push(g.ribbon[j]!, px - Math.sin(a) * 0.6, py, pz + Math.cos(a) * 0.6);
    }
    // The barrier: a faint ring of light round the body, a ground glow and a turning crescent under the blades.
    const lay = open * fade;
    g.lay = lay;
    const beat = 0.8 + 0.2 * Math.sin(this.time * 4);
    const sh = this.shock.spec.reset();
    sh.x = this.c.x;
    sh.y = 1.0;
    sh.z = this.c.z;
    sh.life = -1;
    sh.size0 = sh.size1 = (2.25 + 0.3 * going) / R_SHOCK;
    this.col(sh, this.pal.rim, 1);
    sh.a = 0.22 * beat * lay;
    this.shock.emit();
    this.darkDisc(this.c.x, this.c.z, 2.7, 0.32 * lay, -1);
    this.glowDisc(this.c.x, this.c.z, 2.0, 0.28 * beat * lay, -1);
    if (!this.lite) {
      const tw = this.twirl.spec.reset();
      tw.x = this.c.x;
      tw.y = 0.06;
      tw.z = this.c.z;
      tw.life = -1;
      tw.size0 = tw.size1 = (2.0 + 0.3 * going) / R_TWIRL;
      tw.rot = -g.spin;
      this.col(tw, this.pal.rim, 1);
      tw.a = 0.55 * lay;
      this.twirl.emit();
    }
    // A spent charge's arc dims over ~0.1 s (the shader lights a fractional arc), not in one frame.
    g.shownCharges = approach(g.shownCharges, g.charges, 0.04, dt);
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.mesh.scale.set(1 + 0.08 * going, 1 + 0.08 * going, 1);
    this.sigArcs.uniforms.uReveal.value = this.revealAfterCast("guard", dt);
    this.sigArcs.uniforms.uCount.value = g.shownCharges;
    this.sigArcs.uniforms.uGlow.value = 1.0 + 0.3 * Math.sin(this.time * 4) * open;
    this.sigArcs.uniforms.uInk.value = 0.35;
    this.sigArcs.uniforms.uFade.value = fade * smooth01((this.chargeAge.guard + g.t) / SIGIL_IN_S);
    if (g.closeT >= GUARD_FADE_S) {
      g.active = false;
      this.sigArcs.hide();
    }
  }

  /**
   * Lưu Quang Bộ's path share at time share s: the speed eases in over DASH_IN
   * and out over DASH_OUT (cosine ramps, a cruise between), so the first frame
   * moves ~8 cm, not 1.15 m (appendix B #12); peak ≈ 1.5 × the mean speed.
   */
  private dashEase(s: number): number {
    const a = DASH_IN;
    const b = DASH_OUT;
    const V = 1 / (1 - (a + b) / 2);
    if (s <= 0) return 0;
    if (s >= 1) return 1;
    if (s < a) return (V / 2) * (s - (a / Math.PI) * Math.sin((Math.PI * s) / a));
    const xa = (V * a) / 2;
    if (s < 1 - b) return xa + V * (s - a);
    const q = s - (1 - b);
    return xa + V * (1 - a - b) + (V / 2) * (q + (b / Math.PI) * Math.sin((Math.PI * q) / b));
  }

  private updateDash(dt: number): void {
    const d = this.dash;
    if (!d.active) return;
    d.t += dt;
    const ribbon = d.ribbon;
    const u = this.dashEase(clamp01(d.t / DASH_S));
    const x = d.ax + (d.bx - d.ax) * u;
    const z = d.az + (d.bz - d.az) * u;
    if (d.t <= DASH_S + 0.02) {
      this.host.moveCaster(x, z);
      this.ribbons.push(ribbon, x, 1.0, z);
      // Afterimages: bodies of light left along the path, drawn behind the body where they start (behindCaster:
      // the dash's light no longer washes over the caster at the close-up, round 2).
      if (d.ghosts < 5 && d.t >= d.ghosts * 0.04) {
        this.host.camera.getWorldPosition(this.camW);
        this.host.camera.getWorldDirection(this.camF);
      }
      while (d.ghosts < 5 && d.t >= d.ghosts * 0.04) {
        const s = this.backGlow.spec.reset();
        s.x = x;
        s.y = 0.95;
        s.z = z;
        s.life = 0.4;
        s.size0 = 2.0;
        s.size1 = 2.1;
        s.aspect = 0.34;
        this.col(s, this.pal.rim, 1);
        s.a = 0.6;
        this.behindCaster(s, x, z);
        this.backGlow.emit();
        this.beamAt(x, 0.05, z, 0, 1, 0, 1.9, 0.75, 0.38, 0.35, 0.6, 0.05, 0.35, 0);
        d.ghosts += 1;
      }
    }
    if (!d.arrived && d.t > DASH_S) {
      d.arrived = true;
      this.dust(d.bx, d.bz, this.n(5), 0.7);
      this.groundShockAt(d.bx, d.bz, 0.3, 1.8, 0.35, 0.75);
      this.host.hand(this.v);
      this.twinkle(this.v.x, this.v.y, this.v.z, 1.6, 0.14, 1);
      this.rays(d.bx, 0.9, d.bz, this.n(6), 1.3, 0.12, 0.15, 0.5);
      this.aftermath(d.bx, d.bz, 1.0, 0.7, 14);
      // The streak's head stops with the body: the trail retracts into it and fades.
      this.ribbons.stop(ribbon, 0.2);
      this.host.shake?.(SHAKE_M.dash);
    }
    // The arrow ignites over 60 ms at the release, cools after the arrival and fades.
    this.sigArrow.uniforms.uReveal.value = this.revealAfterCast("dash", dt);
    const ignite = d.glow0 + (1.6 - d.glow0) * smooth01(d.t / 0.06);
    this.sigArrow.uniforms.uGlow.value = d.t < DASH_S ? ignite : 1.6 * (1 - clamp01((d.t - DASH_S) / 0.3));
    this.sigArrow.uniforms.uInk.value = 0.25 + 0.35 * smooth01(d.t / 0.1);
    // Its fade-in carries on from the word (typed fast, it may not be done); from 0.55 s it fades out over
    // SIGIL_OUT_S, eased in alpha, widening as it goes (round 2: a linear fade of 0.4 s).
    const out = smooth01((d.t - 0.55) / SIGIL_OUT_S);
    this.sigArrow.uniforms.uFade.value = smooth01((this.chargeAge.dash + d.t) / SIGIL_IN_S) * (1 - out);
    this.sigArrow.mesh.scale.set(1 + 0.05 * out, 1 + 0.3 * out, 1);
    if (d.t > 0.57 + SIGIL_OUT_S) {
      d.active = false;
      this.sigArrow.hide();
    }
  }

  private k4Corner(k: number, out: THREE.Vector3): THREE.Vector3 {
    return this.k4CornerAt(this.k4.x, this.k4.z, k, out);
  }

  private k4CornerAt(x: number, z: number, k: number, out: THREE.Vector3): THREE.Vector3 {
    const th = (k * Math.PI) / 3 + Math.PI / 6;
    return out.set(x + Math.cos(th) * 3.55, 0, z - Math.sin(th) * 3.55);
  }

  /** The light of an array cast over while it held, fading where it stood. */
  private updateK4Old(dt: number): void {
    const o = this.k4Old;
    if (o.t < 0) return;
    o.t += dt;
    const f = 1 - smooth01(o.t / K4_OLD_S);
    if (f <= 0) {
      o.t = -1;
      return;
    }
    if (o.dark > 0) this.darkDisc(o.x, o.z, 4.2, o.dark * f, -1);
    const hold = o.hold * f;
    if (hold <= 0.002) return;
    this.glowDisc(o.x, o.z, 3.0, 0.2 * hold, -1);
    for (let j = 0; j < 6; j += 1) {
      this.k4CornerAt(o.x, o.z, j, this.w);
      const breathe = (0.75 + 0.25 * Math.sin(this.time * 5 + j)) * hold;
      this.beamAt(this.w.x, 0.02, this.w.z, 0, 1, 0, 3.4, 0.8, -1, 0.45 * breathe, 0.75 * breathe, 0.02, 0.7, 0);
    }
    const d = this.shock.spec.reset();
    d.x = o.x;
    d.y = 1.2;
    d.z = o.z;
    d.life = -1;
    d.size0 = d.size1 = 3.8 / R_SHOCK;
    this.col(d, this.pal.rim, 1);
    d.a = (0.2 + 0.06 * Math.sin(this.time * 4)) * hold;
    this.shock.emit();
  }

  private updateK4(dt: number): void {
    this.updateK4Old(dt);
    const k = this.k4;
    if (!k.active) return;
    k.t += dt;
    const B = HERO.k4 + 6 * k.set;
    const T = this.host.targets;
    const fall = clamp01(k.t / T_K4_OPEN);
    // The array's held light (columns, dome, ground glow) eases in after the landing and out before the blades
    // rise, instead of switching at fixed times (appendix B #22).
    const hold = smooth01((k.t - T_K4_OPEN) / 0.15) * (1 - smooth01((k.t - T_K4_LIFE + 0.3) / 0.3));
    k.hold = hold;
    // Six blades fall onto the corners as streaks of sword-light (scaling in as they drop) and open the array at +12 ticks.
    for (let j = 0; j < 6; j += 1) {
      this.k4Corner(j, this.w);
      const y = 6 * (1 - easeInCubic(fall)) + 0.55;
      // Leaning inward once stuck.
      const ix = (k.x - this.w.x) * 0.12;
      const iz = (k.z - this.w.z) * 0.12;
      const out = 1 - clamp01((k.t - T_K4_LIFE) / 0.35);
      if (out <= 0) continue;
      this.show(B + j, this.w.x, y + (1 - out) * 3, this.w.z, -ix, -1, -iz, K4_SWORD * out, true, out);
      this.bladeTint(B + j, 1.6 + 0.6 * pulse(clamp01((k.t - T_K4_OPEN) / 0.3)));
      // A thin trail above the falling sword's pommel (never over the sword itself).
      if (fall < 1) this.beamAt(this.w.x, y + this.pommelBack(K4_SWORD), this.w.z, 0, 1, 0, 1.0 + 3.2 * (1 - fall), this.kit.trail.widthM * 1.8, -1, 0.7, 0.6, 0.05, 0.8, 0);
      else if (hold > 0.002) {
        // The array's columns of light breathe at the corners while it holds: thin, so the planted sword reads.
        const breathe = (0.75 + 0.25 * Math.sin(this.time * 5 + j)) * hold;
        this.beamAt(this.w.x, 0.02, this.w.z, 0, 1, 0, 3.4, 0.3, -1, 0.4 * breathe, 0.4 * breathe, 0.02, 0.7, 0);
      }
    }
    if (!k.landed && k.t >= T_K4_OPEN) {
      k.landed = true;
      for (let j = 0; j < 6; j += 1) {
        this.k4Corner(j, this.w);
        this.w.y = 0.3;
        this.impact(this.w, 0.65, 0, 0, 0.3, false);
        this.pillar(this.w.x, this.w.z, 4.8, 0.75, 0.5, 0.9);
        this.groundShockAt(this.w.x, this.w.z, 0.2, 1.2, 0.3, 0.7);
        this.dust(this.w.x, this.w.z, 2, 0.5);
      }
      this.ring(k.x, k.z, 1, 3.7, 0.4, 0.75);
      this.groundShockAt(k.x, k.z, 0.5, 3.9, 0.45, 0.75);
      this.rays(k.x, 0.6, k.z, this.n(10), 3.2, 0.2, 0.22, 0.25);
      this.burstAt(k.x, 0.8, k.z, 6, 1);
      this.v.set(k.x, 0.5, k.z);
      this.host.flash(this.v, this.pal.flash, 5);
      this.host.impulse(1.5, 0, -1);
      this.host.hitStop(STOP_MS.k4Open);
      this.host.shake?.(SHAKE_M.k4Open);
      // The array bites into the stone: cracks spread from its heart and glow, then cool.
      this.startCrack(this.crackS, k.x, k.z, 0.85, 1.1, CRACK_LIFE_K4 + 5);
    }
    // A beat every 30 ticks: beams of sword-light cross from corner to corner through the centre.
    const beatsDue = k.t >= T_K4_OPEN ? Math.min(10, Math.floor((k.t - T_K4_OPEN) / T_K4_BEAT) + 1) : 0;
    while (k.beats < beatsDue) {
      k.beats += 1;
      for (let s = 0; s < 3; s += 1) {
        const from = Math.floor(this.rand.next() * 6);
        this.k4Corner(from, this.w);
        const to = (from + 3) % 6;
        this.k4Corner(to, this.v);
        const ddx = this.v.x - this.w.x;
        const ddz = this.v.z - this.w.z;
        const l = Math.hypot(ddx, ddz) || 1;
        this.beamAt(this.w.x, 0.7, this.w.z, ddx / l, 0, ddz / l, l, 0.75, 0.26, 1.2, 0.85, 0.1, 0.15, 0.09);
      }
      const n = T.inCircle(k.x, k.z, 3.2, this.hits);
      for (let i = 0; i < n; i += 1) this.strikeLight(this.hits[i]!, k.x, k.z, 0.25);
      if (n > 0) {
        this.host.hitStop(STOP_MS.k4Beat);
        this.host.shake?.(SHAKE_M.k4Beat);
      }
      this.twinkle(k.x, 0.8, k.z, 2.2, 0.16, 1);
      this.shockAt(k.x, 0.8, k.z, 1.6, 0.2, 0.6);
      this.groundShockAt(k.x, k.z, 0.5, 3.7, 0.4, 0.6);
      k.beatAge = 0;
    }
    // The hexagon pulses with each beat: up in 50 ms (smoothstep), down 3/s as before (it jumped to 1.9 in one frame).
    let env = 0;
    if (k.beatAge >= 0) {
      env = k.beatAge < 0.05 ? smooth01(k.beatAge / 0.05) : 1;
      k.beatAge += dt;
    }
    const goal = 1.0 + 0.9 * env;
    const hg = this.sigHex.uniforms.uGlow;
    hg.value = goal >= hg.value ? goal : Math.max(goal, 1.0, hg.value - dt * 3);
    if (k.beatAge >= 0.05) k.beatAge = -1;
    this.sigHex.uniforms.uReveal.value = this.revealAfterCast("k4", dt);
    this.sigHex.uniforms.uInk.value = 0.5;
    this.sigHex.uniforms.uFade.value = smooth01((this.chargeAge.k4 + k.t) / SIGIL_IN_S) * (1 - clamp01((k.t - T_K4_LIFE) / 0.6));
    k.dark = k.t < T_K4_LIFE + 0.4 ? 0.32 * smooth01(k.t / 0.12) * (1 - clamp01((k.t - T_K4_LIFE) / 0.4)) : 0;
    if (k.dark > 0) this.darkDisc(k.x, k.z, 4.2, k.dark, -1);
    if (hold > 0.002) {
      this.glowDisc(k.x, k.z, 3.0, 0.2 * hold, -1);
      // The formation's dome: a faint ring of light standing over the array.
      const d = this.shock.spec.reset();
      d.x = k.x;
      d.y = 1.2;
      d.z = k.z;
      d.life = -1;
      d.size0 = d.size1 = 3.8 / R_SHOCK;
      this.col(d, this.pal.rim, 1);
      d.a = (0.2 + 0.06 * Math.sin(this.time * 4)) * hold;
      this.shock.emit();
    }
    if (!k.closed && k.t >= T_K4_LIFE) {
      // The blades rise and break into light; motes drift off the corners.
      k.closed = true;
      for (let j = 0; j < 6; j += 1) {
        this.k4Corner(j, this.w);
        this.w.y = 1.2;
        this.burstMotes(this.w, this.n(8), 1);
        this.twinkle(this.w.x, 1.2, this.w.z, 1.0, 0.18, 1);
      }
      this.aftermath(k.x, k.z, 3.2, 1.0, 24);
    }
    if (k.t > T_K4_LIFE + 0.6) {
      k.active = false;
      this.sigHex.hide();
    }
  }

  /**
   * Ground cracks at (x, z): they spread out to `reveal` of the decal's radius
   * (eased), their seams flare to `heat` (eased in over a few frames) and
   * cool, a dark bed and pale dust settle, and the decal lives `life` s (its
   * last CRACK_OUT_S fading, eased). A crack already open at the same place
   * deepens; one open elsewhere is left to finish (the decal never jumps).
   */
  private startCrack(c: CrackState, x: number, z: number, reveal: number, heat: number, life: number): void {
    if (c.t >= 0 && Math.hypot(c.x - x, c.z - z) > 0.5) return;
    if (c.t < 0) {
      c.t = 0;
      c.x = x;
      c.z = z;
      c.reveal = c.heat = c.ash = c.ink = 0;
      c.goal = 0;
      c.peak = 0;
      c.life = 0;
    }
    c.goal = Math.max(c.goal, reveal);
    c.peak = Math.max(c.peak, heat);
    c.life = Math.max(c.life, c.t + life);
  }

  private updateCracks(dt: number): void {
    this.use("k5");
    this.updateCrack(this.crack, this.sigCrack, dt);
    this.use("k4");
    this.updateCrack(this.crackS, this.sigCrackS, dt);
  }

  private updateCrack(c: CrackState, sig: GroundSigil, dt: number): void {
    if (c.t < 0) return;
    c.t += dt;
    const out = smooth01((c.t - (c.life - CRACK_OUT_S)) / CRACK_OUT_S);
    if (out >= 1) {
      c.t = -1;
      sig.uniforms.uHeat.value = sig.uniforms.uAsh.value = 0;
      sig.hide();
      return;
    }
    // The heat goal cools (e-fold 0.5 s); the drawn heat follows it in a few frames, so a wave's flare never steps.
    c.peak *= Math.exp(-dt / 0.5);
    c.heat = approach(c.heat, c.peak, 0.04, dt);
    c.reveal = approach(c.reveal, c.goal, 0.05, dt);
    c.ink = approach(c.ink, 0.35 + 0.5 * c.goal, 0.08, dt);
    c.ash = approach(c.ash, c.t > 0.3 ? 0.65 : 0, 0.25, dt);
    sig.place(c.x, c.z, 0.4);
    sig.uniforms.uReveal.value = c.reveal;
    // Cooled, the fissures are dark with a faint glow in them.
    sig.uniforms.uGlow.value = 0.07 + c.heat;
    sig.uniforms.uInk.value = c.ink;
    sig.uniforms.uAsh.value = c.ash;
    sig.uniforms.uFade.value = smooth01(c.t / 0.12) * (1 - out);
  }

  /**
   * A point on belt `belt` (0..2) at share `phi` along the spiral sigil's
   * galaxy arm, at spiral phase `phase` (rad), into this.belt (x, z, ψ).
   * The sigil draws arm i at uv angle phase + i·2π/3 + θ with radius
   * 0.18·e^(0.32·θ) of its half size; uv y is world −z, so the world angle is
   * ψ = −(that). Blades on the belts therefore turn with the drawn arms, one
   * phase for both (they used to counter-rotate and jump at the release).
   */
  private k5Belt(phi: number, belt: number, phase: number): void {
    const th = K5_ARM_T0 + phi * (K5_ARM_T1 - K5_ARM_T0);
    const r = K5_ARM_R * 0.18 * Math.exp(0.32 * th);
    const psi = -(phase + (belt * Math.PI * 2) / 3 + th);
    const o = this.belt;
    o.psi = psi;
    o.x = this.k5.x + Math.cos(psi) * r;
    o.z = this.k5.z + Math.sin(psi) * r;
  }

  /** A falling sword of the rain: lands at (x, z) at `t0 + dur`, from `y0` m above; kind 0 rain, 1 lead (`leadSlot` its hero slot). */
  private spawnDrop(kind: number, x: number, z: number, t0: number, dur: number, target: number, wave: number, leadSlot = -1): void {
    for (let i = 0; i < this.drops.length; i += 1) {
      const d = this.drops[i]!;
      if (d.active) continue;
      d.active = true;
      d.slot = kind === 1 ? leadSlot : POOL0 + i;
      d.kind = kind;
      d.x = x;
      d.z = z;
      d.t0 = t0;
      d.dur = dur;
      d.y0 = kind === 1 ? 24 : this.rand.range(17, 23);
      d.target = target;
      d.wave = wave;
      d.landed = false;
      d.lean = this.rand.range(-0.12, 0.12);
      return;
    }
  }

  /** A sword stays planted where it landed (f6): up to RAIN_PLANT_CAP (leads up to RAIN_PLANT_LEADS hero slots). */
  private plant(kind: number, x: number, z: number, lean: number, t: number): void {
    let slot = -1;
    for (let i = 0; i < this.planted.length; i += 1) {
      if (!this.planted[i]!.active) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;
    let blade = POOL0 + RAIN_DROPS + slot;
    if (kind === 1) {
      // A lead stays the full model: the first free planted-lead hero slot.
      blade = -1;
      for (let k = 0; k < RAIN_PLANT_LEADS && blade < 0; k += 1) {
        const b = RAIN_PLANT_LEAD0 + k;
        if (!this.planted.some((q) => q.active && q.slot === b)) blade = b;
      }
      if (blade < 0) return;
    }
    const p = this.planted[slot]!;
    p.active = true;
    p.slot = blade;
    p.kind = kind;
    p.x = x;
    p.z = z;
    p.lean = lean;
    p.t = t;
    this.plantedN += 1;
  }

  private markAt(kind: number, x: number, z: number, size: number, t: number, life: number): void {
    let best = this.marks[0]!;
    for (const m of this.marks) {
      if (!m.active) {
        best = m;
        break;
      }
      if (m.t0 < best.t0) best = m;
    }
    best.active = true;
    best.kind = kind;
    best.x = x;
    best.z = z;
    best.size = size;
    best.t0 = t;
    best.life = life;
    best.angle = this.rand.range(0, Math.PI * 2);
    best.seed = this.rand.range(0, 50);
  }

  /** A rain sword lands: a crack star, a short pillar, sparks, the beasts under it struck. */
  private landDrop(d: RainDrop, t: number): void {
    const T = this.host.targets;
    const lead = d.kind === 1;
    this.markAt(MARK_STAR, d.x, d.z, lead ? 3.6 : 1.7, t, lead ? 2.6 : 1.3);
    this.sparkBurst(d.x, 0.3, d.z, this.n(lead ? 6 : 2), lead ? 1.1 : 0.6);
    if (lead) {
      this.groundShockAt(d.x, d.z, 0.3, 3.4, 0.35, 0.85);
      this.twinkle(d.x, 0.6, d.z, 2.6, 0.14, 1);
    } else if (this.rand.next() < 0.5 * this.dens) this.twinkle(d.x, 0.4, d.z, 1.2, 0.1, 1);
    const n = T.inCircle(d.x, d.z, lead ? 2.6 : 1.9, this.hits);
    for (let i = 0; i < n; i += 1) {
      const h = this.hits[i]!;
      if (lead && h === d.target) this.strike(h, this.c.x, this.c.z, 1, 1.3, true);
      else this.strikeLight(h, d.x - 0.01, d.z - 0.3, lead ? 0.9 : 0.6);
    }
    // The first landing of each wave stops the world for its beat (one stop a wave, never one a blade).
    if (!lead && this.rainWaveHit[d.wave] === 0) {
      this.rainWaveHit[d.wave] = 1;
      this.v.set(d.x, 1, d.z);
      this.host.flash(this.v, this.pal.flash, 5);
      this.host.hitStop(STOP_MS.k5);
      this.host.shake?.(SHAKE_M.k5);
    } else if (lead && d.wave === 0) {
      this.v.set(d.x, 1, d.z);
      this.host.flash(this.v, this.pal.flash, 7);
      this.host.hitStop(STOP_MS.k5);
    }
    if (lead || this.rand.next() < 0.4) this.plant(lead ? 1 : 0, d.x, d.z, d.lean, t);
  }

  /**
   * A rain sword by its tip: tip at (tx, ty, tz), pointing along (dx, dy, dz) (unit), `lengthM` pommel to tip, shown
   * at once (the rain animates its own fall), its edge line at `glow` and its dissolve; a thin trail rises behind its
   * pommel while it falls (`trail`: share of its length, 0 none).
   */
  private showRain(i: number, tx: number, ty: number, tz: number, dx: number, dy: number, dz: number, lengthM: number, glow: number, dissolve: number, trail: number): void {
    const blade = lengthM / this.blades.span(i);
    this.show(i, tx - dx * blade, ty - dy * blade, tz - dz * blade, dx, dy, dz, blade / 1.1, false, 1);
    this.bDis[i] = dissolve;
    const rim = this.skillPal.k5.rim;
    this.blades.look(i, glow, 0, rim[0], rim[1], rim[2], dissolve);
    if (trail > 0 && dissolve < 0.6) {
      const k = 1 - dissolve;
      const b = this.beams.spec.reset();
      b.x = tx - dx * lengthM;
      b.y = ty - dy * lengthM;
      b.z = tz - dz * lengthM;
      b.dx = -dx;
      b.dy = -dy;
      b.dz = -dz;
      b.len0 = b.len1 = lengthM * trail;
      const tr = this.kit.trail;
      b.w0 = tr.widthM;
      b.w1 = tr.widthM * 0.4;
      b.life = -1;
      b.cr = tr.core[0] * 0.6 * k;
      b.cg = tr.core[1] * 0.6 * k;
      b.cb = tr.core[2] * 0.6 * k;
      b.hr = rim[0] * 0.3 * k;
      b.hg = rim[1] * 0.3 * k;
      b.hb = rim[2] * 0.3 * k;
      b.fadeBase = 0.04;
      b.fadeTip = 0.85;
      this.beams.emit();
    }
  }

  /** The heaven sword, tip down at (tx, ty, tz), its flat to the camera, a trail above it while it falls. */
  private showHeaven(tx: number, ty: number, tz: number, dissolve: number, falling: boolean): void {
    const H = this.heaven;
    const blade = RAIN_COLOSSUS_M / H.span(0);
    this.host.camera.getWorldPosition(this.camW);
    const gy = ty + blade;
    H.set(0, tx, gy, tz, 0, -1, 0, blade / 1.1, this.faces.of(this.camW, tx, gy, tz, 0, -1, 0));
    const rim = this.skillPal.k5.rim;
    H.look(0, 1, falling ? 0 : 0.35, rim[0], rim[1], rim[2], dissolve, 3.1);
    H.sync();
  }

  /** The gate's ring of real swords (impostors), pointing out of its rim, fading and flaring with it. */
  private drawGateSwords(): void {
    const G = this.gateSwords;
    G.begin();
    const look = this.gate.look;
    if (this.gate.mesh.visible && look.alpha > 0.003 && look.open > 0.003) {
      for (let k = 0; k < GATE_SWORDS; k += 1) {
        this.gate.swordAt(this.host.camera, k, this.v, this.w);
        G.push(this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z, look.alpha, 0, 0.55 + 0.6 * look.flare, 0.4 * look.flare);
      }
    }
    G.end();
  }

  private updateK5(dt: number): void {
    const k = this.k5;
    const L = this.rainStrips;
    const M = this.rainMarks;
    L.begin();
    M.begin();
    if (!k.active) {
      this.gate.hide();
      this.gateSwords.hide();
      L.end();
      M.end();
      return;
    }
    k.t += dt;
    const t = k.t;
    const T = this.host.targets;
    // The typed ground spiral gives way to the sky (round 3a's floor decal is gone).
    const sp = this.sigSpiral;
    if (sp.mesh.visible) {
      sp.uniforms.uFade.value = k.glow0 * (1 - smooth01(t / 0.3));
      if (t > 0.3) sp.hide();
    }
    // The gate: opens over 0.35 s, flares at the climax, closes after the aftermath's first second.
    const open = easeOutCubic(clamp01(t / RAIN_GATE_OPEN_S));
    const close = smooth01((t - RAIN_GATE_CLOSE_AT) / 0.5);
    const flare = Math.max(0, 1 - Math.abs(t - RAIN_CLIMAX_AT) / 0.25) + 0.25 * pulse(clamp01((t - 0.35) / 0.4));
    this.gate.set(open * (1 - 0.35 * close), smooth01(t / 0.12) * (1 - close), Math.min(1, flare), t * 0.35, this.time);
    // Columns: grow from the gate's rim to the ground, segments running down, gone after the climax.
    for (const c of this.columns) {
      const age = t - c.t0;
      if (age <= 0) continue;
      const grow = easeOutCubic(clamp01(age / 0.18));
      const fade = 1 - smooth01((t - RAIN_CLIMAX_AT - 0.3) / 0.5);
      if (fade <= 0) continue;
      // A vertical column from the ground into the sky (it reaches the top of the frame, under the gate's rim).
      const top = RAIN_GATE_Y + 8;
      this.w.set(c.gx, top, c.gz);
      const gx = c.gx;
      const gy = top * (1 - grow);
      const gz = c.gz;
      const beat = 1 + 0.6 * Math.max(0, 1 - Math.abs(t - RAIN_CLIMAX_AT) / 0.2);
      L.push(gx, gy, gz, this.w.x, this.w.y, this.w.z, 15 * beat, 0.16, fade * smooth01(age / 0.08), 4.5 * beat, -t * 2.2 + c.rimA, 0.04);
    }
    // Lead swords: six giants drop one by one on the gravest prey (the king, elites, then the biggest beasts).
    while (this.rainNextLead < RAIN_LEADS && t >= RAIN_LEAD_AT + this.rainNextLead * RAIN_LEAD_GAP) {
      const i = this.rainNextLead;
      this.rainNextLead += 1;
      const prey = this.gravest(i);
      const px = prey >= 0 ? T.x(prey) : RAIN_FIELD.x0 + (RAIN_FIELD.x1 - RAIN_FIELD.x0) * this.rand.next();
      const pz = prey >= 0 ? T.z(prey) : RAIN_FIELD.z0 + (RAIN_FIELD.z1 - RAIN_FIELD.z0) * this.rand.next();
      this.spawnDrop(1, px, pz, t, RAIN_LEAD_FALL_S, prey, 0, HERO.rain + i);
    }
    // The rain: three dense waves over ≥ 70 % of the field; half the blades fall on beasts, half on a jittered grid.
    while (k.wave < RAIN_WAVES.length && t >= RAIN_WAVES[k.wave]!) {
      const w = k.wave;
      k.wave += 1;
      const count = this.n(RAIN_PER_WAVE);
      let m = 0;
      const live = T.size;
      for (let j = 0; j < count; j += 1) {
        let x: number;
        let z: number;
        let prey = -1;
        if (j % 2 === 0 && live > 0) {
          // A live beast (scan from a random start).
          const s0 = Math.floor(this.rand.next() * live);
          for (let q = 0; q < live; q += 1) {
            const b = (s0 + q) % live;
            if (T.alive(b)) {
              prey = b;
              break;
            }
          }
        }
        if (prey >= 0) {
          x = T.x(prey) + this.rand.range(-0.4, 0.4);
          z = T.z(prey) + this.rand.range(-0.4, 0.4);
        } else {
          const gxN = 9;
          const cell = (m + w * 3) % (gxN * 5);
          m += 1;
          x = RAIN_FIELD.x0 + ((cell % gxN) + this.rand.next()) * ((RAIN_FIELD.x1 - RAIN_FIELD.x0) / gxN);
          z = RAIN_FIELD.z0 + (Math.floor(cell / gxN) + this.rand.next()) * ((RAIN_FIELD.z1 - RAIN_FIELD.z0) / 5);
        }
        this.spawnDrop(0, x, z, t + this.rand.range(0, RAIN_WAVE_SPREAD_S), this.rand.range(0.15, 0.2), prey, w);
      }
    }
    // The colossus: one heaven sword falls from the gate's heart on the zone (the climax, its own shape).
    const col = this.colossus;
    if (!col.active && !col.done && t >= RAIN_CLIMAX_AT - RAIN_COLOSSUS_FALL_S) {
      col.active = true;
      col.done = false;
      col.t0 = t;
      col.sx = this.gate.centre.x;
      col.sy = this.gate.centre.y;
      col.sz = this.gate.centre.z;
    }
    if (col.active) {
      const u = clamp01((t - col.t0) / RAIN_COLOSSUS_FALL_S);
      const e = easeInCubic(u);
      // From the gate's heart down to the zone, turning tip-down as it comes.
      const tipX = col.sx + (k.x - col.sx) * e;
      const tipY = col.sy + (-1.2 - col.sy) * e;
      const tipZ = col.sz + (k.z - col.sz) * e;
      const out = 1 - smooth01((t - RAIN_END_AT + 0.6) / 0.5);
      // The heaven sword: the real model at the composition's scale, materialising out of the gate as it falls.
      if (out > 0) this.showHeaven(tipX, tipY, tipZ, 1 - out * smooth01(u / 0.15 + (u >= 1 ? 1 : 0)), u < 1);
      else {
        this.heaven.hide(0);
        this.heaven.sync();
      }
      if (u < 1) L.push(tipX, tipY, tipZ, col.sx, col.sy, col.sz, 22, 0.2, 0.8 * smooth01(u / 0.2), 5, -t * 3, 0.02);
      else if (out > 0) L.push(k.x, 0, k.z, k.x, 5, k.z, 34, 0.18, 0.75 * out * (0.6 + 0.4 * Math.exp(-(t - RAIN_CLIMAX_AT) * 2)), 4.5, t, 0.02);
      if (u >= 1 && !col.done) {
        col.done = true;
        this.climaxK5(t);
      }
    }
    // Falling and landed swords: each falls tip first and drives 28 % of its length into the ground, where a
    // planted one takes over the same pose (f6); one not planted melts into light at its landing.
    for (const d of this.drops) {
      if (!d.active) continue;
      const u = (t - d.t0) / d.dur;
      if (u < 0) continue;
      const len = d.kind === 1 ? RAIN_LEAD_M : RAIN_MID_M;
      const lean = d.kind === 1 ? d.lean : 0;
      const dl = Math.hypot(lean, len);
      const ddx = -lean / dl;
      const ddy = -len / dl;
      const bury = len * 0.28;
      if (u >= 1) {
        if (!d.landed) {
          d.landed = true;
          const planted = this.plantedN;
          this.landDrop(d, t);
          // Planted: its own slot shows the same pose from this frame; the falling one goes at once.
          if (this.plantedN !== planted) this.drop(d.slot);
        }
        const melt = (t - d.t0 - d.dur) / 0.14;
        if (melt < 1 && this.bPres[d.slot]! > 0) this.showRain(d.slot, d.x, -bury, d.z, ddx, ddy, 0, len, 1.2 * (1 - melt), smooth01(melt), 0);
        // A landing pillar for 0.25 s, then the drop is free.
        const age = t - d.t0 - d.dur;
        const pl = 1 - smooth01(age / (d.kind === 1 ? 0.4 : 0.25));
        if (pl <= 0) {
          d.active = false;
          continue;
        }
        const h = d.kind === 1 ? 9 : 4;
        L.push(d.x, 0, d.z, d.x, h * (0.6 + 0.4 * pl), d.z, d.kind === 1 ? 16 : 8, 0.22, pl, d.kind === 1 ? 6 : 4, 0, 0.02);
        continue;
      }
      const e = easeInCubic(u * 0.6 + 0.4 * u * u);
      const y = d.y0 - (d.y0 + bury) * e;
      // They come out of the sky above the frame: solid after the first 5 % of the fall.
      const fade = smooth01(u / 0.05);
      this.showRain(d.slot, d.x, y, d.z, ddx, ddy, 0, len, d.kind === 1 ? 1 : 0.75, 1 - fade, d.kind === 1 ? 1.0 : 1.2);
    }
    // Planted swords (f6): blades stuck in the ground with a lit base, fading with the aftermath.
    const end = 1 - smooth01((t - (RAIN_END_AT - 0.7)) / 0.6);
    for (const p of this.planted) {
      if (!p.active) continue;
      const age = t - p.t;
      const lead = p.kind === 1;
      const len = lead ? RAIN_LEAD_M : RAIN_MID_M;
      const lean = lead ? p.lean : 0;
      const glow = (0.55 + 0.45 * Math.exp(-age * 3)) * end;
      if (end <= 0) {
        p.active = false;
        continue;
      }
      const dl = Math.hypot(lean, len);
      this.showRain(p.slot, p.x, -len * 0.28, p.z, -lean / dl, -len / dl, 0, len, 0.35 + 0.65 * glow, 1 - end, 0);
      L.push(p.x, 0, p.z, p.x, lead ? 1.8 : 1.0, p.z, lead ? 12 : 7, 0.18, 0.7 * glow, 3.2, age, 0.02);
    }
    // The rift and its embers (f6).
    const rf = this.rift;
    if (rf.t >= 0) {
      rf.t += dt;
      const rev = easeOutCubic(clamp01(rf.t / 0.22));
      const heat = 1 - smooth01((rf.t - 0.2) / 1.6);
      const fadeR = 1 - smooth01((t - (RAIN_END_AT - 0.6)) / 0.6);
      M.push(MARK_RIFT, rf.x, rf.z, rf.angle, RAIN_RIFT_M, RAIN_RIFT_M * 0.4, rf.seed, rev, fadeR, 3.2 + 2.8 * heat, 0.9, 0.75 + 0.25 * heat);
      this.rainEmberAcc += 60 * this.dens * dt * fadeR;
      while (this.rainEmberAcc >= 1) {
        this.rainEmberAcc -= 1;
        const s = this.rand.range(-0.45, 0.45) * RAIN_RIFT_M * rev;
        this.riseMote(rf.x + Math.cos(rf.angle) * s, 0.1, rf.z + Math.sin(rf.angle) * s, 0.4, 0.07);
      }
    }
    // Crack stars.
    for (const m of this.marks) {
      if (!m.active || m.size <= 0) continue;
      const age = t - m.t0;
      if (age > m.life) {
        m.active = false;
        continue;
      }
      const a = smooth01(age / 0.05) * (1 - smooth01((age - m.life * 0.6) / (m.life * 0.4)));
      const heat = 2.6 * Math.exp(-age * 4) + 0.8;
      M.push(MARK_STAR, m.x, m.z, m.angle, m.size, m.size, m.seed, 1, a, heat, 0.75, 0.8);
    }
    L.end();
    M.end();
    this.drawGateSwords();
    if (t > RAIN_END_AT) {
      k.active = false;
      this.gate.hide();
      this.gateSwords.hide();
      for (const d of this.drops) d.active = false;
      for (const p of this.planted) p.active = false;
      this.rift.t = -1;
      this.colossus.active = false;
      this.colossus.done = false;
      this.heaven.hide(0);
      this.heaven.sync();
      L.begin();
      M.begin();
      L.end();
      M.end();
    }
  }

  /** The `i`-th gravest live beast: the king first, then elites and the biggest, spread over the field. */
  private gravest(i: number): number {
    const T = this.host.targets;
    let best = -1;
    let bestScore = -1;
    for (let b = 0; b < T.size; b += 1) {
      if (!T.alive(b)) continue;
      let taken = false;
      for (const d of this.drops) if (d.active && d.kind === 1 && d.target === b) taken = true;
      if (taken) continue;
      // Size first, then spread (far from the other leads' landings), plus a seeded jitter.
      let near = 99;
      for (const d of this.drops) if (d.active && d.kind === 1) near = Math.min(near, Math.hypot(d.x - T.x(b), d.z - T.z(b)));
      const score = T.tier(b) * 10 + Math.min(near, 12) * 0.8 + this.rand.next() + (i === 0 && T.tier(b) >= 4 ? 100 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  /** The heaven sword lands: every beast on the field is struck, the rift opens, the gate flares. */
  private climaxK5(t: number): void {
    const k = this.k5;
    const T = this.host.targets;
    // Every live beast on the field (the zone's heart takes the full blow, the rest the shock).
    let n = 0;
    for (let b = 0; b < T.size && n < this.hits.length; b += 1) if (T.alive(b)) this.hits[n++] = b;
    for (let i = 0; i < n; i += 1) {
      const h = this.hits[i]!;
      if (T.tier(h) >= 3) this.strike(h, k.x, k.z, 1, 1.4, true);
      else this.strikeLight(h, k.x, k.z, 1);
    }
    this.rift.t = 0;
    this.rift.x = k.x;
    this.rift.z = k.z + 1.5;
    this.rift.angle = -0.38 + this.rand.range(-0.1, 0.1);
    this.rift.seed = this.rand.range(0, 40);
    this.riseS = 0;
    this.flareAt(k.x, 1.2, k.z, 0.16, 4.2, 6.4);
    this.groundShockAt(k.x, k.z, 0.8, 11, 0.6, 0.9);
    this.shockAt(k.x, 1.2, k.z, 7, 0.45, 0.75);
    this.markAt(MARK_STAR, k.x, k.z, 7.5, t, 3.2);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + this.rand.range(-0.3, 0.3);
      this.markAt(MARK_STAR, k.x + Math.cos(a) * 6.5, k.z + Math.sin(a) * 4.5, 2.6, t, 2.6);
    }
    this.sparkBurst(k.x, 0.6, k.z, this.n(20), 1.6);
    this.v.set(k.x, 1.2, k.z);
    this.host.flash(this.v, this.pal.flash, 14);
    this.host.impulse(5, 0, -1);
    // The climax's stop (≥ 80 ms: the host plays it as the finisher with K5's own graphic frames).
    this.host.hitStop(STOP_MS.k5Last);
    this.host.shake?.(SHAKE_M.k5Last);
  }
}
