/**
 * Effects wiring (canon §12.1, §20.2–20.3, §21.1; PB-36): events go to Lane
 * 1's hit sparks, damage numbers, ink smoke and sword pool. This file never
 * re-implements them; it picks what, where and how many:
 * - `hit` → a spark at the beast's drawn centre and a damage number (merged
 *   per target by Lane 1; style by grade and source) when the tier's row has
 *   one;
 * - `death` → ink smoke sized by the death tier; the sweep counter;
 * - `skill-fx` → swords from the one shared pool of the tier (TT_BUDGETS
 *   swords 150 / 300 / 500, canon §20.2): Phi Kiếm 1, each Ngự Kiếm sword 1,
 *   Nhất Tuyến Xuyên Vân a volley along its line plus a ground streak, Lạc
 *   Kiếm Trận a volley into its zone, Thiên Hà Kiếm Vũ the tier's whole pool
 *   over its 3 volleys; an ally's cast takes ALLY_SHARE; the zones are drawn
 *   from `world.skills.zones` (place, radius, end tick) while they last;
 * - Lôi Hỏa Phù, phá thế, a cracked Trận Trụ, a mechanism firing: sparks and smoke.
 * The strongest blow of a frame asks the game's feedback profile
 * (feedback-profile.ts) for one hit stop and one shake. Hit stop:
 * `worldDt(dt, nowMs)` gives the app the world's seconds for a frame (stops
 * slow the world, never the keys). Shake: the projection moves by whole CSS
 * pixels (kit Trauma), never the camera; off with reduced motion (canon §24),
 * which also keeps stops short (reducedProfile).
 * Lane 1b's factories may not have landed yet: a factory that still throws its
 * "TODO(lane-1)" stub is replaced by a silent stand-in and listed in
 * `missing` (any other error is thrown).
 * Owner: Lane 6.
 */
import * as THREE from "three";
import type { FrameInfo, Presenter } from "../app/contracts";
import { SCHOOL_KIEM } from "../content/data/school-kiem";
import { TT_BUDGETS } from "../content/rules";
import type { Quality, SimEvent, World } from "../content/types";
import { HitStop } from "../kit/feedback/hitstop";
import { STYLE } from "../kit/feedback/numbers";
import type { FeedbackProfile } from "../kit/feedback/profiles";
import { tier as tierRow } from "../kit/feedback/tiers";
import { Trauma } from "../kit/feedback/trauma";
import { uToM } from "../sim/fixed";
import type { BeastAnchor, Point3 } from "./actors";
import { IC_FEEDBACK_PROFILE, reducedProfile } from "./feedback-profile";
import { createDamageNumbers, createHitFx, createInkSmoke, type DamageNumbers, type HitFx, type InkSmoke } from "./hitfx";
import type { Renderer3D } from "./renderer";
import { createSwords, type SwordPool } from "./swords";

/** Lane 1's factories (view/hitfx.ts, view/swords.ts); tests and the preview pass their own. */
export interface FxDeps {
  hitFx(renderer: Renderer3D): HitFx;
  damageNumbers(renderer: Renderer3D, capacity: number): DamageNumbers;
  inkSmoke(renderer: Renderer3D): InkSmoke;
  swords(renderer: Renderer3D, pool: number): SwordPool;
}

export const LANE1_FX: FxDeps = { hitFx: createHitFx, damageNumbers: createDamageNumbers, inkSmoke: createInkSmoke, swords: createSwords };

/** Ink smoke size (metres) by death tier T0–T5 (view only). */
export const SMOKE_M: readonly number[] = [0.6, 0.8, 1.1, 1.5, 2.2, 3.6];

/** Thiên Hà Kiếm Vũ's volleys (canon §12.1: 3 in 2 s); a beat more than this long after the last starts a new cast. */
// WANT EVENT: skill-fx "ultimate" carrying its volley index 0–2 (Lane 4 skills.ts strike.part), so the view need not count beats by time.
export const ULTIMATE_VOLLEYS = 3;
const ULTIMATE_GAP_MS = 2500;

