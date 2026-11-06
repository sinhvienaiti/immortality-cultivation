/** Qi dragon swarm: deterministic routes, live-body collisions and three damage channels. */
import { SWARM } from "../content/data/swarm";
import { kiemSkill } from "../content/data/school-kiem";
import { DAMAGE } from "../content/rules";
import type { BeastState, Cast, Grade, SwarmCastV1, World } from "../content/types";
import { areaClusterLeft, createAreaHit, damageBeast, scaleHit, wHpOf, type AreaHit } from "./combat";
import { emit } from "./events";
import { clamp, mulDiv, mulDivSym, U_PER_MM } from "./fixed";
import { damageImmune, isBroken } from "./posture";
import { speciesDef } from "./targeting";
import { horizontalDistance, inset, pointAt, steerRoute, straightRoute, SWARM_TABLE_VERSION, type SwarmBounds, type SwarmPath, type SwarmPoint } from "./swarm-geometry";

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
export type SwarmPhase = "release" | "touch" | "burst";
export interface SwarmChannel { allocated: number; potential: number; dealt: number; capped: number; overkill: number; immune: number }
export interface SwarmCast extends SwarmPlan {
  readonly castId: number; readonly seat: number; readonly startTick: number; readonly packet: SwarmCastV1;
  readonly grade: Grade; readonly area: AreaHit;
  readonly victims: Map<number, { dealt: number; touched: boolean; hits: number }>;
  readonly channels: Record<SwarmPhase, SwarmChannel>;
  firstHitTick: number;
}
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
export function swarmSnapshot(world: World, includeImmune = false): SwarmBeast[] {
  const f = world.stage.field;
  return world.beasts.list.filter((b) => b.alive && (includeImmune || !damageImmune(world, b)) && b.x >= f.minXMm * U_PER_MM && b.x <= f.maxXMm * U_PER_MM && b.z >= f.minZMm * U_PER_MM && b.z <= f.maxZMm * U_PER_MM)
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

/** Largest remainders, with a one-HP floor for the whole-field burst only. */
export function splitSwarmPool(pool: number, victims: readonly { id: number; weight: number }[]): { id: number; amount: number }[] {
  if (victims.length === 0) return [];
  const budget = Math.max(pool, victims.length), left = budget - victims.length;
  const weight = victims.reduce((sum, b) => sum + b.weight, 0);
  const rows = victims.map((b) => ({ id: b.id, amount: 1 + Math.floor(left * b.weight / weight), remainder: left * b.weight % weight }));
  let spare = budget - rows.reduce((sum, b) => sum + b.amount, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (let i = 0; spare > 0; i += 1, spare -= 1) rows[i]!.amount += 1;
  return rows.sort((a, b) => a.id - b.id).map(({ id, amount }) => ({ id, amount }));
}

/** q is the maximum axis fraction along P→beast; no ray intersection or floating state. */
export function swarmWeight(point: SwarmPoint, pearl: SwarmPoint, bounds: SwarmBounds): number {
  const dx = point.x - pearl.x, dz = point.z - pearl.z;
  const edgeX = dx >= 0 ? bounds.maxXMm - pearl.x : pearl.x - bounds.minXMm;
  const edgeZ = dz >= 0 ? bounds.maxZMm - pearl.z : pearl.z - bounds.minZMm;
  const qx = dx === 0 ? 0 : edgeX <= 0 ? 1000 : Math.floor(Math.abs(dx) * 1000 / edgeX);
  const qz = dz === 0 ? 0 : edgeZ <= 0 ? 1000 : Math.floor(Math.abs(dz) * 1000 / edgeZ);
  const q = clamp(Math.max(qx, qz), 0, 1000);
  return 1000 - Math.floor((1000 - SWARM.damage.boundaryWeightPm) * q / 1000);
}

function sampleAtArc(dragon: SwarmDragon, index: number, arc: number): SwarmPoint {
  const a = pointAt(dragon.samples, index), b = pointAt(dragon.samples, index + 1);
  const length = dragon.arc[index + 1]! - dragon.arc[index]!;
  if (length <= 0) return a;
  const along = clamp(arc - dragon.arc[index]!, 0, length);
  if (along === 0) return a;
  if (along === length) return b;
  return { x: a.x + mulDivSym(b.x - a.x, along, length), y: a.y + mulDivSym(b.y - a.y, along, length), z: a.z + mulDivSym(b.z - a.z, along, length) };
}
function occupiedSegments(dragon: SwarmDragon, tick: number): { a: SwarmPoint; b: SwarmPoint }[] {
  const body = swarmBodyAt(dragon, tick);
  if (!body.visible) return [];
  const out: { a: SwarmPoint; b: SwarmPoint }[] = [];
  if (dragon.arc.length === 1) return [{ a: pointAt(dragon.samples, 0), b: pointAt(dragon.samples, 0) }];
  let first = 0, high = dragon.arc.length - 1;
  while (first < high) {
    const mid = Math.floor((first + high) / 2);
    if (dragon.arc[mid + 1]! < body.tailMm) first = mid + 1; else high = mid;
  }
  for (let i = first; i + 1 < dragon.arc.length && dragon.arc[i]! <= body.headMm; i += 1) {
    if (dragon.arc[i + 1]! < body.tailMm || dragon.arc[i]! > body.headMm) continue;
    out.push({ a: sampleAtArc(dragon, i, Math.max(body.tailMm, dragon.arc[i]!)), b: sampleAtArc(dragon, i, Math.min(body.headMm, dragon.arc[i + 1]!)) });
  }
  return out;
}
function inCapsule(p: SwarmPoint, a: SwarmPoint, b: SwarmPoint, radius: number): boolean {
  if (p.x < Math.min(a.x, b.x) - radius || p.x > Math.max(a.x, b.x) + radius || p.y < Math.min(a.y, b.y) - radius || p.y > Math.max(a.y, b.y) + radius || p.z < Math.min(a.z, b.z) - radius || p.z > Math.max(a.z, b.z) + radius) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
  const length2 = dx * dx + dy * dy + dz * dz, dot = px * dx + py * dy + pz * dz;
  const radius2 = radius * radius;
  if (dot <= 0 || length2 === 0) return px * px + py * py + pz * pz <= radius2;
  if (dot >= length2) return (p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y) + (p.z - b.z) * (p.z - b.z) <= radius2;
  // Cross product avoids subtracting two almost equal products near the capsule's axis.
  const x = py * dz - pz * dy, y = pz * dx - px * dz, z = px * dy - py * dx;
  const lhs = x * x + y * y + z * z, rhs = radius2 * length2;
  if (Number.isSafeInteger(lhs) && Number.isSafeInteger(rhs)) return lhs <= rhs;
  return BigInt(x) * BigInt(x) + BigInt(y) * BigInt(y) + BigInt(z) * BigInt(z) <= BigInt(radius2) * BigInt(length2);
}
export function swarmTouches(dragon: SwarmDragon, tick: number, point: SwarmPoint, hurtboxMm: number): boolean {
  return occupiedSegments(dragon, tick).some(({ a, b }) => inCapsule(point, a, b, SWARM.damage.bodyRadiusMm + hurtboxMm));
}

/** The sim has no separate beast hitbox: use its authored body dimensions, centred above its feet. */
function hurtbox(beast: BeastState): { point: SwarmPoint; radius: number } {
  const body = speciesDef(beast.species).placeholder;
  return { point: { x: mm(beast.x), y: mm(beast.y) + mulDiv(body.heightMm, 1, 2), z: mm(beast.z) }, radius: mulDiv(Math.max(body.widthMm, body.lengthMm), 1, 2) };
}
function channel(): SwarmChannel { return { allocated: 0, potential: 0, dealt: 0, capped: 0, overkill: 0, immune: 0 }; }
function poolHp(world: World, cast: SwarmCast, w100: number): number {
  return scaleHit(world, cast.seat, wHpOf(world, w100), cast.grade, "slot2", null);
}
function swarmHit(world: World, cast: SwarmCast, beast: BeastState, amount: number, phase: SwarmPhase, dragon?: number): void {
  const book = cast.victims.get(beast.serial) ?? { dealt: 0, touched: false, hits: 0 };
  if (phase === "touch") book.touched = true;
  cast.victims.set(beast.serial, book);
  const data = cast.channels[phase];
  data.allocated += amount;
  if (damageImmune(world, beast)) { data.immune += amount; return; }
  const potential = isBroken(world, beast) ? mulDiv(amount, DAMAGE.brokenPm, 1000) : amount;
  const cap = Math.max(0, wHpOf(world, beast.boss ? SWARM.damage.bossCapW100 : SWARM.damage.ordinaryCapW100) - book.dealt);
  const clusterLeft = beast.cluster < 0 ? potential : areaClusterLeft(world, cast.area, beast.cluster);
  const allowed = Math.min(potential, cap, clusterLeft);
  const dealt = damageBeast(world, beast, amount, "typed", { seat: cast.seat, source: "slot2", grade: cast.grade, scaled: true, area: cast.area, limit: cap, swarm: { castId: cast.castId, phase, ...(dragon === undefined ? {} : { dragon }) } });
  data.potential += potential; data.capped += potential - allowed; data.overkill += allowed - dealt; data.dealt += dealt;
  book.dealt += dealt;
  if (dealt > 0) { book.hits += 1; if (cast.firstHitTick < 0) cast.firstHitTick = world.tick - cast.startTick; }
}
function releaseSwarm(world: World, cast: SwarmCast): void {
  const radius = SWARM.damage.releaseRadiusMm;
  const victims = swarmSnapshot(world).filter((b) => (b.x - cast.origin.x) * (b.x - cast.origin.x) + (b.z - cast.origin.z) * (b.z - cast.origin.z) <= radius * radius);
  if (victims.length === 0) return;
  const pool = poolHp(world, cast, SWARM.damage.releaseW100), share = Math.floor(pool / victims.length), remainder = pool % victims.length;
  for (let i = 0; i < victims.length; i += 1) swarmHit(world, cast, world.beasts.list[victims[i]!.slot]!, share + (i < remainder ? 1 : 0), "release");
}
function burstSwarm(world: World, cast: SwarmCast): void {
  // The nuke snapshots the current living field, including late spawns, before any burst hit kills.
  const victims = swarmSnapshot(world, true), byId = new Map(victims.map((b) => [b.id, b]));
  const shares = splitSwarmPool(poolHp(world, cast, SWARM.damage.burstW100), victims.map((b) => ({ id: b.id, weight: swarmWeight(b, cast.pearl, cast.bounds) })));
  for (const share of shares) swarmHit(world, cast, world.beasts.list[byId.get(share.id)!.slot]!, share.amount, "burst");
}
interface GridBeast { readonly beast: BeastState; readonly point: SwarmPoint; readonly radius: number }
function touchGrid(world: World): { cells: Map<string, GridBeast[]>; radius: number } {
  const cells = new Map<string, GridBeast[]>();
  let radius = 0;
  for (const b of swarmSnapshot(world)) {
    const beast = world.beasts.list[b.slot]!, body = hurtbox(beast), key = Math.floor(body.point.x / SWARM.cellMm) + ":" + Math.floor(body.point.z / SWARM.cellMm);
    const entry = { beast, ...body }, cell = cells.get(key);
    if (cell === undefined) cells.set(key, [entry]); else cell.push(entry);
    radius = Math.max(radius, body.radius);
  }
  return { cells, radius };
}
function touchSwarm(world: World, cast: SwarmCast, tick: number, grid: ReturnType<typeof touchGrid>): void {
  for (const dragon of cast.dragons) {
    const segments = occupiedSegments(dragon, tick), candidates = new Map<number, GridBeast>();
    if (segments.length === 0) continue;
    const reach = SWARM.damage.bodyRadiusMm + grid.radius;
    let minX = Number.MAX_SAFE_INTEGER, maxX = -Number.MAX_SAFE_INTEGER;
    let minZ = Number.MAX_SAFE_INTEGER, maxZ = -Number.MAX_SAFE_INTEGER;
    for (const { a, b } of segments) {
      minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x);
      minZ = Math.min(minZ, a.z, b.z); maxZ = Math.max(maxZ, a.z, b.z);
    }
    // Query each broad-phase cell once for this body's bounding rectangle.
    const cellMinX = Math.floor((minX - reach) / SWARM.cellMm), cellMaxX = Math.floor((maxX + reach) / SWARM.cellMm);
    const cellMinZ = Math.floor((minZ - reach) / SWARM.cellMm), cellMaxZ = Math.floor((maxZ + reach) / SWARM.cellMm);
    for (let x = cellMinX; x <= cellMaxX; x += 1) for (let z = cellMinZ; z <= cellMaxZ; z += 1) {
      for (const b of grid.cells.get(x + ":" + z) ?? []) if (!cast.victims.get(b.beast.serial)?.touched) candidates.set(b.beast.serial, b);
    }
    const amount = poolHp(world, cast, SWARM.damage.touchW100);
    for (const b of Array.from(candidates.values()).sort((a, b) => a.beast.serial - b.beast.serial)) {
      if (!b.beast.alive || damageImmune(world, b.beast)) continue;
      if (segments.some(({ a, b: end }) => inCapsule(b.point, a, end, SWARM.damage.bodyRadiusMm + b.radius))) swarmHit(world, cast, b.beast, amount, "touch", dragon.index);
    }
  }
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
  const live: SwarmCast = { castId: cast.actionId, seat: cast.seat, startTick: world.tick, ...plan, packet: encodeSwarmCast(plan, cast.actionId, cast.seat, world.tick), grade: cast.quality, area: createAreaHit(), victims: new Map(), channels: { release: channel(), touch: channel(), burst: channel() }, firstHitTick: -1 };
  state.casts.push(live); castEvent(world, live, "swarm-cast");
  return true;
}
export function stepSwarm(world: World): void {
  const state = world.skills.swarm;
  if (state === undefined || state.casts.length === 0) return;
  const grid = touchGrid(world);
  let keep = 0;
  for (const cast of state.casts) {
    const tick = world.tick - cast.startTick;
    if (tick === SWARM.timing.releaseTick) releaseSwarm(world, cast);
    touchSwarm(world, cast, tick, grid);
    if (tick === cast.burstTick) { castEvent(world, cast, "swarm-burst"); burstSwarm(world, cast); }
    if (tick === cast.endTick) castEvent(world, cast, "swarm-end");
    if (tick < cast.endTick) state.casts[keep++] = cast;
  }
  state.casts.length = keep;
}
