// Source: games/dragon-hold/src/sim/director.ts @06cd4e6 (adapted: canon §13.2 levers on this game's queue (spawn, elite, peak, lull, Linh Dịch), canon §18.2 P/I/O, kit state hashed through hashState())
/**
 * The pace director (canon §13.2; kit balance/director.ts PaceDirector, fed by
 * kit balance/flow.ts FlowMeter): every wave, lull and boss tick the meter
 * reads the world the game's way (canon §18.2): P = a beast in the Kết Giới,
 * Trận Lực lost in the last 2 s, or an attack telegraphed; I ("nhàn quyết
 * định") = no live word but ô 1's, no beast within 12 m of the heart (D46),
 * and not P; O = live words at the cap, words waiting for a place, or ≥ 3
 * dropped locks in 5 s; S = Trận Lực; Q = share of the route walked at death.
 * Every 5 s (from 10 s into a wave) the kit may step one notch, ≤ 2 a wave:
 * spawn gaps of the waiting groups ± 7 % (± 15 % a match), one elite trait
 * more or less on the next group (± 10 % W a match), the next peak or lull
 * moved ± 3 s, or near defeat one Linh Dịch (+5 % Trận Lực), once a wave.
 * Each step emits `pace`. It never changes a live beast, a boss phase, words
 * or grading. Off when `header.pacing` is false (the meter still measures).
 * Owner: Lane 2.
 */
import { DIRECTOR, FIELD, FORMATION, PRESETS } from "../content/rules";
import type { BeastState, DirectorState, EliteTraitId, World, WorldInit } from "../content/types";
import { BANDS } from "../kit/balance/bands";
import { PaceDirector, type PaceDecision, type PaceTable } from "../kit/balance/director";
import { FlowMeter } from "../kit/balance/flow";
import { emit } from "./events";
import { heartDistance, routeU } from "./field";
import { dist2, mmToU, msToTicks, mulDiv, pct } from "./fixed";
import { sortPending } from "./spawn";
import { DATA_WEIGHTS, groupW100, spawnMs, waveW100 } from "./waves";

/** canon §13.2 step table: spawn ± 7 %, one elite trait, peak and lull ± 3 s; Linh Dịch first when easing near defeat. */
export const TT_PACE_TABLE: PaceTable = {
  up: ["spawn", "elite", "peak", "lull"],
  down: ["support", "spawn", "elite", "lull", "peak"],
  spawnStep: DIRECTOR.spawnStepPct * 10,
  eliteCost: 30,
  peakTicks: msToTicks(DIRECTOR.shiftMs),
  lullTicks: msToTicks(DIRECTOR.shiftMs),
};

/** Traits an elite step adds, in turn (canon §10.3). */
const ELITE_ORDER: readonly EliteTraitId[] = ["cuong", "thiet-bi", "hoi-nguyen"];

export function createDirectorState(init: WorldInit): DirectorState {
  const enabled = init.header.pacing;
  const meter = new FlowMeter({
    bucketTicks: DIRECTOR.everyTicks,
    windowBuckets: Math.round(DIRECTOR.windowMs / ((DIRECTOR.everyTicks * 1000) / 60)),
    hurtTicks: msToTicks(DIRECTOR.hurtMs),
    abandonBurst: DIRECTOR.abandonBurst,
    abandonTicks: msToTicks(DIRECTOR.abandonWindowMs),
  });
  const pace = new PaceDirector({
    band: BANDS[PRESETS[init.preset].band],
    table: TT_PACE_TABLE,
    off: enabled ? null : "setting",
    rules: { everyTicks: DIRECTOR.everyTicks, perWave: DIRECTOR.stepsPerWave, spawnCap: DIRECTOR.spawnCapPct * 10, compositionCap: DIRECTOR.hpCapPct * 10 },
  });
  return {
    enabled,
    level: 0,
    stepsThisWave: 0,
    spawnPm: 1000,
    hpPm: 1000,
    lastEvalTick: -1,
    linhDichWave: 0,
    compositionPm: 0,
    eliteCursor: 0,
    kills: [],
    abandons: 0,
    lastTyped: 0,
    lastOther: 0,
    kit: { meter, pace, hashState: () => [...meter.state(), ...pace.state()] },
  };
}

