// Lane 4 formation.ts (canon §8.2): Trận Lực, Thủ, Dưỡng (resolved Casts only, × 1 / k, cap 15 %), node capture and
// Tẩy, Trận Trụ (2 rams crack; pillarOnSegment by radiusU), `down` 5 %, and no Linh Dịch here (director.ts owns it).
import { describe, expect, it } from "vitest";
import { FORMATION } from "../../src/content/rules";
import { applyDown, cleanseNode, createFormationState, damageFormation, heartForSeats, hitPillar, inBarrier, nodeState, occupyNode, pillarOnSegment, stepFormation } from "../../src/sim/formation";
import { mToU } from "../../src/sim/fixed";
import { stepWords } from "../../src/sim/words";
import { addBeast, advance, at, makeWorld, setTamNhan, THANH_THACH_AI, testHeader } from "./combat-fixture";
import { createRng } from "../../src/kit/platform/rng";

describe("Trận Tâm and Thủ", () => {
  it("Trận Lực by seats: 1 000 / 1 400 / 1 800, Thất Tinh 3 500; nodes and pillars from the stage", () => {
    expect([1, 2, 3, 7].map(heartForSeats)).toEqual([1000, 1400, 1800, 3500]);
    const state = createFormationState({ stage: THANH_THACH_AI, header: testHeader(), seed: 1, preset: "balanced", realm: 0, gPm: 1000, seats: 1, rng: createRng(1) });
    expect(state.heart).toBe(1000);
    expect(state.nodes[0]).toMatchObject({ id: "tam-nhan", at: at(0, 3), on: true });
    expect(state.pillars.map((pillar) => pillar.radiusU)).toEqual([mToU(0.9), mToU(0.9)]);
  });

  it("the lit Tâm nhãn's Thủ takes 15 % off Trận Lực damage, carried below one point; out: full damage", () => {
    const { world, of } = makeWorld();
    let lost = 0;
    for (let k = 0; k < 10; k += 1) lost += damageFormation(world, 1, "thach-thu:bite");
    // 10 bites of 1 × 0.85 = 8.5 → 8 lost, 500 ‰ carried.
    expect(lost).toBe(8);
    expect(world.formation.heart).toBe(992);
    expect(world.stats.heartLost).toBe(8);
    expect(damageFormation(world, 40, "thiet-giap-tru:ram")).toBe(34);
    setTamNhan(world, false);
    expect(damageFormation(world, 40, "thiet-giap-tru:ram")).toBe(40);
    expect(world.formation.lastHeartHitTick).toBe(world.tick);
    expect(of("formation").every((event) => event.what === "heart")).toBe(true);
    expect(damageFormation(world, 5000, "x")).toBe(918);
    expect(world.formation.heart).toBe(0);
  });

  it("`down` takes 5 % of Trận Lực, no Thủ (world.ts marks the seat down)", () => {
    const { world } = makeWorld();
    applyDown(world, { type: "down", seat: 0, origin: at(0, 3) });
    expect(world.formation.heart).toBe(1000 - 50);
    expect(world.stats.downs).toBe(1);
  });

  it("Kết Giới r 9 m", () => {
    expect(inBarrier(mToU(9), 0)).toBe(true);
    expect(inBarrier(mToU(6), mToU(6))).toBe(true);
    expect(inBarrier(mToU(6.4), mToU(6.4))).toBe(false);
    expect(inBarrier(mToU(9) + 1, 0)).toBe(false);
  });

  it("does not apply Linh Dịch (director.ts drops it: one heal, not two)", () => {
    const { world, of } = makeWorld();
    world.formation.heart = 100;
    advance(world, 600, [stepFormation]);
    expect(of("formation").filter((event) => event.what === "linh-dich")).toHaveLength(0);
    expect(world.formation.heart).toBe(100);
  });
});

