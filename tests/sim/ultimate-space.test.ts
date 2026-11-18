import { describe, expect, it } from "vitest";
import type { SimCommand, World } from "../../src/content/types";
import { stepCasts } from "../../src/sim/cast";
import { slotEntry, stepWords, typeKey } from "../../src/sim/words";
import { applyCommand, step } from "../../src/sim/world";
import { banQuyetView } from "../../src/ui/ban-quyet";
import { addBeast, at, makeWorld } from "./combat-fixture";

const space = (world: World, aim = at(0, -6)): void => applyCommand(world, { type: "ultimate", seat: 0, origin: at(0, 0), aim });
function ready(world: World): void {
  world.seats[0]!.chanNguyenPm = 100_000;
  stepWords(world);
  const text = slotEntry(world, 0, 5)!.text;
  expect(text.length).toBeGreaterThan(0);
  for (const letter of text) {
    typeKey(world, { type: "key", seat: 0, letter: letter.charCodeAt(0) - 97, ms: world.tick * 16, origin: at(0, 0), aim: at(0, -6) });
    world.tick += 4;
  }
}

describe("ultimate word → ready → fresh Space", () => {
  it("scores once at completion, ignores early Space, and never auto-releases", () => {
    const { world, of } = makeWorld();
    space(world);
    ready(world);
    addBeast(world, "phong-lang");
    for (let n = 0; n < 200; n += 1) { world.tick += 1; stepCasts(world); }
    expect(of("word-complete")).toHaveLength(1);
    expect(of("cast")).toHaveLength(0);
    expect(world.skills.strikes).toHaveLength(0);
    expect(world.casts.held).toHaveLength(0);
    expect(world.seats[0]!.chanNguyenPm).toBe(100_000);
    expect(banQuyetView(world, 0).slots[4]?.note).toBe("Ultimate ready · Space");
    space(world);
    const strikes = world.skills.strikes.length;
    expect(strikes).toBeGreaterThan(0);
    expect(world.casts.prepared[0]).toBeNull();
    expect(world.seats[0]!.chanNguyenPm).toBeLessThan(100_000);
    space(world);
    expect(world.skills.strikes).toHaveLength(strikes);
    expect(of("word-complete")).toHaveLength(1);
    expect(of("cast").filter(e => e.slot === 5 && e.state === "resolved")).toHaveLength(1);
  });

  it("keeps energy/readiness on a valid ground aim with no target, until another Space", () => {
    const { world, of } = makeWorld();
    ready(world);
    space(world);
    expect(of("rejected").at(-1)).toMatchObject({ command: "ultimate", reason: "target" });
    expect(world.seats[0]!.chanNguyenPm).toBe(100_000);
    expect(world.casts.prepared[0]).not.toBeNull();
    addBeast(world, "phong-lang", { x: 3, z: -6 });
    stepCasts(world);
    expect(world.skills.strikes).toHaveLength(0);
    const command: SimCommand = { type: "ultimate", seat: 0, origin: at(1, 0), aim: at(3, -6) };
    applyCommand(world, command);
    expect(world.skills.strikes[0]?.at).toEqual(command.origin);
    expect(world.skills.strikes[0]?.to).toEqual(command.aim);
  });

  it("clears on death and at the last wave end during the live lull", () => {
    const { world } = makeWorld();
    ready(world);
    applyCommand(world, { type: "down", seat: 0, origin: at(0, 0) });
    expect(world.casts.prepared[0]).toBeNull();
    expect(world.seats[0]!.chanNguyenPm).toBe(100_000);
    const last = makeWorld().world;
    ready(last);
    last.waves.index = last.waves.total;
    last.waves.groupsTotal = last.waves.groupsSpawned = 0;
    last.waves.startedAt = 0;
    step(last);
    expect(last.waves.endedThrough).toBe(last.waves.total);
    expect(last.phase).toBe("lull");
    expect(last.casts.prepared[0]).toBeNull();
    expect(last.seats[0]!.chanNguyenPm).toBe(100_000);
  });
});
