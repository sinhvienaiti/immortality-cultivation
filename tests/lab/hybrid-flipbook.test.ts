import { existsSync, readFileSync } from "node:fs";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLIPBOOK_MOTION, FlipbookLibrary, FlipbookPool, ktx2Pick, motionDecode, motionSampleUv, parseFlipbookManifest, setFlipbookKtx2, setFlipbookSplitX, type FlipbookMeta } from "../../src/view/skills/flipbook";
import { CometHead, cometFrame, cometPhase, seekVideoFrame, videoFrameReady } from "../../src/lab/comet-head";
import { HybridAB, abCardScale, textureFormatName, textureGpuBytes } from "../../src/lab/hybrid-ab";

const md5 = "0123456789abcdef0123456789abcdef";
const ktx2 = { yFlip: true, uastc: { file: "c.uastc.ktx2", bytes: 100, md5 }, etc1s: { file: "c.etc1s.ktx2", bytes: 20, md5 } };
const motion = { file: "c.mv.png", bytes: 32, md5, layout: "x-rgb-y-a", zero: 128, scale: 127, strength: 0.2, ktx2: { ...ktx2, uastc: { file: "c.mv.uastc.ktx2", bytes: 80, md5 } } };
const video = { file: "c.mp4", w: 1920, h: 1080, frames: 120, fps: 24, start: 0, peakTime: 1, bytes: 2000 };
const entry = { file: "c.png", cols: 4, rows: 8, frames: 32, fps: 24, cell: [768, 432], bytes: 1000, ktx2, motion };
const manifest = (extra = {}) => ({ version: 1, flipbooks: { c: { ...entry, ...extra } } });
const parse = (extra = {}): FlipbookMeta => parseFlipbookManifest(manifest(extra), "/hybrid/").get("c")!;
const pools: FlipbookPool[] = [];
function pool(): FlipbookPool { const p = new FlipbookPool("c", "fire", 1, 12, new THREE.Texture()); pools.push(p); return p; }
afterEach(() => { setFlipbookKtx2(null); FLIPBOOK_MOTION.blend = true; vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const p of pools.splice(0)) p.dispose(); });

describe("hybrid manifest", () => {
  it("reads all optional fields and versioned URLs", () => {
    const m = parse({ video, videoVariants: { crf23: video, bad: { file: "../bad.mp4" } }, compareWith: { folder: "expansion", id: "c" }, sourceRect: { crop: [-67, -37, 2050, 1154], frame: [1920, 1080] } });
    expect(m.ktx2?.uastc).toEqual({ url: "/hybrid/c.uastc.ktx2?v=" + md5, bytes: 100 });
    expect(m.ktx2?.etc1s?.url).toContain("c.etc1s.ktx2?v=");
    expect(m.motion).toMatchObject({ url: "/hybrid/c.mv.png?v=" + md5, bytes: 32, strength: 0.2 });
    expect(m.motion?.ktx2?.uastc?.url).toContain("c.mv.uastc.ktx2?v=");
    expect(m.video?.bytes).toBe(2000); expect(Object.keys(m.videoVariants!)).toEqual(["crf23"]);
    expect(m.compareWith).toEqual({ folder: "expansion", id: "c" }); expect(m.sourceRect?.crop).toEqual([-67, -37, 2050, 1154]); expect(m.bytes).toBe(1000);
  });
  it.each([
    { ktx2: { ...ktx2, yFlip: false }, motion: undefined },
    { ktx2: { yFlip: true, uastc: { file: "nested/c.ktx2" } }, motion: undefined },
    ...[{ layout: "other" }, { strength: 0 }, { strength: 1.01 }, { file: "nested/c.png" }, { zero: 0 }, { scale: 1 }].map((m) => ({ ktx2: undefined, motion: { ...motion, ...m } })),
    { ktx2: undefined, motion, frames: 1 },
  ])("ignores malformed new fields without throwing: %j", (extra) => {
    const m = parse(extra); expect(m.ktx2).toBeUndefined(); expect(m.motion).toBeUndefined(); expect(m.bytes).toBeUndefined();
  });
  it("ignores invalid comparison, crop, video variants and byte counts", () => {
    const m = parse({ bytes: -1, compareWith: { folder: "../fire", id: "c" }, sourceRect: { crop: [0, 0, -1, 2], frame: [1, 2] }, videoVariants: { bad: {} } });
    expect(m.bytes).toBeUndefined(); expect(m.compareWith).toBeUndefined(); expect(m.sourceRect).toBeUndefined(); expect(m.videoVariants).toBeUndefined();
  });
  it("preserves the twelve-key legacy entry", () => {
    const m = parse({ ktx2: undefined, motion: undefined });
    expect(Object.keys(m)).toEqual(["id", "url", "cols", "rows", "frames", "fps", "loop", "mode", "aspect", "pivot", "start", "heading"]);
  });
});

