import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRUSH, FIRE, FIRE_LAB, prewarmFire } from "../../src/view/skills/element-fire";
import { ElementStage } from "../../src/view/skills/element-stage";
import { FirePointPool } from "../../src/view/skills/fire-points";
import { FlipbookPool, type FlipbookMeta, type FlipOptions } from "../../src/view/skills/flipbook";
import { EmberPool } from "../../src/view/skills/embers";
import { GroundDecalPool } from "../../src/view/skills/ground-decals";
import { Rand, SpritePool } from "../../src/view/skills/fxkit";
import { HeatRingPool } from "../../src/view/skills/heat-rings";
import { MyriadSwordsFx } from "../../src/view/skills/myriad-swords";
import { SwordSkillFx, type SwordSkillTextures } from "../../src/view/skills/sword-skills";
import type { TargetField } from "../../src/view/skills/targets";

const PEAKS = [3, 9, 9, 7, 11, 8, 12, 4];
const STRIP = "strip-fire-sheath-v2";
const STEP = 1 / 60;

function sheets(): SwordSkillTextures {
  const t = (): THREE.Texture => new THREE.Texture();
  return { glow: t(), flare: t(), star: t(), spark: t(), trace: t(), slash: t(), mote: t(), smoke: t(), splash: t(), scorch: t(), ring: t(), shock: t(), halo: t(), twirl: t() };
}

/** Same grids as the supplied art; no image files, fetches or image decoders. */
function clips(stage: ElementStage): void {
  const add = (id: string, cols: number, rows: number, frames: number, loop = false): void => {
    const meta: FlipbookMeta = { id, url: "", cols, rows, frames, fps: 24, loop,
      mode: id === STRIP ? "rgba" : "fire", aspect: id === STRIP ? 4 : 1,
      pivot: [0.5, 0.5], start: 0, heading: 0 };
    stage.flipbooks.library("fire").add(meta, new THREE.Texture());
  };
  add("fire-twinkle-set", 16, 8, 16);
  add("fire-halo-ring", 6, 4, 24);
  add("fire-halo-seal-loop", 8, 4, 32, true);
  add(STRIP, 1, 1, 1, true);
}

