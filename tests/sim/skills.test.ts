// Lane 4 skills.ts (canon §12.1, §23.3) on the real world: hit ticks, bands, line falloff, zone and ultimate caps,
// cooldowns, Kiếm Tâm, Tích Kiếm, ground aims, and resolveCast changing nothing when it answers false.
import { describe, expect, it } from "vitest";
import { SCHOOL_KIEM, TAM_PHAP, kiemSkill } from "../../src/content/data/school-kiem";
import { CHAN_NGUYEN, DASH, SLOT3_DASH_COOLDOWN_MS, SLOTS, SLOWS } from "../../src/content/rules";
import type { World } from "../../src/content/types";
import { applyAuto, stepAutoHits } from "../../src/sim/combat";
import { createPosture } from "../../src/sim/posture";
import { hashWorldHex } from "../../src/sim/hash";
import { resolveCast, stepSkills, tichKiemPmFor } from "../../src/sim/skills";
import { addBeast, advance, at, castOf, makeWorld, setTamNhan } from "./combat-fixture";

const slot1Ticks = (world: World, of: ReturnType<typeof makeWorld>["of"]) => of("hit").filter((hit) => hit.source === "slot1").map((hit) => hit.tick);

describe("the Kiếm table (data/school-kiem.ts) agrees with rules.ts", () => {
  it("cooldowns match SLOTS; thân pháp matches DASH; slows match SLOWS", () => {
    for (const slot of [1, 2, 4] as const) expect(kiemSkill(slot).cooldownMs).toBe(SLOTS[slot].cooldownMs);
    expect(kiemSkill(3, "ward").cooldownMs).toBe(SLOTS[3].cooldownMs);
    expect(kiemSkill(3, "dash").cooldownMs).toBe(SLOT3_DASH_COOLDOWN_MS);
    const dash = kiemSkill(3, "dash").effect;
    expect(dash).toMatchObject({ kind: "dash", distanceMm: DASH.distanceMm, unpushableMs: DASH.unpushableMs });
    expect(kiemSkill(4).effect).toMatchObject({ kind: "zone", slowPct: SLOWS.lacKiemPct });
    expect(SCHOOL_KIEM.filter((skill) => skill.slot === 3)).toHaveLength(2);
    expect(TAM_PHAP["kiem-tam"].kind).toBe("S");
    expect(TAM_PHAP["tich-kiem"].kind).toBe("R");
  });
});

