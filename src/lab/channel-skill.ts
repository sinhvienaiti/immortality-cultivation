/**
 * The typing-sustained channel (canon D61; docs/work/tasks/channel-skill.md; the "Claude kiểm và chốt" table of
 * docs/work/consult/streak-channel-gemini.md): key C in the lab, its own key for now (slot 3 stays Hồi Kiếm Hộ Thân).
 * C opens a narrow stream from the caster's hand into the nearest beast; every word typed after it feeds it (any key 0–7,
 * or C again): one pulse and four ticks over WORD_S, each times the word's grade (flash 1.25, perfect 1.10, good 1,
 * fair 0.9), the damage per word so slow and fast typists are even. It breaks only on a SLOPPY word (Shift+C in the lab)
 * or a pause longer than max(IDLE_S, 2 × the typist's key interval); between words a thin strand stays, doing nothing.
 * When its beast dies it swings to the nearest within SWING_M. It ends in a slow erosion (COLLAPSE_S).
 * Built from the element's own clips (no new art): the stream is the element's ribbon clip, else its crescent's energy
 * band, flowing toward the beast, ≤ 1 m wide and ≤ 0.6 of its light over the beasts (word tags stay on top); each pulse
 * is the kit's own impact on the beast (else the folder's impact clip), the start the kit's release at the hand.
 */
import * as THREE from "three";
import { CrescentTrail, type TrailMatter } from "../view/skills/crescent-trail";
import { crescentMatter } from "../view/skills/element-clips";
import type { ElementHooks, ElementKit } from "../view/skills/element-kit";
import type { ElementStage } from "../view/skills/element-stage";
import type { FlipOptions } from "../view/skills/flipbook";
import type { TargetField } from "../view/skills/targets";
import type { WeaponGlow } from "../view/skills/weapons";
import type { Grade } from "../content/types";

/** Flow a word adds (s), its ticks, the most flow kept ahead (s). */
export const WORD_S = 0.9;
export const TICKS = 4;
const MAX_FLOW_S = 6 * WORD_S;
/** The longest pause it survives (s, or twice the typist's key interval when longer), its collapse (s). */
export const IDLE_S = 2.5;
export const COLLAPSE_S = 0.7;
/** A dead beast's stream swings to the nearest within this (m) over SWING_S; a first target within REACH_M. */
const SWING_M = 6;
const SWING_S = 0.15;
const REACH_M = 22;
/** The stream's width flowing and as an idle strand (m), its light (≤ 0.6 over the beasts), its pulse's added light. */
const FLOW_W = 0.85;
const STRAND_W = 0.3;
const GAIN = 0.5;
const PULSE_GAIN = 0.1;
/** A pulse's and a tick's power (the herd's), times the word's grade. */
const PULSE_POWER = 0.55;
const TICK_POWER = 0.2;
/** Word grades' weights (canon §6.5); SLOPPY breaks it. */
export const GRADE_K: Readonly<Record<Exclude<Grade, "sloppy">, number>> = { flash: 1.25, perfect: 1.1, good: 1, ok: 0.9 };

export interface ChannelHost {
  readonly targets: TargetField;
  readonly stage: ElementStage;
  readonly camera: THREE.Camera;
  readonly layer: THREE.Object3D;
  kit(): ElementKit;
  pal(): WeaponGlow;
  /** The caster's hand and ground pose. */
  hand(out: THREE.Vector3): void;
  caster(out: THREE.Vector3): void;
  /** The typist's key interval now (s; the lab: from its WPM). */
  keyInterval(): number;
  /** The start (the release event). */
  release(at: THREE.Vector3): void;
  /** A pulse (primary) or a tick (secondary) on beast `i` through the lab's hit path; true: it killed. */
  blow(i: number, dx: number, dz: number, power: number, pulse: boolean): boolean;
  /** The element's status on a struck beast. */
  status(i: number): void;
}

/** What the channel did (__lab.channel). */
export interface ChannelReport {
  active: boolean;
  element: string;
  words: number;
  pulses: number;
  ticks: number;
  kills: number;
  swings: number;
  /** Why it ended ("" running): "sloppy", "idle", "no-target". */
  ended: string;
  /** Seconds since it started, at its last word's pulse and at its end. */
  lastPulseAt: number;
  endedAt: number;
}

const hand = new THREE.Vector3();
const tgt = new THREE.Vector3();
const from = new THREE.Vector3();
const c = new THREE.Vector3();

export class ChannelSkill {
  private on = false;
  private t = 0;
  private target = -1;
  /** Where the stream ends now (it swings between beasts) and where it swings from. */
  private readonly end = new THREE.Vector3();
  private readonly swingFrom = new THREE.Vector3();
  private swingT = 1;
  /** When the last word came (s), the queued ticks' times (s) and grades, the flow left (s). */
  private lastWord = 0;
  private ticks: { at: number; k: number }[] = [];
  private pulseGlow = 0;
  private readonly pts = Array.from({ length: 14 }, () => new THREE.Vector3());
  private trail: CrescentTrail | null = null;
  private trailOf = "";
  report: ChannelReport = { active: false, element: "", words: 0, pulses: 0, ticks: 0, kills: 0, swings: 0, ended: "", lastPulseAt: -1, endedAt: -1 };