function setup(code = false): { stage: ElementStage; layer: THREE.Group; tex: SwordSkillTextures; camera: THREE.Camera } {
  // Not an HTTP location: library.load() stays in memory, exactly as ticket 264's test does.
  vi.stubGlobal("location", { search: code ? "?fxcode=1" : "" });
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  camera.position.set(0, 26, 14);
  camera.lookAt(0, 0, -6);
  camera.updateMatrixWorld(true);
  const tex = sheets();
  const layer = new THREE.Group();
  const stage = new ElementStage({ layer, camera, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/art-src/lab/vfx/" });
  clips(stage);
  stage.hooksOf(FIRE);
  return { stage, layer, tex, camera };
}

function pool(stage: ElementStage, id: string): FlipbookPool {
  return stage.flipbooks.pool("fire", id);
}

function targets(): TargetField {
  return {
    size: 36, alive: () => true,
    x: (i) => -8 + (i % 9) * 2, z: (i) => -6 - Math.floor(i / 9) * 2,
    midY: () => 0.5, radius: () => 0.4, tier: (i) => i % 9 === 0 ? 2 : 1,
    nearest: (x, z, max, skip = -1) => {
      let best = -1;
      let distance = max;
      for (let i = 0; i < 36; i += 1) {
        if (i === skip) continue;
        const d = Math.hypot(-8 + (i % 9) * 2 - x, -6 - Math.floor(i / 9) * 2 - z);
        if (d <= distance) { distance = d; best = i; }
      }
      return best;
    },
    inCircle: () => 0, inCapsule: () => 0, hit: () => false, status() {},
  };
}

/** Real sword and river clocks, one cast of every numbered skill, without a renderer. */
function allKeys(code: boolean): { oldPoints: number; oldRings: number; maxPoints: number; dropped: number; stars: number } {
  const { stage, layer, tex, camera } = setup(code);
  const field = targets();
  const caster = (out: { x: number; z: number; fx: number; fz: number }): void => { out.x = 0; out.z = 3; out.fx = 0; out.fz = -1; };
  const hand = (out: THREE.Vector3): void => { out.set(0.3, 1.2, 2.8); };
  const sword = new SwordSkillFx({ layer, camera, targets: field, caster, hand, flash() {}, impulse() {}, hitStop() {}, moveCaster() {}, play() {} }, tex, "high");
  const river = new MyriadSwordsFx({ layer, camera, targets: field, caster, hand, struck() {}, phase() {}, flyby() {}, flash() {} },
    { glow: tex.glow, slash: tex.slash, star: tex.star, ring: tex.ring, scorch: tex.scorch, noise: tex.trace }, { mid: 24, far: 64 });
  sword.setElement(FIRE, stage);
  river.setElement(FIRE, stage);
  let oldPoints = 0, oldRings = 0, maxPoints = 0, stars = 0;
  const pe = vi.spyOn(FirePointPool.prototype, "emit");
  const re = vi.spyOn(HeatRingPool.prototype, "emit");
  const spawn = FlipbookPool.prototype.spawn;
  const sp = vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, options) {
    if (this.id === "fire-twinkle-set") stars += 1;
    spawn.call(this, at, size, options);
  });
  const step = (): void => {
    stage.begin(); sword.update(STEP); river.update(STEP); stage.update(STEP);
    layer.traverse((o) => {
      if (o.name === "fx-fire-points") oldPoints = Math.max(oldPoints, (o as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount);
      if (o.name.startsWith("fx-heat-ring")) oldRings = Math.max(oldRings, (o as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount);
      if (o.name === "flipbook-fire-twinkle-set") maxPoints = Math.max(maxPoints, (o as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount);
    });
  };
  try {
    for (const slot of ["k1", "k2", "guard", "dash", "k4", "k5"] as const) {
      sword.cast(slot, 0, -6);
      for (let frame = 0; frame < 240; frame += 1) step();
    }
    sword.burst("k1", 3, "k7");
    river.cast();
    for (let frame = 0; frame < 360; frame += 1) step();
    // Plant belongs to the host's pinned-victim path; cover it explicitly as well.
    stage.hooksOf(FIRE).stream!.plant!({ x: 1, z: -5, dx: 0, dz: -1 });
    step();
    if (code) {
      expect(pe).toHaveBeenCalled(); expect(re).toHaveBeenCalled();
    } else {
      expect(pe).not.toHaveBeenCalled(); expect(re).not.toHaveBeenCalled();
      expect(layer.getObjectByName("fx-fire-points")).toBeUndefined();
      expect(layer.children.filter((o) => o.name.startsWith("fx-heat-ring"))).toEqual([]);
    }
    return { oldPoints, oldRings, maxPoints, dropped: code ? 0 : pool(stage, "fire-twinkle-set").dropped, stars };
  } finally {
    pe.mockRestore(); re.mockRestore(); sp.mockRestore(); stage.flipbooks.dispose();
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); FIRE_LAB.impact = "brush"; });

describe("Fire lot 1: authored small layers (ticket 277)", () => {
  it("keeps both old pool counts at zero through keys 1–7 and fits the 256-point budget", () => {
    const result = allKeys(false);
    console.info("277 keys 1–7:", result);
    expect(result.oldPoints).toBe(0); expect(result.oldRings).toBe(0);
    expect(result.stars).toBeGreaterThan(100);
    expect(result.maxPoints).toBeGreaterThan(0);
    expect(result.maxPoints).toBeLessThanOrEqual(256);
    expect(result.dropped).toBe(0);
  });

  it("keeps the code path behind ?fxcode=1, including the old first release and plant specs", () => {
    const result = allKeys(true);
    expect(result.oldPoints).toBeGreaterThan(0); expect(result.oldRings).toBeGreaterThan(0); expect(result.stars).toBe(0);
    const { stage } = setup(true);
    const points: unknown[] = [], rings: unknown[] = [];
    vi.spyOn(FirePointPool.prototype, "emit").mockImplementation(function (this: FirePointPool) { points.push({ ...this.spec }); return true; });
    vi.spyOn(HeatRingPool.prototype, "emit").mockImplementation(function (this: HeatRingPool) { rings.push({ ...this.spec }); });
    const hooks = stage.hooksOf(FIRE);
    hooks.sword!.release!({ slot: "k1", skill: "k1", tier: 1, at: new THREE.Vector3(0.3, 1.2, 2.8), caster: { x: 0, z: 3, fx: 0, fz: -1 }, ringM: 2, size: 1, intensity: 1, hand: new THREE.Vector3(0.3, 1.2, 2.8), pal: undefined as never });
    hooks.stream!.plant!({ x: 1, z: -5, dx: 0, dz: -1 });
    expect(points).toMatchObject([{ reach: 0.62, core: 0.18, life: 0.24, heat: 1, tongues: 9 }, { reach: 0.85, core: 0.22, life: 0.34, heat: 1, tongues: 11 }]);
    expect(rings).toMatchObject([{ r0: 0.25, r1: 1.3, life: 0.3, width: 0.14 }, { r0: 0.2, r1: 1.4, life: 0.62, width: 0.11 }]);
    stage.flipbooks.dispose();
  });

  it("draws stars, hand and ground rings at peak light on age zero, with random rows and small river hits", () => {
    const { stage } = setup();
    const hooks = stage.hooksOf(FIRE);
    const star = pool(stage, "fire-twinkle-set");
    const sizes: number[] = [];
    const original = FlipbookPool.prototype.spawn;
    vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, options) {
      if (this.id === star.id) sizes.push(size);
      original.call(this, at, size, options);
    });
    hooks.sword!.release!({ slot: "k1", skill: "k1", tier: 1, at: new THREE.Vector3(0.3, 1.2, 2.8), caster: { x: 0, z: 3, fx: 0, fz: -1 }, ringM: 2, size: 1, intensity: 1, hand: new THREE.Vector3(0.3, 1.2, 2.8), pal: undefined as never });
    hooks.stream!.plant!({ x: 1, z: -5, dx: 0, dz: -1 });
    for (let i = 0; i < 32; i += 1) hooks.stream!.strike!({ x: 1, y: 0.5, z: -5, dx: 0, dz: -1, k: 0.9 });
    stage.update(0);
    const data = star.mesh.geometry.getAttribute("iData");
    const variant = star.mesh.geometry.getAttribute("iVar");
    const rows = new Set<number>();
    for (let i = 0; i < star.live; i += 1) {
      const row = variant.getX(i) / 16;
      rows.add(row);
      expect(data.getZ(i)).toBe(PEAKS[row]);
      expect(data.getW(i)).toBe(1);
    }
    expect(rows.size).toBeGreaterThan(1);
    expect(sizes.slice(0, 2)).toEqual([1.24, 1.7]);
    for (const size of sizes.slice(2)) expect(size).toBeCloseTo(2 * 0.38 * 0.9);
    for (const [id, peak] of [["fire-halo-ring", 19], ["fire-halo-seal-loop", 5]] as const) {
      const p = pool(stage, id), d = p.mesh.geometry.getAttribute("iData");
      expect(p.live).toBe(1); expect(d.getZ(0)).toBe(peak); expect(d.getW(0)).toBe(1);
      expect(p.mesh.geometry.getAttribute("iDir").getW(0)).toBe(0);
      expect(p.mesh.geometry.getAttribute("iAge").getX(0)).toBe(0);
    }
    const seal = pool(stage, "fire-halo-seal-loop");
    expect(seal.mesh.geometry.getAttribute("iAge").getY(0)).toBeCloseTo(0.7);
    stage.update(0.3); stage.update(0);
    expect(pool(stage, "fire-halo-ring").live).toBe(0);
    stage.update(0.32); stage.update(0);
    expect(seal.live).toBe(0);
    // Fake each cell's mean light, independent of runtime metadata. Sample the uploaded frames over time.
    stage.reset();
    for (let i = 0; i < 32; i += 1) hooks.stream!.strike!({ x: 1, y: 0.5, z: -5, dx: 0, dz: -1, k: 0.9 });
    const light = (row: number, frame: number): number => frame === PEAKS[row] ? 1 : 0.1;
    let first = 0, peak = 0;
    for (let tick = 0; tick < 12; tick += 1) {
      star.update(STEP);
      let sum = 0;
      for (let i = 0; i < star.live; i += 1) {
        const row = variant.getX(i) / 16;
        const frame = Math.min(15, data.getZ(i));
        const f0 = Math.floor(frame), f1 = Math.min(15, f0 + 1), mix = frame - f0;
        sum += (light(row, f0) * (1 - mix) + light(row, f1) * mix) * data.getW(i);
      }
      if (tick === 0) first = sum;
      peak = Math.max(peak, sum);
    }
    expect(first).toBe(32); expect(first).toBe(peak);
    stage.flipbooks.dispose();
  });

  it("places and scrolls the real strips flat along dir/span, without legacy beams", () => {
    const { stage } = setup();
    const hooks = stage.hooksOf(FIRE).stream!;
    const calls: { size: number; at: THREE.Vector3; options: FlipOptions }[] = [];
    const original = FlipbookPool.prototype.spawn;
    vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, options = {}) {
      if (this.id === STRIP) calls.push({ size, at: at.clone(), options: { ...options, dir: options.dir?.clone() } });
      original.call(this, at, size, options);
    });
    hooks.finisher!({ ax: -5, az: -6, bx: 5, bz: -6 });
    hooks.cutSeam!({ target: 0, ux: 1, uz: 0, x: 0, y: 0.5, z: -6, dx: 1, dy: 0.2, dz: 0, len: 2 });
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.options.span)).toEqual([13, 2.1]);
    for (const c of calls) { expect(c.options.dir!.y).toBe(0); expect(c.at.y).toBe(0.08); }
    const strip = pool(stage, STRIP);
    const shader = { vertexShader: strip.mesh.material.vertexShader, fragmentShader: strip.mesh.material.fragmentShader, uniforms: { ...strip.mesh.material.uniforms } };
    strip.mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    expect(shader.vertexShader).toContain("vec3(corner.x, 0.0, corner.y)");
    expect(shader.fragmentShader).toContain("fract(uv.x * repeats - vFrame * (0.5 / 24.0) + vAge.z)");
    // Motion uses each card's clock even without a SwordSkillFx.frame() call.
    strip.update(0.1); strip.update(0);
    expect(strip.mesh.geometry.getAttribute("iData").getZ(0)).toBeCloseTo(2.4);
    stage.flipbooks.dispose();
  });
  it("keeps unchanged ember, sprite and existing-art emissions identical in A/B", () => {
    const run = (code: boolean): unknown[] => {
      const { stage } = setup(code);
      const events: unknown[] = [];
      const ee = vi.spyOn(EmberPool.prototype, "emit").mockImplementation(function (this: EmberPool) { events.push(["ember", { ...this.spec }]); return true; });
      const se = vi.spyOn(SpritePool.prototype, "emit").mockImplementation(function (this: SpritePool) { events.push(["sprite", this.mesh.name, { ...this.spec }]); });
      const de = vi.spyOn(GroundDecalPool.prototype, "spawn").mockImplementation((...args) => { events.push(["decal", ...args]); });
      const fe = vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, o = {}) {
        if (["fire-twinkle-set", "fire-halo-ring", "fire-halo-seal-loop", STRIP, "dragonhold-flame-trail"].includes(this.id)) return;
        events.push([this.id, at.clone(), size, { ...o, dir: o.dir?.clone() }]);
      });
      try {
        const hooks = stage.hooksOf(FIRE);
        hooks.sword!.release!({ slot: "k1", skill: "k1", tier: 1, at: new THREE.Vector3(0.3, 1.2, 2.8), caster: { x: 0, z: 3, fx: 0, fz: -1 }, ringM: 2, size: 1, intensity: 1, hand: new THREE.Vector3(), pal: undefined as never });
        hooks.stream!.plant!({ x: 1, z: -5, dx: 0, dz: -1 });
        hooks.stream!.finisher!({ ax: -5, az: -6, bx: 5, bz: -6 });
        hooks.stream!.cutSeam!({ target: 0, ux: 1, uz: 0, x: 0, y: 0.5, z: -6, dx: 1, dy: 0, dz: 0, len: 2 });
        return events;
      } finally { ee.mockRestore(); se.mockRestore(); de.mockRestore(); fe.mockRestore(); stage.flipbooks.dispose(); }
    };
    expect(run(false)).toEqual(run(true));
  });

  it("loads the v2 strip through the fire library from the existing art URL", async () => {
    const { stage } = setup(true);
    // The memory library's load has already settled; no HTTP/fetch is needed for this test.
    await stage.flipbooks.library("fire").load();
    vi.stubGlobal("location", { search: "", protocol: "http:" });
    const texture = new THREE.Texture();
    let finish!: (t: THREE.Texture) => void;
    const pending = new Promise<THREE.Texture>((resolve) => { finish = resolve; });
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(pending);
    const next = new ElementStage({ layer: new THREE.Group(), camera: new THREE.PerspectiveCamera(), quality: "high", textures: sheets(), texture: () => texture, vfxBase: "/art-src/lab/vfx/" });
    const scene = new THREE.Scene();
    scene.add(next.layer);
    // Seed a settled load before attaching the kit, so no image/manifest request is issued.
    vi.stubGlobal("location", { search: "" });
    await next.flipbooks.library("fire").load();
    await next.flipbooks.library("fire/impact-k1-r2").load();
    vi.stubGlobal("location", { search: "", protocol: "http:" });
    next.hooksOf(FIRE);
    const post = new THREE.WebGLRenderTarget(1, 1);
    let target: THREE.WebGLRenderTarget | null = post;
    const compile = vi.fn((root: THREE.Object3D, camera: THREE.Camera) => {
      expect(root).toBe(scene); expect(camera).toBe(next.camera); expect(target).toBe(post);
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      expect(meshes).toContain(pool(next, STRIP).mesh);
      expect(pool(next, STRIP).mesh.visible).toBe(true);
    });
    const initTexture = vi.fn();
    const renderer = { initTexture, compile, getRenderTarget: () => target, setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { target = t; } };
    const warming = prewarmFire(next, renderer as unknown as THREE.WebGLRenderer, next.camera, scene);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(compile).not.toHaveBeenCalled();
    target = null; // A lab frame rendered to the screen while the image was pending.
    finish(texture);
    await warming;
    expect(target).toBeNull();
    expect(load).toHaveBeenCalledExactlyOnceWith("/art-src/lab/vfx/aura/strips/strip-fire-sheath-v2.rgba.png");
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(pool(next, STRIP).meta).toMatchObject({ frames: 1, cols: 1, rows: 1, loop: true, aspect: 4 });
    expect(initTexture).toHaveBeenCalledWith(texture);
    expect(compile).toHaveBeenCalledExactlyOnceWith(scene, next.camera);
    stage.flipbooks.dispose(); next.flipbooks.dispose(); post.dispose();
  });

  it("prewarms the final masked brush, flash and lot-1 programs without changing live effects", async () => {
    const { stage, camera } = setup();
    const scene = new THREE.Scene();
    scene.add(stage.layer);
    const t = new THREE.Texture();
    stage.flipbooks.library(BRUSH.folder).add({ id: BRUSH.id, url: "", cols: 6, rows: 4, frames: 24, fps: 24,
      loop: false, loopMode: "none", timingProfile: "impact-key1", mode: "rgba", aspect: 1,
      pivot: [0.306481, 0.737963], start: 0, heading: 81 * Math.PI / 180 }, t, { a: t, b: t });
    const hooks = stage.hooksOf(FIRE).stream!;
    hooks.strike!({ x: 1, y: 0.5, z: -5, dx: 0, dz: -1, k: 0.9 });
    stage.update(STEP);
    stage.rand.reseed(278);
    const star = pool(stage, "fire-twinkle-set");
    const before = { time: stage.time, live: star.live, data: Array.from(star.mesh.geometry.getAttribute("iData").array), audit: { ...FIRE_LAB.audit } };
    const compiled = new Map<string, THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>>();
    const compile = vi.fn((root: THREE.Object3D, cam: THREE.Camera) => {
      expect(root).toBe(scene); expect(cam).toBe(camera);
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mesh = o as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
        expect(mesh.visible).toBe(true);
        const material = mesh.material;
        const shader = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: { ...material.uniforms } };
        material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, undefined as never);
        if (mesh === pool(stage, STRIP).mesh) expect(shader.fragmentShader).toContain("fract(uv.x * repeats");
        compiled.set(mesh.name, mesh);
      });
    });
    const renderer = { initTexture: vi.fn(), compile, getRenderTarget: () => null, setRenderTarget: vi.fn() };
    try {
      await prewarmFire(stage, renderer as unknown as THREE.WebGLRenderer, camera, scene);
      expect(compile).toHaveBeenCalledExactlyOnceWith(scene, camera);
      for (const name of ["flipbook-" + BRUSH.id, "fx-fire-flash", "flipbook-fire-twinkle-set", "flipbook-fire-halo-ring", "flipbook-fire-halo-seal-loop", "flipbook-" + STRIP]) expect(compiled.has(name)).toBe(true);
      expect(compiled.get("flipbook-" + BRUSH.id)!.material.defines).toMatchObject({ FB_CTRL_A: 1, FB_CTRL_B: 1, FB_LOOP: 0 });
      expect(star.mesh.visible).toBe(true);
      expect(compiled.get("fx-fire-flash")!.visible).toBe(false);
      expect({ time: stage.time, live: star.live, data: Array.from(star.mesh.geometry.getAttribute("iData").array), audit: { ...FIRE_LAB.audit } }).toEqual(before);
      expect(stage.rand.next()).toBe(new Rand(278).next());
      // Restore the hidden flag even if the renderer fails during compilation.
      const fail = vi.fn(() => { throw new Error("compile failed"); });
      await expect(prewarmFire(stage, { ...renderer, compile: fail } as unknown as THREE.WebGLRenderer, camera, scene)).rejects.toThrow("compile failed");
      expect(compiled.get("flipbook-" + BRUSH.id)!.visible).toBe(false);
    } finally { stage.flipbooks.dispose(); }
  });

});
