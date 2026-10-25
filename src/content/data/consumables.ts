/**
 * M0a đan, phù (canon §12.3): Hồi Xuân Đan 30 (25 % Sinh lực over 2 s) and Kim
 * Thân Phù 40 (shield 20 % of max Sinh lực, 8 s) act on the player, so `local`
 * applies them (local/consumables.ts, D34); Lôi Hỏa Phù 50 (r 3 m at the cursor
 * or the densest cluster within 14 m, 1.6 W magic a beast, cluster cap 60 %)
 * acts on the world, so the sim applies it (sim/consumables.ts). Định Thân Phù is M1.
 * Owner: Lane 4.
 */
import type { ConsumableDef, ConsumableId } from "../types";

export const CONSUMABLE_DEFS: Readonly<Record<ConsumableId, ConsumableDef>> = {
  "hoi-xuan-dan": { id: "hoi-xuan-dan", name: "Hồi Xuân Đan", price: 30, target: "self", effect: { kind: "heal", pct: 25, durationMs: 2000 } },
  "kim-than-phu": { id: "kim-than-phu", name: "Kim Thân Phù", price: 40, target: "self", effect: { kind: "shield", pct: 20, durationMs: 8000 } },
  "loi-hoa-phu": { id: "loi-hoa-phu", name: "Lôi Hỏa Phù", price: 50, target: "world", effect: { kind: "bomb", radiusMm: 3000, rangeMm: 14_000, w100: 160 } },
};
