import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BeastState, World } from "../../src/content/types";
import { createHealthBars, damagedHealth } from "../../src/view/health-bars";

describe("shared damaged-beast health bars", () => {
  it("only locates damaged beasts in a mixed crowd, including full elites and bosses", () => {
    const bars = createHealthBars(new THREE.Group(), 8);
    const list = [
      { slot: 0, serial: 10, hp: 100, elite: "cuong" },
      { slot: 1, serial: 11, hp: 75, elite: "thiet-bi" },
      { slot: 2, serial: 12, hp: 100, boss: true },
      { slot: 3, serial: 13, hp: 25, boss: true },
    ].map(beast => ({ alive: true, freed: false, hpMax: 100, ...beast }) as unknown as BeastState);
    const world = { beasts: { list } } as World;
    const located: number[] = [];
    const locate = (slot: number, _serial: number, _anchor: string, out: { x: number; y: number; z: number }): boolean => {
      located.push(slot);
      Object.assign(out, { x: slot, y: 2, z: 3 });
      return true;
    };
    bars.update(world, locate);
    expect(located).toEqual([1, 3]);
    expect(bars.mesh.count).toBe(2);
    const health = bars.mesh.geometry.getAttribute("health");
    expect([health.getX(0), health.getX(1)]).toEqual([.75, .25]);
    const matrix = new THREE.Matrix4();
    bars.mesh.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBe(3);
    // The first slot heals; a recycled full-health boss must lose its old instance too.
    list[1]!.hp = 100;
    Object.assign(list[3]!, { serial: 99, hp: 100 });
    located.length = 0;
    bars.update(world, locate);
    expect(located).toEqual([]);
    expect(bars.mesh.count).toBe(0);
    expect(bars.mesh.visible).toBe(false);
    bars.dispose();
  });

  it("hides full, healed, dead and freed beasts; shows damage immediately", () => {
    const beast = { alive: true, freed: false, hp: 100, hpMax: 100 };
    expect(damagedHealth(beast)).toBeNull();
    beast.hp = 75;
    expect(damagedHealth(beast)).toBe(.75);
    beast.hp = 100;
    expect(damagedHealth(beast)).toBeNull();
    expect(damagedHealth({ ...beast, hp: 0 })).toBeNull();
    expect(damagedHealth({ ...beast, hp: 50, alive: false })).toBeNull();
    expect(damagedHealth({ ...beast, hp: 50, freed: true })).toBeNull();
  });

  it("uses one non-grouped instanced mesh for a crowd and removes stale instances", () => {
    const host = new THREE.Group();
    const bars = createHealthBars(host, 300);
    const list = Array.from({ length: 300 }, (_, slot) => ({ slot, serial: slot + 1, alive: true, freed: false, hp: slot % 2 ? 50 : 100, hpMax: 100 }) as BeastState);
    const world = { beasts: { list } } as World;
    const locate = (_slot: number, _serial: number, _anchor: string, out: { x: number; y: number; z: number }) => { Object.assign(out, { x: 1, y: 2, z: 3 }); return true; };
    bars.update(world, locate);
    expect(host.children).toEqual([bars.mesh]);
    expect(bars.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(bars.mesh.geometry.groups).toHaveLength(0);
    expect(Array.isArray(bars.mesh.material)).toBe(false);
    expect(bars.mesh.count).toBe(150);
    expect(bars.mesh.geometry.getAttribute("health").getX(0)).toBe(.5);
    for (const beast of list) beast.hp = beast.hpMax;
    bars.update(world, locate);
    expect(bars.mesh.count).toBe(0);
    expect(bars.mesh.visible).toBe(false);
    bars.dispose();
    expect(host.children).toHaveLength(0);
  });
});
