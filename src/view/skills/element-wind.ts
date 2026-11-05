/**
 * Wind (canon D59, ELEMENT_LAYER §2): pressure → sweep. The Sword's shapes drawn with the Wind clips of
 * art-src/lab/vfx/wind/ (element-clips.ts, by role): near-clear pressure with a silver-jade rim. The blow's pressure sweeps
 * on past the beast along the blow (ClipLook.hit "flow"), the ground under it is swept by a pressure ring. Colours
 * (PRODUCTION_LIST_2026-11-05 §3): near-clear, a silver-jade rim kept at hue ~136°, apart from the typing colour
 * (#7FF5E0, 169°). Light added over a lightly darkened ground (occlude 0.3): wind is barely there.
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F4FFF8"), edge: lin("#C8F0D6"), body: lin("#6ACB84"), soot: lin("#0E1E14") };

export const WIND = clipKit({
  id: "wind",
  name: "Wind",
  verb: "pressure → sweep",
  ramp: RAMP,
  accent: "#A8E8C0",
  rim: ["#3FAF6F", 1.3],
  flashHex: 0xc8f5dc,
  stream: streamOf({ core: [0.92, 1, 0.95], halo: [0.12, 0.62, 0.3], body: [0.05, 0.35, 0.16], lit: [0.3, 0.8, 0.5], deep: [0.01, 0.04, 0.02], flash: "#d8fbe8", hitRgb: 0xa8f0c4, number: [0.45, 0.95, 0.6] }),
  blade: { mode: "steel", edge: [2.4, 3.4, 2.8] },
  swordAura: auraOf(RAMP, { curl: 0.6, breakup: 0.6, edge: 0.6 }),
  foe: { kind: "swept", seconds: 1.0, rgb: 0x7ad8a0 },
  screen: { flash: { tint: [0.25, 0.45, 0.32], strength: 0.6 }, distortion: 0 },
  trailW: 0.12,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "wind",
  look: {
    modes: {},
    heat: { soot: lin("#0E1E14"), deep: lin("#6ACB84"), mid: lin("#C8F0D6"), core: lin("#F4FFF8") },
    occlude: 0.3,
    gain: 1,
    light: "#c4f2d6",
    hit: "flow",
    scale: 1,
    linger: 0.9,
  },
});
