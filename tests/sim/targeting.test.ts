import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/sim/fixed", () => import("./beasts-fixture").then((f) => f.fakeFixed));
vi.mock("../../src/sim/events", () => import("./beasts-fixture").then((f) => f.fakeEvents));
vi.mock("../../src/sim/world", () => import("./beasts-fixture").then((f) => f.fakeWorld));
vi.mock("../../src/sim/field", () => import("./beasts-fixture").then((f) => f.fakeField));
vi.mock("../../src/sim/spawn", () => import("./beasts-fixture").then((f) => f.fakeSpawn));
vi.mock("../../src/sim/pace", () => import("./beasts-fixture").then((f) => f.fakePace));
vi.mock("../../src/sim/formation", () => import("./beasts-fixture").then((f) => f.fakeFormation));
vi.mock("../../src/sim/wards", () => import("./beasts-fixture").then((f) => f.fakeWards));
vi.mock("../../src/sim/words", () => import("./beasts-fixture").then((f) => f.fakeWords));

import { GATES } from "../../src/content/rules";
import type { SpeciesId, TargetRef } from "../../src/content/types";
import { createRng } from "../../src/kit/platform/rng";
import { initBeast, stepBeasts } from "../../src/sim/beasts";
import { stepBoss } from "../../src/sim/boss";
import { stepPosture } from "../../src/sim/posture";
import { stepBeastAttacks } from "../../src/sim/pressure";
import { chooseTarget, densestPoint, nearestToHeart } from "../../src/sim/targeting";
import { U, addBeast, hooks, makeWorld, run } from "./beasts-fixture";

hooks.initBeast = initBeast;

describe("nearest the heart (canon §23.3)", () => {
  it("picks the live beast nearest the heart within range of `from`; ties go to the smaller beastId", () => {
    const { world } = makeWorld();
    const far = addBeast(world, "phong-lang", { x: U(0), z: U(-10) });
    const near = addBeast(world, "phong-lang", { x: U(0), z: U(-6) });
    const out = addBeast(world, "phong-lang", { x: U(0), z: U(-2.5) });
    // Only the first two are within 12 m of (0; −15).
    expect(nearestToHeart(world, { x: 0, z: U(-15) }, U(12))).toBe(near);
    expect(nearestToHeart(world, { x: 0, z: U(-15) }, U(6))).toBe(far);
    expect(nearestToHeart(world, { x: U(30), z: 0 }, U(5))).toBeNull();
    near.alive = false;
    expect(nearestToHeart(world, { x: 0, z: U(-15) }, U(12))).toBe(far);
    const twin = addBeast(world, "phong-lang", { x: U(0), z: U(-10) });
    expect(twin.serial).toBeGreaterThan(far.serial);
    expect(nearestToHeart(world, { x: 0, z: U(-15) }, U(12))).toBe(far);
    expect(out.alive).toBe(true);
  });

  it("measures flyers straight and ground beasts along their field", () => {
    const { world } = makeWorld();
    const nha = addBeast(world, "hoa-nha", { x: U(5), z: U(-5) }); // 7.07 m straight
    const lang = addBeast(world, "phong-lang", { x: U(0), z: U(-7.4) });
    expect(nha.cell).toBe(-1);
    expect(nearestToHeart(world, { x: 0, z: 0 }, U(12))).toBe(nha);
    lang.z = U(-6.9);
    lang.cell = -1; // off the grid: straight
    expect(nearestToHeart(world, { x: 0, z: 0 }, U(12))).toBe(lang);
  });
});

describe("densest cluster in r (canon §23.3)", () => {
  it("scores W inside the radius; ties: nearer the heart, then smaller beastId", () => {
    const { world } = makeWorld();
    for (let k = 0; k < 7; k += 1) addBeast(world, "thach-thu", { x: U(-6) + U(0.3) * k, z: U(-10) }); // 2.31 W
    const pair = [addBeast(world, "phong-lang", { x: U(6), z: U(-10) }), addBeast(world, "phong-lang", { x: U(6.5), z: U(-10) })]; // 2 W
    expect(densestPoint(world, { x: 0, z: U(-12) }, U(14), U(3))!.x).toBeLessThan(0);
    addBeast(world, "phong-lang", { x: U(7), z: U(-10) }); // 3 W now
    const best = densestPoint(world, { x: 0, z: U(-12) }, U(14), U(3))!;
    expect(best.x).toBeGreaterThan(0);
    expect(densestPoint(world, { x: U(30), z: U(-12) }, U(1), U(3))).toBeNull();
    // Equal score: the candidate nearer the heart wins.
    const lone = makeWorld().world;
    const a = addBeast(lone, "phong-lang", { x: U(-8), z: U(-8) });
    const b = addBeast(lone, "phong-lang", { x: U(5), z: U(-5) });
    expect(densestPoint(lone, { x: 0, z: 0 }, U(14), U(1))).toEqual({ x: b.x, z: b.z });
    expect(a.alive && pair.length === 2).toBe(true);
  });
});

