import * as THREE from "three";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CutIn, CUTIN_ART } from "../../src/lab/cutin";
import { CutInMaterials, CUTIN_MATERIAL_IDS, cutInMaterialPlan, cutInMaterialsEnabled } from "../../src/lab/cutin-materials";
import { FlipbookLibrary, FlipbookPlayer, type FlipbookPool, parseFlipbookManifest } from "../../src/view/skills/flipbook";

const [INK, CLOUD, SPEED, GOLD, EMBER, PETALS, BLOOM] = CUTIN_MATERIAL_IDS;
const metas = parseFlipbookManifest(JSON.parse(readFileSync("art-src/lab/vfx/cutin-mat/manifest.json", "utf8")), "/art-src/lab/vfx/cutin-mat/");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(element = "metal", search = "", warm = true) {
  const parent = { prepend: vi.fn() };
  const surface = {
    domElement: { style: { cssText: "", display: "" } } as HTMLCanvasElement,
    setPixelRatio: vi.fn(), setClearColor: vi.fn(), setSize: vi.fn(), clear: vi.fn(), render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera) => undefined),
  };
  const factory = vi.fn(() => surface);
  const librarySpy = vi.spyOn(FlipbookPlayer.prototype, "library");
  const poolSpy = vi.spyOn(FlipbookPlayer.prototype, "pool");
  const fx = new CutInMaterials(parent as unknown as HTMLElement, search, factory);
  const started = fx.start(element, 1.7, 1.08);
  const lib = librarySpy.mock.results[0]?.value as FlipbookLibrary | undefined;
  const pools = new Map<CUTIN_ID, FlipbookPool>();
  for (const result of poolSpy.mock.results) {
    const pool = result.value as FlipbookPool;
    pools.set(pool.id as CUTIN_ID, pool);
  }
  if (warm && lib) for (const id of CUTIN_MATERIAL_IDS) lib.add(metas.get(id)!, new THREE.Texture());
  const live = () => [...pools].filter(([, pool]) => pool.live > 0).map(([id]) => id).sort();
  const frame = (id: CUTIN_ID) => pools.get(id)!.mesh.geometry.getAttribute("iData").getZ(0);
  return { fx, parent, surface, factory, lib, pools, started, live, frame, poolSpy, librarySpy };
}
type CUTIN_ID = typeof CUTIN_MATERIAL_IDS[number];

describe("B4 material choices", () => {
  it.each([
    ["metal", INK, GOLD, EMBER], ["fire", INK, null, EMBER], ["thunder", INK, null, EMBER], ["blood", INK, null, EMBER],
    ["water", CLOUD, null, PETALS], ["wind", CLOUD, null, PETALS], ["light", CLOUD, GOLD, PETALS], ["wood", INK, null, PETALS],
    ["ice", CLOUD, null, null], ["star", INK, GOLD, null], ["earth", INK, null, null], ["poison", INK, null, null],
    ["dark", INK, null, null], ["void", INK, null, null], ["unknown", INK, null, null],
  ])("matches every phase for %s", (element, open, climax, drift) => {
    expect(cutInMaterialPlan(element!)).toEqual({ open, shout: SPEED, climax, drift, close: BLOOM, stamp: null });
  });

  it("disables only the exact cutinmat=0 flag, including alongside other lab flags", () => {
    for (const s of ["?cutinmat=0", "element=light&cutinmat=0&cutin=1.7"]) expect(cutInMaterialsEnabled(s)).toBe(false);
    for (const s of ["", "?cutinmat=1", "?cutinmat=false", "?presence=0"]) expect(cutInMaterialsEnabled(s)).toBe(true);
    const f = fixture("metal", "?cutinmat=0");
    f.fx.draw(0, 1920, 1080); f.fx.stop();
    expect(f.started).toBe(false);
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.librarySpy).not.toHaveBeenCalled();
    expect(f.poolSpy).not.toHaveBeenCalled();
  });

  it("uses all seven real manifest entries and excludes the waiting stamp clip", () => {
    expect(CUTIN_MATERIAL_IDS).toHaveLength(7);
    for (const id of CUTIN_MATERIAL_IDS) {
      expect(metas.has(id)).toBe(true);
      expect(metas.get(id)!.url.split("?")[0]).toBe(`/art-src/lab/vfx/cutin-mat/${id}.atlas.png`);
    }
    expect(CUTIN_MATERIAL_IDS).not.toContain("cutin-seal-stamp-splash");
  });
});

