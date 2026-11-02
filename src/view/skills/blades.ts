/**
 * Instanced spirit blades (linh kiếm) for the Kiếm skills: one InstancedMesh,
 * one geometry, one material, so 3 or 500 blades cost one draw call (canon
 * §20.2, SKILL_CATALOG K5). D55 (owner 02/11/2026): the blades are copies of
 * the EQUIPPED weapon, so the geometry and the rail colour swap at runtime
 * (`setGeometry`, `setRail`); `loadBladeGeometry` turns a weapon GLB into one
 * merged geometry in the jian convention and falls back to the stand-in jian
 * (`jianGeometry`: straight double edge, guard, grip) while no file exists.
 * The glow, trails and light around a blade are VFX layers in kiem.ts. Steel
 * takes the scene's HDRI reflections and a faint rail emissive; a per-blade
 * tint flashes on blocks and hits. Tip along +Y in the blade's frame.
 * Nothing allocates per frame.
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadModel } from "../../kit/three/model-loader";

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

let standIn: THREE.BufferGeometry | null = null;

/** The shared stand-in jian (built once; never disposed, every BladeSet may hold it). */
export function standInBlade(): THREE.BufferGeometry {
  standIn ??= jianGeometry();
  return standIn;
}

// ── Weapon GLB → blade geometry ─────────────────────────────────────────────

/**
 * How a weapon model maps onto the jian convention when the automatic fit
 * guesses wrong. The automatic fit suits swords and sabres (the guard is the
 * widest cross-section, the blade longer than the hilt); spears, whose head is
 * their widest part, must say where the head's base is.
 */
export interface BladeFit {
  /** Model axis along the blade (default: the longest bounding-box side). */
  readonly axis?: "x" | "y" | "z";
  /** Guard position along the axis, 0 at the model's minimum, 1 at its maximum (default: the widest cross-section). */
  readonly guardAt?: number;
  /** True when the tip lies toward +axis (default: the end farther from the guard). */
  readonly tipPositive?: boolean;
}

const AXES = ["x", "y", "z"] as const;
const SLICES = 64;

/**
 * Bakes every mesh under `root` into one float geometry (position and normal
 * only: the weapon keeps the shared steel material, no new textures), then
 * maps it onto the jian convention: tip along +Y, guard at y = 0, guard to tip
 * 1 long, the blade's flat facing ±Z, the blade's spine on the Y axis.
 * Quantized (meshopt) attributes are read through getX, so they are safe.
 * Returns null when `root` has no triangles.
 */
