import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deathClips, hitClip, FOE_CLIPS, FoeFlipbookFx, type FoePose, type FoeFxOptions } from "../../src/lab/foe-flipbook-fx";
import { readFileSync, existsSync } from "node:fs";
import { parseFlipbookManifest, setFlipbookKtx2 } from "../../src/view/skills/flipbook";
import { DeathFx } from "../../src/lab/death-fx";
import { LabBus } from "../../src/lab/events";

function fixture(search = "", options: FoeFxOptions = {}) {
  const live = new Set(Array.from({ length: 30 }, (_, i) => i));
  const group = new THREE.Group();
  const fx = new FoeFlipbookFx(group, "/v/", {
    alive: (i) => live.has(i),
    pose(i, p) { Object.assign(p, { target: i, x: i, y: 1, z: 0, radius: 0.5, beastTier: i === 1 ? 2 : 1, species: "phong-lang" }); },
  }, search, options);
  for (const c of FOE_CLIPS) {
    const meta = parseFlipbookManifest({ flipbooks: { [c.id]: { file: c.id + ".png", cols: 4, rows: 4, frames: 16, fps: 8, cell: [320, 160], loop: c.id === "stagger-stars-loop", mode: c.id.includes("smoke") || c.id.includes("ink") ? "smoke" : "fire", pivot: [0.3, 0.7] } } }, "/v/").get(c.id)!;
    fx.adopt(c, meta, new THREE.Texture());
  }
  const p: FoePose = { target: 0, x: 2, y: 1, z: 3, radius: 0.5, beastTier: 1, species: "phong-lang" };
  const bus = new LabBus(); bus.death.target = bus.impact.target = 0;
  return { fx, live, p, bus };
}

