/** Ticket 438: URL-gated lab adapter. No loop, global prototype hook, skill or combat wiring. */
import * as THREE from "three";
import { CloudVolume, type CloudVolumeOptions } from "./cloud-volume";
import { cloudEnvelope, cloudFrameStats, probeCloudPixels } from "./cloud-volume-probe";

export type CloudKind = "thunder" | "poison" | "dark";
export const CLOUD_PRESETS: Record<CloudKind, Partial<CloudVolumeOptions>> = {
  thunder: { bottomColor: 0x272a39, topColor: 0x788296, glowColor: 0x8063ff, glowIntensity: 0,
    lightningIntensity: 0.95, scrollSpeed: 0.38, coverage: 1, storm: true,
    baseHeight: 6.2, thickness: 7.8, aspect: 0.55, appearSeconds: 0.45 },
  poison: { bottomColor: 0x0a2012, topColor: 0x7f9c5c, glowColor: 0x9be36f, glowIntensity: 0.13,
    lightningIntensity: 0, scrollSpeed: 0.26, coverage: 0.88 },
  dark: { bottomColor: 0x07040d, topColor: 0x3e2d52, glowColor: 0x73548b, glowIntensity: 0.008,
    lightningIntensity: 0, scrollSpeed: -0.2, coverage: 0.94 },
};

interface CloudLabHost {
  scene: THREE.Scene;
  parent: THREE.Object3D;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  time(): number;
  view(mode: "top" | "behind"): void;
  foes(): number;
}

export interface CloudLabApi {
  kind: CloudKind; cloud: CloudVolume; show(on?: boolean): void;
  configure(options: Partial<CloudVolumeOptions>): void;
  report(): unknown; probe(frames?: number): unknown; live(seconds?: number): Promise<unknown>; dispose(): void;
}

export function installCloudVolumeLab(host: CloudLabHost, params: URLSearchParams) {
  const value = params.get("cloud");
  if (value !== "thunder" && value !== "poison" && value !== "dark") return null;
  const kind: CloudKind = value;
  const cloud = new CloudVolume(host.parent, CLOUD_PRESETS[kind]);
  let last = host.time(), excluded = false, disposed = false;
  // Preserve the stress scene's existing hook; labTime advances only once per host frame.
  const before = host.scene.onBeforeRender;
  const hook: typeof before = function (this: THREE.Scene, ...args) {
    before.apply(this, args);
    const now = host.time(); cloud.update(Math.max(0, now - last)); last = now;
    if (excluded) cloud.mesh.visible = false;
  };
  host.scene.onBeforeRender = hook;
  const sync = (): void => { const now = host.time(); cloud.update(Math.max(0, now - last)); last = now; };
  const show = (on = true): void => { sync(); if (on) cloud.show(); else cloud.hide(); };
  const api: CloudLabApi = {
    kind, cloud,
    show,
    configure: (options: Partial<CloudVolumeOptions>) => cloud.configure(options),
    report: () => ({ kind, active: cloud.active, shown: cloud.shown, parameters: cloud.parameters,
      envelope: cloudEnvelope(cloud, host.camera), frameDrawCalls: host.renderer.info.render.calls }),
    /** Frozen-frame draw delta, then synchronized whole-frame timings through the lab's existing GPU fence. */
    probe(frames = 120) {
      const lab = window.__lab;
      if (!lab?.ready) throw new Error("Lab is not ready.");
      if (!cloud.shown) throw new Error("Press Q to show the cloud first.");
      frames = Math.max(30, Math.min(600, Math.floor(Number.isFinite(frames) ? frames : 120)));
      lab.perf(30); // Finish appearance and compile/upload before collecting timings.
      lab.perf(30);
      const footprint = probeCloudPixels(cloud, host.renderer, host.camera);
      let off: ReturnType<typeof lab.perf>;
      try { excluded = true; off = lab.perf(1, 0); }
      finally { excluded = false; }
      const on = lab.perf(1, 0);
      const perf = lab.perf(frames);
      const cpu = cloudFrameStats(perf.cpu), total = cloudFrameStats(perf.total);
      const stress = window.__stress?.report();
      const walkers = stress?.ready === true ? (stress.walkers as { instances: number }).instances : 0;
      const foes = host.foes() + walkers;
      const gpuValid = !!perf.gpu && !/swiftshader|llvmpipe|software/i.test(perf.gpu);
      const viewport = host.renderer.getSize(new THREE.Vector2());
      const result = { kind, gpu: perf.gpu, gpuValid, viewport: viewport.toArray(), dpr: host.renderer.getPixelRatio(),
        stressReady: stress?.ready === true, foes, cpu, total, footprint,
        cloudDrawDelta: on.drawCalls - off.drawCalls, frameDrawCalls: perf.drawCalls,
        camera: { position: host.camera.position.toArray(), quaternion: host.camera.quaternion.toArray(), fov: host.camera.fov },
        gates: { draws: footprint.drawGate && on.drawCalls - off.drawCalls > 0 && on.drawCalls - off.drawCalls <= 2,
          width: footprint.widthGate, frame: gpuValid && stress?.ready === true && foes === 100
            && viewport.x === 1280 && viewport.y === 720 && total.p95Ms !== null && total.p95Ms <= 16.7 } };
      console.info("[cloud-438]", JSON.stringify(result));
      return result;
    },
    /** Real rAF pacing, separately labelled from the GPU-fenced render duration. Run without ?fixed=1. */
    async live(seconds = 8) {
      if (params.get("fixed") === "1") throw new Error("Live probe needs the running loop; remove fixed=1.");
      const intervals: number[] = [];
      const end = performance.now() + Math.max(1, Math.min(30, seconds)) * 1000;
      await new Promise<void>(resolve => {
        let lastStamp = 0;
        const sample = (now: number): void => {
          if (lastStamp > 0) intervals.push(now - lastStamp);
          lastStamp = now;
          if (now < end) requestAnimationFrame(sample); else resolve();
        };
        requestAnimationFrame(sample);
      });
      const result = { kind, interval: cloudFrameStats(intervals), cloud: api.report() };
      console.info("[cloud-438-live]", JSON.stringify(result)); return result;
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (host.scene.onBeforeRender === hook) host.scene.onBeforeRender = before;
      cloud.dispose();
      if (window.__cloud438 === api) delete window.__cloud438;
      window.removeEventListener("pagehide", api.dispose);
    },
  };
  window.__cloud438 = api;
  window.addEventListener("pagehide", api.dispose);
  console.info(`[cloud-438] ${kind}: Q show/dissolve, 0 play camera, 1 top, 2 behind; __cloud438.probe(120)`);
  return {
    key(e: KeyboardEvent): boolean {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
      if (/^[012]$/.test(e.key)) {
        if (!e.repeat) host.view(e.key === "2" ? "behind" : "top");
        e.preventDefault(); return true;
      }
      if (e.code !== "KeyQ" && e.key.toLowerCase() !== "q") return false;
      if (!e.repeat) show(!cloud.shown);
      e.preventDefault(); return true;
    },
    dispose: api.dispose,
  };
}

declare global { interface Window { __cloud438?: CloudLabApi } }
