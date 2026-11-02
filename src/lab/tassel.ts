/**
 * The sword's tassel (kiếm tuệ) in the skills lab (dev-only, never built;
 * WEAPON_DESIGN §2 rule 7: "the tassel is the accent of motion: the hero
 * weapon has one"): a short silk cord through one jade bead, a small knot and
 * a fan of indigo-to-pale-blue silk strands, hanging from the pommel.
 *
 * Motion: a small local spring chain of our own (position-based Verlet at a
 * fixed 120 Hz, the springs.ts way: no package, tests/boundary.test.ts). The
 * top point is pinned to the pommel and moves along the pommel's path inside
 * each frame, so walking, turning and swings swing it; air drag, gravity, a
 * soft bend that keeps the cord from folding over, a ground plane and a speed
 * cap keep it calm. It runs on world time: a hit-stop freezes it with the
 * world (no steps while the world crawls, the pin still follows the hand), and
 * a jump of the pommel past `TELEPORT_M` (a reset, a teleport) re-hangs it.
 *
 * Drawn as camera-facing strips (cord, strands) in one mesh with vertex
 * colours, and the bead as a small jade sphere; `retract` (0..1) draws the
 * strands and cord back into the pommel while the sword is out of the hand.
 * No allocation per frame.
 */
import * as THREE from "three";

/** Points along the chain: pin, cord, bead, knot, two silk joints, silk end. */
const N = 7;
const STEP = 1 / 120;
const MAX_STEPS = 6;
const ITER = 4;
const TELEPORT_M = 0.6;
/** Silk strands round the chain's lower part, and samples along each. */
const STRANDS = 14;
const SAMPLES = 7;
/** Cord samples (pin → knot). */
const CORD = 4;
const GRAVITY = 9.8;
/** Air drag (1/s): silk settles in ~0.6 s after a swing. */
const DRAG = 3.2;
/** Most a point may move in one step (m): ~19 m/s, past any swing, so a bad frame never throws it. */
const MAX_STEP_M = 0.16;

export interface TasselStyle {
  readonly cord: string;
  readonly bead: string;
  readonly silkTop: string;
  readonly silkEnd: string;
  readonly lengthM: number;
}

export class Tassel {
  readonly group = new THREE.Group();
  private readonly strip: THREE.Mesh;
  private readonly bead: THREE.Mesh;
  private readonly knot: THREE.Mesh;
  /** Chain state: positions now and last step (xyz per point). */
  private readonly p = new Float32Array(N * 3);
  private readonly q = new Float32Array(N * 3);
  private readonly rest = new Float32Array(N - 1);
  private total = 1;
  /** The pin at the last step and this frame's goal. */
  private readonly pin0 = new THREE.Vector3();
  private readonly pin1 = new THREE.Vector3();
  private acc = 0;
  private ready = false;
  private time = 0;
  /** The pommel's speed (m/s, eased): the silk flutters more when it moves. */
  private speed = 0;
  /** Shown share of the length (1 hanging, 0 drawn into the pommel). */
  retract = 0;
  /**
   * Checks for the lab (__lab.hand()): the end's farthest reach from the pin over the rest length (≤ 1 + the
   * constraint's slack), its fastest move in one frame (m) and the frame it was seen; reset with resetStats.
   */
  readonly stats = { maxReach: 0, maxStepM: 0, maxPinStepM: 0, steps: 0, maxStrandExcessM: 0 };
  /** Each strand's end as drawn last frame (the strand check: how much more a strand's end moved than the chain's end). */
  private readonly strandEnd = new Float32Array(STRANDS * 3);
  private haveStrands = false;
  /** Last frame's end step (m), for the strand check. */
  private endStep = 0;
  /**
   * The spread's frame round the silk's axis, carried from frame to frame (parallel transport): a fixed reference
   * vector swapped at |d.y| = 0.9 turned every strand round the axis at once when the silk swung past ~26°
   * (review 03/11/2026).
   */
  private readonly frameS = new THREE.Vector3();
  private haveFrame = false;
  private readonly lastEnd = new THREE.Vector3();
  private readonly lastPin = new THREE.Vector3();
  private haveEnd = false;

