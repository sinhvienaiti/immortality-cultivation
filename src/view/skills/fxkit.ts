/**
 * Building blocks for layered skill VFX (docs/games/VFX_STANDARD.md §3,
 * skill game-vfx-layered): instanced billboard sprites (additive light or
 * normal-blended ink, optionally stretched along velocity or laid flat on the
 * ground), camera-facing ribbons, and ground planes with procedural sigil
 * shaders that reveal with the typing progress. View only: nothing here
 * touches the sim. Pools are preallocated; spawning and updating never
 * allocate. Bright cores are HDR (3–6) so only they bloom; halos stay ≤ 0.9
 * (LESSONS §5).
 */
import * as THREE from "three";

// ── Small helpers ───────────────────────────────────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 → 1 → 0 over [0, 1] with a fast rise (`rise` share) and a smooth fall. */
export function pulse(t: number, rise = 0.15): number {
  if (t <= 0 || t >= 1) return 0;
  return t < rise ? t / rise : 1 - easeInOutSine((t - rise) / (1 - rise));
}

/** A small seeded random (mulberry32): VFX randomness is repeatable for captures (VFX_STANDARD §3.1 rule 4). */
export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  reseed(seed: number): void {
    this.s = seed >>> 0;
  }
}

// ── Sprite pool ─────────────────────────────────────────────────────────────

export type SpriteBlend = "add" | "ink";
export type SpriteFacing = "camera" | "ground";

const SPRITE_VERTEX = /* glsl */ `
uniform float uPull;   // camera sprites: pulled toward the camera along the view ray by this share of their size
uniform float uCrop;   // share of the texture (centred) the quad shows; the quad shrinks with it
attribute vec4 iPos;   // xyz, size (m)
attribute vec4 iCol;   // rgb (HDR), alpha
attribute vec4 iRot;   // rotation (rad), stretch (s), aspect, unused
attribute vec3 iVel;   // world velocity (m/s)
varying vec2 vUv;
varying vec4 vCol;
#ifdef GROUND_FADE
varying float vWorldY;
#endif
void main() {
  vUv = 0.5 + (uv - 0.5) * uCrop;
  vCol = iCol;
  vec2 c = position.xy * uCrop;
  float s = iPos.w;
#ifdef GROUND
  float cr = cos(iRot.x), sr = sin(iRot.x);
  vec2 o = vec2(cr * c.x - sr * c.y * iRot.z, sr * c.x + cr * c.y * iRot.z) * s;
  vec4 mv = viewMatrix * vec4(iPos.x + o.x, iPos.y, iPos.z + o.y, 1.0);
#else
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  // A big quad near the ground would be cut by it in a hard line (the camera looks down at 55°):
  // bring it toward the camera along its view ray and shrink it by the same ratio, so its place
  // and size on screen stay and only its depth changes.
  float k = 1.0;
  if (uPull > 0.0) {
    float d = length(mv.xyz);
    if (d > 1e-4) k = max(d - s * uPull, min(d, 0.5)) / d;
  }
  mv.xyz *= k;
  vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
  float len = length(vv.xy);
  vec2 o;
  if (iRot.y > 0.0 && len > 1e-4) {
    vec2 d = vv.xy / len;
    vec2 p = vec2(-d.y, d.x);
    o = d * c.y * (s + len * iRot.y) + p * c.x * s * iRot.z;
  } else {
    float cr = cos(iRot.x), sr = sin(iRot.x);
    o = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) * s;
    o.x *= iRot.z;
  }
  mv.xy += o * k;
#endif
#ifdef GROUND_FADE
  // World height of the vertex (the view matrix is a rotation plus a translation).
  vWorldY = dot(viewMatrix[1].xyz, mv.xyz) + cameraPosition.y;
#endif
  gl_Position = projectionMatrix * mv;
}`;

const SPRITE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float uCrop;
uniform float uCropFade;
uniform float uGroundFade;
varying vec2 vUv;
varying vec4 vCol;
#ifdef GROUND_FADE
varying float vWorldY;
#endif
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
#ifdef CROP
  // Fade to nothing at the circle inscribed in the cropped window: no square edge, corners discarded.
  a *= 1.0 - smoothstep(uCropFade, 1.0, length(vUv - 0.5) * 2.0 / uCrop);
#endif
#ifdef GROUND_FADE
  // Gone at the ground, so the floor never slices the quad in a hard line.
  a *= smoothstep(0.0, uGroundFade, vWorldY);
#endif
  if (a < 0.002) discard;
#ifdef INK
  gl_FragColor = vec4(vCol.rgb * a, a);
#else
  gl_FragColor = vec4(vCol.rgb * t.rgb * a, a);
