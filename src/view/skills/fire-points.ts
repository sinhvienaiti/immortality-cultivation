/**
 * Fire points (round 3 of Sword × Fire, 03/11/2026): where a blow lands, a beast dies or a sword is planted, a point of
 * fire instead of a smooth white ball (the dot sprite at × 3–4.5, up to 1.3 m wide, read as white spheres). A small
 * white-gold core (about 0.2–0.3 m, the only part added and HDR, so the only part that blooms) inside a star of flame
 * tongues: an amber heart cooling to vermilion toward the tips, a thin soot rim at their edge (matter, normal blend,
 * premultiplied, ≤ 0.9 a channel, so it stays saturated on pale stone). Fully bright on its first frame; the tongues
 * shoot out over its first ~60 ms, then it cools (the core shrinks and goes, the body falls from amber to vermilion
 * toward char) and erodes from the tips in (never a see-through fade).
 *
 * GPU-analytic like heat-rings.ts: each spawn writes its slot once, the shader draws it on the pool's clock. One draw
 * call, hidden while nothing burns; no allocation per frame or per spawn. A live point is never overwritten: a full
 * pool drops the new one (counted in `dropped`).
 */
import * as THREE from "three";
import type { Rgb } from "./weapons";

const VERTEX = /* glsl */ `
uniform float uTime;
attribute vec4 iPos;   // x y z, start time (s, the pool's clock)
attribute vec4 iLook;  // reach (m), core radius (m), life (s), seed
attribute vec2 iHeat;  // heat at birth (0..1), tongue count
varying vec2 vUv;
varying float vU;
varying float vCore;
varying float vSeed;
varying float vHeat;
varying float vTongues;
varying float vAge;
void main() {
  float age = uTime - iPos.w;
  float life = iLook.z;
  vUv = uv * 2.0 - 1.0;
  vU = 0.0;
  vCore = iLook.y / max(iLook.x, 1e-3);
  vSeed = iLook.w;
  vHeat = iHeat.x;
  vTongues = iHeat.y;
  vAge = age;
  if (age < 0.0 || age >= life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vU = age / life;
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += position.xy * 2.0 * iLook.x;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSoot;
uniform vec3 uDeep;
uniform vec3 uAmber;
uniform vec3 uCore;
uniform vec3 uChar;
varying vec2 vUv;
varying float vU;
varying float vCore;
varying float vSeed;
varying float vHeat;
varying float vTongues;
varying float vAge;
float fpHash(float p) { return fract(sin(p * 127.1 + 311.7) * 43758.5453); }
float fpHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fpNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fpHash2(i), fpHash2(i + vec2(1.0, 0.0)), u.x), mix(fpHash2(i + vec2(0.0, 1.0)), fpHash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float u = vU;
  // The tongues shoot out over ~60 ms (eased out) and keep reaching a little while it burns.
  float grow = 1.0 - exp(-vAge * 38.0);
  grow = mix(0.55, 1.0, grow) * (1.0 + 0.12 * u);
  // A star of flame tongues: each angular sector one tongue, its own length and a slight swirl (they lick, not rays).
  float ang = atan(vUv.y, vUv.x) + vSeed * 6.2831853 + r * 0.9;
  float sector = ang / 6.2831853 * vTongues;
  float id = floor(sector);
  float f = fract(sector) - 0.5;
  float len = mix(0.55, 1.0, fpHash(id + vSeed * 31.0));
  // Tongue profile: wide at the root, tapering to a point; the edge wavers.
  float n = fpNoise(vec2(ang * 3.0, r * 6.0 - vAge * 9.0) + vSeed * 7.0);
  float hw = mix(0.5, 0.04, smoothstep(0.15, 1.0, r / max(len * grow, 1e-3))) + (n - 0.5) * 0.08;
  float tongue = 1.0 - smoothstep(hw - 0.06, hw, abs(f));
  float reach = len * grow * (0.82 + 0.18 * n);
  float tip = 1.0 - smoothstep(reach - 0.05, reach, r);
  // A solid heart joins the tongues' roots.
  float heartR = 0.34 * grow;
  float heart = 1.0 - smoothstep(heartR - 0.06, heartR, r + (n - 0.5) * 0.08);
  float body = max(heart, tongue * tip);
  // It cools: the core goes first, the body falls from amber to vermilion toward char; it erodes from the tips in.
  float heat = vHeat * pow(1.0 - u, 1.4);
  float thr = smoothstep(0.35, 1.0, u) * 1.08;
  float keep = smoothstep(thr, thr + 0.08, (1.0 - r / max(reach, 0.2)) * 0.75 + n * 0.3 + 0.05);
  float a = body * keep;
  // The core: a point, white-gold only while hot (a big HDR core bloomed into a white ball on pale stone).
  float coreA = (1.0 - smoothstep(vCore * 0.45, vCore, r)) * smoothstep(0.3, 0.75, heat);
  if (a < 0.003 && coreA < 0.003) discard;
  float t = r / max(reach, 1e-3);
  vec3 col = mix(uAmber, uDeep, smoothstep(0.2, 0.85, t));
  col = mix(uChar, col, smoothstep(0.08, 0.55, heat));
  // A thin soot rim along the tongues' edge (the dark under the bright: contrast on pale stone).
  float rim = smoothstep(0.0, 0.07, body) * (1.0 - smoothstep(0.07, 0.3, body)) + smoothstep(0.82, 1.0, t) * 0.6;
  col = mix(col, uSoot, clamp(rim, 0.0, 1.0) * 0.7);
  vec3 rgb = col * a + uCore * coreA * (0.45 + 0.9 * heat);
  gl_FragColor = vec4(rgb, a);
}`;

