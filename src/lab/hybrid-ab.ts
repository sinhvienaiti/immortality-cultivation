/** Ticket 326: one scene/clock, with only the video and hybrid cards clipped at the screen's centre. */
import * as THREE from "three";
import { FLIPBOOK_MOTION, FlipbookPool, setFlipbookSplitX, type FlipbookLibrary, type FlipbookMeta, type FlipbookPlayer, type FlipbookVideo } from "../view/skills/flipbook";
import { seekVideoFrame, videoFrameReady, watchVideoFrame, type CometHead } from "./comet-head";

export const AB_CYCLE_S = 8;
export function abCardScale(rect: FlipbookMeta["sourceRect"]): number { return rect ? rect.crop[3] / rect.frame[1] : 1; }
export function textureGpuBytes(t: THREE.Texture): number {
  if (t instanceof THREE.CompressedTexture) return (t.mipmaps ?? []).reduce((sum, m) => sum + m.data.byteLength, 0);
  const img = t.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined;
  if (t instanceof THREE.VideoTexture) return (img?.videoWidth ?? 0) * (img?.videoHeight ?? 0) * 4;
  return (img?.width ?? 0) * (img?.height ?? 0) * 4 * (t.generateMipmaps ? 4 / 3 : 1);
}
export function textureFormatName(t: THREE.Texture): string | number {
  const names = { RGBA_ASTC_4x4_Format: THREE.RGBA_ASTC_4x4_Format, RGBA_BPTC_Format: THREE.RGBA_BPTC_Format, RGB_ETC1_Format: THREE.RGB_ETC1_Format,
    RGB_ETC2_Format: THREE.RGB_ETC2_Format, RGBA_ETC2_EAC_Format: THREE.RGBA_ETC2_EAC_Format, RGB_S3TC_DXT1_Format: THREE.RGB_S3TC_DXT1_Format,
    RGBA_S3TC_DXT5_Format: THREE.RGBA_S3TC_DXT5_Format, RGBAFormat: THREE.RGBAFormat };
  return Object.entries(names).find(([, value]) => value === t.format)?.[0] ?? t.format;
}
export interface AbSide {
  label: string; kind: "video" | "flipbook"; source: "mp4" | "png" | "ktx2-uastc" | "ktx2-etc1s";
  downloadBytes: number; gpuBytes: number; format: string | number; motion: boolean; ready: boolean;
}
export interface AbState {
  scene: string; ready: boolean; error: string | null; only: "left" | "right" | null; left: AbSide; right: AbSide;
  cycle: number; cycleS: number; clock: number; splitX: number; uploadMs: number; glError: number;
}
interface AbHost {
  camera: THREE.PerspectiveCamera; layer: THREE.Object3D; renderer: THREE.WebGLRenderer;
  player: FlipbookPlayer; hybrid: FlipbookLibrary; labelHost: HTMLElement;
  castMeteor(): void; prepareComet(): boolean; comet(): CometHead;
}
interface AbOptions {
  scene: string; only: "left" | "right" | null; left: "video" | "crf23" | "720p";
  prewarm: boolean; autostart: boolean; driven: boolean;
}

export class HybridAB {
  private meta: FlipbookMeta | null = null;
  private video: FlipbookVideo | null = null;
  private el: HTMLVideoElement | null = null;
  private vt: THREE.VideoTexture | null = null;
  private leftPool: FlipbookPool | null = null;
  private rightPool: FlipbookPool | null = null;
  private readonly blank = new THREE.Texture();
  private readonly buffer = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly labels: { side: "left" | "right"; el: HTMLDivElement }[] = [];
  private loaded = false;
  private ready = false;
  private error: string | null = null;
  private attached = false;
  private warmed = false;
  private running = false;
  private pendingStart = false;
  private generation = 0;
  private clock = 0;
  private cycle = 0;
  private cycleS = 0;
  private splitX = 0;
  private uploadMs = 0;
  private glError = 0;
  private videoBytes = 0;

