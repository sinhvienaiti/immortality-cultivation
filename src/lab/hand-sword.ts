/**
 * The equipped weapon in the caster's right hand (skills lab, dev-only, never
 * built; owner 02/11/2026: the Clear Wind Tripo test model). The full GLB with
 * its own PBR maps (base colour, normal, roughness and metalness from the ORM
 * map: MODEL_QUALITY §2 rule 3), not the flying blades' shared steel, held in
 * the fist along the hand at `WeaponHold.lengthM`, with its tassel (tassel.ts).
 *
 * The pale-jade core glows through the weapon's glow: a soft emissive on the
 * jade only (a hue mask on the colour map, ≤ 0.9 a channel, never blooms)
 * that breathes at rest and rises with the typing (KiemFx.presence), and a
 * thin HDR line down the blade's ridge (3–6, the only part that blooms) while
 * a word is typed and at each release (bloom rules, VFX_STANDARD §3.5).
 *
 * While the weapon itself is out (KiemFx.handAway: Phi Kiếm throws it, Nhất
 * Tuyến drives it down its line) it melts into light from the tip (a noisy
 * dissolve with an HDR edge, shadow included) and the tassel draws in; it
 * re-forms from the pommel when it comes back. Lam's clips are unarmed, so
 * the wrist turns the sword round its grip to keep it out of the body
 * (keepClear, body-proxy.ts; review 03/11/2026). No allocation per frame.
 */
import * as THREE from "three";
import { loadWeaponModel } from "../view/skills/blades";
import type { KiemFx } from "../view/skills/kiem";
import type { WeaponDef, WeaponHold } from "../view/skills/weapons";
import { Tassel } from "./tassel";
import type { BodyProxy } from "./body-proxy";
import { HERO } from "./hero-select";

/**
 * How the grip sits in the fist (hand_r's frame: +Y wrist → fingers, +Z the thumb side; Lam and the Mesh2Motion
 * human share the convention, each with its own grip in its hero profile, hero-select.ts).
 */
export interface GripPose {
  /** Grip centre in the hand's frame (m). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The tip turned from the thumb side (+Z) toward the fingers (+Y), degrees. */
  readonly tiltDeg: number;
  /** Turn of the blade's flat round its own axis, degrees (0: the flat faces the palm, edges along the fingers). */
  readonly rollDeg: number;
  /** Turn of the blade round the fingers' axis (+Y), degrees (swings it toward the palm or the back of the hand). */
  readonly yawDeg: number;
}

/** The shown hero's grip (Lam's was tuned on the round-3 frame sheets: the blade forward and a little down). */
export const DEFAULT_GRIP: GripPose = HERO.grip;

/** Dissolve out (thrown) and back in (s). */
const OUT_S = 0.1;
const IN_S = 0.24;
/** Jade glow levels (× the motif's jade, ≤ 0.86): rest, breathing swing, the typing's share. */
const JADE_REST = 0.32;
const JADE_BREATH = 0.06;
const JADE_CHARGE = 0.5;
/** Ridge core (HDR, blooms): full while a word is typed, and the blaze at a release (both within 3–6). */
const CORE_CHARGE = 3.2;
const CORE_BLAZE = 4.6;
const BLAZE_FALL_S = 0.35;
/** HDR edge of the dissolve. */
const EDGE_K = 3.4;
/**
 * Body clearance (review 03/11/2026: Lam's clips are unarmed, and the sword rigid in the fist crossed the satchel
 * at rest and the head at a walk or run in half the frames): the wrist turns the sword round the grip, as little
 * as it can, so its samples stay out of the body's capsules (BodyProxy) and above the paving; the turn eases back
 * to the hand's own when the way is clear. Samples: the pommel's end, the guard, five along the blade.
 */
