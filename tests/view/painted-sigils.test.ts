import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brightBox, COLOR_SIGIL_ELEMENTS, cropOf, maskSize, packChannels, packColor, sigilSourcesFor, SIGIL_SOURCES } from "../../scripts/vfx/sigil-masks-lib";
import { GroundSigil } from "../../src/view/skills/fxkit";
import { loadPaintedSigils, paintedPlane, parseSigilManifest, SIGIL_MASK_IDS, SIGIL_PLANES, sigilModeOf, sigilPaths, type SigilMaskId } from "../../src/view/skills/painted-sigils";
import { GroundMarks } from "../../src/view/skills/sword-rain";

const md5 = "0123456789abcdef0123456789abcdef";
const fixture = () => ({
  version: 1, channels: { lines: "r", glow: "g", hot: "b" },
  masks: SIGIL_MASK_IDS.map((id) => ({ id, file: `metal-${id}.png`, md5, metres: SIGIL_PLANES[id], aspect: 1, px: [512, 512] })),
});
const all = new Set(SIGIL_MASK_IDS);
const rows: { id: SigilMaskId; box: [number, number, number, number]; crop: [number, number, number, number]; px: [number, number]; aspect: number }[] = [
  { id: "hex", box: [463, 60, 747, 791], crop: [409, 28, 855, 855], px: [1024, 1024], aspect: 1 },
  { id: "line", box: [14, 371, 1643, 185], crop: [-52, 305, 1775, 317], px: [2048, 512], aspect: 5.5994 },
  { id: "arcs", box: [418, 29, 817, 863], crop: [360, -6, 933, 933], px: [512, 512], aspect: 1 },
  { id: "arrow", box: [42, 381, 1596, 169], crop: [-22, 317, 1724, 297], px: [512, 128], aspect: 5.8047 },
  { id: "spiral", box: [525, 120, 620, 649], crop: [485, 94, 701, 701], px: [1024, 1024], aspect: 1 },
  { id: "crack", box: [249, 51, 1170, 818], crop: [202, 4, 1264, 912], px: [1024, 1024], aspect: 1.3860 },
  { id: "rift", box: [76, 432, 1521, 65], crop: [15, 371, 1643, 187], px: [2048, 256], aspect: 8.7861 },
];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("painted sigil selection and manifest", () => {
  it.each(["", "?sigil=x"])("defaults to painted for %s", (search) => expect(sigilModeOf(search)).toBe("painted"));
  it.each(["?sigil=code", "?element=fire&sigil=code"])("selects analytic for %s", (search) => expect(sigilModeOf(search)).toBe("code"));

  it("reads all seven entries", () => {
    const manifest = parseSigilManifest(fixture())!;
    expect(manifest.version).toBe(1);
    expect([...manifest.masks.keys()]).toEqual(SIGIL_MASK_IDS);
    for (const id of SIGIL_MASK_IDS) expect(manifest.masks.get(id)).toEqual(fixture().masks.find((m) => m.id === id));
  });
  it.each([null, [], "manifest", { ...fixture(), version: 2 }, { ...fixture(), channels: { lines: "g", glow: "r", hot: "b" } }, { ...fixture(), channels: { ...fixture().channels, extra: "a" } }, { ...fixture(), masks: [] }])("rejects an invalid root or empty manifest (%#)", (json) => {
    expect(parseSigilManifest(json)).toBeNull();
  });
  it.each([
    { file: "folder/mask.png" }, { file: "../mask.png" }, { aspect: -1 }, { aspect: Infinity },
    { metres: 0 }, { metres: NaN }, { id: "unknown" }, { md5: "abc" }, { md5: "z".repeat(32) },
    { px: [0, 512] }, { px: [1.5, 512] }, { px: [512] }, { px: [512, 512, 512] }, { px: ["512", 512] },
  ])("skips one invalid entry while retaining the rest (%#)", (bad) => {
    const json = fixture();
    const manifest = parseSigilManifest({ ...json, masks: [{ ...json.masks[0], ...bad }, ...json.masks.slice(1)] })!;
    expect(manifest.masks.size).toBe(6);
    expect(manifest.masks.has("line")).toBe(false);
  });
  it("keeps the first valid duplicate", () => {
    const json = fixture();
    json.masks.push({ ...json.masks[0]!, file: "second.png" });
    expect(parseSigilManifest(json)!.masks.get("line")!.file).toBe("metal-line.png");
    expect(parseSigilManifest({ ...json, masks: [{ ...json.masks[0], aspect: -1 }] })).toBeNull();
  });
  it("keeps the painted world's natural aspect", () => {
    const plane = paintedPlane(14, 5.5994);
    expect(plane[0]).toBe(14);
    expect(plane[1]).toBeCloseTo(2.5003, 3);
  });
  it("requires mode, manifest entry and a loaded texture for each painted path", () => {
    const manifest = parseSigilManifest(fixture())!;
    expect(Object.values(sigilPaths("code", manifest, all))).toEqual(SIGIL_MASK_IDS.map(() => "code"));
    expect(Object.values(sigilPaths("painted", null, all))).toEqual(SIGIL_MASK_IDS.map(() => "code"));
    const loaded = new Set(SIGIL_MASK_IDS.filter((id) => id !== "rift"));
    const paths = sigilPaths("painted", manifest, loaded);
    for (const id of SIGIL_MASK_IDS) expect(paths[id]).toBe(id === "rift" ? "code" : "painted");
    const missing = fixture();
    missing.masks = missing.masks.filter((m) => m.id !== "hex");
    expect(sigilPaths("painted", parseSigilManifest(missing), all).hex).toBe("code");
  });
});

