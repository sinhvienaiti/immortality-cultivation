/**
 * Thanh Thạch Ải: 48 × 52 m, x −24…24, z −44…8 m (387a, 16/11).
 * A single 12 m corridor confines ground beasts; the player uses the whole field.
 * Both gates share its mouth. The flow pulls strings inside the S-shaped boundary.
 * Six waves and the live cap are unchanged (387c owns those).
 */
import { FIELD, FORMATION, STAGE_M0A } from "../rules";
import { unitPm } from "../../sim/fixed";
import type { PointMm, StageDef } from "../types";
import { M0A_WAVES } from "./waves";

/** Catmull-Rom, step 0.1, rounded to 10 mm; adjacent duplicates removed offline. */
export const LANE_POINTS_MM: readonly PointMm[] = [
  { xMm: 0, zMm: -44000 },
  { xMm: -100, zMm: -43400 },
  { xMm: -240, zMm: -42610 },
  { xMm: -400, zMm: -41670 },
  { xMm: -570, zMm: -40620 },
  { xMm: -770, zMm: -39500 },
  { xMm: -970, zMm: -38340 },
  { xMm: -1170, zMm: -37170 },
  { xMm: -1370, zMm: -36030 },
  { xMm: -1570, zMm: -34960 },
  { xMm: -1750, zMm: -34000 },
  { xMm: -1940, zMm: -33110 },
  { xMm: -2160, zMm: -32260 },
  { xMm: -2390, zMm: -31420 },
  { xMm: -2620, zMm: -30610 },
  { xMm: -2840, zMm: -29810 },
  { xMm: -3050, zMm: -29030 },
  { xMm: -3230, zMm: -28260 },
  { xMm: -3370, zMm: -27500 },
  { xMm: -3470, zMm: -26750 },
  { xMm: -3500, zMm: -26000 },
  { xMm: -3470, zMm: -25250 },
  { xMm: -3400, zMm: -24500 },
  { xMm: -3290, zMm: -23760 },
  { xMm: -3140, zMm: -23030 },
  { xMm: -2950, zMm: -22310 },
  { xMm: -2740, zMm: -21610 },
  { xMm: -2510, zMm: -20920 },
  { xMm: -2270, zMm: -20260 },
  { xMm: -2010, zMm: -19610 },
  { xMm: -1750, zMm: -19000 },
  { xMm: -1450, zMm: -18420 },
  { xMm: -1080, zMm: -17870 },
  { xMm: -660, zMm: -17350 },
  { xMm: -220, zMm: -16860 },
  { xMm: 220, zMm: -16370 },
  { xMm: 640, zMm: -15900 },
  { xMm: 1030, zMm: -15440 },
  { xMm: 1360, zMm: -14970 },
  { xMm: 1600, zMm: -14490 },
  { xMm: 1750, zMm: -14000 },
  { xMm: 1780, zMm: -13480 },
  { xMm: 1710, zMm: -12920 },
  { xMm: 1560, zMm: -12340 },
  { xMm: 1340, zMm: -11760 },
  { xMm: 1090, zMm: -11190 },
  { xMm: 830, zMm: -10640 },
  { xMm: 560, zMm: -10130 },
  { xMm: 320, zMm: -9680 },
  { xMm: 130, zMm: -9300 },
  { xMm: 0, zMm: -9000 },
];

/** Direction of the authored segment under a strip centre, computed once at stage construction. */
function laneAxis(zMm: number): { x: number; z: number } {
  const out = { x: 0, z: 1000 };
  for (let i = 1; i < LANE_POINTS_MM.length; i += 1) {
    const a = LANE_POINTS_MM[i - 1]!;
    const b = LANE_POINTS_MM[i]!;
    if (zMm < a.zMm || zMm > b.zMm) continue;
    unitPm(b.xMm - a.xMm, b.zMm - a.zMm, out);
    break;
  }
  return out;
}

export const THANH_THACH_AI: StageDef = {
  id: "m0a-thanh-thach-ai",
  name: "Thanh Thạch Ải",
  realm: 0,
  kind: "m0a",
  field: {
    lane: { pointsMm: LANE_POINTS_MM, halfWidthMm: 6000, endZMm: -9000 },
    minXMm: FIELD.minXMm,
    maxXMm: FIELD.maxXMm,
    minZMm: FIELD.minZMm,
    maxZMm: FIELD.maxZMm,
    barrierRadiusMm: FORMATION.barrierRadiusMm,
    gates: [
      { id: "A", at: { xMm: FIELD.gates.A.xMm, zMm: FIELD.gates.A.zMm }, ground: true },
      { id: "B", at: { xMm: FIELD.gates.B.xMm, zMm: FIELD.gates.B.zMm }, ground: true },
      { id: "sky", at: { xMm: 0, zMm: FIELD.minZMm }, ground: false },
    ],
    skyEntries: FIELD.skyEntries.map((entry) => ({ xMm: entry.xMm, zMm: entry.zMm })),
    pillars: [
      { id: "west", at: { xMm: -7600, zMm: -7680 }, radiusMm: 900 },
      { id: "east", at: { xMm: 7600, zMm: -7680 }, radiusMm: 900 },
    ],
    mechSlots: [
      { index: 0, at: { xMm: -2790, zMm: -30_000 }, kind: "strip", alongPm: laneAxis(-30_000) },
      { index: 1, at: { xMm: -10_460, zMm: -22_000 }, kind: "post" },
      { index: 2, at: { xMm: -1170, zMm: -18_000 }, kind: "strip", alongPm: laneAxis(-18_000) },
      { index: 3, at: { xMm: 4100, zMm: -26_000 }, kind: "post" },
      { index: 4, at: { xMm: -11_000, zMm: -4000 }, kind: "post" },
      { index: 5, at: { xMm: 11_000, zMm: -4000 }, kind: "post" },
    ],
    nodes: [{ id: "tam-nhan", at: { xMm: 0, zMm: 3000 } }],
    blocked: [],
  },
  waves: M0A_WAVES,
  boss: "thiet-boi-lang-vuong",
  liveCap: STAGE_M0A.liveCap,
};

export const STAGES: Readonly<Record<string, StageDef>> = { [THANH_THACH_AI.id]: THANH_THACH_AI };
