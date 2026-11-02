import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CameraZoom, ZOOM } from "../../src/view/camera-zoom";
import type { CameraFit } from "../../src/view/renderer";

const FIT = { tiltDeg: 55, distanceM: 53.5, targetZ: -6 } as unknown as CameraFit;

describe("big skills never leave the frame (power pass round 2)", () => {
  it("eases a zoomed-in view out to the whole field within 0.25 s, holds it, and gives the player's zoom back", () => {
    const z = new CameraZoom();
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    z.set(1);
    z.update(cam, FIT, 0, 0, 3, 1 / 60);
    const close = cam.position.y;
    z.holdWide(true);
    for (let i = 0; i < Math.ceil(ZOOM.wideInS * 60); i += 1) z.update(cam, FIT, 0, 0, 3, 1 / 60);
    expect(z.wideShown).toBe(1);
    expect(cam.position.y).toBeCloseTo(Math.sin((55 * Math.PI) / 180) * FIT.distanceM, 3);
    // The player zooms out a little while it holds: the view comes back to that, not to 1.
    z.zoomOut();
    for (let i = 0; i < 60; i += 1) z.update(cam, FIT, 0, 0, 3, 1 / 60);
    expect(z.wideShown).toBe(1);
    z.holdWide(false);
    for (let i = 0; i < 60; i += 1) z.update(cam, FIT, 0, 0, 3, 1 / 60);
    expect(z.wideShown).toBe(0);
    expect(z.value).toBeCloseTo(1 - ZOOM.step, 3);
    expect(cam.position.y).toBeGreaterThan(close);
  });

  it("pushes in a few per cent and back at the field fit", () => {
    const z = new CameraZoom();
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    z.update(cam, FIT, 0, 0, 3, 1 / 60);
    const y0 = cam.position.y;
    z.push();
    let low = y0;
    for (let i = 0; i < 40; i += 1) {
      z.update(cam, FIT, 0, 0, 3, 1 / 60);
      low = Math.min(low, cam.position.y);
    }
    expect(low).toBeLessThan(y0 * (1 - ZOOM.pushShare * 0.9));
    expect(cam.position.y).toBeCloseTo(y0, 4);
  });
});
