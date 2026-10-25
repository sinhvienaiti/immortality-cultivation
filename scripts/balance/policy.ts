// Source: games/dragon-hold/scripts/balance/policy.ts @06cd4e6 (adapted: canon §18.3 slot order Tẩy → Ấn → ô 5 → ô 2 → ô 4 → ô 3 → ô 1 with the tactics rules of PB-05; Hộ thân against telegraphs on the player or the Tâm nhãn; the M0a shop's 6 slots and đan phù; the Cơ động walk; no lanes)
/**
 * What a bot decides (canon §18.3, PB-05, D46), reading the world and its own
 * `local` layer only, never the future:
 *  - which Bàn Quyết word to type: Tẩy → Ấn → ô 5 → ô 2 → ô 4 → ô 3 → ô 1
 *    (Học: ô 4 before ô 5), a skill only with a target in its reach from
 *    where the player stands (a person sees the field), ô 3 (Hộ thân) only
 *    while a telegraph is about to hit the player or the Tâm nhãn. Tốt keeps
 *    the order; Vừa leaves a word that just became ready alone for 1–2 s at
 *    random (half the time, on the bot's own seeded dice); Kém picks at random;
 *  - what to buy in prep and breaks (Kém / Vừa / Tốt / best for Không gõ;
 *    Chỉ gõ never buys) and when to use đan phù;
 *  - where Cơ động walks: out of a telegraph about to strike it, else to keep
 *    the crowd nearest the heart within 12 m. Đứng yên never moves.
 * Numbers here are the bots' habits, not rules (đề xuất của vòng này, chờ chủ
 * dự án xác nhận); the rules stay in src/content.
 * Owner: Lane 7.
 */
import { CONSUMABLE_DEFS } from "../../src/content/data/consumables";
import { MECHANISM_DEFS } from "../../src/content/data/mechanisms";
import { kiemSkill } from "../../src/content/data/school-kiem";
import { TELEGRAPHS } from "../../src/content/data/telegraphs";
import { MECHANISMS, PLAYER, quantizeOrigin } from "../../src/content/rules";
import type { BeastState, ConsumableId, LiveWord, LocalState, MechanismId, PointU, SimCommand, SlotId, World } from "../../src/content/types";
import type { RngStream } from "../../src/kit/platform/rng";
import { dist, mmToU, within } from "../../src/sim/fixed";
import { upgradePrice } from "../../src/sim/shop";
import { heartDistance } from "../../src/sim/field";
import { inTelegraph } from "../../src/sim/telegraph";
import { densestPoint, speciesW100 } from "../../src/sim/targeting";
import type { BuyPlan, IcBot } from "./bots";

const SEAT = 0;
const rangeOf = (slot: SlotId): number => {
  const effect = kiemSkill(slot).effect;
  switch (effect.kind) {
    case "volley":
    case "zone":
    case "ultimate":
      return mmToU(effect.rangeMm);
    case "line":
      return mmToU(effect.lengthMm);
    default:
      return 0;
  }
};
export const REACH_U: Readonly<Record<1 | 2 | 4 | 5, number>> = { 1: rangeOf(1), 2: rangeOf(2), 4: rangeOf(4), 5: rangeOf(5) };
const WARD_MS = (() => {
  const effect = kiemSkill(3, "ward").effect;
  return effect.kind === "ward" ? effect.durationMs : 5000;
})();
const BODY_U = mmToU(PLAYER.radiusMm);
const BOMB = CONSUMABLE_DEFS["loi-hoa-phu"].effect;

/** A word on the Bàn Quyết the bot may type (live: ready or being typed). */
export const isTypeable = (entry: LiveWord): boolean => entry.kitSlot >= 0 && (entry.state === "ready" || entry.state === "typing");

/** Any live beast within `rangeU` of `from`. */
export function beastWithin(world: World, from: PointU, rangeU: number): boolean {
  for (const beast of world.beasts.list) if (beast.alive && within(beast.x, beast.z, from.x, from.z, rangeU)) return true;
  return false;
}

/** The node point (Tâm nhãn). */
export function nodePoint(world: World): PointU {
  const node = world.stage.field.nodes[0];
  return node ? { x: mmToU(node.at.xMm), z: mmToU(node.at.zMm) } : { x: 0, z: 0 };
}

