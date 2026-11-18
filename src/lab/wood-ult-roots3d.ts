/** Wood ultimate 3D roots (owner 16/11/2026): Blender claw and arch meshes, one InstancedMesh per variant.
 * Source: art-src/lab/vfx/wood-ult/roots3d/make_roots.py -> wood-roots3d.glb. Grow up through the ground, hold, sink. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const WOOD_ROOT_VARIANTS = ["claw-0", "claw-1", "claw-2", "claw-3", "arch-0", "arch-1"] as const;
export const WOOD_ROOT_CAPACITY = [48, 48, 48, 48, 40, 40] as const;
export const WOOD_ROOT_TIMING = { grow: 0.34, sinkAfter: 3.2, sink: 0.75 } as const;
export interface WoodRootPlacement { variant: number; x: number; z: number; yaw: number; scale: number; birth: number }

const VERTEX = /* glsl */ `
attribute vec3 iRoot; // birth, sinkAt, seed
uniform float uTime;
uniform float uHeight;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vSink;
varying float vPulse;
void main() {
  float age = uTime - iRoot.x;
  float t = clamp(age / ${WOOD_ROOT_TIMING.grow.toFixed(2)}, 0.0, 1.0);
  float g = 1.0 - pow(1.0 - t, 3.0);
  float sink = smoothstep(iRoot.y, iRoot.y + ${WOOD_ROOT_TIMING.sink.toFixed(2)}, uTime);
  vec3 p = position;
  // Burst up through the floor with a small overshoot, then settle; sinking reverses it.
  p.y -= (1.0 - g) * uHeight * 1.05 + sink * uHeight * 0.9;
  p.y += sin(t * 3.14159) * 0.08 * uHeight * (1.0 - sink);
  p.xz *= 0.7 + 0.3 * g;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(m) * normal);
  vUv = uv;
  vSink = sink;
  vPulse = exp(-max(0.0, age - 0.05) * 3.0) * step(0.0, age);
  gl_Position = projectionMatrix * viewMatrix * w;
  if (age < 0.0 || uTime > iRoot.y + ${(WOOD_ROOT_TIMING.sink + 0.05).toFixed(2)}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uEmis;
uniform float uTime;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vSink;
varying float vPulse;
void main() {
  if (vWorld.y < -0.02) discard;
  vec4 art = texture2D(uMap, vUv);
  if (art.a < 0.45) discard;
  float leaf = step(0.751, vUv.x);
  // Crumble while sinking: darker fibres go first.
  float grain = dot(art.rgb, vec3(0.5, 0.4, 0.1));
  if (vSink > 0.0 && grain + 0.15 < vSink * 0.9) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  vec3 sun = normalize(vec3(0.35, 0.85, 0.4));
  float diff = 0.38 + 0.62 * max(dot(n, sun), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  // Ground contact darkens the root base into the floor.
  float contact = smoothstep(0.0, 0.5, vWorld.y);
  // Bark: luminance through a warm brown ramp (no olive), warm key highlight on lit ridges.
  float lum = dot(art.rgb, vec3(0.3, 0.55, 0.15));
  vec3 brown = mix(vec3(0.05, 0.025, 0.012), vec3(0.36, 0.19, 0.08), smoothstep(0.0, 0.35, lum));
  brown = mix(brown, vec3(0.78, 0.52, 0.28), smoothstep(0.32, 0.6, lum));
  float key = pow(max(dot(n, sun), 0.0), 6.0);
  vec3 barkCol = brown * diff * (0.55 + 0.45 * contact) + vec3(0.42, 0.26, 0.1) * key * smoothstep(0.2, 0.5, lum);
  vec3 bark = mix(barkCol, art.rgb * diff * 1.15, leaf);
  vec3 vein = texture2D(uEmis, vUv).rgb;
  float breathe = 0.8 + 0.2 * sin(uTime * 3.0 + vWorld.x * 0.7 + vWorld.z * 0.5);
  float veinK = (2.6 * breathe + 1.6 * vPulse) * (1.0 - leaf * 0.3);
  vec3 color = bark * (1.0 - min(vein.g, 1.0) * 0.6) + vein * veinK
             + vec3(0.35, 0.95, 0.35) * rim * 0.75 * (1.0 - leaf)
             + vec3(0.4, 1.0, 0.35) * leaf * 0.35
             + vec3(0.5, 0.9, 0.3) * vSink * 0.25;
  gl_FragColor = vec4(min(color, vec3(0.9)), 1.0);
}`;

