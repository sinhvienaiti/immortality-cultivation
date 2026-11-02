/**
 * Vạn Kiếm Triều Tông · Ten-Thousand Sword Convergence (萬劍朝宗), the
 * field-wide prototype of the power pass (canon D58 (2); POWER_RESEARCH.md
 * "Chiêu cả sân mẫu", direction A "Celestial Sword River"). The four readable
 * states: the sky changes, the swords gather, each sword picks its prey, one
 * stroke ends it. Round 2 (both blind judges: "a heap of glowing sticks, one
 * mint colour, no hero swords, no hot cores, no ground light") gives the
 * river a hierarchy of three sizes and two tones:
 * - LEAD blades: the 8 swords that leave the hand on F0 are the weapon's full
 *   model; after their first strike they rise into the river growing to 6.4 m
 *   (3.7× a river sword), with a white-gold core along the blade, a saturated
 *   jade or cyan rim and long tapered ribbon trails; they ride the river's
 *   crest, dive one at a time on the gravest prey (elites, the king), and take
 *   the middle of the final stroke.
 * - MID streams: the river's swords (320 on High, the swarm LOD) flow in five
 *   braided lanes along the river's curve at 5–7 m/s with motion trails,
 *   jade and cyan bodies with white-gold cores, brighter in waves running down
 *   the stream; a hunt batch peels off the river where it passes nearest its
 *   prey, as one sheaf bending one way.
 * - Fine glitter: gold and white glints shed along the river and the dives.
 * - Lit ground pools under the river, under every strike and along the cut.
 * Timeline at 60 Hz from the last key (F0):
 * - F0: 8 lead blades leave the hand for the nearest threats (strike ~F15).
 * - F1–20: the world darkens (the host) and a jade seam opens across the sky.
 * - F4–30: 64 seeds rise from the field; the rest of the river fades in.
 * - F30–168: the hunt: every 100 ms 14–20 river swords turn their tips to their
 *   prey (a faint lock thread shows the choice), dive on a curve, strike, fade
 *   and come back upstream; every 0.3 s a lead blade dives on the gravest prey.
 *   Targets are held by reservation (2 swords a small beast, 5 an elite, 10 the
 *   king; retarget on death; 18 % pick another beast near the best).
 * - F168–192: everything left climbs, spirals once and lines up into one huge
 *   diagonal stroke, the lead blades in its middle row.
 * - F192: the stroke slams down; its light sweeps out both ways over the field
 *   in 0.2 s (small beasts struck twice, elites and the king three times), the
 *   host's ultimate-strength finisher; a scar and a lit seam stay on the ground.
 * - F192–207: the river folds into a point above the hero and is gone.
 * Colours: Clear Wind's jade and cyan bodies, white-gold cores, a touch of gold
 * (no violet). Halos stay ≤ 0.9 a channel, only thin cores are HDR. View only:
 * the sim owns damage; the host turns `struck` into its hit events. No
 * allocation per frame.
 */
import * as THREE from "three";
import { BladeSet, loadBladeGeometry, loadWeaponModel } from "./blades";
import { BeamPool, Rand, RibbonPool, smooth01, SpritePool } from "./fxkit";
import type { TargetField } from "./targets";
import type { WeaponDef } from "./weapons";

export type VanKiemRole = "primary" | "secondary" | "finisher";
export type VanKiemPhase = "open" | "hunt" | "gather" | "hush" | "climax" | "close" | "end";

export interface VanKiemHost {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly targets: TargetField;
  caster(out: { x: number; z: number; fx: number; fz: number }): void;
  hand(out: THREE.Vector3): void;
  /** A sword struck `target` from (dx, dz); `killed` as the field said; `power` ≥ 0.9 a lead blade or the cut. */
  struck(target: number, dx: number, dz: number, power: number, role: VanKiemRole, killed: boolean): void;
  /** The skill's timeline: the host answers with screen effects and sound on this frame. */
  phase(p: VanKiemPhase): void;
  /** A sword passing near the hero (the 8–12 nearest get fly-by sounds). */
  flyby(x: number, y: number, z: number, speed: number): void;
  flash(at: THREE.Vector3, colour: string, intensity: number): void;
}

export interface VanKiemTextures {
  readonly glow: THREE.Texture;
  readonly slash: THREE.Texture;
  readonly star: THREE.Texture;
  /** A thin ring (ground marks of the strikes) and an ink stain (the cut's scorched scar). */
  readonly ring: THREE.Texture;
  readonly scorch: THREE.Texture;
  /** A soft noise (the lead blades' ribbon trails erode with it). */
  readonly noise: THREE.Texture;
}

/** River size per tier (canon §20.2's sword pool: 150 / 300 / 500; this skill takes 120 / 200 / 320). */
export const VAN_KIEM_SWORDS = { low: 120, medium: 200, high: 320, ultra: 320 } as const;
const HERO_N = 8;
const SEEDS = 64;
/** Sword length (m) in the river, the lead blades leaving the hand, and the lead blades in the river (3.7×). */
const SWORD_M = 1.75;
const HERO_M = 1.9;
const LEAD_M = 6.4;

/** Timeline (s) at 60 Hz. */
const TICK = 1 / 60;
const T_SEAM = 1 * TICK;
const T_SEEDS = 4 * TICK;
const T_FILL = 12 * TICK;
const T_FULL = 30 * TICK;
const T_HUNT = 30 * TICK;
const T_HUNT_END = 168 * TICK;
const T_GATHER = 168 * TICK;
const T_FIN = 192 * TICK;
const T_FOLD_END = 207 * TICK;
const T_DONE = 230 * TICK;
const BATCH_S = 0.1;
/** Swords a hunt batch sends (a third fewer than round 1's 30–40: a readable sheaf, not a heap). */
const BATCH_MIN = 14;
const BATCH_SPAN = 7;
const AIM_S = 0.12;
const WOUND_S = 0.06;
const FADE_S = 0.12;
const SWEEP_S = 0.2;
/** How far the cut's light runs out each way (m): past every beast of the field. */
const SWEEP_R = 18;
/** A lead blade rises from its wound into the crest over this (s), and one dives every LEAD_EVERY s of the hunt. */
const LEAD_RISE_S = 0.42;
const LEAD_EVERY = 0.3;
/** River flow (share of the river a second): mid swords and the lead blades on the crest. */
const FLOW_MIN = 0.13;
const FLOW_MAX = 0.18;
const LEAD_FLOW = 0.15;
/** The river's five braided lanes: across (m) and up (m). */
const LANES = 5;
const LANE_W = 1.45;

/** Reservation caps by size class (TargetField.tier): swarm/small 2, elite 5, king 10. */
const CAP_SMALL = 2;
const CAP_ELITE = 5;
const CAP_KING = 10;
/** The Trận Tâm (gate threat grows toward it). */
const HEART_X = 0;
const HEART_Z = 0;

/** Sword states. */
const S_OFF = 0;
const S_SEED = 1;
const S_RIVER = 2;
const S_AIM = 3;
const S_DIVE = 4;
const S_WOUND = 5;
const S_FADE = 6;
const S_GATHER = 7;
const S_STROKE = 8;
const S_FOLD = 9;
/** A lead blade rising from its wound into the crest, and riding it. */
const S_RISE = 10;
const S_LEAD = 11;

/** Clear Wind's light (linear): jade, cyan, silver, gold bodies (halos ≤ 0.9); the white-gold core (HDR in the shaders). */
const JADE = [0.08, 0.78, 0.5] as const;
const CYAN = [0.06, 0.55, 0.95] as const;
const SILVER = [0.66, 0.8, 0.9] as const;
const GOLD = [0.98, 0.76, 0.32] as const;
const CORE = [1.0, 0.9, 0.66] as const;
/** The number tint and flash colour hosts read (linear jade-cyan, sRGB hex). */
export const VAN_KIEM_COLOUR = [0.3, 0.86, 0.74] as const;
/** A silver flash with a breath of jade (a green full-screen wash read sickly at 17 %). */
export const VAN_KIEM_FLASH = "#eafcf4";

// ── Light strips: one camera-facing strip per sword, head → tail, one instanced draw per kind ──

const STRIP_VERTEX = /* glsl */ `
attribute vec4 iHead; // xyz, width (m)
attribute vec4 iTail; // xyz, alpha
attribute vec3 iCol;
uniform float uTaper;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 h = iHead.xyz;
  vec3 t = iTail.xyz;
  vec3 axis = t - h;
  float len = max(length(axis), 1e-4);
  vec3 ax = axis / len;
  vec3 mid = (h + t) * 0.5;
  vec3 view = normalize(cameraPosition - mid);
  vec3 side = cross(ax, view);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  // position.x in [-0.5, 0.5] across, position.y in [-0.5, 0.5] head → tail.
  float along = position.y + 0.5;
  vec3 p = h + axis * along + side * position.x * iHead.w * mix(1.0, uTaper, along);
  vUv = vec2(position.x + 0.5, along);
  vCol = iCol;
  vA = iTail.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

/** A mid sword's motion trail: its body colour falling off to deep teal, a thin white-gold core near the head. */
const TAIL_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.3, 1.0, across);
  float core = 1.0 - smoothstep(0.0, 0.2, across);
  // Clamped before pow(): under MSAA (Ultra) an edge pixel is shaded past the card, vUv.y > 1, and pow of a
  // negative base is NaN, which the bloom spread into black blocks.
  float y = clamp(vUv.y, 0.0, 1.0);
  float fade = pow(1.0 - y, 1.3);
  float head = 1.0 - smoothstep(0.0, 0.32, y);
  vec3 body = mix(vCol, vec3(0.015, 0.2, 0.24), smoothstep(0.15, 1.0, y));
  // Halo ≤ 0.9 in the sword's colour; a thin HDR core near the head only (it alone blooms).
  vec3 c = body * soft * fade * 0.8 + uCore * core * head * 2.9;
  gl_FragColor = vec4(c * vA, 1.0);
}`;

