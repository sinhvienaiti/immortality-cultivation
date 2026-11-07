import { existsSync, readFileSync } from "node:fs";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPilotOverrides, installPilotOverrides, pilotStatus, PILOT_IDS, PILOT_ROOT, pilotPlayback, readPilotEnvelope } from "../../src/lab/pilot-overrides";
import { CometHead } from "../../src/lab/comet-head";
import { FlipbookLibrary, FlipbookPlayer, FlipbookPool, ONE_FRAME, parseFlipbookManifest, setFlipbookManifestTransform, setFlipbookKtx2, type FlipbookMeta } from "../../src/view/skills/flipbook";

const entry = { file: "old.png", cols: 4, rows: 2, frames: 8, fps: 8, cell: 128, mode: "rgba" };
const envelope = { durationS: 2, scale: [[0, 0.5], [0.5, 1], [1, 2]], alpha: [[0, 1], [1, 0]], erosion: { start: 0.25, end: 0.75 } };
const base = "/art-src/lab/vfx/fire/";
const manifest = (entries: Record<string, unknown>) => ({ version: 1, flipbooks: entries });
const original = () => parseFlipbookManifest(manifest({ [PILOT_IDS.fire]: entry, untouched: entry }), base);
const response = (raw: unknown, status = 200) => new Response(JSON.stringify(raw), { status, headers: { "content-type": "application/json" } });
const pools: FlipbookPool[] = [];
const players: FlipbookPlayer[] = [];

