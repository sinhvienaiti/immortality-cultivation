import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { FrameInfo, Projector } from "../../src/app/contracts";
import type { BeastState, World } from "../../src/content/types";
import { createFoeBadges, FOE_BADGE_ART, FOE_BADGE_PX, foeBadgeKind } from "../../src/ui/foe-badges";

const beast = (slot: number, over: Partial<BeastState> = {}): BeastState => ({ slot, serial: slot + 1, alive: true, freed: false, boss: false, general: false, elite: null, ...over }) as BeastState;
const info = {} as FrameInfo;

function fixture(art = FOE_BADGE_ART) {
  const host = new THREE.Group();
  const loads = new Map<string, { ready: () => void; fail: () => void; texture: THREE.Texture }>();
  const list = [beast(0), beast(1, { elite: "cuong" }), beast(2, { boss: true })];
  let visible = true, crowded = false;
  const project: Projector = (x, _y, _z, out) => Object.assign(out, { x: crowded ? 100 : 100 + x * 100, y: 200, visible });
  const locate = vi.fn((slot: number, serial: number, _anchor: string, out: { x: number; y: number; z: number }): boolean => {
    if (serial !== list[slot]?.serial) return false;
    Object.assign(out, { x: slot, y: 2, z: 3 }); return true;
  });
  const badges = createFoeBadges(host, { art, project, locate, viewport: () => ({ width: 1920, height: 1080 }), load: (url, ready, fail) => {
    const texture = new THREE.Texture();
    loads.set(url, { ready, fail, texture });
    return texture;
  } });
  const frame = () => badges.frame({ beasts: { list } } as World, info);
  return { host, list, badges, loads, frame, locate, hide: () => { visible = false; }, crowd: () => { crowded = true; } };
}

describe("approved foe art in one instanced sprite batch", () => {
  it("uses E1 for elite/general, B1 for boss, and excludes ordinary/dead/freed beasts", () => {
    expect(foeBadgeKind(beast(0))).toBeNull();
    for (const elite of ["cuong", "thiet-bi", "hoi-nguyen"] as BeastState["elite"][]) expect(foeBadgeKind(beast(0, { elite }))).toBe("elite");
    expect(foeBadgeKind(beast(0, { general: true }))).toBe("elite");
    expect(foeBadgeKind(beast(0, { boss: true, elite: "cuong" }))).toBe("boss");
    expect(foeBadgeKind(beast(0, { boss: true, alive: false }))).toBeNull();
    expect(foeBadgeKind(beast(0, { boss: true, freed: true }))).toBeNull();
    expect(FOE_BADGE_ART.elite).toContain("foe-elite-jade-shield.v1-try1-48.png");
    expect(FOE_BADGE_ART.boss).toContain("foe-boss-imperial-crown.v1-try1-48.png");
    expect(FOE_BADGE_PX).toEqual({ elite: 30, boss: 32 });
  });

  it("hides unloaded/failed art and uses one mesh, material and ungrouped geometry for both roles", () => {
    const { badges, host, loads, frame } = fixture();
    frame();
    expect(badges.mesh.count).toBe(0);
    for (const load of loads.values()) load.ready();
    frame();
    expect(host.children).toEqual([badges.mesh]);
    expect(badges.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(Array.isArray(badges.mesh.material)).toBe(false);
    expect(badges.mesh.geometry.groups).toHaveLength(0);
    expect(badges.mesh.count).toBe(2);
    const roles = badges.mesh.geometry.getAttribute("badgeRole");
    expect([roles.getX(0), roles.getX(1)]).toEqual([1, 0]);
    loads.get(FOE_BADGE_ART.elite!)!.fail();
    frame();
    expect(badges.mesh.count).toBe(1);
    expect(roles.getX(0)).toBe(1);
    const dispose = [...loads.values()].map(load => vi.spyOn(load.texture, "dispose"));
    badges.dispose();
    expect(host.children).toHaveLength(0);
    expect(dispose.every(spy => spy.mock.calls.length === 1)).toBe(true);
  });

  it("prioritizes bosses in a crowd; removes recycled, freed and offscreen instances", () => {
    const { badges, list, loads, frame, crowd, hide, locate } = fixture();
    for (const load of loads.values()) load.ready();
    crowd(); frame();
    expect(badges.mesh.count).toBe(1);
    expect(badges.mesh.geometry.getAttribute("badgeRole").getX(0)).toBe(1);
    list[2]!.freed = true;
    list[1]!.serial = 99;
    frame();
    expect(badges.mesh.count).toBe(1);
    expect(locate).toHaveBeenCalledWith(1, 99, "top", expect.any(Object));
    expect(badges.mesh.geometry.getAttribute("badgeRole").getX(0)).toBe(0);
    Object.assign(list[1]!, { serial: 100, elite: null });
    frame();
    expect(badges.mesh.count).toBe(0);
    list[1]!.elite = "cuong";
    hide(); frame();
    expect(badges.mesh.visible).toBe(false);
    badges.dispose();
  });

  it("does not load or draw fallback markers when no art is supplied", () => {
    const { badges, loads, frame } = fixture({});
    frame();
    expect(loads.size).toBe(0);
    expect(badges.mesh.visible).toBe(false);
    badges.dispose();
  });
});
