import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SHOWCASE, UltShowcase } from "../../src/lab/showcase";
import { FlipbookPlayer, parseFlipbookManifest } from "../../src/view/skills/flipbook";

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
  c.position.set(0, 26, 14);
  c.lookAt(0, 0, -6);
  c.updateMatrixWorld(true);
  return c;
}

function setup(): { show: UltShowcase; player: FlipbookPlayer; lights: string[] } {
  const player = new FlipbookPlayer("/v/");
  const lights: string[] = [];
  const show = new UltShowcase(player, {
    camera: camera(),
    nearest: () => 0,
    at: (_i, out) => out.set(1, 0, -5),
    light: (_at, colour) => lights.push(colour),
    accent: () => {},
    shake: () => {},
    captionHost: null,
  });
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
});
