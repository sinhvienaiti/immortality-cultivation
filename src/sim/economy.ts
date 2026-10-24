/**
 * Linh Sa (canon §14.2, D34, PB-07): wallets per seat in the world; fund
 * 900 × f split kills 60 % (by ĐĐ, booked at the death tick, a cluster pays
 * once), wave ends 25 % (+10 % each), learning 15 % (Thẻ Ôn, Học trước);
 * leftover → Thú Hạch noted only (no progression at M0a).
 * Owner: Lane 4. TODO(lane-4): from games/dragon-hold/src/sim/economy.ts.
 */
import type { BeastState, EconomyState, LinhSaReason, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/economy.ts " + name);
};

export function createEconomyState(_init: WorldInit): EconomyState {
  return todo("createEconomyState");
}

export function earn(_world: World, _seat: number, _amount: number, _reason: LinhSaReason): void {
  todo("earn");
}

/** False (and a `rejected` event by the caller) when the wallet is short. */
export function spend(_world: World, _seat: number, _amount: number, _reason: LinhSaReason): boolean {
  return todo("spend");
}

export function payWaveEnd(_world: World, _wave: number): void {
  todo("payWaveEnd");
}

/** One right Thẻ Ôn answer or Học trước word. */
export function payLearning(_world: World, _seat: number, _kind: "review-card" | "learn-ahead"): void {
  todo("payLearning");
}

/** The kill share of a dead beast (cluster: when its last beast dies). */
export function payKill(_world: World, _beast: BeastState): void {
  todo("payKill");
}

export function onBeastKilled(_world: World, _beast: BeastState): void {
  todo("onBeastKilled");
}

export function stepEconomy(_world: World): void {
  todo("stepEconomy");
}
