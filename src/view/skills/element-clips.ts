/**
 * The element kits drawn from clips (canon D59, ELEMENT_LAYER §1–3; owner 05/11/2026: "thêm 2 agent để xử lý cho hình
 * ảnh vào lab dần"): every element after Metal and Fire draws the Sword's shapes (key 0–7: paths, counts and timing
 * unchanged) with the Firefly clips of its own folder, art-src/lab/vfx/<id>/manifest.json, picked by each entry's
 * `role` (ClipRole; docs/work/tasks/lab-flipbooks.md). Code only places, times and animates the clips (the
 * game-vfx-production rule; no flame, bolt, crack or wave is drawn in code), a few layers a hook:
 * - charge: the charge clip scrubbed by the typing level at the hand, its sparkle loop round it; a sparkle at the hand
 *   on each key and a release pop where a blade appears;
 * - release: the release clip at the hand, its sparkle, a light; a big release (key 7, tier 3) adds the big burst
 *   behind the caster and a ground blow at the feet;
 * - travel: the sheath clip wrapped along every flying or waiting blade (off while the sword aura carries the matter),
 *   sparkles shed along the path, the ribbon clip as the trail (TrailLook.flame);
 * - impact: the impact clip (big blows: the big burst), its sparkle, a light; how a blow lands is the element's law
 *   (ClipLook.hit): in place, flowing on past the beast (Water), or judged from the sky (Thunder); a cut is the slash
 *   clip, an area's burst is the big burst over a ground blow;
 * - aftermath: the ground blow and the ground mark (laid flat, seen from above) where a blow lands, the sparkle
 *   lingering over it; key 7's lead blades, its finisher's cut and its pinned victims hit the ground the same way.
 * Replace, never stack: a hook draws its layer and returns true only when its clip is in; a role with no clip yet
 * returns false and the base layer draws in the kit's palette, so a kit works before its clips arrive and a reload
 * shows each clip as it lands. Fast attack, slow decay: a one-shot reaches its peak frame (the manifest's timing) in a
 * few hundredths of a second, then plays its hold and decay over the role's tail (TIMES × the element's linger); matter
 * clips (heat, rgba) burn out by erosion, light clips (fire mode) fade with the clip's own decay. No allocation per
 * frame.
 */
import * as THREE from "three";
import type {
  AftermathArgs, AreaBurstArgs, AreaHitArgs, BladeLook, ChargeFrameArgs, ChargeKeyArgs, ClipRole, CutArgs, DeathArgs,
  ElementHooks, ElementId, ElementKit, ElementRamp, FlameTrail, FlyingCutArgs, FoeStatus, ImpactArgs, LaunchArgs, ReleaseArgs,
  ScreenAccent, SigilLook, StreamGlintArgs, StreamPlantArgs, StreamSeamArgs, StreamSegmentArgs, StreamSparkArgs,
  StreamStrikeArgs, StreamTone, StreamTravelArgs, SwordAuraLook, TrailLook, TravelArgs,
} from "./element-kit";
import type { ElementStage } from "./element-stage";
import { ONE_FRAME, type FlipbookLibrary, type FlipbookMode, type FlipbookPool, type FlipOptions } from "./flipbook";
import { CUT } from "./sword-grammar";
import { glowOf, glowOfRamp, rimOf, type Rgb, type WeaponGlow } from "./weapons";

