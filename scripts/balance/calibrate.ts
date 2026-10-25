// Source: games/dragon-hold/scripts/balance/calibrate.ts @06cd4e6 (adapted: canon §7.4's mixed test field and single Thú Vương target on this game's sim, the Chuẩn bot of bots.ts with the average kit, effective damage from the share ledger)
/**
 * pnpm ic:calibrate: D_ref and D_đơn (canon §7.4, D13) before the waves are
 * tuned. The Chuẩn bot (35 WPM, 95 %, CV 0.25, Vừa) with the average kit
 * (Vừa's purchases from 900 Linh Sa: 2 Kiếm Thung, Phong Ấn Võng, Lôi Phù Trụ,
 * one Hồi Xuân Đan) stands at the Trận Tâm and plays:
 *  - D_ref: the mixed test field: one long wave on Thanh Thạch Ải whose
 *    groups (a group every 1.2 s, gate rule kept) mix W as 35 % swarm (Thạch
 *    Thử clusters), 35 % small (Phong Lang, Hỏa Nha), 30 % medium (Nham Viên,
 *    Thiết Giáp Trư), faster than any bot kills, so the live cap of 60 keeps
 *    targets in reach all the time;
 *  - D_đơn: one Thiết Bối Lang Vương held 8 m north of the player (no phase
 *    of its own: the stage has no boss), its HP filled every tick.
 * The Trận Lực and the player's Sinh lực are filled every tick (a test field:
 * nothing may end the measure). Effective damage per minute from the share
 * ledger after a 30 s warm-up, over 5 minutes, × 20 seeds; W = 90 × g(K) HP.
 * Prints D_ref, D_đơn (W/min, the rules.ts REF_OUTPUT w100 values) and the
 * typed share per slot beside canon §7.4's estimate (ô 1 ~10, ô 2 ~18,
 * ô 4 ~11, tuyệt kỹ ~8; đánh nền ~12; cơ quan và trận pháp ~16).
 *   tsx scripts/balance/calibrate.ts [--seeds=20] [--minutes=5] [--json=out.json]
 * Owner: Lane 7.
 */
import { writeFileSync } from "node:fs";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { REF_OUTPUT, STRENGTH, gPm } from "../../src/content/rules";
import type { GateId, StageDef, WaveDef, WaveGroupDef, World, LocalState } from "../../src/content/types";
import { mToU } from "../../src/sim/fixed";
import { spawnBeast } from "../../src/sim/spawn";
import { runBot } from "./bot";
import { botById } from "./bots";
import { botDeckSource } from "./vocab";

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => args.find((a) => a.startsWith("--" + name + "="))?.slice(name.length + 3);
const seeds = Number(arg("seeds") ?? 20);
const minutes = Number(arg("minutes") ?? 5);
/** --stand=node: the player stays on the Tâm nhãn (Đứng yên's spot) instead of the Trận Tâm (a comparison, not D_ref). */
const atNode = arg("stand") === "node";
const WARMUP_TICKS = 30 * 60;
const MEASURE_TICKS = Math.round(minutes * 3600);

type Row = readonly [gate: GateId, what: "cluster" | WaveGroupDef["species"], count: number];
/** One cycle: swarm 6.93 W (37 %), small 6.4 W (34 %), medium 5 W (27 %). */
const CYCLE: readonly Row[] = [
  ["A", "cluster", 7],
  ["B", "phong-lang", 2],
  ["A", "nham-vien", 1],
  ["B", "cluster", 7],
  ["sky", "hoa-nha", 3],
  ["A", "phong-lang", 2],
  ["B", "thiet-giap-tru", 1],
  ["A", "cluster", 7],
];
const GROUP_EVERY_MS = 1200;

function mixedWave(lengthMs: number): WaveDef {
  const groups: WaveGroupDef[] = [];
  for (let at = 0, k = 0; at < lengthMs; at += GROUP_EVERY_MS, k += 1) {
    const [gate, what, count] = CYCLE[k % CYCLE.length]!;
    groups.push(what === "cluster" ? { atMs: at, gate, species: "thach-thu", count, cluster: true } : { atMs: at, gate, species: what, count });
  }
  return { id: "calibrate-mixed", durationMs: lengthMs, gates: ["A", "B", "sky"], peaks: [], groups, summonMaxW100: 0 };
}

/** The test field: Thanh Thạch Ải with one long wave and no boss. */
export function mixedStage(lengthMs: number): StageDef {
  return { ...THANH_THACH_AI, id: "calibrate-mixed", waves: [mixedWave(lengthMs)], boss: null };
}

/** The single-target field: one long wave whose only group comes after the measure (the wave never ends), no boss. */
export function singleStage(lengthMs: number): StageDef {
  const late: WaveDef = { id: "calibrate-single", durationMs: lengthMs, gates: ["A"], peaks: [], groups: [{ atMs: lengthMs, gate: "A", species: "phong-lang", count: 1 }], summonMaxW100: 0 };
  return { ...THANH_THACH_AI, id: "calibrate-single", waves: [late], boss: null };
}

