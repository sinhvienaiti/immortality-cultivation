import { describe, expect, it } from "vitest";
import type { SimEvent } from "../../src/content/types";
import { EVENT_QUEUE_CAP, EventQueue, emit } from "../../src/sim/events";
import { hashValue, hashedFloats, hex32 } from "../../src/sim/hash";

/** canon §23.2, M0A_PLAN §3.1: structural hashes, top-level skips, hashState(); the event queue with lastTick(). */
describe("sim/hash", () => {
  it("is stable for equal trees and changes with any value", () => {
    const a = { x: 1, list: [1, 2, { y: "z" }], flag: true, none: null, typed: new Int32Array([5, 6]) };
    const b = { x: 1, list: [1, 2, { y: "z" }], flag: true, none: null, typed: new Int32Array([5, 6]) };
    expect(hashValue(a)).toBe(hashValue(b));
    expect(hashValue({ ...a, x: 2 })).not.toBe(hashValue(a));
    expect(hashValue({ ...a, list: [1, 2, { y: "w" }] })).not.toBe(hashValue(a));
    expect(hashValue({ ...a, typed: new Int32Array([5, 7]) })).not.toBe(hashValue(a));
    // Values past 2^32 still count; −0 hashes as 0.
    expect(hashValue({ v: 2 ** 33 })).not.toBe(hashValue({ v: 0 }));
    expect(hashValue({ v: -0 })).toBe(hashValue({ v: 0 }));
    expect(hex32(0xabc)).toBe("00000abc");
  });

  it("skips keys at the top level only", () => {
    const skip = new Set(["events"]);
    expect(hashValue({ a: 1, events: [1] }, skip)).toBe(hashValue({ a: 1, events: [2] }, skip));
    expect(hashValue({ a: { events: [1] } }, skip)).not.toBe(hashValue({ a: { events: [2] } }, skip));
  });

  it("hashes an object with hashState() by what it returns", () => {
    const make = (n: number) => ({ hidden: { float: 0.3 }, hashState: () => [n] });
    expect(hashValue({ kit: make(1) })).toBe(hashValue({ kit: { ...make(1), hidden: { float: 9.9 } } }));
    expect(hashValue({ kit: make(1) })).not.toBe(hashValue({ kit: make(2) }));
    expect(hashedFloats({ kit: make(1), ok: 3 })).toEqual([]);
    expect(hashedFloats({ a: [1, 2.5], b: { c: 0.1 } })).toEqual([".a[1] = 2.5", ".b.c = 0.1"]);
  });
});

describe("sim/events", () => {
  it("stamps the tick, drains once, and keeps the last tick for the local layer", () => {
    const world = { tick: 4, events: new EventQueue() };
    emit(world, { type: "wave-end", wave: 1 });
    expect(world.events.lastTick()).toEqual([]);
    world.events.endTick();
    world.tick = 5;
    emit(world, { type: "wave-start", wave: 2, waves: 6, gates: ["A"] });
    expect(world.events.lastTick()).toEqual([{ type: "wave-end", wave: 1, tick: 4 }]);
    const drained = world.events.drain();
    expect(drained.map((event: SimEvent) => event.tick)).toEqual([4, 5]);
    expect(world.events.length).toBe(0);
    // Draining does not touch lastTick(); closing the tick moves it on.
    expect(world.events.lastTick()).toHaveLength(1);
    world.events.endTick();
    expect(world.events.lastTick()).toEqual([{ type: "wave-start", wave: 2, waves: 6, gates: ["A"], tick: 5 }]);
    world.events.endTick();
    expect(world.events.lastTick()).toEqual([]);
  });

  it("drops the oldest undrained events past the cap", () => {
    const queue = new EventQueue();
    for (let k = 0; k < EVENT_QUEUE_CAP + 5; k += 1) queue.push({ type: "wave-end", wave: k, tick: k });
    expect(queue.length).toBe(EVENT_QUEUE_CAP);
    expect(queue.dropped).toBe(5);
    expect(queue.drain()[0]).toMatchObject({ wave: 5 });
    // Long past the cap it still keeps exactly the newest CAP, in order.
    const long = new EventQueue();
    const total = 3 * EVENT_QUEUE_CAP + 7;
    for (let k = 0; k < total; k += 1) long.push({ type: "wave-end", wave: k, tick: k });
    expect([long.length, long.dropped, long.pushed]).toEqual([EVENT_QUEUE_CAP, total - EVENT_QUEUE_CAP, total]);
    const kept = long.drain();
    expect(kept).toHaveLength(EVENT_QUEUE_CAP);
    expect(kept[0]).toMatchObject({ wave: total - EVENT_QUEUE_CAP });
    expect(kept.at(-1)).toMatchObject({ wave: total - 1 });
    expect(long.length).toBe(0);
  });
});
