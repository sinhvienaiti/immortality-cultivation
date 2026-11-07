import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabHerd } from "../../src/lab/herd";
import { ThunderBodyReaction, THUNDER_BODY_RETURN_S, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S } from "../../src/lab/thunder-impact-r2";
import { aimClipSkill, KEY8_SKILLS } from "../../src/lab/clip-skills";
import { thunderCasterR2Enabled } from "../../src/lab/thunder-caster-r2";

afterEach(() => vi.restoreAllMocks());
const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
function pose(body: ThunderBodyReaction, dt: number, height = 2): void {
  p.set(0, 0, 0); q.identity(); s.set(1, 1, 1); body.apply(0, dt, height, p, q, s);
}
async function herdFixture() {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()));
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue({ scene } as never);
  const herd = new LabHerd(); await herd.load();
  return herd;
}

describe("Thunder R3 body reaction", () => {
  it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [3, 4], [0, 0]])("tips away from (%s,%s), 12° on H0 and 20° at peak", (dx, dz) => {
    const body = new ThunderBodyReaction(1); body.strike(0, dx, dz); pose(body, 0);
    expect(q.angleTo(new THREE.Quaternion()) * 180 / Math.PI).toBeCloseTo(12);
    const top = new THREE.Vector3(0, 2, 0).applyQuaternion(q);
    if (dx !== 0 || dz !== 0) expect(top.x * dx + top.z * dz).toBeGreaterThan(0);
    else expect(top.z).toBeLessThan(0);
    pose(body, 0.05);
    expect(q.angleTo(new THREE.Quaternion()) * 180 / Math.PI).toBeCloseTo(20);
    expect(p.x).toBe(0); expect(p.z).toBe(0);
  });

  it.each([0.5, 2, 4])("crouches then rebounds within 80 ms, sized to a %s m body; settles completely", (height) => {
    const body = new ThunderBodyReaction(1); body.strike(0, 1, 0);
    pose(body, 0.025, height); expect(s.y).toBeCloseTo(0.84); expect(p.y).toBe(0);
    pose(body, 0.055, height); expect(s.y).toBeCloseTo(1.06); expect(p.y).toBeCloseTo(height * 0.1);
    expect(s.x * s.y * s.z).toBeCloseTo(1);
    pose(body, THUNDER_BODY_RETURN_S - 0.08, height);
    expect(p.length()).toBe(0); expect(q.angleTo(new THREE.Quaternion())).toBe(0); expect(s.toArray()).toEqual([1, 1, 1]);
    pose(body, 1, height); expect(q.w).toBe(1);
  });

  it("samples the same pose at 30, 60 and 120 Hz", () => {
    const matrices: number[][] = [];
    for (const hz of [30, 60, 120]) {
      const body = new ThunderBodyReaction(1); body.strike(0, -2, 3);
      for (let frame = 0; frame < hz / 5; frame++) pose(body, 1 / hz);
      matrices.push(new THREE.Matrix4().compose(p, q, s).toArray());
    }
    matrices[0]!.forEach((v, i) => { expect(matrices[1]![i]).toBeCloseTo(v, 10); expect(matrices[2]![i]).toBeCloseTo(v, 10); });
  });

  it("draws on the hit frame through the existing herd instances, during stun, without changing hit results", async () => {
    const herd = await herdFixture(), old = await herdFixture();
    const skill = KEY8_SKILLS.find((v) => v.id === "pillar-thunder-single")!;
    const aim = aimClipSkill(skill, herd, { x: 0, z: 3 }, { x: 0, z: -6 });
    const i = aim.hits.find((h) => herd.tier(h.i) === 2)!.i;
    const meshes = herd.group.children as THREE.InstancedMesh[];
    const buffers = meshes.map((m) => m.instanceMatrix.array);
    const read = () => buffers.map((b) => Array.from(b));
    const before = read();
    const h = aim.hits.find((v) => v.i === i)!;
    expect(h.dx * (herd.x(i) - aim.anchor.x) + h.dz * (herd.z(i) - aim.anchor.z)).toBeGreaterThanOrEqual(0);
    const killed = herd.hit(i, h.dx, h.dz, 0.5, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S);
    expect(killed).toBe(old.hit(i, h.dx, h.dz, 0.5, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S));
    herd.thunderImpact(i, h.dx, h.dz); herd.holdBeast(i, 2); old.holdBeast(i, 2);
    expect(read()).toEqual(before); // Hit dispatch is after the first herd draw.
    herd.update(0); old.update(0); // skills-main flushes once after all clip blows on this frame.
    expect(read()).not.toEqual(before); expect(read()).not.toEqual(old.group.children.map((m) => Array.from((m as THREE.InstancedMesh).instanceMatrix.array)));
    for (let f = 0; f < Math.round(THUNDER_BODY_RETURN_S * 60); f++) { herd.update(1 / 60); old.update(1 / 60); }
    meshes.forEach((m, k) => {
      expect(m.instanceMatrix.array).toBe(buffers[k]);
      Array.from(m.instanceMatrix.array).forEach((v, n) => expect(v).toBeCloseTo((old.group.children[k] as THREE.InstancedMesh).instanceMatrix.array[n]!, 5));
    });
    // No extra damage; death follows the existing dissolve and cancels the added pose.
    expect(herd.hit(i, h.dx, h.dz, 1, THUNDER_HIT_RGB)).toBe(old.hit(i, h.dx, h.dz, 1, THUNDER_HIT_RGB));
    herd.thunderImpact(i, h.dx, h.dz); herd.hit(i, h.dx, h.dz, 1, THUNDER_HIT_RGB); herd.thunderImpact(i, 0, 1);
    old.hit(i, h.dx, h.dz, 1, THUNDER_HIT_RGB);
    herd.update(0); old.update(0);
    expect(read()).toEqual(old.group.children.map((m) => Array.from((m as THREE.InstancedMesh).instanceMatrix.array)));
  });

  it("keeps the existing Thunder rim for 0.1 s and resets body poses on respawn", async () => {
    const herd = await herdFixture();
    herd.hit(0, 1, 0, 0.1, THUNDER_HIT_RGB, THUNDER_HIT_RIM_S); herd.thunderImpact(0, 1, 0); herd.update(0);
    const rims = herd.group.children.map((m) => (m as THREE.Mesh).geometry.getAttribute("iRim"));
    expect(rims.some((a) => Array.from(a.array).some((v) => v > 0))).toBe(true);
    for (let f = 0; f < 7; f++) herd.update(1 / 60);
    herd.update(0); expect(rims.every((a) => Array.from(a.array).every((v) => v === 0))).toBe(true);
    herd.respawnAll(); herd.update(0);
    const pristine = await herdFixture();
    for (let f = 0; f < 7; f++) pristine.update(1 / 60);
    herd.group.children.forEach((m, k) => expect((m as THREE.InstancedMesh).instanceMatrix.array).toEqual((pristine.group.children[k] as THREE.InstancedMesh).instanceMatrix.array));
  });

  it("gates the host reaction on tp2 and survives only in the unchanged blow path; hot methods allocate nothing", () => {
    expect(thunderCasterR2Enabled("")).toBe(false); expect(thunderCasterR2Enabled("?tp2=0")).toBe(false); expect(thunderCasterR2Enabled("?tp2=1")).toBe(true);
    const main = readFileSync(new URL("../../src/lab/skills-main.ts", import.meta.url), "utf8");
    expect(main).toContain('skill.id === "pillar-thunder-single" && thunderFive.impactR2 !== null');
    expect(main).toMatch(/const killed = herd.hit\([^;]+;\s*if \(thunderR2 && !killed\) \{[\s\S]*?herd.thunderImpact\(i, dx, dz\)/);
    expect(main).toMatch(/clipSkills9.update\(world\);\s*\/\/[^\n]*\n\s*if \(thunderBodyDirty\) \{ herd.update\(0\);/);
    const src = readFileSync(new URL("../../src/lab/thunder-impact-r2.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("reaction.ts", src, ts.ScriptTarget.Latest, true), allocations: string[] = [];
    const scan = (node: ts.Node): void => {
      if (ts.isNewExpression(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isArrowFunction(node)) allocations.push(node.getText(tree));
      ts.forEachChild(node, scan);
    };
    const body = tree.statements.find((n) => ts.isClassDeclaration(n) && n.name?.text === "ThunderBodyReaction") as ts.ClassDeclaration;
    for (const m of body.members) if (ts.isMethodDeclaration(m) && m.body) scan(m.body);
    expect(allocations).toEqual([]);
  });
});
