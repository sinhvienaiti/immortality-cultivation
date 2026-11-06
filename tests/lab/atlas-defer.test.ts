import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlipbookLibrary, FlipbookPlayer } from "../../src/view/skills/flipbook";

/** lab-perf (06/11): keys 8 and 9's atlases stay off the GPU while their clips play as 1080p videos. */

const MANIFEST = {
  flipbooks: {
    "ult-light": { file: "ult-light.atlas.png", cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role: "ultimate", video: { file: "ult-light.mp4", w: 1920, h: 1080, fps: 24, frames: 96, start: 0, peakTime: 1 } },
    "pillar-thunder-single": { file: "pillar-thunder-single.atlas.png", cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role: "pillar", video: { file: "pillar-thunder-single.mp4", w: 1920, h: 1080, fps: 24, frames: 72, start: 0, peakTime: 0.8 } },
  },
};

function stubManifest(): void {
  vi.stubGlobal("location", { protocol: "http:", search: "" });
  vi.stubGlobal("fetch", async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => MANIFEST }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deferred atlases (FlipbookLibrary defer)", () => {
  it("lists a deferred clip at once with a 1 × 1 stand-in and loads no atlas", async () => {
    stubManifest();
    const loads = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync");
    const lib = new FlipbookLibrary("/v/ult/", (meta) => meta.video !== undefined);
    await lib.load();
    expect(lib.ids().sort()).toEqual(["pillar-thunder-single", "ult-light"]);
    expect(loads).not.toHaveBeenCalled();
    for (const id of lib.ids()) {
      expect(lib.deferred(id)).toBe(true);
      expect((lib.get(id)!.texture.image as { width: number }).width).toBe(1);
    }
  });

  it("fetches one atlas on demand, hands it to its pool, and lets it go again on release", async () => {
    stubManifest();
    const atlas = new THREE.Texture();
    const loads = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(atlas);
    const dispose = vi.spyOn(atlas, "dispose");
    const player = new FlipbookPlayer("/v/");
    const lib = player.library("ult", (meta) => meta.video !== undefined);
    await lib.load();
    const pool = player.pool("ult", "ult-light");
    expect(pool.ready).toBe(true);
    expect(await lib.fetchAtlas("ult-light")).toBe(true);
    expect(loads).toHaveBeenCalledTimes(1);
    expect(loads.mock.calls[0]![0]).toBe("/v/ult/ult-light.atlas.png");
    expect(lib.deferred("ult-light")).toBe(false);
    expect(lib.get("ult-light")!.texture).toBe(atlas);
    expect(pool.mesh.material.uniforms.uMap!.value).toBe(atlas);
    // The other clip stays deferred; a second fetch of the same one loads nothing more.
    expect(lib.deferred("pillar-thunder-single")).toBe(true);
    expect(await lib.fetchAtlas("ult-light")).toBe(true);
    expect(loads).toHaveBeenCalledTimes(1);
    lib.release("ult-light");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(lib.deferred("ult-light")).toBe(true);
    expect(pool.mesh.material.uniforms.uMap!.value).not.toBe(atlas);
  });

  it("never defers without a predicate (element kits keep loading every atlas)", async () => {
    stubManifest();
    const loads = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
    const lib = new FlipbookLibrary("/v/fire/");
    await lib.load();
    expect(loads).toHaveBeenCalledTimes(2);
    expect(lib.ids().some((id) => lib.deferred(id))).toBe(false);
    lib.release("ult-light");
    expect(lib.deferred("ult-light")).toBe(false);
  });
});
