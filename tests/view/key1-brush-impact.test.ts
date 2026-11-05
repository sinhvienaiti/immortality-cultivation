import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashLights } from "../../src/lab/feel";
import { BRUSH, FIRE_LAB, brushRotation, resetFireAudit, type FireAudit } from "../../src/view/skills/element-fire";
import { ElementStage } from "../../src/view/skills/element-stage";
import { elementById } from "../../src/view/skills/elements";
import { EmberPool } from "../../src/view/skills/embers";
import { FirePointPool } from "../../src/view/skills/fire-points";
import { FlipbookPool, isFlipbookV2, parseFlipbookManifest, playLife, type FlipOptions } from "../../src/view/skills/flipbook";
import { SpritePool } from "../../src/view/skills/fxkit";
import { GroundDecalPool } from "../../src/view/skills/ground-decals";
import { SwordSkillFx, type SwordSkillHost, type SwordSkillTextures } from "../../src/view/skills/sword-skills";
import type { TargetField } from "../../src/view/skills/targets";

// Ticket 264 §1, verbatim. Media lives outside Git; these tests never read an image.
const MANIFEST = {
  "version": 1,
  "kind": "lab-element-fire-impact",
  "element": "fire",
  "note": "Key 1's Fire hit, version 2 (ticket 264, INTEGRATION_PLAN CX-H): the owner's brushfire clip (04/11/2026 ~22:00). Media, never in Git. Masks are linear data. anchor = the strike root (331, 797) on the 1080 source; heading 81 = the fan's mass (mean hull centroid of the 24 cells seen from the root, y up). Measures: fire-impact-k1-r2-v1a.a4.masks.json, docs/codex-queue/273-report.md, 273b-report.md.",
  "flipbooks": {
    "fire-impact-k1-r2": {
      "file": "fire-impact-k1-r2-v1a.a4.rgba.png",
      "controlA": "fire-impact-k1-r2-v1a.a4.maskA.png",
      "controlB": "fire-impact-k1-r2-v1a.a4.maskB.png",
      "json": "fire-impact-k1-r2-v1a.a4.masks.json",
      "cols": 6,
      "rows": 4,
      "frames": 24,
      "fps": 24,
      "sourceFps": 24,
      "cell": 384,
      "mode": "rgba",
      "alpha": "straight",
      "loop": false,
      "loopMode": "none",
      "timingProfile": "impact-key1",
      "anchor": [0.306481, 0.737963],
      "heading": 81,
      "start": 0,
      "md5": "9c2e2446eaffd655b7424fd2a5798240",
      "roles": ["impact"],
      "use": "Key 1's hit (FireLayers.impact, ?impact=brush): one pass rooted at the strike, turned toward the blow (brushRotation), rampCool 1.",
      "source": "Firefly Video run 2 (seed 947037) f053-f076; masks: tickets 273 and 273b"
    }
  }
};
const BASE = "/art-src/lab/vfx/fire/impact-k1-r2/";
const meta = parseFlipbookManifest(MANIFEST, BASE).get(BRUSH.id)!;

function close(actual: number, expected: number, epsilon = 1e-9): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  c.position.set(0, 26, 14);
  c.lookAt(0, 0, -6);
  c.updateMatrixWorld(true);
  return c;
}

function sheets(): SwordSkillTextures {
  const glow = new THREE.Texture();
  const other = (): THREE.Texture => new THREE.Texture();
  return { glow, flare: other(), star: other(), spark: glow, trace: other(), slash: other(), mote: glow, smoke: other(), splash: other(), scorch: other(), ring: other(), shock: other(), halo: other(), twirl: other() };
}

