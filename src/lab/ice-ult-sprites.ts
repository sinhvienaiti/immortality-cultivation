/** Phiếu 389 — hình chỉ lấy từ ảnh 386; shader đặt, mọc, xoay và làm tan sprite.
 * Chuẩn VFX_STANDARD: charge/release cũ; travel 26 m/s; bind 3 s; aftermath 2,5 s.
 */
import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import { IceFrostTint } from "./ice-ult-frost";

const CHARGE = 0.6, SPEED = 26, REACH = 30, HOLD = 3, MELT = 2.5;
const COUNT = 180, BINDS = 128, SHARDS = 6, FLAKES = 8;
const hash = (n: number): number => { const k = Math.sin(n * 127.1 + 311.7) * 43758.5453; return k - Math.floor(k); };
interface Foe { i: number; freezeAt: number }
export interface SpriteCluster { x: number; z: number; at: number; height: number; width: number }

const VERTEX = /* glsl */ `
attribute vec3 iAnchor;
attribute vec2 iSize;
attribute vec4 iClock; // birth, life, mode, seed
attribute vec4 iStyle; // atlas cell, flip, roll, opacity
attribute vec3 iMove;
uniform float uTime;
uniform vec4 uBindTile;
varying vec2 vUv;
varying vec2 vLocalUv;
varying float vAge;
varying float vFade;
varying float vMode;
void main() {
  float age = uTime - iClock.x;
  float mode = iClock.z;
  vAge = age; vLocalUv = uv;
  float grown = smoothstep(0.0, 0.2, age);
  float fade = 1.0 - smoothstep(max(0.1, iClock.y - 2.5), iClock.y, age);
  if (mode == 2.0) fade = 1.0 - smoothstep(iClock.y * 0.12, iClock.y, age);
  vFade = grown * fade * iStyle.w * step(0.0, age);
  if (mode == 2.0) vFade = (1.0 - smoothstep(iClock.y * 0.12, iClock.y, age)) * iStyle.w * step(0.0, age);
  if (mode == 4.0) vFade *= 0.24 + 0.76 * pow(0.5 + 0.5 * sin(age * (5.0 + iClock.w * 4.0) + iClock.w * 40.0), 3.0);
  vMode = mode;
  // 6: orbit/shatter, 7: falling frost, 8: the same orbit dissolving to dust, 9: ground mist.
  if (mode >= 6.0) {
    vFade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(3.0, iClock.y, age)) * iStyle.w * step(0.0, age);
    if (mode == 7.0) vFade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(2.8, 3.0, age)) * iStyle.w * step(0.0, age);
    if (mode == 8.0) vFade *= smoothstep(2.98, 3.18, age);
    if (mode == 9.0) vFade *= 0.88 + 0.12 * sin(age * 2.4 + iClock.w * 6.283185);
  }
  vec2 local = position.xy * iSize;
  // Clusters stay planted; each card turns only round world Y, even in the behind camera.
  if (mode == 0.0) { local.y = (position.y + 0.5) * iSize.y * grown; local.x *= 0.65 + 0.35 * grown; }
  if (mode == 5.0) local *= 0.8 + 0.2 * grown;
  float broken = max(0.0, age - 3.0);
  if (mode == 6.0) local *= 1.0 - 0.65 * smoothstep(0.0, 0.55, broken);
  if (mode == 8.0) local *= 1.0 + broken * 1.5;
  if (mode == 9.0) local *= 1.0 + 0.025 * sin(age * 2.4) + broken * 0.9;
  float turn = iStyle.z + (mode == 2.0 ? age * (2.0 + iClock.w * 3.0) : mode == 9.0 ? age * 0.2 : mode >= 6.0 ? age * 0.45 : 0.0);
  local = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * local;
  vec3 anchor = (modelMatrix * vec4(iAnchor, 1.0)).xyz;
  if (mode == 2.0 || mode == 3.0 || mode == 4.0) anchor += iMove * max(0.0, age);
  if (mode == 2.0) anchor.y -= 3.0 * age * age;
  if (mode == 6.0 || mode == 8.0) {
    float angle = iMove.y + min(max(0.0, age), 3.0) * iMove.z;
    float radius = iMove.x + broken * (1.4 + iMove.x * 0.5);
    anchor.xz += vec2(cos(angle), sin(angle)) * radius;
    anchor.y += sin(min(age, 3.0) * 1.2 + iMove.y) * 0.08 + broken * 0.22;
  }
  if (mode == 7.0) {
    float cycle = mod(max(0.0, age) + iClock.w * 2.6, 2.6);
    anchor.y -= cycle * 0.42;
    anchor.xz += vec2(sin(age * 0.7 + iClock.w * 40.0), cos(age * 0.6 + iClock.w * 30.0)) * 0.1;
    vFade *= smoothstep(0.0, 0.25, cycle) * (1.0 - smoothstep(2.2, 2.6, cycle));
  }
  vec3 toEye = cameraPosition - anchor;
  vec3 right = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(0.00001, 0.0, 0.0));
  vec3 up = vec3(0.0, 1.0, 0.0);
  // Free particles face the camera; the forest is Y-locked and foot mist lies on the real ground.
  if (mode != 0.0) { right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
  if (mode == 9.0) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0); }
  vec3 world = anchor + right * local.x + up * local.y;
  vec2 texUv = uv;
  if (iStyle.y < 0.0) texUv.x = 1.0 - texUv.x;
  vUv = (vec2(mod(iStyle.x, 4.0), 3.0 - floor(iStyle.x / 4.0)) + mix(vec2(0.004), vec2(0.996), texUv)) / 4.0;
  if (mode == 9.0) vUv = uBindTile.xy + mix(vec2(0.008), vec2(0.992), uv) * uBindTile.zw;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (vFade < 0.002 || age > iClock.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform sampler2D uBindMap;
uniform float uFlash;
varying vec2 vUv;
varying vec2 vLocalUv;
varying float vAge;
varying float vFade;
varying float vMode;
void main() {
  vec4 art = texture2D(uAtlas, vUv);
  if (vMode == 9.0) {
    art = texture2D(uBindMap, vUv);
    vec2 p = vLocalUv * 2.0 - 1.0;
    float r = length(p);
    // Keep the painted outer mist only. Moving alpha cuts fracture it; no ring artwork is drawn here.
    float band = smoothstep(0.52, 0.71, r) * (1.0 - smoothstep(0.88, 0.99, r));
    float cuts = 0.5 + 0.5 * sin(atan(p.y, p.x) * 7.0 + r * 9.0);
    art.a = max(art.r, max(art.g, art.b)) * band * (1.0 - smoothstep(cuts * 0.32, 0.38 + cuts * 0.32, max(0.0, vAge - 3.0)));
  }
  float alpha = art.a * vFade;
  if (alpha < 0.007) discard;
  vec3 color = min(art.rgb * (vMode == 5.0 ? 1.12 : 0.94), vec3(0.9));
  // Only the flower's brightest painted inclusions pulse HDR, once, on the primary hit.
  if (vMode == 5.0) color += vec3(0.77, 0.91, 1.0) * 4.0 * uFlash * smoothstep(0.84, 1.0, min(art.r, min(art.g, art.b)));
  gl_FragColor = vec4(color, alpha);
}`;
const GROUND_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }
`;
const GROUND_FRAGMENT = /* glsl */ `
uniform sampler2D uGround;
uniform vec2 uOrigin;
uniform float uTime;
varying vec3 vWorld;
void main() {
  float d = distance(vWorld.xz, uOrigin);
  float age = uTime - 0.6 - d / 26.0;
  float edge = 1.0 - smoothstep(28.8, 30.0, d);
  float fade = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(3.0, 5.5, age)) * edge;
  if (fade < 0.004) discard;
  // Mirrored repeat avoids a hard seam even if the chosen source's opposite edges differ.
  vec4 art = texture2D(uGround, (vWorld.xz - uOrigin) / 8.5);
  gl_FragColor = vec4(min(art.rgb * 1.05, vec3(0.9)), fade * 0.62);
}`;

/** One upload per cast/freeze, no allocations or matrix uploads in update. */
class Cards {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly anchor: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly clock: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly move: THREE.InstancedBufferAttribute;
  count = 0;
  constructor(parent: THREE.Object3D, capacity: number, name: string, uniforms: Record<string, THREE.IUniform>, order: number) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute("position", plane.getAttribute("position"));
    geo.setAttribute("uv", plane.getAttribute("uv"));
    const attribute = (name: string, n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a); return a;
    };
    this.anchor = attribute("iAnchor", 3); this.size = attribute("iSize", 2);
    this.clock = attribute("iClock", 4); this.style = attribute("iStyle", 4); this.move = attribute("iMove", 3);
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: withTagMask(FRAGMENT), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = `fx-ice-ult-v3-${name}`;
    this.mesh.renderOrder = order; this.mesh.frustumCulled = false;
    parent.add(this.mesh); this.clear();
  }
  put(slot: number, x: number, y: number, z: number, w: number, h: number, birth: number, life: number, mode: number, cell: number, seed: number, alpha = 1, roll = 0, vx = 0, vy = 0, vz = 0): void {
    if (slot >= this.anchor.count) return;
    this.anchor.setXYZ(slot, x, y, z); this.size.setXY(slot, w, h);
    this.clock.setXYZW(slot, birth, life, mode, hash(seed));
    this.style.setXYZW(slot, cell, seed % 2 === 0 ? 1 : -1, roll, alpha);
    this.move.setXYZ(slot, vx, vy, vz);
    for (const a of [this.anchor, this.size, this.clock, this.style, this.move]) a.needsUpdate = true;
    this.count = Math.max(this.count, slot + 1); this.mesh.geometry.instanceCount = this.count;
  }
  hide(slot: number): void { if (slot < this.clock.count) { this.clock.setX(slot, 1e6); this.clock.needsUpdate = true; } }
  clear(): void {
    this.count = 0; this.mesh.geometry.instanceCount = 0;
    for (let i = 0; i < this.clock.count; i++) this.clock.setX(i, 1e6);
    this.clock.needsUpdate = true;
  }
}

export class IceSpriteField {
  readonly clusters: SpriteCluster[] = [];
  readonly focus = new THREE.Vector3();
  readonly drawCount = 6;
  readonly bindDrawCount = 3;
  readonly bindCapacity = BINDS;
  readonly bindInstancesPerFoe = { mist: 1, shards: SHARDS, flakes: FLAKES, dust: SHARDS };
  private readonly tint = new IceFrostTint();
  get tintedFoes(): number { return this.tint.matched; }
  heightRange: readonly [number, number] = [0, 0];
  ready = false;
  private loading: Promise<void> | null = null;
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private readonly accent = { value: 0 };
  private readonly origin = { value: new THREE.Vector2() };
  private readonly atlas = { value: new THREE.Texture() };
  private readonly groundMap = { value: new THREE.Texture() };
  private readonly bindMap = { value: new THREE.Texture() };
  private readonly forest: Cards;
  private readonly footMist: Cards;
  private readonly debris: Cards;
  private readonly radiance: Cards;
  private readonly mist: Cards;
  private readonly ground: THREE.Mesh;
  private flashAt = -100;

  constructor(parent: THREE.Object3D) {
    this.group.name = "fx-ice-ult-v3"; parent.add(this.group);
    const uniforms = { ...TAG_UNIFORMS, uTime: this.time, uFlash: this.accent, uAtlas: this.atlas,
      uBindMap: this.bindMap, uBindTile: { value: new THREE.Vector4(0, 0.5, 1 / 8, 1 / 8) } };
    this.forest = new Cards(this.group, COUNT + 7, "crystals-and-flower", uniforms, 10);
    this.footMist = new Cards(this.group, BINDS, "foot-mist", uniforms, 8);
    this.debris = new Cards(this.group, BINDS * SHARDS + COUNT * 2, "shards", uniforms, 13);
    this.radiance = new Cards(this.group, COUNT * 2 + BINDS * (FLAKES + SHARDS), "glitter", uniforms, 14);
    this.mist = new Cards(this.group, 24, "low-mist", uniforms, 9);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(REACH * 2, REACH * 2), new THREE.ShaderMaterial({
      uniforms: { ...TAG_UNIFORMS, uTime: this.time, uGround: this.groundMap, uOrigin: this.origin },
      vertexShader: GROUND_VERTEX, fragmentShader: withTagMask(GROUND_FRAGMENT), transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    this.ground.name = "fx-ice-ult-v3-cracked-surface"; this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = 7; this.group.add(this.ground); this.clear();
  }

  /** Lazy PNG upload, only for v3. Reuse the host's renderer and word-tag mask. */
  prepare(base: string, upload?: (texture: THREE.Texture) => void): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const loader = new THREE.TextureLoader();
    this.loading = Promise.all([
      loader.loadAsync(`${base.replace(/\/?$/, "/")}ice-ult/ice-ult-v3.atlas.png`),
      loader.loadAsync(`${base.replace(/\/?$/, "/")}ice-ult/cracked-surface.png`),
      loader.loadAsync(`${base.replace(/\/?$/, "/")}ice/ice-ground-mark.atlas.png`),
    ]).then(([atlas, ground, bind]) => {
      atlas.colorSpace = ground.colorSpace = THREE.SRGBColorSpace;
      atlas.minFilter = ground.minFilter = THREE.LinearMipmapLinearFilter;
      ground.wrapS = ground.wrapT = THREE.MirroredRepeatWrapping;
      this.atlas.value = atlas; this.groundMap.value = ground;
      bind.colorSpace = THREE.SRGBColorSpace; bind.minFilter = THREE.LinearMipmapLinearFilter;
      this.bindMap.value = bind;
      upload?.(atlas); upload?.(ground); upload?.(bind); this.ready = true;
    }).catch((error: unknown) => { console.warn("[ice-ult-v3]", error); }).finally(() => { this.loading = null; });
    return this.loading;
  }

  bindTargets(targets: TargetField): void { this.tint.prepare(targets); }

  plan(origin: THREE.Vector3, foes: readonly Foe[], targets: TargetField): void {
    this.clear(); this.group.visible = true; this.origin.value.set(origin.x, origin.z);
    this.ground.position.set(origin.x, 0.045, origin.z);
    this.focus.set(origin.x, 0.65, origin.z);
    const add = (x: number, z: number, k: number, edge: boolean): void => {
      const d = Math.hypot(x - origin.x, z - origin.z);
      const size = edge ? 2.3 + hash(k + 15) * 3.3 : 0.75 + hash(k + 18) * 2.1;
      const birth = CHARGE + d / SPEED;
      this.clusters.push({ x, z, at: birth, height: size, width: size });
      const slot = this.clusters.length - 1;
      this.forest.put(slot, x, -0.02, z, size, size, birth, 0.2 + HOLD + MELT, 0, slot % 4, k, 0.88, (hash(k + 4) - 0.5) * 0.1);
      for (let j = 0; j < 2; j++) {
        const n = slot * 2 + j, a = hash(n + 144) * Math.PI * 2;
        this.radiance.put(n, x + Math.cos(a) * size * 0.3, size * (0.2 + hash(n + 148) * 0.5), z, 0.18 + hash(n) * 0.22, 0.18 + hash(n) * 0.22,
          birth + 0.08 + j * 0.13, HOLD + MELT, 4, 9, n, 0.62, a, 0.04, 0.035, -0.02);
        const s = 0.12 + hash(n + 2) * 0.28;
        this.debris.put(n, x, size * 0.4, z, s, s * 1.8, birth + 0.2 + HOLD, 0.8, 2, 4 + n % 3, n, 0.6, a, Math.cos(a) * 1.8, 1.8 + hash(n), Math.sin(a) * 1.8);
      }
    };
    // 108 dense perimeter bouquets, in two offset rings; the world-space disk projects to the target ellipse.
    for (let k = 0; k < 108; k++) {
      const a = k / 54 * Math.PI * 2 + (k >= 54 ? 0.053 : 0);
      const r = (k < 54 ? 28.1 : 25.4) + (hash(k + 7) - 0.5) * 1.3;
      add(origin.x + Math.cos(a) * r, origin.z + Math.sin(a) * r, k, true);
    }
    // 40 scattered interior bouquets, distributed in area rather than a grid.
    for (let k = 0; k < 40; k++) {
      const a = k * 2.399963, r = 4.2 + Math.sqrt((k + 0.5) / 40) * 19;
      add(origin.x + Math.cos(a) * r, origin.z + Math.sin(a) * r, 108 + k, false);
    }
    // 32 extra bouquets dress the real foe groups; never a baked creature in a card.
    for (let k = 0; k < 32; k++) {
      const f = foes.length === 0 ? undefined : foes[Math.floor(k * foes.length / 32)];
      const a = k * 2.399963, r = 0.9 + hash(k + 60) * 1.4;
      let x = (f === undefined ? this.focus.x : targets.x(f.i)) + Math.cos(a) * r;
      let z = (f === undefined ? this.focus.z : targets.z(f.i)) + Math.sin(a) * r;
      const d = Math.hypot(x - origin.x, z - origin.z), clamp = Math.min(1, 29 / (d || 1));
      x = origin.x + (x - origin.x) * clamp; z = origin.z + (z - origin.z) * clamp;
      add(x, z, 148 + k, false);
    }
    const birth = CHARGE;
    // A single flower assembled from the approved cluster: six petals and one upright heart.
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI / 3;
      this.forest.put(COUNT + k, this.focus.x + (k < 6 ? Math.cos(a) * 1.1 : 0), 2.1, this.focus.z + (k < 6 ? Math.sin(a) * 1.1 : 0),
        k < 6 ? 5.8 : 6.4, k < 6 ? 5.8 : 6.4, birth + k * 0.012, HOLD + MELT, 5, k < 6 ? 3 : 2, k + 800, k < 6 ? 0.8 : 1, k < 6 ? a : 0);
    }
    for (let k = 0; k < 24; k++) {
      const c = this.clusters[(k * 7) % COUNT]!;
      this.mist.put(k, c.x, 0.35, c.z, 5.5 + hash(k) * 3, 0.65, c.at + 0.1, HOLD + MELT, 3, 7, k, 0.17, 0, 0.12, 0, -0.035);
    }
    this.heightRange = [Math.min(...this.clusters.map(c => c.height)), Math.max(...this.clusters.map(c => c.height))];
  }

  freeze(slot: number, foe: Foe, targets: TargetField): void {
    if (slot >= BINDS) return;
    const r = targets.radius(foe.i), waist = targets.midY(foe.i);
    const x = targets.x(foe.i), z = targets.z(foe.i);
    const s = Math.min(0.3, 0.1 + r * 0.12), orbit = r + Math.max(0.4, r * 0.35) + s;
    const diameter = (orbit + 0.15) * 2;
    this.footMist.put(slot, x, 0.065, z, diameter, diameter, foe.freezeAt, HOLD + 0.7, 9, 0, slot + 901, 0.24, hash(slot) * Math.PI * 2);
    this.tint.freeze(slot, foe.i, foe.freezeAt, targets);
    for (let j = 0; j < SHARDS; j++) {
      const n = slot * SHARDS + j, a = j / SHARDS * Math.PI * 2 + hash(slot) * Math.PI * 2;
      const speed = (slot % 2 === 0 ? 1 : -1) * (0.65 + hash(slot + 20) * 0.18);
      this.debris.put(COUNT * 2 + n, x, waist, z, s, s * 1.5, foe.freezeAt, HOLD + 0.55, 6, 4 + j % 3, n + 400, 0.46, a, orbit, a, speed);
      this.radiance.put(COUNT * 2 + slot * (FLAKES + SHARDS) + FLAKES + j, x, waist, z, s * 2.2, s * 2.2,
        foe.freezeAt, HOLD + 0.85, 8, j % 2 === 0 ? 7 : 8, n + 400, 0.22, a, orbit, a, speed);
    }
    for (let j = 0; j < FLAKES; j++) {
      const n = slot * FLAKES + j, a = j / FLAKES * Math.PI * 2 + hash(slot + 80) * 6.28;
      const radius = orbit + hash(n + 60) * 0.3, size = 0.06 + hash(n + 65) * 0.07;
      this.radiance.put(COUNT * 2 + slot * (FLAKES + SHARDS) + j, x + Math.cos(a) * radius, Math.max(1.3, waist + 0.9), z + Math.sin(a) * radius,
        size, size, foe.freezeAt, HOLD, 7, j % 3 === 0 ? 8 : 9, n + 500, 0.32, a);
    }
  }
  hide(slot: number): void {
    if (slot >= BINDS) return;
    this.footMist.hide(slot); this.tint.hide(slot);
    for (let j = 0; j < SHARDS; j++) this.debris.hide(COUNT * 2 + slot * SHARDS + j);
    for (let j = 0; j < FLAKES + SHARDS; j++) this.radiance.hide(COUNT * 2 + slot * (FLAKES + SHARDS) + j);
  }
  flash(time: number): void { this.flashAt = time; }
  update(time: number): void {
    this.time.value = time; this.tint.update(time);
    const age = time - this.flashAt;
    this.accent.value = age >= 0 && age < 0.09 ? Math.pow(1 - age / 0.09, 2) : 0;
  }
  clear(): void {
    this.group.visible = false; this.clusters.length = 0;
    this.time.value = -1; this.accent.value = 0; this.flashAt = -100;
    this.tint.clear();
    for (const cards of [this.forest, this.footMist, this.debris, this.radiance, this.mist]) cards.clear();
  }
}
