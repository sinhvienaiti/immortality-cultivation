import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA, FIELD, TT_BUDGETS, TT_LIMITS, TT_TIERS } from "../../src/content/rules";
import type { ScreenPoint } from "../../src/app/contracts";
import { FIELD_M, VIEW, fitCamera, placeCamera, projectPoint } from "../../src/view/renderer";

const QUALITIES = ["low", "medium", "high", "ultra"] as const;

describe("tier table (canon §20.2, PB-35)", () => {
  it("TT_TIERS has the 4 keys in StageTier shape, ultra = high at MVP", () => {
    expect(Object.keys(TT_TIERS).sort()).toEqual([...QUALITIES].sort());
    for (const q of QUALITIES) expect(Object.keys(TT_TIERS[q]).sort()).toEqual(["bloom", "dpr", "particles", "tipsPerSide", "trail"]);
    expect(TT_TIERS.ultra).toEqual(TT_TIERS.high);
    // Measured at DPR 1 (canon §20.2 "Độ phân giải đo (DPR 1)").
    for (const q of QUALITIES) expect(TT_TIERS[q].dpr).toBe(1);
  });

  it("particles of the StageTier row match the budget table", () => {
    expect([TT_TIERS.low.particles, TT_TIERS.medium.particles, TT_TIERS.high.particles]).toEqual([600, 1500, 3000]);
    for (const q of QUALITIES) expect(TT_TIERS[q].particles).toBe(TT_BUDGETS[q].particles);
  });

  it("TT_BUDGETS carries every number of canon §20.2", () => {
    const pick = (key: keyof (typeof TT_BUDGETS)["low"]) => [TT_BUDGETS.low[key], TT_BUDGETS.medium[key], TT_BUDGETS.high[key]];
    expect(pick("width")).toEqual([1280, 1600, 1920]);
    expect(pick("height")).toEqual([720, 900, 1080]);
    expect(pick("skinnedMax")).toEqual([6, 6, 8]);
    expect(pick("swords")).toEqual([150, 300, 500]);
    expect(pick("lodTris")).toEqual([1000, 1800, 3000]);
    expect(pick("numbers")).toEqual([50, 100, 160]);
    expect(pick("drawCalls")).toEqual([80, 110, 150]);
    expect(pick("textureMb")).toEqual([64, 128, 192]);
    expect(pick("frameMeanUs")).toEqual([null, 8000, 8000]);
    expect(pick("frameP95Us")).toEqual([8000, 10_000, 12_000]);
    expect(pick("m4MeanUs")).toEqual([null, null, 8000]);
    expect(pick("m4P95Us")).toEqual([16_000, 12_000, 12_000]);
    expect(pick("cpuP95Us")).toEqual([6000, 6000, 6000]);
    expect(TT_BUDGETS.ultra).toEqual(TT_BUDGETS.high);
    expect(TT_LIMITS.skinnedSeven).toBe(10);
    expect(TT_LIMITS.swordsFloor).toBe(80);
  });

  it("sub-budgets (D36) add up to each tier's Dell p95", () => {
    expect(TT_BUDGETS.low.subUs).toEqual({ base: 1500, crowd: 3000, swordsFx: 2000, skinned: 1500 });
    expect(TT_BUDGETS.medium.subUs).toEqual({ base: 2000, crowd: 4000, swordsFx: 2500, skinned: 1500 });
    expect(TT_BUDGETS.high.subUs).toEqual({ base: 2000, crowd: 5000, swordsFx: 3500, skinned: 1500 });
    for (const q of QUALITIES) {
      const s = TT_BUDGETS[q].subUs;
      expect(s.base + s.crowd + s.swordsFx + s.skinned).toBe(TT_BUDGETS[q].frameP95Us);
    }
  });
});

