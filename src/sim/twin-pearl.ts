/**
 * Field-wide Twin Dragons, One Burning Pearl (DRAGON_SKILL.md §9).
 * Geometry is fixed from the F0 snapshot, the field bounds, heart and caster.
 * Moving beasts meet live discs, sampled bodies, sky capsules and lotus petals.
 * The damage engine keeps per-side falloff and budgets, three spaced hit kinds,
 * one area cap and one boss cap per cast. Absent the header flag, no state is added.
 */
import { kiemSkill } from "../content/data/school-kiem";
import { TWIN_PEARL, TWIN_PEARL_END_TICK, type SwordKey2 } from "../content/data/twin-pearl";
import type { BeastState, Cast, Grade, PointU, StageDef, World } from "../content/types";
import { areaClusterLeft, beastByRef, createAreaHit, damageBeast, scaleHit, wHpOf, type AreaHit } from "./combat";
import { heartPoint } from "./targeting";
import { clamp, dist2, isqrt, mmToU, mulDiv, mulDivSym, unitPm, within } from "./fixed";
import { damageImmune, postureHit } from "./posture";

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
const KIND_ORDER: Readonly<Record<TwinKind, number>> = { touch: 0, corridor: 1, lotus: 2 };

/** Budget parts of one side (TwinPearlCast.pool index: side × POOL_PARTS + part). */
export const POOL_TOUCH = 0;
export const POOL_CORRIDOR = 1;
export const POOL_SKY = 2;
export const POOL_LOTUS = 3;
export const POOL_PARTS = 4;

/** One beast's book in one cast. */
export interface TwinVictim {
  readonly slot: number;
  readonly serial: number;
  /** Side 0 or 1 in this cast's lateral split. */
  readonly side: number;
  hits: number;
  /** Tick offset (from F0) of its last hit. */
  last: number;
  /** KIND_BIT of the kinds it took. */
  kinds: number;
  /** Today's key-2 falloff for its place among its side's victims this cast, ‰ (100 %, −15 % each next, floor 40 %). */
  readonly factorPm: number;
}

export interface TwinDragon {
  /** C, ground anchors, P after adjacent duplicates are merged, before segment splitting. */
  readonly nodes: number[];
  readonly sx: number[];
  readonly sz: number[];
  readonly arc: number[];
  readonly pass: number[];
  readonly petalFrom: number;
  /** This side's F0 sky anchors, x, z pairs. */
  readonly sky: number[];
}

export interface TwinDisc { on: number; x: number; z: number; sky: number }

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
  /** Distinct beasts hit so far, both sides (reports). */
  victims: number;
  /** Distinct beasts hit so far on each side (the next one's falloff place on that side). */
  readonly sideVictims: number[];
  /** The budget left, effective HP, per side and part (index side × POOL_PARTS + POOL_*). */
  readonly pool: number[];
  /** The budget the cast started with, same layout (reports). */
  readonly poolStart: readonly number[];
  /** The whole cast is one area hit (the 60 % swarm-cluster cap, canon §7.2). */
  readonly area: AreaHit;
  readonly hx: number;
  readonly hz: number;
  readonly fx: number;
  readonly fz: number;
  readonly rx: number;
  readonly rz: number;
  readonly cut2: number;
  readonly px: number;
  readonly pz: number;
  /** Slot entries are dense; serials guard reused slots. 0 none, 1 side 0, 2 side 1. */
  readonly sideSlot: number[];
  readonly sideSerial: number[];
  readonly dragons: readonly [TwinDragon, TwinDragon];
  readonly disc: [TwinDisc, TwinDisc];
  /** F0 refs in beast-list order, slot, serial pairs. */
  readonly snapshot: number[];
  readonly book: TwinVictim[];
  /** book index + 1 by beast slot (0: none); the entry's serial is checked, a reused slot starts a new entry. */
  readonly bookAt: number[];
}

export interface TwinPearlState {
  readonly casts: TwinPearlCast[];
}

export function createTwinPearlState(): TwinPearlState {
  return { casts: [] };
}

