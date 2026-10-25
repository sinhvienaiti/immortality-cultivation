/**
 * Kiếm skills (canon §12.1, data/school-kiem.ts). `resolveCast` (Lane 3's
 * cast.ts asks it) looks for a target and, only when there is one, schedules
 * the hits and sets the slot's `cooldownUntil`; with no target it changes
 * nothing and answers false (the Cast stays held 3 s and asks every tick).
 *
 * - Ô 1: one word's damage computed once (P_ref × M_q × …), split over 3 swords
 *   (rest on the last, D38); swords land +6/+36/+66, a band follows the one
 *   before it, ≤ 2 bands unfinished (more: held). Each sword picks its target
 *   when it flies (6 ticks before it lands): the soft target, else the beast
 *   nearest the heart within 12 m of the Cast's origin; it pierces 1 small
 *   beast at 50 %. Kiếm Tâm: a Chớp adds a sword of 1/3 of the word (once per 3 s).
 * - Ô 2: a 14 × 1.2 m line towards the soft target or the beast nearest the
 *   heart in 14 m, +12: 2.5 W on the first beast, −15 % each next (floor 40 %), Thế −20.
 * - Ô 3: Hộ thân makes a `ward` (wards.ts); thân pháp is `local`'s (dash.ts).
 * - Ô 4: a zone r 3 m at the cursor (on the field) or the densest cluster in
 *   12 m, opens +12, a 0.15 W beat every 30 ticks for 5 s, slow 20 %, ≤ 4 W a cast.
 * - Ô 5: needs a full Chân Nguyên and spends it; 3 volleys +30/+75/+120 in
 *   r 6 m: 10 W shared evenly, ≤ 2.5 W a beast, cluster cap 60 %, Thế −40.
 * - Ấn: its Thế is cast.ts's; Tẩy relights a captured node (formation.ts).
 * Ground skills use the last key's `aim` when it is on the field, else the
 * densest cluster in range (targeting.ts, canon §23.3 ties). Tích Kiếm: −8 % in
 * wave 1, +4 % a wave held, ≤ +24 % (combat.ts bucket).
 * Owner: Lane 4.
 */
import { TAM_PHAP, kiemSkill } from "../content/data/school-kiem";
import { CHAN_NGUYEN, SIM } from "../content/rules";
import type { BeastState, Cast, Grade, PendingStrike, PointU, SeatSkills, SeatState, SkillDef, SkillZone, SkillsState, SlotId, World, WorldInit } from "../content/types";
import { spendChanNguyen } from "./chan-nguyen";
import { addSlow, areaVictims, beastByRef, createAreaHit, damageBeast, landTargeted, queueStrike, splitWord, wHpOf, wordDamage } from "./combat";
import { emit } from "./events";
import { isqrt, mmToU, msToTicks, mulDiv, mulDivSym, uToM, within } from "./fixed";
import { cleanseNode } from "./formation";
import { postureHit } from "./posture";
import { densestPoint, nearestToHeart, speciesDef } from "./targeting";
import { createWard } from "./wards";
import { dealSlotWord } from "./words";

// Lane 4 fields on its own state (reported for Lane 2 to fold into types.ts).
declare module "../content/types" {
  interface SeatSkills {
    /** Tick the seat's last ô 1 band lands its last sword; the next band follows it (canon §12.1). */
    bandEnd: number;
    /** Đánh nền may come again from this tick (the school's rate, combat.ts applyAuto). */
    autoReadyAt: number;
  }
  interface PendingStrike {
    /** auto (đánh nền), sword (ô 1), line (ô 2), zone (ô 4 opens), volley (ô 5). */
    readonly kind: "auto" | "sword" | "line" | "zone" | "volley";
    /** Swords pick their target at this tick (6 ticks before they land); the rest were aimed when queued. */
    readonly launchTick: number;
    /** Where it goes: the target's point at launch (a redirect starts there), the line's end, the zone or volley centre. */
    to: PointU;
    /** The last strike of an ô 1 band: the seat's band count drops when it is done. */
    readonly bandLast: boolean;
    /** Sword or volley index in its Cast. */
    readonly part: number;
  }
  interface SkillZone {
    /** One beat's P on each beast (0.15 W × g(K)), before M_q, and the Cast's grade. */
    readonly beatHp: number;
    readonly grade: Grade;
  }
}

