import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TT_BUDGETS, TT_LIMITS } from "../../src/content/rules";
import type { Renderer3D } from "../../src/view/renderer";
import { VAN_KIEM, bladeGeometry, createSwords, type SwordPool } from "../../src/view/swords";
import { TRAIL_SAMPLE_S, createTrails, stripGeometry } from "../../src/view/trails";
import { SWORD_NOTCHES, swordsDown } from "../../src/view/bench/cases";

function fakeRenderer(): Renderer3D {
  return { layers: { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() } } as unknown as Renderer3D;
}

/** Every object and typed array the pool owns (what "no object after start" compares). */
function inventory(renderer: Renderer3D, pool: SwordPool): unknown[] {
  const objects: unknown[] = [];
  renderer.layers.fx.traverse((o) => {
    objects.push(o);
    const mesh = o as THREE.Mesh;
    if (mesh.geometry !== undefined) for (const attr of Object.values(mesh.geometry.attributes)) objects.push(attr, (attr as THREE.BufferAttribute).array);
  });
  for (const value of Object.values(pool as unknown as Record<string, unknown>)) if (ArrayBuffer.isView(value) || (value !== null && typeof value === "object")) objects.push(value);
  return objects;
}

const step = (pool: SwordPool, seconds: number, dt = 1 / 60): number => {
  let impacts = 0;
  for (let t = 0; t < seconds; t += dt) {
    pool.update(dt);
    impacts += pool.impactCount;
  }
  return impacts;
};

describe("vạn kiếm pool (canon §12.1, §20.2, §20.3)", () => {
  it("one shared pool of the tier's swords (150 / 300 / 500); a cast never takes more", () => {
    for (const q of ["low", "medium", "high"] as const) {
      const renderer = fakeRenderer();
      const pool = createSwords(renderer, TT_BUDGETS[q].swords);
      expect(pool.capacity).toBe(TT_BUDGETS[q].swords);
      expect(pool.cast(0, 1.6, -7.5, -10)).toBeLessThanOrEqual(pool.capacity);
      let most = 0;
      for (let k = 0; k < 120; k += 1) {
        pool.update(1 / 60);
        most = Math.max(most, pool.live);
      }
      expect(most).toBeLessThanOrEqual(pool.capacity);
      expect(most).toBeGreaterThan(pool.capacity * 0.9);
      pool.dispose();
    }
  });

  it("3 volleys 0.3 s apart meet over the target zone, stand, gather back and free their swords", () => {
    const pool = createSwords(fakeRenderer(), 300, { trails: false });
    const taken = pool.cast(0, 1.6, 7.5, -10);
    expect(taken).toBe(300);
    pool.update(0.001);
    expect(pool.live).toBe(100);
    step(pool, 0.3);
    expect(pool.live).toBe(200);
    step(pool, 0.3);
    expect(pool.live).toBe(300);
    // Every sword strikes inside the zone round the target, on the ground.
    let impacts = 0;
    let inside = true;
    for (let t = 0; t < 2; t += 1 / 60) {
      pool.update(1 / 60);
      for (let k = 0; k < pool.impactCount; k += 1) inside &&= Math.hypot(pool.impactX[k]! - 7.5, pool.impactZ[k]! + 10) <= VAN_KIEM.zoneM + 1e-4;
      impacts += pool.impactCount;
    }
    expect(inside).toBe(true);
    step(pool, 3);
    expect(impacts).toBeGreaterThanOrEqual(200);
    expect(pool.live).toBe(0);
    expect(pool.drawCalls()).toBe(0);
    pool.dispose();
  });

  it("an ally's cast takes its 0.4–0.6 share of the same pool, never extra swords (PB-34)", () => {
    const pool = createSwords(fakeRenderer(), 500, { trails: false });
    expect(pool.cast(0, 0, 5, -10, 0.5)).toBe(249);
    expect(pool.cast(3, 0, -5, -10, 0.6)).toBe(300);
    step(pool, 1);
    // 249 + 300 asked, 500 in the pool: the later volleys only got what was left, and nothing is free.
    expect(pool.live).toBe(500);
    expect(pool.volley(1000, 0, 0, 0, -5)).toBe(0);
    pool.dispose();
  });

  it("creates nothing after start: the same objects and arrays through many casts", () => {
    const renderer = fakeRenderer();
    const pool = createSwords(renderer, 150);
    const before = inventory(renderer, pool);
    for (let cast = 0; cast < 6; cast += 1) {
      pool.cast(cast % 2 === 0 ? -2 : 2, 1.6, cast % 2 === 0 ? -7.5 : 7.5, -10);
      step(pool, 4);
    }
    const after = inventory(renderer, pool);
    expect(after.length).toBe(before.length);
    after.forEach((item, k) => expect(item, "item " + k).toBe(before[k]));
    pool.dispose();
  });

  it("draws bodies, trails and glows in 3 calls; L1 halves the trail and keeps glows on half the swords", () => {
    const renderer = fakeRenderer();
    const pool = createSwords(renderer, 150, { vfxShare: 1 });
    pool.cast(0, 1.6, -7.5, -10);
    step(pool, 0.2);
    expect(pool.drawCalls()).toBe(3);
    const ribbon = renderer.layers.fx.getObjectByName("sword-trails") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const glow = renderer.layers.fx.getObjectByName("sword-glows") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(ribbon.material.uniforms.uVisible!.value).toBe(VAN_KIEM.trailSamples);
    expect(glow.material.uniforms.uGlowStep!.value).toBe(1);
    pool.setVfxShare(0.5);
    expect(ribbon.material.uniforms.uVisible!.value).toBe(VAN_KIEM.trailSamples / 2);
    expect(glow.material.uniforms.uGlowStep!.value).toBe(2);
    expect(pool.textureBytes()).toBe(150 * VAN_KIEM.trailSamples * 16);
    pool.dispose();
  });

  it("the placeholder blade is a few dozen triangles", () => {
    const blade = bladeGeometry();
    const tris = blade.getAttribute("position").count / 3;
    expect(tris).toBeGreaterThanOrEqual(8);
    expect(tris).toBeLessThanOrEqual(64);
    blade.computeBoundingBox();
    // Point to grip end: 0.9 of the blade length unit.
    expect(blade.boundingBox!.max.y - blade.boundingBox!.min.y).toBeCloseTo(VAN_KIEM.lengthM * 0.9, 5);
  });

  it("L2 lowers the tier's swords one notch (500 → 300 → 150 → 80), never under the floor", () => {
    expect(SWORD_NOTCHES).toEqual([500, 300, 150, 80]);
    expect(swordsDown(500)).toBe(300);
    expect(swordsDown(300)).toBe(150);
    expect(swordsDown(150)).toBe(80);
    expect(swordsDown(80)).toBe(TT_LIMITS.swordsFloor);
  });
});