describe("fixed 3/4 camera (canon §21.1)", () => {
  it("picks a tilt and FOV inside the canon ranges", () => {
    expect(VIEW.tiltDeg).toBeGreaterThanOrEqual(CAMERA.tiltDeg[0]);
    expect(VIEW.tiltDeg).toBeLessThanOrEqual(CAMERA.tiltDeg[1]);
    expect(VIEW.fovDeg).toBeGreaterThanOrEqual(CAMERA.fovDeg[0]);
    expect(VIEW.fovDeg).toBeLessThanOrEqual(CAMERA.fovDeg[1]);
  });

  it("frames the field of canon §8.1 (40 × 26 m, heart at the origin)", () => {
    expect(FIELD_M).toEqual({ minX: -20, maxX: 20, minZ: -18, maxZ: 8 });
    expect((FIELD_M.maxX - FIELD_M.minX) * 1000).toBe(CAMERA.frameMm.width);
    expect((FIELD_M.maxZ - FIELD_M.minZ) * 1000).toBe(CAMERA.frameMm.depth);
    expect(FIELD.gates.A.xMm).toBe(-15_000);
  });

  const corners = (camera: THREE.PerspectiveCamera, headroom = VIEW.headroomM) => {
    const v = new THREE.Vector3();
    const points: [number, number, number][] = [
      [FIELD_M.minX, 0, FIELD_M.minZ],
      [FIELD_M.maxX, 0, FIELD_M.minZ],
      [FIELD_M.minX, 0, FIELD_M.maxZ],
      [FIELD_M.maxX, 0, FIELD_M.maxZ],
      [FIELD_M.minX, headroom, FIELD_M.minZ],
      [FIELD_M.maxX, headroom, FIELD_M.minZ],
    ];
    return points.map(([x, y, z]) => v.set(x, y, z).project(camera).clone());
  };

  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
    [1600, 900],
    [1440, 900],
    [2560, 1080],
    [1024, 768],
  ] as const) {
    it("shows the whole field with its far-edge headroom at " + w + "×" + h, () => {
      const camera = new THREE.PerspectiveCamera();
      const fit = fitCamera(camera, w / h);
      expect(fit.tiltDeg).toBe(VIEW.tiltDeg);
      expect(camera.fov).toBe(VIEW.fovDeg);
      const ndc = corners(camera);
      const limit = 1 - VIEW.marginNdc + 1e-3;
      for (const p of ndc) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(limit);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(limit);
        expect(p.z).toBeLessThan(1);
      }
      // The binding side fills the frame (no wasted screen): width at 16:9, either side elsewhere.
      const spanX = Math.max(...ndc.map((p) => p.x)) - Math.min(...ndc.map((p) => p.x));
      const spanY = Math.max(...ndc.map((p) => p.y)) - Math.min(...ndc.map((p) => p.y));
      expect(Math.max(spanX, spanY)).toBeGreaterThan(2 * (1 - VIEW.marginNdc) - 0.01);
      // Looking north from the south, down at the tilt.
      expect(camera.position.z).toBeGreaterThan(fit.targetZ);
      const down = new THREE.Vector3();
      camera.getWorldDirection(down);
      expect(THREE.MathUtils.radToDeg(Math.asin(-down.y))).toBeCloseTo(VIEW.tiltDeg, 6);
      expect(down.x).toBeCloseTo(0, 9);
    });
  }

  it("at 16:9 the 40 m width binds: the near edge spans the screen", () => {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, 16 / 9);
    const [farL, farR, nearL, nearR] = corners(camera);
    expect(nearR!.x - nearL!.x).toBeCloseTo(2 * (1 - VIEW.marginNdc), 3);
    expect(farR!.x - farL!.x).toBeLessThan(nearR!.x - nearL!.x);
  });

  it("is deterministic and fixed (no rotate, no zoom): the same fit twice", () => {
    const a = new THREE.PerspectiveCamera();
    const b = new THREE.PerspectiveCamera();
    expect(fitCamera(a, 16 / 9)).toEqual(fitCamera(b, 16 / 9));
    expect(a.position.toArray()).toEqual(b.position.toArray());
  });

  it("keeps the field above a DOM band at the bottom (Bàn Quyết) when asked", () => {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, 16 / 9, { insetBottom: 0.12 });
    for (const p of corners(camera)) expect(p.y).toBeGreaterThanOrEqual(-1 + VIEW.marginNdc + 0.24 - 1e-3);
  });

  it("projects to CSS px into the caller's object, visible only on screen", () => {
    const camera = new THREE.PerspectiveCamera();
    fitCamera(camera, 16 / 9);
    const out: ScreenPoint = { x: 0, y: 0, visible: false };
    const scratch = new THREE.Vector3();
    const heart = projectPoint(camera, 1920, 1080, 0, 0, 0, out, scratch);
    expect(heart).toBe(out);
    expect(heart.visible).toBe(true);
    expect(heart.x).toBeCloseTo(960, 3);
    expect(heart.y).toBeGreaterThan(540);
    expect(heart.y).toBeLessThan(1080);
    // The far gates sit above the heart; a point far outside the field is off screen.
    const gate = projectPoint(camera, 1920, 1080, -15, 0, -18, { x: 0, y: 0, visible: false }, scratch);
    expect(gate.visible).toBe(true);
    expect(gate.y).toBeLessThan(heart.y);
    expect(gate.x).toBeLessThan(960);
    expect(projectPoint(camera, 1920, 1080, 80, 0, 0, out, scratch).visible).toBe(false);
    expect(projectPoint(camera, 1920, 1080, 0, 0, 200, out, scratch).visible).toBe(false);
  });

  it("placeCamera puts the camera on the tilt line, looking at the target", () => {
    const camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
    placeCamera(camera, 50, 20, -3, -4);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const toTarget = new THREE.Vector3(-3, 0, -4).sub(camera.position).normalize();
    expect(dir.dot(toTarget)).toBeCloseTo(1, 9);
    expect(camera.position.distanceTo(new THREE.Vector3(-3, 0, -4))).toBeCloseTo(20, 9);
  });
});