/**
 * A telegraph that will hit the player (or the Tâm nhãn, where a ward also
 * blocks) within the ward's life: its id, or −1. `soonTicks`: only strikes
 * within this many ticks (a dodge), else any while a ward would still stand.
 */
export function threatOn(world: World, local: LocalState, soonTicks = Math.round((WARD_MS * 60) / 1000), noticed: (id: number) => boolean = () => true): number {
  const node = nodePoint(world);
  for (const t of world.telegraphs.active) {
    if (t.cancelled || t.strikeTick <= world.tick || t.strikeTick - world.tick > soonTicks || !noticed(t.id)) continue;
    const def = TELEGRAPHS[t.def];
    if (!def || (def.strike.playerHp <= 0 && def.strike.knockMm <= 0 && !t.def.endsWith("-node"))) continue;
    if (inTelegraph(t, local.x, local.z, BODY_U)) return t.id;
    if (t.def.endsWith("-node") && within(local.x, local.z, node.x, node.z, mmToU(2000)) && inTelegraph(t, node.x, node.z, 0)) return t.id;
  }
  return -1;
}

/** A key's origin: the player's position rounded to 100 mm, as the page's router sends it. */
export const originOf = (local: LocalState): PointU => quantizeOrigin(local);

const ORDER: readonly (SlotId | "seal" | "cleanse")[] = ["cleanse", "seal", 5, 2, 4, 3, 1];
const ORDER_LEARN: readonly (SlotId | "seal" | "cleanse")[] = ["cleanse", "seal", 4, 5, 2, 3, 1];
const keyOf = (entry: LiveWord): SlotId | "seal" | "cleanse" => (entry.kind === "slot" ? entry.slot! : entry.kind);

/** The word worth typing now (has a target in reach, or ô 3 against a threat), by the slot order. */
export function useful(world: World, local: LocalState, entry: LiveWord, threat: boolean): boolean {
  if (!isTypeable(entry)) return false;
  const key = keyOf(entry);
  if (key === "cleanse" || key === "seal") return true;
  const from = originOf(local);
  if (key === 3) return threat;
  return beastWithin(world, from, REACH_U[key]);
}

export interface PickState {
  /** Vừa: entries left alone until this tick, by word index (set when the word went live). */
  readonly ignoreUntil: Map<number, number>;
  /** Born tick seen per entry (a new word on the same entry is a new decision). */
  readonly bornSeen: Map<number, number>;
}

export const newPickState = (): PickState => ({ ignoreUntil: new Map(), bornSeen: new Map() });

/** Vừa's habit: a slot word that just became ready is left alone 1–2 s, half the time (PB-05: "bỏ một ô đã sẵn 1–2 s"). */
export const FAIR_SKIP_CHANCE = 0.5;
export const FAIR_SKIP_S: readonly [number, number] = [1, 2];

/** The next word to type, or null (`threat`: a noticed telegraph is about to hit the player or the Tâm nhãn). Draws only from the bot's own dice. */
export function pickWord(world: World, local: LocalState, bot: IcBot, state: PickState, dice: RngStream, threat: boolean): LiveWord | null {
  const words = world.words.live.filter((entry) => entry.seat === SEAT && isTypeable(entry));
  if (words.length === 0) return null;
  // Vừa: a newly ready slot word may be left alone 1–2 s (not ô 1, the filler; not Ấn, Tẩy).
  for (const entry of words) {
    if (state.bornSeen.get(entry.index) === entry.born) continue;
    state.bornSeen.set(entry.index, entry.born);
    if (bot.tactics === "fair" && entry.kind === "slot" && entry.slot !== 1 && dice.chance(FAIR_SKIP_CHANCE)) {
      const seconds = FAIR_SKIP_S[0] + dice.float() * (FAIR_SKIP_S[1] - FAIR_SKIP_S[0]);
      state.ignoreUntil.set(entry.index, world.tick + Math.round(seconds * 60));
    } else state.ignoreUntil.delete(entry.index);
  }
  const candidates = words.filter((entry) => useful(world, local, entry, threat) && !((state.ignoreUntil.get(entry.index) ?? -1) > world.tick));
  if (candidates.length === 0) return null;
  if (bot.tactics === "poor") return candidates[dice.int(0, candidates.length - 1)]!;
  const order = world.preset === "learn" ? ORDER_LEARN : ORDER;
  candidates.sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)) || a.index - b.index);
  return candidates[0]!;
}

