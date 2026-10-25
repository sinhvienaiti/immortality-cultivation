// Source: games/dragon-hold/src/sim/world.ts @06cd4e6 (adapted: canon §23 world with every lane's state, M0A_PLAN §3.2 step order, the local layer and runLog from the replay header)
/**
 * The Tu Tiên Thủ Ải world and its fixed 60 Hz step (canon §23, M0A_PLAN §3.2).
 * Pure TypeScript: no clock, no DOM, no three; randomness only from
 * `world.rng.<stream>` (spawn, combat, words, ai, loot, props; never crit, D09).
 * Every field of `World` is declared in content/types.ts; each lane writes the
 * create function of its own part (`create<X>State(init: WorldInit)`).
 *
 * Step order (fixed): commands → stepWords → stepWaves → stepSpawn →
 * stepDirector → stepBeasts → stepCasts → stepSkills → stepWards →
 * stepConsumables → stepAutoHits → stepMechanisms → stepBeastAttacks →
 * stepBoss → stepPosture → stepFormation → stepEconomy → cleanup (per dead
 * beast: words.onBeastGone, combat.onBeastKilled, economy.onBeastKilled,
 * waves.onBeastGone, then its `death`; then defeat, wave end, lull, victory)
 * → tick + 1. Lane 5's telegraph and elite steps run inside its own steps.
 *
 * The `local` layer (this machine's player, canon §9.1, D34) runs before each
 * world tick and reads the last tick's events; its commands (auto, down,
 * ward-use) go into the same tick as the keys (`stepMatch`). A replay holds
 * every command the world got, local ones included, and the local inputs
 * (canon §23.2); `runLog` rebuilds both `world` and `local` from it.
 * Owner: Lane 2.
 */
import { STAGES } from "../content/data/stage-m0a";
import { DEATH_TIER, PLAYER, gPm as gPmOf } from "../content/rules";
import type { BeastRef, BeastState, LocalInput, LocalState, Phase, ReplayEntry, ReplayHeader, SeatState, SimCommand, StageDef, World, WorldInit } from "../content/types";
import { createRng } from "../kit/platform/rng";
import { createLocal, drainLocalCommands, drainLocalEvents, stepLocal } from "../local/index";
import { stepBeasts } from "./beasts";
import { createBossState, stepBoss } from "./boss";
import { createCastsState, stepCasts } from "./cast";
import { applyAuto, onBeastKilled as combatOnKill, stepAutoHits } from "./combat";
import { createConsumablesState, stepConsumables, useConsumable } from "./consumables";
import { createDirectorState, directorOnKill, directorOnRelease, stepDirector } from "./director";
import { createEconomyState, onBeastKilled as economyOnKill, payLearning, stepEconomy } from "./economy";
import { EventQueue, emit } from "./events";
import { createField } from "./field";
import { msToTicks, uToM } from "./fixed";
import { applyDown, createFormationState, stepFormation } from "./formation";
import { createMechanismsState, stepMechanisms } from "./mechanisms";
import { applyPaceUpdate } from "./pace";
import { stepPosture } from "./posture";
import { stepBeastAttacks } from "./pressure";
import { createShareLedger } from "./shares";
import { buy, createShopState, place, sell, upgrade } from "./shop";
import { createSkillsState, stepSkills } from "./skills";
import { createSpawnState, stepSpawn } from "./spawn";
import { createTelegraphsState } from "./telegraph";
import { createWardsState, stepWards, useWard } from "./wards";
import { checkWaves, continueBreak, createWaveState, onBeastGone as wavesOnGone, openPrep, startMatch, stepWaves } from "./waves";
import { createWordsState, onBeastGone as wordsOnGone, onLearnAhead, onSeatDown, releaseLock, stepWords, typeBackspace, typeKey } from "./words";

/** Keys hashWorld skips: static config, wall clock, events (M0A_PLAN §3.1). */
export { HASH_SKIP } from "./hash";

