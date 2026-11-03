/**
 * Thiên Hà Kiếm Vũ (K5), power pass round 3b: the ultimate as a literal sword rain from the sky, after the target
 * frames f5 (the impact frame: a gate of swords over the field, light columns, a colossal sword) and f6 (the
 * aftermath: planted swords with lit bases, a wide glowing rift). Round 3a's flat ground spiral read as a floor decal
 * at the 55° play camera; this composition lives in vertical space. The drawing only; the timeline, targets and
 * strikes stay in KiemFx (kiem.ts). Pieces:
 * - SkyGate: a camera-facing ellipse high over the far field, a dark aperture with a white-hot rim and a torn
 *   corona, drawn analytically in one quad; its ring of swords pointing out is the real sword (03/11/2026:
 *   impostors of the Clear Wind model, real-swords.ts, placed by KiemFx at `swordAt`), never a drawn silhouette;
 * - LightStrips: screen-space strips from a base to a top (columns linking sky and ground, landing pillars), a thin
 *   HDR core in a cyan body with travelling bright segments, one instanced draw;
 * - GroundMarks: ground decals, a star of jagged cracks where a blade lands and the wide rift of the climax (a white
 *   seam, a cyan glow, scorched ink edges, branches), one instanced draw;
 * - the falling, planted and heaven swords are the real textured model (blades.ts BladeSet in KiemFx).
 * White, cyan and deep navy only; bodies premultiplied, only thin cores reach the bloom. No allocation per frame.
 */
import * as THREE from "three";
import { GRAMMAR } from "./sword-grammar";

const v3 = (c: readonly number[]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);

/** Swords round the gate's rim (every other one longer), and the corona's spikes between them. */
export const GATE_SWORDS = 16;

const PREMULT = {
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendEquation: THREE.AddEquation,
} as const;

// ── Sky gate ──────────────────────────────────────────────────────────────

const GATE_VERTEX = /* glsl */ `
uniform vec3 uCentre;
uniform float uSize;
varying vec2 vUv;
void main() {
  vec4 c = viewMatrix * vec4(uCentre, 1.0);
  c.xy += position.xy * uSize;
  vUv = position.xy * 2.0;
  gl_Position = projectionMatrix * c;
}`;

const GATE_FRAGMENT = /* glsl */ `
uniform float uOpen;
uniform float uAlpha;
uniform float uFlare;
uniform float uSpin;
uniform float uSquash;
uniform float uTime;
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
uniform vec3 uNavy;
varying vec2 vUv;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 p = vec2(vUv.x, vUv.y / uSquash);
  float r = length(p);
  float aa = max(fwidth(r), 1e-4);
  float R = 0.44 * uOpen;
  vec3 body = vec3(0.0);
  float a = 0.0;
  vec3 add = vec3(0.0);
  // The aperture: a dark celestial hole with a few cold stars turning in it.
  float ap = 1.0 - smoothstep(R - aa, R + aa, r);
  float ang = atan(p.y, p.x);
  float sw = ang * 3.0 + r * 9.0 - uTime * 0.6;
  float swirl = 0.5 + 0.5 * sin(sw);
  body = mix(uNavy * 0.5, uNavy * 2.6 + uCyan * 0.12, swirl * smoothstep(0.0, R + 1e-3, r) * 0.55);
  a = ap * 0.94;
  vec2 cell = floor(p * 26.0);
  float st = hash(cell.x * 31.0 + cell.y * 7.0);
  vec2 f = fract(p * 26.0) - 0.5;
  add += uWhite * 1.4 * step(0.93, st) * (1.0 - smoothstep(0.05, 0.16, length(f))) * ap;
  // The rim: a white-hot line (HDR), a narrow cyan light round it.
  float d = abs(r - R);
  float rimW = 0.006 + 0.004 * uFlare;
  float core = 1.0 - smoothstep(rimW, rimW + aa * 1.5, d);
  float glow = exp(-d * (34.0 - 12.0 * uFlare));
  add += uWhite * core * (4.0 + 3.0 * uFlare) + uCyanLit * glow * (0.55 + 0.3 * uFlare) * (1.0 - core);
  // Short dark spikes between the swords (the gate's torn corona), under everything.
  float N = 16.0;
  float spikes = pow(abs(cos(ang * N * 0.5 + uSpin * N * 0.5 + 1.5708)), 6.0);
  float corona = smoothstep(R + 0.02, R, r - spikes * 0.12 * uOpen) * (1.0 - ap) * step(R, r);
  body = mix(uNavy * 0.8, body, max(a, 1.0 - corona * 0.85));
  a = max(a, corona * 0.7);
  gl_FragColor = vec4((body * a + add) * uAlpha, a * uAlpha);
}`;

