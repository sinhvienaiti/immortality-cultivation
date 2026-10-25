/**
 * The bench's beasts (canon §20.3 cases A and B): N beasts, 5 species × N/5
 * (Thạch Thử in clusters of 7), walking from gates A and B along the painted
 * corridors (Hỏa Nha straight in from the sky corners) to the heart, standing
 * there biting (attack clip) or circling, hit all the time (flash, recoil,
 * squash through kit Reactions), dying (dissolve) and coming back at a gate.
 * A few elites (× 1.25, tinted); beasts inside the Kết Giới show the slow
 * tint. View-only floats and a seeded xorshift: this is not the sim. Crowd ids
 * are the herd's own indices (stable), so a respawn reuses its instance;
 * nothing allocates per frame: the hot loop passes no float to a call that V8
 * may not inline (it would box it), lengths are Math.sqrt (Math.hypot builds an
 * array per call), and only beasts hit in the last 0.25 s ask the kit Reactions.
 * Owner: Lane 1.
 */
import { Reactions } from "../../kit/feedback/reaction";
import { DRAGON } from "../../kit/feedback/profiles";
import { FIELD, FORMATION, STAGE_M0A } from "../../content/rules";
import type { SpeciesId } from "../../content/types";
import { CLIP, CROWD_LOOKS, TINT, type Crowd, type CrowdInstance, type CrowdRing } from "../crowd";
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
/** How long the kit Reactions answer after a blow (reaction.ts: nothing after 0.25 s). */
const REACT_S = 0.25;
/** Swarm member offsets round the cluster centre (metres): a centre and a ring of 6. */
const CLUSTER_OFFSETS: readonly (readonly [number, number])[] = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3) * 0.8, Math.sin((k * Math.PI) / 3) * 0.8] as const)];

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

