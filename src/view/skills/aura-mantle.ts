/**
 * Direction A of the sword aura, the Wind-Silk Mantle, with C's tip star (docs/games/tu-tien/skills/SWORD_AURA.md §3.A,
 * the TipStar row; the owner's pick of 03/11/2026: "A + sao mũi của C"):
 *
 *   Clear Wind wears a tailored mantle of living qi: sharp qi plates lie flush along both edges in flight and shear
 *   apart on every cut, part around the jade ring, sew their two hems into a needle past the tip, and pour off the
 *   pommel as a tassel-silk tail.
 *
 * Layers (each with its switch, intensity and reduced-motion rule, SwordAura.layers):
 * - MantleSheath: one instanced draw of screen-space cards laid along each lead and mid sword (sword-aura.ts records).
 *   The card is analytic in its fragment: the blade's outline from the weapon's measured profile (AuraAnchors, never
 *   over the blade face), a 1 px ink gap at the steel (§2.7, accepted), the mantle 0.55 W wide (≥ 2 CSS px; 3 at a
 *   release or a hit) in staggered plates with V fronts (4 a side, 3 on Low and Medium; ?plates=graded: 2–3 graded
 *   plates, dense at the tip, thinning to threads at the collar), the hand-painted qi streak flowing tip to pommel in
 *   each plate, two seams on its outer hems meeting in a needle past the tip, glints travelling the seams, a cloud-curl
 *   hem at the collar, an ink rim outside; a mid sword's mantle pours into a tail behind its pommel (its trail).
 *   Fire draws the same card as matter on fire: licking flame tongues past the outline (lead blades, key 1, ≤ 8 mid
 *   swords), an ember mantle on the other mid swords.
 * - TipStar: one instanced draw of four-point stars at the tip (+0.02 L, at the needle's root): its long arm along the
 *   flight (0.12 L), cross arm 0.04 L, a ≤ 2 px core (HDR), an ink star 1.3× behind in the same shader, twinkling.
 *   Fire: a sun-ray, its arms flame leaves round a white-gold core.
 * - SilkTail (fxkit RibbonPool moded program, the sword modules) and MantleHalo (real-swords.ts, far swords).
 * Only thin cores are HDR (seams at f0–2 of a release or a hit, glints ≤ 1 px, the star's core); bodies ≤ 0.85; ink in
 * the same shader as the light (premultiplied). View only; no allocation per frame.
 */
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AuraAnchors } from "./blades";
import { profileMax } from "./blades";
import type { ElementKit } from "./element-kit";
import { AURA_FADE, AURA_LEAD, AURA_STRIKE, AURA_WAIT, profileTexture, SWORD_AURA_LOOK, hash01, type AuraDrawer, type AuraLayerName, type AuraRecord, type SwordAura } from "./sword-aura";
import { FaceRoll } from "./sword-material";

/** The direction's numbers (SWORD_AURA §3.A). L: the sword pommel to tip; W: the blade's widest width. */
export const MANTLE = {
  /** Mantle half width over the blade's width, and its CSS px floors in flight and at a release or a hit. */
  widthW: 0.55,
  floorPx: 2,
  floorHitPx: 3,
  /** Needle past the tip (share of L) and the tip star's place past the tip (share of L). */
  needle: 0.12,
  starAt: 0.02,
  /** A mid sword's tail behind its pommel (share of L): in flight, diving. */
  tail: 0.35,
  tailDive: 0.6,
  /** Plates a side by tier. */
  plates: { low: 3, medium: 3, high: 4, ultra: 4 } as const,
  /** Breathing while waiting: period (s) and swing. */
  breatheS: 2.4,
  breathe: 0.08,
  /** A release: the width surges this much and settles by frame 18; the plates open collar to tip over 4 frames. */
  surge: 0.3,
  /** A turn (ω from 4 to 10 rad/s): the outer side widens 1.6×, the inner narrows 0.7×, the outer plates shear 0.5. */
  turnFrom: 4,
  turnFull: 10,
  /** Fire: the tongues' reach past the root (blade widths) is the element's (SwordAuraLook.reachW). */
} as const;

/** Lead blades and key 1 always wear a star; a mid sword only on the stream's bright crest or diving (§3.C). */
const STAR_BRIGHT = 0.7;

// ── Cards (MantleSheath) ─────────────────────────────────────────────────────

const CARD_VERTEX = /* glsl */ `
attribute vec4 iG;   // guard xyz, blade length guard to tip (m)
attribute vec4 iD;   // unit tip direction, pommelY (unit)
attribute vec4 iW;   // width × on the + side, on the − side, shear + side, − side
attribute vec4 iF;   // alpha, dissolve, seam core (0 … 1), flow phase (blade lengths)
attribute vec4 iP;   // seed, flame (0 qi, 1 licking, 2 ember), tail (unit), reveal (0 … 1)
attribute vec4 iX;   // drawn width share, strike erosion, glints, extent (half widths)
uniform vec2 uView;
uniform float uDpr;
uniform vec4 uAnch;  // bladeFrom, profile max (unit), needle (share of L), plates
uniform float uBladeW; // the blade's width W (unit): twice its median half width at mid-blade (not the root's flare)
varying vec2 vS0;
varying vec2 vAx;
varying vec3 vSpan;  // screen length (px), clip w at the two ends
varying vec2 vY;     // unit y at the two ends
varying float vP11;
varying vec4 vG;
varying vec4 vD;
varying vec4 vW;
varying vec4 vF;
varying vec4 vP;
varying vec4 vX;
varying vec2 vUp;    // world up on screen: along the axis, across (+ side)
void main() {
  vG = iG; vD = iD; vW = iW; vF = iF; vP = iP; vX = iX;
  float B = iG.w;
  float pom = iD.w;
  float Lu = 1.0 - pom;
  float y0 = iP.z > 0.0 ? pom - iP.z : uAnch.x + 0.02 * Lu;
  float y1 = 1.0 + uAnch.z * Lu * 1.08;
  vY = vec2(y0, y1);
  vec3 a0 = iG.xyz + iD.xyz * (y0 * B);
  vec3 a1 = iG.xyz + iD.xyz * (y1 * B);
  // Behind the blade in depth (0.08 m): the real sword always wins where they meet.
  vec3 e0 = a0 - cameraPosition;
  vec3 e1 = a1 - cameraPosition;
  a0 += e0 / max(length(e0), 1e-3) * 0.08;
  a1 += e1 / max(length(e1), 1e-3) * 0.08;
  vec4 c0 = projectionMatrix * viewMatrix * vec4(a0, 1.0);
  vec4 c1 = projectionMatrix * viewMatrix * vec4(a1, 1.0);
  vP11 = projectionMatrix[1][1];
  if (c0.w < 0.05 || c1.w < 0.05 || iF.x <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 s0 = (c0.xy / c0.w * 0.5 + 0.5) * uView;
  vec2 s1 = (c1.xy / c1.w * 0.5 + 0.5) * uView;
  vec2 d = s1 - s0;
  float Lp = length(d);
  vec2 ax = Lp > 1e-3 ? d / Lp : vec2(1.0, 0.0);
  vec2 nrm = vec2(-ax.y, ax.x);
  vS0 = s0;
  vAx = ax;
  vSpan = vec3(max(Lp, 1e-3), c0.w, c1.w);
  // World up on screen at the sword (Fire's tongues rise).
  vec4 cu = projectionMatrix * viewMatrix * vec4(a0 + vec3(0.0, 0.5, 0.0), 1.0);
  vec2 su = (cu.xy / max(cu.w, 0.05) * 0.5 + 0.5) * uView - s0;
  float sl = length(su);
  su = sl > 1e-3 ? su / sl : vec2(0.0, 1.0);
  vUp = vec2(dot(su, ax), dot(su, nrm));
  // Half height: the blade's widest half at the nearer end, its mantle at the widest it may grow, the floors.
  float pxPerM = projectionMatrix[1][1] * 0.5 * uView.y / min(c0.w, c1.w);
  float halfMax = max(uAnch.y, uBladeW) * B * pxPerM * iX.x;
  float H = halfMax * (1.0 + iX.w * max(iW.x, iW.y)) + 10.0 * uDpr;
  float u = position.x + 0.5;
  float y = position.y * 2.0;
  vec2 p = mix(s0 - ax * 2.0 * uDpr, s1 + ax * 2.0 * uDpr, u) + nrm * (y * H);
  float w = mix(c0.w, c1.w, u);
  float z = mix(c0.z / c0.w, c1.z / c1.w, u);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
}`;

