/**
 * The bench's beasts (canon §20.3 cases A and B): N beasts, 5 species × N/5
 * (Thạch Thử in clusters of 7), walking from gates A and B along the painted
 * corridors (Hỏa Nha straight in from the sky corners) to the heart, standing
 * there biting (attack clip) or circling, hit all the time (flash, recoil,
 * squash: the curves and tier rows of kit/feedback/reaction.ts, written inline
 * so no float crosses a call), dying (dissolve) and coming back at a gate.
 * A few elites (× 1.25, tinted); beasts inside the Kết Giới show the slow
 * tint. Every beast keeps its own clip time (VAT plays it; the walk runs at
 * the beast's own speed), so no two beasts move in step; deaths of the frame
 * are listed (ink smoke, case C) and strike() lands one extra blow (the
 * swords' hits of case C). View-only floats and a seeded xorshift: this is
 * not the sim. Crowd ids are the herd's own indices (stable), so a respawn
 * reuses its instance;
 * nothing allocates per frame: the hot loop passes no float to a call that V8
 * may not inline (it would box it; the step is a field, the RNG state a
 * Uint32Array), lengths are Math.sqrt (Math.hypot builds an array per call),
 * float fields start fractional (doubles from the first write) and the ring
 * list is fixed.
 * Owner: Lane 1.
 */
import { DRAGON } from "../../kit/feedback/profiles";
import { tier as tierRow } from "../../kit/feedback/tiers";
import { FIELD, FORMATION, STAGE_M0A } from "../../content/rules";
import type { SpeciesId } from "../../content/types";
import { CLIP, CROWD_LOOKS, TINT, type Crowd, type CrowdInstance, type CrowdRing } from "../crowd";
import { RANDOM_MASK, RANDOM_SIZE } from "../hitfx";
import { benchRoutes, BENCH_SPOTS } from "./field";

/** The bench mix (canon §20.3: 5 species × N/5). */
export const HERD_MIX: readonly SpeciesId[] = ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru"];

/** canon §10.2 walking speeds, m/s; the bench walks 1.5 × faster to keep the field busy. */
const SPEED_MS: Readonly<Partial<Record<SpeciesId, number>>> = { "thach-thu": 1.6, "phong-lang": 1.4, "hoa-nha": 2.0, "nham-vien": 1.0, "thiet-giap-tru": 1.0 };
const SPEED_SCALE = 1.5;
/** Hits a second over the herd (case B: "trúng đòn liên tục"), a quarter of them lethal on average. */
const HITS_PER_SECOND = 30;
const DISSOLVE_S = 0.6;
/** Seconds standing at the heart before the bench retires a beast (it comes back at a gate). */
const STAND_S = 5;
const FLYER_STAND_S = 7;
/** canon §10.3: elites are 3–5 % of the non-swarm beasts. */
const ELITE_SHARE = 0.04;
/** Nham Viên stops 11 m from its target to throw (canon §10.2, PB-17). */
const THROWER_STOP_M = 11;
/** kit/feedback/reaction.ts: a blow shows for 0.25 s; a weaker blow within 0.12 s does not cut a stronger one short. */
const REACT_S = 0.25;
const REACT_FRESH_S = 0.12;
/** Swarm member offsets round the cluster centre (metres), x and z flat: a centre and a ring of 6. */
const CLUSTER_SIZE = 7;
const CLUSTER_OFFSETS = new Float64Array(CLUSTER_SIZE * 2);
for (let k = 1; k < CLUSTER_SIZE; k += 1) {
  CLUSTER_OFFSETS[k * 2] = Math.cos(((k - 1) * Math.PI) / 3) * 0.8;
  CLUSTER_OFFSETS[k * 2 + 1] = Math.sin(((k - 1) * Math.PI) / 3) * 0.8;
}
/** The Kết Giới radius², m² (beasts inside it show the slow tint). */
const BARRIER_M2 = (FORMATION.barrierRadiusMm / 1000) ** 2;

type Phase = 0 | 1 | 2; // walk, stand, dying

