/** R2 impact: one authored core, then a ground ring. The existing strike still owns H0. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipbookPlayer, type FlipOptions } from "../view/skills/flipbook";
import { layFlat } from "../view/skills/element-clips";

export const THUNDER_IMPACT_OFFSET_S = 3 / 60;
export const THUNDER_HIT_RGB = 0xd9ccff;
export const THUNDER_HIT_RIM_S = 0.1;
const deferred = (): boolean => true;

export class ThunderImpactR2 {
  readonly group = new THREE.Group();
  readonly sparkles: boolean;
  private readonly cards: { id: string; pool: FlipbookPool | null }[];
  private readonly blank = new THREE.Texture();
  private readonly target = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly options: FlipOptions = { life: ONE_FRAME, rate: 0, intensity: 0.9, fadeIn: 0, fadeOut: 0,
    cool: 0, erode: 0, occlude: 0, ground: -1e5, lift: 0.03 };
  private age = -1;
  private fresh = false;
  private loading = false;
  private retry = 0;

  constructor(parent: THREE.Object3D, private readonly player: FlipbookPlayer, search: string) {
    const params = new URLSearchParams(search), core = params.get("tp2core");
    this.cards = [
      { id: core === "off" ? "" : core === "impact" ? "thunder-impact" : "thunder-ground-impact", pool: null },
      { id: params.get("tp2ring") === "0" ? "" : "thunder-ring-burst", pool: null },
    ];
    this.sparkles = params.get("tp2sparkles") !== "0";
    this.group.name = "fx-thunder-impact-r2";
    parent.add(this.group);
  }

  prepare(): void {
    if (this.loading || this.retry > 0 || this.cards.every((c) => c.id === "" || c.pool !== null)) return;
    this.loading = true; this.retry = 5;
    const lib = this.player.library("thunder", deferred);
    void lib.load().then(async () => {
      for (const card of this.cards) {
        if (card.id === "" || card.pool !== null || !await lib.fetchAtlas(card.id)) continue;
        const entry = lib.get(card.id);
        if (entry !== null) this.adopt(entry.meta, entry.texture);
      }
    }).catch((error: unknown) => console.warn("[thunder-impact-r2]", error)).finally(() => { this.loading = false; });
  }

  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    const card = this.cards.find((c) => c.id === meta.id);
    if (card === undefined || card.pool !== null) return;
    const pool = new FlipbookPool(meta.id, meta.mode, 1, 15, this.blank);
    pool.attach(meta, texture);
    if (meta.id !== "thunder-impact") layFlat(pool);
    card.pool = pool; this.group.add(pool.mesh);
  }

  strike(target: THREE.Vector3): void {
    this.target.copy(target); this.age = 0; this.fresh = true;
    this.render();
  }

  update(dt: number): void {
    this.retry = Math.max(0, this.retry - dt);
    if (this.age < 0) return;
    // ClipSkillRunner calls update after dispatching the strike: retain the exact H0 presentation for that frame.
    if (this.fresh) this.fresh = false;
    else this.age += Math.max(0, dt);
    if (this.age >= THUNDER_IMPACT_OFFSET_S + 0.35 - 1e-8) { this.clear(); return; }
    this.render();
  }

  private render(): void {
    for (const card of this.cards) card.pool?.clear();
    const core = this.cards[0]!.pool, ring = this.cards[1]!.pool, o = this.options;
    if (core?.meta != null && this.age < 0.28) {
      const p = this.age / 0.28, peak = core.meta.peak ?? core.meta.start;
      o.frame = peak + (core.meta.frames - 1 - peak) * p;
      o.alpha = 1 - p * p * (3 - 2 * p); o.rot = 0; o.span = 0;
      this.at.copy(this.target); this.at.y += this.cards[0]!.id === "thunder-impact" ? 1 : 0.12;
      core.spawn(this.at, this.cards[0]!.id === "thunder-impact" ? 2.4 : 5, o); core.update(0);
    }
    const age = this.age - THUNDER_IMPACT_OFFSET_S;
    if (ring?.meta != null && age >= -1e-8 && age < 0.35) {
      const p = Math.max(0, age) / 0.35, growth = Math.min(1, Math.max(0, age) / 0.15);
      o.frame = ring.meta.start + ((ring.meta.peak ?? ring.meta.frames - 1) - ring.meta.start) * growth;
      o.alpha = 1 - p * p * (3 - 2 * p); o.rot = 0; o.span = 0;
      this.at.copy(this.target); this.at.y += 0.06;
      ring.spawn(this.at, 0.8 + 4.2 * (1 - (1 - growth) ** 2), o); ring.update(0);
    }
  }

  clear(): void {
    this.age = -1; this.fresh = false;
    for (const card of this.cards) card.pool?.clear();
  }
}
