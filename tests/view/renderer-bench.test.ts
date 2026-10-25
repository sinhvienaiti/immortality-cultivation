import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TT_BUDGETS } from "../../src/content/rules";
import { BENCH_TIMING, BENCH_VANKIEM, BUILT_CASES, L4_KEEP, LADDER_STEPS, benchUrl, crowdModeOf, hasSwords, parseBenchCase, type BenchCase } from "../../src/view/bench/cases";
import { FrameMeter, budgetOf, bytesPerTexel, mean, percentile, sceneTextureBytes, softwareRenderer } from "../../src/view/bench/meter";

interface ScenarioModule {
  BUDGETS: Record<string, { frameMeanMs: number | null; frameP95Ms: number; cpuP95Ms: number; drawCalls: number; textureMb: number; sub: Record<string, number> }>;
  BUILT: string[];
  HEAP_GROWTH_MB: number;
  heapOk(growthMb: number | null, gcBefore: boolean): boolean | null;
  ALLOC_NOISE_B: number;
  allocOk(bytesPerFrame: number | null): boolean | null;
  totalsFailed(m: { frameMeanMs: number; frameP95Ms: number; cpuP95Ms: number; drawCallsMax: number; textureMb: number } | undefined, quality: string): string[];
  caseUrl(base: string, id: string, quality: string, count: number, env: Record<string, unknown>): string;
  allocBucket(url: string): string;
  allocSummary(profile: unknown): { bytes: Record<string, number>; top: { site: string; bytes: number }[] };
  isSoftware(renderer: string): boolean;
  median(values: (number | null)[]): number | null;
  partsOf(medians: Record<string, { frameP95Ms: number; cpuP95Ms: number; drawCalls: number }>, quality: string, counts: number[]): { part: string; n: number; p95Ms: number | null; overMs: number | null }[];
}

/** The self-contained scenario (scripts/visual/scenarios/ic-bench.mjs), loaded by URL so tsc does not type it. */
async function scenario(): Promise<ScenarioModule> {
  const file = resolve(__dirname, "..", "..", "scripts", "visual", "scenarios", "ic-bench.mjs");
  return (await import(/* @vite-ignore */ pathToFileURL(join(file)).href)) as ScenarioModule;
}

const NVIDIA = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Ti Laptop GPU (0x000025A0) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const SWIFTSHADER = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

describe("bench meter (canon §20.1, §20.3)", () => {
  it("mean and nearest-rank p95 as Rồng's bench", () => {
    const values = Array.from({ length: 100 }, (_, k) => k + 1);
    expect(mean(values)).toBe(50.5);
    expect(percentile(values, 0.95)).toBe(96);
    expect(percentile([3, 1, 2], 0.95)).toBe(3);
    expect(percentile([], 0.95)).toBe(0);
    // Only the first `count` samples of a preallocated array count.
    const buffer = new Float64Array([4, 2, 9, 0, 0]);
    expect(mean(buffer, 3)).toBe(5);
    expect(percentile(buffer, 0.5, 3)).toBe(4);
  });

  it("FrameMeter keeps samples in its arrays and summarises them", () => {
    const meter = new FrameMeter(4);
    for (const ms of [5, 6, 7, 20, 99]) meter.record(ms, ms / 2, ms, 1);
    expect(meter.frames).toBe(4);
    const s = meter.summary();
    expect(s.frameMeanMs).toBe(9.5);
    expect(s.frameP95Ms).toBe(20);
    expect(s.frameMaxMs).toBe(20);
    expect(s.cpuP95Ms).toBe(10);
    expect(meter.drawCallsMax).toBe(20);
  });

  it("marks software rasterisers invalid and keeps a real GPU", () => {
    expect(softwareRenderer(NVIDIA)).toBeNull();
    expect(softwareRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)")).toBeNull();
    expect(softwareRenderer(SWIFTSHADER)).not.toBeNull();
    expect(softwareRenderer("llvmpipe (LLVM 17.0.6, 256 bits)")).not.toBeNull();
  });

  it("reads the tier budget in ms from TT_BUDGETS", () => {
    expect(budgetOf("high")).toEqual({ frameMeanMs: 8, frameP95Ms: 12, cpuP95Ms: 6, drawCalls: 150, textureMb: 192 });
    expect(budgetOf("low").frameMeanMs).toBeNull();
  });

  it("estimates texture bytes by format and counts a shared texture once", () => {
    expect(bytesPerTexel(THREE.RGBAFormat, THREE.HalfFloatType)).toBe(8);
    expect(bytesPerTexel(THREE.RedFormat, THREE.UnsignedByteType)).toBe(1);
    expect(bytesPerTexel(THREE.RGBAFormat, THREE.FloatType)).toBe(16);
    const texture = new THREE.DataTexture(new Uint16Array(1024 * 64 * 4), 1024, 64, THREE.RGBAFormat, THREE.HalfFloatType);
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
    const shader = new THREE.ShaderMaterial({ uniforms: { uVat: { value: texture } } });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), shader));
    expect(sceneTextureBytes(scene)).toBe(1024 * 64 * 8);
  });
});

