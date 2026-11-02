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

  it("never flashes or shakes a finisher past its tier's row of the table", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    cam.position.set(0, 40, 30);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    for (const tier of ["skill", "ultimate"] as const) {
      const fx = new ScreenFx(host());
      fx.impact(tier, "finisher");
      fx.update(1e-6, cam);
      expect(fx.shown.flash).toBeLessThanOrEqual(SCREEN_TIERS[tier].flash + 1e-6);
      expect(fx.shown.shakePx).toBeLessThanOrEqual(SCREEN_TIERS[tier].shakePx + 1e-6);
    }
  });

  it("never lets an older blow stop or slow the world in the 50 ms after a release", () => {
    const fx = new ScreenFx(host());
    // The key: a release cuts. An older skill's finisher lands on the next frame and must not hold the release.
    fx.cut();
    fx.impact("ultimate", "finisher");
    expect(fx.stopping).toBe(false);
    let world = 0;
    for (let i = 0; i < 3; i += 1) world += fx.advance(1 / 60);
    expect(world).toBeCloseTo(3 / 60, 6);
    // Past the guard, blows stop the world again.
    fx.advance(1 / 60);
    fx.impact("skill", "primary");
    expect(fx.stopping).toBe(true);
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
    fx.update(1 / 60, cam);
    expect(fx.shown.shakePx).toBeGreaterThan(0.5);
    for (let i = 0; i < 6; i += 1) fx.update(1 / 60, cam);
    expect(fx.shown.shakePx).toBe(0);
    fx.intensity = 0;
    fx.impact("ultimate", "finisher");
    fx.darken(0.28, 0.45);
    fx.update(1 / 60, cam);
    expect(fx.shown.shakePx).toBe(0);
    expect(fx.shown.dark).toBe(0);
    expect(fx.shown.flash).toBe(0);
  });

  it("never leaves a punch or roll on a camera the host placed again", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    const fx = new ScreenFx(host());
    fx.impact("ultimate", "finisher");
    fx.update(0.05, cam);
    fx.applyCamera(cam);
    expect(cam.fov).toBeLessThan(28);
    // The host refits the camera (a resize) before the next frame.
    cam.fov = 28;
    fx.restoreCamera(cam);
    expect(cam.fov).toBe(28);
  });
});

describe("screen dramaturgy (power pass round 2)", () => {
  const cam = (): THREE.PerspectiveCamera => {
    const c = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    c.position.set(0, 40, 30);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  };

  it("darkens the world through its lights when the host has the hook, and gives them back", () => {
    const h = host();
    const sent: number[] = [];
    const fx = new ScreenFx({ ...h, worldLight: (k) => sent.push(k) });
    const c = cam();
    fx.holdDark(SCREEN_TIERS.ultimate.hold);
    for (let i = 0; i < 40; i += 1) fx.update(1 / 60, c);
    expect(sent.at(-1)).toBeCloseTo(1 - SCREEN_TIERS.ultimate.hold, 2);
    expect(fx.shown.desat).toBeGreaterThan(0.3);
    fx.holdDark(0);
    for (let i = 0; i < 60; i += 1) fx.update(1 / 60, c);
    expect(sent.at(-1)).toBe(1);
    fx.holdDark(0.5);
    for (let i = 0; i < 10; i += 1) fx.update(1 / 60, c);
    fx.reset();
    expect(sent.at(-1)).toBe(1);
  });

  it("flashes the basic blow and slot 1 locally, never the whole screen", () => {
    const fx = new ScreenFx(host());
    const c = cam();
    fx.impact("basic", "primary");
    fx.localFlash(0, 1, -5, "basic");
    fx.release("skill", true);
    fx.impact("skill", "primary");
    fx.localFlash(0, 1, -5, "skill");
    fx.update(1e-6, c);
    expect(fx.shown.flash).toBe(0);
    expect(fx.shown.dark).toBe(0);
    expect(fx.shown.local).toBeGreaterThan(0.3);
  });

  it("lands the climax as a sharp flash of three frames, a short zoom blur and a fringe", () => {
    const fx = new ScreenFx(host());
    const c = cam();
    fx.focus(0, 0.5, -6);
    fx.impact("ultimate", "finisher");
    // At 60 Hz: the full flash on the first drawn frame, then 0.19 and 0.05, then none (the documented three frames).
    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      fx.update(1 / 60, c);
      seen.push(fx.shown.flash);
      if (i === 0) {
        expect(fx.shown.blur).toBeCloseTo(SCREEN_TIERS.ultimate.blur, 3);
        expect(fx.shown.split).toBeCloseTo(SCREEN_TIERS.ultimate.splitPx, 3);
      }
    }
    expect(seen[0]).toBeCloseTo(SCREEN_TIERS.ultimate.flash, 3);
    expect(seen[1]).toBeCloseTo(SCREEN_TIERS.ultimate.flash * (4 / 9), 3);
    expect(seen[2]).toBeCloseTo(SCREEN_TIERS.ultimate.flash * (1 / 9), 3);
    expect(seen[3]).toBe(0);
    for (let i = 0; i < 3; i += 1) fx.update(1 / 60, c);
    expect(fx.shown.blur).toBe(0);
  });

  it("shows the climax's full flash on its first frame at any frame rate", () => {
    for (const hz of [30, 60, 144]) {
      const fx = new ScreenFx(host());
      fx.impact("ultimate", "finisher");
      fx.update(1 / hz, cam());
      expect(fx.shown.flash).toBeCloseTo(SCREEN_TIERS.ultimate.flash, 3);
      fx.localFlash(0, 1, -5, "skill");
      fx.update(1 / hz, cam());
      expect(fx.shown.local).toBeCloseTo(SCREEN_TIERS.skill.local, 3);
    }
  });

  it("holds a rumble floor without stacking it into the shake's peak", () => {
    const fx = new ScreenFx(host());
    const c = cam();
    for (let i = 0; i < 30; i += 1) {
      fx.rumble(2.6, 0.14);
      fx.update(1 / 60, c);
    }
    expect(fx.shown.shakePx).toBeCloseTo(2.6, 1);
    for (let i = 0; i < 12; i += 1) fx.update(1 / 60, c);
    expect(fx.shown.shakePx).toBe(0);
  });
});
