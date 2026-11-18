/** Ticket 402: VFX_STANDARD ultimate, painted components from 396; code only places and animates them. */
import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import { MetalBindTint } from "./metal-ult-tint";
import { MetalUlt3D } from "./metal-ult-3d";

export const METAL_TIMING = { charge: 0.6, speed: 26, reach: 30, hold: 3, fade: 2.5 } as const;
export const METAL_CLUSTERS = 204, METAL_CAPACITY = 128, METAL_PERIMETER = 144;
const MARKS = 64, BLADES = 4, FRAGMENTS = 6, SPARKS = 8;
const hash = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export interface MetalFoe { i: number; bindAt: number }
export interface MetalCluster { x: number; z: number; at: number; height: number; width: number }

const VERTEX = /* glsl */ `
attribute vec3 iAnchor;
attribute vec2 iSize;
attribute vec4 iClock;
attribute vec4 iStyle;
attribute vec3 iMove;
uniform float uTime;
varying vec2 vUv;
varying vec2 vLocal;
varying float vAge;
varying float vFade;
varying float vMode;
varying vec4 vScreen;
vec2 cardLocal(vec2 p, float mode, float age) {
  float growth = smoothstep(0.0, 0.2, age);
  vec2 local = p * iSize;
  if (mode == 0.0) { local.y = (p.y + 0.5) * iSize.y * growth; local.x *= 0.65 + 0.35 * growth; }
  if (mode == 1.0) local *= 0.7 + 0.3 * growth;
  if (mode == 2.0) local *= 1.0 + max(0.0, age - 3.0) * 0.5;
  if (mode == 3.0) local *= 1.0 - 0.7 * smoothstep(3.0, 3.65, age);
  float turn = iStyle.z;
  if (mode == 2.0 || mode == 10.0) turn += age * 0.3;
  if (mode == 5.0 || mode == 6.0) turn += age * (1.5 + iClock.w * 2.0);
  return mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * local;
}
void main() {
  float age = uTime - iClock.x, liveAge = max(0.0, age), mode = iClock.z;
  float broken = max(0.0, age - 3.0);
  vAge = liveAge; vMode = mode; vLocal = uv;
  float tail = mode == 0.0 || mode == 1.0 || mode == 9.0 ? 2.5 : 0.55;
  vFade = smoothstep(0.0, 0.12, liveAge) * (1.0 - smoothstep(max(0.13, iClock.y - tail), iClock.y, liveAge)) * iStyle.w * step(0.0, age);
  if (mode == 4.0) vFade *= smoothstep(2.98, 3.12, liveAge);
  if (mode == 6.0) vFade *= 0.3 + 0.7 * pow(0.5 + 0.5 * sin(age * 5.0 + iClock.w * 40.0), 3.0);
  vec2 local = cardLocal(position.xy, mode, liveAge);
  vec3 anchor = (modelMatrix * vec4(iAnchor, 1.0)).xyz;
  if (mode == 3.0 || mode == 4.0) {
    float a = iMove.y + min(liveAge, 3.0) * iMove.z;
    anchor.xz += vec2(cos(a), sin(a)) * (iMove.x + broken * 2.4);
    anchor.y += 0.06 * sin(liveAge * 1.3 + iMove.y) + broken * 0.35;
  }
  if (mode == 5.0 || mode == 6.0 || mode == 7.0 || mode == 8.0) anchor += iMove * liveAge;
  if (mode == 5.0) anchor.y -= 2.5 * liveAge * liveAge;
  vec3 toEye = cameraPosition - anchor;
  vec3 right = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(0.00001, 0.0, 0.0));
  vec3 up = vec3(0.0, 1.0, 0.0);
  if (mode != 0.0) { right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
  if (mode == 2.0 || mode == 9.0 || mode == 10.0) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0); }
  vec2 texUv = uv;
  if (iStyle.y < 0.0) texUv.x = 1.0 - texUv.x;
  vUv = (vec2(mod(iStyle.x, 4.0), 3.0 - floor(iStyle.x / 4.0)) + mix(vec2(0.004), vec2(0.996), texUv)) / 4.0;
  vec4 base = projectionMatrix * viewMatrix * vec4(anchor, 1.0);
  vec4 rx = projectionMatrix * viewMatrix * vec4(right, 0.0), ry = projectionMatrix * viewMatrix * vec4(up, 0.0);
  vec2 p0 = cardLocal(vec2(-0.5, -0.5), mode, liveAge), p1 = cardLocal(vec2(0.5, -0.5), mode, liveAge);
  vec2 p2 = cardLocal(vec2(-0.5, 0.5), mode, liveAge), p3 = cardLocal(vec2(0.5, 0.5), mode, liveAge);
  vec4 d0 = rx * p0.x + ry * p0.y, d1 = rx * p1.x + ry * p1.y;
  vec4 d2 = rx * p2.x + ry * p2.y, d3 = rx * p3.x + ry * p3.y;
  float nearW = base.w + min(0.0, min(min(d0.w, d1.w), min(d2.w, d3.w)));
  vec2 centre = base.xy / max(0.001, base.w);
  vec2 bound = max(max(abs(d0.xy - centre * d0.w), abs(d1.xy - centre * d1.w)), max(abs(d2.xy - centre * d2.w), abs(d3.xy - centre * d3.w))) / max(0.001, nearW);
  // Conservative projected rectangle: each card is below 14% of the frame, including tilted corners.
  float scale = min(1.0, min(0.48 / max(0.0001, max(bound.x, bound.y)), sqrt(0.14 / max(0.0001, bound.x * bound.y))));
  vFade *= smoothstep(0.1, 0.65, base.w);
  gl_Position = base + (rx * local.x + ry * local.y) * scale;
  vScreen = gl_Position;
  if (vFade < 0.002 || age > iClock.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uFlash;
uniform vec4 uCasterBox;
varying vec2 vUv;
varying vec2 vLocal;
varying float vAge;
varying float vFade;
varying float vMode;
varying vec4 vScreen;
void main() {
  vec4 art = texture2D(uAtlas, vUv);
  float alpha = art.a * vFade;
  if (vMode == 9.0 || vMode == 2.0) {
    // Erode the painted strokes; this mask supplies no new artwork.
    float cut = fract(sin(dot(floor(vLocal * 90.0), vec2(12.9898, 78.233))) * 43758.5453);
    float decay = vMode == 9.0 ? smoothstep(3.0, 5.5, vAge) : smoothstep(3.0, 3.7, vAge);
    alpha *= 1.0 - smoothstep(cut * 0.8, cut * 0.8 + 0.2, decay);
  }
  if (vMode != 2.0 && vMode != 9.0 && vMode != 10.0) {
    vec2 screen = vScreen.xy / vScreen.w * 0.5 + 0.5;
    vec2 inside = smoothstep(uCasterBox.xy - 0.004, uCasterBox.xy, screen) * (1.0 - smoothstep(uCasterBox.zw, uCasterBox.zw + 0.004, screen));
    alpha *= 1.0 - inside.x * inside.y;
  }
  if (alpha < 0.007) discard;
  vec3 color = min(mix(art.rgb, vec3(dot(art.rgb, vec3(0.3, 0.55, 0.15))), 0.15) * vec3(1.16, 1.06, 0.88), vec3(0.9));
  // Only this one central sword carries HDR, on its narrow painted highlight.
  if (vMode == 1.0) color += vec3(1.0, 0.86, 0.56) * (2.4 + uFlash * 1.6) * smoothstep(0.84, 1.0, min(art.r, min(art.g, art.b)));
  gl_FragColor = vec4(color, alpha);
}`;