  constructor(private readonly host: AbHost, private readonly opts: AbOptions) {
    for (const side of ["left", "right"] as const) {
      if (opts.only && opts.only !== side) continue;
      const el = document.createElement("div");
      el.style.cssText = `position:fixed;${side}:24px;top:16px;z-index:8;background:rgba(8,10,16,.72);color:#f2f4f8;padding:10px 14px;font:13px system-ui;pointer-events:none`;
      host.labelHost.append(el);
      this.labels.push({ side, el });
    }
    if (!opts.only) {
      const line = document.createElement("div");
      line.style.cssText = "position:fixed;left:50%;top:0;bottom:0;width:2px;background:#f2f4f8;z-index:8;pointer-events:none";
      host.labelHost.append(line);
    }
    this.label();
  }

  async load(): Promise<void> {
    try {
      await this.host.player.ready("hybrid");
      const id = this.opts.scene === "meteor" ? "fire-comet" : this.opts.scene;
      this.meta = this.host.hybrid.get(id)?.meta ?? null;
      if (!this.meta) { this.error = `hybrid/manifest.json chưa có ${id} (phiếu 325)`; this.label(); return; }
      const compare = this.meta.compareWith;
      const folder = this.opts.scene === "meteor" ? "fire" : compare?.folder;
      if (!folder) throw new Error("hybrid compareWith is missing: " + id);
      await this.host.player.ready(folder);
      const own = this.host.player.library(folder).declares().find((m) => m.id === (compare?.id ?? id));
      this.video = this.opts.left === "video" ? own?.video ?? null : this.meta.videoVariants?.[this.opts.left] ?? null;
      if (this.opts.scene === "meteor") this.video = own?.video ?? null;
      this.videoBytes = this.video?.bytes ?? 0;
      if (this.video && !this.videoBytes && this.opts.only !== "right") {
        void fetch(this.video.url, { method: "HEAD" }).then((r) => { this.videoBytes = Number(r.headers.get("content-length")) || 0; }).catch(() => undefined);
      }
      if (this.opts.scene !== "meteor") {
        if (this.opts.only !== "left" && this.host.hybrid.deferred(id)) void this.host.hybrid.fetchAtlas(id);
        if (this.opts.only !== "right") {
          if (!this.video) throw new Error("A/B video is missing: " + id + "/" + this.opts.left);
          const el = document.createElement("video");
          el.muted = true; el.playsInline = true; el.preload = "auto"; el.crossOrigin = "anonymous";
          el.src = this.video.url; el.load(); watchVideoFrame(el);
          this.el = el;
          this.vt = new THREE.VideoTexture(el); this.vt.colorSpace = THREE.SRGBColorSpace;
          this.leftPool = new FlipbookPool(id + "#video-ab", "fire", 1, 15, this.blank);
          this.leftPool.vignette = 0.35;
          this.leftPool.clipSide = this.opts.only ? 0 : -1;
          this.leftPool.attach({ ...this.meta, cols: 1, rows: 1, frames: 1, fps: this.video.fps, loop: false, start: 0, pivot: this.video.pivot, aspect: this.video.w / this.video.h }, this.vt);
        }
        if (this.opts.only !== "left") {
          this.rightPool = new FlipbookPool(id + "#ab", "fire", 1, 15, this.blank);
          this.rightPool.vignette = 0.35; this.rightPool.clipSide = this.opts.only ? 0 : 1;
        }
      }
      this.loaded = true;
    } catch (e) { this.error = String(e); console.warn("[hybrid-ab]", e); }
    this.label();
  }

  private warm(): void {
    if (this.warmed || !this.meta) return;
    this.warmed = true;
    const e = this.host.hybrid.get(this.meta.id);
    if (this.opts.prewarm && this.opts.only !== "left" && e) {
      const t0 = performance.now();
      this.host.renderer.initTexture(e.texture);
      if (e.controls?.mv) this.host.renderer.initTexture(e.controls.mv);
      this.uploadMs += performance.now() - t0;
    }
    this.glError = this.host.renderer.getContext().getError();
  }

  start(): void {
    if (!this.ready) { this.pendingStart = true; return; }
    this.pendingStart = false;
    this.clock = this.cycleS = this.cycle = 0;
    this.running = false;
    this.beginCycle();
  }