describe("painted sigil loading", () => {
  it.each(["network", "http", "json", "manifest"])("falls back cleanly after %s failure", async (kind) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      if (kind === "network") throw new Error("offline");
      return { ok: kind !== "http", status: 503, json: async () => {
        if (kind === "json") throw new SyntaxError("broken JSON");
        return { version: 2 };
      } };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadPaintedSigils("/test/")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/test/manifest.json", { cache: "no-cache" });
    expect(warn.mock.calls[0]![0]).toContain("analytic sigils");
  });
  it("loads data textures with cache hashes and isolates a failed mask", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => fixture() })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async (url) => {
      if (url.includes("rift")) throw new Error("missing image");
      return new THREE.Texture();
    });
    const loaded = (await loadPaintedSigils("/test/"))!;
    expect(load).toHaveBeenCalledWith(`/test/metal-line.png?v=${md5}`);
    expect(loaded.masks.size).toBe(6);
    expect(loaded.masks.has("rift")).toBe(false);
    const texture = loaded.masks.get("line")!.texture;
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect([texture.wrapS, texture.wrapT]).toEqual([THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping]);
    expect([texture.minFilter, texture.magFilter, texture.anisotropy]).toEqual([THREE.LinearMipmapLinearFilter, THREE.LinearFilter, 8]);
    expect(warn).toHaveBeenCalledWith("[sigils] analytic fallback: rift");
    expect(info).toHaveBeenCalledWith("[sigils] painted: line, arrow, arcs, hex, spiral, crack");
  });
});

