import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TT_BUDGETS } from "../../src/content/rules";
import { lodBlock } from "../../src/view/crowd";
import {
  VAT_BLEND_S,
  VAT_FPS,
  VAT_MAX_CLIPS,
  VAT_MAX_ROWS,
  VAT_VERTEX_HEAD,
  bakeVat,
  chooseWidth,
  clipBlendWeight,
  clipSeconds,
  parseVatFile,
  placeholderClips,
  placeholderDeform,
  readPose,
  sampleFrames,
  texelAt,
  texelIndex,
  vatAsset,
  vatRows,
  vatUniforms,
  withVatIds,
  type FrameSample,
  type VatClip,
  type VatFileMeta,
} from "../../src/view/vat";

const HALF = 2e-3;

describe("VAT layout (canon §20.3, PB-34: texel = frame × vertices + vertex, rows wrap)", () => {
  it("indexes a texel by frame × vertices + vertex and wraps it into rows", () => {
    expect(texelIndex(0, 0, 500)).toBe(0);
    expect(texelIndex(3, 7, 500)).toBe(1507);
    expect(texelAt(1507, 1024)).toEqual([483, 1]);
    expect(texelAt(1023, 1024)).toEqual([1023, 0]);
    expect(texelAt(1024, 1024)).toEqual([0, 1]);
    expect(texelAt(5000, 2048)).toEqual([904, 2]);
    expect(vatRows(500, 4, 1024)).toBe(2);
  });

  it("never needs 'column = vertex': a 3 000-triangle mesh with split seams fits WebGL2's 2 048 minimum", () => {
    // The worst case: every triangle its own 3 vertices (9 000) over ~4.5 s of clips at 30 fps.
    const frames = Math.round(4.5 * VAT_FPS);
    const width = chooseWidth(9000, frames);
    expect(vatRows(9000, frames, width)).toBeLessThanOrEqual(VAT_MAX_ROWS);
    // 9 000 vertices alone are wider than 2 048: the old "column = vertex" layout would not fit.
    expect(9000).toBeGreaterThan(VAT_MAX_ROWS);
    expect(chooseWidth(1536, 136)).toBe(1024);
    expect(() => chooseWidth(20_000, 600)).toThrow(/do not fit/);
  });

  it("the shader reads the same texel the CPU writes", () => {
    expect(VAT_VERTEX_HEAD).toContain("int index = frame * uVatInfo.x + vertex;");
    expect(VAT_VERTEX_HEAD).toContain("ivec2(index % uVatInfo.y, index / uVatInfo.y)");
    expect(VAT_VERTEX_HEAD).toContain("uVatClips[" + VAT_MAX_CLIPS + "]");
  });
});

describe("VAT frames and clip blends (canon §20.3)", () => {
  const loop: VatClip = { name: "Move", start: 10, frames: 18, fps: 30, loop: true };
  const once: VatClip = { name: "Death", start: 40, frames: 36, fps: 30, loop: false };
  const out: FrameSample = { f0: 0, f1: 0, t: 0 };

  it("reads two frames and the weight between them", () => {
    sampleFrames(loop, 0.25 / 30, out);
    expect(out).toEqual({ f0: 10, f1: 11, t: expect.closeTo(0.25, 6) });
    sampleFrames(loop, 5.5 / 30, out);
    expect(out).toEqual({ f0: 15, f1: 16, t: expect.closeTo(0.5, 6) });
  });

  it("a loop wraps from its last frame to its first; a one-shot holds its last frame", () => {
    sampleFrames(loop, 17.5 / 30, out);
    expect([out.f0, out.f1]).toEqual([27, 10]);
    sampleFrames(loop, clipSeconds(loop) + 1 / 30, out);
    expect(out.f0).toBe(11);
    sampleFrames(once, 99, out);
    expect([out.f0, out.f1]).toEqual([75, 75]);
    sampleFrames(once, -1, out);
    expect([out.f0, out.t]).toEqual([40, 0]);
  });

  it("blends a new clip in over 0.15 s", () => {
    expect(VAT_BLEND_S).toBe(0.15);
    expect(clipBlendWeight(0)).toBe(0);
    expect(clipBlendWeight(0.075)).toBeCloseTo(0.5, 6);
    expect(clipBlendWeight(0.15)).toBe(1);
    expect(clipBlendWeight(2)).toBe(1);
    expect(clipBlendWeight(0.1, 0)).toBe(1);
  });
});