/** A new wave: its step budget, its Linh Dịch and the window start over (waves.ts). */
export function directorWaveStart(world: World, wave: number): void {
  const state = world.director;
  state.kit.pace.beginWave(wave);
  state.kit.meter.resetWindow();
  state.stepsThisWave = 0;
}

/** Cleanup reports each killed beast: the share of its route it walked (Q), ‰. */
export function directorOnKill(world: World, beast: BeastState): void {
  const route = routeU(world, beast.gate);
  if (route <= 0) return;
  const left = heartDistance(world, beast) - mmToU(FIELD.heartEdgeMm);
  const walked = route - (left > 0 ? left : 0);
  world.director.kills.push(walked <= 0 ? 0 : walked >= route ? 1000 : mulDiv(walked, 1000, route));
}

/** A dropped lock (`release`, Esc while typing) for O. */
export function directorOnRelease(world: World): void {
  world.director.abandons += 1;
}

const BARRIER_U = mmToU(FORMATION.barrierRadiusMm);
const IDLE_U = mmToU(DIRECTOR.idleRadiusMm);
const HURT_TICKS = msToTicks(DIRECTOR.hurtMs);

function damageTotals(world: World): { typed: number; other: number } {
  const shares = world.shares;
  let typed = shares.seal + shares.cleanse;
  for (const amount of shares.typedBySlot) typed += amount;
  return { typed, other: shares.auto + shares.mechanism + shares.consumable + shares.formation };
}

/** One tick into the meter while the Bàn Quyết is live in a fight (wave, lull, boss), then the kit's judgement every 5 s. */
export function stepDirector(world: World): void {
  const state = world.director;
  const totals = damageTotals(world);
  if (world.phase !== "wave" && world.phase !== "lull" && world.phase !== "boss") {
    state.kills.length = 0;
    state.abandons = 0;
    state.lastTyped = totals.typed;
    state.lastOther = totals.other;
    return;
  }
  const tick = world.tick;
  let inBarrier = false;
  let near = false;
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    const d2 = dist2(beast.x, beast.z, 0, 0);
    if (d2 <= BARRIER_U * BARRIER_U) inBarrier = true;
    if (d2 <= IDLE_U * IDLE_U) near = true;
    if (inBarrier) break;
  }
  const formation = world.formation;
  const hurt = formation.lastHeartHitTick >= 0 && tick - formation.lastHeartHitTick < HURT_TICKS;
  let telegraphed = false;
  for (const active of world.telegraphs.active) if (!active.cancelled && active.strikeTick >= tick) telegraphed = true;
  const danger = inBarrier || hurt || telegraphed;
  // Live words (ready or being typed) and words waiting for a place under the cap.
  const words = world.words;
  let live = 0;
  let others = 0;
  let waiting = 0;
  for (let index = 0; index < words.live.length; index += 1) {
    const word = words.live[index];
    if (!word || words.free.includes(index)) continue;
    if (word.state === "ready" || word.state === "typing") {
      live += 1;
      if (!(word.kind === "slot" && word.slot === 1)) others += 1;
    } else if (word.state === "waiting") waiting += 1;
  }
  state.kit.meter.feed({
    danger,
    hp: formation.heartMax > 0 ? formation.heart / formation.heartMax : 0,
    // canon §18.2 I: idle only with no live word but ô 1's, no beast near the heart, and not P.
    live: others + (near ? 1 : 0) + (danger ? 1 : 0),
    capped: words.liveCap > 0 && live >= words.liveCap,
    backlog: waiting,
    busy: false,
    kills: state.kills.map((permille) => permille / 1000),
    abandons: state.abandons,
    damage: { typed: totals.typed - state.lastTyped, other: totals.other - state.lastOther },
  });
  state.kills.length = 0;
  state.abandons = 0;
  state.lastTyped = totals.typed;
  state.lastOther = totals.other;
  const before = state.kit.pace.last;
  const decision = state.kit.pace.step(state.kit.meter);
  if (state.kit.pace.last !== before) state.lastEvalTick = tick;
  if (decision !== null) apply(world, decision);
}

