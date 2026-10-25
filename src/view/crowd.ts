// Source: games/dragon-hold/src/view/crowd.ts @06cd4e6 (adapted: species layers keyed by caller ids on Lane 1's renderer, ramp (toon) shading, ink outline toggle, no foe ghosts, ink-and-ivory dissolve, clip slots, vat and impostor draw modes with a 1 s / 0.2 s switch)
/**
 * The crowd (canon §20.3, §10.9): one InstancedMesh per species per draw
 * kind, so 300 beasts of every gait cost a handful of draw calls. Draw modes:
 *
 * - "procedural": primitive placeholders (canon D27: biped tall, quadruped
 *   long and low, flyer floats, swarm small blocks in a cluster) with the gait
 *   in the vertex shader (Rồng's and Tuyến Cuối's way);
 * - "vat": vertex animation textures (vat.ts): each instance plays its own
 *   clip at its own time, clip changes blend over 0.15 s; the source is a
 *   baked file per species or, by default, the in-page bake of the placeholder
 *   gait; with an `impostorRule` (canon §20.3 ladder L3–L5) some beasts draw
 *   as impostors instead, and a beast changes kind only after 1 s on the other
 *   side of the rule, then crossfades 0.2 s (impostor.ts MODE_SWITCH);
 * - "impostor": every beast as a camera-facing quad from an atlas of 16
 *   directions × 8 walk phases (impostor.ts), baked in the page from the same
 *   VAT source unless an atlas is given;
 * - "bones" keeps its type only (canon §20.3: not built at M0a).
 *
 * Per instance: clip and clip time, hit flash, squash, death dissolve, status
 * tint, drawn size, fake knock-back; a blob shadow under each (one draw call
 * for all, a flyer's with a tether, swarm cluster rings); a toggleable
 * inverted-hull ink outline (canon §21.1, 1.5–2 px; baked into impostors).
 * Ramp shading in 3 steps (toon gradient).
 *
 * Usage (Lane 6): `const crowd = createCrowd(renderer, CROWD_MODE[quality])`;
 * each frame `crowd.add(serial, species)` for a new beast, `crowd.set(serial,
 * instance)` (metres, view only; advance `clipTime` yourself), `crowd.remove(
 * serial)` when gone, then `crowd.update(dt)` once. Nothing allocates per
 * frame after warm-up: the hot paths pass no float to a call V8 may not
 * inline, and write typed arrays only.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { CrowdMode } from "../content/rules";
import type { Gait, PlaceholderDef, SpeciesId } from "../content/types";
import type { Renderer3D } from "./renderer";
import {
  BEAST_CLIP_NAMES,
  VAT_BEGIN,
  VAT_BEGIN_NORMAL,
  VAT_BLEND_S,
  VAT_POSE,
  VAT_VERTEX_HEAD,
  bakeVat,
  clipSeconds,
  disposeVat,
  placeholderClips,
  placeholderDeform,
  vatAsset,
  vatUniforms,
  withVatIds,
  type VatAsset,
} from "./vat";
import { IMPOSTOR, MODE_SWITCH, bakeImpostorAtlas, createImpostorMaterial, type ImpostorAtlas, type ImpostorSubject } from "./impostor";

export type CrowdDrawMode = CrowdMode | "bones";
export type CrowdShape = "box" | "capsule" | "sphere" | "cone";

/** Beast clips in the order of the local model contract (canon §21.2: Idle, Move, Attack, Death). */
export const CLIP = { idle: 0, move: 1, attack: 2, death: 3 } as const;

/** Status tints (never a semantic colour of canon §21.1). */
export const TINT = { none: 0, slow: 1, held: 2, broken: 3, aura: 4, elite: 5, seal: 6 } as const;
export type TintId = (typeof TINT)[keyof typeof TINT];
export const TINT_HEX: readonly string[] = ["#ffffff", "#9cc3e0", "#8fd0b0", "#f1ead6", "#c9b3e6", "#d9c79a", "#b5d6f0"];

/** How a species reads on screen: gait, family colour, drawn size (metres, nose +z), hover. */
export interface CrowdLook {
  readonly gait: Gait;
  readonly colour: string;
  /** Width, height, length in metres, as drawn (canon §21.1 sizes are met at 1080p, tests/view/crowd.test.ts). */
  readonly sizeM: readonly [number, number, number];
  /** Body height above the ground for flyers, metres. */
  readonly hoverM: number;
  readonly shape: CrowdShape;
  /** Ink outline strength 0–1 (default 1). */
  readonly outline?: number;
}

/**
 * Grey-box looks until Lane 5's data/beasts.ts placeholders exist (then pass
 * `looks: (s) => lookFromPlaceholder(BEASTS[s].placeholder)`). One colour per
 * family, muted (red, orange, gold and cyan stay semantic, canon §21.1).
 */
export const CROWD_LOOKS: Readonly<Record<SpeciesId, CrowdLook>> = {
  // Darker than the paper-sand ground so every body reads as ink on dó paper.
  "thach-thu": { gait: "swarm", colour: "#5e4a3a", sizeM: [0.55, 0.5, 0.75], hoverM: 0, shape: "box" },
  "phong-lang": { gait: "quadruped", colour: "#46607f", sizeM: [0.7, 0.85, 1.6], hoverM: 0, shape: "box" },
  "hoa-nha": { gait: "flyer", colour: "#8e3b30", sizeM: [1.5, 0.55, 1.15], hoverM: 2.4, shape: "box" },
  "nham-vien": { gait: "biped", colour: "#55633a", sizeM: [1.0, 2.0, 0.9], hoverM: 0, shape: "capsule" },
  "thiet-giap-tru": { gait: "quadruped", colour: "#3f4047", sizeM: [1.25, 1.2, 2.0], hoverM: 0, shape: "box" },
  "lang-dau-dan": { gait: "quadruped", colour: "#2f4766", sizeM: [1.05, 1.35, 2.4], hoverM: 0, shape: "box" },
  "thiet-boi-lang-vuong": { gait: "quadruped", colour: "#3a3f52", sizeM: [2.6, 3.0, 5.2], hoverM: 0, shape: "box" },
};

/** A look from a content placeholder (data/beasts.ts, Lane 5). */
export function lookFromPlaceholder(placeholder: PlaceholderDef): CrowdLook {
  const shape: CrowdShape = placeholder.gait === "biped" ? "capsule" : "box";
  return {
    gait: placeholder.gait,
    colour: placeholder.colour,
    sizeM: [placeholder.widthMm / 1000, placeholder.heightMm / 1000, placeholder.lengthMm / 1000],
    hoverM: placeholder.gait === "flyer" ? 2.4 : 0,
    shape,
  };
}

export interface CrowdInstance {
  /** Ground point under the beast, metres (view only). */
  x: number;
  y: number;
  z: number;
  /** Radians; local +z faces (sin heading, cos heading): towards the heart from (x, z) is atan2(−x, −z). */
  heading: number;
  /** CLIP id and seconds into it; the caller advances the time (procedural: idle and move set the stride, attack lunges). */
  clip: number;
  clipTime: number;
  /** 0–1 hit flash (ivory, blooms at High). */
  flash: number;
  /** Height scale 0.91 squash … 1.07 stretch (kit Reactions); the width takes 2 − squash. */
  squash: number;
  /** 0 whole … 1 gone (death: ink eats the body, ivory sparks on the edge). */
  dissolve: number;
  /** TINT id (0 none). */
  tint: number;
  /** Drawn scale on the look (elite 1.25, canon §10.3). */
  size: number;
  /** Tint mix 0–1; default 0.85 when tint ≠ 0. */
  tintMix?: number;
  /** Gait strength 0 standing … 1 walking; default from the clip (procedural only). */
  stride?: number;
  /** Height above the ground; default the look's hover. */
  lift?: number;
  /** Fake recoil in metres (kit Reactions); the sim position never moves. */
  knockX?: number;
  knockZ?: number;
  /** Outline strength 0–1 on top of the look's. */
  outline?: number;
  /** A tinh anh (canon §10.3): the impostor ladder keeps it on VAT (L4, L5). */
  elite?: boolean;
}

/** A ground ring drawn with the shadows (a swarm cluster's outline, view only). */
export interface CrowdRing {
  x: number;
  y: number;
  z: number;
  radius: number;
  colour: string;
  alpha: number;
}

/**
 * Which beasts a "vat" crowd draws as impostors (canon §20.3 ladder): none;
 * L3 the swarm; L4 plain beasts outside the `keep` nearest the screen centre
 * (100 at Low, 160 at Medium); L5 every plain beast. Elites stay on VAT in L4
 * and L5.
 */
export type ImpostorRule = { readonly kind: "none" } | { readonly kind: "swarm" } | { readonly kind: "far"; readonly keep: number } | { readonly kind: "plain" };

