import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FIELD, FORMATION, STAGE_M0A } from "../../src/content/rules";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { createCrowd } from "../../src/view/crowd";
import type { Renderer3D } from "../../src/view/renderer";
import { HERD_MIX, Herd, benchRandom } from "../../src/view/bench/herd";
import { BENCH_COUNTS } from "../../src/view/bench/cases";

function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

describe("bench herd (canon §20.3 cases A, B)", () => {
  for (const n of BENCH_COUNTS) {
    it("puts N = " + n + " beasts on the field, 5 species × N/5, swarm in clusters of 7", () => {
      const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: n + 8 });
      const herd = new Herd(crowd, n, benchRandom(1));
      expect(crowd.size).toBe(n);
      const species = herd.species();
      expect(Object.keys(species).sort()).toEqual([...HERD_MIX].sort());
      for (const s of HERD_MIX) expect(species[s]).toBeGreaterThanOrEqual(Math.floor(n / 5));
      const swarm = herd.beasts.filter((b) => b.species === "thach-thu");
      expect(new Set(swarm.map((b) => b.cluster)).size).toBe(Math.ceil(swarm.length / STAGE_M0A.clusterSize));
      crowd.dispose();
    });
  }

  it("keeps N on screen for 30 s of frames: beasts walk in, get hit, dissolve and come back", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 128 });
    const herd = new Herd(crowd, 120, benchRandom(7));
    const serials = new Set(herd.beasts.map((b) => b.serial));
    let dying = 0;
    let inside = 0;
    let finite = true;
    let sizes = true;
    for (let frame = 0; frame < 30 * 60; frame += 1) {
      herd.update(1 / 60);
      crowd.update(1 / 60);
      sizes &&= crowd.size === 120;
      for (const b of herd.beasts) {
        if (b.phase === 2) dying += 1;
        if (Math.hypot(b.x, b.z) < FORMATION.barrierRadiusMm / 1000) inside += 1;
        finite &&= Number.isFinite(b.x) && Number.isFinite(b.z);
      }
    }
    expect(sizes).toBe(true);
    expect(finite).toBe(true);
    for (const b of herd.beasts) serials.add(b.serial);
    // Deaths happened and the dead came back with new serials.
    expect(dying).toBeGreaterThan(0);
    expect(serials.size).toBeGreaterThan(120);
    expect(inside).toBeGreaterThan(0);
    crowd.dispose();
  });

  it("is the same run for the same seed (view-only RNG)", () => {
    const run = () => {
      const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 70 });
      const herd = new Herd(crowd, 60, benchRandom(42));
      for (let frame = 0; frame < 600; frame += 1) herd.update(1 / 60);
      const out = herd.beasts.map((b) => [Math.round(b.x * 1000), Math.round(b.z * 1000), b.serial]);
      crowd.dispose();
      return out;
    };
    expect(run()).toEqual(run());
  });
});

/** Distance to the authored lane, independent of the herd's route builder. */
function laneDistance(x: number, z: number): number {
  const points = THANH_THACH_AI.field.lane!.pointsMm;
  let nearest = Infinity;
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const ax = a.xMm / 1000, az = a.zMm / 1000;
    const dx = (b.xMm - a.xMm) / 1000, dz = (b.zMm - a.zMm) / 1000;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return nearest;
}

describe("bench herd on map=lane", () => {
  it("scatters every ground spawn along the authored lane, including swarm members and respawns", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 128 });
    const herd = new Herd(crowd, 90, benchRandom(20_261_025), "lane");
    herd.hitsPerSecond = 0;
    const ground = herd.beasts.filter((b) => !b.flyer);
    const initial = ground.map((b) => [b.x, b.z]);
    const check = () => {
      for (const b of ground) expect(laneDistance(b.x, b.z)).toBeLessThanOrEqual(6);
      // Occupy the length of the lane, rather than a pile at its gate or heart.
      expect(Math.max(...ground.map((b) => b.z)) - Math.min(...ground.map((b) => b.z))).toBeGreaterThan(25);
      expect(ground.some((b) => b.side < -3)).toBe(true);
      expect(ground.some((b) => b.side > 3)).toBe(true);
    };
    check();
    herd.update(0);
    check();
    for (const b of ground) { b.phase = 2; b.t = 0; }
    herd.update(0.61);
    check();
    expect(ground.map((b) => [b.x, b.z])).not.toEqual(initial);
    // With hits disabled, ground beasts still reach the heart and retire normally.
    let stood = false;
    for (let k = 0; k < 30 * 60; k += 1) {
      herd.update(1 / 60);
      stood ||= ground.some((b) => b.phase === 1);
      for (const b of ground) expect(Number.isFinite(b.x + b.z)).toBe(true);
    }
    expect(stood).toBe(true);
    crowd.dispose();
  });

  it("keeps the sky-entry flight route when the ground uses the lane", () => {
    const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 128 });
    const herd = new Herd(crowd, 90, benchRandom(37), "lane");
    herd.hitsPerSecond = 0;
    const flyers = herd.beasts.filter((b) => b.flyer);
    expect(flyers).toHaveLength(18);
    for (const b of flyers) { b.phase = 2; b.t = 0; }
    herd.update(0.61);
    for (const b of flyers) {
      expect(FIELD.skyEntries.some((e) => {
        const ex = e.xMm / 1000, ez = e.zMm / 1000;
        return b.x >= Math.min(ex, ex - Math.sign(ex) * 6) && b.x <= Math.max(ex, ex - Math.sign(ex) * 6)
          && b.z >= ez && b.z <= ez + 3;
      })).toBe(true);
    }
    const distances = flyers.map((b) => Math.hypot(b.x, b.z));
    herd.update(1 / 60);
    for (let i = 0; i < flyers.length; i += 1) {
      expect(Math.hypot(flyers[i]!.x, flyers[i]!.z)).toBeLessThan(distances[i]!);
    }
    crowd.dispose();
  });

  it("repeats lane positions and respawns with the same seed", () => {
    const run = (seed: number) => {
      const crowd = createCrowd(fakeRenderer(), "procedural", { capacity: 128 });
      const herd = new Herd(crowd, 90, benchRandom(seed), "lane");
      for (let k = 0; k < 600; k += 1) herd.update(1 / 60);
      const positions = herd.beasts.map((b) => [b.x, b.z, b.serial]);
      crowd.dispose();
      return positions;
    };
    expect(run(37)).toEqual(run(37));
    expect(run(38)).not.toEqual(run(37));
  });
});
