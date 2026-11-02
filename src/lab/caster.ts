/**
 * Dev-only stand-in caster for the skills lab: Wordwoven's Lam (Tripo, 31
 * bones, 13 clips) until the Kiếm tu model passes its gate (ART_AUDIO_VFX_PLAN
 * §7 #1). The local Animator (src/lab/anim/, MOTION_PLAN step 2) drives it:
 * clips resampled to 60 fps, inertialized transitions, the wind-up following
 * the typing (with a torso coil) and the strike run on to its release, walk
 * ↔ run with the stride matched to the ground (in-place clips stabilized so
 * the planted foot moves at one speed), strafe and back steps from
 * Mesh2Motion (CC0, retargeted at load, loops closed), turn in place with the
 * feet stepping, the dash as a glide, Hit as an additive, breathing, recoil,
 * look-at, foot locking (heel / ball pivot) and spring chains.
 *
 * Lam's front is −z (lam.glb), so the root's yaw is the facing + π (the P0 of
 * the step 1 report: the lab showed Lam's back to its own facing).
 *
 * `x, z, fx, fz` are what the viewer sees (the shown root and facing); the
 * skill code reads them through the host. VFX leave from `hand()`, the palm
 * socket FX_HAND_R, read after `update()`.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KiemSlot } from "../view/skills/kiem";
import { Animator, type AnimatorClip, type ClipKey } from "./anim/animator";
import { resampleClip } from "./anim/resample";
import { retargetClip } from "./anim/retarget";
import { ClipSampler, Rig } from "./anim/rig";
import { LAB_ASSETS } from "./look";

export type CasterClip = ClipKey;

/** Lam's own clips (lam.glb). */
const LAM_CLIPS: Partial<Record<CasterClip, string>> = {
  idle: "Hero_Idle",
  fidget: "Hero_Idle_Fidget",
  run: "Hero_Run",
  attack: "Hero_Attack",
  skill1: "Hero_Skill1",
  skill2: "Hero_Skill2",
  ult: "Hero_Ult",
  dash: "Hero_Dash",
  hit: "Hero_Hit",
};

/** Clips Lam lacks, from Mesh2Motion's human set (CC0; art-src/lab/anim, THIRD_PARTY.md), retargeted at load. */
const M2M_CLIPS: Partial<Record<CasterClip, [file: string, clip: string]>> = {
  walk: ["human-base-animations.glb", "Walk"],
  strafeL: ["human-addon-animations.glb", "Strafe_left"],
  strafeR: ["human-addon-animations.glb", "Strafe_right"],
  back: ["human-addon-animations.glb", "Walk_Backwards"],
};

/** Looping clips (the rest play once). */
const LOOPS: ReadonlySet<CasterClip> = new Set<CasterClip>(["idle", "run", "walk", "strafeL", "strafeR", "back", "dash"]);
/** Clip time of the strike (s): hand speed peak by FK on lam.glb (MOTION_PLAN appendix A, §5.6 `release`). */
export const CLIP_RELEASE_S: Partial<Record<CasterClip, number>> = { attack: 0.267, skill1: 0.267, skill2: 0.708, ult: 1.083 };

/** The clip each skill slot plays. */
export const SLOT_CLIP: Record<KiemSlot, CasterClip> = { auto: "attack", k1: "attack", k2: "skill1", guard: "skill2", dash: "dash", k4: "skill2", k5: "ult" };
/**
 * Seconds after the release that a skill's own strikes still land (kiem.ts
 * hit ticks, canon §12.1: K1 blades at +0, +0.5, +1.0 s; K5 waves to +2.0 s):
 * the follow-through pose holds until then (plan step 2.3).
 */
const SLOT_HOLD: Partial<Record<KiemSlot, number>> = { k1: 1.05, k5: 2.05 };
/** Recoil kick per slot (deg/s of torso tilt; ~5° peak at 300). */
const SLOT_RECOIL: Record<KiemSlot, number> = { auto: 220, k1: 260, k2: 320, guard: 200, dash: 0, k4: 260, k5: 380 };

/** State changes for the motion probe: a clip starts, a walk starts, changes speed or stops, a turn. */
export type CasterEvent = "clip" | "move" | "face";