/** An ally's cast takes this share of the shared pool (canon §20.2: 0.4–0.6); M0a is solo. */
export const ALLY_SHARE = 0.5;

/** Swords of volley `beat` (0–2) of a "vạn kiếm" of `total` swords: the three add up to exactly `total`. */
export function ultimateVolley(total: number, beat: number): number {
  const b = Math.max(0, Math.min(ULTIMATE_VOLLEYS - 1, beat | 0));
  return Math.floor(((b + 1) * total) / ULTIMATE_VOLLEYS) - Math.floor((b * total) / ULTIMATE_VOLLEYS);
}

/**
 * Swords a skill-fx beat shows (canon §12.1): Phi Kiếm 1, one Ngự Kiếm sword
 * per `volley` event (Lane 4 sends one per sword), a Xuyên Vân line 3, Lạc Kiếm
 * Trận 6 into its zone; Thiên Hà Kiếm Vũ the tier's whole pool over its 3
 * volleys (TT_BUDGETS swords 150 / 300 / 500, canon §20.2), `beat` 0–2.
 */
export function swordsFor(stage: Extract<SimEvent, { type: "skill-fx" }>["stage"], count: number, quality: Quality, beat = 0): number {
  switch (stage) {
    case "auto":
      return 1;
    case "volley":
      return Math.max(1, count);
    case "line":
      return Math.max(3, count);
    case "zone-open":
      return Math.max(6, count);
    case "ultimate":
      return ultimateVolley(TT_BUDGETS[quality].swords, beat);
    default:
      return 0;
  }
}

/** The damage number's style (kit STYLE): Chớp and Hoàn hảo words, zone and mechanism ticks, T4+ blows. */
export function numberStyle(event: Pick<Extract<SimEvent, { type: "hit" }>, "grade" | "source" | "tier">): number {
  if (event.grade === "flash" || event.grade === "perfect") return STYLE.perfect;
  if (event.source === "slot4" || event.source === "mechanism") return STYLE.tick;
  if (event.tier >= 4) return STYLE.crit;
  return STYLE.normal;
}

/** DamageNumbers.show with Lane 1b's optional style (the 1a stub took six arguments). */
type ShowNumber = (target: number, amount: number, x: number, y: number, z: number, tier: number, style?: number) => void;

/** Ground streak of Xuyên Vân: width from the school data (canon §12.1: 14 × 1.2 m), metres. */
function streakWidth(): number {
  for (const skill of SCHOOL_KIEM) if (skill.effect.kind === "line") return skill.effect.widthMm / 1000;
  return 1.2;
}

// Silent stand-ins while a Lane 1b factory is still a stub. Cast: Lane 1b's interfaces carry more members
// (counts, draw calls) that this file never calls; only the calls below are used here.
const NULL_HIT = { live: 0, spark() {}, setShare() {}, update() {}, drawCalls: () => 0, dispose() {} } as unknown as HitFx;
const NULL_NUMBERS = { live: 0, show() {}, update() {}, drawCalls: () => 0, dispose() {} } as unknown as DamageNumbers;
const NULL_SMOKE = { live: 0, puff() {}, update() {}, drawCalls: () => 0, dispose() {} } as unknown as InkSmoke;
const nullSwords = (capacity: number): SwordPool =>
  ({ capacity, live: 0, impactX: new Float32Array(0), impactZ: new Float32Array(0), impactCount: 0, volley: () => 0, cast: () => 0, setVfxShare() {}, update() {}, drawCalls: () => 0, triangles: () => 0, textureBytes: () => 0, dispose() {} }) as unknown as SwordPool;

/** Calls a Lane 1 factory; a stub still throwing "TODO(lane-1)" gives the stand-in and is noted in `missing`. */
function lane1<T>(name: string, make: () => T, standIn: T, missing: string[]): T {
  try {
    return make();
  } catch (error) {
    if (error instanceof Error && error.message.includes("TODO(lane-1)")) {
      missing.push(name);
      return standIn;
    }
    throw error;
  }
}

