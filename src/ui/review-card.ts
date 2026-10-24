/**
 * Thẻ Ôn (canon §17): up to 3 questions at a break (Ẩu → hintUsed → new),
 * rotating listen-and-type, meaning-and-type, pick the meaning with 1/2/3;
 * the break clock stops while open; the combat letter layer hides; Linh Sa
 * per right answer via `review-card`. A key panel (input-router KeyPanel).
 * Owner: Lane 3. TODO(lane-3).
 */
import type { KeyPanel } from "../app/input-router";
import type { CommandSink, Presenter } from "../app/contracts";

export type ReviewCardPanel = KeyPanel & Presenter & { open(): void; close(): void };

export function createReviewCard(_host: HTMLElement, _sink: CommandSink, _seat: number): ReviewCardPanel {
  throw new Error("TODO(lane-3): ui/review-card.ts createReviewCard");
}
