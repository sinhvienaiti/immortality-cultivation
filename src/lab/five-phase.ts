/**
 * Two sample skills with all five phases and their radiance (docs/work/tasks/skill-five-phase-samples.md; owner 06/11
 * ~11:10: "cái chính là vfx khi tung chiêu, chiêu bay như nào, và vào quái sẽ ra sao, xung quanh chiêu đó animation sẽ
 * như nào"; VFX_STANDARD §3, skill game-vfx-layered): the sky meteor (key M, D62) and the sword's crescent (key 2), in
 * Fire, before the pattern goes to every lab skill. Every shape is one of the element's own clips (FIVE_RECIPES: its
 * charge spiral, halo seal and halo ring, twinkle set, flame lotus, ribbon, spark spray, qi-burst ring, ground fire,
 * rising embers, ember burst, painted burn mark, smoke on white, sheath strip, comet, crescent); code only places, times,
 * turns and animates them (lab only, never shipped). Fast attack, slow decay: a flash is whole on its first frame, the
 * rest holds its peak and burns down by erosion; halos and rings ≤ 0.9 a channel, only the twinkles' thin cores bloom.
 * Phases:
 * - charge (while the word is typed): the charge spiral grows at the hand (the sword: its sheath strip along the blade),
 *   twinkles and embers are drawn in, the halo seal turns under the feet, the caster's rim glows amber (the host);
 * - release (the last key's frame): the halo ring flashes at its peak with a twinkle core, a small flame lotus bursts
 *   from the hand (the sword: at its tip, with the qi-burst ring round the feet), the camera kicks (the host); the
 *   meteor's ribbon streaks up out of the frame;
 * - travel: the meteor's marks (the halo seal, revealed before its blow) and its comet (comet-head.ts, meteor-rain.ts);
 *   the crescent flying straight with its trail, afterimages and twinkles off both horns (CrescentSample);
 * - impact (per beast): the spark spray on its body (a twinkle at its heart), the flame lotus and the turning qi-burst
 *   ring on the ground, small flames on its body for 1.6 s (its rim burning, the host), the hit's flash, knockback,
 *   numbers and stop through the host's hit path; a kill burns away into the ember burst and rising embers;
 * - aftermath: the painted burn mark on the ground eroding over ~2.4 s, rising embers, thin dark smoke.
 */
import * as THREE from "three";
import { CrescentTrail, type TrailMatter } from "../view/skills/crescent-trail";
import { crescentOf, layFlat } from "../view/skills/element-clips";
import type { ElementRamp } from "../view/skills/element-kit";
import type { ElementStage } from "../view/skills/element-stage";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipbookMode, type FlipOptions } from "../view/skills/flipbook";
import { Rand } from "../view/skills/fxkit";
import type { FoeStatusKind } from "../view/skills/element-kit";
import type { ImpactRole } from "../view/screen-fx";

/** The clips each phase is made of, by id in the element's folder (art-src/lab/vfx/<folder>/manifest.json). */
export interface FiveRecipe {
  readonly folder: string;
  /** Charge: the spiral at the hand (a loop), the seal under the feet and at a meteor's mark (a loop, laid flat). */
  readonly charge: string;
  readonly seal: string;
  /** Release: the halo ring's flash (one-shot; `flashPeak` its brightest frame), the twinkle set (8 rows of 16, `glintPeaks`). */
  readonly flash: string;
  readonly flashPeak: number;
  readonly glint: string;
  readonly glintPeaks: readonly number[];
  /** The flame lotus (straight alpha, root at the bottom): the release at the hand and the blow on the ground. */
  readonly lotus: string;
  readonly lotusPeak: number;
  /** The ribbon (a horizontal loop): the streak up to the sky. */
  readonly ribbon: string;
  /** Impact: the spark spray on the body and the qi-burst ring laid on the ground. */
  readonly impact: string;
  readonly ring: string;
  /** The small flames on a struck body (straight alpha, root at the bottom), the rising embers (a loop), the ember burst. */
  readonly body: string;
  readonly embers: string;
  readonly emberBurst: string;
  /** Aftermath: the painted burn mark (laid flat), the smoke filmed on white. */
  readonly mark: string;
  readonly smoke: string;
  /** The sword's charge: the flame strip along its blade (a loop). */
  readonly sheath: string;
  /** The struck beast's flash and burning rim (0xRRGGBB), the flash light (CSS hex), its status. */
  readonly rim: number;
  readonly light: string;
  readonly status: FoeStatusKind;
  /** The caster's rim while charging (0xRRGGBB). */
  readonly glow: number;
  /** The crescent's trail ramp (the element's). */
  readonly ramp: ElementRamp;
}

