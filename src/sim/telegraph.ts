/**
 * Telegraphs (canon §10.6, D10, PB-27, PB-28): one formula
 * T = 1.6 × (0.4 + 0.5 + 12 (ℓ + 1) / (0.86 × E_floor) + 0.2 + t_channel);
 * charge = max(T, base charge / k) through `chargeTicks` only (no
 * telegraphScale at M0a); no typed answer: ≥ 1.2 s + half width ÷ 5 m/s, and
 * the k stretch never takes a charge under that floor either. Shapes circle,
 * cone, line, cell; events start, strike, cancel. Every number is rounded up
 * so a charge is never shorter than the canon's T or floor.
 *
 * The world step has no telegraph slot: stepBeastAttacks and stepBoss resolve
 * the strikes they own, then stepBoss calls `stepTelegraphs` to strike or drop
 * whatever is left (a source that died is cancelled).
 * Owner: Lane 5.
 */
import { TELEGRAPHS } from "../content/data/telegraphs";
import { LETTERS, PRESSURE, SEAL_WORDS, SIM, TELEGRAPH } from "../content/rules";
import type { ActiveTelegraph, BeastRef, PointU, Preset, TelegraphDef, TelegraphShape, TelegraphsState, World, WorldInit } from "../content/types";
import { emit } from "./events";
import { isqrt, mmToU, uToM } from "./fixed";
import { kForSeat } from "./pace";
import { beastAt } from "./world";

/** ceil(a / b) for a ≥ 0, b > 0. */
const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/** Milliseconds to ticks, rounded up. */
export const msToTicksUp = (ms: number): number => ceilDiv(ms * SIM.tickHz, 1000);

export function createTelegraphsState(_init: WorldInit): TelegraphsState {
  return { active: [], nextId: 1 };
}

export function telegraphDef(id: string): TelegraphDef {
  const def = TELEGRAPHS[id];
  if (!def) throw new Error("telegraph: no def " + id);
  return def;
}

/** T of the preset for a word of `letters` letters, ms rounded up (canon §10.6 table: ℓ 5 Cân bằng 7.1 s). */
export function T(preset: Preset, letters: number, channelMs: number): number {
  const e = TELEGRAPH.eFloor[preset];
  const fixedMs = TELEGRAPH.readMs + TELEGRAPH.recognizeMs + TELEGRAPH.animMs + channelMs;
  // T = factor × (fixed + perChar × (ℓ + 1) × 10^6 / (d × E)) / 1000, all in integers.
  const num = TELEGRAPH.factorPm * (fixedMs * TELEGRAPH.dPm * e + TELEGRAPH.perCharS * 1_000_000 * (letters + 1));
  return ceilDiv(num, 1000 * TELEGRAPH.dPm * e);
}

/** The longest word of the typed answer at this preset (Ấn: Thư giãn, Học 5 · Cân bằng 6 · Thử thách 7). */
export function answerLetters(def: TelegraphDef, preset: Preset): number {
  if (def.answers.includes("seal")) return SEAL_WORDS.lengths[preset][1];
  // No other typed answer exists at M0a; the longest word any slot may hold keeps T safe.
  return LETTERS.maxLen;
}

/** The no-word floor: 1.2 s + half the width ÷ 5 m/s, ms rounded up (PB-27). */
export function noWordFloorMs(def: TelegraphDef): number {
  return TELEGRAPH.floorMs + ceilDiv(def.sizeMm.width * 1000, 2 * TELEGRAPH.dodgeMmPerS);
}

/** Charge ticks of `def` at `preset` and pace kPm: max(T, base / k), never under T (CB5) or under the no-word floor. */
export function chargeTicks(def: TelegraphDef, preset: Preset, kPm: number): number {
  const k = kPm > 0 ? kPm : 1000;
  if (def.typedAnswer) {
    const tMs = T(preset, answerLetters(def, preset), 0);
    const baseMs = def.chargeMs === "T" ? tMs : def.chargeMs;
    // base / k in ticks = base × 60 / kPm.
    return Math.max(msToTicksUp(tMs), ceilDiv(baseMs * SIM.tickHz, k));
  }
  if (def.chargeMs === "T") throw new Error("telegraph: " + def.id + " has no typed answer, so no T");
  return Math.max(msToTicksUp(noWordFloorMs(def)), ceilDiv(def.chargeMs * SIM.tickHz, k));
}

