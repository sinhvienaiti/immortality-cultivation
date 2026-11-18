/** Ticket 427: existing Tripo crystal cluster, one instanced draw; rise with the wave, hold, dissolve.
 * Source: art-src/lab/vfx/void-ult/models3d/tripo/ult-void-clean.tripo.v1.glb (5,930 triangles). */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";

export const VOID_CRYSTAL_CAPACITY = 192;
export const VOID_CRYSTAL_TIMING = { grow: 0.28, breakAfter: 3.2, dissolve: 2.5 } as const;
export const VOID_CRYSTAL_CLEARANCE = 2;
export interface VoidCrystalPlacement { x: number; z: number; at: number; height: number }

const VERTEX = /* glsl */ `
attribute vec2 iCrystal; // birth, seed
uniform float uTime;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vScreen;
varying float vGrow;
varying float vDissolve;
void main() {
  float age = uTime - iCrystal.x;
  float t = clamp(age / ${VOID_CRYSTAL_TIMING.grow.toFixed(2)}, 0.0, 1.0);
  float grow = 1.0 - pow(1.0 - t, 3.0);
  float dissolve = smoothstep(${VOID_CRYSTAL_TIMING.breakAfter.toFixed(2)}, ${(VOID_CRYSTAL_TIMING.breakAfter + VOID_CRYSTAL_TIMING.dissolve).toFixed(2)}, age);
  vec3 p = position;
  p.y -= (1.0 - grow) * 1.05 + dissolve * 0.22;
  p.y += sin(t * 3.14159) * 0.04;
  p.xz *= 0.78 + 0.22 * grow;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(p, 1.0);
  vWorld = world.xyz;
  vLocal = position + vec3(iCrystal.y);
  vN = normalize(mat3(m) * normal);
  vUv = uv;
  vGrow = grow;
  vDissolve = dissolve;
  gl_Position = projectionMatrix * viewMatrix * world;
  vScreen = gl_Position;
  if (age < 0.0 || age >= ${(VOID_CRYSTAL_TIMING.breakAfter + VOID_CRYSTAL_TIMING.dissolve).toFixed(2)}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uCaster;
uniform vec4 uCasterBox;
uniform float uTime;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vScreen;
varying float vGrow;
varying float vDissolve;
void main() {
  if (vWorld.y < 0.0 || distance(vWorld.xz, uCaster.xz) < ${VOID_CRYSTAL_CLEARANCE.toFixed(2)}) discard;
  // Erosion only: the complete silhouette and facets come from the Tripo model.
  float grain = fract(sin(dot(floor(vLocal * 42.0), vec3(12.9898, 78.233, 39.425))) * 43758.5453);
  if (grain < vDissolve * 0.98) discard;
  vec3 art = texture2D(uMap, vUv).rgb;
  vec3 n = normalize(vN), eye = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - clamp(dot(n, eye), 0.0, 1.0), 3.0);
  vec3 light = normalize(vec3(0.35, 0.85, 0.4));
  float key = max(dot(n, light), 0.0);
  float spec = pow(max(dot(n, normalize(light + eye)), 0.0), 48.0);
  float breathe = 0.85 + 0.15 * sin(uTime * 2.1 + vLocal.y * 5.0);
  // Fake transmission: a violet tinted body, pale Fresnel edges and a quiet inner glow.
  vec3 body = mix(vec3(0.10, 0.025, 0.22), art * vec3(0.65, 0.35, 0.9), 0.35) * (0.6 + 0.4 * key);
  vec3 color = body + vec3(0.85, 0.72, 0.9) * rim * 1.1 + vec3(0.85, 0.8, 0.9) * spec * 0.9
             + vec3(0.18, 0.055, 0.3) * breathe * 0.4;
  float alpha = (0.42 + rim * 0.45 + spec * 0.3) * vGrow * (1.0 - smoothstep(0.65, 1.0, vDissolve));
  vec2 screen = vScreen.xy / vScreen.w * 0.5 + 0.5;
  vec2 inside = smoothstep(uCasterBox.xy - 0.004, uCasterBox.xy, screen) * (1.0 - smoothstep(uCasterBox.zw, uCasterBox.zw + 0.004, screen));
  alpha *= 1.0 - inside.x * inside.y;
  if (alpha < 0.007) discard;
  gl_FragColor = vec4(min(color, vec3(0.9)), alpha);
}`;

/** The GLTF source scene is never attached; retain only its colour map and the cloned geometry. */
function releaseSource(scene: THREE.Object3D, keep: THREE.Texture | null): void {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== keep) textures.add(value);
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
}

