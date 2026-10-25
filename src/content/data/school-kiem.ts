/**
 * Trường phái Kiếm (canon §12.1): đánh nền Phi Kiếm, ô 1 Ngự Kiếm Quyết,
 * ô 2 Nhất Tuyến Xuyên Vân, ô 3 Hồi Kiếm Hộ Thân or Lưu Quang Bộ, ô 4 Lạc
 * Kiếm Trận, ô 5 Thiên Hà Kiếm Vũ; tâm pháp Kiếm Tâm, Tích Kiếm; hit ticks
 * after the Cast tick of §12.1 / §23.3. W × 100 is P before M_q (ô 1's P is
 * rules.ts STRENGTH.pRefHp: 100 HP × g(K), canon §7.1). Numbers the canon
 * leaves open are marked "đề xuất" (docs/changelog/2026-10-25-m0a-lane-4.md).
 * Owner: Lane 4.
 */
import type { Element, FeedbackTier, HitSource, SkillDef, TamPhapDef, TamPhapId } from "../types";

// Lane 4 fields on two content defs (reported for Lane 2 to fold into types.ts; in the defs so rulesHash covers them).
declare module "../types" {
  interface SkillDef {
    /** Ô 1: a sword's pierce takes the nearest small beast within this of its target, mm (đề xuất: canon gives no reach). */
    readonly pierceReachMm?: number;
  }
  interface TamPhapDef {
    /** Kiếm Tâm: a Chớp word adds one sword at most every `extraEveryMs`, carrying 1 / `extraShareDiv` of the word. */
    readonly extraEveryMs?: number;
    readonly extraShareDiv?: number;
    /** Tích Kiếm: skill damage % in wave 1, + `perWavePct` per wave held, at most `capPct`. */
    readonly firstWavePct?: number;
    readonly perWavePct?: number;
    readonly capPct?: number;
  }
}

/** The school's element (canon §11: Kiếm = Kim): its typed skills count khắc; đánh nền, mechanisms, đan phù are vô hệ. */
export const SCHOOL_ELEMENT: Element = "kim";

/** canon §12.1 table; ô 3 has two defs, the loadout picks one. */
export const SCHOOL_KIEM: readonly SkillDef[] = [
  {
    id: "phi-kiem",
    school: "kiem",
    slot: "auto",
    name: "Phi Kiếm",
    cooldownMs: 1200,
    castStyle: "move",
    // 1 sword every 1.2 s, 0.25 W physical, 10 m; lands +18 ticks after the command.
    effect: { kind: "auto", everyMs: 1200, w100: 25, rangeMm: 10_000, hitTick: 18 },
  },
  {
    id: "ngu-kiem-quyet",
    school: "kiem",
    slot: 1,
    name: "Ngự Kiếm Quyết",
    cooldownMs: 0,
    castStyle: "move",
    // One word's damage once, split over 3 swords (rest on the last), 12 m, each pierces 1 small beast at 50 %; ≤ 2 bands.
    effect: { kind: "volley", swords: 3, rangeMm: 12_000, pierceSmall: 1, piercePct: 50, maxBands: 2, hitTicks: [6, 36, 66] },
    pierceReachMm: 1500,
  },
  {
    id: "nhat-tuyen-xuyen-van",
    school: "kiem",
    slot: 2,
    name: "Nhất Tuyến Xuyên Vân",
    cooldownMs: 8000,
    castStyle: "move",
    // 14 × 1.2 m line: 2.5 W on the first beast, −15 % each next (floor 40 %), Thế −20; lands +12.
    effect: { kind: "line", lengthMm: 14_000, widthMm: 1200, w100: 250, falloffPct: 15, floorPct: 40, posture: 20, hitTick: 12 },
  },
  {
    id: "hoi-kiem-ho-than",
    school: "kiem",
    slot: 3,
    name: "Hồi Kiếm Hộ Thân",
    cooldownMs: 15_000,
    castStyle: "move",
    // A `ward` r 2 m at the Cast's origin, 5 s, 3 blocks (canon §9.1).
    effect: { kind: "ward", radiusMm: 2000, durationMs: 5000, charges: 3 },
  },
  {
    id: "luu-quang-bo",
    school: "kiem",
    slot: 3,
    name: "Lưu Quang Bộ",
    cooldownMs: 8000,
    castStyle: "move",
    // Glide 5 m, 0.3 s unpushable; `local` applies it on its own `cast resolved` (local/dash.ts).
    effect: { kind: "dash", distanceMm: 5000, unpushableMs: 300 },
  },
  {
    id: "lac-kiem-tran",
    school: "kiem",
    slot: 4,
    name: "Lạc Kiếm Trận",
    cooldownMs: 12_000,
    castStyle: "ground",
    // r 3 m for 5 s at the cursor or the densest cluster in 12 m: 0.3 W/s a beast (a beat of 0.15 W every 30 ticks), slow 20 %, ≤ 4 W a cast over all beasts; opens +12.
    effect: { kind: "zone", radiusMm: 3000, durationMs: 5000, w100PerS: 30, slowPct: 20, capW100: 400, rangeMm: 12_000, openTick: 12, beatTicks: 30 },
  },
  {
    id: "thien-ha-kiem-vu",
    school: "kiem",
    slot: 5,
    name: "Thiên Hà Kiếm Vũ",
    cooldownMs: 0,
    castStyle: "ground",
    // 3 volleys in 2 s, r 6 m at the cursor or the densest cluster in 14 m: 10 W shared evenly, ≤ 2.5 W a beast, cluster cap 60 %, Thế −40.
    effect: { kind: "ultimate", radiusMm: 6000, rangeMm: 14_000, totalW100: 1000, perBeastCapW100: 250, posture: 40, hitTicks: [30, 75, 120] },
  },
];

/** canon §12.1 tâm pháp (S Kiếm Tâm, R Tích Kiếm). */
export const TAM_PHAP: Readonly<Record<TamPhapId, TamPhapDef>> = {
  "kiem-tam": { id: "kiem-tam", name: "Kiếm Tâm", kind: "S", extraEveryMs: 3000, extraShareDiv: 3 },
  "tich-kiem": { id: "tich-kiem", name: "Tích Kiếm", kind: "R", firstWavePct: -8, perWavePct: 4, capPct: 24 },
};

/**
 * Feedback tier T0–T5 (canon §21.1) of a `hit` by its source: presentation only, never a rule (đề xuất của vòng
 * này, chờ chủ dự án xác nhận; Lane 6's feedback profile may override). A Chớp or Hoàn hảo word goes one tier up.
 */
export const HIT_TIER: Readonly<Record<HitSource, FeedbackTier>> = {
  auto: 0,
  slot1: 1,
  slot2: 2,
  slot4: 1,
  slot5: 3,
  seal: 2,
  cleanse: 1,
  mechanism: 0,
  consumable: 2,
  formation: 2,
};

/** The skill def of a slot (ô 3 by the loadout's guard), or of đánh nền. */
export function kiemSkill(slot: SkillDef["slot"], guard: "ward" | "dash" = "ward"): SkillDef {
  const def = SCHOOL_KIEM.find((skill) => skill.slot === slot && (slot !== 3 || skill.effect.kind === guard));
  if (def === undefined) throw new Error("school-kiem: no skill for slot " + String(slot));
  return def;
}