/** The variant a header asks for key 2 ("line" when absent). */
export const swordKey2Of = (header: { readonly swordKey2?: SwordKey2 }): SwordKey2 | "line" => header.swordKey2 ?? "line";

// ── Cast geometry (integer u, fixed at F0) ─────────────────────────────────

const U = (mm: number): number => mmToU(mm);
type FieldBounds = Pick<StageDef["field"], "minXMm" | "maxXMm" | "minZMm" | "maxZMm">;
type CastGeometry = Pick<TwinPearlCast, "hx" | "hz" | "fx" | "fz" | "rx" | "rz" | "cut2" | "px" | "pz" | "sideSlot" | "sideSerial" | "dragons" | "disc" | "snapshot">;

/** Split long segments before the S polynomial's integer products can overflow. */
export function splitLong(nodes: readonly number[], maxSegU: number): number[] {
  const out = nodes.slice(0, 2);
  for (let i = 2; i < nodes.length; i += 2) {
    const ax = nodes[i - 2]!;
    const az = nodes[i - 1]!;
    const dx = nodes[i]! - ax;
    const dz = nodes[i + 1]! - az;
    const k = Math.max(1, Math.ceil(isqrt(dx * dx + dz * dz) / maxSegU));
    for (let j = 1; j <= k; j += 1) out.push(ax + mulDivSym(dx, j, k), az + mulDivSym(dz, j, k));
  }
  return out;
}

/**
 * The S path over `path`: half-waves of about halfWaveMm per segment (whole numbers, so the offset is 0 at each
 * bend), alternating sides. Side 0 starts at +1, side 1 at −1 on the left-hand normal.
 */
