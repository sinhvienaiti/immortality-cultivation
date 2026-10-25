// Source: games/dragon-hold/src/view/crowd.ts @06cd4e6 (adapted: species layers keyed by caller ids on Lane 1's renderer, ramp (toon) shading, ink outline toggle, no foe ghosts, ink-and-ivory dissolve, clip slots; vat and impostor modes are milestone 1b)
/**
 * The crowd (canon §20.3, §10.9): one InstancedMesh per species per draw mode,
 * so 300 beasts of every gait cost a handful of draw calls. Milestone 1a gives
 * the "procedural" mode: primitive placeholders (canon D27: biped tall,
 * quadruped long and low, flyer floats, swarm small blocks in a cluster) with
 * the gait in the vertex shader (Rồng's and Tuyến Cuối's way). Per instance:
 * clip and clip time, hit flash, squash, death dissolve, status tint, drawn
 * size, fake knock-back; a blob shadow under each (one draw call for all, a
 * flyer's with a tether, swarm cluster rings); a toggleable inverted-hull ink
 * outline (canon §21.1, 1.5–2 px). Ramp shading in 3 steps (toon gradient).
 * "vat" and "impostor" come in milestone 1b (switching a beast between them
 * waits 1 s past the threshold and blends 0.2 s); the "bones" slot keeps its
 * type, unbuilt (canon §20.3).
 *
 * Usage (Lane 6): `const crowd = createCrowd(renderer, CROWD_MODE[quality])`;
 * each frame `crowd.add(serial, species)` for a new beast, `crowd.set(serial,
 * instance)` (metres, view only), `crowd.remove(serial)` when gone, then
 * `crowd.update(dt)` once. Nothing allocates per frame after warm-up.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { CrowdMode } from "../content/rules";
import type { Gait, PlaceholderDef, SpeciesId } from "../content/types";
import type { Renderer3D } from "./renderer";

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
  /** CLIP id and seconds into it (procedural: idle and move set the stride, attack lunges). */
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
  /** Gait strength 0 standing … 1 walking; default from the clip. */
  stride?: number;
  /** Height above the ground; default the look's hover. */
  lift?: number;
  /** Fake recoil in metres (kit Reactions); the sim position never moves. */
  knockX?: number;
  knockZ?: number;
  /** Outline strength 0–1 on top of the look's. */
  outline?: number;
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
  /** Builds a species layer now (empty), so a warm-up compile covers it. */
  prepare(species: SpeciesId): void;
  /** Advances the gait clock and uploads instance buffers once a frame. */
  update(dt: number): void;
  /** Draw calls the crowd costs now (layers in use, their outlines, the shadows). */
  drawCalls(): number;
  /** Triangles drawn now (bodies and outlines). */
  triangles(): number;
  /** Live instances of one species, or all. */
  instances(species?: SpeciesId): number;
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
attribute vec4 aAnim;
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

