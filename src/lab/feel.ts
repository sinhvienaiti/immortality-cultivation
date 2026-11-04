/**
 * The skills lab's hit feel (dev-only, never built; MOTION_PLAN step 3 item
 * 11, appendix B #20 and #23; round 2 impact lane): a camera kick on a damped
 * spring fed velocity impulses, a camera shake per strike that dies in
 * ~120 ms, a hit-stop that counts part frames and eases back to full speed,
 * and the lab's own impact lights, so a new flash elsewhere never drags a
 * lit spot across the ground (the kit stage has one impact light that jumps
 * to each new flash at full strength; src/kit is not edited, D44, see
 * docs/SYNC_DEBT.md). Everything steps with dt and allocates nothing per frame.
 */
import * as THREE from "three";

export const smooth01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** Peak displacement of an underdamped spring hit by velocity v0 is v0/ω × this, at ζ = 0.35. */
function peakShare(zeta: number): number {
  const wd = Math.sqrt(1 - zeta * zeta);
  const t = Math.atan2(wd, zeta) / wd; // first peak, in 1/ω
  return Math.exp(-zeta * t) * Math.sin(wd * t) / wd;
}

/**
 * Camera kick: a damped spring on the ground plane (ω ≈ 35 rad/s, ζ ≈ 0.35,
 * appendix B #23) that takes velocity impulses, so a kick rises over a few
 * frames, overshoots once and settles, instead of a one-frame jolt decaying
 * in a straight line. Sub-stepped at ≤ 1/240 s: the same at any frame rate.
 */
export class CameraKick {
  x = 0;
  z = 0;
  private vx = 0;
  private vz = 0;
  private readonly share: number;

  constructor(
    private readonly omega = 35,
    private readonly zeta = 0.35,
    private readonly maxM = 0.3,
  ) {
    this.share = peakShare(zeta);
  }

  /** A kick peaking near `metres` along the unit ground direction (dx, dz). */
  impulse(metres: number, dx: number, dz: number): void {
    const v = (metres * this.omega) / this.share;
    this.vx += dx * v;
    this.vz += dz * v;
  }

  update(dt: number): void {
    const w2 = this.omega * this.omega;
    const c = 2 * this.zeta * this.omega;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      // Semi-implicit Euler: stable for this stiffness at 240 Hz.
      this.vx += (-w2 * this.x - c * this.vx) * h;
      this.vz += (-w2 * this.z - c * this.vz) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
    }
    const d = Math.hypot(this.x, this.z);
    if (d > this.maxM) {
      this.x *= this.maxM / d;
      this.z *= this.maxM / d;
    }
  }

  reset(): void {
    this.x = this.z = this.vx = this.vz = 0;
  }
}

/**
 * Camera shake (round 2 "weight"): a strike adds an amplitude in metres
 * (0.1–0.2 m at the play camera, scaled by the quality tier: Low ×0.5,
 * Medium ×0.75), which dies exponentially (e-fold 40 ms: ~5 % left at 120 ms).
 * The offset moves along the camera's right and up axes with two sums of
 * sines at 17–37 Hz and fixed phases, so a capture on the fixed clock repeats
 * exactly. Stacked strikes take the larger amplitude plus a quarter of the
 * smaller one, capped at `maxM`. Runs on real time (through a hit-stop: the
 * world freezes, the camera rings). No allocation per frame.
 */
export class CameraShake {
  x = 0;
  y = 0;
  z = 0;
  private amp = 0;
  private t = 0;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    private readonly tierScale = 1,
    private readonly decayS = 0.04,
    private readonly maxM = 0.24,
  ) {}

  add(metres: number): void {
    const a = metres * this.tierScale;
    this.amp = Math.min(this.maxM, Math.max(this.amp, a) + 0.25 * Math.min(this.amp, a));
  }

  /** Steps the shake and writes the world offset (x, y, z) along the camera's own axes. */
  update(dt: number, camera: THREE.Camera): void {
    this.t += dt;
    this.amp *= Math.exp(-dt / this.decayS);
    if (this.amp < 2e-4) {
      this.amp = 0;
      this.x = this.y = this.z = 0;
      return;
    }
    const t = this.t;
    const TAU = Math.PI * 2;
    const n1 = 0.62 * Math.sin(TAU * 19 * t + 0.7) + 0.38 * Math.sin(TAU * 31 * t + 2.1);
    const n2 = 0.62 * Math.sin(TAU * 23 * t + 1.3) + 0.38 * Math.sin(TAU * 37 * t + 4.2);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const a = this.amp;
    this.x = (this.right.x * n1 + this.up.x * n2 * 0.8) * a;
    this.y = (this.right.y * n1 + this.up.y * n2 * 0.8) * a;
    this.z = (this.right.z * n1 + this.up.z * n2 * 0.8) * a;
  }

  /** The amplitude now (m), for checks. */
  get level(): number {
    return this.amp;
  }

  reset(): void {
    this.amp = 0;
    this.t = 0;
    this.x = this.y = this.z = 0;
  }
}