export function bladeFromObject(root: THREE.Object3D, fit: BladeFit = {}): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const pos = src.getAttribute("position");
    if (pos === undefined) return;
    const nrm = src.getAttribute("normal");
    const index = src.getIndex();
    const all = index !== null ? index.count : pos.count;
    const count = all - (all % 3);
    if (count < 3) return;
    const p = new Float32Array(count * 3);
    const n = nrm !== undefined ? new Float32Array(count * 3) : null;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    // A mirrored node (negative scale) flips the triangle winding once baked: swap two corners back.
    const mirrored = mesh.matrixWorld.determinant() < 0;
    for (let i = 0; i < count; i += 1) {
      const corner = i % 3;
      const j = mirrored && corner !== 0 ? i + (corner === 1 ? 1 : -1) : i;
      const k = index !== null ? index.getX(j) : j;
      v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(mesh.matrixWorld);
      p[i * 3] = v.x;
      p[i * 3 + 1] = v.y;
      p[i * 3 + 2] = v.z;
      if (n !== null && nrm !== undefined) {
        v.set(nrm.getX(k), nrm.getY(k), nrm.getZ(k)).applyMatrix3(normalMatrix).normalize();
        n[i * 3] = v.x;
        n[i * 3 + 1] = v.y;
        n[i * 3 + 2] = v.z;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    if (n !== null) g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
    else g.computeVertexNormals();
    parts.push(g);
  });
  if (parts.length === 0) return null;
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (merged === null) return null;
  const pos = merged.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const vertexCount = pos.count;
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const ext = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] as const;
  const lo = [box.min.x, box.min.y, box.min.z] as const;
  // The blade axis: given, or the longest side.
  const a = fit.axis !== undefined ? AXES.indexOf(fit.axis) : ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
  const b = (a + 1) % 3;
  const c = (a + 2) % 3;
  const L = ext[a]!;
  if (!(L > 1e-6)) return null;
  // Cross-section width per slice along the axis.
  const minB = new Float32Array(SLICES).fill(Infinity);
  const maxB = new Float32Array(SLICES).fill(-Infinity);
  const minC = new Float32Array(SLICES).fill(Infinity);
  const maxC = new Float32Array(SLICES).fill(-Infinity);
  const sliceOf = (t: number): number => Math.min(SLICES - 1, Math.max(0, Math.floor(((t - lo[a]!) / L) * SLICES)));
  for (let i = 0; i < vertexCount; i += 1) {
    const s = sliceOf(arr[i * 3 + a]!);
    const vb = arr[i * 3 + b]!;
    const vc = arr[i * 3 + c]!;
    if (vb < minB[s]!) minB[s] = vb;
    if (vb > maxB[s]!) maxB[s] = vb;
    if (vc < minC[s]!) minC[s] = vc;
    if (vc > maxC[s]!) maxC[s] = vc;
  }
  const width = new Float32Array(SLICES);
  for (let s = 0; s < SLICES; s += 1) width[s] = maxB[s]! >= minB[s]! ? Math.max(maxB[s]! - minB[s]!, maxC[s]! - minC[s]!) : 0;
  // The guard: given, or the widest cross-section (first of equals, from the minimum).
  let best = -1;
  if (fit.guardAt === undefined) {
    best = 0;
    for (let i = 1; i < SLICES; i += 1) if (width[i]! > width[best]!) best = i;
  }
  const guardMid = fit.guardAt !== undefined ? Math.min(1, Math.max(0, fit.guardAt)) : (best + 0.5) / SLICES;
  // The tip: given, or the end farther from the guard (a blade is longer than its hilt).
  const tipPositive = fit.tipPositive ?? guardMid <= 0.5;
  // A found guard ends at the tip-side edge of its widest run, where the blade starts (y = 0 in the jian).
  if (best >= 0) {
    const step = tipPositive ? 1 : -1;
    const top = width[best]! * 0.97;
    while (best + step >= 0 && best + step < SLICES && width[best + step]! >= top) best += step;
  }
  const guardS = best < 0 ? guardMid : (tipPositive ? best + 1 : best) / SLICES;
  /** Slice index `u` slices from the pommel end. */
  const fromPommel = (u: number): number => (tipPositive ? u : SLICES - 1 - u);
  const guardU = tipPositive ? guardS : 1 - guardS;
  const sign = tipPositive ? 1 : -1;
  const guardT = lo[a]! + guardS * L;
  const tipT = tipPositive ? lo[a]! + L : lo[a]!;
  const bladeLen = Math.abs(tipT - guardT);
  if (!(bladeLen > 1e-6)) return null;
  // The blade's flat faces ±Z: X is the wider perpendicular side over the blade, which also centres the spine.
  let bMin = Infinity;
  let bMax = -Infinity;
  let cMin = Infinity;
  let cMax = -Infinity;
  for (let u = Math.ceil((guardU + 0.08) * SLICES); u < Math.floor(SLICES * 0.97); u += 1) {
    const s = fromPommel(u);
    if (!(maxB[s]! >= minB[s]!)) continue;
    bMin = Math.min(bMin, minB[s]!);
    bMax = Math.max(bMax, maxB[s]!);
    cMin = Math.min(cMin, minC[s]!);
    cMax = Math.max(cMax, maxC[s]!);
  }
  if (!Number.isFinite(bMin)) {
    bMin = lo[b]!;
    bMax = lo[b]! + ext[b]!;
    cMin = lo[c]!;
    cMax = lo[c]! + ext[c]!;
  }
  const flatB = bMax - bMin >= cMax - cMin;
  const xAxis = flatB ? b : c;
  const zAxis = flatB ? c : b;
  const xMid = flatB ? (bMin + bMax) / 2 : (cMin + cMax) / 2;
  const zMid = flatB ? (cMin + cMax) / 2 : (bMin + bMax) / 2;
  const k = 1 / bladeLen;
  // Rows of the linear map (model axis → x, y, z); flip z when the map would mirror the mesh.
  const row = (axis: number, scale: number): [number, number, number] => [axis === 0 ? scale : 0, axis === 1 ? scale : 0, axis === 2 ? scale : 0];
  const rx = row(xAxis, k);
  const ry = row(a, k * sign);
  let rz = row(zAxis, k);
  const m = new THREE.Matrix4().set(...rx, -xMid * k, ...ry, -guardT * k * sign, ...rz, -zMid * k, 0, 0, 0, 1);
  if (m.determinant() < 0) {
    rz = row(zAxis, -k);
    m.set(...rx, -xMid * k, ...ry, -guardT * k * sign, ...rz, zMid * k, 0, 0, 0, 1);
  }
  merged.applyMatrix4(m);
  merged.deleteAttribute("uv");
  const indexed = mergeVertices(merged, 1e-5);
  indexed.computeBoundingBox();
  indexed.computeBoundingSphere();
  return indexed;
}

