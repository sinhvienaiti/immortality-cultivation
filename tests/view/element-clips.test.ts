import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CLIP_ROLES, clipAudit } from "../../src/view/skills/element-clips";
import { CUT } from "../../src/view/skills/sword-grammar";
import { DARK, DARK_B } from "../../src/view/skills/element-dark";
import type { ClipRole, ElementKit, FoeStatusKind } from "../../src/view/skills/element-kit";
import { ElementStage } from "../../src/view/skills/element-stage";
import { elementById, elementKits } from "../../src/view/skills/elements";
import { parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { MyriadSwordsFx } from "../../src/view/skills/myriad-swords";
import { SwordSkillFx, type SwordSkillHost, type SwordSkillTextures } from "../../src/view/skills/sword-skills";
import type { TargetField } from "../../src/view/skills/targets";

/** Every kit drawn from its folder's clips by role (Water, Thunder and the elements after them). */
const NEW_ELEMENTS = elementKits().filter((k) => k.roles !== undefined).map((k) => k.id);

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
    expect(elementById("thunder")!.foe!.kind).toBe("shocked");
    expect(NEW_ELEMENTS.length).toBeGreaterThanOrEqual(2);
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
      // Apart from the enemy's warning red #FF4A4A (D54) by hue, or by being far darker (Dark's crimson, palette A).
      expect(Math.min(h, 360 - h) > 15 || hsl.l < 0.3, `${id} body hue ${h.toFixed(0)}°, lightness ${hsl.l.toFixed(2)}`).toBe(true);
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

  it("draws a role's body layer (smoke filmed on white) under its rim, the rim then as the light it was filmed as", () => {
    const layered = (withBody: boolean): { stage: ElementStage } => {
      const base = new THREE.Group();
      const layer = new THREE.Group();
      const cam = camera();
      const targets = field(3);
      const tex = sheets();
      const fx = new SwordSkillFx(swordHost(targets, base, cam), tex, "high");
      const stage = new ElementStage({ layer, camera: cam, quality: "high", textures: tex, texture: () => tex.glow, vfxBase: "/v/" });
      const entries: Record<string, unknown> = {
        "dark-impact": { file: "a.png", cols: 4, rows: 4, frames: 16, fps: 24, mode: "fire", role: "impact", layer: "rim" },
      };
      if (withBody) entries["dark-impact-white"] = { file: "b.png", cols: 4, rows: 4, frames: 16, fps: 24, mode: "smoke", role: "impact", layer: "body" };
      const lib = stage.flipbooks.library("dark");
      // The manifest declares both before either atlas arrives (the rim first).
      const metas = [...parseFlipbookManifest({ flipbooks: entries }, "/v/dark/").values()];
      for (const m of metas) (lib as unknown as { declared: Map<string, unknown> }).declared.set(m.id, m);
      for (const m of metas) lib.add(m, new THREE.Texture());
      fx.setElement(elementById("dark")!, stage);
      fx.cast("k1", 0, -6);
      for (let i = 0; i < 60; i += 1) {
        stage.begin();
        fx.update(1 / 60);
        stage.update(1 / 60);
      }
      expect(targets.statuses.length).toBeGreaterThan(0);
      return { stage };
    };
    const alone = layered(false);
    expect(alone.stage.flipbooks.pool("dark", "dark-impact").mode).toBe("heat");
    expect(clipAudit(alone.stage, "dark")!.bodies.impact).toBe(0);
    const paired = layered(true);
    expect(paired.stage.flipbooks.pool("dark", "dark-impact").mode).toBe("fire");
    expect(paired.stage.flipbooks.pool("dark", "dark-impact-white").mode).toBe("smoke");
    const a = clipAudit(paired.stage, "dark")!;
    expect(a.spawned.impact).toBeGreaterThan(0);
    expect(a.bodies.impact).toBe(a.spawned.impact);
    expect(a.pools.impact).toBe(1);
  });

  it("cuts 1.8 times bigger for every element (owner 19:12), grown sideways and down so the word tag stays clear", () => {
    const cuts: { size: number; x: number; y: number; z: number }[] = [];
    const kit: ElementKit = {
      ...elementById("water")!,
      id: "water",
      attach: () => ({ sword: { cut: (a) => (cuts.push({ size: a.size, x: a.at.x, y: a.at.y, z: a.at.z }), true) } }),
    };
    const cam = camera();
    const layer = new THREE.Group();
    const targets = field(3);
    const fx = new SwordSkillFx(swordHost(targets, layer, cam), sheets(), "high");
    fx.setElement(kit, new ElementStage({ layer, camera: cam, quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" }));
    fx.cast("k1", 0, -6);
    for (let i = 0; i < 90; i += 1) fx.update(1 / 60);
    expect(cuts.length).toBeGreaterThan(0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    for (const c of cuts) {
      // k1's cut is 1.5 before the scale; its centre sits on the camera's up axis through the hit (beast mid 0.5 m).
      expect(c.size).toBeCloseTo(1.5 * CUT.scale, 5);
      expect(c.y).toBeLessThan(0.5);
      expect(c.y).toBeGreaterThanOrEqual(CUT.floor - 1e-6);
      const drop = (0.5 - c.y) / up.y;
      // The top edge rises less than half of what the crescent grew.
      const rise = (c.size - 1.5) / 2 - drop;
      expect(rise).toBeLessThan((c.size - 1.5) / 2);
      expect(drop).toBeGreaterThan(0);
    }
  });

  it("draws Dark in palette A (black, ember-crimson rims; owner 19:20): no purple or violet, and never the v1 purple atlases", () => {
    const hsl = { h: 0, s: 0, l: 0 };
    const dark = elementById("dark")!;
    for (const c of [dark.ramp.core, dark.ramp.edge, dark.ramp.body, dark.ramp.soot, dark.stream.halo, dark.stream.core]) {
      new THREE.Color().setRGB(c[0], c[1], c[2]).getHSL(hsl, THREE.SRGBColorSpace);
      const h = hsl.h * 360;
      // Reds and embers only (330°–40°), never 250°–320° (violet, purple).
      expect(h < 40 || h > 330 || hsl.s < 0.1, `hue ${h.toFixed(0)}°`).toBe(true);
    }
    const stage = new ElementStage({ layer: new THREE.Group(), camera: camera(), quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" });
    stage.hooksOf(dark);
    const lib = stage.flipbooks.library("dark");
    const old = parseFlipbookManifest({ flipbooks: { "dark-slash-arc": { file: "dark-slash-arc.atlas.png", cols: 4, rows: 4, md5: "4b87786fec45844738b4a6b32ca6e76b", role: "slash", layer: "rim" } } }, "/v/dark/");
    lib.add(old.get("dark-slash-arc")!, new THREE.Texture());
    expect(clipAudit(stage, "dark")!.pools.slash).toBe(0);
    const redraw = parseFlipbookManifest({ flipbooks: { "dark-slash-arc": { file: "dark-slash-arc.atlas.png", cols: 4, rows: 4, md5: "0123456789abcdef0123456789abcdef", role: "slash", layer: "rim" } } }, "/v/dark/");
    lib.add(redraw.get("dark-slash-arc")!, new THREE.Texture());
    expect(clipAudit(stage, "dark")!.pools.slash).toBe(1);
  });

  it("keeps palette B for the lab's comparison (?dark=b): black with cold silver-grey rims, no red or violet", () => {
    expect(DARK_B.id).toBe("dark");
    expect(elementById("dark")).toBe(DARK);
    const srgb = { r: 0, g: 0, b: 0 };
    for (const c of [DARK_B.ramp.core, DARK_B.ramp.edge, DARK_B.ramp.body, DARK_B.ramp.soot, DARK_B.stream.halo]) {
      new THREE.Color().setRGB(c[0], c[1], c[2]).getRGB(srgb, THREE.SRGBColorSpace);
      // Greys: a small chroma (max − min channel, display values), its tint never red (red never the largest channel).
      expect(Math.max(srgb.r, srgb.g, srgb.b) - Math.min(srgb.r, srgb.g, srgb.b)).toBeLessThan(0.15);
      expect(srgb.r).toBeLessThanOrEqual(Math.max(srgb.g, srgb.b));
    }
  });

  it("draws key 2 as one big designed crescent flying the line, then one big cut at its end; no chain of small crescents (owner ~19:45)", () => {
    const cuts: number[] = [];
    const flights: { size: number; u: number; x: number; z: number }[] = [];
    const kit: ElementKit = {
      ...elementById("water")!,
      id: "water",
      attach: () => ({
        sword: {
          cut: (a) => (cuts.push(a.size), true),
          flyingCut: (a) => (flights.push({ size: a.size, u: a.u, x: a.at.x, z: a.at.z }), true),
        },
      }),
    };
    const cam = camera();
    const layer = new THREE.Group();
    const fx = new SwordSkillFx(swordHost(field(12), layer, cam), sheets(), "high");
    fx.setElement(kit, new ElementStage({ layer, camera: cam, quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" }));
    fx.cast("k2", 0, -10);
    for (let i = 0; i < 60; i += 1) fx.update(1 / 60);
    // One crescent a frame through the flight, growing from the hand to the line's end, at least the 1.8× cut size.
    expect(flights.length).toBeGreaterThanOrEqual(8);
    expect(flights[0]!.u).toBeLessThan(0.3);
    expect(flights[flights.length - 1]!.u).toBeGreaterThan(0.8);
    for (let i = 1; i < flights.length; i += 1) expect(flights[i]!.u).toBeGreaterThanOrEqual(flights[i - 1]!.u);
    for (const f of flights) expect(f.size).toBeGreaterThanOrEqual(1.8 * CUT.scale - 1e-6);
    // The beasts on the line are struck, yet only one cut: the big crescent where the line ends.
    expect(cuts).toEqual([2.0 * CUT.scale]);
  });

  it("draws Metal's key 2 crescent itself when the element has no flying cut (one sprite pair a frame, never a stamp chain)", () => {
    const cam = camera();
    const layer = new THREE.Group();
    const tex = sheets();
    const fxSlashTex = tex.slash;
    const fx = new SwordSkillFx(swordHost(field(12), layer, cam), tex, "high");
    fx.cast("k2", 0, -10);
    let maxSlash = 0;
    for (let i = 0; i < 60; i += 1) {
      fx.update(1 / 60);
      layer.traverse((o) => {
        const m = o as THREE.Mesh;
        const mat = m.material as THREE.ShaderMaterial | undefined;
        const g = m.geometry as THREE.InstancedBufferGeometry | undefined;
        if (o.visible && g?.isInstancedBufferGeometry === true && mat?.uniforms?.map?.value === fxSlashTex) maxSlash = Math.max(maxSlash, g.instanceCount);
      });
    }
    // The flying pair (core and rim) and the big end cut's pair: never the old 9 + 1-per-beast stamps (≥ 20 sprites).
    expect(maxSlash).toBeGreaterThan(0);
    expect(maxSlash).toBeLessThanOrEqual(4);
  });

  it("takes the ribbon clip as the flight trail once it arrives", () => {
    const kit = elementById("thunder")!;
    const stage = new ElementStage({ layer: new THREE.Group(), camera: camera(), quality: "high", textures: sheets(), texture: () => new THREE.Texture(), vfxBase: "/v/" });
    stage.hooksOf(kit);
    giveClips(stage, "thunder", ["ribbon"]);
    expect(kit.trail.flame?.clip).toBe("thunder-ribbon");
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
      if (id === "thunder" || id === "light" || id === "star") expect(a.spawned.ribbon, `${id} judges from the sky`).toBeGreaterThan(0);
      expect(targets.statuses.length).toBeGreaterThan(0);
    }
  });
});
