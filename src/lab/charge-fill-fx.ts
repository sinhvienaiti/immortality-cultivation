/** Authored caster charge, scrubbed by correct letters; never owns release timing. */
import * as THREE from "three";
import { FlipbookPlayer, ONE_FRAME, type FlipbookLibrary, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";

export const CHARGE_FILL_ORDER = -1;
export const CHARGE_FILL_RELEASE_S = 0.12;
export const CHARGE_FILL_CANCEL_S = 0.2;
const VOICES = 8;
const deferred = (): boolean => true;
const slots = new Set(["k2", "guard", "dash", "k4", "k5", "k7"]);
export function chargeFillEnabled(search: string): boolean { return new URLSearchParams(search).get("chargefill") !== "0"; }

export interface ChargeFillWord { readonly slot: string; readonly typed: number; readonly letters: number }
export interface ChargeFillPose { x: number; y: number; z: number; height: number; bodyWidth: number }

/** Fractional frames let the existing flipbook shader blend neighbouring cels. */
export function chargeFillFrame(meta: FlipbookMeta, correct: number, letters: number): number {
  const first = meta.frameRange?.[0] ?? meta.start;
  const last = meta.frameRange?.[1] ?? meta.frames - 1;
  const p = letters > 0 && Number.isFinite(correct) ? Math.min(1, Math.max(0, correct / letters)) : 0;
  return first + Math.max(0, last - first) * p;
}

interface Layer { id: string; pool: FlipbookPool | null; loading: boolean; missing: boolean; retryAt: number }
interface Voice { layer: Layer | null; progress: number; left: number; fade: number }

export class ChargeFillFx {
  readonly enabled: boolean;
  readonly player: FlipbookPlayer;
  private library: FlipbookLibrary | null = null;
  private readonly layers = new Map<string, Layer>();
  private readonly voices: Voice[] = Array.from({ length: VOICES }, () => ({ layer: null, progress: 0, left: 0, fade: 0 }));
  private active: Voice | null = null;
  private word: ChargeFillWord | null = null;
  private element = "";
  private time = 0;
  private disposed = false;
  private readonly at = new THREE.Vector3();
  private readonly options: FlipOptions = { life: ONE_FRAME, rate: 0, frame: 0, alpha: 1, intensity: 0.9, fadeIn: 0, fadeOut: 0, occlude: 0, ground: -1e5, lift: 0 };

  constructor(parent: THREE.Object3D, base: string, search = "", player?: FlipbookPlayer) {
    this.enabled = chargeFillEnabled(search);
    this.player = player ?? new FlipbookPlayer(base);
    this.player.group.name = "fx-charge-fill";
    this.player.group.renderOrder = CHARGE_FILL_ORDER;
    this.player.group.visible = this.enabled;
    parent.add(this.player.group);
  }

  private layer(element: string): Layer {
    let layer = this.layers.get(element);
    if (layer === undefined) {
      layer = { id: element + "-charge-fill", pool: null, loading: false, missing: false, retryAt: 0 };
      this.layers.set(element, layer);
    }
    return layer;
  }

  private makePool(layer: Layer, meta: FlipbookMeta): FlipbookPool {
    const pool = this.player.pool("charge-fill", layer.id, { mode: meta.mode, capacity: VOICES, renderOrder: CHARGE_FILL_ORDER });
    pool.mesh.material.depthTest = true;
    pool.mesh.material.depthWrite = false;
    return pool;
  }

  /** Warm only the selected element, without waiting in the typing/release path. */
  prepareElement(element: string): void {
    if (!this.enabled || this.disposed) return;
    const layer = this.layer(element);
    if (layer.pool !== null || layer.loading || layer.missing || this.time < layer.retryAt) return;
    const lib = this.library ?? (this.library = this.player.library("charge-fill", deferred));
    layer.loading = true;
    layer.retryAt = this.time + 5;
    void lib.load().then(async () => {
      if (this.disposed) { lib.reset(); return; }
      const entry = lib.get(layer.id);
      if (entry === null || entry.meta.role !== "charge") { layer.missing = true; return; }
      if (!await lib.fetchAtlas(layer.id)) return;
      if (this.disposed) { lib.reset(); return; }
      layer.pool = this.makePool(layer, entry.meta);
    }).catch((error: unknown) => console.warn("[charge-fill] " + layer.id, error)).finally(() => { layer.loading = false; });
  }

  /** In-memory injection through the real library and pool for Node tests. */
  adopt(element: string, meta: FlipbookMeta, texture: THREE.Texture): void {
    if (!this.enabled || this.disposed) return;
    const layer = this.layer(element);
    this.library ??= this.player.library("charge-fill", deferred);
    this.library.add(meta, texture);
    layer.pool = this.makePool(layer, meta);
    layer.missing = false;
  }

  private retire(seconds: number): void {
    if (this.active === null) return;
    this.active.left = this.active.fade = seconds;
    this.active = null;
  }

  /** Call after every correct letter, including the last, and when the current word changes. */
  sync(word: ChargeFillWord | null, element: string): void {
    if (!this.enabled || this.disposed) return;
    if (word !== null && (!slots.has(word.slot) || !(word.letters > 0))) word = null;
    if (word !== this.word || element !== this.element) {
      this.retire(CHARGE_FILL_CANCEL_S);
      this.word = word;
      this.element = element;
      if (word !== null) {
        this.prepareElement(element);
        // A saturated visual pool drops a new layer, never queues or delays a cast.
        const voice = this.voices.find((v) => v.layer === null);
        if (voice !== undefined) {
          voice.layer = this.layer(element);
          voice.progress = 0;
          voice.left = voice.fade = 0;
          this.active = voice;
        }
      }
    }
    if (this.active !== null && word !== null) {
      this.active.progress = Number.isFinite(word.typed) ? Math.min(1, Math.max(0, word.typed / word.letters)) : 0;
      if (word.typed >= word.letters) this.retire(CHARGE_FILL_RELEASE_S);
    }
  }

  /** Real seconds affect only the two fade-outs; a paused word holds exactly the same clip frame. */
  update(dt: number, pose: ChargeFillPose): void {
    if (!this.enabled || this.disposed) return;
    const step = Math.max(0, dt);
    this.time += step;
    this.player.clear();
    let total = 0;
    for (const voice of this.voices) {
      if (voice.layer === null) continue;
      if (voice.fade > 0) {
        voice.left = Math.max(0, voice.left - step);
        if (voice.left <= 1e-8) { voice.layer = null; continue; }
      }
      if (voice.layer.pool !== null) total += voice.fade > 0 ? voice.left / voice.fade : 1;
    }
    // Crossfading old/new words or elements together stays below 0.9 per channel.
    this.options.intensity = 0.9 / Math.max(1, total);
    this.options.lift = -pose.bodyWidth * 0.6;
    this.at.set(pose.x, pose.y + pose.height * 0.62, pose.z);
    for (const voice of this.voices) {
      const pool = voice.layer?.pool;
      if (pool == null || pool.meta === null) continue;
      this.options.frame = chargeFillFrame(pool.meta, voice.progress, 1);
      this.options.alpha = voice.fade > 0 ? voice.left / voice.fade : 1;
      pool.spawn(this.at, pose.bodyWidth * 1.2 / pool.meta.aspect, this.options);
    }
    this.player.update(0);
    // Failed atlas requests retry slowly, independently of the last-key release.
    if (this.word !== null && this.active !== null) this.prepareElement(this.element);
  }

  clear(): void {
    this.word = null;
    this.active = null;
    for (const voice of this.voices) voice.layer = null;
    this.player.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    this.player.dispose();
    this.library?.reset();
  }
}
