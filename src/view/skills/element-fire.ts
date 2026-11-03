/**
 * Fire (canon D59, ELEMENT_LAYER §2): compress → burst. The Sword's shapes (key 1's Threefold Sword Command, key 7's
 * Myriad Swords; paths, counts and timing unchanged) drawn in fire, in all five phases (VFX_STANDARD §3), replacing
 * Metal's layers, never on top of them:
 * - charge: while a word is typed, flames spiral in and tighten into a tiny white-gold point at the hand (the
 *   compression lives in the charge: fire-charge scrubbed by the typing level), embers are sucked in from round the
 *   caster, the stone darkens under the feet; a blade arriving at its place ignites there;
 * - release: on the last key's frame a white-gold pinpoint and a pressure ring at the hand, an anime flame lotus
 *   (fire-burst, real alpha) bursting behind the caster, spark rays and embers (key 7's release bigger, with a scorch);
 * - travel: the real Clear Wind silhouette as a fire blade (sword-material.ts furnace: hot-iron body, molten
 *   white-gold edge, an orange heat band), wrapped in a flame sheath (Dragonhold's flame band in the heat-field mode,
 *   tapered to a soot tail) and trailing a flame ribbon (fxkit flame look), shedding embers;
 * - impact: a white-gold pinpoint, the fire-burst lotus at the beast (real alpha, solid on pale and dark stone),
 *   additive spark rays and heat-field embers; key 7's river strikes stay thin (pinpoint, sparks, embers) so the
 *   field-wide river never turns into flame soup, its lead blades take the lotus;
 * - aftermath: a scorch decal with a cooling ember edge, a low ground fire that burns out by erosion and dies into
 *   embers, a few dark smoke wisps (normal blend), embers rising for a while; key 7's finisher leaves a burning scar
 *   along its cut (scorch, a low flame line, ground fires, a molten seam);
 * - foe: the burn status (the beast's rim flickers amber, TargetField.status) and a white-gold hit silhouette (the
 *   lab's herd); death: an inner ignition, a collapsing flame, embers and ash;
 * - screen: a warm flash on big blows (ElementStage.accent → the host's screen-fx warm), the graphic impact frames
 *   in soot and amber; the shared heat-haze distortion pass is left for later (ELEMENT_LAYER §5 budget).
 * Colours (D54): white-gold → amber → vermilion-orange → dark soot; nothing uses the enemy's warning red #FF4A4A.
 * Fire bodies are real-alpha clips or heat-field shading with a soot edge (never brightness as alpha over the ground:
 * DRAGON_FIRE_DIAGNOSIS); only thin cores are HDR. No allocation per frame.
 */
import * as THREE from "three";
import type { AftermathArgs, ChargeFrameArgs, ChargeKeyArgs, CutArgs, DeathArgs, ElementHooks, ElementKit, GroundAftermath, ImpactArgs, LaunchArgs, ReleaseArgs, StreamGlintArgs, StreamPlantArgs, StreamSeamArgs, StreamSegmentArgs, StreamSlashArgs, StreamSparkArgs, StreamStrikeArgs, StreamTone, StreamTravelArgs, TravelArgs } from "./element-kit";
import { FlameSlash } from "./flame-slash";
import type { ElementStage } from "./element-stage";
import { ONE_FRAME, type FlipbookPool, type FlipOptions } from "./flipbook";
import type { EmberPool } from "./embers";
import type { BeamPool, SpritePool } from "./fxkit";
import { GroundDecalPool } from "./ground-decals";
import type { HeatRingPool } from "./heat-rings";
import { SWORD_LOOK } from "./sword-material";
import type { SwordSlot } from "./sword-skills";
import { glowOfRamp, type Rgb, type WeaponDef, type WeaponGlow } from "./weapons";