// ── Soft target (left click, canon §5.1) by the kit typist's target mix ─────

/** Danger of a beast for the target mix: attacking now (throw, ram, bite, a telegraph up) 3, a medium beast 2, else 1; elite, general or boss +1. */
export function dangerOf(beast: BeastState): number {
  let danger = beast.telegraph >= 0 || beast.mode === "throw" || beast.mode === "ram" || beast.mode === "bite" ? 3 : beast.tier === "medium" ? 2 : 1;
  if (beast.elite !== null || beast.general || beast.boss) danger += 1;
  return danger;
}

/**
 * The beast a person would click before typing an ô 1 or ô 2 word (the kit's HumanTypist.choose: most dangerous,
 * nearest the heart, first shown, by the tactics' mix), among beasts in the skill's reach; null for other words.
 */
export function softTargetFor(world: World, local: LocalState, entry: LiveWord, choose: (options: readonly { danger: number; distance: number; shown: number }[]) => number): BeastState | null {
  if (entry.kind !== "slot" || (entry.slot !== 1 && entry.slot !== 2)) return null;
  const from = originOf(local);
  const reach = REACH_U[entry.slot];
  const beasts = world.beasts.list.filter((beast) => beast.alive && within(beast.x, beast.z, from.x, from.z, reach));
  if (beasts.length === 0) return null;
  const pick = choose(beasts.map((beast) => ({ danger: dangerOf(beast), distance: heartDistance(world, beast), shown: beast.bornAt * 4096 + beast.serial })));
  return pick >= 0 ? beasts[pick]! : null;
}

// ── Shop (prep and breaks) ──────────────────────────────────────────────────

type Wish = { readonly kind: "place"; readonly slot: number; readonly mech: MechanismId } | { readonly kind: "upgrade"; readonly slot: number } | { readonly kind: "buy"; readonly item: ConsumableId; readonly keep: number };

const P = (slot: number, mech: MechanismId): Wish => ({ kind: "place", slot, mech });
const U = (slot: number): Wish => ({ kind: "upgrade", slot });
const B = (item: ConsumableId, keep = 1): Wish => ({ kind: "buy", item, keep });

/**
 * Wish lists by plan, bought in order while the Linh Sa lasts (strip slots 0 and 2 on the gate paths, posts 1, 3
 * by the gates, 4, 5 beside the Kết Giới). Tốt: Kiếm Thung on both paths, Lôi Phù Trụ by the Kết Giới, then
 * upgrades, a Lôi Hỏa Phù and a Hồi Xuân Đan kept. Vừa: the same mechanisms in a plainer order, Phong Ấn Võng
 * early, one Hồi Xuân Đan. Best (Không gõ): every post a Lôi Phù Trụ, both strips, every upgrade, bombs.
 */
const WISHES: Readonly<Record<Exclude<BuyPlan, "none" | "poor">, readonly Wish[]>> = {
  good: [P(0, "kiem-thung"), B("loi-hoa-phu"), P(2, "kiem-thung"), P(4, "loi-phu-tru"), P(5, "loi-phu-tru"), B("hoi-xuan-dan"), U(0), U(2), P(1, "phong-an-vong"), P(3, "loi-phu-tru"), U(4), U(5), U(0), U(2), U(4), U(5), U(3), U(1), B("loi-hoa-phu", 3)],
  fair: [P(0, "kiem-thung"), P(2, "kiem-thung"), B("hoi-xuan-dan"), P(4, "phong-an-vong"), P(5, "loi-phu-tru"), U(0), U(2), P(1, "loi-phu-tru"), U(5), U(4), P(3, "phong-an-vong"), U(1), U(0), U(2), B("loi-hoa-phu")],
  best: [P(0, "kiem-thung"), B("loi-hoa-phu"), P(4, "loi-phu-tru"), P(2, "kiem-thung"), P(5, "loi-phu-tru"), P(1, "loi-phu-tru"), P(3, "loi-phu-tru"), U(4), U(5), U(1), U(3), U(0), U(2), U(4), U(5), U(1), U(3), U(0), U(2), B("loi-hoa-phu", 3)],
};

