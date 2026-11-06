import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOE_AURA_CLIPS, FoeFlipbookFx, foeAuraEnabled, type FoePose } from "../../src/lab/foe-flipbook-fx";
import { parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { LabBus } from "../../src/lab/events";

const IRON = "elite-aura-ironhide-loop", GROUND = "captain-aura-ground-loop", FRENZY = "boss-frenzy-aura-loop";
const ROAR = "boss-phase-roar-shockwave", FLARE = "boss-phase-aura-flare";
const VORTEX = "boss-entrance-vortex", FOG = "boss-entrance-fog";
function beast(target: number, boss = false): FoePose {
  return { target, x: target + 1, y: 1, z: 3, groundY: 0.2, radius: 0.5, serial: 1, species: boss ? "thiet-boi-lang-vuong" : "thiet-giap-tru", beastTier: boss ? 4 : 2, elite: true, hpFraction: 1 };
}
function fixture(poses = [beast(0)], search = "") {
  const live = new Set(poses.map((p) => p.target));
  const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", {
    alive: (target) => live.has(target),
    pose(target, out) { Object.assign(out, poses.find((p) => p.target === target)!); },
    auraCount: () => poses.length,
    auraTarget: (i) => poses[i]!.target,
  }, search, { priority: (p) => p.x * p.x });
  for (const c of FOE_AURA_CLIPS) {
    const meta = parseFlipbookManifest({ flipbooks: { [c.id]: { file: c.id + ".png", cols: 4, rows: 4, frames: 16, fps: 8, cell: [320, 160], loop: c.id.endsWith("loop"), mode: c.id === FOG ? "smoke" : "fire" } } }, "/v/").get(c.id)!;
    fx.adopt(c, meta, new THREE.Texture());
  }
  const pool = (id: string) => fx.player.pool("boss", id);
  return { fx, live, poses, pool };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("lab elite and boss presence", () => {
  it("follows the body, loops for its lifetime and stops on disappearance or death", () => {
    const { fx, poses, live, pool } = fixture();
    fx.update(0); expect(pool(IRON).live).toBe(1);
    poses[0]!.x = 8; fx.update(2.5);
    expect(pool(IRON).mesh.geometry.getAttribute("iPos").getX(0)).toBe(8);
    expect(pool(IRON).mesh.geometry.getAttribute("iData").getZ(0)).toBe(4);
    live.delete(0); fx.update(0); expect(pool(IRON).live).toBe(0);
    live.add(0); fx.update(0); expect(pool(IRON).live).toBe(1);
    // Death cancellation is immediate, even when the next animation update has not run.
    const bus = new LabBus(); bus.death.target = 0;
    fx.queueDeath(bus.death, poses[0]!); expect(pool(IRON).live).toBe(0);
    fx.update(0); expect(pool(IRON).live).toBe(0);
    live.delete(0); fx.update(0); live.add(0); fx.update(0);
    expect(pool(IRON).live).toBe(1);
    poses.length = 0; fx.update(0); expect(pool(IRON).live).toBe(0);
  });

  it("restarts rather than transferring an old aura on a recycled serial", () => {
    const { fx, poses, pool } = fixture();
    fx.update(0); fx.update(0.75);
    expect(pool(IRON).mesh.geometry.getAttribute("iData").getZ(0)).toBe(6);
    poses[0]!.serial = 2; fx.update(0);
    expect(pool(IRON).live).toBe(1);
    expect(pool(IRON).mesh.geometry.getAttribute("iData").getZ(0)).toBe(0);
    poses[0]!.species = "phong-lang"; fx.update(0); expect(pool(IRON).live).toBe(0);
  });

  it("does not let a delayed old death cancel the new serial reusing its slot", () => {
    const { fx, poses, pool } = fixture();
    const bus = new LabBus(); bus.death.target = 0;
    fx.update(0); fx.queueDeath(bus.death, poses[0]!);
    poses[0]!.serial = 2; fx.update(0);
    expect(pool(IRON).live).toBe(1);
    fx.update(0.05); expect(pool(IRON).live).toBe(1);
    expect(fx["auras"].get(0)!.stopped).toBe(false);
  });

  it("selects only the mapped elite boar, respecting the actual elite marker", () => {
    const poses = [beast(0), beast(1), beast(2), beast(3), beast(4)];
    poses[1]!.species = "phong-lang"; poses[2]!.beastTier = 1;
    poses[3]!.elite = false; poses[4]!.beastTier = 3;
    const { fx, pool } = fixture(poses); fx.update(0);
    expect(pool(IRON).live).toBe(1); expect(pool(GROUND).live).toBe(0);
  });

  it("keeps the nearest eight elites and reserves every boss outside that budget", () => {
    const poses = Array.from({ length: 20 }, (_, i) => beast(i));
    poses.push(beast(20, true), beast(21, true));
    const { fx, pool } = fixture(poses); fx.update(0);
    expect(pool(IRON).live).toBe(8); expect(pool(GROUND).live).toBe(2);
    const positions = pool(IRON).mesh.geometry.getAttribute("iPos");
    expect(Array.from({ length: 8 }, (_, i) => positions.getX(i))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    poses[19]!.x = 0; fx.update(0);
    expect(pool(IRON).live).toBe(8);
    expect(positions.getX(0)).toBe(0); expect(positions.getX(7)).toBe(7);
    fx.stop(20); expect(pool(GROUND).live).toBe(1); expect(pool(IRON).live).toBe(8);
  });

  it("changes phase exactly at 50%, with one burst timeline per lifetime", () => {
    const { fx, poses, pool } = fixture([beast(0, true)]);
    fx.update(0); poses[0]!.hpFraction = 0.5001; fx.update(0.1);
    expect(pool(FRENZY).live).toBe(0); expect(pool(ROAR).live).toBe(0);
    poses[0]!.hpFraction = 0.5; fx.update(0.1);
    for (const id of [FRENZY, ROAR, FLARE]) expect(pool(id).live).toBe(1);
    expect(pool(ROAR).mesh.geometry.getAttribute("iData").getZ(0)).toBe(0);
    const phaseAt = fx["auras"].get(0)!.phaseAt;
    fx.update(0.5);
    expect(pool(ROAR).mesh.geometry.getAttribute("iData").getZ(0)).toBe(4);
    poses[0]!.hpFraction = 0.8; fx.update(0.1); expect(pool(FRENZY).live).toBe(0);
    poses[0]!.hpFraction = 0.2; fx.update(0.1);
    expect(fx["auras"].get(0)!.phaseAt).toBe(phaseAt);
    fx.update(2); expect(pool(ROAR).live).toBe(0); expect(pool(FLARE).live).toBe(0);
    expect(pool(FRENZY).live).toBe(1); expect(pool(GROUND).live).toBe(1);
    poses[0]!.serial = 2; poses[0]!.hpFraction = 1; fx.update(0);
    poses[0]!.hpFraction = 0.4; fx.update(0);
    expect(pool(ROAR).live).toBe(1);
    expect(fx["auras"].get(0)!.phaseAt).toBeGreaterThan(phaseAt);
  });

  it("shows frenzy for a boss first seen below 50% without inventing a crossing", () => {
    const p = beast(0, true); p.hpFraction = 0.4;
    const { fx, pool } = fixture([p]); fx.update(0);
    expect(pool(FRENZY).live).toBe(1); expect(pool(ROAR).live).toBe(0);
  });

  it("plays entrance once at the birth position and resets it on a new life", () => {
    const { fx, poses, pool, live } = fixture([beast(0, true)]);
    fx.update(0); poses[0]!.x = 9; fx.update(0.5);
    for (const id of [VORTEX, FOG]) {
      expect(pool(id).live).toBe(1);
      expect(pool(id).mesh.geometry.getAttribute("iPos").getX(0)).toBe(1);
      expect(pool(id).mesh.geometry.getAttribute("iData").getZ(0)).toBe(4);
    }
    expect(pool(GROUND).mesh.geometry.getAttribute("iPos").getX(0)).toBe(9);
    fx.update(2); expect(pool(VORTEX).live).toBe(0); expect(pool(FOG).live).toBe(0);
    live.delete(0); fx.update(0); live.add(0); fx.update(0);
    expect(pool(VORTEX).mesh.geometry.getAttribute("iPos").getX(0)).toBe(9);
    fx.stop(0);
    for (const id of [GROUND, FRENZY, ROAR, FLARE, VORTEX, FOG]) expect(pool(id).live).toBe(0);
  });

  it("cancels an old serial's entrance and phase immediately when its replacement is ordinary", () => {
    const { fx, poses, pool } = fixture([beast(0, true)]);
    fx.update(0); poses[0]!.hpFraction = 0.4; fx.update(0);
    Object.assign(poses[0]!, beast(0), { serial: 2 }); fx.update(0);
    for (const id of [GROUND, FRENZY, ROAR, FLARE, VORTEX, FOG]) expect(pool(id).live).toBe(0);
    expect(pool(IRON).live).toBe(1);
  });

  it("disables every task layer with foeaura=0 while keeping existing foe reactions", () => {
    expect(foeAuraEnabled("?q=high&foeaura=0")).toBe(false);
    expect(foeAuraEnabled("?foeaura=1")).toBe(true);
    const { fx, pool } = fixture([beast(0), beast(1, true)], "?foeaura=0");
    const prepare = vi.spyOn(fx, "prepare");
    fx.update(1); expect(prepare).not.toHaveBeenCalled();
    for (const c of FOE_AURA_CLIPS) expect(pool(c.id).live).toBe(0);
    fx.status(0, "stun", 1); expect(prepare).toHaveBeenCalled();
    expect(fx.old).toBe(false);
  });

  it("fetches no aura manifests when the comparison switch is off", () => {
    const fx = new FoeFlipbookFx(new THREE.Group(), "/v/", { alive: () => true, pose() {}, auraCount: () => 1, auraTarget: () => 0 }, "?foeaura=0");
    const library = vi.spyOn(fx.player, "library");
    for (const c of FOE_AURA_CLIPS) fx.prepare(c);
    fx.update(1); expect(library).not.toHaveBeenCalled();
  });

  it("keeps body art behind models, feet at ground height and light below 0.9", () => {
    const { fx, poses, pool } = fixture([beast(0), beast(1, true)]);
    fx.update(0); poses[1]!.hpFraction = 0.5; fx.update(0);
    for (const c of FOE_AURA_CLIPS) {
      const p = pool(c.id), g = p.mesh.geometry;
      expect(p.mesh.renderOrder).toBe(1); expect(p.mesh.material.depthTest).toBe(true);
      expect(p.mesh.material.depthWrite).toBe(false);
      expect(g.getAttribute("iLift").getX(0)).toBeLessThan(0);
      expect(g.getAttribute("iColor").getX(0) * (p.mode === "smoke" ? 1.4 : 1)).toBeLessThanOrEqual(0.9);
      expect(p.mesh.material.fragmentShader).toContain("uTag");
    }
    expect(pool(IRON).mesh.geometry.getAttribute("iPos").getY(0)).toBe(1);
    expect(pool(GROUND).mesh.geometry.getAttribute("iPos").getY(0)).toBeCloseTo(0.2);
  });

  it("reuses warm states, snapshots, ranking slots, pools and typed buffers", () => {
    const { fx, pool } = fixture([...Array.from({ length: 20 }, (_, i) => beast(i)), beast(20, true)]);
    fx.update(0);
    const states = [...fx["auras"].values()], ranking = fx["elites"];
    const buffers = FOE_AURA_CLIPS.map((c) => pool(c.id).mesh.geometry.getAttribute("iPos").array);
    const set = vi.spyOn(fx["auras"], "set"), from = vi.spyOn(Array, "from"), floats = vi.spyOn(globalThis, "Float32Array");
    for (let i = 0; i < 120; i++) fx.update(1 / 60);
    expect(set).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled(); expect(floats).not.toHaveBeenCalled();
    expect([...fx["auras"].values()]).toEqual(states); expect(fx["elites"]).toBe(ranking);
    FOE_AURA_CLIPS.forEach((c, i) => expect(pool(c.id).mesh.geometry.getAttribute("iPos").array).toBe(buffers[i]));
  });

  it("releases inactive auras after exactly twenty seconds, preserving warm pools", () => {
    const { fx, live, pool } = fixture();
    fx.update(0);
    const p = pool(IRON), lib = fx.player.library("boss");
    const dispose = vi.spyOn(lib.get(IRON)!.texture, "dispose");
    live.delete(0); fx.update(19.999); expect(dispose).not.toHaveBeenCalled();
    fx.update(0.001); expect(dispose).toHaveBeenCalledTimes(1);
    expect(lib.deferred(IRON)).toBe(true); expect(pool(IRON)).toBe(p);
  });

  it("does not reload expired boss one-shots while persistent loops stay resident", () => {
    const { fx, pool } = fixture([beast(0, true)]);
    fx.update(0); fx.update(2); fx.update(20);
    const lib = fx.player.library("boss");
    expect(lib.deferred(VORTEX)).toBe(true); expect(lib.deferred(GROUND)).toBe(false);
    const prepare = vi.spyOn(fx, "prepare"); fx.update(1);
    expect(prepare.mock.calls.some(([c]) => c.id === VORTEX || c.id === FOG)).toBe(false);
    expect(pool(GROUND).live).toBe(1);
  });

  it("retains upcoming phase art for a slow boss and fires on its crossing frame", () => {
    const { fx, poses, pool } = fixture([beast(0, true)]);
    fx.update(0); fx.update(25);
    const lib = fx.player.library("boss");
    for (const id of [FRENZY, ROAR, FLARE]) expect(lib.deferred(id)).toBe(false);
    poses[0]!.hpFraction = 0.5; fx.update(0);
    for (const id of [FRENZY, ROAR, FLARE]) expect(pool(id).live).toBe(1);
    expect(pool(ROAR).mesh.geometry.getAttribute("iData").getZ(0)).toBe(0);
  });

  it("clears every presence layer and timeline on a lab reset", () => {
    const { fx, pool } = fixture([beast(0), beast(1, true)]);
    fx.update(0); fx.clear();
    for (const c of FOE_AURA_CLIPS) expect(pool(c.id).live).toBe(0);
    fx.update(0); expect(pool(VORTEX).mesh.geometry.getAttribute("iData").getZ(0)).toBe(0);
  });
});