export interface CrowdOptions {
  /** Instances per species layer (default 360: 300 for the bench plus room). */
  capacity?: number;
  /** Blob shadows (default true). */
  shadows?: boolean;
  /** Ink outline hulls (default true): one more draw call per layer in use. */
  outlines?: boolean;
  /** Gait phases (view only). */
  seed?: number;
  /** Look per species (default CROWD_LOOKS). */
  looks?: (species: SpeciesId) => CrowdLook;
  /** Bench: every layer is a block subdivided to at most this many triangles (canon §20.3 LOD). */
  lodTris?: number;
  /** vat, impostor: a baked VAT per species (null: the in-page placeholder bake). */
  vat?: (species: SpeciesId, look: CrowdLook) => VatAsset | null;
  /** vat, impostor: a baked atlas per species (null: baked in the page from the VAT). */
  impostor?: (species: SpeciesId, look: CrowdLook) => ImpostorAtlas | null;
  /** Atlas cell px of the in-page bake (default IMPOSTOR.cellPx of the renderer's tier). */
  impostorPx?: number;
  /** vat: beasts drawn as impostors (default none). */
  impostorRule?: ImpostorRule;
}

export interface CrowdKindCounts {
  procedural: number;
  vat: number;
  impostor: number;
}

export interface Crowd {
  readonly mode: CrowdDrawMode;
  readonly group: THREE.Group;
  /** Live instances. */
  readonly size: number;
  /** Adds beast `id` (caller's key, e.g. its serial); false when the species layer is full. Re-adding an id replaces it. */
  add(id: number, species: SpeciesId): boolean;
  remove(id: number): void;
  has(id: number): boolean;
  set(id: number, state: Readonly<CrowdInstance>): void;
  /** Ground rings drawn with this frame's shadows; replaces the last list. */
  setRings(rings: readonly CrowdRing[]): void;
  setOutlines(on: boolean): void;
  /** vat: another impostor ladder step (canon §20.3); beasts move over with the 1 s / 0.2 s switch. */
  setImpostorRule(rule: ImpostorRule): void;
  /** Builds a species layer now (empty, its bakes done), so a warm-up compile covers it. */
  prepare(species: SpeciesId): void;
  /** Advances clocks, switches draw kinds and uploads instance buffers once a frame. */
  update(dt: number): void;
  /** Draw calls the crowd costs now (layers in use, their outlines, the shadows). */
  drawCalls(): number;
  /** Triangles drawn now (bodies and outlines; 2 per impostor). */
  triangles(): number;
  /** Live instances of one species, or all. */
  instances(species?: SpeciesId): number;
  /** Instances drawn per kind this frame (a beast crossfading counts in both). */
  kinds(out?: CrowdKindCounts): CrowdKindCounts;
  /** GPU bytes of the crowd's textures (VAT, atlases; canon §20.2 budget). */
  textureBytes(): number;
  /** Those textures (a meter walking the scene skips them). */
  textures(): THREE.Texture[];
  dispose(): void;
}

const GAIT_ID: Readonly<Record<Gait, number>> = { biped: 1, quadruped: 2, flyer: 3, swarm: 4 };

/** "#rrggbb" as a GLSL vec3 literal body (linear). */
function hexVec(hex: string): string {
  const colour = new THREE.Color(hex);
  return colour.r.toFixed(4) + ", " + colour.g.toFixed(4) + ", " + colour.b.toFixed(4);
}

const CROWD_VERTEX_HEAD = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aState;
attribute vec4 aLook;
uniform float uTime;
varying vec3 vTint;
varying vec4 vState;
varying vec4 vLook;
varying vec3 vLocal;
varying vec3 vViewN;
varying vec3 vColorCrowd;
vec3 crowdTint(float id) {
  if (id < 0.5) return vec3(1.0);
${TINT_HEX.slice(1)
  .map((hex, k) => "  if (id < " + (k + 1.5).toFixed(1) + ") return vec3(" + hexVec(hex) + ");")
  .join("\n")}
  return vec3(1.0);
}
`;

/** Shared by the bodies of every kind: the varyings from the instance attributes (rest position for the dissolve noise). */
const CROWD_VARYINGS = /* glsl */ `
vState = aState;
vLook = aLook;
vTint = crowdTint(aState.z);
vLocal = position;
vColorCrowd = aColor;
`;

// Object-space gait on the unit body (aAnim: x gait id, y phase 0–1, z stride 0–1, w clip time; aLook.z clip id).
const CROWD_BEGIN =
  /* glsl */ `
#include <begin_vertex>
` +
  CROWD_VARYINGS +
  /* glsl */ `
float gaitPhase = aAnim.y * 6.2831;
float stride = aAnim.z;
float gait = aAnim.x;
if (gait > 0.5 && gait < 1.5) {
  // Biped: waddle side to side, leaning from the feet.
  transformed.x += sin(uTime * 4.6 + gaitPhase) * 0.09 * stride * transformed.y;
} else if (gait > 1.5 && gait < 2.5) {
  // Quadruped lope: the body rocks nose to tail.
  transformed.y += transformed.z * sin(uTime * 11.0 + gaitPhase) * 0.22 * stride;
} else if (gait > 2.5 && gait < 3.5) {
  // Flyer: the sides beat like wings.
  float wing = smoothstep(0.12, 0.5, abs(transformed.x));
  transformed.y += wing * sin(uTime * 17.0 + gaitPhase) * 0.55;
}
if (aLook.z > 1.5 && aLook.z < 2.5) {
  // Attack clip: a lunge forward and back over 0.45 s.
  float lunge = sin(clamp(aAnim.w / 0.45, 0.0, 1.0) * 3.14159);
  transformed.z += lunge * 0.22;
  transformed.y -= lunge * 0.06 * transformed.z;
}
`;

// World-space bob after the instance transform (metres, whatever the size).
const CROWD_BOB = /* glsl */ `
if (gait > 0.5 && gait < 1.5) {
  mvPosition.y += abs(sin(uTime * 4.6 + gaitPhase)) * 0.08 * stride;
} else if (gait > 1.5 && gait < 2.5) {
  mvPosition.y += max(0.0, sin(uTime * 11.0 + gaitPhase)) * 0.09 * stride;
} else if (gait > 2.5 && gait < 3.5) {
  mvPosition.y += sin(uTime * 2.4 + gaitPhase) * 0.22;
} else if (gait > 3.5) {
  mvPosition.x += sin(uTime * 23.0 + gaitPhase * 40.0) * 0.05 * stride;
  mvPosition.z += cos(uTime * 19.0 + gaitPhase * 31.0) * 0.05 * stride;
  mvPosition.y += abs(sin(uTime * 14.0 + gaitPhase)) * 0.06 * stride;
}
`;

const CROWD_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
${CROWD_BOB}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Ink outline hull: the same body pushed out from its centre by a width that
 * keeps about OUTLINE_PX on screen at any distance, back faces only, near-black
 * ink. aLook.x scales it (0: none); a dissolving body loses it. `bob` is the
 * procedural world bob (VAT poses carry their own). `out` is the push
 * direction in object space: from the centre for the placeholder blocks (hard
 * edges stay closed), along the pose's normal for a real model (thin wings and
 * tails would poke their back faces through when pushed from one centre).
 */
function outlineProject(bob: string, out = "transformed - uCenter"): string {
  return /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
vec3 crowdOut = ${out};
#ifdef USE_INSTANCING
crowdOut = mat3(instanceMatrix) * crowdOut;
mvPosition = instanceMatrix * mvPosition;
#endif
${bob}
vec4 crowdWorld = modelMatrix * mvPosition;
crowdOut = mat3(modelMatrix) * crowdOut;
float crowdWidth = uOutlineK * length(cameraPosition - crowdWorld.xyz) * aLook.x * (1.0 - aState.y);
crowdWorld.xyz += normalize(crowdOut + vec3(0.0, 1e-5, 0.0)) * crowdWidth;
mvPosition = viewMatrix * crowdWorld;
gl_Position = projectionMatrix * mvPosition;
`;
}

/** Interleaved-gradient noise on the pixel: a VAT body keeps the pixels below its fade, its impostor the others. */
const FADE_NOISE = "fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))";

const OUTLINE_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
if (vState.y > 0.02 || vLook.x < 0.01) discard;
`;
const OUTLINE_CLIP_FADE =
  OUTLINE_CLIP +
  /* glsl */ `
