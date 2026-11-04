/**
 * Twin Dragons, One Burning Pearl (`twin-pearl`): Kiếm key 2's grey box
 * (docs/games/tu-tien/skills/DRAGON_SKILL.md §3 A, §6 step 1), numbers in
 * content/data/twin-pearl.ts. Runs only when the match's ReplayHeader carries
 * `swordKey2: "twin-pearl"`: createSkillsState then adds `skills.twinPearl`
 * and resolveCast sends key 2 here instead of the line. Off (the default) the
 * world has no such key, so its hash, every golden and the rulesHash stay as
 * they were.
 *
 * Frames are ticks: the design's 60 Hz frame Fn is tick startTick + n (the
 * sim runs at 60 Hz, rules.ts SIM.tickHz). Per cast:
 * - F0 hold strike: x ±4 m, from the heart 8 m towards the gates.
 * - F1–F2 touch boxes, one per ground lane, round the lane's beast nearest the
 *   heart outside the hold zone (4 m along the lane, the corridor's width).
 * - F3–F42 the heads run from the lanes' meeting point up each lane to its
 *   gate on a ground S path; the body capsule (r 1.4 m, 0.2–1.5 m high) and
 *   what it passed in the last 0.9 s hit.
 * - F30–F50 each tail sweeps its side's sky route (2.5–6 m high), corner in.
 * - F51–F71 the lotus at the meeting point: full on the two long petals and
 *   the hold zone, half elsewhere within r 9 m.
 * A beast takes at most one hit of each kind (touch, corridor, lotus), at
 * least 20 ticks apart, so ≤ 3 a cast; the Vương takes ≤ 1.5 W a cast.
 *
 * Lanes come from the flow field (field.ts): each ground gate's route is its
 * chain of waypoints to the heart edge; the meeting point is the midpoint of
 * the two routes' last bends (M0a: the bends round the Trận Trụ at (∓5.25;
 * −9.25), so (0; −9.25)). Geometry is cached per flow field; it is static
 * data, never hashed state.
 * Owner: Lane 4 (trial, behind a flag).
 */
import { kiemSkill } from "../content/data/school-kiem";
import { TWIN_PEARL, TWIN_PEARL_END_TICK, type SwordKey2 } from "../content/data/twin-pearl";
import { FIELD } from "../content/rules";
import type { BeastState, Cast, FlowField, Grade, PointU, StageDef, World } from "../content/types";
import { createAreaHit, damageBeast, wHpOf, type AreaHit } from "./combat";
import { cellAt, cellCenterX, cellCenterZ, gatePoint, heartDistance } from "./field";
import { dist2, isqrt, mmToU, mulDiv, mulDivSym, unitPm, within } from "./fixed";
import { postureHit } from "./posture";

declare module "../content/types" {
  interface ReplayHeader {
    /** Kiếm key 2's trial variant (content/data/twin-pearl.ts); absent: today's line. Left out of default headers. */
    readonly swordKey2?: SwordKey2;
  }
  interface SkillsState {
    /** Twin Dragons, One Burning Pearl's live casts: only when the header turns it on (absent otherwise). */
    twinPearl?: TwinPearlState;
  }
}

/** Hit kinds, in the order a tick applies them. */
export type TwinKind = "touch" | "corridor" | "lotus";
const KIND_BIT: Readonly<Record<TwinKind, number>> = { touch: 1, corridor: 2, lotus: 4 };

/** One beast's book in one cast. */
export interface TwinVictim {
  readonly slot: number;
  readonly serial: number;
  hits: number;
  /** Tick offset (from F0) of its last hit. */
  last: number;
  /** KIND_BIT of the kinds it took. */
  kinds: number;
  /** Today's key-2 falloff for its place among this cast's victims, ‰ (100 %, −15 % each next, floor 40 %). */
  readonly factorPm: number;
}