  constructor(private readonly host: ChannelHost) {}

  get active(): boolean {
    return this.on;
  }

  private hooks(): ElementHooks {
    return this.host.stage.hooksOf(this.host.kit());
  }

  /** The stream's matter: the element's ribbon clip, else its crescent's energy band (remade when the element changes). */
  private stream(): CrescentTrail | null {
    const folder = this.host.kit().id;
    if (this.trail !== null && this.trailOf === folder) return this.trail;
    const player = this.host.stage.flipbooks;
    const lib = player.library(folder);
    const ids = player.loaded(folder);
    const meta = (id: string | undefined) => (id === undefined ? undefined : lib.get(id) ?? undefined);
    const ribbon = meta(ids.find((x) => lib.get(x)?.meta.role === "ribbon" && lib.get(x)?.meta.layer !== "body"));
    const crescent = meta(ids.find((x) => x === folder + "-crescent-sym") ?? ids.find((x) => lib.get(x)?.meta.role === "slash" && lib.get(x)?.meta.layer !== "body"));
    let matter: TrailMatter | null = null;
    const r = this.host.kit().ramp;
    if (ribbon !== undefined) {
      const m = ribbon.meta;
      matter = { map: ribbon.texture, cols: m.cols, rows: m.rows, frames: m.frames, fps: m.fps, colours: "clip", core: r.core, edge: r.edge, body: r.body, blend: "add", across: 0.7 };
    } else if (crescent !== undefined) matter = crescentMatter(crescent.meta, crescent.texture, r);
    if (matter === null) return null;
    this.trail?.mesh.removeFromParent();
    this.trail = new CrescentTrail(matter, 10, 60, { beam: true, fadeS: COLLAPSE_S });
    this.host.layer.add(this.trail.mesh);
    this.trailOf = folder;
    return this.trail;
  }

  /** The nearest live beast to (x, z) within `r` m, skipping `skip`. */
  private nearest(x: number, z: number, r: number, skip = -1): number {
    return this.host.targets.nearest(x, z, r, skip);
  }

  /** C: opens the stream on the nearest beast (it counts as the first word), or feeds a word if it runs. */
  start(grade: Grade = "perfect"): boolean {
    if (this.on) return this.feed(grade);
    this.host.caster(c);
    const i = this.nearest(c.x, c.z - 4, REACH_M);
    if (i < 0) return false;
    this.on = true;
    this.t = 0;
    this.target = i;
    this.ticks = [];
    this.lastWord = 0;
    const T = this.host.targets;
    this.end.set(T.x(i), T.midY(i), T.z(i));
    this.swingT = 1;
    this.report = { active: true, element: this.host.kit().id, words: 0, pulses: 0, ticks: 0, kills: 0, swings: 0, ended: "", lastPulseAt: -1, endedAt: -1 };
    this.host.hand(hand);
    this.host.release(this.end);
    // The start at the hand: the kit's release (its clip), small.
    this.hooks().sword?.release?.({ slot: "k1", skill: "channel", tier: 1, size: 0.7, intensity: 0.8, ringM: 1.2, at: this.end, hand, caster: { x: c.x, z: c.z, fx: 0, fz: -1 }, pal: this.host.pal() });
    return this.feed(grade);
  }

  /** A word typed while it runs: a pulse now and four ticks over WORD_S (a SLOPPY word breaks it). */
  feed(grade: Grade): boolean {
    if (!this.on) return false;
    if (grade === "sloppy") {
      this.stop("sloppy");
      return false;
    }
    const k = GRADE_K[grade as keyof typeof GRADE_K] ?? 1;
    this.lastWord = this.t;
    this.report.words += 1;
    this.pulse(PULSE_POWER * k);
    // Its ticks after the ticks already queued (the flow it adds), at most MAX_FLOW_S ahead.
    const after = Math.max(this.t, this.ticks.at(-1)?.at ?? this.t);
    if (after - this.t < MAX_FLOW_S) for (let n = 1; n <= TICKS; n += 1) this.ticks.push({ at: after + (n * WORD_S) / (TICKS + 1), k });
    return true;
  }

  /** A pulse (a word's): its blow, the kit's impact on the beast, the stream's light up a moment. */
  private pulse(power: number): void {
    const i = this.aim();
    if (i < 0) return;
    this.strike(i, power, true);
    this.report.pulses += 1;
    this.report.lastPulseAt = this.t;
    this.pulseGlow = 1;
    const T = this.host.targets;
    tgt.set(T.x(i), T.midY(i), T.z(i));
    this.host.caster(c);
    const dx = T.x(i) - c.x;
    const dz = T.z(i) - c.z;
    const l = Math.hypot(dx, dz) || 1;
    if (this.hooks().sword?.impact?.({ slot: "k1", at: tgt, scale: 0.8, dx: dx / l, dz: dz / l, power, big: false, pal: this.host.pal() }) !== true) this.fallbackImpact(tgt);
  }

