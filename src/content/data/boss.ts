/**
 * Thiết Bối Lang Vương (canon §10.5): W 64 = round(0.7 × D_đơn × 120 s / 60)
 * (5 760 HP at K0 solo), Thế 100 a phase, 3 phases: P1 Vồ Xé + Gọi Đàn every
 * 30 s; P2 Thiết Bối Xung, no Gọi Đàn; P3 Cuồng +25 %, Gọi Đàn every 18 s,
 * Thiết Bối Xung every 15 s after the last one ended. One Gọi Đàn = 1 Thạch
 * Thử cluster + 2 Phong Lang = 4.31 W, ≤ 30 % W_Vương in all. Kim by the canon
 * (§10.5, §11); vô hệ in the M0a stage (§25), which also changes nothing for
 * Kiếm (Kim has no counter relation with Kim). `bossAct` holds the movement
 * and cadence numbers the canon leaves open (proposals, lane 5 changelog).
 * Owner: Lane 5.
 */
import type { BossDef, BossId } from "../types";
import { BITE_ONLY } from "./beasts";

/** Where the Vương stands and how often it pounces (Lane 5); it enters at gate A (canon §13.3, waves.ts). */
export interface BossActDef {
  /** P1: walks to this distance of the Tâm nhãn so the 6 m Vồ Xé cone reaches it. */
  readonly meleeMm: number;
  /** P2, P3: holds this far from the heart centre to charge (a Trận Trụ may stand on the line). */
  readonly chargeFromMm: number;
  /** Vồ Xé every this many ms in P1. */
  readonly voXeEveryMs: number;
  readonly voXe: string;
  readonly charge: string;
  readonly summonCall: string;
}

declare module "../types" {
  interface BossDef {
    readonly bossAct?: BossActDef;
  }
}

export const BOSSES: Readonly<Record<BossId, BossDef>> = {
  "thiet-boi-lang-vuong": {
    id: "thiet-boi-lang-vuong",
    code: "V01",
    name: "Thiết Bối Lang Vương",
    family: "lang",
    tier: "boss",
    w100: 6400,
    // Not in the canon: a heavy wolf king, a little slower than its pack (proposal).
    speedMm: 1200,
    flying: false,
    armour: 0,
    resist: 0,
    element: null,
    groupSize: [1, 1],
    // Never reaches the heart edge: every hit it deals is telegraphed.
    bitePerS: 0,
    attacks: ["vuong-vo-xe", "vuong-goi-dan", "vuong-thiet-boi-xung"],
    standOffMm: 0,
    capturesNodes: false,
    posture: 100,
    placeholder: { gait: "quadruped", colour: "#3d4f66", heightMm: 2500, lengthMm: 4500, widthMm: 1400 },
    act: BITE_ONLY,
    phases: [
      { untilHpPct: 60, attacks: ["vuong-vo-xe", "vuong-goi-dan"], summonEveryMs: 30_000, speedPct: 0, chargeEveryMs: null },
      // P2 interval is not in the canon: 20 s after the last charge ended (proposal; P3 is 15 s).
      { untilHpPct: 30, attacks: ["vuong-thiet-boi-xung"], summonEveryMs: null, speedPct: 0, chargeEveryMs: 20_000 },
      { untilHpPct: 0, attacks: ["vuong-thiet-boi-xung", "vuong-goi-dan"], summonEveryMs: 18_000, speedPct: 25, chargeEveryMs: 15_000 },
    ],
    summon: [
      { species: "thach-thu", count: 7, cluster: true },
      { species: "phong-lang", count: 2, cluster: false },
    ],
    // 5 m from the node for the 6 m cone; charges from 12 m (ô 1 reach from the heart); Vồ Xé every 8 s (proposals).
    bossAct: { meleeMm: 5000, chargeFromMm: 12_000, voXeEveryMs: 8000, voXe: "vuong-vo-xe", charge: "vuong-thiet-boi-xung", summonCall: "vuong-goi-dan" },
  },
};
