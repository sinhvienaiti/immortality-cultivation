import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/words", async () => (await import("../local/fakes")).words());
vi.mock("../../src/sim/cast", async () => (await import("../local/fakes")).cast());
vi.mock("../../src/sim/skills", async () => (await import("../local/fakes")).skills());
vi.mock("../../src/sim/wards", async () => (await import("../local/fakes")).wards());
vi.mock("../../src/sim/formation", async () => (await import("../local/fakes")).formation());
vi.mock("../../src/sim/mechanisms", async () => (await import("../local/fakes")).mechanisms());
vi.mock("../../src/sim/economy", async () => (await import("../local/fakes")).economy());
vi.mock("../../src/sim/shop", async () => (await import("../local/fakes")).shop());
vi.mock("../../src/sim/consumables", async () => (await import("../local/fakes")).consumables());
vi.mock("../../src/sim/shares", async () => (await import("../local/fakes")).shares());
vi.mock("../../src/sim/combat", async () => (await import("../local/fakes")).combat());
vi.mock("../../src/sim/telegraph", async () => (await import("../local/fakes")).telegraph());
vi.mock("../../src/sim/boss", async () => (await import("../local/fakes")).boss());
vi.mock("../../src/sim/beasts", async () => (await import("../local/fakes")).beasts());
vi.mock("../../src/sim/pressure", async () => (await import("../local/fakes")).pressure());
vi.mock("../../src/sim/posture", async () => (await import("../local/fakes")).posture());
vi.mock("../../src/sim/elites", async () => (await import("../local/fakes")).elites());
vi.mock("../../src/sim/targeting", async () => (await import("../local/fakes")).targeting());
vi.mock("../../src/content/data/telegraphs", async () => (await import("../local/fakes")).telegraphData());
vi.mock("../../src/content/data/consumables", async () => (await import("../local/fakes")).consumableData());
vi.mock("../../src/content/data/school-kiem", async () => (await import("../local/fakes")).schoolData());

import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { FLOW, LOAD, PLAYER, SIM, SIM_BUDGET } from "../../src/content/rules";
import type { LocalInput, LocalState, ReplayEntry, ReplayHashes, ReplayHeader, SimCommand, SimEvent, StageDef, World } from "../../src/content/types";
import { createLocal, drainLocalEvents } from "../../src/local/index";
import { msToTicks } from "../../src/sim/fixed";
import { hashLocalHex, hashWorld, hashWorldHex, hashedFloats, HASH_SKIP, LOCAL_HASH_SKIP } from "../../src/sim/hash";
import { liveRoom, spawnGroup } from "../../src/sim/spawn";
import { isWaveOver } from "../../src/sim/waves";
import { allocBeast, beastAt, createWorld, runLog, step, stepMatch } from "../../src/sim/world";
import { fake, resetFake, testHeader } from "../local/fakes";

beforeEach(() => resetFake());

interface Played {
  readonly world: World;
  readonly local: LocalState;
  readonly events: SimEvent[];
  readonly hashes: ReplayHashes[];
  readonly log: ReplayEntry[];
  maxLive: number;
}

/** Plays the M0a stage tick by tick through stepMatch, recording the replay body and both hashes every 600 ticks and at the end. */
function play(header: ReplayHeader, options: { until?: number; stage?: StageDef; commands?: (world: World) => SimCommand[]; inputs?: (world: World) => LocalInput[]; each?: (world: World) => void } = {}): Played {
  const stage = options.stage ?? THANH_THACH_AI;
  const world = createWorld(stage, header.seed, header);
  const local = createLocal(header.seats[0]!.seat, stage, world.gPm);
  const out: Played = { world, local, events: [], hashes: [], log: [], maxLive: 0 };
  const until = options.until ?? 60 * 60 * 15;
  while (world.tick < until && world.phase !== "victory" && world.phase !== "defeat") {
    stepMatch(world, local, options.inputs?.(world) ?? [], options.commands?.(world) ?? [], out.log);
    out.events.push(...world.events.drain(), ...drainLocalEvents(local));
    if (world.beasts.live > out.maxLive) out.maxLive = world.beasts.live;
    options.each?.(world);
    if (world.tick % SIM.hashEveryTicks === 0) out.hashes.push({ tick: world.tick, world: hashWorldHex(world), local: hashLocalHex(local) });
  }
  out.hashes.push({ tick: world.tick, world: hashWorldHex(world), local: hashLocalHex(local) });
  return out;
}