/** Fire (art-src/lab/vfx/fire): the owner's W2 clips, the Starfire twinkles and halo seal, the painted ground mark. */
export const FIRE_FIVE: FiveRecipe = {
  folder: "fire",
  charge: "fire-charge-gather-w2",
  seal: "fire-halo-seal-loop",
  flash: "fire-halo-ring",
  flashPeak: 19,
  glint: "fire-twinkle-set",
  // Ticket 277's measured peak of each twinkle row (element-fire.ts TWINKLE_PEAK).
  glintPeaks: [3, 9, 9, 7, 11, 8, 12, 4],
  lotus: "fire-burst",
  lotusPeak: 7,
  ribbon: "style-w2-fire-ribbon",
  impact: "fire-spark-spray-w2",
  ring: "style-w2-fire-qi-burst",
  body: "fire-ground",
  embers: "fire-embers-rising-loop-w2",
  emberBurst: "dragonhold-embers",
  mark: "fire-ground-mark",
  smoke: "fire-smoke-roll-white-w2",
  sheath: "strip-fire-sheath-flow-w2",
  rim: 0xffa030,
  light: "#ffa030",
  status: "burn",
  glow: 0xff8a2a,
  ramp: { core: [1, 0.94, 0.77], edge: [1, 0.47, 0.001], body: [0.69, 0.04, 0], soot: [0.017, 0.002, 0.008] },
};

/** The samples by element folder (Fire only for now: the owner judges it before the pattern spreads). */
export const FIVE_RECIPES: Readonly<Record<string, FiveRecipe>> = { fire: FIRE_FIVE };

/** What the samples need from the lab (its herd, caster, hit path, camera and lights). */
export interface FiveHost {
  readonly stage: ElementStage;
  readonly layer: THREE.Object3D;
  readonly camera: THREE.Camera;
  alive(i: number): boolean;
  x(i: number): number;
  z(i: number): number;
  midY(i: number): number;
  radius(i: number): number;
  inCapsule(ax: number, az: number, bx: number, bz: number, halfW: number, out: Int32Array): number;
  /** Its rim burns in `rgb` for `seconds` (the herd's status). */
  status(i: number, kind: FoeStatusKind, seconds: number, rgb: number): void;
  /** One blow of skill `slot` ("km", "k2") on beast `i` through the lab's hit path (flash, knockback, numbers, sound); true: it killed. */
  blow(slot: string, i: number, dx: number, dz: number, power: number, role: ImpactRole): boolean;
  /** A landing's screen tier (stop, shake), its kick and its light. */
  strike(slot: string, at: THREE.Vector3, role: ImpactRole, dx: number, dz: number): void;
  /** The release's kick and light at the hand. */
  kick(px: number, dx: number, dz: number): void;
  light(at: THREE.Vector3, colour: string, intensity: number): void;
  /** The caster's rim while it gathers (0: off). */
  glow(rgb: number, k: number): void;
  /** The hand (world) and the sword's blade, start and tip (false: no sword in the hand). */
  hand(out: THREE.Vector3): void;
  blade(a: THREE.Vector3, b: THREE.Vector3): boolean;
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const mid = new THREE.Vector3();
const along = new THREE.Vector3();
const tipV = new THREE.Vector3();
const opts: FlipOptions = {};
/** Resets the shared options (no allocation per spawn). */
function flip(): FlipOptions {
  const o = opts;
  o.life = o.rate = o.frame = o.until = o.rot = o.spin = o.grow = o.alpha = o.intensity = o.occlude = o.erode = undefined;
  o.slowFrom = o.slowRate = undefined;
  o.vx = o.vy = o.vz = o.drag = o.gravity = o.ground = o.fadeIn = o.fadeOut = o.delay = o.cool = o.lift = undefined;
  o.tint = undefined;
  o.variant = undefined;
  o.dir = undefined;
  o.span = undefined;
  return o;
}
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** One clip of the recipe on its own pool (camera-facing or laid flat), attached when its atlas is in. */
class Card {
  readonly pool: FlipbookPool;
  private attached = false;

  constructor(private readonly stage: ElementStage, layer: THREE.Object3D, private readonly folder: string, readonly id: string, mode: FlipbookMode,
    capacity: number, order: number, private readonly opts: { flat?: boolean; vignette?: number; adapt?: (m: FlipbookMeta) => FlipbookMeta } = {}) {
    this.pool = new FlipbookPool("five-" + id, mode, capacity, order, blankTexture());
    if (opts.flat === true) layFlat(this.pool);
    if (opts.vignette !== undefined) this.pool.vignette = opts.vignette;
    layer.add(this.pool.mesh);
  }

  get meta(): FlipbookMeta | null {
    return this.ready() ? this.pool.meta : null;
  }

  ready(): boolean {
    if (this.attached) return true;
    const e = this.stage.flipbooks.library(this.folder).get(this.id);
    if (e === null) return false;
    this.pool.attach(this.opts.adapt !== undefined ? this.opts.adapt(e.meta) : e.meta, e.texture);
    this.attached = true;
    return true;
  }

