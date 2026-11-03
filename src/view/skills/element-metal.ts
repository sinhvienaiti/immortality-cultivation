/**
 * Metal (canon D59, ELEMENT_LAYER §1: "the Sword set as it stands, silver-white, jade-cyan and a white-hot edge, is
 * the Metal kit"): align → shear. The base layers of sword-skills.ts and myriad-swords.ts are Metal's, so this kit
 * has no hooks; it carries the colours those layers draw with, moved here unchanged from the sword modules (the
 * per-slot palette of D55 and the power pass, key 7's cyan and white, the trail and edge light). Metal must look
 * exactly as before the element layer: change nothing here without new before/after captures.
 */
import * as THREE from "three";
import type { ElementKit, StreamTone, TrailLook } from "./element-kit";
import { GRAMMAR } from "./sword-grammar";
import { EDGE_HOT } from "./sword-material";
import type { SwordSlot } from "./sword-skills";
import { glowOf, rimOf, type Rgb, type WeaponDef, type WeaponGlow } from "./weapons";

/**
 * Each skill's accent inside the equipped weapon's palette (round 2: every
 * skill drew the same white seal): the weapon's rim mixed toward the weapon's
 * accent (`acc`), deepened (`deep`, a power on the unit colour: more
 * saturated), a hue turn in the blue range only (`hue`, degrees: never toward
 * jade, the typing colour, or red, the enemy's) and lifted toward white
 * (`light`). Clear Wind: Phi Kiếm pale steel, K1 sky steel, K2 ice cyan,
 * Hộ thân ivory champagne, Lưu Quang airy silver, K4 royal steel, K5
 * sapphire violet.
 */
interface SlotTone {
  readonly acc: number;
  readonly light: number;
  readonly deep: number;
  readonly hue: number;
}
const SLOT_TONE: Readonly<Record<SwordSlot, SlotTone>> = {
  auto: { acc: 0.15, light: 0, deep: 1.1, hue: 0 },
  k1: { acc: 0, light: 0, deep: 1.45, hue: -4 },
  k2: { acc: 0, light: 0, deep: 1.8, hue: -16 },
  guard: { acc: 0.85, light: 0, deep: 2.2, hue: 0 },
  dash: { acc: 0.3, light: 0.15, deep: 1, hue: 0 },
  k4: { acc: 0, light: 0, deep: 2.0, hue: 6 },
  k5: { acc: 0, light: 0, deep: 2.6, hue: 18 },
};

const HSL = { h: 0, s: 0, l: 0 };
/** Unit-max linear colour of an sRGB hex. Load time only (allocates). */
function unitOf(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  const m = Math.max(c.r, c.g, c.b, 1e-6);
  return [c.r / m, c.g / m, c.b / m];
}
function renorm(u: [number, number, number]): [number, number, number] {
  const m = Math.max(u[0], u[1], u[2], 1e-6);
  return [u[0] / m, u[1] / m, u[2] / m];
}
/**
 * Clear Wind's skills in its own colours (power pass, judge CJ1 03/11: "the palette is nearly all white and
 * violet"; the sword is jade, cyan and silver with a little gold): each slot's accent and rim (sRGB). Jade stays
 * near hue 150 and cyan near 195, both apart from the typing colour (#7FF5E0, hue 170); no violet.
 */
const CLEAR_WIND_TONE: Readonly<Record<SwordSlot, readonly [accent: string, rim: string]>> = {
  // Round 3a (P8): the basic shot and slot 1 in the school's white and cyan (slot 1 was jade: "a green smudge").
  auto: ["#bfeeff", "#2aaeea"],
  k1: ["#a6e4ff", "#1f9ee8"],
  k2: ["#74d0f2", "#3ba9e0"],
  guard: ["#f0e2b4", "#cfa65a"],
  dash: ["#d6e9f0", "#97c3d8"],
  k4: ["#7fdcaa", "#35b483"],
  k5: ["#86e2b6", "#41b8e0"],
};

