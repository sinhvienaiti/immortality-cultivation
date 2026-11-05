/**
 * Star (PRODUCTION_LIST_2026-11-05 §7): align → descend. The Sword's shapes drawn with the Star clips of
 * art-src/lab/vfx/star/ (element-clips.ts, by role): white-blue constellation lines, star dust, nebula. A blow aligns a
 * star over its beast, then it descends from the sky onto it (ClipLook.hit "strike") and marks the ground. Light
 * added (occlude 0.3).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F8FAFF"), edge: lin("#C8D8FF"), body: lin("#6A6AE8"), soot: lin("#080A1A") };

export const STAR = clipKit({
  id: "star",
  name: "Star",
  verb: "align → descend",
  ramp: RAMP,
  accent: "#C8D4FF",
  rim: ["#5A6AE0", 1.3],
  flashHex: 0xe0e8ff,
  stream: streamOf({ core: [0.97, 0.98, 1], halo: [0.3, 0.38, 0.9], body: [0.06, 0.08, 0.3], lit: [0.45, 0.55, 1], deep: [0.01, 0.01, 0.04], flash: "#e8eeff", hitRgb: 0xc8d4ff, number: [0.7, 0.78, 1] }),
  blade: { mode: "steel", edge: [3.2, 3.4, 3.8] },
  swordAura: auraOf(RAMP, { edge: 0.7, breakup: 0.3 }),
  foe: { kind: "starfall", seconds: 1.2, rgb: 0x8a9cf0 },
  screen: { flash: { tint: [0.3, 0.32, 0.5], strength: 0.7 }, distortion: 0 },
  trailW: 0.13,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "star",
  look: {
    modes: {},
    heat: { soot: lin("#080A1A"), deep: lin("#6A6AE8"), mid: lin("#C8D8FF"), core: lin("#F8FAFF") },
    occlude: 0.3,
    gain: 1,
    light: "#dfe6ff",
    hit: "strike",
    scale: 1,
    linger: 1.0,
  },
});
