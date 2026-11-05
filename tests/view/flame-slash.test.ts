import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRE_LAB } from "../../src/view/skills/element-fire";
import { FlameSlash } from "../../src/view/skills/flame-slash";

describe("Fire key 7 finisher strip", () => {
  let slash: FlameSlash;
  beforeEach(() => { slash = new FlameSlash(); });
  afterEach(() => {
    slash.dispose();
    FlameSlash.stripK = null;
    vi.unstubAllGlobals();
  });

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
      "float front = uHead + 0.02;",
      "float tornFront = front + (n - 0.5) * 0.02;",
      "float behind = uHasStrip > 0.5 ? 1.0 - smoothstep(tornFront - 0.07, tornFront, s) : step(s, front);",
      "float hotFront = uHead + 0.05;",
      "float headPulse = exp(-abs(s - uHead) * 22.0) * step(s, hotFront);",
      "float head = headPulse * body;",
      "float heatBehind = uHasStrip > 0.5 ? max(behind, headPulse) : behind;",
      "heat *= mix(0.82, 1.0, heatBehind);",
      "heat = heat * uFade - uErode * 0.55;",
      "float edge = 0.12 + (n - 0.5) * 0.06 + uErode * 0.12;",
    ]) expect(fragment).toContain(line);
    expect(fragment).not.toMatch(/step\(s,\s*uHead/);
  });

  it("starts without a strip and setStrip switches its sampler and uniforms", () => {
    const u = slash.mesh.material.uniforms;
    expect(u.tStrip!.value).toBeNull();
    expect(u.uHasStrip!.value).toBe(0);
    expect(u.uStripK!.value).toBe(5);
    expect(u.uStripScroll!.value).toBe(0.5);
    const texture = new THREE.Texture();
    slash.setStrip(texture, 0.5);
    expect(u.tStrip!.value).toBe(texture);
    expect(u.uHasStrip!.value).toBe(1);
    expect(u.uStripK!.value).toBe(5);
    expect(u.uStripScroll!.value).toBe(0.5);
    slash.setStrip(null, 0.25);
    expect(u.tStrip!.value).toBeNull();
    expect(u.uHasStrip!.value).toBe(0);
    expect(u.uStripK!.value).toBe(5);
    expect(u.uStripScroll!.value).toBe(0.25);
    texture.dispose();
  });

  it("draws the legacy flame while the image is pending or failed, then uses the loaded strip", () => {
    const texture = new THREE.Texture();
    const u = slash.mesh.material.uniforms;
    const draw = (): void => slash.set(0, 0, 0, 1, 0, 0, 75, 1, 1, 0, null, 0);
    slash.setStrip(texture, 0.5);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    expect(slash.mesh.visible).toBe(true);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    texture.image = { width: 512, height: 128 };
    draw();
    expect(u.uHasStrip!.value).toBe(1);
    expect(slash.mesh.visible).toBe(true);
    slash.setStrip(null, 0.5);
    draw();
    expect(u.uHasStrip!.value).toBe(0);
    texture.dispose();
  });

  it("defaults to the strip rather than the legacy tongue comparison", () => {
    expect(FIRE_LAB.slashTongues).toBe(false);
    expect(FlameSlash.stripK).toBeNull();
  });

  const metadata = { size: [512, 128], mapping: { periodPx: 600, halfRows: 150 } };
  const loadedStrip = (): THREE.Texture => {
    const texture = new THREE.Texture();
    texture.image = { width: 512, height: 128, src: "https://lab.invalid/art-src/lab/vfx/aura/strips/strip-fire-sheath.rgba.png" };
    return texture;
  };
  const loadMetadata = async (texture: THREE.Texture, meta: unknown = metadata): Promise<void> => {
    const json = vi.fn().mockResolvedValue(meta);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json }));
    slash.setStrip(null, 0.5);
    slash.setStrip(texture, 0.5);
    slash.set(0, 0, -5, 1, 0, -5, 75, 0.5, 1, 0, null, 0);
    await vi.waitFor(() => expect(json).toHaveResolvedWith(meta));
  };

  it.each([
    { length: 2, half: 24, width: 1920, height: 1080, distance: 5 },
    { length: 6, half: 75, width: 1280, height: 720, distance: 8 },
    { length: 9, half: 40, width: 1080, height: 1920, distance: 12 },
  ])("preserves the 2:1 source period for projected length $length and half width $half", async ({ length, half, width, height, distance }) => {
    const texture = loadedStrip();
    await loadMetadata(texture);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    const uniforms = slash.mesh.material.uniforms;
    (uniforms.uView!.value as THREE.Vector2).set(width, height);
    const draw = (span: number, halfWidth = half): number => {
      slash.set(0, 0, -distance, span, span * 0.25, -distance, halfWidth, 0.5, 1, 0, null, 0, camera);
      return uniforms.uStripK!.value as number;
    };
    const k = draw(length);
    const from = new THREE.Vector3(0, 0, -distance).project(camera);
    const to = new THREE.Vector3(length, length * 0.25, -distance).project(camera);
    const screenLength = Math.hypot((to.x - from.x) * width / 2, (to.y - from.y) * height / 2);
    // Independently integrate the analytic shader band's width over the whole unwrapped arc.
    const samples = 10000;
    let stripWidth = 0;
    for (let i = 0; i < samples; i += 1) {
      const halfBand = 0.34 * Math.sin(Math.PI * (i + 0.5) / samples);
      stripWidth += 2 * (halfBand * 1.5 + 0.03) * 2.6 * half * height / 1080 / samples;
    }
    const aspect = screenLength / k / stripWidth;
    expect(k).toBeGreaterThan(0);
    expect(aspect).toBeGreaterThanOrEqual(1.8);
    expect(aspect).toBeLessThanOrEqual(2.2);
    expect(aspect).toBeCloseTo(2, 5);
    expect(draw(length * 2)).toBeCloseTo(k * 2, 8);
    expect(draw(length, half * 2)).toBeCloseTo(k / 2, 8);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://lab.invalid/art-src/lab/vfx/aura/strips/strip-fire-sheath.json");
    texture.dispose();
  });

  it("uses five periods when projection or source dimensions cannot be measured", async () => {
    const texture = loadedStrip();
    const u = slash.mesh.material.uniforms;
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
    await loadMetadata(texture);
    const draw = (span: number, half: number, cam?: THREE.Camera, z = -5): void => slash.set(0, 0, z, span, 0, z, half, 1, 1, 0, null, 0, cam);
    draw(2, 75);
    expect(u.uStripK!.value).toBe(5);
    draw(0, 75, camera);
    expect(u.uStripK!.value).toBe(5);
    draw(2, 0, camera);
    expect(u.uStripK!.value).toBe(5);
    draw(2, 75, camera, 1);
    expect(u.uStripK!.value).toBe(5);
    draw(NaN, 75, camera);
    expect(u.uStripK!.value).toBe(5);
    await loadMetadata(texture, { mapping: { periodPx: 600, halfRows: 0 } });
    draw(2, 75, camera);
    expect(u.uStripK!.value).toBe(5);
    texture.dispose();
  });

  it("keeps five periods after a metadata failure and retries only for a new strip", async () => {
    const texture = loadedStrip();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("missing metadata")));
    slash.setStrip(texture, 0.5);
    const draw = (): void => slash.set(0, 0, -5, 2, 0, -5, 75, 1, 1, 0, null, 0, new THREE.PerspectiveCamera());
    draw();
    await Promise.resolve();
    draw();
    expect(slash.mesh.material.uniforms.uStripK!.value).toBe(5);
    expect(fetch).toHaveBeenCalledTimes(1);
    slash.setStrip(null, 0.5);
    slash.setStrip(texture, 0.5);
    draw();
    expect(fetch).toHaveBeenCalledTimes(2);
    texture.dispose();
  });

  it("applies only a finite positive lab override", () => {
    const draw = (): void => slash.set(0, 0, 0, 1, 0, 0, 75, 1, 1, 0, null, 0);
    for (const value of [2.5, 7]) {
      FlameSlash.stripK = value;
      draw();
      expect(slash.mesh.material.uniforms.uStripK!.value).toBe(value);
    }
    for (const value of [null, 0, -2, Infinity, NaN]) {
      FlameSlash.stripK = value;
      draw();
      expect(slash.mesh.material.uniforms.uStripK!.value).toBe(5);
    }
  });
});
