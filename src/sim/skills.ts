/**
 * Kiếm skills (canon §12.1, data/school-kiem.ts): ô 1 damage once a word then
 * split over 3 swords (rest on the last), bands ≤ 2, pierce; ô 2 line 2.5 W
 * first beast −15 % each next (floor 40 %), Thế −20; ô 3 Hộ thân (wards.ts)
 * or thân pháp (`local`); ô 4 zone, 4 W cap a cast over all beasts; ô 5 three
 * volleys; Kiếm Tâm, Tích Kiếm; hit ticks +6/+36/+66, +12, +12 then every 30,
 * +30/+75/+120; ground skills at `aim`, else the densest cluster in range
 * (canon §23.3 ties).
 * Owner: Lane 4. TODO(lane-4).
 */
import type { Cast, SkillsState, World, WorldInit } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-4): sim/skills.ts " + name);
};

export function createSkillsState(_init: WorldInit): SkillsState {
  return todo("createSkillsState");
}

/** Finds the Cast's target and schedules its hits; false when there is no valid target (the Cast stays held). */
export function resolveCast(_world: World, _cast: Cast): boolean {
  return todo("resolveCast");
}

/** Lands strikes due this tick, beats zones, cools slots down. */
export function stepSkills(_world: World): void {
  todo("stepSkills");
}