function sPath(path: readonly PointU[], firstSide: number, step: number): { sx: number[]; sz: number[]; arc: number[] } {
  const heads = TWIN_PEARL.heads;
  const amp = U(heads.amplitudeMm);
  const halfWave = U(heads.halfWaveMm);
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
      const x = bx + mulDivSym(-unit.z * off, 1, 1000);
      const z = bz + mulDivSym(unit.x * off, 1, 1000);
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

/** Sample an S path, clamp to the field, then time the clamped arc. */
export function sampleRoute(nodes: readonly number[], sideSign: number, field: FieldBounds): { sx: number[]; sz: number[]; arc: number[]; pass: number[]; step: number } {
  const split = splitLong(nodes, U(TWIN_PEARL.heads.maxSegmentMm));
  const path: PointU[] = [];
  let length = 0;
  for (let i = 0; i < split.length; i += 2) {
    path.push({ x: split[i]!, z: split[i + 1]! });
    if (i > 0) length += isqrt(dist2(split[i - 2]!, split[i - 1]!, split[i]!, split[i + 1]!));
  }
  const step = Math.max(U(TWIN_PEARL.heads.sampleMm), Math.ceil(length / TWIN_PEARL.heads.maxSamples));
  const { sx, sz, arc } = sPath(path, sideSign, step);
  for (let i = 0; i < sx.length; i += 1) {
    sx[i] = clamp(sx[i]!, U(field.minXMm), U(field.maxXMm));
    sz[i] = clamp(sz[i]!, U(field.minZMm), U(field.maxZMm));
    arc[i] = i === 0 ? 0 : arc[i - 1]! + isqrt(dist2(sx[i - 1]!, sz[i - 1]!, sx[i]!, sz[i]!));
  }
  const total = arc[arc.length - 1]!;
  const heads = TWIN_PEARL.heads;
  const pass = arc.map((a) => heads.fromTick + (total === 0 ? 0 : mulDiv(a, heads.toTick - heads.fromTick, total)));
  return { sx, sz, arc, pass, step };
}

function insetPoint(x: number, z: number, field: FieldBounds): PointU {
  const inset = U(TWIN_PEARL.pearl.insetMm);
  const minX = U(field.minXMm), maxX = U(field.maxXMm);
  const minZ = U(field.minZMm), maxZ = U(field.maxZMm);
  return {
    x: minX + inset > maxX - inset ? mulDivSym(minX + maxX, 1, 2) : clamp(x, minX + inset, maxX - inset),
    z: minZ + inset > maxZ - inset ? mulDivSym(minZ + maxZ, 1, 2) : clamp(z, minZ + inset, maxZ - inset),
  };
}

/** Lexicographic permutations of selection indices; the first strictly shortest wins. */
function orderedAnchors(anchors: readonly BeastState[], c: PointU, p: PointU): BeastState[] {
  let bestLength = -1;
  let best: BeastState[] = [];
  const order: BeastState[] = [];
  const used = anchors.map(() => false);
  const visit = (): void => {
    if (order.length === anchors.length) {
      let length = 0;
      let prev = c;
      for (const a of order) { length += isqrt(dist2(prev.x, prev.z, a.x, a.z)); prev = a; }
      length += isqrt(dist2(prev.x, prev.z, p.x, p.z));
      if (bestLength < 0 || length < bestLength) { bestLength = length; best = order.slice(); }
      return;
    }
    for (let i = 0; i < anchors.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      order.push(anchors[i]!);
      visit();
      order.pop();
      used[i] = false;
    }
  };
  visit();
  return best;
}

/** Build solely from bounds, H, C and the damageable F0 snapshot. */
export function buildCastGeometry(world: World, cast: Cast): CastGeometry {
  const h = heartPoint();
  const c = cast.origin;
  const field = world.stage.field;
  const f = { x: 0, z: 0 };
  unitPm(h.x - c.x, h.z - c.z, f);
  if (f.x === 0 && f.z === 0) unitPm(mulDivSym(U(field.minXMm + field.maxXMm), 1, 2) - h.x, mulDivSym(U(field.minZMm + field.maxZMm), 1, 2) - h.z, f);
  if (f.x === 0 && f.z === 0) f.z = -1000;
  const fx = f.x + 0, fz = f.z + 0;
  const rx = -fz + 0, rz = fx + 0;
  const snapshot: number[] = [];
  const beasts: BeastState[] = [];
  for (const beast of world.beasts.list) if (beast.alive && !damageImmune(world, beast)) {
    snapshot.push(beast.slot, beast.serial);
    beasts.push(beast);
  }
  const v = (b: BeastState): number => mulDivSym((b.x - h.x) * rx + (b.z - h.z) * rz, 1, 1000);
  const u = (b: BeastState): number => mulDivSym((b.x - h.x) * fx + (b.z - h.z) * fz, 1, 1000);
  const sorted = beasts.slice().sort((a, b) => v(a) - v(b) || u(a) - u(b) || a.serial - b.serial);
  const half = Math.ceil(sorted.length / 2);
  const cut2 = sorted.length >= 2 ? v(sorted[half - 1]!) + v(sorted[half]!) : sorted.length === 1 ? 2 * v(sorted[0]!) : 0;
  const sideSlot: number[] = [], sideSerial: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const b = sorted[i]!;
    while (sideSlot.length <= b.slot) { sideSlot.push(0); sideSerial.push(0); }
    sideSlot[b.slot] = i < half ? 1 : 2;
    sideSerial[b.slot] = b.serial;
  }
  const ground = beasts.filter((b) => inGroundBand(b.y));
  const centroid = ground.length > 0 ? ground : beasts;
  let px = h.x, pz = h.z;
  if (centroid.length > 0) {
    let x = 0, z = 0;
    for (const b of centroid) { x += b.x; z += b.z; }
    px += mulDivSym(mulDivSym(x, 1, centroid.length) - h.x, TWIN_PEARL.pearl.pullPm, 1000);
    pz += mulDivSym(mulDivSym(z, 1, centroid.length) - h.z, TWIN_PEARL.pearl.pullPm, 1000);
    const len = isqrt(dist2(px, pz, h.x, h.z));
    const max = U(TWIN_PEARL.pearl.maxMm);
    if (len > max) { px = h.x + mulDivSym(px - h.x, max, len); pz = h.z + mulDivSym(pz - h.z, max, len); }
  } else {
    px += mulDivSym(fx, U(TWIN_PEARL.pearl.emptyMm), 1000);
    pz += mulDivSym(fz, U(TWIN_PEARL.pearl.emptyMm), 1000);
  }
  const p = insetPoint(px, pz, field);
  const dragons: TwinDragon[] = [];
  for (let side = 0; side < 2; side += 1) {
    const options = ground.filter((b) => sideSlot[b.slot] === side + 1);
    const anchors: BeastState[] = [];
    while (anchors.length < TWIN_PEARL.anchors.max) {
      let best: BeastState | null = null;
      let bestD = -1;
      for (const b of options) {
        if (anchors.includes(b)) continue;
        let d = dist2(b.x, b.z, h.x, h.z);
        if (anchors.length > 0) {
          d = Math.min(dist2(b.x, b.z, c.x, c.z), dist2(b.x, b.z, p.x, p.z));
          for (const a of anchors) d = Math.min(d, dist2(b.x, b.z, a.x, a.z));
        }
        if (d > bestD || (d === bestD && best !== null && b.serial < best.serial)) { best = b; bestD = d; }
      }
      const gap = U(TWIN_PEARL.anchors.minGapMm);
      if (best === null || (anchors.length > 0 && bestD < gap * gap)) break;
      anchors.push(best);
    }
    const points: PointU[] = [c];
    if (anchors.length > 0) points.push(...orderedAnchors(anchors, c, p));
    else {
      const sign = side === 0 ? -1 : 1;
      points.push(insetPoint(h.x + sign * mulDivSym(rx, U(TWIN_PEARL.wingMm), 1000), h.z + sign * mulDivSym(rz, U(TWIN_PEARL.wingMm), 1000), field));
    }
    points.push(p);
    const nodes: number[] = [];
    for (const a of points) if (nodes.length === 0 || nodes[nodes.length - 2] !== a.x || nodes[nodes.length - 1] !== a.z) nodes.push(a.x, a.z);
    const { sx, sz, arc, pass } = sampleRoute(nodes, side === 0 ? 1 : -1, field);
    let petalFrom = 0;
    while (arc[arc.length - 1]! - arc[petalFrom]! > U(TWIN_PEARL.lotus.petalLengthMm)) petalFrom += 1;
    const sky: number[] = [];
    for (const b of beasts) if (sideSlot[b.slot] === side + 1 && inSkyBand(b.y)) sky.push(b.x, b.z);
    dragons.push({ nodes, sx, sz, arc, pass, petalFrom, sky });
  }
  return { hx: h.x, hz: h.z, fx, fz, rx, rz, cut2, px: p.x, pz: p.z, sideSlot, sideSerial, dragons: [dragons[0]!, dragons[1]!], disc: [{ on: 0, x: 0, z: 0, sky: 0 }, { on: 0, x: 0, z: 0, sky: 0 }], snapshot };
}

