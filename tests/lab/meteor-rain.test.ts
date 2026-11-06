import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FALL_S, GAP_S, MARK_S, METEORS, MeteorRain } from "../../src/lab/meteor-rain";
import { ElementStage } from "../../src/view/skills/element-stage";
import { elementById } from "../../src/view/skills/elements";
import type { TargetField } from "../../src/view/skills/targets";

/** Beasts at fixed points (none move); a hit kills on the second blow. */
function field(pts: readonly (readonly [number, number])[]): TargetField & { hp: number[] } {
  const hp = pts.map(() => 2);
  return {
    hp,
    size: pts.length,
    alive: (i) => hp[i]! > 0,
    x: (i) => pts[i]![0],
    z: (i) => pts[i]![1],
    midY: () => 0.5,
    radius: () => 0.4,
    tier: () => 0,
    nearest(x, z, maxR) {
      let best = -1;
      let bd = maxR;
      pts.forEach(([px, pz], i) => {
        const d = Math.hypot(px - x, pz - z);
        if (hp[i]! > 0 && d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    },
    inCircle(x, z, r, out) {
      let n = 0;
      pts.forEach(([px, pz], i) => {
        if (hp[i]! > 0 && Math.hypot(px - x, pz - z) <= r + 0.4) out[n++] = i;
      });
      return n;
    },
    inCapsule: () => 0,
    hit(i) {
      hp[i] = hp[i]! - 1;
      return hp[i]! <= 0;
    },
  };
}

describe("the lab's slanted meteor rain (key M, canon D62)", () => {
  it("marks up to eight beasts and drops a meteor on each, 0.2 s after its mark, GAP_S apart, all within 2.5 s", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
    cam.position.set(0, 26, 14);
    cam.lookAt(0, 0, -6);
    cam.updateMatrixWorld(true);
    const stage = new ElementStage({ layer: new THREE.Group(), camera: cam, quality: "high", textures: {} as never, texture: () => new THREE.Texture(), vfxBase: "/v/" });
    // Twelve beasts spread wide (one meteor each, at most eight).
    const herd = field(Array.from({ length: 12 }, (_, k) => [(k % 6) * 5 - 12, Math.floor(k / 6) * 6 - 12] as const));
    const blows: { t: number; i: number }[] = [];
    const strikes: { t: number; role: string }[] = [];
    const marks: { delay: number; life: number }[] = [];
    let t = 0;
    const rain = new MeteorRain({
      targets: herd, stage, camera: cam, layer: new THREE.Group(),
      kit: () => elementById("water")!, pal: () => elementById("water")!.palette as never,
      caster: (out) => out.set(0, 0, 3),
      prepareMark: () => {},
      mark: (_f, _x, _z, _s, delay, life) => (marks.push({ delay, life }), true),
      release: () => {},
      blow: (i) => (blows.push({ t, i }), herd.hit(i, 0, 1, 1, 0)),
      strike: (_at, role) => strikes.push({ t, role }),
      status: () => {},
    });
    expect(rain.cast()).toBe(METEORS);
    const r = rain.last!;
    expect(r.impactAt[0]).toBeCloseTo(MARK_S, 6);
    for (let k = 1; k < r.impactAt.length; k += 1) expect(r.impactAt[k]! - r.impactAt[k - 1]!).toBeCloseTo(GAP_S, 6);
    expect(r.impactAt.at(-1)!).toBeLessThanOrEqual(2.5);
    for (let k = 0; k < marks.length; k += 1) expect(r.impactAt[k]! - marks[k]!.delay).toBeCloseTo(MARK_S, 6);
    for (let f = 0; f < 180; f += 1) {
      t += 1 / 60;
      rain.update(1 / 60);
    }
    // Every meteor lands within a frame of its time, each on its own beast; the first is the primary blow.
    expect(strikes.length).toBe(METEORS);
    strikes.forEach((s, k) => expect(Math.abs(s.t - r.impactAt[k]!)).toBeLessThanOrEqual(1 / 60 + 1e-9));
    expect(strikes[0]!.role).toBe("primary");
    expect(new Set(blows.map((b) => b.i)).size).toBe(blows.length);
    expect(blows.length).toBe(METEORS);
    expect(FALL_S).toBeLessThanOrEqual(0.25);
    expect(rain.active).toBe(false);
  });
});