export interface FxView extends Presenter {
  readonly hitStop: HitStop;
  readonly trauma: Trauma;
  readonly swords: SwordPool;
  /** Lane 1 factories still stubs (their effects are silent stand-ins). */
  readonly missing: readonly string[];
  /** World seconds for a frame of `dt` real seconds ending at `nowMs` (hit stop applied). */
  worldDt(dt: number, nowMs: number): number;
  /** Swords asked for and taken from the pool so far (tests, scenarios). */
  readonly swordStats: { asked: number; taken: number };
}

export interface FxOptions {
  readonly deps?: Partial<FxDeps>;
  /** This machine's seat: an ally's swords take ALLY_SHARE of the pool (default 0). */
  readonly seat?: number;
  readonly reduced?: () => boolean;
  /** Where a beast is drawn (actors view): sparks and numbers land on its body, flyers included. */
  readonly locate?: (slot: number, serial: number, anchor: BeastAnchor, out: Point3) => boolean;
  readonly profile?: FeedbackProfile;
  /** Shake the projection (default true; the preview may turn it off). */
  readonly shake?: boolean;
}

interface ZoneMark {
  id: number;
  mesh: THREE.Mesh;
  active: boolean;
}

interface Streak {
  mesh: THREE.Mesh;
  life: number;
}

const ZONE_POOL = 4;
const STREAK_POOL = 4;
const STREAK_S = 0.35;
const OURS = "#e6eef8";

