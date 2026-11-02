/**
 * Instanced spirit blades (linh kiếm) for the Kiếm skills: one InstancedMesh,
 * one geometry, one material, so 3 or 500 blades cost one draw call (canon
 * §20.2, SKILL_CATALOG K5). The blade is a stand-in jian built for the VFX
 * (straight double edge, guard, grip) until the Tripo Thanh Phong GLB passes
 * its 8.5 gate (ART_AUDIO_VFX_PLAN §7 #15); the glow, trails and light around
 * it are VFX layers in kiem.ts. Steel takes the scene's HDRI reflections and
 * a faint spirit emissive; a per-blade tint flashes on blocks and hits.
 * Tip along +Y in the blade's frame. Nothing allocates per frame.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** One blade 1 m long (tip at y = 1, guard at y = 0); scaled per use. */
export function jianGeometry(): THREE.BufferGeometry {
  const w = 0.075;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, 0.86);
  shape.lineTo(0, 1);
  shape.lineTo(w / 2, 0.86);
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, 0);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.012, bevelSegments: 1, steps: 1 });
  blade.translate(0, 0, -0.004);
  const guard = new THREE.BoxGeometry(0.2, 0.03, 0.05);
  guard.translate(0, -0.015, 0);
  const grip = new THREE.CylinderGeometry(0.014, 0.017, 0.2, 8);
  grip.translate(0, -0.13, 0);
  const pommel = new THREE.SphereGeometry(0.026, 10, 8);
  pommel.translate(0, -0.25, 0);
  const parts = [blade, guard, grip, pommel].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) {
    g.deleteAttribute("uv");
    if (!g.getAttribute("normal")) g.computeVertexNormals();
  }
  const merged = mergeGeometries(parts, false);
  if (merged === null) throw new Error("jian geometry");
  merged.computeVertexNormals();
  return merged;
}

const UP = new THREE.Vector3(0, 1, 0);

export class BladeSet {
  readonly mesh: THREE.InstancedMesh;
  private readonly visible: Uint8Array;
  /** Last pose per blade (centre of the blade, unit tip direction, length in m) for glow cards. */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly cz: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly tz: Float32Array;
  readonly len: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly roll = new THREE.Quaternion();
  private readonly colour = new THREE.Color();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private dirty = false;
  private readonly lengthM: number;

  constructor(readonly capacity: number, lengthM = 1.1) {
    const geometry = jianGeometry();
    geometry.scale(lengthM, lengthM, lengthM);
    const material = new THREE.MeshStandardMaterial({
      color: "#dfe5ec",
      metalness: 1,
      roughness: 0.2,
      emissive: "#7a90b4",
      emissiveIntensity: 0.55,
      envMapIntensity: 1.4,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.visible = new Uint8Array(capacity);
    this.cx = new Float32Array(capacity);
    this.cy = new Float32Array(capacity);
    this.cz = new Float32Array(capacity);
    this.tx = new Float32Array(capacity);
    this.ty = new Float32Array(capacity);
    this.tz = new Float32Array(capacity);
    this.len = new Float32Array(capacity);
    this.lengthM = lengthM;
    for (let i = 0; i < capacity; i += 1) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.count = capacity;
  }

  /** Blade `i` at (x, y, z), tip along (dx, dy, dz), `scale` × its length, spun `rollRad` round its axis. */
  set(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, scale = 1, rollRad = 0): void {
    this.dir.set(dx, dy, dz);
    if (this.dir.lengthSq() < 1e-10) this.dir.set(0, 1, 0);
    this.dir.normalize();
    this.quat.setFromUnitVectors(UP, this.dir);
    if (rollRad !== 0) {
      this.roll.setFromAxisAngle(UP, rollRad);
      this.quat.multiply(this.roll);
    }
    this.pos.set(x, y, z);
    this.scl.set(scale, scale, scale);
    this.matrix.compose(this.pos, this.quat, this.scl);
    this.mesh.setMatrixAt(i, this.matrix);
    this.visible[i] = 1;
    const L = this.lengthM * scale;
    this.cx[i] = x + this.dir.x * L * 0.45;
    this.cy[i] = y + this.dir.y * L * 0.45;
    this.cz[i] = z + this.dir.z * L * 0.45;
    this.tx[i] = this.dir.x;
    this.ty[i] = this.dir.y;
    this.tz[i] = this.dir.z;
    this.len[i] = L;
    this.dirty = true;
  }

  hide(i: number): void {
    if (this.visible[i] === 0) return;
    this.visible[i] = 0;
    this.mesh.setMatrixAt(i, this.zero);
    this.dirty = true;
  }

  hideAll(): void {
    for (let i = 0; i < this.capacity; i += 1) this.hide(i);
  }

  /** Tint multiplier (1 = steel; > 1 brightens toward white for a flash). */
  tint(i: number, r: number, g: number, b: number): void {
    this.colour.setRGB(r, g, b);
    this.mesh.setColorAt(i, this.colour);
    this.dirty = true;
  }

  isVisible(i: number): boolean {
    return this.visible[i] === 1;
  }

  sync(): void {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}
