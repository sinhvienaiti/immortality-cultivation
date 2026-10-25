/**
 * Beast behaviour (canon §10, data/beasts.ts): fill a spawned beast from its
 * def (HP = round(W × 90 × g(K) × preset), PB-06; W × 1.6 for elites), walk
 * the flow field (field.ts) with this tick's speed in `speedPm`, slow in the
 * Kết Giới and under slows (different sources multiply, same source keeps
 * the strongest, ≤ 60 % in all, canon §7.2), the general's aura and Cuồng
 * (multiplied, canon §8.1: Cuồng in the aura 7.2 s), Nham Viên stops 11 m from
 * its target (PB-17), flyers fly straight and hover over their dive point,
 * the Vương walks to its phase's spot (data/boss.ts). Never chases or touches
 * a real player (D07): the world holds no player position.
 *
 * `speedPm` is u per tick × 1000 after every modifier; `fieldStep` moves a
 * ground beast `speedPm / 1000` u along its gate's field. A beast moved off
 * the field (flyers, the Vương's retreat, a ram, a capturer) gets `cell = −1`
 * and `fieldStep` must find its cell from x, z again.
 * Hard control (hold, stun, phá thế) is counted per beast and in
 * `stats.hardControlTicks` against `stats.foeTicks` (canon §8.3, Rồng G15: a
 * measured gate; the mechanisms lane keeps its own 35 % cap).
 * Owner: Lane 5.
 */
import { BOSSES } from "../content/data/boss";
import { ELITE_TRAITS } from "../content/data/elites";
import type { BeastActDef } from "../content/data/beasts";
import { DAMAGE, FIELD, FORMATION, LINH_SA, PRESETS, PRESSURE, SIM } from "../content/rules";
import type { BeastState, BossId, EliteTraitId, GeneralDef, PointU, SpeciesId, World } from "../content/types";
import { applyElite, maxHpOf, stepElites } from "./elites";
import { fieldStep } from "./field";
import { isqrt, mmToU, within } from "./fixed";
import { createPosture, isBroken } from "./posture";
import { actOf, aimNode, capturableNode, chooseTarget, speciesDef, speciesW100, straightDistance, targetPoint } from "./targeting";

// Lane 5 field (reported for Lane 2 to fold into types.ts): bite damage below one HP carried to the next bite (‰ HP).
declare module "../content/types" {
  interface BeastState {
    biteCarryPm?: number;
  }
}

/**
 * ĐĐ × 100 (canon §14.2): the beast's own W at K0 Cân bằng (elite W × 1.6 +
 * extra), summons 50 %, the Vương 0 (ΣĐĐ excludes it). Lane 4 builds ΣĐĐ from
 * the WaveDef with this same function. The Vương's Gọi Đàn calls get 0 too (boss.ts).
 */
export function threatW100(species: SpeciesId, elite: EliteTraitId | null, summoned: boolean): number {
  if (speciesDef(species).tier === "boss") return 0;
  const w100 = speciesW100(species, elite);
  return summoned ? Math.round((w100 * LINH_SA.summonThreatPct) / 100) : w100;
}

const isGeneral = (species: SpeciesId): boolean => speciesDef(species).tier === "general";

/**
 * Fills the species fields of a beast that allocBeast just gave. spawn.ts sets
 * slot, serial, alive, wave, gate, summoned, cluster, position, cell and bornAt
 * first (threat reads `summoned`), then calls this.
 */
export function initBeast(world: World, beast: BeastState, species: SpeciesId, elite: EliteTraitId | null): void {
  const def = speciesDef(species);
  const act = actOf(species);
  beast.species = species;
  beast.tier = def.tier;
  beast.elite = null;
  beast.general = isGeneral(species);
  beast.boss = def.tier === "boss";
  beast.y = mmToU(act.flyMm);
  beast.speedPm = def.speedMm * 1000;
  beast.hpMax = maxHpOf(world, species, null);
  beast.hp = beast.hpMax;
  beast.armour = def.armour;
  beast.resist = def.resist;
  beast.lastHitTick = -1;
  beast.killedBy = null;
  beast.killedBySeat = -1;
  beast.mode = "walk";
  beast.modeUntil = -1;
  beast.target = null;
  beast.attackAt = -1;
  beast.telegraph = -1;
  beast.posture = def.posture > 0 ? createPosture(def.posture) : null;
  beast.slows = [];
  beast.hardUntil = -1;
  beast.hardTicks = 0;
  beast.seal = -1;
  beast.howls = 0;
  beast.howlReadyAt = beast.general ? world.tick : -1;
  beast.biteCarryPm = 0;
  if (elite !== null) applyElite(world, beast, elite);
  beast.threatW100 = threatW100(species, elite, beast.summoned);
}

