/**
 * The skill swords (linh kiếm) of the Kiếm skills: instanced copies of the EQUIPPED weapon (D55, owner
 * 02/11/2026), so 3 or 300 swords cost one draw call per mesh. Owner 03/11/2026: the copies are the real
 * approved sword, its own textured model under the scene's light, never a code-styled stand-in: a weapon GLB is
 * mapped onto the jian convention (tip +Y at 1, guard at 0, spine on x = 0, flat facing ±Z) KEEPING its UVs and its
 * own PBR material (base colour, ORM, normal map; sword-material.ts patches only the edge line, rim, jade light,
 * flash and dissolve in). A BladeSet has two instanced meshes: the hero swords [0, split) draw the full model, the
 * mid swords [split, capacity) its textured LOD (WeaponDef.swarm, swarm_lod.py), both mapped by the full model's
 * own fit so they sit and scale alike. Far and tiny swords are impostors of the same model (real-swords.ts).
 * A weapon with no GLB yet shows the stand-in jian (`jianGeometry`) in plain steel until its file lands.
 * Each mesh draws only up to its highest visible sword, so hidden slots cost no vertices. Nothing allocates per
 * frame.
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadModel } from "../../kit/three/model-loader";
import { edgeField, patchSwordMaterial, type SwordMaterialOptions } from "./sword-material";

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

/** How bladeFromObject bakes: keep the UVs (a textured model), and map with a given matrix (an LOD sits where its full model does). */
export interface BladeBake {
  readonly keepUv?: boolean;
  /** The jian map of another bake (its `userData.bladeMap`): skips the fit, so an LOD lands exactly on its full model. */
  readonly map?: THREE.Matrix4;
}

/**
 * Bakes every mesh under `root` into one float geometry (position, normal and,
 * with `bake.keepUv`, uv), then maps it onto the jian convention: tip along
 * +Y, guard at y = 0, guard to tip 1 long, the blade's flat facing ±Z, the
 * blade's spine on the Y axis. The map is kept in `userData.bladeMap`.
 * Quantized (meshopt) attributes are read through getX, so they are safe.
 * Returns null when `root` has no triangles.
 */
export function bladeFromObject(root: THREE.Object3D, fit: BladeFit = {}, bake: BladeBake = {}): THREE.BufferGeometry | null {
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
    const uvs = bake.keepUv === true ? src.getAttribute("uv") : undefined;
    const index = src.getIndex();
    const all = index !== null ? index.count : pos.count;
    const count = all - (all % 3);
    if (count < 3) return;
    const p = new Float32Array(count * 3);
    const n = nrm !== undefined ? new Float32Array(count * 3) : null;
    const t = uvs !== undefined ? new Float32Array(count * 2) : null;
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
      if (t !== null && uvs !== undefined) {
        t[i * 2] = uvs.getX(k);
        t[i * 2 + 1] = uvs.getY(k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    if (n !== null) g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
    else g.computeVertexNormals();
    if (t !== null) g.setAttribute("uv", new THREE.BufferAttribute(t, 2));
    parts.push(g);
  });
  if (parts.length === 0) return null;
  // Every part must carry the same attributes to merge: a part without UVs drops them all.
  if (parts.some((g) => g.getAttribute("uv") === undefined)) for (const g of parts) g.deleteAttribute("uv");
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (merged === null) return null;
  if (bake.map !== undefined) return finishBlade(merged, bake.map, bake.keepUv === true);
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
  return finishBlade(merged, m, bake.keepUv === true);
}

/** Applies the jian map, welds identical vertices (UVs included when kept) and records the map. */
function finishBlade(merged: THREE.BufferGeometry, m: THREE.Matrix4, keepUv: boolean): THREE.BufferGeometry {
  merged.applyMatrix4(m);
  if (!keepUv) merged.deleteAttribute("uv");
  const indexed = mergeVertices(merged, 1e-5);
  indexed.computeBoundingBox();
  indexed.computeBoundingSphere();
  indexed.userData.bladeMap = m.clone();
  return indexed;
}

/**
 * The guard's band on a blade geometry in the jian convention (unit length,
 * tip +Y): the run of heights round y = 0 where the cross-section is over
 * twice the blade's own width (Clear Wind: its ring). [−0.02, 0.02] when there
 * is none. Load time only.
 */
