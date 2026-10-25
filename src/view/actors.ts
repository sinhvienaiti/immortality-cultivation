/**
 * Beasts on screen (canon §10.3–10.5, §10.9, §21.1) through Lane 1's crowd:
 * the draw mode by tier from rules.ts CROWD_MODE (the HN0 verdict; procedural
 * until VAT lands). Positions are read straight from `world.beasts` each
 * frame (no events; the path holds 300 like the bench), interpolated between
 * the last two ticks with FrameInfo.alpha; heading follows the walk, standing
 * beasts face the Trận Tâm. Clips by mode (walk → Move, bite/throw/dive/
 * capture → Attack, the rest Idle); status tints (sealed, broken, held,
 * slowed, elite); elites drawn × 1.25 (rules.ts ELITES.sizePm) with an aura
 * ring; the thú tướng on its family's layer (canon §21.2: same model, other
 * size and material) × 1.4 (GENERAL.sizePm), aura tint and its 6 m aura
 * ring (≥ 80 px at 1080p, tests/view/actors.test.ts); the Thú Vương a large
 * placeholder (its SkinnedMesh path through walker-rig is measured at the
 * bench only; the real model is M0b). Swarm clusters get a ground ring in
 * their family colour. Hit reactions (flash, fake knock-back, squash) from
 * kit/feedback Reactions with the game's profile; deaths dissolve into ink
 * where they fell. Flyers are drawn lower than the sim's flight height (a
 * view-only number, rules.ts FIELD.flyHeightMm) so a Hỏa Nha entering at the
 * far sky corner stays inside the camera's fitted headroom (canon D48: every
 * beast in frame, with the Bàn Quyết band below). Nothing allocates per
 * frame after warm-up.
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { BEASTS, GENERALS } from "../content/data/beasts";
import { CROWD_MODE, ELITES, FIELD, GENERAL } from "../content/rules";
import type { BeastId, BeastMode, BeastState, SimEvent, SpeciesId, World } from "../content/types";
import type { FeedbackProfile } from "../kit/feedback/profiles";
import { Reactions } from "../kit/feedback/reaction";
import { uToM } from "../sim/fixed";
import { CLIP, CROWD_LOOKS, TINT, TINT_HEX, createCrowd, type Crowd, type CrowdDrawMode, type CrowdInstance, type CrowdLook, type CrowdRing } from "./crowd";
import { IC_FEEDBACK_PROFILE } from "./feedback-profile";
import { VIEW, type Renderer3D } from "./renderer";

/** Layers in use (generals draw on their family's layer). */
const LAYERS: readonly SpeciesId[] = ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru", "thiet-boi-lang-vuong"];

/** The sim's flight height (metres, view only: the rules never read it). */
const FLY_SIM_M = FIELD.flyHeightMm / 1000;

/**
 * Drawn flight height (metres): the flyer look's hover, but never so high that
 * its body leaves the headroom the fixed camera keeps over the far edge
 * (renderer.ts VIEW.headroomM). The sky-route hint and the screen zones use it too.
 */
export const FLY_DRAW_M = Math.min(CROWD_LOOKS["hoa-nha"].hoverM, VIEW.headroomM - CROWD_LOOKS["hoa-nha"].sizeM[1]);

/** The drawn height of a flyer whose sim height is `simYm` (a dive keeps its proportion down to the ground). */
export function drawnLift(simYm: number): number {
  if (simYm <= 0) return 0;
  const lift = (simYm * FLY_DRAW_M) / FLY_SIM_M;
  return lift > FLY_DRAW_M ? FLY_DRAW_M : lift;
}

/** Seconds a dead beast takes to dissolve (reduced motion: shorter, canon §24 "VFX ngắn"). */
export const DEATH_S = 0.6;
export const DEATH_REDUCED_S = 0.3;

/** The crowd mode of a tier (rules.ts CROWD_MODE, the HN0 verdict). */
export function crowdModeFor(quality: keyof typeof CROWD_MODE): CrowdDrawMode {
  return CROWD_MODE[quality];
}

/** The clip a beast plays in `mode` (canon §21.2 beasts: Idle, Move, Attack, Death). */
export function clipOf(mode: BeastMode): number {
  switch (mode) {
    case "walk":
    case "leave":
    case "ram":
      return CLIP.move;
    case "bite":
    case "throw":
    case "dive":
    case "capture":
      return CLIP.attack;
    default:
      return CLIP.idle;
  }
}

