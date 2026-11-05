/**
 * Void (PRODUCTION_LIST_2026-11-05 §7): fold → shatter. The Sword's shapes drawn with the Void clips of
 * art-src/lab/vfx/void/ (element-clips.ts, by role): space cracking like glass, a black hole bending light. A blow
 * folds the space round its beast for a beat, then it breaks (ClipLook.hit "shatter"). Deep indigo-black with white
 * violet cracks; it covers the ground (occlude 0.85).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F4F0FF"), edge: lin("#B8B0F8"), body: lin("#4A3CB0"), soot: lin("#06050E") };

export const VOID = clipKit({
  id: "void",
  name: "Void",
  verb: "fold → shatter",
  ramp: RAMP,
  accent: "#A89CF0",
  rim: ["#4A3CB0", 1.2],
  flashHex: 0xd8d0ff,
  stream: streamOf({ core: [0.95, 0.94, 1], halo: [0.2, 0.15, 0.7], body: [0.05, 0.03, 0.2], lit: [0.35, 0.3, 0.85], deep: [0.005, 0.004, 0.02], flash: "#e0dcff", hitRgb: 0xb8b0f8, number: [0.7, 0.65, 1] }),
  blade: { mode: "steel", edge: [3.0, 3.0, 3.8] },
  swordAura: auraOf(RAMP, { edge: 1, breakup: 0.4 }),
  foe: { kind: "rifted", seconds: 1.4, rgb: 0x6a5ce0 },
  screen: { flash: { tint: [0.2, 0.18, 0.4], strength: 0.8 }, distortion: 0 },
  trailW: 0.14,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "void",
  look: {
    modes: {},
    heat: { soot: lin("#06050E"), deep: lin("#4A3CB0"), mid: lin("#B8B0F8"), core: lin("#F4F0FF") },
    occlude: 0.85,
    gain: 1,
    light: "#d8d0ff",
    hit: "shatter",
    scale: 1,
    linger: 1.0,
  },
});