/** A new world at tick 0 from the stage, the seed and the replay header (canon §23.2), in prep. */
export function createWorld(stage: StageDef, seed: number, header: ReplayHeader): World {
  if (header.stageId !== stage.id) throw new Error("world: header names stage " + header.stageId + ", got " + stage.id);
  if (header.seats.length === 0) throw new Error("world: the header has no seat");
  const realm = stage.realm;
  const g = gPmOf(realm);
  const rng = createRng(seed >>> 0);
  const init: WorldInit = { stage, header, seed: seed >>> 0, preset: header.preset, realm, gPm: g, seats: header.seats.length, rng };
  const seats: SeatState[] = header.seats.map((row, index) => ({
    seat: row.seat,
    human: index === 0,
    profile: { e: row.profile.e, a: row.profile.a, cv: row.profile.cv },
    kPm: row.kPm,
    loadout: { guard: header.loadout.guard, tamPhap: header.loadout.tamPhap },
    chanNguyenPm: 0,
    downUntil: -1,
    softTarget: null,
    lastResolvedTick: -1,
  }));
  const world: World = {
    stage,
    header,
    field: createField(stage),
    seed: seed >>> 0,
    preset: header.preset,
    realm,
    gPm: g,
    liveCap: stage.liveCap,
    newWordAllowance: header.newWordAllowance,
    rng,
    tick: 0,
    phase: "prep",
    phaseEndsAt: -1,
    seats,
    beasts: { list: [], free: [], nextSerial: 1, live: 0, nextCluster: 0 },
    waves: createWaveState(init),
    spawn: createSpawnState(init),
    director: createDirectorState(init),
    words: createWordsState(init),
    casts: createCastsState(init),
    skills: createSkillsState(init),
    wards: createWardsState(init),
    formation: createFormationState(init),
    mechanisms: createMechanismsState(init),
    economy: createEconomyState(init),
    shop: createShopState(init),
    consumables: createConsumablesState(init),
    shares: createShareLedger(),
    telegraphs: createTelegraphsState(init),
    boss: createBossState(init),
    stats: {
      keys: 0, wrongKeys: 0, strayKeys: 0, words: 0, grades: [0, 0, 0, 0, 0], castsHeld: 0, castsResolved: 0, castsFizzled: 0, kills: 0, maxLive: 0,
      maxLiveWords: 0, firstLetterJams: 0, fallbackJams: 0, baseWordUses: [0, 0, 0, 0, 0, 0, 0, 0], foeTicks: 0, hardControlTicks: 0, heartLost: 0, downs: 0,
      linhSaEarned: 0, linhSaSpent: 0,
    },
    wall: { lastKeyMs: header.seats.map(() => 0) },
    events: new EventQueue(),
  };
  openPrep(world);
  return world;
}

const finished = (phase: Phase): boolean => phase === "victory" || phase === "defeat";

/** One 60 Hz tick with this tick's commands (`local` already ran, M0A_PLAN §3.2). */
export function step(world: World, commands: readonly SimCommand[] = []): void {
  if (!finished(world.phase)) {
    for (const command of commands) applyCommand(world, command);
    for (const seat of world.seats) if (seat.downUntil >= 0 && world.tick >= seat.downUntil) seat.downUntil = -1;
    stepWords(world);
    stepWaves(world);
    stepSpawn(world);
    stepDirector(world);
    stepBeasts(world);
    stepCasts(world);
    stepSkills(world);
    stepWards(world);
    stepConsumables(world);
    stepAutoHits(world);
    stepMechanisms(world);
    stepBeastAttacks(world);
    stepBoss(world);
    stepPosture(world);
    stepFormation(world);
    stepEconomy(world);
    cleanup(world);
  }
  world.events.endTick?.();
  world.tick += 1;
}

