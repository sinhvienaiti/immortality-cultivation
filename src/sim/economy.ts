// Source: games/dragon-hold/src/sim/economy.ts @06cd4e6 (adapted: wallets per seat in the world (D34), ĐĐ from WaveDef with summons at 50 % and no boss, learning paid from the fund (PB-07), Thú Hạch noted only)
/**
 * Linh Sa (canon §14.2, D34, PB-07): each seat's wallet lives in the world and
 * starts at 200. The stage fund 900 × f_cổng × f_loại splits:
 * - kills 60 %, by ĐĐ (threatW100: W at K0 Cân bằng, elite × 1.6, summons
 *   50 %, the Vương 0), booked at the death tick to the killer's seat; a swarm
 *   cluster pays once, when its last beast dies. ΣĐĐ comes from the WaveDefs at
 *   load with every summon at its maximum (summonMaxW100 at 50 %), no Vương;
 *   running totals pay the pool exactly when everything planned dies, and less
 *   when fewer summons came (never more than the fund);
 * - wave ends 25 %, each wave +10 % on the one before (running totals);
 * - learning 15 %: Thẻ Ôn round(0.15 × fund × 0.8 / (3 × breaks)) a right
 *   answer, ≤ 3 a break; Học trước round(0.15 × fund × 0.2 / 8) a word, ≤ 8.
 * M0a (2 ground gates, f 1.25, 5 breaks): Thẻ Ôn 9, Học trước 4, at most
 * 200 + 675 + 281 + 135 + 32 = 1 323 Linh Sa (canon: 1 325 ± 3); doing all the
 * learning pays 14.4 % more (KT4 ≤ 15 %). Linh Sa never goes below 0; spending
 * with too little fails. Thú Hạch: elite +1, general +2 in the match (× the
 * preset's factor when read), leftover Linh Sa → min(3; floor(left / 100)),
 * defeat keeps 50 %: noted only, no progression at M0a.
 * Owner: Lane 4.
 */
import { LINH_SA, PRESETS, THU_HACH } from "../content/rules";
import type { BeastState, EconomyState, GateId, LinhSaReason, StageDef, World, WorldInit } from "../content/types";
import { threatW100 } from "./beasts";
import { emit } from "./events";
import { mulDiv } from "./fixed";

// Lane 4 fields on its own state (reported for Lane 2 to fold into types.ts).
declare module "../content/types" {
  interface EconomyState {
    /** Kill pool (60 %) and wave-end pool (25 %) of the fund. */
    readonly killPool: number;
    readonly waveEndPool: number;
    /** ĐĐ × 100 killed so far, capped at sumThreatW100. */
    threatDone: number;
    /** Wave-end weights (+10 % a wave) and which waves were paid (1). */
    readonly waveWeights: number[];
    readonly wavePaid: number[];
    /** Swarm clusters: ĐĐ × 100 of members dead so far, paid when the last falls. */
    readonly clusterThreat: { cluster: number; threatW100: number }[];
    /** Linh Sa of one right Thẻ Ôn answer and of one Học trước word (canon §14.2). */
    readonly reviewPay: number;
    readonly learnAheadPay: number;
    /** Right Thẻ Ôn answers paid in break `reviewBreak` (≤ 3) and Học trước words paid (≤ 8). */
    reviewBreak: number;
    reviewPaid: number;
    learnAheadPaid: number;
  }
}

/** Ground gates the stage's waves use (canon §14.2: f_cổng counts ground gates, not the sky route), ≥ 1. */
export function groundGates(stage: StageDef): number {
  const used: GateId[] = [];
  for (const wave of stage.waves) for (const group of wave.groups) if (group.gate !== "sky" && !used.includes(group.gate)) used.push(group.gate);
  return used.length > 0 ? used.length : 1;
}

/** The fund 900 × f_cổng × f_loại (M0a: 1 125). */
export function stageFund(stage: StageDef): number {
  const gates = groundGates(stage);
  const gatesPm = LINH_SA.gatesPm[(gates > LINH_SA.gatesPm.length ? LINH_SA.gatesPm.length : gates) - 1]!;
  return mulDiv(mulDiv(LINH_SA.fund, gatesPm, 1000), LINH_SA.kindPm[stage.kind], 1000);
}

/** Breaks of a stage: one after each wave but the last (M0a: 5). */
export function stageBreaks(stage: StageDef): number {
  return stage.waves.length > 1 ? stage.waves.length - 1 : 1;
}

