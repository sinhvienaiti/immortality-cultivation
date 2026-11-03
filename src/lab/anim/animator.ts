/**
 * Lab Animator (MOTION_PLAN step 2; CHARACTER_ANIMATION §5.5–5.8): one base
 * clip (two while a gait blends) evaluated by hand each frame, per-bone
 * inertialized transitions, the wind-up following the typing, release,
 * follow-through and recovery, locomotion (walk ↔ jog ↔ run by speed with the
 * stride matched to the ground, strafes and the back step), turn in place,
 * the dash as a light-footed glide, idle fidgets, and the procedural layers,
 * foot locking and spring chains on top.
 *
 * Clips are sampled straight from their tracks (ClipSampler) and every bone
 * is written each frame. The AnimationActions only show the probe which clip
 * plays, at what time and weight; the mixer is never updated, because three's
 * PropertyMixer writes a bone only when its mixed value changed, so constant
 * tracks and a paused clip kept last frame's IK and layers in the bones.
 *
 * Round 2 (acting.ts): every skill acts in three phases on top of its clip
 * section (anticipation with the typing, a decisive release, an 18-frame
 * hold, overshoot and settle, a 0.5 s recovery while the clip cross-fades to
 * Idle in ~0.22 s), K4 has its own clip (`thrust`) and rhythm apart from the
 * guard, the dash compresses, glides leaning 26° with the arms trailing and
 * lands on a braking step, a hit staggers the body away from the blow with a
 * step back, a stop sways on and settles, and the root never turns faster
 * than 360°/s (locomotion.ts).
 *
 * Round 3 (gestures.ts): each slot plays a casting gesture (sword-finger
 * seal, sky edict lift, fan sweep, bow-stance thrust, overhead raise, planted
 * guard, dash crouch) with a weight shift, the feet stepping into its stance
 * (requested steps with their own length, the back foot of a lunge anchored),
 * the wrists shaped, the tail whipped on the release; a cast turns the body to
 * its target faster than a walk (≤ 600°/s, eased; quicker re-plant steps);
 * the torso and head lead every turn; the chest's heading is capped at
 * 720°/s; a stop ends on a settle step; a blow staggers in 2 frames and steps
 * back 0.38 m.
 *
 * Frame order (appendix C §2.2): state → acting → pose → inertialization →
 * Hit additive → root → world layers (lean, acting pose, recoil, breathing,
 * look-at) → arm aims → foot IK → spring chains. VFX read the hand after
 * this (skills-main).
 *
 * Round 4 (key-pose.ts): a slot with authored key poses on this rig (the
 * human proxy's fan sweep) plays them over Idle in the "pose" state instead
 * of a strike clip and a gesture: the typing moves it through the coil, the
 * last key starts the release on its own frame, and the poses are written
 * after the world layers and before the foot IK (the legs bend to the planted
 * feet under the lowered hips; the springs run after). The acting stays idle.
 *
 * The state machine knows clip keys and bone names only, so a later hero
 * with the same names reuses it (MOTION_PLAN step 5). No allocation per frame.
 */
import * as THREE from "three";
import { Acting, moveDef, type MoveId } from "./acting";
import { FootLock, type FootMode } from "./foot-ik";
import { analyseGait, type GaitFeet, type GaitInfo } from "./gait";
import { Inertializer } from "./inertial";
import { KeyPoser } from "./key-pose";
import { Layers } from "./layers";
import { Locomotion } from "./locomotion";
import { clamp, criticalSpring, DEG, LabRng, smoothstep, wrapPi } from "./math";
import { ClipSampler, Rig } from "./rig";
import { SpringChains, tipFromSkin } from "./springs";

export type ClipKey = "idle" | "fidget" | "walk" | "jog" | "run" | "strafeL" | "strafeR" | "back" | "attack" | "thrust" | "skill1" | "skill2" | "ult" | "dash" | "hit";
export type { MoveId };

/** Transition half-lives (s), MOTION_PLAN step 2.2 and appendix C §2.2. */
export const HALFLIFE = {
  release: 0.04,
  charge: 0.06,
  toIdle: 0.09,
  /** A skill's end into Idle: ~0.33 s to 95 % (round 3: 0.065 swung the arm 95° in ~6 frames under a fading aim). */
  recover: 0.1,
  dashIn: 0.04,
  dashOut: 0.08,
  hit: 0.03,
  idleToMove: 0.1,
  moveToIdle: 0.12,
  moveSwitch: 0.12,
  fidget: 0.15,
} as const;

/** Strike clip timing (clip seconds): release (hand speed peak), end of the wind-up, end of the swing. */
export interface StrikeTiming {
  release: number;
  windup: number;
  swingEnd: number;
  duration: number;
  /** The striking hand: 1 right, −1 left (the faster at the release). */
  hand: number;
}

export type { GaitInfo };

export interface AnimatorClip {
  key: ClipKey;
  clip: THREE.AnimationClip;
  loop: boolean;
  /** Clip time of the strike (§5.6 `release`). */
  release?: number;
}

type State = "loco" | "fidget" | "charge" | "strike" | "dash" | "pose";

/**
 * The swing runs faster and the recovery slower than authored (plan step 2.3: ×1.3, ×0.9; appendix C §2.9
 * allows 1.2–1.5): ×1.2 keeps the swing within §5.11's 1.5 × clip peak once the release inertialization adds
 * its own speed. A held follow-through barely moves.
 */
const SWING_RATE = 1.2;
const HOLD_RATE = 0.05;
/**
 * Clip seconds before the release the strike runs on from at the last key: 45 ms at the swing rate, so the
 * body reaches the release within §5.11's 50 ms. The typed wind-up fills the clip up to that point
 * (time = progress × (release − lead), plan step 2.3 / §5.6), so the last key mostly continues the clip.
 */
const RELEASE_LEAD = 0.045 * 1.2;
/** The strike hands over to Idle this long (clip s) before its end (clips end on Idle@0, plan step 2.1). */
const STRIKE_EXIT = 0.1;
/** Dash: the clip runs from here at this rate; the body glides this high over the path. */
const DASH_START = 0.1;
const DASH_RATE = 1.0;
const DASH_LIFT_M = 0.1;
/** Landing: the run's front-foot contact pose is held this long after touch-down (the braking step), then Idle. */
const BRAKE_STEP_S = 0.2;
/**
 * Landing: the legs reach for the ground once the logical dash path is under DASH_REACH_SHARE of its peak (~6 frames
 * before the shown root stops), the root held at DASH_REACH_LIFT_M meanwhile so the reaching foot stays clear; the
 * lift drops once the shown root is under DASH_LAND_SHARE of its peak.
 */
