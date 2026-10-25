/**
 * Targets (canon §10.1, §23.3, D07): beasts aim only at the heart, nodes,
 * gates, bots, taunt points or a telegraphed ground zone, never a real
 * player (TargetRef has no player kind; at M0a every seat is human, so no bot
 * either). Shared queries: "nearest the heart" (ground beasts by flow-field
 * distance, flyers straight; ties: smaller beastId = serial) and "densest
 * cluster in r" (score = W inside the skill radius; ties: nearer the heart,
 * then smaller beastId). Also the species lookups the other beast files share.
 * Owner: Lane 5.
 */
import { BITE_ONLY, BEASTS, GENERALS, type BeastActDef } from "../content/data/beasts";
import { BOSSES } from "../content/data/boss";
import { ELITE_TRAITS } from "../content/data/elites";
import { ELITES } from "../content/rules";
import type { BeastDef, BeastState, EliteTraitId, NodeId, NodeState, PointU, SpeciesId, TargetRef, World } from "../content/types";
import { heartDistance } from "./field";
import { dist2, isqrt, mmToU, within } from "./fixed";

const HEART: PointU = { x: 0, z: 0 };

/** Every species def by id (one Map: the hot loops look a species up several times a tick). */
const DEFS: ReadonlyMap<string, BeastDef> = new Map<string, BeastDef>([...Object.values(BEASTS), ...Object.values(GENERALS), ...Object.values(BOSSES)].map((def) => [def.id, def]));

export function speciesDef(species: SpeciesId): BeastDef {
  const def = DEFS.get(species);
  if (def === undefined) throw new Error("beasts: no species " + species);
  return def;
}

export function actOf(species: SpeciesId): BeastActDef {
  return speciesDef(species).act ?? BITE_ONLY;
}

/** W × 100 of a species at K0 Cân bằng; an elite is W × 1.6 + its trait's extra W (canon §10.3, §13.3 wave sums). */
export function speciesW100(species: SpeciesId, elite: EliteTraitId | null): number {
  const w100 = speciesDef(species).w100;
  if (elite === null) return w100;
  return Math.round((w100 * ELITES.wPm) / 1000) + ELITE_TRAITS[elite].extraW100;
}

/** The node beasts aim at (solo: the Tâm nhãn), or null on a stage without one. */
export function aimNode(world: World): { readonly id: NodeId; readonly at: PointU } | null {
  return world.formation.nodes[0] ?? null;
}

/** The node a capturer may take (canon §8.2): free, held by a beast now gone, or already its own; null otherwise. */
export function capturableNode(world: World, beast: BeastState): NodeState | null {
  const node = world.formation.nodes[0];
  if (node === undefined) return null;
  const by = node.capturedBy;
  if (by === null) return node;
  const holder = world.beasts.list[by.slot];
  const alive = holder !== undefined && holder.alive && holder.serial === by.serial;
  return !alive || holder === beast ? node : null;
}

export function heartPoint(): PointU {
  return HEART;
}

/** Where a target sits on the ground (the heart centre, the node point, …). */
export function targetPoint(world: World, target: TargetRef): PointU {
  switch (target.kind) {
    case "node":
      return world.formation.nodes.find((node) => node.id === target.node)?.at ?? HEART;
    case "pillar":
      return world.formation.pillars.find((pillar) => pillar.id === target.pillar)?.at ?? HEART;
    case "gate": {
      const gate = world.stage.field.gates.find((g) => g.id === target.gate);
      return gate ? { x: mmToU(gate.at.xMm), z: mmToU(gate.at.zMm) } : HEART;
    }
    case "zone": {
      const t = world.telegraphs.active.find((active) => active.id === target.telegraph);
      return t ? t.to : HEART;
    }
    default:
      // heart; bots and taunt points are M1 (no position in the world at M0a).
      return HEART;
  }
}

/** What `beast` attacks now; never a real player (canon §10.1). */
export function chooseTarget(world: World, beast: BeastState): TargetRef {
  const node = aimNode(world);
  if (beast.boss) return world.boss.phase <= 1 && node !== null ? { kind: "node", node: node.id } : { kind: "heart" };
  const act = actOf(beast.species);
  if (act.aim === "alternate" && node !== null && beast.serial % 2 === 1) return { kind: "node", node: node.id };
  return { kind: "heart" };
}

/** Straight distance in u. */
export function straightDistance(ax: number, az: number, bx: number, bz: number): number {
  return isqrt(dist2(ax, az, bx, bz));
}

// "How far from the heart" is field.ts heartDistance, the one measure of canon §23.3 (part A fixes).

/** a is nearer the heart than b (ties: smaller beastId). */
function nearer(a: BeastState, aDist: number, b: BeastState | null, bDist: number): boolean {
  if (b === null) return true;
  if (aDist !== bDist) return aDist < bDist;
  return a.serial < b.serial;
}

/** The live beast nearest the heart within `rangeU` of `from` (ô 1, đánh nền), or null. */
export function nearestToHeart(world: World, from: PointU, rangeU: number): BeastState | null {
  let best: BeastState | null = null;
  let bestDist = 0;
  for (const beast of world.beasts.list) {
    if (!beast.alive || !within(beast.x, beast.z, from.x, from.z, rangeU)) continue;
    const d = heartDistance(world, beast);
    if (nearer(beast, d, best, bestDist)) {
      best = beast;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Centre of the densest cluster within `rangeU` of `from` for a skill of radius
 * `radiusU` (ô 4, ô 5, Lôi Hỏa Phù), or null: candidates are live beasts in
 * range; score = W inside the radius; ties: nearer the heart, then smaller beastId.
 */
export function densestPoint(world: World, from: PointU, rangeU: number, radiusU: number): PointU | null {
  const live = world.beasts.list.filter((beast) => beast.alive);
  let best: BeastState | null = null;
  let bestScore = -1;
  let bestHeart = 0;
  for (const candidate of live) {
    if (!within(candidate.x, candidate.z, from.x, from.z, rangeU)) continue;
    let score = 0;
    for (const other of live) if (within(other.x, other.z, candidate.x, candidate.z, radiusU)) score += speciesW100(other.species, other.elite);
    const heart = straightDistance(candidate.x, candidate.z, 0, 0);
    const better = score > bestScore || (score === bestScore && (heart < bestHeart || (heart === bestHeart && best !== null && candidate.serial < best.serial)));
    if (better) {
      best = candidate;
      bestScore = score;
      bestHeart = heart;
    }
  }
  return best === null ? null : { x: best.x, z: best.z };
}