const owned = (world: World, item: ConsumableId): number => world.consumables.seats[SEAT]!.slots.reduce((sum, slot) => sum + (slot.item === item ? slot.count : 0), 0);
const roomFor = (world: World, item: ConsumableId): boolean => world.consumables.seats[SEAT]!.slots.some((slot) => (slot.item === item && slot.count < 3) || slot.item === null || slot.count <= 0);

function wishCommand(world: World, wish: Wish, linhSa: number): SimCommand | null {
  const slots = world.mechanisms.slots;
  switch (wish.kind) {
    case "place": {
      const slot = slots.find((item) => item.index === wish.slot);
      if (!slot || slot.mech !== null || MECHANISM_DEFS[wish.mech].price > linhSa) return null;
      return { type: "place", seat: SEAT, slot: wish.slot, mech: wish.mech };
    }
    case "upgrade": {
      const slot = slots.find((item) => item.index === wish.slot);
      if (!slot || slot.mech === null || slot.level > MECHANISMS.upgrades.length) return null;
      const price = upgradePrice(slot);
      return price > 0 && price <= linhSa ? { type: "upgrade", seat: SEAT, slot: wish.slot } : null;
    }
    case "buy":
      if (owned(world, wish.item) >= wish.keep || CONSUMABLE_DEFS[wish.item].price > linhSa || !roomFor(world, wish.item)) return null;
      return { type: "buy", seat: SEAT, item: wish.item };
  }
}

/**
 * The next shop command of this shop visit, or null when done. Kém buys at most 2 random things a visit (each
 * with a 60 % chance), into a random fitting slot, and keeps the rest; Chỉ gõ never buys.
 */
export function nextPurchase(world: World, bot: IcBot, bought: number, dice: RngStream): SimCommand | null {
  const linhSa = world.economy.wallets[SEAT]!.linhSa;
  if (bot.buy === "none") return null;
  if (bot.buy === "poor") {
    if (bought >= 2 || !dice.chance(0.6)) return null;
    const options: SimCommand[] = [];
    for (const item of ["hoi-xuan-dan", "kim-than-phu", "loi-hoa-phu"] as const) if (CONSUMABLE_DEFS[item].price <= linhSa && roomFor(world, item)) options.push({ type: "buy", seat: SEAT, item });
    for (const slot of world.mechanisms.slots) {
      const kind = world.stage.field.mechSlots.find((def) => def.index === slot.index)?.kind;
      if (slot.mech === null) {
        for (const mech of Object.values(MECHANISM_DEFS)) if (mech.slotKind === kind && mech.price <= linhSa) options.push({ type: "place", seat: SEAT, slot: slot.index, mech: mech.id });
      } else if (upgradePrice(slot) > 0 && upgradePrice(slot) <= linhSa) options.push({ type: "upgrade", seat: SEAT, slot: slot.index });
    }
    return options.length === 0 ? null : options[dice.int(0, options.length - 1)]!;
  }
  for (const wish of WISHES[bot.buy]) {
    const command = wishCommand(world, wish, linhSa);
    if (command !== null) return command;
  }
  return null;
}

// ── Đan phù in a fight ─────────────────────────────────────────────────────

/** W × 100 of live beasts within the bomb's radius around the densest point in its reach (0: none). */
function bombValue(world: World, from: PointU): { at: PointU | null; w100: number } {
  const at = densestPoint(world, from, mmToU(BOMB.kind === "bomb" ? BOMB.rangeMm : 0), mmToU(BOMB.kind === "bomb" ? BOMB.radiusMm : 0));
  if (at === null) return { at: null, w100: 0 };
  const radius = mmToU(BOMB.kind === "bomb" ? BOMB.radiusMm : 0);
  let w100 = 0;
  for (const beast of world.beasts.list) if (beast.alive && within(beast.x, beast.z, at.x, at.z, radius)) w100 += speciesW100(beast.species, beast.elite);
  return { at, w100 };
}

