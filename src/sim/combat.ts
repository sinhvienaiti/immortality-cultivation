// Source: games/dragon-hold/src/sim/combat.ts @06cd4e6 (adapted: the damage part only — canon §7.2 order on whole HP with a half-up mulDiv at each step, typed hits ignore armour, the area cap per swarm cluster, the 4 m / 50 % redirect; no lock protection, no minimum damage; world.ts emits `death`)
/**
 * Damage (canon §7.2, D38): whole HP; order P → × M_q → × M_hệ → × (1 + Σ
 * bucket, ≤ +50 %) → × extra (falloff, pierce, redirect) → × vulnerable (phá
 * thế × 1.5) → armour or resist (non-typed only: G / (G + 100), ≤ 75 %) →
 * cluster cap (one area hit takes ≤ 60 % of a swarm cluster's HP now) → HP
 * left, each step a half-up `mulDiv`. Typed hits ignore armour. A hit whose
 * target died first goes to the nearest live beast within 4 m at 50 %.
 * `damageBeast` sets hp, alive, killedBy and killedBySeat, books the share
 * (effective damage only, shares.ts), emits `hit`, gives typed damage's Thế
 * (posture.ts postureFromTypedHp), skips damage-immune beasts (the Vương's
 * roar) and stamps `lastHitTick` (Hồi Nguyên); world.ts cleanup emits `death`.
 * Đánh nền (`auto`) is checked here: range from `origin`, the school's rate,
 * not while down; it lands +18 ticks later in `stepAutoHits`.
 * Owner: Lane 4.
 */
import { HIT_TIER, SCHOOL_ELEMENT, kiemSkill } from "../content/data/school-kiem";
import { DAMAGE, ELEMENT, FORMATION, GRADE, STRENGTH } from "../content/rules";
import type { BeastRef, BeastState, DamageType, Element, FeedbackTier, Grade, HitSource, PendingStrike, PointU, SimCommand, World } from "../content/types";
import { emit } from "./events";
import { dist2, mmToU, msToTicks, mulDiv, uToM, within } from "./fixed";
import { damageImmune, isBroken, postureFromTypedHp } from "./posture";
import { bucketAdd } from "./shares";
import { speciesDef } from "./targeting";

/** Who dealt a hit (share bucket and reports follow `source`). */
export interface HitBy {
  readonly seat: number;
  readonly source: HitSource;
  readonly grade: Grade | null;
  /** `amount` already went through P → M_q → M_hệ → bucket (ô 1 splits one word's damage after that part). */
  readonly scaled?: boolean;
  /** Extra factor ‰ after the bucket: ô 2 falloff, ô 1 pierce, the 50 % redirect. */
  readonly factorPm?: number;
  /** One area hit's swarm-cluster cap (createAreaHit); null for single-target hits. */
  readonly area?: AreaHit | null;
  /** At most this much HP from this hit (Lạc Kiếm Trận's 4 W a cast), applied with the cluster cap. */
  readonly limit?: number;
}

/** The 60 % swarm-cluster budget of one area hit (canon §7.2, BALANCE §9.1). */
export interface AreaHit {
  readonly clusters: number[];
  readonly left: number[];
}

export const createAreaHit = (): AreaHit => ({ clusters: [], left: [] });

// ── Units and factors ──────────────────────────────────────────────────────

/** HP of W × 100 at the world's realm: W × 90 × g(K) (canon §7.1), half up. */
export function wHpOf(world: World, w100: number): number {
  return mulDiv(w100 * STRENGTH.wHp, world.gPm, 100_000);
}

/** P_ref(K) = 100 × g(K) HP: one ô 1 word of quality 1.00 (canon §7.1, §12.1). */
export function pRefOf(world: World): number {
  return mulDiv(STRENGTH.pRefHp, world.gPm, 1000);
}

/** reduction = G / (G + 100), capped at 75 %, in permille (canon §7.2). */
export function reductionPm(armourG: number): number {
  if (armourG <= 0) return 0;
  const pm = mulDiv(armourG, 1000, armourG + 100);
  const cap = DAMAGE.reductionCapPct * 10;
  return pm > cap ? cap : pm;
}

const TYPED: ReadonlySet<HitSource> = new Set<HitSource>(["slot1", "slot2", "slot4", "slot5", "seal", "cleanse"]);
const SKILLS: ReadonlySet<HitSource> = new Set<HitSource>(["slot1", "slot2", "slot4", "slot5"]);

/** Hits from words (canon §7.2 "Gõ"). */
export const isTypedSource = (source: HitSource): boolean => TYPED.has(source);

