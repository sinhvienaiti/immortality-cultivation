/**
 * The one renderer (canon §20, §21.1, PB-35): kit Stage3D with rules.ts
 * TT_TIERS (4 keys, ultra = high at MVP) and TT_MSAA (canon D57: MSAA on the
 * post chain's targets, set here because the kit's composer has none);
 * NeutralToneMapping set on
 * `stage.renderer` right after construction (the kit fixes ACES; OutputPass
 * reads the renderer's value); a fixed 3/4 camera (tilt 50–55°, FOV 25–30°)
 * fitted so the whole 40 × 26 m field shows at any aspect, 16:9 included; a
 * Projector with no allocation per call; `renderer.info` read after the whole
 * frame (draw calls include the post passes: the kit resets info once per
 * frame and never between passes); everything disposed on dispose().
 * Budgets other than the StageTier row (swords, LOD triangles, draw-call caps,
 * sub-budgets) live in rules.ts TT_BUDGETS; this file draws, it judges nothing.
 * Owner: Lane 1 (milestone 1a).
 */
import * as THREE from "three";
import { Stage3D, type StageLights } from "../kit/three/stage";
import type { Projector, Quality, ScreenPoint } from "../app/contracts";
import { CAMERA, DYNAMIC_RES, FIELD, TT_DYNAMIC_RES, TT_MSAA, TT_TIERS } from "../content/rules";
import { DynamicResolution } from "./dynamic-resolution";

export interface RenderInfo {
  readonly drawCalls: number;
  readonly triangles: number;
  /** WEBGL_debug_renderer_info string (SwiftShader / llvmpipe runs are invalid). */
  readonly gpu: string;
  /** The pixel ratio drawn this frame (canon D57: dynamic on High and Ultra). */
  readonly pixelRatio: number;
}

/** Scene groups in draw order: ground and decals, beasts and actors, effects. */
export interface RenderLayers {
  readonly ground: THREE.Group;
  readonly actors: THREE.Group;
  readonly fx: THREE.Group;
}

/** CSS pixels the DOM keeps at the top and bottom of the canvas (HUD, Bàn Quyết); the field is fitted between. */
export interface ViewInsets {
  readonly top: number;
  readonly bottom: number;
}

export interface Renderer3D {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly quality: Quality;
  readonly project: Projector;
  /** The kit stage: bloom pass, lights, impact flash, point scale for particles. */
  readonly stage: Stage3D;
  readonly canvas: HTMLCanvasElement;
  readonly layers: RenderLayers;
  /** The whole-field fit of the last resize or inset change (canon D57: zoom blends from it toward the hero). */
  readonly fit: CameraFit;
  /** The last frame's counts; the same object every call (read it, do not keep it). */
  info(): RenderInfo;
  /** Camera before DOM projection (M0A_PLAN §6.9 frame order), then draw. */
  render(dt: number): void;
  resize(): void;
  /** Another tier (draws differently, never changes the rules, D12). */
  setQuality(quality: Quality): void;
  /** Keeps the field clear of DOM bands (CSS px) and refits the camera. */
  setViewInsets(insets: ViewInsets): void;
  /** Pins the pixel ratio (captures, perf runs) or, with null, hands it back to the dynamic resolution (D57). */
  pinPixelRatio(dpr: number | null): void;
  /**
   * Something drawn over the finished frame in screen space (the damage
   * numbers, hitfx.ts), after the post passes; returns its removal. Its draw
   * calls count in info().
   */
  addOverlay(overlay: Overlay): () => void;
  dispose(): void;
}

/** A screen-space pass over the frame: `width` × `height` CSS px. */
export interface Overlay {
  draw(renderer: THREE.WebGLRenderer, width: number, height: number): void;
}

export interface ScenePrewarmReport {
  textures: { id: number; name: string }[];
  programs: { id: number; name: string; cacheKey: string }[];
  objects: { name: string; materials: number[]; shadow: boolean }[];
  target: { width: number; height: number; type: number; format: number; colorSpace: string; samples: number };
  renders: number;
}