/** Kill consequences in a fixed order, frees slots, then defeat, wave end, lull and victory. */
function cleanup(world: World): void {
  const store = world.beasts;
  for (const beast of store.list) {
    if (beast.alive || beast.freed) continue;
    beast.freed = true;
    const killed = beast.killedBy !== null;
    wordsOnGone(world, beast);
    if (killed) {
      combatOnKill(world, beast);
      economyOnKill(world, beast);
      directorOnKill(world, beast);
    }
    wavesOnGone(world, beast);
    if (killed) {
      emit(world, {
        type: "death",
        beast: { slot: beast.slot, serial: beast.serial },
        species: beast.species,
        by: beast.killedBy!,
        x: uToM(beast.x),
        z: uToM(beast.z),
        cluster: beast.cluster,
        clusterDone: beast.cluster >= 0 && isClusterLast(world, beast),
        tier: DEATH_TIER[beast.tier],
      });
    }
    store.free.push(beast.slot);
    store.live -= 1;
  }
  if (world.formation.heart <= 0) {
    world.formation.heart = 0;
    world.phase = "defeat";
    world.phaseEndsAt = -1;
    emit(world, { type: "phase", phase: "defeat", wave: world.waves.index, endsAtTick: -1 });
    emit(world, { type: "defeat", wave: world.waves.index });
    return;
  }
  checkWaves(world);
}

/** No other beast of `beast`'s cluster is alive or waiting for cleanup: it was the last (economy pays a cluster once). */
export function isClusterLast(world: World, beast: BeastState): boolean {
  if (beast.cluster < 0) return true;
  for (const other of world.beasts.list) {
    if (other === beast || other.cluster !== beast.cluster) continue;
    if (other.alive || !other.freed) return false;
  }
  return true;
}

const rejected = (world: World, command: SimCommand, reason: string): void => emit(world, { type: "rejected", command: command.type, reason });

/** Routes one command to the system that owns it; systems reject what their phase forbids with `rejected`. */
export function applyCommand(world: World, command: SimCommand): void {
  if ("seat" in command && world.seats[command.seat] === undefined) {
    rejected(world, command, "seat");
    return;
  }
  switch (command.type) {
    case "key":
      world.wall.lastKeyMs[command.seat] = command.ms;
      return typeKey(world, command);
    case "backspace":
      return typeBackspace(world, command.seat);
    case "release":
      directorOnRelease(world);
      return releaseLock(world, command.seat);
    case "soft-target": {
      // Left click on a beast keeps it as the soft target until it dies or a click on the ground (canon §5.1).
      const seat = world.seats[command.seat]!;
      seat.softTarget = command.beast !== null && beastAt(world, command.beast) !== null ? { slot: command.beast.slot, serial: command.beast.serial } : null;
      return;
    }
    case "auto":
      return applyAuto(world, command);
    case "down": {
      const seat = world.seats[command.seat]!;
      if (seat.downUntil > world.tick) return rejected(world, command, "down");
      seat.downUntil = world.tick + msToTicks(PLAYER.downMs);
      onSeatDown(world, command.seat);
      return applyDown(world, command);
    }
    case "ward-use":
      return useWard(world, command);
    case "consumable":
      return useConsumable(world, command);
    case "buy":
      return buy(world, command);
    case "place":
      return place(world, command);
    case "upgrade":
      return upgrade(world, command);
    case "sell":
      return sell(world, command);
    case "loadout": {
      if (world.phase !== "prep") return rejected(world, command, "phase");
      world.seats[command.seat]!.loadout = { guard: command.guard, tamPhap: command.tamPhap };
      return;
    }
    case "start":
      return startMatch(world);
    case "continue":
      return continueBreak(world);
    case "learn-ahead":
      if (world.phase !== "prep") return rejected(world, command, "phase");
      // Lane 3 books a new word's first meeting (canon §6.4) before the pay.
      onLearnAhead(world, command);
      if (command.correct) payLearning(world, command.seat, "learn-ahead");
      return;
    case "review-card":
      if (world.phase !== "break") return rejected(world, command, "phase");
      if (command.correct) payLearning(world, command.seat, "review-card");
      return;
    case "pace-update":
      return applyPaceUpdate(world, command);
  }
}

