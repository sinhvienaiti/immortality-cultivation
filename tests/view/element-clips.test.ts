import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CLIP_ROLES, clipAudit } from "../../src/view/skills/element-clips";
import type { ClipRole, ElementKit, FoeStatusKind } from "../../src/view/skills/element-kit";
import { ElementStage } from "../../src/view/skills/element-stage";
import { elementById, elementKits } from "../../src/view/skills/elements";
import { parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { MyriadSwordsFx } from "../../src/view/skills/myriad-swords";
import { SwordSkillFx, type SwordSkillHost, type SwordSkillTextures } from "../../src/view/skills/sword-skills";
import type { TargetField } from "../../src/view/skills/targets";

const NEW_ELEMENTS = ["water"] as const;

function field(n: number): TargetField & { statuses: [number, FoeStatusKind][] } {
  const statuses: [number, FoeStatusKind][] = [];
  return {
    statuses,
    size: n,
    alive: () => true,
    x: (i) => -4 + i * 1.2,
    z: () => -6,
    midY: () => 0.5,
    radius: () => 0.4,
    tier: (i) => (i === 0 ? 2 : 1),
    nearest: (x, z, maxR, skip = -1) => {
      let best = -1;
      let bd = maxR;
      for (let i = 0; i < n; i += 1) {
        if (i === skip) continue;
        const d = Math.hypot(-4 + i * 1.2 - x, -6 - z);
        if (d <= bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    inCircle: () => 0,
    inCapsule: () => 0,
    hit: () => false,
    status: (i, kind) => {
      statuses.push([i, kind]);
    },
  };
}

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  c.position.set(0, 26, 14);
  c.lookAt(0, 0, -6);
  c.updateMatrixWorld(true);
  return c;
}

function sheets(): SwordSkillTextures {
  const glow = new THREE.Texture();
  const other = (): THREE.Texture => new THREE.Texture();
  return { glow, flare: other(), star: other(), spark: glow, trace: other(), slash: other(), mote: glow, smoke: other(), splash: other(), scorch: other(), ring: other(), shock: other(), halo: other(), twirl: other() };
}

function swordHost(targets: TargetField, layer: THREE.Object3D, cam: THREE.Camera): SwordSkillHost {
  return {
    layer,
    camera: cam,
    targets,
    caster(out) {
      out.x = 0;
      out.z = 3;
      out.fx = 0;
      out.fz = -1;
    },
    hand(out) {
      out.set(0.3, 1.2, 2.8);
    },
    flash() {},
    impulse() {},
    hitStop() {},
    moveCaster() {},
    play() {},
  };
}

function liveSprites(layer: THREE.Object3D): number {
  let n = 0;
  layer.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined;
    if (o.visible && g !== undefined && (g as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry === true) n += g.instanceCount;
  });
  return n;
}

/** The element's folder as the lab-flipbooks agent writes it: one clip per role (or the roles given), blank atlases. */
function giveClips(stage: ElementStage, id: string, roles: readonly ClipRole[] = CLIP_ROLES): void {
  const entries: Record<string, unknown> = {};
  for (const role of roles) {
    const loop = role === "ribbon" || role === "sheath" || role === "sparkle";
    const tall = role === "sheath";
    const wide = role === "ribbon" || role === "slash" || role === "groundMark";
    entries[`${id}-${role.toLowerCase()}`] = { file: `${id}-${role.toLowerCase()}.png`, cols: 4, rows: 4, frames: 16, fps: 24, cell: tall ? [144, 256] : wide ? [256, 144] : 256, loop, mode: "fire", role };
  }
  const lib = stage.flipbooks.library(id);
  for (const meta of parseFlipbookManifest({ version: 1, flipbooks: entries }, `/v/${id}/`).values()) lib.add(meta, new THREE.Texture());
}

interface Run {
  base: number;
  kit: number;
  statuses: [number, FoeStatusKind][];
  stage: ElementStage;
  hooks: Record<string, boolean[]>;
}

/** Key 1 cast on three beasts with `kit` (null: Metal), its clips given first when `clips` is set. */
function runK1(kit: ElementKit | null, clips: readonly ClipRole[] | null): Run {
  const base = new THREE.Group();
  const kitLayer = new THREE.Group();
  const cam = camera();
  const targets = field(3);
  const tex = sheets();
  const fx = new SwordSkillFx(swordHost(targets, base, cam), tex, "high");
  const stage = new ElementStage({ layer: kitLayer, camera: cam, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/v/" });
  const hooks: Record<string, boolean[]> = {};
  if (kit !== null) {
    if (clips !== null) giveClips(stage, kit.id, clips);
    // Record what each sword hook answered.
    const h = stage.hooksOf(kit).sword!;
    for (const [name, fn] of Object.entries(h)) {
      if (typeof fn !== "function" || name === "frame" || name === "reset") continue;
      (h as Record<string, unknown>)[name] = (a: unknown) => {
        const r = (fn as (a: unknown) => boolean)(a);
        (hooks[name] ??= []).push(r);
        return r;
      };
    }
    fx.setElement(kit, stage);
  }
  let kitMax = 0;
  let baseMax = 0;
  const step = (): void => {
    stage.begin();
    fx.update(1 / 60);
    stage.update(1 / 60);
    kitMax = Math.max(kitMax, liveSprites(kitLayer));
    baseMax = Math.max(baseMax, liveSprites(base));
  };
  fx.setCharge("k1", 0.4, 0, -6);
  step();
  fx.setCharge("k1", 0.8, 0, -6);
  step();
  fx.cast("k1", 0, -6);
  for (let i = 0; i < 90; i += 1) step();
  return { base: baseMax, kit: kitMax, statuses: targets.statuses, stage, hooks };
}

describe("element kits drawn from clips (lab-element-kits, 05/11/2026)", () => {
  it("registers each new element with its own law, status and sound, drawn from its folder by role", () => {
    const ids = elementKits().map((k) => k.id);
    for (const id of NEW_ELEMENTS) {
      expect(ids).toContain(id);
      const kit = elementById(id)!;
      expect(kit.roles).toEqual(CLIP_ROLES);
      expect(kit.attach).toBeDefined();
      expect(kit.fallback).toBeUndefined();
      expect(kit.sound).toBe(id);
      expect(kit.foe).not.toBeNull();
    }
    expect(elementById("water")!.foe!.kind).toBe("wet");
  });

  it("keeps a manifest entry's role", () => {
    const m = parseFlipbookManifest({ flipbooks: { a: { file: "a.png", cols: 2, rows: 2, role: "groundImpact" }, b: { file: "b.png", cols: 2, rows: 2 } } }, "/v/");
    expect(m.get("a")!.role).toBe("groundImpact");
    expect(m.get("b")!.role).toBeUndefined();
  });

  it("runs every ramp hot to dark, its hues apart from the typing colour (169°) and the enemy red (0°)", () => {
    const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    const hsl = { h: 0, s: 0, l: 0 };
    for (const id of NEW_ELEMENTS) {
      const r = elementById(id)!.ramp;
      expect(lum(r.core)).toBeGreaterThan(lum(r.edge));
      expect(lum(r.edge)).toBeGreaterThan(lum(r.body));
      expect(lum(r.body)).toBeGreaterThan(lum(r.soot));
      new THREE.Color().setRGB(r.body[0], r.body[1], r.body[2]).getHSL(hsl, THREE.SRGBColorSpace);
      const h = hsl.h * 360;
      expect(Math.abs(h - 169)).toBeGreaterThan(25);
      expect(Math.min(h, 360 - h)).toBeGreaterThan(15);
    }
  });

  it("declines every layer while its folder has no clip: the base layers draw exactly as Metal's", () => {
    const metal = runK1(null, null);
    for (const id of NEW_ELEMENTS) {
      const r = runK1(elementById(id)!, null);
      expect(r.kit).toBe(0);
      expect(r.base).toBe(metal.base);
      for (const answers of Object.values(r.hooks)) expect(answers.every((a) => !a)).toBe(true);
      // The status is the element's even before its clips arrive.
      expect(r.statuses.length).toBeGreaterThan(0);
    }
  });

  it("with its clips in, replaces Metal's layers in all five phases and strikes the ground on every blow", () => {
    const metal = runK1(null, null);
    for (const id of NEW_ELEMENTS) {
      const r = runK1(elementById(id)!, CLIP_ROLES);
      expect(r.kit).toBeGreaterThan(0);
      expect(r.base).toBeLessThan(metal.base * 0.6);
      for (const name of ["chargeFrame", "chargeKey", "release", "travel", "impact", "cut", "aftermath"]) {
        expect(r.hooks[name]?.length ?? 0, `${id} ${name} called`).toBeGreaterThan(0);
        expect(r.hooks[name]!.every((a) => a), `${id} ${name} drew`).toBe(true);
      }
      const a = clipAudit(r.stage, id)!;
      for (const role of ["charge", "release", "sheath", "impact", "groundImpact", "groundMark", "sparkle", "slash"] as const) expect(a.spawned[role], `${id} ${role}`).toBeGreaterThan(0);
    }
  });

  it("declines only the roles it has no clip for (a hit without an impact or burst clip lets the base hit draw)", () => {
    const r = runK1(elementById("water")!, ["charge", "release", "sparkle", "groundMark"]);
    expect(r.hooks.chargeFrame!.every((a) => a)).toBe(true);
    expect(r.hooks.release!.every((a) => a)).toBe(true);
    expect(r.hooks.impact!.every((a) => !a)).toBe(true);
    expect(r.hooks.cut!.every((a) => !a)).toBe(true);
    // The ground mark alone still answers the aftermath.
    expect(r.hooks.aftermath!.every((a) => a)).toBe(true);
  });

  it("takes the ribbon clip as the flight trail once it arrives", () => {
    const kit = elementById("water")!;
    const stage = new ElementStage({ layer: new THREE.Group(), camera: camera(), quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" });
    stage.hooksOf(kit);
    giveClips(stage, "water", ["ribbon"]);
    expect(kit.trail.flame?.clip).toBe("water-ribbon");
    expect(kit.trail.silk).toBe(false);
  });

  it("draws key 7 with its clips: lead strikes, the ground blows, the finisher's cut on the ground", () => {
    for (const id of NEW_ELEMENTS) {
      const kit = elementById(id)!;
      const layer = new THREE.Group();
      const cam = camera();
      const targets = field(12);
      const stage = new ElementStage({ layer, camera: cam, quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" });
      giveClips(stage, id);
      const fx = new MyriadSwordsFx(
        {
          layer: new THREE.Group(),
          camera: cam,
          targets,
          caster(out) {
            out.x = 0;
            out.z = 3;
            out.fx = 0;
            out.fz = -1;
          },
          hand(out) {
            out.set(0.3, 1.2, 2.8);
          },
          struck() {},
          phase() {},
          flyby() {},
          flash() {},
        },
        { glow: new THREE.Texture(), slash: new THREE.Texture(), star: new THREE.Texture(), ring: new THREE.Texture(), scorch: new THREE.Texture(), noise: new THREE.Texture() },
        { mid: 16, far: 24 },
      );
      fx.setElement(kit, stage);
      stage.reset();
      fx.cast();
      for (let i = 0; i < 240; i += 1) {
        stage.begin();
        fx.update(1 / 60);
        stage.update(1 / 60);
      }
      const a = clipAudit(stage, id)!;
      expect(a.spawned.impact + a.spawned.burst, id).toBeGreaterThan(0);
      expect(a.spawned.groundImpact, id).toBeGreaterThan(0);
      expect(a.spawned.groundMark, id).toBeGreaterThan(0);
      expect(a.spawned.sparkle, id).toBeGreaterThan(0);
      expect(targets.statuses.length).toBeGreaterThan(0);
    }
  });
});
