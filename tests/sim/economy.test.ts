// Lane 4 economy.ts (canon §14.2, PB-07, D34): wallets per seat; the fund 900 × f split 60 % kills (by ĐĐ, at the death
// tick, a cluster once), 25 % wave ends (+10 % a wave), 15 % learning from the fund. M0a's maximum is 1 325 ± 3 Linh Sa,
// Thẻ Ôn 9 and Học trước 4; a one-gate teaching stage gives 5 and 2; doing all the learning pays ≤ 15 % more (KT4).
import { describe, expect, it } from "vitest";
import { M0A_WAVES } from "../../src/content/data/waves";
import { GATES, LINH_SA } from "../../src/content/rules";
import type { BeastState, StageDef } from "../../src/content/types";
import { damageBeast } from "../../src/sim/combat";
import { createEconomyState, earn, matchThuHach, payKill, payLearning, payWaveEnd, spend, stageFund, stageLinhSaMax, stageThreatW100, waveEndPay } from "../../src/sim/economy";
import { onBreakStart } from "../../src/sim/shop";
import { waveW100 } from "../../src/sim/waves";
import { step } from "../../src/sim/world";
import { createRng } from "../../src/kit/platform/rng";
import { addBeast, addCluster, makeWorld, testHeader, THANH_THACH_AI } from "./combat-fixture";

const init = (stage: StageDef) => ({ stage, header: testHeader({ stage }), seed: 1, preset: "balanced" as const, realm: 0, gPm: 1000, seats: 1, rng: createRng(1) });

/** A one-gate teaching stage of 5 waves (canon §14.2 example: f 0.6, 4 breaks). */
const TEACH: StageDef = {
  ...THANH_THACH_AI,
  id: "teach-test",
  kind: "teach",
  boss: null,
  waves: M0A_WAVES.slice(0, 5).map((wave) => ({ ...wave, groups: wave.groups.map((group) => ({ ...group, gate: group.gate === "sky" ? ("sky" as const) : ("A" as const) })) })),
};

describe("the M0a stage's numbers (canon §14.2)", () => {
  it("fund 1 125 (2 ground gates, f 1.25); pools 675 / 281; Thẻ Ôn 9, Học trước 4; at most 1 323 = 1 325 ± 3", () => {
    const economy = createEconomyState(init(THANH_THACH_AI));
    expect(stageFund(THANH_THACH_AI)).toBe(1125);
    expect(economy.killPool).toBe(675);
    expect(economy.waveEndPool).toBe(281);
    expect(economy.reviewPay).toBe(9);
    expect(economy.learnAheadPay).toBe(4);
    expect(economy.wallets).toEqual([{ linhSa: LINH_SA.start, thuHach: 0 }]);
    const { world } = makeWorld();
    const max = stageLinhSaMax(world);
    expect(max).toBe(1323);
    expect(Math.abs(max - GATES.m0aLinhSaMax)).toBeLessThanOrEqual(GATES.m0aLinhSaTolerance);
    // KT4: a bot doing every Thẻ Ôn and Học trước gets ≤ 15 % more than one skipping them (167 / 1 156 = 14.4 %).
    const learning = 9 * 3 * 5 + 4 * 8;
    expect(learning).toBe(167);
    expect((learning * 1000) / (max - learning)).toBeLessThanOrEqual(GATES.learningGainMaxPct * 10);
  });

  it("a one-gate teaching stage: Thẻ Ôn 5, Học trước 2 (76 at most)", () => {
    const economy = createEconomyState(init(TEACH));
    expect(stageFund(TEACH)).toBe(540);
    expect(economy.reviewPay).toBe(5);
    expect(economy.learnAheadPay).toBe(2);
    expect(economy.reviewPay * 3 * 4 + economy.learnAheadPay * 8).toBe(76);
  });

  it("ΣĐĐ from the WaveDefs: every planned beast, summons at their most and 50 %, no Vương", () => {
    let expected = 0;
    for (const wave of THANH_THACH_AI.waves) expected += waveW100(wave) - wave.summonMaxW100 + Math.round((wave.summonMaxW100 * LINH_SA.summonThreatPct) / 100);
    expect(stageThreatW100(THANH_THACH_AI)).toBe(expected);
    expect(createEconomyState(init(THANH_THACH_AI)).sumThreatW100).toBe(expected);
  });
});

