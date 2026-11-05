/**
 * What an element kit draws with (canon D59, ELEMENT_LAYER §3): one stage per scene, shared by sword-skills.ts and
 * myriad-swords.ts. A kit's `attach(stage)` runs once here (load time) and makes its own layers through the stage:
 * sprite, ribbon and beam pools on the effect layer, loose embers (EmberPool), flipbook clips (FlipbookPlayer, from
 * art-src/lab/vfx/<kit id>/), ground decals (GroundDecalPool), and reads the base sprite sheets or a named texture.
 * The stage updates and clears everything it made; layers stay hidden while empty, so an element that is not
 * picked costs no draw call. Frame order (the host): begin() before the skills update, update(dt) after them.
 */
import type * as THREE from "three";
import type { ElementHooks, ElementId, ElementKit } from "./element-kit";
import { FlipbookPlayer, type FlipbookMeta } from "./flipbook";
import { EmberPool } from "./embers";
import { FirePointPool } from "./fire-points";
import { BeamPool, Rand, RibbonPool, SpritePool, type SpriteBlend, type SpriteFacing, type SpritePoolOptions } from "./fxkit";
import { GroundDecalPool } from "./ground-decals";
import { HeatRingPool } from "./heat-rings";
import type { SwordSkillTextures } from "./sword-skills";
import { prewarmScene, type ScenePrewarmReport } from "../renderer";

export type StageQuality = "low" | "medium" | "high" | "ultra";

export interface ElementStageOptions {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly quality: StageQuality;
  /** The base sprite sheets (the host's SwordSkillTextures). */
  readonly textures: SwordSkillTextures;
  /** Resolves a kit's texture name (the lab: art-src/lab/tex/<name>.png, or a path under art-src/lab/vfx/). */
  readonly texture: (name: string) => THREE.Texture;
  /** Folder holding one flipbook folder per element (the lab: /art-src/lab/vfx/). */
  readonly vfxBase: string;
  /**
   * A kit's screen accent on a big blow (its ScreenAccent.flash, at a world point, strength 0–1): the host's screen
   * effects answer it (the lab: screen-fx.ts warm). Absent: none.
   */
  readonly accent?: (x: number, y: number, z: number, strength: number) => void;
  /**
   * A kit's impact light (ticket 264): at (x, y, z), `colour` (CSS hex), `intensity`, at full strength on the frame it is
   * asked (the host's point-light pool; the lab: FlashLights, drawn before it ages). Absent: none.
   */
  readonly light?: (x: number, y: number, z: number, colour: string, intensity: number) => void;
}

const NO_HOOKS: ElementHooks = {};
const RAND_SEED = 4409;

export class ElementStage {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly quality: StageQuality;
  /** Low: secondary layers fold or go (the sword modules' `lite`). */
  readonly lite: boolean;
  /** Burst counts and shed rates by tier (low halves them). */
  readonly dens: number;
  readonly textures: SwordSkillTextures;
  readonly flipbooks: FlipbookPlayer;
  /** The kits' own random stream (reseeded on reset: captures repeat). */
  readonly rand = new Rand(RAND_SEED);
  /** World seconds since the stage was made (frame by frame). */
  time = 0;
  private readonly resolve: (name: string) => THREE.Texture;
  private readonly onAccent: ((x: number, y: number, z: number, strength: number) => void) | null;
  private readonly onLight: ((x: number, y: number, z: number, colour: string, intensity: number) => void) | null;
  private readonly sprites: SpritePool[] = [];
  private readonly ribbonPools: RibbonPool[] = [];
  private readonly beamPools: BeamPool[] = [];
  private readonly emberPools: EmberPool[] = [];
  private readonly ringPools: HeatRingPool[] = [];
  private readonly pointPools: FirePointPool[] = [];
  private readonly decalPools = new Map<string, GroundDecalPool>();
  private readonly hooks = new Map<ElementId, ElementHooks>();
  private readonly updaters: ((dt: number) => void)[] = [];
  private readonly resetters: (() => void)[] = [];

