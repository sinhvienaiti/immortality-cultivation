import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ElementKit, FoeStatusKind, SwordHooks, StreamHooks } from "../../src/view/skills/element-kit";
import { METAL } from "../../src/view/skills/element-metal";
import { ElementStage } from "../../src/view/skills/element-stage";
import { DEFAULT_ELEMENT, elementById, elementKits, elementOrMetal } from "../../src/view/skills/elements";
import { EmberPool } from "../../src/view/skills/embers";
import { FlipbookPool, parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { GroundDecalPool } from "../../src/view/skills/ground-decals";
import { RibbonPool } from "../../src/view/skills/fxkit";
import { MyriadSwordsFx } from "../../src/view/skills/myriad-swords";
import { SwordSkillFx, type SwordSkillHost, type SwordSkillTextures } from "../../src/view/skills/sword-skills";
import type { TargetField } from "../../src/view/skills/targets";

/** A field of `n` beasts in a row in front of the caster; `status` records the element's statuses. */
function field(n: number, hit = false): TargetField & { statuses: [number, FoeStatusKind][] } {
  const statuses: [number, FoeStatusKind][] = [];
  return {
    statuses,
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
    hit: () => hit,
    status: (i, kind) => {
      statuses.push([i, kind]);
    },
  };
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

function swordHost(targets: TargetField, layer: THREE.Object3D, cam: THREE.Camera): SwordSkillHost {
  return {
    layer,
    camera: cam,
    targets,
    caster(out) {
      out.x = 0;
      out.z = 3;
      out.fx = 0;
      out.fz = -1;
    },
    hand(out) {
      out.set(0.3, 1.2, 2.8);
    },
    flash() {},
    impulse() {},
    hitStop() {},
    moveCaster() {},
    play() {},
  };
}

/** Sprites drawn now in a layer (every visible instanced mesh's instances). */
function liveSprites(layer: THREE.Object3D): number {
  let n = 0;
  layer.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
    if (o.visible && g !== undefined && (g as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry === true) n += g.instanceCount;
  });
  return n;
}

/** A kit drawn as Metal whose sword hooks record their calls and replace the layers listed in `replace`. */
function testKit(replace: readonly (keyof SwordHooks)[], streamReplace: readonly (keyof StreamHooks)[] = []): { kit: ElementKit; calls: Record<string, number>; skills: string[] } {
  const calls: Record<string, number> = {};
  const skills: string[] = [];
  const hit = (name: string) => (): boolean => {
    calls[name] = (calls[name] ?? 0) + 1;
    return replace.includes(name as keyof SwordHooks) || streamReplace.includes(name as keyof StreamHooks);
  };
  const kit: ElementKit = {
    ...METAL,
    id: "water",
    name: "Test",
    foe: { kind: "wet", seconds: 1, rgb: 0x2e4a78 },
    sound: "water",
    attach: () => ({
      sword: {
        chargeKey: hit("chargeKey"),
        chargeFrame: hit("chargeFrame"),
        release: (a) => {
          skills.push(a.skill);
          return hit("release")();
        },
        launch: hit("launch"),
        travel: hit("travel"),
        impact: hit("impact"),
        cut: hit("cut"),
        areaHit: hit("areaHit"),
        areaBurst: hit("areaBurst"),
        aftermath: hit("aftermath"),
        death: hit("death"),
      },
      stream: { strike: hit("strike"), leadStrike: hit("leadStrike"), glint: hit("glint"), finisher: hit("finisher"), slashSpark: hit("slashSpark"), cutSeam: hit("cutSeam") },
    }),
  };
  return { kit, calls, skills };
}

describe("element registry (canon D59)", () => {
  it("Metal is the default; Fire is built: its own hooks, furnace blade, flame trail, burn and sound", () => {
    expect(DEFAULT_ELEMENT).toBe("metal");
    expect(elementKits()[0]).toBe(METAL);
    const fire = elementById("fire")!;
    expect(fire.fallback).toBeUndefined();
    expect(fire.attach).toBeDefined();
    expect(fire.blade.mode).toBe("furnace");
    expect(fire.trail.flame?.clip).toBe("dragonhold-flame-trail");
    expect(fire.trail.silk).toBe(false);
    expect(fire.foe?.kind).toBe("burn");
    expect(fire.screen.distortion).toBe(0);
    expect(fire.sound).toBe("fire");
    expect(elementOrMetal("nope")).toBe(METAL);
    expect(METAL.sound).toBe("");
    expect(METAL.foe).toBeNull();
  });

  it("Fire's ramp runs hot to dark and its core keeps away from the enemy red #FF4A4A", () => {
    const r = elementById("fire")!.ramp;
    const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(lum(r.core)).toBeGreaterThan(lum(r.edge));
    expect(lum(r.edge)).toBeGreaterThan(lum(r.body));
    expect(lum(r.body)).toBeGreaterThan(lum(r.soot));
    const hsl = { h: 0, s: 0, l: 0 };
    for (const c of [r.core, r.edge, r.body]) {
      new THREE.Color().setRGB(c[0], c[1], c[2]).getHSL(hsl, THREE.SRGBColorSpace);
      // Warm (orange to gold), never the enemy's red hue (0°).
      expect(hsl.h * 360).toBeGreaterThan(15);
      expect(hsl.h * 360).toBeLessThan(60);
    }
  });
});

describe("flipbook manifest", () => {
  it("reads the Dragonhold form and keeps URLs to the folder", () => {
    const m = parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { "tt-vfx-fire-burst": { file: "tt-vfx-fire-burst.png", cols: 4, rows: 4, frames: 14, fps: 24, cell: 512, alpha: "straight" }, embers: { file: "embers.png", cols: 4, rows: 2, fps: 30, cell: [256, 128], blend: "additive" } } }, "/art-src/lab/vfx/fire/");
    const b = m.get("tt-vfx-fire-burst")!;
    expect(b.url).toBe("/art-src/lab/vfx/fire/tt-vfx-fire-burst.png");
    expect(b.mode).toBe("rgba");
    expect(b.frames).toBe(14);
    expect(m.get("embers")!.mode).toBe("fire");
    expect(m.get("embers")!.aspect).toBe(2);
  });

  it("takes the lenient form (clips array, atlas, grid) and refuses bad files", () => {
    const m = parseFlipbookManifest({ clips: [{ id: "burst", atlas: "burst.webp", grid: [4, 3], mode: "rgba" }] }, "/v/");
    expect(m.get("burst")!.cols).toBe(4);
    expect(m.get("burst")!.rows).toBe(3);
    expect(m.get("burst")!.fps).toBe(24);
    expect(() => parseFlipbookManifest({ flipbooks: { x: { file: "../x.png", cols: 1, rows: 1 } } }, "/v/")).toThrow();
    expect(() => parseFlipbookManifest({ flipbooks: { x: { file: "x.png", cols: 0, rows: 1 } } }, "/v/")).toThrow();
  });

  it("a pool draws nothing until its atlas arrives, then lives one pass of the clip", () => {
    const pool = new FlipbookPool("burst", "rgba", 4, 12, new THREE.Texture());
    pool.spawn(new THREE.Vector3(), 2);
    pool.update(1 / 60);
    expect(pool.live).toBe(0);
    pool.attach(parseFlipbookManifest({ flipbooks: { burst: { file: "b.png", cols: 4, rows: 4, frames: 12, fps: 24 } } }, "/").get("burst")!, new THREE.Texture());
    pool.spawn(new THREE.Vector3(), 2, { cool: 0.6 });
    let frames = 0;
    pool.update(0);
    while (pool.live > 0 && frames < 100) {
      pool.update(1 / 60);
      frames += 1;
    }
    // 12 frames at 24 fps: 0.5 s, 30 frames at 60 Hz.
    expect(frames).toBeGreaterThanOrEqual(29);
    expect(frames).toBeLessThanOrEqual(31);
    expect(pool.mesh.visible).toBe(false);
  });
});

