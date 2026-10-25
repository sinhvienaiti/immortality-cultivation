/**
 * Hộ thân `ward` (canon §9.1, §12.1, D34, PB-01): a world object at the
 * Cast's `origin`, r 2 m, 5 s, 3 blocks. It shields bots and node points
 * inside its ring (the world side: `wardCovering`, `blockAt`, Lane 5's
 * pressure.ts through `wardAt`), halves a big strike whose line its ring
 * crosses at the strike tick (`wardCrosses`, Thiết Bối Xung), and `local`
 * blocks its own player with it (`ward-use`, clamped at 0). Every charge
 * taken emits `ward block`. A ward lives while tick < untilTick and it has a
 * charge; one spent to 0 stays listed until the next tick's `stepWards`, so
 * `local` can see a last charge the world used in the same tick (canon §9.1:
 * both may block, one block of drift). The sim never asks where a player is.
 * Owner: Lane 4.
 */
import { kiemSkill } from "../content/data/school-kiem";
import type { PointU, SimCommand, Ward, WardsState, World, WorldInit } from "../content/types";
import { emit } from "./events";
import { isqrt, mmToU, msToTicks, within } from "./fixed";

export function createWardsState(_init: WorldInit): WardsState {
  return { list: [], nextId: 1 };
}

const live = (world: World, ward: Ward): boolean => world.tick < ward.untilTick && ward.charges > 0;

/** The seat's newest live ward with a charge, or null. */
function liveWard(world: World, seat: number): Ward | null {
  const list = world.wards.list;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const ward = list[index]!;
    if (ward.seat === seat && live(world, ward)) return ward;
  }
  return null;
}

/** Ô 3 resolved with the ward loadout: r 2 m, 5 s, 3 blocks at `origin` (data/school-kiem.ts). */
export function createWard(world: World, seat: number, origin: PointU): Ward {
  const def = kiemSkill(3, "ward");
  const effect = def.effect.kind === "ward" ? def.effect : { radiusMm: 0, durationMs: 0, charges: 0 };
  const ward: Ward = {
    id: world.wards.nextId,
    seat,
    originU: { x: origin.x, z: origin.z },
    radiusU: mmToU(effect.radiusMm),
    untilTick: world.tick + msToTicks(effect.durationMs),
    charges: effect.charges,
  };
  world.wards.nextId += 1;
  world.wards.list.push(ward);
  emit(world, { type: "ward", stage: "start", wardId: ward.id, seat, origin: ward.originU, charges: ward.charges });
  return ward;
}

/** The seat's live ward with charges, or null. */
export function wardAt(world: World, seat: number): { readonly wardId: number; readonly origin: PointU; readonly radius: number; readonly charges: number } | null {
  const ward = liveWard(world, seat);
  return ward === null ? null : { wardId: ward.id, origin: ward.originU, radius: ward.radiusU, charges: ward.charges };
}

/** Distance from `p` to segment a–b is ≤ `r` (integer; |d| by isqrt, products < 2^53 on the field). */
export function segmentNear(a: PointU, b: PointU, p: PointU, r: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return within(p.x, p.z, a.x, a.z, r);
  const t = (p.x - a.x) * dx + (p.z - a.z) * dz;
  if (t <= 0) return within(p.x, p.z, a.x, a.z, r);
  if (t >= len2) return within(p.x, p.z, b.x, b.z, r);
  const cross = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx);
  return cross <= r * isqrt(len2);
}

/** The seat's ward ring crosses segment a–b (Thiết Bối Xung's line at the strike tick, canon §10.5). */
export function wardCrosses(world: World, seat: number, a: PointU, b: PointU): boolean {
  const ward = liveWard(world, seat);
  return ward !== null && segmentNear(a, b, ward.originU, ward.radiusU);
}

/** The first live ward (seat order, then newest) whose ring holds `point` (a bot, a node point), or null. */
export function wardCovering(world: World, point: PointU): Ward | null {
  for (const seat of world.seats) {
    const ward = liveWard(world, seat.seat);
    if (ward !== null && within(point.x, point.z, ward.originU.x, ward.originU.z, ward.radiusU)) return ward;
  }
  return null;
}

/** Takes one charge (clamped at 0) and emits `ward block`; false when it had none left. */
function takeCharge(world: World, ward: Ward): boolean {
  if (ward.charges <= 0) return false;
  ward.charges -= 1;
  emit(world, { type: "ward", stage: "block", wardId: ward.id, seat: ward.seat, origin: ward.originU, charges: ward.charges });
  return true;
}

/** A strike on `point` (a bot, a node point) inside a live ward is blocked: one charge less; true when blocked. */
export function blockAt(world: World, point: PointU): boolean {
  const ward = wardCovering(world, point);
  return ward !== null && takeCharge(world, ward);
}

/** `ward-use` (from `local`, or the world's own block through pressure.ts): one charge less, clamped at 0. */
export function useWard(world: World, command: Extract<SimCommand, { type: "ward-use" }>): void {
  const ward = world.wards.list.find((item) => item.id === command.wardId);
  if (ward === undefined || ward.seat !== command.seat) {
    emit(world, { type: "rejected", command: "ward-use", reason: ward === undefined ? "ward" : "seat" });
    return;
  }
  takeCharge(world, ward);
}

/** Wards past their 5 s or spent to 0 end (a world block late in a tick ends at the next tick's step). */
export function stepWards(world: World): void {
  const list = world.wards.list;
  let keep = 0;
  for (let index = 0; index < list.length; index += 1) {
    const ward = list[index]!;
    if (world.tick >= ward.untilTick || ward.charges <= 0) {
      emit(world, { type: "ward", stage: "end", wardId: ward.id, seat: ward.seat, origin: ward.originU, charges: ward.charges });
      continue;
    }
    list[keep] = ward;
    keep += 1;
  }
  list.length = keep;
}
