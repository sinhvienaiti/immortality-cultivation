import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA, TT_BUDGETS } from "../../src/content/rules";
import { IMPOSTOR, MODE_SWITCH, atlasBytes, cellUv, createImpostorMaterial, impostorCell, viewAngleOf, type ImpostorAtlas } from "../../src/view/impostor";

const TAU = Math.PI * 2;

describe("impostor atlas cells (canon §20.3, PB-34: 16 directions × 8 phases)", () => {
  it("has 16 directions and 8 walk phases; cells 192 px at High, 128 at Low", () => {
    expect(IMPOSTOR.directions).toBe(16);
    expect(IMPOSTOR.phases).toBe(8);
    expect(IMPOSTOR.cellPx.high).toBe(192);
    expect(IMPOSTOR.cellPx.low).toBe(128);
    expect(MODE_SWITCH).toEqual({ holdS: 1, blendS: 0.2 });
  });

  it("direction 0 is the beast facing the camera; the index grows with the camera's azimuth round it", () => {
    // The game camera looks north from the south (+z): a beast heading +z (towards it) shows its face.
    const camX = 0;
    const camZ = 40;
    const cell = impostorCell(viewAngleOf(0, 0, -10, camX, camZ), 0);
    expect(cell.direction).toBe(0);
    // Heading north (away): its back, the opposite column.
    expect(impostorCell(viewAngleOf(Math.PI, 0, -10, camX, camZ), 0).direction).toBe(8);
    // Heading east (+x): the camera sits a quarter turn clockwise of its nose, column 12.
    expect(impostorCell(viewAngleOf(Math.PI / 2, 0, -10, camX, camZ), 0).direction).toBe(12);
    expect(impostorCell(viewAngleOf(-Math.PI / 2, 0, -10, camX, camZ), 0).direction).toBe(4);
    // A beast off to the west, facing the camera's axis, is seen a little from its side.
    expect(impostorCell(viewAngleOf(0, -30, -10, camX, camZ), 0).direction).toBe(1);
  });

  it("rounds to the nearest of the 16 directions and wraps", () => {
    for (let d = 0; d < 16; d += 1) {
      expect(impostorCell((d / 16) * TAU, 0).direction).toBe(d);
      expect(impostorCell((d / 16) * TAU + 0.18, 0).direction).toBe(d);
      expect(impostorCell((d / 16) * TAU - 0.18, 0).direction).toBe(d);
      expect(impostorCell((d / 16) * TAU + TAU * 3, 0).direction).toBe(d);
    }
    expect(impostorCell(-TAU / 32 + 1e-6, 0).direction).toBe(0);
    expect(impostorCell(TAU - 0.01, 0).direction).toBe(0);
  });

  it("picks the phase below and the weight of the next one (blended, never a jerk of 4 phases)", () => {
    expect(impostorCell(0, 0)).toMatchObject({ phase: 0, blend: 0 });
    expect(impostorCell(0, 0.0625)).toMatchObject({ phase: 0, blend: expect.closeTo(0.5, 6) });
    expect(impostorCell(0, 0.99)).toMatchObject({ phase: 7, blend: expect.closeTo(0.92, 6) });
    expect(impostorCell(0, 1)).toMatchObject({ phase: 0, blend: 0 });
    expect(impostorCell(0, 2.375)).toMatchObject({ phase: 3, blend: expect.closeTo(0, 6) });
    expect(impostorCell(0, -0.125)).toMatchObject({ phase: 7, blend: expect.closeTo(0, 6) });
  });

  it("lays columns out by direction and rows by phase, covering the atlas once", () => {
    expect(cellUv(0, 0)).toEqual([0, 0, 1 / 16, 1 / 8]);
    expect(cellUv(15, 7)).toEqual([15 / 16, 7 / 8, 1, 1]);
    let area = 0;
    for (let d = 0; d < 16; d += 1) for (let p = 0; p < 8; p += 1) {
      const [u0, v0, u1, v1] = cellUv(d, p);
      area += (u1 - u0) * (v1 - v0);
    }
    expect(area).toBeCloseTo(1, 9);
  });

  it("five species of atlases fit each tier's texture budget (canon §20.2: Low 16 × 8 × 128² × 4 B ≈ 8.4 MB)", () => {
    expect(atlasBytes(128, 16, 8, false)).toBe(16 * 8 * 128 * 128 * 4);
    for (const q of ["low", "medium", "high"] as const) {
      const mb = (atlasBytes(IMPOSTOR.cellPx[q]) * 5) / (1024 * 1024);
      expect(mb, q).toBeLessThan(TT_BUDGETS[q].textureMb);
    }
  });
});

describe("impostor material", () => {
  it("one ShaderMaterial a layer with the atlas, the frame and the tint table", () => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const atlas: ImpostorAtlas = { texture, directions: 16, phases: 8, cellPx: 128, frameM: 1.7, centreY: 0.6, cycleS: 0.6, bytes: 4, source: "test", dispose: () => texture.dispose() };
    const tints = [new THREE.Color(1, 1, 1), new THREE.Color(0.5, 0.6, 0.7)];
    const material = createImpostorMaterial(atlas, [0.7, 0.85, 1.6], tints);
    expect(material.uniforms.uAtlas!.value).toBe(texture);
    expect((material.uniforms.uImpFrame!.value as THREE.Vector4).toArray()).toEqual([1.7, 0.6, 16, 8]);
    expect((material.uniforms.uLook!.value as THREE.Vector3).toArray()).toEqual([0.7, 0.85, 1.6]);
    const table = material.uniforms.uTint!.value as THREE.Color[];
    expect(table.length).toBe(8);
    expect(table[1]!.equals(tints[1]!)).toBe(true);
    // Fog follows the scene, like the bodies.
    expect(material.fog).toBe(true);
    // Baked at the game's tilt (canon D48).
    expect(CAMERA.defaultTiltDeg).toBe(55);
    material.dispose();
  });
});
