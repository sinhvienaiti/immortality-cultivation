/**
 * Every telegraphed attack (canon §10.2, §10.4–10.6) in `TelegraphDef` shape
 * (canon §23.3). CB5 (tests/sim/telegraph.test.ts) and
 * tests/sim/telegraph-floor.test.ts run over all of them.
 *
 * Sizes in mm: circle reach = radius, width = 2 r; cone reach = length, width =
 * chord at the far end; line reach = longest line, width across; cell reach =
 * width = side. A strike's `formation` applies only when the shape touches the
 * heart (disk r = PRESSURE.heartEdgeMm), so a throw at the Tâm nhãn has its own
 * def with `formation: 0` (canon §10.2: "Trận Lực −12 (Trận Tâm) hoặc 40 Sinh
 * lực người trong 2 m của điểm nhãn"). Summons (Tru Đàn, Gọi Đàn) strike nothing.
 * Owner: Lane 5.
 */
import type { TelegraphDef } from "../types";

const NO_STRIKE = { formation: 0, formationPm: 0, playerHp: 0, knockMm: 0 } as const;

export const TELEGRAPHS: Readonly<Record<string, TelegraphDef>> = {
  // T04 Nham Viên: ring 1.6 s = 1.2 s + 2 m ÷ 5 m/s (PB-27); the Trận Trụ blocks the rock.
  "nham-vien-throw-heart": {
    id: "nham-vien-throw-heart",
    shape: "circle",
    sizeMm: { reach: 2000, width: 4000 },
    typedAnswer: false,
    answers: ["pillar", "mech"],
    chargeMs: 1600,
    strike: { formation: 12, formationPm: 0, playerHp: 40, knockMm: 0 },
  },
  "nham-vien-throw-node": {
    id: "nham-vien-throw-node",
    shape: "circle",
    sizeMm: { reach: 2000, width: 4000 },
    typedAnswer: false,
    answers: ["move", "ward", "pillar"],
    chargeMs: 1600,
    strike: { formation: 0, formationPm: 0, playerHp: 40, knockMm: 0 },
  },
  // T03 Hỏa Nha: dive r 1.5 m around the Tâm nhãn or the heart edge, 1.5 s; Trận Lực −3 when it touches the heart.
  "hoa-nha-dive-heart": {
    id: "hoa-nha-dive-heart",
    shape: "circle",
    sizeMm: { reach: 1500, width: 3000 },
    typedAnswer: false,
    answers: ["move", "ward", "mech"],
    chargeMs: 1500,
    strike: { formation: 3, formationPm: 0, playerHp: 30, knockMm: 0 },
  },
  "hoa-nha-dive-node": {
    id: "hoa-nha-dive-node",
    shape: "circle",
    sizeMm: { reach: 1500, width: 3000 },
    typedAnswer: false,
    answers: ["move", "ward", "mech"],
    chargeMs: 1500,
    strike: { formation: 3, formationPm: 0, playerHp: 30, knockMm: 0 },
  },
  // T05 Thiết Giáp Trư: red line 1.2 s + time to step out of it (2 m wide: 1.4 s, PB-27), Trận Lực −40.
  "thiet-giap-tru-ram": {
    id: "thiet-giap-tru-ram",
    shape: "line",
    sizeMm: { reach: 8000, width: 2000 },
    typedAnswer: false,
    answers: ["pillar", "ward", "mech"],
    chargeMs: 1400,
    strike: { formation: 40, formationPm: 0, playerHp: 0, knockMm: 0 },
  },
  // G01 Lang Đầu Đàn: Tru Đàn, a ring wave 1.5 s, calls 3 Phong Lang; no typed answer (canon §10.4).
  "lang-dau-dan-howl": {
    id: "lang-dau-dan-howl",
    shape: "circle",
    sizeMm: { reach: 1500, width: 3000 },
    typedAnswer: false,
    answers: ["mech"],
    chargeMs: 1500,
    strike: NO_STRIKE,
  },
  // V01 Thiết Bối Lang Vương (canon §10.5).
  "vuong-goi-dan": {
    id: "vuong-goi-dan",
    shape: "circle",
    sizeMm: { reach: 1500, width: 3000 },
    typedAnswer: false,
    answers: ["mech"],
    chargeMs: 1500,
    strike: NO_STRIKE,
  },
  // Vồ Xé: 6 m cone at 60° (chord 6.93 m), 2.0 s ≥ 1.2 + 3.46 ÷ 5 = 1.89 s; 60 Sinh lực.
  "vuong-vo-xe": {
    id: "vuong-vo-xe",
    shape: "cone",
    sizeMm: { reach: 6000, width: 6928 },
    typedAnswer: false,
    answers: ["move", "ward"],
    chargeMs: 2000,
    strike: { formation: 0, formationPm: 0, playerHp: 60, knockMm: 0 },
  },
  // Thiết Bối Xung: line from the Vương to the heart, charge T (the Ấn); unsolved: Trận Lực −8 %, push 3 m.
  "vuong-thiet-boi-xung": {
    id: "vuong-thiet-boi-xung",
    shape: "line",
    sizeMm: { reach: 20_000, width: 3000 },
    typedAnswer: true,
    answers: ["seal", "pillar", "ward", "mech"],
    chargeMs: "T",
    strike: { formation: 0, formationPm: 80, playerHp: 0, knockMm: 3000 },
  },
};

/** Telegraphs that call beasts instead of striking (Tru Đàn, Gọi Đàn). */
export const SUMMON_TELEGRAPHS: readonly string[] = ["lang-dau-dan-howl", "vuong-goi-dan"];
