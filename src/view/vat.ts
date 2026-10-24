/**
 * Vertex animation textures (canon §20.3, PB-34): position + normal RGBA16F;
 * texel = frame × vertices + vertex, wrapped in a 1 024 or 2 048 wide
 * texture; 2-frame interpolation, 0.15 s blend of two clips; loads baked
 * `.vat.bin` + JSON from public/assets (never in Git); an in-page baker for
 * the placeholder blocks.
 * Owner: Lane 1 (milestone 1b). TODO(lane-1).
 */

/** Linear texel of `vertex` at `frame` (canon §20.3: frame × vertices + vertex). */
export function texelIndex(_frame: number, _vertex: number, _vertices: number): number {
  throw new Error("TODO(lane-1): view/vat.ts texelIndex");
}

/** [column, row] of a linear texel in a texture `width` wide. */
export function texelAt(_index: number, _width: 1024 | 2048): readonly [column: number, row: number] {
  throw new Error("TODO(lane-1): view/vat.ts texelAt");
}