describe("painted foe flipbooks", () => {
  it.each([
    ["thach-thu", "death-rat-stone-dust"], ["phong-lang", "death-wolf-wind-wisps"],
    ["thiet-giap-tru", "death-boar-iron-flakes"], ["hoa-nha", "death-crow-ember-ash"], ["nham-vien", "death-ape-rock-crumble"],
  ])("uses actual species %s even on a high-tier foe", (species, id) => {
    expect(deathClips(species, 4).map((x) => x.id)).toEqual([id]);
  });
  it("falls back for absent/unknown species, including an unknown boss", () => {
    for (const s of [undefined, "unknown", "constructor", "toString", "thiet-boi-lang-vuong"]) expect(deathClips(s, s === "thiet-boi-lang-vuong" ? 3 : 4)[0]!.id).toBe("beast-death-ink-smoke");
  });
  it("stages the named boss at death, +150 and +400 ms", () => {
    expect(deathClips("thiet-boi-lang-vuong", 4).map((x) => [x.id, x.delay])).toEqual([
      ["boss-death-explosion-r2", 0], ["boss-death-ink-smoke-ring", 0.15], ["boss-spirit-ascend", 0.4],
    ]);
    const { fx, p, bus } = fixture();
    p.species = "thiet-boi-lang-vuong"; p.beastTier = bus.death.beastTier = 4;
    expect(fx.death(bus.death, p)).toBe(true);
    fx.update(0);
    expect(fx.player.live).toBe(1);
    fx.update(0.15);
    expect(fx.player.live).toBe(2);
    fx.update(0.25);
    expect(fx.player.live).toBe(3);
  });
  it("selects light, directional and heavy/ultimate hits with heavy precedence", () => {
    expect(hitClip().id).toBe("beast-hit-spark-burst");
    expect(hitClip("light", true).id).toBe("beast-hit-ink-streak");
    for (const d of ["heavy", "ult"]) expect(hitClip(d, true).id).toBe("beast-hit-heavy-ink-burst");
  });
  it("keeps manifest pivot, mode, frame rate and body-relative width; projects the blow direction", () => {
    const { fx, p, bus } = fixture();
    bus.impact.directional = true; bus.impact.dx = 0.6; bus.impact.dz = -0.8;
    fx.impact(bus.impact, p); fx.update(0.25); fx.update(0);
    const pool = fx.player.pool("beast", "beast-hit-ink-streak");
    expect(pool.mode).toBe("smoke");
    expect(pool.mesh.material.uniforms.uPivot!.value.toArray()).toEqual([0.3, 0.30000000000000004]);
    const data = pool.mesh.geometry.getAttribute("iData");
    expect(data.getX(0)).toBeCloseTo(0.75); // width 1.5 / aspect 2
    expect(data.getZ(0)).toBe(2); // 0.25 s × 8 fps
    expect(pool.mesh.geometry.getAttribute("iColor").getX(0)).toBeCloseTo(0.045);
    const dir = pool.mesh.geometry.getAttribute("iDir");
    expect(dir.getX(0)).toBeCloseTo(0.6); expect(dir.getZ(0)).toBeCloseTo(-0.8);
    fx.update(2);
    fx.update(0);
    expect(pool.live).toBe(0);
  });
  it("loops stun over the head until its exact deadline, follows the body and cancels on death", () => {
    const { fx, live, bus, p } = fixture();
    fx.status(0, "stun", 5); fx.update(2.5);
    const pool = fx.player.pool("beast", "stagger-stars-loop");
    expect(fx.activeStatuses).toBe(1); expect(pool.live).toBe(1);
    expect(pool.mesh.geometry.getAttribute("iColor").getX(0)).toBe(1);
    expect(pool.mesh.geometry.getAttribute("iData").getZ(0)).toBe(4); // wraps 20 frames → 4
    expect(pool.mesh.geometry.getAttribute("iPos").getY(0)).toBeCloseTo(2.02);
    fx.update(2.499); expect(fx.activeStatuses).toBe(1);
    fx.update(0.001); expect(fx.activeStatuses).toBe(0); expect(pool.live).toBe(0);
    fx.status(0, "stun", 2); fx.death(bus.death, p); fx.update(0); expect(pool.live).toBe(0);
    fx.status(0, "stun", 2); live.delete(0); fx.update(0); expect(fx.activeStatuses).toBe(0);
  });
  it("plays posture break once on elite stun entry, preserves a refresh and cancels explicitly", () => {
    const { fx } = fixture();
    const pool = fx.player.pool("beast", "posture-break-shatter");
    const spawn = vi.spyOn(pool, "spawn");
    fx.status(1, "stun", 1); fx.update(0.5); fx.status(1, "stun", 1); fx.update(0.6);
    expect(spawn).toHaveBeenCalledTimes(1); expect(fx.activeStatuses).toBe(1);
    fx.status(1, "stun", 0); fx.update(0); expect(fx.activeStatuses).toBe(0);
  });
  it("bind plays once on the body and shares the 12-status cap with stun", () => {
    const { fx } = fixture();
    for (let i = 0; i < 15; i++) fx.status(i, i % 2 ? "stun" : "bind", 4);
    fx.update(0.5); expect(fx.activeStatuses).toBe(12);
    const pool = fx.player.pool("mech", "mech-seal-net-bind");
    expect(pool.live).toBe(6); expect(pool.mesh.geometry.getAttribute("iPos").getY(0)).toBe(1);
    fx.clear(); fx.update(0); expect(fx.player.live).toBe(0);
  });
});