/** ΣĐĐ × 100 of a stage: every planned beast (elite W × 1.6 + extra), summons at their maximum and 50 %, no Vương. */
export function stageThreatW100(stage: StageDef): number {
  let sum = 0;
  for (const wave of stage.waves) {
    for (const group of wave.groups) {
      if (group.count <= 0) continue;
      const plain = threatW100(group.species, null, false);
      sum += group.elite ? threatW100(group.species, group.elite, false) + plain * (group.count - 1) : plain * group.count;
    }
    sum += mulDiv(wave.summonMaxW100, LINH_SA.summonThreatPct, 100);
  }
  return sum;
}

/** Wave-end weights: wave 1 = 1 000, each next one +10 % (Rồng's integers). */
function waveWeights(count: number): number[] {
  const out: number[] = [];
  let weight = 1000;
  for (let index = 0; index < count; index += 1) {
    out.push(weight);
    weight = Math.round((weight * (100 + LINH_SA.waveStepPct)) / 100);
  }
  return out;
}

export function createEconomyState(init: WorldInit): EconomyState {
  const stage = init.stage;
  const fund = stageFund(stage);
  const learning = fund * LINH_SA.learningPct;
  const weights = waveWeights(stage.waves.length);
  const wallets: EconomyState["wallets"] = [];
  for (let seat = 0; seat < Math.max(1, init.seats); seat += 1) wallets.push({ linhSa: LINH_SA.start, thuHach: 0 });
  return {
    wallets,
    sumThreatW100: stageThreatW100(stage),
    fund,
    paidKills: 0,
    paidWaveEnds: 0,
    paidLearning: 0,
    killPool: mulDiv(fund, LINH_SA.killPct, 100),
    waveEndPool: mulDiv(fund, LINH_SA.waveEndPct, 100),
    threatDone: 0,
    waveWeights: weights,
    wavePaid: weights.map(() => 0),
    clusterThreat: [],
    reviewPay: mulDiv(learning * LINH_SA.reviewSharePct, 1, 100 * 100 * LINH_SA.reviewPerBreak * stageBreaks(stage)),
    learnAheadPay: mulDiv(learning * LINH_SA.learnAheadSharePct, 1, 100 * 100 * LINH_SA.learnAheadWords),
    reviewBreak: -1,
    reviewPaid: 0,
    learnAheadPaid: 0,
  };
}

/** The most Linh Sa a seat can have over the stage: start + kill and wave-end pools + every learning reward (canon §14.2: M0a 1 325 ± 3). */
export function stageLinhSaMax(world: World): number {
  const economy = world.economy;
  return (
    LINH_SA.start +
    economy.killPool +
    economy.waveEndPool +
    economy.reviewPay * LINH_SA.reviewPerBreak * stageBreaks(world.stage) +
    economy.learnAheadPay * LINH_SA.learnAheadWords
  );
}

/** Adds Linh Sa to a seat and emits `linh-sa`. A refund ("sell") is not an earning. */
export function earn(world: World, seat: number, amount: number, reason: LinhSaReason): void {
  const wallet = world.economy.wallets[seat];
  if (wallet === undefined || amount <= 0) return;
  wallet.linhSa += amount;
  if (reason === "sell") world.stats.linhSaSpent -= amount;
  else world.stats.linhSaEarned += amount;
  emit(world, { type: "linh-sa", seat, delta: amount, total: wallet.linhSa, reason });
}

/** False (and a `rejected` event by the caller) when the wallet is short. */
export function spend(world: World, seat: number, amount: number, reason: LinhSaReason): boolean {
  const wallet = world.economy.wallets[seat];
  if (wallet === undefined || amount < 0 || wallet.linhSa < amount) return false;
  if (amount === 0) return true;
  wallet.linhSa -= amount;
  world.stats.linhSaSpent += amount;
  emit(world, { type: "linh-sa", seat, delta: -amount, total: wallet.linhSa, reason });
  return true;
}

/** Wave-end Linh Sa of wave `wave` (1-based) by the running weights; 0 when paid or out of range. */
export function waveEndPay(world: World, wave: number): number {
  const economy = world.economy;
  const index = wave - 1;
  if (index < 0 || index >= economy.waveWeights.length || economy.wavePaid[index] === 1) return 0;
  let total = 0;
  let before = 0;
  for (let k = 0; k < economy.waveWeights.length; k += 1) {
    if (k < index) before += economy.waveWeights[k]!;
    total += economy.waveWeights[k]!;
  }
  const upTo = before + economy.waveWeights[index]!;
  return Math.floor((economy.waveEndPool * upTo) / total) - Math.floor((economy.waveEndPool * before) / total);
}

/** waves.ts calls this when a wave ends: every seat's wallet gets the wave's share (each wave once). */
export function payWaveEnd(world: World, wave: number): void {
  const economy = world.economy;
  const amount = waveEndPay(world, wave);
  const index = wave - 1;
  if (index < 0 || index >= economy.wavePaid.length || economy.wavePaid[index] === 1) return;
  economy.wavePaid[index] = 1;
  economy.paidWaveEnds += amount;
  for (let seat = 0; seat < economy.wallets.length; seat += 1) earn(world, seat, amount, "wave-end");
}

