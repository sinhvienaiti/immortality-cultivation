/**
 * Victim tiers (power pass round 3a, P6; the diagnosis of 03/11/2026: "the player's eye only needs several
 * spectacular proof points to believe the whole crowd was devastated"; dev-only lab). Per cast of key 7 or K5:
 * - HERO victims (key 7: at most 7, up to 4 before its finisher at least 0.3 s apart, the rest on the finisher;
 *   K5: at most 6, up to 3 in its first two waves): small and medium beasts on screen and apart from each other. On the blow's frame
 *   a white-cyan silhouette and an 0.4 m shove (herd.heroVictim), a launch with 1.25 turns, and on landing a lead
 *   sword planted through the body (the real sword, its full textured model, 03/11/2026: never a drawn stand-in;
 *   slammed in over 80 ms, held ~1 s, melting into light), a white contact star, a cyan ground ring and an ink
 *   scorch; a kill dissolves after the pin with its death burst then.
 * - SECONDARY victims (every other blow of power ≥ 0.85, a primary or the finisher): a hop shared by every beast
 *   struck on that frame, with the rim flash.
 * - BACKGROUND victims (the river's many light blows): the rim flash, then the dissolve.
 * Impact sound, numbers and the hit flash answer on the blow's frame as before (events.ts). Preallocated; the
 * report for captures (`report`) allocates.
 */
import * as THREE from "three";
import { BladeSet, type SwordModel } from "../view/skills/blades";
import { SpritePool } from "../view/skills/fxkit";
import { FaceRoll } from "../view/skills/sword-material";
import type { ImpactEvent } from "./events";
import type { LabHerd } from "./herd";

/** Heroes per cast, and how many may come before the climax (at least GAP_S apart): key 7 and K5. */
const HEROES = { k7: 7, k5: 6 } as const;
const BEFORE_CLIMAX = { k7: 4, k5: 3 } as const;
const GAP_S = 0.3;
/** A hero keeps this far (m) from the others shown (each must read on its own). */
const APART_M = 2.4;
/** The planted sword: length pommel to tip (m; 3× the hand sword), lean back along the blow (rad), the slam (s), the hold after landing (s), the fade (s). */
const PIN_LEN = 3.06;
const PIN_LEAN = 0.38;
const SLAM_S = 0.08;
const PIN_HOLD_S = 1.05;
const PIN_FADE_S = 0.25;
const PINS = 12;

interface Hero {
  target: number;
  /** Screen point (px at the view's size) at the blow, and the most it has moved from there. */
  sx: number;
  sy: number;
  maxPx: number;
  shovePx: number;
  pinned: boolean;
  at: number;
}

interface Pin {
  active: boolean;
  t: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

/** The pinned swords' rim (the river's cyan, linear) and how deep their tips go into the ground (m). */
const PIN_RIM = [0.03, 0.44, 0.76] as const;
const PIN_DEPTH = 0.35;

export class VictimDirector {
  private readonly swords = new BladeSet(PINS, 1.1, PINS);
  private readonly faces = new FaceRoll();
  private readonly camW = new THREE.Vector3();
  private readonly rings: SpritePool;
  private readonly stars: SpritePool;
  private readonly scorch: SpritePool;
  private readonly pins: Pin[] = [];
  private readonly heroes: Hero[] = [];
  private castSlot = "";
  private castTime = 0;
  private lastHero = -10;
  private before = 0;
  private after = 0;
  private secondary = 0;
  private background = 0;
  private hopFrame = -1;
  private time = 0;
  /** A held kill's blow colour and direction (the death burst plays after the pin). */
  private readonly deathRgb = new Int32Array(128);
  private readonly v = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private readonly herd: LabHerd,
    tex: { readonly ring: THREE.Texture; readonly star: THREE.Texture; readonly scorch: THREE.Texture },
    private readonly camera: THREE.Camera,
    private readonly view: () => { width: number; height: number },
    /** A held kill dissolves now: the host plays its death VFX (x, y, z, blow direction, colour, size class). */
    private readonly onDeath: (x: number, y: number, z: number, dx: number, dz: number, rgb: number, beastTier: number) => void,
  ) {
    this.rings = new SpritePool(PINS * 2, tex.ring, "add", "ground", 6, { twoSided: true });
    this.stars = new SpritePool(PINS * 2, tex.star, "add", "camera", 15);
    this.scorch = new SpritePool(PINS, tex.scorch, "ink", "ground", 4, { fadeIn: 0.04, twoSided: true });
    parent.add(this.scorch.mesh, this.rings.mesh, this.swords.mesh, this.stars.mesh);
    // The real swords cast their shadow on the beast and the stones.
    this.swords.mesh.castShadow = true;
    for (let k = 0; k < PINS; k += 1) this.pins.push({ active: false, t: 0, x: 0, z: 0, dx: 0, dz: -1 });
    herd.onPin = (i, x, z, dx, dz) => this.plant(i, x, z, dx, dz);
    herd.onDie = (i) => {
      this.onDeath(herd.x(i), herd.midY(i), herd.z(i), 0, -1, this.deathRgb[i] ?? 0xffffff, herd.tier(i));
    };
  }

