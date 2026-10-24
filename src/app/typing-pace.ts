/**
 * Typing speed (canon §6.5, D18, D41): never assume 35 WPM; `?wpm=` wins,
 * else the speed card, else the `.skill` profile (through storage.ts); after
 * each match the profile updates (kit updateSkill); the first match of an
 * "unknown" profile sends `pace-update` after wave 1.
 * Owner: Lane 3. TODO(lane-3): from games/dragon-hold/src/app/typing-pace.ts.
 */
import type { SeatProfile } from "../content/types";

/** The profile a match starts with, or null when the speed card must ask. */
export function startingProfile(_search: string): SeatProfile | null {
  throw new Error("TODO(lane-3): app/typing-pace.ts startingProfile");
}
