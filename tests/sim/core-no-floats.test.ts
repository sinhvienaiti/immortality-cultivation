// M0A_PLAN §3.1, §6.2 "Không lưu số thực trong trạng thái có băm", with the REAL Lane 2, 3 and 5 systems
// (words.ts and its kit TypingSession included); only Lane 4, still stubs, is faked.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/skills", async () => (await import("../local/fakes")).skills());
vi.mock("../../src/sim/wards", async () => (await import("./beasts-fixture")).fakeWards);
vi.mock("../../src/sim/formation", async () => {
  const fake = (await import("./beasts-fixture")).fakeFormation;
  const { THANH_THACH_AI } = await import("../../src/content/data/stage-m0a");
  const u = (mm: number) => mm * 60;
  return {
    ...fake,
    createFormationState: () => ({
      heart: 1000,
      heartMax: 1000,
      nodes: THANH_THACH_AI.field.nodes.map((n) => ({ id: n.id, at: { x: u(n.at.xMm), z: u(n.at.zMm) }, on: true, capturedBy: null, captureFrom: -1, relightAt: -1, cleanse: -1 })),
      pillars: THANH_THACH_AI.field.pillars.map((p) => ({ id: p.id, at: { x: u(p.at.xMm), z: u(p.at.zMm) }, radiusU: u(p.radiusMm), rams: 0, cracked: false })),
      duongHealed: 0,
      lastHeartHitTick: -1,
    }),
    applyDown: (world: { formation: { heart: number; heartMax: number } }) => {
      world.formation.heart -= Math.round((world.formation.heartMax * 5) / 100);
    },
  };
});
vi.mock("../../src/sim/mechanisms", async () => (await import("../local/fakes")).mechanisms());
vi.mock("../../src/sim/economy", async () => (await import("../local/fakes")).economy());
vi.mock("../../src/sim/shop", async () => (await import("../local/fakes")).shop());
vi.mock("../../src/sim/consumables", async () => (await import("../local/fakes")).consumables());
vi.mock("../../src/sim/shares", async () => (await import("../local/fakes")).shares());
vi.mock("../../src/sim/combat", async () => (await import("../local/fakes")).combat());
vi.mock("../../src/sim/chan-nguyen", () => ({ addChanNguyen: () => undefined, spendChanNguyen: () => undefined }));
vi.mock("../../src/content/data/consumables", async () => (await import("../local/fakes")).consumableData());
vi.mock("../../src/content/data/school-kiem", async () => (await import("../local/fakes")).schoolData());

import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { SIM } from "../../src/content/rules";
import type { DeckWord, ReplayHeader, SimCommand } from "../../src/content/types";
import { createLocal } from "../../src/local/index";
import { HASH_SKIP, LOCAL_HASH_SKIP, hashedFloats } from "../../src/sim/hash";
import { isBanQuyetLive } from "../../src/sim/words";
import { createWorld, stepMatch } from "../../src/sim/world";
import { IC_RULES } from "../../src/typing/config";
import { fake } from "../local/fakes";
import { BASE_TEXTS, NEW_TEXTS } from "../typing/world-fixture";

const deck = (): DeckWord[] => [
  ...BASE_TEXTS.map((text) => ({ wordId: text, text, group: "known" as const, mastery: 0, recalls: 0, assumed: true })),
  ...NEW_TEXTS.map((text) => ({ wordId: text, text, group: "new" as const, mastery: 0, recalls: 0, assumed: false })),
];

const header = (seed: number): ReplayHeader => ({
  v: 1, gameId: "immortality-cultivation", rulesHash: "00000000", seed, stageId: THANH_THACH_AI.id, preset: "balanced", pacing: true,
  seats: [{ seat: 0, profile: { e: 35, a: 950, cv: 250 }, kPm: 1000 }], deck: deck(), newWordAllowance: 8, loadout: { guard: "ward", tamPhap: "kiem-tam" },
});

/** Every number in a tree that is not a safe integer (no skips). */
function floatsIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) out.push(value);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) floatsIn(item, out);
  }
  return out;
}

describe("no floats in hashed state with the real words.ts (M0A_PLAN §3.1)", () => {
  it("the compiled kit TypingRules hold floats, and hashWorld / hashLocal see none of them over 4 minutes of play", () => {
    // The skip matters: IC_RULES (kit config, life.base 1.2 …) is not integer-only, and every session holds it.
    expect(floatsIn(IC_RULES).length).toBeGreaterThan(0);
    fake.killAtU = 12 * SIM.uPerM;
    const h = header(11);
    const world = createWorld(THANH_THACH_AI, h.seed, h);
    expect(world.words.sessions[0]!.rules).toBe(IC_RULES);
    const local = createLocal(0, THANH_THACH_AI, world.gPm);
    const floats: string[] = [];
    let keys = 0;
    let completed = 0;
    while (world.tick < 60 * 60 * 4 && world.phase !== "victory" && world.phase !== "defeat") {
      const commands: SimCommand[] = [];
      if (world.tick === 30) commands.push({ type: "start" });
      if (world.tick % 9 === 0 && isBanQuyetLive(world, 0)) {
        // A scripted typist: the locked word's next letter, else a ready word's first; a wrong key now and then.
        const seat = world.words.seats[0]!;
        const word = seat.locked >= 0 ? world.words.live[seat.locked] : world.words.live.find((w) => w.seat === 0 && w.state === "ready");
        keys += 1;
        if (word) {
          const letter = keys % 23 === 0 ? 16 : word.text.charCodeAt(Math.min(word.typed, word.text.length - 1)) - 97;
          commands.push({ type: "key", seat: 0, letter, ms: world.tick * 17, origin: { x: 0, z: 0 }, aim: null });
        }
      }
      stepMatch(world, local, [], commands);
      completed += world.events.drain().filter((event) => event.type === "word-complete").length;
      if (world.tick % SIM.hashEveryTicks === 0 && floats.length < 20) floats.push(...hashedFloats(world, HASH_SKIP, "world"), ...hashedFloats(local, LOCAL_HASH_SKIP, "local"));
    }
    floats.push(...hashedFloats(world, HASH_SKIP, "world"), ...hashedFloats(local, LOCAL_HASH_SKIP, "local"));
    expect(completed).toBeGreaterThan(10);
    expect(floats).toEqual([]);
  }, 120_000);
});
