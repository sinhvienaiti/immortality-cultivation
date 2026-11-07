/**
 * A meteor's body from its element's own comet clip (role "comet", Firefly image-to-video of the approved comet still,
 * 06/11; docs/work/tasks/skill-five-phase-samples.md): the 1080p video (a loop, its end crossfaded into its start) on a
 * camera-facing card pinned at the comet's head (the manifest's `head`) and turned so the head leads along the fall on
 * screen (its tail `dir` points back up the path). The atlas loop stands in while the video cannot play (no H.264, the
 * lab's ?video=0) and draws a body layer (Dark's black smoke filmed on white: no alpha in its video) under the rim. Code
 * only places, turns and times the clip. One video element per element folder, shared by every meteor in the air; on
 * fixed steps (captures) it is seeked along world time. No allocation per frame.
 */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookLibrary, type FlipbookMeta, type FlipbookVideo, type FlipOptions } from "../view/skills/flipbook";

/** The card's height (m): the comet's head about 0.9 m across, its own tail ~7 m behind it at the play camera. */
export const COMET_M = 6;
/**
 * The head's second draw (`draw`'s boost): a disc round the head (its pivot, the white-hot front of the ball) out to
 * HEAD_R of the card's height, so the ball reads as a solid, bright mass (owner 06/11 12:52: "đầu thiên thạch phải là
 * khối rõ, đặc, sáng"); it darkens the ground behind it more (occlusion) than the light tail does.
 */
const HEAD_R = 0.22;
const HEAD_OCCLUDE = 0.85;
/** A paused video waits this long after its last card (world s) before it lets its file go. */
const IDLE_S = 1.5;
export type CometMode = "video" | "flipbook" | "ab";
export function cometPhase(n: number): number { return (n * 0.6180339887498949) % 1; }
export function cometFrame(clock: number, phase: number, fps: number, frames: number): number { return (clock * fps + phase * frames) % frames; }

// Register on every seek, before settle() is called (paused capture videos also submit frames).
const videoFrames = new WeakMap<HTMLVideoElement, { done: boolean; handle?: number }>();
export function watchVideoFrame(el: HTMLVideoElement): void {
  const old = videoFrames.get(el);
  if (old?.handle !== undefined) el.cancelVideoFrameCallback(old.handle);
  const state: { done: boolean; handle?: number } = { done: !el.requestVideoFrameCallback };
  videoFrames.set(el, state);
  if (el.requestVideoFrameCallback) state.handle = el.requestVideoFrameCallback(() => { state.done = true; state.handle = undefined; });
}
export function seekVideoFrame(el: HTMLVideoElement, t: number): void {
  el.currentTime = t;
  watchVideoFrame(el);
}
export function videoFrameReady(el: HTMLVideoElement): boolean {
  return !el.seeking && el.readyState >= 2 && (videoFrames.get(el)?.done ?? !el.requestVideoFrameCallback);
}

/** The clip's travel heading in its cell (rad, y up): the reverse of its tail direction (frame pixels, y down). */
export function cometHeading(tail: readonly [number, number]): number {
  return Math.atan2(tail[1], -tail[0]);
}

/** A card faded to a disc round its pivot (the comet's head): the ball alone, no tail, no cell edge. */
function headDisc(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  material.customProgramCacheKey = () => "comet-head-disc";
  material.onBeforeCompile = (shader) => {
    const line = "  border *= 1.0 - uVignette * smoothstep(0.6, 0.98, length(vUv - 0.5) * 2.0);";
    if (!shader.fragmentShader.includes(line)) throw new Error("[comet] head-disc anchor missing");
    shader.fragmentShader = shader.fragmentShader
      .replace(line, `  border *= 1.0 - smoothstep(${(HEAD_R * 0.45).toFixed(3)}, ${HEAD_R.toFixed(3)}, length(vec2((vUv.x - uPivot.x) * uAspect, vUv.y - uPivot.y)));`)
      // Declared at the top: the tag mask (tag-mask.ts) renames the body's main and appends its own.
      .replace(/^/, "uniform vec2 uPivot;\nuniform float uAspect;\n");
  };
}

interface Layer {
  readonly pool: FlipbookPool;
  readonly meta: FlipbookMeta;
}

export class CometHead {
  private folder = "";
  private rim: Layer | null = null;
  private body: Layer | null = null;
  private videoPool: FlipbookPool;
  /** The head's second draw, from the video and from the atlas. */
  private readonly headVideo: FlipbookPool;
  private readonly headAtlas: FlipbookPool;
  private el: HTMLVideoElement | null = null;
  private texture: THREE.VideoTexture | null = null;
  private duration = 0;
  private clock = 0;
  private idle = 0;
  private drawn = false;
  private seenDraw = false;
  private fromUpgrade = false;
  private video: FlipbookVideo | undefined;
  /** Fixed steps (the lab's ?fixed=1): the video is seeked along world time instead of playing. */
  driven = false;
  mode: CometMode = "video";
  private readonly o: FlipOptions = { life: ONE_FRAME, rate: 0, frame: 0, lift: 0.6, ground: 0, occlude: 0.3, dir: new THREE.Vector3() };

