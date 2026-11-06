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
import { TAG_UNIFORMS, withTagMask } from "./tag-mask";
import { paintedPlane, type SigilTextureMode } from "./painted-sigils";

// ── Small helpers ───────────────────────────────────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 3t² − 2t³ on [0, 1] (clamped): no velocity jump at either end. */
export const smooth01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
/**
 * Life fade of a timed layer, 1 → 0 over t ∈ [0, 1]: (1 − t³)². Bright for
 * most of the life like 1 − t³, but with zero slope at the end, so the last
 * frame drawn before the layer dies is already dim (1 − t³ left ~40 % of a
 * short flash on its last frame: a pop off, MOTION_PLAN step 3).
 */
export const lifeFade = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const k = 1 - x * x * x;
  return k * k;
};
/** Moves `x` toward `goal` with a half-life (s): exact at any frame rate (Driscoll; `THREE.MathUtils.damp` with λ = ln2 / halfLife). */
export function approach(x: number, goal: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return goal;
  return goal + (x - goal) * Math.pow(2, -dt / halfLife);
}
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
#ifdef MATTE
uniform vec2 uMatte;
#endif
varying vec2 vUv;
varying vec4 vCol;
#ifdef GROUND_FADE
varying float vWorldY;
#endif
void main() {
  vec4 t = texture2D(map, vUv);
#ifdef MATTE
  // A crisp matte cut from a soft texture (matter, never a see-through glow over pale ground).
  t.a = smoothstep(uMatte.x, uMatte.y, t.a);
#endif
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
const SPRITE_FRAGMENT_TAGGED = withTagMask(SPRITE_FRAGMENT);

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
  /** Seconds of smoothstep fade-in at the start (0: the pool's `fadeIn`, itself 0 for flashes: full at age 0, VFX_STANDARD §3.1 rule 5). */
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
  /** Draw timed sprites before advancing their clock, including age zero (default false). */
  drawBeforeAge?: boolean;
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
  /**
   * Smoothstep fade-in (s) for timed sprites that set none of their own
   * (one-frame cards excluded): the pool's sprites never pop on (MOTION_PLAN
   * step 3). For non-flash layers (dark discs, ink, smoke, ground glows):
   * flashes stay full on their first frame (VFX_STANDARD §3.1 rule 5).
   */
  fadeIn?: number;
  /**
   * Draw both faces. A "ground" quad's winding faces down, so with the default front-face culling it never draws
   * from a camera above it (found 03/11/2026, power pass round 2: key 7's lit pools, rings and scar never showed).
   * Off by default so the Kiếm skills keep what was reviewed until their redesign (SKILL_CATALOG_V2).
   */
  twoSided?: boolean;
  /**
   * "ink" matter cut crisp from a soft texture: its alpha through smoothstep(lo, hi) (an element's matter drawn with a
   * glow sheet, never a see-through haze over pale stone). Absent: the texture's alpha (Metal's pools; their program
   * is unchanged).
   */
  matte?: readonly [number, number];
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
  private readonly minFadeIn: number;
  private readonly drawBeforeAge: boolean;
  private live = 0;

  constructor(
    readonly capacity: number,
    texture: THREE.Texture,
    blend: SpriteBlend,
    facing: SpriteFacing = "camera",
    renderOrder = 10,
    opts: SpritePoolOptions = {},
  ) {
    this.minFadeIn = Math.max(0, opts.fadeIn ?? 0);
    this.drawBeforeAge = opts.drawBeforeAge ?? false;
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
    if (opts.matte !== undefined) defines.MATTE = "";
    const material = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERTEX,
      // Its light behind a word tag dims to the tag mask's share (tag-mask.ts).
      fragmentShader: SPRITE_FRAGMENT_TAGGED,
      uniforms: {
        ...TAG_UNIFORMS,
        map: { value: texture },
        uPull: { value: facing === "camera" ? Math.max(0, pull) : 0 },
        uCrop: { value: crop },
        uCropFade: { value: cropFade },
        uGroundFade: { value: groundFade },
        uMatte: { value: new THREE.Vector2(opts.matte?.[0] ?? 0, opts.matte?.[1] ?? 1) },
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
      side: opts.twoSided === true ? THREE.DoubleSide : THREE.FrontSide,
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

  /** The pool's sheet (an element kit swaps it; element-kit.ts `textures`). */
  get texture(): THREE.Texture {
    return (this.mesh.material as THREE.ShaderMaterial).uniforms.map!.value as THREE.Texture;
  }

  set texture(t: THREE.Texture) {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.map!.value = t;
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
    st[o + 16] = s.fadeIn > 0 || s.life <= 0 ? s.fadeIn : this.minFadeIn;
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
      if ((this.drawBeforeAge ? st[o + 6]! : age) >= st[o + 7]!) {
        // Swap the last live sprite in.
        const last = (this.live - 1) * F;
        if (last !== o) st.copyWithin(o, last, last + F);
        this.live -= 1;
        continue;
      }
      if (this.drawBeforeAge) this.write(i);
      st[o + 6] = age;
      const drag = st[o + 17]!;
      if (drag > 0) {
        // Exact damping: the same path at any frame rate.
        const k = Math.exp(-drag * dt);
        st[o + 3] = st[o + 3]! * k;
        st[o + 4] = st[o + 4]! * k;
        st[o + 5] = st[o + 5]! * k;
      }
      st[o + 4] = st[o + 4]! + st[o + 18]! * dt;
      st[o] = st[o]! + st[o + 3]! * dt;
      st[o + 1] = st[o + 1]! + st[o + 4]! * dt;
      st[o + 2] = st[o + 2]! + st[o + 5]! * dt;
      st[o + 10] = st[o + 10]! + st[o + 11]! * dt;
      if (!this.drawBeforeAge) this.write(i);
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
    let alpha = !once && fadeIn > 0 && age < fadeIn ? smooth01(age / fadeIn) : 1;
    alpha *= lifeFade(t);
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

/**
 * The flame look of a ribbon (an element kit's trail, canon D59): a flame atlas on black (Dragonhold's flame band)
 * scrolled along the trail and read as HEAT, shaped by the ribbon (hot along its middle and near its head, cooling
 * down its tail), then coloured through a soot-rimmed ramp and drawn premultiplied (Gemini's heat field, 03/11/2026):
 * eroded under ~0.12, a soot edge at alpha 0.85 that covers the pale floor (never an orange veil), an orange-to-amber
 * body at 0.95, and a white-gold core (× 2.2) that alone blooms. Fades cool it instead of thinning it.
 */
const FLAME_RIBBON_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uFps;
uniform float uTime;
uniform vec3 uSoot;
uniform vec3 uDeep;
uniform vec3 uAmber;
uniform vec3 uCore;
varying float vT;
varying vec4 vCol;
varying vec3 vRim;
varying float vSide;
void main() {
  float s = clamp(1.0 - abs(vSide * 2.0 - 1.0), 0.0, 1.0);
  float f = mod(floor(uTime * uFps), uFrames);
  vec2 cell = vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x));
  // Stretched along the trail and read soft (a mip bias): the band's cells become flame streaks, not a crust.
  vec2 cuv = vec2(clamp(fract(vT * 0.6 - uTime * 1.1), 0.004, 0.996), 0.5 + (vSide - 0.5) * 0.7);
  vec4 t = texture2D(map, (cell + cuv) / uGrid, 0.4);
  float lum = pow(clamp(max(t.r, max(t.g, t.b)), 0.0, 1.0), 0.4545);
  // Hot along the middle near the head; down the tail it cools and breaks into tongues that erode away (a soot
  // rim only at its edges, never a dark band left lying across the field).
  float prof = smoothstep(0.0, 0.75, s) * (1.0 - smoothstep(0.15, 0.9, vT));
  float heat = prof * (0.15 + 1.0 * lum) * vCol.a;
  float edge = 0.14 + 0.16 * vT + (0.5 - lum) * 0.12;
  float a = smoothstep(edge, edge + 0.04, heat);
  if (a <= 0.002) discard;
  float b = smoothstep(edge + 0.08, edge + 0.16, heat);
  float c = smoothstep(0.84, 0.96, heat) * (1.0 - smoothstep(0.1, 0.35, vT));
  vec3 col = mix(uSoot, mix(uDeep, uAmber, smoothstep(0.35, 0.8, heat)), b);
  col = mix(col, uCore * 2.2, c);
  a *= mix(0.85, 0.95, b);
  gl_FragColor = vec4(col * a, a);
}`;

/**
 * The moded program (RibbonPool.setModed; the sword aura's SilkTail, SWORD_AURA §5.2): one premultiplied program in
 * which each ribbon has its own look (`aMode`). Light (0): exactly the light program's colour with alpha 0, so it adds
 * as before. Silk (1): a ribbon of the weapon's tassel silk as matter: its body (the ribbon's rim colour, ≤ 0.7) at a
 * true alpha 0.85 with a soft sheen down the middle, its deep edge (the ribbon's colour) at a true alpha too, so it
 * reads on pale stone; it thins and erodes down its tail.
 */
const MODED_RIBBON_VERTEX = /* glsl */ `
attribute float aT;
attribute vec4 aCol;
attribute vec3 aRim;
attribute float aMode;
varying float vT;
varying vec4 vCol;
varying vec3 vRim;
varying float vSide;
varying float vMode;
void main() {
  vT = aT;
  vCol = aCol;
  vRim = aRim;
  vMode = aMode;
  vSide = mod(float(gl_VertexID), 2.0);
  vec3 p = position;
  // The silk lies 0.12 m behind in depth (the pool sits at the origin: positions are world): a silk ribbon trailing past
  // another sword at its depth stays behind that sword's blade (the gates' blade-keep map, 03/11).
  if (aMode > 0.5) {
    vec3 e = p - cameraPosition;
    p += e / max(length(e), 1e-3) * 0.12;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const MODED_RIBBON_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
varying float vT;
varying vec4 vCol;
varying vec3 vRim;
varying float vSide;
varying float vMode;
void main() {
  float s = clamp(1.0 - abs(vSide * 2.0 - 1.0), 0.0, 1.0);
  vec4 t = texture2D(map, vec2(vT * 2.0 - uTime * 1.5, vSide));
  if (vMode < 0.5) {
    // The light program's arithmetic, unchanged; alpha 0 adds it over the scene as ONE, ONE did.
    float core = pow(s, 7.0);
    float body = s * s * (3.0 - 2.0 * s);
    float erode = smoothstep(0.0, 0.35, t.a + (1.0 - vT) * 0.6 - vT * 0.5);
    float a = vCol.a * erode * (1.0 - vT);
    vec3 rgb = vRim * body * 0.95 + vCol.rgb * core * (1.0 - vT * 0.6);
    gl_FragColor = vec4(rgb * a, 0.0);
    return;
  }
  // Silk: a crisp ribbon of the tassel's silk (its edge a pixel's soft step), a bright sheen line down its middle,
  // diagonal folds crossing it as it flutters, a thin deep border; its end breaks into strands.
  float edge = smoothstep(0.0, 0.12, s);
  float inner = smoothstep(0.1, 0.32, s);
  float fold = 0.55 + 0.45 * smoothstep(-0.6, 0.9, sin(vT * 26.0 + (vSide - 0.5) * 2.4 - uTime * 10.0));
  float sheen = smoothstep(0.7, 0.98, s) * (0.6 + 0.4 * sin(vT * 15.0 - uTime * 7.0));
  float strands = mix(1.0, smoothstep(0.25, 0.6, texture2D(map, vec2(vT * 3.0 - uTime * 0.8, vSide * 0.5 + 0.25)).a), smoothstep(0.45, 0.95, vT));
  float a = vCol.a * edge * strands * (1.0 - smoothstep(0.75, 1.0, vT));
  vec3 col = mix(vCol.rgb, vRim * fold, inner) + vec3(0.32, 0.36, 0.4) * sheen * fold;
  gl_FragColor = vec4(min(col, vec3(0.85)) * a * 0.86, a * 0.76);
}`;

/** A flame atlas for RibbonPool.setFlame: its texture and grid, and the heat ramp (linear). */
export interface RibbonFlame {
  readonly texture: THREE.Texture;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  readonly fps: number;
  readonly soot: readonly number[];
  readonly deep: readonly number[];
  readonly amber: readonly number[];
  readonly core: readonly number[];
}

/** World seconds between two ribbon samples: a trail's shape follows time, not frames (the same at 60 and 120 Hz, frozen in a hit-stop). */
const RIBBON_SAMPLE_S = 1 / 60;
/**
 * Smoothstep fade-in of a new ribbon (s), the default of `start` (MOTION_PLAN appendix C §2.8). A trail
 * also grows from zero length with its head, so its light (alpha × length) rises as their product: the
 * fade-in must suit the head's speed. A head that starts fast (Hộ thân blades dropping 4 m in 0.15 s)
 * needs 0.1 s (0.05 s put 46 % of the light into one frame at 60 Hz); a 0.1 s flight needs ~0.05 s
 * (0.1 s put 31 % into its last frame): `start`'s `fadeIn`.
 */
const RIBBON_FADE_IN_S = 0.1;

/**
 * Camera-facing ribbons (sword trails, dash streaks). The caller moves each
 * ribbon's head every frame (`push`); the pool commits a sample every
 * RIBBON_SAMPLE_S of world time, interpolated along the head's motion, and
 * draws the head, the samples and a tail cut at a fixed age, so a trail's
 * length is the same at any frame rate and stands still in a hit-stop.
 * `stop` fades a ribbon out (its head holds, the tail retracts into it);
 * `kill` drops it at once (resets only).
 */
export class RibbonPool {
  readonly mesh: THREE.Mesh;
  private readonly points: number;
  /** Committed samples per ribbon (ring of `points`), positions and world times. */
  private readonly hist: Float32Array;
  private readonly histT: Float64Array;
  private readonly heads: Int32Array;
  private readonly filled: Int32Array;
  /** The head now and at the last update (x y z per ribbon). */
  private readonly live: Float32Array;
  private readonly prevLive: Float32Array;
  /** World time of the newest committed sample. */
  private readonly lastT: Float64Array;
  private readonly widthM: Float32Array;
  private readonly colour: Float32Array; // r g b a per ribbon (a: the caller's alpha)
  private readonly rimC: Float32Array; // r g b per ribbon (halo, ≤ 0.9)
  /** 0 off, 1 live, 2 fading out. */
  private readonly state: Uint8Array;
  private readonly age: Float32Array;
  private readonly fadeT: Float32Array;
  private readonly fadeLen: Float32Array;
  /** Fade-in time per ribbon (s). */
  private readonly fadeIn: Float32Array;
  private readonly scratch: Float32Array; // points × 4: x y z age of the drawn polyline
  private readonly positions: Float32Array;
  private readonly ts: Float32Array;
  private readonly cols: Float32Array;
  private readonly rims: Float32Array;
  private readonly attrs: PrefixAttribute[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  /** The flame look (setFlame), made on first use; null: the light look. */
  private flameMaterial: THREE.ShaderMaterial | null = null;
  /** The moded program (setModed), made on first use; each ribbon's look by `mode` (0 light, 1 silk). */
  private modedMaterial: THREE.ShaderMaterial | null = null;
  private readonly mode: Uint8Array;
  /** Per ribbon: its width profile (0 the light taper, 1 the silk's: narrow, widest at a quarter, thin tail) and its cap (m; Infinity none). */
  private readonly profile: Uint8Array;
  private readonly maxLen: Float32Array;
  private readonly modes: Float32Array;
  private readonly camPos = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private time = 0;

  constructor(readonly capacity: number, points: number, texture: THREE.Texture, renderOrder = 12) {
    this.points = Math.max(4, points);
    const n = this.points;
    this.hist = new Float32Array(capacity * n * 3);
    this.histT = new Float64Array(capacity * n);
    this.heads = new Int32Array(capacity);
    this.filled = new Int32Array(capacity);
    this.live = new Float32Array(capacity * 3);
    this.prevLive = new Float32Array(capacity * 3);
    this.lastT = new Float64Array(capacity);
    this.widthM = new Float32Array(capacity);
    this.colour = new Float32Array(capacity * 4);
    this.rimC = new Float32Array(capacity * 3);
    this.state = new Uint8Array(capacity);
    this.age = new Float32Array(capacity);
    this.fadeT = new Float32Array(capacity);
    this.fadeLen = new Float32Array(capacity);
    this.fadeIn = new Float32Array(capacity);
    this.mode = new Uint8Array(capacity);
    this.profile = new Uint8Array(capacity);
    this.maxLen = new Float32Array(capacity).fill(Infinity);
    this.scratch = new Float32Array(n * 4);
    const verts = capacity * n * 2;
    this.positions = new Float32Array(verts * 3);
    this.ts = new Float32Array(verts);
    this.cols = new Float32Array(verts * 4);
    this.rims = new Float32Array(verts * 3);
    this.modes = new Float32Array(verts);
    const index: number[] = [];
    for (let r = 0; r < capacity; r += 1) {
      for (let p = 0; p < n - 1; p += 1) {
        const a = (r * n + p) * 2;
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
      new PrefixAttribute(this.modes, 1),
    ];
    geometry.setAttribute("position", this.attrs[0]!);
    geometry.setAttribute("aT", this.attrs[1]!);
    geometry.setAttribute("aCol", this.attrs[2]!);
    geometry.setAttribute("aRim", this.attrs[3]!);
    geometry.setAttribute("aMode", this.attrs[4]!);
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

  /** The ribbons' erosion sheet (an element kit swaps it; element-kit.ts `textures`). */
  get texture(): THREE.Texture {
    return this.material.uniforms.map!.value as THREE.Texture;
  }

  set texture(t: THREE.Texture) {
    this.material.uniforms.map!.value = t;
  }

  /**
   * Draws every ribbon of the pool as flame (an element's trail; load time) or, with null, as sword-light again (the
   * default look, unchanged). The ribbons keep their paths, widths and fades; only their material changes.
   */
  setFlame(flame: RibbonFlame | null): void {
    if (flame === null) {
      this.mesh.material = this.material;
      return;
    }
    let m = this.flameMaterial;
    if (m === null) {
      const v3 = (): { value: THREE.Vector3 } => ({ value: new THREE.Vector3() });
      m = new THREE.ShaderMaterial({
        vertexShader: RIBBON_VERTEX,
        fragmentShader: FLAME_RIBBON_FRAGMENT,
        uniforms: { map: { value: flame.texture }, uGrid: { value: new THREE.Vector2(1, 1) }, uFrames: { value: 1 }, uFps: { value: 12 }, uTime: this.material.uniforms.uTime!, uSoot: v3(), uDeep: v3(), uAmber: v3(), uCore: v3() },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      this.flameMaterial = m;
    }
    const u = m.uniforms;
    u.map!.value = flame.texture;
    (u.uGrid!.value as THREE.Vector2).set(flame.cols, flame.rows);
    u.uFrames!.value = flame.frames;
    u.uFps!.value = flame.fps;
    (u.uSoot!.value as THREE.Vector3).fromArray(flame.soot);
    (u.uDeep!.value as THREE.Vector3).fromArray(flame.deep);
    (u.uAmber!.value as THREE.Vector3).fromArray(flame.amber);
    (u.uCore!.value as THREE.Vector3).fromArray(flame.core);
    this.mesh.material = m;
  }

  /**
   * Draws the pool with the moded program (true; the sword aura's SilkTail: each ribbon by its own mode) or the light
   * program (false, the default, unchanged). A pool drawn as flame stays flame (setFlame wins: Fire's SilkTail is its
   * flame trail).
   */
  setModed(on: boolean): void {
    if (this.flameMaterial !== null && this.mesh.material === this.flameMaterial) return;
    if (!on) {
      if (this.mesh.material === this.modedMaterial) this.mesh.material = this.material;
      return;
    }
    let m = this.modedMaterial;
    if (m === null) {
      m = new THREE.ShaderMaterial({
        vertexShader: MODED_RIBBON_VERTEX,
        fragmentShader: MODED_RIBBON_FRAGMENT,
        uniforms: { map: this.material.uniforms.map!, uTime: this.material.uniforms.uTime! },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      this.modedMaterial = m;
    }
    this.mesh.material = m;
  }

  /** The moded program (made on first setModed; prewarm compiles it). */
  get modedProgram(): THREE.ShaderMaterial | null {
    return this.modedMaterial;
  }

  /**
   * Ribbon `i` as silk (the sword aura's SilkTail, drawn by the moded program): its deep edge and body colours (linear,
   * ≤ 0.85), its alpha, the silk's width profile (`widthM` its widest) and a length cap (m). Call after start.
   */
  setSilk(i: number, deep: readonly number[], body: readonly number[], maxLenM: number): void {
    this.mode[i] = 1;
    this.profile[i] = 1;
    this.maxLen[i] = maxLenM;
    const c = i * 4;
    this.colour[c] = deep[0]!;
    this.colour[c + 1] = deep[1]!;
    this.colour[c + 2] = deep[2]!;
    this.rimC[i * 3] = body[0]!;
    this.rimC[i * 3 + 1] = body[1]!;
    this.rimC[i * 3 + 2] = body[2]!;
  }

  /** Starts ribbon `i` at a point with a width and an HDR colour; it eases in over `fadeIn` s (smoothstep). */
  start(i: number, x: number, y: number, z: number, widthM: number, r: number, g: number, b: number, a: number, fadeIn = RIBBON_FADE_IN_S): void {
    this.state[i] = 1;
    this.mode[i] = 0;
    this.profile[i] = 0;
    this.maxLen[i] = Infinity;
    this.age[i] = 0;
    this.fadeIn[i] = Math.max(1e-3, fadeIn);
    this.fadeT[i] = 0;
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
    const base = i * this.points;
    this.hist[base * 3] = x;
    this.hist[base * 3 + 1] = y;
    this.hist[base * 3 + 2] = z;
    this.histT[base] = this.time;
    this.lastT[i] = this.time;
    const L = i * 3;
    this.live[L] = this.prevLive[L] = x;
    this.live[L + 1] = this.prevLive[L + 1] = y;
    this.live[L + 2] = this.prevLive[L + 2] = z;
  }

  /** The halo colour of ribbon `i` (linear, keep each channel ≤ 0.9: it must not bloom). */
  setRim(i: number, r: number, g: number, b: number): void {
    this.rimC[i * 3] = r;
    this.rimC[i * 3 + 1] = g;
    this.rimC[i * 3 + 2] = b;
  }

  /** The head of ribbon `i` this frame (ignored once it fades out: the head holds and the tail retracts into it). */
  push(i: number, x: number, y: number, z: number): void {
    if (this.state[i] !== 1) return;
    const L = i * 3;
    this.live[L] = x;
    this.live[L + 1] = y;
    this.live[L + 2] = z;
  }

  /** The width of ribbon `i` from now on (m; a lead blade's trail widens as it grows). */
  setWidth(i: number, widthM: number): void {
    this.widthM[i] = widthM;
  }

  setAlpha(i: number, a: number): void {
    this.colour[i * 4 + 3] = a;
  }

  /** Fades ribbon `i` out over `fade` s (smoothstep) while its tail retracts; 0 drops it at once. */
  stop(i: number, fade = 0.18): void {
    if (this.state[i] !== 1) return;
    if (fade <= 0) {
      this.state[i] = 0;
      return;
    }
    this.state[i] = 2;
    this.fadeT[i] = 0;
    this.fadeLen[i] = fade;
  }

  /** Drops ribbon `i` at once (resets). */
  kill(i: number): void {
    this.state[i] = 0;
  }

  /** True while ribbon `i` is drawn (live or fading). */
  isOn(i: number): boolean {
    return this.state[i] !== 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    const t0 = this.time;
    this.time += dt;
    this.material.uniforms.uTime!.value = this.time;
    // Only ribbons below the highest live one are built, sent and drawn; none live: hidden, nothing sent.
    let hi = 0;
    for (let r = 0; r < this.capacity; r += 1) if (this.state[r] !== 0) hi = r + 1;
    this.mesh.visible = hi > 0;
    if (hi === 0) return;
    camera.getWorldPosition(this.camPos);
    const n = this.points;
    const S = RIBBON_SAMPLE_S;
    // Samples younger than W are drawn; the tail is cut at age W between the two samples around it.
    const W = (n - 2) * S;
    const sc = this.scratch;
    for (let r = 0; r < hi; r += 1) {
      const vbase = r * n * 2;
      if (this.state[r] === 0) {
        for (let k = 0; k < n * 2; k += 1) this.cols[(vbase + k) * 4 + 3] = 0;
        continue;
      }
      const silk = this.profile[r] === 1;
      let fade = 1;
      if (this.state[r] === 2) {
        this.fadeT[r] = this.fadeT[r]! + dt;
        const u = this.fadeT[r]! / this.fadeLen[r]!;
        if (u >= 1) {
          this.state[r] = 0;
          for (let k = 0; k < n * 2; k += 1) this.cols[(vbase + k) * 4 + 3] = 0;
          continue;
        }
        fade = 1 - smooth01(u);
      }
      this.age[r] = this.age[r]! + dt;
      fade *= smooth01(this.age[r]! / this.fadeIn[r]!);
      // Commit the samples due since the last update, placed along the head's motion over this frame.
      const L = r * 3;
      const hb = r * n;
      while (this.time - this.lastT[r]! >= S - 1e-9) {
        const ts = this.lastT[r]! + S;
        const u = dt > 0 ? clamp01((ts - t0) / dt) : 1;
        const h = (this.heads[r]! + 1) % n;
        this.heads[r] = h;
        this.filled[r] = Math.min(n, this.filled[r]! + 1);
        const o = (hb + h) * 3;
        this.hist[o] = lerp(this.prevLive[L]!, this.live[L]!, u);
        this.hist[o + 1] = lerp(this.prevLive[L + 1]!, this.live[L + 1]!, u);
        this.hist[o + 2] = lerp(this.prevLive[L + 2]!, this.live[L + 2]!, u);
        this.histT[hb + h] = ts;
        this.lastT[r] = ts;
      }
      this.prevLive[L] = this.live[L]!;
      this.prevLive[L + 1] = this.live[L + 1]!;
      this.prevLive[L + 2] = this.live[L + 2]!;
      // The polyline: the head (age 0), the samples newest first, the tail at min(W, oldest sample's age).
      const filled = this.filled[r]!;
      const head = this.heads[r]!;
      const oldest = (head - (filled - 1) + n) % n;
      const tailAge = Math.min(W, this.time - this.histT[hb + oldest]!);
      sc[0] = this.live[L]!;
      sc[1] = this.live[L + 1]!;
      sc[2] = this.live[L + 2]!;
      sc[3] = 0;
      let m = 1;
      for (let s = 0; s < filled && m < n; s += 1) {
        const idx = (head - s + n) % n;
        const o = (hb + idx) * 3;
        const a = this.time - this.histT[hb + idx]!;
        // A sample taken this instant sits on the head (every frame at a steady 60 Hz): skip it, a zero-length
        // segment has no side direction (it twisted the head quad).
        if (a < 1e-6) continue;
        const q = (m - 1) * 4;
        if (a >= tailAge) {
          // Cut between the last point and this sample, at the tail's age.
          const pa = sc[q + 3]!;
          const u = a - pa > 1e-9 ? (tailAge - pa) / (a - pa) : 1;
          sc[m * 4] = lerp(sc[q]!, this.hist[o]!, u);
          sc[m * 4 + 1] = lerp(sc[q + 1]!, this.hist[o + 1]!, u);
          sc[m * 4 + 2] = lerp(sc[q + 2]!, this.hist[o + 2]!, u);
          sc[m * 4 + 3] = tailAge;
          m += 1;
          break;
        }
        sc[m * 4] = this.hist[o]!;
        sc[m * 4 + 1] = this.hist[o + 1]!;
        sc[m * 4 + 2] = this.hist[o + 2]!;
        sc[m * 4 + 3] = a;
        m += 1;
      }
      // A capped ribbon (the silk) ends at its length: cut where the polyline's length reaches it.
      let capAge = tailAge;
      const cap = this.maxLen[r]!;
      if (cap < Infinity && m > 1) {
        let acc = 0;
        for (let i = 1; i < m; i += 1) {
          const q0 = (i - 1) * 4;
          const q1 = i * 4;
          const seg = Math.hypot(sc[q1]! - sc[q0]!, sc[q1 + 1]! - sc[q0 + 1]!, sc[q1 + 2]! - sc[q0 + 2]!);
          if (acc + seg >= cap) {
            const u = seg > 1e-6 ? (cap - acc) / seg : 0;
            sc[q1] = lerp(sc[q0]!, sc[q1]!, u);
            sc[q1 + 1] = lerp(sc[q0 + 1]!, sc[q1 + 1]!, u);
            sc[q1 + 2] = lerp(sc[q0 + 2]!, sc[q1 + 2]!, u);
            sc[q1 + 3] = lerp(sc[q0 + 3]!, sc[q1 + 3]!, u);
            capAge = sc[q1 + 3]!;
            m = i + 1;
            break;
          }
          acc += seg;
        }
      }
      const norm = capAge > 1e-6 ? 1 / capAge : 0;
      const w0 = this.widthM[r]!;
      const c = r * 4;
      const alpha = this.colour[c + 3]! * fade;
      // Side direction per point from its neighbours (central difference); a degenerate one keeps the last good side.
      let sideX = 0;
      let sideY = 0;
      let sideZ = 0;
      let haveSide = false;
      // Seed it from the first segment with a length (a held head sits on its newest sample: its own segment has none).
      for (let i = 0; i + 1 < m; i += 1) {
        const qi = i * 4;
        this.tmpB.set(sc[qi + 4]! - sc[qi]!, sc[qi + 5]! - sc[qi + 1]!, sc[qi + 6]! - sc[qi + 2]!);
        if (this.tmpB.lengthSq() < 1e-10) continue;
        this.tmpC.set(this.camPos.x - sc[qi]!, this.camPos.y - sc[qi + 1]!, this.camPos.z - sc[qi + 2]!);
        this.tmpB.cross(this.tmpC);
        if (this.tmpB.lengthSq() <= 1e-12) continue;
        this.tmpB.normalize();
        sideX = this.tmpB.x;
        sideY = this.tmpB.y;
        sideZ = this.tmpB.z;
        haveSide = true;
        break;
      }
      for (let k = 0; k < n; k += 1) {
        // Past the polyline's end: collapsed onto its last point, transparent.
        const kk = Math.min(k, m - 1);
        const q = kk * 4;
        const qa = Math.max(0, kk - 1) * 4;
        const qb = Math.min(m - 1, kk + 1) * 4;
        this.tmpA.set(sc[q]!, sc[q + 1]!, sc[q + 2]!);
        this.tmpB.set(sc[qb]! - sc[qa]!, sc[qb + 1]! - sc[qa + 1]!, sc[qb + 2]! - sc[qa + 2]!);
        this.tmpC.subVectors(this.camPos, this.tmpA);
        this.tmpB.cross(this.tmpC);
        if (this.tmpB.lengthSq() > 1e-12) {
          this.tmpB.normalize();
          sideX = this.tmpB.x;
          sideY = this.tmpB.y;
          sideZ = this.tmpB.z;
          haveSide = true;
        } else if (haveSide) {
          this.tmpB.set(sideX, sideY, sideZ);
        } else {
          this.tmpB.set(0, 0, 1).cross(this.tmpC).normalize();
        }
        const tt = norm > 0 ? Math.min(1, sc[q + 3]! * norm) : k === 0 ? 0 : 1;
        // The silk: knotted narrow at the pommel, its widest (0.16) at a quarter, 0.03 at its end (SWORD_AURA §3.A
        // SilkTail: 0.11 → 0.16 → 0.03; its head narrower, tied on); else the light taper.
        // The silk twists as it flutters: its drawn width swells and pinches along its length on world time.
        const w = silk ? w0 * (tt < 0.25 ? 0.4 + 2.4 * tt : 1 - 1.08 * (tt - 0.25)) * (0.62 + 0.38 * Math.abs(Math.cos(tt * 7.5 - this.time * 6))) : w0 * (1 - tt * 0.85);
        const v = vbase + k * 2;
        this.positions[v * 3] = this.tmpA.x + this.tmpB.x * w;
        this.positions[v * 3 + 1] = this.tmpA.y + this.tmpB.y * w;
        this.positions[v * 3 + 2] = this.tmpA.z + this.tmpB.z * w;
        this.positions[(v + 1) * 3] = this.tmpA.x - this.tmpB.x * w;
        this.positions[(v + 1) * 3 + 1] = this.tmpA.y - this.tmpB.y * w;
        this.positions[(v + 1) * 3 + 2] = this.tmpA.z - this.tmpB.z * w;
        this.ts[v] = tt;
        this.ts[v + 1] = tt;
        this.modes[v] = this.mode[r]!;
        this.modes[v + 1] = this.mode[r]!;
        const va = k < m ? alpha : 0;
        for (let s = 0; s < 2; s += 1) {
          const qq = (v + s) * 4;
          this.cols[qq] = this.colour[c]!;
          this.cols[qq + 1] = this.colour[c + 1]!;
          this.cols[qq + 2] = this.colour[c + 2]!;
          this.cols[qq + 3] = va;
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
  /**
   * Seconds of smoothstep fade-in (0: full on its first frame, a flash). Bursts
   * that must not blaze on in one frame (K5's vortex core, K1's arriving
   * strokes) rise over ≥ 3 frames at 60 Hz (round 2 impact lane).
   */
  rise = 0;
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
    this.rise = 0;
    return this;
  }
}

const BF = 26; // floats per beam state

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
    st[o + 25] = s.life > 0 ? Math.max(0, s.rise) : 0;
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
    const rise = st[o + 25]!;
    const k = st[o + 22]! * lifeFade(t) * (rise > 0 && age < rise ? smooth01(age / rise) : 1);
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
export type SigilKind = "hex" | "spiral" | "arcs" | "line" | "arrow" | "ring" | "seal" | "crack" | "presence";

/**
 * The caster seal's inner glyph per skill (uShape), after the shape grammar of
 * SKILL_CATALOG §2 (each skill its own shape at 40 px; round 2: "the same white
 * hexagram everywhere"): 0 none, 1 Ngự Kiếm three strokes and a head (≡>),
 * 2 Nhất Tuyến one cut, 3 Hộ thân three arcs and blades, 4 Lưu Quang two
 * points and a slanted stroke, 5 Lạc Kiếm hexagon and six inward swords,
 * 6 Thiên Hà three spiral arms round a dark heart. +x of the plane is the
 * facing (place the seal with the facing's yaw).
 */
export const SEAL_SHAPE = { none: 0, k1: 1, k2: 2, guard: 3, dash: 4, k4: 5, k5: 6 } as const;

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
uniform float uCount;    // arcs left (Hộ thân charges, fractional while one goes out)
uniform float uPhase;    // spiral rotation (rad), accumulated on the CPU (GroundSigil.spin)
uniform vec3 uColor;     // light, ≤ 0.64 per channel (× at most 1.4 below: ≤ 0.9, no bloom)
uniform vec3 uCore;      // thin HDR line colour (unit max)
uniform float uShape;    // seal glyph (SEAL_SHAPE)
uniform float uGlyph;    // 0..1 the glyph's share (it crossfades when the skill changes)
uniform float uHeat;     // 0..n afterglow along a cut (embers and a glowing seam), cooling to 0
uniform float uAsh;      // 0..1 pale ash left where the light burned (normal blend, not dark ink)
uniform float uMotif;    // the equipped weapon's motif (WeaponMotif): 0 none, 1 Clear Wind's hollow jade ring and ruyi curls
uniform vec3 uJade;      // the motif's light (≤ 0.86 a channel: it never blooms; the skill's own lines keep the HDR)
#ifdef SOLID
uniform vec3 uSolidSoot; // an element's solid look (element-kit.ts SigilLook): the underlay, the body cool and lit, the thin line
uniform float uSolidSootA;
uniform vec3 uSolidBody;
uniform vec3 uSolidLit;
uniform vec3 uSolidCore;
#endif
#ifdef PAINTED
uniform sampler2D uMask;
uniform vec3 uInner;
uniform float uInnerMix;
#endif
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 + 7.7) * 0.15; }
float band(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
// Soft reveal: 1 where x is behind the reveal front, 0 ahead, a smooth edge of width w between
// (no hard cut); fully open at r = 1 (the front goes past 1 by w).
float revealSoft(float x, float r, float w) { float f = r * (1.0 + w); return 1.0 - smoothstep(f - w, f, x); }
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
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
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

// Clear Wind's hollow jade ring (a bi disc seen from above): an outer and an inner edge with a faint body between.
float biRing(vec2 q, float R, float w) {
  float d = length(q);
  float body = smoothstep(0.58 * R, 0.66 * R, d) * (1.0 - smoothstep(0.92 * R, R, d));
  return band(d - R, w) + band(d - 0.62 * R, w * 0.8) * 0.85 + body * 0.22;
}
// A ruyi cloud curl: a log-spiral stroke (r = 0.12·e^(0.27·φ), φ up to 1.75π) of size s, curling counter-clockwise.
float cloudCurl(vec2 q, float s, float w) {
  q /= s;
  float r = length(q);
  float th = atan(q.y, q.x);
  if (th < 0.0) th += 2.0 * PI;
  float best = 9.0;
  for (int n = 0; n < 2; n++) {
    float ph = th + float(n) * 2.0 * PI;
    if (ph < 1.75 * PI) best = min(best, abs(r - 0.12 * exp(0.27 * ph)));
  }
  return band(best, w / s) * smoothstep(0.06, 0.13, r);
}

#ifdef SEAL
// A regular octagon of apothem r, flat sides facing the axes and diagonals (iq).
float sdOct(vec2 p, float r) {
  const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
  p = abs(p);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
// The eight trigrams in the Fu Xi order (bit i = bar i from the inside: 1 whole, 0 broken).
float trigramCode(float k) {
  return k < 0.5 ? 7.0 : k < 1.5 ? 6.0 : k < 2.5 ? 5.0 : k < 3.5 ? 4.0 : k < 4.5 ? 0.0 : k < 5.5 ? 1.0 : k < 6.5 ? 2.0 : 3.0;
}
// The bagua round the seal (round 3b, item 5; it replaces the band of tick-like rune dashes): three bars per
// sector along the octagon's side, broken bars split in the middle.
float trigrams(vec2 p) {
  float ang = atan(p.y, p.x);
  float k = mod(floor((ang + PI) / (PI / 4.0) + 0.5), 8.0);
  vec2 q = rot2(p, -(k * PI / 4.0 - PI));
  float code = trigramCode(k);
  float g = 0.0;
  for (int i = 0; i < 3; i++) {
    float rr = 0.655 + float(i) * 0.062;
    float half_ = 0.1 + float(i) * 0.016;
    float whole = mod(floor(code / pow(2.0, float(i))), 2.0);
    float bar = band(q.x - rr, 0.017) * (1.0 - smoothstep(half_ - 0.012, half_, abs(q.y)));
    float gap = (1.0 - whole) * (1.0 - smoothstep(0.02, 0.03, abs(q.y)));
    g += bar * (1.0 - gap);
  }
  return g;
}
// The seal's skill glyph (SEAL_SHAPE): thin strokes in the seal's light, +x along the facing.
float glyph(vec2 p, float r, float ang, float shape, float t) {
  float g = 0.0;
  if (shape < 0.5) {
    g = 0.0;
  } else if (shape < 1.5) {
    // Ngự Kiếm: three parallel strokes and a chevron head (≡>).
    for (int i = 0; i < 3; i++) {
      float y = (float(i) - 1.0) * 0.17;
      g += band(sdSeg(p, vec2(-0.5, y), vec2(0.2 - abs(y) * 0.4, y)), 0.018);
    }
    g += band(sdSeg(p, vec2(0.28, 0.27), vec2(0.58, 0.0)), 0.02) + band(sdSeg(p, vec2(0.28, -0.27), vec2(0.58, 0.0)), 0.02);
  } else if (shape < 2.5) {
    // Nhất Tuyến: one cut through the seal, a diamond at its point, two short guide strokes.
    g += band(sdSeg(p, vec2(-0.72, 0.0), vec2(0.6, 0.0)), 0.017);
    g += band(abs(p.x - 0.68) + abs(p.y) * 1.8 - 0.09, 0.012);
    g += (band(sdSeg(p, vec2(-0.3, 0.13), vec2(0.12, 0.13)), 0.009) + band(sdSeg(p, vec2(-0.3, -0.13), vec2(0.12, -0.13)), 0.009)) * 0.6;
  } else if (shape < 3.5) {
    // Hộ thân: three arcs round the heart with gaps, a blade on each, turning slowly.
    float a = mod(ang - t * 0.6 + PI, 2.0 * PI / 3.0);
    float seg = smoothstep(0.12, 0.22, a) * (1.0 - smoothstep(1.7, 1.9, a));
    g += band(r - 0.46, 0.02) * seg;
    for (int i = 0; i < 3; i++) {
      float th = t * 0.6 + float(i) * 2.0 * PI / 3.0;
      vec2 d = vec2(cos(th), sin(th));
      g += band(sdSeg(p, d * 0.16, d * 0.62), 0.013);
    }
  } else if (shape < 4.5) {
    // Lưu Quang Bộ: two points joined by a slanted stroke, two chevrons along it.
    g += 1.0 - smoothstep(0.035, 0.065, length(p - vec2(-0.46, -0.2)));
    g += 1.0 - smoothstep(0.035, 0.065, length(p - vec2(0.46, 0.2)));
    g += band(sdSeg(p, vec2(-0.46, -0.2), vec2(0.46, 0.2)), 0.014);
    for (int i = 0; i < 2; i++) {
      float x = -0.02 + float(i) * 0.2;
      g += band(sdSeg(p, vec2(x - 0.13, 0.16), vec2(x, 0.0)), 0.012) + band(sdSeg(p, vec2(x - 0.13, -0.16), vec2(x, 0.0)), 0.012);
    }
  } else if (shape < 5.5) {
    // Lạc Kiếm Trận: a hexagon and six swords pointing at the heart.
    g += band(sdHex(vec2(p.y, p.x), 0.5), 0.016);
    float a6 = mod(ang + PI / 6.0, PI / 3.0) - PI / 6.0;
    g += band(sin(a6) * r, 0.012) * smoothstep(0.14, 0.2, r) * (1.0 - smoothstep(0.5, 0.56, r));
    g += band(r - 0.12, 0.012);
  } else {
    // Thiên Hà: three spiral arms round a dark heart.
    for (int i = 0; i < 3; i++) {
      float th = mod(ang - t * 0.35 - float(i) * 2.0 * PI / 3.0 + 4.0 * PI, 2.0 * PI);
      float target = 0.13 * exp(0.24 * th);
      g += band(r - target, 0.018 + 0.02 * th / 6.2832) * smoothstep(0.1, 0.16, r) * (1.0 - smoothstep(0.6, 0.66, r));
    }
  }
  return g;
}
#endif

void main() {
  vec2 p = vUv;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float light = 0.0;
  float core = 0.0;
  float ink = 0.0;
  // Pale ash (normal blend), and the afterglow of a cut (added to light and core below).
  float ashL = 0.0;
  float heatL = 0.0;
  float heatC = 0.0;
  float n = fbm(p * 6.0 + uTime * 0.15);
  float revealArc = revealSoft(fract((ang + PI) / (2.0 * PI)), uReveal, 0.05);
  // The weapon's motif in jade (uMotif): a hollow ring where the pattern has a node, ruyi curls beside it.
  float mot = 0.0;
  vec3 coreC = uCore;
  float fadeK = uFade;

#if defined(PAINTED)
  vec2 q = p;
#if defined(SPIRAL)
  q = rot2(p, -uPhase);              // The painted arms turn with the analytic phase.
#endif
  vec3 s = texture2D(uMask, q * 0.5 + 0.5).rgb; // r lines, g glow, b hot
#if defined(LINE) || defined(ARROW)
  float order = (p.x + 1.0) * 0.5;   // From the caster.
#elif defined(CRACK)
  float order = r;                   // From the impact.
#else
  float order = fract((atan(q.y, q.x) + PI) / (2.0 * PI));
#endif
  float rev = revealSoft(order, uReveal, 0.05);
  float lit = 1.0;
#if defined(ARCS)
  lit = 0.25 + 0.75 * clamp(uCount - floor(order * 3.0), 0.0, 1.0);
#endif
#ifdef PAINTED_COLOR
  {
  // Authored RGB is additive light: black contributes nothing; palette and ink never recolour it.
  float brightness = max(s.r, max(s.g, s.b));
  float er = smoothstep((1.0 - uFade) * 1.1 - 0.1, (1.0 - uFade) * 1.1, brightness);
  float gain = clamp(uGlow + uHeat * 0.5, 0.0, 6.0) * (0.85 + 0.15 * n);
  gl_FragColor = vec4(s * gain * rev * lit * er, 0.0);
  return;
  }
#endif
  light = (s.r + s.g * 0.35) * rev * lit * (0.85 + 0.15 * n);
  core = s.b * rev * lit;
  ink = s.g * rev;
  heatL = s.r * uHeat * 0.5 * rev;
  heatC = s.b * uHeat * rev;
  ashL = s.g * 0.6 * rev;
  coreC = mix(uCore, uInner, uInnerMix);
  // Erode faint parts first; all channels are gone at uFade = 0.
  fadeK = smoothstep((1.0 - uFade) * 1.1 - 0.1, (1.0 - uFade) * 1.1, max(s.r, s.g * 0.6));
#elif defined(HEX)
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
    float on = smoothstep(float(i) / 6.0, float(i) / 6.0 + 0.08, uReveal - 0.02);
    corner += on * (1.0 - smoothstep(0.04, 0.13, length(p - c)));
    if (uMotif > 0.5) mot += on * biRing(p - c, 0.085, 0.012);
  }
  if (uMotif > 0.5) mot += biRing(p, 0.13, 0.01) * uReveal;
  float heart = runes(ang, r, 0.3, 0.035, 24.0, uTime * 0.25) * uReveal;
  float heartRing = band(r - 0.22, 0.014) * uReveal;
  light = (outer * revealArc * 1.2 + inner * 0.8 * uReveal + spokes * 0.7 * uReveal + heart * 0.9 + heartRing) * (0.8 + 0.2 * n);
  core = corner * 1.2 + outer * 0.45 * revealArc + heartRing * 0.5;
  ink = (1.0 - smoothstep(0.86, 1.0, r)) * 0.3 * (0.65 + 0.35 * n) + band(dOuter, 0.14) * 0.35 * revealArc + band(dInner, 0.1) * 0.22 * uReveal;
#elif defined(SPIRAL)
  // Three galaxy belts around a dark core, a rune ring round the rim, dark shadows along the arms.
  float rot = uPhase;
  float arms = 0.0;
  float shade = 0.0;
  float spine = 0.0;
  for (int i = 0; i < 3; i++) {
    float off = float(i) * 2.0 * PI / 3.0;
    float th = ang - rot - off;
    float target = 0.18 * exp(0.32 * mod(th + 2.0 * PI, 2.0 * PI));
    float d = abs(r - target);
    float along = mod(th + 2.0 * PI, 2.0 * PI) / (2.0 * PI);
    float on = smoothstep(float(i) / 3.0 - 0.001, float(i) / 3.0 + 0.1, uReveal);
    float span = smoothstep(0.08, 0.2, r) * (1.0 - smoothstep(0.86, 0.94, r));
    arms += on * band(d, 0.05 + 0.07 * along) * span;
    spine += on * band(d, 0.006 + 0.008 * along) * span;
    shade += on * band(d, 0.12 + 0.1 * along) * span;
  }
  float rim = band(r - 0.955, 0.01) * revealArc;
  float rune = runes(ang, r, 0.915, 0.022, 60.0, -uTime * 0.12) * revealArc;
  light = arms * (0.6 + 0.4 * n) + rim * 0.9 + rune * 0.8;
  if (uMotif > 0.5) {
    // The jade ring round the dark heart, and a cloud curl between each pair of arms, turning with them.
    mot += biRing(p, 0.17, 0.008) * smoothstep(0.0, 0.2, uReveal);
    for (int i = 0; i < 3; i++) {
      float a = rot + float(i) * 2.0 * PI / 3.0 + PI / 3.0;
      vec2 c = vec2(cos(a), sin(a)) * 0.34;
      mot += cloudCurl(rot2(p - c, -a), 0.17, 0.008) * smoothstep(float(i) / 3.0, float(i) / 3.0 + 0.15, uReveal);
    }
  }
  // A crisp line along each arm and star-dust knots, not a fuzzy band.
  core = spine * 0.9 + arms * smoothstep(0.62, 0.92, n) * 0.6 + rim * 0.6;
  ink = (1.0 - smoothstep(0.0, 0.22, r)) * 0.75 + smoothstep(1.0, 0.7, r) * 0.25 + shade * 0.3;
#elif defined(ARCS)
  // Three arcs with gaps; uCount arcs remain lit.
  float seg = fract((ang + PI) / (2.0 * PI) * 3.0);
  float idx = floor((ang + PI) / (2.0 * PI) * 3.0);
  float gap = smoothstep(0.0, 0.06, seg) * (1.0 - smoothstep(0.86, 0.92, seg));
  float lit = clamp(uCount - idx, 0.0, 1.0);
  float ring = band(r - 0.86, 0.075);
  float drawn = smoothstep(0.0, 0.05, uReveal * 1.05 - (idx / 3.0 + seg / 3.0) + 0.0);
  float rune = runes(ang, r, 0.7, 0.03, 30.0, uTime * 0.5) * drawn * (0.4 + 0.6 * lit);
  light = (ring * gap * (0.25 + 0.75 * lit) + rune * 0.8) * drawn;
  if (uMotif > 0.5) {
    // A jade ring in each of the three gaps, lit as the arc before it is drawn.
    for (int i = 0; i < 3; i++) {
      float a = -PI + float(i) * 2.0 * PI / 3.0;
      mot += biRing(p - vec2(cos(a), sin(a)) * 0.86, 0.07, 0.01) * smoothstep(float(i) / 3.0, float(i) / 3.0 + 0.05, uReveal);
    }
  }
  core = band(r - 0.86, 0.025) * gap * lit * 0.9 * drawn;
  ink = smoothstep(1.0, 0.8, r) * 0.15 + band(r - 0.86, 0.16) * 0.3 * drawn;
#elif defined(LINE)
  // A straight cut along x: uv.x -1 (caster) .. 1 (far end).
  float along = (p.x + 1.0) * 0.5;
  float w = abs(p.y);
  float reveal = revealSoft(along, uReveal, 0.04);
  light = (1.0 - smoothstep(0.0, 0.5, w)) * reveal * (0.7 + 0.3 * n);
  core = (1.0 - smoothstep(0.0, 0.12, w)) * reveal;
  float ends = smoothstep(0.0, 0.05, along) * smoothstep(1.0, 0.92, along);
  ink = (1.0 - smoothstep(0.1, 0.9, w + n * 0.25)) * reveal * ends;
  // Afterglow: a glowing seam with embers along the cut (uHeat) that cools into pale ash (uAsh), not a dark smear.
  float seam = (1.0 - smoothstep(0.0, 0.2 + 0.12 * n, w)) * reveal * ends;
  float speck = smoothstep(0.66, 0.86, noise(vec2(along * 150.0, p.y * 7.0) + vec2(uTime * 0.7, 0.0)));
  heatL = seam * uHeat * (0.5 + 0.5 * n);
  heatC = seam * speck * uHeat * 0.9;
  ashL = (1.0 - smoothstep(0.04, 0.8, w + (n - 0.5) * 0.3)) * reveal * ends * (0.45 + 0.55 * fbm(p * vec2(26.0, 3.0)));
  if (uMotif > 0.5) {
    // In metres (the plane is 14 × 1.8 m): a jade ring where the cut ends, two cloud curls at the caster's end.
    vec2 m = vec2(p.x * 7.0, p.y * 0.9);
    mot += biRing(m - vec2(6.4, 0.0), 0.42, 0.05) * revealSoft(0.94, uReveal, 0.04);
    mot += (cloudCurl(m - vec2(-6.1, 0.42), 0.55, 0.05) + cloudCurl(vec2(m.x + 6.1, -(m.y + 0.42)), 0.55, 0.05)) * smoothstep(0.0, 0.1, uReveal);
  }
#elif defined(ARROW)
  float along = (p.x + 1.0) * 0.5;
  float w = abs(p.y);
  float reveal = revealSoft(along, uReveal, 0.06);
  light = (1.0 - smoothstep(0.0, 0.4, w)) * reveal * 0.8;
  core = (1.0 - smoothstep(0.0, 0.1, w)) * reveal;
  ink = (1.0 - smoothstep(0.0, 0.8, w + n * 0.3)) * reveal * 0.6;
  // In metres (5 × 0.9 m): a jade ring where the step leaves.
  if (uMotif > 0.5) mot += biRing(vec2((p.x + 0.86) * 2.5, p.y * 0.45), 0.3, 0.035) * smoothstep(0.0, 0.1, uReveal);
#elif defined(SEAL)
  // The caster's seal: two rings drawn round with the word, a band of runes, a hexagram of two
  // counter-turning triangles, a soft heart; a dark disc under it so it glows on pale stone.
  float t0 = uTime * 0.7;
  // Round 3b (item 5): a bagua formation, not a HUD dial: a thin outer circle, an octagon frame turning slowly,
  // the eight trigrams between it and an inner octagon; the trigrams flare (HDR core) as the word fills.
  float ringO = band(r - 0.95, 0.016);
  vec2 pb = rot2(p, uTime * 0.12);
  float ringO2 = band(sdOct(pb, 0.855), 0.013);
  float ringI = band(sdOct(pb, 0.585), 0.011);
  float rune = trigrams(pb);
  // The skill's own glyph (the same white hexagram under every skill read as one skill, round 2).
  float gl = glyph(p, r, ang, uShape, t0) * uGlyph;
  float heart = (1.0 - smoothstep(0.0, 0.3, r)) * (uShape > 5.5 ? 0.25 : 1.0);
  light = (ringO + ringO2 * 0.7 + ringI * 0.8 + rune * 0.9) * revealArc + gl * 0.8 * uReveal + heart * 0.35 * uReveal;
  core = ringO * revealArc * 0.6 + gl * 0.5 * uReveal + rune * revealArc * 0.45 + ringO2 * revealArc * 0.3;
  ink = (1.0 - smoothstep(0.85, 1.0, r)) * 0.4 + (uShape > 5.5 ? (1.0 - smoothstep(0.0, 0.16, r)) * 0.5 * uGlyph : 0.0);
  if (uMotif > 0.5) {
    // Four jade rings ride the outer ring between the skill's glyph and the runes (the glyph stays the skill's).
    for (int i = 0; i < 4; i++) {
      float a = uTime * 0.12 + PI / 4.0 + float(i) * PI / 2.0;
      mot += biRing(p - vec2(cos(a), sin(a)) * 0.87, 0.07, 0.01) * revealSoft(fract((a + PI) / (2.0 * PI)), uReveal, 0.05);
    }
  }
#elif defined(CRACK)
  // Ground fissures under a heavy strike (L6): jagged rays from the heart and a web of cell walls warped by
  // noise, reaching out to uReveal of the radius; hot seams (uGlow) that cool, a dark bed (uInk) and pale dust (uAsh).
  vec2 q = p * 5.0 + vec2(fbm(p * 2.6), fbm(p * 2.6 + 5.2)) * 0.9;
  vec2 ip = floor(q);
  vec2 fp = fract(q);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(ip + g), hash(ip + g + 17.3));
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  float wall = 1.0 - smoothstep(0.0, 0.07 + 0.05 * r, f2 - f1);
  float a9 = (ang + PI) / (2.0 * PI) * 9.0;
  float jag = (noise(vec2(r * 7.0, floor(a9))) - 0.5) * 0.55 * smoothstep(0.05, 0.3, r);
  float sa = abs(fract(a9 + jag) - 0.5);
  float ray = 1.0 - smoothstep(0.0, 0.024 / max(r, 0.08) + 0.012, sa);
  float spread = 1.0 - smoothstep(uReveal * 0.96 - 0.1, uReveal * 0.96, r);
  float outer = 1.0 - smoothstep(0.72, 0.97, r);
  float crack = max(wall * smoothstep(0.1, 0.3, r) * (0.45 + 0.55 * (1.0 - r)), ray) * spread * outer;
  light = crack * (0.55 + 0.45 * n);
  core = crack * crack * (1.0 - 0.6 * r);
  ink = crack + (1.0 - smoothstep(0.0, 0.85, r)) * 0.25 * spread;
  // Pale dust round the fissures, never over them (the cracks stay dark).
  ashL = (1.0 - smoothstep(0.15, 0.95, r)) * spread * (0.35 + 0.65 * fbm(p * 8.0)) * 0.6 * (1.0 - crack);
#elif defined(PRESENCE)
  // The caster's ground ring (presence P7, game-hero-presence-vfx): a thin antialiased ring, three slow arc marks
  // turning (9 s a turn), a soft falloff and a dark backing so it reads on pale stone; never red, soft-edged.
  float aa = max(fwidth(r) * 1.3, 0.008);
  float ringL = 1.0 - smoothstep(0.0, aa + 0.012, abs(r - 0.8));
  float fall = exp(-abs(r - 0.8) * 10.0) * 0.32;
  float a3 = mod(ang - uTime * 0.7 + PI, 2.0 * PI / 3.0);
  float marks = (1.0 - smoothstep(0.0, aa + 0.01, abs(r - 0.66))) * smoothstep(0.05, 0.14, a3) * (1.0 - smoothstep(0.62, 0.74, a3));
  light = (ringL + fall + marks * 0.55) * revealArc;
  core = ringL * 0.3 * revealArc;
  ink = (1.0 - smoothstep(0.45, 0.95, r)) * 0.55;
#else
  // RING: a thin expanding ring (uReveal = radius 0..1).
  float d = r - uReveal * 0.95;
  light = band(d, 0.05 + 0.08 * (1.0 - uReveal)) * (0.7 + 0.3 * n);
  core = band(d, 0.015);
  ink = 0.0;
#endif

  float edge = 1.0 - smoothstep(0.96, 1.0, r);
#if defined(LINE) || defined(ARROW) || defined(PAINTED)
  edge = 1.0;
#endif
  float la = clamp(light * uGlow + heatL, 0.0, 6.0) * edge;
  float ca = clamp(core * uGlow * 2.0 + heatC * 2.0, 0.0, 6.0) * edge;
  // The motif adds soft jade (≤ uJade, no bloom) over a thin ink so it reads on pale stone.
  float ma = clamp(mot * min(uGlow, 1.0), 0.0, 1.0) * edge * uMotif;
  vec3 rgb = uColor * min(la, 1.4) + coreC * ca + uJade * ma;
  ink += mot * 0.3 * uMotif;
  float inkA = clamp(ink * uInk, 0.0, 1.0) * edge;
  float ashA = clamp(ashL * uAsh, 0.0, 0.8) * edge;
  // Premultiplied over: light adds, ink darkens, ash (pale grey) lies over the ink.
  vec3 ashC = vec3(0.3, 0.31, 0.33) * ashA;
#ifdef SOLID
  // Matter, not added light: each stroke on a soot underlay, its body covering the stone (cool → lit as it blazes),
  // only a thin hot line down its middle added; it comes and goes by erosion (uFade), not by turning see-through.
  float lv = clamp(light, 0.0, 1.5) * edge;
  float sootA = smoothstep(0.03, 0.12, lv) * uSolidSootA;
  float bodyA = smoothstep(0.2, 0.42, lv);
  float blaze = clamp(uGlow * 0.5, 0.0, 1.0);
  vec3 bodyC = mix(uSolidBody, uSolidLit, smoothstep(0.35, 1.0, blaze) * smoothstep(0.45, 0.85, lv));
  vec3 hotC = uSolidCore * clamp(core * uGlow * 1.2, 0.0, 2.5) * smoothstep(0.8, 0.97, lv);
  // The weapon's motif keeps its jade, as matter too (on the same underlay).
  float motA = smoothstep(0.25, 0.6, mot * min(uGlow, 1.0)) * edge * uMotif;
  sootA = max(sootA, smoothstep(0.04, 0.2, mot) * uSolidSootA * edge * uMotif);
  float under = clamp(inkA + sootA * (1.0 - inkA), 0.0, 1.0);
  vec3 bodyM = mix(bodyC * bodyA, uJade, motA);
  float bodyT = bodyA + motA * (1.0 - bodyA);
  vec3 rgbS = uSolidSoot * under * (1.0 - bodyT) + bodyM + hotC;
  float aS = bodyT + under * (1.0 - bodyT);
  float er = smoothstep((1.0 - uFade) * 1.1 - 0.1, (1.0 - uFade) * 1.1, n);
  gl_FragColor = vec4((rgbS * (1.0 - ashA) + ashC) * er, clamp(aS + ashA * (1.0 - aS), 0.0, 1.0) * er);
#else
  float a = clamp(inkA + ashA * (1.0 - inkA), 0.0, 1.0) * fadeK;
  gl_FragColor = vec4((rgb + ashC) * fadeK, a);
#endif
}`;

const BLACK_SIGIL_MASK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK_SIGIL_MASK.needsUpdate = true;

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
    uPhase: { value: number };
    uColor: { value: THREE.Color };
    uCore: { value: THREE.Color };
    uMask: { value: THREE.Texture };
    uInner: { value: THREE.Color };
    uInnerMix: { value: number };
    uShape: { value: number };
    uGlyph: { value: number };
    uHeat: { value: number };
    uAsh: { value: number };
    uMotif: { value: number };
    uJade: { value: THREE.Color };
    uSolidSoot: { value: THREE.Vector3 };
    uSolidSootA: { value: number };
    uSolidBody: { value: THREE.Vector3 };
    uSolidLit: { value: THREE.Vector3 };
    uSolidCore: { value: THREE.Vector3 };
  };
  /**
   * Spiral rotation speed (rad/s), integrated into uPhase by `tick`: a speed
   * change never jumps the pattern (the old uTime × speed did, MOTION_PLAN
   * step 3), and blades riding the pattern read the same phase.
   */
  spin = 0;
  /** Fade-out in progress (fadeOutEased): seconds since it began (−1 none), and the fade it began from. */
  private outT = -1;
  private out0 = 0;

  constructor(kind: SigilKind, private readonly sizeX: number, private readonly sizeZ: number, colour: string, core: string) {
    this.uniforms = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uGlow: { value: 0 },
      uInk: { value: 0 },
      uFade: { value: 0 },
      uCount: { value: 3 },
      uPhase: { value: 0 },
      uColor: { value: new THREE.Color(colour) },
      uCore: { value: new THREE.Color(core) },
      uMask: { value: BLACK_SIGIL_MASK },
      uInner: { value: new THREE.Color(1, 1, 1) },
      uInnerMix: { value: 0 },
      uShape: { value: 0 },
      uGlyph: { value: 1 },
      uHeat: { value: 0 },
      uAsh: { value: 0 },
      uMotif: { value: 0 },
      uJade: { value: new THREE.Color(0, 0, 0) },
      uSolidSoot: { value: new THREE.Vector3() },
      uSolidSootA: { value: 0 },
      uSolidBody: { value: new THREE.Vector3() },
      uSolidLit: { value: new THREE.Vector3() },
      uSolidCore: { value: new THREE.Vector3() },
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

  /** Load-time switch: preserve the painted aspect without changing animation scale. */
  setPainted(mask: THREE.Texture | null, aspect = 1, mode: SigilTextureMode = "mask"): void {
    const m = this.mesh.material as THREE.ShaderMaterial;
    const on = mask !== null;
    const color = on && mode === "color";
    if (on !== ("PAINTED" in m.defines) || color !== ("PAINTED_COLOR" in m.defines)) {
      if (on) m.defines.PAINTED = "";
      else delete m.defines.PAINTED;
      if (color) m.defines.PAINTED_COLOR = "";
      else delete m.defines.PAINTED_COLOR;
      m.needsUpdate = true;
    }
    this.uniforms.uMask.value = mask ?? BLACK_SIGIL_MASK;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(...(on ? paintedPlane(this.sizeX, aspect) : [this.sizeX, this.sizeZ] as const));
  }

  get painted(): boolean {
    return "PAINTED" in (this.mesh.material as THREE.ShaderMaterial).defines;
  }

  place(x: number, z: number, yaw = 0): void {
    this.mesh.position.set(x, 0.02, z);
    this.mesh.rotation.set(-Math.PI / 2, 0, yaw);
    this.mesh.scale.set(1, 1, 1);
    this.mesh.visible = true;
    this.outT = -1;
  }

  hide(): void {
    this.mesh.visible = false;
    this.uniforms.uFade.value = 0;
    this.outT = -1;
    this.mesh.scale.set(1, 1, 1);
  }

  /**
   * Fades the sigil out over `dur` s with an eased alpha (smoothstep from the
   * fade it shows now) and a slight swell of its size (× 1 + `grow`), then
   * hides it; call once a frame until it returns false (hidden). Round 2:
   * sigils used to fade linearly or drop in a frame.
   */
  fadeOutEased(dt: number, dur = 0.3, grow = 0.06): boolean {
    if (!this.mesh.visible) return false;
    if (this.outT < 0) {
      this.outT = 0;
      this.out0 = this.uniforms.uFade.value;
    }
    this.outT += dt;
    const u = Math.min(1, this.outT / dur);
    const e = u * u * (3 - 2 * u);
    if (u >= 1) {
      this.hide();
      return false;
    }
    this.uniforms.uFade.value = this.out0 * (1 - e);
    const s = 1 + grow * e;
    this.mesh.scale.set(s, s, 1);
    return true;
  }

  /**
   * An element's solid look (element-kit.ts SigilLook: matter on a soot underlay, a thin hot line) or null for the
   * added light (Metal; the program is then the one it always was). Load time: switching recompiles.
   */
  setSolid(look: { readonly soot: readonly number[]; readonly sootAlpha: number; readonly body: readonly number[]; readonly lit: readonly number[]; readonly core: readonly number[] } | null): void {
    const m = this.mesh.material as THREE.ShaderMaterial;
    const on = look !== null;
    if (on !== "SOLID" in m.defines) {
      if (on) m.defines.SOLID = "";
      else delete m.defines.SOLID;
      m.needsUpdate = true;
    }
    if (look === null) return;
    const u = this.uniforms;
    u.uSolidSoot.value.set(look.soot[0]!, look.soot[1]!, look.soot[2]!);
    u.uSolidSootA.value = look.sootAlpha;
    u.uSolidBody.value.set(look.body[0]!, look.body[1]!, look.body[2]!);
    u.uSolidLit.value.set(look.lit[0]!, look.lit[1]!, look.lit[2]!);
    u.uSolidCore.value.set(look.core[0]!, look.core[1]!, look.core[2]!);
  }

  /** True while fadeOutEased runs. */
  get fadingOut(): boolean {
    return this.outT >= 0;
  }

  tick(dt: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uPhase.value += this.spin * dt;
  }

  /** The spiral's phase (rad) this frame. */
  get phase(): number {
    return this.uniforms.uPhase.value;
  }
}
