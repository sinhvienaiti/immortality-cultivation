/**
 * Dev-only stand-in beasts for the skills lab (never shipped): the reuse rule
 * (owner 01/11, MONSTER_MODEL_INVENTORY.md) gives us Tripo originals of other
 * games until Tu Tiên's own beasts pass their gate: Dragonhold's blight-wolf
 * (Phong Lang) and tusk-boar (Thiết Giáp Trư), Wordwoven's kamaitachi (Thạch
 * Thử). One InstancedMesh per species. Implements the skills' TargetField.
 * Reactions (round 2, MOTION_PLAN; judges: "beasts do not react"): a hit
 * flashes the body in the blow's colour, kicks it back on a critically damped
 * spring (out in ~80 ms, home in ~0.4 s: never a one-frame push), tips it
 * away from the blow on an underdamped spring and squashes it a little; a
 * death dissolves the body through a noise mask with a glowing edge in the
 * killer's colour (VFX_STANDARD §3.3 "tan có viền"), no shrink; K5's vortex
 * (`pull`) draws the beasts in its zone toward its heart in a swirl, the dying
 * ones lifted into it as they dissolve; a respawn dissolves in from the
 * ground with a cool edge and rises (no teleport, no pop). Allocates nothing
 * per frame.
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
/** Knockback: a critically damped spring (rad/s): an impulse peaks after 1/ω (~80 ms) and is home in ~0.4 s. */
const KNOCK_W = 12;
/** Stagger tilt: an underdamped spring (rad/s, ζ): it tips away from the blow, overshoots once and settles. */
const TILT_W = 15;
const TILT_Z = 0.45;
/** A death dissolves over this time (s); a respawn dissolves in over SPAWN_S, rising from SPAWN_SINK m down. */
const DIE_S = 0.6;
const SPAWN_S = 0.5;
const SPAWN_SINK = 0.25;
/** Gone this long (s) before a dead slot respawns. */
const GONE_S = 2.5;
/** The respawn's edge colour (linear, HDR: only the thin edge blooms). */
const SPAWN_EDGE = [0.6, 1.1, 1.5] as const;

/** Per-instance dissolve: the vertex passes its threshold, edge colour and model-space point to the fragment. */
const DISSOLVE_VERT_PARS = "attribute float iDissolve;\nattribute vec3 iEdge;\nvarying float vDissolve;\nvarying vec3 vEdge;\nvarying vec3 vDisP;\n";
const DISSOLVE_VERT = "#include <begin_vertex>\n\tvDissolve = iDissolve;\n\tvEdge = iEdge;\n\tvDisP = position;";
const DISSOLVE_FRAG_PARS = `varying float vDissolve;
varying vec3 vEdge;
varying vec3 vDisP;
float labHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float labNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(labHash3(i), labHash3(i + vec3(1.0, 0.0, 0.0)), u.x), mix(labHash3(i + vec3(0.0, 1.0, 0.0)), labHash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(labHash3(i + vec3(0.0, 0.0, 1.0)), labHash3(i + vec3(1.0, 0.0, 1.0)), u.x), mix(labHash3(i + vec3(0.0, 1.0, 1.0)), labHash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
float labDissolveN() { return labNoise3(vDisP * 4.0) * 0.65 + labNoise3(vDisP * 11.0 + 3.1) * 0.35; }
`;
/** Discard below the threshold (−0.05 at 0: nothing; 1.05 at 1: all). */
const DISSOLVE_DISCARD = "\tfloat labDn = labDissolveN();\n\tfloat labTh = vDissolve * 1.1 - 0.05;\n\tif ( vDissolve > 0.0 && labDn < labTh ) discard;";

