/**
 * Đan, phù in the sim (canon §12.3, D34): 2 slots × 3 (the 3rd slot is Thư
 * Lâu's, M1), keys 1/2/3 → `consumable{seat, slot, origin, aim}`, one shared
 * 8 s cooldown, not while down, no typing and no learning reward. The sim
 * keeps the counts, the cooldown and the Linh Sa (bought in shop.ts), emits
 * `consumable{seat, kind}` and applies the world part: Lôi Hỏa Phù at the
 * cursor on the field, else the densest cluster within 14 m: 1.6 W magic on
 * every beast within 3 m, one area hit (cluster cap 60 %); with no target it
 * is not used. Hồi Xuân Đan and Kim Thân Phù touch nothing in the world:
 * local/consumables.ts applies them to its own player on the event.
 * Owner: Lane 4.
 */
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import { CONSUMABLES } from "../content/rules";
import type { ConsumablesState, SimCommand, World, WorldInit } from "../content/types";
import { areaVictims, createAreaHit, damageBeast, wHpOf } from "./combat";
import { emit } from "./events";
import { mmToU, msToTicks, uToM } from "./fixed";
import { groundPoint } from "./skills";

export function createConsumablesState(init: WorldInit): ConsumablesState {
  const seats: ConsumablesState["seats"] = [];
  for (let seat = 0; seat < Math.max(1, init.seats); seat += 1) {
    const slots: ConsumablesState["seats"][number]["slots"][number][] = [];
    for (let slot = 0; slot < CONSUMABLES.slots; slot += 1) slots.push({ item: null, count: 0 });
    seats.push({ slots, cooldownUntil: 0 });
  }
  return { seats };
}

function reject(world: World, reason: string): void {
  emit(world, { type: "rejected", command: "consumable", reason });
}

export function useConsumable(world: World, command: Extract<SimCommand, { type: "consumable" }>): void {
  if (world.phase === "victory" || world.phase === "defeat") return reject(world, "phase");
  const seat = world.seats[command.seat];
  const own = world.consumables.seats[command.seat];
  if (seat === undefined || own === undefined) return reject(world, "seat");
  if (seat.downUntil > world.tick) return reject(world, "down");
  const slot = own.slots[command.slot];
  if (slot === undefined) return reject(world, "slot");
  if (slot.item === null || slot.count <= 0) return reject(world, "empty");
  if (world.tick < own.cooldownUntil) return reject(world, "cooldown");
  const kind = slot.item;
  const def = CONSUMABLE_DEFS[kind];
  let at = { x: command.origin.x, z: command.origin.z };
  if (def.effect.kind === "bomb") {
    const point = groundPoint(world, command.aim, command.origin, mmToU(def.effect.rangeMm), mmToU(def.effect.radiusMm));
    if (point === null) return reject(world, "target");
    at = point;
    const amount = wHpOf(world, def.effect.w100);
    const area = createAreaHit();
    for (const beast of areaVictims(world, at.x, at.z, mmToU(def.effect.radiusMm))) damageBeast(world, beast, amount, "magic", { seat: command.seat, source: "consumable", grade: null, area });
  }
  slot.count -= 1;
  if (slot.count <= 0) {
    slot.count = 0;
    slot.item = null;
  }
  own.cooldownUntil = world.tick + msToTicks(CONSUMABLES.cooldownMs);
  emit(world, { type: "consumable", seat: command.seat, kind, x: uToM(at.x), z: uToM(at.z) });
}

/** Nothing runs by the tick: counts and the cooldown change on commands. */
export function stepConsumables(_world: World): void {}
