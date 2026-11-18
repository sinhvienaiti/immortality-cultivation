import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CameraModes, SWITCH_S, VIEW_PROFILES } from "../../src/lab/camera-modes";

function topCamera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
  c.position.set(0, 30, 16);
  c.lookAt(0, 0, -5);
  c.updateMatrixWorld(true);
  return c;
}

describe("the lab's three views (camera-modes.ts)", () => {
  it("leaves the top camera alone and eases to each view over 0.4 s", () => {
    const m = new CameraModes();
    const cam = topCamera();
    m.apply(cam, 0, 4, 0, -5, 1 / 60);
    expect(cam.position.toArray()).toEqual([0, 30, 16]);
    m.set("behind");
    let steps = 0;
    for (let t = 0; t < SWITCH_S + 0.05; t += 1 / 60) {
      const c = topCamera();
      m.apply(c, 0, 4, 0, -5, 1 / 60);
      steps += 1;
      if (steps === 6) expect(c.position.y).toBeGreaterThan(2.2); // half way: still above eye height
      cam.copy(c);
    }
    // Behind the player at eye height, looking north (−z).
    expect(cam.position.y).toBeCloseTo(2.2, 3);
    expect(cam.position.z).toBeCloseTo(11, 3);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(fwd.z).toBeLessThan(-0.95);
    expect(cam.fov).toBeCloseTo(50, 3);
  });

  it("puts the side view east of the road, the beasts' north on its right, at 35°", () => {
    const m = new CameraModes();
    m.set("side");
    let cam = topCamera();
    for (let t = 0; t < SWITCH_S + 0.05; t += 1 / 60) {
      cam = topCamera();
      m.apply(cam, 0, 4, 0, -5, 1 / 60);
    }
    expect(cam.position.x).toBeGreaterThan(30);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    expect(right.z).toBeLessThan(-0.95);
    expect(cam.fov).toBeCloseTo(35, 3);
    expect(m.profile.flatTilt).toBeLessThanOrEqual((35 * Math.PI) / 180 + 1e-9);
  });

  it("keeps every profile's tilt at most 35° and the top view's profile neutral", () => {
    for (const p of Object.values(VIEW_PROFILES)) expect(p.flatTilt).toBeLessThanOrEqual((35 * Math.PI) / 180 + 1e-9);
    expect(VIEW_PROFILES.top).toEqual({ flatLiftM: 0, flatTilt: 0, uprightK: 1, tierRim: 0 });
  });
});
