/** Ticket 408: standalone dev-lab recipe; the host owns holds, damage, numbers, camera and audio. */
import * as THREE from "three";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import { VoidSpriteField, VOID_TIMING, type VoidFoe } from "./void-ult-sprites";

export const VOID_ULT_ID = "ult-void";
export type VoidLayerSound = "gather" | "grow" | "crack" | "break" | "tail";
export interface VoidUltHost {
  readonly targets: TargetField;
  caster(out: THREE.Vector3): void;
  hand(out: THREE.Vector3): void;
  release(at: THREE.Vector3, firstS: number): void;
  bind(i: number, seconds: number): void;
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  strike(at: THREE.Vector3, role: ImpactRole): void;
  upload?(texture: THREE.Texture): void;
  sound?(event: VoidLayerSound, at: THREE.Vector3, pitch: number): void;
}
export interface VoidUltReport {
  clock: number;
  bound: number; broken: number; kills: number; cancelled: number;
  releaseAt: number; firstBindAt: number; firstBreakAt: number; lastBreakAt: number;
  clusters: number; clusterHeightM: readonly [number, number]; fieldCenter: readonly [number, number]; fieldRadiusM: number; meshDraws: number; bindDraws: number;
  crystalInstances: number; crystalTriangles: number;
  bindInstancesPerFoe: { ring: number; shards: number; fragments: number; sparks: number };
  tintedFoes: number; activeTints: number; truncatedBinds: number;
  assetsReady: boolean; soundWired: boolean; soundEvents: Record<VoidLayerSound, number>;
}
interface Foe extends VoidFoe { bound: boolean; broken: boolean; hidden: boolean; dx: number; dz: number; }
export class VoidUltLayered {
  layered = true;
  readonly field: VoidSpriteField;
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
  private endAt = 8;
  last: VoidUltReport | null = null;
  constructor(parent: THREE.Object3D, private readonly base: string, private readonly host: VoidUltHost) {
    this.field = new VoidSpriteField(parent);
  }
  get active(): boolean { return this.t >= 0; }
  get ready(): boolean { return this.field.ready; }
  prepare(): void {
    void this.field.prepare(this.base, this.host.upload).then(() => { if (this.last !== null) this.last.assetsReady = this.ready; });
  }
  cast(): VoidUltReport {
    this.clear(); this.prepare(); this.t = 0;
    this.host.caster(this.origin); this.host.hand(this.hand);
    const targets = this.host.targets;
    for (let i = 0; i < targets.size; i++) {
      if (!targets.alive(i)) continue;
      const dx = targets.x(i) - this.origin.x, dz = targets.z(i) - this.origin.z, d = Math.hypot(dx, dz);
      if (d > VOID_TIMING.reach) continue;
      this.foes.push({ i, bindAt: VOID_TIMING.charge + d / VOID_TIMING.speed, bound: false, broken: false, hidden: false, dx: dx / (d || 1), dz: dz / (d || 1) });
    }
    this.field.plan(this.origin, this.hand, this.foes, targets);
    this.endAt = Math.max(VOID_TIMING.charge + VOID_TIMING.reach / VOID_TIMING.speed + VOID_TIMING.hold + VOID_TIMING.fade, ...this.field.clusters.map(c => c.at + 5.7)) + 0.1;
    const binds = this.foes.map(f => f.bindAt);
    const first = binds.length ? Math.min(...binds) : -1, last = binds.length ? Math.max(...binds) : -1;
    this.last = { clock: 0, bound: 0, broken: 0, kills: 0, cancelled: 0, releaseAt: VOID_TIMING.charge,
      firstBindAt: first, firstBreakAt: first < 0 ? -1 : first + 3, lastBreakAt: last < 0 ? -1 : last + 3,
      clusters: this.field.clusters.length, clusterHeightM: this.field.heightRange,
      fieldCenter: [this.field.focus.x, this.field.focus.z], fieldRadiusM: this.field.radius,
      meshDraws: this.field.drawCount, bindDraws: this.field.bindDrawCount, bindInstancesPerFoe: this.field.bindInstancesPerFoe,
      crystalInstances: this.field.crystals3d.meshes[0]?.count ?? 0,
      crystalTriangles: (this.field.crystals3d.meshes[0]?.count ?? 0) * this.field.crystals3d.triangles,
      tintedFoes: 0, activeTints: 0, truncatedBinds: Math.max(0, this.foes.length - this.field.bindCapacity),
      assetsReady: this.ready, soundWired: this.host.sound !== undefined, soundEvents: { gather: 0, grow: 0, crack: 0, break: 0, tail: 0 } };
    this.sound("gather", this.hand);
    return this.last;
  }
  private sound(event: VoidLayerSound, at: THREE.Vector3): void {
    if (this.last !== null) this.last.soundEvents[event]++;
    this.host.sound?.(event, at, 0.96 + ((this.soundTurn++ * 0.6180339) % 1) * 0.08);
  }
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const r = this.last!, targets = this.host.targets;
    r.clock = this.t;
    if (!this.released && this.t >= VOID_TIMING.charge) {
      this.released = true; this.host.release(this.origin, Math.max(0, r.firstBreakAt - this.t));
      this.sound("crack", this.origin);
    }
    for (let slot = 0; slot < this.foes.length; slot++) {
      const f = this.foes[slot]!;
      if (!targets.alive(f.i)) {
        if (!f.broken) r.cancelled++;
        f.broken = true;
        if (!f.hidden) { this.field.hide(slot); f.hidden = true; }
        continue;
      }
      if (f.broken) continue;
      if (!f.bound && this.t >= f.bindAt) {
        f.bound = true; r.bound++; this.host.bind(f.i, VOID_TIMING.hold); this.field.bind(slot, f, targets);
      }
      if (f.bound && this.t >= f.bindAt + VOID_TIMING.hold) {
        f.broken = true; this.field.unbind(slot); r.broken++;
        this.at.set(targets.x(f.i), targets.midY(f.i), targets.z(f.i));
        const role = r.broken === 1 ? "primary" : "secondary";
        if (role === "primary") { this.field.flash(this.t); this.host.strike(this.at, role); }
        if (this.host.blow(f.i, f.dx, f.dz, 1, role)) r.kills++;
      }
    }
    if (this.t >= this.growAt && this.field.clusters.some(c => this.t >= c.at && this.t <= c.at + 0.2)) {
      this.sound("grow", this.origin); this.growAt = Infinity;
    }
    if (this.t >= this.breakAt && (this.foes.some(f => f.bound && this.t >= f.bindAt + 3 && this.t < f.bindAt + 3.25)
      || this.field.clusters.some(c => this.t >= c.at + 3.2 && this.t < c.at + 3.45))) {
      this.sound("break", this.origin); this.breakAt = Infinity; // One shatter body for the whole wave, never one per foe.
    }
    if (!this.tailed && this.t >= VOID_TIMING.charge + VOID_TIMING.reach / VOID_TIMING.speed + VOID_TIMING.hold) {
      this.tailed = true; this.sound("tail", this.origin);
    }
    this.host.caster(this.casterNow); this.field.protectCaster(this.casterNow);
    this.field.update(this.t); r.tintedFoes = this.field.tintedFoes; r.activeTints = this.field.activeTints;
    r.crystalInstances = this.field.crystals3d.meshes[0]?.count ?? 0;
    r.crystalTriangles = r.crystalInstances * this.field.crystals3d.triangles;
    if (this.t > this.endAt) {
      this.t = -1; this.field.clear(); r.activeTints = 0; r.crystalInstances = 0; r.crystalTriangles = 0;
    }
  }
  clear(): void {
    this.t = -1; this.foes.length = 0; this.released = false; this.growAt = 0.6; this.breakAt = 0; this.soundTurn = 0; this.tailed = false;
    this.field.clear();
    if (this.last !== null) { this.last.activeTints = 0; this.last.crystalInstances = 0; this.last.crystalTriangles = 0; }
  }
}