const SAMPLES = 7;
const CLEAR_ITER = 6;
const RELAX_S = 0.22;
const MAX_DEV_RAD = (85 * Math.PI) / 180;
/** Fastest the clearance turn and roll change (rad/s: 10° a frame at 60 Hz; the hand's own sword turns up to ~23°). */
const DEV_SPEED_RAD = (600 * Math.PI) / 180;
/** The guard's ring starts turning flat to the body this far (m) from it, and its roll eases over ROLL_S. */
const GUARD_NEAR_M = 0.08;
const ROLL_S = 0.08;
/** Paving clearance (m) under every sample. */
const FLOOR_M = 0.02;

const SWORD_PARS = /* glsl */ `
uniform float uSwDissolve;
uniform vec3 uSwEdge;
uniform vec3 uSwJade;
uniform vec3 uSwCore;
uniform vec4 uSwBlade;   // blade start y, tip y, model min y, model max y
uniform vec2 uSwRidge;   // the blade's centre x at its start and near its tip
varying vec3 vSwP;
float swHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float swNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(swHash(i), swHash(i + vec3(1.0, 0.0, 0.0)), u.x), mix(swHash(i + vec3(0.0, 1.0, 0.0)), swHash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(swHash(i + vec3(0.0, 0.0, 1.0)), swHash(i + vec3(1.0, 0.0, 1.0)), u.x), mix(swHash(i + vec3(0.0, 1.0, 1.0)), swHash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
`;

/** The dissolve field (the tip goes first, the pommel last; it returns pommel first) and its discard; sets swE, the edge. */
const SWORD_DISSOLVE = /* glsl */ `
  float swT = clamp((vSwP.y - uSwBlade.z) / max(uSwBlade.w - uSwBlade.z, 1e-4), 0.0, 1.0);
  float swF = (1.0 - swT) * 0.62 + swNoise(vSwP * 48.0) * 0.38;
  float swCut = uSwDissolve * 1.04;
  if (uSwDissolve > 0.0005 && swF < swCut) discard;
  float swE = uSwDissolve > 0.0005 ? 1.0 - smoothstep(0.0, 0.07, swF - swCut) : 0.0;
`;

/**
 * The jade glow only fills the headroom under the bloom threshold (luminance 0.95 with the lit jade under it): the
 * lit pale jade plus 0.86 of glow went over 1 and bloomed the whole core (review 03/11/2026); the ridge's HDR line
 * (added apart, uSwCore) is the only part that blooms.
 */
const SWORD_CAP = /* glsl */ `
  float swBase = dot(outgoingLight - swJadeE, vec3(0.299, 0.587, 0.114));
  float swJl = dot(swJadeE, vec3(0.299, 0.587, 0.114));
  outgoingLight -= swJadeE * (1.0 - min(1.0, max(0.0, 0.95 - swBase) / max(swJl, 1e-4)));
`;

/** The jade mask from the colour map (pale grey-green: green over red, not under blue): measured on the Tripo map. */
const SWORD_JADE = /* glsl */ `
  vec3 swC = diffuseColor.rgb;
  float swJade = smoothstep(0.07, 0.17, (swC.g - swC.r) / max(swC.g, 0.04)) * smoothstep(-0.05, 0.0, swC.g - swC.b);
`;

const SWORD_EMIT = /* glsl */ `
  vec3 swTint = swC / max(max(swC.r, swC.g), max(swC.b, 1e-3));
  vec3 swJadeE = swTint * uSwJade * swJade;
  totalEmissiveRadiance += swJadeE;
  float swOn = smoothstep(uSwBlade.x, uSwBlade.x + 0.05, vSwP.y) * (1.0 - smoothstep(uSwBlade.y - 0.09, uSwBlade.y - 0.015, vSwP.y));
  float swXc = mix(uSwRidge.x, uSwRidge.y, clamp((vSwP.y - uSwBlade.x) / max(uSwBlade.y - uSwBlade.x, 1e-4), 0.0, 1.0));
  float swRidge = (1.0 - smoothstep(0.0022, 0.0065, abs(vSwP.x - swXc))) * swOn;
  totalEmissiveRadiance += uSwCore * swRidge * max(swJade, 0.4);
  totalEmissiveRadiance += uSwEdge * swE;
`;