describe("B4 cut-in material lifecycle (real pools, node)", () => {
  it("allocates no renderer/library before first use; defers all atlases and requests only the chosen set", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    const manifest = readFileSync("art-src/lab/vfx/cutin-mat/manifest.json", "utf8");
    const network = vi.fn(async () => new Response(manifest, { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", network);
    const fetch = vi.spyOn(FlipbookLibrary.prototype, "fetchAtlas").mockResolvedValue(true);
    const factory = vi.fn(() => { throw new Error("unused"); });
    new CutInMaterials({} as HTMLElement, "", factory);
    expect(factory).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    const f = fixture("ice", "", false);
    await f.lib!.load();
    await Promise.resolve();
    expect(f.started).toBe(true);
    expect(network).toHaveBeenCalledExactlyOnceWith("/art-src/lab/vfx/cutin-mat/manifest.json", { cache: "no-cache" });
    expect(fetch.mock.calls.map(([id]) => id).sort()).toEqual([CLOUD, SPEED, BLOOM].sort());
    for (const id of metas.keys()) expect(f.lib!.deferred(id)).toBe(true);
  });

  it("plays open, shout, climax and close on the existing boundaries; drift spans the whole cut-in", () => {
    const f = fixture();
    for (const [time, ids] of [
      [0, [INK, EMBER]], [0.199, [INK, EMBER]], [0.2, [SPEED, EMBER]],
      [1.079, [SPEED, EMBER]], [1.08, [SPEED, GOLD, EMBER]], [1.559, [SPEED, GOLD, EMBER]],
      [1.56, [BLOOM, EMBER]], [1.699, [BLOOM, EMBER]], [1.7, []],
    ] as const) {
      f.fx.draw(time, 1920, 1080);
      expect(f.live(), `time=${time}`).toEqual([...ids].sort());
    }
    expect(f.surface.domElement.style.display).toBe("none");
  });

  it("blends fractional frames, loops drift/speed, maps each one-shot to its phase and honours the actual shout frame", () => {
    const f = fixture("light");
    f.fx.draw(0.1, 1920, 1080);
    expect(f.frame(CLOUD)).toBe(20); // 41 frames, halfway through the existing 0.2 s wipe
    expect(f.frame(PETALS)).toBeCloseTo(2.4);
    f.fx.draw(0.3, 1920, 1080);
    expect(f.frame(SPEED)).toBeCloseTo(2.4);
    f.fx.draw(1.09, 1920, 1080, 1.1);
    expect(f.live()).not.toContain(GOLD);
    f.fx.draw(1.1, 1920, 1080, 1.1);
    expect(f.frame(GOLD)).toBe(0);
    f.fx.draw(1.63, 1920, 1080, 1.1);
    expect(f.frame(BLOOM)).toBeCloseTo(15);
    f.fx.start("light", 5, 3);
    f.fx.draw(2.3, 1920, 1080);
    expect(f.frame(PETALS)).toBeCloseTo(7.2); // 2.3 × 24 modulo 48
    expect(f.frame(SPEED)).toBeCloseTo(2.4); // (2.3 − 0.2) × 24 modulo 48
  });

  it.each(CUTIN_MATERIAL_IDS)("clears %s immediately on cancellation, completion and restart", (id) => {
    const f = fixture(id === CLOUD || id === PETALS ? "light" : "metal");
    const time = id === BLOOM ? 1.63 : id === INK || id === CLOUD ? 0.1 : 1.2;
    f.fx.draw(time, 1280, 720);
    expect(f.pools.get(id)!.live).toBe(1);
    f.fx.stop();
    expect(f.live()).toEqual([]);
    expect(f.surface.domElement.style.display).toBe("none");
    f.fx.draw(time, 1280, 720);
    expect(f.live()).toEqual([]);
    f.fx.start("light", 1.7, 1.08);
    expect(f.live()).toEqual([]);
    f.fx.draw(1.7, 1280, 720);
    expect(f.live()).toEqual([]);
  });

  it("late atlas arrivals join absolute time and never resurrect a cancelled cut-in", async () => {
    const f = fixture("metal", "", false);
    f.fx.draw(1.2, 1280, 720);
    expect(f.live()).toEqual([]);
    f.lib!.add(metas.get(SPEED)!, new THREE.Texture());
    f.fx.draw(1.2, 1280, 720);
    expect(f.frame(SPEED)).toBe(24);
    f.fx.stop();
    f.lib!.add(metas.get(GOLD)!, new THREE.Texture());
    await Promise.resolve();
    f.fx.draw(1.3, 1280, 720);
    expect(f.live()).toEqual([]);
    f.fx.start("ice", 1.7, 1.08);
    f.fx.draw(1.3, 1280, 720);
    expect(f.live()).not.toContain(GOLD);
  });

  it("handles very short holds without invalid frame arithmetic or leaks", () => {
    const f = fixture("ice");
    f.fx.start("ice", 0.05, 0.032);
    f.fx.draw(0, 1280, 720);
    expect(f.live()).toEqual([BLOOM]);
    expect(Number.isFinite(f.frame(BLOOM))).toBe(true);
    f.fx.draw(0.05, 1280, 720);
    expect(f.live()).toEqual([]);
  });

  it("keeps off-centre atlas pivots, scales to the clipped band and resizes only when dimensions change", () => {
    const f = fixture("light");
    f.fx.draw(0.1, 1920, 1080);
    const pool = f.pools.get(CLOUD)!;
    const m = metas.get(CLOUD)!;
    const pos = pool.mesh.geometry.getAttribute("iPos");
    expect(pos.getX(0)).toBeCloseTo((m.pivot[0] - 0.5) * 2 * m.aspect);
    expect(pos.getY(0)).toBeCloseTo((0.5 - m.pivot[1]) * 2);
    expect(pool.mesh.scale.x * 2 * m.aspect).toBeCloseTo(2 * 1920 / 1080);
    f.fx.draw(0.12, 1920, 1080);
    expect(f.surface.setSize).toHaveBeenCalledTimes(1);
    f.fx.draw(0.14, 720, 1280);
    expect(pool.mesh.scale.x * 2 * m.aspect).toBeCloseTo(2 * 720 / 1280);
    expect(f.surface.setSize).toHaveBeenCalledTimes(2);
    expect(f.parent.prepend).toHaveBeenCalledExactlyOnceWith(f.surface.domElement);
  });

  it("writes premultiplied canvas coverage, caps straight RGB at 0.9 and ignores the world's word-tag mask", () => {
    const f = fixture("light");
    for (const pool of f.pools.values()) {
      const material = pool.mesh.material;
      const shader = { fragmentShader: material.fragmentShader };
      material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader.match(/void main\(\)/g)).toHaveLength(1);
      expect(shader.fragmentShader).toContain("cutinAtlasMain();");
      expect(shader.fragmentShader).toContain("clamp(gl_FragColor.rgb, 0.0, 0.9)");
      expect(shader.fragmentShader).toContain("/ 0.9");
      expect(material.blendSrcAlpha).toBe(THREE.OneFactor);
      expect(material.blendDstAlpha).toBe(THREE.OneMinusSrcAlphaFactor);
      expect(material.uniforms.uTagK!.value.toArray()).toEqual([1, 1, 1]);
      expect(material.depthTest).toBe(false);
    }
  });

  it("reuses warmed pools, geometry buffers, scene, camera and renderer across 1,000 frames", async () => {
    const f = fixture("light");
    f.fx.draw(1.2, 1920, 1080);
    await Promise.resolve();
    const buffers = [...f.pools.values()].map((p) => Object.values(p.mesh.geometry.attributes).map((a) => a.array));
    const scene = f.surface.render.mock.calls[0]!;
    f.factory.mockClear(); f.poolSpy.mockClear(); f.librarySpy.mockClear();
    const prepare = vi.spyOn(FlipbookLibrary.prototype, "fetchAtlas");
    for (let i = 0; i < 1000; i += 1) f.fx.draw(0.2 + i % 70 / 60, 1920, 1080);
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.poolSpy).not.toHaveBeenCalled();
    expect(f.librarySpy).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(f.surface.setSize).toHaveBeenCalledTimes(1);
    expect(f.surface.render.mock.lastCall![0]).toBe(scene[0]);
    expect(f.surface.render.mock.lastCall![1]).toBe(scene[1]);
    [...f.pools.values()].forEach((p, i) => {
      Object.values(p.mesh.geometry.attributes).forEach((a, j) => expect(a.array).toBe(buffers[i]![j]));
      expect(p.capacity).toBe(1);
      expect(p.dropped).toBe(0);
    });
  });

  it("falls back to the old cut-in if WebGL cannot be created", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = vi.fn(() => { throw new Error("WebGL unavailable"); });
    const f = new CutInMaterials({} as HTMLElement, "", factory);
    expect(f.start("metal", 1.7, 1.08)).toBe(false);
    f.draw(0, 1920, 1080); f.stop();
    expect(f.start("metal", 1.7, 1.08)).toBe(false);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

/** Small DOM surface for driving the actual CutIn clock, without a browser or WebGL. */
type TestNode = {
  style: CSSStyleDeclaration;
  children: TestNode[];
  offsetWidth: number;
  append(...children: TestNode[]): void;
  replaceChildren(): void;
  textContent: string;
};
function node(): TestNode {
  return {
    style: { setProperty: vi.fn() } as unknown as CSSStyleDeclaration,
    children: [] as TestNode[],
    offsetWidth: 1000,
    append(...children: TestNode[]) { this.children.push(...children); },
    replaceChildren() { this.children.length = 0; },
    textContent: "",
  };
}

describe("B4 CutIn clock integration", () => {
  it.each(["", "?cutinmat=0"])("keeps open/shout/stamp/close timing and cancellation unchanged (%s)", (search) => {
    vi.stubGlobal("document", { createElement: node, fonts: { check: () => true } });
    vi.stubGlobal("Image", class { decode() { return Promise.resolve(); } });
    vi.stubGlobal("innerWidth", 1920); vi.stubGlobal("innerHeight", 1080);
    const start = vi.spyOn(CutInMaterials.prototype, "start").mockReturnValue(search === "");
    const draw = vi.spyOn(CutInMaterials.prototype, "draw").mockImplementation(() => undefined);
    const stop = vi.spyOn(CutInMaterials.prototype, "stop").mockImplementation(() => undefined);
    const calls: [string, number][] = [];
    const parent = node();
    const cutin = new CutIn(parent as unknown as HTMLElement, (phase) => calls.push([phase, cutin.time]), search);
    cutin.start({ name: "MILKY-WAY SWORD RAIN", hanzi: "天河劍雨", seconds: 1.7, shoutAt: 1.08, art: CUTIN_ART.c, element: "water" });
    expect(start).toHaveBeenCalledWith("water", 1.7, 1.08);
    const band = parent.children[0]!.children[1]!;
    expect(band.children[0]!.style.display).toBe(search === "" ? "none" : "");
    expect(calls).toEqual([["open", 0]]);
    cutin.update(1.08);
    expect(calls.map(([phase]) => phase)).toEqual(["open", "shout"]);
    cutin.update(0.06);
    expect(calls.map(([phase]) => phase)).toEqual(["open", "shout", "stamp"]);
    expect(cutin.update(0.56)).toBe(true);
    expect(calls.map(([phase]) => phase)).toEqual(["open", "shout", "stamp", "close"]);
    expect(cutin.active).toBe(false); expect(cutin.time).toBe(-1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith(1.08, 1920, 1080, 1.08);
    expect(cutin.update(1)).toBe(false);
    cutin.start({ name: "TEST", hanzi: "天", seconds: 1.7 });
    cutin.stop();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(calls.filter(([phase]) => phase === "close")).toHaveLength(1);
  });
});