describe("paying out a whole stage", () => {
  it("every learning reward, every wave end and every planned ĐĐ pay exactly the maximum", () => {
    const { world, of } = makeWorld({ phase: "prep" });
    for (let k = 0; k < 9; k += 1) payLearning(world, 0, "learn-ahead");
    expect(world.economy.wallets[0]!.linhSa).toBe(200 + 32);
    world.phase = "break";
    for (let b = 1; b <= 5; b += 1) {
      onBreakStart(world);
      for (let k = 0; k < 4; k += 1) payLearning(world, 0, "review-card");
    }
    expect(world.economy.paidLearning).toBe(32 + 135);
    expect(of("rejected").map((event) => event.command)).toEqual(["learn-ahead", "review-card", "review-card", "review-card", "review-card", "review-card"]);
    const pays = [1, 2, 3, 4, 5, 6].map((wave) => waveEndPay(world, wave));
    for (let wave = 1; wave <= 6; wave += 1) payWaveEnd(world, wave);
    payWaveEnd(world, 6);
    expect(world.economy.paidWaveEnds).toBe(281);
    expect(pays.reduce((a, b) => a + b, 0)).toBe(281);
    // Each wave pays more than the one before (+10 %).
    for (let k = 1; k < pays.length; k += 1) expect(pays[k]!).toBeGreaterThanOrEqual(pays[k - 1]!);
    // Every planned ĐĐ dies (the plan's beasts and every summon at its most).
    const total = world.economy.sumThreatW100;
    for (const part of [Math.floor(total / 3), Math.floor(total / 3), total - 2 * Math.floor(total / 3)]) {
      payKill(world, { threatW100: part, cluster: -1, killedBySeat: 0 } as BeastState);
    }
    expect(world.economy.paidKills).toBe(675);
    payKill(world, { threatW100: 500, cluster: -1, killedBySeat: 0 } as BeastState);
    expect(world.economy.paidKills).toBe(675);
    expect(world.economy.wallets[0]!.linhSa).toBe(stageLinhSaMax(world));
    expect(world.stats.linhSaEarned + LINH_SA.start).toBe(1323);
  });
});

describe("kills (canon §14.2, D34): booked at the death tick, by ĐĐ, a cluster once", () => {
  it("a cluster pays once, when its last beast dies, in the tick of the deaths", () => {
    const { world, of } = makeWorld();
    const rats = addCluster(world, 3);
    for (const rat of rats) damageBeast(world, rat, 100, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true });
    const tick = world.tick;
    step(world, []);
    const kills = of("linh-sa").filter((event) => event.reason === "kill");
    expect(kills).toHaveLength(1);
    expect(kills[0]!.tick).toBe(tick);
    expect(of("death").map((event) => event.tick)).toEqual([tick, tick, tick]);
    const sum = world.economy.sumThreatW100;
    expect(kills[0]!.delta).toBe(Math.floor((675 * 99) / sum));
    expect(world.stats.kills).toBe(3);
  });

  it("a cluster member killed alone waits for its mates", () => {
    const { world, of } = makeWorld();
    const rats = addCluster(world, 2);
    damageBeast(world, rats[0]!, 100, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true });
    step(world, []);
    expect(of("linh-sa").filter((event) => event.reason === "kill")).toHaveLength(0);
    damageBeast(world, rats[1]!, 100, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true });
    step(world, []);
    expect(of("linh-sa").filter((event) => event.reason === "kill")).toHaveLength(1);
  });

  it("Thú Hạch: an elite +1, a general +2 (noted only); leftover Linh Sa → min(3; floor(left / 100)); defeat keeps 50 %", () => {
    const { world } = makeWorld();
    const elite = addBeast(world, "phong-lang", { elite: "cuong" });
    const general = addBeast(world, "lang-dau-dan");
    for (const beast of [elite, general]) damageBeast(world, beast, 100_000, "typed", { seat: 0, source: "slot2", grade: "good", scaled: true });
    step(world, []);
    expect(world.economy.wallets[0]!.thuHach).toBe(3);
    world.economy.wallets[0]!.linhSa = 350;
    expect(matchThuHach(world, 0)).toBe(3 + 3);
    world.phase = "defeat";
    expect(matchThuHach(world, 0)).toBe(3);
  });
});

describe("the wallet", () => {
  it("spend fails when short and never goes below 0; earn and spend emit `linh-sa`", () => {
    const { world, of } = makeWorld();
    expect(spend(world, 0, 500, "build")).toBe(false);
    expect(world.economy.wallets[0]!.linhSa).toBe(200);
    expect(spend(world, 0, 150, "build")).toBe(true);
    earn(world, 0, 105, "sell");
    expect(world.economy.wallets[0]!.linhSa).toBe(155);
    expect(world.stats.linhSaSpent).toBe(45);
    expect(world.stats.linhSaEarned).toBe(0);
    expect(of("linh-sa").map((event) => [event.delta, event.total, event.reason])).toEqual([
      [-150, 50, "build"],
      [105, 155, "sell"],
    ]);
    expect(spend(world, 3, 1, "buy")).toBe(false);
  });
});
