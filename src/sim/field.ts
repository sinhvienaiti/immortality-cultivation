/**
 * Flow fields (canon §8.1): one per ground gate on the 0.5 m grid (80 × 52)
 * towards the heart, around the Trận Trụ; integer Dijkstra (10 a straight
 * step, 14 a diagonal, no corner cutting), then each cell's waypoint is pulled
 * tight by line of sight, so a beast on open ground walks straight at the
 * heart and bends only around obstacles. Rebuilt only when an obstacle changes.
 * The sky route is a straight line from its entry to the heart. Ground beasts
 * walk readable corridors, never forced into narrow lanes; they stop at the
 * heart edge (r 2 m, canon §10.8).
 * At M0a both ground gates share one field (the stage has no per-gate
 * corridors); `fieldDistance` still takes the gate for later stages. On a
 * mirror-symmetric stage the field is mirror-symmetric too (cell picking on
 * edges, tie-breaks and rounding never favour east or west), so gate A's
 * beasts walk the mirror image of gate B's.
 * Owner: Lane 2.
 */
import { FIELD } from "../content/rules";
import type { BeastState, FieldRuntime, FlowField, GateId, PointU, StageDef, World } from "../content/types";
import { dist, dist2, mmToU, mulDiv, mulDivSym, stepTowards } from "./fixed";

/** Waypoint value: walk straight at the heart's centre. */
export const HEART = -2;
/** Waypoint value: no way to the heart from this cell. */
export const UNREACHABLE = -1;

/** 8 neighbours as [dx, dz] with their cost; a diagonal needs both of its sides open. */
export const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

interface FieldBuild {
  readonly blocked: Uint8Array;
  readonly flow: FlowField;
}

/** Fields depend only on the stage and its obstacles: shared between worlds of the same stage (read only). */
const cache = new WeakMap<StageDef, Map<string, FieldBuild>>();

const heartEdgeU = (): number => mmToU(FIELD.heartEdgeMm);

/** Grid geometry of a stage (u). */
function geometry(stage: StageDef): { cols: number; rows: number; cellMm: number; cellU: number; minXU: number; minZU: number } {
  const f = stage.field;
  const cellMm = FIELD.cellMm;
  const cols = Math.floor((f.maxXMm - f.minXMm) / cellMm);
  const rows = Math.floor((f.maxZMm - f.minZMm) / cellMm);
  if (cols <= 0 || rows <= 0 || cols * cellMm !== f.maxXMm - f.minXMm || rows * cellMm !== f.maxZMm - f.minZMm) throw new Error("field: stage " + stage.id + " is not a whole number of " + cellMm + " mm cells");
  return { cols, rows, cellMm, cellU: mmToU(cellMm), minXU: mmToU(f.minXMm), minZU: mmToU(f.minZMm) };
}

/** Which cells a body of `clearanceMm` may not stand in (terrain rectangles and pillars, grown by the clearance). */
export function blockedCells(stage: StageDef, clearanceMm: number): Uint8Array {
  const f = stage.field;
  const { cols, rows, cellMm } = geometry(stage);
  const out = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const cz = f.minZMm + row * cellMm + cellMm / 2;
    for (let col = 0; col < cols; col += 1) {
      const cx = f.minXMm + col * cellMm + cellMm / 2;
      let blocked = false;
      for (const rect of f.blocked) {
        const x0 = Math.min(rect.from.xMm, rect.to.xMm) - clearanceMm;
        const x1 = Math.max(rect.from.xMm, rect.to.xMm) + clearanceMm;
        const z0 = Math.min(rect.from.zMm, rect.to.zMm) - clearanceMm;
        const z1 = Math.max(rect.from.zMm, rect.to.zMm) + clearanceMm;
        if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) blocked = true;
      }
      for (const pillar of f.pillars) {
        const r = pillar.radiusMm + clearanceMm;
        const dx = cx - pillar.at.xMm;
        const dz = cz - pillar.at.zMm;
        if (dx * dx + dz * dz <= r * r) blocked = true;
      }
      if (blocked) out[row * cols + col] = 1;
    }
  }
  return out;
}

/** Grid geometry of a stage in u (the flow field and the player's nav grid share it). */
export function gridGeometry(stage: StageDef): { cols: number; rows: number; cellMm: number; cellU: number; minXU: number; minZU: number } {
  return geometry(stage);
}

