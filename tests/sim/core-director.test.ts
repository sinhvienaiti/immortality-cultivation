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
import { DIRECTOR } from "../../src/content/rules";
import type { EventOf, ReplayHeader, SimEvent, World } from "../../src/content/types";
import { mToU } from "../../src/sim/fixed";
import { hashWorld } from "../../src/sim/hash";
import { createWorld, step } from "../../src/sim/world";
import { fake, resetFake, testHeader } from "../local/fakes";

beforeEach(() => resetFake());

function run(header: ReplayHeader, until = 60 * 60 * 12): { world: World; events: SimEvent[] } {
  const world = createWorld(THANH_THACH_AI, header.seed, header);
  const events: SimEvent[] = [];
  while (world.tick < until && world.phase !== "victory" && world.phase !== "defeat") {
    step(world, []);
    events.push(...world.events.drain());
  }
  return { world, events };
}

const paces = (events: readonly SimEvent[]) => events.filter((e): e is EventOf<"pace"> => e.type === "pace");

/** Steps per wave: the wave a step came in (by the last wave-start before it). */
function stepsByWave(events: readonly SimEvent[]): Map<number, EventOf<"pace">[]> {
  const out = new Map<number, EventOf<"pace">[]>();
  let wave = 0;
  for (const event of events) {
    if (event.type === "wave-start") wave = event.wave;
    if (event.type !== "pace") continue;
    if (!out.has(wave)) out.set(wave, []);
    out.get(wave)!.push(event);
  }
  return out;
}

describe("pace director (canon §13.2)", () => {
  it("is off with pacing off: no step whatever happens", () => {
    fake.killAtU = mToU(3);
    fake.bite = true;
    const { events } = run(testHeader({ pacing: false }));
    expect(paces(events)).toEqual([]);
  });

  it("eases a hard fight with at most 2 steps a wave and one Linh Dịch a wave (+5 % Trận Lực)", () => {
    // Beasts reach the heart and bite before they are typed down: pressure and a falling Trận Lực.
    fake.killAtU = mToU(1.9);
    fake.bite = true;
    const { world, events } = run(testHeader());
    const steps = paces(events);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((e) => e.dir === -1)).toBe(true);
    for (const list of stepsByWave(events).values()) {
      expect(list.length).toBeLessThanOrEqual(DIRECTOR.stepsPerWave);
      expect(list.filter((e) => e.lever === "linh-dich").length).toBeLessThanOrEqual(DIRECTOR.linhDichPerWave);
    }
    for (const e of steps) expect(Math.abs(e.spawnPm - 1000)).toBeLessThanOrEqual(DIRECTOR.spawnCapPct * 10);
    const drops = events.filter((e) => e.type === "formation" && e.what === "linh-dich");
    expect(drops.length).toBe(steps.filter((e) => e.lever === "linh-dich").length);
    for (const drop of drops) if (drop.type === "formation") expect(drop.heart).toBeLessThanOrEqual(drop.heartMax);
    expect(world.director.stepsThisWave).toBeLessThanOrEqual(DIRECTOR.stepsPerWave);
  });

  it("presses a calm fight one notch at a time within ± 15 % spawn gaps", () => {
    // Every beast is typed down the moment it is out: no pressure, nothing to type but ô 1.
    fake.killAtU = mToU(40);
    const { world, events } = run(testHeader());
    const steps = paces(events);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((e) => e.dir === 1)).toBe(true);
    for (const list of stepsByWave(events).values()) expect(list.length).toBeLessThanOrEqual(DIRECTOR.stepsPerWave);
    expect(world.director.spawnPm).toBeGreaterThanOrEqual(1000 - DIRECTOR.spawnCapPct * 10);
    expect(world.director.compositionPm).toBeLessThanOrEqual(DIRECTOR.hpCapPct * 10);
    expect(world.director.level).toBe(steps.at(-1)!.level);
  });

  it("is part of the world hash (the kit's meter and director through hashState)", () => {
    const header = testHeader();
    const a = createWorld(THANH_THACH_AI, header.seed, header);
    const b = createWorld(THANH_THACH_AI, header.seed, header);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.director.kit.meter.feed({ danger: true, hp: 1, live: 0, capped: false, backlog: 0, busy: false });
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