interface HerdBeast {
  readonly index: number;
  readonly species: SpeciesId;
  readonly flyer: boolean;
  /** Swarm cluster index, −1 none; member slot in the cluster. */
  readonly cluster: number;
  readonly member: number;
  serial: number;
  phase: Phase;
  t: number;
  hp: number;
  /** Herd clock of the last blow (−1e9: none since the last spawn). */
  hitAt: number;
  elite: boolean;
  route: number;
  s: number;
  side: number;
  speed: number;
  x: number;
  z: number;
  heading: number;
  endX: number;
  endZ: number;
  angle: number;
  radius: number;
  clipTime: number;
  /** Seconds into the walk clip (advances with the beast's own speed): walkRate × real seconds. */
  walkTime: number;
  walkRate: number;
  /** Thiết Giáp Trư: the full ink outline. */
  readonly armoured: boolean;
}

interface Cluster {
  route: number;
  s: number;
  side: number;
  speed: number;
  phase: Phase;
  t: number;
  x: number;
  z: number;
  heading: number;
  endX: number;
  endZ: number;
}

/** xorshift32 in [0, 1) (view only); the state lives in a Uint32Array (a closure's number would be boxed each step). */
export function benchRandom(seed: number): () => number {
  const state = new Uint32Array(1);
  state[0] = seed >>> 0 || 1;
  return () => {
    let s = state[0]!;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    state[0] = s;
    return state[0]! / 4_294_967_296;
  };
}

/** A ground route as a polyline gate → bend → heart, with cumulative lengths. */
interface Route {
  readonly points: readonly (readonly [number, number])[];
  readonly cum: readonly number[];
  readonly length: number;
}

function route(points: readonly (readonly [number, number])[]): Route {
  const cum = [0];
  for (let k = 1; k < points.length; k += 1) cum.push(cum[k - 1]! + Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1]));
  return { points, cum, length: cum[cum.length - 1]! };
}

/** A ground walker's progress (beast or swarm cluster). */
interface Walker {
  route: number;
  s: number;
  side: number;
  speed: number;
  x: number;
  z: number;
  heading: number;
  endX: number;
  endZ: number;
}

export class Herd {
  readonly beasts: HerdBeast[] = [];
  private readonly clusters: Cluster[] = [];
  private readonly ground: Route[];
  private readonly sky: readonly (readonly [number, number])[];
  /** The last blow on each beast (kit Reactions' record, by herd index): tier and unit direction. */
  private readonly hitTier: Uint8Array;
  private readonly hitDirX: Float32Array;
  private readonly hitDirZ: Float32Array;
  // Fractional starts: these fields stay doubles from the first write (no map change in the hot loop).
  private readonly inst: CrowdInstance = { x: 0.5, y: 0.5, z: 0.5, heading: 0.5, clip: CLIP.move, clipTime: 0.5, flash: 0.5, squash: 1.5, dissolve: 0.5, tint: 0, size: 1.5, tintMix: 0.5, stride: 1.5, knockX: 0.5, knockZ: 0.5, outline: 1.5, elite: false };
  private readonly rings: CrowdRing[] = [];
  private readonly at = new Float64Array(4);
  /** View-only draws (the constructor's random function, RANDOM_SIZE of them) and their cursor. */
  private readonly rand = new Float32Array(RANDOM_SIZE);
  private rc = 0;
  private serial = 1;
  private hitCarry = 0.5;
  private now = 0.5;
  /** This update's step, seconds (read by walk(): a float argument would be boxed per call). */
  private stepDt = 0.5;
  /** Deaths of the last update: x, z (m) and body size (m), for the ink smoke. */
  readonly deathX = new Float32Array(64);
  readonly deathZ = new Float32Array(64);
  readonly deathSize = new Float32Array(64);
  deaths = 0;
  /** Blows a second the herd lands on itself (case B's "trúng đòn liên tục"). */
  hitsPerSecond = HITS_PER_SECOND;