describe("resolveCast with no target changes nothing and answers false (the Cast stays held)", () => {
  it("ô 1, ô 2, ô 4 without aim, ô 5, Ấn, Tẩy on an empty field", () => {
    const { world } = makeWorld();
    world.seats[0]!.chanNguyenPm = CHAN_NGUYEN.full * 1000;
    const before = hashWorldHex(world);
    for (const slot of [1, 2, 4, 5] as const) expect(resolveCast(world, castOf(world, slot))).toBe(false);
    expect(resolveCast(world, castOf(world, "seal", { target: { slot: 0, serial: 99 } }))).toBe(false);
    expect(resolveCast(world, castOf(world, "cleanse", { node: "tam-nhan" }))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    expect(world.seats[0]!.chanNguyenPm).toBe(CHAN_NGUYEN.full * 1000);
  });

  it("a beast out of range is no target (ô 1 12 m, ô 2 14 m from the Cast's origin)", () => {
    const { world } = makeWorld();
    addBeast(world, "phong-lang", { x: 0, z: -15 });
    const before = hashWorldHex(world);
    expect(resolveCast(world, castOf(world, 1))).toBe(false);
    expect(resolveCast(world, castOf(world, 2))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    expect(resolveCast(world, castOf(world, 1, { origin: at(0, -5) }))).toBe(true);
  });

  it("nothing resolves while the seat is down", () => {
    const { world } = makeWorld();
    addBeast(world, "phong-lang");
    world.seats[0]!.downUntil = world.tick + 100;
    expect(resolveCast(world, castOf(world, 1))).toBe(false);
    expect(resolveCast(world, castOf(world, 3))).toBe(false);
  });
});

describe("cooldowns start on resolve (skills.seats[].cooldownUntil, read by words.ts)", () => {
  it("ô 2 8 s, ô 3 Hộ thân 15 s or thân pháp 8 s, ô 4 12 s, ô 1 and ô 5 none", () => {
    const { world } = makeWorld();
    addBeast(world, "nham-vien");
    world.tick = 100;
    const cd = world.skills.seats[0]!.cooldownUntil;
    expect(resolveCast(world, castOf(world, 2))).toBe(true);
    expect(cd[2]).toBe(100 + 480);
    expect(resolveCast(world, castOf(world, 3))).toBe(true);
    expect(cd[3]).toBe(100 + 900);
    expect(resolveCast(world, castOf(world, 4))).toBe(true);
    expect(cd[4]).toBe(100 + 720);
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    expect(cd[1]).toBe(100);
    const dash = makeWorld({ guard: "dash" }).world;
    dash.tick = 100;
    expect(resolveCast(dash, castOf(dash, 3))).toBe(true);
    expect(dash.skills.seats[0]!.cooldownUntil[3]).toBe(100 + 480);
    expect(dash.wards.list).toHaveLength(0);
  });
});

describe("ô 1 Ngự Kiếm Quyết", () => {
  it("swords land at +6, +36, +66; the next band follows the one before", () => {
    const { world, of } = makeWorld();
    addBeast(world, "nham-vien");
    const t0 = world.tick;
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    advance(world, 10, [stepSkills]);
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    advance(world, 150, [stepSkills]);
    expect(slot1Ticks(world, of).map((tick) => tick - t0)).toEqual([6, 36, 66, 72, 102, 132]);
  });

  it("at most 2 bands unfinished: the third word waits (held) until a band is done", () => {
    const { world } = makeWorld();
    addBeast(world, "thiet-boi-lang-vuong");
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    const before = hashWorldHex(world);
    expect(resolveCast(world, castOf(world, 1))).toBe(false);
    expect(hashWorldHex(world)).toBe(before);
    expect(world.skills.seats[0]!.bands).toBe(2);
    let max = 0;
    for (let n = 0; n < 200; n += 1) {
      advance(world, 1, [stepSkills]);
      max = Math.max(max, world.skills.seats[0]!.bands);
      if (n === 66) expect(resolveCast(world, castOf(world, 1))).toBe(true);
    }
    expect(max).toBeLessThanOrEqual(2);
    expect(world.skills.seats[0]!.bands).toBe(0);
  });

  it("goes for the soft target in range, else the beast nearest the heart in 12 m", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const near = addBeast(world, "nham-vien", { z: -4 });
    const soft = addBeast(world, "nham-vien", { x: 6, z: -8 });
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    advance(world, 7, [stepSkills]);
    expect(near.hp).toBe(near.hpMax - 30);
    world.seats[0]!.softTarget = { slot: soft.slot, serial: soft.serial };
    world.skills.seats[0]!.bandEnd = -1;
    expect(resolveCast(world, castOf(world, 1))).toBe(true);
    advance(world, 7, [stepSkills]);
    expect(soft.hp).toBe(soft.hpMax - 30);
  });

  it("each sword pierces 1 small beast within reach at 50 %", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const target = addBeast(world, "nham-vien", { z: -4 });
    const wolf = addBeast(world, "phong-lang", { x: 1, z: -4.5 });
    const big = addBeast(world, "nham-vien", { x: -1, z: -4 });
    expect(resolveCast(world, castOf(world, 1, { quality: "ok" }))).toBe(true);
    advance(world, 7, [stepSkills]);
    expect(target.hpMax - target.hp).toBe(30);
    expect(wolf.hpMax - wolf.hp).toBe(15);
    expect(big.hp).toBe(big.hpMax);
  });

  it("Kiếm Tâm: a Chớp word adds a sword of 1/3 of the word, at most once every 3 s", () => {
    const { world, of } = makeWorld({ tamPhap: "kiem-tam" });
    setTamNhan(world, false);
    addBeast(world, "thiet-boi-lang-vuong");
    expect(resolveCast(world, castOf(world, 1, { quality: "flash" }))).toBe(true);
    advance(world, 70, [stepSkills]);
    // 125 → 41, 41, 43 and an extra 42 (125 / 3 half up).
    expect(of("hit").filter((hit) => hit.source === "slot1").map((hit) => hit.amount)).toEqual([41, 41, 43, 42]);
    expect(resolveCast(world, castOf(world, 1, { quality: "flash" }))).toBe(true);
    advance(world, 70, [stepSkills]);
    expect(of("hit").filter((hit) => hit.source === "slot1")).toHaveLength(7);
    const r = makeWorld({ tamPhap: "tich-kiem" });
    addBeast(r.world, "thiet-boi-lang-vuong");
    expect(resolveCast(r.world, castOf(r.world, 1, { quality: "flash" }))).toBe(true);
    advance(r.world, 70, [stepSkills]);
    expect(r.of("hit").filter((hit) => hit.source === "slot1")).toHaveLength(3);
  });
});

