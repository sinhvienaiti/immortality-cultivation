/**
 * Learning events (canon §17, D17, D43): one scored event per word per match,
 * `gameId` immortality-cultivation, `channel`, local queue, `isRightRecall`;
 * Học trước always `hintUsed: true`. Dry-run mode (`dryRun: true`) for bots:
 * never sent; the queue refuses and logs any bot or dry-run event. On
 * `word-first-seen` it calls the ledger's `take`. Storage only through
 * src/app/storage.ts (`gameStorage`).
 * Owner: Lane 3. TODO(lane-3): from games/dragon-hold/src/app/learning.ts.
 */
import type { SimEvent, World } from "../content/types";
import type { NewWordLedger } from "../typing/new-word-ledger";

export interface LearningOptions {
  /** Bots and reports: build events, never send them. */
  readonly dryRun: boolean;
  readonly ledger: NewWordLedger;
  /** Wall clock for `take` (Date.now in the page). */
  readonly now: () => number;
}

export interface LearningSession {
  onEvents(events: readonly SimEvent[], world: World): void;
  /** Dry-run events built so far (bots, HC gates). */
  readonly drafts: readonly unknown[];
  flush(): void;
  dispose(): void;
}

export function createLearning(_options: LearningOptions): LearningSession {
  throw new Error("TODO(lane-3): app/learning.ts createLearning");
}