describe("mask extraction", () => {
  it("retains authored RGB and clears only near-black noise and the padded border", () => {
    const rgb = new Uint8Array(8 * 8 * 3).fill(1);
    rgb.set([240, 35, 8], (3 * 8 + 3) * 3);
    rgb.set([0, 50, 180], (4 * 8 + 4) * 3);
    const data = packColor(rgb, 8, 8);
    expect([...data.slice((3 * 8 + 3) * 3, (3 * 8 + 3) * 3 + 3)]).toEqual([240, 35, 8]);
    expect([...data.slice((4 * 8 + 4) * 3, (4 * 8 + 4) * 3 + 3)]).toEqual([0, 50, 180]);
    expect(data.filter((v) => v !== 0)).toHaveLength(5);
    expect(rgb[0]).toBe(1);
  });
  it.each(COLOR_SIGIL_ELEMENTS)("selects all seven lane-3 try1 sources for %s", (element) => {
    const sources = sigilSourcesFor(element);
    expect(Object.keys(sources)).toHaveLength(7);
    for (const id of SIGIL_MASK_IDS) {
      expect(sources[id].file).toBe(`${element}-${id === "crack" ? "crack-star" : id === "rift" ? "rift-groove" : `sigil-${id}`}.v1-try1.png`);
      expect(sources[id].crop).toBe(SIGIL_SOURCES[id].crop);
    }
    expect(sources.spiral.flop).toBe(true);
  });
  it("retains Metal's source selections and refuses an unknown element", () => {
    expect(sigilSourcesFor("metal")).toBe(SIGIL_SOURCES);
    expect(() => sigilSourcesFor("missing")).toThrow("Unknown sigil element");
  });
  it.each(rows)("matches the approved crop and pixel budget for $id", ({ id, box: [x, y, w, h], crop, px }) => {
    const c = cropOf({ x, y, w, h }, SIGIL_SOURCES[id].crop);
    expect([c.x, c.y, c.w, c.h]).toEqual(crop);
    expect(maskSize(SIGIL_PLANES[id], c.w, c.h)).toEqual(px);
    expect(SIGIL_SOURCES[id].flop).toBe(id === "spiral");
  });
  it("uses the inclusive 13/255 bright-box threshold", () => {
    expect(brightBox(new Uint8Array([12, 0, 0, 13, 0, 14]), 3, 2)).toEqual({ x: 0, y: 1, w: 3, h: 1 });
    expect(brightBox(new Uint8Array(16), 4, 4)).toBeNull();
  });
  it("packs black to zero in all three channels", () => {
    const packed = packChannels(new Uint8Array(16 * 16 * 3), 16, 16, 1, 1);
    expect(packed.data.every((v) => v === 0)).toBe(true);
    expect(packed.hotShare).toBe(0);
  });
  it("retains a saturated stroke, clears the two-pixel border and caps hotT", () => {
    const rgb = new Uint8Array(16 * 16 * 3);
    for (let y = 0; y < 16; y += 1) rgb[(y * 16 + 8) * 3] = 255;
    const packed = packChannels(rgb, 16, 16, 1, 2);
    expect(packed.hotT).toBeCloseTo(0.95);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const pixel = packed.data.slice((y * 16 + x) * 3, (y * 16 + x + 1) * 3);
        if (x < 2 || y < 2 || x >= 14 || y >= 14) expect([...pixel]).toEqual([0, 0, 0]);
        else if (x === 8) expect(pixel[0]).toBe(255);
      }
    }
    expect(packed.data[(8 * 16 + 7) * 3 + 1]).toBeGreaterThan(0);
    expect(packed.data[(8 * 16 + 7) * 3]).toBe(0);
  });
  it("uses separable Gaussian weights with zero beyond the border", () => {
    const rgb = new Uint8Array(16 * 16 * 3);
    rgb[0] = 255;
    const packed = packChannels(rgb, 16, 16, 1, 1);
    const weights = Array.from({ length: 7 }, (_, i) => Math.exp(-((i - 3) ** 2) / 2));
    const sum = weights.reduce((a, b) => a + b, 0);
    const expected = Math.round(255 * 2.5 * (weights[5]! / sum) ** 2);
    expect(packed.data[(2 * 16 + 2) * 3 + 1]).toBe(expected);
  });
});

