/**
 * Strikes on this player (canon §9.1, D34): the world only says where a
 * telegraphed attack struck (`telegraph strike`); this layer checks whether
 * the player stood inside the shape at the strike tick (its position before
 * this tick's move, i.e. where it was during that world tick) and pays the
 * Sinh lực part (× g(K) × preset) from the shield first. Standing in its own
 * `ward` with a charge left blocks the hit and sends `ward-use` (if the world
 * spent the last charge in that same tick, both are blocked: one block of
 * drift, accepted by canon §9.1). Kết Giới: −10 % damage inside; leaving
 * keeps it 1.5 s, then it fades over 3 s; re-entering joins after 1 s; no
 * stacking. Knock-back (Thiết Bối Xung 3 m) unless Lưu Quang Bộ's 0.3 s.
 * Shapes are tested in millimetres so every product stays exact.
 * Owner: Lane 2.
 */
import { TELEGRAPHS } from "../content/data/telegraphs";
import { FORMATION, PRESETS } from "../content/rules";
import type { EventOf, LocalState, SimEvent, World } from "../content/types";
import { clamp, isqrt, mmToU, msToTicks, mulDiv, mulDivSym, unitPm, within } from "../sim/fixed";
import { localEmit } from "./events";
import { moveBody } from "./player";

const BARRIER_U = mmToU(FORMATION.barrierRadiusMm);
const FULL_PM = FORMATION.barrierPlayerReductionPct * 10;
const GRACE = msToTicks(FORMATION.barrierGraceMs);
const FADE = msToTicks(FORMATION.barrierFadeMs);
const JOIN = msToTicks(FORMATION.barrierJoinMs);

/** Damage taken off by the Kết Giới at `tick`, ‰ (100 = −10 %). */
export function barrierReductionPm(local: LocalState, tick: number = local.tick): number {
  const buff = local.barrier;
  if (buff.inside && tick >= buff.joinAt) return FULL_PM;
  if (tick < buff.graceUntil) return FULL_PM;
  if (tick < buff.fadeUntil) return mulDiv(FULL_PM, buff.fadeUntil - tick, FADE);
  return 0;
}

/** After the move: entering or leaving the Kết Giới (r 9 m) updates the buff. */
export function stepZones(local: LocalState, _world: World): void {
  const tick = local.tick;
  const inside = within(local.x, local.z, 0, 0, BARRIER_U);
  const buff = local.barrier;
  if (inside && !buff.inside) {
    // Still at full strength (grace): it carries on; otherwise it joins after 1 s.
    buff.joinAt = barrierReductionPm(local, tick) >= FULL_PM ? tick : tick + JOIN;
    buff.inside = true;
  } else if (!inside && buff.inside) {
    buff.inside = false;
    if (tick >= buff.joinAt) {
      buff.graceUntil = tick + GRACE;
      buff.fadeUntil = buff.graceUntil + FADE;
    }
  }
}

const mm = (m: number): number => Math.round(m * 1000);

/** The player's point (mm) inside a telegraph's shape (types.ts SimEvent telegraph). */
export function insideShape(event: EventOf<"telegraph">, pxMm: number, pzMm: number): boolean {
  const reach = mm(event.reachM);
  const half = mm(event.widthM) / 2;
  const tx = mm(event.toX);
  const tz = mm(event.toZ);
  switch (event.shape) {
    case "circle":
      return (pxMm - tx) * (pxMm - tx) + (pzMm - tz) * (pzMm - tz) <= reach * reach;
    case "cell":
      return Math.abs(pxMm - tx) * 2 <= reach && Math.abs(pzMm - tz) * 2 <= reach;
    case "line":
    case "cone": {
      const ox = mm(event.x);
      const oz = mm(event.z);
      const dx = tx - ox;
      const dz = tz - oz;
      const length = isqrt(dx * dx + dz * dz);
      if (length === 0) return false;
      const vx = pxMm - ox;
      const vz = pzMm - oz;
      const along = vx * dx + vz * dz; // |v| |d| cos
      const across = Math.abs(vx * dz - vz * dx); // |v| |d| sin
      // 0 ≤ along / |d| ≤ reach; products stay under 2^53 for fields of ±150 m.
      if (along < 0 || along > reach * length) return false;
      // line: across / |d| ≤ half; cone: across / along ≤ half / reach.
      return event.shape === "line" ? across <= half * length : across * reach <= along * half;
    }
  }
}

