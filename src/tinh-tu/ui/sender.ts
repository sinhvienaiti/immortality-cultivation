/**
 * Sends the Tĩnh Tu page's learning drafts through kit/learning (canon §16,
 * §17): a draft gets its `occurredAt` from the page's wall clock and goes to
 * the bridge, which posts to the portal or queues locally. Hard check (canon
 * §17.2, D43): a bot or dry-run draft is refused and logged, never queued.
 * Owner: Lane 8.
 */
import type { LearningEvent } from "../../kit/learning/events";
import type { DraftRecord, LearningDraft } from "../sim/learning";

/** What the sender needs of kit LearningBridge. */
export interface AttemptSink {
  sendAttempt(event: LearningEvent): void;
}

export type TinhTuLearningEvent = LearningEvent & { readonly channel: LearningDraft["channel"] };

export function toLearningEvent(draft: LearningDraft, nowMs: number): TinhTuLearningEvent {
  return { ...draft, occurredAt: new Date(nowMs).toISOString() };
}

export interface LearningSender {
  /** Sends a human draft; refuses (false) and logs a bot or dry-run one. */
  send(record: DraftRecord, nowMs: number): boolean;
  readonly sent: number;
  readonly refused: number;
}

export function createLearningSender(sink: AttemptSink, report: (message: string) => void): LearningSender {
  let sent = 0;
  let refused = 0;
  return {
    send(record, nowMs) {
      if (record.context.bot || record.context.dryRun) {
        refused += 1;
        report("tinh-tu: refused a " + (record.context.bot ? "bot" : "dry-run") + " learning draft for " + record.draft.entityId + " (canon §17.2)");
        return false;
      }
      sink.sendAttempt(toLearningEvent(record.draft, nowMs));
      sent += 1;
      return true;
    },
    get sent() {
      return sent;
    },
    get refused() {
      return refused;
    },
  };
}
