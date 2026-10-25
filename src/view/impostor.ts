/**
 * Impostors (canon §20.3, PB-34): an atlas of 16 directions × 8 phases of one
 * walk cycle per species (cells 192 px at High, 128 px at Low; 4 phases would
 * be the jerky motion the owner refuses). Columns are directions, rows are
 * phases (v grows with the phase); direction 0 is the beast facing the camera
 * and the direction index grows with the camera's azimuth round the beast
 * (counter-clockwise seen from above). An instanced camera-facing quad picks
 * its column from the view angle and blends the two neighbouring phases.
 * Sources: the in-page baker (render-to-texture of a posed subject, here the
 * crowd's VAT placeholder lit like the game) or a `bake_impostor.py` PNG +
 * JSON from the same GLB as the VAT. Switching a beast between VAT and
 * impostor (crowd.ts) waits 1 s past the threshold and blends 0.2 s.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import type { Quality } from "../content/types";
import { CAMERA } from "../content/rules";
import { IC_LIGHTS } from "./renderer";

export const IMPOSTOR = {
  directions: 16,
  phases: 8,
  /** canon §20.3: 192 px cells at High, 128 at Low; Medium 160 (đề xuất của vòng này). */
  cellPx: { low: 128, medium: 160, high: 192, ultra: 192 } as Readonly<Record<Quality, number>>,
  /** Empty border round the subject in a cell (mipmaps never reach the next cell's ink). */
  margin: 1.12,
} as const;

/** canon §20.3 (L4): a beast changes draw mode only after 1 s on the other side, then blends 0.2 s. */
export const MODE_SWITCH = { holdS: 1, blendS: 0.2 } as const;

const TAU = Math.PI * 2;

export interface ImpostorCell {
  direction: number;
  phase: number;
  /** Weight of the next phase ((phase + 1) mod phases). */
  blend: number;
}

/**
 * Atlas cell for a view angle (radians, 0 = the beast faces the camera,
 * growing with the camera's azimuth round it) and a walk phase 0–1: the
 * nearest of 16 directions, the phase below and the weight of the next one.
 */
export function impostorCell(viewAngle: number, phase: number, out: ImpostorCell = { direction: 0, phase: 0, blend: 0 }, directions: number = IMPOSTOR.directions, phases: number = IMPOSTOR.phases): ImpostorCell {
  const steps = Math.round((viewAngle / TAU) * directions);
  out.direction = ((steps % directions) + directions) % directions;
  const p = (((phase % 1) + 1) % 1) * phases;
  const base = Math.floor(p);
  out.phase = base % phases;
  out.blend = p - base;
  return out;
}

/** View angle of a beast at (x, z) heading `heading` (local +z = (sin, cos)) seen from a camera at (camX, camZ). */
export function viewAngleOf(heading: number, x: number, z: number, camX: number, camZ: number): number {
  return Math.atan2(camX - x, camZ - z) - heading;
}

/** UV rectangle [u0, v0, u1, v1] of a cell (column = direction, row = phase, v up). */
export function cellUv(direction: number, phase: number, directions: number = IMPOSTOR.directions, phases: number = IMPOSTOR.phases): readonly [number, number, number, number] {
  return [direction / directions, phase / phases, (direction + 1) / directions, (phase + 1) / phases];
}

/** Atlas bytes on the GPU (RGBA8, mipmaps a third more). */
export function atlasBytes(cellPx: number, directions: number = IMPOSTOR.directions, phases: number = IMPOSTOR.phases, mipmaps = true): number {
  return Math.round(directions * phases * cellPx * cellPx * 4 * (mipmaps ? 4 / 3 : 1));
}

