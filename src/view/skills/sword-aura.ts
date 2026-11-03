/**
 * The flying swords' aura (docs/games/tu-tien/skills/SWORD_AURA.md; the owner's pick of 03/11/2026: direction A, the
 * Wind-Silk Mantle, plus C's tip star): the weapon owns the aura's SHAPE, the element its MATTER (canon D59). This
 * module holds the shared part: the element's matter as one set of uniforms every aura layer reads (SWORD_AURA_LOOK,
 * like sword-material.ts SWORD_LOOK).
 */
import * as THREE from "three";
import type { SwordAuraLook } from "./element-kit";

/** Light bodies stay under the bloom: ≤ 0.85 a channel (the rule's 0.9, 0.05 kept in hand). */
export const AURA_BODY_MAX = 0.85;

/** Scales a colour down to `max` on its largest channel, keeping its hue (no allocation: into `out`). */
export function clampHue(c: readonly number[], max: number, out: THREE.Vector3): THREE.Vector3 {
  const m = Math.max(c[0]!, c[1]!, c[2]!, 1e-6);
  const k = m > max ? max / m : 1;
  return out.set(c[0]! * k, c[1]! * k, c[2]! * k);
}

const MODES = { qi: 0, flame: 1, water: 2 } as const;

/**
 * The element's aura matter on every aura layer (one set of uniforms, shared by reference). Colours linear; `core`
 * is the unit core × coreHdr (HDR), every other light ≤ 0.85.
 */
export const SWORD_AURA_LOOK = {
  mode: { value: 0 },
  core: { value: new THREE.Vector3(0.62 * 3, 0.88 * 3, 3) },
  edge: { value: new THREE.Vector3(0.6, 0.76, 0.85) },
  body: { value: new THREE.Vector3(0.3, 0.62, 0.85) },
  deep: { value: new THREE.Vector3(0.3, 0.62, 0.85) },
  soot: { value: new THREE.Vector3(0.02, 0.028, 0.06) },
  ink: { value: new THREE.Vector4(0.02, 0.028, 0.06, 0.35) },
  /** hardness, breakup, reach (blade widths), flicker (Hz). */
  shape: { value: new THREE.Vector4(0.7, 0.15, 0, 0) },
  /** flow speed (blade lengths/s), per m/s, scale, buoyancy. */
  flow: { value: new THREE.Vector4(0.6, 0.04, 1, 0) },
};

/** The look as applied last (the modules read flow and flicker on the CPU). */
let current: SwordAuraLook | null = null;

/** Puts an element's aura matter on every aura layer (load time; no allocation). The body is clamped ≤ 0.85. */
export function applySwordAuraLook(look: SwordAuraLook): void {
  current = look;
  const L = SWORD_AURA_LOOK;
  L.mode.value = MODES[look.mode];
  const c = look.ramp.core;
  L.core.value.set(c[0] * look.coreHdr, c[1] * look.coreHdr, c[2] * look.coreHdr);
  clampHue(look.ramp.edge, AURA_BODY_MAX, L.edge.value);
  clampHue(look.ramp.body, AURA_BODY_MAX, L.body.value);
  clampHue(look.deep ?? look.ramp.body, AURA_BODY_MAX, L.deep.value);
  L.soot.value.set(look.ramp.soot[0], look.ramp.soot[1], look.ramp.soot[2]);
  L.ink.value.set(look.ink.rgb[0], look.ink.rgb[1], look.ink.rgb[2], look.ink.alpha);
  L.shape.value.set(look.edge, look.breakup, look.reachW, look.flickerHz);
  L.flow.value.set(look.flow.speed, look.flow.perMps, look.flow.scale, look.flow.buoyancy);
}

/** The aura matter applied last (null before the first). */
export function swordAuraLook(): SwordAuraLook | null {
  return current;
}
