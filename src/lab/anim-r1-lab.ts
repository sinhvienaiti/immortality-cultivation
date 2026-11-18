/** Ticket 397: F2 opts into the isolated human typing slice; no changes to the normal lab keys. */
import type { LabCaster } from "./caster";
import { AnimR1, type R1Host } from "./anim-r1-controller";
import { HERO } from "./hero-select";
import * as THREE from "three";
import { FAMILIES, type Family, FINGERS } from "./anim-r2-poses";
import { FrontHandsView } from "./anim-r2-camera";

export interface AnimR1Lab {
  key(event: KeyboardEvent): boolean;
  afterBody(advanced: boolean): void;
  afterDraw(): void;
  beforeDraw(): void;
  hit(target: number): void;
  reset(): void;
}

export function installAnimR1(caster: LabCaster, callbacks: Omit<R1Host, "now" | "note">,
  inspection?: { camera: THREE.Camera; fx: THREE.Object3D }): AnimR1Lab | null {
  if (HERO.id !== "human" || !caster.anim) return null;
  let status: HTMLDivElement | null = null;
  const note = (text: string): void => {
    if (!status) {
      status = document.createElement("div");
      status.dataset.animR1 = "status";
      status.style.cssText = "position:fixed;left:20px;bottom:115px;z-index:40;background:#141c24e8;color:#f0e6cd;padding:9px 14px;font:15px sans-serif;pointer-events:none";
      document.body.append(status);
    }
    status.textContent = text;
  };
  const r1 = new AnimR1(caster.anim, { ...callbacks, now: () => performance.now(), note });
  const front = inspection ? new FrontHandsView(inspection.camera, caster.root, inspection.fx) : null;
  let target = 0;
  const targets = [[0, -5], [6, -3], [-6, -3], [0, 9]] as const;
  const api = {
    begin: (word?: string) => r1.begin(word), text: (key: string) => r1.text(key),
    cancel: () => r1.cancel(), stop: () => { r1.stop(); front?.reset(); },
    retarget: (x: number, z: number) => r1.retarget(x, z), report: () => r1.report(),
  };
  (window as unknown as Record<string, unknown>).__labAnimR1 = api;
  (window as unknown as Record<string, unknown>).__labAnimR2 = { ...api, version: 403,
    family: (family: Family) => r1.select(family), seal: (id: number) => r1.inspect(id),
    front: (on = true) => { if (front) { front.enabled = on; front.compare = null; } },
    report: () => ({ ...r1.report(), front: front?.enabled ?? false }),
  };
  (window as unknown as Record<string, unknown>).__labAnimR3 = {
    ...api, version: 415, curlVersion: '415b',
    finger: (side: 'r' | 'l', finger: typeof FINGERS[number], angles: { curl?: number; abduction?: number; twist?: number }) => r1.seals.reference.setFinger(side,finger,angles),
    pole: (side: 'r' | 'l', point: readonly [number,number,number]) => r1.seals.reference.setPole(side,point),
    seal: (id: number) => { r1.inspect(id); if (front) { front.enabled = true; front.compare = 'front'; } },
    compare: (mode: 'front' | 'hands' = 'front') => {
      if (mode !== 'front' && mode !== 'hands') throw new Error('Expected front or hands');
      if (front) { front.enabled = true; front.compare = mode; }
    },
    report: () => ({ ...r1.report(), reference: 411, comparison: front?.compare, settled: r1.seals.settled }),
  };
  return {
    key(e) {
      if (e.code === "F2" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (r1.active) { r1.stop(); front?.reset(); } else r1.begin();
        e.preventDefault(); return true;
      }
      if (!r1.active) return false;
      // Native composing/dead/paste input is outside this Latin lab slice; never pass it to old skill hotkeys.
      if (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return true;
      if (e.code === "F3") {
        r1.select(FAMILIES[(FAMILIES.indexOf(r1.family) + 1) % FAMILIES.length]!);
      } else if (e.code === "F4") {
        if (front && e.shiftKey) { front.enabled = true; front.compare = front.compare === "hands" ? "front" : "hands"; }
        else if (front) front.enabled = !front.enabled;
      } else if (e.code === "BracketRight" || e.code === "BracketLeft") {
        r1.inspect(r1.seals.id < 0 ? 0 : r1.seals.id + (e.code === "BracketRight" ? 1 : -1));
        if (front) { front.enabled = true; front.compare = "front"; }
      } else if (e.key === "Tab") {
        target = (target + 1) % targets.length;
        r1.retarget(targets[target]![0], targets[target]![1]);
      } else r1.text(e.key, e.timeStamp);
      e.preventDefault(); return true;
    },
    beforeDraw: () => front?.beforeDraw(),
    afterBody: advanced => r1.afterBody(advanced), afterDraw: () => { r1.afterDraw(); front?.afterDraw(); },
    hit: target => r1.hit(target), reset: () => { r1.stop(); front?.reset(); },
  };
}
