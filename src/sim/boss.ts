// Source: games/dragon-hold/src/sim/boss.ts @06cd4e6 (adapted: shape only — per-general skill clock, a wind-up the general stands still for, resolve at its tick; Tru Đàn and the three-phase Thú Vương written for canon §10.4–10.5)
/**
 * Lang Đầu Đàn and Thiết Bối Lang Vương (canon §10.4, §10.5).
 *
 * Tru Đàn: ring 1.5 s (the general stands still), 3 Phong Lang at the nearest
 * ground gate; at most once every 20 s, 2 times a wave and the wave's
 * `summonMaxW100`; only when `liveRoom` fits the whole call, else the turn is
 * skipped (no queue). The
 * Vương walks in from gate A (waves.ts spawns it; this file adopts it): P1
 * Vồ Xé (6 m cone at the node, 2.0 s) and Gọi Đàn every 30 s; P2 Thiết Bối Xung (line to the heart,
 * charge T) and no Gọi Đàn; P3 Cuồng +25 %, Gọi Đàn every 18 s, Thiết Bối Xung
 * 15 s after the last one ended. Gọi Đàn (1 cluster + 2 Phong Lang = 4.31 W)
 * stops at 30 % W_Vương and needs room for the whole call. Phase change: roar
 * 2.5 s (no damage), the old Ấn is cancelled, Thế full again, its telegraphs
 * cancelled. Thiết Bối Xung answers: (a) phá thế cancels it (posture.ts);
 * (b) an intact Trận Trụ on the line stops it: stun 2 s, the pillar takes a
 * ram (`hitPillar`); (c) a `ward` ring crossing the line at the strike tick:
 * Trận Lực loses half (`wardCrosses`, D34); (d) Phong Ấn Võng's −15 Thế
 * (mechanisms.ts) helps (a). Unsolved: Trận Lực −8 %, players in the line
 * pushed 3 m (`local`). stepBoss ends with the telegraph sweep.
 * Owner: Lane 5.
 */
// WANT EVENT: boss-phase { beast, phase, roarUntilTick } (HUD and view read world.boss and the beast's "roar" mode until then).
import { BEASTS } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { BOSS } from "../content/rules";
import type { ActiveTelegraph, BeastId, BeastState, BossDef, BossState, GateId, GeneralDef, PointU, WaveGroupDef, World, WorldInit } from "../content/types";
import { mmToU, msToTicks, within } from "./fixed";
import { damageFormation, hitPillar, pillarOnSegment } from "./formation";
import { refillPosture } from "./posture";
import { beastDamage, controlled, heartEdgeToward, lineImpact, wardHalves } from "./pressure";
import { spawnGroup, liveRoom } from "./spawn";
import { aimNode, chooseTarget, speciesDef, straightDistance } from "./targeting";
import { cancelSourceTelegraphs, cancelTelegraph, dueTelegraphs, findTelegraph, stepTelegraphs, strikeTelegraph, telegraph, telegraphDef } from "./telegraph";
import { releaseWord } from "./words";
import { beastAt } from "./world";

// Lane 5 fields (reported for Lane 2 to fold into types.ts).
declare module "../content/types" {
  interface BossState {
    /** The Vương died (Lane 2's victory check may read it). */
    defeated?: boolean;
    /** Live Gọi Đàn and Thiết Bối Xung telegraph ids (−1: none). */
    summonTelegraph?: number;
    chargeTelegraph?: number;
    /** Tru Đàn W × 100 called in wave `waveSummonWave` (≤ its WaveDef.summonMaxW100). */
    waveSummonWave?: number;
    waveSummonW100?: number;
  }
}

export function createBossState(_init: WorldInit): BossState {
  return { beast: null, phase: 0, roarUntil: -1, nextSummon: -1, nextCharge: -1, summonedW100: 0, defeated: false, summonTelegraph: -1, chargeTelegraph: -1, waveSummonWave: 0, waveSummonW100: 0 };
}

const ref = (beast: BeastState) => ({ slot: beast.slot, serial: beast.serial });
const at = (beast: BeastState): PointU => ({ x: beast.x, z: beast.z });