  constructor(private readonly crowd: Crowd, readonly count: number, random: () => number) {
    // The draws go into a table read by a cursor: a call returning a double may box it.
    for (let k = 0; k < RANDOM_SIZE; k += 1) this.rand[k] = random();
    this.ground = benchRoutes().map((r) => route([r.gate, r.bend, [0, 0]]));
    this.sky = FIELD.skyEntries.map((e) => [e.xMm / 1000, e.zMm / 1000] as const);
    this.hitTier = new Uint8Array(Math.max(1, count));
    this.hitDirX = new Float32Array(Math.max(1, count));
    this.hitDirZ = new Float32Array(Math.max(1, count));
    const per = Math.floor(count / HERD_MIX.length);
    let placed = 0;
    HERD_MIX.forEach((species, k) => {
      const n = k === HERD_MIX.length - 1 ? count - placed : per;
      placed += n;
      for (let i = 0; i < n; i += 1) this.spawnInitial(species, i);
    });
    for (const beast of this.beasts) crowd.add(beast.index, beast.species);
    for (let k = 0; k < this.clusters.length; k += 1) this.rings.push({ x: 0.5, y: 0, z: 0.5, radius: 1.35, colour: CROWD_LOOKS["thach-thu"].colour, alpha: 0.85 });
  }

  /** Live beasts drawn. */
  get size(): number {
    return this.beasts.length;
  }

  private spawnInitial(species: SpeciesId, i: number): void {
    const flyer = species === "hoa-nha";
    let cluster = -1;
    let member = 0;
    if (species === "thach-thu") {
      cluster = Math.floor(i / STAGE_M0A.clusterSize);
      member = i % STAGE_M0A.clusterSize;
      if (member === 0) {
        const c: Cluster = { route: 0, s: 0.5, side: 0.5, speed: 0.5, phase: 0, t: 0.5, x: 0.5, z: 0.5, heading: 0.5, endX: 0.5, endZ: 0.5 };
        this.clusters.push(c);
        this.restartCluster(c, true);
      }
    }
    // Fractional starts: every float field is a double from the first write (no map change later).
    const beast: HerdBeast = {
      index: this.beasts.length,
      species,
      flyer,
      cluster,
      member,
      serial: 0,
      phase: 0,
      t: 0.5,
      hp: 0.5,
      hitAt: -1e9,
      elite: false,
      route: 0,
      s: 0.5,
      side: 0.5,
      speed: 0.5,
      x: 0.5,
      z: 0.5,
      heading: 0.5,
      endX: 0.5,
      endZ: 0.5,
      angle: 0.5,
      radius: 0.5,
      clipTime: 0.5,
      walkTime: 0.5,
      walkRate: 0.5,
      armoured: species === "thiet-giap-tru",
    };
    this.beasts.push(beast);
    this.restart(beast, true);
  }

  private restartCluster(c: Cluster, scatter: boolean): void {
    c.route = this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! < 0.5 ? 0 : 1;
    const r = this.ground[c.route]!;
    c.s = scatter ? this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * r.length * 0.9 : 0;
    c.side = (this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! - 0.5) * 4;
    c.speed = (SPEED_MS["thach-thu"] ?? 1.6) * SPEED_SCALE * (0.9 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.2);
    c.phase = 0;
    c.t = 0;
    this.pickEnd(c, r, 2.6 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 5.5);
    this.along(r, c, this.at);
    c.x = this.at[0]!;
    c.z = this.at[1]!;
  }

  /** Where a ground walker stops: a spot on its side of the heart at `radius`. */
  private pickEnd(target: { endX: number; endZ: number; route: number }, r: Route, radius: number): void {
    const bend = r.points[1]!;
    const base = Math.atan2(bend[0], bend[1]);
    const angle = base + (this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! - 0.5) * 2.2;
    target.endX = Math.sin(angle) * radius;
    target.endZ = Math.cos(angle) * radius;
  }

