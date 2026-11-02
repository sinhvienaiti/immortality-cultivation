/**
 * The Sword school's visual grammar at the play camera (power pass round 3a, P3; the diagnosis of 03/11/2026:
 * "make every sword legible, not a miniature GLB"). At 20–70 px a flying sword reads from its silhouette, a hard
 * white spine, its taper and its direction, so every sword here is a camera-facing strip drawn from its base to its
 * tip in SCREEN space (widths in px at 1080p, never thinner than their floors, wider when the world width is), with
 * the shape painted analytically in one instanced draw:
 * - LEAD (4–6 a cast): pommel, grip and guard in gold (the only gold), a blade with a narrow deep-navy edge, a
 *   two-tone cyan body (a lit and a shaded bevel) and a hard white spine of HDR 4–8, tip first;
 * - MID (16–32): no hilt: a white tapered spine, a cyan body, a narrow navy edge, a short white-to-cyan streak
 *   behind its root (≥ 4 px wide at 1080p);
 * - FAR (40–100): a directional streak, a white head fading to cyan, no sword shape;
 * - SPINE: only the white spine and a narrow cyan rim, laid over a real blade model (the basic shot's weapon).
 * Palette: white, cyan and deep navy (gold only on lead hilts). Bodies are premultiplied alpha (they occlude what is
 * behind and read with bloom off); the spine, the streaks and the far heads are added (alpha 0 in the same
 * premultiplied blend), so only thin cores reach the bloom. Instances draw in the order written: far, mid, lead.
 * Depth-tested, never depth-written. No allocation per frame.
 */
import * as THREE from "three";

export const SWORD_LEAD = 0;
export const SWORD_MID = 1;
export const SWORD_FAR = 2;
export const SWORD_SPINE = 3;

/** The grammar's palette (linear): HDR white spine, cyan bodies (≤ 0.9), deep navy edges, gold hilts (lead only). */
export const GRAMMAR = {
  /**
   * The spine's light: a cyan-tinted white. At HDR 4–8 the tone curve renders its middle white, while the bloom it
   * feeds carries the tint, so the halo round a sword reads cyan, not as a white smear over its body.
   */
  white: [0.62, 0.88, 1.0] as const,
  cyan: [0.0, 0.26, 0.76] as const,
  cyanLit: [0.05, 0.56, 0.9] as const,
  navy: [0.004, 0.014, 0.05] as const,
  gold: [0.9, 0.56, 0.12] as const,
} as const;

