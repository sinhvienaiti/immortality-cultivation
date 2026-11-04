/**
 * Key 7's finisher slash in fire (03/11 fixes, replace never stack: Fire drew Metal's sword-qi slash recoloured). The
 * same strip and shape as qi-slash.ts (the authored crescent unwrapped from origin to tip, ~150 px wide at 1080p, its
 * head running origin to tip), drawn as a flame: the crescent's body read as heat round a smooth spine (its band's
 * centre and width measured once along the arc and smoothed), the owner's Firefly strip licking out along both
 * edges (the old tongues remain for A/B and while the image loads), coloured through the fire ramp (a soot edge, a vermilion-to-amber body, a thin
 * white-gold core that alone blooms), hotter just behind the head; it cools through the bands and erodes instead of
 * fading. Premultiplied, no depth test; view only.
 */
import * as THREE from "three";
import { QI_SLASH_VERTEX } from "./qi-slash";
import type { Rgb } from "./weapons";

const FRAGMENT = /* glsl */ `
uniform sampler2D tMask;
uniform float uHasMask;
uniform sampler2D tBand;
uniform float uHasBand;
uniform sampler2D tStrip;
uniform float uHasStrip;
uniform float uStripK;
uniform float uStripScroll;
uniform float uHead;
uniform float uFade;
uniform float uErode;
uniform float uTime;
uniform vec3 uSoot;
uniform vec3 uDeep;
uniform vec3 uAmber;
uniform vec3 uCore;
varying vec2 vP;
/** The crescent unwrapped (qi-slash.ts): s 0–1 along its arc, v across. */
float m(float s, float v) {
  if (abs(v) > 1.0) return 0.0;
  if (uHasMask < 0.5) {
    float env = sin(3.14159 * clamp(s, 0.0, 1.0));
    return 1.0 - smoothstep(0.32 * env, 0.36 * env, abs(v));
  }
  float th = mix(0.85, 5.43, s);
  float rr = mix(0.3, 0.64, v * 0.5 + 0.5);
  vec2 uv = vec2(0.62, 0.5) + rr * vec2(cos(th), sin(th));
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(tMask, uv).r;
}
/** The crescent seen soft (a coarse mip: its ragged streaks merged), for where its band runs (no band table yet). */
float mSoft(float s, float v) {
  if (uHasMask < 0.5) return m(s, v);
  float th = mix(0.85, 5.43, s);
  float rr = mix(0.3, 0.64, v * 0.5 + 0.5);
  vec2 uv = vec2(0.62, 0.5) + rr * vec2(cos(th), sin(th));
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(tMask, uv, 4.5).r;
}
float fsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fsHash1(float p) { return fract(sin(p * 91.7 + 17.3) * 43758.5453); }
float fsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fsHash(i), fsHash(i + vec2(1.0, 0.0)), u.x), mix(fsHash(i + vec2(0.0, 1.0)), fsHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float s = vP.y;
  // The strip is WIDE × the crescent's own width: room outside it for the flame tongues (v in the crescent's units).
  float v = vP.x * WIDE;
  float body = m(s, v);
  // The band's centre and half width across this s: from the band table (the crescent's own centre and width along
  // its arc, measured once and smoothed along it: a smooth, continuous spine; round 3), else measured here.
  float centre = 0.0;
  float halfW = 0.0;
  if (uHasBand > 0.5) {
    vec4 b = texture2D(tBand, vec2(clamp(s, 0.0, 1.0), 0.5));
    centre = b.r * 2.0 - 1.0;
    halfW = b.g;
  } else if (uHasMask < 0.5) {
    halfW = 0.34 * sin(3.14159 * clamp(s, 0.0, 1.0));
  } else {
    float wSum = 0.0;
    float vSum = 0.0;
    for (int i = 0; i < 24; i++) {
      float vv = -0.98 + float(i) * 0.085217;
      float k = mSoft(s, vv);
      wSum += k;
      vSum += k * vv;
    }
    if (wSum > 0.05) {
      centre = vSum / wSum;
      halfW = wSum * 0.085217 * 0.5;
    }
  }
  float rel = halfW > 0.02 ? abs(v - centre) / max(halfW, 0.04) : 2.0;
  float spine = (1.0 - smoothstep(0.08, 0.2, rel)) * step(0.02, halfW);
  // From the crescent's visible edge (its soft coverage runs ~1.5 × its measured half width), in units of that edge.
  float edgeW = halfW * 1.5 + 0.03;
  float env = smoothstep(0.0, 0.12, s) * smoothstep(1.0, 0.88, s);
  float n = fsNoise(vec2(s * 40.0 - uTime * 3.0, v * 3.0));
  float behind = step(s, uHead + 0.02);
  // The head's heat stays inside the shape (at the strip's ends it would draw a square).
  float head = exp(-abs(s - uHead) * 22.0) * step(s, uHead + 0.05) * body;
  float heat;
  vec4 st = vec4(0.0);
  float flame = 0.0;
  if (uHasStrip > 0.5) {
    float reach = edgeW * 2.6;
    float vs = 0.5 + (v - centre) / (2.0 * reach);
    float us = s * uStripK - uTime * uStripScroll;
    st = (vs > 0.0 && vs < 1.0) ? texture2D(tStrip, vec2(us, vs)) : vec4(0.0);
    flame = st.a * env * behind;
    float bodyHeat = body * (0.5 + 0.22 * (1.0 - smoothstep(0.3, 0.95, rel)) + 0.3 * spine) * (0.96 + 0.06 * n) + head * 0.3 * (1.0 - smoothstep(0.25, 0.6, rel));
    heat = max(bodyHeat, flame * mix(0.62, 0.3, abs(vs - 0.5) * 2.0));
  } else {
    // Legacy A/B: keep every tongue and heat calculation unchanged.
    float dOut = (abs(v - centre) - edgeW) / max(edgeW, 0.1);
    float sec = s * 96.0 + dOut * 0.22;
    float id = floor(sec);
    float fs = fract(sec) - 0.5;
    float len = mix(0.8, 2.4, fsHash1(id * 1.7 + (v > centre ? 31.0 : 0.0))) * (0.86 + 0.14 * sin(uTime * 13.0 + id * 2.3)) * env;
    float tt = dOut / max(len, 1e-3);
    // Each tongue sways a little toward its tip (a flame, not a shard).
    fs -= sin(tt * 3.0 + id * 1.7) * 0.14 * tt;
    float hw = mix(0.47, 0.0, smoothstep(0.0, 1.0, tt));
    float tongue = step(0.0, tt) * (1.0 - smoothstep(0.9, 1.0, tt)) * (1.0 - smoothstep(hw - 0.08, hw, abs(fs)));
    heat = max(body * (0.5 + 0.22 * (1.0 - smoothstep(0.3, 0.95, rel)) + 0.3 * spine) * (0.96 + 0.06 * n), tongue * behind * mix(0.72, 0.3, tt)) + head * 0.3 * (1.0 - smoothstep(0.25, 0.6, rel));
  }
  heat *= mix(0.82, 1.0, behind);
  // It cools (falls through the bands) and erodes from its thin tongues; it never turns see-through.
  heat = heat * uFade - uErode * 0.55;
  float edge = 0.12 + (n - 0.5) * 0.06 + uErode * 0.12;
  float a = smoothstep(edge, edge + 0.04, heat);
  if (a <= 0.003) discard;
  float b2 = smoothstep(0.27, 0.4, heat);
  float c = smoothstep(0.8, 0.94, heat);
  vec3 col = mix(uSoot, mix(uDeep, uAmber, smoothstep(0.4, 0.78, heat)), b2);
  col = mix(col, uCore * 2.4, c);
  if (uHasStrip > 0.5) col *= mix(vec3(1.0), st.rgb * 1.15, 0.5 * flame);
  a *= mix(0.86, 0.96, b2);
  gl_FragColor = vec4(col * a, a);
}`;

