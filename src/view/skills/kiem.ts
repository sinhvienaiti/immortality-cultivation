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
 * View only: hits shown here are the lab's stand-ins for sim events.
 * Smooth motion (owner 02/11/2026, MOTION_PLAN step 3): no layer pops on or
 * off outside a flash (long-lived layers ease in and out, sigils reveal with
 * soft edges at a smoothed progress), blades scale in and out and turn
 * through damped directions, trails sample world time and retract when they
 * stop, and every rate is per second, so 60 and 120 Hz show the same thing.
 */
import * as THREE from "three";
import { BladeSet, loadBladeGeometry } from "./blades";
import { approach, BeamPool, clamp01, easeInCubic, easeOutCubic, easeOutQuad, GroundSigil, pulse, Rand, RibbonPool, smooth01, SpritePool, type SpriteSpec } from "./fxkit";
import type { TargetField } from "./targets";
import { DEFAULT_WEAPON, weaponById, type Rgb, type WeaponDef, type WeaponGlow, type WeaponId } from "./weapons";

export type KiemSlot = "auto" | "k1" | "k2" | "guard" | "dash" | "k4" | "k5";

export interface KiemTextures {
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

export interface KiemHost {
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
  moveCaster(x: number, z: number): void;
  play(clip: "attack" | "skill1" | "skill2" | "ult" | "dash" | "idle"): void;
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

const BLADE_CAP = 360;
// Reserved hero blade slots. Nhất Tuyến takes two in turn, Lạc Kiếm Trận two sets of six and Phi Kiếm six
// (AUTO_N), so a new cast never steals a blade that is still on screen (folding in a wound, standing in an
// array, fading out): it would jump or pop.
const HERO = { k1: 0, k2: 3, guard: 5, k4: 8, auto: 20, halo: 26 } as const;
const AUTO_N = 6;
const HALO_N = 24;
const POOL0 = HERO.halo + HALO_N; // first blade of the K5 pool
const RIBBONS = 40;
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
/** The caster's seal fades in no faster than over this time (s). */
const SEAL_IN_S = 0.15;
/** Slots whose word draws a ground sigil. */
const SIGIL_SLOTS: readonly KiemSlot[] = ["k2", "guard", "dash", "k4", "k5"];
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
const GUARD_CLOSE_S = 0.4;
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
/** Lạc Kiếm Trận cast again while it holds: the old array's light fades over this time (s). */
const K4_OLD_S = 0.3;

interface Flight {
  active: boolean;
  blade: number;
  ribbon: number;
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
}

type Rgbish = { r: number; g: number; b: number };

export class KiemFx {
  readonly blades: BladeSet;
  private readonly glow: SpritePool;
  private readonly flare: SpritePool;
  private readonly star: SpritePool;
  private readonly spark: SpritePool;
  private readonly bladeGlow: SpritePool;
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
  private pal: WeaponGlow;
  private weaponSeq = 0;

