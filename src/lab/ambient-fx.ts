/** Lab atmosphere: authored world loops on fixed planes behind the combat layers. */
import * as THREE from "three";
import { FlipbookPlayer, type FlipbookLibrary, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";

export const AMBIENT_IDS = ["world-mist-loop", "world-dust-motes-loop", "world-light-shafts-loop"] as const;
type AmbientId = typeof AMBIENT_IDS[number];
// Negative group order puts these transparent planes under all combat transparency.
export const AMBIENT_ORDER = -100;
export function ambientEnabled(search: string): boolean { return new URLSearchParams(search).get("ambient") !== "0"; }

interface Plane { readonly x: number; readonly y: number; readonly z: number; readonly width: number; readonly height: number; readonly rot: number }
interface Layer {
  readonly id: AmbientId;
  readonly light: number;
  readonly alpha: number;
  readonly ground: boolean;
  readonly planes: readonly Plane[];
  pool: FlipbookPool | null;
  loading: boolean;
  missing: boolean;
  retryAt: number;
  started: boolean;
}
const deferred = (): boolean => true;

export class AmbientFx {
  readonly player: FlipbookPlayer;
  private readonly allowed: boolean;
  private on: boolean;
  private disposed = false;
  private library: FlipbookLibrary | null = null;
  private time = 0;
  private readonly at = new THREE.Vector3();
  private readonly options: FlipOptions = { life: Infinity, rate: 1, fadeIn: 1, fadeOut: 0, occlude: 0, lift: 0, ground: -1e5 };
  private readonly layers: Layer[] = [
    { id: AMBIENT_IDS[0], light: 0.25, alpha: 0.5, ground: true, planes: [
      { x: 0, y: 0.06, z: -16.5, width: 28, height: 2.5, rot: 0 },
      { x: -18.5, y: 0.06, z: -5, width: 25, height: 2.5, rot: Math.PI / 2 },
      { x: 18.5, y: 0.06, z: -5, width: 25, height: 2.5, rot: Math.PI / 2 },
    ], pool: null, loading: false, missing: false, retryAt: 0, started: false },
    { id: AMBIENT_IDS[1], light: 0.2, alpha: 0.45, ground: false, planes: [
      { x: 0, y: 3.6, z: -19, width: 40, height: 7, rot: 0 },
    ], pool: null, loading: false, missing: false, retryAt: 0, started: false },
    { id: AMBIENT_IDS[2], light: 0.18, alpha: 0.4, ground: false, planes: [
      { x: -13, y: 6, z: -19.5, width: 12, height: 10, rot: -Math.PI / 6 },
    ], pool: null, loading: false, missing: false, retryAt: 0, started: false },
  ];

  constructor(parent: THREE.Object3D, base: string, search = "", player?: FlipbookPlayer) {
    this.allowed = ambientEnabled(search);
    this.on = this.allowed;
    this.player = player ?? new FlipbookPlayer(base);
    this.player.group.name = "fx-lab-ambient";
    this.player.group.renderOrder = AMBIENT_ORDER;
    this.player.group.visible = this.on;
    parent.add(this.player.group);
  }

  get enabled(): boolean { return this.on && !this.disposed; }

  setEnabled(on: boolean): void {
    this.on = this.allowed && on && !this.disposed;
    this.player.group.visible = this.on;
    if (!this.on) {
      this.player.clear();
      for (const layer of this.layers) layer.started = false;
    }
  }

  private makePool(layer: Layer): FlipbookPool {
    const pool = this.player.pool("world", layer.id, { mode: "fire", capacity: layer.planes.length, renderOrder: AMBIENT_ORDER });
    // Placement only; the atlas and the kit still own every visible shape and frame blend.
    const material = pool.mesh.material;
    const corner = layer.ground ? "vec3(corner.x, 0.0, -corner.y)" : "vec3(corner, 0.0)";
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;", "vec2 local = vec2((uv.x - 0.5) * iLift.y, (uv.y - 0.5) * iData.x);")
        .replace("view.xy += corner;", `vec3 ambientCorner = ${corner};\n  view = modelViewMatrix * vec4(iPos + ambientCorner, 1.0);`)
        .replace("vWorld = (modelMatrix * vec4(iPos, 1.0)).xyz + right * corner.x + up * corner.y;", "vWorld = (modelMatrix * vec4(iPos + ambientCorner, 1.0)).xyz;");
    };
    material.customProgramCacheKey = () => layer.ground ? "lab-ambient-ground" : "lab-ambient-upright";
    material.depthTest = true;
    material.depthWrite = false;
    material.needsUpdate = true;
    return pool;
  }

  private prepare(layer: Layer): void {
    if (layer.pool !== null || layer.loading || layer.missing || this.time < layer.retryAt) return;
    const lib = this.library ?? (this.library = this.player.library("world", deferred));
    layer.loading = true;
    layer.retryAt = this.time + 5;
    void lib.load().then(async () => {
      if (this.disposed) { lib.reset(); return; }
      if (lib.get(layer.id) === null) { layer.missing = true; return; }
      if (!await lib.fetchAtlas(layer.id)) return;
      if (this.disposed) { lib.reset(); return; }
      layer.pool = this.makePool(layer);
    }).catch((error: unknown) => console.warn("[lab-ambient] " + layer.id, error)).finally(() => { layer.loading = false; });
  }

  /** In-memory atlas injection for Node tests, through the real library and pool. */
  adopt(id: AmbientId, meta: FlipbookMeta, texture: THREE.Texture): void {
    const layer = this.layers[AMBIENT_IDS.indexOf(id)]!;
    this.library ??= this.player.library("world", deferred);
    this.library.add(meta, texture);
    layer.pool = this.makePool(layer);
    layer.missing = false;
  }

  /** Real seconds keep the background loops continuous through combat hit-stop. */
  update(dt: number): void {
    if (!this.enabled) return;
    const step = Math.max(0, dt);
    this.time += step;
    for (let i = 0; i < this.layers.length; i += 1) {
      const layer = this.layers[i]!;
      if (layer.pool === null) { this.prepare(layer); continue; }
      if (layer.started) continue;
      const o = this.options;
      o.intensity = layer.light;
      o.alpha = layer.alpha;
      for (let j = 0; j < layer.planes.length; j += 1) {
        const p = layer.planes[j]!;
        o.span = p.width;
        o.rot = p.rot;
        o.frame = (this.time * layer.pool.meta!.fps + j * 11) % layer.pool.meta!.frames;
        this.at.set(p.x, p.y, p.z);
        layer.pool.spawn(this.at, p.height, o);
      }
      layer.started = true;
    }
    this.player.update(step);
  }

  dispose(): void {
    this.setEnabled(false);
    this.disposed = true;
    this.player.dispose();
    this.library?.reset();
  }
}