  /** The equipped weapon's full model (blades.ts loadSwordModels). */
  setSword(model: SwordModel): void {
    this.swords.setModel(model);
  }

  /** A release: key 7 and K5 open a cast's budget (other skills keep their own reactions). */
  cast(slot: string): void {
    if (slot !== "k7" && slot !== "k5") return;
    this.castSlot = slot;
    this.castTime = this.time;
    this.lastHero = -10;
    this.before = this.after = 0;
    this.secondary = this.background = 0;
    this.heroes.length = 0;
  }

  /** The blow's frame (after the herd's hit): which tier this victim is, and its reaction. */
  impact(e: ImpactEvent, frame: number): void {
    if (e.slot !== this.castSlot || (e.slot !== "k7" && e.slot !== "k5")) return;
    // K5's blows are all area blows (0.5 a wave, 1 on the last): every one counts; key 7's light river blows do not.
    const big = e.role !== "secondary" || e.power >= (e.slot === "k5" ? 0.5 : 0.85);
    if (!big) {
      this.background += 1;
      return;
    }
    const climax = e.slot === "k7" ? e.power >= 1.1 : e.power >= 1;
    if (this.heroes.length < HEROES[e.slot] && this.wantsHero(e, climax) && this.onScreen(e) && this.apart(e)) {
      if (this.herd.heroVictim(e.target, e.dx, e.dz)) {
        this.deathRgb[e.target] = e.rgb;
        this.v.set(e.x, e.y, e.z).project(this.camera);
        const { width, height } = this.view();
        this.heroes.push({ target: e.target, sx: (this.v.x * 0.5 + 0.5) * width, sy: (-this.v.y * 0.5 + 0.5) * height, maxPx: 0, shovePx: 0, pinned: false, at: this.time - this.castTime });
        this.lastHero = this.time;
        if (climax) this.after += 1;
        else this.before += 1;
        return;
      }
    }
    // A secondary victim: one shared hop with every beast struck on this frame.
    this.herd.hop(e.target);
    this.secondary += 1;
    this.hopFrame = frame;
  }

  private wantsHero(e: ImpactEvent, climax: boolean): boolean {
    if (e.beastTier >= 3 || (e.slot !== "k7" && e.slot !== "k5")) return false;
    if (climax) return this.before + this.after < HEROES[e.slot];
    return this.before < BEFORE_CLIMAX[e.slot] && this.time - this.lastHero >= GAP_S;
  }

  private onScreen(e: ImpactEvent): boolean {
    this.v.set(e.x, e.y, e.z).project(this.camera);
    return this.v.z < 1 && Math.abs(this.v.x) < 0.88 && this.v.y > -0.85 && this.v.y < 0.8;
  }

  private apart(e: ImpactEvent): boolean {
    for (const h of this.heroes) {
      if (!this.herd.isHero(h.target)) continue;
      if (Math.hypot(this.herd.x(h.target) - e.x, this.herd.z(h.target) - e.z) < APART_M) return false;
    }
    return true;
  }