export class VoidCrystals3D {
  readonly meshes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  readonly placements: VoidCrystalPlacement[] = [];
  readonly drawCount = 1;
  ready = false;
  triangles = 0;
  footprintRadius = 0;
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private readonly caster: THREE.Vector3;
  private readonly casterBox: THREE.IUniform<THREE.Vector4>;
  private readonly pending: VoidCrystalPlacement[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private loading: Promise<void> | null = null;
  private map: THREE.Texture | null = null;
  private disposed = false;
  constructor(parent: THREE.Object3D, caster = new THREE.Vector3(), casterBox: THREE.IUniform<THREE.Vector4> = { value: new THREE.Vector4(2, 2, 2, 2) }) {
    this.caster = caster; this.casterBox = casterBox;
    this.group.name = "fx-void-ult-crystals3d"; parent.add(this.group);
  }

  prepare(base: string, upload?: (t: THREE.Texture) => void): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("void crystals disposed"));
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const url = base.replace(/\/?$/, "/") + "void-ult/models3d/tripo/ult-void-clean.tripo.v1.glb";
    this.loading = new GLTFLoader().loadAsync(url).then(gltf => {
      let retained: THREE.Texture | null = null;
      let geometry: THREE.BufferGeometry | null = null;
      let material: THREE.ShaderMaterial | null = null;
      try {
        if (this.disposed) return;
        const sources: THREE.Mesh[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) sources.push(o); });
        const source = sources[0];
        if (sources.length !== 1 || source === undefined || Array.isArray(source.material)) throw new Error("expected one Tripo crystal template");
        const map = (source.material as THREE.MeshStandardMaterial).map;
        if (map === null) throw new Error("missing Tripo crystal colour map");
        geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const height = box.max.y - box.min.y;
        if (!(height > 0)) throw new Error("empty Tripo crystal bounds");
        geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        geometry.scale(1 / height, 1 / height, 1 / height);
        geometry.computeBoundingBox();
        const b = geometry.boundingBox!;
        this.footprintRadius = Math.hypot(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), Math.max(Math.abs(b.min.z), Math.abs(b.max.z)));
        this.triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
        geometry.setAttribute("iCrystal", new THREE.InstancedBufferAttribute(new Float32Array(VOID_CRYSTAL_CAPACITY * 2), 2).setUsage(THREE.DynamicDrawUsage));
        material = new THREE.ShaderMaterial({
          uniforms: { ...TAG_UNIFORMS, uTime: this.time, uMap: { value: map }, uCaster: { value: this.caster }, uCasterBox: this.casterBox },
          vertexShader: VERTEX, fragmentShader: withTagMask(FRAGMENT), transparent: true, depthWrite: false, toneMapped: false,
          side: THREE.FrontSide,
        });
        map.anisotropy = 4; upload?.(map);
        const mesh = new THREE.InstancedMesh(geometry, material, VOID_CRYSTAL_CAPACITY);
        mesh.name = "fx-void-ult-crystal3d-tripo"; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 9;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.meshes.push(mesh); this.group.add(mesh); this.map = map; retained = map;
        this.ready = true; this.apply();
      } catch (error) {
        geometry?.dispose(); material?.dispose(); throw error;
      } finally { releaseSource(gltf.scene, retained); }
    }).finally(() => { this.loading = null; });
    return this.loading;
  }

  plan(list: readonly VoidCrystalPlacement[], caster: THREE.Vector3): void {
    this.pending.length = 0; this.pending.push(...list.slice(0, VOID_CRYSTAL_CAPACITY));
    this.origin.copy(caster); this.apply();
  }

  /** Matrices and birth clocks change only on a cast or initial load. */
  private apply(): void {
    if (!this.ready) return;
    const mesh = this.meshes[0]!;
    const clock = mesh.geometry.getAttribute("iCrystal") as THREE.InstancedBufferAttribute;
    this.placements.length = 0;
    for (let k = 0; k < this.pending.length; k++) {
      const c = this.pending[k]!;
      // Bound the entire model footprint, not just its centre; growth and dissolve never widen it.
      if (Math.hypot(c.x - this.origin.x, c.z - this.origin.z) < VOID_CRYSTAL_CLEARANCE + this.footprintRadius * c.height) continue;
      const slot = this.placements.length;
      const seed = (k * 0.61803398875) % 1;
      this.position.set(c.x, 0.02, c.z); this.scale.setScalar(c.height);
      this.rotation.setFromAxisAngle(this.up, seed * Math.PI * 2);
      mesh.setMatrixAt(slot, this.matrix.compose(this.position, this.rotation, this.scale));
      clock.setXY(slot, c.at, seed * 13); this.placements.push(c);
    }
    mesh.count = this.placements.length; mesh.instanceMatrix.needsUpdate = true; clock.needsUpdate = true;
  }

  update(time: number): void { this.time.value = time; }
  clear(): void {
    this.pending.length = 0; this.placements.length = 0; this.time.value = -1;
    for (const mesh of this.meshes) mesh.count = 0;
  }
  dispose(): void {
    this.disposed = true; this.clear(); this.ready = false;
    for (const mesh of this.meshes) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.meshes.length = 0; this.map?.dispose(); this.map = null; this.group.removeFromParent();
  }
}