// ── Volumes (u; tick offsets from F0) ──────────────────────────────────────
const GROUND_TOP = U(TWIN_PEARL.groundTopMm);
const SKY_BOTTOM = U(TWIN_PEARL.sky.bottomMm);
const SKY_TOP = U(TWIN_PEARL.sky.topMm);
const BODY_R = U(TWIN_PEARL.heads.radiusMm);
const SKY_R = U(TWIN_PEARL.sky.radiusMm);
const PETAL_HALF_W = U(TWIN_PEARL.lotus.petalHalfWidthMm);

export const inGroundBand = (y: number): boolean => y <= GROUND_TOP;
export const inSkyBand = (y: number): boolean => y >= SKY_BOTTOM && y <= SKY_TOP;
export const inHoldDisc = (cast: CastGeometry, x: number, z: number): boolean => within(x, z, cast.hx, cast.hz, U(TWIN_PEARL.hold.radiusMm));
export const inDisc = (disc: TwinDisc, x: number, z: number): boolean => disc.on !== 0 && within(x, z, disc.x, disc.z, U(TWIN_PEARL.touch.radiusMm));

/** Inclusive live sample range; last < first when no samples live. */
export function liveSamples(dragon: TwinDragon, t: number, out: { first: number; last: number }): void {
  out.first = 0;
  out.last = -1;
  if (t < TWIN_PEARL.heads.fromTick) return;
  const pass = dragon.pass;
  let first = 0;
  while (first < pass.length && pass[first]! + TWIN_PEARL.trailTicks < t) first += 1;
  let last = first - 1;
  while (last + 1 < pass.length && pass[last + 1]! <= t) last += 1;
  out.first = first;
  out.last = last;
}

