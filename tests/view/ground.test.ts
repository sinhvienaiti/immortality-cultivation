import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { THANH_THACH_AI as stage } from "../../src/content/data/stage-m0a";
import type { StageDef } from "../../src/content/types";
import { corridors, createGround, GROUND_EXTENT, GROUND_TEXTURE_URLS, groundGeometry, segmentDistance } from "../../src/view/ground";
import { fitCamera, placeCamera, VIEW } from "../../src/view/renderer";

describe("387b authored ground", () => {
  it("requests exactly the six 383b WebP tiles, configures sampling and releases them with the material", () => {
    const textures: THREE.Texture[] = [];
    const load = vi.fn(() => { const texture = new THREE.Texture(); textures.push(texture); return texture; });
    const ground = createGround(stage, { textureLoader: { load } });
    // No media reads: WebP files are intentionally outside Git.
    expect(load.mock.calls).toEqual([
      ["/assets/immortality-cultivation/ground/thanh-thach/lane-paving.v2.webp"],
      ["/assets/immortality-cultivation/ground/thanh-thach/court-paving.v2.webp"],
      ["/assets/immortality-cultivation/ground/thanh-thach/court-cracked.v2.webp"],
      ["/assets/immortality-cultivation/ground/thanh-thach/formation-worn.v2.webp"],
      ["/assets/immortality-cultivation/ground/thanh-thach/moss-patch.v2.webp"],
      ["/assets/immortality-cultivation/ground/thanh-thach/rubble-edge.v2.webp"],
    ]);
    expect(Object.values(GROUND_TEXTURE_URLS)).toHaveLength(6);
    const field = ground.getObjectByName("ground-field") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(field.material.uniforms.uHalfM!.value).toBe(stage.field.lane!.halfWidthMm / 1000);
    expect(field.material.uniforms.uTileM!.value).toBe(4);
    for (const texture of textures) {
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect([texture.wrapS, texture.wrapT]).toEqual([THREE.RepeatWrapping, THREE.RepeatWrapping]);
      expect(texture.anisotropy).toBe(8);
    }
    const disposed = textures.map((texture) => vi.spyOn(texture, "dispose"));
    field.material.dispose();
    for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
    field.geometry.dispose();
  });

  it("bakes lane distances from stage.field.lane.pointsMm and follows changed stage points", () => {
    const list = corridors(stage);
    const points = stage.field.lane!.pointsMm;
    expect(list).toEqual(points.slice(1).map((p, i) => ({ ax: points[i]!.xMm / 1000, az: points[i]!.zMm / 1000, bx: p.xMm / 1000, bz: p.zMm / 1000 })));
    const moved: StageDef = { ...stage, field: { ...stage.field, lane: { ...stage.field.lane!, pointsMm: [{ xMm: 12000, zMm: -60000 }, { xMm: 12000, zMm: 16000 }] } } };
    for (const definition of [stage, moved]) {
      const geometry = groundGeometry(definition);
      const position = geometry.getAttribute("position"), distance = geometry.getAttribute("laneDistance");
      const segments = corridors(definition);
      for (let i = 0; i < position.count; i += 173) {
        const expected = Math.min(...segments.map((c) => segmentDistance(position.getX(i), position.getZ(i), c.ax, c.az, c.bx, c.bz)));
        expect(distance.getX(i)).toBeCloseTo(expected, 4);
      }
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.x).toBe(GROUND_EXTENT.minX);
      expect(geometry.boundingBox!.max.x).toBe(GROUND_EXTENT.maxX);
      expect(geometry.boundingBox!.min.z).toBe(GROUND_EXTENT.minZ);
      expect(geometry.boundingBox!.max.z).toBe(GROUND_EXTENT.maxZ);
      geometry.dispose();
    }
  });

  it("covers all four camera corners at every pan clamp at 1080p and 720p", () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    for (const [width, height] of [[1920, 1080], [1280, 720]]) {
      const camera = new THREE.PerspectiveCamera();
      fitCamera(camera, width! / height!);
      for (const x of [-4, 0, 4]) for (const z of [-16.8, -7.55]) {
        placeCamera(camera, VIEW.tiltDeg, VIEW.distanceM, x, z);
        for (const nx of [-1, 1]) for (const ny of [-1, 1]) {
          ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
          const p = ray.ray.intersectPlane(plane, new THREE.Vector3())!;
          expect(p.x).toBeGreaterThanOrEqual(GROUND_EXTENT.minX);
          expect(p.x).toBeLessThanOrEqual(GROUND_EXTENT.maxX);
          expect(p.z).toBeGreaterThanOrEqual(GROUND_EXTENT.minZ);
          expect(p.z).toBeLessThanOrEqual(GROUND_EXTENT.maxZ);
        }
      }
    }
  });
});