/** Gait strength by mode (procedural crowd: 0 standing … 1 walking; a ram runs). */
export function strideOf(mode: BeastMode): number {
  switch (mode) {
    case "walk":
    case "leave":
      return 1;
    case "ram":
      return 1.6;
    case "stunned":
    case "downed":
      return 0;
    default:
      return 0.12;
  }
}

/** The status tint (TINT id) of a beast at `tick`, strongest first: Ấn, phá thế, held, slowed, elite, general's aura. */
export function tintOf(beast: BeastState, tick: number): number {
  if (beast.seal >= 0) return TINT.seal;
  if (beast.mode === "downed" || (beast.posture !== null && beast.posture.brokenUntil > tick)) return TINT.broken;
  if (beast.mode === "stunned" || beast.hardUntil > tick) return TINT.held;
  for (const slow of beast.slows) if (slow.until > tick && slow.pct > 0) return TINT.slow;
  if (beast.elite !== null) return TINT.elite;
  if (beast.general) return TINT.aura;
  return TINT.none;
}

/** Tint mix of a TINT id: statuses read strongly, the elite and aura tints stay a hue. */
export function tintMixOf(tint: number): number {
  if (tint === TINT.none) return 0;
  if (tint === TINT.elite) return 0.55;
  if (tint === TINT.aura) return 0.4;
  if (tint === TINT.slow) return 0.5;
  return 0.85;
}

/**
 * The crowd layer a beast is drawn on. Canon §21.2: an elite, a general and
 * an element variant use their family's model, resized, with another material
 * and an aura; so Lang Đầu Đàn draws on Phong Lang's layer (lang family).
 */
export function layerOf(species: SpeciesId): SpeciesId {
  return LAYER_OF.get(species) ?? species;
}

/** Generals → the plain species of their family (built once). */
const LAYER_OF: ReadonlyMap<SpeciesId, SpeciesId> = new Map(
  (Object.keys(GENERALS) as SpeciesId[]).map((general) => {
    const family = (GENERALS as Partial<Record<SpeciesId, { family: string }>>)[general]!.family;
    const base = (Object.keys(BEASTS) as BeastId[]).find((id) => BEASTS[id].family === family);
    return [general, base ?? general] as const;
  }),
);

/** Drawn scale on the layer's look: elites × ELITES.sizePm (canon §10.3), generals × GENERAL.sizePm (§10.4). */
export function drawSize(beast: Pick<BeastState, "elite" | "general">): number {
  if (beast.general) return GENERAL.sizePm / 1000;
  return beast.elite !== null ? ELITES.sizePm / 1000 : 1;
}

/** Where on a drawn beast: its ground point, body centre, or just over its head. */
export type BeastAnchor = "base" | "center" | "top";

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface BeastRec {
  serial: number;
  slot: number;
  species: SpeciesId;
  look: CrowdLook;
  elite: boolean;
  general: boolean;
  cluster: number;
  /** Positions at the last two ticks seen (metres) and the tick of the latter. */
  px: number;
  pz: number;
  cx: number;
  cz: number;
  tick: number;
  x: number;
  z: number;
  lift: number;
  heading: number;
  size: number;
  /** Half the body's ground diagonal at size 1 (metres): how far a corner reaches, whatever the heading. */
  reach: number;
  clipTime: number;
  /** Seconds since death (−1: alive). */
  dying: number;
  seen: number;
}

interface ClusterAcc {
  ring: CrowdRing;
  n: number;
  sx: number;
  sz: number;
  far: number;
  members: number;
  cluster: number;
  stamp: number;
}

export interface ActorsView extends Presenter {
  readonly crowd: Crowd;
  /** Beasts drawn now (alive and dissolving). */
  readonly drawn: number;
  /** The drawn position of beast {slot, serial} (metres); false when it is not drawn. */
  locate(slot: number, serial: number, anchor: BeastAnchor, out: Point3): boolean;
}

export interface ActorsOptions {
  /** Crowd capacity per species layer (default 320: the 60 of the rules, dying ones, summons, and the bench's 300). */
  readonly capacity?: number;
  /** Reduced motion (canon §24): no fake knock-back or squash, shorter dissolve. */
  readonly reduced?: () => boolean;
  readonly profile?: FeedbackProfile;
  /** Draw mode (default by the renderer's tier, CROWD_MODE). */
  readonly mode?: CrowdDrawMode;
}