/** The stage's Thú Vương def, or null. */
export function stageBoss(world: World): BossDef | null {
  return world.stage.boss === null ? null : (BOSSES[world.stage.boss] ?? null);
}

/** W × 100 of one Gọi Đàn (1 Thạch Thử cluster + 2 Phong Lang = 431). */
export function callW100(def: BossDef): number {
  return def.summon.reduce((sum, group) => sum + BEASTS[group.species].w100 * group.count, 0);
}

/** Gọi Đàn's cap: 30 % of W_Vương with the seat factor (canon §10.5; 1 920 solo). */
export function summonCapW100(world: World, def: BossDef): number {
  const seatPm = world.seats.length >= 7 ? BOSS.sevenHpPm : (BOSS.seatHpPm[world.seats.length - 1] ?? BOSS.seatHpPm[0]!);
  return Math.round((((def.w100 * seatPm) / 1000) * BOSS.summonCapPct) / 100);
}

/** The phase the Vương's HP calls for: P1 while HP > 60 %, P2 while > 30 %, then P3. */
export function phaseFor(beast: BeastState, def: BossDef): number {
  for (let index = 0; index < def.phases.length; index += 1) if (beast.hp * 100 > def.phases[index]!.untilHpPct * beast.hpMax) return index + 1;
  return def.phases.length;
}

/** The ground gate nearest `point` (summons come out of it, canon §10.4). */
export function nearestGate(world: World, point: PointU): GateId {
  let best: GateId = "A";
  let bestD = -1;
  for (const gate of world.stage.field.gates) {
    if (!gate.ground) continue;
    const d = straightDistance(point.x, point.z, mmToU(gate.at.xMm), mmToU(gate.at.zMm));
    if (bestD < 0 || d < bestD) {
      best = gate.id;
      bestD = d;
    }
  }
  return best;
}

/** A summoned group leaving `gate` now. */
const group = (gate: GateId, species: BeastId, count: number, cluster: boolean): WaveGroupDef => (cluster ? { atMs: 0, gate, species, count, cluster: true } : { atMs: 0, gate, species, count });

// ── Lang Đầu Đàn: Tru Đàn ───────────────────────────────────────────────────

function waveSummonLeft(world: World, wave: number): number {
  const max = world.stage.waves[wave - 1]?.summonMaxW100 ?? 0;
  const used = world.boss.waveSummonWave === wave ? (world.boss.waveSummonW100 ?? 0) : 0;
  return max - used;
}

function howlFits(world: World, general: BeastState, def: GeneralDef): boolean {
  const callW = BEASTS[def.howl.species].w100 * def.howl.count;
  return general.howls < def.howl.perWave && liveRoom(world) >= def.howl.count && waveSummonLeft(world, general.wave) >= callW;
}

function stepGenerals(world: World): void {
  for (const general of world.beasts.list) {
    if (!general.alive || !general.general || general.telegraph >= 0 || controlled(world, general) || world.tick < general.howlReadyAt) continue;
    const def = speciesDef(general.species) as GeneralDef;
    if (general.howls >= def.howl.perWave) continue;
    general.howlReadyAt = world.tick + msToTicks(def.howl.cooldownMs);
    // No room for the whole call: the turn is skipped (no queue).
    if (!howlFits(world, general, def)) continue;
    // It stands still for the ring (stepBeasts holds a beast with a live telegraph).
    general.telegraph = telegraph(world, telegraphDef(def.howl.telegraph), ref(general), at(general), at(general)).id;
    general.mode = "hold";
  }
}

function resolveHowl(world: World, t: ActiveTelegraph, general: BeastState): void {
  if (controlled(world, general)) return cancelTelegraph(world, t.id);
  const def = speciesDef(general.species) as GeneralDef;
  strikeTelegraph(world, t);
  if (!howlFits(world, general, def)) return;
  // Summons count 50 % ĐĐ (canon §14.2): initBeast reads `summoned`.
  const spawned = spawnGroup(world, group(nearestGate(world, at(general)), def.howl.species, def.howl.count, false), { wave: general.wave, summoned: true });
  if (spawned.length === 0) return;
  general.howls += 1;
  const callW = BEASTS[def.howl.species].w100 * def.howl.count;
  if (world.boss.waveSummonWave !== general.wave) {
    world.boss.waveSummonWave = general.wave;
    world.boss.waveSummonW100 = 0;
  }
  world.boss.waveSummonW100 = (world.boss.waveSummonW100 ?? 0) + callW;
}