const VERTEX = /* glsl */ `
attribute vec4 iTip;   // tip (m), w: the blade's half width (m)
attribute vec4 iBase;  // base (m): the pommel end (lead), the blade's root (mid, spine), the tail (far); w: kind
attribute vec4 iLook;  // x: alpha, y: spine HDR level, z: streak behind the base (share of the length), w: half-width floor (px at 1080p)
uniform vec2 uView;
varying vec2 vP;       // x: across (px, signed), y: along (0 base, 1 tip; < 0 the streak)
varying float vHalf;
varying float vKind;
varying vec4 vLook;
varying float vLenPx;
varying float vK;
void main() {
  vec4 ct = projectionMatrix * viewMatrix * vec4(iTip.xyz, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(iBase.xyz, 1.0);
  vKind = iBase.w;
  vLook = iLook;
  if (ct.w < 0.05 || cb.w < 0.05 || iLook.x <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 st = (ct.xy / ct.w * 0.5 + 0.5) * uView;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uView;
  vec2 d = st - sb;
  float L = length(d);
  vec2 ax = L > 1e-3 ? d / L : vec2(0.0, 1.0);
  vec2 nrm = vec2(-ax.y, ax.x);
  float k = uView.y / 1080.0;
  // The world half width in px at the blade's middle, never under the floor.
  float wMid = 0.5 * (cb.w + ct.w);
  float hw = max(iTip.w * projectionMatrix[1][1] * 0.5 * uView.y / wMid, iLook.w * k);
  // A lead's guard is ~2.4 blades wide; 1.5 px of room for antialiasing.
  float span = hw * (vKind < 0.5 ? 2.5 : 1.0) + 1.5 * k;
  float y0 = -iLook.z;
  float y1 = 1.0 + 1.5 * k / max(L, 1.0);
  float y = mix(y0, y1, position.y + 0.5);
  vec2 p = sb + ax * (y * L) + nrm * (position.x * 2.0 * span);
  float yc = clamp(y, 0.0, 1.0);
  float w = mix(cb.w, ct.w, yc);
  float z = mix(cb.z / cb.w, ct.z / ct.w, yc);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
  vP = vec2(position.x * 2.0 * span, y);
  vHalf = hw;
  vLenPx = L;
  vK = k;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
uniform vec3 uNavy;
uniform vec3 uGold;
varying vec2 vP;
varying float vHalf;
varying float vKind;
varying vec4 vLook;
varying float vLenPx;
varying float vK;
/** Coverage of |x| < h with a ~1 px soft edge. */
float inside(float x, float h) {
  return clamp(h - abs(x) + 0.5, 0.0, 1.0);
}
void main() {
  float x = vP.x;
  float y = vP.y;
  float k = vK;
  float A = vLook.x;
  float hdr = vLook.y;
  vec3 body = vec3(0.0);
  float a = 0.0;
  vec3 add = vec3(0.0);
  if (vKind > 1.5 && vKind < 2.5) {
    // FAR: a streak, white head (tip) fading to cyan and nothing at the tail; ≥ the floor wide at the head.
    float t = clamp(y, 0.0, 1.0);
    float h = vHalf * (0.35 + 0.65 * t) * (1.0 - smoothstep(0.92, 1.0, y));
    float c = inside(x, h) * step(0.0, y);
    float head = smoothstep(0.55, 0.95, t);
    add = mix(uCyanLit * 0.75, uWhite * hdr, head * head) * c * pow(t, 1.4) * A;
    gl_FragColor = vec4(add, 0.0);
    return;
  }
  if (vKind > 2.5) {
    // SPINE over a real blade: the white spine and a narrow cyan rim along it, the blade's own body under it.
    float yy = clamp(y, 0.0, 1.0);
    float ends = smoothstep(0.02, 0.1, y) * (1.0 - smoothstep(0.86, 0.98, y));
    float sp = inside(x, max(1.1 * k, vHalf * 0.3)) * ends;
    float rim = inside(x, max(3.0 * k, vHalf)) * ends * (1.0 - sp);
    add = (uWhite * hdr * sp + uCyan * 0.85 * rim) * A * (0.6 + 0.4 * yy);
    gl_FragColor = vec4(add, 0.0);
    return;
  }
  bool lead = vKind < 0.5;
  // Where the blade starts along the strip (a lead's hilt below it) and where its taper to the point starts.
  float b0 = lead ? 0.2 : 0.0;
  float taper0 = 0.78;
  float u = (y - b0) / (1.0 - b0);
  // The blade's half width: full, then a point; a slightly rounded root.
  float h = vHalf * (u < taper0 ? 1.0 : pow(max(0.0, (1.0 - u) / (1.0 - taper0)), 0.85));
  h *= smoothstep(-0.02, 0.05, u);
  float blade = inside(x, h) * step(0.0, u);
  float edgePx = max(1.0 * k, 0.16 * vHalf);
  float edge = blade * (1.0 - inside(x, h - edgePx));
  // Two-tone bevel: the lit side brighter, the shaded side the deep cyan.
  vec3 bodyCol = mix(uCyan, uCyanLit, step(0.0, x));
  body = mix(bodyCol, uNavy, edge) * blade;
  a = blade;
  // The hard white spine (≥ 2 px at 1080p), from the root to just short of the point.
  float spineH = max(1.0 * k, 0.2 * vHalf);
  float spine = inside(x, spineH * (u < 0.85 ? 1.0 : max(0.0, (1.0 - u) / 0.15))) * smoothstep(0.0, 0.04, u) * step(u, 0.97);
  add += uWhite * hdr * spine;
  if (lead) {
    // The hilt in gold (the only gold): pommel, grip (navy wrapped, gold bands), guard (a bar ~2.4 blades wide).
    float g0 = 0.17;
    float guard = inside(x, vHalf * 2.4) * step(g0, y) * step(y, b0 + 0.005);
    float grip = inside(x, vHalf * 0.55) * step(0.045, y) * step(y, g0);
    float bands = step(0.5, fract(y * 46.0));
    float pommel = inside(x, vHalf * 0.9 * (1.0 - abs(y - 0.022) / 0.024)) * step(0.0, y) * step(y, 0.046);
    vec3 hilt = uGold * guard + mix(uNavy, uGold * 0.8, bands) * grip * (1.0 - guard) + uGold * pommel;
    float hA = max(guard, max(grip, pommel));
    body = mix(body, hilt, hA);
    a = max(a, hA);
    // A navy line under the guard so it reads apart from the blade.
    float gEdge = hA * (1.0 - inside(x, vHalf * 2.4 - edgePx)) * guard;
    body = mix(body, uNavy, gEdge);
  } else if (y < 0.0) {
    // MID's short streak behind its root: white to cyan, ≥ 4 px wide at its root, gone at its end.
    float t = clamp(1.0 + y / max(vLook.z, 1e-3), 0.0, 1.0);
    float sh = max(2.0 * k, vHalf * 0.55) * t;
    float c = inside(x, sh);
    add += mix(uCyan * 0.8, uWhite * 1.6, t * t) * c * t;
  }
  gl_FragColor = vec4(body * a * 0.95 * A + add * A, a * 0.95 * A);
}`;

