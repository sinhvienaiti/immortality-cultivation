/**
 * Vertex animation textures (canon §20.3, PB-34). Format: position and normal
 * in two RGBA16F textures; the texel of `vertex` at `frame` is
 * `frame × vertices + vertex`, wrapped row by row in a texture 1 024 or 2 048
 * wide (never "column = vertex": a 3 000-triangle mesh can pass 2 048 vertices
 * once its UV seams are split, over WebGL2's minimum MAX_TEXTURE_SIZE). A clip
 * table gives each clip's first frame, frame count, fps and loop flag. The
 * vertex shader reads 2 frames and interpolates; while a beast changes clip it
 * also reads the previous clip and blends the two over 0.15 s (8 reads a
 * vertex then, 4 otherwise). Sources: a baked `.vat.json` + `.vat.bin` from
 * scripts/models/blender/bake_vat.py (public/assets, never in Git), or the
 * in-page baker here, which bakes the placeholder blocks' procedural gait
 * (the crowd's procedural shader motion, per clip) into the same format.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { Gait } from "../content/types";

export type VatWidth = 1024 | 2048;

/** WebGL2's guaranteed MAX_TEXTURE_SIZE: rows past it are refused. */
export const VAT_MAX_ROWS = 2048;
/** canon §20.3: two clips blend over 0.15 s. */
export const VAT_BLEND_S = 0.15;
/** Clips the shader table holds (beasts use 4: Idle, Move, Attack, Death). */
export const VAT_MAX_CLIPS = 8;
/** Bake rate of the in-page baker (Blender bakes say their own). */
export const VAT_FPS = 30;

export interface VatClip {
  readonly name: string;
  /** First frame of the clip in the texture. */
  readonly start: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

/** One baked animation set: everything the textures and the shader need. */
export interface VatData {
  readonly vertices: number;
  /** Frames of every clip together. */
  readonly frames: number;
  readonly width: VatWidth;
  readonly rows: number;
  /** Half floats, RGBA, `width × rows × 4` (xyz, w = 1). */
  readonly positions: Uint16Array<ArrayBuffer>;
  /** Half floats, RGBA, `width × rows × 4` (xyz, w = 0). */
  readonly normals: Uint16Array<ArrayBuffer>;
  readonly clips: readonly VatClip[];
  /** Extent over every frame, model units. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** "unit": the crowd's unit body (feet at 0, 1 × 1 × 1, scaled per look); "metric": a real model in metres. */
  readonly space: "unit" | "metric";
}

/** A VAT ready to draw: its data, the rest mesh (with `aVatId`), the two textures. */
export interface VatAsset {
  readonly id: string;
  readonly data: VatData;
  readonly geometry: THREE.BufferGeometry;
  readonly positions: THREE.DataTexture;
  readonly normals: THREE.DataTexture;
  /** Where it came from: "in-page" (placeholder bake) or the baked file's URL. */
  readonly source: string;
  readonly triangles: number;
  /** Texture bytes on the GPU (both textures). */
  readonly bytes: number;
}

/** Linear texel of `vertex` at `frame` (canon §20.3: frame × vertices + vertex). */
export function texelIndex(frame: number, vertex: number, vertices: number): number {
  return frame * vertices + vertex;
}

/** [column, row] of a linear texel in a texture `width` wide (rows wrap). */
export function texelAt(index: number, width: VatWidth): readonly [column: number, row: number] {
  return [index % width, Math.floor(index / width)];
}

/** Rows a VAT needs at `width`. */
export function vatRows(vertices: number, frames: number, width: VatWidth): number {
  return Math.ceil((vertices * frames) / width);
}

/** The narrower width that keeps the rows within WebGL2's minimum (1 024, else 2 048); throws when even 2 048 cannot. */
export function chooseWidth(vertices: number, frames: number): VatWidth {
  if (vatRows(vertices, frames, 1024) <= VAT_MAX_ROWS) return 1024;
  if (vatRows(vertices, frames, 2048) <= VAT_MAX_ROWS) return 2048;
  throw new Error("vat: " + vertices + " vertices × " + frames + " frames do not fit 2048 × 2048");
}

/** Frames of a sample: absolute frames f0, f1 and the weight t of f1. */
export interface FrameSample {
  f0: number;
  f1: number;
  t: number;
}

/**
 * The two frames to read for `time` seconds into `clip` (the shader does the
 * same): a looping clip wraps from its last frame to its first, a one-shot
 * clip holds its last frame. Writes `out`.
 */
export function sampleFrames(clip: VatClip, time: number, out: FrameSample): FrameSample {
  const n = clip.frames;
  let f = Math.max(0, time) * clip.fps;
  if (clip.loop) f %= n;
  else f = Math.min(f, n - 1);
  const base = Math.floor(f);
  let next = base + 1;
  if (next >= n) next = clip.loop ? 0 : n - 1;
  out.f0 = clip.start + base;
  out.f1 = clip.start + next;
  out.t = f - base;
  return out;
}

/** Weight of the new clip `elapsed` seconds after a change (0 → 1 over VAT_BLEND_S, linear). */
export function clipBlendWeight(elapsed: number, blendS: number = VAT_BLEND_S): number {
  if (blendS <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / blendS));
}

