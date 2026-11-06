import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CRESCENT, CrescentSample, FIRE_FIVE, FIVE, FivePhase, type FiveHost } from "../../src/lab/five-phase";
import { ElementStage } from "../../src/view/skills/element-stage";
import type { ImpactRole } from "../../src/view/screen-fx";

/** A lab stand-in: beasts at fixed points, a caster at (0, 3), every call logged. */
function lab(pts: readonly (readonly [number, number])[]) {
  const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  cam.position.set(0, 26, 14);
  cam.lookAt(0, 0, -6);
  cam.updateMatrixWorld(true);
  const stage = new ElementStage({ layer: new THREE.Group(), camera: cam, quality: "high", textures: {} as never, texture: () => new THREE.Texture(), vfxBase: "/v/" });
  const hp = pts.map(() => 3);
  const log = { blows: [] as { slot: string; i: number; role: ImpactRole; dx: number; dz: number }[], strikes: [] as { slot: string; role: ImpactRole }[],
    status: [] as { i: number; seconds: number }[], glow: [] as number[], kicks: 0, lights: 0, launched: [] as number[] };
  const host: FiveHost = {
    stage, layer: new THREE.Group(), camera: cam,
    alive: (i) => hp[i]! > 0,
    x: (i) => pts[i]![0],
    z: (i) => pts[i]![1],
    midY: () => 0.5,
    radius: () => 0.4,
    inCapsule(ax, az, bx, bz, halfW, out) {
      let n = 0;
      const lx = bx - ax;
      const lz = bz - az;
      const l2 = lx * lx + lz * lz || 1;
      pts.forEach(([px, pz], i) => {
        if (hp[i]! <= 0) return;
        const t = Math.min(1, Math.max(0, ((px - ax) * lx + (pz - az) * lz) / l2));
        if (Math.hypot(px - (ax + lx * t), pz - (az + lz * t)) <= halfW + 0.4) out[n++] = i;
      });
      return n;
    },
    inCircle(x, z, r, out) {
      let n = 0;
      pts.forEach(([px, pz], i) => {
        if (hp[i]! > 0 && Math.hypot(px - x, pz - z) <= r + 0.4) out[n++] = i;
      });
      return n;
    },
    launch: (i) => log.launched.push(i),
    status: (i, _k, seconds) => log.status.push({ i, seconds }),
    blow(slot, i, dx, dz, _power, role) {
      log.blows.push({ slot, i, role, dx, dz });
      hp[i] = hp[i]! - 1;
      return hp[i]! <= 0;
    },
    strike: (slot, _at, role) => log.strikes.push({ slot, role }),
    kick: () => (log.kicks += 1),
    light: () => (log.lights += 1),
    glow: (_rgb, k) => log.glow.push(k),
    hand: (out) => out.set(0.3, 1.3, 2.6),
    blade: (a, b) => (a.set(0.3, 1.2, 2.6), b.set(0.3, 1.4, 1.6), true),
  };
  return { host, log, hp };
}

describe("the five-phase samples (skill-five-phase-samples.md)", () => {
  it("key 2's crescent pierces the line: each beast on it struck once, in order, the first the primary blow, none off it", () => {
    // Four beasts on the line ahead of the caster (0, 3 → 0, −8), one well off it.
    const { host, log } = lab([[0, -1], [0.6, -4], [-0.5, -7], [0, -10.5], [6, -5]]);
    const five = new FivePhase(host, FIRE_FIVE);
    const crescent = new CrescentSample(host, five);
    crescent.cast(0, 3, 0, -8);
    // The release on the cast's frame: the kick and the light at the tip, the caster's rim out.
    expect(log.kicks).toBe(1);
    expect(log.lights).toBe(1);
    expect(five.audit.release).toBe(1);
    for (let f = 0; f < 60; f += 1) {
      crescent.update(1 / 60);
      five.update(1 / 60);
    }
    expect(log.blows.map((b) => b.i)).toEqual([0, 1, 2, 3]);
    expect(log.blows.every((b) => b.slot === "k2" && Math.abs(b.dz + 1) < 1e-6)).toBe(true);
    expect(log.blows[0]!.role).toBe("primary");
    expect(log.blows.slice(1).every((b) => b.role === "secondary")).toBe(true);
    // Its first blow and its landing take the screen's tiers; the struck burn for FIVE.burnS.
    expect(log.strikes).toEqual([{ slot: "k2", role: "primary" }, { slot: "k2", role: "finisher" }]);
    expect(log.status.every((s) => s.seconds === FIVE.burnS)).toBe(true);
    expect(crescent.last!.landedAt).toBeCloseTo(CRESCENT.lengthM / CRESCENT.speed, 1);
    // The line's burn and the landing's: two aftermaths.
    expect(five.audit.aftermath).toBe(2);
    expect(crescent.active).toBe(false);
  });

  it("key 2's crescent (round 2) is wider, and its end bursts: the beasts there struck as the finisher and flung away", () => {
    expect(CRESCENT.size).toBeGreaterThan(3.6);
    // One beast 2.5 m off the line (struck now: under the wider crescent), two at its end (the tip at z 1.6, 16 m on).
    const { host, log } = lab([[2.5, -5], [0.3, -13.6], [1.8, -15.2]]);
    const five = new FivePhase(host, FIRE_FIVE);
    const crescent = new CrescentSample(host, five);
    crescent.cast(0, 3, 0, -8);
    for (let f = 0; f < 60; f += 1) {
      crescent.update(1 / 60);
      five.update(1 / 60);
    }
    // The pierce strikes all three as it passes; its end strikes the two there again, as the finisher, and flings them.
    expect(log.blows.filter((b) => b.role !== "finisher").map((b) => b.i).sort()).toEqual([0, 1, 2]);
    const fin = log.blows.filter((b) => b.role === "finisher");
    expect(fin.map((b) => b.i).sort()).toEqual([1, 2]);
    // Flung away from the end: the one beyond it outward along +x.
    expect(fin.find((b) => b.i === 2)!.dx).toBeGreaterThan(0.5);
    expect(log.launched.sort()).toEqual([1, 2]);
  });

  it("the charge glows the caster while a word is typed and puts it out at the release", () => {
    const { host, log } = lab([[0, -6]]);
    const five = new FivePhase(host, FIRE_FIVE);
    for (let f = 0; f < 12; f += 1) {
      five.chargeFrame(f / 12, 0, 3, 1 / 60, false);
      five.update(1 / 60);
    }
    expect(five.audit.charge).toBe(12);
    expect(log.glow.at(-1)!).toBeGreaterThan(0.5);
    five.release(new THREE.Vector3(0.3, 1.3, 2.6), 0, -1, 0, 3, false);
    expect(log.glow.at(-1)).toBe(0);
  });
});
