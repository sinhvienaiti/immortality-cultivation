/**
 * Earth (canon D59, ELEMENT_LAYER §2): mass → crush. The Sword's shapes drawn with the Earth clips of
 * art-src/lab/vfx/earth/ (element-clips.ts, by role): stone and mineral with weight, cream to sand to brown stone to
 * charcoal. Every hit crushes down into the ground under the beast (ClipLook.hit "crush": the impact and a ground blow
 * at its feet) and leaves the ground cracked. Earth is matter: it covers the ground (occlude 0.9).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#FFF4DC"), edge: lin("#E2C48A"), body: lin("#A8794A"), soot: lin("#2A231C") };

export const EARTH = clipKit({
  id: "earth",
  name: "Earth",
  verb: "mass → crush",
  ramp: RAMP,
  accent: "#D8B47A",
  rim: ["#9A6A3A", 1.3],
  flashHex: 0xf2d8a8,
  stream: streamOf({ core: [1, 0.93, 0.8], halo: [0.6, 0.4, 0.18], body: [0.25, 0.15, 0.06], lit: [0.62, 0.45, 0.22], deep: [0.04, 0.03, 0.02], flash: "#f4dcb0", hitRgb: 0xe8c890, number: [0.95, 0.75, 0.4] }),
  blade: { mode: "steel", edge: [3.4, 3.0, 2.3] },
  swordAura: auraOf(RAMP, { edge: 0.9, breakup: 0.4 }),
  foe: { kind: "crushed", seconds: 1.2, rgb: 0xb08850 },
  screen: { flash: { tint: [0.45, 0.35, 0.2], strength: 0.7 }, distortion: 0 },
  trailW: 0.16,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "earth",
  look: {
    modes: {},
    heat: { soot: lin("#2A231C"), deep: lin("#A8794A"), mid: lin("#E2C48A"), core: lin("#FFF4DC") },
    occlude: 0.9,
    gain: 1,
    light: "#f0d6a8",
    hit: "crush",
    scale: 1,
    linger: 1.1,
  },
});
