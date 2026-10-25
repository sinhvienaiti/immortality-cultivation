/**
 * The bench's own field for HN0 case 0 (canon §20.3 "sân, camera, hậu kỳ,
 * đất, decal"): the 40 × 26 m ground with painted corridors from the gates to
 * the heart, a 1 m grid, the Trận Tâm, the Kết Giới ring (r 9 m), the Tâm
 * nhãn, two Trận Trụ, the gates, ink decals; a darker surround. About 9 draw
 * calls before post. Grey-box primitives only (canon D27). The game's scene is
 * Lane 6's (view/stage.ts, ground.ts); this one only has to cost the same order.
 * Pillar and node spots are bench guesses: Lane 2's StageDef owns the real ones.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import { FIELD, FORMATION } from "../../content/rules";
import { FIELD_M } from "../renderer";

/** Bench placements (metres): pillars in the middle pass, the node beside the heart. */
export const BENCH_SPOTS = {
  pillars: [
    [-6.5, -8.5],
    [6.5, -8.5],
  ],
  node: [0, 2.8],
  heartRadius: 1.8,
} as const;

const GROUND_COLOURS = { earth: "#b3ab95", corridor: "#cdc5ab", dark: "#9d957f", surround: "#7f8781" } as const;

/** Distance from point to segment (metres). */
function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** The ground routes of the bench (gate → bend → heart), metres; the herd walks them too. */
export function benchRoutes(): { readonly gate: readonly [number, number]; readonly bend: readonly [number, number] }[] {
  return (["A", "B"] as const).map((gate) => {
    const g = FIELD.gates[gate];
    const x = g.xMm / 1000;
    return { gate: [x, g.zMm / 1000] as const, bend: [x * 0.62, -9.5] as const };
  });
}

function groundPlane(): THREE.Mesh {
  const width = FIELD_M.maxX - FIELD_M.minX;
  const depth = FIELD_M.maxZ - FIELD_M.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, FIELD.cols, FIELD.rows);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((FIELD_M.minX + FIELD_M.maxX) / 2, 0, (FIELD_M.minZ + FIELD_M.maxZ) / 2);
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const earth = new THREE.Color(GROUND_COLOURS.earth);
  const corridor = new THREE.Color(GROUND_COLOURS.corridor);
  const dark = new THREE.Color(GROUND_COLOURS.dark);
  const c = new THREE.Color();
  const routes = benchRoutes();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // Soft patches (view only, deterministic).
    const patch = 0.5 + 0.25 * Math.sin(x * 0.31 + z * 0.17) + 0.25 * Math.sin(z * 0.43 - x * 0.11);
    c.copy(earth).lerp(dark, patch * 0.55);
    let near = Infinity;
    for (const route of routes) {
      near = Math.min(near, segmentDistance(x, z, route.gate[0], route.gate[1], route.bend[0], route.bend[1]), segmentDistance(x, z, route.bend[0], route.bend[1], 0, 0));
    }
    const corridorMix = 1 - THREE.MathUtils.smoothstep(near, 1.8, 3.4);
    c.lerp(corridor, corridorMix * 0.85);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "bench-ground";
  return mesh;
}

function surround(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(110, 80);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.05, -10);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: GROUND_COLOURS.surround }));
  mesh.name = "bench-surround";
  return mesh;
}

function grid(): THREE.LineSegments {
  const points: number[] = [];
  for (let x = FIELD_M.minX; x <= FIELD_M.maxX; x += 1) points.push(x, 0.015, FIELD_M.minZ, x, 0.015, FIELD_M.maxZ);
  for (let z = FIELD_M.minZ; z <= FIELD_M.maxZ; z += 1) points.push(FIELD_M.minX, 0.015, z, FIELD_M.maxX, 0.015, z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#5d5a50", transparent: true, opacity: 0.16, depthWrite: false }));
  lines.name = "bench-grid";
  return lines;
}

/** Ink decals (canon §21.1 "decal mực trên đất"): instanced quads with a procedural blot, one draw call. */
// iDecal: x, z (m), size (m), angle (rad); iSeed: 0–1 per blot.
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

function decals(count: number, seed: number): THREE.Mesh {
  const data = new Float32Array(count * 4);
  const seeds = new Float32Array(count);
  let s = seed >>> 0 || 1;
  const random = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
  for (let k = 0; k < count; k += 1) {
    data[k * 4] = FIELD_M.minX + 1.5 + random() * (FIELD_M.maxX - FIELD_M.minX - 3);
    data[k * 4 + 1] = FIELD_M.minZ + 1.5 + random() * (FIELD_M.maxZ - FIELD_M.minZ - 3);
    data[k * 4 + 2] = 0.8 + random() * 2.4;
    data[k * 4 + 3] = random() * Math.PI * 2;
    seeds[k] = random();
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
    fragmentShader: /* glsl */ `
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
  float a = (1.0 - smoothstep(0.55, 0.95, d)) * 0.34;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.1, 0.11, 0.14, a);
  #include <fog_fragment>
}`,
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
  mesh.name = "bench-decals";
  return mesh;
}

/** The field's pieces; add `group` to the renderer's ground layer. */
export function buildBenchField(seed = 7): THREE.Group {
  const group = new THREE.Group();
  group.name = "bench-field";
  group.add(surround(), groundPlane(), grid(), decals(36, seed));

  const stone = new THREE.MeshLambertMaterial({ color: "#d8d2c0" });
  const heart = new THREE.Mesh(new THREE.CylinderGeometry(BENCH_SPOTS.heartRadius, BENCH_SPOTS.heartRadius + 0.3, 0.45, 40), stone);
  heart.position.y = 0.22;
  heart.name = "bench-heart";

  const barrier = FORMATION.barrierRadiusMm / 1000;
  const ringGeometry = new THREE.RingGeometry(barrier - 0.14, barrier + 0.14, 128);
  ringGeometry.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: "#eef2e6", transparent: true, opacity: 0.7, depthWrite: false }));
  ring.position.y = 0.03;
  ring.name = "bench-barrier";

  const nodeGeometry = new THREE.CircleGeometry(0.7, 28);
  nodeGeometry.rotateX(-Math.PI / 2);
  const node = new THREE.Mesh(nodeGeometry, new THREE.MeshBasicMaterial({ color: "#eae4d0" }));
  node.position.set(BENCH_SPOTS.node[0], 0.035, BENCH_SPOTS.node[1]);
  node.name = "bench-node";

  const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 1.05, 3.4, 14).translate(0, 1.7, 0), new THREE.MeshLambertMaterial({ color: "#8c8d88" }), BENCH_SPOTS.pillars.length);
  const m = new THREE.Matrix4();
  BENCH_SPOTS.pillars.forEach(([x, z], k) => pillars.setMatrixAt(k, m.makeTranslation(x, 0, z)));
  pillars.name = "bench-pillars";

  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 3.2, 0.7).translate(0, 1.6, 0), new THREE.MeshLambertMaterial({ color: "#6e655a" }), 4);
  let k = 0;
  for (const gate of ["A", "B"] as const) {
    const g = FIELD.gates[gate];
    for (const side of [-1.8, 1.8]) posts.setMatrixAt(k++, m.makeTranslation(g.xMm / 1000 + side, 0, g.zMm / 1000 - 0.4));
  }
  posts.name = "bench-gates";
  group.add(heart, ring, node, pillars, posts);
  return group;
}