export interface FirePointSpec {
  x: number;
  y: number;
  z: number;
  /** How far its tongues reach (m), its white-gold core's radius (m), seconds it lives, seconds before it shows. */
  reach: number;
  core: number;
  life: number;
  delay: number;
  /** Heat at birth (1: a white-gold core, amber body … 0.5: cooler) and how many tongues (5–13). */
  heat: number;
  tongues: number;
}

export class FirePointPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly spec: FirePointSpec = { x: 0, y: 0, z: 0, reach: 0.8, core: 0.24, life: 0.3, delay: 0, heat: 1, tongues: 9 };
  private readonly pos: Float32Array;
  private readonly look: Float32Array;
  private readonly heat: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private cursor = 0;
  private used = 0;
  private seed = 0;
  private time = 0;
  private until = 0;
  private dirty = false;
  /** Points dropped since the last clear because every slot held a live one (size the pool so it stays 0). */
  dropped = 0;

  constructor(
    readonly capacity: number,
    renderOrder = 14,
  ) {
    this.pos = new Float32Array(capacity * 4);
    this.look = new Float32Array(capacity * 4);
    this.heat = new Float32Array(capacity * 2);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    this.attrs = [new THREE.InstancedBufferAttribute(this.pos, 4), new THREE.InstancedBufferAttribute(this.look, 4), new THREE.InstancedBufferAttribute(this.heat, 2)].map((a) => a.setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iPos", this.attrs[0]!);
    geometry.setAttribute("iLook", this.attrs[1]!);
    geometry.setAttribute("iHeat", this.attrs[2]!);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uSoot: { value: new THREE.Vector3(0.03, 0.018, 0.01) },
        uDeep: { value: new THREE.Vector3(0.75, 0.13, 0.01) },
        uAmber: { value: new THREE.Vector3(0.9, 0.5, 0.06) },
        uCore: { value: new THREE.Vector3(1, 0.9, 0.62) },
        uChar: { value: new THREE.Vector3(0.06, 0.035, 0.015) },
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
    this.mesh.name = "fx-fire-points";
  }

  /** Its ramp (linear): the soot rim, the vermilion tips, the amber heart (≤ 0.9), the core (added, × up to 1.35 hot), the char it cools to. */
  setRamp(soot: Rgb, deep: Rgb, amber: Rgb, core: Rgb, char: Rgb): void {
    const u = this.mesh.material.uniforms;
    (u.uSoot!.value as THREE.Vector3).set(soot[0], soot[1], soot[2]);
    (u.uDeep!.value as THREE.Vector3).set(deep[0], deep[1], deep[2]);
    (u.uAmber!.value as THREE.Vector3).set(amber[0], amber[1], amber[2]);
    (u.uCore!.value as THREE.Vector3).set(core[0], core[1], core[2]);
    (u.uChar!.value as THREE.Vector3).set(char[0], char[1], char[2]);
  }

  reset(): FirePointSpec {
    const s = this.spec;
    s.reach = 0.8;
    s.core = 0.24;
    s.life = 0.3;
    s.delay = 0;
    s.heat = 1;
    s.tongues = 9;
    return s;
  }

  /** One point from `spec` in a free slot (a live one is never cut short: a full pool drops the new one). */
  emit(): boolean {
    const s = this.spec;
    let i = -1;
    for (let k = 0, j = this.cursor; k < this.capacity; k += 1) {
      const life = this.look[j * 4 + 2]!;
      if (life <= 0 || this.time >= this.pos[j * 4 + 3]! + life) {
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
    this.seed = (this.seed + 0.618034) % 1;
    this.pos[o] = s.x;
    this.pos[o + 1] = s.y;
    this.pos[o + 2] = s.z;
    this.pos[o + 3] = t0;
    this.look[o] = Math.max(0.02, s.reach);
    this.look[o + 1] = Math.max(0, Math.min(s.core, s.reach));
    this.look[o + 2] = Math.max(0.02, s.life);
    this.look[o + 3] = this.seed;
    this.heat[i * 2] = s.heat;
    this.heat[i * 2 + 1] = Math.max(3, Math.round(s.tongues));
    this.until = Math.max(this.until, t0 + this.look[o + 2]!);
    this.dirty = true;
    return true;
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
    this.look.fill(0);
    this.until = this.time;
    this.cursor = 0;
    this.used = 0;
    this.seed = 0;
    this.dropped = 0;
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
