// Lane 4 combat.ts and shares.ts (canon §7.2, §7.3, D38) on the real world.
import { describe, expect, it } from "vitest";
import { DAMAGE } from "../../src/content/rules";
import type { PendingStrike } from "../../src/content/types";
import { addSlow, bucketPm, createAreaHit, damageBeast, elementPm, landTargeted, reductionPm, splitWord, wHpOf, wordDamage } from "../../src/sim/combat";
import { mToU } from "../../src/sim/fixed";
import { createPosture } from "../../src/sim/posture";
import { bucketAdd, shares } from "../../src/sim/shares";
import { addBeast, addCluster, makeWorld, setTamNhan } from "./combat-fixture";

describe("damage order and half-up rounding (canon §7.2, D38)", () => {
  it("P → M_q → bucket → vulnerable, a half-up mulDiv at each step", () => {
    const { world } = makeWorld();
    const beast = addBeast(world, "nham-vien");
    beast.posture = { ...createPosture(40), brokenUntil: world.tick + 360 };
    // 101 × 0.9 = 90.9 → 91; × 1.08 (Tâm nhãn Công) = 98.28 → 98; × 1.5 (phá thế) = 147.
    // Another order would give 148 (91 × 1.5 = 136.5 → 137; × 1.08 = 147.96 → 148).
    const dealt = damageBeast(world, beast, 101, "typed", { seat: 0, source: "slot2", grade: "ok" });
    expect(dealt).toBe(147);
    expect(beast.hp).toBe(beast.hpMax - 147);
  });

  it("rounds half up (0.5 goes up) and never leaves −0", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const beast = addBeast(world, "nham-vien");
    // 5 × 0.9 = 4.5 → 5.
    expect(damageBeast(world, beast, 5, "typed", { seat: 0, source: "slot2", grade: "ok" })).toBe(5);
    expect(Object.is(beast.hp, -0)).toBe(false);
  });

  it("splits one word over 3 swords with the rest on the last", () => {
    expect(splitWord(90, 3)).toEqual([30, 30, 30]);
    expect(splitWord(101, 3)).toEqual([33, 33, 35]);
    expect(splitWord(110, 3)).toEqual([36, 36, 38]);
  });
});

describe("armour, resist and typed hits", () => {
  it("armour G / (G + 100), capped at 75 %", () => {
    expect(DAMAGE.armourG.map(reductionPm)).toEqual([0, 301, 550, 750]);
    expect(reductionPm(10_000)).toBe(750);
  });

  it("typed hits ignore armour; physical meets it, magic meets resist", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const tru = addBeast(world, "thiet-giap-tru");
    expect(tru.armour).toBe(2);
    expect(damageBeast(world, tru, 100, "typed", { seat: 0, source: "slot2", grade: "good" })).toBe(100);
    // G2 = 122 → 55 %: 100 × 0.45 = 45.
    expect(damageBeast(world, tru, 100, "physical", { seat: 0, source: "auto", grade: null })).toBe(45);
    // Resist G0: magic in full.
    expect(damageBeast(world, tru, 100, "magic", { seat: 0, source: "mechanism", grade: null })).toBe(100);
  });

  it("khắc hệ: counter × 1.30, countered × 0.80, vô hệ 1.00", () => {
    expect(elementPm("kim", "moc")).toBe(1300);
    expect(elementPm("kim", "hoa")).toBe(800);
    expect(elementPm("kim", null)).toBe(1000);
    expect(elementPm(null, "moc")).toBe(1000);
  });
});

describe("the bucket cap and the cluster cap", () => {
  it("Σ same-bucket increases stop at +50 %; đánh nền gets none", () => {
    const { world } = makeWorld({ tamPhap: "tich-kiem" });
    world.skills.seats[0]!.tichKiemPm = 480;
    // Công +8 % (Tâm nhãn lit) + 48 % = 56 % → 50 %.
    expect(bucketPm(world, 0, "slot1")).toBe(500);
    expect(bucketPm(world, 0, "auto")).toBe(0);
    world.skills.seats[0]!.tichKiemPm = -80;
    expect(bucketPm(world, 0, "slot2")).toBe(0);
  });

  it("one area hit takes at most 60 % of a swarm cluster's HP", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const rats = addCluster(world, 7);
    expect(rats.map((rat) => rat.hp)).toEqual([30, 30, 30, 30, 30, 30, 30]);
    const area = createAreaHit();
    let dealt = 0;
    for (const rat of rats) dealt += damageBeast(world, rat, 50, "magic", { seat: 0, source: "consumable", grade: null, area });
    // 60 % of 210 = 126: four fall, the fifth loses 6, the rest nothing.
    expect(dealt).toBe(126);
    expect(rats.filter((rat) => !rat.alive)).toHaveLength(4);
    expect(rats[4]!.hp).toBe(24);
    // A second area hit gets 60 % of what is left (3 × 30 − 6 = 84 → 50).
    const second = createAreaHit();
    let again = 0;
    for (const rat of rats) again += damageBeast(world, rat, 50, "magic", { seat: 0, source: "consumable", grade: null, area: second });
    expect(again).toBe(Math.floor((84 * 60) / 100));
    // A single-target hit has no cluster cap.
    const solo = addCluster(world, 2);
    expect(damageBeast(world, solo[0]!, 50, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true })).toBe(30);
  });
});

