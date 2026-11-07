/** Lab-only painted foe reactions. Playback, pivot, blending and KTX2 belong to the existing flipbook kit. */
import * as THREE from "three";
import { FlipbookPlayer, ONE_FRAME, type FlipbookLibrary, type FlipbookMeta, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";
import type { DeathEvent, ImpactEvent } from "./events";

export interface FoePose {
  target: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  beastTier: number;
  species?: string;
  serial?: number;
  elite?: boolean;
  hpFraction?: number;
  groundY?: number;
}
export interface FoeSource {
  alive(target: number): boolean;
  pose(target: number, out: FoePose): void;
  /** Optional live-scene enumeration, including empty slots. No temporary arrays. */
  auraCount?(): number;
  auraTarget?(index: number): number;
}
export interface FoeClip { readonly folder: string; readonly id: string; readonly delay: number }
const clip = (folder: string, id: string, delay = 0): FoeClip => ({ folder, id, delay });
const RAT = clip("beast", "death-rat-stone-dust");
const WOLF = clip("beast", "death-wolf-wind-wisps");
const BOAR = clip("beast", "death-boar-iron-flakes");
const CROW = clip("beast", "death-crow-ember-ash");
const APE = clip("beast", "death-ape-rock-crumble");
const COMMON = clip("beast", "beast-death-ink-smoke");
const BOSS = [clip("boss", "boss-death-explosion-r2"), clip("boss", "boss-death-ink-smoke-ring", 0.15), clip("boss", "boss-spirit-ascend", 0.4)] as const;
const DEATHS: Readonly<Record<string, readonly FoeClip[]>> = {
  "thach-thu": [RAT], "phong-lang": [WOLF], "thiet-giap-tru": [BOAR], "hoa-nha": [CROW], "nham-vien": [APE],
};
const FALLBACK = [COMMON] as const;
const LIGHT = clip("beast", "beast-hit-spark-burst");
const DIRECTIONAL = clip("beast", "beast-hit-ink-streak");
const HEAVY = clip("beast", "beast-hit-heavy-ink-burst");
const STUN = clip("beast", "stagger-stars-loop");
const BREAK = clip("beast", "posture-break-shatter");
const BIND = clip("mech", "mech-seal-net-bind");
const IRONHIDE = clip("boss", "elite-aura-ironhide-loop");
const GROUND = clip("boss", "captain-aura-ground-loop");
const FRENZY = clip("boss", "boss-frenzy-aura-loop");
const ROAR = clip("boss", "boss-phase-roar-shockwave");
const FLARE = clip("boss", "boss-phase-aura-flare");
const VORTEX = clip("boss", "boss-entrance-vortex");
const FOG = clip("boss", "boss-entrance-fog");
export const FOE_AURA_CLIPS: readonly FoeClip[] = [IRONHIDE, GROUND, FRENZY, ROAR, FLARE, VORTEX, FOG];
export const FOE_CLIPS: readonly FoeClip[] = [RAT, WOLF, BOAR, CROW, APE, COMMON, ...BOSS, LIGHT, DIRECTIONAL, HEAVY, STUN, BREAK, BIND, ...FOE_AURA_CLIPS];
export function deathClips(species: string | undefined, tier: number): readonly FoeClip[] {
  if (species === "thiet-boi-lang-vuong" && tier >= 4) return BOSS;
  return (species !== undefined && Object.hasOwn(DEATHS, species) ? DEATHS[species] : undefined) ?? FALLBACK;
}
export function hitClip(damage?: string, directional = false): FoeClip {
  return damage === "heavy" || damage === "ult" ? HEAVY : directional ? DIRECTIONAL : LIGHT;
}
export function oldDeathFx(search: string): boolean { return new URLSearchParams(search).get("deathfx") === "old"; }
export function foeAuraEnabled(search: string): boolean { return new URLSearchParams(search).get("foeaura") !== "0"; }

interface Atlas {
  readonly clip: FoeClip;
  lib: FlipbookLibrary | null;
  pool: FlipbookPool | null;
  loading: boolean;
  retryAt: number;
  used: number;
  busy: number;
}
interface Pending<T> { readonly event: T; readonly pose: FoePose; rank: number }
export interface FoeFxOptions {
  readonly player?: FlipbookPlayer;
  readonly sound?: (id: "boss-entrance-roar" | "boss-phase2-roar" | "boss-phase-shockwave" | "elite-reveal-aura", x: number) => void;
  readonly legacy?: (event: DeathEvent, painted: boolean) => void;
  /** Squared distance to the centre in screen space. */
  readonly priority?: (pose: FoePose) => number;
}

interface Status {
  active: boolean;
  kind: "stun" | "bind";
  target: number;
  start: number;
  end: number;
  readonly pose: FoePose;
  breakPending: boolean;
}
interface Aura {
  active: boolean;
  stopped: boolean;
  seen: number;
  boss: boolean;
  rank: number;
  start: number;
  phaseAt: number;
  phased: boolean;
  hp: number;
  readonly pose: FoePose;
  readonly entrance: FoePose;
  readonly phase: FoePose;
}
const pose = (): FoePose => ({ target: -1, x: 0, y: 0, z: 0, radius: 0.5, beastTier: 0 });

export class FoeFlipbookFx {
  readonly player: FlipbookPlayer;
  private readonly atlases: Atlas[] = FOE_CLIPS.map((c) => ({ clip: c, lib: null, pool: null, loading: false, retryAt: 0, used: 0, busy: 0 }));
  private readonly statuses: Status[] = Array.from({ length: 12 }, () => ({ active: false, kind: "stun", target: -1, start: 0, end: 0, pose: pose(), breakPending: false }));
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly ink = new THREE.Color(0.045, 0.05, 0.065);
  private readonly options: FlipOptions = { frame: 0, life: 0, delay: 0, rate: 1, fadeOut: 0, dir: null, occlude: 0, lift: 0.02 };
  private readonly auraOptions: FlipOptions = { frame: 0, life: ONE_FRAME, delay: 0, rate: 0, fadeOut: 0, dir: null, occlude: 0, lift: 0, ground: -1e5, intensity: 0.45 };
  // A new target warms its snapshots once; stable crowds reuse all states and the eight ranking slots.
  private readonly auras = new Map<number, Aura>();
  private readonly auraSlots: Aura[] = [];
  private readonly elites: (Aura | null)[] = Array(8).fill(null);
  private auraFrame = 0;
  private time = 0;
  private readonly deaths: Pending<DeathEvent>[] = Array.from({ length: 10 }, () => ({ event: { kind: "death", target: -1, x: 0, y: 0, z: 0, dx: 0, dz: -1, rgb: 0xffffff, beastTier: 0 }, pose: pose(), rank: 0 }));
  private readonly hits: Pending<ImpactEvent>[] = Array.from({ length: 8 }, () => ({ event: { kind: "impact", slot: "", tier: "basic", role: "primary", target: -1, x: 0, y: 0, z: 0, dx: 0, dz: -1, power: 0, killed: false, material: "flesh", rgb: 0xffffff, beastTier: 0 }, pose: pose(), rank: 0 }));
  private deathN = 0;
  private hitN = 0;
  private deathStart = -1;
  private hitStart = -1;
  private bossN = 0;
  private readonly legacy: (event: DeathEvent, painted: boolean) => void;
  private readonly priority: (p: FoePose) => number;
  private readonly sound: NonNullable<FoeFxOptions["sound"]>;
  readonly old: boolean;
  readonly aurasEnabled: boolean;

  constructor(parent: THREE.Object3D, base: string, private readonly source: FoeSource, search = "", options: FoeFxOptions = {}) {
    this.old = oldDeathFx(search);
    this.aurasEnabled = foeAuraEnabled(search);
    this.player = options.player ?? new FlipbookPlayer(base);
    this.sound = options.sound ?? (() => {});
    this.legacy = options.legacy ?? (() => {});
    this.priority = options.priority ?? ((p) => p.x * p.x + p.z * p.z);
    this.player.group.name = "fx-foe-flipbooks";
    parent.add(this.player.group);
  }

  private atlas(c: FoeClip): Atlas {
    for (let i = 0; i < this.atlases.length; i += 1) {
      const a = this.atlases[i]!;
      if (a.clip.id === c.id) return a;
    }
    throw new Error("Unknown foe clip: " + c.id);
  }

  /** The existing library defers every atlas; only this requested id is fetched, with its PNG fallback. */
  prepare(c: FoeClip): void {
    if (FOE_AURA_CLIPS.includes(c) ? !this.aurasEnabled : this.old) return;
    const a = this.atlas(c);
    a.used = this.time;
    if (this.time < a.retryAt || a.loading || (a.pool !== null && !a.lib!.deferred(c.id))) return;
    a.loading = true;
    a.retryAt = this.time + 1;
    const lib = a.lib ?? (a.lib = this.player.library(c.folder, () => true));
    void lib.load().then(async () => {
      const entry = lib.get(c.id);
      if (entry === null) return;
      if (!(await lib.fetchAtlas(c.id))) return;
      // Mode must be chosen after the manifest arrives: the player's early default is RGBA.
      a.pool ??= this.player.pool(c.folder, c.id, { mode: entry.meta.mode, capacity: 1100, renderOrder: FOE_AURA_CLIPS.includes(c) ? 1 : 13 });
      a.used = this.time;
      a.retryAt = 0;
    }).catch((error: unknown) => console.warn("[foe-flipbook] " + c.id, error)).finally(() => { a.loading = false; });
  }

  /** Tests: attach an atlas through the same library and pool used by the lab. */
  adopt(c: FoeClip, meta: FlipbookMeta, texture: THREE.Texture): void {
    const a = this.atlas(c);
    a.lib = this.player.library(c.folder, () => true);
    a.lib.add(meta, texture);
    a.pool = this.player.pool(c.folder, c.id, { mode: meta.mode, capacity: 1100, renderOrder: FOE_AURA_CLIPS.includes(c) ? 1 : 13 });
    a.used = this.time;
  }

  private ready(c: FoeClip): boolean {
    this.prepare(c);
    const a = this.atlas(c);
    return a.pool !== null && a.pool.ready && !a.lib!.deferred(c.id);
  }

  private draw(c: FoeClip, p: FoePose, dx = 0, dz = 0): boolean {
    if (!this.ready(c)) return false;
    const a = this.atlas(c), pool = a.pool!, meta = pool.meta!;
    const o = this.options;
    o.frame = meta.start;
    o.life = (meta.frames - meta.start) / meta.fps;
    o.delay = c.delay;
    o.rate = 1;
    o.tint = meta.mode === "smoke" ? this.ink : undefined;
    o.dir = c === DIRECTIONAL ? this.dir.set(dx, 0, dz) : null;
    this.at.set(p.x, p.y, p.z);
    // size is HEIGHT in the kit: divide by aspect to make the width 1.5 × body diameter.
    pool.spawn(this.at, p.radius * 3 / meta.aspect, o);
    a.used = this.time;
    a.busy = Math.max(a.busy, this.time + o.life + c.delay);
    return true;
  }

  death(e: DeathEvent, p: FoePose): boolean {
    this.stop(e.target, p.serial);
    if (this.old) return false;
    const clips = deathClips(p.species, e.beastTier);
    let ready = true;
    for (const c of clips) if (!this.ready(c)) ready = false;
    // Keep the complete old death on a cold/failed atlas rather than hiding its body layers.
    if (!ready) return false;
    for (const c of clips) this.draw(c, p);
    return true;
  }

  impact(e: ImpactEvent, p: FoePose): boolean {
    if (this.old) return false;
    return this.draw(hitClip(e.damage, e.directional), p, e.dx, e.dz);
  }

  /** Retains the best candidates in a fixed 50 ms bucket; the reused bus event is copied now. */
  queueDeath(e: DeathEvent, p: FoePose): void {
    this.stop(e.target, p.serial);
    if (this.old) { this.legacy(e, false); return; }
    if (this.deathStart >= 0 && this.time - this.deathStart >= 0.05 - 1e-6) this.flushDeaths();
    if (this.deathStart < 0) this.deathStart = this.time;
    // A king's explosion must start on its death frame. Reserve its place ahead of the ordinary bucket.
    if (p.species === "thiet-boi-lang-vuong" && e.beastTier >= 4 && this.bossN < 10) {
      const painted = this.death(e, p);
      this.legacy(e, painted);
      if (painted) {
        this.bossN += 1;
        if (this.deathN > 10 - this.bossN) this.legacy(this.deaths[--this.deathN]!.event, false);
      }
      return;
    }
    for (const c of deathClips(p.species, e.beastTier)) this.prepare(c);
    this.deathN = this.offer(this.deaths, this.deathN, 10 - this.bossN, e, p, true);
  }

  queueImpact(e: ImpactEvent, p: FoePose): void {
    if (this.old) return;
    if (this.hitStart >= 0 && this.time - this.hitStart >= 0.05 - 1e-6) this.flushHits();
    if (this.hitStart < 0) this.hitStart = this.time;
    this.prepare(hitClip(e.damage, e.directional));
    this.hitN = this.offer(this.hits, this.hitN, 8, e, p, false);
  }

  private offer<T extends DeathEvent | ImpactEvent>(slots: Pending<T>[], n: number, cap: number, e: T, p: FoePose, death: boolean): number {
    const rank = this.priority(p);
    let at = 0;
    while (at < n && (slots[at]!.pose.beastTier > p.beastTier || (slots[at]!.pose.beastTier === p.beastTier && slots[at]!.rank <= rank))) at += 1;
    if (at >= cap) {
      if (death) this.legacy(e as DeathEvent, false);
      return n;
    }
    if (n === cap && death) this.legacy(slots[n - 1]!.event as DeathEvent, false);
    const slot = slots[Math.min(n, cap - 1)]!;
    for (let i = Math.min(n, cap - 1); i > at; i -= 1) slots[i] = slots[i - 1]!;
    slots[at] = slot;
    Object.assign(slot.event, e);
    if (death) (slot.event as DeathEvent).ink = (e as DeathEvent).ink;
    else { (slot.event as ImpactEvent).damage = (e as ImpactEvent).damage; (slot.event as ImpactEvent).directional = (e as ImpactEvent).directional; }
    Object.assign(slot.pose, p);
    slot.pose.species = p.species;
    slot.pose.serial = p.serial;
    slot.pose.elite = p.elite;
    slot.rank = rank;
    return Math.min(n + 1, cap);
  }

  private flushDeaths(): void {
    for (let i = 0; i < this.deathN; i += 1) {
      const s = this.deaths[i]!;
      this.legacy(s.event, this.death(s.event, s.pose));
    }
    this.deathN = this.bossN = 0;
    this.deathStart = -1;
  }

  private flushHits(): void {
    for (let i = 0; i < this.hitN; i += 1) {
      const s = this.hits[i]!;
      this.impact(s.event, s.pose);
    }
    this.hitN = 0;
    this.hitStart = -1;
  }

  status(target: number, kind: "stun" | "bind", seconds: number): void {
    if (this.old) return;
    let s: Status | undefined;
    for (const x of this.statuses) if (x.active && x.target === target && x.kind === kind) { s = x; break; }
    if (seconds <= 0) {
      if (s) s.active = false;
      return;
    }
    if (!this.source.alive(target)) return;
    if (s) { s.end = Math.max(s.end, this.time + seconds); return; }
    for (const x of this.statuses) if (!x.active) { s = x; break; }
    if (!s) return;
    s.active = true;
    s.kind = kind;
    s.target = target;
    s.start = this.time;
    s.end = this.time + seconds;
    this.source.pose(target, s.pose);
    this.prepare(kind === "stun" ? STUN : BIND);
    s.breakPending = kind === "stun" && (s.pose.elite ?? s.pose.beastTier >= 2);
    if (s.breakPending && this.draw(BREAK, s.pose)) s.breakPending = false;
  }

  stop(target: number, serial?: number): void {
    for (const s of this.statuses) if (s.active && s.target === target && (serial === undefined || s.pose.serial === serial)) s.active = false;
    const a = this.auras.get(target);
    if (a?.active && (serial === undefined || a.pose.serial === serial)) {
      a.active = false;
      a.stopped = true;
      // Death events can arrive after update: remove this body's sprites on that very frame.
      this.renderAuras();
      for (const c of FOE_AURA_CLIPS) this.atlas(c).pool?.update(0);
    }
  }

  private updateAuras(): void {
    if (!this.aurasEnabled || !this.source.auraCount || !this.source.auraTarget) return;
    this.auraFrame += 1;
    this.elites.fill(null);
    const count = this.source.auraCount();
    for (let i = 0; i < count; i += 1) {
      const target = this.source.auraTarget(i);
      let a = this.auras.get(target);
      if (!this.source.alive(target)) {
        if (a) { a.active = false; a.stopped = false; }
        continue;
      }
      if (!a) {
        a = { active: false, stopped: false, seen: 0, boss: false, rank: 0, start: 0, phaseAt: -1, phased: false, hp: 1, pose: pose(), entrance: pose(), phase: pose() };
        this.auras.set(target, a);
        this.auraSlots.push(a);
      }
      const serial = a.pose.serial;
      this.source.pose(target, a.pose);
      const p = a.pose;
      if (serial !== p.serial) { a.active = false; a.stopped = false; }
      a.seen = this.auraFrame;
      a.boss = p.species === "thiet-boi-lang-vuong" && p.beastTier >= 4;
      const elite = p.species === "thiet-giap-tru" && p.beastTier === 2 && p.elite !== false;
      if ((!a.boss && !elite) || a.stopped) { a.active = false; continue; }
      const hp = p.hpFraction ?? 1;
      if (!a.active) {
        a.active = true;
        this.sound(a.boss ? "boss-entrance-roar" : "elite-reveal-aura", p.x);
        a.start = this.time;
        a.phaseAt = -1;
        a.phased = false;
        a.hp = hp;
        Object.assign(a.entrance, p);
        if (a.boss) for (const c of FOE_AURA_CLIPS) if (c !== IRONHIDE) this.prepare(c);
      }
      if (a.boss && !a.phased && a.hp > 0.5 && hp <= 0.5) {
        a.phased = true;
        this.sound("boss-phase2-roar", p.x);
        this.sound("boss-phase-shockwave", p.x);
        a.phaseAt = this.time;
        Object.assign(a.phase, p);
      }
      a.hp = hp;
      if (a.boss) {
        // Keep the upcoming threshold's atlases warm, even if the boss takes >20 s to reach it.
        if (!a.phased && hp > 0.5) { this.prepare(FRENZY); this.prepare(ROAR); this.prepare(FLARE); }
        continue; // Boss layers never compete with elite slots.
      }
      a.rank = this.priority(p);
      let at = 0;
      while (at < 8 && this.elites[at] !== null && this.elites[at]!.rank <= a.rank) at += 1;
      if (at === 8) continue;
      for (let j = 7; j > at; j -= 1) this.elites[j] = this.elites[j - 1]!;
      this.elites[at] = a;
    }
    for (const a of this.auraSlots) if (a.seen !== this.auraFrame) { a.active = false; a.stopped = false; }
    this.renderAuras();
  }

  private renderAuras(): void {
    if (!this.aurasEnabled) return;
    for (const c of FOE_AURA_CLIPS) this.atlas(c).pool?.clear();
    for (const a of this.elites) if (a?.active) this.drawAura(IRONHIDE, a.pose, this.time - a.start, true);
    for (const a of this.auraSlots) {
      if (!a.active || !a.boss) continue;
      this.drawAura(GROUND, a.pose, this.time - a.start, true);
      if (a.hp <= 0.5) this.drawAura(FRENZY, a.pose, this.time - a.start, true);
      this.drawAura(VORTEX, a.entrance, this.time - a.start, false);
      this.drawAura(FOG, a.entrance, this.time - a.start, false);
      if (a.phaseAt >= 0) {
        this.drawAura(ROAR, a.phase, this.time - a.phaseAt, false);
        this.drawAura(FLARE, a.pose, this.time - a.phaseAt, false);
      }
    }
  }

  private drawAura(c: FoeClip, p: FoePose, age: number, loop: boolean): void {
    // Expired one-shots must not request their atlas again after the 20 s idle release.
    const a = this.atlas(c);
    const known = a.lib?.get(c.id)?.meta;
    if (!loop && known && age >= (known.frames - known.start) / known.fps) return;
    if (!this.ready(c)) return;
    const pool = a.pool!, m = pool.meta!;
    const frames = m.frames - m.start;
    if (!loop && age >= frames / m.fps) return;
    const o = this.auraOptions;
    o.frame = m.start + (loop ? age * m.fps % frames : age * m.fps);
    o.tint = m.mode === "smoke" ? this.ink : undefined;
    // Even overlapping entrance + phase layers total <0.9 per RGB channel on one boss.
    o.intensity = c === IRONHIDE ? 0.45 : c === FRENZY ? 0.3 : 0.12;
    // Depth-only negative lift puts the art behind the opaque model, without shifting its projection.
    o.lift = c === VORTEX ? -0.02 : -Math.max(0.1, p.radius);
    const ground = c === GROUND || c === ROAR || c === VORTEX || c === FOG;
    const height = p.radius * (c === VORTEX ? 3.5 : ground ? 4 : 3) / m.aspect;
    // The portal is upright, unlike the ground auras. Its bottom meets the birth floor
    // at the lab's 55-degree camera; a centred billboard at y=0 buries half its art.
    const y = c === VORTEX
      ? (p.groundY ?? 0) + 0.04 + height * (1 - m.pivot[1]) * Math.cos(55 * Math.PI / 180)
      : ground ? p.groundY ?? 0 : p.y;
    this.at.set(p.x, y, p.z);
    pool.spawn(this.at, height, o);
    a.used = a.busy = this.time;
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    if (this.deathStart >= 0 && this.time - this.deathStart >= 0.05 - 1e-6) this.flushDeaths();
    if (this.hitStart >= 0 && this.time - this.hitStart >= 0.05 - 1e-6) this.flushHits();
    this.updateAuras();
    // Rebuild just the two status pools from retained slots: exact cancellation, no individual sprite handles.
    this.atlas(STUN).pool?.clear();
    this.atlas(BIND).pool?.clear();
    for (const s of this.statuses) {
      if (!s.active) continue;
      if (this.time + 1e-6 >= s.end || !this.source.alive(s.target)) { s.active = false; continue; }
      const serial = s.pose.serial;
      this.source.pose(s.target, s.pose);
      if (serial !== s.pose.serial) { s.active = false; continue; }
      if (s.breakPending && this.draw(BREAK, s.pose)) s.breakPending = false;
      const c = s.kind === "stun" ? STUN : BIND;
      if (!this.ready(c)) continue;
      const a = this.atlas(c), pool = a.pool!, m = pool.meta!;
      const age = (this.time - s.start) * m.fps;
      const o = this.options;
      o.frame = s.kind === "stun" ? m.start + age % (m.frames - m.start) : Math.min(m.frames - 1, m.start + age);
      o.life = ONE_FRAME;
      o.delay = 0;
      o.rate = 0;
      o.tint = undefined;
      o.dir = null;
      this.at.set(s.pose.x, s.pose.y + (s.kind === "stun" ? s.pose.y * 0.82 + 0.2 : 0), s.pose.z);
      pool.spawn(this.at, s.pose.radius * 3 / m.aspect, o);
      a.used = this.time;
      a.busy = s.end;
    }
    this.player.update(dt);
    for (const a of this.atlases) {
      if (a.pool === null || a.loading || a.lib!.deferred(a.clip.id)) continue;
      if (this.time - Math.max(a.used, a.busy) >= 20) {
        a.pool.clear();
        a.lib!.release(a.clip.id);
      }
    }
  }

  get activeStatuses(): number {
    let n = 0;
    for (const s of this.statuses) if (s.active) n += 1;
    return n;
  }

  clear(): void {
    for (const s of this.statuses) s.active = false;
    for (const a of this.auraSlots) { a.active = false; a.stopped = false; }
    this.elites.fill(null);
    this.deathN = this.hitN = this.bossN = 0;
    this.deathStart = this.hitStart = -1;
    this.player.clear();
  }
}
