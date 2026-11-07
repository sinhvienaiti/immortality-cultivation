/** Round 2 caster layers only. B8 still owns the immediate release and all hit clocks. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipbookPlayer, type FlipOptions } from "../view/skills/flipbook";
import { layFlat } from "../view/skills/element-clips";
import type { ChargeFillPose } from "./charge-fill-fx";

const IDS = ["thunder-caster-seal", "thunder-sparkle", "thunder-ring-burst"] as const;
const deferred = (): boolean => true;
export const THUNDER_CASTER_CHARGE_S = 0.2;
export const THUNDER_CASTER_END_S = 0.5;
export function thunderCasterR2Enabled(search: string): boolean { return new URLSearchParams(search).get("tp2") === "1"; }

export class ThunderCasterR2 {
  readonly group = new THREE.Group();
  private readonly cards = IDS.map((id) => ({ id, pool: null as FlipbookPool | null }));
  private readonly blank = new THREE.Texture();
  private readonly at = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly pose: ChargeFillPose = { x: 0, y: 0, z: 0, height: 2, bodyWidth: 0.7 };
  private readonly o: FlipOptions = { life: ONE_FRAME, rate: 0, alpha: 1, intensity: 0.9, fadeIn: 0, fadeOut: 0, cool: 0, occlude: 0, ground: -1e5, lift: 0.03 };
  private age = -1;
  private loading = false;
  private retry = 0;

  constructor(parent: THREE.Object3D, private readonly player: FlipbookPlayer, private readonly host: {
    hand(out: THREE.Vector3): void; pose(out: ChargeFillPose): void; upload?(texture: THREE.Texture): void;
  }) {
    this.group.name = "fx-thunder-caster-r2";
    parent.add(this.group);
  }

  prepare(): void {
    if (this.loading || this.retry > 0 || this.cards.every((c) => c.pool !== null)) return;
    this.loading = true; this.retry = 5;
    // Share B8's library and textures, including sparkle; no second atlas copy or video.
    const lib = this.player.library("thunder", deferred);
    void lib.load().then(async () => {
      for (const card of this.cards) {
        if (card.pool !== null || !await lib.fetchAtlas(card.id)) continue;
        const entry = lib.get(card.id);
        if (entry !== null) this.adopt(entry.meta, entry.texture);
      }
    }).catch((error: unknown) => console.warn("[thunder-caster-r2]", error)).finally(() => { this.loading = false; });
  }

  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    const card = this.cards.find((c) => c.id === meta.id);
    if (card === undefined || card.pool !== null) return;
    const pool = new FlipbookPool(meta.id, meta.mode, meta.id === "thunder-sparkle" ? 24 : 1, 12, this.blank);
    pool.attach(meta, texture);
    if (meta.id !== "thunder-sparkle") layFlat(pool);
    card.pool = pool;
    this.group.add(pool.mesh);
    this.host.upload?.(texture);
  }

  cast(): void {
    this.age = 0;
    this.render();
    // The existing B8 host.release flashes its pooled light and plays the release on this same call.
  }

  update(dt: number): void {
    this.retry = Math.max(0, this.retry - dt);
    if (this.age < 0) return;
    this.age += Math.max(0, dt);
    if (this.age >= THUNDER_CASTER_END_S - 1e-8) { this.clear(); return; }
    this.render();
  }

  private render(): void {
    this.host.pose(this.pose); this.host.hand(this.hand);
    const age = this.age, p = Math.min(1, age / THUNDER_CASTER_CHARGE_S);
    const seal = this.cards[0]!.pool, sparkle = this.cards[1]!.pool, ring = this.cards[2]!.pool;
    const o = this.o;
    for (const card of this.cards) card.pool?.clear();
    if (seal?.meta != null) {
      o.frame = seal.meta.start + age * seal.meta.fps; o.alpha = p * p * (3 - 2 * p); o.rot = age * 0.35;
      o.span = 3.2; o.erode = 0;
      this.at.set(this.pose.x, this.pose.y + 0.04, this.pose.z);
      seal.spawn(this.at, 3.2, o); seal.update(0);
      // Reissued fire-mode cards need their real erosion age (the existing shader reads iAge.xy).
      const erosion = Math.max(0, (age - THUNDER_CASTER_CHARGE_S) / 0.3);
      const a = seal.mesh.geometry.getAttribute("iAge");
      a.setXY(0, erosion, 1e-6); a.needsUpdate = true;
    }
    if (sparkle?.meta != null && p < 1) {
      const count = Math.ceil(24 * p);
      o.span = 0; o.rot = 0; o.erode = 0;
      for (let i = 0; i < count; i += 1) {
        const start = i / 24, t = Math.min(1, Math.max(0, (p - start) / (1 - start)));
        const radius = (0.55 + (i % 3) * 0.12) * (1 - t) ** 2, angle = i * 2.39996 + t * 0.5;
        o.alpha = Math.sin(Math.PI * t); o.frame = (i * 7 + age * sparkle.meta.fps) % sparkle.meta.frames;
        this.at.set(this.hand.x + Math.cos(angle) * radius, this.hand.y + Math.sin(angle * 1.7) * radius, this.hand.z + Math.sin(angle) * radius);
        sparkle.spawn(this.at, 0.16 + (i % 3) * 0.025, o);
      }
      sparkle.update(0);
    }
    if (ring?.meta != null && age < 0.4 - 1e-8) {
      const growth = Math.min(1, age / 0.15), tail = Math.max(0, (age - 0.15) / 0.25);
      o.frame = ring.meta.start + ((ring.meta.peak ?? ring.meta.frames - 1) - ring.meta.start) * growth;
      o.alpha = 1 - tail * tail * (3 - 2 * tail); o.rot = 0; o.span = 0; o.erode = 0;
      this.at.set(this.pose.x, this.pose.y + 0.06, this.pose.z);
      ring.spawn(this.at, 0.8 + 3.2 * (1 - (1 - growth) ** 2), o); ring.update(0);
    }
  }

  clear(): void {
    this.age = -1;
    for (const card of this.cards) card.pool?.clear();
  }
}
