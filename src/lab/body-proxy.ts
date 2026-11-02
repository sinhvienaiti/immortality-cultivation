/**
 * Capsules round a skinned character's body parts (skills lab, dev-only,
 * never built), so a held prop can keep out of the body: Lam's clips are
 * unarmed, and a 1 m sword rigid in the fist crossed the satchel at rest and
 * the head at a walk or run (review 03/11/2026: half the sampled frames).
 *
 * Built once from the mesh as posed: every vertex goes to each bone carrying
 * at least MIN_WEIGHT of it;
 * per bone, the vertices' principal axis gives a segment (10th–90th
 * percentile along it) and a radius (90th percentile off it), stored in the
 * bone's own frame so the capsule follows the bone. Bones in `skip` (the
 * holding arm, the tail) get none; a skipped hand takes its fingers with it
 * (canonical names: the Mesh2Motion human's index_01_r … thumb_03_r close
 * round the grip and would push the sword out of its own fist). `update` moves the capsules to this frame's
 * pose; `push` gives a sphere's way out. No allocation per frame.
 */
import * as THREE from "three";

const _v = new THREE.Vector3();
/** A vertex counts for every bone that carries at least this weight of it. */
const MIN_WEIGHT = 0.3;
/** No part thinner than this (m): a thin bone's few vertices understate the cloth round it (Lam's collar). */
const MIN_RADIUS_M = 0.05;
const _m = new THREE.Matrix4();

export class BodyProxy {
  readonly count: number;
  private readonly bones: THREE.Object3D[] = [];
  /** Capsule ends in their bone's frame (xyz a, xyz b) and in the world this frame. */
  private readonly local: Float32Array;
  private readonly world: Float32Array;
  readonly radius: Float32Array;
  readonly names: string[] = [];