  constructor(opts: ElementStageOptions) {
    this.layer = opts.layer;
    this.camera = opts.camera;
    this.quality = opts.quality;
    this.lite = opts.quality === "low";
    this.dens = opts.quality === "low" ? 0.5 : opts.quality === "medium" ? 0.75 : 1;
    this.textures = opts.textures;
    this.resolve = opts.texture;
    this.onAccent = opts.accent ?? null;
    this.onLight = opts.light ?? null;
    this.flipbooks = new FlipbookPlayer(opts.vfxBase);
    this.layer.add(this.flipbooks.group);
  }

  /** The hooks of `kit` on this stage: its attach runs on the first call (load time), then they are kept. */
  hooksOf(kit: ElementKit): ElementHooks {
    let h = this.hooks.get(kit.id);
    if (h === undefined) {
      h = kit.attach !== undefined ? kit.attach(this) : NO_HOOKS;
      this.hooks.set(kit.id, h);
    }
    return h;
  }

  /** Loads the kit's flipbook folder (when it names clips) and attaches it; resolves when its atlases are in. */
  async prepare(kit: ElementKit): Promise<ElementHooks> {
    const h = this.hooksOf(kit);
    const clips = Object.values(kit.flipbooks).flat();
    const roles = kit.roles ?? [];
    if (clips.length > 0 || roles.length > 0) {
      await this.flipbooks.ready(kit.id);
      const loaded = new Set(this.flipbooks.loaded(kit.id));
      const missing = clips.filter((c) => c !== undefined && !loaded.has(c));
      if (missing.length > 0) console.warn(`[element-stage] ${kit.id}: clips not found in its manifest: ${missing.join(", ")}`);
      // Clips by role arrive over the evening (lab-flipbooks): a role still missing draws the base layer.
      const lib = this.flipbooks.library(kit.id);
      const have = new Set(lib.ids().map((id) => lib.get(id)!.meta.role));
      const waiting = roles.filter((r) => !have.has(r));
      if (waiting.length > 0) console.info(`[element-stage] ${kit.id}: no clip yet for ${waiting.join(", ")} (base layers draw there)`);
    }
    return h;
  }

  /** Load time only; the host selects the element, loads its media and lends overlays before calling. */
  prewarm(kit: ElementKit, renderer: THREE.WebGLRenderer, scene: THREE.Scene,
    target: THREE.WebGLRenderTarget, textures: readonly THREE.Texture[] = [], beforeRender?: () => void): ScenePrewarmReport & { element: ElementId } {
    this.hooksOf(kit);
    return { element: kit.id, ...prewarmScene(renderer, scene, this.camera, target, textures, beforeRender) };
  }

  /** A kit's screen accent on a big blow at (x, y, z), strength 0–1 (the host's, when it gave one). */
  accent(x: number, y: number, z: number, strength: number): void {
    this.onAccent?.(x, y, z, strength);
  }

  /** A kit's impact light at (x, y, z) (the host's, when it gave one). */
  light(x: number, y: number, z: number, colour: string, intensity: number): void {
    this.onLight?.(x, y, z, colour, intensity);
  }

  /** A loaded clip's atlas and layout in `folder` (a flame trail's band), or null before it arrives. */
  clip(folder: string, id: string): { texture: THREE.Texture; meta: FlipbookMeta } | null {
    return this.flipbooks.library(folder).get(id);
  }

  /** A named texture (a kit's sheet or decal). */
  texture(name: string): THREE.Texture {
    return this.resolve(name);
  }

  /** Burst count scaled by the quality tier (low halves). */
  n(count: number): number {
    return Math.max(1, Math.round(count * this.dens));
  }

  /** A sprite pool of the kit's own (load time): on the layer, updated and cleared by the stage, hidden while empty. */
  pool(capacity: number, texture: THREE.Texture, blend: SpriteBlend, facing: SpriteFacing, renderOrder: number, opts: SpritePoolOptions = {}): SpritePool {
    const p = new SpritePool(capacity, texture, blend, facing, renderOrder, opts);
    this.sprites.push(p);
    this.layer.add(p.mesh);
    return p;
  }

