/**
 * Every telegraphed attack (canon §10.2, §10.5, §10.6) in `TelegraphDef`
 * shape (canon §23.3). CB5 and tests/sim/telegraph-floor.test.ts run over all of them.
 * Owner: Lane 5. TODO(lane-5).
 */
import type { TelegraphDef } from "../types";

/** TODO(lane-5): by id. */
export const TELEGRAPHS: Readonly<Record<string, TelegraphDef>> = {};
