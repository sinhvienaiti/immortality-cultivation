import { readFileSync } from "node:fs";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COLOR_SIGIL_ELEMENTS } from "../../scripts/vfx/sigil-masks-lib";
import { METAL } from "../../src/view/skills/element-metal";
import { GroundSigil } from "../../src/view/skills/fxkit";
import {
  loadPaintedSigils, PAINTED_SIGIL_BASE, PAINTED_SIGIL_ELEMENTS, PaintedSigilCache, parseSigilManifest,
  SIGIL_MASK_IDS, SIGIL_PLANES, sigilBaseOf, sigilElementOf,
  type PaintedSigilMask, type PaintedSigils, type SigilMaskId,
} from "../../src/view/skills/painted-sigils";
import { GroundMarks } from "../../src/view/skills/sword-rain";
import { SwordSkillFx, type SwordSkillHost, type SwordSkillTextures } from "../../src/view/skills/sword-skills";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setOf(element: string, ids: readonly SigilMaskId[] = SIGIL_MASK_IDS): PaintedSigils {
  return { masks: new Map(ids.map((id) => {
    const texture = new THREE.Texture();
    texture.name = `${element}/${id}`;
    return [id, { texture, aspect: id === "line" ? 5 : 1, mode: element === "metal" ? "mask" : "color" } satisfies PaintedSigilMask];
  })) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("element sigil manifests", () => {
  it.each(COLOR_SIGIL_ELEMENTS)("reads all seven color masks and the selected sources for %s", (element) => {
    const json = JSON.parse(readFileSync(`art-src/lab/vfx/sigils/${element}/manifest.json`, "utf8"));
    const manifest = parseSigilManifest(json)!;
    expect(manifest.mode).toBe("color");
    expect(manifest.masks.size).toBe(7);
    expect(json.element).toBe(element);
    expect(json.masks.every((m: { source: string }) => m.source.startsWith(element + "-") && m.source.endsWith(".v1-try1.png"))).toBe(true);
    expect(sigilElementOf(element)).toBe(element);
    expect(sigilBaseOf(element)).toBe(`${PAINTED_SIGIL_BASE}${element}/`);
  });

  it("keeps the existing Metal manifest in mask mode at the existing base", () => {
    const json = JSON.parse(readFileSync("art-src/lab/vfx/sigils/manifest.json", "utf8"));
    expect(parseSigilManifest(json)!.mode).toBe("mask");
    expect(sigilBaseOf("metal")).toBe(PAINTED_SIGIL_BASE);
    expect(PAINTED_SIGIL_ELEMENTS).toEqual(["metal", ...COLOR_SIGIL_ELEMENTS]);
    for (const id of ["missing", "../fire", "FIRE", ""]) {
      expect(sigilElementOf(id)).toBe("metal");
      expect(sigilBaseOf(id)).toBe(PAINTED_SIGIL_BASE);
    }
  });

  it("rejects ambiguous color channels and unknown modes", () => {
    const json = JSON.parse(readFileSync("art-src/lab/vfx/sigils/fire/manifest.json", "utf8"));
    expect(parseSigilManifest({ ...json, mode: "unknown" })).toBeNull();
    expect(parseSigilManifest({ ...json, channels: { lines: "r", glow: "g", hot: "b" } })).toBeNull();
    expect(parseSigilManifest({ ...json, channels: { color: "rgb", erosion: "r" } })).toBeNull();
  });

  it("carries color mode through the real loader without treating RGB as packed channels", async () => {
    const json = JSON.parse(readFileSync("art-src/lab/vfx/sigils/fire/manifest.json", "utf8"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => json })));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());
    const set = (await loadPaintedSigils(sigilBaseOf("fire")))!;
    expect(load).toHaveBeenCalledWith(`${sigilBaseOf("fire")}fire-line.png?v=${json.masks[0].md5}`);
    for (const mask of set.masks.values()) {
      expect(mask.mode).toBe("color");
      expect(mask.texture.colorSpace).toBe(THREE.NoColorSpace);
    }
  });
});