describe("painted ground geometry", () => {
  it("replaces and disposes sigil geometry, then restores its analytic dimensions", () => {
    const sigil = new GroundSigil("line", 14, 1.8, "#ffffff", "#ffffff");
    const old = sigil.mesh.geometry;
    const dispose = vi.spyOn(old, "dispose");
    sigil.mesh.scale.set(2, 3, 1);
    sigil.setPainted(new THREE.Texture(), 5.5994);
    expect(sigil.painted).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    const geometry = sigil.mesh.geometry as THREE.PlaneGeometry;
    expect(geometry.parameters.width).toBe(14);
    expect(geometry.parameters.height).toBeCloseTo(2.5003, 3);
    expect(sigil.mesh.scale.toArray()).toEqual([2, 3, 1]);
    sigil.setPainted(null);
    expect(sigil.painted).toBe(false);
    expect((sigil.mesh.geometry as THREE.PlaneGeometry).parameters.height).toBe(1.8);
  });
  it("keeps one ground-mark draw and requires both painted kinds", () => {
    const marks = new GroundMarks(8, 4);
    const geometry = marks.mesh.geometry;
    const star = new THREE.Texture(), rift = new THREE.Texture();
    marks.setPainted(star, 1.386, null, 8.7861);
    expect(marks.painted).toBe(false);
    marks.setPainted(star, 1.386, rift, 8.7861);
    expect(marks.painted).toBe(true);
    expect(marks.mesh.geometry).toBe(geometry);
    const body = new THREE.Color(0.58, 0.6, 0.62), core = new THREE.Color(1, 1, 1);
    marks.setTint(body, core, [1, 0.83, 0.48], 0.3);
    body.setRGB(0, 0, 0);
    const u = (marks.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(u.uBody!.value.toArray()).toEqual([0.58, 0.6, 0.62]);
    expect(u.uAspect!.value.toArray()).toEqual([1.386, 8.7861]);
    expect(u.uInnerMix!.value).toBe(0.3);
    marks.setPainted(null, 1, rift, 8.7861);
    expect(marks.painted).toBe(false);
    marks.dispose();
  });
});

const magick = process.env.ART_MAGICK ?? "/opt/homebrew/bin/magick";
let hasMagick = false;
try { execFileSync(magick, ["-version"], { stdio: "ignore" }); hasMagick = true; } catch { /* Optional on other machines. */ }
const src = resolve("art-src/lab/firefly-sprint-2026-11-05/stills/skills");
const manifestFile = resolve("art-src/lab/vfx/sigils/manifest.json");

describe("approved source images and generated manifest", () => {
  for (const row of rows) {
    const file = resolve(src, SIGIL_SOURCES[row.id].file);
    it.skipIf(!hasMagick || !existsSync(file))(`measures the approved bright box of ${row.id}`, () => {
      const [w, h] = execFileSync(magick, [file, "-format", "%w %h", "info:"], { encoding: "utf8" }).trim().split(/\s+/).map(Number) as [number, number];
      const rgb = execFileSync(magick, [file, "-alpha", "off", "-depth", "8", "rgb:-"], { maxBuffer: 64 * 1024 * 1024 });
      const maxCh = new Uint8Array(w * h);
      for (let i = 0; i < maxCh.length; i += 1) maxCh[i] = Math.max(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
      const [x, y, bw, bh] = row.box;
      expect(brightBox(maxCh, w, h)).toEqual({ x, y, w: bw, h: bh });
    });
  }
  it.skipIf(!existsSync(manifestFile))("has seven real masks with the approved dimensions and aspect", () => {
    const manifest = parseSigilManifest(JSON.parse(readFileSync(manifestFile, "utf8")))!;
    expect(manifest.masks.size).toBe(7);
    for (const row of rows) {
      const entry = manifest.masks.get(row.id)!;
      expect(entry.px).toEqual(row.px);
      expect(entry.aspect).toBeCloseTo(row.aspect, 3);
      expect(existsSync(resolve("art-src/lab/vfx/sigils", entry.file))).toBe(true);
    }
  });
});
