import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRUSH, FIRE, FIRE_LAB, resetFireAudit } from "../../src/view/skills/element-fire";
import { ElementStage } from "../../src/view/skills/element-stage";
import type { FlipbookMeta } from "../../src/view/skills/flipbook";
import { SpritePool } from "../../src/view/skills/fxkit";
import type { SwordSkillTextures } from "../../src/view/skills/sword-skills";

const STEP = 1 / 60;
const CLIP: FlipbookMeta = {
  id: BRUSH.id, url: "", cols: 6, rows: 4, frames: 24, fps: 24,
  loop: false, loopMode: "none", timingProfile: "impact-key1", mode: "rgba",
  aspect: 1, pivot: [0.306481, 0.737963], anchor: [0.306481, 0.737963], start: 0, heading: 81 * Math.PI / 180,
};

function setup(): { stage: ElementStage; hit: (scale?: number, big?: boolean) => void; flash: THREE.Mesh<THREE.InstancedBufferGeometry> } {
  vi.stubGlobal("location", { search: "" });
  FIRE_LAB.impact = "brush";
  const t = new THREE.Texture();
  const textures: SwordSkillTextures = { glow: t, flare: t, star: t, spark: t, trace: t, slash: t, mote: t, smoke: t, splash: t, scorch: t, ring: t, shock: t, halo: t, twirl: t };
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  camera.position.set(0, 26, 14);
  camera.lookAt(0, 0, -6);
  camera.updateMatrixWorld(true);
  const stage = new ElementStage({ layer: new THREE.Group(), camera, quality: "high", textures, texture: () => t, vfxBase: "/v/" });
  stage.flipbooks.library(BRUSH.folder).add(CLIP, t, { a: t, b: t });
  const hooks = stage.hooksOf(FIRE).sword!;
  const hit = (scale = 1, big = false): void => {
    hooks.impact!({ slot: "k1", at: new THREE.Vector3(1, 0.5, -6), dx: 0, dz: -1, scale, big, power: 1, pal: FIRE.palette({} as never, "k1") });
  };
  return { stage, hit, flash: stage.layer.getObjectByName("fx-fire-flash") as THREE.Mesh<THREE.InstancedBufferGeometry> };
}

/** Integrated light of a fixed fake glow sheet: its constant texel integral cancels in E0 / max(E). */
function energy(mesh: THREE.Mesh<THREE.InstancedBufferGeometry>, index = 0): number {
  if (index >= mesh.geometry.instanceCount) return 0;
  const pos = mesh.geometry.getAttribute("iPos"), col = mesh.geometry.getAttribute("iCol");
  return pos.getW(index) ** 2 * col.getW(index) * (0.2126 * col.getX(index) + 0.7152 * col.getY(index) + 0.0722 * col.getZ(index));
}

afterEach(() => { vi.unstubAllGlobals(); FIRE_LAB.impact = "brush"; resetFireAudit(); });

describe("key 1 brush flash at age zero (ticket 278)", () => {
  it("draws the peak on the first host update for normal and big blows, then decays through age 12", () => {
    const { stage, hit, flash } = setup();
    try {
      for (const [scale, big] of [[0.8, false], [1.05, false], [1.05, true]] as const) {
        stage.reset();
        hit(scale, big);
        const light: number[] = [];
        for (let age = 0; age <= 12; age += 1) {
          stage.begin();
          stage.update(STEP);
          light.push(energy(flash));
          if (age === 0) {
            expect(flash.geometry.instanceCount).toBe(1);
            expect(flash.geometry.getAttribute("iCol").getW(0)).toBe(1);
            expect(flash.geometry.getAttribute("iPos").getW(0)).toBeCloseTo(BRUSH.flash.size0 * scale * (big ? 1.3 : 1));
          }
        }
        expect(light[0]).toBeGreaterThan(0);
        expect(light[0]).toBe(Math.max(...light));
        expect(light[0]! / Math.max(...light)).toBeGreaterThanOrEqual(0.95);
        for (let i = 1; i < light.length; i += 1) expect(light[i]).toBeLessThanOrEqual(light[i - 1]!);
        expect(light[1]).toBeLessThan(light[0]!);
        expect(light[5]).toBe(0);
      }
    } finally { stage.flipbooks.dispose(); }
  });

  it("keeps overlapping flashes on separate clocks and holds the peak during hit-stop", () => {
    const { stage, hit, flash } = setup();
    try {
      hit(); stage.update(0);
      const peak = energy(flash);
      stage.update(0); expect(energy(flash)).toBe(peak);
      stage.update(STEP);
      hit(); stage.update(STEP);
      expect(flash.geometry.instanceCount).toBe(2);
      expect(energy(flash, 0)).toBeLessThan(peak);
      expect(energy(flash, 1)).toBe(peak);
      // Remove the older slot, swap the younger one in, then reuse the free slot.
      stage.update(0.05); stage.update(0);
      expect(flash.geometry.instanceCount).toBe(1);
      expect(energy(flash)).toBeLessThan(peak);
      hit(); stage.update(0.05);
      expect(energy(flash, 1)).toBe(peak);
      stage.reset(); stage.update(STEP);
      expect(flash.geometry.instanceCount).toBe(0);
      expect(flash.visible).toBe(false);
    } finally { stage.flipbooks.dispose(); }
  });

  it("keeps the existing advance-before-draw timing for pools that do not opt in", () => {
    const pool = new SpritePool(2, new THREE.Texture(), "add");
    const s = pool.spec.reset();
    s.life = BRUSH.flash.life; s.size0 = BRUSH.flash.size0; s.size1 = BRUSH.flash.size1;
    pool.emit(); pool.update(STEP);
    const geo = pool.mesh.geometry;
    expect(geo.getAttribute("iCol").getW(0)).toBeLessThan(1);
    expect(geo.getAttribute("iPos").getW(0)).toBeLessThan(BRUSH.flash.size0);
    pool.update(BRUSH.flash.life);
    expect(pool.count).toBe(0);
    // One-frame sprites retain their old lifetime as well.
    pool.spec.reset().life = 0;
    pool.emit(); pool.update(STEP); expect(pool.count).toBe(1);
    pool.update(0); expect(pool.count).toBe(0);
  });
});
