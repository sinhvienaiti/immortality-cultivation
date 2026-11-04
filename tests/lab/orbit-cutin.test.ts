import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CUTIN_ART, CUTIN_SHOUT_CANDIDATES } from "../../src/lab/cutin";
import { LabOrbit } from "../../src/lab/orbit";

type Pointer = Pick<PointerEvent, "button" | "clientX" | "clientY" | "pointerId">;

/** Only the pointer and cursor surface used by LabOrbit; no browser globals. */
function surface() {
  const listeners = new Map<string, (event: Pointer) => void>();
  const captured = new Set<number>();
  const el = {
    style: { cursor: "" },
    addEventListener: (name: string, listener: (event: Pointer) => void) => listeners.set(name, listener),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  };
  return {
    el: el as unknown as HTMLElement,
    fire: (name: string, over: Partial<Pointer> = {}) => listeners.get(name)?.({ button: 0, clientX: 0, clientY: 0, pointerId: 1, ...over }),
  };
}

const PIVOT = new THREE.Vector3(3, 0, -7);
const EPS = 1e-6;

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
  cam.position.set(5, 14, 21);
  cam.lookAt(PIVOT);
  cam.updateMatrixWorld(true);
  return cam;
}

function elevation(cam: THREE.PerspectiveCamera): number {
  return THREE.MathUtils.radToDeg(Math.asin((cam.position.y - PIVOT.y) / cam.position.distanceTo(PIVOT)));
}

describe("lab orbit (owner preview port)", () => {
  it("leaves the camera untouched while off, including after pointer input", () => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    const before = cam.clone();
    s.fire("pointerdown");
    s.fire("pointermove", { clientX: 100, clientY: 100 });
    orbit.apply(cam, 1 / 60);
    expect(orbit.enabled).toBe(false);
    expect(cam.position.equals(before.position)).toBe(true);
    expect(cam.quaternion.equals(before.quaternion)).toBe(true);
    expect(cam.up.equals(before.up)).toBe(true);
    expect(cam.matrixWorld.equals(before.matrixWorld)).toBe(true);
    expect(cam.fov).toBe(before.fov);
    expect(s.el.hasPointerCapture(1)).toBe(false);
  });

  it.each([0, 1 / 60])("preserves the play pose at yaw 0 and unset elevation (dt=%s)", (dt) => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    const before = cam.clone();
    orbit.toggle();
    orbit.apply(cam, dt);
    expect(orbit.enabled).toBe(true);
    expect(s.el.style.cursor).toBe("grab");
    expect(cam.position.distanceTo(before.position)).toBeLessThanOrEqual(EPS);
    expect(cam.quaternion.angleTo(before.quaternion)).toBeLessThanOrEqual(EPS);
    expect(cam.fov).toBe(before.fov);
  });

  it("turns a 100 px horizontal drag around the ground target at a constant distance", () => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    const distance = cam.position.distanceTo(PIVOT);
    const elev = elevation(cam);
    const expected = cam.position.clone().sub(PIVOT).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-35)).add(PIVOT);
    orbit.toggle();
    orbit.apply(cam, 0);
    s.fire("pointerdown");
    expect(s.el.hasPointerCapture(1)).toBe(true);
    s.fire("pointermove", { clientX: 100 });
    orbit.apply(cam, 0);
    expect(cam.position.distanceTo(expected)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(cam.position.distanceTo(PIVOT) - distance)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(elevation(cam) - elev)).toBeLessThanOrEqual(EPS);
    const direction = cam.getWorldDirection(new THREE.Vector3());
    const ground = cam.position.clone().addScaledVector(direction, -cam.position.y / direction.y);
    expect(ground.distanceTo(PIVOT)).toBeLessThanOrEqual(EPS);
  });

  it("can turn all the way around the field", () => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    const before = cam.position.clone();
    orbit.toggle();
    orbit.apply(cam, 0);
    s.fire("pointerdown");
    s.fire("pointermove", { clientX: 360 / 0.35 });
    orbit.apply(cam, 0);
    expect(cam.position.distanceTo(before)).toBeLessThanOrEqual(EPS);
  });

  it.each([[10_000, 89], [-10_000, 4]])("clamps a %s px vertical drag to %s degrees", (dy, degrees) => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    const distance = cam.position.distanceTo(PIVOT);
    orbit.toggle();
    orbit.apply(cam, 0);
    s.fire("pointerdown");
    s.fire("pointermove", { clientY: dy });
    orbit.apply(cam, 0);
    expect(Math.abs(elevation(cam) - degrees)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(cam.position.distanceTo(PIVOT) - distance)).toBeLessThanOrEqual(EPS);
  });

  it.each(["pointerup", "pointercancel"])("ends the drag and releases pointer capture on %s", (event) => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    const cam = camera();
    orbit.toggle();
    orbit.apply(cam, 0);
    const before = cam.position.clone();
    s.fire("pointerdown");
    s.fire(event);
    s.fire("pointermove", { clientX: 100 });
    orbit.apply(cam, 0);
    expect(s.el.hasPointerCapture(1)).toBe(false);
    expect(cam.position.distanceTo(before)).toBeLessThanOrEqual(EPS);
  });

  it("returns control to the play camera when toggled off", () => {
    const s = surface();
    const orbit = new LabOrbit(s.el);
    orbit.toggle();
    orbit.apply(camera(), 0);
    s.fire("pointerdown");
    s.fire("pointermove", { clientX: 100, clientY: 40 });
    s.fire("pointerup");
    orbit.toggle();
    const cam = camera();
    const before = cam.position.clone();
    orbit.apply(cam, 1 / 60);
    expect(orbit.enabled).toBe(false);
    expect(s.el.style.cursor).toBe("");
    expect(cam.position.distanceTo(before)).toBeLessThanOrEqual(EPS);
    orbit.toggle();
    orbit.apply(cam, 0);
    expect(cam.position.distanceTo(before)).toBeLessThanOrEqual(EPS);
  });
});

describe("lab cut-in shout candidates", () => {
  it("provides c1–c4 for style C and b1–b3 for style B", () => {
    expect(Object.fromEntries(Object.entries(CUTIN_SHOUT_CANDIDATES).map(([id, pick]) => [id, pick.style]))).toEqual({
      c1: "c", c2: "c", c3: "c", c4: "c", b1: "b", b2: "b", b3: "b",
    });
  });

  it("uses the owner's Radiant Resolve file for C3, Firefly-upscaled (owner's pick, 04/11)", () => {
    expect(CUTIN_SHOUT_CANDIDATES.c3?.shout.src).toBe("/art-src/skills/cutin/tt-cutin-c-shout-e3-head-skin-up2x.v2-try1-ffup.png");
  });

  it("preserves both style A frames", () => {
    expect(CUTIN_ART.a).toEqual({
      gather: { src: "/art-src/skills/cutin/tt-cutin-a-gather.v1-try1.png", aspect: 1916 / 821, face: [0.285, 0.23] },
      shout: { src: "/art-src/skills/cutin/tt-cutin-a-shout.v1-try1.png", aspect: 1821 / 864, face: [0.26, 0.38] },
    });
  });
});
