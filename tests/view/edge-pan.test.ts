import { describe, expect, it } from "vitest";
import { EDGE_PAN, panHome, resetPan, stepEdgePan, type PanInput, type PanState } from "../../src/view/edge-pan";

const input: PanInput = { pointer: { x: 960, y: 0 }, viewport: { left: 0, right: 1920, top: 0, bottom: 1080 }, banQuyet: { left: 0, right: 1920, top: 930, bottom: 1080 }, dt: 1 / 60, enabled: true, focused: true, zoom: 0, cutIn: false, reducedMotion: false };
function run(seconds: number, patch: Partial<PanInput> = {}, state: PanState = panHome(), fps = 60): PanState {
  for (let k = 0; k < Math.round(seconds * fps); k += 1) state = stepEdgePan(state, { ...input, ...patch, dt: 1 / fps });
  return state;
}

describe("D66 edge pan", () => {
  it("waits 0.15 s, accelerates and clamps at the northern and lateral limits", () => {
    const wait = run(0.15);
    expect(wait.z).toBe(EDGE_PAN.homeZ);
    const moving = run(0.1, {}, wait);
    expect(moving.z).toBeLessThan(wait.z);
    expect(moving.vz).toBeLessThan(0);
    expect(Math.abs(moving.vz)).toBeLessThan(12);
    const north = run(3);
    expect(north.z).toBe(-16.8);
    expect(north.vz).toBe(0);
    expect(run(3, { pointer: { x: 1920, y: 500 } }).x).toBe(4);
    expect(run(3, { pointer: { x: 0, y: 500 } }).x).toBe(-4);
  });

  it("scales by band depth, normalizes diagonals, and caps reduced motion at 6 m/s", () => {
    const speed = (s: PanState) => Math.hypot(s.vx, s.vz);
    const mid = { ...panHome(), x: 0, z: -12, dwell: 1 };
    expect(speed(stepEdgePan(mid, { ...input, pointer: { x: 1919, y: 1 }, dt: 0.1 }))).toBeLessThanOrEqual(12);
    const half = stepEdgePan(mid, { ...input, pointer: { x: 960, y: 12 }, dt: 0.2 });
    const full = stepEdgePan(mid, { ...input, dt: 0.2 });
    expect(half.vz / full.vz).toBeCloseTo(0.5, 8);
    const reduced = stepEdgePan(mid, { ...input, reducedMotion: true, dt: 0.2 });
    expect(reduced.vz / full.vz).toBeCloseTo(0.5, 8);
    expect(speed(reduced)).toBeLessThanOrEqual(6);
    const switching = stepEdgePan({ ...mid, vz: -12 }, { ...input, reducedMotion: true, dt: 1 / 60 });
    expect(speed(switching)).toBeLessThanOrEqual(6);
  });

  it("uses the actual Bàn Quyết top for the bottom band and never pans inside it", () => {
    const middle = { ...panHome(), z: -12, dwell: 1 };
    expect(run(0.1, { pointer: { x: 960, y: 929 } }, middle).vz).toBeGreaterThan(0);
    expect(run(0.1, { pointer: { x: 960, y: 940 } }, middle).z).toBe(-12);
    const raised = { left: 0, right: 1920, top: 800, bottom: 1080 };
    expect(run(0.1, { banQuyet: raised, pointer: { x: 960, y: 799 } }, middle).vz).toBeGreaterThan(0);
  });

  it("stops immediately on leave, blur, zoom, panels and cut-in", () => {
    const moving = run(0.3);
    for (const patch of [{ pointer: null }, { focused: false }, { zoom: 0.001 }, { enabled: false }, { cutIn: true }, { pointer: { x: 960, y: 940 } }]) {
      const stopped = stepEdgePan(moving, { ...input, ...patch });
      expect(stopped.x).toBe(moving.x);
      expect(stopped.z).toBe(moving.z);
      expect([stopped.vx, stopped.vz, stopped.dwell]).toEqual([0, 0, 0]);
    }
  });

  it("decelerates on release, holds its position and resets home in exactly 0.35 s", () => {
    const moving = run(0.3);
    const stopped = run(3, { pointer: { x: 960, y: 500 } }, moving);
    expect(stopped.z).toBeLessThan(moving.z);
    expect(stopped.z).toBeGreaterThan(-16.8);
    expect(Math.abs(stopped.vz)).toBeLessThan(1e-6);
    const home = run(0.35, { pointer: null }, resetPan(stopped));
    expect(home.x).toBe(0);
    expect(home.z).toBe(-7.55);
  });

  it("integrates dwell, acceleration and stopping consistently at 30/60/144 Hz", () => {
    const sample = (fps: number) => run(0.5, { pointer: { x: 960, y: 500 } }, run(0.5, {}, panHome(), fps), fps);
    const a = sample(30);
    for (const fps of [60, 144]) expect(sample(fps).z).toBeCloseTo(a.z, 8);
  });
});
