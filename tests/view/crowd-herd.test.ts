import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FORMATION, STAGE_M0A } from "../../src/content/rules";
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