/** xorshift32 in [0, 1) (view only). */
export function benchRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
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
  private readonly reactions: Reactions;
  private readonly sample = new Float32Array(5);
  private readonly inst: CrowdInstance = { x: 0, y: 0, z: 0, heading: 0, clip: CLIP.move, clipTime: 0, flash: 0, squash: 1, dissolve: 0, tint: 0, size: 1, tintMix: 0, stride: 1, knockX: 0, knockZ: 0, outline: 1 };
  private readonly ringPool: CrowdRing[] = [];
  private readonly rings: CrowdRing[] = [];
  private readonly at = [0, 0, 0, 0];
  private serial = 1;
  private hitCarry = 0;
  private now = 0;
  /** This update's step, seconds (read by walk(): a float argument would be boxed per call). */
  private stepDt = 0;

  constructor(private readonly crowd: Crowd, readonly count: number, private readonly random: () => number) {
    this.ground = benchRoutes().map((r) => route([r.gate, r.bend, [0, 0]]));
    this.sky = FIELD.skyEntries.map((e) => [e.xMm / 1000, e.zMm / 1000] as const);
    this.reactions = new Reactions(Math.max(1, count), DRAGON);
    const per = Math.floor(count / HERD_MIX.length);
    let placed = 0;
    HERD_MIX.forEach((species, k) => {
      const n = k === HERD_MIX.length - 1 ? count - placed : per;
      placed += n;
      for (let i = 0; i < n; i += 1) this.spawnInitial(species, i);
    });
    for (const beast of this.beasts) crowd.add(beast.index, beast.species);
    for (let k = 0; k < this.clusters.length; k += 1) this.ringPool.push({ x: 0, y: 0, z: 0, radius: 1.35, colour: CROWD_LOOKS["thach-thu"].colour, alpha: 0.85 });
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
        const c: Cluster = { route: 0, s: 0, side: 0, speed: 0, phase: 0, t: 0, x: 0, z: 0, heading: 0, endX: 0, endZ: 0 };
        this.clusters.push(c);
        this.restartCluster(c, true);
      }
    }
    const beast: HerdBeast = {
      index: this.beasts.length,
      species,
      flyer,
      cluster,
      member,
      serial: 0,
      phase: 0,
      t: 0,
      hp: 1,
      hitAt: -1e9,
      elite: false,
      route: 0,
      s: 0,
      side: 0,
      speed: 0,
      x: 0,
      z: 0,
      heading: 0,
      endX: 0,
      endZ: 0,
      angle: 0,
      radius: 0,
      clipTime: 0,
    };
    this.beasts.push(beast);
    this.restart(beast, true);
  }

  private restartCluster(c: Cluster, scatter: boolean): void {
    c.route = this.random() < 0.5 ? 0 : 1;
    const r = this.ground[c.route]!;
    c.s = scatter ? this.random() * r.length * 0.9 : 0;
    c.side = (this.random() - 0.5) * 4;
    c.speed = (SPEED_MS["thach-thu"] ?? 1.6) * SPEED_SCALE * (0.9 + this.random() * 0.2);
    c.phase = 0;
    c.t = 0;
    this.pickEnd(c, r, 2.6 + this.random() * 5.5);
    this.along(r, c, this.at);
    c.x = this.at[0]!;
    c.z = this.at[1]!;
  }

  /** Where a ground walker stops: a spot on its side of the heart at `radius`. */
  private pickEnd(target: { endX: number; endZ: number; route: number }, r: Route, radius: number): void {
    const bend = r.points[1]!;
    const base = Math.atan2(bend[0], bend[1]);
    const angle = base + (this.random() - 0.5) * 2.2;
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
    beast.elite = beast.cluster < 0 && this.random() < ELITE_SHARE;
    beast.speed = (SPEED_MS[beast.species] ?? 1.4) * SPEED_SCALE * (0.85 + this.random() * 0.3) * (beast.elite ? 1.15 : 1);
    if (beast.cluster >= 0) return;
    if (beast.flyer) {
      // From a sky corner, spread along the top edge so the flight lines do not stack.
      const entry = this.sky[this.random() < 0.5 ? 0 : 1]!;
      const ex = entry[0] - Math.sign(entry[0]) * this.random() * 6;
      const ez = entry[1] + this.random() * 3;
      const t = scatter ? this.random() * 0.85 : 0;
      beast.x = ex * (1 - t);
      beast.z = ez * (1 - t);
      beast.radius = 3 + this.random() * 3;
      beast.angle = Math.atan2(beast.x, beast.z);
      return;
    }
    beast.route = this.random() < 0.5 ? 0 : 1;
    const r = this.ground[beast.route]!;
    beast.s = scatter ? this.random() * r.length * 0.95 : 0;
    beast.side = (this.random() - 0.5) * 5.2;
    const stop = beast.species === "nham-vien" ? THROWER_STOP_M : BENCH_SPOTS.heartRadius + 0.8 + this.random() * 6;
    this.pickEnd(beast, r, stop);
    // A scattered start never lies past its stop (walk() then makes the last approach).
    beast.s = Math.min(beast.s, r.length - stop);
    this.along(r, beast, this.at);
    beast.x = this.at[0]!;
    beast.z = this.at[1]!;
    beast.heading = Math.atan2(this.at[2]!, this.at[3]!);
  }

  /** The point `w.s` metres along `r`, shifted `w.side` metres to the right; writes [x, z, dirX, dirZ]. */
  private along(r: Route, w: Walker, out: number[]): void {
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

  private hit(dt: number): void {
    this.hitCarry += HITS_PER_SECOND * dt;
    while (this.hitCarry >= 1) {
      this.hitCarry -= 1;
      const beast = this.beasts[Math.floor(this.random() * this.beasts.length)];
      if (beast === undefined || beast.phase === 2) continue;
      const tier = 1 + Math.floor(this.random() * 3);
      beast.hp -= 0.12 + this.random() * 0.25;
      beast.hitAt = this.now;
      this.reactions.hit(beast.index, beast.serial, tier, beast.x, beast.z, this.now);
      if (beast.hp <= 0) {
        beast.phase = 2;
        beast.t = 0;
      }
    }
  }

  /** Advances `dt` seconds and writes every instance into the crowd, then the rings; call crowd.update after. */
  update(dt: number): void {
    this.now += dt;
    this.stepDt = dt;
    this.hit(dt);
    for (let k = 0; k < this.clusters.length; k += 1) {
      const c = this.clusters[k]!;
      if (c.phase === 0) {
        if (!this.walk(c)) c.phase = 1;
      } else {
        c.t += dt;
        if (c.t > STAND_S) this.restartCluster(c, false);
      }
    }
    const barrier = FORMATION.barrierRadiusMm / 1000;
    const inst = this.inst;
    for (let index = 0; index < this.beasts.length; index += 1) {
      const beast = this.beasts[index]!;
      let walking = false;
      if (beast.phase === 2) {
        beast.t += dt;
        if (beast.t >= DISSOLVE_S) {
          // Back at a gate (a swarm member rejoins its cluster next frame).
          this.restart(beast, false);
          walking = true;
        }
      } else if (beast.cluster >= 0) {
        const c = this.clusters[beast.cluster]!;
        const offset = CLUSTER_OFFSETS[beast.member % CLUSTER_OFFSETS.length]!;
        beast.x = c.x + offset[0];
        beast.z = c.z + offset[1];
        beast.heading = c.heading;
        walking = c.phase === 0;
        beast.phase = walking ? 0 : 1;
      } else if (beast.flyer) {
        const d = Math.sqrt(beast.x * beast.x + beast.z * beast.z);
        if (beast.phase === 0 && d > beast.radius) {
          const step = Math.min(d - beast.radius, beast.speed * dt);
          beast.x -= (beast.x / d) * step;
          beast.z -= (beast.z / d) * step;
          beast.heading = Math.atan2(-beast.x, -beast.z);
          beast.angle = Math.atan2(beast.x, beast.z);
          walking = true;
        } else {
          // Circling the heart.
          beast.phase = 1;
          beast.t += dt;
          beast.angle += ((beast.speed * 0.6) / beast.radius) * dt;
          beast.x = Math.sin(beast.angle) * beast.radius;
          beast.z = Math.cos(beast.angle) * beast.radius;
          beast.heading = beast.angle + Math.PI / 2;
          walking = true;
          if (beast.t > FLYER_STAND_S) {
            beast.phase = 2;
            beast.t = 0;
          }
        }
      } else if (beast.phase === 0) {
        walking = this.walk(beast);
        if (!walking) {
          beast.phase = 1;
          beast.t = 0;
        }
      } else {
        beast.t += dt;
        if (beast.t > STAND_S) {
          beast.phase = 2;
          beast.t = 0;
        }
      }
      // Instance. Only a beast hit lately asks the kit (the call boxes `now`); the others take the rest pose.
      if (this.now - beast.hitAt <= REACT_S) {
        this.reactions.sample(beast.index, beast.serial, this.now, this.sample);
      } else {
        this.sample[0] = 0;
        this.sample[1] = 0;
        this.sample[2] = 0;
        this.sample[3] = 1;
        this.sample[4] = 1;
      }
      inst.x = beast.x;
      inst.y = 0;
      inst.z = beast.z;
      inst.heading = beast.heading;
      inst.flash = this.sample[0]!;
      inst.knockX = this.sample[1]!;
      inst.knockZ = this.sample[2]!;
      inst.squash = this.sample[3]!;
      inst.size = beast.elite ? 1.25 : 1;
      inst.tint = beast.elite ? TINT.elite : beast.x * beast.x + beast.z * beast.z < barrier * barrier && !beast.flyer ? TINT.slow : TINT.none;
      inst.tintMix = beast.elite ? 0.8 : 0.5;
      inst.outline = beast.elite || beast.species === "thiet-giap-tru" ? 1 : 0.7;
      if (beast.phase === 2) {
        inst.clip = CLIP.death;
        inst.clipTime = beast.t;
        inst.dissolve = Math.min(1, beast.t / DISSOLVE_S);
        inst.flash = Math.max(inst.flash, 1 - beast.t * 8);
        inst.stride = 0;
      } else if (walking) {
        inst.clip = CLIP.move;
        inst.clipTime = 0;
        inst.dissolve = 0;
        // Always a number (never undefined): keeps the field a double, no boxing per store.
        inst.stride = 1;
      } else {
        // Standing at the heart: bite every second (attack clip).
        beast.clipTime = (beast.clipTime + dt) % 1;
        inst.clip = CLIP.attack;
        inst.clipTime = beast.clipTime;
        inst.dissolve = 0;
        inst.stride = 0.1;
      }
      this.crowd.set(beast.index, inst);
    }
    // One ring under each swarm cluster.
    this.rings.length = 0;
    for (let k = 0; k < this.clusters.length; k += 1) {
      const c = this.clusters[k]!;
      const ring = this.ringPool[k]!;
      ring.x = c.x;
      ring.z = c.z;
      this.rings.push(ring);
    }
    this.crowd.setRings(this.rings);
  }

  /** Beasts per species (report). */
  species(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const beast of this.beasts) out[beast.species] = (out[beast.species] ?? 0) + 1;
    return out;
  }
}
