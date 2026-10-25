/**
 * Thanh Thạch Ải, the M0a grey-box stage (canon §8.1, §13.3, §25): field
 * 40 × 26 m (x −20…20 east, z −18…8 south) with the heart at the origin,
 * ground gates A, B at (∓15 m; −18 m) (~24 m to the heart), the sky route
 * from the top corners (±20 m; −18 m) (26.9 m straight), 6 waves + Thiết Bối
 * Lang Vương (from gate A), live cap 60.
 *
 * Placed by this round (the canon draws them, it gives no numbers; đề xuất
 * của vòng này, chờ chủ dự án xác nhận):
 * - Trận Trụ T, P on the gate → heart lines 10 m from the heart, r 0.9 m:
 *   outside the Kết Giới (9 m), in front of the Nham Viên's 11 m stop, so a
 *   pillar stands between some throws and the heart and on the boss's charge
 *   line from beyond 10 m (canon §8.2, §10.5 answer (b)); beasts walk round them.
 * - 6 mechanism slots: ô1, ô3 strips on the gate paths 16 m out (Kiếm Thung,
 *   laid along the path towards the heart); ô2, ô4 posts beside the paths
 *   (~3.7 m off); ô5, ô6 posts beside the Kết Giới (≤ 7 m from the paths).
 * - Tâm nhãn 3 m south of the heart (behind it, the Nhãn Thủ spot of the
 *   analysis sketch); the player starts on it.
 * - No blocked terrain at M0a: open ground, the corridors are drawn by the view.
 * Owner: Lane 2.
 */
import { FIELD, FORMATION, STAGE_M0A } from "../rules";
import type { StageDef } from "../types";
import { M0A_WAVES } from "./waves";

export const THANH_THACH_AI: StageDef = {
  id: "m0a-thanh-thach-ai",
  name: "Thanh Thạch Ải",
  realm: 0,
  kind: "m0a",
  field: {
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
      { id: "west", at: { xMm: -6400, zMm: -7680 }, radiusMm: 900 },
      { id: "east", at: { xMm: 6400, zMm: -7680 }, radiusMm: 900 },
    ],
    mechSlots: [
      { index: 0, at: { xMm: -10_240, zMm: -12_290 }, kind: "strip" },
      { index: 1, at: { xMm: -11_500, zMm: -8000 }, kind: "post" },
      { index: 2, at: { xMm: 10_240, zMm: -12_290 }, kind: "strip" },
      { index: 3, at: { xMm: 11_500, zMm: -8000 }, kind: "post" },
      { index: 4, at: { xMm: -10_000, zMm: -2000 }, kind: "post" },
      { index: 5, at: { xMm: 10_000, zMm: -2000 }, kind: "post" },
    ],
    nodes: [{ id: "tam-nhan", at: { xMm: 0, zMm: 3000 } }],
    blocked: [],
  },
  waves: M0A_WAVES,
  boss: "thiet-boi-lang-vuong",
  liveCap: STAGE_M0A.liveCap,
};

export const STAGES: Readonly<Record<string, StageDef>> = { [THANH_THACH_AI.id]: THANH_THACH_AI };
