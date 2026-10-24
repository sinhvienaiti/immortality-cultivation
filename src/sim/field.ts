/**
 * Flow fields (canon §8.1): one per ground gate on a 0.5 m grid (80 × 52)
 * towards the heart, around the Trận Trụ; integer BFS; rebuilt only when an
 * obstacle changes. The sky route is a straight line with a dive point.
 * Ground beasts walk readable corridors, never forced into narrow lanes.
 * Owner: Lane 2. TODO(lane-2).
 */
import type { BeastState, FieldRuntime, GateId, StageDef, World } from "../content/types";

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): sim/field.ts " + name);
};

export function createField(_stage: StageDef): FieldRuntime {
  return todo("createField");
}

/** Moves a ground beast one tick along its gate's field (slows already applied by the caller). */
export function fieldStep(_world: World, _beast: BeastState): void {
  todo("fieldStep");
}

/** Path distance from a cell to the heart along `gate`'s field, u ("nearest to the heart", canon §23.3). */
export function fieldDistance(_world: World, _gate: GateId, _cell: number): number {
  return todo("fieldDistance");
}

/** Rebuilds the fields after an obstacle change (bumps `field.version`). */
export function rebuildField(_world: World): void {
  todo("rebuildField");
}
