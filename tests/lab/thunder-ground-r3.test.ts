import * as THREE from "three";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ThunderAftermathR2, THUNDER_MARK_START_S, THUNDER_MARK_ERODE_START_S, THUNDER_AFTERMATH_END_S, THUNDER_SPARK_END_S } from "../../src/lab/thunder-aftermath-r2";
import { THUNDER_PILLAR_TAIL_S } from "../../src/lab/thunder-travel-r2";
import { FlipbookPool, parseFlipbookManifest } from "../../src/view/skills/flipbook";
import { layFlat } from "../../src/view/skills/element-clips";

const target = new THREE.Vector3(2, 0, -6);
const meta = (id: string) => parseFlipbookManifest({ flipbooks: { [id]: {
  file: id + ".png", mode: "fire", role: "groundMark", cols: 8, rows: 8, frames: 41, fps: 8, cell: [512, 288],
} } }, "/v/").get(id)!;
function fixture() {
  const parent = new THREE.Group(), source = new THREE.Group(), texture = new THREE.Texture();
  source.name = "fx-clip-skill-marks"; parent.add(source);
  const mark = new FlipbookPool("thunder-ground-mark", "fire", 24, 4, texture);
  mark.attach(meta("thunder-ground-mark"), texture); layFlat(mark); source.add(mark.mesh);
  const fx = new ThunderAftermathR2(parent); fx.adopt(meta("thunder-sparkle"), texture);
  const spawn = (at = target) => mark.spawn(at, 4, { life: 4, rate: 0, span: 4, alpha: 0.7 });
  const step = (dt: number) => { fx.update(dt); mark.update(dt); fx.present(); };
  fx.cast(target); spawn(); fx.strike(); step(0);
  return { fx, mark, texture, spawn, step, sparks: fx.group.children[0] as FlipbookPool["mesh"] };
}