export function inSpan(dragon: TwinDragon, first: number, last: number, x: number, z: number, r: number): boolean {
  const r2 = r * r;
  for (let i = first; i <= last; i += 1) if (dist2(x, z, dragon.sx[i]!, dragon.sz[i]!) <= r2) return true;
  return false;
}

export function headIndex(dragon: TwinDragon, t: number): number {
  const tick = Math.min(t, TWIN_PEARL.heads.toTick);
  let last = -1;
  while (last + 1 < dragon.pass.length && dragon.pass[last + 1]! <= tick) last += 1;
  return last;
}

/** Squared distance to an integer projection onto a segment (zero-length safe). */
export function distSegment2(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len = isqrt(dx * dx + dz * dz);
  if (len === 0) return dist2(x, z, ax, az);
  const dot = (x - ax) * dx + (z - az) * dz;
  const along = clamp(Math.floor(dot / len), 0, len);
  return dist2(x, z, ax + mulDivSym(dx, along, len), az + mulDivSym(dz, along, len));
}

const span = { first: 0, last: -1 };
export function inBody(dragon: TwinDragon, x: number, z: number, t: number): boolean {
  liveSamples(dragon, t, span);
  return inSpan(dragon, span.first, span.last, x, z, BODY_R);
}

export function inSkyReach(cast: CastGeometry, x: number, z: number, t: number): boolean {
  if (t < TWIN_PEARL.sky.fromTick || t > TWIN_PEARL.sky.toTick) return false;
  for (const dragon of cast.dragons) {
    const head = headIndex(dragon, t);
    if (head >= 0) for (let i = 0; i < dragon.sky.length; i += 2) {
      if (distSegment2(x, z, dragon.sx[head]!, dragon.sz[head]!, dragon.sky[i]!, dragon.sky[i + 1]!) <= SKY_R * SKY_R) return true;
    }
    liveSamples(dragon, t, span);
    if (inSpan(dragon, span.first, span.last, x, z, SKY_R)) return true;
  }
  return false;
}

/** Full on the core, H disc and the last 13 m of each sampled path; half elsewhere in P's 9 m disc. */
export function lotusRegion(cast: CastGeometry, x: number, z: number): 0 | 1 | 2 {
  if (within(x, z, cast.px, cast.pz, U(TWIN_PEARL.lotus.coreMm)) || inHoldDisc(cast, x, z)) return 2;
  for (const d of cast.dragons) for (let k = Math.max(0, d.petalFrom - 1); k + 1 < d.sx.length; k += 1) {
    if (distSegment2(x, z, d.sx[k]!, d.sz[k]!, d.sx[k + 1]!, d.sz[k + 1]!) <= PETAL_HALF_W * PETAL_HALF_W) return 2;
  }
  return within(x, z, cast.px, cast.pz, U(TWIN_PEARL.lotus.radiusMm)) ? 1 : 0;
}

/** 1 F0 disc, 2 F1 disc, 4 body, 8 sky, 16 full lotus, 32 half lotus. */
export function volumesAt(cast: CastGeometry, x: number, y: number, z: number, t: number): number {
  let bits = 0;
  const ground = inGroundBand(y), sky = inSkyBand(y);
  if (ground && t === TWIN_PEARL.hold.tick && inHoldDisc(cast, x, z)) bits |= 1;
  if (t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick) {
    for (const d of cast.disc) if ((d.sky === 0 ? ground : sky) && inDisc(d, x, z)) bits |= 2;
  }
  if (ground && (inBody(cast.dragons[0], x, z, t) || inBody(cast.dragons[1], x, z, t))) bits |= 4;
  if (sky && inSkyReach(cast, x, z, t)) bits |= 8;
  if (ground && t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick) {
    const region = lotusRegion(cast, x, z);
    if (region === 2) bits |= 16;
    else if (region === 1) bits |= 32;
  }
  return bits;
}

