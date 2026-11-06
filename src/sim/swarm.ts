/** Qi dragon swarm, part A: deterministic snapshot, geometry and lifecycle only. */
import { SWARM } from "../content/data/swarm";
import { kiemSkill } from "../content/data/school-kiem";
import type { BeastState, Cast, SwarmCastV1, World } from "../content/types";
import { emit } from "./events";
import { clamp, mulDiv, mulDivSym, U_PER_MM } from "./fixed";
import { damageImmune } from "./posture";
import { horizontalDistance, inset, steerRoute, straightRoute, SWARM_TABLE_VERSION, type SwarmBounds, type SwarmPath, type SwarmPoint } from "./swarm-geometry";

declare module "../content/types" {
  interface SkillsState { swarm?: SwarmState }
}
export interface SwarmBeast extends SwarmPoint { readonly id: number; readonly slot: number; readonly boss: boolean; readonly sky: boolean }
export interface SwarmCluster {
  readonly cellX: number; readonly cellZ: number; readonly region: number;
  readonly score: number; readonly medoid: SwarmBeast; readonly costMm: number;
}
export interface SwarmDragon extends SwarmPath {
  readonly index: number; readonly targets: readonly SwarmCluster[]; readonly waypoints: readonly SwarmPoint[];
  readonly launchTick: number; readonly diveTick: number; readonly fallback: boolean;
}
export interface SwarmPlan {
  readonly origin: SwarmPoint; readonly pearl: SwarmPoint; readonly bounds: SwarmBounds;
  readonly snapshot: readonly SwarmBeast[]; readonly dragons: readonly SwarmDragon[];
  readonly burstTick: number; readonly endTick: number;
}
export interface SwarmCast extends SwarmPlan { readonly castId: number; readonly seat: number; readonly startTick: number; readonly packet: SwarmCastV1 }
export interface SwarmState { readonly casts: SwarmCast[] }
export const createSwarmState = (): SwarmState => ({ casts: [] });
const mm = (u: number): number => mulDivSym(u, 1, U_PER_MM);