/** A lead blade's aura along the blade (head at the guard, tail at the tip): a white-hot core, a saturated rim. */
const AURA_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float y = clamp(vUv.y, 0.0, 1.0);
  float ends = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.82, 1.0, y));
  float rim = 1.0 - smoothstep(0.3, 1.0, across);
  float core = 1.0 - smoothstep(0.0, 0.14, across);
  vec3 c = vCol * rim * rim * 0.75 * ends + uCore * core * ends * 3.4;
  gl_FragColor = vec4(c * vA, 1.0);
}`;

class StripCards {
  readonly mesh: THREE.Mesh;
  private readonly head: Float32Array;
  private readonly tail: Float32Array;
  private readonly col: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  /** One upload range per attribute, reused (addUpdateRange makes an object a call). */
  private readonly ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];
  private n = 0;

  constructor(readonly capacity: number, fragment: string, taper: number, renderOrder: number) {
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    this.head = new Float32Array(capacity * 4);
    this.tail = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 3);
    this.attrs = [new THREE.InstancedBufferAttribute(this.head, 4), new THREE.InstancedBufferAttribute(this.tail, 4), new THREE.InstancedBufferAttribute(this.col, 3)];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iHead", this.attrs[0]!);
    g.setAttribute("iTail", this.attrs[1]!);
    g.setAttribute("iCol", this.attrs[2]!);
    g.instanceCount = 0;
    this.geometry = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: STRIP_VERTEX,
      fragmentShader: fragment,
      uniforms: { uCore: { value: new THREE.Vector3(CORE[0], CORE[1], CORE[2]) }, uTaper: { value: taper } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  push(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, width: number, alpha: number, r: number, g: number, b: number): void {
    if (this.n >= this.capacity || alpha <= 0.002) return;
    const i = this.n;
    const o = i * 4;
    this.head[o] = hx;
    this.head[o + 1] = hy;
    this.head[o + 2] = hz;
    this.head[o + 3] = width;
    this.tail[o] = tx;
    this.tail[o + 1] = ty;
    this.tail[o + 2] = tz;
    this.tail[o + 3] = alpha;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.n += 1;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (let k = 0; k < 3; k += 1) {
      const a = this.attrs[k]!;
      const r = this.ranges[k]!;
      r.count = Math.max(1, this.n) * a.itemSize;
      a.updateRanges.length = 0;
      a.updateRanges.push(r);
      a.needsUpdate = true;
    }
  }
}

export class VanKiemFx {
  readonly blades: BladeSet;
  private readonly tails: StripCards;
  private readonly auras: StripCards;
  private readonly ribbons: RibbonPool;
  private readonly river: SpritePool;
  private readonly hits: SpritePool;
  private readonly stars: SpritePool;
  private readonly glitter: SpritePool;
  private readonly beams: BeamPool;
  /** Ground: a jade ring where each sword lands, lit pools (under the river, the strikes and the cut), the cut's ink scar. */
  private readonly marks: SpritePool;
  private readonly pools: SpritePool;
  private readonly scar: SpritePool;
  private readonly rand = new Rand(7717);
  private readonly n: number;
  private readonly cap: number;
  // Per sword (structure of arrays).
  private readonly st: Uint8Array;
  private readonly age: Float32Array;
  private readonly dur: Float32Array;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  private readonly dz: Float32Array;
  private readonly sc: Float32Array;
  /** Shown length (m): a lead blade grows from HERO_M to LEAD_M as it rises. */
  private readonly lenM: Float32Array;
  private readonly lenFrom: Float32Array;
  private readonly u: Float32Array;
  private readonly lat: Float32Array;
  private readonly hgt: Float32Array;
  private readonly flow: Float32Array;
  private readonly lane: Uint8Array;
  private readonly ax: Float32Array; // path start
  private readonly ay: Float32Array;
  private readonly az: Float32Array;
  private readonly cx: Float32Array; // control offset (curve)
  private readonly cy: Float32Array;
  private readonly cz: Float32Array;
  private readonly bx: Float32Array; // path end (stroke slot, fold point)
  private readonly by: Float32Array;
  private readonly bz: Float32Array;
  private readonly tgt: Int16Array;
  private readonly hue: Uint8Array; // 0 jade, 1 cyan, 2 silver, 3 gold
  private readonly flown: Uint8Array;
  private reserved: Int16Array;
  private readonly score: Float32Array;
  // Timeline.
  private active = false;
  private t = 0;
  private batchAcc = 0;
  private leadAcc = 0;
  private leadNext = 0;
  private seedLeft = 0;
  private fillLeft = 0;
  private sweepT = -1;
  /** The finisher's first blow has landed (it carries the "finisher" role; the rest of the sweep is secondary). */
  private finHit = false;
  private readonly sweepHit: Uint8Array;
  private readonly c = { x: 0, z: 0, fx: 0, fz: -1 };
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  /** The stroke line (ground xz) and its sweep normal. */
  private readonly s0 = { x: -16, z: -13 };
  private readonly s1 = { x: 16, z: 0 };
  private sweepNx = 0;
  private sweepNz = 0;
  private flybys = 0;
  /**
   * This frame's turn shares: 0.45 (a sword following its motion), 0.3 (settling along the stroke) and 0.35 (the
   * plunge) per 60 Hz frame, turned into rates on the world step, so 120 Hz turns as 60 Hz does and a hit-stop holds.
   */
  private kMove = 0.45;
  private kSettle = 0.3;
  private kPlunge = 0.35;
  /** Glitter owed (a rate, the same at any frame rate). */
  private glintAcc = 0;
  /** Strikes and dives so far in this cast (the perceived-strikes check) and the lead blades' dives. */
  strikes = 0;
  dives = 0;
  leadDives = 0;
  private weaponSeq = 0;

  constructor(
    private readonly host: VanKiemHost,
    tex: VanKiemTextures,
    swords: number,
  ) {
    this.n = Math.max(16, Math.min(500, Math.floor(swords)));
    this.cap = HERO_N + this.n;
    this.blades = new BladeSet(this.cap, 1, HERO_N);
    // A warm white rail whose glow each blade's tint colours: jade and cyan swords, white-gold lead blades.
    this.blades.setRail("#fff2d6", 0.8);
    this.blades.tintGlow();
    this.tails = new StripCards(this.cap, TAIL_FRAGMENT, 0.3, 12);
    this.auras = new StripCards(HERO_N, AURA_FRAGMENT, 0.28, 13);
    this.ribbons = new RibbonPool(HERO_N, 46, tex.noise, 12);
    this.river = new SpritePool(24, tex.glow, "add", "camera", 9, { pull: 0 });
    this.hits = new SpritePool(160, tex.slash, "add", "camera", 13);
    this.stars = new SpritePool(220, tex.star, "add", "camera", 14);
    this.glitter = new SpritePool(420, tex.star, "add", "camera", 14);
    this.beams = new BeamPool(160, 13);
    this.marks = new SpritePool(160, tex.ring, "add", "ground", 6, { twoSided: true });
    this.pools = new SpritePool(220, tex.glow, "add", "ground", 5, { crop: 0.8, twoSided: true });
    this.scar = new SpritePool(48, tex.scorch, "ink", "ground", 4, { fadeIn: 0.05, twoSided: true });
    host.layer.add(this.scar.mesh, this.pools.mesh, this.marks.mesh, this.river.mesh, this.blades.mesh, this.ribbons.mesh, this.tails.mesh, this.auras.mesh, this.beams.mesh, this.hits.mesh, this.stars.mesh, this.glitter.mesh);
    const N = this.cap;
    this.st = new Uint8Array(N);
    this.age = new Float32Array(N);
    this.dur = new Float32Array(N);
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.dx = new Float32Array(N);
    this.dy = new Float32Array(N);
    this.dz = new Float32Array(N);
    this.sc = new Float32Array(N);
    this.lenM = new Float32Array(N);
    this.lenFrom = new Float32Array(N);
    this.u = new Float32Array(N);
    this.lat = new Float32Array(N);
    this.hgt = new Float32Array(N);
    this.flow = new Float32Array(N);
    this.lane = new Uint8Array(N);
    this.ax = new Float32Array(N);
    this.ay = new Float32Array(N);
    this.az = new Float32Array(N);
    this.cx = new Float32Array(N);
    this.cy = new Float32Array(N);
    this.cz = new Float32Array(N);
    this.bx = new Float32Array(N);
    this.by = new Float32Array(N);
    this.bz = new Float32Array(N);
    this.tgt = new Int16Array(N).fill(-1);
    this.hue = new Uint8Array(N);
    this.flown = new Uint8Array(N);
    this.reserved = new Int16Array(host.targets.size);
    this.score = new Float32Array(host.targets.size);
    this.sweepHit = new Uint8Array(host.targets.size);
    for (let i = 0; i < N; i += 1) {
      const r = this.rand.next();
      // Two tones: jade and cyan bodies, a little silver and gold (lead blades alternate jade and cyan).
      this.hue[i] = i < HERO_N ? i % 2 : r < 0.46 ? 0 : r < 0.88 ? 1 : r < 0.95 ? 2 : 3;
      this.lane[i] = i % LANES;
      this.lenM[i] = i < HERO_N ? HERO_M : SWORD_M;
    }
    const dlx = this.s1.x - this.s0.x;
    const dlz = this.s1.z - this.s0.z;
    const l = Math.hypot(dlx, dlz);
    // The sweep runs from the far side toward the camera (+z).
    this.sweepNx = -dlz / l;
    this.sweepNz = dlx / l;
    if (this.sweepNz < 0) {
      this.sweepNx = -this.sweepNx;
      this.sweepNz = -this.sweepNz;
    }
  }

  /** The equipped weapon: the lead blades take its full model, the river its swarm LOD (D55). */
  async setWeapon(def: WeaponDef): Promise<void> {
    const seq = ++this.weaponSeq;
    const hero = await loadBladeGeometry(def.model, def.fit);
    const lod = def.swarm !== undefined && (await loadWeaponModel(def.swarm)) !== null ? await loadBladeGeometry(def.swarm, def.fit) : hero;
    if (seq === this.weaponSeq) this.blades.setGeometry(hero, lod);
  }

  get running(): boolean {
    return this.active;
  }

  /** The time since the cast (s), −1 when idle. */
  get clock(): number {
    return this.active ? this.t : -1;
  }

  /** The last key: the cast starts on this frame; the 8 lead blades leave now. */
  cast(): void {
    this.reset();
    this.active = true;
    this.t = 0;
    this.batchAcc = 0;
    this.leadAcc = 0;
    this.leadNext = 0;
    this.glintAcc = 0;
    this.seedLeft = SEEDS;
    this.fillLeft = this.n - SEEDS;
    this.strikes = 0;
    this.dives = 0;
    this.leadDives = 0;
    this.flybys = 0;
    this.host.caster(this.c);
    this.host.hand(this.v);
    this.rankTargets(1.6);
    for (let k = 0; k < HERO_N; k += 1) {
      const target = this.pick(false);
      if (target < 0) break;
      const i = k;
      this.st[i] = S_DIVE;
      this.age[i] = 0;
      this.dur[i] = 0.22 + 0.025 * k;
      this.px[i] = this.ax[i] = this.v.x;
      this.py[i] = this.ay[i] = this.v.y;
      this.pz[i] = this.az[i] = this.v.z;
      const side = (k % 2 === 0 ? 1 : -1) * (0.6 + 0.25 * k);
      this.cx[i] = -this.c.fz * side;
      this.cy[i] = 1.2 + 0.2 * k;
      this.cz[i] = this.c.fx * side;
      this.tgt[i] = target;
      this.sc[i] = 1;
      this.lenM[i] = HERO_M;
      this.flown[i] = 0;
      this.reserved[target] = this.reserved[target]! + 1;
      this.startRibbon(i, 0.5);
      this.host.flyby(this.v.x, this.v.y, this.v.z, 30);
    }
  }

  // ── The river ─────────────────────────────────────────────────────────────

  /** A point of the river: u 0 (south-west, low) → 1 (north-east, high), `lat` across (m), `h` up (m). */
  private riverAt(u: number, lat: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    // Low enough that the whole river stays in the play camera's frame (55°, the far edge near the top).
    const x = -19.5 + 39 * u;
    const z = -1 - 12 * u + Math.sin(u * Math.PI * 2.2) * 1.6;
    const y = 3.6 + 1.0 * u + Math.sin(u * Math.PI * 3.1 + 0.7) * 0.45;
    // Across: perpendicular to the main direction on the ground.
    const nx = 12 / 40.8;
    const nz = 39 / 40.8;
    // The river widens from a seam (F1) to ~7 m (F30).
    const wide = 0.15 + 0.85 * smooth01((this.t - T_SEAM) / (T_FULL - T_SEAM));
    return out.set(x + nx * lat * wide, y + h * wide, z + nz * lat * wide);
  }

  /** The lanes braid: a sword's place across the river at u (m) and its height (m). */
  private laneLat(i: number, u: number): number {
    const ln = this.lane[i]! - (LANES - 1) / 2;
    return ln * LANE_W + Math.sin(u * 9.0 - this.t * 1.7 + ln * 1.3) * 0.55 + this.lat[i]!;
  }

  private laneHgt(i: number, u: number): number {
    const ln = this.lane[i]! - (LANES - 1) / 2;
    return Math.cos(u * 7.0 - this.t * 1.3 + ln) * 0.35 + ln * 0.12 + this.hgt[i]!;
  }

  /** The stream's brightness at u: waves of light running down the river (0.45–1). */
  private brightAt(u: number): number {
    const w = 0.5 + 0.5 * Math.sin((u * 2.3 - this.t * 0.85) * Math.PI * 2);
    return 0.45 + 0.55 * w * w;
  }

  /** A sword joins the river at u (fades in). */
  private toRiver(i: number, u: number, fadeIn: boolean): void {
    this.st[i] = S_RIVER;
    this.age[i] = fadeIn ? 0 : 1;
    this.u[i] = u;
    this.lat[i] = this.rand.range(-0.3, 0.3);
    this.hgt[i] = this.rand.range(-0.25, 0.25);
    this.flow[i] = this.rand.range(FLOW_MIN, FLOW_MAX);
    this.tgt[i] = -1;
  }

  // ── Targeting ──────────────────────────────────────────────────────────────

  private capOf(i: number): number {
    const tier = this.host.targets.tier(i);
    return tier >= 4 ? CAP_KING : tier >= 2 ? CAP_ELITE : CAP_SMALL;
  }

  /** Scores every live beast once (a batch's priority list); `near` weights nearness to the hero. */
  private rankTargets(near: number): void {
    const T = this.host.targets;
    for (let i = 0; i < T.size; i += 1) {
      if (!T.alive(i)) {
        this.score[i] = -1e9;
        continue;
      }
      const hx = T.x(i) - HEART_X;
      const hz = T.z(i) - HEART_Z;
      const gate = Math.max(0, 1 - Math.hypot(hx, hz) / 24);
      const elite = T.tier(i) >= 2 ? 1 : 0;
      const px = T.x(i) - this.c.x;
      const pz = T.z(i) - this.c.z;
      const prox = Math.max(0, 1 - Math.hypot(px, pz) / 40);
      this.score[i] = gate * 2 + elite * 1.5 + prox * 0.8 * near;
    }
  }

  /** The best beast with room for one more sword (18 % of picks take another one near it); −1 if none. */
  private pick(scatter = true): number {
    const T = this.host.targets;
    let best = -1;
    let bestS = -1e8;
    for (let i = 0; i < T.size; i += 1) {
      if (this.score[i]! < -1e8) continue;
      const r = this.reserved[i]!;
      if (r >= this.capOf(i)) continue;
      const s = this.score[i]! - r * 0.6;
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    if (best >= 0 && scatter && this.rand.next() < 0.18) {
      const other = this.nearOther(best, 5);
      if (other >= 0) best = other;
    }
    return best;
  }

  /** The best beast with room within `r` of (x, z) (a batch's sheaf shares one area); −1 if none. */
  private pickNear(x: number, z: number, r: number): number {
    const T = this.host.targets;
    let best = -1;
    let bestS = -1e8;
    for (let i = 0; i < T.size; i += 1) {
      if (this.score[i]! < -1e8) continue;
      const res = this.reserved[i]!;
      if (res >= this.capOf(i)) continue;
      const ddx = T.x(i) - x;
      const ddz = T.z(i) - z;
      if (ddx * ddx + ddz * ddz > r * r) continue;
      const s = this.score[i]! - res * 0.6 + this.rand.next() * 0.3;
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    return best;
  }

  /** A live beast within `r` of beast `b` with room, other than `b`, at random among the first found. */
  private nearOther(b: number, r: number): number {
    const T = this.host.targets;
    const x = T.x(b);
    const z = T.z(b);
    const start = Math.floor(this.rand.next() * T.size);
    for (let k = 0; k < T.size; k += 1) {
      const i = (start + k) % T.size;
      if (i === b || !T.alive(i) || this.reserved[i]! >= this.capOf(i)) continue;
      const dx = T.x(i) - x;
      const dz = T.z(i) - z;
      if (dx * dx + dz * dz <= r * r) return i;
    }
    return -1;
  }

  /**
   * A batch of the hunt: 14–20 river swords turn to their prey. The batch's prey area is the best beast; its
   * swords peel off the river where it passes nearest that area (one sheaf), each taking a beast near it.
   */
  private batch(): void {
    this.rankTargets(1);
    const T = this.host.targets;
    const head = this.pick(true);
    if (head < 0) return;
    const ax = T.x(head);
    const az = T.z(head);
    const uT = Math.min(0.97, Math.max(0.03, (ax + 19.5) / 39));
    const want = BATCH_MIN + Math.floor(this.rand.next() * BATCH_SPAN);
    const bend = this.rand.next() < 0.5 ? -1 : 1;
    let got = 0;
    // The swords nearest uT first: widening windows of the river.
    for (let win = 0; win < 3 && got < want; win += 1) {
      const du = win === 0 ? 0.07 : win === 1 ? 0.14 : 0.3;
      const start = HERO_N + Math.floor(this.rand.next() * this.n);
      for (let k = 0; k < this.n && got < want; k += 1) {
        const i = HERO_N + ((start - HERO_N + k * 7) % this.n);
        if (this.st[i] !== S_RIVER || this.age[i]! < 0.15 || Math.abs(this.u[i]! - uT) > du) continue;
        let target = this.pickNear(ax, az, 5.5);
        if (target < 0) target = this.pick(true);
        if (target < 0) break;
        this.reserved[target] = this.reserved[target]! + 1;
        this.tgt[i] = target;
        this.st[i] = S_AIM;
        this.age[i] = 0;
        // The sheaf bends one way.
        this.cx[i] = bend * this.rand.range(1.2, 2.6);
        this.lockThread(i, target);
        got += 1;
      }
    }
    // Fly-bys: the dives nearest the hero this batch (at most 2 a batch, 12 a cast).
    for (let k = 0; k < 2 && this.flybys < 12; k += 1) {
      let bi = -1;
      let bd = 1e9;
      for (let i = HERO_N; i < this.cap; i += 1) {
        if (this.st[i] !== S_AIM || this.flown[i] === 1) continue;
        const t = this.tgt[i]!;
        const d = Math.hypot(T.x(t) - this.c.x, T.z(t) - this.c.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      if (bi < 0 || bd > 14) break;
      this.flown[bi] = 1;
      this.flybys += 1;
      this.host.flyby(this.px[bi]!, this.py[bi]!, this.pz[bi]!, 24);
    }
  }

  /** A lead blade on the crest dives on the gravest prey (elites and the king first). */
  private leadDive(): void {
    const T = this.host.targets;
    let lead = -1;
    for (let k = 0; k < HERO_N; k += 1) {
      const i = (this.leadNext + k) % HERO_N;
      if (this.st[i] === S_LEAD && this.age[i]! > 0.25) {
        lead = i;
        break;
      }
    }
    if (lead < 0) return;
    this.leadNext = (lead + 1) % HERO_N;
    this.rankTargets(0.6);
    let best = -1;
    let bestS = -1e8;
    for (let i = 0; i < T.size; i += 1) {
      if (this.score[i]! < -1e8 || this.reserved[i]! >= this.capOf(i)) continue;
      const s = this.score[i]! + (T.tier(i) >= 2 ? 2 : 0) - this.reserved[i]! * 0.4;
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    if (best < 0) return;
    this.reserved[best] = this.reserved[best]! + 1;
    this.tgt[lead] = best;
    this.leadDives += 1;
    this.dive(lead);
    // A high, decisive arc.
    this.cx[lead] = this.rand.range(-2, 2);
    this.cy[lead] = 3.2;
    this.cz[lead] = -1.5;
    this.dur[lead] = 0.34;
  }

  private lockThread(i: number, target: number): void {
    const T = this.host.targets;
    const tx = T.x(target);
    const ty = T.midY(target);
    const tz = T.z(target);
    const dx = tx - this.px[i]!;
    const dy = ty - this.py[i]!;
    const dz = tz - this.pz[i]!;
    const l = Math.hypot(dx, dy, dz) || 1;
    const b = this.beams.spec.reset();
    b.x = this.px[i]!;
    b.y = this.py[i]!;
    b.z = this.pz[i]!;
    b.dx = dx / l;
    b.dy = dy / l;
    b.dz = dz / l;
    b.len0 = b.len1 = l;
    b.grow = 0.06;
    b.w0 = 0.06;
    b.w1 = 0.025;
    b.life = AIM_S + 0.08;
    b.cr = CYAN[0] * 1.4;
    b.cg = CYAN[1] * 1.4;
    b.cb = CYAN[2] * 1.4;
    b.hr = JADE[0] * 0.3;
    b.hg = JADE[1] * 0.3;
    b.hb = JADE[2] * 0.3;
    b.fadeBase = 0.2;
    b.fadeTip = 0.2;
    this.beams.emit();
  }

  /** Starts sword i's dive from where it is to its target (a batch set its bend in cx). */
  private dive(i: number): void {
    this.dives += 1;
    this.st[i] = S_DIVE;
    this.age[i] = 0;
    this.ax[i] = this.px[i]!;
    this.ay[i] = this.py[i]!;
    this.az[i] = this.pz[i]!;
    // A curved dive: the control point bends sideways (the batch's way) and keeps some height.
    this.cy[i] = this.rand.range(0.6, 2.0);
    this.cz[i] = -this.cx[i]! * 0.4;
    const T = this.host.targets;
    const t = this.tgt[i]!;
    const d = Math.hypot(T.x(t) - this.px[i]!, T.midY(t) - this.py[i]!, T.z(t) - this.pz[i]!);
    this.dur[i] = Math.min(0.45, Math.max(0.24, d / 30));
  }

  /** A sword's prey died before it arrived: a live one near it with room, else −1. */
  private retarget(i: number): number {
    const T = this.host.targets;
    const old = this.tgt[i]!;
    if (old >= 0) this.reserved[old] = Math.max(0, this.reserved[old]! - 1);
    const n = old >= 0 ? T.nearest(this.bx[i]!, this.bz[i]!, 8) : -1;
    if (n >= 0 && this.reserved[n]! < this.capOf(n)) {
      this.reserved[n] = this.reserved[n]! + 1;
      return n;
    }
    return -1;
  }

  // ── Per frame ─────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.river.dropOneFrame();
    this.pools.dropOneFrame();
    this.tails.begin();
    this.auras.begin();
    if (this.active) this.step(dt);
    this.drawSwords();
    this.tails.end();
    this.auras.end();
    this.blades.sync();
    this.ribbons.update(dt, this.host.camera);
    this.river.update(dt);
    this.hits.update(dt);
    this.stars.update(dt);
    this.glitter.update(dt);
    this.beams.update(dt);
    this.marks.update(dt);
    this.pools.update(dt);
    this.scar.update(dt);
  }

  private step(dt: number): void {
    const t0 = this.t;
    this.t += dt;
    const t = this.t;
    const f = dt * 60;
    this.kMove = 1 - Math.pow(0.55, f);
    this.kSettle = 1 - Math.pow(0.7, f);
    this.kPlunge = 1 - Math.pow(0.65, f);
    if (t0 < T_SEAM && t >= T_SEAM) {
      this.host.phase("open");
      this.seam();
    }
    // Seeds rise from the field (F4–12); the rest of the river fades in along it (F12–30).
    if (t >= T_SEEDS && this.seedLeft > 0) {
      const due = Math.ceil(SEEDS * Math.min(1, (t - T_SEEDS) / (T_FILL - T_SEEDS)) - (SEEDS - this.seedLeft));
      for (let k = 0; k < due && this.seedLeft > 0; k += 1) this.seed(HERO_N + (SEEDS - this.seedLeft--));
    }
    if (t >= T_FILL && this.fillLeft > 0) {
      const total = this.n - SEEDS;
      const due = Math.ceil(total * Math.min(1, (t - T_FILL) / (T_FULL - T_FILL))) - (total - this.fillLeft);
      for (let k = 0; k < due && this.fillLeft > 0; k += 1) {
        const i = HERO_N + SEEDS + (total - this.fillLeft--);
        this.toRiver(i, this.rand.next(), true);
      }
    }
    if (t0 < T_HUNT && t >= T_HUNT) this.host.phase("hunt");
    if (t >= T_HUNT && t < T_HUNT_END) {
      this.batchAcc += dt;
      while (this.batchAcc >= BATCH_S) {
        this.batchAcc -= BATCH_S;
        this.batch();
      }
      this.leadAcc += dt;
      while (this.leadAcc >= LEAD_EVERY) {
        this.leadAcc -= LEAD_EVERY;
        this.leadDive();
      }
    }
    if (t0 < T_GATHER && t >= T_GATHER) {
      this.host.phase("gather");
      this.gather();
    }
    if (t0 < T_FIN - 3 * TICK && t >= T_FIN - 3 * TICK) this.host.phase("hush");
    if (t0 < T_FIN && t >= T_FIN) {
      this.sweepT = 0;
      this.sweepHit.fill(0);
      this.host.phase("climax");
      this.finisherBeam();
    }
    if (this.sweepT >= 0) this.sweep(dt);
    if (t0 < T_FOLD_END && t >= T_FOLD_END) this.host.phase("close");
    if (t >= T_DONE) {
      this.host.phase("end");
      this.active = false;
      for (let i = 0; i < this.cap; i += 1) {
        if (this.tgt[i]! >= 0) this.reserved[this.tgt[i]!] = 0;
        this.st[i] = S_OFF;
      }
      for (let k = 0; k < HERO_N; k += 1) this.ribbons.stop(k, 0.2);
    }
    for (let i = 0; i < this.cap; i += 1) if (this.st[i] !== S_OFF) this.stepSword(i, dt);
    this.riverLight(dt);
  }

  private seed(i: number): void {
    // From a point of the field (in front of the beasts), rising into the river over 0.3–0.45 s.
    this.st[i] = S_SEED;
    this.age[i] = 0;
    this.dur[i] = this.rand.range(0.3, 0.45);
    const x = this.rand.range(-17, 17);
    const z = this.rand.range(-15, 4);
    this.ax[i] = this.px[i] = x;
    this.ay[i] = this.py[i] = 0.2;
    this.az[i] = this.pz[i] = z;
    this.u[i] = Math.min(0.95, Math.max(0.05, (x + 19.5) / 39 + this.rand.range(-0.08, 0.08)));
    this.lat[i] = this.rand.range(-0.3, 0.3);
    this.hgt[i] = this.rand.range(-0.25, 0.25);
    this.flow[i] = this.rand.range(FLOW_MIN, FLOW_MAX);
    this.sc[i] = 0;
  }

  private gather(): void {
    // Every sword still in the sky lines up along the stroke, spiralling once on the way; the lead blades take the
    // middle row, evenly spaced.
    let k = 0;
    let total = 0;
    for (let i = HERO_N; i < this.cap; i += 1) if (this.st[i] === S_RIVER || this.st[i] === S_AIM) total += 1;
    for (let i = 0; i < this.cap; i += 1) {
      const lead = i < HERO_N;
      const s0 = this.st[i];
      if (lead ? s0 !== S_LEAD && s0 !== S_RISE && s0 !== S_DIVE && s0 !== S_WOUND : s0 !== S_RIVER && s0 !== S_AIM) continue;
      if (this.tgt[i]! >= 0) this.reserved[this.tgt[i]!] = Math.max(0, this.reserved[this.tgt[i]!]! - 1);
      this.tgt[i] = -1;
      this.st[i] = S_GATHER;
      this.age[i] = 0;
      this.dur[i] = (T_FIN - T_GATHER) * (lead ? 0.92 : this.rand.range(0.8, 1));
      this.ax[i] = this.px[i]!;
      this.ay[i] = this.py[i]!;
      this.az[i] = this.pz[i]!;
      // Three rows along the line: one huge sword-light stroke (the lead blades in the middle row, a little higher).
      const s = lead ? (i + 0.5) / HERO_N : total > 1 ? k / (total - 1) : 0.5;
      const row = lead ? 0 : (k % 3) - 1;
      this.bx[i] = this.s0.x + (this.s1.x - this.s0.x) * s + this.sweepNx * row * 0.45;
      // The lead blades a little higher than the river's rows, but low enough to stay in the play camera's frame.
      this.by[i] = lead ? 3.6 + s * 0.8 : 4 + row * 0.35 + s * 1.6;
      this.bz[i] = this.s0.z + (this.s1.z - this.s0.z) * s + this.sweepNz * row * 0.45;
      if (lead) {
        this.lenFrom[i] = this.lenM[i]!;
        // The trail eases out: the gather's spiral and the stroke read cleaner without it.
        this.ribbons.stop(i, 0.25);
      } else k += 1;
    }
  }

  private seam(): void {
    // A pale jade seam opens along the river (8 segments), widening as the river does.
    for (let k = 0; k < 8; k += 1) {
      this.riverAt(k / 8, 0, 0, this.v);
      this.riverAt((k + 1) / 8, 0, 0, this.w);
      const dx = this.w.x - this.v.x;
      const dy = this.w.y - this.v.y;
      const dz = this.w.z - this.v.z;
      const l = Math.hypot(dx, dy, dz);
      const b = this.beams.spec.reset();
      b.x = this.v.x;
      b.y = this.v.y;
      b.z = this.v.z;
      b.dx = dx / l;
      b.dy = dy / l;
      b.dz = dz / l;
      b.len0 = l * 1.05;
      b.len1 = l * 1.05;
      b.grow = 0.08 + 0.02 * k;
      b.w0 = 0.12;
      b.w1 = 1.1;
      b.life = 0.7;
      b.cr = CORE[0] * 3;
      b.cg = CORE[1] * 3;
      b.cb = CORE[2] * 3;
      b.hr = CYAN[0] * 0.8;
      b.hg = CYAN[1] * 0.8;
      b.hb = CYAN[2] * 0.8;
      b.fadeBase = 0.05;
      b.fadeTip = 0.05;
      this.beams.emit();
    }
  }

  /**
   * The river's light while it stands: a thin soft glow along it (one-frame cards), lit pools on the ground under
   * it that beat with the stream's waves, and glitter shed along it.
   */
  private riverLight(dt: number): void {
    const t = this.t;
    const on = smooth01((t - T_SEEDS) / 0.3) * (1 - smooth01((t - T_GATHER) / 0.25));
    if (on <= 0.01) return;
    for (let k = 0; k < 12; k += 1) {
      const u = (k + 0.5) / 12;
      this.riverAt(u, 0, 0, this.v);
      const s = this.river.spec.reset();
      s.x = this.v.x;
      s.y = this.v.y;
      s.z = this.v.z;
      s.life = 0;
      s.size0 = s.size1 = 6;
      const c = k % 2 === 0 ? CYAN : JADE;
      s.r = c[0] * 0.5;
      s.g = c[1] * 0.5;
      s.b = c[2] * 0.5;
      s.a = 0.1 * on;
      this.river.emit();
      // The pool it casts on the ground below, long along the river.
      const p = this.pools.spec.reset();
      p.x = this.v.x;
      p.y = 0.04;
      p.z = this.v.z;
      p.life = 0;
      p.size0 = p.size1 = 6.4;
      p.aspect = 1.9;
      p.rot = Math.atan2(12, 39) + Math.PI / 2;
      const b = this.brightAt(u);
      p.r = c[0] * 0.7 * b;
      p.g = c[1] * 0.7 * b;
      p.b = c[2] * 0.7 * b;
      p.a = on;
      this.pools.emit();
    }
    // Glitter: ~420 glints a second along the river, drifting with the stream and falling a little.
    this.glintAcc += 420 * on * dt;
    while (this.glintAcc >= 1) {
      this.glintAcc -= 1;
      const u = this.rand.next();
      this.riverAt(u, this.rand.range(-1, 1) * 3.6, this.rand.range(-0.8, 0.9), this.v);
      const g = this.glitter.spec.reset();
      g.x = this.v.x;
      g.y = this.v.y;
      g.z = this.v.z;
      g.vx = 39 * 0.15 * 0.6;
      g.vz = -12 * 0.15 * 0.6;
      g.vy = -0.6;
      g.life = this.rand.range(0.18, 0.4);
      g.size0 = this.rand.range(0.22, 0.38);
      g.size1 = 0.05;
      g.rot = this.rand.range(0, Math.PI);
      const gold = this.rand.next() < 0.6;
      const k = this.brightAt(u) * 3;
      g.r = (gold ? CORE[0] : CYAN[0] + 0.3) * k;
      g.g = (gold ? CORE[1] : CYAN[1] + 0.2) * k;
      g.b = (gold ? CORE[2] : CYAN[2]) * k;
      this.glitter.emit();
    }
  }

  private startRibbon(i: number, widthM: number): void {
    const c = this.hue[i] === 0 ? JADE : CYAN;
    this.ribbons.start(i, this.px[i]!, this.py[i]!, this.pz[i]!, widthM, CORE[0] * 2.6, CORE[1] * 2.6, CORE[2] * 2.6, 1, 0.08);
    this.ribbons.setRim(i, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
  }

  /** A lead blade's place on the crest: ahead of and above the stream, alternating sides. */
  private leadAt(i: number, u: number, out: THREE.Vector3): THREE.Vector3 {
    // Mostly on the river's near side and just over it, so the 6.4 m blades stay in the play camera's frame.
    const side = (i % 2 === 0 ? 1.7 : -0.5) + 0.45 * (i % 3);
    return this.riverAt(u, side, 0.9 + 0.3 * Math.sin(u * 8 + i), out);
  }

  private stepSword(i: number, dt: number): void {
    this.age[i] = this.age[i]! + dt;
    const a = this.age[i]!;
    const T = this.host.targets;
    switch (this.st[i]) {
      case S_SEED: {
        const k = Math.min(1, a / this.dur[i]!);
        const e = smooth01(k);
        this.riverAt(this.u[i]!, this.laneLat(i, this.u[i]!), this.laneHgt(i, this.u[i]!), this.v);
        // Up first, then into the river.
        const x = this.ax[i]! + (this.v.x - this.ax[i]!) * e;
        const y = this.ay[i]! + (this.v.y - this.ay[i]!) * Math.min(1, k * 1.6);
        const z = this.az[i]! + (this.v.z - this.az[i]!) * e;
        this.move(i, x, y, z);
        this.sc[i] = smooth01(a / 0.08);
        if (k >= 1) {
          this.st[i] = S_RIVER;
          this.age[i] = 1;
        }
        break;
      }
      case S_RIVER: {
        this.u[i] = this.u[i]! + this.flow[i]! * dt;
        if (this.u[i]! > 1.02) this.u[i] = this.u[i]! - 1.04;
        const u = this.u[i]!;
        this.riverAt(u, this.laneLat(i, u), this.laneHgt(i, u), this.v);
        this.move(i, this.v.x, this.v.y, this.v.z);
        // Fade in on joining; thin out at the river's two ends (no pop on the wrap).
        const ends = smooth01((u + 0.02) / 0.08) * smooth01((1.02 - u) / 0.08);
        this.sc[i] = smooth01(a / 0.15) * ends;
        break;
      }
      case S_AIM: {
        // Holds its place in the river while its tip turns to the prey.
        const t = this.tgt[i]!;
        if (t < 0 || !T.alive(t)) {
          const n = this.retarget(i);
          if (n < 0) {
            this.toRiver(i, this.u[i]!, false);
            break;
          }
          this.tgt[i] = n;
        }
        const tg = this.tgt[i]!;
        const dx = T.x(tg) - this.px[i]!;
        const dy = T.midY(tg) - this.py[i]!;
        const dz = T.z(tg) - this.pz[i]!;
        const l = Math.hypot(dx, dy, dz) || 1;
        const k = 1 - Math.pow(0.5, dt / 0.03);
        this.turn(i, dx / l, dy / l, dz / l, k);
        // A little pull-back before the dive (anticipation).
        this.px[i] = this.px[i]! - (dx / l) * 0.6 * dt;
        this.py[i] = this.py[i]! + 0.8 * dt;
        this.pz[i] = this.pz[i]! - (dz / l) * 0.6 * dt;
        this.sc[i] = 1;
        if (a >= AIM_S) this.dive(i);
        break;
      }
      case S_DIVE: {
        let t = this.tgt[i]!;
        if (t < 0 || !T.alive(t)) {
          t = this.retarget(i);
          this.tgt[i] = t;
          if (t < 0) {
            this.st[i] = i < HERO_N && this.t < T_GATHER ? S_RISE : S_FADE;
            this.age[i] = 0;
            if (i < HERO_N) this.riseFrom(i);
            break;
          }
        }
        this.bx[i] = T.x(t);
        this.by[i] = T.midY(t);
        this.bz[i] = T.z(t);
        const k = Math.min(1, a / this.dur[i]!);
        // Accelerating into the prey (ease in), on a quadratic curve bent by the control offset.
        const s = k * k * (2 - k) * 0.35 + k * k * 0.65;
        const mx = (this.ax[i]! + this.bx[i]!) * 0.5 + this.cx[i]!;
        const my = Math.max(this.ay[i]!, this.by[i]!) + this.cy[i]!;
        const mz = (this.az[i]! + this.bz[i]!) * 0.5 + this.cz[i]!;
        const o = 1 - s;
        const x = o * o * this.ax[i]! + 2 * o * s * mx + s * s * this.bx[i]!;
        const y = o * o * this.ay[i]! + 2 * o * s * my + s * s * this.by[i]!;
        const z = o * o * this.az[i]! + 2 * o * s * mz + s * s * this.bz[i]!;
        this.move(i, x, y, z);
        this.sc[i] = 1;
        // Glints shed from the diving head.
        if (this.rand.next() < 0.35 * dt * 60) this.glint(x, y, z, 0.8);
        if (k >= 1) this.strike(i, t, i < HERO_N ? "primary" : "secondary");
        break;
      }
      case S_WOUND: {
        this.sc[i] = 1;
        if (a >= WOUND_S) {
          if (i < HERO_N && this.t < T_GATHER) {
            this.st[i] = S_RISE;
            this.age[i] = 0;
            this.riseFrom(i);
          } else {
            this.st[i] = S_FADE;
            this.age[i] = 0;
          }
        }
        break;
      }
      case S_RISE: {
        // A lead blade climbs from its wound to the crest, growing to its river size on the way.
        const k = Math.min(1, a / LEAD_RISE_S);
        const e = smooth01(k);
        this.u[i] = this.u[i]! + LEAD_FLOW * dt;
        this.leadAt(i, this.u[i]!, this.v);
        const x = this.ax[i]! + (this.v.x - this.ax[i]!) * e;
        const y = this.ay[i]! + (this.v.y - this.ay[i]!) * Math.min(1, k * 1.5) + Math.sin(Math.PI * k) * 1.2;
        const z = this.az[i]! + (this.v.z - this.az[i]!) * e;
        this.move(i, x, y, z);
        this.lenM[i] = this.lenFrom[i]! + (LEAD_M - this.lenFrom[i]!) * e;
        this.sc[i] = 1;
        if (k >= 1) {
          this.st[i] = S_LEAD;
          this.age[i] = 0;
        }
        break;
      }
      case S_LEAD: {
        this.u[i] = this.u[i]! + LEAD_FLOW * dt;
        if (this.u[i]! > 1.04) this.u[i] = this.u[i]! - 1.08;
        const u = this.u[i]!;
        this.leadAt(i, u, this.v);
        this.move(i, this.v.x, this.v.y, this.v.z);
        // Dips into the river's ends (shrinks) instead of jumping back upstream in sight.
        this.sc[i] = smooth01((u + 0.04) / 0.1) * smooth01((1.04 - u) / 0.1);
        break;
      }
      case S_FADE: {
        this.sc[i] = 1 - smooth01(a / FADE_S);
        if (a >= FADE_S) {
          if (i < HERO_N || this.t >= T_GATHER) {
            this.st[i] = S_OFF;
            if (i < HERO_N) this.ribbons.stop(i, 0.15);
          } else this.toRiver(i, this.rand.range(0.05, 0.95), true);
        }
        break;
      }
      case S_GATHER: {
        const k = Math.min(1, a / this.dur[i]!);
        const e = smooth01(k);
        // One turn of a spiral about the straight path (radius 1.6 m at the middle).
        const ang = e * Math.PI * 2;
        const rad = (i < HERO_N ? 0.8 : 1.6) * Math.sin(Math.PI * e);
        const x = this.ax[i]! + (this.bx[i]! - this.ax[i]!) * e + Math.cos(ang) * rad;
        const y = this.ay[i]! + (this.by[i]! - this.ay[i]!) * e + 1.5 * Math.sin(Math.PI * e) + Math.sin(ang) * rad * 0.5;
        const z = this.az[i]! + (this.bz[i]! - this.az[i]!) * e;
        if (i < HERO_N) this.lenM[i] = this.lenFrom[i]! + (LEAD_M - this.lenFrom[i]!) * e;
        if (k < 0.92) this.move(i, x, y, z);
        else {
          // Settled: tip along the stroke.
          this.px[i] = x;
          this.py[i] = y;
          this.pz[i] = z;
          const l = Math.hypot(this.s1.x - this.s0.x, this.s1.z - this.s0.z);
          this.turn(i, (this.s1.x - this.s0.x) / l, -0.05, (this.s1.z - this.s0.z) / l, this.kSettle);
        }
        this.sc[i] = 1;
        if (k >= 1) {
          this.st[i] = S_STROKE;
          this.age[i] = 0;
          this.ax[i] = this.px[i]!;
          this.ay[i] = this.py[i]!;
          this.az[i] = this.pz[i]!;
        }
        break;
      }
      case S_STROKE: {
        // Waits for the sweep (sweep() moves it).
        this.sc[i] = 1;
        break;
      }
      case S_FOLD: {
        const k = Math.min(1, a / this.dur[i]!);
        const e = k * k;
        const x = this.ax[i]! + (this.bx[i]! - this.ax[i]!) * e;
        const y = this.ay[i]! + (this.by[i]! - this.ay[i]!) * e;
        const z = this.az[i]! + (this.bz[i]! - this.az[i]!) * e;
        this.move(i, x, y, z);
        this.sc[i] = 1 - smooth01((k - 0.5) / 0.5);
        if (k >= 1) {
          this.st[i] = S_OFF;
          if (i < HERO_N) this.ribbons.stop(i, 0.12);
        }
        break;
      }
    }
    // The lead blades' ribbon heads trail from the guard end.
    if (i < HERO_N && this.st[i] !== S_OFF) {
      const L = this.lenM[i]! * (0.55 + 0.45 * this.sc[i]!);
      this.ribbons.push(i, this.px[i]! - this.dx[i]! * L * 0.45, this.py[i]! - this.dy[i]! * L * 0.45, this.pz[i]! - this.dz[i]! * L * 0.45);
    }
  }

  /** A lead blade leaves its wound for the crest: it joins the river where the beast stood. */
  private riseFrom(i: number): void {
    this.ax[i] = this.px[i]!;
    this.ay[i] = this.py[i]!;
    this.az[i] = this.pz[i]!;
    this.u[i] = Math.min(0.9, Math.max(0.05, (this.px[i]! + 19.5) / 39));
    this.lenFrom[i] = this.lenM[i]!;
    this.tgt[i] = -1;
    if (!this.ribbons.isOn(i)) this.startRibbon(i, 1.3);
    else this.ribbons.setWidth(i, 1.3);
  }

  /** Moves sword i to (x, y, z), turning it along its motion (damped, so it never snaps). */
  private move(i: number, x: number, y: number, z: number): void {
    const dx = x - this.px[i]!;
    const dy = y - this.py[i]!;
    const dz = z - this.pz[i]!;
    const l = Math.hypot(dx, dy, dz);
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    if (l > 1e-4) this.turn(i, dx / l, dy / l, dz / l, this.kMove);
  }

  private turn(i: number, dx: number, dy: number, dz: number, k: number): void {
    let x = this.dx[i]! + (dx - this.dx[i]!) * k;
    let y = this.dy[i]! + (dy - this.dy[i]!) * k;
    let z = this.dz[i]! + (dz - this.dz[i]!) * k;
    const l = Math.hypot(x, y, z);
    if (l < 1e-4) {
      x = dx;
      y = dy;
      z = dz;
    } else {
      x /= l;
      y /= l;
      z /= l;
    }
    this.dx[i] = x;
    this.dy[i] = y;
    this.dz[i] = z;
  }

  /** Sword i reaches beast t: the blow, its slash and star, a lit pool, the wound. */
  private strike(i: number, t: number, role: VanKiemRole): void {
    const T = this.host.targets;
    this.reserved[t] = Math.max(0, this.reserved[t]! - 1);
    let dx = T.x(t) - this.ax[i]!;
    let dz = T.z(t) - this.az[i]!;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const lead = i < HERO_N;
    const big = lead && this.lenM[i]! > HERO_M + 0.5;
    this.impactAt(T.x(t), T.midY(t), T.z(t), dx, dz, big ? 2.4 : lead ? 1.4 : 1, this.hue[i]!);
    // A river sword takes one stand-in HP (TargetField.hit below power 0.5); a lead blade lands a heavy blow.
    const power = big ? 1.05 : lead ? 0.85 : 0.3;
    const killed = T.hit(t, dx, dz, power, 0x8ff0d2);
    this.strikes += 1;
    this.host.struck(t, dx, dz, power, role, killed);
    this.st[i] = S_WOUND;
    this.age[i] = 0;
    this.tgt[i] = -1;
    if (lead) {
      this.v.set(T.x(t), T.midY(t), T.z(t));
      this.host.flash(this.v, VAN_KIEM_FLASH, big ? 5 : 3);
      if (big) this.leadImpact(T.x(t), T.z(t));
    }
  }

  private impactAt(x: number, y: number, z: number, dx: number, dz: number, k: number, hue: number): void {
    const c = hue === 0 ? JADE : hue === 1 ? CYAN : hue === 2 ? SILVER : GOLD;
    // A sharp slash across the blow in the sword's colour, a white-gold star at its heart.
    const s = this.hits.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = 0.14;
    s.size0 = 1.5 * k;
    s.size1 = 1.9 * k;
    s.aspect = 0.55;
    s.rot = Math.atan2(-dz, dx) + Math.PI / 2 + this.rand.range(-0.35, 0.35);
    s.r = c[0] * 3.2;
    s.g = c[1] * 3.2;
    s.b = c[2] * 3.2;
    this.hits.emit();
    const r = this.stars.spec.reset();
    r.x = x;
    r.y = y;
    r.z = z;
    r.life = 0.09;
    r.size0 = 0.9 * k;
    r.size1 = 0.5 * k;
    r.rot = this.rand.range(0, Math.PI);
    r.r = CORE[0] * 3;
    r.g = CORE[1] * 3;
    r.b = CORE[2] * 3;
    this.stars.emit();
    // Sparks thrown along the blow.
    for (let n = 0; n < 2; n += 1) {
      const p = this.stars.spec.reset();
      p.x = x;
      p.y = y;
      p.z = z;
      const sp = this.rand.range(5, 9);
      const side = this.rand.range(-0.6, 0.6);
      p.vx = (dx - dz * side) * sp;
      p.vz = (dz + dx * side) * sp;
      p.vy = this.rand.range(1, 3);
      p.gravity = -6;
      p.drag = 3;
      p.stretch = 0.05;
      p.life = 0.22;
      p.size0 = 0.22 * k;
      p.size1 = 0.06;
      p.r = CORE[0] * 2.6;
      p.g = CORE[1] * 2.6;
      p.b = CORE[2] * 2.6;
      this.stars.emit();
    }
    // Where it landed: a jade ring opening on the ground and a lit pool under the beast.
    const g = this.marks.spec.reset();
    g.x = x;
    g.y = 0.04;
    g.z = z;
    g.life = 0.38;
    g.size0 = 0.5 * k;
    g.size1 = 2.0 * k;
    g.r = JADE[0] * 0.8;
    g.g = JADE[1] * 0.8;
    g.b = JADE[2] * 0.8;
    g.a = 0.75;
    this.marks.emit();
    const p = this.pools.spec.reset();
    p.x = x;
    p.y = 0.03;
    p.z = z;
    p.life = 0.5;
    p.size0 = 2.2 * k;
    p.size1 = 3.0 * k;
    p.r = c[0] * 0.8;
    p.g = c[1] * 0.8;
    p.b = c[2] * 0.8;
    this.pools.emit();
  }

  /** A lead blade's blow: a shock ring and a wide lit pool, a short pillar of light. */
  private leadImpact(x: number, z: number): void {
    const g = this.marks.spec.reset();
    g.x = x;
    g.y = 0.05;
    g.z = z;
    g.life = 0.5;
    g.size0 = 1.2;
    g.size1 = 6.5;
    g.r = CYAN[0] * 0.9;
    g.g = CYAN[1] * 0.9;
    g.b = CYAN[2] * 0.9;
    this.marks.emit();
    const p = this.pools.spec.reset();
    p.x = x;
    p.y = 0.03;
    p.z = z;
    p.life = 0.9;
    p.size0 = 5;
    p.size1 = 6.5;
    p.r = CYAN[0] * 0.75;
    p.g = CYAN[1] * 0.75;
    p.b = CYAN[2] * 0.75;
    this.pools.emit();
    const b = this.beams.spec.reset();
    b.x = x;
    b.y = 0;
    b.z = z;
    b.dx = 0;
    b.dy = 1;
    b.dz = 0;
    b.len0 = 3;
    b.len1 = 7;
    b.w0 = 0.9;
    b.w1 = 0.3;
    b.life = 0.3;
    b.cr = CORE[0] * 4;
    b.cg = CORE[1] * 4;
    b.cb = CORE[2] * 4;
    b.hr = CYAN[0] * 0.8;
    b.hg = CYAN[1] * 0.8;
    b.hb = CYAN[2] * 0.8;
    b.fadeBase = 0.05;
    b.fadeTip = 0.6;
    this.beams.emit();
  }

  private glint(x: number, y: number, z: number, k: number): void {
    const g = this.glitter.spec.reset();
    g.x = x;
    g.y = y;
    g.z = z;
    g.vy = -0.4;
    g.life = this.rand.range(0.15, 0.3);
    g.size0 = 0.3 * k;
    g.size1 = 0.05;
    g.rot = this.rand.range(0, Math.PI);
    g.r = CORE[0] * 3;
    g.g = CORE[1] * 3;
    g.b = CORE[2] * 3;
    this.glitter.emit();
  }

  private finisherBeam(): void {
    // The cut: a thin white-hot seam along the line, then two narrow light fronts sliding out both ways (cyan and
    // jade with white-gold cores: no wide milky wave), sparks thrown off the line, lit pools and the scar.
    const dx = this.s1.x - this.s0.x;
    const dz = this.s1.z - this.s0.z;
    const l = Math.hypot(dx, dz);
    // The scar it leaves: ink stains along the line (dark under the light) and lit pools that cool.
    for (let k = 0; k <= 16; k += 1) {
      const u = k / 16;
      const sc = this.scar.spec.reset();
      sc.x = this.s0.x + dx * u + this.rand.range(-0.3, 0.3);
      sc.y = 0.02;
      sc.z = this.s0.z + dz * u + this.rand.range(-0.3, 0.3);
      sc.life = 2.6;
      sc.size0 = 2.4;
      sc.size1 = 3.0;
      sc.rot = this.rand.range(0, 6.28);
      sc.r = 0.03;
      sc.g = 0.045;
      sc.b = 0.05;
      sc.a = 0.75;
      this.scar.emit();
      const p = this.pools.spec.reset();
      p.x = this.s0.x + dx * u;
      p.y = 0.035;
      p.z = this.s0.z + dz * u;
      p.life = 1.6;
      p.size0 = 3.6;
      p.size1 = 2.6;
      p.aspect = 2.2;
      p.rot = Math.atan2(dz, dx) + Math.PI / 2;
      const c = k % 2 === 0 ? CYAN : JADE;
      p.r = c[0] * 0.6;
      p.g = c[1] * 0.6;
      p.b = c[2] * 0.6;
      this.pools.emit();
    }
    const seam = this.beams.spec.reset();
    seam.x = this.s0.x - (dx / l) * 1.5;
    seam.y = 0.08;
    seam.z = this.s0.z - (dz / l) * 1.5;
    seam.dx = dx / l;
    seam.dy = 0;
    seam.dz = dz / l;
    seam.len0 = seam.len1 = l + 3;
    seam.grow = 0.06;
    seam.w0 = 0.7;
    seam.w1 = 0.3;
    seam.life = 2.2;
    seam.cr = CORE[0] * 4.2;
    seam.cg = CORE[1] * 4.2;
    seam.cb = CORE[2] * 4.2;
    seam.hr = CYAN[0] * 0.8;
    seam.hg = CYAN[1] * 0.8;
    seam.hb = CYAN[2] * 0.8;
    seam.fadeBase = 0.05;
    seam.fadeTip = 0.05;
    this.beams.emit();
    for (let k = 0; k < 5; k += 1) {
      const side = k === 0 ? 0 : k <= 2 ? 1 : -1;
      const back = k === 2 || k === 4;
      const b = this.beams.spec.reset();
      b.x = this.s0.x - (dx / l) * 3;
      b.y = back ? 0.3 : 0.6;
      b.z = this.s0.z - (dz / l) * 3;
      b.dx = dx / l;
      b.dy = 0;
      b.dz = dz / l;
      b.len0 = b.len1 = l + 6;
      b.grow = side === 0 ? 0.05 : 0;
      // Narrow fronts with hot cores (round 1's 3–4 m soft waves washed the field milky).
      b.w0 = side === 0 ? 1.4 : back ? 1.0 : 1.3;
      b.w1 = side === 0 ? 0.4 : back ? 1.6 : 0.5;
      const lag = back ? 0.82 : 1;
      b.vx = (this.sweepNx * side * SWEEP_R * lag) / SWEEP_S;
      b.vz = (this.sweepNz * side * SWEEP_R * lag) / SWEEP_S;
      b.life = side === 0 ? 0.4 : SWEEP_S + 0.08;
      const halo = back ? JADE : CYAN;
      const kc = side === 0 ? 5 : back ? 2.2 : 3.6;
      b.cr = CORE[0] * kc;
      b.cg = CORE[1] * kc;
      b.cb = CORE[2] * kc;
      b.hr = halo[0] * (back ? 0.5 : 0.75);
      b.hg = halo[1] * (back ? 0.5 : 0.75);
      b.hb = halo[2] * (back ? 0.5 : 0.75);
      b.fadeBase = 0.06;
      b.fadeTip = 0.06;
      this.beams.emit();
    }
    // Sparks and glints thrown off the whole line.
    for (let k = 0; k < 60; k += 1) {
      const u = this.rand.next();
      const p = this.stars.spec.reset();
      p.x = this.s0.x + dx * u;
      p.y = 0.5;
      p.z = this.s0.z + dz * u;
      const sd = this.rand.next() < 0.5 ? -1 : 1;
      const sp = this.rand.range(6, 14);
      p.vx = this.sweepNx * sd * sp;
      p.vz = this.sweepNz * sd * sp;
      p.vy = this.rand.range(2, 7);
      p.gravity = -9;
      p.drag = 2.5;
      p.stretch = 0.04;
      p.life = this.rand.range(0.3, 0.55);
      p.size0 = this.rand.range(0.25, 0.45);
      p.size1 = 0.06;
      const gold = k % 3 === 0;
      p.r = (gold ? GOLD[0] : CORE[0]) * 3;
      p.g = (gold ? GOLD[1] : CORE[1]) * 3;
      p.b = (gold ? GOLD[2] : CORE[2]) * 3;
      this.stars.emit();
    }
  }

  /** The sweep: the cut's light runs out both ways over SWEEP_S; each beast it passes is struck; then the fold. */
  private sweep(dt: number): void {
    const before = this.sweepT;
    this.sweepT += dt;
    const k0 = Math.min(1, before / SWEEP_S);
    const k1 = Math.min(1, this.sweepT / SWEEP_S);
    const r0 = SWEEP_R * k0;
    const r1 = SWEEP_R * k1;
    const T = this.host.targets;
    let first = !this.finHit;
    for (let i = 0; i < T.size; i += 1) {
      if (this.sweepHit[i] === 1 || !T.alive(i)) continue;
      // Distance of the beast from the cut line (signed: which way the light reaches it from).
      const d = (T.x(i) - this.s0.x) * this.sweepNx + (T.z(i) - this.s0.z) * this.sweepNz;
      const ad = Math.abs(d);
      if (ad < r0 - 0.5 || ad > r1 + 0.5) continue;
      this.sweepHit[i] = 1;
      const nx = d < 0 ? -this.sweepNx : this.sweepNx;
      const nz = d < 0 ? -this.sweepNz : this.sweepNz;
      const tier = T.tier(i);
      const blows = tier >= 2 ? 3 : 2;
      this.impactAt(T.x(i), T.midY(i), T.z(i), nx, nz, tier >= 2 ? 1.8 : 1.3, (i & 1) as number);
      for (let b = 0; b < blows && T.alive(i); b += 1) {
        // The cut's light: power 1.2, past every other blow (the field flings small beasts on it).
        const killed = T.hit(i, nx, nz, 1.2, 0xa8f5dd);
        this.strikes += 1;
        this.host.struck(i, nx, nz, 1.2, first ? "finisher" : "secondary", killed);
        first = false;
        this.finHit = true;
      }
    }
    // The stroke's swords plunge into the cut in the first 40 % of the sweep.
    const drop = smooth01(k1 / 0.4);
    for (let i = 0; i < this.cap; i += 1) {
      if (this.st[i] !== S_STROKE) continue;
      // A lead blade drives deep into the cut (its 6.4 m stands about 4.5 m out of the ground).
      this.py[i] = this.ay[i]! + ((i < HERO_N ? 1.3 : 0.5) - this.ay[i]!) * drop;
      this.turn(i, this.sweepNx * 0.25 + ((this.s1.x - this.s0.x) / 34.5) * 0.4, -0.88, this.sweepNz * 0.25 + ((this.s1.z - this.s0.z) / 34.5) * 0.4, this.kPlunge);
    }
    if (k1 >= 1) {
      this.sweepT = -1;
      // Fold: everything left converges on a point above the hero and is gone.
      this.host.caster(this.c);
      for (let i = 0; i < this.cap; i += 1) {
        if (this.st[i] === S_OFF) continue;
        this.st[i] = S_FOLD;
        this.age[i] = 0;
        this.dur[i] = (T_FOLD_END - T_FIN - SWEEP_S) * this.rand.range(0.7, 1) + 0.1;
        this.ax[i] = this.px[i]!;
        this.ay[i] = this.py[i]!;
        this.az[i] = this.pz[i]!;
        this.bx[i] = this.c.x;
        this.by[i] = 6;
        this.bz[i] = this.c.z - 1;
      }
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private drawSwords(): void {
    const B = this.blades;
    for (let i = 0; i < this.cap; i += 1) {
      const s = this.st[i] === S_OFF ? 0 : this.sc[i]!;
      if (s <= 0.01) {
        B.hide(i);
        continue;
      }
      const lead = i < HERO_N;
      const st = this.st[i];
      const len = this.lenM[i]! * (0.55 + 0.45 * s);
      // BladeSet places the guard: the sword's point (px) is its middle.
      const gx = this.px[i]! - this.dx[i]! * len * 0.5;
      const gy = this.py[i]! - this.dy[i]! * len * 0.5;
      const gz = this.pz[i]! - this.dz[i]! * len * 0.5;
      B.set(i, gx, gy, gz, this.dx[i]!, this.dy[i]!, this.dz[i]!, len);
      const h = this.hue[i]!;
      const c = h === 0 ? JADE : h === 1 ? CYAN : h === 2 ? SILVER : GOLD;
      // Brighter where the stream's wave runs (river swords), at full on a dive and on the lead blades.
      const b = st === S_RIVER || st === S_SEED ? this.brightAt(this.u[i]!) : 1;
      if (lead) {
        // The lead blade's steel glows white-gold toward its core; its aura: a white-hot core, a saturated rim.
        B.tint(i, 0.12 + c[0] * 1.2, 0.12 + c[1] * 1.2, 0.12 + c[2] * 1.2);
        const aw = len * 0.13;
        this.auras.push(gx, gy, gz, gx + this.dx[i]! * len * 1.04, gy + this.dy[i]! * len * 1.04, gz + this.dz[i]! * len * 1.04, aw, s, c[0], c[1], c[2]);
        continue;
      }
      const kb = 0.55 + 0.75 * b;
      B.tint(i, 0.08 + c[0] * kb, 0.08 + c[1] * kb, 0.08 + c[2] * kb);
      // The motion trail: long while diving, a flowing streak in the river; it starts a little ahead of the tip.
      const tail = st === S_DIVE ? 4.4 : st === S_GATHER || st === S_FOLD ? 2.6 : st === S_STROKE ? 1.6 : st === S_AIM ? 1.0 : 2.8;
      const hx = this.px[i]! + this.dx[i]! * len * 0.62;
      const hy = this.py[i]! + this.dy[i]! * len * 0.62;
      const hz = this.pz[i]! + this.dz[i]! * len * 0.62;
      const tl = len * 0.5 + tail;
      const width = st === S_DIVE ? 0.5 : 0.38;
      const alpha = s * (st === S_WOUND ? 0.4 : st === S_FADE ? 0.5 : 1) * (0.55 + 0.45 * b);
      this.tails.push(hx, hy, hz, hx - this.dx[i]! * tl, hy - this.dy[i]! * tl, hz - this.dz[i]! * tl, width, alpha, c[0] * b, c[1] * b, c[2] * b);
    }
  }

  reset(): void {
    this.active = false;
    this.sweepT = -1;
    this.finHit = false;
    this.st.fill(S_OFF);
    this.tgt.fill(-1);
    this.reserved.fill(0);
    this.blades.hideAll();
    this.river.clear();
    this.hits.clear();
    this.stars.clear();
    this.glitter.clear();
    this.beams.clear();
    this.marks.clear();
    this.pools.clear();
    this.scar.clear();
    for (let k = 0; k < HERO_N; k += 1) this.ribbons.kill(k);
    for (let i = 0; i < this.cap; i += 1) {
      this.dx[i] = 0;
      this.dy[i] = 1;
      this.dz[i] = 0;
      this.lenM[i] = i < HERO_N ? HERO_M : SWORD_M;
    }
  }

  /** Swords drawn now (captures: the river's size on screen). */
  shownCount(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) if (this.st[i] !== S_OFF && this.sc[i]! > 0.01) n += 1;
    return n;
  }
}