describe("ground decals", () => {
  it("live their life and the oldest is reused when full", () => {
    const pool = new GroundDecalPool(2, new THREE.Texture());
    const look = { texture: "scorch", life: 1, growIn: 0.1, erodeFrom: 0.6, body: [0.05, 0.03, 0.02] as const, alpha: 0.9, heat: [2, 0.6, 0.1] as const, cool: 2 };
    pool.spawn(0, 0, 2, look);
    pool.spawn(1, 0, 2, look);
    pool.spawn(2, 0, 2, look);
    pool.update(1 / 60);
    expect(pool.live).toBe(2);
    for (let i = 0; i < 60; i += 1) pool.update(1 / 60);
    expect(pool.live).toBe(0);
    expect(pool.mesh.visible).toBe(false);
  });

  it("draw Fire's burnt ground as the procedural char (no star texture), in a warm char that never reads as dark red", () => {
    const fire = elementById("fire")!;
    expect(fire.ground!.texture).toBeNull();
    const pool = new GroundDecalPool(4, null);
    expect(pool.mesh.material.defines).toHaveProperty("PROCEDURAL");
    expect(new GroundDecalPool(4, new THREE.Texture()).mesh.material.defines).not.toHaveProperty("PROCEDURAL");
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color().setRGB(fire.ground!.body[0], fire.ground!.body[1], fire.ground!.body[2]).getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.h * 360).toBeGreaterThan(20);
    expect(hsl.h * 360).toBeLessThan(45);
    // The ember glow it cools through stays orange (green ≥ a third of red).
    expect(fire.ground!.heat[1] / fire.ground!.heat[0]).toBeGreaterThan(0.3);
    expect(fire.ground!.alpha).toBeLessThan(0.75);
  });
});

