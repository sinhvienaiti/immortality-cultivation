/**
 * One match for the page: the world, this machine's `local` layer and the
 * replay log (canon §23.2, M0A_PLAN §6.9). DOM-free, so node tests run it.
 *
 * Commands (keys, panels, shop) enter the world at once and are logged with
 * the tick they entered, so a key shows on the Bàn Quyết in the next frame
 * even during a hit-stop (canon §6.1, §20.2 "phím tới đòn"). Before the first
 * command of a tick the local layer takes its step for that tick, so the
 * order is always the one `runLog` (sim/world.ts) replays: local inputs and
 * the local step, then the tick's commands in order, then the local layer's
 * own commands (auto, down, ward-use), then the world step. Local inputs
 * (move-to, arrows) wait for the next local step and are logged at it.
 *
 * The tail holds hashWorld and hashLocal every 600 ticks and at the end.
 * `rebuild` replays a log through this same path (a partial tick included);
 * `officialCheck` replays the last tail entry with Lane 2's runLog.
 * Owner: integration (LANES.md).
 */
import { STAGES } from "../content/data/stage-m0a";
import { SIM } from "../content/rules";
import type { LocalInput, LocalState, Replay, ReplayEntry, ReplayHashes, ReplayHeader, SimCommand, SimCommandType, SimEvent, StageDef, World } from "../content/types";
import { createLocal, drainLocalCommands, drainLocalEvents, stepLocal } from "../local/index";
import { hashLocal, hashWorld, hex32 } from "../sim/hash";
import { applyCommand, createWorld, runLog, step } from "../sim/world";

/** Commands only the local layer makes; a rebuild lets its own local layer make them again. */
export const LOCAL_COMMANDS: ReadonlySet<SimCommandType> = new Set<SimCommandType>(["auto", "down", "ward-use"]);

export interface MatchHashes {
  readonly world: string;
  readonly local: string;
}

export interface MatchRunner {
  readonly header: ReplayHeader;
  readonly stage: StageDef;
  readonly world: World;
  readonly local: LocalState;
  /** Replay body so far (canon §23.2), in the order things happened. */
  readonly log: readonly ReplayEntry[];
  /** Both hashes every 600 ticks and at the end. */
  readonly tail: readonly ReplayHashes[];
  /** Won, lost or stopped (retreat): no more ticks or commands. */
  readonly finished: boolean;
  /** The local layer already stepped for the tick to come (a command came first). */
  readonly localStepped: boolean;
  /** A command into the world now (false: the match is over). */
  send(command: SimCommand): boolean;
  /** A local input (move-to, arrows) for the next local step. */
  input(input: LocalInput): void;
  /** One 60 Hz tick: the local step (unless a command ran it), its own commands, the world step. */
  tick(): void;
  /** Runs the local step of the tick to come now (a rebuild that ends inside a tick). */
  stepLocalNow(): void;
  /** Retreat: the match ends here; the tail gets its last entry. */
  stop(): void;
  /** World and local events since the last drain, oldest first. */
  drain(): SimEvent[];
  hashes(): MatchHashes;
  replay(): Replay;
}

export function stageOf(header: ReplayHeader): StageDef {
  const stage = STAGES[header.stageId];
  if (!stage) throw new Error("match: unknown stage " + header.stageId);
  return stage;
}

