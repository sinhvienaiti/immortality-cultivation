import { describe, expect, it } from "vitest";
import { DamageCompiler } from "../../src/view/damage-compile";
import { compactNumber, type SkillNumbers } from "../../src/view/hitfx";

/** A SkillNumbers that records what it was asked to show. */
function recorder(): SkillNumbers & { rows: { key: number; value: number; hits: number; crit: boolean; tier: number }[] } {
  const rows: { key: number; value: number; hits: number; crit: boolean; tier: number }[] = [];
  return {
    rows,
    show(key, value, hits, _x, _y, _z, crit, _rgb, tier) {
      rows.push({ key, value, hits, crit, tier });
    },
    field: null as never,
    live: 0,
    update() {},
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
    expect(out.rows).toEqual([{ key: 7, value: 600, hits: 6, crit: true, tier: 2 }]);
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
