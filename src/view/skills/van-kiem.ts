/**
 * Vạn Kiếm Triều Tông · Ten-Thousand Sword Convergence (萬劍朝宗), the
 * field-wide prototype of the power pass (canon D58 (2); POWER_RESEARCH.md
 * "Chiêu cả sân mẫu", direction A "Celestial Sword River"). The four readable
 * states: the sky changes, the swords gather, each sword picks its prey, one
 * stroke ends it. Round 3a (P3, the diagnosis of 03/11/2026: round 2's 328
 * near-identical mint GLB swords with ring hilts read as "keys, toothpicks,
 * neon confetti"; every sword was primary, so none was) keeps the motion,
 * the targeting and the timeline and replaces the art with the Sword school's
 * grammar (sword-grammar.ts), three tiers of value and importance:
 * - LEAD blades (6): the swords that leave the hand on F0, drawn as graphic
 *   swords with gold hilts (the only gold), a navy edge, a two-tone cyan body
 *   and a white spine of HDR 6; after their first strike they rise into the
 *   river growing to 4.2 m (~150–190 px at the play camera), ride its crest,
 *   dive one at a time on the gravest prey, and take the middle of the final
 *   stroke; a white ribbon trail with a cyan rim;
 * - MID swords (32 on High): no hilt, a white tapered spine (HDR 4.5, brighter
 *   in waves running down the stream), a cyan body, a narrow navy edge and a
 *   short streak, flowing in five braided lanes;
 * - FAR streaks (100 on High): directional white-to-cyan streaks in the river's
 *   outer lanes and above it, for scale only.
 * Every sword flies tip first. White, cyan and deep navy only; bodies are
 * premultiplied alpha, only spines, streaks, sparks and glints are added; no
 * broad glow cards or lit ground pools (they washed the field to mid-grey).
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
 * - F192: the stroke becomes one wide tapered sword-qi slash (qi-slash.ts, round
 *   3b item 4: hot white core, cyan body, deep-blue falloff, the authored
 *   crescent's ragged edges), whole on its first frame; a white head runs it
 *   from origin to tip in 0.26 s and every beast falls in that order (small
 *   beasts struck twice, elites and the king three times), knocked along the
 *   stroke; big beasts carry a glowing slice seam; the river swords melt into
 *   the cut as the head passes; the slash erodes from its edges; an ink scar
 *   and a lit seam stay on the ground.
 * - F192–207: the river folds into a point above the hero and is gone.
 * Halos stay ≤ 0.9 a channel, only thin cores are HDR. View only:
 * the sim owns damage; the host turns `struck` into its hit events. No
 * allocation per frame.
 */
import * as THREE from "three";
import { BeamPool, Rand, RibbonPool, smooth01, SpritePool } from "./fxkit";
import { QiSlash } from "./qi-slash";
import { RiverBody } from "./river-body";
import { GraphicSwords, SWORD_FAR, SWORD_LEAD, SWORD_MID } from "./sword-grammar";
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

/** A sword's pose as drawn (VanKiemFx.poseOf): middle (m), unit direction, length (m), class 0 lead, 1 mid, 2 far. */
export interface SwordPose {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  cls: number;
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
  /** The authored slash crescent (white on black, used as alpha): the finisher's shape. Null: a computed taper. */
  readonly slashMask?: THREE.Texture | null;
}