const phases = (events: readonly SimEvent[]) => events.filter((e) => e.type === "phase").map((e) => (e.type === "phase" ? e.phase + (e.wave ? e.wave : "") : ""));

describe("world: creation and phases (canon §4.1)", () => {
  it("starts in a 20 s prep with every system's state, from the header", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    expect(world.phase).toBe("prep");
    expect(world.phaseEndsAt).toBe(msToTicks(FLOW.prepMs));
    expect(world.liveCap).toBe(60);
    expect(world.seats).toEqual([
      { seat: 0, human: true, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000, loadout: { guard: "ward", tamPhap: "kiem-tam" }, chanNguyenPm: 0, downUntil: -1, softTarget: null, lastResolvedTick: -1 },
    ]);
    expect(world.events.drain()).toEqual([{ type: "phase", phase: "prep", wave: 0, endsAtTick: 1200, tick: 0 }]);
    expect(() => createWorld(THANH_THACH_AI, 1, testHeader({ stageId: "other" }))).toThrow();
  });

  it("runs prep → warning 5 s → wave → break 20 s → … → lull 8 s → boss → victory", () => {
    const run = play(testHeader());
    expect(run.world.phase).toBe("victory");
    expect(phases(run.events)).toEqual([
      "prep", "warning1", "wave1", "break1", "warning2", "wave2", "break2", "warning3", "wave3", "break3", "warning4", "wave4", "break4", "warning5", "wave5", "break5",
      "warning6", "wave6", "lull6", "boss6", "victory6",
    ]);
    const at = (phase: string) => run.events.find((e) => e.type === "phase" && e.phase + e.wave === phase)!.tick;
    expect(at("warning1")).toBe(1200);
    expect(at("wave1")).toBe(1500);
    expect(at("warning2") - at("break1")).toBe(msToTicks(20_000));
    expect(at("boss6") - at("lull6")).toBe(msToTicks(FLOW.lullMs));
    // Every wave ended, each once and in order, and was paid (economy) once; breaks told the shop.
    expect(run.events.filter((e) => e.type === "wave-end").map((e) => (e.type === "wave-end" ? e.wave : 0))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fake.waveEnds).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fake.breakStarts).toBe(5);
    expect(run.world.waves.breaks).toBe(5);
    expect(run.events.filter((e) => e.type === "victory")).toEqual([{ type: "victory", stars: 3, tick: run.world.tick - 1 }]);
    // The boss came in from gate A after the lull.
    const boss = run.events.find((e) => e.type === "spawn" && e.species === "thiet-boi-lang-vuong");
    expect(boss).toMatchObject({ gate: "A" });
    expect(boss!.tick).toBeGreaterThanOrEqual(at("boss6"));
  });

  it("starts wave 1's warning at Enter in prep; rejects Enter elsewhere and continue in a timed break", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    step(world, []);
    step(world, [{ type: "start" }]);
    expect(world.phase).toBe("warning");
    expect(world.phaseEndsAt).toBe(1 + msToTicks(FLOW.warningMs));
    world.events.drain();
    step(world, [{ type: "start" }, { type: "continue" }]);
    expect(world.events.drain().filter((e) => e.type === "rejected").map((e) => (e.type === "rejected" ? e.command + ":" + e.reason : ""))).toEqual(["start:phase", "continue:phase"]);
  });

  it("waits for Enter in a Thư giãn break, and goes on by itself after 60 s", () => {
    const run = play(testHeader({ preset: "relax" }), { until: 60 * 60 * 3 });
    const events = run.events;
    const brk = events.find((e) => e.type === "phase" && e.phase === "break")!;
    const next = events.find((e) => e.type === "phase" && e.phase === "warning" && e.wave === 2)!;
    expect(next.tick - brk.tick).toBe(msToTicks(FLOW.breakAutoMs));
    // With continue the break ends at once.
    const header = testHeader({ preset: "relax" });
    const fast = play(header, { until: 60 * 60 * 3, commands: (world) => (world.phase === "break" ? [{ type: "continue" }] : []) });
    const fastBreak = fast.events.find((e) => e.type === "phase" && e.phase === "break")!;
    const fastNext = fast.events.find((e) => e.type === "phase" && e.phase === "warning" && e.wave === 2)!;
    expect(fastNext.tick - fastBreak.tick).toBe(1);
  });
});