export function createSkillsState(init: WorldInit): SkillsState {
  const seats: SeatSkills[] = [];
  for (let seat = 0; seat < Math.max(1, init.seats); seat += 1) {
    seats.push({ cooldownUntil: [0, 0, 0, 0, 0, 0], bands: 0, kiemTamReadyAt: 0, tichKiemPm: 0, bandEnd: -1, autoReadyAt: 0 });
  }
  return { seats, strikes: [], zones: [], nextId: 1 };
}

// ── Aiming ─────────────────────────────────────────────────────────────────

const pointOf = (beast: BeastState): PointU => ({ x: beast.x, z: beast.z });

/** The seat's soft target when it lives and stands within `rangeU` of `from`, else the beast nearest the heart there. */
export function skillTarget(world: World, seat: number, from: PointU, rangeU: number): BeastState | null {
  const soft = world.seats[seat]?.softTarget ?? null;
  if (soft !== null) {
    const beast = beastByRef(world, soft);
    if (beast !== null && within(beast.x, beast.z, from.x, from.z, rangeU)) return beast;
  }
  return nearestToHeart(world, from, rangeU);
}

/** `point` lies on the field (the cursor of a ground skill, canon §5.1). */
export function onField(world: World, point: PointU): boolean {
  const field = world.stage.field;
  return point.x >= mmToU(field.minXMm) && point.x <= mmToU(field.maxXMm) && point.z >= mmToU(field.minZMm) && point.z <= mmToU(field.maxZMm);
}

/** A ground skill's point: the key's `aim` on the field, else the densest cluster within `rangeU` (canon §23.3), else null. */
export function groundPoint(world: World, aim: PointU | null, origin: PointU, rangeU: number, radiusU: number): PointU | null {
  if (aim !== null && onField(world, aim)) return { x: aim.x, z: aim.z };
  return densestPoint(world, origin, rangeU, radiusU);
}

// ── Resolving a Cast ───────────────────────────────────────────────────────

const strike = (fields: Omit<PendingStrike, "id">): Omit<PendingStrike, "id"> => fields;

function resolveVolley(world: World, cast: Cast, seat: SeatState, skills: SeatSkills, def: SkillDef): boolean {
  const effect = def.effect;
  if (effect.kind !== "volley") return false;
  // ≤ 2 bands unfinished: the next word waits (held) until one is done.
  if (skills.bands >= effect.maxBands) return false;
  const target = skillTarget(world, cast.seat, cast.origin, mmToU(effect.rangeMm));
  if (target === null) return false;
  const total = wordDamage(world, cast.seat, cast.quality, speciesDef(target.species).element);
  const shares = splitWord(total, effect.swords);
  const last = effect.hitTicks.length - 1;
  const base = skills.bandEnd > world.tick ? skills.bandEnd : world.tick;
  const flight = effect.hitTicks[0]!;
  let extra = 0;
  const tamPhap = TAM_PHAP[seat.loadout.tamPhap];
  if (seat.loadout.tamPhap === "kiem-tam" && cast.quality === "flash" && world.tick >= skills.kiemTamReadyAt) {
    extra = mulDiv(total, 1, tamPhap.extraShareDiv ?? 3);
    skills.kiemTamReadyAt = world.tick + msToTicks(tamPhap.extraEveryMs ?? 0);
  }
  for (let k = 0; k < shares.length; k += 1) {
    const hit = base + effect.hitTicks[Math.min(k, last)]!;
    queueStrike(world, strike({
      tick: hit, seat: cast.seat, skill: def.id, source: "slot1", actionId: cast.actionId, target: null, at: { x: cast.origin.x, z: cast.origin.z },
      amount: shares[k]!, grade: cast.quality, posture: 0, kind: "sword", launchTick: hit - flight, to: pointOf(target), bandLast: extra === 0 && k === shares.length - 1, part: k,
    }));
  }
  if (extra > 0) {
    // Kiếm Tâm's sword flies with the band's last one (đề xuất: canon gives it no tick).
    const hit = base + effect.hitTicks[last]!;
    queueStrike(world, strike({
      tick: hit, seat: cast.seat, skill: def.id, source: "slot1", actionId: cast.actionId, target: null, at: { x: cast.origin.x, z: cast.origin.z },
      amount: extra, grade: cast.quality, posture: 0, kind: "sword", launchTick: hit - flight, to: pointOf(target), bandLast: true, part: shares.length,
    }));
  }
  skills.bands += 1;
  skills.bandEnd = base + effect.hitTicks[last]!;
  return true;
}