  /** A hero victim landed: a lead sword slams through it into the ground, a contact star, a ring and a scorch. */
  private plant(i: number, x: number, z: number, dx: number, dz: number): void {
    const h = this.heroes.find((q) => q.target === i && !q.pinned);
    if (h !== undefined) h.pinned = true;
    let p = this.pins.find((q) => !q.active);
    if (p === undefined) {
      p = this.pins[0]!;
      for (const q of this.pins) if (q.t > p.t) p = q;
    }
    p.active = true;
    p.t = 0;
    p.x = x;
    p.z = z;
    p.dx = dx;
    p.dz = dz;
    const s = this.stars.spec.reset();
    s.x = x;
    s.y = 0.35;
    s.z = z;
    s.life = 0.1;
    s.size0 = 1.6;
    s.size1 = 0.9;
    s.rot = this.time * 3.1;
    s.r = 2.4;
    s.g = 3.2;
    s.b = 3.6;
    this.stars.emit();
    const r = this.rings.spec.reset();
    r.x = x;
    r.y = 0.05;
    r.z = z;
    r.life = 0.38;
    r.size0 = 0.4;
    r.size1 = 3.0;
    r.r = 0.04 * 0.95;
    r.g = 0.55 * 0.95;
    r.b = 0.95 * 0.95;
    r.a = 0.9;
    this.rings.emit();
    const c = this.scorch.spec.reset();
    c.x = x;
    c.y = 0.02;
    c.z = z;
    c.life = PIN_HOLD_S + PIN_FADE_S + 0.4;
    c.size0 = 1.5;
    c.size1 = 1.8;
    c.rot = this.time * 1.7;
    c.r = 0.02;
    c.g = 0.03;
    c.b = 0.06;
    c.a = 0.75;
    this.scorch.emit();
  }

  /** World time: the planted swords slam, hold and fade; the heroes' screen motion is measured (real view size). */
  update(dt: number): void {
    this.time += dt;
    this.camera.getWorldPosition(this.camW);
    for (let k = 0; k < this.pins.length; k += 1) {
      const p = this.pins[k]!;
      if (!p.active) {
        this.swords.hide(k);
        continue;
      }
      p.t += dt;
      if (p.t >= SLAM_S + PIN_HOLD_S + PIN_FADE_S) {
        p.active = false;
        this.swords.hide(k);
        continue;
      }
      const slam = Math.min(1, p.t / SLAM_S);
      const drop = (1 - slam * slam) * 1.6;
      const melt = Math.max(0, (p.t - SLAM_S - PIN_HOLD_S) / PIN_FADE_S);
      // The tip in the ground at the body, the hilt leaning back along the blow; the sword points tip down.
      const s = Math.sin(PIN_LEAN);
      const c = Math.cos(PIN_LEAN);
      const dx = p.dx * s;
      const dy = -c;
      const dz = p.dz * s;
      const h = PIN_LEN * 0.5;
      const mx = p.x - dx * h;
      const my = -PIN_DEPTH + drop - dy * h;
      const mz = p.z - dz * h;
      this.swords.setWhole(k, mx, my, mz, dx, dy, dz, PIN_LEN, this.faces.of(this.camW, mx, my, mz, dx, dy, dz));
      // The slam's flash on its edge line, settling to a steady glow; it melts into light at the end.
      const flash = slam < 1 ? 0.4 * slam : Math.max(0, 1 - (p.t - SLAM_S) / 0.15);
      this.swords.look(k, 0.7, flash, PIN_RIM[0], PIN_RIM[1], PIN_RIM[2], melt, k * 0.71);
    }
    this.swords.sync();
    this.rings.update(dt);
    this.stars.update(dt);
    this.scorch.update(dt);
    const { width, height } = this.view();
    for (const h of this.heroes) {
      if (!this.herd.isHero(h.target) && h.pinned) continue;
      this.v.set(this.herd.x(h.target), this.herd.midY(h.target) + this.herd.airY(h.target), this.herd.z(h.target)).project(this.camera);
      const d = Math.hypot((this.v.x * 0.5 + 0.5) * width - h.sx, (-this.v.y * 0.5 + 0.5) * height - h.sy);
      if (h.shovePx === 0 && d > 0) h.shovePx = d;
      h.maxPx = Math.max(h.maxPx, d);
    }
  }

  /** This cast's tiers (captures): heroes with their screen motion in px at 1080p, secondary and background counts. */
  report(): Record<string, unknown> {
    const k = 1080 / Math.max(1, this.view().height);
    return {
      slot: this.castSlot,
      heroes: this.heroes.map((h) => ({ target: h.target, atS: +h.at.toFixed(2), shovePx: Math.round(h.shovePx * k), maxPx: Math.round(h.maxPx * k), pinned: h.pinned })),
      heroCount: this.heroes.length,
      secondary: this.secondary,
      background: this.background,
      lastHopFrame: this.hopFrame,
    };
  }

  reset(): void {
    for (const p of this.pins) p.active = false;
    this.swords.hideAll();
    this.swords.sync();
    this.rings.clear();
    this.stars.clear();
    this.scorch.clear();
    this.heroes.length = 0;
    this.castSlot = "";
  }
}
