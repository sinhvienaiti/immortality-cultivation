/**
 * Dev-only stand-in beasts for the skills lab (never shipped): the reuse rule
 * (owner 01/11, MONSTER_MODEL_INVENTORY.md) gives us Tripo originals of other
 * games until Tu Tiên's own beasts pass their gate: Dragonhold's blight-wolf
 * (Phong Lang) and tusk-boar (Thiết Giáp Trư), Wordwoven's kamaitachi (Thạch
 * Thử). One InstancedMesh per species; hits flash and recoil, deaths sink and
 * shrink, the slot respawns after a moment so the lab never runs dry.
 * Implements the skills' TargetField.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TargetField } from "../view/skills/targets";
import { LAB_ASSETS } from "./look";

interface Species {
  readonly file: string;
  readonly lengthM: number;
  readonly yaw: number; // model forward → +x (radians added)
  readonly hp: number;
  readonly tier: number;
  readonly radius: number;
}

const SPECIES: readonly Species[] = [
  { file: "blight-wolf.glb", lengthM: 1.55, yaw: 0, hp: 4, tier: 1, radius: 0.45 },
  { file: "tusk-boar.glb", lengthM: 1.7, yaw: 0, hp: 7, tier: 2, radius: 0.55 },
  { file: "kamaitachi.glb", lengthM: 1.05, yaw: 0, hp: 2, tier: 0, radius: 0.32 },
];

export type HerdMode = "still" | "march";

const MAX = 72;

export class LabHerd implements TargetField {
  readonly size = MAX;
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly heights: number[] = [];
  private readonly sp = new Int8Array(MAX);
  private readonly slot = new Int16Array(MAX); // instance index within its species
  private readonly px = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly hx = new Float32Array(MAX); // home (still) or spawn (march)
  private readonly hz = new Float32Array(MAX);
  private readonly yaw = new Float32Array(MAX);
  private readonly hp = new Float32Array(MAX);
  private readonly flash = new Float32Array(MAX);
  private readonly rx = new Float32Array(MAX); // recoil offset
  private readonly rz = new Float32Array(MAX);
  private readonly dying = new Float32Array(MAX); // > 0 while dying (s left)
  private readonly gone = new Float32Array(MAX); // > 0 until respawn
  private readonly live = new Uint8Array(MAX);
  private readonly tint = new Int32Array(MAX);
  private count = 0;
  private mode: HerdMode = "still";
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly c = new THREE.Color();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const perSpecies = [0, 0, 0];
    this.layout(perSpecies);
    for (let k = 0; k < SPECIES.length; k += 1) {
      const def = SPECIES[k]!;
      const gltf = await loader.loadAsync(LAB_ASSETS + "models/" + def.file);
      let mesh: THREE.Mesh | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (mesh === null && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      if (mesh === null) throw new Error("no mesh in " + def.file);
      const src = mesh as THREE.Mesh;
      const geometry = src.geometry.clone();
      geometry.applyMatrix4(src.matrixWorld);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const sizeX = box.max.x - box.min.x;
      const sizeZ = box.max.z - box.min.z;
      const along = Math.max(sizeX, sizeZ);
      const scale = def.lengthM / along;
      // Feet on the ground, centred.
      geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      geometry.scale(scale, scale, scale);
      // Long axis along x: turn models whose long side is z.
      if (sizeZ > sizeX) geometry.rotateY(Math.PI / 2);
      geometry.rotateY(def.yaw);
      geometry.computeBoundingBox();
      this.heights[k] = geometry.boundingBox!.max.y;
      const material = (Array.isArray(src.material) ? src.material[0]! : src.material) as THREE.MeshStandardMaterial;
      const inst = new THREE.InstancedMesh(geometry, material, Math.max(1, perSpecies[k]!));
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, perSpecies[k]!) * 3).fill(1), 3);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.meshes[k] = inst;
      this.group.add(inst);
    }
    this.update(0);
  }

  /** Clusters for still mode (skills aimed at fixed spots) plus a scatter; counts per species out. */
  private layout(perSpecies: number[]): void {
    const spots: [number, number, number, number][] = [
      // x, z, radius, count
      [-5, -7, 1.9, 9],
      [0, -10, 2.2, 11],
      [5, -6, 1.9, 9],
      [-9, -12, 2.4, 8],
      [9, -12, 2.4, 8],
      [0, -15, 2.6, 9],
      [-2.5, -4.5, 1.2, 3],
      [2.5, -4.5, 1.2, 3],
    ];
    let n = 0;
    let seed = 17;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const [x, z, r, count] of spots) {
      for (let i = 0; i < count && n < MAX; i += 1) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * r;
        const k = rnd() < 0.5 ? 0 : rnd() < 0.55 ? 2 : 1;
        this.sp[n] = k;
        this.slot[n] = perSpecies[k]!;
        perSpecies[k] = perSpecies[k]! + 1;
        this.hx[n] = x + Math.cos(a) * d;
        this.hz[n] = z + Math.sin(a) * d;
        this.px[n] = this.hx[n]!;
        this.pz[n] = this.hz[n]!;
        // Facing the heart (+z, south) with a little spread.
        this.yaw[n] = Math.atan2(-(this.hz[n]! - 3), -(this.hx[n]! - 0)) + (rnd() - 0.5) * 0.5;
        this.hp[n] = SPECIES[k]!.hp;
        this.live[n] = 1;
        n += 1;
      }
    }
    this.count = n;
  }

  setMode(mode: HerdMode): void {
    this.mode = mode;
    this.respawnAll();
  }

  respawnAll(): void {
    for (let i = 0; i < this.count; i += 1) {
      this.px[i] = this.hx[i]!;
      this.pz[i] = this.hz[i]!;
      this.hp[i] = SPECIES[this.sp[i]!]!.hp;
      this.live[i] = 1;
      this.dying[i] = 0;
      this.gone[i] = 0;
      this.flash[i] = 0;
      this.rx[i] = 0;
      this.rz[i] = 0;
    }
  }

  alive(i: number): boolean {
    return i >= 0 && i < this.count && this.live[i] === 1 && this.dying[i] === 0;
  }
  x(i: number): number {
    return this.px[i]! + this.rx[i]!;
  }
  z(i: number): number {
    return this.pz[i]! + this.rz[i]!;
  }
  midY(i: number): number {
    return (this.heights[this.sp[i]!] ?? 0.8) * 0.55;
  }
  radius(i: number): number {
    return SPECIES[this.sp[i]!]!.radius;
  }
  tier(i: number): number {
    return SPECIES[this.sp[i]!]!.tier;
  }

  nearest(x: number, z: number, maxR: number, skip = -1): number {
    let best = -1;
    let bestD = maxR * maxR;
    for (let i = 0; i < this.count; i += 1) {
      if (i === skip || !this.alive(i)) continue;
      const dx = this.x(i) - x;
      const dz = this.z(i) - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  inCircle(x: number, z: number, r: number, out: Int32Array): number {
    let n = 0;
    for (let i = 0; i < this.count && n < out.length; i += 1) {
      if (!this.alive(i)) continue;
      const dx = this.x(i) - x;
      const dz = this.z(i) - z;
      const rr = r + this.radius(i);
      if (dx * dx + dz * dz <= rr * rr) out[n++] = i;
    }
    return n;
  }

  inCapsule(ax: number, az: number, bx: number, bz: number, halfW: number, out: Int32Array): number {
    let n = 0;
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1;
    for (let i = 0; i < this.count && n < out.length; i += 1) {
      if (!this.alive(i)) continue;
      const px = this.x(i) - ax;
      const pz = this.z(i) - az;
      const t = Math.max(0, Math.min(1, (px * vx + pz * vz) / len2));
      const dx = px - vx * t;
      const dz = pz - vz * t;
      const rr = halfW + this.radius(i);
      if (dx * dx + dz * dz <= rr * rr) out[n++] = i;
    }
    return n;
  }

  hit(i: number, dx: number, dz: number, power: number, rgb: number): boolean {
    if (!this.alive(i)) return false;
    this.flash[i] = 1;
    this.tint[i] = rgb;
    const push = 0.12 + 0.35 * power * (this.tier(i) >= 2 ? 0.4 : 1);
    this.rx[i] = this.rx[i]! + dx * push;
    this.rz[i] = this.rz[i]! + dz * push;
    this.hp[i] = this.hp[i]! - (power >= 0.9 ? 3 : power >= 0.5 ? 2 : 1);
    if (this.hp[i]! <= 0) {
      this.dying[i] = 0.5;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.count; i += 1) {
      const k = this.sp[i]!;
      const mesh = this.meshes[k];
      if (!mesh) continue;
      const idx = this.slot[i]!;
      if (this.gone[i]! > 0) {
        this.gone[i] = this.gone[i]! - dt;
        mesh.setMatrixAt(idx, this.zero);
        if (this.gone[i]! <= 0) {
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]!;
          this.hp[i] = SPECIES[k]!.hp;
          this.live[i] = 1;
        }
        continue;
      }
      let sink = 0;
      let shrink = 1;
      if (this.dying[i]! > 0) {
        this.dying[i] = this.dying[i]! - dt;
        const u = 1 - Math.max(0, this.dying[i]!) / 0.5;
        sink = -0.35 * u;
        shrink = 1 - 0.55 * u;
        if (this.dying[i]! <= 0) {
          this.dying[i] = 0;
          this.live[i] = 0;
          this.gone[i] = 2.5;
          mesh.setMatrixAt(idx, this.zero);
          continue;
        }
      }
      if (this.mode === "march" && this.dying[i] === 0) {
        const dx = 0 - this.px[i]!;
        const dz = 1 - this.pz[i]!;
        const d = Math.hypot(dx, dz);
        if (d < 2.5) {
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]! - 4;
        } else {
          const sp = (k === 2 ? 1.6 : k === 1 ? 1.0 : 1.3) * dt;
          this.px[i] = this.px[i]! + (dx / d) * sp;
          this.pz[i] = this.pz[i]! + (dz / d) * sp;
          this.yaw[i] = Math.atan2(-dz, dx);
        }
      }
      // Recoil springs back.
      const back = Math.max(0, 1 - dt * 6);
      this.rx[i] = this.rx[i]! * back;
      this.rz[i] = this.rz[i]! * back;
      const bob = this.mode === "march" ? Math.abs(Math.sin(this.time * 9 + i)) * 0.05 : Math.sin(this.time * 1.7 + i) * 0.01;
      this.e.set(0, this.yaw[i]!, 0);
      this.q.setFromEuler(this.e);
      this.p.set(this.x(i), sink + bob, this.z(i));
      this.s.set(shrink, shrink, shrink);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(idx, this.m);
      // Hit flash: the blow's colour for a few frames, then back to the model's own.
      const f = this.flash[i]!;
      if (f > 0) {
        this.flash[i] = Math.max(0, f - dt * 7);
        const rgb = this.tint[i]!;
        const g = 1 + 1.8 * f;
        this.c.setRGB((((rgb >> 16) & 255) / 255) * g, (((rgb >> 8) & 255) / 255) * g, ((rgb & 255) / 255) * g);
        mesh.setColorAt(idx, this.c);
      } else {
        this.c.setRGB(1, 1, 1);
        mesh.setColorAt(idx, this.c);
      }
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