interface SwordUniforms {
  uSwDissolve: { value: number };
  uSwEdge: { value: THREE.Color };
  uSwJade: { value: THREE.Color };
  uSwCore: { value: THREE.Color };
  uSwBlade: { value: THREE.Vector4 };
  uSwRidge: { value: THREE.Vector2 };
}

function patchSword(material: THREE.MeshStandardMaterial, u: SwordUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = "varying vec3 vSwP;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvSwP = position;");
    shader.fragmentShader =
      SWORD_PARS +
      shader.fragmentShader
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + SWORD_DISSOLVE)
        .replace("#include <map_fragment>", "#include <map_fragment>\n" + SWORD_JADE)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + SWORD_EMIT)
        .replace("#include <opaque_fragment>", SWORD_CAP + "#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => "lab-hand-sword";
  material.needsUpdate = true;
}

/** The shadow pass dissolves with the sword (a thrown sword leaves no shadow in the hand). */
function dissolveDepth(u: SwordUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = "varying vec3 vSwP;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvSwP = position;");
    shader.fragmentShader = SWORD_PARS + shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + SWORD_DISSOLVE);
  };
  m.customProgramCacheKey = () => "lab-hand-sword-depth";
  return m;
}

/** Profile of the aligned GLB (tip +Y): extent along Y, the grip and pommel points, the blade's centre line. Load time. */
function profile(geometry: THREE.BufferGeometry, hold: WeaponHold): { y0: number; y1: number; grip: THREE.Vector3; pommel: THREE.Vector3; bladeY: number; tipY: number; ridge0: number; ridge1: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const y0 = box.min.y;
  const y1 = box.max.y;
  const L = y1 - y0;
  const pos = geometry.getAttribute("position");
  /** Mean x, z of the vertices within `band` of height y (x: the slice's middle, from its extremes). */
  const slice = (y: number, band: number, out: THREE.Vector3): THREE.Vector3 => {
    let minX = Infinity;
    let maxX = -Infinity;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(pos.getY(i) - y) > band) continue;
      const x = pos.getX(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      sz += pos.getZ(i);
      n += 1;
    }
    return n > 0 ? out.set((minX + maxX) / 2, y, sz / n) : out.set(0, y, 0);
  };
  const grip = slice(y0 + hold.gripAt * L, 0.015 * L, new THREE.Vector3());
  const pommel = slice(y0 + Math.max(0.012, hold.pommelAt) * L, 0.012 * L, new THREE.Vector3());
  pommel.y = y0 + hold.pommelAt * L;
  const bladeY = y0 + hold.bladeFrom * L;
  const tipY = y1;
  const r0 = slice(bladeY + 0.05 * L, 0.01 * L, new THREE.Vector3()).x;
  const r1 = slice(tipY - 0.12 * L, 0.01 * L, new THREE.Vector3()).x;
  return { y0, y1, grip, pommel, bladeY, tipY, ridge0: r0, ridge1: r1 };
}

