/**
 * Loose embers (canon D59, ELEMENT_LAYER §3; the 03/11 check: Dragonhold's ember atlas drawn as a heat field at
 * 1.3–2.6 m read as one dense spiky blob that cooled to a dark red, like blood on the black scorch). Here every ember
 * is its own small glowing speck (0.08–0.35 m): thrown off and rising, drifting with a slow sway, flickering, and
 * cooling from white-gold through amber to a dim orange glow that shrinks away (eased out; the cooling keeps its
 * hue orange, never dark red or maroon). A speck is a solid matte (premultiplied, so on pale stone it stays
 * saturated instead of washing out) with a thin added glow round it; only the hottest specks reach HDR.
 *
 * GPU-analytic: each spawn writes its slot once (start, velocity, drag, buoyancy, sway, life); the vertex shader
 * moves it on the stage's clock (exact damping, so any frame rate draws the same path, and a hit-stop holds it).
 * One draw call, hidden while nothing burns. No allocation per frame or per spawn. A live ember is never overwritten.
 */
import * as THREE from "three";
import type { Rgb } from "./weapons";

const VERTEX = /* glsl */ `
uniform float uTime;
attribute vec4 iP0;   // start x y z, start time (s, the pool's clock)
attribute vec4 iV0;   // velocity x y z, life (s)
attribute vec4 iA;    // size (m), seed 0..1, heat at birth (0..1.2), drag (1/s)
attribute vec4 iB;    // buoyancy (m/s², up), sway (m), flicker share, velocity stretch (s)
varying vec2 vUv;
varying float vHeat;
varying float vGlow;
void main() {
  float age = uTime - iP0.w;
  float life = iV0.w;
  vUv = uv * 2.0 - 1.0;
  vHeat = 0.0;
  vGlow = 0.0;
  if (age < 0.0 || age >= life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float k = max(iA.w, 1e-3);
  vec3 acc = vec3(0.0, iB.x, 0.0);
  float e = exp(-k * age);
  vec3 p = iP0.xyz + (acc / k) * age + (iV0.xyz - acc / k) * ((1.0 - e) / k);
  vec3 vel = acc / k + (iV0.xyz - acc / k) * e;
  // A slow sway (hot air), zero at birth.
  float s = iA.y * 6.2831853;
  p.x += iB.y * (sin(age * 1.9 + s) - sin(s));
  p.z += iB.y * (cos(age * 1.4 + s * 1.7) - cos(s * 1.7));
  float u = age / life;
  // It cools as it lives (fast at first) and shrinks with its heat; it eases in over 50 ms and out at its end.
  float heat = iA.z * pow(1.0 - u, 1.5);
  float size = iA.x * (0.3 + 0.7 * smoothstep(0.05, 0.7, heat)) * smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.65, 1.0, u));
  // Flicker: two beating rates per ember.
  float f = 0.5 + 0.5 * sin(uTime * 21.0 + s * 7.0) * sin(uTime * 12.7 + s * 3.0);
  vHeat = heat * (1.0 - iB.z * f);
  vGlow = smoothstep(0.55, 1.0, heat);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Drawn along its motion on screen (a short streak while it flies fast, a round speck as it floats).
  vec2 vv = (viewMatrix * vec4(vel, 0.0)).xy;
  float len = length(vv);
  vec2 c = position.xy * 2.2;
  vec2 o = c * size;
  if (len > 1e-3) {
    vec2 d = vv / len;
    // (d.y, −d.x) keeps the quad's winding (a mirrored quad would face away and be culled).
    o = d * c.y * (size + len * iB.w) + vec2(d.y, -d.x) * c.x * size;
  }
  mv.xy += o;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uHot;
uniform vec3 uAmber;
uniform vec3 uOrange;
uniform vec3 uDim;
varying vec2 vUv;
varying float vHeat;
varying float vGlow;
vec3 ramp(float h) {
  vec3 c = mix(uDim, uOrange, smoothstep(0.08, 0.35, h));
  c = mix(c, uAmber, smoothstep(0.35, 0.65, h));
  return mix(c, uHot * (1.0 + 1.6 * smoothstep(0.85, 1.15, h)), smoothstep(0.65, 0.95, h));
}
void main() {
  float r = length(vUv);
  // The speck (a solid matte, hotter at its heart) and a thin glow round it while it is hot.
  float cov = 1.0 - smoothstep(0.24, 0.38, r);
  float halo = exp(-r * r * 7.0) * (1.0 - cov) * vGlow;
  if (cov + halo < 0.004) discard;
  vec3 c = mix(ramp(vHeat), ramp(vHeat + 0.35), 1.0 - smoothstep(0.0, 0.26, r));
  float a = cov * 0.95;
  gl_FragColor = vec4(c * a + ramp(vHeat) * halo * 0.3, a);
}`;

/** How an ember is thrown (all optional but the place). */
export interface EmberSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Speck size (m), seconds it lives, heat at birth (1 white-gold … 0.5 amber), seconds before it shows. */
  size: number;
  life: number;
  heat: number;
  delay: number;
  /** Velocity damping (1/s) and buoyancy (m/s², up: hot air carries it), sway (m), flicker share (0–1). */
  drag: number;
  rise: number;
  sway: number;
  flicker: number;
  /** Streak along its screen motion (s of travel; 0: round). */
  stretch: number;
}