/** Load-time only: exercise the real buffers/programs, without entering any pool's emit/update path. */
export function prewarmScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  template: THREE.WebGLRenderTarget, extraTextures: readonly THREE.Texture[] = [], beforeRender?: () => void): ScenePrewarmReport {
  const target = template.clone();
  target.setSize(64, 64);
  const was = renderer.getRenderTarget();
  const restore: (() => void)[] = [];
  const textures = new Set<THREE.Texture>();
  const objects: ScenePrewarmReport["objects"] = [];
  const upload = (value: unknown): void => {
    if (!(value instanceof THREE.Texture) || value.isRenderTargetTexture || textures.has(value)) return;
    renderer.initTexture(value);
    textures.add(value);
  };
  try {
    if (renderer.shadowMap.enabled) {
      const { autoUpdate, needsUpdate } = renderer.shadowMap;
      renderer.shadowMap.autoUpdate = true;
      restore.push(() => { renderer.shadowMap.autoUpdate = autoUpdate; renderer.shadowMap.needsUpdate = needsUpdate; });
    }
    for (const texture of extraTextures) upload(texture);
    scene.traverse((object) => {
      const visible = object.visible;
      // Keep the scene's light count, including zero-intensity flash lights, unchanged.
      if (!(object instanceof THREE.Light)) object.visible = true;
      restore.push(() => { object.visible = visible; });
      if (object instanceof THREE.Light && object.castShadow && object.shadow !== undefined) {
        const { shadow } = object;
        const { autoUpdate, needsUpdate } = shadow;
        shadow.autoUpdate = true;
        restore.push(() => { shadow.autoUpdate = autoUpdate; shadow.needsUpdate = needsUpdate; });
      }
      const mesh = object as THREE.Mesh;
      if (mesh.geometry === undefined || mesh.material === undefined) return;
      const culled = mesh.frustumCulled;
      mesh.frustumCulled = false;
      restore.push(() => { mesh.frustumCulled = culled; });
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // Exercise USE_MAP with both USE_SKINNING and USE_INSTANCING in the real shadow pass.
      if ((mesh instanceof THREE.SkinnedMesh || mesh instanceof THREE.InstancedMesh) &&
        materials.some((m) => (m as THREE.MeshBasicMaterial).map instanceof THREE.Texture)) {
        const castShadow = mesh.castShadow;
        mesh.castShadow = true;
        restore.push(() => { mesh.castShadow = castShadow; });
      }
      objects.push({ name: mesh.name || `${mesh.type}:${mesh.id}`, materials: materials.map((m) => m.id), shadow: mesh.castShadow });
      for (const material of [...materials, mesh.customDepthMaterial, mesh.customDistanceMaterial]) {
        if (material === undefined) continue;
        for (const value of Object.values(material)) upload(value);
        if (material instanceof THREE.ShaderMaterial) {
          for (const uniform of Object.values(material.uniforms)) {
            upload(uniform.value);
            // onBeforeRender may write viewport/time uniforms: keep the live material intact.
            const value = uniform.value;
            const saved = !(value instanceof THREE.Texture) && value?.clone instanceof Function ? value.clone() : value;
            restore.push(() => {
              if (value?.copy instanceof Function && saved !== value) value.copy(saved);
              else uniform.value = saved;
            });
          }
          // QiSlash starts hidden with coincident endpoints and zero fade.
          if (material.uniforms.uHead !== undefined && material.uniforms.uHasMask !== undefined) {
            material.uniforms.uFade!.value = 1;
            (material.uniforms.uA!.value as THREE.Vector3).set(-0.5, 1, 0);
            (material.uniforms.uB!.value as THREE.Vector3).set(0.5, 1, 0);
          }
        }
      }
      const geometry = mesh.geometry;
      // One GPU card at age zero. Logical pool state, cursors, clocks and RNG are never touched.
      if (geometry instanceof THREE.InstancedBufferGeometry && geometry.instanceCount === 0) {
        geometry.instanceCount = 1;
        restore.push(() => { geometry.instanceCount = 0; });
        for (const [name, attr] of Object.entries(geometry.attributes)) {
          if (!(attr instanceof THREE.InstancedBufferAttribute)) continue;
          const saved = attr.array.slice(0, attr.itemSize);
          const sample: Record<string, number[]> = {
            iPos: [0, 1, 0, 1], iCol: [1, 1, 1, 1], iRot: [0, 0, 1, 0], iVel: [0, 0, 0],
            iData: [1, 0, 0, 1], iColor: [1, 1, 1, -1e5], iDir: [1, 0, 0, 0], iAge: [0, 0, 0, 0],
            iLift: [0, 1], iCtl: [1, -0.08, 0.08, 0], iVar: [0],
            iP0: [0, 1, 0, Number((materials[0] as THREE.ShaderMaterial).uniforms?.uTime?.value ?? 0)],
            iV0: [0, 0, 0, 1], iA: [1, 0, 1, 1], iB: [0, 0, 0, 0],
          };
          for (let i = 0; i < attr.itemSize; i += 1) attr.array[i] = sample[name]?.[i] ?? 1;
          attr.needsUpdate = true;
          restore.push(() => { attr.array.set(saved); attr.needsUpdate = true; });
        }
      }
      if (mesh instanceof THREE.InstancedMesh && mesh.count === 0) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(0, matrix);
        mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1, 0));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = 1;
        restore.push(() => { mesh.count = 0; mesh.setMatrixAt(0, matrix); mesh.instanceMatrix.needsUpdate = true; });
      }
      if (geometry.drawRange.count === 0) {
        const { start, count } = geometry.drawRange;
        geometry.setDrawRange(0, 6);
        restore.push(() => geometry.setDrawRange(start, count));
      }
    });
    // Also compile the display variant used by overlays and Low/Medium.
    renderer.setRenderTarget(null);
    renderer.compile(scene, camera);
    renderer.setRenderTarget(target);
    renderer.compile(scene, camera);
    // Three r170 draws shadows before setupLights(). The actor mask hides FX lights and leaves that
    // light state for the next frame's depth-program key; replay it after compile, which resets it.
    if (beforeRender !== undefined) {
      const { background, overrideMaterial } = scene;
      const autoClear = renderer.autoClear;
      const clearColor = renderer.getClearColor(new THREE.Color());
      const clearAlpha = renderer.getClearAlpha();
      try { beforeRender(); }
      finally {
        scene.background = background;
        scene.overrideMaterial = overrideMaterial;
        renderer.autoClear = autoClear;
        renderer.setClearColor(clearColor, clearAlpha);
      }
    }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    return {
      textures: [...textures].map((t) => ({ id: t.id, name: t.name || t.image?.src || t.uuid })),
      programs: (renderer.info.programs ?? []).map((p) => ({ id: p.id, name: p.name, cacheKey: p.cacheKey })),
      objects,
      target: { width: target.width, height: target.height, type: target.texture.type, format: target.texture.format,
        colorSpace: target.texture.colorSpace, samples: target.samples },
      renders: 1,
    };
  } finally {
    for (let i = restore.length - 1; i >= 0; i -= 1) restore[i]!();
    renderer.setRenderTarget(was);
    target.dispose();
  }
}