/** The strip's width over the crescent's: room outside it for the flame tongues. */
const WIDE = 1.7;

export class FlameSlash {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly vp = new THREE.Vector4();
  /** The band table of the mask it was measured from (measureBand). */
  private band: THREE.DataTexture | null = null;
  private bandOf: THREE.Texture | null = null;

  constructor(renderOrder = 15) {
    const v3 = (): THREE.Vector3 => new THREE.Vector3();
    this.u = {
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uHalf: { value: 80 },
      uView: { value: new THREE.Vector2(1920, 1080) },
      tMask: { value: null },
      uHasMask: { value: 0 },
      tBand: { value: null },
      uHasBand: { value: 0 },
      tStrip: { value: null },
      uHasStrip: { value: 0 },
      uStripK: { value: 1 },
      uStripScroll: { value: 0.5 },
      uHead: { value: 0 },
      uFade: { value: 0 },
      uErode: { value: 0 },
      uTime: { value: 0 },
      uSoot: { value: v3() },
      uDeep: { value: v3() },
      uAmber: { value: v3() },
      uCore: { value: v3() },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: QI_SLASH_VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      defines: { WIDE: WIDE.toFixed(2) },
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "fx-flame-slash";
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.vp);
      (this.u.uView!.value as THREE.Vector2).set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
    };
  }

  /** Its fire ramp (linear): the soot edge, the deep and amber body, the core (drawn × 2.4). */
  setRamp(soot: Rgb, deep: Rgb, amber: Rgb, core: Rgb): void {
    (this.u.uSoot!.value as THREE.Vector3).set(soot[0], soot[1], soot[2]);
    (this.u.uDeep!.value as THREE.Vector3).set(deep[0], deep[1], deep[2]);
    (this.u.uAmber!.value as THREE.Vector3).set(amber[0], amber[1], amber[2]);
    (this.u.uCore!.value as THREE.Vector3).set(core[0], core[1], core[2]);
  }

  /** Authored straight-alpha fire; null keeps the legacy A/B path. Scroll is periods per second. */
  setStrip(texture: THREE.Texture | null, k: number, scroll: number): void {
    this.u.tStrip!.value = texture;
    this.u.uHasStrip!.value = texture !== null ? 1 : 0;
    this.u.uStripK!.value = k;
    this.u.uStripScroll!.value = scroll;
  }

  /** As QiSlash.set, with the crescent mask and the flame's clock (s). Fade 0 hides it. */
  set(ax: number, ay: number, az: number, bx: number, by: number, bz: number, halfPx: number, head: number, fade: number, erode: number, mask: THREE.Texture | null, time: number): void {
    (this.u.uA!.value as THREE.Vector3).set(ax, ay, az);
    (this.u.uB!.value as THREE.Vector3).set(bx, by, bz);
    this.u.uHalf!.value = halfPx * WIDE;
    this.u.uHead!.value = head;
    this.u.uFade!.value = fade;
    this.u.uErode!.value = erode;
    this.u.tMask!.value = mask;
    this.u.uHasMask!.value = mask !== null ? 1 : 0;
    if (mask !== this.bandOf) this.measureBand(mask);
    this.u.uHasBand!.value = this.band !== null && mask === this.bandOf ? 1 : 0;
    this.u.uTime!.value = time;
    // TextureLoader returns before decoding; a pending or failed strip must keep the old flame visible.
    const strip = this.u.tStrip!.value as THREE.Texture | null;
    const image = strip?.image as { width: number; height: number } | undefined;
    this.u.uHasStrip!.value = image !== undefined && image !== null && image.width > 0 && image.height > 0 ? 1 : 0;
    this.mesh.visible = fade > 0.003;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /**
   * The band table (round 3: the spine read from a coarse mip in every pixel wobbled along the slash's ragged
   * streaks): the crescent's centre and half width across, at BAND points along its arc, measured once from the mask's
   * image (as the shader would, from a downscaled copy) and smoothed along the arc; one texture read per pixel after.
   * Without a readable image (tests, before it loads) the shader measures it itself.
   */
  private measureBand(mask: THREE.Texture | null): void {
    const img = mask?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (mask === null || img === undefined || !(img.width > 0) || typeof document === "undefined") return;
    const N = 128;
    const G = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = G;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) return;
    ctx.drawImage(img, 0, 0, G, G);
    const px = ctx.getImageData(0, 0, G, G).data;
    // The texture's v runs up the image (flipY), so a uv's row is from the bottom.
    const at = (u: number, w: number): number => {
      if (u < 0 || w < 0 || u > 1 || w > 1) return 0;
      const x = Math.min(G - 1, Math.floor(u * G));
      const y = Math.min(G - 1, Math.floor((1 - w) * G));
      return px[(y * G + x) * 4]! / 255;
    };
    const centre = new Float32Array(N);
    const half = new Float32Array(N);
    const V = 48;
    const dv = 2 / (V - 1);
    for (let i = 0; i < N; i += 1) {
      const th = 0.85 + (5.43 - 0.85) * (i / (N - 1));
      let wSum = 0;
      let vSum = 0;
      for (let j = 0; j < V; j += 1) {
        const vv = -1 + j * dv;
        const rr = 0.3 + (0.64 - 0.3) * (vv * 0.5 + 0.5);
        const k = at(0.62 + rr * Math.cos(th), 0.5 + rr * Math.sin(th));
        wSum += k;
        vSum += k * vv;
      }
      centre[i] = wSum > 0.5 ? vSum / wSum : 0;
      half[i] = wSum * dv * 0.5;
    }
    // Smoothed along the arc (a Gaussian over ±8 points): a continuous spine, its width easing.
    const data = new Uint8Array(N * 4);
    for (let i = 0; i < N; i += 1) {
      let c = 0;
      let h = 0;
      let wt = 0;
      for (let k = -8; k <= 8; k += 1) {
        const j = Math.min(N - 1, Math.max(0, i + k));
        const g = Math.exp(-(k * k) / 18);
        c += centre[j]! * g;
        h += half[j]! * g;
        wt += g;
      }
      data[i * 4] = Math.round(Math.min(1, Math.max(0, (c / wt) * 0.5 + 0.5)) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, h / wt)) * 255);
      data[i * 4 + 3] = 255;
    }
    this.band?.dispose();
    const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    this.band = t;
    this.bandOf = mask;
    this.u.tBand!.value = t;
  }

  dispose(): void {
    this.band?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
