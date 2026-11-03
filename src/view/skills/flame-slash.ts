/**
 * Key 7's finisher slash in fire (03/11 fixes, replace never stack: Fire drew Metal's sword-qi slash recoloured). The
 * same strip and shape as qi-slash.ts (the authored crescent unwrapped from origin to tip, ~150 px wide at 1080p, its
 * head running origin to tip), drawn as a flame: the crescent's body read as heat, licked outward into flame tongues
 * that scroll back from the head, coloured through the fire ramp (a soot edge, a vermilion-to-amber body, a thin
 * white-gold core that alone blooms), hotter just behind the head; it cools through the bands and erodes instead of
 * fading. Premultiplied, no depth test; view only.
 */
import * as THREE from "three";
import { QI_SLASH_VERTEX } from "./qi-slash";
import type { Rgb } from "./weapons";

const FRAGMENT = /* glsl */ `
uniform sampler2D tMask;
uniform float uHasMask;
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
float fsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fsHash(i), fsHash(i + vec2(1.0, 0.0)), u.x), mix(fsHash(i + vec2(0.0, 1.0)), fsHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fsFbm(vec2 p) {
  return fsNoise(p) * 0.5 + fsNoise(p * 2.03 + 3.1) * 0.3 + fsNoise(p * 4.1 + 7.7) * 0.2;
}
void main() {
  float s = vP.y;
  float v = vP.x;
  float body = m(s, v);
  float inner = min(m(s, v - 0.1), m(s, v + 0.1));
  float outer = max(max(m(s, v - 0.34), m(s, v + 0.34)), max(m(s, v - 0.18), m(s, v + 0.18)));
  // Flame tongues: noise narrow along the strip and long across it (streaks licking outward from the spine),
  // scrolling outward and back from the head.
  float side = abs(v);
  vec2 q = vec2(s * 38.0 + uTime * 2.0, side * 2.4 - uTime * 6.0);
  float warp = fsNoise(q * 0.45 + vec2(uTime * 0.7, 0.0));
  float n = fsFbm(q + vec2(warp * 2.2, warp * 0.6));
  // Tongues licking out past the crescent where the noise runs high.
  float lick = max(m(s, v - 0.52), m(s, v + 0.52)) * smoothstep(0.5, 0.85, n);
  // The head's heat stays inside the shape (at the strip's ends it would draw a square).
  float head = exp(-abs(s - uHead) * 22.0) * step(s, uHead + 0.05) * max(body, outer * 0.6);
  float behind = step(s, uHead + 0.02);
  // A clean hot spine and body (the cut), flame only at its edges.
  float heat = (body * 0.56 + inner * 0.36) * (0.95 + 0.07 * n) + outer * (n - 0.25) * 0.9 + lick * 0.5 + head * 0.55;
  heat *= mix(0.82, 1.0, behind);
  // It cools (falls through the bands) and erodes from its thin tongues; it never turns see-through.
  heat = heat * uFade - uErode * 0.55;
  float edge = 0.12 + (n - 0.5) * 0.08 + uErode * 0.12;
  float a = smoothstep(edge, edge + 0.05, heat);
  if (a <= 0.003) discard;
  float b = smoothstep(0.27, 0.4, heat);
  float c = smoothstep(0.8, 0.94, heat);
  vec3 col = mix(uSoot, mix(uDeep, uAmber, smoothstep(0.4, 0.78, heat)), b);
  col = mix(col, uCore * 2.4, c);
  a *= mix(0.86, 0.96, b);
  gl_FragColor = vec4(col * a, a);
}`;

export class FlameSlash {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly vp = new THREE.Vector4();

  constructor(renderOrder = 15) {
    const v3 = (): THREE.Vector3 => new THREE.Vector3();
    this.u = {
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uHalf: { value: 80 },
      uView: { value: new THREE.Vector2(1920, 1080) },
      tMask: { value: null },
      uHasMask: { value: 0 },
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

  /** As QiSlash.set, with the crescent mask and the flame's clock (s). Fade 0 hides it. */
  set(ax: number, ay: number, az: number, bx: number, by: number, bz: number, halfPx: number, head: number, fade: number, erode: number, mask: THREE.Texture | null, time: number): void {
    (this.u.uA!.value as THREE.Vector3).set(ax, ay, az);
    (this.u.uB!.value as THREE.Vector3).set(bx, by, bz);
    this.u.uHalf!.value = halfPx;
    this.u.uHead!.value = head;
    this.u.uFade!.value = fade;
    this.u.uErode!.value = erode;
    this.u.tMask!.value = mask;
    this.u.uHasMask!.value = mask !== null ? 1 : 0;
    this.u.uTime!.value = time;
    this.mesh.visible = fade > 0.003;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
