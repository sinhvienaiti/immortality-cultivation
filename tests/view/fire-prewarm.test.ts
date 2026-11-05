import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRUSH, FIRE, FIRE_LAB, firePrewarmStatus, prewarmFire, resetFireAudit } from "../../src/view/skills/element-fire";
import { ElementStage } from "../../src/view/skills/element-stage";
import type { FlipbookMeta } from "../../src/view/skills/flipbook";
import type { SwordSkillTextures } from "../../src/view/skills/sword-skills";

const IDS = ["fire-twinkle-set", "fire-halo-ring", "fire-halo-seal-loop", "strip-fire-sheath-v2",
  "fire-burst", "fire-charge", "fire-sparks", "fire-ground", "dragonhold-flame-trail", "fire-trail"];

function texture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

function meta(id: string): FlipbookMeta {
  return { id, url: "", cols: 6, rows: 4, frames: 24, fps: 24, loop: false, mode: "rgba",
    pivot: [0.5, 0.5], aspect: 1, start: 0, heading: 0 };
}

function setup(lateStrip?: Promise<THREE.Texture>, code = false) {
  const search = code ? "?fxcode=1" : "";
  vi.stubGlobal("location", { search });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x334455, 5, 100);
  scene.add(new THREE.HemisphereLight(), new THREE.DirectionalLight());
  const layer = new THREE.Group();
  scene.add(layer);
  const camera = new THREE.PerspectiveCamera();
  const glow = texture(), slash = texture(), splash = texture(), smoke = texture();
  const textures: SwordSkillTextures = { glow, slash, splash, smoke, flare: glow, star: glow, spark: glow,
    trace: glow, mote: glow, scorch: glow, ring: glow, shock: glow, halo: glow, twirl: glow };
  const stage = new ElementStage({ layer, camera, quality: "high", textures, texture: () => smoke, vfxBase: "/v/" });
  const atlases = IDS.filter((id) => lateStrip === undefined || id !== "strip-fire-sheath-v2").map((id) => {
    const t = texture();
    stage.flipbooks.library("fire").add(meta(id), t);
    return t;
  });
  const brush = texture(), a = texture(), b = texture();
  stage.flipbooks.library(BRUSH.folder).add({ ...meta(BRUSH.id), loopMode: "none", timingProfile: "impact-key1" }, brush, { a, b });
  if (lateStrip !== undefined) {
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(lateStrip);
    vi.stubGlobal("location", { search, protocol: "http:" });
  }
  stage.hooksOf(FIRE);
  const post = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  let target: THREE.WebGLRenderTarget | null = post;
  const initTexture = vi.fn();
  const compile = vi.fn((root: THREE.Object3D, cam: THREE.Camera) => {
    expect(root).toBe(scene); expect(cam).toBe(camera); expect(target).toBe(post);
    expect(root.getObjectByName("fx-fire-flash")!.visible).toBe(true);
    expect(root.getObjectByName("flipbook-" + BRUSH.id)!.visible).toBe(true);
    const material = stage.flipbooks.pool(BRUSH.folder, BRUSH.id).mesh.material;
    expect(material.defines).toMatchObject({ FB_CTRL_A: 1, FB_CTRL_B: 1, FB_LOOP: 0 });
  });
  const render = vi.fn();
  const renderer = { initTexture, compile, render, getRenderTarget: () => target,
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { target = t; } } as unknown as THREE.WebGLRenderer;
  return { stage, scene, camera, post, renderer, initTexture, compile, render, atlases,
    expected: [...atlases, brush, a, b, glow, slash, splash, smoke],
    setTarget: (t: THREE.WebGLRenderTarget | null) => { target = t; }, getTarget: () => target };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetFireAudit(); FIRE_LAB.slashTongues = false; });

