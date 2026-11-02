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
 */
import * as THREE from "three";
import { BladeSet, loadBladeGeometry } from "./blades";
import { BeamPool, clamp01, easeInCubic, easeOutCubic, easeOutQuad, GroundSigil, pulse, Rand, RibbonPool, SpritePool, type SpriteSpec } from "./fxkit";
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
const HERO = { k1: 0, k2: 3, guard: 4, k4: 7, auto: 13, halo: 16 } as const; // reserved hero blade slots
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
  fade: number; // > 0 while the blade fades after the hit
  sx: number;
  sy: number;
  sz: number;
  acc: number; // motes owed along the path (rate × dt)
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
  private chargeTarget = { x: 0, z: -8 };
  /** The caster's gathering aura: shown level, ultimate size, release blaze, spawn accumulators. */
  private auraP = 0;
  private auraBig = 0;
  private blaze = 0;
  private moteAcc = 0;
  private gatherAcc = 0;
  private zoneAcc = 0;

  // Running skills.
  private k1 = { active: false, t: 0, launched: 0, tx: 0, tz: 0 };
  private k2 = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, hit: false, ribbon: 0, acc: 0, sparks: 0 };
  private guard = { active: false, t: 0, charges: 0, spin: 0, blockT: [-1, -1, -1], blockX: [0, 0, 0], blockZ: [0, 0, 0], ribbon: [0, 0, 0] };
  private dash = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, ghosts: 0, ribbon: 0, arrived: false };
  private k4 = { active: false, t: 0, x: 0, z: 0, beats: 0, landed: false, closed: false };
  private k5 = { active: false, t: 0, x: 0, z: 0, wave: 0, done: false, dissolved: false, acc: 0 };

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
    this.groundDark = new SpritePool(48, tex.glow, "ink", "ground", 3, { crop: CROP_INK });
    this.groundInk = new SpritePool(160, tex.scorch, "ink", "ground", 4);
    this.groundGlow = new SpritePool(96, tex.glow, "add", "ground", 5, { crop: CROP_LIGHT });
    this.groundRing = new SpritePool(64, tex.ring, "add", "ground", 6, { crop: CROP_RING, cropFade: 0.97 });
    this.groundShock = new SpritePool(64, tex.shock, "add", "ground", 6);
    this.twirl = new SpritePool(32, tex.twirl, "add", "ground", 7);
    this.smoke = new SpritePool(240, tex.smoke, "ink", "camera", 8);
    this.splash = new SpritePool(160, tex.splash, "ink", "camera", 9);
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
      this.flights.push({ active: false, blade: 0, ribbon: 0, t: 0, dur: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, target: -1, pierce: -1, power: 0, big: false, fade: 0, sx: 0, sy: 0, sz: 0, acc: 0 });
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
    for (const f of this.flights) f.active = false;
    for (const e of this.emitters) e.active = false;
    for (let i = 0; i < RIBBONS; i += 1) this.ribbons.stop(i);
    for (const p of this.pools) p.clear();
    this.beams.clear();
    for (const s of this.sigils) s.hide();
    this.k1.active = this.k2.active = this.guard.active = this.dash.active = this.k4.active = this.k5.active = false;
    for (const k of Object.keys(this.charge) as KiemSlot[]) {
      this.charge[k] = -1;
      this.chargeShown[k] = 0;
    }
    this.auraP = this.auraBig = this.blaze = 0;
    this.moteAcc = this.gatherAcc = this.zoneAcc = this.lightAcc = 0;
    this.rand.reseed(1301);
  }

  // ── Typing → charge ──────────────────────────────────────────────────────

  /** Typing progress of the word on `slot` (0 first key … 1 last key); −1 cancels. `tx, tz`: where it will land. */
  setCharge(slot: KiemSlot, progress: number, tx = 0, tz = -8): void {
    const before = this.charge[slot];
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
    this.blaze = Math.max(this.blaze, 0.35 + 0.35 * p);
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
    // The caster's seal blazes for typed skills; the basic attack stays a plain flash.
    if (tier >= 2) this.blaze = Math.max(this.blaze, 0.9 + 0.35 * tier);
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
    this.launch(HERO.auto, fx, 1.7, fz, target, T_AUTO_HIT, 0.9, 0.35, -1, 0.24, false);
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
  }

  private k1Launch(j: number): void {
    const target = this.host.targets.nearest(this.c.x, this.c.z, 12);
    this.k1Socket(j, this.v);
    this.blades.hide(HERO.k1 + j);
    if (target < 0) {
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
    if (k.active) this.ribbons.stop(k.ribbon);
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
    this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
    this.sigLine.uniforms.uReveal.value = 1;
    this.releaseFlash(0.8, 5, 1.8, 3);
    this.host.impulse(1, dx, dz);
    // The blade-light runs the whole line in 0.2 s (hit at +12 ticks): a wide sword-light beam sweeps out with it.
    const r = this.nextRibbon();
    this.ribbons.start(r, k.ax, 0.9, k.az, 0.42, this.pal.body[0] * 2.8, this.pal.body[1] * 2.8, this.pal.body[2] * 2.8, 1);
    this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
    k.ribbon = r;
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 1.5, 0.55, 1.0, 0.8, 0.02, 0.1, T_K2_HIT);
    this.beamAt(k.ax, 0.9, k.az, dx, 0, dz, 14, 0.4, 0.5, 1.3, 0.5, 0.02, 0.08, T_K2_HIT);
  }

  private castGuard(): void {
    this.host.play("skill2");
    const g = this.guard;
    // Cast again while it runs: the old ribbons stop, or they would hang frozen round the caster.
    if (g.active) for (let j = 0; j < 3; j += 1) this.ribbons.stop(g.ribbon[j]!);
    g.active = true;
    g.t = 0;
    g.charges = 3;
    g.spin = 0;
    g.blockT[0] = g.blockT[1] = g.blockT[2] = -1;
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.uniforms.uReveal.value = 1;
    this.releaseFlash(0.7, 4, 2.4, 3);
    // The barrier rings out round the caster.
    this.shockAt(this.c.x, 1.0, this.c.z, 2.6, 0.32, 0.8);
    for (let j = 0; j < 3; j += 1) {
      this.blades.tint(HERO.guard + j, 1, 1, 1);
      const r = this.nextRibbon();
      const a = (j * Math.PI * 2) / 3;
      this.ribbons.start(r, this.c.x + Math.cos(a) * 2, 1.0 + 4, this.c.z + Math.sin(a) * 2, 0.32, this.pal.body[0] * 2.4, this.pal.body[1] * 2.4, this.pal.body[2] * 2.4, 1);
      this.ribbons.setRim(r, this.pal.rim[0], this.pal.rim[1], this.pal.rim[2]);
      g.ribbon[j] = r;
    }
  }

  /** An enemy blow reaching the Hộ thân ring from (fromX, fromZ): the nearest blade parries. Returns false when no charge is left. */
  block(fromX: number, fromZ: number): boolean {
    const g = this.guard;
    if (!g.active || g.charges <= 0) return false;
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
    d.bx = this.c.x + dx * 5;
    d.bz = this.c.z + dz * 5;
    d.dx = dx;
    d.dz = dz;
    this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, 5);
    this.sigArrow.uniforms.uReveal.value = 1;
    this.sigArrow.uniforms.uGlow.value = 1.6;
    this.sigArrow.uniforms.uInk.value = 0.5;
    this.sigArrow.uniforms.uFade.value = 1;
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
    k.active = true;
    k.t = 0;
    k.beats = 0;
    k.landed = false;
    k.closed = false;
    k.x = tx;
    k.z = tz;
    this.sigHex.place(tx, tz, 0);
    this.sigHex.uniforms.uReveal.value = 1;
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
    this.sigSpiral.place(tx, tz, 0);
    this.sigSpiral.uniforms.uReveal.value = 1;
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
    f.life = life;
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

  /** A four-point glint; life ≤ 0 is one frame. */
  private twinkle(x: number, y: number, z: number, size: number, life: number, k: number): void {
    const s = this.star.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = life;
    s.size0 = size * 1.5;
    s.size1 = size * 0.6;
    s.rot = this.rand.range(-0.4, 0.4);
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
    f.fade = 0;
    f.sx = fx;
    f.sy = fy;
    f.sz = fz;
    f.acc = 0;
    this.ribbons.start(f.ribbon, fx, fy, fz, width, this.pal.body[0] * 2.6, this.pal.body[1] * 2.6, this.pal.body[2] * 2.6, 1);
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
      s.fadeIn = 0.06;
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
   */
  private emitBladeGlows(): void {
    const B = this.blades;
    const rim = this.pal.rim;
    const core = this.pal.core;
    for (let i = 0; i < BLADE_CAP; i += 1) {
      if (!B.isVisible(i)) continue;
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
      h.size0 = h.size1 = hero ? 1.0 : 0.6;
      h.r = rim[0];
      h.g = rim[1];
      h.b = rim[2];
      h.a = hero ? 0.9 : 0.5;
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
      s.size0 = s.size1 = hero ? 0.5 : 0.36;
      const k = hero ? 0.75 : 0.5;
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
    this.host.caster(this.c);
    // Last frame's one-frame cards go before this frame's are emitted, so they never hold capacity.
    for (const p of this.pools) p.dropOneFrame();
    this.beams.dropOneFrame();
    for (const s of this.sigils) s.tick(dt);
    this.updateCharge(dt);
    this.updateAura(dt);
    this.updateFlights(dt);
    this.updateK1(dt);
    this.updateK2(dt);
    this.updateGuard(dt);
    this.updateDash(dt);
    this.updateK4(realDt);
    this.updateK5(dt);
    this.updateEmitters(dt);
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
    if (p >= 0) {
      this.auraP += (p - this.auraP) * Math.min(1, dt * 14);
      this.auraBig += (big - this.auraBig) * Math.min(1, dt * 10);
    } else {
      this.auraP = Math.max(0, this.auraP - dt * 2.2);
    }
    this.blaze = Math.max(0, this.blaze - dt * 4.5);
    const a = this.auraP;
    const seal = this.sigSeal;
    const scale = 1 + 0.5 * this.auraBig;
    // Low: the seal shows only while a word is typed (its blaze after the release is a layer Low drops).
    if ((a <= 0.01 && this.blaze <= 0.01) || (this.lite && p < 0)) {
      seal.hide();
    } else {
      seal.place(this.c.x, this.c.z, 0);
      seal.mesh.scale.set(scale, scale, 1);
      seal.uniforms.uReveal.value = p >= 0 ? Math.max(0.08, a) : 1;
      seal.uniforms.uGlow.value = 0.55 + 0.9 * a + this.blaze;
      seal.uniforms.uInk.value = 0.55 * Math.min(1, a * 2);
      seal.uniforms.uFade.value = Math.min(1, a * 3 + this.blaze);
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
      this.behindCaster(h2, x, z);
      this.aura.emit();
    }
    this.glowDisc(x, z, (0.9 + 0.9 * a) * scale, 0.3 + 0.4 * a, -1);
    this.darkDisc(x, z, (1.6 + 0.8 * a) * scale, 0.35 * a, -1);
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

  private updateCharge(dt: number): void {
    const bob = Math.sin(this.time * 3.1) * 0.04;
    // K1: three blades behind the shoulders, each appearing at its key.
    const p1 = this.charge.k1;
    if (p1 >= 0 || (this.k1.active && this.k1.launched < 3)) {
      for (let j = 0; j < 3; j += 1) {
        const th = K1_SHOW[j]!;
        const alive = this.k1.active ? j >= this.k1.launched : p1 >= th;
        if (!alive) continue;
        this.k1Socket(j, this.v);
        const lean = j === 0 ? -0.35 : j === 2 ? 0.35 : 0;
        const rx = -this.c.fz;
        const rz = this.c.fx;
        this.blades.set(HERO.k1 + j, this.v.x, this.v.y - 0.55 + bob, this.v.z, rx * lean - this.c.fx * 0.15, 1, rz * lean - this.c.fz * 0.15, 1.35);
        this.bladeTint(HERO.k1 + j, 1.3 + 0.5 * Math.max(0, p1));
      }
    } else if (!this.k1.active) {
      for (let j = 0; j < 3; j += 1) this.blades.hide(HERO.k1 + j);
    }
    // K2: the line reveals along the ground with the word; the blade lies along it at the hand.
    const p2 = this.charge.k2;
    if (p2 >= 0) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
      this.sigLine.uniforms.uReveal.value = easeOutQuad(p2);
      this.sigLine.uniforms.uGlow.value = 0.25 + 0.4 * p2;
      this.sigLine.uniforms.uInk.value = 0.2;
      this.sigLine.uniforms.uFade.value = 1;
      this.host.hand(this.v);
      this.blades.set(HERO.k2, this.v.x, this.v.y, this.v.z, dx, 0.05, dz, 1.5);
      this.bladeTint(HERO.k2, 1.2 + 1.2 * p2);
    } else if (!this.k2.active) {
      this.blades.hide(HERO.k2);
    }
    // Hộ thân: the three arcs draw themselves round the caster.
    const pg = this.charge.guard;
    if (pg >= 0) {
      this.sigArcs.place(this.c.x, this.c.z, 0);
      this.sigArcs.uniforms.uReveal.value = pg;
      this.sigArcs.uniforms.uGlow.value = 1.0;
      this.sigArcs.uniforms.uInk.value = 0.35;
      this.sigArcs.uniforms.uFade.value = 1;
      this.sigArcs.uniforms.uCount.value = 3;
    } else if (!this.guard.active) {
      this.sigArcs.hide();
    }
    // Thân pháp: the arrow of the dash.
    const pd = this.charge.dash;
    if (pd >= 0) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, 5);
      this.sigArrow.uniforms.uReveal.value = pd;
      this.sigArrow.uniforms.uGlow.value = 0.9;
      this.sigArrow.uniforms.uInk.value = 0.25;
      this.sigArrow.uniforms.uFade.value = 1;
    } else if (!this.dash.active) {
      this.sigArrow.hide();
    }
    // Lạc Kiếm Trận: the hexagon at the target, its corners lit one by one.
    const p4 = this.charge.k4;
    if (p4 >= 0) {
      this.sigHex.place(this.chargeTarget.x, this.chargeTarget.z, 0);
      this.sigHex.uniforms.uReveal.value = p4;
      this.sigHex.uniforms.uGlow.value = 0.9 + 0.3 * p4;
      this.sigHex.uniforms.uInk.value = 0.45;
      this.sigHex.uniforms.uFade.value = 1;
    } else if (!this.k4.active) {
      this.sigHex.hide();
    }
    // Thiên Hà Kiếm Vũ: the three belts draw on the ground, the zone darkens and qi rises off it; blades gather in a ring behind the caster.
    const p5 = this.charge.k5;
    if (p5 >= 0) {
      const tx = this.chargeTarget.x;
      const tz = this.chargeTarget.z;
      this.sigSpiral.place(tx, tz, 0);
      this.sigSpiral.uniforms.uReveal.value = p5;
      this.sigSpiral.uniforms.uGlow.value = 0.65 + 0.45 * p5;
      this.sigSpiral.uniforms.uInk.value = 0.6 * p5;
      this.sigSpiral.uniforms.uFade.value = 1;
      this.sigSpiral.uniforms.uCount.value = 0.35;
      this.darkDisc(tx, tz, 7.2, 0.45 * p5, -1);
      this.zoneAcc += (14 + 70 * p5) * this.dens * dt;
      while (this.zoneAcc >= 1) {
        this.zoneAcc -= 1;
        this.riseMote(tx, 0.1, tz, 6, 0.09);
      }
      const n = Math.round(HALO_N * p5);
      for (let i = 0; i < HALO_N; i += 1) {
        if (i >= n) {
          this.blades.hide(HERO.halo + i);
          continue;
        }
        const a = (i / HALO_N) * Math.PI * 2 + this.time * 0.9;
        const rx = -this.c.fz;
        const rz = this.c.fx;
        const ox = Math.cos(a) * 1.5;
        const oy = Math.sin(a) * 1.5;
        const x = this.c.x + rx * ox - this.c.fx * 0.7;
        const z = this.c.z + rz * ox - this.c.fz * 0.7;
        const y = 2.1 + oy;
        // Blades point outward from the ring's centre, like a mandorla of swords.
        this.blades.set(HERO.halo + i, x, y, z, rx * Math.cos(a), Math.sin(a), rz * Math.cos(a), 0.95);
        this.bladeTint(HERO.halo + i, 1.4 + 0.6 * p5);
      }
    } else if (!this.k5.active) {
      for (let i = 0; i < HALO_N; i += 1) this.blades.hide(HERO.halo + i);
    }
    void dt;
  }

  private updateFlights(dt: number): void {
    const T = this.host.targets;
    for (const f of this.flights) {
      if (!f.active) continue;
      if (f.fade > 0) {
        // After the hit: the blade stands a beat in the wound, then folds away.
        f.fade -= dt;
        const k = clamp01(f.fade / 0.22);
        if (k <= 0) {
          this.blades.hide(f.blade);
          this.ribbons.stop(f.ribbon);
          f.active = false;
          continue;
        }
        this.blades.set(f.blade, f.tx, f.ty, f.tz, f.tx - f.sx, -0.4, f.tz - f.sz, 1.25 * k + 0.05);
        this.ribbons.push(f.ribbon, f.tx, f.ty, f.tz);
        this.ribbons.setAlpha(f.ribbon, k);
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
      const dx = x - f.sx;
      const dy = y - f.sy;
      const dz = z - f.sz;
      if (dx * dx + dy * dy + dz * dz > 1e-8) this.blades.set(f.blade, x, y, z, dx, dy, dz, 1.3);
      this.ribbons.push(f.ribbon, x, y, z);
      if (u < 1) {
        // A glint riding the tip and sparkle shed along the path.
        const il = 1 / Math.max(Math.hypot(dx, dy, dz), 1e-4);
        this.twinkle(x + dx * il * 1.3, y + dy * il * 1.3, z + dz * il * 1.3, 0.75, -1, 0.9);
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
        f.fade = 0.22;
        this.bladeTint(f.blade, 2.6);
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
    const ribbon = k.ribbon;
    const u = clamp01(k.t / T_K2_HIT);
    const hx = k.ax + (k.bx - k.ax) * easeOutQuad(u);
    const hz = k.az + (k.bz - k.az) * easeOutQuad(u);
    if (k.t < T_K2_HIT + 0.02) {
      this.ribbons.push(ribbon, hx, 0.9, hz);
      this.blades.set(HERO.k2, hx, 0.9, hz, k.dx, 0, k.dz, 1.7);
      this.bladeTint(HERO.k2, 2.6);
      // The piercing tip: a blazing star; the air splits to both sides behind it.
      this.twinkle(hx + k.dx * 1.9, 0.9, hz + k.dz * 1.9, 2.0, -1, 1);
      k.acc += K2_SPLIT_RATE * this.dens * dt;
      while (k.acc >= 1) {
        k.acc -= 1;
        const side = k.sparks % 2 === 0 ? 1 : -1;
        k.sparks += 1;
        const s = this.spark.spec.reset();
        s.x = hx;
        s.y = 0.9 + this.rand.range(-0.3, 0.4);
        s.z = hz;
        const sp = this.rand.range(4, 9);
        s.vx = -k.dz * side * sp - k.dx * 2;
        s.vz = k.dx * side * sp - k.dz * 2;
        s.vy = this.rand.range(0, 3);
        s.drag = 3;
        s.life = this.rand.range(0.2, 0.35);
        s.size0 = 0.1;
        s.size1 = 0.04;
        s.stretch = 0.045;
        this.col(s, this.pal.core, 0.75);
        this.spark.emit();
      }
    }
    // Light on the line: peaks at release, then the line cools into an ink slit.
    const glow = k.t < T_K2_HIT ? 2.2 : 2.2 * (1 - clamp01((k.t - T_K2_HIT) / 0.5));
    this.sigLine.uniforms.uGlow.value = Math.max(0, glow);
    this.sigLine.uniforms.uInk.value = clamp01(k.t / 0.25) * 0.85;
    this.sigLine.uniforms.uFade.value = 1 - clamp01((k.t - 0.9) / 0.5);
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
    if (k.t > T_K2_HIT + 0.35) {
      this.blades.hide(HERO.k2);
      this.ribbons.stop(ribbon);
    }
    if (k.t > 1.5) {
      k.active = false;
      this.sigLine.hide();
    }
  }

  private updateGuard(dt: number): void {
    const g = this.guard;
    if (!g.active) return;
    g.t += dt;
    g.spin += dt * 2.3;
    const life = 5;
    // Arrival: the blades drop in from above in 0.15 s.
    const arrive = easeOutCubic(clamp01(g.t / 0.15));
    for (let j = 0; j < 3; j += 1) {
      const bt = g.blockT[j]!;
      if (bt >= 0) {
        g.blockT[j] = bt + dt;
        // The parrying blade snaps to the blow, flares, then breaks into motes.
        if (bt < 0.12) {
          const a = Math.atan2(g.blockZ[j]! - this.c.z, g.blockX[j]! - this.c.x);
          this.blades.set(HERO.guard + j, g.blockX[j]!, 1.0, g.blockZ[j]!, -Math.sin(a), 0.1, Math.cos(a), 1.4);
          this.bladeTint(HERO.guard + j, 3.2);
        } else if (this.blades.isVisible(HERO.guard + j)) {
          this.v.set(g.blockX[j]!, 1.0, g.blockZ[j]!);
          this.burstMotes(this.v, this.n(12), 1.2);
          this.blades.hide(HERO.guard + j);
          this.ribbons.stop(g.ribbon[j]!);
        }
        continue;
      }
      const a = g.spin + (j * Math.PI * 2) / 3;
      const x = this.c.x + Math.cos(a) * 2.0;
      const z = this.c.z + Math.sin(a) * 2.0;
      const y = 1.0 + (1 - arrive) * 4 + Math.sin(this.time * 2 + j) * 0.05;
      // Tip along the orbit's tangent, flat; a ribbon of light follows each blade round.
      this.blades.set(HERO.guard + j, x, y, z, -Math.sin(a), 0.0, Math.cos(a), 1.35);
      this.bladeTint(HERO.guard + j, 1.5);
      this.ribbons.push(g.ribbon[j]!, x - Math.sin(a) * 0.6, y, z + Math.cos(a) * 0.6);
    }
    const fade = 1 - clamp01((g.t - life + 0.4) / 0.4);
    // The barrier: a faint ring of light round the body, a ground glow and a turning crescent under the blades.
    const beat = 0.8 + 0.2 * Math.sin(this.time * 4);
    const sh = this.shock.spec.reset();
    sh.x = this.c.x;
    sh.y = 1.0;
    sh.z = this.c.z;
    sh.life = -1;
    sh.size0 = sh.size1 = 2.25 / R_SHOCK;
    this.col(sh, this.pal.rim, 1);
    sh.a = 0.22 * beat * fade;
    this.shock.emit();
    this.darkDisc(this.c.x, this.c.z, 2.7, 0.32 * fade, -1);
    this.glowDisc(this.c.x, this.c.z, 2.0, 0.28 * beat * fade, -1);
    if (!this.lite) {
      const tw = this.twirl.spec.reset();
      tw.x = this.c.x;
      tw.y = 0.06;
      tw.z = this.c.z;
      tw.life = -1;
      tw.size0 = tw.size1 = 2.0 / R_TWIRL;
      tw.rot = -g.spin;
      this.col(tw, this.pal.rim, 1);
      tw.a = 0.55 * fade;
      this.twirl.emit();
    }
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.uniforms.uCount.value = g.charges;
    this.sigArcs.uniforms.uGlow.value = 1.0 + 0.3 * Math.sin(this.time * 4);
    this.sigArcs.uniforms.uInk.value = 0.35;
    this.sigArcs.uniforms.uFade.value = fade;
    let settled = true;
    for (let j = 0; j < 3; j += 1) if (g.blockT[j]! >= 0 && g.blockT[j]! <= 0.4) settled = false;
    if (g.t > life || (g.charges <= 0 && g.t > 0.5 && settled)) {
      g.active = false;
      for (let j = 0; j < 3; j += 1) {
        this.ribbons.stop(g.ribbon[j]!);
        if (this.blades.isVisible(HERO.guard + j)) {
          const a = g.spin + (j * Math.PI * 2) / 3;
          this.v.set(this.c.x + Math.cos(a) * 2, 1, this.c.z + Math.sin(a) * 2);
          this.burstMotes(this.v, this.n(8), 0.8);
          this.twinkle(this.v.x, this.v.y, this.v.z, 1.0, 0.16, 1);
          this.blades.hide(HERO.guard + j);
        }
      }
      this.aftermath(this.c.x, this.c.z, 1.8, 0.8, 20);
      this.sigArcs.hide();
    }
  }

  private updateDash(dt: number): void {
    const d = this.dash;
    if (!d.active) return;
    d.t += dt;
    const ribbon = d.ribbon;
    const dur = 0.2;
    const u = easeOutCubic(clamp01(d.t / dur));
    const x = d.ax + (d.bx - d.ax) * u;
    const z = d.az + (d.bz - d.az) * u;
    if (d.t <= dur + 0.02) {
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
    if (!d.arrived && d.t > dur) {
      d.arrived = true;
      this.dust(d.bx, d.bz, this.n(5), 0.7);
      this.groundShockAt(d.bx, d.bz, 0.3, 1.8, 0.35, 0.75);
      this.host.hand(this.v);
      this.twinkle(this.v.x, this.v.y, this.v.z, 1.6, 0.14, 1);
      this.rays(d.bx, 0.9, d.bz, this.n(6), 1.3, 0.12, 0.15, 0.5);
      this.aftermath(d.bx, d.bz, 1.0, 0.7, 14);
    }
    this.sigArrow.uniforms.uGlow.value = 1.6 * (1 - clamp01((d.t - dur) / 0.3));
    this.sigArrow.uniforms.uInk.value = 0.6;
    this.sigArrow.uniforms.uFade.value = 1 - clamp01((d.t - 0.6) / 0.4);
    if (d.t > 0.45) this.ribbons.stop(ribbon);
    if (d.t > 1.0) {
      d.active = false;
      this.sigArrow.hide();
    }
  }

  private k4Corner(k: number, out: THREE.Vector3): THREE.Vector3 {
    const th = (k * Math.PI) / 3 + Math.PI / 6;
    return out.set(this.k4.x + Math.cos(th) * 3.55, 0, this.k4.z - Math.sin(th) * 3.55);
  }

  private updateK4(dt: number): void {
    const k = this.k4;
    if (!k.active) return;
    k.t += dt;
    const T = this.host.targets;
    const fall = clamp01(k.t / T_K4_OPEN);
    // Six blades fall onto the corners as streaks of sword-light and open the array at +12 ticks.
    for (let j = 0; j < 6; j += 1) {
      this.k4Corner(j, this.w);
      const y = 6 * (1 - easeInCubic(fall)) + 0.55;
      // Leaning inward once stuck.
      const ix = (k.x - this.w.x) * 0.12;
      const iz = (k.z - this.w.z) * 0.12;
      const out = 1 - clamp01((k.t - T_K4_LIFE) / 0.35);
      if (out <= 0) {
        this.blades.hide(HERO.k4 + j);
        continue;
      }
      this.blades.set(HERO.k4 + j, this.w.x, y + (1 - out) * 3, this.w.z, -ix, -1, -iz, 1.7 * out);
      this.bladeTint(HERO.k4 + j, 1.6 + 0.6 * pulse(clamp01((k.t - T_K4_OPEN) / 0.3)));
      if (fall < 1) this.beamAt(this.w.x, y, this.w.z, 0, 1, 0, 1.0 + 3.2 * (1 - fall), 0.42, -1, 0.7, 0.75, 0.05, 0.8, 0);
      else if (out > 0.5) {
        // The array's columns of light breathe at the corners while it holds.
        const breathe = 0.75 + 0.25 * Math.sin(this.time * 5 + j);
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
      this.sigHex.uniforms.uGlow.value = 1.9;
    }
    this.sigHex.uniforms.uGlow.value = Math.max(1.0, this.sigHex.uniforms.uGlow.value - dt * 3);
    this.sigHex.uniforms.uInk.value = 0.5;
    this.sigHex.uniforms.uFade.value = 1 - clamp01((k.t - T_K4_LIFE) / 0.6);
    if (k.t < T_K4_LIFE + 0.4) this.darkDisc(k.x, k.z, 4.2, 0.32 * (1 - clamp01((k.t - T_K4_LIFE) / 0.4)), -1);
    if (k.t >= T_K4_OPEN && k.t < T_K4_LIFE) {
      this.glowDisc(k.x, k.z, 3.0, 0.2, -1);
      // The formation's dome: a faint ring of light standing over the array.
      const d = this.shock.spec.reset();
      d.x = k.x;
      d.y = 1.2;
      d.z = k.z;
      d.life = -1;
      d.size0 = d.size1 = 3.8 / R_SHOCK;
      this.col(d, this.pal.rim, 1);
      d.a = 0.2 + 0.06 * Math.sin(this.time * 4);
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

  private updateK5(dt: number): void {
    const k = this.k5;
    if (!k.active) {
      return;
    }
    k.t += dt;
    const T = this.host.targets;
    const N = this.poolN;
    const rot = k.t * 1.1;
    const lastHit = T_K5_HITS[2]!;
    const end = 1 - clamp01((k.t - lastHit - 0.6) / 0.8);
    // The sky dims over the array while it holds (a dark disc under the light).
    this.darkDisc(k.x, k.z, 7.2, 0.5 * end, -1);
    // Belts: blades spiral over the zone, one third of them dives at each hit tick as falling sword-light.
    for (let i = 0; i < N; i += 1) {
      const blade = POOL0 + i;
      const belt = i % 3;
      const phi = ((i * 0.61803) % 1 + 1) % 1;
      const wave = Math.floor((i / N) * 3);
      const hitT = T_K5_HITS[wave]!;
      const appear = clamp01((k.t - phi * 0.25) / 0.2);
      if (appear <= 0) {
        this.blades.hide(blade);
        continue;
      }
      const th = phi * Math.PI * 2 * 0.95 + rot + (belt * Math.PI * 2) / 3;
      const r = 1.1 + 4.6 * phi;
      const bx = k.x + Math.cos(th) * r;
      const bz = k.z + Math.sin(th) * r;
      const by = 3.0 - 1.2 * phi + Math.sin(th * 2 + k.t * 3) * 0.15;
      const dive = clamp01((k.t - (hitT - 0.16)) / 0.16);
      if (dive <= 0) {
        // Tangent of the orbit, nose slightly down.
        this.blades.set(blade, bx, by, bz, -Math.sin(th), -0.25, Math.cos(th), 1.0 * appear);
        this.bladeTint(blade, 1.6);
        continue;
      }
      // Diving to the ground under its belt point, then stuck in it.
      const e = easeInCubic(dive);
      const y = by + (0.35 - by) * e;
      const out = 1 - clamp01((k.t - lastHit - 0.75) / 0.4);
      if (out <= 0) {
        this.blades.hide(blade);
        continue;
      }
      this.blades.set(blade, bx, y, bz, -Math.sin(th) * (1 - e) * 0.5, -1, Math.cos(th) * (1 - e) * 0.5, 1.0 * out);
      this.bladeTint(blade, 1.4 + 1.6 * pulse(clamp01((k.t - hitT) / 0.25)));
      if (dive < 1) this.beamAt(bx, y, bz, 0, 1, 0, 0.8 + 3.2 * (1 - e) + 1.2 * e, 0.26, -1, 0.6, 0.65, 0.04, 0.85, 0);
    }
    // Twinkles across the belts while the sky of swords turns.
    if (k.t < lastHit) {
      k.acc += K5_TWINKLE_RATE * this.dens * dt;
      while (k.acc >= 1) {
        k.acc -= 1;
        const phi = this.rand.next();
        const th = phi * Math.PI * 2 * 0.95 + rot + (Math.floor(this.rand.next() * 3) * Math.PI * 2) / 3;
        const r = 1.1 + 4.6 * phi;
        this.twinkle(k.x + Math.cos(th) * r, 2.6 - phi, k.z + Math.sin(th) * r, 0.7, 0.2, 0.8);
      }
    }
    // Waves.
    while (k.wave < 3 && k.t >= T_K5_HITS[k.wave]!) {
      const w = k.wave;
      const last = w === 2;
      k.wave += 1;
      // Batched ground strikes on the belts: a glint, a small shock ring and two sparks each.
      const strikes = this.n(18);
      for (let s = 0; s < strikes; s += 1) {
        const phi = this.rand.next();
        const belt = s % 3;
        const th = phi * Math.PI * 2 * 0.95 + rot + (belt * Math.PI * 2) / 3;
        const r = 1.1 + 4.6 * phi;
        const gx = k.x + Math.cos(th) * r;
        const gz = k.z + Math.sin(th) * r;
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
    this.sigSpiral.uniforms.uCount.value = 1.1;
    this.sigSpiral.uniforms.uGlow.value = k.t < lastHit ? 1.0 + 0.7 * pulse(((k.t + 0.1) % 0.75) / 0.75) : 1.4 * (1 - clamp01((k.t - lastHit) / 0.5));
    this.sigSpiral.uniforms.uInk.value = 0.6 + 0.4 * clamp01((k.t - lastHit) / 0.3);
    this.sigSpiral.uniforms.uFade.value = 1 - clamp01((k.t - lastHit - 0.9) / 0.5);
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
      for (let i = 0; i < N; i += 1) this.blades.hide(POOL0 + i);
      this.sigSpiral.hide();
    }
    // Hide the gathered halo once the belts take over.
    if (k.t < 0.3) {
      const out = 1 - k.t / 0.3;
      for (let i = 0; i < HALO_N; i += 1) {
        if (out <= 0.02) this.blades.hide(HERO.halo + i);
      }
    } else {
      for (let i = 0; i < HALO_N; i += 1) this.blades.hide(HERO.halo + i);
    }
  }
}