  private beginCycle(): void {
    const gen = ++this.generation;
    this.running = false;
    this.leftPool?.clear(); this.rightPool?.clear();
    if (this.opts.scene === "meteor") {
      this.host.comet().clear();
      this.running = true; this.host.castMeteor(); return;
    }
    const spawn = (): void => {
      if (gen !== this.generation) return;
      this.running = true;
      this.spawnCards();
    };
    const el = this.el;
    if (!el) { spawn(); return; }
    el.pause();
    if (this.opts.driven) {
      if (el.currentTime !== 0 || el.seeking) seekVideoFrame(el, 0);
      spawn();
      return;
    }
    const play = (): void => {
      if (gen !== this.generation) return;
      void el.play().then(spawn).catch((e: unknown) => { this.error = String(e); this.label(); });
    };
    // A no-op seek need not dispatch seeked; a real seek waits before both cards start.
    if (el.currentTime === 0 && !el.seeking) { watchVideoFrame(el); play(); }
    else { el.addEventListener("seeked", play, { once: true }); seekVideoFrame(el, 0); }
  }

  private spawnCards(): void {
    const cam = this.host.camera;
    cam.getWorldDirection(this.direction);
    const t = this.direction.y < -1e-3 ? -cam.position.y / this.direction.y : 30;
    this.point.set(cam.position.x + this.direction.x * t, 0, cam.position.z + this.direction.z * t);
    const d = this.point.distanceTo(cam.position);
    const size = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 0.9;
    const o = { life: AB_CYCLE_S - 0.5, lift: d * 0.6, ground: 0, occlude: 0.12, alpha: 1, fadeOut: 0.3, frame: 0 };
    this.leftPool?.spawn(this.point, size, { ...o, rate: 0 });
    this.rightPool?.spawn(this.point, size * abCardScale(this.meta?.sourceRect), { ...o, rate: 1 });
  }

  update(dt: number): void {
    this.splitX = this.host.renderer.getDrawingBufferSize(this.buffer).x / 2;
    setFlipbookSplitX(this.splitX);
    if (!this.loaded || !this.meta) return;
    if (this.opts.scene === "meteor") {
      const comet = this.host.comet();
      if ((this.opts.only === "left" && !comet.id.startsWith("fire-comet")) || (this.opts.only !== "left" && !comet.upgraded)) this.host.prepareComet();
      if (comet.id.startsWith("fire-comet") && (this.opts.only === "right" || comet.videoReady) && (this.opts.only === "left" || comet.upgraded)) {
        this.warm(); this.ready = true;
      }
    } else {
      if (!this.attached && (this.opts.only === "left" || !this.host.hybrid.deferred(this.meta.id))) {
        const e = this.host.hybrid.get(this.meta.id)!;
        if (this.rightPool) {
          const r = this.meta.sourceRect;
          const pivot = r && this.video ? [(this.video.pivot[0] * r.frame[0] - r.crop[0]) / r.crop[2], (this.video.pivot[1] * r.frame[1] - r.crop[1]) / r.crop[3]] as const : this.meta.pivot;
          this.rightPool.attach({ ...this.meta, pivot }, e.texture, e.controls);
        }
        this.warm();
        if (this.leftPool) this.host.layer.add(this.leftPool.mesh);
        if (this.rightPool) this.host.layer.add(this.rightPool.mesh);
        this.attached = true;
      }
      if (this.attached && (this.opts.only === "right" || (this.el?.readyState ?? 0) >= 2)) this.ready = true;
    }
    if (this.ready && (this.pendingStart || (this.opts.autostart && !this.running && this.generation === 0))) this.start();
    if (this.running) {
      if (this.cycleS >= AB_CYCLE_S - 1e-9) { this.cycleS = 0; this.cycle += 1; this.beginCycle(); }
      if (!this.running) { this.label(); return; }
      if (this.opts.driven && this.el && this.video) {
        this.el.pause();
        const time = Math.min(this.cycleS, Math.max(0, this.video.frames / this.video.fps - 1 / this.video.fps));
        if (Math.abs(this.el.currentTime - time) > 0.5 / 24) seekVideoFrame(this.el, time);
      }
      this.leftPool?.update(dt); this.rightPool?.update(dt);
      this.clock += dt; this.cycleS += dt;
    }
    this.label();
  }

