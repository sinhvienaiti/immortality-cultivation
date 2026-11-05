/**
 * The soft energy trail behind a flying sword-qi crescent (key 2, Nhất Tuyến Xuyên Vân; owner 05/11 ~22:40: "chưa tạo ra
 * hiệu ứng ánh sáng dạng năng lượng mềm đẹp bay theo sau nó cho sống động"; docs/work/tasks/crescent-trail.md): a
 * camera-facing band laid along the crescent's path, from the concave side of its crescent back TRAIL_M m, as wide as
 * most of the crescent's span at its head and thinning to nothing at its tail. Its matter is an authored band (the
 * element's ribbon clip, else a strip of the sword aura's, aura/strips/), scrolled along it, coloured by the clip or the
 * element's ramp; its edges fade over most of its half width (never a hard edge), its halo held ≤ 0.9 a channel with a
 * thin brighter core. When the crescent lands it stays and erodes from its tail over FADE_S. Added light (or, for a
 * body layer, ink under it). No allocation per frame.
 */
import * as THREE from "three";
import type { Rgb } from "./weapons";

/** Samples along the band, the length it trails (m), how long it takes to erode once its crescent is gone (s). */
const N = 24;
export const TRAIL_M = 5;
export const FADE_S = 0.5;
/** History kept (head positions, one a frame). */
const HISTORY = 64;

