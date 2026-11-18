import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/sim/skills", () => ({ resolveCast: vi.fn(() => true) }));
vi.mock("../../src/sim/chan-nguyen", () => ({ addChanNguyen: vi.fn() }));
vi.mock("../../src/sim/posture", () => ({ postureHit: vi.fn() }));

import { releaseUltimate, stepCasts } from "../../src/sim/cast";
import { resolveCast } from "../../src/sim/skills";
import { dealSeal, slotEntry, stepWords, typeKey } from "../../src/sim/words";
import { banQuyetView } from "../../src/ui/ban-quyet";
import { WordFxEvents } from "../../src/ui/word-fx-events";
import { addBeast, key, makeWorld } from "../typing/world-fixture";

beforeEach(() => vi.mocked(resolveCast).mockReset().mockReturnValue(true));

function fixture(ultimate = false) {
  const fx = makeWorld({ phase: "wave" });
  if (ultimate) fx.world.seats[0]!.chanNguyenPm = 100_000;
  stepWords(fx.world);
  const signals = new WordFxEvents(0);
  signals.read(fx.world.events.drain(), fx.world);
  signals.remember(fx.world, banQuyetView(fx.world, 0));
  return { ...fx, signals };
}

describe("sim events to word effects", () => {
  it("resolves on the last key before any presenter frame; effect and Cast share the tick", () => {
    const { world, signals } = fixture();
    const entry = slotEntry(world, 0, 1)!;
    const text = entry.text;
    for (const char of text.slice(0, -1)) typeKey(world, key(world, char));
    expect(world.casts.resolved).toBe(0);
    const tick = world.tick;
    typeKey(world, key(world, text.at(-1)!));
    expect(world.casts.resolved).toBe(1);
    expect(world.tick).toBe(tick);
    const events = world.events.drain();
    expect(events.find(event => event.type === "cast")).toMatchObject({ tick, state: "resolved" });
    expect(signals.read(events, world)).toContainEqual({ key: "slot-1", kind: "finish", text, action: 0 });
    // Slot 1 can resolve again without waiting for a 640 ms animation.
    stepWords(world);
    const next = slotEntry(world, 0, 1)!.text;
    for (const char of next) typeKey(world, key(world, char));
    expect(world.casts.resolved).toBe(2);
  });

  it("keeps an Ultimate ready until Space, then emits the effect on the release tick", () => {
    const { world, signals } = fixture(true);
    const text = slotEntry(world, 0, 5)!.text;
    for (const char of text) typeKey(world, key(world, char));
    expect(signals.read(world.events.drain(), world).some(signal => signal.kind === "finish")).toBe(false);
    expect(world.casts.prepared[0]).not.toBeNull();
    signals.remember(world, banQuyetView(world, 0));
    const command = key(world, "a");
    world.tick += 1;
    releaseUltimate(world, { type: "ultimate", seat: 0, origin: command.origin, aim: null });
    expect(world.casts.resolved).toBe(1);
    expect(signals.read(world.events.drain(), world)).toContainEqual({ key: "slot-5", kind: "finish", text, action: 0 });
  });

  it("retains a held word until its Cast resolves, without replaying completion", () => {
    const { world, signals } = fixture();
    vi.mocked(resolveCast).mockReturnValue(false);
    const text = slotEntry(world, 0, 2)!.text;
    for (const char of text) typeKey(world, key(world, char));
    expect(signals.read(world.events.drain(), world).some(signal => signal.kind === "finish")).toBe(false);
    signals.remember(world, banQuyetView(world, 0));
    vi.mocked(resolveCast).mockReturnValue(true);
    world.tick += 1;
    stepCasts(world);
    expect(signals.read(world.events.drain(), world)).toContainEqual({ key: "slot-2", kind: "finish", text, action: 0 });
    expect(signals.read(world.events.drain(), world)).toEqual([]);
  });

  it("captures Seal text before its store index disappears; ignores another seat", () => {
    const { world, signals } = fixture();
    const beast = addBeast(world);
    dealSeal(world, 0, beast);
    signals.read(world.events.drain(), world);
    signals.remember(world, banQuyetView(world, 0));
    const index = world.words.seats[0]!.seals[0]!;
    const text = world.words.live[index]!.text;
    for (const char of text) typeKey(world, key(world, char));
    const events = world.events.drain();
    expect(signals.read(events.map(event => ({ ...event, seat: 1 })), world)).toEqual([]);
    expect(signals.read(events, world)).toContainEqual({ key: "seal-" + index, kind: "finish", text, action: 0 });
  });
});