// ── The fixed camera (canon §21.1) ──────────────────────────────────────────

/** The field in metres (rules.ts FIELD, canon §8.1): heart at the origin, gates north (−z), the camera south (+z). */
export const FIELD_M = {
  minX: FIELD.minXMm / 1000,
  maxX: FIELD.maxXMm / 1000,
  minZ: FIELD.minZMm / 1000,
  maxZ: FIELD.maxZMm / 1000,
} as const;

/**
 * Inside canon §21.1's ranges (tilt 50–55°, FOV 25–30°): the tilt is rules.ts
 * CAMERA.defaultTiltDeg (55°, canon D48); FOV 28° is this round's pick.
 * `marginNdc` keeps a thin band round the field; `headroomM` keeps a beast
 * standing on the far edge inside the frame.
 */
export const VIEW = { tiltDeg: CAMERA.defaultTiltDeg, fovDeg: 28, marginNdc: 0.03, headroomM: 2.5, near: 1, far: 400 } as const;

export interface CameraFit {
  readonly tiltDeg: number;
  readonly fovDeg: number;
  readonly distanceM: number;
  readonly targetZ: number;
}

const fitScratch = { v: new THREE.Vector3(), target: new THREE.Vector3() };

/** Puts a looking-north camera `distanceM` from (0, 0, targetZ), `tiltDeg` below the horizon. */
export function placeCamera(camera: THREE.PerspectiveCamera, tiltDeg: number, distanceM: number, targetX: number, targetZ: number, targetY = 0): void {
  const tilt = THREE.MathUtils.degToRad(tiltDeg);
  camera.position.set(targetX, targetY + Math.sin(tilt) * distanceM, targetZ + Math.cos(tilt) * distanceM);
  camera.up.set(0, 1, 0);
  camera.lookAt(fitScratch.target.set(targetX, targetY, targetZ));
  camera.updateMatrixWorld(true);
}