export interface ImpostorAtlas {
  readonly texture: THREE.Texture;
  readonly directions: number;
  readonly phases: number;
  readonly cellPx: number;
  /** Quad side in metres for the look at size 1. */
  readonly frameM: number;
  /** Quad centre above the feet, metres, at size 1. */
  readonly centreY: number;
  /** Seconds of the walk cycle the phases cover. */
  readonly cycleS: number;
  readonly bytes: number;
  /** "in-page" or the baked file's URL. */
  readonly source: string;
  /** Disposes the texture (and its render target). */
  dispose(): void;
}

// ── In-page baker (render to texture) ───────────────────────────────────────

/** What the baker photographs: an object posed by walk phase and heading. */
export interface ImpostorSubject {
  readonly object: THREE.Object3D;
  pose(phase: number, heading: number): void;
  /** Bounding radius round (0, centreY, 0), metres. */
  readonly radius: number;
  readonly centreY: number;
  readonly cycleS: number;
}

export interface BakeOptions {
  readonly cellPx: number;
  /** Camera tilt below the horizon (default the game's, canon D48). */
  readonly tiltDeg?: number;
  readonly directions?: number;
  readonly phases?: number;
}

const COPY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;
const COPY_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uMap, vUv);
}`;

/**
 * Photographs `subject` from `directions` azimuths at the game's tilt and
 * `phases` walk phases into an RGBA8 atlas with mipmaps. The subject turns
 * (heading = −azimuth) under the game's lights while the camera stays where
 * the game's is, so a cell shows what the game would show. Each cell is drawn
 * in a small render target with depth, then copied into the atlas (no depth
 * buffer kept). Load-time work; the renderer's state is restored.
 */
export function bakeImpostorAtlas(renderer: THREE.WebGLRenderer, subject: ImpostorSubject, options: BakeOptions): ImpostorAtlas {
  const directions = options.directions ?? IMPOSTOR.directions;
  const phases = options.phases ?? IMPOSTOR.phases;
  const maxSize = renderer.capabilities.maxTextureSize;
  const cellPx = Math.min(options.cellPx, Math.floor(maxSize / directions), Math.floor(maxSize / phases));
  const width = directions * cellPx;
  const height = phases * cellPx;
  const atlas = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cell = new THREE.WebGLRenderTarget(cellPx, cellPx, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(IC_LIGHTS.hemisphere.sky, IC_LIGHTS.hemisphere.ground, IC_LIGHTS.hemisphere.intensity);
  const key = new THREE.DirectionalLight(IC_LIGHTS.key.color, IC_LIGHTS.key.intensity);
  key.position.set(...IC_LIGHTS.key.position);
  const rims = IC_LIGHTS.rims.map((rim) => {
    const light = new THREE.DirectionalLight(rim.color, rim.intensity);
    light.position.set(...rim.position);
    return light;
  });
  scene.add(hemi, key, ...rims, subject.object);
  const frame = subject.radius * 2 * IMPOSTOR.margin;
  const camera = new THREE.OrthographicCamera(-frame / 2, frame / 2, frame / 2, -frame / 2, 0.01, subject.radius * 12);
  const tilt = THREE.MathUtils.degToRad(options.tiltDeg ?? CAMERA.defaultTiltDeg);
  const centre = new THREE.Vector3(0, subject.centreY, 0);
  camera.position.set(0, subject.centreY + Math.sin(tilt) * subject.radius * 5, Math.cos(tilt) * subject.radius * 5);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);

  const copyScene = new THREE.Scene();
  const copyMaterial = new THREE.ShaderMaterial({ uniforms: { uMap: { value: cell.texture } }, vertexShader: COPY_VERTEX, fragmentShader: COPY_FRAGMENT, depthTest: false, depthWrite: false });
  const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), copyMaterial);
  copyQuad.frustumCulled = false;
  copyScene.add(copyQuad);
  const copyCamera = new THREE.Camera();

  const before = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.setRenderTarget(atlas);
  renderer.clear(true, false, false);
  for (let p = 0; p < phases; p += 1) {
    for (let d = 0; d < directions; d += 1) {
      subject.pose(p / phases, -(d / directions) * TAU);
      subject.object.updateMatrixWorld(true);
      renderer.setRenderTarget(cell);
      renderer.render(scene, camera);
      atlas.viewport.set(d * cellPx, p * cellPx, cellPx, cellPx);
      atlas.scissor.set(d * cellPx, p * cellPx, cellPx, cellPx);
      atlas.scissorTest = true;
      // Mipmaps once, after the last cell.
      atlas.texture.generateMipmaps = p === phases - 1 && d === directions - 1;
      renderer.setRenderTarget(atlas);
      renderer.render(copyScene, copyCamera);
    }
  }
  atlas.scissorTest = false;
  atlas.viewport.set(0, 0, width, height);
  renderer.setRenderTarget(before);
  renderer.setClearColor(clear, clearAlpha);
  renderer.autoClear = autoClear;
  scene.remove(subject.object);
  hemi.dispose();
  key.dispose();
  for (const rim of rims) rim.dispose();
  copyQuad.geometry.dispose();
  copyMaterial.dispose();
  cell.dispose();
  return {
    texture: atlas.texture,
    directions,
    phases,
    cellPx,
    frameM: frame,
    centreY: subject.centreY,
    cycleS: subject.cycleS,
    bytes: atlasBytes(cellPx, directions, phases, true),
    source: "in-page",
    dispose: () => atlas.dispose(),
  };
}

// ── Baked files (scripts/models/blender/bake_impostor.py) ───────────────────

/** The JSON beside an atlas PNG (bake_impostor.py: `yaws` directions × `phases`). */
export interface ImpostorFileMeta {
  readonly id: string;
  readonly yaws: number;
  readonly phases: number;
  readonly tile: number;
  readonly elevationDeg: number;
  /** Quad side in model units (the ortho frame). */
  readonly frameSize: number;
  /** Frame centre above the model's lowest point. */
  readonly centreY: number;
  readonly cycleS: number;
  readonly image: string;
}

/** Loads a baked atlas (PNG rows bottom-up = phase 0 first; sRGB). */
export async function loadImpostorAtlas(url: string): Promise<ImpostorAtlas> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("impostor: " + url + " " + response.status);
  const meta = (await response.json()) as ImpostorFileMeta;
  const imageUrl = new URL(meta.image, new URL(url, globalThis.location?.href ?? "http://localhost/")).href;
  const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return {
    texture,
    directions: meta.yaws,
    phases: meta.phases,
    cellPx: meta.tile,
    frameM: meta.frameSize,
    centreY: meta.centreY,
    cycleS: meta.cycleS,
    bytes: atlasBytes(meta.tile, meta.yaws, meta.phases, true),
    source: url,
    dispose: () => texture.dispose(),
  };
}

// ── The instanced quad ──────────────────────────────────────────────────────

/**
 * Per instance: `instanceMatrix` as the crowd writes it (yaw, size × squash,
 * feet position), `aState` (flash, dissolve, tint id, tint mix), `aImp`
 * (phase 0–1, crossfade 0–1, 0, 0). Uniforms: `uLook` (the look's size the
 * atlas was baked at), `uImpFrame` (quad side m, centre height m, directions,
 * phases), `uTint` (status tint table).
 */
const IMPOSTOR_VERTEX = /* glsl */ `
uniform vec3 uLook;
uniform vec4 uImpFrame;
attribute vec4 aState;
attribute vec4 aImp;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vQuad;
varying float vBlend;
varying vec4 vState;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec3 col0 = instanceMatrix[0].xyz;
  float sx = length(col0);
  float sy = instanceMatrix[1].y;
  float heading = atan(-col0.z, col0.x);
  vec3 origin = instanceMatrix[3].xyz;
  float sw = sx / uLook.x;
  float sh = sy / uLook.y;
  vec3 centre = origin + vec3(0.0, uImpFrame.y * sh, 0.0);
  vec3 toCam = cameraPosition - centre;
  float dirs = uImpFrame.z;
  float phases = uImpFrame.w;
  float view = atan(toCam.x, toCam.z) - heading;
  float d = mod(floor(view / 6.2831853 * dirs + 0.5), dirs);
  float ph = fract(aImp.x) * phases;
  float p0 = floor(ph);
  float p1 = mod(p0 + 1.0, phases);
  vBlend = ph - p0;
  vec2 cell = vec2(1.0 / dirs, 1.0 / phases);
  vUv0 = (vec2(d, p0) + uv) * cell;
  vUv1 = (vec2(d, p1) + uv) * cell;
  vQuad = uv;
  vState = aState;
  vFade = aImp.y;
  vec3 right = vec3(viewMatrix[0].x, viewMatrix[1].x, viewMatrix[2].x);
  vec3 up = vec3(viewMatrix[0].y, viewMatrix[1].y, viewMatrix[2].y);
  vec3 world = centre + (right * position.x * sw + up * position.y * sh) * uImpFrame.x;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const IMPOSTOR_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uTint[8];
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vQuad;
varying float vBlend;
varying vec4 vState;
varying float vFade;
#include <fog_pars_fragment>
float impHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float impNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(impHash(i), impHash(i + vec2(1.0, 0.0)), f.x), mix(impHash(i + vec2(0.0, 1.0)), impHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 c = mix(texture2D(uAtlas, vUv0), texture2D(uAtlas, vUv1), vBlend);
  if (c.a < 0.5) discard;
  // Crossfade with the VAT body: the complementary dither pattern.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ign < 1.0 - vFade) discard;
  float n = impNoise(vQuad * 7.0) * 0.75 + impNoise(vQuad * 19.0) * 0.25;
  if (vState.y > 0.001 && n < vState.y * 1.08) discard;
  vec3 rgb = c.rgb;
  int tintId = int(vState.z + 0.5);
  vec3 tint = uTint[clamp(tintId, 0, 7)];
  rgb = mix(rgb, rgb * tint * 1.25, vState.w * 0.75);
  float ink = vState.y > 0.001 ? 1.0 - smoothstep(0.0, 0.14, n - vState.y * 1.08) : 0.0;
  rgb *= 1.0 - 0.8 * ink;
  rgb += vec3(1.6, 1.55, 1.4) * vState.x;
  if (vState.y > 0.001) rgb += vec3(0.96, 0.93, 0.84) * (1.0 - smoothstep(0.0, 0.05, n - vState.y * 1.08)) * 1.8;
  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * The impostor material of one species layer (one draw call for all its
 * instances). `frame` overrides the atlas's quad side and centre height (m at
 * size 1, the centre measured from the instance origin): the crowd passes them
 * for a model scaled to its look and lifted onto its feet.
 */
export function createImpostorMaterial(
  atlas: ImpostorAtlas,
  lookSizeM: readonly [number, number, number],
  tints: readonly THREE.Color[],
  frame: { readonly sideM: number; readonly centreM: number } = { sideM: atlas.frameM, centreM: atlas.centreY },
): THREE.ShaderMaterial {
  const tintValues: THREE.Color[] = [];
  for (let k = 0; k < 8; k += 1) tintValues.push(tints[k]?.clone() ?? new THREE.Color(1, 1, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uLook: { value: new THREE.Vector3(...lookSizeM) },
        uImpFrame: { value: new THREE.Vector4(frame.sideM, frame.centreM, atlas.directions, atlas.phases) },
      },
    ]),
    vertexShader: IMPOSTOR_VERTEX,
    fragmentShader: IMPOSTOR_FRAGMENT,
    fog: true,
  });
  // Set after the merge: it clones textures (a render target's texture cannot be cloned) and colours.
  material.uniforms.uAtlas = { value: atlas.texture };
  material.uniforms.uTint = { value: tintValues };
  return material;
}
