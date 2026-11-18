/**
 * Ice "Cold Heaven Returns to Silence" rebuilt from layered components (docs/work/tasks/ult-ice-layered-demo.md, owner
 * 15/11/2026): no scene video, no baked beasts or scenery. The v1 layers are existing clips of the ice kit
 * (art-src/lab/vfx/ice/), placed, timed, scaled and counted by code on the real field and the real foes:
 * 1. charge at the caster (0–CHARGE_S): ice-charge at the hand, ice-caster-seal flat under the feet, frost motes;
 * 2. release: ice-release at the hand, a crystal crown (ice-ring-burst, upright) round the caster, and the cold
 *    front: FRONT_N segments of ice-wave on a circle widening across the field at RING_MPS, each turned along it, a cold
 *    light dip;
 * 3. the ground freezes behind the ring: ice-ground-mark cards laid flat on a staggered grid, each when the ring reaches it,
 *    melting (eroding) over LINGER_S;
 * 4. every live foe the ring reaches freezes at once: a frost puff (ice-impact, small), the bind rim, held still for
 *    FREEZE_S under an ice-hit-affliction shell; then the shell shatters (ice-big-burst, small) and the blow lands with its
 *    number;
 * Ticket 385 v2: a 64-cluster instanced, faceted 3D forest, closed ice hulls on the actual foes, a continuous
 * textured ice sheet, low mist, falling frost and edge glints. Existing kit art supplies cracks and particles.
 * Only the first shatter lights the crystal cores (HDR 4); the standing forest is a pale support layer.
 * Ticket 389 v3 (default): 180 Y-billboard bouquets, flower, shards and tiled ice cut from the approved
 * art-src/concept/ult-ice/*v1-try1.png sources of ticket 386. No generated geometry supplies their shape.
 * ?iceVersion=v1 and ?iceVersion=v2 preserve both earlier recipes. Y still selects the old scene video.
 * Ticket 390 replaces v3's opaque round-shell cards with instanced foot mist, orbiting shards and falling frost.
 * The lab hands it the hit path (blows, numbers, the screen tier, the kick, the light, the sound).
 */
