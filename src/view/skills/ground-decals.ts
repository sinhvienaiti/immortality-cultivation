/**
 * Pooled flat decals on the ground (canon D59, ELEMENT_LAYER §3 "Ground decal pool"): what a blow leaves where it
 * landed, an element's ground state (Fire's scorch, Water's wet patch, Earth's crack, Ice's frost), made once per
 * texture and drawn in one call (hidden while empty). A decal grows in from its heart, lies there, then erodes away
 * from its thin parts (a rising threshold through its coverage, broken by noise): never a see-through fade, which
 * reads as a veil on pale stone (DRAGON_FIRE_DIAGNOSIS). An optional glowing edge cools over its life (Fire's
 * embers in the scorch), added in the same premultiplied pass. Texture: A = coverage, R = detail.
 * With no texture (null) the pool draws a procedural char instead (03/11 fixes: Kenney's black spiky scorch star read
 * as an ink splat on pale stone; round 3: its soft graded edge then read as a brown-grey dirt smudge): a burn with a
 * crisp irregular edge (a domain-warped blob swelling in lobes, never a star), dense to that edge, a warm brown band
 * of scorched stone streaked out from the blow, a charred ring just inside the edge, a dark soot-umber heart with
 * ember cracks and specks, and a glowing rim at its edge, all cooling with the decal's heat; it erodes from its edge
 * in at the end.
 * View only; no allocation per decal.
 */
import * as THREE from "three";
import type { GroundAftermath } from "./element-kit";

