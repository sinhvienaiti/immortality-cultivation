/** Tickets 395/395b: painted 391 components, VFX_STANDARD ultimate; code places and animates art. */
import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import { WoodRootTint } from "./wood-ult-tint";
import { WoodRoots3D, type WoodRootPlacement } from "./wood-ult-roots3d";

export const WOOD_TIMING = { charge: 0.6, speed: 26, reach: 30, hold: 3, fade: 2.5 } as const;
export const WOOD_ROOTS = 180, WOOD_CAPACITY = 128;
export const WOOD_LAYOUT = { perimeter: 144, branches: 6, branchParts: 6, wallScale: 2.8, minRadius: 7, maxRadius: 14 } as const;
export const WOOD_CARD_LIMITS = { leafSide: 0.14, rootSide: 0.48, area: 0.14 } as const;
const FOREST_PARTS = WOOD_ROOTS * 6, CASTER_PARTS = 32, PER_FOE = 20;
const hash = (n: number): number => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export interface WoodCluster { x: number; z: number; at: number; height: number; width: number; role: "wall" | "branch" }
export interface WoodFoe { i: number; bindAt: number }

const VERTEX = /* glsl */ `
attribute vec3 iAnchor;
attribute vec2 iSize;
attribute vec4 iClock; // birth, life, mode, seed
attribute vec4 iStyle; // tile, flip, roll, alpha
attribute vec3 iMove;
uniform float uTime;
uniform vec3 uCardLimits;
varying vec2 vUv;
varying float vFade;
varying float vMode;
varying vec4 vScreen;
vec2 woodLocal(vec2 p, float mode, float grown, float age) {
  vec2 local = p * iSize;
  if (mode == 0.0 || mode == 10.0) {
    local.y = (p.y + 0.5) * iSize.y * grown;
    local.x *= 0.6 + grown * 0.4;
    local.y *= 1.0 - 0.45 * smoothstep(3.2, 3.85, age);
  }
  if (mode == 1.0) local *= 0.5 + 0.5 * grown;
  if (mode == 2.0) local *= (0.8 + grown * 0.2) * (1.0 + max(0.0, age - 3.0) * 0.35);
  float turn = iStyle.z;
  if (mode == 2.0) turn += max(0.0, age) * 0.24;
  if (mode == 3.0 || mode == 4.0) turn += max(0.0, age) * (0.7 + iClock.w * 0.5);
  if (mode == 5.0 || mode == 8.0) turn += max(0.0, age) * (2.0 + iClock.w * 3.0);
  return mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * local;
}
void main() {
  float age = uTime - iClock.x;
  float mode = iClock.z;
  float liveAge = max(0.0, age);
  float grown = smoothstep(0.0, 0.2, liveAge);
  float broken = max(0.0, age - 3.0);
  vMode = mode;
  vFade = smoothstep(0.0, 0.1, liveAge) * (1.0 - smoothstep(max(0.12, iClock.y - 0.65), iClock.y, liveAge)) * iStyle.w;
  if (mode == 0.0 || mode == 10.0) vFade = grown * (1.0 - smoothstep(3.2, 3.85, liveAge)) * iStyle.w;
  if (mode == 1.0) vFade = grown * (1.0 - smoothstep(3.0, 5.5, liveAge)) * iStyle.w;
  if (mode == 6.0) vFade *= 0.5 + 0.5 * pow(0.5 + 0.5 * sin(age * 5.0 + iClock.w * 40.0), 2.0);
  vFade *= step(0.0, age);
  vec2 local = woodLocal(position.xy, mode, grown, age);
  vec3 anchor = (modelMatrix * vec4(iAnchor, 1.0)).xyz;
  if (mode == 3.0 || mode == 4.0) {
    float a = iMove.y + min(liveAge, 3.0) * iMove.z;
    float r = iMove.x + broken * 1.4;
    anchor.xz += vec2(cos(a), sin(a)) * r;
    anchor.y += sin(liveAge * 1.6 + iMove.y) * 0.12 + broken * 0.35;
  }
  if (mode == 5.0 || mode == 6.0 || mode == 8.0 || mode == 9.0) anchor += iMove * liveAge;
  if (mode == 5.0) anchor.y -= 2.6 * liveAge * liveAge;
  if (mode == 7.0) anchor += iMove * min(1.0, liveAge / 0.6);
  vec3 toEye = cameraPosition - anchor;
  vec3 right = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(0.00001, 0.0, 0.0));
  vec3 up = vec3(0.0, 1.0, 0.0);
  if (mode >= 1.0) {
    right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  }
  if (mode == 2.0 || mode == 10.0) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0); }
  vec2 texUv = uv;
  if (iStyle.y < 0.0) texUv.x = 1.0 - texUv.x;
  vUv = (vec2(mod(iStyle.x, 4.0), 3.0 - floor(iStyle.x / 4.0)) + mix(vec2(0.004), vec2(0.996), texUv)) / 4.0;
  vec4 base = projectionMatrix * viewMatrix * vec4(anchor, 1.0);
  vec4 rx = projectionMatrix * viewMatrix * vec4(right, 0.0);
  vec4 ry = projectionMatrix * viewMatrix * vec4(up, 0.0);
  // Bound all four rotated corners, including the upright card's perspective depth.
  vec2 p0 = woodLocal(vec2(-0.5, -0.5), mode, grown, age);
  vec2 p1 = woodLocal(vec2( 0.5, -0.5), mode, grown, age);
  vec2 p2 = woodLocal(vec2(-0.5,  0.5), mode, grown, age);
  vec2 p3 = woodLocal(vec2( 0.5,  0.5), mode, grown, age);
  vec4 d0 = rx * p0.x + ry * p0.y, d1 = rx * p1.x + ry * p1.y;
  vec4 d2 = rx * p2.x + ry * p2.y, d3 = rx * p3.x + ry * p3.y;
  float nearW = base.w + min(0.0, min(min(d0.w, d1.w), min(d2.w, d3.w)));
  vec2 centre = base.xy / max(0.001, base.w);
  vec2 bound = max(max(abs(d0.xy - centre * d0.w), abs(d1.xy - centre * d1.w)),
                   max(abs(d2.xy - centre * d2.w), abs(d3.xy - centre * d3.w))) / max(0.001, nearW);
  float side = mode == 0.0 || mode == 2.0 || mode == 10.0 ? uCardLimits.y : uCardLimits.x;
  float scale = min(1.0, min(side / max(0.0001, max(bound.x, bound.y)),
                           sqrt(uCardLimits.z / max(0.0001, bound.x * bound.y))));
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
varying float vFade;
varying float vMode;
varying vec4 vScreen;
void main() {
  vec4 art = texture2D(uAtlas, vUv);
  float alpha = art.a * vFade;
  if (vMode != 2.0 && vMode != 10.0) {
    vec2 screen = vScreen.xy / vScreen.w * 0.5 + 0.5;
    vec2 inside = smoothstep(uCasterBox.xy - 0.004, uCasterBox.xy, screen)
                * (1.0 - smoothstep(uCasterBox.zw, uCasterBox.zw + 0.004, screen));
    alpha *= 1.0 - inside.x * inside.y;
  }
  if (alpha < 0.007) discard;
  vec3 color = min(art.rgb * 0.84, vec3(0.9));
  // Living-wood green lift on roots, still capped at 0.9 per channel.
  // Bark body: painted luminance pushed to dark brown; green survives only as thin veins and leaves.
  if (vMode == 0.0 || vMode == 10.0) {
    float lum = dot(art.rgb, vec3(0.3, 0.55, 0.15));
    float vein = smoothstep(0.14, 0.32, art.g - max(art.r, art.b));
    vec3 bark = vec3(0.30, 0.20, 0.12) * (0.25 + 1.1 * lum * lum * 1.6) + vec3(0.32, 0.26, 0.16) * smoothstep(0.6, 0.9, lum);
    vec3 glow = vec3(0.34, 0.9, 0.26) * (0.7 + 0.4 * lum);
    color = min(mix(bark, glow, vein), vec3(0.9));
    alpha = min(1.0, alpha * (vMode == 10.0 ? 1.9 : 1.6));
  }
  // Only the three painted leaves of the central sprout carry HDR veins.
  if (vMode == 1.0) {
    float core = smoothstep(0.35, 0.85, art.g) * art.a;
    color += vec3(0.90, 1.0, 0.38) * core * (2.2 + uFlash * 1.5);
  }
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
uniform float uRadius;
varying vec3 vWorld;
void main() {
  float d = distance(vWorld.xz, uOrigin);
  float age = uTime - 0.6 - d / uRadius * 0.2;
  float fade = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(3.0, 5.5, age));
  fade *= 1.0 - smoothstep(uRadius + 0.5, uRadius + 2.0, d);
  if (fade < 0.004) discard;
  vec4 art = texture2D(uGround, (vWorld.xz - uOrigin) / 9.0);
  gl_FragColor = vec4(min(art.rgb * 0.94, vec3(0.9)), art.a * fade * 0.32);
}`;

