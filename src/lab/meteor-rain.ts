/**
 * The slanted meteor shower (canon D62; docs/work/tasks/slanted-meteor.md, skill-five-phase-samples.md;
 * REF_VIDEO_LESSONS_2026-11-05 lessons 1–3): key M in the lab, in the element E has on (every element). Owner 06/11
 * 12:50: "thiên thạch phải làm dạng mưa thiên thạch, rơi nhiều nơi trong map, và rơi trong khoảng 5-8s". 18–24 meteors
 * over about 6.5 s (meteor-plan.ts: when, how big, group or open ground), each aimed as it starts to fall (the densest
 * group not just struck, else anywhere in view), marked on the ground MARK_S before its blow, falling SLANT_DEG off the
 * vertical in FALL_S; each blast strikes every beast within its class's radius (flung, staggered), and the ground burns
 * after it (no more than MAX_BURNS patches at once).
 * A blow from the sky is never the sword's crescent (owner 06/11 09:30: "những kỹ năng nào phóng ra từ kiếm thì dùng dạng
 * vết chém lưỡi liềm, chứ những skill rơi từ trên trời xuống, thì phải làm dạng khác cho phù hợp"; canon D62). Until its
 * own meteor video lands, it is built from the element's own clips: its head a round bright core (the peak frame of its
 * burst, charge, sparkle or ground mark, whichever has a bright centre, cut to a disc round that centre), its tail its
 * ribbon (else a band of the head's clip) along the fall, thinning, sparkles shed behind it (its sparkle clip, else small
 * cores). The blow is the kit's own impact (an element without an impact clip: its head's core flaring at the target)
 * and, AFTER_S later, its aftermath; a kit without hooks (Metal) takes the folder's impact clip and its ground mark
 * lingering. Each blow goes through the lab's hit path (the host).
 * Its body is the element's own comet when the folder has one (role "comet", 06/11: comet-head.ts, the 1080p video,
 * turned so its head leads along the fall); the core-and-ribbon head above stays for elements without one. With a
 * five-phase recipe (five-phase.ts, Fire: docs/work/tasks/skill-five-phase-samples.md) the rain plays all five phases:
 * the charge while its word is typed (the lab's typed mode), the release at the hand with its ribbon streaking up out
 * of the frame, the halo seal marking each beast, the comets, each blow's spray, lotus, turning ring and burning body,
 * the painted burn mark, embers and smoke after.
 */
import * as THREE from "three";
import { CometHead, cometPhase } from "./comet-head";
import { blastsAt, METEOR_SIZES, planShower, SHOWER, type MeteorClass, type MeteorSize } from "./meteor-plan";
import type { FivePhase } from "./five-phase";
import { CrescentTrail, type TrailMatter } from "../view/skills/crescent-trail";
import { crescentMatter } from "../view/skills/element-clips";
import type { ElementKit, ElementHooks } from "../view/skills/element-kit";
import type { ElementStage } from "../view/skills/element-stage";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";
import { Rand } from "../view/skills/fxkit";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import type { WeaponGlow } from "../view/skills/weapons";

/**
 * The fall (s; the comet reads on its way down), the slant off the vertical (degrees), the height they fall from (m).
 * The first lands FIRST_S after the key: the release streaks up first.
 */