  private restart(beast: HerdBeast, scatter: boolean): void {
    beast.serial = this.serial++;
    beast.phase = 0;
    beast.t = 0;
    beast.hp = 1;
    beast.hitAt = -1e9;
    beast.clipTime = 0;
    // A fresh walk phase per beast (VAT plays it as is).
    beast.walkTime = this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 3;
    beast.elite = beast.cluster < 0 && this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! < ELITE_SHARE;
    beast.speed = (SPEED_MS[beast.species] ?? 1.4) * SPEED_SCALE * (0.85 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.3) * (beast.elite ? 1.15 : 1);
    beast.walkRate = beast.speed / ((SPEED_MS[beast.species] ?? 1.4) * SPEED_SCALE);
    if (beast.cluster >= 0) return;
    if (beast.flyer) {
      // From a sky corner, spread along the top edge so the flight lines do not stack.
      const entry = this.sky[this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! < 0.5 ? 0 : 1]!;
      const ex = entry[0] - Math.sign(entry[0]) * this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 6;
      const ez = entry[1] + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 3;
      const t = scatter ? this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.85 : 0;
      beast.x = ex * (1 - t);
      beast.z = ez * (1 - t);
      beast.radius = 3 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 3;
      beast.angle = Math.atan2(beast.x, beast.z);
      return;
    }
    beast.route = this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! < 0.5 ? 0 : 1;
    const r = this.ground[beast.route]!;
    beast.s = scatter ? this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * r.length * 0.95 : 0;
    beast.side = (this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! - 0.5) * 5.2;
    const stop = beast.species === "nham-vien" ? THROWER_STOP_M : BENCH_SPOTS.heartRadius + 0.8 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 6;
    this.pickEnd(beast, r, stop);
    // A scattered start never lies past its stop (walk() then makes the last approach).
    beast.s = Math.min(beast.s, r.length - stop);
    this.along(r, beast, this.at);
    beast.x = this.at[0]!;
    beast.z = this.at[1]!;
    beast.heading = Math.atan2(this.at[2]!, this.at[3]!);
  }

  /** The point `w.s` metres along `r`, shifted `w.side` metres to the right; writes [x, z, dirX, dirZ]. */
  private along(r: Route, w: Walker, out: Float64Array): void {
    const s = w.s;
    const side = w.side;
    const clamped = Math.max(0, Math.min(r.length, s));
    let k = 1;
    while (k < r.points.length - 1 && r.cum[k]! < clamped) k += 1;
    const a = r.points[k - 1]!;
    const b = r.points[k]!;
    const span = r.cum[k]! - r.cum[k - 1]! || 1;
    const t = (clamped - r.cum[k - 1]!) / span;
    const dx = (b[0] - a[0]) / span;
    const dz = (b[1] - a[1]) / span;
    // Narrow towards the heart, never to a single file.
    const fade = 0.4 + 0.6 * (1 - clamped / r.length);
    out[0] = a[0] + (b[0] - a[0]) * t - dz * side * fade;
    out[1] = a[1] + (b[1] - a[1]) * t + dx * side * fade;
    out[2] = dx;
    out[3] = dz;
  }

