/**
 * Right-click pathfinding on the 0.5 m grid (canon §5.1, §9.1).
 * Owner: Lane 2. TODO(lane-2): copy games/typing-defense/src/sim/nav/{grid,astar,connectivity}.ts with `// Source:` headers.
 */
import type { PointU, StageDef } from "../content/types";

export interface NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellU: number;
}

const todo = (name: string): never => {
  throw new Error("TODO(lane-2): local/nav.ts " + name);
};

export function createNavGrid(_stage: StageDef): NavGrid {
  return todo("createNavGrid");
}

/** Waypoints (u) from `from` to the nearest walkable point of `to`; empty when unreachable. */
export function findPath(_grid: NavGrid, _from: PointU, _to: PointU): PointU[] {
  return todo("findPath");
}