  spawn(at: THREE.Vector3, size: number, o: FlipOptions): void {
    if (this.ready()) this.pool.spawn(at, size, o);
  }
}

let blank: THREE.DataTexture | null = null;
function blankTexture(): THREE.DataTexture {
  if (blank === null) {
    blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    blank.needsUpdate = true;
  }
  return blank;
}

/** A struck body burning: its beast, its age and length (s), its seed. */
interface Burning {
  i: number;
  t: number;
  life: number;
  seed: number;
}

/** A streak of the release going up out of the frame: its trail, start, age. */
interface Streak {
  readonly trail: CrescentTrail;
  x: number;
  y: number;
  z: number;
  t: number;
  on: boolean;
}

/** Sizes and times (m, s). */
export const FIVE = {
  /** A struck body burns this long (the task: 1–2 s); its rim's status lasts as long. */
  burnS: 1.6,
  /** The aftermath's burn mark lies this long, eroding from 55 % of it. */
  markS: 2.4,
  /** The release streak climbs to this height over this time. */
  streakTopM: 30,
  streakS: 0.24,
  /** The struck beast's flash (s; the task: about 0.1 s). */
  rimS: 0.1,
} as const;

/**
 * The five phases' shared layers for one element (its recipe): the charge, the release, a beast struck, a kill, the
 * aftermath. MeteorRain (key M) and CrescentSample (key 2) place them on their own timelines.
 */
export class FivePhase {
  private readonly charge: Card;
  private readonly seal: Card;
  private readonly sealFlat: Card;
  private readonly flash: Card;
  private readonly glint: Card;
  private readonly lotus: Card;
  private readonly impact: Card;
  private readonly ring: Card;
  private readonly body: Card;
  private readonly embers: Card;
  private readonly emberBurst: Card;
  private readonly mark: Card;
  private readonly smoke: Card;
  private readonly sheath: Card;
  private readonly cards: Card[];
  private readonly burning: Burning[] = [];
  private readonly streaks: Streak[] = [];
  private readonly rand = new Rand(60611);
  private time = 0;
  /** The charge shown (eased toward the typed level), the motes owed. */
  private level = 0;
  private motes = 0;
  private charging = false;
  private glowing = false;
  /** What was drawn since the last reset (the lab's __lab.five). */
  readonly audit = { charge: 0, release: 0, streaks: 0, marks: 0, hits: 0, burning: 0, deaths: 0, aftermath: 0 };

  constructor(private readonly host: FiveHost, readonly recipe: FiveRecipe) {
    const s = host.stage;
    const L = host.layer;
    const f = recipe.folder;
    this.charge = new Card(s, L, f, recipe.charge, "fire", 4, 14, { vignette: 0.3 });
    this.seal = new Card(s, L, f, recipe.seal, "fire", 4, 6, { flat: true });
    this.sealFlat = new Card(s, L, f, recipe.seal, "fire", 24, 6, { flat: true });
    this.flash = new Card(s, L, f, recipe.flash, "fire", 12, 15);
    // The twinkle set: 8 rows of 16 frames, one twinkle a row (element-fire.ts attaches it the same way).
    this.glint = new Card(s, L, f, recipe.glint, "fire", 192, 15, { adapt: (m) => ({ ...m, frames: 16, variants: 8, loop: false, loopMode: "none" }) });
    this.lotus = new Card(s, L, f, recipe.lotus, "rgba", 24, 12);
    this.impact = new Card(s, L, f, recipe.impact, "fire", 24, 14, { vignette: 0.35 });
    this.ring = new Card(s, L, f, recipe.ring, "fire", 24, 7, { flat: true, vignette: 0.3 });
    this.body = new Card(s, L, f, recipe.body, "rgba", 32, 12);
    this.embers = new Card(s, L, f, recipe.embers, "fire", 48, 13, { vignette: 0.25 });
    this.emberBurst = new Card(s, L, f, recipe.emberBurst, "fire", 24, 14, { vignette: 0.3 });
    this.mark = new Card(s, L, f, recipe.mark, "fire", 24, 4, { flat: true, vignette: 0.25 });
    // The smoke filmed on white as straight-alpha matter, its thin haze cut away (no grey veil, no cell edge).
    this.smoke = new Card(s, L, f, recipe.smoke, "rgba", 24, 10, { vignette: 0.55 });
    this.smoke.pool.setSharpen(0.22, 0.6);
    this.sheath = new Card(s, L, f, recipe.sheath, "fire", 4, 14, { vignette: 0.2 });
    this.cards = [this.charge, this.seal, this.sealFlat, this.flash, this.glint, this.lotus, this.impact, this.ring, this.body, this.embers, this.emberBurst, this.mark, this.smoke, this.sheath];
    for (let k = 0; k < 2; k += 1) {
      const trail = new CrescentTrail(this.ribbonMatter(), 13, 9, { fadeS: 0.35 });
      L.add(trail.mesh);
      this.streaks.push({ trail, x: 0, y: 0, z: 0, t: 0, on: false });
    }
  }

