import { createHash } from "node:crypto";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FB_COMPOSE_GLSL, FB_MASKED_GLSL, FB_PICK_GLSL, FLIPBOOK_ERODE_WIDTH, FLIPBOOK_MASKED_LOOK, FLIPBOOK_TIMING,
  FlipbookLibrary, FlipbookPlayer, FlipbookPool, blendPremultiplied, composeFlipbookMasked, composeLayers,
  erodeThreshold, flipbookControl, flipbookFramePair, flipbookLoopMode, flipbookSwitch, flipbookTick,
  flipbookTimingOf, isFlipbookV2, parseFlipbookManifest, playLife, rampMixAt, revealThreshold, srgbToLinear,
  type FlipbookControls, type FlipbookLoopMode, type FlipbookMaskedLook, type FlipbookMaskedSample,
  type FlipbookMeta, type FlipbookMode, type FlipbookVec3, type FlipbookVec4, type FlipOptions,
} from "../../src/view/skills/flipbook";

const VERTEX_SHA = "c2f64aa0e39d46ec17b4f60ecd3932e42178f933784a72ee8fec1d38cc25a9c7";
const FRAGMENT_SHA = "3b5524bd2c052ed97c6261586915f9b218deb5756d0477d634e3605d05b93abd";
const OLD_KEYS = ["id", "url", "cols", "rows", "frames", "fps", "loop", "mode", "aspect", "pivot", "start", "heading"];
const MODES: FlipbookMode[] = ["rgba", "fire", "smoke", "heat"];
const LOOPS: FlipbookLoopMode[] = ["none", "stepped", "holderode"];
const T = FLIPBOOK_TIMING["impact-key1"];
const ORIGIN = new THREE.Vector3();
const pools: FlipbookPool[] = [];

// The existing fire manifest entry, omitting only use, source, checks and modeNote.
const GLINT = {
  file: "fire-twinkle-set.atlas.png", json: "fire-twinkle-set.json", cols: 16, rows: 8, frames: 16, fps: 24,
  loop: false, blend: "additive", mode: "fire", alpha: false, alphaKind: "none (rgb on black; black means no energy)",
  premultiplied: false, tint: false, modesAllowed: ["additive", "heat"], cell: [128, 128], pivot: [0.5, 0.5],
  start: 0, heading: 0, tileX: false, width: 2048, height: 1024, md5: "67106d17c24f841c3807a96aa7e92886", bytes: 725605,
  roles: ["glint"], status: "candidate (owner review pending; not judged)", variants: 8,
  order: "one element per row (variant), its frames left to right",
};

