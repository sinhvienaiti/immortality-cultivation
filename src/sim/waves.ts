// Source: games/dragon-hold/src/sim/waves.ts @06cd4e6 (adapted: canon §4.1 phases with a 20 s prep and an 8 s lull before the Thú Vương; end-of-wave rule kept; plan analysis on W and D_ref)
/**
 * Phases and waves (canon §4.1, §13): prep 20 s (Enter starts earlier) →
 * warning 5 s → wave → break by preset (Thư giãn, Học wait for Enter and go
 * on after 60 s; Cân bằng 20 s, 15 s at a Đại Triều; Thử thách 15 s) → … A
 * wave's clock only drives its spawn schedule: the wave ends when every group
 * of it has spawned and none of its beasts lives (summons belong to the
 * running wave). With a Thú Vương the 8 s lull starts once the last wave has
 * spawned all its groups (its beasts keep walking, no break), then the boss
 * phase: the boss walks in from gate A when the live cap has room, and the
 * stage is won when it has fallen and no beast lives. Without one the last
 * wave's end wins. Stars by Trận Lực left: ≥ 70 % ★★★, ≥ 40 % ★★, > 0 ★.
 *
 * The plan analysis below is the analytic filter of canon §13.1: wave W from
 * the data (with the most a summoner may call), its load L = W / (D_ref ×
 * minutes) and its short peaks, before any sim runs.
 * Owner: Lane 2.
 */
import { BEASTS, GENERALS } from "../content/data/beasts";
import { ELITE_TRAITS } from "../content/data/elites";
import { ELITES, FLOW, PRESETS, REF_OUTPUT } from "../content/rules";
import type { BeastState, EliteTraitId, GateId, Phase, SpeciesId, WaveDef, WaveGroupDef, WaveState, World, WorldInit } from "../content/types";
import { directorWaveStart } from "./director";
import { onBreakStart } from "./shop";
import { payWaveEnd } from "./economy";
import { emit } from "./events";
import { msToTicks, mulDiv } from "./fixed";
import { worldKPm } from "./pace";
import { enqueueGroup, liveRoom, spawnBeast } from "./spawn";

export function createWaveState(init: WorldInit): WaveState {
  const total = init.stage.waves.length;
  return {
    index: 0,
    total,
    startedAt: -1,
    groupsTotal: 0,
    groupsSpawned: 0,
    endedThrough: 0,
    breaks: 0,
    breakHeld: false,
    lullStarted: false,
    bossStarted: false,
    liveByWave: new Array<number>(total + 1).fill(0),
  };
}

function setPhase(world: World, phase: Phase, endsAt: number, wave: number): void {
  world.phase = phase;
  world.phaseEndsAt = endsAt;
  emit(world, { type: "phase", phase, wave, endsAtTick: endsAt });
}

/** The prep phase at tick 0 (createWorld): 20 s, or until `start`. */
export function openPrep(world: World): void {
  setPhase(world, "prep", world.tick + msToTicks(FLOW.prepMs), 0);
}

const warn = (world: World): void => setPhase(world, "warning", world.tick + msToTicks(FLOW.warningMs), world.waves.index + 1);

/** Break length of the preset in ticks; "enter" presets go on by themselves after 60 s (canon §4.1). */
export function breakTicks(world: World): number {
  const row = PRESETS[world.preset].breakMs;
  if (row === "enter") return msToTicks(FLOW.breakAutoMs);
  if (world.stage.kind === "grand" && world.preset === "balanced") return msToTicks(FLOW.grandBreakMs);
  return msToTicks(row);
}

/** `start` in prep: wave 1's warning begins. */
export function startMatch(world: World): void {
  if (world.phase !== "prep") {
    emit(world, { type: "rejected", command: "start", reason: "phase" });
    return;
  }
  if (world.waves.total === 0) {
    emit(world, { type: "rejected", command: "start", reason: "no-waves" });
    return;
  }
  warn(world);
}

/** `continue` in a break that waits for Enter (Thư giãn, Học). */
export function continueBreak(world: World): void {
  if (world.phase !== "break" || PRESETS[world.preset].breakMs !== "enter") {
    emit(world, { type: "rejected", command: "continue", reason: "phase" });
    return;
  }
  warn(world);
}

/** A plan time in ms at the world's pace and the director's spawn scale (canon §23.3: atMs × 1 / k). */
export function spawnMs(world: World, ms: number): number {
  return mulDiv(mulDiv(ms, 1000, worldKPm(world)), world.director.spawnPm, 1000);
}

