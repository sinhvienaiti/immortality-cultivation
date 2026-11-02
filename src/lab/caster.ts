/**
 * Dev-only stand-in caster for the skills lab: Wordwoven's Lam (Tripo, 31
 * bones, 13 clips) until the Kiếm tu model passes its gate (ART_AUDIO_VFX_PLAN
 * §7 #1), or with ?hero=human motion round 4's human-proportioned proxy (the
 * Mesh2Motion human in a flat plain material, its own clips as authored, the
 * fan sweep on authored key poses; hero-select.ts holds each rig profile). The local Animator (src/lab/anim/, MOTION_PLAN step 2) drives it:
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
 * Round 3 (anim/gestures.ts): each slot plays a casting gesture from a data
 * table (SLOT_GESTURES; the clip section under it is SLOT_CLIP here), so the
 * redesigned catalog remaps slots without code; key 7's field-wide prototype
 * (Vạn Kiếm Triều Tông) acts the two-finger sky edict on the Ult clip. An
 * automatic attack can be primed before it fires (`prime`), so the basic
 * attack winds up like a typed skill. The dash leaves after-images in Lam's
 * blue (anim/afterimage.ts); a blow rings red at the chest (anim/hit-ring.ts).
 *
 * Lam's front is −z (lam.glb), so the root's yaw is the facing + π (the P0 of
 * the step 1 report: the lab showed Lam's back to its own facing); a +z model
 * (the human) is wrapped in a half turn at load.
 *
 * `x, z, fx, fz` are what the viewer sees (the shown root and facing); the
 * skill code reads them through the host. VFX leave from `hand()`, the palm
 * socket FX_HAND_R, read after `update()`.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AfterImages } from "./anim/afterimage";
import { Animator, type AnimatorClip, type ClipKey, type MoveId } from "./anim/animator";
import { ArmCheck } from "./anim/arm-check";
import { BodyCheck } from "./anim/body-check";
import { HitRing } from "./anim/hit-ring";
import { resampleClip } from "./anim/resample";
import { retargetClip } from "./anim/retarget";
import { KEY_POSE_SKILLS } from "./anim/key-pose";
import { ClipSampler, Rig } from "./anim/rig";
import { HERO } from "./hero-select";
import { LAB_ASSETS } from "./look";
import { PoseProbe } from "./pose-probe";

export type CasterClip = ClipKey;

/** Looping clips (the rest play once). */
const LOOPS: ReadonlySet<CasterClip> = new Set<CasterClip>(["idle", "run", "walk", "jog", "strafeL", "strafeR", "back", "dash"]);
/**
 * Clip time of the strike (s, §5.6 `release`): the hero profile's values (Lam: hand speed peak by FK on lam.glb,
 * MOTION_PLAN appendix A); clips without one get theirs measured at load. Filled in place by `load()` (the skills lab
 * reads it for the probe after the caster loads).
 */
export const CLIP_RELEASE_S: Partial<Record<CasterClip, number>> = { ...HERO.release };
/** Strike clips (they need a release time). */
const STRIKES: readonly CasterClip[] = ["attack", "thrust", "skill1", "skill2", "ult"];

/**
 * The clip section each skill slot plays under its gesture (the gesture of each is data in anim/gestures.ts
 * SLOT_GESTURES; how long it holds follows its hit ticks there). Key 7 is the field-wide prototype. A slot with
 * authored key poses on this hero (HeroProfile.keyPoses, anim/key-pose.ts) plays those over Idle instead.
 */
export const SLOT_CLIP: Record<string, CasterClip> = { auto: "attack", k1: "attack", k2: "skill1", guard: "skill2", dash: "dash", k4: "thrust", k5: "ult", k7: "ult" };
/** The clip a slot plays (an unknown slot: Attack). */
function slotClip(slot: string): CasterClip {
  return SLOT_CLIP[slot] ?? "attack";
}
/** A strike clip asked for by the skill code without a typed word (KiemHost.play): the move it acts. */
const CLIP_MOVE: Partial<Record<CasterClip, MoveId>> = { attack: "auto", thrust: "k4", skill1: "k2", skill2: "guard", ult: "k5" };

/**
 * A strike clip's release (s): the time the faster hand peaks in speed (root frame, 60 Hz), away from the clip's
 * first and last tenth (Mesh2Motion clips start and end on their idle).
 */
