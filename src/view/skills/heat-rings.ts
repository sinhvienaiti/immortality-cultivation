/**
 * Rings of heat as matter, not added light (03/11 fixes: Fire's pressure ring at the hand was the additive shock
 * sheet in the fire palette, pale pink-orange on light stone). A ring is a band of the element's body colour (normal
 * blend, premultiplied: it covers the stone, so it stays saturated on pale ground) on a wider soot underlay, with a
 * thin hot line down its middle that alone is added (HDR while hot). It opens fast and eased out, cools from lit to
 * body colour, and breaks up by erosion at its end (never a see-through fade). Camera-facing (a pressure ring at the
 * hand) or lying on the ground (a ring of fire round a plant).
 *
 * GPU-analytic like embers.ts: each spawn writes its slot once and the shader opens and cools it on the pool's clock.
 * One draw call, hidden while nothing burns; no allocation per frame or per spawn.
 */
import * as THREE from "three";
import type { Rgb } from "./weapons";

const VERTEX = /* glsl */ `
uniform float uTime;
attribute vec4 iPos;   // x y z, start time (s, the pool's clock)
attribute vec4 iRing;  // radius from, radius to (m), life (s), seed
attribute vec4 iLook;  // band width (share of the radius), heat at birth (0..1), turn (rad), unused
varying vec2 vUv;
varying float vU;
varying float vHeat;
varying float vW;
varying float vSeed;
void main() {
  float age = uTime - iPos.w;
  float life = iRing.z;
  vUv = uv * 2.0 - 1.0;
  vU = 0.0;
  vHeat = 0.0;
  vW = iLook.x;
  vSeed = iRing.w;
  if (age < 0.0 || age >= life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = age / life;
  vU = u;
  float k = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
  // The band's radius sits at 0.8 of the quad's half-size.
  float R = mix(iRing.x, iRing.y, k) / 0.8;
  vHeat = iLook.y * pow(1.0 - u, 1.2);
  float c = cos(iLook.z);
  float s = sin(iLook.z);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * 2.0 * R;
#ifdef GROUND
  vec4 mv = viewMatrix * vec4(iPos.x + q.x, iPos.y, iPos.z - q.y, 1.0);
#else
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += q;
#endif
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSoot;
uniform float uSootA;
uniform vec3 uBody;
uniform vec3 uLit;
uniform vec3 uCore;
varying vec2 vUv;
varying float vU;
varying float vHeat;
varying float vW;
varying float vSeed;
float hrHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hrNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hrHash(i), hrHash(i + vec2(1.0, 0.0)), u.x), mix(hrHash(i + vec2(0.0, 1.0)), hrHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  // Around the ring: flame-like breaks (two octaves, wrapping at ±π through the circle's own coordinates).
  vec2 ring = vec2(cos(ang), sin(ang));
  float n = hrNoise(ring * 3.0 + vSeed * 17.0) * 0.6 + hrNoise(ring * 7.0 - vSeed * 5.0 + vU * 2.0) * 0.4;
  float w = vW * 0.8 * (1.0 - 0.45 * vU);
  float d = abs(r - 0.8) + (n - 0.5) * w * 0.5;
  float bodyA = 1.0 - smoothstep(w * 0.55, w * 0.85, d);
  float sootA = (1.0 - smoothstep(w * 0.85, w * 1.35, d)) * uSootA;
  float hot = 1.0 - smoothstep(0.0, w * 0.12, d);
  // It breaks up and goes at its end (the thin parts of the band first).
  float thr = smoothstep(0.5, 1.0, vU) * 1.05;
  float keep = smoothstep(thr, thr + 0.12, n * 0.8 + (1.0 - d / max(w, 1e-4)) * 0.25);
  float a = (bodyA + sootA * (1.0 - bodyA)) * keep;
  if (a < 0.003) discard;
  vec3 body = mix(uBody, uLit, smoothstep(0.25, 0.85, vHeat));
  vec3 rgb = uSoot * sootA * (1.0 - bodyA) + body * bodyA + uCore * hot * vHeat * 1.8;
  gl_FragColor = vec4(rgb * keep, a);
}`;

