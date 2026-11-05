import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EXPANSION, EXPANSION_SHOWCASE, SHOWCASE, Showcase, ULT_SHOWCASE } from "../../src/lab/showcase";
import { FlipbookPlayer, parseFlipbookManifest } from "../../src/view/skills/flipbook";

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  c.position.set(0, 26, 14);
  c.lookAt(0, 0, -6);
  c.updateMatrixWorld(true);
  return c;
}

function host(lights: string[]): ConstructorParameters<typeof Showcase>[1] {
  return {
    camera: camera(),
    nearest: () => 0,
    at: (_i, out) => out.set(1, 0, -5),
    caster: (out) => out.set(0, 0, 3),
    light: (_at, colour) => lights.push(colour),
    accent: () => {},
    shake: () => {},
    captionHost: null,
  };
}

function setup(): { show: Showcase; player: FlipbookPlayer; lights: string[] } {
  const player = new FlipbookPlayer("/v/");
  const lights: string[] = [];
  const show = new Showcase(player, host(lights), ULT_SHOWCASE);
  const entries: Record<string, unknown> = {};
  for (const [id, role] of [["ult-light", "ultimate"], ["pillar-thunder-single", "pillar"], ["pillar-thunder-field", "pillar"], ["kiem-guard", "weapon"],
    ["ult-water-profound-sea", "ultimate"], ["ult-water-profound-sea-v2", "ultimate"], ["ult-dark", "ultimate"]] as const) {
    entries[id] = { file: `${id}.png`, cols: 4, rows: 8, frames: 31, fps: 6, cell: [640, 360], role };
  }
  const lib = player.library("ult");
  for (const meta of parseFlipbookManifest({ flipbooks: entries }, "/v/ult/").values()) lib.add(meta, new THREE.Texture());
  return { show, player, lights };
}

describe("the lab's showcase key (8): pillars and ultimates as video layers", () => {
  it("lists the catalogue's order (pillars, then one ultimate per element); other roles and the clips the owner turned down are left out", () => {
    expect(setup().show.ids()).toEqual(["pillar-thunder-single", "pillar-thunder-field", "ult-water-profound-sea-v2", "ult-light"]);
    expect(setup().show.play("ult-water-profound-sea")).toBeNull();
    expect(setup().show.play("ult-dark")).toBeNull();
  });

  it("names every catalogue item in English and Vietnamese with its element and its Firefly sound", () => {
    expect(SHOWCASE.filter((it) => it.kind === "pillar").length).toBe(4);
    expect(new Set(SHOWCASE.filter((it) => it.kind === "ultimate").map((it) => it.element[0])).size).toBe(14);
    for (const it of SHOWCASE) {
      expect(it.en.length).toBeGreaterThan(3);
      expect(it.vi.length).toBeGreaterThan(3);
      expect(it.sound).toMatch(/^tt-sfx-(pillar|ult)-/);
    }
  });

  it("goes back with Shift+8 (prev) and wraps round both ways", () => {
    const { show } = setup();
    expect(show.play()).toBe("pillar-thunder-single");
    expect(show.prev()).toBe("ult-light");
    expect(show.prev()).toBe("ult-water-profound-sea-v2");
    expect(show.play()).toBe("ult-light");
    expect(show.play()).toBe("pillar-thunder-single");
  });

  it("plays one a press in order, at the clip's element light, and nothing for an id it does not have", () => {
    const { show, player, lights } = setup();
    expect(show.play()).toBe("pillar-thunder-single");
    expect(show.play()).toBe("pillar-thunder-field");
    expect(show.play("ult-light")).toBe("ult-light");
    expect(show.play("nope")).toBeNull();
    player.update(1 / 60);
    expect(player.live).toBe(3);
    expect(lights).toEqual(["#c9b8ff", "#c9b8ff", "#fff0c8"]);
  });

  it("stands a pillar on its foot (the column's base, not the cell's centre) and lets it go in a few seconds", () => {
    const { show, player } = setup();
    expect(player.pool("ult", "pillar-thunder-single").meta!.pivot).toEqual([0.5, 0.8]);
    // A field of pillars fills the view like an ultimate: its cell's own centre.
    expect(player.pool("ult", "pillar-thunder-field").meta!.pivot).toEqual([0.5, 0.5]);
    show.play("pillar-thunder-single");
    let frames = 0;
    player.update(0);
    while (player.live > 0 && frames < 600) {
      player.update(1 / 60);
      frames += 1;
    }
    expect(frames / 60).toBeGreaterThan(2);
    expect(frames / 60).toBeLessThan(3);
  });

  it("key 9 matches the expansion's clips by their design code, in the catalogue's order, staged by group", () => {
    const player = new FlipbookPlayer("/v/");
    const lights: string[] = [];
    const show = new Showcase(player, host(lights), EXPANSION_SHOWCASE);
    const entries = {
      "exp-c1-dragon": { file: "a.png", cols: 4, rows: 4, frames: 16, fps: 8, role: "beast", code: "C1" },
      "exp-a1-lotus": { file: "b.png", cols: 4, rows: 4, frames: 16, fps: 8, role: "area", code: "A1" },
      "exp-b6-sword-immortal": { file: "c.png", cols: 4, rows: 4, frames: 16, fps: 8, role: "avatar", code: "B6" },
      "exp-unknown": { file: "d.png", cols: 4, rows: 4, frames: 16, fps: 8, role: "treasure", code: "Z9" },
      "pillar-x": { file: "e.png", cols: 4, rows: 4, frames: 16, fps: 8, role: "pillar" },
    };
    const lib = player.library("expansion");
    for (const meta of parseFlipbookManifest({ flipbooks: entries }, "/v/expansion/").values()) lib.add(meta, new THREE.Texture());
    expect(show.ids()).toEqual(["exp-a1-lotus", "exp-b6-sword-immortal", "exp-c1-dragon", "exp-unknown"]);
    expect(show.item("exp-b6-sword-immortal").en).toBe("Taixu Sword Immortal Phantom");
    expect(show.item("exp-b6-sword-immortal").place).toBe("caster");
    expect(show.item("exp-c1-dragon").place).toBe("foes");
    expect(show.item("exp-a1-lotus").place).toBe("field");
    expect(show.item("exp-unknown").en).toBe("Z9");
    expect(show.play()).toBe("exp-a1-lotus");
    expect(show.play()).toBe("exp-b6-sword-immortal");
    expect(show.prev()).toBe("exp-a1-lotus");
    player.update(1 / 60);
    expect(player.live).toBe(2);
    // The first element's light: A1 Wood, B6 Metal.
    expect(lights).toEqual(["#d8f2a8", "#d6f3ff", "#d8f2a8"]);
  });

  it("names all 30 expansion designs in English and Hán Việt, four groups, a sound for each", () => {
    expect(EXPANSION.length).toBe(30);
    expect(new Set(EXPANSION.map((it) => it.code)).size).toBe(30);
    for (const g of ["area", "avatar", "beast", "treasure"]) expect(EXPANSION.filter((it) => it.kind === g).length).toBeGreaterThanOrEqual(6);
    for (const it of EXPANSION) {
      expect(it.en.length).toBeGreaterThan(5);
      expect(it.vi.length).toBeGreaterThan(5);
      expect(it.sound).toMatch(/^tt-sfx-ult-/);
    }
  });
});