/** The pace a world telegraph uses: the slowest seat's k, so no seat ever gets less than its own T / k (solo: the player's). */
export function telegraphKPm(world: World): number {
  let k = 0;
  for (const seat of world.seats) {
    const seatK = kForSeat(world, seat.seat);
    if (k === 0 || seatK < k) k = seatK;
  }
  return k > 0 ? k : 1000;
}

/** The shape fields `inTelegraph` reads (an ActiveTelegraph, or `shapeFromEvent` of a strike event). */
export interface TelegraphShapeU {
  readonly def: string;
  readonly from: PointU;
  readonly to: PointU;
  readonly reachU: number;
  readonly widthU: number;
}

const refOf = (beast: { readonly slot: number; readonly serial: number }): BeastRef => ({ slot: beast.slot, serial: beast.serial });

/**
 * The event's shape in metres (types.ts SimEvent telegraph): circle and cell
 * centred on (toX, toZ); cone and line from (x, z) towards (toX, toZ), reachM
 * long. A line that stopped early (`to` given) reports its shortened reach.
 */
function eventBody(stage: "start" | "strike" | "cancel", t: ActiveTelegraph, def: TelegraphDef, to: PointU = t.to) {
  const reachU = to === t.to ? t.reachU : isqrt((to.x - t.from.x) * (to.x - t.from.x) + (to.z - t.from.z) * (to.z - t.from.z));
  return {
    type: "telegraph" as const,
    stage,
    id: t.id,
    def: t.def,
    shape: def.shape,
    x: uToM(t.from.x),
    z: uToM(t.from.z),
    toX: uToM(to.x),
    toZ: uToM(to.z),
    reachM: uToM(reachU),
    widthM: uToM(t.widthU),
    strikeTick: t.strikeTick,
    answers: def.answers,
    source: t.source,
  };
}

/**
 * Starts a telegraph; emits `telegraph start`. Circle and cell: `from` is the
 * centre (`to` is ignored). Cone: apex `from`, aimed at `to`, `reach` long.
 * Line: from `from` to `to`.
 */
export function telegraph(world: World, def: TelegraphDef, source: BeastRef | null, from: PointU, to: PointU): ActiveTelegraph {
  const state = world.telegraphs;
  const id = state.nextId;
  state.nextId += 1;
  let end: PointU = { x: from.x, z: from.z };
  let reachU = mmToU(def.sizeMm.reach);
  if (def.shape === "cone") {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = isqrt(dx * dx + dz * dz);
    // A cone with no direction points south (towards the camera); it never happens in play.
    end = len > 0 ? { x: from.x + Math.round((dx * reachU) / len), z: from.z + Math.round((dz * reachU) / len) } : { x: from.x, z: from.z + reachU };
  } else if (def.shape === "line") {
    end = { x: to.x, z: to.z };
    reachU = isqrt((to.x - from.x) * (to.x - from.x) + (to.z - from.z) * (to.z - from.z));
  }
  const active: ActiveTelegraph = {
    id,
    def: def.id,
    source: source === null ? null : { slot: source.slot, serial: source.serial },
    from: { x: from.x, z: from.z },
    to: end,
    reachU,
    widthU: mmToU(def.sizeMm.width),
    startTick: world.tick,
    strikeTick: world.tick + chargeTicks(def, world.preset, telegraphKPm(world)),
    cancelled: false,
  };
  state.active.push(active);
  emit(world, eventBody("start", active, def));
  return active;
}

export function findTelegraph(world: World, id: number): ActiveTelegraph | null {
  return world.telegraphs.active.find((t) => t.id === id) ?? null;
}

/** Removes `t` and clears its source's windup slot. */
function finish(world: World, t: ActiveTelegraph): void {
  const list = world.telegraphs.active;
  const index = list.indexOf(t);
  if (index >= 0) list.splice(index, 1);
  if (t.source !== null) {
    const beast = beastAt(world, t.source);
    if (beast !== null && beast.telegraph === t.id) beast.telegraph = -1;
  }
}

export function cancelTelegraph(world: World, id: number): void {
  const t = findTelegraph(world, id);
  if (t === null) return;
  t.cancelled = true;
  finish(world, t);
  emit(world, eventBody("cancel", t, telegraphDef(t.def)));
}