describe("ô 2 Nhất Tuyến Xuyên Vân", () => {
  it("+12: 2.5 W on the first beast, −15 % each next, floor 40 %; Thế −20", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const line = [2, 4, 6, 8, 10, 12].map((m) => addBeast(world, "thiet-boi-lang-vuong", { z: -m }));
    const elite = addBeast(world, "nham-vien", { elite: "thiet-bi", x: 0.3, z: -13 });
    const aside = addBeast(world, "nham-vien", { x: 2, z: -5 });
    const t0 = world.tick;
    expect(resolveCast(world, castOf(world, 2, { quality: "good" }))).toBe(true);
    advance(world, 13, [stepSkills]);
    expect(of("hit").every((hit) => hit.tick === t0 + 12)).toBe(true);
    // P 225: 225, 191, 158, 124, 90, 90, then the elite at 90 (floor).
    expect(line.map((beast) => beast.hpMax - beast.hp)).toEqual([225, 191, 158, 124, 90, 90]);
    expect(elite.hpMax - elite.hp).toBe(90);
    expect(elite.posture?.value).toBe(40 - 20 - 1);
    expect(aside.hp).toBe(aside.hpMax);
  });
});

describe("ô 4 Lạc Kiếm Trận", () => {
  it("opens +12, a beat every 30 ticks for 5 s, slows 20 %, at most 4 W a cast over all beasts", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const many = Array.from({ length: 10 }, (_, k) => addBeast(world, "thiet-boi-lang-vuong", { x: (k % 5) * 0.5, z: -6 - Math.floor(k / 5) * 0.5 }));
    const t0 = world.tick;
    expect(resolveCast(world, castOf(world, 4, { quality: "good", aim: at(1, -6) }))).toBe(true);
    advance(world, 400, [stepSkills]);
    const hits = of("hit").filter((hit) => hit.source === "slot4");
    const dealt = hits.reduce((sum, hit) => sum + hit.amount, 0);
    // 4 W = 360 HP at K0; 0.15 W beats (14 HP) on 10 beasts: the cap binds in the 3rd beat.
    expect(dealt).toBe(360);
    expect(hits[0]!.tick - t0).toBe(12);
    expect(new Set(hits.map((hit) => (hit.tick - t0 - 12) % 30))).toEqual(new Set([0]));
    expect(of("skill-fx").filter((fx) => fx.stage === "zone-open")[0]!.tick - t0).toBe(12);
    expect(of("skill-fx").filter((fx) => fx.stage === "zone-close")[0]!.tick - t0).toBe(12 + 300);
    expect(many.every((beast) => beast.alive)).toBe(true);
  });

  it("beats deal 0.15 W × M_q to each beast inside while under the cap; slows them while open", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { z: -6 });
    expect(resolveCast(world, castOf(world, 4, { quality: "good" }))).toBe(true);
    advance(world, 13, [stepSkills]);
    expect(vuong.slows.some((slow) => slow.source === "lac-kiem-tran" && slow.pct === 20)).toBe(true);
    advance(world, 300, [stepSkills]);
    const hits = of("hit").filter((hit) => hit.source === "slot4");
    expect(hits).toHaveLength(10);
    expect(hits.every((hit) => hit.amount === 14)).toBe(true);
  });

  it("the key's aim on the field places it with no beast; off the field it takes the densest cluster, none: held", () => {
    const { world } = makeWorld();
    expect(resolveCast(world, castOf(world, 4, { aim: at(5, -5) }))).toBe(true);
    expect(resolveCast(world, castOf(world, 4, { aim: at(50, -5) }))).toBe(false);
  });
});

describe("ô 5 Thiên Hà Kiếm Vũ", () => {
  it("needs a full Chân Nguyên and spends it; volleys +30/+75/+120; ≤ 2.5 W a beast", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const vuong = addBeast(world, "thiet-boi-lang-vuong", { z: -6 });
    expect(resolveCast(world, castOf(world, 5))).toBe(false);
    world.seats[0]!.chanNguyenPm = CHAN_NGUYEN.full * 1000;
    const t0 = world.tick;
    expect(resolveCast(world, castOf(world, 5, { quality: "good" }))).toBe(true);
    expect(world.seats[0]!.chanNguyenPm).toBe(0);
    advance(world, 130, [stepSkills]);
    const hits = of("hit").filter((hit) => hit.source === "slot5");
    expect(hits.map((hit) => hit.tick - t0)).toEqual([30, 75, 120]);
    // One beast alone: 2.5 W = 225 HP, not the 10 W pool.
    expect(vuong.hpMax - vuong.hp).toBe(225);
  });

  it("10 W shared evenly over many beasts; Thế −40 over the three volleys", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const crowd = Array.from({ length: 8 }, (_, k) => addBeast(world, "thiet-boi-lang-vuong", { x: (k % 4) - 1.5, z: -6 - Math.floor(k / 4) }));
    const elite = addBeast(world, "nham-vien", { elite: "thiet-bi", z: -5 });
    world.seats[0]!.chanNguyenPm = CHAN_NGUYEN.full * 1000;
    expect(resolveCast(world, castOf(world, 5, { quality: "good", aim: at(0, -6) }))).toBe(true);
    advance(world, 130, [stepSkills]);
    // 300 HP a volley over 9 beasts: 33 each (≤ 75), 99 over three volleys.
    for (const beast of crowd) expect(beast.hpMax - beast.hp).toBe(99);
    expect(elite.hpMax - elite.hp).toBe(99);
    expect(elite.posture?.value).toBe(40 - 40 - 0);
  });
});

