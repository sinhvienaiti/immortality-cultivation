import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIRE_LAB } from "../../src/view/skills/element-fire";
import { FlameSlash } from "../../src/view/skills/flame-slash";

describe("Fire key 7 finisher strip", () => {
  let slash: FlameSlash;
  beforeEach(() => { slash = new FlameSlash(); });
  afterEach(() => { slash.dispose(); });

  it("samples the authored strip in its own branch and preserves the legacy tongue calculations", () => {
    const fragment = slash.mesh.material.fragmentShader;
    const branches = fragment.match(/if \(uHasStrip > 0\.5\) \{([\s\S]*?)\n  \} else \{([\s\S]*?)\n  \}/);
    expect(branches).not.toBeNull();
    const strip = branches![1]!;
    const old = branches![2]!;
    expect(strip).toContain("texture2D(tStrip, vec2(us, vs))");
    expect(strip).toContain("float us = s * uStripK - uTime * uStripScroll;");
    expect(strip).not.toMatch(/tongue|fsHash1/);
    // Exact expressions from 5de0d22, including the old contribution to heat.
    const legacy = `
      float dOut = (abs(v - centre) - edgeW) / max(edgeW, 0.1);
      float sec = s * 96.0 + dOut * 0.22;
      float id = floor(sec);
      float fs = fract(sec) - 0.5;
      float len = mix(0.8, 2.4, fsHash1(id * 1.7 + (v > centre ? 31.0 : 0.0))) * (0.86 + 0.14 * sin(uTime * 13.0 + id * 2.3)) * env;
      float tt = dOut / max(len, 1e-3);
      fs -= sin(tt * 3.0 + id * 1.7) * 0.14 * tt;
      float hw = mix(0.47, 0.0, smoothstep(0.0, 1.0, tt));
      float tongue = step(0.0, tt) * (1.0 - smoothstep(0.9, 1.0, tt)) * (1.0 - smoothstep(hw - 0.08, hw, abs(fs)));
      heat = max(body * (0.5 + 0.22 * (1.0 - smoothstep(0.3, 0.95, rel)) + 0.3 * spine) * (0.96 + 0.06 * n), tongue * behind * mix(0.72, 0.3, tt)) + head * 0.3 * (1.0 - smoothstep(0.25, 0.6, rel));
    `;
    const statements = (s: string): string => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, "");
    expect(statements(old)).toBe(statements(legacy));
    for (const line of [
      "float edgeW = halfW * 1.5 + 0.03;",
      "float env = smoothstep(0.0, 0.12, s) * smoothstep(1.0, 0.88, s);",
      "float behind = step(s, uHead + 0.02);",
      "heat = heat * uFade - uErode * 0.55;",
      "float edge = 0.12 + (n - 0.5) * 0.06 + uErode * 0.12;",
    ]) expect(fragment).toContain(line);
  });

  it("starts without a strip and setStrip switches its sampler and uniforms", () => {
    const u = slash.mesh.material.uniforms;
    expect(u.tStrip!.value).toBeNull();
    expect(u.uHasStrip!.value).toBe(0);
    expect(u.uStripK!.value).toBe(1);
    expect(u.uStripScroll!.value).toBe(0.5);
    const texture = new THREE.Texture();
    slash.setStrip(texture, 3, 0.5);
    expect(u.tStrip!.value).toBe(texture);
    expect(u.uHasStrip!.value).toBe(1);
    expect(u.uStripK!.value).toBe(3);
    expect(u.uStripScroll!.value).toBe(0.5);
    slash.setStrip(null, 2, 0.25);
    expect(u.tStrip!.value).toBeNull();
    expect(u.uHasStrip!.value).toBe(0);
    expect(u.uStripK!.value).toBe(2);
    expect(u.uStripScroll!.value).toBe(0.25);
    texture.dispose();
  });

  it("draws the legacy flame while the image is pending or failed, then uses the loaded strip", () => {
    const texture = new THREE.Texture();
    const u = slash.mesh.material.uniforms;
    const draw = (): void => slash.set(0, 0, 0, 1, 0, 0, 75, 1, 1, 0, null, 0);
    slash.setStrip(texture, 3, 0.5);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    expect(slash.mesh.visible).toBe(true);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    texture.image = { width: 512, height: 128 };
    draw();
    expect(u.uHasStrip!.value).toBe(1);
    expect(slash.mesh.visible).toBe(true);
    slash.setStrip(null, 3, 0.5);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    texture.dispose();
  });

  it("defaults to the strip rather than the legacy tongue comparison", () => {
    expect(FIRE_LAB.slashTongues).toBe(false);
  });
});
