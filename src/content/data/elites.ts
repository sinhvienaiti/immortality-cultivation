/**
 * Tinh anh traits (canon §10.3): Cuồng +30 % speed, Thiết Bì +2 W and armour
 * +1 tier, Hồi Nguyên 1.5 % HP a second after 3 s without a hit. Every elite
 * also gets W × 1.6, Thế 40 and one Ấn (rules.ts ELITES).
 * Owner: Lane 5.
 */
import type { EliteTraitDef, EliteTraitId } from "../types";

export const ELITE_TRAITS: Readonly<Record<EliteTraitId, EliteTraitDef>> = {
  cuong: { id: "cuong", name: "Cuồng", speedPct: 30, extraW100: 0, armourStep: 0, regenPmPerS: 0, regenAfterMs: 0 },
  "thiet-bi": { id: "thiet-bi", name: "Thiết Bì", speedPct: 0, extraW100: 200, armourStep: 1, regenPmPerS: 0, regenAfterMs: 0 },
  "hoi-nguyen": { id: "hoi-nguyen", name: "Hồi Nguyên", speedPct: 0, extraW100: 0, armourStep: 0, regenPmPerS: 15, regenAfterMs: 3000 },
};
