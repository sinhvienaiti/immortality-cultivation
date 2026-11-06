/** Lab-only hero presence from the authored meta flipbooks; no generated shapes. */
import * as THREE from "three";
import { FlipbookPlayer, ONE_FRAME, type FlipbookLibrary, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";

export const HERO_PRESENCE_IDS = [
  "hero-presence-ring-loop", "hero-qi-motes-idle-loop",
  "hero-ultimate-ready-aura-loop", "hero-golden-body-shell-loop",
] as const;
type HeroPresenceId = typeof HERO_PRESENCE_IDS[number];

export interface HeroPresencePose {
  x: number;
  y: number;
  z: number;
  height: number;
  /** Keys 8/9 have no cooldown or resource meter in this lab. */
  ultimateReady: boolean;
  guardActive: boolean;
}

interface Layer {
  readonly id: HeroPresenceId;
  readonly light: number;
  level: number;
  pool: FlipbookPool | null;
  loading: boolean;
  missing: boolean;
  retryAt: number;
  used: number;
}
const LIGHT = [0.3, 0.12, 0.22, 0.2] as const;
const deferred = (): boolean => true;
export function heroPresenceEnabled(search: string): boolean { return new URLSearchParams(search).get("presence") !== "0"; }
/** The lab's fallback readiness: the selected key-8 or key-9 row is an ultimate, available without cooldown. */
export function heroUltimateReady(damage8?: string, damage9?: string): boolean { return damage8 === "ult" || damage9 === "ult"; }

export class HeroPresenceFx {
  readonly enabled: boolean;
  readonly player: FlipbookPlayer;
  private library: FlipbookLibrary | null = null;
  private readonly layers: Layer[] = HERO_PRESENCE_IDS.map((id, i) => ({ id, light: LIGHT[i]!, level: 0, pool: null, loading: false, missing: false, retryAt: 0, used: 0 }));
  private readonly at = new THREE.Vector3();
  private readonly options: FlipOptions = { frame: 0, life: ONE_FRAME, rate: 0, alpha: 0, intensity: 0, lift: 0, occlude: 0, ground: -1e5 };
  private time = 0;
  private worldTime = 0;
  private lastTyped = 0;
  private blockedUntil = -1;
  private ultimateWasReady = false;
  private goldenWasActive = false;

  constructor(parent: THREE.Object3D, base: string, search = "", player?: FlipbookPlayer, private readonly sound: (id: "ui-skill-ready" | "guard-body") => void = () => {}) {
    this.enabled = heroPresenceEnabled(search);
    this.player = player ?? new FlipbookPlayer(base);
    this.player.group.name = "fx-hero-presence";
    parent.add(this.player.group);
  }

  typed(): void { this.lastTyped = this.time; }

  /** Only the successful fx.block branch calls this. Matches its 0.16 s parry, then a 0.25 s fade. */
  block(): void { if (this.enabled) this.blockedUntil = this.worldTime + 0.16; }

  private makePool(layer: Layer, meta: FlipbookMeta): FlipbookPool {
    const pool = this.player.pool("meta", layer.id, { mode: meta.mode, capacity: 1, renderOrder: 1 });
    if (layer.id === HERO_PRESENCE_IDS[0]) {
      // Placement only: the painted foot ring lies on XZ instead of clipping its lower half through the floor.
      const material = pool.mesh.material;
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace("view.xy += corner;", "vec3 heroCorner = vec3(corner.x, 0.0, -corner.y);\n  view = modelViewMatrix * vec4(iPos + heroCorner, 1.0);")
          .replace("vWorld = (modelMatrix * vec4(iPos, 1.0)).xyz + right * corner.x + up * corner.y;", "vWorld = (modelMatrix * vec4(iPos + heroCorner, 1.0)).xyz;");
      };
      material.customProgramCacheKey = () => "hero-presence-ground";
      material.needsUpdate = true;
    }
    return pool;
  }

  private prepare(layer: Layer): boolean {
    layer.used = this.time;
    if (layer.pool !== null && !this.library!.deferred(layer.id)) return true;
    if (layer.loading || layer.missing || this.time < layer.retryAt) return false;
    const lib = this.library ?? (this.library = this.player.library("meta", deferred));
    layer.loading = true;
    layer.retryAt = this.time + 1;
    void lib.load().then(async () => {
      const entry = lib.get(layer.id);
      if (entry === null) { layer.missing = true; return; }
      if (!await lib.fetchAtlas(layer.id)) return;
      layer.pool ??= this.makePool(layer, entry.meta);
      layer.used = this.time;
      layer.retryAt = 0;
    }).catch((error: unknown) => console.warn("[hero-presence] " + layer.id, error)).finally(() => { layer.loading = false; });
    return false;
  }

  /** Tests use the real player/library/pool without a browser or a texture loader. */
  adopt(id: HeroPresenceId, meta: FlipbookMeta, texture: THREE.Texture): void {
    const layer = this.layers[HERO_PRESENCE_IDS.indexOf(id)]!;
    this.library ??= this.player.library("meta", deferred);
    this.library.add(meta, texture);
    layer.pool = this.makePool(layer, meta);
    layer.used = this.time;
    layer.missing = false;
  }

  /** Separate clocks: idle and atlas eviction use real seconds; the parry and clip motion use world seconds. */
  update(dt: number, realDt: number, pose: HeroPresencePose): void {
    if (!this.enabled) return;
    if (pose.ultimateReady && !this.ultimateWasReady) this.sound("ui-skill-ready");
    this.ultimateWasReady = pose.ultimateReady;
    const step = Math.max(0, dt), real = Math.max(0, realDt);
    this.time += real;
    this.worldTime += step;
    const goldenActive = pose.guardActive && this.worldTime < this.blockedUntil;
    if (goldenActive && !this.goldenWasActive) this.sound("guard-body");
    this.goldenWasActive = goldenActive;
    for (let i = 0; i < this.layers.length; i += 1) {
      const layer = this.layers[i]!;
      layer.pool?.clear();
      const wanted = i === 0 || (i === 1 ? this.time - this.lastTyped >= 1.5 : i === 2 ? pose.ultimateReady : pose.guardActive && this.worldTime < this.blockedUntil);
      // Only the part of this frame beyond the idle threshold contributes to its fade-in.
      const fadeDt = i === 1 && wanted ? Math.min(real, Math.max(0, this.time - this.lastTyped - 1.5)) : i === 3 ? step : real;
      if (wanted || layer.level > 0) {
        if (this.prepare(layer)) {
          const ramp = fadeDt / (wanted ? i === 3 ? 0.08 : 0.3 : i === 3 ? 0.25 : 0.3);
          layer.level = wanted ? Math.min(1, layer.level + ramp) : Math.max(0, layer.level - ramp);
          if (layer.level > 0) this.draw(layer, pose, i === 0);
        } else layer.level = 0;
      }
      if (!layer.loading && layer.pool !== null && !this.library!.deferred(layer.id) && this.time - layer.used >= 20) {
        this.library!.release(layer.id);
      }
    }
    this.player.update(step);
  }

  private draw(layer: Layer, pose: HeroPresencePose, ground: boolean): void {
    const pool = layer.pool!, meta = pool.meta!, o = this.options;
    const first = meta.frameRange?.[0] ?? meta.start;
    const end = meta.frameRange?.[1] ?? meta.frames - 1;
    o.frame = first + (this.worldTime * meta.fps) % (end - first + 1);
    o.alpha = layer.level;
    // All four painted layers together contribute at most 0.84 per channel; the foot ring alone is 0.3.
    o.intensity = layer.light;
    // The foot ring clears the floor; body layers sit behind the hero without being pushed behind the floor.
    o.lift = ground ? 0.01 : -pose.height * 0.15;
    this.at.set(pose.x, pose.y + (ground ? 0.03 : pose.height * 0.48), pose.z);
    pool.spawn(this.at, pose.height * (ground ? 1.4 : 1.35), o);
  }

  clear(): void {
    this.lastTyped = this.time;
    this.blockedUntil = -1;
    this.ultimateWasReady = false;
    this.goldenWasActive = false;
    for (const layer of this.layers) layer.level = 0;
    this.player.clear();
  }
}
