/**
 * Thanh Thạch Ải, the M0a grey-box stage (canon §8.1, §13.3, §25): field
 * 40 × 26 m with the heart at the origin, gates A, B at (∓15 m; −18 m), sky
 * entries at (±20 m; −18 m), two Trận Trụ, 6 mechanism slots, the Tâm nhãn;
 * 6 waves + Thiết Bối Lang Vương; live cap 60.
 * Owner: Lane 2. TODO(lane-2): fill the field from canon §8.1 and use data/waves.ts.
 */
import type { StageDef } from "../types";

/** TODO(lane-2): stub until Lane 2 fills it (the cast keeps the type; nothing reads it before). */
export const THANH_THACH_AI = { id: "m0a-thanh-thach-ai" } as StageDef;

export const STAGES: Readonly<Record<string, StageDef>> = { [THANH_THACH_AI.id]: THANH_THACH_AI };
