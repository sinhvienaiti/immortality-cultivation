/**
 * Word tags stay readable over the skills (tags ≥ 7:1 at all times) without dimming the skills: a screen-space mask
 * of the tags' boxes, low resolution with soft edges, that the VFX materials (FlipbookPool, SpritePool) read through
 * gl_FragCoord to keep only TAG_KEEP of their own light behind a tag. The rest of the skill keeps its full light.
 * Inert (keep 1) until a tag layer paints it; lab-readability, 06/11.
 */
import * as THREE from "three";

/** The share of a skill's light kept behind a word tag (the lab's default; tags.keep overrides it). */
export const TAG_KEEP = 0.3;
/** Mask cells: one per CELL_PX CSS px (linear filtering softens the edges over about one cell). */
const CELL_PX = 8;
/** A tag's box grows this much (CSS px) on every side before it is painted. */
const PAD_PX = 6;

const clear = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
clear.needsUpdate = true;

/** Shared by every material that reads the mask (one update reaches them all). x: light kept, yz: 1 / target px. */
export const TAG_UNIFORMS = {
  uTagMask: { value: clear as THREE.Texture },
  uTagK: { value: new THREE.Vector3(1, 1, 1) },
};

/** `vxTagKeep()`: 1 away from tags, the kept share inside them (soft at the edges). */
export const TAG_MASK_GLSL = /* glsl */ `
uniform sampler2D uTagMask;
uniform vec3 uTagK;
float vxTagKeep() {
  if (uTagK.x >= 0.999) return 1.0;
  return mix(1.0, uTagK.x, texture2D(uTagMask, gl_FragCoord.xy * uTagK.yz).r);
}`;

/**
 * Wraps a fragment shader so everything it writes keeps only vxTagKeep() of its colour (premultiplied output: its
 * light, never its coverage, so what it darkens stays dark).
 */
export function withTagMask(fragment: string): string {
  const anchor = "void main() {";
  const at = fragment.lastIndexOf(anchor);
  if (at < 0 || fragment.indexOf(anchor) !== at) throw new Error("[tag-mask] fragment shader has no single main()");
  return fragment.slice(0, at) + "void vxTagMain() {" + fragment.slice(at + anchor.length) +
    TAG_MASK_GLSL + "\nvoid main() {\n  vxTagMain();\n  gl_FragColor.rgb *= vxTagKeep();\n}\n";
}

/** The shader `withTagMask` wrapped (tests: the legacy body stays byte for byte). */
export function unwrapTagMask(fragment: string): string {
  const tail = TAG_MASK_GLSL + "\nvoid main() {\n  vxTagMain();\n  gl_FragColor.rgb *= vxTagKeep();\n}\n";
  if (!fragment.endsWith(tail)) throw new Error("[tag-mask] not a tag-masked shader");
  return fragment.slice(0, -tail.length).replace("void vxTagMain() {", "void main() {");
}

export interface TagBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The mask's painter: the tags' boxes (CSS px) each frame. */
export class TagMask {
  private texture: THREE.DataTexture | null = null;
  private data = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  /** The share of light kept behind a tag (1: off). */
  keep = TAG_KEEP;

  /** Paints `boxes` over a `width` × `height` CSS px view drawn into a `bufW` × `bufH` px target. */
  paint(boxes: readonly TagBox[], width: number, height: number, bufW: number, bufH: number): void {
    const cols = Math.max(1, Math.ceil(width / CELL_PX));
    const rows = Math.max(1, Math.ceil(height / CELL_PX));
    if (this.texture === null || cols !== this.cols || rows !== this.rows) {
      this.texture?.dispose();
      this.cols = cols;
      this.rows = rows;
      this.data = new Uint8Array(cols * rows);
      this.texture = new THREE.DataTexture(this.data, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
      this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
    }
    const d = this.data;
    d.fill(0);
    for (const b of boxes) {
      const x0 = Math.max(0, Math.floor((b.x - PAD_PX) / CELL_PX));
      const x1 = Math.min(cols - 1, Math.floor((b.x + b.w + PAD_PX) / CELL_PX));
      const y0 = Math.max(0, Math.floor((b.y - PAD_PX) / CELL_PX));
      const y1 = Math.min(rows - 1, Math.floor((b.y + b.h + PAD_PX) / CELL_PX));
      // gl_FragCoord counts rows from the bottom.
      for (let y = y0; y <= y1; y += 1) d.fill(255, (rows - 1 - y) * cols + x0, (rows - 1 - y) * cols + x1 + 1);
    }
    this.texture.needsUpdate = true;
    TAG_UNIFORMS.uTagMask.value = this.texture;
    // gl_FragCoord is in target px; the mask spans the CSS view, so both scale by the target's size.
    TAG_UNIFORMS.uTagK.value.set(boxes.length > 0 ? this.keep : 1, 1 / Math.max(1, bufW), 1 / Math.max(1, bufH));
  }

  /** No tags: every material back to its full light. */
  off(): void {
    TAG_UNIFORMS.uTagK.value.x = 1;
  }

  dispose(): void {
    this.off();
    TAG_UNIFORMS.uTagMask.value = clear;
    this.texture?.dispose();
    this.texture = null;
  }
}