export function guardBand(geometry: THREE.BufferGeometry): [number, number] {
  const pos = geometry.getAttribute("position");
  const S = 80;
  const lo = -0.6;
  const hi = 0.4;
  const w = new Float32Array(S);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < lo || y >= hi) continue;
    const s = Math.floor(((y - lo) / (hi - lo)) * S);
    const x = Math.abs(pos.getX(i));
    if (x > w[s]!) w[s] = x;
  }
  const at = (y: number): number => Math.min(S - 1, Math.max(0, Math.floor(((y - lo) / (hi - lo)) * S)));
  const blade = Math.max(1e-4, w[at(0.3)]!);
  const k = at(0);
  if (!(w[k]! > 2 * blade)) return [-0.02, 0.02];
  let a = k;
  let b = k;
  while (a > 0 && w[a - 1]! > 2 * blade) a -= 1;
  while (b < S - 1 && w[b + 1]! > 2 * blade) b += 1;
  return [lo + (a / S) * (hi - lo), lo + ((b + 1) / S) * (hi - lo)];
}

const models = new Map<string, Promise<GLTF | null>>();

/**
 * A weapon GLB, loaded once per URL however many users share it (the blade
 * geometry and the lab's hand prop); null when the file is missing or
 * unreadable. The dev server answers a missing file with its HTML page, so
 * the type is checked first. Users must not change the returned scene (clone
 * what they reparent or patch).
 */
export function loadWeaponModel(url: string | undefined): Promise<GLTF | null> {
  if (url === undefined || url === "") return Promise.resolve(null);
  let p = models.get(url);
  if (p === undefined) {
    p = (async () => {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const type = head.headers.get("content-type") ?? "";
        if (!head.ok || type.includes("text/html")) return null;
        return await loadModel(url);
      } catch (error) {
        console.warn("[blades] weapon model unreadable:", url, error);
        return null;
      }
    })();
    models.set(url, p);
  }
  return p;
}

const loaded = new Map<string, Promise<THREE.BufferGeometry>>();

/**
 * The blade geometry for a weapon GLB, cached per URL; the stand-in jian when
 * the file is missing, unreadable or empty (until the owner approves a design
 * no weapon file exists, so every weapon shows the stand-in).
 */
export function loadBladeGeometry(url: string | undefined, fit?: BladeFit): Promise<THREE.BufferGeometry> {
  if (url === undefined || url === "") return Promise.resolve(standInBlade());
  let p = loaded.get(url);
  if (p === undefined) {
    p = loadWeaponModel(url).then((gltf) => (gltf === null ? standInBlade() : (bladeFromObject(gltf.scene, fit) ?? standInBlade())));
    loaded.set(url, p);
  }
  return p;
}

// ── Textured sword models ───────────────────────────────────────────────────

/**
 * Where a weapon's aura sits on its unit blade (SWORD_AURA §4.8), measured from its GLB at load. The jian
 * convention: the guard at y = 0, the tip at y = 1, the hilt at y < 0 (the pommel's end at `pommelY`).
 */
export interface AuraAnchors {
  /** 96 blade half widths (unit) from `bladeFrom` to the tip (edgeField's slices). */
  readonly profile: Float32Array;
  /** Unit y where the blade starts. */
  readonly bladeFrom: number;
  /** Unit y where the guard's band starts: no aura body from here to bladeFrom + 0.03 of the sword's length. */
  readonly guardFrom: number;
  /** The jade ring's centre and outer radius (unit; Clear Wind's guard band is its ring), null without a ring. */
  readonly ring: { readonly y: number; readonly r: number } | null;
  /** Half width of the guard (unit). */
  readonly guardHalf: number;
  /** Where a tassel or silk would hang (unit y, ≤ pommelY: past the pommel's end). */
  readonly tasselFrom: number;
}

/** The blade's widest half width in an anchors' profile (unit). */
export function profileMax(a: AuraAnchors): number {
  let m = 0;
  for (let i = 0; i < a.profile.length; i += 1) m = Math.max(m, a.profile[i]!);
  return m;
}