export class EmberPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly spec: EmberSpec = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.15, life: 1, heat: 1, delay: 0, drag: 1.5, rise: 1, sway: 0.15, flicker: 0.35, stretch: 0.03 };
  private readonly p0: Float32Array;
  private readonly v0: Float32Array;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private cursor = 0;
  /** Slots written since the last clear (only those are drawn). */
  private used = 0;
  private seed = 0;
  private time = 0;
  /** The pool's clock when its last ember dies (hidden after it). */
  private until = 0;
  private dirty = false;
  /** Slots looked at for a free one before an ember is dropped. */
  private static readonly SCAN = 64;
  /** Embers dropped since the last clear because the pool was full of live ones (size the pool so it stays 0). */
  dropped = 0;

  constructor(
    readonly capacity: number,
    renderOrder = 13,
  ) {
    this.p0 = new Float32Array(capacity * 4);
    this.v0 = new Float32Array(capacity * 4);
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    this.attrs = [this.p0, this.v0, this.a, this.b].map((arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iP0", this.attrs[0]!);
    geometry.setAttribute("iV0", this.attrs[1]!);
    geometry.setAttribute("iA", this.attrs[2]!);
    geometry.setAttribute("iB", this.attrs[3]!);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        // Linear: white-gold, amber, orange, and the dim orange an ember dies in (its green kept at ≥ 0.2 of its red,
        // so its hue stays orange as it darkens: never dark red).
        uHot: { value: new THREE.Vector3(1, 0.86, 0.55) },
        uAmber: { value: new THREE.Vector3(1, 0.47, 0.02) },
        uOrange: { value: new THREE.Vector3(0.95, 0.24, 0.02) },
        uDim: { value: new THREE.Vector3(0.42, 0.095, 0.012) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "fx-embers";
  }

  /** The cooling ramp (linear): white-gold, amber, orange, and the dim orange an ember dies in. */
  setRamp(hot: Rgb, amber: Rgb, orange: Rgb, dim: Rgb): void {
    const u = this.mesh.material.uniforms;
    (u.uHot!.value as THREE.Vector3).set(hot[0], hot[1], hot[2]);
    (u.uAmber!.value as THREE.Vector3).set(amber[0], amber[1], amber[2]);
    (u.uOrange!.value as THREE.Vector3).set(orange[0], orange[1], orange[2]);
    (u.uDim!.value as THREE.Vector3).set(dim[0], dim[1], dim[2]);
  }

  /** Resets the spec to its defaults (reused for every spawn). */
  reset(): EmberSpec {
    const s = this.spec;
    s.vx = s.vy = s.vz = 0;
    s.size = 0.15;
    s.life = 1;
    s.heat = 1;
    s.delay = 0;
    s.drag = 1.5;
    s.rise = 1;
    s.sway = 0.15;
    s.flicker = 0.35;
    s.stretch = 0.03;
    return s;
  }

  /**
   * One ember from `spec` in a free slot. A live ember is never cut short (it would vanish in one frame: a pop): when
   * the next SCAN slots from the cursor all hold live embers, the new one is dropped (counted in `dropped`).
   */
  emit(): boolean {
    const s = this.spec;
    let i = -1;
    for (let k = 0, j = this.cursor; k < Math.min(EmberPool.SCAN, this.capacity); k += 1) {
      const life = this.v0[j * 4 + 3]!;
      if (life <= 0 || this.time >= this.p0[j * 4 + 3]! + life) {
        i = j;
        break;
      }
      j = (j + 1) % this.capacity;
    }
    if (i < 0) {
      this.dropped += 1;
      return false;
    }
    this.cursor = (i + 1) % this.capacity;
    this.used = Math.max(this.used, i + 1);
    const o = i * 4;
    const t0 = this.time + Math.max(0, s.delay);
    this.p0[o] = s.x;
    this.p0[o + 1] = s.y;
    this.p0[o + 2] = s.z;
    this.p0[o + 3] = t0;
    this.v0[o] = s.vx;
    this.v0[o + 1] = s.vy;
    this.v0[o + 2] = s.vz;
    this.v0[o + 3] = Math.max(0.05, s.life);
    this.seed = (this.seed + 0.618034) % 1;
    this.a[o] = s.size;
    this.a[o + 1] = this.seed;
    this.a[o + 2] = s.heat;
    this.a[o + 3] = s.drag;
    this.b[o] = s.rise;
    this.b[o + 1] = s.sway;
    this.b[o + 2] = Math.min(1, Math.max(0, s.flicker));
    this.b[o + 3] = Math.max(0, s.stretch);
    this.until = Math.max(this.until, t0 + this.v0[o + 3]!);
    this.dirty = true;
    return true;
  }

  /** Moves the clock (embers move in the shader) and uploads this frame's spawns. */
  update(dt: number): void {
    this.time += dt;
    const live = this.time < this.until;
    this.mesh.visible = live;
    const g = this.mesh.geometry;
    g.instanceCount = live ? this.used : 0;
    this.mesh.material.uniforms.uTime!.value = this.time;
    if (this.dirty) {
      for (const a of this.attrs) a.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear(): void {
    this.v0.fill(0);
    this.until = this.time;
    this.cursor = 0;
    this.used = 0;
    this.seed = 0;
    this.dropped = 0;
    this.dirty = true;
    this.mesh.visible = false;
    this.mesh.geometry.instanceCount = 0;
  }

  get live(): boolean {
    return this.time < this.until;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