/** In the air: ground mechanisms skip it (canon §10.2 Hỏa Nha); Phong Ấn Võng's hold pulls it down (y 0). */
export function isAirborne(beast: BeastState): boolean {
  return speciesDef(beast.species).flying && beast.y > 0;
}

/**
 * At the heart edge (r 2 m, canon §10.8), with 1 cm of slack: an integer step
 * that stops on the edge may land a unit or two outside it.
 */
export function atHeartEdge(beast: { readonly x: number; readonly z: number }): boolean {
  const r = (PRESSURE.heartEdgeMm + EDGE_SLACK_MM) * SIM.uPerMm;
  return beast.x * beast.x + beast.z * beast.z <= r * r;
}
const EDGE_SLACK_MM = 10;

/** Share of beast life under hard control, ‰ (Rồng G15's measure; the bots report it). */
export function hardControlSharePm(world: World): number {
  const stats = world.stats;
  return stats.foeTicks > 0 ? Math.round((stats.hardControlTicks * 1000) / stats.foeTicks) : 0;
}

/** Live generals with an aura (one list a tick, so the aura test stays linear). */
function aurasOf(world: World): BeastState[] {
  const out: BeastState[] = [];
  for (const other of world.beasts.list) if (other.alive && other.general) out.push(other);
  return out;
}

/** The strongest aura that speeds this beast up, % (Lang Đầu Đàn: wolves within 6 m +15 %). */
function auraPct(beast: BeastState, generals: readonly BeastState[]): number {
  if (beast.general || beast.boss || generals.length === 0) return 0;
  const family = speciesDef(beast.species).family;
  let best = 0;
  for (const other of generals) {
    if (other === beast || !other.alive) continue;
    const aura = (speciesDef(other.species) as GeneralDef).aura;
    if (aura === undefined || aura.family !== family || aura.speedPct <= best) continue;
    if (within(beast.x, beast.z, other.x, other.z, mmToU(aura.radiusMm))) best = aura.speedPct;
  }
  return best;
}

const BARRIER = "barrier";

/**
 * Speed left after slows, ‰: the Kết Giới 15 % (source "barrier") plus every
 * live slow; same source keeps the strongest, sources multiply, ≥ 40 %.
 * No allocation: the first live entry of a source carries its strongest pct.
 */
export function slowFactorPm(world: World, beast: BeastState): number {
  const tick = world.tick;
  const slows = beast.slows;
  // The Kết Giới first (its position and any "barrier" entry another lane adds), then the other sources in order.
  const barrierU = FORMATION.barrierRadiusMm * SIM.uPerMm;
  let barrierPct = beast.x * beast.x + beast.z * beast.z <= barrierU * barrierU ? FORMATION.barrierSlowPct : 0;
  if (slows.length === 0) return barrierPct > 0 ? Math.round((1000 * (100 - barrierPct)) / 100) : 1000;
  for (let i = 0; i < slows.length; i += 1) {
    const slow = slows[i]!;
    if (slow.source === BARRIER && slow.until > tick && slow.pct > barrierPct) barrierPct = slow.pct;
  }
  let factor = barrierPct > 0 ? Math.round((1000 * (100 - barrierPct)) / 100) : 1000;
  for (let i = 0; i < slows.length; i += 1) {
    const slow = slows[i]!;
    if (slow.until <= tick || slow.source === BARRIER) continue;
    let first = true;
    let pct = slow.pct;
    for (let j = 0; j < slows.length; j += 1) {
      const other = slows[j]!;
      if (j === i || other.until <= tick || other.source !== slow.source) continue;
      if (j < i) {
        first = false;
        break;
      }
      if (other.pct > pct) pct = other.pct;
    }
    if (first) factor = Math.round((factor * (100 - pct)) / 100);
  }
  return Math.max(factor, 1000 - DAMAGE.slowCapPct * 10);
}

/** This tick's speed, u per tick × 1000: def × preset × Cuồng × aura × Vương phase × slows. */
export function effectiveSpeedPm(world: World, beast: BeastState, generals: readonly BeastState[] = aurasOf(world)): number {
  let speed = speciesDef(beast.species).speedMm * PRESETS[world.preset].speedPm;
  if (beast.elite !== null) speed = Math.round((speed * (100 + ELITE_TRAITS[beast.elite].speedPct)) / 100);
  const aura = auraPct(beast, generals);
  if (aura > 0) speed = Math.round((speed * (100 + aura)) / 100);
  if (beast.boss) {
    const phase = BOSSES[beast.species as BossId].phases[world.boss.phase - 1];
    if (phase !== undefined && phase.speedPct > 0) speed = Math.round((speed * (100 + phase.speedPct)) / 100);
  }
  return Math.round((speed * slowFactorPm(world, beast)) / 1000);
}