export class HandSword {
  /** Under the hand bone: the grip's middle at its origin, the sword frame turned and scaled into the hand. */
  readonly pivot = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private tassel: Tassel | null = null;
  private weaponId = "";
  private seq = 0;
  private readonly u: SwordUniforms = {
    uSwDissolve: { value: 0 },
    uSwEdge: { value: new THREE.Color() },
    uSwJade: { value: new THREE.Color() },
    uSwCore: { value: new THREE.Color() },
    uSwBlade: { value: new THREE.Vector4() },
    uSwRidge: { value: new THREE.Vector2() },
  };
  /** Drawn dissolve (0 whole … 1 gone) and the jade's colours. */
  private away = 0;
  private readonly jadeUnit = new THREE.Color(1, 1, 1);
  private readonly coreUnit = new THREE.Color(1, 1, 1);
  private time = 0;
  private blaze = 0;
  private releases = -1;
  /** The pommel point in the model's frame (the tassel's pin). */
  private readonly pommel = new THREE.Vector3();
  /** Model-frame probe points (probeSegments): tip, blade start and its half width, guard centre and half width, pommel end. */
  private readonly probe = { tip: new THREE.Vector3(), blade: new THREE.Vector3(), bladeHalf: 0, guard: new THREE.Vector3(), guardHalf: 0, end: new THREE.Vector3(), gripLow: new THREE.Vector3() };
  private readonly pin = new THREE.Vector3();
  private readonly hs = new THREE.Vector3();
  /** Debug and probe read-outs. */
  readonly info = { loaded: false, away: 0, jade: 0, core: 0, lengthM: 0, triangles: 0, tasselReach: 0, tasselStepM: 0, tasselStrandExcessM: 0, pommelStepM: 0, devDeg: 0, maxDevDeg: 0, rollDeg: 0, maps: "" };
  /** The body the sword keeps out of (setBody) and its model (its bones' world matrices are refreshed each frame). */
  private body: BodyProxy | null = null;
  private bodyRoot: THREE.Object3D | null = null;
  /** The grip's own turn in the hand (setGrip), before the body clearance. */
  private readonly gripQ = new THREE.Quaternion();
  /** Clearance samples along the sword: distance from the grip centre (m, + toward the tip) and radius (m). */
  private readonly sampleS = new Float32Array(SAMPLES);
  private readonly sampleR = new Float32Array(SAMPLES);
  /** The clearance turn (world) applied on top of the hand's sword, kept from frame to frame. */
  private readonly qDev = new THREE.Quaternion();
  private readonly qHand = new THREE.Quaternion();
  private readonly qBase = new THREE.Quaternion();
  private readonly g = new THREE.Vector3();
  private readonly aH = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly was = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly pushV = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  /** Lab overrides of the jade and ridge-core levels (≥ 0; −1 off), for the bloom check. */
  readonly force = { jade: -1, core: -1 };
  /** Clearance on (?clear=0 turns it off for a before/after). */
  clearance = true;
  /** The ring's roll toward the body (rad, about the blade), eased. */
  private roll = 0;
  private readonly qRoll = new THREE.Quaternion();
  /** Off: the prop is hidden (?hand=0). */
  enabled = true;

  constructor(
    private readonly hand: THREE.Object3D,
    /** World-space parent of the tassel (its strips are built in world space). */
    private readonly world: THREE.Object3D,
    private grip: GripPose = DEFAULT_GRIP,
  ) {
    this.pivot.name = "handSword";
    hand.add(this.pivot);
  }