describe("world: waves end only when every group spawned and none lives (canon §4.1)", () => {
  it("keeps a wave going past its clock while a beast lives, and the live cap at 60 every tick", () => {
    fake.killAtU = -1;
    let capChecked = 0;
    const run = play(testHeader(), {
      until: 60 * 120,
      each: (world) => {
        expect(world.beasts.live).toBeLessThanOrEqual(world.liveCap);
        if (world.beasts.live === world.liveCap) capChecked += 1;
      },
    });
    expect(run.world.phase).toBe("wave");
    expect(run.world.waves.index).toBe(1);
    expect(run.events.some((e) => e.type === "wave-end")).toBe(false);
    expect(isWaveOver(run.world, 1)).toBe(false);
    // Wave 1 has 45 beasts: no cap yet; hold more and the cap binds.
    expect(run.maxLive).toBe(45);
    expect(capChecked).toBe(0);
  });

  it("holds groups at their gate at the live cap while the wave clock runs, and lets them out when there is room", () => {
    fake.killAtU = -1;
    const stage: StageDef = { ...THANH_THACH_AI, liveCap: 20 };
    let waited = 0;
    const run = play(testHeader(), {
      stage,
      until: 60 * 80,
      each: (world) => {
        expect(world.beasts.live).toBeLessThanOrEqual(20);
        waited = world.spawn.capWaitTicks;
      },
    });
    expect(run.maxLive).toBeLessThanOrEqual(20);
    expect(waited).toBeGreaterThan(0);
    expect(run.world.spawn.pending.length).toBeGreaterThan(0);
    // Room again: the held group leaves at once although the wave clock ran out long ago.
    fake.killAtU = 1_000_000_000;
    const world = run.world;
    const before = world.waves.groupsSpawned;
    step(world, []);
    step(world, []);
    expect(world.waves.groupsSpawned).toBeGreaterThan(before);
  });

  it("ends each wave exactly when its last group is out and its last beast is gone", () => {
    const ends: { wave: number; pending: number; live: number }[] = [];
    play(testHeader(), {
      each: (world) => {
        const last = world.events.lastTick();
        for (const event of last) {
          if (event.type !== "wave-end") continue;
          ends.push({ wave: event.wave, pending: world.spawn.pending.filter((p) => p.wave === event.wave).length, live: world.waves.liveByWave[event.wave]! });
        }
      },
    });
    expect(ends.map((end) => end.wave)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const end of ends) expect(end).toMatchObject({ pending: 0, live: 0 });
  });

  it("starts the lull once the last wave's groups are all out, with its beasts still walking", () => {
    const run = play(testHeader());
    const lull = run.events.find((e) => e.type === "phase" && e.phase === "lull")!;
    const lastSpawn = run.events.filter((e) => e.type === "spawn" && e.species !== "thiet-boi-lang-vuong" && !e.summoned).at(-1)!;
    expect(lull.tick).toBe(lastSpawn.tick);
    const waveSix = run.events.find((e) => e.type === "wave-end" && e.wave === 6)!;
    expect(waveSix.tick).toBeGreaterThan(lull.tick);
  });
});