if (vLook.w < 0.999 && ${FADE_NOISE} >= vLook.w) discard;
`;

/** Ink outline colour and its width in CSS px at 1080p (canon §21.1: 1.5–2 px). */
const OUTLINE_COLOR = "#15171c";
const OUTLINE_PX = 1.8;

const CROWD_NORMAL = /* glsl */ `
#include <defaultnormal_vertex>
vViewN = normalize(transformedNormal);
`;

const CROWD_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vTint;
varying vec4 vState;
varying vec4 vLook;
varying vec3 vLocal;
varying vec3 vViewN;
varying vec3 vColorCrowd;
float crowdHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float crowdNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crowdHash(i), crowdHash(i + vec3(1, 0, 0)), f.x), mix(crowdHash(i + vec3(0, 1, 0)), crowdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(crowdHash(i + vec3(0, 0, 1)), crowdHash(i + vec3(1, 0, 1)), f.x), mix(crowdHash(i + vec3(0, 1, 1)), crowdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// Death: noise eats the body from the edges (canon §10.9: ink smoke and ivory motes, never blood).
const CROWD_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
float crowdN = crowdNoise(vLocal * 7.0) * 0.75 + crowdNoise(vLocal * 19.0) * 0.25;
if (vState.y > 0.001 && crowdN < vState.y * 1.08) discard;
`;
const CROWD_CLIP_FADE =
  CROWD_CLIP +
  /* glsl */ `
if (vLook.w < 0.999 && ${FADE_NOISE} >= vLook.w) discard;
`;

const CROWD_COLOR = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= vColorCrowd;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vTint * 1.25, vState.w * 0.75);
float crowdInk = vState.y > 0.001 ? 1.0 - smoothstep(0.0, 0.14, crowdN - vState.y * 1.08) : 0.0;
diffuseColor.rgb *= 1.0 - 0.8 * crowdInk;
`;

const CROWD_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float crowdRim = pow(1.0 - abs(vViewN.z), 2.2);
// A rim in the body's own colour lifted toward ivory, so every body reads against the ground on its shaded side.
totalEmissiveRadiance += mix(vColorCrowd, vec3(1.0, 0.97, 0.88), 0.55) * vLook.y * crowdRim;
totalEmissiveRadiance += vTint * vState.w * 0.12;
totalEmissiveRadiance += vec3(1.6, 1.55, 1.4) * vState.x;
if (vState.y > 0.001) {
  float edge = 1.0 - smoothstep(0.0, 0.05, crowdN - vState.y * 1.08);
  totalEmissiveRadiance += vec3(0.96, 0.93, 0.84) * edge * 1.8;
}
`;

/**
 * Ground marks, one instanced quad each (one draw call): kind 0 the contact
 * shadow; 1 a flyer's spot and ring; 2 the dashed tether up to the flyer (a
 * vertical quad turned to the camera); 3 a swarm cluster's ring in its family
 * colour. iData: x size (m), y alpha, z kind, w tether height (m).
 */