/** Measures a unit blade's aura anchors (load time; `half` from edgeField). */
export function auraAnchorsOf(geometry: THREE.BufferGeometry, guard: readonly [number, number], bladeFrom: number, half: Float32Array, ring: boolean): AuraAnchors {
  const pos = geometry.getAttribute("position");
  let guardHalf = 0;
  let minY = Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y >= guard[0] && y <= guard[1]) guardHalf = Math.max(guardHalf, Math.abs(pos.getX(i)));
  }
  // A sparse mesh (the stand-in jian) leaves the slices before its first vertex empty: they take the first measured one.
  const profile = Float32Array.from(half);
  let first = 0;
  while (first < profile.length && !(profile[first]! > 0)) first += 1;
  for (let i = 0; i < first && first < profile.length; i += 1) profile[i] = profile[first]!;
  return {
    profile,
    bladeFrom,
    guardFrom: guard[0],
    ring: ring && guardHalf > 0 ? { y: (guard[0] + guard[1]) / 2, r: guardHalf } : null,
    guardHalf,
    tasselFrom: Number.isFinite(minY) ? minY : -0.25,
  };
}

/** A sword ready for instancing: a unit blade in the jian convention with its UVs and edge field, and its material. */
export interface SwordModel {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  /** The pommel's end on the unit blade (y < 0): the whole sword spans [pommelY, 1]. */
  readonly pommelY: number;
  /** The guard's band (guardBand). */
  readonly guard: readonly [number, number];
  /** The weapon's own GLB (false: the stand-in jian). */
  readonly real: boolean;
  readonly triangles: number;
  /** Where it came from (URL, or "stand-in"). */
  readonly source: string;
  /** How its material was patched (overlayModel re-patches a copy). */
  readonly look: SwordMaterialOptions;
  /** Where its aura sits (SWORD_AURA §4.8). */
  readonly aura: AuraAnchors;
}

const NO_JADE = [0, 0, 0] as const;

function modelOf(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, jade: readonly [number, number, number], real: boolean, source: string, ring = false): SwordModel {
  geometry.computeBoundingBox();
  const guard = guardBand(geometry);
  const bladeFrom = Math.max(0.01, guard[1] + 0.01);
  const half = edgeField(geometry, bladeFrom);
  const look = { bladeFrom, jade };
  patchSwordMaterial(material, look);
  const index = geometry.getIndex();
  return {
    geometry,
    material,
    pommelY: geometry.boundingBox!.min.y,
    guard,
    real,
    triangles: (index !== null ? index.count : geometry.getAttribute("position").count) / 3,
    source,
    look,
    aura: auraAnchorsOf(geometry, guard, bladeFrom, half, ring),
  };
}

const overlays = new WeakMap<SwordModel, SwordModel>();

/**
 * The same sword drawn in the transparent pass (opaque, depth-written, after the sky's VFX by render order): K5's
 * heaven sword falls out of the sky gate, which is drawn over the scene, so an opaque sword would sit under it.
 */
export function overlayModel(model: SwordModel): SwordModel {
  let o = overlays.get(model);
  if (o === undefined) {
    const material = model.material.clone();
    material.transparent = true;
    material.depthWrite = true;
    patchSwordMaterial(material, model.look);
    o = { ...model, material };
    overlays.set(model, o);
  }
  return o;
}

let standInSword: SwordModel | null = null;

/** The stand-in jian in plain steel (a weapon whose GLB does not exist yet); built once, shared. */
export function standInModel(): SwordModel {
  if (standInSword === null) {
    const g = jianGeometry();
    const m = new THREE.MeshStandardMaterial({ color: "#dfe5ec", metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
    standInSword = modelOf(g, m, NO_JADE, false, "stand-in");
  }
  return standInSword;
}

/** The first mesh's material under `root`, cloned (the GLTF scene stays as loaded: the hand prop shares it). */
function ownMaterial(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (found !== null || !mesh.isMesh) return;
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (m !== undefined && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) found = (m as THREE.MeshStandardMaterial).clone();
  });
  if (found === null) return null;
  const m = found as THREE.MeshStandardMaterial;
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap]) if (t !== null) t.anisotropy = 8;
  return m;
}

/** What loadSwordModels reads of a weapon (WeaponDef's fields). */
export interface SwordSource {
  readonly model: string;
  readonly swarm?: string;
  readonly fit?: BladeFit;
  readonly motif?: { readonly jade: readonly [number, number, number]; readonly ring?: boolean };
}