/** A touch box: on (0/1), centre (u), the lane's direction there (unit ‰). */
export interface TwinTouch {
  on: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

export interface TwinPearlCast {
  /** The Cast's actionId: the Vương's cap is per cast id. */
  readonly castId: number;
  readonly seat: number;
  /** F0: the tick the Cast resolved. */
  readonly startTick: number;
  readonly grade: Grade;
  /** P of one beast's full key-2 damage before M_q (today's 2.5 W × g(K)), HP. */
  readonly baseHp: number;
  /** The Vương's cap this cast, HP, and what he took. */
  readonly bossCap: number;
  bossDealt: number;
  /** Effective HP dealt this cast (reports). */
  dealt: number;
  /** Distinct beasts hit so far (the next one's falloff place). */
  victims: number;
  /** Touch boxes of lanes A and B (set on F1). */
  readonly touch: TwinTouch[];
  readonly book: TwinVictim[];
}

export interface TwinPearlState {
  readonly casts: TwinPearlCast[];
}

export function createTwinPearlState(): TwinPearlState {
  return { casts: [] };
}

/** The variant a header asks for key 2 ("line" when absent). */
export const swordKey2Of = (header: { readonly swordKey2?: SwordKey2 }): SwordKey2 | "line" => header.swordKey2 ?? "line";

// ── Geometry (static per flow field) ───────────────────────────────────────

export interface TwinLane {
  readonly gate: "A" | "B";
  /** The lane from its gate to the heart edge: the flow field's waypoints, u. */
  readonly route: readonly PointU[];
  /** The head's base path: the meeting point, then the route's points from its last bend out to the gate. */
  readonly path: readonly PointU[];
  /** Arc length of each path point from the meeting point, u. */
  readonly pathArc: readonly number[];
  /** The S path's samples (u) and the tick offset the head passes each (F3 … F42). */
  readonly sx: readonly number[];
  readonly sz: readonly number[];
  readonly pass: readonly number[];
  /** Length of the S path, u. */
  readonly sLength: number;
  /** This side's sky route: the far corner and its point at the heart edge, u. */
  readonly skyFrom: PointU;
  readonly skyTo: PointU;
}

export interface TwinGeometry {
  /** The lanes' meeting point (the lotus centre, where the pearl hangs), u. */
  readonly meet: PointU;
  readonly lanes: readonly [TwinLane, TwinLane];
}

const geometryCache = new WeakMap<FlowField, { readonly stage: StageDef; readonly flowB: FlowField; readonly geo: TwinGeometry }>();

const U = (mm: number): number => mmToU(mm);

/** A ground gate's route: its point, the flow field's waypoints, then the heart edge on the last leg (u). */
export function laneRoute(world: World, gate: "A" | "B"): PointU[] {
  const field = world.field;
  const flow = field.flows[gate];
  const start = gatePoint(world.stage, gate);
  const out: PointU[] = [start];
  let cell = cellAt(field, start.x, start.z);
  for (let guard = 0; guard < field.cols * field.rows; guard += 1) {
    const wp = flow.waypoint[cell]!;
    if (wp < 0) break;
    out.push({ x: cellCenterX(field, wp), z: cellCenterZ(field, wp) });
    cell = wp;
  }
  const last = out[out.length - 1]!;
  const d = isqrt(last.x * last.x + last.z * last.z);
  const edge = U(FIELD.heartEdgeMm);
  if (d > edge) out.push({ x: mulDivSym(last.x, edge, d), z: mulDivSym(last.z, edge, d) });
  return out;
}

/** Where a route turns onto its last straight into the heart: its last waypoint, or (no bend) its point 10 m from the heart. */
function lastBend(route: readonly PointU[]): PointU {
  if (route.length >= 3) return route[route.length - 2]!;
  const gate = route[0]!;
  const d = isqrt(gate.x * gate.x + gate.z * gate.z) || 1;
  const r = U(TWIN_PEARL.meetFallbackMm);
  return { x: mulDivSym(gate.x, r, d), z: mulDivSym(gate.z, r, d) };
}

/**
 * The S path over `path`: half-waves of about halfWaveMm per segment (whole numbers, so the offset is 0 at each
 * bend), alternating sides. `side` (±1) picks the first bulge's side of the left-hand normal: the west lane takes
 * +1 and the east lane −1, so the two heads run mirror images (both bulge towards the gates first).
 */
function sPath(path: readonly PointU[], firstSide: number): { sx: number[]; sz: number[]; arc: number[] } {
  const heads = TWIN_PEARL.heads;
  const amp = U(heads.amplitudeMm);
  const halfWave = U(heads.halfWaveMm);
  const step = U(heads.sampleMm);
  const sx = [path[0]!.x];
  const sz = [path[0]!.z];
  const arc = [0];
  const unit = { x: 0, z: 0 };
  let side = firstSide;
  for (let k = 0; k + 1 < path.length; k += 1) {
    const a = path[k]!;
    const b = path[k + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = isqrt(dx * dx + dz * dz);
    if (len === 0) continue;
    const n = Math.max(1, mulDiv(len, 1, halfWave));
    unitPm(dx, dz, unit);
    const m = Math.max(1, Math.ceil(len / step));
    for (let j = 1; j <= m; j += 1) {
      const s = mulDiv(len, j, m);
      // Half-wave q and the place r in it (scaled by n): sin(π f) ≈ 4 f (1 − f), f = r / len (no trig in sim).
      let q = Math.floor((s * n) / len);
      if (q >= n) q = n - 1;
      const r = s * n - q * len;
      const wPm = mulDiv(4000 * r, len - r, len * len);
      const sign = q % 2 === 0 ? side : -side;
      const off = mulDivSym(sign * amp, wPm, 1000);
      const bx = a.x + mulDivSym(dx, s, len);
      const bz = a.z + mulDivSym(dz, s, len);
      const x = bx + mulDivSym(-unit.z, off, 1000);
      const z = bz + mulDivSym(unit.x, off, 1000);
      const px = sx[sx.length - 1]!;
      const pz = sz[sz.length - 1]!;
      arc.push(arc[arc.length - 1]! + isqrt(dist2(x, z, px, pz)));
      sx.push(x);
      sz.push(z);
    }
    if (n % 2 === 1) side = -side;
  }
  return { sx, sz, arc };
}

function buildLane(world: World, gate: "A" | "B", route: readonly PointU[], meet: PointU): TwinLane {
  // The head's base path: the meeting point, then the route back from its last bend to the gate (the heart edge left out).
  const path: PointU[] = [meet];
  const lastIndex = route.length >= 3 ? route.length - 2 : 0;
  for (let k = lastIndex; k >= 0; k -= 1) path.push(route[k]!);
  const pathArc = [0];
  for (let k = 1; k < path.length; k += 1) pathArc.push(pathArc[k - 1]! + isqrt(dist2(path[k]!.x, path[k]!.z, path[k - 1]!.x, path[k - 1]!.z)));
  const s = sPath(path, route[0]!.x < 0 ? 1 : -1);
  const heads = TWIN_PEARL.heads;
  const total = s.arc[s.arc.length - 1]! || 1;
  const pass = s.arc.map((a) => heads.fromTick + mulDiv(a, heads.toTick - heads.fromTick, total));
  // This side's sky entry: the corner on the gate's side of the field.
  const entries = world.stage.field.skyEntries;
  const gateX = route[0]!.x;
  const corner = entries.find((e) => (e.xMm < 0) === (gateX < 0)) ?? entries[0]!;
  const skyFrom = { x: U(corner.xMm), z: U(corner.zMm) };
  const d = isqrt(skyFrom.x * skyFrom.x + skyFrom.z * skyFrom.z) || 1;
  const edge = U(FIELD.heartEdgeMm);
  const skyTo = { x: mulDivSym(skyFrom.x, edge, d), z: mulDivSym(skyFrom.z, edge, d) };
  return { gate, route, path, pathArc, sx: s.sx, sz: s.sz, pass, sLength: total, skyFrom, skyTo };
}

/** The skill's lanes and meeting point on this world's field (cached per flow field: rebuilt with an obstacle change). */
export function twinPearlGeometry(world: World): TwinGeometry {
  const flowA = world.field.flows.A;
  const hit = geometryCache.get(flowA);
  if (hit !== undefined && hit.stage === world.stage && hit.flowB === world.field.flows.B) return hit.geo;
  const routeA = laneRoute(world, "A");
  const routeB = laneRoute(world, "B");
  const a = lastBend(routeA);
  const b = lastBend(routeB);
  const meet = { x: mulDivSym(a.x + b.x, 1, 2), z: mulDivSym(a.z + b.z, 1, 2) };
  const geo: TwinGeometry = { meet, lanes: [buildLane(world, "A", routeA, meet), buildLane(world, "B", routeB, meet)] };
  geometryCache.set(flowA, { stage: world.stage, flowB: world.field.flows.B, geo });
  return geo;
}

// ── Volumes (u; tick offsets from F0) ──────────────────────────────────────

const HOLD_HALF = U(TWIN_PEARL.hold.halfWidthMm);
const HOLD_DEPTH = U(TWIN_PEARL.hold.depthMm);
const GROUND_TOP = U(TWIN_PEARL.groundTopMm);
const SKY_BOTTOM = U(TWIN_PEARL.sky.bottomMm);
const SKY_TOP = U(TWIN_PEARL.sky.topMm);
const BODY_R = U(TWIN_PEARL.heads.radiusMm);
const SKY_R = U(TWIN_PEARL.sky.radiusMm);
const TOUCH_HALF_LEN = U(TWIN_PEARL.touch.halfLengthMm);
const TOUCH_HALF_W = U(TWIN_PEARL.touch.halfWidthMm);
const LOTUS_R = U(TWIN_PEARL.lotus.radiusMm);
const PETAL_LEN = U(TWIN_PEARL.lotus.petalLengthMm);
const PETAL_HALF_W = U(TWIN_PEARL.lotus.petalHalfWidthMm);

/** A ground volume reaches a beast standing at most 1.5 m high; the sky volume one flying 2.5–6 m high. */
export const inGroundBand = (y: number): boolean => y <= GROUND_TOP;
export const inSkyBand = (y: number): boolean => y >= SKY_BOTTOM && y <= SKY_TOP;

/** The hold zone: 8 × 8 m in front of the formation centre (the heart at the origin), towards the gates (−z). */
export const inHold = (x: number, z: number): boolean => x >= -HOLD_HALF && x <= HOLD_HALF && z <= 0 && z >= -HOLD_DEPTH;

export function inTouch(touch: TwinTouch, x: number, z: number): boolean {
  if (touch.on === 0) return false;
  const vx = x - touch.x;
  const vz = z - touch.z;
  const along = vx * touch.dx + vz * touch.dz;
  const across = vx * touch.dz - vz * touch.dx;
  return Math.abs(along) <= TOUCH_HALF_LEN * 1000 && Math.abs(across) <= TOUCH_HALF_W * 1000;
}

/** The S samples live at tick offset t: [first, last] indices (passed at most trailTicks ago and already reached); last < first when none. */
export function liveSamples(lane: TwinLane, t: number, out: { first: number; last: number }): void {
  out.first = 0;
  out.last = -1;
  if (t < TWIN_PEARL.heads.fromTick) return;
  const pass = lane.pass;
  let first = 0;
  while (first < pass.length && pass[first]! + TWIN_PEARL.trailTicks < t) first += 1;
  let last = first - 1;
  while (last + 1 < pass.length && pass[last + 1]! <= t) last += 1;
  out.first = first;
  out.last = last;
}

const span = { first: 0, last: -1 };

/** In lane's body capsule or its 0.9 s trail at tick offset t (ground band checked by the caller). */
export function inBody(lane: TwinLane, x: number, z: number, t: number): boolean {
  liveSamples(lane, t, span);
  const r2 = BODY_R * BODY_R;
  for (let i = span.first; i <= span.last; i += 1) if (dist2(x, z, lane.sx[i]!, lane.sz[i]!) <= r2) return true;
  return false;
}

/** The tail's sweep front on this side's sky route at tick offset t, or false outside F30–F50. */
export function skyFront(lane: TwinLane, t: number, out: { x: number; z: number }): boolean {
  const sky = TWIN_PEARL.sky;
  if (t < sky.fromTick || t > sky.toTick) return false;
  const f = t - sky.fromTick;
  const n = sky.toTick - sky.fromTick;
  out.x = lane.skyFrom.x + mulDivSym(lane.skyTo.x - lane.skyFrom.x, f, n);
  out.z = lane.skyFrom.z + mulDivSym(lane.skyTo.z - lane.skyFrom.z, f, n);
  return true;
}

const front = { x: 0, z: 0 };

export function inSky(lane: TwinLane, x: number, z: number, t: number): boolean {
  return skyFront(lane, t, front) && within(x, z, front.x, front.z, SKY_R);
}

/** Within the petal's half-width of lane's base path, no further than petalLength along it from the meeting point. */
export function inPetal(lane: TwinLane, x: number, z: number): boolean {
  const path = lane.path;
  for (let k = 0; k + 1 < path.length; k += 1) {
    const start = lane.pathArc[k]!;
    if (start > PETAL_LEN) break;
    const a = path[k]!;
    const b = path[k + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = lane.pathArc[k + 1]! - start;
    if (len <= 0) continue;
    const dot = (x - a.x) * dx + (z - a.z) * dz;
    const along = dot <= 0 ? 0 : dot >= len * len ? len : Math.floor(dot / len);
    if (start + along > PETAL_LEN) continue;
    const cx = a.x + mulDivSym(dx, along, len);
    const cz = a.z + mulDivSym(dz, along, len);
    if (dist2(x, z, cx, cz) <= PETAL_HALF_W * PETAL_HALF_W) return true;
  }
  return false;
}

/**
 * The lotus's region at (x, z): 2 full (a long petal or the hold zone; the petals reach 13 m along the lanes, past
 * the 9 m bloom), 1 half (elsewhere within r 9 m of the meeting point), 0 none.
 */
export function lotusRegion(geo: TwinGeometry, x: number, z: number): 0 | 1 | 2 {
  if (inHold(x, z) || inPetal(geo.lanes[0], x, z) || inPetal(geo.lanes[1], x, z)) return 2;
  return within(x, z, geo.meet.x, geo.meet.z, LOTUS_R) ? 1 : 0;
}

/** Bits of the volumes that hold (x, y, z) at tick offset t (tests, the lab, coverage): 1 hold, 2 touch, 4 body, 8 sky, 16 lotus full, 32 lotus half. */
export function volumesAt(geo: TwinGeometry, cast: TwinPearlCast | null, x: number, y: number, z: number, t: number): number {
  let bits = 0;
  const ground = inGroundBand(y);
  if (ground && t === TWIN_PEARL.hold.tick && inHold(x, z)) bits |= 1;
  if (ground && cast !== null && t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick && (inTouch(cast.touch[0]!, x, z) || inTouch(cast.touch[1]!, x, z))) bits |= 2;
  if (ground && (inBody(geo.lanes[0], x, z, t) || inBody(geo.lanes[1], x, z, t))) bits |= 4;
  if (inSkyBand(y) && (inSky(geo.lanes[0], x, z, t) || inSky(geo.lanes[1], x, z, t))) bits |= 8;
  if (ground && t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick) {
    const region = lotusRegion(geo, x, z);
    if (region === 2) bits |= 16;
    else if (region === 1) bits |= 32;
  }
  return bits;
}

// ── Casting ────────────────────────────────────────────────────────────────

/** Today's key-2 falloff for the n-th distinct victim, ‰ (data/school-kiem.ts: −15 % each next, floor 40 %). */
function falloffPm(order: number): number {
  const effect = kiemSkill(2).effect;
  if (effect.kind !== "line") return 1000;
  const factor = 1000 - effect.falloffPct * 10 * order;
  return factor > effect.floorPct * 10 ? factor : effect.floorPct * 10;
}

/** Thế of one hit of `kind`: today's key-2 Thế (20) split like the damage, half up. */
function postureOf(kind: TwinKind): number {
  const effect = kiemSkill(2).effect;
  return effect.kind === "line" ? mulDiv(effect.posture, TWIN_PEARL.sharesPct[kind], 100) : 0;
}

/**
 * Key 2 under the flag: resolves when any beast lives (the skill covers both lanes and both sky routes), else
 * false and nothing changes (the Cast stays held). The hits start this tick (F0) in stepTwinPearl.
 */
export function resolveTwinPearl(world: World, cast: Cast): boolean {
  const state = world.skills.twinPearl;
  if (state === undefined) return false;
  if (!world.beasts.list.some((beast) => beast.alive)) return false;
  const effect = kiemSkill(2).effect;
  if (effect.kind !== "line") return false;
  state.casts.push({
    castId: cast.actionId,
    seat: cast.seat,
    startTick: world.tick,
    grade: cast.quality,
    baseHp: wHpOf(world, effect.w100),
    bossCap: wHpOf(world, TWIN_PEARL.bossCapW100),
    bossDealt: 0,
    dealt: 0,
    victims: 0,
    touch: [
      { on: 0, x: 0, z: 0, dx: 0, dz: 0 },
      { on: 0, x: 0, z: 0, dx: 0, dz: 0 },
    ],
    book: [],
  });
  return true;
}

/** The route segment nearest (x, z): its unit direction ‰ from the gate towards the heart. */
function routeDirection(route: readonly PointU[], x: number, z: number, out: { x: number; z: number }): void {
  let best = -1;
  let bestD = 0;
  for (let k = 0; k + 1 < route.length; k += 1) {
    const a = route[k]!;
    const b = route[k + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const len = isqrt(len2);
    const dot = (x - a.x) * dx + (z - a.z) * dz;
    const along = dot <= 0 ? 0 : dot >= len2 ? len : Math.floor(dot / len);
    const d = dist2(x, z, a.x + mulDivSym(dx, along, len), a.z + mulDivSym(dz, along, len));
    if (best < 0 || d < bestD) {
      best = k;
      bestD = d;
    }
  }
  if (best < 0) {
    out.x = 0;
    out.z = 1000;
    return;
  }
  unitPm(route[best + 1]!.x - route[best]!.x, route[best + 1]!.z - route[best]!.z, out);
}

/** F1: each lane's touch box round its ground beast nearest the heart outside the hold zone (ties: smaller beastId). */
function pickTouches(world: World, cast: TwinPearlCast, geo: TwinGeometry): void {
  const dir = { x: 0, z: 0 };
  for (let i = 0; i < 2; i += 1) {
    const lane = geo.lanes[i]!;
    let best: BeastState | null = null;
    let bestD = 0;
    for (const beast of world.beasts.list) {
      if (!beast.alive || beast.gate !== lane.gate || !inGroundBand(beast.y) || inHold(beast.x, beast.z)) continue;
      const d = heartDistance(world, beast);
      if (best === null || d < bestD || (d === bestD && beast.serial < best.serial)) {
        best = beast;
        bestD = d;
      }
    }
    const touch = cast.touch[i]!;
    if (best === null) continue;
    routeDirection(lane.route, best.x, best.z, dir);
    touch.on = 1;
    touch.x = best.x;
    touch.z = best.z;
    touch.dx = dir.x;
    touch.dz = dir.z;
  }
}

function bookOf(cast: TwinPearlCast, beast: BeastState): TwinVictim | null {
  for (const entry of cast.book) if (entry.slot === beast.slot && entry.serial === beast.serial) return entry;
  return null;
}

/** May `beast` take a hit of `kind` at tick offset t (≤ 3 a cast, one of each kind, ≥ 20 ticks apart, the Vương under his cap)? */
export function mayHit(cast: TwinPearlCast, beast: BeastState, kind: TwinKind, t: number): boolean {
  if (beast.boss && cast.bossDealt >= cast.bossCap) return false;
  const entry = bookOf(cast, beast);
  if (entry === null) return true;
  return entry.hits < TWIN_PEARL.maxHits && (entry.kinds & KIND_BIT[kind]) === 0 && t - entry.last >= TWIN_PEARL.rehitTicks;
}

/** One hit of `kind` on `beast` (checked by mayHit); `half` for the lotus outside its petals. */
function hit(world: World, cast: TwinPearlCast, beast: BeastState, kind: TwinKind, t: number, area: AreaHit, half: boolean): void {
  let entry = bookOf(cast, beast);
  if (entry === null) {
    entry = { slot: beast.slot, serial: beast.serial, hits: 0, last: -1, kinds: 0, factorPm: falloffPm(cast.victims) };
    cast.book.push(entry);
    cast.victims += 1;
  }
  entry.hits += 1;
  entry.last = t;
  entry.kinds |= KIND_BIT[kind];
  const p = mulDiv(cast.baseHp, TWIN_PEARL.sharesPct[kind], 100);
  const factorPm = half ? mulDiv(entry.factorPm, TWIN_PEARL.lotus.outsidePm, 1000) : entry.factorPm;
  const by = { seat: cast.seat, source: "slot2" as const, grade: cast.grade, factorPm, area };
  const dealt = damageBeast(world, beast, p, "typed", beast.boss ? { ...by, limit: cast.bossCap - cast.bossDealt } : by);
  cast.dealt += dealt;
  if (beast.boss) cast.bossDealt += dealt;
  const posture = postureOf(kind);
  if (posture > 0) postureHit(world, beast, posture, "slot2");
}

/** Live beasts of one volume this tick, nearest the heart first (ties: smaller beastId): the falloff's order. */
function victimsOf(world: World, test: (beast: BeastState) => boolean): BeastState[] {
  const out: { beast: BeastState; d: number }[] = [];
  for (const beast of world.beasts.list) if (beast.alive && test(beast)) out.push({ beast, d: heartDistance(world, beast) });
  out.sort((p, q) => p.d - q.d || p.beast.serial - q.beast.serial);
  return out.map((item) => item.beast);
}

/** One volume's hits this tick: one area hit (the 60 % swarm-cluster cap) over the beasts inside that may take `kind`. */
function strikeVolume(world: World, cast: TwinPearlCast, kind: TwinKind, t: number, test: (beast: BeastState) => boolean, half: (beast: BeastState) => boolean = () => false): void {
  const victims = victimsOf(world, (beast) => test(beast) && mayHit(cast, beast, kind, t));
  if (victims.length === 0) return;
  const area = createAreaHit();
  for (const beast of victims) if (beast.alive) hit(world, cast, beast, kind, t, area, half(beast));
}

function stepCast(world: World, cast: TwinPearlCast, t: number): void {
  const geo = twinPearlGeometry(world);
  const [laneA, laneB] = geo.lanes;
  const ground = (beast: BeastState): boolean => inGroundBand(beast.y);
  if (t === TWIN_PEARL.hold.tick) strikeVolume(world, cast, "touch", t, (b) => ground(b) && inHold(b.x, b.z));
  if (t === TWIN_PEARL.touch.fromTick) pickTouches(world, cast, geo);
  if (t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick) {
    for (const touch of cast.touch) if (touch.on !== 0) strikeVolume(world, cast, "touch", t, (b) => ground(b) && inTouch(touch, b.x, b.z));
  }
  if (t >= TWIN_PEARL.heads.fromTick) {
    for (const lane of [laneA, laneB]) strikeVolume(world, cast, "corridor", t, (b) => ground(b) && inBody(lane, b.x, b.z, t));
  }
  for (const lane of [laneA, laneB]) {
    if (skyFront(lane, t, front)) strikeVolume(world, cast, "corridor", t, (b) => inSkyBand(b.y) && inSky(lane, b.x, b.z, t));
  }
  if (t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick) {
    strikeVolume(world, cast, "lotus", t, (b) => ground(b) && lotusRegion(geo, b.x, b.z) !== 0, (b) => lotusRegion(geo, b.x, b.z) === 1);
  }
}

/** Steps every live cast (stepSkills, after the strikes and zones); a cast is dropped after its last hitting tick. */
export function stepTwinPearl(world: World): void {
  const state = world.skills.twinPearl;
  if (state === undefined) return;
  const casts = state.casts;
  let keep = 0;
  for (let index = 0; index < casts.length; index += 1) {
    const cast = casts[index]!;
    const t = world.tick - cast.startTick;
    if (t > TWIN_PEARL_END_TICK) continue;
    stepCast(world, cast, t);
    if (t < TWIN_PEARL_END_TICK) {
      casts[keep] = cast;
      keep += 1;
    }
  }
  casts.length = keep;
}