  /** The ribbon as a trail's matter (its own colours, added light); a blank until its atlas is in. */
  private ribbonMatter(): TrailMatter {
    const e = this.host.stage.flipbooks.library(this.recipe.folder).get(this.recipe.ribbon);
    const r = this.recipe.ramp;
    return {
      map: e?.texture ?? blankTexture(), cols: e?.meta.cols ?? 1, rows: e?.meta.rows ?? 1, frames: e?.meta.frames ?? 1, fps: e?.meta.fps ?? 24,
      colours: "clip", core: r.core, edge: r.edge, body: r.body, blend: "add", across: 0.7,
    };
  }

  /** Whether the recipe's clips are in (the lab waits for them before a capture). */
  get ready(): boolean {
    return this.cards.every((c) => c.ready()) && this.host.stage.flipbooks.library(this.recipe.folder).get(this.recipe.ribbon) !== null;
  }

  /** One twinkle (a row of the set at its peak), `size` m, burning out over `life` s; `k` its light (its core blooms). */
  twinkle(at: THREE.Vector3, size: number, life: number, k = 1.2, delay = 0, vx = 0, vy = 0, vz = 0): void {
    const row = Math.floor(this.rand.next() * this.recipe.glintPeaks.length);
    const o = flip();
    o.variant = row;
    o.frame = this.recipe.glintPeaks[row]!;
    o.life = life;
    o.rate = (16 - o.frame) / (24 * life);
    o.intensity = k;
    o.occlude = 0;
    o.fadeOut = 0;
    o.lift = 0.6;
    if (delay > 0) o.delay = delay;
    if (vx !== 0 || vy !== 0 || vz !== 0) {
      o.vx = vx;
      o.vy = vy;
      o.vz = vz;
      o.drag = 1.2;
    }
    this.glint.spawn(at, size, o);
  }

  /**
   * A: every frame while the word is typed (`level` 0…1, its typed share): the spiral at the hand, the seal under the
   * feet, twinkles and embers drawn in, the caster's rim. The sword's charge draws its sheath instead of the spiral.
   */
  chargeFrame(level: number, feetX: number, feetZ: number, dt: number, sword: boolean): void {
    this.charging = true;
    // Shown level eases toward the typed one (no step per key), fast enough to read the last key.
    this.level += (level - this.level) * Math.min(1, dt * 14);
    const L = Math.max(0.15, this.level);
    const vis = smooth(this.level / 0.3 + 0.35);
    this.audit.charge += 1;
    if (sword && this.host.blade(v, w)) {
      // The blade lights from its root: the sheath strip along it, a little past the tip, fuller with each key.
      const len = v.distanceTo(w);
      const o = flip();
      o.life = ONE_FRAME;
      o.rate = 0;
      o.frame = (this.time * 24) % 48;
      o.dir = along.copy(w).sub(v).normalize();
      o.span = len * 1.35;
      o.alpha = vis;
      o.intensity = 0.7 + 0.5 * L;
      o.occlude = 0.15;
      o.lift = 0.5;
      mid.copy(v).lerp(w, 0.55);
      this.sheath.spawn(mid, 0.5 + 0.45 * L, o);
      // Twinkles round the blade, turning about it and drawn to its tip.
      this.motes += 26 * L * dt;
      while (this.motes >= 1) {
        this.motes -= 1;
        const a = this.rand.next() * Math.PI * 2;
        const r = 0.5 + 0.4 * this.rand.next();
        const p = this.rand.next();
        const x = mid.x + Math.cos(a) * r;
        const y = mid.y + (p - 0.5) * 0.8;
        const z = mid.z + Math.sin(a) * r;
        // Swirling in: tangential plus inward.
        const tx = -Math.sin(a) * 2.2 - Math.cos(a) * 1.4;
        const tz = Math.cos(a) * 2.2 - Math.sin(a) * 1.4;
        this.twinkle(v.set(x, y, z), 0.3 + 0.22 * this.rand.next(), 0.42, 1.3, 0, tx, 0.3, tz);
      }
    } else {
      this.host.hand(v);
      // The spiral gathering into the hand, larger and hotter with each key.
      const o = flip();
      o.life = ONE_FRAME;
      o.rate = 0;
      o.frame = (this.time * 24) % 48;
      o.alpha = vis;
      o.intensity = 0.85 + 0.6 * L;
      o.occlude = 0.2;
      o.lift = 0.6;
      this.charge.spawn(v, 1.1 + 1.5 * L, o);
      // Twinkles and embers drawn in from round the hand.
      this.motes += 30 * L * dt;
      while (this.motes >= 1) {
        this.motes -= 1;
        const a = this.rand.next() * Math.PI * 2;
        const e = (this.rand.next() - 0.3) * 1.2;
        const r = 1.3 + 0.9 * this.rand.next();
        const dx = Math.cos(a) * Math.cos(e);
        const dy = Math.sin(e);
        const dz = Math.sin(a) * Math.cos(e);
        const life = 0.38;
        // Arrives at the hand as it burns out: speed r / life, drag-free.
        this.twinkle(w.set(v.x + dx * r, v.y + dy * r, v.z + dz * r), 0.3 + 0.25 * this.rand.next(), life, 1.3, 0, (-dx * r) / life, (-dy * r) / life, (-dz * r) / life);
      }
    }
    // The seal turning under the feet (laid flat), its light ≤ 0.9.
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    o.frame = (this.time * 24) % 32;
    o.rot = this.time * 0.8;
    o.alpha = vis;
    o.intensity = 0.55 + 0.35 * L;
    o.occlude = 0;
    o.lift = 0.2;
    this.seal.spawn(w.set(feetX, 0.04, feetZ), 2.8 + 1.0 * L, o);
    this.host.glow(this.recipe.glow, 0.5 + 1.3 * L);
    this.glowing = true;
  }