/**
 * Fits the fixed camera to the field for `aspect` (width / height): the four
 * ground corners and a beast's headroom at the far edge land inside NDC with
 * `marginNdc`, between the DOM insets (NDC fractions of the height), the field
 * centred in the free band. Iterates distance and target (converges in a few
 * steps); writes the camera and returns the fit.
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  aspect: number,
  options: { tiltDeg?: number; fovDeg?: number; insetTop?: number; insetBottom?: number; marginNdc?: number; headroomM?: number } = {},
): CameraFit {
  const tiltDeg = options.tiltDeg ?? VIEW.tiltDeg;
  const fovDeg = options.fovDeg ?? VIEW.fovDeg;
  const margin = options.marginNdc ?? VIEW.marginNdc;
  const headroom = options.headroomM ?? VIEW.headroomM;
  const top = 1 - margin - 2 * Math.max(0, options.insetTop ?? 0);
  const bottom = -1 + margin + 2 * Math.max(0, options.insetBottom ?? 0);
  const halfWidth = 1 - margin;
  camera.fov = fovDeg;
  camera.aspect = Math.max(0.1, aspect);
  camera.near = VIEW.near;
  camera.far = VIEW.far;
  camera.updateProjectionMatrix();
  const tilt = THREE.MathUtils.degToRad(tiltDeg);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const centreX = (FIELD_M.minX + FIELD_M.maxX) / 2;
  let distance = 60;
  let targetZ = (FIELD_M.minZ + FIELD_M.maxZ) / 2;
  const v = fitScratch.v;
  for (let step = 0; step < 40; step += 1) {
    placeCamera(camera, tiltDeg, distance, centreX, targetZ);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let corner = 0; corner < 6; corner += 1) {
      const x = corner % 2 === 0 ? FIELD_M.minX : FIELD_M.maxX;
      const z = corner < 2 ? FIELD_M.minZ : corner < 4 ? FIELD_M.maxZ : FIELD_M.minZ;
      const y = corner < 4 ? 0 : headroom;
      v.set(x, y, z).project(camera);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const scale = Math.max((maxX - minX) / (2 * halfWidth), (maxY - minY) / Math.max(0.05, top - bottom));
    // Centre the field in the free band: moving the target north lowers the field on screen.
    const shift = (top + bottom) / 2 - (maxY + minY) / 2;
    targetZ += (shift * distance * tanHalf) / Math.sin(tilt);
    distance *= scale;
    if (Math.abs(scale - 1) < 1e-5 && Math.abs(shift) < 1e-5) break;
  }
  placeCamera(camera, tiltDeg, distance, centreX, targetZ);
  return { tiltDeg, fovDeg, distanceM: distance, targetZ };
}

/** Projects a world point (metres) to CSS px of a `width` × `height` view; writes `out`. */
export function projectPoint(camera: THREE.Camera, width: number, height: number, x: number, y: number, z: number, out: ScreenPoint, scratch: THREE.Vector3): ScreenPoint {
  scratch.set(x, y, z).project(camera);
  out.x = (scratch.x * 0.5 + 0.5) * width;
  out.y = (-scratch.y * 0.5 + 0.5) * height;
  out.visible = scratch.z < 1 && scratch.z > -1 && scratch.x >= -1 && scratch.x <= 1 && scratch.y >= -1 && scratch.y <= 1;
  return out;
}

