/**
 * Constant pressure (canon §10.8): bites at the heart edge (swarm 1, small 2,
 * medium 4 a second, carried below one HP), Nham Viên throws every 3 s (a
 * Trận Trụ on the throw line, intact or cracked, blocks the rock: integer
 * segment test), Hỏa Nha dives (from the air: pillars do not block), Thiết
 * Giáp Trư rams the heart (an intact Trận Trụ on the line stops it) and then
 * captures the Tâm nhãn; × g(K) × preset damage, half up each step. A strike
 * on a node point inside a `ward` loses its Trận Lực part and takes one
 * charge; a line strike whose line a `ward` ring crosses at the strike tick
 * loses half (canon §9.1, §12.1). A beast held or broken at its strike tick
 * loses the strike (Phong Ấn Võng answers the Trư and the dive). Players are
 * `local`'s part (D34): the strike event carries the shape.
 * Owner: Lane 5.
 */
import { SUMMON_TELEGRAPHS } from "../content/data/telegraphs";
import { PRESETS, PRESSURE, SIM } from "../content/rules";
import type { ActiveTelegraph, BeastState, PointU, TelegraphDef, World } from "../content/types";
import { atHeartEdge, attackPoint } from "./beasts";
import { isqrt, mmToU, msToTicks, within } from "./fixed";
import { damageFormation, occupyNode, pillarOnSegment } from "./formation";
import { isBroken } from "./posture";
import { actOf, capturableNode, speciesDef, straightDistance } from "./targeting";
import { cancelTelegraph, dueTelegraphs, strikeTelegraph, telegraph, telegraphDef, touchesHeart } from "./telegraph";
import { useWard, wardAt, wardCrosses } from "./wards";
import { beastAt } from "./world";

/** Beast damage on the heart and on players × g(K) × preset (canon §10.8, §13.4), half up after each factor. */
export function beastDamage(world: World, base: number): number {
  return Math.round((Math.round((base * world.gPm) / 1000) * PRESETS[world.preset].damagePm) / 1000);
}

/** Held (root, stun) or broken: no new attack, and a non-boss beast loses the strike it was winding up. */
export function controlled(world: World, beast: BeastState): boolean {
  return beast.hardUntil > world.tick || isBroken(world, beast);
}

/** The first seat whose ward covers `point` blocks it: one charge less; true when blocked. */
export function wardShields(world: World, point: PointU): boolean {
  for (const seat of world.seats) {
    const ward = wardAt(world, seat.seat);
    if (ward === null || ward.charges <= 0 || !within(point.x, point.z, ward.origin.x, ward.origin.z, ward.radius)) continue;
    useWard(world, { type: "ward-use", seat: seat.seat, wardId: ward.wardId });
    return true;
  }
  return false;
}

/** The first seat whose ward ring crosses the line a–b at this tick halves the strike: one charge less; true when it does. */
export function wardHalves(world: World, a: PointU, b: PointU): boolean {
  for (const seat of world.seats) {
    if (!wardCrosses(world, seat.seat, a, b)) continue;
    const ward = wardAt(world, seat.seat);
    if (ward !== null) useWard(world, { type: "ward-use", seat: seat.seat, wardId: ward.wardId });
    return true;
  }
  return false;
}

/**
 * Where a ram along a → b first meets the circle (center, radiusU): a Trận Trụ
 * stops it there. A line that only grazes the circle stops at its nearest
 * point to the centre; a ram that starts inside stops at once.
 */
export function lineImpact(a: PointU, b: PointU, center: PointU, radiusU: number): PointU {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = isqrt(dx * dx + dz * dz);
  const cx = center.x - a.x;
  const cz = center.z - a.z;
  if (len === 0 || cx * cx + cz * cz <= radiusU * radiusU) return { x: a.x, z: a.z };
  const along = Math.floor((cx * dx + cz * dz) / len);
  const perp2 = Math.max(0, cx * cx + cz * cz - along * along);
  const inside = radiusU * radiusU - perp2;
  const stop = Math.min(len, Math.max(0, inside > 0 ? along - isqrt(inside) : along));
  return { x: a.x + Math.round((dx * stop) / len), z: a.z + Math.round((dz * stop) / len) };
}

/** The heart-edge point under a beast's approach (the end of a ram or charge line). */
export function heartEdgeToward(from: PointU): PointU {
  const edge = mmToU(PRESSURE.heartEdgeMm);
  const d = straightDistance(from.x, from.z, 0, 0);
  if (d === 0) return { x: 0, z: edge };
  return { x: Math.round((from.x * edge) / d), z: Math.round((from.z * edge) / d) };
}

function resolveRam(world: World, t: ActiveTelegraph, beast: BeastState, def: TelegraphDef): void {
  const pillar = pillarOnSegment(world, t.from, t.to);
  if (pillar !== null && !pillar.cracked) {
    // The Trận Trụ stops it short: no Trận Lực lost (only the Vương's rams wear a pillar down).
    const impact = lineImpact(t.from, t.to, pillar.at, pillar.radiusU);
    strikeTelegraph(world, t, impact);
    beast.x = impact.x;
    beast.z = impact.z;
    beast.cell = -1;
    return;
  }
  strikeTelegraph(world, t);
  let amount = beastDamage(world, def.strike.formation);
  if (wardHalves(world, t.from, t.to)) amount = Math.round(amount / 2);
  if (amount > 0) damageFormation(world, amount, beast.species + ":ram");
  beast.x = t.to.x;
  beast.z = t.to.z;
  beast.cell = -1;
  if (speciesDef(beast.species).capturesNodes) {
    const node = capturableNode(world, beast);
    if (node !== null) beast.target = { kind: "node", node: node.id };
  }
}

