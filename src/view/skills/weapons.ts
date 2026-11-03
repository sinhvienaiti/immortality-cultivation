/**
 * Wave-1 weapons (docs/games/tu-tien/skills/WEAPON_DESIGN.md §6, owner
 * decision D55, 02/11/2026): a weapon is equipment and the shape source of
 * every skill. Sword-light, sabre-light and spear-images are copies of the
 * EQUIPPED weapon (silhouette, glow rail, element accent, sound), so changing
 * the weapon changes the look and sound of the whole skill set.
 *
 * Accent hex values are SKILL_CATALOG.md §1 (element "own tint"; Fire uses
 * the real flame ramp of canon D54, never the enemy red #FF4A4A). The VFX
 * colours are derived from the accent here, once, with two rules:
 * - bloom rule (LESSONS §5, VFX_STANDARD §3.5): only thin HDR cores 3–6
 *   bloom; halos, glow cards and rings stay ≤ 0.9 per channel;
 * - white-core rule (VFX_STANDARD §3.5.3): a core mixes in at most 30 % white,
 *   the rest keeps the accent; the white centre comes only from HDR
 *   saturation in its thin middle.
 * Shapes are NOT final for most weapons: a weapon without a GLB uses the
 * stand-in jian (blades.ts) until its file lands at `model`. Clear Wind has
 * its Tripo model (owner test, 02/11/2026): the caster holds it (`hold`, the
 * lab's hand prop with its tassel), the swarm draws its LOD (`swarm`), and
 * its own motifs (`motif`: a hollow jade ring, ruyi cloud curls, silk-ribbon
 * trails in the tassel's colours, pale jade and silver light) mark its skills
 * (WEAPON_DESIGN §5–6). View only; nothing here touches the sim.
 */
import * as THREE from "three";
import type { BladeFit } from "./blades";

export type WeaponFamily = "sword" | "sabre" | "spear";
export type WeaponElement = "metal" | "ice" | "thunder" | "wood" | "fire" | "earth" | "water" | "wind";
export type WeaponId =
  | "clear-wind"
  | "winter-vein"
  | "thunder-seal"
  | "verdant-branch"
  | "ember-crest"
  | "mountain-verdict"
  | "tidal-crescent"
  | "sky-thread"
  | "resonant-fang"
  | "storm-pin";

/** Linear RGB; HDR above 1 where the field says so. */
export type Rgb = readonly [number, number, number];

/** Every VFX colour a skill set takes from its weapon (linear unless a hex string). */
export interface WeaponGlow {
  /** Thin HDR core (flares, stars, slashes, sparks): max channel 3.4, the only layer that blooms; ≤ 30 % white. */
  readonly core: Rgb;
  /** Halos, blade glow cards, rings, afterimages: max channel 0.86 (≤ 0.9, no bloom). */
  readonly halo: Rgb;
  /**
   * Outer glow of the spectacle layers (aura halos, shock rings, beam and
   * ribbon halos, sigil light; D56): the element's colour pushed deeper so the
   * light reads as colour, not as a pale smear on stone. Max channel 0.86. Metal
   * takes its family's steel blue (SKILL_CATALOG §1: silver, ivory, pale steel
   * blue), so the Kiếm set keeps no gold.
   */
  readonly rim: Rgb;
  /** Trail and ribbon base, max 0.92; callers scale it ×1.6–2.6 so only the ribbon's thin centre blooms. */
  readonly body: Rgb;
  /** Spirit motes: small HDR dots, max channel 2.6, ≤ 30 % white. */
  readonly mote: Rgb;
  /** Unit-max blade flash tint (instance colour = 1 + (k − 1) × tint), ≤ 30 % white. */
  readonly tint: Rgb;
  /** Ground sigil light (max channel 0.58, the steel sigils' level) and its HDR line colour (unit max, ≤ 30 % white). */
  readonly sigil: Rgb;
  readonly sigilCore: Rgb;
  /** Impact and release light colour (sRGB hex) and the beast hit tint (0xRRGGBB). */
  readonly flash: string;
  readonly flashHex: number;
}

/**
 * A weapon's own marks in its skills (WEAPON_DESIGN §6: "every sword-light
 * carries the O ring"), drawn on top of the per-skill identities (shapes and
 * colours stay the skill's). Colours are linear, light ≤ 0.86 (no bloom).
 */
export interface WeaponMotif {
  /** A hollow jade ring (bi disc) in the sigils and impacts. */
  readonly ring: boolean;
  /** Ruyi cloud curls round the ring and in the aftermath. */
  readonly cloud: boolean;
  /** Silk-ribbon trails in the tassel's colours behind the flying copies. */
  readonly silk: boolean;
  /** The motif light: pale jade (unit colour × 0.86). */
  readonly jade: Rgb;
  /** Silver light paired with it (unit colour × 0.86). */
  readonly silver: Rgb;
  /** Silk ribbon: its light (≤ 0.9) and its deep edge (indigo). */
  readonly silkLight: Rgb;
  readonly silkDeep: Rgb;
}

