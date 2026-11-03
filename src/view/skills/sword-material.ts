/**
 * The real sword's look in every skill (owner 03/11/2026: "rõ ràng chúng ta đã có hình ảnh kiếm r, sao hình bạn
 * dùng trong skill lại như kiểu là tự style ra vậy"): the equipped weapon's own PBR material (its base colour,
 * ORM and normal maps, the full GLB or its textured LOD) under the scene's light, patched with only what may sit
 * around a real sword (the brief of 03/11):
 * - a narrow white-hot edge line along each cutting edge (the outer ~12 % of each half, so ≤ 30 % of the blade's
 *   width; HDR, the only part that blooms), brighter with the skill's charge (`glow`) and a hit (`flash`);
 * - a soft fresnel rim in the skill's colour (≤ 0.9);
 * - the jade's own soft light (a hue mask on the colour map, measured on the Tripo map; it only fills the headroom
 *   under the bloom threshold, so the ring and beads glow without blooming into a blob);
 * - a hit flash that lifts the sword toward its own colours, and a noisy dissolve with a light edge for appearing
 *   from and melting into light (instead of an alpha fade, which an opaque metal cannot do).
 * Never a tint over the texture, a glow card over the blade, or a stand-in shape. Per-instance values come from two
 * instanced attributes the sword sets own (blades.ts BladeSet): `iFx` (glow, flash, dissolve, seed) and `iRim`
 * (the rim colour, linear). `aEdge` (per vertex, `edgeField`) is the blade's edge field: |x| / the blade's half
 * width at that height, 0 on the spine, 1 at the edge, 0 off the blade.
 * SWORD_LIGHT is one uniform for every skill sword: while the screen effects dim the world's lights (darkening),
 * the host raises it by the inverse, so the swords keep the scene's normal light on a darkened field.
 */
import * as THREE from "three";

/** Gain on the skill swords' lit colour (direct and image-based light, not their emission); the host sets it. */
export const SWORD_LIGHT: { value: number } = { value: 1 };

/** The edge line's light (linear, HDR × glow): a cyan-tinted white, so its bloom reads cyan, not a white smear. */
export const EDGE_HOT: readonly [number, number, number] = [0.62 * 3.6, 0.88 * 3.6, 1.0 * 3.6];

const PARS_VERTEX = /* glsl */ `
attribute float aEdge;
attribute vec4 iFx;
attribute vec3 iRim;
varying vec3 vSwP;
varying float vSwE;
varying vec4 vSwFx;
varying vec3 vSwRim;
`;

const PARS_FRAGMENT = /* glsl */ `
uniform vec3 uSwEdge;
uniform vec3 uSwJade;
uniform float uSwLight;
uniform float uSwBladeFrom;
varying vec3 vSwP;
varying float vSwE;
varying vec4 vSwFx;
varying vec3 vSwRim;
float swHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float swNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(swHash(i), swHash(i + vec3(1.0, 0.0, 0.0)), u.x), mix(swHash(i + vec3(0.0, 1.0, 0.0)), swHash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(swHash(i + vec3(0.0, 0.0, 1.0)), swHash(i + vec3(1.0, 0.0, 1.0)), u.x), mix(swHash(i + vec3(0.0, 1.0, 1.0)), swHash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
`;

/** Dissolve (iFx.z: 0 whole … 1 gone): noise in the unit blade's space, seeded per instance; sets swDe, its light edge. */
const DISSOLVE = /* glsl */ `
  float swD = vSwFx.z;
  float swF = swNoise(vSwP * vec3(16.0, 7.0, 16.0) + vSwFx.w * 13.7) * 0.8 + clamp(0.5 - vSwP.y * 0.35, 0.0, 1.0) * 0.2;
  if (swD > 0.002 && swF < swD * 1.04) discard;
  float swDe = swD > 0.002 ? (1.0 - smoothstep(0.0, 0.07, swF - swD * 1.04)) : 0.0;
`;

/** The jade mask from the colour map (pale grey-green: green over red, not under blue; hand-sword.ts measured it). */
const JADE = /* glsl */ `
  vec3 swC = diffuseColor.rgb;
  float swJade = smoothstep(0.07, 0.17, (swC.g - swC.r) / max(swC.g, 0.04)) * smoothstep(-0.05, 0.0, swC.g - swC.b);
`;

const EMIT = /* glsl */ `
  float swGlow = vSwFx.x;
  float swFlash = vSwFx.y;
  float swOn = smoothstep(uSwBladeFrom, uSwBladeFrom + 0.04, vSwP.y) * (1.0 - smoothstep(0.985, 1.0, vSwP.y));
  float swLine = smoothstep(0.8, 0.95, vSwE) * swOn;
  // Under a pixel wide (a small or far sword) the line keeps its share of the pixel, not the pixel: at full
  // strength it bloomed over the whole blade and turned it into a white tube.
  swLine *= clamp(0.18 / max(fwidth(vSwE), 1e-3), 0.2, 1.0);
  float swRoot = 0.45 + 0.55 * smoothstep(uSwBladeFrom, 0.6, vSwP.y);
  totalEmissiveRadiance += uSwEdge * swLine * swRoot * min(swGlow + swFlash, 1.6);
  float swFr = pow(clamp(1.0 - abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.6);
  totalEmissiveRadiance += vSwRim * swFr * (0.22 + 0.4 * swGlow + 0.5 * min(swFlash, 1.0));
  vec3 swTint = swC / max(max(swC.r, swC.g), max(swC.b, 1e-3));
  vec3 swJadeE = swTint * uSwJade * swJade * (0.16 + 0.24 * swGlow + 0.4 * min(swFlash, 1.0));
  totalEmissiveRadiance += swJadeE;
  totalEmissiveRadiance += swC * min(swFlash, 1.5) * 0.55;
  totalEmissiveRadiance += uSwEdge * swDe * 0.7;
`;