afterEach(async () => {
  for (const pool of pools.splice(0)) pool.dispose();
  for (const player of players.splice(0)) {
    for (const kit of ["boss", "blood", "fire", "beast", "hybrid"]) if (player.loaded(kit).length > 0) player.library(kit).reset();
    player.dispose();
  }
  await setFlipbookManifestTransform(null);
  setFlipbookKtx2(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("pilot source overrides (node)", () => {
  it.each(["", "?pilot=0", "?pilot=true", "?other=1"])("does not fetch or change metadata without the exact flag: %s", async (search) => {
    const fetcher = vi.fn<typeof fetch>(), warn = vi.fn();
    const metas = original();
    expect(await createPilotOverrides(search, fetcher, warn)(metas, base)).toBe(metas);
    expect(fetcher).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("replaces only matching ids, never inserts extra ids or mutates the base", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(manifest({ [PILOT_IDS.fire]: { ...entry, file: "pilot.png", envelope }, unknown: entry })));
    const warn = vi.fn(), metas = original();
    const transform = createPilotOverrides("?pilot=1", fetcher, warn);
    const result = await transform(metas, base);
    expect([...result.keys()]).toEqual([...metas.keys()]);
    expect(result.get(PILOT_IDS.fire)?.url).toBe(PILOT_ROOT + "fire/pilot.png");
    expect(result.get("untouched")).toBe(metas.get("untouched"));
    expect(metas.get(PILOT_IDS.fire)?.url).toBe(base + "old.png");
    await transform(metas, base);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each(["boss", "blood", "fire", "beast"] as const)("loads %s through the real player, before atlases and pool attachment", async (kit) => {
    const id = PILOT_IDS[kit], kitBase = `/art-src/lab/vfx/${kit}/`;
    vi.stubGlobal("location", { protocol: "http:" });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url) === kitBase + "manifest.json"
      ? response(manifest({ [id]: entry, untouched: entry }))
      : response(manifest({ [id]: { ...entry, file: "pilot.png", envelope } })));
    vi.stubGlobal("fetch", fetcher);
    await installPilotOverrides("?pilot=1");
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    const lib = player.library(kit, () => true);
    await lib.load();
    const pool = player.pool(kit, id);
    expect(lib.declares().find((m) => m.id === id)?.url).toBe(PILOT_ROOT + kit + "/pilot.png");
    expect(pool.meta?.url).toBe(PILOT_ROOT + kit + "/pilot.png");
    expect(pool.meta?.playback?.durationS).toBe(2);
    expect(pool.meta?.fps).toBe(4);
    expect(lib.get("untouched")?.meta.url).toBe(kitBase + "old.png");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([kitBase + "manifest.json", PILOT_ROOT + kit + "/manifest.json"]);
  });

  it.each(["boss", "blood", "fire", "beast"] as const)("refreshes preloaded %s libraries and reports actual PNG/KTX2 playback", async (kit) => {
    const id = PILOT_IDS[kit], kitBase = `/art-src/lab/vfx/${kit}/`;
    const packed = { yFlip: true, uastc: { file: "pilot.uastc.ktx2", bytes: 100 } };
    vi.stubGlobal("location", { protocol: "http:" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url) => response(manifest({ [id]: {
      ...entry, file: String(url).startsWith(PILOT_ROOT) ? "pilot.png" : "old.png", ktx2: packed, envelope,
    } }))));
    const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());
    const compressed = vi.fn().mockImplementation(async () => new THREE.Texture());
    setFlipbookKtx2({ loader: { loadAsync: compressed }, variant: "uastc" });
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    const lib = player.library(kit);
    await lib.load();
    const pool = player.pool(kit, id, { capacity: 1 });
    const oldTexture = lib.get(id)!.texture;
    const disposed = vi.spyOn(oldTexture, "dispose");
    expect(pool.meta?.url).toBe(kitBase + "old.png");
    await installPilotOverrides("?pilot=1");
    const status = () => pilotStatus()[id]!;
    expect(pool.meta?.url).toBe(PILOT_ROOT + kit + "/pilot.png");
    expect(lib.get(id)!.texture).not.toBe(oldTexture);
    expect(disposed).toHaveBeenCalledOnce();
    expect(compressed).toHaveBeenLastCalledWith(PILOT_ROOT + kit + "/pilot.uastc.ktx2");
    expect(png).not.toHaveBeenCalled();
    expect(status()).toEqual({ override: true, atlasUrl: PILOT_ROOT + kit + "/pilot.png", textureUrl: PILOT_ROOT + kit + "/pilot.uastc.ktx2", loaded: true, plays: 0 });
    pool.spawn(new THREE.Vector3(), 1);
    pool.spawn(new THREE.Vector3(), 1); // Full pool: a dropped sprite is not a play.
    expect(status().plays).toBe(1);
    lib.reset();
    expect(status()).toMatchObject({ loaded: false, textureUrl: null, plays: 1 });

    // With no compressed loader, the same override's PNG is the actual source.
    setFlipbookKtx2(null);
    await lib.load();
    expect(png).toHaveBeenLastCalledWith(PILOT_ROOT + kit + "/pilot.png");
    expect(status()).toMatchObject({ loaded: true, textureUrl: PILOT_ROOT + kit + "/pilot.png", plays: 1 });
  });

  it("refreshes only the pilot clip in an already warm library", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url) => String(url) === base + "manifest.json"
      ? response(manifest({ [PILOT_IDS.fire]: entry, untouched: entry }))
      : response(manifest({ [PILOT_IDS.fire]: { ...entry, file: "pilot.png" } }))));
    const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    const lib = player.library("fire"); await lib.load();
    const untouched = lib.get("untouched")!.texture;
    const disposed = vi.spyOn(untouched, "dispose");
    png.mockClear();
    await installPilotOverrides("?pilot=1");
    expect(png).toHaveBeenCalledExactlyOnceWith(PILOT_ROOT + "fire/pilot.png");
    expect(lib.get("untouched")!.texture).toBe(untouched);
    expect(disposed).not.toHaveBeenCalled();
  });

  it("installs while the base manifest is in flight, before any old atlas loads", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    let deliver!: (value: Response) => void;
    const baseResponse = new Promise<Response>((resolve) => { deliver = resolve; });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url) => String(url) === base + "manifest.json"
      ? baseResponse : response(manifest({ [PILOT_IDS.fire]: { ...entry, file: "pilot.png" } }))));
    const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    const lib = player.library("fire");
    const installed = installPilotOverrides("?pilot=1");
    deliver(response(manifest({ [PILOT_IDS.fire]: entry })));
    await installed; await lib.load();
    expect(png).toHaveBeenCalledExactlyOnceWith(PILOT_ROOT + "fire/pilot.png");
    expect(pilotStatus()[PILOT_IDS.fire]).toMatchObject({ override: true, loaded: true, plays: 0 });
  });

  it("reports all four ids without the flag and keeps the baseline sources", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(manifest({ [PILOT_IDS.fire]: entry })));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
    await installPilotOverrides("");
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    await player.ready("fire");
    player.pool("fire", PILOT_IDS.fire).spawn(new THREE.Vector3(), 1);
    expect(Object.keys(pilotStatus())).toEqual(Object.values(PILOT_IDS));
    expect(pilotStatus()[PILOT_IDS.boss]).toEqual({ override: false, atlasUrl: null, textureUrl: null, loaded: false, plays: 0 });
    expect(pilotStatus()[PILOT_IDS.fire]).toEqual({ override: false, atlasUrl: base + "old.png", textureUrl: base + "old.png", loaded: true, plays: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps the pilot comet over a preloaded hybrid atlas and refreshes a cached head", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    const cometEntry = { ...entry, role: "comet", head: { uv: [0.7, 0.7] }, dir: { vec: [-1, 0] } };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url) => response(manifest({ [PILOT_IDS.fire]: {
      ...cometEntry, file: String(url).startsWith(PILOT_ROOT) ? "pilot.png" : "old.png", envelope,
    } }))));
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(async () => new THREE.Texture());
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    const lib = player.library("fire"); await lib.load();
    const upgrade = new FlipbookLibrary("/hybrid/");
    upgrade.add({ ...parseFlipbookManifest(manifest({ [PILOT_IDS.fire]: cometEntry }), "/hybrid/").get(PILOT_IDS.fire)! }, new THREE.Texture());
    const layer = new THREE.Group(), head = new CometHead(layer, new THREE.Texture()); head.mode = "flipbook";
    expect(head.use("fire", lib)).toBe(true);
    await installPilotOverrides("?pilot=1");
    expect(head.use("fire", lib, upgrade)).toBe(true);
    expect(head.upgraded).toBe(false);
    expect(head.videoEl).toBeNull();
    head.draw(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    expect(pilotStatus()[PILOT_IDS.fire]).toMatchObject({ override: true, atlasUrl: PILOT_ROOT + "fire/pilot.png", loaded: true, plays: 1 });
    const mesh = layer.getObjectByName("flipbook-fire-comet") as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    expect(mesh.material.uniforms.uMap!.value).toBe(lib.get(PILOT_IDS.fire)!.texture);
    head.clear(); upgrade.reset();
  });

  it.skipIf(!existsSync("art-src/lab/vfx-pilot-2026-11-07/fire/manifest.json"))("loads the supplied four real manifests through the actual atlas loader", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url) => response(JSON.parse(readFileSync(String(url).slice(1), "utf8")))));
    const compressed = vi.fn().mockImplementation(async () => new THREE.Texture());
    setFlipbookKtx2({ loader: { loadAsync: compressed }, variant: "uastc" });
    // Defer unrelated clips so the test loads precisely the four requested sources.
    await installPilotOverrides("?pilot=1");
    const player = new FlipbookPlayer("/art-src/lab/vfx/"); players.push(player);
    for (const [kit, id] of Object.entries(PILOT_IDS)) {
      const lib = player.library(kit, () => true); await lib.load();
      expect(pilotStatus()[id]).toMatchObject({ override: true, loaded: false, plays: 0 });
      expect(await lib.fetchAtlas(id)).toBe(true);
      const pool = player.pool(kit, id);
      pool.spawn(new THREE.Vector3(), 1);
      expect(pool.meta?.playback?.durationS).toBeGreaterThan(0);
      const state = pilotStatus()[id]!;
      expect(state).toMatchObject({ override: true, loaded: true, plays: 1 });
      expect(state.atlasUrl).toContain(PILOT_ROOT + kit + "/");
      expect(state.textureUrl).toContain(PILOT_ROOT + kit + "/");
      expect(state.textureUrl).toContain(".ktx2");
      lib.release(id);
      expect(pilotStatus()[id]).toMatchObject({ loaded: false, textureUrl: null, plays: 1 });
    }
    expect(compressed).toHaveBeenCalledTimes(4);
  });

  it("keeps every media URL in the pilot directory, including array/alias manifests", async () => {
    const raw = { clips: [{ ...entry, id: PILOT_IDS.fire, file: undefined, atlas: "new.png", grid: [4, 2], envelope,
      video: { file: "new.mp4", w: 1920, h: 1080, fps: 24, frames: 48, start: 0, peakTime: 1 }, controlA: "mask.png", loopMode: "none" }] };
    const result = await createPilotOverrides("?pilot=1", vi.fn<typeof fetch>().mockResolvedValue(response(raw)))(original(), base);
    const m = result.get(PILOT_IDS.fire)!;
    expect(m.url).toBe(PILOT_ROOT + "fire/new.png");
    expect(m.controlA).toBe(PILOT_ROOT + "fire/mask.png");
    expect(m.video?.url).toBe(PILOT_ROOT + "fire/new.mp4");
    expect(m.playback?.durationS).toBe(2);
  });

  it.each([404, 200])("missing directory or dev-host HTML is harmless and warns once (status %s)", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html></html>", { status }));
    const warn = vi.fn(), metas = original(), transform = createPilotOverrides("?pilot=1", fetcher, warn);
    const result = await Promise.all([transform(metas, base), transform(metas, base)]);
    expect(result).toEqual([metas, metas]);
    expect(result[0]).toBe(metas);
    expect(fetcher).toHaveBeenCalledOnce(); expect(warn).toHaveBeenCalledOnce();
  });

  it.each([{}, { flipbooks: {} }, { flipbooks: { [PILOT_IDS.fire]: { ...entry, envelope: { durationS: -1 } } } }])("retains sources on an absent entry or invalid payload/envelope: %j", async (raw) => {
    const warn = vi.fn(), metas = original();
    const transform = createPilotOverrides("?pilot=1", vi.fn<typeof fetch>().mockResolvedValue(response(raw)), warn);
    expect((await transform(metas, base)).get(PILOT_IDS.fire)).toBe(metas.get(PILOT_IDS.fire));
    await transform(metas, base);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("catches request failures and skips kits outside the four pilot kits", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("missing folder")), warn = vi.fn(), metas = original();
    const transform = createPilotOverrides("?pilot=1", fetcher, warn);
    expect(await transform(metas, "/art-src/lab/vfx/thunder/")).toBe(metas);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await transform(metas, base)).toBe(metas);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not invent playback when the override has no envelope", async () => {
    const result = await createPilotOverrides("?pilot=1", vi.fn<typeof fetch>().mockResolvedValue(response(manifest({ [PILOT_IDS.fire]: entry }))))(original(), base);
    expect(result.get(PILOT_IDS.fire)).toEqual({ ...original().get(PILOT_IDS.fire)!, url: PILOT_ROOT + "fire/old.png" });
    expect(result.get(PILOT_IDS.fire)?.playback).toBeUndefined();
  });
});