describe("world: the gate rule and k (canon §13.1, §7.5, §23.3)", () => {
  /** Release ticks per gate from the spawn events (one tick per group; summons and the boss left out). */
  function releases(events: readonly SimEvent[]): { tick: number; gate: string; wave: number }[] {
    const out: { tick: number; gate: string; wave: number }[] = [];
    for (const event of events) {
      if (event.type !== "spawn" || event.summoned || event.species === "thiet-boi-lang-vuong") continue;
      const last = out.at(-1);
      if (last && last.tick === event.tick && last.gate === event.gate) continue;
      out.push({ tick: event.tick, gate: event.gate, wave: 0 });
    }
    return out;
  }

  it("never lets a gate release twice in 1.5 s, or two releases within 0.6 s, at any pace", () => {
    for (const kPm of [750, 1000, 1300]) {
      const run = play(testHeader({ seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm }] }));
      const list = releases(run.events);
      expect(list.length).toBe(THANH_THACH_AI.waves.reduce((sum, wave) => sum + wave.groups.length, 0));
      const lastByGate = new Map<string, number>();
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index]!;
        const before = lastByGate.get(item.gate);
        if (before !== undefined) expect(item.tick - before).toBeGreaterThanOrEqual(msToTicks(LOAD.gateGapMs));
        if (index > 0) expect(item.tick - list[index - 1]!.tick).toBeGreaterThanOrEqual(msToTicks(LOAD.gatePairGapMs));
        lastByGate.set(item.gate, item.tick);
      }
    }
  });

  it("changes only time with k: the same groups, species, elites and HP at 0.75, 1 and 1.30", () => {
    const summary = (kPm: number) => {
      const hp: number[] = [];
      const run = play(testHeader({ pacing: false, seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm }] }), {
        each: (world) => {
          for (const beast of world.beasts.list) if (beast.bornAt === world.tick - 1 && beast.alive) hp.push(beast.hpMax);
        },
      });
      const spawns = run.events.filter((e) => e.type === "spawn");
      const lastOfWave1 = (() => {
        const start = run.events.find((e) => e.type === "wave-start" && e.wave === 1)!.tick;
        const end = run.events.find((e) => e.type === "wave-start" && e.wave === 2)!.tick;
        return spawns.filter((e) => e.tick >= start && e.tick < end).at(-1)!.tick - start;
      })();
      return {
        kinds: spawns.map((e) => (e.type === "spawn" ? e.species + "/" + e.elite + "/" + e.gate + "/" + (e.cluster >= 0) : "")).sort(),
        hp: hp.sort((a, b) => a - b),
        lastOfWave1,
      };
    };
    const slow = summary(750);
    const ref = summary(1000);
    const fast = summary(1300);
    expect(slow.kinds).toEqual(ref.kinds);
    expect(fast.kinds).toEqual(ref.kinds);
    expect(slow.hp).toEqual(ref.hp);
    expect(fast.hp).toEqual(ref.hp);
    // Wave 1's last group: its plan time at k 1, × 1 / 0.75 slower, × 1 / 1.3 sooner (gate rule floors aside).
    const lastMs = Math.max(...THANH_THACH_AI.waves[0]!.groups.map((group) => group.atMs));
    expect(ref.lastOfWave1).toBe(msToTicks(lastMs));
    expect(slow.lastOfWave1).toBe(msToTicks(Math.round(lastMs / 0.75)));
    expect(fast.lastOfWave1).toBe(msToTicks(Math.round(lastMs / 1.3)));
  });

  it("takes pace-update only between wave 1 and wave 2, and the new k times wave 2 (canon §6.5)", () => {
    const update: SimCommand = { type: "pace-update", seat: 0, kPm: 1300 };
    const rejected: string[] = [];
    let sentInWave = false;
    let sentInBreak = false;
    const run = play(testHeader(), {
      until: 60 * 60 * 4,
      commands: (world) => {
        if (world.phase === "wave" && world.waves.index === 1 && !sentInWave) {
          sentInWave = true;
          return [update];
        }
        if (world.phase === "break" && world.waves.index === 1 && !sentInBreak) {
          sentInBreak = true;
          return [{ ...update, kPm: 2000 }];
        }
        return [];
      },
      each: (world) => {
        for (const e of world.events.lastTick()) if (e.type === "rejected") rejected.push(e.command + ":" + e.reason);
      },
    });
    expect(rejected).toEqual(["pace-update:phase"]);
    expect(run.world.seats[0]!.kPm).toBe(1300);
    expect(run.events.filter((e) => e.type === "pace-update")).toMatchObject([{ seat: 0, kPm: 1300 }]);
  });
});