describe("two-set lazy sigil cache", () => {
  it("loads only requested sets, pins Metal and unbinds each old set before disposal", async () => {
    let shown: PaintedSigils | null = null;
    let live = 0, maxLive = 0;
    const load = vi.fn(async (element: string) => {
      const set = setOf(element);
      live += 1; maxLive = Math.max(maxLive, live);
      set.masks.get("line")!.texture.addEventListener("dispose", () => {
        expect(shown?.masks.get("line")?.texture).not.toBe(set.masks.get("line")!.texture);
        live -= 1;
      });
      return set;
    });
    const cache = new PaintedSigilCache((set) => { shown = set; }, load);
    expect(load).not.toHaveBeenCalled();
    for (const element of COLOR_SIGIL_ELEMENTS) {
      await cache.select(element);
      expect(cache.cachedElements).toEqual(["metal", element]);
      expect((shown as PaintedSigils | null)?.masks.get("line")!.texture.name).toBe(`${element}/line`);
    }
    expect(maxLive).toBe(2);
    expect(load.mock.calls.map(([id]) => id)).toEqual(["metal", ...COLOR_SIGIL_ELEMENTS]);
    await cache.select("metal");
    expect(cache.cachedElements).toEqual(["metal"]);
    await cache.select("fire");
    expect(load.mock.calls.filter(([id]) => id === "fire")).toHaveLength(2);
    cache.dispose();
    expect(live).toBe(0);
    expect(shown).toBeNull();
  });

  it("falls back per mask to Metal, then to code when both are missing", async () => {
    const metal = setOf("metal", ["line", "arrow", "arcs", "hex", "spiral"]);
    const fire = setOf("fire", ["line", "rift"]);
    const apply = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new PaintedSigilCache(apply, async (id) => id === "metal" ? metal : fire);
    await cache.select("fire");
    const shown = apply.mock.lastCall![0] as PaintedSigils;
    expect(shown.masks.get("line")).toBe(fire.masks.get("line"));
    expect(shown.masks.get("hex")).toBe(metal.masks.get("hex"));
    expect(shown.masks.get("rift")).toBe(fire.masks.get("rift"));
    expect(shown.masks.has("crack")).toBe(false);
    expect(shown.masks.get("hex")!.mode).toBe("mask");
    expect(warn).toHaveBeenCalled();
    cache.dispose();
  });

  it.each(["missing", "error"])("uses Metal on a whole-set %s and retries after reselecting", async (failure) => {
    const metal = setOf("metal"), apply = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn(async (id: string) => {
      if (id === "metal") return metal;
      if (failure === "error") throw new Error("offline");
      return null;
    });
    const cache = new PaintedSigilCache(apply, load);
    await cache.select("fire");
    expect(apply.mock.lastCall![0].masks.get("line")).toBe(metal.masks.get("line"));
    expect(cache.cachedElements).toEqual(["metal"]);
    expect(warn).toHaveBeenCalled();
    await cache.select("metal");
    await cache.select("fire");
    expect(load.mock.calls.filter(([id]) => id === "fire")).toHaveLength(2);
    cache.dispose();
  });

  it("keeps analytic fallback when Metal also fails, and never loads an unknown path", async () => {
    const apply = vi.fn(), load = vi.fn(async () => null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new PaintedSigilCache(apply, load);
    await cache.select("unavailable");
    expect(apply.mock.lastCall).toEqual([null]);
    expect(load.mock.calls).toEqual([["metal"]]);
    cache.dispose();
  });

  it("disposes every texture of a superseded in-flight set and serializes rapid changes", async () => {
    const pending = deferred<PaintedSigils | null>();
    const fire = setOf("fire"), apply = vi.fn();
    const disposes = [...fire.masks.values()].map(({ texture }) => vi.spyOn(texture, "dispose"));
    const load = vi.fn(async (id: string) => id === "fire" ? pending.promise : setOf(id));
    const cache = new PaintedSigilCache(apply, load);
    await cache.select("metal");
    const fireReady = cache.select("fire");
    await Promise.resolve();
    const skipped = cache.select("water");
    const latest = cache.select("thunder");
    expect(load.mock.calls.map(([id]) => id)).toEqual(["metal", "fire"]);
    pending.resolve(fire);
    await Promise.all([fireReady, skipped, latest]);
    expect(disposes.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(cache.cachedElements).toEqual(["metal", "thunder"]);
    expect(load.mock.calls.map(([id]) => id)).toEqual(["metal", "fire", "thunder"]);
    expect(apply.mock.calls.every(([set]) => set?.masks.get("line")?.texture.name !== "fire/line")).toBe(true);
    cache.dispose();
  });

  it("coalesces repeat selections and disposes a late load after teardown", async () => {
    const pending = deferred<PaintedSigils | null>(), metal = setOf("metal");
    const dispose = vi.spyOn(metal.masks.get("line")!.texture, "dispose");
    const apply = vi.fn(), load = vi.fn(() => pending.promise);
    const cache = new PaintedSigilCache(apply, load);
    const first = cache.select("metal");
    expect(cache.select("metal")).toBe(first);
    await Promise.resolve();
    cache.dispose();
    pending.resolve(metal);
    await first;
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.cachedElements).toEqual([]);
    expect(apply.mock.lastCall).toEqual([null]);
    await cache.select("fire");
    expect(load).toHaveBeenCalledTimes(1);
  });
});

function fxFixture(search: string) {
  vi.stubGlobal("location", { search });
  const layer = new THREE.Group(), t = new THREE.Texture();
  const textures = Object.fromEntries(["glow", "flare", "star", "spark", "trace", "slash", "mote", "smoke", "splash", "scorch", "ring", "shock", "halo", "twirl"].map((id) => [id, t])) as unknown as SwordSkillTextures;
  const host: SwordSkillHost = { layer, camera: new THREE.PerspectiveCamera(),
    targets: { size: 0, alive: () => false, x: () => 0, z: () => 0, midY: () => 0, radius: () => 0,
      tier: () => 0, nearest: () => -1, inCircle: () => 0, inCapsule: () => 0, hit: () => false },
    caster: () => {}, hand: () => {}, flash: () => {}, impulse: () => {}, hitStop: () => {}, moveCaster: () => {}, play: () => {} };
  return { layer, fx: new SwordSkillFx(host, textures, "low") };
}

describe("element sigils in the skill renderer", () => {
  it("switches shader mode on the same sigil and independently on each mark kind", () => {
    const sigil = new GroundSigil("hex", SIGIL_PLANES.hex, SIGIL_PLANES.hex, "white", "white");
    const texture = new THREE.Texture();
    const material = sigil.mesh.material as THREE.ShaderMaterial;
    sigil.setPainted(texture, 1, "color");
    expect(material.defines).toHaveProperty("PAINTED_COLOR");
    sigil.setPainted(texture, 1, "mask");
    expect(material.defines).toHaveProperty("PAINTED");
    expect(material.defines).not.toHaveProperty("PAINTED_COLOR");
    sigil.setPainted(null);
    expect(material.defines).not.toHaveProperty("PAINTED");
    const marks = new GroundMarks(4, 4);
    marks.setPainted(texture, 1.3, texture, 8, "color", "mask");
    const uniforms = (marks.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.uColorMode!.value.toArray()).toEqual([1, 0]);
    marks.setPainted(texture, 1.3, texture, 8, "mask", "color");
    expect(uniforms.uColorMode!.value.toArray()).toEqual([0, 1]);
    sigil.mesh.geometry.dispose(); material.dispose(); marks.dispose();
  });

  it("routes the existing setElement call to painted sigils and rain cracks without a lab-main edit", async () => {
    const select = vi.spyOn(PaintedSigilCache.prototype, "select");
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => JSON.parse(readFileSync("art-src/lab/vfx/sigils/" + (url.includes("/fire/") ? "fire/" : "") + "manifest.json", "utf8")) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async (url) => {
      const texture = new THREE.Texture(); texture.name = url; return texture;
    });
    const { fx, layer } = fxFixture("");
    await select.mock.results[0]!.value;
    fx.setElement({ ...METAL, id: "fire" }, null);
    await select.mock.results.at(-1)!.value;
    const materials = layer.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh).map((mesh) => mesh.material as THREE.ShaderMaterial);
    const sigils = materials.filter((m) => m.uniforms?.uMask);
    expect(sigils.filter((m) => "PAINTED_COLOR" in m.defines)).toHaveLength(7);
    expect(sigils.filter((m) => "PAINTED_COLOR" in m.defines).every((m) => m.uniforms.uMask!.value.name.includes("/fire/"))).toBe(true);
    const marks = materials.find((m) => m.uniforms?.uStarMask)!;
    expect(marks.uniforms.uColorMode!.value.toArray()).toEqual([1, 1]);
    fx.setElement(METAL, null);
    await select.mock.results.at(-1)!.value;
    expect(sigils.every((m) => !("PAINTED_COLOR" in m.defines))).toBe(true);
    expect(marks.uniforms.uColorMode!.value.toArray()).toEqual([0, 0]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${PAINTED_SIGIL_BASE}manifest.json`, `${PAINTED_SIGIL_BASE}fire/manifest.json`]);
    for (const cache of new Set(select.mock.contexts as PaintedSigilCache[])) cache.dispose();
  });

  it("forces code mode across element changes with no manifest or texture loads", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn(), select = vi.spyOn(PaintedSigilCache.prototype, "select");
    vi.stubGlobal("fetch", fetchMock);
    const { fx, layer } = fxFixture("?sigil=code");
    fx.setElement({ ...METAL, id: "fire" }, null);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(layer.children.filter((child) => child instanceof THREE.Mesh).every((mesh) => !("PAINTED" in ((mesh as THREE.Mesh).material as THREE.ShaderMaterial).defines))).toBe(true);
  });
});