/** Waiting groups of the running wave (not summons). */
function waiting(world: World): { tick: number; group: { atMs: number } }[] {
  const wave = world.waves.index;
  return world.spawn.pending.filter((entry) => entry.wave === wave && !entry.summoned);
}

/** Moves the waiting groups whose plan time is at or after `fromMs` (and before `toMs`) by `amount` ticks, never before the next tick. */
function shiftGroups(world: World, fromMs: number, toMs: number, amount: number): boolean {
  const now = world.tick;
  let moved = false;
  for (const entry of waiting(world)) {
    if (entry.group.atMs < fromMs || entry.group.atMs >= toMs || entry.tick <= now) continue;
    entry.tick = Math.max(now + 1, entry.tick + amount);
    moved = true;
  }
  if (moved) sortPending(world.spawn);
  return moved;
}

/** The running wave's next peak (index) not yet started, or −1. */
function nextPeak(world: World): number {
  const def = world.stage.waves[world.waves.index - 1];
  if (!def) return -1;
  const start = world.waves.startedAt;
  return def.peaks.findIndex((peak) => start + msToTicks(spawnMs(world, peak.atMs)) > world.tick);
}

function apply(world: World, decision: PaceDecision): void {
  const state = world.director;
  const def = world.stage.waves[world.waves.index - 1];
  switch (decision.lever) {
    case "spawn": {
      const before = state.spawnPm;
      const after = decision.spawnScale;
      state.spawnPm = after;
      const now = world.tick;
      if (after !== before) {
        for (const entry of waiting(world)) if (entry.tick > now) entry.tick = now + Math.max(1, mulDiv(entry.tick - now, after, before));
        sortPending(world.spawn);
      }
      break;
    }
    case "elite": {
      let cost = 0;
      const stageW = world.stage.waves.reduce((sum, wave) => sum + waveW100(wave, DATA_WEIGHTS), 0);
      const candidates = world.spawn.pending.filter((entry) => entry.wave === world.waves.index && !entry.summoned && entry.group.cluster !== true && entry.group.general !== true);
      const target = decision.dir > 0 ? candidates.find((entry) => !entry.group.elite) : candidates.find((entry) => entry.group.elite);
      if (target) {
        const beforeW = groupW100(target.group, DATA_WEIGHTS);
        if (decision.dir > 0) {
          target.group = { ...target.group, elite: ELITE_ORDER[state.eliteCursor % ELITE_ORDER.length]! };
          state.eliteCursor += 1;
        } else {
          const { elite: _dropped, ...rest } = target.group;
          target.group = rest;
        }
        cost = stageW > 0 ? mulDiv(groupW100(target.group, DATA_WEIGHTS) - beforeW, 1000, stageW) : 0;
      }
      state.kit.pace.report(decision.id, cost);
      state.compositionPm += cost;
      break;
    }
    case "peak": {
      const index = nextPeak(world);
      const peak = index >= 0 ? def?.peaks[index] : undefined;
      if (peak) shiftGroups(world, peak.atMs, peak.atMs + peak.lenMs, decision.amount);
      break;
    }
    case "lull": {
      // The lull before the next peak: everything from that peak on moves.
      const index = nextPeak(world);
      const peak = index >= 1 ? def?.peaks[index] : undefined;
      if (peak) shiftGroups(world, peak.atMs, Number.MAX_SAFE_INTEGER, decision.amount);
      break;
    }
    case "support": {
      const formation = world.formation;
      formation.heart = Math.min(formation.heartMax, formation.heart + pct(formation.heartMax, FORMATION.linhDichPct));
      state.linhDichWave = world.waves.index;
      emit(world, { type: "formation", what: "linh-dich", heart: formation.heart, heartMax: formation.heartMax, node: null });
      break;
    }
  }
  state.level = decision.level;
  state.stepsThisWave += 1;
  emit(world, {
    type: "pace",
    lever: decision.lever === "support" ? "linh-dich" : decision.lever,
    dir: decision.dir,
    amount: decision.amount,
    spawnPm: state.spawnPm,
    level: decision.level,
  });
}
