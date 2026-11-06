import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FALL_S, FIRST_S, MARK_S, MAX_BURNS, MeteorRain } from "../../src/lab/meteor-rain";
import { MAX_BLASTS, METEOR_SIZES, SHOWER, type MeteorSize } from "../../src/lab/meteor-plan";
import { cometHeading } from "../../src/lab/comet-head";
import { parseFlipbookManifest } from "../../src/view/skills/flipbook";
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

describe("the lab's meteor shower (key M, canon D62; owner 06/11 12:50)", () => {
  it("drops 18–24 meteors over about 6.5 s, each on time, marked MARK_S before it, the first big and the last the king", () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
    cam.position.set(0, 26, 14);
    cam.lookAt(0, 0, -6);
    cam.updateMatrixWorld(true);
    const stage = new ElementStage({ layer: new THREE.Group(), camera: cam, quality: "high", textures: {} as never, texture: () => new THREE.Texture(), vfxBase: "/v/" });
    // Twelve beasts spread wide.
    const herd = field(Array.from({ length: 12 }, (_, k) => [(k % 6) * 5 - 12, Math.floor(k / 6) * 6 - 12] as const));
    const blows: { t: number; i: number; dx: number; dz: number }[] = [];
    const strikes: { t: number; at: THREE.Vector3; size: MeteorSize; first: boolean }[] = [];
    const marks: { t: number; delay: number }[] = [];
    let t = 0;
    const rain = new MeteorRain({
      targets: herd, stage, camera: cam, layer: new THREE.Group(),
      kit: () => elementById("water")!, pal: () => elementById("water")!.palette as never,
      caster: (out) => out.set(0, 0, 3),
      prepareMark: () => {},
      mark: (_f, _x, _z, _s, delay) => (marks.push({ t, delay }), true),
      release: () => {},
      blow: (i, dx, dz) => (blows.push({ t, i, dx, dz }), herd.hit(i, 0, 1, 1, 0)),
      strike: (at, _role, size, first) => strikes.push({ t, at: at.clone(), size, first }),
      status: () => {},
    });
    const n = rain.cast();
    expect(n).toBeGreaterThanOrEqual(SHOWER.min);
    expect(n).toBeLessThanOrEqual(SHOWER.max);
    const r = rain.last!;
    expect(r.impactAt[0]).toBeCloseTo(FIRST_S, 6);
    expect(FIRST_S - FALL_S).toBeGreaterThan(0);
    for (let k = 1; k < n; k += 1) {
      const gap = r.impactAt[k]! - r.impactAt[k - 1]!;
      expect(gap).toBeGreaterThanOrEqual(SHOWER.gapMin - 1e-9);
      expect(gap).toBeLessThanOrEqual(SHOWER.gapMax + 1e-9);
    }
    // The whole shower lands inside 5–8 s of the key.
    expect(r.impactAt.at(-1)!).toBeGreaterThanOrEqual(5);
    expect(r.impactAt.at(-1)!).toBeLessThanOrEqual(8);
    expect(r.classes[0]).toBe("big");
    expect(r.classes.at(-1)).toBe("king");
    expect(r.maxBlasts).toBeLessThanOrEqual(MAX_BLASTS);
    for (let f = 0; f < 9 * 60; f += 1) {
      t += 1 / 60;
      rain.update(1 / 60);
    }
    // Every meteor lands within a frame of its time, as big as its class; its mark came MARK_S before it.
    expect(strikes.length).toBe(n);
    strikes.forEach((s, k) => {
      expect(Math.abs(s.t - r.impactAt[k]!)).toBeLessThanOrEqual(1 / 60 + 1e-9);
      expect(s.size).toBe(METEOR_SIZES[r.classes[k]!]);
      expect(s.first).toBe(k === 0);
    });
    expect(marks.length).toBe(n);
    marks.forEach((m, k) => expect(m.t + m.delay).toBeCloseTo(r.impactAt[k]! - MARK_S, 1));
    // Each blow drives its beast away from the meteor's heart (a unit direction).
    for (const b of blows) expect(Math.hypot(b.dx, b.dz)).toBeCloseTo(1, 6);
    expect(r.points.length).toBe(n);
    expect(r.maxBurns).toBeLessThanOrEqual(MAX_BURNS);
    expect(rain.active).toBe(false);
  });

  it("reads a comet clip's head and tail from its manifest entry, and turns its card so the head leads", () => {
    const metas = parseFlipbookManifest({ version: 1, flipbooks: {
      "fire-comet": { file: "fire-comet.atlas.png", cols: 4, rows: 8, frames: 24, cell: [384, 216], role: "comet", loop: true, mode: "fire", head: [0.74, 0.76], dir: [-0.85, -0.53] },
      "bad-comet": { file: "bad-comet.atlas.png", cols: 1, rows: 1, role: "comet", head: [1.4, 0.5], dir: [1, 0] },
      // lab-flipbooks' form (06/11): the head in the frame and in the cell, the tail as a vector with its angle.
      "water-comet": { file: "water-comet.atlas.png", cols: 8, rows: 4, frames: 32, cell: [640, 360], role: "comet", head: { uv: [0.719, 0.734], px: [1380.5, 792.7], cellUv: [0.77, 0.7374] }, dir: { deg: -151.2, vec: [-0.8767, -0.4811] } },
    } }, "/v/fire/");
    const c = metas.get("fire-comet")!.comet!;
    expect(c.head).toEqual([0.74, 0.76]);
    expect(Math.hypot(c.tail[0], c.tail[1])).toBeCloseTo(1, 6);
    const wc = metas.get("water-comet")!.comet!;
    expect(wc.head).toEqual([0.719, 0.734]);
    expect(wc.cell).toEqual([0.77, 0.7374]);
    expect(wc.tail[0]).toBeCloseTo(-0.8767, 3);
    // A head outside the frame is no comet axis.
    expect(metas.get("bad-comet")!.comet).toBeUndefined();
    // The tail up and to the left in the frame (y down): it flies down and to the right, about 32° below the frame's right.
    expect((cometHeading(c.tail) * 180) / Math.PI).toBeCloseTo(-31.9, 0);
    // A tail straight left: it flies right (0); straight up (y down −1): it flies down (−90°).
    expect(cometHeading([-1, 0])).toBeCloseTo(0, 6);
    expect(cometHeading([0, -1])).toBeCloseTo(-Math.PI / 2, 6);
  });
});
