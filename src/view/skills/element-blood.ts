/**
 * Blood (PRODUCTION_LIST_2026-11-05 §7): drain → bloom. The Sword's shapes drawn with the Blood clips of
 * art-src/lab/vfx/blood/ (element-clips.ts, by role): deep crimson energy, blood mist, red crystals. Every hit blooms
 * at its beast and its light is drained back toward the caster (ClipLook.hit "drain"). Crimson held at hue ~338°,
 * dark, apart from the enemy warning red #FF4A4A (D54). It covers the ground (occlude 0.85).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#FFE4EC"), edge: lin("#F0708C"), body: lin("#9A0E46"), soot: lin("#1A0408") };

export const BLOOD = clipKit({
  id: "blood",
  name: "Blood",
  verb: "drain → bloom",
  ramp: RAMP,
  accent: "#E0507A",
  rim: ["#9A0E46", 1.2],
  flashHex: 0xf0a0b8,
  stream: streamOf({ core: [1, 0.88, 0.92], halo: [0.65, 0.03, 0.18], body: [0.25, 0.005, 0.05], lit: [0.75, 0.1, 0.25], deep: [0.04, 0.003, 0.01], flash: "#f4b0c4", hitRgb: 0xe86890, number: [1, 0.4, 0.55] }),
  blade: { mode: "steel", edge: [3.6, 2.0, 2.6] },
  swordAura: auraOf(RAMP, { curl: 0.4, breakup: 0.5, shed: "droplets" }),
  foe: { kind: "drained", seconds: 1.4, rgb: 0xb0204c },
  screen: { flash: { tint: [0.45, 0.08, 0.15], strength: 0.8 }, distortion: 0 },
  trailW: 0.15,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "blood",
  look: {
    modes: {},
    heat: { soot: lin("#1A0408"), deep: lin("#9A0E46"), mid: lin("#F0708C"), core: lin("#FFE4EC") },
    occlude: 0.85,
    gain: 1,
    light: "#f0a0b8",
    hit: "drain",
    scale: 1,
    linger: 1.1,
  },
});