/** F0 points reached by any correctly banded volume over the whole cast, without damage limits. */
export function staticCoverage(cast: CastGeometry, points: readonly { x: number; z: number; y: number }[]): number {
  let count = 0;
  for (const p of points) for (let t = TWIN_PEARL.hold.tick; t <= TWIN_PEARL_END_TICK; t += 1) {
    if (volumesAt(cast, p.x, p.y, p.z, t) !== 0) { count += 1; break; }
  }
  return count;
}

// ── Casting ────────────────────────────────────────────────────────────────

/** Today's key-2 falloff for the n-th distinct victim of a side, ‰ (data/school-kiem.ts: −15 % each next, floor 40 %). */
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

/** A snapshot side stays fixed; late or reused slots are assigned once by cut2. */
export function sideFor(cast: TwinPearlCast, beast: BeastState): number {
  if ((cast.sideSlot[beast.slot] ?? 0) !== 0 && cast.sideSerial[beast.slot] === beast.serial) return cast.sideSlot[beast.slot]! - 1;
  const v = mulDivSym((beast.x - cast.hx) * cast.rx + (beast.z - cast.hz) * cast.rz, 1, 1000);
  const side = 2 * v < cast.cut2 ? 0 : 2 * v > cast.cut2 ? 1 : beast.serial % 2;
  while (cast.sideSlot.length <= beast.slot) { cast.sideSlot.push(0); cast.sideSerial.push(0); }
  cast.sideSlot[beast.slot] = side + 1;
  cast.sideSerial[beast.slot] = beast.serial;
  return side;
}

/** The cast's budget (effective HP) per side and part: M_q and the bucket as on every hit, no element (content `pool`). */
export function twinPearlPool(world: World, seat: number, grade: Grade): number[] {
  const pool = TWIN_PEARL.pool;
  const shares = TWIN_PEARL.sharesPct;
  const side = scaleHit(world, seat, wHpOf(world, pool.sideW100), grade, "slot2", null);
  const one = [0, 0, 0, 0];
  one[POOL_TOUCH] = mulDiv(side, shares.touch, 100);
  one[POOL_CORRIDOR] = mulDiv(side, shares.corridor, 100);
  one[POOL_SKY] = scaleHit(world, seat, wHpOf(world, pool.skyW100), grade, "slot2", null);
  one[POOL_LOTUS] = mulDiv(side, shares.lotus, 100);
  return [...one, ...one];
}

/**
 * Resolves only with a damageable beast in the ground or sky band (§9.2; roar is immune, canon §10.5).
 * Otherwise the Cast stays held. Hits begin this tick (F0) in stepTwinPearl.
 */
export function resolveTwinPearl(world: World, cast: Cast): boolean {
  const state = world.skills.twinPearl;
  if (state === undefined) return false;
  if (!world.beasts.list.some((beast) => beast.alive && !damageImmune(world, beast) && (inGroundBand(beast.y) || inSkyBand(beast.y)))) return false;
  const effect = kiemSkill(2).effect;
  if (effect.kind !== "line") return false;
  const pool = twinPearlPool(world, cast.seat, cast.quality);
  const geometry = buildCastGeometry(world, cast);
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
    sideVictims: [0, 0],
    pool,
    poolStart: pool.slice(),
    area: createAreaHit(),
    ...geometry,
    book: [],
    bookAt: [],
  });
  return true;
}