  /** R: on the last key's frame, at `at` (the hand, or the sword's tip): flash, twinkle core, lotus, kick, light. */
  release(at: THREE.Vector3, dx: number, dz: number, feetX: number, feetZ: number, sword: boolean): void {
    this.audit.release += 1;
    this.charging = false;
    this.glowing = false;
    this.host.glow(this.recipe.glow, 0);
    at = tipV.copy(at);
    this.level = 0;
    // The halo ring at its brightest frame on the key's frame (whole on frame 0), then burning down.
    let o = flip();
    o.frame = this.recipe.flashPeak;
    o.life = 0.42;
    o.rate = (24 - this.recipe.flashPeak) / (24 * 0.42);
    o.grow = 0.5;
    o.intensity = 0.9;
    o.occlude = 0;
    o.fadeOut = 0.15;
    o.lift = 0.8;
    this.flash.spawn(at, sword ? 2.2 : 2.6, o);
    // Its heart: a twinkle whose thin core blooms, and a ring of smaller ones flung out.
    this.twinkle(at, sword ? 1.6 : 1.9, 0.5, 2.2);
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + this.rand.next() * 0.5;
      this.twinkle(at, 0.35, 0.45, 1.2, 0.02, Math.cos(a) * 5, Math.sin(a) * 3 + 1.5, Math.sin(a) * 2.5);
    }
    // A small flame lotus bursting from the hand, fast to its peak, then slow.
    o = flip();
    o.frame = 2;
    o.rate = (this.recipe.lotusPeak - 2) / (18 * 0.07);
    o.slowFrom = this.recipe.lotusPeak;
    o.slowRate = 0.55;
    o.cool = 0.55;
    o.lift = 0.4;
    this.lotus.spawn(v.set(at.x, Math.max(0.2, at.y - 0.6), at.z), sword ? 1.2 : 1.35, o);
    if (sword) {
      // The pressure ring round the feet: the qi-burst laid flat, from a bright frame, growing and turning.
      o = flip();
      o.frame = 6;
      o.rate = (20 - 6) / (12 * 0.18);
      o.slowFrom = 20;
      o.slowRate = 0.5;
      o.grow = 0.6;
      o.spin = 1.2;
      o.cool = 0.5;
      o.intensity = 0.9;
      o.occlude = 0;
      o.lift = 0.2;
      this.ring.spawn(w.set(feetX, 0.05, feetZ), 3.2, o);
    }
    this.host.kick(sword ? 2.4 : 1.8, dx, dz);
    this.host.light(at, this.recipe.light, sword ? 5 : 4.5);
  }

  /** The meteor's release: its ribbon streaks from the hand up out of the frame, a twinkle riding its head. */
  skyStreak(from: THREE.Vector3): void {
    const s = this.streaks.find((x) => !x.on) ?? this.streaks[0]!;
    s.on = true;
    s.t = 0;
    s.x = from.x;
    s.y = from.y;
    s.z = from.z;
    s.trail.clear();
    this.audit.streaks += 1;
  }

  /** A meteor's mark under beast-free ground or a beast: the seal laid flat, coming in over `lead` s, gone with its blow. */
  markAt(x: number, z: number, lead: number, delay: number): void {
    this.audit.marks += 1;
    const o = flip();
    o.delay = delay;
    o.frame = 0;
    o.rate = 1;
    o.life = lead + 0.12;
    o.fadeIn = lead * 0.7;
    o.fadeOut = 0.1;
    o.rot = this.rand.next() * 6.28;
    o.spin = 2.4;
    o.intensity = 0.9;
    o.occlude = 0;
    o.lift = 0.15;
    this.sealFlat.spawn(v.set(x, 0.04, z), 2.6, o);
  }

