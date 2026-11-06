import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { iconSrc, KEY_ICONS, keyIcon, type IconStyle } from "../../src/lab/skill-bar";

const styles: readonly IconStyle[] = ["ink-gold", "jewel-crest"];

describe("lab skill bar icons (pure helpers, node)", () => {
  it.each(styles)("uses the 48-px try1 file for an ordinary %s icon", (style) => {
    expect(iconSrc(style, "flying-sword")).toBe(`/art-src/lab/ui/skill-icons/${style}-flying-sword.v1-try1-48.png`);
  });

  it.each(styles)("uses try2 for the revised step and avatar in %s", (style) => {
    for (const id of ["flowing-light-step", "asura-six-arms-avatar"]) {
      expect(iconSrc(style, id)).toBe(`/art-src/lab/ui/skill-icons/${style}-${id}.v1-try2-48.png`);
    }
  });

  it("uses the supplied base directory", () => {
    expect(iconSrc("ink-gold", "flying-sword", "/icons/")).toBe("/icons/ink-gold-flying-sword.v1-try1-48.png");
  });

  it("maps all eight fixed lab keys, leaving the crescent's key 2 empty", () => {
    expect(KEY_ICONS).toEqual({
      "0": "flying-sword",
      "1": "sword-qi-strike",
      "2": "crescent-metal",
      "3": "returning-sword-guard",
      "4": "flowing-light-step",
      "5": "falling-sword-array",
      "6": "milky-way-sword-rain",
      "7": "myriad-edges-hear-the-edict",
    });
  });

  it("selects Twin Dragons only for the grey box and leaves keys outside 0–7 empty", () => {
    expect(keyIcon("2", true)).toBe("twin-dragons");
    expect(keyIcon("2", false)).toBe("crescent-metal");
    expect(iconSrc("jewel-crest", "crescent-metal")).toBe("/art-src/lab/ui/skill-icons/jewel-crest-crescent-metal.v1-try2-48.png");
    expect(iconSrc("ink-gold", "crescent-metal")).toBe("/art-src/lab/ui/skill-icons/ink-gold-crescent-metal.v1-try1-48.png");
    expect(keyIcon("0", false)).toBe("flying-sword");
    for (const key of ["8", "9", "I", ""]) expect(keyIcon(key, false)).toBeNull();
  });

  const dir = fileURLToPath(new URL("../../art-src/lab/ui/skill-icons/", import.meta.url));
  it.skipIf(!existsSync(dir))("has a real 48-px image for every mapped id in both styles", () => {
    const ids = [...Object.values(KEY_ICONS).filter((id): id is string => id !== null), "twin-dragons"];
    for (const style of styles) {
      for (const id of ids) {
        const src = iconSrc(style, id, dir);
        expect(existsSync(src), src).toBe(true);
      }
    }
  });
});