/** A clip's length in seconds (a loop's period). */
export const clipSeconds = (clip: VatClip): number => clip.frames / clip.fps;

// ── Shader (vertex) ─────────────────────────────────────────────────────────

/**
 * Declarations: the two textures, `uVatInfo` (vertices, width, clips, 0), the
 * clip table (start, frames, fps, loop) and the vertex id attribute. Per
 * instance the crowd passes `aVatAnim` (clip, time, previous clip, previous
 * time) and the new clip's weight in `aVatBlend`.
 */
export const VAT_VERTEX_HEAD = /* glsl */ `
uniform highp sampler2D uVatPos;
uniform highp sampler2D uVatNrm;
uniform ivec4 uVatInfo;
uniform vec4 uVatClips[${VAT_MAX_CLIPS}];
attribute float aVatId;
attribute vec4 aVatAnim;
attribute float aVatBlend;
void vatFrames(float clip, float time, out int f0, out int f1, out float t) {
  vec4 c = uVatClips[clamp(int(clip + 0.5), 0, ${VAT_MAX_CLIPS - 1})];
  float n = max(c.y, 1.0);
  float f = max(time, 0.0) * c.z;
  f = c.w > 0.5 ? mod(f, n) : min(f, n - 1.0);
  float base = floor(f);
  t = f - base;
  int i0 = int(base);
  int i1 = i0 + 1;
  if (float(i1) >= n) i1 = c.w > 0.5 ? 0 : int(n) - 1;
  f0 = int(c.x + 0.5) + i0;
  f1 = int(c.x + 0.5) + i1;
}
vec4 vatFetch(highp sampler2D tex, int frame, int vertex) {
  int index = frame * uVatInfo.x + vertex;
  return texelFetch(tex, ivec2(index % uVatInfo.y, index / uVatInfo.y), 0);
}
void vatPose(float clip, float time, int vertex, out vec3 position, out vec3 normal) {
  int f0;
  int f1;
  float t;
  vatFrames(clip, time, f0, f1, t);
  position = mix(vatFetch(uVatPos, f0, vertex).xyz, vatFetch(uVatPos, f1, vertex).xyz, t);
  normal = mix(vatFetch(uVatNrm, f0, vertex).xyz, vatFetch(uVatNrm, f1, vertex).xyz, t);
}
`;

/**
 * The pose of this frame (and of the previous clip while blending) in
 * `vatPosition` and `vatNormal`.
 */
export const VAT_POSE = /* glsl */ `
int vatVertex = int(aVatId + 0.5);
vec3 vatPosition;
vec3 vatNormal;
vatPose(aVatAnim.x, aVatAnim.y, vatVertex, vatPosition, vatNormal);
if (aVatBlend < 0.999) {
  vec3 vatOldPosition;
  vec3 vatOldNormal;
  vatPose(aVatAnim.z, aVatAnim.w, vatVertex, vatOldPosition, vatOldNormal);
  vatPosition = mix(vatOldPosition, vatPosition, aVatBlend);
  vatNormal = mix(vatOldNormal, vatNormal, aVatBlend);
}
vatNormal = normalize(vatNormal + vec3(0.0, 1e-6, 0.0));
`;

/** Replaces `#include <beginnormal_vertex>` in a lit material: the pose, its normal as `objectNormal`. */
export const VAT_BEGIN_NORMAL =
  VAT_POSE +
  /* glsl */ `
vec3 objectNormal = vatNormal;
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

/** Replaces `#include <begin_vertex>` after VAT_BEGIN_NORMAL (an unlit material puts VAT_POSE first). */
export const VAT_BEGIN = /* glsl */ `
vec3 transformed = vatPosition;
`;