/** M_hệ ‰ (canon §11, D23): counter × 1.30, countered × 0.80, within 0.60–1.60; vô hệ on either side: 1.00. */
export function elementPm(attack: Element | null, target: Element | null): number {
  if (attack === null || target === null) return 1000;
  let pm = 1000;
  if (ELEMENT.counters[attack] === target) pm = ELEMENT.counterPm;
  else if (ELEMENT.counters[target] === attack) pm = ELEMENT.counteredPm;
  return pm > DAMAGE.elementMaxPm ? DAMAGE.elementMaxPm : pm < DAMAGE.elementMinPm ? DAMAGE.elementMinPm : pm;
}

/** The solo Tâm nhãn is lit (not captured): Công, Thủ and Dưỡng work (canon §8.2). */
export function tamNhanOn(world: World): boolean {
  const node = world.formation.nodes[0];
  return node !== undefined && node.on;
}

/**
 * Σ of the seat's same-bucket increases for skill damage, ‰ (canon §7.2: ≤ +50 %):
 * Tâm nhãn Công +8 % while lit (canon §8.2), Tích Kiếm −8 % … +24 % (canon §12.1).
 * Đánh nền, mechanisms and đan phù get none.
 */
export function bucketPm(world: World, seat: number, source: HitSource): number {
  if (!SKILLS.has(source)) return 0;
  let pm = tamNhanOn(world) ? FORMATION.tamNhan.attackPct * 10 : 0;
  const state = world.seats[seat];
  if (state !== undefined && state.loadout.tamPhap === "tich-kiem") pm += world.skills.seats[seat]?.tichKiemPm ?? 0;
  const cap = DAMAGE.bucketCapPct * 10;
  return pm > cap ? cap : pm;
}

/** P → × M_q → × M_hệ → × (1 + Σ bucket) (canon §7.2), half up at each step. */
export function scaleHit(world: World, seat: number, p: number, grade: Grade | null, source: HitSource, target: Element | null): number {
  let d = p;
  if (grade !== null) d = mulDiv(d, GRADE.mqPm[grade], 1000);
  const element = elementPm(isTypedSource(source) ? SCHOOL_ELEMENT : null, target);
  if (element !== 1000) d = mulDiv(d, element, 1000);
  const bucket = bucketPm(world, seat, source);
  if (bucket !== 0) d = mulDiv(d, 1000 + bucket, 1000);
  return d;
}

/** One ô 1 word's damage, computed once (canon §12.1, D38): P_ref × M_q × M_hệ × (1 + bucket). */
export function wordDamage(world: World, seat: number, grade: Grade, target: Element | null = null): number {
  return scaleHit(world, seat, pRefOf(world), grade, "slot1", target);
}

/** A word's damage over `swords` swords: equal shares, the rest on the last (canon §12.1, D38). */
export function splitWord(total: number, swords: number): number[] {
  const n = swords > 0 ? swords : 1;
  const share = Math.floor(total / n);
  const out: number[] = [];
  for (let k = 0; k < n; k += 1) out.push(k === n - 1 ? total - share * (n - 1) : share);
  return out;
}

// ── Damage to beasts ───────────────────────────────────────────────────────

/** The live beast a ref names, or null (dead, freed, or the slot reused). */
export function beastByRef(world: World, ref: BeastRef): BeastState | null {
  const beast = world.beasts.list[ref.slot];
  return beast !== undefined && beast.alive && beast.serial === ref.serial ? beast : null;
}

/** HP this area hit may still take from `cluster`: 60 % of the cluster's HP when the hit first meets it (floor, as Rồng). */
function clusterLeft(world: World, area: AreaHit, cluster: number): number {
  const at = area.clusters.indexOf(cluster);
  if (at >= 0) return area.left[at]!;
  let hp = 0;
  for (const mate of world.beasts.list) if (mate.alive && mate.cluster === cluster) hp += mate.hp;
  const left = Math.floor((hp * DAMAGE.clusterCapPct) / 100);
  area.clusters.push(cluster);
  area.left.push(left);
  return left;
}

function clusterTake(area: AreaHit, cluster: number, amount: number): void {
  const at = area.clusters.indexOf(cluster);
  if (at >= 0) area.left[at] = area.left[at]! - amount;
}

const tierOf = (source: HitSource, grade: Grade | null): FeedbackTier => {
  const base = HIT_TIER[source];
  return grade === "flash" || grade === "perfect" ? ((base < 5 ? base + 1 : 5) as FeedbackTier) : base;
};

