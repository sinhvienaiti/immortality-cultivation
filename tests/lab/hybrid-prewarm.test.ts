import * as THREE from "three";
import { WebGLProperties } from "three/src/renderers/webgl/WebGLProperties.js";
import { WebGLTextures } from "three/src/renderers/webgl/WebGLTextures.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HybridAB } from "../../src/lab/hybrid-ab";
import { FlipbookLibrary, type FlipbookMeta } from "../../src/view/skills/flipbook";

// Exercise Three r170's upload implementation. This models storage ordering, not a GPU driver.
function renderer() {
  const calls: string[] = [];
  const errors = new Set<number>();
  let bound: object | null = null;
  const allocated = new WeakMap<object, number>();
  const gl = {
    TEXTURE_2D: 3553, TEXTURE0: 33984, NONE: 0, RGBA: 6408, UNSIGNED_BYTE: 5121,
    NO_ERROR: 0, INVALID_OPERATION: 1282,
    createTexture: () => ({}), deleteTexture: vi.fn(), pixelStorei: vi.fn(), texParameteri: vi.fn(),
    getError: () => { const error = errors.values().next().value ?? 0; errors.delete(error); return error; },
  };
  const state = {
    bindTexture: (_target: number, texture: object | null) => { bound = texture; },
    activeTexture: vi.fn(),
    texStorage2D: (_target: number, levels: number) => {
      calls.push("storage");
      if (!bound || allocated.has(bound)) errors.add(gl.INVALID_OPERATION);
      else allocated.set(bound, levels);
    },
    compressedTexSubImage2D: (_target: number, level: number) => {
      calls.push("sub:" + level);
      if (!bound || level >= (allocated.get(bound) ?? 0)) errors.add(gl.INVALID_OPERATION);
    },
  };
  const textures = Reflect.construct(WebGLTextures, [gl, { has: () => false }, state,
    new WebGLProperties(), { maxTextureSize: 16384 }, { convert: () => 37808 },
    { memory: { textures: 0 }, render: { frame: 0 } }]) as WebGLTextures;
  const initTexture = vi.fn((texture: THREE.Texture) => {
    textures.setTexture2D(texture, 0);
    // WebGLRenderer.initTexture unbinds after each upload.
    state.bindTexture(gl.TEXTURE_2D, null);
  });
  return {
    calls, gl, state, initTexture,
    renderer: { initTexture, getContext: () => gl,
      getDrawingBufferSize: (out: THREE.Vector2) => out.set(1920, 1080) } as unknown as THREE.WebGLRenderer,
  };
}

function astc(): THREE.CompressedTexture {
  const mipmaps = [8, 4, 2, 1].map((width) => ({ width, height: width,
    data: new Uint8Array(Math.ceil(width / 4) ** 2 * 16) }));
  const texture = new THREE.CompressedTexture(mipmaps, 8, 8, THREE.RGBA_ASTC_4x4_Format);
  texture.needsUpdate = true;
  return texture;
}

class Label {
  style = { cssText: "" }; dataset: Record<string, string> = {};
  append(): void {}
  replaceChildren(): void {}
}

afterEach(() => vi.unstubAllGlobals());

describe("A/B prewarm storage ordering (Three r170)", () => {
  it("detects INVALID_OPERATION when a subimage precedes storage", () => {
    const r = renderer();
    r.state.bindTexture(r.gl.TEXTURE_2D, {});
    r.state.compressedTexSubImage2D(r.gl.TEXTURE_2D, 0);
    expect(r.gl.getError()).toBe(1282);
    expect(r.gl.getError()).toBe(0);
  });

  it.each([
    { scene: "meteor", stale: false }, { scene: "azure-cloud-dragon", stale: false },
    { scene: "meteor", stale: true }, { scene: "azure-cloud-dragon", stale: true },
  ])("checks storage ordering and an incoming error: $scene, stale=$stale", async ({ scene, stale }) => {
    vi.stubGlobal("document", { createElement: () => new Label() });
    const r = renderer();
    const lib = new FlipbookLibrary("/hybrid/");
    const id = scene === "meteor" ? "fire-comet" : scene;
    const meta: FlipbookMeta = { id, url: "/atlas.png", cols: 4, rows: 8, frames: 32, fps: 24,
      loop: scene === "meteor", mode: "fire", aspect: 1, pivot: [0.5, 0.5], start: 0, heading: 0,
      compareWith: { folder: "fire", id }, motion: { url: "/mv.png", bytes: 1, strength: 0.2 } };
    const color = astc(), mv = astc();
    color.colorSpace = THREE.SRGBColorSpace;
    lib.add(meta, color, { mv }, "ktx2");
    type Host = ConstructorParameters<typeof HybridAB>[0];
    const host: Host = { camera: new THREE.PerspectiveCamera(), layer: new THREE.Group(), renderer: r.renderer,
      hybrid: lib, labelHost: new Label() as unknown as HTMLElement,
      player: { ready: () => lib.load(), library: () => lib } as unknown as Host["player"],
      comet: () => ({ id: "fire-comet", upgraded: true, videoReady: true, videoEl: null }) as ReturnType<Host["comet"]>,
      prepareComet: () => true, castMeteor: () => undefined };
    const ab = new HybridAB(host, { scene, only: "right", left: "video", prewarm: true, autostart: false, driven: true });
    try {
      await ab.load();
      if (stale) {
        r.state.bindTexture(r.gl.TEXTURE_2D, {});
        r.state.compressedTexSubImage2D(r.gl.TEXTURE_2D, 0);
        r.calls.length = 0;
      }
      ab.update(0);
      expect(r.initTexture.mock.calls.map(([texture]) => texture)).toEqual([color, mv]);
      expect(r.calls).toEqual(["storage", "sub:0", "sub:1", "sub:2", "sub:3",
        "storage", "sub:0", "sub:1", "sub:2", "sub:3"]);
      expect(ab.state().ready).toBe(true);
      // Existing diagnostics also consume an error raised BEFORE the valid uploads.
      expect(ab.state().glError).toBe(stale ? 1282 : 0);
      ab.update(0);
      expect(r.initTexture).toHaveBeenCalledTimes(2);
      expect(r.gl.getError()).toBe(0);
    } finally { color.dispose(); mv.dispose(); }
  });
});
