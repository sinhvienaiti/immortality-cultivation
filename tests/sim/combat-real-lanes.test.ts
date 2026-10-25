// Every lane real (2 sim + local, 3 words and casts, 4 skills, combat, formation, wards, mechanisms, economy, shop,
// đan phù, 5 beasts and boss): one scripted match is deterministic (same hashWorld and hashLocal on a second run and
// in a second process: the HASHLINE lines), runLog rebuilds it at the middle and the end, no float reaches a hash, and
// the share report Lane 7 compares with CB2 and CB3 is printed. The part A reviewer's check, now with the real Lane 4.
import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { LINH_SA, SIM } from "../../src/content/rules";
import type { LiveWord, LocalInput, LocalState, ReplayEntry, ReplayHeader, SimCommand, SimEvent, World } from "../../src/content/types";
import { createLocal, drainLocalEvents } from "../../src/local/index";
import { stageLinhSaMax } from "../../src/sim/economy";
import { mToU } from "../../src/sim/fixed";
import { HASH_SKIP, LOCAL_HASH_SKIP, hashLocalHex, hashWorldHex, hashedFloats } from "../../src/sim/hash";
import { shares } from "../../src/sim/shares";
import { isBanQuyetLive } from "../../src/sim/words";
import { createWorld, runLog, stepMatch } from "../../src/sim/world";
import { coldDeck } from "../typing/world-fixture";

/** The bot slot policy of canon §18.3 (PB-05): Tẩy → Ấn → ô 5 → ô 2 → ô 4 → ô 3 → ô 1. */
const RANK_BY_SLOT = [9, 6, 3, 5, 4, 2];
const rank = (word: LiveWord): number => (word.kind === "cleanse" ? 0 : word.kind === "seal" ? 1 : RANK_BY_SLOT[word.slot ?? 0]!);

/** The first letter of the ready word the policy picks, or −1. */
function policyLetter(world: World): number {
  let best: LiveWord | null = null;
  for (const word of world.words.live) if (word.seat === 0 && word.state === "ready" && (best === null || rank(word) < rank(best))) best = word;
  return best === null ? -1 : best.text.charCodeAt(0) - 97;
}

const header = (seed: number, preset: ReplayHeader["preset"] = "balanced"): ReplayHeader => ({
  v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed, stageId: THANH_THACH_AI.id, preset, pacing: true,
  seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000 }], deck: coldDeck(), newWordAllowance: 8, loadout: { guard: "ward", tamPhap: "kiem-tam" },
});

interface Run {
  world: World;
  local: LocalState;
  hashes: string[];
  log: ReplayEntry[];
  events: SimEvent[];
  floats: string[];
}

