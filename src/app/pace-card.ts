/**
 * The speed card (canon §4.3, D18): one click before the first match;
 * "chưa biết" plays at 25 WPM and measures wave 1.
 * Owner: Lane 3. TODO(lane-3): from games/dragon-hold/src/app/pace-card.ts.
 */
import type { SeatProfile } from "../content/types";

export interface PaceCardChoice {
  readonly profile: SeatProfile;
  /** "Chưa biết": k is recomputed after wave 1 (D41). */
  readonly unknown: boolean;
}

export function showPaceCard(_host: HTMLElement): Promise<PaceCardChoice> {
  return Promise.reject(new Error("TODO(lane-3): app/pace-card.ts showPaceCard"));
}
