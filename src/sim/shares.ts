/**
 * Damage shares (canon §7.3, CB2, CB3): effective damage by source (typed per
 * slot, Ấn, Tẩy, auto, mechanisms, đan phù, formation).
 * Owner: Lane 4. TODO(lane-4).
 */
import type { HitSource, ShareLedger, World } from "../content/types";

export interface ShareSummary {
  /** Permille of all damage: typed, auto, support (mechanism + consumable + formation). */
  readonly typedPm: number;
  readonly autoPm: number;
  readonly supportPm: number;
  /** Ô 1 as permille of typed damage (CB3). */
  readonly slot1OfTypedPm: number;
}

export function createShareLedger(): ShareLedger {
  throw new Error("TODO(lane-4): sim/shares.ts createShareLedger");
}

export function bucketAdd(_world: World, _source: HitSource, _amount: number): void {
  throw new Error("TODO(lane-4): sim/shares.ts bucketAdd");
}

export function shares(_world: World): ShareSummary {
  throw new Error("TODO(lane-4): sim/shares.ts shares");
}