/** Linear RGB of an sRGB hex (load time). */
function lin(hex: string): Rgb {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const k3 = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** The fire ramp (linear): Gemini's white-gold core, amber, vermilion and violet-charcoal soot (heat field, 03/11). */
const CORE = lin("#FFF1C9");
const WHITE_GOLD = lin("#FFFDF0");
const AMBER = lin("#FFB703");
const ORANGE = lin("#FF8A2A");
const VERMILION = lin("#D93800");
const SOOT = lin("#240715");
/** Burnt stone: a warm char (hue ~32°, never a red-black), lighter at the char's edge (ground-decals.ts). */
const CHAR = lin("#2E2010");
/** Embers cool through amber and orange into a dim orange glow (its green ≥ 0.2 of its red: never dark red). */
const EMBER_HOT = lin("#FFD884");
const EMBER_ORANGE = lin("#FA8A26");
const EMBER_DIM = lin("#AC5A1C");
/** The white spark mask's tint (the fire-sparks atlas is white on black). */
const SPARK_TINT = new THREE.Color().setRGB(1, 0.5, 0.12);

/**
 * The seal, its rings and the pressure ring as matter (03/11 fixes: drawn as added light in the fire palette they read
 * pale pink-orange on light stone): vermilion strokes lit toward gold as they blaze, on a near-neutral charcoal
 * underlay (its fringe over pale stone must not tint it peach; a touch warm, so where the vermilion meets it on dark
 * stone the edge never reads dark red), a thin white-gold line down their middle.
 */
const SEAL_SOOT = lin("#17140F");
const SEAL_BODY = lin("#E0561A");
const SEAL_LIT = lin("#FFAE34");
const SEAL_CORE: Rgb = [1, 0.72, 0.3];
/** The flame slash's deep body: a vermilion kept off red (hue ~21°). */
const SLASH_DEEP = lin("#E8560E");

/** Folder of the kit's clips (art-src/lab/vfx/fire/manifest.json). */
const FOLDER = "fire";

/** Every slot burns in the same ramp; the ultimate a little more golden. Load time (glowOfRamp allocates). */
const FIRE_GLOW: WeaponGlow = glowOfRamp(["#FFF1C9", "#FF8A2A", "#C2361A"]);
const FIRE_GLOW_GOLD: WeaponGlow = glowOfRamp(["#FFF4D6", "#FFA53A", "#C2461A"]);
function firePalette(_def: WeaponDef, slot: SwordSlot): WeaponGlow {
  return slot === "k5" ? FIRE_GLOW_GOLD : FIRE_GLOW;
}

/** Key 7's light in fire: white-gold cores, amber-orange halos (≤ 0.9), a molten slash with a dark vermilion falloff. */
export const FIRE_STREAM: StreamTone = {
  core: [1, 0.74, 0.36],
  halo: [0.86, 0.27, 0.03],
  trailCore: [1.6, 0.9, 0.32],
  flash: "#ffb060",
  hitRgb: 0xf07020,
  cutRgb: 0xffa850,
  number: [1.0, 0.45, 0.08],
  slash: { white: [1.0, 0.7, 0.32], body: [0.72, 0.13, 0.008], bodyLit: [0.95, 0.34, 0.035], deep: [0.03, 0.005, 0.002] },
};

/**
 * The burnt ground a blow leaves (03/11 fixes: Kenney's black spiky scorch star read as an ink splat on pale stone):
 * the decal pool's procedural char, a soft irregular burn graded out into browned stone, ember cracks and a rim that
 * cool from gold to orange, eroding away (never fading).
 */
const SCORCH: GroundAftermath = { texture: null, life: 3.4, growIn: 0.06, erodeFrom: 0.5, body: CHAR, alpha: 0.6, heat: [1.6, 0.62, 0.12], cool: 0.85 };
const SCORCH_LINE: GroundAftermath = { ...SCORCH, life: 4.2, erodeFrom: 0.6, cool: 0.9 };

// ── The layers ───────────────────────────────────────────────────────────────

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const dir = new THREE.Vector3();
const camF = new THREE.Vector3();
const camW = new THREE.Vector3();
const opts: FlipOptions = {};

/** Resets the shared flip options to plain values (reused for every spawn, no allocation). */
function flip(): FlipOptions {
  const o = opts;
  o.life = o.rate = o.frame = o.until = o.rot = o.spin = o.grow = o.alpha = o.intensity = o.occlude = o.erode = undefined;
  o.vx = o.vy = o.vz = o.drag = o.gravity = o.ground = o.fadeIn = o.fadeOut = o.delay = o.cool = o.lift = undefined;
  o.tint = undefined;
  o.dir = undefined;
  o.span = undefined;
  return o;
}

/** Embers rising off a blow's ground for a while (the aftermath). */
interface Emitter {
  on: boolean;
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  rate: number;
  acc: number;
}

class FireLayers {
  private readonly burst: FlipbookPool;
  private readonly charge: FlipbookPool;
  private readonly sparks: FlipbookPool;
  /** Loose embers: thrown off blows, rising off the burnt ground, cooling white-gold → amber → a dim orange. */
  private readonly embers: EmberPool;
  private readonly ground: FlipbookPool;
  private readonly sheath: FlipbookPool;
  private readonly line: FlipbookPool;
  /** Ember dots, pinpoints and shed sparks (additive thin light). */
  private readonly motes: SpritePool;
  /** The release's pressure ring (matter on soot, a thin hot line). */
  private readonly rings: HeatRingPool;
  /** A cut's thin hot crescent. */
  private readonly slash: SpritePool;
  /** Dark smoke wisps and ash flakes (normal blend). */
  private readonly smoke: SpritePool;
  private readonly ash: SpritePool;
  /** The stone darkening under the caster while the word is typed. */
  private readonly groundInk: SpritePool;
  private readonly seams: BeamPool;
  /** Key 7's finisher as a flame (in place of the sword-qi slash) and the rings of fire round a pinned victim. */
  private readonly flameSlash: FlameSlash;
  private readonly groundRings: HeatRingPool;
  private slashAcc = 0;
  private readonly scorch: GroundDecalPool;
  private readonly emitters: Emitter[] = Array.from({ length: 24 }, () => ({ on: false, x: 0, z: 0, r: 0, t: 0, life: 0, rate: 0, acc: 0 }));
  private chargeAcc = 0;
  private shedAcc = 0;
  private waitAcc = 0;

  constructor(private readonly stage: ElementStage) {
    const P = stage.flipbooks;
    this.burst = P.pool(FOLDER, "fire-burst", { mode: "rgba", capacity: 48, renderOrder: 12 });
    this.charge = P.pool(FOLDER, "fire-charge", { mode: "rgba", capacity: 6, renderOrder: 13 });
    this.sparks = P.pool(FOLDER, "fire-sparks", { mode: "fire", capacity: 64, renderOrder: 14 });
    this.ground = P.pool(FOLDER, "fire-ground", { mode: "rgba", capacity: 32, renderOrder: 11 });
    this.sheath = P.pool(FOLDER, "dragonhold-flame-trail", { mode: "heat", capacity: 200, renderOrder: 11 });
    this.line = P.pool(FOLDER, "fire-trail", { mode: "rgba", capacity: 24, renderOrder: 11 });
    // Flames burn out toward warm char, not violet soot: a dying orange mixed toward violet passed through maroon.
    for (const p of [this.burst, this.charge, this.ground, this.line]) p.setSoot(CHAR[0] * 1.3, CHAR[1] * 1.3, CHAR[2] * 1.3);
    this.sheath.setHeatRamp(VERMILION, AMBER, WHITE_GOLD);
    this.sheath.setSoot(SOOT[0], SOOT[1], SOOT[2]);
    // The sheath cools from the blade toward its tail (a soot tail behind the sword), its band read soft.
    this.sheath.taper = 0.6;
    this.sheath.blur = 1.8;
    this.burst.softM = 0.3;
    this.ground.softM = 0.2;
    this.line.softM = 0.2;
    const T = stage.textures;
    this.groundInk = stage.pool(8, T.glow, "ink", "ground", 3, { crop: 0.64 });
    this.scorch = stage.decals(SCORCH.texture, 64, 4);
    this.smoke = stage.pool(96, stage.texture("smoke_07"), "ink", "camera", 9, { fadeIn: 0.15 });
    this.ash = stage.pool(160, T.splash, "ink", "camera", 9);
    this.rings = stage.heatRings(24, "camera", 14);
    this.rings.setLook(SEAL_SOOT, 0.8, SEAL_BODY, SEAL_LIT, SEAL_CORE);
    this.slash = stage.pool(32, T.slash, "add", "camera", 12);
    this.motes = stage.pool(900, T.glow, "add", "camera", 13, { crop: 0.6 });
    this.seams = stage.beams(24, 13);
    this.flameSlash = new FlameSlash(15);
    this.flameSlash.setRamp(CHAR, SLASH_DEEP, AMBER, WHITE_GOLD);
    stage.layer.add(this.flameSlash.mesh);
    this.groundRings = stage.heatRings(16, "ground", 6);
    this.groundRings.setLook(SEAL_SOOT, 0.7, SEAL_BODY, SEAL_LIT, SEAL_CORE);
    this.embers = stage.embers(1024, 13);
    this.embers.setRamp(EMBER_HOT, AMBER, EMBER_ORANGE, EMBER_DIM);
  }

  // ── Small emitters ─────────────────────────────────────────────────────────

  /** A hot dot: `c` × `k` (HDR when k > 1), `size` m, `life` s (≤ 0: this frame only). */
  private dot(x: number, y: number, z: number, size0: number, size1: number, life: number, c: Rgb, k: number, vx = 0, vy = 0, vz = 0): void {
    const s = this.motes.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.life = life;
    s.size0 = size0;
    s.size1 = size1;
    s.r = c[0] * k;
    s.g = c[1] * k;
    s.b = c[2] * k;
    this.motes.emit();
  }

  /** An ember thrown off (x, y, z) at speed `sp` round the ground direction (dx, dz), arcing down. */
  private ember(x: number, y: number, z: number, dx: number, dz: number, sp: number, spread: number): void {
    const R = this.stage.rand;
    const a = Math.atan2(dz, dx) + R.range(-spread, spread);
    const s = this.motes.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    const q = sp * R.range(0.5, 1);
    s.vx = Math.cos(a) * q;
    s.vz = Math.sin(a) * q;
    s.vy = R.range(1.5, 4.5);
    s.gravity = -7;
    s.drag = 1.6;
    s.stretch = 0.03;
    s.life = R.range(0.35, 0.7);
    s.size0 = R.range(0.1, 0.16);
    s.size1 = 0.03;
    const hot = R.next() < 0.4;
    const c = hot ? CORE : AMBER;
    const k = hot ? 2.4 : 1.8;
    s.r = c[0] * k;
    s.g = c[1] * k;
    s.b = c[2] * k;
    this.motes.emit();
  }

  /** The anime flame lotus (fire-burst, real alpha) rooted on the ground at (x, z), `size` m tall. */
  private lotus(x: number, z: number, size: number, rate: number, first: number, lift: number, delay = 0): void {
    const o = flip();
    o.rate = rate;
    o.frame = first;
    o.cool = 0.55;
    o.ground = 0;
    o.lift = lift;
    o.rot = 0;
    if (delay > 0) o.delay = delay;
    this.burst.spawn(v.set(x, 0, z), size, o);
  }

  private sparkRays(x: number, y: number, z: number, size: number, k: number): void {
    const o = flip();
    o.rate = 1.2;
    o.rot = this.stage.rand.range(0, Math.PI * 2);
    o.occlude = 0;
    o.tint = SPARK_TINT;
    o.intensity = k;
    this.sparks.spawn(v.set(x, y, z), size, o);
  }

  /**
   * A burst of loose embers off a blow at (x, y, z): `size` m across (their count and speed grow with it), born at
   * `heat` (1 white-gold, 0.7 amber), thrown out and up, then carried up by the hot air while they cool and shrink.
   */
  private emberBurst(x: number, y: number, z: number, size: number, heat: number, delay = 0): void {
    const R = this.stage.rand;
    const n = this.stage.n(Math.round(8 + 9 * size));
    for (let i = 0; i < n; i += 1) {
      const s = this.embers.reset();
      const a = R.range(0, Math.PI * 2);
      const q = R.next();
      const r = size * 0.18 * Math.sqrt(R.next());
      s.x = x + Math.cos(a) * r;
      s.y = y + R.range(-0.15, 0.2) * size;
      s.z = z + Math.sin(a) * r;
      const sp = (1.2 + 3.2 * q) * (0.55 + 0.45 * size);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = R.range(0.8, 3.2) * (0.6 + 0.4 * size);
      s.drag = R.range(2.2, 3.4);
      s.rise = R.range(0.8, 1.6);
      s.sway = R.range(0.08, 0.3);
      s.life = R.range(0.7, 1.6);
      // Mostly small specks, a few bigger (0.08–0.35 m); the fastest are the hottest.
      s.size = 0.08 + 0.2 * Math.pow(R.next(), 3);
      s.heat = heat * R.range(0.8, 1.12) * (0.85 + 0.25 * q);
      s.flicker = R.range(0.25, 0.5);
      s.delay = delay + R.range(0, 0.06);
      this.embers.emit();
    }
  }

  /** `n` embers rising off burnt ground at (x, z) within `r` m (a fire dying, or the scorch still hot). */
  private risingEmbers(x: number, z: number, r: number, n: number, heat: number, delay: number): void {
    const R = this.stage.rand;
    for (let i = 0; i < n; i += 1) {
      const s = this.embers.reset();
      const a = R.range(0, Math.PI * 2);
      const d = r * Math.sqrt(R.next());
      s.x = x + Math.cos(a) * d;
      s.y = R.range(0.05, 0.3);
      s.z = z + Math.sin(a) * d;
      s.vx = R.range(-0.3, 0.3);
      s.vy = R.range(0.5, 1.4);
      s.vz = R.range(-0.3, 0.3);
      s.drag = 1.2;
      s.rise = R.range(0.6, 1.2);
      s.sway = R.range(0.12, 0.35);
      s.life = R.range(1.0, 1.9);
      s.size = 0.07 + 0.13 * Math.pow(R.next(), 2.5);
      s.heat = heat * R.range(0.8, 1.1);
      s.flicker = R.range(0.3, 0.55);
      s.delay = delay + R.range(0, 0.5);
      this.embers.emit();
    }
  }

  private wisp(x: number, z: number, size: number, delay: number): void {
    const R = this.stage.rand;
    const s = this.smoke.spec.reset();
    s.x = x + R.range(-0.25, 0.25);
    s.y = 0.35 + delay;
    s.z = z + R.range(-0.25, 0.25);
    s.vx = R.range(-0.15, 0.15);
    s.vy = R.range(0.45, 0.8);
    s.vz = R.range(-0.15, 0.15);
    s.drag = 0.4;
    s.life = R.range(1.3, 1.8);
    s.size0 = size * 0.5;
    s.size1 = size * 1.5;
    s.rot = R.range(0, 6.28);
    s.rotV = R.range(-0.5, 0.5);
    s.r = 0.035;
    s.g = 0.026;
    s.b = 0.024;
    s.a = 0.42;
    s.fadeIn = 0.25 + delay;
    this.smoke.emit();
  }

  /** The aftermath on the ground at (x, z): scorch, a low ground fire dying into embers, smoke wisps, rising embers. */
  private burnGround(x: number, z: number, r: number, life: number, rate: number, big: boolean): void {
    const R = this.stage.rand;
    this.scorch.spawn(x, z, (big ? 2.4 : 1.9) * r, SCORCH, R.range(0, 6.28), R.range(0.85, 1.2));
    const o = flip();
    o.rate = 0.75;
    o.cool = 0.45;
    o.ground = 0;
    o.frame = 2;
    this.ground.spawn(v.set(x, 0, z), (big ? 1.0 : 0.72) * r, o);
    // When the ground fire is gone, embers rise off it.
    this.risingEmbers(x, z, 0.45 * r, this.stage.n(big ? 14 : 9), 0.78, 1.1);
    for (let k = 0; k < (big ? 3 : 2); k += 1) this.wisp(x, z, 0.9 * r, k * 0.18);
    for (const e of this.emitters) {
      if (e.on) continue;
      e.on = true;
      e.x = x;
      e.z = z;
      e.r = r;
      e.t = 0;
      e.life = life * 1.5;
      e.rate = rate * 0.7;
      e.acc = 0;
      return;
    }
  }

  /**
   * A flame sheath along a blade: Dragonhold's flame band in the heat field, `span` m along the blade (foreshortened
   * with it), `size` m thick, behind the blade, its tail cooling.
   */
  private sheathAt(x: number, y: number, z: number, dx: number, dy: number, dz: number, span: number, size: number, heat: number, phase: number): void {
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 1;
    o.frame = this.stage.time * 12 + phase;
    o.dir = dir.set(dx, dy, dz);
    o.span = span;
    o.lift = -0.35;
    o.intensity = heat;
    this.sheath.spawn(v.set(x, y, z), size, o);
  }

  // ── Sword hooks (sword-skills.ts) ───────────────────────────────────────────

  chargeKey(a: ChargeKeyArgs): boolean {
    const R = this.stage.rand;
    const h = a.hand;
    // Each key sucks a ring of embers into the hand (they arrive together: the compression tightens with the word).
    const n = this.stage.n(6 + Math.round(4 * a.p));
    for (let i = 0; i < n; i += 1) {
      const ang = (i / n) * Math.PI * 2 + R.range(-0.3, 0.3);
      const r = R.range(1.3, 2.0);
      const life = 0.22;
      const x = h.x + Math.cos(ang) * r;
      const z = h.z + Math.sin(ang) * r * 0.8;
      const y = h.y + R.range(-0.6, 0.5);
      // Inward with a swirl.
      const ix = (h.x - x) / life;
      const iz = (h.z - z) / life;
      const iy = (h.y - y) / life;
      const s = this.motes.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = ix - iz * 0.35;
      s.vy = iy;
      s.vz = iz + ix * 0.35;
      s.life = life;
      s.size0 = 0.1;
      s.size1 = 0.2;
      s.stretch = 0.04;
      s.r = AMBER[0] * 2;
      s.g = AMBER[1] * 2;
      s.b = AMBER[2] * 2;
      this.motes.emit();
    }
    // A blade that arrives at its place ignites there.
    for (let i = 0; i < a.count; i += 1) {
      const p = a.appeared[i]!;
      const o = flip();
      o.rate = 1.5;
      o.frame = 1;
      o.cool = 0.5;
      o.lift = 0.2;
      // In the air the lotus has no ground to hide its root: fade the root out softly (the cell's bottom edge cut
      // its white-hot root in a straight line, 03/11 check).
      o.ground = p.y - 0.55;
      this.burst.spawn(v.set(p.x, p.y - 0.55, p.z), 1.05, o);
      this.dot(p.x, p.y, p.z, 0.7, 0.3, 0.1, CORE, 3);
      this.sparkRays(p.x, p.y, p.z, 0.9, 1.1);
    }
    return true;
  }

  chargeFrame(f: ChargeFrameArgs): boolean {
    // After the release the charge is spent: the burst replaced it (no lingering gather).
    if (!f.typing) return true;
    const h = f.hand;
    const L = f.level;
    // Flames spiral in and tighten into a white-gold point: fire-charge scrubbed by the typing level.
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    o.frame = Math.min(15, 1 + L * 14.5);
    // It eases in by erosion and a little scale on the first keys (its real alpha keeps its matte: no see-through).
    o.erode = 1 - f.vis;
    o.lift = 0.6;
    o.rot = this.stage.time * 2.2;
    this.charge.spawn(v.set(h.x, h.y, h.z), (1.7 - 0.85 * L) * f.scale * (0.8 + 0.2 * f.vis), o);
    // The point: small and hotter with every key (the only part that blooms).
    this.dot(h.x, h.y, h.z, (0.16 + 0.22 * L) * f.scale, (0.16 + 0.22 * L) * f.scale, -1, WHITE_GOLD, (1.4 + 3 * L) * f.vis);
    // Embers sucked in from round the caster.
    this.chargeAcc += (14 + 46 * L) * f.scale * this.stage.dens * f.dt;
    const R = this.stage.rand;
    while (this.chargeAcc >= 1) {
      this.chargeAcc -= 1;
      const ang = R.range(0, Math.PI * 2);
      const r = R.range(1.4, 2.4) * f.scale;
      const life = R.range(0.25, 0.4);
      const x = h.x + Math.cos(ang) * r;
      const z = h.z + Math.sin(ang) * r * 0.8;
      const y = R.range(0.1, h.y + 0.6);
      const ix = (h.x - x) / life;
      const iz = (h.z - z) / life;
      const s = this.motes.spec.reset();
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = ix - iz * 0.45;
      s.vy = (h.y - y) / life;
      s.vz = iz + ix * 0.45;
      s.life = life;
      s.size0 = 0.07;
      s.size1 = 0.13;
      s.stretch = 0.035;
      const k = 1.2 + 1.2 * L;
      s.r = AMBER[0] * k;
      s.g = AMBER[1] * k;
      s.b = AMBER[2] * k;
      this.motes.emit();
    }
    // The stone darkens under the caster.
    const d = this.groundInk.spec.reset();
    d.x = f.caster.x;
    d.y = 0.03;
    d.z = f.caster.z;
    d.life = -1;
    d.size0 = d.size1 = (1.8 + 0.9 * L) * f.scale;
    d.r = SOOT[0];
    d.g = SOOT[1];
    d.b = SOOT[2];
    d.a = 0.4 * L * f.vis;
    this.groundInk.emit();
    return true;
  }

  release(a: ReleaseArgs): boolean {
    const big = a.skill === "k7" || a.tier >= 3;
    const s = big ? 1.55 : 1;
    const p = a.at;
    // Burst at once: a white-gold pinpoint and the pressure ring at the hand on the key's frame.
    this.dot(p.x, p.y, p.z, 0.95 * s, 0.5 * s, 0.1, WHITE_GOLD, 4.2);
    const r = this.rings.reset();
    r.x = p.x;
    r.y = p.y;
    r.z = p.z;
    r.life = 0.24;
    r.r0 = 0.25 * s;
    r.r1 = 1.3 * s;
    r.width = 0.14;
    r.heat = 1;
    this.rings.emit();
    // The flame lotus erupts behind the caster (the body stays in front of its own burst).
    this.stage.camera.getWorldDirection(camF);
    const fl = Math.hypot(camF.x, camF.z) || 1;
    const c = a.caster;
    this.lotus(c.x + (camF.x / fl) * 0.55, c.z + (camF.z / fl) * 0.55, 2.3 * s, 1.3, 2, 0);
    this.sparkRays(p.x, p.y, p.z, 1.7 * s, 1.4);
    this.emberBurst(p.x, p.y, p.z, 1.2 * s, 1.0);
    const n = this.stage.n(big ? 16 : 10);
    for (let i = 0; i < n; i += 1) this.ember(p.x, p.y, p.z, c.fx, c.fz, 6, Math.PI);
    if (big) {
      this.scorch.spawn(c.x, c.z, Math.max(2.4, a.ringM * 1.1), SCORCH, this.stage.rand.range(0, 6.28));
      this.stage.accent(p.x, p.y, p.z, 0.25);
    }
    return true;
  }

  launch(a: LaunchArgs): boolean {
    const p = a.at;
    const o = flip();
    o.rate = 1.6;
    o.frame = 2;
    o.cool = 0.5;
    o.lift = 0.2;
    // Its root fades softly in the air (no straight cut at the cell's edge).
    o.ground = p.y - 0.5;
    this.burst.spawn(v.set(p.x, p.y - 0.5, p.z), 1.0, o);
    this.dot(p.x, p.y, p.z, 0.75, 0.35, 0.09, WHITE_GOLD, 3.6);
    this.sparkRays(p.x, p.y, p.z, 1.0, 1.2);
    return true;
  }

  waiting(a: TravelArgs): boolean {
    // A blade waiting at its place smoulders: its sheath, cooler than in flight, and a rising ember now and then.
    const half = a.tipM * 0.5;
    this.sheathAt(a.x + a.dx * half, a.y + a.dy * half, a.z + a.dz * half, a.dx, a.dy, a.dz, a.tipM * 1.1, 0.24, 0.86 * a.u, a.blade * 3.1);
    this.waitAcc += 9 * a.dt * this.stage.dens;
    if (this.waitAcc >= 1) {
      this.waitAcc -= 1;
      const R = this.stage.rand;
      const t = R.range(0.2, 0.95) * a.tipM;
      this.dot(a.x + a.dx * t, a.y + a.dy * t, a.z + a.dz * t, 0.1, 0.03, R.range(0.4, 0.7), AMBER, 1.8, R.range(-0.2, 0.2), R.range(0.6, 1.2), R.range(-0.2, 0.2));
    }
    return true;
  }

  travel(a: TravelArgs): boolean {
    // The sheath hugs the blade and runs a little past its pommel, cooling to soot there.
    const c = a.tipM * 0.35;
    this.sheathAt(a.x + a.dx * c, a.y + a.dy * c, a.z + a.dz * c, a.dx, a.dy, a.dz, a.tipM * 1.45, 0.26, 0.84, a.blade * 3.1);
    // Embers shed backwards along the path.
    this.shedAcc += 40 * this.stage.dens * a.dt;
    const R = this.stage.rand;
    while (this.shedAcc >= 1) {
      this.shedAcc -= 1;
      const t = R.range(0, 0.9) * a.tipM;
      this.dot(a.x + a.dx * t, a.y + a.dy * t, a.z + a.dz * t, R.range(0.09, 0.15), 0.03, R.range(0.25, 0.45), R.next() < 0.3 ? CORE : AMBER, 2, -a.dx * 2 + R.range(-0.6, 0.6), -a.dy * 2 + R.range(0.2, 1.2), -a.dz * 2 + R.range(-0.6, 0.6));
    }
    return true;
  }

  impact(a: ImpactArgs): boolean {
    const p = a.at;
    const s = a.scale * (a.big ? 1.3 : 1);
    // Pinpoint, then the lotus opens at the beast (in front of it: the beast burns), sparks and embers fly.
    this.dot(p.x, p.y, p.z, 1.15 * s, 0.6 * s, 0.08, WHITE_GOLD, 4.5);
    this.lotus(p.x + a.dx * 0.15, p.z + a.dz * 0.15, 2.0 * s, 1.25, 1, 0.7);
    this.sparkRays(p.x, p.y, p.z, 1.5 * s, 1.35);
    this.emberBurst(p.x, p.y, p.z, 1.1 * s, 1.0);
    const n = this.stage.n(8 + Math.round(6 * a.power));
    for (let i = 0; i < n; i += 1) this.ember(p.x, p.y, p.z, a.dx, a.dz, 7, 1.0);
    if (a.big) this.stage.accent(p.x, p.y, p.z, 0.3);
    return true;
  }

  cut(a: CutArgs): boolean {
    // The blade's cut stays a cut: one thin molten crescent across the blow.
    const s = this.slash.spec.reset();
    s.x = a.at.x;
    s.y = a.at.y;
    s.z = a.at.z;
    s.rot = a.rot;
    s.life = 0.13;
    s.size0 = a.size * 1.35;
    s.size1 = a.size * 1.85;
    s.r = CORE[0] * 1.5;
    s.g = CORE[1] * 1.5;
    s.b = CORE[2] * 1.5;
    this.slash.emit();
    return true;
  }

  aftermath(a: AftermathArgs): boolean {
    this.burnGround(a.x, a.z, a.r, a.life, a.rate, false);
    return true;
  }

  death(a: DeathArgs): boolean {
    const p = a.at;
    const R = this.stage.rand;
    const r = Math.max(0.3, a.radius);
    // It ignites from inside, the flame collapses, it falls into embers and ash.
    this.dot(p.x, p.y, p.z, r * 2.2, r * 1.2, 0.1, WHITE_GOLD, 3);
    const o = flip();
    o.rate = 1.1;
    o.frame = 9;
    o.cool = 0.4;
    o.ground = 0;
    o.lift = 0.5;
    this.burst.spawn(v.set(p.x, 0, p.z), r * 3.4, o);
    // It falls into embers: a ring of them off its body, cooler than a blow's.
    this.emberBurst(p.x, p.y, p.z, Math.min(1.6, r * 2), 0.85);
    const n = this.stage.n(10);
    for (let i = 0; i < n; i += 1) {
      const s = this.ash.spec.reset();
      s.x = p.x + R.range(-r, r);
      s.y = p.y + R.range(-0.2, 0.4);
      s.z = p.z + R.range(-r, r);
      s.vx = a.dx * 0.6 + R.range(-0.5, 0.5);
      s.vy = R.range(0.5, 1.5);
      s.vz = a.dz * 0.6 + R.range(-0.5, 0.5);
      s.drag = 1.2;
      s.gravity = -0.4;
      s.life = R.range(1.1, 1.8);
      s.size0 = R.range(0.1, 0.18);
      s.size1 = 0.05;
      s.rot = R.range(0, 6.28);
      s.rotV = R.range(-3, 3);
      s.r = 0.03;
      s.g = 0.022;
      s.b = 0.02;
      s.a = 0.9;
      this.ash.emit();
    }
    for (let i = 0; i < this.stage.n(6); i += 1) this.ember(p.x, p.y, p.z, a.dx, a.dz, 2.5, Math.PI);
    return true;
  }

  frame(dt: number): void {
    SWORD_LOOK.time.value += dt;
    for (const e of this.emitters) {
      if (!e.on) continue;
      e.t += dt;
      if (e.t >= e.life) {
        e.on = false;
        continue;
      }
      e.acc += e.rate * (1 - e.t / e.life) * this.stage.dens * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.risingEmbers(e.x, e.z, e.r, 1, this.stage.rand.range(0.7, 0.95), 0);
      }
    }
  }

  reset(): void {
    for (const e of this.emitters) e.on = false;
    this.chargeAcc = this.shedAcc = this.waitAcc = 0;
    SWORD_LOOK.time.value = 0;
  }

  // ── Stream hooks (myriad-swords.ts, key 7) ────────────────────────────────

  streamTravel(a: StreamTravelArgs): boolean {
    // River swords keep the shape's thin trail behind the pommel, in the fire tone (white-gold core, orange rim): the
    // furnace blades carry the fire, and ~90 flame cards across the field read as burning planks (03/11 captures).
    if (a.cls !== 0) return false;
    if (a.dissolve > 0.6) return true;
    // A lead blade: its sheath hugs it (its ribbon is the flame trail).
    const heat = (1 - a.dissolve) * 0.86;
    this.sheathAt(a.x - a.dx * a.len * 0.12, a.y - a.dy * a.len * 0.12, a.z - a.dz * a.len * 0.12, a.dx, a.dy, a.dz, a.len * 1.2, 0.3, heat, 1.7);
    return true;
  }

  strike(a: StreamStrikeArgs): boolean {
    const k = a.k;
    if (k >= 1.3) {
      // A lead blade: the lotus at the beast.
      this.dot(a.x, a.y, a.z, 1.0 * k, 0.5 * k, 0.08, WHITE_GOLD, 4.2);
      this.lotus(a.x + a.dx * 0.15, a.z + a.dz * 0.15, 1.45 * k, 1.3, 1, 0.6);
      this.sparkRays(a.x, a.y, a.z, 1.1 * k, 1.3);
      this.emberBurst(a.x, a.y, a.z, 0.75 * k, 1.0);
      if (k >= 2) this.stage.accent(a.x, a.y, a.z, 0.22);
      return true;
    }
    // A river sword stays thin (the field-wide river must not turn into flame soup): a pinpoint, spark rays, embers.
    this.dot(a.x, a.y, a.z, 0.6 * k, 0.3 * k, 0.07, CORE, 3);
    this.sparkRays(a.x, a.y, a.z, 0.65 * k, 0.8);
    for (let i = 0; i < 3; i += 1) this.ember(a.x, a.y, a.z, a.dx, a.dz, 5, 0.9);
    return true;
  }

  leadStrike(a: { x: number; z: number }): boolean {
    this.lotus(a.x, a.z, 2.9, 1.15, 1, 0.3);
    this.burnGround(a.x, a.z, 1.3, 1.4, 16, true);
    this.emberBurst(a.x, 0.6, a.z, 1.4, 0.95);
    return true;
  }

  glint(a: StreamGlintArgs): boolean {
    const R = this.stage.rand;
    if (a.river) {
      // The river sheds embers that drift with it.
      this.dot(a.x, a.y, a.z, R.range(0.12, 0.18), 0.03, R.range(0.25, 0.4), R.next() < 0.35 ? CORE : AMBER, Math.min(2.2, 0.5 + a.k * 0.6), 39 * 0.15 * 0.6, -0.4, -12 * 0.15 * 0.6);
      return true;
    }
    this.dot(a.x, a.y, a.z, 0.26 * a.k, 0.05, R.range(0.15, 0.3), CORE, 2.4, 0, 0.6, 0);
    return true;
  }

  finisher(a: StreamSegmentArgs): boolean {
    // The cut leaves a burning scar: scorch along it, a low flame line, ground fires and a molten seam, lit in the
    // order the slash's head runs (~0.26 s origin to tip).
    const dx = a.bx - a.ax;
    const dz = a.bz - a.az;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const R = this.stage.rand;
    const rot = Math.atan2(-uz, ux);
    for (let k = 0; k <= 12; k += 1) {
      const u = k / 12;
      this.scorch.spawn(a.ax + dx * u + R.range(-0.25, 0.25), a.az + dz * u + R.range(-0.25, 0.25), R.range(2.0, 2.6), SCORCH_LINE, rot + R.range(-0.3, 0.3), 1.7);
    }
    const cards = 7;
    for (let k = 0; k < cards; k += 1) {
      const u = (k + 0.5) / cards;
      const o = flip();
      o.life = 2.0 + R.range(0, 0.5);
      o.rate = 1;
      o.frame = R.range(0, 16);
      o.cool = 0.6;
      o.dir = dir.set(ux, 0, uz);
      o.ground = 0;
      o.delay = u * 0.26;
      this.line.spawn(v.set(a.ax + dx * u, 0.2, a.az + dz * u), 0.95, o);
    }
    for (let k = 0; k < 5; k += 1) {
      const u = (k + 0.5) / 5 + R.range(-0.05, 0.05);
      const o = flip();
      o.rate = 0.75;
      o.cool = 0.45;
      o.ground = 0;
      o.frame = 2;
      o.delay = u * 0.26;
      this.ground.spawn(v.set(a.ax + dx * u, 0, a.az + dz * u), 0.95, o);
      this.risingEmbers(a.ax + dx * u, a.az + dz * u, 0.5, this.stage.n(7), 0.8, u * 0.26 + 1.1);
    }
    const b = this.seams.spec.reset();
    b.x = a.ax - ux * 1.5;
    b.y = 0.08;
    b.z = a.az - uz * 1.5;
    b.dx = ux;
    b.dy = 0;
    b.dz = uz;
    b.len0 = b.len1 = l + 3;
    b.grow = 0.26;
    b.w0 = 0.42;
    b.w1 = 0.2;
    b.life = 2.4;
    b.cr = CORE[0] * 4.5;
    b.cg = CORE[1] * 4.5;
    b.cb = CORE[2] * 4.5;
    b.hr = ORANGE[0] * 0.85;
    b.hg = ORANGE[1] * 0.85;
    b.hb = ORANGE[2] * 0.85;
    b.fadeBase = 0.05;
    b.fadeTip = 0.05;
    this.seams.emit();
    camW.set((a.ax + a.bx) * 0.5, 0.5, (a.az + a.bz) * 0.5);
    this.stage.accent(camW.x, camW.y, camW.z, 0.45);
    return true;
  }

  /**
   * The finisher's slash as a flame (replaces the recoloured sword-qi slash): the same strip, shape and timing, drawn
   * as heat with flame tongues; embers shed off it behind the head while it burns.
   */
  finisherSlash(a: StreamSlashArgs): boolean {
    if (a.fade <= 0.003) {
      this.flameSlash.hide();
      this.slashAcc = 0;
      return true;
    }
    this.flameSlash.set(a.ax, a.ay, a.az, a.bx, a.by, a.bz, a.halfPx * 1.3, a.head, a.fade, a.erode, a.mask, a.t);
    this.slashAcc += 90 * a.dt * a.fade * (1 - a.erode) * this.stage.dens;
    const R = this.stage.rand;
    while (this.slashAcc >= 1) {
      this.slashAcc -= 1;
      const u = R.next() * a.head;
      const s = this.embers.reset();
      s.x = a.ax + (a.bx - a.ax) * u + R.range(-0.3, 0.3);
      s.y = a.ay + (a.by - a.ay) * u + R.range(-0.2, 0.2);
      s.z = a.az + (a.bz - a.az) * u + R.range(-0.3, 0.3);
      s.vx = R.range(-1.2, 1.2);
      s.vy = R.range(0.6, 2.2);
      s.vz = R.range(-1.2, 1.2);
      s.drag = 1.8;
      s.rise = R.range(0.8, 1.4);
      s.life = R.range(0.7, 1.3);
      s.size = 0.08 + 0.14 * Math.pow(R.next(), 3);
      s.heat = R.range(0.8, 1.05);
      this.embers.emit();
    }
    return true;
  }

  /** A big beast's slice seam as a burning cut: a thin molten line, flame tongues licking along it, embers. */
  cutSeam(a: StreamSeamArgs): boolean {
    const b = this.seams.spec.reset();
    b.x = a.x;
    b.y = a.y;
    b.z = a.z;
    b.dx = a.dx;
    b.dy = a.dy;
    b.dz = a.dz;
    b.len0 = 0.2;
    b.len1 = a.len;
    b.grow = 0.05;
    b.w0 = 0.12;
    b.w1 = 0.08;
    b.life = 0.6;
    b.cr = CORE[0] * 3.6;
    b.cg = CORE[1] * 3.6;
    b.cb = CORE[2] * 3.6;
    b.hr = ORANGE[0] * 0.8;
    b.hg = ORANGE[1] * 0.8;
    b.hb = ORANGE[2] * 0.8;
    b.fadeBase = 0.2;
    b.fadeTip = 0.2;
    this.seams.emit();
    // Flame tongues along the cut (the heat-field band, cooling to its tail), burning out over ~0.5 s.
    const o = flip();
    o.life = 0.5;
    o.rate = 1;
    o.frame = this.stage.rand.range(0, 16);
    o.dir = dir.set(a.dx, a.dy, a.dz);
    o.span = a.len * 1.05;
    o.intensity = 0.95;
    o.lift = -0.2;
    this.sheath.spawn(v.set(a.x + a.dx * a.len * 0.5, a.y + 0.1, a.z + a.dz * a.len * 0.5), 0.42, o);
    this.emberBurst(a.x + a.dx * a.len * 0.5, a.y, a.z + a.dz * a.len * 0.5, 0.7, 0.95);
    return true;
  }

  /** A hero victim pinned by a lead sword: a white-gold point, a ring of fire on the ground, flame, burnt ground, embers. */
  plant(a: StreamPlantArgs): boolean {
    this.dot(a.x, 0.35, a.z, 1.3, 0.7, 0.1, WHITE_GOLD, 3.2);
    const r = this.groundRings.reset();
    r.x = a.x;
    r.y = 0.05;
    r.z = a.z;
    r.r0 = 0.2;
    r.r1 = 1.4;
    r.life = 0.42;
    r.width = 0.11;
    r.heat = 1;
    this.groundRings.emit();
    this.lotus(a.x - a.dx * 0.1, a.z - a.dz * 0.1, 1.5, 1.4, 1, 0.3);
    this.scorch.spawn(a.x, a.z, 1.7, SCORCH, this.stage.rand.range(0, 6.28));
    this.emberBurst(a.x, 0.3, a.z, 0.8, 1.0);
    return true;
  }

  streamReset(): void {
    this.flameSlash.hide();
    this.slashAcc = 0;
  }

  slashSpark(a: StreamSparkArgs): boolean {
    const R = this.stage.rand;
    const s = this.motes.spec.reset();
    s.x = a.x;
    s.y = a.y;
    s.z = a.z;
    s.vx = a.vx;
    s.vy = a.vy;
    s.vz = a.vz;
    s.gravity = -9;
    s.drag = 2.5;
    s.stretch = 0.045;
    s.life = R.range(0.3, 0.5);
    s.size0 = R.range(0.2, 0.32);
    s.size1 = 0.04;
    const hot = R.next() < 0.3;
    const c = hot ? CORE : AMBER;
    const k = hot ? 2.2 : 2.0;
    s.r = c[0] * k;
    s.g = c[1] * k;
    s.b = c[2] * k;
    this.motes.emit();
    return true;
  }

  hooks(): ElementHooks {
    return {
      sword: {
        chargeKey: (a) => this.chargeKey(a),
        chargeFrame: (a) => this.chargeFrame(a),
        release: (a) => this.release(a),
        launch: (a) => this.launch(a),
        waiting: (a) => this.waiting(a),
        travel: (a) => this.travel(a),
        impact: (a) => this.impact(a),
        cut: (a) => this.cut(a),
        aftermath: (a) => this.aftermath(a),
        death: (a) => this.death(a),
        frame: (dt) => this.frame(dt),
        reset: () => this.reset(),
      },
      stream: {
        travel: (a) => this.streamTravel(a),
        strike: (a) => this.strike(a),
        leadStrike: (a) => this.leadStrike(a),
        glint: (a) => this.glint(a),
        finisher: (a) => this.finisher(a),
        slashSpark: (a) => this.slashSpark(a),
        slash: (a) => this.finisherSlash(a),
        cutSeam: (a) => this.cutSeam(a),
        plant: (a) => this.plant(a),
        reset: () => this.streamReset(),
      },
    };
  }
}