function resolveBeastAttack(world: World, t: ActiveTelegraph, beast: BeastState): void {
  const act = actOf(beast.species);
  if (controlled(world, beast)) return cancelTelegraph(world, t.id);
  const def = telegraphDef(t.def);
  if (def.shape === "line") return resolveRam(world, t, beast, def);
  // A rock flies from the thrower to the centre; any Trận Trụ on the way stops it (cracked ones too).
  if (!speciesDef(beast.species).flying && pillarOnSegment(world, { x: beast.x, z: beast.z }, t.from) !== null) return cancelTelegraph(world, t.id);
  strikeTelegraph(world, t);
  if (def.strike.formation <= 0 || !touchesHeart(t)) return;
  if (t.def === act.nodeAttack && wardShields(world, t.from)) return;
  damageFormation(world, beastDamage(world, def.strike.formation), beast.species + (speciesDef(beast.species).flying ? ":dive" : ":throw"));
}

/** Bites once a second at the heart edge; below one HP is carried to the next bite. */
function bite(world: World, beast: BeastState): void {
  const def = speciesDef(beast.species);
  if (def.bitePerS <= 0 || def.flying || !atHeartEdge(beast)) return;
  if (beast.attackAt < 0) {
    beast.attackAt = world.tick + SIM.tickHz;
    return;
  }
  if (world.tick < beast.attackAt) return;
  beast.attackAt = world.tick + SIM.tickHz;
  const carried = (beast.biteCarryPm ?? 0) + Math.round((def.bitePerS * world.gPm * PRESETS[world.preset].damagePm) / 1000);
  const amount = Math.floor(carried / 1000);
  beast.biteCarryPm = carried - amount * 1000;
  if (amount > 0) damageFormation(world, amount, beast.species + ":bite");
}

/** Starts a throw, dive or ram when in range and ready; the next may start `everyMs` after this one started. */
function startAttack(world: World, beast: BeastState): void {
  const act = actOf(beast.species);
  const target = beast.target;
  if (target === null || (act.heartAttack === null && act.nodeAttack === null)) return;
  if (beast.attackAt >= 0 && world.tick < beast.attackAt) return;
  const def = speciesDef(beast.species);
  const from: PointU = { x: beast.x, z: beast.z };
  const ref = { slot: beast.slot, serial: beast.serial };
  if (def.capturesNodes) {
    // The Trư rams the heart once it is within range and outside the edge.
    if (target.kind !== "heart" || act.heartAttack === null) return;
    if (atHeartEdge(beast) || straightDistance(beast.x, beast.z, 0, 0) > mmToU(act.rangeMm)) return;
    beast.telegraph = telegraph(world, telegraphDef(act.heartAttack), ref, from, heartEdgeToward(from)).id;
    beast.mode = "ram";
  } else {
    const id = target.kind === "node" ? act.nodeAttack : act.heartAttack;
    if (id === null) return;
    const point = attackPoint(world, beast);
    if (!within(beast.x, beast.z, point.x, point.z, mmToU(act.rangeMm))) return;
    beast.telegraph = telegraph(world, telegraphDef(id), ref, point, point).id;
    beast.mode = def.flying ? "dive" : "throw";
  }
  beast.attackAt = world.tick + msToTicks(act.everyMs);
}

/** A capturer standing on the node point keeps it occupied (formation.ts times the 3 s); taken by another beast: back to the heart. */
function capture(world: World, beast: BeastState): void {
  if (beast.mode !== "capture" || beast.target === null || beast.target.kind !== "node") return;
  const node = capturableNode(world, beast);
  if (node === null) {
    beast.target = { kind: "heart" };
    return;
  }
  const own = node.capturedBy !== null && node.capturedBy.slot === beast.slot && node.capturedBy.serial === beast.serial;
  if (!own || node.on) occupyNode(world, beast, node.id);
}

/** Resolves due beast strikes, then bites, captures and starts new attacks. The Vương and summons are boss.ts. */
export function stepBeastAttacks(world: World): void {
  if (world.phase === "victory" || world.phase === "defeat") return;
  for (const t of dueTelegraphs(world)) {
    if (t.source === null || SUMMON_TELEGRAPHS.includes(t.def)) continue;
    const beast = beastAt(world, t.source);
    if (beast === null || beast.boss) continue;
    resolveBeastAttack(world, t, beast);
  }
  for (const beast of world.beasts.list) {
    if (!beast.alive || beast.boss || controlled(world, beast) || beast.telegraph >= 0) continue;
    if (beast.mode === "roar" && beast.modeUntil > world.tick) continue;
    bite(world, beast);
    capture(world, beast);
    startAttack(world, beast);
  }
}