describe("world: commands, beasts and cleanup", () => {
  it("routes seat commands and rejects what the phase forbids", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    world.events.drain();
    step(world, [
      { type: "loadout", seat: 0, guard: "dash", tamPhap: "tich-kiem" },
      { type: "learn-ahead", seat: 0, wordId: "river", correct: true },
      { type: "learn-ahead", seat: 0, wordId: "stone", correct: false },
      { type: "review-card", seat: 0, wordId: "river", correct: true },
      { type: "backspace", seat: 3 },
    ]);
    expect(world.seats[0]!.loadout).toEqual({ guard: "dash", tamPhap: "tich-kiem" });
    // Học trước: Lane 3 books the meeting first (right or wrong), then Lane 4 pays a right answer.
    expect(fake.learning).toEqual(["met:river", "learn-ahead", "met:stone"]);
    expect(world.events.drain().filter((e) => e.type === "rejected").map((e) => (e.type === "rejected" ? e.command + ":" + e.reason : ""))).toEqual(["review-card:phase", "backspace:seat"]);
    step(world, [{ type: "start" }]);
    step(world, [{ type: "loadout", seat: 0, guard: "ward", tamPhap: "kiem-tam" }]);
    expect(world.seats[0]!.loadout.guard).toBe("dash");
  });

  it("puts a seat down for 8 s on `down` (Trận Lực through formation), once", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    step(world, [{ type: "down", seat: 0, origin: { x: 0, z: 0 } }]);
    expect(world.seats[0]!.downUntil).toBe(msToTicks(PLAYER.downMs));
    expect(fake.downs).toEqual([0]);
    expect(world.formation.heart).toBe(950);
    step(world, [{ type: "down", seat: 0, origin: { x: 0, z: 0 } }]);
    expect(fake.downs).toEqual([0]);
    while (world.tick <= msToTicks(PLAYER.downMs)) step(world, []);
    expect(world.seats[0]!.downUntil).toBe(-1);
  });

  it("keeps a soft target only on a live beast", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    world.phase = "wave";
    const [beast] = spawnGroup(world, { atMs: 0, gate: "A", species: "phong-lang", count: 1 }, { wave: 1, summoned: false });
    step(world, [{ type: "soft-target", seat: 0, beast: { slot: beast!.slot, serial: beast!.serial } }]);
    expect(world.seats[0]!.softTarget).toEqual({ slot: beast!.slot, serial: beast!.serial });
    step(world, [{ type: "soft-target", seat: 0, beast: { slot: beast!.slot, serial: beast!.serial + 1 } }]);
    expect(world.seats[0]!.softTarget).toBeNull();
  });

  it("reuses a freed slot with a new serial, and flags only a cluster's last death", () => {
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    world.phase = "wave";
    const cluster = spawnGroup(world, { atMs: 0, gate: "A", species: "thach-thu", count: 7, cluster: true }, { wave: 1, summoned: false });
    expect(cluster).toHaveLength(7);
    expect(new Set(cluster.map((b) => b.cluster)).size).toBe(1);
    expect(liveRoom(world)).toBe(53);
    for (const beast of cluster.slice(0, 3)) {
      beast.alive = false;
      beast.killedBy = "slot4";
    }
    world.events.drain();
    step(world, []);
    for (const beast of cluster.slice(3)) {
      beast.alive = false;
      beast.killedBy = "slot4";
    }
    step(world, []);
    const deaths = world.events.drain().filter((e) => e.type === "death");
    expect(deaths).toHaveLength(7);
    expect(deaths.map((e) => (e.type === "death" ? e.clusterDone : null))).toEqual([false, false, false, false, false, false, true]);
    expect(deaths[0]).toMatchObject({ by: "slot4", tier: 1, species: "thach-thu" });
    expect(world.beasts.live).toBe(0);
    const old = cluster[0]!;
    const fresh = allocBeast(world);
    expect(fresh.slot).toBe(cluster[6]!.slot);
    expect(fresh.serial).toBeGreaterThan(old.serial);
    expect(beastAt(world, { slot: old.slot, serial: old.serial })).toBeNull();
    expect(beastAt(world, { slot: fresh.slot, serial: fresh.serial })).toBe(fresh);
  });

  it("is lost when Trận Lực reaches 0, and then only the tick moves", () => {
    fake.killAtU = -1;
    fake.bite = true;
    const run = play(testHeader());
    expect(run.world.phase).toBe("defeat");
    expect(run.world.formation.heart).toBe(0);
    expect(run.events.filter((e) => e.type === "defeat")).toHaveLength(1);
    const before = hashWorld(run.world);
    const tick = run.world.tick;
    step(run.world, [{ type: "start" }]);
    expect(run.world.tick).toBe(tick + 1);
    run.world.tick = tick;
    expect(hashWorld(run.world)).toBe(before);
  });
});

