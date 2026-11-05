/**
 * Water (canon D59, ELEMENT_LAYER §2): flow → engulf. The Sword's shapes drawn with the Water clips of
 * art-src/lab/vfx/water/ (element-clips.ts, by role): deep-blue spirit water with hard white foam edges and caustic
 * light, gathering at the hand, wrapped round the blades, and on a hit flowing on past the beast as a wave instead of
 * stopping at it (its law, ClipLook.hit "flow"); every blow reaches the ground (a ground blow and its ripple mark).
 * Colours (PRODUCTION_LIST_2026-11-05 §3): white → clear blue → deep indigo, white foam; hue ~205–225°, apart from the
 * typing colour (#7FF5E0, 169°). The clips keep their own colours, drawn as light over a ground they cover by their
 * light (occlude 0.9): the body reads as water matter on pale stone, never a pale blue veil.
 */
import type { StreamTone, SwordAuraLook } from "./element-kit";
import { clipKit, lin } from "./element-clips";

const FOAM = lin("#F2FBFF");
const CLEAR = lin("#8FD3FF");
const BLUE = lin("#2A78E0");
const DEEP = lin("#0E3C9E");
const INDIGO = lin("#081438");

/** Key 7's light in water: white-blue cores, deep blue halos (≤ 0.9), a slash of indigo water with a foam line. */
const WATER_STREAM: StreamTone = {
  core: [0.86, 0.95, 1],
  halo: [0.04, 0.32, 0.88],
  trailCore: [1.3, 1.75, 2.3],
  flash: "#9fd2ff",
  hitRgb: 0x5aa6ff,
  cutRgb: 0x8cc6ff,
  number: [0.25, 0.6, 1.0],
  slash: { white: [0.86, 0.95, 1], body: [0.02, 0.17, 0.6], bodyLit: [0.12, 0.45, 0.95], deep: [0.005, 0.015, 0.06] },
};

/** Water's aura matter (SWORD_AURA §4.8): a deep blue body flowing in an S along the blade, hard foam lines, droplets. */
const WATER_AURA: SwordAuraLook = {
  mode: "water",
  ramp: { core: [0.86, 0.95, 1], edge: [0.55, 0.8, 0.95], body: [0.05, 0.3, 0.85], soot: [0.01, 0.02, 0.07] },
  deep: [0.01, 0.06, 0.25],
  coreHdr: 2.6,
  ink: { rgb: [0.01, 0.02, 0.07], alpha: 0.5 },
  edge: 0.9,
  flow: { speed: 0.8, perMps: 0.04, scale: 1, buoyancy: 0, curl: 1, twoPhase: true },
  breakup: 0.45,
  reachW: 0.6,
  flickerHz: 0,
  shed: "droplets",
  distortion: 0,
  reduced: { flow: 0.3, flickerHz: 0 },
};

export const WATER = clipKit({
  id: "water",
  name: "Water",
  verb: "flow → engulf",
  ramp: { core: FOAM, edge: CLEAR, body: BLUE, soot: INDIGO },
  accent: "#4FA6F0",
  rim: ["#1E5FD0", 1.3],
  flashHex: 0x6ab8ff,
  stream: WATER_STREAM,
  // Steel with a cold white-blue edge line (the water wraps round it; the blade stays a blade).
  blade: { mode: "steel", edge: [1.5, 2.6, 3.6] },
  swordAura: WATER_AURA,
  foe: { kind: "wet", seconds: 1.6, rgb: 0x2e6ad0, flash: [0.55, 1.0, 1.7] },
  screen: { flash: { tint: [0.1, 0.3, 0.6], strength: 0.8 }, distortion: 0 },
  trailW: 0.18,
  trailCore: [1.3, 1.75, 2.3],
  sound: "water",
  look: {
    modes: {},
    heat: { soot: INDIGO, deep: DEEP, mid: CLEAR, core: FOAM },
    occlude: 0.9,
    gain: 1,
    light: "#7cc2ff",
    hit: "flow",
    scale: 1,
    linger: 1.2,
  },
});
