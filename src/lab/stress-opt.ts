/**
 * Perf stress, round 2 (docs/work/tasks/perf-stress.md "Vòng 2", 13/11/2026): cut the cost and keep the picture. Every cut
 * is a runtime switch on the stress scene (stress.html), so the same frozen frame is drawn before and after, read back
 * whole (readPixels) and compared (PSNR) in the page. Nothing in the lab's own files changes:
 * - tight(on): flipbook cards (FlipbookPool) drawn as a mesh over the cells of their atlas that ever hold a lit or opaque
 *   texel (16 × 16 grid over the cell, union of every frame, one tile of margin plus the motion-vector reach) instead of
 *   the full quad, so the GPU skips the transparent area. The pool's shader places corners and samples from `uv`, so a
 *   sub-mesh with the same uv draws the same pixels where it covers. checkTight() proves it on the frame shown and drops
 *   any pool whose shader reads outside its cell.
 * - lod(on): the herd's meshes (actors group) swapped for a simplified copy (SimplifyModifier) that keeps the herd's
 *   per-instance attributes, used while every beast is shorter than a screen height threshold.
 * - prewarm(): Five Thunders' atlases loaded, every scene material compiled and every texture uploaded before a cast.
 * - base split and layer costs: post passes, ground light, shadow pass, ground hidden; each Five Thunders layer hidden in
 *   turn (cost and the pixels it touches, so the overlap count per pixel).
 * Dev only.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { FlipbookPool, type FlipbookMeta } from "../view/skills/flipbook";
import { bakeGround, type BakedGround } from "./ground-bake";
import { groundTextures, useGroundTextures, type GroundTexMode } from "./look";

/** Every pool's atlas, by its mesh (FlipbookPool.attach). */
const metaOf = new WeakMap<THREE.Object3D, FlipbookMeta>();
type Attach = (this: FlipbookPool, meta: FlipbookMeta, texture: THREE.Texture, controls?: unknown) => void;
const poolProto = FlipbookPool.prototype as unknown as { attach: Attach };
const attach = poolProto.attach;
poolProto.attach = function (this: FlipbookPool, meta: FlipbookMeta, texture: THREE.Texture, controls?: unknown): void {
  metaOf.set(this.mesh, meta);
  attach.call(this, meta, texture, controls);
};
/** The lab's post chain (the stage's composer), seen when it renders. */
let composer: EffectComposer | null = null;
const composerProto = EffectComposer.prototype as unknown as { render(this: EffectComposer, dt?: number): void };
const composerRender = composerProto.render;
composerProto.render = function (this: EffectComposer, dt?: number): void {
  composer = this;
  composerRender.call(this, dt);
};

const GRID = 16;
const THRESHOLD = 2; // a texel at 2/255 or more counts as drawn

interface Lab {
  perf(frames: number, dt?: number): { cpu: number[]; total: number[]; drawCalls: number; triangles: number };
  thunder(cast?: boolean, seed?: number): { ready: boolean; active: boolean };
  beastsOnScreen(): { n: number; minPx: number; maxPx: number };
}
const lab = (): Lab => window.__lab as unknown as Lab;
const med = (a: number[]): number => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
const p95 = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? 0;

interface Tight { index: THREE.BufferAttribute; position: THREE.BufferAttribute; uv: THREE.BufferAttribute; kept: number }
interface Orig { index: THREE.BufferAttribute | null; position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute }

export class StressOpt {
  scene: THREE.Scene | null = null;
  renderer: THREE.WebGLRenderer | null = null;
  camera: THREE.Camera | null = null;
  private readonly tightCache = new Map<string, Promise<Tight | null>>();
  private readonly orig = new WeakMap<THREE.BufferGeometry, Orig>();
  private readonly tightOn = new Set<THREE.Mesh>();
  /** Pools whose shader reads outside the cell (checkTight): they keep the full quad. */
  readonly bad = new Set<string>();
  private readonly lodGeo = new Map<string, { full: THREE.BufferGeometry; lod: THREE.BufferGeometry; tris: [number, number] }>();
  private readonly fullGeo = new Map<THREE.Mesh, THREE.BufferGeometry>();
  lodOn = false;
  private frozenNow: number | null = null;