const typedOf = (world: World): { slot1: number; slot2: number; slot4: number; slot5: number; seal: number; auto: number; support: number } => {
  const s = world.shares;
  return { slot1: s.typedBySlot[1]!, slot2: s.typedBySlot[2]!, slot4: s.typedBySlot[4]!, slot5: s.typedBySlot[5]!, seal: s.seal + s.cleanse, auto: s.auto, support: s.mechanism + s.consumable + s.formation };
};

interface Measure {
  readonly total: number;
  readonly parts: ReturnType<typeof typedOf>;
}

function measure(seed: number, single: boolean, source: Awaited<ReturnType<typeof botDeckSource>>): Measure {
  const lengthMs = (WARMUP_TICKS + MEASURE_TICKS) * 17 + 60_000;
  const stage = single ? singleStage(lengthMs) : mixedStage(lengthMs);
  let start: ReturnType<typeof typedOf> | null = null;
  let end: ReturnType<typeof typedOf> | null = null;
  let waveTick = -1;
  let boss: { slot: number; serial: number } | null = null;
  const fill = (world: World, local: LocalState): void => {
    world.formation.heart = world.formation.heartMax;
    local.hp = local.hpMax;
    if (single && world.phase === "wave") {
      let beast = boss === null ? null : world.beasts.list[boss.slot];
      if (beast === null || beast === undefined || !beast.alive || beast.serial !== boss!.serial) {
        beast = spawnBeast(world, "thiet-boi-lang-vuong", "A", { wave: 1, x: 0, z: mToU(-8) });
        boss = { slot: beast.slot, serial: beast.serial };
      }
      beast.x = 0;
      beast.z = mToU(-8);
      beast.hp = beast.hpMax;
    }
  };
  runBot(botById("standard"), {
    seed,
    preset: "balanced",
    source,
    stage,
    maxTicks: 0x7fffffff,
    setup: (runner) => {
      // The average kit: Vừa buys it in prep from 900 Linh Sa; the player walks to the Trận Tâm.
      runner.world.economy.wallets[0]!.linhSa = 900;
      if (!atNode) runner.input({ type: "move-to", point: { x: 0, z: 0 } });
    },
    onTick: (world, _events, local) => {
      fill(world, local);
      if (world.phase === "wave" && waveTick < 0) waveTick = world.tick;
      if (waveTick < 0) return;
      const t = world.tick - waveTick;
      if (t === WARMUP_TICKS) start = typedOf(world);
      if (t === WARMUP_TICKS + MEASURE_TICKS) {
        end = typedOf(world);
        world.formation.heart = 0; // ends the run: the next cleanup sees no Trận Lực
      }
    },
  });
  if (start === null || end === null) throw new Error("calibrate: the measure did not complete (seed " + seed + ")");
  const a: ReturnType<typeof typedOf> = start;
  const b: ReturnType<typeof typedOf> = end;
  const parts = { slot1: b.slot1 - a.slot1, slot2: b.slot2 - a.slot2, slot4: b.slot4 - a.slot4, slot5: b.slot5 - a.slot5, seal: b.seal - a.seal, auto: b.auto - a.auto, support: b.support - a.support };
  return { total: Object.values(parts).reduce((sum, value) => sum + value, 0), parts };
}

const source = await botDeckSource();
const wHp = (STRENGTH.wHp * gPm(REF_OUTPUT.realm)) / 1000;
const perMin = (hp: number): number => hp / wHp / minutes;
const ref: Measure[] = [];
const single: Measure[] = [];
for (let seed = 1; seed <= seeds; seed += 1) {
  ref.push(measure(seed, false, source));
  single.push(measure(seed, true, source));
  process.stderr.write("\r" + seed + "/" + seeds);
}
process.stderr.write("\n");
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const sd = (values: readonly number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) * (value - m))));
};
const dRef = ref.map((m) => perMin(m.total));
const dSingle = single.map((m) => perMin(m.total));
const part = (list: readonly Measure[], key: keyof Measure["parts"]): number => mean(list.map((m) => perMin(m.parts[key])));
const out = {
  seeds,
  minutes,
  stand: atNode ? "tam-nhan" : "tran-tam",
  dRefWPerMin: +mean(dRef).toFixed(1),
  dRefSd: +sd(dRef).toFixed(1),
  dSingleWPerMin: +mean(dSingle).toFixed(1),
  dSingleSd: +sd(dSingle).toFixed(1),
  dRefW100PerMin: Math.round(mean(dRef) * 100),
  dSingleW100PerMin: Math.round(mean(dSingle) * 100),
  refParts: Object.fromEntries((["slot1", "slot2", "slot4", "slot5", "seal", "auto", "support"] as const).map((key) => [key, +part(ref, key).toFixed(1)])),
  singleParts: Object.fromEntries((["slot1", "slot2", "slot4", "slot5", "seal", "auto", "support"] as const).map((key) => [key, +part(single, key).toFixed(1)])),
  trial: { dRefW100PerMin: REF_OUTPUT.dRefW100PerMin, dSingleW100PerMin: REF_OUTPUT.dSingleW100PerMin, estimate: REF_OUTPUT.estimateW100PerMin },
};
console.log(JSON.stringify(out, null, 1));
const json = arg("json");
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