/** F1 targets come only from the F0 snapshot and must have positive damage capacity. */
export function pickDiscs(world: World, cast: TwinPearlCast): void {
  for (let side = 0; side < 2; side += 1) {
    let best: BeastState | null = null;
    let bestD = 0;
    for (let i = 0; i < cast.snapshot.length; i += 2) {
      const slot = cast.snapshot[i]!, serial = cast.snapshot[i + 1]!;
      if (cast.sideSlot[slot] !== side + 1 || cast.sideSerial[slot] !== serial) continue;
      const b = beastByRef(world, { slot, serial });
      if (b === null || damageImmune(world, b)) continue;
      const ground = inGroundBand(b.y);
      if (!ground && !inSkyBand(b.y)) continue;
      const kind = ground ? "touch" : "corridor";
      const part = ground ? POOL_TOUCH : POOL_SKY;
      if (!mayHit(cast, b, kind, TWIN_PEARL.touch.fromTick) || cast.pool[side * POOL_PARTS + part]! <= 0) continue;
      if (b.boss && cast.bossDealt >= cast.bossCap) continue;
      if (b.cluster >= 0 && areaClusterLeft(world, cast.area, b.cluster) <= 0) continue;
      const d = dist2(b.x, b.z, cast.hx, cast.hz);
      if (best === null || d < bestD || (d === bestD && b.serial < best.serial)) { best = b; bestD = d; }
    }
    if (best !== null) cast.disc[side] = { on: 1, x: best.x, z: best.z, sky: inGroundBand(best.y) ? 0 : 1 };
  }
}

function bookOf(cast: TwinPearlCast, beast: BeastState): TwinVictim | null {
  const at = cast.bookAt[beast.slot] ?? 0;
  if (at === 0) return null;
  const entry = cast.book[at - 1]!;
  return entry.serial === beast.serial ? entry : null;
}

/** May `beast` take a hit of `kind` at tick offset t (≤ 3 a cast, one of each kind, ≥ 20 ticks apart, the Vương under his cap)? */
export function mayHit(cast: TwinPearlCast, beast: BeastState, kind: TwinKind, t: number): boolean {
  if (beast.boss && cast.bossDealt >= cast.bossCap) return false;
  const entry = bookOf(cast, beast);
  if (entry === null) return true;
  return entry.hits < TWIN_PEARL.maxHits && (entry.kinds & KIND_BIT[kind]) === 0 && t - entry.last >= TWIN_PEARL.rehitTicks;
}

/**
 * One hit of `kind` on `beast` (checked by mayHit) from its side's `part` of the budget, at most what is left there;
 * `half` for the lotus outside its petals. A spent part leaves the beast as it was (no book entry, no Thế).
 */
function hit(world: World, cast: TwinPearlCast, beast: BeastState, kind: TwinKind, part: number, half: boolean, t: number): void {
  let entry = bookOf(cast, beast);
  const side = entry !== null ? entry.side : sideFor(cast, beast);
  const at = side * POOL_PARTS + part;
  const left = cast.pool[at]!;
  if (left <= 0) return;
  if (entry === null) {
    entry = { slot: beast.slot, serial: beast.serial, side, hits: 0, last: -1, kinds: 0, factorPm: falloffPm(cast.sideVictims[side]!) };
    cast.book.push(entry);
    while (cast.bookAt.length <= beast.slot) cast.bookAt.push(0);
    cast.bookAt[beast.slot] = cast.book.length;
    cast.sideVictims[side] = cast.sideVictims[side]! + 1;
    cast.victims += 1;
  }
  entry.hits += 1;
  entry.last = t;
  entry.kinds |= KIND_BIT[kind];
  const p = mulDiv(cast.baseHp, TWIN_PEARL.sharesPct[kind], 100);
  const factorPm = half ? mulDiv(entry.factorPm, TWIN_PEARL.lotus.outsidePm, 1000) : entry.factorPm;
  const bossLeft = cast.bossCap - cast.bossDealt;
  const limit = beast.boss && bossLeft < left ? bossLeft : left;
  const dealt = damageBeast(world, beast, p, "typed", { seat: cast.seat, source: "slot2", grade: cast.grade, factorPm, area: cast.area, limit });
  cast.pool[at] = left - dealt;
  cast.dealt += dealt;
  if (beast.boss) cast.bossDealt += dealt;
  const posture = postureOf(kind);
  if (posture > 0) postureHit(world, beast, posture, "slot2");
}