export class WoodRoots3D {
  readonly meshes: (THREE.InstancedMesh | null)[] = WOOD_ROOT_VARIANTS.map(() => null);
  readonly placements: WoodRootPlacement[] = [];
  readonly drawCount = WOOD_ROOT_VARIANTS.length;
  ready = false;
  triangles: number[] = [];
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private loading: Promise<void> | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  constructor(parent: THREE.Object3D) { this.group.name = "fx-wood-ult-roots3d"; parent.add(this.group); }

  prepare(base: string, upload?: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const url = base.replace(/\/?$/, "/") + "wood-ult/roots3d/wood-roots3d.glb";
    this.loading = new GLTFLoader().loadAsync(url).then(gltf => {
      let map: THREE.Texture | null = null, emis: THREE.Texture | null = null;
      WOOD_ROOT_VARIANTS.forEach((name, k) => {
        const src = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
        if (src === undefined) throw new Error("missing root variant " + name);
        const std = src.material as THREE.MeshStandardMaterial;
        map ??= std.map; emis ??= std.emissiveMap;
        const geo = src.geometry; geo.computeBoundingBox();
        const top = geo.boundingBox!.max.y, bottom = Math.min(0, geo.boundingBox!.min.y);
        this.triangles.push((geo.index?.count ?? geo.getAttribute("position").count) / 3);
        const cap = WOOD_ROOT_CAPACITY[k]!;
        geo.setAttribute("iRoot", new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const material = new THREE.ShaderMaterial({
          uniforms: { uTime: this.time, uHeight: { value: top - bottom }, uMap: { value: map }, uEmis: { value: emis } },
          vertexShader: VERTEX, fragmentShader: FRAGMENT, toneMapped: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.InstancedMesh(geo, material, cap);
        mesh.name = "fx-wood-ult-root3d-" + name; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 9;
        this.meshes[k] = mesh; this.group.add(mesh);
      });
      for (const t of [map, emis]) if (t !== null) { (t as THREE.Texture).anisotropy = 4; upload?.(t); }
      this.ready = true; this.apply();
    }).catch((error: unknown) => console.warn("[wood-ult roots3d]", error)).finally(() => { this.loading = null; });
    return this.loading;
  }

  plan(list: readonly WoodRootPlacement[]): void {
    this.placements.length = 0; this.placements.push(...list); this.apply();
  }

  /** Writes matrices and clocks once per cast; never in the frame loop. */
  private apply(): void {
    if (!this.ready) return;
    const counts = WOOD_ROOT_VARIANTS.map(() => 0);
    for (const r of this.placements) {
      const mesh = this.meshes[r.variant]; if (mesh === null || mesh === undefined) continue;
      const slot = counts[r.variant]!; if (slot >= mesh.instanceMatrix.count) continue;
      this.q.setFromAxisAngle(this.yAxis, r.yaw); this.s.setScalar(r.scale); this.p.set(r.x, 0, r.z);
      mesh.setMatrixAt(slot, this.m.compose(this.p, this.q, this.s));
      (mesh.geometry.getAttribute("iRoot") as THREE.InstancedBufferAttribute).setXYZ(slot, r.birth, r.birth + WOOD_ROOT_TIMING.sinkAfter, slot);
      counts[r.variant] = slot + 1;
    }
    this.meshes.forEach((mesh, k) => {
      if (mesh === null) return;
      mesh.count = counts[k]!; mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.getAttribute("iRoot").needsUpdate = true;
    });
  }

  update(time: number): void { this.time.value = time; }
  clear(): void {
    this.placements.length = 0; this.time.value = -1;
    for (const mesh of this.meshes) if (mesh !== null) mesh.count = 0;
  }
}
