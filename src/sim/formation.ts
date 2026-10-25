/**
 * Trận Tâm and friends (canon §8.2): Trận Lực 1 000 solo (1 400 / 1 800 for 2 /
 * 3 seats, 3 500 Thất Tinh), 0 → defeat at cleanup, no heal in breaks;
 * Kết Giới r 9 m (its 15 % slow is beasts.ts slowFactorPm, by position);
 * Tâm nhãn while lit: Công +8 % on skill damage (combat.ts bucket), Thủ −15 %
 * on Trận Lực damage (here, the rest carried in ‰), Dưỡng 0.1 % of Trận Lực a
 * second while a seat that is up and whose Bàn Quyết is live had a resolved
 * Cast within 3 s / k, ≤ 15 % a match; node capture: a capturer standing 3 s
 * turns it off until it dies and deals Tẩy (words.ts dealCleanse); Tẩy typed:
 * lit again 1 s later, the capturer pushed out 2 m; Trận Trụ: 2 Vương rams
 * crack one (cracked: no longer stops rams, still stops rocks); `down`: −5 %.
 * Linh Dịch is NOT here: Lane 2's director.ts drops it (+5 % and the
 * `formation` `linh-dich` event); applying it again would heal twice (LANES.md).
 * Owner: Lane 4.
 */
import { FORMATION, SIM } from "../content/rules";
import type { BeastState, FormationState, NodeId, NodeState, PillarState, PointU, SimCommand, World, WorldInit } from "../content/types";
import { beastByRef, tamNhanOn } from "./combat";
import { emit } from "./events";
import { clamp, mmToU, msToTicks, mulDivSym, pct, unitPm, within } from "./fixed";
import { scaleTicks } from "./pace";
import { segmentNear } from "./wards";
import { dealCleanse, isBanQuyetLive, releaseWord } from "./words";

// Lane 4 fields on its own state (reported for Lane 2 to fold into types.ts).
declare module "../content/types" {
  interface FormationState {
    /** Thủ's −15 % below one Trận Lực point, carried, ‰ of a point. */
    defenceCarryPm: number;
    /** Dưỡng below one point, carried, ‱ of a point. */
    duongCarry: number;
  }
}

/** Trận Lực by seats (canon §8.2): solo 1 000, Lưỡng Nghi 1 400, Tam Tài 1 800, Thất Tinh 3 500. */
export function heartForSeats(seats: number): number {
  if (seats >= 7) return FORMATION.heartSeven;
  const rows = FORMATION.heartBySeats;
  return rows[clamp(seats, 1, rows.length) - 1]!;
}

export function createFormationState(init: WorldInit): FormationState {
  const heart = heartForSeats(init.seats);
  const field = init.stage.field;
  return {
    heart,
    heartMax: heart,
    nodes: field.nodes.map((node) => ({ id: node.id, at: { x: mmToU(node.at.xMm), z: mmToU(node.at.zMm) }, on: true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 })),
    pillars: field.pillars.map((pillar) => ({ id: pillar.id, at: { x: mmToU(pillar.at.xMm), z: mmToU(pillar.at.zMm) }, radiusU: mmToU(pillar.radiusMm), rams: 0, cracked: false })),
    duongHealed: 0,
    lastHeartHitTick: -1,
    defenceCarryPm: 0,
    duongCarry: 0,
  };
}

const finished = (world: World): boolean => world.phase === "victory" || world.phase === "defeat";

function heartEvent(world: World): void {
  const formation = world.formation;
  emit(world, { type: "formation", what: "heart", heart: formation.heart, heartMax: formation.heartMax, node: null });
}

/** Takes `loss` straight off Trận Lực (no Thủ); returns what it took. */
function loseHeart(world: World, loss: number): number {
  const formation = world.formation;
  const taken = loss > formation.heart ? formation.heart : loss;
  if (taken <= 0) return 0;
  formation.heart -= taken;
  formation.lastHeartHitTick = world.tick;
  world.stats.heartLost += taken;
  heartEvent(world);
  return taken;
}