describe("hits: kill fields, lastHitTick, Thế, immunity, `hit` events", () => {
  it("sets alive, hp, killedBy, killedBySeat; world.ts (not damageBeast) emits `death`", () => {
    const { world, of } = makeWorld();
    const rat = addBeast(world, "thach-thu");
    world.tick = 50;
    expect(damageBeast(world, rat, 100, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true })).toBe(30);
    expect(rat.alive).toBe(false);
    expect(rat.hp).toBe(0);
    expect(rat.killedBy).toBe("slot1");
    expect(rat.killedBySeat).toBe(0);
    expect(rat.lastHitTick).toBe(50);
    expect(of("death")).toHaveLength(0);
    const hit = of("hit")[0]!;
    expect(hit).toMatchObject({ amount: 30, damageType: "typed", bucket: "typed", source: "slot1", seat: 0, hpLeft: 0, tick: 50 });
    // A dead beast takes nothing more.
    expect(damageBeast(world, rat, 100, "typed", { seat: 0, source: "slot1", grade: "good" })).toBe(0);
  });

  it("typed damage takes 1 Thế per whole W (posture.ts postureFromTypedHp); other damage none", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const elite = addBeast(world, "nham-vien", { elite: "cuong" });
    expect(elite.posture?.value).toBe(40);
    damageBeast(world, elite, 180, "typed", { seat: 0, source: "slot2", grade: "good" });
    expect(elite.posture?.value).toBe(38);
    damageBeast(world, elite, 90, "physical", { seat: 0, source: "auto", grade: null });
    expect(elite.posture?.value).toBe(38);
  });

  it("skips a damage-immune beast (the Vương's roar)", () => {
    const { world, of } = makeWorld();
    const vuong = addBeast(world, "thiet-boi-lang-vuong");
    vuong.mode = "roar";
    vuong.modeUntil = world.tick + 150;
    expect(damageBeast(world, vuong, 500, "typed", { seat: 0, source: "slot2", grade: "good" })).toBe(0);
    expect(vuong.hp).toBe(vuong.hpMax);
    expect(vuong.lastHitTick).toBe(-1);
    expect(of("hit")).toHaveLength(0);
  });

  it("a strike whose target died goes to the nearest beast within 4 m at 50 %, else nowhere", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const first = addBeast(world, "nham-vien", { x: 0, z: -6 });
    const near = addBeast(world, "nham-vien", { x: 3, z: -6 });
    const far = addBeast(world, "nham-vien", { x: 0, z: -11 });
    first.alive = false;
    const strike = {
      id: 1, tick: 0, seat: 0, skill: "phi-kiem", source: "auto", actionId: -1, target: { slot: first.slot, serial: first.serial }, at: { x: 0, z: 0 }, amount: 100,
      grade: null, posture: 0, kind: "auto", launchTick: 0, to: { x: first.x, z: first.z }, bandLast: false, part: 0,
    } as PendingStrike;
    expect(landTargeted(world, strike, "typed", true)).toBe(near);
    expect(near.hpMax - near.hp).toBe(50);
    expect(far.hp).toBe(far.hpMax);
    near.alive = false;
    expect(landTargeted(world, { ...strike, target: { slot: near.slot, serial: near.serial } } as PendingStrike, "typed", true)).toBeNull();
  });
});

describe("the share ledger (canon §7.3): effective damage only, by source", () => {
  it("books what was dealt (≤ HP left), never the overkill", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const rat = addBeast(world, "thach-thu");
    damageBeast(world, rat, 500, "typed", { seat: 0, source: "slot1", grade: "good", scaled: true });
    const vien = addBeast(world, "nham-vien");
    damageBeast(world, vien, 60, "physical", { seat: 0, source: "auto", grade: null });
    damageBeast(world, vien, 30, "magic", { seat: 0, source: "mechanism", grade: null });
    expect(world.shares.typedBySlot[1]).toBe(30);
    expect(world.shares.auto).toBe(60);
    expect(world.shares.mechanism).toBe(30);
    // typed 30, auto 60, support 30 of 120.
    expect(shares(world)).toEqual({ typedPm: 250, autoPm: 500, supportPm: 250, slot1OfTypedPm: 1000 });
    bucketAdd(world, "slot2", 90);
    expect(shares(world).slot1OfTypedPm).toBe(250);
  });

  it("units: 1 W = 90 × g(K) HP; one ô 1 word of Vừa = 90 HP at K0", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    expect(wHpOf(world, 100)).toBe(90);
    expect(wHpOf(world, 25)).toBe(23);
    expect(wordDamage(world, 0, "ok")).toBe(90);
    expect(wordDamage(world, 0, "flash")).toBe(125);
    const k1 = makeWorld({ realm: 1 }).world;
    setTamNhan(k1, false);
    expect(wHpOf(k1, 100)).toBe(101);
    expect(wordDamage(k1, 0, "ok")).toBe(101);
  });
});

describe("slows (canon §7.2): one entry per source, the strongest, refreshed", () => {
  it("keeps one entry per source", () => {
    const { world } = makeWorld();
    const wolf = addBeast(world, "phong-lang");
    addSlow(world, wolf, "kiem-thung", 25);
    addSlow(world, wolf, "kiem-thung", 25);
    addSlow(world, wolf, "lac-kiem-tran", 20);
    expect(wolf.slows).toHaveLength(2);
    expect(wolf.slows[0]).toMatchObject({ source: "kiem-thung", pct: 25, until: world.tick + 2 });
    expect(mToU(1)).toBe(60_000);
  });
});