// Object-space gait on the unit body (aAnim: x gait id, y phase 0–1, z stride 0–1, w clip time; aLook.z clip id).
const CROWD_BEGIN = /* glsl */ `
#include <begin_vertex>
vState = aState;
vLook = aLook;
vTint = crowdTint(aState.z);
vLocal = position;
vColorCrowd = aColor;
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
 * ink. aLook.x scales it (0: none); a dissolving body loses it.
 */
const OUTLINE_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
vec3 crowdOut = transformed - uCenter;
#ifdef USE_INSTANCING
crowdOut = mat3(instanceMatrix) * crowdOut;
mvPosition = instanceMatrix * mvPosition;
#endif
${CROWD_BOB}
vec4 crowdWorld = modelMatrix * mvPosition;
crowdOut = mat3(modelMatrix) * crowdOut;
float crowdWidth = uOutlineK * length(cameraPosition - crowdWorld.xyz) * aLook.x * (1.0 - aState.y);
crowdWorld.xyz += normalize(crowdOut + vec3(0.0, 1e-5, 0.0)) * crowdWidth;
mvPosition = viewMatrix * crowdWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const OUTLINE_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
if (vState.y > 0.02 || vLook.x < 0.01) discard;
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

interface Layer {
  readonly species: SpeciesId;
  readonly look: CrowdLook;
  readonly mesh: THREE.InstancedMesh;
  readonly outline: THREE.InstancedMesh;
  readonly colour: THREE.InstancedBufferAttribute;
  readonly state: THREE.InstancedBufferAttribute;
  readonly anim: THREE.InstancedBufferAttribute;
  readonly lookAttr: THREE.InstancedBufferAttribute;
  /** Rec in each slot. */
  readonly owner: (Rec | null)[];
  readonly tris: number;
  count: number;
  dirty: boolean;
}

interface Rec {
  id: number;
  layer: Layer;
  index: number;
  /** Index in the dense live list. */
  live: number;
  /** Last ground point, lift, footprint and dissolve for the shadow. */
  gx: number;
  gy: number;
  gz: number;
  lift: number;
  footprint: number;
  dissolve: number;
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

/** The crowd on `renderer` (its actors layer). 1a builds "procedural" only. */
export function createCrowd(renderer: Renderer3D, mode: CrowdDrawMode, options: CrowdOptions = {}): Crowd {
  if (mode !== "procedural") {
    throw new Error("crowd: '" + mode + "' is not built yet (" + (mode === "bones" ? "kept as a type only, canon §20.3" : "milestone 1b") + "); use 'procedural'");
  }
  const crowd = new ProceduralCrowd(options);
  renderer.layers.actors.add(crowd.group);
  return crowd;
}

class ProceduralCrowd implements Crowd {
  readonly mode = "procedural" as const;
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
  private outlinesOn: boolean;
  private readonly sizeScratch = new THREE.Vector2();
  private readonly colourScratch = new THREE.Color();
  // The next ground mark (metres, alpha), set field by field before mark(): a call with float
  // arguments boxes each one (V8), and update() writes up to 2 × capacity marks a frame.
  private mx = 0;
  private my = 0;
  private mz = 0;
  private mSize = 0;
  private mAlpha = 0;
  private mHeight = 0;
  private readonly shadows: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null;
  private readonly shadowPos: Float32Array;
  private readonly shadowData: Float32Array;
  private readonly shadowColour: Float32Array;
  private readonly shadowCapacity: number;
  private rings: readonly CrowdRing[] = [];
  private readonly ringColours = new Map<string, THREE.Color>();
  private phaseSeed: number;

  constructor(options: CrowdOptions) {
    this.group.name = "crowd";
    this.capacity = Math.max(1, options.capacity ?? 360);
    this.looks = options.looks ?? ((species) => CROWD_LOOKS[species]);
    this.lodGeometry = options.lodTris !== undefined ? lodBlock(options.lodTris) : null;
    this.outlinesOn = options.outlines !== false;
    this.phaseSeed = (options.seed ?? 7) >>> 0 || 7;
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
    for (let k = 0; k < this.layerList.length; k += 1) if (this.layerList[k]!.count > 0) calls += this.outlinesOn ? 2 : 1;
    return calls;
  }

  triangles(): number {
    let tris = 0;
    for (let k = 0; k < this.layerList.length; k += 1) {
      const layer = this.layerList[k]!;
      tris += layer.count * layer.tris * (this.outlinesOn ? 2 : 1);
    }
    return tris;
  }

  instances(species?: SpeciesId): number {
    if (species !== undefined) return this.layers.get(species)?.count ?? 0;
    return this.liveList.length;
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
    this.layerFor(species);
  }

  private layerFor(species: SpeciesId): Layer {
    const existing = this.layers.get(species);
    if (existing !== undefined) return existing;
    const look = this.looks(species);
    const layer = this.makeLayer(species, look);
    this.layers.set(species, layer);
    this.layerList.push(layer);
    return layer;
  }

  private makeLayer(species: SpeciesId, look: CrowdLook): Layer {
    const capacity = this.capacity;
    const geometry = this.lodGeometry !== null ? this.lodGeometry.clone() : primitive(look.shape);
    const colour = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const lookAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aColor", colour);
    geometry.setAttribute("aState", state);
    geometry.setAttribute("aAnim", anim);
    geometry.setAttribute("aLook", lookAttr);
    const material = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: this.ramp });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
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
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = "crowd-" + species;
    this.group.add(mesh);

    // The hull: same geometry and instance matrices, back faces, pushed out in the vertex shader.
    const centre = { value: new THREE.Vector3(0, 0.5, 0) };
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uOutlineK = this.outlineK;
      shader.uniforms.uCenter = centre;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "uniform float uOutlineK;\nuniform vec3 uCenter;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", CROWD_BEGIN).replace("#include <project_vertex>", OUTLINE_PROJECT);
      shader.fragmentShader = "varying vec4 vState;\nvarying vec4 vLook;\n" + shader.fragmentShader.replace("#include <clipping_planes_fragment>", OUTLINE_CLIP);
    };
    outlineMaterial.customProgramCacheKey = () => "ic-crowd-outline-v1";
    const outline = new THREE.InstancedMesh(geometry, outlineMaterial, capacity);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.count = 0;
    outline.frustumCulled = false;
    outline.visible = this.outlinesOn;
    outline.name = "crowd-outline-" + species;
    outline.onBeforeRender = (renderer, _scene, camera) => {
      // About OUTLINE_PX at 1080p whatever the distance: width = k × distance.
      renderer.getSize(this.sizeScratch);
      const height = Math.max(1, this.sizeScratch.y);
      const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 28;
      const px = Math.max(1.5, (OUTLINE_PX * height) / 1080);
      const k = (px * 2 * Math.tan((fov * Math.PI) / 360)) / height;
      if (k !== this.outlineK.value) this.outlineK.value = k;
    };
    this.group.add(outline);
    return { species, look, mesh, outline, colour, state, anim, lookAttr, owner: new Array<Rec | null>(capacity).fill(null), tris: triangleCount(geometry), count: 0, dirty: true };
  }

  has(id: number): boolean {
    return this.recs.has(id);
  }

  add(id: number, species: SpeciesId): boolean {
    if (this.recs.has(id)) this.remove(id);
    const layer = this.layerFor(species);
    if (layer.count >= this.capacity) return false;
    const index = layer.count;
    layer.count += 1;
    const rec = this.pool.pop() ?? { id: 0, layer, index: 0, live: 0, gx: 0, gy: 0, gz: 0, lift: 0, footprint: 0, dissolve: 0 };
    rec.id = id;
    rec.layer = layer;
    rec.index = index;
    rec.live = this.liveList.length;
    rec.gx = rec.gy = rec.gz = 0;
    rec.lift = layer.look.hoverM;
    rec.footprint = Math.max(layer.look.sizeM[0], layer.look.sizeM[2]) * 1.1;
    rec.dissolve = 0;
    this.liveList.push(rec);
    this.recs.set(id, rec);
    layer.owner[index] = rec;
    const colour = this.colourScratch.set(layer.look.colour);
    const c = layer.colour.array as Float32Array;
    c[index * 3] = colour.r;
    c[index * 3 + 1] = colour.g;
    c[index * 3 + 2] = colour.b;
    (layer.state.array as Float32Array).fill(0, index * 4, index * 4 + 4);
    const a = layer.anim.array as Float32Array;
    a[index * 4] = GAIT_ID[layer.look.gait];
    a[index * 4 + 1] = this.nextPhase();
    a[index * 4 + 2] = 1;
    a[index * 4 + 3] = 0;
    const o = layer.lookAttr.array as Float32Array;
    o[index * 4] = layer.look.outline ?? 1;
    o[index * 4 + 1] = 0.35;
    o[index * 4 + 2] = CLIP.move;
    o[index * 4 + 3] = 0;
    // Hidden until the first set(): a zero scale.
    const m = layer.mesh.instanceMatrix.array as Float32Array;
    m.fill(0, index * 16, index * 16 + 16);
    m[index * 16 + 15] = 1;
    layer.dirty = true;
    return true;
  }

  remove(id: number): void {
    const rec = this.recs.get(id);
    if (rec === undefined) return;
    const layer = rec.layer;
    const last = layer.count - 1;
    const index = rec.index;
    if (index !== last) {
      // Swap the last instance into the hole.
      copyItem(layer.mesh.instanceMatrix.array as Float32Array, 16, last, index);
      copyItem(layer.colour.array as Float32Array, 3, last, index);
      copyItem(layer.state.array as Float32Array, 4, last, index);
      copyItem(layer.anim.array as Float32Array, 4, last, index);
      copyItem(layer.lookAttr.array as Float32Array, 4, last, index);
      const moved = layer.owner[last]!;
      layer.owner[index] = moved;
      moved.index = index;
    }
    layer.owner[last] = null;
    layer.count = last;
    layer.dirty = true;
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
    const index = rec.index;
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
    const sx = look.sizeM[0] * widen * size;
    const sy = look.sizeM[1] * squash * size;
    const sz = look.sizeM[2] * widen * size;
    const m = layer.mesh.instanceMatrix.array as Float32Array;
    const at = index * 16;
    m[at] = cos * sx;
    m[at + 1] = 0;
    m[at + 2] = -sin * sx;
    m[at + 3] = 0;
    m[at + 4] = 0;
    m[at + 5] = sy;
    m[at + 6] = 0;
    m[at + 7] = 0;
    m[at + 8] = sin * sz;
    m[at + 9] = 0;
    m[at + 10] = cos * sz;
    m[at + 11] = 0;
    m[at + 12] = x;
    m[at + 13] = instance.y + lift - dissolve * 0.25;
    m[at + 14] = z;
    m[at + 15] = 1;
    const s = layer.state.array as Float32Array;
    s[index * 4] = instance.flash;
    s[index * 4 + 1] = dissolve;
    s[index * 4 + 2] = instance.tint;
    s[index * 4 + 3] = instance.tint !== 0 ? (instance.tintMix ?? 0.85) : 0;
    const a = layer.anim.array as Float32Array;
    a[index * 4 + 2] = instance.stride ?? (instance.clip === CLIP.move ? 1 : instance.clip === CLIP.idle ? 0.12 : 0.4);
    a[index * 4 + 3] = instance.clipTime;
    const o = layer.lookAttr.array as Float32Array;
    o[index * 4] = (look.outline ?? 1) * (instance.outline ?? 1);
    o[index * 4 + 2] = instance.clip;
    rec.gx = x;
    rec.gy = instance.y;
    rec.gz = z;
    rec.lift = lift;
    rec.footprint = Math.max(look.sizeM[0], look.sizeM[2]) * drawn * 1.1;
    rec.dissolve = dissolve;
    layer.dirty = true;
  }

  setRings(rings: readonly CrowdRing[]): void {
    this.rings = rings;
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
    for (const layer of this.layers.values()) layer.outline.visible = on;
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

  update(dt: number): void {
    this.time.value += Math.max(0, dt);
    for (let k = 0; k < this.layerList.length; k += 1) {
      const layer = this.layerList[k]!;
      layer.mesh.count = layer.count;
      layer.outline.count = layer.count;
      if (!layer.dirty) continue;
      layer.dirty = false;
      layer.mesh.instanceMatrix.needsUpdate = true;
      layer.colour.needsUpdate = true;
      layer.state.needsUpdate = true;
      layer.anim.needsUpdate = true;
      layer.lookAttr.needsUpdate = true;
    }
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
      layer.mesh.removeFromParent();
      layer.outline.removeFromParent();
      layer.mesh.geometry.dispose();
      (layer.mesh.material as THREE.Material).dispose();
      (layer.outline.material as THREE.Material).dispose();
      layer.mesh.dispose();
      layer.outline.dispose();
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
