/**
 * Đan phù on this player (canon §12.3, D34): on the world's `consumable`
 * event of its own seat, Hồi Xuân Đan heals 25 % of max Sinh lực evenly over
 * 2 s and Kim Thân Phù shields 20 % of it for 8 s (numbers: data/consumables.ts).
 * The sim keeps counts, cooldown and Linh Sa; Lôi Hỏa Phù is the world's. A
 * second dose of the same kind keeps the stronger (canon §7.2: same id, the
 * strongest). Not while down.
 * Owner: Lane 2.
 */
import { CONSUMABLE_DEFS } from "../content/data/consumables";
import type { ConsumableDef, ConsumableId, EventOf, LocalState } from "../content/types";
import { msToTicks, mulDiv, pct } from "../sim/fixed";

export function onConsumable(local: LocalState, event: EventOf<"consumable">): void {
  if (event.seat !== local.seat || local.down) return;
  const def = (CONSUMABLE_DEFS as Partial<Record<ConsumableId, ConsumableDef>>)[event.kind];
  if (!def || def.target !== "self") return;
  const effect = def.effect;
  if (effect.kind === "heal") {
    // A new dose starts over with what is still to come or the new dose, whichever is more.
    const amount = Math.max(local.healLeft, pct(local.hpMax, effect.pct));
    local.healTotal = amount;
    local.healLeft = amount;
    local.healFrom = local.tick;
    local.healUntil = local.tick + Math.max(1, msToTicks(effect.durationMs));
  } else if (effect.kind === "shield") {
    const amount = pct(local.hpMax, effect.pct);
    local.shield = Math.max(local.shield, amount);
    local.shieldUntil = local.tick + msToTicks(effect.durationMs);
  }
}

/** Heal over time (by the end of tick t, total × (t − from + 1) / span has been given) and the shield's end. */
export function stepConsumableEffects(local: LocalState): void {
  const tick = local.tick;
  if (local.healLeft > 0) {
    if (local.down) {
      local.healLeft = 0;
    } else {
      const span = local.healUntil - local.healFrom;
      const done = tick + 1 >= local.healUntil ? local.healTotal : mulDiv(local.healTotal, tick - local.healFrom + 1, span);
      const give = Math.min(local.healLeft, Math.max(0, done - (local.healTotal - local.healLeft)));
      local.hp = Math.min(local.hpMax, local.hp + give);
      local.healLeft -= give;
    }
  }
  if (local.shield > 0 && tick >= local.shieldUntil) local.shield = 0;
}