function resolveLine(world: World, cast: Cast, def: SkillDef): boolean {
  const effect = def.effect;
  if (effect.kind !== "line") return false;
  const lengthU = mmToU(effect.lengthMm);
  const target = skillTarget(world, cast.seat, cast.origin, lengthU);
  if (target === null) return false;
  let dx = target.x - cast.origin.x;
  let dz = target.z - cast.origin.z;
  // On top of the target: the line goes north, towards the gates.
  if (dx === 0 && dz === 0) dz = -1;
  const d = isqrt(dx * dx + dz * dz) || 1;
  const to = { x: cast.origin.x + mulDivSym(dx, lengthU, d), z: cast.origin.z + mulDivSym(dz, lengthU, d) };
  queueStrike(world, strike({
    tick: world.tick + effect.hitTick, seat: cast.seat, skill: def.id, source: "slot2", actionId: cast.actionId, target: null, at: { x: cast.origin.x, z: cast.origin.z },
    amount: wHpOf(world, effect.w100), grade: cast.quality, posture: effect.posture, kind: "line", launchTick: world.tick, to, bandLast: false, part: 0,
  }));
  emit(world, { type: "skill-fx", seat: cast.seat, skill: def.id, stage: "line", x: uToM(cast.origin.x), z: uToM(cast.origin.z), toX: uToM(to.x), toZ: uToM(to.z), count: 1 });
  return true;
}

function resolveZone(world: World, cast: Cast, def: SkillDef): boolean {
  const effect = def.effect;
  if (effect.kind !== "zone") return false;
  const point = groundPoint(world, cast.aim, cast.origin, mmToU(effect.rangeMm), mmToU(effect.radiusMm));
  if (point === null) return false;
  // One beat: W/s × beat length (0.3 W/s × 30 ticks = 0.15 W).
  const beatW100 = mulDiv(effect.w100PerS, effect.beatTicks, SIM.tickHz);
  queueStrike(world, strike({
    tick: world.tick + effect.openTick, seat: cast.seat, skill: def.id, source: "slot4", actionId: cast.actionId, target: null, at: { x: cast.origin.x, z: cast.origin.z },
    amount: wHpOf(world, beatW100), grade: cast.quality, posture: 0, kind: "zone", launchTick: world.tick, to: point, bandLast: false, part: 0,
  }));
  return true;
}

function resolveUltimate(world: World, cast: Cast, seat: SeatState, def: SkillDef): boolean {
  const effect = def.effect;
  if (effect.kind !== "ultimate") return false;
  if (seat.chanNguyenPm < CHAN_NGUYEN.full * 1000) return false;
  const point = groundPoint(world, cast.aim, cast.origin, mmToU(effect.rangeMm), mmToU(effect.radiusMm));
  if (point === null) return false;
  spendChanNguyen(world, cast.seat);
  const volleys = effect.hitTicks.length;
  const pool = splitWord(wHpOf(world, effect.totalW100), volleys);
  const posture = splitWord(effect.posture, volleys);
  for (let k = 0; k < volleys; k += 1) {
    queueStrike(world, strike({
      tick: world.tick + effect.hitTicks[k]!, seat: cast.seat, skill: def.id, source: "slot5", actionId: cast.actionId, target: null, at: { x: cast.origin.x, z: cast.origin.z },
      amount: pool[k]!, grade: cast.quality, posture: posture[k]!, kind: "volley", launchTick: world.tick, to: point, bandLast: false, part: k,
    }));
  }
  return true;
}

