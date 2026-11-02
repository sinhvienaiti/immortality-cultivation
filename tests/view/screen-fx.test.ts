import * as THREE from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { describe, expect, it } from "vitest";
import { SCREEN_TIERS, ScreenFx, type ScreenFxHost } from "../../src/view/screen-fx";

/** A composer stand-in: the pass list and insertPass, no WebGL. */
function host(): ScreenFxHost & { passes: unknown[]; overlays: number } {
  const passes: unknown[] = [{ name: "render" }, { name: "bloom" }, new OutputPass()];
  const h = {
    passes,
    overlays: 0,
    composer: {
      passes,
      insertPass(p: unknown, i: number) {
        passes.splice(i, 0, p);
      },
      removePass(p: unknown) {
        passes.splice(passes.indexOf(p), 1);
      },
    } as unknown as ScreenFxHost["composer"],
    composerOn: () => true,
    addOverlay: () => {
      h.overlays += 1;
      return () => undefined;
    },
  };
  return h;
}

describe("screen effects by tier (power pass)", () => {
  it("inserts its one pass right before the OutputPass and its fallback quad first among the overlays", () => {
    const h = host();
    new ScreenFx(h);
    expect(h.passes.length).toBe(4);
    expect(h.passes[3]).toBeInstanceOf(OutputPass);
    expect(h.overlays).toBe(1);
  });

  it("holds the world in a hit-stop, and a new release cuts it", () => {
    const fx = new ScreenFx(host());
    fx.impact("skill", "primary");
    expect(fx.advance(1 / 60)).toBeLessThan(0.01);
    fx.impact("ultimate", "finisher");
    expect(fx.stopping).toBe(true);
    fx.cut();
    expect(fx.stopping).toBe(false);
    expect(fx.advance(1 / 60)).toBeCloseTo(1 / 60, 6);
  });

  it("slows the world on a finisher and comes back to full speed", () => {
    const fx = new ScreenFx(host());
    fx.impact("ultimate", "finisher");
    let world = 0;
    for (let i = 0; i < 6; i += 1) world += fx.advance(1 / 60);
    expect(world).toBeLessThan(0.1 * SCREEN_TIERS.ultimate.slow + 0.02);
    for (let i = 0; i < 60; i += 1) fx.advance(1 / 60);
    expect(fx.advance(1 / 60)).toBeCloseTo(1 / 60, 6);
  });

  it("shakes from trauma and dies within the tier's time; intensity 0 turns the visuals off", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    cam.position.set(0, 40, 30);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const fx = new ScreenFx(host());
    fx.impact("basic", "primary");
    fx.update(1 / 60, cam, 1080);
    expect(fx.shown.shakePx).toBeGreaterThan(0.5);
    for (let i = 0; i < 6; i += 1) fx.update(1 / 60, cam, 1080);
    expect(fx.shown.shakePx).toBe(0);
    fx.intensity = 0;
    fx.impact("ultimate", "finisher");
    fx.darken(0.28, 0.45);
    fx.update(1 / 60, cam, 1080);
    expect(fx.shown.shakePx).toBe(0);
    expect(fx.shown.dark).toBe(0);
    expect(fx.shown.flash).toBe(0);
  });

  it("never leaves a punch or roll on a camera the host placed again", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    const fx = new ScreenFx(host());
    fx.impact("ultimate", "finisher");
    fx.update(0.05, cam, 1080);
    fx.applyCamera(cam);
    expect(cam.fov).toBeLessThan(28);
    // The host refits the camera (a resize) before the next frame.
    cam.fov = 28;
    fx.restoreCamera(cam);
    expect(cam.fov).toBe(28);
  });
});