const loaded = new Map<string, Promise<THREE.BufferGeometry>>();

/**
 * The blade geometry for a weapon GLB, cached per URL; the stand-in jian when
 * the file is missing, unreadable or empty (until the owner approves a design
 * no weapon file exists, so every weapon shows the stand-in). The dev server
 * answers a missing file with its HTML page, so the type is checked first.
 */
export function loadBladeGeometry(url: string | undefined, fit?: BladeFit): Promise<THREE.BufferGeometry> {
  if (url === undefined || url === "") return Promise.resolve(standInBlade());
  let p = loaded.get(url);
  if (p === undefined) {
    p = (async () => {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const type = head.headers.get("content-type") ?? "";
        if (!head.ok || type.includes("text/html")) return standInBlade();
        const gltf = await loadModel(url);
        return bladeFromObject(gltf.scene, fit) ?? standInBlade();
      } catch (error) {
        console.warn("[blades] weapon model unreadable, stand-in blade kept:", url, error);
        return standInBlade();
      }
    })();
    loaded.set(url, p);
  }
  return p;
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
  private readonly material: THREE.MeshStandardMaterial;

  /** `lengthM`: guard to tip in metres at scale 1 (the geometry is unit length; the instance matrix scales it). */
  constructor(readonly capacity: number, lengthM = 1.1) {
    this.material = new THREE.MeshStandardMaterial({
      color: "#dfe5ec",
      metalness: 1,
      roughness: 0.2,
      emissive: "#7a90b4",
      emissiveIntensity: 0.55,
      envMapIntensity: 1.4,
    });
    this.mesh = new THREE.InstancedMesh(standInBlade(), this.material, capacity);
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
    const k = scale * this.lengthM;
    this.scl.set(k, k, k);
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

  /**
   * The equipped weapon's blade (unit length, jian convention). Same mesh,
   * same draw call, poses and tints kept; geometries are shared and cached by
   * the loader, so the old one is not disposed here.
   */
  setGeometry(geometry: THREE.BufferGeometry): void {
    if (this.mesh.geometry === geometry) return;
    this.mesh.geometry = geometry;
  }

  /** The glow rail's colour (sRGB hex); with the stand-in the whole blade carries it. */
  setRail(colour: string, intensity = 0.55): void {
    this.material.emissive.set(colour);
    this.material.emissiveIntensity = intensity;
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
