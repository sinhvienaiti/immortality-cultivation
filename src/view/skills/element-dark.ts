/**
 * Dark (PRODUCTION_LIST_2026-11-05 §7): devour → erase. The Sword's shapes drawn with the Dark clips of
 * art-src/lab/vfx/dark/ (element-clips.ts, by role): black shadow with a coloured rim, ink smoke.
 * Added light would keep only the rim (lab-flipbooks note, 18:50). A role whose smoke filmed on white is in (its
 * "body" layer) draws that smoke as near-black ink under the clip on black, added as the rim it was filmed as;
 * a role without one draws its clip in the heat field, its dim edge a near-black matter (alpha 0.85, it covers the
 * stone), the rim in the rim colour, only the brightest line pale. The sparkle stays light.
 */
import * as THREE from "three";
import { auraOf, clipKit, lin, streamOf } from "./element-clips";
import type { Rgb } from "./weapons";

/**
 * Dark's ramp, every Dark colour derived from it (sRGB hexes, hot to dark). The owner said the v1 Dark "giống màu
 * tím" (05/11 19:12) and is choosing between A, black with deep ember-crimson rims, and B, black with cold
 * silver-grey rims: the chosen ramp replaces these six values, nothing else changes. Until then, the v1 violet.
 */
export const DARK_RAMP = {
  /** The thin brightest line (the only part that blooms). */
  core: "#F0D8FF",
  /** The rim's light. */
  rim: "#B05CE0",
  /** The body's lit end. */
  mid: "#9A3AD0",
  /** The body's deep end. */
  deep: "#3A1060",
  /** The ink of the smoke filmed on white. */
  ink: "#1A0C2A",
  /** The near-black soot. */
  soot: "#0A0610",
} as const;

const R = DARK_RAMP;
const k3 = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
/** 0xRRGGBB of an sRGB hex. */
const hex = (s: string): number => new THREE.Color(s).getHex(THREE.SRGBColorSpace);
const CORE = lin(R.core);
const RIM = lin(R.rim);
const MID = lin(R.mid);
const DEEP = lin(R.deep);
const SOOT = lin(R.soot);
const RAMP = { core: CORE, edge: RIM, body: DEEP, soot: SOOT };

export const DARK = clipKit({
  id: "dark",
  name: "Dark",
  verb: "devour → erase",
  ramp: RAMP,
  accent: R.rim,
  rim: [R.deep, 1.2],
  flashHex: hex(R.rim),
  stream: streamOf({ core: CORE, halo: k3(RIM, 0.6), body: k3(DEEP, 0.5), lit: MID, deep: SOOT, flash: R.rim, hitRgb: hex(R.rim), number: RIM }),
  blade: { mode: "steel", edge: k3(CORE, 3.4) },
  swordAura: auraOf(RAMP, { curl: 0.5, breakup: 0.6, ink: 0.8, shed: "none" }),
  foe: { kind: "devoured", seconds: 1.4, rgb: hex(R.mid) },
  screen: { flash: { tint: k3(DEEP, 0.6), strength: 0.8 }, distortion: 0 },
  trailW: 0.16,
  trailCore: k3(CORE, 2),
  sound: "dark",
  look: {
    modes: { charge: "heat", release: "heat", impact: "heat", burst: "heat", groundImpact: "heat", slash: "heat", groundMark: "heat", sheath: "heat" },
    heat: { soot: SOOT, deep: DEEP, mid: MID, core: CORE },
    occlude: 0.9,
    gain: 1,
    light: R.rim,
    hit: "burst",
    scale: 1,
    linger: 1.2,
    // Its smoke filmed on white (the "body" layers, lab-flipbooks 18:52): a near-black ink under the rim's light.
    body: lin(R.ink),
  },
});