describe("in-page baker (placeholder blocks, canon §20.3)", () => {
  it("bakes the placeholder gait of every tier's LOD block within WebGL2's rows", () => {
    for (const q of ["low", "medium", "high"] as const) {
      const geometry = withVatIds(lodBlock(TT_BUDGETS[q].lodTris));
      const specs = placeholderClips("quadruped");
      const data = bakeVat(geometry, specs, placeholderDeform("quadruped", [0.7, 0.85, 1.6], specs));
      expect(data.rows).toBeLessThanOrEqual(VAT_MAX_ROWS);
      expect(data.clips.map((c) => c.name)).toEqual(["Idle", "Move", "Attack", "Death"]);
      expect(data.frames).toBe(data.clips.reduce((sum, c) => sum + c.frames, 0));
      expect(data.positions.length).toBe(data.width * data.rows * 4);
      expect(data.space).toBe("unit");
    }
  });

  it("stores each frame's pose at frame × vertices + vertex (half floats) and a seamless walk loop", () => {
    const geometry = withVatIds(lodBlock(300));
    const specs = placeholderClips("biped");
    const deform = placeholderDeform("biped", [1, 2, 0.9], specs);
    const data = bakeVat(geometry, specs, deform);
    const rest = geometry.getAttribute("position").array as Float32Array;
    const posed = new Float32Array(rest.length);
    const move = data.clips[1]!;
    const v = new THREE.Vector3();
    for (const k of [0, 5, move.frames - 1]) {
      deform(rest, posed, 1, k / move.fps);
      for (const vertex of [0, 17, data.vertices - 1]) {
        readPose(data, move.start + k, vertex, v);
        expect(v.x).toBeCloseTo(posed[vertex * 3]!, 2);
        expect(v.y).toBeCloseTo(posed[vertex * 3 + 1]!, 2);
        expect(v.z).toBeCloseTo(posed[vertex * 3 + 2]!, 2);
      }
    }
    // The Move clip is one gait cycle: the pose after the last frame is frame 0 again.
    deform(rest, posed, 1, move.frames / move.fps);
    readPose(data, move.start, 17, v);
    expect(Math.abs(v.y - posed[17 * 3 + 1]!)).toBeLessThan(HALF * 4);
    // Normals are unit length.
    const n = data.normals;
    const at = (move.start * data.vertices + 17) * 4;
    const f = THREE.DataUtils.fromHalfFloat;
    expect(Math.hypot(f(n[at]!), f(n[at + 1]!), f(n[at + 2]!))).toBeCloseTo(1, 2);
  });

  it("interpolates between two baked frames like the shader does", () => {
    const geometry = withVatIds(lodBlock(120));
    const specs = placeholderClips("quadruped");
    const deform = placeholderDeform("quadruped", [0.7, 0.85, 1.6], specs);
    const data = bakeVat(geometry, specs, deform);
    const move = data.clips[1]!;
    const sample = sampleFrames(move, 3.5 / move.fps, { f0: 0, f1: 0, t: 0 });
    const a = readPose(data, sample.f0, 9, new THREE.Vector3());
    const b = readPose(data, sample.f1, 9, new THREE.Vector3());
    const mid = a.clone().lerp(b, sample.t);
    expect(sample.t).toBeCloseTo(0.5, 6);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
  });

  it("makes an asset whose uniforms carry the clip table, the vertex count and the width", () => {
    const geometry = withVatIds(lodBlock(120));
    const specs = placeholderClips("swarm");
    const data = bakeVat(geometry, specs, placeholderDeform("swarm", [0.55, 0.5, 0.75], specs));
    const asset = vatAsset("thach-thu", data, geometry, "in-page");
    const uniforms = vatUniforms(asset);
    expect(Array.from(uniforms.uVatInfo!.value as Int32Array)).toEqual([data.vertices, data.width, 4, 0]);
    const clips = uniforms.uVatClips!.value as THREE.Vector4[];
    expect(clips.length).toBe(VAT_MAX_CLIPS);
    expect(clips[3]!.toArray()).toEqual([data.clips[3]!.start, data.clips[3]!.frames, 30, 0]);
    expect(asset.bytes).toBe(data.width * data.rows * 8 * 2);
    expect(asset.positions.type).toBe(THREE.HalfFloatType);
    expect(() => vatAsset("x", data, withVatIds(lodBlock(12)), "in-page")).toThrow(/vertices/);
  });
});

describe("baked files (scripts/models/blender/bake_vat.py, format ic-vat-1)", () => {
  it("reads the meta and binary back into the same data and the rest mesh of frame 0", () => {
    const geometry = withVatIds(lodBlock(120));
    const specs = placeholderClips("biped");
    const data = bakeVat(geometry, specs, placeholderDeform("biped", [1, 2, 0.9], specs));
    const index = geometry.getIndex()!.array;
    const uv = geometry.getAttribute("uv").array as Float32Array;
    const texels = data.width * data.rows * 4 * 2;
    const bin = new ArrayBuffer(texels * 2 + index.length * 4 + uv.length * 4);
    new Uint16Array(bin, 0, texels / 2).set(data.positions);
    new Uint16Array(bin, texels, texels / 2).set(data.normals);
    new Uint32Array(bin, texels * 2, index.length).set(index);
    new Float32Array(bin, texels * 2 + index.length * 4, uv.length).set(uv);
    const meta: VatFileMeta = {
      format: "ic-vat-1",
      id: "test",
      vertices: data.vertices,
      frames: data.frames,
      width: data.width,
      rows: data.rows,
      triangles: index.length / 3,
      clips: data.clips,
      min: data.min,
      max: data.max,
      sections: {
        positions: { offset: 0, bytes: texels },
        normals: { offset: texels, bytes: texels },
        index: { offset: texels * 2, count: index.length },
        uv: { offset: texels * 2 + index.length * 4, count: uv.length },
      },
      bin: "test.vat.bin",
    };
    const parsed = parseVatFile(meta, bin);
    expect(parsed.data.space).toBe("metric");
    expect(Array.from(parsed.data.positions.subarray(0, 64))).toEqual(Array.from(data.positions.subarray(0, 64)));
    expect(parsed.geometry.getAttribute("position").count).toBe(data.vertices);
    expect(parsed.geometry.getIndex()!.count).toBe(index.length);
    const rest = parsed.geometry.getAttribute("position");
    const v = readPose(data, 0, 5, new THREE.Vector3());
    expect([rest.getX(5), rest.getY(5), rest.getZ(5)]).toEqual([v.x, v.y, v.z]);
    expect(parsed.geometry.getAttribute("aVatId").getX(7)).toBe(7);
    expect(() => parseVatFile({ ...meta, format: "nope" as "ic-vat-1" }, bin)).toThrow(/format/);
  });
});
