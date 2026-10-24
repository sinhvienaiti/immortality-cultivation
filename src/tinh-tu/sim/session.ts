/**
 * Tĩnh Tu session sim (canon §16, D40, PB-12): pure and deterministic (same
 * rules as src/sim: no clock, DOM or Math.random). 60 s; 3–4 reading points;
 * every Minh ≥ 2 times (first with meaning); lives L / 1.5 L / 2 L by the
 * profile's E_eff (kit typing/tempo typeSeconds); no two Minh expire in the
 * same 1.5 s window; own first letters; 1.2 s lock grace (kit typing/session).
 * Score: completed (each Minh typed once) clamp(40 + 5 Minh + 2 Thường − 3
 * wrong; 40; 100), else max(0; …) with no floor; 100 = lĩnh ngộ.
 * Owner: Lane 8. TODO(lane-8).
 */

export type TinhTuTier = "nhap-mon" | "tham-ngo";
export type PaperKind = "minh" | "thuong" | "tam-ma";

export interface SessionResult {
  readonly completed: boolean;
  readonly minh: number;
  readonly thuong: number;
  readonly wrong: number;
  readonly score: number;
}

/** canon §16 scoring (D40). */
export function sessionScore(_completed: boolean, _minh: number, _thuong: number, _wrong: number): number {
  throw new Error("TODO(lane-8): tinh-tu/sim/session.ts sessionScore");
}
