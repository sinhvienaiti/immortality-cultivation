/**
 * Thanh Thạch tiles (387b): a single splat-blended field and skirt, with
 * distances baked from the sim's authored lane points. View only.
 */
import * as THREE from "three";
import { FIELD } from "../content/rules";
import type { StageDef } from "../content/types";
import { corridorHalfM } from "../ui/screen-zones";

export const GROUND_COLOURS = {
  earth: "#b3ab95",
  corridor: "#cdc5ab",
  dark: "#9d957f",
  surround: "#7f8781",
  grid: "#5d5a50",
  border: "#2a2c33",
} as const;

/** A ground corridor gate → heart edge (metres). */
export interface Corridor {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

/** The field's extent in metres. */
export function fieldBox(stage: StageDef): { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } {
  const f = stage.field;
  return { minX: f.minXMm / 1000, maxX: f.maxXMm / 1000, minZ: f.minZMm / 1000, maxZ: f.maxZMm / 1000 };
}

/** Authored lane segments; stages without a lane keep gate-to-heart corridors. */
export function corridors(stage: StageDef): Corridor[] {
  const lane = stage.field.lane;
  if (lane) return lane.pointsMm.slice(1).map((b, i) => {
    const a = lane.pointsMm[i]!;
    return { ax: a.xMm / 1000, az: a.zMm / 1000, bx: b.xMm / 1000, bz: b.zMm / 1000 };
  });
  const edge = FIELD.heartEdgeMm / 1000;
  return stage.field.gates
    .filter((gate) => gate.ground)
    .map((gate) => {
      const ax = gate.at.xMm / 1000;
      const az = gate.at.zMm / 1000;
      const length = Math.hypot(ax, az) || 1;
      return { ax, az, bx: (ax / length) * edge, bz: (az / length) * edge };
    });
}

/** Distance (metres) from (px, pz) to segment a→b. */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** 0 (plain earth) … 1 (inside a corridor): full inside the drawn half-width, fading over 1.2 m. */
export function corridorWeight(x: number, z: number, list: readonly Corridor[], halfM = 2.2): number {
  let near = Infinity;
  for (const c of list) near = Math.min(near, segmentDistance(x, z, c.ax, c.az, c.bx, c.bz));
  const inner = halfM - 0.6;
  const outer = halfM + 0.6;
  if (near <= inner) return 1;
  if (near >= outer) return 0;
  const k = (outer - near) / (outer - inner);
  return k * k * (3 - 2 * k);
}

/** Tile URLs are also the loader's manifest; media stays outside Git. */
export const GROUND_TEXTURE_URLS = {
  lane: "/assets/immortality-cultivation/ground/thanh-thach/lane-paving.v2.webp",
  court: "/assets/immortality-cultivation/ground/thanh-thach/court-paving.v2.webp",
  cracked: "/assets/immortality-cultivation/ground/thanh-thach/court-cracked.v2.webp",
  formation: "/assets/immortality-cultivation/ground/thanh-thach/formation-worn.v2.webp",
  moss: "/assets/immortality-cultivation/ground/thanh-thach/moss-patch.v2.webp",
  rubble: "/assets/immortality-cultivation/ground/thanh-thach/rubble-edge.v2.webp",
} as const;

export const GROUND_EXTENT = { minX: -40, maxX: 40, minZ: -60, maxZ: 16 } as const;
export const GROUND_TILE_M = 4;

export interface GroundTextureLoader {
  load(url: string): THREE.Texture;
}

export function loadGroundTextures(loader: GroundTextureLoader): Record<keyof typeof GROUND_TEXTURE_URLS, THREE.Texture> {
  const textures = {} as Record<keyof typeof GROUND_TEXTURE_URLS, THREE.Texture>;
  for (const key of Object.keys(GROUND_TEXTURE_URLS) as (keyof typeof GROUND_TEXTURE_URLS)[]) {
    const texture = loader.load(GROUND_TEXTURE_URLS[key]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    textures[key] = texture;
  }
  return textures;
}

/** Bake distance once on a 0.5 m grid, rather than scanning 50 segments per fragment. */
export function groundGeometry(stage: StageDef): THREE.PlaneGeometry {
  const box = GROUND_EXTENT;
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, width * 2, depth * 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
  const position = geometry.getAttribute("position");
  const distance = new Float32Array(position.count);
  const list = corridors(stage);
  for (let i = 0; i < position.count; i += 1) {
    let nearest = 1000;
    for (const c of list) nearest = Math.min(nearest, segmentDistance(position.getX(i), position.getZ(i), c.ax, c.az, c.bx, c.bz));
    distance[i] = nearest;
  }
  geometry.setAttribute("laneDistance", new THREE.BufferAttribute(distance, 1));
  return geometry;
}

function stageSeed(stage: StageDef): number {
  let seed = 2166136261;
  for (let i = 0; i < stage.id.length; i += 1) seed = Math.imul(seed ^ stage.id.charCodeAt(i), 16777619);
  return (seed >>> 0) % 65536;
}

const GROUND_VERTEX = /* glsl */ `
attribute float laneDistance;
varying vec2 vGround;
varying float vLaneDistance;
#include <fog_pars_vertex>
void main() {
  vGround = position.xz;
  vLaneDistance = laneDistance;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GROUND_FRAGMENT = /* glsl */ `
uniform sampler2D uLane;
uniform sampler2D uCourt;
uniform sampler2D uCracked;
uniform sampler2D uFormation;
uniform sampler2D uMoss;
uniform sampler2D uRubble;
uniform float uSeed;
uniform float uHalfM;
uniform float uTileM;
uniform vec3 uSurround;
varying vec2 vGround;
varying float vLaneDistance;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = vGround / uTileM;
  float wear = smoothstep(0.25, 0.8, noise(vGround / 5.0));
  vec3 court = mix(texture2D(uCourt, uv).rgb, texture2D(uCracked, uv).rgb, wear * 0.6) * 0.85;
  vec3 lane = texture2D(uLane, uv).rgb * 1.12;
  // A one-metre shoulder straddles the authoritative lane boundary.
  float inside = 1.0 - smoothstep(uHalfM - 0.5, uHalfM + 0.5, vLaneDistance);
  float shoulder = 1.0 - smoothstep(0.0, 0.5, abs(vLaneDistance - uHalfM));
  vec3 edge = mix(texture2D(uRubble, uv).rgb, texture2D(uMoss, uv).rgb, 0.2 + wear * 0.35);
  vec3 colour = mix(court, lane, inside);
  colour = mix(colour, edge, shoulder * 0.85);
  float formation = 1.0 - smoothstep(8.5, 9.0, length(vGround));
  colour = mix(colour, texture2D(uFormation, uv).rgb, formation);
  // The abyss remains a subdued version of the established surround palette.
  colour = mix(colour, uSurround * 0.35, smoothstep(22.0, 40.0, abs(vGround.x)));
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function groundPlane(stage: StageDef, options: GroundOptions): THREE.Mesh {
  // Node scene tests have no image DOM; injected loaders test the exact manifest.
  const loader = options.textureLoader ?? (typeof document === "undefined" ? { load: () => new THREE.Texture() } : new THREE.TextureLoader());
  const textures = loadGroundTextures(loader);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uLane: { value: textures.lane }, uCourt: { value: textures.court },
      uCracked: { value: textures.cracked }, uFormation: { value: textures.formation },
      uMoss: { value: textures.moss }, uRubble: { value: textures.rubble },
      uSeed: { value: options.seed ?? stageSeed(stage) },
      uHalfM: { value: corridorHalfM(stage) }, uTileM: { value: GROUND_TILE_M },
      uSurround: { value: new THREE.Color(GROUND_COLOURS.surround) },
    },
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    fog: true,
  });
  // StageView already disposes materials; textures need their own release.
  material.addEventListener("dispose", () => {
    for (const texture of Object.values(textures)) texture.dispose();
  });
  const mesh = new THREE.Mesh(groundGeometry(stage), material);
  mesh.name = "ground-field";
  return mesh;
}

