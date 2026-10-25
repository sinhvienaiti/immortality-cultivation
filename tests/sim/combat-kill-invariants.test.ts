// canon §10.2 (D38, PB-06): the two kill invariants, in Thư giãn, Cân bằng, Thử thách and Học, at K0 and K1,
// without Tích Kiếm and without khắc × 0.80 (every M0a beast is vô hệ):
//   one ô 1 sword of a word that is not Ẩu kills a Thạch Thử (bầy, 30 HP at K0);
//   one ô 1 word that is not Ẩu kills a Phong Lang (Nhỏ 1 W, 90 HP at K0) when all 3 swords hit it.
import { describe, expect, it } from "vitest";
import type { Grade, Preset } from "../../src/content/types";
import { damageBeast, splitWord, wordDamage } from "../../src/sim/combat";
import { resolveCast, stepSkills } from "../../src/sim/skills";
import { addBeast, advance, castOf, makeWorld, setTamNhan } from "./combat-fixture";

const PRESETS: readonly Preset[] = ["relax", "balanced", "challenge", "learn"];
const REALMS = [0, 1] as const;
const NOT_SLOPPY: readonly Grade[] = ["flash", "perfect", "good", "ok"];

describe("kill invariants of ô 1 (canon §10.2)", () => {
  for (const preset of PRESETS) {
    for (const realm of REALMS) {
      for (const lit of [false, true]) {
        it(`${preset} K${realm}, Tâm nhãn ${lit ? "lit" : "out"}: the smallest sword kills a Thạch Thử, a whole word a Phong Lang`, () => {
          for (const grade of NOT_SLOPPY) {
            const { world } = makeWorld({ preset, realm, tamPhap: "kiem-tam" });
            setTamNhan(world, lit);
            const word = wordDamage(world, 0, grade);
            const swords = splitWord(word, 3);
            const rat = addBeast(world, "thach-thu");
            const wolf = addBeast(world, "phong-lang", { x: 4 });
            // Swarm and small beasts never take the preset's HP factor (canon §13.4).
            expect(rat.hpMax).toBe(realm === 0 ? 30 : 33);
            expect(wolf.hpMax).toBe(realm === 0 ? 90 : 101);
            // The smallest share (the first two; the rest goes on the last).
            damageBeast(world, rat, Math.min(...swords), "typed", { seat: 0, source: "slot1", grade, scaled: true });
            expect(rat.alive, `${grade}: sword ${Math.min(...swords)} vs ${rat.hpMax}`).toBe(false);
            for (const sword of swords) damageBeast(world, wolf, sword, "typed", { seat: 0, source: "slot1", grade, scaled: true });
            expect(wolf.alive, `${grade}: word ${word} vs ${wolf.hpMax}`).toBe(false);
          }
        });
      }
    }
  }

  it("an Ẩu word is outside the invariant (its sword does not kill a Thạch Thử)", () => {
    const { world } = makeWorld();
    setTamNhan(world, false);
    const sword = Math.min(...splitWord(wordDamage(world, 0, "sloppy"), 3));
    const rat = addBeast(world, "thach-thu");
    damageBeast(world, rat, sword, "typed", { seat: 0, source: "slot1", grade: "sloppy", scaled: true });
    expect(sword).toBe(20);
    expect(rat.alive).toBe(true);
  });

  it("through the real ô 1 Cast: the first sword (+6) kills a Thạch Thử; the band's 3 swords (+6/+36/+66) kill a Phong Lang", () => {
    for (const realm of REALMS) {
      for (const preset of PRESETS) {
        const { world, of } = makeWorld({ preset, realm });
        setTamNhan(world, false);
        const rat = addBeast(world, "thach-thu", { z: -6 });
        expect(resolveCast(world, castOf(world, 1, { quality: "ok" }))).toBe(true);
        const start = world.tick;
        advance(world, 7, [stepSkills]);
        expect(rat.alive).toBe(false);
        expect(of("hit").filter((hit) => hit.source === "slot1").map((hit) => hit.tick)).toEqual([start + 6]);

        const next = makeWorld({ preset, realm });
        setTamNhan(next.world, false);
        const wolf = addBeast(next.world, "phong-lang", { z: -6 });
        expect(resolveCast(next.world, castOf(next.world, 1, { quality: "ok" }))).toBe(true);
        const t0 = next.world.tick;
        advance(next.world, 67, [stepSkills]);
        expect(wolf.alive, `${preset} K${realm}`).toBe(false);
        expect(next.of("hit").filter((hit) => hit.source === "slot1").map((hit) => hit.tick - t0)).toEqual([6, 36, 66]);
      }
    }
  });
});
