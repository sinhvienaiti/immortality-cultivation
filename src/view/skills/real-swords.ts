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
 */
import * as THREE from "three";
import { SWORD_LIGHT, SWORD_LOOK } from "./sword-material";

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

const FRAGMENT = /* glsl */ `
uniform sampler2D tLit;
uniform sampler2D tMask;
uniform vec4 uCell;
uniform vec3 uEdge;
uniform float uGain;
uniform float uLight;
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
  col += c.rgb * min(vFx.y, 1.5) * 0.55;
  col += uEdge * line * min(vFx.x + vFx.y, 1.6);
  gl_FragColor = vec4(col * a, c.a * a);
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
  private readonly sizes = [4, 4, 2];
  private readonly view: { value: THREE.Vector2 };
  private readonly material: THREE.ShaderMaterial;
  private readonly vp = new THREE.Vector4();
  private ready = false;
  private n = 0;

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
    this.fx = new Float32Array(capacity * 2);
    this.attrs = [new THREE.InstancedBufferAttribute(this.base, 4), new THREE.InstancedBufferAttribute(this.tip, 4), new THREE.InstancedBufferAttribute(this.fx, 2)];
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
        // The bake is the lab's lookdev light through no tone curve; the meshes' light gain follows the darkening.
        uGain: { value: 1 },
        uLight: SWORD_LIGHT,
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
    };
  }

  /** The weapon's atlas (null: nothing is drawn until one is set). */
  setAtlas(atlas: SwordAtlas | null): void {
    const u = this.material.uniforms;
    this.ready = atlas !== null;
    if (atlas === null) return;
    u.tLit!.value = atlas.lit;
    u.tMask!.value = atlas.mask;
    (u.uCell!.value as THREE.Vector4).set(atlas.meta.u0, atlas.meta.u1, atlas.meta.cellH / atlas.meta.cellW, atlas.meta.rolls.length);
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
   * edge-on, `glow` its edge line, `flash` a hit.
   */
  push(bx: number, by: number, bz: number, tx: number, ty: number, tz: number, alpha: number, roll = 0, glow = 0.6, flash = 0): void {
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
    this.fx[this.n * 2] = glow;
    this.fx[this.n * 2 + 1] = flash;
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