/**
 * Trận Lực damage from a beast (`amount` after × g(K) × preset, pressure.ts and
 * boss.ts); the lit Tâm nhãn's Thủ takes 15 % off, carried below one point.
 * Returns what was lost; 0 → defeat at cleanup.
 */
export function damageFormation(world: World, amount: number, _source: string): number {
  if (amount <= 0 || finished(world)) return 0;
  const formation = world.formation;
  let loss = amount;
  if (tamNhanOn(world)) {
    const kept = amount * (1000 - FORMATION.tamNhan.defencePct * 10) + formation.defenceCarryPm;
    loss = Math.floor(kept / 1000);
    formation.defenceCarryPm = kept - loss * 1000;
  }
  return loseHeart(world, loss);
}

/** (x, z) in u inside the Kết Giới (r 9 m). */
export function inBarrier(x: number, z: number): boolean {
  return within(x, z, 0, 0, mmToU(FORMATION.barrierRadiusMm));
}

export function nodeState(world: World, node: NodeId): NodeState {
  const state = world.formation.nodes.find((item) => item.id === node);
  if (state === undefined) throw new Error("formation: no node " + node);
  return state;
}

const sameRef = (a: { slot: number; serial: number } | null, beast: BeastState): boolean => a !== null && a.slot === beast.slot && a.serial === beast.serial;

/** A capturer stands on the node (pressure.ts, each tick): 3 s turns it off until it dies, and Tẩy is dealt to each seat. */
export function occupyNode(world: World, beast: BeastState, node: NodeId): void {
  const state = world.formation.nodes.find((item) => item.id === node);
  if (state === undefined || !beast.alive || !state.on) return;
  if (!sameRef(state.capturedBy, beast)) {
    state.capturedBy = { slot: beast.slot, serial: beast.serial };
    state.captureFrom = world.tick;
    return;
  }
  if (world.tick - state.captureFrom < msToTicks(FORMATION.captureMs)) return;
  state.on = false;
  emit(world, { type: "formation", what: "node-off", heart: world.formation.heart, heartMax: world.formation.heartMax, node: state.id });
  for (const seat of world.seats) dealCleanse(world, seat.seat, state.id);
}

/**
 * Tẩy typed (a `cleanse` Cast, skills.ts): the node lights again 1 s later and
 * its capturer is pushed 2 m out. False (the Cast stays held) when the node is lit or already relighting.
 */
export function cleanseNode(world: World, node: NodeId): boolean {
  const state = world.formation.nodes.find((item) => item.id === node);
  if (state === undefined || state.on || state.relightAt >= 0) return false;
  state.relightAt = world.tick + msToTicks(FORMATION.relightMs);
  const holder = state.capturedBy === null ? null : beastByRef(world, state.capturedBy);
  if (holder !== null) pushFrom(world, holder, state.at, mmToU(FORMATION.pushMm));
  return true;
}

const away = { x: 0, z: 0 };

/** Pushes `beast` `distanceU` away from `from` (north when on it), kept on the field. */
function pushFrom(world: World, beast: BeastState, from: PointU, distanceU: number): void {
  unitPm(beast.x - from.x, beast.z - from.z, away);
  if (away.x === 0 && away.z === 0) away.z = -1000;
  const field = world.stage.field;
  beast.x = clamp(beast.x + mulDivSym(away.x, distanceU, 1000), mmToU(field.minXMm), mmToU(field.maxXMm));
  beast.z = clamp(beast.z + mulDivSym(away.z, distanceU, 1000), mmToU(field.minZMm), mmToU(field.maxZMm));
  beast.cell = -1;
}

