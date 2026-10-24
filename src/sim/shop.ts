/**
 * The shop (canon §8.3, §14.3): buy, place, upgrade, sell in prep and
 * breaks; refund 70 %, 100 % in the same break; fixed stock, never random.
 * Owner: Lane 4. TODO(lane-4): from games/dragon-hold/src/sim/shop.ts.
 */
import type { ShopState, SimCommand, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/shop.ts " + name);
};

export function createShopState(_init: WorldInit): ShopState {
  return todo("createShopState");
}

export function buy(_world: World, _command: Extract<SimCommand, { type: "buy" }>): void {
  todo("buy");
}

export function place(_world: World, _command: Extract<SimCommand, { type: "place" }>): void {
  todo("place");
}

export function upgrade(_world: World, _command: Extract<SimCommand, { type: "upgrade" }>): void {
  todo("upgrade");
}

export function sell(_world: World, _command: Extract<SimCommand, { type: "sell" }>): void {
  todo("sell");
}

/** Waves call this when a break starts (same-break refunds). */
export function onBreakStart(_world: World): void {
  todo("onBreakStart");
}