const SHADOW_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec3 iColor;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
void main() {
  vUv = uv;
  vAlpha = iData.y;
  vKind = iData.z;
  vColor = iColor;
  vec3 world;
  if (iData.z > 1.5 && iData.z < 2.5) {
    vec3 toCam = cameraPosition - iPos;
    vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
    world = iPos + right * position.x * iData.x + vec3(0.0, (position.y + 0.5) * iData.w, 0.0);
  } else {
    world = iPos + vec3(position.x * iData.x, 0.0, -position.y * iData.x);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const SHADOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  vec4 c;
  if (vKind < 0.5) {
    float a = (1.0 - smoothstep(0.25, 1.0, d)) * 0.8 + (1.0 - smoothstep(0.0, 0.5, d)) * 0.2;
    c = vec4(0.06, 0.065, 0.08, min(1.0, a) * vAlpha * 0.72);
  } else if (vKind < 1.5) {
    float spot = 1.0 - smoothstep(0.12, 0.5, d);
    float ring = smoothstep(0.7, 0.78, d) * (1.0 - smoothstep(0.88, 0.97, d));
    c = vec4(0.06, 0.065, 0.08, max(spot * 0.7, ring * 0.75) * vAlpha);
  } else if (vKind < 2.5) {
    float across = 1.0 - smoothstep(0.2, 0.5, abs(vUv.x - 0.5));
    float dash = step(0.4, fract(vUv.y * 6.0));
    c = vec4(0.07, 0.075, 0.09, across * dash * (1.0 - vUv.y * 0.55) * vAlpha);
  } else {
    float band = smoothstep(0.74, 0.79, d) * (1.0 - smoothstep(0.9, 0.94, d));
    float edge = max(smoothstep(0.68, 0.72, d) * (1.0 - smoothstep(0.74, 0.78, d)), smoothstep(0.9, 0.94, d) * (1.0 - smoothstep(0.98, 1.0, d)));
    float fill = (1.0 - smoothstep(0.5, 0.75, d)) * 0.16;
    vec3 col = mix(mix(vColor, vec3(1.0, 0.96, 0.88), 0.35), vec3(0.06, 0.06, 0.07), edge);
    c = vec4(col, max(max(band, edge * 0.8), fill) * vAlpha);
  }
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

/** Ground rings a crowd can hold per frame (swarm clusters). */
const RING_CAPACITY = 64;

/**
 * A float shader uniform with its own hidden class. A `{ value }` literal shares its shape with
 * three.js's object-valued uniforms, so V8 would box every float written into it (once a frame).
 * The field starts as a number (not undefined) so it stays an unboxed double.
 */
class FloatUniform {
  value = 0;
  constructor(value = 0) {
    this.value = value;
  }
}

/** Unit primitives: feet at y = 0, nose +z, size 1 × 1 × 1. */
export function primitive(shape: CrowdShape): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case "capsule":
      geometry = new THREE.CapsuleGeometry(0.5, 0.6, 4, 10);
      geometry.scale(1, 1 / 1.6, 1);
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(0.5, 14, 10);
      break;
    case "cone":
      geometry = new THREE.ConeGeometry(0.5, 1, 10);
      break;
    case "box":
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
  }
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Bench: a unit block subdivided to at most `tris` triangles (12 s² for s segments a side), feet at y = 0. */
export function lodBlock(tris: number): THREE.BufferGeometry {
  const segments = Math.max(1, Math.floor(Math.sqrt(tris / 12)));
  const geometry = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Triangles of a geometry (indexed or not). */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return (index !== null ? index.count : geometry.getAttribute("position").count) / 3;
}

// ── The VAT / impostor switch (canon §20.3) ─────────────────────────────────

/** Draw kinds. */
export const KIND = { procedural: 0, vat: 1, impostor: 2 } as const;

/** A beast's draw-kind switch: `mode` it is going to, `fade` 0 → 1 into it, `pending` seconds the rule has wanted the other kind. */
export interface ModeSwitchState {
  mode: number;
  fade: number;
  pending: number;
}

/**
 * One frame of the switch: the other kind is taken only after the rule has
 * wanted it for MODE_SWITCH.holdS without a break, then the beast crossfades
 * over MODE_SWITCH.blendS (a reversal mid-blend turns the fade round).
 */
export function stepModeSwitch(state: ModeSwitchState, want: number, dt: number, holdS: number = MODE_SWITCH.holdS, blendS: number = MODE_SWITCH.blendS): ModeSwitchState {
  if (want !== state.mode) {
    state.pending += dt;
    if (state.pending >= holdS - 1e-9) {
      state.mode = want;
      state.fade = 1 - state.fade;
      state.pending = 0;
    }
  } else state.pending = 0;
  if (state.fade < 1) state.fade = Math.min(1, state.fade + (blendS > 0 ? dt / blendS : 1));
  return state;
}

/** Ramp shading in 3 steps (canon §21.1: "ramp sáng 2–3 bậc"). */
function rampTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([92, 168, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** One instanced draw of a species layer (and its outline hull), with its own dense slots. */
interface Part {
  readonly kind: number;
  readonly mesh: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh | null;
  readonly colour: THREE.InstancedBufferAttribute | null;
  readonly state: THREE.InstancedBufferAttribute;
  /** procedural aAnim (gait, phase, stride, clip time); vat aVatAnim (clip, time, previous clip, previous time); impostor aImp (phase, fade, 0, 0). */
  readonly anim: THREE.InstancedBufferAttribute;
  /** procedural, vat: aLook (outline, rim, clip, fade). */
  readonly look: THREE.InstancedBufferAttribute | null;
  /** vat: aVatBlend (weight of the current clip). */
  readonly blend: THREE.InstancedBufferAttribute | null;
  readonly owner: (Rec | null)[];
  readonly tris: number;
  count: number;
  dirty: boolean;
}

interface Layer {
  readonly species: SpeciesId;
  readonly look: CrowdLook;
  /** Unit body → metres per axis (unit sources: the look's size; metric sources: one uniform factor). */
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** Feet offset of a metric source, at size 1 (m). */
  readonly yOffset: number;
  /** Parts by KIND (null when this crowd never draws the kind). */
  readonly parts: (Part | null)[];
  vat: VatAsset | null;
  atlas: ImpostorAtlas | null;
  /** Clip lengths (s) by CLIP id, for the phase offsets and the impostor phase. */
  readonly clipS: readonly number[];
  /** Seconds of the walk cycle the impostor phases cover. */
  cycleS: number;
  /** The VAT (in-page bake) and the atlas are ours and go with the layer. */
  ownsVat: boolean;
  ownsAtlas: boolean;
}

interface Rec {
  id: number;
  layer: Layer;
  /** Index in the dense live list. */
  live: number;
  /** Slot per KIND, −1 none. */
  slot: number[];
  /** Kind switch (vat crowds with a rule); procedural and impostor crowds keep one kind. */
  sw: ModeSwitchState;
  fresh: boolean;
  elite: boolean;
  /** Phase offset 0–1 of looping clips (view only). */
  offset: number;
  clip: number;
  time: number;
  prevClip: number;
  prevTime: number;
  /** Seconds since the clip changed. */
  sinceClip: number;
  /** Screen distance² from the centre (rule "far"). */
  screen: number;
  /** Last ground point, lift, footprint and dissolve for the shadow. */
  gx: number;
  gy: number;
  gz: number;
  lift: number;
  footprint: number;
  dissolve: number;
}

/** The crowd on `renderer` (its actors layer). "bones" is a type only (canon §20.3). */
export function createCrowd(renderer: Renderer3D, mode: CrowdDrawMode, options: CrowdOptions = {}): Crowd {
  if (mode === "bones") throw new Error("crowd: 'bones' is kept as a type only, canon §20.3; use 'vat'");
  const crowd = new CrowdImpl(renderer, mode, options);
  renderer.layers.actors.add(crowd.group);
  return crowd;
}

class CrowdImpl implements Crowd {
  readonly group = new THREE.Group();
  private readonly layers = new Map<SpeciesId, Layer>();
  /** The same layers in a plain array: the per-frame loops walk it by index (no iterator objects). */
  private readonly layerList: Layer[] = [];
  private readonly recs = new Map<number, Rec>();
  private readonly liveList: Rec[] = [];
  private readonly pool: Rec[] = [];
  private readonly time = new FloatUniform();
  private readonly outlineK = new FloatUniform(0.0011);
  private readonly capacity: number;
  private readonly looks: (species: SpeciesId) => CrowdLook;
  private readonly lodGeometry: THREE.BufferGeometry | null;
  private readonly ramp = rampTexture();
  private readonly tintColours = TINT_HEX.map((hex) => new THREE.Color(hex));
  private outlinesOn: boolean;
  private rule: ImpostorRule;
  private readonly sizeScratch = new THREE.Vector2();
  private readonly colourScratch = new THREE.Color();
  /** This set()'s instance matrix and state, written once and copied into each part's slot. */
  private readonly mat = new Float32Array(16);
  private readonly st = new Float32Array(4);
  /** Screen distances of plain beasts (rule "far"), selected in place. */
  private readonly far: Float32Array;
  // The next ground mark (metres, alpha), set field by field before mark(): a call with float
  // arguments boxes each one (V8), and update() writes up to 2 × capacity marks a frame.
  private mx = 0;
  private my = 0;
  private mz = 0;
  private mSize = 0;
  private mAlpha = 0;
  private mHeight = 0;
  private dt = 0;
  private readonly shadows: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null;
  private readonly shadowPos: Float32Array;
  private readonly shadowData: Float32Array;
  private readonly shadowColour: Float32Array;
  private readonly shadowCapacity: number;
  private rings: readonly CrowdRing[] = [];
  private readonly ringColours = new Map<string, THREE.Color>();
  private phaseSeed: number;

  constructor(
    private readonly renderer: Renderer3D,
    readonly mode: CrowdMode,
    private readonly options: CrowdOptions,
  ) {
    this.group.name = "crowd";
    this.capacity = Math.max(1, options.capacity ?? 360);
    this.looks = options.looks ?? ((species) => CROWD_LOOKS[species]);
    this.lodGeometry = options.lodTris !== undefined ? lodBlock(options.lodTris) : null;
    this.outlinesOn = options.outlines !== false;
    this.rule = mode === "vat" ? (options.impostorRule ?? { kind: "none" }) : { kind: "none" };
    this.phaseSeed = (options.seed ?? 7) >>> 0 || 7;
    this.far = new Float32Array(this.capacity * 8);
    // A flyer takes two marks (spot, tether); rings come on top.
    this.shadowCapacity = this.capacity * 2 + RING_CAPACITY;
    this.shadowPos = new Float32Array(this.shadowCapacity * 3);
    this.shadowData = new Float32Array(this.shadowCapacity * 4);
    this.shadowColour = new Float32Array(this.shadowCapacity * 3);
    if (options.shadows === false) {
      this.shadows = null;
    } else {
      const base = new THREE.PlaneGeometry(1, 1);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute("position", base.getAttribute("position"));
      geometry.setAttribute("uv", base.getAttribute("uv"));
      geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.shadowPos, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.shadowData, 4).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.shadowColour, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.instanceCount = 0;
      const material = new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERTEX,
        fragmentShader: SHADOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.shadows = new THREE.Mesh(geometry, material);
      this.shadows.frustumCulled = false;
      this.shadows.renderOrder = 1;
      this.shadows.name = "crowd-shadows";
      this.group.add(this.shadows);
    }
  }

  get size(): number {
    return this.liveList.length;
  }

  // Both walk the plain layer list by index: callable every frame without an iterator object.
  drawCalls(): number {
    let calls = this.shadows !== null && (this.liveList.length > 0 || this.rings.length > 0) ? 1 : 0;
    for (let k = 0; k < this.layerList.length; k += 1) {
      const parts = this.layerList[k]!.parts;
      for (let p = 0; p < 3; p += 1) {
        const part = parts[p];
        if (part === null || part === undefined || part.count === 0) continue;
        calls += part.outline !== null && this.outlinesOn ? 2 : 1;
      }
    }
    return calls;
  }

  triangles(): number {
    let tris = 0;
    for (let k = 0; k < this.layerList.length; k += 1) {
      const parts = this.layerList[k]!.parts;
      for (let p = 0; p < 3; p += 1) {
        const part = parts[p];
        if (part === null || part === undefined) continue;
        tris += part.count * part.tris * (part.outline !== null && this.outlinesOn ? 2 : 1);
      }
    }
    return tris;
  }

  instances(species?: SpeciesId): number {
    if (species === undefined) return this.liveList.length;
    let count = 0;
    for (let k = 0; k < this.liveList.length; k += 1) if (this.liveList[k]!.layer.species === species) count += 1;
    return count;
  }

  kinds(out: CrowdKindCounts = { procedural: 0, vat: 0, impostor: 0 }): CrowdKindCounts {
    out.procedural = 0;
    out.vat = 0;
    out.impostor = 0;
    for (let k = 0; k < this.layerList.length; k += 1) {
      const parts = this.layerList[k]!.parts;
      out.procedural += parts[KIND.procedural]?.count ?? 0;
      out.vat += parts[KIND.vat]?.count ?? 0;
      out.impostor += parts[KIND.impostor]?.count ?? 0;
    }
    return out;
  }

  textureBytes(): number {
    // A baked VAT or atlas several layers share counts once.
    const seen = new Set<object>();
    let bytes = 0;
    for (const layer of this.layerList) {
      if (layer.vat !== null && layer.parts[KIND.vat] !== null && !seen.has(layer.vat)) {
        seen.add(layer.vat);
        bytes += layer.vat.bytes;
      }
      if (layer.atlas !== null && !seen.has(layer.atlas)) {
        seen.add(layer.atlas);
        bytes += layer.atlas.bytes;
      }
    }
    return bytes;
  }

  textures(): THREE.Texture[] {
    const out = new Set<THREE.Texture>();
    for (const layer of this.layerList) {
      if (layer.vat !== null) out.add(layer.vat.positions).add(layer.vat.normals);
      if (layer.atlas !== null) out.add(layer.atlas.texture);
    }
    return [...out];
  }

  private nextPhase(): number {
    // xorshift32: gait phases only (view).
    let s = this.phaseSeed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.phaseSeed = s >>> 0;
    return (this.phaseSeed % 10_007) / 10_007;
  }

  prepare(species: SpeciesId): void {
    const layer = this.layerFor(species);
    if (this.rule.kind !== "none") this.ensureAtlas(layer);
  }

  private layerFor(species: SpeciesId): Layer {
    const existing = this.layers.get(species);
    if (existing !== undefined) return existing;
    const layer = this.makeLayer(species, this.looks(species));
    this.layers.set(species, layer);
    this.layerList.push(layer);
    return layer;
  }

  /** The species' VAT: the caller's baked file, or the in-page bake of the placeholder gait. */
  private vatFor(species: SpeciesId, look: CrowdLook): { asset: VatAsset; owned: boolean } {
    const given = this.options.vat?.(species, look) ?? null;
    if (given !== null) return { asset: given, owned: false };
    const geometry = withVatIds(this.lodGeometry !== null ? this.lodGeometry.clone() : primitive(look.shape));
    const specs = placeholderClips(look.gait);
    const data = bakeVat(geometry, specs, placeholderDeform(look.gait, look.sizeM, specs));
    return { asset: vatAsset(species, data, geometry, "in-page"), owned: true };
  }

  private makeLayer(species: SpeciesId, look: CrowdLook): Layer {
    const parts: (Part | null)[] = [null, null, null];
    let vat: VatAsset | null = null;
    let ownsVat = false;
    let atlas: ImpostorAtlas | null = null;
    let sx = look.sizeM[0];
    let sy = look.sizeM[1];
    let sz = look.sizeM[2];
    let yOffset = 0;
    if (this.mode !== "procedural") {
      const given = this.mode === "impostor" ? (this.options.impostor?.(species, look) ?? null) : null;
      if (given !== null) atlas = given;
      else {
        const source = this.vatFor(species, look);
        vat = source.asset;
        ownsVat = source.owned;
        if (vat.data.space === "metric") {
          // A real model keeps its proportions: the look's longest side on its longest side, feet at 0.
          const ext = Math.max(vat.data.max[0] - vat.data.min[0], vat.data.max[1] - vat.data.min[1], vat.data.max[2] - vat.data.min[2], 1e-3);
          const k = Math.max(look.sizeM[0], look.sizeM[1], look.sizeM[2]) / ext;
          sx = k;
          sy = k;
          sz = k;
          yOffset = -vat.data.min[1] * k;
        }
      }
    }
    const clipS = vat !== null ? BEAST_CLIP_NAMES.map((_, k) => (vat!.data.clips[k] !== undefined ? clipSeconds(vat!.data.clips[k]!) : 1)) : placeholderClips(look.gait).map((c) => c.seconds);
    const layer: Layer = { species, look, sx, sy, sz, yOffset, parts, vat, atlas, clipS, cycleS: atlas?.cycleS ?? clipS[CLIP.move] ?? 1, ownsVat, ownsAtlas: false };
    if (this.mode === "procedural") parts[KIND.procedural] = this.proceduralPart(layer);
    if (this.mode === "vat") parts[KIND.vat] = this.vatPart(layer);
    if (this.mode === "impostor") {
      if (layer.atlas === null) {
        layer.atlas = this.bakeAtlas(layer);
        layer.ownsAtlas = true;
        layer.cycleS = layer.atlas.cycleS;
      }
      parts[KIND.impostor] = this.impostorPart(layer, layer.atlas);
      if (layer.ownsVat && layer.vat !== null) {
        // The VAT was only the bake's source.
        disposeVat(layer.vat);
        layer.vat = null;
        layer.ownsVat = false;
      }
    }
    return layer;
  }

  /** A vat crowd's impostor part, built (and its atlas baked) the first time the rule needs it. */
  private ensureAtlas(layer: Layer): Part {
    const existing = layer.parts[KIND.impostor];
    if (existing !== null && existing !== undefined) return existing;
    const given = this.options.impostor?.(layer.species, layer.look) ?? null;
    layer.atlas = given ?? this.bakeAtlas(layer);
    layer.ownsAtlas = given === null;
    layer.cycleS = layer.atlas.cycleS;
    const part = this.impostorPart(layer, layer.atlas);
    layer.parts[KIND.impostor] = part;
    return part;
  }

  private newPart(kind: number, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, outlineMaterial: THREE.Material | null, attrs: { colour: boolean; state: number; anim: number; look: boolean; blend: boolean }): Part {
    const capacity = this.capacity;
    const dyn = (size: number): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    const colour = attrs.colour ? dyn(3) : null;
    const state = dyn(attrs.state);
    const anim = dyn(attrs.anim);
    const look = attrs.look ? dyn(4) : null;
    const blend = attrs.blend ? dyn(1) : null;
    if (colour !== null) geometry.setAttribute("aColor", colour);
    geometry.setAttribute("aState", state);
    geometry.setAttribute(kind === KIND.procedural ? "aAnim" : kind === KIND.vat ? "aVatAnim" : "aImp", anim);
    if (look !== null) geometry.setAttribute("aLook", look);
    if (blend !== null) geometry.setAttribute("aVatBlend", blend);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = name;
    this.group.add(mesh);
    let outline: THREE.InstancedMesh | null = null;
    if (outlineMaterial !== null) {
      outline = new THREE.InstancedMesh(geometry, outlineMaterial, capacity);
      outline.instanceMatrix = mesh.instanceMatrix;
      outline.count = 0;
      outline.frustumCulled = false;
      outline.visible = this.outlinesOn;
      outline.name = name.replace(/^crowd-/, "crowd-outline-").replace("crowd-outline-vat-", "crowd-vat-outline-");
      outline.onBeforeRender = this.outlineWidth;
      this.group.add(outline);
    }
    return { kind, mesh, outline, colour, state, anim, look, blend, owner: new Array<Rec | null>(capacity).fill(null), tris: kind === KIND.impostor ? 2 : triangleCount(geometry), count: 0, dirty: true };
  }

  /** About OUTLINE_PX at 1080p whatever the distance: width = k × distance (shared by every hull). */
  private readonly outlineWidth = (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera): void => {
    renderer.getSize(this.sizeScratch);
    const height = Math.max(1, this.sizeScratch.y);
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 28;
    const px = Math.max(1.5, (OUTLINE_PX * height) / 1080);
    const k = (px * 2 * Math.tan((fov * Math.PI) / 360)) / height;
    if (k !== this.outlineK.value) this.outlineK.value = k;
  };

  private proceduralPart(layer: Layer): Part {
    const geometry = this.lodGeometry !== null ? this.lodGeometry.clone() : primitive(layer.look.shape);
    const material = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: this.ramp });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "attribute vec4 aAnim;\n" +
        shader.vertexShader
          .replace("#include <begin_vertex>", CROWD_BEGIN)
          .replace("#include <defaultnormal_vertex>", CROWD_NORMAL)
          .replace("#include <project_vertex>", CROWD_PROJECT);
      shader.fragmentShader =
        CROWD_FRAGMENT_HEAD +
        shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", CROWD_CLIP)
          .replace("#include <color_fragment>", CROWD_COLOR)
          .replace("#include <emissivemap_fragment>", CROWD_EMISSIVE);
    };
    material.customProgramCacheKey = () => "ic-crowd-v1";
    const outlineMaterial = this.outlineMaterial("ic-crowd-outline-v1", (shader) => {
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "attribute vec4 aAnim;\nuniform float uOutlineK;\nuniform vec3 uCenter;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", CROWD_BEGIN).replace("#include <project_vertex>", outlineProject(CROWD_BOB));
    }, OUTLINE_CLIP);
    return this.newPart(KIND.procedural, "crowd-" + layer.species, geometry, material, outlineMaterial, { colour: true, state: 4, anim: 4, look: true, blend: false });
  }

  private outlineMaterial(cacheKey: string, vertex: (shader: THREE.WebGLProgramParametersWithUniforms) => void, clip: string, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): THREE.MeshBasicMaterial {
    // The hull: same geometry and instance matrices, back faces, pushed out in the vertex shader.
    const centre = { value: new THREE.Vector3(0, 0.5, 0) };
    const material = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uOutlineK = this.outlineK;
      shader.uniforms.uCenter = centre;
      extra?.(shader);
      vertex(shader);
      shader.fragmentShader = "varying vec4 vState;\nvarying vec4 vLook;\n" + shader.fragmentShader.replace("#include <clipping_planes_fragment>", clip);
    };
    material.customProgramCacheKey = () => cacheKey;
    return material;
  }

  private vatPart(layer: Layer): Part {
    const asset = layer.vat!;
    const uniforms = vatUniforms(asset);
    const geometry = asset.geometry.clone();
    const material = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: this.ramp });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        VAT_VERTEX_HEAD +
        shader.vertexShader
          .replace("#include <beginnormal_vertex>", VAT_BEGIN_NORMAL)
          .replace("#include <begin_vertex>", VAT_BEGIN + CROWD_VARYINGS)
          .replace("#include <defaultnormal_vertex>", CROWD_NORMAL);
      shader.fragmentShader =
        CROWD_FRAGMENT_HEAD +
        shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", CROWD_CLIP_FADE)
          .replace("#include <color_fragment>", CROWD_COLOR)
          .replace("#include <emissivemap_fragment>", CROWD_EMISSIVE);
    };
    material.customProgramCacheKey = () => "ic-crowd-vat-v1";
    // The hull pushes out from the body's middle (a metric model's middle in its own units).
    const middle = asset.data.space === "unit" ? 0.5 : (asset.data.min[1] + asset.data.max[1]) / 2;
    const outlineMaterial = this.outlineMaterial(
      "ic-crowd-vat-outline-v1-" + asset.data.space,
      (shader) => {
        shader.vertexShader =
          CROWD_VERTEX_HEAD +
          VAT_VERTEX_HEAD +
          "uniform float uOutlineK;\nuniform vec3 uCenter;\n" +
          shader.vertexShader
            .replace("#include <begin_vertex>", VAT_POSE + VAT_BEGIN + CROWD_VARYINGS)
            .replace("#include <project_vertex>", outlineProject("", asset.data.space === "unit" ? "transformed - uCenter" : "vatNormal"));
      },
      OUTLINE_CLIP_FADE,
      (shader) => {
        Object.assign(shader.uniforms, uniforms);
        (shader.uniforms.uCenter!.value as THREE.Vector3).set(0, middle, 0);
      },
    );
    return this.newPart(KIND.vat, "crowd-vat-" + layer.species, geometry, material, outlineMaterial, { colour: true, state: 4, anim: 4, look: true, blend: true });
  }

  private impostorPart(layer: Layer, atlas: ImpostorAtlas): Part {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const lookSize: [number, number, number] = [layer.sx, layer.sy, layer.sz];
    // The in-page atlas is in metres above the feet at size 1; a baked file is in model units (× the
    // layer's scale). The instance origin already carries the feet offset, so the centre is measured from it.
    const unit = atlas.source === "in-page" ? 1 : layer.sy;
    const material = createImpostorMaterial(atlas, lookSize, this.tintColours, { sideM: atlas.frameM * unit, centreM: atlas.centreY * unit - layer.yOffset });
    return this.newPart(KIND.impostor, "crowd-imp-" + layer.species, geometry, material, null, { colour: false, state: 4, anim: 4, look: false, blend: false });
  }

  /**
   * Bakes the layer's atlas in the page from its VAT (render to texture): a
   * one-instance VAT mesh with the layer's own materials, posed on the Move
   * clip at 8 phases and turned through 16 directions.
   */
  private bakeAtlas(layer: Layer): ImpostorAtlas {
    const gl = (this.renderer as Partial<Renderer3D>).stage?.renderer;
    if (gl === undefined) throw new Error("crowd: an impostor needs a WebGL renderer to bake (or options.impostor)");
    const asset = layer.vat ?? this.vatFor(layer.species, layer.look).asset;
    const part = layer.parts[KIND.vat] ?? this.vatPart({ ...layer, vat: asset });
    const geometry = asset.geometry.clone();
    const attr = (size: number, values: number[]): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(values), size);
    const colour = new THREE.Color(layer.look.colour);
    geometry.setAttribute("aColor", attr(3, [colour.r, colour.g, colour.b]));
    geometry.setAttribute("aState", attr(4, [0, 0, 0, 0]));
    const anim = attr(4, [CLIP.move, 0, CLIP.move, 0]);
    geometry.setAttribute("aVatAnim", anim);
    geometry.setAttribute("aVatBlend", attr(1, [1]));
    geometry.setAttribute("aLook", attr(4, [layer.look.outline ?? 1, 0.35, CLIP.move, 1]));
    const cycleS = layer.clipS[CLIP.move] ?? 1;
    const ext = [0, 1, 2].map((a) => (asset.data.max[a]! - asset.data.min[a]!) * [layer.sx, layer.sy, layer.sz][a]!);
    const centreY = layer.yOffset + ((asset.data.min[1] + asset.data.max[1]) / 2) * layer.sy;
    const radius = Math.max(0.05, Math.hypot(ext[0]!, ext[1]!, ext[2]!) / 2);
    const body = new THREE.InstancedMesh(geometry, part.mesh.material as THREE.Material, 1);
    const hull = part.outline !== null ? new THREE.InstancedMesh(geometry, part.outline.material as THREE.Material, 1) : null;
    if (hull !== null) {
      hull.instanceMatrix = body.instanceMatrix;
      // About the ink the game draws (1.8 px at 1080p is ~4 cm at the play camera's distance); the bake camera stands 5 radii off.
      hull.onBeforeRender = () => {
        this.outlineK.value = 0.04 / (radius * 5);
      };
    }
    const subject = new THREE.Group();
    subject.add(body);
    if (hull !== null) subject.add(hull);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(layer.sx, layer.sy, layer.sz);
    const position = new THREE.Vector3(0, layer.yOffset, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const shot: ImpostorSubject = {
      object: subject,
      radius,
      centreY,
      cycleS,
      pose: (phase, heading) => {
        const t = phase * cycleS;
        anim.setXYZW(0, CLIP.move, t, CLIP.move, t);
        anim.needsUpdate = true;
        body.setMatrixAt(0, matrix.compose(position, quaternion.setFromAxisAngle(up, heading), scale));
        body.instanceMatrix.needsUpdate = true;
      },
    };
    const quality = (this.renderer as Partial<Renderer3D>).quality ?? "high";
    const atlas = bakeImpostorAtlas(gl, shot, { cellPx: this.options.impostorPx ?? IMPOSTOR.cellPx[quality] });
    geometry.dispose();
    body.dispose();
    hull?.dispose();
    if (layer.parts[KIND.vat] === null) {
      // The temporary VAT part only served the bake.
      part.mesh.removeFromParent();
      part.outline?.removeFromParent();
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
      (part.outline?.material as THREE.Material | undefined)?.dispose();
    }
    if (layer.vat === null) disposeVat(asset);
    return atlas;
  }

  has(id: number): boolean {
    return this.recs.has(id);
  }

  add(id: number, species: SpeciesId): boolean {
    if (this.recs.has(id)) this.remove(id);
    const layer = this.layerFor(species);
    const kind = this.mode === "procedural" ? KIND.procedural : this.mode === "vat" ? KIND.vat : KIND.impostor;
    const part = layer.parts[kind]!;
    if (part.count >= this.capacity) return false;
    const rec = this.pool.pop() ?? this.newRec(layer);
    rec.id = id;
    rec.layer = layer;
    rec.live = this.liveList.length;
    rec.slot[0] = -1;
    rec.slot[1] = -1;
    rec.slot[2] = -1;
    rec.sw.mode = kind;
    rec.sw.fade = 1;
    rec.sw.pending = 0;
    rec.fresh = true;
    rec.elite = false;
    rec.offset = this.nextPhase();
    rec.clip = CLIP.move;
    rec.time = 0;
    rec.prevClip = CLIP.move;
    rec.prevTime = 0;
    rec.sinceClip = 1;
    rec.screen = 0;
    rec.gx = rec.gy = rec.gz = 0;
    rec.lift = layer.look.hoverM;
    rec.footprint = Math.max(layer.look.sizeM[0], layer.look.sizeM[2]) * 1.1;
    rec.dissolve = 0;
    this.liveList.push(rec);
    this.recs.set(id, rec);
    this.claim(rec, part);
    return true;
  }

  private newRec(layer: Layer): Rec {
    return {
      id: 0,
      layer,
      live: 0,
      slot: [-1, -1, -1],
      // Fractional starts keep these fields doubles from the first write (no map change later).
      sw: { mode: 0, fade: 0.5, pending: 0.5 },
      fresh: true,
      elite: false,
      offset: 0.5,
      clip: 1,
      time: 0.5,
      prevClip: 1,
      prevTime: 0.5,
      sinceClip: 1.5,
      screen: 0.5,
      gx: 0.5,
      gy: 0.5,
      gz: 0.5,
      lift: 0.5,
      footprint: 0.5,
      dissolve: 0.5,
    };
  }

  /** Gives `rec` a slot at the end of `part`, hidden (zero scale) until written. */
  private claim(rec: Rec, part: Part): void {
    const index = part.count;
    part.count += 1;
    part.owner[index] = rec;
    rec.slot[part.kind] = index;
    const layer = rec.layer;
    if (part.colour !== null) {
      const colour = this.colourScratch.set(layer.look.colour);
      const c = part.colour.array as Float32Array;
      c[index * 3] = colour.r;
      c[index * 3 + 1] = colour.g;
      c[index * 3 + 2] = colour.b;
    }
    (part.state.array as Float32Array).fill(0, index * 4, index * 4 + 4);
    const a = part.anim.array as Float32Array;
    if (part.kind === KIND.procedural) {
      a[index * 4] = GAIT_ID[layer.look.gait];
      a[index * 4 + 1] = rec.offset;
      a[index * 4 + 2] = 1;
      a[index * 4 + 3] = 0;
    } else a.fill(0, index * 4, index * 4 + 4);
    if (part.look !== null) {
      const o = part.look.array as Float32Array;
      o[index * 4] = layer.look.outline ?? 1;
      o[index * 4 + 1] = 0.35;
      o[index * 4 + 2] = CLIP.move;
      o[index * 4 + 3] = 1;
    }
    if (part.blend !== null) (part.blend.array as Float32Array)[index] = 1;
    const m = part.mesh.instanceMatrix.array as Float32Array;
    m.fill(0, index * 16, index * 16 + 16);
    m[index * 16 + 15] = 1;
    part.dirty = true;
  }

  /** Frees `rec`'s slot in `part`: the last instance moves into the hole. */
  private release(rec: Rec, part: Part): void {
    const index = rec.slot[part.kind]!;
    if (index < 0) return;
    const last = part.count - 1;
    if (index !== last) {
      copyItem(part.mesh.instanceMatrix.array as Float32Array, 16, last, index);
      if (part.colour !== null) copyItem(part.colour.array as Float32Array, 3, last, index);
      copyItem(part.state.array as Float32Array, 4, last, index);
      copyItem(part.anim.array as Float32Array, 4, last, index);
      if (part.look !== null) copyItem(part.look.array as Float32Array, 4, last, index);
      if (part.blend !== null) copyItem(part.blend.array as Float32Array, 1, last, index);
      const moved = part.owner[last]!;
      part.owner[index] = moved;
      moved.slot[part.kind] = index;
    }
    part.owner[last] = null;
    part.count = last;
    part.dirty = true;
    rec.slot[part.kind] = -1;
  }

  remove(id: number): void {
    const rec = this.recs.get(id);
    if (rec === undefined) return;
    const parts = rec.layer.parts;
    for (let p = 0; p < 3; p += 1) {
      const part = parts[p];
      if (part !== null && part !== undefined && rec.slot[p]! >= 0) this.release(rec, part);
    }
    // Dense live list: swap the tail in.
    const tail = this.liveList.pop()!;
    if (tail !== rec) {
      this.liveList[rec.live] = tail;
      tail.live = rec.live;
    }
    this.recs.delete(id);
    this.pool.push(rec);
  }

  set(id: number, instance: Readonly<CrowdInstance>): void {
    const rec = this.recs.get(id);
    if (rec === undefined) return;
    const layer = rec.layer;
    const look = layer.look;
    const lift = instance.lift ?? look.hoverM;
    const dissolve = instance.dissolve;
    const squash = instance.squash > 0 ? instance.squash : 1;
    const widen = 2 - squash;
    const drawn = instance.size > 0 ? instance.size : 1;
    const size = drawn * (1 - dissolve * 0.25);
    const knockX = instance.knockX ?? 0;
    const knockZ = instance.knockZ ?? 0;
    const x = instance.x + knockX;
    const z = instance.z + knockZ;
    // Yaw about +y, scale, translation straight into the column-major instance matrix (the same
    // numbers as Matrix4.compose with a y-axis quaternion), with no three.js call taking floats.
    const cos = Math.cos(instance.heading);
    const sin = Math.sin(instance.heading);
    const sx = layer.sx * widen * size;
    const sy = layer.sy * squash * size;
    const sz = layer.sz * widen * size;
    const m = this.mat;
    m[0] = cos * sx;
    m[1] = 0;
    m[2] = -sin * sx;
    m[3] = 0;
    m[4] = 0;
    m[5] = sy;
    m[6] = 0;
    m[7] = 0;
    m[8] = sin * sz;
    m[9] = 0;
    m[10] = cos * sz;
    m[11] = 0;
    m[12] = x;
    m[13] = instance.y + lift - dissolve * 0.25 + layer.yOffset * squash * size;
    m[14] = z;
    m[15] = 1;
    const s = this.st;
    s[0] = instance.flash;
    s[1] = dissolve;
    s[2] = instance.tint;
    s[3] = instance.tint !== 0 ? (instance.tintMix ?? 0.85) : 0;
    if (instance.clip !== rec.clip) {
      rec.prevClip = rec.clip;
      rec.prevTime = rec.time;
      rec.sinceClip = 0;
      rec.clip = instance.clip;
    }
    rec.time = instance.clipTime;
    rec.elite = instance.elite === true;
    const parts = layer.parts;
    for (let p = 0; p < 3; p += 1) {
      const slot = rec.slot[p]!;
      if (slot < 0) continue;
      const part = parts[p]!;
      (part.mesh.instanceMatrix.array as Float32Array).set(m, slot * 16);
      (part.state.array as Float32Array).set(s, slot * 4);
      if (part.look !== null) {
        const o = part.look.array as Float32Array;
        o[slot * 4] = (look.outline ?? 1) * (instance.outline ?? 1);
        o[slot * 4 + 2] = instance.clip;
      }
      if (p === KIND.procedural) {
        const a = part.anim.array as Float32Array;
        a[slot * 4 + 2] = instance.stride ?? (instance.clip === CLIP.move ? 1 : instance.clip === CLIP.idle ? 0.12 : 0.4);
        a[slot * 4 + 3] = instance.clipTime;
      }
      part.dirty = true;
    }
    rec.gx = x;
    rec.gy = instance.y;
    rec.gz = z;
    rec.lift = lift;
    rec.footprint = Math.max(look.sizeM[0], look.sizeM[2]) * drawn * 1.1;
    rec.dissolve = dissolve;
  }

  setRings(rings: readonly CrowdRing[]): void {
    this.rings = rings;
  }

  setImpostorRule(rule: ImpostorRule): void {
    if (this.mode !== "vat") return;
    this.rule = rule;
    if (rule.kind !== "none") for (const layer of this.layerList) if (this.layerWantsImpostors(layer)) this.ensureAtlas(layer);
  }

  /** A ring's colour parsed once per distinct string (Color.set on a string allocates match arrays). */
  private ringColour(hex: string): THREE.Color {
    let colour = this.ringColours.get(hex);
    if (colour === undefined) {
      colour = new THREE.Color(hex);
      this.ringColours.set(hex, colour);
    }
    return colour;
  }

  setOutlines(on: boolean): void {
    this.outlinesOn = on;
    for (const layer of this.layerList) for (const part of layer.parts) if (part !== null && part.outline !== null) part.outline.visible = on;
  }

  /** Writes ground mark `n` of `kind` from the mark fields (mx … mHeight); false when the batch is full. */
  private mark(n: number, kind: number, colour: THREE.Color | null): boolean {
    if (n >= this.shadowCapacity) return false;
    this.shadowPos[n * 3] = this.mx;
    this.shadowPos[n * 3 + 1] = this.my;
    this.shadowPos[n * 3 + 2] = this.mz;
    this.shadowData[n * 4] = this.mSize;
    this.shadowData[n * 4 + 1] = this.mAlpha;
    this.shadowData[n * 4 + 2] = kind;
    this.shadowData[n * 4 + 3] = this.mHeight;
    this.shadowColour[n * 3] = colour === null ? 0 : colour.r;
    this.shadowColour[n * 3 + 1] = colour === null ? 0 : colour.g;
    this.shadowColour[n * 3 + 2] = colour === null ? 0 : colour.b;
    return true;
  }

  private layerWantsImpostors(layer: Layer): boolean {
    const rule = this.rule;
    return rule.kind === "far" || rule.kind === "plain" || (rule.kind === "swarm" && layer.look.gait === "swarm");
  }

  /** Rule "far": the screen distance² below which the `keep` nearest plain beasts stay on VAT. */
  private farThreshold(keep: number): number {
    const camera = (this.renderer as Partial<Renderer3D>).camera;
    let n = 0;
    const list = this.liveList;
    if (camera !== undefined) {
      const v = camera.matrixWorldInverse.elements;
      const p = camera.projectionMatrix.elements;
      for (let k = 0; k < list.length; k += 1) {
        const rec = list[k]!;
        const wx = rec.gx;
        const wy = rec.gy + rec.lift;
        const wz = rec.gz;
        const ex = v[0]! * wx + v[4]! * wy + v[8]! * wz + v[12]!;
        const ey = v[1]! * wx + v[5]! * wy + v[9]! * wz + v[13]!;
        const ez = v[2]! * wx + v[6]! * wy + v[10]! * wz + v[14]!;
        const cx = p[0]! * ex + p[4]! * ey + p[8]! * ez + p[12]!;
        const cy = p[1]! * ex + p[5]! * ey + p[9]! * ez + p[13]!;
        const cw = p[3]! * ex + p[7]! * ey + p[11]! * ez + p[15]!;
        const w = Math.abs(cw) > 1e-6 ? cw : 1e-6;
        rec.screen = (cx / w) * (cx / w) + (cy / w) * (cy / w);
      }
    } else for (let k = 0; k < list.length; k += 1) list[k]!.screen = list[k]!.gx * list[k]!.gx + list[k]!.gz * list[k]!.gz;
    for (let k = 0; k < list.length && n < this.far.length; k += 1) if (!list[k]!.elite) this.far[n++] = list[k]!.screen;
    if (n <= keep) return Infinity;
    if (keep <= 0) return -1;
    // The keep-th nearest stays; anything farther goes.
    return selectKth(this.far, n, keep - 1);
  }

  update(dt: number): void {
    this.time.value += Math.max(0, dt);
    this.dt = Math.max(0, dt);
    if (this.mode !== "procedural") this.stepKinds();
    for (let k = 0; k < this.layerList.length; k += 1) {
      const parts = this.layerList[k]!.parts;
      for (let p = 0; p < 3; p += 1) {
        const part = parts[p];
        if (part === null || part === undefined) continue;
        part.mesh.count = part.count;
        if (part.outline !== null) part.outline.count = part.count;
        if (!part.dirty) continue;
        part.dirty = false;
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.colour !== null) part.colour.needsUpdate = true;
        part.state.needsUpdate = true;
        part.anim.needsUpdate = true;
        if (part.look !== null) part.look.needsUpdate = true;
        if (part.blend !== null) part.blend.needsUpdate = true;
      }
    }
    this.updateShadows();
  }

  /** VAT clocks and blends, impostor phases, and the 1 s / 0.2 s kind switch of the ladder. */
  private stepKinds(): void {
    const dt = this.dt;
    const list = this.liveList;
    const rule = this.rule;
    const threshold = rule.kind === "far" ? this.farThreshold(rule.keep) : 0;
    for (let k = 0; k < list.length; k += 1) {
      const rec = list[k]!;
      const layer = rec.layer;
      rec.sinceClip += dt;
      rec.prevTime += dt;
      if (this.mode === "vat" && rule.kind !== "none") {
        const plain = !rec.elite;
        const imp =
          rule.kind === "swarm" ? layer.look.gait === "swarm" : rule.kind === "plain" ? plain : plain && rec.screen > threshold;
        const want = imp ? KIND.impostor : KIND.vat;
        if (rec.fresh) {
          rec.sw.mode = want;
          rec.sw.fade = 1;
          rec.sw.pending = 0;
        } else stepModeSwitch(rec.sw, want, dt);
        this.placeKinds(rec);
      }
      rec.fresh = false;
      // Fades: the kind it is going to has `fade`, the other 1 − fade.
      const vatFade = rec.sw.mode === KIND.vat ? rec.sw.fade : 1 - rec.sw.fade;
      const vatSlot = rec.slot[KIND.vat]!;
      if (vatSlot >= 0) {
        const part = layer.parts[KIND.vat]!;
        const a = part.anim.array as Float32Array;
        a[vatSlot * 4] = rec.clip;
        a[vatSlot * 4 + 1] = this.clipTimeOf(rec, rec.clip, rec.time);
        a[vatSlot * 4 + 2] = rec.prevClip;
        a[vatSlot * 4 + 3] = this.clipTimeOf(rec, rec.prevClip, rec.prevTime);
        (part.blend!.array as Float32Array)[vatSlot] = rec.sinceClip >= VAT_BLEND_S ? 1 : rec.sinceClip / VAT_BLEND_S;
        (part.look!.array as Float32Array)[vatSlot * 4 + 3] = vatFade;
        part.dirty = true;
      }
      const impSlot = rec.slot[KIND.impostor]!;
      if (impSlot >= 0) {
        const part = layer.parts[KIND.impostor]!;
        const a = part.anim.array as Float32Array;
        a[impSlot * 4] = rec.clip === CLIP.move ? (rec.time + rec.offset * layer.cycleS) / layer.cycleS : rec.clip === CLIP.death ? 0.5 : rec.offset;
        a[impSlot * 4 + 1] = 1 - vatFade;
        part.dirty = true;
      }
    }
  }

  /** Seconds into a clip with the beast's own offset on the looping Idle and Move. */
  private clipTimeOf(rec: Rec, clip: number, time: number): number {
    return clip === CLIP.idle || clip === CLIP.move ? time + rec.offset * (rec.layer.clipS[clip] ?? 1) : time;
  }

  /** Slots follow the switch: both kinds while crossfading, else only the one it is in. */
  private placeKinds(rec: Rec): void {
    const layer = rec.layer;
    const blending = rec.sw.fade < 1;
    const needVat = blending || rec.sw.mode === KIND.vat;
    const needImp = blending || rec.sw.mode === KIND.impostor;
    const vat = layer.parts[KIND.vat]!;
    if (needVat && rec.slot[KIND.vat]! < 0 && vat.count < this.capacity) this.claimFrom(rec, vat, layer.parts[KIND.impostor] ?? null);
    if (needImp && rec.slot[KIND.impostor]! < 0) {
      const imp = this.ensureAtlas(layer);
      if (imp.count < this.capacity) this.claimFrom(rec, imp, vat);
    }
    if (!needVat && rec.slot[KIND.vat]! >= 0) this.release(rec, vat);
    const imp = layer.parts[KIND.impostor];
    if (!needImp && imp !== null && imp !== undefined && rec.slot[KIND.impostor]! >= 0) this.release(rec, imp);
  }

  /** Claims a slot in `part` and copies the matrix and state from `from` (the kind it already has). */
  private claimFrom(rec: Rec, part: Part, from: Part | null): void {
    this.claim(rec, part);
    const slot = rec.slot[part.kind]!;
    const other = from === null ? -1 : rec.slot[from.kind]!;
    if (from === null || other < 0) return;
    const dst = part.mesh.instanceMatrix.array as Float32Array;
    const src = from.mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < 16; k += 1) dst[slot * 16 + k] = src[other * 16 + k]!;
    const ds = part.state.array as Float32Array;
    const ss = from.state.array as Float32Array;
    for (let k = 0; k < 4; k += 1) ds[slot * 4 + k] = ss[other * 4 + k]!;
  }

  private updateShadows(): void {
    if (this.shadows === null) return;
    let n = 0;
    const list = this.liveList;
    for (let k = 0; k < list.length; k += 1) {
      const rec = list[k]!;
      const fade = 1 - rec.dissolve;
      this.mx = rec.gx;
      this.mz = rec.gz;
      this.mHeight = 0;
      if (rec.layer.look.gait === "flyer" && rec.lift > 0.6) {
        // A flyer: the spot and ring right under it, and a dashed tether up to its belly.
        this.my = rec.gy + 0.05;
        this.mSize = rec.footprint * 0.95;
        this.mAlpha = fade;
        if (this.mark(n, 1, null)) n += 1;
        this.mSize = 0.12;
        this.mAlpha = 0.55 * fade;
        this.mHeight = rec.lift;
        if (this.mark(n, 2, null)) n += 1;
      } else {
        this.my = rec.gy + 0.04;
        this.mSize = rec.footprint * ((1 / (1 + rec.lift * 0.35)) * 0.45 + 0.55);
        this.mAlpha = fade;
        if (this.mark(n, 0, null)) n += 1;
      }
    }
    for (let k = 0; k < this.rings.length && k < RING_CAPACITY; k += 1) {
      const ring = this.rings[k]!;
      this.mx = ring.x;
      this.my = ring.y + 0.05;
      this.mz = ring.z;
      this.mSize = ring.radius * 2;
      this.mAlpha = ring.alpha;
      this.mHeight = 0;
      if (this.mark(n, 3, this.ringColour(ring.colour))) n += 1;
    }
    const geometry = this.shadows.geometry;
    geometry.instanceCount = n;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      for (const part of layer.parts) {
        if (part === null) continue;
        part.mesh.removeFromParent();
        part.outline?.removeFromParent();
        part.mesh.geometry.dispose();
        (part.mesh.material as THREE.Material).dispose();
        (part.outline?.material as THREE.Material | undefined)?.dispose();
        part.mesh.dispose();
        part.outline?.dispose();
      }
      if (layer.ownsVat && layer.vat !== null) disposeVat(layer.vat);
      if (layer.ownsAtlas && layer.atlas !== null) layer.atlas.dispose();
    }
    this.layers.clear();
    this.layerList.length = 0;
    this.ringColours.clear();
    this.recs.clear();
    this.liveList.length = 0;
    this.lodGeometry?.dispose();
    this.ramp.dispose();
    if (this.shadows !== null) {
      this.shadows.geometry.dispose();
      this.shadows.material.dispose();
    }
    this.group.removeFromParent();
  }
}

function copyItem(array: Float32Array, size: number, from: number, to: number): void {
  for (let k = 0; k < size; k += 1) array[to * size + k] = array[from * size + k]!;
}

/** The k-th smallest (0-based) of `values[0..n)` by quickselect, reordering them in place (no allocation). */
export function selectKth(values: Float32Array, n: number, k: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = values[(lo + hi) >> 1]!;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (values[i]! < pivot) i += 1;
      while (values[j]! > pivot) j -= 1;
      if (i <= j) {
        const t = values[i]!;
        values[i] = values[j]!;
        values[j] = t;
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return values[k]!;
  }
  return values[k]!;
}
