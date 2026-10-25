/**
 * Procedural ground (canon §8.1, §21.1): the 40 × 26 m field tinted on dó
 * paper with soft patches, the corridors beasts walk from each ground gate to
 * the Trận Tâm painted lighter, a faint 1 m grid, ink decals (one instanced
 * draw), a darker surround for the misty margin, and the field's ink border.
 * No models, no image files: vertex colours, lines and a procedural shader.
 * Deterministic from the stage and a seed (view only, never read by the sim).
 * Owner: Lane 6.
 */
import * as THREE from "three";
import { FIELD } from "../content/rules";
import type { StageDef } from "../content/types";
import { CORRIDOR_HALF_M } from "../ui/screen-zones";

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

/** One corridor per ground gate, from the gate to the heart edge (beasts walk the flow field inside it, canon §8.1). */
export function corridors(stage: StageDef): Corridor[] {
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
export function corridorWeight(x: number, z: number, list: readonly Corridor[]): number {
  let near = Infinity;
  for (const c of list) near = Math.min(near, segmentDistance(x, z, c.ax, c.az, c.bx, c.bz));
  const inner = CORRIDOR_HALF_M - 0.6;
  const outer = CORRIDOR_HALF_M + 0.6;
  if (near <= inner) return 1;
  if (near >= outer) return 0;
  const k = (outer - near) / (outer - inner);
  return k * k * (3 - 2 * k);
}

/** Soft patches 0–1 (deterministic, view only). */
function patchAt(x: number, z: number): number {
  return 0.5 + 0.25 * Math.sin(x * 0.31 + z * 0.17) + 0.25 * Math.sin(z * 0.43 - x * 0.11);
}

/** The field plane with vertex colours: earth, patches, corridors. */
function groundPlane(stage: StageDef): THREE.Mesh {
  const box = fieldBox(stage);
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, Math.round(width * 2), Math.round(depth * 2));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const earth = new THREE.Color(GROUND_COLOURS.earth);
  const corridor = new THREE.Color(GROUND_COLOURS.corridor);
  const dark = new THREE.Color(GROUND_COLOURS.dark);
  const c = new THREE.Color();
  const list = corridors(stage);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    c.copy(earth).lerp(dark, patchAt(x, z) * 0.55);
    c.lerp(corridor, corridorWeight(x, z, list) * 0.85);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "ground-field";
  return mesh;
}

/** The misty surround (canon D48: a margin of mountain mist round the field). */
function surround(stage: StageDef): THREE.Mesh {
  const box = fieldBox(stage);
  const geometry = new THREE.PlaneGeometry(130, 100);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((box.minX + box.maxX) / 2, -0.05, (box.minZ + box.maxZ) / 2 - 8);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: GROUND_COLOURS.surround }));
  mesh.name = "ground-surround";
  return mesh;
}

/** A faint 1 m grid (one draw call). */
function grid(stage: StageDef): THREE.LineSegments {
  const box = fieldBox(stage);
  const points: number[] = [];
  for (let x = Math.ceil(box.minX); x <= box.maxX; x += 1) points.push(x, 0.015, box.minZ, x, 0.015, box.maxZ);
  for (let z = Math.ceil(box.minZ); z <= box.maxZ; z += 1) points.push(box.minX, 0.015, z, box.maxX, 0.015, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: GROUND_COLOURS.grid, transparent: true, opacity: 0.14, depthWrite: false }));
  lines.name = "ground-grid";
  return lines;
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
      if (corridorWeight(x, z, list) < 0.5 && Math.hypot(x, z) > FIELD.heartEdgeMm / 1000 + 1) break;
    }
    out[k * 5] = x;
    out[k * 5 + 1] = z;
    out[k * 5 + 2] = 0.8 + random() * 2.4;
    out[k * 5 + 3] = random() * Math.PI * 2;
    out[k * 5 + 4] = random();
  }
  return out;
}

const DECAL_VERTEX = /* glsl */ `
attribute vec4 iDecal;
attribute float iSeed;
varying vec2 vUv;
varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSeed = iSeed;
  float c = cos(iDecal.w);
  float s = sin(iDecal.w);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iDecal.z;
  vec4 mvPosition = modelViewMatrix * vec4(iDecal.x + p.x, 0.02, iDecal.y + p.y, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const DECAL_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 91.7) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0 + (n(vUv * 6.0) - 0.5) * 0.55 + (n(vUv * 17.0) - 0.5) * 0.18;
  float a = (1.0 - smoothstep(0.55, 0.95, d)) * 0.3;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.1, 0.11, 0.14, a);
  #include <fog_fragment>
}`;

/** Ink decals (canon §21.1 "decal mực trên đất"): one instanced draw. */
function decals(stage: StageDef, count: number, seed: number): THREE.Mesh {
  const spots = decalSpots(stage, count, seed);
  const data = new Float32Array(count * 4);
  const seeds = new Float32Array(count);
  for (let k = 0; k < count; k += 1) {
    data.set(spots.subarray(k * 5, k * 5 + 4), k * 4);
    seeds[k] = spots[k * 5 + 4]!;
  }
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  geometry.setAttribute("iDecal", new THREE.InstancedBufferAttribute(data, 4));
  geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: DECAL_VERTEX,
    fragmentShader: DECAL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = "ground-decals";
  return mesh;
}

export interface GroundOptions {
  /** Decal seed (view only; default 7). */
  readonly seed?: number;
  /** Ink decals (default 36). */
  readonly decals?: number;
}

/** The ground of `stage`: surround, field plane, grid, decals, border (5 draw calls). Add it to renderer.layers.ground. */
export function createGround(stage: StageDef, options: GroundOptions = {}): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "ground";
  group.add(surround(stage), groundPlane(stage), grid(stage), decals(stage, options.decals ?? 36, options.seed ?? 7), border(stage));
  return group;
}
