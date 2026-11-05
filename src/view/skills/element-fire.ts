/**
 * Fire (canon D59, ELEMENT_LAYER §2): compress → burst. The Sword's shapes (key 1's Threefold Sword Command, key 7's
 * Myriad Swords; paths, counts and timing unchanged) drawn in fire, in all five phases (VFX_STANDARD §3), replacing
 * Metal's layers, never on top of them:
 * - charge: while a word is typed, flames spiral in and tighten into a tiny white-gold point at the hand (the
 *   compression lives in the charge: fire-charge scrubbed by the typing level), embers are sucked in from round the
 *   caster, the stone darkens under the feet; a blade arriving at its place ignites there;
 * - release: on the last key's frame an authored fire twinkle and a camera-facing painted halo at the hand,
 *   shedding embers, an anime flame lotus (fire-burst, real alpha) bursting behind the caster,
 *   spark rays and embers (key 7's release bigger, with a scorch);
 * - travel: the real Clear Wind silhouette as a fire blade (sword-material.ts furnace; SWORD_AURA Q3: dark hot-edged
 *   steel, a molten white-gold edge line and the heat band only along the cutting edges), wrapped in a flame sheath
 *   (Dragonhold's flame band in the heat-field mode, tapered to a soot tail; with the sword aura on, the aura's flame
 *   mantle instead) and trailing a flame ribbon (fxkit flame look), shedding embers;
 * - impact: a point of fire (a small gold core in flame tongues, never a white ball), the fire-burst lotus at the
 *   beast (real alpha, its white-hot base graded to gold matter: solid and saturated on pale and dark stone), spark
 *   rays and loose embers, a cut as a molten crescent of matter; key 7's river strikes stay thin (a small point,
 *   sparks, embers) so the field-wide river never turns into flame soup, its lead blades take the lotus;
 *   key 1's hit, version 2: the brushfire card (masked flipbook, its own folder), a flash and a light at age 0,
 *   sparks and embers kept; no lotus, fire point, code scorch or ground fire on that blow;
 *   FIRE_LAB.impact = "lotus" puts the old hit back;
 * - aftermath: burnt ground with a crisp irregular edge and cooling ember cracks, a low ground fire that burns down
 *   over ~3 s by erosion into embers and char, a few dark smoke wisps (normal blend), embers rising for a while; key
 *   7's finisher leaves a burning scar along its cut (scorch, a low flame line, ground fires, a gold molten seam);
 * - linger (round 3, the owner's 03/11 note): the attack is instant, then the peak holds and the fire burns down
 *   slowly (a lotus ~1.0-1.2 s, a ground fire ~3 s, embers a third longer, the flame slash 1.2 s); a crowded field
 *   (key 7) lingers less;
 * - foe: the burn status (the beast's rim flickers amber, TargetField.status), an amber-gold hit silhouette and a kill
 *   that burns away gold to orange with char behind its edge (FoeStatus.flash, burn: the lab's herd); death: a point
 *   of fire, a collapsing flame, embers and ash;
 * - screen: a warm flash on big blows (ElementStage.accent → the host's screen-fx warm), the graphic impact frames
 *   in soot and amber, their bursts flame tongues and ember sparks (never ink); the shared heat-haze distortion pass
 *   is left for later (ELEMENT_LAYER §5 budget).
 * Colours (D54): white-gold → amber → vermilion-orange → dark soot; nothing uses the enemy's warning red #FF4A4A.
 * Fire bodies are real-alpha clips or heat-field shading with a soot edge (never brightness as alpha over the ground:
 * DRAGON_FIRE_DIAGNOSIS); only thin cores are HDR. No allocation per frame.
 */
import * as THREE from "three";
import type { AftermathArgs, BladeLook, ChargeFrameArgs, ChargeKeyArgs, CutArgs, DeathArgs, ElementHooks, ElementKit, FlyingCutArgs, GroundAftermath, ImpactArgs, LaunchArgs, ReleaseArgs, StreamGlintArgs, StreamPlantArgs, StreamSeamArgs, StreamSegmentArgs, StreamSlashArgs, StreamSparkArgs, StreamStrikeArgs, StreamTone, StreamTravelArgs, SwordAuraLook, TravelArgs } from "./element-kit";
import { crescentOf } from "./element-clips";
import { FlameSlash } from "./flame-slash";
import type { ElementStage } from "./element-stage";
import { ONE_FRAME, type FlipbookPool, type FlipOptions, type FlipbookPlayer } from "./flipbook";
import type { EmberPool } from "./embers";
import type { FirePointPool } from "./fire-points";
import { Rand, type BeamPool, type SpritePool } from "./fxkit";
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
// Lit gold held at 0.9 a channel (SigilLook: halos and rings never reach the bloom; #FFAE34 itself is 1.0 in red).
const SEAL_LIT = k3(lin("#FFAE34"), 0.9);
const SEAL_CORE: Rgb = [1, 0.72, 0.3];
/** The lotus's hot base as matter (linear, ≤ 0.9: a gold-amber, hue ~38°) and a cut's molten body. */
const LOTUS_GOLD: Rgb = [0.9, 0.5, 0.09];
const CUT_BODY: Rgb = [0.86, 0.3, 0.025];
/** The flame slash's deep body: a vermilion kept off red (hue ~21°). */
const SLASH_DEEP = lin("#E8560E");

/** Linear gold-white of key 1's hit flash (the fire point's own core colour; a white HDR core read as a white ball). */
const FLASH = lin("#FFE2A0");

/**
 * Key 1's hit, version 2 (ticket 264; INTEGRATION_PLAN CX-H): the owner's brushfire clip (04/11/2026, ~22:00) as a masked
 * one-shot card rooted at the strike, a flash and a light at age 0. TRIAL numbers, tuned in the lab.
 */
export const BRUSH = {
  folder: "fire/impact-k1-r2",
  id: "fire-impact-k1-r2",
  /** Cell height (m) × the blow's s: the fan is about 0.54 × that tall and 0.69 × that wide above the root. */
  size: 3.0,
  /** Share of the turn toward the blow's screen direction the fan takes, and its cap (rad): flames never hang down. */
  follow: 0.6,
  maxTurn: (50 * Math.PI) / 180,
  lift: 0.7,
  softM: 0.2,
  rampCool: 1,
  capacity: 24,
  renderOrder: 12,
  /** The flash at the strike root: m (× s), s, gain on FLASH (HDR, so only its centre reaches the bloom). */
  flash: { size0: 0.6, size1: 0.5, life: 0.07, gain: 2 },
  /** The impact light's intensity; × bigLight on the third, big blow. */
  light: 4,
  bigLight: 1.5,
} as const;

export interface FireAudit {
  brush: number; flash: number; light: number;
  lotus: number; point: number; scorch: number; groundFire: number;
  missing: number;
  /** stage.time at the first and the latest key-1 hit since the last reset (−1: none). */
  firstAt: number; lastAt: number;
}

export interface FirePrewarm {
  prewarmed: boolean;
  /** Three.js texture ids, unique per renderer (shared sheets appear once). */
  textureIds: number[];
}

/**
 * Lab-only comparisons (the skills lab sets them; the game never does): `riverSheath` puts the flame cards back on key
 * 7's river swords (the "burning planks" the Fire round removed), for SWORD_AURA §5.5's comparison sheet only.
 */
export const FIRE_LAB = {
  riverSheath: false,
  slashTongues: false,
  /** ?impact=brush|lotus (ticket 264); "lotus" restores key 1's old hit exactly as before the ticket. */
  impact: "brush" as "brush" | "lotus",
  /** What key 1's hits have drawn since the last reset; the lab reads it through __lab.fireImpact, the game never does. */
  audit: { brush: 0, flash: 0, light: 0, lotus: 0, point: 0, scorch: 0, groundFire: 0, missing: 0, firstAt: -1, lastAt: -1 } as FireAudit,
};

/** Clears the lab's key-1 hit counters and timestamps. */
export function resetFireAudit(): void {
  const a = FIRE_LAB.audit;
  a.brush = a.flash = a.light = a.lotus = a.point = a.scorch = a.groundFire = a.missing = 0;
  a.firstAt = a.lastAt = -1;
}