/** Queues wave `wave`'s groups (atMs × 1 / k, gate rule after scaling, spawn.ts). */
export function scheduleWave(world: World, wave: number): void {
  const def = world.stage.waves[wave - 1];
  if (!def) throw new Error("waves: stage " + world.stage.id + " has no wave " + wave);
  for (const group of def.groups) enqueueGroup(world, group, wave, world.tick + msToTicks(spawnMs(world, group.atMs)));
}

function beginWave(world: World): void {
  const waves = world.waves;
  waves.index += 1;
  const def = world.stage.waves[waves.index - 1]!;
  waves.startedAt = world.tick;
  waves.groupsTotal = def.groups.length;
  waves.groupsSpawned = 0;
  directorWaveStart(world, waves.index);
  setPhase(world, "wave", -1, waves.index);
  emit(world, { type: "wave-start", wave: waves.index, waves: waves.total, gates: def.gates });
  scheduleWave(world, waves.index);
}

/** Stars by Trận Lực left (canon §4.1). */
export function starsFor(world: World): 1 | 2 | 3 {
  const formation = world.formation;
  const pct = formation.heartMax > 0 ? Math.floor((formation.heart * 100) / formation.heartMax) : 0;
  return pct >= FLOW.threeStarPct ? 3 : pct >= FLOW.twoStarPct ? 2 : 1;
}

function win(world: World): void {
  setPhase(world, "victory", -1, world.waves.index);
  emit(world, { type: "victory", stars: starsFor(world) });
}

/** Phase timers: prep, warning, break, lull, and the boss walking in when there is room. */
export function stepWaves(world: World): void {
  const tick = world.tick;
  switch (world.phase) {
    case "prep":
    case "break":
      if (world.phaseEndsAt >= 0 && tick >= world.phaseEndsAt) warn(world);
      return;
    case "warning":
      if (tick >= world.phaseEndsAt) beginWave(world);
      return;
    case "lull":
      if (tick >= world.phaseEndsAt) {
        setPhase(world, "boss", -1, world.waves.index);
        enterBoss(world);
      }
      return;
    case "boss":
      enterBoss(world);
      return;
    default:
      return;
  }
}

/** The Thú Vương walks in from gate A once, as soon as the live cap has room (boss phase, wave 0). */
function enterBoss(world: World): void {
  const boss = world.stage.boss;
  if (world.waves.bossStarted || boss === null || liveRoom(world) < 1) return;
  world.waves.bossStarted = true;
  spawnBeast(world, boss, "A", { wave: 0 });
}

/**
 * After cleanup (world.ts): the lull once the last wave of a boss stage has
 * spawned every group, the running wave's end, then the win. Defeat is
 * checked before this.
 */
export function checkWaves(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  const waves = world.waves;
  const w = waves.index;
  if (w < 1) return;
  const allOut = waves.groupsSpawned >= waves.groupsTotal;
  if (world.phase === "wave" && w === waves.total && allOut && world.stage.boss !== null && !waves.lullStarted) {
    waves.lullStarted = true;
    setPhase(world, "lull", world.tick + msToTicks(FLOW.lullMs), w);
  }
  if (waves.endedThrough < w && allOut && waves.liveByWave[w] === 0 && world.tick > waves.startedAt) endWave(world, w);
  if (world.phase === "boss" && waves.bossStarted && world.beasts.live === 0) win(world);
}

function endWave(world: World, wave: number): void {
  const waves = world.waves;
  waves.endedThrough = wave;
  emit(world, { type: "wave-end", wave });
  payWaveEnd(world, wave);
  // The last wave of a boss stage ends during the lull or the boss phase: no break.
  if (world.phase !== "wave") return;
  if (wave >= waves.total) {
    win(world);
    return;
  }
  waves.breaks += 1;
  onBreakStart(world);
  setPhase(world, "break", world.tick + breakTicks(world), wave);
}

/** Every group of `wave` spawned and 0 of its beasts alive (canon §4.1). */
export function isWaveOver(world: World, wave: number): boolean {
  const waves = world.waves;
  if (wave < 1 || wave > waves.index) return false;
  if (wave < waves.index) return true;
  return waves.groupsSpawned >= waves.groupsTotal && waves.liveByWave[wave] === 0;
}