/** The shader uniforms of an asset (static: textures, sizes, the clip table). */
export function vatUniforms(asset: VatAsset): Record<string, THREE.IUniform> {
  const clips: THREE.Vector4[] = [];
  for (let k = 0; k < VAT_MAX_CLIPS; k += 1) {
    const clip = asset.data.clips[k];
    clips.push(clip === undefined ? new THREE.Vector4(0, 1, 1, 0) : new THREE.Vector4(clip.start, clip.frames, clip.fps, clip.loop ? 1 : 0));
  }
  return {
    uVatPos: { value: asset.positions },
    uVatNrm: { value: asset.normals },
    uVatInfo: { value: new Int32Array([asset.data.vertices, asset.data.width, asset.data.clips.length, 0]) },
    uVatClips: { value: clips },
  };
}

// ── Textures and geometry ───────────────────────────────────────────────────

function dataTexture(data: Uint16Array<ArrayBuffer>, width: number, rows: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** Adds the `aVatId` attribute (vertex index as a float) to a geometry. */
export function withVatIds(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const ids = new Float32Array(count);
  for (let k = 0; k < count; k += 1) ids[k] = k;
  geometry.setAttribute("aVatId", new THREE.BufferAttribute(ids, 1));
  return geometry;
}

/** Triangles of a geometry (indexed or not). */
function triangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return (index !== null ? index.count : geometry.getAttribute("position").count) / 3;
}

/** The asset of `data` on `geometry` (its vertex order is the VAT's). */
export function vatAsset(id: string, data: VatData, geometry: THREE.BufferGeometry, source: string): VatAsset {
  if (geometry.getAttribute("position").count !== data.vertices) throw new Error("vat: mesh has " + geometry.getAttribute("position").count + " vertices, VAT " + data.vertices);
  if (geometry.getAttribute("aVatId") === undefined) withVatIds(geometry);
  const positions = dataTexture(data.positions, data.width, data.rows);
  const normals = dataTexture(data.normals, data.width, data.rows);
  return { id, data, geometry, positions, normals, source, triangles: triangles(geometry), bytes: data.width * data.rows * 8 * 2 };
}

export function disposeVat(asset: VatAsset): void {
  asset.geometry.dispose();
  asset.positions.dispose();
  asset.normals.dispose();
}

// ── In-page baker (placeholder blocks, canon §20.3) ─────────────────────────

/** A clip to bake: its length; frames = round(seconds × fps). */
export interface ClipSpec {
  readonly name: string;
  readonly seconds: number;
  readonly loop: boolean;
}

/**
 * Writes the deformed pose of `rest` (xyz triples) for `clip` (index in the
 * spec list) at `time` seconds into `out`.
 */
export type Deform = (rest: Float32Array, out: Float32Array, clip: number, time: number) => void;

/**
 * Bakes `deform` over every clip of `specs` into a VAT on `geometry`'s
 * vertices (normals recomputed per frame). Load-time work: nothing here runs per frame.
 */
