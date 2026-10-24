/**
 * Word grades (canon §6.5, D41): Chớp (0 errors, t ≤ 0.85 × t_expected of the
 * player's own profile, with the 5-session floor), Hoàn hảo, Tốt, Vừa, Ẩu; M_q.
 * Owner: Lane 3. TODO(lane-3): from games/dragon-hold/src/typing/grading.ts.
 */
import type { Grade } from "../content/types";

export interface GradeInput {
  readonly errors: number;
  readonly letters: number;
  /** First to last key, ticks. */
  readonly keyTicks: number;
  /** t_expected of this word for the seat's profile, ticks. */
  readonly expectedTicks: number;
}

export function gradeOf(_input: GradeInput): Grade {
  throw new Error("TODO(lane-3): typing/grading.ts gradeOf");
}

/** M_q × 1000 (rules.ts GRADE.mqPm). */
export function mqPm(_grade: Grade): number {
  throw new Error("TODO(lane-3): typing/grading.ts mqPm");
}
