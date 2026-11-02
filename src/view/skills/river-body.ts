/**
 * Key 7's river as one body (power pass round 3b, item 3; target frame f4 and both round-3a judges: "needle noise
 * without a flowing head or tail"): a thick luminous ribbon along the river's path, the swords riding inside it.
 * Two bands from one path callback, rebuilt on the CPU each frame (2 × 97 × 2 vertices, no allocation):
 * - a DEPTH band, lower and wider, deep navy: the river's shaded underside, so the body reads with volume at 55°;
 * - the BODY band: a white core (thin, HDR, the only part that blooms) → cyan → navy edges across, striations
 *   flowing downstream and waves of light running down it; tapered head and tail.
 * Premultiplied alpha (it occludes the field like a solid shape), never added broad light: round 2's additive glow
 * cards washed the field to mid-grey. View only.
 */
import * as THREE from "three";
import { GRAMMAR } from "./sword-grammar";

const SEG = 96;

const VERTEX = /* glsl */ `
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uDepth;
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
uniform vec3 uNavy;
varying vec2 vUv;
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float av = abs(v);
  float edge = 1.0 - smoothstep(0.82, 1.0, av);
  if (uDepth > 0.5) {
    // The underside: deep navy, a faint cyan lip.
    vec3 c = uNavy * 1.4 + uCyan * 0.08 * smoothstep(0.5, 0.9, av);
    float a = 0.62 * edge * uAlpha;
    gl_FragColor = vec4(c * a, a);
    return;
  }
  // Striations flowing downstream (two scales), bent by a slow meander across.
  float f1 = sin((u * 46.0 - uTime * 4.2) + v * 3.0 + sin(u * 9.0 + uTime) * 1.4);
  float f2 = sin((u * 97.0 - uTime * 7.5) - v * 5.0);
  float stri = smoothstep(0.55, 1.0, f1) * 0.7 + smoothstep(0.75, 1.0, f2) * 0.45;
  // Waves of light running down the river.
  float wv = 0.5 + 0.5 * sin((u * 2.3 - uTime * 0.85) * 6.2831853);
  float bright = 0.55 + 0.45 * wv * wv;
  // Across: a thin white core → cyan → deep navy at the banks; kept dark enough that the swords inside read.
  float core = 1.0 - smoothstep(0.035, 0.09, av);
  vec3 body = mix(uCyanLit * 0.75, uCyan * 0.75, smoothstep(0.08, 0.4, av));
  body = mix(body, uNavy * 2.2, smoothstep(0.35, 0.9, av));
  body *= 0.6 + 0.4 * bright;
  float a = (0.66 - 0.2 * smoothstep(0.3, 1.0, av)) * edge * uAlpha;
  vec3 add = uWhite * core * (1.8 + 1.8 * bright) + uCyanLit * stri * 0.28 * (1.0 - smoothstep(0.15, 0.75, av));
  gl_FragColor = vec4(body * a + add * edge * uAlpha, a);
}`;

/** The river's ribbon body: `update` with a path callback, a half width (m) and its alpha each frame. */
export class RiverBody {
  readonly group = new THREE.Group();
  private readonly bands: THREE.Mesh[] = [];
  private readonly pos: Float32Array[] = [];
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor(renderOrder: number) {
    const v3 = (c: readonly number[]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);
    for (let k = 0; k < 2; k += 1) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array((SEG + 1) * 2 * 3);
      const uv = new Float32Array((SEG + 1) * 2 * 2);
      const idx: number[] = [];
      for (let i = 0; i <= SEG; i += 1) {
        uv[i * 4] = i / SEG;
        uv[i * 4 + 1] = -1;
        uv[i * 4 + 2] = i / SEG;
        uv[i * 4 + 3] = 1;
        if (i < SEG) {
          const o = i * 2;
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
      }
      const pa = new THREE.BufferAttribute(pos, 3);
      pa.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("position", pa);
      g.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 0 },
          uDepth: { value: k === 0 ? 1 : 0 },
          uWhite: { value: v3(GRAMMAR.white) },
          uCyan: { value: v3(GRAMMAR.cyan) },
          uCyanLit: { value: v3(GRAMMAR.cyanLit) },
          uNavy: { value: v3(GRAMMAR.navy) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder + k;
      mesh.visible = false;
      this.bands.push(mesh);
      this.pos.push(pos);
      this.mats.push(m);
      this.group.add(mesh);
    }
  }

  /**
   * Rebuilds both bands along `path(u, lat, h, out)` (u 0–1 along, lat m across, h m up), `half` the body's half width
   * (m), tapered over the first and last `taper` of its length; `alpha` 0 hides it.
   */
  update(path: (u: number, lat: number, h: number, out: THREE.Vector3) => THREE.Vector3, half: number, alpha: number, time: number, taper = 0.12): void {
    const on = alpha > 0.003;
    for (const m of this.bands) m.visible = on;
    if (!on) return;
    for (let k = 0; k < 2; k += 1) {
      const pos = this.pos[k]!;
      const depth = k === 0;
      for (let i = 0; i <= SEG; i += 1) {
        const u = i / SEG;
        const env = Math.min(1, u / taper, (1 - u) / taper);
        const e = env <= 0 ? 0 : env * env * (3 - 2 * env);
        const w = half * (0.3 + 0.7 * e) * (1 + 0.08 * Math.sin(u * 17 - time * 2.1)) * (depth ? 1.18 : 1);
        const h = depth ? -0.75 : 0;
        path(u, -w, h, this.a);
        path(u, w, h, this.b);
        const o = i * 6;
        pos[o] = this.a.x;
        pos[o + 1] = this.a.y;
        pos[o + 2] = this.a.z;
        pos[o + 3] = this.b.x;
        pos[o + 4] = this.b.y;
        pos[o + 5] = this.b.z;
      }
      const g = this.bands[k]!.geometry;
      g.getAttribute("position").needsUpdate = true;
      this.mats[k]!.uniforms.uTime!.value = time;
      this.mats[k]!.uniforms.uAlpha!.value = Math.min(1, alpha);
    }
  }

  hide(): void {
    for (const m of this.bands) m.visible = false;
  }

  dispose(): void {
    for (const m of this.bands) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