/** The field's ink border (one line loop). */
function border(stage: StageDef): THREE.LineLoop {
  const box = fieldBox(stage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([box.minX, 0.02, box.minZ, box.maxX, 0.02, box.minZ, box.maxX, 0.02, box.maxZ, box.minX, 0.02, box.maxZ], 3));
  const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: GROUND_COLOURS.border, transparent: true, opacity: 0.55, depthWrite: false }));
  line.name = "ground-border";
  return line;
}

/** xorshift32 in 0–1 (view only, never the sim's RNG). */
export function viewRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

/** Ink decal spots: x, z (m), size (m), angle (rad), seed (0–1); off the corridors' centre lines. */
export function decalSpots(stage: StageDef, count: number, seed: number): Float32Array {
  const box = fieldBox(stage);
  const random = viewRandom(seed);
  const list = corridors(stage);
  const out = new Float32Array(count * 5);
  for (let k = 0; k < count; k += 1) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries += 1) {
      x = box.minX + 1.5 + random() * (box.maxX - box.minX - 3);
      z = box.minZ + 1.5 + random() * (box.maxZ - box.minZ - 3);
      if (corridorWeight(x, z, list, corridorHalfM(stage)) < 0.5 && Math.hypot(x, z) > FIELD.heartEdgeMm / 1000 + 1) break;
    }
    out[k * 5] = x;
    out[k * 5 + 1] = z;
    out[k * 5 + 2] = 0.8 + random() * 2.4;
    out[k * 5 + 3] = random() * Math.PI * 2;
    out[k * 5 + 4] = random();
  }
  return out;
}

export interface GroundOptions {
  /** View-only wear seed; defaults to a stable hash of the stage id. */
  readonly seed?: number;
  /** Image loader injection for tests and previews. */
  readonly textureLoader?: GroundTextureLoader;
}

/** Authored tiles cover field and skirt in one draw; the ink border stays. */
export function createGround(stage: StageDef, options: GroundOptions = {}): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "ground";
  group.add(groundPlane(stage, options), border(stage));
  return group;
}