  /**
   * Takes the weapon's GLB (cached with the blade geometry) when it has one
   * and a hold; else the hand is empty. Resolves once the prop is in place.
   */
  async setWeapon(def: WeaponDef): Promise<void> {
    const seq = (this.seq += 1);
    if (def.id === this.weaponId && this.mesh !== null) return;
    const gltf = def.hold !== undefined ? await loadWeaponModel(def.model) : null;
    if (seq !== this.seq) return;
    this.clear();
    this.weaponId = def.id;
    const hold = def.hold;
    if (gltf === null || hold === undefined) return;
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (src === null && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (src === null) return;
    const source = src as THREE.Mesh;
    const material = (source.material as THREE.MeshStandardMaterial).clone();
    patchSword(material, this.u);
    const mesh = new THREE.Mesh(source.geometry, material);
    mesh.customDepthMaterial = dissolveDepth(this.u);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.name = "handSwordMesh";
    const pr = profile(source.geometry, hold);
    this.setProbe(source.geometry, pr, hold);
    // The grip's middle at the pivot; the pivot scales model units to metres (under the hand's own scale).
    mesh.position.set(-pr.grip.x, -pr.grip.y, -pr.grip.z);
    this.pommel.copy(pr.pommel);
    this.u.uSwBlade.value.set(pr.bladeY, pr.tipY, pr.y0, pr.y1);
    this.u.uSwRidge.value.set(pr.ridge0, pr.ridge1);
    const k = hold.lengthM / (pr.y1 - pr.y0);
    this.hand.updateWorldMatrix(true, false);
    this.hand.getWorldScale(this.hs);
    this.pivot.scale.setScalar(k / (this.hs.x || 1));
    this.pivot.add(mesh);
    this.mesh = mesh;
    this.material = material;
    this.setGrip(this.grip);
    // The weapon's jade (motif) and its hot core (≤ 30 % white, unit max): pale jade for Clear Wind.
    const jade = def.motif?.jade ?? def.glow.halo;
    const m = Math.max(jade[0], jade[1], jade[2], 1e-3);
    this.jadeUnit.setRGB(jade[0] / m, jade[1] / m, jade[2] / m);
    this.coreUnit.setRGB(0.7 * this.jadeUnit.r + 0.3, 0.7 * this.jadeUnit.g + 0.3, 0.7 * this.jadeUnit.b + 0.3);
    this.u.uSwEdge.value.copy(this.coreUnit).multiplyScalar(EDGE_K);
    if (hold.tassel !== undefined) {
      this.tassel = new Tassel(hold.tassel);
      this.world.add(this.tassel.group);
    }
    const index = source.geometry.getIndex();
    // The original maps, as loaded (MODEL_QUALITY §2: kept, not replaced).
    const size = (t: THREE.Texture | null): string => (t === null ? "none" : `${(t.image as { width?: number } | null)?.width ?? 0}`);
    this.info.maps = `map ${size(material.map)}, normal ${size(material.normalMap)}, roughness ${size(material.roughnessMap)}, metalness ${size(material.metalnessMap)}, emissive ${size(material.emissiveMap)}`;
    this.info.loaded = true;
    this.info.lengthM = hold.lengthM;
    this.info.triangles = (index !== null ? index.count : source.geometry.getAttribute("position").count) / 3;
    this.away = 0;
    this.releases = -1;
  }

  /** Puts the grip in the fist (lab tuning: ?grip=tilt,roll,yaw,x,y,z). */
  setGrip(g: GripPose): void {
    this.grip = g;
    const d = Math.PI / 180;
    // The sword's frame in the hand's: tip (+Y) from the thumb side toward the fingers by `tilt`, the flat (+Z) facing
    // the palm's side (+X), turned by `roll` round the tip and `yaw` round the fingers.
    const t = g.tiltDeg * d;
    const tip = new THREE.Vector3(0, Math.sin(t), Math.cos(t));
    const flat = new THREE.Vector3(1, 0, 0).applyAxisAngle(tip, g.rollDeg * d);
    const edge = new THREE.Vector3().crossVectors(tip, flat);
    const m = new THREE.Matrix4().makeBasis(edge, tip, flat);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yawDeg * d));
    this.gripQ.copy(q);
    this.pivot.quaternion.copy(q);
    const s = this.hs.x || 1;
    this.pivot.position.set(g.x / s, g.y / s, g.z / s);
  }

  get gripPose(): GripPose {
    return this.grip;
  }

  /** The probe points in the model's frame from its width profile (load time; the guard: the widest run below the blade). */
  private setProbe(geometry: THREE.BufferGeometry, pr: ReturnType<typeof profile>, hold: WeaponHold): void {
    const pos = geometry.getAttribute("position");
    const L = pr.y1 - pr.y0;
    const S = 120;
    const w = new Float32Array(S);
    const xc = (pr.ridge0 + pr.ridge1) / 2;
    for (let i = 0; i < pos.count; i += 1) {
      const s = Math.min(S - 1, Math.max(0, Math.floor(((pos.getY(i) - pr.y0) / L) * S)));
      const x = Math.abs(pos.getX(i) - xc);
      if (x > w[s]!) w[s] = x;
    }
    const at = (share: number): number => w[Math.min(S - 1, Math.max(0, Math.floor(share * S)))]!;
    const bladeHalf = at(hold.bladeFrom + 0.04);
    let gBest = -1;
    for (let s = Math.floor(hold.gripAt * S); s < Math.floor(hold.bladeFrom * S); s += 1) if (gBest < 0 || w[s]! > w[gBest]!) gBest = s;
    const gy = pr.y0 + ((gBest + 0.5) / S) * L;
    const p = this.probe;
    // Clearance samples (m from the grip centre): the pommel's end, the guard, the blade from its start to the tip.
    const k = hold.lengthM / L;
    const sS = this.sampleS;
    const sR = this.sampleR;
    sS[0] = (pr.y0 - pr.grip.y) * k;
    sR[0] = 0.035;
    sS[1] = (gy - pr.grip.y) * k;
    sR[1] = Math.min(0.07, w[Math.max(0, gBest)]! * k * 0.7);
    for (let i = 2; i < SAMPLES; i += 1) {
      const f = (i - 2) / (SAMPLES - 3);
      sS[i] = (pr.bladeY + (pr.y1 - pr.bladeY) * f - pr.grip.y) * k;
      sR[i] = 0.012 + bladeHalf * k * (1 - f);
    }
    p.tip.set(pr.ridge1, pr.y1, pr.grip.z);
    p.blade.set(pr.ridge0, pr.bladeY, pr.grip.z);
    p.bladeHalf = bladeHalf * 0.85;
    p.guard.set(xc, gy, pr.grip.z);
    p.guardHalf = w[Math.max(0, gBest)]! * 0.95;
    p.end.set(pr.pommel.x, pr.y0, pr.pommel.z);
    p.gripLow.set(pr.grip.x, pr.grip.y - 0.06 * L, pr.grip.z);
  }

  /**
   * Lab probe (not per frame): world segments of the sword that must stay out of the body: the blade's middle and
   * both edges (blade start → tip), across the guard, and the pommel below the fist. Each entry: part, a, b.
   */
  probeSegments(): { part: string; a: THREE.Vector3; b: THREE.Vector3 }[] {
    const mesh = this.mesh;
    if (mesh === null || !mesh.visible) return [];
    this.pivot.updateWorldMatrix(true, true);
    const m = mesh.matrixWorld;
    const p = this.probe;
    const w = (v: THREE.Vector3, dx = 0): THREE.Vector3 => new THREE.Vector3(v.x + dx, v.y, v.z).applyMatrix4(m);
    return [
      { part: "blade", a: w(p.blade), b: w(p.tip) },
      { part: "edgeL", a: w(p.blade, -p.bladeHalf), b: w(p.tip) },
      { part: "edgeR", a: w(p.blade, p.bladeHalf), b: w(p.tip) },
      { part: "guard", a: w(p.guard, -p.guardHalf), b: w(p.guard, p.guardHalf) },
      { part: "pommel", a: w(p.gripLow), b: w(p.end) },
    ];
  }

  private clear(): void {
    if (this.mesh !== null) {
      this.pivot.remove(this.mesh);
      this.material?.dispose();
      (this.mesh.customDepthMaterial as THREE.Material | undefined)?.dispose();
    }
    if (this.tassel !== null) this.world.remove(this.tassel.group);
    this.mesh = null;
    this.material = null;
    this.tassel = null;
    this.info.loaded = false;
  }

  /** The body the sword keeps out of (its capsules) and the model whose bones drive them. */
  setBody(body: BodyProxy, root: THREE.Object3D): void {
    this.body = body;
    this.bodyRoot = root;
    this.qDev.identity();
  }

  /**
   * Body clearance (see CLEAR_ITER): from last frame's turn eased toward the hand's own sword, a few least-squares
   * steps turn the sword round the grip until its samples clear the capsules and the paving; at most MAX_DEV_RAD.
   * Writes the pivot's turn in the hand. No allocation.
   */
  private keepClear(dt: number): void {
    const body = this.body;
    const root = this.bodyRoot;
    this.pivot.quaternion.copy(this.gripQ);
    if (body === null || root === null || !this.clearance) {
      this.qDev.identity();
      this.roll = 0;
      this.info.devDeg = 0;
      return;
    }
    root.updateWorldMatrix(true, true);
    body.update();
    this.pivot.updateWorldMatrix(false, false);
    this.pivot.matrixWorld.decompose(this.g, this.qBase, this.tmp);
    const aH = this.aH.set(0, 1, 0).applyQuaternion(this.qBase);
    const d = this.dir.copy(aH).applyQuaternion(this.qDev);
    // Where last frame's turn puts the sword now: the new turn moves from it at most DEV_SPEED (no snap).
    const was = this.was.copy(d);
    d.lerp(aH, 1 - Math.exp(-dt / RELAX_S)).normalize();
    const G = this.g;
    const S = this.sampleS;
    const R = this.sampleR;
    for (let it = 0; it < CLEAR_ITER; it += 1) {
      const delta = this.delta.set(0, 0, 0);
      let ss = 0;
      let deepest = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const s = S[i]!;
        const py = G.y + d.y * s;
        const push = this.pushV.set(0, 0, 0);
        let pen = body.push(G.x + d.x * s, py, G.z + d.z * s, R[i]!, push, this.tmpS);
        const floor = R[i]! + FLOOR_M - py;
        if (floor > 0) {
          push.y += floor;
          if (floor > pen) pen = floor;
        }
        if (pen <= 0) continue;
        if (pen > deepest) deepest = pen;
        // Least squares for a turn δ of the axis: sample i moves by s·δ, wanted push⊥.
        push.addScaledVector(d, -push.dot(d));
        delta.addScaledVector(push, s);
        ss += s * s;
      }
      if (deepest < 5e-4 || ss < 1e-8) break;
      d.addScaledVector(delta, 1 / ss).normalize();
    }
    const step = was.angleTo(d);
    const maxStep = DEV_SPEED_RAD * dt;
    if (step > maxStep) {
      this.tmp.crossVectors(was, d);
      if (this.tmp.lengthSq() > 1e-12) d.copy(was).applyAxisAngle(this.tmp.normalize(), maxStep);
    }
    let angle = aH.angleTo(d);
    if (angle > MAX_DEV_RAD) {
      // Back along the arc to the limit.
      this.tmp.crossVectors(aH, d);
      if (this.tmp.lengthSq() < 1e-12) this.tmp.set(1, 0, 0);
      d.copy(aH).applyAxisAngle(this.tmp.normalize(), MAX_DEV_RAD);
      angle = MAX_DEV_RAD;
    }
    this.qDev.setFromUnitVectors(aH, d);
    // The guard is a flat ring twice the blade's width: near the body, the sword turns round its own axis so the
    // ring lies along the body (its wide axis across the way out) instead of cutting into it. Eased; of the two
    // rolls that do it, the nearer one (the ring is the same from both faces).
    const sg = S[1]!;
    const near = this.pushV.set(0, 0, 0);
    body.push(G.x + d.x * sg, G.y + d.y * sg, G.z + d.z * sg, R[1]! + GUARD_NEAR_M, near, this.tmpS);
    near.addScaledVector(d, -near.dot(d));
    let rollGoal = 0;
    const nl = near.length();
    if (nl > 1e-5) {
      near.multiplyScalar(1 / nl);
      const e = this.tmp.set(1, 0, 0).applyQuaternion(this.qBase).applyQuaternion(this.qDev);
      const f = this.delta.crossVectors(d, e);
      let phi = Math.atan2(-e.dot(near), f.dot(near));
      // atan2 gives one of two answers π apart: take the one nearer the roll drawn now.
      if (phi - this.roll > Math.PI / 2) phi -= Math.PI;
      else if (this.roll - phi > Math.PI / 2) phi += Math.PI;
      rollGoal = phi * Math.min(1, nl / GUARD_NEAR_M);
    }
    const dr = (rollGoal - this.roll) * (1 - Math.exp(-dt / ROLL_S));
    const maxRoll = DEV_SPEED_RAD * dt;
    this.roll += dr > maxRoll ? maxRoll : dr < -maxRoll ? -maxRoll : dr;
    if (this.roll > Math.PI) this.roll -= 2 * Math.PI;
    else if (this.roll < -Math.PI) this.roll += 2 * Math.PI;
    this.qRoll.setFromAxisAngle(d, this.roll);
    this.qDev.premultiply(this.qRoll);
    // The pivot's turn in the hand: hand⁻¹ · dev · hand · grip.
    this.hand.matrixWorld.decompose(this.tmp, this.qHand, this.tmpS);
    this.pivot.quaternion.copy(this.qHand).invert().multiply(this.qDev).multiply(this.qHand).multiply(this.gripQ);
    const deg = (angle * 180) / Math.PI;
    this.info.devDeg = deg;
    this.info.rollDeg = (this.roll * 180) / Math.PI;
    if (deg > this.info.maxDevDeg) this.info.maxDevDeg = deg;
  }


  /** A reset (the lab's R): whole, at rest, the tassel re-hung. */
  reset(): void {
    this.away = 0;
    this.blaze = 0;
    this.releases = -1;
    this.qDev.identity();
    this.roll = 0;
    this.info.maxDevDeg = 0;
    this.tassel?.invalidate();
    this.tassel?.resetStats();
  }

  /**
   * After the caster's update and the skills' (handAway is this frame's):
   * `dt` world seconds (a hit-stop shrinks them), `realDt` the frame's.
   */
  update(dt: number, realDt: number, fx: KiemFx, camera: THREE.Camera): void {
    const mesh = this.mesh;
    this.pivot.visible = this.enabled && mesh !== null;
    if (mesh === null) return;
    if (this.tassel !== null) this.tassel.group.visible = this.enabled;
    if (!this.enabled) return;
    this.time += realDt;
    // Out of the hand: melt from the tip in OUT_S; back: re-form from the pommel in IN_S.
    const goal = fx.handAway ? 1 : 0;
    this.away = goal > this.away ? Math.min(1, this.away + dt / OUT_S) : Math.max(0, this.away - dt / IN_S);
    const shown = this.away * this.away * (3 - 2 * this.away);
    this.u.uSwDissolve.value = shown;
    mesh.visible = shown < 0.999;
    // The wrist keeps the sword out of the body (Lam's clips are unarmed).
    if (mesh.visible) this.keepClear(dt);
    // The jade breathes at rest (3 s) and rises with the typing; the ridge core lights with the word and blazes at a release.
    const p = fx.presence;
    if (this.releases < 0) this.releases = p.releases;
    if (p.releases !== this.releases) {
      this.releases = p.releases;
      this.blaze = 1;
    }
    this.blaze = Math.max(0, this.blaze - realDt / BLAZE_FALL_S);
    const charge = p.charge;
    const jadeLive = Math.min(0.86, JADE_REST + JADE_BREATH * Math.sin((this.time * 2 * Math.PI) / 3) + JADE_CHARGE * charge);
    const jade = this.force.jade >= 0 ? this.force.jade : jadeLive;
    this.u.uSwJade.value.copy(this.jadeUnit).multiplyScalar(jade);
    const c = charge * charge * (3 - 2 * charge);
    const coreLive = Math.max(CORE_CHARGE * c, CORE_BLAZE * this.blaze * this.blaze);
    const core = this.force.core >= 0 ? this.force.core : coreLive;
    this.u.uSwCore.value.copy(this.coreUnit).multiplyScalar(core);
    this.info.away = shown;
    this.info.jade = jade;
    this.info.core = core;
    // Tassel: pinned at the pommel's end as drawn now; it draws into the pommel while the sword is out.
    const tassel = this.tassel;
    if (tassel !== null) {
      this.pivot.updateWorldMatrix(true, true);
      this.pin.copy(this.pommel).applyMatrix4(mesh.matrixWorld);
      tassel.retract = shown;
      tassel.setBeadGlow(0.1 + 0.25 * (jade - JADE_REST));
      tassel.update(this.pin, dt, camera);
      this.info.tasselReach = tassel.stats.maxReach;
      this.info.tasselStepM = tassel.stats.maxStepM;
      this.info.pommelStepM = tassel.stats.maxPinStepM;
      this.info.tasselStrandExcessM = tassel.stats.maxStrandExcessM;
    }
  }
}