  async settle(): Promise<boolean> {
    const videos = this.opts.scene === "meteor" ? [this.host.comet().videoEl] : [this.el];
    const els = videos.filter((el): el is HTMLVideoElement => el !== null);
    const until = performance.now() + 500;
    while (els.some((el) => !videoFrameReady(el))) {
      if (performance.now() >= until) return false;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return true;
  }

  state(): AbState {
    const e = this.meta && this.host.hybrid.get(this.meta.id);
    const isKtx = e && this.host.hybrid.source(this.meta!.id) === "ktx2";
    const variant = e?.texture.userData.hybridVariant === "etc1s" ? "etc1s" : "uastc";
    const motion = !!e?.controls?.mv && FLIPBOOK_MOTION.blend;
    const mvKtx = e?.controls?.mv instanceof THREE.CompressedTexture;
    const el = this.opts.scene === "meteor" ? this.host.comet().videoEl : this.el;
    const leftLabel = this.opts.scene !== "meteor" && this.opts.left === "crf23" ? "Video CRF 23" : this.opts.scene !== "meteor" && this.opts.left === "720p" ? "Video 720p" : "Hiện tại: video";
    const left: AbSide = { label: leftLabel, kind: "video", source: "mp4", downloadBytes: this.videoBytes, gpuBytes: (el?.videoWidth ?? 0) * (el?.videoHeight ?? 0) * 4,
      format: "RGBAFormat", motion: false, ready: (el?.readyState ?? 0) >= 2 };
    const right: AbSide = { label: "Cách lai: flipbook", kind: "flipbook", source: isKtx ? `ktx2-${variant}` : "png",
      downloadBytes: (isKtx ? this.meta?.ktx2?.[variant]?.bytes : this.meta?.bytes) ?? 0,
      gpuBytes: e && !this.host.hybrid.deferred(this.meta!.id) ? textureGpuBytes(e.texture) + (e.controls?.mv ? textureGpuBytes(e.controls.mv) : 0) : 0,
      format: e ? textureFormatName(e.texture) : "RGBAFormat", motion, ready: !!e && !this.host.hybrid.deferred(this.meta!.id) };
    if (e?.controls?.mv) right.downloadBytes += (mvKtx ? this.meta?.motion?.ktx2?.[variant]?.bytes : this.meta?.motion?.bytes) ?? 0;
    return { scene: this.opts.scene, ready: this.ready, error: this.error, only: this.opts.only, left, right, cycle: this.cycle, cycleS: this.cycleS, clock: this.clock, splitX: this.splitX, uploadMs: this.uploadMs, glError: this.glError };
  }

  private label(): void {
    const state = this.state();
    for (const { side, el } of this.labels) {
      const s = state[side];
      const image = this.meta && this.host.hybrid.get(this.meta.id)?.texture.image as { width?: number; height?: number } | null;
      const size = side === "left" ? `${this.video?.w ?? 0}×${this.video?.h ?? 0}` : this.meta && image?.width && image.height ? `${Math.round(image.width / this.meta.cols)}×${Math.round(image.height / this.meta.rows)}` : "—";
      const fps = side === "left" ? this.video?.fps : this.meta?.fps;
      const detail = side === "right" && this.error ? this.error : `${size} · ${fps ?? 0} fps · ${(s.downloadBytes / 1e6).toFixed(2)} MB · ${s.motion ? "có vector" : "không vector"} · ${s.source.replace("ktx2-", "KTX2 ").toUpperCase()}`;
      const text = s.label + "|" + detail;
      if (el.dataset.text === text) continue;
      el.dataset.text = text; el.replaceChildren();
      const title = document.createElement("div"); title.style.cssText = "font-size:20px;font-weight:bold"; title.textContent = s.label;
      const sub = document.createElement("div"); sub.style.cssText = "font-size:13px;margin-top:4px"; sub.textContent = detail;
      el.append(title, sub);
    }
  }
}
