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
 * Frame order (appendix C §2.2): state → pose → inertialization → Hit
 * additive → root → world layers (lean, crouch, recoil, breathing, look-at)
 * → foot IK → spring chains. VFX read the hand after this (skills-main).
 *
 * The state machine knows clip keys and bone names only, so a later hero
 * with the same names reuses it (MOTION_PLAN step 5). No allocation per frame.
 */
import * as THREE from "three";
import { FootLock, type FootMode } from "./foot-ik";
import { analyseGait, type GaitFeet, type GaitInfo } from "./gait";
import { Inertializer } from "./inertial";
import { Layers } from "./layers";
import { Locomotion } from "./locomotion";
import { clamp, criticalSpring, DEG, LabRng, smoothstep, wrapPi } from "./math";
import { ClipSampler, Rig } from "./rig";
import { SpringChains, tipFromSkin } from "./springs";

export type ClipKey = "idle" | "fidget" | "walk" | "jog" | "run" | "strafeL" | "strafeR" | "back" | "attack" | "skill1" | "skill2" | "ult" | "dash" | "hit";

/** Transition half-lives (s), MOTION_PLAN step 2.2 and appendix C §2.2. */
export const HALFLIFE = {
  release: 0.04,
  charge: 0.06,
  toIdle: 0.09,
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

type State = "loco" | "fidget" | "charge" | "strike" | "dash";

/**
 * The swing runs faster and the recovery slower than authored (plan step 2.3: ×1.3, ×0.9; appendix C §2.9
 * allows 1.2–1.5): ×1.2 keeps the swing within §5.11's 1.5 × clip peak once the release inertialization adds
 * its own speed. A held follow-through barely moves.
 */
const SWING_RATE = 1.2;
const RECOVER_RATE = 0.9;
const HOLD_RATE = 0.05;
/**
 * Clip seconds before the release the strike runs on from at the last key: 45 ms at the swing rate, so the
 * body reaches the release within §5.11's 50 ms. The typed wind-up fills the clip up to that point
 * (time = progress × (release − lead), plan step 2.3 / §5.6), so the last key mostly continues the clip.
 */
const RELEASE_LEAD = 0.045 * 1.2;
/** The strike hands over to Idle this long (clip s) before its end (clips end on Idle@0, plan step 2.1). */
const STRIKE_EXIT = 0.1;
/** Charge: the body coils (crouch share) as the word fills. */
const CHARGE_CROUCH = 0.5;
/** Dash: the clip runs from here at this rate; the body glides this high over the path, lands with this crouch. */
const DASH_START = 0.1;
const DASH_RATE = 1.0;
const DASH_LIFT_M = 0.1;
const DASH_LAND_CROUCH = 0.55;
/** After touch-down the feet settle this long (s) before standing locks plant them wherever they touch. */
const LAND_SETTLE_S = 0.3;
const MOVE_ON = 0.04;
/** Forward gaits slowest first, and the side gaits (motion off the facing). */
const FWD_GAITS: readonly ClipKey[] = ["walk", "jog", "run"];
const SIDE_GAITS: readonly ClipKey[] = ["strafeL", "strafeR", "back"];
/** Gait blend band round the crossover of two neighbours (share of the crossover speed, log-symmetric). */
const GAIT_BAND = 1.25;
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
  readonly feet: FootLock | null;
  readonly springs: SpringChains;
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
  private holdUntil = 0;
  private dashAge = 0;
  private landed = -1;
  private readonly lift = new Float64Array(2);
  private liftGoal = 0;
  private lookHold = 0;
  /** Seconds after a dash touch-down while the feet still settle (they lock only once the clip slows them). */
  private landHold = 0;
  private first = true;
  private springsReset = true;
  private turnLead = TURN_LEAD;
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly handR: THREE.Object3D | null;
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
      // Stiffer at the base, looser to the tip; a share of the body's motion trails it.
      this.springs.addChain(tail, tip(tail[tail.length - 1]!, 0.18), (i) => {
        const u = i / Math.max(1, tail.length - 1);
        return { hz: 2.4 - 1.0 * u, zeta: 0.55, gravity: 1.2, trail: 0.3, maxDeg: 22 + 10 * u, maxDegS: 360, radius: 0.04 };
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
    this.lookHold = 0;
    this.landHold = 0;
    this.turnLead = TURN_LEAD;
    this.transition = -1;
    this.layers.reset();
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
    if (inPlace && this.state !== "charge") {
      // The head leads the turn (clamped to 20° by the look-at).
      const l = Math.hypot(fx, fz) || 1;
      this.lookAt(this.loco.showX + (fx / l) * 6, 1.1, this.loco.showZ + (fz / l) * 6, 1);
      this.lookHold = Math.max(this.lookHold, 0.45);
    }
    if (this.state === "fidget") this.toIdle(HALFLIFE.fidget);
    return Math.abs(wrapPi(this.loco.yawGoal - before));
  }

  /** One key of a typed word on a strike clip: the wind-up follows the progress (§5.6). */
  charge(key: ClipKey, progress: number, tx: number, tz: number): void {
    const p = clamp(progress, 0, 1);
    this.lookAt(tx, 1.0, tz, 1);
    if (key === "dash") {
      // The dash wind-up: a crouch that deepens with the word; the eyes hold on the target between keys.
      this.layers.crouchGoal = 0.7 * p;
      this.lookHold = Math.max(this.lookHold, 0.6);
      return;
    }
    const st = this.strikes.get(key);
    if (!st) return;
    this.loco.stop();
    if (this.state !== "charge" || this.keys[this.main] !== key) {
      this.state = "charge";
      this.chargeS[0] = 0;
      this.chargeS[1] = 0;
      this.setMain(key, 0, 0, HALFLIFE.charge);
    }
    this.chargeGoal = Math.max(0, st.release - RELEASE_LEAD) * p;
    this.layers.crouchGoal = CHARGE_CROUCH * p;
    // The torso turns away from the striking hand (right hand: clockwise from above).
    this.layers.coilGoal = -st.hand * p;
    this.layers.breathWeight = 0.5;
  }

  /** The word's last key: the strike runs on from just before its release (≤ 50 ms to the release). */
  release(key: ClipKey, holdS: number, recoilDegS: number): void {
    const st = this.strikes.get(key);
    if (!st) return;
    this.loco.stop();
    // Run on from the shown wind-up when it is already that far (no jump), else from release − lead (inertialized).
    const from = this.state === "charge" && this.keys[this.main] === key ? Math.max(this.mainTime, st.release - RELEASE_LEAD) : st.release - RELEASE_LEAD;
    const same = this.keys[this.main] === key && this.blend < 0;
    this.state = "strike";
    this.strikeAge = 0;
    this.holdUntil = holdS;
    this.setMain(key, from, SWING_RATE, HALFLIFE.release);
    // A release is a state change even on the same clip (charge → strike, a repeated attack).
    if (same) this.onClip?.(key);
    this.layers.kick(recoilDegS, -1, 0);
    this.layers.crouchGoal = 0;
    this.layers.coilGoal = 0;
    this.layers.breathWeight = 0.3;
    this.lookHold = 0.35;
  }

  /** The dash: a glide a hand above the ground along kiem.ts's path (the shown root eases in), then a landing. */
  dash(): void {
    this.state = "dash";
    this.dashAge = 0;
    this.landed = -1;
    // The body faces the path; a look held on the target would swing round as the glide passes it (and never let go).
    this.lookHold = 0;
    this.layers.lookWeightGoal = 0;
    this.layers.crouchGoal = 0;
    this.layers.leanForwardGoal = 14;
    this.liftGoal = DASH_LIFT_M;
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
    this.layers.kick(520, (dx * fx + dz * fz) / l, (dx * -fz + dz * fx) / l);
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
    if (this.state === "fidget" || this.state === "charge") this.toIdle(HALFLIFE.fidget);
  }

  stopMove(): void {
    this.loco.stop();
  }

  /** The skill code moves the caster (kiem.ts's dash). */
  external(x: number, z: number): void {
    this.loco.external(x, z);
  }

  private toIdle(halflife: number): void {
    this.state = "loco";
    this.gaitShown = -1;
    this.idleT = 0;
    this.setMain("idle", 0, 1, halflife);
    this.layers.breathWeight = 1;
    this.layers.crouchGoal = 0;
    this.layers.coilGoal = 0;
  }

  // ── Per frame ──────────────────────────────────────────────────────────

  update(dt: number): void {
    this.loco.update(dt);
    this.layers.lastDt = dt;
    this.updateState(dt);
    this.evaluate(dt);
    // Root: the glide lifts it; the model's front is −z (lam.glb), so the yaw turns by π.
    criticalSpring(this.lift, 0, this.liftGoal, this.liftGoal > 0 ? 0.025 : 0.045, dt);
    this.root.position.set(this.loco.showX, Math.max(0, this.lift[0]!), this.loco.showZ);
    this.root.rotation.y = this.loco.yaw + Math.PI;
    const fx = this.loco.fx;
    const fz = this.loco.fz;
    this.forward.set(fx, 0, fz);
    this.layers.step(dt);
    this.layers.applyHit();
    this.root.updateMatrixWorld(true);
    this.feet?.capture();
    this.layers.turnHint = this.loco.yawGoal - this.loco.yaw;
    this.layers.applyWorld(fx, fz);
    if (this.feet) {
      // Moving off slowly, a re-plant step under way lands first (cancelling it would drop the foot).
      const moving = this.gaitShown >= 0 || this.loco.speed > 0.05;
      const mode: FootMode = this.state === "dash" && this.lift[0]! > 0.02 ? "off" : moving && !(this.feet.busy && this.loco.speed < 0.3) ? "move" : "stand";
      const ahead = mode === "stand" ? clamp(wrapPi(this.loco.yawGoal - this.loco.yaw), -55 * DEG, 55 * DEG) : 0;
      if (this.landHold > 0) this.landHold -= dt;
      const settle = this.state === "dash" || this.landHold > 0;
      this.feet.update(dt, this.first, this.loco.showX, this.loco.showZ, this.loco.yaw, ahead, mode, this.loco.speed, settle);
      // A standing turn stays within 70° of the foot that lags most; the feet step to catch up (plan step 2.8: re-plant at
      // 45–60°). Moving off, the limit opens over ~0.3 s instead of at once (no whip of the rest of the turn).
      this.loco.feetYaw = this.feet.laggingYaw(this.loco.yawGoal);
      this.turnLead = mode === "stand" ? TURN_LEAD : Math.min(Math.PI, this.turnLead + 3 * Math.PI * dt);
      this.loco.yawLead = this.turnLead >= Math.PI ? 0 : this.turnLead;
    }
    if (this.springsReset) {
      this.springs.invalidate();
      this.springsReset = false;
    }
    this.springs.update(dt);
    this.first = false;
  }

  private updateState(dt: number): void {
    const loco = this.loco;
    // A look lasts while held or while a word is charged; a charge left without a release (walking off) lets go too.
    if (this.lookHold > 0) this.lookHold -= dt;
    if (this.lookHold <= 0 && this.state !== "charge") this.layers.lookWeightGoal = 0;
    switch (this.state) {
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
        let rate = RECOVER_RATE;
        if (this.mainTime < st.swingEnd) rate = SWING_RATE;
        else if (this.strikeAge < this.holdUntil) rate = HOLD_RATE;
        this.mainRate = rate;
        this.mainTime += rate * dt;
        if (this.mainTime >= st.duration - STRIKE_EXIT || loco.hasPath) this.toIdle(HALFLIFE.toIdle);
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
    this.mainRate = DASH_RATE;
    this.mainTime = (this.mainTime + DASH_RATE * dt) % dur;
    if (this.landed < 0 && this.dashAge > 0.12 && !loco.dashing) {
      this.landed = 0;
      this.liftGoal = 0;
      this.layers.leanForwardGoal = 0;
      this.layers.crouchGoal = DASH_LAND_CROUCH;
      // The legs reach for the ground on the way down (the feet follow the clip until touch-down): Idle starts now,
      // not at touch-down, where its transition from the tucked dash pose swept the planted feet ~0.3 s.
      this.setMain("idle", 0, 1, HALFLIFE.dashOut);
    }
    if (this.landed >= 0) {
      this.landed += dt;
      if (this.landed > 0.09) this.layers.crouchGoal = 0;
      if (this.lift[0]! < 0.012) this.endDash();
    }
  }

  /** Touch-down after a dash: Idle already plays (from the landing), so only the state changes. */
  private endDash(): void {
    this.state = "loco";
    this.landHold = LAND_SETTLE_S;
    this.gaitShown = -1;
    this.idleT = 0;
    this.layers.breathWeight = 1;
    this.layers.crouchGoal = 0;
    this.layers.coilGoal = 0;
  }

  private durationOf(i: number): number {
    return i >= 0 ? this.samplers[i]!.duration : 1;
  }

  private updateLoco(dt: number): void {
    const loco = this.loco;
    const speed = loco.speed;
    const active = speed > MOVE_ON || (loco.hasPath && speed > 0.01);
    if (!active) {
      this.layers.leanForwardGoal = 0;
      this.layers.leanSideGoal = 0;
      if (this.gaitShown >= 0) {
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
          if (speed <= cross / GAIT_BAND) break;
          a = this.indexOf(f[k]!);
          if (speed >= cross * GAIT_BAND) {
            a = this.indexOf(f[k + 1]!);
            continue;
          }
          b = this.indexOf(f[k + 1]!);
          w = smoothstep(Math.log(cross / GAIT_BAND), Math.log(cross * GAIT_BAND), Math.log(speed));
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
    // Lean into turns and starts.
    this.layers.leanSideGoal = clamp(loco.lateralAccel * 1.6, -10, 10);
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