describe("chooseTarget (canon §10.1)", () => {
  it("aims at the heart, or the Tâm nhãn on odd serials for throwers and divers; capturers ram the heart first; the Vương goes for the node in P1", () => {
    const { world } = makeWorld();
    const kinds = (species: SpeciesId) => [addBeast(world, species), addBeast(world, species)].map((b) => chooseTarget(world, b).kind);
    expect(kinds("phong-lang")).toEqual(["heart", "heart"]);
    expect(kinds("nham-vien").sort()).toEqual(["heart", "node"]);
    expect(kinds("hoa-nha").sort()).toEqual(["heart", "node"]);
    expect(kinds("thiet-giap-tru")).toEqual(["heart", "heart"]);
    const vuong = addBeast(world, "thiet-boi-lang-vuong");
    world.boss.phase = 1;
    expect(chooseTarget(world, vuong)).toEqual({ kind: "node", node: "tam-nhan" });
    world.boss.phase = 2;
    expect(chooseTarget(world, vuong)).toEqual({ kind: "heart" });
    const bare = makeWorld({ node: null }).world;
    expect([addBeast(bare, "nham-vien"), addBeast(bare, "nham-vien")].map((b) => chooseTarget(bare, b).kind)).toEqual(["heart", "heart"]);
  });

  it("property: over 20 seeds no beast ever aims at a real player (only heart, node, pillar, gate, zone; never a human seat)", () => {
    expect(GATES.seeds).toBe(20);
    const allowed = new Set<TargetRef["kind"]>(["heart", "node", "pillar", "gate", "zone"]);
    const species: SpeciesId[] = ["thach-thu", "phong-lang", "hoa-nha", "nham-vien", "thiet-giap-tru", "lang-dau-dan"];
    let checked = 0;
    const bad: string[] = [];
    for (let seed = 1; seed <= GATES.seeds; seed += 1) {
      const { world, of } = makeWorld({ seed, phase: "boss", wave: 4 });
      const rng = createRng(seed);
      for (let n = 0; n < 24; n += 1) {
        const pick = species[rng.ai.int(0, species.length - 1)]!;
        addBeast(world, pick, { x: U(rng.ai.int(-18, 18)), z: U(rng.ai.int(-17, -3)), elite: rng.ai.chance(0.2) && pick !== "lang-dau-dan" ? "cuong" : null });
      }
      addBeast(world, "thiet-boi-lang-vuong");
      for (let t = 0; t < 1200; t += 1) {
        run(world, 1, [stepBeasts, stepBeastAttacks, stepBoss, stepPosture]);
        for (const beast of world.beasts.list) {
          if (!beast.alive || beast.target === null) continue;
          checked += 1;
          const target = beast.target;
          if (!allowed.has(target.kind)) bad.push(seed + " " + beast.species + " → " + target.kind);
          if ((target.kind === "bot" || target.kind === "taunt") && world.seats[target.seat]?.human !== false) bad.push(seed + " " + beast.species + " → human seat");
        }
      }
      // Every circle lands on the heart (centre or edge) or the node; cones and lines start at the beast; calls ring the caller.
      for (const start of of("telegraph").filter((e) => e.stage === "start" && e.shape === "circle")) {
        if (start.def === "lang-dau-dan-howl" || start.def === "vuong-goi-dan") continue;
        const onHeart = Math.hypot(start.toX, start.toZ) <= 2.01;
        const onNode = Math.hypot(start.toX - 2, start.toZ - 1) < 0.01;
        if (!onHeart && !onNode) bad.push(seed + " " + start.def + " at " + start.toX + ", " + start.toZ);
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(20 * 1000);
  });
});
