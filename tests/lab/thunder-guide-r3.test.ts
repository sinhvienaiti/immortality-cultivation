import * as THREE from "three";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThunderTravelR2, THUNDER_GUIDE_FLIGHT_S, THUNDER_GUIDE_RISE_S, THUNDER_GUIDE_WIDTH } from "../../src/lab/thunder-travel-r2";
import { FlipbookPool, parseFlipbookManifest, type FlipOptions } from "../../src/view/skills/flipbook";

const hand = new THREE.Vector3(1, 1.3, 3), target = new THREE.Vector3(2, 0, -6), sky = new THREE.Vector3(1, 8, 3);
function fixture(camera?: THREE.Camera) {
  const travel = new ThunderTravelR2(new THREE.Group(), { hand: (out) => { out.copy(hand); }, camera });
  const texture = new THREE.Texture();
  for (const id of ["thunder-ribbon-loop", "thunder-sparkle", "thunder-charge"]) {
    const meta = parseFlipbookManifest({ flipbooks: { [id]: { file: id + ".png", mode: "fire", cols: 8, rows: 8,
      frames: 48, fps: 24, cell: [512, 288], loop: true } } }, "/v/").get(id)!;
    travel.adopt(meta, texture);
  }
  const mesh = (id: string) => travel.group.children.find((m) => m.name === "flipbook-" + id) as FlipbookPool["mesh"];
  return { travel, texture, ribbon: mesh("thunder-ribbon-loop"), sparkle: mesh("thunder-sparkle") };
}
function endpoint(mesh: FlipbookPool["mesh"], i: number, sign: number) {
  return new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute("iPos"), i)
    .addScaledVector(new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute("iDir"), i), sign);
}
const order = (mesh: FlipbookPool["mesh"]) => Array.from({ length: mesh.geometry.instanceCount }, (_, i) => i)
  .sort((a, b) => mesh.geometry.getAttribute("iData").getX(a) - mesh.geometry.getAttribute("iData").getX(b));
const tip = (mesh: FlipbookPool["mesh"]) => endpoint(mesh, order(mesh).at(-1)!, 0.5);
const head = (mesh: FlipbookPool["mesh"]) => {
  const i = Array.from({ length: mesh.geometry.instanceCount }, (_, k) => k).find((k) => Math.abs(mesh.geometry.getAttribute("iData").getX(k) - 0.32) < 1e-5)!;
  return new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute("iPos"), i);
};
const close = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-5);
afterEach(() => vi.restoreAllMocks());