/**
 * One match tick for the app and the bots: the local layer (with this tick's
 * local inputs) runs first, then the world with `commands` followed by the
 * local layer's own (auto, down, ward-use). Appends what it fed to `log` when
 * given, in the replay's shape (canon §23.2); returns the commands fed.
 */
export function stepMatch(world: World, local: LocalState, inputs: readonly LocalInput[], commands: readonly SimCommand[], log?: ReplayEntry[]): SimCommand[] {
  const tick = world.tick;
  stepLocal(local, world, inputs);
  const fed = [...commands, ...drainLocalCommands(local)];
  if (log) {
    for (const input of inputs) log.push({ tick, local: input });
    for (const command of fed) log.push({ tick, command });
  }
  step(world, fed);
  return fed;
}

/**
 * Rebuilds `world` and `local` from a replay header and body up to
 * `untilTick` (canon §23.2): each tick the local layer gets its logged inputs,
 * then the world gets every logged command of that tick (the local layer's
 * own included, so its fresh outbox is dropped). The body is in tick order.
 */
export function runLog(header: ReplayHeader, log: readonly ReplayEntry[], untilTick: number): { readonly world: World; readonly local: LocalState } {
  const stage = STAGES[header.stageId];
  if (!stage) throw new Error("runLog: unknown stage " + header.stageId);
  const world = createWorld(stage, header.seed, header);
  const local = createLocal(header.seats[0]!.seat, stage, world.gPm);
  const commands: SimCommand[] = [];
  const inputs: LocalInput[] = [];
  let next = 0;
  while (world.tick < untilTick) {
    commands.length = 0;
    inputs.length = 0;
    while (next < log.length && log[next]!.tick <= world.tick) {
      const entry = log[next++]!;
      if ("command" in entry) commands.push(entry.command);
      else inputs.push(entry.local);
    }
    stepLocal(local, world, inputs);
    drainLocalCommands(local);
    drainLocalEvents(local);
    step(world, commands);
  }
  return { world, local };
}

/** Takes a free beast slot (or a new one) with a fresh serial; the caller fills the species fields. */
export function allocBeast(world: World): BeastState {
  const store = world.beasts;
  const reuse = store.free.pop();
  const slot = reuse ?? store.list.length;
  const beast: BeastState = {
    slot, serial: store.nextSerial, alive: true, freed: false, species: "thach-thu", tier: "swarm", wave: 0, gate: "A", summoned: false, elite: null,
    general: false, boss: false, cluster: -1, x: 0, z: 0, y: 0, cell: -1, speedPm: 0, bornAt: world.tick, hp: 1, hpMax: 1, armour: 0, resist: 0,
    threatW100: 0, lastHitTick: -1, killedBy: null, killedBySeat: -1, mode: "walk", modeUntil: -1, target: null, attackAt: -1, telegraph: -1, posture: null,
    slows: [], hardUntil: -1, hardTicks: 0, seal: -1, howls: 0, howlReadyAt: 0,
  };
  store.nextSerial += 1;
  store.live += 1;
  if (reuse === undefined) store.list.push(beast);
  else store.list[slot] = beast;
  return beast;
}

/** The live beast a ref names, or null when it died or the slot was reused. */
export function beastAt(world: World, ref: BeastRef): BeastState | null {
  const beast = world.beasts.list[ref.slot];
  return beast && beast.alive && beast.serial === ref.serial ? beast : null;
}

/** The seat lies down (canon §4.1): no keys, no đan phù, no auto attack. */
export function seatDown(world: World, seat: number): boolean {
  return (world.seats[seat]?.downUntil ?? -1) > world.tick;
}