export interface HeatRingSpec {
  x: number;
  y: number;
  z: number;
  /** Radius it opens from and to (m), seconds it lives, seconds before it shows. */
  r0: number;
  r1: number;
  life: number;
  delay: number;
  /** Band width as a share of the radius, heat at birth (1: lit with a hot line … 0: body colour). */
  width: number;
  heat: number;
}

export class HeatRingPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly spec: HeatRingSpec = { x: 0, y: 0, z: 0, r0: 0.3, r1: 1.5, life: 0.25, delay: 0, width: 0.12, heat: 1 };
  private readonly pos: Float32Array;
  private readonly ring: Float32Array;
  private readonly look: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private cursor = 0;
  private used = 0;
  private seed = 0;
  private time = 0;
  private until = 0;
  private dirty = false;

  constructor(
    readonly capacity: number,
    facing: "camera" | "ground",
    renderOrder = 14,
  ) {
    this.pos = new Float32Array(capacity * 4);
    this.ring = new Float32Array(capacity * 4);
    this.look = new Float32Array(capacity * 4);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    this.attrs = [this.pos, this.ring, this.look].map((arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iPos", this.attrs[0]!);
    geometry.setAttribute("iRing", this.attrs[1]!);
    geometry.setAttribute("iLook", this.attrs[2]!);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: facing === "ground" ? { GROUND: "" } : {},
      uniforms: {
        uTime: { value: 0 },
        uSoot: { value: new THREE.Vector3(0.02, 0.018, 0.017) },
        uSootA: { value: 0.75 },
        uBody: { value: new THREE.Vector3(0.75, 0.1, 0.01) },
        uLit: { value: new THREE.Vector3(1, 0.44, 0.045) },
        uCore: { value: new THREE.Vector3(1, 0.88, 0.6) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      ...(facing === "ground" ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : {}),
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "fx-heat-rings";
  }

  /** Its matter (linear): the soot under it and its opacity, the band cool and lit, and the thin hot line (× 2.2 hot). */
  setLook(soot: Rgb, sootAlpha: number, body: Rgb, lit: Rgb, core: Rgb): void {
    const u = this.mesh.material.uniforms;
    (u.uSoot!.value as THREE.Vector3).set(soot[0], soot[1], soot[2]);
    u.uSootA!.value = sootAlpha;
    (u.uBody!.value as THREE.Vector3).set(body[0], body[1], body[2]);
    (u.uLit!.value as THREE.Vector3).set(lit[0], lit[1], lit[2]);
    (u.uCore!.value as THREE.Vector3).set(core[0], core[1], core[2]);
  }

  reset(): HeatRingSpec {
    const s = this.spec;
    s.r0 = 0.3;
    s.r1 = 1.5;
    s.life = 0.25;
    s.delay = 0;
    s.width = 0.12;
    s.heat = 1;
    return s;
  }

  emit(): void {
    const s = this.spec;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.used = Math.max(this.used, i + 1);
    const o = i * 4;
    const t0 = this.time + Math.max(0, s.delay);
    this.seed = (this.seed + 0.618034) % 1;
    this.pos[o] = s.x;
    this.pos[o + 1] = s.y;
    this.pos[o + 2] = s.z;
    this.pos[o + 3] = t0;
    this.ring[o] = s.r0;
    this.ring[o + 1] = s.r1;
    this.ring[o + 2] = Math.max(0.02, s.life);
    this.ring[o + 3] = this.seed;
    this.look[o] = Math.max(0.01, s.width);
    this.look[o + 1] = s.heat;
    this.look[o + 2] = this.seed * 6.2831853;
    this.look[o + 3] = 0;
    this.until = Math.max(this.until, t0 + this.ring[o + 2]!);
    this.dirty = true;
  }

  update(dt: number): void {
    this.time += dt;
    const live = this.time < this.until;
    this.mesh.visible = live;
    this.mesh.geometry.instanceCount = live ? this.used : 0;
    this.mesh.material.uniforms.uTime!.value = this.time;
    if (this.dirty) {
      for (const a of this.attrs) a.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear(): void {
    this.ring.fill(0);
    this.until = this.time;
    this.cursor = 0;
    this.used = 0;
    this.seed = 0;
    this.dirty = true;
    this.mesh.visible = false;
    this.mesh.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
