/**
 * Castable clip skills (docs/work/tasks/lab-castable-skills.md; owner 06/11 00:05: "tạm thời chưa cần chấm, tôi sẽ là
 * người chấm, bạn hãy bắt đầu triển khai từng cái vào lab để nó thành skill để tôi test là được"): a showcase item
 * (showcase.ts) cast on the lab's herd. One data table (ClipSkill rows), one runner (ClipSkillRunner), no code per skill.
 * The runner aims by the skill's shape from where the beasts stand (8 m cells, as key 7 groups them; no beast: the
 * field's middle), stands the clip there, marks the ground MARK_S before a blow from the sky (REF_VIDEO_LESSONS lesson
 * 1), lands each strike on the clip's own frame (its manifest peak through the showcase's time map, never a guess), and
 * leaves its marks on the ground eroding for `linger` s (lesson 3). Every blow goes through the host, the same hit path
 * as keys 0–7: the herd's hit, the impact event and its numbers, reactions and deaths, the screen's tier with its
 * hit-stop, the camera kick, the light. The lab has no cooldown.
 * Batch 1: key 8's pillars and ultimates (PRODUCTION_LIST_2026-11-05 §4, §7); keys 9's batches add their rows from
 * docs/work/tasks/clip-skills-expansion.json.
 */
