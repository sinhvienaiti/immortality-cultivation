/** Ticket 258b: isolated, off-screen measurements of the unmodified FlipbookPool shaders. */
import * as THREE from "three";
import {
  FLIPBOOK_MASKED_LOOK, FLIPBOOK_TIMING, FlipbookPool, blendPremultiplied, composeFlipbookMasked,
  flipbookControl, parseFlipbookManifest, srgbToLinear,
  type FlipbookControls, type FlipbookLoopMode, type FlipbookMeta, type FlipbookMode,
} from "../view/skills/flipbook";

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];
type Cells = [Rgba, Rgba];

export interface ProbeCase {
  name: string;
  group: "test4" | "impact-key1";
  tick?: number;
  /** Integer RGBA bytes, two flat 32 × 32 cells. Only mask B's red channel is used. */
  atlas: Cells;
  maskA: Cells;
  maskB: Cells;
  w: number;
  ctl: Rgba;
  tint: Rgb;
  loopMode: FlipbookLoopMode;
}

interface Comparison {
  gpu: number[];
  cpu: number[];
  err: number;
}

export interface FlipbookProbeReport {
  programs: {
    pools: number;
    distinct: number;
    added: number;
    callsPerPool: number[];
    shaderErrors: string[];
    glErrors: number[];
    /** GL errors already queued before the probe (the lab's own frames leave an INVALID_OPERATION on main too); not counted. */
    staleErrors: number[];
  };
  gpuVsCpu: {
    cases: { name: string; premul: Comparison; light: Comparison; dark: Comparison }[];
    maxErr: number;
    skipped: string[];
    neutralised: string[];
    inconclusive: boolean;
  };
  maskDecode: { alphas: number[]; read: Rgba[]; maxErr: number };
  pass: boolean;
}

const LIMIT = 1 / 255;
const LOOPS: FlipbookLoopMode[] = ["none", "stepped", "holderode"];
const LIGHT: Rgb = [214, 208, 194].map((v) => srgbToLinear(v / 255)) as Rgb;
const DARK: Rgb = [42, 44, 48].map((v) => srgbToLinear(v / 255)) as Rgb;
// Test 4's table has 19 entries. These three require a different soft/look than this probe's fixed contract.
const SKIPPED = ["soft once", "sharpen coverage", "grade"];

function atlasBytes(t: Rgba): Rgba {
  return t.map((v, k) => Math.round(255 * (k === 3 ? v : v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))) as Rgba;
}

const maskBytes = (m: Rgba): Rgba => m.map((v) => Math.round(v * 255)) as Rgba;

