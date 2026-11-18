/** Ticket 395: standalone dev-lab recipe; the host owns holds, damage, numbers, camera and audio. */
import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import { WoodSpriteField, WOOD_TIMING, type WoodFoe } from "./wood-ult-sprites";

export const WOOD_ULT_ID = "ult-wood-primordial-tree";
export type WoodLayerSound = "gather" | "grow" | "crack" | "break" | "tail";
export interface WoodUltHost {
  readonly targets: TargetField;
  caster(out: THREE.Vector3): void;
  hand(out: THREE.Vector3): void;
  release(at: THREE.Vector3, firstS: number): void;
  bind(i: number, seconds: number): void;
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  strike(at: THREE.Vector3, role: ImpactRole): void;
  upload?(texture: THREE.Texture): void;
  sound?(event: WoodLayerSound, at: THREE.Vector3, pitch: number): void;
}
export interface WoodUltReport {
  clock: number;
  bound: number; broken: number; kills: number; cancelled: number;
  releaseAt: number; firstBindAt: number; firstBreakAt: number; lastBreakAt: number;
  clusters: number; clusterHeightM: readonly [number, number]; meshDraws: number; bindDraws: number;
  bindInstancesPerFoe: { vine: number; leaves: number; spores: number; chips: number; dust: number };
  tintedFoes: number; activeTints: number; truncatedBinds: number;
  assetsReady: boolean; soundWired: boolean; soundEvents: Record<WoodLayerSound, number>;
}
interface Foe extends WoodFoe { bound: boolean; broken: boolean; dx: number; dz: number; }
export class WoodUltLayered {
  layered = true;
  readonly field: WoodSpriteField;
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
  last: WoodUltReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: WoodUltHost) {
    this.field = new WoodSpriteField(parent);
  }
  get active(): boolean { return this.t >= 0; }
  get ready(): boolean { return this.field.ready; }
  prepare(): void {
    void this.field.prepare(this.base, this.host.upload).then(() => { if (this.last !== null) this.last.assetsReady = this.ready; });
  }
  cast(): WoodUltReport {
    this.clear(); this.prepare(); this.t = 0;
    this.host.caster(this.origin); this.host.hand(this.hand);
    const targets = this.host.targets;
    for (let i = 0; i < targets.size; i++) {
      if (!targets.alive(i)) continue;
      const dx = targets.x(i) - this.origin.x, dz = targets.z(i) - this.origin.z, d = Math.hypot(dx, dz);
      if (d > WOOD_TIMING.reach) continue;
      this.foes.push({ i, bindAt: WOOD_TIMING.charge + d / WOOD_TIMING.speed, bound: false, broken: false, dx: dx / (d || 1), dz: dz / (d || 1) });
    }
    this.field.plan(this.origin, this.hand, this.foes, targets);
    const binds = this.foes.map(f => f.bindAt);
    const first = binds.length ? Math.min(...binds) : -1, last = binds.length ? Math.max(...binds) : -1;
    this.last = { clock: 0, bound: 0, broken: 0, kills: 0, cancelled: 0, releaseAt: WOOD_TIMING.charge,
      firstBindAt: first, firstBreakAt: first < 0 ? -1 : first + 3, lastBreakAt: last < 0 ? -1 : last + 3,
      clusters: this.field.clusters.length, clusterHeightM: this.field.heightRange,
      meshDraws: this.field.drawCount, bindDraws: this.field.bindDrawCount, bindInstancesPerFoe: this.field.bindInstancesPerFoe,
      tintedFoes: 0, activeTints: 0, truncatedBinds: Math.max(0, this.foes.length - this.field.bindCapacity),
      assetsReady: this.ready, soundWired: this.host.sound !== undefined, soundEvents: { gather: 0, grow: 0, crack: 0, break: 0, tail: 0 } };
    this.sound("gather", this.hand);
    return this.last;
  }
  private sound(event: WoodLayerSound, at: THREE.Vector3): void {
    if (this.last !== null) this.last.soundEvents[event]++;
    this.host.sound?.(event, at, 0.96 + ((this.soundTurn++ * 0.6180339) % 1) * 0.08);
  }
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const r = this.last!, targets = this.host.targets;
    r.clock = this.t;
    if (!this.released && this.t >= WOOD_TIMING.charge) {
      this.released = true; this.host.release(this.origin, Math.max(0, r.firstBreakAt - this.t));
      this.sound("crack", this.origin);
    }
    for (let slot = 0; slot < this.foes.length; slot++) {
      const f = this.foes[slot]!;
      if (f.broken) continue;
      if (!targets.alive(f.i)) { f.broken = true; r.cancelled++; this.field.hide(slot); continue; }
      if (!f.bound && this.t >= f.bindAt) {
        f.bound = true; r.bound++; this.host.bind(f.i, WOOD_TIMING.hold); this.field.bind(slot, f, targets);
      }
      if (f.bound && this.t >= f.bindAt + WOOD_TIMING.hold) {
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
      this.sound("break", this.origin); this.breakAt = this.t + 0.24;
    }
    if (!this.tailed && this.t >= WOOD_TIMING.charge + WOOD_TIMING.reach / WOOD_TIMING.speed + WOOD_TIMING.hold) {
      this.tailed = true; this.sound("tail", this.origin);
    }
    this.host.caster(this.casterNow); this.field.protectCaster(this.casterNow);
    this.field.update(this.t); r.tintedFoes = this.field.tintedFoes; r.activeTints = this.field.activeTints;
    if (this.t > WOOD_TIMING.charge + WOOD_TIMING.reach / WOOD_TIMING.speed + WOOD_TIMING.hold + WOOD_TIMING.fade + 0.1) {
      this.t = -1; this.field.clear(); r.activeTints = 0;
    }
  }
  clear(): void {
    this.t = -1; this.foes.length = 0; this.released = false; this.growAt = 0.6; this.breakAt = 0; this.soundTurn = 0; this.tailed = false;
    this.field.clear();
    if (this.last !== null) this.last.activeTints = 0;
  }
}
