/** R2 impact: one authored core, then a ground ring. The existing strike still owns H0. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipbookPlayer, type FlipOptions } from "../view/skills/flipbook";
import { layFlat } from "../view/skills/element-clips";

export const THUNDER_IMPACT_OFFSET_S = 3 / 60;
export const THUNDER_HIT_RGB = 0xd9ccff;
export const THUNDER_HIT_RIM_S = 0.1;
export const THUNDER_BODY_RETURN_S = 0.45;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** View-only, foot-pivot reaction. Fixed storage and scratch transforms; no new draw or shader. */
export class ThunderBodyReaction {
  private readonly age: Float64Array;
  private readonly dx: Float32Array;
  private readonly dz: Float32Array;
  private readonly axis = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  constructor(size: number) {
    this.age = new Float64Array(size).fill(-1);
    this.dx = new Float32Array(size); this.dz = new Float32Array(size);
  }

  strike(i: number, dx: number, dz: number): void {
    const len = Math.hypot(dx, dz);
    this.dx[i] = len > 1e-6 ? dx / len : 0;
    this.dz[i] = len > 1e-6 ? dz / len : -1;
    this.age[i] = 0;
  }

  clear(i: number): void { this.age[i] = -1; }

  apply(i: number, dt: number, height: number, p: THREE.Vector3, q: THREE.Quaternion, scale: THREE.Vector3): void {
    if (this.age[i]! < 0) return;
    const age = this.age[i]! + Math.max(0, dt);
    this.age[i] = age;
    if (age >= THUNDER_BODY_RETURN_S - 1e-8) { this.clear(i); return; }
    // H0 already tips 12°; peak 20° at 50 ms, still about 11° at 230 ms, home by 450 ms, even while stunned.
    // R3-1 retry (blind verdict 07/11): 10–14° over 300 ms did not read at the play camera.
    const rise = smooth(Math.min(1, age / 0.05));
    const home = smooth(Math.max(0, (age - 0.05) / (THUNDER_BODY_RETURN_S - 0.05)));
    this.axis.set(this.dz[i]!, 0, -this.dx[i]!).normalize();
    this.turn.setFromAxisAngle(this.axis, (12 + 8 * rise) * Math.PI / 180 * (1 - home));
    q.premultiply(this.turn);
    // Compress about the feet, then rebound by 80 ms. Height scales the hop for every species.
    const rebound = smooth(Math.min(1, Math.max(0, (age - 0.025) / 0.055)));
    const settle = smooth(Math.min(1, Math.max(0, (age - 0.08) / (THUNDER_BODY_RETURN_S - 0.08))));
    const squash = age < 0.025 ? 0.06 + 0.1 * smooth(age / 0.025)
      : age < 0.08 ? 0.16 - 0.22 * rebound : -0.06 * (1 - settle);
    const sy = 1 - squash;
    scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    p.y += height * 0.1 * rebound * (1 - settle);
  }
}

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
