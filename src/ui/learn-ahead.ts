/**
 * Học trước (canon §17, §14.2): this match's new words (within the ledger),
 * word, IPA, meaning, listen, type each once, no time limit; always
 * `review-card` with `hintUsed: true`, never a recall; Linh Sa per word via
 * the `learn-ahead` command. A key panel (input-router KeyPanel).
 * Owner: Lane 3. TODO(lane-3).
 */
import type { KeyPanel } from "../app/input-router";
import type { CommandSink, Presenter } from "../app/contracts";

export type LearnAheadPanel = KeyPanel & Presenter & { open(): void; close(): void };

export function createLearnAhead(_host: HTMLElement, _sink: CommandSink, _seat: number): LearnAheadPanel {
  throw new Error("TODO(lane-3): ui/learn-ahead.ts createLearnAhead");
}
