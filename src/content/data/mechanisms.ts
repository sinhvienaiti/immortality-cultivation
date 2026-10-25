/**
 * M0a mechanisms (canon §8.3): Kiếm Thung 150 (4 × 2 m strip: slow 25 %, 0.05 W/s
 * physical to each beast in it), Lôi Phù Trụ 300 (post: every 4 s a chain of 3
 * targets within 7 m, 0.25 W magic each), Phong Ấn Võng 250 (post: every 10 s
 * holds the beast with the largest W within 7 m for 3 s, pulls flyers down,
 * Thế −15). Effects × g(K); upgrades and refunds are rules.ts MECHANISMS.
 * Mê Vụ Trận is M1.
 * Owner: Lane 4.
 */
import type { MechanismDef, MechanismId } from "../types";

export const MECHANISM_DEFS: Readonly<Record<MechanismId, MechanismDef>> = {
  "kiem-thung": {
    id: "kiem-thung",
    name: "Kiếm Thung",
    slotKind: "strip",
    price: 150,
    damageType: "physical",
    effect: { kind: "strip", slowPct: 25, w100PerS: 5, lengthMm: 4000, widthMm: 2000 },
  },
  "loi-phu-tru": {
    id: "loi-phu-tru",
    name: "Lôi Phù Trụ",
    slotKind: "post",
    price: 300,
    damageType: "magic",
    effect: { kind: "chain", everyMs: 4000, targets: 3, rangeMm: 7000, w100: 25 },
  },
  "phong-an-vong": {
    id: "phong-an-vong",
    name: "Phong Ấn Võng",
    slotKind: "post",
    price: 250,
    // Deals no damage (a hold and Thế); the type is unused.
    damageType: "physical",
    effect: { kind: "snare", everyMs: 10_000, rangeMm: 7000, holdMs: 3000, posture: 15 },
  },
};