/** The same row as element-layer.test.ts, with no kills. */
function field(n: number): TargetField {
  return {
    size: n,
    alive: () => true,
    x: (i) => -4 + i * 1.2,
    z: () => -6,
    midY: () => 0.5,
    radius: () => 0.4,
    tier: (i) => (i === 0 ? 2 : 1),
    nearest: (x, z, maxR, skip = -1) => {
      let best = -1;
      let bd = maxR;
      for (let i = 0; i < n; i += 1) {
        if (i === skip) continue;
        const d = Math.hypot(-4 + i * 1.2 - x, -6 - z);
        if (d <= bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    inCircle: () => 0,
    inCapsule: () => 0,
    hit: () => false,
    status() {},
  };
}

function swordHost(targets: TargetField, layer: THREE.Object3D, cam: THREE.Camera): SwordSkillHost {
  return {
    layer,
    camera: cam,
    targets,
    caster(out) { out.x = 0; out.z = 3; out.fx = 0; out.fz = -1; },
    hand(out) { out.set(0.3, 1.2, 2.8); },
    flash() {},
    impulse() {},
    hitStop() {},
    moveCaster() {},
    play() {},
  };
}

interface HitRun {
  flips: { id: string; at: THREE.Vector3; size: number; o: FlipOptions }[];
  decals: Parameters<GroundDecalPool["spawn"]>[];
  emits: { point: Record<string, number>; ember: Record<string, number>; sprite: Record<string, number> };
  lights: [string, number][];
  audit: FireAudit;
  uniforms: Record<string, { rampCool: number; softM: number }>;
}

/** Each pass has a new clip library and two freshly seeded random streams. */
function hitRun(mode: "brush" | "lotus", loaded: boolean): HitRun {
  const cam = camera();
  const tex = sheets();
  const targets = field(3);
  const lights: [string, number][] = [];
  const layer = new THREE.Group();
  const stage = new ElementStage({ layer, camera: cam, quality: "high", textures: tex, texture: () => new THREE.Texture(), vfxBase: "/v/", light: (_x, _y, _z, c, k) => lights.push([c, k]) });
  const fx = new SwordSkillFx(swordHost(targets, layer, cam), tex, "high");
  resetFireAudit();
  FIRE_LAB.impact = mode;
  fx.setElement(elementById("fire")!, stage);
  if (loaded) stage.flipbooks.library(BRUSH.folder).add(meta, new THREE.Texture(), { a: new THREE.Texture(), b: new THREE.Texture() });
  const flips: HitRun["flips"] = [];
  const decals: HitRun["decals"] = [];
  const emits: HitRun["emits"] = { point: {}, ember: {}, sprite: {} };
  const count = (counts: Record<string, number>, mesh: THREE.Object3D): void => {
    const name = mesh.name || `order:${mesh.renderOrder}`;
    counts[name] = (counts[name] ?? 0) + 1;
  };
  const pointEmit = FirePointPool.prototype.emit;
  const emberEmit = EmberPool.prototype.emit;
  const spriteEmit = SpritePool.prototype.emit;
  const spawns = vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, o = {}) {
    flips.push({ id: this.id, at: at.clone(), size, o: { ...o } });
  });
  const ground = vi.spyOn(GroundDecalPool.prototype, "spawn").mockImplementation((...args) => { decals.push(args); });
  const points = vi.spyOn(FirePointPool.prototype, "emit").mockImplementation(function (this: FirePointPool) {
    count(emits.point, this.mesh);
    return pointEmit.call(this);
  });
  const embers = vi.spyOn(EmberPool.prototype, "emit").mockImplementation(function (this: EmberPool) {
    count(emits.ember, this.mesh);
    return emberEmit.call(this);
  });
  const sprites = vi.spyOn(SpritePool.prototype, "emit").mockImplementation(function (this: SpritePool) {
    count(emits.sprite, this.mesh);
    return spriteEmit.call(this);
  });
  try {
    fx.cast("k1", 0, -6);
    for (let i = 0; i < 120; i += 1) {
      stage.begin();
      fx.update(1 / 60);
      stage.update(1 / 60);
    }
    const uniforms: HitRun["uniforms"] = {};
    layer.traverse((o) => {
      if (!o.name.startsWith("flipbook-")) return;
      const u = (o as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms;
      uniforms[o.name] = { rampCool: u.uRampCool!.value as number, softM: u.uSoftM!.value as number };
    });
    return { flips, decals, emits, lights, audit: { ...FIRE_LAB.audit }, uniforms };
  } finally {
    spawns.mockRestore();
    ground.mockRestore();
    points.mockRestore();
    embers.mockRestore();
    sprites.mockRestore();
    stage.flipbooks.dispose();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FIRE_LAB.impact = "brush";
  resetFireAudit();
});

describe("key 1's brushfire hit (ticket 264)", () => {
  it("parses the exact clip manifest, root, heading, masks and 43-tick life without images", () => {
    expect(isFlipbookV2(meta)).toBe(true);
    const version = "?v=9c2e2446eaffd655b7424fd2a5798240";
    expect(meta.url).toBe(BASE + "fire-impact-k1-r2-v1a.a4.rgba.png" + version);
    expect(meta.controlA).toBe(BASE + "fire-impact-k1-r2-v1a.a4.maskA.png" + version);
    expect(meta.controlB).toBe(BASE + "fire-impact-k1-r2-v1a.a4.maskB.png" + version);
    expect(meta).toMatchObject({ cols: 6, rows: 4, frames: 24, fps: 24, sourceFps: 24, aspect: 1, mode: "rgba", loop: false, loopMode: "none", timingProfile: "impact-key1" });
    expect(meta.pivot).toEqual([0.306481, 0.737963]);
    expect(meta.anchor).toEqual([0.306481, 0.737963]);
    close(meta.heading, 81 * Math.PI / 180);
    close(playLife(meta, {}), 43 / 60);
  });

  it("follows the screen direction with the specified share and ±50° cap", () => {
    const cam = camera();
    const cases = [[0, -1, 5.4], [1, 0, -48.6], [-1, 0, 50], [0, 1, -50], [0, 0, 0]] as const;
    for (const [dx, dz, degrees] of cases) {
      close(brushRotation(dx, dz, cam.matrixWorldInverse, 81 * Math.PI / 180, 0.6, 50 * Math.PI / 180), degrees * Math.PI / 180);
    }
  });

  it("draws six rooted brush cards, six flashes and lights, without the old hit or ground bodies", () => {
    const r = hitRun("brush", true);
    const brush = r.flips.filter((f) => f.id === BRUSH.id);
    expect(brush).toHaveLength(6);
    const sizes = brush.map((f) => f.size).sort((a, b) => a - b);
    [2.4, 2.4, 2.4, 3.15, 3.15, 4.095].forEach((s, i) => close(sizes[i]!, s));
    for (const f of brush) {
      close(f.at.y, 0.5);
      expect(f.o.ground).toBe(0);
      close(f.o.lift!, 0.7);
      expect(Math.abs(f.o.rot!)).toBeLessThanOrEqual(50 * Math.PI / 180 + 1e-12);
      for (const key of ["rate", "frame", "until", "life", "cool", "timing", "variant", "dir", "slowFrom"] as const) expect(f.o[key]).toBeUndefined();
    }
    const burst = r.flips.filter((f) => f.id === "fire-burst");
    expect(burst.filter((f) => f.o.rate === 1.25)).toHaveLength(0);
    expect(burst.filter((f) => f.o.rate === 1.3)).toHaveLength(1);
    expect(burst.filter((f) => f.o.rate === 1.6)).toHaveLength(2);
    expect(r.flips.filter((f) => f.id === "fire-ground")).toHaveLength(0);
    expect(r.decals).toEqual([]);
    expect(r.emits.sprite["fx-fire-flash"]).toBe(6);
    expect(r.lights).toHaveLength(6);
    expect(r.lights.map((l) => l[1]).sort((a, b) => a - b)).toEqual([4, 4, 4, 4, 4, 6]);
    for (const [colour] of r.lights) expect(typeof colour).toBe("string");
    expect(r.audit).toMatchObject({ brush: 6, flash: 6, light: 6, lotus: 0, point: 0, scorch: 0, groundFire: 0, missing: 0 });
    expect(r.audit.firstAt).toBeGreaterThanOrEqual(0);
    expect(r.audit.lastAt).toBeGreaterThanOrEqual(r.audit.firstAt);
    close(r.uniforms["flipbook-fire-impact-k1-r2"]!.rampCool, 1);
    close(r.uniforms["flipbook-fire-impact-k1-r2"]!.softM, 0.2);
    close(r.uniforms["flipbook-fire-burst"]!.rampCool, 0);
  });

  it("keeps lotus and missing-clip fallback identical, including random draws and all emits", () => {
    const a = hitRun("lotus", true);
    const b = hitRun("brush", false);
    expect(b.flips).toEqual(a.flips);
    expect(b.decals).toEqual(a.decals);
    expect(b.emits).toEqual(a.emits);
    expect(b.lights).toEqual(a.lights);
    expect(a.flips.filter((f) => f.id === BRUSH.id)).toHaveLength(0);
    expect(a.emits.sprite["fx-fire-flash"] ?? 0).toBe(0);
    expect(a.lights).toEqual([]);
    expect(a.flips.filter((f) => f.id === "fire-burst" && f.o.rate === 1.25)).toHaveLength(6);
    expect(a.flips.filter((f) => f.id === "fire-ground")).toHaveLength(3);
    expect(a.decals).toHaveLength(3);
    expect(a.audit).toMatchObject({ brush: 0, flash: 0, light: 0, lotus: 6, point: 6, scorch: 3, groundFire: 3, missing: 0 });
    expect(b.audit).toEqual({ ...a.audit, missing: 6 });
  });

  it("keeps the spark-ray and loose-ember counts, removing only six hit fire points", () => {
    vi.stubGlobal("location", { search: "?fxcode=1" });
    const brush = hitRun("brush", true);
    const lotus = hitRun("lotus", true);
    expect(brush.flips.filter((f) => f.id === "fire-sparks").length).toBe(lotus.flips.filter((f) => f.id === "fire-sparks").length);
    expect(brush.emits.ember).toEqual(lotus.emits.ember);
    expect(brush.emits.point["fx-fire-points"]).toBe(lotus.emits.point["fx-fire-points"]! - 6);
  });

  it("draws fresh lights at full strength once, preserves old decay and clears freshness on reset", () => {
    const lights = new FlashLights(new THREE.Group(), 2);
    const at = new THREE.Vector3(0, 1, 0);
    const camPos = new THREE.Vector3(0, 5, 10);
    const decay = Math.exp(-7 / 60);
    lights.flash(at, camPos, "#ffaa55", 4, true);
    lights.update(1 / 60);
    expect(lights.levels()).toEqual([4, 0]);
    lights.update(1 / 60);
    close(lights.levels()[0]!, 4 * decay);
    lights.flash(at.set(10, 1, 0), camPos, "#ffaa55", 4);
    lights.update(1 / 60);
    close(lights.levels()[1]!, 4 * decay);
    // Reusing a nearby lit light must also mark it fresh.
    lights.flash(at.set(0, 1, 0), camPos, "#ffaa55", 4, true);
    lights.update(1 / 60);
    close(lights.levels()[0]!, 4);
    lights.flash(at, camPos, "#ffaa55", 4, true);
    lights.reset();
    lights.flash(at, camPos, "#ffaa55", 4);
    lights.update(1 / 60);
    close(lights.levels()[0]!, 4 * decay);
  });
});