/** Cleanup calls this for every dead beast: its wave's live count. */
export function onBeastGone(world: World, beast: BeastState): void {
  const byWave = world.waves.liveByWave;
  if (beast.wave >= 0 && beast.wave < byWave.length && byWave[beast.wave]! > 0) byWave[beast.wave] = byWave[beast.wave]! - 1;
}

/** Seconds of break left for the HUD (−1: no break). */
export function breakSecondsLeft(world: World): number {
  return world.phase !== "break" ? -1 : Math.ceil((world.phaseEndsAt - world.tick) / 60);
}

// ── Plan analysis (canon §13.1 analytic filter) ─────────────────────────────

/** W × 100 of a species and of its elite (W × 1.6 + the trait's extra W, canon §10.3). */
export interface WaveWeights {
  w100(species: SpeciesId): number;
  eliteW100(species: SpeciesId, trait: EliteTraitId): number;
}

/** Weights from the data tables (Lane 5's beasts, generals and elite traits). */
export const DATA_WEIGHTS: WaveWeights = {
  w100: (species) => (BEASTS as Partial<Record<SpeciesId, { w100: number }>>)[species]?.w100 ?? (GENERALS as Partial<Record<SpeciesId, { w100: number }>>)[species]?.w100 ?? 0,
  eliteW100: (species, trait) => mulDiv(DATA_WEIGHTS.w100(species), ELITES.wPm, 1000) + ((ELITE_TRAITS as Partial<Record<EliteTraitId, { extraW100: number }>>)[trait]?.extraW100 ?? 0),
};

/** W × 100 of one group (an elite replaces one beast of its species). */
export function groupW100(group: WaveGroupDef, weights: WaveWeights = DATA_WEIGHTS): number {
  const each = weights.w100(group.species);
  const elite = group.elite ? weights.eliteW100(group.species, group.elite) - each : 0;
  return each * group.count + elite;
}

/** W × 100 of a wave with the most its summoners may call (canon §13.1, PB-09). */
export function waveW100(wave: WaveDef, weights: WaveWeights = DATA_WEIGHTS): number {
  let sum = wave.summonMaxW100;
  for (const group of wave.groups) sum += groupW100(group, weights);
  return sum;
}

/** Mean load × 100: W / (D_ref × minutes) (canon §13.1). */
export function waveLoadX100(wave: WaveDef, weights: WaveWeights = DATA_WEIGHTS, dRefW100PerMin: number = REF_OUTPUT.dRefW100PerMin): number {
  return Math.round((waveW100(wave, weights) * 100 * 60_000) / (dRefW100PerMin * wave.durationMs));
}

/** Target wave W × 100 for a load L × 100: L × D_ref × minutes (canon §13.1). */
export function targetW100(loadX100: number, durationMs: number, dRefW100PerMin: number = REF_OUTPUT.dRefW100PerMin): number {
  return Math.round((loadX100 * dRefW100PerMin * durationMs) / (100 * 60_000));
}

/**
 * Short-peak load × 100 of a plan: each group's W is worked off at D_ref from
 * its arrival (W / D_ref minutes), and the peak is the most work in any
 * `windowMs` window over D_ref × window. Summons are left out (their time is
 * the summoner's). Exact: the maximum sits on a breakpoint.
 */
export function peakLoadX100(wave: WaveDef, windowMs: number, weights: WaveWeights = DATA_WEIGHTS, dRefW100PerMin: number = REF_OUTPUT.dRefW100PerMin): number {
  const spans = wave.groups.map((group) => {
    const w100 = groupW100(group, weights);
    const lengthMs = (w100 * 60_000) / dRefW100PerMin;
    return { from: group.atMs, to: group.atMs + lengthMs, w100, lengthMs };
  });
  let best = 0;
  for (const span of spans) {
    for (const start of [span.from, span.to, span.from - windowMs, span.to - windowMs]) {
      const end = start + windowMs;
      let work = 0;
      for (const other of spans) {
        const lo = other.from > start ? other.from : start;
        const hi = other.to < end ? other.to : end;
        if (hi > lo && other.lengthMs > 0) work += (other.w100 * (hi - lo)) / other.lengthMs;
      }
      if (work > best) best = work;
    }
  }
  return Math.round((best * 100 * 60_000) / (dRefW100PerMin * windowMs));
}

/** Gates a wave uses, in first-use order. */
export function waveGates(wave: WaveDef): GateId[] {
  const out: GateId[] = [];
  for (const group of wave.groups) if (!out.includes(group.gate)) out.push(group.gate);
  return out;
}