import * as THREE from "three";
import type { FoeStatusKind } from "../view/skills/element-kit";
import { layFlat } from "../view/skills/element-clips";
import { FlipbookPool, parseFlipbookManifest, type FlipbookMeta, type FlipbookPlayer, type FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { ImpactRole } from "../view/screen-fx";
import type { Showcase } from "./showcase";

/**
 * How a skill lands: on the densest group (point), on the N densest (multi), on the whole field (field), from the caster
 * straight through the densest line (line), as a ring widening round a centre (ring), as an arc swept round the caster
 * (sweep), along a beast's flight across the field (path), as a fan from the caster (cone).
 */
export type ClipShape = "point" | "multi" | "field" | "line" | "ring" | "sweep" | "path" | "cone";
export type ClipDamage = "light" | "heavy" | "ult";
/** In the lab a status only stills (stun, bind) or slows a beast, its rim in the element's colour. */
export type ClipStatus = "stun" | "bind" | "slow";
export type ClipElement = "metal" | "wood" | "water" | "fire" | "earth" | "thunder" | "wind" | "ice" | "dark" | "light" | "poison" | "blood" | "void" | "star";

/** One strike: the clip frame it lands on ("peak": the manifest's timing.peak) and its power (0–1, the herd's). */
export interface ClipStrike {
  readonly frame: number | "peak";
  readonly power: number;
}

/** One castable skill: its clip, element and how it lands (lab-castable-skills.md §1). */
export interface ClipSkill {
  /** Its clip's manifest id (the showcase item it casts: names, sound and light come from there). */
  readonly id: string;
  readonly element: ClipElement;
  readonly shape: ClipShape;
  /** Metres: round each point (point, multi, ring), the field's reach, a line's or path's half width, a sweep's or cone's reach. */
  readonly radius: number;
  /** Points (multi); 1 for the rest. */
  readonly count: number;
  readonly strikes: readonly ClipStrike[];
  readonly damage: ClipDamage;
  readonly status?: { readonly kind: ClipStatus; readonly seconds: number };
  /** A mark on the ground MARK_S before a blow from the sky. */
  readonly mark: boolean;
  /** Seconds its marks stay on the ground after the first strike, eroding (1.5–2.5); 0: none. */
  readonly linger: number;
  /** What in the row is a guess (not measured on the clip). */
  readonly guess?: string;
}

/** Cells a field groups its beasts in (m: key 7's), how long a mark leads a blow from the sky (s). */
export const CELL_M = 8;
export const MARK_S = 0.2;
/** A field skill's blows run out from its centre (m/s); a ring widens over RING_S, a sweep turns in SWEEP_S. */
const SPREAD_MPS: Readonly<Record<ClipShape, number>> = { point: 0, multi: 0, field: 60, line: 70, ring: 0, sweep: 0, path: 26, cone: 40 };
const RING_S = 0.5;
const SWEEP_S = 0.45;
/** A line's length and a path's half length (m); a cone's half angle (rad). */
const LINE_M = 30;
const PATH_HALF_M = 22;
const CONE_HALF = (35 * Math.PI) / 180;
/** Marks a field skill leaves (on its densest cells). */
const FIELD_MARKS = 5;
/** A blow's element rim on a struck beast (s) when the skill has no status. */
const RIM_S = 1.2;

/** The status rim each element leaves on a beast (element-kit.ts FoeStatusKind). */
const RIM: Readonly<Record<ClipElement, FoeStatusKind>> = {
  metal: "cut", wood: "rooted", water: "wet", fire: "burn", earth: "crushed", thunder: "shocked", wind: "swept", ice: "frozen",
  dark: "devoured", light: "judged", poison: "corroded", blood: "drained", void: "rifted", star: "starfall",
};

const peak = (power: number): ClipStrike => ({ frame: "peak", power });
const at = (frame: number, power: number): ClipStrike => ({ frame, power });

/**
 * Key 8's rows (batch 1): PRODUCTION_LIST_2026-11-05 §7 (pillars: one column on one beast, dozens of columns each on one
 * beast, the light column, the meteor's molten crater) and §4 (each element's ultimate over the whole field). The
 * first strike of each is its clip's peak frame (art-src/lab/vfx/ult/manifest.json timing.peak); a later strike is a
 * frame inside the clip's hold chosen by what the clip shows, marked as a guess.
 */
export const KEY8_SKILLS: readonly ClipSkill[] = [
  { id: "pillar-thunder-single", element: "thunder", shape: "point", radius: 2.2, count: 1, strikes: [peak(1)], damage: "heavy", status: { kind: "stun", seconds: 1 }, mark: true, linger: 2 },
  { id: "pillar-thunder-field", element: "thunder", shape: "multi", radius: 1.4, count: 12, strikes: [peak(0.85)], damage: "heavy", status: { kind: "stun", seconds: 0.8 }, mark: true, linger: 1.6 },
  { id: "pillar-light-judgement", element: "light", shape: "point", radius: 3, count: 1, strikes: [peak(1)], damage: "heavy", status: { kind: "stun", seconds: 0.6 }, mark: true, linger: 2.2 },
  { id: "pillar-fire-meteor", element: "fire", shape: "point", radius: 3.6, count: 1, strikes: [peak(1)], damage: "heavy", mark: true, linger: 2.5 },
  { id: "ult-metal-geng", element: "metal", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(12, 0.5)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: false, linger: 2, guess: "frame 12: the bell's second toll" },
  { id: "ult-wood-primordial-tree", element: "wood", shape: "field", radius: 30, count: 1, strikes: [peak(0.9)], damage: "ult", status: { kind: "bind", seconds: 2.2 }, mark: false, linger: 2.5 },
  { id: "ult-water-profound-sea-v2", element: "water", shape: "field", radius: 30, count: 1, strikes: [peak(0.9), at(12, 0.6)], damage: "ult", status: { kind: "slow", seconds: 2.5 }, mark: false, linger: 2, guess: "frame 12: the sea dragon's pass" },
  { id: "ult-fire-one-spark", element: "fire", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(10, 0.4), at(18, 0.4)], damage: "ult", mark: false, linger: 2.5, guess: "frames 10, 18: the burning sky's two burns" },
  { id: "ult-earth-ink-peaks", element: "earth", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "stun", seconds: 1 }, mark: false, linger: 2.5 },
  { id: "ult-thunder-nine-heavens-v2", element: "thunder", shape: "field", radius: 30, count: 1, strikes: [peak(0.8), at(6, 0.6), at(12, 0.6)], damage: "ult", status: { kind: "stun", seconds: 1 }, mark: true, linger: 2, guess: "frames 6, 12: the edict's next bolts" },
  { id: "ult-wind-firmament", element: "wind", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "slow", seconds: 1.5 }, mark: false, linger: 1.5 },
  { id: "ult-ice-cold-silence", element: "ice", shape: "field", radius: 30, count: 1, strikes: [peak(0.6)], damage: "ult", status: { kind: "bind", seconds: 3 }, mark: false, linger: 2.5 },
  { id: "ult-dark-a", element: "dark", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "slow", seconds: 2 }, mark: false, linger: 2 },
  { id: "ult-light", element: "light", shape: "field", radius: 30, count: 1, strikes: [peak(1)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: true, linger: 2 },
  { id: "ult-poison", element: "poison", shape: "field", radius: 30, count: 1, strikes: [peak(0.6), at(8, 0.35), at(16, 0.35), at(24, 0.35)], damage: "ult", status: { kind: "slow", seconds: 2.5 }, mark: false, linger: 2.5, guess: "frames 8, 16, 24: the miasma's bites" },
  { id: "ult-blood", element: "blood", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(20, 0.5)], damage: "ult", mark: false, linger: 2, guess: "frame 20: the blood lotus drinks" },
  { id: "ult-void", element: "void", shape: "field", radius: 30, count: 1, strikes: [peak(1), at(8, 0.6)], damage: "ult", status: { kind: "stun", seconds: 0.8 }, mark: false, linger: 1.5, guess: "frame 8: the mirror's shards" },
  { id: "ult-star", element: "star", shape: "field", radius: 30, count: 1, strikes: [peak(0.8), at(6, 0.8), at(12, 1)], damage: "ult", mark: true, linger: 2, guess: "frames 6, 12: the next meteors" },
];

