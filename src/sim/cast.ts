/**
 * The Cast transaction (canon §6.1, D08, D42): one finished word = exactly one
 * Cast{seat, slot, actionId, wordId, tick, channel, quality, origin}; a
 * duplicate actionId is dropped. No valid target: `held` 3 s at no cooldown,
 * then `fizzled` (the slot takes its next word at once). Only `resolved`
 * Casts give Chân Nguyên, Dưỡng and practice points (addChanNguyen).
 *
 * Lane 4's `resolveCast` finds the target and schedules the hits; it must not
 * change the world when it answers false (a held Cast asks again every tick
 * until it resolves or fizzles). On `resolved` this file stamps the seat's
 * `lastResolvedTick` (Dưỡng window, canon §8.2), calls `addChanNguyen` for
 * every resolved word (canon §6.6: the ultimate's own word too, after it spent
 * the bar), and an Ấn takes Thế −35 / √seats from its beast (canon §10.7).
 * Events are pushed with the world tick, as sim/events.ts emit does.
 * Owner: Lane 3.
 */
import { CAST, POSTURE, SIM } from "../content/rules";
import type { Cast, CastsState, SimEvent, World, WorldInit } from "../content/types";
import { addChanNguyen } from "./chan-nguyen";
import type { EventBody } from "./events";
import { postureHit } from "./posture";
import { resolveCast } from "./skills";
import { liveBeast, onCastSettled } from "./words";

declare module "../content/types" {
  interface CastsState {
    /** Per seat: n of the last Cast emitted (actionId = seat × 2^20 + n); a Cast at or below it is a duplicate. */
    readonly lastAction: number[];
    /** Duplicate Casts dropped (CB6: always 0 in a healthy run). */
    duplicates: number;
  }
}

const HELD_TICKS = Math.round((CAST.heldMs * SIM.tickHz) / 1000);

function out(world: World, body: EventBody): void {
  world.events.push({ ...body, tick: world.tick } as SimEvent);
}

/** floor(√n) for a non-negative integer (Newton, integers only). */
function isqrtInt(n: number): number {
  if (n < 2) return n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** Thế an Ấn takes: 35 solo, 35 / √seats in a team (canon §10.7), rounded half up. */
export function sealPosture(seats: number): number {
  const rootX1000 = isqrtInt(Math.max(1, seats) * 1_000_000);
  return Math.floor((2 * POSTURE.seal * 1000 + rootX1000) / (2 * rootX1000));
}

export function createCastsState(init: WorldInit): CastsState {
  const seats = Math.max(1, init.seats);
  return {
    held: [],
    nextAction: new Array<number>(seats).fill(0),
    resolved: 0,
    fizzled: 0,
    lastAction: new Array<number>(seats).fill(-1),
    duplicates: 0,
  };
}

/** seat × 2^20 + n (rules.ts CAST.actionSeatStride). */
export function nextActionId(world: World, seat: number): number {
  const casts = world.casts;
  const n = casts.nextAction[seat] ?? 0;
  casts.nextAction[seat] = n + 1;
  return seat * CAST.actionSeatStride + n;
}

function castEvent(world: World, cast: Cast): void {
  out(world, { type: "cast", state: cast.state, seat: cast.seat, slot: cast.slot, actionId: cast.actionId, wordId: cast.wordId, origin: cast.origin });
}

/** Asks Lane 4 for a target; on success books the Cast as resolved. */
function tryResolve(world: World, cast: Cast): boolean {
  if (!resolveCast(world, cast)) return false;
  cast.state = "resolved";
  world.casts.resolved += 1;
  world.stats.castsResolved += 1;
  const seat = world.seats[cast.seat];
  if (seat !== undefined) seat.lastResolvedTick = world.tick;
  addChanNguyen(world, cast.seat, cast.quality, cast.slot === "seal");
  if (cast.slot === "seal" && cast.target !== null) {
    const beast = liveBeast(world, cast.target);
    if (beast !== null) postureHit(world, beast, sealPosture(world.seats.length), "seal");
  }
  castEvent(world, cast);
  onCastSettled(world, cast, "resolved");
  return true;
}

/** Last correct letter: Lane 4's resolveCast looks for a target; none → held. */
export function emitCast(world: World, cast: Cast): void {
  const casts = world.casts;
  const n = cast.actionId - cast.seat * CAST.actionSeatStride;
  const last = casts.lastAction[cast.seat] ?? -1;
  if (n <= last) {
    // A duplicate (or replayed) actionId never casts twice (canon §6.1, CB6).
    casts.duplicates += 1;
    return;
  }
  casts.lastAction[cast.seat] = n;
  if (tryResolve(world, cast)) return;
  cast.state = "held";
  cast.heldUntil = world.tick + HELD_TICKS;
  casts.held.push(cast);
  world.stats.castsHeld += 1;
  castEvent(world, cast);
  onCastSettled(world, cast, "held");
}

/** Retries held Casts and fizzles them at 3 s. */
export function stepCasts(world: World): void {
  const held = world.casts.held;
  let keep = 0;
  for (let index = 0; index < held.length; index += 1) {
    const cast = held[index]!;
    if (tryResolve(world, cast)) continue;
    if (world.tick >= cast.heldUntil) {
      cast.state = "fizzled";
      world.casts.fizzled += 1;
      world.stats.castsFizzled += 1;
      castEvent(world, cast);
      onCastSettled(world, cast, "fizzled");
      continue;
    }
    held[keep] = cast;
    keep += 1;
  }
  held.length = keep;
}