export function bakeVat(geometry: THREE.BufferGeometry, specs: readonly ClipSpec[], deform: Deform, options: { fps?: number; width?: VatWidth; space?: "unit" | "metric" } = {}): VatData {
  const fps = options.fps ?? VAT_FPS;
  const source = geometry.getAttribute("position");
  const vertices = source.count;
  const clips: VatClip[] = [];
  let frames = 0;
  for (const spec of specs) {
    const n = Math.max(1, Math.round(spec.seconds * fps));
    clips.push({ name: spec.name, start: frames, frames: n, fps, loop: spec.loop });
    frames += n;
  }
  if (clips.length > VAT_MAX_CLIPS) throw new Error("vat: at most " + VAT_MAX_CLIPS + " clips");
  const width = options.width ?? chooseWidth(vertices, frames);
  const rows = vatRows(vertices, frames, width);
  if (rows > VAT_MAX_ROWS) throw new Error("vat: " + rows + " rows at width " + width);
  const positions = new Uint16Array(width * rows * 4);
  const normals = new Uint16Array(width * rows * 4);
  const rest = new Float32Array(vertices * 3);
  for (let v = 0; v < vertices; v += 1) {
    rest[v * 3] = source.getX(v);
    rest[v * 3 + 1] = source.getY(v);
    rest[v * 3 + 2] = source.getZ(v);
  }
  // A working copy whose normals three.js recomputes per frame.
  const work = new THREE.BufferGeometry();
  const posed = new Float32Array(vertices * 3);
  const posedAttr = new THREE.BufferAttribute(posed, 3);
  work.setAttribute("position", posedAttr);
  if (geometry.getIndex() !== null) work.setIndex(geometry.getIndex());
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const half = THREE.DataUtils.toHalfFloat;
  clips.forEach((clip, c) => {
    for (let k = 0; k < clip.frames; k += 1) {
      deform(rest, posed, c, k / fps);
      posedAttr.needsUpdate = true;
      work.computeVertexNormals();
      const nrm = work.getAttribute("normal") as THREE.BufferAttribute;
      const frame = clip.start + k;
      for (let v = 0; v < vertices; v += 1) {
        const at = texelIndex(frame, v, vertices) * 4;
        for (let a = 0; a < 3; a += 1) {
          const p = posed[v * 3 + a]!;
          positions[at + a] = half(p);
          normals[at + a] = half(nrm.array[v * 3 + a]!);
          if (p < min[a]!) min[a] = p;
          if (p > max[a]!) max[a] = p;
        }
        positions[at + 3] = half(1);
        normals[at + 3] = 0;
      }
    }
  });
  work.dispose();
  return {
    vertices,
    frames,
    width,
    rows,
    positions,
    normals,
    clips,
    min: [min[0]!, min[1]!, min[2]!],
    max: [max[0]!, max[1]!, max[2]!],
    space: options.space ?? "unit",
  };
}

/** The pose of `vertex` at `frame` read back from a VAT (tests, tools). */
export function readPose(data: VatData, frame: number, vertex: number, out: THREE.Vector3): THREE.Vector3 {
  const at = texelIndex(frame, vertex, data.vertices) * 4;
  const f = THREE.DataUtils.fromHalfFloat;
  return out.set(f(data.positions[at]!), f(data.positions[at + 1]!), f(data.positions[at + 2]!));
}

/** The beast clips in the order of the local model contract (canon §21.2) and crowd CLIP ids. */
export const BEAST_CLIP_NAMES = ["Idle", "Move", "Attack", "Death"] as const;

