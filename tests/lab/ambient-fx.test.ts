import * as THREE from "three";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmbientFx, AMBIENT_IDS, AMBIENT_ORDER, ambientEnabled } from "../../src/lab/ambient-fx";
import { FlipbookLibrary, FlipbookPlayer, FlipbookPool, parseFlipbookManifest, setFlipbookKtx2 } from "../../src/view/skills/flipbook";

const [MIST, DUST, SHAFTS] = AMBIENT_IDS;
// The extra world entry proves that opening this lab does not fetch the whole folder.
const entries = Object.fromEntries([...AMBIENT_IDS, "world-unused"].map((id) => [id, {
  file: id + ".png", cols: 8, rows: 8, frames: 48, fps: 24, loop: true, mode: "fire", cell: [512, 288], pivot: [0.42, 0.6],
  ktx2: { yFlip: true, uastc: { file: id + ".ktx2", bytes: 100 } },
}]));
const manifest = { flipbooks: entries };
const metas = parseFlipbookManifest(manifest, "/v/world/");
function fixture(search = "", adopt = true) {
  const parent = new THREE.Group();
  const fx = new AmbientFx(parent, "/v/", search);
  if (adopt) for (const id of AMBIENT_IDS) fx.adopt(id, metas.get(id)!, new THREE.Texture());
  return { fx, parent, pool: (id: string) => fx.player.pool("world", id) };
}
function network() {
  vi.stubGlobal("location", { protocol: "http:" });
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => manifest });
  vi.stubGlobal("fetch", fetch);
  const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
  const ktx2 = vi.fn().mockImplementation(async () => new THREE.Texture());
  setFlipbookKtx2({ loader: { loadAsync: ktx2 }, variant: "uastc" });
  return { fetch, png, ktx2 };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setFlipbookKtx2(null); });

