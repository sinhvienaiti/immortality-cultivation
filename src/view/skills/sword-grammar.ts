/**
 * The Sword school's light palette (power pass round 3a; linear): the HDR white of cores and spines (cyan-tinted,
 * so its bloom reads cyan), cyan bodies (≤ 0.9), deep navy for dark rims and platinum. Used by the VFX around the
 * swords (the sky gate, light strips, the finisher's slash). The swords themselves are the equipped weapon's real
 * model (blades.ts, real-swords.ts; owner 03/11/2026): the drawn sword strips that lived here (LEAD, MID, FAR,
 * SPINE) are gone.
 */
export const GRAMMAR = {
  white: [0.62, 0.88, 1.0] as const,
  cyan: [0.0, 0.26, 0.76] as const,
  cyanLit: [0.05, 0.56, 0.9] as const,
  navy: [0.004, 0.014, 0.05] as const,
  platinum: [0.66, 0.72, 0.82] as const,
} as const;