let warnedBrush = false;

/**
 * Screen angle (rad) of key 1's brushfire card for a blow along ground direction (dx, dz) (ticket 264): the blow as the
 * camera sees it (`view` = the camera's matrixWorldInverse, its rotation part), the painted fan's `heading` turned
 * `follow` of the way toward it, at most `maxTurn` either way. A blow along the view axis (or none) keeps the painting (0).
 */
export function brushRotation(dx: number, dz: number, view: THREE.Matrix4, heading: number, follow: number, maxTurn: number): number {
  const e = view.elements;
  const x = e[0]! * dx + e[8]! * dz;
  const y = e[1]! * dx + e[9]! * dz;
  if (x * x + y * y < 1e-10) return 0;
  let d = Math.atan2(y, x) - heading;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  return Math.max(-maxTurn, Math.min(maxTurn, d * follow));
}

/** Folder of the kit's clips (art-src/lab/vfx/fire/manifest.json). */
const FOLDER = "fire";

/** Ticket 277: measured peaks of mean linear Rec.709 light, one entry per twinkle row. */
const TWINKLE_PEAK = [3, 9, 9, 7, 11, 8, 12, 4] as const;
const HAND_PEAK = 19;
const GROUND_RING_PEAK = 5;
const STRIP = "strip-fire-sheath-v2";
const ART_RAND_SEED = 4409277;

/** Local placement only: the shared flipbook shaders and other elements keep their programs. */
function groundCard(pool: FlipbookPool, strip = false): void {
  const material = pool.mesh.material;
  material.customProgramCacheKey = () => strip ? "fire-lot1-strip" : "fire-lot1-ground";
  material.onBeforeCompile = (shader) => {
    const start = shader.vertexShader.indexOf("  vec4 view = modelViewMatrix * vec4(iPos, 1.0);");
    if (start < 0) throw new Error("[fire-lot1] ground-card vertex anchor missing");
    shader.vertexShader = shader.vertexShader.slice(0, start) + `
  vec2 axis = length(iDir.xz) > 1e-5 ? normalize(iDir.xz) : vec2(1.0, 0.0);
  float c = cos(iData.y), s = sin(iData.y);
  axis = vec2(axis.x * c - axis.y * s, axis.x * s + axis.y * c);
  float span = iLift.y > 0.0 ? iLift.y : iData.x * uAspect;
  vec2 corner = axis * (uv.x - uPivot.x) * span
              + vec2(-axis.y, axis.x) * (uv.y - uPivot.y) * iData.x;
  vWorld = (modelMatrix * vec4(iPos + vec3(corner.x, 0.0, corner.y), 1.0)).xyz;
  vec4 view = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * view;
  if (iLift.x != 0.0) {
    vec4 moved = projectionMatrix * vec4(view.xy, view.z + iLift.x, 1.0);
    gl_Position.z = moved.z / moved.w * gl_Position.w;
  }
}`;
    if (strip) {
      shader.vertexShader = "varying vec2 vFireStrip;\n" + shader.vertexShader.replace("  vUv = uv;", "  vUv = uv; vFireStrip = vec2(iLift.y, iData.x);");
      shader.fragmentShader = "varying vec2 vFireStrip;\n" + shader.fragmentShader;
      const start = shader.fragmentShader.indexOf("vec2 vxCell(float f, vec2 uv) {");
      const end = shader.fragmentShader.indexOf("\n}", start) + 2;
      if (start < 0 || end < 2) throw new Error("[fire-lot1] strip sampling anchor missing");
      shader.fragmentShader = shader.fragmentShader.slice(0, start) + `vec2 vxCell(float f, vec2 uv) {
  // The painted period is naturally 2:1; only placement and longitudinal flow come from code.
  float repeats = max(1.0, vFireStrip.x / max(2.0 * vFireStrip.y, 1e-4));
  return vec2(fract(uv.x * repeats - vFrame * (0.5 / 24.0) + vAge.z), uv.y);
}` + shader.fragmentShader.slice(end);
    }
  };
}