/**
 * Finds the Cast's target and schedules its hits; false when there is no valid
 * target (the Cast stays held). Never changes the world when it answers false.
 * On resolve: the slot's cooldown starts (`cooldownUntil`, read by words.ts).
 */
export function resolveCast(world: World, cast: Cast): boolean {
  const seat = world.seats[cast.seat];
  const skills = world.skills.seats[cast.seat];
  if (seat === undefined || skills === undefined || seat.downUntil > world.tick) return false;
  if (world.phase === "victory" || world.phase === "defeat") return false;
  // An Ấn's Thế (−35 / √seats) is cast.ts's; it needs its beast alive.
  if (cast.slot === "seal") return cast.target !== null && beastByRef(world, cast.target) !== null;
  if (cast.slot === "cleanse") return cast.node !== null && cleanseNode(world, cast.node);
  const slot: SlotId = cast.slot;
  const def = kiemSkill(slot, seat.loadout.guard);
  let done = false;
  switch (slot) {
    case 1:
      done = resolveVolley(world, cast, seat, skills, def);
      break;
    case 2:
      done = resolveLine(world, cast, def);
      break;
    case 3:
      // Hộ thân: a ward at the Cast's origin; thân pháp: `local` glides on its own `cast resolved`.
      if (def.effect.kind === "ward") createWard(world, cast.seat, cast.origin);
      done = true;
      break;
    case 4:
      done = resolveZone(world, cast, def);
      break;
    case 5:
      done = resolveUltimate(world, cast, seat, def);
      break;
  }
  if (done) skills.cooldownUntil[slot] = world.tick + msToTicks(def.cooldownMs);
  return done;
}

// ── Landing ────────────────────────────────────────────────────────────────

const isSmall = (beast: BeastState): boolean => beast.tier === "swarm" || beast.tier === "small";

/** An ô 1 sword's pierce: the nearest live small beast within the reach of the one it hit (ties: smaller beastId). */
function pierceTarget(world: World, hit: BeastState, reachU: number): BeastState | null {
  let best: BeastState | null = null;
  let bestD = 0;
  for (const beast of world.beasts.list) {
    if (!beast.alive || beast === hit || !isSmall(beast) || !within(beast.x, beast.z, hit.x, hit.z, reachU)) continue;
    const dx = beast.x - hit.x;
    const dz = beast.z - hit.z;
    const d = dx * dx + dz * dz;
    if (best === null || d < bestD || (d === bestD && beast.serial < best.serial)) {
      best = beast;
      bestD = d;
    }
  }
  return best;
}

function bandDone(world: World, strike: PendingStrike): void {
  if (!strike.bandLast) return;
  const skills = world.skills.seats[strike.seat];
  if (skills !== undefined && skills.bands > 0) skills.bands -= 1;
}

/** A sword picks its target as it flies; none in range: the sword is lost. Returns false when lost. */
function launchSword(world: World, strike: PendingStrike): boolean {
  const def = kiemSkill(1);
  if (def.effect.kind !== "volley") return false;
  const target = skillTarget(world, strike.seat, strike.at, mmToU(def.effect.rangeMm));
  if (target === null) return false;
  strike.target = { slot: target.slot, serial: target.serial };
  strike.to = pointOf(target);
  emit(world, { type: "skill-fx", seat: strike.seat, skill: strike.skill, stage: "volley", x: uToM(strike.at.x), z: uToM(strike.at.z), toX: uToM(target.x), toZ: uToM(target.z), count: 1 });
  return true;
}