/** Bomb only a crowd worth ≥ 3 W (a Thạch Thử cluster is 2.31 W; a habit, not a rule). */
export const BOMB_MIN_W100 = 300;
/** Hồi Xuân Đan under half Sinh lực. */
export const HEAL_BELOW_PM = 500;

/** A đan phù to use now (keys 1/2/3), or null: the shared cooldown and counts are the sim's to check. */
export function consumableToUse(world: World, local: LocalState, threat: boolean): SimCommand | null {
  const own = world.consumables.seats[SEAT]!;
  if (world.tick < own.cooldownUntil || local.down) return null;
  const origin = originOf(local);
  for (let slot = 0; slot < own.slots.length; slot += 1) {
    const item = own.slots[slot]!;
    if (item.item === null || item.count <= 0) continue;
    if (item.item === "hoi-xuan-dan" && local.hp * 1000 < HEAL_BELOW_PM * local.hpMax) return { type: "consumable", seat: SEAT, slot, origin, aim: null };
    if (item.item === "kim-than-phu" && threat && local.shield <= 0) return { type: "consumable", seat: SEAT, slot, origin, aim: null };
    if (item.item === "loi-hoa-phu" && bombValue(world, origin).w100 >= BOMB_MIN_W100) return { type: "consumable", seat: SEAT, slot, origin, aim: null };
  }
  return null;
}

// ── Cơ động ────────────────────────────────────────────────────────────────

/** Keeps the crowd within this of the player (ô 1's 12 m less a margin) and never walks further than this from the heart. */
const KEEP_U = mmToU(9000);
const LEASH_U = mmToU(10_000);
const DODGE_U = mmToU(3500);

/** The beast nearest the heart (straight), or null. */
function frontBeast(world: World): BeastState | null {
  let best: BeastState | null = null;
  let bestD = 0;
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    const d = dist(beast.x, beast.z, 0, 0);
    if (best === null || d < bestD || (d === bestD && beast.serial < best.serial)) {
      best = beast;
      bestD = d;
    }
  }
  return best;
}

/** Where Cơ động walks now (a right click), or null to stay. */
export function mobileGoal(world: World, local: LocalState, noticed: (id: number) => boolean): PointU | null {
  // Out of a telegraph about to strike (within 1.5 s): step sideways from its centre.
  const threat = threatOn(world, local, 90, noticed);
  if (threat >= 0) {
    const t = world.telegraphs.active.find((item) => item.id === threat)!;
    const shape = TELEGRAPHS[t.def]?.shape ?? "circle";
    let dx: number;
    let dz: number;
    if (shape === "line" || shape === "cone") {
      // Sideways from the axis, to the side the player already stands on.
      const ax = t.to.x - t.from.x;
      const az = t.to.z - t.from.z;
      const side = (local.x - t.from.x) * az - (local.z - t.from.z) * ax >= 0 ? 1 : -1;
      dx = az * side;
      dz = -ax * side;
    } else {
      dx = local.x - t.to.x;
      dz = local.z - t.to.z;
    }
    if (dist(0, 0, dx, dz) < mmToU(200)) {
      dx = mmToU(1000);
      dz = 0;
    }
    const len = Math.max(1, dist(0, 0, dx, dz));
    return clampToLeash({ x: local.x + Math.round((dx * DODGE_U) / len), z: local.z + Math.round((dz * DODGE_U) / len) });
  }
  const front = frontBeast(world);
  const home = nodePoint(world);
  if (front === null) return dist(local.x, local.z, home.x, home.z) > mmToU(1500) ? home : null;
  if (within(front.x, front.z, local.x, local.z, KEEP_U)) return null;
  // Towards the front beast, held within the leash around the heart.
  const len = Math.max(1, dist(front.x, front.z, 0, 0));
  const reach = Math.min(LEASH_U, Math.max(0, len - KEEP_U + mmToU(2000)));
  return clampToLeash({ x: Math.round((front.x * reach) / len), z: Math.round((front.z * reach) / len) });
}

function clampToLeash(point: PointU): PointU {
  const d = dist(point.x, point.z, 0, 0);
  if (d <= LEASH_U) return point;
  return { x: Math.round((point.x * LEASH_U) / d), z: Math.round((point.z * LEASH_U) / d) };
}