export function regionOf(p: SwarmPoint, bounds: SwarmBounds): number {
  const xAxis = bounds.maxXMm - bounds.minXMm >= bounds.maxZMm - bounds.minZMm;
  const min = xAxis ? bounds.minXMm : bounds.minZMm, max = xAxis ? bounds.maxXMm : bounds.maxZMm;
  const value = xAxis ? p.x : p.z;
  return max <= min ? 0 : clamp(Math.floor((value - min) * SWARM.dragons / (max - min)), 0, SWARM.dragons - 1);
}
export function patrolPoint(region: number, bounds: SwarmBounds): SwarmPoint {
  const xAxis = bounds.maxXMm - bounds.minXMm >= bounds.maxZMm - bounds.minZMm;
  const midX = mulDivSym(bounds.minXMm + bounds.maxXMm, 1, 2), midZ = mulDivSym(bounds.minZMm + bounds.maxZMm, 1, 2);
  return {
    x: inset(xAxis ? bounds.minXMm + mulDiv(bounds.maxXMm - bounds.minXMm, 2 * region + 1, 2 * SWARM.dragons) : midX, bounds.minXMm, bounds.maxXMm, SWARM.geometry.marginMm),
    y: SWARM.geometry.groundYMm,
    z: inset(xAxis ? midZ : bounds.minZMm + mulDiv(bounds.maxZMm - bounds.minZMm, 2 * region + 1, 2 * SWARM.dragons), bounds.minZMm, bounds.maxZMm, SWARM.geometry.marginMm),
  };
}
function snapshotBeast(b: BeastState): SwarmBeast {
  return { id: b.serial, slot: b.slot, x: mm(b.x), y: mm(b.y), z: mm(b.z), boss: b.boss, sky: b.gate === "sky" || b.y > 0 };
}
export function swarmSnapshot(world: World): SwarmBeast[] {
  const f = world.stage.field;
  return world.beasts.list.filter((b) => b.alive && !damageImmune(world, b) && b.x >= f.minXMm * U_PER_MM && b.x <= f.maxXMm * U_PER_MM && b.z >= f.minZMm * U_PER_MM && b.z <= f.maxZMm * U_PER_MM)
    .map(snapshotBeast).sort((a, b) => a.id - b.id);
}
function cellIndex(value: number, min: number, max: number): number {
  return clamp(Math.floor((value - min) / SWARM.cellMm), 0, Math.max(0, Math.ceil((max - min) / SWARM.cellMm) - 1));
}
/** Clamp a rounded vector inward as well, so diagonal rounding cannot overshoot a radius by 1 mm. */
function limitDisplacement(dx: number, dz: number, radius: number): { x: number; z: number } {
  if (dx * dx + dz * dz <= radius * radius) return { x: dx, z: dz };
  const length = horizontalDistance({ x: 0, y: 0, z: 0 }, { x: dx, y: 0, z: dz });
  let x = mulDivSym(dx, radius, length), z = mulDivSym(dz, radius, length);
  while (x * x + z * z > radius * radius) {
    if (Math.abs(x) >= Math.abs(z)) x += x > 0 ? -1 : 1;
    else z += z > 0 ? -1 : 1;
  }
  return { x, z };
}
function medoid(beasts: readonly SwarmBeast[]): SwarmBeast {
  let best = beasts[0]!, bestCost = Number.MAX_SAFE_INTEGER;
  for (const a of beasts) {
    let cost = 0;
    for (const b of beasts) cost += horizontalDistance(a, b);
    if (cost < bestCost || (cost === bestCost && a.id < best.id)) { best = a; bestCost = cost; }
  }
  return best;
}
/** Global cells (pearl) or cells intersected with ownership strips (dragon targets). */
export function rankClusters(beasts: readonly SwarmBeast[], origin: SwarmPoint, bounds: SwarmBounds, byRegion = true): SwarmCluster[] {
  const cells = new Map<string, SwarmBeast[]>();
  for (const b of beasts) {
    const x = cellIndex(b.x, bounds.minXMm, bounds.maxXMm), z = cellIndex(b.z, bounds.minZMm, bounds.maxZMm);
    const key = (byRegion ? regionOf(b, bounds) : -1) + ":" + x + ":" + z;
    const cell = cells.get(key);
    if (cell === undefined) cells.set(key, [b]); else cell.push(b);
  }
  const out: SwarmCluster[] = [];
  for (const members of cells.values()) {
    const m = medoid(members), first = members[0]!;
    let score = 0;
    for (const b of members) score += b.boss ? SWARM.bossScore : 1;
    out.push({ cellX: cellIndex(first.x, bounds.minXMm, bounds.maxXMm), cellZ: cellIndex(first.z, bounds.minZMm, bounds.maxZMm), region: byRegion ? regionOf(first, bounds) : -1, score, medoid: m, costMm: horizontalDistance(origin, m) });
  }
  return out.sort((a, b) => b.score - a.score || a.costMm - b.costMm || a.cellX - b.cellX || a.cellZ - b.cellZ || a.medoid.id - b.medoid.id);
}
export const separated = (a: SwarmCluster, b: SwarmCluster): boolean => Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellZ - b.cellZ)) >= SWARM.separatedCells;
export function pickTargets(clusters: readonly SwarmCluster[], dragon: number, first: SwarmCluster | null): SwarmCluster[] {
  const out: SwarmCluster[] = dragon === 0 && first !== null ? [first] : [];
  for (const c of clusters) {
    if (out.length === SWARM.maxTargets) break;
    if (c.region === dragon && out.every((a) => separated(a, c))) out.push(c);
  }
  return out;
}
export function pearlPoint(beasts: readonly SwarmBeast[], origin: SwarmPoint, bounds: SwarmBounds): SwarmPoint {
  if (beasts.length === 0) throw new Error("swarm: empty casts stay held");
  const h = rankClusters(beasts, origin, bounds, false)[0]!.medoid;
  const ground = beasts.filter((b) => !b.sky), centroid = ground.length > 0 ? ground : beasts;
  let gx = 0, gz = 0;
  for (const b of centroid) { gx += b.x; gz += b.z; }
  gx = mulDivSym(gx, 1, centroid.length); gz = mulDivSym(gz, 1, centroid.length);
  let dx = mulDivSym(gx - h.x, SWARM.pearl.pullNumerator, SWARM.pearl.pullDenominator);
  let dz = mulDivSym(gz - h.z, SWARM.pearl.pullNumerator, SWARM.pearl.pullDenominator);
  const pull = limitDisplacement(dx, dz, SWARM.pearl.maxPullMm);
  dx = pull.x; dz = pull.z;
  let x = inset(h.x + dx, bounds.minXMm, bounds.maxXMm, SWARM.pearl.insetMm);
  let z = inset(h.z + dz, bounds.minZMm, bounds.maxZMm, SWARM.pearl.insetMm);
  const range = limitDisplacement(x - origin.x, z - origin.z, SWARM.pearl.casterRangeMm);
  x = origin.x + range.x; z = origin.z + range.z;
  return { x, y: SWARM.pearl.yMm, z };
}
export function planSwarm(bounds: SwarmBounds, origin: SwarmPoint, snapshot: readonly SwarmBeast[]): SwarmPlan {
  const pearl = pearlPoint(snapshot, origin, bounds), clusters = rankClusters(snapshot, origin, bounds);
  const first = snapshot.some((b) => horizontalDistance(origin, b) <= SWARM.damage.releaseRadiusMm) ? null : clusters.slice().sort((a, b) => a.costMm - b.costMm || a.medoid.id - b.medoid.id)[0]!;
  const dragons: SwarmDragon[] = [];
  for (let i = 0; i < SWARM.dragons; i += 1) {
    const selected = pickTargets(clusters, i, first);
    const launchTick = SWARM.timing.launchTick + i * SWARM.timing.launchStride;
    let path: SwarmPath | null = null, chosen: SwarmCluster[] = [], waypoints: SwarmPoint[] = [];
    // Keep the explicit 2/1/0-target retry order, including identical empty-region attempts.
    for (const count of [2, 1, 0]) {
      chosen = selected.slice(0, count);
      waypoints = chosen.length === 0 ? [patrolPoint(i, bounds)] : chosen.map((c) => ({ x: c.medoid.x, y: c.medoid.sky ? c.medoid.y : SWARM.geometry.groundYMm, z: c.medoid.z }));
      path = steerRoute(origin, waypoints, pearl, bounds, i);
      // ceil(75 m / 16 m/s) makes dragon 4 end at F380. Retry that last 67 mm
      // of its optional route to keep both the exact timing formula and the F379 cap.
      if (path !== null && launchTick + Math.ceil(path.lengthMm * SWARM.timing.tickHz / SWARM.timing.speedMmPerSecond) + SWARM.timing.burstDelayTicks + SWARM.timing.aftermathTicks <= SWARM.timing.maxEndTick) break;
      path = null;
    }
    const fallback = path === null;
    if (path === null) { path = straightRoute(origin, pearl, i); chosen = []; waypoints = []; }
    const diveTick = launchTick + Math.ceil(path.lengthMm * SWARM.timing.tickHz / SWARM.timing.speedMmPerSecond);
    dragons.push({ index: i, ...path, targets: chosen, waypoints, launchTick, diveTick, fallback });
  }
  const burstTick = Math.max(...dragons.map((d) => d.diveTick)) + SWARM.timing.burstDelayTicks;
  return { origin, pearl, bounds, snapshot, dragons, burstTick, endTick: burstTick + SWARM.timing.aftermathTicks };
}