const DASH_REACH_SHARE = 0.55;
const DASH_REACH_LIFT_M = 0.16;
const DASH_LAND_SHARE = 0.08;
/** A clip foot lower than this over its standing height counts as on the ground (m). */
const LAND_CLEAR_M = 0.03;
/** A hit steps the body back this far (m), the feet stepping with it (round-2 judges: 0.3–0.5 m with a step). */
const HIT_STEP_M = 0.28;
/** A cast turn: the turn's speed and acceleration × this, the body this far past the lagging foot, re-plant steps this long (s). */
const CAST_TURN_BOOST = 2.2;
const CAST_TURN_LEAD = 95 * DEG;
const CAST_STEP_S = 0.17;
/** After a stop the feet settle under the body this long after (s), in a step this long (s). */
const SETTLE_AFTER_S = 0.14;
const SETTLE_STEP_S = 0.28;
/** After touch-down the feet settle this long (s) before standing locks plant them wherever they touch. */
const LAND_SETTLE_S = 0.3;
const MOVE_ON = 0.04;
/** Forward gaits slowest first, and the side gaits (motion off the facing). */
const FWD_GAITS: readonly ClipKey[] = ["walk", "jog", "run"];
const SIDE_GAITS: readonly ClipKey[] = ["strafeL", "strafeR", "back"];
/** Gait blend band round the crossover of two neighbours (share of the crossover speed, log-symmetric). */
const GAIT_BAND = 1.45;
/**
 * The speed that picks the gaits and their blend follows the ground speed on this half-life (s). Round 3: accelerating
 * through a narrow band moved the walk/run weight ~30 % a frame and the inertialized switch threw Lam's head back 70°.
 */
const GAIT_SEL_HL = 0.06;
const H_VEL = 1 / 60;
/** Yaw half-life when turning in place past 60° (the feet re-plant on the way: ~0.6 s for 180°). */
export const TURN_IN_PLACE_HL = 0.14;
/** Standing, the body turns at most this far past its planted feet (rad). */
const TURN_LEAD = 70 * DEG;

export class Animator {
  readonly rig: Rig;
  /** Holds the actions the probe reads; never updated (see the header). */
  readonly mixer: THREE.AnimationMixer;
  readonly loco = new Locomotion();
  readonly layers: Layers;
  readonly acting: Acting;
  readonly feet: FootLock | null;
  readonly springs: SpringChains;
  /** Authored key-pose skills on this rig (round 4); empty for Lam. */
  readonly keyPoses: KeyPoser;
  /** The key poses' last stance request handed to the feet. */
  private keyStanceSeq = 0;
  /**
   * The play camera's heading on the ground (rad, the Animator's yaw convention), set by the caster from the frame
   * drawn last; null until known. A key-pose skill with a directional cheat reads it (round 4b).
   */
  viewYaw: number | null = null;
  /** The key-pose skill's true target (the lead hand and head stay on it), and whether one is set. */
  readonly poseTarget = { x: 0, z: 0, on: false };
  readonly keys: ClipKey[] = [];
  readonly actions: THREE.AnimationAction[] = [];
  private readonly loops: boolean[] = [];
  private readonly samplers: ClipSampler[] = [];
  private readonly weight: Float32Array;
  readonly strikes = new Map<ClipKey, StrikeTiming>();
  readonly gaits = new Map<ClipKey, GaitInfo>();
  /** Forward gaits present, slowest first. */
  private readonly fwd: ClipKey[] = [];
  private readonly inertial: Inertializer;
  private readonly poseQ: Float32Array;
  private readonly poseP: Float32Array;
  private readonly prevQ: Float32Array;
  private readonly prevP: Float32Array;
  private readonly blendQ: Float32Array;
  private readonly blendP: Float32Array;
  private readonly rng = new LabRng(7);
  // Base selection this frame.
  private main = -1;
  private mainTime = 0;
  private mainRate = 1;
  private blend = -1;
  private blendTime = 0;
  private blendRate = 1;
  private blendW = 0;
  private transition = -1;
  // State.
  state: State = "loco";
  private idleT = 0;
  private nextFidget = 6;
  /** The gait shown (the dominant clip of a blend) or −1 idle. */
  private gaitShown = -1;
  private phase = 0;
  private readonly chargeS = new Float64Array(2);
  private chargeGoal = 0;
  private strikeAge = 0;
  private dashAge = 0;
  private landed = -1;
  /** Seconds left of the braking step's held pose after a dash touch-down (−1 none). */
  private brakeLeft = -1;
  /** The speed the gait ran at lately (for the stop sway). */
  private gaitSpeed = 0;
  private readonly lift = new Float64Array(2);
  private liftGoal = 0;
  private lookHold = 0;
  /** Seconds after a dash touch-down while the feet still settle (they lock only once the clip slows them). */
  private landHold = 0;
  private first = true;
  private springsReset = true;
  private turnLead = TURN_LEAD;
  /** The stance request last handed to the feet, and the settle step's countdown after a stop (s, −1 none). */
  private stanceSeq = 0;
  private settleIn = -1;
  /** The gait-picking speed (spring: value, velocity). */
  private readonly gaitSel = new Float64Array(2);
  /** The tail chain (springs) for the acting's whips. */
  private tailChain = -1;
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly handR: THREE.Object3D | null;
  /** A pose held on purpose with both arms raised (the arms-out check skips it). */
  intendedPose = false;
  /** Called on a base clip change (probe markers). */
  onClip: ((key: ClipKey) => void) | null = null;

