/**
 * Thế (canon §10.7): elites 40, generals 60, boss 100 a phase; Ấn −35
 * (team −35 / √seats, `sealPosture`), skills by table, Phong Ấn Võng −15, −1
 * per W of typed damage (`postureFromTypedHp`); at 0: phá thế, down 6 s,
 * × 1.5 damage (combat reads `isBroken`), any telegraph of the beast is
 * cancelled (Thiết Bối Xung answer (a)); then 15 s Thế does not drop, then it
 * fills again. Thế never refills by itself otherwise (the Vương refills at
 * each phase change, boss.ts). The Vương's roar is damage-immune (`damageImmune`).
 * Owner: Lane 5.
 */
import { POSTURE, STRENGTH } from "../content/rules";
import type { BeastState, HitSource, PostureState, World } from "../content/types";
import { emit } from "./events";
import { isqrt, msToTicks } from "./fixed";
import { cancelSourceTelegraphs } from "./telegraph";

// Lane 5 field (reported for Lane 2 to fold into types.ts): typed HP not yet turned into Thế.
declare module "../content/types" {
  interface PostureState {
    typedHp?: number;
  }
}

export function createPosture(max: number): PostureState {
  return { value: max, max, brokenUntil: -1, immuneUntil: -1, typedHp: 0 };
}

/** Ấn's Thế: −35 solo, −35 / √seats in a team (half up). */
export function sealPosture(seats: number): number {
  const n = seats > 1 ? seats : 1;
  return Math.round((POSTURE.seal * 1000) / isqrt(n * 1_000_000));
}

/** The Vương roars between phases: no damage, no Thế loss (canon §10.5). Lane 4's damageBeast asks. */
export function damageImmune(world: World, beast: BeastState): boolean {
  return beast.mode === "roar" && beast.modeUntil > world.tick;
}

export function isBroken(world: World, beast: BeastState): boolean {
  return beast.posture !== null && beast.posture.brokenUntil > world.tick;
}

/** Thế does not drop: broken, the 15 s after, or roaring (an Ấn could do nothing; elites.ts asks before a new one). */
export function postureLocked(world: World, beast: BeastState, posture: PostureState | null = beast.posture): boolean {
  if (posture === null) return false;
  return posture.brokenUntil > world.tick || posture.immuneUntil > world.tick || damageImmune(world, beast);
}

const ref = (beast: BeastState) => ({ slot: beast.slot, serial: beast.serial });

/** Lowers Thế by `delta` (no effect while broken, immune or roaring); emits `posture`; at 0 the beast breaks. */
export function postureHit(world: World, beast: BeastState, delta: number, _source: HitSource): void {
  const posture = beast.posture;
  if (posture === null || !beast.alive || delta <= 0 || postureLocked(world, beast, posture)) return;
  posture.value = Math.max(0, posture.value - delta);
  emit(world, { type: "posture", stage: "change", beast: ref(beast), value: posture.value, max: posture.max });
  if (posture.value > 0) return;
  posture.brokenUntil = world.tick + msToTicks(POSTURE.brokenMs);
  posture.immuneUntil = posture.brokenUntil + msToTicks(POSTURE.immuneMs);
  posture.typedHp = 0;
  beast.mode = "downed";
  beast.modeUntil = posture.brokenUntil;
  cancelSourceTelegraphs(world, beast);
  emit(world, { type: "posture", stage: "break", beast: ref(beast), value: 0, max: posture.max });
}

/** Typed damage lowers Thế by 1 per whole W (1 W = 90 × g(K) HP); Lane 4's damageBeast passes the effective HP of typed hits. */
export function postureFromTypedHp(world: World, beast: BeastState, hp: number, source: HitSource): void {
  const posture = beast.posture;
  if (posture === null || !beast.alive || hp <= 0) return;
  if (postureLocked(world, beast, posture)) {
    posture.typedHp = 0;
    return;
  }
  const wHp = Math.round((STRENGTH.wHp * world.gPm) / 1000);
  const carried = (posture.typedHp ?? 0) + hp;
  const whole = Math.floor(carried / wHp);
  posture.typedHp = carried - whole * wHp;
  if (whole > 0) postureHit(world, beast, whole * POSTURE.perTypedW, source);
}

/** Full Thế again with no break or immunity (the Vương's phase change); emits `recover`. */
export function refillPosture(world: World, beast: BeastState): void {
  const posture = beast.posture;
  if (posture === null) return;
  posture.value = posture.max;
  posture.brokenUntil = -1;
  posture.immuneUntil = -1;
  posture.typedHp = 0;
  emit(world, { type: "posture", stage: "recover", beast: ref(beast), value: posture.value, max: posture.max });
}

/** Ends breaks and refills Thế when the 15 s immunity is over. */
export function stepPosture(world: World): void {
  const tick = world.tick;
  for (const beast of world.beasts.list) {
    const posture = beast.posture;
    if (!beast.alive || posture === null) continue;
    if (posture.brokenUntil >= 0 && tick >= posture.brokenUntil && beast.mode === "downed") {
      beast.mode = "walk";
      beast.modeUntil = -1;
    }
    if (posture.immuneUntil >= 0 && tick >= posture.immuneUntil) refillPosture(world, beast);
  }
}