describe("R3-2 authored Thunder guide", () => {
  it("launches its bright head from the hand, reaches the sky at 120 ms and the summit at 180 ms", () => {
    const f = fixture(); f.travel.cast(target);
    expect(f.ribbon.geometry.instanceCount).toBe(0);
    close(head(f.sparkle), hand);
    f.travel.update(THUNDER_GUIDE_RISE_S / 2);
    close(endpoint(f.ribbon, 0, -0.5), hand);
    close(tip(f.ribbon), hand.clone().lerp(sky, 0.5));
    f.travel.update(THUNDER_GUIDE_RISE_S / 2);
    close(tip(f.ribbon), sky);
    f.travel.update(THUNDER_GUIDE_FLIGHT_S - THUNDER_GUIDE_RISE_S);
    close(tip(f.ribbon), new THREE.Vector3(target.x, 8, target.z));
    expect(f.ribbon.geometry.instanceCount).toBeLessThanOrEqual(13);
    // Every segment remains on a leg; no diagonal shortcut across the corner.
    const sorted = order(f.ribbon);
    for (let k = 0; k < sorted.length; k++) {
      const i = sorted[k]!, a = endpoint(f.ribbon, i, -0.5), b = endpoint(f.ribbon, i, 0.5);
      expect(Math.abs(a.y - b.y) < 1e-5 || (Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.z - b.z) < 1e-5)).toBe(true);
      if (k > 0) close(a, endpoint(f.ribbon, sorted[k - 1]!, 0.5));
    }
  });

  it("tapers width and brightness toward the tail, and shares existing art in a single ribbon draw", () => {
    const f = fixture(); f.travel.cast(target); f.travel.update(THUNDER_GUIDE_FLIGHT_S);
    const data = f.ribbon.geometry.getAttribute("iData"), colours = f.ribbon.geometry.getAttribute("iColor");
    expect(data.getX(order(f.ribbon)[0]!)).toBeLessThan(0.15);
    expect(data.getX(order(f.ribbon).at(-1)!)).toBeGreaterThanOrEqual(0.5);
    const sorted = order(f.ribbon);
    for (let k = 0; k < sorted.length; k++) {
      const i = sorted[k]!, previous = sorted[Math.max(0, k - 1)]!;
      expect(data.getX(i)).toBeLessThanOrEqual(THUNDER_GUIDE_WIDTH);
      if (k > 0) { expect(data.getX(i)).toBeGreaterThanOrEqual(data.getX(previous)); expect(data.getW(i)).toBeGreaterThanOrEqual(data.getW(previous)); }
      expect(Math.max(colours.getX(i), colours.getY(i), colours.getZ(i))).toBeLessThanOrEqual(0.9);
    }
    expect(f.ribbon.material.uniforms.uMap!.value).toBe(f.texture);
    expect(f.travel.group.children.filter((m) => m.visible)).toHaveLength(2);
    expect(f.travel.group.children.map((m) => m.name)).toEqual(["flipbook-thunder-ribbon-loop", "flipbook-thunder-sparkle", "flipbook-thunder-charge"]);
  });

  it("holds for a stalled strike, removes the old guide on the hit frame, and restarts at the hand on recast", () => {
    const f = fixture(); f.travel.cast(target); f.travel.update(1);
    expect(f.ribbon.visible).toBe(true);
    f.travel.strike(); expect(f.ribbon.visible).toBe(false); expect(f.ribbon.geometry.instanceCount).toBe(0);
    f.travel.cast(target); expect(f.ribbon.geometry.instanceCount).toBe(0);
    close(head(f.sparkle), hand);
    f.travel.clear(); expect(f.travel.group.children.some((m) => m.visible)).toBe(false);
  });

  it("keeps perspective endpoints attached after camera movement", () => {
    const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 300);
    camera.position.set(0, 26, 14); camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true);
    const f = fixture(camera), source = new THREE.Group(); f.travel.cast(target); f.travel.update(THUNDER_GUIDE_RISE_S / 2);
    camera.position.x += 4; camera.lookAt(0, 0, -6); camera.updateMatrixWorld(true); f.travel.present(source);
    const actual = tip(f.ribbon).project(camera);
    const expected = hand.clone().lerp(sky, 0.5).project(camera);
    expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1e-5);
  });

  it("reuses warm buffers, vectors and options without allocating in hot methods", () => {
    const f = fixture(), attrs = f.ribbon.geometry.attributes, opts = new Set<FlipOptions>(), vectors = new Set<THREE.Vector3>();
    const spawn = FlipbookPool.prototype.spawn;
    vi.spyOn(FlipbookPool.prototype, "spawn").mockImplementation(function (this: FlipbookPool, at, size, options) {
      if (this.mesh.parent === f.travel.group) { opts.add(options!); vectors.add(at); }
      spawn.call(this, at, size, options);
    });
    f.travel.cast(target); for (let i = 0; i < 60; i++) f.travel.update(1 / 60);
    expect(opts.size).toBe(1); expect(vectors.size).toBe(1); expect(f.ribbon.geometry.attributes).toBe(attrs);
    const code = readFileSync(new URL("../../src/lab/thunder-travel-r2.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("travel.ts", code, ts.ScriptTarget.Latest, true), allocations: string[] = [];
    function check(node: ts.Node) {
      if (ts.isNewExpression(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node)) allocations.push(node.getText(tree));
      ts.forEachChild(node, check);
    }
    function visit(node: ts.Node) {
      if (ts.isMethodDeclaration(node) && node.name.getText(tree) !== "adopt") { if (node.body) check(node.body); }
      else ts.forEachChild(node, visit);
    }
    visit(tree); expect(allocations).toEqual([]);
  });
});