const swordModels = new Map<string, Promise<{ full: SwordModel; lod: SwordModel }>>();

/**
 * A weapon's full model and its textured LOD as skill swords, cached per weapon: both keep their UVs and their own
 * maps, and the LOD is mapped with the full model's jian map (same place, same scale). Missing files fall back:
 * no LOD → the full model for both; no GLB → the stand-in jian for both.
 */
export function loadSwordModels(def: SwordSource): Promise<{ full: SwordModel; lod: SwordModel }> {
  const key = def.model + "|" + (def.swarm ?? "");
  let p = swordModels.get(key);
  if (p === undefined) {
    p = (async () => {
      const jade = def.motif?.jade ?? NO_JADE;
      const gltf = await loadWeaponModel(def.model);
      const fullGeo = gltf === null ? null : bladeFromObject(gltf.scene, def.fit, { keepUv: true });
      const fullMat = gltf === null ? null : ownMaterial(gltf.scene);
      if (fullGeo === null || fullMat === null) {
        const s = standInModel();
        return { full: s, lod: s };
      }
      const ring = def.motif?.ring === true;
      const full = modelOf(fullGeo, fullMat, jade, true, def.model, ring);
      const lodGltf = def.swarm !== undefined ? await loadWeaponModel(def.swarm) : null;
      const map = fullGeo.userData.bladeMap as THREE.Matrix4 | undefined;
      const lodGeo = lodGltf === null ? null : bladeFromObject(lodGltf.scene, def.fit, { keepUv: true, ...(map !== undefined ? { map } : {}) });
      const lodMat = lodGltf === null ? null : ownMaterial(lodGltf.scene);
      const lod = lodGeo !== null && lodMat !== null ? modelOf(lodGeo, lodMat, jade, true, def.swarm!, ring) : full;
      return { full, lod };
    })();
    swordModels.set(key, p);
  }
  return p;
}

// ── Instanced sets ──────────────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0);

/** One instanced mesh of a BladeSet: it draws exactly its visible swords, packed at sync. */
interface BladeMesh {
  readonly mesh: THREE.InstancedMesh;
  /** First sword index it holds, and how many. */
  readonly from: number;
  readonly count: number;
  /** Per instance (packed): glow, flash, dissolve, seed (sword-material.ts iFx) and the rim colour (iRim). */
  readonly fx: THREE.InstancedBufferAttribute;
  readonly rim: THREE.InstancedBufferAttribute;
  model: SwordModel;
  /** Instances drawn after the last sync. */
  drawn: number;
  /** The upload ranges, reused (three's addUpdateRange allocates an object a call). */
  readonly matrixRange: { start: number; count: number };
  readonly fxRange: { start: number; count: number };
  readonly rimRange: { start: number; count: number };
}

/** A geometry that shares `base`'s attributes and index (one GPU copy) and adds a mesh's own instanced attributes. */
function instancedView(base: THREE.BufferGeometry, fx: THREE.InstancedBufferAttribute, rim: THREE.InstancedBufferAttribute): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setIndex(base.getIndex());
  for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
  g.setAttribute("iFx", fx);
  g.setAttribute("iRim", rim);
  if (base.boundingBox !== null) g.boundingBox = base.boundingBox.clone();
  if (base.boundingSphere !== null) g.boundingSphere = base.boundingSphere.clone();
  return g;
}

export class BladeSet {
  /** The hero swords [0, split) (the mid swords' mesh is its child, so one object goes in the scene). */
  readonly mesh: THREE.InstancedMesh;
  /** The mid swords [split, capacity) on the LOD, or null when split = capacity. */
  readonly swarm: THREE.InstancedMesh | null;
  private readonly parts: BladeMesh[] = [];
  private readonly visible: Uint8Array;
  /** Per sword slot (logical, unpacked): its matrix, look and rim; sync packs the visible ones into the meshes. */
  private readonly slotMatrix: Float32Array;
  private readonly slotFx: Float32Array;
  private readonly slotRim: Float32Array;
  /** Last pose per sword (centre of the blade, unit tip direction, guard-to-tip length in m), for probes and trails. */
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
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly lengthM: number;
  /** Draw every slot, hidden ones too (the old way; a lab measurement of the trim). */
  drawAll = false;