describe("world: determinism and replays (canon §23.2)", () => {
  const inputs = (world: World): LocalInput[] => {
    if (world.tick === 1300) return [{ type: "move-to", point: { x: -300_000, z: -120_000 } }];
    if (world.tick === 2400) return [{ type: "arrows", mask: 8 }];
    if (world.tick === 2460) return [{ type: "arrows", mask: 0 }];
    return [];
  };
  const commands = (world: World): SimCommand[] => (world.tick === 100 ? [{ type: "start" }] : []);

  it("gives the same hashWorld and hashLocal for the same header and log, through the whole M0a stage", () => {
    const a = play(testHeader({ seed: 11 }), { inputs, commands });
    const b = play(testHeader({ seed: 11 }), { inputs, commands });
    expect(a.world.phase).toBe("victory");
    expect(a.hashes.length).toBeGreaterThan(40);
    expect(b.hashes).toEqual(a.hashes);
    const c = play(testHeader({ seed: 12 }), { inputs, commands });
    expect(c.hashes.at(-1)).not.toEqual(a.hashes.at(-1));
    // The local layer sent đánh nền: its commands are in the log the world got.
    expect(a.log.some((entry) => "command" in entry && entry.command.type === "auto")).toBe(true);
  });

  it("rebuilds world and local from the header and the body with runLog", () => {
    const header = testHeader({ seed: 5 });
    const live = play(header, { inputs, commands, until: 60 * 140 });
    const replay = runLog(header, live.log, live.world.tick);
    expect(hashWorldHex(replay.world)).toBe(live.hashes.at(-1)!.world);
    expect(hashLocalHex(replay.local)).toBe(live.hashes.at(-1)!.local);
    const half = runLog(header, live.log, 60 * 70);
    expect(hashWorldHex(half.world)).toBe(live.hashes.find((h) => h.tick === 60 * 70)!.world);
  });

  it("holds no float in hashed state, world or local", () => {
    play(testHeader(), {
      inputs,
      each: (world) => {
        if (world.tick % 3000 !== 0) return;
        expect(hashedFloats(world, HASH_SKIP)).toEqual([]);
      },
    });
    const header = testHeader();
    const world = createWorld(THANH_THACH_AI, header.seed, header);
    const local = createLocal(0, THANH_THACH_AI, world.gPm);
    expect(hashedFloats(local, LOCAL_HASH_SKIP)).toEqual([]);
  });
});

describe("world: speed (canon §18.4)", () => {
  it("steps 300 beasts in ≤ 0.3 ms headless (Lane 2's systems with fake lanes) and plays the stage ≥ 200× real time", () => {
    fake.killAtU = -1;
    const stage: StageDef = { ...THANH_THACH_AI, liveCap: SIM_BUDGET.beasts };
    const header = testHeader();
    const world = createWorld(stage, header.seed, header);
    world.phase = "wave";
    world.waves.index = 1;
    while (world.beasts.live < SIM_BUDGET.beasts) {
      const gate = (["A", "B", "sky"] as const)[world.beasts.live % 3]!;
      spawnGroup(world, { atMs: 0, gate, species: gate === "sky" ? "hoa-nha" : "phong-lang", count: 5 }, { wave: 1, summoned: false });
    }
    for (let k = 0; k < 120; k += 1) step(world, []);
    const steps = 600;
    const start = performance.now();
    for (let k = 0; k < steps; k += 1) step(world, []);
    const perStepMs = (performance.now() - start) / steps;
    expect(world.beasts.live).toBe(SIM_BUDGET.beasts);
    expect(perStepMs).toBeLessThanOrEqual(SIM_BUDGET.stepMicros / 1000);

    const match = performance.now();
    const run = play(testHeader());
    const realMs = (run.world.tick * 1000) / 60;
    expect(realMs / (performance.now() - match)).toBeGreaterThanOrEqual(SIM_BUDGET.realtimeFactor);
  });
});