describe("Dưỡng (canon §8.2, D42): 0.1 %/s with a resolved Cast within 3 s / k, ≤ 15 % a match", () => {
  const live = (kPm = 1000) => {
    const made = makeWorld({ kPm });
    stepWords(made.world);
    made.world.formation.heart = 500;
    return made;
  };

  it("heals 1 a second while the last resolved Cast is within 3 s, then stops", () => {
    const { world } = live();
    world.seats[0]!.lastResolvedTick = world.tick;
    advance(world, 241, [stepFormation]);
    // Ticks 0, 60, 120, 180 are within 180 ticks of the Cast; 240 is not.
    expect(world.formation.heart).toBe(504);
    expect(world.formation.duongHealed).toBe(4);
  });

  it("the window is 3 s / k: k 0.75 → 4 s, k 1.30 → 2.3 s", () => {
    const slow = live(750).world;
    slow.seats[0]!.lastResolvedTick = 0;
    advance(slow, 241, [stepFormation]);
    expect(slow.formation.duongHealed).toBe(5);
    const fast = live(1300).world;
    fast.seats[0]!.lastResolvedTick = 0;
    advance(fast, 241, [stepFormation]);
    expect(fast.formation.duongHealed).toBe(3);
  });

  it("only for resolved Casts: no resolved Cast, no heal; off while down, while the Bàn Quyết sleeps, while the node is dark", () => {
    const none = live().world;
    advance(none, 600, [stepFormation]);
    expect(none.formation.duongHealed).toBe(0);
    const down = live().world;
    down.seats[0]!.lastResolvedTick = 0;
    down.seats[0]!.downUntil = 1000;
    advance(down, 120, [stepFormation]);
    expect(down.formation.duongHealed).toBe(0);
    const asleep = live().world;
    asleep.phase = "break";
    asleep.seats[0]!.lastResolvedTick = 0;
    advance(asleep, 120, [stepFormation]);
    expect(asleep.formation.duongHealed).toBe(0);
    const dark = live().world;
    setTamNhan(dark, false);
    dark.seats[0]!.lastResolvedTick = 0;
    advance(dark, 120, [stepFormation]);
    expect(dark.formation.duongHealed).toBe(0);
  });

  it("stops at 15 % of Trận Lực a match (150 solo) and never above the max", () => {
    const { world } = live();
    for (let s = 0; s < 400; s += 1) {
      world.seats[0]!.lastResolvedTick = world.tick;
      advance(world, 60, [stepFormation]);
    }
    expect(world.formation.duongHealed).toBe((1000 * FORMATION.tamNhan.regenCapPct) / 100);
    expect(world.formation.heart).toBe(650);
    const full = live().world;
    full.formation.heart = 999;
    full.seats[0]!.lastResolvedTick = 0;
    advance(full, 121, [stepFormation]);
    expect(full.formation.heart).toBe(1000);
  });
});