describe("bench cases (canon §20.3)", () => {
  it("reads a case from the URL with the canon's timing and the tier's numbers", () => {
    const c = parseBenchCase("?case=crowd-proc&q=medium&count=120&motion=full") as BenchCase;
    expect(c.id).toBe("crowd-proc");
    expect(c.quality).toBe("medium");
    expect(c.count).toBe(120);
    expect(c.seconds).toBe(BENCH_TIMING.seconds);
    expect(c.warmup).toBe(BENCH_TIMING.warmup);
    expect(c.motion).toBe("full");
    expect(c.lodTris).toBe(TT_BUDGETS.medium.lodTris);
    expect(c.swords).toBe(TT_BUDGETS.medium.swords);
    expect(c.skinned).toBe(TT_BUDGETS.medium.skinnedMax);
    expect((parseBenchCase("?case=base&count=300") as BenchCase).count).toBe(0);
    expect((parseBenchCase("?case=crowd-proc") as BenchCase).count).toBe(300);
    expect((parseBenchCase("?case=base&q=nope") as BenchCase).quality).toBe("high");
    expect(parseBenchCase("")).toBeNull();
    expect(parseBenchCase("?case=warp")).toEqual({ error: expect.stringContaining("unknown case") });
    expect(BENCH_TIMING.runs).toBe(3);
  });

  it("builds page URLs the parser reads back", () => {
    const url = benchUrl("http://127.0.0.1:3008/", { id: "crowd-proc", quality: "low", count: 60 });
    expect(url.startsWith("http://127.0.0.1:3008/bench.html?")).toBe(true);
    const c = parseBenchCase(new URL(url).search) as BenchCase;
    expect([c.id, c.quality, c.count, c.motion]).toEqual(["crowd-proc", "low", 60, "full"]);
    const e = parseBenchCase(new URL(benchUrl("http://h", { id: "skinned", quality: "high", count: 60, skinned: 10, steps: ["L3", "L1"] })).search) as BenchCase;
    expect([e.skinned, e.steps]).toEqual([10, ["L1", "L3"]]);
  });

  it("reads ladder steps (L2 lowers the swords one notch) and a baked VAT for the confirmation pass", () => {
    const c = parseBenchCase("?case=vankiem&q=high&count=60&steps=l2,L3&vat=/assets/bench-vat/x-{q}.vat.json") as BenchCase;
    expect(c.steps).toEqual(["L2", "L3"]);
    expect(c.swords).toBe(300);
    expect(c.vat).toBe("/assets/bench-vat/x-{q}.vat.json");
    expect((parseBenchCase("?case=vankiem&q=low") as BenchCase).swords).toBe(150);
    expect((parseBenchCase("?case=vankiem") as BenchCase).vat).toBeNull();
    expect(parseBenchCase("?case=vankiem&steps=L9")).toEqual({ error: expect.stringContaining("unknown step") });
  });

  it("maps cases to their crowd draw and their swords (canon §20.3)", () => {
    expect(BUILT_CASES).toEqual(["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"]);
    expect(["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"].map((id) => crowdModeOf(id as BenchCase["id"]))).toEqual([null, "procedural", "vat", "vat", "impostor", "vat"]);
    expect(["crowd-vat", "vankiem", "impostor", "skinned"].map((id) => hasSwords(id as BenchCase["id"]))).toEqual([false, true, true, true]);
    expect(BENCH_VANKIEM).toEqual({ everyS: 4, hitsPerSecond: 60 });
    expect(LADDER_STEPS).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    // L4: beyond the nearest 100 (Low) / 160 (Medium) to the screen centre.
    expect([L4_KEEP.low, L4_KEEP.medium]).toEqual([100, 160]);
  });
});