describe("motion and phases", () => {
  it("decodes zero and the signed extrema", () => { expect(motionDecode(128)).toBe(0); expect(motionDecode(255, 0.3)).toBe(0.3); expect(motionDecode(1, 0.3)).toBe(-0.3); });
  it("warps both frames and clamps to the cell inset", () => {
    const a = motionSampleUv(0.5, 0.5, 0.1, -0.05, 0.25); [0.475, 0.5125, 0.575, 0.4625].forEach((n, i) => expect(a[i]).toBeCloseTo(n));
    expect(motionSampleUv(0, 1, 2, -2, 0.5)).toEqual([0.004, 0.996, 0.996, 0.004]);
  });
  it("never substitutes the other KTX2 variant", () => { expect(ktx2Pick({ etc1s: { url: "e", bytes: 1 } }, "uastc")).toBeNull(); expect(ktx2Pick(undefined, "etc1s")).toBeNull(); });
  it("spreads eight first phases and separates consecutive meteors by four circular frames", () => {
    const phases = Array.from({ length: 25 }, (_, n) => cometPhase(n));
    for (const p of phases) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(1); }
    expect(new Set(phases.slice(0, 8).map((p) => Math.floor(p * 32))).size).toBe(8);
    for (let n = 0; n < 24; n++) { const d = Math.abs(Math.floor(phases[n]! * 32) - Math.floor(phases[n + 1]! * 32)); expect(Math.min(d, 32 - d)).toBeGreaterThanOrEqual(4); }
    expect(cometFrame(0, 0.5, 24, 32)).toBe(16);
  });
});

describe("hybrid pools", () => {
  it.each([{}, { loopMode: "stepped" }])("keeps motion and clipping in both shader versions: %j", (extra) => {
    const p = pool(); const m = parse(extra); const mv = new THREE.Texture(); p.attach(m, new THREE.Texture(), { mv });
    const u = p.mesh.material.uniforms;
    expect(p.mesh.material.fragmentShader).toContain("vec4 m = texture2D(uMv");
    expect(p.mesh.material.fragmentShader).toContain("if (uClipSide != 0.0 && (gl_FragCoord.x - uSplitX) * uClipSide < 0.0) discard;");
    expect(u.uMvOn!.value).toBe(1); expect(u.uMv!.value).toBe(mv);
    FLIPBOOK_MOTION.blend = false; p.update(0); expect(u.uMvOn!.value).toBe(0); FLIPBOOK_MOTION.blend = true;
    p.motionBlend = false; expect(u.uMvOn!.value).toBe(0); p.motionBlend = true; expect(u.uMvOn!.value).toBe(1);
    p.clipSide = -1; expect(u.uClipSide!.value).toBe(-1); p.clipSide = 1; expect(u.uClipSide!.value).toBe(1);
    setFlipbookSplitX(960); expect(u.uSplitX!.value).toBe(960); expect(pool().mesh.material.uniforms.uSplitX).toBe(u.uSplitX);
    p.attach(m, new THREE.Texture()); expect(u.uMvOn!.value).toBe(0);
  });
  it("upgrades an already prepared comet while video mode keeps the system atlas", () => {
    const own = new FlipbookLibrary("/fire/"); const hybrid = new FlipbookLibrary("/hybrid/");
    const m = { ...parse(), role: "comet", comet: { head: [0.7, 0.7] as const, tail: [-1, 0] as const } };
    own.add(m, new THREE.Texture()); const c = new CometHead(new THREE.Group(), new THREE.Texture());
    expect(c.mode).toBe("video"); expect(c.use("fire", own, hybrid)).toBe(true); expect(c.upgraded).toBe(false);
    hybrid.add(m, new THREE.Texture(), { mv: new THREE.Texture() }); c.use("fire", own, hybrid); expect(c.upgraded).toBe(false);
    c.mode = "flipbook"; c.use("fire", own, hybrid); expect(c.upgraded).toBe(true); expect(c.videoEl).toBeNull();
  });
});

