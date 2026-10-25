// Source: games/dragon-hold/src/sim/spawn.ts @06cd4e6 (adapted: groups leave whole at a gate of the flow field; the gate rule keeps its floors after scaling, without D29's "the wave waits"; liveRoom for summoners)
/**
 * Spawning (canon §13.1, §13.3, §23.3): each gate releases at most one group
 * every 1.5 s and any two releases are ≥ 0.6 s apart; group times scale by
 * 1 / k first and the gate rule clamps after, so it only ever stretches. The
 * live cap (60 at M0a, D12) holds groups at their gate in queue order while
 * the wave clock keeps running; a held group leaves as soon as it fits, even
 * after the wave clock ran out (canon §4.1). A group leaves whole: a swarm
 * cluster within ± 0.8 m of its gate, a pack within ± 1.2 m (seeded from the
 * `spawn` stream). `liveRoom` tells summoners (Tru Đàn, Gọi Đàn) whether a
 * whole call fits; `spawnGroup` never passes the cap.
 * Owner: Lane 2.
 */
import { FIELD, LOAD } from "../content/rules";
import type { BeastState, EliteTraitId, GateId, PendingGroup, SpawnState, SpeciesId, WaveGroupDef, World, WorldInit } from "../content/types";
import { initBeast } from "./beasts";
import { emit } from "./events";
import { cellAt, gatePoint } from "./field";
import { clamp, mmToU, msToTicks, uToM } from "./fixed";
import { allocBeast } from "./world";

/** Index of a gate in SpawnState.gateReadyAt. */
export const GATE_INDEX: Readonly<Record<GateId, number>> = { A: 0, B: 1, sky: 2 };

export function createSpawnState(_init: WorldInit): SpawnState {
  return { pending: [], gateReadyAt: [0, 0, 0], lastReleaseAt: -1_000_000, capWaitTicks: 0, nextSeq: 0 };
}

/** Keeps `pending` ordered by (tick, seq): stable, so a waiting group never loses its place. */
export function sortPending(spawn: SpawnState): void {
  const list = spawn.pending;
  for (let index = 1; index < list.length; index += 1) {
    const item = list[index]!;
    let at = index;
    while (at > 0 && (list[at - 1]!.tick > item.tick || (list[at - 1]!.tick === item.tick && list[at - 1]!.seq > item.seq))) {
      list[at] = list[at - 1]!;
      at -= 1;
    }
    list[at] = item;
  }
}

/** Queues a group to leave its gate at `tick` (waves.ts scheduleWave). */
export function enqueueGroup(world: World, group: WaveGroupDef, wave: number, tick: number, summoned = false): PendingGroup {
  const spawn = world.spawn;
  const entry: PendingGroup = { tick, wave, group, summoned, seq: spawn.nextSeq };
  spawn.nextSeq += 1;
  let at = spawn.pending.length;
  while (at > 0 && spawn.pending[at - 1]!.tick > tick) at -= 1;
  spawn.pending.splice(at, 0, entry);
  return entry;
}

/** Releases due groups that the gate rule and the live cap allow. */
export function stepSpawn(world: World): void {
  const spawn = world.spawn;
  const now = world.tick;
  const gateGap = msToTicks(LOAD.gateGapMs);
  const pairGap = msToTicks(LOAD.gatePairGapMs);
  const pending = spawn.pending;
  let capped = false;
  let index = 0;
  while (index < pending.length) {
    const entry = pending[index]!;
    if (entry.tick > now) break;
    const gate = GATE_INDEX[entry.group.gate];
    // Gate rule (canon §13.1): one group a gate every 1.5 s, any two releases ≥ 0.6 s apart; it only stretches.
    if (spawn.gateReadyAt[gate]! > now || now - spawn.lastReleaseAt < pairGap) {
      index += 1;
      continue;
    }
    // Live cap (canon §13.3): the group waits at its gate and later groups wait behind it.
    if (world.beasts.live + entry.group.count > world.liveCap) {
      capped = true;
      break;
    }
    pending.splice(index, 1);
    releaseGroup(world, entry.group, entry.wave, entry.summoned);
    spawn.gateReadyAt[gate] = now + gateGap;
    spawn.lastReleaseAt = now;
    if (!entry.summoned && entry.wave === world.waves.index) world.waves.groupsSpawned += 1;
  }
  if (capped) spawn.capWaitTicks += 1;
}

