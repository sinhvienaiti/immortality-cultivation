// Source: games/dragon-hold/src/sim/shop.ts @06cd4e6 (adapted: wallets per seat, the 6 mechanism slots of canon §8.3 by kind, đan phù into 2 slots × 3; the same-break refund counts what was paid in that break)
/**
 * The shop (canon §8.3, §12.3, §14.3): in prep and breaks only — place a
 * mechanism on an empty slot of its kind (strip: Kiếm Thung; post: Lôi Phù
 * Trụ, Phong Ấn Võng), upgrade it (level 2: 70 % of the base price, level 3:
 * 100 %), sell it (70 % back; what was paid in this same break comes back
 * 100 %), buy đan phù (into a slot holding the same kind with room, else an
 * empty slot; 2 slots × 3). Fixed stock, never random; prices never change
 * inside a stage. Every refusal emits `rejected` with a reason.
 * Owner: Lane 4.
 */
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { MECHANISM_DEFS } from "../content/data/mechanisms";
import { CONSUMABLES, MECHANISMS } from "../content/rules";
import type { MechSlotState, ShopState, SimCommand, SimCommandType, World, WorldInit } from "../content/types";
import { earn, spend } from "./economy";
import { emit } from "./events";
import { mulDiv, uToM } from "./fixed";
import { slotPoint } from "./mechanisms";

export function createShopState(_init: WorldInit): ShopState {
  return { breakId: 0 };
}

/** The full shop is open in prep and breaks (canon §14.3). */
export const shopOpen = (world: World): boolean => world.phase === "prep" || world.phase === "break";

function reject(world: World, command: SimCommandType, reason: string): void {
  emit(world, { type: "rejected", command, reason });
}

/** Price of the next level of a built mechanism (0 when at the top). */
export function upgradePrice(slot: MechSlotState): number {
  if (slot.mech === null) return 0;
  const row = MECHANISMS.upgrades[slot.level - 1];
  return row === undefined ? 0 : mulDiv(MECHANISM_DEFS[slot.mech].price, row.pricePct, 100);
}

/** What selling gives back now: 70 % of what was paid, 100 % of what was paid in this same break (canon §8.3). */
export function sellRefund(world: World, slot: MechSlotState): number {
  if (slot.mech === null) return 0;
  const same = slot.breakId === world.shop.breakId ? slot.paidInBreak : 0;
  return mulDiv(slot.paid - same, MECHANISMS.refundPct, 100) + mulDiv(same, MECHANISMS.refundSameBreakPct, 100);
}

function mechEvent(world: World, slot: MechSlotState, stage: "built" | "upgraded" | "sold", mech: NonNullable<MechSlotState["mech"]>): void {
  const at = slotPoint(world, slot.index);
  emit(world, { type: "mechanism", stage, slot: slot.index, mech, level: slot.level, x: uToM(at.x), z: uToM(at.z) });
}

/** Books a payment into the slot's break (a new break starts its same-break amount from 0). */
function bookPaid(world: World, slot: MechSlotState, amount: number): void {
  if (slot.breakId !== world.shop.breakId) {
    slot.breakId = world.shop.breakId;
    slot.paidInBreak = 0;
  }
  slot.paid += amount;
  slot.paidInBreak += amount;
}

export function buy(world: World, command: Extract<SimCommand, { type: "buy" }>): void {
  if (!shopOpen(world)) return reject(world, "buy", "phase");
  const def = CONSUMABLE_DEFS[command.item];
  const seat = world.consumables.seats[command.seat];
  if (def === undefined || seat === undefined) return reject(world, "buy", "item");
  // The slot already holding this kind with room, else the first empty one.
  let slot = seat.slots.find((item) => item.item === command.item && item.count < CONSUMABLES.stack);
  if (slot === undefined && seat.slots.some((item) => item.item === command.item)) return reject(world, "buy", "full");
  slot ??= seat.slots.find((item) => item.item === null || item.count <= 0);
  if (slot === undefined) return reject(world, "buy", "full");
  if (!spend(world, command.seat, def.price, "buy")) return reject(world, "buy", "linh-sa");
  slot.item = command.item;
  slot.count += 1;
}

export function place(world: World, command: Extract<SimCommand, { type: "place" }>): void {
  if (!shopOpen(world)) return reject(world, "place", "phase");
  const slot = world.mechanisms.slots.find((item) => item.index === command.slot);
  const kind = world.stage.field.mechSlots.find((item) => item.index === command.slot)?.kind;
  const def = MECHANISM_DEFS[command.mech];
  if (slot === undefined || kind === undefined || def === undefined) return reject(world, "place", "slot");
  if (slot.mech !== null) return reject(world, "place", "taken");
  if (def.slotKind !== kind) return reject(world, "place", "kind");
  if (!spend(world, command.seat, def.price, "build")) return reject(world, "place", "linh-sa");
  slot.mech = command.mech;
  slot.level = 1;
  slot.paid = 0;
  slot.breakId = -1;
  bookPaid(world, slot, def.price);
  slot.nextFire = world.tick;
  mechEvent(world, slot, "built", command.mech);
}

export function upgrade(world: World, command: Extract<SimCommand, { type: "upgrade" }>): void {
  if (!shopOpen(world)) return reject(world, "upgrade", "phase");
  const slot = world.mechanisms.slots.find((item) => item.index === command.slot);
  if (slot === undefined || slot.mech === null) return reject(world, "upgrade", "empty");
  const price = upgradePrice(slot);
  if (price <= 0) return reject(world, "upgrade", "max");
  if (!spend(world, command.seat, price, "upgrade")) return reject(world, "upgrade", "linh-sa");
  slot.level += 1;
  bookPaid(world, slot, price);
  mechEvent(world, slot, "upgraded", slot.mech);
}

export function sell(world: World, command: Extract<SimCommand, { type: "sell" }>): void {
  if (!shopOpen(world)) return reject(world, "sell", "phase");
  const slot = world.mechanisms.slots.find((item) => item.index === command.slot);
  if (slot === undefined || slot.mech === null) return reject(world, "sell", "empty");
  const mech = slot.mech;
  const refund = sellRefund(world, slot);
  slot.mech = null;
  slot.level = 0;
  slot.paid = 0;
  slot.paidInBreak = 0;
  slot.breakId = -1;
  slot.nextFire = 0;
  earn(world, command.seat, refund, "sell");
  mechEvent(world, slot, "sold", mech);
}

/** waves.ts calls this when a break starts: the break number (same-break refunds, Thẻ Ôn's 3 a break). */
export function onBreakStart(world: World): void {
  world.shop.breakId += 1;
}