  constructor(model: THREE.Object3D, skipNames: readonly string[]) {
    model.updateWorldMatrix(true, true);
    // A skipped hand's descendants (fingers) are skipped too.
    const skip = new Set(skipNames);
    for (const nm of skipNames) {
      if (!nm.startsWith("hand_")) continue;
      model.getObjectByName(nm)?.traverse((o) => {
        if ((o as THREE.Bone).isBone) skip.add(o.name);
      });
    }
    const groups = new Map<THREE.Object3D, number[]>();
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const g = mesh.geometry;
      const pos = g.getAttribute("position");
      const si = g.getAttribute("skinIndex");
      const sw = g.getAttribute("skinWeight");
      if (!si || !sw) return;
      for (let i = 0; i < pos.count; i += 1) {
        let posed = false;
        for (let k = 0; k < 4; k += 1) {
          // Every bone with a fair share of the vertex (joints count for both sides: the collar for the neck too).
          if (sw.getComponent(i, k) < MIN_WEIGHT) continue;
          const bone = mesh.skeleton.bones[si.getComponent(i, k)];
          if (bone === undefined || skip.has(bone.name)) continue;
          if (!posed) mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
          posed = true;
          let list = groups.get(bone);
          if (list === undefined) groups.set(bone, (list = []));
          list.push(_v.x, _v.y, _v.z);
        }
      }
    });
    const caps: { bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; r: number }[] = [];
    for (const [bone, list] of groups) {
      const n = list.length / 3;
      if (n < 24) continue;
      const c = new THREE.Vector3();
      for (let i = 0; i < n; i += 1) c.set(c.x + list[i * 3]!, c.y + list[i * 3 + 1]!, c.z + list[i * 3 + 2]!);
      c.multiplyScalar(1 / n);
      // Principal axis (power iteration on the covariance).
      const cov = new Float64Array(6); // xx, xy, xz, yy, yz, zz
      for (let i = 0; i < n; i += 1) {
        const x = list[i * 3]! - c.x;
        const y = list[i * 3 + 1]! - c.y;
        const z = list[i * 3 + 2]! - c.z;
        cov[0] = cov[0]! + x * x;
        cov[1] = cov[1]! + x * y;
        cov[2] = cov[2]! + x * z;
        cov[3] = cov[3]! + y * y;
        cov[4] = cov[4]! + y * z;
        cov[5] = cov[5]! + z * z;
      }
      const cxx = cov[0]!, cxy = cov[1]!, cxz = cov[2]!, cyy = cov[3]!, cyz = cov[4]!, czz = cov[5]!;
      const ax = new THREE.Vector3(0.31, 0.83, 0.47);
      for (let it = 0; it < 24; it += 1) {
        ax.set(cxx * ax.x + cxy * ax.y + cxz * ax.z, cxy * ax.x + cyy * ax.y + cyz * ax.z, cxz * ax.x + cyz * ax.y + czz * ax.z);
        if (ax.lengthSq() < 1e-20) ax.set(0, 1, 0);
        ax.normalize();
      }
      const ts: number[] = [];
      const ds: number[] = [];
      for (let i = 0; i < n; i += 1) {
        _v.set(list[i * 3]! - c.x, list[i * 3 + 1]! - c.y, list[i * 3 + 2]! - c.z);
        const t = _v.dot(ax);
        ts.push(t);
        ds.push(Math.sqrt(Math.max(0, _v.lengthSq() - t * t)));
      }
      ts.sort((p, q) => p - q);
      ds.sort((p, q) => p - q);
      const q = (a: number[], f: number): number => a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))]!;
      const r = Math.max(MIN_RADIUS_M, q(ds, 0.9));
      // The segment stops a radius short of the part's ends (the round caps cover them).
      const t0 = Math.min(0, q(ts, 0.1) + r * 0.5);
      const t1 = Math.max(0, q(ts, 0.9) - r * 0.5);
      caps.push({ bone, a: c.clone().addScaledVector(ax, t0), b: c.clone().addScaledVector(ax, t1), r });
    }
    this.count = caps.length;
    this.local = new Float32Array(this.count * 6);
    this.world = new Float32Array(this.count * 6);
    this.radius = new Float32Array(this.count);
    for (let k = 0; k < caps.length; k += 1) {
      const cap = caps[k]!;
      _m.copy(cap.bone.matrixWorld).invert();
      const a = cap.a.applyMatrix4(_m);
      const b = cap.b.applyMatrix4(_m);
      this.local.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
      this.radius[k] = cap.r;
      this.bones.push(cap.bone);
      this.names.push(cap.bone.name);
    }
    this.update();
  }

  /** The capsules at this frame's pose (bones' world matrices must be current). */
  update(): void {
    const L = this.local;
    const W = this.world;
    for (let k = 0; k < this.count; k += 1) {
      const m = this.bones[k]!.matrixWorld;
      const o = k * 6;
      _v.set(L[o]!, L[o + 1]!, L[o + 2]!).applyMatrix4(m);
      W[o] = _v.x;
      W[o + 1] = _v.y;
      W[o + 2] = _v.z;
      _v.set(L[o + 3]!, L[o + 4]!, L[o + 5]!).applyMatrix4(m);
      W[o + 3] = _v.x;
      W[o + 4] = _v.y;
      W[o + 5] = _v.z;
    }
  }

  /** Distance from (x, y, z) to capsule k's axis, and the axis point it measures from in `out`. */
  private closest(k: number, x: number, y: number, z: number, out: THREE.Vector3): number {
    const W = this.world;
    const o = k * 6;
    const ax = W[o]!, ay = W[o + 1]!, az = W[o + 2]!;
    const bx = W[o + 3]! - ax, by = W[o + 4]! - ay, bz = W[o + 5]! - az;
    const ll = bx * bx + by * by + bz * bz;
    let t = ll > 1e-12 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / ll : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.set(ax + bx * t, ay + by * t, az + bz * t);
    return Math.hypot(x - out.x, y - out.y, z - out.z);
  }

  /** Adds to `out` the way out of every capsule for a sphere at (x, y, z) of radius r; returns the deepest overlap (m). */
  push(x: number, y: number, z: number, r: number, out: THREE.Vector3, scratch: THREE.Vector3): number {
    let deepest = 0;
    for (let k = 0; k < this.count; k += 1) {
      const d = this.closest(k, x, y, z, scratch);
      const pen = this.radius[k]! + r - d;
      if (pen <= 0) continue;
      if (d > 1e-6) out.addScaledVector(scratch.set(x - scratch.x, y - scratch.y, z - scratch.z), pen / d);
      else out.y += pen;
      if (pen > deepest) deepest = pen;
    }
    return deepest;
  }
}