/** Fixed Int32 header offsets; following it are five [launch,dive,count,length,flags,xyz...] records. All positions are mm. */
export const SWARM_PACKET = {
  schema: 0, geometry: 1, tables: 2, castId: 3, seat: 4, slot: 5, castTick: 6,
  originX: 7, originY: 8, originZ: 9, pearlX: 10, pearlY: 11, pearlZ: 12,
  minX: 13, maxX: 14, minZ: 15, maxZ: 16, dragons: 17, bodyMm: 18, retractTicks: 19,
  speedMmPerSecond: 20, helixHorizontalMm: 21, helixVerticalMm: 22, helixWavelengthMm: 23,
  helixRiseMm: 24, helixFadeMm: 25, burstTick: 26, endTick: 27, flags: 28, checksum: 29,
  headerWords: 30, dragonHeaderWords: 5,
} as const;
export function swarmChecksum(packet: Int32Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < packet.length; i += 1) {
    let word = i === SWARM_PACKET.checksum ? 0 : packet[i]!;
    for (let b = 0; b < 4; b += 1) { hash = Math.imul(hash ^ (word & 255), 0x01000193); word >>>= 8; }
  }
  return hash | 0;
}
export function encodeSwarmCast(plan: SwarmPlan, castId: number, seat: number, castTick: number): SwarmCastV1 {
  const words = SWARM_PACKET.headerWords + plan.dragons.reduce((n, d) => n + SWARM_PACKET.dragonHeaderWords + d.samples.length, 0);
  if (words * Int32Array.BYTES_PER_ELEMENT > SWARM.packetMaxBytes) throw new Error("swarm: SwarmCastV1 exceeds 24 KiB");
  const p = plan.pearl, c = plan.origin, f = plan.bounds, t = SWARM.timing, h = SWARM.helix;
  const packet = new Int32Array(words);
  packet.set([SWARM.versions.schema, SWARM.versions.geometry, SWARM_TABLE_VERSION, castId, seat, 2, castTick, c.x, c.y, c.z, p.x, p.y, p.z, f.minXMm, f.maxXMm, f.minZMm, f.maxZMm, SWARM.dragons, SWARM.bodyMm, t.retractTicks, t.speedMmPerSecond, h.horizontalMm, h.verticalMm, h.wavelengthMm, h.riseMm, h.fadeMm, plan.burstTick, plan.endTick, plan.dragons.some((d) => d.fallback) ? 1 : 0, 0]);
  let offset = SWARM_PACKET.headerWords;
  for (const d of plan.dragons) {
    packet.set([d.launchTick, d.diveTick, d.samples.length / 3, d.lengthMm, d.fallback ? 1 : 0], offset);
    offset += SWARM_PACKET.dragonHeaderWords;
    packet.set(d.samples, offset); offset += d.samples.length;
  }
  packet[SWARM_PACKET.checksum] = swarmChecksum(packet);
  return packet;
}