const SHAPE_VI: Readonly<Record<ClipShape, string>> = {
  point: "một điểm", multi: "nhiều điểm", field: "cả sân", line: "đường thẳng", ring: "vòng nở", sweep: "cung quét", path: "đường bay", cone: "hình quạt",
};
const DAMAGE_VI: Readonly<Record<ClipDamage, string>> = { light: "nhẹ", heavy: "nặng", ult: "tuyệt kỹ" };
const STATUS_VI: Readonly<Record<ClipStatus, string>> = { stun: "choáng", bind: "trói", slow: "chậm" };
/** The caption's keys line for key 8. */
export const KEY8_NAV = "phím 8: tung · Shift+8: chọn mục kế · không hồi chiêu";

/** A skill's stats for the panel and the caption (Vietnamese): shape, radius, points, strikes, damage, status. */
export function describeClipSkill(s: ClipSkill): string {
  const fmt = (n: number): string => String(n).replace(".", ",");
  const parts = [SHAPE_VI[s.shape], `${fmt(s.radius)} m`];
  if (s.count > 1) parts.push(`${s.count} điểm`);
  parts.push(`${s.strikes.length} cú`, `sát thương ${DAMAGE_VI[s.damage]}`);
  if (s.status !== undefined) parts.push(`${STATUS_VI[s.status.kind]} ${fmt(s.status.seconds)} s`);
  return parts.join(" · ");
}

interface XZ {
  x: number;
  z: number;
}

/** Where a skill lands: its anchor (the clip, the strike's light and kick), its marks' points, the beasts it strikes. */
export interface ClipAim {
  readonly anchor: XZ;
  readonly points: readonly XZ[];
  /** Each struck beast: its delay after a strike (s) and the blow's ground direction (unit). */
  readonly hits: readonly { readonly i: number; readonly delay: number; readonly dx: number; readonly dz: number }[];
}

/** Live beasts grouped in CELL_M cells, densest first: each cell's centroid and count. */
export function denseCells(field: TargetField): { x: number; z: number; n: number }[] {
  const map = new Map<number, { x: number; z: number; n: number }>();
  for (let i = 0; i < field.size; i += 1) {
    if (!field.alive(i)) continue;
    const x = field.x(i);
    const z = field.z(i);
    const key = (Math.floor(x / CELL_M) + 512) * 4096 + Math.floor(z / CELL_M) + 512;
    const c = map.get(key);
    if (c === undefined) map.set(key, { x, z, n: 1 });
    else {
      c.x += x;
      c.z += z;
      c.n += 1;
    }
  }
  const out = [...map.values()];
  for (const c of out) {
    c.x /= c.n;
    c.z /= c.n;
  }
  return out.sort((a, b) => b.n - a.n || a.x - b.x || a.z - b.z);
}

const scratch = new Int32Array(512);

/**
 * Aims `skill` from where the beasts stand (never the map: rule of 04/11): the caster's ground point and the field's
 * middle (the ground under the screen's centre) as given. A spread (field, line, path, cone) starts at the beast it
 * reaches first, so the first blow lands on the strike's own frame.
 */
