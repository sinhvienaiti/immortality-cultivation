/** Thunder Pillar's five-phase overlay (VFX_STANDARD §3). Authored art only; the runner owns every hit clock. */
import * as THREE from "three";
import { FlipbookPlayer, ONE_FRAME, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import { ChargeFillFx, type ChargeFillPose } from "./charge-fill-fx";
import { ThunderCasterR2, thunderCasterR2Enabled } from "./thunder-caster-r2";

export const FIVE_CLIP_ID = "pillar-thunder-single";
export const FIVE_CLIP_CHARGE_S = 0.2;
export const FIVE_CLIP_TAIL_S = 2.2;
export function fivePhaseClipEnabled(search: string): boolean { return new URLSearchParams(search).get("fivephase") !== "0"; }

const IDS = ["thunder-charge", "thunder-release", "thunder-ribbon-loop", "thunder-impact", "thunder-ground-impact", "thunder-sparkle", "thunder-hit-affliction"] as const;
type Id = typeof IDS[number];
interface Card { readonly id: Id; pool: FlipbookPool | null }
interface Affliction { target: number; left: number; life: number }
export interface FivePhaseClipHost {
  readonly targets: TargetField;
  hand(out: THREE.Vector3): void;
  pose(out: ChargeFillPose): void;
  glow(rgb: number, intensity: number): void;
  release(at: THREE.Vector3): void;
  upload?(texture: THREE.Texture): void;
}

/** A separate charge-fill voice cannot cancel the word currently being typed in the lab. */
export class FivePhaseClip {
  readonly enabled: boolean;
  readonly player: FlipbookPlayer;
  readonly fill: ChargeFillFx;
  readonly casterR2: ThunderCasterR2 | null;
  private readonly cards: Card[] = IDS.map((id) => ({ id, pool: null }));
  private readonly afflictions: Affliction[] = Array.from({ length: 64 }, () => ({ target: -1, left: 0, life: 0 }));
  private readonly afflictionAges = new Float32Array(64);
  private readonly word = { slot: "k2", typed: 0, letters: 1 };
  private readonly casterPose: ChargeFillPose = { x: 0, y: 0, z: 0, height: 2, bodyWidth: 0.7 };
  private readonly at = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly options: FlipOptions = {};
  private charging = -1;
  private loading = false;
  private retry = 0;

  constructor(parent: THREE.Object3D, base: string, private readonly host: FivePhaseClipHost, search = "") {
    this.enabled = fivePhaseClipEnabled(search);
    this.player = new FlipbookPlayer(base);
    this.player.group.name = "fx-five-phase-thunder-pillar";
    this.player.group.visible = this.enabled;
    parent.add(this.player.group);
    this.fill = new ChargeFillFx(parent, base, this.enabled ? search : "?chargefill=0");
    this.fill.player.group.name = "fx-five-phase-thunder-charge-fill";
    this.casterR2 = this.enabled && thunderCasterR2Enabled(search) ? new ThunderCasterR2(parent, this.player, host) : null;
  }

  prepare(): void {
    if (!this.enabled) return;
    this.casterR2?.prepare();
    this.fill.prepareElement("thunder");
    if (this.loading || this.retry > 0) return;
    let ready = true;
    for (const card of this.cards) if (card.pool === null) ready = false;
    if (ready) return;
    this.loading = true;
    this.retry = 5;
    const lib = this.player.library("thunder", () => true);
    void lib.load().then(async () => {
      for (const card of this.cards) {
        if (card.pool !== null || !await lib.fetchAtlas(card.id)) continue;
        const entry = lib.get(card.id);
        if (entry !== null) this.adopt(entry.meta, entry.texture);
      }
    }).catch((error: unknown) => console.warn("[five-phase-clip] thunder", error)).finally(() => { this.loading = false; });
  }

  /** Uses the same library/pools as production; also allows renderer-free tests. */
  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    if (!this.enabled) return;
    const card = this.cards.find((c) => c.id === meta.id);
    if (card === undefined) return;
    this.player.library("thunder", () => true).add(meta, texture);
    this.host.upload?.(texture);
    card.pool = this.player.pool("thunder", meta.id, { mode: meta.mode, capacity: meta.id === "thunder-sparkle" ? 128 : 64, renderOrder: 13 });
    this.casterR2?.adopt(meta, texture);
  }

  private pool(id: Id): FlipbookPool | null {
    for (const card of this.cards) if (card.id === id) return card.pool;
    return null;
  }

  private opts(): FlipOptions {
    const o = this.options;
    o.frame = 0; o.rate = 1; o.life = 0; o.delay = 0; o.alpha = 1; o.intensity = 0.9;
    o.fadeIn = 0; o.fadeOut = 0; o.cool = 0.55; o.erode = 0; o.occlude = 0;
    o.dir = null; o.span = 0; o.vx = 0; o.vy = 0; o.vz = 0; o.rot = 0; o.lift = 0.15;
    return o;
  }

  private burst(id: Id, size: number, life: number): void {
    const pool = this.pool(id), meta = pool?.meta;
    if (pool === null || meta == null) return;
    const o = this.opts();
    // The flash starts at its measured peak, at age zero; only its tail plays afterwards.
    o.frame = meta.peak ?? meta.start; o.life = life;
    o.rate = Math.max(0, meta.frames - 1 - o.frame) / (meta.fps * life);
    pool.spawn(this.at, size, o);
  }

  private chargeFrame(p: number): void {
    const charge = this.pool("thunder-charge");
    charge?.clear();
    if (charge?.meta == null || p >= 1) return;
    const o = this.opts();
    o.life = ONE_FRAME; o.rate = 0; o.frame = charge.meta.start + (charge.meta.frames - 1 - charge.meta.start) * p;
    o.erode = Math.max(0, (p - 0.7) / 0.3);
    this.host.hand(this.at); charge.spawn(this.at, 1.6, o);
  }

  /** A and R overlap: pressing 8 starts a 200 ms charge, and releases on that very call. */
  cast(target: THREE.Vector3): void {
    if (!this.enabled) return;
    this.prepare();
    this.charging = 0;
    this.fill.sync(null, "thunder");
    this.word.typed = 0;
    this.fill.sync(this.word, "thunder");
    this.host.pose(this.casterPose);
    this.fill.update(0, this.casterPose);
    this.chargeFrame(0);
    this.host.hand(this.at);
    const x = this.at.x, y = this.at.y, z = this.at.z;
    this.burst("thunder-release", 2.2, 0.38);
    const ribbon = this.pool("thunder-ribbon-loop");
    if (ribbon?.meta != null) {
      const o = this.opts();
      o.life = 0.24; o.dir = this.up; o.span = 7; o.vy = 25; o.cool = 0.35;
      ribbon.spawn(this.at, 0.65, o);
    }
    const sparkle = this.pool("thunder-sparkle");
    if (sparkle?.meta != null) {
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2;
        const dx = Math.cos(angle) * 0.65, dz = Math.sin(angle) * 0.65;
        const o = this.opts();
        o.frame = i * 11; o.life = FIVE_CLIP_CHARGE_S; o.vx = -dx / o.life; o.vz = -dz / o.life;
        sparkle.spawn(this.at.set(x + dx, y, z + dz), 0.4, o);
      }
      const o = this.opts();
      o.life = 0.24;
      sparkle.spawn(this.at.set(target.x, 0.25, target.z), 3.8, o);
    }
    this.host.hand(this.at);
    this.host.glow(0xd9ccff, 0.9);
    this.casterR2?.cast();
    this.host.release(this.at);
  }

  /** I and D start on the existing clip's strike, including when its video clock stalls. */
  strike(target: THREE.Vector3): void {
    if (!this.enabled) return;
    this.at.set(target.x, 0.12, target.z);
    this.burst("thunder-ground-impact", 5, 0.85);
    const sparkle = this.pool("thunder-sparkle");
    if (sparkle?.meta == null) return;
    // Phase offsets and decreasing sizes/lifetimes thin out the authored sparkle, with erosion rather than a fast fade.
    for (let i = 0; i < 5; i += 1) {
      const o = this.opts();
      o.frame = i * 9; o.delay = i * 0.12; o.life = FIVE_CLIP_TAIL_S - i * 0.25 - o.delay; o.cool = 0.35;
      this.at.set(target.x + Math.cos(i * 2.4) * 1.1, 0.3, target.z + Math.sin(i * 2.4) * 1.1);
      sparkle.spawn(this.at, 1.1 - i * 0.13, o);
    }
  }

  hit(i: number, killed: boolean, statusS: number): void {
    if (!this.enabled) return;
    const t = this.host.targets;
    this.at.set(t.x(i), t.midY(i), t.z(i));
    this.burst("thunder-impact", Math.max(1.6, t.radius(i) * 3), 0.65);
    if (killed || statusS <= 0) return;
    let voice: Affliction | undefined;
    for (const a of this.afflictions) if (a.target === i) { voice = a; break; }
    if (voice === undefined) for (const a of this.afflictions) if (a.target < 0) { voice = a; break; }
    if (voice !== undefined) { voice.target = i; voice.left = voice.life = statusS; }
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.retry = Math.max(0, this.retry - dt);
    this.casterR2?.update(dt);
    const affliction = this.pool("thunder-hit-affliction");
    affliction?.clear();
    this.host.pose(this.casterPose);
    if (this.charging >= 0) {
      this.charging = Math.min(FIVE_CLIP_CHARGE_S, this.charging + dt);
      const p = this.charging / FIVE_CLIP_CHARGE_S;
      this.word.typed = p;
      this.fill.sync(this.word, "thunder");
      this.chargeFrame(p);
      this.host.glow(0xd9ccff, 0.9 * (1 - p * p));
      if (p >= 1) { this.charging = -1; this.fill.clear(); }
    }
    this.fill.update(dt, this.casterPose);
    let drawn = 0;
    for (const a of this.afflictions) {
      if (a.target < 0) continue;
      if (!this.host.targets.alive(a.target) || (a.left -= dt) <= 1e-6) { a.target = -1; continue; }
      if (affliction?.meta == null) continue;
      const t = this.host.targets, age = a.life - a.left;
      const o = this.opts();
      o.life = ONE_FRAME; o.rate = 0; o.frame = age * affliction.meta.fps % affliction.meta.frames;
      o.cool = 0.65;
      o.erode = Math.max(0, (age / a.life - 0.65) / 0.35);
      this.at.set(t.x(a.target), t.midY(a.target), t.z(a.target));
      affliction.spawn(this.at, Math.max(1.2, t.radius(a.target) * 3 / affliction.meta.aspect), o);
      this.afflictionAges[drawn++] = age / a.life;
    }
    this.player.update(dt);
    // Following cards are reissued at age zero. Supply their real normalized age to the kit's fire-mode erosion too
    // (that legacy shader reads iAge.x/cool; unlike RGBA it does not read the independent erode option).
    if (affliction !== null && drawn > 0) {
      const age = affliction.mesh.geometry.getAttribute("iAge");
      for (let i = 0; i < drawn; i += 1) age.setX(i, this.afflictionAges[i]!);
      age.needsUpdate = true;
    }
    const charge = this.pool("thunder-charge");
    if (charge !== null && charge.live > 0) {
      const age = charge.mesh.geometry.getAttribute("iAge");
      age.setXY(0, this.charging / FIVE_CLIP_CHARGE_S, 0.7);
      age.needsUpdate = true;
    }
  }

  clear(): void {
    if (this.charging >= 0) this.host.glow(0xd9ccff, 0);
    this.charging = -1;
    for (const a of this.afflictions) a.target = -1;
    this.fill.clear(); this.player.clear();
    this.casterR2?.clear();
  }
}
