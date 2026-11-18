/** Ticket 426: approved Tripo sword, one persistent instanced PBR draw; grow, hold, erode.
 * Source: art-src/lab/vfx/metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import type { MetalCluster } from "./metal-ult-sprites";

export const METAL_3D_VARIANTS = ["tripo-sword"] as const;
export const METAL_3D_CAPACITY = 144 * 3;
export const METAL_3D_TIMING = { grow: 0.24, breakAfter: 3.2, dissolve: 1.1 } as const;
export const METAL_3D_CASTER_GAP = 2;
const SHATTER = 0.035, OVERSHOOT = 1.04;
const hash = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export interface Metal3DPlacement {
  cluster: number; x: number; z: number; yaw: number; lean: number; tilt: number;
  scale: number; height: number; birth: number; footprint: number;
}

const VERTEX_PARS = /* glsl */ `
attribute vec3 iMetal; // birth, breakAt, seed
uniform float uTime;
varying vec3 vMetalLocal;
varying vec3 vMetalWorld;
varying vec4 vMetalScreen;
varying float vMetalDissolve;
varying float vMetalSeed;
`;
const GROW = /* glsl */ `
float metalAge = uTime - iMetal.x;
float metalT = clamp(metalAge / ${METAL_3D_TIMING.grow}, 0.0, 1.0);
float metalGrowth = 1.0 - pow(1.0 - metalT, 3.0);
vMetalDissolve = smoothstep(iMetal.y, iMetal.y + ${METAL_3D_TIMING.dissolve}, uTime);
vMetalLocal = position; vMetalSeed = iMetal.z;
transformed.y *= metalGrowth + sin(metalT * 3.14159265) * 0.04;
transformed.y -= vMetalDissolve * 0.16;
transformed.xz += normalize(position.xz + vec2(0.0001)) * vMetalDissolve * ${SHATTER};
`;
const FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uCaster;
uniform vec4 uCasterBox;
varying vec3 vMetalLocal;
varying vec3 vMetalWorld;
varying vec4 vMetalScreen;
varying float vMetalDissolve;
varying float vMetalSeed;
`;
const MASK = /* glsl */ `
if (vMetalWorld.y < 0.0 || distance(vMetalWorld.xz, uCaster.xz) < ${METAL_3D_CASTER_GAP.toFixed(1)}) discard;
vec2 metalScreen = vMetalScreen.xy / vMetalScreen.w * 0.5 + 0.5;
vec2 metalInside = step(uCasterBox.xy - 0.004, metalScreen) * step(metalScreen, uCasterBox.zw + 0.004);
if (metalInside.x * metalInside.y > 0.5) discard;
float metalGrain = fract(sin(dot(floor(vMetalLocal * vec3(48.0, 70.0, 48.0)), vec3(12.9898, 78.233, 37.719)) + vMetalSeed) * 43758.5453);
if (vMetalDissolve >= 1.0 || (vMetalDissolve > 0.0 && metalGrain < vMetalDissolve)) discard;
`;
const SURFACE = /* glsl */ `
// Keep the authored stone and texture detail; grade the blade silver and the warm hilt gold.
float metalStone = 1.0 - smoothstep(0.17, 0.24, vMetalLocal.y);
float metalGold = smoothstep(0.025, 0.13, diffuseColor.r - diffuseColor.b) * smoothstep(0.60, 0.74, vMetalLocal.y);
float metalLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
vec3 metalSteel = mix(vec3(0.5, 0.54, 0.58), vec3(0.86, 0.88, 0.9), clamp(metalLum * 1.6, 0.0, 1.0));
vec3 metalGoldColor = mix(vec3(0.38, 0.20, 0.055), vec3(0.88, 0.65, 0.25), clamp(metalLum * 1.8, 0.0, 1.0));
diffuseColor.rgb = mix(mix(metalSteel, metalGoldColor, metalGold), diffuseColor.rgb, metalStone);
`;

function sourceResources(scene: THREE.Object3D): { textures: Set<THREE.Texture>; release(): void } {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  return { textures, release: () => { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); } };
}

export class MetalUlt3D {
  readonly meshes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  readonly placements: Metal3DPlacement[] = [];
  readonly triangles: number[] = [];
  readonly drawCount = 1;
  ready = false;
  loadError: string | null = null;
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private readonly origin = new THREE.Vector3();
  private readonly pending: MetalCluster[] = [];
  private radius = 0;
  private readonly textures = new Set<THREE.Texture>();
  private loading: Promise<void> | null = null;
  private disposed = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly tiltRotation = new THREE.Quaternion();
  private readonly yawRotation = new THREE.Quaternion();
  private readonly size = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly side = new THREE.Vector3(1, 0, 0);

  constructor(parent: THREE.Object3D, private readonly casterBox: THREE.IUniform<THREE.Vector4>,
    private readonly protect: (camera: THREE.Camera) => void, private readonly caster = new THREE.Vector3()) {
    this.group.name = "fx-metal-ult-models3d"; parent.add(this.group);
  }
  get instanceCount(): number { return this.meshes[0]?.count ?? 0; }
  get submittedTriangles(): number { return this.instanceCount * (this.triangles[0] ?? 0); }

  prepare(base: string, upload?: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready || this.disposed) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    this.loadError = null;
    const url = base.replace(/\/?$/, "/") + "metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb";
    this.loading = new GLTFLoader().loadAsync(url).then(gltf => {
      const resources = sourceResources(gltf.scene);
      let geometry: THREE.BufferGeometry | null = null, material: THREE.MeshStandardMaterial | null = null;
      let mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
      try {
        if (this.disposed) return;
        const sources: THREE.Mesh[] = [];
        gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) sources.push(o); });
        const source = sources[0];
        if (sources.length !== 1 || source === undefined || !(source.material instanceof THREE.MeshStandardMaterial)) throw new Error("expected one Tripo PBR mesh");
        geometry = source.geometry.clone().applyMatrix4(source.matrixWorld); geometry.computeBoundingBox();
        const box = geometry.boundingBox!, height = box.max.y - box.min.y;
        if (height <= 0 || !geometry.hasAttribute("uv") || !geometry.hasAttribute("normal")) throw new Error("invalid Tripo bounds, UV or normals");
        geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        geometry.scale(1 / height, 1 / height, 1 / height); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        this.triangles[0] = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
        if (this.triangles[0] !== 5570) throw new Error("unexpected Tripo source triangle count");
        this.radius = 0;
        const p = geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) this.radius = Math.max(this.radius, Math.hypot(p.getX(i), p.getZ(i)));
        geometry.setAttribute("iMetal", new THREE.InstancedBufferAttribute(new Float32Array(METAL_3D_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
        material = source.material.clone(); material.color.setRGB(1, 1, 1); material.metalness = 0.94; material.roughness = 0.32;
        material.emissive.setRGB(0, 0, 0); material.emissiveMap = null; material.toneMapped = false;
        material.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, TAG_UNIFORMS, { uTime: this.time, uCasterBox: this.casterBox, uCaster: { value: this.caster } });
          shader.vertexShader = VERTEX_PARS + shader.vertexShader
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + GROW)
            .replace("#include <project_vertex>", /* glsl */ `#include <project_vertex>
vMetalWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vMetalScreen = gl_Position;
if (metalAge < 0.0 || uTime >= iMetal.y + ${METAL_3D_TIMING.dissolve}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
          shader.fragmentShader = withTagMask(FRAGMENT_PARS + shader.fragmentShader
            .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + MASK)
            .replace("#include <map_fragment>", "#include <map_fragment>\n" + SURFACE)
            .replace("#include <roughnessmap_fragment>", /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(clamp(roughnessFactor, 0.3, 0.45), 0.82, metalStone);`)
            .replace("#include <metalnessmap_fragment>", /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor = mix(mix(0.72, 0.8, metalGold), 0.03, metalStone);`)
            .replace("#include <emissivemap_fragment>", /* glsl */ `#include <emissivemap_fragment>
float metalEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5) * (1.0 - metalStone) * (1.0 - metalGold);
totalEmissiveRadiance += vec3(0.34, 0.27, 0.13) * metalEdge * (0.88 + 0.12 * sin(uTime * 3.0 + vMetalSeed));`)
            .replace("#include <dithering_fragment>", "#include <dithering_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.9));"));
        };
        material.customProgramCacheKey = () => "metal-ult-tripo-426-v1";
        mesh = new THREE.InstancedMesh(geometry, material, METAL_3D_CAPACITY);
        mesh.name = "fx-metal-ult-3d-tripo-sword"; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 9;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.onBeforeRender = (_r, _s, camera) => this.protect(camera);
        for (const t of resources.textures) { t.anisotropy = 4; upload?.(t); this.textures.add(t); }
        this.meshes.push(mesh); this.group.add(mesh); this.ready = true; this.apply();
      } catch (error: unknown) {
        mesh?.removeFromParent(); mesh?.dispose(); geometry?.dispose(); material?.dispose();
        this.meshes.length = 0; this.textures.clear(); this.triangles.length = 0; this.ready = false;
        throw error;
      } finally {
        resources.release();
        for (const t of resources.textures) if (!this.textures.has(t)) t.dispose();
      }
    }).catch((error: unknown) => { this.loadError = String(error); console.warn("[metal-ult 3d]", error); })
      .finally(() => { this.loading = null; });
    return this.loading;
  }

  /** The existing field owns the 7–14 m rings, low front rim and wave birth times. */
  plan(clusters: readonly MetalCluster[], caster: THREE.Vector3, _focus: THREE.Vector3): void {
    this.clear(); this.origin.copy(caster); this.caster.copy(caster);
    this.pending.push(...clusters.map(c => ({ ...c }))); this.apply();
  }

  /** Plan/upload once per cast, including a cast that began while the model was loading. */
  private apply(): void {
    const mesh = this.meshes[0]; if (!this.ready || mesh === undefined || this.disposed) return;
    this.placements.length = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const c = this.pending[i]!, count = 1 + Math.floor(hash(i * 53 + 7) * 3);
      for (let j = 0; j < count && this.placements.length < METAL_3D_CAPACITY; j++) {
        const seed = i * 53 + j * 7, yaw = hash(seed + 13) * Math.PI * 2, lean = hash(seed + 19) * Math.PI * 2;
        const offset = j === 0 ? 0 : c.width * (0.07 + hash(seed + 23) * 0.06);
        if (Math.hypot(c.x - this.origin.x, c.z - this.origin.z) <= METAL_3D_CASTER_GAP) continue;
        let x = c.x + Math.cos(lean) * offset, z = c.z + Math.sin(lean) * offset;
        const dx = x - this.origin.x, dz = z - this.origin.z, distance = Math.hypot(dx, dz);
        const minimumRoom = c.height * 0.7 * (this.radius + Math.sin(Math.PI / 36) * OVERSHOOT + SHATTER);
        let room = distance - METAL_3D_CASTER_GAP - 0.01;
        // Nudge a close rim toward the foe mass rather than lose its first sword.
        if (room < minimumRoom) {
          const move = minimumRoom - room + 0.001;
          x += dx / distance * move; z += dz / distance * move; room += move;
        }
        let tilt = THREE.MathUtils.degToRad(5 + hash(seed + 17) * 20), scale = 0.7 + hash(seed + 29) * 0.6;
        // Reserve every vertex, including lean, growth overshoot and shatter, outside the caster disc.
        const maxSine = (room / (c.height * 0.7) - this.radius - SHATTER) / OVERSHOOT;
        if (maxSine < Math.sin(THREE.MathUtils.degToRad(5))) continue;
        tilt = Math.min(tilt, Math.asin(Math.min(1, maxSine)));
        const unitRadius = this.radius + Math.sin(tilt) * OVERSHOOT + SHATTER;
        scale = Math.min(scale, room / (c.height * unitRadius));
        if (scale < 0.7) continue;
        const height = c.height * scale, slot = this.placements.length;
        this.placements.push({ cluster: i, x, z, yaw, lean, tilt, scale, height, birth: c.at, footprint: unitRadius * height });
        this.rotation.setFromAxisAngle(this.up, lean)
          .multiply(this.tiltRotation.setFromAxisAngle(this.side, tilt)).multiply(this.yawRotation.setFromAxisAngle(this.up, yaw));
        this.size.setScalar(height); this.position.set(x, 0, z);
        mesh.setMatrixAt(slot, this.matrix.compose(this.position, this.rotation, this.size));
        (mesh.geometry.getAttribute("iMetal") as THREE.InstancedBufferAttribute).setXYZ(slot, c.at, c.at + METAL_3D_TIMING.breakAfter, seed);
      }
    }
    mesh.count = this.placements.length; mesh.instanceMatrix.needsUpdate = true; mesh.geometry.getAttribute("iMetal").needsUpdate = true;
  }

  update(time: number): void {
    this.time.value = time;
    if (this.placements.length > 0 && this.placements.every(p => time >= p.birth + METAL_3D_TIMING.breakAfter + METAL_3D_TIMING.dissolve)) {
      for (const mesh of this.meshes) mesh.count = 0;
    }
  }
  clear(): void {
    this.pending.length = 0; this.placements.length = 0; this.time.value = -1;
    for (const mesh of this.meshes) mesh.count = 0;
  }
  dispose(): void {
    this.clear(); this.disposed = true;
    for (const mesh of this.meshes) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const t of this.textures) t.dispose();
    this.textures.clear(); this.meshes.length = 0; this.group.clear(); this.group.removeFromParent(); this.ready = false;
  }
}
