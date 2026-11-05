/**
 * Wood (canon D59, ELEMENT_LAYER §2): grow → claim. The Sword's shapes drawn with the Wood clips of
 * art-src/lab/vfx/wood/ (element-clips.ts, by role): lime-white to young green to jade-green, leaves and pollen. Every
 * hit claims the ground under its beast (ClipLook.hit "claim": the impact and roots spreading at its feet at once).
 * Hues kept at ~100°, apart from the typing colour (#7FF5E0, 169°). Living matter: it covers the ground (occlude 0.8).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F8FFE6"), edge: lin("#CDEB7A"), body: lin("#5FAE3A"), soot: lin("#142010") };

export const WOOD = clipKit({
  id: "wood",
  name: "Wood",
  verb: "grow → claim",
  ramp: RAMP,
  accent: "#B6E06A",
  rim: ["#4E9A2E", 1.3],
  flashHex: 0xdcf5a8,
  stream: streamOf({ core: [0.97, 1, 0.88], halo: [0.3, 0.7, 0.1], body: [0.08, 0.3, 0.03], lit: [0.45, 0.8, 0.2], deep: [0.02, 0.04, 0.01], flash: "#e6f8c0", hitRgb: 0xc8ec88, number: [0.65, 0.95, 0.3] }),
  blade: { mode: "steel", edge: [2.8, 3.4, 2.2] },
  swordAura: auraOf(RAMP, { curl: 0.4, breakup: 0.5 }),
  foe: { kind: "rooted", seconds: 1.6, rgb: 0x6aa83a },
  screen: { flash: { tint: [0.35, 0.5, 0.2], strength: 0.6 }, distortion: 0 },
  trailW: 0.15,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "wood",
  look: {
    modes: {},
    heat: { soot: lin("#142010"), deep: lin("#5FAE3A"), mid: lin("#CDEB7A"), core: lin("#F8FFE6") },
    occlude: 0.8,
    gain: 1,
    light: "#d8f2a8",
    hit: "claim",
    scale: 1,
    linger: 1.1,
  },
});