/** The shop plan: what to place or buy in prep and in each break (Linh Sa permitting). */
function shopping(world: World, commands: SimCommand[]): void {
  const linhSa = world.economy.wallets[0]!.linhSa;
  const slots = world.mechanisms.slots;
  if (slots[0]!.mech === null && linhSa >= 150) commands.push({ type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
  else if (slots[1]!.mech === null && linhSa >= 300) commands.push({ type: "place", seat: 0, slot: 1, mech: "loi-phu-tru" });
  else if (slots[4]!.mech === null && linhSa >= 250) commands.push({ type: "place", seat: 0, slot: 4, mech: "phong-an-vong" });
  else if (slots[0]!.level < 3 && linhSa >= 200) commands.push({ type: "upgrade", seat: 0, slot: 0 });
  else if (linhSa >= 50) commands.push({ type: "buy", seat: 0, item: world.tick % 2 === 0 ? "loi-hoa-phu" : "hoi-xuan-dan" });
}

/**
 * A scripted typist (one key every `keyEvery` ticks on the word the slot policy picks, ~4 % wrong keys, Esc now and
 * then), a shopper, Học trước, Thẻ Ôn, đan phù. Not a Lane 7 bot: no reaction times, no misreads.
 */
function play(h: ReplayHeader, until = 60 * 60 * 12, keyEvery = 9): Run {
  const world = createWorld(THANH_THACH_AI, h.seed, h);
  const local = createLocal(0, THANH_THACH_AI, world.gPm);
  const run: Run = { world, local, hashes: [], log: [], events: [], floats: [] };
  let keys = 0;
  let learned = 0;
  let reviewed = -1;
  let reviews = 0;
  while (world.tick < until && world.phase !== "victory" && world.phase !== "defeat") {
    const commands: SimCommand[] = [];
    const inputs: LocalInput[] = [];
    if (world.phase === "prep") {
      if (world.tick === 5) commands.push({ type: "loadout", seat: 0, guard: "ward", tamPhap: "kiem-tam" });
      if (world.tick % 7 === 3 && learned < 9) {
        const word = h.deck.find((item, index) => item.group === "new" && index >= learned) ?? h.deck[0]!;
        commands.push({ type: "learn-ahead", seat: 0, wordId: word.wordId, correct: learned % 4 !== 3 });
        learned += 1;
      }
      if (world.tick % 11 === 0) shopping(world, commands);
      if (world.tick === 120) commands.push({ type: "start" });
    }
    if (world.phase === "break") {
      if (reviewed !== world.waves.index) {
        reviewed = world.waves.index;
        reviews = 0;
      }
      if (world.tick % 13 === 0 && reviews < 4) {
        commands.push({ type: "review-card", seat: 0, wordId: h.deck[reviews]!.wordId, correct: reviews !== 1 });
        reviews += 1;
      }
      if (world.tick % 17 === 0) shopping(world, commands);
    }
    if (world.tick === 2400) inputs.push({ type: "move-to", point: { x: mToU(4), z: mToU(1) } });
    if (world.tick === 4000) inputs.push({ type: "arrows", mask: 4 });
    if (world.tick === 4090) inputs.push({ type: "arrows", mask: 0 });
    if (world.tick % keyEvery === 0 && isBanQuyetLive(world, 0)) {
      const sw = world.words.seats[0]!;
      let letter = -1;
      if (sw.locked >= 0) {
        const w = world.words.live[sw.locked]!;
        letter = w.text.charCodeAt(Math.min(w.typed, w.text.length - 1)) - 97;
      } else letter = policyLetter(world);
      keys += 1;
      // A cursor on the field now and then (ground skills), else none (the densest cluster).
      const aim = keys % 3 === 0 ? { x: mToU(-2), z: mToU(-7) } : null;
      if (keys % 23 === 0) letter = 16;
      if (keys % 97 === 0) commands.push({ type: "release", seat: 0 });
      else if (letter >= 0) commands.push({ type: "key", seat: 0, letter, ms: world.tick * 17, origin: { x: 0, z: mToU(3) }, aim });
    }
    if ((world.phase === "wave" || world.phase === "boss") && world.tick % 600 === 300) commands.push({ type: "consumable", seat: 0, slot: world.tick % 1200 === 300 ? 0 : 1, origin: { x: 0, z: mToU(3) }, aim: null });
    stepMatch(world, local, inputs, commands, run.log);
    run.events.push(...world.events.drain(), ...drainLocalEvents(local));
    if (world.tick % SIM.hashEveryTicks === 0) {
      run.hashes.push(world.tick + ":" + hashWorldHex(world) + ":" + hashLocalHex(local));
      if (run.floats.length < 20) run.floats.push(...hashedFloats(world, HASH_SKIP, "world"), ...hashedFloats(local, LOCAL_HASH_SKIP, "local"));
    }
  }
  run.hashes.push(world.tick + ":" + hashWorldHex(world) + ":" + hashLocalHex(local));
  return run;
}

const count = (run: Run, type: SimEvent["type"]): number => run.events.filter((event) => event.type === type).length;

/** One REPORT line: what Lane 7 compares with CB2 (typed ≥ 55 %) and CB3 (ô 1 ≤ 30 % of typed); a scripted typist, not a gate. */
function report(label: string, run: Run): void {
  const world = run.world;
  const s = shares(world);
  console.log(
    `REPORT ${label} end ${world.tick} (${(world.tick / 3600).toFixed(2)} min) ${world.phase} wave ${world.waves.index} heart ${world.formation.heart}/${world.formation.heartMax}`,
    `kills ${world.stats.kills} casts ${world.stats.castsResolved}/${world.stats.castsHeld}/${world.stats.castsFizzled}`,
    `typed ${s.typedPm}‰ auto ${s.autoPm}‰ support ${s.supportPm}‰ slot1/typed ${s.slot1OfTypedPm}‰`,
    `by slot ${world.shares.typedBySlot.slice(1).join("/")} seal ${world.shares.seal} auto ${world.shares.auto} mech ${world.shares.mechanism} item ${world.shares.consumable}`,
    `linhSa earned ${world.stats.linhSaEarned} spent ${world.stats.linhSaSpent} wallet ${world.economy.wallets[0]!.linhSa}`,
    `wards ${count(run, "ward")} mech ${count(run, "mechanism")} items ${count(run, "consumable")} rejected ${count(run, "rejected")} downs ${world.stats.downs}`,
  );
}

describe("all lanes real: one scripted match is deterministic (canon §23.2)", () => {
  for (const preset of ["balanced", "relax"] as const) {
    it(`same header and script → same hashWorld and hashLocal; runLog rebuilds them; no floats (${preset})`, () => {
      const a = play(header(11, preset));
      const b = play(header(11, preset));
      expect(b.hashes).toEqual(a.hashes);
      expect(a.floats).toEqual([]);
      const world = a.world;
      report(preset + " key/9", a);
      console.log(`HASHLINE ${preset} ${a.hashes.join(" ")}`);
      // Lane 4 really ran: hits from typed skills, đánh nền and a mechanism; Linh Sa from kills and wave ends.
      expect(world.shares.typedBySlot[1]!).toBeGreaterThan(0);
      expect(world.shares.typedBySlot[2]!).toBeGreaterThan(0);
      expect(world.shares.typedBySlot[4]!).toBeGreaterThan(0);
      expect(world.shares.auto).toBeGreaterThan(0);
      expect(world.shares.mechanism).toBeGreaterThan(0);
      expect(a.events.some((event) => event.type === "linh-sa" && event.reason === "kill")).toBe(true);
      expect(a.events.some((event) => event.type === "linh-sa" && event.reason === "wave-end")).toBe(true);
      // The fund is never exceeded (canon §14.2: 1 325 ± 3 at most).
      expect(world.stats.linhSaEarned + LINH_SA.start).toBeLessThanOrEqual(stageLinhSaMax(world));
      // CB6: one Cast per finished word (held or resolved first), never two for one actionId.
      const firsts = a.events.filter((event): event is Extract<SimEvent, { type: "cast" }> => event.type === "cast" && event.state !== "fizzled");
      const ids = firsts.filter((event, index) => firsts.findIndex((other) => other.actionId === event.actionId) === index);
      expect(ids.length).toBe(count(a, "word-complete"));
      expect(world.casts.duplicates).toBe(0);
      const mid = Math.floor(world.tick / 2 / SIM.hashEveryTicks) * SIM.hashEveryTicks;
      const atMid = runLog(header(11, preset), a.log, mid);
      expect(mid + ":" + hashWorldHex(atMid.world) + ":" + hashLocalHex(atMid.local)).toBe(a.hashes.find((line) => line.startsWith(mid + ":")));
      const atEnd = runLog(header(11, preset), a.log, world.tick);
      expect(world.tick + ":" + hashWorldHex(atEnd.world) + ":" + hashLocalHex(atEnd.local)).toBe(a.hashes[a.hashes.length - 1]);
      const c = play(header(12, preset));
      expect(c.hashes).not.toEqual(a.hashes);
    }, 300_000);
  }

  it("at the Chuẩn bot's pace (35 WPM ≈ a key every 21 ticks), Cân bằng: deterministic; the shares are printed for Lane 7", () => {
    const a = play(header(11), 60 * 60 * 12, 21);
    const b = play(header(11), 60 * 60 * 12, 21);
    expect(b.hashes).toEqual(a.hashes);
    expect(a.floats).toEqual([]);
    report("balanced key/21", a);
    console.log(`HASHLINE chuan ${a.hashes.join(" ")}`);
    expect(a.world.stats.linhSaEarned + LINH_SA.start).toBeLessThanOrEqual(stageLinhSaMax(a.world));
    expect(a.world.shares.typedBySlot[5]!).toBeGreaterThan(0);
  }, 300_000);
});