  private strike(i: number, power: number, pulse: boolean): void {
    const T = this.host.targets;
    this.host.caster(c);
    const dx = T.x(i) - c.x;
    const dz = T.z(i) - c.z;
    const l = Math.hypot(dx, dz) || 1;
    const killed = this.host.blow(i, dx / l, dz / l, power, pulse);
    if (killed) this.report.kills += 1;
    else if (pulse) this.host.status(i);
    if (pulse) return;
    this.report.ticks += 1;
  }

  /** Its beast: the one it has, else (dead) the nearest within SWING_M of where it stood, swung to over SWING_S. */
  private aim(): number {
    const T = this.host.targets;
    if (this.target >= 0 && T.alive(this.target)) return this.target;
    const next = this.nearest(this.end.x, this.end.z, SWING_M, this.target);
    if (next < 0) return -1;
    this.swingFrom.copy(this.end);
    this.swingT = 0;
    this.target = next;
    this.report.swings += 1;
    return next;
  }

  /** Without the kit's impact: the folder's impact (or burst) clip, small. */
  private fallbackImpact(at: THREE.Vector3): void {
    const folder = this.host.kit().id;
    const player = this.host.stage.flipbooks;
    const lib = player.library(folder);
    const id = player.loaded(folder).find((x) => {
      const m = lib.get(x)?.meta;
      return m !== undefined && m.layer !== "body" && (m.role === "impact" || m.role === "burst");
    });
    if (id === undefined) return;
    const pool = player.pool(folder, id);
    const m = pool.meta;
    if (m === null) return;
    const peak = Math.max(m.start + 1, m.peak ?? m.start + 2);
    const o: FlipOptions = { frame: m.start, rate: (peak - m.start) / (m.fps * 0.05), slowFrom: peak, slowRate: (m.frames - peak) / (m.fps * 0.6), lift: 0.5, ground: 0 };
    pool.spawn(from.copy(at), 1.4, o);
  }

  private stop(why: string): void {
    if (!this.on) return;
    this.on = false;
    this.ticks = [];
    this.report.active = false;
    this.report.ended = why;
    this.report.endedAt = this.t;
  }

  /** World time: ticks, the pause that ends it, the stream laid from the hand to its beast (or eroding away). */
  update(dt: number): void {
    const tr = this.on ? this.stream() : this.trail;
    if (this.on) {
      this.t += dt;
      // Its ticks due now.
      while (this.ticks.length > 0 && this.ticks[0]!.at <= this.t + 1e-6) {
        const tick = this.ticks.shift()!;
        const i = this.aim();
        if (i >= 0) this.strike(i, TICK_POWER * tick.k, false);
      }
      // A pause longer than max(IDLE_S, twice the key interval) ends it; so does a beast it cannot find.
      if (this.t - this.lastWord > Math.max(IDLE_S, 2 * this.host.keyInterval()) && this.ticks.length === 0) this.stop("idle");
      else if (this.aim() < 0) this.stop("no-target");
    }
    if (this.on && tr !== null) {
      const T = this.host.targets;
      const i = this.target;
      if (i >= 0 && T.alive(i)) tgt.set(T.x(i), T.midY(i), T.z(i));
      else tgt.copy(this.end);
      this.swingT = Math.min(1, this.swingT + dt / SWING_S);
      this.end.lerpVectors(this.swingFrom, tgt, this.swingT < 1 ? this.swingT * this.swingT * (3 - 2 * this.swingT) : 1);
      if (this.swingT >= 1) this.end.copy(tgt);
      this.host.hand(hand);
      // A gentle arc from the hand to the beast, the matter leaving the hand.
      const n = this.pts.length;
      const len = hand.distanceTo(this.end);
      for (let k = 0; k < n; k += 1) {
        const u = k / (n - 1);
        this.pts[k]!.lerpVectors(hand, this.end, u).setY(hand.y + (this.end.y - hand.y) * u + Math.sin(u * Math.PI) * Math.min(1.2, len * 0.06));
      }
      const flowing = this.ticks.length > 0 || this.t - this.lastWord < 0.25;
      tr.lay(this.pts, flowing ? FLOW_W : STRAND_W);
      this.pulseGlow = Math.max(0, this.pulseGlow - dt / 0.3);
      tr.gain = (flowing ? GAIN : GAIN * 0.6) + PULSE_GAIN * this.pulseGlow;
    }
    tr?.update(dt, this.host.camera);
  }

  reset(): void {
    this.on = false;
    this.ticks = [];
    this.trail?.clear();
    this.report.active = false;
  }
}