/** The static strip has no manifest. Register its single cell in the same library, without copying media. */
function loadFireStrip(player: FlipbookPlayer): Promise<void> {
  const lib = player.library(FOLDER);
  if (lib.get(STRIP) !== null || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return Promise.resolve();
  return lib.load().then(async () => {
    const url = player.base + "aura/strips/" + STRIP + ".rgba.png";
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.premultiplyAlpha = false;
    lib.add({ id: STRIP, url, cols: 1, rows: 1, frames: 1, fps: 24, loop: true,
      mode: "rgba", aspect: 4, pivot: [0.5, 0.5], start: 0, heading: 0 }, texture);
  }).catch((error: unknown) => console.warn("[fire-lot1] strip did not load", error));
}

/** Every slot burns in the same ramp; the ultimate a little more golden. Load time (glowOfRamp allocates). */
// A struck beast's tint (its rim flash, its brightening, the lab's dissolve edge) is amber: the ramp's flash mixed
// toward white read as a white-pink ghost on the beast (round 3).
const FIRE_GLOW: WeaponGlow = { ...glowOfRamp(["#FFF1C9", "#FF8A2A", "#C2361A"]), flashHex: 0xffa030 };
const FIRE_GLOW_GOLD: WeaponGlow = { ...glowOfRamp(["#FFF4D6", "#FFA53A", "#C2461A"]), flashHex: 0xffb040 };
function firePalette(_def: WeaponDef, slot: SwordSlot): WeaponGlow {
  return slot === "k5" ? FIRE_GLOW_GOLD : FIRE_GLOW;
}

/** Key 7's light in fire: white-gold cores, amber-orange halos (≤ 0.9), a molten slash with a dark vermilion falloff. */
export const FIRE_STREAM: StreamTone = {
  core: [1, 0.74, 0.36],
  halo: [0.86, 0.27, 0.03],
  trailCore: [1.6, 0.9, 0.32],
  flash: "#ffb060",
  // Amber (hue ~36°): the river's hits flash the beast and tint its rim in it (0xf07020, cubed into the lab's dissolve
  // edge, read as a raw-flesh coral; round 3).
  hitRgb: 0xffa030,
  // The finisher's cut flashes the beasts amber too (0xffa850 at the herd's rim level read cream-white).
  cutRgb: 0xff9a28,
  number: [1.0, 0.45, 0.08],
  slash: { white: [1.0, 0.7, 0.32], body: [0.72, 0.13, 0.008], bodyLit: [0.95, 0.34, 0.035], deep: [0.03, 0.005, 0.002] },
};

/**
 * The burnt ground a blow leaves (03/11 fixes: Kenney's black spiky scorch star read as an ink splat on pale stone):
 * the decal pool's procedural char, a soft irregular burn graded out into browned stone, ember cracks and a rim that
 * cool from gold to orange, eroding away (never fading).
 */
// It outlasts the ground fire burning on it (~3 s, round 3: the owner's "the flames vanish a little fast"), its
// ember cracks cooling over ~4 s.
// Dense to its crisp edge (a thin see-through rim on pale stone read as a dirt smudge: round 3).
const SCORCH: GroundAftermath = { texture: null, life: 5.2, growIn: 0.05, erodeFrom: 0.62, body: CHAR, alpha: 0.86, heat: [1.6, 0.62, 0.12], cool: 0.55 };
const SCORCH_LINE: GroundAftermath = { ...SCORCH, life: 5.6, erodeFrom: 0.66, cool: 0.6 };

/**
 * How long the fire lingers (round 3, the owner's 03/11 note "the flames vanish a little fast"): the attack is as
 * instant as before (first frame at its peak, the same rate to the clip's peak), then the peak holds and the flame
 * burns down slowly, eroding and cooling toward char (never a quick alpha fade). Frames of fire-burst (16 at 18 fps):
 * it opens over 0–6, holds its full lotus over 5–9, breaks up over 10–11, and dies as one tongue over 12–14.
 */
const LOTUS_PEAK = 7;
/** fire-ground (16 at 12 fps): its dome of tongues over 2–6, then it shrinks, darkens and dies over 7–15. */
const GROUND_PEAK = 6;
/**
 * Key 7 keeps its field readable (lingering lotuses must not pile into a veil over the beasts and their word tags):
 * past this many live lotuses a new one lingers less, down to its old timing.
 */
const LOTUS_CROWD = 28;
/** The finisher's flame slash: its own hold and erosion after the shape's sweep (Metal's 0.22 s and 0.4 s). */
const SLASH_SWEEP_S = 0.26;
const SLASH_HOLD_S = 0.34;
const SLASH_ERODE_S = 0.6;
const smooth01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

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
  o.slowFrom = o.slowRate = undefined;
  o.vx = o.vy = o.vz = o.drag = o.gravity = o.ground = o.fadeIn = o.fadeOut = o.delay = o.cool = o.lift = undefined;
  o.tint = undefined;
  o.variant = undefined;
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
  private readonly warmed = new WeakMap<THREE.WebGLRenderer, Map<THREE.Texture, number>>();
  private readonly compiled = new WeakSet<THREE.WebGLRenderer>();
  private readonly stripReady: Promise<void>;
  private readonly burst: FlipbookPool;
  private readonly charge: FlipbookPool;
  private readonly sparks: FlipbookPool;
  /** Loose embers: thrown off blows, rising off the burnt ground, cooling white-gold → amber → a dim orange. */
  private readonly embers: EmberPool;
  private readonly ground: FlipbookPool;
  private readonly sheath: FlipbookPool;
  private readonly line: FlipbookPool;
  /** Key 1's masked brushfire card, kept in its own media folder. */
  private readonly brush: FlipbookPool;
  /** Key 1's short gold-white flash at the strike root. */
  private readonly flash: SpritePool;
  /** Ember dots, pinpoints and shed sparks (additive thin light). */
  private readonly motes: SpritePool;
  /** Legacy points and rings are registered only by the lab's code comparison. */
  private readonly points: FirePointPool | null;
  /** The release's pressure ring (matter on soot, a thin hot line). */
  private readonly rings: HeatRingPool | null;
  /** A cut: a molten crescent as matter (amber-vermilion, normal blend) with a thin added white-gold core. */
  private readonly slash: SpritePool;
  private readonly slashBody: SpritePool;
  /** Dark smoke wisps and ash flakes (normal blend). */
  private readonly smoke: SpritePool;
  private readonly ash: SpritePool;
  /** The stone darkening under the caster while the word is typed. */
  private readonly groundInk: SpritePool;
  private readonly seams: BeamPool | null;
  /** Key 7's finisher as a flame (in place of the sword-qi slash) and the rings of fire round a pinned victim. */
  private readonly flameSlash: FlameSlash;
  private readonly groundRings: HeatRingPool | null;
  private readonly twinkles: FlipbookPool | null;
  private readonly handRing: FlipbookPool | null;
  private readonly sealRing: FlipbookPool | null;
  private readonly strip: FlipbookPool | null;
  /** A separate view stream keeps every unchanged layer's random draws identical in A/B. */
  private readonly artRand = new Rand(ART_RAND_SEED);
  private slashAcc = 0;
  /** The flame slash as last given by the shape, kept while it lingers after the shape's own slash is gone. */
  private slashOn = false;
  private slashT = 0;
  private readonly slashEnds = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, half: 0, mask: null as THREE.Texture | null };
  private readonly scorch: GroundDecalPool;
  private readonly emitters: Emitter[] = Array.from({ length: 24 }, () => ({ on: false, x: 0, z: 0, r: 0, t: 0, life: 0, rate: 0, acc: 0 }));
  private chargeAcc = 0;
  private shedAcc = 0;
  private waitAcc = 0;
  /** Embers owed by key 7's mid swords licking the aura's flame (8 a second each, SWORD_AURA §3.A Fire). */
  private midShedAcc = 0;
  /** The last world step (the sword hooks' frame; key 7's stream hooks run after it in the same frame). */
  private lastDt = 1 / 60;

  constructor(private readonly stage: ElementStage) {
    const P = stage.flipbooks;
    const code = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).get("fxcode") === "1";
    this.twinkles = this.handRing = this.sealRing = this.strip = null;
    if (!code) {
      this.twinkles = P.pool(FOLDER, "fire-twinkle-set", { mode: "fire", capacity: 256, renderOrder: 14 });
      this.handRing = P.pool(FOLDER, "fire-halo-ring", { mode: "fire", capacity: 24, renderOrder: 14 });
      this.sealRing = P.pool(FOLDER, "fire-halo-seal-loop", { mode: "fire", capacity: 16, renderOrder: 6 });
      this.strip = P.pool(FOLDER, STRIP, { mode: "rgba", capacity: 24, renderOrder: 13 });
      groundCard(this.sealRing);
      groundCard(this.strip, true);
      // The old manifest predates variant playback. Adapt its layout in memory, never rewrite the art.
      P.library(FOLDER).watch((id) => {
        if (id !== "fire-twinkle-set") return;
        const e = P.library(FOLDER).get(id)!;
        this.twinkles!.attach({ ...e.meta, frames: 16, variants: 8, loop: false, loopMode: "none" }, e.texture);
      });
    }
    // Key 7 and K5 keep up to ~90 lotuses alive at once (deaths collapse into one each; 03/11 recheck).
    // Lingering (round 3) they hold ~90 at once in K5's deaths: room to spare, a full pool would drop new ones.
    this.burst = P.pool(FOLDER, "fire-burst", { mode: "rgba", capacity: 128, renderOrder: 12 });
    this.charge = P.pool(FOLDER, "fire-charge", { mode: "rgba", capacity: 6, renderOrder: 13 });
    this.sparks = P.pool(FOLDER, "fire-sparks", { mode: "fire", capacity: 64, renderOrder: 14 });
    this.ground = P.pool(FOLDER, "fire-ground", { mode: "rgba", capacity: 32, renderOrder: 11 });
    this.sheath = P.pool(FOLDER, "dragonhold-flame-trail", { mode: "heat", capacity: 200, renderOrder: 11 });
    this.line = P.pool(FOLDER, "fire-trail", { mode: "rgba", capacity: 24, renderOrder: 11 });
    this.brush = P.pool(BRUSH.folder, BRUSH.id, { mode: "rgba", capacity: BRUSH.capacity, renderOrder: BRUSH.renderOrder });
    this.brush.softM = BRUSH.softM;
    this.brush.rampCool = BRUSH.rampCool;
    // Flames burn out toward warm char, not violet soot: a dying orange mixed toward violet passed through maroon.
    for (const p of [this.burst, this.charge, this.ground, this.line]) p.setSoot(CHAR[0] * 1.3, CHAR[1] * 1.3, CHAR[2] * 1.3);
    this.sheath.setHeatRamp(VERMILION, AMBER, WHITE_GOLD);
    this.sheath.setSoot(SOOT[0], SOOT[1], SOOT[2]);
    // The sheath cools from the blade toward its tail (a soot tail behind the sword), its band read soft.
    this.sheath.taper = 0.6;
    this.sheath.blur = 1.8;
    this.burst.softM = 0.3;
    this.ground.softM = 0.2;
    // A lingering clip crossfades slowly between its frames: its coverage stays matter or erodes (never two half-shown
    // frames adding up to a see-through veil on pale stone).
    this.burst.setSharpen(0.06, 0.4);
    // Its broad white-hot base was half its pale share on light stone (03/11 recheck, k1c-008): gold matter, with only
    // a thin white-hot heart.
    this.burst.setGrade(LOTUS_GOLD, 0.9);
    this.ground.setSharpen(0.06, 0.4);
    this.ground.setGrade(LOTUS_GOLD, 0.9);
    this.line.softM = 0.2;
    const T = stage.textures;
    this.flash = stage.pool(16, T.glow, "add", "camera", 14, { crop: 0.6, drawBeforeAge: true });
    this.flash.mesh.name = "fx-fire-flash";
    this.groundInk = stage.pool(8, T.glow, "ink", "ground", 3, { crop: 0.64 });
    this.scorch = stage.decals(SCORCH.texture, 64, 4);
    this.smoke = stage.pool(96, stage.texture("smoke_07"), "ink", "camera", 9, { fadeIn: 0.15 });
    // Every death in key 7 and K5 sheds ten flakes for ~2 s (160 slots dropped ~600 flakes there: round 3 check).
    this.ash = stage.pool(1024, T.splash, "ink", "camera", 9);
    this.rings = code ? stage.heatRings(24, "camera", 14) : null;
    this.rings?.setLook(SEAL_SOOT, 0.8, SEAL_BODY, SEAL_LIT, SEAL_CORE);
    this.slashBody = stage.pool(32, T.slash, "ink", "camera", 12, { matte: [0.3, 0.42] });
    // Its core: the crescent's thin middle (the sheet's densest line), added.
    this.slash = stage.pool(32, T.slash, "add", "camera", 12, { matte: [0.62, 0.8] });
    this.motes = stage.pool(900, T.glow, "add", "camera", 13, { crop: 0.6 });
    this.seams = code ? stage.beams(24, 13) : null;
    this.flameSlash = new FlameSlash(15);
    this.flameSlash.setRamp(CHAR, SLASH_DEEP, AMBER, WHITE_GOLD);
    if (!FIRE_LAB.slashTongues) {
      // Share lot 1's selected strip, including a late image, rather than loading another copy for the finisher.
      const library = P.library(FOLDER);
      const attachStrip = (): void => {
        const entry = library.get(STRIP);
        if (entry !== null) this.flameSlash.setStrip(entry.texture, 0.5);
      };
      library.watch((id) => { if (id === STRIP) attachStrip(); });
      attachStrip();
    }
    // The finisher still uses the strip in ?fxcode=1 unless its own legacy comparison is requested.
    this.stripReady = !code || !FIRE_LAB.slashTongues ? loadFireStrip(P) : Promise.resolve();
    stage.layer.add(this.flameSlash.mesh);
    this.groundRings = code ? stage.heatRings(16, "ground", 6) : null;
    this.groundRings?.setLook(SEAL_SOOT, 0.7, SEAL_BODY, SEAL_LIT, SEAL_CORE);
    // Sized for key 7's busiest moment (~1,850 live at once on High, 03/11 recheck): a full pool drops new embers.
    this.embers = stage.embers(2560, 13);
    // Key 7's river strikes land by the dozen (a point lives ~0.2 s there).
    this.points = code ? stage.firePoints(256, 14) : null;
    // Its core white-gold toward gold: a white HDR core bloomed into a white ball on pale stone.
    this.points?.setRamp(lin("#120A05"), SLASH_DEEP, k3(AMBER, 0.9), lin("#FFE2A0"), k3(CHAR, 1.3));
    this.embers.setRamp(EMBER_HOT, AMBER, EMBER_ORANGE, EMBER_DIM);
  }

  /** Upload final atlases and compile in the host scene, without spawning, aging or drawing anything. */
  async prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Object3D): Promise<void> {
    const target = renderer.getRenderTarget();
    this.compiled.delete(renderer);
    let warmed = this.warmed.get(renderer);
    if (warmed === undefined) this.warmed.set(renderer, warmed = new Map());
    const upload = (texture: THREE.Texture): void => {
      // A sheet shared by several pools uploads once; a later image version must still be uploaded.
      if (warmed.get(texture) === texture.version) return;
      renderer.initTexture(texture);
      warmed.set(texture, texture.version);
    };
    const uploadFolder = (folder: string): void => {
      const lib = this.stage.flipbooks.library(folder);
      const pools = folder === BRUSH.folder ? [this.brush] : [this.twinkles, this.handRing, this.sealRing, this.strip,
        this.burst, this.charge, this.sparks, this.ground, this.sheath, this.line];
      for (const pool of pools) {
        if (pool === null) continue;
        const entry = lib.get(pool.id);
        if (entry === null) continue;
        upload(entry.texture);
        if (entry.controls?.a !== undefined) upload(entry.controls.a);
        if (entry.controls?.b !== undefined) upload(entry.controls.b);
      }
    };
    // Each library uploads as its own load completes; the strip can arrive after the fire manifest.
    await Promise.all([
      this.stage.flipbooks.ready(FOLDER).then(() => uploadFolder(FOLDER)),
      this.stage.flipbooks.ready(BRUSH.folder).then(() => uploadFolder(BRUSH.folder)),
      this.stripReady.then(() => uploadFolder(FOLDER)),
    ]);
    const meshes = [this.brush, this.flash, this.twinkles, this.handRing, this.sealRing, this.strip,
      this.burst, this.charge, this.sparks, this.ground, this.sheath, this.line, this.motes, this.smoke, this.ash,
      this.groundInk, this.slash, this.slashBody, this.flameSlash, this.embers, this.scorch,
      this.points, this.rings, this.groundRings, this.seams].flatMap((pool) => pool === null ? [] : [pool.mesh]);
    // Include sprite/ground maps, shared blank samplers and any other texture bound by a Fire material.
    for (const mesh of meshes) {
      const material = mesh.material as THREE.ShaderMaterial;
      for (const uniform of Object.values(material.uniforms)) {
        const value: unknown = uniform.value;
        if (value instanceof THREE.Texture) upload(value);
      }
    }
    const visible = meshes.map((mesh) => mesh.visible);
    // The lab can render while media loads; compile for the target requested before that wait.
    const was = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      for (const mesh of meshes) mesh.visible = true;
      renderer.compile(scene, camera);
      this.compiled.add(renderer);
    } finally {
      meshes.forEach((mesh, i) => { mesh.visible = visible[i]!; });
      renderer.setRenderTarget(was);
    }
  }

  prewarmStatus(renderer: THREE.WebGLRenderer): FirePrewarm {
    return { prewarmed: this.compiled.has(renderer), textureIds: [...(this.warmed.get(renderer)?.keys() ?? [])].map((texture) => texture.id) };
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

  /** One authored twinkle, diameter 2 × reach; the lab flag retains the original flame point. */
  private point(x: number, y: number, z: number, reach: number, core: number, life: number, heat = 1, tongues = 9): void {
    if (this.points === null) {
      const row = Math.floor(this.artRand.next() * TWINKLE_PEAK.length);
      const o = flip();
      o.variant = row;
      o.frame = TWINKLE_PEAK[row]!;
      o.life = life;
      o.rate = (16 - o.frame) / (24 * life);
      o.intensity = heat;
      o.occlude = 0;
      o.fadeOut = 0;
      this.twinkles!.spawn(v.set(x, y, z), 2 * reach, o);
      return;
    }
    const s = this.points.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    // Never a big ball: its tongues reach under a metre, its core stays a point.
    s.reach = Math.min(0.95, reach);
    s.core = Math.min(0.3, core);
    s.life = life;
    s.heat = heat;
    s.tongues = tongues;
    this.points.emit();
  }

  /** An ember thrown off (x, y, z) at speed `sp` round the ground direction (dx, dz), arcing down, living `lifeK` × ~0.6 s. */
  private ember(x: number, y: number, z: number, dx: number, dz: number, sp: number, spread: number, lifeK = 1.25): void {
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
    s.life = R.range(0.35, 0.7) * lifeK;
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

  /**
   * The anime flame lotus (fire-burst, real alpha) rooted on the ground at (x, z), `size` m tall: it opens at `rate`
   * from `first`, holds its peak and burns down at `linger` × the clip's rate (lingering), eroding and cooling from
   * `cool` of its life. A crowded field (key 7) shortens the linger toward the attack's rate.
   */
  private lotus(x: number, z: number, size: number, rate: number, first: number, lift: number, linger: number, delay = 0, cool = 0.6): void {
    const o = flip();
    o.rate = rate;
    o.frame = first;
    o.slowFrom = LOTUS_PEAK;
    o.slowRate = this.crowded(linger, rate);
    o.until = 14;
    o.cool = cool;
    o.ground = 0;
    o.lift = lift;
    o.rot = 0;
    if (delay > 0) o.delay = delay;
    this.burst.spawn(v.set(x, 0, z), size, o);
  }

  /** A linger rate eased back toward `rate` (no linger) once the field holds more than LOTUS_CROWD live lotuses. */
  private crowded(linger: number, rate: number): number {
    const over = Math.max(0, this.burst.live - LOTUS_CROWD) / LOTUS_CROWD;
    return Math.min(rate, linger + (rate - linger) * Math.min(1, over));
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
      s.life = R.range(0.9, 2.0);
      // Mostly small specks, a few bigger (0.08–0.35 m); the fastest are the hottest.
      s.size = 0.08 + 0.2 * Math.pow(R.next(), 3);
      s.heat = heat * R.range(0.8, 1.12) * (0.85 + 0.25 * q);
      s.flicker = R.range(0.25, 0.5);
      s.delay = delay + R.range(0, 0.06);
      this.embers.emit();
    }
  }

  /**
   * `n` embers shed off a ring of fire round (x, y, z) as it opens to `r` m: in the camera's plane (the pressure ring
   * at the hand) or on the ground (a plant's ring), thrown outward and carried up, each from where the ring is then.
   */
  private ringEmbers(x: number, y: number, z: number, r: number, life: number, n: number, ground: boolean): void {
    const R = this.stage.rand;
    const m = this.stage.camera.matrixWorld.elements;
    for (let i = 0; i < n; i += 1) {
      const a = R.range(0, Math.PI * 2);
      // Where the ring is when it sheds this one (it opens eased out over its life).
      const u = R.range(0.15, 0.6);
      const k = 1 - (1 - u) ** 3;
      const rr = r * (0.35 + 0.65 * k) * R.range(0.95, 1.12);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // The ring's plane: the camera's right and up, or the ground's x and z.
      const ox = ground ? c : c * m[0]! + sn * m[4]!;
      const oy = ground ? 0 : c * m[1]! + sn * m[5]!;
      const oz = ground ? sn : c * m[2]! + sn * m[6]!;
      const s = this.embers.reset();
      s.x = x + ox * rr;
      s.y = y + oy * rr + (ground ? 0.05 : 0);
      s.z = z + oz * rr;
      const sp = R.range(1.2, 3.0);
      s.vx = ox * sp;
      s.vy = oy * sp + R.range(0.6, 1.8);
      s.vz = oz * sp;
      s.drag = R.range(2.4, 3.4);
      s.rise = R.range(0.8, 1.4);
      s.sway = R.range(0.08, 0.25);
      s.life = R.range(0.7, 1.5);
      s.size = 0.07 + 0.12 * R.next() ** 3;
      s.heat = R.range(0.8, 1.05);
      s.flicker = R.range(0.25, 0.5);
      s.delay = u * life;
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
      s.life = R.range(1.3, 2.4);
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
    s.life = R.range(1.8, 2.5);
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
  private burnGround(x: number, z: number, r: number, life: number, rate: number, big: boolean, fire = true): void {
    const R = this.stage.rand;
    if (fire) {
      this.scorch.spawn(x, z, (big ? 2.4 : 1.9) * r, SCORCH, R.range(0, 6.28), R.range(0.85, 1.2));
      this.groundFire(x, z, (big ? 1.0 : 0.72) * r, 0);
    }
    // As the ground fire burns down, embers rise off it.
    this.risingEmbers(x, z, 0.45 * r, this.stage.n(big ? 14 : 9), 0.78, 1.9);
    for (let k = 0; k < (big ? 3 : 2); k += 1) this.wisp(x, z, 0.9 * r, k * 0.18);
    for (const e of this.emitters) {
      if (e.on) continue;
      e.on = true;
      e.x = x;
      e.z = z;
      e.r = r;
      e.t = 0;
      e.life = life * 2;
      e.rate = rate * 0.7;
      e.acc = 0;
      return;
    }
  }

  /**
   * A low ground fire (fire-ground) at (x, z), `size` m: its dome of tongues at once, then it shrinks, darkens and
   * burns down over ~3 s into embers and char (a crowded field: sooner).
   */
  private groundFire(x: number, z: number, size: number, delay: number): void {
    const o = flip();
    o.rate = 0.75;
    // From its dome of tongues (its first frames are a flat bright yellow cap).
    o.frame = 3;
    o.slowFrom = GROUND_PEAK;
    o.slowRate = this.ground.live > 12 ? 0.5 : 0.32;
    o.cool = 0.55;
    o.ground = 0;
    if (delay > 0) o.delay = delay;
    this.ground.spawn(v.set(x, 0, z), size, o);
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

  /** An authored strip lying on the ground, centred over the old seam's span. */
  private stripAt(x: number, y: number, z: number, dx: number, dz: number, span: number, size: number, life: number): void {
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const o = flip();
    o.life = life;
    // The single-cell clip's frame clock drives UV flow, including in a stream-only host.
    o.rate = 1;
    o.dir = dir.set(dx, 0, dz);
    o.span = span;
    o.cool = 0.7;
    o.fadeOut = 0;
    this.strip!.spawn(v.set(x + dx * span * 0.5, y, z + dz * span * 0.5), size, o);
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
      o.slowFrom = LOTUS_PEAK;
      o.slowRate = 0.9;
      o.until = 14;
      o.cool = 0.55;
      o.lift = 0.2;
      // In the air the lotus has no ground to hide its root: fade the root out softly (the cell's bottom edge cut
      // its white-hot root in a straight line, 03/11 check).
      o.ground = p.y - 0.55;
      this.burst.spawn(v.set(p.x, p.y - 0.55, p.z), 1.05, o);
      this.point(p.x, p.y, p.z, 0.42, 0.13, 0.2, 1, 7);
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
    this.point(p.x, p.y, p.z, 0.62 * s, 0.18 * s, 0.24, 1, 9);
    if (this.rings !== null) {
      const r = this.rings.reset();
      r.x = p.x;
      r.y = p.y;
      r.z = p.z;
      r.life = 0.3;
      r.r0 = 0.25 * s;
      r.r1 = 1.3 * s;
      r.width = 0.14;
      r.heat = 1;
      this.rings.emit();
    } else {
      const o = flip();
      o.life = 0.3;
      o.frame = HAND_PEAK;
      o.rate = (24 - HAND_PEAK) / (24 * 0.3);
      o.grow = 1.3 / 0.25 - 1;
      o.occlude = 0;
      o.fadeOut = 0;
      this.handRing!.spawn(p, 2 * 0.25 * s, o);
    }
    this.ringEmbers(p.x, p.y, p.z, 1.3 * s, 0.3, this.stage.n(big ? 14 : 9), false);
    // The flame lotus erupts behind the caster (the body stays in front of its own burst).
    this.stage.camera.getWorldDirection(camF);
    const fl = Math.hypot(camF.x, camF.z) || 1;
    const c = a.caster;
    this.lotus(c.x + (camF.x / fl) * 0.55, c.z + (camF.z / fl) * 0.55, 2.3 * s, 1.3, 2, 0, 0.55);
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
    o.slowFrom = LOTUS_PEAK;
    o.slowRate = 0.9;
    o.until = 14;
    o.cool = 0.55;
    o.lift = 0.2;
    // Its root fades softly in the air (no straight cut at the cell's edge).
    o.ground = p.y - 0.5;
    this.burst.spawn(v.set(p.x, p.y - 0.5, p.z), 1.0, o);
    this.point(p.x, p.y, p.z, 0.5, 0.15, 0.2, 1, 8);
    this.sparkRays(p.x, p.y, p.z, 1.0, 1.2);
    return true;
  }

  waiting(a: TravelArgs): boolean {
    // A blade waiting at its place smoulders: its sheath, cooler than in flight, and a rising ember now and then. With
    // the sword aura on, its flame mantle is the fire round the blade (SWORD_AURA §4.6): no sheath, the embers stay.
    const half = a.tipM * 0.5;
    if (!a.aura) this.sheathAt(a.x + a.dx * half, a.y + a.dy * half, a.z + a.dz * half, a.dx, a.dy, a.dz, a.tipM * 1.1, 0.24, 0.86 * a.u, a.blade * 3.1);
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
    // The sheath hugs the blade and runs a little past its pommel, cooling to soot there (with the aura on, its licking
    // flame mantle instead; the embers stay, 40 a second).
    const c = a.tipM * 0.35;
    if (!a.aura) this.sheathAt(a.x + a.dx * c, a.y + a.dy * c, a.z + a.dz * c, a.dx, a.dy, a.dz, a.tipM * 1.45, 0.26, 0.84, a.blade * 3.1);
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
    const k1 = a.slot === "k1";
    if (k1) {
      if (FIRE_LAB.audit.firstAt < 0) FIRE_LAB.audit.firstAt = this.stage.time;
      FIRE_LAB.audit.lastAt = this.stage.time;
      if (FIRE_LAB.impact === "brush") {
        if (this.brush.ready) {
          this.brushHit(a, s);
          return true;
        }
        FIRE_LAB.audit.missing += 1;
        if (!warnedBrush) {
          warnedBrush = true;
          console.warn("[element-fire] fire-impact-k1-r2 not loaded (art-src/lab/vfx/fire/impact-k1-r2/manifest.json): key 1 hits fall back to the lotus");
        }
      }
      FIRE_LAB.audit.lotus += 1;
      FIRE_LAB.audit.point += 1;
    }
    // Pinpoint, then the lotus opens at the beast (in front of it: the beast burns), sparks and embers fly.
    this.point(p.x, p.y, p.z, 0.75 * s, 0.22, 0.3, 1, 11);
    // It starts from a denser frame (frame 1 is a thin fringe), at the same rate.
    this.lotus(p.x + a.dx * 0.15, p.z + a.dz * 0.15, 2.0 * s, 1.25, 2, 0.7, 0.48);
    this.sparkRays(p.x, p.y, p.z, 1.5 * s, 1.35);
    this.emberBurst(p.x, p.y, p.z, 1.1 * s, 1.0);
    const n = this.stage.n(8 + Math.round(6 * a.power));
    for (let i = 0; i < n; i += 1) this.ember(p.x, p.y, p.z, a.dx, a.dz, 7, 1.0);
    if (a.big) this.stage.accent(p.x, p.y, p.z, 0.3);
    return true;
  }

  /** Key 1's hit, version 2 (ticket 264): the brushfire card, the age-0 flash and light; sparks and embers as before until CX-F. */
  private brushHit(a: ImpactArgs, s: number): void {
    const p = a.at;
    const o = flip();
    o.rot = brushRotation(a.dx, a.dz, this.stage.camera.matrixWorldInverse, this.brush.meta!.heading, BRUSH.follow, BRUSH.maxTurn);
    o.ground = 0;
    o.lift = BRUSH.lift;
    this.brush.spawn(v.set(p.x, p.y, p.z), BRUSH.size * s, o);
    const f = this.flash.spec.reset();
    f.x = p.x; f.y = p.y; f.z = p.z;
    f.life = BRUSH.flash.life;
    f.size0 = BRUSH.flash.size0 * s;
    f.size1 = BRUSH.flash.size1 * s;
    f.r = FLASH[0] * BRUSH.flash.gain; f.g = FLASH[1] * BRUSH.flash.gain; f.b = FLASH[2] * BRUSH.flash.gain;
    this.flash.emit();
    this.stage.light(p.x, p.y, p.z, a.pal.flash, BRUSH.light * (a.big ? BRUSH.bigLight : 1));
    // Until CX-F (ticket 262): the spark rays and the thrown embers, exactly as the old hit draws them.
    this.sparkRays(p.x, p.y, p.z, 1.5 * s, 1.35);
    this.emberBurst(p.x, p.y, p.z, 1.1 * s, 1.0);
    const n = this.stage.n(8 + Math.round(6 * a.power));
    for (let i = 0; i < n; i += 1) this.ember(p.x, p.y, p.z, a.dx, a.dz, 7, 1.0);
    if (a.big) this.stage.accent(p.x, p.y, p.z, 0.3);
    FIRE_LAB.audit.brush += 1;
    FIRE_LAB.audit.flash += 1;
    FIRE_LAB.audit.light += 1;
  }

  cut(a: CutArgs): boolean {
    // The owner's crescent (05/11 ~20:00): Fire's authored slash clip, the molten crescent a thin layer under it; without
    // the clip, the molten crescent across the blow as before, matter (it stays amber on pale stone, where added light
    // read as a pale arc: 03/11 recheck) with a thin white-gold core inside it.
    const thin = crescentOf(this.stage, FOLDER).cut(a.at, a.rot, a.size, null) ? 0.4 : 1;
    const b = this.slashBody.spec.reset();
    b.x = a.at.x;
    b.y = a.at.y;
    b.z = a.at.z;
    b.rot = a.rot;
    b.life = 0.16;
    b.size0 = a.size * 1.35;
    b.size1 = a.size * 1.85;
    b.r = CUT_BODY[0];
    b.g = CUT_BODY[1];
    b.b = CUT_BODY[2];
    b.a = 0.95 * thin;
    this.slashBody.emit();
    const s = this.slash.spec.reset();
    s.x = a.at.x;
    s.y = a.at.y;
    s.z = a.at.z;
    s.rot = a.rot;
    s.life = 0.12;
    s.size0 = a.size * 1.35;
    s.size1 = a.size * 1.85;
    // Gold, just under the bloom: a white-hot line bloomed into a pale arc on light stone.
    s.r = 0.72 * thin;
    s.g = 0.4 * thin;
    s.b = 0.1 * thin;
    this.slash.emit();
    return true;
  }

  /**
   * Key 2's flying crescent (owner 05/11 ~19:45, ~20:00): Fire's authored slash clip, whole, this frame only; the molten
   * crescent of `cut` a thin layer under it (alone without the clip).
   */
  flyingCut(a: FlyingCutArgs): boolean {
    const thin = crescentOf(this.stage, FOLDER).flying(a.at, a.rot, a.size, a.fade, null) ? 0.4 : 1;
    const b = this.slashBody.spec.reset();
    b.x = a.at.x;
    b.y = a.at.y;
    b.z = a.at.z;
    b.rot = a.rot;
    b.life = -1;
    b.size0 = b.size1 = a.size * 1.6;
    b.r = CUT_BODY[0];
    b.g = CUT_BODY[1];
    b.b = CUT_BODY[2];
    b.a = 0.95 * a.fade * thin;
    this.slashBody.emit();
    const s = this.slash.spec.reset();
    s.x = a.at.x;
    s.y = a.at.y;
    s.z = a.at.z;
    s.rot = a.rot;
    s.life = -1;
    s.size0 = s.size1 = a.size * 1.6;
    s.r = 0.72 * a.fade * thin;
    s.g = 0.4 * a.fade * thin;
    s.b = 0.1 * a.fade * thin;
    this.slash.emit();
    return true;
  }

  aftermath(a: AftermathArgs): boolean {
    if (a.slot === "k1" && FIRE_LAB.impact === "brush" && this.brush.ready) {
      // The brushfire burns down to embers on its own (owner 04/11): no code scorch, no ground fire; the wisps and the rising embers stay.
      this.burnGround(a.x, a.z, a.r, a.life, a.rate, false, false);
      return true;
    }
    if (a.slot === "k1") {
      FIRE_LAB.audit.scorch += 1;
      FIRE_LAB.audit.groundFire += 1;
    }
    this.burnGround(a.x, a.z, a.r, a.life, a.rate, false);
    return true;
  }

  death(a: DeathArgs): boolean {
    const p = a.at;
    const R = this.stage.rand;
    const r = Math.max(0.3, a.radius);
    // It ignites from inside, the flame collapses, it falls into embers and ash.
    this.point(p.x, p.y, p.z, Math.min(1.0, r * 1.6), 0.14, 0.34, 0.85, 9);
    const o = flip();
    o.rate = 1.1;
    o.frame = 9;
    o.slowFrom = 11;
    o.slowRate = this.crowded(0.55, 1.1);
    o.until = 14;
    o.cool = 0.45;
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
      s.life = R.range(1.4, 2.2);
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
    this.lastDt = dt;
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
    resetFireAudit();
    this.artRand.reseed(ART_RAND_SEED);
    for (const e of this.emitters) e.on = false;
    this.chargeAcc = this.shedAcc = this.waitAcc = this.midShedAcc = 0;
    SWORD_LOOK.time.value = 0;
  }

  // ── Stream hooks (myriad-swords.ts, key 7) ────────────────────────────────

  streamTravel(a: StreamTravelArgs): boolean {
    // River swords keep the shape's thin trail behind the pommel, in the fire tone (white-gold core, orange rim): ~90
    // flame cards across the field read as burning planks (03/11 captures). Their blades are hot-edged steel (Q3).
    // With the sword aura on, its tiers carry the fire (§3.A Fire): a mid sword licking flame sheds 8 embers a second.
    if (a.cls !== 0) {
      if (a.aura && a.licking && a.dissolve < 0.5) {
        this.midShedAcc += 8 * this.stage.dens * this.lastDt;
        const R = this.stage.rand;
        while (this.midShedAcc >= 1) {
          this.midShedAcc -= 1;
          const t = R.range(-0.2, 0.4) * a.len;
          this.dot(a.x + a.dx * t, a.y + a.dy * t, a.z + a.dz * t, R.range(0.08, 0.13), 0.03, R.range(0.25, 0.45), R.next() < 0.3 ? CORE : AMBER, 2, -a.dx * 2 + R.range(-0.6, 0.6), -a.dy * 2 + R.range(0.2, 1.2), -a.dz * 2 + R.range(-0.6, 0.6));
        }
      }
      // A lab-only comparison (§5.5 "tấm ván cháy"): the river's old flame cards back on (FIRE_LAB.riverSheath).
      if (FIRE_LAB.riverSheath && a.dissolve < 0.6) this.sheathAt(a.x - a.dx * a.len * 0.12, a.y - a.dy * a.len * 0.12, a.z - a.dz * a.len * 0.12, a.dx, a.dy, a.dz, a.len * 1.2, 0.26, 0.8, a.len);
      return false;
    }
    if (a.dissolve > 0.6) return true;
    // A lead blade: its sheath hugs it (its ribbon is the flame trail); with the aura on, its licking flame mantle.
    const heat = (1 - a.dissolve) * 0.86;
    if (!a.aura) this.sheathAt(a.x - a.dx * a.len * 0.12, a.y - a.dy * a.len * 0.12, a.z - a.dz * a.len * 0.12, a.dx, a.dy, a.dz, a.len * 1.2, 0.3, heat, 1.7);
    return true;
  }

  strike(a: StreamStrikeArgs): boolean {
    const k = a.k;
    if (k >= 1.3) {
      // A lead blade: the lotus at the beast.
      this.point(a.x, a.y, a.z, 0.65 * k, 0.2, 0.28, 1, 11);
      this.lotus(a.x + a.dx * 0.15, a.z + a.dz * 0.15, 1.45 * k, 1.3, 1, 0.6, 0.55);
      this.sparkRays(a.x, a.y, a.z, 1.1 * k, 1.3);
      this.emberBurst(a.x, a.y, a.z, 0.75 * k, 1.0);
      if (k >= 2) this.stage.accent(a.x, a.y, a.z, 0.22);
      return true;
    }
    // A river sword stays thin (the field-wide river must not turn into flame soup): a pinpoint, spark rays, embers.
    this.point(a.x, a.y, a.z, 0.38 * k, 0.11, 0.18, 0.9, 7);
    this.sparkRays(a.x, a.y, a.z, 0.65 * k, 0.8);
    for (let i = 0; i < 3; i += 1) this.ember(a.x, a.y, a.z, a.dx, a.dz, 5, 0.9, 1.1);
    return true;
  }

  leadStrike(a: { x: number; z: number }): boolean {
    this.lotus(a.x, a.z, 2.9, 1.15, 1, 0.3, 0.5);
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
      o.life = 2.6 + R.range(0, 0.6);
      o.rate = 0.7;
      o.frame = R.range(0, 16);
      o.cool = 0.62;
      o.dir = dir.set(ux, 0, uz);
      o.ground = 0;
      o.delay = u * 0.26;
      this.line.spawn(v.set(a.ax + dx * u, 0.2, a.az + dz * u), 0.95, o);
    }
    for (let k = 0; k < 5; k += 1) {
      const u = (k + 0.5) / 5 + R.range(-0.05, 0.05);
      this.groundFire(a.ax + dx * u, a.az + dz * u, 0.95, u * 0.26);
      this.risingEmbers(a.ax + dx * u, a.az + dz * u, 0.5, this.stage.n(7), 0.8, u * 0.26 + 1.9);
    }
    if (this.seams !== null) {
      const b = this.seams.spec.reset();
      b.x = a.ax - ux * 1.5;
      b.y = 0.08;
      b.z = a.az - uz * 1.5;
      b.dx = ux;
      b.dy = 0;
      b.dz = uz;
      b.len0 = b.len1 = l + 3;
      b.grow = 0.26;
      // A thin molten line, gold under a small bloom (white-gold x 4.5 over 0.42 m bloomed into a cream band on light
      // stone: round 3).
      b.w0 = 0.3;
      b.w1 = 0.16;
      b.life = 3.0;
      b.cr = 1.0 * 2.0;
      b.cg = 0.72 * 2.0;
      b.cb = 0.32 * 2.0;
      b.hr = ORANGE[0] * 0.85;
      b.hg = ORANGE[1] * 0.85;
      b.hb = ORANGE[2] * 0.85;
      b.fadeBase = 0.05;
      b.fadeTip = 0.05;
      this.seams.emit();
    } else {
      this.stripAt(a.ax - ux * 1.5, 0.08, a.az - uz * 1.5, ux, uz, l + 3, 0.3, 3.0);
    }
    camW.set((a.ax + a.bx) * 0.5, 0.5, (a.az + a.bz) * 0.5);
    this.stage.accent(camW.x, camW.y, camW.z, 0.45);
    return true;
  }

  /**
   * The finisher's slash as a flame (replaces the recoloured sword-qi slash): the same strip, shape and timing, drawn
   * as heat with flame tongues; embers shed off it behind the head while it burns.
   */
  finisherSlash(a: StreamSlashArgs): boolean {
    // The shape's slash (its ends, width and clock) while it shows; after it goes, the flame lingers on its own clock
    // (a longer hold and erosion than Metal's sword-qi, the shape's timing unchanged).
    const e = this.slashEnds;
    if (a.fade > 0.003) {
      e.ax = a.ax;
      e.ay = a.ay;
      e.az = a.az;
      e.bx = a.bx;
      e.by = a.by;
      e.bz = a.bz;
      e.half = a.halfPx;
      e.mask = a.mask;
      this.slashT = a.t;
      this.slashOn = true;
    } else if (this.slashOn) this.slashT += a.dt;
    if (!this.slashOn) {
      this.flameSlash.hide();
      this.slashAcc = 0;
      return true;
    }
    const t = this.slashT;
    const head = 1 - (1 - Math.min(1, t / SLASH_SWEEP_S)) ** 2;
    const erode = smooth01((t - SLASH_SWEEP_S - SLASH_HOLD_S) / SLASH_ERODE_S);
    const fade = 1 - smooth01((t - SLASH_SWEEP_S - SLASH_HOLD_S - SLASH_ERODE_S * 0.55) / (SLASH_ERODE_S * 0.45));
    if (fade <= 0.003) {
      this.flameSlash.hide();
      this.slashOn = false;
      this.slashAcc = 0;
      return true;
    }
    this.flameSlash.set(e.ax, e.ay, e.az, e.bx, e.by, e.bz, e.half * 1.3, head, fade, erode, e.mask, t, this.stage.camera);
    this.slashAcc += 90 * a.dt * fade * (1 - erode) * this.stage.dens;
    const R = this.stage.rand;
    while (this.slashAcc >= 1) {
      this.slashAcc -= 1;
      const u = R.next() * head;
      const s = this.embers.reset();
      s.x = e.ax + (e.bx - e.ax) * u + R.range(-0.3, 0.3);
      s.y = e.ay + (e.by - e.ay) * u + R.range(-0.2, 0.2);
      s.z = e.az + (e.bz - e.az) * u + R.range(-0.3, 0.3);
      s.vx = R.range(-1.2, 1.2);
      s.vy = R.range(0.6, 2.2);
      s.vz = R.range(-1.2, 1.2);
      s.drag = 1.8;
      s.rise = R.range(0.8, 1.4);
      s.life = R.range(0.9, 1.6);
      s.size = 0.08 + 0.14 * Math.pow(R.next(), 3);
      s.heat = R.range(0.8, 1.05);
      this.embers.emit();
    }
    return true;
  }

  /** A big beast's slice seam as a burning cut: a thin molten line, flame tongues licking along it, embers. */
  cutSeam(a: StreamSeamArgs): boolean {
    if (this.seams !== null) {
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
      b.life = 0.85;
      b.cr = 1.0 * 2.0;
      b.cg = 0.72 * 2.0;
      b.cb = 0.32 * 2.0;
      b.hr = ORANGE[0] * 0.8;
      b.hg = ORANGE[1] * 0.8;
      b.hb = ORANGE[2] * 0.8;
      b.fadeBase = 0.2;
      b.fadeTip = 0.2;
      this.seams.emit();
      // Flame tongues along the cut (the heat-field band, cooling to its tail), burning out over ~0.8 s.
      const o = flip();
      o.life = 0.8;
      o.rate = 1;
      o.frame = this.stage.rand.range(0, 16);
      o.dir = dir.set(a.dx, a.dy, a.dz);
      o.span = a.len * 1.05;
      o.intensity = 0.95;
      o.lift = -0.2;
      this.sheath.spawn(v.set(a.x + a.dx * a.len * 0.5, a.y + 0.1, a.z + a.dz * a.len * 0.5), 0.42, o);
    } else {
      // Keep the old sheath's random draw, so the untouched embers are identical in A/B.
      this.stage.rand.range(0, 16);
      this.stripAt(a.x, 0.08, a.z, a.dx, a.dz, a.len * 1.05, 0.42, 0.85);
    }
    this.emberBurst(a.x + a.dx * a.len * 0.5, a.y, a.z + a.dz * a.len * 0.5, 0.7, 0.95);
    return true;
  }

  /** A hero victim pinned by a lead sword: a white-gold point, a ring of fire on the ground, flame, burnt ground, embers. */
  plant(a: StreamPlantArgs): boolean {
    this.point(a.x, 0.35, a.z, 0.85, 0.22, 0.34, 1, 11);
    if (this.groundRings !== null) {
      const r = this.groundRings.reset();
      r.x = a.x;
      r.y = 0.05;
      r.z = a.z;
      r.r0 = 0.2;
      r.r1 = 1.4;
      r.life = 0.62;
      r.width = 0.11;
      r.heat = 1;
      this.groundRings.emit();
    } else {
      const o = flip();
      o.life = 0.62;
      o.frame = GROUND_RING_PEAK;
      o.grow = 1.4 / 0.2 - 1;
      o.occlude = 0;
      o.cool = 0.7;
      o.fadeOut = 0;
      this.sealRing!.spawn(v.set(a.x, 0.05, a.z), 0.4, o);
    }
    this.ringEmbers(a.x, 0.05, a.z, 1.4, 0.62, this.stage.n(10), true);
    this.lotus(a.x - a.dx * 0.1, a.z - a.dz * 0.1, 1.5, 1.4, 1, 0.3, 0.6);
    this.scorch.spawn(a.x, a.z, 1.7, SCORCH, this.stage.rand.range(0, 6.28));
    this.emberBurst(a.x, 0.3, a.z, 0.8, 1.0);
    return true;
  }

  streamReset(): void {
    this.artRand.reseed(ART_RAND_SEED);
    this.flameSlash.hide();
    this.slashAcc = 0;
    this.slashOn = false;
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
        flyingCut: (a) => this.flyingCut(a),
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

/**
 * Fire's aura matter (SWORD_AURA §3.A, "Fire"): the mantle's plates become the roots of flame tongues licking past the
 * blade's outline (sharp tips, blown back by the flight and rising), a soot rim outside, a vermilion-to-orange body
 * (hue 15–27°), amber only as a thin band by the core (≤ 15 % of the aura's pixels, it sits by the reserved gold), a
 * white-gold core only at the root by the edge. The tiers (lead swords, mid swords, far swords) are the direction's.
 */
export const FIRE_AURA: SwordAuraLook = {
  mode: "flame",
  ramp: { core: WHITE_GOLD, edge: AMBER, body: ORANGE, soot: SOOT },
  deep: VERMILION,
  coreHdr: 2.4,
  ink: { rgb: SOOT, alpha: 0.85 },
  edge: 0.85,
  flow: { speed: 0.9, perMps: 0.03, scale: 1, buoyancy: 0.3, curl: 0.2, twoPhase: false },
  breakup: 0.8,
  reachW: 1.6,
  flickerHz: 10,
  shed: "embers",
  distortion: 0,
  reduced: { flow: 0.3, flickerHz: 2 },
};

/**
 * Fire's blade (SWORD_AURA Q3, owner 03/11/2026: "Có, đổi"): dark hot-edged steel, the heat band only along the cutting
 * edges (from 0.55 of the edge field) and the steel's own body at 0.4 of its albedo, so the fire licks AROUND the blade
 * instead of the whole blade glowing orange like heated iron; the molten white-gold edge line stays.
 */
export const FIRE_BLADE: BladeLook = { mode: "furnace", edge: [3.4, 2.3, 0.95], heat: [0.9, 0.3, 0.03], char: 0.4, heatFrom: 0.55 };
/** The furnace blade before Q3 (the whole face hot iron): the lab's ?bladeHeat=furnace, for comparison only. */
export const FIRE_FURNACE_BLADE: BladeLook = { mode: "furnace", edge: [3.4, 2.3, 0.95], heat: [0.9, 0.3, 0.03], char: 0.12, heatFrom: 0.05 };

const FIRE_LAYERS = new WeakMap<ElementStage, FireLayers>();

/** Lab load time: upload textures, then compile once for the host scene and its requested render target. */
export async function prewarmFire(stage: ElementStage, renderer: THREE.WebGLRenderer, camera = stage.camera, scene: THREE.Object3D = stage.layer): Promise<void> {
  stage.hooksOf(FIRE);
  await FIRE_LAYERS.get(stage)!.prewarm(renderer, camera, scene);
}

/** Lab diagnostics only; inspecting the state never attaches or changes an effect. */
export function firePrewarmStatus(stage: ElementStage, renderer: THREE.WebGLRenderer): FirePrewarm {
  return FIRE_LAYERS.get(stage)?.prewarmStatus(renderer) ?? { prewarmed: false, textureIds: [] };
}

export const FIRE: ElementKit = {
  id: "fire",
  name: "Fire",
  verb: "compress → burst",
  ramp: { core: CORE, edge: lin("#FFB13C"), body: lin("#FF7A2A"), soot: lin("#2B1D18") },
  palette: firePalette,
  stream: FIRE_STREAM,
  trail: { widthM: 0.16, core: k3(CORE, 2), rimK: 0.8, silk: false, flame: { clip: "dragonhold-flame-trail", soot: SOOT, deep: VERMILION, amber: AMBER, core: WHITE_GOLD } },
  blade: FIRE_BLADE,
  swordAura: FIRE_AURA,
  textures: {},
  flipbooks: {
    charge: ["fire-charge"],
    release: ["fire-burst", "fire-sparks"],
    travel: ["dragonhold-flame-trail"],
    impact: ["fire-burst", "fire-sparks"],
    aftermath: ["fire-ground", "fire-trail"],
  },
  ground: SCORCH,
  // A struck beast flashes amber-gold (white-gold read as a white-pink ghost), a kill burns away from a white-gold
  // edge through amber and orange with char behind it (never coral or raw flesh: round 3).
  foe: { kind: "burn", seconds: 1.4, rgb: 0xd04a0c, flash: [1.25, 0.58, 0.09], burn: { hot: [2.2, 1.75, 0.95], mid: [1.6, 0.68, 0.05], deep: [0.85, 0.2, 0.01], char: 0.82 } },
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
  attach: (stage) => {
    const layers = new FireLayers(stage);
    FIRE_LAYERS.set(stage, layers);
    return layers.hooks();
  },
};
