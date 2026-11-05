/**
 * Ice (canon D59, ELEMENT_LAYER §2): stillness → shatter. The Sword's shapes drawn with the Ice clips of
 * art-src/lab/vfx/ice/ (element-clips.ts, by role): faceted ice, white to ice blue to a cold violet. A blow stills
 * its beast for a beat (crystals glint at once), then the impact shatters (ClipLook.hit "shatter"); frost spreads
 * on the ground under it. Ice is matter: its light covers the ground (occlude 0.75).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F6FBFF"), edge: lin("#BFE3FF"), body: lin("#7C9CF2"), soot: lin("#101830") };

export const ICE = clipKit({
  id: "ice",
  name: "Ice",
  verb: "stillness → shatter",
  ramp: RAMP,
  accent: "#BFDFFF",
  rim: ["#6C8CE8", 1.4],
  flashHex: 0xdaeeff,
  stream: streamOf({ core: [0.95, 0.98, 1], halo: [0.3, 0.5, 0.95], body: [0.1, 0.2, 0.6], lit: [0.5, 0.7, 1], deep: [0.01, 0.02, 0.07], flash: "#e4f2ff", hitRgb: 0xc0dcff, number: [0.6, 0.8, 1] }),
  blade: { mode: "steel", edge: [2.6, 3.2, 3.8] },
  swordAura: auraOf(RAMP, { edge: 1, breakup: 0.3 }),
  foe: { kind: "frozen", seconds: 1.8, rgb: 0x9cc4ff },
  screen: { flash: { tint: [0.35, 0.45, 0.6], strength: 0.7 }, distortion: 0 },
  trailW: 0.14,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "ice",
  look: {
    modes: {},
    heat: { soot: lin("#101830"), deep: lin("#7C9CF2"), mid: lin("#BFE3FF"), core: lin("#F6FBFF") },
    occlude: 0.75,
    gain: 1,
    light: "#cfe6ff",
    hit: "shatter",
    scale: 1,
    linger: 1.1,
  },
});