const VERTEX = /* glsl */ `
attribute vec4 iPos;   // x, y, z, size (m)
attribute vec4 iRot;   // rotation (rad), aspect, seed, unused
attribute vec4 iBody;  // rgb (linear), alpha
attribute vec4 iHeat;  // rgb (linear, HDR), level now
attribute vec4 iAge;   // life share, grow-in share, erode-from share, unused
varying vec2 vUv;
varying vec4 vBody;
varying vec4 vHeat;
varying vec4 vAge;
varying float vSeed;
void main() {
  vUv = uv;
  vBody = iBody;
  vHeat = iHeat;
  vAge = iAge;
  vSeed = iRot.z;
  float c = cos(iRot.x);
  float s = sin(iRot.x);
  vec2 q = vec2(position.x * iRot.y, position.y) * iPos.w;
  vec3 w = vec3(iPos.x + q.x * c - q.y * s, iPos.y, iPos.z - (q.x * s + q.y * c));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vBody;
varying vec4 vHeat;
varying vec4 vAge;
varying float vSeed;
float gdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gdNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gdHash(i), gdHash(i + vec2(1.0, 0.0)), u.x), mix(gdHash(i + vec2(0.0, 1.0)), gdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#ifdef PROCEDURAL
/** Voronoi cell walls (F2 − F1) at p: the ember cracks of the char. */
float gdCells(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(gdHash(ip + g), gdHash(ip + g + 17.3));
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}
#endif
void main() {
  float n = gdNoise(vUv * 7.0 + vSeed * 13.7) * 0.65 + gdNoise(vUv * 17.0 - vSeed * 5.3) * 0.35;
#ifdef PROCEDURAL
  // A burn with a crisp, irregular edge (round 3: the soft graded char read as a brown-grey dirt smudge on pale
  // stone): a domain-warped blob whose outline swells in lobes (no rays), d 0 at its heart … 1 at its edge; A = how
  // far inside (it grows in and erodes from its edge), R = its grain.
  vec2 p = vUv * 2.0 - 1.0;
  vec2 warp = vec2(gdNoise(p * 2.2 + vSeed * 3.1), gdNoise(p * 2.2 - vSeed * 1.7 + 4.0)) - 0.5;
  vec2 pw = p + warp * 0.42;
  float rr = length(pw);
  vec2 dirc = pw / max(rr, 1e-4);
  float lobes = gdNoise(dirc * 2.3 + vSeed * 7.0) * 0.7 + gdNoise(dirc * 6.0 - vSeed * 2.0) * 0.3;
  float d = rr / (0.56 + 0.32 * lobes) + (n - 0.5) * 0.07;
  vec4 t = vec4(gdNoise(p * 11.0 + vSeed * 9.1), 0.0, 0.0, clamp(1.0 - d, 0.0, 1.0));
#else
  vec4 t = texture2D(map, vUv);
#endif
  float heart = 1.0 - min(1.0, length(vUv - 0.5) * 2.0);
  // The order it appears and goes in: dense and central first, broken by noise.
  float field = t.a * 0.78 + heart * 0.14 + (t.r - 0.5) * 0.1 + (n - 0.5) * 0.18;
  float k = vAge.x;
  float grow = vAge.y > 0.0 ? smoothstep(0.0, vAge.y, k) : 1.0;
  float erode = smoothstep(vAge.z, 1.0, k);
  float thr = max(0.06 + (1.0 - grow) * 0.9, mix(0.06, 1.12, erode));
#ifdef PROCEDURAL
  // Readable burnt stone: a crisp irregular edge, dense to it (a thin see-through rim read as a smudge), a warm brown
  // band of scorched stone streaked out from the blow, a charred ring just inside the edge, a dark soot-umber heart.
  float keep = smoothstep(thr, thr + 0.06, field);
  float cover = 1.0 - smoothstep(0.95, 1.0, d);
  float a = keep * cover * vBody.a * mix(0.78, 1.0, smoothstep(0.0, 0.45, t.a));
  if (a < 0.002) discard;
  // Scorched brown, dark enough to darken dark stone a little too (a lighter brown read as a puddle there).
  vec3 brown = vBody.rgb * 2.6;
  vec3 dark = vBody.rgb * 0.75;
  float streak = gdNoise(dirc * 11.0 + rr * 0.9 + vSeed);
  vec3 body = mix(brown * mix(0.6, 1.3, streak), dark, smoothstep(0.18, 0.62, t.a));
  float charRing = smoothstep(0.76, 0.86, d) * (1.0 - smoothstep(0.88, 0.97, d));
  body = mix(body, dark * 1.4, charRing * 0.65) * mix(0.85, 1.12, t.r);
  // Ember cracks in the heart and a glowing rim at the char's edge, cooling with vHeat.a (gold while hot, then
  // orange, then gone; never a dark red glow).
  // The cracks: warped cell walls, thin, broken into separate runs by noise, only in the heart.
  vec2 cp = p * 3.4 + warp * 1.2 + vSeed * 5.0;
  float walls = 1.0 - smoothstep(0.0, 0.022 + 0.02 * n, gdCells(cp));
  float runs = smoothstep(0.48, 0.62, gdNoise(p * 3.0 - vSeed * 2.3));
  float cracks = walls * runs * smoothstep(0.5, 0.85, t.a);
  float rim = (1.0 - smoothstep(0.0, 0.1, field - thr)) * smoothstep(0.1, 0.3, t.a);
  float specks = smoothstep(0.84, 0.95, gdNoise(p * 26.0 + vSeed * 3.7)) * smoothstep(0.55, 0.95, t.a);
  float h = vHeat.a;
  vec3 hot = vHeat.rgb * mix(vec3(1.0, 0.8, 0.6), vec3(1.0, 1.25, 1.6), smoothstep(0.55, 1.0, h));
  // Cooled embers go out (no dim lines left as a net on the char).
  vec3 glow = hot * h * smoothstep(0.04, 0.25, h) * clamp(cracks * 0.9 + rim * 0.5 + specks * 0.7, 0.0, 1.0);
  gl_FragColor = vec4(body * a + glow * keep, a);
#else
  float a = smoothstep(thr, thr + 0.05, field) * smoothstep(0.02, 0.12, t.a) * vBody.a;
  if (a < 0.002) discard;
  vec3 body = vBody.rgb * mix(0.72, 1.12, t.r);
  // The glowing edge: its moving front and its thin parts, cooling with vHeat.a.
  float front = 1.0 - smoothstep(0.0, 0.16, field - thr);
  float specks = smoothstep(0.62, 0.86, t.r) * smoothstep(0.4, 0.9, n);
  vec3 glow = vHeat.rgb * vHeat.a * clamp(front * 0.85 + specks * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(body * a + glow * a, a);
#endif
}`;