describe("ic-bench.mjs (self-contained scenario)", () => {
  it("carries canon §20.2 equal to rules.ts TT_BUDGETS", async () => {
    const { BUDGETS } = await scenario();
    for (const q of ["low", "medium", "high", "ultra"] as const) {
      const row = TT_BUDGETS[q];
      expect(BUDGETS[q]).toEqual({
        frameMeanMs: row.frameMeanUs === null ? null : row.frameMeanUs / 1000,
        frameP95Ms: row.frameP95Us / 1000,
        cpuP95Ms: row.cpuP95Us / 1000,
        drawCalls: row.drawCalls,
        textureMb: row.textureMb,
        sub: { base: row.subUs.base / 1000, crowd: row.subUs.crowd / 1000, swordsFx: row.subUs.swordsFx / 1000, skinned: row.subUs.skinned / 1000 },
      });
    }
  });

  it("draws every case of canon §20.3 and knows which renderers do not count", async () => {
    const mod = await scenario();
    expect(mod.BUILT).toEqual([...BUILT_CASES]);
    expect(mod.BUILT).toEqual(["base", "crowd-proc", "crowd-vat", "vankiem", "impostor", "skinned"]);
    expect(mod.isSoftware(SWIFTSHADER)).toBe(true);
    expect(mod.isSoftware(NVIDIA)).toBe(false);
  });

  it("keeps heap growth as a leak signal only (after a GC before the window)", async () => {
    const { HEAP_GROWTH_MB, heapOk } = await scenario();
    expect(HEAP_GROWTH_MB).toBe(2);
    expect(heapOk(0.4, true)).toBe(true);
    expect(heapOk(2.5, true)).toBe(false);
    // Without --expose-gc a young-generation GC may hide allocation: no signal.
    expect(heapOk(0.4, false)).toBeNull();
    expect(heapOk(null, true)).toBeNull();
  });

  it("judges allocation by game + kit bytes per frame (M0A_PLAN §6.1 note: the ALLOC profile, noise ≤ 64 B)", async () => {
    const { ALLOC_NOISE_B, allocOk } = await scenario();
    expect(ALLOC_NOISE_B).toBe(64);
    expect(allocOk(0)).toBe(true);
    expect(allocOk(64)).toBe(true);
    expect(allocOk(65)).toBe(false);
    expect(allocOk(null)).toBeNull();
  });

  it("names the totals of canon §20.2 a median row fails", async () => {
    const { totalsFailed } = await scenario();
    const ok = { frameMeanMs: 4, frameP95Ms: 6, cpuP95Ms: 2, drawCallsMax: 60, textureMb: 40 };
    expect(totalsFailed(ok, "high")).toEqual([]);
    expect(totalsFailed(ok, "low")).toEqual([]);
    expect(totalsFailed({ ...ok, frameMeanMs: 9 }, "high")).toEqual(["frameMean 9 > 8"]);
    // Low has no mean budget (p95 ≤ 8 only).
    expect(totalsFailed({ ...ok, frameMeanMs: 9 }, "low")).toEqual([]);
    expect(totalsFailed({ ...ok, frameP95Ms: 8.5, drawCallsMax: 81, textureMb: 65 }, "low")).toEqual(["frameP95 8.5 > 8", "drawCalls 81 > 80", "textureMb 65 > 64"]);
    expect(totalsFailed(undefined, "low")).toEqual(["no run"]);
  });

  it("builds the page URL with the confirmation VAT and ladder steps the page reads back", async () => {
    const { caseUrl } = await scenario();
    const env = { seconds: 10, warmup: 2, swords: "", skinned: "10", vat: "/assets/bench-vat/draconis-v3-{q}.vat.json", steps: "L1,L3" };
    const url = caseUrl("http://127.0.0.1:3041", "vankiem", "medium", 120, env);
    const c = parseBenchCase(new URL(url).search) as BenchCase;
    expect([c.id, c.quality, c.count, c.skinned, c.vat, c.steps.join("+"), c.motion]).toEqual(["vankiem", "medium", 120, 10, "/assets/bench-vat/draconis-v3-{q}.vat.json", "L1+L3", "full"]);
    // The baked VAT is for VAT crowds only.
    expect(new URL(caseUrl("http://h", "base", "low", 0, env)).searchParams.get("vat")).toBeNull();
    expect(new URL(caseUrl("http://h", "crowd-proc", "low", 60, env)).searchParams.get("vat")).toBeNull();
  });

  it("splits a sampling heap profile into game, bench driver, kit and three.js bytes", async () => {
    const { allocBucket, allocSummary } = await scenario();
    expect(allocBucket("http://127.0.0.1:3008/src/view/crowd.ts?t=1")).toBe("game");
    expect(allocBucket("http://127.0.0.1:3008/src/view/bench/herd.ts")).toBe("bench");
    expect(allocBucket("http://127.0.0.1:3008/src/kit/three/stage.ts")).toBe("kit");
    expect(allocBucket("http://127.0.0.1:3008/node_modules/.vite/deps/chunk-LGVZFLW7.js?v=1")).toBe("three");
    // Vite's dep cache outside the root is served through /@fs/.
    expect(allocBucket("http://127.0.0.1:3008/@fs/tmp/ic1a/vite-cache/deps/chunk-LGVZFLW7.js?v=1")).toBe("three");
    expect(allocBucket("")).toBe("other");
    const node = (url: string, functionName: string, selfSize: number, children: unknown[] = []) => ({ callFrame: { url, functionName }, selfSize, children });
    const profile = {
      head: node("", "(root)", 0, [
        node("http://h/src/view/bench/main.ts", "frame", 100, [
          node("http://h/src/view/crowd.ts", "update", 40),
          // A WebGL call under three.js counts for three.js.
          node("http://h/node_modules/.vite/deps/three.js", "render", 900, [node("", "uniform3f", 50)]),
        ]),
        node("http://h/src/kit/feedback/reaction.ts", "sample", 16),
        node("", "(GC)", 8),
      ]),
    };
    const { bytes, top } = allocSummary(profile);
    expect(bytes).toEqual({ game: 40, bench: 100, kit: 16, three: 950, other: 8 });
    expect(top[0]).toEqual({ site: "frame src/view/bench/main.ts", bytes: 100 });
    expect(top.map((t) => t.site)).toContain("sample src/kit/feedback/reaction.ts");
  });

  it("takes medians and splits the cost per part (D36), with the over-budget column", async () => {
    const { median, partsOf } = await scenario();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([null, 5])).toBe(5);
    const medians = {
      "base@0": { frameP95Ms: 2.5, cpuP95Ms: 1, drawCalls: 20 },
      "crowd-proc@60": { frameP95Ms: 4, cpuP95Ms: 1.5, drawCalls: 31 },
      "crowd-proc@300": { frameP95Ms: 9, cpuP95Ms: 2, drawCalls: 31 },
    };
    const parts = partsOf(medians, "high", [60, 300]);
    expect(parts.find((p) => p.part === "base")).toMatchObject({ p95Ms: 2.5, overMs: 0.5 });
    expect(parts.find((p) => p.part === "crowd" && p.n === 60)).toMatchObject({ p95Ms: 1.5, overMs: 0 });
    expect(parts.find((p) => p.part === "crowd" && p.n === 300)).toMatchObject({ p95Ms: 6.5, overMs: 1.5 });
    // Without the base run there is no crowd part to tell.
    expect(partsOf({ "crowd-proc@60": medians["crowd-proc@60"] }, "high", [60]).filter((p) => p.part === "crowd")).toEqual([]);
    // With B, C, E: crowd = B − 0, swords and VFX = C − B, skinned = E − C (D36).
    const full = {
      "base@0": { frameP95Ms: 1.2, cpuP95Ms: 1, drawCalls: 20 },
      "crowd-proc@60": { frameP95Ms: 9, cpuP95Ms: 2, drawCalls: 31 },
      "crowd-vat@60": { frameP95Ms: 2.2, cpuP95Ms: 1.2, drawCalls: 31 },
      "vankiem@60": { frameP95Ms: 5, cpuP95Ms: 1.6, drawCalls: 37 },
      "skinned@60": { frameP95Ms: 7, cpuP95Ms: 2.4, drawCalls: 49 },
    };
    const rows = partsOf(full, "low", [60]);
    expect(rows.map((p) => [p.part, p.p95Ms])).toEqual([
      ["base", 1.2],
      ["crowd", 1],
      ["swords-fx", 2.8],
      ["skinned", 2],
    ]);
    // Low's sub-budgets: 1.5 + 3 + 2 + 1.5; the over-budget column.
    expect(rows.map((p) => p.overMs)).toEqual([0, 0, 0.8, 0.5]);
  });
});
