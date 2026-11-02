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
 * Round 2 (acting): each skill acts in three phases on its clip section
 * (anim/acting.ts); K4 plays its own copy of Attack (`thrust`) with its own
 * pose and rhythm, apart from the guard's Skill2; a blow shows as a
 * red-white rim flash (rises in 2 frames, fades over 0.2 s) instead of a
 * red light over the whole body.
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
import { Animator, type AnimatorClip, type ClipKey, type MoveId } from "./anim/animator";
import { ArmCheck } from "./anim/arm-check";
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

/** Clips copied from another of Lam's, so a skill has its own clip and rhythm (K4 apart from the guard's Skill2). */
const COPIES: Partial<Record<CasterClip, CasterClip>> = { thrust: "attack" };

/** Looping clips (the rest play once). */
const LOOPS: ReadonlySet<CasterClip> = new Set<CasterClip>(["idle", "run", "walk", "strafeL", "strafeR", "back", "dash"]);
/** Clip time of the strike (s): hand speed peak by FK on lam.glb (MOTION_PLAN appendix A, §5.6 `release`). */
export const CLIP_RELEASE_S: Partial<Record<CasterClip, number>> = { attack: 0.267, thrust: 0.267, skill1: 0.267, skill2: 0.708, ult: 1.083 };

/** The clip each skill slot plays (the acting of each is in anim/acting.ts; how long it holds follows its hit ticks there). */
export const SLOT_CLIP: Record<KiemSlot, CasterClip> = { auto: "attack", k1: "attack", k2: "skill1", guard: "skill2", dash: "dash", k4: "thrust", k5: "ult" };
/** A strike clip asked for by the skill code without a typed word (KiemHost.play): the move it acts. */
const CLIP_MOVE: Partial<Record<CasterClip, MoveId>> = { attack: "auto", thrust: "k4", skill1: "k2", skill2: "guard", ult: "k5" };

/** Hit rim flash: rise (s, 2 frames), fade (s), peak (linear emissive at the silhouette edge). */
const RIM_RISE_S = 2 / 60;
const RIM_FADE_S = 0.2;
const RIM_PEAK = 1.5;
const RIM_HOT = new THREE.Color(1, 0.78, 0.74);
const RIM_RED = new THREE.Color(1, 0.13, 0.08);

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
  /** Arms-out check (both upper arms past 70° for more than 3 frames outside an intended pose), read by __lab.metrics(). */
  private armCheck: ArmCheck | null = null;
  /** Rim flash uniforms (shared by Lam's materials) and its age (−1 off). */
  private readonly rimK = { value: 0 };
  private readonly rimCol = { value: new THREE.Color() };
  private rimT = -1;
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
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) this.addRim(m);
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
    for (const key of Object.keys(COPIES) as CasterClip[]) {
      const src = gltf.animations.find((a) => a.name === LAM_CLIPS[COPIES[key]!]);
      if (!src) continue;
      const copy = src.clone();
      copy.name = src.name + "_" + key;
      clips.push({ key, clip: resampleClip(copy, false), loop: false, release: CLIP_RELEASE_S[key] });
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
    this.armCheck = new ArmCheck(model);
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

  /**
   * The skill code asks for a clip (KiemHost.play): a release the lab made this frame is that strike (kept, whatever
   * clip the skill names: K4 asks for Skill2 but acts on its own `thrust`); a dash starts the dash; a strike cast
   * from code without a typed word releases now.
   */
  play(clip: CasterClip): void {
    const anim = this.anim;
    if (!anim) return;
    if (clip === "dash") {
      anim.dash();
      return;
    }
    if (clip !== "attack" && clip !== "skill1" && clip !== "skill2" && clip !== "ult") return;
    if (anim.strikeAgeS < 0.1) return;
    const move = CLIP_MOVE[clip] ?? "auto";
    anim.release(move, clip, this.x + this.fx * 6, this.z + this.fz * 6, false);
  }

  /** A key of a typed word on `slot` (progress 0…1, `keysLeft` still to type) aimed at (tx, tz). */
  charge(slot: KiemSlot, progress: number, tx: number, tz: number, keysLeft = 1): void {
    const anim = this.anim;
    if (!anim) return;
    if (slot === "dash") anim.charge("dash", "dash", progress, keysLeft, tx, tz);
    else anim.charge(slot, SLOT_CLIP[slot], progress, keysLeft, tx, tz);
  }

  /** The last key: the strike runs on from its release, aimed at (tx, tz) (the VFX read the hand after `update`). */
  release(slot: KiemSlot, tx?: number, tz?: number): void {
    if (slot === "dash") return; // the dash starts on KiemHost.play("dash")
    const has = tx !== undefined && tz !== undefined;
    this.anim?.release(slot, SLOT_CLIP[slot], has ? tx : this.x + this.fx * 6, has ? tz : this.z + this.fz * 6, has);
  }

  /** An enemy blow landed from (fromX, fromZ): the stagger, the step back and the rim flash. */
  hit(fromX: number, fromZ: number): void {
    this.anim?.hit(fromX, fromZ);
    this.rimT = 0;
  }

  /** KiemHost.moveCaster: the dash path (the shown root eases into it). */
  moveTo(x: number, z: number): void {
    this.anim?.external(x, z);
  }

  /** Puts the caster at (x, z) facing (fx, fz) at once (reset). */
  place(x: number, z: number, fx: number, fz: number): void {
    this.anim?.place(x, z, fx, fz);
    this.rimT = -1;
    this.rimK.value = 0;
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

  /**
   * A rim term on Lam's own materials (dev-only lab): emissive (1 − N·V)⁴ × uRimK × uRimCol, added where the
   * standard shader sums its emission, so the flash rims the silhouette instead of tinting the whole body.
   */
  private addRim(material: THREE.Material): void {
    const m = material as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial) return;
    const rimK = this.rimK;
    const rimCol = this.rimCol;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uRimK = rimK;
      shader.uniforms.uRimCol = rimCol;
      shader.fragmentShader =
        "uniform float uRimK;\nuniform vec3 uRimCol;\n" +
        shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n\tfloat labRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n\tlabRim *= labRim;\n\ttotalEmissiveRadiance += uRimCol * ( uRimK * labRim * labRim );",
        );
    };
    m.customProgramCacheKey = () => "lab-hit-rim";
    m.needsUpdate = true;
  }

  /** The rim flash: up in 2 frames (hot, near white), then down over 0.2 s as it cools to red. */
  private updateRim(dt: number): void {
    if (this.rimT < 0) return;
    this.rimT += dt;
    const t = this.rimT;
    let e: number;
    if (t < RIM_RISE_S) {
      const u = t / RIM_RISE_S;
      e = u * u * (3 - 2 * u);
    } else {
      const u = Math.min(1, (t - RIM_RISE_S) / RIM_FADE_S);
      e = (1 - u) * (1 - u);
      if (u >= 1) this.rimT = -1;
    }
    const cool = Math.min(1, Math.max(0, (t - RIM_RISE_S) / 0.12));
    this.rimCol.value.copy(RIM_HOT).lerp(RIM_RED, cool * cool * (3 - 2 * cool));
    this.rimK.value = this.rimT < 0 ? 0 : RIM_PEAK * e;
  }

  /** Probe frame `f` was drawn: the arms-out check reads the pose (fresh world matrices). */
  check(f: number): void {
    this.armCheck?.sample(f, this.anim ? this.anim.intendedPose : false);
  }

  resetChecks(): void {
    this.armCheck?.reset();
  }

  armReport(): Record<string, unknown> {
    return this.armCheck ? this.armCheck.report() : {};
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
    this.updateRim(dt);
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
