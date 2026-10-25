import { describe, expect, it } from "vitest";
import {
  BOSS, DASH, DEATH_TIER, FIELD, FLOW, FORMATION, LEARNING_LEVELS, LOAD, PACE, PLAYER, PRESETS, RULES, SIM, STAGE_M0A, STRENGTH, beastHp, contentHash, gPm, quantizeOrigin,
} from "../../src/content/rules";

/** Spot checks of rules.ts against the canon numbers Lane 2's systems read (canon §4.1, §7.1, §7.5, §8, §9, §13). */
describe("rules.ts against the canon", () => {
  it("holds g(K) = 1.12^K (‰, rounded) and HP = round(W × 90 × g(K) × preset) (canon §7.1, D38)", () => {
    let g = 1;
    STRENGTH.gPmByRealm.forEach((row, realm) => {
      expect(row).toBe(Math.round(g * 1000));
      expect(gPm(realm)).toBe(row);
      g *= 1.12;
    });
    expect(() => gPm(7)).toThrow();
    // canon §7.1 examples at K0 Cân bằng: Thạch Thử 30, Phong Lang 90, Nham Viên 180, Thiết Giáp Trư 270; the Vương 5 760.
    expect([33, 100, 200, 300, BOSS.w100].map((w100) => beastHp(w100, 0, 1000))).toEqual([30, 90, 180, 270, 5760]);
    expect(beastHp(100, 1, 1000)).toBe(101);
    expect(beastHp(200, 0, PRESETS.relax.hpPm)).toBe(153);
  });

  it("quantises an origin to 100 mm = 6 000 u, never −0 (canon §6.1)", () => {
    expect(SIM.uPerM).toBe(60_000);
    expect(quantizeOrigin({ x: 2999, z: 3000 })).toEqual({ x: 0, z: 6000 });
    const q = quantizeOrigin({ x: -2999, z: -9001 });
    expect(Object.is(q.x, 0)).toBe(true);
    expect(q.z).toBe(-12_000);
  });

  it("keeps the match flow, presets and the field of canon §4.1, §8, §9, §13", () => {
    expect([FLOW.prepMs, FLOW.warningMs, FLOW.lullMs, FLOW.breakAutoMs, FLOW.grandBreakMs]).toEqual([20_000, 5000, 8000, 60_000, 15_000]);
    expect([FLOW.threeStarPct, FLOW.twoStarPct]).toEqual([70, 40]);
    expect(Object.fromEntries(Object.entries(PRESETS).map(([id, row]) => [id, [row.hpPm, row.damagePm, row.speedPm, row.breakMs, row.mixedWaves, row.liveWords]]))).toEqual({
      relax: [850, 700, 900, "enter", 5, 5],
      balanced: [1000, 1000, 1000, 20_000, 6, 8],
      challenge: [1150, 1200, 1050, 15_000, 6, 8],
      learn: [850, 700, 900, "enter", 5, 5],
    });
    expect([LOAD.gateGapMs, LOAD.gatePairGapMs, LOAD.analyticTolerancePct]).toEqual([1500, 600, 25]);
    expect([STAGE_M0A.liveCap, STAGE_M0A.clusterSize, STAGE_M0A.waves]).toEqual([60, 7, 6]);
    expect([FORMATION.heartBySeats[0], FORMATION.barrierRadiusMm, FORMATION.downPenaltyPct, FORMATION.linhDichPct]).toEqual([1000, 9000, 5, 5]);
    expect([FORMATION.barrierPlayerReductionPct, FORMATION.barrierGraceMs, FORMATION.barrierFadeMs, FORMATION.barrierJoinMs]).toEqual([10, 1500, 3000, 1000]);
    expect([PLAYER.hp, PLAYER.breakRegenPct, PLAYER.speedMmPerS, PLAYER.radiusMm, PLAYER.downMs]).toEqual([600, 30, 5000, 400, 8000]);
    expect([DASH.distanceMm, DASH.unpushableMs]).toEqual([5000, 300]);
    expect([FIELD.cellMm, FIELD.cols, FIELD.rows, FIELD.heartEdgeMm]).toEqual([500, 80, 52, 2000]);
    expect([PACE.kMinPm, PACE.kMaxPm, PACE.unknownWpm]).toEqual([750, 1300, 25]);
    expect(PACE.refProfile).toEqual({ e: 35, a: 950, cv: 250 });
    expect(DEATH_TIER).toEqual({ swarm: 1, small: 2, medium: 3, general: 4, boss: 5 });
    expect(LEARNING_LEVELS).toEqual({ recallsToHide: 2, weakMastery: 40, knownMastery: 70 });
  });

  it("hashes the rule tables stably (the replay header's rulesHash)", () => {
    expect(contentHash([RULES])).toBe(contentHash([RULES]));
    expect(contentHash([RULES])).toMatch(/^[0-9a-f]{8}$/);
    expect(contentHash([{ a: 1 }])).not.toBe(contentHash([{ a: 2 }]));
    for (const table of [DASH, DEATH_TIER, LEARNING_LEVELS, FLOW, PRESETS]) expect(Object.values(RULES)).toContain(table);
  });
});