/** How the caster holds the weapon (the lab's hand prop) and its tassel. Positions are shares of the model's long axis from the pommel end (0) to the tip (1). */
export interface WeaponHold {
  /** Overall length in the hand (m). */
  readonly lengthM: number;
  /** Middle of the grip. */
  readonly gripAt: number;
  /** Where the tassel hangs (the pommel's end). */
  readonly pommelAt: number;
  /** The tassel: cord, bead and silk colours (sRGB hex), its length (m); none when absent. */
  readonly tassel?: { readonly cord: string; readonly bead: string; readonly silkTop: string; readonly silkEnd: string; readonly lengthM: number };
  /** Where the blade starts (above the guard) and how the jade on it glows (soft ≤ 0.9; the ridge core is HDR 3–6). */
  readonly bladeFrom: number;
}

export interface WeaponDef {
  readonly id: WeaponId;
  /** English name, what the player reads (repo AGENTS.md, 28/10). */
  readonly name: string;
  /** Hán-Việt name, a note only. */
  readonly hanViet: string;
  readonly family: WeaponFamily;
  readonly element: WeaponElement;
  /** What identifies it at 40 px (WEAPON_DESIGN §6). */
  readonly mark: string;
  /** Element accent, SKILL_CATALOG §1 (sRGB hex). */
  readonly accent: string;
  /** A second tint: Wood's dark jade (catalog), Clear Wind's pale jade (its ring and beads; its motifs use it). The skills' own colours come from `accent`. */
  readonly accent2?: string;
  /** Fire only (D54): core → body → rim. */
  readonly ramp?: readonly [core: string, body: string, rim: string];
  /** Emissive colour of the blade's glow rail (sRGB hex); with the stand-in the whole blade carries it. */
  readonly rail: string;
  readonly glow: WeaponGlow;
  /** The weapon GLB (hero tier), dev-only lab path; the file does not exist until the design is approved. */
  readonly model: string;
  /** How the GLB maps onto the jian convention when the automatic fit guesses wrong. */
  readonly fit?: BladeFit;
  /** The textured LOD of the GLB for the mid skill swords (swarm_lod.py; the hero copies keep `model`). */
  readonly swarm?: string;
  /** The impostor atlas of the GLB for far and tiny skill swords (bake_sword_impostor.py): `<impostor>.png/-mask.png/.json`. */
  readonly impostor?: string;
  /** The weapon's own motifs in its skills (Clear Wind). */
  readonly motif?: WeaponMotif;
  /** The hand prop and tassel (Clear Wind). */
  readonly hold?: WeaponHold;
}

/** Family tints of SKILL_CATALOG §1 (the school's own colour, for UI and ink accents). */
export const FAMILY_ACCENT: Readonly<Record<WeaponFamily, string>> = {
  sword: "#A9B8C8",
  sabre: "#8C7B62",
  spear: "#3D4A7A",
};

/** Element accents of SKILL_CATALOG §1. Fire's single accent is the ramp body. */
export const ELEMENT_ACCENT: Readonly<Record<WeaponElement, string>> = {
  metal: "#D6CFC0",
  ice: "#CFE6F5",
  thunder: "#9AA6FF",
  wood: "#6E8B5E",
  fire: "#FF7A2A",
  earth: "#A08C6A",
  water: "#2E4A78",
  wind: "#BFD8C8",
};
const WOOD_JADE = "#3F6B5A";
const FIRE_RAMP = ["#FFE9C2", "#FF7A2A", "#B8321A"] as const;

/** Saturation multiplier on the accent before the VFX colours are derived (1 = the catalog hue exactly; tune in the lab). */
export const GLOW_CHROMA = 1;
/** Share of white mixed into cores, bodies, motes and tints (white-core rule: ≤ 0.3). */
export const CORE_WHITE = 0.3;
const HALO_MAX = 0.86;
const BODY_MAX = 0.92;
const CORE_MAX = 3.4;
const MOTE_MAX = 2.6;
const SIGIL_MAX = 0.58;
const FLASH_WHITE = 0.45;

/** How much deeper the rim is than the accent (linear power on the unit colour), per element. */
const RIM_GAMMA: Readonly<Record<WeaponElement, number>> = { metal: 2.6, ice: 2.0, thunder: 1.3, wood: 1.5, fire: 1, earth: 1.6, water: 1.3, wind: 1.8 };

