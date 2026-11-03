/**
 * One wide tapered sword-qi slash (power pass round 3b, item 4; both round-3a judges: key 7's finisher read as "thin
 * parallel laser lines running into the void"). A camera-facing strip from the stroke's origin to its tip, ~150 px
 * wide at 1080p, whose shape is the authored slash crescent (art-src/skills/impact-tex/slash-crescent-mask.png)
 * unwrapped along its arc, so its ragged edges and its taper to both points are drawn, not computed. Across: a hot
 * white core (eroded mask, HDR, the only part that blooms), a cyan body, a deep-blue falloff (dilated mask). A white
 * head runs along it from origin to tip (the deaths follow it); then it erodes away. Premultiplied, no depth test.
 */
import * as THREE from "three";
import { GRAMMAR } from "./sword-grammar";

/** The strip's vertex shader (screen-space, origin to tip): shared with an element's own slash (flame-slash.ts). */
export const QI_SLASH_VERTEX = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uHalf;
uniform vec2 uView;
varying vec2 vP;
void main() {
  vec4 ca = projectionMatrix * viewMatrix * vec4(uA, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(uB, 1.0);
  if (ca.w < 0.05 || cb.w < 0.05) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uView;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uView;
  vec2 d = sb - sa;
  float L = max(length(d), 1e-3);
  vec2 ax = d / L;
  vec2 nrm = vec2(-ax.y, ax.x);
  float hw = uHalf * uView.y / 1080.0;
  float y = position.y + 0.5;
  vec2 p = sa + ax * (y * L) + nrm * (position.x * 2.0 * hw);
  float w = mix(ca.w, cb.w, y);
  float z = mix(ca.z / ca.w, cb.z / cb.w, y);
  gl_Position = vec4((p / uView * 2.0 - 1.0) * w, z * w, w);
  vP = vec2(position.x * 2.0, y);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tMask;
uniform float uHasMask;
uniform float uHead;
uniform float uFade;
uniform float uErode;
uniform vec3 uWhite;
uniform vec3 uCyan;
uniform vec3 uCyanLit;
uniform vec3 uNavy;
varying vec2 vP;
/** The crescent sheet unwrapped: s 0–1 along its arc (tip, through its thick middle, to the other tip), v across. */
float m(float s, float v) {
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
void main() {
  float s = vP.y;
  float v = vP.x;
  float body = m(s, v);
  float inner = min(m(s, v - 0.1), m(s, v + 0.1));
  float outer = max(max(m(s, v - 0.3), m(s, v + 0.3)), max(m(s, v - 0.16), m(s, v + 0.16)));
  float thr = 0.45 + 0.5 * uErode;
  float bodyA = smoothstep(thr - 0.08, thr + 0.08, body);
  float coreA = smoothstep(thr + 0.05, thr + 0.2, inner) * bodyA;
  float glowA = smoothstep(0.15, 0.6, outer) * (1.0 - bodyA) * (1.0 - uErode);
  // The white head running from origin to tip; behind it the slash burns hotter for a moment.
  float head = exp(-abs(s - uHead) * 26.0) * step(s, uHead + 0.05);
  float burnt = step(s, uHead) * 0.35;
  vec3 deep = uNavy * 5.0 + uCyan * 0.3;
  vec3 col = deep * glowA * 0.7 + uCyanLit * 0.85 * bodyA * (1.0 - coreA) + uWhite * (4.5 + 2.0 * burnt) * coreA + uWhite * 3.0 * head * bodyA;
  float a = glowA * 0.5 + bodyA * 0.92;
  gl_FragColor = vec4(col * uFade, a * uFade);
}`;

export class QiSlash {
  readonly mesh: THREE.Mesh;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly vp = new THREE.Vector4();

  constructor(mask: THREE.Texture | null, renderOrder: number) {
    const v3 = (c: readonly number[]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);
    this.u = {
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uHalf: { value: 75 },
      uView: { value: new THREE.Vector2(1920, 1080) },
      tMask: { value: mask },
      uHasMask: { value: mask ? 1 : 0 },
      uHead: { value: 0 },
      uFade: { value: 0 },
      uErode: { value: 0 },
      uWhite: { value: v3(GRAMMAR.white) },
      uCyan: { value: v3(GRAMMAR.cyan) },
      uCyanLit: { value: v3(GRAMMAR.cyanLit) },
      uNavy: { value: v3(GRAMMAR.navy) },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: QI_SLASH_VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.vp);
      (this.u.uView!.value as THREE.Vector2).set(Math.max(1, this.vp.z), Math.max(1, this.vp.w));
    };
  }

  /** The slash from (ax, ay, az) to (bx, by, bz), `halfPx` half wide at 1080p; head 0–1, fade 0–1, erode 0–1. */
  set(ax: number, ay: number, az: number, bx: number, by: number, bz: number, halfPx: number, head: number, fade: number, erode: number): void {
    (this.u.uA!.value as THREE.Vector3).set(ax, ay, az);
    (this.u.uB!.value as THREE.Vector3).set(bx, by, bz);
    this.u.uHalf!.value = halfPx;
    this.u.uHead!.value = head;
    this.u.uFade!.value = fade;
    this.u.uErode!.value = erode;
    this.mesh.visible = fade > 0.003;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /** The element's colours (linear; element-kit.ts StreamTone.slash): hot core, body, lit body, falloff. */
  setColours(white: readonly number[], body: readonly number[], bodyLit: readonly number[], deep: readonly number[]): void {
    (this.u.uWhite!.value as THREE.Vector3).set(white[0]!, white[1]!, white[2]!);
    (this.u.uCyan!.value as THREE.Vector3).set(body[0]!, body[1]!, body[2]!);
    (this.u.uCyanLit!.value as THREE.Vector3).set(bodyLit[0]!, bodyLit[1]!, bodyLit[2]!);
    (this.u.uNavy!.value as THREE.Vector3).set(deep[0]!, deep[1]!, deep[2]!);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
