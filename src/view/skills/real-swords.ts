/**
 * Far and tiny skill swords as impostors of the real model (owner 03/11/2026: every skill sword is our approved
 * sword): the atlas bake_sword_impostor.py photographs from the full Clear Wind GLB under the lab's lookdev light
 * (four rolls round its long axis: broadside, 30° and 60° three-quarter from above, edge-on; 512 × 128 cells, the
 * sword tip right) is drawn as camera-facing quads laid along each sword's own axis on screen, its length from the
 * projected pommel and tip, its width from the world width at its depth (a sword seen end-on gets short, not thin).
 * Premultiplied alpha (the PNG's straight alpha is premultiplied at upload, so its mipmaps carry no dark fringe).
 * Around the sword only what the brief allows: its edge line (the mask atlas' edge field through the same
 * 0.8–0.95 step as sword-material.ts: ≤ 30 % of the blade's width, HDR, × glow) and a hit flash. No allocation per
 * frame. Key 7's far river and K5's gate ring use it; mid and hero swords are the textured meshes (blades.ts).
 * The sword aura's MantleHalo (SWORD_AURA §3.A, A3): a far sword pushed with an aura weight > 0 (key 7 only; K5's ring
 * pushes 0 and draws exactly as before) wears its mantle analytically in this same quad, under the sword: the blade's
 * half width from the weapon's profile (AuraAnchors) × the row's drawn width (meta rollWidth), a 1 px ink gap, 2 px
 * of mantle (Metal's silver-blue; Fire's broken ember line flickering at 3–4 Hz on soot), a 1 px ink rim, a needle
 * past the tip from 60 px; the quad grows only for such swords. Not × SWORD_LIGHT.
 */
import * as THREE from "three";
import { HEAT_BAND, SWORD_LIGHT, SWORD_LOOK } from "./sword-material";
import { SWORD_AURA_LOOK } from "./sword-aura";

/** The atlas' layout (<id>-impostor.json). */
export interface SwordAtlasMeta {
  readonly cellW: number;
  readonly cellH: number;
  /** Roll of each row (degrees round the long axis; row 0 at the top of the image). */
  readonly rolls: readonly number[];
  /** The pommel's end and the tip along a cell (share of its length). */
  readonly u0: number;
  readonly u1: number;
  readonly bladeFromU: number;
  /** The guard's start, the jade ring's centre and outer radius along the cell, and the blade's drawn width per row over row 0 (SWORD_AURA §5.2; absent in older bakes). */
  readonly guardU?: number;
  readonly ringU?: number;
  readonly ringR?: number;
  readonly rollWidth?: readonly number[];
}

export interface SwordAtlas {
  readonly lit: THREE.Texture;
  readonly mask: THREE.Texture;
  readonly meta: SwordAtlasMeta;
}

const atlases = new Map<string, Promise<SwordAtlas | null>>();
const texLoader = new THREE.TextureLoader();

function loadTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.premultiplyAlpha = true;
        t.anisotropy = 4;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

/** A weapon's impostor atlas from `<base>.png`, `<base>-mask.png` and `<base>.json`, cached; null when missing. */
export function loadSwordAtlas(base: string | undefined): Promise<SwordAtlas | null> {
  if (base === undefined || base === "") return Promise.resolve(null);
  let p = atlases.get(base);
  if (p === undefined) {
    p = (async () => {
      try {
        const res = await fetch(base + ".json");
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || type.includes("text/html")) return null;
        const meta = (await res.json()) as SwordAtlasMeta;
        const [lit, mask] = await Promise.all([loadTexture(base + ".png", true), loadTexture(base + "-mask.png", false)]);
        return { lit, mask, meta };
      } catch (error) {
        console.warn("[real-swords] impostor atlas unreadable:", base, error);
        return null;
      }
    })();
    atlases.set(base, p);
  }
  return p;
}

