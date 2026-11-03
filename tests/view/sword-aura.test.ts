import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { standInModel } from "../../src/view/skills/blades";
import { FIRE } from "../../src/view/skills/element-fire";
import { METAL } from "../../src/view/skills/element-metal";
import { elementKits } from "../../src/view/skills/elements";
import { applySwordAuraLook, AURA_BODY_MAX, SWORD_AURA_LOOK } from "../../src/view/skills/sword-aura";

/** Hue (degrees, on sRGB) and saturation of a linear colour. */
function hsl(c: { x: number; y: number; z: number } | readonly number[]): { h: number; s: number; l: number } {
  const [r, g, b] = Array.isArray(c) ? c : [(c as THREE.Vector3).x, (c as THREE.Vector3).y, (c as THREE.Vector3).z];
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color().setRGB(r!, g!, b!, THREE.LinearSRGBColorSpace).getHSL(out, THREE.SRGBColorSpace);
  return { h: out.h * 360, s: out.s, l: out.l };
}
const hueGap = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("sword aura contract (SWORD_AURA §4.8)", () => {
  it("every registered element carries its aura matter: Metal qi, Fire flame", () => {
    for (const kit of elementKits()) expect(kit.swordAura).toBeDefined();
    expect(METAL.swordAura.mode).toBe("qi");
    expect(FIRE.swordAura.mode).toBe("flame");
    expect(METAL.swordAura.coreHdr).toBeGreaterThanOrEqual(2.4);
    expect(METAL.swordAura.coreHdr).toBeLessThanOrEqual(3.6);
    expect(FIRE.swordAura.coreHdr).toBeGreaterThanOrEqual(2.4);
    expect(FIRE.swordAura.reachW).toBeCloseTo(1.6);
  });

  it("applySwordAuraLook keeps every light body ≤ 0.85 a channel, in its own hue", () => {
    for (const kit of elementKits()) {
      applySwordAuraLook(kit.swordAura);
      for (const v of [SWORD_AURA_LOOK.body.value, SWORD_AURA_LOOK.edge.value, SWORD_AURA_LOOK.deep.value]) {
        expect(Math.max(v.x, v.y, v.z)).toBeLessThanOrEqual(AURA_BODY_MAX + 1e-6);
      }
      const raw = hsl(kit.swordAura.ramp.body);
      expect(hueGap(hsl(SWORD_AURA_LOOK.body.value).h, raw.h)).toBeLessThan(0.5);
    }
  });

  it("Metal's body is silver-blue (~200°), far from the typing colour #7FF5E0 (169°), never gold", () => {
    applySwordAuraLook(METAL.swordAura);
    const b = hsl(SWORD_AURA_LOOK.body.value);
    expect(b.h).toBeGreaterThan(190);
    expect(b.h).toBeLessThan(215);
    expect(hueGap(b.h, 169)).toBeGreaterThan(20);
    const e = hsl(SWORD_AURA_LOOK.edge.value);
    expect(e.h > 30 && e.h < 70).toBe(false);
  });

  it("Fire's body runs vermilion to orange (15–30°), amber only on the edge role, away from the warning red", () => {
    applySwordAuraLook(FIRE.swordAura);
    const body = hsl(SWORD_AURA_LOOK.body.value);
    const deep = hsl(SWORD_AURA_LOOK.deep.value);
    for (const h of [body.h, deep.h]) {
      expect(h).toBeGreaterThanOrEqual(15);
      expect(h).toBeLessThanOrEqual(30);
    }
    // #FF4A4A is hue 0: the body stays ≥ 15° away.
    expect(hueGap(deep.h, 0)).toBeGreaterThanOrEqual(15);
    expect(FIRE.swordAura.ink.alpha).toBeGreaterThan(0.5);
  });

  it("a sword model carries its aura anchors (profile from the edge field, the guard's band, the pommel)", () => {
    const m = standInModel();
    const a = m.aura;
    expect(a.profile.length).toBe(96);
    expect(a.bladeFrom).toBeGreaterThan(0);
    expect(a.guardFrom).toBeLessThanOrEqual(a.bladeFrom);
    expect(a.tasselFrom).toBeLessThan(0);
    let max = 0;
    for (const h of a.profile) max = Math.max(max, h);
    expect(max).toBeGreaterThan(0.01);
    // The profile only narrows toward the tip.
    expect(a.profile[95]!).toBeLessThanOrEqual(a.profile[10]! + 1e-6);
  });
});