/** River size per tier: mid swords and far streaks (the diagnosis: ~6 leads, 16–32 readable swords, 40–100 streaks). */
/** Round 3b (item 3): 64 % fewer swords than round 3a (32 + 100 on High), each 2–3× larger, inside one river body. */
export const VAN_KIEM_SWORDS = { low: { mid: 8, far: 16 }, medium: { mid: 10, far: 26 }, high: { mid: 12, far: 36 }, ultra: { mid: 12, far: 36 } } as const;
const HERO_N = 6;
const SEEDS = 20;
/** Lengths (m): a mid sword, a far streak, the lead blades leaving the hand and the lead blades in the river. */
const SWORD_M = 4.4;
const FAR_M = 6.2;
const HERO_M = 3.0;
const LEAD_M = 7.0;
/** Blade half widths (m) and half-width floors (px at 1080p): lead, mid, far. */
const LEAD_HALF = 0.16;
const MID_HALF = 0.12;
const FAR_HALF = 0.045;
const LEAD_FLOOR_PX = 8;
const MID_FLOOR_PX = 6;
const FAR_FLOOR_PX = 3.5;
/** Spine levels (linear HDR entering the bloom; the diagnosis asks 4–8 at threshold 1): lead, mid (× the stream's wave), far head. */
const LEAD_SPINE = 5.5;
const MID_SPINE = 5.2;
const FAR_HEAD = 1.6;

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
const BATCH_MIN = 5;
const BATCH_SPAN = 3;
const AIM_S = 0.12;
const WOUND_S = 0.06;
const FADE_S = 0.12;
/** The finisher's head runs the slash from origin to tip in SWEEP_S; the slash holds, then erodes from its edges. */
const SWEEP_S = 0.26;
const SLASH_HOLD_S = 0.22;
const SLASH_ERODE_S = 0.4;
/** The slash's half width (px at 1080p) across its strip; the crescent's body fills about 40 % of it. */
const SLASH_HALF_PX = 72;
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

/** The Sword school's light (linear): cyan halos (≤ 0.9) and a white core (HDR in the layers). No jade, no mint, no gold here. */
const CYAN = [0.04, 0.55, 0.95] as const;
const CORE = [1, 1, 1] as const;
/** The number tint and flash colour hosts read (linear cyan, sRGB hex). */
export const VAN_KIEM_COLOUR = [0.2, 0.72, 1.0] as const;
export const VAN_KIEM_FLASH = "#d6f3ff";
/** The beast hit tint of a river sword and of the cut (0xRRGGBB). */
const HIT_RGB = 0x8fdcff;
const CUT_RGB = 0xc4ecff;

export class VanKiemFx {
  /** Every sword of the cast, one instanced draw (sword-grammar.ts): far streaks, then mid swords, then lead blades. */
  private readonly swords: GraphicSwords;
  /** The river as one luminous body the swords ride in (round 3b, river-body.ts). */
  private readonly body: RiverBody;
  private readonly pathFn = (u: number, lat: number, h: number, out: THREE.Vector3): THREE.Vector3 => this.riverAt(u, lat, h, out);
  private readonly ribbons: RibbonPool;
  private readonly hits: SpritePool;
  private readonly stars: SpritePool;
  private readonly glitter: SpritePool;
  private readonly beams: BeamPool;
  /** Ground: a thin cyan ring where a sword lands and the cut's ink scar (no lit pools: they washed the field grey). */
  private readonly marks: SpritePool;
  private readonly scar: SpritePool;
  private readonly rand = new Rand(7717);
  /** River swords (mid and far), the mid ones among them, and the whole pool (lead blades first). */
  private readonly n: number;
  private readonly mid: number;
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
  /** The finisher's slash (round 3b, item 4) and its age (s), −1 when gone; it outlives the cast's timeline. */
  private readonly qi: QiSlash;
  private slashT = -1;
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