function mockLibrary(defer = false) {
  vi.stubGlobal("location", { protocol: "http:" }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => manifest() }));
  const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
  const loadAsync = vi.fn().mockImplementation(async () => new THREE.Texture()); setFlipbookKtx2({ loader: { loadAsync }, variant: "uastc" });
  return { lib: new FlipbookLibrary("/hybrid/", defer ? () => true : null), png, loadAsync };
}
describe("KTX2 library loading", () => {
  it("loads exactly the selected color and motion URLs without TextureLoader", async () => {
    const { lib, png, loadAsync } = mockLibrary(); await lib.load();
    expect(loadAsync.mock.calls.map((c) => c[0])).toEqual(["/hybrid/c.uastc.ktx2?v=" + md5, "/hybrid/c.mv.uastc.ktx2?v=" + md5]);
    expect(png).not.toHaveBeenCalled(); expect(lib.source("c")).toBe("ktx2"); expect(lib.get("c")?.controls?.mv?.colorSpace).toBe(THREE.NoColorSpace);
  });
  it("uses the same loader for a deferred fetch, including motion, and disposes it on release", async () => {
    const { lib, png, loadAsync } = mockLibrary(true); await lib.load(); expect(loadAsync).not.toHaveBeenCalled();
    expect(await lib.fetchAtlas("c")).toBe(true); expect(png).not.toHaveBeenCalled(); expect(loadAsync).toHaveBeenCalledWith("/hybrid/c.uastc.ktx2?v=" + md5);
    expect(lib.get("c")?.controls?.mv).toBeInstanceOf(THREE.Texture); const dispose = vi.spyOn(lib.get("c")!.controls!.mv!, "dispose"); lib.release("c"); expect(dispose).toHaveBeenCalledOnce();
  });
  it("warns and falls back to PNG color on rejection, dropping motion without ImageBitmap", async () => {
    const { lib, png, loadAsync } = mockLibrary(); loadAsync.mockRejectedValue(new Error("transcode failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined); await lib.load();
    expect(png).toHaveBeenCalledExactlyOnceWith("/hybrid/c.png"); expect(lib.source("c")).toBe("png"); expect(lib.get("c")?.controls).toBeNull(); expect(warn).toHaveBeenCalled();
  });
});

describe("A/B measurements", () => {
  it("counts actual compressed mip bytes and uncompressed mipmaps", () => {
    const t = new THREE.CompressedTexture([{ data: new Uint8Array(1000), width: 4, height: 4 }, { data: new Uint8Array(250), width: 2, height: 2 }], 4, 4, THREE.RGBA_ASTC_4x4_Format);
    expect(textureGpuBytes(t)).toBe(1250); expect(textureFormatName(t)).toBe("RGBA_ASTC_4x4_Format");
    const image = new THREE.Texture({ width: 4, height: 2 } as HTMLImageElement); image.generateMipmaps = true; expect(textureGpuBytes(image)).toBe(4 * 2 * 4 * 4 / 3);
    expect(abCardScale({ crop: [-67, -37, 2050, 1154], frame: [1920, 1080] })).toBeCloseTo(1.0685, 4); expect(abCardScale(undefined)).toBe(1);
  });
});
const real = "art-src/lab/vfx/hybrid/manifest.json";
it.skipIf(!existsSync(real))("validates ticket 325's real manifest", () => {
  const m = parseFlipbookManifest(JSON.parse(readFileSync(real, "utf8")), "/hybrid/");
  for (const id of ["azure-cloud-dragon", "fire-comet"]) { expect(m.get(id)?.ktx2?.uastc).toBeDefined(); expect(m.get(id)?.ktx2?.etc1s).toBeDefined(); expect(m.get(id)?.motion).toBeDefined(); }
  expect(m.get("azure-cloud-dragon")?.videoVariants?.crf23).toBeDefined(); expect(m.get("azure-cloud-dragon")?.videoVariants?.["720p"]).toBeDefined();
  expect(m.get("azure-cloud-dragon")?.compareWith).toEqual({ folder: "expansion", id: "azure-cloud-dragon" }); expect(m.get("fire-comet")?.comet).toBeDefined();
});

// Small DOM surface for orchestration tests; rendering acceptance still requires the real CDP scenario.
class LabelNode {
  style = { cssText: "" }; dataset: Record<string, string> = {}; textContent = ""; children: unknown[] = [];
  append(...children: unknown[]): void { this.children.push(...children); }
  replaceChildren(): void { this.children = []; }
}
class VideoNode extends EventTarget {
  muted = false; loop = false; playsInline = false; preload = ""; crossOrigin = "";
  readyState = 2; error = null; paused = true; seeking = false; currentTime = 0;
  videoWidth = 1920; videoHeight = 1080; src = "";
  canPlayType(): string { return "probably"; }
  load(): void {}
  play(): Promise<void> { this.paused = false; return Promise.resolve(); }
  pause(): void { this.paused = true; }
  removeAttribute(): void { this.src = ""; }
  getAttribute(): string | null { return this.src || null; }
}
function dom(): VideoNode[] {
  const videos: VideoNode[] = [];
  vi.stubGlobal("document", { createElement: (tag: string) => { if (tag !== "video") return new LabelNode(); const el = new VideoNode(); videos.push(el); return el; } });
  return videos;
}
function abHost(lib: FlipbookLibrary, comet = new CometHead(new THREE.Group(), new THREE.Texture())) {
  const initTexture = vi.fn();
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 1000); camera.position.set(0, 20, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  return { camera, hybrid: lib, layer: new THREE.Group(), renderer: { initTexture, getDrawingBufferSize: (v: THREE.Vector2) => v.set(1920, 1080), getContext: () => ({ getError: () => 0 }) } as unknown as THREE.WebGLRenderer,
    player: { ready: async () => { await lib.load(); }, library: () => lib } as unknown as import("../../src/view/skills/flipbook").FlipbookPlayer,
    labelHost: new LabelNode() as unknown as HTMLElement, castMeteor: vi.fn(), prepareComet: vi.fn(() => false), comet: () => comet, initTexture };
}

describe("A/B lifecycle", () => {
  it("attaches deferred clip cards on update, prewarms both textures, and clears a live card on restart", async () => {
    dom(); const { lib } = mockLibrary(true); const host = abHost(lib);
    const ab = new HybridAB(host, { scene: "c", only: "right", left: "video", prewarm: true, autostart: false, driven: true });
    // The fixture needs a compareWith even when only the right card is visible.
    vi.mocked(fetch).mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => manifest({ compareWith: { folder: "fire", id: "c" }, sourceRect: { crop: [-67, -37, 2050, 1154], frame: [1920, 1080] } }) } as Response);
    await ab.load(); await lib.fetchAtlas("c");
    expect(host.layer.children).toHaveLength(0); expect(host.initTexture).not.toHaveBeenCalled();
    ab.update(0); expect(ab.state().ready).toBe(true); expect(host.initTexture).toHaveBeenCalledTimes(2); expect(host.layer.children).toHaveLength(1);
    ab.start(); ab.update(1 / 30);
    const mesh = host.layer.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    expect(mesh.geometry.instanceCount).toBe(1); expect(mesh.material.uniforms.uClipSide!.value).toBe(0);
    ab.start(); ab.update(1 / 30); expect(mesh.geometry.instanceCount).toBe(1); expect(ab.state().clock).toBeCloseTo(1 / 30);
    for (let n = 1; n < 240; n++) ab.update(1 / 30);
    expect(ab.state().cycle).toBe(0); ab.update(1 / 30); expect(ab.state().cycle).toBe(1);
  });
  it("does not prewarm textures when disabled and reports a missing ticket 325 clip", async () => {
    dom(); const lib = new FlipbookLibrary("/hybrid/"); const host = abHost(lib);
    const ab = new HybridAB(host, { scene: "absent", only: null, left: "video", prewarm: false, autostart: false, driven: true });
    await ab.load(); expect(ab.state().error).toBe("hybrid/manifest.json chưa có absent (phiếu 325)"); expect(ab.state().ready).toBe(false); expect(host.initTexture).not.toHaveBeenCalled();
  });
  it("registers a video-frame callback immediately on seek and only settles after that callback", () => {
    let done: VideoFrameRequestCallback | undefined;
    const el = { currentTime: 0, seeking: true, readyState: 2, requestVideoFrameCallback: vi.fn((cb: VideoFrameRequestCallback) => { done = cb; return 1; }), cancelVideoFrameCallback: vi.fn() } as unknown as HTMLVideoElement;
    seekVideoFrame(el, 0.5); expect(el.requestVideoFrameCallback).toHaveBeenCalledOnce(); expect(videoFrameReady(el)).toBe(false);
    Object.assign(el, { seeking: false }); expect(videoFrameReady(el)).toBe(false); done!(0, {} as VideoFrameCallbackMetadata); expect(videoFrameReady(el)).toBe(true);
  });
  it("retains a newly loaded video before its first comet, and AB retains it after idle", () => {
    const videos = dom(); const lib = new FlipbookLibrary("/fire/");
    const m = { ...parse({ video }), role: "comet", comet: { head: [0.7, 0.7] as const, tail: [-1, 0] as const } }; lib.add(m, new THREE.Texture());
    const c = new CometHead(new THREE.Group(), new THREE.Texture()); c.use("fire", lib); c.update(2);
    expect(videos[0]!.src).toBe("/hybrid/c.mp4"); expect(videos[0]!.paused).toBe(true);
    c.draw(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)); c.update(0); c.update(2); expect(videos[0]!.src).toBe("");
    const ab = new CometHead(new THREE.Group(), new THREE.Texture()); ab.mode = "ab"; ab.use("fire", lib); ab.draw(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)); ab.update(0); ab.update(2); expect(videos[1]!.src).toBe("/hybrid/c.mp4");
  });
  it("clips both comet cards, keeps the system video while upgrading the rim, and leaves dark matter uncut", () => {
    const videos = dom(); const own = new FlipbookLibrary("/fire/"); const hybrid = new FlipbookLibrary("/hybrid/"); const layer = new THREE.Group();
    const axis = { head: [0.7, 0.7] as const, tail: [-1, 0] as const };
    own.add({ ...parse({ video }), role: "comet", comet: axis }, new THREE.Texture());
    own.add({ ...parse(), id: "body", role: "comet", layer: "body", comet: axis }, new THREE.Texture());
    hybrid.add({ ...parse(), role: "comet", comet: axis }, new THREE.Texture(), { mv: new THREE.Texture() });
    const c = new CometHead(layer, new THREE.Texture()); c.mode = "ab"; c.use("fire", own, hybrid);
    expect(c.upgraded).toBe(true); expect(videos[0]!.src).toBe("/hybrid/c.mp4");
    c.draw(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 6, 1, 0.5, 1); c.update(0);
    for (const name of ["comet-video", "comet-head-video"]) { const mesh = layer.getObjectByName("flipbook-" + name) as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>; expect(mesh.material.uniforms.uClipSide!.value).toBe(-1); expect(mesh.geometry.instanceCount).toBe(1); }
    for (const name of ["c", "comet-head-atlas"]) { const mesh = layer.getObjectByName("flipbook-" + name) as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>; expect(mesh.material.uniforms.uClipSide!.value).toBe(1); expect(mesh.geometry.instanceCount).toBe(1); }
    expect((layer.getObjectByName("flipbook-body") as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>).material.uniforms.uClipSide!.value).toBe(0);
  });
});

it("restarts driven video and flipbook in the same captured frame without waiting for seeked", async () => {
  const videos = dom(); const { lib } = mockLibrary(true); const host = abHost(lib);
  vi.mocked(fetch).mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => manifest({ video, compareWith: { folder: "fire", id: "c" } }) } as Response);
  const ab = new HybridAB(host, { scene: "c", only: null, left: "video", prewarm: false, autostart: false, driven: true });
  await ab.load(); await lib.fetchAtlas("c"); ab.update(0); ab.start(); ab.update(1 / 30); ab.update(1 / 30);
  expect(videos[0]!.currentTime).toBeCloseTo(1 / 30);
  ab.start(); ab.update(1 / 30);
  expect(videos[0]!.currentTime).toBe(0); expect(videos[0]!.paused).toBe(true); expect(ab.state().clock).toBeCloseTo(1 / 30);
  for (const node of host.layer.children) expect((node as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount).toBe(1);
  expect(host.initTexture).not.toHaveBeenCalled(); expect(ab.state().uploadMs).toBe(0);
  expect(await ab.settle()).toBe(true);
});