/**
 * The cell holding (x, z) u, clamped to the grid. A point on a vertical cell
 * edge belongs to the cell further from the grid's middle, so a point and its
 * east–west mirror image always fall in mirrored cells (gate A and gate B).
 */
export function cellAt(field: Pick<FieldRuntime, "cols" | "rows" | "cellU" | "minXU" | "minZU">, x: number, z: number): number {
  const rx = x - field.minXU;
  let col = Math.floor(rx / field.cellU);
  if (rx % field.cellU === 0 && 2 * rx < field.cols * field.cellU) col -= 1;
  let row = Math.floor((z - field.minZU) / field.cellU);
  col = col < 0 ? 0 : col >= field.cols ? field.cols - 1 : col;
  row = row < 0 ? 0 : row >= field.rows ? field.rows - 1 : row;
  return row * field.cols + col;
}

export const cellCenterX = (field: Pick<FieldRuntime, "cols" | "cellU" | "minXU">, cell: number): number => field.minXU + (cell % field.cols) * field.cellU + field.cellU / 2;
export const cellCenterZ = (field: Pick<FieldRuntime, "cols" | "cellU" | "minZU">, cell: number): number => field.minZU + Math.floor(cell / field.cols) * field.cellU + field.cellU / 2;

/** A 0.5 m grid with its blocked cells (the flow field's and the player's nav grid). */
export type Grid = { readonly cols: number; readonly rows: number; readonly cellU: number; readonly minXU: number; readonly minZU: number; readonly blocked: Uint8Array };

/** A step from `cell` by (dx, dz) stays on the grid, lands on an open cell and cuts no corner. */
export function open(grid: Grid, cell: number, dx: number, dz: number): boolean {
  const col = (cell % grid.cols) + dx;
  const row = Math.floor(cell / grid.cols) + dz;
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  if (grid.blocked[row * grid.cols + col] !== 0) return false;
  return dx === 0 || dz === 0 || (grid.blocked[cell + dx] === 0 && grid.blocked[cell + dz * grid.cols] === 0);
}

/**
 * Whether the segment (ax, az)–(bx, bz) u crosses open cells only: samples a
 * quarter cell apart, each move to a neighbouring cell passing `open` (a
 * diagonal needs both cells beside it).
 */
export function clearLine(grid: Grid, ax: number, az: number, bx: number, bz: number): boolean {
  const quarter = grid.cellU / 4;
  const length = dist(ax, az, bx, bz);
  const steps = Math.max(1, Math.ceil(length / quarter));
  let cell = cellAt(grid, ax, az);
  if (grid.blocked[cell] !== 0) return false;
  for (let k = 1; k <= steps; k += 1) {
    const next = cellAt(grid, ax + mulDivSym(bx - ax, k, steps), az + mulDivSym(bz - az, k, steps));
    if (next === cell) continue;
    const dx = (next % grid.cols) - (cell % grid.cols);
    const dz = Math.floor(next / grid.cols) - Math.floor(cell / grid.cols);
    if (dx < -1 || dx > 1 || dz < -1 || dz > 1 || !open(grid, cell, dx, dz)) return false;
    cell = next;
  }
  return true;
}

