/**
 * Thế (canon §10.7): elites 40, generals 60, boss 100 a phase; Ấn −35
 * (team −35 / √seats), skills by table, Phong Ấn Võng −15, −1 per W of typed
 * damage; at 0: down 6 s, × 1.5 damage, then 15 s immune, then full again.
 * Owner: Lane 5. TODO(lane-5).
 */
import type { BeastState, HitSource, World } from "../content/types";

/** Lowers Thế by `delta` (no effect while immune); emits `posture`. */
export function postureHit(_world: World, _beast: BeastState, _delta: number, _source: HitSource): void {
  throw new Error("TODO(lane-5): sim/posture.ts postureHit");
}

export function isBroken(_world: World, _beast: BeastState): boolean {
  throw new Error("TODO(lane-5): sim/posture.ts isBroken");
}

export function stepPosture(_world: World): void {
  throw new Error("TODO(lane-5): sim/posture.ts stepPosture");
}
