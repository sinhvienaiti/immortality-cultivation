// Source: games/typing-defense/src/sim/nav/astar.ts @43994b2 (with grid.ts, connectivity.ts) (adapted: the 0.5 m grid of sim/field.ts in u, integer centres and lines, the player's 0.4 m clearance)
/**
 * Right-click pathfinding on the 0.5 m grid (canon §5.1, §9.1): A* with
 * whole-number costs (10 straight, 14 diagonal, no corner cutting), the
 * octile estimate, ties to the smaller f, then the smaller h, then the
 * smaller cell; a binary heap on arrays allocated once per grid size, so a
 * search allocates nothing. The cell path is pulled tight by line of sight.
 * Cells are blocked by terrain and the Trận Trụ grown by the player's radius;
 * beasts never block (the player walks through them, canon §9.1).
 * Owner: Lane 2.
 */
import { PLAYER } from "../content/rules";
import type { PointU, StageDef } from "../content/types";
import { STEPS, blockedCells, cellAt, cellCenterX, cellCenterZ, clearLine, gridGeometry, type Grid } from "../sim/field";
import { clamp, dist2, mmToU } from "../sim/fixed";

export interface NavGrid extends Grid {
  /** Where the player's centre may stand (the field less its radius), u. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const grids = new WeakMap<StageDef, NavGrid>();

export function createNavGrid(stage: StageDef): NavGrid {
  const hit = grids.get(stage);
  if (hit) return hit;
  const g = gridGeometry(stage);
  const r = mmToU(PLAYER.radiusMm);
  const f = stage.field;
  const grid: NavGrid = {
    cols: g.cols,
    rows: g.rows,
    cellU: g.cellU,
    minXU: g.minXU,
    minZU: g.minZU,
    blocked: blockedCells(stage, PLAYER.radiusMm),
    minX: mmToU(f.minXMm) + r,
    maxX: mmToU(f.maxXMm) - r,
    minZ: mmToU(f.minZMm) + r,
    maxZ: mmToU(f.maxZMm) - r,
  };
  grids.set(stage, grid);
  return grid;
}

/** A step from `cell` by (dx, dz) lands on an open cell (or on `pass`) without cutting a corner. */
function openFrom(grid: Grid, cell: number, dx: number, dz: number, pass: number): boolean {
  const col = (cell % grid.cols) + dx;
  const row = Math.floor(cell / grid.cols) + dz;
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const next = row * grid.cols + col;
  if (grid.blocked[next] !== 0 && next !== pass) return false;
  return dx === 0 || dz === 0 || (grid.blocked[cell + dx] === 0 && grid.blocked[cell + dz * grid.cols] === 0);
}

let g = new Int32Array(0);
let parent = new Int32Array(0);
let opened = new Uint32Array(0);
let closed = new Uint32Array(0);
let heap = new Float64Array(0);
let cells = new Int32Array(0);
let search = 0;

/** Octile distance in cost units from `cell` to (col, row). */
function estimate(cell: number, cols: number, col: number, row: number): number {
  const dx = Math.abs((cell % cols) - col);
  const dz = Math.abs(Math.floor(cell / cols) - row);
  return 10 * (dx + dz) - 6 * Math.min(dx, dz);
}

/** f, then h, then the cell, as one exact integer: f < 2^20, h < 2^11, cell < 2^14. */
const key = (f: number, h: number, cell: number): number => (f * 2048 + h) * 16_384 + cell;

/**
 * Writes the cells from `start` to `goal` into `out` and returns how many (0: no way). It searches from the
 * goal, so parents read from the start walk forward; the start may be blocked (a body always leaves the cell it stands on).
 */
export function astar(grid: Grid, start: number, goal: number, out: Int32Array): number {
  const total = grid.cols * grid.rows;
  if (total > 16_384) throw new Error("nav: heap keys hold 14 cell bits, " + total + " cells asked");
  if (g.length !== total) {
    [g, parent, opened, closed] = [new Int32Array(total), new Int32Array(total), new Uint32Array(total), new Uint32Array(total)];
    heap = new Float64Array(total * 8 + 1);
  }
  if (start < 0 || goal < 0 || grid.blocked[goal] !== 0) return 0;
  const cols = grid.cols;
  const col = start % cols;
  const row = Math.floor(start / cols);
  search += 1;
  g[goal] = 0;
  parent[goal] = -1;
  opened[goal] = search;
  heap[0] = key(estimate(goal, cols, col, row), estimate(goal, cols, col, row), goal);
  for (let n = 1; n > 0; ) {
    const cell: number = heap[0]! % 16_384;
    const last = heap[--n]!;
    let hole = 0;
    for (let child = 1; child < n; hole = child, child = 2 * child + 1) {
      if (child + 1 < n && heap[child + 1]! < heap[child]!) child += 1;
      if (heap[child]! >= last) break;
      heap[hole] = heap[child]!;
    }
    heap[hole] = last;
    if (closed[cell] === search) continue;
    closed[cell] = search;
    if (cell === start) {
      let count = 0;
      for (let at = start; at >= 0; at = parent[at]!) out[count++] = at;
      return count;
    }
    for (const [dx, dz, stepCost] of STEPS) {
      const next = cell + dx + dz * cols;
      const cost = g[cell]! + stepCost;
      if (!openFrom(grid, cell, dx, dz, start) || closed[next] === search || (opened[next] === search && cost >= g[next]!)) continue;
      g[next] = cost;
      parent[next] = cell;
      opened[next] = search;
      const h = estimate(next, cols, col, row);
      const value = key(cost + h, h, next);
      let up = n++;
      for (; up > 0 && heap[(up - 1) >> 1]! > value; up = (up - 1) >> 1) heap[up] = heap[(up - 1) >> 1]!;
      heap[up] = value;
    }
  }
  return 0;
}

/** The open cell nearest (x, z) within 6 cells (ties to the smaller index), −1 with none open. */
export function nearestOpen(grid: NavGrid, x: number, z: number): number {
  const centre = cellAt(grid, x, z);
  const col0 = centre % grid.cols;
  const row0 = Math.floor(centre / grid.cols);
  let best = -1;
  let bestD2 = 0;
  for (let row = row0 - 6; row <= row0 + 6; row += 1) {
    for (let col = col0 - 6; col <= col0 + 6; col += 1) {
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
      const cell = row * grid.cols + col;
      if (grid.blocked[cell] !== 0) continue;
      const d2 = dist2(cellCenterX(grid, cell), cellCenterZ(grid, cell), x, z);
      if (best < 0 || d2 < bestD2 || (d2 === bestD2 && cell < best)) {
        best = cell;
        bestD2 = d2;
      }
    }
  }
  return best;
}

/** A point kept where the player's centre may stand. */
export function inBounds(grid: NavGrid, point: PointU): PointU {
  return { x: clamp(point.x, grid.minX, grid.maxX), z: clamp(point.z, grid.minZ, grid.maxZ) };
}

/** Waypoints (u) from `from` to the nearest walkable point of `to`; empty when unreachable or already there. */
export function findPath(grid: NavGrid, from: PointU, to: PointU): PointU[] {
  const total = grid.cols * grid.rows;
  if (cells.length !== total) cells = new Int32Array(total);
  const start = cellAt(grid, from.x, from.z);
  let point = inBounds(grid, to);
  let goal = cellAt(grid, point.x, point.z);
  if (grid.blocked[goal] !== 0) {
    goal = nearestOpen(grid, point.x, point.z);
    if (goal < 0) return [];
    point = inBounds(grid, { x: cellCenterX(grid, goal), z: cellCenterZ(grid, goal) });
  }
  const count = astar(grid, start, goal, cells);
  if (count === 0) return [];
  // Pull tight (TK 25.9 "kéo dây"): from each corner on to the furthest cell in a clear straight line.
  const last = Math.max(1, count - 1);
  const px = (k: number): number => (k === last ? point.x : cellCenterX(grid, cells[k]!));
  const pz = (k: number): number => (k === last ? point.z : cellCenterZ(grid, cells[k]!));
  const out: PointU[] = [];
  let x = from.x;
  let z = from.z;
  for (let at = 0; at < last; ) {
    let next = at + 1;
    while (next < last && clearLine(grid, x, z, px(next + 1), pz(next + 1))) next += 1;
    const waypoint = inBounds(grid, { x: px(next), z: pz(next) });
    out.push(waypoint);
    x = waypoint.x;
    z = waypoint.z;
    at = next;
  }
  return out;
}

/** Breadth-first reach (connectivity.ts): how many open cells can be walked to from `from`. */
export function reachableCount(grid: Grid, from: number): number {
  const total = grid.cols * grid.rows;
  if (from < 0 || grid.blocked[from] !== 0) return 0;
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  seen[from] = 1;
  queue[0] = from;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const cell = queue[head++]!;
    for (const [dx, dz] of STEPS) {
      if (!openFrom(grid, cell, dx, dz, -1)) continue;
      const next = cell + dx + dz * grid.cols;
      if (seen[next] !== 0) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }
  return tail;
}
