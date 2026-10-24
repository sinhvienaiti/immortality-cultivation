// Source: games/space-typing/src/scene3d/materials.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";

/** Shaders and material factories for the additive 3D effects. */
export const PARTICLE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -view.z);
  gl_Position = projectionMatrix * view;
}`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 texel = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * texel.rgb, texel.a * vAlpha);
}`;

/** Point sprites that each turn (fire puffs drawn from a photo would all look alike otherwise). */
export const TURNING_PARTICLE_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aRot;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vRot = aRot;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -view.z);
  gl_Position = projectionMatrix * view;
}`;

export const TURNING_PARTICLE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
void main() {
  float s = sin(vRot);
  float c = cos(vRot);
  vec2 p = gl_PointCoord - 0.5;
  vec2 uv = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  vec4 texel = texture2D(uMap, uv);
  gl_FragColor = vec4(vColor * texel.rgb, texel.a * vAlpha);
}`;

export const RIBBON_VERTEX = /* glsl */ `
attribute float aAlpha;
attribute float aSide;
varying float vAlpha;
varying float vSide;
void main() {
  vAlpha = aAlpha;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying float vSide;
void main() {
  float edge = 1.0 - vSide * vSide;
  vec3 color = mix(uColor, vec3(1.0), pow(edge, 6.0) * 0.7);
  gl_FragColor = vec4(color, vAlpha * edge);
}`;

/** A flame trail (particles.ts FlameTrail): along 0 at the source … 1 at the tail; side −1 … 1 across. */
export const FLAME_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aSide;
attribute float aAlpha;
varying float vAlong;
varying float vSide;
varying float vAlpha;
void main() {
  vAlong = aAlong;
  vSide = aSide;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * Fire, not a glow band: rolling noise eats a ragged edge into the strip and
 * sets the heat, white-gold in the core, orange, then dark red at the rim and
 * the tail; the tongues scroll back along it.
 */
export const FLAME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying float vAlong;
varying float vSide;
varying float vAlpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return value;
}
void main() {
  float across = abs(vSide);
  vec2 q = vec2(vAlong * 9.0 - uTime * 4.2 + uSeed, vSide * 2.4 + uTime * 0.9);
  float n = fbm(q);
  float tongues = fbm(q * vec2(2.4, 1.3) - vec2(uTime * 2.6, 0.0));
  // The body narrows toward the tail and its edge is torn by the noise.
  float body = 1.0 - smoothstep(0.12, 0.95, across + (n - 0.5) * 1.5 + vAlong * 0.75 - tongues * 0.4);
  // Hottest at the paw it pours from.
  float heat = body * (1.0 - vAlong * 0.9) * (0.5 + n * 0.8) + (1.0 - smoothstep(0.0, 0.18, vAlong)) * 0.35 * body;
  // Mostly orange and red; yellow in the hot middle, pale only in a few licks.
  vec3 color = mix(vec3(0.42, 0.03, 0.0), vec3(1.0, 0.28, 0.03), smoothstep(0.05, 0.4, heat));
  color = mix(color, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.78, heat));
  color = mix(color, vec3(1.0, 0.9, 0.62), smoothstep(0.85, 1.05, heat));
  // Gaps between the tongues, more of them toward the tail.
  float gaps = smoothstep(0.28, 0.7, n + 0.3 * (1.0 - vAlong));
  float alpha = clamp(body * 1.3, 0.0, 1.0) * gaps * vAlpha * uIntensity * 0.75;
  gl_FragColor = vec4(color, alpha);
}`;

/**
 * A fireball's streak of light (particles.ts LightTrail, FLAME_VERTEX
 * attributes): a white-gold core line in a soft ember glow, a shimmer running
 * back along it, cooling to red toward the tail.
 */
export const LIGHT_TRAIL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying float vAlong;
varying float vSide;
varying float vAlpha;
void main() {
  float edge = 1.0 - vSide * vSide;
  float glow = pow(edge, 1.8);
  float core = pow(edge, 14.0) * (1.0 - smoothstep(0.0, 0.8, vAlong));
  float shimmer = 0.82 + 0.18 * sin(vAlong * 38.0 - uTime * 46.0 + uSeed);
  vec3 warm = mix(vec3(1.0, 0.55, 0.12), vec3(0.85, 0.12, 0.02), smoothstep(0.1, 0.9, vAlong));
  vec3 color = warm * glow * 0.75 + vec3(1.0, 0.9, 0.65) * core * 1.4;
  gl_FragColor = vec4(color * shimmer, (glow * 0.6 + core) * vAlpha * uIntensity);
}`;