const away = { x: 0, z: 0 };

/** Knock-back away from the shape (a line pushes sideways, the rest away from the centre or apex). */
function knock(local: LocalState, world: World, event: EventOf<"telegraph">, distanceMm: number): void {
  const px = Math.round(local.x / 60);
  const pz = Math.round(local.z / 60);
  if (event.shape === "line") {
    const dx = mm(event.toX) - mm(event.x);
    const dz = mm(event.toZ) - mm(event.z);
    const side = (px - mm(event.x)) * dz - (pz - mm(event.z)) * dx >= 0 ? 1 : -1;
    unitPm(dz * side, -dx * side, away);
  } else {
    const cx = event.shape === "cone" ? mm(event.x) : mm(event.toX);
    const cz = event.shape === "cone" ? mm(event.z) : mm(event.toZ);
    unitPm(px - cx, pz - cz, away);
    if (away.x === 0 && away.z === 0) away.z = 1000;
  }
  const push = mmToU(distanceMm);
  moveBody(local, world.stage, mulDivSym(away.x, push, 1000), mulDivSym(away.z, push, 1000));
}

/** Pays the strikes of the world's last tick on this player (before this tick's move). */
export function strikePlayer(local: LocalState, world: World, events: readonly SimEvent[]): void {
  if (local.down) return;
  const px = Math.round(local.x / 60);
  const pz = Math.round(local.z / 60);
  // Charges this layer spent this tick, and wards whose last charge the world spent in the same tick.
  const spent = new Map<number, number>();
  const worldBlocks = new Set<number>();
  for (const event of events) if (event.type === "ward" && event.stage === "block") worldBlocks.add(event.wardId);
  for (const event of events) {
    if (event.type !== "telegraph" || event.stage !== "strike" || event.id <= local.lastStrikeSeen) continue;
    local.lastStrikeSeen = event.id;
    const def = TELEGRAPHS[event.def];
    if (!def || !insideShape(event, px, pz)) continue;
    const strike = def.strike;
    if (strike.playerHp <= 0 && strike.knockMm <= 0) continue;
    // Own ward with a charge (canon §9.1: the player stands inside its ring at the strike tick).
    let blockedBy = -1;
    for (const ward of world.wards.list) {
      if (ward.seat !== local.seat || ward.untilTick < event.strikeTick) continue;
      if (!within(local.x, local.z, ward.originU.x, ward.originU.z, ward.radiusU)) continue;
      const used = spent.get(ward.id) ?? 0;
      if (ward.charges - used > 0 || (ward.charges === 0 && used === 0 && worldBlocks.has(ward.id))) {
        blockedBy = ward.id;
        spent.set(ward.id, used + 1);
        break;
      }
    }
    if (blockedBy >= 0) {
      local.outbox.push({ type: "ward-use", seat: local.seat, wardId: blockedBy });
      localEmit(local, { type: "player-hit", seat: local.seat, amount: 0, blocked: true, x: local.x / 60_000, z: local.z / 60_000 });
      continue;
    }
    const base = mulDiv(mulDiv(strike.playerHp, world.gPm, 1000), PRESETS[world.preset].damagePm, 1000);
    const amount = mulDiv(base, 1000 - barrierReductionPm(local), 1000);
    const absorbed = clamp(amount, 0, local.shield);
    local.shield -= absorbed;
    local.hp = clamp(local.hp - (amount - absorbed), 0, local.hpMax);
    localEmit(local, { type: "player-hit", seat: local.seat, amount, blocked: false, x: local.x / 60_000, z: local.z / 60_000 });
    if (strike.knockMm > 0 && local.tick >= local.dashUntil) knock(local, world, event, strike.knockMm);
  }
}
