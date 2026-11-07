import * as THREE from "three";
import { afterEach, expect, it } from "vitest";
import { bloodRingBurst, clipAudit } from "../../src/view/skills/element-clips";
import { elementById } from "../../src/view/skills/elements";
import { ElementStage } from "../../src/view/skills/element-stage";
import { parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { glowOf } from "../../src/view/skills/weapons";
import type { SwordSkillTextures } from "../../src/view/skills/sword-skills";

const stages: ElementStage[] = [];
afterEach(() => { for (const stage of stages.splice(0)) { stage.reset(); stage.flipbooks.dispose(); } });

function fixture(id: "blood" | "water") {
  const texture = new THREE.Texture();
  const names = ["glow", "flare", "star", "spark", "trace", "slash", "mote", "smoke", "splash", "scorch", "ring", "shock", "halo", "twirl"];
  const textures = Object.fromEntries(names.map((name) => [name, texture])) as unknown as SwordSkillTextures;
  const stage = new ElementStage({ layer: new THREE.Group(), camera: new THREE.PerspectiveCamera(28, 16 / 9), quality: "high", textures, texture: () => texture, vfxBase: "/v/" });
  stages.push(stage);
  const raw = { flipbooks: Object.fromEntries(["release", "ringBurst"].map((role) => [id + "-" + (role === "ringBurst" ? "ring-burst" : role), {
    file: role + ".png", cols: 4, rows: 4, frames: 16, fps: 24, cell: 128, role, mode: "fire",
  }])) };
  const lib = stage.flipbooks.library(id);
  for (const meta of parseFlipbookManifest(raw, "/v/").values()) lib.add(meta, texture);
  const hooks = stage.hooksOf(elementById(id)!);
  return { stage, hooks };
}

it("Blood's real release and the isolated probe share the same grounded ring pool and finish", () => {
  const { stage, hooks } = fixture("blood");
  expect(hooks.sword!.release!({ slot: "k1", skill: "k1", tier: 2, size: 1, intensity: 1, ringM: 4,
    at: new THREE.Vector3(3, 1, -2), hand: new THREE.Vector3(3, 1, -2),
    caster: { x: 2, z: -3, fx: 0, fz: -1 }, pal: glowOf("#E0507A") })).toBe(true);
  stage.update(0);
  const pool = stage.flipbooks.pool("blood", "blood-ring-burst");
  expect(clipAudit(stage, "blood")!.spawned.ringBurst).toBe(1);
  expect(pool.live).toBe(1);
  const pos = pool.mesh.geometry.getAttribute("iPos");
  expect([pos.getX(0), pos.getZ(0)]).toEqual([2, -3]);
  expect(pos.getY(0)).toBeCloseTo(0.04);
  expect(pool.mesh.material.customProgramCacheKey()).toBe("element-ground-card");
  // The lab resets the skill hooks before clearing the stage's render pools.
  hooks.sword!.reset!();
  stage.reset();
  expect(bloodRingBurst(stage, -4, 5)).toBe(true);
  stage.update(0);
  expect(pool.live).toBe(1);
  expect([pos.getX(0), pos.getZ(0)]).toEqual([-4, 5]);
  stage.update(2);
  stage.update(0); // Pools draw at the old age, then advance; flush the expired card.
  expect(pool.live).toBe(0);
  hooks.sword!.reset!();
  stage.reset();
  hooks.sword!.release!({ slot: "k2", skill: "k2", tier: 2, size: 1, intensity: 1, ringM: 4,
    at: new THREE.Vector3(), hand: new THREE.Vector3(), caster: { x: 0, z: 0, fx: 0, fz: -1 }, pal: glowOf("#E0507A") });
  expect(clipAudit(stage, "blood")!.spawned.ringBurst).toBe(0);
});

it("keeps other elements' release unchanged even when their manifest declares a ring", () => {
  const { stage, hooks } = fixture("water");
  expect(bloodRingBurst(stage, 0, 0)).toBe(false);
  hooks.sword!.release!({ slot: "k1", skill: "k1", tier: 2, size: 1, intensity: 1, ringM: 4,
    at: new THREE.Vector3(), hand: new THREE.Vector3(), caster: { x: 0, z: 0, fx: 0, fz: -1 }, pal: glowOf("#3399ee") });
  expect(clipAudit(stage, "water")!.spawned.ringBurst).toBe(0);
  expect(clipAudit(stage, "water")!.spawned.release).toBe(1);
});
