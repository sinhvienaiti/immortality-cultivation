// Shared helpers for the Tĩnh Tu tests (Lane 8): session set-ups from the trial set and simple scripted hands.
import { buildPools, pretendRecords, sessionInit, type LessonDef } from "../../src/tinh-tu/sim/lesson";
import {
  createTinhTuSession,
  drainEvents,
  lockedPaper,
  paperLook,
  stepTinhTu,
  typedLetters,
  type SessionCommand,
  type SessionEvent,
  type TinhTuSession,
  type TinhTuTier,
} from "../../src/tinh-tu/sim/session";
import { TRIAL_LESSONS, TRIAL_TOPIC_WORDS as TRIAL_WORDS } from "../../src/content/data/trial-set";

export const RECORDS = pretendRecords(TRIAL_WORDS, TRIAL_LESSONS);

export function lessonSession(seed: number, tier: TinhTuTier, eEffX10: number, lesson: LessonDef = TRIAL_LESSONS[seed % TRIAL_LESSONS.length]!): TinhTuSession {
  const pools = buildPools(TRIAL_WORDS, RECORDS, lesson, seed * 31);
  return createTinhTuSession(sessionInit({ seed: seed * 7919, tier, mode: "lesson", eEffX10, lesson, pools }));
}

export function reviewSession(seed: number, tier: TinhTuTier, eEffX10: number): TinhTuSession {
  const pools = buildPools(TRIAL_WORDS, RECORDS, null, seed);
  return createTinhTuSession(sessionInit({ seed, tier, mode: "review", eEffX10, lesson: null, pools }));
}

export type Hands = (s: TinhTuSession) => SessionCommand[];

/** Never types. */
export const idle: Hands = () => [];

/**
 * Types one right letter every `every` ticks: stays on the locked slip, else
 * starts the slip that leaves first among those it wants (Minh untyped first;
 * never a Tâm ma it can see; `all` types Tâm ma too).
 */
export function steadyHands(every: number, all = false): Hands {
  return (s) => {
    if (s.tick % every !== 0) return [];
    let paper = lockedPaper(s);
    if (paper === null) {
      const wanted = s.papers.filter((item) => all || paperLook(item) !== "tamma");
      const rank = (item: (typeof wanted)[number]) => (item.kind === "minh" ? (s.typedCount[item.word] === 0 ? 0 : 1) : 2);
      paper = [...wanted].sort((a, b) => rank(a) - rank(b) || a.expires - b.expires)[0] ?? null;
    }
    if (paper === null) return [];
    const typed = lockedPaper(s) === paper ? typedLetters(s, paper) : 0;
    return [{ type: "letter", letter: paper.text.charCodeAt(typed) - 97 }];
  };
}

/** Runs a session to its end with `hands`; every event, and a check run after each tick. */
export function play(s: TinhTuSession, hands: Hands, each?: (s: TinhTuSession) => void): SessionEvent[] {
  const events: SessionEvent[] = [];
  while (!s.ended) {
    stepTinhTu(s, hands(s));
    events.push(...drainEvents(s));
    each?.(s);
  }
  return events;
}

export const SPEEDS_X10 = [100, 126, 210, 294, 505, 757, 1000] as const;
export const TIERS: readonly TinhTuTier[] = ["nhap-mon", "tham-ngo"];