/**
 * Deals `amount` (P before multipliers, or a scaled share with `by.scaled`) to
 * `beast`; returns the effective damage (≤ HP left). Sets alive, hp, killedBy,
 * killedBySeat and lastHitTick, emits `hit`; world.ts cleanup emits `death`.
 */
export function damageBeast(world: World, beast: BeastState, amount: number, type: DamageType, by: HitBy): number {
  if (!beast.alive || amount <= 0 || world.phase === "victory" || world.phase === "defeat") return 0;
  // The Vương's roar between phases: no damage (canon §10.5).
  if (damageImmune(world, beast)) return 0;
  let d = by.scaled === true ? amount : scaleHit(world, by.seat, amount, by.grade, by.source, speciesDef(beast.species).element);
  const factor = by.factorPm ?? 1000;
  if (factor !== 1000) d = mulDiv(d, factor, 1000);
  if (isBroken(world, beast)) d = mulDiv(d, DAMAGE.brokenPm, 1000);
  if (type !== "typed") {
    const tier = type === "physical" ? beast.armour : beast.resist;
    const reduction = reductionPm(DAMAGE.armourG[tier] ?? 0);
    if (reduction > 0) d = mulDiv(d, 1000 - reduction, 1000);
  }
  const area = by.area ?? null;
  if (area !== null && beast.cluster >= 0) {
    const left = clusterLeft(world, area, beast.cluster);
    if (d > left) d = left;
  }
  if (by.limit !== undefined && d > by.limit) d = by.limit;
  if (d > beast.hp) d = beast.hp;
  if (d <= 0) return 0;
  beast.hp -= d;
  beast.lastHitTick = world.tick;
  if (area !== null && beast.cluster >= 0) clusterTake(area, beast.cluster, d);
  bucketAdd(world, by.source, d);
  emit(world, {
    type: "hit",
    beast: { slot: beast.slot, serial: beast.serial },
    amount: d,
    damageType: type,
    bucket: isTypedSource(by.source) ? "typed" : by.source === "auto" ? "auto" : by.source === "mechanism" ? "mechanism" : by.source === "consumable" ? "consumable" : "formation",
    source: by.source,
    seat: by.seat,
    grade: by.grade,
    tier: tierOf(by.source, by.grade),
    x: uToM(beast.x),
    z: uToM(beast.z),
    hpLeft: beast.hp,
  });
  if (beast.hp > 0) {
    // Each whole W of typed damage takes 1 Thế (canon §10.7).
    if (type === "typed") postureFromTypedHp(world, beast, d, by.source);
    return d;
  }
  beast.alive = false;
  beast.hp = 0;
  beast.killedBy = by.source;
  beast.killedBySeat = by.seat;
  return d;
}

/** The nearest live beast within 4 m of (x, z) (canon §7.2 redirect), ties to the smaller beastId. */
export function redirectTarget(world: World, x: number, z: number): BeastState | null {
  const radius = mmToU(DAMAGE.redirectMm);
  let best: BeastState | null = null;
  let bestD = 0;
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    const d = dist2(beast.x, beast.z, x, z);
    if (d > radius * radius) continue;
    if (best === null || d < bestD || (d === bestD && beast.serial < best.serial)) {
      best = beast;
      bestD = d;
    }
  }
  return best;
}

/**
 * Live beasts within `radiusU` of (cx, cz) for one area hit, nearest the centre
 * first (ties: smaller beastId), so a capped cluster loses its nearest members.
 */
export function areaVictims(world: World, cx: number, cz: number, radiusU: number, keep: (beast: BeastState) => boolean = () => true): BeastState[] {
  const out: BeastState[] = [];
  for (const beast of world.beasts.list) if (beast.alive && within(beast.x, beast.z, cx, cz, radiusU) && keep(beast)) out.push(beast);
  out.sort((a, b) => dist2(a.x, a.z, cx, cz) - dist2(b.x, b.z, cx, cz) || a.serial - b.serial);
  return out;
}

/** A slow refreshed each tick lasts this long after its source lets go (it binds the next tick's move). */
export const SLOW_LINGER_TICKS = 2;

/**
 * Slows `beast` by `pct` from `source` (canon §7.2: same source keeps the
 * strongest, sources multiply in beasts.ts slowFactorPm, ≤ 60 % in all); one
 * entry per source, refreshed in place.
 */