/** Integer Dijkstra from the heart edge, then string-pulled waypoints and path lengths (cells in cost order). */
function buildFlow(grid: Grid): FlowField {
  const total = grid.cols * grid.rows;
  const steps = new Int32Array(total).fill(-1);
  const waypoint = new Int32Array(total).fill(UNREACHABLE);
  const pathU = new Int32Array(total).fill(-1);
  const edge = heartEdgeU();
  // Binary heap of (cost × 2^14 + cell); cells < 2^14 and costs < 2^16 keep keys exact.
  const heap: number[] = [];
  const push = (key: number): void => {
    let at = heap.length;
    heap.push(key);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (heap[parent]! <= key) break;
      heap[at] = heap[parent]!;
      at = parent;
    }
    heap[at] = key;
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      let at = 0;
      for (;;) {
        let child = 2 * at + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1]! < heap[child]!) child += 1;
        if (heap[child]! >= last) break;
        heap[at] = heap[child]!;
        at = child;
      }
      heap[at] = last;
    }
    return top;
  };
  if (total >= 16_384) throw new Error("field: heap keys hold 14 cell bits, " + total + " cells asked");
  for (let cell = 0; cell < total; cell += 1) {
    if (grid.blocked[cell] !== 0) continue;
    if (dist(cellCenterX(grid, cell), cellCenterZ(grid, cell), 0, 0) <= edge) {
      steps[cell] = 0;
      push(cell);
    }
  }
  const order: number[] = [];
  const done = new Uint8Array(total);
  while (heap.length > 0) {
    const key = pop();
    const cell = key % 16_384;
    const cost = (key - cell) / 16_384;
    if (done[cell] !== 0 || cost !== steps[cell]) continue;
    done[cell] = 1;
    order.push(cell);
    for (const [dx, dz, stepCost] of STEPS) {
      if (!open(grid, cell, dx, dz)) continue;
      const next = cell + dx + dz * grid.cols;
      const value = cost + stepCost;
      if (steps[next] !== -1 && steps[next]! <= value) continue;
      steps[next] = value;
      push(value * 16_384 + next);
    }
  }
  for (const cell of order) {
    const cx = cellCenterX(grid, cell);
    const cz = cellCenterZ(grid, cell);
    if (steps[cell] === 0 || clearLine(grid, cx, cz, 0, 0)) {
      waypoint[cell] = HEART;
      pathU[cell] = dist(cx, cz, 0, 0);
      continue;
    }
    // The neighbour nearest the heart: lowest cost, then nearest in a straight line, then the lower row
    // (two tied neighbours never share a row off the middle line, so mirrored cells pick mirrored neighbours).
    let best = -1;
    let bestD2 = 0;
    for (const [dx, dz] of STEPS) {
      if (!open(grid, cell, dx, dz)) continue;
      const next = cell + dx + dz * grid.cols;
      if (steps[next]! < 0 || steps[next]! >= steps[cell]!) continue;
      const d2 = dist2(cellCenterX(grid, next), cellCenterZ(grid, next), 0, 0);
      if (best < 0 || steps[next]! < steps[best]! || (steps[next] === steps[best] && (d2 < bestD2 || (d2 === bestD2 && next < best)))) {
        best = next;
        bestD2 = d2;
      }
    }
    if (best < 0) continue;
    const ahead = waypoint[best]!;
    const target = ahead >= 0 && clearLine(grid, cx, cz, cellCenterX(grid, ahead), cellCenterZ(grid, ahead)) ? ahead : best;
    waypoint[cell] = target;
    pathU[cell] = dist(cx, cz, cellCenterX(grid, target), cellCenterZ(grid, target)) + pathU[target]!;
  }
  return { steps, waypoint, pathU };
}

/** Obstacles of a stage as a cache key (pillars never move at M0a; Thạch Bích comes with M1). */
function obstacleKey(stage: StageDef): string {
  return JSON.stringify([stage.field.blocked, stage.field.pillars]);
}

function build(stage: StageDef): FieldBuild {
  let byKey = cache.get(stage);
  if (!byKey) {
    byKey = new Map();
    cache.set(stage, byKey);
  }
  const key = obstacleKey(stage);
  const hit = byKey.get(key);
  if (hit) return hit;
  const g = geometry(stage);
  const blocked = blockedCells(stage, FIELD.clearanceMm);
  const flow = buildFlow({ ...g, blocked });
  const made = { blocked, flow };
  byKey.set(key, made);
  return made;
}

export function createField(stage: StageDef): FieldRuntime {
  const g = geometry(stage);
  const made = build(stage);
  return { cols: g.cols, rows: g.rows, cellMm: g.cellMm, cellU: g.cellU, minXU: g.minXU, minZU: g.minZU, blocked: made.blocked, flows: { A: made.flow, B: made.flow }, version: 1 };
}

/** Rebuilds the fields after an obstacle change (bumps `field.version`). */
export function rebuildField(world: World): void {
  const made = build(world.stage);
  world.field.blocked = made.blocked;
  world.field.flows = { A: made.flow, B: made.flow };
  world.field.version += 1;
}

const isFlyer = (beast: BeastState): boolean => beast.gate === "sky";
const flowOf = (field: FieldRuntime, gate: GateId): FlowField => (gate === "B" ? field.flows.B : field.flows.A);
const scratch = { x: 0, z: 0 };

/**
 * Moves a beast one tick: ground beasts along their gate's field, flyers
 * straight at the heart; both stop at the heart edge. `stepU` is the distance
 * this tick with slows already applied by the caller (default: its own speed,
 * round(speedPm / 1000)). Updates `cell` (−1 for flyers).
 */
