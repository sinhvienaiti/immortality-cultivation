import { describe, expect, it } from "vitest";
import { AB_FLAGS, abFlagEnabled, withAbFlag } from "../../src/lab/ab-flags";

const cases = [
  { key: "deathfx", value: "old", defaultOn: true },
  { key: "foeaura", value: "0", defaultOn: true },
  { key: "presence", value: "0", defaultOn: true },
  { key: "cutinmat", value: "0", defaultOn: true },
  { key: "ambient", value: "0", defaultOn: true },
  { key: "chargefill", value: "0", defaultOn: true },
  { key: "fivephase", value: "0", defaultOn: true },
  { key: "tp2", value: "1", defaultOn: false },
  { key: "video", value: "0", defaultOn: true },
  { key: "sigil", value: "code", defaultOn: true },
  { key: "readable", value: "1", defaultOn: false },
  { key: "pilot", value: "1", defaultOn: false },
];
const base = "https://tutien.typing-game.local/skills.html?element=fire&show=fire-pillar&expand=water-avatar&quality=ultra&typed=1&other=a&other=b#lab";

describe("lab A/B flags (node)", () => {
  it("registers each comparison once with an English label", () => {
    expect(AB_FLAGS.map((flag) => flag.key)).toEqual(cases.map((flag) => flag.key));
    for (const flag of AB_FLAGS) expect(flag.label).toMatch(/^[A-Za-z][A-Za-z0-9 -]+$/);
  });

  describe.each(cases)("$key", ({ key, value, defaultOn }) => {
    const flag = AB_FLAGS.find((entry) => entry.key === key)!;

    it("reads the default and only the runtime's exact comparison value", () => {
      const url = new URL(base);
      expect(abFlagEnabled(url, flag)).toBe(defaultOn);
      url.searchParams.set(key, value);
      expect(abFlagEnabled(url, flag)).toBe(!defaultOn);
      url.searchParams.set(key, "unexpected");
      expect(abFlagEnabled(url, flag)).toBe(defaultOn);
      url.searchParams.set(key, "");
      expect(abFlagEnabled(url, flag)).toBe(defaultOn);
    });

    it.each([true, false])("builds the URL for enabled=%s, retaining all other choices", (enabled) => {
      const url = new URL(base);
      for (const other of cases) url.searchParams.set(other.key, other.value);
      const original = url.href;
      const next = withAbFlag(url, flag, enabled);
      expect(next.searchParams.get(key)).toBe(enabled === defaultOn ? null : value);
      expect(abFlagEnabled(next, flag)).toBe(enabled);
      const untouched = new URL(original);
      untouched.searchParams.delete(key);
      const remaining = new URL(next.href);
      remaining.searchParams.delete(key);
      expect(remaining.href).toBe(untouched.href);
      expect(url.href).toBe(original);
      expect(withAbFlag(next, flag, enabled).href).toBe(next.href);
    });

    it("switches both ways from the default, including repeated flag parameters", () => {
      const url = new URL(base);
      const alternate = withAbFlag(url, flag, !defaultOn);
      expect(alternate.searchParams.get(key)).toBe(value);
      expect(abFlagEnabled(alternate, flag)).toBe(!defaultOn);
      alternate.searchParams.append(key, "unexpected");
      expect(abFlagEnabled(alternate, flag)).toBe(!defaultOn);
      expect(withAbFlag(alternate, flag, !defaultOn).searchParams.getAll(key)).toEqual([value]);
      const restored = withAbFlag(alternate, flag, defaultOn);
      expect(restored.href).toBe(url.href);
      expect(abFlagEnabled(restored, flag)).toBe(defaultOn);
    });
  });
});
