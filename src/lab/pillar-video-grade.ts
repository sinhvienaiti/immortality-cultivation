/**
 * Key 8's Thunder Pillar (pillar-thunder-single) on its video card. Owner, 15/11/2026: remove the cylinder/halo pillar
 * layer and make the lightning crisp; then, on the first fix (the body cut out, sharpened hard, the haze cut): keep the
 * bright energy body, soften only its two straight vertical edges so it no longer reads as a tube, sharpen lightly, cut
 * only the very dark grey haze. On the slot playing this clip only (its own uniform), after the two frames are sampled:
 * - a light unsharp mask from four taps 1.5 texels out;
 * - only the very dark grey haze cut (light under PILLAR_BLACK to 0, eased in by PILLAR_WHITE);
 * - inside the trunk's band (x TRUNK_X ± TRUNK_HALF of the video frame, above TRUNK_FOOT), the body's smooth coloured
 *   light kept at BODY_KEEP in the middle and eased to nothing at the tube's straight edges, its outer violet glow kept
 *   out too, so no edge reads as a wall; the white bolts and every thin branch arc (a ridge, not a step) whole;
 * - a mild contrast about mid-grey;
 * - the light falls off toward the card's left and right sides (no straight edge survives), and the ground under the
 *   card darkens only from bright light (a soft knee on luminance), so no grey or dark rectangle shows behind the bolt.
 * Every other clip on the bank's slots is untouched (the uniform is 0).
 */
import type { FlipbookPool } from "../view/skills/flipbook";

export const PILLAR_VIDEO_ID = "pillar-thunder-single";
export const PILLAR_SHARPEN = 0.3;
export const PILLAR_BLACK = 0.06;
export const PILLAR_WHITE = 0.16;
export const PILLAR_CONTRAST = 1.08;
/** The body's light kept on the trunk's centre line, easing to nothing between d = BODY_SOFT and BODY_GONE (half-widths). */
export const BODY_KEEP = 0.68;
export const BODY_SOFT = 0;
/** Gone by here: the tube's straight edge sits at ~0.7 of the band's half-width (measured 15/11 in the lab: at 1.0 its
 * ~0.8 light kept a quarter, a visible step). */
export const BODY_GONE = 0.6;
/** The tube's outer glow (a violet band past its edge) stays out up to BODY_OUT half-widths; the light is whole again by
 * BODY_OUT + 1 (beyond it there are only the branch arcs, the foot burst and the haze). */
export const BODY_OUT = 2.2;
/** A thin line (a branch arc: brighter than its 1.5-texel surround by this much) is kept whatever its colour. */
export const LINE_LO = 0.03;
export const LINE_HI = 0.12;
/** A white bolt: its least channel (before the sharpening) past this; the tube's pale lavender is ~0.80–0.85. */
export const WHITE_LO = 0.88;
export const WHITE_HI = 0.97;
/** The trunk's band in the video frame (uv, y up): its centre line, the tube's half-width, its foot. */
export const TRUNK_X = 0.508;
export const TRUNK_HALF = 0.075;
export const TRUNK_FOOT = 0.26;
/** The card's light falls to nothing toward its left and right sides, from SIDE_FROM to SIDE_TO of its half-width
 * (owner 15/11: two straight vertical bands still showed at the card's edges; the brief's 0.25–0.5 also cut the side
 * arcs and the foot spray, poorer than the original clip, so it starts at half the half-width). */
export const SIDE_FROM = 0.5;
export const SIDE_TO = 0.9;
/** The ground darkens (the card's alpha) only from light past this soft knee: the haze and the sleeve add no dark band. */
export const KNEE_LO = 0.45;
/** Switch value 2 (a big card): its light fades in from FOOT_FADE[0] to FOOT_FADE[1] up the card (its foot at 0.2). */
export const FOOT_FADE: readonly [number, number] = [0.2, 0.32];
export const KNEE_HI = 0.9;

const ease = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The body's light kept at `d`, its distance from the trunk's centre line in tube half-widths. */
export function bodyKeep(d: number): number {
  const inner = BODY_KEEP * (1 - ease(BODY_SOFT, BODY_GONE, d));
  return inner + (1 - inner) * ease(BODY_OUT, BODY_OUT + 1, d);
}

const f = (x: number): string => x.toFixed(3);

/**
 * Patches a card's material; returns its switch (value 1: graded). Every path the pillar draws by takes it (owner 15/11:
 * one pillar of several still showed the tube): each video slot (on while it holds this clip) and the clip's atlas pool
 * in the key-8 library (always on), which draws when no video slot is free, when a video stalls, or with ?video=0.
 */