export class LabCaster {
  readonly root = new THREE.Group();
  readonly heightM = 1.75;
  /** The skinned model (the mixer root), once loaded. */
  model: THREE.Object3D | null = null;
  /** The loaded clips as parallel lists (plain loops for the probe, no iterator per frame). */
  readonly clipKeys: CasterClip[] = [];
  readonly clipActions: THREE.AnimationAction[] = [];
  /** The clips as authored (24 fps) for the probe's reference peaks; null for retargeted ones. */
  readonly clipRefs: (THREE.AnimationClip | null)[] = [];
  /** Listener for state changes (the motion probe). */
  onState: ((kind: CasterEvent, detail: string) => void) | null = null;
  /** Which missing clips came from Mesh2Motion (the rest fall back to Run). */
  readonly retargeted: CasterClip[] = [];
  anim: Animator | null = null;
  private lastSegSpeed = 0;
  private wasMoving = false;

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(LAB_ASSETS + "models/lam.glb");
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = this.heightM / h;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    this.root.add(model);
    this.model = model;
    this.root.updateMatrixWorld(true);

    const clips: AnimatorClip[] = [];
    for (const key of Object.keys(LAM_CLIPS) as CasterClip[]) {
      const src = gltf.animations.find((a) => a.name === LAM_CLIPS[key]);
      if (!src) continue;
      const loop = LOOPS.has(key);
      clips.push({ key, clip: resampleClip(src, loop), loop, release: CLIP_RELEASE_S[key] });
      this.clipRefs.push(src);
    }
    // Missing clips: Mesh2Motion retargeted onto Lam (bones outside its rig keep Idle's frame 0).
    const rig = new Rig(model);
    const fillQ = new Float32Array(rig.count * 4);
    const fillP = new Float32Array(rig.count * 3);
    rig.restPose(fillQ, fillP);
    const idle = gltf.animations.find((a) => a.name === LAM_CLIPS.idle);
    if (idle) new ClipSampler(idle, rig).sample(0, fillQ, fillP);
    const files = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null>>();
    for (const key of Object.keys(M2M_CLIPS) as CasterClip[]) {
      const [file, name] = M2M_CLIPS[key]!;
      if (!files.has(file)) files.set(file, loader.loadAsync(LAB_ASSETS + "anim/" + file).catch(() => null));
      const src = await files.get(file)!;
      const clip = src?.animations.find((a) => a.name === name);
      if (!src || !clip) continue;
      clips.push({ key, clip: retargetClip(new Rig(src.scene), clip, rig, { fill: fillQ, loop: true, name: "M2M_" + name }), loop: true });
      this.clipRefs.push(null);
      this.retargeted.push(key);
    }
    rig.writePose(rig.restQ, rig.restP);
    const anim = new Animator(model, this.root, clips);
    this.anim = anim;
    for (let i = 0; i < anim.keys.length; i += 1) {
      this.clipKeys.push(anim.keys[i]!);
      this.clipActions.push(anim.actions[i]!);
    }
    anim.onClip = (key) => this.onState?.("clip", key);
    // Console access for tuning (the lab is dev-only and never built).
    (window as unknown as Record<string, unknown>).__labCaster = this;
  }

  /** Starts Idle and places the root: call after load (and after a probe has read the bind pose). */
  start(): void {
    this.anim?.place(0, 3, 0, -1);
    this.onState?.("clip", "idle");
  }

  /** Whether `clip` loops. */
  static loops(clip: CasterClip): boolean {
    return LOOPS.has(clip);
  }

  // Shown root and facing.
  get x(): number {
    return this.anim ? this.anim.loco.showX : 0;
  }
  get z(): number {
    return this.anim ? this.anim.loco.showZ : 3;
  }
  get fx(): number {
    return this.anim ? this.anim.loco.fx : 0;
  }
  get fz(): number {
    return this.anim ? this.anim.loco.fz : -1;
  }

  /** The skill code asks for a clip (KiemHost.play): a release already made this frame is kept; a dash starts the dash. */
  play(clip: CasterClip): void {
    const anim = this.anim;
    if (!anim) return;
    if (clip === "dash") {
      anim.dash();
      return;
    }
    if (clip !== "attack" && clip !== "skill1" && clip !== "skill2" && clip !== "ult") return;
    // A strike the lab did not release first (a skill cast from code): release now.
    if (anim.state !== "strike" || anim.clip !== clip) anim.release(clip, 0, 240);
  }

  /** A key of a typed word on `slot` (progress 0…1) aimed at (tx, tz). */
  charge(slot: KiemSlot, progress: number, tx: number, tz: number): void {
    this.anim?.charge(SLOT_CLIP[slot], progress, tx, tz);
  }

  /** The last key: the strike runs on from its release (the VFX read the hand after `update`). */
  release(slot: KiemSlot): void {
    const clip = SLOT_CLIP[slot];
    if (clip === "dash") return; // the dash starts on KiemHost.play("dash")
    this.anim?.release(clip, SLOT_HOLD[slot] ?? 0, SLOT_RECOIL[slot]);
  }

  /** An enemy blow landed from (fromX, fromZ). */
  hit(fromX: number, fromZ: number): void {
    this.anim?.hit(fromX, fromZ);
  }

  /** KiemHost.moveCaster: the dash path (the shown root eases into it). */
  moveTo(x: number, z: number): void {
    this.anim?.external(x, z);
  }

  /** Puts the caster at (x, z) facing (fx, fz) at once (reset). */
  place(x: number, z: number, fx: number, fz: number): void {
    this.anim?.place(x, z, fx, fz);
    this.lastSegSpeed = 0;
    this.wasMoving = false;
  }

  /** Turns towards (fx, fz) through the yaw spring (turn in place past 60°). */
  face(fx: number, fz: number): void {
    const anim = this.anim;
    if (!anim) return;
    const turned = anim.face(fx, fz);
    if (turned > 0.017) this.onState?.("face", String(Math.round((turned * 180) / Math.PI)));
  }

  faceTo(x: number, z: number): void {
    this.face(x - this.x, z - this.z);
  }

  /** Walks through way-points [x, z, speed (m/s), …]; `keepFacing` strafes. */
  walkPath(xzs: readonly number[], keepFacing = false): void {
    if (!this.anim || xzs.length < 3) return;
    this.anim.walkPath(xzs, keepFacing);
    this.lastSegSpeed = xzs[2]!;
    this.wasMoving = true;
    this.onState?.("move", keepFacing ? "strafe" : "start");
  }

  walkTo(x: number, z: number, speedMps: number, keepFacing = false): void {
    this.walkPath([x, z, speedMps], keepFacing);
  }

  get moving(): boolean {
    return this.anim ? this.anim.loco.moving : false;
  }

  /** Stops a walk (the speed spring brings it to rest). */
  stopMove(): void {
    this.anim?.stopMove();
  }

  /** The palm socket (FX_HAND_R), world. */
  hand(out: THREE.Vector3): void {
    if (this.anim && this.anim.hand(out)) return;
    out.set(this.x + this.fx * 0.4 - this.fz * 0.25, 1.15, this.z + this.fz * 0.4 + this.fx * 0.25);
  }

  /** The Animator's state and clip analysis (JSON-safe, for __lab.anim()). */
  debug(): Record<string, unknown> {
    const anim = this.anim;
    if (!anim) return {};
    const r3 = (v: number): number => Math.round(v * 1000) / 1000;
    return {
      state: anim.state,
      clip: anim.clip,
      x: r3(this.x),
      z: r3(this.z),
      yawDeg: r3((anim.loco.yaw * 180) / Math.PI),
      speed: r3(anim.loco.speed),
      inertialDeg: r3(anim.inertialResidualDeg),
      inertialBone: anim.inertialResidualBone,
      retargeted: this.retargeted,
      strikes: Object.fromEntries([...anim.strikes].map(([k, s]) => [k, { release: r3(s.release), windup: r3(s.windup), swingEnd: r3(s.swingEnd), duration: r3(s.duration) }])),
      gaits: Object.fromEntries([...anim.gaits].map(([k, g]) => [k, { forward: r3(g.forward), right: r3(g.right), speed: r3(g.speed), stride: r3(g.stride), phase0: r3(g.phase0), shiftM: r3(g.shiftM) }])),
    };
  }

  update(dt: number): void {
    const anim = this.anim;
    if (!anim) return;
    anim.update(dt);
    // Probe markers for walks: a segment speed change, arrival.
    const loco = anim.loco;
    if (loco.hasPath && loco.segmentSpeed !== this.lastSegSpeed) {
      this.lastSegSpeed = loco.segmentSpeed;
      this.onState?.("move", "speed " + loco.segmentSpeed.toFixed(1));
    }
    if (this.wasMoving && !loco.moving) {
      this.wasMoving = false;
      this.onState?.("move", "stop");
    }
  }
}
