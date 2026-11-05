/**
 * Dark (PRODUCTION_LIST_2026-11-05 §7): devour → erase. The Sword's shapes drawn with the Dark clips of
 * art-src/lab/vfx/dark/ (element-clips.ts, by role): black-violet shadow with a violet and crimson rim, ink smoke.
 * Added light would keep only the rim (lab-flipbooks note, 18:50). A role whose smoke filmed on white is in (its
 * "body" layer) draws that smoke as near-black violet ink under the clip on black, added as the rim it was filmed as;
 * a role without one draws its clip in the heat field, its dim edge a near-black violet matter (alpha 0.85, it covers
 * the stone), the rim violet, only the brightest line pale lilac. The sparkle stays light.
 */
import { auraOf, clipKit, lin, streamOf } from "./element-clips";

const RAMP = { core: lin("#F0D8FF"), edge: lin("#B05CE0"), body: lin("#5A1E8C"), soot: lin("#0A0610") };

export const DARK = clipKit({
  id: "dark",
  name: "Dark",
  verb: "devour → erase",
  ramp: RAMP,
  accent: "#9A5AD8",
  rim: ["#5A1E8C", 1.2],
  flashHex: 0xc89ae8,
  stream: streamOf({ core: [0.92, 0.82, 1], halo: [0.35, 0.08, 0.6], body: [0.1, 0.02, 0.2], lit: [0.4, 0.12, 0.7], deep: [0.01, 0.005, 0.02], flash: "#d0a8f0", hitRgb: 0xb07ae0, number: [0.75, 0.45, 1] }),
  blade: { mode: "steel", edge: [2.6, 1.8, 3.4] },
  swordAura: auraOf(RAMP, { curl: 0.5, breakup: 0.6, ink: 0.8, shed: "none" }),
  foe: { kind: "devoured", seconds: 1.4, rgb: 0x7a3ab0 },
  screen: { flash: { tint: [0.25, 0.1, 0.35], strength: 0.8 }, distortion: 0 },
  trailW: 0.16,
  trailCore: [RAMP.core[0] * 2, RAMP.core[1] * 2, RAMP.core[2] * 2],
  sound: "dark",
  look: {
    modes: { charge: "heat", release: "heat", impact: "heat", burst: "heat", groundImpact: "heat", slash: "heat", groundMark: "heat", sheath: "heat" },
    heat: { soot: lin("#0A0610"), deep: lin("#3A1060"), mid: lin("#9A3AD0"), core: lin("#F0D8FF") },
    occlude: 0.9,
    gain: 1,
    light: "#b88ae0",
    hit: "burst",
    scale: 1,
    linger: 1.2,
    // Its smoke filmed on white (the "body" layers, lab-flipbooks 18:52): a near-black violet ink under the rim's light.
    body: lin("#1A0C2A"),
  },
});