class Cards {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly anchor: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly clock: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly move: THREE.InstancedBufferAttribute;
  constructor(parent: THREE.Object3D, capacity: number, name: string, uniforms: Record<string, THREE.IUniform>, order: number) {
    const plane = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = plane.index; geometry.setAttribute("position", plane.getAttribute("position")); geometry.setAttribute("uv", plane.getAttribute("uv"));
    const attr = (key: string, n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(key, a); return a;
    };
    this.anchor = attr("iAnchor", 3); this.size = attr("iSize", 2); this.clock = attr("iClock", 4);
    this.style = attr("iStyle", 4); this.move = attr("iMove", 3);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: withTagMask(FRAGMENT), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = "fx-metal-ult-" + name;
    this.mesh.renderOrder = order; this.mesh.frustumCulled = false; parent.add(this.mesh); this.clear();
  }
  put(slot: number, x: number, y: number, z: number, w: number, h: number, birth: number, life: number, mode: number, tile: number, seed: number, alpha = 1, roll = 0, mx = 0, my = 0, mz = 0): void {
    if (slot >= this.clock.count) return;
    this.anchor.setXYZ(slot, x, y, z); this.size.setXY(slot, w, h); this.clock.setXYZW(slot, birth, life, mode, hash(seed));
    this.style.setXYZW(slot, tile, seed % 2 === 0 ? 1 : -1, roll, alpha); this.move.setXYZ(slot, mx, my, mz);
    for (const a of [this.anchor, this.size, this.clock, this.style, this.move]) a.needsUpdate = true;
    this.mesh.geometry.instanceCount = Math.max(this.mesh.geometry.instanceCount, slot + 1);
  }
  hide(slot: number): void { this.clock.setX(slot, 1e6); this.clock.needsUpdate = true; }
  clear(): void {
    this.mesh.geometry.instanceCount = 0;
    for (let i = 0; i < this.clock.count; i++) this.clock.setX(i, 1e6);
    this.clock.needsUpdate = true;
  }
}