/** The slot's VFX colours from the weapon (SLOT_TONE), through glowOf, so the bloom and white-core rules hold. Load time only. */
export function metalSkillGlow(def: WeaponDef, slot: SwordSlot): WeaponGlow {
  if (def.id === "clear-wind") {
    const [accent, rim] = CLEAR_WIND_TONE[slot];
    return glowOf(accent, 1, rimOf(rim, 1.2));
  }
  const t = SLOT_TONE[slot];
  let u = renorm([def.glow.rim[0], def.glow.rim[1], def.glow.rim[2]]);
  const acc = unitOf(def.accent);
  u = renorm([u[0] + (acc[0] - u[0]) * t.acc, u[1] + (acc[1] - u[1]) * t.acc, u[2] + (acc[2] - u[2]) * t.acc]);
  if (t.deep !== 1) u = renorm([u[0] ** t.deep, u[1] ** t.deep, u[2] ** t.deep]);
  if (t.hue !== 0) {
    const c = new THREE.Color().setRGB(u[0], u[1], u[2]);
    c.getHSL(HSL, THREE.SRGBColorSpace);
    const deg = HSL.h * 360;
    if (deg >= 185 && deg <= 255 && HSL.s > 0.05) {
      c.setHSL(HSL.h + t.hue / 360, Math.min(1, HSL.s * 1.1), HSL.l, THREE.SRGBColorSpace);
      u = renorm([c.r, c.g, c.b]);
    }
  }
  if (t.light > 0) u = renorm([u[0] + (1 - u[0]) * t.light, u[1] + (1 - u[1]) * t.light, u[2] + (1 - u[2]) * t.light]);
  const rim: Rgb = [u[0] * 0.86, u[1] * 0.86, u[2] * 0.86];
  // The slot's own accent (cores, trails, motes, flashes): half the weapon's accent, half the slot's rim.
  const a = renorm([(acc[0] + u[0]) / 2, (acc[1] + u[1]) / 2, (acc[2] + u[2]) / 2]);
  const hex = "#" + new THREE.Color().setRGB(a[0], a[1], a[2]).getHexString(THREE.SRGBColorSpace);
  return glowOf(hex, 1, rim);
}

/**
 * The thin cyan trail behind a flying sword (m wide; it starts at the pommel, never over the sword), and its light:
 * a cyan-tinted white core (HDR, a thin line) in the skill's rim.
 */
export const METAL_TRAIL: TrailLook = { widthM: 0.14, core: [0.62 * 2.2, 0.88 * 2.2, 2.2], rimK: 0.8, silk: true };

/** Key 7's light: cyan halos (≤ 0.9) and a white core (HDR in the layers). No jade, no mint, no gold. */
export const METAL_STREAM: StreamTone = {
  core: [1, 1, 1],
  halo: [0.04, 0.55, 0.95],
  trailCore: [0.62 * 1.8, 0.88 * 1.8, 1.8],
  flash: "#d6f3ff",
  hitRgb: 0x8fdcff,
  cutRgb: 0xc4ecff,
  number: [0.2, 0.72, 1.0],
  slash: { white: GRAMMAR.white, body: GRAMMAR.cyan, bodyLit: GRAMMAR.cyanLit, deep: GRAMMAR.navy },
};

export const METAL: ElementKit = {
  id: "metal",
  name: "Metal",
  verb: "align → shear",
  ramp: { core: [0.62, 0.88, 1.0], edge: [0.66, 0.72, 0.82], body: [0.05, 0.56, 0.9], soot: [0.045, 0.05, 0.065] },
  palette: metalSkillGlow,
  stream: METAL_STREAM,
  trail: METAL_TRAIL,
  blade: { mode: "steel", edge: EDGE_HOT },
  textures: {},
  flipbooks: {},
  ground: null,
  foe: null,
  screen: { flash: null, distortion: 0 },
  sound: "",
};