describe("sword skills through the element kit", () => {
  function run(kit: ElementKit | null, hit = false): { layer: THREE.Group; targets: ReturnType<typeof field>; fx: SwordSkillFx } {
    const layer = new THREE.Group();
    const cam = camera();
    const targets = field(3, hit);
    const tex = sheets();
    const fx = new SwordSkillFx(swordHost(targets, layer, cam), tex, "high");
    if (kit !== null) {
      const stage = new ElementStage({ layer, camera: cam, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/v/" });
      fx.setElement(kit, stage);
    }
    fx.setCharge("k1", 0.5, 0, -6);
    fx.update(1 / 60);
    fx.cast("k1", 0, -6);
    for (let i = 0; i < 20; i += 1) fx.update(1 / 60);
    return { layer, targets, fx };
  }

  it("calls each phase's hook on key 1 and leaves the element's status on the beasts it struck", () => {
    const { kit, calls, skills } = testKit([]);
    const { targets, fx } = run(kit);
    expect(fx.element.id).toBe("water");
    expect(calls.chargeKey).toBe(1);
    expect(calls.chargeFrame).toBeGreaterThan(0);
    expect(calls.release).toBe(1);
    expect(skills).toEqual(["k1"]);
    expect(calls.travel).toBeGreaterThan(0);
    expect(calls.impact).toBeGreaterThan(0);
    expect(calls.cut).toBeGreaterThan(0);
    expect(calls.aftermath).toBeGreaterThan(0);
    expect(targets.statuses.length).toBeGreaterThan(0);
    expect(targets.statuses[0]![1]).toBe("wet");
  });

  it("a hook that draws its layer replaces Metal's (fewer base sprites), one that declines lets Metal draw", () => {
    const declines = run(testKit([]).kit);
    const replaces = run(testKit(["chargeKey", "chargeFrame", "release", "launch", "travel", "impact", "cut", "aftermath", "death"]).kit);
    const metal = run(null);
    expect(liveSprites(declines.layer)).toBe(liveSprites(metal.layer));
    expect(liveSprites(replaces.layer)).toBeLessThan(liveSprites(metal.layer));
    // Metal leaves no status.
    expect(metal.targets.statuses.length).toBe(0);
  });

  it("key 7's burst names its skill for the release hook", () => {
    const { kit, skills } = testKit(["release"]);
    const layer = new THREE.Group();
    const cam = camera();
    const tex = sheets();
    const fx = new SwordSkillFx(swordHost(field(3), layer, cam), tex, "high");
    fx.setElement(kit, new ElementStage({ layer, camera: cam, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/v/" }));
    fx.burst("k1", 3, "k7");
    expect(skills).toEqual(["k7"]);
  });
});

describe("key 7 through the element kit", () => {
  it("takes the kit's tone and calls its strike hook on every blow", () => {
    const { kit, calls } = testKit([], ["strike"]);
    const layer = new THREE.Group();
    const cam = camera();
    const targets = field(12);
    const struck = vi.fn();
    const fx = new MyriadSwordsFx(
      {
        layer,
        camera: cam,
        targets,
        caster(out) {
          out.x = 0;
          out.z = 3;
          out.fx = 0;
          out.fz = -1;
        },
        hand(out) {
          out.set(0.3, 1.2, 2.8);
        },
        struck,
        phase() {},
        flyby() {},
        flash() {},
      },
      { glow: new THREE.Texture(), slash: new THREE.Texture(), star: new THREE.Texture(), ring: new THREE.Texture(), scorch: new THREE.Texture(), noise: new THREE.Texture() },
      { mid: 16, far: 24 },
    );
    const tone = { ...METAL.stream, hitRgb: 0x123456 };
    fx.setElement({ ...kit, stream: tone }, new ElementStage({ layer, camera: cam, quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" }));
    expect(fx.tone.hitRgb).toBe(0x123456);
    fx.cast();
    for (let i = 0; i < 240; i += 1) fx.update(1 / 60);
    expect(struck).toHaveBeenCalled();
    expect(calls.strike).toBeGreaterThan(0);
    expect(calls.glint).toBeGreaterThan(0);
    expect(calls.finisher).toBe(1);
    expect(targets.statuses.length).toBeGreaterThan(0);
  });
});

describe("Fire (Sword × Fire, canon D59)", () => {
  const hsl = { h: 0, s: 0, l: 0 };
  const hue = (c: readonly number[]): number => {
    new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!).getHSL(hsl, THREE.SRGBColorSpace);
    return hsl.h * 360;
  };

  it("keeps every light warm and away from the enemy red: cores, halos, key 7's tone, the blade's heat and edge", () => {
    const fire = elementById("fire")!;
    const pal = fire.palette({ id: "clear-wind" } as never, "k1");
    for (const c of [pal.core, pal.halo, pal.rim, fire.stream.core, fire.stream.halo, fire.stream.trailCore, fire.blade.edge, fire.blade.heat!]) {
      expect(hue(c)).toBeGreaterThan(15);
      expect(hue(c)).toBeLessThan(60);
    }
    // Halos and the heat band stay under the bloom threshold; the edge line is the thin HDR part.
    expect(Math.max(...pal.halo, ...fire.stream.halo, ...fire.blade.heat!)).toBeLessThanOrEqual(0.9);
    expect(Math.max(...fire.blade.edge)).toBeGreaterThan(1);
    expect(fire.foe!.rgb).not.toBe(0xff4a4a);
  });

  function stageFor(layer: THREE.Object3D, cam: THREE.Camera, tex: SwordSkillTextures, accents: number[]): ElementStage {
    return new ElementStage({ layer, camera: cam, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/v/", accent: (_x, _y, _z, k) => accents.push(k) });
  }

  it("draws key 1 in its own layers and replaces Metal's: fewer base sprites, its layers lit, the burn left on the beasts", () => {
    const run = (fire: boolean): { base: number; kit: number; statuses: number; accents: number[] } => {
      const base = new THREE.Group();
      const kitLayer = new THREE.Group();
      const cam = camera();
      const targets = field(3);
      const tex = sheets();
      const accents: number[] = [];
      const fx = new SwordSkillFx(swordHost(targets, base, cam), tex, "high");
      const stage = stageFor(kitLayer, cam, tex, accents);
      if (fire) fx.setElement(elementById("fire")!, stage);
      let kit = 0;
      const step = (): void => {
        stage.begin();
        fx.update(1 / 60);
        stage.update(1 / 60);
        kit = Math.max(kit, liveSprites(kitLayer));
      };
      fx.setCharge("k1", 0.4, 0, -6);
      step();
      fx.setCharge("k1", 0.8, 0, -6);
      step();
      fx.cast("k1", 0, -6);
      let baseMax = 0;
      for (let i = 0; i < 90; i += 1) {
        step();
        baseMax = Math.max(baseMax, liveSprites(base));
      }
      return { base: baseMax, kit, statuses: targets.statuses.length, accents };
    };
    const metal = run(false);
    const fire = run(true);
    expect(fire.kit).toBeGreaterThan(0);
    expect(metal.kit).toBe(0);
    expect(fire.base).toBeLessThan(metal.base * 0.5);
    expect(fire.statuses).toBeGreaterThan(0);
    // The third blade is the big one: its blow asks for the warm flash.
    expect(fire.accents.length).toBeGreaterThan(0);
  });

  it("roots every flame lotus: one lit in the air fades its root at its own height (no straight cut at the cell's edge)", () => {
    const spawns: { y: number; ground: number | undefined }[] = [];
    const spy = vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, _size, o) {
      if (this.id === "fire-burst") spawns.push({ y: at.y, ground: o?.ground });
    });
    try {
      const cam = camera();
      const tex = sheets();
      const fx = new SwordSkillFx(swordHost(field(3), new THREE.Group(), cam), tex, "high");
      const stage = stageFor(new THREE.Group(), cam, tex, []);
      fx.setElement(elementById("fire")!, stage);
      const step = (): void => {
        stage.begin();
        fx.update(1 / 60);
        stage.update(1 / 60);
      };
      // The word typed past each blade's threshold (its ignition behind the shoulders), then the cast and its launches.
      for (const p of [0.2, 0.5, 0.8, 1]) {
        fx.setCharge("k1", p, 0, -6);
        step();
      }
      fx.cast("k1", 0, -6);
      for (let i = 0; i < 90; i += 1) step();
    } finally {
      spy.mockRestore();
    }
    const air = spawns.filter((s) => s.y > 0.05);
    // Three blades ignite at their places, the second and third flare as they leave.
    expect(air.length).toBeGreaterThanOrEqual(5);
    for (const s of air) expect(s.ground).toBeCloseTo(s.y, 5);
    for (const s of spawns.filter((x) => x.y <= 0.05)) expect(s.ground).toBe(0);
  });

  it("draws key 7 in fire: flame ribbons on the lead blades, their sheaths, the river's trails in the fire tone", () => {
    const kitLayer = new THREE.Group();
    const cam = camera();
    const targets = field(12);
    const host = {
      layer: new THREE.Group(),
      camera: cam,
      targets,
      caster(out: { x: number; z: number; fx: number; fz: number }) {
        out.x = 0;
        out.z = 3;
        out.fx = 0;
        out.fz = -1;
      },
      hand(out: THREE.Vector3) {
        out.set(0.3, 1.2, 2.8);
      },
      struck() {},
      phase() {},
      flyby() {},
      flash() {},
    };
    const tex = { glow: new THREE.Texture(), slash: new THREE.Texture(), star: new THREE.Texture(), ring: new THREE.Texture(), scorch: new THREE.Texture(), noise: new THREE.Texture() };
    const fx = new MyriadSwordsFx(host, tex, { mid: 16, far: 24 });
    const stage = stageFor(kitLayer, cam, sheets(), []);
    const fire = elementById("fire")!;
    // Its flame band is a clip of its folder: without the atlas (no fetch here) the ribbons keep sword-light.
    fx.setElement(fire, stage);
    expect(fx.tone).toBe(fire.stream);
    fx.cast();
    for (let i = 0; i < 120; i += 1) {
      stage.begin();
      fx.update(1 / 60);
      stage.update(1 / 60);
    }
    // The river's trails stay (one-frame beams in the fire tone); the kit drew its sparks, embers and pinpoints.
    const beams = (fx as unknown as { beams: { mesh: THREE.Mesh<THREE.InstancedBufferGeometry> } }).beams.mesh;
    expect(beams.geometry.instanceCount).toBeGreaterThan(10);
    expect(liveSprites(kitLayer)).toBeGreaterThan(0);
  });

  it("throws loose embers that live their life and cool to orange, never to dark red (03/11 fixes)", () => {
    const pool = new EmberPool(8);
    const u = pool.mesh.material.uniforms;
    // Its cooling ramp: every stop orange to gold (hue 18–50°), the dim end too.
    for (const k of ["uHot", "uAmber", "uOrange", "uDim"]) {
      const c = u[k]!.value as THREE.Vector3;
      const h = hue([c.x, c.y, c.z]);
      expect(h).toBeGreaterThan(18);
      expect(h).toBeLessThan(50);
    }
    const s = pool.reset();
    s.x = 1;
    s.life = 0.5;
    s.delay = 0.1;
    pool.emit();
    pool.emit();
    pool.update(1 / 60);
    expect(pool.mesh.visible).toBe(true);
    expect(pool.mesh.geometry.instanceCount).toBe(2);
    for (let i = 0; i < 40; i += 1) pool.update(1 / 60);
    expect(pool.mesh.visible).toBe(false);
    pool.emit();
    pool.clear();
    pool.update(1 / 60);
    expect(pool.mesh.visible).toBe(false);
  });

  it("Fire's blows throw embers into its ember pool, not the heat-field ember atlas", () => {
    const kitLayer = new THREE.Group();
    const cam = camera();
    const tex = sheets();
    const fx = new SwordSkillFx(swordHost(field(3), new THREE.Group(), cam), tex, "high");
    const stage = stageFor(kitLayer, cam, tex, []);
    const fire = elementById("fire")!;
    fx.setElement(fire, stage);
    expect(Object.values(fire.flipbooks).flat()).not.toContain("dragonhold-embers");
    fx.cast("k1", 0, -6);
    let embers = 0;
    for (let i = 0; i < 90; i += 1) {
      stage.begin();
      fx.update(1 / 60);
      stage.update(1 / 60);
      kitLayer.traverse((o) => {
        if (o.name === "fx-embers" && o.visible) embers = Math.max(embers, (o as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount);
      });
    }
    expect(embers).toBeGreaterThan(20);
  });

  it("a ribbon pool swaps to the flame look and back without touching its ribbons", () => {
    const pool = new RibbonPool(4, 8, new THREE.Texture());
    const light = pool.mesh.material;
    pool.setFlame({ texture: new THREE.Texture(), cols: 2, rows: 8, frames: 16, fps: 12, soot: [0.02, 0, 0], deep: [0.7, 0.04, 0], amber: [1, 0.47, 0], core: [1, 0.98, 0.87] });
    const flame = pool.mesh.material as THREE.ShaderMaterial;
    expect(flame).not.toBe(light);
    expect(flame.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    pool.setFlame(null);
    expect(pool.mesh.material).toBe(light);
  });

  it("a heat-field flipbook pool reads 'heat' from a manifest and takes its ramp and taper", () => {
    const m = parseFlipbookManifest({ flipbooks: { trail: { file: "t.png", cols: 2, rows: 8, frames: 16, mode: "heat", loop: true } } }, "/v/");
    expect(m.get("trail")!.mode).toBe("heat");
    const pool = new FlipbookPool("trail", "heat", 4, 11, new THREE.Texture());
    pool.setHeatRamp([0.7, 0.04, 0], [1, 0.47, 0], [1, 0.98, 0.87]);
    pool.taper = 0.85;
    expect(pool.mesh.material.uniforms.uMode!.value).toBe(3);
    expect(pool.mesh.material.uniforms.uTaper!.value).toBe(0.85);
  });
});