afterEach(() => {
  for (const p of pools) p.dispose();
  pools.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function parse(entry: Record<string, unknown> = {}): FlipbookMeta {
  return parseFlipbookManifest({ version: 1, flipbooks: { c: { file: "c.png", cols: 4, rows: 4, mode: "rgba", ...entry } } }, "/v/").get("c")!;
}

function glint(extra: Record<string, unknown> = {}): FlipbookMeta {
  return parseFlipbookManifest({ version: 1, flipbooks: { "fire-twinkle-set": { ...GLINT, ...extra } } }, "/v/").get("fire-twinkle-set")!;
}

function pool(meta?: FlipbookMeta, mode: FlipbookMode = "rgba", capacity = 4, controls: FlipbookControls | null = null): FlipbookPool {
  const p = new FlipbookPool("c", mode, capacity, 12, new THREE.Texture());
  pools.push(p);
  if (meta !== undefined) p.attach(meta, new THREE.Texture(), controls);
  return p;
}

function close(actual: ArrayLike<number>, expected: readonly number[], epsilon = 1e-6): void {
  expect(actual.length).toBeGreaterThanOrEqual(expected.length);
  expected.forEach((x, i) => expect(Math.abs(actual[i]! - x), `channel ${i}: ${actual[i]} vs ${x}`).toBeLessThanOrEqual(epsilon));
}

function attribute(p: FlipbookPool, name: string): ArrayLike<number> {
  return p.mesh.geometry.getAttribute(name).array;
}

function oldShader(p: FlipbookPool): void {
  const m = p.mesh.material;
  expect(createHash("sha256").update(m.vertexShader).digest("hex")).toBe(VERTEX_SHA);
  expect(createHash("sha256").update(m.fragmentShader).digest("hex")).toBe(FRAGMENT_SHA);
  expect(Object.keys(m.defines)).toEqual([]);
  expect(p.mesh.geometry.hasAttribute("iCtl")).toBe(false);
  expect(p.mesh.geometry.hasAttribute("iVar")).toBe(false);
}

function sample(extra: Partial<FlipbookMaskedSample> = {}): FlipbookMaskedSample {
  return {
    t0: [0.9, 0.5, 0.2, 1], t1: [0.9, 0.5, 0.2, 1], m0: [1, 0, 0, 1], m1: [1, 0, 0, 1],
    b0: 0, b1: 0, w: 0, ctl: [1, -0.08, 0.08, 0], tint: [1, 1, 1], soft: 1, ...extra,
  };
}

function texMask(width?: number, height?: number): THREE.Texture {
  return width === undefined ? new THREE.Texture() : new THREE.Texture({ width, height } as HTMLImageElement);
}

describe("1. legacy shader and manifest compatibility", () => {
  it.each(MODES)("keeps the original shader hashes and material version in %s", (mode) => {
    const p = pool(undefined, mode);
    oldShader(p);
    expect(p.mesh.material.vertexShader.length).toBe(1823);
    expect(p.mesh.material.fragmentShader.length).toBe(7272);
    for (const loop of [true, false]) {
      const m = parse({ loop, md5: "0123456789abcdef0123456789abcdef", blend: "normal", alphaKind: "straight", modesAllowed: ["rgba"] });
      expect(Object.keys(m)).toEqual(OLD_KEYS);
      expect(isFlipbookV2(m)).toBe(false);
      p.attach(m, new THREE.Texture());
      oldShader(p);
      expect(p.mesh.material.version).toBe(0);
      expect(p.mesh.material.uniforms.uLoop!.value).toBe(loop ? 1 : 0);
    }
  });

  it("ignores variants on the real old glint entry, including malformed values", () => {
    const m = glint();
    expect(Object.keys(m)).toEqual(OLD_KEYS);
    expect(m.url).toBe("/v/fire-twinkle-set.atlas.png?v=67106d17c24f841c3807a96aa7e92886");
    expect(m.frames).toBe(16);
    expect(isFlipbookV2(m)).toBe(false);
    close([playLife(m, {})], [16 / 24]);
    expect(glint({ variants: 0 })).toEqual(m);
    expect(glint({ variants: "x" })).toEqual(m);
    const p = pool(m, "fire");
    oldShader(p);
    expect(p.mesh.material.version).toBe(0);
    p.spawn(ORIGIN, 1, { variant: 3 });
    p.update(1 / 60);
    expect(attribute(p, "iData")[2]).toBe(0);
  });

  it("also ignores variants on manually constructed legacy metadata", () => {
    const p = pool({ ...parse(), variants: 8 });
    p.spawn(ORIGIN, 1, { variant: 7 });
    p.update(0);
    oldShader(p);
    expect(attribute(p, "iData")[2]).toBe(0);
  });
});

describe("2. v2 manifest", () => {
  it.each(LOOPS)("resolves loopMode %s ahead of the old loop flag", (loopMode) => {
    const m = parse({ loop: true, loopMode });
    expect(m.loop).toBe(loopMode !== "none");
    expect(flipbookLoopMode(m)).toBe(loopMode);
    expect(isFlipbookV2(m)).toBe(true);
  });

  it("defaults v2 loopMode only when a v2 trigger exists", () => {
    expect(parse({ frameRange: [2, 5], loop: true }).loopMode).toBe("stepped");
    expect(parse({ frameRange: [2, 5] }).loopMode).toBe("none");
    expect(flipbookLoopMode(parse({ loop: true }))).toBe("stepped");
    expect(flipbookLoopMode(parse())).toBe("none");
    expect(parse({ loop: true, loopMode: "none" }).loop).toBe(false);
  });

  it.each([
    ["loopMode", "crossfade"], ["frameRange", [5, 2]], ["frameRange", [0, 16]], ["frameRange", [0.5, 3]],
    ["frameRange", [-1, 3]], ["frameRange", [0, 1, 2]], ["frameRange", [0, NaN]],
    ["frameRange", new Array(2)],
    ["controlA", "../a.png"], ["controlA", 3], ["controlB", "b.png"],
    ["timingProfile", "impact-key1"], ["sourceFps", 0], ["sourceFps", NaN], ["sourceFps", "24"], ["sourceFps", 300],
    ["anchor", [300, 10]], ["anchor", [-1, 0]], ["anchor", [Infinity, 0]], ["anchor", [0]],
    ["anchor", new Array(2)],
  ])("rejects invalid %s = %j with the field name", (name, value) => {
    expect(() => parse({ [name as string]: value })).toThrow("Invalid flipbook " + name + ": c");
  });

  it.each([
    { frames: 8, variants: 2 }, { frames: 4, variants: 4 }, { variants: 1 },
    { frames: 8, variants: 2, frameRange: [0, 7] },
  ])("accepts variants as frames per variant: %j", (entry) => {
    const m = parse({ loopMode: "none", ...entry });
    expect(m.frames).toBe(entry.frames ?? 16);
    expect(m.variants).toBe(entry.variants);
  });

  it.each([
    { frames: 8, variants: 3 }, { frames: 16, variants: 2 }, { variants: 2 }, { variants: 0 },
    { variants: 1.5 }, { variants: "2" },
  ])("rejects invalid v2 variants: %j", (entry) => {
    expect(() => parse({ loopMode: "none", ...entry })).toThrow("Invalid flipbook variants: c");
  });

  it("checks frameRange within one variant and enables the real glint without shortening its life", () => {
    expect(parse({ frameRange: [2, 5] }).frameRange).toEqual([2, 5]);
    expect(() => parse({ loopMode: "none", frames: 8, variants: 2, frameRange: [0, 8] })).toThrow("Invalid flipbook frameRange: c");
    const m = glint({ loopMode: "none" });
    expect(isFlipbookV2(m)).toBe(true);
    expect(m.loop).toBe(false);
    expect(m.frames).toBe(16);
    expect(m.variants).toBe(8);
    expect(Object.keys(m).slice(0, 12)).toEqual(OLD_KEYS);
    expect(Object.keys(m).slice(12).sort()).toEqual(["loopMode", "variants"]);
    close([playLife(m, {})], [16 / 24]);
  });

  it("builds mask URLs with the atlas revision and validates masks and timing", () => {
    const md5 = "0123456789abcdef0123456789abcdef";
    const m = parse({ controlA: "a.png", controlB: "b.webp", md5, timingProfile: "impact-key1" });
    expect(m.controlA).toBe("/v/a.png?v=" + md5);
    expect(m.controlB).toBe("/v/b.webp?v=" + md5);
    expect(m.timingProfile).toBe("impact-key1");
    expect(() => parse({ controlA: "a.png", mode: "fire" })).toThrow("Invalid flipbook controlA: c");
    expect(() => parse({ controlA: "a.png", controlB: "../b.png" })).toThrow("Invalid flipbook controlB: c");
    for (const timingProfile of ["nope", "toString", "__proto__"]) {
      expect(() => parse({ controlA: "a.png", timingProfile })).toThrow("Invalid flipbook timingProfile: c");
    }
  });

  it("stores sourceFps and anchor without activating v2, with anchor overriding pivot", () => {
    const m = parse({ anchor: [0.25, 0.75], pivot: [0, 0], sourceFps: 24 });
    expect(m.pivot).toEqual([0.25, 0.75]);
    expect(m.anchor).toBe(m.pivot);
    expect(m.sourceFps).toBe(24);
    expect(isFlipbookV2(m)).toBe(false);
    expect(parse({ anchor: [64, 192], cell: 256 }).anchor).toEqual([0.25, 0.75]);
    expect(parse({ anchor: [64, 96], cell: [256, 128] }).anchor).toEqual([0.25, 0.75]);
  });

  it("retains old grid, frame and start checks", () => {
    expect(() => parse({ frames: 17 })).toThrow("Invalid flipbook frames: c");
    expect(() => parse({ cols: 0 })).toThrow("Invalid flipbook grid: c");
    expect(parse({ frames: 8, start: 8, loopMode: "none" }).start).toBe(0);
  });
});

describe("3. frame pairs and shader construction", () => {
  const pairs: [FlipbookLoopMode, number, boolean, number, number, number][] = [
    ["none", 3.25, false, 3, 4, 0.25], ["none", 3.25, true, 3, 4, 0], ["none", 5.5, false, 5, 5, 0], ["none", 1, false, 2, 3, 0],
    ["stepped", 5.5, false, 5, 5, 0], ["stepped", 6.25, false, 2, 2, 0], ["stepped", 1, false, 5, 5, 0],
    ["holderode", 5.5, false, 5, 2, 0.5], ["holderode", 3.75, false, 3, 4, 0.75], ["holderode", 1, false, 5, 2, 0],
  ];
  it.each(pairs)("%s at %s (step %s) -> %s, %s, %s", (loop, frame, step, f0, f1, w) => {
    const out = { f0: -1, f1: -1, w: -1 };
    flipbookFramePair(frame, 2, 4, loop, step, out);
    expect(out).toEqual({ f0, f1, w });
  });

  it.each([0, 0.25, 0.5, 0.75, 1])("switches monotonically around survival order %s", (order) => {
    expect(flipbookSwitch(0, order)).toBe(0);
    expect(flipbookSwitch(1, order)).toBe(1);
    let previous = 0;
    for (let k = 0; k <= 100; k += 1) {
      const w = k / 100;
      const actual = flipbookSwitch(w, order);
      expect(actual).toBeGreaterThanOrEqual(previous);
      const threshold = 0.08 * (1 - order) + 0.92 * order;
      if (Math.abs(w - threshold) >= 0.08) expect(actual === 0 || actual === 1).toBe(true);
      previous = actual;
    }
  });

  it.each(LOOPS)("builds the exact v2 insertions once for %s", (loopMode) => {
    const p = pool(parse({ loopMode }));
    const f = p.mesh.material.fragmentShader;
    expect(f).not.toContain("mod(f0 + 1.0, uFrames)");
    for (const block of [FB_PICK_GLSL, FB_COMPOSE_GLSL, FB_MASKED_GLSL]) expect(f.split(block)).toHaveLength(2);
    expect(p.mesh.material.vertexShader).toContain("attribute vec4 iCtl;");
    expect(p.mesh.material.vertexShader).toContain("attribute float iVar;");
  });
});

describe("4. premultiplied composition", () => {
  it("matches three successive over operations across 375 coverage/color combinations", () => {
    const colors: [FlipbookVec3, FlipbookVec3, FlipbookVec3][] = [
      [[0.03, 0.022, 0.02], [0.88, 0.5, 0.2], [2.2, 2.1604, 1.9162]],
      [[0.1, 0.1, 0.1], [0.8, 0.4, 0.2], [2, 1, 0.5]],
      [[0, 0, 0], [0.88, 0.88, 0.88], [1, 1, 1]],
    ];
    for (const [ci, cb, ch] of colors) for (const ai of [0, 0.25, 0.5, 0.75, 1]) for (const ab of [0, 0.25, 0.5, 0.75, 1]) for (const ah of [0, 0.25, 0.5, 0.75, 1]) {
      const expected = [0, 0, 0, 0];
      for (const [color, a] of [[ci, ai], [cb, ab], [ch, ah]] as const) {
        for (let k = 0; k < 3; k += 1) expected[k] = color[k]! * a + expected[k]! * (1 - a);
        expected[3] = a + expected[3]! * (1 - a);
      }
      const out: number[] = [];
      composeLayers(ai, ab, ah, ci, cb, ch, out);
      close(out, expected, 1e-9);
    }
  });

  it("matches the source and light/dark stone blend checkpoints", () => {
    const out: number[] = [];
    composeLayers(0.25, 0.5, 0.1, [0.1, 0.1, 0.1], [0.8, 0.4, 0.2], [2, 1, 0.5], out);
    close(out, [0.57125, 0.29125, 0.15125, 0.6625]);
    const light: FlipbookVec3 = [srgbToLinear(214 / 255), srgbToLinear(208 / 255), srgbToLinear(194 / 255)];
    const dark: FlipbookVec3 = [srgbToLinear(42 / 255), srgbToLinear(44 / 255), srgbToLinear(48 / 255)];
    close(light, [0.672443, 0.630757, 0.539479]);
    const blended: number[] = [];
    blendPremultiplied(out as unknown as FlipbookVec4, light, blended);
    close(blended, [0.798200, 0.504131, 0.333324]);
    blendPremultiplied(out as unknown as FlipbookVec4, dark, blended);
    close(blended, [0.579064, 0.299751, 0.161225]);
    close([srgbToLinear(0), srgbToLinear(0.04045), srgbToLinear(1)], [0, 0.04045 / 12.92, 1]);
  });

  const cases: { name: string; t?: FlipbookVec4; m?: FlipbookVec4; b?: number; extra?: Partial<FlipbookMaskedSample>; look?: Partial<FlipbookMaskedLook>; want: FlipbookVec4 }[] = [
    { name: "empty hull", m: [0, 0, 0, 1], want: [0, 0, 0, 0] },
    { name: "body cap", want: [0.88, 0.5, 0.2, 1] },
    { name: "ink independent of atlas alpha", t: [0.9, 0.5, 0.2, 0], m: [1, 1, 0, 1], want: [0.0165, 0.0121, 0.011, 0.55] },
    { name: "uncapped HDR core", t: [0, 0, 0, 0], m: [0, 0, 1, 1], want: [2.2, 2.1604, 1.9162, 1] },
    { name: "128 reveal hidden", b: 128 / 255, extra: { ctl: [0.25, -0.08, 0.08, 0] }, want: [0, 0, 0, 0] },
    { name: "128 reveal shown", b: 128 / 255, extra: { ctl: [0.5, -0.08, 0.08, 0] }, want: [0.88, 0.5, 0.2, 1] },
    { name: "64 reveal shown", b: 64 / 255, extra: { ctl: [0.25, -0.08, 0.08, 0] }, want: [0.88, 0.5, 0.2, 1] },
    { name: "last reveal hidden", b: 1, extra: { ctl: [0.75, -0.08, 0.08, 0] }, want: [0, 0, 0, 0] },
    { name: "last reveal shown", b: 1, want: [0.88, 0.5, 0.2, 1] },
    { name: "eroded low survival", m: [1, 0, 0, 0.5], extra: { ctl: [1, 0.819256, 0.08, 1] }, want: [0, 0, 0, 0] },
    { name: "surviving ramp cap", extra: { ctl: [1, 0.819256, 0.08, 1] }, want: [0.88, 0.88, 0.871, 1] },
    { name: "soft once", extra: { soft: 0.5 }, want: [0.44, 0.25, 0.1, 0.5] },
    { name: "premultiplied frame interpolation", extra: { t0: [1, 0, 0, 1], t1: [0, 0, 1, 0], w: 0.5 }, want: [0.44, 0, 0, 0.5] },
    { name: "sharpen coverage", t: [0.9, 0.5, 0.2, 0.2], look: { sharpen: [0.06, 0.4] }, want: [0.324738, 0.18451, 0.073804, 0.369021] },
    { name: "unsharpened coverage", t: [0.9, 0.5, 0.2, 0.2], want: [0.176, 0.1, 0.04, 0.2] },
    { name: "grade", t: [0.95, 0.9, 0.8, 1], look: { grade: [0.9, 0.55, 0.12, 0.9] }, want: [0.88, 0.5445, 0.1188, 1] },
    { name: "hot lead during ramp", t: [0, 0, 0, 0], m: [0, 0, 1, 0.65], extra: { ctl: [1, 0.5, 0.08, 1] }, want: [1.503906, 1.476836, 1.309902, 0.683594] },
    { name: "hot lead off before ramp", t: [0, 0, 0, 0], m: [0, 0, 1, 0.65], extra: { ctl: [1, 0.5, 0.08, 0] }, want: [2.2, 2.1604, 1.9162, 1] },
    { name: "all three layers", t: [0.9, 0.5, 0.2, 0.5], m: [0.8, 0.5, 0.25, 1], want: [0.883094, 0.729869, 0.556113, 0.728125] },
  ];
  it.each(cases)("composes $name", ({ t, m, b, extra, look, want }) => {
    const s = sample({ ...(t ? { t0: t, t1: t } : {}), ...(m ? { m0: m, m1: m } : {}), ...(b !== undefined ? { b0: b, b1: b } : {}), ...extra });
    const out: number[] = [];
    composeFlipbookMasked(s, { ...FLIPBOOK_MASKED_LOOK, ...look }, out);
    close(out, want);
  });

  it("retains the exact compositing equations in GLSL", () => {
    for (const line of [
      "float alpha = 1.0 - (1.0 - ai) * (1.0 - ab) * (1.0 - ah);",
      "vec3 rgb = ci * ai * (1.0 - ab) * (1.0 - ah) + cb * ab * (1.0 - ah) + ch * ah;",
      "return vec4(rgb * soft, alpha * soft);",
    ]) expect(FB_COMPOSE_GLSL).toContain(line);
  });
});

describe("274. masked body ramp cooling", () => {
  function rampAt(r: number, look: FlipbookMaskedLook): number[] {
    const smooth = (lo: number, hi: number) => {
      const t = Math.max(0, Math.min(1, (r - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    };
    return look.soot.map((soot, k) => {
      let color = soot;
      for (const [target, lo, hi] of [
        [look.ramp[2], 0.23, 0.27], [look.ramp[1], 0.48, 0.52], [look.ramp[0], 0.73, 0.77],
      ] as const) color += (target[k]! - color) * smooth(lo, hi);
      return Math.min(color, look.bodyCap);
    });
  }

  it("keeps the Test 4 surviving ramp cap exactly with default and explicit zero cooling", () => {
    expect(FLIPBOOK_MASKED_LOOK.rampCool).toBe(0);
    const s = sample({ ctl: [1, 0.819256, 0.08, 1] });
    const implicit: number[] = [], explicit: number[] = [];
    composeFlipbookMasked(s, FLIPBOOK_MASKED_LOOK, implicit);
    composeFlipbookMasked(s, { ...FLIPBOOK_MASKED_LOOK, rampCool: 0 }, explicit);
    expect(implicit).toEqual([0.88, 0.88, 0.871, 1]);
    expect(explicit).toEqual(implicit);
  });

  const t05 = (0.5 - 0.2) / (0.85 - 0.2);
  const weight05 = t05 * t05 * (3 - 2 * t05);
  it.each([[0.5, 1 * (1 - weight05) + 0.4 * weight05], [0.9, 0.4]])("caps the last survivor at e=%s to ramp r=%s", (e, r) => {
    const look = { ...FLIPBOOK_MASKED_LOOK, rampCool: 1 };
    const out: number[] = [];
    composeFlipbookMasked(sample({ ctl: [1, e!, 0.08, 1] }), look, out);
    close(out, [...rampAt(r!, look), 1], 1e-6);
  });

  it("inserts the exact cooling line only in v2 and restores both legacy shader hashes", () => {
    const p = pool(parse({ controlA: "a.png" }), "rgba", 1, { a: texMask() });
    const u = p.mesh.material.uniforms;
    expect(u.uRampCool!.value).toBe(FLIPBOOK_MASKED_LOOK.rampCool);
    const line = "  if (uRampCool > 0.0) r = min(r, mix(1.0, 0.40, uRampCool * smoothstep(0.2, 0.85, e)));";
    expect(p.mesh.material.fragmentShader).toContain(
      "  float r = clamp((m.a - e) / max(1.0 - e, 1e-4), 0.0, 1.0);\n" + line,
    );
    expect(p.mesh.material.fragmentShader.split("uniform float uRampCool;\n")).toHaveLength(2);
    p.rampCool = 1;
    expect(u.uRampCool!.value).toBe(1);
    p.attach(parse(), new THREE.Texture());
    oldShader(p);
    expect(p.mesh.material.vertexShader).not.toContain("uRampCool");
    expect(p.mesh.material.fragmentShader).not.toContain("uRampCool");
    expect(u.uRampCool!.value).toBe(1);
    p.attach(parse({ controlA: "a.png" }), new THREE.Texture(), { a: texMask() });
    expect(u.uRampCool!.value).toBe(1);
  });
});

describe("5–8. ticks, reveal, erosion and body luminance", () => {
  it("maps the specified seconds to ticks", () => {
    expect([0, 1 / 60, 0.5, 42 / 60, -0.1].map(flipbookTick)).toEqual([0, 1, 30, 42, 0]);
  });

  it.each([[1 / 30, 15], [1 / 60, 30], [1 / 144, 72]])("draws tick 30 at 0.5 s with dt %s", (dt, steps) => {
    const p = pool(parse({ controlA: "a.png" }), "rgba", 1, { a: texMask() });
    p.spawn(ORIGIN, 1, { timing: "impact-key1" });
    for (let k = 0; k <= steps!; k += 1) p.update(dt!);
    close([attribute(p, "iCtl")[1]!], [0.918182]);
  });

  it("keeps accumulated Float32 ages on the exact tick at all five specified rates", () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 75, 1 / 120, 1 / 144]) {
      let age = 0;
      for (let k = 0; k < 400; k += 1) {
        expect(flipbookTick(age)).toBe(flipbookTick(k * dt));
        age = Math.fround(age + dt);
      }
    }
  });

  it("reveals over four ticks and clamps", () => {
    close([0, 1, 2, 3, 4, 10].map((tick) => revealThreshold(tick)), [0.25, 0.5, 0.75, 1, 1, 1]);
    expect(revealThreshold(-2)).toBe(0);
  });

  it("follows every impact-key1 erosion and ramp checkpoint monotonically", () => {
    for (let k = 0; k <= 9; k += 1) expect(erodeThreshold(k, T)).toBe(-0.08);
    close([10, 12, 18, 20, 31, 42, 60].map((tick) => erodeThreshold(tick, T)), [0.081405, 0.358099, 0.819256, 0.85, 0.925, 1, 1]);
    for (let k = 1; k <= 60; k += 1) expect(erodeThreshold(k, T)).toBeGreaterThanOrEqual(erodeThreshold(k - 1, T));
    expect(T.erodeEnd - T.holdEnd).toBeGreaterThanOrEqual(3 * T.revealTicks);
    close([9, 11, 13].map((tick) => rampMixAt(tick, T)), [0, 0.5, 1]);
  });

  it("holds full body light at ticks 0–9, tears below 15% at 18 and ends at zero", () => {
    const brightness: number[] = [];
    const ctl = [1, 0, 0, 0] as [number, number, number, number];
    const out: number[] = [];
    for (let tick = 0; tick <= 42; tick += 1) {
      flipbookControl(tick / 60, 43 / 60, 0, 0, T, ctl);
      let sum = 0;
      for (let k = 0; k < 1000; k += 1) {
        const m: FlipbookVec4 = [1, 0, 0, (k + 0.5) / 1000];
        composeFlipbookMasked(sample({ m0: m, m1: m, ctl }), FLIPBOOK_MASKED_LOOK, out);
        sum += 0.2126 * out[0]! + 0.7152 * out[1]! + 0.0722 * out[2]!;
      }
      brightness.push(sum);
    }
    for (let k = 0; k <= 9; k += 1) close([brightness[k]!], [559.128], 0.01);
    expect(brightness[18]! / Math.max(...brightness)).toBeLessThanOrEqual(0.15);
    expect(brightness[42]).toBe(0);
  });
});

describe("9. pool control output and life", () => {
  function scheduled(): FlipbookMeta {
    return parse({ controlA: "a.png", controlB: "b.png", timingProfile: "impact-key1" });
  }

  it("draws exactly ticks 0–42 with scheduled controls and no default fadeOut", () => {
    const p = pool(scheduled(), "rgba", 2, { a: texMask(), b: texMask() });
    p.spawn(ORIGIN, 1);
    for (let tick = 0; tick <= 42; tick += 1) {
      p.update(1 / 60);
      expect(p.live).toBe(1);
      if (tick === 0) close(attribute(p, "iCtl"), [0.25, -0.08, 0.08, 0]);
      if (tick === 12) close(attribute(p, "iCtl"), [1, 0.358099, 0.08, 0.75]);
      if (tick === 42) expect(attribute(p, "iData")[3]).toBe(1);
    }
    p.update(1 / 60);
    expect(p.live).toBe(0);
  });

  it("uses neutral, cool and explicit erode controls without a schedule", () => {
    const p = pool(parse({ controlA: "a.png" }), "rgba", 1, { a: texMask() });
    p.spawn(ORIGIN, 1, { timing: undefined });
    p.update(0);
    close(attribute(p, "iCtl"), [1, -0.08, 0.08, 0]);
    p.clear();
    p.spawn(ORIGIN, 1, { cool: 0.5, life: 1 });
    p.update(0.75);
    p.update(0);
    close(attribute(p, "iCtl"), [1, 0.46, 0.08, 1]);
    p.clear();
    p.spawn(ORIGIN, 1, { erode: 0.6 });
    p.update(0);
    close(attribute(p, "iCtl"), [1, 0.568, 0.08, 0]);
  });

  it("overwrites a reused slot's timing and variant", () => {
    const p = pool(parse({ frames: 8, variants: 2, controlA: "a.png" }), "rgba", 1, { a: texMask() });
    p.spawn(ORIGIN, 1, { timing: "impact-key1", variant: 1 });
    for (let tick = 0; tick < 44; tick += 1) p.update(1 / 60);
    expect(p.live).toBe(0);
    p.spawn(ORIGIN, 1, { variant: 0 });
    p.update(0);
    close(attribute(p, "iCtl"), [1, -0.08, 0.08, 0]);
    expect(attribute(p, "iVar")[0]).toBe(0);
  });

  it("ignores option timing on legacy metadata and keeps the old life", () => {
    const m = parse();
    const p = pool(m);
    const opts: FlipOptions = { timing: "impact-key1" };
    expect(playLife(m, opts)).toBe(playLife(m, {}));
    p.spawn(ORIGIN, 1, opts);
    let draws = 0;
    do { p.update(1 / 60); draws += p.live; } while (p.live > 0 && draws < 100);
    expect(draws).toBe(40);
    expect(p.mesh.geometry.hasAttribute("iCtl")).toBe(false);
  });

  it.each(["rgba", "fire"] as const)("keeps scheduled life but old fade without an active mask in %s", (mode) => {
    const m = scheduled();
    const p = pool(m, mode, 1, mode === "rgba" ? null : { a: texMask(), b: texMask() });
    close([playLife(m, {})], [43 / 60]);
    p.spawn(ORIGIN, 1);
    for (let tick = 0; tick <= 42; tick += 1) {
      p.update(1 / 60);
      expect(p.live).toBe(1);
      close(attribute(p, "iCtl"), [1, -0.08, 0.08, 0]);
      if (tick === 42) close([attribute(p, "iData")[3]!], [0.138889], 1e-4);
    }
    p.update(1 / 60);
    expect(p.live).toBe(0);
  });

  it("resolves timing precedence, explicit life, cool suppression and erode", () => {
    const m = scheduled();
    const custom = { ...T, erodeEnd: 60 };
    expect(flipbookTimingOf(m, {})).toBe(T);
    expect(flipbookTimingOf(m, { timing: custom })).toBe(custom);
    expect(flipbookTimingOf(m, { timing: "nope" as "impact-key1" })).toBeNull();
    expect(flipbookTimingOf(parse(), { timing: custom })).toBeNull();
    expect(playLife(m, { timing: custom })).toBe(61 / 60);
    expect(playLife(m, { life: 0.1 })).toBe(0.1);
    const out = [99, 99, 99, 99, 99, 99];
    flipbookControl(0, 1, 0.1, 0.6, T, out, 1);
    close(out, [99, 0.25, 0.568, 0.08, 0, 99]);
    const p = pool(m, "rgba", 1, { a: texMask() });
    p.spawn(ORIGIN, 1, { life: 0.1, fadeOut: 0.1, cool: 0.1 });
    p.update(0.05);
    p.update(0);
    close(attribute(p, "iCtl"), [1, -0.08, 0.08, 0]);
    close([attribute(p, "iData")[3]!], [0.5]);
    p.update(0.1);
    p.update(0);
    expect(p.live).toBe(0);
  });

  it("compacts control/variant data with live sprites and starts tick zero after a delay", () => {
    const p = pool(parse({ frames: 8, variants: 2, controlA: "a.png" }), "rgba", 2, { a: texMask() });
    p.spawn(ORIGIN, 1, { life: 0.001, variant: 0 });
    p.spawn(ORIGIN, 1, { delay: 0.1, timing: "impact-key1", variant: 1 });
    p.update(0.05);
    p.update(0.05);
    expect(p.live).toBe(1);
    expect(attribute(p, "iVar")[0]).toBe(8);
    close(attribute(p, "iCtl"), [0.25, -0.08, 0.08, 0]);
    expect((p.mesh.geometry.getAttribute("iCtl") as THREE.InstancedBufferAttribute).version).toBeGreaterThan(0);
    expect((p.mesh.geometry.getAttribute("iVar") as THREE.InstancedBufferAttribute).version).toBeGreaterThan(0);
  });

  it("uses the frame segment in spawn, clipS, life and the linger map", () => {
    const m = parse({ frameRange: [2, 5], start: 0, fps: 24 });
    const p = pool(m);
    expect(p.clipS()).toBe(4 / 24);
    expect(playLife(m, {})).toBe(4 / 24);
    expect(playLife(m, { slowFrom: 4, slowRate: 0.5 })).toBe(2 / 24 + 2 / 12);
    expect(playLife(m, { until: 3 })).toBe(2 / 24);
    p.spawn(ORIGIN, 1);
    p.update(0);
    expect(attribute(p, "iData")[2]).toBe(2);
    expect(pool(parse({ frameRange: [2, 5], start: 10 })).clipS()).toBe(1 / 24);
    expect(pool(parse({ frameRange: [2, 5], loop: true, start: 3 })).clipS()).toBe(4 / 24);
    expect(pool(parse({ start: 3 })).clipS()).toBe(13 / 24);
  });
});

describe("10. variants", () => {
  it("uses frames per variant, round-robin, clamping and clear", () => {
    const p = pool(parse({ frames: 8, variants: 2, loopMode: "none" }), "rgba", 4);
    expect(p.mesh.material.uniforms.uRange!.value.toArray()).toEqual([0, 8]);
    for (const variant of [1, undefined, undefined, 5]) p.spawn(ORIGIN, 1, { variant });
    p.update(0);
    close(attribute(p, "iVar"), [8, 0, 8, 8]);
    for (let k = 0; k < 4; k += 1) expect(attribute(p, "iData")[k * 4 + 2]).toBe(0);
    p.clear();
    p.spawn(ORIGIN, 1);
    p.update(0);
    expect(attribute(p, "iVar")[0]).toBe(0);
  });

  it("uses the real glint rows as 8 variants of 16 frames", () => {
    const p = pool(glint({ loopMode: "none" }), "fire", 4);
    expect(p.mesh.material.uniforms.uRange!.value.toArray()).toEqual([0, 16]);
    for (const variant of [3, undefined, undefined, 9]) p.spawn(ORIGIN, 1, { variant });
    p.update(0);
    close(attribute(p, "iVar"), [48, 0, 16, 112]);
    for (let k = 0; k < 4; k += 1) expect(attribute(p, "iData")[k * 4 + 2]).toBe(0);
  });

  it("floors finite choices, cycles for nonfinite choices, and never advances on a dropped spawn", () => {
    const p = pool(parse({ frames: 4, variants: 4, loopMode: "none" }), "rgba", 4);
    for (const variant of [-2, 2.9, Infinity, NaN]) p.spawn(ORIGIN, 1, { variant });
    p.spawn(ORIGIN, 1);
    expect(p.dropped).toBe(1);
    p.update(1);
    close(attribute(p, "iVar"), [0, 8, 0, 4]);
    p.spawn(ORIGIN, 1);
    p.update(0);
    expect(attribute(p, "iVar")[0]).toBe(8);
  });
});

describe("11. attach and uniform state", () => {
  it("changes programs only when the v2 key changes and restores the legacy path", () => {
    const p = pool();
    const m = parse({ loopMode: "holderode" });
    const tex = new THREE.Texture();
    p.attach(m, tex);
    expect(p.mesh.material.defines).toEqual({ FB_LOOP: 2 });
    expect(p.mesh.material.version).toBe(1);
    expect(p.mesh.geometry.getAttribute("iCtl").itemSize).toBe(4);
    expect(p.mesh.geometry.getAttribute("iVar").itemSize).toBe(1);
    expect(Object.keys(p.mesh.geometry.attributes)).toHaveLength(10);
    p.attach(m, tex);
    p.attach(parse({ loopMode: "holderode", frameRange: [2, 5] }), new THREE.Texture());
    expect(p.mesh.material.version).toBe(1);
    expect(p.mesh.material.uniforms.uRange!.value.toArray()).toEqual([2, 4]);
    p.attach(parse(), tex);
    oldShader(p);
    expect(p.mesh.material.version).toBe(2);
    expect(p.mesh.material.uniforms.uCtlA!.value).toBe(p.mesh.material.uniforms.uCtlB!.value);
    p.attach(parse(), tex);
    expect(p.mesh.material.version).toBe(2);
  });

  it("selects masks only for rgba and computes each mask's own half-texel inset", () => {
    const a = texMask(256, 128), b = texMask(128, 64);
    const m = parse({ controlA: "a.png", controlB: "b.png" });
    const p = pool(m, "rgba", 1, { a, b });
    expect(p.mesh.material.defines).toEqual({ FB_LOOP: 0, FB_CTRL_A: 1, FB_CTRL_B: 1 });
    expect(p.mesh.material.uniforms.uCtlA!.value).toBe(a);
    expect(p.mesh.material.uniforms.uCtlB!.value).toBe(b);
    close(p.mesh.material.uniforms.uInsetA!.value.toArray(), [0.0078125, 0.015625]);
    close(p.mesh.material.uniforms.uInsetB!.value.toArray(), [0.015625, 0.03125]);
    p.attach(m, new THREE.Texture(), { a });
    expect(p.mesh.material.defines).toEqual({ FB_LOOP: 0, FB_CTRL_A: 1 });
    close(p.mesh.material.uniforms.uInsetB!.value.toArray(), [0.004, 0.004]);
    for (const mode of ["fire", "smoke", "heat"] as const) {
      expect(pool(m, mode, 1, { a, b }).mesh.material.defines).toEqual({ FB_LOOP: 0 });
    }
  });

  it("uses fallback/clamped insets and preserves setter values across attach", () => {
    const p = pool();
    p.setInk(0.1, 0.2, 0.3, 0.4);
    p.setHot(0.5, 0.6, 0.7, 3);
    p.setRamp([1, 2, 3], [4, 5, 6], [7, 8, 9]);
    p.bodyCap = 0.7;
    p.hotLead = 0.2;
    p.attach(parse({ controlA: "a.png", controlB: "b.png" }), new THREE.Texture(), { a: texMask(0, 0), b: texMask(8192, 8192) });
    const u = p.mesh.material.uniforms;
    close(u.uInk!.value.toArray(), [0.1, 0.2, 0.3, 0.4]);
    close(u.uHot!.value.toArray(), [0.5, 0.6, 0.7, 3]);
    close(u.uRamp0!.value.toArray(), [1, 2, 3]);
    close(u.uRamp1!.value.toArray(), [4, 5, 6]);
    close(u.uRamp2!.value.toArray(), [7, 8, 9]);
    expect(u.uBodyCap!.value).toBe(0.7);
    expect(u.uHotLead!.value).toBe(0.2);
    close(u.uInsetA!.value.toArray(), [0.004, 0.004]);
    close(u.uInsetB!.value.toArray(), [0.004, 0.004]);
  });
});

describe("12. library and player", () => {
  it("forwards controls to waiting and newly created pools; only the library disposes textures", () => {
    const player = new FlipbookPlayer("/v/");
    const m = parse({ controlA: "a.png", controlB: "b.png" });
    const tex = new THREE.Texture(), a = texMask(), b = texMask();
    const spies = [tex, a, b].map((t) => vi.spyOn(t, "dispose"));
    const p = player.pool("fx", "c", { mode: "rgba" });
    const lib = player.library("fx");
    lib.add(m, tex, { a, b });
    expect(p.mesh.material.defines).toEqual({ FB_LOOP: 0, FB_CTRL_A: 1, FB_CTRL_B: 1 });
    lib.add({ ...m, id: "d" }, new THREE.Texture(), { a: new THREE.Texture() });
    expect(player.pool("fx", "d").mesh.material.defines).toEqual({ FB_LOOP: 0, FB_CTRL_A: 1 });
    player.dispose();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    lib.reset();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("initializes every masked-look uniform from the exported default", () => {
    const u = pool().mesh.material.uniforms;
    const look = FLIPBOOK_MASKED_LOOK;
    for (const [key, value] of [
      ["uInk", look.ink], ["uHot", look.hot], ["uRamp0", look.ramp[0]], ["uRamp1", look.ramp[1]],
      ["uRamp2", look.ramp[2]], ["uSoot", look.soot], ["uSharpen", look.sharpen], ["uGrade", look.grade],
    ] as const) expect(u[key]!.value.toArray()).toEqual(value);
    expect(u.uBodyCap!.value).toBe(look.bodyCap);
    expect(u.uHotLead!.value).toBe(look.hotLead);
    expect(FLIPBOOK_ERODE_WIDTH).toBe(0.08);
  });

  function mockLoad() {
    const tex = new THREE.Texture(), a = texMask(), b = texMask();
    vi.stubGlobal("location", { protocol: "https:" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => "application/json" },
      json: async () => ({ version: 1, flipbooks: { c: { file: "c.png", cols: 4, rows: 4, mode: "rgba", controlA: "a.png", controlB: "b.png" } } }),
    }));
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValueOnce(tex).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    return { tex, a, b, load };
  }

  it("loads atlas, A, then B with matching orientation/filtering and linear mask data", async () => {
    const { tex, a, b, load } = mockLoad();
    const lib = new FlipbookLibrary("/v/");
    const watched = vi.fn();
    lib.watch(watched);
    await lib.load(8);
    expect(load.mock.calls).toEqual([["/v/c.png"], ["/v/a.png"], ["/v/b.png"]]);
    expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(lib.get("c")?.controls).toEqual({ a, b });
    for (const t of [tex, a, b]) {
      expect(t.premultiplyAlpha).toBe(false);
      expect(t.flipY).toBe(true);
      expect(t.generateMipmaps).toBe(true);
      expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(t.magFilter).toBe(THREE.LinearFilter);
      expect(t.anisotropy).toBe(8);
      expect(t.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(t.wrapT).toBe(THREE.ClampToEdgeWrapping);
    }
    expect(a.colorSpace).toBe(THREE.NoColorSpace);
    expect(b.colorSpace).toBe(THREE.NoColorSpace);
    expect(watched).toHaveBeenCalledTimes(1);
    lib.reset();
  });

  it.each([0, 1, 2])("discards the entire clip and disposes earlier textures when load %s fails", async (failure) => {
    const { tex, a, b, load } = mockLoad();
    load.mockReset();
    const textures = [tex, a, b];
    const spies = textures.map((t) => vi.spyOn(t, "dispose"));
    for (let k = 0; k < failure; k += 1) load.mockResolvedValueOnce(textures[k]!);
    load.mockRejectedValueOnce(new Error("broken image"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lib = new FlipbookLibrary("/v/");
    const watched = vi.fn();
    lib.watch(watched);
    await lib.load();
    expect(load).toHaveBeenCalledTimes(failure + 1);
    expect(lib.get("c")).toBeNull();
    expect(watched).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    spies.forEach((spy, k) => expect(spy).toHaveBeenCalledTimes(k < failure ? 1 : 0));
    lib.reset();
    spies.forEach((spy, k) => expect(spy).toHaveBeenCalledTimes(k < failure ? 1 : 0));
  });
});