  private holder: { hold: boolean } | null = null;
  private rt: THREE.WebGLRenderTarget | null = null;

  bind(scene: THREE.Scene, renderer: THREE.WebGLRenderer, holder?: { hold: boolean }): void {
    this.scene = scene;
    this.renderer = renderer;
    this.holder = holder ?? null;
  }

  // ---------- direct renders: the scene alone into a float target, nothing advances ----------

  private target(): THREE.WebGLRenderTarget {
    const gl = this.renderer!.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (this.rt === null || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: true });
    }
    return this.rt;
  }

  /**
   * The scene drawn straight into a float target (renderer.render: the lab's frame() is not called, so no layer spawns or
   * eases and no time passes; the shadow pass runs as in the game; no post chain). Two draws of the same state are equal
   * bit for bit, so a difference is the cut's alone. Returns linear HDR RGBA.
   */
  direct(read = true): Float32Array | null {
    const r = this.renderer!;
    const rt = this.target();
    const was = r.getRenderTarget();
    if (this.holder !== null) this.holder.hold = true;
    r.setRenderTarget(rt);
    r.render(this.scene!, this.camera!);
    let px: Float32Array | null = null;
    if (read) {
      px = new Float32Array(rt.width * rt.height * 4);
      r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px);
    }
    r.setRenderTarget(was);
    if (this.holder !== null) this.holder.hold = false;
    return px;
  }

  /** Exact comparison of two direct renders: identical pixels, largest difference (linear), PSNR on the 0–1 range. */
  static compareF(a: Float32Array, b: Float32Array): { identical: number; maxDiff: number; psnr: number; changedShare: number } {
    let same = 0, max = 0, se = 0, changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      let d = 0;
      for (let c = 0; c < 3; c += 1) {
        const x = Math.abs(Math.min(1, a[i + c]!) - Math.min(1, b[i + c]!));
        se += x * x;
        if (x > d) d = x;
      }
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) same += 1;
      if (d > 2 / 255) changed += 1;
      if (d > max) max = d;
    }
    const n = a.length / 4;
    const mse = se / (n * 3);
    return { identical: Math.round((same / n) * 1e6) / 1e4, maxDiff: Math.round(max * 1e4) / 1e4, psnr: mse === 0 ? Infinity : Math.round(10 * Math.log10(1 / mse) * 100) / 100, changedShare: Math.round((changed / n) * 1e5) / 1e5 };
  }

  /** Throughput of direct renders (ms each): `n` back to back, one sync. */
  directThroughput(n = 40): number {
    const r = this.renderer!;
    const gl = r.getContext();
    const one = new Float32Array(4);
    const rt = this.target();
    this.direct(false);
    r.readRenderTargetPixels(rt, 0, 0, 1, 1, one);
    const t0 = performance.now();
    for (let i = 0; i < n; i += 1) this.direct(false);
    r.readRenderTargetPixels(rt, 0, 0, 1, 1, one);
    void gl;
    return (performance.now() - t0) / n;
  }

  /** A against B on direct renders, alternated (median ms each, B's saving). */
  async abDirect(a: () => unknown, b: () => unknown, rounds = 7, n = 40): Promise<{ a: number; b: number; saved: number; savedPct: number }> {
    const ra: number[] = [], rb: number[] = [];
    await a();
    this.directThroughput(n);
    for (let i = 0; i < rounds; i += 1) {
      await a();
      ra.push(this.directThroughput(n));
      await b();
      rb.push(this.directThroughput(n));
    }
    await a();
    const ma = med(ra), mb = med(rb);
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    return { a: r2(ma), b: r2(mb), saved: r2(ma - mb), savedPct: Math.round(((ma - mb) / ma) * 1000) / 10 };
  }

  /** A direct render as a PNG data URL (tone mapped roughly for viewing: clamp, sRGB), bottom row first in. */
  pngF(px: Float32Array): string {
    const rt = this.target();
    const w = rt.width, h = rt.height;
    const u8 = new Uint8Array(w * h * 4);
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const v = Math.min(1, Math.max(0, px[i + c]!));
        u8[i + c] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
      }
      u8[i + 3] = 255;
    }
    return this.png(u8);
  }

  // ---------- frames: draw the frozen frame, read it back, compare ----------

  /** Draws the frame again (no time passes) and returns every pixel (RGBA, bottom row first). */
  snap(): Uint8Array {
    // Some layers flicker from Math.random or the wall clock on every draw: both are pinned while the frame is drawn, so
    // two draws of the same frozen frame are equal and a difference comes from the cut alone.
    const random = Math.random;
    const now = performance.now.bind(performance);
    const dateNow = Date.now;
    let s = 0x9e3779b9;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.frozenNow ??= now();
    const frozen = this.frozenNow;
    performance.now = () => frozen;
    Date.now = () => 1_700_000_000_000;
    try {
      lab().perf(1, 0);
    } finally {
      Math.random = random;
      performance.now = now;
      Date.now = dateNow;
    }
    const gl = this.renderer!.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  /**
   * The frame after `n` more draws: a few lab layers ease toward their state on every draw (the noise floor between two
   * consecutive draws falls to ~60 dB after ~30), so every compared frame is taken after the same settling.
   */
  stable(n = 30): Uint8Array {
    for (let i = 0; i < n; i += 1) this.snap();
    return this.snap();
  }

  /** PSNR (RGB, dB; Infinity when equal), the largest channel difference, pixels that differ by more than 2. */
  static compare(a: Uint8Array, b: Uint8Array): { psnr: number; maxDiff: number; changed: number; changedShare: number } {
    let se = 0;
    let max = 0;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      let pixel = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = Math.abs(a[i + c]! - b[i + c]!);
        se += d * d;
        if (d > max) max = d;
        if (d > pixel) pixel = d;
      }
      if (pixel > 2) changed += 1;
    }
    const mse = se / ((a.length / 4) * 3);
    return { psnr: mse === 0 ? Infinity : Math.round(10 * Math.log10((255 * 255) / mse) * 100) / 100, maxDiff: max, changed, changedShare: Math.round((changed / (a.length / 4)) * 1e5) / 1e5 };
  }

  /** The frozen frame's GPU time (ms, total − CPU): median and p95 over `n` redraws. */
  gpu(n = 30): { gpu: number; gpu95: number; cpu: number; draws: number; tris: number } {
    const p = lab().perf(n, 0);
    const g = p.total.map((t, i) => Math.max(0, t - p.cpu[i]!));
    return { gpu: Math.round(med(g) * 100) / 100, gpu95: Math.round(p95(g) * 100) / 100, cpu: Math.round(med(p.cpu) * 100) / 100, draws: p.drawCalls, tris: p.triangles };
  }

  /**
   * Throughput of the frozen frame (ms per frame): `n` frames drawn back to back with one sync at the end, so the GPU stays
   * busy at its working clock (a sync after every frame lets it idle and drop its clock: the per-frame GPU time then depends
   * on the order of the runs). CPU and GPU overlap as in the game, so this is max(CPU, GPU) per frame.
   */
  throughput(n = 60): number {
    const gl = this.renderer!.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    (window.__lab as unknown as { step(frames: number, dt?: number): void }).step(n, 0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - t0) / n;
  }

  /** A against B, alternated `rounds` times (a warm-up run first): the median throughput of each and B's saving. */
  async ab(a: () => unknown, b: () => unknown, rounds = 5, n = 60): Promise<{ a: number; b: number; saved: number; savedPct: number; runsA: number[]; runsB: number[] }> {
    const ra: number[] = [];
    const rb: number[] = [];
    await a();
    this.throughput(n);
    for (let i = 0; i < rounds; i += 1) {
      await a();
      ra.push(this.throughput(n));
      await b();
      rb.push(this.throughput(n));
    }
    await a();
    const ma = med(ra), mb = med(rb);
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    return { a: r2(ma), b: r2(mb), saved: r2(ma - mb), savedPct: Math.round(((ma - mb) / ma) * 1000) / 10, runsA: ra.map(r2), runsB: rb.map(r2) };
  }

  /** Saves the frame as a PNG data URL (for the before/after sheet), cropped to [x0, y0, x1, y1] in CSS fractions. */
  png(px: Uint8Array, crop: [number, number, number, number] = [0, 0, 1, 1]): string {
    const gl = this.renderer!.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const x0 = Math.round(crop[0] * w), y0 = Math.round(crop[1] * h), x1 = Math.round(crop[2] * w), y1 = Math.round(crop[3] * h);
    const cw = x1 - x0, ch = y1 - y0;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y += 1) {
      const src = ((h - 1 - (y0 + y)) * w + x0) * 4;
      img.data.set(px.subarray(src, src + cw * 4), y * cw * 4);
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // ---------- 1. tight meshes for flipbook cards ----------

  /** Flipbook meshes in the scene and their atlases. */
  pools(): { mesh: THREE.Mesh; meta: FlipbookMeta }[] {
    const out: { mesh: THREE.Mesh; meta: FlipbookMeta }[] = [];
    this.scene?.traverse((o) => {
      const meta = metaOf.get(o);
      if (meta !== undefined && (o as THREE.Mesh).isMesh) out.push({ mesh: o as THREE.Mesh, meta });
    });
    return out;
  }

  private tightFor(meta: FlipbookMeta, mv: number): Promise<Tight | null> {
    const key = meta.url + "|" + mv;
    let p = this.tightCache.get(key);
    if (p === undefined) {
      p = this.buildTight(meta, mv).catch((error: unknown) => {
        console.warn("[stress-opt] no tight mesh for " + meta.url, error);
        return null;
      });
      this.tightCache.set(key, p);
    }
    return p;
  }

  private async buildTight(meta: FlipbookMeta, mv: number): Promise<Tight | null> {
    if (meta.url === "") return null; // a texture drawn in code: no atlas to read
    // The PNG beside a KTX2 atlas; Five Thunders names its atlases without the extension (".atlas").
    const url = meta.url.replace(/(\.uastc|\.etc1s)?\.ktx2(\?.*)?$/, ".atlas.png").replace(/\.atlas(\?.*)?$/, ".atlas.png$1");
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const cols = meta.cols;
    const rows = meta.rows;
    const cw = bmp.width / cols;
    const ch = bmp.height / rows;
    let opaque = true;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i]! < 255) { opaque = false; break; }
    const occ = new Uint8Array(GRID * GRID);
    const frames = Math.min(meta.frames, cols * rows);
    for (let f = 0; f < frames; f += 1) {
      const c0 = (f % cols) * cw;
      const r0 = Math.floor(f / cols) * ch;
      for (let y = 0; y < ch; y += 1) {
        const ty = Math.min(GRID - 1, Math.floor((y / ch) * GRID));
        const row = (Math.floor(r0 + y) * bmp.width + Math.floor(c0)) * 4;
        for (let x = 0; x < cw; x += 1) {
          const i = row + x * 4;
          const v = opaque ? Math.max(data[i]!, data[i + 1]!, data[i + 2]!) : data[i + 3]!;
          if (v >= THRESHOLD) occ[ty * GRID + Math.min(GRID - 1, Math.floor((x / cw) * GRID))] = 1;
        }
      }
    }
    // Margin: one tile (mip blur, the card's own soft edge), plus the motion vectors' reach.
    const pad = 1 + Math.ceil(mv * GRID);
    const grown = new Uint8Array(GRID * GRID);
    for (let ty = 0; ty < GRID; ty += 1) {
      for (let tx = 0; tx < GRID; tx += 1) {
        if (occ[ty * GRID + tx] === 0) continue;
        for (let dy = -pad; dy <= pad; dy += 1) for (let dx = -pad; dx <= pad; dx += 1) {
          const y = ty + dy, x = tx + dx;
          if (x >= 0 && y >= 0 && x < GRID && y < GRID) grown[y * GRID + x] = 1;
        }
      }
    }
    let kept = 0;
    for (const v of grown) kept += v;
    if (kept === 0 || kept / (GRID * GRID) > 0.92) return null;
    // Runs of kept tiles per row, one quad each (uv: x right, y up; tile row 0 is the cell's top).
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let ty = 0; ty < GRID; ty += 1) {
      let tx = 0;
      while (tx < GRID) {
        if (grown[ty * GRID + tx] === 0) { tx += 1; continue; }
        const start = tx;
        while (tx < GRID && grown[ty * GRID + tx] === 1) tx += 1;
        const u0 = start / GRID, u1 = tx / GRID, v1 = 1 - ty / GRID, v0 = 1 - (ty + 1) / GRID;
        const b = uv.length / 2;
        for (const [u, v] of [[u0, v1], [u1, v1], [u0, v0], [u1, v0]] as const) {
          uv.push(u, v);
          pos.push(u - 0.5, v - 0.5, 0);
        }
        idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
      }
    }
    return {
      index: new THREE.BufferAttribute(new Uint16Array(idx), 1),
      position: new THREE.BufferAttribute(new Float32Array(pos), 3),
      uv: new THREE.BufferAttribute(new Float32Array(uv), 2),
      kept: kept / (GRID * GRID),
    };
  }

  /** Tight meshes on or off for every pool (or the named ones); resolves to the share of each card kept. */
  async tight(on: boolean, names?: readonly string[]): Promise<Record<string, number>> {
    const kept: Record<string, number> = {};
    for (const { mesh, meta } of this.pools()) {
      if (names !== undefined && !names.includes(mesh.name)) continue;
      const g = mesh.geometry;
      if (!this.orig.has(g)) this.orig.set(g, { index: g.index, position: g.getAttribute("position"), uv: g.getAttribute("uv") });
      const o = this.orig.get(g)!;
      const mat = mesh.material as THREE.ShaderMaterial;
      const t = on && !this.bad.has(mesh.name) && meta.frames > 0 ? await this.tightFor(meta, (mat.uniforms?.uMvOn?.value as number) > 0.5 ? (mat.uniforms.uMvStrength?.value as number) ?? 0 : 0) : null;
      if (t !== null) {
        g.setIndex(t.index);
        g.setAttribute("position", t.position);
        g.setAttribute("uv", t.uv);
        this.tightOn.add(mesh);
        kept[mesh.name] = Math.round(t.kept * 1000) / 1000;
      } else {
        g.setIndex(o.index);
        g.setAttribute("position", o.position);
        g.setAttribute("uv", o.uv);
        this.tightOn.delete(mesh);
      }
    }
    return kept;
  }

  /**
   * On the frame shown: every tight pool on against all off; when the frame differs (PSNR under `min`), each drawn pool
   * alone, and the ones that change the frame keep their quad from now on (this.bad).
   */
  async checkTight(): Promise<{ identical: number; maxDiff: number; tested: string[]; bad: string[] }> {
    const drawn = this.pools().filter((p) => ((p.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount ?? 0) > 0).map((p) => p.mesh.name);
    await this.tight(false);
    const a = this.direct()!;
    await this.tight(true);
    const all = StressOpt.compareF(a, this.direct()!);
    const bad: string[] = [];
    if (all.identical < 100) {
      for (const name of drawn) {
        await this.tight(false);
        await this.tight(true, [name]);
        const c = StressOpt.compareF(a, this.direct()!);
        if (c.identical < 100) {
          bad.push(name + " (" + c.identical + " % identical, max " + c.maxDiff + ")");
          this.bad.add(name);
        }
      }
      await this.tight(false);
      await this.tight(true);
    }
    return { identical: all.identical, maxDiff: all.maxDiff, tested: drawn, bad };
  }

  // ---------- 2. herd LOD ----------

  /** The herd's instanced meshes (actors group) and the stress walkers. */
  herd(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const actors = this.scene?.getObjectByName("actors");
    actors?.children[0]?.children.forEach((c) => { if ((c as THREE.InstancedMesh).isInstancedMesh) out.push(c as THREE.Mesh); });
    this.scene?.getObjectByName("stress-walkers")?.children.forEach((c) => { if ((c as THREE.InstancedMesh).isInstancedMesh) out.push(c as THREE.Mesh); });
    return out;
  }

  /** Simplified herd meshes on or off (`tris`: the target per beast, canon TT_BUDGETS.lodTris). */
  lod(on: boolean, tris = 1800): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const mesh of this.herd()) {
      if (!this.fullGeo.has(mesh)) this.fullGeo.set(mesh, mesh.geometry);
      const full = this.fullGeo.get(mesh)!;
      const key = mesh.uuid + "|" + tris;
      let e = this.lodGeo.get(key);
      if (e === undefined && on) {
        const fullTris = (full.index?.count ?? full.getAttribute("position").count) / 3;
        const simplify = (ratio: number): THREE.BufferGeometry => {
          const base = new THREE.BufferGeometry();
          for (const name of ["position", "normal", "uv"]) {
            const a = full.getAttribute(name);
            if (a !== undefined) base.setAttribute(name, (a as THREE.BufferAttribute).clone());
          }
          if (full.index !== null) base.setIndex(full.index.clone());
          const verts = base.getAttribute("position").count;
          return new SimplifyModifier().modify(base, Math.max(0, Math.floor(verts * (1 - Math.min(1, ratio)))));
        };
        const trisOf = (g: THREE.BufferGeometry): number => (g.index?.count ?? g.getAttribute("position").count) / 3;
        // Vertices are removed, not triangles (uv seams): one corrected pass lands near the target.
        let r = Math.min(1, tris / fullTris);
        let lod = simplify(r);
        const got = trisOf(lod);
        if (got > 0 && Math.abs(got - tris) / tris > 0.1 && r < 1) {
          r = Math.min(1, r * Math.pow(tris / got, 0.8));
          lod = simplify(r);
        }
        // The herd's per-instance attributes (dissolve, rim, cut, white flash) and any other non-standard one, shared.
        for (const [name, attr] of Object.entries(full.attributes)) if (!["position", "normal", "uv"].includes(name)) lod.setAttribute(name, attr);
        lod.computeBoundingSphere();
        e = { full, lod, tris: [Math.round(fullTris), Math.round(trisOf(lod))] };
        this.lodGeo.set(key, e);
      }
      mesh.geometry = on && e !== undefined ? e.lod : full;
      if (e !== undefined) out[mesh.name || mesh.uuid.slice(0, 6)] = e.tris;
    }
    this.lodOn = on;
    return out;
  }

  // ---------- 3. prewarm ----------

  /** Five Thunders' atlases loaded, every material compiled (KHR_parallel_shader_compile) and every texture uploaded. */
  async prewarm(): Promise<{ ms: number; textures: number; programs: number }> {
    const t0 = performance.now();
    const r = this.renderer!;
    lab().thunder(false);
    for (let i = 0; i < 200 && !lab().thunder(false).ready; i += 1) await new Promise((res) => setTimeout(res, 50));
    // Compile every material, empty pools included (they are hidden while empty).
    const hidden: THREE.Object3D[] = [];
    this.scene!.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    await r.compileAsync(this.scene!, this.camera!);
    for (const o of hidden) o.visible = false;
    const textures = new Set<THREE.Texture>();
    this.scene!.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m === undefined) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) textures.add(v);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u !== undefined) for (const x of Object.values(u)) if (x?.value instanceof THREE.Texture) textures.add(x.value);
      }
    });
    for (const t of textures) r.initTexture(t);
    return { ms: Math.round(performance.now() - t0), textures: textures.size, programs: (r.info.programs ?? []).length };
  }

  // ---------- 4. base split ----------

  /** Variants of the base: "full", "unlit" (ground without light), "noShadowPass", "noGround", "noScreenPass", "direct" (no post chain). */
  base(variant: string): () => void {
    const ground = this.scene!.getObjectByName("ground")!;
    const meshes = ground.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const r = this.renderer!;
    if (variant === "unlit") {
      const saved = meshes.map((m) => m.material);
      meshes.forEach((m) => {
        const s = m.material as THREE.MeshStandardMaterial;
        m.material = new THREE.MeshBasicMaterial({ map: s.map, color: s.color });
      });
      return () => meshes.forEach((m, i) => (m.material = saved[i]!));
    }
    if (variant === "noShadowPass") {
      const was = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = false;
      return () => { r.shadowMap.autoUpdate = was; };
    }
    if (variant === "noGround") {
      meshes.forEach((m) => (m.visible = false));
      return () => meshes.forEach((m) => (m.visible = true));
    }
    const passes = composer?.passes ?? [];
    if (variant === "noScreenPass") {
      const p = passes.find((x) => x.constructor.name === "ScreenPass");
      if (p !== undefined) p.enabled = false;
      return () => { if (p !== undefined) p.enabled = true; };
    }
    if (variant === "direct") {
      const p = passes.find((x) => /Bloom/.test(x.constructor.name));
      if (p !== undefined) p.enabled = false;
      return () => { if (p !== undefined) p.enabled = true; };
    }
    return () => undefined;
  }

  // ---------- 5. Five Thunders layers ----------

  /**
   * On the frame shown (run it with the actors hidden and the screen pass off, so two draws are equal): each Five Thunders
   * layer hidden in turn: the pixels it changes (its footprint), its cost (throughput A/B) and, over all layers, how many
   * of them reach each pixel (the overlap).
   */
  async layers(rounds = 5): Promise<{ total: number; layers: { name: string; instances: number; ms: number; pixels: number }[]; overlap: { mean: number; max: number; pixelsTouched: number; hist: number[] } }> {
    const pools = this.pools().filter((p) => p.mesh.name.startsWith("flipbook-five-thunder-") && p.mesh.visible && ((p.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount ?? 0) > 0);
    const a = this.direct()!;
    const count = new Uint8Array(a.length / 4);
    const rows: { name: string; instances: number; ms: number; pixels: number }[] = [];
    for (const { mesh } of pools) {
      mesh.visible = false;
      const b = this.direct()!;
      mesh.visible = true;
      let px = 0;
      for (let i = 0, k = 0; i < a.length; i += 4, k += 1) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
          px += 1;
          if (count[k]! < 255) count[k] = count[k]! + 1;
        }
      }
      const cost = px > 0 ? await this.abDirect(() => { mesh.visible = true; }, () => { mesh.visible = false; }, rounds, 30) : null;
      mesh.visible = true;
      rows.push({ name: mesh.name.replace("flipbook-five-thunder-", ""), instances: (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount, ms: cost?.saved ?? 0, pixels: px });
    }
    const total = await this.abDirect(() => { for (const p of pools) p.mesh.visible = true; }, () => { for (const p of pools) p.mesh.visible = false; }, rounds, 30);
    let touched = 0, sum = 0, max = 0;
    const hist = new Array<number>(13).fill(0);
    for (const c of count) if (c > 0) { touched += 1; sum += c; if (c > max) max = c; hist[Math.min(12, c)] = hist[Math.min(12, c)]! + 1; }
    rows.sort((x, y) => y.ms - x.ms);
    return { total: total.saved, layers: rows, overlap: { mean: touched === 0 ? 0 : Math.round((sum / touched) * 100) / 100, max, pixelsTouched: touched, hist } };
  }

  // ---------- 3c. KTX2 against PNG atlases, on the same page ----------

  private readonly pngTex = new Map<THREE.Mesh, { ktx: THREE.Texture; png: THREE.Texture }>();

  /**
   * Every pool drawing a KTX2 atlas switched to the PNG it was encoded from (same orientation, sRGB, mipmaps) or back:
   * the frame and the cost compared on the same page. Resolves to the count and the GPU bytes of each (UASTC is
   * transcoded to ASTC 4×4 here: 1 byte a texel; RGBA8 4 bytes; mipmaps +⅓).
   */
  async atlasPng(on: boolean): Promise<{ pools: number; ktxMB: number; pngMB: number }> {
    const loader = new THREE.TextureLoader();
    let ktxB = 0, pngB = 0;
    for (const { mesh, meta } of this.pools()) {
      const u = (mesh.material as THREE.ShaderMaterial).uniforms;
      let e = this.pngTex.get(mesh);
      if (e === undefined) {
        const t = u.uMap?.value as THREE.Texture | undefined;
        if (t === undefined || !(t as THREE.CompressedTexture).isCompressedTexture || meta.url === "") continue;
        const url = meta.url.replace(/(\.uastc|\.etc1s)?\.ktx2(\?.*)?$/, ".atlas.png").replace(/\.atlas(\?.*)?$/, ".atlas.png$1");
        const png = await loader.loadAsync(url);
        png.colorSpace = t.colorSpace;
        png.minFilter = THREE.LinearMipmapLinearFilter;
        png.magFilter = t.magFilter;
        png.anisotropy = t.anisotropy;
        png.wrapS = t.wrapS;
        png.wrapT = t.wrapT;
        png.flipY = true;
        e = { ktx: t, png };
        this.pngTex.set(mesh, e);
      }
      u.uMap!.value = on ? e.png : e.ktx;
      const img = e.png.image as { width: number; height: number };
      ktxB += img.width * img.height * (4 / 3);
      pngB += img.width * img.height * 4 * (4 / 3);
    }
    return { pools: this.pngTex.size, ktxMB: Math.round(ktxB / 1048576), pngMB: Math.round(pngB / 1048576) };
  }

  // ---------- round 3: baked ground light ----------

  private baked: BakedGround[] | null = null;

  /** The ground's baked light on or off (baked once, on first use, with the lights as they are). */
  bakeGround(on: boolean, variant: "baked" | "lite" = "baked"): { meshes: number; tiles: [number, number][]; ms: number } {
    const t0 = performance.now();
    const ground = this.scene!.getObjectByName("ground")!;
    const meshes = ground.children.filter((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) as THREE.Mesh[];
    if (this.baked === null && on) this.baked = bakeGround(this.renderer!, this.scene!, this.camera!, meshes);
    for (const b of this.baked ?? []) b.mesh.material = on ? (variant === "lite" ? b.lite : b.baked) : b.original;
    return { meshes: this.baked?.length ?? 0, tiles: (this.baked ?? []).map((b) => b.tile), ms: Math.round(performance.now() - t0) };
  }

  /** The baked light textures as PNG data URLs (static, sun) of mesh `i`, for the sheet. */
  bakedPng(i = 0): [string, string] | null {
    const b = this.baked?.[i];
    if (b === undefined) return null;
    const r = this.renderer!;
    const read = (rt: THREE.WebGLRenderTarget): string => {
      const w = rt.width, h = rt.height;
      const u8 = new Uint8Array(w * h * 4);
      r.readRenderTargetPixels(rt, 0, 0, w, h, u8);
      for (let k = 3; k < u8.length; k += 4) u8[k] = 255;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(w, h);
      img.data.set(u8);
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL("image/png");
    };
    return [read(b.staticTarget), read(b.sunTarget)];
  }


  // ---------- round 4: the ground's maps as look.ts builds them (jpg, orm, ktx2) ----------

  /** The field's maps switched (look.ts useGroundTextures); resolves to the mode in use. */
  groundMaps(mode: GroundTexMode): Promise<GroundTexMode> {
    return useGroundTextures(mode, this.renderer!);
  }

  /** The mode the field is in, once its KTX2 maps have loaded or failed. */
  groundReady(): Promise<GroundTexMode> {
    return groundTextures.ready;
  }

}