const VERTEX = /* glsl */ `
attribute vec4 iBase;  // the pommel's end (m), w: alpha
attribute vec4 iTip;   // the tip (m), w: roll share (0 broadside … 1 edge-on)
attribute vec2 iFx;    // glow, flash
uniform vec2 uView;
uniform vec4 uCell;    // u0, u1, cell height over its width, rows
varying vec2 vUv;      // x along the cell (0 … 1), y across (−1 … 1)
varying float vRoll;
varying vec3 vFx;      // glow, flash, alpha
void main() {
  vec4 cb = projectionMatrix * viewMatrix * vec4(iBase.xyz, 1.0);
  vec4 ct = projectionMatrix * viewMatrix * vec4(iTip.xyz, 1.0);
  vFx = vec3(iFx, iBase.w);
  vRoll = iTip.w;
  if (cb.w < 0.05 || ct.w < 0.05 || iBase.w <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uView;
  vec2 st = (ct.xy / ct.w * 0.5 + 0.5) * uView;
  vec2 d = st - sb;
  float L = length(d);
  vec2 ax = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-ax.y, ax.x);
  float span = uCell.y - uCell.x;
  // The cell's length on screen, and its half height from the world width at the sword's middle depth.
  float cellPx = L / span;
  float worldCell = length(iTip.xyz - iBase.xyz) / span;
  float wMid = 0.5 * (cb.w + ct.w);
  float halfPx = 0.5 * worldCell * uCell.z * projectionMatrix[1][1] * 0.5 * uView.y / wMid;
  float u = position.x + 0.5;
  float y = position.y * 2.0;
  vec2 p = sb + ax * ((u - uCell.x) * cellPx) + nrm * (y * halfPx);
  float t = clamp((u - uCell.x) / span, 0.0, 1.0);
  float w = mix(cb.w, ct.w, t);
  float z = mix(cb.z / cb.w, ct.z / ct.w, t);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
  vUv = vec2(u, y);
}`;

