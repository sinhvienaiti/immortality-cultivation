/**
 * The player body (canon §9.1, §9.2): position in u, Sinh lực 600 × g(K),
 * shield, 5 m/s, radius 0.4 m; collides with the field's edge, terrain and
 * the Trận Trụ, never with beasts or allies. Starts on the Tâm nhãn (where
 * the Đứng yên bot stands, canon §18.3). Arrows walk in screen directions
 * (the camera looks north: up is −z); a right click follows the pulled path;
 * Lưu Quang Bộ glides over its unpushable window. Integer only.
 * Owner: Lane 2.
 */
import { DASH, FIELD, PLAYER } from "../content/rules";
import type { LocalState, PointU, StageDef } from "../content/types";
import { clamp, dist, isqrt, mmToU, msToTicks, mulDiv, mulDivSym, stepTowards, unitPm } from "../sim/fixed";

export function createLocal(seat: number, stage: StageDef, gPm: number): LocalState {
  const hpMax = mulDiv(PLAYER.hp, gPm, 1000);
  const node = stage.field.nodes[0];
  const start = node ? { x: mmToU(node.at.xMm), z: mmToU(node.at.zMm) } : { x: 0, z: 0 };
  return {
    seat,
    tick: 0,
    x: start.x,
    z: start.z,
    hp: hpMax,
    hpMax,
    shield: 0,
    shieldUntil: -1,
    healTotal: 0,
    healLeft: 0,
    healFrom: -1,
    healUntil: -1,
    down: false,
    downUntil: -1,
    moveTarget: null,
    path: [],
    arrows: 0,
    dashUntil: -1,
    dashLeft: 0,
    dashX: 0,
    dashZ: 0,
    facingX: 0,
    facingZ: -1000,
    barrier: { inside: true, graceUntil: -1, fadeUntil: -1, joinAt: 0 },
    autoNext: 0,
    lastStrikeSeen: -1,
    seenTick: -1,
    outbox: [],
    events: [],
  };
}

/** Where the player stands (u); the router quantises it to 100 mm for `origin`. */
export function playerPos(local: LocalState): PointU {
  return { x: local.x, z: local.z };
}

const RADIUS_U = mmToU(PLAYER.radiusMm);
/** A held-off waypoint closer than an eighth of a grid cell counts as reached. */
const SNAP_U = mmToU(FIELD.cellMm) / 8;
/** Walk speed, u a tick (N mm/s is N u a tick). */
export const WALK_U = PLAYER.speedMmPerS;
/** Arrow mask (up 1, down 2, left 4, right 8) → screen direction ‰; opposite keys cancel. */
const ARROW_DIRS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let mask = 0; mask < 16; mask += 1) {
    const dz = (mask & 2 ? 1 : 0) - (mask & 1 ? 1 : 0);
    const dx = (mask & 8 ? 1 : 0) - (mask & 4 ? 1 : 0);
    out.push(dx !== 0 && dz !== 0 ? [dx * 707, dz * 707] : [dx * 1000, dz * 1000]);
  }
  return out;
})();