/** Clip lengths of the placeholder bake per gait: each Move is one whole gait cycle so it loops seamlessly. */
export function placeholderClips(gait: Gait): readonly ClipSpec[] {
  const move = gait === "biped" ? 1.2 : gait === "quadruped" ? 0.6 : gait === "flyer" ? 0.8 : 0.5;
  return [
    { name: "Idle", seconds: 1.2, loop: true },
    { name: "Move", seconds: move, loop: true },
    { name: "Attack", seconds: 1, loop: true },
    { name: "Death", seconds: 1.2, loop: false },
  ];
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The placeholder gait of crowd.ts's procedural shader as a clip pose, in the
 * unit body (feet at y 0, nose +z, 1 × 1 × 1; `sizeM` turns the shader's
 * metre-sized bob into unit space). Idle breathes; Move is one gait cycle;
 * Attack lunges in its first 0.45 s; Death sinks and spreads (the shader's
 * dissolve eats the body on top).
 */
export function placeholderDeform(gait: Gait, sizeM: readonly [number, number, number], specs: readonly ClipSpec[] = placeholderClips(gait)): Deform {
  const TAU = Math.PI * 2;
  return (rest, out, clip, time) => {
    const spec = specs[clip]!;
    const p = spec.loop ? (time % spec.seconds) / spec.seconds : Math.min(1, time / spec.seconds);
    for (let v = 0; v < rest.length; v += 3) {
      let x = rest[v]!;
      let y = rest[v + 1]!;
      let z = rest[v + 2]!;
      if (clip === 0) {
        // Idle: a slow breath.
        const breath = Math.sin(TAU * p) * 0.025;
        y *= 1 + breath;
        x *= 1 - breath * 0.5;
      } else if (clip === 1) {
        if (gait === "biped") {
          x += Math.sin(TAU * p) * 0.09 * y;
          y += (Math.abs(Math.sin(TAU * p)) * 0.08) / sizeM[1];
        } else if (gait === "quadruped") {
          y += z * Math.sin(TAU * p) * 0.22 + (Math.max(0, Math.sin(TAU * p)) * 0.09) / sizeM[1];
        } else if (gait === "flyer") {
          const wing = smooth(0.12, 0.5, Math.abs(x));
          y += wing * Math.sin(TAU * 2 * p) * 0.55 + (Math.sin(TAU * p) * 0.12) / sizeM[1];
        } else {
          x += (Math.sin(TAU * 3 * p) * 0.05) / sizeM[0];
          z += (Math.cos(TAU * 2 * p) * 0.05) / sizeM[2];
          y += (Math.abs(Math.sin(TAU * 2 * p)) * 0.06) / sizeM[1];
        }
      } else if (clip === 2) {
        const lunge = Math.sin(Math.min(1, time / 0.45) * Math.PI);
        z += lunge * 0.22;
        y -= lunge * 0.06 * z;
      } else {
        const e = smooth(0, 1, p);
        y *= 1 - 0.55 * e;
        x *= 1 + 0.2 * e;
        z *= 1 + 0.2 * e;
        y += z * 0.12 * e;
      }
      out[v] = x;
      out[v + 1] = y;
      out[v + 2] = z;
    }
  };
}

// ── Baked files (scripts/models/blender/bake_vat.py) ────────────────────────

/** The JSON beside a `.vat.bin` (bake_vat.py writes it; format "ic-vat-1"). */
export interface VatFileMeta {
  readonly format: "ic-vat-1";
  readonly id: string;
  readonly vertices: number;
  readonly frames: number;
  readonly width: VatWidth;
  readonly rows: number;
  readonly triangles: number;
  readonly clips: readonly VatClip[];
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Byte ranges in the .bin: half-float positions and normals (RGBA), uint32 index, float32 uv. */
  readonly sections: {
    readonly positions: { readonly offset: number; readonly bytes: number };
    readonly normals: { readonly offset: number; readonly bytes: number };
    readonly index: { readonly offset: number; readonly count: number };
    readonly uv: { readonly offset: number; readonly count: number };
  };
  readonly bin: string;
}

/** Parses a baked VAT (meta + its binary) into data and its rest mesh (frame 0 of clip 0). */
export function parseVatFile(meta: VatFileMeta, bin: ArrayBuffer): { data: VatData; geometry: THREE.BufferGeometry } {
  if (meta.format !== "ic-vat-1") throw new Error("vat: unknown format " + String(meta.format));
  const texels = meta.width * meta.rows * 4;
  const positions = new Uint16Array(bin, meta.sections.positions.offset, texels);
  const normals = new Uint16Array(bin, meta.sections.normals.offset, texels);
  const index = new Uint32Array(bin, meta.sections.index.offset, meta.sections.index.count);
  const uv = new Float32Array(bin, meta.sections.uv.offset, meta.sections.uv.count);
  const data: VatData = { vertices: meta.vertices, frames: meta.frames, width: meta.width, rows: meta.rows, positions, normals, clips: meta.clips, min: meta.min, max: meta.max, space: "metric" };
  const rest = new Float32Array(meta.vertices * 3);
  const nrm = new Float32Array(meta.vertices * 3);
  const f = THREE.DataUtils.fromHalfFloat;
  for (let v = 0; v < meta.vertices; v += 1) {
    for (let a = 0; a < 3; a += 1) {
      rest[v * 3 + a] = f(positions[v * 4 + a]!);
      nrm[v * 3 + a] = f(normals[v * 4 + a]!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  if (uv.length === meta.vertices * 2) geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  withVatIds(geometry);
  return { data, geometry };
}

/** Loads a baked VAT from its JSON URL (the .bin sits beside it, `meta.bin`). */
export async function loadVat(url: string): Promise<VatAsset> {
  const metaResponse = await fetch(url);
  if (!metaResponse.ok) throw new Error("vat: " + url + " " + metaResponse.status);
  const meta = (await metaResponse.json()) as VatFileMeta;
  const binUrl = new URL(meta.bin, new URL(url, globalThis.location?.href ?? "http://localhost/")).href;
  const binResponse = await fetch(binUrl);
  if (!binResponse.ok) throw new Error("vat: " + binUrl + " " + binResponse.status);
  const { data, geometry } = parseVatFile(meta, await binResponse.arrayBuffer());
  return vatAsset(meta.id, data, geometry, url);
}
