/**
 * Tinh anh (canon §10.3, data/elites.ts): one trait, W × 1.6 (+ Thiết Bì's
 * 2 W), Thế 40, one Ấn when revealed (every elite on the field at M0a: no
 * fog). Ấn requests (≤ 2 live a person, canon §6.2, §10.3): the Vương first,
 * then generals and elites nearest the heart (ties: smaller beastId), only
 * while the seat's Bàn Quyết is live; Lane 3's `dealSeal` decides whether a
 * word fits the live-word cap and sets `beast.seal`. Hồi Nguyên heals 1.5 % a
 * second after 3 s without a hit. stepBeasts calls `stepElites` (the world
 * step has no elite slot).
 * Owner: Lane 5.
 */
import { ELITE_TRAITS } from "../content/data/elites";
import { BOSS, ELITES, LETTERS, PRESETS, SIM, beastHp } from "../content/rules";
import type { BeastState, EliteTraitId, SpeciesId, World } from "../content/types";
import { heartDistance } from "./field";
import { msToTicks } from "./fixed";
import { createPosture, postureLocked } from "./posture";
import { speciesDef, speciesW100 } from "./targeting";
import { dealSeal, isBanQuyetLive } from "./words";

/** Max HP of a species at this world's realm and preset (canon §7.1, D38); swarm and small ignore the preset factor (§13.4). */
export function maxHpOf(world: World, species: SpeciesId, elite: EliteTraitId | null): number {
  const def = speciesDef(species);
  const presetPm = def.tier === "swarm" || def.tier === "small" ? 1000 : PRESETS[world.preset].hpPm;
  const hp = beastHp(speciesW100(species, elite), world.realm, presetPm);
  if (def.tier !== "boss") return hp;
  // HP by seats × 1.0 / 1.7 / 2.4 (Thất Tinh × 5.0), locked at match start (canon §10.5).
  const seatPm = world.seats.length >= 7 ? BOSS.sevenHpPm : (BOSS.seatHpPm[world.seats.length - 1] ?? BOSS.seatHpPm[0]!);
  return Math.round((hp * seatPm) / 1000);
}

/** Makes `beast` a tinh anh: W × 1.6 + extra, armour + step, Thế 40. Speed and regen are read each tick. */
export function applyElite(world: World, beast: BeastState, trait: EliteTraitId): void {
  const def = speciesDef(beast.species);
  const traitDef = ELITE_TRAITS[trait];
  beast.elite = trait;
  beast.hpMax = maxHpOf(world, beast.species, trait);
  beast.hp = beast.hpMax;
  const armour = def.armour + traitDef.armourStep;
  beast.armour = (armour > 3 ? 3 : armour) as BeastState["armour"];
  beast.posture = createPosture(ELITES.posture);
}

/** Beasts that carry an Ấn: tinh anh, thú tướng, Thú Vương (canon §6.3). */
export function sealable(beast: BeastState): boolean {
  return beast.alive && (beast.elite !== null || beast.general || beast.boss);
}

function healHoiNguyen(world: World): void {
  const tick = world.tick;
  for (const beast of world.beasts.list) {
    if (!beast.alive || beast.elite === null) continue;
    const trait = ELITE_TRAITS[beast.elite];
    if (trait.regenPmPerS <= 0 || beast.hp >= beast.hpMax) continue;
    const quiet = tick - Math.max(beast.lastHitTick, beast.bornAt);
    const after = msToTicks(trait.regenAfterMs);
    // One heal per full second after the quiet time.
    if (quiet <= after || (quiet - after) % SIM.tickHz !== 0) continue;
    beast.hp = Math.min(beast.hpMax, beast.hp + Math.round((beast.hpMax * trait.regenPmPerS) / 1000));
  }
}

/** The next beast an Ấn should go to, or null. */
function nextSealTarget(world: World): BeastState | null {
  let best: BeastState | null = null;
  let bestDist = 0;
  for (const beast of world.beasts.list) {
    if (!sealable(beast) || beast.seal >= 0) continue;
    // Not while its Thế cannot drop: broken, the 15 s after, or the Vương's roar (its old Ấn was just cancelled, canon §10.5).
    if (postureLocked(world, beast)) continue;
    const d = beast.boss ? -1 : heartDistance(world, beast);
    if (best === null || d < bestDist || (d === bestDist && beast.serial < best.serial)) {
      best = beast;
      bestDist = d;
    }
  }
  return best;
}

function requestSeals(world: World): void {
  let live = 0;
  for (const beast of world.beasts.list) if (beast.alive && beast.seal >= 0) live += 1;
  // M0a is solo: `beast.seal` holds one Ấn, so the count is the seat's (M1 needs one Ấn per seat per beast).
  for (const seat of world.seats) {
    if (live >= LETTERS.sealsPerSeat) return;
    if (seat.downUntil > world.tick || !isBanQuyetLive(world, seat.seat)) continue;
    const target = nextSealTarget(world);
    if (target === null) return;
    dealSeal(world, seat.seat, { slot: target.slot, serial: target.serial });
    if (target.seal >= 0) live += 1;
  }
}

/** Hồi Nguyên regen and Ấn requests. */
export function stepElites(world: World): void {
  healHoiNguyen(world);
  requestSeals(world);
}