export const FALL_S = 0.32;
export const FIRST_S = SHOWER.firstS;
const SLANT_DEG = 20;
const HEIGHT_M = 18;
/** Burning ground patches at once at most (owner's numbers: about 12). */
export const MAX_BURNS = 12;
/** The ground burns this long after a blast (s; the task: 2–3 s). */
const GROUND_S = 2.5;
/** A group already struck (or about to be) is left alone this far round (m) and for this long after its blow (s). */
const SPREAD_M = 5;
const SPREAD_S = 1.0;
/** Beasts counted round a beast for its group's size (m). */
const GROUP_M = 4;
/** Open ground is picked this far round the beasts' extent (m). */
const FIELD_PAD_M = 1.5;
/** Struck beasts that also get the spark spray on their bodies (the nearest few: no pile of sprays on a crowd). */
const SPRAYS = 4;
/** The plan's seed (each cast the next: a reset brings the same shower back). */
const SEED = 62062;
/** The comet's head: a second, solid draw of its ball (comet-head.ts boost). */
const HEAD_BOOST = 0.6;
/** The warm flash rises over 20 ms (ScreenFx.warm): asked this long ahead, it is whole on the landing frame. */
const WARM_LEAD_S = 0.02;
/** A mark leads its blow (s); the first blow comes this long after the key. */
export const MARK_S = 0.2;
/** The tail (m), its width and the head's disc across (m); the ground burns this long (s) where the kit has no aftermath. */
const TAIL_M = 2;
const TAIL_W = 1.3;
const HEAD_M = 1.6;
/** The head's disc: its radius as a share of its clip's cell height, round the clip's light centre (its pivot). */
const CORE_R = 0.24;
/** A clip's centre counts as a bright core above this mean light (0–1) in a tight disc there (CORE_TEST_R; a ring's
 * hollow middle fails it). */
const CORE_LIGHT = 0.25;
const CORE_TEST_R = 0.1;
/** Head clips by preference (their roles), sparkles shed a second from the tail. */
const HEAD_ROLES = ["burst", "charge", "sparkle", "groundMark", "impact", "groundImpact"] as const;
const SPARKS_PER_S = 40;
const BURN_S = 2;
/** The burnt ground comes this long after the landing (s), past its blow's peak: no more than 2–3 lights on one spot. */
const AFTER_S = 0.2;
/**
 * The landing's light starts this long before its blow (s; a kit's own impactLead where it gives one: Thunder's and
 * Star's column comes a beat after their glint): the impact reaches its peak on the landing frame (fast attack: the first
 * impact frame ≥ 95 % of its peak). A landing that is the head's core flaring starts at its peak: no lead.
 */
const IMPACT_LEAD_S = 0.05;


export interface MeteorHost {
  readonly upgrade?: import("../view/skills/flipbook").FlipbookLibrary;
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
  /** A meteor landing at `at` (`size` its class's weight; `first`: the shower's first): its stop, jolt, warm flash, kick, light. */
  strike(at: THREE.Vector3, role: ImpactRole, size: MeteorSize, first: boolean): void;
  /** Flings a small beast up along (dx, dz) (herd.launch: 2–3 m in one flip). */
  launch?(i: number, dx: number, dz: number): void;
  /** The landing's warm full-screen flash (its class's), called WARM_LEAD_S before it lands: full on the landing frame. */
  flash?(size: MeteorSize): void;
  /** The element's status on a struck beast. */
  status(i: number): void;
  /** The element's five-phase sample layers (null: none; five-phase.ts) and the hand the release leaves from. */
  five?(): FivePhase | null;
  hand?(out: THREE.Vector3): void;
}

/** What the last rain did (__lab.meteor). */
export interface MeteorReport {
  element: string;
  meteors: number;
  marks: number;
  /** Seconds after the key: each meteor's landing, its mark's start; its class; whether it sought a group of beasts. */
  impactAt: number[];
  markAt: number[];
  classes: MeteorClass[];
  cluster: boolean[];
  /** The most additive blasts showing at once (≤ MAX_BLASTS) and burning patches at once (≤ MAX_BURNS). */
  maxBlasts: number;
  maxBurns: number;
  blows: number;
  kills: number;
  /** Landings drawn by the kit's own impact or cut (else the folder's impact clip). */
  kitImpacts: number;
  /** Where each meteor lands, in landing order (set as it starts to fall); how many beasts each struck. */
  points: { x: number; z: number }[];
  struck: number[];
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

/** The light of a clip's frame `frame` in a disc of CORE_TEST_R round its pivot (0–1; the meteor head's test). */
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
  const r = CORE_TEST_R * h;
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
      // Declared at the top: the tag mask (tag-mask.ts) renames the body's main and appends its own.
      .replace(/^/, "uniform vec2 uPivot;\nuniform float uAspect;\n");
  };
}

