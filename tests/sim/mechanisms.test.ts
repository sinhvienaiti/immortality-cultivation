// Lane 4 mechanisms.ts (canon §8.3): Kiếm Thung, Lôi Phù Trụ, Phong Ấn Võng on the real stage's slots; levels;
// flyers skip ground mechanisms; Phong Ấn Võng holds (hardUntil, pulls flyers down, Thế −15) within the 35 % cap.
import { describe, expect, it } from "vitest";
import type { MechanismId, World } from "../../src/content/types";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { stepBeasts } from "../../src/sim/beasts";
import { holdAllowance, inStrip, levelPm, slotPoint, stepMechanisms } from "../../src/sim/mechanisms";
import { addBeast, advance, makeWorld } from "./combat-fixture";

function build(world: World, index: number, mech: MechanismId, level = 1): void {
  const slot = world.mechanisms.slots.find((item) => item.index === index)!;
  slot.mech = mech;
  slot.level = level;
  slot.nextFire = world.tick;
}

describe("levels (canon §8.3): main effect × 1.45, then × 1.35", () => {
  it("1 000, 1 450, 1 958 ‰", () => {
    expect([1, 2, 3].map(levelPm)).toEqual([1000, 1450, 1958]);
  });
});

describe("Kiếm Thung (strip 4 × 2 m along the path)", () => {
  it("slows 25 % inside, 0.05 W/s physical a pulse each second; armour applies; flyers and beasts outside untouched", () => {
    const { world, of } = makeWorld();
    build(world, 0, "kiem-thung");
    const centre = slotPoint(world, 0);
    expect(inStrip(centre, 240_000, 120_000, centre.x, centre.z, THANH_THACH_AI.field.mechSlots[0]!.alongPm!)).toBe(true);
    const wolf = addBeast(world, "phong-lang", { x: -2.79, z: -30 });
    const along = addBeast(world, "phong-lang", { x: -3.2, z: -28.2 });
    const aside = addBeast(world, "phong-lang", { x: -1.29, z: -30 });
    const tru = addBeast(world, "thiet-giap-tru", { x: -2.79, z: -29.7 });
    const crow = addBeast(world, "hoa-nha", { x: -2.79, z: -30, gate: "sky" });
    advance(world, 121, [stepMechanisms]);
    // 0.05 W = 4.5 → 5 HP; pulses at 0, 60, 120.
    expect(wolf.hpMax - wolf.hp).toBe(15);
    expect(along.hpMax - along.hp).toBe(15);
    expect(aside.hp).toBe(aside.hpMax);
    // G2 −55 %: 5 → 2.
    expect(tru.hpMax - tru.hp).toBe(6);
    expect(crow.hp).toBe(crow.hpMax);
    expect(wolf.slows).toEqual([{ source: "kiem-thung", pct: 25, until: world.tick + 1 }]);
    expect(crow.slows).toHaveLength(0);
    expect(aside.slows).toHaveLength(0);
    expect(of("mechanism").filter((event) => event.stage === "trigger")).toHaveLength(3);
    expect(of("hit").every((hit) => hit.source === "mechanism" && hit.damageType === "physical")).toBe(true);
  });

  it("level 2: 5 × 1.45 = 7.25 → 7 a pulse", () => {
    const { world } = makeWorld();
    build(world, 0, "kiem-thung", 2);
    const wolf = addBeast(world, "phong-lang", { x: -2.79, z: -30 });
    advance(world, 1, [stepMechanisms]);
    expect(wolf.hpMax - wolf.hp).toBe(7);
  });
});