export function aimClipSkill(skill: ClipSkill, field: TargetField, caster: XZ, centre: XZ): ClipAim {
  const groups = denseCells(field);
  const dense: XZ = groups[0] ?? centre;
  const hits: { i: number; delay: number; dx: number; dz: number }[] = [];
  const seen = new Set<number>();
  const add = (i: number, delay: number, ox: number, oz: number): void => {
    if (seen.has(i)) return;
    seen.add(i);
    let dx = field.x(i) - ox;
    let dz = field.z(i) - oz;
    let l = Math.hypot(dx, dz);
    if (l < 1e-3) {
      dx = field.x(i) - caster.x;
      dz = field.z(i) - caster.z;
      l = Math.hypot(dx, dz) || 1;
    }
    hits.push({ i, delay, dx: dx / l, dz: dz / l });
  };
  const circle = (p: XZ, r: number, delayOf: (i: number) => number): void => {
    const n = field.inCircle(p.x, p.z, r, scratch);
    for (let k = 0; k < n; k += 1) add(scratch[k]!, delayOf(scratch[k]!), p.x, p.z);
  };
  const toward = (from: XZ): XZ => {
    const dx = dense.x - from.x;
    const dz = dense.z - from.z;
    const l = Math.hypot(dx, dz);
    return l > 1e-3 ? { x: dx / l, z: dz / l } : { x: 0, z: -1 };
  };
  const r = skill.radius;
  let anchor: XZ = dense;
  const points: XZ[] = [];
  switch (skill.shape) {
    case "point": {
      // On the beast nearest the densest group's centre.
      const i = field.nearest(dense.x, dense.z, CELL_M * 2);
      anchor = i >= 0 ? { x: field.x(i), z: field.z(i) } : dense;
      points.push(anchor);
      circle(anchor, r, () => 0);
      break;
    }
    case "multi": {
      // One point a beast, the densest cells' beasts first (nearest their cell's centre), no two closer than 1.5 radii.
      const order: { i: number; n: number; d: number }[] = [];
      for (let i = 0; i < field.size; i += 1) {
        if (!field.alive(i)) continue;
        let best = groups[0]!;
        let bd = Infinity;
        for (const g of groups) {
          const d = Math.hypot(field.x(i) - g.x, field.z(i) - g.z);
          if (d < bd) {
            bd = d;
            best = g;
          }
        }
        order.push({ i, n: best.n, d: bd });
      }
      order.sort((a, b) => b.n - a.n || a.d - b.d || a.i - b.i);
      for (const o of order) {
        if (points.length >= skill.count) break;
        const p = { x: field.x(o.i), z: field.z(o.i) };
        if (points.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= r * 1.5)) points.push(p);
      }
      if (points.length === 0) points.push(centre);
      anchor = centre;
      for (const p of points) circle(p, r, () => 0);
      break;
    }
    case "field": {
      anchor = centre;
      for (const g of groups.slice(0, FIELD_MARKS)) points.push({ x: g.x, z: g.z });
      circle(centre, r, (i) => Math.hypot(field.x(i) - centre.x, field.z(i) - centre.z) / SPREAD_MPS.field);
      break;
    }
    case "ring": {
      points.push(anchor);
      circle(anchor, r, (i) => (Math.hypot(field.x(i) - anchor.x, field.z(i) - anchor.z) / r) * RING_S);
      break;
    }
    case "line": {
      const d = toward(caster);
      anchor = caster;
      const n = field.inCapsule(caster.x, caster.z, caster.x + d.x * LINE_M, caster.z + d.z * LINE_M, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        add(i, ((field.x(i) - caster.x) * d.x + (field.z(i) - caster.z) * d.z) / SPREAD_MPS.line, caster.x, caster.z);
      }
      points.push(dense);
      break;
    }
    case "path": {
      // Across the field (world x: left to right on the play camera) through the densest group.
      const n = field.inCapsule(dense.x - PATH_HALF_M, dense.z, dense.x + PATH_HALF_M, dense.z, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        add(i, (field.x(i) - (dense.x - PATH_HALF_M)) / SPREAD_MPS.path, field.x(i), dense.z + (field.z(i) >= dense.z ? -1 : 1));
      }
      points.push(dense);
      break;
    }
    case "sweep":
    case "cone": {
      const d = toward(caster);
      const facing = Math.atan2(d.z, d.x);
      const half = skill.shape === "cone" ? CONE_HALF : Math.PI / 2;
      anchor = caster;
      const n = field.inCircle(caster.x, caster.z, r, scratch);
      for (let k = 0; k < n; k += 1) {
        const i = scratch[k]!;
        let a = Math.atan2(field.z(i) - caster.z, field.x(i) - caster.x) - facing;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > half) continue;
        const delay = skill.shape === "sweep" ? ((a + half) / (2 * half)) * SWEEP_S : Math.hypot(field.x(i) - caster.x, field.z(i) - caster.z) / SPREAD_MPS.cone;
        add(i, delay, caster.x, caster.z);
      }
      points.push(dense);
      break;
    }
  }
  // A spread starts at the beast it reaches first.
  const first = hits.reduce((m, h) => Math.min(m, h.delay), Infinity);
  if (Number.isFinite(first) && first > 0) for (const h of hits) h.delay -= first;
  hits.sort((a, b) => a.delay - b.delay || a.i - b.i);
  return { anchor, points, hits };
}

