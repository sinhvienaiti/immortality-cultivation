/**
 * The Kiếm school's skill VFX in five phases (VFX_STANDARD §3: charge while
 * typing, release at the caster ≤ 50 ms after the last key, travel, impact,
 * aftermath), after docs/games/tu-tien/skills/SKILL_CATALOG.md K0–K5 and the
 * canon hit ticks (§12.1: Phi Kiếm +18, Ngự Kiếm +6/+36/+66, Nhất Tuyến +12,
 * Lạc Kiếm Trận opens +12 then a beat every 30, Thiên Hà Kiếm Vũ
 * +30/+75/+120). Kiếm colours: cold silver, ivory, a very pale steel blue
 * (canon D54); ink for hits, ink smoke and spirit motes for deaths. View
 * only: hits shown here are the lab's stand-ins for sim events.
 */
import * as THREE from "three";
import { BladeSet } from "./blades";
import { clamp01, easeInCubic, easeOutCubic, easeOutQuad, GroundSigil, pulse, Rand, RibbonPool, SpritePool } from "./fxkit";
import type { TargetField } from "./targets";

export type KiemSlot = "auto" | "k1" | "k2" | "guard" | "dash" | "k4" | "k5";

export interface KiemTextures {
  readonly glow: THREE.Texture; // soft round light
  readonly flare: THREE.Texture; // bright lens flare
  readonly star: THREE.Texture; // four-point star
  readonly spark: THREE.Texture; // thin spark
  readonly trace: THREE.Texture; // streak
  readonly slash: THREE.Texture; // crescent slash
  readonly mote: THREE.Texture; // small round dot
  readonly smoke: THREE.Texture; // soft smoke puff
  readonly splash: THREE.Texture; // ragged ink splash
  readonly scorch: THREE.Texture; // ground ink stain
  readonly ring: THREE.Texture; // thin ring
}

export interface KiemHost {
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly targets: TargetField;
  /** Caster position and facing (unit) on the ground. */
  caster(out: { x: number; z: number; fx: number; fz: number }): void;
  /** The casting hand (world). */
  hand(out: THREE.Vector3): void;
  flash(at: THREE.Vector3, colour: string, intensity: number): void;
  /** Camera kick in px along the ground direction (dx, dz). */
  impulse(px: number, dx: number, dz: number): void;
  hitStop(ms: number): void;
  moveCaster(x: number, z: number): void;
  play(clip: "attack" | "skill1" | "skill2" | "ult" | "dash" | "idle"): void;
}

/** HDR colours (linear). Cores 3–6 bloom; halos ≤ 0.9 do not (LESSONS §5). */
const CORE = [3.4, 3.3, 3.0] as const;
const HALO = [0.6, 0.7, 0.86] as const;
const STEEL = [0.78, 0.84, 0.92] as const;
const INK = [0.045, 0.05, 0.065] as const;
const SMOKE = [0.1, 0.11, 0.13] as const;
const MOTE = [2.6, 2.5, 2.2] as const;

/** Canon §12.1 hit ticks in seconds (60 Hz). */
const TICK = 1 / 60;
const T_AUTO_HIT = 18 * TICK;
const T_K1_HITS = [6 * TICK, 36 * TICK, 66 * TICK] as const;
const T_K2_HIT = 12 * TICK;
const T_K4_OPEN = 12 * TICK;
const T_K4_BEAT = 30 * TICK;
const T_K4_LIFE = 5;
const T_K5_HITS = [30 * TICK, 75 * TICK, 120 * TICK] as const;

const BLADE_CAP = 360;
const HERO = { k1: 0, k2: 3, guard: 4, k4: 7, auto: 13, halo: 16 } as const; // reserved hero blade slots
const HALO_N = 24;
const POOL0 = HERO.halo + HALO_N; // first blade of the K5 pool

interface Flight {
  active: boolean;
  blade: number;
  ribbon: number;
  t: number;
  dur: number;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  arc: number;
  target: number;
  pierce: number;
  power: number;
  fade: number; // > 0 while the blade fades after the hit
  sx: number;
  sy: number;
  sz: number;
}

export class KiemFx {
  readonly blades: BladeSet;
  private readonly glow: SpritePool;
  private readonly flare: SpritePool;
  private readonly star: SpritePool;
  private readonly spark: SpritePool;
  private readonly trace: SpritePool;
  private readonly bladeGlow: SpritePool;
  private readonly slash: SpritePool;
  private readonly motes: SpritePool;
  private readonly smoke: SpritePool;
  private readonly splash: SpritePool;
  private readonly groundInk: SpritePool;
  private readonly groundRing: SpritePool;
  private readonly ribbons: RibbonPool;
  private readonly sigHex: GroundSigil;
  private readonly sigSpiral: GroundSigil;
  private readonly sigArcs: GroundSigil;
  private readonly sigLine: GroundSigil;
  private readonly sigArrow: GroundSigil;
  private readonly rand = new Rand(1301);
  private readonly c = { x: 0, z: 0, fx: 0, fz: -1 };
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly hits = new Int32Array(128);
  private readonly flights: Flight[] = [];
  private ribbonCursor = 0;
  private time = 0;
  private readonly poolN: number;

  // Charge state per slot (typing progress 0..1, -1 idle).
  private charge: Record<KiemSlot, number> = { auto: -1, k1: -1, k2: -1, guard: -1, dash: -1, k4: -1, k5: -1 };
  private chargeShown: Record<KiemSlot, number> = { auto: 0, k1: 0, k2: 0, guard: 0, dash: 0, k4: 0, k5: 0 };
  private chargeTarget = { x: 0, z: -8 };