function measureRelease(clip: THREE.AnimationClip, rig: Rig, root: THREE.Object3D): number {
  const sampler = new ClipSampler(clip, rig);
  const q = new Float32Array(rig.count * 4);
  const p = new Float32Array(rig.count * 3);
  const hands = [rig.bone("hand_r"), rig.bone("hand_l")];
  const prev = [new THREE.Vector3(), new THREE.Vector3()];
  const v = new THREE.Vector3();
  const n = Math.max(2, Math.round(clip.duration * 60));
  let best = 0;
  let bestT = clip.duration * 0.4;
  for (let k = 0; k <= n; k += 1) {
    const t = (k / n) * clip.duration;
    rig.restPose(q, p);
    sampler.sample(t, q, p);
    rig.writePose(q, p);
    root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i += 1) {
      const hand = hands[i];
      if (!hand) continue;
      root.worldToLocal(hand.getWorldPosition(v));
      const speed = k > 0 ? v.distanceTo(prev[i]!) * 60 : 0;
      prev[i]!.copy(v);
      if (k > n * 0.1 && k < n * 0.9 && speed > best) {
        best = speed;
        bestT = t;
      }
    }
  }
  rig.writePose(rig.restQ, rig.restP);
  root.updateMatrixWorld(true);
  return Math.round(bestT * 1000) / 1000;
}

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
  /** Shown height (m): the hero profile's. */
  readonly heightM = HERO.heightM;
  /** Screen-space pose metrics and authoring hooks (__labPose, motion round 4). */
  poseProbe: PoseProbe | null = null;
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
  /** Chest and head heading speed and turn lead (round 3), read by __lab.metrics() under `arms.body`. */
  private bodyCheck: BodyCheck | null = null;
  private lastDt = 1 / 60;
  /** Rim flash uniforms (shared by Lam's materials) and its age (−1 off). */
  private readonly rimK = { value: 0 };
  private readonly rimCol = { value: new THREE.Color() };
  private rimT = -1;
  private lastSegSpeed = 0;
  private wasMoving = false;
  private after: AfterImages | null = null;
  private ring: HitRing | null = null;
  /** The shown root last frame (the after-images spawn while the glide is fast). */
  private prevX = 0;
  private prevZ = 0;
  /** A primed automatic attack: its slot, target, age and lead (s); null none. */
  private primed: { slot: string; tx: number; tz: number; t: number; lead: number } | null = null;

  async load(): Promise<void> {
    const hero = HERO;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(LAB_ASSETS + hero.file);
    // A +z model is wrapped in a half turn, so the Animator and its layers see the −z front they assume (Lam's).
    let model: THREE.Object3D = gltf.scene;
    if (hero.front === "+z") {
      const wrap = new THREE.Group();
      wrap.name = "heroFront";
      wrap.add(gltf.scene);
      gltf.scene.rotation.y = Math.PI;
      model = wrap;
    }
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = this.heightM / h;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    const plain = hero.plain !== null ? new THREE.MeshStandardMaterial({ color: hero.plain, roughness: 0.82, metalness: 0, name: "heroPlain" }) : null;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        // The body-only test: one flat plain material (no texture, no pattern to read the pose from).
        if (plain !== null) mesh.material = plain;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) this.addRim(m);
      }
    });
    for (const sk of hero.sockets) {
      const bone = model.getObjectByName(sk.bone);
      if (!bone || model.getObjectByName(sk.name)) continue;
      const socket = new THREE.Object3D();
      socket.name = sk.name;
      socket.position.set(sk.at[0], sk.at[1], sk.at[2]);
      bone.add(socket);
    }
    this.root.add(model);
    this.model = model;
    this.root.updateMatrixWorld(true);

    const named = (name: string | undefined): THREE.AnimationClip | undefined => (name === undefined ? undefined : gltf.animations.find((a) => a.name === name));
    const clips: AnimatorClip[] = [];
    for (const key of Object.keys(hero.clips) as CasterClip[]) {
      const src = named(hero.clips[key]);
      if (!src) continue;
      const loop = LOOPS.has(key);
      clips.push({ key, clip: resampleClip(src, loop), loop });
      this.clipRefs.push(src);
    }
    for (const key of Object.keys(hero.copies) as CasterClip[]) {
      const src = named(hero.clips[hero.copies[key]!]);
      if (!src) continue;
      const copy = src.clone();
      copy.name = src.name + "_" + key;
      clips.push({ key, clip: resampleClip(copy, false), loop: false });
      this.clipRefs.push(src);
    }
    // Clips from the Mesh2Motion files: retargeted onto Lam (bones outside its rig keep Idle's frame 0), or played as
    // authored on the human, whose rig they were made for.
    const rig = new Rig(model);
    const fillQ = new Float32Array(rig.count * 4);
    const fillP = new Float32Array(rig.count * 3);
    rig.restPose(fillQ, fillP);
    const idle = named(hero.clips.idle);
    if (idle) new ClipSampler(idle, rig).sample(0, fillQ, fillP);
    const files = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null>>();
    for (const key of Object.keys(hero.extra) as CasterClip[]) {
      const [file, name] = hero.extra[key]!;
      if (!files.has(file)) files.set(file, loader.loadAsync(LAB_ASSETS + "anim/" + file).catch(() => null));
      const src = await files.get(file)!;
      const clip = src?.animations.find((a) => a.name === name);
      if (!src || !clip) continue;
      const loop = LOOPS.has(key);
      if (hero.retargetExtra) {
        clips.push({ key, clip: retargetClip(new Rig(src.scene), clip, rig, { fill: fillQ, loop: true, name: "M2M_" + name }), loop: true });
        this.clipRefs.push(null);
        this.retargeted.push(key);
      } else {
        clips.push({ key, clip: resampleClip(clip, loop), loop });
        this.clipRefs.push(clip);
      }
    }
    rig.writePose(rig.restQ, rig.restP);
    // Strike clips without a release time: the faster hand's speed peak (FK in the root frame, 60 Hz).
    for (const c of clips) {
      if (!STRIKES.includes(c.key)) continue;
      if (CLIP_RELEASE_S[c.key] === undefined) CLIP_RELEASE_S[c.key] = measureRelease(c.clip, rig, this.root);
      c.release = CLIP_RELEASE_S[c.key];
    }
    const anim = new Animator(model, this.root, clips);
    this.anim = anim;
    for (let i = 0; i < anim.keys.length; i += 1) {
      this.clipKeys.push(anim.keys[i]!);
      this.clipActions.push(anim.actions[i]!);
    }
    // Authored key-pose skills on this rig (motion round 4).
    for (const [slot, id] of Object.entries(hero.keyPoses)) {
      const skill = KEY_POSE_SKILLS[id];
      if (skill) anim.keyPoses.add(slot, skill);
    }
    anim.onClip = (key) => this.onState?.("clip", key);
    this.armCheck = new ArmCheck(model);
    this.bodyCheck = new BodyCheck(model);
    this.after = new AfterImages(model, this.root, hero.colour);
    this.ring = new HitRing(model, this.root);
    this.poseProbe = new PoseProbe(this);
    // Console access for tuning (the lab is dev-only and never built).
    (window as unknown as Record<string, unknown>).__labCaster = this;
    (window as unknown as Record<string, unknown>).__labPose = this.poseProbe;
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
  charge(slot: string, progress: number, tx: number, tz: number, keysLeft = 1): void {
    const anim = this.anim;
    if (!anim) return;
    this.primed = null;
    if (slot === "dash") anim.charge("dash", "dash", progress, keysLeft, tx, tz);
    else anim.charge(slot, slotClip(slot), progress, keysLeft, tx, tz);
  }

  /** The last key: the strike runs on from its release, aimed at (tx, tz) (the VFX read the hand after `update`). */
  release(slot: string, tx?: number, tz?: number): void {
    this.primed = null;
    if (slot === "dash") return; // the dash starts on KiemHost.play("dash")
    const has = tx !== undefined && tz !== undefined;
    this.anim?.release(slot, slotClip(slot), has ? tx : this.x + this.fx * 6, has ? tz : this.z + this.fz * 6, has);
  }

  /**
   * An automatic attack fires in `leadS` seconds at (tx, tz) (the game's attack timer knows): the body winds up as a
   * typed word would, so the release on the attack's frame has its anticipation. Without a release the wind-up lets go
   * 0.3 s after the lead.
   */
  prime(slot: string, tx: number, tz: number, leadS = 0.25): void {
    if (!this.anim || slot === "dash") return;
    this.primed = { slot, tx, tz, t: 0, lead: Math.max(1 / 60, leadS) };
  }

  /** A primed attack's wind-up: the progress over its lead, the last "key" a third of the lead before the fire. */
  private updatePrime(dt: number): void {
    const p = this.primed;
    const anim = this.anim;
    if (!p || !anim) return;
    p.t += dt;
    if (p.t > p.lead + 0.3) {
      this.primed = null;
      anim.cancelCharge();
      return;
    }
    const progress = Math.min(1, p.t / p.lead);
    anim.charge(p.slot, slotClip(p.slot), progress, progress >= 0.66 ? 1 : 2, p.tx, p.tz);
  }

  /** An enemy blow landed from (fromX, fromZ): the stagger, the step back and the rim flash. */
  hit(fromX: number, fromZ: number): void {
    this.anim?.hit(fromX, fromZ);
    this.rimT = 0;
    this.ring?.start();
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
    this.after?.reset();
    this.ring?.reset();
    this.primed = null;
    this.prevX = x;
    this.prevZ = z;
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
    if (this.anim) this.bodyCheck?.sample(f, this.anim.loco.fx, this.anim.loco.fz, this.lastDt);
  }

  resetChecks(): void {
    this.armCheck?.reset();
    this.bodyCheck?.reset();
  }

  armReport(): Record<string, unknown> {
    const r: Record<string, unknown> = this.armCheck ? this.armCheck.report() : {};
    if (this.bodyCheck) r.body = this.bodyCheck.report();
    return r;
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
    this.lastDt = dt;
    this.updatePrime(dt);
    anim.update(dt);
    this.updateRim(dt);
    // After-images while the dash glides fast (posed as drawn, after the Animator); the chest ring of a blow.
    const sx = this.x;
    const sz = this.z;
    const speed = dt > 1e-6 ? Math.hypot(sx - this.prevX, sz - this.prevZ) / dt : 0;
    this.prevX = sx;
    this.prevZ = sz;
    this.after?.update(dt, anim.state === "dash" && anim.loco.dashing, speed);
    this.ring?.update(dt);
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