#endif
}`;

/** What the next spawn looks like; set fields, then call `emit()`. Reused, never allocated per spawn. */
export class SpriteSpec {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Seconds; ≤ 0 makes a one-frame sprite (re-emitted every frame by its caller). */
  life = 0.3;
  size0 = 0.5;
  size1 = 0.5;
  rot = 0;
  rotV = 0;
  r = 1;
  g = 1;
  b = 1;
  a = 1;
  /** Seconds of fade-in at the start (0: full at age 0, the first frame is the brightest, VFX_STANDARD §3.1 rule 5). */
  fadeIn = 0;
  /** Velocity damping per second. */
  drag = 0;
  /** Added to vy per second. */
  gravity = 0;
  /** Velocity stretch in seconds (0: round). */
  stretch = 0;
  /** Width over height of the quad. */
  aspect = 1;
  reset(): this {
    this.vx = this.vy = this.vz = 0;
    this.life = 0.3;
    this.size0 = this.size1 = 0.5;
    this.rot = this.rotV = 0;
    this.r = this.g = this.b = this.a = 1;
    this.fadeIn = this.drag = this.gravity = this.stretch = 0;
    this.aspect = 1;
    return this;
  }
}

const F = 21; // floats per sprite state

/**
 * Dynamic attributes that upload only the items in use. Each keeps one update
 * range for good (three's addUpdateRange makes an object per call, and three
 * empties the list after every upload), so a frame allocates nothing here.
 */
class PrefixAttribute extends THREE.BufferAttribute {
  private readonly prefix = { start: 0, count: 0 };
  constructor(array: Float32Array, itemSize: number) {
    super(array, itemSize);
    this.setUsage(THREE.DynamicDrawUsage);
    this.updateRanges.push(this.prefix);
  }
  override clearUpdateRanges(): void {}
  /** Sends the first `items` items at the next render. */
  sendPrefix(items: number): void {
    this.prefix.count = items * this.itemSize;
    this.needsUpdate = true;
  }
}

class PrefixInstancedAttribute extends THREE.InstancedBufferAttribute {
  private readonly prefix = { start: 0, count: 0 };
  constructor(array: Float32Array, itemSize: number) {
    super(array, itemSize);
    this.setUsage(THREE.DynamicDrawUsage);
    this.updateRanges.push(this.prefix);
  }
  override clearUpdateRanges(): void {}
  sendPrefix(items: number): void {
    this.prefix.count = items * this.itemSize;
    this.needsUpdate = true;
  }
}

/** Sends the first `items` items of each attribute, or nothing when `items` is 0 (the mesh is hidden then). */
function uploadPrefix(attrs: readonly (PrefixAttribute | PrefixInstancedAttribute)[], items: number): void {
  if (items <= 0) return;
  for (const a of attrs) a.sendPrefix(items);
}

export interface SpritePoolOptions {
  /** Camera sprites: pulled toward the camera along the view ray by this share of their size (default 0.5). */
  pull?: number;
  /**
   * Share of the texture (centred) the quad shows, for soft textures whose
   * visible shape fills only the middle (default 1, all). Sizes keep meaning
   * the whole texture; the quad and the UVs shrink together, and the window
   * fades to nothing at its inscribed circle, so far fewer pixels are drawn.
   */
  crop?: number;
  /** Where that fade starts, as a share of the window's radius (default 0.8). */
  cropFade?: number;
  /** Camera sprites: fade in over this many metres above the ground, so the floor never slices them (0: off). */
  groundFade?: number;
}

export class SpritePool {
  readonly mesh: THREE.Mesh;
  readonly spec = new SpriteSpec();
  private readonly state: Float32Array;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly rotA: Float32Array;
  private readonly vel: Float32Array;
  private readonly attrs: PrefixInstancedAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private live = 0;

  constructor(
    readonly capacity: number,
    texture: THREE.Texture,
    blend: SpriteBlend,
    facing: SpriteFacing = "camera",
    renderOrder = 10,
    opts: SpritePoolOptions = {},
  ) {
    const pull = opts.pull ?? 0.5;
    const crop = Math.min(1, Math.max(0.05, opts.crop ?? 1));
    const cropFade = Math.min(0.99, Math.max(0, opts.cropFade ?? 0.8));
    const groundFade = facing === "camera" ? Math.max(0, opts.groundFade ?? 0) : 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    this.pos = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 4);
    this.rotA = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 3);
    this.attrs = [
      new PrefixInstancedAttribute(this.pos, 4),
      new PrefixInstancedAttribute(this.col, 4),
      new PrefixInstancedAttribute(this.rotA, 4),
      new PrefixInstancedAttribute(this.vel, 3),
    ];
    geometry.setAttribute("iPos", this.attrs[0]!);
    geometry.setAttribute("iCol", this.attrs[1]!);
    geometry.setAttribute("iRot", this.attrs[2]!);
    geometry.setAttribute("iVel", this.attrs[3]!);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    const defines: Record<string, string> = {};
    if (blend === "ink") defines.INK = "";
    if (facing === "ground") defines.GROUND = "";
    if (crop < 1) defines.CROP = "";
    if (groundFade > 0) defines.GROUND_FADE = "";
    const material = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      uniforms: {
        map: { value: texture },
        uPull: { value: facing === "camera" ? Math.max(0, pull) : 0 },
        uCrop: { value: crop },
        uCropFade: { value: cropFade },
        uGroundFade: { value: groundFade },
      },
      defines,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: blend === "add" ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    // Hidden while empty: the renderer then skips it whole (no upload, no program or uniform setup).
    this.mesh.visible = false;
    this.state = new Float32Array(capacity * F);
  }

  get count(): number {
    return this.live;
  }

  /**
   * Drops the one-frame sprites already drawn. Call it at the start of a
   * frame, before that frame's cards are emitted: otherwise last frame's
   * cards still hold the capacity the new ones need (a pool would have to be
   * twice the cards it shows, or cards blink every other frame). Keeps the
   * order of the rest, so a pool holding only one-frame cards copies nothing.
   */
  dropOneFrame(): void {
    const st = this.state;
    let w = 0;
    for (let i = 0; i < this.live; i += 1) {
      const o = i * F;
      if (st[o + 7]! <= 0 && st[o + 6]! > 0) continue;
      if (w !== i) st.copyWithin(w * F, o, o + F);
      w += 1;
    }
    this.live = w;
  }

  /** Spawns one sprite from `spec` (dropped when full: callers cap their own bursts). */
  emit(): void {
    if (this.live >= this.capacity) return;
    const s = this.spec;
    const o = this.live * F;
    const st = this.state;
    st[o] = s.x;
    st[o + 1] = s.y;
    st[o + 2] = s.z;
    st[o + 3] = s.vx;
    st[o + 4] = s.vy;
    st[o + 5] = s.vz;
    st[o + 6] = 0; // age
    st[o + 7] = s.life;
    st[o + 8] = s.size0;
    st[o + 9] = s.size1;
    st[o + 10] = s.rot;
    st[o + 11] = s.rotV;
    st[o + 12] = s.r;
    st[o + 13] = s.g;
    st[o + 14] = s.b;
    st[o + 15] = s.a;
    st[o + 16] = s.fadeIn;
    st[o + 17] = s.drag;
    st[o + 18] = s.gravity;
    st[o + 19] = s.stretch;
    st[o + 20] = s.aspect;
    this.live += 1;
    this.write(this.live - 1);
  }

  clear(): void {
    this.live = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    const st = this.state;
    let i = 0;
    while (i < this.live) {
      const o = i * F;
      if (st[o + 7]! <= 0) {
        // One-frame sprite (life ≤ 0): drawn once, gone at the next update whatever dt is,
        // so cards re-emitted every frame never pile up during hit-stop (dropOneFrame
        // removes them earlier, before the next frame's cards).
        if (st[o + 6]! > 0) {
          const last = (this.live - 1) * F;
          if (last !== o) st.copyWithin(o, last, last + F);
          this.live -= 1;
          continue;
        }
        st[o + 6] = 1;
        this.write(i);
        i += 1;
        continue;
      }
      const age = st[o + 6]! + dt;
      if (age >= st[o + 7]!) {
        // Swap the last live sprite in.
        const last = (this.live - 1) * F;
        if (last !== o) st.copyWithin(o, last, last + F);
        this.live -= 1;
        continue;
      }
      st[o + 6] = age;
      const drag = st[o + 17]!;
      if (drag > 0) {
        const k = Math.max(0, 1 - drag * dt);
        st[o + 3] = st[o + 3]! * k;
        st[o + 4] = st[o + 4]! * k;
        st[o + 5] = st[o + 5]! * k;
      }
      st[o + 4] = st[o + 4]! + st[o + 18]! * dt;
      st[o] = st[o]! + st[o + 3]! * dt;
      st[o + 1] = st[o + 1]! + st[o + 4]! * dt;
      st[o + 2] = st[o + 2]! + st[o + 5]! * dt;
      st[o + 10] = st[o + 10]! + st[o + 11]! * dt;
      this.write(i);
      i += 1;
    }
    this.geometry.instanceCount = this.live;
    this.mesh.visible = this.live > 0;
    uploadPrefix(this.attrs, this.live);
  }

  private write(i: number): void {
    const st = this.state;
    const o = i * F;
    const age = st[o + 6]!;
    const life = st[o + 7]!;
    const once = life <= 0;
    const t = once ? 0 : age / life;
    const fadeIn = st[o + 16]!;
    let alpha = !once && fadeIn > 0 && age < fadeIn ? age / fadeIn : 1;
    alpha *= 1 - easeInCubic(t);
    const size = lerp(st[o + 8]!, st[o + 9]!, easeOutCubic(t));
    const p = i * 4;
    this.pos[p] = st[o]!;
    this.pos[p + 1] = st[o + 1]!;
    this.pos[p + 2] = st[o + 2]!;
    this.pos[p + 3] = size;
    this.col[p] = st[o + 12]!;
    this.col[p + 1] = st[o + 13]!;
    this.col[p + 2] = st[o + 14]!;
    this.col[p + 3] = st[o + 15]! * alpha;
    this.rotA[p] = st[o + 10]!;
    this.rotA[p + 1] = st[o + 19]!;
    this.rotA[p + 2] = st[o + 20]!;
    const v = i * 3;
    this.vel[v] = st[o + 3]!;
    this.vel[v + 1] = st[o + 4]!;
    this.vel[v + 2] = st[o + 5]!;
  }
}

// ── Ribbons ─────────────────────────────────────────────────────────────────

const RIBBON_VERTEX = /* glsl */ `
attribute float aT;
attribute vec4 aCol;
attribute vec3 aRim;
varying float vT;
varying vec4 vCol;
varying vec3 vRim;
varying float vSide;
void main() {
  vT = aT;
  vCol = aCol;
  vRim = aRim;
  vSide = mod(float(gl_VertexID), 2.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
varying float vT;
varying vec4 vCol;
varying vec3 vRim;
varying float vSide;
void main() {
  // vT: 0 at the head, 1 at the tail; vSide 0/1 across the strip.
  // Sword-light: a thin HDR core (vCol, the only part that blooms) inside a wide
  // coloured halo (vRim, <= 0.9), so the trail reads as light, not as a white smear.
  float s = clamp(1.0 - abs(vSide * 2.0 - 1.0), 0.0, 1.0);
  float core = pow(s, 7.0);
  float body = s * s * (3.0 - 2.0 * s);
  vec4 t = texture2D(map, vec2(vT * 2.0 - uTime * 1.5, vSide));
  float erode = smoothstep(0.0, 0.35, t.a + (1.0 - vT) * 0.6 - vT * 0.5);
  float a = vCol.a * erode * (1.0 - vT);
  vec3 rgb = vRim * body * 0.95 + vCol.rgb * core * (1.0 - vT * 0.6);
  gl_FragColor = vec4(rgb * a, a);
}`;

/** Camera-facing ribbons fed head positions every frame (sword trails, dash streaks). */
export class RibbonPool {
  readonly mesh: THREE.Mesh;
  private readonly points: number;
  private readonly hist: Float32Array; // capacity × points × 3 (ring)
  private readonly heads: Int32Array;
  private readonly filled: Int32Array;
  private readonly widthM: Float32Array;
  private readonly colour: Float32Array; // r g b a per ribbon
  private readonly rimC: Float32Array; // r g b per ribbon (halo, ≤ 0.9)
  private readonly active: Uint8Array;
  private readonly positions: Float32Array;
  private readonly ts: Float32Array;
  private readonly cols: Float32Array;
  private readonly rims: Float32Array;
  private readonly attrs: PrefixAttribute[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly camPos = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private time = 0;

  constructor(readonly capacity: number, points: number, texture: THREE.Texture, renderOrder = 12) {
    this.points = points;
    this.hist = new Float32Array(capacity * points * 3);
    this.heads = new Int32Array(capacity);
    this.filled = new Int32Array(capacity);
    this.widthM = new Float32Array(capacity);
    this.colour = new Float32Array(capacity * 4);
    this.rimC = new Float32Array(capacity * 3);
    this.active = new Uint8Array(capacity);
    const verts = capacity * points * 2;
    this.positions = new Float32Array(verts * 3);
    this.ts = new Float32Array(verts);
    this.cols = new Float32Array(verts * 4);
    this.rims = new Float32Array(verts * 3);
    const index: number[] = [];
    for (let r = 0; r < capacity; r += 1) {
      for (let p = 0; p < points - 1; p += 1) {
        const a = (r * points + p) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(index);
    this.attrs = [
      new PrefixAttribute(this.positions, 3),
      new PrefixAttribute(this.ts, 1),
      new PrefixAttribute(this.cols, 4),
      new PrefixAttribute(this.rims, 3),
    ];
    geometry.setAttribute("position", this.attrs[0]!);
    geometry.setAttribute("aT", this.attrs[1]!);
    geometry.setAttribute("aCol", this.attrs[2]!);
    geometry.setAttribute("aRim", this.attrs[3]!);
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      uniforms: { map: { value: texture }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
  }

  /** Starts ribbon `i` at a point with a width and an HDR colour. */
  start(i: number, x: number, y: number, z: number, widthM: number, r: number, g: number, b: number, a: number): void {
    this.active[i] = 1;
    this.heads[i] = 0;
    this.filled[i] = 1;
    this.widthM[i] = widthM;
    const c = i * 4;
    this.colour[c] = r;
    this.colour[c + 1] = g;
    this.colour[c + 2] = b;
    this.colour[c + 3] = a;
    // Halo defaults to the core's hue at 0.85 (≤ 0.9); setRim gives it its own colour.
    const m = Math.max(r, g, b, 1e-3);
    this.rimC[i * 3] = (r / m) * 0.85;
    this.rimC[i * 3 + 1] = (g / m) * 0.85;
    this.rimC[i * 3 + 2] = (b / m) * 0.85;
    const base = i * this.points * 3;
    for (let p = 0; p < this.points; p += 1) {
      this.hist[base + p * 3] = x;
      this.hist[base + p * 3 + 1] = y;
      this.hist[base + p * 3 + 2] = z;
    }
  }

  /** The halo colour of ribbon `i` (linear, keep each channel ≤ 0.9: it must not bloom). */
  setRim(i: number, r: number, g: number, b: number): void {
    this.rimC[i * 3] = r;
    this.rimC[i * 3 + 1] = g;
    this.rimC[i * 3 + 2] = b;
  }

  /** The head of ribbon `i` this frame. */
  push(i: number, x: number, y: number, z: number): void {
    if (this.active[i] === 0) return;
    const h = (this.heads[i]! + 1) % this.points;
    this.heads[i] = h;
    this.filled[i] = Math.min(this.points, this.filled[i]! + 1);
    const o = (i * this.points + h) * 3;
    this.hist[o] = x;
    this.hist[o + 1] = y;
    this.hist[o + 2] = z;
  }

  setAlpha(i: number, a: number): void {
    this.colour[i * 4 + 3] = a;
  }

  stop(i: number): void {
    this.active[i] = 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.material.uniforms.uTime!.value = this.time;
    // Only ribbons below the highest live one are built, sent and drawn; none live: hidden, nothing sent.
    let hi = 0;
    for (let r = 0; r < this.capacity; r += 1) if (this.active[r] !== 0) hi = r + 1;
    this.mesh.visible = hi > 0;
    if (hi === 0) return;
    camera.getWorldPosition(this.camPos);
    const n = this.points;
    for (let r = 0; r < hi; r += 1) {
      const vbase = r * n * 2;
      if (this.active[r] === 0) {
        for (let k = 0; k < n * 2; k += 1) this.cols[(vbase + k) * 4 + 3] = 0;
        continue;
      }
      const filled = this.filled[r]!;
      const head = this.heads[r]!;
      const base = r * n * 3;
      const w0 = this.widthM[r]!;
      const c = r * 4;
      for (let k = 0; k < n; k += 1) {
        // k = 0 the head, going back in time; clamp to what is filled.
        const kk = Math.min(k, filled - 1);
        const idx = (head - kk + n) % n;
        const idx2 = (head - Math.min(kk + 1, filled - 1) + n) % n;
        const o = base + idx * 3;
        const o2 = base + idx2 * 3;
        this.tmpA.set(this.hist[o]!, this.hist[o + 1]!, this.hist[o + 2]!);
        this.tmpB.set(this.hist[o2]!, this.hist[o2 + 1]!, this.hist[o2 + 2]!);
        this.tmpB.sub(this.tmpA);
        if (this.tmpB.lengthSq() < 1e-8) this.tmpB.set(0, 0, 1);
        this.tmpC.subVectors(this.camPos, this.tmpA);
        this.tmpB.cross(this.tmpC).normalize();
        const t = k / (n - 1);
        const w = w0 * (1 - t * 0.85);
        const v = vbase + k * 2;
        this.positions[v * 3] = this.tmpA.x + this.tmpB.x * w;
        this.positions[v * 3 + 1] = this.tmpA.y + this.tmpB.y * w;
        this.positions[v * 3 + 2] = this.tmpA.z + this.tmpB.z * w;
        this.positions[(v + 1) * 3] = this.tmpA.x - this.tmpB.x * w;
        this.positions[(v + 1) * 3 + 1] = this.tmpA.y - this.tmpB.y * w;
        this.positions[(v + 1) * 3 + 2] = this.tmpA.z - this.tmpB.z * w;
        const tt = filled > 1 ? Math.min(1, kk / Math.max(1, filled - 1)) : 1;
        this.ts[v] = tt;
        this.ts[v + 1] = tt;
        for (let s = 0; s < 2; s += 1) {
          const q = (v + s) * 4;
          this.cols[q] = this.colour[c]!;
          this.cols[q + 1] = this.colour[c + 1]!;
          this.cols[q + 2] = this.colour[c + 2]!;
          this.cols[q + 3] = this.colour[c + 3]!;
          const h = (v + s) * 3;
          this.rims[h] = this.rimC[r * 3]!;
          this.rims[h + 1] = this.rimC[r * 3 + 1]!;
          this.rims[h + 2] = this.rimC[r * 3 + 2]!;
        }
      }
    }
    this.geometry.setDrawRange(0, hi * (n - 1) * 6);
    uploadPrefix(this.attrs, hi * n * 2);
  }
}

// ── Beams ───────────────────────────────────────────────────────────────────

const BEAM_VERTEX = /* glsl */ `
attribute vec4 iBase;  // xyz, width (m)
attribute vec3 iAxis;  // base → tip (m)
attribute vec3 iCore;  // HDR core × alpha
attribute vec3 iHalo;  // halo (≤ 0.9) × alpha
attribute vec2 iFade;  // share of the length that fades at the base, at the tip
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vHalo;
varying vec2 vFade;
void main() {
  vUv = uv;
  vCore = iCore;
  vHalo = iHalo;
  vFade = iFade;
  vec4 a = viewMatrix * vec4(iBase.xyz, 1.0);
  vec4 b = viewMatrix * vec4(iBase.xyz + iAxis, 1.0);
  vec2 d = b.xy - a.xy;
  float l = length(d);
  vec2 n = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(1.0, 0.0);
  vec4 mv = mix(a, b, position.y + 0.5);
  mv.xy += n * position.x * iBase.w;
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vHalo;
varying vec2 vFade;
void main() {
  float s = clamp(1.0 - abs(vUv.x * 2.0 - 1.0), 0.0, 1.0);
  float y = clamp(vUv.y, 0.0, 1.0);
  float ends = smoothstep(0.0, max(vFade.x, 1e-3), y) * (1.0 - smoothstep(1.0 - max(vFade.y, 1e-3), 1.0, y));
  // Energy ripples running up the beam: light, not a flat card.
  float ripple = 0.82 + 0.18 * sin(y * 26.0 - uTime * 32.0);
  float halo = s * s * ripple;
  float core = pow(s, 12.0);
  vec3 rgb = (vHalo * halo + vCore * core) * ends;
  if (rgb.r + rgb.g + rgb.b < 0.002) discard;
  gl_FragColor = vec4(rgb, 1.0);
}`;

/** What the next beam looks like; set fields, then call `emit()`. Reused, never allocated per spawn. */
export class BeamSpec {
  /** Base point (world). */
  x = 0;
  y = 0;
  z = 0;
  /** Unit direction base → tip. */
  dx = 0;
  dy = 1;
  dz = 0;
  /** Length over life (m), eased out. */
  len0 = 1;
  len1 = 1;
  /** Seconds for the tip to sweep out from the base (0: full length on the first frame). */
  grow = 0;
  /** Width over life (m). */
  w0 = 0.3;
  w1 = 0.3;
  /** Base velocity (m/s): a moving streak. */
  vx = 0;
  vy = 0;
  vz = 0;
  /** Seconds; ≤ 0 makes a one-frame beam. */
  life = 0.2;
  /** Thin HDR core (blooms) and the halo around it (≤ 0.9 per channel). */
  cr = 3;
  cg = 3;
  cb = 3;
  hr = 0.8;
  hg = 0.8;
  hb = 0.8;
  a = 1;
  /** Share of the length fading out at the base and at the tip. */
  fadeBase = 0.08;
  fadeTip = 0.45;
  reset(): this {
    this.dx = this.dz = 0;
    this.dy = 1;
    this.len0 = this.len1 = 1;
    this.grow = 0;
    this.w0 = this.w1 = 0.3;
    this.vx = this.vy = this.vz = 0;
    this.life = 0.2;
    this.cr = this.cg = this.cb = 3;
    this.hr = this.hg = this.hb = 0.8;
    this.a = 1;
    this.fadeBase = 0.08;
    this.fadeTip = 0.45;
    return this;
  }
}

const BF = 25; // floats per beam state

/**
 * Axis billboards: a quad from a base point along a world direction, turned
 * to face the camera round that axis, with a thin HDR core inside a coloured
 * halo (light pillars, burst rays, sword-light streaks, light shafts). One
 * draw call; the first frame is the brightest; nothing allocates per frame.
 */
export class BeamPool {
  readonly mesh: THREE.Mesh;
  readonly spec = new BeamSpec();
  private readonly state: Float32Array;
  private readonly base: Float32Array;
  private readonly axis: Float32Array;
  private readonly core: Float32Array;
  private readonly halo: Float32Array;
  private readonly fade: Float32Array;
  private readonly attrs: PrefixInstancedAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private live = 0;
  private time = 0;

  constructor(readonly capacity: number, renderOrder = 13) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    this.base = new Float32Array(capacity * 4);
    this.axis = new Float32Array(capacity * 3);
    this.core = new Float32Array(capacity * 3);
    this.halo = new Float32Array(capacity * 3);
    this.fade = new Float32Array(capacity * 2);
    this.attrs = [
      new PrefixInstancedAttribute(this.base, 4),
      new PrefixInstancedAttribute(this.axis, 3),
      new PrefixInstancedAttribute(this.core, 3),
      new PrefixInstancedAttribute(this.halo, 3),
      new PrefixInstancedAttribute(this.fade, 2),
    ];
    geometry.setAttribute("iBase", this.attrs[0]!);
    geometry.setAttribute("iAxis", this.attrs[1]!);
    geometry.setAttribute("iCore", this.attrs[2]!);
    geometry.setAttribute("iHalo", this.attrs[3]!);
    geometry.setAttribute("iFade", this.attrs[4]!);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.state = new Float32Array(capacity * BF);
  }

  get count(): number {
    return this.live;
  }

  /** Drops the one-frame beams already drawn; call at the start of a frame, before its beams are emitted (as SpritePool.dropOneFrame). */
  dropOneFrame(): void {
    const st = this.state;
    let w = 0;
    for (let i = 0; i < this.live; i += 1) {
      const o = i * BF;
      if (st[o + 15]! <= 0 && st[o + 14]! > 0) continue;
      if (w !== i) st.copyWithin(w * BF, o, o + BF);
      w += 1;
    }
    this.live = w;
  }

  emit(): void {
    if (this.live >= this.capacity) return;
    const s = this.spec;
    const o = this.live * BF;
    const st = this.state;
    st[o] = s.x;
    st[o + 1] = s.y;
    st[o + 2] = s.z;
    st[o + 3] = s.dx;
    st[o + 4] = s.dy;
    st[o + 5] = s.dz;
    st[o + 6] = s.len0;
    st[o + 7] = s.len1;
    st[o + 8] = s.grow;
    st[o + 9] = s.w0;
    st[o + 10] = s.w1;
    st[o + 11] = s.vx;
    st[o + 12] = s.vy;
    st[o + 13] = s.vz;
    st[o + 14] = 0; // age
    st[o + 15] = s.life;
    st[o + 16] = s.cr;
    st[o + 17] = s.cg;
    st[o + 18] = s.cb;
    st[o + 19] = s.hr;
    st[o + 20] = s.hg;
    st[o + 21] = s.hb;
    st[o + 22] = s.a;
    st[o + 23] = s.fadeBase;
    st[o + 24] = s.fadeTip;
    this.live += 1;
    this.write(this.live - 1);
  }

  clear(): void {
    this.live = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime!.value = this.time;
    const st = this.state;
    let i = 0;
    while (i < this.live) {
      const o = i * BF;
      const life = st[o + 15]!;
      const age = life <= 0 ? st[o + 14]! + 1 : st[o + 14]! + dt;
      if ((life <= 0 && age > 1) || (life > 0 && age >= life)) {
        const last = (this.live - 1) * BF;
        if (last !== o) st.copyWithin(o, last, last + BF);
        this.live -= 1;
        continue;
      }
      st[o + 14] = age;
      if (life > 0) {
        st[o] = st[o]! + st[o + 11]! * dt;
        st[o + 1] = st[o + 1]! + st[o + 12]! * dt;
        st[o + 2] = st[o + 2]! + st[o + 13]! * dt;
      }
      this.write(i);
      i += 1;
    }
    this.geometry.instanceCount = this.live;
    this.mesh.visible = this.live > 0;
    uploadPrefix(this.attrs, this.live);
  }

  private write(i: number): void {
    const st = this.state;
    const o = i * BF;
    const life = st[o + 15]!;
    const age = life <= 0 ? 0 : st[o + 14]!;
    const t = life <= 0 ? 0 : age / life;
    const grow = st[o + 8]!;
    const sweep = grow > 0 ? easeOutCubic(clamp01(age / grow)) : 1;
    const len = lerp(st[o + 6]!, st[o + 7]!, easeOutCubic(t)) * sweep;
    const w = lerp(st[o + 9]!, st[o + 10]!, easeOutCubic(t));
    const k = st[o + 22]! * (1 - easeInCubic(t));
    const b = i * 4;
    this.base[b] = st[o]!;
    this.base[b + 1] = st[o + 1]!;
    this.base[b + 2] = st[o + 2]!;
    this.base[b + 3] = w;
    const a = i * 3;
    this.axis[a] = st[o + 3]! * len;
    this.axis[a + 1] = st[o + 4]! * len;
    this.axis[a + 2] = st[o + 5]! * len;
    this.core[a] = st[o + 16]! * k;
    this.core[a + 1] = st[o + 17]! * k;
    this.core[a + 2] = st[o + 18]! * k;
    this.halo[a] = st[o + 19]! * k;
    this.halo[a + 1] = st[o + 20]! * k;
    this.halo[a + 2] = st[o + 21]! * k;
    this.fade[i * 2] = st[o + 23]!;
    this.fade[i * 2 + 1] = st[o + 24]!;
  }
}

// ── Ground sigils ───────────────────────────────────────────────────────────

/** Pattern of a ground plane (one shader, a define per kind). */
export type SigilKind = "hex" | "spiral" | "arcs" | "line" | "arrow" | "ring" | "seal";

const SIGIL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SIGIL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;   // typing progress 0..1 (charge), 1 after release
uniform float uGlow;     // 0..n brightness of the light layer (HDR above 1 blooms)
uniform float uInk;      // 0..1 dark ink layer under the light
uniform float uFade;     // 0..1 overall
uniform float uCount;    // arcs left (Hộ thân charges), spiral rotation speed…
uniform vec3 uColor;     // light, ≤ 0.64 per channel (× at most 1.4 below: ≤ 0.9, no bloom)
uniform vec3 uCore;      // thin HDR line colour (unit max)
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 + 7.7) * 0.15; }
float band(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
// Equilateral triangle, r = half its side (iq).
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// A band of rune dashes of uneven length round radius r0 (n cells, turning with spin).
float runes(float ang, float r, float r0, float w, float n, float spin) {
  float a = (ang + 3.14159265) / 6.2831853 * n + spin;
  float cell = floor(a);
  float f = fract(a);
  float h = hash(vec2(cell, 7.0));
  float dash = smoothstep(0.08, 0.14, f) * (1.0 - smoothstep(0.3 + 0.5 * h, 0.36 + 0.5 * h, f));
  float tall = band(r - r0, w * (0.55 + 0.45 * h));
  return dash * tall;
}
const float PI = 3.14159265;

void main() {
  vec2 p = vUv;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float light = 0.0;
  float core = 0.0;
  float ink = 0.0;
  float n = fbm(p * 6.0 + uTime * 0.15);
  float revealArc = step(fract((ang + PI) / (2.0 * PI)), uReveal);

#if defined(HEX)
  // Six-sword array: a hexagon outline with six sockets at its corners, an inner hex, spokes to the centre,
  // a ring of runes round the heart; dark strokes under the bright lines so they pop on pale stone.
  float dOuter = sdHex(vec2(p.y, p.x), 0.86);
  float dInner = sdHex(vec2(p.y, p.x), 0.42);
  float outer = band(dOuter, 0.05);
  float inner = band(dInner, 0.032);
  float a6 = mod(ang + PI / 6.0, PI / 3.0) - PI / 6.0;
  float spokes = band(sin(a6) * r, 0.026) * smoothstep(0.42, 0.5, r) * (1.0 - smoothstep(0.8, 0.86, r));
  float corner = 0.0;
  for (int i = 0; i < 6; i++) {
    float th = float(i) * PI / 3.0 + PI / 6.0;
    vec2 c = vec2(cos(th), sin(th)) * 0.99;
    float on = step(float(i) / 6.0, uReveal - 0.02);
    corner += on * (1.0 - smoothstep(0.04, 0.13, length(p - c)));
  }
  float heart = runes(ang, r, 0.3, 0.035, 24.0, uTime * 0.25) * uReveal;
  float heartRing = band(r - 0.22, 0.014) * uReveal;
  light = (outer * revealArc * 1.2 + inner * 0.8 * uReveal + spokes * 0.7 * uReveal + heart * 0.9 + heartRing) * (0.8 + 0.2 * n);
  core = corner * 1.2 + outer * 0.45 * revealArc + heartRing * 0.5;
  ink = (1.0 - smoothstep(0.86, 1.0, r)) * 0.3 * (0.65 + 0.35 * n) + band(dOuter, 0.14) * 0.35 * revealArc + band(dInner, 0.1) * 0.22 * uReveal;
#elif defined(SPIRAL)
  // Three galaxy belts around a dark core, a rune ring round the rim, dark shadows along the arms.
  float rot = uTime * uCount;
  float arms = 0.0;
  float shade = 0.0;
  float spine = 0.0;
  for (int i = 0; i < 3; i++) {
    float off = float(i) * 2.0 * PI / 3.0;
    float th = ang - rot - off;
    float target = 0.18 * exp(0.32 * mod(th + 2.0 * PI, 2.0 * PI));
    float d = abs(r - target);
    float along = mod(th + 2.0 * PI, 2.0 * PI) / (2.0 * PI);
    float on = step(float(i) / 3.0, uReveal + 0.001);
    float span = smoothstep(0.08, 0.2, r) * (1.0 - smoothstep(0.86, 0.94, r));
    arms += on * band(d, 0.05 + 0.07 * along) * span;
    spine += on * band(d, 0.006 + 0.008 * along) * span;
    shade += on * band(d, 0.12 + 0.1 * along) * span;
  }
  float rim = band(r - 0.955, 0.01) * revealArc;
  float rune = runes(ang, r, 0.915, 0.022, 60.0, -uTime * 0.12) * revealArc;
  light = arms * (0.6 + 0.4 * n) + rim * 0.9 + rune * 0.8;
  // A crisp line along each arm and star-dust knots, not a fuzzy band.
  core = spine * 0.9 + arms * smoothstep(0.62, 0.92, n) * 0.6 + rim * 0.6;
  ink = (1.0 - smoothstep(0.0, 0.22, r)) * 0.75 + smoothstep(1.0, 0.7, r) * 0.25 + shade * 0.3;
#elif defined(ARCS)
  // Three arcs with gaps; uCount arcs remain lit.
  float seg = fract((ang + PI) / (2.0 * PI) * 3.0);
  float idx = floor((ang + PI) / (2.0 * PI) * 3.0);
  float gap = smoothstep(0.0, 0.06, seg) * (1.0 - smoothstep(0.86, 0.92, seg));
  float lit = step(idx, uCount - 0.5);
  float ring = band(r - 0.86, 0.075);
  float drawn = smoothstep(0.0, 0.02, uReveal * 1.02 - (idx / 3.0 + seg / 3.0) + 0.02);
  float rune = runes(ang, r, 0.7, 0.03, 30.0, uTime * 0.5) * drawn * (0.4 + 0.6 * lit);
  light = (ring * gap * (0.25 + 0.75 * lit) + rune * 0.8) * drawn;
  core = band(r - 0.86, 0.025) * gap * lit * 0.9 * drawn;
  ink = smoothstep(1.0, 0.8, r) * 0.15 + band(r - 0.86, 0.16) * 0.3 * drawn;
#elif defined(LINE)
  // A straight cut along x: uv.x -1 (caster) .. 1 (far end).
  float along = (p.x + 1.0) * 0.5;
  float w = abs(p.y);
  float reveal = step(along, uReveal);
  light = (1.0 - smoothstep(0.0, 0.5, w)) * reveal * (0.7 + 0.3 * n);
  core = (1.0 - smoothstep(0.0, 0.12, w)) * reveal;
  ink = (1.0 - smoothstep(0.1, 0.9, w + n * 0.25)) * reveal * smoothstep(0.0, 0.05, along) * smoothstep(1.0, 0.92, along);
#elif defined(ARROW)
  float along = (p.x + 1.0) * 0.5;
  float w = abs(p.y);
  light = (1.0 - smoothstep(0.0, 0.4, w)) * step(along, uReveal) * 0.8;
  core = (1.0 - smoothstep(0.0, 0.1, w)) * step(along, uReveal);
  ink = (1.0 - smoothstep(0.0, 0.8, w + n * 0.3)) * step(along, uReveal) * 0.6;
#elif defined(SEAL)
  // The caster's seal: two rings drawn round with the word, a band of runes, a hexagram of two
  // counter-turning triangles, a soft heart; a dark disc under it so it glows on pale stone.
  float t0 = uTime * 0.7;
  float ringO = band(r - 0.9, 0.022);
  float ringO2 = band(r - 0.84, 0.01);
  float ringI = band(r - 0.6, 0.014);
  float rune = runes(ang, r, 0.72, 0.045, 36.0, uTime * 0.35);
  float tri = band(sdTri(rot2(p, t0), 0.5), 0.016) + band(sdTri(rot2(p, -t0 + PI), 0.5), 0.016);
  float heart = 1.0 - smoothstep(0.0, 0.3, r);
  light = (ringO + ringO2 * 0.7 + ringI * 0.8 + rune * 0.9) * revealArc + tri * 0.75 * uReveal + heart * 0.35 * uReveal;
  core = ringO * revealArc * 0.8 + tri * 0.45 * uReveal;
  ink = (1.0 - smoothstep(0.85, 1.0, r)) * 0.4;
#else
  // RING: a thin expanding ring (uReveal = radius 0..1).
  float d = r - uReveal * 0.95;
  light = band(d, 0.05 + 0.08 * (1.0 - uReveal)) * (0.7 + 0.3 * n);
  core = band(d, 0.015);
  ink = 0.0;
#endif

  float edge = 1.0 - smoothstep(0.96, 1.0, r);
#if defined(LINE) || defined(ARROW)
  edge = 1.0;
#endif
  float la = clamp(light * uGlow, 0.0, 6.0) * edge;
  float ca = clamp(core * uGlow * 2.0, 0.0, 6.0) * edge;
  vec3 rgb = uColor * min(la, 1.4) + uCore * ca;
  float inkA = clamp(ink * uInk, 0.0, 1.0) * edge;
  // Premultiplied over: light adds, ink darkens.
  float a = clamp(inkA, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(rgb * uFade, a);
}`;

/** A flat plane on the ground with a sigil shader. */
export class GroundSigil {
  readonly mesh: THREE.Mesh;
  readonly uniforms: {
    uTime: { value: number };
    uReveal: { value: number };
    uGlow: { value: number };
    uInk: { value: number };
    uFade: { value: number };
    uCount: { value: number };
    uColor: { value: THREE.Color };
    uCore: { value: THREE.Color };
  };

  constructor(kind: SigilKind, sizeX: number, sizeZ: number, colour: string, core: string) {
    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uGlow: { value: 0 },
      uInk: { value: 0 },
      uFade: { value: 0 },
      uCount: { value: 3 },
      uColor: { value: new THREE.Color(colour) },
      uCore: { value: new THREE.Color(core) },
    };
    const defines: Record<string, string> = {};
    defines[kind.toUpperCase()] = "";
    const material = new THREE.ShaderMaterial({
      vertexShader: SIGIL_VERTEX,
      fragmentShader: SIGIL_FRAGMENT,
      uniforms: this.uniforms,
      defines,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  place(x: number, z: number, yaw = 0): void {
    this.mesh.position.set(x, 0.02, z);
    this.mesh.rotation.set(-Math.PI / 2, 0, yaw);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.uniforms.uFade.value = 0;
  }

  tick(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}