/** Strikes `t` now; `impact` shortens a line that stopped early (a Trận Trụ). `local` applies the player part. */
export function strikeTelegraph(world: World, t: ActiveTelegraph, impact?: PointU): void {
  finish(world, t);
  emit(world, eventBody("strike", t, telegraphDef(t.def), impact ?? t.to));
}

/** Cancels every telegraph `source` started (break, roar). */
export function cancelSourceTelegraphs(world: World, source: { readonly slot: number; readonly serial: number }): void {
  const ref = refOf(source);
  for (const t of [...world.telegraphs.active]) {
    if (t.source !== null && t.source.slot === ref.slot && t.source.serial === ref.serial) cancelTelegraph(world, t.id);
  }
}

/** Telegraphs whose strike tick has come, oldest first (a copy: resolvers remove them). */
export function dueTelegraphs(world: World): ActiveTelegraph[] {
  return world.telegraphs.active.filter((t) => t.strikeTick <= world.tick);
}

/** A telegraph with a typed answer is on (canon §10.6: no new word on any slot meanwhile; Lane 3 asks). */
export function typedTelegraphActive(world: World): boolean {
  return world.telegraphs.active.some((t) => telegraphDef(t.def).typedAnswer);
}

/** Sweep after the resolvers: drop telegraphs whose source died, strike what is still due (no world part). */
export function stepTelegraphs(world: World): void {
  for (const t of [...world.telegraphs.active]) {
    if (t.source !== null && beastAt(world, t.source) === null) cancelTelegraph(world, t.id);
    else if (t.strikeTick <= world.tick) strikeTelegraph(world, t);
  }
}

// ── Shapes (integer geometry; u values up to ~2.4e6 keep products under 2^53) ──

const floorDiv = (a: number, b: number): number => Math.floor(a / b);

/** (x, z) is inside the shape, or within `marginU` of it (a body radius, the heart disk). */
export function inTelegraph(t: TelegraphShapeU, x: number, z: number, marginU = 0): boolean {
  const shape: TelegraphShape = telegraphDef(t.def).shape;
  if (shape === "circle" || shape === "cell") {
    // Centred on `to` (= `from` for these shapes).
    const cx = x - t.to.x;
    const cz = z - t.to.z;
    if (shape === "cell") {
      const half = floorDiv(t.reachU, 2) + marginU;
      return Math.abs(cx) <= half && Math.abs(cz) <= half;
    }
    const r = t.reachU + marginU;
    return cx * cx + cz * cz <= r * r;
  }
  const px = x - t.from.x;
  const pz = z - t.from.z;
  const dx = t.to.x - t.from.x;
  const dz = t.to.z - t.from.z;
  const len = isqrt(dx * dx + dz * dz);
  const halfW = floorDiv(t.widthU, 2);
  if (len === 0) {
    const r = halfW + marginU;
    return px * px + pz * pz <= r * r;
  }
  const along = floorDiv(px * dx + pz * dz, len);
  const perp = floorDiv(Math.abs(px * dz - pz * dx), len);
  if (along < -marginU || along > len + marginU) return false;
  if (shape === "line") return perp <= halfW + marginU;
  // Cone: half-width grows from 0 at the apex to halfW at `reach`.
  return perp * len <= Math.max(0, along) * halfW + marginU * len;
}

/** The strike touches the heart (disk r = heart edge at the origin): its Trận Lực part applies. */
export function touchesHeart(t: TelegraphShapeU): boolean {
  return inTelegraph(t, 0, 0, mmToU(PRESSURE.heartEdgeMm));
}

/** The shape of a `telegraph` event (metres back to u) for readers such as `local`. */
export function shapeFromEvent(event: { readonly def: string; readonly x: number; readonly z: number; readonly toX: number; readonly toZ: number; readonly reachM: number; readonly widthM: number }): TelegraphShapeU {
  const u = (m: number): number => Math.round(m * SIM.uPerM) + 0;
  return { def: event.def, from: { x: u(event.x), z: u(event.z) }, to: { x: u(event.toX), z: u(event.toZ) }, reachU: u(event.reachM), widthU: u(event.widthM) };
}
