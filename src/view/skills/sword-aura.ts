/**
 * The flying swords' aura (docs/games/tu-tien/skills/SWORD_AURA.md; the owner's pick of 03/11/2026: direction A, the
 * Wind-Silk Mantle, plus C's tip star): the weapon owns the aura's SHAPE, the element its MATTER (canon D59).
 *
 * This module is the shared part (§5.2):
 * - SWORD_AURA_LOOK / applySwordAuraLook: the element's matter as one set of uniforms every aura layer reads (like
 *   sword-material.ts SWORD_LOOK);
 * - SwordAura: the owner the host makes once and hands to the sword modules (sword-skills.ts, key 1; myriad-swords.ts,
 *   key 7), like BladeSet and SwordImpostors. Each frame the modules push every sword that wears the aura (its guard
 *   point, tip direction, length, tier and state); SwordAura keeps a short history per sword (speed, turn rate and
 *   side, release and strike ages, its flow phase and its tip star's twinkle), thins the aura where swords crowd
 *   (§4.7), caps Fire's licking flames (≤ 14 a frame), and hands each record to the chosen direction, which draws it.
 * The direction (aura-mantle.ts) owns the layers, their states, tiers and reduced-motion rules. "off" draws nothing
 * and changes nothing: every sword module keeps its old layers when the aura is off (SWORD_AURA §5.1).
 * View only, no allocation per frame (records are reused arrays).
 */
import * as THREE from "three";
import type { AuraAnchors } from "./blades";
import type { ElementKit, SwordAuraLook } from "./element-kit";

/** Light bodies stay under the bloom: ≤ 0.85 a channel (the rule's 0.9, 0.05 kept in hand). */
export const AURA_BODY_MAX = 0.85;

/** Scales a colour down to `max` on its largest channel, keeping its hue (no allocation: into `out`). */
export function clampHue(c: readonly number[], max: number, out: THREE.Vector3): THREE.Vector3 {
  const m = Math.max(c[0]!, c[1]!, c[2]!, 1e-6);
  const k = m > max ? max / m : 1;
  return out.set(c[0]! * k, c[1]! * k, c[2]! * k);
}

const MODES = { qi: 0, flame: 1, water: 2 } as const;

/**
 * The element's aura matter on every aura layer (one set of uniforms, shared by reference). Colours linear; `core`
 * is the unit core × coreHdr (HDR), every other light ≤ 0.85.
 */
export const SWORD_AURA_LOOK = {
  mode: { value: 0 },
  core: { value: new THREE.Vector3(0.62 * 3, 0.88 * 3, 3) },
  edge: { value: new THREE.Vector3(0.6, 0.76, 0.85) },
  body: { value: new THREE.Vector3(0.3, 0.62, 0.85) },
  deep: { value: new THREE.Vector3(0.3, 0.62, 0.85) },
  soot: { value: new THREE.Vector3(0.02, 0.028, 0.06) },
  ink: { value: new THREE.Vector4(0.02, 0.028, 0.06, 0.35) },
  /** hardness, breakup, reach (blade widths), flicker (Hz). */
  shape: { value: new THREE.Vector4(0.7, 0.15, 0, 0) },
  /** flow speed (blade lengths/s), per m/s, scale, buoyancy. */
  flow: { value: new THREE.Vector4(0.6, 0.04, 1, 0) },
};

/** The look as applied last (the modules read flow and flicker on the CPU). */
let current: SwordAuraLook | null = null;

/** Puts an element's aura matter on every aura layer (load time; no allocation). The body is clamped ≤ 0.85. */
export function applySwordAuraLook(look: SwordAuraLook): void {
  current = look;
  const L = SWORD_AURA_LOOK;
  L.mode.value = MODES[look.mode];
  const c = look.ramp.core;
  L.core.value.set(c[0] * look.coreHdr, c[1] * look.coreHdr, c[2] * look.coreHdr);
  clampHue(look.ramp.edge, AURA_BODY_MAX, L.edge.value);
  clampHue(look.ramp.body, AURA_BODY_MAX, L.body.value);
  clampHue(look.deep ?? look.ramp.body, AURA_BODY_MAX, L.deep.value);
  L.soot.value.set(look.ramp.soot[0], look.ramp.soot[1], look.ramp.soot[2]);
  L.ink.value.set(look.ink.rgb[0], look.ink.rgb[1], look.ink.rgb[2], look.ink.alpha);
  L.shape.value.set(look.edge, look.breakup, look.reachW, look.flickerHz);
  L.flow.value.set(look.flow.speed, look.flow.perMps, look.flow.scale, look.flow.buoyancy);
}