function landSword(world: World, strike: PendingStrike): void {
  const hit = landTargeted(world, strike, "typed", true);
  const def = kiemSkill(1);
  if (hit === null || def.effect.kind !== "volley" || def.effect.pierceSmall <= 0) return;
  const pierce = pierceTarget(world, hit, mmToU(def.pierceReachMm ?? 0));
  if (pierce !== null) damageBeast(world, pierce, strike.amount, "typed", { seat: strike.seat, source: strike.source, grade: strike.grade, scaled: true, factorPm: def.effect.piercePct * 10 });
}

/** Beasts inside the line a→b of half width `halfU`, along the line's order (ties: smaller beastId). */
function lineVictims(world: World, a: PointU, b: PointU, halfU: number): BeastState[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = isqrt(dx * dx + dz * dz);
  const out: { beast: BeastState; along: number }[] = [];
  if (length === 0) return [];
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    const vx = beast.x - a.x;
    const vz = beast.z - a.z;
    // along = |v| |d| cos, across = |v| |d| sin; inside: 0 ≤ along ≤ |d|², across ≤ half × |d|.
    const along = vx * dx + vz * dz;
    if (along < 0 || along > length * length) continue;
    if (Math.abs(vx * dz - vz * dx) > halfU * length) continue;
    out.push({ beast, along });
  }
  out.sort((p, q) => p.along - q.along || p.beast.serial - q.beast.serial);
  return out.map((item) => item.beast);
}

function landLine(world: World, strike: PendingStrike): void {
  const def = kiemSkill(2);
  if (def.effect.kind !== "line") return;
  const effect = def.effect;
  const victims = lineVictims(world, strike.at, strike.to, mmToU(effect.widthMm) / 2);
  const area = createAreaHit();
  for (let i = 0; i < victims.length; i += 1) {
    const beast = victims[i]!;
    // First 100 %, −15 % each next, floor 40 %.
    const factor = 1000 - effect.falloffPct * 10 * i;
    const factorPm = factor > effect.floorPct * 10 ? factor : effect.floorPct * 10;
    damageBeast(world, beast, strike.amount, "typed", { seat: strike.seat, source: strike.source, grade: strike.grade, factorPm, area });
    if (strike.posture > 0) postureHit(world, beast, strike.posture, strike.source);
  }
}

function openZone(world: World, strike: PendingStrike): void {
  const def = kiemSkill(4);
  if (def.effect.kind !== "zone") return;
  const effect = def.effect;
  const zone: SkillZone = {
    id: strike.id,
    seat: strike.seat,
    skill: def.id,
    at: strike.to,
    radiusU: mmToU(effect.radiusMm),
    untilTick: world.tick + msToTicks(effect.durationMs),
    nextBeat: world.tick,
    dealt: 0,
    cap: wHpOf(world, effect.capW100),
    beatHp: strike.amount,
    grade: strike.grade ?? "ok",
  };
  world.skills.zones.push(zone);
  emit(world, { type: "skill-fx", seat: strike.seat, skill: def.id, stage: "zone-open", x: uToM(strike.at.x), z: uToM(strike.at.z), toX: uToM(zone.at.x), toZ: uToM(zone.at.z), count: 0 });
}

function landVolley(world: World, strike: PendingStrike): void {
  const def = kiemSkill(5);
  if (def.effect.kind !== "ultimate") return;
  const effect = def.effect;
  const victims = areaVictims(world, strike.to.x, strike.to.z, mmToU(effect.radiusMm));
  emit(world, { type: "skill-fx", seat: strike.seat, skill: def.id, stage: "ultimate", x: uToM(strike.at.x), z: uToM(strike.at.z), toX: uToM(strike.to.x), toZ: uToM(strike.to.z), count: victims.length });
  if (victims.length === 0) return;
  // This volley's share of P, evenly; ≤ its share of the 2.5 W a beast (the cap is on P, before M_q).
  const capShares = splitWord(wHpOf(world, effect.perBeastCapW100), effect.hitTicks.length);
  const cap = capShares[strike.part] ?? 0;
  const each = mulDiv(strike.amount, 1, victims.length);
  const p = each < cap ? each : cap;
  const area = createAreaHit();
  for (const beast of victims) {
    damageBeast(world, beast, p, "typed", { seat: strike.seat, source: strike.source, grade: strike.grade, area });
    if (strike.posture > 0) postureHit(world, beast, strike.posture, strike.source);
  }
}