/** Test 4's flat samples, quantised before CPU evaluation, followed by the eight scheduled impact samples. */
export function probeCases(): ProbeCase[] {
  type Seed = { name: string; t?: Rgba; m?: Rgba; b?: number; ctl?: Rgba; pair?: Cells; w?: number };
  const seeds: Seed[] = [
    { name: "empty hull", m: [0, 0, 0, 1] },
    { name: "body cap" },
    { name: "ink independent of atlas alpha", t: [0.9, 0.5, 0.2, 0], m: [1, 1, 0, 1] },
    { name: "uncapped HDR core", t: [0, 0, 0, 0], m: [0, 0, 1, 1] },
    { name: "128 reveal hidden", b: 128 / 255, ctl: [0.25, -0.08, 0.08, 0] },
    { name: "128 reveal shown", b: 128 / 255, ctl: [0.5, -0.08, 0.08, 0] },
    { name: "64 reveal shown", b: 64 / 255, ctl: [0.25, -0.08, 0.08, 0] },
    { name: "last reveal hidden", b: 1, ctl: [0.75, -0.08, 0.08, 0] },
    { name: "last reveal shown", b: 1 },
    { name: "eroded low survival", m: [1, 0, 0, 0.5], ctl: [1, 0.819256, 0.08, 1] },
    { name: "surviving ramp cap", ctl: [1, 0.819256, 0.08, 1] },
    { name: "premultiplied frame interpolation", pair: [[1, 0, 0, 1], [0, 0, 1, 0]], w: 0.5 },
    { name: "unsharpened coverage", t: [0.9, 0.5, 0.2, 0.2] },
    { name: "hot lead during ramp", t: [0, 0, 0, 0], m: [0, 0, 1, 0.65], ctl: [1, 0.5, 0.08, 1] },
    { name: "hot lead off before ramp", t: [0, 0, 0, 0], m: [0, 0, 1, 0.65], ctl: [1, 0.5, 0.08, 0] },
    { name: "all three layers", t: [0.9, 0.5, 0.2, 0.5], m: [0.8, 0.5, 0.25, 1] },
  ];
  const cases: ProbeCase[] = seeds.map((s) => {
    const t = s.t ?? [0.9, 0.5, 0.2, 1];
    const m = maskBytes(s.m ?? [1, 0, 0, 1]);
    const b = Math.round((s.b ?? 0) * 255);
    return {
      name: s.name, group: "test4", loopMode: "none",
      atlas: (s.pair ?? [t, t]).map(atlasBytes) as Cells,
      maskA: [m.slice() as Rgba, m.slice() as Rgba], maskB: [[b, 0, 0, 255], [b, 0, 0, 255]],
      w: Math.min(0.75, Math.round((s.w ?? 0) * 4) / 4),
      ctl: s.ctl ?? [1, -0.08, 0.08, 0], tint: [1, 1, 1],
    };
  });
  for (const tick of [0, 1, 3, 9, 12, 18, 20, 42]) {
    const ctl: Rgba = [0, 0, 0, 0];
    flipbookControl(tick / 60, 43 / 60, 0, 0, FLIPBOOK_TIMING["impact-key1"], ctl);
    cases.push({
      name: `impact-key1 tick ${tick}`, group: "impact-key1", tick, loopMode: "none",
      atlas: [[255, 150, 60, 230], [240, 90, 30, 200]],
      maskA: [[230, 120, 200, 140], [200, 90, 160, 110]],
      maskB: [[40, 0, 0, 255], [90, 0, 0, 255]], w: 0.25, ctl, tint: [1, 1, 1],
    });
  }
  return cases;
}

/** Decode exactly the same bytes sampled by the GPU; no display transform or clipping of HDR RGB. */
export function cpuExpected(c: ProbeCase): { premul: Rgba; light: Rgb; dark: Rgb } {
  const atlas = (t: Rgba): Rgba => t.map((v, k) => k === 3 ? v / 255 : srgbToLinear(v / 255)) as Rgba;
  const mask = (t: Rgba): Rgba => t.map((v) => v / 255) as Rgba;
  const premul: Rgba = [0, 0, 0, 0];
  composeFlipbookMasked({
    t0: atlas(c.atlas[0]), t1: atlas(c.atlas[1]), m0: mask(c.maskA[0]), m1: mask(c.maskA[1]),
    b0: c.maskB[0][0] / 255, b1: c.maskB[1][0] / 255,
    w: c.w, ctl: c.ctl, tint: c.tint, soft: 1,
  }, FLIPBOOK_MASKED_LOOK, premul);
  return { premul, light: over(premul, LIGHT), dark: over(premul, DARK) };
}

function over(src: Rgba, dst: Rgb): Rgb {
  const out: Rgb = [0, 0, 0];
  blendPremultiplied(src, dst, out);
  return out;
}

/** PNG CRC-32 (ISO 3309), returned unsigned. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A single zlib IDAT, filter 0 per row, RGBA8; never passes through a premultiplying canvas. */
export async function encodePngRgba(
  width: number, height: number, rgba: Uint8Array,
  deflate: (raw: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error("Invalid PNG dimensions or RGBA length");
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width); header.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6;
  const chunk = (name: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(data.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(name), 4); out.set(data, 8);
    view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
    return out;
  };
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}