  /** Walks a ground walker (beast or cluster) for this update's step; true while it walks. */
  private walk(w: Walker): boolean {
    const dt = this.stepDt;
    const r = this.ground[w.route]!;
    const at = this.at;
    const stopAt = r.length - Math.sqrt(w.endX * w.endX + w.endZ * w.endZ);
    if (w.s < stopAt) {
      w.s += w.speed * dt;
      this.along(r, w, at);
      w.x = at[0]!;
      w.z = at[1]!;
      w.heading = Math.atan2(at[2]!, at[3]!);
      return true;
    }
    const dx = w.endX - w.x;
    const dz = w.endZ - w.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.05) {
      const step = Math.min(d, w.speed * dt);
      w.x += (dx / d) * step;
      w.z += (dz / d) * step;
      w.heading = Math.atan2(dx, dz);
      return true;
    }
    w.heading = Math.atan2(-w.x, -w.z);
    return false;
  }

  /** This update's blows (stepDt seconds of hitsPerSecond). */
  private hit(): void {
    this.hitCarry += this.hitsPerSecond * this.stepDt;
    while (this.hitCarry >= 1) {
      this.hitCarry -= 1;
      this.blow(Math.floor(this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * this.beasts.length));
    }
  }

  /** One blow on beast `index` (a random tier T1–T3); returns its tier, 0 when it was already dying. */
  private blow(index: number): number {
    const beast = this.beasts[index];
    if (beast === undefined || beast.phase === 2) return 0;
    const tier = 1 + Math.floor(this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 3);
    beast.hp -= 0.12 + this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * 0.25;
    // kit Reactions.hit: a weaker blow inside 0.12 s does not cut a stronger one short; the kick points away from the heart.
    if (this.now - beast.hitAt > REACT_FRESH_S || tier >= this.hitTier[index]!) {
      beast.hitAt = this.now;
      this.hitTier[index] = tier;
      const length = Math.sqrt(beast.x * beast.x + beast.z * beast.z) || 1;
      this.hitDirX[index] = beast.x / length;
      this.hitDirZ[index] = beast.z / length;
    }
    if (beast.hp <= 0) {
      beast.phase = 2;
      beast.t = 0;
      if (this.deaths < this.deathX.length) {
        this.deathX[this.deaths] = beast.x;
        this.deathZ[this.deaths] = beast.z;
        const size = CROWD_LOOKS[beast.species].sizeM;
        this.deathSize[this.deaths] = Math.max(size[0], size[1], size[2]) * (beast.elite ? 1.25 : 1);
        this.deaths += 1;
      }
    }
    return tier;
  }

  /** One more blow on a random beast (the swords' hits of case C): its index (−1 none) and tier in `struck`. */
  strike(struck: { index: number; tier: number }): void {
    const index = Math.floor(this.rand[(this.rc = (this.rc + 1) & RANDOM_MASK)]! * this.beasts.length);
    struck.index = index;
    struck.tier = this.blow(index);
    if (struck.tier === 0) struck.index = -1;
  }

  /** Advances `dt` seconds and writes every instance into the crowd, then the rings; call crowd.update after. */
  update(dt: number): void {
    this.now += dt;
    this.stepDt = dt;
    this.deaths = 0;
    this.hit();
    for (let k = 0; k < this.clusters.length; k += 1) {
      const c = this.clusters[k]!;
      if (c.phase === 0) {
        if (!this.walk(c)) c.phase = 1;
      } else {
        c.t += this.stepDt;
        if (c.t > STAND_S) this.restartCluster(c, false);
      }
    }
    for (let index = 0; index < this.beasts.length; index += 1) {
      const beast = this.beasts[index]!;
      this.writeBeast(beast, this.stepBeast(beast));
    }
    // One ring under each swarm cluster (the list is fixed: emptying and refilling an array
    // would give it a new backing store every frame).
    for (let k = 0; k < this.clusters.length; k += 1) {
      const c = this.clusters[k]!;
      const ring = this.rings[k]!;
      ring.x = c.x;
      ring.z = c.z;
    }
    this.crowd.setRings(this.rings);
  }

  /** Moves one beast for this update's step; true while it walks. */
  private stepBeast(beast: HerdBeast): boolean {
    const dt = this.stepDt;
    if (beast.phase === 2) {
      beast.t += dt;
      if (beast.t < DISSOLVE_S) return false;
      // Back at a gate (a swarm member rejoins its cluster next frame).
      this.restart(beast, false);
      return true;
    }
    if (beast.cluster >= 0) {
      const c = this.clusters[beast.cluster]!;
      const member = (beast.member % CLUSTER_SIZE) * 2;
      beast.x = c.x + CLUSTER_OFFSETS[member]!;
      beast.z = c.z + CLUSTER_OFFSETS[member + 1]!;
      beast.heading = c.heading;
      const walking = c.phase === 0;
      beast.phase = walking ? 0 : 1;
      return walking;
    }
    if (beast.flyer) {
      const d = Math.sqrt(beast.x * beast.x + beast.z * beast.z);
      if (beast.phase === 0 && d > beast.radius) {
        const step = Math.min(d - beast.radius, beast.speed * dt);
        beast.x -= (beast.x / d) * step;
        beast.z -= (beast.z / d) * step;
        beast.heading = Math.atan2(-beast.x, -beast.z);
        beast.angle = Math.atan2(beast.x, beast.z);
        return true;
      }
      // Circling the heart.
      beast.phase = 1;
      beast.t += dt;
      beast.angle += ((beast.speed * 0.6) / beast.radius) * dt;
      beast.x = Math.sin(beast.angle) * beast.radius;
      beast.z = Math.cos(beast.angle) * beast.radius;
      beast.heading = beast.angle + Math.PI / 2;
      if (beast.t > FLYER_STAND_S) {
        beast.phase = 2;
        beast.t = 0;
      }
      return true;
    }
    if (beast.phase === 0) {
      if (this.walk(beast)) return true;
      beast.phase = 1;
      beast.t = 0;
      return false;
    }
    beast.t += dt;
    if (beast.t > STAND_S) {
      beast.phase = 2;
      beast.t = 0;
    }
    return false;
  }

  /** Writes one beast's instance into the crowd (clip, reaction, tint). */
  private writeBeast(beast: HerdBeast, walking: boolean): void {
    const dt = this.stepDt;
    const inst = this.inst;
    // kit Reactions.sample, inline: flash for the tier's hot frames then 50 ms down, a kick that
    // peaks at 30 ms, squash 0.91 → 1.07 at 40 ms → 1 at 120 ms; nothing after 0.25 s.
    const age = this.now - beast.hitAt;
    inst.flash = 0;
    inst.knockX = 0;
    inst.knockZ = 0;
    inst.squash = 1;
    if (age >= 0 && age <= REACT_S) {
      const row = tierRow(this.hitTier[beast.index]!, DRAGON.tiers);
      const hot = row.flashFrames / 60;
      inst.flash = age <= hot ? 1 : Math.max(0, 1 - (age - hot) / 0.05);
      const k = age / 0.03;
      const push = row.recoil * k * Math.exp(1 - k);
      inst.knockX = this.hitDirX[beast.index]! * push;
      inst.knockZ = this.hitDirZ[beast.index]! * push;
      if (age < 0.04) inst.squash = 0.91 + (1.07 - 0.91) * (age / 0.04);
      else if (age < 0.12) inst.squash = 1.07 + (1 - 1.07) * ((age - 0.04) / 0.08);
    }
    inst.x = beast.x;
    inst.y = 0;
    inst.z = beast.z;
    inst.heading = beast.heading;
    inst.size = beast.elite ? 1.25 : 1;
    inst.elite = beast.elite;
    inst.tint = beast.elite ? TINT.elite : !beast.flyer && beast.x * beast.x + beast.z * beast.z < BARRIER_M2 ? TINT.slow : TINT.none;
    inst.tintMix = beast.elite ? 0.8 : 0.5;
    inst.outline = beast.elite || beast.armoured ? 1 : 0.7;
    if (beast.phase === 2) {
      inst.clip = CLIP.death;
      inst.clipTime = beast.t;
      inst.dissolve = Math.min(1, beast.t / DISSOLVE_S);
      inst.flash = Math.max(inst.flash, 1 - beast.t * 8);
      inst.stride = 0;
    } else if (walking) {
      // The walk clip at the beast's own pace (a slow Nham Viên strides slower than a running wolf).
      beast.walkTime += dt * beast.walkRate;
      inst.clip = CLIP.move;
      inst.clipTime = beast.walkTime;
      inst.dissolve = 0;
      // Always a number (never undefined): keeps the field a double, no boxing per store.
      inst.stride = 1;
    } else {
      // Standing at the heart: bite every second (attack clip).
      beast.clipTime += dt;
      if (beast.clipTime >= 1) beast.clipTime -= 1;
      inst.clip = CLIP.attack;
      inst.clipTime = beast.clipTime;
      inst.dissolve = 0;
      inst.stride = 0.1;
    }
    this.crowd.set(beast.index, inst);
  }

  /** Beasts per species (report). */
  species(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const beast of this.beasts) out[beast.species] = (out[beast.species] ?? 0) + 1;
    return out;
  }
}