export function createMatchRunner(header: ReplayHeader, stage: StageDef = stageOf(header)): MatchRunner {
  const world = createWorld(stage, header.seed, header);
  const local = createLocal(header.seats[0]!.seat, stage, world.gPm);
  const log: ReplayEntry[] = [];
  const tail: ReplayHashes[] = [];
  const inputs: LocalInput[] = [];
  let localEvents: SimEvent[] = [];
  let localTick = -1;
  let stopped = false;

  const over = (): boolean => stopped || world.phase === "victory" || world.phase === "defeat";
  const hashes = (): MatchHashes => ({ world: hex32(hashWorld(world)), local: hex32(hashLocal(local)) });
  const mark = (): void => {
    const last = tail[tail.length - 1];
    if (last !== undefined && last.tick === world.tick) return;
    tail.push({ tick: world.tick, ...hashes() });
  };

  const ensureLocal = (): void => {
    if (localTick === world.tick) return;
    const at = world.tick;
    for (const input of inputs) log.push({ tick: at, local: input });
    stepLocal(local, world, inputs);
    inputs.length = 0;
    localTick = at;
    const fresh = drainLocalEvents(local);
    for (const event of fresh) localEvents.push(event);
  };

  return {
    header,
    stage,
    world,
    local,
    log,
    tail,
    get finished() {
      return over();
    },
    get localStepped() {
      return localTick === world.tick;
    },
    send(command: SimCommand): boolean {
      if (over()) return false;
      ensureLocal();
      applyCommand(world, command);
      log.push({ tick: world.tick, command });
      return true;
    },
    input(input: LocalInput): void {
      if (!over()) inputs.push(input);
    },
    tick(): void {
      if (over()) return;
      ensureLocal();
      const at = world.tick;
      const own = drainLocalCommands(local);
      for (const command of own) log.push({ tick: at, command });
      step(world, own);
      if (world.tick % SIM.hashEveryTicks === 0 || over()) mark();
    },
    stepLocalNow(): void {
      if (!over()) ensureLocal();
    },
    stop(): void {
      if (over()) return;
      stopped = true;
      // Inside a tick (a command already ran) runLog cannot stop there: the last whole tick's entry stands.
      if (localTick !== world.tick) mark();
    },
    drain(): SimEvent[] {
      const events = world.events.drain();
      if (localEvents.length === 0) return events;
      const out = events.length === 0 ? localEvents : [...events, ...localEvents];
      localEvents = [];
      return out;
    },
    hashes,
    replay: () => ({ header, body: log.slice(), tail: tail.slice() }),
  };
}

/**
 * The same match again from its header and log, through the same path as the
 * live one: up to `untilTick`, and inside that tick when `localStepped`. The
 * local layer's own commands in the log are skipped (its local layer makes them again).
 */
export function rebuild(header: ReplayHeader, log: readonly ReplayEntry[], untilTick: number, localStepped: boolean): MatchRunner {
  const runner = createMatchRunner(header);
  for (const entry of log) {
    while (runner.world.tick < entry.tick && !runner.finished) runner.tick();
    if ("local" in entry) runner.input(entry.local);
    else if (!LOCAL_COMMANDS.has(entry.command.type)) runner.send(entry.command);
  }
  while (runner.world.tick < untilTick && !runner.finished) runner.tick();
  if (localStepped) runner.stepLocalNow();
  return runner;
}

export interface ReplayCheck {
  readonly tick: number;
  readonly live: MatchHashes;
  readonly replay: MatchHashes;
  /** World and local both match. */
  readonly same: boolean;
  readonly entries: number;
  /** Lane 2's runLog on the last tail entry (null before the first one). */
  readonly official: { readonly tick: number; readonly same: boolean; readonly world: string; readonly local: string } | null;
}

/** Lane 2's runLog up to the last tail entry, against the hashes the live match wrote there. */
export function officialCheck(runner: MatchRunner): ReplayCheck["official"] {
  const last = runner.tail[runner.tail.length - 1];
  if (last === undefined) return null;
  const replayed = runLog(runner.header, runner.log, last.tick);
  const world = hex32(hashWorld(replayed.world));
  const local = hex32(hashLocal(replayed.local));
  return { tick: last.tick, same: world === last.world && local === last.local, world, local };
}

/** Rebuilds the live match from its header and log and compares both hashes (`__ic.replayCheck`, ic-replay). */
export function replayCheck(runner: MatchRunner): ReplayCheck {
  const copy = rebuild(runner.header, runner.log, runner.world.tick, runner.localStepped);
  const live = runner.hashes();
  const replay = copy.hashes();
  return { tick: runner.world.tick, live, replay, same: live.world === replay.world && live.local === replay.local, entries: runner.log.length, official: officialCheck(runner) };
}