import * as THREE from "three";
import { layFlat } from "../view/skills/element-clips";
import { FlipbookPlayer, ONE_FRAME, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import { IceSpriteField } from "./ice-ult-sprites";

export const ICE_ULT_ID = "ult-ice-cold-silence";
/** The charge (s), the ring's speed (m/s) and reach (m), the freeze (s), the frost's melt (s). */
export const CHARGE_S = 0.6;
export const RING_MPS = 26;
export const REACH_M = 30;
export const FREEZE_S = 3;
export const LINGER_S = 2.5;
/** Frost marks on the ground: their grid step (m) and size (m). */
const MARK_STEP_M = 5.5;
const MARK_M = 4.2;
/** Where the frost may lie: the lab's paving (look.ts buildField: 40 × 26 m round (0, −5)) less half a seal. */
const FIELD = { halfX: 18, zMin: -16, zMax: 6 } as const;
/** The accent: one crystal spike per this many frozen foes, between these counts. */
const SPIKE_PER = 9;
const SPIKES_MIN = 2;
const SPIKES_MAX = 6;
/** The erosion ramp of every layer: hot, mid, low (linear). */
const ICE_RAMP = [[0.92, 0.97, 1], [0.5, 0.78, 1], [0.12, 0.3, 0.55]] as const;
/** Support layers' light (pale), the accent's. */
const PALE = 0.55;
const ACCENT = 1;
const CLUSTER_N = 64;
const GROW_S = 0.2;
const BREAK_S = 0.4;
const SHELL_CAP = 128;
export type IceLayerSound = "crystal-grow" | "crack-spread" | "crystal-shatter" | "cold-wind";

const IDS = ["ice-charge", "ice-caster-seal", "ice-sparkle", "ice-release", "ice-ring-burst", "ice-wave", "ice-ground-mark", "ice-impact", "ice-hit-affliction", "ice-big-burst", "ice-pillar"] as const;
type Id = typeof IDS[number];
const V2_IDS: readonly Id[] = IDS.filter((id) => id !== "ice-pillar" && id !== "ice-hit-affliction");
const V3_IDS: readonly Id[] = V2_IDS.filter((id) => id !== "ice-ground-mark");
/** Cards laid flat on the ground (the rest face the camera). */
const FLAT: ReadonlySet<Id> = new Set<Id>(["ice-caster-seal", "ice-ground-mark"]);
/** The travelling front: this many ice-wave segments round the ring, each turned along it, this tall (m). */
const FRONT_N = 24;
const FRONT_H = 1.7;
const CAPACITY: Readonly<Partial<Record<Id, number>>> = { "ice-wave": FRONT_N + 4, "ice-ground-mark": 160, "ice-hit-affliction": 128, "ice-impact": 128, "ice-big-burst": 128, "ice-sparkle": 96 };

export interface IceUltHost {
  readonly targets: TargetField;
  hand(out: THREE.Vector3): void;
  /** The caster's feet (y 0). */
  caster(out: THREE.Vector3): void;
  /** The cast: the release event, the body, the sound, the music's pre-duck (`firstS`: the first shatter). */
  release(at: THREE.Vector3, firstS: number): void;
  /** Foe `i` freezes for `seconds`: its bind rim, held still. */
  freeze(i: number, seconds: number): void;
  /** The blow on foe `i` as its shell shatters (numbers, reaction, death); true: it killed. */
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** A strike's screen tier, kick and light at `at` (the first shatter: primary). */
  strike(at: THREE.Vector3, role: ImpactRole): void;
  /** The cold light dip and blue tint as the ring leaves (0–1). */
  cold(strength: number): void;
  upload?(texture: THREE.Texture): void;
  /** Optional shared lab audio bus adapter; never creates a second AudioContext. */
  sound?(event: IceLayerSound, at: THREE.Vector3, pitch: number): void;
}

/** What the last cast did (__lab.iceUlt). */
export interface IceUltReport {
  frozen: number;
  shattered: number;
  kills: number;
  marks: number;
  spikes: number;
  /** Seconds after the key: the ring's release, the first freeze and the first and last shatters. */
  releaseAt: number;
  firstFreezeAt: number;
  firstShatterAt: number;
  lastShatterAt: number;
  version?: "v1" | "v2" | "v3";
  clusters?: number;
  clusterHeightM?: readonly [number, number];
  meshDraws?: number;
  bindDraws?: number;
  bindInstancesPerFoe?: { mist: number; shards: number; flakes: number; dust: number };
  tintedFoes?: number;
  truncatedBinds?: number;
  soundEvents?: Record<IceLayerSound, number>;
  soundWired?: boolean;
  truncatedShells?: number;
  assetsReady?: boolean;
}

interface Foe { i: number; freezeAt: number; frozen: boolean; shattered: boolean; dx: number; dz: number }
interface Timed { at: number; x: number; z: number; done: boolean }

export class IceUltLayered {
  readonly player: FlipbookPlayer;
  /** Layered (true) or the old scene video (false): the lab's toggle. */
  layered: boolean;
  private readonly pools = new Map<Id, FlipbookPool>();
  private loading = false;
  private t = -1;
  private foes: Foe[] = [];
  private marks: Timed[] = [];
  private spikes: Timed[] = [];
  private released = false;
  private readonly origin = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly options: FlipOptions = {};
  private readonly scratch = new Int32Array(256);
  private moteAcc = 0;
  private coldK = 0;
  private readonly meshes: IceCrystalField | null;
  private readonly sprites: IceSpriteField | null;
  private readonly version: "v1" | "v2" | "v3";
  private fog: FlipbookPool | null = null;
  private snow: FlipbookPool | null = null;
  private weatherAcc = 0;
  private glintTurn = 0;
  private growSoundAt = 0;
  private breakSoundAt = 0;
  last: IceUltReport | null = null;

  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: IceUltHost, layered = true) {
    this.layered = layered;
    this.player = new FlipbookPlayer(base);
    this.player.group.name = "fx-ice-ult-layered";
    parent.add(this.player.group);
    const requested = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("iceVersion");
    this.version = requested === "v1" || requested === "v2" ? requested : "v3";
    this.meshes = this.version === "v2" ? new IceCrystalField(this.player.group) : null;
    this.sprites = this.version === "v3" ? new IceSpriteField(this.player.group) : null;
  }

  get active(): boolean {
    return this.t >= 0;
  }

  get ready(): boolean {
    return this.ids.every((id) => this.pools.has(id)) && (this.sprites === null || this.sprites.ready);
  }

  private get ids(): readonly Id[] { return this.version === "v1" ? IDS : this.version === "v2" ? V2_IDS : V3_IDS; }

  /** Loads the ice kit's clips this recipe uses (once). */
  prepare(): void {
    this.sprites?.bindTargets(this.host.targets);
    if (this.sprites !== null) void this.sprites.prepare(this.base, (t) => this.host.upload?.(t)).then(() => {
      if (this.last !== null) this.last.assetsReady = this.ready;
    });
    const ids = this.ids;
    if (this.loading || this.ready) return;
    this.loading = true;
    const lib = this.player.library("ice", () => true);
    void lib.load().then(async () => {
      for (const id of ids) {
        if (this.pools.has(id) || !(await lib.fetchAtlas(id))) continue;
        const e = lib.get(id);
        if (e !== null) this.adopt(e.meta, e.texture);
      }
    }).catch((error: unknown) => console.warn("[ice-ult-layered]", error)).finally(() => { this.loading = false; });
  }

  /** A clip of the kit (also lets tests feed it without a renderer). */
  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    const id = meta.id as Id;
    if (!IDS.includes(id) || this.pools.has(id)) return;
    this.player.library("ice", () => true).add(meta, texture);
    this.host.upload?.(texture);
    const pool = this.player.pool("ice", id, { mode: meta.mode, capacity: CAPACITY[id] ?? 32, renderOrder: FLAT.has(id) ? 6 : 13 });
    if (FLAT.has(id)) layFlat(pool);
    // Ice cools white → pale blue → deep blue as it erodes (the default ramp is fire's amber), and no card shows its edges.
    pool.setRamp(ICE_RAMP[0], ICE_RAMP[1], ICE_RAMP[2]);
    pool.setHeatRamp(ICE_RAMP[2], ICE_RAMP[1], ICE_RAMP[0]);
    pool.setSoot(0.01, 0.03, 0.06);
    pool.softM = 0.25;
    pool.vignette = 0.5;
    this.pools.set(id, pool);
    if (this.meshes !== null && id === "ice-ground-mark") this.meshes.texture(meta, texture);
    if (this.meshes !== null && (id === "ice-wave" || id === "ice-sparkle")) {
      const alias = id === "ice-wave" ? "ice-low-mist" : "ice-snow-flecks";
      this.player.library("ice").add({ ...meta, id: alias, ...(id === "ice-wave" ? { aspect: 8.4 } : {}) }, texture);
      const p = this.player.pool("ice", alias, { mode: id === "ice-wave" ? "smoke" : "fire", capacity: id === "ice-wave" ? 18 : 128, renderOrder: 9 });
      p.softM = 0.4;
      p.vignette = 0.6;
      if (id === "ice-wave") this.fog = p;
      else this.snow = p;
    }
    if (this.last !== null) this.last.assetsReady = this.ready;
  }

  private opts(): FlipOptions {
    const o = this.options;
    for (const k of Object.keys(o) as (keyof FlipOptions)[]) o[k] = undefined;
    o.frame = 0; o.rate = 1; o.alpha = 1; o.intensity = PALE; o.fadeIn = 0; o.fadeOut = 0; o.cool = 0.55; o.lift = 0.15; o.occlude = 0;
    return o;
  }

  /** A one-shot of `id`: to its peak in `attackS`, the rest over `tailS` (fast attack, slow decay, eroding). */
  private once(id: Id, at: THREE.Vector3, size: number, attackS: number, tailS: number, o: FlipOptions = this.opts()): void {
    const pool = this.pools.get(id), m = pool?.meta;
    if (pool === undefined || m == null) return;
    const last = m.frames - 1;
    const peak = Math.min(last - 1, Math.max(m.start, m.peak ?? Math.round(m.start + (last - m.start) * 0.35)));
    o.frame = m.start;
    if (peak > m.start) {
      o.rate = (peak - m.start) / (m.fps * attackS);
      o.slowFrom = peak;
      o.slowRate = (last + 1 - peak) / (m.fps * tailS);
    } else o.rate = (last + 1 - m.start) / (m.fps * tailS);
    pool.spawn(at, size, o);
  }

  /** Key 8 on this ultimate: the charge now, the release at CHARGE_S; the foes, marks and spikes planned from the field. */
  cast(): IceUltReport {
    this.prepare();
    this.clear();
    this.t = 0;
    this.released = false;
    this.host.caster(this.origin);
    const T = this.host.targets;
    const ox = this.origin.x, oz = this.origin.z;
    // The foes the ring reaches, each when it gets there.
    for (let i = 0; i < T.size; i += 1) {
      if (!T.alive(i)) continue;
      const dx = T.x(i) - ox, dz = T.z(i) - oz;
      const d = Math.hypot(dx, dz);
      if (d > REACH_M) continue;
      const l = d || 1;
      this.foes.push({ i, freezeAt: CHARGE_S + d / RING_MPS, frozen: false, shattered: false, dx: dx / l, dz: dz / l });
    }
    // The frost grid behind the ring (staggered rows, a little jitter), in the field the ring crosses.
    let row = 0;
    if (this.version === "v1") for (let z = oz - REACH_M; z <= oz + 8; z += MARK_STEP_M * 0.87, row += 1) {
      for (let x = ox - REACH_M + (row % 2) * MARK_STEP_M * 0.5; x <= ox + REACH_M; x += MARK_STEP_M) {
        const jx = x + Math.sin(x * 12.9 + z * 7.3) * 1.2, jz = z + Math.cos(x * 4.1 + z * 9.7) * 1.2;
        const d = Math.hypot(jx - ox, jz - oz);
        // Inside the paving (40 × 26 m round z −5), a seal's half width from its edge.
        if (d > REACH_M || d < 1.5 || Math.abs(jx) > FIELD.halfX || jz < FIELD.zMin || jz > FIELD.zMax) continue;
        this.marks.push({ at: CHARGE_S + d / RING_MPS, x: jx, z: jz, done: false });
      }
    }
    // The accent at the densest groups (8 m cells), as many as the foes call for.
    const cells = new Map<string, { n: number; x: number; z: number; d: number }>();
    if (this.version === "v1") for (const f of this.foes) {
      const x = T.x(f.i), z = T.z(f.i);
      const key = Math.floor(x / 8) + ":" + Math.floor(z / 8);
      const c = cells.get(key) ?? { n: 0, x: 0, z: 0, d: 0 };
      c.n += 1; c.x += x; c.z += z; c.d = Math.max(c.d, f.freezeAt);
      cells.set(key, c);
    }
    const nSpikes = Math.max(SPIKES_MIN, Math.min(SPIKES_MAX, Math.round(this.foes.length / SPIKE_PER)));
    const best = [...cells.values()].sort((a, b) => b.n - a.n).slice(0, this.foes.length === 0 ? 0 : nSpikes);
    for (const c of best) this.spikes.push({ at: c.d + 0.05, x: c.x / c.n, z: c.z / c.n, done: false });
    const shatters = this.foes.map((f) => f.freezeAt + FREEZE_S);
    this.last = {
      frozen: 0, shattered: 0, kills: 0, marks: 0, spikes: 0, releaseAt: CHARGE_S,
      firstFreezeAt: this.foes.length > 0 ? Math.min(...this.foes.map((f) => f.freezeAt)) : -1,
      firstShatterAt: shatters.length > 0 ? Math.min(...shatters) : -1,
      lastShatterAt: shatters.length > 0 ? Math.max(...shatters) : -1,
      version: this.version,
      soundWired: this.host.sound !== undefined,
      assetsReady: this.ready,
      soundEvents: { "crystal-grow": 0, "crack-spread": 0, "crystal-shatter": 0, "cold-wind": 0 },
    };
    if (this.meshes !== null) {
      this.meshes.plan(this.origin, this.foes, T);
      this.last.clusters = this.meshes.clusters.length;
      this.last.clusterHeightM = this.meshes.heightRange;
      this.last.meshDraws = 7; // Four forest variants, shells, debris, continuous ground.
      this.last.truncatedShells = Math.max(0, this.foes.length - SHELL_CAP);
      this.last.spikes = this.meshes.clusters.length;
    }
    if (this.sprites !== null) {
      this.sprites.plan(this.origin, this.foes, T);
      this.last.clusters = this.sprites.clusters.length;
      this.last.clusterHeightM = this.sprites.heightRange;
      this.last.meshDraws = this.sprites.drawCount;
      this.last.bindDraws = this.sprites.bindDrawCount;
      this.last.bindInstancesPerFoe = this.sprites.bindInstancesPerFoe;
      this.last.truncatedShells = 0;
      this.last.truncatedBinds = Math.max(0, this.foes.length - this.sprites.bindCapacity);
      this.last.spikes = 1; // The single flower is the only focal accent.
    }
    // The charge: ice-charge at the hand, the seal flat under the feet (both pale, the release is brighter).
    this.host.hand(this.at);
    this.once("ice-charge", this.at, 1.8, CHARGE_S * 0.8, 0.5);
    const seal = this.opts();
    seal.life = CHARGE_S + 1.2; seal.rate = 1; seal.cool = 0.6; seal.intensity = PALE; seal.lift = 0.05;
    this.pools.get("ice-caster-seal")?.spawn(this.at.set(ox, 0.03, oz), 3.6, seal);
    this.host.release(this.at.set(ox, 0, oz - 8), Math.max(0, this.last.firstShatterAt));
    return this.last;
  }

  private sound(event: IceLayerSound, at: THREE.Vector3): void {
    const counts = this.last?.soundEvents;
    if (counts !== undefined) counts[event] += 1;
    this.host.sound?.(event, at, 0.96 + ((this.glintTurn++ * 0.6180339) % 1) * 0.08);
  }

  private weather(dt: number): void {
    const field = this.meshes;
    if (field === null) return;
    this.weatherAcc += dt * 30;
    while (this.weatherAcc >= 1) {
      this.weatherAcc -= 1;
      const k = this.glintTurn++, c = field.clusters[k % field.clusters.length];
      if (c === undefined || this.t < c.at || this.t > c.at + GROW_S + FREEZE_S + BREAK_S) continue;
      const o = this.opts();
      o.life = 0.45; o.fadeIn = 0.08; o.fadeOut = 0.2; o.intensity = 0.4;
      o.frame = k % 24; o.vy = 0.08;
      const tip = c.tips[k % c.tips.length]!;
      this.pools.get("ice-sparkle")?.spawn(this.at.set(c.x + tip.x, tip.y, c.z + tip.z), 0.22, o);
      const snow = this.opts();
      snow.life = 2.4; snow.rate = 0.25; snow.frame = k % 48; snow.fadeIn = 0.3; snow.fadeOut = 0.6;
      snow.intensity = 0.24; snow.vy = -0.65; snow.vx = 0.15; snow.vz = -0.05;
      this.snow?.spawn(this.at.set(c.x, 2.5 + random(k + 21) * 3.5, c.z), 0.18, snow);
      if (k % 6 !== 0 || this.t > CHARGE_S + REACH_M / RING_MPS + FREEZE_S) continue;
      const fog = this.opts();
      fog.life = 2.2; fog.fadeIn = 0.5; fog.fadeOut = 0.9; fog.alpha = 0.14; fog.intensity = 0.34;
      fog.tint = MIST_TINT; fog.frame = k % 20; fog.rate = 0.35; fog.vx = 0.35; fog.vz = -0.1;
      this.fog?.spawn(this.at.set(c.x, 0.42, c.z), 0.95, fog);
    }
  }

  /** World time: the release, the ring, the frost, the freezes and shatters, the spikes, the shells each frame. */
  update(dt: number): void {
    if (this.t < 0) {
      this.player.update(dt);
      return;
    }
    this.t += dt;
    const T = this.host.targets;
    const r = this.last!;
    // Frost motes round the caster while it gathers.
    if (!this.released) {
      this.moteAcc += dt * 24;
      const sp = this.pools.get("ice-sparkle");
      while (this.moteAcc >= 1 && sp?.meta != null) {
        this.moteAcc -= 1;
        const a = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * 0.9;
        const o = this.opts();
        o.life = 0.55; o.frame = Math.random() * sp.meta.frames; o.vx = -Math.cos(a) * rr / 0.55; o.vz = -Math.sin(a) * rr / 0.55; o.vy = 0.6;
        o.intensity = PALE; o.fadeOut = 0.2;
        sp.spawn(this.at.set(this.origin.x + Math.cos(a) * rr, 0.6 + Math.random(), this.origin.z + Math.sin(a) * rr), 0.45, o);
      }
    }
    if (!this.released && this.t >= CHARGE_S) {
      this.released = true;
      this.host.hand(this.at);
      this.once("ice-release", this.at, 2.4, 0.04, 0.6);
      // The crystal ring bursts round the caster (its shards keep their size: the front carries the reach).
      const ring = this.opts();
      ring.life = 0.9; ring.grow = 1.3; ring.intensity = 0.55; ring.cool = 0.45; ring.lift = 0.3;
      this.pools.get("ice-ring-burst")?.spawn(this.at.set(this.origin.x, 1.1, this.origin.z), 3.2, ring);
      this.coldK = 1;
      if (this.version !== "v1") {
        this.sound("crack-spread", this.origin);
        this.sound("cold-wind", this.origin);
      }
    }
    // The cold dip: in at the release, out over the ring's run.
    if (this.coldK > 0) {
      this.coldK = Math.max(0, this.coldK - dt / (REACH_M / RING_MPS + 0.6));
      this.host.cold(this.coldK);
    }
    // The cold front: ice-wave segments round a circle widening at RING_MPS, turned along it, paling as it goes.
    const wave = this.pools.get("ice-wave");
    wave?.clear();
    const run = this.t - CHARGE_S;
    const radius = run * RING_MPS;
    if (this.released && wave?.meta != null && radius > 0.5 && radius < REACH_M) {
      const arc = (Math.PI * 2 * radius) / FRONT_N;
      for (let k = 0; k < FRONT_N; k += 1) {
        const a = (k / FRONT_N) * Math.PI * 2;
        const o = this.opts();
        o.life = ONE_FRAME; o.rate = 0; o.frame = (run * wave.meta.fps + k * 3) % wave.meta.frames;
        o.dir = this.tangent.set(-Math.sin(a), 0, Math.cos(a)); o.span = arc * 1.2;
        o.intensity = 0.75 * (1 - 0.55 * (radius / REACH_M)); o.cool = 0; o.lift = 0.2;
        wave.spawn(this.at.set(this.origin.x + Math.cos(a) * radius, FRONT_H * 0.45, this.origin.z + Math.sin(a) * radius), FRONT_H, o);
      }
    }
    if (this.version === "v1") for (const m of this.marks) {
      if (m.done || this.t < m.at) continue;
      m.done = true;
      r.marks += 1;
      const o = this.opts();
      o.life = LINGER_S + 0.8; o.rate = 1; o.cool = 0.5; o.intensity = 0.32; o.rot = (m.x * 3.7 + m.z) % (Math.PI * 2); o.lift = 0.02;
      this.pools.get("ice-ground-mark")?.spawn(this.at.set(m.x, 0.02, m.z), MARK_M, o);
    }
    if (this.version === "v1") for (const s of this.spikes) {
      if (s.done || this.t < s.at) continue;
      s.done = true;
      r.spikes += 1;
      const o = this.opts();
      o.intensity = ACCENT; o.cool = 0.5;
      this.once("ice-pillar", this.at.set(s.x, 0, s.z), 8, 0.18, 1.6, o);
    }
    let first = r.shattered === 0;
    for (let slot = 0; slot < this.foes.length; slot += 1) {
      const f = this.foes[slot]!;
      if (f.shattered) continue;
      if (!T.alive(f.i)) {
        f.shattered = true;
        this.meshes?.hide(slot);
        this.sprites?.hide(slot);
        continue;
      }
      if (!f.frozen && this.t >= f.freezeAt) {
        f.frozen = true;
        if (!T.alive(f.i)) { f.shattered = true; continue; }
        r.frozen += 1;
        this.host.freeze(f.i, FREEZE_S);
        this.meshes?.freeze(slot, f, T);
        this.sprites?.freeze(slot, f, T);
        const o = this.opts();
        o.intensity = PALE;
        // V3 keeps the torso open even on the first freeze frame; its painted burst stays at the feet.
        if (this.version === "v3") { o.alpha = 0.18; o.intensity = 0.3; }
        this.once("ice-impact", this.at.set(T.x(f.i), this.version === "v3" ? 0.12 : T.midY(f.i), T.z(f.i)),
          this.version === "v3" ? Math.max(0.35, T.radius(f.i) * 0.8) : Math.max(1.1, T.radius(f.i) * 2.6), 0.05, 0.5, o);
      }
      if (f.frozen && !f.shattered && this.t >= f.freezeAt + FREEZE_S) {
        f.shattered = true;
        if (!T.alive(f.i)) continue;
        this.at.set(T.x(f.i), T.midY(f.i), T.z(f.i));
        const o = this.opts();
        o.intensity = 0.75;
        this.once("ice-big-burst", this.at, Math.max(1.4, T.radius(f.i) * 3.2), 0.04, 0.7, o);
        r.shattered += 1;
        if (first) {
          this.host.strike(this.at, "primary");
          this.meshes?.flash(this.t);
          this.sprites?.flash(this.t);
          first = false;
        }
        if (this.host.blow(f.i, f.dx, f.dz, 1, r.shattered === 1 ? "primary" : "secondary")) r.kills += 1;
      }
    }
    // The ice shells: drawn this frame on every frozen foe, eroding through their last third.
    const shell = this.pools.get("ice-hit-affliction");
    shell?.clear();
    if (this.version === "v1" && shell?.meta != null) {
      for (const f of this.foes) {
        if (!f.frozen || f.shattered || !T.alive(f.i)) continue;
        const age = this.t - f.freezeAt;
        const o = this.opts();
        o.life = ONE_FRAME; o.rate = 0; o.frame = (age * shell.meta.fps) % shell.meta.frames; o.intensity = 0.6;
        o.erode = Math.max(0, (age / FREEZE_S - 0.7) / 0.3);
        shell.spawn(this.at.set(T.x(f.i), T.midY(f.i), T.z(f.i)), Math.max(1.2, (T.radius(f.i) * 3) / shell.meta.aspect), o);
      }
    }
    if (this.meshes !== null) {
      if (this.t >= this.growSoundAt && this.t < CHARGE_S + REACH_M / RING_MPS + GROW_S) {
        const c = this.meshes.clusters.find((v) => this.t >= v.at && this.t <= v.at + GROW_S);
        if (c !== undefined) { this.sound("crystal-grow", this.at.set(c.x, 0, c.z)); this.growSoundAt = this.t + 0.16; }
      }
      if (this.t >= this.breakSoundAt) {
        const c = this.meshes.clusters.find((v) => this.t >= v.at + GROW_S + FREEZE_S && this.t <= v.at + GROW_S + FREEZE_S + BREAK_S);
        if (c !== undefined) { this.sound("crystal-shatter", this.at.set(c.x, 1, c.z)); this.breakSoundAt = this.t + 0.16; }
      }
      this.weather(dt);
      this.meshes.update(this.t);
      r.marks = this.released ? 1 : 0;
    }
    if (this.sprites !== null) {
      const clusters = this.sprites.clusters;
      if (this.t >= this.growSoundAt && clusters.some((c) => this.t >= c.at && this.t <= c.at + GROW_S)) {
        this.sound("crystal-grow", this.origin); this.growSoundAt = this.t + 0.16;
      }
      // The earliest shell or bouquet fracture supplies the sound, throttled as in v2.
      if (this.t >= this.breakSoundAt && (this.foes.some((f) => f.frozen && this.t >= f.freezeAt + FREEZE_S && this.t < f.freezeAt + FREEZE_S + BREAK_S)
        || clusters.some((c) => this.t >= c.at + GROW_S + FREEZE_S && this.t < c.at + GROW_S + FREEZE_S + BREAK_S))) {
        this.sound("crystal-shatter", this.origin); this.breakSoundAt = this.t + 0.16;
      }
      this.sprites.update(this.t);
      r.tintedFoes = this.sprites.tintedFoes;
      r.marks = this.released ? 1 : 0;
    }
    this.player.update(dt);
    if (this.t > r.lastShatterAt + LINGER_S + 1 && this.t > CHARGE_S + REACH_M / RING_MPS + (this.version === "v1" ? 0 : FREEZE_S) + LINGER_S + 1) {
      this.t = -1;
      this.meshes?.clear();
      this.sprites?.clear();
    }
  }

  /** Foes this cast holds in place (the scratch list of indices; for checks). */
  frozenNow(): number {
    let n = 0;
    for (const f of this.foes) if (f.frozen && !f.shattered && n < this.scratch.length) this.scratch[n++] = f.i;
    return n;
  }

  clear(): void {
    this.t = -1;
    this.foes = [];
    this.marks = [];
    this.spikes = [];
    this.coldK = 0;
    this.moteAcc = 0;
    this.weatherAcc = 0;
    this.glintTurn = 0;
    this.growSoundAt = CHARGE_S;
    this.breakSoundAt = 0;
    this.meshes?.clear();
    this.sprites?.clear();
    this.host.cold(0);
    this.player.clear();
  }
}