describe("R3-3 cold Thunder ground mark", () => {
  it.each([30, 60, 120])("reveals only after the pillar retracts, then outlives sparse electricity at %i Hz", (hz) => {
    expect(THUNDER_MARK_START_S).toBe(THUNDER_PILLAR_TAIL_S);
    expect(THUNDER_AFTERMATH_END_S - THUNDER_MARK_ERODE_START_S).toBeGreaterThanOrEqual(1.2);
    expect(THUNDER_AFTERMATH_END_S - THUNDER_MARK_ERODE_START_S).toBeLessThanOrEqual(2);
    const f = fixture(), data = f.mark.mesh.geometry.getAttribute("iData");
    let coldOnly = 0;
    for (let frame = 0; frame <= 3 * hz; frame++) {
      if (frame > 0) f.step(1 / hz);
      const age = frame / hz;
      if (age <= THUNDER_MARK_START_S + 1e-8 || age >= THUNDER_AFTERMATH_END_S - 1e-8) expect(data.getW(0)).toBeLessThan(1e-6);
      else expect(data.getW(0)).toBeGreaterThan(0);
      if (age > THUNDER_SPARK_END_S + 0.02 && age < THUNDER_AFTERMATH_END_S - 0.1) {
        expect(f.sparks.visible).toBe(false); expect(data.getW(0)).toBeGreaterThan(0.8); coldOnly++;
      }
    }
    expect(coldOnly).toBeGreaterThan(hz / 2);
  });

  it("holds a flat footprint while the authored outer branches erode; violet cools without the orange burn ramp", () => {
    const f = fixture(), g = f.mark.mesh.geometry, data = g.getAttribute("iData"), colours = g.getAttribute("iColor");
    f.step(0.75);
    const size = data.getX(0), alpha = data.getW(0), first = data.getZ(0), blue = colours.getZ(0);
    expect(first).toBeCloseTo(32); expect(size).toBeGreaterThan(4);
    expect(g.getAttribute("iLift").getY(0)).toBe(size);
    expect(g.getAttribute("iPos").getX(0)).toBe(target.x); expect(g.getAttribute("iPos").getZ(0)).toBe(target.z);
    const shader = { vertexShader: f.mark.mesh.material.vertexShader };
    f.mark.mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("iPos + vec3(corner.x, 0.0, corner.y)");
    expect(f.mark.mesh.material.customProgramCacheKey()).toBe("element-ground-card");
    f.step(1.2);
    expect(data.getX(0)).toBe(size); expect(g.getAttribute("iLift").getY(0)).toBe(size);
    expect(data.getW(0)).toBe(alpha); expect(data.getZ(0)).toBeGreaterThan(first);
    expect(data.getZ(0)).toBeLessThan(40); expect(colours.getZ(0)).toBeLessThan(blue);
    expect(colours.getZ(0)).toBeGreaterThan(colours.getX(0));
    expect(colours.getX(0)).toBeGreaterThan(colours.getY(0));
    expect(g.getAttribute("iAge").getY(0)).toBe(0);
    expect(f.mark.mesh.material.uniforms.uMap!.value).toBe(f.texture);
  });

  it.each([0.65, 0.015])("retains contrast over a ground value of %f using the existing fire blend", (ground) => {
    const f = fixture(); f.step(0.75);
    const g = f.mark.mesh.geometry, c = g.getAttribute("iColor"), opacity = g.getAttribute("iData").getW(0);
    const occlusion = g.getAttribute("iDir").getW(0) * opacity;
    // A bright painted fissure: One / OneMinusSrcAlpha, as in FlipbookPool's fire material.
    const red = c.getX(0) * opacity + ground * (1 - occlusion);
    const blue = c.getZ(0) * opacity + ground * (1 - occlusion);
    expect(blue).toBeGreaterThan(red);
    if (ground > 0.5) expect(blue).toBeLessThan(ground - 0.1);
    else expect(blue).toBeGreaterThan(ground + 0.1);
    expect(f.mark.mesh.material.blendSrc).toBe(THREE.OneFactor);
    expect(f.mark.mesh.material.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
  });

  it("retires an owned mark on recast/reset and preserves another spell in the shared pool", () => {
    const f = fixture(), other = new THREE.Vector3(8, 0, 8);
    f.spawn(other); f.step(0.75);
    const data = f.mark.mesh.geometry.getAttribute("iData");
    expect(data.getW(0)).toBeGreaterThan(0.8); expect(data.getW(1)).toBeCloseTo(0.7);
    const next = new THREE.Vector3(-2, 0, -6);
    f.fx.cast(next); f.spawn(next); f.step(0);
    expect(data.getW(0)).toBe(0); expect(data.getW(1)).toBeCloseTo(0.7); expect(data.getW(2)).toBe(0);
    f.fx.strike(); f.step(0); f.step(0.75);
    expect(data.getW(2)).toBeGreaterThan(0.8);
    f.fx.clear(); f.step(0);
    expect(data.getW(0)).toBe(0); expect(data.getW(1)).toBeCloseTo(0.7); expect(data.getW(2)).toBe(0);
  });

  it("keeps the same buffers and draw pools, with no hot-path allocations", () => {
    const f = fixture(), attrs = f.mark.mesh.geometry.attributes, children = f.fx.group.children.length;
    for (let frame = 0; frame < 180; frame++) f.step(1 / 60);
    expect(f.mark.mesh.geometry.attributes).toBe(attrs); expect(f.fx.group.children).toHaveLength(children);
    const text = readFileSync(new URL("../../src/lab/thunder-aftermath-r2.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("aftermath.ts", text, ts.ScriptTarget.Latest, true), allocations: string[] = [];
    function scan(n: ts.Node) {
      if (ts.isNewExpression(n) || ts.isArrayLiteralExpression(n) || ts.isObjectLiteralExpression(n) || ts.isArrowFunction(n)) allocations.push(n.getText(tree));
      ts.forEachChild(n, scan);
    }
    function visit(n: ts.Node) {
      if (ts.isMethodDeclaration(n) && n.name.getText(tree) !== "adopt") { if (n.body) scan(n.body); }
      else ts.forEachChild(n, visit);
    }
    visit(tree); expect(allocations).toEqual([]);
  });
});
