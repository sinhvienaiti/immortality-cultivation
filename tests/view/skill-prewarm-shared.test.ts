import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { createSkillNumbers } from "../../src/view/hitfx";
import { prewarmScene, type Renderer3D } from "../../src/view/renderer";
import { ScreenFx } from "../../src/view/screen-fx";
import { BRUSH, FIRE, FIRE_LAB, prewarmFire, resetFireAudit } from "../../src/view/skills/element-fire";
import { METAL } from "../../src/view/skills/element-metal";
import { ElementStage } from "../../src/view/skills/element-stage";
import { Rand, SpritePool } from "../../src/view/skills/fxkit";
import { QiSlash } from "../../src/view/skills/qi-slash";
import type { FlipbookMeta } from "../../src/view/skills/flipbook";
import type { SwordSkillTextures } from "../../src/view/skills/sword-skills";

function texture(name: string): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
  t.name = name;
  t.needsUpdate = true;
  return t;
}

function setup() {
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  const scene = new THREE.Scene(), layer = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  scene.add(layer, new THREE.DirectionalLight());
  scene.fog = new THREE.Fog(0x123456, 5, 100);
  const burst = texture("burst-star-mask"), slash = texture("slash-crescent-mask"), sheet = texture("sheet");
  const textures: SwordSkillTextures = { glow: sheet, slash: sheet, splash: sheet, smoke: sheet, flare: sheet,
    star: sheet, spark: sheet, trace: sheet, mote: sheet, scorch: sheet, ring: sheet, shock: sheet, halo: sheet, twirl: sheet };
  const stage = new ElementStage({ layer, camera, quality: "high", textures, texture: () => sheet, vfxBase: "/v/" });
  for (const id of ["fire-twinkle-set", "fire-halo-ring", "fire-halo-seal-loop", "strip-fire-sheath-v2",
    "fire-burst", "fire-charge", "fire-sparks", "fire-ground", "dragonhold-flame-trail", "fire-trail"]) {
    const meta: FlipbookMeta = { id, url: "", cols: 6, rows: 4, frames: 24, fps: 24, loop: false,
      mode: "rgba", pivot: [0.5, 0.5], aspect: 1, start: 0, heading: 0 };
    stage.flipbooks.library("fire").add(meta, texture(id));
  }
  stage.flipbooks.library(BRUSH.folder).add({ id: BRUSH.id, url: "", cols: 6, rows: 4, frames: 24, fps: 24,
    loop: false, mode: "rgba", pivot: [0.5, 0.5], aspect: 1, start: 0, heading: 0,
    timingProfile: "impact-key1", loopMode: "none" }, texture("brush"), { a: texture("mask-a"), b: texture("mask-b") });
  stage.hooksOf(FIRE);
  const metal = new SpritePool(4, sheet, "add");
  layer.add(metal.mesh);
  const qi = new QiSlash(slash, 15);
  layer.add(qi.mesh);
  const shadow = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  shadow.castShadow = true;
  shadow.visible = false;
  shadow.customDepthMaterial = new THREE.MeshDepthMaterial();
  scene.add(shadow);
  const numbers = createSkillNumbers({ addOverlay: () => () => {} } as unknown as Renderer3D, 140);
  const screen = new ScreenFx({ composer: { passes: [], insertPass: vi.fn() } as unknown as EffectComposer,
    composerOn: () => true, addOverlay: () => () => {} });
  screen.setShapes({ burst, slash });
  const template = new THREE.WebGLRenderTarget(320, 180, { type: THREE.HalfFloatType });
  template.samples = 4;
  let target: THREE.WebGLRenderTarget | null = template;
  const initTexture = vi.fn(), compile = vi.fn(), render = vi.fn();
  const programs = [{ id: 17, name: "shared", cacheKey: "shared-key" }];
  const renderer = { initTexture, compile, render, info: { programs }, getRenderTarget: () => target,
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: false },
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { target = t; } } as unknown as THREE.WebGLRenderer;
  return { scene, layer, camera, stage, metal, qi, shadow, numbers, screen, burst, slash, sheet, template, renderer,
    initTexture, compile, render, getTarget: () => target,
    dispose: () => { screen.dispose(); numbers.dispose(); stage.flipbooks.dispose(); template.dispose(); } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetFireAudit(); });

