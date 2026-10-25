/**
 * Lane 4's test world: the real createWorld of the M0a stage (every lane's
 * real system, no mocks), put straight into a wave so beasts placed by hand
 * stay put until a test steps them. Not a test file (no .test.ts).
 */
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import type {
  BeastState, Cast, EliteTraitId, EventSink, GuardChoice, Phase, PointU, Preset, ReplayHeader, SimEvent, SlotId, SpeciesId, StageDef, TamPhapId, World,
} from "../../src/content/types";
import { mToU } from "../../src/sim/fixed";
import { spawnBeast } from "../../src/sim/spawn";
import { createWorld } from "../../src/sim/world";
import { coldDeck } from "../typing/world-fixture";

/** Keeps every event (tests read them by type) and the last tick's for `local`. */
export class KeepSink implements EventSink {
  readonly all: SimEvent[] = [];
  private drained = 0;
  private current: SimEvent[] = [];
  private last: SimEvent[] = [];
  push(event: SimEvent): void {
    this.all.push(event);
    this.current.push(event);
  }
  drain(): SimEvent[] {
    const out = this.all.slice(this.drained);
    this.drained = this.all.length;
    return out;
  }
  lastTick(): readonly SimEvent[] {
    return this.last;
  }
  endTick(): void {
    this.last = this.current;
    this.current = [];
  }
  get length(): number {
    return this.all.length - this.drained;
  }
}

export interface TestOptions {
  preset?: Preset;
  realm?: number;
  seed?: number;
  phase?: Phase;
  kPm?: number;
  guard?: GuardChoice;
  tamPhap?: TamPhapId;
  stage?: StageDef;
  seats?: number;
}

export interface TestWorld {
  readonly world: World;
  readonly sink: KeepSink;
  of<T extends SimEvent["type"]>(type: T): Extract<SimEvent, { type: T }>[];
}

export function testHeader(options: TestOptions = {}): ReplayHeader {
  const stage = options.stage ?? THANH_THACH_AI;
  const seats = options.seats ?? 1;
  return {
    v: 1,
    gameId: "immortality-cultivation",
    rulesHash: "00000000",
    seed: options.seed ?? 7,
    stageId: stage.id,
    preset: options.preset ?? "balanced",
    pacing: true,
    seats: Array.from({ length: seats }, (_, seat) => ({ seat, profile: { e: 35, a: 950, cv: 250 }, kPm: options.kPm ?? 1000 })),
    deck: coldDeck(),
    newWordAllowance: 8,
    loadout: { guard: options.guard ?? "ward", tamPhap: options.tamPhap ?? "kiem-tam" },
  };
}

/** A real world in `phase` (default "wave", no wave scheduled: nothing spawns by itself). */
export function makeWorld(options: TestOptions = {}): TestWorld {
  const base = options.stage ?? THANH_THACH_AI;
  const stage = options.realm === undefined || options.realm === base.realm ? base : { ...base, realm: options.realm };
  const header = testHeader({ ...options, stage });
  const world = createWorld(stage, header.seed, header);
  const sink = new KeepSink();
  (world as { events: EventSink }).events = sink;
  world.phase = options.phase ?? "wave";
  world.phaseEndsAt = -1;
  return { world, sink, of: <T extends SimEvent["type"]>(type: T) => sink.all.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type) };
}

/** One beast at (x, z) metres (default: 6 m north of the heart). */
export function addBeast(world: World, species: SpeciesId, at: { x?: number; z?: number; elite?: EliteTraitId | null; cluster?: number; gate?: "A" | "B" | "sky" } = {}): BeastState {
  return spawnBeast(world, species, at.gate ?? "A", { wave: 0, x: mToU(at.x ?? 0), z: mToU(at.z ?? -6), elite: at.elite ?? null, cluster: at.cluster ?? -1 });
}

/** A swarm cluster of `count` Thạch Thử around (x, z) metres, 0.3 m apart. */
export function addCluster(world: World, count: number, x = 0, z = -6): BeastState[] {
  const cluster = world.beasts.nextCluster++;
  const out: BeastState[] = [];
  for (let k = 0; k < count; k += 1) out.push(addBeast(world, "thach-thu", { x: x + (k % 4) * 0.3, z: z + Math.floor(k / 4) * 0.3, cluster }));
  return out;
}

/** Runs `ticks` ticks of the given steps (the world's order), closing each tick. */
export function advance(world: World, ticks: number, steps: readonly ((world: World) => void)[]): void {
  for (let n = 0; n < ticks; n += 1) {
    for (const step of steps) step(world);
    world.events.endTick?.();
    world.tick += 1;
  }
}

export const at = (x: number, z: number): PointU => ({ x: mToU(x), z: mToU(z) });

let action = 0;

/** A finished word's Cast as words.ts builds it (origin at the heart unless given). */
export function castOf(world: World, slot: SlotId | "seal" | "cleanse", options: Partial<Cast> = {}): Cast {
  action += 1;
  return {
    seat: 0,
    slot,
    actionId: action,
    wordId: "word" + action,
    tick: world.tick,
    channel: "typing",
    quality: "ok",
    origin: { x: 0, z: 0 },
    aim: null,
    state: "held",
    heldUntil: -1,
    target: null,
    node: null,
    ...options,
  };
}

/** Puts the Tâm nhãn out (Công, Thủ, Dưỡng off) or back. */
export function setTamNhan(world: World, on: boolean): void {
  const node = world.formation.nodes[0];
  if (node !== undefined) node.on = on;
}

export { THANH_THACH_AI };
