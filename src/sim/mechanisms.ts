// Source: games/dragon-hold/src/sim/traps.ts @06cd4e6 (adapted: only the levelled main effect, trapMainPm → levelPm; the three canon §8.3 mechanisms are written new)
/**
 * Mechanisms (canon §8.3, data/mechanisms.ts) on the stage's 6 slots, levels
 * 1–3, triggering by themselves (no typing at MVP):
 * - Kiếm Thung (strip 4 × 2 m laid along the path towards the heart): slow
 *   25 % while inside; 0.05 W/s physical to each beast inside, one pulse a second.
 * - Lôi Phù Trụ (post): every 4 s a chain on the 3 beasts nearest the heart
 *   within 7 m, 0.25 W magic each (one area hit: the swarm cluster cap).
 * - Phong Ấn Võng (post): every 10 s holds the beast with the largest W within
 *   7 m (ties: nearer the heart, then smaller beastId) for 3 s (`hardUntil`;
 *   beasts.ts pulls a flyer down and counts the hold), Thế −15.
 * Flyers in the air skip ground mechanisms (Kiếm Thung, Lôi Phù Trụ; beasts.ts
 * isAirborne); Phong Ấn Võng takes them. Hard control stays ≤ 35 % of each
 * beast's life: a hold is cut so hardTicks ≤ 35 % of its age at the hold's end.
 * Levels multiply the main effect (damage; Phong Ấn Võng's hold) by 1.45, then
 * 1.35 more (as Rồng's trapMainPm).
 * A mechanism with no target waits for one; same-kind slows keep the strongest.
 * Owner: Lane 4.
 */
import { MECHANISM_DEFS } from "../content/data/mechanisms";
import { DAMAGE, MECHANISMS, POSTURE, SIM } from "../content/rules";
import type { BeastState, MechSlotState, MechanismDef, MechanismsState, PointU, World, WorldInit } from "../content/types";
import { isAirborne } from "./beasts";
import { addSlow, createAreaHit, damageBeast, wHpOf } from "./combat";
import { emit } from "./events";
import { heartDistance } from "./field";
import { mmToU, msToTicks, mulDiv, unitPm, uToM, within } from "./fixed";
import { damageImmune, isBroken, postureHit } from "./posture";
import { speciesW100 } from "./targeting";

// Lane 4 field on its own state (reported for Lane 2 to fold into types.ts).
declare module "../content/types" {
  interface MechSlotState {
    /** Linh Sa paid in break `breakId` (refunded 100 % when sold in that break, the rest 70 %). */
    paidInBreak: number;
  }
}

export function createMechanismsState(init: WorldInit): MechanismsState {
  return {
    slots: init.stage.field.mechSlots.map((slot) => ({ index: slot.index, mech: null, level: 0, paid: 0, breakId: -1, nextFire: 0, paidInBreak: 0 })),
  };
}

/** Main effect ‰ at `level` (1 000, 1 450, 1 958): each level × (100 + effectPct) / 100, half up. */
export function levelPm(level: number): number {
  let pm = 1000;
  for (let step = 1; step < level && step <= MECHANISMS.upgrades.length; step += 1) pm = mulDiv(pm, 100 + MECHANISMS.upgrades[step - 1]!.effectPct, 100);
  return pm;
}

/** The slot's point, u. */
export function slotPoint(world: World, index: number): PointU {
  const slot = world.stage.field.mechSlots.find((item) => item.index === index);
  return slot === undefined ? { x: 0, z: 0 } : { x: mmToU(slot.at.xMm), z: mmToU(slot.at.zMm) };
}

const axis = { x: 0, z: 0 };

/** Inside a Kiếm Thung strip centred on `at`, laid along at → heart: |along| ≤ length / 2, |across| ≤ width / 2. */
export function inStrip(at: PointU, lengthU: number, widthU: number, x: number, z: number): boolean {
  unitPm(-at.x, -at.z, axis);
  if (axis.x === 0 && axis.z === 0) axis.z = -1000;
  const rx = x - at.x;
  const rz = z - at.z;
  const along = rx * axis.x + rz * axis.z;
  const across = rx * axis.z - rz * axis.x;
  return Math.abs(along) * 2 <= lengthU * 1000 && Math.abs(across) * 2 <= widthU * 1000;
}

/** Ticks of hold `beast` may still take so its hard control stays ≤ 35 % of its life at the hold's end. */
export function holdAllowance(world: World, beast: BeastState, want: number): number {
  const age = world.tick - beast.bornAt;
  // hardTicks + h ≤ 35 % × (age + h)  ⇔  h ≤ (35 age − 100 hardTicks) / 65.
  const cap = DAMAGE.hardControlCapPct;
  const room = Math.floor((cap * age - 100 * beast.hardTicks) / (100 - cap));
  if (room <= 0) return 0;
  return room < want ? room : want;
}