  /**
   * `lengthM`: guard to tip in metres at scale 1 (the geometry is unit length; the instance matrix scales it).
   * `split`: the first mid sword (the LOD's mesh). `shadows`: which meshes cast shadows (hero, mid).
   */
  constructor(
    readonly capacity: number,
    lengthM = 1.1,
    readonly split = capacity,
    shadows: { readonly hero: boolean; readonly mid: boolean } = { hero: true, mid: false },
  ) {
    const make = (from: number, n: number, castShadow: boolean): BladeMesh => {
      const model = standInModel();
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      const rim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      fx.setUsage(THREE.DynamicDrawUsage);
      rim.setUsage(THREE.DynamicDrawUsage);
      const mesh = new THREE.InstancedMesh(instancedView(model.geometry, fx, rim), model.material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      for (let i = 0; i < n; i += 1) mesh.setMatrixAt(i, this.zero);
      mesh.count = 0;
      return { mesh, from, count: n, fx, rim, model, drawn: 0, matrixRange: { start: 0, count: 0 }, fxRange: { start: 0, count: 0 }, rimRange: { start: 0, count: 0 } };
    };
    const hero = make(0, Math.max(1, Math.min(split, capacity)), shadows.hero);
    this.parts.push(hero);
    this.mesh = hero.mesh;
    this.mesh.name = "bladesHero";
    if (split < capacity) {
      const swarm = make(split, capacity - split, shadows.mid);
      swarm.mesh.name = "bladesMid";
      this.parts.push(swarm);
      this.mesh.add(swarm.mesh);
      this.swarm = swarm.mesh;
    } else {
      this.swarm = null;
    }
    this.visible = new Uint8Array(capacity);
    this.slotMatrix = new Float32Array(capacity * 16);
    this.slotFx = new Float32Array(capacity * 4);
    this.slotRim = new Float32Array(capacity * 3);
    this.cx = new Float32Array(capacity);
    this.cy = new Float32Array(capacity);
    this.cz = new Float32Array(capacity);
    this.tx = new Float32Array(capacity);
    this.ty = new Float32Array(capacity);
    this.tz = new Float32Array(capacity);
    this.len = new Float32Array(capacity);
    this.lengthM = lengthM;
  }

  private part(i: number): BladeMesh {
    return i < this.split ? this.parts[0]! : this.parts[1]!;
  }

  /** The whole sword's length over its guard-to-tip length (1 − pommelY) of sword `i`'s model. */
  span(i: number): number {
    return 1 - this.part(i).model.pommelY;
  }

  /** Sword `i` with its guard at (x, y, z), tip along (dx, dy, dz), `scale` × its length, spun `rollRad` round its axis. */
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
    this.matrix.toArray(this.slotMatrix, i * 16);
    this.visible[i] = 1;
    const L = this.lengthM * scale;
    this.cx[i] = x + this.dir.x * L * 0.45;
    this.cy[i] = y + this.dir.y * L * 0.45;
    this.cz[i] = z + this.dir.z * L * 0.45;
    this.tx[i] = this.dir.x;
    this.ty[i] = this.dir.y;
    this.tz[i] = this.dir.z;
    this.len[i] = L;
  }

  /**
   * Sword `i` by its whole length: the middle of the sword (pommel to tip) at (mx, my, mz), tip along (dx, dy, dz),
   * `lengthM` pommel to tip.
   */
  setWhole(i: number, mx: number, my: number, mz: number, dx: number, dy: number, dz: number, lengthM: number, rollRad = 0): void {
    const p = this.part(i);
    const span = 1 - p.model.pommelY;
    const blade = lengthM / span;
    // The middle of [pommelY, 1] on the unit blade, from the guard.
    const mid = ((1 + p.model.pommelY) / 2) * blade;
    const l = Math.hypot(dx, dy, dz) || 1;
    this.set(i, mx - (dx / l) * mid, my - (dy / l) * mid, mz - (dz / l) * mid, dx, dy, dz, blade / this.lengthM, rollRad);
  }