export function fieldStep(world: World, beast: BeastState, stepU: number = mulDiv(beast.speedPm, 1, 1000)): void {
  let left = stepU;
  if (left <= 0) return;
  const edge = heartEdgeU();
  const field = world.field;
  if (isFlyer(beast)) {
    const d = dist(beast.x, beast.z, 0, 0);
    if (d > edge) {
      stepTowards(beast.x, beast.z, 0, 0, Math.min(left, d - edge), scratch);
      beast.x = scratch.x;
      beast.z = scratch.z;
    }
    beast.cell = -1;
    return;
  }
  const flow = flowOf(field, beast.gate);
  // Two legs at most: reaching a waypoint mid-tick carries the rest of the step on.
  for (let leg = 0; leg < 2 && left > 0; leg += 1) {
    const cell = cellAt(field, beast.x, beast.z);
    const wp = flow.waypoint[cell]!;
    if (wp < 0) {
      // The heart in a straight line (or no way: a body pushed into an obstacle walks straight out).
      const d = dist(beast.x, beast.z, 0, 0);
      if (d > edge) {
        stepTowards(beast.x, beast.z, 0, 0, Math.min(left, d - edge), scratch);
        beast.x = scratch.x;
        beast.z = scratch.z;
      }
      left = 0;
      break;
    }
    const tx = cellCenterX(field, wp);
    const tz = cellCenterZ(field, wp);
    const before = dist(beast.x, beast.z, tx, tz);
    stepTowards(beast.x, beast.z, tx, tz, left, scratch);
    beast.x = scratch.x;
    beast.z = scratch.z;
    left = before < left ? left - before : 0;
  }
  beast.cell = cellAt(field, beast.x, beast.z);
}

/** Path distance from a cell to the heart along `gate`'s field, u ("nearest to the heart", canon §23.3); sky: straight; −1 unreachable. */
export function fieldDistance(world: World, gate: GateId, cell: number): number {
  const field = world.field;
  if (gate === "sky") return dist(cellCenterX(field, cell), cellCenterZ(field, cell), 0, 0);
  return flowOf(field, gate).pathU[cell] ?? -1;
}

/** A beast's own distance to the heart's centre, u: along its field for ground beasts, straight for flyers. */
export function heartDistance(world: World, beast: BeastState): number {
  if (isFlyer(beast)) return dist(beast.x, beast.z, 0, 0);
  const field = world.field;
  const flow = flowOf(field, beast.gate);
  const wp = flow.waypoint[cellAt(field, beast.x, beast.z)]!;
  if (wp < 0) return dist(beast.x, beast.z, 0, 0);
  const tx = cellCenterX(field, wp);
  const tz = cellCenterZ(field, wp);
  return dist(beast.x, beast.z, tx, tz) + flow.pathU[wp]!;
}

/** Where a gate's groups appear (u): a ground gate half a cell inside the field; the sky route at its corner entry `entry` (0 west, 1 east). */
export function gatePoint(stage: StageDef, gate: GateId, entry = 0): PointU {
  const f = stage.field;
  const inset = FIELD.cellMm / 2;
  const clampX = (xMm: number): number => Math.min(f.maxXMm - inset, Math.max(f.minXMm + inset, xMm));
  const clampZ = (zMm: number): number => Math.min(f.maxZMm - inset, Math.max(f.minZMm + inset, zMm));
  if (gate === "sky") {
    // Flyers come in over the corner itself (26.9 m to the heart, canon §8.1).
    const at = f.skyEntries[entry] ?? f.skyEntries[0];
    if (!at) throw new Error("field: stage " + stage.id + " has no sky entry");
    return { x: mmToU(at.xMm), z: mmToU(at.zMm) };
  }
  const def = f.gates.find((g) => g.id === gate);
  if (!def) throw new Error("field: stage " + stage.id + " has no gate " + gate);
  return { x: mmToU(clampX(def.at.xMm)), z: mmToU(clampZ(def.at.zMm)) };
}

/** Length of a gate's route to the heart edge, u (the share of the route walked, Q, canon §18.2). */
export function routeU(world: World, gate: GateId): number {
  const at = gatePoint(world.stage, gate);
  const edge = heartEdgeU();
  if (gate === "sky") return dist(at.x, at.z, 0, 0) - edge;
  const path = fieldDistance(world, gate, cellAt(world.field, at.x, at.z));
  return (path < 0 ? dist(at.x, at.z, 0, 0) : path) - edge;
}