/** The gate of swords over the field (f5): opens, holds, flares at the climax, closes. */
export class SkyGate {
  readonly mesh: THREE.Mesh;
  readonly centre = new THREE.Vector3();
  /** Half the gate's drawn width (m), for the columns that hang from its rim. */
  radius = 1;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly sRight = new THREE.Vector3();
  private readonly sUp = new THREE.Vector3();

  constructor(renderOrder: number) {
    this.u = {
      uCentre: { value: this.centre },
      uSize: { value: 10 },
      uOpen: { value: 0 },
      uAlpha: { value: 0 },
      uFlare: { value: 0 },
      uSpin: { value: 0 },
      uSquash: { value: 0.42 },
      uTime: { value: 0 },
      uWhite: { value: v3(GRAMMAR.white) },
      uCyan: { value: v3(GRAMMAR.cyan) },
      uCyanLit: { value: v3(GRAMMAR.cyanLit) },
      uNavy: { value: v3(GRAMMAR.navy) },
    };
    const m = new THREE.ShaderMaterial({ vertexShader: GATE_VERTEX, fragmentShader: GATE_FRAGMENT, uniforms: this.u, depthTest: false, ...PREMULT });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
  }

  /**
   * Places the gate for `camera` (at a cast, not per frame): where the view's ray at NDC y `ndcY` is `height` m
   * above the ground, sized to `share` of the view's width.
   */
  place(camera: THREE.PerspectiveCamera, ndcY: number, height: number, share: number): void {
    const o = camera.position;
    const d = new THREE.Vector3(0, ndcY, 0.5).unproject(camera).sub(o).normalize();
    const t = d.y < -1e-3 ? (height - o.y) / d.y : 60;
    this.centre.copy(o).addScaledVector(d, Math.max(10, t));
    const dist = this.centre.distanceTo(o);
    const viewW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
    // The sword tips reach r ≈ 0.88 of the quad's half size at full open.
    const size = (share * viewW) / 0.88;
    this.u.uSize!.value = size;
    this.radius = 0.44 * size * 0.5;
  }

  /**
   * Sword `k` of the rim's ring (of GATE_SWORDS) for `camera`, pointing out: its pommel's end and tip (m), and
   * whether it is one of the longer ones. Follows the gate's open, spin and squash as set this frame.
   */
  swordAt(camera: THREE.Camera, k: number, base: THREE.Vector3, tip: THREE.Vector3): boolean {
    const right = this.sRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const up = this.sUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const open = this.u.uOpen!.value as number;
    const sq = this.u.uSquash!.value as number;
    const half = (this.u.uSize!.value as number) * 0.5;
    const a = (this.u.uSpin!.value as number) + (k * Math.PI * 2) / GATE_SWORDS;
    const big = (k & 1) === 1;
    // Uv units of the quad (its half size is 1): the rim at 0.44·open, swords from just outside it.
    const r0 = (0.44 * open + 0.02) * half;
    const r1 = r0 + (0.3 + 0.14 * (big ? 1 : 0)) * open * half;
    const c = Math.cos(a);
    const s = Math.sin(a) * sq;
    base.copy(this.centre).addScaledVector(right, c * r0).addScaledVector(up, s * r0);
    tip.copy(this.centre).addScaledVector(right, c * r1).addScaledVector(up, s * r1);
    return big;
  }

  /** The gate's alpha and flare as set this frame (its ring of swords fades and flares with it). */
  get look(): { alpha: number; flare: number; open: number } {
    return { alpha: this.u.uAlpha!.value as number, flare: this.u.uFlare!.value as number, open: this.u.uOpen!.value as number };
  }