/** Preallocated cards: birth/size/motion upload only at cast/bind, never in the frame loop. */
class Cards {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly anchor: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly clock: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly move: THREE.InstancedBufferAttribute;
  constructor(parent: THREE.Object3D, capacity: number, name: string, uniforms: Record<string, THREE.IUniform>, order: number) {
    const plane = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index; geo.setAttribute("position", plane.getAttribute("position")); geo.setAttribute("uv", plane.getAttribute("uv"));
    const attr = (key: string, n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(key, a); return a;
    };
    this.anchor = attr("iAnchor", 3); this.size = attr("iSize", 2); this.clock = attr("iClock", 4);
    this.style = attr("iStyle", 4); this.move = attr("iMove", 3);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: withTagMask(FRAGMENT), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, material); this.mesh.name = "fx-wood-ult-" + name;
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

export class WoodSpriteField {
  readonly clusters: WoodCluster[] = [];
  readonly roots3d: WoodRoots3D;
  get drawCount(): number { return 4 + this.roots3d.drawCount; }
  readonly bindDrawCount = 2;
  readonly bindCapacity = WOOD_CAPACITY;
  readonly bindInstancesPerFoe = { vine: 1, leaves: 4, spores: 4, chips: 6, dust: 6 };
  private readonly tint = new WoodRootTint();
  get tintedFoes(): number { return this.tint.matched; }
  get activeTints(): number { return this.tint.active; }
  ready = false;
  heightRange: readonly [number, number] = [0, 0];
  private readonly group = new THREE.Group();
  private readonly time = { value: -1 };
  private readonly flashK = { value: 0 };
  private readonly atlas = { value: new THREE.Texture() };
  private readonly groundMap = { value: new THREE.Texture() };
  private readonly origin = { value: new THREE.Vector2() };
  private readonly caster = new THREE.Vector3();
  readonly centre = new THREE.Vector2();
  radius = 8;
  private readonly ringR = { value: 8 };
  private readonly casterBox = { value: new THREE.Vector4(2, 2, 2, 2) };
  private readonly corner = new THREE.Vector3();
  private readonly roots: Cards;
  private readonly vines: Cards;
  private readonly particles: Cards;
  private readonly ground: THREE.Mesh;
  private loading: Promise<void> | null = null;
  private flashAt = -100;
  constructor(parent: THREE.Object3D) {
    this.group.name = "fx-wood-ult"; parent.add(this.group);
    const uniforms = { ...TAG_UNIFORMS, uTime: this.time, uAtlas: this.atlas, uFlash: this.flashK,
      uCasterBox: this.casterBox,
      uCardLimits: { value: new THREE.Vector3(WOOD_CARD_LIMITS.leafSide, WOOD_CARD_LIMITS.rootSide, WOOD_CARD_LIMITS.area) } };
    this.roots = new Cards(this.group, WOOD_ROOTS + 10, "roots-and-sprout", uniforms, 10);
    this.vines = new Cards(this.group, WOOD_CAPACITY + 2, "foot-vines", uniforms, 8);
    this.particles = new Cards(this.group, FOREST_PARTS + CASTER_PARTS + WOOD_CAPACITY * PER_FOE, "leaves-spores-chips-dust", uniforms, 13);
    for (const cards of [this.roots, this.vines, this.particles]) {
      cards.mesh.onBeforeRender = (_renderer, _scene, camera) => this.protect(camera);
    }
    this.roots3d = new WoodRoots3D(this.group);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
      uniforms: { ...TAG_UNIFORMS, uTime: this.time, uOrigin: this.origin, uRadius: this.ringR, uGround: this.groundMap },
      vertexShader: GROUND_VERTEX, fragmentShader: withTagMask(GROUND_FRAGMENT), transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    this.ground.name = "fx-wood-ult-root-ground"; this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = 7; this.group.add(this.ground); this.clear();
  }
  prepare(base: string, upload?: (t: THREE.Texture) => void): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const loader = new THREE.TextureLoader(), path = base.replace(/\/?$/, "/") + "wood-ult/";
    void this.roots3d.prepare(base, upload);
    this.loading = Promise.all([loader.loadAsync(path + "wood-ult.atlas.png"), loader.loadAsync(path + "root-ground.png")]).then(([atlas, ground]) => {
      atlas.colorSpace = ground.colorSpace = THREE.SRGBColorSpace;
      atlas.minFilter = ground.minFilter = THREE.LinearMipmapLinearFilter;
      ground.wrapS = ground.wrapT = THREE.MirroredRepeatWrapping;
      this.atlas.value = atlas; this.groundMap.value = ground;
      upload?.(atlas); upload?.(ground);
      return this.roots3d.prepare(base, upload);
    }).then(() => { this.ready = this.roots3d.ready;
    }).catch((error: unknown) => console.warn("[wood-ult]", error)).finally(() => { this.loading = null; });
    return this.loading;
  }
  plan(origin: THREE.Vector3, hand: THREE.Vector3, foes: readonly WoodFoe[], targets: TargetField): void {
    this.clear(); this.tint.prepare(targets); this.group.visible = true;
    this.protectCaster(origin);
        // The ring hugs the bound foes (what the play camera sees), not the 30 m reach.
    const centre = this.centre, R = this.layout(origin, foes, targets);
    const cx = centre.x, cz = centre.y, row = WOOD_LAYOUT.perimeter / 3;
    const solid: WoodRootPlacement[] = [];
    const clearOfCaster = (x: number, z: number, room: number): boolean => Math.hypot(x - origin.x, z - origin.z) > room;
    for (let k = 0; k < WOOD_LAYOUT.perimeter; k++) {
      const band = Math.floor(k / row), j = k % row;
      const a = (j + band * 0.37) / row * Math.PI * 2, step = Math.PI * 2 * R / row;
      const r = R + (band === 0 ? 0 : band === 1 ? -1.3 : 0.35) + (hash(k + 7) - 0.5) * 0.7;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, at = 0.6 + hash(k + 3) * 0.16;
      const seed = k, slot = this.clusters.length;
      if (band === 0) {
        // Flat overlapping root runs laid along the ring (tangent): the floor of the wall.
        const len = step * (3.1 + hash(k + 18) * 0.8), thick = 3.3 + hash(k + 19) * 1.4;
        this.clusters.push({ x, z, at, height: len, width: thick, role: "wall" });
        this.roots.put(slot, x, 0.06, z, thick, len, at, 3.85, 10, k % 4, seed, 0.55, -a);
        // 3D arching ground runs laid tangent to the ring over the flat floor.
        if (clearOfCaster(x, z, 3.2)) solid.push({ variant: 4 + k % 2, x, z,
          yaw: -a + (hash(k + 41) - 0.5) * 0.5, scale: (1.3 + hash(k + 43) * 0.5) * (0.5 + 0.5 * Math.min(1, Math.hypot(x - origin.x, z - origin.z) / 10)), birth: at });
      } else {
        // Dense upright claw rows (Y billboards), overlapping, the outer row tallest.
        const tall = band === 2, h = (tall ? 3.6 + hash(k + 17) * 2.6 : 2.5 + hash(k + 17) * 1.8) * WOOD_LAYOUT.wallScale / 2.8;
        const w = h * (0.95 + hash(k + 19) * 0.35), tile = [1, 2, 1, 0][(k + band) % 4]!;
        this.clusters.push({ x, z, at, height: h, width: w, role: "wall" });
        // 3D claw roots (Blender meshes), hooks curling along the ring; the old upright card slot stays empty.
        const variant = Math.floor(hash(k + 51) * 4), modelH = [3.0, 3.6, 2.5, 4.2][variant]!;
        if (clearOfCaster(x, z, 2.4)) solid.push({ variant, x, z, yaw: -a + (hash(k + 53) > 0.5 ? 0 : Math.PI) + (hash(k + 55) - 0.5) * 0.9,
          scale: Math.min(1.25, Math.max(0.6, h / modelH * 0.7)) * (0.55 + 0.45 * Math.min(1, Math.hypot(x - origin.x, z - origin.z) / 9)), birth: at });
      }
      this.sparks(slot, x, z, seed, band > 0 ? this.clusters[slot]!.height : 0.6, this.clusters[slot]!.width, at);
    }
    // Six painted root runs link the sprout to the ring; flat art stays below bodies.
    for (let branch = 0; branch < WOOD_LAYOUT.branches; branch++) for (let part = 0; part < WOOD_LAYOUT.branchParts; part++) {
      const a = branch / WOOD_LAYOUT.branches * Math.PI * 2 + 0.18, seg = (R - 1.2) / WOOD_LAYOUT.branchParts;
      const r = 0.6 + part * seg, bend = Math.sin(part * 0.8 + branch) * 0.45 * Math.min(1, part / 2);
      const x = cx + Math.cos(a) * r - Math.sin(a) * bend, z = cz + Math.sin(a) * r + Math.cos(a) * bend;
      const at = 0.6 + r / R * 0.2, slot = this.clusters.length, len = seg * 1.6, w = 3.0 + hash(slot + 19) * 1.0;
      this.clusters.push({ x, z, at, height: len, width: w, role: "branch" });
      this.roots.put(slot, x, 0.09, z, w, len, at, 3.85, 10, slot % 4, slot, 0.88, Math.PI / 2 - a);
      this.sparks(slot, x, z, slot, 0.6, w, at);
    }
    this.roots3d.plan(solid);
    this.heightRange = [Math.min(...this.clusters.map(c => c.height)), Math.max(...this.clusters.map(c => c.height))];
    // One grounded focal sprout: painted claw-root base, leaves fanned at several angles, a glowing core.
    this.roots.put(WOOD_ROOTS, cx, -0.02, cz, 3.2, 2.2, 0.6, 5.5, 0, 1, 600, 0.9);
    this.roots.put(WOOD_ROOTS + 4, cx - 0.5, -0.02, cz + 0.2, 2.6, 1.6, 0.62, 5.5, 0, 2, 601, 0.85);
    this.roots.put(WOOD_ROOTS + 5, cx + 0.5, -0.02, cz - 0.2, 2.6, 1.6, 0.62, 5.5, 0, 2, 604, 0.85);
    const leaves: ReadonlyArray<readonly [number, number, number, number]> = [
      [-0.8, 1.3, 1.7, -1.5], [0, 1.9, 2.0, -0.78], [0.8, 1.3, 1.7, -0.05], [-0.45, 0.8, 1.3, -2.2], [0.45, 0.8, 1.3, 0.65]];
    leaves.forEach(([dx, y, s, roll], k) => this.roots.put(k < 3 ? WOOD_ROOTS + 1 + k : WOOD_ROOTS + 4 + k,
      cx + dx, y, cz, s, s, 0.6 + k * 0.025, 5.5, 1, 8, 700 + k, 0.94, roll));
    this.roots.put(WOOD_ROOTS + 9, cx, 0.75, cz, 1.9, 1.9, 0.6, 5.5, 1, 5, 710, 0.9);
    // Charge, release at the hand, then the outward root-front: all from the same painted ingredients.
    this.vines.put(WOOD_CAPACITY, cx, 0.065, cz, 3.0, 3.0, 0, 1.1, 2, 7, 800, 0.36);
    this.vines.put(WOOD_CAPACITY + 1, cx, 0.07, cz, 6.5, 6.5, 0.6, 4.6, 2, 7, 801, 0.6);
    for (let k = 0; k < CASTER_PARTS; k++) {
      const a = k / CASTER_PARTS * Math.PI * 2, charge = k < 16, radius = charge ? 1.2 : 0.1;
      const x = hand.x + Math.cos(a) * radius, z = hand.z + Math.sin(a) * radius;
      this.particles.put(FOREST_PARTS + k, x, hand.y, z, charge ? 0.13 : 0.24, charge ? 0.13 : 0.24,
        charge ? 0 : 0.6, charge ? 0.6 : 0.65, charge ? 7 : 8, k % 2 === 0 ? 4 : 5, 900 + k, 0.42, a,
        Math.cos(a) * (charge ? -radius : 3.2), charge ? 0 : 0.5, Math.sin(a) * (charge ? -radius : 3.2));
    }
    this.update(0);
  }
  /** Centre on the foes in reach; radius covers most of them, clamped to the play frame. */
  private layout(origin: THREE.Vector3, foes: readonly WoodFoe[], targets: TargetField): number {
    let sx = 0, sz = 0;
    for (const f of foes) { sx += targets.x(f.i); sz += targets.z(f.i); }
    const n = foes.length;
    if (n === 0) { this.centre.set(origin.x, origin.z); this.radius = 8; }
    else {
      this.centre.set(sx / n, sz / n);
      const d = foes.map(f => Math.hypot(targets.x(f.i) - this.centre.x, targets.z(f.i) - this.centre.y)).sort((a, b) => a - b);
      this.radius = Math.min(WOOD_LAYOUT.maxRadius, Math.max(WOOD_LAYOUT.minRadius, d[Math.floor((n - 1) * 0.85)]! + 1.5));
    }
    this.origin.value.copy(this.centre); this.ringR.value = this.radius;
    this.ground.position.set(this.centre.x, 0.045, this.centre.y);
    return this.radius;
  }
  private sparks(slot: number, x: number, z: number, seed: number, lift: number, width: number, at: number): void {
    for (let j = 0; j < 2; j++) {
      const n = slot * 6 + j * 3, a = hash(seed * 2 + j + 100) * Math.PI * 2;
      this.particles.put(n, x + Math.cos(a) * width * 0.25, lift * 0.6, z, 0.32, 0.32, at + 0.1, 4.8, 6, 5, n, 0.55, a, 0.06, 0.05, -0.03);
      this.particles.put(n + 1, x, lift * 0.3, z, 0.2, 0.32, at + 3.2, 0.8, 5, 6, n + 1, 0.65, a, Math.cos(a) * 1.8, 1.5, Math.sin(a) * 1.8);
      this.particles.put(n + 2, x, lift * 0.25, z, 0.2, 0.2, at + 3.2, 1.1, 9, 9, n + 2, 0.24, a, Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7);
    }
  }
  bind(slot: number, f: WoodFoe, targets: TargetField): void {
    if (slot >= WOOD_CAPACITY) return;
    const x = targets.x(f.i), z = targets.z(f.i), waist = targets.midY(f.i), r = targets.radius(f.i);
    const size = Math.min(0.24, 0.1 + r * 0.07), orbit = r + Math.max(0.4, r * 0.3) + size;
    const diameter = (r + 0.5) * 2;
    this.vines.put(slot, x, 0.065, z, diameter, diameter, f.bindAt, 3.65, 2, 7, slot, 0.42, hash(slot) * 6.28);
    this.tint.bind(slot, f.i, f.bindAt, targets);
    const start = FOREST_PARTS + CASTER_PARTS + slot * PER_FOE;
    for (let j = 0; j < 8; j++) {
      const a = j / 8 * Math.PI * 2 + hash(slot) * 6.28, leaf = j < 4, s = leaf ? size : 0.07 + hash(slot + j) * 0.04;
      this.particles.put(start + j, x, waist, z, s, s, f.bindAt, 3.6, leaf ? 3 : 4, leaf ? 4 : 5, slot * 20 + j,
        leaf ? 0.40 : 0.28, a, orbit + (leaf ? 0 : 0.2), a, (slot % 2 === 0 ? 1 : -1) * 0.72);
    }
    for (let j = 0; j < 6; j++) {
      const a = j / 6 * Math.PI * 2 + hash(slot) * 6.28, px = x + Math.cos(a) * (r + 0.2), pz = z + Math.sin(a) * (r + 0.2);
      this.particles.put(start + 8 + j, px, 0.1, pz, size * 1.3, size * 2, f.bindAt + 3, 0.8, 5, 6, slot + j, 0.65, a, Math.cos(a) * 1.8, 1.8, Math.sin(a) * 1.8);
      this.particles.put(start + 14 + j, px, 0.12, pz, size, size, f.bindAt + 3, 1.1, 9, 9, slot + j + 7, 0.24, a, Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.8);
    }
  }
  unbind(slot: number): void { if (slot < WOOD_CAPACITY) this.tint.hide(slot); }
  hide(slot: number): void {
    if (slot >= WOOD_CAPACITY) return;
    this.vines.hide(slot); this.tint.hide(slot);
    for (let j = 0; j < PER_FOE; j++) this.particles.hide(FOREST_PARTS + CASTER_PARTS + slot * PER_FOE + j);
  }
  flash(time: number): void { this.flashAt = time; }
  protectCaster(at: THREE.Vector3): void { this.caster.copy(at); }
  private protect(camera: THREE.Camera): void {
    const box = this.casterBox.value;
    box.set(Infinity, Infinity, -Infinity, -Infinity);
    // Includes the 1.65/1.75 m lab heroes, casting arms and tail; follows a moving caster.
    for (let x = -1; x <= 1; x += 2) for (let y = 0; y <= 1; y++) for (let z = -1; z <= 1; z += 2) {
      this.corner.set(this.caster.x + x * 1.15, this.caster.y + y * 2.5, this.caster.z + z * 1.15).project(camera);
      if (this.corner.z < -1 || this.corner.z > 1) { box.set(0, 0, 1, 1); return; }
      const sx = this.corner.x * 0.5 + 0.5, sy = this.corner.y * 0.5 + 0.5;
      box.x = Math.min(box.x, sx); box.y = Math.min(box.y, sy); box.z = Math.max(box.z, sx); box.w = Math.max(box.w, sy);
    }
  }
  update(time: number): void {
    this.time.value = time; this.tint.update(time); this.roots3d.update(time);
    const age = time - this.flashAt; this.flashK.value = age >= 0 && age < 0.09 ? (1 - age / 0.09) ** 2 : 0;
  }
  clear(): void {
    this.group.visible = false; this.clusters.length = 0; this.tint.clear();
    this.time.value = -1; this.flashK.value = 0; this.flashAt = -100; this.roots3d.clear();
    for (const cards of [this.roots, this.vines, this.particles]) cards.clear();
  }
}