function trigger(world: World, slot: MechSlotState, at: PointU): void {
  emit(world, { type: "mechanism", stage: "trigger", slot: slot.index, mech: slot.mech!, level: slot.level, x: uToM(at.x), z: uToM(at.z) });
}

function stepStrip(world: World, slot: MechSlotState, def: MechanismDef, at: PointU): void {
  const effect = def.effect;
  if (effect.kind !== "strip") return;
  const lengthU = mmToU(effect.lengthMm);
  const widthU = mmToU(effect.widthMm);
  const pulse = world.tick >= slot.nextFire;
  if (pulse) slot.nextFire = world.tick + SIM.tickHz;
  const amount = mulDiv(wHpOf(world, effect.w100PerS), levelPm(slot.level), 1000);
  const area = pulse ? createAreaHit() : null;
  let hit = false;
  for (const beast of world.beasts.list) {
    if (!beast.alive || isAirborne(beast) || !inStrip(at, lengthU, widthU, beast.x, beast.z)) continue;
    addSlow(world, beast, def.id, effect.slowPct);
    if (area === null) continue;
    damageBeast(world, beast, amount, def.damageType, { seat: 0, source: "mechanism", grade: null, area });
    hit = true;
  }
  if (hit) trigger(world, slot, at);
}

/** Up to `count` ground beasts within `rangeU` of `at`, nearest the heart first (ties: smaller beastId). */
function nearestHeartIn(world: World, at: PointU, rangeU: number, count: number): BeastState[] {
  const picked: { beast: BeastState; d: number }[] = [];
  for (const beast of world.beasts.list) {
    if (!beast.alive || isAirborne(beast) || !within(beast.x, beast.z, at.x, at.z, rangeU)) continue;
    picked.push({ beast, d: heartDistance(world, beast) });
  }
  picked.sort((a, b) => a.d - b.d || a.beast.serial - b.beast.serial);
  return picked.slice(0, count).map((item) => item.beast);
}

function stepChain(world: World, slot: MechSlotState, def: MechanismDef, at: PointU): void {
  const effect = def.effect;
  if (effect.kind !== "chain" || world.tick < slot.nextFire) return;
  const targets = nearestHeartIn(world, at, mmToU(effect.rangeMm), effect.targets);
  if (targets.length === 0) return;
  slot.nextFire = world.tick + msToTicks(effect.everyMs);
  const amount = mulDiv(wHpOf(world, effect.w100), levelPm(slot.level), 1000);
  const area = createAreaHit();
  for (const beast of targets) damageBeast(world, beast, amount, def.damageType, { seat: 0, source: "mechanism", grade: null, area });
  trigger(world, slot, at);
}

/** Phong Ấn Võng's pick: the largest W within range that a hold still fits (not held, broken or roaring). */
function snareTarget(world: World, at: PointU, rangeU: number, want: number): { beast: BeastState; hold: number } | null {
  let best: BeastState | null = null;
  let bestW = 0;
  let bestD = 0;
  let bestHold = 0;
  for (const beast of world.beasts.list) {
    if (!beast.alive || !within(beast.x, beast.z, at.x, at.z, rangeU)) continue;
    if (beast.hardUntil > world.tick || isBroken(world, beast) || damageImmune(world, beast)) continue;
    const hold = holdAllowance(world, beast, want);
    if (hold <= 0) continue;
    const w = speciesW100(beast.species, beast.elite);
    const d = heartDistance(world, beast);
    if (best === null || w > bestW || (w === bestW && (d < bestD || (d === bestD && beast.serial < best.serial)))) {
      best = beast;
      bestW = w;
      bestD = d;
      bestHold = hold;
    }
  }
  return best === null ? null : { beast: best, hold: bestHold };
}

function stepSnare(world: World, slot: MechSlotState, def: MechanismDef, at: PointU): void {
  const effect = def.effect;
  if (effect.kind !== "snare" || world.tick < slot.nextFire) return;
  const want = mulDiv(msToTicks(effect.holdMs), levelPm(slot.level), 1000);
  const pick = snareTarget(world, at, mmToU(effect.rangeMm), want);
  if (pick === null) return;
  slot.nextFire = world.tick + msToTicks(effect.everyMs);
  // Held from the next tick on (the beast's own step counts it); a flyer is pulled down there.
  pick.beast.hardUntil = world.tick + 1 + pick.hold;
  postureHit(world, pick.beast, effect.posture > 0 ? effect.posture : POSTURE.phongAn, "mechanism");
  trigger(world, slot, at);
}

export function stepMechanisms(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  for (const slot of world.mechanisms.slots) {
    if (slot.mech === null) continue;
    const def = MECHANISM_DEFS[slot.mech];
    const at = slotPoint(world, slot.index);
    switch (def.effect.kind) {
      case "strip":
        stepStrip(world, slot, def, at);
        break;
      case "chain":
        stepChain(world, slot, def, at);
        break;
      case "snare":
        stepSnare(world, slot, def, at);
        break;
    }
  }
}
