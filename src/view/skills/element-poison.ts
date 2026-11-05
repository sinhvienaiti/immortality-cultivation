/**
 * Poison (PRODUCTION_LIST_2026-11-05 §7): corrode → spread. The Sword's shapes drawn with the Poison clips of
 * art-src/lab/vfx/poison/ (element-clips.ts, by role): toxic acid green with violet, acid drops and spores. Every hit
 * spreads a pool on the ground under its beast at once (ClipLook.hit "claim") that lingers and corrodes away slowly.
 * Acid yellow-green (hue ~78°, apart from Wood's ~100° and the typing colour's 169°), a violet-black under-layer.
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F4FFD8"), edge: lin("#C8F040"), body: lin("#8CC81E"), soot: lin("#1A0C24") };

export const POISON = clipKit({
  id: "poison",
  name: "Poison",
  verb: "corrode → spread",
  ramp: RAMP,
  accent: "#B8EC3A",
  rim: ["#6A9A12", 1.3],
  flashHex: 0xd8f8a0,
  stream: streamOf({ core: [0.95, 1, 0.8], halo: [0.45, 0.75, 0.05], body: [0.1, 0.25, 0.01], lit: [0.6, 0.85, 0.1], deep: [0.04, 0.01, 0.06], flash: "#e8ffb0", hitRgb: 0xc8f060, number: [0.75, 1, 0.25] }),
  blade: { mode: "steel", edge: [3.0, 3.6, 1.8] },
  swordAura: auraOf(RAMP, { curl: 0.5, breakup: 0.7, shed: "droplets" }),
  foe: { kind: "corroded", seconds: 2.0, rgb: 0x8cc828 },
  screen: { flash: { tint: [0.35, 0.45, 0.15], strength: 0.6 }, distortion: 0 },
  trailW: 0.15,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "poison",
  look: {
    modes: {},
    heat: { soot: lin("#1A0C24"), deep: lin("#8CC81E"), mid: lin("#C8F040"), core: lin("#F4FFD8") },
    occlude: 0.8,
    gain: 1,
    light: "#d8f890",
    hit: "claim",
    scale: 1,
    linger: 1.3,
  },
});
