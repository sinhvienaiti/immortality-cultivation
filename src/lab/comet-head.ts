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
import { FlipbookPool, ONE_FRAME, type FlipbookLibrary, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";

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
  /** Fixed steps (the lab's ?fixed=1): the video is seeked along world time instead of playing. */
  driven = false;
  /** Off: the atlas (the lab's ?video=0). */
  videoOn = true;
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
  use(folder: string, lib: FlipbookLibrary): boolean {
    if (folder !== this.folder) {
      this.folder = folder;
      this.drop();
    }
    if (this.rim === null) {
      for (const id of lib.ids()) {
        const e = lib.get(id);
        if (e === null || e.meta.role !== "comet" || e.meta.comet === undefined) continue;
        const heading = cometHeading(e.meta.comet.tail);
        // The atlas card is pinned on the head too (its place in the cell, when the manifest gives it).
        const meta: FlipbookMeta = { ...e.meta, heading, pivot: e.meta.comet.cell ?? e.meta.pivot };
        if (e.meta.layer === "body") {
          if (this.body === null) {
            const pool = this.newPool(id, e.meta.mode, 12);
            pool.attach(meta, e.texture);
            this.body = { pool, meta };
          }
        } else {
          const pool = this.newPool(id, e.meta.mode, 13);
          pool.attach(meta, e.texture);
          this.rim = { pool, meta };
          this.headAtlas.attach(meta, e.texture);
        }
      }
      if (this.rim !== null) this.load();
    }
    return this.rim !== null;
  }

  /** The rim's video, when it has one and this page plays H.264. */
  private load(): void {
    const rim = this.rim!;
    const v = rim.meta.video;
    if (!this.videoOn || v === undefined || typeof document === "undefined") return;
    const el = document.createElement("video");
    if (el.canPlayType('video/mp4; codecs="avc1.640028"') === "") return;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.src = v.url;
    el.load();
    const texture = new THREE.VideoTexture(el);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.el = el;
    this.texture = texture;
    this.duration = v.frames / v.fps;
    const cell: FlipbookMeta = { ...rim.meta, id: rim.meta.id + "#video", cols: 1, rows: 1, frames: 1, fps: v.fps, start: 0, loop: false, aspect: v.w / v.h,
      pivot: rim.meta.comet!.head, peak: undefined, holdEnd: undefined, video: undefined };
    this.videoPool.attach(cell, texture);
    this.headVideo.attach(cell, texture);
  }

  /** Whether the video shows frames now (else the atlas draws). */
  private get showing(): boolean {
    return this.el !== null && this.el.readyState >= 2 && this.el.error === null;
  }

  /**
   * One comet this frame: its head at `at`, falling along `fall` (world, unit), `size` m tall (the card), `alpha`
   * shown; `phase` (s) offsets the atlas loop so two comets in the air are not twins; `boost` (0–1) draws its head's
   * ball a second time, that much light, solid against the ground.
   */
  draw(at: THREE.Vector3, fall: THREE.Vector3, size = COMET_M, alpha = 1, phase = 0, boost = 0): boolean {
    const rim = this.rim;
    if (rim === null) return false;
    this.drawn = true;
    const o = this.o;
    (o.dir as THREE.Vector3).copy(fall);
    o.alpha = alpha;
    if (this.body !== null) {
      // The body under the light (Dark's black smoke), its atlas on the same clock.
      const m = this.body.meta;
      o.frame = ((this.clock + phase) * m.fps) % m.frames;
      this.body.pool.spawn(at, size, o);
    }
    const showing = this.showing;
    if (showing) {
      o.frame = 0;
      this.videoPool.spawn(at, size, o);
    } else {
      o.frame = ((this.clock + phase) * rim.meta.fps) % rim.meta.frames;
      rim.pool.spawn(at, size, o);
    }
    if (boost > 0) {
      o.intensity = boost;
      o.occlude = HEAD_OCCLUDE;
      (showing ? this.headVideo : this.headAtlas).spawn(at, size, o);
      o.intensity = undefined;
      o.occlude = 0.3;
    }
    return true;
  }

  /** World time: the video plays while comets are drawn (seeked on fixed steps), pauses when none are; cards age. */
  update(dt: number): void {
    this.clock += dt;
    const el = this.el;
    if (this.drawn) this.idle = 0;
    else this.idle += dt;
    this.drawn = false;
    if (el !== null) {
      if (this.idle < 0.05) {
        if (this.driven) {
          if (!el.paused) el.pause();
          const t = this.clock % Math.max(0.1, this.duration - 0.05);
          if (Math.abs(el.currentTime - t) > 0.5 / 24) el.currentTime = t;
        } else if (el.paused) void el.play().catch(() => undefined);
      } else if (!el.paused) el.pause();
    }
    this.videoPool.update(dt);
    this.headVideo.update(dt);
    this.headAtlas.update(dt);
    this.rim?.pool.update(dt);
    this.body?.pool.update(dt);
    // Long idle: the decoder and its texture go; the next comet loads it again.
    if (el !== null && this.idle > IDLE_S && el.getAttribute("src") !== null && this.idle - dt <= IDLE_S) {
      el.removeAttribute("src");
      el.load();
      this.texture?.dispose();
    } else if (el !== null && this.idle < 0.05 && el.getAttribute("src") === null && this.rim?.meta.video !== undefined) {
      el.src = this.rim.meta.video.url;
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
    this.videoPool.clear();
    this.headVideo.clear();
    this.headAtlas.clear();
    this.rim?.pool.clear();
    this.body?.pool.clear();
  }
}