/** The lab's side of a cast: the same hit path as keys 0–7. */
export interface ClipSkillHost {
  readonly targets: TargetField;
  /** The layer its ground marks join. */
  readonly layer: THREE.Object3D;
  /** The lab's flipbooks (an element's mark clip is taken from its library when that element is loaded). */
  readonly player: FlipbookPlayer;
  caster(out: THREE.Vector3): void;
  /** The cast, on the key's frame (the release event). */
  release(skill: ClipSkill, at: THREE.Vector3): void;
  /** One blow on beast `i` through the lab's hit path (the herd's hit, the impact event, the numbers); true: it killed. */
  blow(skill: ClipSkill, i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** A strike landing at `at`: the screen's impact at the skill's tier (its hit-stop and shake), the kick, the light. */
  strike(skill: ClipSkill, at: THREE.Vector3, role: ImpactRole, colour: string): void;
  /** On beast `i`: the element's rim for `seconds`, and held (stun, bind) or slowed (null: the rim only). */
  status(i: number, kind: ClipStatus | null, seconds: number, rim: FoeStatusKind, colour: string): void;
}

/** What the last cast did, for __lab.clipSkill (seconds after the key). */
export interface ClipCastReport {
  readonly id: string;
  readonly shape: ClipShape;
  readonly points: number;
  readonly targets: number;
  /** The clip's spawn, each strike (the clip showing its strike frame), the first blow landed; −1: not yet. */
  clipAt: number;
  strikeAt: number[];
  readonly strikeFrames: readonly number[];
  firstBlowAt: number;
  blows: number;
  kills: number;
  marks: number;
}

interface Running {
  readonly skill: ClipSkill;
  t: number;
  /** When its clip spawns (s after the key) and the strikes' times on the clip's own clock. */
  readonly clipAt: number;
  readonly times: readonly number[];
  clipped: boolean;
  readonly anchor: THREE.Vector3;
  readonly aim: ClipAim;
  /** Each strike's time on the cast's clock once the clip is out. */
  readonly beats: { at: number; role: ImpactRole; done: boolean }[];
  readonly hits: { at: number; i: number; dx: number; dz: number; power: number; role: ImpactRole; first: boolean }[];
  next: number;
  readonly colour: string;
  readonly report: ClipCastReport;
}

const c = new THREE.Vector3();
const m = new THREE.Vector3();
const markAt = new THREE.Vector3();

export class ClipSkillRunner {
  private readonly table: ReadonlyMap<string, ClipSkill>;
  private readonly running: Running[] = [];
  private readonly marks: GroundMarks;
  /** The last cast's report. */
  last: ClipCastReport | null = null;

  constructor(private readonly showcase: Showcase, private readonly host: ClipSkillHost, rows: readonly ClipSkill[] = KEY8_SKILLS, private readonly nav = KEY8_NAV) {
    this.table = new Map(rows.map((r) => [r.id, r]));
    this.marks = new GroundMarks(host.layer, host.player);
  }

  /** The row of clip `id`, if the table has one. */
  skill(id: string): ClipSkill | undefined {
    return this.table.get(id);
  }

  /** Shift+8: selects the next item and names it (its stats on the caption); its element's mark clip starts loading. */
  selectNext(): string | null {
    const id = this.showcase.next();
    if (id !== null) this.preview(id);
    return id;
  }

  select(id: string): void {
    this.showcase.select(id);
    this.preview(id);
  }

