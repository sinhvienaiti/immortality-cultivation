import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { standInModel } from "../../src/view/skills/blades";
import { FIRE, FIRE_FURNACE_BLADE } from "../../src/view/skills/element-fire";
import { METAL } from "../../src/view/skills/element-metal";
import { elementKits } from "../../src/view/skills/elements";
import { applySwordAuraLook, AURA_BODY_MAX, SWORD_AURA_LOOK } from "../../src/view/skills/sword-aura";
import { applyBladeLook, SWORD_LOOK } from "../../src/view/skills/sword-material";
import { RibbonPool } from "../../src/view/skills/fxkit";
import { SwordImpostors } from "../../src/view/skills/real-swords";

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

  it("Q3: Fire's blade is dark hot-edged steel by default; the old furnace stays for comparison; Metal reads no heat", () => {
    expect(FIRE.blade.mode).toBe("furnace");
    expect(FIRE.blade.heatFrom).toBeCloseTo(0.55);
    expect(FIRE.blade.char).toBeCloseTo(0.4);
    expect(FIRE_FURNACE_BLADE.heatFrom).toBeCloseTo(0.05);
    expect(FIRE_FURNACE_BLADE.char).toBeCloseTo(0.12);
    applyBladeLook(FIRE.blade);
    expect(SWORD_LOOK.heatFrom.value).toBeCloseTo(0.55);
    applyBladeLook(METAL.blade);
    expect(METAL.blade.mode).toBe("steel");
    expect(SWORD_LOOK.mode.value).toBe(0);
    expect(SWORD_LOOK.heatFrom.value).toBeCloseTo(0.05);
  });

  it("SilkTail: a silk ribbon is capped at its length, widest at a quarter, and the pool's moded program swaps in and out", () => {
    const pool = new RibbonPool(4, 40, new THREE.Texture());
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
    cam.position.set(0, 26, 14);
    cam.lookAt(0, 0, -6);
    cam.updateMatrixWorld(true);
    pool.start(0, 0, 1, 0, 0.16, 0, 0, 0, 1, 0.01);
    pool.setSilk(0, [0.05, 0.06, 0.2], [0.4, 0.5, 0.7], 2);
    for (let f = 1; f <= 30; f += 1) {
      pool.push(0, f * 0.4, 1, 0);
      pool.update(1 / 60, cam);
    }
    const pos = pool.mesh.geometry.getAttribute("position");
    // Spine points (pairs of vertices): the drawn length stays within the cap.
    let len = 0;
    let prev: THREE.Vector3 | null = null;
    let widest = 0;
    let widestAt = -1;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let k = 0; k < 40; k += 1) {
      a.fromBufferAttribute(pos, k * 2);
      b.fromBufferAttribute(pos, k * 2 + 1);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const w = a.distanceTo(b);
      if (w > widest + 1e-6) {
        widest = w;
        widestAt = k;
      }
      if (prev !== null) len += mid.distanceTo(prev);
      prev = mid;
    }
    expect(len).toBeLessThanOrEqual(2.05);
    expect(len).toBeGreaterThan(1.5);
    expect(widestAt).toBeGreaterThan(0);
    expect(widest).toBeCloseTo(0.32, 1);
    const light = pool.mesh.material;
    pool.setModed(true);
    expect(pool.mesh.material).not.toBe(light);
    expect(pool.modedProgram).not.toBeNull();
    pool.setModed(false);
    expect(pool.mesh.material).toBe(light);
  });

  it("MantleHalo: far swords carry an aura weight; the halo program swaps in only while the aura is on", () => {
    const far = new SwordImpostors(8, 12);
    far.setAtlas({ lit: new THREE.Texture(), mask: new THREE.Texture(), meta: { cellW: 512, cellH: 128, rolls: [0, 30, 60, 90], u0: 0.035, u1: 0.965, bladeFromU: 0.389 } });
    const own = far.mesh.material;
    far.begin();
    far.push(0, 1, 0, 2, 1, 0, 1, 0, 0.5, 0, 0.8);
    far.push(0, 1, 1, 2, 1, 1, 1, 0, 0.5, 0);
    far.end();
    const fx = far.mesh.geometry.getAttribute("iFx");
    expect(fx.itemSize).toBe(3);
    expect(fx.getZ(0)).toBeCloseTo(0.8);
    expect(fx.getZ(1)).toBe(0);
    far.setHalo(true);
    expect(far.mesh.material).not.toBe(own);
    expect(far.haloProgram).not.toBeNull();
    far.setHalo(false);
    expect(far.mesh.material).toBe(own);
  });
});
