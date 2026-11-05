/**
 * Thunder (canon D59, ELEMENT_LAYER §2): mark → judge. The Sword's shapes drawn with the Thunder clips of
 * art-src/lab/vfx/thunder/ (element-clips.ts, by role): violet-white lightning, self-lit. A blow marks its beast with a
 * sparkle, then judges it a beat later from the sky: the ribbon clip turned upright strikes down from the top of the
 * frame onto it (its law, ClipLook.hit "strike"), the impact bursts there and the ground under it is struck and burnt.
 * Colours (PRODUCTION_LIST_2026-11-05 §3): white → pale lilac → deep violet. Light is added over a lightly darkened
 * ground (occlude 0.35): lightning lights the field, it does not cover it.
 */
import type { StreamTone, SwordAuraLook } from "./element-kit";
import { clipKit, lin } from "./element-clips";

const WHITE = lin("#F6F0FF");
const LILAC = lin("#C2AEFF");
const VIOLET = lin("#7A4DFF");
const DEEP = lin("#3D1C9E");
const NIGHT = lin("#120826");

/** Key 7's light in thunder: white-violet cores, violet halos (≤ 0.9), a slash of violet light with a white line. */
const THUNDER_STREAM: StreamTone = {
  core: [0.97, 0.93, 1],
  halo: [0.38, 0.18, 0.95],
  trailCore: [1.9, 1.7, 2.5],
  flash: "#d6c8ff",
  hitRgb: 0xbea6ff,
  cutRgb: 0xd8c8ff,
  number: [0.7, 0.55, 1.0],
  slash: { white: [0.97, 0.94, 1], body: [0.25, 0.08, 0.7], bodyLit: [0.55, 0.35, 1], deep: [0.03, 0.01, 0.08] },
};

/** Thunder's aura matter: a violet body with hard flickering plate edges, a white core, glints shed. */
const THUNDER_AURA: SwordAuraLook = {
  mode: "qi",
  ramp: { core: [0.97, 0.94, 1], edge: [0.75, 0.65, 0.95], body: [0.35, 0.16, 0.85], soot: [0.03, 0.01, 0.07] },
  deep: [0.1, 0.03, 0.32],
  coreHdr: 3.2,
  ink: { rgb: [0.03, 0.01, 0.07], alpha: 0.4 },
  edge: 0.95,
  flow: { speed: 1.2, perMps: 0.05, scale: 1, buoyancy: 0, curl: 0, twoPhase: false },
  breakup: 0.5,
  reachW: 0.4,
  flickerHz: 14,
  shed: "glints",
  distortion: 0,
  reduced: { flow: 0.3, flickerHz: 2 },
};

export const THUNDER = clipKit({
  id: "thunder",
  name: "Thunder",
  verb: "mark → judge",
  ramp: { core: WHITE, edge: LILAC, body: VIOLET, soot: NIGHT },
  accent: "#B7A0FF",
  rim: ["#7A4DFF", 1.3],
  flashHex: 0xc8b4ff,
  stream: THUNDER_STREAM,
  blade: { mode: "steel", edge: [2.6, 2.3, 3.6] },
  swordAura: THUNDER_AURA,
  foe: { kind: "shocked", seconds: 1.2, rgb: 0x9a7bff, flash: [1.3, 1.1, 2.2] },
  screen: { flash: { tint: [0.35, 0.28, 0.6], strength: 0.9 }, distortion: 0 },
  trailW: 0.14,
  trailCore: [1.9, 1.7, 2.5],
  sound: "thunder",
  look: {
    modes: {},
    heat: { soot: NIGHT, deep: DEEP, mid: LILAC, core: WHITE },
    occlude: 0.35,
    gain: 1.05,
    light: "#c9b8ff",
    hit: "strike",
    scale: 1,
    linger: 0.8,
  },
});