  private preview(id: string): void {
    const s = this.table.get(id);
    if (s !== undefined) this.marks.prepare(s.element);
    this.showcase.caption(id, s !== undefined ? describeClipSkill(s) : undefined, s !== undefined ? this.nav : undefined);
  }

  /** Casts `id` (none: the selected item, else the first) on the herd; what it cast, or null. A clip without a row plays as a video only. */
  cast(id?: string): string | null {
    const pick = id ?? this.showcase.current() ?? this.showcase.ids()[0];
    if (pick === undefined || !this.showcase.has(pick)) return null;
    const skill = this.table.get(pick);
    if (skill === undefined) return this.showcase.play(pick);
    this.showcase.select(pick);
    this.marks.prepare(skill.element);
    this.host.caster(c);
    this.showcase.centre(m);
    const aim = aimClipSkill(skill, this.host.targets, c, m);
    const peakFrame = this.showcase.peakOf(pick);
    const frames = skill.strikes.map((s) => (s.frame === "peak" ? peakFrame : s.frame));
    const times = frames.map((f) => this.showcase.timeOf(pick, f));
    // A blow from the sky is marked first: the clip waits until its first strike comes MARK_S after the key.
    const lead = skill.mark ? Math.max(0, MARK_S - times[0]!) : 0;
    const colour = this.showcase.item(pick).light;
    const report: ClipCastReport = {
      id: pick, shape: skill.shape, points: aim.points.length, targets: aim.hits.length, clipAt: -1, strikeAt: [], strikeFrames: frames,
      firstBlowAt: -1, blows: 0, kills: 0, marks: 0,
    };
    // Its marks: on the ground from the key (a mark) or from the first strike (a linger), eroding after it.
    if (skill.mark || skill.linger > 0) {
      const size = skill.shape === "field" ? 6 : Math.max(2.4, skill.radius * 2.2);
      const from = skill.mark ? 0 : lead + times[0]!;
      const life = lead + times[0]! - from + Math.max(0.4, skill.linger);
      for (const p of aim.points) if (this.marks.spawn(skill.element, p.x, p.z, size, from, life)) report.marks += 1;
    }
    const run: Running = {
      skill, t: 0, clipAt: lead, times, clipped: false, anchor: new THREE.Vector3(aim.anchor.x, 0, aim.anchor.z), aim, beats: [], hits: [], next: 0,
      colour, report,
    };
    this.host.release(skill, run.anchor);
    this.running.push(run);
    this.last = report;
    if (lead === 0) this.spawnClip(run, 0);
    return pick;
  }

  /** Its clip out now, its strikes on the clip's clock from `t0` (the cast's clock when the clip's age is 0). */
  private spawnClip(r: Running, t0: number): void {
    r.clipped = true;
    r.report.clipAt = t0;
    const it = this.showcase.item(r.skill.id);
    // A pillar or a beast stands on its point; a field scene over the screen's centre.
    this.showcase.play(r.skill.id, { at: it.place === "foe" || it.place === "foes" ? r.anchor : undefined, feel: false, detail: describeClipSkill(r.skill), nav: this.nav });
    r.times.forEach((time, k) => {
      const role: ImpactRole = k === 0 ? "primary" : "secondary";
      r.beats.push({ at: t0 + time, role, done: false });
      r.report.strikeAt.push(t0 + time);
      const power = r.skill.strikes[k]!.power;
      for (const h of r.aim.hits) r.hits.push({ at: t0 + time + h.delay, i: h.i, dx: h.dx, dz: h.dz, power, role, first: k === 0 });
    });
    r.hits.sort((a, b) => a.at - b.at || a.i - b.i);
  }