const SRGB = THREE.SRGBColorSpace;
const hsl = { h: 0, s: 0, l: 0 };

/** Linear RGB of an sRGB hex, scaled so the largest channel is 1. */
function unitLinear(hex: string, chroma = 1): [number, number, number] {
  const c = new THREE.Color(hex);
  if (chroma !== 1) {
    c.getHSL(hsl, SRGB);
    c.setHSL(hsl.h, Math.min(1, hsl.s * chroma), hsl.l, SRGB);
  }
  const m = Math.max(c.r, c.g, c.b, 1e-6);
  return [c.r / m, c.g / m, c.b / m];
}

const mixWhite = (c: Rgb, w: number, scale: number): Rgb => [(c[0] + (1 - c[0]) * w) * scale, (c[1] + (1 - c[1]) * w) * scale, (c[2] + (1 - c[2]) * w) * scale];
const mix = (a: Rgb, b: Rgb, t: number, scale: number): Rgb => [(a[0] + (b[0] - a[0]) * t) * scale, (a[1] + (b[1] - a[1]) * t) * scale, (a[2] + (b[2] - a[2]) * t) * scale];
const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** The rail: the accent a little deeper and richer (the steel set's rail #7a90b4 is #A9B8C8 at l × 0.82, s × 1.27). */
export function railOf(hex: string): string {
  const c = new THREE.Color(hex);
  c.getHSL(hsl, SRGB);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.27), hsl.l * 0.82, SRGB);
  return "#" + c.getHexString(SRGB);
}

function flashOf(unit: Rgb): { flash: string; flashHex: number } {
  const w = mixWhite(unit, FLASH_WHITE, 1);
  const c = new THREE.Color().setRGB(w[0], w[1], w[2]);
  return { flash: "#" + c.getHexString(SRGB), flashHex: c.getHex(SRGB) };
}

/** The rim: `hex` as a unit linear colour raised to `gamma` (deeper, more saturated), max channel 0.86. */
export function rimOf(hex: string, gamma: number): Rgb {
  const u = unitLinear(hex);
  const d: Rgb = [u[0] ** gamma, u[1] ** gamma, u[2] ** gamma];
  const m = Math.max(d[0], d[1], d[2], 1e-6);
  return [(d[0] / m) * HALO_MAX, (d[1] / m) * HALO_MAX, (d[2] / m) * HALO_MAX];
}

/** VFX colours from a single element accent (every element but Fire); `rim` defaults to the accent made deeper. */
export function glowOf(accent: string, chroma = GLOW_CHROMA, rim: Rgb = rimOf(accent, 1.5)): WeaponGlow {
  const n = unitLinear(accent, chroma);
  const tint = mixWhite(n, CORE_WHITE, 1);
  return {
    core: scaled(tint, CORE_MAX),
    halo: scaled(n, HALO_MAX),
    rim,
    body: scaled(tint, BODY_MAX),
    mote: scaled(tint, MOTE_MAX),
    tint,
    sigil: scaled(n, SIGIL_MAX),
    sigilCore: tint,
    ...flashOf(n),
  };
}

/** Fire (D54): the ramp's pale core stays the core, the orange body carries halos and trails; the rim is for ink edges. */
export function glowOfRamp(ramp: readonly [string, string, string]): WeaponGlow {
  const core = unitLinear(ramp[0]);
  const body = unitLinear(ramp[1]);
  const tint = mix(body, core, CORE_WHITE, 1);
  return {
    core: scaled(core, CORE_MAX),
    halo: scaled(body, HALO_MAX),
    rim: scaled(body, HALO_MAX),
    body: scaled(tint, BODY_MAX),
    mote: scaled(core, MOTE_MAX),
    tint,
    sigil: scaled(body, SIGIL_MAX),
    sigilCore: core,
    // White mixed into orange in linear light drifts toward salmon (hue ~13°, near the enemy red): mix toward the pale core instead.
    ...flashOf(mix(body, core, 0.5, 1)),
  };
}

const MODEL_DIR = "/art-src/lab/models/weapons/";

interface Entry {
  readonly id: WeaponId;
  readonly name: string;
  readonly hanViet: string;
  readonly family: WeaponFamily;
  readonly element: WeaponElement;
  readonly mark: string;
  readonly accent2?: string;
  readonly swarm?: boolean;
  readonly motif?: WeaponMotif;
  readonly hold?: WeaponHold;
}