export class LabHerd implements TargetField {
  readonly size = MAX;
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly dissolveAttr: THREE.InstancedBufferAttribute[] = [];
  private readonly edgeAttr: THREE.InstancedBufferAttribute[] = [];
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
  /** Knockback offset and its velocity (critically damped spring to 0). */
  private readonly rx = new Float32Array(MAX);
  private readonly rz = new Float32Array(MAX);
  private readonly rvx = new Float32Array(MAX);
  private readonly rvz = new Float32Array(MAX);
  /** Stagger tilt (rad) and its rate, about the ground axis (ax, az) ⟂ the last blow. */
  private readonly tilt = new Float32Array(MAX);
  private readonly tiltV = new Float32Array(MAX);
  private readonly ax = new Float32Array(MAX);
  private readonly az = new Float32Array(MAX);
  /** > 0 while dying (s since the killing blow); the slot then waits `gone` s and respawns. */
  private readonly dying = new Float32Array(MAX);
  private readonly gone = new Float32Array(MAX); // > 0 until respawn
  /** ≥ 0 while dissolving in after a respawn (s); −1 none. */
  private readonly spawn = new Float32Array(MAX).fill(-1);
  /** March: ≥ 0 while dissolving out at the heart before going back to the gate (s); −1 none. */
  private readonly leave = new Float32Array(MAX).fill(-1);
  private readonly live = new Uint8Array(MAX);
  private readonly tint = new Int32Array(MAX);
  /** Caught by the running vortex (1), and its lift as it dissolves. */
  private readonly caught = new Uint8Array(MAX);
  /** Dissolve and lift as last drawn, and as they stood at the killing blow (a death starts from them). */
  private readonly shownDis = new Float32Array(MAX);
  private readonly shownLift = new Float32Array(MAX);
  private readonly die0 = new Float32Array(MAX);
  private readonly lift0 = new Float32Array(MAX);
  private readonly vortex = { on: false, x: 0, z: 0, r: 0, t: 0, until: 0 };
  private count = 0;
  private mode: HerdMode = "still";
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qt = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
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
      const n = Math.max(1, perSpecies[k]!);
      const dis = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      const edge = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      dis.setUsage(THREE.DynamicDrawUsage);
      edge.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("iDissolve", dis);
      geometry.setAttribute("iEdge", edge);
      const material = (Array.isArray(src.material) ? src.material[0]! : src.material) as THREE.MeshStandardMaterial;
      LabHerd.dissolvable(material);
      const inst = new THREE.InstancedMesh(geometry, material, n);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      // The shadow dissolves with the body (the default depth material knows nothing of the mask).
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      LabHerd.dissolvableDepth(depth);
      inst.customDepthMaterial = depth;
      this.meshes[k] = inst;
      this.dissolveAttr[k] = dis;
      this.edgeAttr[k] = edge;
      this.group.add(inst);
    }
    this.update(0);
  }

  /** The species' own material, with the per-instance noise dissolve and its glowing edge (emissive, HDR only on the thin edge). */
  private static dissolvable(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = DISSOLVE_VERT_PARS + shader.vertexShader.replace("#include <begin_vertex>", DISSOLVE_VERT);
      shader.fragmentShader =
        DISSOLVE_FRAG_PARS +
        shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + DISSOLVE_DISCARD)
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n\tif ( vDissolve > 0.0 ) totalEmissiveRadiance += vEdge * ( 1.0 - smoothstep( 0.0, 0.09, labDn - labTh ) );",
          );
    };
    material.customProgramCacheKey = () => "lab-herd-dissolve";
    material.needsUpdate = true;
  }

  private static dissolvableDepth(material: THREE.MeshDepthMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = DISSOLVE_VERT_PARS + shader.vertexShader.replace("#include <begin_vertex>", DISSOLVE_VERT);
      shader.fragmentShader = DISSOLVE_FRAG_PARS + shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + DISSOLVE_DISCARD);
    };
    material.customProgramCacheKey = () => "lab-herd-dissolve-depth";
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
      this.spawn[i] = -1;
      this.leave[i] = -1;
      this.flash[i] = 0;
      this.rx[i] = this.rz[i] = this.rvx[i] = this.rvz[i] = 0;
      this.tilt[i] = this.tiltV[i] = 0;
      this.caught[i] = 0;
      this.shownDis[i] = this.shownLift[i] = 0;
    }
    this.vortex.on = false;
  }

  /** K5's vortex: the beasts within `r` of (x, z) now are drawn toward it in a swirl for `seconds` (eased in and out). */
  pull(x: number, z: number, r: number, seconds: number): void {
    const v = this.vortex;
    v.on = true;
    v.x = x;
    v.z = z;
    v.r = r;
    v.t = 0;
    v.until = seconds;
    for (let i = 0; i < this.count; i += 1) {
      const dx = this.px[i]! - x;
      const dz = this.pz[i]! - z;
      this.caught[i] = this.live[i] === 1 && dx * dx + dz * dz <= (r + 0.5) * (r + 0.5) ? 1 : 0;
    }
  }

  /** A beast dissolving out at the heart (march) is no target: it reappears at the gate (review fix). */
  alive(i: number): boolean {
    return i >= 0 && i < this.count && this.live[i] === 1 && this.dying[i] === 0 && this.leave[i]! < 0;
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
    // A velocity impulse on the knockback spring: the body is thrown back over ~80 ms and eases home (no one-frame push).
    const push = 0.12 + 0.35 * power * (this.tier(i) >= 2 ? 0.4 : 1);
    const v = push * KNOCK_W * Math.E;
    this.rvx[i] = this.rvx[i]! + dx * v;
    this.rvz[i] = this.rvz[i]! + dz * v;
    // Tip away from the blow: the axis ⟂ the blow on the ground, an angular kick on the tilt spring.
    this.ax[i] = dz;
    this.az[i] = -dx;
    this.tiltV[i] = this.tiltV[i]! + (0.18 + 0.3 * power) * TILT_W * (this.tier(i) >= 2 ? 0.6 : 1);
    this.hp[i] = this.hp[i]! - (power >= 0.9 ? 3 : power >= 0.5 ? 2 : 1);
    if (this.hp[i]! <= 0) {
      this.dying[i] = 1e-4;
      // Killed while still dissolving in (or out): the death goes on from what is shown, and the spawn or
      // leave stops for good (it used to snap the body back whole, then resume the leave after the respawn).
      this.die0[i] = this.shownDis[i]!;
      this.lift0[i] = this.shownLift[i]!;
      this.spawn[i] = -1;
      this.leave[i] = -1;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.time += dt;
    const vx = this.vortex;
    let pullK = 0;
    if (vx.on) {
      vx.t += dt;
      // Eased in over 0.3 s, out over the last 0.4 s.
      const a = Math.min(1, vx.t / 0.3);
      const b = Math.min(1, Math.max(0, (vx.until - vx.t) / 0.4));
      pullK = a * a * (3 - 2 * a) * (b * b * (3 - 2 * b));
      if (vx.t >= vx.until) {
        vx.on = false;
        // A caught beast still dissolving keeps its lift to the end (dropping it fell ~0.4 m in a frame).
        for (let i = 0; i < this.count; i += 1) if (this.dying[i] === 0) this.caught[i] = 0;
      }
    }
    for (let i = 0; i < this.count; i += 1) {
      const k = this.sp[i]!;
      const mesh = this.meshes[k];
      if (!mesh) continue;
      const idx = this.slot[i]!;
      const dis = this.dissolveAttr[k]!;
      const edge = this.edgeAttr[k]!;
      if (this.gone[i]! > 0) {
        this.gone[i] = this.gone[i]! - dt;
        mesh.setMatrixAt(idx, this.zero);
        if (this.gone[i]! <= 0) {
          // Back at its home (or the gate), dissolving in from the ground.
          this.gone[i] = 0;
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]!;
          this.hp[i] = SPECIES[k]!.hp;
          this.live[i] = 1;
          this.spawn[i] = 0;
          this.rx[i] = this.rz[i] = this.rvx[i] = this.rvz[i] = 0;
          this.tilt[i] = this.tiltV[i] = 0;
          this.flash[i] = 0;
        } else {
          continue;
        }
      }
      let lift = 0;
      let dissolve = 0;
      if (this.dying[i]! > 0) {
        this.dying[i] = this.dying[i]! + dt;
        const u = Math.min(1, this.dying[i]! / DIE_S);
        const e = u * u * (3 - 2 * u);
        const d0 = this.die0[i]!;
        dissolve = d0 + (1 - d0) * e;
        lift = this.lift0[i]! * (1 - e) + (this.caught[i] === 1 ? 0.35 : -0.08) * e;
        const tc = (this.tint[i]! >> 16) & 255;
        const tg = (this.tint[i]! >> 8) & 255;
        const tb = this.tint[i]! & 255;
        edge.setXYZ(idx, (tc / 255) * 2.4, (tg / 255) * 2.4, (tb / 255) * 2.4);
        if (u >= 1) {
          this.dying[i] = 0;
          this.live[i] = 0;
          this.caught[i] = 0;
          this.gone[i] = GONE_S;
          dis.setX(idx, 1);
          mesh.setMatrixAt(idx, this.zero);
          continue;
        }
      } else if (this.spawn[i]! >= 0) {
        this.spawn[i] = this.spawn[i]! + dt;
        const u = Math.min(1, this.spawn[i]! / SPAWN_S);
        const e = u * u * (3 - 2 * u);
        dissolve = 1 - e;
        lift = -SPAWN_SINK * (1 - e);
        edge.setXYZ(idx, SPAWN_EDGE[0], SPAWN_EDGE[1], SPAWN_EDGE[2]);
        if (u >= 1) this.spawn[i] = -1;
      } else if (this.leave[i]! >= 0) {
        // March: dissolving out at the heart, then back to the gate (it used to teleport there).
        this.leave[i] = this.leave[i]! + dt;
        const u = Math.min(1, this.leave[i]! / 0.4);
        dissolve = u * u * (3 - 2 * u);
        edge.setXYZ(idx, SPAWN_EDGE[0], SPAWN_EDGE[1], SPAWN_EDGE[2]);
        if (u >= 1) {
          this.leave[i] = -1;
          this.px[i] = this.hx[i]!;
          this.pz[i] = this.hz[i]! - 4;
          this.spawn[i] = 0;
          dissolve = 1;
        }
      }
      if (this.mode === "march" && this.dying[i] === 0 && this.leave[i]! < 0) {
        const dx = 0 - this.px[i]!;
        const dz = 1 - this.pz[i]!;
        const d = Math.hypot(dx, dz);
        if (d < 2.5) {
          if (this.spawn[i]! < 0) this.leave[i] = 0;
        } else {
          const spd = (k === 2 ? 1.6 : k === 1 ? 1.0 : 1.3) * dt;
          this.px[i] = this.px[i]! + (dx / d) * spd;
          this.pz[i] = this.pz[i]! + (dz / d) * spd;
          this.yaw[i] = Math.atan2(-dz, dx);
        }
      }
      // The vortex: caught beasts are drawn in and swirled round its heart; the dying ones harder.
      if (pullK > 0 && this.caught[i] === 1) {
        const dx = vx.x - this.px[i]!;
        const dz = vx.z - this.pz[i]!;
        const d = Math.hypot(dx, dz);
        if (d > 0.35) {
          const inward = (this.dying[i]! > 0 ? 2.6 : 1.1) * Math.min(1, d / 2) * pullK;
          const swirl = 1.4 * Math.min(1, d / 3) * pullK;
          const mx = (dx / d) * inward + (-dz / d) * swirl;
          const mz = (dz / d) * inward + (dx / d) * swirl;
          this.px[i] = this.px[i]! + mx * dt;
          this.pz[i] = this.pz[i]! + mz * dt;
          // Turn toward the way it is dragged, damped (half-life 0.15 s), the short way round.
          const want = Math.atan2(-mz, mx);
          let dy = want - this.yaw[i]!;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this.yaw[i] = this.yaw[i]! + dy * (1 - Math.pow(2, -dt / 0.15));
        }
      }
      // Knockback: critically damped spring to 0, sub-stepped at ≤ 1/240 s (the same at any frame rate).
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      const w2 = KNOCK_W * KNOCK_W;
      const tw2 = TILT_W * TILT_W;
      for (let s = 0; s < steps; s += 1) {
        this.rvx[i] = this.rvx[i]! + (-w2 * this.rx[i]! - 2 * KNOCK_W * this.rvx[i]!) * h;
        this.rvz[i] = this.rvz[i]! + (-w2 * this.rz[i]! - 2 * KNOCK_W * this.rvz[i]!) * h;
        this.rx[i] = this.rx[i]! + this.rvx[i]! * h;
        this.rz[i] = this.rz[i]! + this.rvz[i]! * h;
        this.tiltV[i] = this.tiltV[i]! + (-tw2 * this.tilt[i]! - 2 * TILT_Z * TILT_W * this.tiltV[i]!) * h;
        this.tilt[i] = this.tilt[i]! + this.tiltV[i]! * h;
      }
      const bob = this.mode === "march" ? Math.abs(Math.sin(this.time * 9 + i)) * 0.05 : Math.sin(this.time * 1.7 + i) * 0.01;
      // A waddle while marching: a slight roll on the step.
      const roll = this.mode === "march" ? Math.sin(this.time * 9 + i) * 0.05 : 0;
      this.e.set(roll, this.yaw[i]!, 0);
      this.q.setFromEuler(this.e);
      // Stagger: tip about the ground axis ⟂ the blow (applied in world space, before the yaw).
      const tl = this.tilt[i]!;
      if (Math.abs(tl) > 1e-4) {
        this.axis.set(this.ax[i]!, 0, this.az[i]!);
        if (this.axis.lengthSq() > 1e-8) {
          this.axis.normalize();
          this.qt.setFromAxisAngle(this.axis, tl);
          this.q.premultiply(this.qt);
        }
      }
      // A hit squashes the body a little for a few frames (volume kept).
      const f = this.flash[i]!;
      const sq = 0.09 * f * f;
      this.shownDis[i] = dissolve;
      this.shownLift[i] = lift;
      this.p.set(this.x(i), lift + bob, this.z(i));
      this.s.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(idx, this.m);
      dis.setX(idx, dissolve);
      // Hit flash: the blow's colour for a few frames, then back to the model's own.
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
    for (let k = 0; k < this.meshes.length; k += 1) {
      const mesh = this.meshes[k]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.dissolveAttr[k]!.needsUpdate = true;
      this.edgeAttr[k]!.needsUpdate = true;
    }
  }
}