const F = 19; // floats per decal state: x y z size, rot aspect seed, age life growIn erodeFrom cool, body rgb alpha, heat rgb

/** One texture's decals: spawn them anywhere on the ground; each lives `life` s. */
export class GroundDecalPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly state: Float32Array;
  private readonly pos: Float32Array;
  private readonly rot: Float32Array;
  private readonly body: Float32Array;
  private readonly heat: Float32Array;
  private readonly age: Float32Array;
  private cursor = 0;
  live = 0;

  /** `texture` null: the procedural char (no atlas). */
  constructor(
    readonly capacity: number,
    texture: THREE.Texture | null,
    renderOrder = 4,
  ) {
    this.state = new Float32Array(capacity * F);
    this.pos = new Float32Array(capacity * 4);
    this.rot = new Float32Array(capacity * 4);
    this.body = new Float32Array(capacity * 4);
    this.heat = new Float32Array(capacity * 4);
    this.age = new Float32Array(capacity * 4);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iRot", new THREE.InstancedBufferAttribute(this.rot, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iBody", new THREE.InstancedBufferAttribute(this.body, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iHeat", new THREE.InstancedBufferAttribute(this.heat, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iAge", new THREE.InstancedBufferAttribute(this.age, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { map: { value: texture } },
      defines: texture === null ? { PROCEDURAL: "" } : {},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      // A few cm over the paving: kept off its depth.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "ground-decals";
  }

  /**
   * A decal at (x, z), `size` m across (× `aspect` along its x), turned by `rot` (rad), as `look` says (its life,
   * grow-in, erosion, body and cooling edge). The oldest is reused when the pool is full.
   */
  spawn(x: number, z: number, size: number, look: GroundAftermath, rot = 0, aspect = 1, seed = 0): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const s = this.state;
    const o = i * F;
    s[o] = x;
    s[o + 1] = 0.02 + 0.0005 * (i % 16);
    s[o + 2] = z;
    s[o + 3] = size;
    s[o + 4] = rot;
    s[o + 5] = aspect;
    s[o + 6] = seed !== 0 ? seed : ((i * 0.618034) % 1) * 10;
    s[o + 7] = 0; // age
    s[o + 8] = Math.max(1e-3, look.life);
    s[o + 9] = look.growIn;
    s[o + 10] = look.erodeFrom;
    s[o + 11] = look.cool;
    s[o + 12] = look.body[0];
    s[o + 13] = look.body[1];
    s[o + 14] = look.body[2];
    s[o + 15] = look.alpha;
    s[o + 16] = look.heat[0];
    s[o + 17] = look.heat[1];
    s[o + 18] = look.heat[2];
  }

  update(dt: number): void {
    const s = this.state;
    let n = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      const o = i * F;
      const life = s[o + 8]!;
      if (life <= 0) continue;
      const age = s[o + 7]! + dt;
      if (age >= life) {
        s[o + 8] = 0;
        continue;
      }
      s[o + 7] = age;
      const p = n * 4;
      this.pos[p] = s[o]!;
      this.pos[p + 1] = s[o + 1]!;
      this.pos[p + 2] = s[o + 2]!;
      this.pos[p + 3] = s[o + 3]!;
      this.rot[p] = s[o + 4]!;
      this.rot[p + 1] = s[o + 5]!;
      this.rot[p + 2] = s[o + 6]!;
      this.body[p] = s[o + 12]!;
      this.body[p + 1] = s[o + 13]!;
      this.body[p + 2] = s[o + 14]!;
      this.body[p + 3] = s[o + 15]!;
      this.heat[p] = s[o + 16]!;
      this.heat[p + 1] = s[o + 17]!;
      this.heat[p + 2] = s[o + 18]!;
      this.heat[p + 3] = Math.exp(-age * s[o + 11]!);
      this.age[p] = age / life;
      this.age[p + 1] = s[o + 9]!;
      this.age[p + 2] = s[o + 10]!;
      n += 1;
    }
    this.live = n;
    const g = this.mesh.geometry;
    g.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const name of ["iPos", "iRot", "iBody", "iHeat", "iAge"]) g.getAttribute(name).needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i += 1) this.state[i * F + 8] = 0;
    this.live = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
