/** Tickets 433–433d: VFX_STANDARD ultimate; authored seal, Tripo blade and existing metal flipbooks.
 * Code owns placement, timing and erosion; no generated artwork or gameplay authority. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";
import { swordLook, SWORD_LOOK_PROBE } from "./metal-sword-look";
import { MetalTrailD, METAL_TRAIL_D } from "./metal-ult-trail-d";
import { EnergyASwordLayer, SMALL_PLANT_HOLD } from "./metal-ult-energy-a";
import type { MetalUltHost, MetalUltReport, MetalLayerSound } from "./metal-ult-layered";

export const METAL_RAIN = {
  // 433p owner: ~6 s of rain in ten building waves; planted swords stay 3 s longer (cap <=110 shown).
  waves: [0.6, 1.15, 1.7, 2.25, 2.8, 3.35, 3.9, 4.45, 5.0, 5.55], perWave: [6, 7, 8, 8, 9, 9, 9, 9, 9, 9],
  waveSpan: [0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42], targeted: 0.75,
  height: 12, sealDiameter: 16, sealBehindM: 0, launchAboveSeal: 0, formationIntroS: 0.5, fallDuration: [0.9, 1.0], smallScale: 0.54, swordHeight: [1.85, 2.0], giantHeight: 24, trailLength: [8.5, 13.5],
  plantedFade: SMALL_PLANT_HOLD, plantedLife: SMALL_PLANT_HOLD + 0.5, groundScale: 0.7, maxLeanDeg: 10, burial: 0.2,
  giantBirth: 6.8, climax: 7.6, dissolve: 11.05, end: 12.6, reach: 30, seed: 433,
} as const;
export const METAL_RAIN_CAMERA = { distanceRatio: 0.95, lowerAngleDeg: 6, fovDeg: 40 } as const;
export const METAL_RAIN_CAPACITY = METAL_RAIN.perWave.reduce((sum, count) => sum + count, 0) + 1;
let captureRain: MetalUltRain | null = null;
export const metalRainSnapshot = () => captureRain?.captureTips() ?? null;
const SHAFTS = 20, DUST_PER_SWORD = 9, SPARKS_PER_SWORD = 6;
/** 443b: the owner chose A (radial swords) on 17/11; ?formation=b|c compares, ?formation=old restores formation-topdown. */
function simpleFormation(): "a" | "b" | "c" | null {
  if (typeof window === "undefined") return "a";
  const value = new URLSearchParams(window.location.search).get("formation");
  if (value === "old") return null;
  return value === "b" || value === "c" ? value : "a";
}
const hash = (n: number): number => { const x = Math.sin((n + METAL_RAIN.seed) * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (a: number, b: number, t: number): number => { const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export interface MetalRainReport {
  waveCounts: number[]; waveTimes: number[]; targeted: number; scatter: number;
  impacts: number; hitEvents: number; giantAt: number; activeSwords: number; maxActiveSwords: number; rainDurationS: number; smallTotal: number;
  landingScreen: { left: number; right: number; widthFraction: number; plantedWidthFraction: number };
  returned: number; capacity: number; sealHeightM: number; sealDiameterM: number;
  fallingSwords: number; swordHeightM: readonly [number, number]; giantHeightM: number;
  fallDurationS: readonly [number, number]; trailLengthM: readonly [number, number];
  trailWidthM: readonly [number, number]; groundMarkM: readonly [number, number];
  sealCentre: { x: number; y: number; z: number }; sealOpacity: number;
  sealScreen: { width: number; height: number; left: number; top: number; right: number; bottom: number;
    topFraction: number; inside: boolean; clearOfCaption: boolean; captionBottom: number };
  raysScreen: { left: number; top: number; right: number; bottom: number; inside: boolean };
  worldGeometry: { sealNormalY: number; crossedRibbons: boolean; fixedAnchor: boolean; swayDeg: number };
  casterScreen: { x: number; top: number; bottom: number; inside: boolean };
  plantedSwords?: number; maxPlanted?: number; maxFalling?: number; shakeM?: number;
}
interface Sword {
  x: number; z: number; y: number; birth: number; impact: number; length: number;
  startX: number; startY: number; startZ: number; dx: number; dy: number; dz: number;
  fade: number; end: number; yaw: number; lean: number; trail: number; target: number; wave: number; state: number;
}
interface Atlas { cols: number; rows: number; frames: number; fps: number; }

const CARD_VERTEX = /* glsl */ `
attribute vec3 iAt;
attribute vec2 iSize;
attribute vec4 iClock; // birth, life, frame offset, opacity
attribute vec4 iStyle; // turn, drift x/y/z
attribute vec3 iDirection;
uniform float uTime;
uniform float uPlane;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
void main() {
  float age = uTime - iClock.x;
  float live = clamp(age, 0.0, iClock.y);
  float attack = uPlane == 1.0 || uPlane == 4.0 ? smoothstep(0.0, 0.3, live) : (uPlane == 2.0 ? smoothstep(0.0, 0.025, live) : 1.0);
  float tail = uPlane == 3.0 ? iClock.y - 0.025 : (uPlane == 2.0 ? 0.035 : min(0.35, iClock.y * 0.4));
  vAlpha = iClock.w * attack * (1.0 - smoothstep(iClock.y - tail, iClock.y, live));
  vFrame = iClock.z; vUv = uv;
  vec3 anchor = iAt + iStyle.yzw * live;
  float angle = iStyle.x;
  vec3 local;
  if (uPlane == 1.0 || uPlane == 3.0 || uPlane == 5.0) {
    vec2 p = position.xz * iSize;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    local = vec3(p.x, 0.0, p.y);
  } else if (uPlane == 4.0) {
    // 433g: one complete square rays painting, with rotation and uniform scale only.
    vec2 p = position.xy * iSize.x;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    local = vec3(p.x, p.y, 0.0);
  } else if (uPlane == 2.0) {
    // Two crossed world ribbons: fixed X/Y and Z/Y geometry, never camera-facing.
    vec3 axis = normalize(iDirection);
    vec3 right = abs(axis.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
    vec3 across = normalize(cross(right, axis));
    vec2 p = position.xz * iSize.x;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    local = right * p.x + axis * position.y * iSize.y + across * p.y;
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec2 p = position.xy * iSize;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    local = right * p.x + up * p.y;
  }
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(anchor + local, 1.0);
  if (age < 0.0 || age >= iClock.y || vAlpha < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const CARD_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uGrid;
uniform float uFrames;
uniform vec3 uTint;
uniform float uPlane;
uniform vec4 uCrop;
uniform float uTime;
uniform float uSimple;
uniform float uArtOnly;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
vec4 cell(float frame, vec2 offset) {
  vec2 tile = vec2(mod(frame, uGrid.x), uGrid.y - 1.0 - floor(frame / uGrid.x));
  vec2 artUv = mix(uCrop.xy, uCrop.zw, mix(vec2(0.004), vec2(0.996), clamp(vUv + offset, 0.0, 1.0)));
  return texture2D(uMap, (tile + artUv) / uGrid);
}
void main() {
  float frame = clamp(vFrame, 0.0, uFrames - 1.0);
  vec4 art;
  if (uArtOnly > 0.5) {
    // Exact source frame. No crop, blur, channel extraction, masking or UV deformation.
    vec2 tile = vec2(mod(floor(frame), uGrid.x), uGrid.y - 1.0 - floor(floor(frame) / uGrid.x));
    art = texture2D(uMap, (tile + vUv) / uGrid);
    gl_FragColor = vec4(art.rgb * uTint, art.a * vAlpha);
    return;
  }
  if (uPlane == 1.0 && uSimple > 0.5) {
    // Animate one painted surface: only the outer annulus rotates; the emblem stays still.
    vec2 p = vUv - 0.5;
    float turn = uTime * 0.10;
    vec2 spun = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p + 0.5;
    float band = smoothstep(0.26, 0.31, length(p));
    vec2 offset = (spun - vUv) * band;
    art = cell(0.0, offset);
    // A soft underside glow comes from the same painting, without another stacked seal.
    vec4 halo = (cell(0.0, offset + vec2(0.012, 0.0)) + cell(0.0, offset - vec2(0.012, 0.0))
      + cell(0.0, offset + vec2(0.0, 0.012)) + cell(0.0, offset - vec2(0.0, 0.012))) * 0.25;
    if (gl_FrontFacing) art.rgb += halo.rgb * 0.12;
    float sector = fract(atan(p.y, p.x) / 6.2831853 + 0.5);
    float reveal = smoothstep(sector * 0.32, sector * 0.32 + 0.08, uTime);
    art.a *= mix(smoothstep(0.0, 0.4, uTime), reveal, band);
  } else if (uPlane == 5.0) {
    // Defocus the existing painted flare's centre into a soft, filled ground wash.
    art = cell(floor(frame), vec2(0.0)) * 0.4;
    art += (cell(floor(frame), vec2(0.16, 0.12)) + cell(floor(frame), vec2(-0.16, -0.12))
      + cell(floor(frame), vec2(-0.12, 0.16)) + cell(floor(frame), vec2(0.12, -0.16))) * 0.15;
    art.a *= 1.0 - smoothstep(0.08, 0.49, length(vUv - 0.5));
  } else if (uPlane == 2.0 || uPlane == 4.0) {
    // Blur the existing painted light strip; its point and end ornament are cropped out.
    art = cell(floor(frame), vec2(0.0)) * 0.28;
    art += (cell(floor(frame), vec2(0.10, 0.0)) + cell(floor(frame), vec2(-0.10, 0.0))) * 0.22;
    art += (cell(floor(frame), vec2(0.23, 0.0)) + cell(floor(frame), vec2(-0.23, 0.0))) * 0.09;
    art += (cell(floor(frame), vec2(0.0, 0.04)) + cell(floor(frame), vec2(0.0, -0.04))) * 0.05;
  } else art = mix(cell(floor(frame), vec2(0.0)), cell(min(floor(frame) + 1.0, uFrames - 1.0), vec2(0.0)), fract(frame));
  float alpha = art.a * vAlpha;
  // The formation is circular artwork: mask its transparent card corners to a precise fitting envelope.
  if (uPlane == 1.0) alpha *= 1.0 - smoothstep(0.49, 0.5, length(vUv - 0.5));
  if (uPlane == 2.0) alpha *= 1.0 - smoothstep(0.05, 1.0, vUv.y);
  if (uPlane == 4.0) alpha *= smoothstep(0.0, 0.85, vUv.y);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(min(art.rgb * uTint, vec3(0.9)), alpha);
}`;

/** Persistent cards: atlas artwork supplies every silhouette, including trails and dust. */
// 433n: painted content spans ~84 % of each 1024 still; tints and peaks are the only tuning knobs.
const IMPACT_ART_FILL = 0.84;
const DUST_CHARCOAL = [0.38, 0.41, 0.47] as const;
const GIANT_FACE_YAW = 0;
// 433t owner (pick C): the "centipede" bolt crackles and their 433s shade puffs are replaced by 2-4 soft glow flashes
// cut from Firefly clip C (dust-glow-c flipbook), each one short flash inside the giant's dust cloud. Old bolt files stay in the library.
const DUST_GLOW = { size: 9, life: [0.32, 0.46] as const, glowFrames: 26, branchFirst: 26, opacity: 0.85 } as const;
const ARC_GIANT = 4;
const IMPACT_WAVE = { opacity: 1.0, tint: [2.6, 1.85, 0.9] as const };
const IMPACT_CRACK = { glow: [2.4, 1.45, 0.55] as const, lines: 1.0 };
class RainCards {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly at: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly clock: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;
  private readonly direction: THREE.InstancedBufferAttribute;
  meta: Atlas = { cols: 4, rows: 4, frames: 16, fps: 0 };
  constructor(parent: THREE.Object3D, capacity: number, name: string, time: THREE.IUniform<number>, plane = 0) {
    const quad = new THREE.PlaneGeometry(), geometry = new THREE.InstancedBufferGeometry();
    if (plane === 1 || plane === 3 || plane === 5) quad.rotateX(Math.PI / 2); // XZ, normal -Y.
    if (plane === 2) {
      const crossed = quad.clone().rotateY(Math.PI / 2);
      for (const name of ["position", "uv"]) {
        const a = quad.getAttribute(name), b = crossed.getAttribute(name);
        geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array([...a.array, ...b.array]), a.itemSize));
      }
      geometry.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); crossed.dispose();
    } else {
      geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position")); geometry.setAttribute("uv", quad.getAttribute("uv"));
    }
    const attribute = (name: string, count: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * count), count).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, a); return a;
    };
    this.at = attribute("iAt", 3); this.size = attribute("iSize", 2); this.clock = attribute("iClock", 4); this.style = attribute("iStyle", 4); this.direction = attribute("iDirection", 3);
    const material = new THREE.ShaderMaterial({ uniforms: { ...TAG_UNIFORMS, uTime: time,
      uMap: { value: null }, uGrid: { value: new THREE.Vector2(4, 4) }, uFrames: { value: 16 },
      uPlane: { value: plane }, uSimple: { value: 0 }, uArtOnly: { value: 0 }, uTint: { value: new THREE.Color(1.8, 1.35, 0.82) },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: CARD_VERTEX, fragmentShader: withTagMask(CARD_FRAGMENT), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = "fx-metal-rain-" + name;
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 11; parent.add(this.mesh); this.clear();
    quad.dispose();
  }
  attach(texture: THREE.Texture, meta: Atlas): void {
    this.meta = meta;
    const u = this.mesh.material.uniforms; u.uMap!.value = texture;
    (u.uGrid!.value as THREE.Vector2).set(meta.cols, meta.rows); u.uFrames!.value = meta.frames;
  }
  put(slot: number, x: number, y: number, z: number, w: number, h: number, birth: number, life: number,
    frame: number, opacity: number, turn = 0, vx = 0, vy = 0, vz = 0): void {
    this.at.setXYZ(slot, x, y, z); this.size.setXY(slot, w, h); this.clock.setXYZW(slot, birth, life, frame, opacity);
    this.style.setXYZW(slot, turn, vx, vy, vz); this.direction.setXYZ(slot, 0, 1, 0);
    this.mesh.geometry.instanceCount = Math.max(this.mesh.geometry.instanceCount, slot + 1);
  }
  aim(slot: number, x: number, y: number, z: number): void { this.direction.setXYZ(slot, x, y, z); }
  flush(): void { for (const a of [this.at, this.size, this.clock, this.style, this.direction]) a.needsUpdate = true; }
  clear(): void { this.mesh.geometry.instanceCount = 0; }
  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

const SWORD_VERTEX = /* glsl */ `
attribute float iSeed;
attribute vec2 iDissolve;
uniform float uRainTime;
varying vec2 vRainDissolve;
varying vec3 vRainLocal;
varying float vRainSeed;
`;
const SWORD_FRAGMENT = /* glsl */ `
uniform float uRainTime;
uniform float uSwordProbe;
varying vec3 vRainLocal;
varying float vRainSeed;
varying vec2 vRainDissolve;
float rainHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719)) + vRainSeed) * 43758.5453); }
`;

export class MetalUltRain {
  readonly group = new THREE.Group();
  readonly slots: Sword[] = Array.from({ length: METAL_RAIN_CAPACITY }, () => ({ x: 0, y: 0, z: 0,
    birth: 0, impact: 0, length: 0, startX: 0, startY: 0, startZ: 0, dx: 0, dy: 1, dz: 0, fade: 0, end: 0, yaw: 0, lean: 0, trail: 0, target: -1, wave: 0, state: 3 }));
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  ready = false;
  loadError: string | null = null;
  last: MetalUltReport | null = null;
  private t = -1;
  private disposed = false;
  private loading: Promise<void> | null = null;
  private readonly time = { value: -1 };
  private readonly textures = new Set<THREE.Texture>();
  private readonly seal: RainCards;
  private readonly groundWash: RainCards;
  private readonly shafts: RainCards;
  private readonly trails: RainCards;
  private readonly trailD: MetalTrailD;
  private readonly impacts: RainCards;
  private readonly ground: RainCards;
  private readonly burst: RainCards;
  private readonly crackB: RainCards;
  private readonly crackGlowB: RainCards;
  private readonly waveA: RainCards;
  private readonly arcs: RainCards;
  private readonly dust: RainCards;
  private readonly sparks: RainCards;
  private readonly smoke: RainCards;
  private readonly sparkle: RainCards;
  private readonly blast: RainCards;
  private readonly dim: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly shakeAt = new THREE.Vector3();
  private readonly cards: readonly RainCards[];
  private readonly origin = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly sealCentre = new THREE.Vector3();
  private readonly screenPoint = new THREE.Vector3();
  private readonly captureCamera = new THREE.PerspectiveCamera();
  private readonly clipMatrix = new THREE.Matrix4();
  private readonly polygonA = Array.from({ length: 256 }, () => new THREE.Vector2());
  private readonly polygonB = Array.from({ length: 256 }, () => new THREE.Vector2());
  private caption: HTMLElement | null = null;
  private fitted = false;
  private readonly playCamera = new THREE.PerspectiveCamera();
  private havePlayCamera = false;
  private readonly fitCamera = new THREE.PerspectiveCamera();
  private readonly fitStart = new THREE.Vector3();
  private readonly fitEnd = new THREE.Vector3();
  private readonly fitStartQ = new THREE.Quaternion();
  private readonly fitEndQ = new THREE.Quaternion();
  private readonly behindBaseQ = new THREE.Quaternion();
  private readonly behindAim = new THREE.Vector3();
  private readonly fitLook = new THREE.Matrix4();
  private readonly hand = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
  private readonly fallRotation = new THREE.Quaternion();
  private readonly plantedRotation = new THREE.Quaternion();
  private readonly fallAxis = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly side = new THREE.Vector3(1, 0, 0);
  private readonly scale = new THREE.Vector3();
  private readonly eligible: number[] = [];
  private hit = new Uint8Array(0);
  private radius = METAL_RAIN.sealDiameter / 2;
  private triangles = 0;
  private readonly look = swordLook();
  readonly formation = simpleFormation();
  private get sealDiameter(): number { return METAL_RAIN.sealDiameter; }
  private lookLayer: EnergyASwordLayer | null = null;
  private released = false;
  private soundTurn = 0;
  private nextImpactSound = 0;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: MetalUltHost) {
    captureRain = this; this.group.name = "fx-metal-ult-rain"; parent.add(this.group);
    this.seal = new RainCards(this.group, 1, "sky-seal", this.time, 1);
    this.groundWash = new RainCards(this.group, 1, "formation-ground-wash", this.time, 5);
    this.shafts = new RainCards(this.group, SHAFTS, "seal-rays", this.time, 4);
    this.trails = new RainCards(this.group, METAL_RAIN_CAPACITY, "trails", this.time, 2);
    this.trails.mesh.visible = false; // 433h: retain the old crop-blur path, never render it.
    this.trailD = new MetalTrailD(this.group, METAL_RAIN_CAPACITY);
    this.impacts = new RainCards(this.group, METAL_RAIN_CAPACITY, "impacts", this.time);
    this.ground = new RainCards(this.group, METAL_RAIN_CAPACITY, "ground-marks", this.time, 3);
    this.burst = new RainCards(this.group, 1, "climax", this.time);
    this.dust = new RainCards(this.group, METAL_RAIN_CAPACITY * DUST_PER_SWORD, "dust", this.time);
    this.sparks = new RainCards(this.group, METAL_RAIN_CAPACITY * SPARKS_PER_SWORD, "contact-sparks", this.time);
    // Crop the existing blade cell's black side margins: the old trail occupied only 10% of its card.
    for (const c of [this.trails]) (c.mesh.material.uniforms.uCrop!.value as THREE.Vector4).set(0.42, 0.18, 0.58, 0.82);
    (this.seal.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(1.7, 1.3, 0.72);
    this.seal.mesh.material.uniforms.uSimple!.value = this.formation === null ? 0 : 1;
    (this.groundWash.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(0.55, 0.38, 0.1);
    // The archived crop/blur branches stay in CARD_FRAGMENT; these layers bypass them completely.
    for (const c of [this.shafts, this.groundWash]) {
      c.mesh.material.uniforms.uArtOnly!.value = 1;
      (c.mesh.material.uniforms.uCrop!.value as THREE.Vector4).set(0, 0, 1, 1);
    }
    (this.shafts.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(0.8, 0.65, 0.3);
    this.groundWash.mesh.renderOrder = 7;
    this.ground.mesh.renderOrder = 8;
    (this.dust.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(1.15, 0.98, 0.7);
    // 433l: small-sword contact = CC0 DiscSmoke puff (earth tint, normal blend) + one metal-sparkle cluster.
    this.smoke = new RainCards(this.group, METAL_RAIN_CAPACITY, "contact-dust", this.time);
    this.sparkle = new RainCards(this.group, METAL_RAIN_CAPACITY, "contact-sparkle", this.time);
    this.blast = new RainCards(this.group, 1, "giant-dust-blast", this.time);
    for (const c of [this.smoke, this.sparkle, this.blast]) c.mesh.material.uniforms.uArtOnly!.value = 1;
    for (const c of [this.smoke, this.blast]) { c.mesh.material.blending = THREE.NormalBlending; c.mesh.renderOrder = 10; }
    // 433r owner: cool charcoal dust so the ice crackles read; gold stays for sword, aura, wave and cracks.
    (this.smoke.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(...DUST_CHARCOAL);
    // 433m: owner chose warm bright gold dust (tint only).
    (this.blast.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(...DUST_CHARCOAL);
    (this.sparkle.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(1.0, 0.8, 0.45);
    // One flat full-screen tone, no shape: darkens the scene during the rain so gold reads.
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 } },
      vertexShader: "void main(){gl_Position=vec4(position.xy,0.0,1.0);}",
      fragmentShader: "uniform float uOpacity;void main(){gl_FragColor=vec4(0.0,0.0,0.0,uOpacity);}",
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.dim.name = "fx-metal-rain-dim"; this.dim.frustumCulled = false; this.dim.renderOrder = 6; this.group.add(this.dim);
    // 433n: owner-approved top-down stills as world ground planes (plane 5 = XZ, flat envelope; art-only path): cracks B (normal + glow), wave A (additive).
    this.crackB = new RainCards(this.group, 1, "giant-crack-b", this.time, 5);
    this.crackGlowB = new RainCards(this.group, 1, "giant-crack-b-glow", this.time, 5);
    this.waveA = new RainCards(this.group, 1, "giant-wave-a", this.time, 5);
    for (const c of [this.crackB, this.crackGlowB, this.waveA]) c.mesh.material.uniforms.uArtOnly!.value = 1;
    this.crackB.mesh.material.blending = THREE.NormalBlending;
    (this.waveA.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(...IMPACT_WAVE.tint);
    this.crackB.mesh.renderOrder = 8.2; this.crackGlowB.mesh.renderOrder = 8.4; this.waveA.mesh.renderOrder = 8.6;
    // 433t owner: soft glow flashes inside the dust, cut from Firefly clip C (dust-glow-c).
    this.arcs = new RainCards(this.group, ARC_GIANT, "dust-glow", this.time);
    this.arcs.mesh.material.uniforms.uArtOnly!.value = 1; this.arcs.mesh.renderOrder = 10.5;
    // 433q owner: ice white-blue so the crackles separate from the gold swords (tint only, <=0.9).
    (this.arcs.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(0.8, 0.88, 0.9);
    this.cards = [this.arcs, this.crackB, this.crackGlowB, this.waveA, this.seal, this.groundWash, this.shafts, this.trails, this.impacts, this.ground, this.burst, this.dust, this.sparks, this.smoke, this.sparkle, this.blast];
    this.clear();
  }
  get active(): boolean { return this.t >= 0; }
  prepare(): Promise<void> {
    if (this.ready || this.disposed) return Promise.resolve();
    if (this.loading !== null) return this.loading;
    const base = this.base.replace(/\/?$/, "/"); this.loadError = null;
    this.loading = (async () => {
      // Keep successful resources on partial failure; retry only missing assets.
      const atlas = async (card: RainCards, folder: string, name: string): Promise<void> => {
        if (card.mesh.material.uniforms.uMap!.value !== null) return;
        const response = await fetch(base + folder + name + ".json");
        if (!response.ok) throw new Error("HTTP " + response.status + ": " + name);
        const raw = await response.json() as Atlas;
        if (![raw.cols, raw.rows, raw.frames, raw.fps].every(n => Number.isFinite(n) && n > 0)
          || raw.frames > raw.cols * raw.rows) throw new Error("Invalid atlas: " + name);
        const texture = await new THREE.TextureLoader().loadAsync(base + folder + name + ".atlas.png");
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
        this.textures.add(texture); this.host.upload?.(texture); card.attach(texture, raw);
      };
      await Promise.allSettled([
        atlas(this.seal, "metal-ult/", this.formation === null ? "formation-topdown" : "formation-simple-" + this.formation), atlas(this.impacts, "metal/", "metal-impact-v2"),
        atlas(this.burst, "metal/", "metal-big-burst-v2"), atlas(this.ground, "metal/", "metal-ground-mark"),
        atlas(this.groundWash, "metal-ult/", "formation-simple-a"), this.loadSword(base),
        atlas(this.smoke, "metal-ult/", "disc-smoke-01"), atlas(this.blast, "metal-ult/", "explosion-01-nofire"),
        atlas(this.sparkle, "metal/", "metal-sparkle"), atlas(this.arcs, "metal-ult/", "dust-glow-c"),
        ...([[this.crackB, "impact-crack-b"], [this.crackGlowB, "impact-crack-b-glow"], [this.waveA, "impact-wave-a"]] as const).map(async ([card, name]) => {
          if (card.mesh.material.uniforms.uMap!.value !== null) return;
          const texture = await new THREE.TextureLoader().loadAsync(base + "metal-ult/" + name + ".png");
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; this.textures.add(texture); this.host.upload?.(texture);
          card.attach(texture, { cols: 1, rows: 1, frames: 1, fps: 0 });
        }),
        (async () => {
          if (this.trailD.ready) return;
          const texture = await new THREE.TextureLoader().loadAsync(base + "metal-ult/sword-trail-d.png");
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture); this.host.upload?.(texture);
          this.trailD.attach(texture);
        })(),
        (async () => {
          if (this.shafts.mesh.material.uniforms.uMap!.value !== null) return;
          const texture = await new THREE.TextureLoader().loadAsync(base + "metal-ult/rays.png");
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture); this.host.upload?.(texture);
          this.shafts.attach(texture, { cols: 1, rows: 1, frames: 1, fps: 0 });
        })(),
        (async () => {
          if (this.trails.mesh.material.uniforms.uMap!.value !== null) return;
          const texture = await new THREE.TextureLoader().loadAsync(base + "metal-ult/metal-ult.atlas.png");
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture); this.host.upload?.(texture);
          const meta = { cols: 4, rows: 4, frames: 16, fps: 0 };
          for (const c of [this.trails, this.dust, this.sparks]) c.attach(texture, meta);
        })(),
      ]).then(results => {
        const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failure !== undefined) throw failure.reason;
      });
      this.ready = !this.disposed && this.mesh !== null && this.trailD.ready && this.cards.every(c => c.mesh.material.uniforms.uMap!.value !== null);
      if (this.last !== null) this.last.assetsReady = this.ready;
      if (this.active) this.draw();
    })().catch((error: unknown) => { this.loadError = String(error); console.warn("[metal-rain]", error); })
      .finally(() => { this.loading = null; this.syncReport(); });
    return this.loading;
  }
  private async loadSword(base: string): Promise<void> {
    if (this.mesh !== null) return;
    const gltf = await new GLTFLoader().loadAsync(base + "metal-ult/models3d/tripo/ult-metal-sword.tripo.v1.glb");
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m); for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      }
    });
    let giantGeometry: THREE.BufferGeometry | null = null, giantMaterial: THREE.MeshStandardMaterial | null = null;
    let geometry: THREE.BufferGeometry | null = null, material: THREE.MeshStandardMaterial | null = null;
    let mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    let artLayer: EnergyASwordLayer | null = null;
    let retained = false;
    try {
      if (this.disposed) return;
      gltf.scene.updateMatrixWorld(true);
      const sources: THREE.Mesh[] = []; gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) sources.push(o); });
      const source = sources[0];
      if (sources.length !== 1 || source === undefined || !(source.material instanceof THREE.MeshStandardMaterial)) throw new Error("Expected one Tripo PBR sword");
      geometry = source.geometry.clone().applyMatrix4(source.matrixWorld); geometry.computeBoundingBox();
      const box = geometry.boundingBox!.clone(), height = box.max.y - box.min.y;
      if (height <= 0 || !geometry.hasAttribute("normal") || !geometry.hasAttribute("uv")) throw new Error("Invalid sword bounds/normal/UV");
      // Preserve the existing normalization. 433g renders the source geometry intact, including its pedestal.
      geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      geometry.scale(1 / height, 1 / height, 1 / height); geometry.translate(0, -0.18, 0);
      geometry.scale(1 / 0.82, 1 / 0.82, 1 / 0.82); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      // 433n: giant only, the no-rock-base v2 GLB (same source frame, blade untouched). Normalised with the
      // v1 bounds so the blade keeps its exact size and planted depth; only the rock below is gone.
      const nobase = await new GLTFLoader().loadAsync(base + "metal-ult/models3d/tripo/ult-metal-sword.nobase.v2.glb");
      nobase.scene.updateMatrixWorld(true);
      const giantSources: THREE.Mesh[] = []; nobase.scene.traverse(o => { if (o instanceof THREE.Mesh) giantSources.push(o); });
      const giantSource = giantSources[0];
      if (giantSources.length !== 1 || giantSource === undefined || !(giantSource.material instanceof THREE.MeshStandardMaterial)) throw new Error("Expected one no-base PBR sword");
      for (const o of giantSources) { materials.add(o.material as THREE.Material); for (const v of Object.values(o.material)) if (v instanceof THREE.Texture) textures.add(v); }
      giantMaterial = giantSource.material;
      giantGeometry = giantSource.geometry.clone().applyMatrix4(giantSource.matrixWorld);
      giantGeometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      giantGeometry.scale(1 / height, 1 / height, 1 / height); giantGeometry.translate(0, -0.18, 0);
      giantGeometry.scale(1 / 0.82, 1 / 0.82, 1 / 0.82); giantGeometry.computeBoundingBox(); giantGeometry.computeBoundingSphere();
      geometries.add(giantSource.geometry);
      geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(Float32Array.from({ length: METAL_RAIN_CAPACITY }, (_, i) => i + 1), 1));
      geometry.setAttribute("iDissolve", new THREE.InstancedBufferAttribute(Float32Array.from(this.slots.flatMap(s => [s.fade, s.end])), 2));
      this.triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      // 433j: retain every GLB material factor and map; the carrier stays hidden.
      material = source.material.clone();
      // 433g: archive the 433f material path without compiling or using it.
      if (false) {
      material!.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, TAG_UNIFORMS, { uRainTime: this.time, uSwordProbe: SWORD_LOOK_PROBE });
        shader.vertexShader = SWORD_VERTEX + shader.vertexShader.replace("#include <begin_vertex>", /* glsl */ `#include <begin_vertex>
vRainLocal = position; vRainSeed = iSeed; vRainDissolve = iDissolve;
float rainDecay = smoothstep(iDissolve.x, iDissolve.y, uRainTime);
transformed.xz += normalize(position.xz + vec2(0.0001)) * rainDecay * 0.035;
transformed.y += rainDecay * 0.08;`);
        shader.fragmentShader = withTagMask(SWORD_FRAGMENT + shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", /* glsl */ `#include <clipping_planes_fragment>
if (vRainLocal.y < 0.0) discard;
float rainIsGiant = step(${METAL_RAIN_CAPACITY - 0.5}, vRainSeed);
if (${this.look === "mix" ? "rainIsGiant < 0.5 || " : ""}uSwordProbe == 3.0 || (uSwordProbe == 1.0 && rainIsGiant > 0.5) || (uSwordProbe == 2.0 && rainIsGiant < 0.5)) discard;
float rainDecay = smoothstep(vRainDissolve.x, vRainDissolve.y, uRainTime);
float rainGrain = rainHash(floor(vRainLocal * 80.0));
if (rainDecay >= 1.0 || rainGrain < rainDecay) discard;`)
          .replace("#include <map_fragment>", /* glsl */ `#include <map_fragment>
float rainGold = smoothstep(0.025, 0.13, diffuseColor.r - diffuseColor.b) * smoothstep(0.5, 0.72, vRainLocal.y);
float rainLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
vec3 rainSteel = mix(vec3(0.5, 0.54, 0.58), vec3(0.86, 0.88, 0.9), clamp(rainLum * 1.6, 0.0, 1.0));
vec3 rainGoldColour = mix(vec3(0.38, 0.20, 0.055), vec3(0.88, 0.65, 0.25), clamp(rainLum * 1.8, 0.0, 1.0));
diffuseColor.rgb = mix(rainSteel, rainGoldColour, rainGold);`)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor, 0.25, 0.4);")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.94, 0.88, rainGold);")
          .replace("#include <emissivemap_fragment>", /* glsl */ `#include <emissivemap_fragment>
float rainEdge = (1.0 - smoothstep(0.0, 0.08, rainGrain - rainDecay)) * step(0.001, rainDecay);
totalEmissiveRadiance += vec3(0.8, 0.55, 0.12) * rainEdge;
// One accent: the giant blade glows gold from landing until it dissolves.
float rainGiant = step(${METAL_RAIN_CAPACITY - 0.5}, vRainSeed) * smoothstep(${METAL_RAIN.giantBirth}, ${METAL_RAIN.climax}, uRainTime) * (1.0 - 0.5 * smoothstep(${METAL_RAIN.dissolve}, ${METAL_RAIN.end - 0.1}, uRainTime));
totalEmissiveRadiance += vec3(0.75, 0.5, 0.14) * rainGiant * (0.55 + 0.45 * smoothstep(0.6, 0.0, vRainLocal.y));`)
          .replace("#include <dithering_fragment>", "#include <dithering_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.9));"));
      };
      material!.customProgramCacheKey = () => "metal-rain-433f-" + this.look;
      }
      mesh = new THREE.InstancedMesh(geometry, material, METAL_RAIN_CAPACITY);
      mesh.name = "fx-metal-rain-swords"; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 9;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      const layer = new EnergyASwordLayer(mesh, this.time, METAL_RAIN_CAPACITY, { birth: METAL_RAIN.giantBirth, impact: METAL_RAIN.climax },
        { geometry: giantGeometry!, material: giantMaterial! }); artLayer = layer;
      const sword = await new THREE.TextureLoader().loadAsync(base + "metal-ult/energy-sword-a.png");
      textures.add(sword);
      if (this.disposed) return;
      sword.colorSpace = THREE.SRGBColorSpace; sword.generateMipmaps = false; sword.minFilter = THREE.LinearFilter;
      sword.magFilter = THREE.LinearFilter; sword.wrapS = THREE.ClampToEdgeWrapping; sword.wrapT = THREE.ClampToEdgeWrapping;
      const aura = await new THREE.TextureLoader().loadAsync(base + "metal-ult/giant-sword-aura-c.png");
      textures.add(aura);
      if (this.disposed) return;
      aura.colorSpace = THREE.SRGBColorSpace; aura.generateMipmaps = false; aura.minFilter = THREE.LinearFilter;
      aura.magFilter = THREE.LinearFilter; aura.wrapS = THREE.ClampToEdgeWrapping; aura.wrapT = THREE.ClampToEdgeWrapping;
      layer.attach(sword, aura);
      for (const t of textures) { t.anisotropy = 4; this.host.upload?.(t); this.textures.add(t); }
      this.mesh = mesh; this.lookLayer = artLayer;
      retained = true;
    } finally {
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
      if (!retained) {
        giantGeometry?.dispose(); artLayer?.dispose(); mesh?.removeFromParent(); mesh?.dispose(); geometry?.dispose(); material?.dispose();
        for (const t of textures) { this.textures.delete(t); t.dispose(); }
      }
    }
  }
  cast(): MetalUltReport {
    this.clear(); void this.prepare(); this.t = 0; this.time.value = 0; this.group.visible = true;
    this.host.caster(this.origin); this.host.hand(this.hand);
    const targets = this.host.targets;
    if (this.hit.length < targets.size) this.hit = new Uint8Array(targets.size);
    this.hit.fill(0); this.eligible.length = 0; this.centre.set(0, 0, 0);
    for (let i = 0; i < targets.size; i++) {
      if (!targets.alive(i) || Math.hypot(targets.x(i) - this.origin.x, targets.z(i) - this.origin.z) > METAL_RAIN.reach) continue;
      this.eligible.push(i); this.centre.x += targets.x(i); this.centre.z += targets.z(i);
    }
    if (this.eligible.length > 0) this.centre.multiplyScalar(1 / this.eligible.length);
    else this.centre.copy(this.origin).add(this.at.set(0, 0, -10));
    this.centre.y = METAL_RAIN.height;
    this.radius = METAL_RAIN.sealDiameter / 2;
    const rain: MetalRainReport = { waveCounts: METAL_RAIN.waves.map(() => 0), waveTimes: METAL_RAIN.waves.map(() => -1), targeted: 0, scatter: 0,
      impacts: 0, hitEvents: 0, giantAt: -1, activeSwords: 0, maxActiveSwords: 0, rainDurationS: 0, smallTotal: METAL_RAIN_CAPACITY - 1,
      landingScreen: { left: 0, right: 0, widthFraction: 0, plantedWidthFraction: 0 }, returned: 0, capacity: METAL_RAIN_CAPACITY,
      sealHeightM: METAL_RAIN.height, sealDiameterM: this.sealDiameter, fallingSwords: 0,
      swordHeightM: METAL_RAIN.swordHeight, giantHeightM: METAL_RAIN.giantHeight, fallDurationS: METAL_RAIN.fallDuration,
      trailLengthM: [METAL_RAIN.swordHeight[0] * 0.8, METAL_RAIN.giantHeight * METAL_TRAIL_D.peakLengthRatio],
      trailWidthM: [METAL_RAIN.swordHeight[0] * 0.8 * 128 / 750, METAL_RAIN.giantHeight * METAL_TRAIL_D.peakLengthRatio * 128 / 750],
      groundMarkM: [2.9 * METAL_RAIN.groundScale, 12],
      sealCentre: { x: this.centre.x, y: METAL_RAIN.height, z: this.centre.z }, sealOpacity: 0,
      sealScreen: { width: 1280, height: 720, left: 0, top: 0, right: 0, bottom: 0, topFraction: 0,
        inside: false, clearOfCaption: false, captionBottom: 0 },
      raysScreen: { left: 0, top: 0, right: 0, bottom: 0, inside: false },
      worldGeometry: { sealNormalY: -1, crossedRibbons: true, fixedAnchor: true, swayDeg: 0 },
      casterScreen: { x: 0, top: 0, bottom: 0, inside: false } };
    this.sealCentre.copy(this.centre);
    let wave = 0, offset = 0;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k]!, giant = k === METAL_RAIN_CAPACITY - 1;
      if (!giant && k - offset >= METAL_RAIN.perWave[wave]!) { offset += METAL_RAIN.perWave[wave]!; wave++; }
      const j = k - offset;
      s.wave = giant ? -1 : wave; s.state = 0; s.target = -1;
      s.birth = giant ? METAL_RAIN.giantBirth : METAL_RAIN.waves[wave]! + j / (METAL_RAIN.perWave[wave]! - 1) * METAL_RAIN.waveSpan[wave]!;
      s.impact = giant ? METAL_RAIN.climax : s.birth + METAL_RAIN.fallDuration[0] + hash(k + 6) * (METAL_RAIN.fallDuration[1] - METAL_RAIN.fallDuration[0]);
      s.fade = giant ? METAL_RAIN.dissolve : s.impact + METAL_RAIN.plantedFade;
      s.end = giant ? METAL_RAIN.end - 0.1 : s.impact + METAL_RAIN.plantedLife;
      if (!giant) rain.rainDurationS = Math.max(rain.rainDurationS, s.impact - METAL_RAIN.waves[0]);
      s.length = giant ? rain.giantHeightM : METAL_RAIN.swordHeight[0] + hash(k + 8) * (METAL_RAIN.swordHeight[1] - METAL_RAIN.swordHeight[0]);
      s.trail = giant ? METAL_RAIN.trailLength[1] : METAL_RAIN.trailLength[0] + hash(k + 11) * (METAL_RAIN.trailLength[1] - METAL_RAIN.trailLength[0]);
      s.yaw = hash(k + 9) * Math.PI * 2; s.lean = 0.06 + hash(k + 10) * 0.10; s.y = METAL_RAIN.height;
      s.startX = 0; s.startY = 0; s.startZ = 0; s.dx = 0; s.dy = 1; s.dz = 0;
      // One stratified disk per wave, rotated between waves; targets cannot collapse its spacing.
      const angle = j * 2.3999632297 + wave * 0.85, r = Math.sqrt((j + 0.5) / METAL_RAIN.perWave[wave]!) * this.radius * 0.97;
      s.x = giant ? this.centre.x : this.centre.x + Math.cos(angle) * r;
      s.z = giant ? this.centre.z : this.centre.z + Math.sin(angle) * r;
      if (!giant && j < METAL_RAIN.perWave[wave]! * METAL_RAIN.targeted) {
        let nearest = 1.8;
        for (const i of this.eligible) {
          const distance = Math.hypot(targets.x(i) - s.x, targets.z(i) - s.z);
          if (distance < nearest && !this.slots.slice(offset, k).some(prior => prior.target === i)) { nearest = distance; s.target = i; }
        }
      }
      // 433r owner: turn the giant about its long axis so the blade's broad engraved face (local ±X normal) faces the caster/play camera.
      if (giant) s.yaw = Math.atan2(-(this.origin.z - s.z), this.origin.x - s.x) + GIANT_FACE_YAW;
      if (!giant) { if (s.target >= 0) rain.targeted++; else rain.scatter++; }
    }
    if (this.mesh !== null) {
      const decay = this.mesh.geometry.getAttribute("iDissolve") as THREE.InstancedBufferAttribute;
      this.slots.forEach((s, i) => decay.setXY(i, s.fade, s.end)); decay.needsUpdate = true;
    }
    this.last = { mode: "rain", rain, clock: 0, bound: 0, broken: 0, kills: 0, cancelled: 0, releaseAt: 0.6,
      firstBindAt: -1, firstBreakAt: Math.min(...this.slots.map(s => s.impact)), lastBreakAt: METAL_RAIN.climax,
      clusters: METAL_RAIN.waves.length, clusterHeightM: [METAL_RAIN.height, METAL_RAIN.height], meshDraws: this.cards.length + (this.formation === null ? 0 : 1), bindDraws: 0,
      bindInstancesPerFoe: { ring: 0, blades: 0, fragments: 0, sparks: 0 }, tintedFoes: 0, activeTints: 0, truncatedBinds: 0,
      assetsReady: this.ready, soundWired: this.host.sound !== undefined,
      soundEvents: { gather: 0, grow: 0, crack: 0, break: 0, tail: 0 }, swordInstances: 0, swordTriangles: 0, swordLoadError: this.loadError };
    this.sound("gather", this.hand); this.draw(); return this.last;
  }
  /** Bias the shot toward the caster; targeting and the finale retain the original combat centre. */
  cameraCentre(out: THREE.Vector3): void {
    out.lerpVectors(this.origin, this.centre, 0.65); out.y = 3;
    if (this.formation !== null) {
      out.x += (this.centre.x - this.origin.x) * 0.1; out.z = this.centre.z - 3.5; out.y = 4;
    }
  }
  /** Reserve one world-space cylinder for the complete shot, then keep that anchor in every view. */
  private fitFormation(camera: THREE.PerspectiveCamera, top: number): void {
    const awayX = this.centre.x - this.origin.x, awayZ = this.centre.z - this.origin.z;
    const away = Math.hypot(awayX, awayZ) || 1;
    const preferredX = this.centre.x;
    const preferredZ = this.centre.z;
    let input = this.polygonA, output = this.polygonB, n = 4, originalInside = true;
    input[0]!.set(-500, -500); input[1]!.set(500, -500); input[2]!.set(500, 500); input[3]!.set(-500, 500);
    const c = this.fitCamera, reference = this.havePlayCamera ? this.playCamera : camera;
    c.copy(reference, false); c.parent = null;
    reference.matrixWorld.decompose(this.fitStart, this.fitStartQ, this.scale);
    this.cameraCentre(this.at);
    const distance = this.fitStart.distanceTo(this.at);
    this.hand.set(0, 0, -1).applyQuaternion(this.fitStartQ);
    const tilt = Math.asin(THREE.MathUtils.clamp(-this.hand.y, -1, 1)) - THREE.MathUtils.degToRad(METAL_RAIN_CAMERA.lowerAngleDeg);
    this.fitEnd.subVectors(this.fitStart, this.at); this.fitEnd.y = 0; this.fitEnd.normalize();
    this.fitEnd.multiplyScalar(distance * METAL_RAIN_CAMERA.distanceRatio * Math.cos(tilt));
    this.fitEnd.y = distance * METAL_RAIN_CAMERA.distanceRatio * Math.sin(tilt); this.fitEnd.add(this.at);
    this.fitEndQ.setFromRotationMatrix(this.fitLook.lookAt(this.fitEnd, this.at, c.up));
    const fov = reference.fov, radius = this.sealDiameter / 2 + 0.27;
    if (this.formation !== null) {
      // 433j: one fixed source behind the herd, shared by both cameras and every sword path.
      // 433l: directly above the strike zone (433j's behind offset removed).
      void away; this.sealCentre.set(preferredX, METAL_RAIN.height, preferredZ);
      this.fitted = true; return;
    }
    // The helper uses linear position/FOV and quaternion slerp against its eased weight.
    for (let sample = 0; sample <= 16; sample++) {
      const k = sample / 16;
      c.position.lerpVectors(this.fitStart, this.fitEnd, k); c.quaternion.slerpQuaternions(this.fitStartQ, this.fitEndQ, k);
      c.fov = THREE.MathUtils.lerp(fov, METAL_RAIN_CAMERA.fovDeg, k); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
      const e = this.clipMatrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements;
      for (const y of [0.05, METAL_RAIN.height]) for (let edge = 0; edge < 6; edge++) {
        const axis = edge < 2 ? 0 : edge < 4 ? 1 : 2, sign = edge % 2 === 0 ? -1 : 1;
        const limit = edge < 2 ? 0.96 : edge === 2 ? 0.96 : edge === 3 ? 1 - 2 * top : 1;
        const a = sign * e[axis]! - limit * e[3]!, b = sign * e[axis + 8]! - limit * e[11]!;
        const d = (sign * e[axis + 4]! - limit * e[7]!) * y
          + sign * e[axis + 12]! - limit * e[15]! + radius * Math.hypot(a, b);
        if (a * preferredX + b * preferredZ + d > 0) originalInside = false;
        let count = 0;
        for (let i = 0; i < n; i++) {
          const p = input[i]!, q = input[(i + 1) % n]!, u = a * p.x + b * p.y + d, v = a * q.x + b * q.y + d;
          if (u <= 0) output[count++]!.copy(p);
          if ((u <= 0) !== (v <= 0)) output[count++]!.lerpVectors(p, q, u / (u - v));
        }
        n = count; const swap = input; input = output; output = swap;
      }
    }
    this.sealCentre.set(preferredX, METAL_RAIN.height, preferredZ);
    if (!originalInside && n > 0) {
      let distance = Infinity;
      for (let i = 0; i < n; i++) {
        const p = input[i]!, q = input[(i + 1) % n]!, dx = q.x - p.x, dz = q.y - p.y;
        const k = THREE.MathUtils.clamp(((preferredX - p.x) * dx + (preferredZ - p.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const x = p.x + dx * k, z = p.y + dz * k, d = (x - preferredX) ** 2 + (z - preferredZ) ** 2;
        if (d < distance) { distance = d; this.sealCentre.set(x, METAL_RAIN.height, z); }
      }
    }
    this.fitted = true;
  }
  present(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    if (!this.active || this.last?.rain === undefined) {
      this.at.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (this.at.y < -0.8) {
        this.playCamera.copy(camera, false); this.playCamera.matrixWorld.copy(camera.matrixWorld); this.havePlayCamera = true;
      }
      return;
    }
    this.captureCamera.copy(camera, false);
    const rain = this.last.rain, box = rain.sealScreen;
    if (typeof document !== "undefined" && this.caption === null) {
      this.caption = Array.from(document.querySelectorAll("div")).find(el => el.style.position === "fixed"
        && el.style.top === "18px" && el.style.zIndex === "20" && el.style.textAlign === "center") ?? null;
    }
    const captionBottom = this.caption !== null && getComputedStyle(this.caption).visibility !== "hidden" ? this.caption.getBoundingClientRect().bottom : 0;
    const top = Math.max(0.05, (captionBottom + 12) / height);
    if (!this.fitted) this.fitFormation(camera, top);
    if (this.formation !== null && camera.position.y < 4 && camera.position.z > this.origin.z) {
      // Retain the eye-height position behind the caster, with an eased upward glance at the sky.
      // Write the absolute matrices here: calling the host's hooked update recursively would re-enter present().
      const weight = smooth(0, 0.4, this.t) * (1 - smooth(METAL_RAIN.dissolve, METAL_RAIN.end - 0.1, this.t));
      this.behindAim.set(this.origin.x, 1.1, this.origin.z - 22);
      this.behindBaseQ.setFromRotationMatrix(this.fitLook.lookAt(camera.position, this.behindAim, camera.up));
      this.behindAim.set(this.origin.x, 3, this.origin.z - 25);
      this.fitEndQ.setFromRotationMatrix(this.fitLook.lookAt(camera.position, this.behindAim, camera.up));
      camera.quaternion.slerpQuaternions(this.behindBaseQ, this.fitEndQ, weight);
      camera.fov = THREE.MathUtils.lerp(50, 66, weight); camera.updateProjectionMatrix(); camera.updateMatrix();
      if (camera.parent === null) camera.matrixWorld.copy(camera.matrix);
      else camera.matrixWorld.multiplyMatrices(camera.parent.matrixWorld, camera.matrix);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    }
    {
      // 433l: light continuous shake while the rain is dense, a stronger decaying jolt at the giant's landing.
      const dense = THREE.MathUtils.clamp((rain.fallingSwords ?? 0) / 14, 0, 1) * smooth(1.2, 1.8, this.t);
      const jolt = this.t >= METAL_RAIN.climax ? Math.exp(-(this.t - METAL_RAIN.climax) * 6) : 0;
      const amp = 0.05 * dense + 0.45 * jolt, f = this.t * 40;
      this.shakeAt.set(Math.sin(f * 1.3) + 0.5 * Math.sin(f * 2.9), Math.sin(f * 1.7 + 1) + 0.5 * Math.sin(f * 3.3), 0).multiplyScalar(amp / 1.5)
        .applyQuaternion(camera.quaternion);
      rain.shakeM = amp;
      if (amp > 1e-5) {
        camera.matrixWorld.elements[12]! += this.shakeAt.x; camera.matrixWorld.elements[13]! += this.shakeAt.y; camera.matrixWorld.elements[14]! += this.shakeAt.z;
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      }
    }
    const e = this.clipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const radius = this.sealDiameter / 2;
    box.width = width; box.height = height; box.left = Infinity; box.top = Infinity; box.right = -Infinity; box.bottom = -Infinity;
    // Exact perspective extrema of a projected disk: (N-kW)^2 = r^2 * |n-k*w|^2.
    const w = e[3]! * this.sealCentre.x + e[7]! * METAL_RAIN.height + e[11]! * this.sealCentre.z + e[15]!;
    for (let axis = 0; axis < 2; axis++) {
      const n = e[axis]! * this.sealCentre.x + e[axis + 4]! * METAL_RAIN.height + e[axis + 8]! * this.sealCentre.z + e[axis + 12]!;
      const a = w * w - radius * radius * (e[3]! ** 2 + e[11]! ** 2);
      const b = -2 * n * w + 2 * radius * radius * (e[axis]! * e[3]! + e[axis + 8]! * e[11]!);
      const c = n * n - radius * radius * (e[axis]! ** 2 + e[axis + 8]! ** 2);
      const root = Math.sqrt(Math.max(0, b * b - 4 * a * c));
      const low = (-b - root) / (2 * a), high = (-b + root) / (2 * a);
      if (axis === 0) { box.left = (1 + low) * width / 2; box.right = (1 + high) * width / 2; }
      else { box.top = (1 - high) * height / 2; box.bottom = (1 - low) * height / 2; }
    }
    box.topFraction = box.top / height; box.captionBottom = captionBottom;
    box.inside = Number.isFinite(box.top) && box.left >= -1e-5 && box.right <= width + 1e-5 && box.topFraction >= 0.04 - 1e-7 && box.bottom <= height + 1e-5;
    box.clearOfCaption = box.top >= captionBottom + 12 - 1e-5;
    rain.sealCentre.x = this.sealCentre.x; rain.sealCentre.y = METAL_RAIN.height; rain.sealCentre.z = this.sealCentre.z;
    this.host.caster(this.at);
    this.screenPoint.copy(this.at).project(camera);
    rain.casterScreen.x = (this.screenPoint.x + 1) * width / 2; rain.casterScreen.bottom = (1 - this.screenPoint.y) * height / 2;
    this.screenPoint.copy(this.at); this.screenPoint.y += 2.4; this.screenPoint.project(camera);
    rain.casterScreen.top = (1 - this.screenPoint.y) * height / 2;
    rain.casterScreen.inside = rain.casterScreen.x >= 0 && rain.casterScreen.x <= width && rain.casterScreen.top >= 0
      && rain.casterScreen.bottom <= height && this.screenPoint.z > -1 && this.screenPoint.z < 1;
    const landing = rain.landingScreen;
    landing.left = Infinity; landing.right = -Infinity;
    let plantedLeft = Infinity, plantedRight = -Infinity;
    for (const s of this.slots) {
      if (s.wave < 0) continue;
      this.screenPoint.set(s.x, 0.05, s.z).project(camera);
      const x = (1 + this.screenPoint.x) * width / 2;
      landing.left = Math.min(landing.left, x); landing.right = Math.max(landing.right, x);
      if (s.state === 2) { plantedLeft = Math.min(plantedLeft, x); plantedRight = Math.max(plantedRight, x); }
    }
    landing.widthFraction = (Math.min(width, landing.right) - Math.max(0, landing.left)) / width;
    landing.plantedWidthFraction = Math.max(0, Math.min(width, plantedRight) - Math.max(0, plantedLeft)) / width;
    const rays = rain.raysScreen;
    rays.left = Infinity; rays.top = Infinity; rays.right = -Infinity; rays.bottom = -Infinity;
    // A conservative polygon outside the complete cylinder includes crossed ribbon widths.
    const r = (this.formation === null ? radius + 0.24 : radius * 0.83 + 0.275) / Math.cos(Math.PI / 64);
    for (const y of [0.05, METAL_RAIN.height]) for (let i = 0; i < 64; i++) {
      const a = i * Math.PI / 32;
      this.screenPoint.set(this.sealCentre.x + Math.cos(a) * r, y, this.sealCentre.z + Math.sin(a) * r).project(camera);
      const x = (1 + this.screenPoint.x) * width / 2, sy = (1 - this.screenPoint.y) * height / 2;
      rays.left = Math.min(rays.left, x); rays.right = Math.max(rays.right, x);
      rays.top = Math.min(rays.top, sy); rays.bottom = Math.max(rays.bottom, sy);
    }
    rays.inside = rays.left >= 0 && rays.right <= width && rays.top >= Math.max(height * 0.04, captionBottom + 12) && rays.bottom <= height;
    if (this.lookLayer instanceof EnergyASwordLayer) this.lookLayer.face(camera, width, height);
    this.trailD.face(camera, width, height, this.mesh);
    this.drawFormation();
  }
  /** Capture-only: normalized-geometry tip at local y=0; alpha matches the qi tip floor. */
  captureTips() {
    return { clock: this.last?.clock ?? 0, tips: this.slots.map((s, id) => {
      const u = THREE.MathUtils.clamp((this.t - s.birth) / (s.impact - s.birth), 0, 1);
      const progress = 0.2 * u + 0.8 * u * u;
      this.screenPoint.set(THREE.MathUtils.lerp(s.startX, s.x, progress), s.startY * (1 - progress),
        THREE.MathUtils.lerp(s.startZ, s.z, progress));
      if (this.mesh && (s.state === 1 || s.state === 2)) { this.mesh.getMatrixAt(id, this.matrix); this.screenPoint.setFromMatrixPosition(this.matrix); }
      this.screenPoint.project(this.captureCamera);
      const x = (1 + this.screenPoint.x) / 2, y = (1 - this.screenPoint.y) / 2, depth = this.screenPoint.z;
      this.screenPoint.set(s.x, s.wave < 0 ? -0.1 : -METAL_RAIN.burial * s.length * s.dy, s.z).project(this.captureCamera);
      let axisDot = 1;
      if (this.mesh && s.state === 2) { this.mesh.getMatrixAt(id, this.matrix); this.fallAxis.setFromMatrixColumn(this.matrix, 1).normalize(); axisDot = this.fallAxis.x * s.dx + this.fallAxis.y * s.dy + this.fallAxis.z * s.dz; }
      return { id, giant: s.wave < 0, state: s.state, birth: s.birth, impact: s.impact, x, y, depth,
        contactR: Math.hypot(s.x - this.sealCentre.x, s.z - this.sealCentre.z) / this.radius,
        fallDeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(s.dy, -1, 1))), axisDot,
        alpha: s.wave < 0 ? 1 : 0.85, impactY: (1 - this.screenPoint.y) / 2 };
    }) };
  }
  private drawFormation(): void {
    const fade = smooth(METAL_RAIN.formationIntroS, METAL_RAIN.waves[0], this.t) * (1 - smooth(METAL_RAIN.giantBirth, METAL_RAIN.climax + 0.05, this.t)) * (0.35 + 0.65 * smooth(0, 0.5, this.t)), sway = this.formation === null ? THREE.MathUtils.degToRad(3) * Math.sin((this.t - 1) * 0.8) : 0;
    if (this.last?.rain !== undefined) {
      this.last.rain.worldGeometry.swayDeg = THREE.MathUtils.radToDeg(sway);
      this.last.rain.sealOpacity = (this.formation === null ? 0.9 : 0.45) * fade * (0.94 + 0.06 * Math.sin(this.t * 3));
    }
    this.seal.put(0, this.sealCentre.x, METAL_RAIN.height, this.sealCentre.z, this.sealDiameter, this.sealDiameter,
      0, METAL_RAIN.end, 16, (this.formation === null ? 0.9 : 0.45) * fade * (0.94 + 0.06 * Math.sin(this.t * 3)), sway);
    if (this.formation !== null) this.groundWash.put(0, this.sealCentre.x, 0.045, this.sealCentre.z,
      this.sealDiameter, this.sealDiameter, 0, METAL_RAIN.end, 0, 0.18 * fade * smooth(0, 0.4, this.t), 0);
    for (let i = 0; i < SHAFTS; i++) {
      const a = i / SHAFTS * Math.PI * 2 + sway, radius = this.sealDiameter / 2 * (this.formation === null ? 0.96 : 0.83);
      const length = METAL_RAIN.height - 0.05;
      this.shafts.put(i, this.sealCentre.x + Math.cos(a) * radius, METAL_RAIN.height - length / 2, this.sealCentre.z + Math.sin(a) * radius,
        length * 0.6, length * 0.6, 0, METAL_RAIN.end, 0, 0.16 * fade * (0.85 + 0.15 * Math.sin(this.t * 4 + i)), -Math.PI / 4);
    }
    this.seal.flush(); this.shafts.flush(); this.groundWash.flush();
  }
  private sound(event: MetalLayerSound, at: THREE.Vector3): void {
    this.last!.soundEvents[event]++;
    this.host.sound?.(event, at, 0.96 + ((this.soundTurn++ * 0.6180339) % 1) * 0.08);
  }
  private damage(i: number, x: number, z: number, power: number, role: "primary" | "secondary"): void {
    const targets = this.host.targets;
    if (!targets.alive(i)) return;
    let dx = targets.x(i) - x, dz = targets.z(i) - z;
    if (Math.hypot(dx, dz) < 0.01) { dx = targets.x(i) - this.origin.x; dz = targets.z(i) - this.origin.z; }
    const distance = Math.hypot(dx, dz) || 1;
    if (this.host.blow(i, dx / distance, dz / distance, power, role)) this.last!.kills++;
    if (this.hit[i] === 0) { this.hit[i] = 1; this.last!.broken++; }
    this.last!.rain!.hitEvents++;
  }
  update(dt: number): void {
    if (!this.active || !Number.isFinite(dt) || dt < 0) return;
    this.t = this.t + dt >= METAL_RAIN.end - 1e-9 ? METAL_RAIN.end : this.t + dt; this.time.value = this.t;
    const r = this.last!, rain = r.rain!, targets = this.host.targets; r.clock = this.t;
    if (!this.released && this.t + 1e-9 >= 0.6) {
      this.released = true; this.host.release(this.origin, r.firstBreakAt - 0.6);
    }
    let impactSound = false;
    for (const s of this.slots) {
      if (s.state === 2 && this.t >= s.end) s.state = 3;
      if (s.state === 0 && this.t + 1e-9 >= s.birth) {
        s.state = 1; rain.activeSwords++;
        if (s.target >= 0 && targets.alive(s.target)) { s.x = targets.x(s.target); s.z = targets.z(s.target); }
        {
          // 433l: contacts stay inside A's ground projection; swords drop near-vertically from under A.
          let x = s.x - this.sealCentre.x, z = s.z - this.sealCentre.z;
          const d = Math.hypot(x, z), cap = this.radius * 0.98;
          if (d > cap) { x *= cap / d; z *= cap / d; s.x = this.sealCentre.x + x; s.z = this.sealCentre.z + z; }
          const sourceY = METAL_RAIN.height - 0.15;
          const lean = s.wave < 0 ? 0 : Math.tan(THREE.MathUtils.degToRad(3 + hash(s.birth * 97) * (METAL_RAIN.maxLeanDeg - 3))) * sourceY;
          const dir = Math.hypot(x, z) > 0.3 ? Math.atan2(z, x) : s.yaw;
          const sourceX = s.x - Math.cos(dir) * lean, sourceZ = s.z - Math.sin(dir) * lean;
          const distance = Math.hypot(sourceX - s.x, sourceY, sourceZ - s.z);
          s.dx = (sourceX - s.x) / distance; s.dy = sourceY / distance; s.dz = (sourceZ - s.z) / distance;
          s.startY = METAL_RAIN.height + METAL_RAIN.launchAboveSeal;
          s.startX = s.x + (sourceX - s.x) * s.startY / sourceY;
          s.startZ = s.z + (sourceZ - s.z) * s.startY / sourceY;
        }
        if (s.wave >= 0) {
          if (rain.waveCounts[s.wave] === 0) { rain.waveTimes[s.wave] = s.birth; this.at.set(this.centre.x, METAL_RAIN.height, this.centre.z); this.sound("grow", this.at); }
          rain.waveCounts[s.wave] = rain.waveCounts[s.wave]! + 1;
        } else { this.at.copy(this.centre); this.sound("grow", this.at); }
      }
      if (s.state === 1 && this.t + 1e-9 >= s.impact) {
        s.state = 2; rain.impacts++;
        this.at.set(s.x, 0.06, s.z);
        if (s.wave < 0) {
          rain.giantAt = s.impact; this.host.strike(this.at, "primary"); this.sound("break", this.at); this.sound("crack", this.at); this.sound("tail", this.at);
          // Preserve the former field-wide damage path on the finale, over the selected living foes.
          for (const i of this.eligible) this.damage(i, this.centre.x, this.centre.z, 1, "secondary");
        } else {
          const target = targets.nearest(s.x, s.z, 1.8);
          if (target >= 0) this.damage(target, s.x, s.z, 0.7, "secondary");
          impactSound = true;
        }
      }
    }
    // Group contacts in 50 ms buckets, never one overlapping voice per sword.
    if (impactSound && this.t >= this.nextImpactSound) { this.sound("crack", this.centre); this.nextImpactSound = this.t + 0.05; }
    this.draw(); this.syncReport();
    if (this.t >= METAL_RAIN.end) this.clear();
  }
  // 433n: wave A scales 0.3->1 in 0.35 s then fades 0.6 s; cracks B glow 0.8 s, cool 1.2 s, lines linger.
  private drawImpactGround(x: number, z: number, impact: number, age: number, yaw: number): void {
    const R = METAL_RAIN.sealDiameter / 2, card = 1.4 * R / IMPACT_ART_FILL;
    if (age < 0.95) {
      const grow = 0.3 + 0.7 * smooth(0, 0.35, age);
      this.waveA.put(0, x, 0.06, z, card * grow, card * grow, impact, 1.35, 0, IMPACT_WAVE.opacity * (1 - smooth(0.35, 0.95, age)), yaw + 0.6);
    }
    const crack = card * 0.85, cool = smooth(4.1, 5.3, age); // 433p: glow holds 1.1 s + the giant's extra 3 s, cools 1.2 s.
    if (age < 5.3) {
      (this.crackGlowB.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(
        THREE.MathUtils.lerp(IMPACT_CRACK.glow[0], 0.7, cool), THREE.MathUtils.lerp(IMPACT_CRACK.glow[1], 0.12, cool), THREE.MathUtils.lerp(IMPACT_CRACK.glow[2], 0.03, cool));
      this.crackGlowB.put(0, x, 0.045, z, crack, crack, impact, 5.7, 0, smooth(0, 0.05, age) * (1 - cool), yaw);
    }
    if (age < 5.9) {
      const c = THREE.MathUtils.lerp(1, 0.32, cool);
      (this.crackB.mesh.material.uniforms.uTint!.value as THREE.Color).setRGB(c, c * THREE.MathUtils.lerp(1, 0.7, cool), c * THREE.MathUtils.lerp(1, 0.6, cool));
      this.crackB.put(0, x, 0.04, z, crack, crack, impact, 6.3, 0, IMPACT_CRACK.lines * smooth(0, 0.05, age) * (1 - smooth(5.3, 5.9, age)), yaw);
    }
  }
  // 433t: 2-4 staggered single glow flashes inside the giant's dust cloud; each plays ~0.4 s of clip C's soft glow once.
  // At most one per ult (seeded, ~50 %) uses the later frames with a faint branch.
  private drawDustArcs(x: number, z: number, birth: number, age: number): void {
    const count = 2 + Math.floor(hash(720) * 3), branch = hash(721) < 0.5 ? Math.floor(hash(722) * count) : -1;
    for (let i = 0; i < count; i++) {
      const start = 0.05 + i * 0.26 + hash(i * 7 + 730) * 0.12, life = DUST_GLOW.life[0] + hash(i * 7 + 731) * (DUST_GLOW.life[1] - DUST_GLOW.life[0]);
      const a = age - start; if (a < 0 || a >= life) continue;
      const u = a / life, ang = hash(i * 7 + 732) * 6.283, r = 1 + hash(i * 7 + 733) * 3.5, size = DUST_GLOW.size * (0.8 + hash(i * 7 + 734) * 0.4);
      const frame = i === branch ? DUST_GLOW.branchFirst + Math.min(2, Math.floor(u * 3))
        : Math.min(DUST_GLOW.glowFrames - 1, Math.floor(6 + hash(i * 7 + 735) * 8 + u * 8));
      this.arcs.put(i, x + Math.cos(ang) * r, 4 + hash(i * 7 + 736) * 5, z + Math.sin(ang) * r, size, size, birth + start, life,
        frame, DUST_GLOW.opacity * Math.sin(Math.PI * Math.min(1, u * 1.6)) ** 0.7, hash(i * 7 + 737) * 6.283);
    }
  }
  private draw(): void {
    if (!this.active) return;
    for (const c of this.cards) c.clear();
    this.trailD.clear();
    const rain = this.last?.rain;
    this.drawFormation();
    let count = 0, active = 0, falling = 0;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k]!, flying = s.state === 1, planted = s.state === 2;
      const visible = flying || planted;
      const age = Math.max(0, this.t - s.birth), duration = s.impact - s.birth;
      const u = THREE.MathUtils.clamp(age / duration, 0, 1), progress = 0.2 * u + 0.8 * u * u;
      s.y = flying ? s.startY * (1 - progress) : -0.10;
      this.at.set(flying ? THREE.MathUtils.lerp(s.startX, s.x, progress) : s.x, s.y,
        flying ? THREE.MathUtils.lerp(s.startZ, s.z, progress) : s.z);
      this.fallAxis.set(s.dx, s.dy, s.dz); this.fallRotation.setFromUnitVectors(this.up, this.fallAxis);
      this.yaw.setFromAxisAngle(this.up, s.yaw); this.fallRotation.multiply(this.yaw);
      this.plantedRotation.setFromAxisAngle(this.side, -s.lean).multiply(this.yaw);
      // 433l: planted swords keep their exact fall angle (no re-uprighting).
      if (s.wave >= 0) this.rotation.copy(this.fallRotation);
      else this.rotation.slerpQuaternions(this.fallRotation, this.plantedRotation, planted ? smooth(s.impact, s.impact + 0.1, this.t) : 0);
      if (s.wave >= 0) {
        // Sink 15% of A's anchored length along its planted axis, easing through contact.
        this.fallAxis.copy(this.up).applyQuaternion(this.rotation);
        const burial = METAL_RAIN.burial * s.length * smooth(s.impact - 0.06, s.impact + 0.1, this.t);
        this.at.addScaledVector(this.fallAxis, -burial); this.at.y = (flying ? s.y : 0) - this.fallAxis.y * burial;
      }
      this.scale.set(visible ? s.length : 0, visible ? s.length : 0, visible ? s.length : 0);
      this.mesh?.setMatrixAt(k, this.matrix.compose(this.at, this.rotation, this.scale));
      if (visible) { count = k + 1; active++; }
      if (visible && this.t < s.impact + METAL_TRAIL_D.fadeSeconds) {
        // Length follows normalized fall speed within the requested readable screen range.
        const ratio = THREE.MathUtils.clamp(METAL_TRAIL_D.peakLengthRatio * (0.2 + 1.6 * u) / 1.8, 0.8, 1.4);
        this.fallAxis.set(0, 1, 0).applyQuaternion(this.rotation);
        this.at.addScaledVector(this.fallAxis, s.length); // local y=1: exact upper hilt tip.
        if (!planted) this.fallAxis.set(s.dx, s.dy, s.dz);
        const opacity = 0.9 * smooth(0, 0.04, age) * (1 - smooth(s.impact, s.impact + METAL_TRAIL_D.fadeSeconds, this.t));
        this.trailD.put(k, this.at, this.fallAxis, s.length * ratio, opacity, ratio);
      }
      if (flying) {
        falling++;
        if (false) {
        const length = Math.min(s.trail, Math.hypot(s.startX - s.x, s.startY, s.startZ - s.z) * progress);
        this.fallAxis.set(s.dx, s.dy, s.dz); this.at.addScaledVector(this.fallAxis, s.length - 0.12 + length / 2);
        this.trails.put(k, this.at.x, this.at.y, this.at.z, s.wave < 0 ? 2.4 : 1.25, length,
          s.birth, duration, 8, 0.85 * smooth(0, 0.04, age), s.yaw);
        this.trails.aim(k, s.dx, s.dy, s.dz);
        }
      }
      const impactAge = this.t - s.impact;
      if (planted && s.wave >= 0) {
        // 433l: old small-sword contact layers are kept in code below but no longer called for small swords.
        if (impactAge < 0.5) this.smoke.put(k, s.x, 0.62, s.z, 0.62, 1.24, s.impact, 0.5, impactAge / 0.5 * 40, 0.75);
        if (impactAge < 0.4) this.sparkle.put(k, s.x, 0.45, s.z, 1.3, 1.3, s.impact, 0.4, 6 + impactAge / 0.4 * 30, 0.75, hash(k + 300) * 6.28);
      }
      // 433n owner: dust blast 65 % size (uniform), 0.6x opacity.
      // 433o owner: wave A reads first; the dust rises 0.25 s after impact.
      if (planted && s.wave < 0 && impactAge >= 0.25 && impactAge < 1.55) this.blast.put(0, s.x, 6.5, s.z, 17, 17, s.impact + 0.25, 1.3, Math.min(24, (impactAge - 0.25) / 1.3 * 25), 0.85 * 0.6);
      if (planted && s.wave < 0 && impactAge >= 0.25 && impactAge < 1.55) this.drawDustArcs(s.x, s.z, s.impact + 0.25, impactAge - 0.25);
      if (planted && s.wave < 0) this.drawImpactGround(s.x, s.z, s.impact, impactAge, s.yaw);
      if (s.wave >= 0) continue;
      if (planted && impactAge < 1.1) this.impacts.put(k, s.x, 0.35, s.z, s.wave < 0 ? 5.5 : 1.5, s.wave < 0 ? 5.5 : 1.5,
        s.impact, 1.1, impactAge / 1.1 * (this.impacts.meta.frames - 1), 0.6);
      if (planted && impactAge < (s.wave < 0 ? 1.6 : 1.5)) this.ground.put(k, s.x, 0.035, s.z,
        (s.wave < 0 ? 12 : 2.9 * METAL_RAIN.groundScale), (s.wave < 0 ? 12 : 2.9 * METAL_RAIN.groundScale),
        s.impact, s.wave < 0 ? 1.6 : 1.5, 8, s.wave < 0 ? 0.85 : 0.55, s.yaw);
      if (planted && s.wave < 0) this.burst.put(0, s.x, 1.2, s.z, 8, 8, METAL_RAIN.climax, 1.6,
        impactAge * this.burst.meta.fps, 0.85);
      for (let j = 0; j < SPARKS_PER_SWORD && planted && impactAge < 0.5; j++) {
        const n = k * SPARKS_PER_SWORD + j, angle = hash(n + 153) * Math.PI * 2, speed = s.wave < 0 ? 3.8 : 1.6;
        this.sparks.put(n, s.x, 0.15, s.z, 0.18 + hash(n + 154) * 0.15, 0.5, s.impact, 0.5, j % 2 === 0 ? 9 : 10, 0.9,
          angle, Math.cos(angle) * speed, 1.2 + hash(n + 155), Math.sin(angle) * speed);
      }
      for (let j = 0; j < DUST_PER_SWORD && planted; j++) {
        const n = k * DUST_PER_SWORD + j, angle = hash(n + 83) * Math.PI * 2, birth = s.fade - 0.15 + hash(n + 84) * 0.25;
        const glint = j % 3 === 0, size = glint ? 0.3 : 0.8 + hash(n + 85) * 0.5;
        this.dust.put(n, s.x + Math.cos(angle) * 0.4, s.length * (0.1 + hash(n + 86) * 0.85), s.z + Math.sin(angle) * 0.4,
          size, size, birth, s.end - birth, glint ? 9 : 10, 0.32 * smooth(birth, birth + 0.12, this.t), angle,
          Math.cos(angle) * 0.65, 0.6, Math.sin(angle) * 0.65);
      }
    }
    this.dim.material.uniforms.uOpacity!.value = 0.22 * smooth(0.3, 0.9, this.t) * (1 - smooth(METAL_RAIN.dissolve, METAL_RAIN.end - 0.1, this.t));
    if (rain !== undefined) { rain.plantedSwords = this.slots.filter(s => s.state === 2 && s.wave >= 0).length; rain.maxPlanted = Math.max(rain.maxPlanted ?? 0, rain.plantedSwords); rain.maxFalling = Math.max(rain.maxFalling ?? 0, falling); }
    if (this.mesh !== null) { this.mesh.count = count; this.mesh.instanceMatrix.needsUpdate = true; }
    this.lookLayer?.sync(count);
    for (const c of this.cards) c.flush();
    if (rain !== undefined) { rain.activeSwords = active; rain.maxActiveSwords = Math.max(rain.maxActiveSwords, active); rain.fallingSwords = falling;
      rain.returned = this.slots.filter(s => s.state === 3).length; }
  }
  private syncReport(): void {
    if (this.last === null) return;
    this.last.assetsReady = this.ready; this.last.swordLoadError = this.loadError;
    this.last.swordInstances = this.last.rain?.activeSwords ?? 0;
    const giantVisible = this.slots[METAL_RAIN_CAPACITY - 1]!.state === 1 || this.slots[METAL_RAIN_CAPACITY - 1]!.state === 2;
    this.last.swordTriangles = (giantVisible ? this.triangles : 0) + Math.max(0, this.last.swordInstances - (giantVisible ? 1 : 0)) * 2;
  }
  clear(): void {
    this.t = -1; this.time.value = -1; this.group.visible = false; this.fitted = false; this.released = false; this.soundTurn = 0; this.nextImpactSound = 0;
    for (const c of this.cards) c.clear();
    this.trailD.clear();
    if (this.mesh !== null) this.mesh.count = 0;
    this.lookLayer?.sync(0);
    for (const s of this.slots) s.state = 3;
    if (this.last?.rain !== undefined) { this.last.rain.activeSwords = 0; this.last.rain.fallingSwords = 0; this.last.rain.returned = METAL_RAIN_CAPACITY; }
    this.syncReport();
  }
  dispose(): void {
    if (captureRain === this) captureRain = null;
    this.clear(); this.disposed = true;
    for (const c of this.cards) c.dispose();
    this.trailD.dispose();
    this.lookLayer?.dispose(); this.lookLayer = null;
    if (this.mesh !== null) { this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    for (const t of this.textures) t.dispose(); this.textures.clear();
    this.group.removeFromParent(); this.ready = false; this.syncReport();
  }
}