export function createFx(renderer: Renderer3D, options: FxOptions = {}): FxView {
  const deps: FxDeps = { ...LANE1_FX, ...options.deps };
  const reduced = options.reduced ?? (() => false);
  const profile = options.profile ?? IC_FEEDBACK_PROFILE;
  const quality: Quality = renderer.quality ?? "high";
  const budget = TT_BUDGETS[quality];
  const missing: string[] = [];
  const hitFx = lane1("createHitFx", () => deps.hitFx(renderer), NULL_HIT, missing);
  const numbers = lane1("createDamageNumbers", () => deps.damageNumbers(renderer, budget.numbers), NULL_NUMBERS, missing);
  const smoke = lane1("createInkSmoke", () => deps.inkSmoke(renderer), NULL_SMOKE, missing);
  const swords = lane1("createSwords", () => deps.swords(renderer, budget.swords), nullSwords(budget.swords), missing);
  const stopFull = new HitStop(profile);
  const stopReduced = new HitStop(reducedProfile(profile));
  const trauma = new Trauma(profile, () => 0.37);
  const swordStats = { asked: 0, taken: 0 };
  const point: Point3 = { x: 0, y: 0, z: 0 };
  /** The strongest blow of the frame's events (−1 none): one hit stop request and one shake a frame, so a storm of T3 hits never stacks shake. */
  let pendingTier = -1;
  const blow = (tier: number): void => {
    if (tier > pendingTier) pendingTier = tier;
  };
  const seat = options.seat ?? 0;
  const show = numbers.show.bind(numbers) as ShowNumber;
  /** Per seat: the last ultimate beat (0–2) and its wall time, so the 3 volleys add up to the tier's swords. */
  const ultimateBeat: number[] = [];
  const ultimateAt: number[] = [];
  let nowMs = 0;
  let pendingKills = 0;
  let shaken = false;

  // Our zones (Lạc Kiếm Trận) and Xuyên Vân streaks: pale steel, never the enemy's red.
  const group = new THREE.Group();
  group.name = "fx-ours";
  renderer.layers.fx.add(group);
  const zoneGeometry = new THREE.RingGeometry(0.9, 1, 64);
  zoneGeometry.rotateX(-Math.PI / 2);
  const zones: ZoneMark[] = [];
  for (let k = 0; k < ZONE_POOL; k += 1) {
    const mesh = new THREE.Mesh(zoneGeometry, new THREE.MeshBasicMaterial({ color: OURS, transparent: true, opacity: 0.75, depthWrite: false }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    zones.push({ id: -1, mesh, active: false });
  }
  const streakGeometry = new THREE.PlaneGeometry(1, 1);
  streakGeometry.rotateX(-Math.PI / 2);
  streakGeometry.translate(0, 0, 0.5);
  const streaks: Streak[] = [];
  for (let k = 0; k < STREAK_POOL; k += 1) {
    const mesh = new THREE.Mesh(streakGeometry, new THREE.MeshBasicMaterial({ color: OURS, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    streaks.push({ mesh, life: 0 });
  }
  const streakW = streakWidth();

  const at = (slot: number, serial: number, x: number, z: number): Point3 => {
    if (options.locate?.(slot, serial, "center", point)) return point;
    point.x = x;
    point.y = 0.9;
    point.z = z;
    return point;
  };

  const volley = (count: number, x: number, z: number, toX: number, toZ: number): void => {
    if (count <= 0) return;
    swordStats.asked += count;
    swordStats.taken += swords.volley(count, x, z, toX, toZ);
  };

  const streak = (x: number, z: number, toX: number, toZ: number): void => {
    const free = streaks.reduce((best, item) => (item.life < best.life ? item : best));
    const length = Math.hypot(toX - x, toZ - z);
    if (length < 0.1) return;
    free.life = STREAK_S;
    free.mesh.visible = true;
    free.mesh.position.set(x, 0.07, z);
    free.mesh.rotation.y = Math.atan2(toX - x, toZ - z);
    free.mesh.scale.set(streakW, 1, length);
  };

  const applyShake = (dt: number): void => {
    const camera = renderer.camera;
    const size = renderer.stage?.size ?? { width: 1, height: 1 };
    trauma.reduced = reduced();
    trauma.update(dt, size.height);
    const ox = Math.round(trauma.offsetX);
    const oy = Math.round(trauma.offsetY);
    const shaking = (options.shake ?? true) && (ox !== 0 || oy !== 0);
    if (!shaking && !shaken) return;
    if (camera === undefined) return;
    camera.updateProjectionMatrix();
    if (shaking) {
      // Whole CSS pixels: shift the projection, never the camera (Rồng camera.ts).
      camera.projectionMatrix.elements[8] = (-2 * ox) / Math.max(1, size.width);
      camera.projectionMatrix.elements[9] = (2 * oy) / Math.max(1, size.height);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    shaken = shaking;
  };

  return {
    get hitStop() {
      return reduced() ? stopReduced : stopFull;
    },
    trauma,
    swords,
    missing,
    swordStats,
    worldDt(dt: number, nowMs: number): number {
      return (reduced() ? stopReduced : stopFull).worldDt(dt, nowMs);
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      trauma.reduced = reduced();
      for (const event of events) {
        switch (event.type) {
          case "hit": {
            const p = at(event.beast.slot, event.beast.serial, event.x, event.z);
            hitFx.spark(p.x, p.y, p.z, event.tier);
            if (event.amount > 0 && tierRow(event.tier, profile.tiers).number !== null) show(event.beast.serial, event.amount, p.x, p.y + 0.6, p.z, event.tier, numberStyle(event));
            blow(event.tier);
            break;
          }
          case "death":
            smoke.puff(event.x, 0.5, event.z, SMOKE_M[event.tier] ?? 1);
            pendingKills += 1;
            if (event.tier >= 3) blow(event.tier);
            break;
          case "skill-fx": {
            let beat = 0;
            if (event.stage === "ultimate") {
              const last = ultimateBeat[event.seat];
              beat = last === undefined || nowMs - (ultimateAt[event.seat] ?? 0) > ULTIMATE_GAP_MS || last >= ULTIMATE_VOLLEYS - 1 ? 0 : last + 1;
              ultimateBeat[event.seat] = beat;
              ultimateAt[event.seat] = nowMs;
            }
            const count = swordsFor(event.stage, event.count, quality, beat);
            volley(event.seat === seat ? count : Math.max(1, Math.round(count * ALLY_SHARE)), event.x, event.z, event.toX, event.toZ);
            if (event.stage === "line") streak(event.x, event.z, event.toX, event.toZ);
            // The last volley of Thiên Hà Kiếm Vũ is a T5 blow (feedback-profile.ts); its hits bring their own tiers.
            if (event.stage === "ultimate" && beat === ULTIMATE_VOLLEYS - 1) blow(5);
            break;
          }
          case "consumable":
            if (event.kind === "loi-hoa-phu") {
              hitFx.spark(event.x, 0.6, event.z, 3);
              smoke.puff(event.x, 0.4, event.z, 1.4);
              blow(3);
            }
            break;
          case "posture":
            if (event.stage === "break") {
              const beast = world.beasts.list[event.beast.slot];
              const p = at(event.beast.slot, event.beast.serial, beast ? uToM(beast.x) : 0, beast ? uToM(beast.z) : 0);
              hitFx.spark(p.x, p.y, p.z, 4);
              blow(4);
            }
            break;
          case "pillar": {
            const pillar = world.formation?.pillars?.find((item) => item.id === event.pillar);
            if (pillar) {
              const x = uToM(pillar.at.x);
              const z = uToM(pillar.at.z);
              hitFx.spark(x, 1.6, z, 3);
              if (event.stage === "crack") smoke.puff(x, 1.2, z, 1.6);
            }
            blow(event.stage === "crack" ? 4 : 3);
            break;
          }
          case "mechanism":
            if (event.stage === "trigger") hitFx.spark(event.x, 0.6, event.z, 1);
            break;
          case "player-hit":
            if (!event.blocked) trauma.add(0.1);
            break;
          default:
            break;
        }
      }
    },
    frame(world: World, info: FrameInfo): void {
      nowMs = info.now;
      // The setting may have changed since the last frame: the shake follows it before any blow adds to it.
      trauma.reduced = reduced();
      const stop = reduced() ? stopReduced : stopFull;
      if (pendingTier >= 0) {
        stop.request(pendingTier, info.now);
        trauma.add(tierRow(pendingTier, stop.profile.tiers).trauma);
        pendingTier = -1;
      }
      if (pendingKills > 0) stop.kill(pendingKills, info.now);
      pendingKills = 0;
      // Our zones from the world's list (place, radius; gone when it ends).
      const list = world.skills?.zones;
      const zoneCount = list === undefined ? 0 : list.length;
      for (let k = 0; k < zones.length; k += 1) {
        const mark = zones[k]!;
        const zone = k < zoneCount ? list![k]! : null;
        mark.active = zone !== null && zone.untilTick > world.tick;
        mark.mesh.visible = mark.active;
        if (zone === null || !mark.active) continue;
        mark.id = zone.id;
        const r = uToM(zone.radiusU);
        mark.mesh.position.set(uToM(zone.at.x), 0.07, uToM(zone.at.z));
        mark.mesh.scale.set(r, 1, r);
        if (!reduced()) mark.mesh.rotation.y += info.worldDt * 0.8;
      }
      for (let k = 0; k < streaks.length; k += 1) {
        const item = streaks[k]!;
        if (item.life <= 0) continue;
        item.life -= info.worldDt;
        const material = item.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, item.life / STREAK_S) * 0.7;
        item.mesh.visible = item.life > 0;
      }
      hitFx.update(info.worldDt);
      numbers.update(info.dt);
      smoke.update(info.worldDt);
      swords.update(info.worldDt);
      applyShake(info.dt);
    },
    dispose(): void {
      hitFx.dispose();
      numbers.dispose();
      smoke.dispose();
      swords.dispose();
      group.removeFromParent();
      zoneGeometry.dispose();
      streakGeometry.dispose();
      for (const mark of zones) (mark.mesh.material as THREE.Material).dispose();
      for (const item of streaks) (item.mesh.material as THREE.Material).dispose();
      if (shaken) renderer.camera?.updateProjectionMatrix();
    },
  };
}
