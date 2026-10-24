// Source: games/space-typing/src/scene3d/space.ts (SpaceStage's stage only: renderer, lights, bloom, resize; kit copy, no starfield, no flight cameras; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { VisualQuality } from "./model-loader";
import { damp, scratch } from "./util";

/** What a quality tier allows: pixel ratio cap, particle budget, bloom, hero ribbons. */
export type StageTier = { dpr: number; particles: number; bloom: boolean; tipsPerSide: number; trail: number };

/** Space's medium and high (stars and dust aside); low halves medium, ultra is high. */
export const STAGE_TIERS: Readonly<Record<VisualQuality, StageTier>> = {
  low: { dpr: 1, particles: 500, bloom: false, tipsPerSide: 1, trail: 12 },
  medium: { dpr: 1, particles: 1000, bloom: false, tipsPerSide: 2, trail: 18 },
  high: { dpr: 2, particles: 2400, bloom: true, tipsPerSide: 3, trail: 30 },
  ultra: { dpr: 2, particles: 2400, bloom: true, tipsPerSide: 3, trail: 30 },
};

type Light = { color: THREE.ColorRepresentation; intensity: number; position: readonly [number, number, number] };

/** A hemisphere fill, a key light and coloured rims. */
export type StageLights = {
  hemisphere: { sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number };
  key: Light;
  rims: readonly Light[];
};

/** Space's flight stage: a cool sky fill, a white key upper left, cyan and pink rims behind. */
export const SPACE_LIGHTS: StageLights = {
  hemisphere: { sky: 0xbfd7ff, ground: 0x1a0f2e, intensity: 0.85 },
  key: { color: 0xffffff, intensity: 1.7, position: [-3, 5, 4] },
  rims: [
    { color: "#5fe3ff", intensity: 2.4, position: [4, 1.5, -5] },
    { color: "#ff7ad9", intensity: 1.5, position: [-4, -1, -4] },
  ],
};

export type StageOptions = {
  quality?: VisualQuality;
  /** Clear colour; null: transparent (the page shows through). */
  background?: THREE.ColorRepresentation | null;
  camera?: { fov?: number; near?: number; far?: number };
  exposure?: number;
  /** The studio environment's strength for reflections (0: none). */
  environment?: number;
  lights?: StageLights;
  /** Only HDR light blooms at threshold 1 (emissive, stacked additive effects). */
  bloom?: { strength: number; radius: number; threshold: number };
  /** Size from the canvas's CSS box (default) or the window. */
  fit?: "canvas" | "window";
  tiers?: Readonly<Record<VisualQuality, StageTier>>;
};

/**
 * One WebGL renderer with ACES tone mapping, a studio environment for
 * reflections, key and rim lights, a short impact light, and bloom where the
 * quality allows it. A game adds its world to `scene` and drives `camera`.
 */
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly hemisphere: THREE.HemisphereLight;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLights: THREE.DirectionalLight[];
  readonly impactLight = new THREE.PointLight(0xffffff, 0, 14, 2);
  quality: VisualQuality;
  readonly tiers: Readonly<Record<VisualQuality, StageTier>>;
  private readonly fit: "canvas" | "window";
  private readonly environmentMap: THREE.Texture | null;
  private readonly pointScaleListeners = new Set<(scale: number) => void>();
  private readonly buffer = new THREE.Vector2();
  private width = 1;
  private height = 1;

  constructor(readonly canvas: HTMLCanvasElement, options: StageOptions = {}) {
    this.quality = options.quality ?? "high";
    this.tiers = options.tiers ?? STAGE_TIERS;
    this.fit = options.fit ?? "canvas";
    const transparent = options.background === null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 1.02;
    this.renderer.info.autoReset = false;
    if (transparent) this.renderer.setClearColor(0x000000, 0);
    else this.scene.background = new THREE.Color(options.background ?? "#02030a");
    const { fov = 50, near = 0.05, far = 420 } = options.camera ?? {};
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);

    const environment = options.environment ?? 0.35;
    if (environment > 0) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.environmentMap = pmrem.fromScene(room, 0.04).texture;
      this.scene.environment = this.environmentMap;
      this.scene.environmentIntensity = environment;
      room.dispose();
      pmrem.dispose();
    } else this.environmentMap = null;
    const lights = options.lights ?? SPACE_LIGHTS;
    this.hemisphere = new THREE.HemisphereLight(lights.hemisphere.sky, lights.hemisphere.ground, lights.hemisphere.intensity);
    const directional = (light: Light): THREE.DirectionalLight => {
      const out = new THREE.DirectionalLight(light.color, light.intensity);
      out.position.set(...light.position);
      return out;
    };
    this.keyLight = directional(lights.key);
    this.rimLights = lights.rims.map(directional);
    this.scene.add(this.hemisphere, this.keyLight, ...this.rimLights, this.impactLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = options.bloom ?? { strength: 0.6, radius: 0.45, threshold: 1 };
    // Threshold 1: only HDR light (emissive, stacked additive FX) blooms; single
    // bright pixels would bloom into small square blobs in the mip chain.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setQuality(this.quality);
  }

  get tier(): StageTier {
    return this.tiers[this.quality];
  }

  setQuality(quality: VisualQuality): void {
    this.quality = quality;
    this.bloom.enabled = this.tier.bloom;
    this.resize();
  }

  /** Fits the drawing buffer to the canvas's CSS box (or the window, or the size given). */
  resize(width?: number, height?: number): void {
    const view = typeof window === "undefined" ? null : window;
    const fromCanvas = this.fit === "canvas" && this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0;
    this.width = Math.max(1, Math.round(width ?? (fromCanvas ? this.canvas.clientWidth : view?.innerWidth ?? 1)));
    this.height = Math.max(1, Math.round(height ?? (fromCanvas ? this.canvas.clientHeight : view?.innerHeight ?? 1)));
    const dpr = Math.min(this.tier.dpr, view?.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.emitPointScale();
  }

  /** The view's CSS size. */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Point sprites are sized in world units: they need px per unit at distance 1. Returns an unsubscribe. */
  onPointScale(listener: (scale: number) => void): () => void {
    this.pointScaleListeners.add(listener);
    listener(this.pointScale());
    return () => this.pointScaleListeners.delete(listener);
  }

  pointScale(): number {
    const height = this.renderer.getDrawingBufferSize(this.buffer).y;
    return height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  /** Call after changing the camera's fov. */
  emitPointScale(): void {
    const scale = this.pointScale();
    for (const listener of this.pointScaleListeners) listener(scale);
  }

  /** A short light burst, held a little toward the camera: a point light on a surface blows it out. */
  flash(at: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number): void {
    this.impactLight.position.copy(at).add(scratch.a.subVectors(this.camera.position, at).setLength(1.4));
    this.impactLight.color.set(color);
    this.impactLight.intensity = Math.max(this.impactLight.intensity, Math.min(12, intensity));
  }

  /** Lets the impact light die down. */
  update(dt: number): void {
    this.impactLight.intensity = damp(this.impactLight.intensity, 0, 7, dt);
  }

  /** Draws a frame: through bloom when it is on, else straight (no full-screen passes). */
  render(dt: number): void {
    this.renderer.info.reset();
    if (this.bloom.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.pointScaleListeners.clear();
    this.environmentMap?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