  // Running skills.
  private k1 = { active: false, t: 0, launched: 0, tx: 0, tz: 0 };
  private k2 = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, dx: 0, dz: 0, hit: false, ribbon: 0 };
  private guard = { active: false, t: 0, charges: 0, spin: 0, blockT: [-1, -1, -1], blockX: [0, 0, 0], blockZ: [0, 0, 0] };
  private dash = { active: false, t: 0, ax: 0, az: 0, bx: 0, bz: 0, ghosts: 0, ribbon: 0 };
  private k4 = { active: false, t: 0, x: 0, z: 0, beats: 0, landed: false };
  private k5 = { active: false, t: 0, x: 0, z: 0, wave: 0, done: false };

  constructor(
    private readonly host: KiemHost,
    tex: KiemTextures,
    quality: "low" | "medium" | "high" | "ultra",
  ) {
    this.poolN = quality === "low" ? 150 : quality === "medium" ? 300 : 300;
    this.blades = new BladeSet(BLADE_CAP, 1.1);
    const L = host.layer;
    this.groundInk = new SpritePool(160, tex.scorch, "ink", "ground", 4);
    this.groundRing = new SpritePool(48, tex.ring, "add", "ground", 6);
    this.smoke = new SpritePool(240, tex.smoke, "ink", "camera", 8);
    this.splash = new SpritePool(120, tex.splash, "ink", "camera", 9);
    this.glow = new SpritePool(160, tex.glow, "add", "camera", 11);
    this.slash = new SpritePool(64, tex.slash, "add", "camera", 12);
    this.trace = new SpritePool(400, tex.trace, "add", "camera", 12);
    this.bladeGlow = new SpritePool(720, tex.trace, "add", "camera", 12);
    this.spark = new SpritePool(600, tex.spark, "add", "camera", 13);
    this.motes = new SpritePool(300, tex.mote, "add", "camera", 13);
    this.star = new SpritePool(96, tex.star, "add", "camera", 14);
    this.flare = new SpritePool(48, tex.flare, "add", "camera", 15);
    this.ribbons = new RibbonPool(40, 18, tex.trace);
    this.sigHex = new GroundSigil("hex", 7.2, 7.2, "#9fb2cc", "#ffffff");
    this.sigSpiral = new GroundSigil("spiral", 13.5, 13.5, "#a7b6cc", "#ffffff");
    this.sigArcs = new GroundSigil("arcs", 4.8, 4.8, "#a9b8c8", "#ffffff");
    this.sigLine = new GroundSigil("line", 14, 1.8, "#b3c2d6", "#ffffff");
    this.sigArrow = new GroundSigil("arrow", 5, 0.9, "#b3c2d6", "#ffffff");
    L.add(
      this.sigHex.mesh,
      this.sigSpiral.mesh,
      this.sigArcs.mesh,
      this.sigLine.mesh,
      this.sigArrow.mesh,
      this.groundInk.mesh,
      this.groundRing.mesh,
      this.smoke.mesh,
      this.splash.mesh,
      this.blades.mesh,
      this.glow.mesh,
      this.slash.mesh,
      this.trace.mesh,
      this.bladeGlow.mesh,
      this.ribbons.mesh,
      this.spark.mesh,
      this.motes.mesh,
      this.star.mesh,
      this.flare.mesh,
    );
    for (let i = 0; i < 24; i += 1) {
      this.flights.push({ active: false, blade: 0, ribbon: 0, t: 0, dur: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, target: -1, pierce: -1, power: 0, fade: 0, sx: 0, sy: 0, sz: 0 });
    }
  }

  /** Reset every running effect (lab: before a capture). */
  reset(): void {
    this.blades.hideAll();
    for (const f of this.flights) f.active = false;
    for (let i = 0; i < 40; i += 1) this.ribbons.stop(i);
    for (const p of [this.glow, this.flare, this.star, this.spark, this.trace, this.bladeGlow, this.slash, this.motes, this.smoke, this.splash, this.groundInk, this.groundRing]) p.clear();
    for (const s of [this.sigHex, this.sigSpiral, this.sigArcs, this.sigLine, this.sigArrow]) s.hide();
    this.k1.active = this.k2.active = this.guard.active = this.dash.active = this.k4.active = this.k5.active = false;
    for (const k of Object.keys(this.charge) as KiemSlot[]) {
      this.charge[k] = -1;
      this.chargeShown[k] = 0;
    }
    this.rand.reseed(1301);
  }

  // ── Typing → charge ──────────────────────────────────────────────────────

  /** Typing progress of the word on `slot` (0 first key … 1 last key); −1 cancels. `tx, tz`: where it will land. */
  setCharge(slot: KiemSlot, progress: number, tx = 0, tz = -8): void {
    const before = this.charge[slot];
    this.charge[slot] = progress;
    this.chargeTarget.x = tx;
    this.chargeTarget.z = tz;
    if (progress >= 0 && progress > before) this.keyBeat(slot, progress);
  }

  /** One key on a word: a small glint that grows with progress (T0, VFX_STANDARD §3.3). */
  private keyBeat(slot: KiemSlot, p: number): void {
    this.host.hand(this.v);
    const s = this.glow.spec.reset();
    s.x = this.v.x;
    s.y = this.v.y;
    s.z = this.v.z;
    s.life = 0.18;
    s.size0 = 0.35 + 0.35 * p;
    s.size1 = 0.2;
    s.r = HALO[0] * 1.2;
    s.g = HALO[1] * 1.2;
    s.b = HALO[2] * 1.2;
    s.a = 0.8;
    this.glow.emit();
    if (slot === "k1") {
      for (let j = 0; j < 3; j += 1) {
        const th = [0.15, 0.45, 0.75][j]!;
        if (p >= th && this.chargeShown.k1 < th) this.burstMotes(this.k1Socket(j, this.w), 6, 0.6);
      }
      this.chargeShown.k1 = p;
    }
    if (slot === "k4") {
      // Corners of the array light one by one with the word.
      const corners = Math.floor(p * 6 + 1e-6);
      const shown = Math.floor(this.chargeShown.k4 * 6 + 1e-6);
      for (let k = shown; k < corners; k += 1) {
        const th = (k * Math.PI) / 3 + Math.PI / 6;
        this.w.set(this.chargeTarget.x + Math.cos(th) * 3.55, 0.15, this.chargeTarget.z - Math.sin(th) * 3.55);
        this.burstMotes(this.w, 5, 0.5);
      }
      this.chargeShown.k4 = p;
    }
  }

  // ── Release ───────────────────────────────────────────────────────────────

  /** The word's last key: release now (≤ 50 ms), toward (tx, tz). */
  cast(slot: KiemSlot, tx: number, tz: number): void {
    this.charge[slot] = -1;
    this.host.caster(this.c);
    switch (slot) {
      case "auto":
        return this.castAuto();
      case "k1":
        return this.castK1(tx, tz);
      case "k2":
        return this.castK2(tx, tz);
      case "guard":
        return this.castGuard();
      case "dash":
        return this.castDash(tx, tz);
      case "k4":
        return this.castK4(tx, tz);
      case "k5":
        return this.castK5(tx, tz);
    }
  }

  private releaseFlash(size: number, intensity: number, ringM: number): void {
    this.host.hand(this.v);
    const f = this.flare.spec.reset();
    f.x = this.v.x;
    f.y = this.v.y;
    f.z = this.v.z;
    f.life = 0.1;
    f.size0 = size;
    f.size1 = size * 1.3;
    f.r = CORE[0];
    f.g = CORE[1];
    f.b = CORE[2];
    this.flare.emit();
    const g = this.glow.spec.reset();
    g.x = this.v.x;
    g.y = this.v.y;
    g.z = this.v.z;
    g.life = 0.22;
    g.size0 = size * 2.2;
    g.size1 = size * 2.8;
    g.r = HALO[0];
    g.g = HALO[1];
    g.b = HALO[2];
    g.a = 0.75;
    this.glow.emit();
    if (ringM > 0) this.ring(this.c.x, this.c.z, 0.4, ringM, 0.3, 0.55);
    this.host.flash(this.v, "#dfe8ff", intensity);
  }

  private castAuto(): void {
    this.host.play("attack");
    const target = this.host.targets.nearest(this.c.x, this.c.z, 10);
    if (target < 0) return;
    this.host.hand(this.v);
    // From behind the shoulder, a short rise then the dive (lands at +18 ticks).
    const fx = this.c.x - this.c.fx * 0.4;
    const fz = this.c.z - this.c.fz * 0.4;
    this.launch(HERO.auto, fx, 1.7, fz, target, T_AUTO_HIT, 0.9, 0.35, -1, 0.06);
    this.releaseFlash(0.45, 2.5, 0);
  }

  private k1Socket(j: number, out: THREE.Vector3): THREE.Vector3 {
    // Behind the shoulders: left, top, right, in the caster's frame (facing f, right r = (-fz, fx)).
    const rx = -this.c.fz;
    const rz = this.c.fx;
    const side = j === 0 ? -0.62 : j === 1 ? 0 : 0.62;
    const up = j === 1 ? 2.05 : 1.7;
    const back = 0.42;
    this.host.caster(this.c);
    out.set(this.c.x + rx * side - this.c.fx * back, up, this.c.z + rz * side - this.c.fz * back);
    return out;
  }

  private castK1(tx: number, tz: number): void {
    this.host.play("attack");
    this.k1.active = true;
    this.k1.t = 0;
    this.k1.launched = 0;
    this.k1.tx = tx;
    this.k1.tz = tz;
    this.releaseFlash(0.55, 3, 1.6);
    this.k1Launch(0);
  }

  private k1Launch(j: number): void {
    const target = this.host.targets.nearest(this.c.x, this.c.z, 12);
    this.k1Socket(j, this.v);
    this.blades.hide(HERO.k1 + j);
    if (target < 0) {
      this.burstMotes(this.v, 8, 0.8);
      return;
    }
    const pierce = this.host.targets.nearest(this.host.targets.x(target), this.host.targets.z(target), 3, target);
    this.launch(HERO.k1 + j, this.v.x, this.v.y, this.v.z, target, 0.1, 1.0, 0.15, pierce, 0.07);
  }

  private castK2(tx: number, tz: number): void {
    this.host.play("skill1");
    let dx = tx - this.c.x;
    let dz = tz - this.c.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const k = this.k2;
    k.active = true;
    k.t = 0;
    k.hit = false;
    k.ax = this.c.x + dx * 0.6;
    k.az = this.c.z + dz * 0.6;
    k.bx = this.c.x + dx * 14.6;
    k.bz = this.c.z + dz * 14.6;
    k.dx = dx;
    k.dz = dz;
    this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
    this.sigLine.uniforms.uReveal.value = 1;
    this.releaseFlash(0.7, 5, 1.8);
    this.host.impulse(1, dx, dz);
    // The blade-light runs the whole line in 0.2 s (hit at +12 ticks).
    const r = this.nextRibbon();
    this.ribbons.start(r, k.ax, 0.9, k.az, 0.22, STEEL[0] * 2.4, STEEL[1] * 2.4, STEEL[2] * 2.6, 1);
    k.ribbon = r;
  }

  private castGuard(): void {
    this.host.play("skill2");
    const g = this.guard;
    g.active = true;
    g.t = 0;
    g.charges = 3;
    g.spin = 0;
    g.blockT[0] = g.blockT[1] = g.blockT[2] = -1;
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.uniforms.uReveal.value = 1;
    this.releaseFlash(0.6, 3.5, 2.4);
    for (let j = 0; j < 3; j += 1) this.blades.tint(HERO.guard + j, 1, 1, 1);
  }

  /** An enemy blow reaching the Hộ thân ring from (fromX, fromZ): the nearest blade parries. Returns false when no charge is left. */
  block(fromX: number, fromZ: number): boolean {
    const g = this.guard;
    if (!g.active || g.charges <= 0) return false;
    this.host.caster(this.c);
    const ang = Math.atan2(fromZ - this.c.z, fromX - this.c.x);
    // The live blade whose orbit angle is closest to the blow.
    let best = -1;
    let bestD = 9;
    for (let j = 0; j < 3; j += 1) {
      if (g.blockT[j]! >= 0) continue;
      const a = g.spin + (j * Math.PI * 2) / 3;
      let d = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) return false;
    g.blockT[best] = 0;
    g.blockX[best] = this.c.x + Math.cos(ang) * 2.05;
    g.blockZ[best] = this.c.z + Math.sin(ang) * 2.05;
    g.charges -= 1;
    this.v.set(g.blockX[best]!, 1.0, g.blockZ[best]!);
    this.impact(this.v, 1.1, Math.cos(ang), Math.sin(ang), 1.0);
    this.slashAt(this.v, ang + Math.PI / 2, 1.4);
    this.host.flash(this.v, "#e8eeff", 6);
    this.host.hitStop(30);
    return true;
  }

  private castDash(tx: number, tz: number): void {
    this.host.play("dash");
    let dx = tx - this.c.x;
    let dz = tz - this.c.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const d = this.dash;
    d.active = true;
    d.t = 0;
    d.ghosts = 0;
    d.ax = this.c.x;
    d.az = this.c.z;
    d.bx = this.c.x + dx * 5;
    d.bz = this.c.z + dz * 5;
    this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, 5);
    this.sigArrow.uniforms.uReveal.value = 1;
    this.sigArrow.uniforms.uGlow.value = 1.4;
    this.sigArrow.uniforms.uInk.value = 0.5;
    this.sigArrow.uniforms.uFade.value = 1;
    this.releaseFlash(0.5, 2.5, 0);
    this.dust(this.c.x, this.c.z, 4, 0.6);
    const r = this.nextRibbon();
    this.ribbons.start(r, this.c.x, 1.0, this.c.z, 0.35, STEEL[0] * 1.6, STEEL[1] * 1.6, STEEL[2] * 1.8, 1);
    d.ribbon = r;
  }

  private castK4(tx: number, tz: number): void {
    this.host.play("skill2");
    const k = this.k4;
    k.active = true;
    k.t = 0;
    k.beats = 0;
    k.landed = false;
    k.x = tx;
    k.z = tz;
    this.sigHex.place(tx, tz, 0);
    this.sigHex.uniforms.uReveal.value = 1;
    this.releaseFlash(0.6, 3.5, 1.8);
  }

  private castK5(tx: number, tz: number): void {
    this.host.play("ult");
    const k = this.k5;
    k.active = true;
    k.t = 0;
    k.wave = 0;
    k.done = false;
    k.x = tx;
    k.z = tz;
    this.sigSpiral.place(tx, tz, 0);
    this.sigSpiral.uniforms.uReveal.value = 1;
    this.releaseFlash(1.0, 8, 3.2);
    this.host.impulse(2, tx - this.c.x, tz - this.c.z);
    // A stream of light from the caster into the array.
    this.host.hand(this.v);
    for (let i = 0; i < 14; i += 1) {
      const s = this.trace.spec.reset();
      s.x = this.v.x;
      s.y = this.v.y + 0.4;
      s.z = this.v.z;
      const ex = tx + this.rand.range(-3, 3) - s.x;
      const ey = 2.6 - s.y;
      const ez = tz + this.rand.range(-3, 3) - s.z;
      const sp = this.rand.range(0.28, 0.42);
      s.vx = ex / sp;
      s.vy = ey / sp;
      s.vz = ez / sp;
      s.life = sp;
      s.size0 = s.size1 = 0.12;
      s.stretch = 0.06;
      s.aspect = 1;
      s.r = STEEL[0] * 2.2;
      s.g = STEEL[1] * 2.2;
      s.b = STEEL[2] * 2.4;
      this.trace.emit();
    }
  }

  // ── Shared pieces ────────────────────────────────────────────────────────

  private nextRibbon(): number {
    const r = this.ribbonCursor;
    this.ribbonCursor = (this.ribbonCursor + 1) % 40;
    return r;
  }

  private launch(blade: number, fx: number, fy: number, fz: number, target: number, dur: number, power: number, arc: number, pierce: number, width: number): void {
    const f = this.flights.find((q) => !q.active);
    if (!f) return;
    const T = this.host.targets;
    f.active = true;
    f.blade = blade;
    f.ribbon = this.nextRibbon();
    f.t = 0;
    f.dur = dur;
    f.fx = fx;
    f.fy = fy;
    f.fz = fz;
    f.tx = T.x(target);
    f.ty = T.midY(target);
    f.tz = T.z(target);
    f.arc = arc;
    f.target = target;
    f.pierce = pierce;
    f.power = power;
    f.fade = 0;
    f.sx = fx;
    f.sy = fy;
    f.sz = fz;
    this.ribbons.start(f.ribbon, fx, fy, fz, width, STEEL[0] * 2.2, STEEL[1] * 2.2, STEEL[2] * 2.5, 1);
    this.blades.tint(blade, 1.4, 1.45, 1.6);
  }

  private impact(at: THREE.Vector3, scale: number, dx: number, dz: number, power: number): void {
    const st = this.star.spec.reset();
    st.x = at.x;
    st.y = at.y;
    st.z = at.z;
    st.life = 0.1;
    st.size0 = 1.5 * scale;
    st.size1 = 1.9 * scale;
    st.rot = this.rand.range(0, Math.PI);
    st.r = CORE[0];
    st.g = CORE[1];
    st.b = CORE[2];
    this.star.emit();
    const g = this.glow.spec.reset();
    g.x = at.x;
    g.y = at.y;
    g.z = at.z;
    g.life = 0.2;
    g.size0 = 2.2 * scale;
    g.size1 = 2.8 * scale;
    g.r = HALO[0];
    g.g = HALO[1];
    g.b = HALO[2];
    g.a = 0.55;
    this.glow.emit();
    const n = Math.round(4 + 5 * power);
    for (let i = 0; i < n; i += 1) {
      const s = this.spark.spec.reset();
      s.x = at.x;
      s.y = at.y;
      s.z = at.z;
      const a = Math.atan2(dz, dx) + this.rand.range(-1.1, 1.1);
      const sp = this.rand.range(5, 11) * (0.6 + 0.6 * power);
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = this.rand.range(1, 5);
      s.gravity = -12;
      s.drag = 2.5;
      s.life = this.rand.range(0.16, 0.3);
      s.size0 = 0.09;
      s.size1 = 0.05;
      s.stretch = 0.045;
      s.r = CORE[0] * 0.8;
      s.g = CORE[1] * 0.8;
      s.b = CORE[2] * 0.75;
      this.spark.emit();
    }
    // Ink: a splash flung along the blow and a stain on the ground.
    const k = this.splash.spec.reset();
    k.x = at.x + dx * 0.15;
    k.y = at.y;
    k.z = at.z + dz * 0.15;
    k.vx = dx * 2.2;
    k.vz = dz * 2.2;
    k.vy = 0.6;
    k.drag = 4;
    k.life = 0.42;
    k.size0 = 0.9 * scale;
    k.size1 = 1.5 * scale;
    k.rot = this.rand.range(0, 6.28);
    k.r = INK[0];
    k.g = INK[1];
    k.b = INK[2];
    k.a = 0.9;
    this.splash.emit();
    const gi = this.groundInk.spec.reset();
    gi.x = at.x + dx * 0.3;
    gi.y = 0.025;
    gi.z = at.z + dz * 0.3;
    gi.life = 2.6;
    gi.size0 = 0.7 * scale;
    gi.size1 = 1.05 * scale;
    gi.rot = this.rand.range(0, 6.28);
    gi.aspect = 1.4;
    gi.r = INK[0];
    gi.g = INK[1];
    gi.b = INK[2];
    gi.a = 0.5;
    this.groundInk.emit();
  }

  private slashAt(at: THREE.Vector3, rot: number, size: number): void {
    const s = this.slash.spec.reset();
    s.x = at.x;
    s.y = at.y;
    s.z = at.z;
    s.rot = rot;
    s.life = 0.14;
    s.size0 = size;
    s.size1 = size * 1.25;
    s.r = CORE[0] * 0.85;
    s.g = CORE[1] * 0.85;
    s.b = CORE[2] * 0.9;
    this.slash.emit();
  }

  /** A beast hit by Kiếm: impact layers, the field's reaction, death smoke and motes when it falls. */
  private strike(target: number, fromX: number, fromZ: number, power: number, scale: number): void {
    const T = this.host.targets;
    if (!T.alive(target)) return;
    let dx = T.x(target) - fromX;
    let dz = T.z(target) - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.v.set(T.x(target), T.midY(target), T.z(target));
    this.impact(this.v, scale, dx, dz, power);
    if (T.hit(target, dx, dz, power, 0xdfe8ff)) this.death(this.v, dx, dz, T.radius(target));
  }

  private death(at: THREE.Vector3, dx: number, dz: number, radius: number): void {
    for (let i = 0; i < 3; i += 1) {
      const s = this.smoke.spec.reset();
      s.x = at.x + this.rand.range(-0.2, 0.2) + dx * 0.2 * i;
      s.y = at.y * 0.7;
      s.z = at.z + this.rand.range(-0.2, 0.2) + dz * 0.2 * i;
      s.vx = dx * 0.6;
      s.vz = dz * 0.6;
      s.vy = 0.45;
      s.drag = 0.8;
      s.life = this.rand.range(1.0, 1.5);
      s.fadeIn = 0.06;
      s.size0 = radius * 1.4;
      s.size1 = radius * 3.2;
      s.rot = this.rand.range(0, 6.28);
      s.rotV = this.rand.range(-0.6, 0.6);
      s.r = SMOKE[0];
      s.g = SMOKE[1];
      s.b = SMOKE[2];
      s.a = 0.62;
      this.smoke.emit();
    }
    this.burstMotes(at, 4, 1.0);
  }

  private burstMotes(at: THREE.Vector3, n: number, scale: number): void {
    for (let i = 0; i < n; i += 1) {
      const s = this.motes.spec.reset();
      s.x = at.x + this.rand.range(-0.15, 0.15);
      s.y = at.y + this.rand.range(-0.1, 0.2);
      s.z = at.z + this.rand.range(-0.15, 0.15);
      s.vx = this.rand.range(-0.6, 0.6) * scale;
      s.vz = this.rand.range(-0.6, 0.6) * scale;
      s.vy = this.rand.range(1.0, 2.4) * scale;
      s.drag = 1.4;
      s.life = this.rand.range(0.6, 1.1);
      s.size0 = 0.07;
      s.size1 = 0.03;
      s.r = MOTE[0];
      s.g = MOTE[1];
      s.b = MOTE[2];
      this.motes.emit();
    }
  }

  private ring(x: number, z: number, r0: number, r1: number, life: number, alpha: number): void {
    const s = this.groundRing.spec.reset();
    s.x = x;
    s.y = 0.04;
    s.z = z;
    s.life = life;
    s.size0 = r0 * 2;
    s.size1 = r1 * 2;
    s.r = HALO[0] * 1.3;
    s.g = HALO[1] * 1.3;
    s.b = HALO[2] * 1.3;
    s.a = alpha;
    this.groundRing.emit();
  }

  private dust(x: number, z: number, n: number, size: number): void {
    for (let i = 0; i < n; i += 1) {
      const s = this.smoke.spec.reset();
      s.x = x + this.rand.range(-0.3, 0.3);
      s.y = 0.15;
      s.z = z + this.rand.range(-0.3, 0.3);
      s.vx = this.rand.range(-1, 1);
      s.vz = this.rand.range(-1, 1);
      s.vy = 0.3;
      s.drag = 2;
      s.life = 0.7;
      s.size0 = size * 0.6;
      s.size1 = size * 1.6;
      s.rot = this.rand.range(0, 6.28);
      s.r = 0.32;
      s.g = 0.33;
      s.b = 0.34;
      s.a = 0.35;
      this.smoke.emit();
    }
  }

  private placeLine(sig: GroundSigil, x: number, z: number, dx: number, dz: number, length: number): void {
    // Plane x axis along (dx, dz); centre half way.
    sig.place(x + dx * length * 0.5, z + dz * length * 0.5, Math.atan2(-dz, dx));
  }

  /** A light card along every visible blade: steel reads at play-camera size (~1 m = 23 px at 720p). */
  private emitBladeGlows(): void {
    const B = this.blades;
    for (let i = 0; i < BLADE_CAP; i += 1) {
      if (!B.isVisible(i)) continue;
      const hero = i < POOL0;
      const s = this.bladeGlow.spec.reset();
      s.x = B.cx[i]!;
      s.y = B.cy[i]!;
      s.z = B.cz[i]!;
      s.vx = B.tx[i]!;
      s.vy = B.ty[i]!;
      s.vz = B.tz[i]!;
      s.stretch = B.len[i]! * 0.9;
      s.life = 0.02;
      s.size0 = s.size1 = hero ? 0.3 : 0.2;
      s.r = HALO[0] * (hero ? 1.25 : 1.0);
      s.g = HALO[1] * (hero ? 1.25 : 1.0);
      s.b = HALO[2] * (hero ? 1.3 : 1.0);
      s.a = hero ? 0.85 : 0.5;
      this.bladeGlow.emit();
    }
  }

  // ── Per frame ────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.host.caster(this.c);
    for (const s of [this.sigHex, this.sigSpiral, this.sigArcs, this.sigLine, this.sigArrow]) s.tick(dt);
    this.updateCharge(dt);
    this.updateFlights(dt);
    this.updateK1(dt);
    this.updateK2(dt);
    this.updateGuard(dt);
    this.updateDash(dt);
    this.updateK4(dt);
    this.updateK5(dt);
    this.emitBladeGlows();
    for (const p of [this.glow, this.flare, this.star, this.spark, this.trace, this.bladeGlow, this.slash, this.motes, this.smoke, this.splash, this.groundInk, this.groundRing]) p.update(dt);
    this.ribbons.update(dt, this.host.camera);
    this.blades.sync();
  }

  private updateCharge(dt: number): void {
    const bob = Math.sin(this.time * 3.1) * 0.04;
    // K1: three blades behind the shoulders, each appearing at its key.
    const p1 = this.charge.k1;
    if (p1 >= 0 || (this.k1.active && this.k1.launched < 3)) {
      for (let j = 0; j < 3; j += 1) {
        const th = [0.15, 0.45, 0.75][j]!;
        const alive = this.k1.active ? j >= this.k1.launched : p1 >= th;
        if (!alive) continue;
        this.k1Socket(j, this.v);
        const lean = j === 0 ? -0.35 : j === 2 ? 0.35 : 0;
        const rx = -this.c.fz;
        const rz = this.c.fx;
        this.blades.set(HERO.k1 + j, this.v.x, this.v.y - 0.55 + bob, this.v.z, rx * lean - this.c.fx * 0.15, 1, rz * lean - this.c.fz * 0.15, 1.35);
      }
    } else if (!this.k1.active) {
      for (let j = 0; j < 3; j += 1) this.blades.hide(HERO.k1 + j);
    }
    // K2: the line reveals along the ground with the word; the blade lies along it at the hand.
    const p2 = this.charge.k2;
    if (p2 >= 0) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.placeLine(this.sigLine, this.c.x, this.c.z, dx, dz, 14);
      this.sigLine.uniforms.uReveal.value = easeOutQuad(p2);
      this.sigLine.uniforms.uGlow.value = 0.35 + 0.45 * p2;
      this.sigLine.uniforms.uInk.value = 0.15;
      this.sigLine.uniforms.uFade.value = 1;
      this.host.hand(this.v);
      this.blades.set(HERO.k2, this.v.x, this.v.y, this.v.z, dx, 0.05, dz, 1.5);
      this.blades.tint(HERO.k2, 1 + p2 * 0.8, 1 + p2 * 0.85, 1 + p2);
    } else if (!this.k2.active) {
      this.blades.hide(HERO.k2);
    }
    // Hộ thân: the three arcs draw themselves round the caster.
    const pg = this.charge.guard;
    if (pg >= 0) {
      this.sigArcs.place(this.c.x, this.c.z, 0);
      this.sigArcs.uniforms.uReveal.value = pg;
      this.sigArcs.uniforms.uGlow.value = 0.9;
      this.sigArcs.uniforms.uInk.value = 0.3;
      this.sigArcs.uniforms.uFade.value = 1;
      this.sigArcs.uniforms.uCount.value = 3;
    } else if (!this.guard.active) {
      this.sigArcs.hide();
    }
    // Thân pháp: the arrow of the dash.
    const pd = this.charge.dash;
    if (pd >= 0) {
      let dx = this.chargeTarget.x - this.c.x;
      let dz = this.chargeTarget.z - this.c.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.placeLine(this.sigArrow, this.c.x, this.c.z, dx, dz, 5);
      this.sigArrow.uniforms.uReveal.value = pd;
      this.sigArrow.uniforms.uGlow.value = 0.7;
      this.sigArrow.uniforms.uInk.value = 0.2;
      this.sigArrow.uniforms.uFade.value = 1;
    } else if (!this.dash.active) {
      this.sigArrow.hide();
    }
    // Lạc Kiếm Trận: the hexagon at the target, its corners lit one by one.
    const p4 = this.charge.k4;
    if (p4 >= 0) {
      this.sigHex.place(this.chargeTarget.x, this.chargeTarget.z, 0);
      this.sigHex.uniforms.uReveal.value = p4;
      this.sigHex.uniforms.uGlow.value = 0.8;
      this.sigHex.uniforms.uInk.value = 0.35;
      this.sigHex.uniforms.uFade.value = 1;
    } else if (!this.k4.active) {
      this.sigHex.hide();
    }
    // Thiên Hà Kiếm Vũ: the three belts draw on the ground; blades gather in a ring behind the caster.
    const p5 = this.charge.k5;
    if (p5 >= 0) {
      this.sigSpiral.place(this.chargeTarget.x, this.chargeTarget.z, 0);
      this.sigSpiral.uniforms.uReveal.value = p5;
      this.sigSpiral.uniforms.uGlow.value = 0.55 + 0.35 * p5;
      this.sigSpiral.uniforms.uInk.value = 0.55 * p5;
      this.sigSpiral.uniforms.uFade.value = 1;
      this.sigSpiral.uniforms.uCount.value = 0.35;
      const n = Math.round(HALO_N * p5);
      for (let i = 0; i < HALO_N; i += 1) {
        if (i >= n) {
          this.blades.hide(HERO.halo + i);
          continue;
        }
        const a = (i / HALO_N) * Math.PI * 2 + this.time * 0.9;
        const rx = -this.c.fz;
        const rz = this.c.fx;
        const ox = Math.cos(a) * 1.5;
        const oy = Math.sin(a) * 1.5;
        const x = this.c.x + rx * ox - this.c.fx * 0.7;
        const z = this.c.z + rz * ox - this.c.fz * 0.7;
        const y = 2.1 + oy;
        // Blades point outward from the ring's centre, like a mandorla of swords.
        this.blades.set(HERO.halo + i, x, y, z, rx * Math.cos(a), Math.sin(a), rz * Math.cos(a), 0.95);
      }
    } else if (!this.k5.active) {
      for (let i = 0; i < HALO_N; i += 1) this.blades.hide(HERO.halo + i);
    }
    void dt;
  }

  private updateFlights(dt: number): void {
    const T = this.host.targets;
    for (const f of this.flights) {
      if (!f.active) continue;
      if (f.fade > 0) {
        // After the hit: the blade stands a beat in the wound, then folds away.
        f.fade -= dt;
        const k = clamp01(f.fade / 0.22);
        if (k <= 0) {
          this.blades.hide(f.blade);
          this.ribbons.stop(f.ribbon);
          f.active = false;
          continue;
        }
        this.blades.set(f.blade, f.tx, f.ty, f.tz, f.tx - f.sx, -0.4, f.tz - f.sz, 1.25 * k + 0.05);
        this.ribbons.push(f.ribbon, f.tx, f.ty, f.tz);
        this.ribbons.setAlpha(f.ribbon, k);
        continue;
      }
      f.t += dt;
      // Track the target while it moves.
      if (T.alive(f.target)) {
        f.tx = T.x(f.target);
        f.tz = T.z(f.target);
        f.ty = T.midY(f.target);
      }
      const u = clamp01(f.t / f.dur);
      const e = easeInCubic(u) * 0.35 + u * 0.65;
      const x = f.fx + (f.tx - f.fx) * e;
      const z = f.fz + (f.tz - f.fz) * e;
      const y = f.fy + (f.ty - f.fy) * e + Math.sin(u * Math.PI) * f.arc * Math.hypot(f.tx - f.fx, f.tz - f.fz) * 0.15;
      const dx = x - f.sx;
      const dy = y - f.sy;
      const dz = z - f.sz;
      if (dx * dx + dy * dy + dz * dz > 1e-8) this.blades.set(f.blade, x, y, z, dx, dy, dz, 1.3);
      this.ribbons.push(f.ribbon, x, y, z);
      // A thin glow riding the blade.
      if (u < 1) {
        const s = this.trace.spec.reset();
        s.x = x;
        s.y = y;
        s.z = z;
        s.vx = dx / Math.max(dt, 1e-3);
        s.vy = dy / Math.max(dt, 1e-3);
        s.vz = dz / Math.max(dt, 1e-3);
        s.life = 0.05;
        s.size0 = s.size1 = 0.16;
        s.stretch = 0.025;
        s.r = HALO[0];
        s.g = HALO[1];
        s.b = HALO[2];
        s.a = 0.8;
        this.trace.emit();
      }
      f.sx = x;
      f.sy = y;
      f.sz = z;
      if (u >= 1) {
        this.strike(f.target, f.fx, f.fz, f.power, 1);
        if (f.pierce >= 0 && T.alive(f.pierce)) this.strike(f.pierce, f.fx, f.fz, f.power * 0.6, 0.8);
        f.fade = 0.22;
        this.blades.tint(f.blade, 2.4, 2.4, 2.6);
      }
    }
  }

  private updateK1(dt: number): void {
    const k = this.k1;
    if (!k.active) return;
    k.t += dt;
    // Blade j launches 0.1 s before its hit tick.
    while (k.launched < 3 && k.t >= T_K1_HITS[k.launched]! - 0.1) {
      if (k.launched > 0) {
        this.k1Socket(k.launched, this.v);
        const s = this.flare.spec.reset();
        s.x = this.v.x;
        s.y = this.v.y;
        s.z = this.v.z;
        s.life = 0.08;
        s.size0 = 0.4;
        s.size1 = 0.55;
        s.r = CORE[0];
        s.g = CORE[1];
        s.b = CORE[2];
        this.flare.emit();
        this.k1Launch(k.launched);
      }
      k.launched += 1;
    }
    if (k.t > 1.5) k.active = false;
  }

  private updateK2(dt: number): void {
    const k = this.k2;
    if (!k.active) return;
    k.t += dt;
    const ribbon = k.ribbon;
    const u = clamp01(k.t / T_K2_HIT);
    const hx = k.ax + (k.bx - k.ax) * easeOutQuad(u);
    const hz = k.az + (k.bz - k.az) * easeOutQuad(u);
    if (k.t < T_K2_HIT + 0.02) {
      this.ribbons.push(ribbon, hx, 0.9, hz);
      this.blades.set(HERO.k2, hx, 0.9, hz, k.dx, 0, k.dz, 1.7);
      this.blades.tint(HERO.k2, 2.2, 2.2, 2.4);
    }
    // Light on the line: peaks at release, then the line cools into an ink slit.
    const glow = k.t < T_K2_HIT ? 1.6 : 1.6 * (1 - clamp01((k.t - T_K2_HIT) / 0.5));
    this.sigLine.uniforms.uGlow.value = Math.max(0, glow);
    this.sigLine.uniforms.uInk.value = clamp01(k.t / 0.25) * 0.85;
    this.sigLine.uniforms.uFade.value = 1 - clamp01((k.t - 0.9) / 0.5);
    if (!k.hit && k.t >= T_K2_HIT) {
      k.hit = true;
      const n = this.host.targets.inCapsule(k.ax, k.az, k.bx, k.bz, 0.6 + 0.4, this.hits);
      const T = this.host.targets;
      for (let i = 0; i < n; i += 1) {
        const b = this.hits[i]!;
        // Push away from the line, to the side the beast stands on.
        const side = (T.x(b) - k.ax) * -k.dz + (T.z(b) - k.az) * k.dx;
        const sx = -k.dz * Math.sign(side || 1);
        const sz = k.dx * Math.sign(side || 1);
        this.v.set(T.x(b), T.midY(b), T.z(b));
        this.slashAt(this.v, Math.atan2(k.dx, k.dz), 1.1);
        this.strike(b, T.x(b) - sx, T.z(b) - sz, 0.9, 0.9);
      }
      this.host.impulse(1.5, k.dx, k.dz);
      this.host.hitStop(30);
    }
    if (k.t > T_K2_HIT + 0.35) {
      this.blades.hide(HERO.k2);
      this.ribbons.stop(ribbon);
    }
    if (k.t > 1.5) {
      k.active = false;
      this.sigLine.hide();
    }
  }

  private updateGuard(dt: number): void {
    const g = this.guard;
    if (!g.active) return;
    g.t += dt;
    g.spin += dt * 2.3;
    const life = 5;
    // Arrival: the blades drop in from above in 0.15 s.
    const arrive = easeOutCubic(clamp01(g.t / 0.15));
    for (let j = 0; j < 3; j += 1) {
      const bt = g.blockT[j]!;
      if (bt >= 0) {
        g.blockT[j] = bt + dt;
        // The parrying blade snaps to the blow, flares, then breaks into motes.
        if (bt < 0.12) {
          const a = Math.atan2(g.blockZ[j]! - this.c.z, g.blockX[j]! - this.c.x);
          this.blades.set(HERO.guard + j, g.blockX[j]!, 1.0, g.blockZ[j]!, -Math.sin(a), 0.1, Math.cos(a), 1.4);
          this.blades.tint(HERO.guard + j, 3, 3, 3.2);
        } else if (this.blades.isVisible(HERO.guard + j)) {
          this.v.set(g.blockX[j]!, 1.0, g.blockZ[j]!);
          this.burstMotes(this.v, 10, 1.2);
          this.blades.hide(HERO.guard + j);
        }
        continue;
      }
      const a = g.spin + (j * Math.PI * 2) / 3;
      const x = this.c.x + Math.cos(a) * 2.0;
      const z = this.c.z + Math.sin(a) * 2.0;
      const y = 1.0 + (1 - arrive) * 4 + Math.sin(this.time * 2 + j) * 0.05;
      // Tip along the orbit's tangent, flat.
      this.blades.set(HERO.guard + j, x, y, z, -Math.sin(a), 0.0, Math.cos(a), 1.35);
      this.blades.tint(HERO.guard + j, 1.15, 1.2, 1.3);
    }
    this.sigArcs.place(this.c.x, this.c.z, 0);
    this.sigArcs.uniforms.uCount.value = g.charges;
    this.sigArcs.uniforms.uGlow.value = 0.9 + 0.25 * Math.sin(this.time * 4);
    this.sigArcs.uniforms.uInk.value = 0.3;
    const fade = 1 - clamp01((g.t - life + 0.4) / 0.4);
    this.sigArcs.uniforms.uFade.value = fade;
    let settled = true;
    for (let j = 0; j < 3; j += 1) if (g.blockT[j]! >= 0 && g.blockT[j]! <= 0.4) settled = false;
    if (g.t > life || (g.charges <= 0 && g.t > 0.5 && settled)) {
      g.active = false;
      for (let j = 0; j < 3; j += 1) {
        if (this.blades.isVisible(HERO.guard + j)) {
          const a = g.spin + (j * Math.PI * 2) / 3;
          this.v.set(this.c.x + Math.cos(a) * 2, 1, this.c.z + Math.sin(a) * 2);
          this.burstMotes(this.v, 6, 0.8);
          this.blades.hide(HERO.guard + j);
        }
      }
      this.sigArcs.hide();
    }
  }

  private updateDash(dt: number): void {
    const d = this.dash;
    if (!d.active) return;
    d.t += dt;
    const ribbon = d.ribbon;
    const dur = 0.2;
    const u = easeOutCubic(clamp01(d.t / dur));
    const x = d.ax + (d.bx - d.ax) * u;
    const z = d.az + (d.bz - d.az) * u;
    if (d.t <= dur + 0.02) {
      this.host.moveCaster(x, z);
      this.ribbons.push(ribbon, x, 1.0, z);
      // Afterimages: three tall ghosts along the path.
      while (d.ghosts < 3 && d.t >= d.ghosts * 0.06) {
        const s = this.glow.spec.reset();
        s.x = x;
        s.y = 0.95;
        s.z = z;
        s.life = 0.35;
        s.size0 = 2.0;
        s.size1 = 2.1;
        s.aspect = 0.32;
        s.r = HALO[0];
        s.g = HALO[1];
        s.b = HALO[2];
        s.a = 0.55;
        this.glow.emit();
        d.ghosts += 1;
      }
    }
    if (d.t > dur && d.t - dt <= dur) this.dust(d.bx, d.bz, 4, 0.6);
    this.sigArrow.uniforms.uGlow.value = 1.4 * (1 - clamp01((d.t - dur) / 0.3));
    this.sigArrow.uniforms.uInk.value = 0.6;
    this.sigArrow.uniforms.uFade.value = 1 - clamp01((d.t - 0.6) / 0.4);
    if (d.t > 0.45) this.ribbons.stop(ribbon);
    if (d.t > 1.0) {
      d.active = false;
      this.sigArrow.hide();
    }
  }

  private k4Corner(k: number, out: THREE.Vector3): THREE.Vector3 {
    const th = (k * Math.PI) / 3 + Math.PI / 6;
    return out.set(this.k4.x + Math.cos(th) * 3.55, 0, this.k4.z - Math.sin(th) * 3.55);
  }

  private updateK4(dt: number): void {
    const k = this.k4;
    if (!k.active) return;
    k.t += dt;
    const T = this.host.targets;
    // Six blades fall onto the corners and open the array at +12 ticks.
    for (let j = 0; j < 6; j += 1) {
      this.k4Corner(j, this.w);
      const fall = clamp01(k.t / T_K4_OPEN);
      const y = 6 * (1 - easeInCubic(fall)) + 0.55;
      // Leaning inward once stuck.
      const ix = (k.x - this.w.x) * 0.12;
      const iz = (k.z - this.w.z) * 0.12;
      const out = 1 - clamp01((k.t - T_K4_LIFE) / 0.35);
      if (out <= 0) {
        this.blades.hide(HERO.k4 + j);
        continue;
      }
      this.blades.set(HERO.k4 + j, this.w.x, y + (1 - out) * 3, this.w.z, -ix, -1, -iz, 1.7 * out);
      this.blades.tint(HERO.k4 + j, 1.25 + 0.4 * pulse(clamp01((k.t - T_K4_OPEN) / 0.3)), 1.3, 1.45);
    }
    if (!k.landed && k.t >= T_K4_OPEN) {
      k.landed = true;
      for (let j = 0; j < 6; j += 1) {
        this.k4Corner(j, this.w);
        this.w.y = 0.3;
        this.impact(this.w, 0.6, 0, 0, 0.3);
        this.dust(this.w.x, this.w.z, 2, 0.5);
      }
      this.ring(k.x, k.z, 1, 3.6, 0.35, 0.6);
      this.v.set(k.x, 0.5, k.z);
      this.host.flash(this.v, "#dfe8ff", 4);
      this.host.impulse(1, 0, -1);
    }
    // A beat every 30 ticks: slivers of sword-light from the corners through the centre.
    const beatsDue = k.t >= T_K4_OPEN ? Math.min(10, Math.floor((k.t - T_K4_OPEN) / T_K4_BEAT) + 1) : 0;
    while (k.beats < beatsDue) {
      k.beats += 1;
      for (let s = 0; s < 3; s += 1) {
        const from = Math.floor(this.rand.next() * 6);
        this.k4Corner(from, this.w);
        const to = (from + 3) % 6;
        this.k4Corner(to, this.v);
        const sp = this.trace.spec.reset();
        sp.x = this.w.x;
        sp.y = 0.7;
        sp.z = this.w.z;
        const life = 0.18;
        sp.vx = (this.v.x - this.w.x) / life;
        sp.vz = (this.v.z - this.w.z) / life;
        sp.life = life;
        sp.size0 = sp.size1 = 0.2;
        sp.stretch = 0.05;
        sp.r = STEEL[0] * 2.4;
        sp.g = STEEL[1] * 2.4;
        sp.b = STEEL[2] * 2.6;
        this.trace.emit();
      }
      const n = T.inCircle(k.x, k.z, 3.2, this.hits);
      for (let i = 0; i < n; i += 1) {
        const b = this.hits[i]!;
        this.strike(b, k.x, k.z, 0.25, 0.65);
      }
      this.sigHex.uniforms.uGlow.value = 1.6;
    }
    this.sigHex.uniforms.uGlow.value = Math.max(0.8, this.sigHex.uniforms.uGlow.value - dt * 3);
    this.sigHex.uniforms.uInk.value = 0.45;
    this.sigHex.uniforms.uFade.value = 1 - clamp01((k.t - T_K4_LIFE) / 0.6);
    if (k.t > T_K4_LIFE + 0.6) {
      k.active = false;
      this.sigHex.hide();
    }
  }

  private updateK5(dt: number): void {
    const k = this.k5;
    if (!k.active) {
      return;
    }
    k.t += dt;
    const T = this.host.targets;
    const N = this.poolN;
    const rot = k.t * 1.1;
    // Belts: blades spiral over the zone, one third of them dives at each hit tick.
    for (let i = 0; i < N; i += 1) {
      const blade = POOL0 + i;
      const belt = i % 3;
      const phi = ((i * 0.61803) % 1 + 1) % 1;
      const wave = Math.floor((i / N) * 3);
      const hitT = T_K5_HITS[wave]!;
      const appear = clamp01((k.t - phi * 0.25) / 0.2);
      if (appear <= 0) {
        this.blades.hide(blade);
        continue;
      }
      const th = phi * Math.PI * 2 * 0.95 + rot + (belt * Math.PI * 2) / 3;
      const r = 1.1 + 4.6 * phi;
      const bx = k.x + Math.cos(th) * r;
      const bz = k.z + Math.sin(th) * r;
      const by = 3.0 - 1.2 * phi + Math.sin(th * 2 + k.t * 3) * 0.15;
      const dive = clamp01((k.t - (hitT - 0.16)) / 0.16);
      if (dive <= 0) {
        // Tangent of the orbit, nose slightly down.
        this.blades.set(blade, bx, by, bz, -Math.sin(th), -0.25, Math.cos(th), 1.0 * appear);
        continue;
      }
      // Diving to the ground under its belt point, then stuck in it.
      const gx = bx;
      const gz = bz;
      const e = easeInCubic(dive);
      const y = by + (0.35 - by) * e;
      const out = 1 - clamp01((k.t - T_K5_HITS[2]! - 0.75) / 0.4);
      if (out <= 0) {
        this.blades.hide(blade);
        continue;
      }
      this.blades.set(blade, gx, y, gz, -Math.sin(th) * (1 - e) * 0.5, -1, Math.cos(th) * (1 - e) * 0.5, 1.0 * out);
      this.blades.tint(blade, 1.2 + 1.4 * pulse(clamp01((k.t - hitT) / 0.25)), 1.25, 1.4);
    }
    // Waves.
    while (k.wave < 3 && k.t >= T_K5_HITS[k.wave]!) {
      const w = k.wave;
      k.wave += 1;
      // Batched ground impacts: 18 points per wave on the belts.
      for (let s = 0; s < 18; s += 1) {
        const phi = this.rand.next();
        const belt = s % 3;
        const th = phi * Math.PI * 2 * 0.95 + rot + (belt * Math.PI * 2) / 3;
        const r = 1.1 + 4.6 * phi;
        this.v.set(k.x + Math.cos(th) * r, 0.35, k.z + Math.sin(th) * r);
        this.impact(this.v, 0.55, Math.cos(th), Math.sin(th), 0.3);
      }
      const n = T.inCircle(k.x, k.z, 6, this.hits);
      for (let i = 0; i < n; i += 1) {
        const b = this.hits[i]!;
        this.strike(b, k.x, k.z, w === 2 ? 1 : 0.5, w === 2 ? 1.1 : 0.75);
      }
      this.ring(k.x, k.z, 0.8, w === 2 ? 7 : 5, w === 2 ? 0.5 : 0.35, w === 2 ? 0.8 : 0.5);
      this.v.set(k.x, 1.2, k.z);
      this.host.flash(this.v, "#e6eeff", w === 2 ? 12 : 6);
      this.host.impulse(w === 2 ? 4 : 1.5, 0, -1);
      if (w === 2) {
        this.host.hitStop(70);
        const f = this.flare.spec.reset();
        f.x = k.x;
        f.y = 1.0;
        f.z = k.z;
        f.life = 0.14;
        f.size0 = 3.2;
        f.size1 = 4.2;
        f.r = CORE[0];
        f.g = CORE[1];
        f.b = CORE[2];
        this.flare.emit();
      }
    }
    // The belts on the ground glow with each wave and end as a dark ink tri-spiral.
    const lastHit = T_K5_HITS[2]!;
    this.sigSpiral.uniforms.uCount.value = 1.1;
    this.sigSpiral.uniforms.uGlow.value = k.t < lastHit ? 0.9 + 0.6 * pulse(((k.t + 0.1) % 0.75) / 0.75) : 1.2 * (1 - clamp01((k.t - lastHit) / 0.5));
    this.sigSpiral.uniforms.uInk.value = 0.55 + 0.45 * clamp01((k.t - lastHit) / 0.3);
    this.sigSpiral.uniforms.uFade.value = 1 - clamp01((k.t - lastHit - 0.9) / 0.5);
    if (k.t > lastHit + 1.45) {
      k.active = false;
      for (let i = 0; i < N; i += 1) this.blades.hide(POOL0 + i);
      this.sigSpiral.hide();
    }
    // Hide the gathered halo once the belts take over.
    if (k.t < 0.3) {
      const out = 1 - k.t / 0.3;
      for (let i = 0; i < HALO_N; i += 1) {
        if (out <= 0.02) this.blades.hide(HERO.halo + i);
      }
    } else {
      for (let i = 0; i < HALO_N; i += 1) this.blades.hide(HERO.halo + i);
    }
  }
}
