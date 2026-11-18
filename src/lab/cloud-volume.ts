/** Ticket 438, redone 17/11 by Claude: a storm deck of CC0 puffs placed in world space, one sorted instanced draw. */
import * as THREE from "three";

export interface CloudVolumeOptions {
  /** Horizontal world-space centre; baseHeight is the absolute bottom in metres. */
  centre: { x: number; z: number };
  radius: number;
  baseHeight: number;
  thickness: number;
  bottomColor: THREE.ColorRepresentation;
  topColor: THREE.ColorRepresentation;
  glowColor: THREE.ColorRepresentation;
  glowIntensity: number;
  lightningIntensity: number;
  /** Drift in metres/second; negative values reverse the flow. */
  scrollSpeed: number;
  coverage: number;
  appearSeconds: number;
  dissolveSeconds: number;
  seed: number;
  /** Depth radius over width radius. */
  aspect: number;
  /** Thick, layered thunder banks; other element presets keep their own silhouette. */
  storm: boolean;
}

export const CLOUD_VOLUME_DEFAULTS: Readonly<CloudVolumeOptions> = {
  centre: { x: 0, z: 0 }, radius: 12, baseHeight: 9.5, thickness: 4.5,
  bottomColor: 0x171022, topColor: 0x777083, glowColor: 0xcabaff,
  glowIntensity: 0.025, lightningIntensity: 0.85, scrollSpeed: 0.38, coverage: 0.86,
  appearSeconds: 0.7, dissolveSeconds: 1.4, seed: 438, aspect: 1, storm: false,
};

const VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aPuff; // size, angle, frame offset, coverage key
attribute float aBorn;
uniform vec3 uCentre, uExtent;
uniform float uTime, uOpacity, uCoverage;
varying vec2 vUv;
varying vec3 vWorld;
varying float vHeight, vFade, vEdge, vFrame, vTone;
void main() {
  // Gathering: each puff arrives on its own beat and drifts in from the rim.
  float fade = smoothstep(aBorn * 0.55, aBorn * 0.55 + 0.45, uOpacity);
  fade *= smoothstep(aPuff.w - 0.06, aPuff.w, uCoverage);
  vec3 off = aOffset;
  off.xz *= 1.0 + (1.0 - fade) * 0.28;
  float drift = uTime * 0.035 * (aPuff.z / 64.0 - 0.5);
  off.xz += vec2(sin(uTime * 0.21 + aPuff.z), cos(uTime * 0.17 + aPuff.z * 1.3)) * 0.012;
  vec3 centre = uCentre + vec3(off.x * uExtent.x, off.y * uExtent.y, off.z * uExtent.z);
  float size = aPuff.x * uExtent.x * mix(0.62, 1.0, fade);
  float a = aPuff.y + drift;
  vec2 c = position.xy;
  c = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = centre + (right * c.x + up * c.y) * size;
  vWorld = world; vUv = uv; vTone = 0.82 + 0.36 * fract(aPuff.z * 0.618); vHeight = off.y; vFade = fade; vEdge = length(aOffset.xz);
  float f = mod(uTime * 9.0 + aPuff.z, 126.0);
  vFrame = floor(63.0 - abs(f - 63.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uBottom, uTop, uGlow, uExtent;
uniform vec4 uFlash, uFlash2;
uniform float uOpacity, uGlowGain, uProbe, uHasMap, uFlashRadius;
varying vec2 vUv;
varying vec3 vWorld;
varying float vHeight, vFade, vEdge, vFrame, vTone;
void main() {
  if (uOpacity <= 0.0001 || vFade <= 0.002) discard;
  vec2 cell = vec2(mod(vFrame, 8.0), 7.0 - floor(vFrame / 8.0));
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, (cell + vUv) / 8.0)
    : vec4(0.0); // 434k: no procedural blob; the deck stays invisible until its puff art loads.
  float density = tex.a;
  if (density < 0.01) discard;
  // Lit from above: lower banks and puff undersides stay dark, crowns catch the sky.
  float h = clamp(vHeight * 0.75 + (vUv.y - 0.5) * 0.35 + 0.1, 0.0, 1.0);
  vec3 body = mix(uBottom, uTop, smoothstep(0.05, 0.95, h)) * (0.3 + 0.95 * tex.r * tex.r) * vTone;
  // Silver lining: thin rims of the upper banks catch more light than the dense cores.
  body += uTop * 0.35 * (1.0 - density) * smoothstep(0.3, 0.9, h);
  vec3 d1 = vWorld - uFlash.xyz, d2 = vWorld - uFlash2.xyz;
  float f1 = 1.0 - smoothstep(0.0, uFlashRadius, length(d1));
  float f2 = 1.0 - smoothstep(0.0, uFlashRadius, length(d2));
  float flash = max(uFlash.w * f1 * f1, uFlash2.w * f2 * f2);
  // Light from inside: the dense core glows, the thin rims only rim-light.
  float inner = flash * (0.35 + 0.65 * density);
  vec3 colour = min(vec3(0.9), body + uGlow * (uGlowGain + inner * 0.75));
  float rim = 1.0 - smoothstep(0.78, 1.02, vEdge) * 0.55;
  float alpha = clamp(density * 0.62 * vFade * uOpacity * rim, 0.0, 0.92);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uProbe > 0.5 ? vec3(1.0) : colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PUFFS = 170;
/** One reusable CC0 puff atlas (Unity Labs Cloud01, 8x8), tinted per preset. */
export const CLOUD_PUFF_ATLAS = "/art-src/lab/vfx/cloud-puffs/cloud01.png";
let sharedMap: THREE.Texture | null = null;
let sharedUsers = 0;
function puffMap(): THREE.Texture | null {
  if (sharedMap === null && typeof document !== "undefined") {
    sharedMap = new THREE.TextureLoader().load(CLOUD_PUFF_ATLAS);
    sharedMap.colorSpace = THREE.NoColorSpace; sharedMap.generateMipmaps = true;
    sharedMap.minFilter = THREE.LinearMipmapLinearFilter;
  }
  if (sharedMap !== null) sharedUsers++;
  return sharedMap;
}

const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
const unit = (value: number, fallback: number): number => THREE.MathUtils.clamp(finite(value, fallback), 0, 1);
const ease = (value: number): number => { const x = THREE.MathUtils.clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const random = (n: number): number => { const f = Math.sin(n * 127.1 + 311.7) * 43758.5453; return f - Math.floor(f); };

export class CloudVolume {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private options: CloudVolumeOptions;
  private time = 0;
  private opacity = 0;
  private target = 0;
  private from = 0;
  private transition = 0;
  private disposed = false;
  private readonly map: THREE.Texture | null;
  private readonly base = { offset: new Float32Array(PUFFS * 3), puff: new Float32Array(PUFFS * 4), born: new Float32Array(PUFFS) };
  private readonly order = Array.from({ length: PUFFS }, (_, i) => i);
  private readonly depth = new Float32Array(PUFFS);
  private readonly extra = new THREE.Vector4();

  constructor(parent: THREE.Object3D, options: Partial<CloudVolumeOptions> = {}) {
    this.options = { ...CLOUD_VOLUME_DEFAULTS, ...options, centre: { ...(options.centre ?? CLOUD_VOLUME_DEFAULTS.centre) } };
    this.map = puffMap();
    const material = new THREE.ShaderMaterial({
      name: "cloud-volume-puffs", vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: {
        uCentre: { value: new THREE.Vector3() }, uExtent: { value: new THREE.Vector3() },
        uBottom: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
        uFlash: { value: new THREE.Vector4() }, uFlash2: { value: new THREE.Vector4() }, uTime: { value: 0 }, uCoverage: { value: 0 },
        uOpacity: { value: 0 }, uScroll: { value: 0 }, uSeed: { value: 0 }, uGlowGain: { value: 0 }, uProbe: { value: 0 },
        uFlashRadius: { value: 4 },
        uMap: { value: this.map }, uHasMap: { value: this.map === null ? 0 : 1 },
      },
      side: THREE.DoubleSide, transparent: true, depthTest: true, depthWrite: false,
      blending: THREE.NormalBlending, forceSinglePass: true,
    });
    const plane = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = plane.index; geometry.setAttribute("position", plane.getAttribute("position")); geometry.setAttribute("uv", plane.getAttribute("uv"));
    geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 3), 3));
    geometry.setAttribute("aPuff", new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 4), 4));
    geometry.setAttribute("aBorn", new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1));
    geometry.instanceCount = PUFFS;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "fx-cloud-volume";
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    // Back-to-front per camera, so dark undersides never paint over nearer crowns.
    this.mesh.onBeforeRender = (_r, _s, camera) => this.sort(camera);
    parent.add(this.mesh);
    this.configure(options);
  }

  /** Capture-only snapshot; does not allocate in the render loop. */
  probeState() { return { parameters: this.parameters, time: this.time, opacity: this.opacity }; }

  get active(): boolean { return !this.disposed && (this.opacity > 0 || this.target > 0); }
  get shown(): boolean { return this.target > 0; }
  get parameters(): CloudVolumeOptions { return { ...this.options, centre: { ...this.options.centre } }; }

  /** World-space puffs. Parent with an untransformed scene FX group. */
  configure(options: Partial<CloudVolumeOptions>): void {
    if (this.disposed) return;
    const reseed = (options.seed !== undefined && options.seed !== this.options.seed)
      || (options.storm !== undefined && options.storm !== this.options.storm);
    const o = this.options = { ...this.options, ...options, centre: { ...(options.centre ?? this.options.centre) } };
    o.centre.x = finite(o.centre.x, 0); o.centre.z = finite(o.centre.z, 0);
    o.radius = Math.max(0.1, finite(o.radius, 12)); o.baseHeight = finite(o.baseHeight, 6.5);
    o.thickness = Math.max(0.1, finite(o.thickness, 6.5)); o.aspect = THREE.MathUtils.clamp(finite(o.aspect, 1), 0.2, 2);
    o.coverage = unit(o.coverage, 0.86); o.glowIntensity = unit(o.glowIntensity, 0);
    o.lightningIntensity = unit(o.lightningIntensity, 0); o.scrollSpeed = finite(o.scrollSpeed, 0.38);
    o.appearSeconds = Math.max(0, finite(o.appearSeconds, 0.7)); o.dissolveSeconds = Math.max(0, finite(o.dissolveSeconds, 1.4));
    o.seed = finite(o.seed, 438);
    if (reseed || this.base.born[0] === 0) this.layout();
    const u = this.mesh.material.uniforms;
    (u.uCentre!.value as THREE.Vector3).set(o.centre.x, o.baseHeight, o.centre.z);
    (u.uExtent!.value as THREE.Vector3).set(o.radius, o.thickness, o.radius * o.aspect);
    for (const [key, value] of [["uBottom", o.bottomColor], ["uTop", o.topColor], ["uGlow", o.glowColor]] as const) {
      const c = u[key]!.value as THREE.Color; c.set(value);
      c.setRGB(THREE.MathUtils.clamp(c.r, 0, 0.9), THREE.MathUtils.clamp(c.g, 0, 0.9), THREE.MathUtils.clamp(c.b, 0, 0.9));
    }
    u.uCoverage!.value = o.coverage; u.uScroll!.value = o.scrollSpeed;
    u.uSeed!.value = o.seed; u.uGlowGain!.value = o.glowIntensity;
    this.sync();
  }

  /** A broken storm deck: lumpy banks with gaps, a domed core and a flat dark underside. */
  private layout(): void {
    const s = this.options.seed, { offset, puff, born } = this.base;
    let n = 0;
    for (let tries = 0; n < PUFFS && tries < PUFFS * 30; tries++) {
      const r = Math.sqrt(random(s + tries * 3.1)), a = random(s + tries * 5.7) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const bank = 0.5 + 0.28 * Math.sin(x * 4.1 + s) * Math.cos(z * 3.3 - s * 0.7) + 0.22 * Math.sin((x + z) * 7.3 + s * 1.9);
      if (!this.options.storm && bank < 0.34 + r * 0.32) continue;
      const under = n < PUFFS * 0.4;
      const dome = 1 - r * r * 0.75;
      const y = this.options.storm
        ? (under ? 0.06 + random(s + tries * 2.3) * 0.15
          : 0.22 + random(s + tries * 2.3) * 0.78 * dome)
        : under ? random(s + tries * 2.3) * 0.18 : 0.15 + random(s + tries * 2.3) * 0.75 * dome;
      offset.set([x, y, z], n * 3);
      const size = this.options.storm ? (under ? 0.23 : 0.19) + random(s + tries * 9.1) * 0.12
        : (under ? 0.2 : 0.15) + random(s + tries * 9.1) * 0.11;
      puff.set([size * (1 - 0.32 * r), random(s + tries * 4.4) * 6.283, Math.floor(random(s + tries * 6.6) * 64),
        0.02 + random(s + tries * 8.8) * 0.97], n * 4);
      born[n] = Math.min(1, 0.05 + r * 0.7 + random(s + tries * 1.7) * 0.25);
      n++;
    }
    for (; n < PUFFS; n++) { offset.set([0, 0.3, 0], n * 3); puff.set([0.15, 0, 0, 0.5], n * 4); born[n] = 0.5; }
    this.write();
  }
  private sort(camera: THREE.Camera): void {
    const c = this.mesh.material.uniforms.uCentre!.value as THREE.Vector3, e = this.mesh.material.uniforms.uExtent!.value as THREE.Vector3;
    const p = camera.position, off = this.base.offset;
    for (let i = 0; i < PUFFS; i++) {
      const dx = c.x + off[i * 3]! * e.x - p.x, dy = c.y + off[i * 3 + 1]! * e.y - p.y, dz = c.z + off[i * 3 + 2]! * e.z - p.z;
      this.depth[i] = dx * dx + dy * dy + dz * dz;
    }
    this.order.sort((a, b) => this.depth[b]! - this.depth[a]!);
    this.write();
  }
  private write(): void {
    const g = this.mesh.geometry, { offset, puff, born } = this.base;
    const ao = g.getAttribute("aOffset") as THREE.InstancedBufferAttribute, ap = g.getAttribute("aPuff") as THREE.InstancedBufferAttribute;
    const ab = g.getAttribute("aBorn") as THREE.InstancedBufferAttribute;
    const o = ao.array as Float32Array, p = ap.array as Float32Array, b = ab.array as Float32Array;
    for (let k = 0; k < PUFFS; k++) {
      const i = this.order[k]!;
      o[k * 3] = offset[i * 3]!; o[k * 3 + 1] = offset[i * 3 + 1]!; o[k * 3 + 2] = offset[i * 3 + 2]!;
      for (let j = 0; j < 4; j++) p[k * 4 + j] = puff[i * 4 + j]!;
      b[k] = born[i]!;
    }
    ao.needsUpdate = ap.needsUpdate = ab.needsUpdate = true;
  }

  show(): void { this.fadeTo(1); }
  hide(): void { this.fadeTo(0); }
  /** An outside strike lights the cloud from inside at a world point. */
  flash(x: number, y: number, z: number, strength: number): void { this.extra.set(x, y, z, unit(strength, 0)); this.sync(); }
  private fadeTo(target: number): void {
    if (this.disposed || this.target === target) return;
    this.from = this.opacity; this.target = target; this.transition = 0;
    if ((target > 0 ? this.options.appearSeconds : this.options.dissolveSeconds) === 0) this.opacity = target;
    this.sync();
  }

  update(dt: number): void {
    if (this.disposed) return;
    dt = Math.max(0, finite(dt, 0)); this.time += dt; this.transition += dt;
    const duration = this.target > 0 ? this.options.appearSeconds : this.options.dissolveSeconds;
    this.opacity = this.from + (this.target - this.from) * (duration === 0 ? 1 : ease(this.transition / duration));
    this.sync();
  }

  private sync(): void {
    const o = this.options, u = this.mesh.material.uniforms;
    u.uTime!.value = this.time; u.uOpacity!.value = this.opacity;
    const cycle = Math.floor(this.time / 0.85), phase = this.time - cycle * 0.85;
    const seed = o.seed + cycle * 17;
    const pulse = Math.exp(-(((phase - 0.12) / 0.03) ** 2)) + 0.6 * Math.exp(-(((phase - 0.24) / 0.05) ** 2));
    (u.uFlash!.value as THREE.Vector4).set(
      o.centre.x + (random(seed) - 0.5) * o.radius * 1.3,
      o.baseHeight + o.thickness * (0.2 + random(seed + 1) * 0.4),
      o.centre.z + (random(seed + 2) - 0.5) * o.radius * o.aspect * 1.3,
      Math.min(1, pulse) * o.lightningIntensity,
    );
    (u.uFlash2!.value as THREE.Vector4).copy(this.extra);
    this.mesh.visible = this.active && o.coverage > 0;
  }

  clear(resetClock = false): void { if (resetClock) this.time = 0; this.opacity = this.target = this.from = this.transition = 0; this.extra.set(0, 0, 0, 0); this.sync(); }
  dispose(): void {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    if (this.map !== null && --sharedUsers === 0) { this.map.dispose(); sharedMap = null; }
  }
}