  constructor(
    readonly model: THREE.Object3D,
    readonly root: THREE.Object3D,
    clips: AnimatorClip[],
  ) {
    this.rig = new Rig(model);
    const n = this.rig.count;
    this.poseQ = new Float32Array(n * 4);
    this.poseP = new Float32Array(n * 3);
    this.prevQ = new Float32Array(n * 4);
    this.prevP = new Float32Array(n * 3);
    this.blendQ = new Float32Array(n * 4);
    this.blendP = new Float32Array(n * 3);
    this.inertial = new Inertializer(n, this.rig.find("pelvis"));
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) {
      const a = this.mixer.clipAction(c.clip);
      a.setLoop(c.loop ? THREE.LoopRepeat : THREE.LoopOnce, c.loop ? Infinity : 1);
      a.clampWhenFinished = true;
      a.timeScale = 0;
      this.keys.push(c.key);
      this.actions.push(a);
      this.loops.push(c.loop);
      this.samplers.push(new ClipSampler(c.clip, this.rig));
    }
    this.weight = new Float32Array(clips.length);
    const hit = clips.find((c) => c.key === "hit");
    this.layers = new Layers(this.rig, hit ? hit.clip : null);
    this.acting = new Acting(this.rig);
    this.keyPoses = new KeyPoser(this.rig, root);
    this.handR = model.getObjectByName("FX_HAND_R") ?? this.rig.bone("hand_r");
    const leg = (s: "l" | "r") => {
      const thigh = this.rig.bone("thigh_" + s);
      const calf = this.rig.bone("calf_" + s);
      const foot = this.rig.bone("foot_" + s);
      return thigh && calf && foot ? { thigh, calf, foot, ball: this.rig.bone("ball_" + s) } : null;
    };
    const l = leg("l");
    const r = leg("r");
    this.feet = l && r ? new FootLock([l, r], this.forward, this.rig.bone("pelvis")) : null;
    this.springs = new SpringChains(root);
    this.buildSprings();
    this.analyse(clips);
    for (const k of FWD_GAITS) if (this.gaits.has(k) && this.gaits.get(k)!.speed > 0.05) this.fwd.push(k);
    this.fwd.sort((a, b) => this.gaits.get(a)!.speed - this.gaits.get(b)!.speed);
    this.main = this.indexOf("idle");
  }

  /** Spring chains on the tail, ears and bag (plan step 2.9; appendix C §2.5, tuned on the frame sheets). */
  private buildSprings(): void {
    let skinned: THREE.SkinnedMesh | null = null;
    this.model.traverse((o) => {
      if (skinned === null && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    const tip = (b: THREE.Bone, fallback: number): number => (skinned ? tipFromSkin(skinned, b, fallback) : fallback);
    const tail = ["tail_01", "tail_02", "tail_03", "tail_04", "tail_05"].map((nm) => this.rig.bone(nm)).filter((b): b is THREE.Bone => b !== null);
    if (tail.length > 0) {
      // Stiffer at the base, looser to the tip; most of the body's own motion trails it, so it lags each step, turn,
      // dash and stop (round-2 judges: the tail stayed stiff walking). Round 2 had trail 0.3, 2.4–1.4 Hz, ζ 0.55.
      this.tailChain = this.springs.addChain(tail, tip(tail[tail.length - 1]!, 0.18), (i) => {
        const u = i / Math.max(1, tail.length - 1);
        return { hz: 2.1 - 1.0 * u, zeta: 0.42, gravity: 1.2, trail: 0.62 + 0.25 * u, maxDeg: 26 + 16 * u, maxDegS: 520, radius: 0.04, trailStepM: 0.06 };
      });
    }
    for (const nm of ["ear_l", "ear_r"]) {
      const b = this.rig.bone(nm);
      if (b) this.springs.addChain([b], tip(b, 0.25), () => ({ hz: 4, zeta: 0.7, gravity: 0, trail: 0.2, maxDeg: 12, maxDegS: 300, radius: 0 }));
    }
    const bag = this.rig.bone("bag_r");
    if (bag) this.springs.addChain([bag], tip(bag, 0.2), () => ({ hz: 2.2, zeta: 0.5, gravity: 3, trail: 0.3, maxDeg: 25, maxDegS: 360, radius: 0.03 }));
    const pelvis = this.rig.bone("pelvis");
    if (pelvis) this.springs.addSphere(pelvis, new THREE.Vector3(0, 0.05, 0), 0.13);
    for (const s of ["l", "r"]) {
      const thigh = this.rig.bone("thigh_" + s);
      const calf = this.rig.bone("calf_" + s);
      if (thigh && calf) this.springs.addCapsule(thigh, new THREE.Vector3(), calf.position, 0.07);
    }
  }

  private indexOf(key: ClipKey): number {
    return this.keys.indexOf(key);
  }

  has(key: ClipKey): boolean {
    return this.keys.indexOf(key) >= 0;
  }

  /** The palm socket (FX_HAND_R), world position (fresh after update). */
  hand(out: THREE.Vector3): boolean {
    if (!this.handR) return false;
    this.handR.getWorldPosition(out);
    return true;
  }

  // ── Analysis at load (FK on the rig itself) ────────────────────────────

  private analyse(clips: AnimatorClip[]): void {
    const rig = this.rig;
    const q = this.poseQ;
    const p = this.poseP;
    const v = new THREE.Vector3();
    const handR = rig.bone("hand_r");
    const handL = rig.bone("hand_l");
    const pose = (i: number, t: number): void => {
      rig.restPose(q, p);
      this.samplers[i]!.sample(t, q, p);
      rig.writePose(q, p);
      this.root.updateMatrixWorld(true);
    };
    const idle = this.indexOf("idle");
    let feetInfo: GaitFeet | null = null;
    if (idle >= 0) {
      pose(idle, 0);
      this.feet?.calibrate();
      const ank = [rig.bone("foot_l"), rig.bone("foot_r")];
      const bal = [rig.bone("ball_l"), rig.bone("ball_r")];
      if (ank[0] && ank[1] && bal[0] && bal[1]) {
        const y = (b: THREE.Bone): number => this.root.worldToLocal(b.getWorldPosition(v)).y;
        feetInfo = { ankle: [ank[0], ank[1]], ball: [bal[0], bal[1]], standA: [y(ank[0]), y(ank[1])], standB: [y(bal[0]), y(bal[1])] };
      }
    }
    for (let i = 0; i < clips.length; i += 1) {
      const c = clips[i]!;
      const dur = this.samplers[i]!.duration;
      if (c.release !== undefined && handR && handL) {
        // Hand speed at 60 Hz (root space): the faster hand at the release sets the wind-up and swing ends.
        const fps = 60;
        const nF = Math.max(2, Math.round(dur * fps));
        const sr: number[] = [0];
        const sl: number[] = [0];
        const pr = new THREE.Vector3();
        const pl = new THREE.Vector3();
        for (let k = 0; k <= nF; k += 1) {
          pose(i, (k / nF) * dur);
          this.root.worldToLocal(handR.getWorldPosition(v));
          if (k > 0) sr.push(v.distanceTo(pr) * fps);
          pr.copy(v);
          this.root.worldToLocal(handL.getWorldPosition(v));
          if (k > 0) sl.push(v.distanceTo(pl) * fps);
          pl.copy(v);
        }
        const kr = Math.min(nF, Math.round((c.release / dur) * nF));
        const peakAt = (s: number[]): number => Math.max(s[Math.max(0, kr - 1)]!, s[kr]!, s[Math.min(nF, kr + 1)]!);
        const raw = peakAt(sr) >= peakAt(sl) ? sr : sl;
        // 24 fps keys leave a saw-tooth in the per-frame speed: smooth over 5 frames before looking for the ends.
        const s = raw.map((_, k) => {
          let sum = 0;
          let cnt = 0;
          for (let j = Math.max(1, k - 2); j <= Math.min(nF, k + 2); j += 1) {
            sum += raw[j]!;
            cnt += 1;
          }
          return cnt > 0 ? sum / cnt : 0;
        });
        const peak = peakAt(s);
        // Wind-up end: the last slow frame before the swing; swing end: the first slow frame after it.
        let kw = kr;
        while (kw > 1 && s[kw]! >= 0.2 * peak) kw -= 1;
        let ke = kr;
        while (ke < nF && s[ke]! >= 0.25 * peak) ke += 1;
        this.strikes.set(c.key, { release: c.release, windup: Math.min(c.release, (kw / nF) * dur), swingEnd: Math.max(c.release, (ke / nF) * dur), duration: dur, hand: raw === sr ? 1 : -1 });
      }
      if (c.loop && c.key !== "idle" && feetInfo) {
        // Stabilized gaits (the planted foot at one speed); the dash runs only 0.2 s and is measured as authored.
        this.gaits.set(c.key, analyseGait(c.clip, rig, this.root, feetInfo, c.key !== "dash"));
        this.samplers[i] = new ClipSampler(c.clip, rig);
      }
    }
    rig.writePose(rig.restQ, rig.restP);
    this.root.updateMatrixWorld(true);
  }

  // ── Commands ───────────────────────────────────────────────────────────

  /** Puts the caster at (x, z) facing (fx, fz), Idle from frame 0, everything settled. */
  place(x: number, z: number, fx: number, fz: number): void {
    this.loco.place(x, z, fx, fz);
    this.state = "loco";
    this.gaitShown = -1;
    this.main = this.indexOf("idle");
    this.mainTime = 0;
    this.mainRate = 1;
    this.blend = -1;
    this.blendW = 0;
    this.idleT = 0;
    this.nextFidget = this.rng.range(4, 9);
    this.lift[0] = this.lift[1] = 0;
    this.liftGoal = 0;
    this.landed = -1;
    this.brakeLeft = -1;
    this.gaitSpeed = 0;
    this.lookHold = 0;
    this.landHold = 0;
    this.turnLead = TURN_LEAD;
    this.settleIn = -1;
    this.transition = -1;
    this.intendedPose = false;
    this.acting.reset();
    this.keyPoses.reset();
    this.layers.reset();
    this.springs.trailBoost = 1;
    this.inertial.reset();
    this.feet?.reset();
    this.first = true;
    this.springsReset = true;
  }

  private request(halflife: number): void {
    this.transition = this.transition < 0 ? halflife : Math.min(this.transition, halflife);
  }

  private setMain(key: ClipKey, time: number, rate: number, halflife: number): void {
    const i = this.indexOf(key);
    if (i < 0) return;
    const changed = i !== this.main || this.blend >= 0;
    this.main = i;
    this.mainTime = time;
    this.mainRate = rate;
    this.blend = -1;
    this.blendW = 0;
    this.request(halflife);
    if (changed) this.onClip?.(key);
  }

  /**
   * Turn towards (fx, fz): standing and more than 60° off, a slower spring
   * (turn in place: the feet re-plant, the head leads); returns the turn (rad).
   */
  face(fx: number, fz: number): number {
    const before = this.loco.yawGoal;
    this.loco.face(fx, fz);
    const err = Math.abs(wrapPi(this.loco.yawGoal - this.loco.yaw));
    const inPlace = this.loco.speed < 0.2 && err > 60 * DEG;
    this.loco.turnHalflife = inPlace ? TURN_IN_PLACE_HL : 0.06;
    // The torso and head lead the turn (Layers' turn lead), no look target needed.
    if (this.state === "fidget") this.toIdle(HALFLIFE.fidget);
    return Math.abs(wrapPi(this.loco.yawGoal - before));
  }

  /**
   * A cast turns the body to its target (x, z): quicker than a walk's turn (≤ 600°/s, eased in and out), the feet
   * re-planting in quicker steps, the torso and head leading. Pre-turned while the word is typed; on an instant cast
   * the hand already points while the body comes round.
   */
  castFace(x: number, z: number): void {
    const dx = x - this.loco.showX;
    const dz = z - this.loco.showZ;
    if (dx * dx + dz * dz < 0.25) return;
    const err = Math.abs(wrapPi(Math.atan2(dx, dz) - this.loco.yaw));
    if (err < 4 * DEG) return;
    this.face(dx, dz);
    this.loco.turnBoost = CAST_TURN_BOOST;
  }

  /** One key of a typed word for `move` on its strike clip: the wind-up follows the progress (§5.6), the acting coils. */
  charge(move: MoveId | "dash", key: ClipKey, progress: number, keysLeft: number, tx: number, tz: number): void {
    const p = clamp(progress, 0, 1);
    this.lookAt(tx, 1.0, tz, 1);
    if (move === "dash") {
      // The dash wind-up: the body compresses with the word; the eyes hold on the target between keys.
      this.acting.chargeDash(p, keysLeft);
      this.lookHold = Math.max(this.lookHold, 0.6);
      return;
    }
    if (this.keyPoses.has(move)) {
      this.chargePose(move, p, keysLeft, tx, tz);
      return;
    }
    if (this.keyPoses.active) this.keyPoses.cancel();
    const st = this.strikes.get(key);
    if (!st) return;
    this.loco.stop();
    this.leaveDash();
    if (this.state !== "charge" || this.keys[this.main] !== key) {
      this.state = "charge";
      this.chargeS[0] = 0;
      this.chargeS[1] = 0;
      this.setMain(key, 0, 0, HALFLIFE.charge);
    }
    this.chargeGoal = Math.max(0, st.release - RELEASE_LEAD) * p;
    this.acting.charge(move, p, keysLeft, tx, tz);
    // Pre-turn to the target while the word is typed (the guard holds its ground).
    if (moveDef(move).faceTarget) this.castFace(tx, tz);
    this.layers.breathWeight = 0.5;
  }

  /**
   * The word's last key: the strike runs on from just before its release (≤ 50 ms to the release) and the
   * acting releases; hold, settle and recovery follow the acting's timeline (acting.ts).
   */
  release(move: MoveId, key: ClipKey, tx: number, tz: number, hasTarget: boolean): void {
    if (this.keyPoses.has(move)) {
      this.releasePose(move, tx, tz, hasTarget);
      return;
    }
    if (this.keyPoses.active) this.keyPoses.cancel();
    const st = this.strikes.get(key);
    if (!st) return;
    this.loco.stop();
    // Run on from the shown wind-up when it is already that far (no jump), else from release − lead (inertialized).
    const from = this.state === "charge" && this.keys[this.main] === key ? Math.max(this.mainTime, st.release - RELEASE_LEAD) : st.release - RELEASE_LEAD;
    const same = this.keys[this.main] === key && this.blend < 0;
    this.leaveDash();
    this.state = "strike";
    this.strikeAge = 0;
    this.setMain(key, from, SWING_RATE, HALFLIFE.release);
    // A release is a state change even on the same clip (charge → strike, a repeated attack).
    if (same) this.onClip?.(key);
    this.acting.release(move, tx, tz);
    // A light recoil under the acting's lean (the body drives into the strike; the spine still kicks back a little).
    this.layers.kick(110, -1, 0);
    this.layers.breathWeight = 0.3;
    const def = moveDef(move);
    if (hasTarget) {
      // The body comes round to the target (an instant cast: the hand points first); the head looks at it (the sky
      // gestures look up through their own head pitch).
      if (def.faceTarget) this.castFace(tx, tz);
      this.lookAt(tx, def.targetY > 0 ? 1.0 : 0.4, tz, 1);
    }
    this.lookHold = def.gesture === "overheadRaise" || def.gesture === "skyLift" ? 0.45 : 0.5;
  }

  /**
   * A key-pose skill's word: the body enters the "pose" state over Idle (the acting lets go), turns to the target
   * while typed, and the typing moves the poses through the coil (key-pose.ts).
   */
  private chargePose(move: MoveId, p: number, keysLeft: number, tx: number, tz: number): void {
    this.loco.stop();
    this.leaveDash();
    if (this.state !== "pose") this.enterPose();
    this.keyPoses.charge(move, p, keysLeft);
    this.poseTarget.x = tx;
    this.poseTarget.z = tz;
    this.poseTarget.on = true;
    // Directional cheat (round 4b): an attack towards the camera loads with the body turned to its left (the sword
    // arm on the near side), up to cheatDeg straight at the camera; the release turns it back onto the target.
    const dx = tx - this.loco.showX;
    const dz = tz - this.loco.showZ;
    const cheat = this.keyPoses.cheatDeg(move) * DEG;
    let yaw = Math.atan2(dx, dz);
    if (cheat > 0 && this.viewYaw !== null) {
      const off = Math.abs(wrapPi(yaw - this.viewYaw));
      const k = clamp((off - Math.PI / 2) / (Math.PI / 2), 0, 1);
      yaw += cheat * Math.pow(k, 0.7);
    }
    this.castFace(this.loco.showX + Math.sin(yaw) * 6, this.loco.showZ + Math.cos(yaw) * 6);
    this.layers.breathWeight = 0.2;
  }

  /** A key-pose skill's last key: the release starts on this frame (≤ 50 ms gate), the body still coming round. */
  private releasePose(move: MoveId, tx: number, tz: number, hasTarget: boolean): void {
    this.loco.stop();
    this.leaveDash();
    if (this.state !== "pose") this.enterPose();
    this.keyPoses.release(move);
    this.layers.breathWeight = 0.1;
    if (hasTarget) {
      this.castFace(tx, tz);
      this.poseTarget.x = tx;
      this.poseTarget.z = tz;
      this.poseTarget.on = true;
    }
    this.onClip?.("idle");
  }

  private enterPose(): void {
    this.acting.cancel();
    this.state = "pose";
    if (this.keys[this.main] !== "idle" || this.blend >= 0) this.setMain("idle", 0, 1, HALFLIFE.toIdle);
    this.gaitShown = -1;
    this.layers.lookWeightGoal = 0;
  }

  /** The strike the lab released last, its age (s): a host's own play() right after a release is the same strike. */
  get strikeAgeS(): number {
    if (this.state === "pose" && this.keyPoses.releaseAge >= 0) return this.keyPoses.releaseAge;
    return this.state === "strike" ? this.strikeAge : Infinity;
  }

  /** The dash: a glide a hand above the ground along sword-skills.ts's path (the shown root eases in), then a landing. */
  dash(): void {
    if (this.keyPoses.active) this.keyPoses.cancel();
    this.state = "dash";
    this.dashAge = 0;
    this.landed = -1;
    // The body faces the path; a look held on the target would swing round as the glide passes it (and never let go).
    this.lookHold = 0;
    this.brakeLeft = -1;
    this.layers.lookWeightGoal = 0;
    this.layers.leanForwardGoal = 0;
    this.liftGoal = DASH_LIFT_M;
    this.acting.dashStart();
    this.loco.beginDash();
    this.setMain("dash", DASH_START, DASH_RATE, HALFLIFE.dashIn);
  }

  /** An enemy blow from (fromX, fromZ): the Hit clip as an upper-body additive and a push away, the eyes on the attacker. */
  hit(fromX: number, fromZ: number): void {
    this.layers.hit();
    const dx = this.loco.showX - fromX;
    const dz = this.loco.showZ - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    const fx = this.loco.fx;
    const fz = this.loco.fz;
    const pf = (dx * fx + dz * fz) / l;
    const pr = (dx * -fz + dz * fx) / l;
    // A directional stagger (torso 18°, head 25°, ~0.3 s) and a step back, the feet planted; a light recoil under it.
    this.acting.hit(pf, pr, HIT_STEP_M, fromX, fromZ);
    this.layers.kick(120, pf, pr);
    this.lookAt(fromX, 1.0, fromZ, 1);
    this.lookHold = 0.6;
    this.onClip?.("hit");
  }

  lookAt(x: number, y: number, z: number, weight: number): void {
    this.layers.lookTarget.set(x, y, z);
    this.layers.lookWeightGoal = weight;
  }

  walkPath(xzs: readonly number[], keepFacing: boolean): void {
    this.loco.setPath(xzs, keepFacing);
    if (this.keyPoses.active) this.keyPoses.cancel();
    if (this.state === "fidget" || this.state === "charge" || this.state === "pose") this.toIdle(HALFLIFE.fidget);
    if (this.state !== "dash") this.acting.cancel();
  }

  stopMove(): void {
    this.loco.stop();
  }

  /** A wind-up left without its release (a primed attack that never fired): back to Idle on the recovery springs. */
  cancelCharge(): void {
    if (this.state === "pose") {
      this.keyPoses.cancel();
      this.toIdle(HALFLIFE.toIdle);
      return;
    }
    if (this.state !== "charge") return;
    this.acting.cancel();
    this.toIdle(HALFLIFE.toIdle);
  }

  /** The skill code moves the caster (sword-skills.ts's dash). */
  external(x: number, z: number): void {
    this.loco.external(x, z);
  }

  /**
   * A skill typed or released over the dash's glide or its braking step (Phi Kiếm fires on its own): the lift falls,
   * the braking step ends and the feet settle before they lock. Review fix: the strike left `liftGoal` at 0.1 m (the
   * caster floated a hand above the ground until the next dash) and `brakeLeft` at Infinity (Idle frozen on frame 0,
   * a transition asked for every frame, every walk start reset to phase 0).
   */
  private leaveDash(): void {
    if (this.state !== "dash" && this.brakeLeft < 0 && this.liftGoal === 0) return;
    if (this.state === "dash" || this.brakeLeft >= 0) this.landHold = LAND_SETTLE_S;
    this.liftGoal = 0;
    this.brakeLeft = -1;
    this.landed = -1;
  }

  private toIdle(halflife: number): void {
    // Idle ends a braking step (walking off during it reset the gait to phase 0 every frame until it ran out).
    this.brakeLeft = -1;
    this.state = "loco";
    this.gaitShown = -1;
    this.idleT = 0;
    this.setMain("idle", 0, 1, halflife);
    this.layers.breathWeight = 1;
  }

  // ── Per frame ──────────────────────────────────────────────────────────

  update(dt: number): void {
    this.loco.update(dt);
    this.layers.lastDt = dt;
    // Acting first: its timeline drives the strike's clip, its root step (a lunge, a step back) moves the root.
    const act = this.acting;
    act.facingX = this.loco.fx;
    act.facingZ = this.loco.fz;
    act.tuck = this.gaitShown >= 0 ? smoothstep(1.2, 2.4, this.loco.speed) : 0;
    act.update(dt, this.loco.showX, this.loco.showZ);
    // The acting's lunge or step back moves the shown root only (view offset, eased back); the logical position the
    // skill code reads stays where the sim puts it.
    this.loco.showX += act.offX;
    this.loco.showZ += act.offZ;
    this.intendedPose = act.intended || this.keyPoses.intended;
    this.updateState(dt);
    this.evaluate(dt);
    // Root: the glide lifts it; the model's front is −z (lam.glb), so the yaw turns by π.
    criticalSpring(this.lift, 0, this.liftGoal, this.liftGoal > 0 ? 0.025 : 0.035, dt);
    this.root.position.set(this.loco.showX, Math.max(0, this.lift[0]!), this.loco.showZ);
    this.root.rotation.y = this.loco.yaw + Math.PI;
    const fx = this.loco.fx;
    const fz = this.loco.fz;
    this.forward.set(fx, 0, fz);
    this.layers.step(dt);
    this.layers.applyHit();
    this.root.updateMatrixWorld(true);
    this.feet?.capture();
    // The stride (front foot minus back foot along the facing, from the clip) drives the arm swing and tail sway.
    const g = this.gaitShown >= 0 ? this.keys[this.gaitShown] : null;
    this.layers.stride = this.feet && g !== null ? this.feet.clipStride(this.loco.showX, this.loco.showZ, this.loco.fx, this.loco.fz) : 0;
    this.layers.strideArms = g === "walk" ? 1 : g === "run" || g === "jog" ? 0.35 : 0;
    this.layers.turnHint = wrapPi(this.loco.yawGoal - this.loco.yaw);
    this.layers.applyWorld(fx, fz, act);
    act.applyArms(fx, fz);
    act.limitArms();
    // Authored key poses over everything above (a blow still shows through: the stagger takes part of the weight); the
    // lead hand and head stay on the true target while the body is cheated or still turning to it.
    const kp = this.keyPoses;
    kp.aimErr = kp.active && this.poseTarget.on ? clamp(wrapPi(Math.atan2(this.poseTarget.x - this.loco.showX, this.poseTarget.z - this.loco.showZ) - this.loco.yaw), -1.6, 1.6) : 0;
    if (!kp.active) this.poseTarget.on = false;
    kp.apply(dt, 1 - 0.7 * act.hitEnvelope);
    if (this.settleIn >= 0) {
      this.settleIn -= dt;
      // The settle step after a stop: the feet that stand off their place under the body step to it.
      if (this.settleIn < 0 && this.state === "loco" && this.gaitShown < 0) this.feet?.requestSteps(SETTLE_STEP_S, 0.05, -1);
    }
    if (this.feet) {
      // The gesture's stance: offsets per foot, anchored where the logical body stands unless a blow moves the body.
      if (kp.active || kp.stanceSeq !== this.keyStanceSeq) {
        // A key-pose skill's feet (back under the body once its recovery asks for no stance).
        const ks = kp.stance;
        if (ks) this.feet.setStance(ks.l[0], ks.l[1], ks.l[2] * DEG, ks.r[0], ks.r[1], ks.r[2] * DEG, 0, 0);
        else this.feet.setStance(0, 0, 0, 0, 0, 0, 0, 0);
        if (kp.stanceSeq !== this.keyStanceSeq) {
          this.keyStanceSeq = kp.stanceSeq;
          this.feet.requestSteps(ks ? ks.stepS : 0.2, ks ? ks.liftM : 0.05, ks?.first === "l" ? 0 : ks?.first === "r" ? 1 : -1);
        }
      } else {
        const st = act.stance;
        const an = act.anchor;
        this.feet.setStance(st.lf, st.lr, st.lyaw * DEG, st.rf, st.rr, st.ryaw * DEG, -act.offX * an, -act.offZ * an);
        if (act.stanceSeq !== this.stanceSeq) {
          this.stanceSeq = act.stanceSeq;
          this.feet.requestSteps(st.stepS, st.liftM, act.stanceFirst);
        }
      }
      // A cast turn re-plants in quicker steps.
      this.feet.turnStepS = this.loco.turnBoost > 1 ? CAST_STEP_S : 0.3;
      // Moving off slowly, a re-plant step under way lands first (cancelling it would drop the foot).
      const moving = this.gaitShown >= 0 || this.loco.speed > 0.05;
      // In the air (lifted with both clip feet clear of the ground, or the dash path still fast, also when a skill took
      // over the glide) the feet follow the clip. A foot that reaches the ground while the root still comes down locks
      // (review fix: the braking step's front foot touched down with the lift at ~2.5 cm and slid 3 frames unlocked).
      const air = (this.lift[0]! > 0.02 && this.feet.clearance() > LAND_CLEAR_M) || (this.loco.dashing && !this.loco.dashSlowerThan(DASH_LAND_SHARE));
      const mode: FootMode = air ? "off" : moving && !(this.feet.busy && this.loco.speed < 0.3) ? "move" : "stand";
      const ahead = mode === "stand" ? clamp(wrapPi(this.loco.yawGoal - this.loco.yaw), -55 * DEG, 55 * DEG) : 0;
      if (this.landHold > 0) this.landHold -= dt;
      // The braking step's pose is held still, so its feet lock where they touch; other landings settle first.
      const settle = (this.state === "dash" && this.brakeLeft < 0) || this.landHold > 0;
      this.feet.update(dt, this.first, this.loco.showX, this.loco.showZ, this.loco.yaw, ahead, mode, this.loco.speed, settle);
      // A standing turn stays within 70° of the foot that lags most; the feet step to catch up (plan step 2.8: re-plant at
      // 45–60°). Moving off, the limit opens over ~0.3 s instead of at once (no whip of the rest of the turn).
      this.loco.feetYaw = this.feet.laggingYaw(this.loco.yawGoal);
      const lead = this.loco.turnBoost > 1 ? CAST_TURN_LEAD : TURN_LEAD;
      this.turnLead = mode === "stand" ? lead : Math.min(Math.PI, this.turnLead + 3 * Math.PI * dt);
      this.loco.yawLead = this.turnLead >= Math.PI ? 0 : this.turnLead;
    }
    if (this.springsReset) {
      this.springs.invalidate();
      this.springsReset = false;
    }
    // The tail streams behind the dash's glide, and eases back after the landing.
    const boost = this.state === "dash" && this.landed < 0 ? 1.5 : 1;
    this.springs.trailBoost += (boost - this.springs.trailBoost) * (1 - Math.exp(-dt / 0.06));
    // The acting's whips (a release, a landing, a blow, a stop): the tail tips swing against the facing and up.
    if (act.tailKick > 0 && this.tailChain >= 0) {
      const k = act.tailKick;
      this.springs.kick(this.tailChain, -fx * k, 0.35 * k, -fz * k);
      act.tailKick = 0;
    } else act.tailKick = 0;
    this.springs.update(dt);
    this.first = false;
  }

  private updateState(dt: number): void {
    const loco = this.loco;
    // A look lasts while held or while a word is charged; a charge left without a release (walking off) lets go too.
    if (this.lookHold > 0) this.lookHold -= dt;
    if (this.lookHold <= 0 && this.state !== "charge") this.layers.lookWeightGoal = 0;
    this.keyPoses.update(dt);
    switch (this.state) {
      case "pose": {
        // Idle runs under the authored poses (the legs, and what shows through as their weight drops).
        this.mainTime += dt;
        this.mainRate = 1;
        const dur = this.durationOf(this.main);
        if (this.mainTime >= dur) this.mainTime -= dur;
        if (loco.hasPath) {
          this.keyPoses.cancel();
          this.toIdle(HALFLIFE.toIdle);
        } else if (!this.keyPoses.active || this.keyPoses.stage === "recover") {
          // The recovery hands back to Idle (the poses fade over it).
          this.state = "loco";
          this.gaitShown = -1;
          this.idleT = 0;
          this.layers.breathWeight = 1;
        }
        break;
      }
      case "charge": {
        criticalSpring(this.chargeS, 0, this.chargeGoal, 0.1, dt);
        this.mainTime = Math.max(0, this.chargeS[0]!);
        this.mainRate = this.chargeS[1]!;
        if (loco.hasPath) this.toIdle(HALFLIFE.toIdle);
        break;
      }
      case "strike": {
        const st = this.strikes.get(this.keys[this.main]!);
        this.strikeAge += dt;
        if (!st) {
          this.toIdle(HALFLIFE.toIdle);
          break;
        }
        // The swing runs to the clip's extreme, then the pose holds (a breath of life) through the acting's hold,
        // sustain and settle; its recovery hands the clip to Idle (~0.22 s) while the acting lowers the arms.
        const stage = this.acting.stage;
        const rate = this.mainTime < st.swingEnd ? SWING_RATE : HOLD_RATE;
        this.mainRate = rate;
        this.mainTime = Math.min(this.mainTime + rate * dt, st.duration - STRIKE_EXIT);
        if (stage === "recover" || stage === "done") this.toIdle(HALFLIFE.recover);
        else if (loco.hasPath) {
          this.acting.cancel();
          this.toIdle(HALFLIFE.toIdle);
        }
        break;
      }
      case "dash":
        this.updateDash(dt);
        break;
      case "fidget": {
        this.mainTime += dt;
        this.mainRate = 1;
        if (this.mainTime >= this.durationOf(this.main) - STRIKE_EXIT || loco.moving) this.toIdle(HALFLIFE.fidget);
        break;
      }
      case "loco":
        this.updateLoco(dt);
        break;
    }
  }

  /** Glide while the path runs, then land: the lift falls, a short crouch absorbs it, Idle takes over. */
  private updateDash(dt: number): void {
    const loco = this.loco;
    this.dashAge += dt;
    const dur = this.durationOf(this.main);
    if (this.brakeLeft > 0) {
      // The braking step's contact pose holds until touch-down (review fix: the dash clock kept running it, so the
      // Run cycle played on under the reaching legs and swept the front foot as it landed).
      this.mainRate = 0;
    } else {
      this.mainRate = this.landed >= 0 ? 1 : DASH_RATE;
      this.mainTime = (this.mainTime + this.mainRate * dt) % dur;
    }
    // The feet stay clear of the ground until the shown root is nearly still (no foot dragged at speed), then drop.
    // Review fix: both tests read the logical path, which stops ~3 frames before the shown root, and the run's contact
    // pose reaches ~8 cm below the glide: the front foot touched down with the root still at 6.8 m/s (a 10.3 m/s
    // planted-foot skid, twice round 1's 5.0).
    if (this.landed >= 0 && this.liftGoal > 0 && (loco.dashSlowerThan(DASH_LAND_SHARE) || !loco.dashing)) this.liftGoal = 0;
    if (this.landed < 0 && this.dashAge > 0.1 && (loco.dashPathSlowerThan(DASH_REACH_SHARE) || !loco.dashing)) {
      this.landed = 0;
      this.liftGoal = DASH_REACH_LIFT_M;
      this.layers.leanForwardGoal = 0;
      this.acting.dashLand();
      // The braking step: as the path slows the legs reach for the ground in the run's front-foot contact (held), so
      // the pose is in place at touch-down and the front foot plants at once; then Idle, the back foot stepping up.
      const run = this.indexOf("run");
      const g = this.gaits.get("run");
      if (run >= 0 && g) {
        this.setMain("run", g.contact0 * this.durationOf(run), 0, 0.045);
        this.brakeLeft = Infinity;
      } else this.setMain("idle", 0, 1, HALFLIFE.dashOut);
    }
    if (this.landed >= 0) {
      this.landed += dt;
      if (this.lift[0]! < 0.012) this.endDash();
    }
  }

  /** Touch-down after a dash: Idle already plays (from the landing), so only the state changes. */
  private endDash(): void {
    this.state = "loco";
    // The braking pose is still: its feet plant where they touch (no settle wait); without it the feet settle first.
    this.landHold = this.brakeLeft > 0 ? 0 : LAND_SETTLE_S;
    if (this.brakeLeft > 0) this.brakeLeft = BRAKE_STEP_S;
    this.gaitShown = -1;
    this.idleT = 0;
    this.layers.breathWeight = 1;
    // Still in the braking step: its held pose ends in updateLoco.
    if (this.brakeLeft < 0) this.setMain("idle", 0, 1, HALFLIFE.dashOut);
  }

  private durationOf(i: number): number {
    return i >= 0 ? this.samplers[i]!.duration : 1;
  }

  private updateLoco(dt: number): void {
    const loco = this.loco;
    const speed = loco.speed;
    if (this.gaitShown < 0 && speed < 0.05) this.gaitSel[0] = this.gaitSel[1] = 0;
    else criticalSpring(this.gaitSel, 0, speed, GAIT_SEL_HL, dt);
    const active = speed > MOVE_ON || (loco.hasPath && speed > 0.01);
    if (this.brakeLeft >= 0) {
      // The braking step's contact pose holds (the planted front foot), then Idle brings the back foot up.
      this.brakeLeft -= dt;
      this.mainRate = 0;
      if (this.brakeLeft < 0 || active) this.toIdle(0.1);
      if (!active) return;
    }
    if (this.gaitShown >= 0) this.gaitSpeed = Math.max(speed, this.gaitSpeed * Math.exp(-dt / 0.4));
    if (!active) {
      this.layers.leanForwardGoal = 0;
      this.layers.leanSideGoal = 0;
      // A side gait's turn bias ends with the walk (it stayed on and turned the next standing turn off its goal).
      loco.yawBias = 0;
      if (this.gaitShown >= 0) {
        // Arriving: the body sways on past the stop and settles (a balance step's weight; the feet re-plant).
        this.acting.stopSway(this.gaitSpeed);
        this.gaitSpeed = 0;
        this.settleIn = SETTLE_AFTER_S;
        this.toIdle(HALFLIFE.moveToIdle);
        return;
      }
      // Idle, with a fidget now and then while nothing else happens.
      this.idleT += dt;
      this.mainTime += dt;
      this.mainRate = 1;
      const dur = this.durationOf(this.main);
      if (this.mainTime >= dur) this.mainTime -= dur;
      const still = Math.abs(wrapPi(loco.yawGoal - loco.yaw)) < 2 * DEG && this.layers.lookWeightGoal === 0;
      if (this.idleT >= this.nextFidget && still && this.has("fidget")) {
        this.state = "fidget";
        this.nextFidget = this.rng.range(4, 9);
        this.idleT = 0;
        this.setMain("fidget", 0, 1, HALFLIFE.fidget);
      }
      return;
    }
    // Motion in the character frame (of the facing asked for, without the side-gait bias).
    const fx = Math.sin(loco.yawGoal);
    const fz = Math.cos(loco.yawGoal);
    const vf = loco.vx * fx + loco.vz * fz;
    const vr = loco.vx * -fz + loco.vz * fx;
    loco.yawBias = 0;
    let a = -1;
    let b = -1;
    let w = 0;
    if (loco.keepFacing || vf < -0.3 * speed) {
      // Off the facing: the stepping clip whose measured ground direction fits best (Mesh2Motion's
      // Strafe_left steps to the character's right: chosen by measurement, not by name).
      let best = vf / Math.max(1e-6, speed);
      let bias = 0;
      for (let k = 0; k < SIDE_GAITS.length; k += 1) {
        const g = this.gaits.get(SIDE_GAITS[k]!);
        if (!g || g.speed < 1e-3) continue;
        const d = (g.forward * vf + g.right * vr) / (g.speed * Math.max(1e-6, speed));
        if (d > best) {
          best = d;
          a = this.indexOf(SIDE_GAITS[k]!);
          // Its steps go off the motion (Mesh2Motion's strafe drifts 16° forward): turn the body to match (≤ 25°).
          bias = clamp(wrapPi(Math.atan2(g.right, g.forward) - Math.atan2(vr, vf)), -25 * DEG, 25 * DEG);
        }
      }
      if (a >= 0) loco.yawBias = bias;
    }
    if (a < 0) {
      // Forward: the two neighbouring gaits round this speed, blended in log speed.
      const f = this.fwd;
      if (f.length === 0) {
        a = this.indexOf("run");
      } else {
        a = this.indexOf(f[0]!);
        for (let k = 0; k + 1 < f.length; k += 1) {
          const s0 = this.gaits.get(f[k]!)!.speed;
          const s1 = this.gaits.get(f[k + 1]!)!.speed;
          const cross = Math.sqrt(s0 * s1);
          const sel = Math.max(1e-3, this.gaitSel[0]!);
          if (sel <= cross / GAIT_BAND) break;
          a = this.indexOf(f[k]!);
          if (sel >= cross * GAIT_BAND) {
            a = this.indexOf(f[k + 1]!);
            continue;
          }
          b = this.indexOf(f[k + 1]!);
          w = smoothstep(Math.log(cross / GAIT_BAND), Math.log(cross * GAIT_BAND), Math.log(sel));
          break;
        }
      }
    }
    if (a < 0) return;
    const ga = this.gaits.get(this.keys[a]!);
    const gb = b >= 0 ? this.gaits.get(this.keys[b]!) : undefined;
    // Stride matched to the ground: cycles per second = speed / stride (blended).
    const stride = Math.max(0.05, (ga ? ga.stride : 1) * (1 - w) + (gb ? gb.stride : 1) * w);
    const shown = b >= 0 && w >= 0.5 ? b : a;
    if (this.gaitShown < 0 || (this.main !== a && this.main !== b)) {
      // Into locomotion, or onto a new pair: an inertialized switch.
      this.request(this.gaitShown < 0 ? HALFLIFE.idleToMove : HALFLIFE.moveSwitch);
      if (this.gaitShown < 0) this.phase = 0;
    }
    if (shown !== this.gaitShown) {
      this.gaitShown = shown;
      this.onClip?.(this.keys[shown]!);
    }
    this.phase = (this.phase + (speed / stride) * dt) % 1;
    const da = this.durationOf(a);
    this.main = a;
    this.mainTime = (((this.phase + (ga ? ga.phase0 : 0)) % 1) + 1) % 1 * da;
    this.mainRate = (speed / stride) * da;
    if (b >= 0 && w > 0) {
      const db = this.durationOf(b);
      this.blend = b;
      this.blendW = w;
      this.blendTime = (((this.phase + (gb ? gb.phase0 : 0)) % 1) + 1) % 1 * db;
      this.blendRate = (speed / stride) * db;
    } else {
      this.blend = -1;
      this.blendW = 0;
    }
    // Lean into turns and starts (moving off into a turn leans in already at low speed).
    this.layers.leanSideGoal = clamp(loco.lateralAccel * 1.6 - loco.yawVel * 1.6 * smoothstep(0.05, 0.6, speed), -10, 10);
    this.layers.leanForwardGoal = clamp(loco.forwardAccel * 1.2, -6, 8) + smoothstep(1.5, 3.5, speed) * 4;
    this.layers.breathWeight = 0.5;
  }

  private wrapTime(i: number, t: number): number {
    const d = this.durationOf(i);
    if (this.loops[i]) return ((t % d) + d) % d;
    return clamp(t, 0, d);
  }

  /**
   * The probe's view of the clips: the active actions are scheduled with their weight and time.
   * Never mixer.update (see the header); every bone is written from the samplers.
   */
  private setActions(): void {
    const acts = this.actions;
    this.weight.fill(0);
    if (this.main >= 0) this.weight[this.main] = this.blend >= 0 ? 1 - this.blendW : 1;
    if (this.blend >= 0) this.weight[this.blend] = this.blendW;
    for (let i = 0; i < acts.length; i += 1) {
      const w = this.weight[i]!;
      if (w <= 0) continue;
      const a = acts[i]!;
      if (!a.isScheduled()) {
        a.enabled = true;
        a.play();
      }
      a.setEffectiveWeight(w);
      a.time = i === this.main ? this.wrapTime(i, this.mainTime) : this.wrapTime(i, this.blendTime);
    }
    for (let i = 0; i < acts.length; i += 1) {
      if (this.weight[i]! > 0) continue;
      const a = acts[i]!;
      if (a.isScheduled()) a.stop();
    }
  }

  /** The base pose at these clip times: main, and the blend clip mixed in by its weight (nlerp, shortest arc). */
  private samplePose(mainT: number, blendT: number, q: Float32Array, p: Float32Array): void {
    this.rig.restPose(q, p);
    if (this.main >= 0) this.samplers[this.main]!.sample(this.wrapTime(this.main, mainT), q, p);
    const w = this.blendW;
    if (this.blend < 0 || w <= 0) return;
    const bq = this.blendQ;
    const bp = this.blendP;
    this.rig.restPose(bq, bp);
    this.samplers[this.blend]!.sample(this.wrapTime(this.blend, blendT), bq, bp);
    const n = this.rig.count;
    for (let i = 0; i < n; i += 1) {
      const o = i * 4;
      const sgn = q[o]! * bq[o]! + q[o + 1]! * bq[o + 1]! + q[o + 2]! * bq[o + 2]! + q[o + 3]! * bq[o + 3]! < 0 ? -w : w;
      const x = q[o]! * (1 - w) + bq[o]! * sgn;
      const y = q[o + 1]! * (1 - w) + bq[o + 1]! * sgn;
      const z = q[o + 2]! * (1 - w) + bq[o + 2]! * sgn;
      const ww = q[o + 3]! * (1 - w) + bq[o + 3]! * sgn;
      const l = Math.sqrt(x * x + y * y + z * z + ww * ww) || 1;
      q[o] = x / l;
      q[o + 1] = y / l;
      q[o + 2] = z / l;
      q[o + 3] = ww / l;
    }
    for (let k = 0; k < n * 3; k += 1) p[k] = p[k]! * (1 - w) + bp[k]! * w;
  }

  private evaluate(dt: number): void {
    const transition = this.transition >= 0 && !this.first;
    this.setActions();
    // A transition: the new pose one step earlier gives its velocity.
    if (transition) this.samplePose(this.mainTime - H_VEL * this.mainRate, this.blendTime - H_VEL * this.blendRate, this.prevQ, this.prevP);
    this.samplePose(this.mainTime, this.blendTime, this.poseQ, this.poseP);
    if (transition) this.inertial.transition(this.poseQ, this.poseP, this.prevQ, this.prevP, H_VEL, dt, this.transition);
    this.inertial.apply(this.poseQ, this.poseP, dt, !transition);
    this.rig.writePose(this.poseQ, this.poseP);
    this.transition = -1;
  }

  /** Largest remaining inertialization offset (deg) and its bone, for checks. */
  get inertialResidualDeg(): number {
    return this.inertial.residual / DEG;
  }

  get inertialResidualBone(): string {
    return this.inertial.residualBone >= 0 ? this.rig.names[this.inertial.residualBone]! : "";
  }

  /** The current base clip key. */
  get clip(): ClipKey {
    return this.keys[this.main] ?? "idle";
  }

  /** The shown gait (dominant clip of a blend), or "idle". */
  get gait(): ClipKey {
    return this.gaitShown >= 0 ? this.keys[this.gaitShown]! : "idle";
  }
}