/** One instanced draw of graphic swords; fill with begin / push… / end each frame. */
export class GraphicSwords {
  readonly mesh: THREE.Mesh;
  private readonly tip: Float32Array;
  private readonly base: Float32Array;
  private readonly look: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];
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
    this.tip = new Float32Array(capacity * 4);
    this.base = new Float32Array(capacity * 4);
    this.look = new Float32Array(capacity * 4);
    this.attrs = [new THREE.InstancedBufferAttribute(this.tip, 4), new THREE.InstancedBufferAttribute(this.base, 4), new THREE.InstancedBufferAttribute(this.look, 4)];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iTip", this.attrs[0]!);
    g.setAttribute("iBase", this.attrs[1]!);
    g.setAttribute("iLook", this.attrs[2]!);
    g.instanceCount = 0;
    this.geometry = g;
    this.view = { value: new THREE.Vector2(1920, 1080) };
    const v3 = (c: readonly number[]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uView: this.view,
        uWhite: { value: v3(GRAMMAR.white) },
        uCyan: { value: v3(GRAMMAR.cyan) },
        uCyanLit: { value: v3(GRAMMAR.cyanLit) },
        uNavy: { value: v3(GRAMMAR.navy) },
        uGold: { value: v3(GRAMMAR.gold) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    // The viewport of the target being drawn (the composer's, at its pixel ratio): widths are px of it.
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.vp);
      this.view.value.set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
    };
  }

  begin(): void {
    this.n = 0;
  }

  /**
   * One sword: base (x, y, z) to tip (x, y, z), `halfM` its blade's half width (m), `kind` (SWORD_*), `alpha`,
   * `spine` its spine's HDR level, `streak` the streak behind its base (share of its length), `floorPx` the half-width
   * floor (px at 1080p).
   */
  push(bx: number, by: number, bz: number, tx: number, ty: number, tz: number, halfM: number, kind: number, alpha: number, spine: number, streak: number, floorPx: number): void {
    if (this.n >= this.capacity || alpha <= 0.002) return;
    const o = this.n * 4;
    this.tip[o] = tx;
    this.tip[o + 1] = ty;
    this.tip[o + 2] = tz;
    this.tip[o + 3] = halfM;
    this.base[o] = bx;
    this.base[o + 1] = by;
    this.base[o + 2] = bz;
    this.base[o + 3] = kind;
    this.look[o] = Math.min(1, alpha);
    this.look[o + 1] = spine;
    this.look[o + 2] = streak;
    this.look[o + 3] = floorPx;
    this.n += 1;
  }

  /** Swords written this frame. */
  get count(): number {
    return this.n;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (let k = 0; k < 3; k += 1) {
      const a = this.attrs[k]!;
      const r = this.ranges[k]!;
      r.count = Math.max(1, this.n) * 4;
      a.updateRanges.length = 0;
      a.updateRanges.push(r);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
