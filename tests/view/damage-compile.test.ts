import { describe, expect, it } from "vitest";
import { DamageCompiler } from "../../src/view/damage-compile";
import { compactNumber, type SkillNumbers } from "../../src/view/hitfx";

/** A SkillNumbers that records what it was asked to show. */
function recorder(): SkillNumbers & { rows: { key: number; value: number; hits: number; crit: boolean; tier: number }[]; heads: { value: number; hits: number; pop: boolean }[] } {
  const rows: { key: number; value: number; hits: number; crit: boolean; tier: number }[] = [];
  const heads: { value: number; hits: number; pop: boolean }[] = [];
  return {
    rows,
    heads,
    show(key, value, hits, _x, _y, _z, crit, _rgb, tier) {
      rows.push({ key, value, hits, crit, tier });
    },
    headline(value, hits, _rgb, pop) {
      heads.push({ value, hits, pop });
    },
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

describe("damage compilation (POWER_RESEARCH §5)", () => {
  it("compiles blows on one target over the window into one packet", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let i = 0; i < 6; i += 1) {
      c.add(1, 7, 100, i === 3, 0, 0, 0, 0xffffff, 2, 0.15, false);
      c.update(0.02);
    }
    expect(out.rows).toEqual([]);
    c.update(0.1);
    // One crit in six blows: the packet is no crit (round 2: a third of its blows must be), an elite's packet is T2.
    expect(out.rows).toEqual([{ key: 7, value: 600, hits: 6, crit: false, tier: 2 }]);
  });

  it("reads a packet as a crit (gold, big) when a third or more of its blows were", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let i = 0; i < 6; i += 1) c.add(1, 7, 100, i % 3 === 0, 0, 0, 0, 0xffffff, 2, 0.15, false);
    c.update(0.2);
    expect(out.rows).toEqual([{ key: 7, value: 600, hits: 6, crit: true, tier: 4 }]);
  });

  it("shows one cluster total for five or more small beasts of one attack together; elites keep their own", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let t = 0; t < 6; t += 1) c.add(2, t, 50, false, 1 + t * 0.3, 0, 1, 0xffffff, 0, 0.15, false);
    c.add(2, 40, 80, false, 1.5, 0, 1.2, 0xffffff, 2, 0.15, false);
    c.update(0.2);
    expect(out.rows.length).toBe(2);
    const cluster = out.rows.find((r) => r.hits === 6);
    expect(cluster?.value).toBe(300);
    expect(out.rows.some((r) => r.key === 40 && r.value === 80)).toBe(true);
    expect(c.clusters).toBe(1);
  });

  it("keeps fewer than five small beasts as separate numbers", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    for (let t = 0; t < 4; t += 1) c.add(3, t, 50, false, t * 0.3, 0, 0, 0xffffff, 1, 0.15, false);
    c.update(0.2);
    expect(out.rows.map((r) => r.key).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("number hierarchy (power pass round 2)", () => {
  it("adds an area attack's blows on small beasts up per cell over a second, elites per target", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    // 40 blows on 10 small beasts in one 8 m cell, and 6 on an elite, within the second.
    for (let i = 0; i < 40; i += 1) {
      c.add(4, i % 10, 10, false, 1 + (i % 10) * 0.4, 0.5, 1, 0xffffff, 1, 0.15, false, true);
      if (i % 7 === 0) c.add(4, 50, 30, false, 3, 0.8, 2, 0xffffff, 2, 0.15, false, true);
      c.update(0.02);
    }
    expect(out.rows).toEqual([]);
    c.update(0.3);
    expect(out.rows.length).toBe(2);
    expect(out.rows.find((r) => r.hits === 40)?.value).toBe(400);
    expect(out.rows.find((r) => r.key === 50)?.hits).toBe(6);
  });

  it("sizes by weight: a lone small hit T1, a packet T2, a big hit T4", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    c.add(5, 1, 10, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.add(5, 2, 10, false, 3, 0, 0, 0xffffff, 0, 0.15, false);
    c.add(5, 2, 10, false, 3, 0, 0, 0xffffff, 0, 0.15, false);
    c.add(5, 3, 90, false, 6, 0, 0, 0xffffff, 0, 0.15, true);
    c.update(0.2);
    const tierOf = (k: number): number | undefined => out.rows.find((r) => r.key === k)?.tier;
    expect([tierOf(1), tierOf(2), tierOf(3)]).toEqual([1, 2, 4]);
  });

  it("counts a big skill's blows into one headline total that pops on its finisher", () => {
    const out = recorder();
    const c = new DamageCompiler(out);
    c.headline(9);
    for (let i = 0; i < 10; i += 1) {
      c.add(9, i, 100, false, i, 0, 0, 0xffffff, 0, 0.15, false, true);
      c.update(1 / 60);
    }
    c.add(8, 1, 999, false, 0, 0, 0, 0xffffff, 0, 0.15, false);
    c.finisher(9);
    c.update(1 / 60);
    const last = out.heads.at(-1)!;
    expect(last.value).toBe(1000);
    expect(last.hits).toBe(10);
    expect(last.pop).toBe(true);
  });
});