/** Where a beast's attack lands: the heart centre, the node, or for a flyer the heart edge point under its approach. */
export function attackPoint(world: World, beast: BeastState): PointU {
  const target = beast.target ?? chooseTarget(world, beast);
  const point = targetPoint(world, target);
  if (target.kind !== "heart" || !speciesDef(beast.species).flying) return point;
  const edge = mmToU(PRESSURE.heartEdgeMm);
  const d = straightDistance(beast.x, beast.z, 0, 0);
  if (d === 0) return { x: 0, z: edge };
  return { x: Math.round((beast.x * edge) / d), z: Math.round((beast.z * edge) / d) };
}

const stepOf = (beast: BeastState): number => Math.round(beast.speedPm / 1000);

/** Moves straight towards `point`, stopping `stopU` short of it; true when there (then it is within `stopU`). */
export function stepToward(beast: BeastState, point: PointU, stepU: number, stopU: number): boolean {
  const dx = beast.x - point.x;
  const dz = beast.z - point.z;
  const d = isqrt(dx * dx + dz * dz);
  if (d <= stopU) return true;
  beast.cell = -1;
  if (d - stopU <= stepU) {
    // Lands on the stop ring, rounded towards the point (one u inside it) so `within(stopU)` holds.
    const ring = stopU > 0 ? stopU - 1 : 0;
    beast.x = point.x + Math.trunc((dx * ring) / d);
    beast.z = point.z + Math.trunc((dz * ring) / d);
    return true;
  }
  beast.x -= Math.round((dx * stepU) / d);
  beast.z -= Math.round((dz * stepU) / d);
  return false;
}

function hold(beast: BeastState, mode: BeastState["mode"]): void {
  beast.mode = mode;
  beast.speedPm = 0;
}

function moveFlyer(world: World, beast: BeastState, act: BeastActDef): void {
  const point = attackPoint(world, beast);
  const hover = mmToU(act.rangeMm);
  if (within(beast.x, beast.z, point.x, point.z, hover)) return hold(beast, "dive");
  stepToward(beast, point, stepOf(beast), hover);
  beast.mode = "walk";
}

function moveGround(world: World, beast: BeastState): void {
  const def = speciesDef(beast.species);
  const target = beast.target ?? { kind: "heart" as const };
  if (target.kind === "node" && def.capturesNodes) {
    // A capturer walks onto the node point and stands there (canon §8.2).
    const node = targetPoint(world, target);
    if (beast.x === node.x && beast.z === node.z) return hold(beast, "capture");
    stepToward(beast, node, stepOf(beast), 0);
    beast.mode = "walk";
    return;
  }
  if (def.standOffMm > 0) {
    const point = targetPoint(world, target);
    if (within(beast.x, beast.z, point.x, point.z, mmToU(def.standOffMm))) return hold(beast, "throw");
  } else if (atHeartEdge(beast)) {
    // A capturer that reached the heart without ramming goes on to the node when it can take it.
    const node = def.capturesNodes ? capturableNode(world, beast) : null;
    if (node === null) return hold(beast, "bite");
    beast.target = { kind: "node", node: node.id };
    stepToward(beast, node.at, stepOf(beast), 0);
    beast.mode = "walk";
    return;
  }
  fieldStep(world, beast);
  beast.mode = "walk";
}

/** Keeps a point 1 m inside the field's edges (the Vương's straight retreat never leaves the field). */
function insideField(world: World, x: number, z: number): PointU {
  const f = world.stage.field;
  const margin = mmToU(FIELD.cellMm * 2);
  const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
  return { x: clamp(x, mmToU(f.minXMm) + margin, mmToU(f.maxXMm) - margin), z: clamp(z, mmToU(f.minZMm) + margin, mmToU(f.maxZMm) - margin) };
}

/**
 * The retreat's next point `next` from `beast`, slid round a Trận Trụ it would
 * enter (pillar radius + half the beast's width): along the pillar's tangent
 * on the side that leads away from the heart, back onto the ring if it cut inside.
 */