/**
 * The owner's fireball model (skills/dragon-fireball): its painted fire made
 * to burn. Geometry is normalized by fx.ts (length 1, nose at +z). The tail's
 * tongues sway; the head runs hot and white-gold where it faces the eye; the
 * rim glows ember and melts away, and the tail fades out, so no hard polygon
 * edge shows against the glow behind it.
 */
export const FIREBALL_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform mat3 uMapTransform;
varying vec2 vUv;
varying float vAlong;
varying float vFacing;
void main() {
  vUv = (uMapTransform * vec3(uv, 1.0)).xy;
  vAlong = position.z + 0.5;
  vec3 p = position;
  float tail = 1.0 - smoothstep(0.2, 0.8, vAlong);
  float wave = uTime * 13.0 + uSeed;
  p.x += sin(wave + p.z * 9.0 + p.y * 4.0) * 0.04 * tail;
  p.y += cos(wave * 1.13 + p.z * 8.0 + p.x * 5.0) * 0.04 * tail;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
  gl_Position = projectionMatrix * view;
}`;

export const FIREBALL_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uSeed;
uniform float uHeat;
uniform float uAlpha;
varying vec2 vUv;
varying float vAlong;
varying float vFacing;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  float flicker = 0.88 + 0.12 * sin(uTime * 37.0 + uSeed + vAlong * 11.0);
  float head = smoothstep(0.45, 1.0, vAlong);
  vec3 color = base * (1.1 + 1.05 * head) * flicker;
  color += vec3(1.0, 0.74, 0.38) * pow(vFacing, 4.0) * head * 0.8 * uHeat;
  float rim = 1.0 - vFacing;
  color += vec3(1.0, 0.32, 0.05) * rim * rim * 0.7;
  float alpha = smoothstep(0.0, 0.34, vAlong) * smoothstep(0.03, 0.4, vFacing + head * 0.3) * uAlpha;
  gl_FragColor = vec4(color, alpha);
}`;

const FRESNEL_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vToEye;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vToEye = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}`;

const FRESNEL_HEAD = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vToEye;
varying vec3 vLocal;
`;

export const BEAM_FRAGMENT = FRESNEL_HEAD + /* glsl */ `
void main() {
  float facing = abs(dot(normalize(vNormalView), normalize(vToEye)));
  float core = pow(facing, 2.5);
  float bands = 0.78 + 0.22 * sin(vUv.y * 140.0 - uTime * 70.0) * sin(vUv.x * 18.85 + uTime * 9.0);
  // Fades in over the first metres: from the play camera its root sits behind the hero.
  float ends = smoothstep(0.0, 0.09, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.8), uAlpha * (0.12 + 0.88 * core) * bands * ends);
}`;

export const SHIELD_FRAGMENT = FRESNEL_HEAD + /* glsl */ `
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vToEye))), 2.2);
  float cells = 0.5 + 0.5 * sin(vLocal.y * 26.0 + uTime * 7.0) * sin(vLocal.x * 22.0) * sin(vLocal.z * 22.0);
  gl_FragColor = vec4(uColor * (0.7 + 0.8 * cells), uAlpha * (rim * 0.95 + 0.06) * (0.7 + 0.3 * cells));
}`;

export const PILLAR_FRAGMENT = FRESNEL_HEAD + /* glsl */ `
void main() {
  float soft = pow(abs(dot(normalize(vNormalView), normalize(vToEye))), 1.6);
  float fadeY = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
  float stripes = 0.7 + 0.3 * sin(vUv.y * 46.0 - uTime * 9.0);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), soft * 0.55), uAlpha * soft * fadeY * stripes);
}`;

export const ATMOSPHERE_FRAGMENT = FRESNEL_HEAD + /* glsl */ `
void main() {
  float rim = pow(1.0 - max(0.0, dot(normalize(vNormalView), normalize(vToEye))), 3.0);
  gl_FragColor = vec4(uColor * 1.4, rim * uAlpha);
}`;

export function fxMaterial(fragment: string, color: THREE.Color, alpha = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uAlpha: { value: alpha }, uTime: { value: 0 } },
    vertexShader: FRESNEL_VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function glowSprite(map: THREE.Texture, color: THREE.Color, depthTest = true): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, color: color.clone(), transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending }),
  );
  sprite.renderOrder = 2;
  return sprite;
}