describe("ô 3, Ấn, Tẩy", () => {
  it("Hộ thân makes a ward at the Cast's origin (r 2 m, 5 s, 3 blocks)", () => {
    const { world, of } = makeWorld();
    expect(resolveCast(world, castOf(world, 3, { origin: at(1, 2) }))).toBe(true);
    expect(world.wards.list).toEqual([{ id: 1, seat: 0, originU: at(1, 2), radiusU: at(2, 0).x, untilTick: world.tick + 300, charges: 3 }]);
    expect(of("ward")[0]).toMatchObject({ stage: "start", wardId: 1, charges: 3 });
  });

  it("an Ấn resolves while its beast lives (its Thế is cast.ts's)", () => {
    const { world } = makeWorld();
    const elite = addBeast(world, "phong-lang", { elite: "cuong" });
    expect(resolveCast(world, castOf(world, "seal", { target: { slot: elite.slot, serial: elite.serial } }))).toBe(true);
    elite.alive = false;
    expect(resolveCast(world, castOf(world, "seal", { target: { slot: elite.slot, serial: elite.serial } }))).toBe(false);
  });

  it("Tẩy resolves only on a captured (dark) node", () => {
    const { world } = makeWorld();
    expect(resolveCast(world, castOf(world, "cleanse", { node: "tam-nhan" }))).toBe(false);
    world.formation.nodes[0]!.on = false;
    expect(resolveCast(world, castOf(world, "cleanse", { node: "tam-nhan" }))).toBe(true);
    expect(world.formation.nodes[0]!.relightAt).toBe(world.tick + 60);
  });
});

describe("Tích Kiếm, đánh nền", () => {
  it("Tích Kiếm: −8 % in wave 1, +4 % a wave held, ≤ +24 %", () => {
    const { world } = makeWorld({ tamPhap: "tich-kiem" });
    expect(tichKiemPmFor(world)).toBe(-80);
    world.waves.endedThrough = 3;
    expect(tichKiemPmFor(world)).toBe(40);
    world.waves.endedThrough = 20;
    expect(tichKiemPmFor(world)).toBe(240);
    stepSkills(world);
    expect(world.skills.seats[0]!.tichKiemPm).toBe(240);
  });

  it("đánh nền: range from `origin`, the school's rate, not while down; lands +18 ticks later, 0.25 W physical (armour applies)", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const tru = addBeast(world, "thiet-giap-tru", { z: -5 });
    const far = addBeast(world, "phong-lang", { z: -11 });
    const auto = (beast: typeof tru, origin = at(0, 0)) => applyAuto(world, { type: "auto", seat: 0, beast: { slot: beast.slot, serial: beast.serial }, origin });
    const t0 = world.tick;
    auto(tru);
    auto(tru);
    expect(of("rejected").map((event) => event.reason)).toEqual(["cooldown"]);
    advance(world, 19, [stepAutoHits]);
    // 0.25 W = 23 HP; Thiết Giáp Trư G2 −55 %: 10.
    expect(of("hit").map((hit) => [hit.tick - t0, hit.amount, hit.damageType, hit.source])).toEqual([[18, 10, "physical", "auto"]]);
    world.tick = t0 + 72;
    auto(far);
    expect(of("rejected").map((event) => event.reason)).toEqual(["cooldown", "range"]);
    world.seats[0]!.downUntil = world.tick + 10;
    auto(tru);
    expect(of("rejected").map((event) => event.reason)).toEqual(["cooldown", "range", "down"]);
    world.seats[0]!.downUntil = -1;
    auto(far, at(0, -5));
    expect(world.skills.strikes).toHaveLength(1);
  });

  it("a target that died before the hit: 50 % to the nearest within 4 m", () => {
    const { world, of } = makeWorld();
    setTamNhan(world, false);
    const wolf = addBeast(world, "phong-lang", { z: -5 });
    const other = addBeast(world, "phong-lang", { x: 2, z: -5 });
    applyAuto(world, { type: "auto", seat: 0, beast: { slot: wolf.slot, serial: wolf.serial }, origin: at(0, 0) });
    wolf.alive = false;
    advance(world, 19, [stepAutoHits]);
    // 23 × 50 % = 11.5 → 12.
    expect(of("hit").map((hit) => [hit.beast.serial, hit.amount])).toEqual([[other.serial, 12]]);
    expect(createPosture(40).value).toBe(40);
  });
});