  constructor(
    private readonly host: VanKiemHost,
    tex: VanKiemTextures,
    counts: { readonly mid: number; readonly far: number },
  ) {
    this.mid = Math.max(8, Math.min(64, Math.floor(counts.mid)));
    this.n = this.mid + Math.max(8, Math.min(200, Math.floor(counts.far)));
    this.cap = HERO_N + this.n;
    this.swords = new GraphicSwords(this.cap, 12);
    this.body = new RiverBody(9);
    this.ribbons = new RibbonPool(HERO_N, 46, tex.noise, 11);
    this.hits = new SpritePool(160, tex.slash, "add", "camera", 13);
    this.stars = new SpritePool(220, tex.star, "add", "camera", 14);
    this.glitter = new SpritePool(160, tex.star, "add", "camera", 14);
    this.beams = new BeamPool(160, 13);
    this.marks = new SpritePool(160, tex.ring, "add", "ground", 6, { twoSided: true });
    this.scar = new SpritePool(48, tex.scorch, "ink", "ground", 4, { fadeIn: 0.05, twoSided: true });
    this.qi = new QiSlash(tex.slashMask ?? null, 15);
    host.layer.add(this.scar.mesh, this.marks.mesh, this.body.group, this.ribbons.mesh, this.swords.mesh, this.beams.mesh, this.hits.mesh, this.stars.mesh, this.glitter.mesh, this.qi.mesh);
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
    this.flown = new Uint8Array(N);
    this.reserved = new Int16Array(host.targets.size);
    this.score = new Float32Array(host.targets.size);
    this.sweepHit = new Uint8Array(host.targets.size);
    for (let i = 0; i < N; i += 1) {
      this.lane[i] = i % LANES;
      this.lenM[i] = this.baseLen(i);
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

  /**
   * The equipped weapon (D55). Round 3a draws every sword of this skill in the school's grammar (white spine, cyan
   * body, navy edge, gold lead hilts), not as copies of the weapon's model: kept for the host's call.
   */
  async setWeapon(_def: WeaponDef): Promise<void> {
    return Promise.resolve();
  }

  /** Sword i's class: 0 lead, 1 mid, 2 far streak. */
  private cls(i: number): number {
    return i < HERO_N ? SWORD_LEAD : i < HERO_N + this.mid ? SWORD_MID : SWORD_FAR;
  }

  /** Sword i's own length (m) at rest: a lead blade leaving the hand, a mid sword, a far streak. */
  private baseLen(i: number): number {
    return i < HERO_N ? HERO_M : i < HERO_N + this.mid ? SWORD_M : FAR_M;
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
      this.startRibbon(i, 0.28);
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

  /**
   * Sword i's place across the river and its height: mid swords near their braided lane, far streaks in the outer
   * lanes and above the stream (a deeper layer behind and over the readable swords).
   */
  private placeAcross(i: number): void {
    if (this.cls(i) === SWORD_FAR) {
      this.lat[i] = (this.rand.next() < 0.5 ? -1 : 1) * this.rand.range(1.2, 3.4);
      this.hgt[i] = this.rand.range(0.5, 1.9);
    } else {
      this.lat[i] = this.rand.range(-0.3, 0.3);
      this.hgt[i] = this.rand.range(-0.25, 0.25);
    }
  }

  /** A sword joins the river at u (fades in). */
  private toRiver(i: number, u: number, fadeIn: boolean): void {
    this.st[i] = S_RIVER;
    this.age[i] = fadeIn ? 0 : 1;
    this.u[i] = u;
    this.placeAcross(i);
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
        // Round 3b: no lock threads (dashed debug-looking lines); the sword's own turn shows the choice.
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
    if (this.active) this.step(dt);
    // The body opens with the river (F1–30), holds through the hunt and drains into the gather.
    // Round 3b: it drains in 0.12 s and narrows as it goes (a slow fade left a thin grey line across the field).
    const drain = 1 - smooth01((this.t - T_GATHER) / 0.12);
    const on = this.active ? smooth01((this.t - T_SEAM) / 0.35) * drain : 0;
    this.body.update(this.pathFn, 3.3 * (0.4 + 0.6 * drain), on * on, this.t);
    this.drawSlash(dt);
    this.drawSwords();
    this.ribbons.update(dt, this.host.camera);
    this.hits.update(dt);
    this.stars.update(dt);
    this.glitter.update(dt);
    this.beams.update(dt);
    this.marks.update(dt);
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
      // Round 3b: no thin white guide seam (it read as a debug spline); the river body opens instead.
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
    this.placeAcross(i);
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
        // The trail eases out fast: retracting over 0.25 s it hung across the field as a grey spline (round 3b).
        this.ribbons.stop(i, 0.08);
      } else k += 1;
    }
  }

  /**
   * The river's light while it stands: only glints shed along it (~90 a second, white and cyan, drifting with the
   * stream). Round 2's glow cards along the river and its lit ground pools are gone: broad additive light under the
   * swords washed the field to one mid-grey band.
   */
  private riverLight(dt: number): void {
    const t = this.t;
    const on = smooth01((t - T_SEEDS) / 0.3) * (1 - smooth01((t - T_GATHER) / 0.25));
    if (on <= 0.01) return;
    this.glintAcc += 90 * on * dt;
    while (this.glintAcc >= 1) {
      this.glintAcc -= 1;
      const u = this.rand.next();
      this.riverAt(u, this.rand.range(-1, 1) * 3.2, this.rand.range(-0.6, 0.8), this.v);
      const g = this.glitter.spec.reset();
      g.x = this.v.x;
      g.y = this.v.y;
      g.z = this.v.z;
      g.vx = 39 * 0.15 * 0.6;
      g.vz = -12 * 0.15 * 0.6;
      g.vy = -0.6;
      g.life = this.rand.range(0.16, 0.32);
      g.size0 = this.rand.range(0.18, 0.28);
      g.size1 = 0.04;
      g.rot = this.rand.range(0, Math.PI);
      const white = this.rand.next() < 0.5;
      const k = this.brightAt(u) * 3;
      g.r = (white ? CORE[0] : CYAN[0]) * k;
      g.g = (white ? CORE[1] : CYAN[1]) * k;
      g.b = (white ? CORE[2] : CYAN[2]) * k;
      this.glitter.emit();
    }
  }

  /** A lead blade's trail: a thin white core in a deep cyan rim, ≥ 4 px wide at the play camera (0.3 m ≈ 13 px). */
  private startRibbon(i: number, widthM: number): void {
    this.ribbons.start(i, this.px[i]!, this.py[i]!, this.pz[i]!, widthM, 0.62 * 2.2, 0.88 * 2.2, 2.2, 1, 0.08);
    this.ribbons.setRim(i, CYAN[0] * 0.55, CYAN[1] * 0.55, CYAN[2] * 0.55);
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
        // A lead blade struck into the finisher's cut drives on down into the ground as it goes.
        if (i < HERO_N && this.t >= T_FIN) {
          this.py[i] = this.py[i]! - 22 * dt;
          this.turn(i, this.dx[i]! * 0.3, -1, this.dz[i]! * 0.3, this.kPlunge);
        }
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
    if (!this.ribbons.isOn(i)) this.startRibbon(i, 0.4);
    else this.ribbons.setWidth(i, 0.4);
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
    this.impactAt(T.x(t), T.midY(t), T.z(t), dx, dz, big ? 2.0 : lead ? 1.3 : this.cls(i) === SWORD_MID ? 0.9 : 0.6);
    // A river sword takes one stand-in HP (TargetField.hit below power 0.5); a lead blade lands a heavy blow.
    const power = big ? 1.05 : lead ? 0.85 : 0.3;
    const killed = T.hit(t, dx, dz, power, HIT_RGB);
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

  private impactAt(x: number, y: number, z: number, dx: number, dz: number, k: number): void {
    // A narrow slash across the blow (white core, read as a glint), a white star at its heart, sparks along the
    // blow, a thin cyan ring opening on the ground. No lit pool.
    const s = this.hits.spec.reset();
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = 0.12;
    s.size0 = 1.2 * k;
    s.size1 = 1.5 * k;
    s.aspect = 0.45;
    s.rot = Math.atan2(-dz, dx) + Math.PI / 2 + this.rand.range(-0.35, 0.35);
    s.r = CORE[0] * 2.4;
    s.g = CORE[1] * 2.4;
    s.b = CORE[2] * 2.4;
    this.hits.emit();
    const r = this.stars.spec.reset();
    r.x = x;
    r.y = y;
    r.z = z;
    r.life = 0.09;
    r.size0 = 0.8 * k;
    r.size1 = 0.45 * k;
    r.rot = this.rand.range(0, Math.PI);
    r.r = CORE[0] * 3.2;
    r.g = CORE[1] * 3.2;
    r.b = CORE[2] * 3.2;
    this.stars.emit();
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
      p.size0 = 0.2 * k;
      p.size1 = 0.05;
      const white = n === 0;
      p.r = (white ? CORE[0] : CYAN[0]) * 2.6;
      p.g = (white ? CORE[1] : CYAN[1]) * 2.6;
      p.b = (white ? CORE[2] : CYAN[2]) * 2.6;
      this.stars.emit();
    }
    // Round 3b: the thin ground ring only under a lead blade's blow (a ring under every hit read as a stamp).
    if (k < 1.3) return;
    const g = this.marks.spec.reset();
    g.x = x;
    g.y = 0.04;
    g.z = z;
    g.life = 0.34;
    g.size0 = 0.5 * k;
    g.size1 = 1.8 * k;
    g.r = CYAN[0] * 0.8;
    g.g = CYAN[1] * 0.8;
    g.b = CYAN[2] * 0.8;
    g.a = 0.7;
    this.marks.emit();
  }

  /** A lead blade's blow: a shock ring, an ink scorch and a short narrow pillar of light. */
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
    const sc = this.scar.spec.reset();
    sc.x = x;
    sc.y = 0.02;
    sc.z = z;
    sc.life = 1.6;
    sc.size0 = 1.6;
    sc.size1 = 2.0;
    sc.rot = this.rand.range(0, 6.28);
    sc.r = 0.02;
    sc.g = 0.03;
    sc.b = 0.06;
    sc.a = 0.7;
    this.scar.emit();
    const b = this.beams.spec.reset();
    b.x = x;
    b.y = 0;
    b.z = z;
    b.dx = 0;
    b.dy = 1;
    b.dz = 0;
    b.len0 = 3;
    b.len1 = 7;
    b.w0 = 0.5;
    b.w1 = 0.2;
    b.life = 0.3;
    b.cr = CORE[0] * 5;
    b.cg = CORE[1] * 5;
    b.cb = CORE[2] * 5;
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
    // The cut: a thin white-hot seam along the line, then narrow light fronts sliding out both ways (white cores in
    // cyan rims: no wide milky wave), white and cyan sparks thrown off the line, and the ink scar.
    const dx = this.s1.x - this.s0.x;
    const dz = this.s1.z - this.s0.z;
    const l = Math.hypot(dx, dz);
    // The scar it leaves: ink stains along the line (dark under the light).
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
    seam.w0 = 0.45;
    seam.w1 = 0.22;
    seam.life = 2.2;
    seam.cr = CORE[0] * 6;
    seam.cg = CORE[1] * 6;
    seam.cb = CORE[2] * 6;
    seam.hr = CYAN[0] * 0.8;
    seam.hg = CYAN[1] * 0.8;
    seam.hb = CYAN[2] * 0.8;
    seam.fadeBase = 0.05;
    seam.fadeTip = 0.05;
    this.beams.emit();
    // Round 3b (item 4): no parallel light fronts (both judges read them as thin laser lines running into the void);
    // one wide slash carries the cut, whole on this frame, its head running origin to tip with the deaths.
    this.slashT = 0;
    this.drawSlash(0);
    // The river swords become the slash: they melt into it now (a row of them standing on it read as a fence); the
    // lead blades stay and drive into the cut as the head passes them.
    for (let i = HERO_N; i < this.cap; i += 1) {
      if (this.st[i] !== S_STROKE && this.st[i] !== S_GATHER) continue;
      this.st[i] = S_FADE;
      // Most of the fade is skipped: under the climax's slow motion a full one held them as a comb over the slash.
      this.age[i] = FADE_S * 0.65;
    }
    // A few sparks off the slash's origin; the rest fly off its head as it runs (sweep).
    for (let k = 0; k < 14; k += 1) this.slashSpark(this.rand.next() * 0.15);
  }