  /**
   * Sword `i`'s skill look (sword-material.ts): `glow` the charge (0 plain … 1 full edge line), `flash` a hit (0 …
   * ~1.5), the rim colour (linear, ≤ 0.9), `dissolve` (0 whole … 1 gone into light), its noise `seed`.
   */
  look(i: number, glow: number, flash: number, r: number, g: number, b: number, dissolve = 0, seed = i * 0.618): void {
    const f = this.slotFx;
    f[i * 4] = glow;
    f[i * 4 + 1] = flash;
    f[i * 4 + 2] = dissolve;
    f[i * 4 + 3] = seed;
    const c = this.slotRim;
    c[i * 3] = r;
    c[i * 3 + 1] = g;
    c[i * 3 + 2] = b;
  }

  hide(i: number): void {
    this.visible[i] = 0;
  }

  hideAll(): void {
    for (let i = 0; i < this.capacity; i += 1) this.hide(i);
  }

  /**
   * The equipped weapon: the hero swords' model (the full GLB) and the mid swords' (its textured LOD; default the
   * same). Same meshes, poses and looks kept; models are cached by the loader, so the old ones are not disposed.
   */
  setModel(hero: SwordModel, mid: SwordModel = hero): void {
    for (const [k, model] of [[0, hero], [1, mid]] as const) {
      const p = this.parts[k];
      if (p === undefined || p.model === model) continue;
      // The old view is dropped, not disposed: its attributes are the model's and this mesh's own, shared.
      p.mesh.geometry = instancedView(model.geometry, p.fx, p.rim);
      p.mesh.material = model.material;
      p.model = model;
    }
  }

  /** The model each mesh draws (hero, mid). */
  models(): { hero: SwordModel; mid: SwordModel } {
    return { hero: this.parts[0]!.model, mid: (this.parts[1] ?? this.parts[0]!).model };
  }

  isVisible(i: number): boolean {
    return this.visible[i] === 1;
  }

  /** Swords drawn by each mesh this frame (hero, mid). */
  drawn(out: { hero: number; swarm: number }): void {
    out.hero = this.parts[0]!.mesh.count;
    out.swarm = this.parts.length > 1 ? this.parts[1]!.mesh.count : 0;
  }

  /**
   * Packs each mesh's visible swords into its first instances and uploads only those (a hidden slot costs nothing:
   * with stable slots, every hidden slot under the highest visible one still cost a 15k-triangle sword's vertices).
   * `drawAll` (a lab measurement) draws every slot, hidden ones as zero-scaled copies.
   */
  sync(): void {
    for (let k = 0; k < this.parts.length; k += 1) {
      const p = this.parts[k]!;
      const m = p.mesh;
      const mat = m.instanceMatrix.array as Float32Array;
      const fx = p.fx.array as Float32Array;
      const rim = p.rim.array as Float32Array;
      let n = 0;
      for (let i = p.from; i < p.from + p.count; i += 1) {
        if (this.visible[i] === 0) continue;
        // Plain copies (a subarray view would allocate per sword per frame).
        const sm = this.slotMatrix;
        for (let q = 0; q < 16; q += 1) mat[n * 16 + q] = sm[i * 16 + q]!;
        for (let q = 0; q < 4; q += 1) fx[n * 4 + q] = this.slotFx[i * 4 + q]!;
        for (let q = 0; q < 3; q += 1) rim[n * 3 + q] = this.slotRim[i * 3 + q]!;
        n += 1;
      }
      let shown = n;
      if (this.drawAll) {
        for (let j = n; j < p.count; j += 1) m.setMatrixAt(j, this.zero);
        shown = p.count;
      }
      if (shown === 0 && p.drawn === 0) continue;
      m.count = shown;
      p.drawn = shown;
      // One range from 0, the same objects every frame (no allocation; the renderer clears the list after upload).
      p.matrixRange.count = Math.max(1, shown) * 16;
      m.instanceMatrix.updateRanges.length = 0;
      m.instanceMatrix.updateRanges.push(p.matrixRange);
      m.instanceMatrix.needsUpdate = true;
      p.fxRange.count = Math.max(1, shown) * 4;
      p.fx.updateRanges.length = 0;
      p.fx.updateRanges.push(p.fxRange);
      p.fx.needsUpdate = true;
      p.rimRange.count = Math.max(1, shown) * 3;
      p.rim.updateRanges.length = 0;
      p.rim.updateRanges.push(p.rimRange);
      p.rim.needsUpdate = true;
    }
  }
}