  /** On world time (a hit-stop holds it, as it holds the clip): spawns, strikes, blows; the marks age. */
  update(dt: number): void {
    this.marks.update(dt);
    for (let k = this.running.length - 1; k >= 0; k -= 1) {
      const r = this.running[k]!;
      r.t += dt;
      // Spawned inside this frame, the clip ages by this frame's step with the other flipbooks: its clock starts a step back.
      if (!r.clipped && r.t >= r.clipAt - 1e-6) this.spawnClip(r, r.t - dt);
      for (const b of r.beats) {
        if (b.done || r.t < b.at - 1e-6) continue;
        b.done = true;
        this.host.strike(r.skill, r.anchor, b.role, r.colour);
      }
      while (r.next < r.hits.length && r.hits[r.next]!.at <= r.t + 1e-6) {
        const h = r.hits[r.next]!;
        r.next += 1;
        if (!this.host.targets.alive(h.i)) continue;
        const killed = this.host.blow(r.skill, h.i, h.dx, h.dz, h.power, h.role);
        if (r.report.firstBlowAt < 0) r.report.firstBlowAt = r.t;
        r.report.blows += 1;
        if (killed) r.report.kills += 1;
        else if (h.first) {
          const st = r.skill.status;
          this.host.status(h.i, st?.kind ?? null, st?.seconds ?? RIM_S, RIM[r.skill.element], r.colour);
        }
      }
      if (r.clipped && r.next >= r.hits.length && r.beats.every((b) => b.done)) this.running.splice(k, 1);
    }
  }

  /** An element's mark clip from memory (tests; the lab loads its atlas). */
  adoptMark(folder: string, meta: FlipbookMeta, texture: THREE.Texture): void {
    this.marks.adopt(folder, meta, texture);
  }

  /** Casts still landing. */
  get active(): number {
    return this.running.length;
  }

  clear(): void {
    this.running.length = 0;
    this.marks.clear();
  }
}

/** An atlas as the flipbook library loads one (sRGB, mipmapped, straight alpha). */
async function atlas(url: string): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.premultiplyAlpha = false;
  return texture;
}

/**
 * Each element's ground mark (its folder's `groundMark` clip, laid flat): only that atlas, loaded on the element's first
 * use (or taken from its library when the element is on), never the whole folder. Its own pools, aged by the runner.
 */
class GroundMarks {
  private readonly group = new THREE.Group();
  private readonly pools = new Map<string, FlipbookPool | null>();
  private readonly blank: THREE.DataTexture;
  private readonly o: FlipOptions = {};

  constructor(layer: THREE.Object3D, private readonly player: FlipbookPlayer) {
    this.group.name = "fx-clip-skill-marks";
    layer.add(this.group);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.blank.needsUpdate = true;
  }

  /** Starts loading `folder`'s mark clip (once). */
  prepare(folder: string): void {
    if (this.pools.has(folder)) return;
    this.pools.set(folder, null);
    void this.load(folder).catch((error: unknown) => console.warn("[clip-skills] no ground mark for " + folder, error));
  }

  private async load(folder: string): Promise<void> {
    if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
    const base = this.player.base + folder + "/";
    const response = await fetch(base + "manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    const metas = [...parseFlipbookManifest(await response.json(), base).values()];
    const meta = metas.find((x) => x.role === "groundMark" && x.layer !== "body");
    if (meta === undefined) return;
    const known = this.player.loaded(folder).includes(meta.id) ? this.player.library(folder).get(meta.id) : null;
    this.adopt(folder, known?.meta ?? meta, known?.texture ?? (await atlas(meta.url)));
  }

  /** `folder`'s mark clip, from its atlas (or from memory: tests). */
  adopt(folder: string, meta: FlipbookMeta, texture: THREE.Texture): void {
    const pool = new FlipbookPool(meta.id, meta.mode, 24, 4, this.blank);
    pool.attach(meta, texture);
    layFlat(pool);
    pool.softM = 0.25;
    this.group.add(pool.mesh);
    this.pools.set(folder, pool);
  }

  /** A mark of `folder` at (x, z), `size` m across, shown from `delay` s for `life` s, eroding over its last part. */
  spawn(folder: string, x: number, z: number, size: number, delay: number, life: number): boolean {
    const pool = this.pools.get(folder);
    if (pool === null || pool === undefined || !pool.ready) return false;
    const meta = pool.meta!;
    const o = this.o;
    for (const k of Object.keys(o) as (keyof FlipOptions)[]) delete o[k];
    o.frame = meta.start;
    o.rate = (meta.frames - meta.start) / (meta.fps * life);
    o.life = life;
    o.delay = delay;
    o.fadeIn = 0.06;
    o.cool = 0.55;
    o.occlude = 0.35;
    o.span = size;
    o.lift = 0.05;
    o.rot = ((x * 7.13 + z * 3.71) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    pool.spawn(markAt.set(x, 0.04, z), size, o);
    return true;
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) pool?.update(dt);
  }

  clear(): void {
    for (const pool of this.pools.values()) pool?.clear();
  }
}