/** ?ultIce=video keeps the old scene video; default (or ?ultIce=layered): the layered rebuild. */
export function iceUltLayeredDefault(search: string): boolean {
  return new URLSearchParams(search).get("ultIce") !== "video";
}

const MIST_TINT = new THREE.Color(0.42, 0.61, 0.72);
const random = (n: number): number => { const k = Math.sin(n * 127.1 + 311.7) * 43758.5453; return k - Math.floor(k); };
interface Cluster {
  x: number; z: number; at: number; height: number; width: number; yaw: number; variant: number;
  tips: THREE.Vector3[];
}
interface CrystalShape { geometry: THREE.BufferGeometry; tips: THREE.Vector3[] }

/** Closed, bevel-shouldered prisms. Four reusable bouquets, never a billboard or a baked creature. */
function crystalShape(variant: number, single = false): CrystalShape {
  const positions: number[] = [], tips: THREE.Vector3[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const n = single ? 1 : [5, 7, 8, 6][variant]!;
  for (let j = 0; j < n; j += 1) {
    const seed = variant * 23 + j * 7;
    const angle = j * 2.39996 + variant * 0.7;
    const h = j === 0 ? 1 : 0.32 + random(seed) * 0.52;
    const spread = j === 0 ? 0 : 0.26 + random(seed + 1) * 0.28;
    const cx = Math.cos(angle) * spread, cz = Math.sin(angle) * spread;
    const lean = j === 0 ? 0.08 : 0.14 + random(seed + 2) * 0.2;
    const radius = j === 0 ? 0.22 : 0.11 + random(seed + 3) * 0.09;
    const sides = variant % 2 === 0 ? 6 : 5;
    const rings: THREE.Vector3[][] = [];
    for (let r = 0; r < 3; r += 1) {
      const y = [0, 0.12, 0.72][r]! * h, rr = radius * [0.68, 1, 0.78][r]!;
      rings.push(Array.from({ length: sides }, (_, k) => {
        const a = k / sides * Math.PI * 2 + variant * 0.18;
        return new THREE.Vector3(cx + Math.cos(a) * rr + Math.cos(angle) * lean * y, y, cz + Math.sin(a) * rr + Math.sin(angle) * lean * y);
      }));
    }
    const tip = new THREE.Vector3(cx + Math.cos(angle) * lean * h, h, cz + Math.sin(angle) * lean * h);
    tips.push(tip);
    for (let k = 0; k < sides; k += 1) {
      const next = (k + 1) % sides;
      for (let r = 0; r < 2; r += 1) {
        const a = rings[r]![k]!, b = rings[r + 1]![k]!, c = rings[r + 1]![next]!, d = rings[r]![next]!;
        tri(a, b, c); tri(a, c, d);
      }
      tri(rings[2]![k]!, tip, rings[2]![next]!);
      tri(new THREE.Vector3(cx, 0, cz), rings[0]![k]!, rings[0]![next]!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return { geometry: faceted(geometry), tips };
}

function faceted(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index === null ? geometry : geometry.toNonIndexed();
  const count = g.getAttribute("position").count;
  const bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) bary[i * 3 + i % 3] = 1;
  g.setAttribute("iceBary", new THREE.BufferAttribute(bary, 3));
  g.computeVertexNormals();
  if (g !== geometry) geometry.dispose();
  return g;
}

const CRYSTAL_VERTEX = /* glsl */ `
attribute vec4 iceLife;
attribute vec3 iceBary;
uniform float uTime;
uniform float uKind;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBary;
varying vec3 vLocal;
varying float vFade;
void main() {
  float age = uTime - iceLife.x;
  vec3 p = position;
  float grow = smoothstep(0.0, ${GROW_S.toFixed(1)}, age);
  float end = uKind < 0.5 ? ${(GROW_S + FREEZE_S).toFixed(1)} : ${FREEZE_S.toFixed(1)};
  float broken = clamp((age - end) / ${BREAK_S.toFixed(1)}, 0.0, 1.0);
  vFade = step(0.0, age) * (1.0 - smoothstep(0.0, 1.0, broken));
  if (uKind > 1.5) {
    float f = clamp(age / ${BREAK_S.toFixed(1)}, 0.0, 1.0);
    float a = iceLife.y * 6.283185;
    float turn = f * (3.0 + iceLife.z * 6.0);
    p.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xz;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    w.xyz += vec3(cos(a) * (1.0 + iceLife.z) * f, sin(f * 3.14159) * (0.3 + iceLife.z) - f * f * 0.7, sin(a) * (1.0 + iceLife.z) * f);
    vWorld = w.xyz;
    vFade = step(0.0, age) * (1.0 - smoothstep(0.05, ${BREAK_S.toFixed(1)}, age));
  } else {
    p.y *= grow;
    p += normal * broken * broken * 0.25;
    vWorld = (modelMatrix * instanceMatrix * vec4(p, 1.0)).xyz;
  }
  mat3 m = mat3(instanceMatrix);
  vec3 lengths = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]));
  vNormal = normalize(mat3(modelMatrix) * m * (normal / max(lengths, vec3(0.0001))));
  vBary = iceBary;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  if (vFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const CRYSTAL_FRAGMENT = /* glsl */ `
uniform sampler2D uCracks;
uniform vec4 uTile;
uniform float uTextured;
uniform float uFlash;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBary;
varying vec3 vLocal;
varying float vFade;
void main() {
  if (vFade < 0.005) discard;
  vec3 n = normalize(vNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(n, eye)), 3.0);
  vec3 fw = max(fwidth(vBary), vec3(0.001));
  vec3 edge = smoothstep(vec3(0.0), fw * 0.85, vBary);
  float rim = 1.0 - min(edge.x, min(edge.y, edge.z));
  // Existing painted cracks supply the inclusions; the facets offset them like thin refracting ice.
  vec2 refracted = fract(vWorld.xz * 0.22 + vLocal.xy * 0.3 + n.xz * 0.035);
  vec3 tex = texture2D(uCracks, uTile.xy + mix(vec2(0.015), vec2(0.985), refracted) * uTile.zw).rgb;
  float inclusion = max(tex.r, max(tex.g, tex.b)) * uTextured;
  float facet = 0.5 + 0.5 * dot(n, normalize(vec3(-0.4, 0.85, 0.3)));
  float glint = pow(max(0.0, dot(reflect(-normalize(vec3(-0.4, 0.85, 0.3)), n), eye)), 36.0);
  vec3 body = mix(vec3(0.075, 0.23, 0.36), vec3(0.49, 0.75, 0.87), facet);
  body += vec3(0.18, 0.24, 0.25) * fresnel + vec3(0.25, 0.27, 0.29) * rim;
  body += inclusion * vec3(0.12, 0.18, 0.2) + glint * vec3(0.18);
  body = min(body, vec3(0.9));
  float core = pow(max(0.0, 1.0 - length(vLocal.xz) * 4.0), 5.0);
  vec3 accent = vec3(0.82, 0.94, 1.0) * 4.0 * uFlash * core;
  gl_FragColor = vec4(body + accent, (0.32 + 0.22 * fresnel + 0.27 * rim + inclusion * 0.07) * vFade);
}`;

const GROUND_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;
const GROUND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec2 uOrigin;
uniform sampler2D uCracks;
uniform vec4 uTile;
uniform float uTextured;
varying vec3 vWorld;
void main() {
  float d = distance(vWorld.xz, uOrigin);
  float age = uTime - ${CHARGE_S.toFixed(1)} - d / ${RING_MPS.toFixed(1)};
  float grown = smoothstep(0.0, 0.13, age) * (1.0 - smoothstep(${(REACH_M - 0.5).toFixed(1)}, ${REACH_M.toFixed(1)}, d));
  float melt = 1.0 - smoothstep(${FREEZE_S.toFixed(1)}, ${(FREEZE_S + LINGER_S).toFixed(1)}, age);
  float border = min(${FIELD.halfX.toFixed(1)} - abs(vWorld.x), min(vWorld.z - ${FIELD.zMin.toFixed(1)}, ${FIELD.zMax.toFixed(1)} - vWorld.z));
  float alpha = grown * melt * smoothstep(0.0, 0.5, border);
  if (alpha < 0.005) discard;
  vec2 tile = fract(vWorld.xz / 6.5);
  vec3 tex = texture2D(uCracks, uTile.xy + mix(vec2(0.012), vec2(0.988), tile) * uTile.zw).rgb;
  float crack = max(tex.r, max(tex.g, tex.b)) * uTextured;
  vec3 eye = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(eye.y), 4.0);
  float sheen = pow(max(0.0, dot(eye, normalize(vec3(0.35, 0.85, -0.4)))), 32.0);
  vec3 color = vec3(0.23, 0.46, 0.59) + crack * vec3(0.22, 0.3, 0.3) + fresnel * vec3(0.08, 0.11, 0.13) + sheen * vec3(0.12);
  gl_FragColor = vec4(min(color, vec3(0.9)), alpha * (0.16 + crack * 0.26 + fresnel * 0.12));
}`;

/** Seven bounded mesh draws; transforms upload at cast/freeze only, growth and fracture run on the GPU. */
class IceCrystalField {
  readonly clusters: Cluster[] = [];
  heightRange: readonly [number, number] = [0, 0];
  private readonly group = new THREE.Group();
  private readonly shapes = Array.from({ length: 4 }, (_, i) => crystalShape(i));
  private readonly time = { value: -1 };
  private readonly accent = { value: 0 };
  private readonly origin = { value: new THREE.Vector2() };
  private readonly map = { value: new THREE.Texture() };
  private readonly tile = { value: new THREE.Vector4(0, 0, 1, 1) };
  private readonly textured = { value: 0 };
  private readonly forest: THREE.InstancedMesh[];
  private readonly shells: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  private readonly ground: THREE.Mesh;
  private readonly dummy = new THREE.Object3D();
  private flashAt = -100;

  constructor(parent: THREE.Object3D) {
    this.group.name = "fx-ice-ult-3d";
    parent.add(this.group);
    this.forest = this.shapes.map((s, i) => this.batch(s.geometry, CLUSTER_N, 0, "crystal-" + i));
    const hull = faceted(new THREE.IcosahedronGeometry(1, 1));
    this.shells = this.batch(hull, SHELL_CAP, 1, "closed-shells");
    this.debris = this.batch(crystalShape(0, true).geometry, CLUSTER_N * 5 + SHELL_CAP * 3, 2, "shards");
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms(), vertexShader: GROUND_VERTEX, fragmentShader: withTagMask(GROUND_FRAGMENT),
      transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfX * 2, FIELD.zMax - FIELD.zMin), material);
    this.ground.name = "fx-ice-ult-3d-continuous-ground";
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0.035, (FIELD.zMin + FIELD.zMax) / 2);
    this.ground.renderOrder = 7;
    this.group.add(this.ground);
    this.clear();
  }

  private uniforms(): Record<string, THREE.IUniform> {
    return { ...TAG_UNIFORMS, uTime: this.time, uOrigin: this.origin, uCracks: this.map, uTile: this.tile, uTextured: this.textured, uFlash: this.accent };
  }

  private batch(geometry: THREE.BufferGeometry, capacity: number, kind: number, name: string): THREE.InstancedMesh {
    geometry.setAttribute("iceLife", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms(), uKind: { value: kind } }, vertexShader: CRYSTAL_VERTEX, fragmentShader: withTagMask(CRYSTAL_FRAGMENT),
      transparent: true, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = "fx-ice-ult-3d-" + name;
    mesh.renderOrder = kind === 1 ? 12 : 10;
    mesh.frustumCulled = false; // The vertex shader grows and throws the instances past their static bounds.
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return mesh;
  }

  texture(meta: FlipbookMeta, texture: THREE.Texture): void {
    this.map.value = texture;
    const frame = Math.min(meta.frames - 1, meta.peak ?? Math.floor(meta.frames * 0.4));
    this.tile.value.set(frame % meta.cols / meta.cols, 1 - (Math.floor(frame / meta.cols) + 1) / meta.rows, 1 / meta.cols, 1 / meta.rows);
    this.textured.value = 1;
  }

  private put(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, birth: number, seed: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    const a = mesh.geometry.getAttribute("iceLife") as THREE.InstancedBufferAttribute;
    a.setXYZW(index, birth, random(seed), random(seed + 1), 0);
    a.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.max(mesh.count, index + 1);
  }

  plan(origin: THREE.Vector3, foes: readonly Foe[], targets: TargetField): void {
    this.clear();
    this.group.visible = true;
    this.origin.value.set(origin.x, origin.z);
    const add = (x: number, z: number): void => {
      const d = Math.hypot(x - origin.x, z - origin.z);
      if (d > REACH_M || d < 2.5 || this.clusters.length >= CLUSTER_N) return;
      const k = this.clusters.length, variant = k % 4;
      const height = 1 + 5 * (k % 4 === 0 ? 0.75 + random(k + 3) * 0.25 : random(k + 17) * 0.78);
      const width = 0.95 + random(k + 10) * 0.85, yaw = random(k + 7) * Math.PI * 2;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const tips = this.shapes[variant]!.tips.map((p) => new THREE.Vector3((cs * p.x + sn * p.z) * width, p.y * height, (-sn * p.x + cs * p.z) * width));
      this.clusters.push({ x, z, at: CHARGE_S + d / RING_MPS, height, width, yaw, variant, tips });
    };
    // The whole paving first: staggered rows, alternating tall/low bouquets. Keep a path round the caster.
    for (let row = 0; row < 6; row += 1) for (let col = 0; col < 8; col += 1) {
      const k = row * 8 + col;
      add(-16.7 + col * 4.65 + (random(k + 5) - 0.5) * 1.2, -15 + row * 3.85 + (random(k + 9) - 0.5) * 1.1);
    }
    // Extra bouquets at the densest live groups, rather than just along a decorative perimeter.
    const cells = new Map<string, { n: number; x: number; z: number }>();
    for (const f of foes) {
      const x = targets.x(f.i), z = targets.z(f.i), key = Math.floor(x / 4) + ":" + Math.floor(z / 4);
      const c = cells.get(key) ?? { n: 0, x: 0, z: 0 };
      c.n += 1; c.x += x; c.z += z; cells.set(key, c);
    }
    const dense = [...cells.values()].sort((a, b) => b.n - a.n);
    for (let k = 0; this.clusters.length < CLUSTER_N && k < 512; k += 1) {
      const c = dense.length === 0 ? undefined : dense[k % Math.min(8, dense.length)];
      const a = k * 2.39996, r = 1.2 + random(k + 30) * 2.8;
      const x = c === undefined ? -17 + random(k + 41) * 34 : c.x / c.n + Math.cos(a) * r;
      const z = c === undefined ? -15.5 + random(k + 43) * 21 : c.z / c.n + Math.sin(a) * r;
      add(THREE.MathUtils.clamp(x, -17.6, 17.6), THREE.MathUtils.clamp(z, -15.8, 5.8));
    }
    const counts = [0, 0, 0, 0];
    for (let k = 0; k < this.clusters.length; k += 1) {
      const c = this.clusters[k]!, mesh = this.forest[c.variant]!;
      this.put(mesh, counts[c.variant]!, c.x, 0, c.z, c.width, c.height, c.width, c.yaw, c.at, k);
      counts[c.variant]! += 1;
      for (let j = 0; j < 5; j += 1) {
        const seed = k * 5 + j, a = random(seed + 99) * Math.PI * 2, r = random(seed + 101) * c.width * 0.6;
        const scale = 0.12 + random(seed + 111) * 0.22;
        this.put(this.debris, seed, c.x + Math.cos(a) * r, c.height * (0.2 + random(seed + 106) * 0.7), c.z + Math.sin(a) * r,
          scale, scale * 2.8, scale, a, c.at + GROW_S + FREEZE_S, seed);
      }
    }
    this.heightRange = this.clusters.length === 0 ? [0, 0] : [Math.min(...this.clusters.map((c) => c.height)), Math.max(...this.clusters.map((c) => c.height))];
  }

  freeze(slot: number, foe: Foe, targets: TargetField): void {
    if (slot >= SHELL_CAP) return;
    const h = targets.midY(foe.i) / 0.55, radius = targets.radius(foe.i) * 2.15;
    const x = targets.x(foe.i), z = targets.z(foe.i);
    // Closed ellipsoid covers the full body in every yaw; the host owns and holds the real model.
    this.put(this.shells, slot, x, h * 0.52, z, radius, h * 0.61, radius, slot * 0.37, foe.freezeAt, slot + 200);
    for (let j = 0; j < 3; j += 1) {
      const seed = slot * 3 + j, size = Math.min(0.38, radius * 0.23);
      this.put(this.debris, CLUSTER_N * 5 + seed, x, h * (0.3 + j * 0.22), z, size, size * 2, size,
        seed, foe.freezeAt + FREEZE_S, seed + 400);
    }
  }

  hide(slot: number): void {
    if (slot >= SHELL_CAP) return;
    const shell = this.shells.geometry.getAttribute("iceLife") as THREE.InstancedBufferAttribute;
    shell.setX(slot, 1e6); shell.needsUpdate = true;
    const shards = this.debris.geometry.getAttribute("iceLife") as THREE.InstancedBufferAttribute;
    for (let j = 0; j < 3; j += 1) shards.setX(CLUSTER_N * 5 + slot * 3 + j, 1e6);
    shards.needsUpdate = true;
  }

  flash(time: number): void {
    this.flashAt = time;
  }

  update(time: number): void {
    this.time.value = time;
    const age = time - this.flashAt;
    this.accent.value = age >= 0 && age < 0.09 ? Math.pow(1 - age / 0.09, 2) : 0;
  }

  clear(): void {
    this.group.visible = false;
    this.clusters.length = 0;
    this.time.value = -1;
    this.flashAt = -100;
    this.accent.value = 0;
    for (const mesh of [...this.forest, this.shells, this.debris]) {
      mesh.count = 0;
      const a = mesh.geometry.getAttribute("iceLife") as THREE.InstancedBufferAttribute;
      for (let i = 0; i < a.count; i += 1) a.setX(i, 1e6);
      a.needsUpdate = true;
    }
  }
}