  /**
   * I: a blow lands on beast `i` (alive) from (dx, dz): the spark spray on its body with a twinkle heart, the lotus and
   * the turning ring on the ground (`ground`: false keeps them off, the crescent's pierce on its later beasts), its body
   * burning; the hit path (host.blow) gives its flash, knockback, numbers and sound. True: it killed.
   */
  hit(slot: string, i: number, dx: number, dz: number, role: ImpactRole, power = 1, ground = true): boolean {
    const H = this.host;
    if (!H.alive(i)) return false;
    this.audit.hits += 1;
    const x = H.x(i);
    const z = H.z(i);
    const my = H.midY(i);
    const r = Math.max(0.4, H.radius(i));
    // The spark spray on the body from a bright, wide frame (fast attack), then slow to its end.
    let o = flip();
    o.frame = 11;
    o.rate = (17 - 11) / (12 * 0.08);
    o.slowFrom = 17;
    o.slowRate = 0.85;
    o.intensity = 1.05;
    o.occlude = 0;
    o.lift = 0.9;
    o.ground = 0;
    this.impact.spawn(v.set(x, my, z), 2.0 + 1.6 * r, o);
    this.twinkle(v, 1.3 + r, 0.4, 2.0);
    if (ground) {
      // The flame lotus from the ground under it, its root on the stone.
      o = flip();
      o.frame = 3;
      o.rate = (this.recipe.lotusPeak - 3) / (18 * 0.06);
      o.slowFrom = this.recipe.lotusPeak;
      o.slowRate = 0.5;
      o.cool = 0.6;
      o.lift = 0.3;
      o.ground = 0;
      this.lotus.spawn(v.set(x - dx * 0.15, 0, z - dz * 0.15), 1.6 + r, o);
      // The qi-burst ring turning on the ground.
      o = flip();
      o.frame = 5;
      o.rate = (20 - 5) / (12 * 0.16);
      o.slowFrom = 20;
      o.slowRate = 0.45;
      o.grow = 0.35;
      o.spin = 2.2;
      o.cool = 0.55;
      o.intensity = 0.9;
      o.occlude = 0;
      o.lift = 0.2;
      this.ring.spawn(v.set(x, 0.05, z), 2.6 + 1.2 * r, o);
    }
    const killed = H.blow(slot, i, dx, dz, power, role);
    if (!killed) {
      H.status(i, this.recipe.status, FIVE.burnS, this.recipe.rim);
      const b = this.burning.find((q) => q.i === i);
      if (b !== undefined) b.t = 0;
      else this.burning.push({ i, t: 0, life: FIVE.burnS, seed: this.rand.next() });
      this.audit.burning += 1;
    }
    return killed;
  }

  /** A kill: the body burns away (the herd's dissolve) into the ember burst and a column of rising embers. */
  death(x: number, y: number, z: number): void {
    this.audit.deaths += 1;
    let o = flip();
    o.frame = 2;
    o.rate = (12 - 2) / (12 * 0.12);
    o.slowFrom = 12;
    o.slowRate = 0.6;
    o.intensity = 1.0;
    o.occlude = 0;
    o.lift = 0.8;
    this.emberBurst.spawn(v.set(x, y, z), 2.6, o);
    o = flip();
    o.frame = this.rand.next() * 48;
    o.life = 1.4;
    o.fadeIn = 0.08;
    o.fadeOut = 0.7;
    o.intensity = 0.95;
    o.occlude = 0;
    o.lift = 0.5;
    o.ground = 0;
    this.embers.spawn(v.set(x, 0, z), 2.2, o);
    this.twinkle(w.set(x, y, z), 1.1, 0.45, 1.6);
  }

  /**
   * F: the burn left at (x, z): the painted mark laid flat (along (ax, az) stretched to `span` m: the crescent's scar),
   * holding then eroding over FIVE.markS, embers rising off it, thin dark smoke.
   */
  aftermath(x: number, z: number, size: number, delay: number, ax = 0, az = 0, span = 0): void {
    this.audit.aftermath += 1;
    const life = FIVE.markS;
    const meta = this.mark.meta;
    let o = flip();
    o.delay = delay;
    o.frame = 0;
    // Its painted frames up to the hold's end over its life (the mark smoulders), eroding from 55 % on.
    const hold = meta?.holdEnd ?? Math.max(1, (meta?.frames ?? 2) - 10);
    o.rate = hold / ((meta?.fps ?? 8) * life);
    o.life = life;
    o.fadeIn = 0.12;
    o.cool = 0.55;
    o.fadeOut = 0.35;
    o.intensity = 0.95;
    o.occlude = 0.85;
    o.lift = 0.05;
    if (span > 0) {
      o.dir = along.set(ax, 0, az);
      o.span = span;
    } else o.rot = this.rand.next() * 6.28;
    this.mark.spawn(v.set(x, 0.03, z), size, o);
    // Embers rising off it, then fewer.
    const n = span > 0 ? Math.max(2, Math.round(span / 3)) : 1;
    for (let k = 0; k < n; k += 1) {
      const t = n === 1 ? 0 : k / (n - 1) - 0.5;
      o = flip();
      o.delay = delay + 0.05 * k;
      o.frame = this.rand.next() * 48;
      o.life = life * 0.8;
      o.fadeIn = 0.25;
      o.fadeOut = life * 0.45;
      o.intensity = 0.8;
      o.occlude = 0;
      o.lift = 0.3;
      o.ground = 0;
      this.embers.spawn(v.set(x + ax * span * t, 0, z + az * span * t), 1.5 + 0.2 * size, o);
    }
    // Thin dark smoke drifting up (smoke on white: matter, normal blend), low.
    o = flip();
    o.delay = delay + 0.2;
    o.frame = 4;
    o.rate = (26 - 4) / (6 * life);
    o.life = life;
    o.fadeIn = 0.4;
    o.fadeOut = 0.9;
    o.alpha = 0.45;
    o.vy = 0.45;
    o.lift = 0.2;
    o.ground = 0;
    this.smoke.spawn(v.set(x, 0.1, z), 1.1 + 0.2 * size, o);
  }