/** Linear RGB of an sRGB hex (load time). */
export function lin(hex: string): Rgb {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export const CLIP_ROLES: readonly ClipRole[] = ["charge", "release", "ribbon", "sheath", "impact", "burst", "groundImpact", "sparkle", "slash", "groundMark"];

/** How an element's clips are drawn (its law in placement and time; colours are the clips' own or the heat ramp). */
export interface ClipLook {
  /** Each role's draw mode; absent: the manifest's (clips on black: "fire", light added). */
  readonly modes: Partial<Record<ClipRole, FlipbookMode>>;
  /**
   * The heat ramp of "heat" pools (linear): the cooling rim (alpha 0.85: it covers the pale stone, the anti-veil), the
   * body's deep and light ends, the thin core (× 2.2, the only part that blooms). Also what "rgba" pools erode toward.
   */
  readonly heat: { readonly soot: Rgb; readonly deep: Rgb; readonly mid: Rgb; readonly core: Rgb };
  /** "fire" pools: how much the ground under the light darkens by its luminance (0 purely added). */
  readonly occlude: number;
  /** "fire" pools: the clips' light × this (keep ≤ ~1.2: the clips carry their own bloom). */
  readonly gain: number;
  /** The impact light's colour (CSS hex). */
  readonly light: string;
  /**
   * How a blow lands (the element's law, ELEMENT_LAYER §2): in place ("burst"); flowing on past the beast along the
   * blow ("flow": Water, Wind); judged from the sky onto it ("strike": Thunder, Light, Star); stilled a beat, then
   * broken ("shatter": Ice, Void); crushed down into the ground at its feet ("crush": Earth); claiming the ground under
   * it at once ("claim": Wood's roots, Poison's pool); its light drained back toward the caster ("drain": Blood).
   */
  readonly hit: "burst" | "flow" | "strike" | "shatter" | "crush" | "claim" | "drain";
  /** Every clip's size × this. */
  readonly scale: number;
  /** Every one-shot's tail (its hold and decay after the peak, TIMES) × this: water lingers, lightning is gone sooner. */
  readonly linger: number;
  /**
   * The colour of a "body" layer (matter filmed on white, smoke mode, drawn under the rim's light; linear, lit ×1.4 at
   * its top); absent: the heat ramp's deep end.
   */
  readonly body?: Rgb;
}

/** What an element kit made of clips is (the ElementKit fields; the trail is built from `trailW` and the heat ramp). */
export interface ClipKitSpec {
  readonly id: ElementId;
  readonly name: string;
  readonly verb: string;
  readonly ramp: ElementRamp;
  /** Every slot's VFX colours (glowOf): the accent (sRGB) and the rim's hex and depth (rimOf's gamma). */
  readonly accent: string;
  readonly rim: readonly [hex: string, gamma: number];
  /**
   * Instead, the slots' colours from a ramp (glowOfRamp: core, body, deep; sRGB): the core keeps the ramp's own pale
   * instead of the accent mixed toward white (a red accent mixed toward white reads pink).
   */
  readonly glowRamp?: readonly [core: string, body: string, deep: string];
  /** The struck beast's flash (0xRRGGBB). */
  readonly flashHex: number;
  readonly stream: StreamTone;
  readonly blade: BladeLook;
  readonly swordAura: SwordAuraLook;
  readonly foe: FoeStatus | null;
  readonly screen: ScreenAccent;
  readonly sigil?: SigilLook;
  /** The flight trail's width (m) and its thin HDR core (linear). */
  readonly trailW: number;
  readonly trailCore: Rgb;
  readonly sound: string;
  readonly look: ClipLook;
  /**
   * Atlases the owner turned down (their manifest md5): a manifest that still lists one is ignored for it, so the base
   * layer draws until its redraw (a new atlas, a new md5) lands.
   */
  readonly rejected?: readonly string[];
}

/** Where a one-shot's peak sits in its frames when its manifest gives none (share). */
const PEAK = 0.35;
/** From this share of its life a matter clip ("heat", "rgba") burns out by erosion. */
const COOL = 0.55;

/** Sprites a role's pool holds (key 7 strikes by the dozen; a sheath is redrawn every frame on every blade). */
const CAPACITY: Readonly<Record<ClipRole, number>> = {
  charge: 6, release: 48, ribbon: 48, sheath: 192, impact: 160, burst: 48, groundImpact: 96, sparkle: 640, slash: 64, groundMark: 128,
};
/** Draw order: ground marks under everything, bodies, then thin light on top. */
const ORDER: Readonly<Record<ClipRole, number>> = {
  groundMark: 5, groundImpact: 11, burst: 12, impact: 12, slash: 12, release: 13, charge: 13, ribbon: 12, sheath: 11, sparkle: 14,
};

/**
 * A one-shot's attack (s to its peak) and tail (s from its peak until it is gone, × the element's linger), by role:
 * fast attack, slow decay (owner 03/11; a 5 s Firefly clip is never played at its own length).
 */
const TIMES: Readonly<Record<ClipRole, readonly [attack: number, tail: number]>> = {
  charge: [0.1, 0.5], release: [0.05, 0.6], ribbon: [0.05, 0.5], sheath: [0.05, 0.5], impact: [0.05, 0.9], burst: [0.08, 1.5],
  groundImpact: [0.08, 1.3], sparkle: [0.05, 0.6], slash: [0.06, 0.75], groundMark: [0.12, 2.8],
};

const isRole = (r: string | undefined): r is ClipRole => r !== undefined && (CLIP_ROLES as readonly string[]).includes(r);

/**
 * Lays a pool's cards flat on the ground (a ground mark seen from above): the card's x along `dir` turned by `rot`
 * (none: world x), `span` m long (none: size × the cell's aspect), its height (size) across it, at the sprite's own
 * height. Adapted from element-fire.ts groundCard (its
 * strip variant left out).
 */
function layFlat(pool: FlipbookPool): void {
  const material = pool.mesh.material;
  material.customProgramCacheKey = () => "element-ground-card";
  material.onBeforeCompile = (shader) => {
    const start = shader.vertexShader.indexOf("  vec4 view = modelViewMatrix * vec4(iPos, 1.0);");
    if (start < 0) throw new Error("[element-clips] ground-card vertex anchor missing");
    shader.vertexShader = shader.vertexShader.slice(0, start) + `
  vec2 axis = length(iDir.xz) > 1e-5 ? normalize(iDir.xz) : vec2(1.0, 0.0);
  float c = cos(iData.y), s = sin(iData.y);
  axis = vec2(axis.x * c - axis.y * s, axis.x * s + axis.y * c);
  float spanX = iLift.y > 0.0 ? iLift.y : iData.x * uAspect;
  vec2 corner = axis * (uv.x - uPivot.x) * spanX + vec2(-axis.y, axis.x) * (uv.y - uPivot.y) * iData.x;
  vWorld = (modelMatrix * vec4(iPos + vec3(corner.x, 0.0, corner.y), 1.0)).xyz;
  vec4 view = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * view;
  if (iLift.x != 0.0) {
    vec4 moved = projectionMatrix * vec4(view.xy, view.z + iLift.x, 1.0);
    gl_Position.z = moved.z / moved.w * gl_Position.w;
  }
}`;
  };
}

const v = new THREE.Vector3();
const dirV = new THREE.Vector3();
const camF = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const opts: FlipOptions = {};
/** A body layer's options, filled from the rim's (`opts`) while it is still being spawned. */
const bodyOpts: FlipOptions = {};
const bodyTint = new THREE.Color();

/** The shared spawn options back to plain values (reused for every spawn, no allocation). */
function flip(o: FlipOptions = opts): FlipOptions {
  o.life = o.rate = o.frame = o.until = o.rot = o.spin = o.grow = o.alpha = o.intensity = o.occlude = o.erode = undefined;
  o.slowFrom = o.slowRate = undefined;
  o.vx = o.vy = o.vz = o.drag = o.gravity = o.ground = o.fadeIn = o.fadeOut = o.delay = o.cool = o.lift = undefined;
  o.tint = undefined;
  o.variant = undefined;
  o.dir = undefined;
  o.span = undefined;
  o.timing = undefined;
  return o;
}

/** First and last frame a pool plays (its v2 segment, else start … frames − 1). */
function span(p: FlipbookPool): [number, number] {
  const m = p.meta!;
  return m.frameRange !== undefined ? [m.frameRange[0], m.frameRange[1]] : [m.start, m.frames - 1];
}

/** What the lab reads (`__lab.clipKit`): spawns by role since the last reset and the pools a role has. */
export interface ClipAudit {
  spawned: Record<ClipRole, number>;
  pools: Record<ClipRole, number>;
  /** Body layers spawned under a rim, and the body pools a role has. */
  bodies: Record<ClipRole, number>;
  bodyPools: Record<ClipRole, number>;
}

const zeroRoles = (): Record<ClipRole, number> => Object.fromEntries(CLIP_ROLES.map((r) => [r, 0])) as Record<ClipRole, number>;

class ClipLayers {
  private readonly lib: FlipbookLibrary;
  private readonly pools = new Map<ClipRole, FlipbookPool[]>();
  /** "body" layers by role (matter on white, drawn under the role's clip). */
  private readonly bodies = new Map<ClipRole, FlipbookPool[]>();
  private readonly modes = new Map<FlipbookPool, FlipbookMode>();
  private readonly turn = new Map<ClipRole, number>();
  readonly audit: ClipAudit = { spawned: zeroRoles(), pools: zeroRoles(), bodies: zeroRoles(), bodyPools: zeroRoles() };
  private shedAcc = 0;
  private waitAcc = 0;
  private lastDt = 1 / 60;

  constructor(private readonly stage: ElementStage, private readonly spec: ClipKitSpec, private readonly trail: { flame?: FlameTrail }) {
    this.lib = stage.flipbooks.library(spec.id);
    this.lib.watch((id) => this.adopt(id));
  }

  /** A clip of the folder arrived: its role's pool is made and set up (load time, once per clip). */
  private adopt(id: string): void {
    const e = this.lib.get(id);
    const role = e?.meta.role;
    if (e === null || !isRole(role)) return;
    if (this.spec.rejected?.some((md5) => e.meta.url.includes("?v=" + md5)) === true) return;
    const body = e.meta.layer === "body";
    const lists = body ? this.bodies : this.pools;
    const list = lists.get(role) ?? [];
    if (list.some((p) => p.id === id)) return;
    const look = this.spec.look;
    // A rim over a body is the light it was filmed as (added); a clip alone takes the element's mode for its role.
    const paired = !body && this.lib.declares().some((m) => m.role === role && m.layer === "body");
    const mode = body || paired ? e.meta.mode : look.modes[role] ?? e.meta.mode;
    const pool = this.stage.flipbooks.pool(this.spec.id, id, { mode, capacity: CAPACITY[role], renderOrder: ORDER[role] - (body ? 1 : 0) });
    const h = look.heat;
    pool.setSoot(h.soot[0], h.soot[1], h.soot[2]);
    if (mode === "heat") {
      pool.setHeatRamp(h.deep, h.mid, h.core);
      // Read a little soft: a clip's dark cells close into a body instead of a crust.
      pool.blur = 0.8;
    }
    if (mode === "rgba") pool.setSharpen(0.06, 0.4);
    pool.softM = 0.25;
    // A burst reaching its cell's edge would show the square: round the corners off.
    if (role === "impact" || role === "burst" || role === "release" || role === "charge" || role === "groundImpact") pool.vignette = 0.5;
    // A vertical sheath (9:16) flows up its cell: its height follows the blade.
    if (role === "sheath" && e.meta.aspect < 1 && e.meta.heading === 0) pool.attach({ ...e.meta, heading: Math.PI / 2 }, e.texture, e.controls);
    if (role === "groundMark") layFlat(pool);
    list.push(pool);
    lists.set(role, list);
    this.modes.set(pool, mode);
    if (body) {
      this.audit.bodyPools[role] = list.length;
      return;
    }
    this.audit.pools[role] = list.length;
    // The ribbon is the flight's trail, coloured through the heat ramp (RibbonPool.setFlame).
    if (role === "ribbon" && this.trail.flame === undefined) this.trail.flame = { clip: id, soot: h.soot, deep: h.deep, amber: h.mid, core: h.core };
  }

  /** A ready pool of `role` (several clips of one role take turns), else null: the hook declines. */
  private pick(role: ClipRole): FlipbookPool | null {
    const list = this.pools.get(role);
    if (list === undefined) return null;
    const t = this.turn.get(role) ?? 0;
    for (let k = 0; k < list.length; k += 1) {
      const p = list[(t + k) % list.length]!;
      if (p.ready) {
        this.turn.set(role, t + k + 1);
        return p;
      }
    }
    return null;
  }

  private has(role: ClipRole): boolean {
    const list = this.pools.get(role);
    return list !== undefined && list.some((p) => p.ready);
  }

  /**
   * Common options of a one-shot from `p` (role `role`): it reaches its peak frame (the manifest's timing, else a third of
   * the way) in the role's attack seconds, then plays the rest over the role's tail × `tailK` × the element's linger:
   * an instant attack, a held peak and a slow decay whatever the clip's own length. Matter erodes.
   */
  private once(p: FlipbookPool, role: ClipRole, tailK = 1, o: FlipOptions = flip()): FlipOptions {
    const m = p.meta!;
    const [first, last] = span(p);
    const [attackS, tailS] = TIMES[role];
    const peak = Math.min(last - 1, Math.max(first, m.peak ?? Math.round(first + (last - first) * PEAK)));
    const tail = Math.max(0.05, tailS * tailK * this.spec.look.linger);
    o.frame = first;
    if (peak > first) {
      o.rate = (peak - first) / (m.fps * attackS);
      o.slowFrom = peak;
      o.slowRate = (last + 1 - peak) / (m.fps * tail);
    } else o.rate = (last + 1 - first) / (m.fps * tail);
    this.matter(p, o);
    return o;
  }

  /** Mode-dependent finish: matter burns out by erosion (no see-through fade), light adds over a darkened ground. */
  private matter(p: FlipbookPool, o: FlipOptions): void {
    const mode = this.modes.get(p);
    if (mode === "heat" || mode === "rgba" || mode === "smoke") {
      o.cool = COOL;
      o.fadeOut = 0;
    } else if (mode === "fire") {
      o.occlude = this.spec.look.occlude;
      o.intensity = this.spec.look.gain;
    }
  }

  private spawn(role: ClipRole, p: FlipbookPool, x: number, y: number, z: number, size: number, o: FlipOptions): void {
    p.spawn(v.set(x, y, z), size * this.spec.look.scale, o);
    this.audit.spawned[role] += 1;
    if (o.life !== ONE_FRAME) this.under(role, x, y, z, size, o);
  }

  /**
   * The role's body layer under a one-shot just spawned with `o` (lab-flipbooks 18:52: Dark's smoke filmed on white
   * under its rim filmed on black): the same place, turn, motion and delay, its own clip timed by the role, in the
   * element's body colour, eroding away.
   */
  private under(role: ClipRole, x: number, y: number, z: number, size: number, o: FlipOptions): void {
    const list = this.bodies.get(role);
    if (list === undefined) return;
    const b = list.find((p) => p.ready);
    if (b === undefined) return;
    const q = this.once(b, role, 1, flip(bodyOpts));
    q.rot = o.rot;
    q.dir = o.dir;
    q.span = o.span;
    q.vx = o.vx;
    q.vy = o.vy;
    q.vz = o.vz;
    q.drag = o.drag;
    q.ground = o.ground;
    q.delay = o.delay;
    q.lift = (o.lift ?? 0) - 0.05;
    q.alpha = o.alpha;
    const c = this.spec.look.body ?? this.spec.look.heat.deep;
    q.tint = bodyTint.setRGB(c[0], c[1], c[2]);
    b.spawn(v.set(x, y, z), size * this.spec.look.scale, q);
    this.audit.bodies[role] += 1;
  }

  /** A looping clip (sparkle, sheath) shown this frame only, at its own clock (`phase` s apart per user). */
  private loopFrame(p: FlipbookPool, phase: number): FlipOptions {
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    const [first, last] = span(p);
    const n = last - first + 1;
    o.frame = first + ((((this.stage.time + phase) * p.meta!.fps) % n) + n) % n;
    this.matter(p, o);
    return o;
  }

  // ── Layers ────────────────────────────────────────────────────────────────

  /** A burst of the sparkle loop at (x, y, z): `size` m, living `life` s, drifting up `rise` m/s (and along vx, vz), fading out. */
  private sparkle(x: number, y: number, z: number, size: number, life: number, rise = 0.25, delay = 0, alpha = 1, vx = 0, vz = 0): boolean {
    const p = this.pick("sparkle");
    if (p === null) return false;
    const o = flip();
    o.life = life;
    o.rate = 1;
    o.frame = this.stage.rand.range(0, p.meta!.frames);
    o.rot = this.stage.rand.range(0, Math.PI * 2);
    o.vx = vx;
    o.vy = rise;
    o.vz = vz;
    o.drag = 0.6;
    o.fadeIn = Math.min(0.08, life * 0.2);
    o.fadeOut = life * 0.45;
    o.alpha = alpha;
    o.lift = 0.4;
    if (delay > 0) o.delay = delay;
    o.occlude = 0;
    o.intensity = this.spec.look.gain;
    this.spawn("sparkle", p, x, y, z, size, o);
    return true;
  }

  /** The sheath clip wrapped along a blade from (x, y, z) toward (dx, dy, dz), `len` m: drawn this frame only. */
  private sheath(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, thick: number, k: number, phase: number): boolean {
    const p = this.pick("sheath");
    if (p === null) return false;
    const o = this.loopFrame(p, phase);
    o.dir = dirV.set(dx, dy, dz);
    o.lift = -0.25;
    if (this.modes.get(p) !== "fire") o.intensity = k;
    else o.intensity = this.spec.look.gain * k;
    const m = p.meta!;
    const mid = len * 0.5;
    if (m.aspect < 1) {
      // Portrait: its height runs along the blade, foreshortened as the camera sees the blade.
      const e = this.stage.camera.matrixWorldInverse.elements;
      const vx = e[0]! * dx + e[4]! * dy + e[8]! * dz;
      const vy = e[1]! * dx + e[5]! * dy + e[9]! * dz;
      const f = Math.max(0.3, Math.hypot(vx, vy));
      this.spawn("sheath", p, x + dx * mid, y + dy * mid, z + dz * mid, len * 1.25 * f, o);
    } else {
      o.span = len * 1.2;
      this.spawn("sheath", p, x + dx * mid, y + dy * mid, z + dz * mid, thick, o);
    }
    return true;
  }

  /** The judgement from the sky (Thunder's law): the ribbon turned upright, a column striking (x, z) after `delay`. */
  private column(x: number, z: number, size: number, delay: number): void {
    const p = this.pick("ribbon");
    if (p === null) return;
    const o = flip();
    this.matter(p, o);
    o.life = 0.34;
    o.rate = 2.2;
    o.frame = this.stage.rand.range(0, p.meta!.frames);
    o.dir = UP;
    o.span = 9 * size;
    o.fadeOut = 0.16;
    o.delay = delay;
    o.lift = 0.3;
    this.spawn("ribbon", p, x, 4.5 * size, z, 0.9 * size, o);
  }

  /**
   * Water's law: the blow's water flows on past the beast along (dx, dz), carried and slowing: the ribbon clip's band,
   * else (`crescent`) the slash clip as a wave. A line of hits (key 2) never takes the crescent: one per beast read as
   * a chain of small crescents along the line (owner ~19:45).
   */
  private flowOn(x: number, y: number, z: number, dx: number, dz: number, size: number, crescent: boolean): void {
    const role: ClipRole = this.has("ribbon") ? "ribbon" : "slash";
    if (role === "slash" && !crescent) return;
    const p = this.pick(role);
    if (p === null) return;
    const o = this.once(p, role, 1.2);
    o.dir = dirV.set(dx, 0, dz);
    o.vx = dx * 5;
    o.vz = dz * 5;
    o.drag = 2.4;
    o.lift = 0.2;
    o.ground = 0;
    this.spawn(role, p, x + dx * 0.4, y, z + dz * 0.4, size, o);
  }

  /** A blow on the ground at (x, z): the ground impact rising off it, `size` m. */
  private groundBlow(x: number, z: number, size: number, delay = 0): boolean {
    const p = this.pick("groundImpact");
    if (p === null) return false;
    const o = this.once(p, "groundImpact");
    o.ground = 0;
    o.lift = 0.3;
    if (delay > 0) o.delay = delay;
    this.spawn("groundImpact", p, x, size * 0.32 * this.spec.look.scale, z, size, o);
    return true;
  }

  /** The mark a blow leaves on the ground (seen from above), `size` m across, turned `rot`, lingering then eroding. */
  private mark(x: number, z: number, size: number, rot: number, delay = 0, dx = 0, dz = 0): boolean {
    const p = this.pick("groundMark");
    if (p === null) return false;
    const o = this.once(p, "groundMark");
    o.rot = rot;
    if (dx !== 0 || dz !== 0) o.dir = dirV.set(dx, 0, dz);
    // The painted mark fills its cell edge to edge (an oblique ellipse in a wide cell): laid as a square it reads round
    // under the play camera.
    o.span = size * this.spec.look.scale;
    o.lift = 0.05;
    if (delay > 0) o.delay = delay;
    this.spawn("groundMark", p, x, 0.04, z, size, o);
    return true;
  }

  /** A hit at `at` (sized `s`) by the element's law; false when it has neither an impact nor a burst clip. */
  private hit(x: number, y: number, z: number, dx: number, dz: number, s: number, big: boolean, crescent = true): boolean {
    const role: ClipRole = big ? (this.has("burst") ? "burst" : "impact") : this.has("impact") ? "impact" : "burst";
    const p = this.pick(role);
    if (p === null) return false;
    const law = this.spec.look.hit;
    const delay = law === "strike" ? 0.07 : law === "shatter" ? 0.12 : 0;
    if (law === "strike") {
      // Marked first, judged a beat later: the column from the top of the frame onto the beast.
      this.sparkle(x, y, z, 0.9 * s, 0.22, 0, 0, 0.9);
      this.column(x, z, Math.min(1.4, 0.75 + 0.35 * s), 0.05);
    } else if (law === "shatter") {
      // Stilled: a glint holds on the beast for a beat before it breaks.
      this.sparkle(x, y, z, 1.0 * s, 0.2, 0, 0, 1);
    } else if (law === "crush") this.groundBlow(x, z, 1.8 * s, 0.03);
    else if (law === "claim") this.mark(x, z, 1.9 * s, this.stage.rand.range(0, Math.PI * 2), 0.02);
    else if (law === "drain") {
      // Its light runs back along the blow toward the caster.
      for (let k = 0; k < 2; k += 1) this.sparkle(x, y, z, 0.9 * s, 0.6, 0.2, 0.08 + 0.1 * k, 1, -dx * 4.5, -dz * 4.5);
    }
    const o = this.once(p, role);
    o.rot = this.stage.rand.range(-0.4, 0.4);
    o.lift = 0.6;
    if (delay > 0) o.delay = delay;
    // The big burst standing in for a missing impact clip is drawn smaller.
    this.spawn(role, p, x, y, z, (big ? 2.8 : role === "burst" ? 1.5 : 2.0) * s, o);
    // The wave is the slash clip: as big as the cut (CUT, owner 19:12).
    if (law === "flow") this.flowOn(x, y * 0.7, z, dx, dz, 0.95 * CUT.scale * s, crescent);
    this.sparkle(x, y, z, 1.7 * s, 0.85, 0.3, delay);
    this.stage.light(x, y, z, this.spec.look.light, big ? 5 : 3);
    if (big) this.stage.accent(x, y, z, 0.3);
    return true;
  }

  // ── Sword hooks (sword-skills.ts) ───────────────────────────────────────────

  chargeFrame(f: ChargeFrameArgs): boolean {
    const p = this.pick("charge");
    if (p === null) return false;
    // After the release the charge is spent: the release replaced it.
    if (!f.typing) return true;
    const h = f.hand;
    const L = f.level;
    const [first, last] = span(p);
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    // The gathering follows the word: its frames scrubbed by the typing level.
    o.frame = first + Math.min(1, 0.06 + L * 0.94) * (last - first);
    o.lift = 0.6;
    o.rot = this.stage.time * 0.9;
    this.matter(p, o);
    o.fadeOut = 0;
    if (this.modes.get(p) === "rgba") o.erode = 1 - f.vis;
    else o.alpha = f.vis;
    this.spawn("charge", p, h.x, h.y, h.z, (2.0 - 0.6 * L) * f.scale, o);
    const s = this.pick("sparkle");
    if (s !== null) {
      const q = this.loopFrame(s, 0);
      q.occlude = 0;
      q.alpha = (0.35 + 0.65 * L) * f.vis;
      q.lift = 0.5;
      this.spawn("sparkle", s, h.x, h.y, h.z, (1.8 + 0.8 * L) * f.scale, q);
    }
    return true;
  }

  chargeKey(a: ChargeKeyArgs): boolean {
    const r = this.pick("release");
    if (r === null && !this.has("sparkle")) return false;
    const h = a.hand;
    this.sparkle(h.x, h.y, h.z, 0.8 + 0.6 * a.p, 0.32, 0.1);
    // A blade arriving at its place appears in a small release.
    for (let i = 0; i < a.count; i += 1) {
      const q = a.appeared[i]!;
      if (r !== null) {
        const o = this.once(r, "release", 0.6);
        o.rot = this.stage.rand.range(0, Math.PI * 2);
        o.lift = 0.3;
        this.spawn("release", r, q.x, q.y, q.z, 1.0, o);
      } else this.sparkle(q.x, q.y, q.z, 0.9, 0.4, 0.1);
    }
    return true;
  }

  release(a: ReleaseArgs): boolean {
    const r = this.pick("release");
    if (r === null) return false;
    const big = a.skill === "k7" || a.tier >= 3;
    const s = big ? 1.5 : 1;
    const p = a.at;
    const o = this.once(r, "release");
    o.rot = this.stage.rand.range(0, Math.PI * 2);
    o.lift = 0.8;
    this.spawn("release", r, p.x, p.y, p.z, 2.6 * s, o);
    this.sparkle(p.x, p.y, p.z, 2.6 * s, 1.0, 0.35);
    this.stage.light(p.x, p.y, p.z, this.spec.look.light, big ? 5 : 3);
    if (big) {
      // The big burst erupts behind the caster (the body stays in front of its own release), the ground struck under it.
      const c = a.caster;
      this.stage.camera.getWorldDirection(camF);
      const fl = Math.hypot(camF.x, camF.z) || 1;
      const b = this.pick("burst");
      if (b !== null) {
        const q = this.once(b, "burst");
        q.ground = 0;
        this.spawn("burst", b, c.x + (camF.x / fl) * 0.6, 1.3 * s, c.z + (camF.z / fl) * 0.6, 3.4 * s, q);
      }
      this.groundBlow(c.x, c.z, 2.6 * s);
      this.mark(c.x, c.z, Math.max(3, a.ringM * 1.2), this.stage.rand.range(0, Math.PI * 2));
      this.stage.accent(p.x, p.y, p.z, 0.25);
    }
    return true;
  }

  launch(a: LaunchArgs): boolean {
    const r = this.pick("release");
    if (r === null) return false;
    const o = this.once(r, "release", 0.6);
    o.rot = this.stage.rand.range(0, Math.PI * 2);
    o.lift = 0.3;
    this.spawn("release", r, a.at.x, a.at.y, a.at.z, 1.1, o);
    return true;
  }

  waiting(a: TravelArgs): boolean {
    if (!this.has("sheath") && !this.has("sparkle")) return false;
    if (!a.aura) this.sheath(a.x, a.y, a.z, a.dx, a.dy, a.dz, a.tipM, 0.3, 0.8 * a.u, a.blade * 0.37);
    this.waitAcc += 3 * a.dt * this.stage.dens;
    if (this.waitAcc >= 1) {
      this.waitAcc -= 1;
      const t = this.stage.rand.range(0.2, 0.95) * a.tipM;
      this.sparkle(a.x + a.dx * t, a.y + a.dy * t, a.z + a.dz * t, 0.55, 0.5, 0.4);
    }
    return true;
  }

  travel(a: TravelArgs): boolean {
    if (!this.has("sheath") && !this.has("sparkle")) return false;
    this.lastDt = a.dt;
    if (!a.aura) this.sheath(a.x, a.y, a.z, a.dx, a.dy, a.dz, a.tipM, 0.32, 1, a.blade * 0.37);
    // Sparkles shed behind along the path.
    this.shedAcc += 9 * a.dt * this.stage.dens;
    while (this.shedAcc >= 1) {
      this.shedAcc -= 1;
      const t = this.stage.rand.range(0, 0.6) * a.tipM;
      this.sparkle(a.x - a.dx * t, a.y - a.dy * t, a.z - a.dz * t, 0.6, 0.45, 0.2);
    }
    return true;
  }

  impact(a: ImpactArgs): boolean {
    const s = a.scale * (a.big ? 1.3 : 1);
    // Key 2's hits lie along its line: its flying crescent is the line's crescent (no wave crescent per beast).
    return this.hit(a.at.x, a.at.y, a.at.z, a.dx, a.dz, s, a.big, a.slot !== "k2");
  }

  cut(a: CutArgs): boolean {
    const p = this.pick("slash");
    if (p === null) return false;
    const o = this.once(p, "slash");
    o.rot = a.rot;
    o.lift = 0.7;
    // Grown big (CUT), it meets the ground: fade softly there, never a straight cut along the floor.
    o.ground = 0;
    this.spawn("slash", p, a.at.x, a.at.y, a.at.z, a.size * 1.2, o);
    return true;
  }

  /**
   * Key 2's main shape (owner 05/11 ~19:45): the authored crescent, one big card flying with the blade along its line,
   * held at the clip's peak frame (the whole crescent), across the line, this frame only.
   */
  flyingCut(a: FlyingCutArgs): boolean {
    const p = this.pick("slash");
    if (p === null) return false;
    const [first, last] = span(p);
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    o.frame = Math.min(last, Math.max(first, p.meta!.peak ?? Math.round(first + (last - first) * PEAK)));
    o.rot = a.rot;
    o.lift = 0.7;
    o.ground = 0;
    this.matter(p, o);
    o.fadeOut = 0;
    o.alpha = a.fade;
    this.spawn("slash", p, a.at.x, a.at.y, a.at.z, a.size * 1.2, o);
    return true;
  }

  areaHit(a: AreaHitArgs): boolean {
    const p = this.pick("impact");
    if (p === null) return false;
    if (a.marked) {
      const o = this.once(p, "impact", 0.7);
      o.rot = this.stage.rand.range(-0.5, 0.5);
      o.lift = 0.5;
      this.spawn("impact", p, a.at.x, a.at.y, a.at.z, 1.1 + 0.5 * a.power, o);
    } else this.sparkle(a.at.x, a.at.y, a.at.z, 0.7, 0.35, 0.2);
    return true;
  }

  areaBurst(a: AreaBurstArgs): boolean {
    if (!this.has("burst") && !this.has("groundImpact")) return false;
    const k = Math.min(2.6, 0.6 + Math.sqrt(Math.max(1, a.beasts)) * 0.4) * a.scale;
    const b = this.pick("burst");
    if (b !== null) {
      const o = this.once(b, "burst");
      o.ground = 0;
      o.lift = 0.5;
      this.spawn("burst", b, a.x, a.y, a.z, 2.6 * k, o);
    }
    this.groundBlow(a.x, a.z, 2.4 * k, 0.03);
    this.mark(a.x, a.z, 3.2 * k, this.stage.rand.range(0, Math.PI * 2), 0.05);
    this.sparkle(a.x, a.y, a.z, 3 * k, 1.1, 0.35);
    this.stage.light(a.x, a.y, a.z, this.spec.look.light, 5);
    this.stage.accent(a.x, a.y, a.z, 0.3);
    return true;
  }

  aftermath(a: AftermathArgs): boolean {
    if (!this.has("groundMark") && !this.has("groundImpact")) return false;
    // Every blow reaches the ground (owner 17:08): the ground blow, then its mark lies there and erodes away.
    this.groundBlow(a.x, a.z, 1.5 * a.r, 0.04);
    this.mark(a.x, a.z, 2.3 * a.r, this.stage.rand.range(0, Math.PI * 2), 0.06);
    this.sparkle(a.x, 0.4, a.z, 1.6 * a.r, a.life * 1.6, 0.3, 0.15, 0.8);
    return true;
  }

  death(a: DeathArgs): boolean {
    const role: ClipRole = this.has("impact") ? "impact" : "burst";
    const p = this.pick(role);
    if (p === null) return false;
    const r = Math.max(0.3, a.radius);
    const o = this.once(p, role, 0.9);
    o.rot = this.stage.rand.range(0, Math.PI * 2);
    o.lift = 0.4;
    this.spawn(role, p, a.at.x, a.at.y, a.at.z, Math.min(2.4, r * 3), o);
    this.sparkle(a.at.x, a.at.y, a.at.z, Math.min(2.2, r * 3), 1.0, 0.45);
    return true;
  }

  frame(dt: number): void {
    this.lastDt = dt;
  }

  reset(): void {
    this.shedAcc = this.waitAcc = 0;
    this.turn.clear();
    this.audit.spawned = zeroRoles();
    this.audit.bodies = zeroRoles();
  }

  // ── Stream hooks (myriad-swords.ts, key 7) ────────────────────────────────

  streamTravel(a: StreamTravelArgs): boolean {
    // River swords keep the shape's thin trail in the kit's tone (a field of sheaths would be a mess of bands).
    if (a.cls !== 0) return false;
    if (a.dissolve > 0.6) return this.has("sheath");
    if (a.aura) return false;
    return this.sheath(a.x - a.dx * a.len * 0.5, a.y - a.dy * a.len * 0.5, a.z - a.dz * a.len * 0.5, a.dx, a.dy, a.dz, a.len, 0.34, 1 - a.dissolve, 1.7);
  }

  strike(a: StreamStrikeArgs): boolean {
    if (a.k >= 1.3) return this.hit(a.x, a.y, a.z, a.dx, a.dz, 0.7 * a.k, a.k >= 2);
    // A river sword stays thin: a sparkle (else a small hit), so the field-wide river never turns into soup.
    if (this.sparkle(a.x, a.y, a.z, 0.9 * a.k, 0.4, 0.2)) return true;
    const p = this.pick("impact");
    if (p === null) return false;
    const o = this.once(p, "impact", 0.5);
    o.lift = 0.4;
    this.spawn("impact", p, a.x, a.y, a.z, 0.8 * a.k, o);
    return true;
  }

  leadStrike(a: { x: number; z: number }): boolean {
    if (!this.has("groundImpact") && !this.has("groundMark")) return false;
    if (this.spec.look.hit === "strike") this.column(a.x, a.z, 1.3, 0);
    this.groundBlow(a.x, a.z, 3.0);
    this.mark(a.x, a.z, 3.4, this.stage.rand.range(0, Math.PI * 2), 0.05);
    this.sparkle(a.x, 0.6, a.z, 2.4, 1.2, 0.4);
    return true;
  }

  glint(a: StreamGlintArgs): boolean {
    if (!this.has("sparkle")) return false;
    if (a.river) {
      // The river's glitter drifts with it (about one in three is drawn: it is called by the hundred).
      if (this.stage.rand.next() < 0.66) return true;
      this.sparkle(a.x, a.y, a.z, 0.5 + 0.15 * Math.min(2, a.k), 0.35, 0.1);
      return true;
    }
    this.sparkle(a.x, a.y, a.z, 0.7 * a.k, 0.3, 0.3);
    return true;
  }

  finisher(a: StreamSegmentArgs): boolean {
    if (!this.has("groundMark") && !this.has("groundImpact")) return false;
    // The cut reaches the ground along its length, lit in the order the slash's head runs (~0.26 s origin to tip).
    const dx = a.bx - a.ax;
    const dz = a.bz - a.az;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const n = Math.max(3, Math.min(9, Math.round(l / 2.2)));
    for (let k = 0; k < n; k += 1) {
      const u = (k + 0.5) / n;
      const x = a.ax + dx * u;
      const z = a.az + dz * u;
      this.mark(x, z, 2.6, 0, u * 0.26, ux, uz);
      if (k % 2 === 0) this.groundBlow(x, z, 2.2, u * 0.26);
    }
    const mx = (a.ax + a.bx) * 0.5;
    const mz = (a.az + a.bz) * 0.5;
    this.stage.accent(mx, 0.5, mz, 0.45);
    return true;
  }

  slashSpark(a: StreamSparkArgs): boolean {
    if (!this.has("sparkle")) return false;
    if (this.stage.rand.next() < 0.5) return true;
    this.sparkle(a.x, a.y, a.z, 0.45, 0.35, 0.4);
    return true;
  }

  cutSeam(a: StreamSeamArgs): boolean {
    const p = this.pick("slash");
    if (p === null) return false;
    const o = this.once(p, "slash", 0.8);
    o.dir = dirV.set(a.dx, a.dy, a.dz);
    o.span = a.len * 1.1;
    o.lift = 0.5;
    this.spawn("slash", p, a.x + a.dx * a.len * 0.5, a.y, a.z + a.dz * a.len * 0.5, 0.6 * CUT.scale, o);
    return true;
  }

  plant(a: StreamPlantArgs): boolean {
    if (!this.has("groundImpact") && !this.has("groundMark")) return false;
    if (this.spec.look.hit === "strike") this.column(a.x, a.z, 1.1, 0);
    this.groundBlow(a.x, a.z, 2.2);
    this.mark(a.x, a.z, 2.4, this.stage.rand.range(0, Math.PI * 2), 0.04);
    this.sparkle(a.x, 0.4, a.z, 1.6, 0.9, 0.35);
    return true;
  }

  streamReset(): void {
    this.turn.clear();
  }

  hooks(): ElementHooks {
    return {
      sword: {
        chargeKey: (a) => this.chargeKey(a),
        chargeFrame: (a) => this.chargeFrame(a),
        release: (a) => this.release(a),
        launch: (a) => this.launch(a),
        waiting: (a) => this.waiting(a),
        travel: (a) => this.travel(a),
        impact: (a) => this.impact(a),
        cut: (a) => this.cut(a),
        flyingCut: (a) => this.flyingCut(a),
        areaHit: (a) => this.areaHit(a),
        areaBurst: (a) => this.areaBurst(a),
        aftermath: (a) => this.aftermath(a),
        death: (a) => this.death(a),
        frame: (dt) => this.frame(dt),
        reset: () => this.reset(),
      },
      stream: {
        travel: (a) => this.streamTravel(a),
        strike: (a) => this.strike(a),
        leadStrike: (a) => this.leadStrike(a),
        glint: (a) => this.glint(a),
        finisher: (a) => this.finisher(a),
        slashSpark: (a) => this.slashSpark(a),
        cutSeam: (a) => this.cutSeam(a),
        plant: (a) => this.plant(a),
        reset: () => this.streamReset(),
      },
    };
  }
}

/**
 * A folder's authored crescent (its manifest's `slash` clips) for kits that do not draw by role: Fire's own clip, and
 * Metal's for Metal and for any element whose slash clip has not landed (tinted to its colour). The owner (05/11 ~19:45,
 * ~20:00): the cut and key 2's flying crescent are the crescent we designed, a code-drawn crescent at most a thin layer
 * under it. One per stage and folder (crescentOf).
 */
export class CrescentClip {
  private readonly pools: FlipbookPool[] = [];
  private turn = 0;
  /** Crescents drawn since the stage was made (the lab's count). */
  spawned = 0;

  constructor(stage: ElementStage, readonly folder: string) {
    const lib = stage.flipbooks.library(folder);
    lib.watch((id) => {
      const e = lib.get(id);
      if (e === null || e.meta.role !== "slash" || e.meta.layer === "body" || this.pools.some((p) => p.id === id)) return;
      const pool = stage.flipbooks.pool(folder, id, { mode: e.meta.mode, capacity: CAPACITY.slash, renderOrder: ORDER.slash });
      pool.softM = 0.25;
      this.pools.push(pool);
    });
  }

  get ready(): boolean {
    return this.pools.some((p) => p.ready);
  }

  private pick(): FlipbookPool | null {
    for (let k = 0; k < this.pools.length; k += 1) {
      const p = this.pools[(this.turn + k) % this.pools.length]!;
      if (p.ready) {
        this.turn += k + 1;
        return p;
      }
    }
    return null;
  }

  /**
   * The cut at `at` (turned `rot`, `size` m as the cut's args give it), instant to its peak frame then decaying over the
   * slash role's tail × `linger`, light × `tint` (null: the clip's own colours). False when the folder has none.
   */
  cut(at: THREE.Vector3, rot: number, size: number, tint: THREE.Color | null, linger = 1): boolean {
    const p = this.pick();
    if (p === null) return false;
    const m = p.meta!;
    const [first, last] = span(p);
    const [attackS, tailS] = TIMES.slash;
    const peak = Math.min(last - 1, Math.max(first, m.peak ?? Math.round(first + (last - first) * PEAK)));
    const o = flip();
    o.frame = first;
    if (peak > first) {
      o.rate = (peak - first) / (m.fps * attackS);
      o.slowFrom = peak;
      o.slowRate = (last + 1 - peak) / (m.fps * tailS * linger);
    } else o.rate = (last + 1 - first) / (m.fps * tailS * linger);
    this.finish(o, rot, tint);
    p.spawn(at, size * 1.2, o);
    this.spawned += 1;
    return true;
  }

  /** Key 2's flying crescent: the clip held at its peak frame (the whole crescent), `fade` shown, this frame only. */
  flying(at: THREE.Vector3, rot: number, size: number, fade: number, tint: THREE.Color | null): boolean {
    const p = this.pick();
    if (p === null) return false;
    const [first, last] = span(p);
    const o = flip();
    o.life = ONE_FRAME;
    o.rate = 0;
    o.frame = Math.min(last, Math.max(first, p.meta!.peak ?? Math.round(first + (last - first) * PEAK)));
    this.finish(o, rot, tint);
    o.fadeOut = 0;
    o.alpha = fade;
    p.spawn(at, size * 1.2, o);
    this.spawned += 1;
    return true;
  }

  private finish(o: FlipOptions, rot: number, tint: THREE.Color | null): void {
    o.rot = rot;
    o.lift = 0.7;
    o.ground = 0;
    o.occlude = 0.5;
    if (tint !== null) o.tint = tint;
  }
}

const CRESCENTS = new WeakMap<ElementStage, Map<string, CrescentClip>>();

/** The authored crescent of `folder` on `stage` (made on first use; load time). */
export function crescentOf(stage: ElementStage, folder: string): CrescentClip {
  let byFolder = CRESCENTS.get(stage);
  if (byFolder === undefined) CRESCENTS.set(stage, (byFolder = new Map()));
  let c = byFolder.get(folder);
  if (c === undefined) byFolder.set(folder, (c = new CrescentClip(stage, folder)));
  return c;
}

const LAYERS = new WeakMap<ElementStage, Map<ElementId, ClipLayers>>();

/** What a clip kit has drawn on `stage` since its last reset (the lab's __lab.clipKit; null before it is attached). */
export function clipAudit(stage: ElementStage, id: ElementId): ClipAudit | null {
  return LAYERS.get(stage)?.get(id)?.audit ?? null;
}

/** Key 7's light from the element's colours (linear): white core, halo (≤ 0.9), the finisher's body, lit body and deep end. */
export function streamOf(c: { core: Rgb; halo: Rgb; body: Rgb; lit: Rgb; deep: Rgb; flash: string; hitRgb: number; number: Rgb }): StreamTone {
  return {
    core: c.core,
    halo: c.halo,
    trailCore: [(c.core[0] + 0.3 * c.halo[0]) * 1.7, (c.core[1] + 0.3 * c.halo[1]) * 1.7, (c.core[2] + 0.3 * c.halo[2]) * 1.7],
    flash: c.flash,
    hitRgb: c.hitRgb,
    cutRgb: c.hitRgb,
    number: c.number,
    slash: { white: c.core, body: c.body, bodyLit: c.lit, deep: c.deep },
  };
}

/**
 * The sword aura's matter (SWORD_AURA §4.8) from the element's ramp: its core and edge, the body (≤ 0.85), the soot as
 * the ink, and how it moves (curl 0 straight … 1 S-flow, breakup, plate edges, flicker, what it sheds).
 */
export function auraOf(r: ElementRamp, m: { curl?: number; breakup?: number; edge?: number; flickerHz?: number; ink?: number; shed?: SwordAuraLook["shed"]; mode?: SwordAuraLook["mode"] }): SwordAuraLook {
  const cap = (c: Rgb, k: number): Rgb => {
    const mx = Math.max(c[0], c[1], c[2], 1e-6);
    const f = mx > k ? k / mx : 1;
    return [c[0] * f, c[1] * f, c[2] * f];
  };
  return {
    mode: m.mode ?? "qi",
    ramp: { core: cap(r.core, 1), edge: cap(r.edge, 0.85), body: cap(r.body, 0.85), soot: r.soot },
    deep: [r.body[0] * 0.3, r.body[1] * 0.3, r.body[2] * 0.3],
    coreHdr: 2.8,
    ink: { rgb: r.soot, alpha: m.ink ?? 0.45 },
    edge: m.edge ?? 0.75,
    flow: { speed: 0.8, perMps: 0.04, scale: 1, buoyancy: 0, curl: m.curl ?? 0, twoPhase: (m.curl ?? 0) > 0.5 },
    breakup: m.breakup ?? 0.4,
    reachW: 0.4,
    flickerHz: m.flickerHz ?? 0,
    shed: m.shed ?? "glints",
    distortion: 0,
    reduced: { flow: 0.3, flickerHz: Math.min(2, m.flickerHz ?? 0) },
  };
}

/** Display (sRGB) values of a linear colour, × `k` (load time). */
function display(c: Rgb, k = 1): Rgb {
  const o = new THREE.Color().setRGB(c[0], c[1], c[2]).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return [Math.min(1, o.r * k), Math.min(1, o.g * k), Math.min(1, o.b * k)];
}

/**
 * The graphic impact frames in the element's own colours (screen-fx.ts; display values), as Fire's: a dark frame in its
 * soot with rays in its edge colour and a strike in its core, an inverted frame on its body colour (saturated, never a
 * pale paper over the screen) with soot lines and strokes and a core contour. Without them every element took Metal's
 * navy and cyan (Dark's crimson read cyan at its big hits).
 */
function framesOf(r: ElementRamp): NonNullable<ScreenAccent["frames"]> {
  return {
    navy: display(r.soot),
    paper: display(r.body, 1.1),
    accent: display(r.edge),
    roles: { rays: display(r.edge, 0.8), strike: display(r.core), lines: display(r.soot, 0.9), strokes: display(r.soot, 0.6), contour: display(r.core) },
  };
}

/** An element kit drawn from its folder's clips by role (load time; allocates). */
export function clipKit(spec: ClipKitSpec): ElementKit {
  // The trail takes the ribbon clip as its flame band once the folder has one (RibbonPool.setFlame); until then the
  // sword-light trail in the kit's tone.
  const trail: { -readonly [K in keyof TrailLook]: TrailLook[K] } = { widthM: spec.trailW, core: spec.trailCore, rimK: 0.8, silk: false };
  const glow: WeaponGlow = { ...(spec.glowRamp !== undefined ? glowOfRamp(spec.glowRamp) : glowOf(spec.accent, 1, rimOf(spec.rim[0], spec.rim[1]))), flashHex: spec.flashHex };
  return {
    id: spec.id,
    name: spec.name,
    verb: spec.verb,
    ramp: spec.ramp,
    palette: () => glow,
    stream: spec.stream,
    trail,
    blade: spec.blade,
    swordAura: spec.swordAura,
    textures: {},
    flipbooks: {},
    roles: CLIP_ROLES,
    ground: null,
    foe: spec.foe,
    screen: spec.screen.frames !== undefined ? spec.screen : { ...spec.screen, frames: framesOf(spec.ramp) },
    ...(spec.sigil !== undefined ? { sigil: spec.sigil } : {}),
    sound: spec.sound,
    attach: (stage) => {
      const layers = new ClipLayers(stage, spec, trail);
      let byId = LAYERS.get(stage);
      if (byId === undefined) LAYERS.set(stage, (byId = new Map()));
      byId.set(spec.id, layers);
      return layers.hooks();
    },
  };
}