describe("trails (one ring DataTexture, one instanced ribbon, one glow draw)", () => {
  it("builds a strip of quads between samples", () => {
    const strip = stripGeometry(4);
    expect(strip.index.length).toBe(3 * 6);
    expect(Array.from(strip.seg)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(Array.from(strip.side)).toEqual([-1, 1, -1, 1, -1, 1, -1, 1]);
  });

  it("records a sample every 1/60 s whatever the frame rate; the newest column follows the head", () => {
    const renderer = fakeRenderer();
    const trails = createTrails(renderer, 2, 4);
    const ribbon = renderer.layers.fx.getObjectByName("sword-trails") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const ring = (ribbon.material.uniforms.uRing!.value as THREE.DataTexture).image.data as unknown as Float32Array;
    trails.count = 1;
    trails.heads.set([1, 2, 3, 1], 0);
    trails.update(TRAIL_SAMPLE_S / 8);
    const head0 = ribbon.material.uniforms.uHead!.value as number;
    expect(Array.from(ring.slice(head0 * 4, head0 * 4 + 4))).toEqual([1, 2, 3, 1]);
    trails.heads.set([4, 5, 6, 1], 0);
    trails.update(TRAIL_SAMPLE_S / 8);
    // Same column (less than a sample later): it follows the head.
    expect(ribbon.material.uniforms.uHead!.value).toBe(head0);
    expect(Array.from(ring.slice(head0 * 4, head0 * 4 + 4))).toEqual([4, 5, 6, 1]);
    trails.update(TRAIL_SAMPLE_S);
    const head1 = ribbon.material.uniforms.uHead!.value as number;
    expect(head1).toBe((head0 + 1) % 4);
    // The old column froze where the head was.
    expect(Array.from(ring.slice(head0 * 4, head0 * 4 + 4))).toEqual([4, 5, 6, 1]);
    trails.reset(0);
    expect(Array.from(ring.slice(0, 16)).every((v) => v === 0)).toBe(true);
    expect(trails.drawCalls()).toBe(2);
    trails.dispose();
  });
});
