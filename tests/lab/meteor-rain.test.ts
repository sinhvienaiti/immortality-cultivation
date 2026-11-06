import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FALL_S, FIRST_S, GAP_S, MARK_S, METEORS, MeteorRain } from "../../src/lab/meteor-rain";
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

describe("the lab's slanted meteor rain (key M, canon D62)", () => {
  it("marks up to eight beasts and drops a meteor on each, 0.2 s after its mark, the first FIRST_S after the key, GAP_S apart, all within 2.5 s", () => {
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
    expect(r.impactAt[0]).toBeCloseTo(FIRST_S, 6);
    expect(FIRST_S).toBeGreaterThanOrEqual(MARK_S);
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
    // Long enough for the comet to read on its way down, its first fall starting after the key.
    expect(FALL_S).toBeLessThanOrEqual(0.35);
    expect(FIRST_S - FALL_S).toBeGreaterThan(0);
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