const REACTION_SLOTS = 512;
const RING_POOL = 160;
/** A swarm body's half-size plus a margin round a cluster ring (metres). */
const SWARM_BODY_M = Math.max(CROWD_LOOKS["thach-thu"].sizeM[0], CROWD_LOOKS["thach-thu"].sizeM[2]) * 0.6 + 0.3;

/** Ground metres a point moves north on screen per metre of height under the fixed tilt (1 / tan tilt). */
const COT_TILT = 1 / Math.tan((VIEW.tiltDeg * Math.PI) / 180);

/** `value` kept in [lo, hi] (the middle when the range is empty). */
function clampM(value: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return value < lo ? lo : value > hi ? hi : value;
}

/** Shortest turn from `from` towards `to` by at most `step` radians. */
function turnToward(from: number, to: number, step: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= step ? to : from + Math.sign(delta) * step;
}

/** Beasts through the crowd on the renderer's actors layer. */
export function createActors(renderer: Renderer3D, options: ActorsOptions = {}): ActorsView {
  const capacity = options.capacity ?? 320;
  const reduced = options.reduced ?? (() => false);
  const crowd = createCrowd(renderer, options.mode ?? crowdModeFor(renderer.quality ?? "high"), { capacity });
  // Every layer exists from the start, so a warm-up compile covers it (no stall at the first beast of a kind).
  for (const species of LAYERS) crowd.prepare(species);
  const reactions = new Reactions(REACTION_SLOTS, options.profile ?? IC_FEEDBACK_PROFILE);
  const recs = new Map<number, BeastRec>();
  /** The same records as an array (indexed loops: no iterator per frame). */
  const live: BeastRec[] = [];
  const pool: BeastRec[] = [];
  const sample = new Float32Array(5);
  const instance: CrowdInstance = { x: 0, y: 0, z: 0, heading: 0, clip: CLIP.move, clipTime: 0, flash: 0, squash: 1, dissolve: 0, tint: 0, size: 1, tintMix: 0, stride: 1, lift: 0, knockX: 0, knockZ: 0, outline: 1 };
  const rings: CrowdRing[] = [];
  const ringPool: CrowdRing[] = [];
  for (let k = 0; k < RING_POOL; k += 1) ringPool.push({ x: 0, y: 0, z: 0, radius: 1, colour: "#ffffff", alpha: 0.9 });
  const clusters: ClusterAcc[] = [];
  for (let k = 0; k < 48; k += 1) clusters.push({ ring: { x: 0, y: 0, z: 0, radius: 1, colour: "#ffffff", alpha: 0.9 }, n: 0, sx: 0, sz: 0, far: 0, members: 0, cluster: -1, stamp: -1 });
  const generalAura = (GENERALS["lang-dau-dan"]?.aura.radiusMm ?? 6000) / 1000;
  let stamp = 0;
  let nowS = 0;
  let ringsUsed = 0;
  /** The field's edges this frame, metres. */
  let minX = FIELD.minXMm / 1000;
  let maxX = FIELD.maxXMm / 1000;
  let minZ = FIELD.minZMm / 1000;
  let maxZ = FIELD.maxZMm / 1000;
  const ringColourOf = new Map<SpeciesId, string>(LAYERS.map((species) => [species, CROWD_LOOKS[species].colour]));

  const takeRing = (): CrowdRing | null => (ringsUsed < ringPool.length ? ringPool[ringsUsed++]! : null);

  const newRec = (beast: BeastState, x: number, z: number, tick: number): BeastRec => {
    const rec = pool.pop() ?? ({} as BeastRec);
    rec.serial = beast.serial;
    rec.slot = beast.slot;
    rec.species = layerOf(beast.species);
    rec.look = CROWD_LOOKS[rec.species];
    rec.elite = beast.elite !== null;
    rec.general = beast.general;
    rec.cluster = rec.look.gait === "swarm" ? beast.cluster : -1;
    rec.px = rec.cx = rec.x = x;
    rec.pz = rec.cz = rec.z = z;
    rec.tick = tick;
    rec.lift = 0;
    rec.heading = Math.atan2(-x, -z);
    rec.size = drawSize(beast);
    rec.reach = Math.hypot(rec.look.sizeM[0], rec.look.sizeM[2]) / 2;
    rec.clipTime = 0;
    rec.dying = -1;
    rec.seen = stamp;
    return rec;
  };

  const clusterAcc = (cluster: number): ClusterAcc | null => {
    let free: ClusterAcc | null = null;
    for (const acc of clusters) {
      if (acc.stamp === stamp && acc.cluster === cluster) return acc;
      if (free === null && acc.stamp !== stamp) free = acc;
    }
    if (free === null) return null;
    free.stamp = stamp;
    free.cluster = cluster;
    free.n = 0;
    free.sx = 0;
    free.sz = 0;
    free.far = 0;
    return free;
  };

  const writeInstance = (rec: BeastRec, flashOnly: boolean): void => {
    reactions.sample(rec.slot % REACTION_SLOTS, rec.serial, nowS, sample);
    instance.flash = sample[0]!;
    if (flashOnly || reduced()) {
      instance.knockX = 0;
      instance.knockZ = 0;
      instance.squash = 1;
    } else {
      instance.knockX = sample[1]!;
      instance.knockZ = sample[2]!;
      instance.squash = sample[3]!;
    }
  };

  const view: ActorsView = {
    crowd,
    get drawn(): number {
      return recs.size;
    },

    locate(slot: number, serial: number, anchor: BeastAnchor, out: Point3): boolean {
      const rec = recs.get(serial);
      if (rec === undefined || rec.slot !== slot) return false;
      const h = rec.look.sizeM[1] * rec.size;
      out.x = rec.x;
      out.z = rec.z;
      out.y = anchor === "base" ? 0 : rec.lift + (anchor === "center" ? h * 0.5 : h + 0.2);
      return true;
    },

    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        if (event.type === "hit") {
          // A blow pushes outwards from the Trận Tâm (the hit has no attacker point); flash, kick, squash.
          reactions.hit(event.beast.slot % REACTION_SLOTS, event.beast.serial, event.tier, event.x, event.z, nowS);
        } else if (event.type === "death") {
          const rec = recs.get(event.beast.serial);
          if (rec !== undefined && rec.dying < 0) {
            rec.dying = 0;
            rec.cx = rec.px = rec.x = event.x;
            rec.cz = rec.pz = rec.z = event.z;
          }
        }
      }
    },

    frame(world: World, info: FrameInfo): void {
      stamp += 1;
      nowS = info.now / 1000;
      const field = world.stage?.field ?? FIELD;
      minX = field.minXMm / 1000;
      maxX = field.maxXMm / 1000;
      minZ = field.minZMm / 1000;
      maxZ = field.maxZMm / 1000;
      ringsUsed = 0;
      rings.length = 0;
      const alpha = info.alpha < 0 ? 0 : info.alpha > 1 ? 1 : info.alpha;
      const tick = world.tick;
      const turn = info.dt * 9;
      const list = world.beasts.list;
      for (let index = 0; index < list.length; index += 1) {
        const beast = list[index]!;
        if (!beast.alive || beast.freed) continue;
        const x = uToM(beast.x);
        const z = uToM(beast.z);
        let rec = recs.get(beast.serial);
        if (rec === undefined) {
          if (!crowd.add(beast.serial, layerOf(beast.species))) continue;
          rec = newRec(beast, x, z, tick);
          recs.set(beast.serial, rec);
          live.push(rec);
        } else if (rec.tick !== tick) {
          // More than one tick since the last frame: no stale start point to slide from.
          if (tick - rec.tick > 1) {
            rec.px = x;
            rec.pz = z;
          } else {
            rec.px = rec.cx;
            rec.pz = rec.cz;
          }
          rec.cx = x;
          rec.cz = z;
          rec.tick = tick;
        }
        rec.seen = stamp;
        rec.elite = beast.elite !== null;
        rec.size = drawSize(beast);
        // The sim's height (a snared flyer is pulled to the ground, canon §8.3), drawn lower (FLY_DRAW_M).
        rec.lift = drawnLift(uToM(beast.y));
        // A body entering at the far edge or a corner is drawn just inside the field, and a body taller
        // than the camera's headroom further in, so all of it shows (view only, canon D48).
        const reach = rec.reach * rec.size;
        const top = rec.lift + rec.look.sizeM[1] * rec.size;
        const tall = top > VIEW.headroomM ? (top - VIEW.headroomM) * COT_TILT : 0;
        const drawX = clampM(rec.px + (rec.cx - rec.px) * alpha, minX + reach, maxX - reach);
        const drawZ = clampM(rec.pz + (rec.cz - rec.pz) * alpha, minZ + reach + tall, maxZ - reach);
        const mx = rec.cx - rec.px;
        const mz = rec.cz - rec.pz;
        const want = mx * mx + mz * mz > 1e-8 ? Math.atan2(mx, mz) : Math.atan2(-drawX, -drawZ);
        rec.heading = turnToward(rec.heading, want, turn);
        rec.x = drawX;
        rec.z = drawZ;
        const clip = clipOf(beast.mode);
        rec.clipTime = clip === CLIP.attack ? (rec.clipTime + info.worldDt) % 1 : 0;
        writeInstance(rec, false);
        instance.x = drawX;
        instance.y = 0;
        instance.z = drawZ;
        instance.heading = rec.heading;
        instance.clip = clip;
        instance.clipTime = rec.clipTime;
        instance.dissolve = 0;
        const tint = tintOf(beast, tick);
        instance.tint = tint;
        instance.tintMix = tintMixOf(tint);
        instance.size = rec.size;
        instance.stride = strideOf(beast.mode);
        instance.lift = rec.lift;
        instance.outline = rec.elite || beast.general || beast.boss || beast.species === "thiet-giap-tru" ? 1 : 0.75;
        crowd.set(beast.serial, instance);

        // Ground rings: a swarm cluster's outline, an elite's aura, the general's 6 m aura.
        if (rec.cluster >= 0) {
          const acc = clusterAcc(rec.cluster);
          if (acc !== null) {
            acc.n += 1;
            acc.sx += drawX;
            acc.sz += drawZ;
            acc.members = acc.n;
            acc.ring.colour = ringColourOf.get(rec.species)!;
          }
        }
        if (rec.elite || beast.general) {
          const ring = takeRing();
          if (ring !== null) {
            ring.x = drawX;
            ring.y = 0;
            ring.z = drawZ;
            ring.radius = beast.general ? generalAura : Math.max(rec.look.sizeM[0], rec.look.sizeM[2]) * rec.size * 0.75;
            ring.colour = beast.general ? TINT_HEX[TINT.aura]! : TINT_HEX[TINT.elite]!;
            ring.alpha = beast.general ? 0.45 : 0.9;
            rings.push(ring);
          }
        }
      }

      // Cluster rings round their drawn members (2 or more alive).
      for (let k = 0; k < clusters.length; k += 1) {
        const acc = clusters[k]!;
        if (acc.stamp !== stamp || acc.n < 2) continue;
        acc.ring.x = acc.sx / acc.n;
        acc.ring.z = acc.sz / acc.n;
        acc.ring.y = 0;
        acc.far = 0;
      }
      for (let k = 0; k < live.length; k += 1) {
        const rec = live[k]!;
        if (rec.cluster < 0 || rec.seen !== stamp || rec.dying >= 0) continue;
        const acc = clusterAcc(rec.cluster);
        if (acc === null || acc.n < 2) continue;
        const d = Math.hypot(rec.x - acc.ring.x, rec.z - acc.ring.z);
        if (d > acc.far) acc.far = d;
      }
      for (let k = 0; k < clusters.length; k += 1) {
        const acc = clusters[k]!;
        if (acc.stamp !== stamp || acc.n < 2) continue;
        acc.ring.radius = acc.far + SWARM_BODY_M;
        acc.ring.alpha = 0.9;
        rings.push(acc.ring);
      }

      // Dying beasts dissolve where they fell; beasts gone without a death (left the field) fade too.
      const deathS = reduced() ? DEATH_REDUCED_S : DEATH_S;
      for (let k = live.length - 1; k >= 0; k -= 1) {
        const rec = live[k]!;
        if (rec.seen === stamp && rec.dying < 0) continue;
        if (rec.dying < 0) rec.dying = 0;
        rec.dying += info.dt;
        if (rec.dying >= deathS) {
          crowd.remove(rec.serial);
          recs.delete(rec.serial);
          live[k] = live[live.length - 1]!;
          live.pop();
          pool.push(rec);
          continue;
        }
        writeInstance(rec, true);
        instance.x = rec.x;
        instance.y = 0;
        instance.z = rec.z;
        instance.heading = rec.heading;
        instance.clip = CLIP.death;
        instance.clipTime = rec.dying;
        instance.dissolve = Math.min(1, rec.dying / deathS);
        instance.flash = Math.max(instance.flash, 1 - rec.dying * 8);
        instance.tint = TINT.none;
        instance.tintMix = 0;
        instance.size = rec.size;
        instance.stride = 0;
        // Flyers sink as they go.
        instance.lift = rec.lift * (1 - instance.dissolve);
        instance.outline = 0.75;
        crowd.set(rec.serial, instance);
      }
      crowd.setRings(rings);
      crowd.update(info.dt);
    },

    dispose(): void {
      crowd.dispose();
      recs.clear();
      live.length = 0;
    },
  };
  return view;
}