function stepZones(world: World): void {
  const zones = world.skills.zones;
  const def = kiemSkill(4);
  if (def.effect.kind !== "zone") return;
  const effect = def.effect;
  let keep = 0;
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index]!;
    if (world.tick >= zone.untilTick) {
      emit(world, { type: "skill-fx", seat: zone.seat, skill: zone.skill, stage: "zone-close", x: uToM(zone.at.x), z: uToM(zone.at.z), toX: uToM(zone.at.x), toZ: uToM(zone.at.z), count: 0 });
      continue;
    }
    // Lạc Kiếm Trận slows every beast inside (canon §7.2: 20 %, its own source).
    for (const beast of world.beasts.list) if (beast.alive && within(beast.x, beast.z, zone.at.x, zone.at.z, zone.radiusU)) addSlow(world, beast, def.id, effect.slowPct);
    if (world.tick >= zone.nextBeat) {
      zone.nextBeat += effect.beatTicks;
      const area = createAreaHit();
      for (const beast of areaVictims(world, zone.at.x, zone.at.z, zone.radiusU)) {
        const left = zone.cap - zone.dealt;
        if (left <= 0) break;
        zone.dealt += damageBeast(world, beast, zone.beatHp, "typed", { seat: zone.seat, source: "slot4", grade: zone.grade, area, limit: left });
      }
    }
    zones[keep] = zone;
    keep += 1;
  }
  zones.length = keep;
}

/** Tích Kiếm: −8 % in wave 1, +4 % for each wave held, ≤ +24 % (canon §12.1), ‰. */
export function tichKiemPmFor(world: World): number {
  const def = TAM_PHAP["tich-kiem"];
  const pct = (def.firstWavePct ?? 0) + (def.perWavePct ?? 0) * world.waves.endedThrough;
  const cap = def.capPct ?? 0;
  return (pct > cap ? cap : pct) * 10;
}

/** Lands strikes due this tick (swords pick their target first), beats zones, keeps Tích Kiếm, asks ô 5 for its word. */
export function stepSkills(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  const tich = tichKiemPmFor(world);
  for (let seat = 0; seat < world.skills.seats.length; seat += 1) {
    const skills = world.skills.seats[seat]!;
    skills.tichKiemPm = world.seats[seat]?.loadout.tamPhap === "tich-kiem" ? tich : 0;
  }
  const strikes = world.skills.strikes;
  let keep = 0;
  for (let index = 0; index < strikes.length; index += 1) {
    const item = strikes[index]!;
    if (item.kind === "auto") {
      strikes[keep] = item;
      keep += 1;
      continue;
    }
    if (item.kind === "sword" && item.target === null && world.tick >= item.launchTick && !launchSword(world, item)) {
      bandDone(world, item);
      continue;
    }
    if (item.tick > world.tick) {
      strikes[keep] = item;
      keep += 1;
      continue;
    }
    if (item.kind === "sword") {
      landSword(world, item);
      bandDone(world, item);
    } else if (item.kind === "line") landLine(world, item);
    else if (item.kind === "zone") openZone(world, item);
    else landVolley(world, item);
  }
  strikes.length = keep;
  stepZones(world);
  // A full bar asks ô 5 for its word the same tick (canon §6.6; words.ts would on the next).
  for (const seat of world.seats) if (seat.chanNguyenPm >= CHAN_NGUYEN.full * 1000) dealSlotWord(world, seat.seat, 5);
}