/**
 * The light gain undoes the darkening of the world's lights (sun, hemisphere, key, rims, image-based light); the
 * point lights (the impact flashes) are never dimmed, so they enter at 1 / gain and leave at their own strength
 * (with the gain on them, an impact flash lit the swords 1.8–3.3× brighter than the beasts beside them during key 7
 * and K5).
 */
const POINT_LIGHT = "getPointLightInfo( pointLight, geometryPosition, directLight );";

/** The lit colour takes the light gain; the jade fills only the headroom under luminance 0.95 (no bloom). */
const OUTGOING = /* glsl */ `
  vec3 outgoingLight = (totalDiffuse + totalSpecular) * uSwLight + totalEmissiveRadiance;
  float swBase = dot(outgoingLight - swJadeE, vec3(0.299, 0.587, 0.114));
  float swJl = dot(swJadeE, vec3(0.299, 0.587, 0.114));
  outgoingLight -= swJadeE * (1.0 - min(1.0, max(0.0, 0.95 - swBase) / max(swJl, 1e-4)));
`;

export interface SwordMaterialOptions {
  /** Where the blade starts on the unit blade (y; just past the guard's band). */
  readonly bladeFrom: number;
  /** The jade's soft light (linear, ≤ 0.86); black: no jade glow. */
  readonly jade: readonly [number, number, number];
}

/** Patches a weapon's own material (cloned by the caller) into the skill swords' look. Load time only. */
export function patchSwordMaterial(material: THREE.MeshStandardMaterial, opts: SwordMaterialOptions): THREE.MeshStandardMaterial {
  const uniforms = {
    uSwEdge: { value: new THREE.Vector3(EDGE_HOT[0], EDGE_HOT[1], EDGE_HOT[2]) },
    uSwJade: { value: new THREE.Vector3(opts.jade[0], opts.jade[1], opts.jade[2]) },
    uSwLight: SWORD_LIGHT,
    uSwBladeFrom: { value: opts.bladeFrom },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = PARS_VERTEX + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvSwP = position;\n\tvSwE = aEdge;\n\tvSwFx = iFx;\n\tvSwRim = iRim;");
    const frag = shader.fragmentShader
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + DISSOLVE)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + JADE)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + EMIT)
      .replace("#include <lights_fragment_begin>", THREE.ShaderChunk.lights_fragment_begin.replace(POINT_LIGHT, POINT_LIGHT + "\n\t\tdirectLight.color /= uSwLight;"))
      .replace("vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;", OUTGOING);
    if (!frag.includes("uSwLight + totalEmissiveRadiance")) throw new Error("[sword-material] three's physical shader changed: the light gain hook is missing");
    if (!frag.includes("directLight.color /= uSwLight;")) throw new Error("[sword-material] three's light chunk changed: the point lights' gain hook is missing");
    shader.fragmentShader = PARS_FRAGMENT + frag;
  };
  material.customProgramCacheKey = () => "real-sword";
  material.needsUpdate = true;
  return material;
}

/**
 * The blade's edge field as a vertex attribute `aEdge` on a unit blade (jian convention: tip +Y at 1, spine on
 * x = 0, flat facing ±Z): |x| over the blade's half width at that height, for y from `bladeFrom` to the tip; 0
 * elsewhere. Load time only.
 */
export function edgeField(geometry: THREE.BufferGeometry, bladeFrom: number): void {
  const pos = geometry.getAttribute("position");
  const S = 96;
  const half = new Float32Array(S);
  const span = 1 - bladeFrom;
  const slice = (y: number): number => Math.min(S - 1, Math.max(0, Math.floor(((y - bladeFrom) / span) * S)));
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < bladeFrom || y > 1.001) continue;
    const s = slice(y);
    const x = Math.abs(pos.getX(i));
    if (x > half[s]!) half[s] = x;
  }
  // Empty slices take the nearest filled one toward the guard (the profile only narrows toward the tip).
  for (let s = 1; s < S; s += 1) if (half[s]! <= 0) half[s] = half[s - 1]!;
  const e = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < bladeFrom || y > 1.001) continue;
    e[i] = Math.min(1, Math.abs(pos.getX(i)) / Math.max(half[slice(y)]!, 1e-4));
  }
  geometry.setAttribute("aEdge", new THREE.BufferAttribute(e, 1));
}

/**
 * The roll (rad, round the blade's own axis) that turns a unit blade laid along a direction so its flat faces a
 * camera (WEAPON_DESIGN §2 rule 4: the motifs lie on the face toward the camera), so the hollow ring reads as an O
 * at any size. Continuous in the direction. No allocation.
 */
export class FaceRoll {
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly d = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  of(cam: THREE.Vector3, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
    const d = this.d.set(dx, dy, dz);
    if (d.lengthSq() < 1e-10) return 0;
    d.normalize();
    this.q.setFromUnitVectors(this.up, d);
    const e = this.e.set(1, 0, 0).applyQuaternion(this.q);
    const n = this.n.set(0, 0, 1).applyQuaternion(this.q);
    let vx = cam.x - x;
    let vy = cam.y - y;
    let vz = cam.z - z;
    const vd = vx * d.x + vy * d.y + vz * d.z;
    vx -= d.x * vd;
    vy -= d.y * vd;
    vz -= d.z * vd;
    return Math.atan2(vx * e.x + vy * e.y + vz * e.z, vx * n.x + vy * n.y + vz * n.z);
  }
}