describe("lab ambient loops", () => {
  it("defaults on and ?ambient=0 prevents all loads, pools and draws even when enabled later", () => {
    expect(ambientEnabled("")).toBe(true);
    expect(ambientEnabled("?ambient=1")).toBe(true);
    expect(ambientEnabled("?q=high&ambient=0&tags=1")).toBe(false);
    const { fetch, ktx2, png } = network();
    const makePool = vi.spyOn(FlipbookPlayer.prototype, "pool");
    const { fx } = fixture("?ambient=0", false);
    fx.update(1); fx.setEnabled(true); fx.update(100);
    expect(fx.enabled).toBe(false);
    expect(fx.player.group.visible).toBe(false);
    expect(fx.player.live).toBe(0);
    expect(makePool).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(ktx2).not.toHaveBeenCalled(); expect(png).not.toHaveBeenCalled();
  });

  it("lazily fetches just the three KTX2 atlases on the first enabled update", async () => {
    const { fetch, ktx2, png } = network();
    const { fx } = fixture("", false);
    expect(fetch).not.toHaveBeenCalled();
    fx.update(0);
    await vi.waitFor(() => expect(fx.player.group.children).toHaveLength(3));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ktx2.mock.calls.map((c) => c[0]).sort()).toEqual(AMBIENT_IDS.map((id) => "/v/world/" + id + ".ktx2").sort());
    expect(png).not.toHaveBeenCalled();
    fx.update(0);
    expect(fx.player.live).toBe(5);
    fx.dispose();
  });

  it("draws three separated edge strips, one far vertical dust plane and one diagonal far shaft plane", () => {
    const { fx, pool } = fixture(); fx.update(1);
    expect(pool(MIST).live).toBe(3); expect(pool(DUST).live).toBe(1); expect(pool(SHAFTS).live).toBe(1);
    const p = pool(MIST).mesh.geometry.getAttribute("iPos");
    expect([p.getX(0), p.getY(0), p.getZ(0)]).toEqual([0, expect.closeTo(0.06), -16.5]);
    expect([p.getX(1), p.getX(2)]).toEqual([-18.5, 18.5]);
    for (let i = 0; i < 3; i++) {
      // Full rectangles (including their transparent edges) leave the centre clear.
      expect(Math.abs(p.getX(i)) >= 17 || p.getZ(i) <= -15).toBe(true);
      expect(pool(MIST).mesh.geometry.getAttribute("iData").getX(i)).toBe(2.5);
    }
    expect(pool(DUST).mesh.geometry.getAttribute("iPos").getZ(0)).toBe(-19);
    expect(pool(DUST).mesh.geometry.getAttribute("iLift").getY(0)).toBe(40);
    expect(pool(SHAFTS).mesh.geometry.getAttribute("iPos").getZ(0)).toBe(-19.5);
    expect(pool(SHAFTS).mesh.geometry.getAttribute("iData").getY(0)).toBeCloseTo(-Math.PI / 6);
    for (const id of AMBIENT_IDS) {
      const material = pool(id).mesh.material;
      const shader = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: material.uniforms };
      material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], null!);
      expect(shader.vertexShader).toContain("view = modelViewMatrix * vec4(iPos + ambientCorner, 1.0)");
      expect(shader.vertexShader).not.toContain("view.xy += corner;");
      expect(shader.vertexShader).toContain(id === MIST ? "vec3(corner.x, 0.0, -corner.y)" : "vec3(corner, 0.0)");
      expect(shader.fragmentShader).toBe(material.fragmentShader);
    }
  });

  it("stays beneath combat transparency, depth-tests opaque foes and never writes over their depth", () => {
    const { fx, pool } = fixture(); fx.update(1);
    expect(fx.player.group.renderOrder).toBe(AMBIENT_ORDER);
    // Three sorts transparent groups/order ascending; negative ambient order precedes default actors and skill groups.
    expect(AMBIENT_ORDER).toBeLessThan(new THREE.Group().renderOrder);
    for (const id of AMBIENT_IDS) {
      const mesh = pool(id).mesh;
      expect(mesh.renderOrder).toBe(AMBIENT_ORDER);
      expect(mesh.material.depthTest).toBe(true);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.transparent).toBe(true);
      expect(mesh.geometry.getAttribute("iLift").getX(0)).toBe(0);
    }
  });

  it("keeps every emitted channel and opacity within the agreed faint caps", () => {
    const { fx, pool } = fixture(); fx.update(10); fx.update(0);
    for (const [i, id] of AMBIENT_IDS.entries()) {
      const p = pool(id), rgb = p.mesh.geometry.getAttribute("iColor"), data = p.mesh.geometry.getAttribute("iData");
      for (let n = 0; n < p.live; n++) {
        for (const channel of [rgb.getX(n), rgb.getY(n), rgb.getZ(n)]) expect(channel).toBeCloseTo([0.25, 0.2, 0.18][i]!);
        expect(data.getW(n)).toBeLessThanOrEqual([0.5, 0.45, 0.4][i]! + 1e-6);
        expect(p.mesh.geometry.getAttribute("iDir").getW(n)).toBe(0); // Purely additive, no dark backing.
      }
    }
  });

  it("keeps continuous blended loop playback past the two-second source and toggles without rebuilding", () => {
    const { fx, pool } = fixture(); fx.update(0);
    const original = pool(MIST);
    fx.update(2.25); fx.update(0);
    expect(original.live).toBe(3);
    expect(original.mesh.geometry.getAttribute("iData").getZ(0)).toBeCloseTo(54);
    expect(original.mesh.material.uniforms.uLoop!.value).toBe(1);
    expect(original.mesh.material.uniforms.uStep!.value).toBe(0);
    fx.setEnabled(false); fx.update(10);
    expect(fx.player.live).toBe(0); expect(fx.player.group.visible).toBe(false);
    fx.setEnabled(true); fx.update(0);
    expect(fx.enabled).toBe(true); expect(pool(MIST)).toBe(original); expect(fx.player.live).toBe(5);
    expect(original.mesh.geometry.getAttribute("iData").getZ(0)).toBeCloseTo(6);
  });

  it("reuses pools, options, vectors and typed buffers without spawning or loading per steady frame", () => {
    const { fx, pool } = fixture(); fx.update(0);
    const meshes = AMBIENT_IDS.map((id) => pool(id).mesh);
    const arrays = meshes.map((m) => m.geometry.getAttribute("iData").array);
    const at = fx["at"], options = fx["options"];
    const spawn = vi.spyOn(FlipbookPool.prototype, "spawn");
    const library = vi.spyOn(FlipbookPlayer.prototype, "library");
    const makePool = vi.spyOn(FlipbookPlayer.prototype, "pool");
    const setAttribute = vi.spyOn(THREE.BufferGeometry.prototype, "setAttribute");
    for (let i = 0; i < 600; i++) fx.update(1 / 60);
    expect(spawn).not.toHaveBeenCalled(); expect(library).not.toHaveBeenCalled();
    expect(makePool).not.toHaveBeenCalled(); expect(setAttribute).not.toHaveBeenCalled();
    expect(fx["at"]).toBe(at); expect(fx["options"]).toBe(options);
    meshes.forEach((mesh, i) => expect(mesh.geometry.getAttribute("iData").array).toBe(arrays[i]));
    expect(fx.player.live).toBe(5);
    const source = readFileSync(new URL("../../src/lab/ambient-fx.ts", import.meta.url), "utf8");
    const update = source.slice(source.indexOf("  update(dt:"), source.indexOf("  dispose():"));
    expect(update).not.toMatch(/\bnew\s|\.map\(|\.clone\(|=>/);
  });

  it("does not draw late loads after being switched off, and reuses them when switched on", async () => {
    const { ktx2 } = network();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    ktx2.mockImplementation(async () => { await pending; return new THREE.Texture(); });
    const { fx } = fixture("", false); fx.update(0);
    await vi.waitFor(() => expect(ktx2).toHaveBeenCalledTimes(3));
    fx.setEnabled(false); finish();
    await vi.waitFor(() => expect(fx.player.group.children).toHaveLength(3));
    fx.update(1); expect(fx.player.live).toBe(0); expect(fx.player.group.visible).toBe(false);
    fx.setEnabled(true); fx.update(0); expect(fx.player.live).toBe(5);
    expect(ktx2).toHaveBeenCalledTimes(3);
    fx.dispose(); expect(fx.player.group.parent).toBeNull();
    fx.setEnabled(true); fx.update(1); expect(fx.enabled).toBe(false);
  });

  it("does not retry missing entries every frame and preserves PNG fallback", async () => {
    const { ktx2, png } = network();
    ktx2.mockRejectedValue(new Error("unsupported compression"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ flipbooks: { [MIST]: entries[MIST] } }) } as Response);
    const { fx } = fixture("", false); fx.update(0);
    await vi.waitFor(() => expect(fx.player.group.children).toHaveLength(1));
    for (let i = 0; i < 120; i++) fx.update(1 / 60);
    expect(png).toHaveBeenCalledTimes(1); expect(ktx2).toHaveBeenCalledTimes(1);
    expect(fx.player.live).toBe(3);
    fx.dispose();
  });

  it("wires real-time atmosphere before rendering and enables KTX2 on the default lab path", () => {
    const source = readFileSync(new URL("../../src/lab/skills-main.ts", import.meta.url), "utf8");
    expect(source).toContain("new AmbientFx(view.layers.ground, VFX_BASE, location.search)");
    expect(source).toContain('(hybridLib !== undefined || ambient.enabled || chargeFill.enabled) && params.get("ktx2") !== "0"');
    expect(source).toMatch(/ambient\.update\(dt\);\s*placeTags\(\);\s*view\.render\(dt\)/);
  });
});
