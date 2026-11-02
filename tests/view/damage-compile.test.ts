import { describe, expect, it } from "vitest";
import { DamageCompiler } from "../../src/view/damage-compile";
import { compactNumber, type SkillNumbers } from "../../src/view/hitfx";

/** A SkillNumbers that records what it was asked to show. */
function recorder(): SkillNumbers & { rows: { key: number; value: number; hits: number; crit: boolean; tier: number; owner: number }[]; heads: { value: number; hits: number; pop: boolean; lane: number }[]; fades: number[] } {
  const rows: { key: number; value: number; hits: number; crit: boolean; tier: number; owner: number }[] = [];
  const heads: { value: number; hits: number; pop: boolean; lane: number }[] = [];
  const fades: number[] = [];
  return {
    rows,
    heads,
    fades,
    show(key, value, hits, _x, _y, _z, crit, _rgb, tier, _dirX, owner = -1) {
      rows.push({ key, value, hits, crit, tier, owner });
    },
    headline(value, hits, _rgb, pop, _fadeS, lane = 0) {
      heads.push({ value, hits, pop, lane });
    },
    fadeVictims(owner = -1) {
      fades.push(owner);
    },
    setWordTags() {},
    field: null as never,
    live: 0,
    update() {},
    clear() {},
    dispose() {},
  };
}

describe("compact damage labels (power pass)", () => {
  it("shortens thousands and millions", () => {
    expect(compactNumber(860)).toBe("860");
    expect(compactNumber(1234)).toBe("1.2K");
    expect(compactNumber(12_800)).toBe("12.8K");
    expect(compactNumber(128_400)).toBe("128K");
    expect(compactNumber(1_300_000)).toBe("1.3M");
    expect(compactNumber(2000)).toBe("2K");
  });
});

describe("damage compilation (POWER_RESEARCH §5, round 3a budgets)", () => {
  it("adds one target's blows of a batch into one packet, decided 125 ms after the batch's first blow", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let i = 0; i < 6; i += 1) {
      c.add(1, 7, 100, i === 3, 0, 0, 0, 0xffffff, 1, 0.15, false);
      c.update(0.02);
    }
    expect(out.rows).toEqual([]);
    c.update(0.01);
    // One crit in six blows: no crit (a third must be); a small beast's compiled packet is a victim (T2).
    expect(out.rows).toEqual([{ key: 7, value: 600, hits: 6, crit: false, tier: 2, owner: 1 }]);
    expect(out.fades).toEqual([1]);
  });

  it("reads a packet as a crit when a third or more of its blows were, and elites in the crit budget", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let i = 0; i < 6; i += 1) c.add(1, 7, 100, i % 3 === 0, 0, 0, 0, 0xffffff, 1, 0.15, false);
    c.add(1, 9, 50, false, 0, 0, 0, 0xffffff, 2, 0.15, false);
    c.update(0.2);
    expect(out.rows).toContainEqual({ key: 7, value: 600, hits: 6, crit: true, tier: 4, owner: 1 });
    expect(out.rows).toContainEqual({ key: 9, value: 50, hits: 1, crit: false, tier: 4, owner: 1 });
  });

  it("shows at most 2 crits or elites and 4 victims a batch, the largest first; the rest only in the headline", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    c.headline(4);
    let sum = 0;
    for (let t = 0; t < 30; t += 1) {
      const v = 100 + t * 10;
      sum += v;
      c.add(4, t, v, t % 7 === 0 && t < 21, t * 0.3, 0, 1, 0xffffff, t >= 27 ? 2 : 0, 0.15, false, true);
    }
    c.update(0.2);
    const crits = out.rows.filter((r) => r.tier === 4);
    const victims = out.rows.filter((r) => r.tier < 4);
    expect(crits.length).toBe(2);
    expect(victims.length).toBe(4);
    // The four largest non-crit, non-elite packets.
    expect(victims.map((r) => r.key).sort((a, b) => a - b)).toEqual([23, 24, 25, 26]);
    expect(c.totalOnly).toBe(24);
    expect(out.heads.at(-1)?.value).toBe(sum);
  });

  it("keeps a micro packet (under 15 % of the attack's largest) in the total only", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    c.headline(5);
    c.add(5, 1, 1000, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.add(5, 2, 100, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.update(0.2);
    expect(out.rows.map((r) => r.key)).toEqual([1]);
    expect(out.heads.at(-1)?.value).toBe(1100);
  });

  it("gives a second headline running at once its own lane, and pops the total on the finisher", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    c.headline(7);
    c.add(7, 1, 300, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.update(0.05);
    c.headline(8);
    c.add(8, 2, 200, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.finisher(7);
    c.add(7, 3, 50, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.update(0.05);
    expect(out.heads.some((h) => h.lane === 1 && h.value === 200)).toBe(true);
    expect(out.heads.some((h) => h.lane === 0 && h.value === 350 && h.pop)).toBe(true);
  });
});
