/**
 * Lang Đầu Đàn and Thiết Bối Lang Vương (canon §10.4, §10.5): aura; Tru Đàn
 * ≤ 2 a wave, only when `liveRoom` fits the whole call (else skipped); the boss
 * in 3 phases (Vồ Xé; Gọi Đàn P1 30 s, P2 none, P3 18 s, ≤ 30 % W_Vương;
 * Thiết Bối Xung with its 4 answers incl. a `ward` crossing the line); roar
 * 2.5 s cancels old Ấn; rams pillars through `pillarOnSegment`.
 * Owner: Lane 5. TODO(lane-5): shape from games/dragon-hold/src/sim/boss.ts.
 */
import type { BossState, World, WorldInit } from "../content/types";

export function createBossState(_init: WorldInit): BossState {
  throw new Error("TODO(lane-5): sim/boss.ts createBossState");
}

export function stepBoss(_world: World): void {
  throw new Error("TODO(lane-5): sim/boss.ts stepBoss");
}
