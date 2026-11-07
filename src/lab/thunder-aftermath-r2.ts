/** R2 aftermath re-times the runner's painted mark in place; no duplicate ground atlas. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";

export const THUNDER_MARK_START_S = 0.1;
export const THUNDER_AFTERMATH_END_S = 1.8;
type CardMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

export class ThunderAftermathR2 {
  readonly group = new THREE.Group();
  private pool: FlipbookPool | null = null;
  private readonly blank = new THREE.Texture();
  private readonly target = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly options: FlipOptions = { life: ONE_FRAME, rate: 0, intensity: 0.65,
    fadeIn: 0, fadeOut: 0, cool: 0.4, occlude: 0, ground: -1e5, lift: 0.03 };
  private readonly particleAges = new Float32Array(6);
  private readonly baseline = new Float32Array(24);
  // The kit's seed identifies a pool slot across instance compaction. Position and increasing age guard slot reuse.
  private readonly marks = Array.from({ length: 24 }, () => ({ seed: -1, x: 0, z: 0, age: 0, seen: false }));
  private baselineCount = 0;
  private selected = -1;
  private pending = false;
  private age = -1;
  private fresh = false;

  constructor(private readonly parent: THREE.Object3D, private readonly sparkles = true) {
    this.group.name = "fx-thunder-aftermath-r2";
    parent.add(this.group);
  }

  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    if (!this.sparkles || meta.id !== "thunder-sparkle" || this.pool !== null) return;
    this.pool = new FlipbookPool(meta.id, meta.mode, 6, 13, this.blank);
    this.pool.attach(meta, texture);
    this.group.add(this.pool.mesh);
  }

  private markMesh(): CardMesh | null {
    for (const group of this.parent.children) {
      if (group.name !== "fx-clip-skill-marks") continue;
      for (const child of group.children) if (child.name === "flipbook-thunder-ground-mark") return child as CardMesh;
    }
    return null;
  }

  cast(target: THREE.Vector3): void {
    this.clear(); this.target.copy(target); this.pending = true;
    // cast() follows the runner's spawn but precedes its pool update: snapshot already presented marks only.
    this.baselineCount = 0;
    const mesh = this.markMesh();
    if (mesh === null || !mesh.visible) for (const mark of this.marks) mark.seed = -1;
    if (mesh !== null && mesh.visible) {
      const age = mesh.geometry.getAttribute("iAge");
      for (let i = 0; i < mesh.geometry.instanceCount && i < this.baseline.length; i += 1) this.baseline[this.baselineCount++] = age.getZ(i);
    }
  }

  strike(): void { this.age = 0; this.fresh = true; this.render(); }

  update(dt: number): void {
    if (this.age < 0) return;
    if (this.fresh) this.fresh = false;
    else this.age += Math.max(0, dt);
    this.render();
  }

  private render(): void {
    const pool = this.pool, meta = pool?.meta;
    pool?.clear();
    if (pool === null || meta == null || this.age < THUNDER_MARK_START_S || this.age >= THUNDER_AFTERMATH_END_S) return;
    const age = this.age - THUNDER_MARK_START_S, o = this.options;
    let drawn = 0;
    for (let i = 0; i < 6; i += 1) {
      const t = age / (1.4 - i * 0.16);
      if (t >= 1) continue;
      const angle = i * 2.39996 + t * 0.3, radius = 0.45 + (i % 3) * 0.24 + t * 0.15;
      o.frame = (i * 7 + age * meta.fps) % meta.frames;
      o.alpha = Math.min(1, age / 0.08) * (1 - t) ** 2;
      this.at.set(this.target.x + Math.cos(angle) * radius, this.target.y + 0.16 + t * 0.25, this.target.z + Math.sin(angle) * radius);
      pool.spawn(this.at, 0.16 + (i % 3) * 0.025, o);
      this.particleAges[drawn++] = t;
    }
    pool.update(0);
    const ages = pool.mesh.geometry.getAttribute("iAge");
    for (let i = 0; i < drawn; i += 1) ages.setX(i, this.particleAges[i]!);
    ages.needsUpdate = true;
  }

  /** After GroundMarks.update: edit only this cast's existing card, preserving other skills and the B8 texture. */
  present(): void {
    const mesh = this.markMesh();
    if (mesh === null || !mesh.visible) {
      for (const mark of this.marks) mark.seed = -1;
      this.selected = -1;
      return;
    }
    const g = mesh.geometry, pos = g.getAttribute("iPos"), age = g.getAttribute("iAge");
    const data = g.getAttribute("iData"), colour = g.getAttribute("iColor"), lift = g.getAttribute("iLift");
    for (const mark of this.marks) mark.seen = false;
    for (let i = 0; i < g.instanceCount; i += 1) {
      const seed = age.getZ(i), x = pos.getX(i), z = pos.getZ(i), rawAge = age.getX(i);
      let slot = -1;
      for (let j = 0; j < this.marks.length; j += 1) {
        const m = this.marks[j]!;
        if (m.seed === seed && m.x === x && m.z === z && rawAge >= m.age - 1e-6) { slot = j; break; }
      }
      if (slot < 0 && this.pending && Math.abs(x - this.target.x) < 1e-4 && Math.abs(z - this.target.z) < 1e-4) {
        let existed = false;
        for (let j = 0; j < this.baselineCount; j += 1) if (this.baseline[j] === seed) existed = true;
        if (!existed) for (let j = 0; j < this.marks.length; j += 1) if (this.marks[j]!.seed < 0) {
          slot = this.selected = j; this.pending = false; break;
        }
      }
      if (slot < 0) continue;
      const m = this.marks[slot]!;
      m.seed = seed; m.x = x; m.z = z; m.age = rawAge; m.seen = true;
      // Old owned marks disappear on recast. Other spells sharing this pool retain their original attributes.
      const visible = slot === this.selected && this.age >= THUNDER_MARK_START_S && this.age < THUNDER_AFTERMATH_END_S;
      data.setW(i, visible ? 0.3 : 0);
      if (!visible) continue;
      const reveal = Math.min(1, (this.age - THUNDER_MARK_START_S) / 0.12);
      const p = Math.min(1, Math.max(0, (this.age - 0.45) / (THUNDER_AFTERMATH_END_S - 0.45)));
      const erosion = p * p * (3 - 2 * p), size = 0.7 + 3.1 * (1 - (1 - reveal) ** 2);
      data.setX(i, size); lift.setY(i, size);
      data.setZ(i, Math.min(Number(mesh.material.uniforms.uFrames!.value) - 1, Math.max(0, this.age - THUNDER_MARK_START_S) * 8));
      data.setW(i, 0.3 * reveal * (1 - erosion));
      age.setXY(i, erosion, 1e-6);
      colour.setXYZ(i, 0.48 * (1 - erosion), 0.4 * (1 - erosion), 0.72 * (1 - erosion));
    }
    for (let j = 0; j < this.marks.length; j += 1) if (!this.marks[j]!.seen) {
      this.marks[j]!.seed = -1;
      if (this.selected === j) this.selected = -1;
    }
    data.needsUpdate = age.needsUpdate = colour.needsUpdate = lift.needsUpdate = true;
  }

  clear(): void {
    this.age = -1; this.selected = -1; this.pending = false; this.fresh = false;
    this.pool?.clear();
  }
}