/** The same quad with the MantleHalo (sword aura): a second program, used only while the aura is on (setHalo). */
const VERTEX_HALO = /* glsl */ `
attribute vec4 iBase;  // the pommel's end (m), w: alpha
attribute vec4 iTip;   // the tip (m), w: roll share (0 broadside … 1 edge-on)
attribute vec3 iFx;    // glow, flash, aura weight (the MantleHalo; 0: none, the sword as before)
uniform vec2 uView;
uniform vec4 uCell;    // u0, u1, cell height over its width, rows
uniform vec4 uHalo;    // needle (share of the cell's sword span), min half height (px), -, -
varying vec2 vUv;      // x along the cell (0 … 1), y across (−1 … 1)
varying float vRoll;
varying vec3 vFx;      // glow, flash, alpha
varying vec3 vHalo;    // aura weight, half height (px), cell length (px)
varying float vSeed;
void main() {
  vec4 cb = projectionMatrix * viewMatrix * vec4(iBase.xyz, 1.0);
  vec4 ct = projectionMatrix * viewMatrix * vec4(iTip.xyz, 1.0);
  vFx = vec3(iFx.xy, iBase.w);
  vRoll = iTip.w;
  vSeed = float(gl_InstanceID) * 0.6180339;
  if (cb.w < 0.05 || ct.w < 0.05 || iBase.w <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uView;
  vec2 st = (ct.xy / ct.w * 0.5 + 0.5) * uView;
  vec2 d = st - sb;
  float L = length(d);
  vec2 ax = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-ax.y, ax.x);
  float span = uCell.y - uCell.x;
  // The cell's length on screen, and its half height from the world width at the sword's middle depth.
  float cellPx = L / span;
  float worldCell = length(iTip.xyz - iBase.xyz) / span;
  float wMid = 0.5 * (cb.w + ct.w);
  float halfPx = 0.5 * worldCell * uCell.z * projectionMatrix[1][1] * 0.5 * uView.y / wMid;
  float u = position.x + 0.5;
  float y = position.y * 2.0;
  if (iFx.z > 0.0) {
    // The halo: the quad runs on past the tip for the needle and holds the mantle across at any size.
    u += step(0.0, position.x) * uHalo.x * (uCell.y - uCell.x);
    halfPx = max(halfPx, uHalo.y);
  }
  vHalo = vec3(iFx.z, halfPx, cellPx);
  vec2 p = sb + ax * ((u - uCell.x) * cellPx) + nrm * (y * halfPx);
  float t = clamp((u - uCell.x) / span, 0.0, 1.0);
  float w = mix(cb.w, ct.w, t);
  float z = mix(cb.z / cb.w, ct.z / ct.w, t);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
  vUv = vec2(u, y);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tLit;
uniform sampler2D tMask;
uniform vec4 uCell;
uniform vec3 uEdge;
uniform float uGain;
uniform float uLight;
uniform float uMode;
uniform vec3 uHeat;
uniform float uChar;
uniform float uHeatFrom;
varying vec2 vUv;
varying float vRoll;
varying vec3 vFx;
vec2 cellUv(float row) {
  // Row 0 at the top of the image: texture v runs bottom-up.
  float rows = uCell.w;
  return vec2(vUv.x, 1.0 - (row + 0.5 - vUv.y * 0.5) / rows);
}
void main() {
  float f = clamp(vRoll, 0.0, 1.0) * (uCell.w - 1.0);
  float r0 = floor(f);
  float r1 = min(r0 + 1.0, uCell.w - 1.0);
  float k = f - r0;
  vec4 c = mix(texture2D(tLit, cellUv(r0)), texture2D(tLit, cellUv(r1)), k);
  vec4 m = mix(texture2D(tMask, cellUv(r0)), texture2D(tMask, cellUv(r1)), k);
  float a = vFx.z;
  // Premultiplied: the mask's channels carry its coverage; the edge field over its blade flag.
  float field = m.r / max(m.a, 1e-3);
  float line = smoothstep(0.8, 0.95, field) * m.g;
  vec3 col = c.rgb * uGain * uLight;
  if (uMode > 0.5) {
    // Furnace (sword-material.ts): hot iron under the light, a heat band from the spine to the edges.
    col *= uChar;
    col += uHeat * ${HEAT_BAND("uHeatFrom", "field")} * m.g * (0.55 + 0.45 * vFx.x);
  }
  col += c.rgb * min(vFx.y, 1.5) * 0.55;
  col += uEdge * line * min(vFx.x + vFx.y, 1.6);
  gl_FragColor = vec4(col * a, c.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The same sword with the MantleHalo under it (setHalo; SWORD_AURA §3.A A3). */
const FRAGMENT_HALO = /* glsl */ `
uniform sampler2D tLit;
uniform sampler2D tMask;
uniform vec4 uCell;
uniform vec3 uEdge;
uniform float uGain;
uniform float uLight;
uniform float uMode;
uniform vec3 uHeat;
uniform float uChar;
uniform float uHeatFrom;
uniform sampler2D tProfile;
uniform vec4 uAnch;      // bladeFrom, profile max (unit), pommelY, dpr
uniform vec4 uRollW;     // the blade's drawn width per row
uniform float uAuraTime;
uniform float uAuraMode;
uniform vec3 uAuraBody;
uniform vec3 uAuraEdge;
uniform vec3 uAuraDeep;
uniform vec4 uAuraInk;
varying vec2 vUv;
varying float vRoll;
varying vec3 vFx;
varying vec3 vHalo;
varying float vSeed;
float hHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hHash(i), hHash(i + vec2(1.0, 0.0)), u.x), mix(hHash(i + vec2(0.0, 1.0)), hHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** The far sword's mantle (MantleHalo), premultiplied, to be drawn under the sword. */
vec4 mantleHalo(float roll) {
  float px = uAnch.w;
  float yPx = abs(vUv.y) * vHalo.y;
  float span = uCell.y - uCell.x;
  float pom = uAnch.z;
  float Lu = 1.0 - pom;
  float yu = pom + (vUv.x - uCell.x) / span * Lu;
  float bu = (yu - uAnch.x) / (1.0 - uAnch.x);
  float swordPx = vHalo.z * span;
  float pxPerUnit = swordPx / Lu;
  float rw = roll < 1.0 ? mix(uRollW.x, uRollW.y, roll) : roll < 2.0 ? mix(uRollW.y, uRollW.z, roll - 1.0) : mix(uRollW.z, uRollW.w, roll - 2.0);
  float halfW = bu >= 0.0 && bu <= 1.0 ? texture2D(tProfile, vec2(clamp(bu, 0.0, 1.0), 0.5)).r * uAnch.y * pxPerUnit * rw : 0.0;
  // No mantle on the guard's band: it opens past bladeFrom + 0.03 of the sword.
  float collar = uAnch.x + 0.03 * Lu;
  float on = smoothstep(collar, collar + 0.05 * Lu, yu);
  float gap = 0.8 * px;
  float M = 2.0 * px;
  // A needle past the tip once the sword is 60 px long (its two seams meet in it); none under that.
  float needle = swordPx >= 60.0 * px ? 0.08 * Lu : 0.0;
  float nt = yu > 1.0 ? (needle > 0.0 ? clamp((yu - 1.0) / needle, 0.0, 1.0) : 1.0) : 0.0;
  float outer = yu > 1.0 ? (gap + M) * pow(1.0 - nt, 1.2) : halfW + gap + M;
  float inner = yu > 1.0 ? 0.0 : halfW + gap;
  float body = smoothstep(inner - 0.5, inner + 0.5, yPx) * (1.0 - smoothstep(outer - 0.5, outer + 0.5, yPx)) * on;
  float inkOut = smoothstep(outer - 0.5, outer + 0.5, yPx) * (1.0 - smoothstep(outer + px - 0.5, outer + px + 0.5, yPx)) * on;
  float inkIn = yu > 1.0 ? 0.0 : smoothstep(halfW - 0.5, halfW + 0.5, yPx) * (1.0 - smoothstep(inner - 0.5, inner + 0.5, yPx)) * on;
  vec3 light;
  float inkA;
  if (uAuraMode > 0.5) {
    // Fire: an ember rim, soot 1 px and a hot line ≤ 1 px broken by slow erosion, flickering at 3–4 Hz.
    float flick = hNoise(vec2(yu * 26.0 + vSeed * 7.0, uAuraTime * 3.5 + vSeed));
    float broken = smoothstep(0.38, 0.55, hNoise(vec2(yu * 14.0 - uAuraTime * 0.6, vSeed * 3.0)));
    float line = smoothstep(inner + 0.3 * M - 0.6, inner + 0.3 * M, yPx) * (1.0 - smoothstep(inner + 0.3 * M + 0.6 * px, inner + 0.3 * M + 1.2 * px, yPx));
    light = mix(uAuraDeep, uAuraBody, flick) * line * broken * on * (0.55 + 0.45 * flick);
    inkA = uAuraInk.a * (body * 0.75 + inkOut + inkIn * 0.6);
  } else {
    light = mix(uAuraDeep, uAuraEdge, smoothstep(inner, outer, yPx)) * body * 0.85;
    inkA = uAuraInk.a * (body * 0.5 + inkOut + inkIn * 0.9);
  }
  return vec4(uAuraInk.rgb * inkA + light, inkA);
}
vec2 cellUv(float row) {
  // Row 0 at the top of the image: texture v runs bottom-up.
  float rows = uCell.w;
  return vec2(vUv.x, 1.0 - (row + 0.5 - vUv.y * 0.5) / rows);
}
void main() {
  float f = clamp(vRoll, 0.0, 1.0) * (uCell.w - 1.0);
  float r0 = floor(f);
  float r1 = min(r0 + 1.0, uCell.w - 1.0);
  float k = f - r0;
  vec4 c = mix(texture2D(tLit, cellUv(r0)), texture2D(tLit, cellUv(r1)), k);
  vec4 m = mix(texture2D(tMask, cellUv(r0)), texture2D(tMask, cellUv(r1)), k);
  float a = vFx.z;
  // Premultiplied: the mask's channels carry its coverage; the edge field over its blade flag.
  float field = m.r / max(m.a, 1e-3);
  float line = smoothstep(0.8, 0.95, field) * m.g;
  vec3 col = c.rgb * uGain * uLight;
  if (uMode > 0.5) {
    // Furnace (sword-material.ts): hot iron under the light, a heat band from the spine to the edges.
    col *= uChar;
    col += uHeat * ${HEAT_BAND("uHeatFrom", "field")} * m.g * (0.55 + 0.45 * vFx.x);
  }
  col += c.rgb * min(vFx.y, 1.5) * 0.55;
  col += uEdge * line * min(vFx.x + vFx.y, 1.6);
  gl_FragColor = vec4(col * a, c.a * a);
  if (vHalo.x > 0.0) {
    // The mantle melts before the blade (its alpha squared) and lies under the sword (premultiplied "under").
    vec4 halo = mantleHalo(f) * vHalo.x * a * a;
    gl_FragColor = gl_FragColor + halo * (1.0 - gl_FragColor.a);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** One instanced draw of impostor swords; fill with begin / push… / end each frame. */
export class SwordImpostors {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly tip: Float32Array;
  private readonly fx: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];
  private readonly sizes = [4, 4, 3];
  private readonly view: { value: THREE.Vector2 };
  private readonly material: THREE.ShaderMaterial;
  /** The MantleHalo's program (setHalo), made on first use; it shares the uniforms. */
  private haloMaterial: THREE.ShaderMaterial | null = null;
  private readonly vp = new THREE.Vector4();
  private ready = false;
  private n = 0;
  private atlasMeta: SwordAtlasMeta | null = null;

  /** `depthTest` false: drawn over the scene (the gate's ring, in the sky over everything). */
  constructor(
    readonly capacity: number,
    renderOrder: number,
    depthTest = true,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    this.base = new Float32Array(capacity * 4);
    this.tip = new Float32Array(capacity * 4);
    this.fx = new Float32Array(capacity * 3);
    this.attrs = [new THREE.InstancedBufferAttribute(this.base, 4), new THREE.InstancedBufferAttribute(this.tip, 4), new THREE.InstancedBufferAttribute(this.fx, 3)];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iBase", this.attrs[0]!);
    g.setAttribute("iTip", this.attrs[1]!);
    g.setAttribute("iFx", this.attrs[2]!);
    g.instanceCount = 0;
    this.geometry = g;
    this.view = { value: new THREE.Vector2(1920, 1080) };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uView: this.view,
        uCell: { value: new THREE.Vector4(0.035, 0.965, 0.25, 4) },
        tLit: { value: null },
        tMask: { value: null },
        uEdge: SWORD_LOOK.edge,
        uMode: SWORD_LOOK.mode,
        uHeat: SWORD_LOOK.heat,
        uChar: SWORD_LOOK.char,
        uHeatFrom: SWORD_LOOK.heatFrom,
        // The bake is the lab's lookdev light through no tone curve; the meshes' light gain follows the darkening.
        uGain: { value: 1 },
        uLight: SWORD_LIGHT,
        // The MantleHalo (sword aura): needle share, min half height (px); the weapon's profile and roll widths.
        uHalo: { value: new THREE.Vector4(0.08, 6, 0, 0) },
        tProfile: { value: null },
        uAnch: { value: new THREE.Vector4(0.27, 0.05, -0.6, 1) },
        uRollW: { value: new THREE.Vector4(1, 0.87, 0.5, 0.35) },
        uAuraTime: { value: 0 },
        uAuraMode: SWORD_AURA_LOOK.mode,
        uAuraBody: SWORD_AURA_LOOK.body,
        uAuraEdge: SWORD_AURA_LOOK.edge,
        uAuraDeep: SWORD_AURA_LOOK.deep,
        uAuraInk: SWORD_AURA_LOOK.ink,
      },
      transparent: true,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "swordImpostors";
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.vp);
      this.view.value.set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
      // Halo widths are CSS px × the pixel ratio (the floors hold while the dynamic resolution floats).
      const dpr = renderer.getPixelRatio();
      const u = this.material.uniforms;
      (u.uAnch!.value as THREE.Vector4).w = dpr;
      (u.uHalo!.value as THREE.Vector4).y = 6 * dpr;
    };
  }

  /** The weapon's atlas (null: nothing is drawn until one is set). */
  setAtlas(atlas: SwordAtlas | null): void {
    const u = this.material.uniforms;
    this.ready = atlas !== null;
    this.atlasMeta = atlas?.meta ?? null;
    if (atlas === null) return;
    u.tLit!.value = atlas.lit;
    u.tMask!.value = atlas.mask;
    (u.uCell!.value as THREE.Vector4).set(atlas.meta.u0, atlas.meta.u1, atlas.meta.cellH / atlas.meta.cellW, atlas.meta.rolls.length);
  }

  /**
   * The weapon's blade profile for the MantleHalo (SWORD_AURA §5.2): its texture (sword-aura.ts profileTexture), the
   * unit blade's start, profile max and pommel, and the meta's roll widths (absent: cosines with a thickness floor).
   */
  setAuraProfile(profile: THREE.Texture, bladeFrom: number, profileMax: number, pommelY: number, rollWidth?: readonly number[]): void {
    const u = this.material.uniforms;
    u.tProfile!.value = profile;
    (u.uAnch!.value as THREE.Vector4).set(bladeFrom, profileMax, pommelY, (u.uAnch!.value as THREE.Vector4).w);
    const r = rollWidth !== undefined && rollWidth.length >= 4 ? rollWidth : [1, 0.87, 0.5, 0.35];
    (u.uRollW!.value as THREE.Vector4).set(r[0]!, r[1]!, r[2]!, r[3]!);
  }

  /**
   * Draws with the MantleHalo's program (true; key 7's far swords while the aura is on) or the sword's own program
   * (false, the default: the program as it was, so nothing changes with the aura off). Swords pushed with an aura weight
   * of 0 draw alike in both.
   */
  setHalo(on: boolean): void {
    if (!on) {
      this.mesh.material = this.material;
      return;
    }
    if (this.haloMaterial === null) {
      this.haloMaterial = this.material.clone();
      this.haloMaterial.uniforms = this.material.uniforms;
      this.haloMaterial.vertexShader = VERTEX_HALO;
      this.haloMaterial.fragmentShader = FRAGMENT_HALO;
    }
    this.mesh.material = this.haloMaterial;
  }

  /** The halo's program (made on first setHalo; prewarm compiles it). */
  get haloProgram(): THREE.ShaderMaterial | null {
    return this.haloMaterial;
  }

  /** The halo's clock (the aura's world time: Fire's ember rim flickers on it). */
  set auraTime(t: number) {
    this.material.uniforms.uAuraTime!.value = t;
  }

  /** The atlas' meta (null before one is set). */
  get meta(): SwordAtlasMeta | null {
    return this.atlasMeta;
  }

  /** Brightness of the bake against the lit meshes (tuned in the lab side by side). */
  set gain(k: number) {
    this.material.uniforms.uGain!.value = k;
  }

  begin(): void {
    this.n = 0;
  }

  /**
   * One sword from its pommel's end (bx, by, bz) to its tip (tx, ty, tz); `alpha` its fade, `roll` 0 broadside … 1
   * edge-on, `glow` its edge line, `flash` a hit, `aura` the MantleHalo's weight (0: none).
   */
  push(bx: number, by: number, bz: number, tx: number, ty: number, tz: number, alpha: number, roll = 0, glow = 0.6, flash = 0, aura = 0): void {
    if (!this.ready || this.n >= this.capacity || alpha <= 0.002) return;
    const o = this.n * 4;
    this.base[o] = bx;
    this.base[o + 1] = by;
    this.base[o + 2] = bz;
    this.base[o + 3] = Math.min(1, alpha);
    this.tip[o] = tx;
    this.tip[o + 1] = ty;
    this.tip[o + 2] = tz;
    this.tip[o + 3] = roll;
    this.fx[this.n * 3] = glow;
    this.fx[this.n * 3 + 1] = flash;
    this.fx[this.n * 3 + 2] = aura;
    this.n += 1;
  }

  get count(): number {
    return this.n;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (let k = 0; k < 3; k += 1) {
      const a = this.attrs[k]!;
      const r = this.ranges[k]!;
      r.count = Math.max(1, this.n) * this.sizes[k]!;
      a.updateRanges.length = 0;
      a.updateRanges.push(r);
      a.needsUpdate = true;
    }
  }

  hide(): void {
    this.begin();
    this.end();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