/**
 * Hit-stop: world time runs at `slow` while a stop holds, counted to the part
 * of a frame (a 30 ms stop is 30 ms at 60 or 120 Hz, not 2 or 4 whole
 * frames), then eases back to full speed over `exitS` (smoothstep) instead of
 * snapping from 5 % to 100 % (appendix B #23).
 */
export class HitStop {
  private left = 0;
  private exitAge: number;

  constructor(
    private readonly slow = 0.05,
    private readonly exitS = 0.03,
  ) {
    this.exitAge = exitS;
  }

  start(ms: number): void {
    this.left = Math.max(this.left, ms / 1000);
  }

  /** World seconds for a frame of `dt` real seconds. */
  advance(dt: number): number {
    let rest = dt;
    let world = 0;
    if (this.left > 0) {
      const h = Math.min(this.left, rest);
      world += h * this.slow;
      this.left -= h;
      rest -= h;
      this.exitAge = 0;
      if (this.left > 0) return world;
    }
    if (rest > 0 && this.exitAge < this.exitS) {
      const h = Math.min(this.exitS - this.exitAge, rest);
      // Mean speed over this slice of the ramp (midpoint), so the exit is the same at any frame rate.
      const m = smooth01((this.exitAge + h * 0.5) / this.exitS);
      world += h * (this.slow + (1 - this.slow) * m);
      this.exitAge += h;
      rest -= h;
    }
    return world + rest;
  }

  get active(): boolean {
    return this.left > 0;
  }

  /**
   * A new release cuts a stop still holding, with no exit ramp (review fix,
   * round 2): the player's input never waits on a stop. A 50–83 ms stop held
   * a release's body 100 ms after its last key in lab-stress (gate 50 ms).
   */
  cut(): void {
    this.left = 0;
    this.exitAge = this.exitS;
  }

  reset(): void {
    this.left = 0;
    this.exitAge = this.exitS;
  }
}

/**
 * The lab's impact lights: a few point lights, each dying down on its own
 * (×e^(−7 dt), the kit's rate). A flash near a lit light (≤ `nearM`) feeds
 * that light where it is; a flash elsewhere takes the dimmest light, so a lit
 * spot never jumps across the field while it is still bright. Held 1.4 m
 * toward the camera like the kit's (a point light on a surface blows it out).
 * Low: one light (the kit's count); medium two; high and ultra three.
 */
export class FlashLights {
  private readonly lights: THREE.PointLight[] = [];
  private readonly anchor: THREE.Vector3[] = [];
  private readonly fresh: boolean[];
  private readonly tmp = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    count: number,
    private readonly nearM = 2.5,
  ) {
    this.fresh = new Array<boolean>(count).fill(false);
    for (let i = 0; i < count; i += 1) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      parent.add(l);
      this.lights.push(l);
      this.anchor.push(new THREE.Vector3(1e6, 0, 0));
    }
  }

  /**
   * `fresh` draws a light at full strength on the frame it is asked (VFX_STANDARD.md §3.1 rule 5): its first update
   * does not age it. Existing callers keep false and the original decay.
   */
  flash(at: THREE.Vector3, camera: THREE.Vector3, colour: THREE.ColorRepresentation, intensity: number, fresh = false): void {
    if (this.lights.length === 0) return;
    let pick = -1;
    let best = Infinity;
    for (let i = 0; i < this.lights.length; i += 1) {
      const d = this.anchor[i]!.distanceTo(at);
      if (this.lights[i]!.intensity > 0.05 && d <= this.nearM && d < best) {
        best = d;
        pick = i;
      }
    }
    if (pick < 0) {
      let dim = Infinity;
      for (let i = 0; i < this.lights.length; i += 1) {
        if (this.lights[i]!.intensity < dim) {
          dim = this.lights[i]!.intensity;
          pick = i;
        }
      }
      this.anchor[pick]!.copy(at);
      this.lights[pick]!.position.copy(at).add(this.tmp.subVectors(camera, at).setLength(1.4));
      this.lights[pick]!.color.set(colour);
    }
    const l = this.lights[pick]!;
    l.intensity = Math.max(l.intensity, Math.min(12, intensity));
    if (fresh) this.fresh[pick] = true;
  }

  update(dt: number): void {
    const k = Math.exp(-7 * dt);
    for (let i = 0; i < this.lights.length; i += 1) {
      if (this.fresh[i]) {
        this.fresh[i] = false;
        continue;
      }
      const l = this.lights[i]!;
      l.intensity = l.intensity * k < 0.01 ? 0 : l.intensity * k;
    }
  }

  reset(): void {
    for (const l of this.lights) l.intensity = 0;
    this.fresh.fill(false);
  }

  /** Lab-only readback, in creation order. */
  levels(): number[] {
    return this.lights.map((l) => l.intensity);
  }
}