const CARD_FRAGMENT = /* glsl */ `
uniform vec2 uView;
uniform float uDpr;
uniform vec4 uAnch;
uniform float uBladeW;
uniform sampler2D tProfile;
uniform sampler2D tStreak;
uniform vec4 uOpt;      // streak on, streak layers (1–3), graded plates, reduced motion
uniform float uTime;
uniform float uLayer;   // the layer's intensity
uniform float uMode;    // the element's mode: 0 qi, 1 flame
uniform vec3 uBody;
uniform vec3 uEdge;
uniform vec3 uDeep;
uniform vec3 uSoot;
uniform vec3 uCore;
uniform vec4 uInk;
uniform vec4 uShape;    // hardness, breakup, reach (blade widths), flicker (Hz)
varying vec2 vS0;
varying vec2 vAx;
varying vec3 vSpan;
varying vec2 vY;
varying float vP11;
varying vec4 vG;
varying vec4 vD;
varying vec4 vW;
varying vec4 vF;
varying vec4 vP;
varying vec4 vX;
varying vec2 vUp;
float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), u.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** 1 inside [a, b] with a soft pixel at each end (x, a, b in px). */
float band(float x, float a, float b) {
  return clamp(x - a + 0.5, 0.0, 1.0) * clamp(b - x + 0.5, 0.0, 1.0);
}
float streak(vec2 uv) {
  float s = texture2D(tStreak, uv).r;
  if (uOpt.y > 1.5) s = max(s, 0.6 * texture2D(tStreak, vec2(uv.x * 0.57 + 0.31, uv.y)).r);
  if (uOpt.y > 2.5) s = max(s, 0.45 * texture2D(tStreak, vec2(uv.x * 1.7 + 0.13, 1.0 - uv.y)).r);
  return mix(0.62, s, uOpt.x);
}
void main() {
  vec2 f = gl_FragCoord.xy - vS0;
  float sl = dot(f, vAx) / vSpan.x;
  float across = dot(f, vec2(-vAx.y, vAx.x));
  float s = clamp(sl, 0.0, 1.0);
  float wf = 1.0 / ((1.0 - s) / vSpan.y + s / vSpan.z);
  float t = (s / vSpan.z) * wf;
  float y = mix(vY.x, vY.y, t);
  float B = vG.w;
  float pom = vD.w;
  float Lu = 1.0 - pom;
  float px = uDpr;
  float pxU = vP11 * 0.5 * uView.y / wf * B;
  float side = across >= 0.0 ? 1.0 : -1.0;
  float ax = abs(across);
  float wmul = side > 0.0 ? vW.x : vW.y;
  float shear = side > 0.0 ? vW.z : vW.w;
  float bf = uAnch.x;
  float collar = bf + 0.03 * Lu;
  float needle = uAnch.z * Lu;
  float bu = (y - bf) / (1.0 - bf);
  float halfW = (bu >= 0.0 && bu <= 1.0) ? texture2D(tProfile, vec2(bu, 0.5)).r * uAnch.y * pxU * vX.x : 0.0;
  float Wpx = uBladeW * pxU * vX.x;
  float seed = vP.x;
  float flame = vP.y;
  float coreK = vF.z;
  // The world height here: the aura fades into the ground (no hard cut where a diving sword meets the stone).
  float wy = vG.y + vD.y * y * B;
  float ground = smoothstep(0.0, 0.15, wy);
  // Dissolve: the mantle melts before the blade (the same noise family, 0.15 earlier), and a hit erodes the plates.
  float n = aNoise(vec2(y * 46.0 + seed * 17.0, across / px * 0.35 + seed * 5.0));
  float dis = vF.y;
  float alive = dis > 0.002 ? smoothstep(dis * 1.04 + 0.13, dis * 1.04 + 0.17, n) : 1.0;
  float erode = vX.y > 0.002 ? smoothstep(vX.y - 0.08, vX.y + 0.08, aNoise(vec2(y * 70.0 - seed * 3.0, across / px * 0.6))) : 1.0;
  vec3 light = vec3(0.0);
  float inkA = 0.0;

  // Mid swords pour their mantle into a tail behind the pommel (their trail): a tapering silk of streaked qi.
  if (y < pom) {
    float tt = clamp((pom - y) / max(vP.z, 1e-3), 0.0, 1.0);
    float tw = (1.0 * px + max(MANTLE_FLOOR * px, 0.55 * Wpx)) * 0.9 * pow(1.0 - tt, 1.15);
    float cover = band(ax, 0.0, tw) * smoothstep(0.0, 0.08, tt);
    float st = streak(vec2(-(y + vF.w * (1.0 - bf)) / (0.5 * Lu), 0.5 + 0.4 * across / max(tw, 1e-3)));
    if (flame > 0.5) {
      // Fire's tail is its ember mantle's: soot with a hot thread, cooling down the tail.
      float th = band(ax, 0.0, 0.6 * px) * (1.0 - tt);
      light = mix(uDeep, uBody, st) * th * 0.85 + uDeep * cover * st * 0.35 * (1.0 - tt);
      inkA = uInk.a * cover * (0.6 - 0.4 * tt);
    } else {
      light = mix(uDeep, uBody, st) * cover * (0.18 + 0.67 * st) * (1.0 - tt * 0.7);
      inkA = uInk.a * cover * 0.55 * (1.0 - tt);
    }
    float a = vF.x * uLayer * alive * ground;
    gl_FragColor = vec4((uInk.rgb * inkA + light) * a, inkA * a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  if (y < collar - 0.03 * Lu) discard;

  float bl = clamp((y - collar) / (1.0 - collar), 0.0, 1.0);
  // The mantle's width along the blade: nothing at the collar, full past a fifth of the blade, 0.7 by the tip.
  float pw = smoothstep(0.0, 0.2, bl) * mix(1.0, 0.7, smoothstep(0.55, 1.0, bl));
  float floorPx = mix(MANTLE_FLOOR, MANTLE_FLOOR_HIT, coreK) * px * min(1.0, wmul);
  float M = max(MANTLE_W * Wpx * pw * wmul, floorPx * smoothstep(0.0, 0.07, bl));
  float gap = 1.0 * px;
  // Past the tip: the needle, the two hems sewn into one point.
  float inNeedle = step(1.0, y);
  float nt = clamp((y - 1.0) / max(needle, 1e-4), 0.0, 1.0);
  float Mtip = max(MANTLE_W * Wpx * 0.7 * wmul, floorPx);
  float inner = inNeedle > 0.5 ? 0.0 : halfW + gap;
  float outer = inNeedle > 0.5 ? (gap + Mtip) * pow(1.0 - nt, 1.35) : halfW + gap + M;
  if (inNeedle > 0.5 && nt >= 1.0) discard;
  // A release opens the plates from the collar to the tip (reveal 0 … 1 over 4 frames).
  float reveal = vP.w;
  float open = reveal >= 0.999 ? 1.0 : smoothstep(bl - 0.04, bl + 0.04, reveal * 1.1);

  if (flame > 0.5) {
    // ── Fire ─────────────────────────────────────────────────────────────────
    float d = ax - inner;
    float rootGap = band(ax, halfW, inner);
    if (flame > 1.5) {
      // Ember mantle (mid swords): soot bed with a molten seam ≤ 1 px at its hem, crawling embers in the bed.
      float bed = band(d, 0.0, 0.6 * M);
      float hem = band(d, 0.6 * M - 0.9 * px, 0.6 * M);
      float crawl = smoothstep(0.55, 0.85, aNoise(vec2(y * 30.0 + vF.w * 6.0, seed * 9.0 + uTime * 1.5)));
      light = mix(uDeep, uBody, crawl) * (hem * (0.55 + 0.45 * crawl) + bed * crawl * 0.25);
      inkA = uInk.a * (bed * 0.8 + rootGap * 0.7);
    } else {
      // Licking flame (lead blades, key 1, ≤ 8 mid swords): tongues rooted on the hem, blown back by the flight and
      // rising, sharp tips, flickering; soot rim, vermilion-to-orange body, a thin amber band, a white-gold root.
      float reach = uShape.z * Wpx * wmul;
      float base = 0.5 * Wpx * pw * wmul + floorPx;
      float upBias = 1.0 + 0.35 * clamp(vUp.y * side, -1.0, 1.0);
      float hz = mix(uShape.w, 2.0, uOpt.w);
      // Tongues blown back by the flight (their tips trail toward the pommel) and a little up; staggered per side.
      float lean = 0.55 + 0.2 * clamp(-vUp.x, -1.0, 1.0);
      float outw = d / max(base + reach, 1.0);
      float freq = 6.0;
      float yy = y / (1.0 - bf) * freq + vF.w * freq * 1.3 + (side < 0.0 ? 0.5 : 0.0) + outw * lean * 1.4;
      float cell = fract(yy);
      float k = floor(yy);
      float flick = aNoise(vec2(k * 1.7 + seed * 11.0 + side, uTime * hz));
      float hk = 0.3 + 0.7 * flick;
      // A tongue: concave sides to a sharp tip (never a round puff); a smaller one between them, out of phase.
      float tri = 1.0 - abs(2.0 * cell - 1.0);
      float yy2 = yy * 2.0 + 0.37;
      float tri2 = 1.0 - abs(2.0 * fract(yy2) - 1.0);
      float hk2 = 0.3 + 0.7 * aNoise(vec2(floor(yy2) * 2.3 + seed * 5.0, uTime * hz * 1.3 + 7.0));
      float shape = max(pow(tri, 2.2) * hk, 0.55 * pow(tri2, 2.6) * hk2);
      float tongue = base + reach * 1.3 * shape * upBias * pw;
      if (inNeedle > 0.5) tongue = (gap + Mtip) * pow(1.0 - nt, 1.2) + reach * 0.35 * hk * (1.0 - nt);
      float heat = 1.0 - d / max(tongue, 1.0);
      float hard = mix(0.25, 0.04, uShape.x);
      float cover = smoothstep(0.0, hard * 4.0 + 0.6 / max(tongue, 1.0), heat) * step(0.0, d + 0.5);
      float body = smoothstep(0.18, 0.32, heat);
      float amber = smoothstep(0.78, 0.86, heat) * (1.0 - smoothstep(0.93, 0.98, heat));
      vec3 col = mix(uSoot, mix(uDeep, uBody, smoothstep(0.3, 0.75, heat)), body);
      col = mix(col, uEdge, amber * 0.85);
      float root = band(d, -0.5 * px, 0.7 * px) * (0.6 + 0.4 * flick);
      light = col * cover * 0.9 + uCore * root * 0.42 * (0.4 + 0.6 * coreK);
      inkA = cover * mix(uInk.a, 0.9, body) + uInk.a * rootGap * 0.8;
      light *= erode;
      inkA *= mix(1.0, erode, 0.7);
    }
    float a = vF.x * uLayer * alive * ground * open;
    gl_FragColor = vec4((uInk.rgb * inkA + light) * a, min(inkA, 0.95) * a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // ── Qi (Metal) ───────────────────────────────────────────────────────────────
  // Feathered plates of qi: a deep sapphire bed lit by the painted streaks, each plate's hem a fine silver line that
  // rises to a sharp tip at its front, dark seams between plates, the mantle's continuous outer seam, a 1 px ink gap at
  // the steel and an ink rim outside.
  float d = ax - inner;
  float tn = clamp(d / max(M, 1e-3), 0.0, 1.5);
  float plates = uAnch.w;
  float sp;
  float pg = uOpt.z;
  if (pg > 0.5) {
    // Graded: 3 plates growing toward the tip (boundaries at 0, 0.24, 0.55), the body thinning to threads at the collar.
    float b = bl + (side < 0.0 ? 0.06 : 0.0);
    sp = b < 0.24 ? b / 0.24 : b < 0.55 ? 1.0 + (b - 0.24) / 0.31 : 2.0 + (b - 0.55) / 0.45;
  } else sp = bl * plates + (side < 0.0 ? 0.5 : 0.0);
  // The plates lean forward at the hem (their fronts are V points on the outside).
  sp -= 0.42 * min(tn, 1.0);
  float k = floor(sp);
  float fp = fract(sp);
  // Each plate's own hem: from 0.55 of the mantle at its back up to the full width at its front tip; a shear (a cut, the
  // outer side of a turn) tilts it out toward its front and opens the seams.
  float rr = (0.55 + 0.45 * fp * fp) * (1.0 + 0.35 * shear * fp);
  float platePx = (1.0 - collar) / max(plates, 1.0) * pxU;
  float swordPx = Lu * pxU;
  float seamOn = smoothstep(50.0 * px, 70.0 * px, swordPx);
  float gapF = ((pg > 0.5 ? 2.2 : 1.0) * px / max(platePx, 1.0)) * seamOn + 0.28 * shear;
  float edgePx = rr * M;
  float plateIn = inNeedle > 0.5 ? step(d, outer) : clamp(edgePx - d + 0.5, 0.0, 1.0) * smoothstep(gapF, gapF + 0.7 / max(platePx, 1.0), fp);
  plateIn *= step(-0.5, d);
  float vT = clamp(tn / max(rr, 1e-3), 0.0, 1.0);
  // The painted qi streaks (one tile per half sword, flowing tip to pommel), offset per plate.
  float st = streak(vec2(-(y + vF.w * (1.0 - bf)) / (0.5 * Lu) + k * 0.37, 0.1 + 0.8 * vT));
  if (pg > 0.5) st *= mix(0.4 + 0.6 * step(0.5, fract(across / px * 0.5)), 1.0, smoothstep(0.1, 0.45, bl));
  float front = smoothstep(0.2, 1.0, fp);
  // A luminous feather: silver-blue lit by the painted streaks, its barbs' gaps in deep sapphire, brightest toward the
  // plate's front and its hem (the concept's plates: bright vanes, dark lines between them).
  vec3 bed = mix(uDeep, uBody, smoothstep(0.0, 0.7, st));
  // The vanes' crests take the seam's pale silver toward the plate's front: bright, never white (≤ 0.85).
  vec3 vane = mix(bed, uEdge, smoothstep(0.55, 1.0, st) * (0.15 + 0.4 * front));
  float lit = (0.78 + 0.22 * front) * (0.5 + 0.5 * st);
  // Where a plate tucks under the one behind it (its back), a shade; each plate its own sheen (they read as pieces).
  float tuck = mix(0.5, 1.0, smoothstep(0.0, 0.3, fp));
  float own = 0.8 + 0.2 * aHash(vec2(k * 3.1 + side, seed * 7.0));
  vec3 plateC = vane * lit * tuck * own;
  // The plate's hem line (1 px, silver) rising to its tip, the tip itself a small sparkle.
  float hemLine = inNeedle > 0.5 ? 0.0 : band(d, edgePx - 1.0 * px, edgePx) * smoothstep(gapF, gapF + 0.1, fp) * smoothstep(0.2, 0.6, fp);
  float tipGlint = inNeedle > 0.5 ? 0.0 : exp(-pow((1.0 - fp) * platePx / (1.6 * px), 2.0)) * exp(-pow((edgePx - d) / (1.4 * px), 2.0));
  // The plate tips glisten in turn (a ≤ 1 px HDR point now and then, each tip on its own phase; none in reduced motion).
  float tipSpark = uOpt.w > 0.5 ? 0.0 : tipGlint * pow(max(0.0, sin(uTime * 2.3 + k * 1.9 + side * 0.7 + seed * 6.28)), 24.0) * seamOn;
  // The mantle's outer seam (the two hems sewn into the needle), 1 px.
  float hem = band(ax, outer - 1.0 * px, outer) * step(collar, y);
  // The collar's cloud-curl hem: a small curl at the start of each side (from 70 px).
  float rc = max(1.6 * px, 0.45 * MANTLE_W * Wpx * wmul);
  vec2 cc = vec2((y - collar - 0.012 * Lu) * pxU, ax - (halfW + gap + rc));
  float cr = length(cc);
  float curl = band(cr, rc - 0.9 * px, rc) * step(0.0, -cc.x + rc * 0.2) * seamOn;
  // Travelling glints on the seams (the sparkle rule): two a side, collar to needle in ~0.35 s, every ~1.6 s.
  float glint = 0.0;
  if (uOpt.w < 0.5) {
    for (int i = 0; i < 2; i++) {
      float g = fract(uTime / 1.6 + seed * 0.37 + (side < 0.0 ? 0.27 : 0.0) + float(i) * 0.5);
      float run = g / 0.22;
      if (run < 1.0) {
        float yg = mix(collar, 1.0 + needle * 0.85, run);
        float dy = (y - yg) * pxU;
        glint += exp(-dy * dy / (2.2 * px * px)) * smoothstep(0.0, 0.1, run) * (1.0 - smoothstep(0.85, 1.0, run));
      }
    }
    glint *= vX.z * (hem + 0.5 * band(ax, outer - 1.8 * px, outer));
  }
  float body = plateIn * erode;
  float rim = band(ax, outer, outer + max(1.0 * px, 0.25 * M)) * step(collar, y) * (1.0 - inNeedle * nt);
  float inGap = inNeedle > 0.5 ? 0.0 : band(ax, halfW, inner);
  float plateSeam = (1.0 - plateIn) * step(0.0, d) * step(ax, outer) * seamOn * (1.0 - inNeedle);
  // The seam between two plates reads as a cut line: darker right at the plate's back edge.
  plateSeam = max(plateSeam, (1.0 - smoothstep(gapF, gapF + 1.6 * px / max(platePx, 1.0), fp)) * step(0.0, d) * step(d, edgePx) * seamOn * (1.0 - inNeedle) * 0.6);
  vec3 hemC = mix(uEdge, uCore, coreK);
  light = min(plateC + uEdge * (hemLine * 0.8 + tipGlint * 0.9), vec3(0.85)) * body + hemC * (hem + curl) * mix(0.8, 1.0, coreK) + uCore * (glint * 0.8 + tipSpark * 0.7 * body);
  // Matter under the light (premultiplied): a bed under each plate (the light reads saturated on pale stone), the
  // rim's and the gap's ink, lighter seams between plates.
  inkA = body * 0.6 + uInk.a * (rim * 1.6 + inGap * 2.0 + plateSeam * 1.4 + curl * 0.4);
  float a = vF.x * uLayer * alive * ground * open;
  gl_FragColor = vec4((uInk.rgb * inkA + light) * a, min(inkA, 0.9) * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ── Tip stars (TipStar, from C) ──────────────────────────────────────────────

const STAR_VERTEX = /* glsl */ `
attribute vec4 iC;   // centre (tip + 0.02 L), long arm (m)
attribute vec4 iA;   // the flight's direction (smoothed), cross arm (m)
attribute vec4 iL;   // level (0 … 1.6), core gain, alpha, kind (0 star, 1 fire star, 2 ring pulse)
attribute vec4 iS;   // seed, size ×, -, -
uniform vec2 uView;
uniform float uDpr;
varying vec2 vC;
varying vec2 vAx;
varying vec2 vArm;   // long and cross arm (px)
varying vec4 vL;
varying vec4 vS;
void main() {
  vL = iL;
  vS = iS;
  vec4 cc = projectionMatrix * viewMatrix * vec4(iC.xyz, 1.0);
  vec4 ca = projectionMatrix * viewMatrix * vec4(iC.xyz + iA.xyz * iC.w, 1.0);
  if (cc.w < 0.05 || ca.w < 0.05 || iL.z <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 sc = (cc.xy / cc.w * 0.5 + 0.5) * uView;
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uView;
  vec2 d = sa - sc;
  float l = length(d);
  vec2 ax = l > 1e-3 ? d / l : vec2(1.0, 0.0);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uView.y / cc.w;
  // The long arm keeps a floor (a sword flying at the camera still shows its star), the cross arm is world-sized.
  float arm = max(l, max(iC.w * pxPerM * 0.45, 4.0 * uDpr)) * iS.y;
  float crs = max(iA.w * pxPerM, 2.5 * uDpr) * iS.y;
  vC = sc;
  vAx = ax;
  vArm = vec2(arm, crs);
  float R = max(arm, crs) * 1.35 + 3.0 * uDpr;
  vec2 p = sc + (ax * position.x + vec2(-ax.y, ax.x) * position.y) * 2.0 * R;
  gl_Position = vec4((p / uView * 2.0 - 1.0) * cc.w, cc.z, cc.w);
}`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uDpr;
uniform float uTime;
uniform float uLayer;
uniform vec3 uBody;
uniform vec3 uEdge;
uniform vec3 uDeep;
uniform vec3 uSoot;
uniform vec3 uCore;
uniform vec4 uInk;
varying vec2 vC;
varying vec2 vAx;
varying vec2 vArm;
varying vec4 vL;
varying vec4 vS;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/** One tapered arm along x (length L, half width w at its root), 0 … 1. */
float arm(float a, float c, float L, float w) {
  float u = clamp(abs(a) / max(L, 1e-3), 0.0, 1.0);
  float hw = mix(w, 0.3 * w, u);
  return pow(1.0 - u, 1.25) * exp(-(c * c) / max(hw * hw, 1e-4));
}
void main() {
  vec2 f = gl_FragCoord.xy - vC;
  float a = dot(f, vAx);
  float c = dot(f, vec2(-vAx.y, vAx.x));
  float px = uDpr;
  float level = vL.x;
  float alpha = vL.z * uLayer;
  float kind = vL.w;
  float r = length(f);
  vec3 light;
  float inkA;
  if (kind > 1.5) {
    // The jade ring's pulse for a perfect or flash word (≤ 0.9, 8 frames): a soft ring of pale jade light.
    float R = vArm.x;
    float ring = exp(-pow((r - R) / max(0.22 * R, 1.2 * px), 2.0));
    light = vec3(0.62, 0.85, 0.78) * ring * 0.85 * level;
    gl_FragColor = vec4(light * alpha, 0.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float L = vArm.x;
  float C = vArm.y;
  float w = max(1.1 * px, 0.06 * L);
  float coreR = 1.0 * px;
  if (kind > 0.5) {
    // Fire: a sun-ray, its arms flame leaves (wider in their middle, flickering in length) round a white-gold core.
    float fl = 0.85 + 0.15 * sin(uTime * 23.0 + vS.x * 9.0);
    float la = L * fl;
    float lw = max(1.2 * px, 0.11 * L) * pow(max(0.0, sin(3.14159 * clamp(abs(a) / la, 0.0, 1.0))), 0.7) + 0.4 * px;
    float leaf = (1.0 - smoothstep(la * 0.9, la, abs(a))) * smoothstep(lw, lw * 0.55, abs(c));
    float cw = max(1.0 * px, 0.14 * C) * pow(max(0.0, sin(3.14159 * clamp(abs(c) / C, 0.0, 1.0))), 0.7) + 0.3 * px;
    float crossLeaf = (1.0 - smoothstep(C * 0.9, C, abs(c))) * smoothstep(cw, cw * 0.55, abs(a));
    float arms = max(leaf, crossLeaf);
    float heat = 1.0 - smoothstep(0.0, max(L, C), max(abs(a), abs(c)) * 1.15);
    vec3 col = mix(uDeep, uBody, smoothstep(0.1, 0.6, heat));
    col = mix(col, uEdge, smoothstep(0.82, 0.95, heat) * 0.8);
    float core = 1.0 - smoothstep(coreR - 0.5, coreR + 0.5, r);
    light = col * arms * 0.85 * clamp(level / 0.5, 0.0, 1.0) + uCore * core * vL.y * level;
    float soot = max(arm(a, c, L * 1.3, w * 2.0), arm(c, a, C * 1.3, w * 1.6));
    inkA = 0.45 * soot;
  } else {
    float arms = max(arm(a, c, L, w), arm(c, a, C, w * 0.85));
    float core = 1.0 - smoothstep(coreR - 0.5, coreR + 0.5, r);
    // The arms in the seam's pale silver-blue (≤ 0.85), whiter by the core; the core 0.7 the element's core + 0.3 white.
    vec3 col = mix(uEdge, vec3(0.85), 0.35 * exp(-r / max(3.0 * px, 0.1 * L)));
    light = col * arms * 0.85 * clamp(level / 0.5, 0.0, 1.0) + uCore * core * vL.y * level;
    float ink = max(arm(a, c, L * 1.3, w * 1.3), arm(c, a, C * 1.3, w * 1.1));
    inkA = 0.3 * ink;
  }
  gl_FragColor = vec4((uInk.rgb * inkA + light) * alpha, inkA * alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ── Hull (MantleHull, lead blades on High and Ultra) ─────────────────────────

/**
 * The mantle round a lead blade seen down its length (a sword pointing at or away from the camera, where a flat card
 * would show its edge): the blade's own surface, smoothed and pushed out (0.015 m + 1.5 CSS px), drawn by its back
 * faces only, so it shows as a band just outside the blade's silhouette, in the mantle's matter: plates along the blade,
 * the seam's light at the band's outer edge, ink under. Its weight is the card's complement (its view weight).
 */
const HULL_VERTEX = /* glsl */ `
attribute vec4 iH;   // weight (0 … 1), flow phase, seed, width ×
uniform float uDpr;
uniform vec2 uView;
varying float vY;
varying float vW;
varying float vFlow;
varying float vSeed;
varying vec3 vN;
varying vec3 vV;
void main() {
  // The instance matrix is the sword's own (guard, tip direction, the face roll, the blade's length as its scale).
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec4 vp = viewMatrix * wp;
  float pxPerM = projectionMatrix[1][1] * 0.5 * uView.y / max(-vp.z, 0.05);
  wp.xyz += n * (0.015 + 1.5 * uDpr / pxPerM) * iH.w;
  vY = position.y;
  vW = iH.x;
  vFlow = iH.y;
  vSeed = iH.z;
  vN = n;
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const HULL_FRAGMENT = /* glsl */ `
uniform float uLayer;
uniform float uTime;
uniform vec4 uAnch;
uniform vec3 uBody;
uniform vec3 uEdge;
uniform vec3 uDeep;
uniform vec4 uInk;
uniform sampler2D tStreak;
uniform vec4 uOpt;
varying float vY;
varying float vW;
varying float vFlow;
varying float vSeed;
varying vec3 vN;
varying vec3 vV;
void main() {
  // No mantle on the guard's band.
  float on = smoothstep(uAnch.x + 0.03, uAnch.x + 0.09, vY);
  // Facing: the band's outer edge (grazing) carries the seam's light; its inner part the plates.
  float graze = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float plates = uAnch.w;
  float fp = fract((vY - uAnch.x) / (1.0 - uAnch.x) * plates + vSeed);
  float st = mix(0.62, texture2D(tStreak, vec2(-(vY + vFlow) * 2.0, 0.2 + 0.6 * graze)).r, uOpt.x);
  vec3 col = mix(uDeep, uBody, st) * (0.6 + 0.4 * smoothstep(0.3, 1.0, fp));
  col = mix(col, uEdge, smoothstep(0.75, 0.95, graze));
  float a = vW * uLayer * on;
  float ink = uInk.a * (0.6 + 0.4 * smoothstep(0.0, 0.25, fp));
  gl_FragColor = vec4((uInk.rgb * ink + col * 0.85) * a, ink * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The hull's surface from the weapon's blade geometry (load time): its blade part only (past bladeFrom), its vertices
 * welded by position and its normals smoothed (an invisible light-carrying shell, never a stand-in sword).
 */
export function hullGeometry(geometry: THREE.BufferGeometry, bladeFrom: number): THREE.BufferGeometry {
  const src = geometry.index !== null ? geometry.toNonIndexed() : geometry.clone();
  const pos = src.getAttribute("position");
  const keep: number[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    if (pos.getY(i) >= bladeFrom && pos.getY(i + 1) >= bladeFrom && pos.getY(i + 2) >= bladeFrom) {
      for (let k = 0; k < 3; k += 1) keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(keep), 3));
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  src.dispose();
  g.dispose();
  return welded;
}

/** A quad (−0.5 … 0.5) as an instanced geometry with these instanced vec4 attributes. */
function instancedQuad(capacity: number, names: readonly string[]): { geometry: THREE.InstancedBufferGeometry; data: Float32Array[]; attrs: THREE.InstancedBufferAttribute[] } {
  const quad = new THREE.PlaneGeometry(1, 1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  const data: Float32Array[] = [];
  const attrs: THREE.InstancedBufferAttribute[] = [];
  for (const name of names) {
    const d = new Float32Array(capacity * 4);
    const a = new THREE.InstancedBufferAttribute(d, 4);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
    data.push(d);
    attrs.push(a);
  }
  g.instanceCount = 0;
  return { geometry: g, data, attrs };
}

/** Uploads the first `n` instances of each attribute (one range each, reused: no allocation). */
function upload(attrs: readonly THREE.InstancedBufferAttribute[], ranges: { start: number; count: number }[], n: number): void {
  for (let k = 0; k < attrs.length; k += 1) {
    const a = attrs[k]!;
    const r = ranges[k]!;
    r.count = Math.max(1, n) * 4;
    a.updateRanges.length = 0;
    a.updateRanges.push(r);
    a.needsUpdate = true;
  }
}

const premultiplied = {
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendEquation: THREE.AddEquation,
} as const;

const CARDS = 64;
const STARS = 64;
const HULLS = 12;
const UP = new THREE.Vector3(0, 1, 0);

/** The Wind-Silk Mantle's drawer (SwordAura.install). */
export class WindSilkMantle implements AuraDrawer {
  readonly cards: THREE.Mesh;
  readonly stars: THREE.Mesh;
  readonly meshes: readonly THREE.Object3D[];
  readonly timed: readonly { readonly layer: AuraLayerName; readonly mesh: THREE.Object3D }[];
  private readonly card: { geometry: THREE.InstancedBufferGeometry; data: Float32Array[]; attrs: THREE.InstancedBufferAttribute[] };
  private readonly star: { geometry: THREE.InstancedBufferGeometry; data: Float32Array[]; attrs: THREE.InstancedBufferAttribute[] };
  private readonly cardRanges = Array.from({ length: 6 }, () => ({ start: 0, count: 0 }));
  private readonly starRanges = Array.from({ length: 4 }, () => ({ start: 0, count: 0 }));
  private readonly cardMat: THREE.ShaderMaterial;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly hullMat: THREE.ShaderMaterial;
  /** The hull (lead blades on High and Ultra), made when the weapon's geometry is known; null before or below High. */
  hull: THREE.InstancedMesh | null = null;
  private hullData: Float32Array | null = null;
  private hullAttr: THREE.InstancedBufferAttribute | null = null;
  private readonly hullRange = { start: 0, count: 0 };
  private readonly hullOn: boolean;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qr = new THREE.Quaternion();
  private readonly tv = new THREE.Vector3();
  private readonly ts = new THREE.Vector3();
  private readonly faces = new FaceRoll();
  /** The scene layer the hull goes into once made (the host's). */
  private hullParent: THREE.Object3D | null = null;
  private readonly view = { value: new THREE.Vector2(1920, 1080) };
  private readonly dpr = { value: 1 };
  private readonly time = { value: 0 };
  private readonly vp = new THREE.Vector4();
  private anchors: AuraAnchors | null = null;
  private fire = false;
  /** Per history id: the ring pulse's start (aura time; < 0 none). */
  private readonly pulseAt = new Float64Array(1024).fill(-1);
  /** Plates a side on this tier, and the graded option (?plates=graded). */
  plates: number;
  graded = false;

  constructor(readonly quality: "low" | "medium" | "high" | "ultra", streak: THREE.Texture | null) {
    this.plates = MANTLE.plates[quality];
    const L = SWORD_AURA_LOOK;
    const layers = quality === "low" ? 1 : quality === "ultra" ? 3 : 2;
    this.card = instancedQuad(CARDS, ["iG", "iD", "iW", "iF", "iP", "iX"]);
    this.cardMat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT.replace(/MANTLE_FLOOR_HIT/g, MANTLE.floorHitPx.toFixed(1)).replace(/MANTLE_FLOOR/g, MANTLE.floorPx.toFixed(1)).replace(/MANTLE_W/g, MANTLE.widthW.toFixed(3)),
      uniforms: {
        uView: this.view,
        uDpr: this.dpr,
        uTime: this.time,
        uAnch: { value: new THREE.Vector4(0.27, 0.05, MANTLE.needle, this.plates) },
        uBladeW: { value: 0.08 },
        tProfile: { value: null },
        tStreak: { value: streak },
        uOpt: { value: new THREE.Vector4(streak !== null ? 1 : 0, layers, 0, 0) },
        uLayer: { value: 1 },
        uMode: L.mode,
        uBody: L.body,
        uEdge: L.edge,
        uDeep: L.deep,
        uSoot: L.soot,
        uCore: L.core,
        uInk: L.ink,
        uShape: L.shape,
      },
      ...premultiplied,
    });
    this.cards = new THREE.Mesh(this.card.geometry, this.cardMat);
    this.cards.name = "auraMantle";
    this.cards.frustumCulled = false;
    this.cards.renderOrder = 11;
    this.cards.visible = false;
    this.star = instancedQuad(STARS, ["iC", "iA", "iL", "iS"]);
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uView: this.view, uDpr: this.dpr, uTime: this.time, uLayer: { value: 1 }, uBody: L.body, uEdge: L.edge, uDeep: L.deep, uSoot: L.soot, uCore: L.core, uInk: L.ink },
      ...premultiplied,
    });
    this.stars = new THREE.Mesh(this.star.geometry, this.starMat);
    this.stars.name = "auraTipStar";
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 14;
    this.stars.visible = false;
    const before = (renderer: THREE.WebGLRenderer): void => {
      renderer.getCurrentViewport(this.vp);
      this.view.value.set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
      this.dpr.value = renderer.getPixelRatio();
    };
    this.cards.onBeforeRender = before;
    this.stars.onBeforeRender = before;
    this.hullOn = quality === "high" || quality === "ultra";
    this.hullMat = new THREE.ShaderMaterial({
      vertexShader: HULL_VERTEX,
      fragmentShader: HULL_FRAGMENT,
      uniforms: {
        uView: this.view,
        uDpr: this.dpr,
        uTime: this.time,
        uLayer: { value: 1 },
        uAnch: this.cardMat.uniforms.uAnch!,
        uBody: L.body,
        uEdge: L.edge,
        uDeep: L.deep,
        uInk: L.ink,
        tStreak: this.cardMat.uniforms.tStreak!,
        uOpt: this.cardMat.uniforms.uOpt!,
      },
      ...premultiplied,
      side: THREE.BackSide,
    });
    this.meshes = [this.cards, this.stars];
    this.timed = [
      { layer: "MantleSheath", mesh: this.cards },
      { layer: "TipStar", mesh: this.stars },
    ];
  }

  /**
   * The hull's shell from the weapon's blade geometry (its LOD: lighter, the same outline), High and Ultra only; it is
   * added to `parent` (the host's layer) once made. Load time.
   */
  setHullSource(geometry: THREE.BufferGeometry | null, anchors: AuraAnchors, parent?: THREE.Object3D): void {
    if (parent !== undefined) this.hullParent = parent;
    if (!this.hullOn || geometry === null) return;
    const g = hullGeometry(geometry, anchors.bladeFrom);
    this.hullData = new Float32Array(HULLS * 4);
    this.hullAttr = new THREE.InstancedBufferAttribute(this.hullData, 4);
    this.hullAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iH", this.hullAttr);
    if (this.hull !== null) {
      this.hull.geometry.dispose();
      this.hull.geometry = g;
    } else {
      this.hull = new THREE.InstancedMesh(g, this.hullMat, HULLS);
      this.hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.hull.name = "auraHull";
      this.hull.frustumCulled = false;
      this.hull.renderOrder = 11;
      this.hull.count = 0;
      this.hull.visible = false;
      this.hull.onBeforeRender = this.cards.onBeforeRender;
      this.hullParent?.add(this.hull);
      (this.timed as { layer: AuraLayerName; mesh: THREE.Object3D }[]).push({ layer: "MantleHull", mesh: this.hull });
    }
  }

  /** The qi-streak mask the plates are painted with (null: a flat body). */
  setStreak(t: THREE.Texture | null): void {
    this.cardMat.uniforms.tStreak!.value = t;
    (this.cardMat.uniforms.uOpt!.value as THREE.Vector4).x = t !== null ? 1 : 0;
  }

  setGraded(on: boolean): void {
    this.graded = on;
    (this.cardMat.uniforms.uOpt!.value as THREE.Vector4).z = on ? 1 : 0;
  }

  setAnchors(anchors: AuraAnchors, _pommelY: number): void {
    this.anchors = anchors;
    this.cardMat.uniforms.tProfile!.value = profileTexture(anchors);
    (this.cardMat.uniforms.uAnch!.value as THREE.Vector4).set(anchors.bladeFrom, profileMax(anchors), MANTLE.needle, this.plates);
    this.cardMat.uniforms.uBladeW!.value = bladeWidth(anchors);
  }

  setElement(kit: ElementKit): void {
    this.fire = kit.swordAura.mode === "flame";
  }

  hide(): void {
    this.card.geometry.instanceCount = 0;
    this.star.geometry.instanceCount = 0;
    this.cards.visible = false;
    this.stars.visible = false;
    if (this.hull !== null) {
      this.hull.count = 0;
      this.hull.visible = false;
    }
  }

  /** Compiles both programs now (the first cast must not stall on them: key to release ≤ 50 ms). */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const vis = [this.cards.visible, this.stars.visible];
    this.cards.visible = true;
    this.stars.visible = true;
    renderer.compile(this.cards, camera);
    renderer.compile(this.stars, camera);
    this.cards.visible = vis[0]!;
    this.stars.visible = vis[1]!;
    if (this.hull !== null) {
      const hv = this.hull.visible;
      this.hull.visible = true;
      renderer.compile(this.hull, camera);
      this.hull.visible = hv;
    }
  }

  draw(records: readonly AuraRecord[], n: number, aura: SwordAura, _dt: number): void {
    this.time.value = aura.time;
    const reduced = aura.reduced;
    (this.cardMat.uniforms.uOpt!.value as THREE.Vector4).w = reduced ? 1 : 0;
    const sheathW = aura.weight("MantleSheath");
    const starW = aura.weight("TipStar");
    this.cardMat.uniforms.uLayer!.value = Math.min(1, sheathW);
    this.starMat.uniforms.uLayer!.value = Math.min(1, starW);
    const [G, D, W, F, P, X] = this.card.data as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
    const [C, A, Lv, S] = this.star.data as [Float32Array, Float32Array, Float32Array, Float32Array];
    let nc = 0;
    let ns = 0;
    let nh = 0;
    const hullW = this.hull !== null ? aura.weight("MantleHull") : 0;
    this.hullMat.uniforms.uLayer!.value = Math.min(1, hullW);
    const low = this.quality === "low";
    const ultra = this.quality === "ultra";
    for (let k = 0; k < n; k += 1) {
      const r = records[k]!;
      const L = r.blade * (1 - r.pommelY);
      const seed = hash01(r.id * 3 + 11);
      // Release (§3.A "Phóng"): plates open collar → tip over 4 frames, the first full on f0; the width surges 1.3× and
      // settles by f18; the seams are thin HDR cores on f0–2 only.
      const fr = r.releaseAge >= 0 ? r.releaseAge * 60 : 1e3;
      const reveal = fr < 1e3 ? Math.min(1, (fr + 1) / 4) : 1;
      let width = fr < 18 ? 1 + MANTLE.surge * (1 - smooth(fr / 18)) : 1;
      let core = fr < 3 ? 0.8 : 0;
      let shear = 0;
      let erode = 0;
      // A hit (§3.A "Bổ, trúng"): f0–2 the mantle pulls in to 0.5× with seam cores 3.0; f3–13 the plates shear fully and
      // flare 1.4× while the noise eats them; then, if the sword flies on, they realign over 12 frames.
      const sa = r.strikeAge >= 0 ? r.strikeAge * 60 : -1;
      if (sa >= 0) {
        if (sa < 3) {
          width *= 0.5;
          core = 1;
        } else if (sa < 14) {
          const u = (sa - 3) / 11;
          width *= 1.4;
          shear = 1;
          erode = 0.15 + 0.45 * u;
        } else if (sa < 26) {
          const u = smooth((sa - 14) / 12);
          width *= 1.4 - 0.4 * u;
          shear = 1 - u;
          erode = 0.6 * (1 - u);
        }
      }
      // Waiting (§3.A "Chờ"): the typing tier's width, breathing ±8 % on 2.4 s.
      if (r.state === AURA_WAIT) {
        width *= r.level * (reduced ? 1 : 1 + MANTLE.breathe * Math.sin((aura.time / MANTLE.breatheS) * Math.PI * 2 + seed * 6.28));
      }
      // A turn (§3.A "Rẽ"): the outer side of the curve widens, the inner narrows, the outer plates shear.
      const tk = smooth((r.omega - MANTLE.turnFrom) / (MANTLE.turnFull - MANTLE.turnFrom)) * Math.min(1, Math.abs(r.turn) * 3);
      // The record's turn is in screen px with y down; the card's sides are in GL px (y up): a positive turn there
      // bends the path toward the − side's opposite, so the outer side is −.
      const outerNeg = r.turn > 0;
      let wPos = width * (outerNeg ? 1 - 0.3 * tk : 1 + 0.6 * tk);
      let wNeg = width * (outerNeg ? 1 + 0.6 * tk : 1 - 0.3 * tk);
      let sPos = Math.max(shear, outerNeg ? 0 : 0.5 * tk);
      let sNeg = Math.max(shear, outerNeg ? 0.5 * tk : 0);
      if (reduced) {
        sPos *= 0.3;
        sNeg *= 0.3;
        core *= 0.6;
      }
      // Crowding (§4.7): ≥ 3 swords within 40 px thin the mantle to 0.8.
      if (r.crowd >= 3) {
        wPos *= 0.8;
        wNeg *= 0.8;
      }
      const fade = r.state === AURA_FADE ? Math.max(r.dissolve, 0.02) : r.dissolve;
      const flame = this.fire ? r.flame : 0;
      // The card weight by view (§3.A): a sword pointing at the camera shows no flat card edge-on; a lead blade's hull
      // takes the rest (High and Ultra), so the two never overlap.
      const mid = 0.5 * r.blade;
      this.tv.set(r.gx + r.dx * mid - aura.camPos.x, r.gy + r.dy * mid - aura.camPos.y, r.gz + r.dz * mid - aura.camPos.z).normalize();
      const along = Math.abs(this.tv.x * r.dx + this.tv.y * r.dy + this.tv.z * r.dz);
      const view = 1 - smooth((along - 0.6) / 0.25);
      if (hullW > 0 && this.hull !== null && (r.cls === AURA_LEAD || r.hero) && view < 0.999 && nh < HULLS) {
        const roll = this.faces.of(aura.camPos, r.gx, r.gy, r.gz, r.dx, r.dy, r.dz);
        this.q.setFromUnitVectors(UP, this.tv.set(r.dx, r.dy, r.dz));
        this.q.multiply(this.qr.setFromAxisAngle(UP, roll));
        this.m4.compose(this.ts.set(r.gx, r.gy, r.gz), this.q, this.tv.setScalar(r.blade));
        this.hull.setMatrixAt(nh, this.m4);
        const h = this.hullData!;
        h[nh * 4] = (1 - view) * r.presence * (1 - Math.min(1, fade * 1.5));
        h[nh * 4 + 1] = r.flow;
        h[nh * 4 + 2] = seed;
        h[nh * 4 + 3] = Math.max(0.5, Math.min(1.6, 0.5 * (wPos + wNeg)));
        nh += 1;
      }
      if (sheathW > 0 && nc < CARDS) {
        const o = nc * 4;
        G[o] = r.gx;
        G[o + 1] = r.gy;
        G[o + 2] = r.gz;
        G[o + 3] = r.blade;
        D[o] = r.dx;
        D[o + 1] = r.dy;
        D[o + 2] = r.dz;
        D[o + 3] = r.pommelY;
        W[o] = wPos;
        W[o + 1] = wNeg;
        W[o + 2] = sPos;
        W[o + 3] = sNeg;
        F[o] = r.presence * view;
        F[o + 1] = fade;
        F[o + 2] = core;
        F[o + 3] = r.flow;
        P[o] = seed;
        P[o + 1] = flame;
        // A mid sword pours its mantle into a tail behind its pommel (its trail): 0.35 L, 0.6 L diving (unit y).
        P[o + 2] = r.cls === AURA_LEAD ? 0 : ((r.diving ? MANTLE.tailDive : MANTLE.tail) * L) / r.blade;
        P[o + 3] = reveal;
        X[o] = r.widthK;
        X[o + 1] = erode;
        X[o + 2] = r.cls === AURA_LEAD || r.hero ? 1 : 0.7;
        // Half heights the card may need: the mantle (0.55 W, × 1.6 on a turn's outer side, × 1.4 on a hit) and its ink
        // rim; Fire's tongues (a 0.5 W root plus the element's reach, × 1.35 rising).
        X[o + 3] = flame === 1 ? 2 * (0.5 + 1.35 * this.fireReach()) : 2.6;
        nc += 1;
      }
      // TipStar (§3.A TipStar row): lead blades and key 1 always; a mid sword on the bright crest or diving (Ultra: also
      // turning); never on a crowded mid sword; Low: lead blades only.
      const lead = r.cls === AURA_LEAD || r.hero;
      const midStar = !low && r.crowd < 3 && (r.bright >= STAR_BRIGHT || r.diving || (ultra && tk > 0.2));
      if (starW > 0 && ns < STARS && (lead || midStar)) {
        let level = r.state === AURA_WAIT ? 0.4 : fr < 1e3 ? Math.max(0.6, 1 - 0.4 * smooth(fr / 10)) : 0.6;
        level += r.state === AURA_WAIT ? 0 : 0.4 * r.twinkle;
        let size = 1;
        let coreG = 1;
        if (sa >= 0 && sa < 9) {
          // A hit: 1.6× and a 3.6 core on f0–2, shrinking back over 6 frames.
          const u = sa < 3 ? 0 : (sa - 3) / 6;
          size = 1.6 - 0.6 * smooth(u);
          coreG = sa < 3 ? 3.6 / 3 : 1;
          level = Math.max(level, 1.2 - 0.6 * smooth(u));
        }
        if (!lead) level *= 0.75;
        // It goes out 4 frames before the blade (§3.C "Về, tan").
        const alpha = r.presence * (1 - Math.min(1, fade * 4));
        const o = ns * 4;
        const tip = r.blade + MANTLE.starAt * L;
        C[o] = r.gx + r.dx * tip;
        C[o + 1] = r.gy + r.dy * tip;
        C[o + 2] = r.gz + r.dz * tip;
        C[o + 3] = 0.12 * L;
        A[o] = r.sx;
        A[o + 1] = r.sy;
        A[o + 2] = r.sz;
        A[o + 3] = 0.04 * L;
        Lv[o] = Math.min(1.6, level);
        Lv[o + 1] = coreG * (reduced ? 0.8 : 1);
        Lv[o + 2] = alpha;
        Lv[o + 3] = flame > 0 ? 1 : 0;
        S[o] = seed;
        S[o + 1] = size * (r.crowd >= 3 ? 0.8 : 1);
        S[o + 2] = 0;
        S[o + 3] = 0;
        ns += 1;
      }
      // The jade ring's pulse for a perfect or flash word (§4.9): ≤ 0.9, 8 frames, at the ring of a key-1 sword.
      if (r.graded) this.pulseAt[r.id] = aura.time;
      const pa = this.pulseAt[r.id]!;
      if (pa >= 0 && this.anchors !== null && this.anchors.ring !== null && ns < STARS) {
        const age = (aura.time - pa) * 60;
        if (age > 8) this.pulseAt[r.id] = -1;
        else {
          const ring = this.anchors.ring;
          const o = ns * 4;
          C[o] = r.gx + r.dx * ring.y * r.blade;
          C[o + 1] = r.gy + r.dy * ring.y * r.blade;
          C[o + 2] = r.gz + r.dz * ring.y * r.blade;
          C[o + 3] = ring.r * r.blade * (1.25 + 0.25 * age / 8);
          A[o] = r.sx;
          A[o + 1] = r.sy;
          A[o + 2] = r.sz;
          A[o + 3] = ring.r * r.blade;
          Lv[o] = 0.9 * (1 - age / 8);
          Lv[o + 1] = 0;
          Lv[o + 2] = r.presence;
          Lv[o + 3] = 2;
          S[o] = seed;
          S[o + 1] = 1;
          ns += 1;
        }
      }
    }
    this.card.geometry.instanceCount = nc;
    this.star.geometry.instanceCount = ns;
    this.cards.visible = nc > 0;
    this.stars.visible = ns > 0;
    if (this.hull !== null) {
      this.hull.count = nh;
      this.hull.visible = nh > 0;
      if (nh > 0) {
        this.hull.instanceMatrix.needsUpdate = true;
        this.hullRange.count = nh * 4;
        this.hullAttr!.updateRanges.length = 0;
        this.hullAttr!.updateRanges.push(this.hullRange);
        this.hullAttr!.needsUpdate = true;
      }
    }
    if (nc > 0) upload(this.card.attrs, this.cardRanges, nc);
    if (ns > 0) upload(this.star.attrs, this.starRanges, ns);
  }

  /** Fire's reach (blade widths) for the card's half height. */
  private fireReach(): number {
    return SWORD_AURA_LOOK.shape.value.z;
  }
}

/**
 * The blade's width W (unit) for the mantle (SWORD_AURA §1.3): twice its median half width over the middle of the blade
 * (Clear Wind's root flares 1.5× wider just past the guard; the widest slice would make the mantle fat).
 */
export function bladeWidth(anchors: AuraAnchors): number {
  const p = anchors.profile;
  const mid: number[] = [];
  for (let i = Math.floor(p.length * 0.25); i < Math.floor(p.length * 0.75); i += 1) mid.push(p[i]!);
  mid.sort((a, b) => a - b);
  return 2 * (mid[Math.floor(mid.length / 2)] ?? 0.04);
}

function smooth(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/** States the direction answers to (tests). */
export const MANTLE_STATES = { wait: AURA_WAIT, strike: AURA_STRIKE, fade: AURA_FADE } as const;
