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

/**
 * The crescent cut across a blow (sword-skills.ts slashAt; every element's `cut`, Metal's own crescent): bigger for
 * every element (owner 05/11/2026 19:12: "dạng vệt chém nên làm to vệt đó ra nhìn cho thích của các hệ"), its size × SCALE
 * in length and width. It grows sideways and down rather than up, so the word tag over the beast stays clear: its centre
 * slides down the camera's up axis by DROP of the growth, never under FLOOR m above the ground.
 */
export const CUT = {
  scale: 1.8,
  drop: 0.5,
  floor: 0.25,
} as const;