describe("Fire texture upload and scene prewarm (ticket 280)", () => {
  it.each([
    { code: false, tongues: false },
    { code: true, tongues: false },
    { code: false, tongues: true },
    { code: true, tongues: true },
  ])("shares and prewarms the finisher strip while preserving comparisons (code=$code, tongues=$tongues)", async ({ code, tongues }) => {
    FIRE_LAB.slashTongues = tongues;
    let finish!: (t: THREE.Texture) => void;
    const f = setup(new Promise<THREE.Texture>((resolve) => { finish = resolve; }), code);
    const strip = texture();
    const slash = f.scene.getObjectByName("fx-flame-slash") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const wantsStrip = !code || !tongues;
    const compiled = f.compile.getMockImplementation()!;
    f.compile.mockImplementation((scene, camera) => {
      compiled(scene, camera);
      expect(slash.visible).toBe(true);
      expect(slash.material.fragmentShader).toContain("texture2D(tStrip, vec2(us, vs))");
      expect(slash.material.uniforms.tStrip!.value).toBe(tongues ? null : strip);
      expect(slash.material.uniforms.uHasStrip!.value).toBe(tongues ? 0 : 1);
      if (wantsStrip) expect(f.initTexture.mock.calls.filter(([t]) => t === strip)).toHaveLength(1);
    });
    try {
      const warming = prewarmFire(f.stage, f.renderer, f.camera, f.scene);
      if (wantsStrip) {
        await vi.waitFor(() => expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(1));
        expect(f.compile).not.toHaveBeenCalled();
        expect(slash.material.uniforms.tStrip!.value).toBeNull();
        finish(strip);
      }
      await warming;
      if (wantsStrip) {
        expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledExactlyOnceWith("/v/aura/strips/strip-fire-sheath-v2.rgba.png");
        expect(f.stage.flipbooks.library("fire").get("strip-fire-sheath-v2")!.texture).toBe(strip);
        expect(f.initTexture.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.compile.mock.invocationCallOrder[0]!);
      } else expect(THREE.TextureLoader.prototype.loadAsync).not.toHaveBeenCalled();
      const card = f.scene.getObjectByName("flipbook-strip-fire-sheath-v2") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
      expect(card === undefined).toBe(code);
      if (card !== undefined) expect(card.material.uniforms.uMap!.value).toBe(strip);
      expect(f.compile).toHaveBeenCalledExactlyOnceWith(f.scene, f.camera);
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(true);
      expect(slash.visible).toBe(false);
      expect(f.stage.time).toBe(0); expect(f.stage.flipbooks.live).toBe(0);
      expect(f.render).not.toHaveBeenCalled();
    } finally { f.stage.flipbooks.dispose(); f.post.dispose(); strip.dispose(); }
  });

  it("uploads every loaded Fire atlas, A/B mask and sprite/ground sampler once, then compiles the scene once", async () => {
    const f = setup();
    const { stage, renderer, scene, camera, initTexture, compile } = f;
    // A texture-bearing ground material must be covered too; unrelated clips must stay cold.
    const ground = texture(), unused = texture();
    const decal = stage.layer.children.find((o) => (o as THREE.Mesh).material !== undefined &&
      ((o as THREE.Mesh).material as THREE.ShaderMaterial).defines?.PROCEDURAL !== undefined) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    decal.material.uniforms.map!.value = ground;
    stage.flipbooks.library("fire").add(meta("unused-clip"), unused);
    const before = new Map<THREE.Object3D, boolean>();
    stage.layer.traverse((o) => before.set(o, o.visible));
    const audit = { ...FIRE_LAB.audit };
    try {
      expect(firePrewarmStatus(stage, renderer)).toEqual({ prewarmed: false, textureIds: [] });
      await prewarmFire(stage, renderer, camera, scene);
      for (const t of [...f.expected, ground]) expect(initTexture.mock.calls.filter(([value]) => value === t)).toHaveLength(1);
      expect(initTexture).toHaveBeenCalledTimes(f.expected.length + 2); // Ground map and the shared blank sampler.
      expect(initTexture.mock.calls.some(([t]) => t === unused)).toBe(false);
      expect(new Set(initTexture.mock.calls.map(([t]) => t)).size).toBe(initTexture.mock.calls.length);
      expect(compile).toHaveBeenCalledExactlyOnceWith(scene, camera);
      expect(initTexture.mock.invocationCallOrder.at(-1)!).toBeLessThan(compile.mock.invocationCallOrder[0]!);
      expect(f.render).not.toHaveBeenCalled();
      expect(firePrewarmStatus(stage, renderer)).toEqual({ prewarmed: true,
        textureIds: initTexture.mock.calls.map(([t]) => (t as THREE.Texture).id) });
      for (const [o, visible] of before) expect(o.visible).toBe(visible);
      expect(stage.time).toBe(0); expect(stage.flipbooks.live).toBe(0); expect(FIRE_LAB.audit).toEqual(audit);
      // Another target may need compilation, but shared texture uploads are renderer-local and reused.
      const count = initTexture.mock.calls.length;
      await prewarmFire(stage, renderer, camera, scene);
      expect(initTexture).toHaveBeenCalledTimes(count);
    } finally { stage.flipbooks.dispose(); f.post.dispose(); }
  });

  it("uploads each library after its load, waits for the late brush, and restores a target changed while awaiting media", async () => {
    const f = setup();
    const fire = f.stage.flipbooks.library("fire"), brush = f.stage.flipbooks.library(BRUSH.folder);
    let fireDone!: () => void, brushDone!: () => void;
    vi.spyOn(fire, "load").mockReturnValue(new Promise<void>((resolve) => { fireDone = resolve; }));
    vi.spyOn(brush, "load").mockReturnValue(new Promise<void>((resolve) => { brushDone = resolve; }));
    try {
      const pending = prewarmFire(f.stage, f.renderer, f.camera, f.scene);
      expect(f.initTexture).not.toHaveBeenCalled();
      fireDone();
      await vi.waitFor(() => expect(f.initTexture).toHaveBeenCalledWith(f.atlases[0]));
      expect(f.compile).not.toHaveBeenCalled();
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(false);
      // The late library supplies a different atlas after Fire has already finished loading.
      const late = texture();
      brush.add({ ...meta(BRUSH.id), loopMode: "none", timingProfile: "impact-key1" }, late, { a: f.expected[11]!, b: f.expected[12]! });
      f.setTarget(null);
      brushDone();
      await pending;
      expect(f.initTexture.mock.calls.filter(([t]) => t === late)).toHaveLength(1);
      expect(f.compile).toHaveBeenCalledTimes(1); expect(f.getTarget()).toBeNull();
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(true);
    } finally { f.stage.flipbooks.dispose(); f.post.dispose(); }
  });

  it("uploads an independently delayed strip once when its image arrives, before the scene compilation", async () => {
    let finish!: (t: THREE.Texture) => void;
    const f = setup(new Promise<THREE.Texture>((resolve) => { finish = resolve; }));
    const strip = texture();
    try {
      const pending = prewarmFire(f.stage, f.renderer, f.camera, f.scene);
      await vi.waitFor(() => expect(f.initTexture).toHaveBeenCalledWith(f.atlases[0]));
      expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledExactlyOnceWith("/v/aura/strips/strip-fire-sheath-v2.rgba.png");
      expect(f.compile).not.toHaveBeenCalled();
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(false);
      finish(strip);
      await pending;
      expect(f.initTexture.mock.calls.filter(([t]) => t === strip)).toHaveLength(1);
      expect(f.compile).toHaveBeenCalledExactlyOnceWith(f.scene, f.camera);
      expect(firePrewarmStatus(f.stage, f.renderer).textureIds).toContain(strip.id);
    } finally { f.stage.flipbooks.dispose(); f.post.dispose(); }
  });

  it("keeps uploads local to each renderer and retries a failed upload without reporting a warm scene", async () => {
    const f = setup();
    f.initTexture.mockImplementationOnce(() => { throw new Error("upload failed"); });
    try {
      await expect(prewarmFire(f.stage, f.renderer, f.camera, f.scene)).rejects.toThrow("upload failed");
      expect(f.compile).not.toHaveBeenCalled();
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(false);
      await prewarmFire(f.stage, f.renderer, f.camera, f.scene);
      const initTexture = vi.fn(), compile = vi.fn();
      const second = { initTexture, compile, getRenderTarget: () => null, setRenderTarget: vi.fn() } as unknown as THREE.WebGLRenderer;
      expect(firePrewarmStatus(f.stage, second)).toEqual({ prewarmed: false, textureIds: [] });
      await prewarmFire(f.stage, second, f.camera, f.scene);
      for (const t of f.expected) expect(initTexture.mock.calls.filter(([value]) => value === t)).toHaveLength(1);
      expect(compile).toHaveBeenCalledExactlyOnceWith(f.scene, f.camera);
      expect(firePrewarmStatus(f.stage, second).prewarmed).toBe(true);
    } finally { f.stage.flipbooks.dispose(); f.post.dispose(); }
  });

  it("restores every visibility flag and the target after a compilation failure, and reports it as cold", async () => {
    const f = setup();
    const before = new Map<THREE.Object3D, boolean>();
    f.stage.layer.traverse((o) => before.set(o, o.visible));
    f.compile.mockImplementation(() => { throw new Error("compile failed"); });
    try {
      await expect(prewarmFire(f.stage, f.renderer, f.camera, f.scene)).rejects.toThrow("compile failed");
      expect(f.compile).toHaveBeenCalledTimes(1); expect(f.getTarget()).toBe(f.post);
      for (const [o, visible] of before) expect(o.visible).toBe(visible);
      expect(firePrewarmStatus(f.stage, f.renderer).prewarmed).toBe(false);
    } finally { f.stage.flipbooks.dispose(); f.post.dispose(); }
  });
});
