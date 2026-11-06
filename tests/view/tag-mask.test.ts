import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { FlipbookPool } from "../../src/view/skills/flipbook";
import { SpritePool } from "../../src/view/skills/fxkit";
import { TAG_KEEP, TAG_UNIFORMS, TagMask, withTagMask } from "../../src/view/skills/tag-mask";

/** lab-readability (06/11): skills keep only TAG_KEEP of their light behind a word tag, full light elsewhere. */

const mask = new TagMask();
afterEach(() => mask.dispose());

describe("the word-tag mask", () => {
  it("wraps a fragment shader once: its body runs first, then its colour keeps vxTagKeep()", () => {
    const src = "uniform float k;\nvoid main() {\n  gl_FragColor = vec4(k);\n}";
    const out = withTagMask(src);
    expect(out).toContain("void vxTagMain() {");
    expect(out.match(/void main\(\) \{/g)).toHaveLength(1);
    expect(out).toContain("gl_FragColor.rgb *= vxTagKeep();");
    expect(out.indexOf("vxTagMain();")).toBeGreaterThan(out.indexOf("float vxTagKeep()"));
    expect(() => withTagMask("void notMain() {}")).toThrow();
  });

  it("is in the flipbook and sprite materials, sharing one set of uniforms", () => {
    const pool = new FlipbookPool("t", "fire", 2, 12, new THREE.Texture());
    const sprites = new SpritePool(4, new THREE.Texture(), "add");
    const m = sprites.mesh.material as THREE.ShaderMaterial;
    for (const mat of [pool.mesh.material, m]) {
      expect(mat.fragmentShader).toContain("vxTagKeep()");
      expect(mat.uniforms.uTagMask).toBe(TAG_UNIFORMS.uTagMask);
      expect(mat.uniforms.uTagK).toBe(TAG_UNIFORMS.uTagK);
    }
  });

  it("paints the boxes (padded, rows from the bottom) and keeps full light without tags", () => {
    mask.paint([{ x: 80, y: 0, w: 40, h: 16 }], 160, 80, 320, 160);
    const k = TAG_UNIFORMS.uTagK.value;
    expect(k.x).toBe(TAG_KEEP);
    expect(k.y).toBeCloseTo(1 / 320);
    expect(k.z).toBeCloseTo(1 / 160);
    const tex = TAG_UNIFORMS.uTagMask.value as THREE.DataTexture;
    const { width, height, data } = tex.image as { width: number; height: number; data: Uint8Array };
    expect([width, height]).toEqual([20, 10]);
    const at = (cx: number, cy: number): number => data[(height - 1 - cy) * width + cx]!;
    // The box spans CSS x 74–126, y 0–22 with its pad: cells 9–15, rows 0–2 from the top.
    expect(at(12, 0)).toBe(255);
    expect(at(9, 2)).toBe(255);
    expect(at(15, 1)).toBe(255);
    expect(at(8, 1)).toBe(0);
    expect(at(16, 1)).toBe(0);
    expect(at(12, 3)).toBe(0);
    mask.paint([], 160, 80, 320, 160);
    expect(TAG_UNIFORMS.uTagK.value.x).toBe(1);
    mask.paint([{ x: 0, y: 0, w: 10, h: 10 }], 160, 80, 320, 160);
    mask.off();
    expect(TAG_UNIFORMS.uTagK.value.x).toBe(1);
  });
});