// ── Thiết Bối Lang Vương ────────────────────────────────────────────────────

function callFits(world: World, def: BossDef): boolean {
  const count = def.summon.reduce((sum, g) => sum + g.count, 0);
  return liveRoom(world) >= count && world.boss.summonedW100 + callW100(def) <= summonCapW100(world, def);
}

/** The Vương on the field: waves.ts walks it in from gate A when the boss phase has room (wave 0). */
function liveVuong(world: World, def: BossDef): BeastState | null {
  return world.beasts.list.find((beast) => beast.alive && beast.boss && beast.species === def.id) ?? null;
}

function startRoar(world: World, beast: BeastState, def: BossDef, phase: number): void {
  const state = world.boss;
  state.phase = phase;
  state.roarUntil = world.tick + msToTicks(BOSS.roarMs);
  beast.mode = "roar";
  beast.modeUntil = state.roarUntil;
  beast.speedPm = 0;
  cancelSourceTelegraphs(world, beast);
  state.summonTelegraph = -1;
  state.chargeTelegraph = -1;
  if (beast.seal >= 0) {
    releaseWord(world, beast.seal, "phase");
    beast.seal = -1;
  }
  refillPosture(world, beast);
  beast.target = chooseTarget(world, beast);
  const row = def.phases[phase - 1]!;
  state.nextSummon = row.summonEveryMs === null ? -1 : state.roarUntil + msToTicks(row.summonEveryMs);
  state.nextCharge = row.chargeEveryMs === null ? -1 : state.roarUntil;
  beast.attackAt = state.roarUntil;
}

function resolveGoiDan(world: World, t: ActiveTelegraph, beast: BeastState, def: BossDef): void {
  world.boss.summonTelegraph = -1;
  strikeTelegraph(world, t);
  if (!callFits(world, def)) return;
  const gate = nearestGate(world, at(beast));
  for (const call of def.summon) {
    const spawned = spawnGroup(world, group(gate, call.species, call.count, call.cluster), { wave: 0, summoned: true });
    // ΣĐĐ excludes the Vương, so its calls pay nothing either (canon §14.2).
    for (const called of spawned) called.threatW100 = 0;
  }
  world.boss.summonedW100 += callW100(def);
}

/** Thiết Bối Xung at its strike tick: (b) pillar, (c) ward crossing, or the full hit. */
function resolveCharge(world: World, t: ActiveTelegraph, beast: BeastState, def: BossDef): void {
  const state = world.boss;
  state.chargeTelegraph = -1;
  const row = def.phases[state.phase - 1];
  state.nextCharge = row?.chargeEveryMs == null ? -1 : world.tick + msToTicks(row.chargeEveryMs);
  const strike = telegraphDef(t.def).strike;
  const pillar = pillarOnSegment(world, t.from, t.to);
  if (pillar !== null && !pillar.cracked) {
    const impact = lineImpact(t.from, t.to, pillar.at, pillar.radiusU);
    strikeTelegraph(world, t, impact);
    hitPillar(world, pillar);
    beast.x = impact.x;
    beast.z = impact.z;
    beast.cell = -1;
    // Stunned 2 s: not a break (canon §10.5 (b)).
    beast.hardUntil = Math.max(beast.hardUntil, world.tick + msToTicks(BOSS.pillarStunMs));
    beast.mode = "stunned";
    return;
  }
  strikeTelegraph(world, t);
  let amount = beastDamage(world, Math.round((world.formation.heartMax * strike.formationPm) / 1000));
  if (wardHalves(world, t.from, t.to)) amount = Math.round(amount / 2);
  if (amount > 0) damageFormation(world, amount, "thiet-boi-xung");
  beast.x = t.to.x;
  beast.z = t.to.z;
  beast.cell = -1;
}