// ── Look of the grey box (canon §21.1: ink, dó paper, indigo mist) ──────────

/** Paper-ivory sky fill, ink-indigo ground bounce, a warm key from the south-west, a cool rim from the north. */
export const IC_LIGHTS: StageLights = {
  hemisphere: { sky: "#ece8dc", ground: "#39414f", intensity: 1.55 },
  key: { color: "#fff4e2", intensity: 2.1, position: [-18, 34, 22] },
  rims: [{ color: "#b9c7dc", intensity: 0.7, position: [6, 14, -30] }],
};

/** Indigo mist behind the field; the fog fades the far edge a little (distance mist, canon §21.1). */
export const BACKGROUND = "#b9c0c4";
/** Bloom only for HDR light (threshold 1): emissive, additive effects. */
const BLOOM = { strength: 0.55, radius: 0.4, threshold: 1 } as const;

function gpuString(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}

/** Everything under `root`: geometries, materials and their textures (shared ones are disposed once, harmlessly). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry !== undefined) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (material === undefined) return;
    for (const one of Array.isArray(material) ? material : [material]) disposeMaterial(one);
  });
}

/**
 * The renderer on `host` (a canvas, or an element that gets a full-size
 * canvas). `quality` picks the TT_TIERS row.
 */
export function createRenderer(host: HTMLElement, quality: Quality): Renderer3D {
  const ownCanvas = !(host instanceof HTMLCanvasElement);
  const canvas = ownCanvas ? document.createElement("canvas") : (host as HTMLCanvasElement);
  if (ownCanvas) {
    canvas.className = "ic-gl";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.append(canvas);
  }
  const stage = new Stage3D(canvas, {
    quality,
    tiers: TT_TIERS,
    background: BACKGROUND,
    camera: { fov: VIEW.fovDeg, near: VIEW.near, far: VIEW.far },
    exposure: 1,
    // No studio reflections: ramp-shaded placeholders, and one texture fetch less per fragment.
    environment: 0,
    lights: IC_LIGHTS,
    bloom: BLOOM,
    fit: "canvas",
  });
  // PB-35: the kit fixes ACES; Neutral keeps the paper and ink tones. Set before the first compile.
  stage.renderer.toneMapping = THREE.NeutralToneMapping;
  // canon D57: MSAA on the composer's two targets (RenderPass draws into them; bloom and OutputPass read the
  // resolved texture). A change of sample count reallocates the targets on their next use.
  const applyMsaa = (q: Quality): void => {
    const samples = TT_MSAA[q];
    for (const target of [stage.composer.renderTarget1, stage.composer.renderTarget2]) {
      if (target.samples === samples) continue;
      target.samples = samples;
      target.dispose();
    }
  };
  applyMsaa(quality);
  const fog = new THREE.Fog(BACKGROUND, 60, 200);
  stage.scene.fog = fog;
  const layers: RenderLayers = { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() };
  layers.ground.name = "ground";
  layers.actors.name = "actors";
  layers.fx.name = "fx";
  stage.scene.add(layers.ground, layers.actors, layers.fx);

  const gpu = gpuString(stage.renderer);
  const counts = { drawCalls: 0, triangles: 0, gpu, pixelRatio: 1 };
  const scratch = new THREE.Vector3();
  const overlays: Overlay[] = [];
  let width = 1;
  let height = 1;
  let insets: ViewInsets = { top: 0, bottom: 0 };
  let lastFit: CameraFit = { tiltDeg: VIEW.tiltDeg, fovDeg: VIEW.fovDeg, distanceM: 1, targetZ: 0 };

  const refit = (): void => {
    const fit = fitCamera(stage.camera, width / height, { insetTop: insets.top / height, insetBottom: insets.bottom / height });
    // Mist from just past the target to well beyond the far edge.
    fog.near = fit.distanceM + 6;
    fog.far = fit.distanceM + 140;
    lastFit = fit;
    stage.emitPointScale();
  };
  // canon D57: the pixel ratio floats on the frame pacing between the tier's floor and its DPR (the display's
  // at most); Stage3D.resize sets the tier's DPR, then this overrides it. A pinned ratio wins over both.
  let governor: DynamicResolution | null = null;
  let pinned: number | null = null;
  const deviceMax = (q: Quality): number => Math.min(TT_TIERS[q].dpr, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const makeGovernor = (q: Quality): void => {
    const rule = TT_DYNAMIC_RES[q];
    const max = deviceMax(q);
    governor = rule !== null && max > rule.minDpr ? new DynamicResolution({ ...DYNAMIC_RES, minDpr: rule.minDpr }, max) : null;
  };
  const applyPixelRatio = (): void => {
    const dpr = pinned ?? governor?.pixelRatio ?? null;
    counts.pixelRatio = dpr ?? stage.renderer.getPixelRatio();
    if (dpr === null || dpr === stage.renderer.getPixelRatio()) return;
    stage.renderer.setPixelRatio(dpr);
    stage.renderer.setSize(width, height, false);
    stage.composer.setPixelRatio(dpr);
    stage.composer.setSize(width, height);
    stage.emitPointScale();
  };
  makeGovernor(quality);
  const resize = (): void => {
    stage.resize();
    width = stage.size.width;
    height = stage.size.height;
    applyPixelRatio();
    refit();
  };
  resize();

  const project: Projector = (x, y, z, out) => projectPoint(stage.camera, width, height, x, y, z, out, scratch);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resize());
  observer?.observe(ownCanvas ? host : canvas);

  return {
    scene: stage.scene,
    camera: stage.camera,
    get quality() {
      return stage.quality;
    },
    project,
    stage,
    canvas,
    layers,
    get fit() {
      return lastFit;
    },
    info: () => {
      // The kit resets renderer.info once per frame, so these include the post passes.
      counts.drawCalls = stage.renderer.info.render.calls;
      counts.triangles = stage.renderer.info.render.triangles;
      return counts;
    },
    render: (dt) => {
      // The governor reads the frame's dt (rAF timestamps, on the display's vsync), never a clock read here: that
      // carries each frame's varying CPU before the draw, and its jitter (and the short gap after a stall) read as
      // late frames and dropped the ratio while every vsync was met. dt 0 (a redraw, a capture) is not a frame.
      if (governor !== null && pinned === null && dt > 0 && governor.frame(dt * 1000)) applyPixelRatio();
      stage.update(dt);
      stage.render(dt);
      // Plain loop: no iterator object per frame.
      for (let k = 0; k < overlays.length; k += 1) overlays[k]!.draw(stage.renderer, width, height);
    },
    addOverlay: (overlay) => {
      overlays.push(overlay);
      return () => {
        const at = overlays.indexOf(overlay);
        if (at >= 0) overlays.splice(at, 1);
      };
    },
    resize,
    setQuality: (next) => {
      applyMsaa(next);
      makeGovernor(next);
      stage.setQuality(next);
      resize();
    },
    pinPixelRatio: (dpr) => {
      pinned = dpr;
      resize();
    },
    setViewInsets: (next) => {
      insets = { top: Math.max(0, next.top), bottom: Math.max(0, next.bottom) };
      refit();
    },
    dispose: () => {
      observer?.disconnect();
      disposeTree(stage.scene);
      stage.dispose();
      if (ownCanvas) canvas.remove();
    },
  };
}
