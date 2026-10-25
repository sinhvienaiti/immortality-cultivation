// canon §23.3 "Gần Trận Tâm nhất": one distance to the heart (field.ts heartDistance) for every caller, ties to the smaller beastId.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import type { BeastState, GateId, SpeciesId, World } from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";
import { HEART, cellAt, cellCenterX, cellCenterZ, createField, gatePoint, heartDistance } from "../../src/sim/field";
import { dist, mToU } from "../../src/sim/fixed";
import { nearestToHeart } from "../../src/sim/targeting";

const stage = THANH_THACH_AI;
const field = createField(stage);
const FAR = mToU(100);

function worldOf(list: BeastState[]): World {
  return { stage, field, tick: 0, beasts: { list, free: [], nextSerial: 1000, live: list.length, nextCluster: 0 } } as unknown as World;
}

function beast(serial: number, species: SpeciesId, gate: GateId, x: number, z: number): BeastState {
  return { slot: serial, serial, alive: true, species, gate, x, z, y: 0, cell: -1 } as unknown as BeastState;
}

describe("distance to the heart (canon §23.3)", () => {
  it("walks ground beasts along their flow field from where they stand, flyers straight (sky route or flying species)", () => {
    const at = gatePoint(stage, "A");
    const lang = beast(1, "phong-lang", "A", at.x, at.z);
    const flow = field.flows.A;
    const wp = flow.waypoint[cellAt(field, at.x, at.z)]!;
    expect(wp).toBeGreaterThanOrEqual(0);
    const along = dist(at.x, at.z, cellCenterX(field, wp), cellCenterZ(field, wp)) + flow.pathU[wp]!;
    const straight = dist(at.x, at.z, 0, 0);
    // The west Trận Trụ stands on gate A's line: the field's way is longer than the straight line.
    expect(heartDistance(worldOf([lang]), lang)).toBe(along);
    expect(along).toBeGreaterThan(straight);
    // A flyer at the same spot: straight, on the sky route or (pulled down, any gate) by species.
    expect(heartDistance(worldOf([]), beast(2, "hoa-nha", "sky", at.x, at.z))).toBe(straight);
    expect(heartDistance(worldOf([]), beast(3, "hoa-nha", "A", at.x, at.z))).toBe(straight);
    // Open ground with the heart in sight: the field's way is the straight line.
    const open = beast(4, "thach-thu", "B", mToU(-10), mToU(5));
    expect(flow.waypoint[cellAt(field, open.x, open.z)]).toBe(HEART);
    expect(heartDistance(worldOf([open]), open)).toBe(dist(open.x, open.z, 0, 0));
  });

  it("breaks ties with the smaller beastId whatever the store order: mirrored gates, and ground against air", () => {
    const a = gatePoint(stage, "A");
    const b = gatePoint(stage, "B");
    const west = beast(9, "phong-lang", "A", a.x, a.z);
    const east = beast(4, "phong-lang", "B", b.x, b.z);
    const world = worldOf([west, east]);
    expect(heartDistance(world, west)).toBe(heartDistance(world, east));
    expect(nearestToHeart(world, { x: 0, z: 0 }, FAR)).toBe(east);
    east.serial = 12;
    expect(nearestToHeart(world, { x: 0, z: 0 }, FAR)).toBe(west);
    // A ground beast in the open and a flyer at its mirror image are equally near.
    const ground = beast(7, "phong-lang", "A", mToU(-10), mToU(5));
    const flyer = beast(5, "hoa-nha", "sky", mToU(10), mToU(5));
    const pair = worldOf([ground, flyer]);
    expect(heartDistance(pair, ground)).toBe(heartDistance(pair, flyer));
    expect(nearestToHeart(pair, { x: 0, z: 0 }, FAR)).toBe(flyer);
    flyer.serial = 8;
    expect(nearestToHeart(pair, { x: 0, z: 0 }, FAR)).toBe(ground);
  });

  it("nearestToHeart is the minimum of (heartDistance, beastId) in range over 20 seeded crowds", () => {
    const species: readonly [SpeciesId, GateId][] = [["thach-thu", "A"], ["phong-lang", "B"], ["hoa-nha", "sky"], ["nham-vien", "A"], ["thiet-giap-tru", "B"], ["lang-dau-dan", "A"]];
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const list: BeastState[] = [];
      for (let n = 0; n < 30; n += 1) {
        const [kind, gate] = species[rng.ai.int(0, species.length - 1)]!;
        // Half-metre steps put many beasts at equal distances, so ties come up.
        // Unique serials, not in store order (37 and 61 are coprime).
        list.push(beast(100 + ((n * 37) % 61), kind, gate, mToU(rng.ai.int(-38, 38) / 2), mToU(rng.ai.int(-34, 14) / 2)));
      }
      const world = worldOf(list);
      const from = { x: mToU(rng.ai.int(-10, 10)), z: mToU(rng.ai.int(-12, 4)) };
      const range = mToU(rng.ai.int(6, 20));
      const inRange = list.filter((one) => dist(one.x, one.z, from.x, from.z) <= range);
      const expected = [...inRange].sort((p, q) => heartDistance(world, p) - heartDistance(world, q) || p.serial - q.serial)[0] ?? null;
      const got = nearestToHeart(world, from, range);
      expect(got === null ? null : [heartDistance(world, got), got.serial], "seed " + seed).toEqual(expected === null ? null : [heartDistance(world, expected), expected.serial]);
    }
  });

  it("is defined once (field.ts) and read by targeting, elites and the director; local/auto goes through nearestToHeart", () => {
    const root = resolve(__dirname, "..", "..");
    const text = (path: string) => readFileSync(join(root, path), "utf8");
    const sim = ["field", "targeting", "elites", "director", "beasts", "boss", "pressure", "posture", "telegraph", "world", "waves", "spawn"];
    const defining = sim.filter((name) => /function\s+heartDistance\b/.test(text("src/sim/" + name + ".ts")));
    expect(defining).toEqual(["field"]);
    for (const name of ["targeting", "elites", "director"]) expect(text("src/sim/" + name + ".ts")).toMatch(/import \{[^}]*\bheartDistance\b[^}]*\} from "\.\/field"/);
    expect(text("src/local/auto.ts")).toMatch(/import \{[^}]*\bnearestToHeart\b[^}]*\} from "\.\.\/sim\/targeting"/);
  });
});