interface Meteor {
  /** Its place in the shower, its class and weight, whether it seeks a group, its blast's length (s). */
  readonly n: number;
  readonly cls: MeteorClass;
  readonly size: MeteorSize;
  readonly cluster: boolean;
  readonly blastS: number;
  /** When it starts falling and lands (world s). */
  readonly fallAt: number;
  readonly landAt: number;
  readonly role: ImpactRole;
  /** Where it lands and falls from and its fall (unit), set as it starts to fall (the beasts have moved since the key). */
  readonly target: THREE.Vector3;
  readonly start: THREE.Vector3;
  readonly fall: THREE.Vector3;
  aimed: boolean;
  readonly trail: CrescentTrail | null;
  /** Sparkles owed (a fraction carried frame to frame). */
  spark: number;
  landed: boolean;
  burnt: boolean;
  lit: boolean;
  warmed: boolean;
  /** Its fall on screen (rad): the provisional head's turn. */
  rot: number;
  /** Its comet's phase (0–1 of a loop). */
  readonly phase: number;
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
  /** The element's comet (its video when it plays; the lab sets `driven` on fixed steps and `mode` from the lab flags). */
  readonly comet: CometHead;
  /** The five-phase layers of this rain (set at its cast; null: the plain rain). */
  private fiveNow: FivePhase | null = null;
  /** The shower's cast (world s), its random choices (aims), casts so far (the next plan's seed). */
  private t0 = 0;
  private rand = new Rand(SEED);
  private casts = 0;
  /** Where meteors landed or will (world s): a group just struck is left alone for a while. */
  private readonly recent: { x: number; z: number; at: number }[] = [];
  /** When each burning patch goes out (world s). */
  private readonly burns: number[] = [];
  private readonly found = new Int32Array(256);
  private readonly near = new Int32Array(256);

  constructor(private readonly host: MeteorHost) {
    this.group.name = "fx-meteor-heads";
    host.layer.add(this.group);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.blank.needsUpdate = true;
    this.comet = new CometHead(host.layer, this.blank);
  }

