/**
 * The slanted meteor rain (canon D62; docs/work/tasks/slanted-meteor.md; REF_VIDEO_LESSONS_2026-11-05 lessons 1–3):
 * key M in the lab, in the element E has on (every element). Up to METEORS marked beasts, the densest groups first,
 * swept from one side: each is marked on the ground MARK_S before its blow, then a meteor falls on it SLANT_DEG off the
 * vertical in FALL_S, GAP_S after the one before (the whole rain ≤ 2.5 s), and the ground burns after it.
 * A blow from the sky is never the sword's crescent (owner 06/11 09:30: "những kỹ năng nào phóng ra từ kiếm thì dùng dạng
 * vết chém lưỡi liềm, chứ những skill rơi từ trên trời xuống, thì phải làm dạng khác cho phù hợp"; canon D62). Until its
 * own meteor video lands, it is built from the element's own clips: its head a round bright core (the peak frame of its
 * burst, charge, sparkle or ground mark, whichever has a bright centre, cut to a disc round that centre), its tail its
 * ribbon (else a band of the head's clip) along the fall, thinning, sparkles shed behind it (its sparkle clip, else small
 * cores). The blow is the kit's own impact (an element without an impact clip: its head's core flaring at the target)
 * and, AFTER_S later, its aftermath; a kit without hooks (Metal) takes the folder's impact clip and its ground mark
 * lingering. Each blow goes through the lab's hit path (the host).
 */
import * as THREE from "three";
import { aimClipSkill, type ClipSkill } from "./clip-skills";
import { CrescentTrail, type TrailMatter } from "../view/skills/crescent-trail";
import { crescentMatter } from "../view/skills/element-clips";
import type { ElementKit, ElementHooks } from "../view/skills/element-kit";
import type { ElementStage } from "../view/skills/element-stage";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";
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
/** The tail (m), its width and the head's disc across (m); the ground burns this long (s) where the kit has no aftermath. */
const TAIL_M = 2;
const TAIL_W = 1.3;
const HEAD_M = 1.6;
/** The head's disc: its radius as a share of its clip's cell height, round the clip's light centre (its pivot). */
const CORE_R = 0.24;
/** A clip's centre counts as a bright core above this mean light (0–1) in that disc. */
const CORE_LIGHT = 0.2;
/** Head clips by preference (their roles), sparkles shed a second from the tail. */
const HEAD_ROLES = ["burst", "charge", "sparkle", "groundMark", "impact", "groundImpact"] as const;
const SPARKS_PER_S = 40;
const BURN_S = 2;
/** Each meteor strikes the marked beast and anything within this (m). */
const SPLASH_M = 0.9;
/** The burnt ground comes this long after the landing (s), past its blow's peak: no more than 2–3 lights on one spot. */
const AFTER_S = 0.2;
/**
 * The landing's light starts this long before its blow (s; a kit's own impactLead where it gives one: Thunder's and
 * Star's column comes a beat after their glint): the impact reaches its peak on the landing frame (fast attack: the first
 * impact frame ≥ 95 % of its peak). A landing that is the head's core flaring starts at its peak: no lead.
 */
const IMPACT_LEAD_S = 0.05;

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
  /** Landings drawn by the kit's own impact or cut (else the folder's impact clip). */
  kitImpacts: number;
  /** Where each meteor lands (the ground under its beast), in landing order. */
  points: { x: number; z: number }[];
  /** The clips its head, tail and sparkles were cut from (the element's own). */
  head: string;
  tail: string;
  sparkle: string;
}

/** An element's meteor: its head's clip (the bright core of its peak frame), its tail's matter, its sparkle clip. */
interface Look {
  readonly folder: string;
  readonly head: FlipbookPool;
  readonly headFrame: number;
  readonly headId: string;
  readonly tail: TrailMatter;
  readonly tailId: string;
  readonly spark: FlipbookPool | null;
}

