// The page's match runner (src/app/match.ts, M0A_PLAN §6.9): commands go into the world at once (a key is in before the
// next frame, even in a hit-stop) and the log still replays exactly, through the same path and through Lane 2's runLog.
import { describe, expect, it } from "vitest";
import { createMatchRunner, LOCAL_COMMANDS, officialCheck, rebuild, replayCheck, type MatchRunner } from "../../src/app/match";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { SIM } from "../../src/content/rules";
import type { LiveWord, ReplayHeader, SimCommand, World } from "../../src/content/types";
import { mToU } from "../../src/sim/fixed";
import { hashLocalHex, hashWorldHex } from "../../src/sim/hash";
import { isBanQuyetLive } from "../../src/sim/words";
import { runLog } from "../../src/sim/world";
import { coldDeck } from "../typing/world-fixture";

const header = (seed: number): ReplayHeader => ({
  v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed, stageId: THANH_THACH_AI.id, preset: "balanced", pacing: true,
  seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000, flashEX1000: 30_000 }], deck: coldDeck(), newWordAllowance: 8, loadout: { guard: "ward", tamPhap: "kiem-tam" },
});

/** The word a typist goes for: the locked one, else the first ready one. */
function nextLetter(world: World): number {
  const words = world.words.seats[0]!;
  if (words.locked >= 0) {
    const word = world.words.live[words.locked]!;
    return word.text.charCodeAt(Math.min(word.typed, word.text.length - 1)) - 97;
  }
  let best: LiveWord | null = null;
  for (const word of world.words.live) if (word.seat === 0 && word.state === "ready" && (best === null || (word.slot ?? 9) > (best.slot ?? 9))) best = word;
  return best === null ? -1 : best.text.charCodeAt(0) - 97;
}

/**
 * A page-like run: "frames" of 1–3 ticks; between ticks the player's keys, panel and shop commands and local inputs
 * come at once (as the input router sends them), several in one frame, some right after a local step already ran.
 */
function play(h: ReplayHeader, until: number, keyEvery = 1): MatchRunner {
  const runner = createMatchRunner(h);
  const world = runner.world;
  let frame = 0;
  let keys = 0;
  while (world.tick < until && !runner.finished) {
    frame += 1;
    const send = (command: SimCommand): void => void runner.send(command);
    if (world.phase === "prep") {
      if (frame === 2) send({ type: "learn-ahead", seat: 0, wordId: h.deck.find((word) => word.group === "new")!.wordId, correct: true });
      if (frame === 3) send({ type: "place", seat: 0, slot: 0, mech: "kiem-thung" });
      if (frame === 40) send({ type: "start" });
    }
    if (world.phase === "break" && frame % 9 === 0) send({ type: "review-card", seat: 0, wordId: h.deck[0]!.wordId, correct: true });
    if (frame === 700) runner.input({ type: "move-to", point: { x: mToU(4), z: mToU(1) } });
    if (frame === 1500) runner.input({ type: "arrows", mask: 8 });
    if (frame === 1530) runner.input({ type: "arrows", mask: 0 });
    // One or two letters a frame while the Bàn Quyết is live (a fast typist), with a wrong key now and then.
    const letters = keyEvery === 1 ? 1 + (frame % 2) : frame % keyEvery === 0 ? 1 : 0;
    for (let k = 0; k < letters && isBanQuyetLive(world, 0); k += 1) {
      keys += 1;
      const letter = keys % 29 === 0 ? 16 : nextLetter(world);
      if (letter >= 0) send({ type: "key", seat: 0, letter, ms: frame * 16, origin: { x: 0, z: mToU(3) }, aim: keys % 4 === 0 ? { x: mToU(-2), z: mToU(-7) } : null });
    }
    if (frame % 401 === 0 && world.phase === "wave") send({ type: "consumable", seat: 0, slot: 0, origin: { x: 0, z: mToU(3) }, aim: null });
    const ticks = 1 + (frame % 3);
    for (let t = 0; t < ticks; t += 1) runner.tick();
    runner.drain();
  }
  return runner;
}