  /** World time: the burning bodies follow their beasts, the streaks climb, the cards age. */
  update(dt: number): void {
    this.time += dt;
    if (!this.charging && this.level > 0) this.level = Math.max(0, this.level - dt * 4);
    // A word dropped without its release (a reset): the rim goes out.
    if (!this.charging && this.glowing) {
      this.glowing = false;
      this.host.glow(this.recipe.glow, 0);
    }
    this.charging = false;
    const H = this.host;
    for (let k = this.burning.length - 1; k >= 0; k -= 1) {
      const b = this.burning[k]!;
      b.t += dt;
      if (b.t >= b.life || !H.alive(b.i)) {
        // Burnt out, or it died (its death burns away into embers).
        this.burning.splice(k, 1);
        continue;
      }
      // Small flames on its body: the ground fire's full tongues (frames 3–7) flickering, then burning down (8 on).
      const out = smooth((b.t - (b.life - 0.45)) / 0.45);
      const flick = 3 + 4 * (0.5 + 0.5 * Math.sin(this.time * 7 + b.seed * 20));
      const o = flip();
      o.life = ONE_FRAME;
      o.rate = 0;
      o.frame = out > 0 ? 8 + 7 * out : flick;
      o.alpha = smooth(b.t / 0.08) * (1 - 0.6 * out);
      o.lift = 0.5;
      o.ground = 0;
      this.body.spawn(v.set(H.x(b.i), 0, H.z(b.i)), Math.min(1.5, H.midY(b.i) * 1.6 + 0.2) * (1 - 0.3 * out), o);
    }
    for (const s of this.streaks) {
      if (!s.on) continue;
      s.t += dt;
      const u = Math.min(1, s.t / FIVE.streakS);
      // Eased in: it leaves the hand fast and keeps accelerating out of the frame.
      const y = s.y + (FIVE.streakTopM - s.y) * (u * u * 0.35 + u * 0.65);
      s.trail.head(s.x, y, s.z, 1.1);
      if (Math.floor((s.t - dt) * 60) !== Math.floor(s.t * 60)) this.twinkle(v.set(s.x, y, s.z), 0.9, 0.12, 1.6);
      if (u >= 1) s.on = false;
    }
    for (const s of this.streaks) s.trail.update(dt, H.camera);
    for (const c of this.cards) c.pool.update(dt);
  }

  /** Shown cards (stats). */
  get live(): number {
    let n = 0;
    for (const c of this.cards) n += c.pool.live;
    return n;
  }

  reset(): void {
    for (const c of this.cards) c.pool.clear();
    for (const s of this.streaks) {
      s.on = false;
      s.trail.clear();
    }
    this.burning.length = 0;
    this.level = 0;
    this.host.glow(this.recipe.glow, 0);
    for (const k of Object.keys(this.audit) as (keyof FivePhase["audit"])[]) this.audit[k] = 0;
  }
}

/** The crescent's flight (m, m/s), its size (the card's height × 1.2 is drawn: element-clips' CrescentClip), a hit's width. */
export const CRESCENT = {
  lengthM: 16,
  speed: 30,
  /** K2_CRESCENT × CUT.scale (sword-skills.ts): the size key 2's crescent has always flown at. */
  size: 3.6,
  /** A beast within this of the crescent's line (m, plus its radius) is struck once as it passes. */
  halfW: 1.5,
  /** A struck beast's imprint: the crescent cut across its body. */
  imprint: 1.9,
  /** The height it flies at (m). */
  y: 1.0,
} as const;

/**
 * Key 2's sample (Nhất Tuyến Xuyên Vân in Fire): the crescent leaves the sword's tip on the last key and flies straight
 * across the field, piercing: each beast it passes is struck once (the spray, its imprint cut across the body, the
 * lotus and turning ring under the first, the body burning), and where it ends the big cut lands; its line burns on the
 * ground (the painted mark stretched along it) and erodes. The crescent, its afterimages and soft trail are
 * element-clips' CrescentClip (the owner's crescent of 05/11); the twinkles off its horns are the twinkle set.
 */
export class CrescentSample {
  private on = false;
  private t = 0;
  private ax = 0;
  private az = 0;
  private dx = 0;
  private dz = 0;
  private y0: number = CRESCENT.y;
  private s = 0;
  private horn = 0;
  private side = 0;
  private landed = false;
  private readonly rand = new Rand(20611);
  private readonly struck = new Set<number>();
  private readonly found = new Int32Array(128);
  last: { hits: number; kills: number; struck: number[]; landedAt: number; releaseFrame: number } | null = null;

