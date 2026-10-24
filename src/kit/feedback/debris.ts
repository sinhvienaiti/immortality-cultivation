// Source: games/space-typing@survival-s0 src/feedback/debris.ts (kit copy: rest and fade from the profile, random passed in; log fixes in shared/game-kit/DRIFT.md)
/**
 * Debris (SURVIVAL_MODE_PLAN.md 5.5, 5.9; dragon-hold 05 §5, §6.3): a killed
 * foe breaks into shards of its family's colours, thrown along the blow; they
 * bounce, settle on the floor, glow faintly for the profile's rest time
 * (ship 8 s, dragon 6 s) and shrink away, so the floor shows how hard the
 * fight has been. One InstancedMesh, a ring pool (the oldest shard makes
 * room), no allocation after construction.
 */
import * as THREE from "three";
import { SHIP, type FeedbackProfile } from "./profiles";

const GRAVITY = 22;

export type DebrisOptions = {
  profile?: FeedbackProfile;
  /** Height of the floor the shards lie on. */
  floorY?: number;
  /** Shards' throw, spin, size and tint; pass a seeded one for a repeatable burst. */
  random?: () => number;
  /** Shard shape (default: a long six-point crystal, 1 unit tall). */
  geometry?: THREE.BufferGeometry;
};

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  /** Shards shown at most (the tier's cap, up to the capacity). */
  limit: number;
  readonly profile: FeedbackProfile;
  private readonly floorY: number;
  private readonly random: () => number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly spin: Float32Array;
  private readonly rot: Float32Array;
  private readonly size: Float32Array;
  private readonly age: Float32Array;
  private readonly alive: Uint8Array;
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  live = 0;

  constructor(readonly capacity: number, options: DebrisOptions = {}) {
    this.limit = capacity;
    this.profile = options.profile ?? SHIP;
    this.floorY = options.floorY ?? 0.04;
    this.random = options.random ?? Math.random;
    let geometry = options.geometry;
    if (geometry === undefined) {
      // A long six-point crystal.
      geometry = new THREE.OctahedronGeometry(0.5, 0);
      geometry.scale(0.42, 1, 0.42);
    }
    const material = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.15, emissive: "#ffffff", emissiveIntensity: 0.55 });
    // The instance colour also drives the glow.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor;");
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const f = () => new Float32Array(capacity);
    [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.spin, this.rot, this.size, this.age] = [f(), f(), f(), f(), f(), f(), f(), f(), f(), f()];
    this.alive = new Uint8Array(capacity);
  }

  /**
   * `count` shards at (x, y, z) thrown along (dx, dz) with `force` (m/s),
   * coloured between `a` and `b`.
   */
  burst(x: number, y: number, z: number, dx: number, dz: number, count: number, force: number, a: THREE.Color, b: THREE.Color): void {
    const random = this.random;
    const length = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < count; k += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.limit;
      if (this.alive[i] === 0) this.live += 1;
      this.alive[i] = 1;
      const spread = (random() - 0.5) * 2.2;
      const speed = force * (0.45 + random() * 0.8);
      const ux = dx / length;
      const uz = dz / length;
      this.px[i] = x + (random() - 0.5) * 0.4;
      this.py[i] = y + random() * 0.3;
      this.pz[i] = z + (random() - 0.5) * 0.4;
      this.vx[i] = (ux - uz * spread) * speed;
      this.vz[i] = (uz + ux * spread) * speed;
      this.vy[i] = 2.5 + random() * 4.5;
      this.spin[i] = (random() - 0.5) * 22;
      this.rot[i] = random() * Math.PI * 2;
      this.size[i] = 0.34 + random() * 0.42;
      this.age[i] = 0;
      this.color.copy(a).lerp(b, random()).multiplyScalar(0.8 + random() * 0.5);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const { restS, fadeS } = this.profile.debris;
    let top = 0;
    for (let i = 0; i < this.limit; i += 1) {
      if (this.alive[i] === 0) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        continue;
      }
      top = i + 1;
      const age = (this.age[i] = this.age[i]! + dt);
      if (age >= restS + fadeS) {
        this.alive[i] = 0;
        this.live -= 1;
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        continue;
      }
      const resting = this.py[i]! <= this.floorY + 0.001 && Math.abs(this.vy[i]!) < 0.01;
      if (!resting) {
        this.vy[i] = this.vy[i]! - GRAVITY * dt;
        this.px[i] = this.px[i]! + this.vx[i]! * dt;
        this.py[i] = this.py[i]! + this.vy[i]! * dt;
        this.pz[i] = this.pz[i]! + this.vz[i]! * dt;
        this.rot[i] = this.rot[i]! + this.spin[i]! * dt;
        if (this.py[i]! < this.floorY) {
          // Bounce once or twice, then lie on the floor.
          this.py[i] = this.floorY;
          this.vy[i] = Math.abs(this.vy[i]!) > 2 ? -this.vy[i]! * 0.32 : 0;
          this.vx[i] = this.vx[i]! * 0.45;
          this.vz[i] = this.vz[i]! * 0.45;
          this.spin[i] = this.spin[i]! * 0.4;
        }
      } else if (age < restS - 0.1 && age > 1.5) continue;
      const fade = age > restS ? 1 - (age - restS) / fadeS : 1;
      // Lying shards rest on their side.
      const lie = resting || this.vy[i] === 0 ? 1.45 : 0;
      this.euler.set(lie + this.rot[i]! * 0.3, this.rot[i]!, this.rot[i]! * 0.6);
      this.quat.setFromEuler(this.euler);
      this.scale.setScalar(this.size[i]! * fade);
      this.matrix.compose(this.pos.set(this.px[i]!, this.py[i]! + this.size[i]! * 0.2, this.pz[i]!), this.quat, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.count = top;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Where shard `i` is now (tests, tools). */
  position(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.px[i]!, this.py[i]!, this.pz[i]!);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
