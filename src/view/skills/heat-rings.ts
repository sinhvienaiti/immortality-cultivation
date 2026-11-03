/**
 * Rings of heat as matter, not added light (03/11 fixes: Fire's pressure ring at the hand was the additive shock
 * sheet in the fire palette, pale pink-orange on light stone). A ring is a band of the element's body colour (normal
 * blend, premultiplied: it covers the stone, so it stays saturated on pale ground) with fire's structure (round 3: a
 * uniform thick band read as an orange plastic ring): its width and heat vary round it, flame tongues lick outward
 * from it (amber at the root, vermilion at the tip, each its own length, shorter as it cools), a thin hot line down
 * its middle (alone added, HDR while hot) breaks into segments that part as it cools, a soot underlay thick along its
 * inner edge and thin along the outer. It opens fast and eased out, the cooler arcs cool first, and it breaks up by
 * erosion at its end (never a see-through fade). Camera-facing (a pressure ring at the hand) or lying on the ground
 * (a ring of fire round a plant); the kit sheds embers off it.
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
varying float vAge;
void main() {
  float age = uTime - iPos.w;
  vAge = age;
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
  // The band's radius sits at RR of the quad's half-size (room outside it for the flame tongues).
  float R = mix(iRing.x, iRing.y, k) / RR;
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
varying float vAge;
float hrHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hrHash1(float p) { return fract(sin(p * 91.7 + 17.3) * 43758.5453); }
float hrNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hrHash(i), hrHash(i + vec2(1.0, 0.0)), u.x), mix(hrHash(i + vec2(0.0, 1.0)), hrHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  // Round the ring through the circle's own coordinates (no seam at ±π): its width and heat vary (low), its edge
  // wavers (mid), and it shimmers as it opens.
  vec2 ring = vec2(cos(ang), sin(ang));
  float nw = hrNoise(ring * 1.8 + vSeed * 17.0);
  float nh = hrNoise(ring * 2.6 - vSeed * 9.0 + 5.0);
  float nm = hrNoise(ring * 7.0 - vSeed * 5.0 + vec2(vAge * 3.0, 0.0));
  float w = vW * RR * (1.0 - 0.35 * vU) * (0.45 + 1.1 * nw);
  float d = r - RR;
  float dn = d + (nm - 0.5) * w * 0.5;
  // Uneven cooling: some arcs stay lit longer than others.
  float heat = clamp(vHeat * (0.5 + 1.0 * nh), 0.0, 1.0);
  float bodyA = 1.0 - smoothstep(w * 0.42, w * 0.62, abs(dn));
  // Flame tongues licking out from the band: one per sector, each its own length (shorter as it cools), tapering to a
  // point, wavering, flickering outward.
  float K = 26.0;
  float sec = (ang / 6.2831853 + 0.5) * K;
  float id = floor(sec);
  float fs = fract(sec) - 0.5;
  float L = w * 1.9 * (0.25 + 0.75 * hrHash1(id + vSeed * 13.0)) * (0.35 + 0.65 * heat) * (0.85 + 0.3 * nm);
  float t = (dn - w * 0.42) / max(L, 1e-4);
  float hw = mix(0.46, 0.04, clamp(t, 0.0, 1.0)) + (hrNoise(vec2(id * 3.1, t * 3.0 - vAge * 8.0)) - 0.5) * 0.16;
  float tongue = step(0.0, t) * (1.0 - smoothstep(0.82, 1.0, t)) * (1.0 - smoothstep(hw - 0.08, hw, abs(fs + (nm - 0.5) * 0.2 * t)));
  // A soot underlay: dense along the inner edge, a thin dark line at the outer edge of the band and the tongues.
  float inner = (1.0 - smoothstep(w * 0.55, w * 1.6, -dn)) * step(dn, 0.0);
  float outer = (1.0 - smoothstep(w * 0.62, w * 0.9, dn)) * step(0.0, dn);
  float sootA = max(inner, outer * 0.85) * uSootA;
  float flame = max(bodyA, tongue * 0.96);
  // It breaks up and goes at its end, the cooler arcs and the thin parts first.
  float thr = smoothstep(0.4, 1.0, vU) * 1.05;
  float keep = smoothstep(thr, thr + 0.12, nm * 0.6 + (1.0 - abs(dn) / max(w, 1e-4)) * 0.2 + heat * 0.25 + 0.05);
  float a = (flame + sootA * (1.0 - flame)) * keep;
  if (a < 0.003) discard;
  vec3 lit = mix(uBody, uLit, smoothstep(0.2, 0.85, heat));
  // The band lit, the tongues amber at their root cooling to vermilion at the tip.
  vec3 fc = mix(lit, uBody, smoothstep(0.0, 0.9, t) * step(w * 0.42, dn));
  // A thin hot line down the band, broken into segments that part as it cools.
  float seg = smoothstep(0.32 + 0.45 * vU, 0.46 + 0.45 * vU, hrNoise(ring * 9.0 + vSeed * 3.0));
  float hot = (1.0 - smoothstep(0.0, w * 0.12, abs(dn))) * seg * bodyA;
  vec3 rgb = uSoot * sootA * (1.0 - flame) + fc * flame + uCore * hot * heat * 1.8;
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
      defines: facing === "ground" ? { GROUND: "", RR: "0.68" } : { RR: "0.68" },
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