describe("Lôi Phù Trụ (post: every 4 s, 3 targets in 7 m, 0.25 W magic)", () => {
  it("hits the 3 ground beasts nearest the heart, every 4 s; skips flyers; waits for a target", () => {
    const { world, of } = makeWorld();
    build(world, 1, "loi-phu-tru");
    advance(world, 30, [stepMechanisms]);
    expect(of("mechanism")).toHaveLength(0);
    const near = [addBeast(world, "nham-vien", { x: -7.96, z: -20 }), addBeast(world, "nham-vien", { x: -8.96, z: -21 }), addBeast(world, "nham-vien", { x: -10.96, z: -23 })];
    const last = addBeast(world, "nham-vien", { x: -11.96, z: -24 });
    const crow = addBeast(world, "hoa-nha", { x: -9.46, z: -21.5, gate: "sky" });
    const t0 = world.tick;
    advance(world, 241, [stepMechanisms]);
    for (const beast of near) expect(beast.hpMax - beast.hp).toBe(46);
    expect(last.hp).toBe(last.hpMax);
    expect(crow.hp).toBe(crow.hpMax);
    expect(of("mechanism").map((event) => event.tick - t0)).toEqual([0, 240]);
    expect(of("hit").every((hit) => hit.damageType === "magic" && hit.amount === 23)).toBe(true);
  });
});

describe("Phong Ấn Võng (post: every 10 s, the largest W in 7 m held 3 s, Thế −15)", () => {
  it("holds the beast with the largest W, Thế −15; the beast's own step counts the hold", () => {
    const { world, of } = makeWorld();
    build(world, 4, "phong-an-vong");
    const wolf = addBeast(world, "phong-lang", { x: -9, z: -3 });
    const elite = addBeast(world, "nham-vien", { x: -11, z: -3, elite: "thiet-bi" });
    world.tick = 600;
    advance(world, 1, [stepMechanisms]);
    expect(elite.hardUntil).toBe(600 + 1 + 180);
    expect(elite.posture?.value).toBe(25);
    expect(wolf.hardUntil).toBe(-1);
    expect(of("mechanism").filter((event) => event.stage === "trigger")).toHaveLength(1);
    advance(world, 200, [stepBeasts, stepMechanisms]);
    expect(elite.hardTicks).toBe(180);
    // The next one comes 10 s after the last.
    advance(world, 400, [stepBeasts, stepMechanisms]);
    expect(of("mechanism").filter((event) => event.stage === "trigger")).toHaveLength(2);
  });

  it("pulls a flyer down (beasts.ts: y 0 while held)", () => {
    const { world } = makeWorld();
    build(world, 4, "phong-an-vong");
    const crow = addBeast(world, "hoa-nha", { x: -10, z: -4, gate: "sky" });
    world.tick = 600;
    advance(world, 1, [stepMechanisms]);
    expect(crow.hardUntil).toBeGreaterThan(world.tick);
    advance(world, 1, [stepBeasts]);
    expect(crow.y).toBe(0);
  });

  it("skips a roaring Vương and a beast with no room under the 35 % cap", () => {
    const { world } = makeWorld();
    build(world, 4, "phong-an-vong");
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: -10, z: -4 });
    vuong.mode = "roar";
    vuong.modeUntil = 10_000;
    const young = addBeast(world, "nham-vien", { x: -9, z: -3 });
    world.tick = 600;
    young.bornAt = world.tick;
    stepMechanisms(world);
    expect(vuong.hardUntil).toBe(-1);
    expect(young.hardUntil).toBe(-1);
  });

  it("the 35 % cap: hardTicks + h ≤ 35 % of the age at the hold's end", () => {
    const { world } = makeWorld();
    const beast = addBeast(world, "nham-vien");
    world.tick = beast.bornAt + 1000;
    beast.hardTicks = 300;
    // (35 × 1000 − 100 × 300) / 65 = 76.9 → 76.
    expect(holdAllowance(world, beast, 180)).toBe(76);
    beast.hardTicks = 0;
    expect(holdAllowance(world, beast, 180)).toBe(180);
    beast.hardTicks = 350;
    expect(holdAllowance(world, beast, 180)).toBe(0);
  });

  it("two level-3 posts on one beast for 2 minutes never hold it more than 35 % of its life", () => {
    const { world } = makeWorld();
    build(world, 1, "phong-an-vong", 3);
    build(world, 4, "phong-an-vong", 3);
    const beast = addBeast(world, "nham-vien", { x: -10.5, z: -5 });
    advance(world, 7200, [stepBeasts, stepMechanisms]);
    expect(beast.alive).toBe(true);
    expect(beast.hardTicks).toBeGreaterThan(0);
    expect(beast.hardTicks * 100).toBeLessThanOrEqual(35 * (world.tick - beast.bornAt));
  });
});
