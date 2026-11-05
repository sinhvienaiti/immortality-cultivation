/**
 * Light (PRODUCTION_LIST_2026-11-05 §7): judge → purify. The Sword's shapes drawn with the Light clips of
 * art-src/lab/vfx/light/ (element-clips.ts, by role): holy white-gold light, halos, light feathers. Like Thunder a
 * blow is judged from the sky (ClipLook.hit "strike": the ribbon upright onto the beast when it has one), then purified
 * on the ground. Kept pale (white-gold, never Fire's amber). Light added (occlude 0.3).
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#FFFDF2"), edge: lin("#FFE9A8"), body: lin("#E8C060"), soot: lin("#2A2414") };

export const LIGHT = clipKit({
  id: "light",
  name: "Light",
  verb: "judge → purify",
  ramp: RAMP,
  accent: "#FFE6A0",
  rim: ["#D8A840", 1.4],
  flashHex: 0xfff0c8,
  stream: streamOf({ core: [1, 0.98, 0.9], halo: [0.75, 0.6, 0.25], body: [0.3, 0.22, 0.06], lit: [0.85, 0.7, 0.35], deep: [0.04, 0.03, 0.01], flash: "#fff2cc", hitRgb: 0xffe8a8, number: [1, 0.85, 0.45] }),
  blade: { mode: "steel", edge: [3.6, 3.3, 2.6] },
  swordAura: auraOf(RAMP, { edge: 0.8, breakup: 0.2 }),
  foe: { kind: "judged", seconds: 1.2, rgb: 0xf0d080 },
  screen: { flash: { tint: [0.6, 0.55, 0.4], strength: 0.8 }, distortion: 0 },
  trailW: 0.14,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "light",
  look: {
    modes: {},
    heat: { soot: lin("#2A2414"), deep: lin("#E8C060"), mid: lin("#FFE9A8"), core: lin("#FFFDF2") },
    occlude: 0.3,
    gain: 1,
    light: "#fff0c8",
    hit: "strike",
    scale: 1,
    linger: 1.0,
  },
});