function weapon(e: Entry): WeaponDef {
  const fire = e.element === "fire";
  const accent = ELEMENT_ACCENT[e.element];
  const { swarm, ...rest } = e;
  // A weapon with a textured LOD has its impostor atlas too (both are built from its full model).
  return {
    ...rest,
    accent,
    ...(e.element === "wood" ? { accent2: WOOD_JADE } : {}),
    ...(fire ? { ramp: FIRE_RAMP } : {}),
    rail: railOf(accent),
    glow: fire ? glowOfRamp(FIRE_RAMP) : glowOf(accent, GLOW_CHROMA, rimOf(e.element === "metal" ? FAMILY_ACCENT[e.family] : accent, RIM_GAMMA[e.element])),
    model: MODEL_DIR + e.id + ".glb",
    ...(swarm === true ? { swarm: MODEL_DIR + e.id + "-swarm.glb", impostor: MODEL_DIR + e.id + "-impostor" } : {}),
  };
}

/** A unit-max linear colour of an sRGB hex × `k`. Load time only. */
function lightOf(hex: string, k: number): Rgb {
  const u = unitLinear(hex);
  return [u[0] * k, u[1] * k, u[2] * k];
}

/**
 * Clear Wind's jade and silk (sampled from its Tripo colour map and the
 * approved showcase x5-clearwind-heirloom: the blade's jade core, mint beads,
 * an indigo grip and a pale-blue silk tassel). The jade is pale and grey-green
 * (hue ~145°), away from the typing colour (#7FF5E0, hue ~170°, saturated).
 */
const CLEAR_WIND_JADE = "#C4E2CF";
const CLEAR_WIND_SILVER = "#DCE4EE";
const CLEAR_WIND_MOTIF: WeaponMotif = {
  ring: true,
  cloud: true,
  silk: true,
  jade: lightOf(CLEAR_WIND_JADE, 0.86),
  silver: lightOf(CLEAR_WIND_SILVER, 0.86),
  silkLight: lightOf("#A9C4EA", 0.7),
  silkDeep: lightOf("#2E3A78", 0.55),
};
const CLEAR_WIND_HOLD: WeaponHold = {
  lengthM: 1.02,
  gripAt: 0.153,
  pommelAt: 0.004,
  bladeFrom: 0.38,
  tassel: { cord: "#27305e", bead: "#b6d6c2", silkTop: "#3a4888", silkEnd: "#b8cff0", lengthM: 0.27 },
};

/** WEAPON_DESIGN §6, in its order: four swords, three sabres, three spears. */
export const WEAPONS: readonly WeaponDef[] = [
  weapon({
    id: "clear-wind",
    name: "Clear Wind",
    hanViet: "Thanh Phong",
    family: "sword",
    element: "metal",
    mark: "straight blade through a hollow jade ring; two grooves meet at the tip",
    accent2: CLEAR_WIND_JADE,
    swarm: true,
    motif: CLEAR_WIND_MOTIF,
    hold: CLEAR_WIND_HOLD,
  }),
  weapon({ id: "winter-vein", name: "Winter Vein", hanViet: "Hàn Mạch", family: "sword", element: "ice", mark: "two low hexagonal shoulders like split ice; the groove cracks in three near the tip" }),
  weapon({ id: "thunder-seal", name: "Thunder Seal", hanViet: "Lôi Ấn", family: "sword", element: "thunder", mark: "stepped square-spiral thunder-meander guard (design under review)" }),
  weapon({ id: "verdant-branch", name: "Verdant Branch", hanViet: "Bích Chi", family: "sword", element: "wood", mark: "leaf-shaped blade, offset Y guard" }),
  weapon({ id: "ember-crest", name: "Ember Crest", hanViet: "Diệm Phong", family: "sabre", element: "fire", mark: "mid-width sabre with one flame spur on the spine" }),
  weapon({ id: "mountain-verdict", name: "Mountain Verdict", hanViet: "Trấn Nhạc", family: "sabre", element: "earth", mark: "heavy sabre, three-stepped spine like a ridge" }),
  weapon({ id: "tidal-crescent", name: "Tidal Crescent", hanViet: "Triều Nguyệt", family: "sabre", element: "water", mark: "long shallow curve, never over 20°" }),
  weapon({ id: "sky-thread", name: "Sky Thread", hanViet: "Thiên Ty", family: "spear", element: "wind", mark: "long leaf head with a hollow teardrop slot" }),
  weapon({ id: "resonant-fang", name: "Resonant Fang", hanViet: "Ngân Minh", family: "spear", element: "metal", mark: "long rhombic head, hollow octagonal neck" }),
  weapon({ id: "storm-pin", name: "Storm Pin", hanViet: "Lôi Châm", family: "spear", element: "thunder", mark: "very long head with a one-stroke lightning slot" }),
];

export const DEFAULT_WEAPON: WeaponId = "clear-wind";

export function weaponById(id: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.id === id);
}

export function weaponsOf(family: WeaponFamily): readonly WeaponDef[] {
  return WEAPONS.filter((w) => w.family === family);
}