/** What a trail is made of. */
export interface TrailMatter {
  /** An authored band: a strip (cols = rows = frames = 1) or a flipbook atlas played at `fps`. */
  readonly map: THREE.Texture;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  readonly fps: number;
  /** "clip": its own colours; "ramp": its light coloured body → edge, its brightest line the core. */
  readonly colours: "clip" | "ramp";
  readonly core: Rgb;
  readonly edge: Rgb;
  readonly body: Rgb;
  /** "add": light; "ink": matter in `ink` (normal blend, its alpha or light as coverage), drawn under the light. */
  readonly blend: "add" | "ink";
  readonly ink?: Rgb;
  /** Share of the band's (or cell's) height laid across the trail's width (default 0.5, its bright middle). */
  readonly across?: number;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uFps;
uniform float uTime;
uniform float uLen;
uniform float uFade;
uniform float uClip;
uniform float uInk;
uniform float uAcross;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uBody;
uniform vec3 uInkCol;
varying vec2 vUv;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  // u: 0 at the crescent … 1 at the tail; v: across.
  float side = 1.0 - abs(vUv.y * 2.0 - 1.0);
  // Soft edges: faded over 45 % of the half width (never a hard edge).
  float soft = smoothstep(0.0, 0.45, side);
  // It rises out of the crescent's hollow (no straight edge at its head) and thins away to its tail.
  float taper = pow(1.0 - vUv.x, 1.3) * smoothstep(0.0, 0.08, vUv.x);
  float f = mod(floor(uTime * uFps), uFrames);
  vec2 cell = vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x));
  // The band scrolls back along the trail (the matter flows off the crescent), one tile every 8 m; its middle (uAcross of
  // its height) spans the band's width, so the light fills the band instead of one thin line.
  vec2 tuv = vec2(clamp(fract(vUv.x * uLen * 0.125 + uTime * 2.0), 0.004, 0.996), clamp(0.5 + (vUv.y - 0.5) * uAcross, 0.004, 0.996));
  vec4 t = texture2D(map, (cell + tuv) / uGrid);
  float l = max(t.r, max(t.g, t.b));
  // It erodes from the tail toward the crescent once the crescent is gone.
  float n = tNoise(vUv * vec2(14.0, 4.0) + uTime * 0.7);
  float keep = 1.0 - smoothstep(1.0 - uFade * 1.25 - 0.05, 1.0 - uFade * 1.25 + 0.1, vUv.x + (n - 0.5) * 0.25);
  float a = soft * taper * keep;
  if (a <= 0.002) discard;
  if (uInk > 0.5) {
    float cover = min(1.0, (t.a < 0.999 ? t.a : l) * 1.6) * a;
    gl_FragColor = vec4(uInkCol * cover, cover);
    return;
  }
  vec3 col = uClip > 0.5 ? t.rgb * 1.3 : mix(uBody, uEdge, smoothstep(0.1, 0.6, l)) * l * 2.4;
  // The halo never reaches the bloom; only a thin core along the middle near the crescent does.
  col = min(col, vec3(0.9));
  float core = smoothstep(0.75, 1.0, side) * (1.0 - smoothstep(0.0, 0.5, vUv.x)) * smoothstep(0.2, 0.8, l);
  col += uCore * core * 0.9;
  gl_FragColor = vec4(col * a, 0.0);
}`;

const v = new THREE.Vector3();
const t = new THREE.Vector3();
const toCam = new THREE.Vector3();
const side = new THREE.Vector3();

export class CrescentTrail {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly hx = new Float32Array(HISTORY);
  private readonly hy = new Float32Array(HISTORY);
  private readonly hz = new Float32Array(HISTORY);
  /** Path length from the first history point (m). */
  private readonly hs = new Float32Array(HISTORY);
  private count = 0;
  private width = 1;
  /** Seconds since the last head (0: the crescent flies this frame), −1: no trail. */
  private idle = -1;
  private time = 0;
  private headed = false;

  constructor(matter: TrailMatter, renderOrder = 11) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    const uv = new Float32Array(N * 2 * 2);
    const index: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const u = i / (N - 1);
      uv.set([u, 0, u, 1], i * 4);
      if (i < N - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    const ink = matter.blend === "ink";
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        map: { value: matter.map },
        uGrid: { value: new THREE.Vector2(matter.cols, matter.rows) },
        uFrames: { value: matter.frames },
        uFps: { value: matter.fps },
        uTime: { value: 0 },
        uLen: { value: TRAIL_M },
        uFade: { value: 0 },
        uClip: { value: matter.colours === "clip" ? 1 : 0 },
        uInk: { value: ink ? 1 : 0 },
        uAcross: { value: matter.across ?? 0.5 },
        uCore: { value: new THREE.Vector3(...matter.core) },
        uEdge: { value: new THREE.Vector3(...matter.edge) },
        uBody: { value: new THREE.Vector3(...matter.body) },
        uInkCol: { value: new THREE.Vector3(...(matter.ink ?? [0, 0, 0])) },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: ink ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ink ? renderOrder - 1 : renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "fx-crescent-trail";
  }

  /** The crescent's concave side this frame (where the band starts) and the band's width there (m). */
  head(x: number, y: number, z: number, width: number): void {
    // A new flight (gone a while, or jumped far): a fresh trail.
    const n = this.count;
    if (this.idle > 0.2 || this.idle < 0 || (n > 0 && Math.hypot(x - this.hx[n - 1]!, z - this.hz[n - 1]!) > 8)) this.count = 0;
    if (this.count === HISTORY) {
      this.hx.copyWithin(0, 1);
      this.hy.copyWithin(0, 1);
      this.hz.copyWithin(0, 1);
      this.hs.copyWithin(0, 1);
      this.count -= 1;
    }
    const i = this.count;
    const prev = i > 0 ? Math.hypot(x - this.hx[i - 1]!, y - this.hy[i - 1]!, z - this.hz[i - 1]!) : 0;
    this.hx[i] = x;
    this.hy[i] = y;
    this.hz[i] = z;
    this.hs[i] = i > 0 ? this.hs[i - 1]! + prev : 0;
    this.count = i + 1;
    this.width = width;
    this.idle = 0;
    this.headed = true;
  }

  /** Lays the band along the path and ages it (after the skills, once a frame). */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    if (this.idle < 0) return;
    if (!this.headed) this.idle += dt;
    this.headed = false;
    const fade = Math.min(1, this.idle / FADE_S);
    if (fade >= 1 || this.count < 2) {
      if (fade >= 1) this.idle = -1;
      this.mesh.visible = false;
      return;
    }
    const last = this.count - 1;
    const headS = this.hs[last]!;
    const len = Math.min(TRAIL_M, headS);
    if (len < 0.05) {
      this.mesh.visible = false;
      return;
    }
    camera.getWorldPosition(toCam);
    let k = last;
    for (let i = 0; i < N; i += 1) {
      const u = i / (N - 1);
      const s = headS - u * len;
      while (k > 0 && this.hs[k - 1]! > s) k -= 1;
      const k0 = Math.max(0, k - 1);
      const span = this.hs[k]! - this.hs[k0]!;
      const w = span > 1e-6 ? (s - this.hs[k0]!) / span : 0;
      v.set(this.hx[k0]! + (this.hx[k]! - this.hx[k0]!) * w, this.hy[k0]! + (this.hy[k]! - this.hy[k0]!) * w, this.hz[k0]! + (this.hz[k]! - this.hz[k0]!) * w);
      t.set(this.hx[k]! - this.hx[k0]!, this.hy[k]! - this.hy[k0]!, this.hz[k]! - this.hz[k0]!);
      if (t.lengthSq() < 1e-8) t.set(this.hx[last]! - this.hx[0]!, this.hy[last]! - this.hy[0]!, this.hz[last]! - this.hz[0]!);
      side.copy(toCam).sub(v).cross(t).normalize();
      // Wide at the crescent, thinning to a point at its tail.
      const half = this.width * 0.5 * (1 - 0.85 * u);
      this.pos.set([v.x + side.x * half, v.y + side.y * half, v.z + side.z * half, v.x - side.x * half, v.y - side.y * half, v.z - side.z * half], i * 6);
    }
    const g = this.mesh.geometry;
    g.attributes.position!.needsUpdate = true;
    const u = this.mesh.material.uniforms;
    u.uTime!.value = this.time;
    u.uLen!.value = len;
    u.uFade!.value = fade;
    this.mesh.visible = true;
  }

  /** Its ramp (a "ramp" matter: the element's core, edge and body, linear). */
  colours(core: Rgb, edge: Rgb, body: Rgb): void {
    const u = this.mesh.material.uniforms;
    (u.uCore!.value as THREE.Vector3).set(core[0], core[1], core[2]);
    (u.uEdge!.value as THREE.Vector3).set(edge[0], edge[1], edge[2]);
    (u.uBody!.value as THREE.Vector3).set(body[0], body[1], body[2]);
  }

  clear(): void {
    this.count = 0;
    this.idle = -1;
    this.headed = false;
    this.mesh.visible = false;
  }
}