  // Charge state per slot (typing progress 0..1, -1 idle).
  private charge: Record<KiemSlot, number> = { auto: -1, k1: -1, k2: -1, guard: -1, dash: -1, k4: -1, k5: -1 };
  private chargeShown: Record<KiemSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };
  /** Typing progress as drawn: eases toward `charge` (REVEAL_HALF_S), so sigils grow smoothly instead of one step a key. */
  private reveal: Record<KiemSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };
  /** Seconds since each word's first key: its sigil (ink base included) fades in over SIGIL_IN_S instead of appearing whole. */
  private chargeAge: Record<KiemSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };

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

  // Running skills.
  private k1 = { active: false, t: 0, launched: 0, tx: 0, tz: 0 };
  // blade: the slot the running line uses (HERO.k2 or HERO.k2 + 1); the next word's blade takes the other one.
  private k2 = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, hit: false, ribbon: 0, acc: 0, sparks: 0, glow0: 0, ribbonOn: false, jx: 0, jy: 0, jz: 0, blade: HERO.k2 + 1 };
  // refresh: cast again while it ran (it reopens from lay0, the barrier's level then, and its blades stay up);
  // lay: the barrier's level this frame; ret: a parrying or broken blade springing back to its orbit (1 → 0).
  private guard = { active: false, t: 0, charges: 0, shownCharges: 0, spin: 0, closeT: -1, blockT: [-1, -1, -1], blockX: [0, 0, 0], blockZ: [0, 0, 0], ribbon: [0, 0, 0], refresh: false, lay0: 0, lay: 0, ret: [0, 0, 0] };
  private dash = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, ghosts: 0, ribbon: 0, arrived: false, glow0: 0 };
  // set: which six blades (HERO.k4 + 6·set); hold, dark: the array's held light and dark disc this frame.
  private k4 = { active: false, t: 0, x: 0, z: 0, beats: 0, landed: false, closed: false, beatAge: -1, set: 0, hold: 0, dark: 0 };
  /** An array cast over while it held: its held light fades out over K4_OLD_S where it stood (t < 0: none). */
  private k4Old = { t: -1, x: 0, z: 0, hold: 0, dark: 0 };
  private k5 = { active: false, t: 0, x: 0, z: 0, wave: 0, done: false, dissolved: false, acc: 0, glow0: 0 };

  constructor(
    private readonly host: KiemHost,
    tex: KiemTextures,
    quality: "low" | "medium" | "high" | "ultra",
  ) {
    this.poolN = quality === "low" ? 150 : quality === "medium" ? 225 : 300;
    this.dens = quality === "low" ? 0.5 : quality === "medium" ? 0.75 : 1;
    this.lite = quality === "low";
    this.blades = new BladeSet(BLADE_CAP, 1.1);
    const L = host.layer;
    // Dark layers first, light on top (VFX_STANDARD §3.4: a dark layer behind bright ones).
    // Big soft discs and rings show only the cropped middle of their sheet (fewer pixels drawn, same look).
    // Long-lived layers that are not flashes (dark discs, ink, smoke, ground glows) ease in over NON_FLASH_IN_S,
    // a few frames after the flash they sit under (§3.4 layers 2–3 frames apart): nothing pops on.
    this.groundDark = new SpritePool(48, tex.glow, "ink", "ground", 3, { crop: CROP_INK, fadeIn: NON_FLASH_IN_S });
    this.groundInk = new SpritePool(160, tex.scorch, "ink", "ground", 4, { fadeIn: NON_FLASH_IN_S });
    this.groundGlow = new SpritePool(96, tex.glow, "add", "ground", 5, { crop: CROP_LIGHT, fadeIn: NON_FLASH_IN_S });
    this.groundRing = new SpritePool(64, tex.ring, "add", "ground", 6, { crop: CROP_RING, cropFade: 0.97 });
    this.groundShock = new SpritePool(64, tex.shock, "add", "ground", 6);
    this.twirl = new SpritePool(32, tex.twirl, "add", "ground", 7);
    this.smoke = new SpritePool(240, tex.smoke, "ink", "camera", 8, { fadeIn: NON_FLASH_IN_S });
    this.splash = new SpritePool(160, tex.splash, "ink", "camera", 9, { fadeIn: NON_FLASH_IN_S });
    // The caster's halo is placed behind the body (behindCaster): no pull; it fades out at the ground instead.
    this.aura = new SpritePool(48, tex.halo, "add", "camera", 10, { pull: 0, groundFade: 0.15 });
    // Layers on the same sheet, blend and facing share one pool, so one draw call: the glows and the blades'
    // one-frame halo cards always; sparks and motes too when they use the glow's sheet (the lab's circle_05).
    // Additive layers add up in any order, so the shared pool's render order changes nothing.
    const sparkInGlow = tex.spark === tex.glow;
    const moteInGlow = tex.mote === tex.glow;
    this.glow = new SpritePool(620 + (sparkInGlow ? 800 : 0) + (moteInGlow ? 700 : 0), tex.glow, "add", "camera", 11, { crop: CROP_LIGHT });
    this.slash = new SpritePool(96, tex.slash, "add", "camera", 12);
    // One-frame core cards, one per visible blade (≤ BLADE_CAP − HALO slots in use; dropOneFrame frees last frame's first).
    this.bladeGlow = new SpritePool(420, tex.trace, "add", "camera", 12);
    this.beams = new BeamPool(640, 13);
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
    // Each pool once (shared pools appear under several names): it is updated once a frame.
    this.pools = [
      ...new Set([
        this.groundDark, this.groundInk, this.groundGlow, this.groundRing, this.groundShock, this.twirl, this.smoke, this.splash,
        this.aura, this.glow, this.slash, this.bladeGlow, this.spark, this.motes, this.shock, this.star, this.flare,
      ]),
    ];
    this.sigils = [this.sigHex, this.sigSpiral, this.sigArcs, this.sigLine, this.sigArrow, this.sigSeal];
    for (const s of this.sigils) L.add(s.mesh);
    for (const p of this.pools) L.add(p.mesh);
    L.add(this.blades.mesh, this.ribbons.mesh, this.beams.mesh);
    for (let i = 0; i < 24; i += 1) {
      this.flights.push({ active: false, blade: 0, ribbon: 0, t: 0, dur: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, target: -1, pierce: -1, power: 0, big: false, hit: -1, sx: 0, sy: 0, sz: 0, acc: 0, d0x: 0, d0y: 0, d0z: 0, turn: FLIGHT_TURN_S, ldx: 0, ldy: 0, ldz: 1 });
    }
    for (let i = 0; i < EMITTERS; i += 1) this.emitters.push({ active: false, x: 0, y: 0, z: 0, r: 0, t: 0, life: 0, rate: 0, acc: 0 });
    // The signature sword's colours until setWeapon; the blade stays the stand-in jian until a GLB loads.
    this.weaponDef = weaponById(DEFAULT_WEAPON)!;
    this.pal = this.weaponDef.glow;
    this.applyColours(this.weaponDef);
  }

  // ── Equipped weapon (D55) ────────────────────────────────────────────────

  get weapon(): WeaponId {
    return this.weaponDef.id;
  }

  /**
   * Equips a sword: the blade geometry (its GLB, or the stand-in jian while
   * the file is missing), the rail and every light layer's colour swap
   * together once the geometry is ready. Only family "sword" is accepted: the
   * sabre and spear skill sets are not built yet. Resolves false when refused
   * or overtaken by a later call. Not per frame: it may allocate.
   */
  setWeapon(def: WeaponDef): Promise<boolean> {
    if (def.family !== "sword") {
      console.warn(`[kiem] ${def.name} is a ${def.family}: the Kiếm skills take swords only (the ${def.family} skills are not built yet).`);
      return Promise.resolve(false);
    }
    const seq = (this.weaponSeq += 1);
    return loadBladeGeometry(def.model, def.fit).then((geometry) => {
      if (seq !== this.weaponSeq) return false;
      this.blades.setGeometry(geometry);
      this.weaponDef = def;
      this.pal = def.glow;
      this.applyColours(def);
      return true;
    });
  }

  private applyColours(def: WeaponDef): void {
    const g = def.glow;
    // The rail glows a little more than the realistic set; the light around the blade comes from the glow cards.
    this.blades.setRail(def.rail, 0.65);
    const m = Math.max(g.rim[0], g.rim[1], g.rim[2], 1e-3);
    const k = SIGIL_LIGHT / m;
    for (const sig of this.sigils) {
      sig.uniforms.uColor.value.setRGB(g.rim[0] * k, g.rim[1] * k, g.rim[2] * k);
      sig.uniforms.uCore.value.setRGB(g.sigilCore[0], g.sigilCore[1], g.sigilCore[2]);
    }
  }

  /** A blade flash toward the weapon's tint: k = 1 plain steel, k > 1 brighter (the tint keeps ≤ 30 % white). */
  private bladeTint(i: number, k: number): void {
    const t = this.pal.tint;
    this.blades.tint(i, 1 + (k - 1) * t[0], 1 + (k - 1) * t[1], 1 + (k - 1) * t[2]);
  }

  /** Reset every running effect (lab: before a capture). */
  reset(): void {
    this.blades.hideAll();
    this.bPres.fill(0);
    this.bShown.fill(0);
    this.bCard.fill(0);
    for (const f of this.flights) f.active = false;
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
    this.k2.blade = HERO.k2 + 1;
    this.k4.set = 0;
    this.k4Old.t = -1;
    for (const k of Object.keys(this.charge) as KiemSlot[]) {
      this.charge[k] = -1;
      this.chargeShown[k] = 0;
      this.reveal[k] = 0;
      this.chargeAge[k] = 0;
    }
    this.k5DiveSet.fill(0);
    this.haloN = 0;
    this.haloAng = 0;
    this.haloK = 1;
    // Every capture after a reset starts from the same slots (Phi Kiếm's glint turns with its blade index).
    this.autoSlot = 0;
    this.castTyped = false;
    this.sealFade = 0;
    this.auraP = this.auraBig = this.blaze = this.blazeGoal = 0;
    this.moteAcc = this.gatherAcc = this.zoneAcc = this.lightAcc = 0;
    this.rand.reseed(1301);
  }

  // ── Blades: scale in, fade out, never pop ────────────────────────────────

  /**
   * Blade `i` this frame at (x, y, z), tip along (dx, dy, dz), `scale` × its
   * length. A blade that was not shown scales in over BLADE_IN_S (`ramp`), or
   * shows at once when the caller animates its own scale (`ramp` false); a
   * blade no longer shown fades out from its last pose (settleBlades).
   * `glow`: share of its light cards (the caller's own fade).
   */
  private show(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, scale: number, ramp = true, glow = 1): void {
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

  /** Writes every blade's pose once a frame: presence eases in while shown and out from the last pose when not. */
  private settleBlades(dt: number): void {
    const P = this.bPose;
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
      this.blades.set(i, P[o]!, P[o + 1]!, P[o + 2]!, P[o + 3]!, P[o + 4]!, P[o + 5]!, P[o + 6]! * k);
    }
  }

  // ── Typing → charge ──────────────────────────────────────────────────────

  /** Typing progress of the word on `slot` (0 first key … 1 last key); −1 cancels. `tx, tz`: where it will land. */
  setCharge(slot: KiemSlot, progress: number, tx = 0, tz = -8): void {
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
  private keyBeat(slot: KiemSlot, p: number): void {
    this.host.hand(this.v);
    this.host.caster(this.c);
    const s = this.glow.spec.reset();
    s.x = this.v.x;
    s.y = this.v.y;
    s.z = this.v.z;
    s.life = 0.2;
    s.size0 = 0.6 + 0.6 * p;
    s.size1 = 0.35;
    this.col(s, this.pal.halo, 1);
    s.a = 0.9;
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
  }

  // ── Release ───────────────────────────────────────────────────────────────

  /** The word's last key: release now (≤ 50 ms), toward (tx, tz). */
  cast(slot: KiemSlot, tx: number, tz: number): void {
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
  private sigilOf(slot: KiemSlot): GroundSigil | null {
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
   * The release at the hand, all on the first frame (VFX_STANDARD §3.1 rule 5):
   * a core flare, a star burst, a halo, a shock ring, burst rays, sparks and
   * motes; a ground ring and shock; a light pillar from tier 3; the caster's
   * seal blazes. `tier`: 1 basic, 2 light skill, 3 skill, 5 ultimate.
   */
  private releaseFlash(size: number, intensity: number, ringM: number, tier: number): void {
    this.host.hand(this.v);
    const v = this.v;
    this.flareAt(v.x, v.y, v.z, 0.12, size * 1.5, size * 2.1);
    this.starPair(v.x, v.y, v.z, size * 5, 0.15, this.rand.range(-0.3, 0.3));
    const g = this.glow.spec.reset();
    g.x = v.x;
    g.y = v.y;
    g.z = v.z;
    g.life = 0.3;
    g.size0 = size * 4.2;
    g.size1 = size * 5.4;
    this.col(g, this.pal.rim, 1);
    g.a = 0.7;
    this.glow.emit();
    this.shockAt(v.x, v.y, v.z, 1.0 + 0.6 * tier, 0.2 + 0.03 * tier, 0.85);
    this.rays(v.x, v.y, v.z, this.n(5 + 3 * tier), 1.5 + 0.6 * tier, 0.16 + 0.04 * tier, 0.16 + 0.02 * tier, 0.55);
    if (ringM > 0) {
      this.darkDisc(this.c.x, this.c.z, ringM * 1.1, 0.4, 0.7);
      this.ring(this.c.x, this.c.z, 0.3, ringM * 1.2, 0.32, 0.75);
      this.groundShockAt(this.c.x, this.c.z, 0.3, ringM * 1.1, 0.42, 0.7);
      this.glowDisc(this.c.x, this.c.z, ringM * 0.6, 0.4, 0.45);
    }
    if (tier >= 3) this.pillar(this.c.x, this.c.z, 3 + 1.6 * tier, 0.55 + 0.2 * tier, 0.3 + 0.05 * tier, 0.9);
    this.sparkBurst(v.x, v.y, v.z, this.n(6 + 4 * tier), 0.8 + 0.2 * tier);
    this.burstMotes(v, this.n(5 + 3 * tier), 1.3);
    // The caster's seal blazes for typed skills; the basic attack stays a plain flash (Low: no blaze, the seal just fades).
    if (tier >= 2 && !this.lite) this.blazeGoal = Math.max(this.blazeGoal, 0.9 + 0.35 * tier);
    this.host.flash(v, this.pal.flash, intensity);
  }

  private castAuto(): void {
    this.host.play("attack");
    const target = this.host.targets.nearest(this.c.x, this.c.z, 10);
    if (target < 0) return;
    this.host.hand(this.v);
    // From behind the shoulder, a short rise then the dive (lands at +18 ticks).
    const fx = this.c.x - this.c.fx * 0.4;
    const fz = this.c.z - this.c.fz * 0.4;
    this.autoSlot = this.pickAutoSlot();
    this.launch(HERO.auto + this.autoSlot, fx, 1.7, fz, target, T_AUTO_HIT, 0.9, 0.35, -1, 0.24, false);
    this.releaseFlash(0.5, 3, 1.0, 1);
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
    this.releaseFlash(0.6, 4, 1.8, 2);
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
    this.launch(HERO.k1 + j, this.v.x, this.v.y, this.v.z, target, 0.1, 1.0, 0.15, pierce, 0.26, j === 2);
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
    // The blade-light runs the whole line in 0.2 s (hit at +12 ticks): a wide sword-light beam sweeps out with it.
    const r = this.nextRibbon();
    this.ribbons.start(r, k.ax + k.jx, 0.9 + k.jy, k.az + k.jz, 0.42, this.pal.body[0] * 2.8, this.pal.body[1] * 2.8, this.pal.body[2] * 2.8, 1);
    this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    k.ribbon = r;
    k.ribbonOn = true;
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 1.5, 0.55, 1.0, 0.8, 0.02, 0.1, T_K2_HIT);
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 0.4, 0.5, 1.3, 0.5, 0.02, 0.08, T_K2_HIT);
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
        this.blades.tint(blade, 1, 1, 1);
      }
      g.blockT[j] = -1;
      const r = this.nextRibbon();
      this.ribbons.start(r, x, y, z, 0.32, this.pal.body[0] * 2.4, this.pal.body[1] * 2.4, this.pal.body[2] * 2.4, 1);
      this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
      g.ribbon[j] = r;
    }
  }

  /** An enemy blow reaching the Hộ thân ring from (fromX, fromZ): the nearest blade parries. Returns false when no charge is left. */
  block(fromX: number, fromZ: number): boolean {
    const g = this.guard;
    if (!g.active || g.charges <= 0 || g.closeT >= 0) return false;
    this.host.caster(this.c);
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
    this.host.hitStop(30);
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
    this.ribbons.start(r, this.c.x, 1.0, this.c.z, 0.6, this.pal.body[0] * 2.2, this.pal.body[1] * 2.2, this.pal.body[2] * 2.2, 1);
    this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    d.ribbon = r;
    // Speed lines sweep along the path with the caster.
    const rx = -dz;
    const rz = dx;
    for (let i = 0; i < 4; i += 1) {
      const off = (i - 1.5) * 0.42;
      const y = 0.35 + this.rand.range(0, 1.3);
      this.beamAt(this.c.x + rx * off, y, this.c.z + rz * off, dx, 0, dz, 5.2, 0.16, 0.42, 0.8, 0.6, 0.55, 0.1, 0.2);
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
    // Cast again while it runs: the old belts' blades fade out where they stand before the new belts reuse
    // them (they jumped 3.5 m and turned 75° in one frame).
    const was = k.active;
    for (let i = 0; i < this.poolN; i += 1) this.k5Old[i] = was && this.bPres[POOL0 + i]! > 0 ? 1 : 0;
    k.active = true;
    k.t = 0;
    k.acc = 0;
    k.wave = 0;
    k.done = false;
    k.dissolved = false;
    k.x = tx;
    k.z = tz;
    this.k5DiveSet.fill(0);
    k.glow0 = this.sigSpiral.mesh.visible ? this.sigSpiral.uniforms.uGlow.value : 0;
    this.sigSpiral.place(tx, tz, 0);
    this.releaseFlash(1.1, 8, 3.2, 5);
    this.host.impulse(2, tx - this.c.x, tz - this.c.z);
    // Heaven opens over the array: a tall pillar of light and a shock across the zone.
    this.pillar(tx, tz, 13, 2.4, 0.55, 0.8);
    this.groundShockAt(tx, tz, 0.8, 6.8, 0.55, 0.75);
    this.shockAt(tx, 1.2, tz, 4.5, 0.4, 0.6);
    // Streams of sword-light from the caster into the array.
    this.host.hand(this.v);
    for (let i = 0; i < this.n(16); i += 1) {
      const ex = tx + this.rand.range(-3.5, 3.5) - this.v.x;
      const ey = 2.8 + this.rand.range(-0.4, 0.8) - (this.v.y + 0.4);
      const ez = tz + this.rand.range(-3, 3) - this.v.z;
      const sp = this.rand.range(0.26, 0.4);
      const l = Math.hypot(ex, ey, ez) || 1;
      const b = this.beams.spec.reset();
      b.x = this.v.x;
      b.y = this.v.y + 0.4;
      b.z = this.v.z;
      b.vx = ex / sp;
      b.vy = ey / sp;
      b.vz = ez / sp;
      b.dx = -ex / l;
      b.dy = -ey / l;
      b.dz = -ez / l;
      b.len0 = 0.6;
      b.len1 = 2.6;
      b.w0 = b.w1 = 0.24;
      b.life = sp;
      this.beamCol(b, 1.0, 0.75);
      b.fadeBase = 0.04;
      b.fadeTip = 0.85;
      this.beams.emit();
    }
  }

  // ── Shared pieces ────────────────────────────────────────────────────────

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
      this.col(s, this.pal.core, 0.8);
      this.spark.emit();
    }
  }

  private nextRibbon(): number {
    const r = this.ribbonCursor;
    this.ribbonCursor = (this.ribbonCursor + 1) % RIBBONS;
    return r;
  }

  private launch(blade: number, fx: number, fy: number, fz: number, target: number, dur: number, power: number, arc: number, pierce: number, width: number, big: boolean): void {
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
    this.ribbons.start(f.ribbon, fx, fy, fz, width, this.pal.body[0] * 2.6, this.pal.body[1] * 2.6, this.pal.body[2] * 2.6, 1, Math.min(0.1, dur * 0.5));
    this.ribbons.setRim(f.ribbon, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    this.bladeTint(blade, 1.8);
  }

  /**
   * A full hit at `at`: core star, a crossing glint, halo, shock ring, sparks
   * along the blow, ink splash and stain; `big` adds a light pillar and a
   * ground shock. Layers start on the same frame at full brightness and fall
   * off at different rates (the star in 6 frames, the ring in 12, the ink last).
   */
  private impact(at: THREE.Vector3, scale: number, dx: number, dz: number, power: number, big: boolean): void {
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
    const n = this.n(5 + 10 * power);
    for (let i = 0; i < n; i += 1) {
      const s = this.spark.spec.reset();
      s.x = at.x;
      s.y = at.y;
      s.z = at.z;
      const a = Math.atan2(dz, dx) + this.rand.range(-1.2, 1.2);
      const sp = this.rand.range(5, 12) * (0.6 + 0.6 * power);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(1, 6);
      s.gravity = -12;
      s.drag = 2.5;
      s.life = this.rand.range(0.18, 0.36);
      s.size0 = 0.11;
      s.size1 = 0.05;
      s.stretch = 0.05;
      this.col(s, this.pal.core, 0.8);
      this.spark.emit();
    }
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
  }

  /** A crescent cut across the blow (camera-facing; `rot` in screen radians). */
  private slashAt(at: THREE.Vector3, rot: number, size: number): void {
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
    if (T.hit(target, dx, dz, power, this.pal.flashHex)) this.death(this.v, dx, dz, T.radius(target));
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
    if (marked) {
      this.lightAcc -= 1;
      this.twinkle(this.u.x, this.u.y, this.u.z, 1.2, 0.1, 1);
    }
    for (let i = 0; i < this.n(2); i += 1) {
      const s = this.spark.spec.reset();
      s.x = this.u.x;
      s.y = this.u.y;
      s.z = this.u.z;
      const a = Math.atan2(dz, dx) + this.rand.range(-0.9, 0.9);
      const sp = this.rand.range(5, 9);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(1, 4);
      s.gravity = -12;
      s.drag = 2.5;
      s.life = this.rand.range(0.16, 0.28);
      s.size0 = 0.1;
      s.size1 = 0.05;
      s.stretch = 0.045;
      this.col(s, this.pal.core, 0.8);
      this.spark.emit();
    }
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
    if (T.hit(target, dx, dz, power, this.pal.flashHex)) this.death(this.u, dx, dz, T.radius(target));
  }

  /** The area's one burst, sized by √N of the beasts it hit. */
  private burstAt(x: number, y: number, z: number, beasts: number, scale: number): void {
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
    this.glow.emit();
    this.shockAt(x, y, z, 1.6 * k, 0.26, 0.8);
    this.sparkBurst(x, y, z, Math.min(20, this.n(2 * beasts + 6)), 1.0);
  }

  private death(at: THREE.Vector3, dx: number, dz: number, radius: number): void {
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
   * Light along every visible blade (one-frame cards, so hit-stop never piles
   * them up): a soft coloured halo and a thin HDR core line, so steel reads as
   * sword-light at play-camera size (~1 m = 23 px at 720p). Low: the halo
   * only (one card a blade; bloom is off there, so the core would not glow).
   * The cards follow each blade's presence and glow share (bCard), so the
   * light eases in and out with the blade instead of popping.
   */
  private emitBladeGlows(): void {
    const B = this.blades;
    const rim = this.pal.rim;
    const core = this.pal.core;
    for (let i = 0; i < BLADE_CAP; i += 1) {
      const q = this.bCard[i]!;
      if (q <= 0.002 || !B.isVisible(i)) continue;
      const hero = i < POOL0;
      const h = this.glow.spec.reset();
      h.x = B.cx[i]!;
      h.y = B.cy[i]!;
      h.z = B.cz[i]!;
      h.vx = B.tx[i]!;
      h.vy = B.ty[i]!;
      h.vz = B.tz[i]!;
      h.stretch = B.len[i]! * 2.0;
      h.life = -1;
      h.size0 = h.size1 = (hero ? 1.0 : 0.6) * q;
      h.r = rim[0];
      h.g = rim[1];
      h.b = rim[2];
      h.a = (hero ? 0.9 : 0.5) * q;
      this.glow.emit();
      if (this.lite) continue;
      const s = this.bladeGlow.spec.reset();
      s.x = B.cx[i]!;
      s.y = B.cy[i]!;
      s.z = B.cz[i]!;
      s.vx = B.tx[i]!;
      s.vy = B.ty[i]!;
      s.vz = B.tz[i]!;
      s.stretch = B.len[i]! * 0.9;
      s.life = -1;
      // trace_06 shows ~12 % of the card's width: a thin core that blooms.
      s.size0 = s.size1 = (hero ? 0.5 : 0.36) * q;
      const k = (hero ? 0.75 : 0.5) * q;
      s.r = core[0] * k;
      s.g = core[1] * k;
      s.b = core[2] * k;
      s.a = 1;
      this.bladeGlow.emit();
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
    this.updateDash(dt);
    this.host.caster(this.c);
    this.updateReveal(dt);
    this.updateCharge(dt);
    this.updateAura(dt);
    this.updateFlights(dt);
    this.updateK1(dt);
    this.updateK2(dt);
    this.updateGuard(dt);
    this.updateK4(realDt);
    this.updateK5(dt);
    this.updateHalo(dt);
    this.updateEmitters(dt);
    this.settleBlades(dt);
    this.emitBladeGlows();
    for (const p of this.pools) p.update(dt);
    this.beams.update(dt);
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

  /** True while the slot's last cast still runs (and owns its sigil). */
  private running(slot: KiemSlot): boolean {
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
  private sigilFree(slot: KiemSlot, sig: GroundSigil): boolean {
    if (this.running(slot)) return false;
    if (!sig.mesh.visible) {
      this.chargeAge[slot] = 0;
      this.reveal[slot] = 0;
    }
    return true;
  }

  /** After the release a skill's sigil finishes drawing fast but not in one frame (the last key's share eases in). */
  private revealAfterCast(slot: KiemSlot, dt: number): number {
    const v = approach(this.reveal[slot], 1, REVEAL_HALF_S * 0.5, dt);
    this.reveal[slot] = v;
    return v;
  }

  private updateAura(dt: number): void {
    let p = -1;
    let big = 0;
    const ch = this.charge;
    if (ch.k1 > p) p = ch.k1;
    if (ch.k2 > p) p = ch.k2;
    if (ch.guard > p) p = ch.guard;
    if (ch.dash > p) p = ch.dash;
    if (ch.k4 > p) p = ch.k4;
    if (ch.k5 >= 0 && ch.k5 >= p) {
      p = ch.k5;
      big = 1;
    }
    if (p >= 0) this.auraP += (p - this.auraP) * (1 - Math.exp(-14 * dt));
    else this.auraP = Math.max(0, this.auraP - dt * 2.2);
    // The ultimate's size eases back when idle too, so the next skill's aura does not start at ×1.5 (appendix B #25).
    this.auraBig += (big - this.auraBig) * (1 - Math.exp(-10 * dt));
    // The blaze rises to its goal in a few frames (half-life 35 ms) and falls with it: a key or a release
    // brightens the seal at once without a one-frame step.
    this.blazeGoal = Math.max(0, this.blazeGoal - dt * 4.5);
    this.blaze = this.blaze < this.blazeGoal ? approach(this.blaze, this.blazeGoal, 0.035, dt) : this.blazeGoal;
    const a = this.auraP;
    // Layers keyed to the aura ease in and out with it (smoothstep on its first 30 %), never pop at the first key or the end.
    const vis = smooth01(a / 0.3);
    const seal = this.sigSeal;
    const scale = 1 + 0.5 * this.auraBig;
    if (a <= 0.01 && this.blaze <= 0.01) {
      seal.hide();
      this.sealFade = 0;
    } else {
      seal.place(this.c.x, this.c.z, 0);
      seal.mesh.scale.set(scale, scale, 1);
      // The ring draws round with the word and closes after the release, eased both ways: a new word's first
      // key used to cut a closed ring back to the aura's level in one frame. A seal coming up from hidden
      // starts where the word is.
      const rGoal = p >= 0 ? Math.max(0.08, a) : 1;
      const ru = seal.uniforms.uReveal;
      ru.value = this.sealFade <= 0 ? rGoal : approach(ru.value, rGoal, rGoal >= ru.value ? REVEAL_HALF_S * 0.5 : REVEAL_HALF_S, dt);
      seal.uniforms.uGlow.value = 0.55 + 0.9 * a + this.blaze;
      seal.uniforms.uInk.value = 0.55 * Math.min(1, a * 2);
      // The fade follows the aura and the blaze down at once but rises over SEAL_IN_S at most: with no word
      // typed before it, a release's blaze lit the seal from nothing to 35 % in one frame, its glow with it.
      const goal = Math.min(1, a * 3 + this.blaze);
      this.sealFade = goal <= this.sealFade ? goal : Math.min(goal, this.sealFade + dt / SEAL_IN_S);
      seal.uniforms.uFade.value = this.sealFade;
      seal.uniforms.uCount.value = 1;
    }
    if (a <= 0.01) return;
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
    this.host.hand(this.v);
    this.gatherAcc += (8 + 34 * a) * scale * this.dens * dt;
    while (this.gatherAcc >= 1) {
      this.gatherAcc -= 1;
      const ang = this.rand.range(0, Math.PI * 2);
      const d = this.rand.range(2.0, 3.2) * scale;
      const sx = this.v.x + Math.cos(ang) * d;
      const sy = this.v.y + this.rand.range(-0.7, 1.6);
      const sz = this.v.z + Math.sin(ang) * d;
      const life = this.rand.range(0.2, 0.3);
      const s = this.spark.spec.reset();
      s.x = sx;
      s.y = Math.max(0.1, sy);
      s.z = sz;
      s.vx = (this.v.x - sx) / life;
      s.vy = (this.v.y - s.y) / life;
      s.vz = (this.v.z - sz) / life;
      s.life = life;
      s.size0 = 0.07;
      s.size1 = 0.1;
      s.stretch = 0.035;
      this.col(s, this.pal.core, 0.6);
      this.spark.emit();
    }
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
      while (e.acc >= 1) {
        e.acc -= 1;
        this.riseMote(e.x, e.y, e.z, e.r, 0.08);
      }
    }
  }

  /** A sigil whose word was given up fades out over 0.25 s instead of vanishing. */
  private fadeOutSigil(sig: GroundSigil, dt: number): void {
    if (!sig.mesh.visible) return;
    const f = sig.uniforms.uFade.value - dt / 0.25;
    if (f <= 0) sig.hide();
    else sig.uniforms.uFade.value = f;
  }

  /** Where Ngự Kiếm's waiting blades aim: the beast the next blade will fly at, else the cast point. */
  private k1AimAt(): void {
    const T = this.host.targets;
    const t = T.nearest(this.c.x, this.c.z, 12);
    if (t >= 0) this.k1Aim.set(T.x(t), T.midY(t), T.z(t));
    else this.k1Aim.set(this.k1.tx, 1.0, this.k1.tz);
  }

  private updateCharge(dt: number): void {
    const bob = Math.sin(this.time * 3.1) * 0.04;
    const rv = this.reveal;
    // K1: three blades behind the shoulders, each scaling in at its key. Once the word is cast the waiting
    // blades turn (damped, half-life 0.06 s) to aim at their beast, so each flies off along the way it points.
    const p1 = this.charge.k1;
    const k1 = this.k1;
    if (p1 >= 0 || (k1.active && k1.launched < 3)) {
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
        const lean = j === 0 ? -0.35 : j === 2 ? 0.35 : 0;
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
        this.show(HERO.k1 + j, cx - dx * L * 0.5, cy - dy * L * 0.5, cz - dz * L * 0.5, dx, dy, dz, 1.35);
        this.bladeTint(HERO.k1 + j, 1.3 + 0.5 * Math.max(0, p1));
      }
    }
    // K2: the line reveals along the ground with the word (eased, soft front); the blade lies along it at the hand.
    const p2 = this.charge.k2;
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
      this.fadeOutSigil(this.sigLine, dt);
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
      this.fadeOutSigil(this.sigArcs, dt);
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
      this.fadeOutSigil(this.sigArrow, dt);
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
      this.fadeOutSigil(this.sigHex, dt);
    }
    // Thiên Hà Kiếm Vũ: the three belts draw on the ground, the zone darkens and qi rises off it (the halo of
    // blades behind the caster: updateHalo).
    const p5 = this.charge.k5;
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
      this.fadeOutSigil(sp, dt);
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
        this.show(f.blade, f.tx - f.ldx * back, f.ty - f.ldy * back, f.tz - f.ldz * back, f.ldx, f.ldy, f.ldz, 1.3 * (1 - fold), false, 1 - fold);
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
      this.show(f.blade, x, y, z, dx, dy, dz, 1.3);
      this.ribbons.push(f.ribbon, x, y, z);
      if (u < 1) {
        // A glint riding the tip (turning steadily, not a random angle a frame) and sparkle shed along the path.
        this.twinkle(x + dx * 1.3, y + dy * 1.3, z + dz * 1.3, 0.75, -1, 0.9, this.time * 2.5 + f.blade);
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
        f.hit = 0;
        this.bladeTint(f.blade, 2.6);
        this.ribbons.stop(f.ribbon, 0.18);
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
        this.flareAt(this.v.x, this.v.y, this.v.z, 0.1, 0.6, 0.85);
        this.twinkle(this.v.x, this.v.y, this.v.z, 1.3, 0.14, 1);
        this.shockAt(this.v.x, this.v.y, this.v.z, 0.9, 0.18, 0.75);
        this.rays(this.v.x, this.v.y, this.v.z, this.n(5), 1.1, 0.1, 0.13, 0.5);
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
      this.ribbons.push(k.ribbon, hx, hy, hz);
      if (k.t >= travel) {
        this.ribbons.stop(k.ribbon, 0.18);
        k.ribbonOn = false;
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
    // Light on the line: ignites over 60 ms at the release, holds to the hit, then cools into an ink slit.
    this.sigLine.uniforms.uReveal.value = easeOutQuad(this.revealAfterCast("k2", dt));
    const ignite = k.glow0 + (2.2 - k.glow0) * smooth01(k.t / 0.06);
    const glow = k.t < T_K2_HIT ? ignite : 2.2 * (1 - clamp01((k.t - T_K2_HIT) / 0.5));
    this.sigLine.uniforms.uGlow.value = Math.max(0, glow);
    this.sigLine.uniforms.uInk.value = 0.2 + 0.65 * clamp01(k.t / 0.25);
    this.sigLine.uniforms.uFade.value = smooth01((this.chargeAge.k2 + k.t) / SIGIL_IN_S) * (1 - clamp01((k.t - 0.9) / 0.5));
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
      this.host.hitStop(30);
      for (let i = 1; i <= 3; i += 1) {
        const t = i / 4;
        this.aftermath(k.ax + (k.bx - k.ax) * t, k.az + (k.bz - k.az) * t, 1.2, 1.0, 14);
      }
    }
    if (k.t > 1.5) {
      k.active = false;
      this.sigLine.hide();
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
    g.spin += dt * 2.3;
    const life = 5;
    // Open, hold, close: the barrier eases in over GUARD_OPEN_S and out over GUARD_CLOSE_S, at the end of its
    // life or as soon as its last charge is spent (it used to switch off at full light then, appendix B #14).
    let settled = true;
    for (let j = 0; j < 3; j += 1) if (g.blockT[j]! >= 0 && g.blockT[j]! <= GUARD_BREAK_S + 0.25) settled = false;
    if (g.closeT < 0 && (g.t >= life - GUARD_CLOSE_S || (g.charges <= 0 && g.t > 0.5 && settled))) {
      g.closeT = 0;
      // The blades still orbiting break into light as they shrink away.
      for (let j = 0; j < 3; j += 1) {
        if (g.blockT[j]! >= 0) continue;
        this.ribbons.stop(g.ribbon[j]!, GUARD_CLOSE_S * 0.6);
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
    const fade = g.closeT < 0 ? 1 : 1 - smooth01(g.closeT / GUARD_CLOSE_S);
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
      const x = this.c.x + Math.cos(a) * 2.0;
      const z = this.c.z + Math.sin(a) * 2.0;
      const y = 1.0 + (1 - arrive) * 4 + Math.sin(this.time * 2 + j) * 0.05;
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
    sh.size0 = sh.size1 = 2.25 / R_SHOCK;
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
      tw.size0 = tw.size1 = 2.0 / R_TWIRL;
      tw.rot = -g.spin;
      this.col(tw, this.pal.rim, 1);
      tw.a = 0.55 * lay;
      this.twirl.emit();
    }
    // A spent charge's arc dims over ~0.1 s (the shader lights a fractional arc), not in one frame.
    g.shownCharges = approach(g.shownCharges, g.charges, 0.04, dt);
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.uniforms.uReveal.value = this.revealAfterCast("guard", dt);
    this.sigArcs.uniforms.uCount.value = g.shownCharges;
    this.sigArcs.uniforms.uGlow.value = 1.0 + 0.3 * Math.sin(this.time * 4) * open;
    this.sigArcs.uniforms.uInk.value = 0.35;
    this.sigArcs.uniforms.uFade.value = fade * smooth01((this.chargeAge.guard + g.t) / SIGIL_IN_S);
    if (g.closeT >= GUARD_CLOSE_S) {
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
      // Afterimages: bodies of light left along the path.
      while (d.ghosts < 5 && d.t >= d.ghosts * 0.04) {
        const s = this.glow.spec.reset();
        s.x = x;
        s.y = 0.95;
        s.z = z;
        s.life = 0.4;
        s.size0 = 2.4;
        s.size1 = 2.5;
        s.aspect = 0.34;
        this.col(s, this.pal.rim, 1);
        s.a = 0.75;
        this.glow.emit();
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
    }
    // The arrow ignites over 60 ms at the release, cools after the arrival and fades.
    this.sigArrow.uniforms.uReveal.value = this.revealAfterCast("dash", dt);
    const ignite = d.glow0 + (1.6 - d.glow0) * smooth01(d.t / 0.06);
    this.sigArrow.uniforms.uGlow.value = d.t < DASH_S ? ignite : 1.6 * (1 - clamp01((d.t - DASH_S) / 0.3));
    this.sigArrow.uniforms.uInk.value = 0.25 + 0.35 * smooth01(d.t / 0.1);
    // Its fade-in carries on from the word (typed fast, it may not be done), then it fades out after 0.6 s.
    this.sigArrow.uniforms.uFade.value = smooth01((this.chargeAge.dash + d.t) / SIGIL_IN_S) * (1 - clamp01((d.t - 0.6) / 0.4));
    if (d.t > 1.0) {
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
      this.show(B + j, this.w.x, y + (1 - out) * 3, this.w.z, -ix, -1, -iz, 1.7 * out, true, out);
      this.bladeTint(B + j, 1.6 + 0.6 * pulse(clamp01((k.t - T_K4_OPEN) / 0.3)));
      if (fall < 1) this.beamAt(this.w.x, y, this.w.z, 0, 1, 0, 1.0 + 3.2 * (1 - fall), 0.42, -1, 0.7, 0.75, 0.05, 0.8, 0);
      else if (hold > 0.002) {
        // The array's columns of light breathe at the corners while it holds.
        const breathe = (0.75 + 0.25 * Math.sin(this.time * 5 + j)) * hold;
        this.beamAt(this.w.x, 0.02, this.w.z, 0, 1, 0, 3.4, 0.8, -1, 0.45 * breathe, 0.75 * breathe, 0.02, 0.7, 0);
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
      this.host.hitStop(30);
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

  private updateK5(dt: number): void {
    const k = this.k5;
    if (!k.active) {
      return;
    }
    k.t += dt;
    const T = this.host.targets;
    const N = this.poolN;
    // One phase, accumulated on the CPU (fxkit GroundSigil.spin): the drawn arms and the blade belts share it,
    // and the speed change at the release no longer jumps the pattern (appendix B #3).
    this.sigSpiral.spin = approach(this.sigSpiral.spin, K5_SPIN_LIVE, K5_SPIN_HALF_S, dt);
    const phase = this.sigSpiral.phase;
    const spin = this.sigSpiral.spin;
    const lastHit = T_K5_HITS[2]!;
    const end = 1 - clamp01((k.t - lastHit - 0.6) / 0.8);
    // The sky dims over the array while it holds (a dark disc under the light).
    // A typed word darkened the zone already; a cast with no word eases it in with the sigil (a 7.2 m one-frame
    // card took no pool fade-in and popped on).
    this.darkDisc(k.x, k.z, 7.2, 0.5 * end * smooth01((this.chargeAge.k5 + k.t) / SIGIL_IN_S), -1);
    // Belts: blades ride the arms over the zone; one third of them dives at each hit tick as falling sword-light.
    for (let i = 0; i < N; i += 1) {
      const blade = POOL0 + i;
      const belt = i % 3;
      const phi = ((i * 0.61803) % 1 + 1) % 1;
      const wave = Math.floor((i / N) * 3);
      const hitT = T_K5_HITS[wave]!;
      const appear = clamp01((k.t - phi * 0.25) / 0.2);
      if (appear <= 0) continue;
      if (this.k5Old[i] === 1) {
        if (this.bPres[blade]! > 0) continue;
        this.k5Old[i] = 0;
      }
      // Presence ramps too (show's scale-in): a blade freed late by the old cast starts small, not at `appear`.
      const t0 = hitT - 0.16;
      const dive = clamp01((k.t - t0) / 0.16);
      let ph = phase;
      if (dive > 0) {
        if (this.k5DiveSet[wave] === 0) {
          // The phase when this wave began to dive (back-dated to the exact tick).
          this.k5DiveSet[wave] = 1;
          this.k5PhaseAt[wave] = phase - spin * (k.t - t0);
          this.k5SpinAt[wave] = spin;
        }
        // The belt's turn slows to a stop through the dive and stays fixed once planted (blades used to slide
        // round the ring after they stuck, appendix B #1).
        ph = this.k5PhaseAt[wave]! + this.k5SpinAt[wave]! * 0.16 * (dive - 0.5 * dive * dive);
      }
      this.k5Belt(phi, belt, ph);
      const bx = this.belt.x;
      const bz = this.belt.z;
      const psi = this.belt.psi;
      const by = 3.0 - 1.2 * phi + Math.sin(psi * 2 + k.t * 3) * 0.15;
      // Tangent of the motion (ψ decreasing), nose slightly down.
      const tx = Math.sin(psi);
      const tz = -Math.cos(psi);
      if (dive <= 0) {
        this.show(blade, bx, by, bz, tx, -0.25, tz, 1.0 * appear, true, appear);
        this.bladeTint(blade, 1.6);
        continue;
      }
      // Diving to the ground under its belt point, then stuck in it.
      const e = easeInCubic(dive);
      const y = by + (0.35 - by) * e;
      const out = 1 - clamp01((k.t - lastHit - 0.75) / 0.4);
      if (out <= 0) {
        this.drop(blade);
        continue;
      }
      // The nose turns from the orbit's tangent to straight down (smoothstep, ≤ ~14°/frame) and keeps a 2 % lean
      // along the tangent, so its roll stays defined (an exact −Y flipped the roll and flashed the steel, appendix B #13).
      const sd = smooth01(dive);
      const ddx = tx * (1 - 0.98 * sd);
      const ddy = -0.25 - 0.75 * sd;
      const ddz = tz * (1 - 0.98 * sd);
      this.show(blade, bx, y, bz, ddx, ddy, ddz, 1.0 * out * appear, true, out * appear);
      this.bladeTint(blade, 1.4 + 1.6 * pulse(clamp01((k.t - hitT) / 0.25)));
      if (dive < 1) {
        // The falling streak dims through the dive instead of vanishing on the planting frame (~100 at once).
        const sk = 1 - smooth01(dive);
        this.beamAt(bx, y, bz, 0, 1, 0, 0.8 + 3.2 * (1 - e) + 1.2 * e, 0.26, -1, 0.6 * sk, 0.65 * sk, 0.04, 0.85, 0);
      }
    }
    // Twinkles across the belts while the sky of swords turns.
    if (k.t < lastHit) {
      k.acc += K5_TWINKLE_RATE * this.dens * dt;
      while (k.acc >= 1) {
        k.acc -= 1;
        const phi = this.rand.next();
        this.k5Belt(phi, Math.floor(this.rand.next() * 3), phase);
        this.twinkle(this.belt.x, 2.6 - phi, this.belt.z, 0.7, 0.2, 0.8);
      }
    }
    // Waves.
    while (k.wave < 3 && k.t >= T_K5_HITS[k.wave]!) {
      const w = k.wave;
      const last = w === 2;
      k.wave += 1;
      // Where this wave's blades planted: the phase their dive froze at.
      const planted = this.k5DiveSet[w] === 1 ? this.k5PhaseAt[w]! + this.k5SpinAt[w]! * 0.08 : phase;
      // Batched ground strikes on the belts: a glint, a small shock ring and two sparks each.
      const strikes = this.n(18);
      for (let s = 0; s < strikes; s += 1) {
        const phi = this.rand.next();
        this.k5Belt(phi, s % 3, planted);
        const gx = this.belt.x;
        const gz = this.belt.z;
        this.twinkle(gx, 0.4, gz, 1.3, 0.12, 1);
        this.groundShockAt(gx, gz, 0.1, 0.9, 0.25, 0.6);
        this.sparkBurst(gx, 0.35, gz, this.n(2), 0.6);
      }
      const n = T.inCircle(k.x, k.z, 6, this.hits);
      for (let i = 0; i < n; i += 1) this.strikeLight(this.hits[i]!, k.x, k.z, last ? 1 : 0.5);
      this.burstAt(k.x, 1.2, k.z, n, last ? 1.6 : 1.1);
      this.ring(k.x, k.z, 0.8, last ? 7 : 5.5, last ? 0.5 : 0.36, last ? 0.85 : 0.6);
      this.groundShockAt(k.x, k.z, 0.6, last ? 7.2 : 5.8, last ? 0.55 : 0.4, last ? 0.85 : 0.65);
      this.shockAt(k.x, 1.2, k.z, last ? 5.5 : 3.2, last ? 0.4 : 0.26, 0.7);
      this.pillar(k.x, k.z, last ? 15 : 8.5, last ? 3.0 : 1.5, last ? 0.65 : 0.4, last ? 1 : 0.8);
      this.v.set(k.x, 1.2, k.z);
      this.host.flash(this.v, this.pal.flash, last ? 12 : 6);
      this.host.impulse(last ? 4 : 1.5, 0, -1);
      if (last) {
        this.host.hitStop(70);
        this.flareAt(k.x, 1.0, k.z, 0.14, 3.2, 4.2);
        this.rays(k.x, 0.8, k.z, this.n(18), 6, 0.4, 0.3, 0.3);
        this.aftermath(k.x, k.z, 5.5, 1.6, 60);
      }
    }
    // The belts on the ground glow with each wave and end as a dark ink tri-spiral.
    this.sigSpiral.uniforms.uReveal.value = this.revealAfterCast("k5", dt);
    // The belts' glow takes over from the typed sigil's over 0.1 s, then beats with the waves.
    const live = k.t < lastHit ? 1.0 + 0.7 * pulse(((k.t + 0.1) % 0.75) / 0.75) : 1.4 * (1 - clamp01((k.t - lastHit) / 0.5));
    this.sigSpiral.uniforms.uGlow.value = k.glow0 + (live - k.glow0) * smooth01(k.t / 0.1);
    this.sigSpiral.uniforms.uInk.value = 0.6 + 0.4 * clamp01((k.t - lastHit) / 0.3);
    this.sigSpiral.uniforms.uFade.value = smooth01((this.chargeAge.k5 + k.t) / SIGIL_IN_S) * (1 - clamp01((k.t - lastHit - 0.9) / 0.5));
    if (!k.dissolved && k.t > lastHit + 0.75) {
      // The stuck blades break into light.
      k.dissolved = true;
      for (let i = 0; i < N; i += 12) {
        if (!this.blades.isVisible(POOL0 + i)) continue;
        this.w.set(this.blades.cx[POOL0 + i]!, 0.5, this.blades.cz[POOL0 + i]!);
        this.burstMotes(this.w, this.n(3), 0.9);
      }
    }
    if (k.t > lastHit + 1.45) {
      k.active = false;
      for (let i = 0; i < N; i += 1) this.drop(POOL0 + i);
      this.sigSpiral.hide();
      this.sigSpiral.spin = 0;
    }
  }
}
