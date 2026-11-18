/** Ticket 402: standalone dev-lab recipe; the host owns holds, damage, numbers, camera and audio. */
import * as THREE from "three";
import { MetalUltRain, METAL_RAIN, METAL_RAIN_CAMERA, type MetalRainReport } from "./metal-ult-rain";
import { UltCameraPunch, type UltCameraReport } from "./ult-camera-punch";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import { MetalSpriteField, METAL_TIMING, type MetalFoe } from "./metal-ult-sprites";

export const METAL_ULT_ID = "ult-metal-geng";
export type MetalLayerSound = "gather" | "grow" | "crack" | "break" | "tail";
export interface MetalUltHost {
  readonly targets: TargetField;
  caster(out: THREE.Vector3): void;
  hand(out: THREE.Vector3): void;
  release(at: THREE.Vector3, firstS: number): void;
  bind(i: number, seconds: number): void;
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  strike(at: THREE.Vector3, role: ImpactRole): void;
  upload?(texture: THREE.Texture): void;
  sound?(event: MetalLayerSound, at: THREE.Vector3, pitch: number): void;
}
export interface MetalUltReport {
  mode?: "rain" | "ring";
  rain?: MetalRainReport;
  cameraPunch?: UltCameraReport;
  clock: number;
  bound: number; broken: number; kills: number; cancelled: number;
  releaseAt: number; firstBindAt: number; firstBreakAt: number; lastBreakAt: number;
  clusters: number; clusterHeightM: readonly [number, number]; meshDraws: number; bindDraws: number;
  bindInstancesPerFoe: { ring: number; blades: number; fragments: number; sparks: number };
  tintedFoes: number; activeTints: number; truncatedBinds: number;
  assetsReady: boolean; soundWired: boolean; soundEvents: Record<MetalLayerSound, number>;
  swordInstances: number; swordTriangles: number; swordLoadError: string | null;
}
interface Foe extends MetalFoe { bound: boolean; broken: boolean; dx: number; dz: number; }
export class MetalUltLayered {
  layered = true;
  readonly field: MetalSpriteField;
  readonly rain: MetalUltRain | null;
  readonly cameraPunch: UltCameraPunch;
  private t = -1;
  private readonly origin = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly casterNow = new THREE.Vector3();
  private foes: Foe[] = [];
  private released = false;
  private growAt = 0.6;
  private breakAt = 0;
  private soundTurn = 0;
  private tailed = false;
  last: MetalUltReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: MetalUltHost,
    search = typeof location === "undefined" ? "" : location.search) {
    this.field = new MetalSpriteField(parent);
    this.rain = new URLSearchParams(search).get("metalUlt") === "ring" ? null : new MetalUltRain(parent, base, host);
    this.cameraPunch = new UltCameraPunch(parent, search, (camera, width, height) => this.rain?.present(camera, width, height));
  }
  get active(): boolean { return this.rain?.active ?? this.t >= 0; }
  get ready(): boolean { return this.rain?.ready ?? this.field.ready; }
  prepare(): void {
    if (this.rain !== null) { void this.rain.prepare(); return; }
    void this.field.prepare(this.base, this.host.upload).then(() => { if (this.last !== null) this.last.assetsReady = this.ready; });
  }
  cast(): MetalUltReport {
    if (this.rain !== null) {
      this.cameraPunch.clear();
      this.last = this.rain.cast(); this.rain.cameraCentre(this.at);
      // A small lens allowance keeps both the 22 m formation and Lam below the title at the close pose.
      this.cameraPunch.startShot({ centre: this.at, ...METAL_RAIN_CAMERA,
        inS: 0.5, holdUntilS: METAL_RAIN.dissolve, outS: METAL_RAIN.end - METAL_RAIN.dissolve });
      this.last.cameraPunch = this.cameraPunch.report;
      return this.last;
    }
    this.clear(); this.prepare(); this.t = 0;
    this.host.caster(this.origin); this.host.hand(this.hand);
    const targets = this.host.targets;
    for (let i = 0; i < targets.size; i++) {
      if (!targets.alive(i)) continue;
      const dx = targets.x(i) - this.origin.x, dz = targets.z(i) - this.origin.z, d = Math.hypot(dx, dz);
      if (d > METAL_TIMING.reach) continue;
      this.foes.push({ i, bindAt: METAL_TIMING.charge + d / METAL_TIMING.speed, bound: false, broken: false, dx: dx / (d || 1), dz: dz / (d || 1) });
    }
    this.field.plan(this.origin, this.hand, this.foes, targets);
    const binds = this.foes.map(f => f.bindAt);
    const first = binds.length ? Math.min(...binds) : -1, last = binds.length ? Math.max(...binds) : -1;
    this.last = { mode: "ring", clock: 0, bound: 0, broken: 0, kills: 0, cancelled: 0, releaseAt: METAL_TIMING.charge,
      firstBindAt: first, firstBreakAt: first < 0 ? -1 : first + 3, lastBreakAt: last < 0 ? -1 : last + 3,
      clusters: this.field.clusters.length, clusterHeightM: this.field.heightRange,
      meshDraws: this.field.drawCount, bindDraws: this.field.bindDrawCount, bindInstancesPerFoe: this.field.bindInstancesPerFoe,
      tintedFoes: 0, activeTints: 0, truncatedBinds: Math.max(0, this.foes.length - this.field.bindCapacity),
      assetsReady: this.ready, soundWired: this.host.sound !== undefined, soundEvents: { gather: 0, grow: 0, crack: 0, break: 0, tail: 0 },
      swordInstances: this.field.swords3d.instanceCount, swordTriangles: this.field.swords3d.submittedTriangles,
      swordLoadError: this.field.swords3d.loadError };
    this.sound("gather", this.hand);
    return this.last;
  }
  private sound(event: MetalLayerSound, at: THREE.Vector3): void {
    if (this.last !== null) this.last.soundEvents[event]++;
    this.host.sound?.(event, at, 0.96 + ((this.soundTurn++ * 0.6180339) % 1) * 0.08);
  }
  update(dt: number): void {
    if (this.rain !== null) { this.rain.update(dt); this.cameraPunch.update(dt); return; }
    if (this.t < 0) return;
    this.t += dt;
    const r = this.last!, targets = this.host.targets;
    r.clock = this.t;
    if (!this.released && this.t >= METAL_TIMING.charge) {
      this.released = true; this.host.release(this.origin, Math.max(0, r.firstBreakAt - this.t));
      this.sound("crack", this.origin);
    }
    for (let slot = 0; slot < this.foes.length; slot++) {
      const f = this.foes[slot]!;
      if (f.broken) continue;
      if (!targets.alive(f.i)) { f.broken = true; r.cancelled++; this.field.hide(slot); continue; }
      if (!f.bound && this.t >= f.bindAt) {
        f.bound = true; r.bound++; this.host.bind(f.i, METAL_TIMING.hold); this.field.bind(slot, f, targets);
      }
      if (f.bound && this.t >= f.bindAt + METAL_TIMING.hold) {
        f.broken = true; this.field.unbind(slot); r.broken++;
        this.at.set(targets.x(f.i), targets.midY(f.i), targets.z(f.i));
        const role = r.broken === 1 ? "primary" : "secondary";
        if (role === "primary") { this.field.flash(this.t); this.host.strike(this.at, role); }
        if (this.host.blow(f.i, f.dx, f.dz, 1, role)) r.kills++;
      }
    }
    if (this.t >= this.growAt && this.field.clusters.some(c => this.t >= c.at && this.t <= c.at + 0.2)) {
      this.sound("grow", this.origin); this.growAt = this.t + 0.24;
    }
    if (this.t >= this.breakAt && (this.foes.some(f => f.bound && this.t >= f.bindAt + 3 && this.t < f.bindAt + 3.25)
      || this.field.clusters.some(c => this.t >= c.at + 3.2 && this.t < c.at + 3.45))) {
      this.sound("break", this.origin); this.breakAt = Infinity; // One shatter body for the whole wave, never one per foe.
    }
    if (!this.tailed && this.t >= METAL_TIMING.charge + METAL_TIMING.reach / METAL_TIMING.speed + METAL_TIMING.hold) {
      this.tailed = true; this.sound("tail", this.origin);
    }
    this.host.caster(this.casterNow); this.field.protectCaster(this.casterNow);
    this.field.update(this.t); r.tintedFoes = this.field.tintedFoes; r.activeTints = this.field.activeTints;
    r.swordInstances = this.field.swords3d.instanceCount; r.swordTriangles = this.field.swords3d.submittedTriangles;
    r.swordLoadError = this.field.swords3d.loadError;
    if (this.t > METAL_TIMING.charge + METAL_TIMING.reach / METAL_TIMING.speed + METAL_TIMING.hold + METAL_TIMING.fade + 0.1) {
      this.t = -1; this.field.clear(); r.activeTints = 0;
      r.swordInstances = 0; r.swordTriangles = 0;
    }
  }
  clear(): void {
    this.cameraPunch.clear();
    this.rain?.clear();
    this.t = -1; this.foes.length = 0; this.released = false; this.growAt = 0.6; this.breakAt = 0; this.soundTurn = 0; this.tailed = false;
    this.field.clear();
    if (this.last !== null) { this.last.activeTints = 0; this.last.swordInstances = 0; this.last.swordTriangles = 0; }
  }
}
