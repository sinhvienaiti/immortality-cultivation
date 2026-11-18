import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { THANH_THACH_AI } from "../../src/content/data/stage-m0a";
import { CAMERA, FIELD, TT_BUDGETS, TT_DYNAMIC_RES, TT_LIMITS, TT_MSAA, TT_TIERS } from "../../src/content/rules";
import type { ScreenPoint } from "../../src/app/contracts";
import { FIELD_M, VIEW, fitCamera, placeCamera, projectPoint } from "../../src/view/renderer";

const QUALITIES = ["low", "medium", "high", "ultra"] as const;

describe("tier table (canon §20.2, PB-35)", () => {
  it("TT_TIERS has the 4 keys in StageTier shape, ultra = high at MVP", () => {
    expect(Object.keys(TT_TIERS).sort()).toEqual([...QUALITIES].sort());
    for (const q of QUALITIES) expect(Object.keys(TT_TIERS[q]).sort()).toEqual(["bloom", "dpr", "particles", "tipsPerSide", "trail"]);
    expect(TT_TIERS.ultra).toEqual(TT_TIERS.high);
    // canon D57 (03/11/2026): High and Ultra up to the display's pixel ratio (2), dynamic from DPR 1 on the frame pacing;
    // MSAA 4 only on Ultra (about 3 ms at DPR 1 on the M4).
    expect(QUALITIES.map((q) => TT_TIERS[q].dpr)).toEqual([1, 1, 2, 2]);
    expect(QUALITIES.map((q) => TT_MSAA[q])).toEqual([0, 0, 0, 4]);
    expect(QUALITIES.map((q) => TT_DYNAMIC_RES[q]?.minDpr ?? null)).toEqual([null, null, 1, 1]);
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
  it("picks a tilt and FOV inside the canon ranges; the tilt is the D48 default", () => {
    expect(CAMERA.defaultTiltDeg).toBe(42);
    expect(VIEW.tiltDeg).toBe(CAMERA.defaultTiltDeg);
    expect(VIEW.tiltDeg).toBeGreaterThanOrEqual(CAMERA.tiltDeg[0]);
    expect(VIEW.tiltDeg).toBeLessThanOrEqual(CAMERA.tiltDeg[1]);
    expect(VIEW.fovDeg).toBeGreaterThanOrEqual(CAMERA.fovDeg[0]);
    expect(VIEW.fovDeg).toBeLessThanOrEqual(CAMERA.fovDeg[1]);
  });

  it("uses a 48 × 52 m field independently of the fixed camera frame", () => {
    expect(FIELD_M).toEqual({ minX: -24, maxX: 24, minZ: -44, maxZ: 8 });
    expect(FIELD.gates.A).toEqual({ xMm: -2000, zMm: -43500 });
  });

  for (const [w, h] of [[1920, 1080], [1280, 720]] as const) {
    it("keeps Camera B landmarks and the lane clear of Bàn Quyết at " + w + "×" + h, () => {
      const camera = new THREE.PerspectiveCamera();
      const fit = fitCamera(camera, w / h, { insetTop: 0.1, insetBottom: 0.14 });
      expect(fit).toEqual({ tiltDeg: 42, fovDeg: 28, distanceM: 52.8, targetZ: -7.55 });
      const project = (x: number, y: number, z: number) => projectPoint(camera, w, h, x, y, z, { x: 0, y: 0, visible: false }, new THREE.Vector3());
      expect(Math.abs(project(0, 0, 3).y - 880 * h / 1080)).toBeLessThanOrEqual(6 * h / 1080);
      expect(Math.abs(project(0, 0, 0).y - 772 * h / 1080)).toBeLessThanOrEqual(6 * h / 1080);
      expect(project(0, 0, -31).y - project(0, 1.5, -31).y).toBeGreaterThanOrEqual(40 * h / 1080);
      for (const pillar of THANH_THACH_AI.field.pillars) {
        expect(project(pillar.at.xMm / 1000, 0, pillar.at.zMm / 1000).visible).toBe(true);
        expect(project(pillar.at.xMm / 1000, 3.4, pillar.at.zMm / 1000).visible).toBe(true);
      }
      for (const slot of THANH_THACH_AI.field.mechSlots) expect(project(slot.at.xMm / 1000, 0, slot.at.zMm / 1000).visible).toBe(true);
      for (const p of THANH_THACH_AI.field.lane!.pointsMm) {
        for (const dx of [-6, 6]) expect(project(p.xMm / 1000 + dx, 0, p.zMm / 1000).y).toBeLessThan(930 * h / 1080);
      }
      const ray = new THREE.Raycaster();
      placeCamera(camera, 42, 52.8, 0, -16.8);
      ray.setFromCamera(new THREE.Vector2(0, 1), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())!;
      expect(hit.z).toBeCloseTo(-44, 0);
    });
  }

  it("keeps the fixed vertical frame on wider displays and ignores DOM insets", () => {
    const a = new THREE.PerspectiveCamera();
    const b = new THREE.PerspectiveCamera();
    expect(fitCamera(a, 16 / 9)).toEqual(fitCamera(b, 21 / 9, { insetBottom: 0.2 }));
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(new THREE.Vector3(15, 0, -20).project(b).x).toBeLessThan(new THREE.Vector3(15, 0, -20).project(a).x);
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