/** The aura matter applied last (null before the first). */
export function swordAuraLook(): SwordAuraLook | null {
  return current;
}

const profiles = new WeakMap<AuraAnchors, THREE.DataTexture>();

/**
 * The weapon's blade profile as a 96 × 1 texture (the anchors' half widths over their maximum, linear filtering): the
 * aura's shaders read the blade's outline from it (SWORD_AURA §5.2). Cached per anchors; load time.
 */
export function profileTexture(anchors: AuraAnchors): THREE.DataTexture {
  let t = profiles.get(anchors);
  if (t === undefined) {
    const p = anchors.profile;
    let max = 0;
    for (let i = 0; i < p.length; i += 1) max = Math.max(max, p[i]!);
    const data = new Uint8Array(p.length * 4);
    for (let i = 0; i < p.length; i += 1) {
      const v = Math.round((255 * p[i]!) / Math.max(max, 1e-6));
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    t = new THREE.DataTexture(data, p.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    profiles.set(anchors, t);
  }
  return t;
}

// ── The switch ───────────────────────────────────────────────────────────────

/** The lab's switch (§5.1): `off` (today's look) or a direction's code; only the chosen direction has one. */
export type AuraId = "off" | "a";
/** Full names by code (`a` = wind-silk-mantle). */
export const AURA_NAMES: Readonly<Record<AuraId, string>> = { off: "off", a: "wind-silk-mantle" };

/** A switch value from a flag or a name ("a", "wind-silk-mantle", "off"); unknown: off. */
export function auraIdOf(value: string | null | undefined): AuraId {
  if (value === "a" || value === AURA_NAMES.a) return "a";
  return "off";
}

/** Direction A's layers (SWORD_AURA §3.A, plus C's TipStar), each with its own switch and intensity (§3, §5.1). */
export const AURA_LAYERS = ["MantleSheath", "MantleHull", "SilkTail", "MantleHalo", "TipStar"] as const;
export type AuraLayerName = (typeof AURA_LAYERS)[number];

/** Sword tiers: lead blades (and key 1's swords) draw the full model, mid swords its LOD, far swords are impostors. */
export const AURA_LEAD = 0;
export const AURA_MID = 1;
export const AURA_FAR = 2;

/** States (§3 "Các trạng thái"): waiting at its place while a word is typed, in flight, struck, going. */
export const AURA_WAIT = 0;
export const AURA_FLY = 1;
export const AURA_STRIKE = 2;
export const AURA_FADE = 3;

/** One sword wearing the aura this frame (the module fills `SwordAura.input`, then calls push). */
export interface AuraSwordInput {
  /** Stable per sword across frames (its history): the module's own range (SwordAura.range). */
  id: number;
  /** The guard point (unit y = 0, m), the unit tip direction, the blade's length guard to tip (m). */
  gx: number;
  gy: number;
  gz: number;
  dx: number;
  dy: number;
  dz: number;
  blade: number;
  /** The pommel's end on the unit blade (< 0). */
  pommelY: number;
  /** Share of the blade's width shown (a blade rolled away from the camera reads narrower). */
  widthK: number;
  /** AURA_LEAD, AURA_MID. */
  cls: number;
  /** AURA_WAIT, AURA_FLY, AURA_STRIKE, AURA_FADE. */
  state: number;
  /** Waiting: the typing tier's width (0.4 / 0.7 / 1.0); 1 otherwise. */
  level: number;
  /** Seconds since it left on a release (−1: not a release flight). */
  releaseAge: number;
  /** Presence 0..1 (scale-in), and its dissolve into light (0 whole … 1 gone). */
  presence: number;
  dissolve: number;
  /** The stream's brightness where it flies (key 7's waves, 0.45–1; 1 elsewhere), and whether it dives on a beast. */
  bright: number;
  diving: boolean;
  /** Key 1's swords and key 7's lead blades: always a tip star, always licking flame on Fire. */
  hero: boolean;
}

/** A pushed sword with what SwordAura worked out for it (read by the direction; reused). */
export interface AuraRecord extends AuraSwordInput {
  /** Speed (m/s), turn rate (rad/s), turn side on screen (−1 … 1: + turning toward the left of its axis). */
  speed: number;
  omega: number;
  turn: number;
  /** Seconds since its last hit (−1: none recent), and its flow phase (blade lengths, tip → pommel). */
  strikeAge: number;
  flow: number;
  /** Swords within 40 CSS px of it on screen (§4.7), and its screen length (CSS px, pommel to tip). */
  crowd: number;
  screenPx: number;
  /** Fire: licking flame (1), ember mantle (2); Metal 0. Its tip star (0 none … the star's level). */
  flame: number;
  star: number;
  /** The star's smoothed direction (unit, follows the flight within ~4 frames) and its twinkle (0 … 1). */
  sx: number;
  sy: number;
  sz: number;
  twinkle: number;
  /** A word graded perfect or flash was cast this frame on this sword (§4.9): the ring's pulse starts. */
  graded: boolean;
}

/** What draws the records (aura-mantle.ts): its meshes, built once, and its fill each frame. */
export interface AuraDrawer {
  readonly meshes: readonly THREE.Object3D[];
  /** The records of this frame (count `n`), the aura's clock, the frame's world step. */
  draw(records: readonly AuraRecord[], n: number, aura: SwordAura, dt: number): void;
  hide(): void;
  setAnchors(anchors: AuraAnchors, pommelY: number): void;
  /** The weapon's blade geometry for a hull (unit jian; null: none). */
  setHullSource?(geometry: THREE.BufferGeometry | null, anchors: AuraAnchors): void;
  setElement(kit: ElementKit): void;
  /** Layer timings (GpuTimer), by layer name, one mesh each. */
  readonly timed: readonly { readonly layer: AuraLayerName; readonly mesh: THREE.Object3D }[];
  /** Compiles its programs now (load time). */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void;
}

/** Swords a frame can wear the aura (key 1's three, key 7's leads and mid swords on Ultra, room to spare). */
const RECORDS = 96;
/** History slots (ids): key 1's blade slots and key 7's pool each take a range. */
const IDS = 1024;
/** Key 7 caps its licking flames (§3.A Fire): ≤ 14 a frame, mid swords ≤ 8 of them. */
export const FLAME_CAP = 14;
export const FLAME_MID_CAP = 8;

function emptyRecord(): AuraRecord {
  return {
    id: 0, gx: 0, gy: 0, gz: 0, dx: 0, dy: 1, dz: 0, blade: 1, pommelY: -0.3, widthK: 1, cls: AURA_LEAD, state: AURA_FLY, level: 1, releaseAge: -1, presence: 1, dissolve: 0, bright: 1, diving: false, hero: false,
    speed: 0, omega: 0, turn: 0, strikeAge: -1, flow: 0, crowd: 0, screenPx: 0, flame: 0, star: 0, sx: 0, sy: 1, sz: 0, twinkle: 0, graded: false,
  };
}

/** Per-id history (structure of arrays). */
class History {
  readonly seen = new Uint8Array(IDS);
  readonly frame = new Int32Array(IDS);
  readonly gx = new Float32Array(IDS);
  readonly gy = new Float32Array(IDS);
  readonly gz = new Float32Array(IDS);
  readonly dx = new Float32Array(IDS);
  readonly dy = new Float32Array(IDS);
  readonly dz = new Float32Array(IDS);
  readonly speed = new Float32Array(IDS);
  readonly omega = new Float32Array(IDS);
  readonly turn = new Float32Array(IDS);
  readonly state = new Uint8Array(IDS);
  readonly strikeAt = new Float64Array(IDS).fill(-1);
  readonly flow = new Float32Array(IDS);
  readonly sx = new Float32Array(IDS);
  readonly sy = new Float32Array(IDS);
  readonly sz = new Float32Array(IDS);
  /** The star's next twinkle (aura time, s) and the last one's start. */
  readonly twNext = new Float64Array(IDS);
  readonly twAt = new Float64Array(IDS).fill(-10);
  /** The screen axis angle last frame (turn side). */
  readonly ang = new Float32Array(IDS);
  /** Fire's tier chosen for it last frame (1 licking flame). */
  readonly flame = new Uint8Array(IDS);
}

/** A seeded hash in [0, 1) of an integer (per-sword phases; no Math.random in the view's steady state). */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * The aura's owner (SWORD_AURA §4.8 "Kết nối"): one per host, handed to every sword module. begin() before the sword
 * modules update, push() for each sword that wears the aura, end() after them all.
 */
export class SwordAura {
  /** The direction drawn (off: nothing, and the modules keep their old layers). */
  private id: AuraId = "off";
  /** Filled by a module, then push(). */
  readonly input: AuraSwordInput = emptyRecord();
  private readonly records: AuraRecord[] = Array.from({ length: RECORDS }, emptyRecord);
  private n = 0;
  private readonly hist = new History();
  private frameNo = 0;
  /** The aura's clock (world seconds: a hit-stop holds it). */
  time = 0;
  /** Reduced motion (resolveReducedMotion: ?motion=, the setting, the system): flow slowed, no breathing or twinkle. */
  reduced = false;
  /** Per layer: on and intensity (the lab's __lab.auraLayer; the judges score each layer alone). */
  readonly layers: Record<AuraLayerName, { on: boolean; intensity: number }> = {
    MantleSheath: { on: true, intensity: 1 },
    MantleHull: { on: true, intensity: 1 },
    SilkTail: { on: true, intensity: 1 },
    MantleHalo: { on: true, intensity: 1 },
    TipStar: { on: true, intensity: 1 },
  };
  /** The element's matter now (its mode decides Fire's tiers). */
  kit: ElementKit | null = null;
  /** The weapon's anchors (setAnchors), shared by every tier (one GLB). */
  anchors: AuraAnchors | null = null;
  pommelY = -0.3;
  /** Draws the records (the direction's layers); null until a direction is installed. */
  private drawer: AuraDrawer | null = null;
  /** The camera's position this frame (the direction weighs its card against its hull by the view). */
  readonly camPos = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly vpm = new THREE.Matrix4();
  /** CSS viewport (px) for the crowding count. */
  viewW = 1920;
  viewH = 1080;
  /** Mid swords chosen for Fire's licking flame (ids), scratch. */
  private readonly flameOrder = new Int32Array(RECORDS);
  /** A perfect or flash word's ring pulse (§4.9): key 1's next launches carry it. */
  private gradedUntil = -1;

  constructor(readonly quality: "low" | "medium" | "high" | "ultra") {}

  /** The direction drawn (off: nothing). */
  get direction(): AuraId {
    return this.id;
  }

  /** True when a direction is drawn: the sword modules replace the layers it stands for (§4.6). */
  get on(): boolean {
    return this.id !== "off" && this.drawer !== null;
  }

  /** The direction's drawer (aura-mantle.ts makes it; the host adds its meshes to the scene). */
  install(drawer: AuraDrawer): void {
    this.drawer = drawer;
    if (this.anchors !== null) drawer.setAnchors(this.anchors, this.pommelY);
    if (this.kit !== null) drawer.setElement(this.kit);
  }

  get meshes(): readonly THREE.Object3D[] {
    return this.drawer?.meshes ?? [];
  }

  setDirection(id: AuraId): void {
    if (id === this.id) return;
    this.id = id;
    this.drawer?.hide();
    this.hist.seen.fill(0);
  }

  /** The equipped weapon's anchors (its full model; every tier is the same GLB). */
  setAnchors(anchors: AuraAnchors, pommelY: number): void {
    this.anchors = anchors;
    this.pommelY = pommelY;
    this.drawer?.setAnchors(anchors, pommelY);
  }

  /** The element's matter (load time): every aura layer reads it (SWORD_AURA_LOOK). */
  setElement(kit: ElementKit): void {
    this.kit = kit;
    applySwordAuraLook(kit.swordAura);
    this.drawer?.setElement(kit);
  }

  /** A layer's switch and intensity; unknown names are ignored (false). */
  setLayer(name: string, on: boolean, intensity = 1): boolean {
    const l = (this.layers as Record<string, { on: boolean; intensity: number }>)[name];
    if (l === undefined) return false;
    l.on = on;
    l.intensity = Math.max(0, intensity);
    return true;
  }

  /** The layer's weight now (0 when off or the aura is off). */
  weight(name: AuraLayerName): number {
    if (!this.on) return 0;
    const l = this.layers[name];
    return l.on ? l.intensity : 0;
  }

  /** A word graded perfect or flash (src/typing/grading.ts gradeOf) was cast now: its swords' rings pulse once. */
  graded(): void {
    this.gradedUntil = this.time + 0.2;
  }

  begin(): void {
    this.n = 0;
  }

  /** Pushes `input` as one sword this frame (ignored when the aura is off or the records are full). */
  push(): void {
    if (!this.on || this.n >= RECORDS) return;
    const a = this.input;
    if (a.presence <= 0.002 || a.blade <= 1e-4) return;
    const r = this.records[this.n]!;
    r.id = Math.max(0, Math.min(IDS - 1, a.id | 0));
    r.gx = a.gx;
    r.gy = a.gy;
    r.gz = a.gz;
    const l = Math.hypot(a.dx, a.dy, a.dz) || 1;
    r.dx = a.dx / l;
    r.dy = a.dy / l;
    r.dz = a.dz / l;
    r.blade = a.blade;
    r.pommelY = a.pommelY;
    r.widthK = a.widthK;
    r.cls = a.cls;
    r.state = a.state;
    r.level = a.level;
    r.releaseAge = a.releaseAge;
    r.presence = a.presence;
    r.dissolve = a.dissolve;
    r.bright = a.bright;
    r.diving = a.diving;
    r.hero = a.hero;
    this.n += 1;
  }

  /** Records pushed this frame. */
  get count(): number {
    return this.n;
  }

  /** The records of this frame (probes, tests). */
  record(i: number): AuraRecord | null {
    return i >= 0 && i < this.n ? this.records[i]! : null;
  }

  /**
   * After every module pushed: histories (speed, turn, strike, flow, star), crowding, Fire's flame cap, then the
   * direction draws. `dt` is the world step (0 in a hit-stop: everything holds).
   */
  end(dt: number, camera: THREE.Camera): void {
    this.frameNo += 1;
    this.time += dt;
    if (!this.on) {
      this.drawer?.hide();
      return;
    }
    camera.getWorldPosition(this.camPos);
    camera.updateMatrixWorld();
    this.vpm.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
    const H = this.hist;
    const look = this.kit?.swordAura ?? null;
    const flowK = this.reduced ? (look?.reduced.flow ?? 0.3) : 1;
    for (let k = 0; k < this.n; k += 1) {
      const r = this.records[k]!;
      const id = r.id;
      const fresh = H.seen[id] === 0 || H.frame[id] !== this.frameNo - 1;
      // Screen axis (CSS px), for the turn side, the crowding and the sword's size on screen.
      const L = r.blade * (1 - r.pommelY);
      const mid = (1 + r.pommelY) * 0.5 * r.blade;
      this.v.set(r.gx + r.dx * mid, r.gy + r.dy * mid, r.gz + r.dz * mid).applyMatrix4(this.vpm);
      this.w.set(r.gx + r.dx * r.blade, r.gy + r.dy * r.blade, r.gz + r.dz * r.blade).applyMatrix4(this.vpm);
      const mx = (this.v.x * 0.5 + 0.5) * this.viewW;
      const my = (0.5 - this.v.y * 0.5) * this.viewH;
      const tx = (this.w.x * 0.5 + 0.5) * this.viewW;
      const ty = (0.5 - this.w.y * 0.5) * this.viewH;
      r.screenPx = (Math.hypot(tx - mx, ty - my) * L) / Math.max(1e-4, r.blade - mid);
      r.crowd = 0;
      // Stash the screen centre in the star fields until the crowding pass (they are set again below).
      r.sx = mx;
      r.sy = my;
      const ang = Math.atan2(ty - my, tx - mx);
      if (fresh) {
        H.speed[id] = 0;
        H.omega[id] = 0;
        H.turn[id] = 0;
        H.flow[id] = hash01(id * 7 + 1);
        H.sx[id] = r.dx;
        H.sy[id] = r.dy;
        H.sz[id] = r.dz;
        H.strikeAt[id] = -1;
        H.twNext[id] = this.time + 0.4 + 1.2 * hash01(id * 13 + 5);
        H.twAt[id] = -10;
      } else if (dt > 0) {
        const sp = Math.hypot(r.gx - H.gx[id]!, r.gy - H.gy[id]!, r.gz - H.gz[id]!) / dt;
        const cos = Math.max(-1, Math.min(1, r.dx * H.dx[id]! + r.dy * H.dy[id]! + r.dz * H.dz[id]!));
        const om = Math.acos(cos) / dt;
        // Smoothed over ~3 frames at 60 Hz (half-life 0.035 s), on the world step.
        const kf = 1 - Math.pow(0.5, dt / 0.035);
        H.speed[id] = H.speed[id]! + (Math.min(sp, 80) - H.speed[id]!) * kf;
        H.omega[id] = H.omega[id]! + (Math.min(om, 40) - H.omega[id]!) * kf;
        let da = ang - H.ang[id]!;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        const side = Math.max(-1, Math.min(1, (da / dt) / 6));
        H.turn[id] = H.turn[id]! + (side - H.turn[id]!) * kf;
      }
      H.ang[id] = ang;
      // A new hit starts the strike clock; it runs on after the state leaves (the plates realign over 12 frames).
      if (r.state === AURA_STRIKE && (fresh || H.state[id] !== AURA_STRIKE)) H.strikeAt[id] = this.time;
      H.state[id] = r.state;
      r.strikeAge = H.strikeAt[id]! >= 0 && this.time - H.strikeAt[id]! < 0.6 ? this.time - H.strikeAt[id]! : -1;
      r.speed = H.speed[id]!;
      r.omega = H.omega[id]!;
      r.turn = H.turn[id]!;
      // Flow: tip → pommel, blade lengths a second (§3.A: 0.6 + 0.04 v in flight, 0.15 waiting), on world time.
      const flow = look === null ? 0.6 : r.state === AURA_WAIT ? 0.15 : look.flow.speed + look.flow.perMps * r.speed;
      H.flow[id] = (H.flow[id]! + flow * flowK * dt) % 1024;
      r.flow = H.flow[id]!;
      // The tip star's direction follows the flight within ~4 frames (half-life 0.03 s).
      const ks = dt > 0 ? 1 - Math.pow(0.5, dt / 0.03) : 0;
      let ux = H.sx[id]! + (r.dx - H.sx[id]!) * ks;
      let uy = H.sy[id]! + (r.dy - H.sy[id]!) * ks;
      let uz = H.sz[id]! + (r.dz - H.sz[id]!) * ks;
      const ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-4) {
        ux = r.dx;
        uy = r.dy;
        uz = r.dz;
      } else {
        ux /= ul;
        uy /= ul;
        uz /= ul;
      }
      H.sx[id] = ux;
      H.sy[id] = uy;
      H.sz[id] = uz;
      // Twinkle (§3.C TipStar): at rest 0, every 1.4–2.2 s (its own seed) up to 1 over 10 frames and back.
      if (this.time >= H.twNext[id]!) {
        H.twAt[id] = this.time;
        H.twNext[id] = this.time + 1.4 + 0.8 * hash01(id * 31 + Math.floor(this.time * 3));
      }
      const tw = (this.time - H.twAt[id]!) / (10 / 60);
      r.twinkle = this.reduced ? 0 : tw < 0 || tw > 2 ? 0 : tw < 1 ? tw * tw * (3 - 2 * tw) : 1 - (tw - 1) * (tw - 1) * (3 - 2 * (tw - 1));
      r.graded = r.hero && r.releaseAge >= 0 && r.releaseAge < 0.02 && this.time <= this.gradedUntil;
      H.gx[id] = r.gx;
      H.gy[id] = r.gy;
      H.gz[id] = r.gz;
      H.dx[id] = r.dx;
      H.dy[id] = r.dy;
      H.dz[id] = r.dz;
      H.seen[id] = 1;
      H.frame[id] = this.frameNo;
    }
    // Crowding (§4.7): swords with ≥ 3 others within 40 CSS px on screen thin their aura (n² over ≤ 96 swords).
    for (let a = 0; a < this.n; a += 1) {
      const ra = this.records[a]!;
      for (let b = a + 1; b < this.n; b += 1) {
        const rb = this.records[b]!;
        const ddx = ra.sx - rb.sx;
        const ddy = ra.sy - rb.sy;
        if (ddx * ddx + ddy * ddy < 1600) {
          ra.crowd += 1;
          rb.crowd += 1;
        }
      }
    }
    for (let k = 0; k < this.n; k += 1) {
      const r = this.records[k]!;
      r.sx = H.sx[r.id]!;
      r.sy = H.sy[r.id]!;
      r.sz = H.sz[r.id]!;
    }
    this.chooseFlames();
    this.drawer!.draw(this.records, this.n, this, dt);
  }

  /**
   * Fire's tiers (§3.A Fire): key 1's swords and key 7's lead blades lick flame; mid swords wear the ember mantle, and
   * up to 8 of them (diving first, then the brightest on the stream's crest, bright ≥ 0.85) lick flame too; ≤ 14 a
   * frame. Metal: 0.
   */
  private chooseFlames(): void {
    const fire = this.kit?.swordAura.mode === "flame";
    let heroes = 0;
    let cands = 0;
    for (let k = 0; k < this.n; k += 1) {
      const r = this.records[k]!;
      r.flame = 0;
      if (!fire) continue;
      if (r.hero || r.cls === AURA_LEAD) {
        if (heroes < FLAME_CAP) {
          r.flame = 1;
          heroes += 1;
        } else r.flame = 2;
      } else {
        r.flame = 2;
        if (r.diving || r.bright >= 0.85) this.flameOrder[cands++] = k;
      }
    }
    if (!fire || cands === 0) {
      for (let k = 0; k < this.n; k += 1) this.hist.flame[this.records[k]!.id] = this.records[k]!.flame;
      return;
    }
    // Diving first, then the brightest (insertion sort over ≤ 96).
    const key = (k: number): number => (this.records[k]!.diving ? 2 : 0) + this.records[k]!.bright;
    for (let i = 1; i < cands; i += 1) {
      const v = this.flameOrder[i]!;
      let j = i - 1;
      while (j >= 0 && key(this.flameOrder[j]!) < key(v)) {
        this.flameOrder[j + 1] = this.flameOrder[j]!;
        j -= 1;
      }
      this.flameOrder[j + 1] = v;
    }
    const room = Math.min(FLAME_MID_CAP, FLAME_CAP - heroes);
    for (let i = 0; i < cands && i < room; i += 1) this.records[this.flameOrder[i]!]!.flame = 1;
    for (let k = 0; k < this.n; k += 1) this.hist.flame[this.records[k]!.id] = this.records[k]!.flame;
  }

  /** Whether sword `id` licked flame on the last frame (Fire's tier; a kit sheds embers off it). */
  licking(id: number): boolean {
    return this.on && id >= 0 && id < IDS && this.hist.flame[id] === 1 && this.hist.frame[id] === this.frameNo;
  }

  /** Swords licking flame this frame (Fire's cap check). */
  flames(): number {
    let n = 0;
    for (let k = 0; k < this.n; k += 1) if (this.records[k]!.flame === 1) n += 1;
    return n;
  }

  /**
   * The SilkTail's body (SWORD_AURA §3.A): the tassel silk's light (Clear Wind's #A9C4EA × 0.7) with 30 % of the element's
   * body, ≤ 0.7 a channel. The deep edge is the motif's silkDeep.
   */
  get silkBody(): readonly number[] {
    const l = this.silkLight;
    const b = SWORD_AURA_LOOK.body.value;
    const c = this.silkTmp;
    c[0] = l[0]! * 0.7 + b.x * 0.3;
    c[1] = l[1]! * 0.7 + b.y * 0.3;
    c[2] = l[2]! * 0.7 + b.z * 0.3;
    const m = Math.max(c[0], c[1], c[2], 1e-6);
    if (m > 0.7) for (let k = 0; k < 3; k += 1) c[k] = c[k]! * (0.7 / m);
    return c;
  }

  /** The weapon's silk light (WeaponMotif.silkLight; the lab sets it with the weapon). */
  silkLight: readonly number[] = [0.43, 0.53, 0.7];
  private readonly silkTmp = [0, 0, 0];

  /** Compiles the direction's programs (load time; the first cast must not stall on them). */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.drawer?.prewarm(renderer, camera);
  }

  /** Hides every aura mesh (a reset). */
  hide(): void {
    this.n = 0;
    this.drawer?.hide();
  }

  /** Layer meshes to time (GpuTimer), by layer. */
  get timed(): readonly { readonly layer: AuraLayerName; readonly mesh: THREE.Object3D }[] {
    return this.drawer?.timed ?? [];
  }
}