/** Body occupies fixed C(s), hidden before launch; the tail travels 16 m in the 30-tick retraction. */
export function swarmBodyAt(dragon: SwarmDragon, tick: number): { visible: boolean; headMm: number; tailMm: number } {
  if (tick < dragon.launchTick) return { visible: false, headMm: 0, tailMm: 0 };
  const headMm = Math.min(dragon.lengthMm, Math.floor((tick - dragon.launchTick) * SWARM.timing.speedMmPerSecond / SWARM.timing.tickHz));
  const tailMm = tick < dragon.diveTick ? Math.max(0, headMm - SWARM.bodyMm) : Math.max(0, dragon.lengthMm - SWARM.bodyMm + mulDiv(SWARM.bodyMm, Math.min(tick - dragon.diveTick, SWARM.timing.retractTicks), SWARM.timing.retractTicks));
  return { visible: tick < dragon.diveTick + SWARM.timing.retractTicks, headMm, tailMm: Math.min(headMm, tailMm) };
}

function castEvent(world: World, cast: SwarmCast, stage: "swarm-cast" | "swarm-burst" | "swarm-end"): void {
  emit(world, { type: "skill-fx", seat: cast.seat, skill: kiemSkill(2).id, stage, castId: cast.castId, x: cast.origin.x / 1000, z: cast.origin.z / 1000, toX: cast.pearl.x / 1000, toZ: cast.pearl.z / 1000, count: SWARM.dragons, ...(stage === "swarm-cast" ? { swarm: cast.packet } : {}) });
}
export function resolveSwarm(world: World, cast: Cast): boolean {
  const state = world.skills.swarm;
  if (state === undefined) return false;
  const snapshot = swarmSnapshot(world);
  if (snapshot.length === 0) return false;
  const f = world.stage.field;
  const bounds: SwarmBounds = { minXMm: f.minXMm, maxXMm: f.maxXMm, minZMm: f.minZMm, maxZMm: f.maxZMm };
  const plan = planSwarm(bounds, { x: mm(cast.origin.x), y: SWARM.geometry.groundYMm, z: mm(cast.origin.z) }, snapshot);
  const live: SwarmCast = { castId: cast.actionId, seat: cast.seat, startTick: world.tick, ...plan, packet: encodeSwarmCast(plan, cast.actionId, cast.seat, world.tick) };
  state.casts.push(live); castEvent(world, live, "swarm-cast");
  return true;
}
export function stepSwarm(world: World): void {
  const state = world.skills.swarm;
  if (state === undefined) return;
  let keep = 0;
  for (const cast of state.casts) {
    const tick = world.tick - cast.startTick;
    if (tick === cast.burstTick) castEvent(world, cast, "swarm-burst");
    if (tick === cast.endTick) castEvent(world, cast, "swarm-end");
    if (tick < cast.endTick) state.casts[keep++] = cast;
  }
  state.casts.length = keep;
}