function meta(mode: FlipbookMode, loopMode: FlipbookLoopMode, masks: number): FlipbookMeta {
  return parseFlipbookManifest({ version: 1, flipbooks: { probe: {
    file: "probe.png", cols: 2, rows: 1, frames: 2, fps: 24, cell: [32, 32], mode, loopMode,
    ...(masks >= 1 ? { controlA: "probe-a.png" } : {}), ...(masks >= 2 ? { controlB: "probe-b.png" } : {}),
  } } }, "/flipbook-probe/").get("probe")!;
}

function configure(texture: THREE.Texture, colorSpace: THREE.ColorSpace, anisotropy: number): void {
  texture.colorSpace = colorSpace;
  texture.premultiplyAlpha = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

function comparison(gpu: number[], cpu: number[]): Comparison {
  // Keep a finite failure value when serialised through CDP/JSON (Infinity would become null).
  const errors = cpu.map((v, k) => Number.isFinite(v) && Number.isFinite(gpu[k]) ? Math.abs(gpu[k]! - v) : Number.MAX_VALUE);
  return { gpu, cpu, err: Math.max(...errors) };
}

/** Restores renderer state and releases every resource, also when PNG decoding or rendering throws. */
export async function runFlipbookProbe(renderer: THREE.WebGLRenderer): Promise<FlipbookProbeReport> {
  const saved = {
    target: renderer.getRenderTarget(), cubeFace: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    color: renderer.getClearColor(new THREE.Color()).clone(), alpha: renderer.getClearAlpha(),
    check: renderer.debug.checkShaderErrors, onError: renderer.debug.onShaderError,
    autoReset: renderer.info.autoReset, autoClear: renderer.autoClear,
  };
  const resources = new Set<{ dispose(): void }>();
  const urls = new Set<string>();
  const own = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
  const report: FlipbookProbeReport = {
    programs: { pools: 0, distinct: 0, added: 0, callsPerPool: [], shaderErrors: [], glErrors: [], staleErrors: [] },
    gpuVsCpu: {
      cases: [], maxErr: 0, skipped: [...SKIPPED], inconclusive: false,
      neutralised: [
        "vxSoftGround = 1: iColor.a (ground) = -100000, taking the ground < -10000 early return; uSoftM is bypassed.",
        "border = 1 at (32,32): size 2, aspect 1, pivot (0.5,0.5), angle 0 and iDir.xyz = 0 give UV (0.5078125,0.5078125); distance to every edge > 0.025.",
        "vignette multiplier = 1: uVignette = 0; vAlpha = 1: iData.w = 1, fadeIn/fadeOut = 0, alpha/intensity = 1.",
        "iLift.xy = (0,0): neither depth lift nor direction span; target has no depth buffer, mesh position (0,0,0), camera (0,0,5).",
        "iVar = 0, iAge = (0,0,0,0), iDir.w = 0, uStep = 0 and uBlur = 0; FB_MASKED_GLSL returns directly, bypassing legacy burn/erode/occlusion branches.",
        "uSharpen = (0,0), uGrade = (0,0,0,0), matching FLIPBOOK_MASKED_LOOK; FB_LOOP = 0 leaves the requested quarter-frame w unchanged.",
        "soft = vxSoftGround * border * vAlpha = 1; tint is passed only into fbComposeMasked, with no later colour multiplier, tone mapping or postprocessing.",
      ],
    },
    maskDecode: { alphas: [1, 3, 8], read: [], maxErr: 0 }, pass: false,
  };
  try {
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    // Complete asynchronous decoding before changing renderer flags; all GPU sections below run synchronously.
    const decoded: THREE.Texture[] = [];
    for (const alpha of report.maskDecode.alphas) {
      const rgba = new Uint8Array(4 * 4 * 4);
      for (let i = 0; i < rgba.length; i += 4) rgba.set([200, 100, 50, alpha], i);
      const png = await encodePngRgba(4, 4, rgba, async (raw) => new Uint8Array(await new Response(
        new Blob([Uint8Array.from(raw)]).stream().pipeThrough(new CompressionStream("deflate")),
      ).arrayBuffer()));
      const url = URL.createObjectURL(new Blob([Uint8Array.from(png)], { type: "image/png" }));
      urls.add(url);
      try {
        const texture = own(await new THREE.TextureLoader().loadAsync(url));
        configure(texture, THREE.NoColorSpace, anisotropy); // Keep TextureLoader's default flipY.
        decoded.push(texture);
      } finally { URL.revokeObjectURL(url); urls.delete(url); }
    }

    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      report.programs.shaderErrors.push([
        gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment),
      ].filter(Boolean).join("\n") || "Shader compilation/link failed without a log");
    };
    renderer.info.autoReset = false;
    renderer.autoClear = false;
    const gl = renderer.getContext();
    for (let error = gl.getError(); error !== gl.NO_ERROR; error = gl.getError()) report.programs.staleErrors.push(error);
    const drain = (): void => {
      let error: number;
      while ((error = gl.getError()) !== gl.NO_ERROR) report.programs.glErrors.push(error);
    };
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5; camera.lookAt(0, 0, 0);
    const target = (size: number): THREE.WebGLRenderTarget => {
      const t = own(new THREE.WebGLRenderTarget(size, size, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 0, depthBuffer: false, stencilBuffer: false,
      }));
      t.texture.colorSpace = THREE.LinearSRGBColorSpace;
      return t;
    };
    const rt = target(64);
    const blank = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat));
    blank.needsUpdate = true;
    const flat = (cells: Cells, colorSpace: THREE.ColorSpace): THREE.DataTexture => {
      const data = new Uint8Array(64 * 32 * 4);
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 64; x += 1) data.set(cells[x < 32 ? 0 : 1], (y * 64 + x) * 4);
      const texture = own(new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat, THREE.UnsignedByteType));
      // DataTexture defaults to false; match the atlas and masks loaded by TextureLoader.
      texture.flipY = true;
      configure(texture, colorSpace, anisotropy);
      return texture;
    };
    const clear = (color: Rgb, alpha: number): void => {
      renderer.setClearColor(new THREE.Color().setRGB(...color, THREE.LinearSRGBColorSpace), alpha);
      renderer.clear(true, false, false); drain();
    };
    const draw = (mesh: THREE.Mesh): void => {
      scene.clear(); scene.add(mesh);
      renderer.render(scene, camera); drain();
    };
    const pixel = (t: THREE.WebGLRenderTarget, x: number, y: number): Rgba => {
      const raw = new Uint16Array(4);
      renderer.readRenderTargetPixels(t, x, y, 1, 1, raw); drain();
      return Array.from(raw, THREE.DataUtils.fromHalfFloat) as Rgba;
    };
    const first = probeCases()[0]!;
    const atlas = flat(first.atlas, THREE.SRGBColorSpace);
    const a = flat(first.maskA, THREE.NoColorSpace);
    const b = flat(first.maskB, THREE.NoColorSpace);
    const p0 = renderer.info.programs?.length ?? 0;
    const programs = new Set<unknown>();
    renderer.setRenderTarget(rt);
    for (const mode of ["rgba", "fire", "smoke", "heat"] as const) for (const loop of LOOPS) {
      for (const masks of mode === "rgba" ? [0, 1, 2] : [0]) {
        const pool = own(new FlipbookPool(`probe-${mode}-${loop}-${masks}`, mode, 1, 0, blank));
        pool.attach(meta(mode, loop, masks), atlas, masks ? { a, ...(masks === 2 ? { b } : {}) } : null);
        pool.spawn(new THREE.Vector3(), 2, { ground: -1e5 }); pool.update(1 / 60);
        clear([0, 0, 0], 0);
        const calls = renderer.info.render.calls;
        draw(pool.mesh);
        report.programs.callsPerPool.push(renderer.info.render.calls - calls);
        const program = (renderer.properties.get(pool.mesh.material) as { currentProgram?: unknown }).currentProgram;
        if (program !== undefined && program !== null) programs.add(program);
        report.programs.pools += 1;
      }
    }
    report.programs.distinct = programs.size;
    report.programs.added = (renderer.info.programs?.length ?? 0) - p0;

    for (const c of probeCases()) {
      const controls: FlipbookControls = { a: flat(c.maskA, THREE.NoColorSpace), b: flat(c.maskB, THREE.NoColorSpace) };
      const pool = own(new FlipbookPool("probe-case", "rgba", 1, 0, blank));
      pool.attach(meta("rgba", c.loopMode, 2), flat(c.atlas, THREE.SRGBColorSpace), controls);
      pool.spawn(new THREE.Vector3(), 2, {
        life: 10, fadeIn: 0, fadeOut: 0, ground: -1e5, tint: new THREE.Color().setRGB(...c.tint, THREE.LinearSRGBColorSpace), intensity: 1,
      });
      pool.update(0);
      const write = (name: string, values: number[]): void => {
        const attr = pool.mesh.geometry.getAttribute(name);
        attr.array.set(values); attr.needsUpdate = true;
      };
      write("iData", [2, 0, c.w, 1]); write("iCtl", c.ctl); write("iColor", [...c.tint, -1e5]);
      write("iDir", [0, 0, 0, 0]); write("iAge", [0, 0, 0, 0]); write("iLift", [0, 0]); write("iVar", [0]);
      const material = pool.mesh.material;
      material.uniforms.uVignette!.value = 0;
      material.uniforms.uStep!.value = 0; material.uniforms.uBlur!.value = 0;
      const expected = cpuExpected(c);
      const blending = material.blending;
      material.blending = THREE.NoBlending;
      clear([0, 0, 0], 0); draw(pool.mesh);
      const premul = comparison(pixel(rt, 32, 32), expected.premul);
      material.blending = blending;
      const blended = (stone: Rgb): Comparison => {
        clear(stone, 1);
        const dst = pixel(rt, 32, 32).slice(0, 3) as Rgb;
        draw(pool.mesh);
        return comparison(pixel(rt, 32, 32).slice(0, 3), over(expected.premul, dst));
      };
      const light = blended(LIGHT), dark = blended(DARK);
      report.gpuVsCpu.cases.push({ name: c.name, premul, light, dark });
      report.gpuVsCpu.maxErr = Math.max(report.gpuVsCpu.maxErr, premul.err, light.err, dark.err);
    }

    const maskTarget = target(4);
    const geometry = own(new THREE.PlaneGeometry(2, 2));
    const material = own(new THREE.ShaderMaterial({
      uniforms: { map: { value: blank } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }",
      blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    const quad = new THREE.Mesh(geometry, material);
    renderer.setRenderTarget(maskTarget);
    for (let i = 0; i < decoded.length; i += 1) {
      material.uniforms.map!.value = decoded[i]!;
      clear([0, 0, 0], 0); draw(quad);
      const raw = new Uint16Array(4 * 4 * 4);
      renderer.readRenderTargetPixels(maskTarget, 0, 0, 4, 4, raw); drain();
      const read = Array.from(raw.subarray((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4), THREE.DataUtils.fromHalfFloat) as Rgba;
      report.maskDecode.read.push(read);
      const cpu = [200, 100, 50, report.maskDecode.alphas[i]!].map((v) => v / 255);
      report.maskDecode.maxErr = Math.max(report.maskDecode.maxErr, comparison(read, cpu).err);
    }
    report.pass = report.programs.pools === 18 && report.programs.distinct === 9 && report.programs.added === 9
      && report.programs.callsPerPool.every((n) => n === 1) && report.programs.shaderErrors.length === 0 && report.programs.glErrors.length === 0
      && report.gpuVsCpu.maxErr <= LIMIT && !report.gpuVsCpu.inconclusive && report.maskDecode.maxErr <= LIMIT;
    return report;
  } finally {
    try {
      renderer.setRenderTarget(saved.target, saved.cubeFace, saved.mip);
      renderer.setClearColor(saved.color, saved.alpha);
      renderer.debug.checkShaderErrors = saved.check; renderer.debug.onShaderError = saved.onError;
      renderer.info.autoReset = saved.autoReset; renderer.autoClear = saved.autoClear;
    } finally {
      for (const resource of resources) resource.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
    }
  }
}