export function addSlow(world: World, beast: BeastState, source: string, pct: number, ticks: number = SLOW_LINGER_TICKS): void {
  const until = world.tick + ticks;
  for (const slow of beast.slows) {
    if (slow.source !== source) continue;
    if (slow.until <= world.tick || pct > slow.pct) slow.pct = pct;
    if (until > slow.until) slow.until = until;
    return;
  }
  beast.slows.push({ source, pct, until });
}

// ── Pending strikes (đánh nền here, Kiếm skills in skills.ts) ──────────────

/** Queues a strike on `world.skills.strikes` with the next id (creation order = landing order within a tick). */
export function queueStrike(world: World, strike: Omit<PendingStrike, "id">): PendingStrike {
  const skills = world.skills;
  const queued = { id: skills.nextId, ...strike } as PendingStrike;
  skills.nextId += 1;
  skills.strikes.push(queued);
  return queued;
}

/** Where a strike's target was: the dead beast while its slot still holds it, else the point saved at launch. */
function lastPoint(world: World, strike: PendingStrike): PointU {
  const ref = strike.target;
  if (ref !== null) {
    const old = world.beasts.list[ref.slot];
    if (old !== undefined && old.serial === ref.serial) return { x: old.x, z: old.z };
  }
  return strike.to;
}

/**
 * Lands a single-target strike (đánh nền, an ô 1 sword) on its target, or at
 * 50 % on the nearest beast within 4 m of where the target died (canon §7.2).
 * Returns the beast it hit, or null.
 */
export function landTargeted(world: World, strike: PendingStrike, type: DamageType, scaled: boolean): BeastState | null {
  let beast = strike.target === null ? null : beastByRef(world, strike.target);
  let factorPm = 1000;
  if (beast === null) {
    const from = lastPoint(world, strike);
    beast = redirectTarget(world, from.x, from.z);
    if (beast === null) return null;
    factorPm = DAMAGE.redirectPct * 10;
  }
  damageBeast(world, beast, strike.amount, type, { seat: strike.seat, source: strike.source, grade: strike.grade, scaled, factorPm });
  return beast;
}

const reject = (world: World, reason: string): void => emit(world, { type: "rejected", command: "auto", reason });

/** `auto` from `local`: the school's rate, range from `origin`, not while down; lands at +18 ticks (canon §9.3, §12.1). */
export function applyAuto(world: World, command: Extract<SimCommand, { type: "auto" }>): void {
  const seat = world.seats[command.seat];
  const skills = world.skills.seats[command.seat];
  if (seat === undefined || skills === undefined) return reject(world, "seat");
  if (seat.downUntil > world.tick) return reject(world, "down");
  if (world.tick < skills.autoReadyAt) return reject(world, "cooldown");
  const def = kiemSkill("auto");
  if (def.effect.kind !== "auto") return reject(world, "skill");
  const beast = beastByRef(world, command.beast);
  if (beast === null) return reject(world, "target");
  if (!within(beast.x, beast.z, command.origin.x, command.origin.z, mmToU(def.effect.rangeMm))) return reject(world, "range");
  skills.autoReadyAt = world.tick + msToTicks(def.effect.everyMs);
  queueStrike(world, {
    tick: world.tick + def.effect.hitTick,
    seat: command.seat,
    skill: def.id,
    source: "auto",
    actionId: -1,
    target: { slot: beast.slot, serial: beast.serial },
    at: { x: command.origin.x, z: command.origin.z },
    amount: wHpOf(world, def.effect.w100),
    grade: null,
    posture: 0,
    kind: "auto",
    launchTick: world.tick,
    to: { x: beast.x, z: beast.z },
    bandLast: false,
    part: 0,
  });
  emit(world, { type: "skill-fx", seat: command.seat, skill: def.id, stage: "auto", x: uToM(command.origin.x), z: uToM(command.origin.z), toX: uToM(beast.x), toZ: uToM(beast.z), count: 1 });
}

/** Lands đánh nền hits on their tick (physical: armour applies, canon §9.3). */
export function stepAutoHits(world: World): void {
  const strikes = world.skills.strikes;
  let keep = 0;
  for (let index = 0; index < strikes.length; index += 1) {
    const strike = strikes[index]!;
    if (strike.kind === "auto" && strike.tick <= world.tick) {
      landTargeted(world, strike, "physical", false);
      continue;
    }
    strikes[keep] = strike;
    keep += 1;
  }
  strikes.length = keep;
}

/** Cleanup: kill consequences of combat (stats; Linh Sa and Thú Hạch are economy.ts). */
export function onBeastKilled(world: World, _beast: BeastState): void {
  world.stats.kills += 1;
}