export const FIRE: ElementKit = {
  id: "fire",
  name: "Fire",
  verb: "compress → burst",
  ramp: { core: CORE, edge: lin("#FFB13C"), body: lin("#FF7A2A"), soot: lin("#2B1D18") },
  palette: firePalette,
  stream: FIRE_STREAM,
  trail: { widthM: 0.16, core: k3(CORE, 2), rimK: 0.8, silk: false, flame: { clip: "dragonhold-flame-trail", soot: SOOT, deep: VERMILION, amber: AMBER, core: WHITE_GOLD } },
  blade: { mode: "furnace", edge: [3.4, 2.3, 0.95], heat: [0.9, 0.3, 0.03], char: 0.12 },
  textures: {},
  flipbooks: {
    charge: ["fire-charge"],
    release: ["fire-burst", "fire-sparks"],
    travel: ["dragonhold-flame-trail"],
    impact: ["fire-burst", "fire-sparks"],
    aftermath: ["fire-ground", "fire-trail"],
  },
  ground: SCORCH,
  foe: { kind: "burn", seconds: 1.4, rgb: 0xd04a0c },
  sigil: { mode: "solid", soot: SEAL_SOOT, sootAlpha: 0.8, body: SEAL_BODY, lit: SEAL_LIT, core: SEAL_CORE },
  // The graphic impact frames in fire (03/11 fixes: its pale peach paper washed the whole screen for two frames): the
  // dark frame a soot-umber world (hue ~20°, never the enemy red or a blood red) with amber focus rays, black figures,
  // its light in gold and a white-gold strike; the inverted frame a vermilion-amber ground with that light as dark
  // soot shapes, black figures with a white-gold contour and soot strokes and brush burst. Display values.
  screen: {
    flash: { tint: [0.55, 0.26, 0.06], strength: 1 },
    distortion: 0,
    frames: {
      navy: [0.17, 0.07, 0.02],
      paper: [0.93, 0.38, 0.06],
      accent: [1.0, 0.62, 0.12],
      roles: { rays: [0.62, 0.3, 0.04], strike: [1.0, 0.985, 0.93], lines: [0.16, 0.065, 0.018], strokes: [0.08, 0.035, 0.012], contour: [1.0, 0.8, 0.36] },
    },
  },
  sound: "fire",
  attach: (stage) => new FireLayers(stage).hooks(),
};