function stepVuong(world: World): void {
  const def = stageBoss(world);
  const act = def?.bossAct;
  const state = world.boss;
  if (def === null || act === undefined || state.defeated) return;
  const tick = world.tick;
  if (state.phase === 0) {
    // Not on the field yet (the live cap may hold it at gate A for a while).
    const vuong = liveVuong(world, def);
    if (vuong === null) return;
    state.beast = ref(vuong);
    state.phase = 1;
    state.nextSummon = tick + msToTicks(def.phases[0]!.summonEveryMs ?? 0);
    vuong.attackAt = tick;
    vuong.target = chooseTarget(world, vuong);
    return;
  }
  const beast = state.beast === null ? null : beastAt(world, state.beast);
  if (beast === null) {
    state.defeated = true;
    return;
  }
  if (beast.mode === "roar") {
    if (tick < state.roarUntil) return;
    beast.mode = "walk";
    beast.modeUntil = -1;
  }
  const want = phaseFor(beast, def);
  if (want > state.phase) return startRoar(world, beast, def, state.phase + 1);
  const row = def.phases[state.phase - 1]!;
  if ((state.summonTelegraph ?? -1) >= 0 && findTelegraph(world, state.summonTelegraph ?? -1) === null) state.summonTelegraph = -1;
  if ((state.chargeTelegraph ?? -1) >= 0 && findTelegraph(world, state.chargeTelegraph ?? -1) === null) {
    // Cancelled (phá thế): the next one counts from now (canon §10.5 "tính từ lúc cú trước xong").
    state.chargeTelegraph = -1;
    state.nextCharge = row.chargeEveryMs === null ? -1 : tick + msToTicks(row.chargeEveryMs);
  }
  if (controlled(world, beast)) return;
  if (row.summonEveryMs !== null && (state.summonTelegraph ?? -1) < 0 && tick >= state.nextSummon) {
    state.nextSummon = tick + msToTicks(row.summonEveryMs);
    // Not enough room or over 30 % W_Vương: the turn is skipped (no queue).
    if (callFits(world, def)) state.summonTelegraph = telegraph(world, telegraphDef(act.summonCall), ref(beast), at(beast), at(beast)).id;
  }
  if (beast.telegraph >= 0) return;
  if (row.attacks.includes(act.voXe) && tick >= beast.attackAt) {
    const node = aimNode(world);
    const point = node === null ? { x: 0, z: 0 } : node.at;
    if (within(beast.x, beast.z, point.x, point.z, mmToU(telegraphDef(act.voXe).sizeMm.reach))) {
      beast.telegraph = telegraph(world, telegraphDef(act.voXe), ref(beast), at(beast), point).id;
      beast.attackAt = tick + msToTicks(act.voXeEveryMs);
      return;
    }
  }
  if (row.chargeEveryMs !== null && tick >= state.nextCharge && state.nextCharge >= 0 && beast.mode === "hold") {
    const line = telegraph(world, telegraphDef(act.charge), ref(beast), at(beast), heartEdgeToward(at(beast)));
    beast.telegraph = line.id;
    state.chargeTelegraph = line.id;
    beast.mode = "ram";
  }
}

function resolveDue(world: World): void {
  const def = stageBoss(world);
  for (const t of dueTelegraphs(world)) {
    if (t.source === null) continue;
    const beast = beastAt(world, t.source);
    if (beast === null) continue;
    if (beast.general) {
      if (t.def === (speciesDef(beast.species) as GeneralDef).howl.telegraph) resolveHowl(world, t, beast);
      continue;
    }
    if (!beast.boss || def === null || def.bossAct === undefined) continue;
    if (t.def === def.bossAct.summonCall) resolveGoiDan(world, t, beast, def);
    else if (t.def === def.bossAct.charge) resolveCharge(world, t, beast, def);
    // Vồ Xé strikes players only: the sweep below strikes it.
  }
}

/** Generals' Tru Đàn, the Vương's phases and mechanics, then the telegraph sweep. */
export function stepBoss(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  resolveDue(world);
  stepGenerals(world);
  stepVuong(world);
  stepTelegraphs(world);
}