  constructor(private readonly host: FiveHost, private readonly five: FivePhase) {}

  get active(): boolean {
    return this.on;
  }

  /** The last key: the release at the tip (or the hand), the crescent off along (tx, tz) from the caster at (cx, cz). */
  cast(cx: number, cz: number, tx: number, tz: number): void {
    let dx = tx - cx;
    let dz = tz - cz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const tip = mid;
    if (!this.host.blade(w, tip)) this.host.hand(tip);
    const tx0 = tip.x;
    const ty0 = tip.y;
    const tz0 = tip.z;
    this.five.release(tip, dx, dz, cx, cz, true);
    tip.set(tx0, ty0, tz0);
    this.on = true;
    this.t = 0;
    this.ax = tip.x;
    this.az = tip.z;
    this.y0 = Math.max(0.7, Math.min(1.4, tip.y));
    this.dx = dx;
    this.dz = dz;
    this.s = 0;
    this.side = 0;
    this.horn = 0;
    this.landed = false;
    this.struck.clear();
    this.last = { hits: 0, kills: 0, struck: [], landedAt: -1, releaseFrame: 0 };
  }

  /** The cut's screen angle across the flight (sword-skills.ts cutAngle). */
  private rot(): number {
    return Math.atan2(-this.dz, this.dx) + Math.PI / 2;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += dt;
    const H = this.host;
    const prev = this.s;
    this.s = Math.min(CRESCENT.lengthM, this.t * CRESCENT.speed);
    const y = this.y0 + (CRESCENT.y - this.y0) * smooth(this.s / 3);
    const cx = this.ax + this.dx * this.s;
    const cz = this.az + this.dz * this.s;
    const rot = this.rot();
    if (!this.landed) {
      // The crescent whole (its clip's flowing frames), its afterimages and soft trail (CrescentClip).
      const grow = 0.55 + 0.45 * smooth(this.s / 2.5);
      crescentOf(H.stage, this.five.recipe.folder, this.five.recipe.ramp).flying(v.set(cx, y, cz), rot, CRESCENT.size * grow, 1, null, this.five.recipe.ramp);
      // Twinkles shed off both horns, drifting back.
      this.horn += 34 * dt;
      while (this.horn >= 1) {
        this.horn -= 1;
        const side = this.side++ % 2 === 0 ? 1 : -1;
        const half = CRESCENT.size * grow * 1.05;
        // The horns lie across the flight (on the ground plane) and a little back.
        w.set(cx - this.dz * half * side - this.dx * 0.6, y + 0.35, cz + this.dx * half * side - this.dz * 0.6);
        this.five.twinkle(w, 0.3 + 0.25 * this.rand.next(), 0.5, 1.3, 0, -this.dx * 3, 0.4, -this.dz * 3);
      }
      this.side %= 2;
      // Pierce: every beast it passed since last frame, struck once.
      const n = H.inCapsule(this.ax + this.dx * prev, this.az + this.dz * prev, cx, cz, CRESCENT.halfW, this.found);
      for (let k = 0; k < n; k += 1) {
        const i = this.found[k]!;
        if (this.struck.has(i) || !H.alive(i)) continue;
        this.struck.add(i);
        const first = this.struck.size === 1;
        // Its imprint: the crescent cut across its body, smaller.
        crescentOf(H.stage, this.five.recipe.folder, this.five.recipe.ramp).cut(w.set(H.x(i), Math.max(0.5, H.midY(i)), H.z(i)), rot, CRESCENT.imprint, null);
        const killed = this.five.hit("k2", i, this.dx, this.dz, first ? "primary" : "secondary", 0.95, true);
        if (first) H.strike("k2", w.set(H.x(i), H.midY(i), H.z(i)), "primary", this.dx, this.dz);
        if (this.last !== null) {
          this.last.hits += 1;
          if (killed) this.last.kills += 1;
          this.last.struck.push(i);
        }
      }
      if (this.s >= CRESCENT.lengthM) {
        // It lands where its line ends: the big cut, its ring and lotus on the ground, the line's burn.
        this.landed = true;
        if (this.last !== null) this.last.landedAt = this.t;
        crescentOf(H.stage, this.five.recipe.folder, this.five.recipe.ramp).cut(v.set(cx, y, cz), rot, CRESCENT.size, null);
        this.five.twinkle(v, 2.0, 0.5, 2.0);
        H.strike("k2", v, "finisher", this.dx, this.dz);
        const mx = this.ax + this.dx * CRESCENT.lengthM * 0.5;
        const mz = this.az + this.dz * CRESCENT.lengthM * 0.5;
        this.five.aftermath(mx, mz, 2.6, 0.02, this.dx, this.dz, CRESCENT.lengthM * 0.95);
        this.five.aftermath(cx, cz, 2.6, 0.05);
      }
    }
    if (this.landed && this.t > CRESCENT.lengthM / CRESCENT.speed + 0.2) this.on = false;
  }

  reset(): void {
    this.on = false;
    this.struck.clear();
  }
}