  constructor(private readonly layer: THREE.Object3D, private readonly blank: THREE.Texture) {
    this.videoPool = this.newPool("comet-video", "fire", 13);
    this.headVideo = this.newPool("comet-head-video", "fire", 14);
    this.headAtlas = this.newPool("comet-head-atlas", "fire", 14);
    headDisc(this.headVideo);
    headDisc(this.headAtlas);
  }

  private newPool(id: string, mode: FlipbookMeta["mode"], order: number): FlipbookPool {
    const p = new FlipbookPool(id, mode, 12, order, this.blank);
    p.vignette = 0.2;
    this.layer.add(p.mesh);
    return p;
  }

  /** The element folder's comet from `lib` (call each frame it may be needed; cheap once set). False: it has none (yet). */
  use(folder: string, lib: FlipbookLibrary, upgrade: FlipbookLibrary | null = null): boolean {
    const candidate = this.rim && upgrade?.get(this.rim.meta.id);
    if (folder !== this.folder || (this.mode !== "video" && !this.fromUpgrade && candidate && !upgrade!.deferred(candidate.meta.id) && candidate.meta.role === "comet" && candidate.meta.comet)) {
      this.folder = folder;
      this.drop();
    }
    if (this.rim === null) {
      for (const id of lib.ids()) {
        const own = lib.get(id);
        if (own === null || own.meta.role !== "comet" || own.meta.comet === undefined) continue;
        const better = this.mode !== "video" ? upgrade?.get(id) : null;
        const useUpgrade = own.meta.layer !== "body" && better != null && better.meta.role === "comet" && better.meta.comet !== undefined && !upgrade!.deferred(id);
        const e = useUpgrade ? better! : own;
        const heading = cometHeading(e.meta.comet!.tail);
        const meta: FlipbookMeta = { ...e.meta, heading, pivot: e.meta.comet!.cell ?? e.meta.pivot };
        if (meta.layer === "body") {
          if (this.body === null) {
            const pool = this.newPool(id, e.meta.mode, 12);
            pool.attach(meta, e.texture, e.controls);
            this.body = { pool, meta };
          }
        } else if (this.rim === null) {
          const pool = this.newPool(id, e.meta.mode, 13);
          pool.attach(meta, e.texture, e.controls);
          this.rim = { pool, meta };
          this.headAtlas.attach(meta, e.texture, e.controls);
          this.video = own.meta.video;
          this.fromUpgrade = useUpgrade;
        }
      }
      if (this.rim !== null && this.mode !== "flipbook") this.load();
    }
    this.videoPool.clipSide = this.headVideo.clipSide = this.mode === "ab" ? -1 : 0;
    if (this.rim) this.rim.pool.clipSide = this.mode === "ab" ? 1 : 0;
    this.headAtlas.clipSide = this.mode === "ab" ? 1 : 0;
    return this.rim !== null;
  }

  /** The rim's video, when it has one and this page plays H.264. */
  private load(): void {
    const rim = this.rim!;
    const v = this.video;
    if (this.mode === "flipbook" || v === undefined || typeof document === "undefined") return;
    const el = document.createElement("video");
    if (el.canPlayType('video/mp4; codecs="avc1.640028"') === "") return;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.src = v.url;
    el.load();
    watchVideoFrame(el);
    this.seenDraw = false;
    this.idle = 0;
    const texture = new THREE.VideoTexture(el);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.el = el;
    this.texture = texture;
    this.duration = v.frames / v.fps;
    if (rim.meta.playback !== undefined) el.playbackRate = this.duration / rim.meta.playback.durationS;
    const cell: FlipbookMeta = { ...rim.meta, id: rim.meta.id + "#video", cols: 1, rows: 1, frames: 1, fps: v.fps, start: 0, loop: false, aspect: v.w / v.h,
      pivot: rim.meta.comet!.head, peak: undefined, holdEnd: undefined, video: undefined };
    this.videoPool.attach(cell, texture);
    this.headVideo.attach(cell, texture);
  }

  get upgraded(): boolean { return this.fromUpgrade; }
  get videoEl(): HTMLVideoElement | null { return this.el; }
  get videoReady(): boolean { return this.showing; }

  /** Whether the video shows frames now (else the atlas draws). */
  private get showing(): boolean {
    return this.el !== null && this.el.readyState >= 2 && this.el.error === null;
  }