export function pillarVideoGrade(pool: FlipbookPool): { value: number } {
  const on = { value: 0 };
  const material = pool.mesh.material;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|pillar-video-grade-9";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const line = "  vec4 t = mix(t0, t1, w);";
    // A variant without the anchor (another shader path) is left as it is, loudly.
    if (!shader.fragmentShader.includes(line)) { console.warn("[pillar-video-grade] anchor missing: card left ungraded"); return; }
    shader.uniforms.uPillarCut = on;
    const tap = (dx: string, dy: string): string => "texture2D(uMap, vxCell(f0, clamp(uv0 + vec2(" + dx + ", " + dy + ") * pvTx, 0.004, 0.996)), uBlur).rgb";
    shader.fragmentShader = "uniform float uPillarCut;\n" + shader.fragmentShader.replace(line, line +
      "\n  if (uPillarCut > 0.5) {" +
      "\n    vec2 pvTx = 1.5 / (vec2(textureSize(uMap, 0)) / uGrid);" +
      "\n    vec3 pvR = " + tap("1.0", "0.0") + "; vec3 pvL0 = " + tap("-1.0", "0.0") + "; vec3 pvU = " + tap("0.0", "1.0") + "; vec3 pvDn = " + tap("0.0", "-1.0") + ";" +
      "\n    vec3 pvBlur = (pvR + pvL0 + pvU + pvDn) * 0.25; vec3 pvD = t.rgb - pvBlur;" +
      // A thin line is a ridge (brighter than both sides across it); the tube's straight edge is a step (one side only).
      "\n    float pvC = max(t.r, max(t.g, t.b)); float pvMin0 = min(t.r, min(t.g, t.b));" +
      "\n    float pvRidge = max(min(pvC - max(pvR.r, max(pvR.g, pvR.b)), pvC - max(pvL0.r, max(pvL0.g, pvL0.b))), min(pvC - max(pvU.r, max(pvU.g, pvU.b)), pvC - max(pvDn.r, max(pvDn.g, pvDn.b))));" +
      "\n    float pvLine = smoothstep(" + f(LINE_LO) + ", " + f(LINE_HI) + ", pvRidge);" +
      "\n    t.rgb = max(t.rgb + pvD * " + f(PILLAR_SHARPEN) + ", 0.0);" +
      "\n    t.rgb *= smoothstep(" + f(PILLAR_BLACK) + ", " + f(PILLAR_WHITE) + ", max(t.r, max(t.g, t.b)));" +
      "\n    float pvDx = abs(vUv.x - " + f(TRUNK_X) + ") / " + f(TRUNK_HALF) + ";" +
      "\n    float pvIn = " + f(BODY_KEEP) + " * (1.0 - smoothstep(" + f(BODY_SOFT) + ", " + f(BODY_GONE) + ", pvDx));" +
      "\n    float pvKeep = mix(pvIn, 1.0, smoothstep(" + f(BODY_OUT) + ", " + f(BODY_OUT + 1) + ", pvDx));" +
      "\n    float pvUp = smoothstep(" + f(TRUNK_FOOT) + ", " + f(TRUNK_FOOT + 0.1) + ", vUv.y);" +
      "\n    float pvWhite = max(smoothstep(" + f(WHITE_LO) + ", " + f(WHITE_HI) + ", pvMin0), pvLine);" +
      "\n    t.rgb *= mix(1.0, mix(pvKeep, 1.0, pvWhite), pvUp);" +
      "\n    t.rgb = max((t.rgb - 0.5) * " + f(PILLAR_CONTRAST) + " + 0.5, 0.0) * step(0.001, max(t.r, max(t.g, t.b)));" +
      // 2: drawn big (Ngũ Lôi Quy Nhất): its spray fades out toward its foot, so the ground never cuts it in a straight line.
      "\n    if (uPillarCut > 1.5) t.rgb *= smoothstep(" + f(FOOT_FADE[0]) + ", " + f(FOOT_FADE[1]) + ", vUv.y);" +      "\n    t.rgb *= 1.0 - smoothstep(" + f(SIDE_FROM) + ", " + f(SIDE_TO) + ", abs(vUv.x - 0.5) * 2.0);" +
      "\n  }");
    // The ground under the card darkens by its light (fire mode); for the pillar only from a soft knee, so the grey haze
    // and the sleeve never lay a dark rectangle behind the bolt.
    const body = "  float body = smoothstep(0.02, 0.45, lum);";
    if (shader.fragmentShader.includes(body)) shader.fragmentShader = shader.fragmentShader.replace(body, "  float body = uPillarCut > 0.5 ? smoothstep(" + f(KNEE_LO) + ", " + f(KNEE_HI) + ", lum) : smoothstep(0.02, 0.45, lum);");
  };
  return on;
}
