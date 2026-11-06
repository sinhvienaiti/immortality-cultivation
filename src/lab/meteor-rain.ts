/**
 * The slanted meteor rain (canon D62; docs/work/tasks/slanted-meteor.md; REF_VIDEO_LESSONS_2026-11-05 lessons 1–3):
 * key M in the lab, in the element E has on (every element). Up to METEORS marked beasts, the densest groups first,
 * swept from one side: each is marked on the ground MARK_S before its blow, then a meteor falls on it SLANT_DEG off the
 * vertical in FALL_S, GAP_S after the one before (the whole rain ≤ 2.5 s), and the ground burns after it.
 * Built from the element's own clips, no new art: the meteor is the element's crescent held small at its head (every
 * element has one), convex side leading, and a short soft trail of its crescent's energy band behind it (TAIL_M); the
 * blow is the kit's own impact and aftermath (its ground blow, burnt mark and embers), or, for a kit without them
 * (Metal), the folder's impact clip and its ground mark lingering. Each blow goes through the lab's hit path (the host).
 */
import * as THREE from "three";
import { aimClipSkill, type ClipSkill } from "./clip-skills";
import { CrescentTrail } from "../view/skills/crescent-trail";
import { crescentMatter, heldCrescent } from "../view/skills/element-clips";
import type { ElementKit, ElementHooks } from "../view/skills/element-kit";
import type { ElementStage } from "../view/skills/element-stage";
import { ONE_FRAME, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import type { WeaponGlow } from "../view/skills/weapons";

/** Meteors at most, their gap (s), the fall (s), the slant off the vertical (degrees), the height they fall from (m). */
export const METEORS = 8;
export const GAP_S = 0.27;
export const FALL_S = 0.18;
const SLANT_DEG = 20;
const HEIGHT_M = 14;
/** A mark leads its blow (s); the first blow comes this long after the key. */
export const MARK_S = 0.2;
/** The tail (m), its width and the head's size (m); the ground burns this long (s) where the kit has no aftermath. */
const TAIL_M = 2;
const TAIL_W = 1.8;
const HEAD_M = 2.4;
const BURN_S = 2;
/** Each meteor strikes the marked beast and anything within this (m). */
const SPLASH_M = 0.9;

/** The aim: one beast a point (the densest groups first), as key 9's multi shape picks them. */
const AIM: ClipSkill = { id: "meteor", element: "fire", shape: "multi", radius: SPLASH_M, count: METEORS, strikes: [{ frame: "peak", power: 1 }], damage: "heavy", mark: true, linger: BURN_S };

export interface MeteorHost {
  readonly targets: TargetField;
  readonly stage: ElementStage;
  readonly camera: THREE.Camera;
  readonly layer: THREE.Object3D;
  /** The element on (E) and its palette. */
  kit(): ElementKit;
  pal(): WeaponGlow;
  caster(out: THREE.Vector3): void;
  /** Loads the folder's ground mark; a mark there (false: not loaded yet). */
  prepareMark(folder: string): void;
  mark(folder: string, x: number, z: number, size: number, delay: number, life: number): boolean;
  /** The cast (the release event). */
  release(at: THREE.Vector3): void;
  /** One blow on beast `i` (the lab's hit path); true: it killed. */
  blow(i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** A meteor landing at `at`: the screen's tier (its stop and shake), the kick, the light. */
  strike(at: THREE.Vector3, role: ImpactRole): void;
  /** The element's status on a struck beast. */
  status(i: number): void;
}

/** What the last rain did (__lab.meteor). */
export interface MeteorReport {
  element: string;
  meteors: number;
  marks: number;
  /** Seconds after the key: each meteor's landing, its mark's start. */
  impactAt: number[];
  markAt: number[];
  blows: number;
  kills: number;
  /** Landings drawn by the kit's own impact (else the folder's impact clip). */
  kitImpacts: number;
}

interface Meteor {
  readonly target: THREE.Vector3;
  readonly start: THREE.Vector3;
  /** When it starts falling and lands (s after the key). */
  readonly fallAt: number;
  readonly landAt: number;
  readonly hits: readonly { i: number; dx: number; dz: number }[];
  readonly role: ImpactRole;
  readonly trail: CrescentTrail | null;
  landed: boolean;
}

const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

export class MeteorRain {
  private t = 0;
  private meteors: Meteor[] = [];
  private prepared = "";
  /** Its trails, a few for the meteors in the air at once (made per element: their matter is its crescent's band). */
  private trails: CrescentTrail[] = [];
  private trailsOf = "";
  last: MeteorReport | null = null;

  constructor(private readonly host: MeteorHost) {}

  private folder(): string {
    return this.host.kit().id;
  }

  /** The element's crescent (its video, else its still or swing) as loaded in its folder, and its pool. */
  private crescent(): { pool: FlipbookPool; meta: NonNullable<FlipbookPool["meta"]>; texture: THREE.Texture } | null {
    const folder = this.folder();
    const player = this.host.stage.flipbooks;
    const ids = player.loaded(folder);
    const lib = player.library(folder);
    const id = ids.find((x) => x === folder + "-crescent-sym") ?? ids.find((x) => lib.get(x)?.meta.role === "slash" && lib.get(x)?.meta.layer !== "body");
    if (id === undefined) return null;
    const e = lib.get(id)!;
    const pool = player.pool(folder, id);
    return pool.ready ? { pool, meta: e.meta, texture: e.texture } : null;
  }

  /** Trails in the element's crescent band (remade when the element changes). */
  private trailsFor(): CrescentTrail[] {
    const folder = this.folder();
    if (this.trailsOf === folder && this.trails.length > 0) return this.trails;
    const cr = this.crescent();
    if (cr === null) return [];
    for (const tr of this.trails) tr.mesh.removeFromParent();
    const matter = crescentMatter(cr.meta, cr.texture, this.host.kit().ramp);
    this.trails = [0, 1, 2].map(() => new CrescentTrail(matter, 14, TAIL_M));
    for (const tr of this.trails) this.host.layer.add(tr.mesh);
    this.trailsOf = folder;
    return this.trails;
  }

  /** Casts the rain on the herd: marks, meteors, blows; what it aimed at (0: no beast). */
  cast(): number {
    const folder = this.folder();
    this.host.prepareMark(folder);
    this.host.caster(c);
    const aim = aimClipSkill(AIM, this.host.targets, { x: c.x, z: c.z }, { x: c.x, z: c.z - 9 }, "field");
    // Swept from one side (the side the meteors come from) to the other.
    const order = aim.points.map((p, k) => ({ p, k })).sort((x, y) => x.p.x - y.p.x || x.p.z - y.p.z);
    const report: MeteorReport = { element: folder, meteors: 0, marks: 0, impactAt: [], markAt: [], blows: 0, kills: 0, kitImpacts: 0 };
    const trails = this.trailsFor();
    const slant = (SLANT_DEG * Math.PI) / 180;
    order.forEach(({ p, k }, n) => {
      const landAt = MARK_S + n * GAP_S;
      const target = new THREE.Vector3(p.x, 0.35, p.z);
      // From high up and to the left (screen left on the play camera), SLANT_DEG off the vertical.
      const start = new THREE.Vector3(p.x - Math.tan(slant) * HEIGHT_M, HEIGHT_M, p.z);
      const hits = aim.hits.filter((h) => h.point === k).map((h) => ({ i: h.i, dx: h.dx, dz: h.dz }));
      this.meteors.push({ target, start, fallAt: landAt - FALL_S, landAt, hits, role: n === 0 ? "primary" : "secondary", trail: trails[n % Math.max(1, trails.length)] ?? null, landed: false });
      // Marked on the ground before its blow; where the kit has no aftermath, the mark stays as the burnt ground.
      const burn = this.hooks().sword?.aftermath !== undefined ? 0.3 : BURN_S;
      if (this.host.mark(folder, p.x, p.z, 3, landAt - MARK_S, MARK_S + burn)) report.marks += 1;
      report.markAt.push(landAt - MARK_S);
      report.impactAt.push(landAt);
      report.meteors += 1;
    });
    this.t = 0;
    this.last = report;
    this.host.release(order[0] !== undefined ? v.set(order[0].p.x, 0, order[0].p.z) : c);
    return report.meteors;
  }

  private hooks(): ElementHooks {
    return this.host.stage.hooksOf(this.host.kit());
  }

  /** World time: the meteors fall (their heads and tails), land (the blow, the kit's impact and aftermath). */
  update(dt: number): void {
    const folder = this.folder();
    if (folder !== this.prepared) {
      // The element changed (E): its ground mark loads now, before the next rain.
      this.host.prepareMark(folder);
      this.prepared = folder;
    }
    this.t += dt;
    const cr = this.meteors.length > 0 ? this.crescent() : null;
    for (const m of this.meteors) {
      if (m.landed || this.t < m.fallAt) continue;
      const u = Math.min(1, (this.t - m.fallAt) / FALL_S);
      v.lerpVectors(m.start, m.target, u);
      if (u < 1) {
        m.trail?.head(v.x, v.y, v.z, TAIL_W);
        if (cr !== null) this.head(cr.pool, v, m);
        continue;
      }
      m.landed = true;
      this.land(m);
    }
    for (const tr of this.trails) tr.update(dt, this.host.camera);
    if (this.meteors.length > 0 && this.meteors.every((m) => m.landed)) this.meteors = [];
  }

  /** The meteor's head this frame: its element's crescent held whole, convex side along the fall on screen. */
  private head(pool: FlipbookPool, at: THREE.Vector3, m: Meteor): void {
    a.copy(m.start).project(this.host.camera);
    b.copy(m.target).project(this.host.camera);
    const aspect = (this.host.camera as THREE.PerspectiveCamera).aspect ?? 16 / 9;
    const fall = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    const held = heldCrescent(pool, 1);
    const o: FlipOptions = { life: ONE_FRAME, rate: 0, frame: pool.meta!.start, rot: fall + Math.PI / 2 + held.turn, alpha: held.alpha, lift: 0.6, ground: 0 };
    pool.spawn(at, HEAD_M, o);
  }

  /** A meteor lands: its blows and its element's impact and burnt ground. */
  private land(m: Meteor): void {
    const r = this.last;
    this.host.strike(m.target, m.role);
    for (const h of m.hits) {
      if (!this.host.targets.alive(h.i)) continue;
      const killed = this.host.blow(h.i, h.dx, h.dz, 1, m.role);
      if (r !== null) {
        r.blows += 1;
        if (killed) r.kills += 1;
      }
      if (!killed) this.host.status(h.i);
    }
    const hooks = this.hooks().sword;
    const pal = this.host.pal();
    const dx = 0.34;
    const dz = 0;
    const drawn = hooks?.impact?.({ slot: "k1", at: m.target, scale: 1.3, dx, dz, power: 1, big: true, pal }) === true;
    if (drawn && r !== null) r.kitImpacts += 1;
    else this.fallbackImpact(m.target);
    hooks?.aftermath?.({ slot: "k1", x: m.target.x, z: m.target.z, r: 1.2, life: BURN_S, rate: 6, pal });
  }

  /** Without the kit's impact: the folder's impact (or burst) clip, fast to its peak, then slow. */
  private fallbackImpact(at: THREE.Vector3): void {
    const folder = this.folder();
    const player = this.host.stage.flipbooks;
    const lib = player.library(folder);
    const id = player.loaded(folder).find((x) => {
      const meta = lib.get(x)?.meta;
      return meta !== undefined && meta.layer !== "body" && (meta.role === "impact" || meta.role === "burst" || meta.role === "groundImpact");
    });
    if (id === undefined) return;
    const pool = player.pool(folder, id);
    const meta = pool.meta;
    if (meta === null) return;
    const peak = Math.max(meta.start + 1, meta.peak ?? meta.start + 2);
    const o: FlipOptions = { frame: meta.start, rate: (peak - meta.start) / (meta.fps * 0.06), slowFrom: peak, slowRate: (meta.frames - peak) / (meta.fps * 0.9), lift: 0.5, ground: 0 };
    pool.spawn(v.copy(at).setY(0.6), 2.4, o);
  }

  get active(): boolean {
    return this.meteors.length > 0;
  }

  reset(): void {
    this.meteors = [];
    for (const tr of this.trails) tr.clear();
  }
}