describe("match runner: commands at once, replays exact", () => {
  it("the tail's hashes are what Lane 2's runLog rebuilds; a rebuild through the same path matches, a partial tick included", () => {
    const a = play(header(7), 9000);
    expect(a.tail.length).toBeGreaterThanOrEqual(14);
    for (const entry of a.tail.filter((_, index) => index % 4 === 0 || index === a.tail.length - 1)) {
      const replayed = runLog(a.header, a.log, entry.tick);
      expect(entry.tick + ":" + hashWorldHex(replayed.world) + ":" + hashLocalHex(replayed.local)).toBe(entry.tick + ":" + entry.world + ":" + entry.local);
    }
    expect(officialCheck(a)?.same).toBe(true);
    // The player typed, cast and shopped: the check covers real work.
    expect(a.world.stats.castsResolved).toBeGreaterThan(20);
    expect(a.world.mechanisms.slots[0]!.mech).toBe("kiem-thung");
    expect(a.log.some((entry) => "local" in entry && entry.local.type === "move-to")).toBe(true);
    // A key that comes after this tick's local step: the live world is inside a tick.
    expect(a.localStepped).toBe(false);
    a.send({ type: "backspace", seat: 0 });
    expect(a.localStepped).toBe(true);
    const check = replayCheck(a);
    expect(check.same).toBe(true);
    expect(check.live).toEqual(check.replay);
    expect(check.official?.same).toBe(true);
    // Same header and log: the same match.
    const b = play(header(7), 9000);
    expect(b.tail).toEqual(a.tail.slice(0, b.tail.length));
  }, 120_000);

  it("logs the local layer's own commands, which a rebuild makes again; a changed log changes the hashes", () => {
    // A slow typist: beasts come within đánh nền's 10 m.
    const a = play(header(9), 6000, 6);
    const own = a.log.filter((entry) => "command" in entry && LOCAL_COMMANDS.has(entry.command.type));
    expect(own.length).toBeGreaterThan(0);
    const same = rebuild(a.header, a.log, a.world.tick, a.localStepped);
    expect(same.hashes()).toEqual(a.hashes());
    const keys = a.log.filter((entry) => "command" in entry && entry.command.type === "key");
    expect(keys.length).toBeGreaterThan(50);
    const dropped = a.log.filter((entry) => entry !== keys[25]);
    expect(rebuild(a.header, dropped, a.world.tick, a.localStepped).hashes().world).not.toBe(a.hashes().world);
  }, 60_000);

  it("a hash every 600 ticks and one at the end; nothing goes in after the end or a retreat", () => {
    const a = play(header(5), 1300);
    expect(a.tail.map((entry) => entry.tick)).toEqual([600, 1200]);
    a.stop();
    expect(a.finished).toBe(true);
    expect(a.tail[a.tail.length - 1]!.tick).toBe(a.world.tick);
    const ticks = a.world.tick;
    const entries = a.log.length;
    expect(a.send({ type: "backspace", seat: 0 })).toBe(false);
    a.input({ type: "arrows", mask: 1 });
    a.tick();
    expect(a.world.tick).toBe(ticks);
    expect(a.log.length).toBe(entries);
    expect(officialCheck(a)?.same).toBe(true);
    expect(a.replay().header).toBe(a.header);
    expect(SIM.hashEveryTicks).toBe(600);
  });

  it("a retreat inside a tick keeps the last whole tick's entry (runLog cannot stop inside one)", () => {
    const a = play(header(6), 700);
    a.send({ type: "backspace", seat: 0 });
    a.stop();
    expect(a.tail[a.tail.length - 1]!.tick).toBe(600);
    expect(replayCheck(a).same).toBe(true);
  });
});