/** The light of a clip's frame `frame` in a disc of CORE_R round its pivot (0–1; the meteor head's test). */
function coreLight(texture: THREE.Texture, meta: FlipbookMeta, frame: number): number {
  const img = texture.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  if (typeof document === "undefined" || img === undefined || !((img.width ?? 0) > 0)) return 1;
  const w = 96;
  const h = Math.max(8, Math.round(w / meta.aspect));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return 1;
  const cw = img.width! / meta.cols;
  const ch = img.height! / meta.rows;
  ctx.drawImage(img, (frame % meta.cols) * cw, Math.floor(frame / meta.cols) * ch, cw, ch, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = meta.pivot[0] * w;
  const py = meta.pivot[1] * h;
  const r = CORE_R * h;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(py - r)); y < Math.min(h, Math.ceil(py + r)); y += 1) {
    for (let x = Math.max(0, Math.floor(px - r)); x < Math.min(w, Math.ceil(px + r)); x += 1) {
      if ((x - px) * (x - px) + (y - py) * (y - py) > r * r) continue;
      const o = (y * w + x) * 4;
      sum += Math.max(d[o]!, d[o + 1]!, d[o + 2]!) / 255;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** A head's card faded to a disc of CORE_R round its clip's light centre (its pivot): the core alone, no cell edge. */
function coreCard(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  material.customProgramCacheKey = () => "meteor-core-card";
  material.onBeforeCompile = (shader) => {
    const line = "  border *= 1.0 - uVignette * smoothstep(0.6, 0.98, length(vUv - 0.5) * 2.0);";
    if (!shader.fragmentShader.includes(line)) throw new Error("[meteor] core-card anchor missing");
    shader.fragmentShader = shader.fragmentShader
      .replace(line, `  border *= 1.0 - smoothstep(${(CORE_R * 0.45).toFixed(3)}, ${CORE_R.toFixed(3)}, length(vec2((vUv.x - uPivot.x) * uAspect, vUv.y - uPivot.y)));`)
      .replace("void main() {", "uniform vec2 uPivot;\nuniform float uAspect;\nvoid main() {");
  };
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
  /** Sparkles owed (a fraction carried frame to frame). */
  spark: number;
  landed: boolean;
  burnt: boolean;
  lit: boolean;
  /** Its fall on screen (rad): the head's and the landing cut's turn. */
  rot: number;
}

const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

export class MeteorRain {
  private t = 0;
  private meteors: Meteor[] = [];
  private prepared = "";
  /** Its trails, a few for the meteors in the air at once (made per element: their matter is its own). */
  private trails: CrescentTrail[] = [];
  /** The element's meteor (made when its folder is in, remade when the element changes). */
  private look: Look | null = null;
  private readonly group = new THREE.Group();
  private readonly blank: THREE.DataTexture;
  last: MeteorReport | null = null;

  constructor(private readonly host: MeteorHost) {
    this.group.name = "fx-meteor-heads";
    host.layer.add(this.group);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.blank.needsUpdate = true;
  }

  private folder(): string {
    return this.host.kit().id;
  }

  /**
   * The element's meteor from its own clips (null until its folder is in): the head the first clip of HEAD_ROLES whose
   * peak frame has a bright centre (a burst's core, not a ring), its tail its ribbon else a band of the head's clip, its
   * sparkles its sparkle clip.
   */
  private lookFor(): Look | null {
    const folder = this.folder();
    if (this.look?.folder === folder) return this.look;
    const player = this.host.stage.flipbooks;
    const lib = player.library(folder);
    const entries = player.loaded(folder).map((id) => lib.get(id)).filter((e) => e !== null && e.meta.layer !== "body") as NonNullable<ReturnType<typeof lib.get>>[];
    if (entries.length === 0) return null;
    let head: (typeof entries)[number] | undefined;
    let headFrame = 0;
    for (const role of HEAD_ROLES) {
      for (const e of entries.filter((x) => x.meta.role === role)) {
        const frame = Math.min(e.meta.frames - 1, e.meta.peak ?? e.meta.start);
        if (coreLight(e.texture, e.meta, frame) >= CORE_LIGHT) {
          head = e;
          headFrame = frame;
          break;
        }
      }
      if (head !== undefined) break;
    }
    if (head === undefined) return null;
    const pool = new FlipbookPool(head.meta.id + "#meteor", "fire", 48, 14, this.blank);
    pool.attach(head.meta, head.texture);
    coreCard(pool);
    for (const old of this.group.children.slice()) this.group.remove(old);
    this.group.add(pool.mesh);
    const r = this.host.kit().ramp;
    const ribbon = entries.find((x) => x.meta.role === "ribbon");
    const tail: TrailMatter = ribbon !== undefined
      ? { map: ribbon.texture, cols: ribbon.meta.cols, rows: ribbon.meta.rows, frames: ribbon.meta.frames, fps: ribbon.meta.fps, colours: "clip", core: r.core, edge: r.edge, body: r.body, blend: "add", across: 0.7 }
      : crescentMatter(head.meta, head.texture, r);
    const sparkle = entries.find((x) => x.meta.role === "sparkle");
    for (const tr of this.trails) tr.mesh.removeFromParent();
    this.trails = [0, 1, 2].map(() => new CrescentTrail(tail, 14, TAIL_M));
    for (const tr of this.trails) this.host.layer.add(tr.mesh);
    this.look = {
      folder, head: pool, headFrame, headId: head.meta.id, tail, tailId: ribbon?.meta.id ?? head.meta.id + " (band)",
      spark: sparkle !== undefined ? player.pool(folder, sparkle.meta.id) : null,
    };
    return this.look;
  }

  /** No blows (no stops, no deaths): the rain's own light alone (measurement only, __lab.meteor(true, true)). */
  private dry = false;

  /** Casts the rain on the herd: marks, meteors, blows (`dry`: none); what it aimed at (0: no beast). */
  cast(dry = false): number {
    this.dry = dry;
    const folder = this.folder();
    this.host.prepareMark(folder);
    this.host.caster(c);
    const aim = aimClipSkill(AIM, this.host.targets, { x: c.x, z: c.z }, { x: c.x, z: c.z - 9 }, "field");
    // Swept from one side (the side the meteors come from) to the other.
    const order = aim.points.map((p, k) => ({ p, k })).sort((x, y) => x.p.x - y.p.x || x.p.z - y.p.z);
    const look = this.lookFor();
    const report: MeteorReport = { element: folder, meteors: 0, marks: 0, impactAt: [], markAt: [], blows: 0, kills: 0, kitImpacts: 0, points: [],
      head: look?.headId ?? "", tail: look?.tailId ?? "", sparkle: look?.spark?.id ?? "" };
    const trails = this.trails;
    const slant = (SLANT_DEG * Math.PI) / 180;
    order.forEach(({ p, k }, n) => {
      const landAt = MARK_S + n * GAP_S;
      const target = new THREE.Vector3(p.x, 0.35, p.z);
      // From high up and to the left (screen left on the play camera), SLANT_DEG off the vertical.
      const start = new THREE.Vector3(p.x - Math.tan(slant) * HEIGHT_M, HEIGHT_M, p.z);
      const hits = aim.hits.filter((h) => h.point === k).map((h) => ({ i: h.i, dx: h.dx, dz: h.dz }));
      this.meteors.push({ target, start, fallAt: landAt - FALL_S, landAt, hits, role: n === 0 ? "primary" : "secondary", trail: trails[n % Math.max(1, trails.length)] ?? null, spark: 0, landed: false, burnt: false, lit: false, rot: 0 });
      // Marked on the ground before its blow; where the kit has no aftermath, the mark stays as the burnt ground.
      const burn = this.hooks().sword?.aftermath !== undefined ? 0.3 : BURN_S;
      if (this.host.mark(folder, p.x, p.z, 3, landAt - MARK_S, MARK_S + burn)) report.marks += 1;
      report.markAt.push(landAt - MARK_S);
      report.impactAt.push(landAt);
      report.points.push({ x: p.x, z: p.z });
      report.meteors += 1;
    });
    this.t = 0;
    this.last = report;
    this.host.release(order[0] !== undefined ? v.set(order[0].p.x, 0, order[0].p.z) : c);
    return report.meteors;
  }

  /** How far its landing's light leads the blow: the kit's impact, or none (no impact clip: its head's core flares at once). */
  private lead(): number {
    const folder = this.folder();
    const player = this.host.stage.flipbooks;
    const lib = player.library(folder);
    const impact = player.loaded(folder).some((x) => {
      const m = lib.get(x)?.meta;
      return m !== undefined && m.layer !== "body" && (m.role === "impact" || m.role === "burst");
    });
    return impact ? this.host.kit().impactLead ?? IMPACT_LEAD_S : 0;
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
    const look = this.meteors.length > 0 ? this.lookFor() : this.look;
    for (const m of this.meteors) {
      // Its burnt ground, past the blow's peak.
      if (m.landed && !m.burnt && this.t >= m.landAt + AFTER_S) {
        m.burnt = true;
        this.hooks().sword?.aftermath?.({ slot: "k1", x: m.target.x, z: m.target.z, r: 1.2, life: BURN_S, rate: 6, pal: this.host.pal() });
      }
      if (m.landed || this.t < m.fallAt) continue;
      // Its impact's light, its attack's length ahead of the blow.
      if (!m.lit && this.t >= m.landAt - this.lead() - 1e-6) {
        m.lit = true;
        this.impact(m);
      }
      const u = Math.min(1, (this.t - m.fallAt) / FALL_S);
      v.lerpVectors(m.start, m.target, u);
      // Its head and tail down to the ground, drawn on its landing frame too (the contact keeps its light).
      m.trail?.head(v.x, v.y, v.z, TAIL_W);
      if (look !== null) this.head(look, v, m, dt);
      if (u < 1) continue;
      m.landed = true;
      this.land(m);
    }
    for (const tr of this.trails) tr.update(dt, this.host.camera);
    look?.head.update(dt);
    if (this.meteors.length > 0 && this.meteors.every((m) => m.landed && m.burnt)) this.meteors = [];
  }

  /** The meteor's head this frame (its element's bright core, turned along the fall on screen) and the sparkles it sheds. */
  private head(look: Look, at: THREE.Vector3, m: Meteor, dt: number): void {
    a.copy(m.start).project(this.host.camera);
    b.copy(m.target).project(this.host.camera);
    const aspect = (this.host.camera as THREE.PerspectiveCamera).aspect ?? 16 / 9;
    m.rot = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    const o: FlipOptions = { life: ONE_FRAME, rate: 0, frame: look.headFrame, rot: m.rot, lift: 0.6, ground: 0 };
    look.head.spawn(at, HEAD_M / (2 * CORE_R), o);
    // Sparkles shed behind it along its tail, drifting and fading: its sparkle clip, else small cores of its head.
    m.spark += SPARKS_PER_S * dt;
    while (m.spark >= 1) {
      m.spark -= 1;
      const back = Math.random() * 0.12;
      c.lerpVectors(m.start, m.target, Math.max(0, (this.t - m.fallAt) / FALL_S - back));
      c.x += (Math.random() - 0.5) * 0.5;
      c.z += (Math.random() - 0.5) * 0.5;
      const sm = look.spark?.meta ?? null;
      if (look.spark !== null && sm !== null) {
        look.spark.spawn(c, 0.4 + Math.random() * 0.3, { frame: sm.start + Math.floor(Math.random() * (sm.frames - sm.start)), rate: 1, life: 0.45, fadeOut: 0.3, vy: -0.6, lift: 0.4, ground: 0 });
      } else {
        look.head.spawn(c, (0.3 + Math.random() * 0.2) / (2 * CORE_R), { frame: look.headFrame, rate: 0, life: 0.35, fadeOut: 0.3, alpha: 0.8, vy: -0.8, lift: 0.4, ground: 0, rot: Math.random() * Math.PI * 2 });
      }
    }
  }

  /** A meteor lands: its blows and its element's impact and burnt ground. */
  private land(m: Meteor): void {
    const r = this.last;
    if (this.dry) {
      if (!m.lit) {
        m.lit = true;
        this.impact(m);
      }
      return;
    }
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
    if (!m.lit) {
      m.lit = true;
      this.impact(m);
    }
  }

  /** The landing's light: the kit's impact; an element without an impact clip its head's core flaring at the target. */
  private impact(m: Meteor): void {
    const hooks = this.hooks().sword;
    const pal = this.host.pal();
    const r = this.last;
    const drawn = hooks?.impact?.({ slot: "k1", at: m.target, scale: 1.3, dx: 0.34, dz: 0, power: 1, big: true, pal }) === true;
    if (drawn && r !== null) r.kitImpacts += 1;
    else if (!drawn && !this.coreFlare(m.target)) this.fallbackImpact(m.target);
  }

  /** Its head's core flaring at the target: full on its first frame, growing, eroding (false: no head yet). */
  private coreFlare(at: THREE.Vector3): boolean {
    const look = this.look;
    if (look === null || look.folder !== this.folder()) return false;
    look.head.spawn(v.copy(at).setY(0.6), (HEAD_M * 2.2) / (2 * CORE_R), { frame: look.headFrame, rate: 0, life: 0.7, grow: 1.5, cool: 0.35, lift: 0.5, ground: 0 });
    return true;
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
    this.look?.head.clear();
  }
}