/** A beast some volume holds this tick: what it may take, and its place in the tick's one order. */
interface Candidate {
  beast: BeastState;
  kind: TwinKind;
  part: number;
  half: boolean;
  /** Squared distance to H. */
  d: number;
}

const candidates: Candidate[] = [];
const spareCandidates: Candidate[] = [];
const spanA = { first: 0, last: -1 };
const spanB = { first: 0, last: -1 };

const byTickOrder = (p: Candidate, q: Candidate): number => KIND_ORDER[p.kind] - KIND_ORDER[q.kind] || p.d - q.d || p.beast.serial - q.beast.serial;

/**
 * One tick of a cast: every beast the live volumes hold (one pass, each beast's first kind it may still take, in the
 * order touch, corridor, lotus), then the hits in one order for both sides: kind, nearest the heart,
 * smaller beastId.
 */
function stepCast(world: World, cast: TwinPearlCast, t: number): void {
  const [a, b] = cast.dragons;
  if (t === TWIN_PEARL.touch.fromTick) pickDiscs(world, cast);
  const hold = t === TWIN_PEARL.hold.tick;
  const touch = t >= TWIN_PEARL.touch.fromTick && t <= TWIN_PEARL.touch.toTick;
  liveSamples(a, t, spanA);
  liveSamples(b, t, spanB);
  const body = spanA.last >= spanA.first || spanB.last >= spanB.first;
  const sky = t >= TWIN_PEARL.sky.fromTick && t <= TWIN_PEARL.sky.toTick;
  const lotus = t >= TWIN_PEARL.lotus.fromTick && t <= TWIN_PEARL.lotus.toTick;
  if (!hold && !touch && !body && !sky && !lotus) return;
  const discHolds = (air: boolean, x: number, z: number): boolean => cast.disc.some((d) => (d.sky !== 0) === air && inDisc(d, x, z));
  for (const beast of world.beasts.list) {
    if (!beast.alive || damageImmune(world, beast)) continue;
    const x = beast.x;
    const z = beast.z;
    const ground = inGroundBand(beast.y);
    let kind: TwinKind | null = null;
    let part = 0;
    let half = false;
    if (ground && mayHit(cast, beast, "touch", t) && ((hold && inHoldDisc(cast, x, z)) || (touch && discHolds(false, x, z)))) {
      kind = "touch";
      part = POOL_TOUCH;
    } else if (inSkyBand(beast.y) && touch && mayHit(cast, beast, "corridor", t) && discHolds(true, x, z)) {
      kind = "corridor";
      part = POOL_SKY;
    } else if (ground && body && mayHit(cast, beast, "corridor", t) && (inSpan(a, spanA.first, spanA.last, x, z, BODY_R) || inSpan(b, spanB.first, spanB.last, x, z, BODY_R))) {
      kind = "corridor";
      part = POOL_CORRIDOR;
    } else if (inSkyBand(beast.y) && sky && mayHit(cast, beast, "corridor", t) && inSkyReach(cast, x, z, t)) {
      kind = "corridor";
      part = POOL_SKY;
    } else if (ground && lotus && mayHit(cast, beast, "lotus", t)) {
      const region = lotusRegion(cast, x, z);
      if (region !== 0) {
        kind = "lotus";
        part = POOL_LOTUS;
        half = region === 1;
      }
    }
    if (kind === null) continue;
    const item = spareCandidates.pop() ?? { beast, kind, part, half, d: 0 };
    item.beast = beast;
    item.kind = kind;
    item.part = part;
    item.half = half;
    item.d = dist2(x, z, cast.hx, cast.hz);
    candidates.push(item);
  }
  if (candidates.length === 0) return;
  candidates.sort(byTickOrder);
  for (const item of candidates) if (item.beast.alive) hit(world, cast, item.beast, item.kind, item.part, item.half, t);
  for (const item of candidates) spareCandidates.push(item);
  candidates.length = 0;
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