  /** The slash's two ends in the world: from high over the far left down to the near right, past the field's beasts. */
  private slashEnds(): { ax: number; ay: number; az: number; bx: number; by: number; bz: number } {
    const dx = this.s1.x - this.s0.x;
    const dz = this.s1.z - this.s0.z;
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    const e = this.ends;
    e.ax = this.s0.x - ux * 2.5;
    e.ay = 2.8;
    e.az = this.s0.z - uz * 2.5;
    e.bx = this.s1.x + ux * 2.5;
    e.by = 0.5;
    e.bz = this.s1.z + uz * 2.5;
    return e;
  }

  private readonly ends = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };

  /** A spark thrown off the slash at `u` (0 origin, 1 tip) along it and out to either side. */
  private slashSpark(u: number): void {
    const e = this.slashEnds();
    const p = this.stars.spec.reset();
    p.x = e.ax + (e.bx - e.ax) * u;
    p.y = e.ay + (e.by - e.ay) * u;
    p.z = e.az + (e.bz - e.az) * u;
    const sd = this.rand.next() < 0.5 ? -1 : 1;
    const sp = this.rand.range(6, 13);
    const l = Math.hypot(e.bx - e.ax, e.bz - e.az) || 1;
    p.vx = this.sweepNx * sd * sp * 0.7 + ((e.bx - e.ax) / l) * sp * 0.6;
    p.vz = this.sweepNz * sd * sp * 0.7 + ((e.bz - e.az) / l) * sp * 0.6;
    p.vy = this.rand.range(1, 5);
    p.gravity = -9;
    p.drag = 2.5;
    p.stretch = 0.045;
    p.life = this.rand.range(0.25, 0.45);
    p.size0 = this.rand.range(0.22, 0.4);
    p.size1 = 0.05;
    const white = this.rand.next() < 0.65;
    p.r = (white ? CORE[0] : CYAN[0]) * 3;
    p.g = (white ? CORE[1] : CYAN[1]) * 3;
    p.b = (white ? CORE[2] : CYAN[2]) * 3;
    this.stars.emit();
  }

  /** The slash as drawn: whole from its first frame, the head running with the sweep, then eroding from its edges. */
  private drawSlash(dt: number): void {
    if (this.slashT < 0) {
      this.qi.hide();
      return;
    }
    this.slashT += dt;
    const t = this.slashT;
    const run = Math.min(1, t / SWEEP_S);
    const head = 1 - (1 - run) * (1 - run);
    const er = smooth01((t - SWEEP_S - SLASH_HOLD_S) / SLASH_ERODE_S);
    const fade = 1 - smooth01((t - SWEEP_S - SLASH_HOLD_S - SLASH_ERODE_S * 0.55) / (SLASH_ERODE_S * 0.45));
    if (fade <= 0) {
      this.slashT = -1;
      this.qi.hide();
      return;
    }
    const e = this.slashEnds();
    // Widest on its first frames (the blow), settling a little as it holds.
    const w = SLASH_HALF_PX * (1.12 - 0.12 * smooth01(t / 0.12));
    this.qi.set(e.ax, e.ay, e.az, e.bx, e.by, e.bz, w, head, fade, er);
  }

  /** The head's place along the stroke (0 origin, 1 tip) after `t` s of the sweep (eased out, as drawn). */
  private headAt(t: number): number {
    const run = Math.min(1, t / SWEEP_S);
    return 1 - (1 - run) * (1 - run);
  }

  /**
   * Beast i cut by the finisher, knocked along (kx, kz): no stamp; the field flashes its body white and flings small
   * beasts along the stroke; a big beast carries a glowing slice seam across its body along the stroke.
   */
  private cutReact(i: number, ux: number, uz: number, tier: number): void {
    if (tier < 2) return;
    const T = this.host.targets;
    const R = T.radius(i) * 1.35 + 0.4;
    const b = this.beams.spec.reset();
    b.x = T.x(i) - ux * R;
    b.y = T.midY(i) + 0.45;
    b.z = T.z(i) - uz * R;
    const l = Math.hypot(ux, 0.22, uz);
    b.dx = ux / l;
    b.dy = -0.22 / l;
    b.dz = uz / l;
    b.len0 = 0.2;
    b.len1 = 2 * R;
    b.grow = 0.05;
    b.w0 = 0.26;
    b.w1 = 0.26;
    b.life = 0.65;
    b.cr = CORE[0] * 5.5;
    b.cg = CORE[1] * 5.5;
    b.cb = CORE[2] * 5.5;
    b.hr = CYAN[0] * 0.85;
    b.hg = CYAN[1] * 0.85;
    b.hb = CYAN[2] * 0.85;
    b.fadeBase = 0.2;
    b.fadeTip = 0.2;
    this.beams.emit();
  }

  /**
   * The sweep: the slash's head runs from origin to tip over SWEEP_S; each beast falls as the head passes its place
   * along the stroke (the whole field, in that order), knocked along the stroke; the river swords melt into the cut
   * as the head passes them, the lead blades drive into it; then the fold.
   */
  private sweep(dt: number): void {
    const before = this.sweepT;
    this.sweepT += dt;
    const k0 = this.headAt(before);
    const k1 = this.headAt(this.sweepT);
    const dlx = this.s1.x - this.s0.x;
    const dlz = this.s1.z - this.s0.z;
    const L = Math.hypot(dlx, dlz);
    const ux = dlx / L;
    const uz = dlz / L;
    const T = this.host.targets;
    let first = !this.finHit;
    for (let i = 0; i < T.size; i += 1) {
      if (this.sweepHit[i] === 1 || !T.alive(i)) continue;
      // Distance of the beast from the cut line (signed) and its place along it.
      const d = (T.x(i) - this.s0.x) * this.sweepNx + (T.z(i) - this.s0.z) * this.sweepNz;
      if (Math.abs(d) > SWEEP_R + 0.5) continue;
      const u = Math.min(1, Math.max(0, ((T.x(i) - this.s0.x) * ux + (T.z(i) - this.s0.z) * uz) / L));
      if (u > k1 && k1 < 1) continue;
      this.sweepHit[i] = 1;
      // Knocked along the stroke and a little away from the line.
      const side = d < 0 ? -1 : 1;
      let kx = ux * 0.8 + this.sweepNx * side * 0.55;
      let kz = uz * 0.8 + this.sweepNz * side * 0.55;
      const kl = Math.hypot(kx, kz) || 1;
      kx /= kl;
      kz /= kl;
      const tier = T.tier(i);
      const blows = tier >= 2 ? 3 : 2;
      this.cutReact(i, ux, uz, tier);
      for (let b = 0; b < blows && T.alive(i); b += 1) {
        // The cut: power 1.2, past every other blow (the field flings small beasts on it).
        const killed = T.hit(i, kx, kz, 1.2, CUT_RGB);
        this.strikes += 1;
        this.host.struck(i, kx, kz, 1.2, first ? "finisher" : "secondary", killed);
        first = false;
        this.finHit = true;
      }
    }
    // Sparks off the head as it runs.
    const due = Math.round((k1 - k0) * 46);
    for (let n = 0; n < due; n += 1) this.slashSpark(k0 + (k1 - k0) * this.rand.next());
    // The river swords melt into the cut as the head passes them; the lead blades drive into it.
    for (let i = 0; i < this.cap; i += 1) {
      if (this.st[i] !== S_STROKE) continue;
      const u = ((this.px[i]! - this.s0.x) * ux + (this.pz[i]! - this.s0.z) * uz) / L;
      if (u > k1 + 0.02 && k1 < 1) continue;
      if (i >= HERO_N) {
        this.st[i] = S_FADE;
        this.age[i] = 0;
        if ((i & 3) === 0) this.glint(this.px[i]!, this.py[i]!, this.pz[i]!, 1.4);
        continue;
      }
      // A lead blade strikes down into the cut as the head passes it: a pillar of light and a shock ring where it
      // lands, and it is gone (round 3b: six blades left standing on the slash read as a comb).
      this.leadImpact(this.px[i]!, this.pz[i]!);
      this.glint(this.px[i]!, 1.2, this.pz[i]!, 2.2);
      this.st[i] = S_FADE;
      this.age[i] = FADE_S * 0.5;
    }
    if (k1 >= 1) {
      this.sweepT = -1;
      // Fold: everything left converges on a point above the hero and is gone.
      this.host.caster(this.c);
      for (let i = 0; i < this.cap; i += 1) {
        // River swords already melting into the cut finish melting.
        if (this.st[i] === S_OFF || this.st[i] === S_FADE) continue;
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

  /**
   * Every shown sword as a graphic sword, tip first: far streaks first, then mid swords, then the lead blades on
   * top (one instanced draw, in that order). A sword's point (px) is its middle; it scales in and out with `sc`.
   */
  private drawSwords(): void {
    const S = this.swords;
    S.begin();
    for (let pass = SWORD_FAR; pass >= SWORD_LEAD; pass -= 1) {
      const from = pass === SWORD_LEAD ? 0 : pass === SWORD_MID ? HERO_N : HERO_N + this.mid;
      const to = pass === SWORD_LEAD ? HERO_N : pass === SWORD_MID ? HERO_N + this.mid : this.cap;
      for (let i = from; i < to; i += 1) {
        const s = this.st[i] === S_OFF ? 0 : this.sc[i]!;
        if (s <= 0.01) continue;
        const st = this.st[i];
        const len = this.lenM[i]! * (0.55 + 0.45 * s);
        const h = len * 0.5;
        const tx = this.px[i]! + this.dx[i]! * h;
        const ty = this.py[i]! + this.dy[i]! * h;
        const tz = this.pz[i]! + this.dz[i]! * h;
        const bx = this.px[i]! - this.dx[i]! * h;
        const by = this.py[i]! - this.dy[i]! * h;
        const bz = this.pz[i]! - this.dz[i]! * h;
        // Brighter where the stream's wave runs (river swords), full on a dive and on the lead blades.
        const b = st === S_RIVER || st === S_SEED ? this.brightAt(this.u[i]!) : 1;
        const fading = st === S_WOUND ? 0.5 : st === S_FADE ? 0.6 : 1;
        if (pass === SWORD_LEAD) {
          S.push(bx, by, bz, tx, ty, tz, LEAD_HALF * (len / HERO_M) ** 0.5, SWORD_LEAD, s, LEAD_SPINE, 0, LEAD_FLOOR_PX);
        } else if (pass === SWORD_MID) {
          // The streak behind: long while diving, a short flowing one in the river.
          const streak = st === S_DIVE ? 0.9 : st === S_GATHER || st === S_FOLD ? 0.6 : st === S_STROKE || st === S_AIM ? 0.25 : 0.45;
          S.push(bx, by, bz, tx, ty, tz, MID_HALF, SWORD_MID, s * fading, MID_SPINE * (0.7 + 0.3 * b), streak, MID_FLOOR_PX);
        } else {
          // A far streak's tail stretches behind it while it dives.
          const k = st === S_DIVE ? 1.6 : 1;
          S.push(tx - this.dx[i]! * len * k, ty - this.dy[i]! * len * k, tz - this.dz[i]! * len * k, tx, ty, tz, FAR_HALF, SWORD_FAR, s * fading * (0.6 + 0.4 * b), FAR_HEAD * (0.7 + 0.3 * b), 0, FAR_FLOOR_PX);
        }
      }
    }
    S.end();
  }

  reset(): void {
    this.active = false;
    this.sweepT = -1;
    this.slashT = -1;
    this.qi.hide();
    this.finHit = false;
    this.st.fill(S_OFF);
    this.tgt.fill(-1);
    this.reserved.fill(0);
    this.hits.clear();
    this.stars.clear();
    this.glitter.clear();
    this.beams.clear();
    this.marks.clear();
    this.scar.clear();
    for (let k = 0; k < HERO_N; k += 1) this.ribbons.kill(k);
    for (let i = 0; i < this.cap; i += 1) {
      this.dx[i] = 0;
      this.dy[i] = 1;
      this.dz[i] = 0;
      this.lenM[i] = this.baseLen(i);
    }
    this.swords.begin();
    this.swords.end();
  }

  /** Swords in the pool (lead blades first). */
  get swordCount(): number {
    return this.cap;
  }

  /**
   * Sword `i` as drawn this frame (captures and the lab's HDR probe): its middle, unit direction, length (m) and
   * class (0 lead, 1 mid, 2 far streak); false when it is not shown.
   */
  poseOf(i: number, out: SwordPose): boolean {
    if (i < 0 || i >= this.cap || this.st[i] === S_OFF || this.sc[i]! <= 0.01) return false;
    const s = this.sc[i]!;
    out.x = this.px[i]!;
    out.y = this.py[i]!;
    out.z = this.pz[i]!;
    out.dx = this.dx[i]!;
    out.dy = this.dy[i]!;
    out.dz = this.dz[i]!;
    out.len = this.lenM[i]! * (0.55 + 0.45 * s);
    out.cls = this.cls(i);
    return true;
  }

  /** Swords drawn now (captures: the river's size on screen). */
  shownCount(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) if (this.st[i] !== S_OFF && this.sc[i]! > 0.01) n += 1;
    return n;
  }
}
