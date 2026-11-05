/**
 * Dark (PRODUCTION_LIST_2026-11-05 §7): devour → erase. The Sword's shapes drawn with the Dark clips of
 * art-src/lab/vfx/dark/ (element-clips.ts, by role): black shadow and ink smoke, only its rims, cracks and sparks
 * glowing ember crimson (the owner's palette A, 05/11 19:20). Smoke and ink, apart from Blood's glossy crimson-pink liquid.
 * Added light would keep only the rim (lab-flipbooks note, 18:50). A role whose smoke filmed on white is in (its
 * "body" layer) draws that smoke as near-black ink under the clip on black, added as the rim it was filmed as;
 * a role without one draws its clip in the heat field, its dim edge a near-black matter (alpha 0.85, it covers the
 * stone), the rim in the rim colour, only the brightest line pale. The sparkle stays light.
 */
import * as THREE from "three";
import { auraOf, clipKit, lin, streamOf } from "./element-clips";
import type { ElementKit } from "./element-kit";
import type { Rgb } from "./weapons";

/**
 * Dark's ramp, every Dark colour derived from it (sRGB hexes, hot to dark). The owner said the v1 Dark "giống màu
 * tím" (05/11 19:12) and picked palette A at 19:20, "đen đỏ thẫm": black with dark-crimson ember rims, no purple or
 * violet anywhere. Core, rim, deep and soot are the coordinator's ramp (core #FFE2CC, edge #D0301F, body #6A0D18,
 * soot #1C050B); mid sits between rim and body, ink is the near-black smoke. Most of Dark reads black.
 */
export const DARK_RAMP = {
  /** The thin hottest line, ember white (the only part that blooms). */
  core: "#FFE2CC",
  /** The rim's ember light. */
  rim: "#D0301F",
  /** The body's lit end. */
  mid: "#9A1A1A",
  /** The body's deep end, dark crimson. */
  deep: "#6A0D18",
  /** The ink of the smoke filmed on white, near black. */
  ink: "#12050A",
  /** The near-black soot. */
  soot: "#1C050B",
} as const;

/**
 * The v1 purple atlases (i2v-dark-slash-arc, i2v-dark-ground-mark; owner 19:20, their videos moved to
 * video-rejected-dark-purple/): ignored while the manifest still lists them, so Dark draws from its ramp until the
 * palette-A redraws land.
 */
const PURPLE_V1 = ["4b87786fec45844738b4a6b32ca6e76b", "886dbf524e3d53a4a4da1423e0cd67fe"];

/** One Dark palette: six sRGB hexes, hot to dark (DARK_RAMP's fields). */
export type DarkRamp = { readonly [K in keyof typeof DARK_RAMP]: string };

/**
 * Palette B, for the owner to compare with A in the lab (05/11 ~19:35: "đen, viền xám bạc như mực dưới ánh trăng"):
 * black ink under moonlight, cold silver-grey rims. The coordinator's ramp (core #F6F9FF, edge #9CAAC0, body #343C48,
 * soot #0E1116); mid and ink between. The lab's ?dark=b registers it in place of A (DARK_B).
 */
export const DARK_RAMP_B: DarkRamp = {
  core: "#F6F9FF",
  rim: "#9CAAC0",
  mid: "#5E6A7C",
  deep: "#343C48",
  ink: "#0B0D11",
  soot: "#0E1116",
};

const k3 = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
/** 0xRRGGBB of an sRGB hex. */
const hex = (s: string): number => new THREE.Color(s).getHex(THREE.SRGBColorSpace);

/** The Dark kit in palette `R` (every Dark colour derived from it; load time). */
function darkKit(R: DarkRamp, name: string): ElementKit {
  const CORE = lin(R.core);
  const RIM = lin(R.rim);
  const MID = lin(R.mid);
  const DEEP = lin(R.deep);
  const SOOT = lin(R.soot);
  const RAMP = { core: CORE, edge: RIM, body: DEEP, soot: SOOT };
  return clipKit({
    id: "dark",
    name,
    verb: "devour → erase",
    ramp: RAMP,
    accent: R.rim,
    rim: [R.deep, 1.2],
    // Cores in the ramp's own pale over the rim (palette A: the rim mixed toward white read salmon pink, Blood's side).
    glowRamp: [R.core, R.rim, R.deep],
    flashHex: hex(R.rim),
    stream: streamOf({ core: CORE, halo: k3(RIM, 0.6), body: k3(DEEP, 0.5), lit: MID, deep: SOOT, flash: R.rim, hitRgb: hex(R.rim), number: RIM }),
    blade: { mode: "steel", edge: k3(CORE, 3.4) },
    swordAura: auraOf(RAMP, { curl: 0.5, breakup: 0.6, ink: 0.8, shed: "none" }),
    foe: { kind: "devoured", seconds: 1.4, rgb: hex(R.mid) },
    screen: { flash: { tint: k3(DEEP, 0.6), strength: 0.8 }, distortion: 0 },
    trailW: 0.16,
    trailCore: k3(CORE, 2),
    sound: "dark",
    rejected: PURPLE_V1,
    // The owner's palette-A crescent (Codex 299) as its slash until dark-slash-arc-a's video lands (owner ~20:50).
    stillSlash: "/art-src/lab/firefly-sprint-2026-11-05/stills/skills/dark-slash-arc-a.v1-try2.png",
    look: {
      modes: { charge: "heat", release: "heat", impact: "heat", burst: "heat", groundImpact: "heat", slash: "heat", groundMark: "heat", sheath: "heat" },
      // Most of Dark reads black: the heat field's body runs from a crimson-black up to the ember rim, only its
      // brightest line ember white (owner 19:20 palette A; ~20:50 the slash read as red paint).
      heat: { soot: SOOT, deep: k3(DEEP, 0.35), mid: RIM, core: CORE },
      occlude: 0.9,
      gain: 1,
      light: R.rim,
      hit: "burst",
      scale: 1,
      linger: 1.2,
      // Its smoke filmed on white (the "body" layers, lab-flipbooks 18:52): a near-black ink under the rim's light.
      body: lin(R.ink),
      // The still's dim smoke falls in the soot band (black matter), its edge crimson, only its brightest line ember white.
      slashHeat: 0.7,
    },
  });
}

/** Dark in palette A, the owner's pick (the registered default). */
export const DARK = darkKit(DARK_RAMP, "Dark");
/** Dark in palette B, for the lab's comparison only (?dark=b). */
export const DARK_B = darkKit(DARK_RAMP_B, "Dark (palette B, silver ink)");