export class MetalSpriteField {
  readonly clusters: MetalCluster[] = [];
  readonly drawCount = 5;
  readonly swords3d: MetalUlt3D;
  readonly bindDrawCount = 3;
  readonly bindCapacity = METAL_CAPACITY;
  readonly bindInstancesPerFoe = { ring: 1, blades: BLADES, fragments: FRAGMENTS, sparks: SPARKS };
  readonly focus = new THREE.Vector3();
  private readonly tint = new MetalBindTint();
  get tintedFoes(): number { return this.tint.matched; }
  get activeTints(): number { return this.tint.active; }
  ready = false;
  heightRange: readonly [number, number] = [0, 0];
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private readonly flashK = { value: 0 };
  private readonly atlas = { value: new THREE.Texture() };
  private readonly casterBox = { value: new THREE.Vector4(2, 2, 2, 2) };
  private readonly caster = new THREE.Vector3();
  private readonly corner = new THREE.Vector3();
  private readonly forest: Cards;
  private readonly ground: Cards;
  private readonly debris: Cards;
  private readonly radiance: Cards;
  private loading: Promise<void> | null = null;
  private flashAt = -100;
  constructor(parent: THREE.Object3D) {
    this.group.name = "fx-metal-ult"; parent.add(this.group);
    const uniforms = { ...TAG_UNIFORMS, uTime: this.time, uAtlas: this.atlas, uFlash: this.flashK, uCasterBox: this.casterBox };
    this.forest = new Cards(this.group, METAL_CLUSTERS - METAL_PERIMETER + 1, "swords-and-core", uniforms, 10);
    this.ground = new Cards(this.group, MARKS + METAL_CAPACITY + 2, "ground-and-foot-rings", uniforms, 8);
    this.debris = new Cards(this.group, METAL_CLUSTERS * 2 + METAL_CAPACITY * (BLADES + FRAGMENTS), "blades-and-fragments", uniforms, 13);
    this.radiance = new Cards(this.group, METAL_CLUSTERS * 3 + 32 + METAL_CAPACITY * SPARKS, "rays-and-gold-dust", uniforms, 14);
    for (const c of [this.forest, this.ground, this.debris, this.radiance]) c.mesh.onBeforeRender = (_r, _s, camera) => this.protect(camera);
    this.swords3d = new MetalUlt3D(this.group, this.casterBox, camera => this.protect(camera), this.caster);
    this.clear();
  }
  prepare(base: string, upload?: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    this.loading = Promise.all([this.swords3d.prepare(base, upload), new THREE.TextureLoader().loadAsync(base.replace(/\/?$/, "/") + "metal-ult/metal-ult.atlas.png")]).then(([, atlas]) => {
      atlas.colorSpace = THREE.SRGBColorSpace; atlas.minFilter = THREE.LinearMipmapLinearFilter;
      this.atlas.value.dispose(); this.atlas.value = atlas; upload?.(atlas); this.ready = this.swords3d.ready;
    }).catch((error: unknown) => { console.warn("[metal-ult]", error); }).finally(() => { this.loading = null; });
    return this.loading;
  }
  plan(origin: THREE.Vector3, hand: THREE.Vector3, foes: readonly MetalFoe[], targets: TargetField): void {
    this.clear(); this.tint.prepare(targets); this.group.visible = true; this.caster.copy(origin);
    // Composition from the play camera: the ring hugs the foe mass (7-14 m), not the 30 m reach.
    let cx = 0, cz = 0;
    for (const f of foes) { cx += targets.x(f.i); cz += targets.z(f.i); }
    if (foes.length > 0) { cx /= foes.length; cz /= foes.length; } else { cx = origin.x; cz = origin.z - 9; }
    const spread = foes.map(f => Math.hypot(targets.x(f.i) - cx, targets.z(f.i) - cz)).sort((a, b) => a - b);
    let R = Math.max(7, Math.min(14, (spread[Math.floor((spread.length - 1) * 0.85)] ?? 10) + 1.5));
    {
      // Keep the caster outside the ring: its near rim stays 3 m ahead of the caster.
      const dx = cx - origin.x, dz = cz - origin.z, d = Math.hypot(dx, dz) || 1;
      R = Math.max(7, Math.min(R, d - 3));
      const need = R + 3;
      if (d < need) { cx = origin.x + dx / d * need; cz = origin.z + dz / d * need; }
    }
    this.focus.set(cx, 3.0, cz);
    const add = (x: number, z: number, k: number, edge: boolean): void => {
      const d = Math.hypot(x - origin.x, z - origin.z), birth = 0.6 + d / 26;
      const width = edge ? 2.4 + hash(k + 4) * 1.0 : 0.9 + hash(k + 4) * 1.1;
      const height = edge ? (k < 48 ? 3.6 : 2.6) + hash(k + 5) * 2.2 : 0.7 + hash(k + 5) * 1.3;
      const slot = this.clusters.length;
      this.clusters.push({ x, z, at: birth, width, height });
      if (!edge) this.forest.put(slot - METAL_PERIMETER, x, 0.02, z, width, height, birth, 5.7, 0, slot % 4, k, 0.78);
      for (let j = 0; j < 3; j++) {
        const n = slot * 3 + j, a = hash(n + 61) * Math.PI * 2, s = 0.09 + hash(n + 9) * 0.15;
        this.radiance.put(n, x + Math.cos(a) * width * 0.25, height * (0.2 + hash(n + 12) * 0.6), z,
          s, s, birth + j * 0.08, 5.5, 6, j === 0 ? 10 : 9, n, j === 0 ? 0.16 : 0.42, a, 0.06, 0.06, -0.025);
      }
      for (let j = 0; j < 2; j++) {
        const n = slot * 2 + j, a = hash(n + 71) * Math.PI * 2, s = 0.12 + hash(n + 2) * 0.18;
        this.debris.put(n, x, height * 0.35, z, s, s, birth + 3.2, 0.85, 5, 4, n, 0.5, a, Math.cos(a) * 1.7, 1.8, Math.sin(a) * 1.7);
      }
    };
    // Three overlapping, offset rings; density is planned before secondary detail.
    for (let k = 0; k < METAL_PERIMETER; k++) {
      const band = Math.floor(k / 48), a = k % 48 / 48 * Math.PI * 2 + band * 0.047;
      const r = R + 0.6 - band * 0.75 + (hash(k + 7) - 0.5) * 0.5;
      add(cx + Math.cos(a) * r, cz + Math.sin(a) * r, k, true);
      // Rim facing the caster stays low so the behind view still sees the foes and the centre.
      const c = this.clusters[this.clusters.length - 1]!, ox = origin.x - cx, oz = origin.z - cz, od = Math.hypot(ox, oz) || 1;
      const facing = Math.max(0, (Math.cos(a) * ox + Math.sin(a) * oz) / od), low = 1 - 0.55 * Math.sqrt(facing);
      c.height *= low;
    }
    this.swords3d.plan(this.clusters, origin, this.focus);
    for (let k = 0; k < 36; k++) {
      const a = k * 2.399963, r = 2.5 + Math.sqrt((k + 0.5) / 36) * (R - 4);
      add(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 144 + k, false);
    }
    for (let k = 0; k < 24; k++) {
      const f = foes.length === 0 ? undefined : foes[Math.floor(k * foes.length / 24)];
      const a = k * 2.399963;
      let x = (f === undefined ? origin.x : targets.x(f.i)) + Math.cos(a) * 1.7;
      let z = (f === undefined ? origin.z - 9 : targets.z(f.i)) + Math.sin(a) * 1.7;
      const dx = x - origin.x, dz = z - origin.z, d = Math.hypot(dx, dz);
      const r = Math.max(3, Math.min(29, d)); x = origin.x + dx / (d || 1) * r; z = origin.z + dz / (d || 1) * r;
      add(x, z, 180 + k, false);
    }
    // A camera-facing central sword remains readable from the top view; never a full-frame flare.
    this.forest.put(METAL_CLUSTERS - METAL_PERIMETER, this.focus.x, this.focus.y, this.focus.z, 4.6, 4.6, 0.75, 5.3, 1, 9, 800, 0.95);
    for (let k = 0; k < MARKS; k++) {
      // Painted slash marks: a few radial cracks inside the ring, a painted sword-ring under the rim.
      if (k >= 22) { this.ground.hide(k); continue; }
      const a = k * 2.399963, r = 1.5 + Math.sqrt((k + 0.5) / 22) * (R - 2.5);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, s = 2.6 + hash(k + 81) * 1.6;
      this.ground.put(k, x, 0.055, z, s, s, 0.6 + Math.hypot(x - origin.x, z - origin.z) / 26, 5.5, 9, 6, k, 0.22, a);
    }
    this.ground.put(22, cx, 0.05, cz, R * 2.3, R * 2.3, 0.6 + 4 / 26, 5.5, 9, 7, 903, 0.32);
    this.ground.put(MARKS + METAL_CAPACITY, origin.x, 0.065, origin.z, 3.8, 3.8, 0, 1.25, 10, 7, 901, 0.28);
    this.ground.put(MARKS + METAL_CAPACITY + 1, this.focus.x, 0.06, this.focus.z, 4.2, 4.2, 0.6, 5.5, 9, 6, 902, 0.5);
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, r = 0.6 + hash(k + 40) * 0.8;
      if (k < 16) this.radiance.put(METAL_CLUSTERS * 3 + k, hand.x + Math.cos(a) * r, hand.y, hand.z + Math.sin(a) * r,
        0.12, 0.12, k * 0.016, 0.6, 7, 9, k, 0.5, a, -Math.cos(a) * r / 0.6, 0.12, -Math.sin(a) * r / 0.6);
      else this.radiance.put(METAL_CLUSTERS * 3 + k, origin.x, 0.8, origin.z, 0.65, 0.2, 0.6, 1.2, 8, 5, k, 0.3, a,
        Math.cos(a) * 26, 0, Math.sin(a) * 26);
    }
    this.heightRange = [Math.min(...this.clusters.map(c => c.height)), Math.max(...this.clusters.map(c => c.height))];
  }
  bind(slot: number, foe: MetalFoe, targets: TargetField): void {
    if (slot >= METAL_CAPACITY) return;
    const x = targets.x(foe.i), z = targets.z(foe.i), waist = targets.midY(foe.i), radius = targets.radius(foe.i);
    const size = Math.min(0.3, 0.12 + radius * 0.1), orbit = radius + 0.45 + size;
    this.ground.put(MARKS + slot, x, 0.075, z, (orbit + 0.15) * 2, (orbit + 0.15) * 2, foe.bindAt, 3.7, 2, 7, slot, 0.25);
    this.tint.bind(slot, foe.i, foe.bindAt, targets);
    for (let j = 0; j < BLADES + FRAGMENTS; j++) {
      const n = slot * (BLADES + FRAGMENTS) + j, a = j / BLADES * Math.PI * 2 + hash(slot) * Math.PI * 2;
      const spin = (slot % 2 ? -1 : 1) * 0.75;
      if (j < BLADES) this.debris.put(METAL_CLUSTERS * 2 + n, x, waist, z, size * 2.4, size * 2.4, foe.bindAt, 3.65, 3, 8, n, 0.48, a, orbit, a, spin);
      else {
        const angle = a + 3 * spin;
        this.debris.put(METAL_CLUSTERS * 2 + n, x + Math.cos(angle) * orbit, waist, z + Math.sin(angle) * orbit,
          size * 0.8, size * 0.8, foe.bindAt + 3, 0.85, 5, 4, n, 0.5, angle, Math.cos(angle) * 2.4, 1.6, Math.sin(angle) * 2.4);
      }
    }
    for (let j = 0; j < SPARKS; j++) {
      const n = slot * SPARKS + j, a = j / SPARKS * Math.PI * 2, s = 0.06 + hash(n + 80) * 0.08;
      this.radiance.put(METAL_CLUSTERS * 3 + 32 + n, x, waist, z, s, s, foe.bindAt, 3.9, 4, j % 2 ? 9 : 10,
        n, 0.35, a, orbit, a, (slot % 2 ? -1 : 1) * 0.75);
    }
  }
  unbind(slot: number): void { this.tint.hide(slot); }
  hide(slot: number): void {
    if (slot >= METAL_CAPACITY) return;
    this.ground.hide(MARKS + slot); this.tint.hide(slot);
    for (let j = 0; j < BLADES + FRAGMENTS; j++) this.debris.hide(METAL_CLUSTERS * 2 + slot * (BLADES + FRAGMENTS) + j);
    for (let j = 0; j < SPARKS; j++) this.radiance.hide(METAL_CLUSTERS * 3 + 32 + slot * SPARKS + j);
  }
  protectCaster(at: THREE.Vector3): void { this.caster.copy(at); }
  private protect(camera: THREE.Camera): void {
    const b = this.casterBox.value; b.set(Infinity, Infinity, -Infinity, -Infinity);
    for (let x = -1; x <= 1; x += 2) for (let y = 0; y <= 1; y++) for (let z = -1; z <= 1; z += 2) {
      this.corner.set(this.caster.x + x * 1.15, this.caster.y + y * 2.5, this.caster.z + z * 1.15).project(camera);
      if (this.corner.z < -1 || this.corner.z > 1) { b.set(0, 0, 1, 1); return; }
      const sx = this.corner.x * 0.5 + 0.5, sy = this.corner.y * 0.5 + 0.5;
      b.x = Math.min(b.x, sx); b.y = Math.min(b.y, sy); b.z = Math.max(b.z, sx); b.w = Math.max(b.w, sy);
    }
  }
  flash(time: number): void { this.flashAt = time; }
  update(time: number): void {
    this.time.value = time; this.tint.update(time); this.swords3d.update(time);
    const age = time - this.flashAt; this.flashK.value = age >= 0 && age < 0.09 ? (1 - age / 0.09) ** 2 : 0;
  }
  clear(): void {
    this.group.visible = false; this.clusters.length = 0; this.tint.clear(); this.swords3d.clear();
    this.time.value = -1; this.flashK.value = 0; this.flashAt = -100;
    for (const c of [this.forest, this.ground, this.debris, this.radiance]) c.clear();
  }
}
