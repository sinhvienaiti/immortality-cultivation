import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DRAGON_PATTERNS, DragonPaths } from "../../src/lab/dragon-path";

function lab(): { d: DragonPaths; cam: THREE.PerspectiveCamera } {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
  cam.position.set(0, 30, 16);
  cam.lookAt(0, 0, -5);
  cam.updateMatrixWorld(true);
  const d = new DragonPaths(new THREE.Group(), cam, "/x/");
  // No browser: mark the stills loaded so the parts are built.
  (d as unknown as { loaded: boolean }).loaded = true;
  return { d, cam };
}

describe("energy dragons along curves (dragon-path.ts)", () => {
  it("draws every dragon of every sample path in four merged meshes", () => {
    for (const p of DRAGON_PATTERNS) {
      const { d } = lab();
      d.start(p, 8, 0, 4, 0, -13);
      // Two seconds: every staggered start has begun (the dash's and the spiral's are 0.12 and 0.25 s apart).
      let most = 0;
      for (let f = 0; f < 120; f += 1) {
        d.update(1 / 60);
        most = Math.max(most, d.stats.quads);
        expect(d.stats.draws).toBeLessThanOrEqual(4);
      }
      expect(d.stats.dragons).toBe(8);
      expect(most).toBeGreaterThan(8 * 20);
    }
  });

  it("caps at 16 dragons and clears", () => {
    const { d } = lab();
    d.start("radial", 40, 0, 4, 0, -13);
    for (let f = 0; f < 30; f += 1) d.update(1 / 60);
    expect(d.stats.dragons).toBe(16);
    d.clear();
    d.update(1 / 60);
    expect(d.stats.quads).toBe(0);
    expect(d.active).toBe(false);
  });
});