describe("node capture and Tẩy (canon §8.2)", () => {
  it("a capturer standing 3 s turns the node off and Tẩy is dealt; typed: lit 1 s later, the capturer 2 m out", () => {
    const { world, of } = makeWorld();
    stepWords(world);
    const node = nodeState(world, "tam-nhan");
    const tru = addBeast(world, "thiet-giap-tru", { x: 0, z: 3 });
    for (let k = 0; k <= 180; k += 1) {
      occupyNode(world, tru, "tam-nhan");
      advance(world, 1, [stepFormation]);
    }
    expect(node.on).toBe(false);
    expect(of("formation").filter((event) => event.what === "node-off")).toHaveLength(1);
    expect(world.words.seats[0]!.cleanse).toBeGreaterThanOrEqual(0);
    expect(node.cleanse).toBe(world.words.seats[0]!.cleanse);
    expect(cleanseNode(world, "tam-nhan")).toBe(true);
    expect(cleanseNode(world, "tam-nhan")).toBe(false);
    expect(Math.round(Math.hypot(tru.x - node.at.x, tru.z - node.at.z))).toBe(mToU(2));
    advance(world, 61, [stepFormation]);
    expect(node.on).toBe(true);
    expect(node.capturedBy).toBeNull();
  });

  it("the node lights again when its capturer dies, and its Tẩy goes", () => {
    const { world, of } = makeWorld();
    stepWords(world);
    const node = nodeState(world, "tam-nhan");
    const tru = addBeast(world, "thiet-giap-tru", { x: 0, z: 3 });
    for (let k = 0; k <= 180; k += 1) {
      occupyNode(world, tru, "tam-nhan");
      advance(world, 1, [stepFormation]);
    }
    expect(node.on).toBe(false);
    tru.alive = false;
    advance(world, 1, [stepFormation]);
    expect(node.on).toBe(true);
    expect(node.cleanse).toBe(-1);
    expect(world.words.seats[0]!.cleanse).toBe(-1);
    expect(of("formation").map((event) => event.what)).toEqual(["node-off", "node-on"]);
  });

  it("leaving before 3 s does not take it; another capturer starts over", () => {
    const { world } = makeWorld();
    const node = nodeState(world, "tam-nhan");
    const a = addBeast(world, "thiet-giap-tru", { x: 0, z: 3 });
    const b = addBeast(world, "thiet-giap-tru", { x: 0, z: 3 });
    for (let k = 0; k < 120; k += 1) {
      occupyNode(world, a, "tam-nhan");
      advance(world, 1, []);
    }
    for (let k = 0; k < 120; k += 1) {
      occupyNode(world, b, "tam-nhan");
      advance(world, 1, []);
    }
    expect(node.on).toBe(true);
    expect(node.capturedBy?.serial).toBe(b.serial);
  });
});

describe("Trận Trụ (canon §8.2, §10.5)", () => {
  it("pillarOnSegment: a segment within the pillar's radiusU meets it; the first along the segment", () => {
    const { world } = makeWorld();
    const [west, east] = world.formation.pillars;
    const r = west!.radiusU;
    const pass = (dx: number) => pillarOnSegment(world, { x: west!.at.x + dx, z: west!.at.z - mToU(5) }, { x: west!.at.x + dx, z: west!.at.z + mToU(5) });
    expect(pass(r)).toBe(west);
    expect(pass(r - 1)).toBe(west);
    expect(pass(r + 1)).toBeNull();
    // A line through both pillars: the one nearer its start.
    expect(pillarOnSegment(world, { x: west!.at.x - mToU(2), z: west!.at.z }, { x: east!.at.x + mToU(2), z: east!.at.z })).toBe(west);
    expect(pillarOnSegment(world, { x: east!.at.x + mToU(2), z: east!.at.z }, { x: west!.at.x - mToU(2), z: west!.at.z })).toBe(east);
    // A cracked pillar still counts (it stops rocks); boss.ts checks `cracked` for rams.
    west!.cracked = true;
    expect(pass(0)).toBe(west);
  });

  it("2 rams crack a pillar: hit, hit + crack", () => {
    const { world, of } = makeWorld();
    const pillar = world.formation.pillars[0]!;
    hitPillar(world, pillar);
    expect(pillar.cracked).toBe(false);
    hitPillar(world, pillar);
    expect(pillar.cracked).toBe(true);
    expect(of("pillar").map((event) => [event.stage, event.rams])).toEqual([["hit", 1], ["hit", 2], ["crack", 2]]);
  });

  it("on the real field a line from gate A's side to the heart meets the west pillar", () => {
    const { world } = makeWorld();
    const pillar = world.formation.pillars[0]!;
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { x: -12.8, z: -15.36 });
    expect(pillarOnSegment(world, { x: vuong.x, z: vuong.z }, { x: 0, z: 0 })).toBe(pillar);
    expect(pillarOnSegment(world, { x: vuong.x + mToU(3), z: vuong.z }, { x: 0, z: 0 })).toBeNull();
  });
});