  /**
   * One comet this frame: its head at `at`, falling along `fall` (world, unit), `size` m tall (the card), `alpha`
   * shown; `phase` (0–1 of a loop) offsets the atlas loop so two comets in the air are not twins; `boost` (0–1) draws its head's
   * ball a second time, that much light, solid against the ground.
   */
  draw(at: THREE.Vector3, fall: THREE.Vector3, size = COMET_M, alpha = 1, phase = 0, boost = 0): boolean {
    const rim = this.rim;
    if (rim === null) return false;
    this.drawn = true;
    this.seenDraw = true;
    const o = this.o;
    (o.dir as THREE.Vector3).copy(fall);
    o.alpha = alpha;
    if (this.body !== null) {
      // The body under the light (Dark's black smoke), its atlas on the same clock.
      const m = this.body.meta;
      o.frame = cometFrame(this.clock, phase, m.fps, m.frames);
      this.body.pool.spawn(at, size, o);
    }
    const showing = this.mode !== "flipbook" && this.showing;
    const atlas = !showing || this.mode === "ab";
    if (showing) {
      o.frame = 0;
      const duration = rim.meta.playback?.durationS;
      o.playbackT = duration === undefined ? undefined : (this.clock % duration) / duration;
      this.videoPool.spawn(at, size, o);
      if (boost > 0) {
        o.intensity = boost; o.occlude = HEAD_OCCLUDE;
        this.headVideo.spawn(at, size, o);
        o.intensity = undefined; o.occlude = 0.3;
      }
      o.playbackT = undefined;
    }
    if (atlas) {
      o.frame = cometFrame(this.clock, phase, rim.meta.fps, rim.meta.frames);
      const rect = rim.meta.sourceRect;
      const scale = this.upgraded && rect ? rect.crop[3] / rect.frame[1] : 1;
      rim.pool.spawn(at, size * scale, o);
      if (boost > 0) {
        o.intensity = boost; o.occlude = HEAD_OCCLUDE;
        this.headAtlas.spawn(at, size * scale, o);
        o.intensity = undefined; o.occlude = 0.3;
      }
    }
    return true;
  }

  /** World time: the video plays while comets are drawn (seeked on fixed steps), pauses when none are; cards age. */
  update(dt: number): void {
    this.clock += dt;
    const el = this.el;
    if (this.drawn) this.idle = 0;
    else if (this.seenDraw) this.idle += dt;
    this.drawn = false;
    if (el !== null) {
      if (this.seenDraw && this.idle < 0.05) {
        if (this.driven) {
          if (!el.paused) el.pause();
          const duration = this.rim?.meta.playback?.durationS;
          const t = duration === undefined ? (this.clock - dt) % Math.max(0.1, this.duration - 0.05)
            : ((this.clock - dt) % duration) * this.duration / duration;
          if (Math.abs(el.currentTime - t) > 0.5 / 24) seekVideoFrame(el, t);
        } else if (el.paused) void el.play().catch(() => undefined);
      } else if (!el.paused) el.pause();
    }
    this.videoPool.update(dt);
    this.headVideo.update(dt);
    this.headAtlas.update(dt);
    this.rim?.pool.update(dt);
    this.body?.pool.update(dt);
    // Long idle: the decoder and its texture go; the next comet loads it again.
    if (this.mode !== "ab" && el !== null && this.idle > IDLE_S && el.getAttribute("src") !== null && this.idle - dt <= IDLE_S) {
      el.removeAttribute("src");
      el.load();
      this.texture?.dispose();
    } else if (el !== null && this.idle < 0.05 && el.getAttribute("src") === null && this.video !== undefined) {
      el.src = this.video.url;
      watchVideoFrame(el);
      el.load();
    }
  }

  /** The video's file (the rim's head clip): for the report. */
  get id(): string {
    return this.rim === null ? "" : this.rim.meta.id + (this.el !== null ? " (video)" : " (atlas)") + (this.body !== null ? " + " + this.body.meta.id : "");
  }

  private drop(): void {
    this.el?.pause();
    this.el?.removeAttribute("src");
    this.el?.load();
    this.texture?.dispose();
    this.el = null;
    this.video = undefined;
    this.fromUpgrade = false;
    this.seenDraw = false;
    this.idle = 0;
    this.texture = null;
    for (const l of [this.rim, this.body]) {
      if (l === null) continue;
      l.pool.mesh.removeFromParent();
      l.pool.dispose();
    }
    this.rim = this.body = null;
    this.videoPool.clear();
    this.headVideo.clear();
    this.headAtlas.clear();
  }

  clear(): void {
    this.clock = 0;
    if (this.el && this.el.readyState >= 2) { this.el.pause(); seekVideoFrame(this.el, 0); }
    this.videoPool.clear();
    this.headVideo.clear();
    this.headAtlas.clear();
    this.rim?.pool.clear();
    this.body?.pool.clear();
  }
}