/** Spawns a group now, skipping the gate queue but never the live cap: all of it or none (summoners check `liveRoom` first). */
export function spawnGroup(world: World, group: WaveGroupDef, options: { readonly wave: number; readonly summoned: boolean }): BeastState[] {
  if (world.beasts.live + group.count > world.liveCap) return [];
  return releaseGroup(world, group, options.wave, options.summoned);
}

function releaseGroup(world: World, group: WaveGroupDef, wave: number, summoned: boolean): BeastState[] {
  const rng = world.rng.spawn;
  const entry = group.gate === "sky" ? rng.int(0, 1) : 0;
  const at = gatePoint(world.stage, group.gate, entry);
  const cluster = group.cluster === true ? world.beasts.nextCluster++ : -1;
  const spread = mmToU(group.cluster === true ? FIELD.clusterSpreadMm : FIELD.packSpreadMm);
  const out: BeastState[] = [];
  for (let k = 0; k < group.count; k += 1) {
    // One beast alone stands on the gate; a group fans out across it and a little inwards (south).
    const x = group.count > 1 ? at.x + rng.int(-spread, spread) : at.x;
    const z = group.count > 1 ? at.z + rng.int(0, spread) : at.z;
    out.push(
      spawnBeast(world, group.species, group.gate, {
        wave,
        summoned,
        cluster,
        elite: k === 0 ? (group.elite ?? null) : null,
        general: group.general === true,
        x,
        z,
      }),
    );
  }
  return out;
}

export interface SpawnBeastOptions {
  readonly wave: number;
  readonly summoned?: boolean;
  readonly cluster?: number;
  readonly elite?: EliteTraitId | null;
  readonly general?: boolean;
  /** Position, u; default the gate's point. */
  readonly x?: number;
  readonly z?: number;
}

/**
 * One beast at `gate` (also the boss, waves.ts): allocates it, sets the
 * spawn fields (wave, gate, flags, cluster, position), lets Lane 5's
 * initBeast fill the species fields (HP, speed, armour, posture…), counts it
 * for its wave and emits `spawn`. The caller checks the live cap.
 */
export function spawnBeast(world: World, species: SpeciesId, gate: GateId, options: SpawnBeastOptions): BeastState {
  const field = world.stage.field;
  const at = options.x === undefined || options.z === undefined ? gatePoint(world.stage, gate) : null;
  const beast = allocBeast(world);
  beast.species = species;
  beast.wave = options.wave;
  beast.gate = gate;
  beast.summoned = options.summoned === true;
  beast.elite = options.elite ?? null;
  beast.general = options.general === true;
  beast.boss = world.stage.boss === species;
  beast.cluster = options.cluster ?? -1;
  beast.x = clamp(options.x ?? at!.x, mmToU(field.minXMm), mmToU(field.maxXMm));
  beast.z = clamp(options.z ?? at!.z, mmToU(field.minZMm), mmToU(field.maxZMm));
  beast.y = gate === "sky" ? mmToU(FIELD.flyHeightMm) : 0;
  beast.cell = gate === "sky" ? -1 : cellAt(world.field, beast.x, beast.z);
  beast.bornAt = world.tick;
  initBeast(world, beast, species, beast.elite);
  const byWave = world.waves.liveByWave;
  if (beast.wave >= 0 && beast.wave < byWave.length) byWave[beast.wave] = byWave[beast.wave]! + 1;
  if (world.beasts.live > world.stats.maxLive) world.stats.maxLive = world.beasts.live;
  emit(world, {
    type: "spawn",
    beast: { slot: beast.slot, serial: beast.serial },
    species,
    gate,
    x: uToM(beast.x),
    z: uToM(beast.z),
    elite: beast.elite,
    cluster: beast.cluster,
    summoned: beast.summoned,
  });
  return beast;
}

/** Live beasts now. */
export function liveCount(world: World): number {
  return world.beasts.live;
}

/** Free places under the live cap (summoners call only when their whole call fits, else skip). */
export function liveRoom(world: World): number {
  const room = world.liveCap - world.beasts.live;
  return room > 0 ? room : 0;
}

/** Live members of a swarm cluster (economy pays a cluster once, when its last beast dies). */
export function clusterAlive(world: World, cluster: number): number {
  if (cluster < 0) return 0;
  let count = 0;
  for (const beast of world.beasts.list) if (beast.alive && beast.cluster === cluster) count += 1;
  return count;
}