  /** Whether the element on has its own comet in (its folder loaded). */
  hasComet(): boolean {
    const folder = this.folder();
    return this.comet.use(folder, this.host.stage.flipbooks.library(folder), this.host.upgrade ?? null);
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
    // The first by HEAD_ROLES whose centre is bright; none: the brightest centre of them all.
    let head: (typeof entries)[number] | undefined;
    let headFrame = 0;
    let best = -1;
    for (const role of HEAD_ROLES) {
      for (const e of entries.filter((x) => x.meta.role === role)) {
        const frame = Math.min(e.meta.frames - 1, e.meta.peak ?? e.meta.start);
        const light = coreLight(e.texture, e.meta, frame);
        if (light > best) {
          best = light;
          head = e;
          headFrame = frame;
        }
        if (light >= CORE_LIGHT) break;
      }
      if (best >= CORE_LIGHT) break;
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

  /** Casts the shower (`dry`: no blows): its plan, the release; the meteors aim as they start to fall. How many fall. */
  cast(dry = false): number {
    this.dry = dry;
    const folder = this.folder();
    this.host.prepareMark(folder);
    this.host.caster(c);
    const look = this.lookFor();
    const five = this.host.five?.() ?? null;
    this.fiveNow = five;
    const comet = this.hasComet();
    const seed = SEED + this.casts;
    this.casts += 1;
    const plan = planShower(seed);
    this.rand = new Rand(seed * 7 + 1);
    this.t0 = this.t;
    let maxBlasts = 0;
    for (const at of plan.landAt) maxBlasts = Math.max(maxBlasts, blastsAt(plan, at + 1e-6));
    const report: MeteorReport = {
      element: folder, meteors: plan.landAt.length, marks: 0, impactAt: [...plan.landAt], markAt: plan.landAt.map((x) => x - MARK_S), classes: [...plan.cls],
      cluster: [...plan.cluster], maxBlasts, maxBurns: 0, blows: 0, kills: 0, kitImpacts: 0, points: [], struck: [],
      head: comet ? this.comet.id : look?.headId ?? "", tail: look?.tailId ?? "", sparkle: look?.spark?.id ?? "",
    };
    const trails = this.trails;
    const last = plan.landAt.length - 1;
    plan.landAt.forEach((at, n) => {
      const cls = plan.cls[n]!;
      this.meteors.push({
        n, cls, size: METEOR_SIZES[cls], cluster: plan.cluster[n]!, blastS: plan.blastS[n]!, fallAt: this.t0 + at - FALL_S, landAt: this.t0 + at,
        role: n === 0 ? "primary" : n === last ? "finisher" : "secondary", target: new THREE.Vector3(), start: new THREE.Vector3(), fall: new THREE.Vector3(),
        aimed: false, trail: trails[n % Math.max(1, trails.length)] ?? null, spark: 0, landed: false, burnt: false, lit: false, warmed: false, rot: 0, phase: cometPhase(n),
      });
    });
    this.last = report;
    // The release toward the field ahead (the first meteor aims only as it falls).
    a.set(c.x, 0, c.z - 9);
    this.host.release(a);
    if (five !== null) {
      // R at the hand on the key's frame, and the ribbon streaking up out of the frame (the meteors answer it).
      if (this.host.hand !== undefined) this.host.hand(a);
      else a.set(c.x, 1.3, c.z);
      five.release(a, 0, -1, c.x, c.z, false);
      five.skyStreak(a);
    }
    return report.meteors;
  }

  /**
   * Where meteor `m` lands, as it starts to fall: a group (the densest one not struck within SPREAD_M in the last
   * SPREAD_S, the king the densest of all) or open ground in view; its mark; its fall.
   */
  private aim(m: Meteor): void {
    m.aimed = true;
    this.host.caster(c);
    let found = false;
    if (m.cluster) found = this.densest(m.cls === "king", b);
    if (!found) this.open(b);
    m.target.set(b.x, 0.35, b.z);
    const slant = (SLANT_DEG * Math.PI) / 180;
    m.start.set(b.x - Math.tan(slant) * HEIGHT_M, HEIGHT_M, b.z);
    m.fall.subVectors(m.target, m.start).normalize();
    this.recent.push({ x: b.x, z: b.z, at: m.landAt });
    if (this.recent.length > 8) this.recent.shift();
    const r = this.last;
    if (r !== null) r.points[m.n] = { x: b.x, z: b.z };
    // Its mark, MARK_S before its blow, as wide as the ground it will strike.
    const delay = Math.max(0, m.landAt - MARK_S - this.t);
    const five = this.fiveNow;
    if (five !== null) {
      five.markAt(b.x, b.z, MARK_S, delay, m.size.hitR * 1.25);
      if (r !== null) r.marks += 1;
    } else {
      const burn = this.hooks().sword?.aftermath !== undefined ? 0.3 : BURN_S;
      if (this.host.mark(this.folder(), b.x, b.z, m.size.hitR * 1.4, delay, MARK_S + burn) && r !== null) r.marks += 1;
    }
  }

  /** Whether (x, z) lies within SPREAD_M of a landing in the last SPREAD_S or still to come. */
  private struckNear(x: number, z: number): boolean {
    for (const p of this.recent) if (p.at >= this.t - SPREAD_S && Math.hypot(p.x - x, p.z - z) < SPREAD_M) return true;
    return false;
  }

  /** The beast with the most beasts within GROUP_M (`all`: wherever; else away from groups just struck) into `out`. */
  private densest(all: boolean, out: THREE.Vector3): boolean {
    const T = this.host.targets;
    let best = -1;
    let most = 0;
    for (let i = 0; i < T.size; i += 1) {
      if (!T.alive(i)) continue;
      const x = T.x(i);
      const z = T.z(i);
      if (!all && this.struckNear(x, z)) continue;
      const n = T.inCircle(x, z, GROUP_M, this.near);
      if (n > most) {
        most = n;
        best = i;
      }
    }
    if (best < 0) return false;
    out.set(T.x(best), 0, T.z(best));
    return true;
  }

  /**
   * Open ground on the field (where the beasts roam, a little beyond; none: anywhere in view), not on the caster, away
   * from groups just struck, into `out`.
   */
  private open(out: THREE.Vector3): void {
    const R = this.rand;
    const T = this.host.targets;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < T.size; i += 1) {
      if (!T.alive(i)) continue;
      x0 = Math.min(x0, T.x(i));
      x1 = Math.max(x1, T.x(i));
      z0 = Math.min(z0, T.z(i));
      z1 = Math.max(z1, T.z(i));
    }
    const field = x0 <= x1;
    for (let k = 0; k < 12; k += 1) {
      if (field) out.set(R.range(x0 - FIELD_PAD_M, x1 + FIELD_PAD_M), 0, R.range(z0 - FIELD_PAD_M, z1 + FIELD_PAD_M));
      else if (!this.ground(R.range(-0.85, 0.85), R.range(-0.7, 0.7), out)) continue;
      if (Math.hypot(out.x - c.x, out.z - c.z) < 5) continue;
      if (k < 10 && this.struckNear(out.x, out.z)) continue;
      return;
    }
    out.set(c.x + R.range(-10, 10), 0, c.z - R.range(6, 16));
  }

  /** The ground under the screen point (nx, ny) (−1…1) into `out`; false: that point sees no ground. */
  private ground(nx: number, ny: number, out: THREE.Vector3): boolean {
    const cam = this.host.camera;
    a.setFromMatrixPosition(cam.matrixWorld);
    out.set(nx, ny, 0.5).unproject(cam).sub(a);
    if (out.y > -1e-3) return false;
    const k = -a.y / out.y;
    out.multiplyScalar(k).add(a);
    out.y = 0;
    return true;
  }

  /** How far its landing's light leads the blow: the kit's impact, or none (no impact clip: its head's core flares at once). */
  private lead(): number {
    // The five-phase blast is whole on the landing frame itself.
    if (this.fiveNow !== null) return 0;
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

  /** World time: the meteors aim, fall (their comets), land (blows, blasts) and leave the ground burning. */
  update(dt: number): void {
    const folder = this.folder();
    if (folder !== this.prepared) {
      // The element changed (E): its ground mark loads now, before the next rain.
      this.host.prepareMark(folder);
      this.prepared = folder;
    }
    this.t += dt;
    const look = this.meteors.length > 0 ? this.lookFor() : this.look;
    const comet = this.meteors.length > 0 && this.hasComet();
    for (let k = this.burns.length - 1; k >= 0; k -= 1) if (this.burns[k]! <= this.t) this.burns.splice(k, 1);
    for (const m of this.meteors) {
      // Its burnt ground, past the blast's peak.
      if (m.landed && !m.burnt && this.t >= m.landAt + AFTER_S) {
        m.burnt = true;
        this.burn(m);
      }
      if (m.landed || this.t < m.fallAt) continue;
      if (!m.aimed) this.aim(m);
      if (!m.warmed && !this.dry && this.t >= m.landAt - WARM_LEAD_S - 1e-6) {
        m.warmed = true;
        this.host.flash?.(m.size);
      }
      // Its impact's light, its attack's length ahead of the blow.
      if (!m.lit && this.fiveNow === null && this.t >= m.landAt - this.lead() - 1e-6) {
        m.lit = true;
        this.impact(m);
      }
      const u = Math.min(1, (this.t - m.fallAt) / FALL_S);
      v.lerpVectors(m.start, m.target, u);
      // Its body down to the ground, drawn on its landing frame too (the contact keeps its light): its comet, else its
      // head's core; its ribbon tail as wide as its class.
      const k = m.size.cardM / 10;
      m.trail?.head(v.x, v.y, v.z, (comet ? TAIL_W * 0.7 : TAIL_W) * k);
      if (comet) this.cometFrame(look, v, m, dt);
      else if (look !== null) this.head(look, v, m, dt);
      if (u < 1) continue;
      m.landed = true;
      this.land(m);
    }
    for (const tr of this.trails) tr.update(dt, this.host.camera);
    look?.head.update(dt);
    this.comet.update(dt);
    if (this.meteors.length > 0 && this.meteors.every((m) => m.landed && m.burnt)) this.meteors = [];
  }

  /** Sparkles shed behind a falling meteor along its fall (`u` how far down), its sparkle clip or the five-phase twinkles. */
  private shed(look: Look | null, m: Meteor, u: number, dt: number): void {
    const k = m.size.cardM / 10;
    m.spark += SPARKS_PER_S * k * dt;
    while (m.spark >= 1) {
      m.spark -= 1;
      const back = Math.random() * 0.12;
      c.lerpVectors(m.start, m.target, Math.max(0, u - back));
      c.x += (Math.random() - 0.5) * 0.6 * k;
      c.z += (Math.random() - 0.5) * 0.6 * k;
      const sm = look?.spark?.meta ?? null;
      if (this.fiveNow !== null && Math.random() < 0.5) this.fiveNow.twinkle(c, (0.3 + Math.random() * 0.3) * Math.sqrt(k), 0.4, 1.3, 0, 0, -0.8, 0);
      else if (look !== null && look.spark !== null && sm !== null) {
        look.spark.spawn(c, (0.4 + Math.random() * 0.3) * Math.sqrt(k), { frame: sm.start + Math.floor(Math.random() * (sm.frames - sm.start)), rate: 1, life: 0.45, fadeOut: 0.3, vy: -0.6, lift: 0.4, ground: 0 });
      } else if (look !== null) {
        look.head.spawn(c, ((0.3 + Math.random() * 0.2) * Math.sqrt(k)) / (2 * CORE_R), { frame: look.headFrame, rate: 0, life: 0.35, fadeOut: 0.3, alpha: 0.8, vy: -0.8, lift: 0.4, ground: 0, rot: Math.random() * Math.PI * 2 });
      }
    }
  }

  /**
   * The meteor's body this frame from its element's comet (its head leading along the fall, a solid second draw of its
   * ball), as big as its class, and the sparkles it sheds.
   */
  private cometFrame(look: Look | null, at: THREE.Vector3, m: Meteor, dt: number): void {
    // Grows in over the first third of the fall (it comes out of the sky, not out of nothing).
    const u = Math.min(1, (this.t - m.fallAt) / FALL_S);
    this.comet.draw(at, m.fall, m.size.cardM * (0.7 + 0.3 * Math.min(1, u * 3)), Math.min(1, u * 3.5), m.phase, HEAD_BOOST);
    this.shed(look, m, u, dt);
  }

  /** The meteor's head this frame (its element's bright core, turned along the fall on screen) and the sparkles it sheds. */
  private head(look: Look, at: THREE.Vector3, m: Meteor, dt: number): void {
    a.copy(m.start).project(this.host.camera);
    b.copy(m.target).project(this.host.camera);
    const aspect = (this.host.camera as THREE.PerspectiveCamera).aspect ?? 16 / 9;
    m.rot = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    const o: FlipOptions = { life: ONE_FRAME, rate: 0, frame: look.headFrame, rot: m.rot, lift: 0.6, ground: 0 };
    // The class's head: its ball about 0.28 of the comet card it stands in for.
    look.head.spawn(at, (m.size.cardM * 0.28) / (2 * CORE_R), o);
    this.shed(look, m, Math.min(1, (this.t - m.fallAt) / FALL_S), dt);
  }

  /** A meteor lands: its stop, jolt and light; every beast within its radius struck (flung); its blast. */
  private land(m: Meteor): void {
    const r = this.last;
    if (!this.dry) {
      const T = this.host.targets;
      const s = m.size;
      this.host.strike(m.target, m.role, s, m.n === 0);
      const n = Math.min(this.found.length, T.inCircle(m.target.x, m.target.z, s.hitR, this.found));
      // The nearest first (they get the sprays).
      const hit = Array.from(this.found.subarray(0, n)).sort((x, y) => Math.hypot(T.x(x) - m.target.x, T.z(x) - m.target.z) - Math.hypot(T.x(y) - m.target.x, T.z(y) - m.target.z));
      const five = this.fiveNow;
      let struck = 0;
      for (const i of hit) {
        if (!T.alive(i)) continue;
        // Away from the blast's heart (a beast right under it: along the fall).
        let dx = T.x(i) - m.target.x;
        let dz = T.z(i) - m.target.z;
        const l = Math.hypot(dx, dz);
        if (l < 0.2) {
          dx = m.fall.x;
          dz = m.fall.z;
        }
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        const killed = five !== null ? five.hit("km", i, dx, dz, m.role, s.power, false, struck < SPRAYS) : this.host.blow(i, dx, dz, s.power, m.role);
        if (five === null && !killed) this.host.status(i);
        if (!killed && s.launch) this.host.launch?.(i, dx, dz);
        struck += 1;
        if (r !== null) {
          r.blows += 1;
          if (killed) r.kills += 1;
        }
      }
      if (r !== null) r.struck[m.n] = struck;
    }
    if (!m.lit) {
      m.lit = true;
      this.impact(m);
    }
  }

  /** The landing's blast: the five-phase blast, else the kit's impact (its class's size), else its head's core flaring. */
  private impact(m: Meteor): void {
    const r = this.last;
    const five = this.fiveNow;
    if (five !== null) {
      five.blast(m.target.x, m.target.z, m.size, m.blastS);
      if (r !== null) r.kitImpacts += 1;
      return;
    }
    const hooks = this.hooks().sword;
    const pal = this.host.pal();
    const scale = m.size.blastM / 3;
    const drawn = hooks?.impact?.({ slot: "k1", at: m.target, scale, dx: 0.34, dz: 0, power: 1, big: true, pal }) === true;
    if (drawn && r !== null) r.kitImpacts += 1;
    else if (!drawn && !this.coreFlare(m.target, m.size.blastM)) this.fallbackImpact(m.target, m.size.blastM);
  }

  /** The ground burning where it struck (no more than MAX_BURNS patches at once; a patch past that is left out). */
  private burn(m: Meteor): void {
    if (this.burns.length >= MAX_BURNS) return;
    this.burns.push(this.t + GROUND_S);
    const r = this.last;
    if (r !== null) r.maxBurns = Math.max(r.maxBurns, this.burns.length);
    const s = m.size;
    if (this.fiveNow !== null) {
      this.fiveNow.aftermath(m.target.x, m.target.z, s.burnM, 0);
      this.fiveNow.groundFire(m.target.x, m.target.z, s.burnM, GROUND_S);
    } else this.hooks().sword?.aftermath?.({ slot: "k1", x: m.target.x, z: m.target.z, r: s.burnM / 2.5, life: GROUND_S, rate: 6, pal: this.host.pal() });
  }

  /** Its head's core flaring at the target, `across` m: full on its first frame, growing, eroding (false: no head yet). */
  private coreFlare(at: THREE.Vector3, across: number): boolean {
    const look = this.look;
    if (look === null || look.folder !== this.folder()) return false;
    look.head.spawn(v.copy(at).setY(0.6), (across * 0.55) / (2 * CORE_R), { frame: look.headFrame, rate: 0, life: 0.7, grow: 1.5, cool: 0.35, lift: 0.5, ground: 0 });
    return true;
  }

  /** Without the kit's impact: the folder's impact (or burst) clip, `across` m, fast to its peak, then slow. */
  private fallbackImpact(at: THREE.Vector3, across: number): void {
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
    pool.spawn(v.copy(at).setY(0.6), across * 0.8, o);
  }

  get active(): boolean {
    return this.meteors.length > 0;
  }

  reset(): void {
    this.meteors = [];
    for (const tr of this.trails) tr.clear();
    this.look?.head.clear();
    this.comet.clear();
    this.fiveNow = null;
    this.recent.length = 0;
    this.burns.length = 0;
    this.casts = 0;
  }
}