/** Pushes a body centre out of the Trận Trụ and terrain and keeps it on the field. */
export function resolveBody(stage: StageDef, x: number, z: number, out: { x: number; z: number }): void {
  const f = stage.field;
  let px = x;
  let pz = z;
  for (const pillar of f.pillars) {
    const cx = mmToU(pillar.at.xMm);
    const cz = mmToU(pillar.at.zMm);
    const reach = mmToU(pillar.radiusMm) + RADIUS_U;
    const dx = px - cx;
    const dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    const d = isqrt(d2);
    // Out along the line from the centre (+1 u so rounding never leaves it inside); dead centre goes south.
    if (d === 0) {
      pz = cz + reach + 1;
      continue;
    }
    px = cx + mulDivSym(dx, reach + 1, d);
    pz = cz + mulDivSym(dz, reach + 1, d);
  }
  for (const rect of f.blocked) {
    const x0 = mmToU(Math.min(rect.from.xMm, rect.to.xMm)) - RADIUS_U;
    const x1 = mmToU(Math.max(rect.from.xMm, rect.to.xMm)) + RADIUS_U;
    const z0 = mmToU(Math.min(rect.from.zMm, rect.to.zMm)) - RADIUS_U;
    const z1 = mmToU(Math.max(rect.from.zMm, rect.to.zMm)) + RADIUS_U;
    if (px <= x0 || px >= x1 || pz <= z0 || pz >= z1) continue;
    // Out through the nearest side.
    const left = px - x0;
    const right = x1 - px;
    const top = pz - z0;
    const bottom = z1 - pz;
    const least = Math.min(left, right, top, bottom);
    if (least === left) px = x0;
    else if (least === right) px = x1;
    else if (least === top) pz = z0;
    else pz = z1;
  }
  out.x = clamp(px, mmToU(f.minXMm) + RADIUS_U, mmToU(f.maxXMm) - RADIUS_U);
  out.z = clamp(pz, mmToU(f.minZMm) + RADIUS_U, mmToU(f.maxZMm) - RADIUS_U);
}

const scratch = { x: 0, z: 0 };
const dir = { x: 0, z: 0 };

/** Moves the body by (dx, dz) u and settles it against obstacles. */
export function moveBody(local: LocalState, stage: StageDef, dx: number, dz: number): void {
  resolveBody(stage, local.x + dx, local.z + dz, scratch);
  local.x = scratch.x;
  local.z = scratch.z;
}

/** Starts a Lưu Quang Bộ glide along the facing (canon §12.1): 5 m over the 0.3 s it cannot be pushed. */
export function startDash(local: LocalState): void {
  local.dashLeft = mmToU(DASH.distanceMm);
  local.dashX = local.facingX;
  local.dashZ = local.facingZ;
  local.dashUntil = local.tick + msToTicks(DASH.unpushableMs);
  local.path.length = 0;
  local.moveTarget = null;
}

/** One tick of movement: the glide, else arrows, else the right-click path. Nothing while down. */
export function stepMove(local: LocalState, stage: StageDef): void {
  if (local.down) return;
  if (local.dashLeft > 0) {
    const ticksLeft = local.dashUntil - local.tick;
    const step = ticksLeft <= 1 ? local.dashLeft : mulDivSym(local.dashLeft, 1, ticksLeft);
    moveBody(local, stage, mulDivSym(local.dashX, step, 1000), mulDivSym(local.dashZ, step, 1000));
    local.dashLeft -= step;
    return;
  }
  const [ax, az] = ARROW_DIRS[local.arrows & 15]!;
  if (ax !== 0 || az !== 0) {
    local.facingX = ax;
    local.facingZ = az;
    moveBody(local, stage, mulDivSym(ax, WALK_U, 1000), mulDivSym(az, WALK_U, 1000));
    return;
  }
  let left: number = WALK_U;
  while (left > 0 && local.path.length > 0) {
    const target = local.path[0]!;
    const before = dist(local.x, local.z, target.x, target.z);
    if (before === 0) {
      local.path.shift();
      continue;
    }
    unitPm(target.x - local.x, target.z - local.z, dir);
    local.facingX = dir.x;
    local.facingZ = dir.z;
    stepTowards(local.x, local.z, target.x, target.z, left, scratch);
    const wantX = scratch.x;
    const wantZ = scratch.z;
    resolveBody(stage, wantX, wantZ, scratch);
    const pushed = scratch.x !== wantX || scratch.z !== wantZ;
    local.x = scratch.x;
    local.z = scratch.z;
    if (!pushed && before <= left) {
      // Reached this waypoint: the rest of the step goes on to the next.
      local.path.shift();
      left -= before;
      continue;
    }
    // A pillar or the field's edge holds the body short of the waypoint: it slides on while that brings it
    // closer, and gives the waypoint up once it does not (or the body stands right by it).
    if (pushed) {
      const after = dist(local.x, local.z, target.x, target.z);
      if (after >= before || after < SNAP_U) local.path.shift();
    }
    left = 0;
  }
  if (local.path.length === 0) local.moveTarget = null;
}