/** One right Thẻ Ôn answer (≤ 3 a break) or Học trước word (≤ 8) of `seat` (world.ts checks the phase). */
export function payLearning(world: World, seat: number, kind: "review-card" | "learn-ahead"): void {
  const economy = world.economy;
  if (kind === "review-card") {
    if (economy.reviewBreak !== world.shop.breakId) {
      economy.reviewBreak = world.shop.breakId;
      economy.reviewPaid = 0;
    }
    if (economy.reviewPaid >= LINH_SA.reviewPerBreak) {
      emit(world, { type: "rejected", command: "review-card", reason: "limit" });
      return;
    }
    economy.reviewPaid += 1;
    economy.paidLearning += economy.reviewPay;
    earn(world, seat, economy.reviewPay, "review-card");
    return;
  }
  if (economy.learnAheadPaid >= LINH_SA.learnAheadWords) {
    emit(world, { type: "rejected", command: "learn-ahead", reason: "limit" });
    return;
  }
  economy.learnAheadPaid += 1;
  economy.paidLearning += economy.learnAheadPay;
  earn(world, seat, economy.learnAheadPay, "learn-ahead");
}

/** Pays the kill pool's share of `threat` more ĐĐ killed (running total, capped at the plan) to `seat`. */
function payThreat(world: World, seat: number, threat: number): void {
  const economy = world.economy;
  if (threat <= 0 || economy.sumThreatW100 <= 0) return;
  const before = economy.threatDone;
  const after = before + threat > economy.sumThreatW100 ? economy.sumThreatW100 : before + threat;
  economy.threatDone = after;
  const amount = Math.floor((economy.killPool * after) / economy.sumThreatW100) - Math.floor((economy.killPool * before) / economy.sumThreatW100);
  if (amount <= 0) return;
  economy.paidKills += amount;
  earn(world, seat, amount, "kill");
}

/** No other member of `beast`'s cluster is alive or waiting for cleanup (world.ts isClusterLast). */
function lastOfCluster(world: World, beast: BeastState): boolean {
  for (const other of world.beasts.list) {
    if (other === beast || other.cluster !== beast.cluster) continue;
    if (other.alive || !other.freed) return false;
  }
  return true;
}

/** The kill share of a dead beast, booked at its death tick (a cluster: when its last beast dies). */
export function payKill(world: World, beast: BeastState): void {
  const seat = beast.killedBySeat >= 0 && beast.killedBySeat < world.economy.wallets.length ? beast.killedBySeat : 0;
  if (beast.cluster < 0) {
    payThreat(world, seat, beast.threatW100);
    return;
  }
  const pending = world.economy.clusterThreat;
  let entry = pending.find((item) => item.cluster === beast.cluster);
  if (entry === undefined) {
    entry = { cluster: beast.cluster, threatW100: 0 };
    pending.push(entry);
  }
  entry.threatW100 += beast.threatW100;
  if (!lastOfCluster(world, beast)) return;
  pending.splice(pending.indexOf(entry), 1);
  payThreat(world, seat, entry.threatW100);
}

/** Cleanup, once per killed beast: Linh Sa by ĐĐ; Thú Hạch for an elite (+1) or a general (+2). */
export function onBeastKilled(world: World, beast: BeastState): void {
  payKill(world, beast);
  const seat = beast.killedBySeat >= 0 ? beast.killedBySeat : 0;
  const wallet = world.economy.wallets[seat];
  if (wallet === undefined) return;
  if (beast.general) wallet.thuHach += THU_HACH.general;
  else if (beast.elite !== null) wallet.thuHach += THU_HACH.elite;
}

/**
 * The seat's Thú Hạch of this match, noted only at M0a (no progression):
 * in-match rewards × the preset's factor, leftover Linh Sa min(3; floor(left / 100)),
 * halved (rounded down) on a defeat (canon §4.1, §13.4, §14.1).
 */
export function matchThuHach(world: World, seat: number): number {
  const wallet = world.economy.wallets[seat];
  if (wallet === undefined) return 0;
  const leftover = Math.floor(wallet.linhSa / THU_HACH.leftoverPer);
  const total = mulDiv(wallet.thuHach, PRESETS[world.preset].thuHachPm, 1000) + (leftover > THU_HACH.leftoverMax ? THU_HACH.leftoverMax : leftover);
  return world.phase === "defeat" ? Math.floor((total * THU_HACH.defeatKeepPct) / 100) : total;
}

/** Nothing runs by the tick at M0a (pay is booked when things happen). */
export function stepEconomy(_world: World): void {}