function slideRoundPillars(world: World, beast: BeastState, next: PointU, stepU: number): PointU {
  const clearance = mmToU(Math.round(speciesDef(beast.species).placeholder.widthMm / 2));
  for (const pillar of world.formation.pillars) {
    const ring = pillar.radiusU + clearance;
    const fx = beast.x - pillar.at.x;
    const fz = beast.z - pillar.at.z;
    const nx = next.x - pillar.at.x;
    const nz = next.z - pillar.at.z;
    // Only a step that goes into the ring and nearer the pillar (one stopped on its rim backs straight off).
    if (nx * nx + nz * nz >= ring * ring || nx * nx + nz * nz >= fx * fx + fz * fz) continue;
    let tx = -fz;
    let tz = fx;
    if (tx * beast.x + tz * beast.z < 0) {
      tx = -tx;
      tz = -tz;
    }
    const t = isqrt(tx * tx + tz * tz);
    if (t === 0) return { x: beast.x, z: beast.z };
    let x = beast.x + Math.round((tx * stepU) / t);
    let z = beast.z + Math.round((tz * stepU) / t);
    const ex = x - pillar.at.x;
    const ez = z - pillar.at.z;
    const e = isqrt(ex * ex + ez * ez);
    if (e > 0 && e < ring) {
      x = pillar.at.x + Math.round((ex * ring) / e);
      z = pillar.at.z + Math.round((ez * ring) / e);
    }
    return { x, z };
  }
  return next;
}

/**
 * P1 walks to `meleeMm` of the node (Vồ Xé); P2, P3 hold `chargeFromMm` from
 * the heart, backing off straight when closer, round a Trận Trụ in the way
 * (which may then stand on its charge line: answer (b)); a field edge in the
 * way ends the retreat where it stands (it charges from there).
 */
function moveBoss(world: World, beast: BeastState): void {
  const act = BOSSES[beast.species as BossId].bossAct;
  if (act === undefined) return hold(beast, "hold");
  const step = stepOf(beast);
  if (world.boss.phase <= 1) {
    const node = aimNode(world);
    const point = node === null ? { x: 0, z: 0 } : node.at;
    if (within(beast.x, beast.z, point.x, point.z, mmToU(act.meleeMm)) || atHeartEdge(beast)) return hold(beast, "hold");
    fieldStep(world, beast);
    beast.mode = "walk";
    return;
  }
  const want = mmToU(act.chargeFromMm);
  const d = straightDistance(beast.x, beast.z, 0, 0);
  if (d > want + step) {
    fieldStep(world, beast);
    beast.mode = "walk";
  } else if (d < want - step) {
    const move = Math.min(step, want - d);
    const ux = d === 0 ? 0 : beast.x;
    const uz = d === 0 ? -1 : beast.z;
    const len = d === 0 ? 1 : d;
    const radial = { x: beast.x + Math.round((ux * move) / len), z: beast.z + Math.round((uz * move) / len) };
    const slid = slideRoundPillars(world, beast, radial, step);
    const next = insideField(world, slid.x, slid.z);
    if (next.x === beast.x && next.z === beast.z) return hold(beast, "hold");
    beast.x = next.x;
    beast.z = next.z;
    beast.cell = -1;
    beast.mode = "leave";
  } else {
    hold(beast, "hold");
  }
}

/** Moves every live beast one tick; then elites (regen, Ấn requests). */
export function stepBeasts(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  const tick = world.tick;
  const stats = world.stats;
  const generals = aurasOf(world);
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    stats.foeTicks += 1;
    if (beast.slows.length > 0) {
      const live = beast.slows.filter((slow) => slow.until > tick);
      if (live.length !== beast.slows.length) beast.slows = live;
    }
    const act = actOf(beast.species);
    const broken = isBroken(world, beast);
    if (broken || beast.hardUntil > tick) {
      // Hard control and phá thế are counted (canon §8.3, Rồng G15); a held flyer is pulled down.
      beast.hardTicks += 1;
      stats.hardControlTicks += 1;
      beast.y = 0;
      hold(beast, broken ? "downed" : "stunned");
      continue;
    }
    beast.y = mmToU(act.flyMm);
    if (beast.mode === "roar" && beast.modeUntil > tick) {
      beast.speedPm = 0;
      continue;
    }
    // Winding up a telegraphed attack: stands still (its mode was set when it started).
    if (beast.telegraph >= 0) {
      beast.speedPm = 0;
      continue;
    }
    if (beast.target === null) beast.target = chooseTarget(world, beast);
    beast.speedPm = effectiveSpeedPm(world, beast, generals);
    if (beast.boss) moveBoss(world, beast);
    else if (speciesDef(beast.species).flying) moveFlyer(world, beast, act);
    else moveGround(world, beast);
  }
  stepElites(world);
}
