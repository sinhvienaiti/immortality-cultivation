import * as THREE from "three";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroPresenceFx, HERO_PRESENCE_IDS, heroPresenceEnabled, heroUltimateReady, type HeroPresencePose } from "../../src/lab/hero-presence-fx";
import { FlipbookLibrary, parseFlipbookManifest } from "../../src/view/skills/flipbook";

const [RING, MOTES, ULT, SHELL] = HERO_PRESENCE_IDS;
const meta = (id: string) => parseFlipbookManifest({ flipbooks: { [id]: {
  file: id + ".png", cols: 8, rows: 8, frames: 48, fps: 24, cell: [320, 320], loop: true, mode: "fire", pivot: [0.48, 0.53],
} } }, "/v/meta/").get(id)!;
function fixture(search = "", adopt = true) {
  const parent = new THREE.Group();
  const fx = new HeroPresenceFx(parent, "/v/", search);
  if (adopt) for (const id of HERO_PRESENCE_IDS) fx.adopt(id, meta(id), new THREE.Texture());
  const pose: HeroPresencePose = { x: 2, y: 0.2, z: 3, height: 2, ultimateReady: false, guardActive: false };
  const pool = (id: string) => fx.player.pool("meta", id);
  const step = (world: number, real = world) => fx.update(world, real, pose);
  return { fx, pose, pool, step, parent };
}
beforeEach(() => { vi.spyOn(FlipbookLibrary.prototype, "load").mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("hero presence state transitions", () => {
  it("fades in the always-on ring, follows the shown hero and preserves the authored loop/pivot", () => {
    const { pose, pool, step } = fixture();
    step(0.15);
    expect(pool(RING).live).toBe(1);
    const data = pool(RING).mesh.geometry.getAttribute("iData");
    expect(data.getW(0)).toBeCloseTo(0.5);
    step(0.15); expect(data.getW(0)).toBeCloseTo(1);
    pose.x = 7; pose.y = 1; pose.z = -4;
    step(2.1);
    const pos = pool(RING).mesh.geometry.getAttribute("iPos");
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([7, expect.closeTo(1.03), -4]);
    expect(data.getZ(0)).toBeCloseTo(9.6);
    expect(pool(RING).meta!.pivot).toEqual([0.48, 0.53]);
    expect(pool(RING).mesh.material.uniforms.uPivot!.value.toArray()).toEqual([0.48, 0.47]);
  });

  it("starts motes only after 1.5 s idle, then fades them out in 0.3 s after a key", () => {
    const { fx, pool, step } = fixture();
    step(1.49); expect(pool(MOTES).live).toBe(0);
    step(0.01); expect(pool(MOTES).live).toBe(0);
    step(0.15);
    expect(pool(MOTES).mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
    step(0.15);
    fx.typed(); step(0.15);
    expect(pool(MOTES).mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
    step(0.15); expect(pool(MOTES).live).toBe(0);
    step(1.19); expect(pool(MOTES).live).toBe(0);
    step(0.31); expect(pool(MOTES).live).toBe(1);
  });

  it("uses real idle seconds during hit-stop, keeping the animation on world time", () => {
    const { pool, step } = fixture();
    step(0, 1.8);
    expect(pool(MOTES).live).toBe(1);
    expect(pool(MOTES).mesh.geometry.getAttribute("iData").getZ(0)).toBe(0);
    step(0.5, 0.5);
    expect(pool(MOTES).mesh.geometry.getAttribute("iData").getZ(0)).toBe(12);
  });

  it("recognizes selected ultimates from either key, without treating a heavy attack as ready", () => {
    expect(heroUltimateReady("ult", "heavy")).toBe(true);
    expect(heroUltimateReady("heavy", "ult")).toBe(true);
    expect(heroUltimateReady(undefined, "ult")).toBe(true);
    expect(heroUltimateReady("heavy", "light")).toBe(false);
    expect(heroUltimateReady()).toBe(false);
    const { pose, pool, step } = fixture();
    step(0.3); expect(pool(ULT).live).toBe(0);
    pose.ultimateReady = heroUltimateReady("ult"); step(0.3);
    expect(pool(ULT).live).toBe(1);
    pose.ultimateReady = false; step(0.15);
    expect(pool(ULT).mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
    step(0.15); expect(pool(ULT).live).toBe(0);
  });

  it("requires a successful block, then holds the shell for the parry and fades it away", () => {
    const { fx, pose, pool, step } = fixture();
    pose.guardActive = true;
    step(0.3); expect(pool(SHELL).live).toBe(0);
    fx.block(); step(0.08);
    expect(pool(SHELL).live).toBe(1);
    expect(pool(SHELL).mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(1);
    step(0.09); expect(pool(SHELL).live).toBe(1);
    step(0.25); expect(pool(SHELL).live).toBe(0);
    fx.block(); step(0.08); expect(pool(SHELL).live).toBe(1);
    pose.guardActive = false; step(0.25); expect(pool(SHELL).live).toBe(0);
  });

  it("keeps the parry shell alive through a hit-stop, then cancels it on reset", () => {
    const { fx, pose, pool, step } = fixture();
    pose.guardActive = true; fx.block(); step(0.08);
    step(0, 1); expect(pool(SHELL).live).toBe(1);
    fx.clear(); expect(fx.player.live).toBe(0);
    step(0.08); expect(pool(SHELL).live).toBe(0);
    expect(pool(MOTES).live).toBe(0);
  });

  it("renders behind the body with depth testing, the existing word mask and a combined light cap", () => {
    const { fx, pose, pool, step } = fixture();
    pose.ultimateReady = true; pose.guardActive = true;
    step(1.8); fx.block(); step(0.08);
    let light = 0;
    for (const id of HERO_PRESENCE_IDS) {
      const p = pool(id), geometry = p.mesh.geometry;
      expect(p.live).toBe(1);
      expect(p.mesh.material.depthTest).toBe(true);
      expect(p.mesh.material.depthWrite).toBe(false);
      expect(p.mesh.material.fragmentShader).toContain("vxTagKeep");
      if (id === RING) expect(geometry.getAttribute("iLift").getX(0)).toBeGreaterThan(0);
      else expect(geometry.getAttribute("iLift").getX(0)).toBeLessThan(0);
      const colour = geometry.getAttribute("iColor");
      const max = Math.max(colour.getX(0), colour.getY(0), colour.getZ(0));
      expect(max).toBeLessThanOrEqual(id === RING ? 0.6 : 0.9);
      light += max;
    }
    expect(light).toBeLessThan(0.9);
  });

  it("places the painted foot ring flat on the floor while keeping body layers billboarded", () => {
    const { pool } = fixture();
    const material = pool(RING).mesh.material;
    const shader = { vertexShader: material.vertexShader } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("vec3 heroCorner = vec3(corner.x, 0.0, -corner.y)");
    expect(shader.vertexShader).toContain("vWorld = (modelMatrix * vec4(iPos + heroCorner, 1.0)).xyz");
    expect(shader.vertexShader).not.toContain("view.xy += corner;");
    expect(pool(MOTES).mesh.material.vertexShader).toContain("view.xy += corner;");
    expect(material.customProgramCacheKey()).not.toBe(pool(MOTES).mesh.material.customProgramCacheKey());
  });

  it("reuses the same pool, attributes and options over steady frames", () => {
    const { fx, pose, pool, step } = fixture();
    pose.ultimateReady = true; step(1.8);
    const p = pool(MOTES), attributes = p.mesh.geometry.attributes, options = fx["options"];
    for (let i = 0; i < 100; i += 1) step(1 / 60);
    expect(pool(MOTES)).toBe(p);
    expect(p.mesh.geometry.attributes).toBe(attributes);
    expect(fx["options"]).toBe(options);
    expect(p.live).toBe(1); expect(p.dropped).toBe(0);
  });

  it("disables every new layer and all lazy loading with presence=0", () => {
    expect(heroPresenceEnabled("")).toBe(true);
    expect(heroPresenceEnabled("?presence=1")).toBe(true);
    expect(heroPresenceEnabled("?presence=0")).toBe(false);
    const { fx, pose, step } = fixture("?presence=0", false);
    const library = vi.spyOn(fx.player, "library");
    pose.ultimateReady = true; pose.guardActive = true; fx.block();
    step(2); fx.typed(); step(0.3); fx.clear();
    expect(fx.player.live).toBe(0); expect(library).not.toHaveBeenCalled();
  });

  it("requests only currently needed atlases, sharing a lazy meta library", async () => {
    const fetch = vi.spyOn(FlipbookLibrary.prototype, "fetchAtlas").mockResolvedValue(false);
    const { pose, step } = fixture("", false);
    const lib = vi.spyOn(FlipbookLibrary.prototype, "get").mockImplementation((id) => ({ meta: meta(id), texture: new THREE.Texture(), controls: null, source: "png" }));
    step(0); await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0]).toEqual([RING]);
    pose.ultimateReady = true; step(0.1);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1]).toEqual([ULT]);
    expect(lib).not.toHaveBeenCalledWith(SHELL);
    expect(lib).not.toHaveBeenCalledWith(MOTES);
  });

  it("releases inactive atlas textures after 20 real seconds and keeps the live ring", () => {
    const { fx, pose, pool, step } = fixture();
    const release = vi.spyOn(FlipbookLibrary.prototype, "release");
    pose.ultimateReady = true; step(0.3);
    pose.ultimateReady = false; step(0.3);
    fx.typed(); step(0, 19.99);
    expect(release).not.toHaveBeenCalledWith(ULT);
    step(0, 0.01);
    expect(release).toHaveBeenCalledWith(ULT);
    expect(release).not.toHaveBeenCalledWith(RING);
    expect(pool(ULT).live).toBe(0);
    expect(fx.player.library("meta").deferred(ULT)).toBe(true);
  });

  it("reloads an evicted atlas through the real library and fades it in without recreating its pool", async () => {
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(new THREE.Texture());
    const { fx, pose, pool, step } = fixture();
    const old = pool(ULT);
    pose.ultimateReady = true; step(0.3);
    pose.ultimateReady = false; step(0.3); step(0, 20);
    const lib = fx.player.library("meta");
    expect(lib.deferred(ULT)).toBe(true);
    pose.ultimateReady = true; step(0.15);
    expect(old.live).toBe(0);
    await vi.waitFor(() => expect(lib.deferred(ULT)).toBe(false));
    step(0.15);
    expect(pool(ULT)).toBe(old);
    expect(old.live).toBe(1);
    expect(old.mesh.geometry.getAttribute("iData").getW(0)).toBeCloseTo(0.5);
  });

  it("does not replay a cold block after its parry expired while the texture loaded", async () => {
    let finish!: (texture: THREE.Texture) => void;
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { fx, pose, pool, step } = fixture();
    const lib = fx.player.library("meta");
    lib.release(SHELL);
    pose.guardActive = true; fx.block(); step(0.01);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    step(0.5); finish(new THREE.Texture());
    await vi.waitFor(() => expect(lib.deferred(SHELL)).toBe(false));
    step(0.01);
    expect(pool(SHELL).live).toBe(0);
  });

  it("skips a missing manifest entry without retrying it every frame", async () => {
    const fetch = vi.spyOn(FlipbookLibrary.prototype, "fetchAtlas");
    const { fx, step } = fixture("", false);
    step(0);
    await vi.waitFor(() => expect(fx["layers"][0]!.loading).toBe(false));
    expect(fx["layers"][0]!.missing).toBe(true);
    for (let i = 0; i < 10; i += 1) { fx.typed(); step(1); }
    expect(fetch).not.toHaveBeenCalled(); expect(fx.player.live).toBe(0);
  });

  it("wires only successful blocks, typed letters, actual ultimate selections and reset into the lab", () => {
    const source = readFileSync(new URL("../../src/lab/skills-main.ts", import.meta.url), "utf8");
    expect(source).toMatch(/else \{\s*heroPresence\.block\(\);\s*sound\.guardBlock/);
    expect(source).toMatch(/typing\.typed \+= 1;\s*heroPresence\.typed\(\)/);
    expect(source).toContain("clipSkills.skill(id8)?.damage");
    expect(source).toContain("clipSkills9.skill(id9)?.damage");
    const frame = source.slice(source.indexOf("function frame(dt:"), source.indexOf("// A second view"));
    expect(frame).not.toContain(".selectedId()");
    expect(source).toContain('heroPresencePose.guardActive = fx.isRunning("guard")');
    expect(source).toMatch(/presence\.reset\(\);\s*heroPresence\.clear\(\)/);
    expect(source).toContain("presence.ringOn = false");
  });
});