/** The first Trận Trụ (intact or cracked) whose circle (radiusU) segment a–b meets, nearest `a` along it, or null. */
export function pillarOnSegment(world: World, a: PointU, b: PointU): PillarState | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let best: PillarState | null = null;
  let bestT = 0;
  for (const pillar of world.formation.pillars) {
    if (!segmentNear(a, b, pillar.at, pillar.radiusU)) continue;
    const t = (pillar.at.x - a.x) * dx + (pillar.at.z - a.z) * dz;
    if (best === null || t < bestT) {
      best = pillar;
      bestT = t;
    }
  }
  return best;
}

/** A Vương ram hits a pillar: 2 rams crack it (canon §8.2, §10.5 answer (b)). */
export function hitPillar(world: World, pillar: PillarState): void {
  pillar.rams += 1;
  emit(world, { type: "pillar", stage: "hit", pillar: pillar.id, rams: pillar.rams });
  if (pillar.cracked || pillar.rams < FORMATION.pillarRams) return;
  pillar.cracked = true;
  emit(world, { type: "pillar", stage: "crack", pillar: pillar.id, rams: pillar.rams });
}

/**
 * `down` from `local`: world.ts already marked the seat down 8 s and released
 * its words; this only takes 5 % of Trận Lực (canon §4.1, no Thủ).
 */
export function applyDown(world: World, _command: Extract<SimCommand, { type: "down" }>): void {
  if (finished(world)) return;
  world.stats.downs += 1;
  loseHeart(world, pct(world.formation.heartMax, FORMATION.downPenaltyPct));
}

function nodeOn(world: World, node: NodeState): void {
  node.on = true;
  node.capturedBy = null;
  node.captureFrom = -1;
  node.relightAt = -1;
  emit(world, { type: "formation", what: "node-on", heart: world.formation.heart, heartMax: world.formation.heartMax, node: node.id });
}

/** A seat feeds Dưỡng: up, its Bàn Quyết live, a resolved Cast within 3 s / k (canon §8.2, D42). */
function duongSeat(world: World): boolean {
  const spanTicks = msToTicks(FORMATION.tamNhan.regenWindowMs);
  for (const seat of world.seats) {
    if (seat.downUntil > world.tick || seat.lastResolvedTick < 0 || !isBanQuyetLive(world, seat.seat)) continue;
    if (world.tick - seat.lastResolvedTick <= scaleTicks(spanTicks, seat.kPm)) return true;
  }
  return false;
}

function stepDuong(world: World): void {
  const formation = world.formation;
  if (world.tick % SIM.tickHz !== 0 || !tamNhanOn(world) || !duongSeat(world)) return;
  const cap = pct(formation.heartMax, FORMATION.tamNhan.regenCapPct);
  if (formation.duongHealed >= cap || formation.heart >= formation.heartMax) return;
  formation.duongCarry += formation.heartMax * FORMATION.tamNhan.regenPermyriadPerS;
  let heal = Math.floor(formation.duongCarry / 10_000);
  formation.duongCarry -= heal * 10_000;
  if (heal > cap - formation.duongHealed) heal = cap - formation.duongHealed;
  if (heal > formation.heartMax - formation.heart) heal = formation.heartMax - formation.heart;
  if (heal <= 0) return;
  formation.heart += heal;
  formation.duongHealed += heal;
  heartEvent(world);
}

/** A capturer's death lights its node again (and drops its Tẩy); Tẩy's 1 s ends; Dưỡng once a second. */
export function stepFormation(world: World): void {
  if (finished(world)) return;
  for (const node of world.formation.nodes) {
    if (node.capturedBy !== null && beastByRef(world, node.capturedBy) === null) {
      const off = !node.on;
      if (node.cleanse >= 0) releaseWord(world, node.cleanse, "target-gone");
      if (off) nodeOn(world, node);
      else {
        node.capturedBy = null;
        node.captureFrom = -1;
      }
      continue;
    }
    if (node.relightAt >= 0 && world.tick >= node.relightAt) nodeOn(world, node);
  }
  stepDuong(world);
}