  /** A ribbon pool of the kit's own (load time). */
  ribbons(capacity: number, points: number, texture: THREE.Texture, renderOrder = 12): RibbonPool {
    const r = new RibbonPool(capacity, points, texture, renderOrder);
    this.ribbonPools.push(r);
    this.layer.add(r.mesh);
    return r;
  }

  /** A beam pool of the kit's own (load time). */
  beams(capacity: number, renderOrder = 13): BeamPool {
    const b = new BeamPool(capacity, renderOrder);
    this.beamPools.push(b);
    this.layer.add(b.mesh);
    return b;
  }

  /** A loose-ember pool of the kit's own (load time). */
  embers(capacity: number, renderOrder = 13): EmberPool {
    const e = new EmberPool(capacity, renderOrder);
    this.emberPools.push(e);
    this.layer.add(e.mesh);
    return e;
  }

  /** A pool of heat rings (matter on a soot underlay; camera-facing or on the ground) of the kit's own (load time). */
  heatRings(capacity: number, facing: "camera" | "ground", renderOrder = 14): HeatRingPool {
    const r = new HeatRingPool(capacity, facing, renderOrder);
    this.ringPools.push(r);
    this.layer.add(r.mesh);
    return r;
  }

  /** A pool of fire points (a white-gold core in a star of flame tongues, matter on its soot rim) of the kit's own (load time). */
  firePoints(capacity: number, renderOrder = 14): FirePointPool {
    const p = new FirePointPool(capacity, renderOrder);
    this.pointPools.push(p);
    this.layer.add(p.mesh);
    return p;
  }

  /** The ground decals drawn with texture `name` (null: the procedural char; one pool each, made on first use; load time). */
  decals(name: string | null, capacity = 64, renderOrder = 4): GroundDecalPool {
    const key = name ?? "";
    let d = this.decalPools.get(key);
    if (d === undefined) {
      d = new GroundDecalPool(capacity, name === null ? null : this.resolve(name), renderOrder);
      this.decalPools.set(key, d);
      this.layer.add(d.mesh);
    }
    return d;
  }

  /** A kit's own per-frame work (load time): run at the start of update, before the layers draw. */
  everyFrame(fn: (dt: number) => void, reset?: () => void): void {
    this.updaters.push(fn);
    if (reset !== undefined) this.resetters.push(reset);
  }

  /** Start of a frame, before the skills emit: last frame's one-frame cards go. */
  begin(): void {
    for (const p of this.sprites) p.dropOneFrame();
    for (const b of this.beamPools) b.dropOneFrame();
  }

  /** After the skills: every layer the kits made moves and uploads. */
  update(dt: number): void {
    this.time += dt;
    for (const fn of this.updaters) fn(dt);
    for (const p of this.sprites) p.update(dt);
    for (const b of this.beamPools) b.update(dt);
    for (const r of this.ribbonPools) r.update(dt, this.camera);
    for (const e of this.emberPools) e.update(dt);
    for (const r of this.ringPools) r.update(dt);
    for (const p of this.pointPools) p.update(dt);
    for (const d of this.decalPools.values()) d.update(dt);
    this.flipbooks.update(dt);
  }

  /** Clears every layer (lab: before a capture) and reseeds the kits' random stream. */
  reset(): void {
    for (const p of this.sprites) p.clear();
    for (const b of this.beamPools) b.clear();
    for (const r of this.ribbonPools) for (let i = 0; i < r.capacity; i += 1) r.kill(i);
    for (const e of this.emberPools) e.clear();
    for (const r of this.ringPools) r.clear();
    for (const p of this.pointPools) p.clear();
    for (const d of this.decalPools.values()) d.clear();
    this.flipbooks.clear();
    for (const fn of this.resetters) fn();
    this.rand.reseed(RAND_SEED);
  }
}