  /** A point on the rim (m) at angle `a` on screen (0 right, π/2 up), for the camera that placed the gate. */
  rimPoint(camera: THREE.Camera, a: number, out: THREE.Vector3): THREE.Vector3 {
    const right = this.sRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const up = this.sUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const sq = this.u.uSquash!.value as number;
    return out.copy(this.centre).addScaledVector(right, Math.cos(a) * this.radius).addScaledVector(up, Math.sin(a) * this.radius * sq);
  }

  set(open: number, alpha: number, flare: number, spin: number, time: number): void {
    this.u.uOpen!.value = open;
    this.u.uAlpha!.value = alpha;
    this.u.uFlare!.value = flare;
    this.u.uSpin!.value = spin;
    this.u.uTime!.value = time;
    this.mesh.visible = alpha > 0.003 && open > 0.003;
  }

  hide(): void {
    this.u.uAlpha!.value = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ── Light strips (columns and landing pillars) ─────────────────────────────

const STRIP_VERTEX = /* glsl */ `
attribute vec4 iA;    // base (m), w: half width (px at 1080p)
attribute vec4 iB;    // top (m), w: the core's share of the half width
attribute vec4 iLook; // x: alpha, y: core HDR, z: segment phase, w: fade at the base (share)
uniform vec2 uView;
varying vec2 vP;
varying vec4 vLook;
varying float vCore;
varying float vLenPx;
void main() {
  vec4 ca = projectionMatrix * viewMatrix * vec4(iA.xyz, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(iB.xyz, 1.0);
  vLook = iLook;
  vCore = iB.w;
  if (ca.w < 0.05 || cb.w < 0.05 || iLook.x <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uView;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uView;
  vec2 d = sb - sa;
  float L = max(length(d), 1e-3);
  vec2 ax = d / L;
  vec2 nrm = vec2(-ax.y, ax.x);
  float k = uView.y / 1080.0;
  float hw = iA.w * k;
  float y = position.y + 0.5;
  vec2 p = sa + ax * (y * L) + nrm * (position.x * 2.0 * hw);
  float w = mix(ca.w, cb.w, y);
  float z = mix(ca.z / ca.w, cb.z / cb.w, y);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
  vP = vec2(position.x * 2.0, y);
  vLenPx = L;
}`;

const STRIP_FRAGMENT = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
varying vec2 vP;
varying vec4 vLook;
varying float vCore;
varying float vLenPx;
void main() {
  float x = abs(vP.x);
  float y = vP.y;
  float ends = smoothstep(0.0, max(0.01, vLook.w), y) * (1.0 - smoothstep(0.82, 1.0, y));
  // Broken segments travelling down the column (volumetric-looking breaks, f5).
  float seg = 0.72 + 0.28 * smoothstep(0.35, 0.65, fract(y * vLenPx / 90.0 + vLook.z));
  float core = 1.0 - smoothstep(vCore * 0.8, vCore, x);
  float body = (1.0 - smoothstep(0.55, 1.0, x));
  vec3 add = uWhite * vLook.y * core + mix(uCyanLit * 0.85, uCyan * 0.7, smoothstep(vCore, 1.0, x)) * body * (1.0 - core) * seg;
  float a = body * 0.18 * (1.0 - core);
  gl_FragColor = vec4(add * ends * vLook.x, a * ends * vLook.x);
}`;

/** One instanced draw of light strips; fill with begin / push… / end each frame. */
export class LightStrips {
  readonly mesh: THREE.Mesh;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly look: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly view: { value: THREE.Vector2 };
  private readonly vp = new THREE.Vector4();
  private n = 0;

  constructor(
    readonly capacity: number,
    renderOrder: number,
  ) {
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    this.look = new Float32Array(capacity * 4);
    this.attrs = [new THREE.InstancedBufferAttribute(this.a, 4), new THREE.InstancedBufferAttribute(this.b, 4), new THREE.InstancedBufferAttribute(this.look, 4)];
    for (const at of this.attrs) at.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iA", this.attrs[0]!);
    g.setAttribute("iB", this.attrs[1]!);
    g.setAttribute("iLook", this.attrs[2]!);
    g.instanceCount = 0;
    this.geometry = g;
    this.view = { value: new THREE.Vector2(1920, 1080) };
    const m = new THREE.ShaderMaterial({
      vertexShader: STRIP_VERTEX,
      fragmentShader: STRIP_FRAGMENT,
      uniforms: { uView: this.view, uWhite: { value: v3(GRAMMAR.white) }, uCyan: { value: v3(GRAMMAR.cyan) }, uCyanLit: { value: v3(GRAMMAR.cyanLit) } },
      depthTest: true,
      ...PREMULT,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.vp);
      this.view.value.set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
    };
  }

  begin(): void {
    this.n = 0;
  }

  /** A strip from (ax, ay, az) to (bx, by, bz), `halfPx` wide at 1080p, its core `core` of that, HDR `hdr`. */
  push(ax: number, ay: number, az: number, bx: number, by: number, bz: number, halfPx: number, core: number, alpha: number, hdr: number, phase: number, baseFade: number): void {
    if (this.n >= this.capacity || alpha <= 0.003) return;
    const o = this.n * 4;
    this.a[o] = ax;
    this.a[o + 1] = ay;
    this.a[o + 2] = az;
    this.a[o + 3] = halfPx;
    this.b[o] = bx;
    this.b[o + 1] = by;
    this.b[o + 2] = bz;
    this.b[o + 3] = core;
    this.look[o] = Math.min(1, alpha);
    this.look[o + 1] = hdr;
    this.look[o + 2] = phase;
    this.look[o + 3] = baseFade;
    this.n += 1;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const at of this.attrs) {
      at.updateRanges.length = 0;
      at.updateRanges.push({ start: 0, count: Math.max(1, this.n) * 4 });
      at.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ── Ground marks (landing cracks, the rift) ────────────────────────────────

export const MARK_STAR = 0;
export const MARK_RIFT = 1;

const MARK_VERTEX = /* glsl */ `
attribute vec4 iPos;  // x, z (m), angle (rad), kind
attribute vec4 iSize; // length, width (m), seed, reveal (0–1 along the rift)
attribute vec4 iLook; // alpha, heat (core HDR), ink (scorch alpha), glow
varying vec2 vL;
varying vec4 vSize;
varying vec4 vLook;
varying float vKind;
void main() {
  float c = cos(iPos.z);
  float s = sin(iPos.z);
  vec2 l = position.xy * iSize.xy;
  vec2 w = vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vL = position.xy * 2.0;
  vSize = iSize;
  vLook = iLook;
  vKind = iPos.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(iPos.x + w.x, 0.035, iPos.y + w.y, 1.0);
}`;

const MARK_FRAGMENT = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
uniform vec3 uInk;
varying vec2 vL;
varying vec4 vSize;
varying vec4 vLook;
varying float vKind;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0;
}
void main() {
  float seed = vSize.z;
  float heat = vLook.y;
  float dist;
  float wHere;
  float reach = 1.0;
  if (vKind < 0.5) {
    // A star of 6 jagged cracks out of a scorched hole.
    vec2 p = vL;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float best = 9.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float a0 = (fi + hash(seed + fi) * 0.6) * 1.0472;
      float len = 0.55 + 0.45 * hash(seed * 1.7 + fi);
      float da = ang - a0 - vnoise(r * 9.0 + fi * 3.1 + seed) * 0.16;
      da = mod(da + 3.14159, 6.28318) - 3.14159;
      float dd = abs(da) * r / max(0.05, 1.0 - r / len) ;
      dd = r > len ? 9.0 : dd;
      best = min(best, dd);
    }
    dist = best;
    wHere = 0.06;
    float hole = 1.0 - smoothstep(0.1, 0.28, r);
    float scorch = (1.0 - smoothstep(0.15, 0.62, r)) * vLook.z;
    float core = (1.0 - smoothstep(wHere * 0.35, wHere * 0.6, dist)) + hole * 0.6;
    float glow = (1.0 - smoothstep(wHere * 0.5, wHere * 2.6, dist)) * (1.0 - smoothstep(0.6, 1.0, r));
    float edge = 1.0 - smoothstep(0.9, 1.0, r);
    vec3 add = uWhite * heat * min(1.0, core) * edge + uCyanLit * 0.9 * glow * (1.0 - min(1.0, core)) * vLook.w;
    float a = max(scorch, glow * 0.5) * edge;
    gl_FragColor = vec4((uInk * a + add) * vLook.x, a * vLook.x);
    return;
  }
  // The rift: a jagged seam along the length, tapered at both ends, revealed from its middle out; short branches.
  float u = vL.x;
  float v = vL.y * vSize.y / vSize.x;
  float seam = (vnoise(u * 7.0 + seed) * 0.05 + vnoise(u * 23.0 + seed * 3.0) * 0.016) ;
  float taper = pow(max(0.0, 1.0 - u * u), 0.7);
  float rev = 1.0 - smoothstep(vSize.w - 0.04, vSize.w, abs(u));
  wHere = (0.012 + 0.03 * taper) * vSize.y / max(vSize.y, 1e-3);
  dist = abs(v - seam);
  // Branches: in each of 10 cells along the seam, maybe one crack leaving at a slant.
  float cell = floor((u + 1.0) * 5.0);
  float hb = hash(cell * 13.0 + seed);
  if (hb > 0.35) {
    float u0 = (cell + 0.5) / 5.0 - 1.0;
    float side = hb > 0.67 ? 1.0 : -1.0;
    float t = (u - u0) * side;
    float bl = 0.06 + 0.07 * hash(cell + seed * 2.0);
    float bv = seam + abs(u - u0) * (1.2 + hb) * side + vnoise(u * 40.0 + cell) * 0.006;
    float on = step(0.0, abs(u - u0)) * (1.0 - smoothstep(bl * 0.7, bl, abs(u - u0)));
    float db = abs(v - bv) * 1.6 + (1.0 - on) * 9.0;
    dist = min(dist, db + t * 0.0);
  }
  float core = 1.0 - smoothstep(wHere * 0.3, wHere * 0.55, dist);
  float glow = 1.0 - smoothstep(wHere * 0.5, wHere * 3.2, dist);
  float scorch = (1.0 - smoothstep(wHere * 1.2, wHere * 6.0, dist)) * vLook.z * taper;
  vec3 add = uWhite * heat * core + uCyanLit * 0.9 * glow * (1.0 - core) * vLook.w;
  float a = max(scorch, glow * 0.55);
  float m = rev * taper;
  gl_FragColor = vec4((uInk * a + add * m) * vLook.x * rev, a * vLook.x * rev);
}`;

/** One instanced draw of ground cracks; fill with begin / push… / end each frame. */
export class GroundMarks {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly look: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private n = 0;

  constructor(
    readonly capacity: number,
    renderOrder: number,
  ) {
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    this.pos = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity * 4);
    this.look = new Float32Array(capacity * 4);
    this.attrs = [new THREE.InstancedBufferAttribute(this.pos, 4), new THREE.InstancedBufferAttribute(this.size, 4), new THREE.InstancedBufferAttribute(this.look, 4)];
    for (const at of this.attrs) at.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.attrs[0]!);
    g.setAttribute("iSize", this.attrs[1]!);
    g.setAttribute("iLook", this.attrs[2]!);
    g.instanceCount = 0;
    this.geometry = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: MARK_FRAGMENT,
      uniforms: { uWhite: { value: v3(GRAMMAR.white) }, uCyan: { value: v3(GRAMMAR.cyan) }, uCyanLit: { value: v3(GRAMMAR.cyanLit) }, uInk: { value: new THREE.Vector3(0.012, 0.016, 0.03) } },
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      ...PREMULT,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
  }

  begin(): void {
    this.n = 0;
  }

  /** A mark of `kind` at (x, z) turned `angle`, `length` × `width` m; `reveal` how far the rift has opened (0–1). */
  push(kind: number, x: number, z: number, angle: number, length: number, width: number, seed: number, reveal: number, alpha: number, heat: number, ink: number, glow: number): void {
    if (this.n >= this.capacity || alpha <= 0.003) return;
    const o = this.n * 4;
    this.pos[o] = x;
    this.pos[o + 1] = z;
    this.pos[o + 2] = angle;
    this.pos[o + 3] = kind;
    this.size[o] = length;
    this.size[o + 1] = width;
    this.size[o + 2] = seed;
    this.size[o + 3] = reveal;
    this.look[o] = Math.min(1, alpha);
    this.look[o + 1] = heat;
    this.look[o + 2] = ink;
    this.look[o + 3] = glow;
    this.n += 1;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const at of this.attrs) {
      at.updateRanges.length = 0;
      at.updateRanges.push({ start: 0, count: Math.max(1, this.n) * 4 });
      at.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