describe("foe crowd buckets and old layers", () => {
  it("ranks the whole 50 ms window by tier then screen centre, limits deaths to 10 and hits to 8", () => {
    const deaths: { target: number; painted: boolean }[] = [];
    const { fx, bus, p } = fixture("", { legacy: (e, painted) => deaths.push({ target: e.target, painted }), priority: (p) => p.x * p.x });
    const candidates = [];
    for (let i = 0; i < 30; i += 1) {
      bus.death.target = bus.impact.target = p.target = i;
      bus.death.beastTier = bus.impact.beastTier = p.beastTier = i % 3;
      p.x = 30 - i;
      candidates.push({ target: i, tier: p.beastTier, distance: p.x * p.x });
      fx.queueDeath(bus.death, p); fx.queueImpact(bus.impact, p);
      if (i === 15) fx.update(0.02);
    }
    fx.update(0.029); expect(fx.player.live).toBe(0);
    fx.update(0.001);
    const ranked = candidates.sort((a, b) => b.tier - a.tier || a.distance - b.distance);
    expect(deaths.filter((d) => d.painted).map((d) => d.target)).toEqual(ranked.slice(0, 10).map((d) => d.target));
    expect(deaths.filter((d) => !d.painted)).toHaveLength(20);
    expect(new Set(deaths.map((d) => d.target)).size).toBe(30);
    const pool = fx.player.pool("beast", "beast-hit-spark-burst");
    expect(pool.live).toBe(8);
    const positions = pool.mesh.geometry.getAttribute("iPos");
    for (let i = 0; i < 8; i++) expect(positions.getX(i)).toBe(30 - ranked[i]!.target);
    // Next bucket admits another ten, and reused event objects did not corrupt its first window.
    for (let i = 0; i < 10; i++) { bus.death.target = i; fx.queueDeath(bus.death, p); }
    fx.update(0.05); expect(deaths.filter((d) => d.painted)).toHaveLength(20);
  });
  it("reserves a death-frame boss without exceeding ten selected deaths", () => {
    const drawn: number[] = [];
    const { fx, bus, p } = fixture("", { legacy: (e, painted) => { if (painted) drawn.push(e.target); } });
    for (let i = 0; i < 10; i++) { bus.death.target = i; fx.queueDeath(bus.death, p); }
    p.species = "thiet-boi-lang-vuong"; p.beastTier = bus.death.beastTier = 4; bus.death.target = 99;
    fx.queueDeath(bus.death, p); fx.update(0);
    expect(drawn).toEqual([99]); expect(fx.player.pool("boss", "boss-death-explosion-r2").live).toBe(1);
    fx.update(0.05); expect(drawn).toHaveLength(10);
  });
  it("?deathfx=old draws full legacy deaths immediately, disables hits/statuses and loads no atlases", () => {
    const group = new THREE.Group(), legacy = vi.fn();
    const fx = new FoeFlipbookFx(group, "/v/", { alive: () => true, pose() {} }, "?q=high&deathfx=old", { legacy });
    const lib = vi.spyOn(fx.player, "library");
    const bus = new LabBus(), p: FoePose = { target: 0, x: 0, y: 1, z: 0, radius: 1, beastTier: 4 };
    for (let i = 0; i < 30; i++) fx.queueDeath(bus.death, p);
    fx.queueImpact(bus.impact, p); fx.status(0, "stun", 10); fx.update(0.1);
    expect(legacy).toHaveBeenCalledTimes(30); expect(legacy).toHaveBeenLastCalledWith(bus.death, false);
    expect(fx.player.live).toBe(0); expect(fx.activeStatuses).toBe(0); expect(lib).not.toHaveBeenCalled();
  });
  it("keeps full legacy layers when the selected atlas is absent", () => {
    const legacy = vi.fn();
    const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", { alive: () => false, pose() {} }, "", { legacy });
    const bus = new LabBus(), p: FoePose = { target: 0, x: 0, y: 1, z: 0, radius: 1, beastTier: 1, species: "phong-lang" };
    fx.queueDeath(bus.death, p); fx.update(0.05);
    expect(legacy).toHaveBeenCalledTimes(1); expect(legacy.mock.calls[0]![1]).toBe(false); expect(fx.player.live).toBe(0);
  });
  it("retains only support layers for a painted death, and keeps qi rays on key 7", () => {
    const t = new THREE.Texture();
    const fx = new DeathFx(new THREE.Group(), { flare: t, shock: t, splash: t, glow: t, scorch: t }, false);
    const names = ["burst", "ring", "ink", "shards", "threads", "sparks", "scorch", "pool"] as const;
    const spies = Object.fromEntries(names.map((name) => [name, vi.spyOn(fx[name], "emit")]));
    fx.spawn(0, 1, 0, 1, 0, 0xff8800, 2, true);
    for (const k of ["burst", "ring", "scorch", "pool"]) expect(spies[k]).toHaveBeenCalledTimes(1);
    for (const k of ["ink", "shards", "threads", "sparks"]) expect(spies[k]).not.toHaveBeenCalled();
    fx.dissolve(0, 1, 0, 1, 0, 2, true);
    expect(spies.ink).not.toHaveBeenCalled(); expect(spies.sparks).toHaveBeenCalled();
    fx.spawn(0, 1, 0, 1, 0, 0xff8800, 2);
    for (const k of names) expect(spies[k]).toHaveBeenCalled();
  });
  it("reuses warmed buffers, snapshots, vectors and materials throughout crowded frames", () => {
    const { fx, bus, p } = fixture();
    const arrays = [...fx["deaths"], ...fx["hits"], ...fx["statuses"]];
    const children = [...fx.player.group.children];
    const geometry = children.map((m) => (m as THREE.Mesh).geometry);
    const buffers = geometry.map((g) => g.getAttribute("iPos").array);
    const from = vi.spyOn(Array, "from");
    const floats = vi.spyOn(globalThis, "Float32Array");
    for (let frame = 0; frame < 120; frame++) {
      for (let i = 0; i < 20; i++) { p.target = bus.death.target = bus.impact.target = i; p.x = i; fx.queueDeath(bus.death, p); fx.queueImpact(bus.impact, p); }
      fx.status(frame % 12, "stun", 0.3); fx.update(1 / 60);
    }
    expect(from).not.toHaveBeenCalled(); expect(floats).not.toHaveBeenCalled();
    from.mockRestore(); floats.mockRestore();
    expect(new Set([...fx["deaths"], ...fx["hits"], ...fx["statuses"]])).toEqual(new Set(arrays));
    expect(fx.player.group.children).toEqual(children);
    for (let i = 0; i < geometry.length; i++) expect(geometry[i]!.getAttribute("iPos").array).toBe(buffers[i]);
    for (const c of FOE_CLIPS) expect(fx.player.pool(c.folder, c.id).dropped).toBe(0);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setFlipbookKtx2(null); });

describe("foe atlas residency", () => {
  it("all fifteen chosen clips exist and parse with their own mode, pivot and rate", () => {
    expect(FOE_CLIPS).toHaveLength(15);
    for (const folder of ["beast", "boss", "mech"]) {
      const raw = JSON.parse(readFileSync(`art-src/lab/vfx/${folder}/manifest.json`, "utf8"));
      const metas = parseFlipbookManifest(raw, `/art-src/lab/vfx/${folder}/`);
      for (const c of FOE_CLIPS.filter((c) => c.folder === folder)) {
        const e = raw.flipbooks[c.id], m = metas.get(c.id)!;
        expect(m, c.id).toBeDefined(); expect(existsSync(`art-src/lab/vfx/${folder}/${e.file}`)).toBe(true);
        expect(m.mode).toBe(e.mode); expect(m.pivot).toEqual(e.pivot); expect(m.fps).toBe(e.fps);
        expect(e.width).toBe(e.cols * e.cell[0]); expect(e.height).toBe(e.rows * e.cell[1]);
      }
    }
  });
  it("loads no folder before use, fetches only the demanded atlas and creates its pool in manifest mode", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    vi.stubGlobal("createImageBitmap", undefined);
    const c = FOE_CLIPS.find((x) => x.id === "beast-hit-heavy-ink-burst")!;
    const manifest = { flipbooks: Object.fromEntries(FOE_CLIPS.filter((x) => x.folder === "beast").map((x) => [x.id, { file: x.id + ".png", cols: 4, rows: 4, frames: 16, fps: 8, mode: "smoke" }])) };
    const fetcher = vi.fn(async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => manifest }));
    vi.stubGlobal("fetch", fetcher);
    const texture = new THREE.Texture();
    const loads = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
    const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", { alive: () => false, pose() {} });
    fx.update(5); expect(fetcher).not.toHaveBeenCalled(); expect(loads).not.toHaveBeenCalled();
    fx.prepare(c); fx.prepare(c);
    await vi.waitFor(() => expect(fx["atlases"].find((x) => x.clip === c)!.pool).not.toBeNull());
    expect(fetcher).toHaveBeenCalledTimes(1); expect(loads).toHaveBeenCalledExactlyOnceWith("/v/beast/" + c.id + ".png");
    const pool = fx.player.pool("beast", c.id);
    expect(pool.mode).toBe("smoke");
    expect(fx.player.library("beast").deferred("death-rat-stone-dust")).toBe(true);
    // Releasing and requesting again reuses the warm pool and re-fetches only this atlas.
    const dispose = vi.spyOn(texture, "dispose");
    fx.update(20); expect(dispose).toHaveBeenCalledTimes(1);
    fx.prepare(c);
    await vi.waitFor(() => expect(loads).toHaveBeenCalledTimes(2));
    expect(fx.player.pool("beast", c.id)).toBe(pool);
  });
  it("keeps a live one-shot resident and releases at exactly twenty seconds after its last possible use", () => {
    const { fx, bus, p } = fixture();
    const lib = fx.player.library("beast"), texture = lib.get("death-wolf-wind-wisps")!.texture;
    const dispose = vi.spyOn(texture, "dispose");
    fx.queueDeath(bus.death, p); fx.update(0.05);
    fx.update(2); fx.update(19.999); expect(dispose).not.toHaveBeenCalled();
    fx.update(0.001); expect(dispose).toHaveBeenCalledTimes(1);
    expect(lib.deferred("death-wolf-wind-wisps")).toBe(true);
    expect(fx.player.pool("beast", "death-wolf-wind-wisps").live).toBe(0);
  });
  it("falls back to PNG through the existing library when a declared KTX2 fails", async () => {
    vi.stubGlobal("location", { protocol: "http:" }); vi.stubGlobal("createImageBitmap", undefined);
    const c = FOE_CLIPS[0]!;
    vi.stubGlobal("fetch", async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ flipbooks: { [c.id]: { file: "rat.png", cols: 4, rows: 4, fps: 8, mode: "fire", ktx2: { yFlip: true, uastc: { file: "rat.ktx2", bytes: 100 } } } } }) }));
    const compressed = vi.fn().mockRejectedValue(new Error("missing KTX2"));
    setFlipbookKtx2({ loader: { loadAsync: compressed }, variant: "uastc" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const png = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
    const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", { alive: () => false, pose() {} });
    fx.prepare(c);
    await vi.waitFor(() => expect(fx["atlases"].find((x) => x.clip === c)!.pool).not.toBeNull());
    expect(compressed).toHaveBeenCalledExactlyOnceWith("/v/beast/rat.ktx2");
    expect(png).toHaveBeenCalledExactlyOnceWith("/v/beast/rat.png");
    expect(fx.player.library("beast").source(c.id)).toBe("png");
  });
});

it("does not transfer a status to a recycled sim slot, or break the posture of an ordinary medium beast", () => {
  const { fx } = fixture();
  let serial = 1;
  fx["source"].pose = (i, p) => Object.assign(p, { target: i, x: 0, y: 1, z: 0, radius: 0.5, beastTier: 2, elite: false, serial });
  const pool = fx.player.pool("beast", "posture-break-shatter"), spawn = vi.spyOn(pool, "spawn");
  fx.status(0, "stun", 10); fx.update(0.1); expect(fx.activeStatuses).toBe(1); expect(spawn).not.toHaveBeenCalled();
  serial += 1; fx.update(0.1); expect(fx.activeStatuses).toBe(0);
});