  resetStats(): void {
    this.stats.maxReach = 0;
    this.stats.maxStepM = 0;
    this.stats.maxPinStepM = 0;
    this.stats.steps = 0;
    this.stats.maxStrandExcessM = 0;
    this.haveEnd = false;
    this.haveStrands = false;
  }
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly cordCol = new THREE.Color();
  private readonly topCol = new THREE.Color();
  private readonly endCol = new THREE.Color();
  private readonly cam = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  /** Per strand: angle round the chain, its share of the spread, its flutter phase. */
  private readonly strandA = new Float32Array(STRANDS);
  private readonly strandR = new Float32Array(STRANDS);
  private readonly strandPh = new Float32Array(STRANDS);
  /** A point along the chain's lower part (knot → end), by share t. */
  private readonly sample = new THREE.Vector3();

  constructor(style: TasselStyle) {
    // Lengths: pin → cord → bead → knot → silk (the silk is about 60 % of the length).
    const L = style.lengthM;
    const segs = [0.11, 0.1, 0.09, 0.24, 0.23, 0.23];
    for (let i = 0; i < N - 1; i += 1) this.rest[i] = segs[i]! * L;
    this.total = L;
    this.cordCol.set(style.cord).convertSRGBToLinear();
    this.topCol.set(style.silkTop).convertSRGBToLinear();
    this.endCol.set(style.silkEnd).convertSRGBToLinear();
    for (let k = 0; k < STRANDS; k += 1) {
      // Golden-angle spread: no two strands share a side; the middle ones hang closer.
      this.strandA[k] = k * 2.39996;
      this.strandR[k] = 0.35 + 0.65 * ((k * 0.61803) % 1);
      this.strandPh[k] = k * 1.7;
    }
    const verts = (CORD + STRANDS * SAMPLES) * 2;
    this.positions = new Float32Array(verts * 3);
    this.normals = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 3);
    const index: number[] = [];
    const quads = (first: number, n: number): void => {
      for (let i = 0; i < n - 1; i += 1) {
        const v = (first + i) * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    };
    quads(0, CORD);
    for (let k = 0; k < STRANDS; k += 1) quads(CORD + k * SAMPLES, SAMPLES);
    const g = new THREE.BufferGeometry();
    g.setIndex(index);
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry = g;
    // Silk: a soft sheen (low roughness, no metal), lit by the scene; both faces.
    // A faint sheen of its own (pale blue, ≤ 0.1) keeps the silk readable in the shade of the body.
    const sheen = new THREE.Color(style.silkEnd);
    this.strip = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.1, emissive: sheen, emissiveIntensity: 0.08 }));
    this.strip.frustumCulled = false;
    this.strip.castShadow = false;
    // The jade bead and a small silver knot cap over the silk.
    const beadCol = new THREE.Color(style.bead);
    this.bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.055 * L, 16, 12),
      new THREE.MeshStandardMaterial({ color: beadCol, roughness: 0.18, metalness: 0, emissive: beadCol, emissiveIntensity: 0.12, envMapIntensity: 1.3 }),
    );
    this.knot = new THREE.Mesh(new THREE.SphereGeometry(0.04 * L, 12, 8), new THREE.MeshStandardMaterial({ color: "#dfe3ea", roughness: 0.3, metalness: 1, envMapIntensity: 1.2 }));
    this.knot.scale.set(1, 0.7, 1);
    this.bead.frustumCulled = this.knot.frustumCulled = false;
    this.group.add(this.strip, this.bead, this.knot);
    this.group.name = "tassel";
  }

  /** The next update hangs it straight down from the pin (a reset or a new weapon). */
  invalidate(): void {
    this.ready = false;
  }

  /** The jade bead's emissive (≤ 0.9 a channel with its colour): soft, follows the sword's jade glow. */
  setBeadGlow(k: number): void {
    (this.bead.material as THREE.MeshStandardMaterial).emissiveIntensity = k;
  }

  private hang(pin: THREE.Vector3): void {
    let y = pin.y;
    for (let i = 0; i < N; i += 1) {
      if (i > 0) y -= this.rest[i - 1]!;
      this.p[i * 3] = this.q[i * 3] = pin.x;
      this.p[i * 3 + 1] = this.q[i * 3 + 1] = y;
      this.p[i * 3 + 2] = this.q[i * 3 + 2] = pin.z;
    }
    this.pin0.copy(pin);
    this.acc = 0;
    this.speed = 0;
    this.ready = true;
    this.haveEnd = false;
    this.haveStrands = false;
    this.haveFrame = false;
  }

  /**
   * `pin`: the pommel's end (world) this frame; `dt`: world seconds (a
   * hit-stop shrinks them); `camera` for the strips' facing.
   */
  update(pin: THREE.Vector3, dt: number, camera: THREE.Camera): void {
    if (!this.ready || pin.distanceTo(this.pin0) > TELEPORT_M) this.hang(pin);
    this.pin1.copy(pin);
    this.time += dt;
    const moved = this.pin0.distanceTo(this.pin1);
    if (dt > 1e-5) this.speed += (moved / dt - this.speed) * (1 - Math.exp(-dt / 0.12));
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    const steps = Math.floor(this.acc / STEP + 1e-9);
    const startX = this.pin0.x;
    const startY = this.pin0.y;
    const startZ = this.pin0.z;
    for (let k = 0; k < steps; k += 1) {
      this.acc -= STEP;
      // The pin moves along its path inside the frame (no jerk of a whole frame's motion on one step).
      const f = (k + 1) / steps;
      this.step(startX + (pin.x - startX) * f, startY + (pin.y - startY) * f, startZ + (pin.z - startZ) * f);
    }
    if (steps > 0) {
      this.pin0.copy(pin);
    } else {
      // No step this frame (a hit-stop crawls the world): the hand still moves a little, so the tassel goes
      // with it rigidly (positions and last positions alike: no velocity, nothing to release after the stop).
      const cx = pin.x - this.pin0.x;
      const cy = pin.y - this.pin0.y;
      const cz = pin.z - this.pin0.z;
      for (let i = 1; i < N; i += 1) {
        const o = i * 3;
        this.p[o] = this.p[o]! + cx;
        this.p[o + 1] = this.p[o + 1]! + cy;
        this.p[o + 2] = this.p[o + 2]! + cz;
        this.q[o] = this.q[o]! + cx;
        this.q[o + 1] = this.q[o + 1]! + cy;
        this.q[o + 2] = this.q[o + 2]! + cz;
      }
      this.pin0.copy(pin);
    }
    this.stats.steps += steps;
    // The pin always sits on the pommel as drawn (in a hit-stop the hand still holds the cord).
    this.p[0] = pin.x;
    this.p[1] = pin.y;
    this.p[2] = pin.z;
    const e = (N - 1) * 3;
    const reach = Math.hypot(this.p[e]! - pin.x, this.p[e + 1]! - pin.y, this.p[e + 2]! - pin.z) / this.total;
    if (reach > this.stats.maxReach) this.stats.maxReach = reach;
    this.endStep = 0;
    if (this.haveEnd) {
      const step = Math.hypot(this.p[e]! - this.lastEnd.x, this.p[e + 1]! - this.lastEnd.y, this.p[e + 2]! - this.lastEnd.z);
      this.endStep = step;
      if (step > this.stats.maxStepM) this.stats.maxStepM = step;
      const ps = pin.distanceTo(this.lastPin);
      if (ps > this.stats.maxPinStepM) this.stats.maxPinStepM = ps;
    }
    this.lastEnd.set(this.p[e]!, this.p[e + 1]!, this.p[e + 2]!);
    this.lastPin.copy(pin);
    this.haveEnd = true;
    this.draw(camera);
  }

  private step(px: number, py: number, pz: number): void {
    const p = this.p;
    const q = this.q;
    const damp = Math.exp(-DRAG * STEP);
    const g = GRAVITY * STEP * STEP;
    for (let i = 1; i < N; i += 1) {
      const o = i * 3;
      let vx = (p[o]! - q[o]!) * damp;
      let vy = (p[o + 1]! - q[o + 1]!) * damp - g;
      let vz = (p[o + 2]! - q[o + 2]!) * damp;
      const l = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (l > MAX_STEP_M) {
        const k = MAX_STEP_M / l;
        vx *= k;
        vy *= k;
        vz *= k;
      }
      q[o] = p[o]!;
      q[o + 1] = p[o + 1]!;
      q[o + 2] = p[o + 2]!;
      p[o] = p[o]! + vx;
      p[o + 1] = p[o + 1]! + vy;
      p[o + 2] = p[o + 2]! + vz;
    }
    p[0] = q[0] = px;
    p[1] = q[1] = py;
    p[2] = q[2] = pz;
    for (let it = 0; it < ITER; it += 1) {
      for (let i = 0; i < N - 1; i += 1) {
        const a = i * 3;
        const b = a + 3;
        const dx = p[b]! - p[a]!;
        const dy = p[b + 1]! - p[a + 1]!;
        const dz = p[b + 2]! - p[a + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - this.rest[i]!) / d;
        // The pin does not move; elsewhere both ends share the correction.
        const wa = i === 0 ? 0 : 0.5;
        const wb = i === 0 ? 1 : 0.5;
        p[a] = p[a]! + dx * diff * wa;
        p[a + 1] = p[a + 1]! + dy * diff * wa;
        p[a + 2] = p[a + 2]! + dz * diff * wa;
        p[b] = p[b]! - dx * diff * wb;
        p[b + 1] = p[b + 1]! - dy * diff * wb;
        p[b + 2] = p[b + 2]! - dz * diff * wb;
      }
      // A soft bend: each point pulled a little toward the line of its neighbours (no sharp fold at the bead).
      for (let i = 1; i < N - 1; i += 1) {
        const a = (i - 1) * 3;
        const o = i * 3;
        const b = (i + 1) * 3;
        const k = i < 3 ? 0.12 : 0.05;
        p[o] = p[o]! + ((p[a]! + p[b]!) * 0.5 - p[o]!) * k;
        p[o + 1] = p[o + 1]! + ((p[a + 1]! + p[b + 1]!) * 0.5 - p[o + 1]!) * k;
        p[o + 2] = p[o + 2]! + ((p[a + 2]! + p[b + 2]!) * 0.5 - p[o + 2]!) * k;
      }
      // The paving.
      for (let i = 1; i < N; i += 1) if (p[i * 3 + 1]! < 0.015) p[i * 3 + 1] = 0.015;
    }
    // Last, follow the leader from the pin: every segment exactly its length (the relaxation above leaves some
    // stretch when the hand whips round; this never lets the silk grow, and the lost motion is damping).
    for (let i = 1; i < N; i += 1) {
      const a = (i - 1) * 3;
      const o = i * 3;
      const dx = p[o]! - p[a]!;
      const dy = p[o + 1]! - p[a + 1]!;
      const dz = p[o + 2]! - p[a + 2]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = d > 1e-6 ? this.rest[i - 1]! / d : 0;
      p[o] = d > 1e-6 ? p[a]! + dx * k : p[a]!;
      p[o + 1] = d > 1e-6 ? p[a + 1]! + dy * k : p[a + 1]! - this.rest[i - 1]!;
      p[o + 2] = d > 1e-6 ? p[a + 2]! + dz * k : p[a + 2]!;
    }
  }

  /** Point `i` drawn `retract` of the way into the pin. */
  private at(i: number, out: THREE.Vector3): THREE.Vector3 {
    const k = 1 - this.retract;
    const p = this.p;
    return out.set(p[0]! + (p[i * 3]! - p[0]!) * k, p[1]! + (p[i * 3 + 1]! - p[1]!) * k, p[2]! + (p[i * 3 + 2]! - p[2]!) * k);
  }

  /** The silk's centre line at share t (0 the knot, 1 the end), linear between chain points 3..6. */
  private silkAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    const x = 3 + Math.min(0.9999, Math.max(0, t)) * (N - 1 - 3);
    const i = Math.floor(x);
    const f = x - i;
    this.at(i, this.a);
    this.at(i + 1, this.b);
    return out.copy(this.a).lerp(this.b, f);
  }

  /** One vertex pair of a strip at `c` along `dir`, `half` wide, coloured `col`. */
  private pair(v: number, c: THREE.Vector3, dir: THREE.Vector3, half: number, col: THREE.Color): void {
    this.w.subVectors(this.cam, c);
    this.s.crossVectors(dir, this.w);
    if (this.s.lengthSq() < 1e-12) this.s.set(1, 0, 0);
    this.s.normalize();
    // Normal: toward the camera across the strip (the silk's face).
    this.u.crossVectors(this.s, dir).normalize();
    if (this.u.dot(this.w) < 0) this.u.negate();
    for (let side = 0; side < 2; side += 1) {
      const o = (v + side) * 3;
      const k = side === 0 ? half : -half;
      this.positions[o] = c.x + this.s.x * k;
      this.positions[o + 1] = c.y + this.s.y * k;
      this.positions[o + 2] = c.z + this.s.z * k;
      this.normals[o] = this.u.x;
      this.normals[o + 1] = this.u.y;
      this.normals[o + 2] = this.u.z;
      this.colors[o] = col.r;
      this.colors[o + 1] = col.g;
      this.colors[o + 2] = col.b;
    }
  }

  private readonly col = new THREE.Color();

  private draw(camera: THREE.Camera): void {
    camera.getWorldPosition(this.cam);
    const L = this.rest[0]! + this.rest[1]! + this.rest[2]! + this.rest[3]! + this.rest[4]! + this.rest[5]!;
    const shown = 1 - this.retract;
    // Cord: pin → knot (points 0..3).
    for (let i = 0; i < CORD; i += 1) {
      this.at(i, this.a);
      this.at(Math.min(N - 1, i + 1), this.b);
      if (i > 0) this.at(i - 1, this.d);
      else this.d.copy(this.a);
      this.b.sub(this.d).normalize();
      this.pair(i * 2, this.a, this.b, 0.012 * L * shown + 1e-4, this.cordCol);
    }
    // Bead on point 2, knot on point 3.
    this.at(2, this.a);
    this.bead.position.copy(this.a);
    this.bead.scale.setScalar(Math.max(1e-3, shown));
    this.at(3, this.a);
    this.knot.position.copy(this.a);
    this.knot.scale.set(Math.max(1e-3, shown), 0.7 * Math.max(1e-3, shown), Math.max(1e-3, shown));
    // Silk strands: they fan out from the knot, each flutters on its own phase, more as the pommel moves.
    this.silkAt(0, this.a);
    this.silkAt(1, this.b);
    this.d.subVectors(this.b, this.a);
    if (this.d.lengthSq() < 1e-10) this.d.set(0, -1, 0);
    this.d.normalize();
    // A frame round the silk's axis for the spread: last frame's, turned onto the new axis (parallel transport);
    // a fresh one only on the first frame or if the axis swung onto it.
    this.s.copy(this.frameS).addScaledVector(this.d, -this.frameS.dot(this.d));
    if (!this.haveFrame || this.s.lengthSq() < 1e-6) {
      this.u.set(1, 0, 0);
      if (Math.abs(this.d.x) > 0.9) this.u.set(0, 0, 1);
      this.s.crossVectors(this.d, this.u);
    }
    this.s.normalize();
    this.frameS.copy(this.s);
    this.haveFrame = true;
    this.u.crossVectors(this.s, this.d).normalize();
    const sx = this.s.x;
    const sy = this.s.y;
    const sz = this.s.z;
    const ux = this.u.x;
    const uy = this.u.y;
    const uz = this.u.z;
    const flutter = Math.min(1, 0.25 + this.speed * 0.35);
    const spreadEnd = 0.1 * L * shown;
    for (let k = 0; k < STRANDS; k += 1) {
      const ang = this.strandA[k]!;
      const r = this.strandR[k]!;
      const ph = this.strandPh[k]!;
      const first = CORD + k * SAMPLES;
      for (let j = 0; j < SAMPLES; j += 1) {
        const t = j / (SAMPLES - 1);
        this.silkAt(t, this.sample);
        const spread = (0.02 * L + spreadEnd * t) * r * (j === 0 ? 0.3 : 1);
        const wob = flutter * 0.03 * L * t * t * Math.sin(this.time * 7.5 + ph + t * 4);
        const a = ang + wob * 6;
        const ca = Math.cos(a) * spread + wob;
        const sa = Math.sin(a) * spread;
        this.sample.x += sx * ca + ux * sa;
        this.sample.y += sy * ca + uy * sa;
        this.sample.z += sz * ca + uz * sa;
        // Direction along the strand: the silk's axis (the per-strand bend is small).
        this.col.copy(this.topCol).lerp(this.endCol, Math.min(1, t * 1.15));
        this.pair((first + j) * 2, this.sample, this.d, (0.024 * L * (1 - 0.5 * t) + 0.006 * L) * shown + 1e-4, this.col);
      }
      // The strand check: its end's step beyond the chain end's (a whole-fan turn shows here).
      const se = this.strandEnd;
      const o = k * 3;
      if (this.haveStrands && this.retract === 0) {
        const step = Math.hypot(this.sample.x - se[o]!, this.sample.y - se[o + 1]!, this.sample.z - se[o + 2]!) - this.endStep;
        if (step > this.stats.maxStrandExcessM) this.stats.maxStrandExcessM = step;
      }
      se[o] = this.sample.x;
      se[o + 1] = this.sample.y;
      se[o + 2] = this.sample.z;
    }
    this.haveStrands = true;
    const g = this.geometry;
    g.getAttribute("position").needsUpdate = true;
    g.getAttribute("normal").needsUpdate = true;
    g.getAttribute("color").needsUpdate = true;
    this.group.visible = shown > 0.01;
  }
}