describe("pilot envelope playback (node)", () => {
  const sampled = (t: number) => {
    const out = { scale: 0, alpha: 0, erosion: 0 };
    pilotPlayback(readPilotEnvelope(envelope)!).sample(t, out);
    return out;
  };
  it("reads the recipe, interpolates linearly and clamps endpoints", () => {
    expect(readPilotEnvelope(envelope)).toEqual(envelope);
    expect(sampled(-1)).toEqual({ scale: 0.5, alpha: 1, erosion: 0 });
    expect(sampled(0.25)).toEqual({ scale: 0.75, alpha: 0.75, erosion: 0 });
    expect(sampled(0.5)).toEqual({ scale: 1, alpha: 0.5, erosion: 0.5 });
    expect(sampled(2)).toEqual({ scale: 2, alpha: 0, erosion: 1 });
  });

  it.each([{ durationS: 0 }, { durationS: Infinity }, { ...envelope, scale: [[0.5, 1], [0, 1]] }, { ...envelope, alpha: [[0, 2]] }, { ...envelope, erosion: { start: 1, end: 0 } }])("rejects malformed recipes: %j", (value) => {
    expect(() => readPilotEnvelope(value)).toThrow(/envelope/);
  });

  it("uses neutral defaults for omitted curves and holds a curve's first/last key", () => {
    const out = { scale: 0, alpha: 0, erosion: 0 };
    pilotPlayback(readPilotEnvelope({ durationS: 1, scale: [[0.2, 2], [0.8, 3]] })!).sample(0, out);
    expect(out).toEqual({ scale: 2, alpha: 1, erosion: 0 });
    pilotPlayback(readPilotEnvelope({ durationS: 1, scale: [[0.2, 2], [0.8, 3]] })!).sample(1, out);
    expect(out.scale).toBe(3);
  });

  function pool(meta: FlipbookMeta): FlipbookPool {
    const p = new FlipbookPool(meta.id, "rgba", 2, 12, new THREE.Texture());
    p.attach(meta, new THREE.Texture()); pools.push(p); return p;
  }
  const meta = () => ({ ...original().get(PILOT_IDS.fire)!, fps: 4, playback: pilotPlayback(readPilotEnvelope(envelope)!) });
  it("uses duration, scale, alpha and erosion on the actual instanced sprite", () => {
    const p = pool(meta());
    p.spawn(new THREE.Vector3(), 4, { life: 4, grow: 10, fadeIn: 5, fadeOut: 5, alpha: 0.8 });
    p.update(1); p.update(0);
    const data = p.mesh.geometry.getAttribute("iData"), age = p.mesh.geometry.getAttribute("iAge");
    expect(data.getX(0)).toBeCloseTo(4);
    expect(data.getW(0)).toBeCloseTo(0.4);
    expect(data.getZ(0)).toBeCloseTo(4);
    expect(age.getX(0)).toBeCloseTo(0.5);
    expect(age.getY(0)).toBeGreaterThan(0);
    expect(age.getW(0)).toBeCloseTo(0.5);
    p.update(1.1); p.update(0); expect(p.live).toBe(0);
  });

  it("samples rebuilt cards by source frame or host time without extending ONE_FRAME", () => {
    const p = pool(meta());
    p.spawn(new THREE.Vector3(), 4, { life: ONE_FRAME, rate: 0, frame: 4 });
    p.update(1 / 60);
    expect(p.mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
    p.update(0); expect(p.live).toBe(0);
    p.spawn(new THREE.Vector3(), 4, { life: ONE_FRAME, rate: 0, frame: 0, playbackT: 0.5 });
    p.update(0);
    expect(p.mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
  });

  it("animates an envelope on a held frame across its full duration", () => {
    const p = pool(meta());
    p.spawn(new THREE.Vector3(), 4, { life: 4, rate: 0, frame: 3 });
    p.update(1); p.update(0);
    const data = p.mesh.geometry.getAttribute("iData");
    expect(data.getZ(0)).toBe(3); expect(data.getW(0)).toBeCloseTo(0.5);
    p.update(1.1); p.update(0); expect(p.live).toBe(0);
  });

  it("leaves the ordinary parser, growth, fade and lifetime unchanged without playback", () => {
    const m = parseFlipbookManifest(manifest({ c: { ...entry, envelope } }), base).get("c")!;
    expect(m.playback).toBeUndefined();
    const p = pool(m);
    p.spawn(new THREE.Vector3(), 4, { life: 2, grow: 1, fadeOut: 2 });
    p.update(1); p.update(0);
    const data = p.mesh.geometry.getAttribute("iData");
    expect(data.getX(0)).toBeCloseTo(7); expect(data.getW(0)).toBeCloseTo(0.5);
  });
});

it("applies the fire comet envelope to video cards and fixed-step source time", () => {
  class VideoNode extends EventTarget {
    src = ""; readyState = 2; error = null; paused = true; currentTime = 0; playbackRate = 1;
    videoWidth = 1920; videoHeight = 1080;
    canPlayType(): string { return "probably"; }
    load(): void {}
    pause(): void { this.paused = true; }
    play(): Promise<void> { this.paused = false; return Promise.resolve(); }
    getAttribute(): string | null { return this.src || null; }
    removeAttribute(): void { this.src = ""; }
  }
  const video = new VideoNode();
  vi.stubGlobal("document", { createElement: () => video });
  const lib = new FlipbookLibrary(base), layer = new THREE.Group();
  lib.add({ ...original().get(PILOT_IDS.fire)!, playback: pilotPlayback(readPilotEnvelope(envelope)!), role: "comet",
    comet: { head: [0.7, 0.7], tail: [-1, 0] },
    video: { url: PILOT_ROOT + "fire/comet.mp4", w: 1920, h: 1080, fps: 24, frames: 96, start: 0, peakTime: 1, pivot: [0.5, 0.5] },
  }, new THREE.Texture());
  const comet = new CometHead(layer, new THREE.Texture()); comet.driven = true;
  comet.use("fire", lib); expect(video.playbackRate).toBe(2);
  comet.update(1);
  comet.draw(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 4, 0.8);
  comet.update(0);
  const mesh = layer.getObjectByName("flipbook-comet-video") as THREE.Mesh<THREE.InstancedBufferGeometry>;
  expect(mesh.geometry.getAttribute("iData").getX(0)).toBeCloseTo(4);
  expect(mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.4);
  expect(video.currentTime).toBe(2);
  comet.clear();
});
