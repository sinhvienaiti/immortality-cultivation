/**
 * Targets (canon §10.1, §23.3, D07): beasts aim only at the heart, nodes,
 * gates, bots, taunt points or a telegraphed ground zone, never a real
 * player. Shared queries: "nearest the heart" (ground beasts by flow-field
 * distance, flyers straight; ties: smaller beastId) and "densest cluster in r"
 * (score = W inside the skill radius; ties: nearer the heart, then smaller beastId).
 * Owner: Lane 5. TODO(lane-5).
 */
import type { BeastState, PointU, TargetRef, World } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-5): sim/targeting.ts " + name);
};

/** What `beast` attacks now; never a real player. */
export function chooseTarget(_world: World, _beast: BeastState): TargetRef | null {
  return todo("chooseTarget");
}

/** The live beast nearest the heart within `rangeU` of `from` (ô 1, đánh nền), or null. */
export function nearestToHeart(_world: World, _from: PointU, _rangeU: number): BeastState | null {
  return todo("nearestToHeart");
}

/** Centre of the densest cluster within `rangeU` of `from` for a skill of radius `radiusU` (ô 4, ô 5, Lôi Hỏa Phù), or null. */
export function densestPoint(_world: World, _from: PointU, _rangeU: number, _radiusU: number): PointU | null {
  return todo("densestPoint");
}