describe("shared skill GPU prewarm (ticket 283)", () => {
  it.each([FIRE, METAL])("uploads masks/numbers and draws exactly one 64×64 frame for $id, then leaves every pool empty", async (kit) => {
    const f = setup();
    try {
      await prewarmFire(f.stage, f.renderer, f.camera, f.scene);
      f.initTexture.mockClear(); f.compile.mockClear();
      const masks = f.screen.prewarmTextures(f.renderer);
      expect(f.initTexture).toHaveBeenCalledWith(f.burst);
      expect(f.initTexture).toHaveBeenCalledWith(f.slash);
      f.initTexture.mockClear();
      const audit = { ...FIRE_LAB.audit };
      const before = new Map<THREE.Object3D, boolean>();
      f.scene.traverse((o) => before.set(o, o.visible));
      const rand = f.stage.rand.next();
      const next = new Rand(4409);
      expect(next.next()).toBe(rand);
      const emit = vi.spyOn(SpritePool.prototype, "emit");
      let small!: THREE.WebGLRenderTarget;
      const disposed = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
      f.render.mockImplementation((scene, camera) => {
        expect(scene).toBe(f.scene); expect(camera).toBe(f.camera);
        small = f.getTarget()!;
        expect([small.width, small.height, small.texture.type, small.texture.format, small.texture.colorSpace, small.samples])
          .toEqual([64, 64, f.template.texture.type, f.template.texture.format, f.template.texture.colorSpace, 4]);
        expect(small).not.toBe(f.template);
        expect(f.shadow.visible).toBe(true);
        expect(f.qi.mesh.visible).toBe(true);
        expect((f.qi.mesh.material as THREE.ShaderMaterial).uniforms.uFade!.value).toBe(1);
        scene.traverse((o: THREE.Object3D) => {
          const g = (o as THREE.Mesh).geometry;
          if (!(g instanceof THREE.InstancedBufferGeometry)) return;
          expect(g.instanceCount).toBe(1);
          const age = g.getAttribute("iAge");
          if (age !== undefined) expect(age.getX(0)).toBe(0);
        });
        expect(f.numbers.field.age.every((age) => age === 0)).toBe(true);
      });
      const result = f.numbers.prewarm(f.scene, () => f.stage.prewarm(kit, f.renderer, f.scene, f.template, masks));
      expect(f.render).toHaveBeenCalledExactlyOnceWith(f.scene, f.camera);
      expect(f.compile).toHaveBeenCalledTimes(2);
      expect(f.compile.mock.calls.every(([scene, camera]) => scene === f.scene && camera === f.camera)).toBe(true);
      expect(f.initTexture.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.compile.mock.invocationCallOrder[0]!);
      expect(f.compile.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.render.mock.invocationCallOrder[0]!);
      expect(f.initTexture).toHaveBeenCalledWith(f.burst);
      expect(f.initTexture).toHaveBeenCalledWith(f.slash);
      const atlas = f.initTexture.mock.calls.map(([t]) => t as THREE.Texture).find((t) => t instanceof THREE.CanvasTexture)!;
      expect([atlas.image.width, atlas.image.height]).toEqual([1024, 256]);
      expect(new Set(f.initTexture.mock.calls.map(([t]) => t)).size).toBe(f.initTexture.mock.calls.length);
      expect(result.element).toBe(kit.id); expect(result.renders).toBe(1);
      expect(result.textures.map((t) => t.id)).toContain(atlas.id);
      expect(result.programs).toEqual([{ id: 17, name: "shared", cacheKey: "shared-key" }]);
      expect(result.objects.find((o) => o.materials.includes(f.shadow.material.id))?.shadow).toBe(true);
      expect(disposed.mock.contexts).toContain(small);
      for (const [o, visible] of before) expect(o.visible).toBe(visible);
      f.layer.traverse((o) => { const g = (o as THREE.Mesh).geometry;
        if (g instanceof THREE.InstancedBufferGeometry) expect(g.instanceCount).toBe(0); });
      expect(f.metal.count).toBe(0); expect(f.stage.flipbooks.live).toBe(0); expect(f.numbers.live).toBe(0);
      expect(f.stage.time).toBe(0); expect(FIRE_LAB.audit).toEqual(audit); expect(emit).not.toHaveBeenCalled();
      expect(f.stage.rand.next()).toBe(next.next());
      expect(f.getTarget()).toBe(f.template); expect(f.qi.mesh.visible).toBe(false);
      expect((f.qi.mesh.material as THREE.ShaderMaterial).uniforms.uFade!.value).toBe(0);
      expect(f.scene.children).toHaveLength(3);
    } finally { f.dispose(); }
  });

  it.each(["compile", "render", "upload"])("restores visibility, buffers, uniforms, overlays and the target after a %s failure", (failure) => {
    const f = setup();
    const visible = f.metal.mesh.visible;
    const g = f.metal.mesh.geometry;
    const before = Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => [name, [...a.array]]));
    const disposed = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    try {
      const fn = failure === "upload" ? f.initTexture : failure === "compile" ? f.compile : f.render;
      fn.mockImplementationOnce(() => { throw new Error(failure); });
      expect(() => f.numbers.prewarm(f.scene, () => f.stage.prewarm(METAL, f.renderer, f.scene, f.template, [f.burst])))
        .toThrow(failure);
      expect(f.metal.mesh.visible).toBe(visible); expect(f.metal.count).toBe(0);
      expect((g as THREE.InstancedBufferGeometry).instanceCount).toBe(0);
      for (const [name, a] of Object.entries(g.attributes)) expect([...a.array]).toEqual(before[name]);
      expect(f.numbers.live).toBe(0); expect(f.stage.flipbooks.live).toBe(0); expect(f.stage.time).toBe(0);
      expect(f.getTarget()).toBe(f.template); expect(f.scene.children).toHaveLength(3);
      // setSize invalidates the cloned target once, and finally disposes its warmed allocation.
      expect(disposed.mock.calls).toHaveLength(2);
      expect(new Set(disposed.mock.contexts).size).toBe(1);
      expect(disposed.mock.contexts[0]).not.toBe(f.template);
      if (failure !== "render") expect(f.render).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("preserves live cards and shader uniforms, reuses the real number atlas, and never uploads render-target textures", () => {
    const f = setup();
    try {
      f.metal.spec.reset(); f.metal.emit(); f.metal.update(0);
      const g = f.metal.mesh.geometry as THREE.InstancedBufferGeometry;
      const data = [...g.getAttribute("iPos").array];
      const qi = f.qi.mesh.material as THREE.ShaderMaterial;
      const uniforms = Object.fromEntries(Object.entries(qi.uniforms).map(([name, u]) => [name, u.value?.clone?.() ?? u.value]));
      const version = f.slash.version;
      f.render.mockImplementation(() => { (qi.uniforms.uView!.value as THREE.Vector2).set(64, 64); });
      const first = f.numbers.prewarm(f.scene, () => prewarmScene(f.renderer, f.scene, f.camera, f.template, [f.template.texture]));
      const second = f.numbers.prewarm(f.scene, () => prewarmScene(f.renderer, f.scene, f.camera, f.template));
      expect(f.metal.count).toBe(1); expect(g.instanceCount).toBe(1); expect([...g.getAttribute("iPos").array]).toEqual(data);
      for (const [name, u] of Object.entries(qi.uniforms)) {
        if (u.value instanceof THREE.Texture) expect(u.value).toBe(f.slash);
        else expect(u.value).toEqual(uniforms[name]);
      }
      expect(f.slash.version).toBe(version);
      const atlasIds = [first, second].map((r) => r.textures.find((t) => !t.name.includes("mask") &&
        f.initTexture.mock.calls.some(([texture]) => texture.id === t.id && texture instanceof THREE.CanvasTexture))!.id);
      expect(atlasIds[0]).toBe(atlasIds[1]);
      expect(f.initTexture.mock.calls.some(([t]) => t === f.template.texture)).toBe(false);
      expect(f.render).toHaveBeenCalledTimes(2);
    } finally { f.dispose(); }
  });
});

describe("late impact and mapped shadow programs (ticket 286)", () => {
  it.each(["success", "compile", "render"])("draws mapped skinned/instanced shadows and restores their state after %s", (outcome) => {
    const f = setup();
    const geometry = new THREE.BoxGeometry();
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(24 * 4), 4));
    const weights = new Float32Array(24 * 4);
    for (let i = 0; i < 24; i += 1) weights[i * 4] = 1;
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const material = new THREE.MeshStandardMaterial({ map: f.sheet });
    const skinned = new THREE.SkinnedMesh(geometry, material);
    const bone = new THREE.Bone();
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    const instanced = new THREE.InstancedMesh(geometry, material, 1);
    const matrix = new THREE.Matrix4().makeTranslation(9, 8, 7);
    instanced.setMatrixAt(0, matrix);
    instanced.count = 0;
    skinned.visible = instanced.visible = false;
    // Check both an existing shadow caster and one enabled only for warmup.
    skinned.castShadow = outcome === "success";
    const castShadow = skinned.castShadow;
    f.scene.add(skinned, instanced);
    const light = f.scene.children.find((o) => o instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    light.castShadow = true;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    f.renderer.shadowMap.autoUpdate = false;
    f.renderer.shadowMap.needsUpdate = true;
    const children = [...f.scene.children];
    const check = (): void => {
      expect(skinned.castShadow).toBe(true); expect(instanced.castShadow).toBe(true);
      expect(skinned.material.map).toBe(f.sheet); expect(instanced.material.map).toBe(f.sheet);
      expect(skinned.customDepthMaterial).toBeUndefined(); expect(instanced.customDepthMaterial).toBeUndefined();
      expect(skinned.visible).toBe(true); expect(instanced.visible).toBe(true); expect(instanced.count).toBe(1);
      expect(f.renderer.shadowMap.enabled).toBe(true); expect(f.renderer.shadowMap.autoUpdate).toBe(true);
      expect(light.shadow.autoUpdate).toBe(true);
    };
    f.compile.mockImplementation(() => { check(); if (outcome === "compile") throw new Error(outcome); });
    f.render.mockImplementation(() => {
      check(); expect(f.getTarget()).not.toBeNull();
      // Three consumes these flags while drawing the shadow maps.
      f.renderer.shadowMap.needsUpdate = light.shadow.needsUpdate = false;
      if (outcome === "render") throw new Error(outcome);
    });
    try {
      const warm = (): unknown => f.numbers.prewarm(f.scene, () => f.stage.prewarm(METAL, f.renderer, f.scene, f.template));
      if (outcome === "success") {
        warm(); expect(f.render).toHaveBeenCalledExactlyOnceWith(f.scene, f.camera);
      } else expect(warm).toThrow(outcome);
      expect(skinned.castShadow).toBe(castShadow); expect(instanced.castShadow).toBe(false);
      expect(skinned.visible).toBe(false); expect(instanced.visible).toBe(false);
      expect(skinned.frustumCulled).toBe(true); expect(instanced.frustumCulled).toBe(true);
      expect(instanced.count).toBe(0);
      const restored = new THREE.Matrix4(); instanced.getMatrixAt(0, restored);
      expect(restored).toEqual(matrix);
      expect(f.renderer.shadowMap.autoUpdate).toBe(false); expect(f.renderer.shadowMap.needsUpdate).toBe(true);
      expect(light.shadow.autoUpdate).toBe(false); expect(light.shadow.needsUpdate).toBe(true);
      expect(f.scene.children).toEqual(children); expect(f.getTarget()).toBe(f.template);
      expect(f.numbers.live).toBe(0); expect(f.stage.flipbooks.live).toBe(0); expect(f.metal.count).toBe(0);
    } finally { skinned.skeleton.dispose(); instanced.dispose(); geometry.dispose(); material.dispose(); f.dispose(); }
  });

  it.each([FIRE, METAL])("warms the $id impact display variant without drawing to the display or changing live uniforms", (kit) => {
    const f = setup();
    f.screen.setAccent(kit.screen.flash?.tint ?? null, kit.screen.frames ?? null);
    const shown = { ...f.screen.shown };
    let sample!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const disposed = vi.spyOn(THREE.PlaneGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    let samplers!: unknown[];
    const names = ["tDiffuse", "tMask", "tShapeA", "tShapeB"];
    f.compile.mockImplementation((scene: THREE.Scene, camera: THREE.Camera) => {
      expect(f.getTarget()).toBeNull(); expect(camera).toBeInstanceOf(THREE.OrthographicCamera);
      expect(scene.fog).toBeNull(); expect(scene.children).toHaveLength(1);
      sample = scene.children[0] as typeof sample;
      expect(sample.material.vertexShader).toContain("varying vec2 vUv");
      expect(sample.material.fragmentShader).toContain("vec3 fireBurst");
      expect(sample.material.defines).toEqual(kit === FIRE ? { ROLES: "" } : {});
      samplers = names.map((name) => sample.material.uniforms[name]!.value);
    });
    f.render.mockImplementation((mesh: THREE.Mesh) => {
      expect(f.getTarget()).not.toBeNull();
      expect(mesh.material).toBe(sample.material);
    });
    try {
      expect(f.screen.prewarm(f.renderer)).toEqual([f.burst, f.slash]);
      expect(f.compile).toHaveBeenCalledTimes(1); expect(f.render).toHaveBeenCalledTimes(1);
      expect(f.compile.mock.invocationCallOrder[0]!).toBeLessThan(f.render.mock.invocationCallOrder[0]!);
      expect(names.map((name) => sample.material.uniforms[name]!.value)).toEqual([null, null, null, null]);
      expect(samplers.every((value) => value instanceof THREE.Texture)).toBe(true);
      expect(sample.parent).toBeNull(); expect(disposed.mock.contexts).toContain(sample.geometry);
      expect(materialDispose.mock.contexts).not.toContain(sample.material);
      expect(f.screen.shown).toEqual(shown); expect(f.getTarget()).toBe(f.template);
    } finally { f.dispose(); }
  });

  it.each(["mask", "compile", "render"])("restores the impact target, samplers and temporary quad after a %s failure", (failure) => {
    const f = setup();
    const insertPass = vi.fn();
    const screen = new ScreenFx({ composer: { passes: [], insertPass } as unknown as EffectComposer,
      composerOn: () => true, addOverlay: () => () => {}, drawActorMask: () => {
        if (failure === "mask") { f.renderer.setRenderTarget(null); throw new Error(failure); }
      } });
    const pass = insertPass.mock.calls[1]![0] as { uniforms: Record<string, THREE.IUniform> };
    const names = ["tDiffuse", "tMask", "tShapeA", "tShapeB"];
    const saved = [f.sheet, null, f.burst, f.slash];
    names.forEach((name, i) => { pass.uniforms[name]!.value = saved[i]; });
    const disposed = vi.spyOn(THREE.PlaneGeometry.prototype, "dispose");
    let sample: THREE.Mesh | undefined;
    f.compile.mockImplementation((scene: THREE.Scene) => {
      sample = scene.children[0] as THREE.Mesh;
      if (failure === "compile") throw new Error(failure);
    });
    f.render.mockImplementation(() => { throw new Error(failure); });
    try {
      expect(() => screen.prewarm(f.renderer)).toThrow(failure);
      expect(f.getTarget()).toBe(f.template);
      expect(names.map((name) => pass.uniforms[name]!.value)).toEqual(saved);
      expect(disposed).toHaveBeenCalledTimes(1);
      if (sample !== undefined) expect(sample.parent).toBeNull();
      if (failure !== "render") expect(f.render).not.toHaveBeenCalled();
    } finally { screen.dispose(); f.dispose(); }
  });
});
