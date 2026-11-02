/**
 * Motion probe for the skills lab (dev-only, never built; MOTION_PLAN step 1,
 * CHARACTER_ANIMATION §5.11, VFX_STANDARD §3.1 rule 5). Measures what the
 * viewer sees, one sample per drawn frame, without touching the clips or the
 * VFX files: the caster's bones, root and feet, and every mesh of the FX
 * layer read from its own attributes and uniforms.
 *
 * Per frame: bone angular velocity against the active clips' peak, distance
 * to the bind pose, root speed and turn rate, foot slide while planted,
 * ground penetration, VFX layer energy (alpha × size) and pops, blade pops
 * and snaps. Markers: keys, the last key, the VFX release (first flash after
 * the last key), the body release (the clip crossing its `release` time),
 * clip, move, face and scenario phase changes.
 *
 * Call `sample(dt)` once per frame after the render (fresh world matrices,
 * what was drawn). The per-frame path allocates nothing; markers allocate.
 */
import * as THREE from "three";

/** Acceptance numbers (CHARACTER_ANIMATION §5.11, MOTION_PLAN step 1). */
export const MOTION_GATES = {
  /** Bone angular velocity in a transition ≤ this × the clip peak. */
  transitionRatio: 1.5,
  /** Foot speed while planted (m/s). */
  footSlideMps: 0.05,
  /** Loop seam (cm). */
  loopSeamCm: 1,
  /** Ground penetration (% of height). */
  penetrationPct: 2,
  /** Clip event drift (frames). */
  eventFrames: 1,
  /** Last key to release (ms). */
  keyToReleaseMs: 50,
  /** Charge pose differs from the release pose by at least this (% of height, mean key-joint distance). */
  silhouettePct: 15,
  /** A layer's alpha or size may not change by more than this share of its full level in one frame (outside a declared flash). */
  popShare: 0.3,
  /** Frames whose bind distance is under this share of the clips' own minimum are "near bind". */
  nearBindShare: 0.5,
  /** Root turn above this (deg/s) is a snap (a critical spring at half-life 0.06 s peaks near 1,530). */
  snapTurnDegS: 1800,
  /** Root speed above this (m/s) is a teleport. */
  teleportMps: 15,
  /** Blade direction change above this (deg) in one frame is a snap. */
  bladeSnapDeg: 30,
  /** Blade centre moving more than this (m) in one frame is a jump. */
  bladeJumpM: 3,
} as const;

export interface ProbeClip {
  readonly key: string;
  readonly action: THREE.AnimationAction;
  readonly loop: boolean;
  /** Clip time of the strike (s, §5.6 `release`), when the clip has one. */
  readonly releaseS?: number;
  /** The clip as authored (24 fps keys) for the reference peaks, when the played one is resampled (MOTION_PLAN step 2.4). */
  readonly refClip?: THREE.AnimationClip;
}

/** The public pose arrays of view/skills/blades.ts BladeSet, read only. */
export interface ProbeBlades {
  readonly capacity: number;
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly cz: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly tz: Float32Array;
  readonly len: Float32Array;
  readonly mesh: THREE.Object3D;
  isVisible(i: number): boolean;
}

export interface ProbeSetup {
  /** Caster root: ground position and yaw. */
  readonly root: THREE.Object3D;
  /** Skinned model (the mixer root). */
  readonly model: THREE.Object3D;
  readonly heightM: number;
  readonly clips: readonly ProbeClip[];
  readonly fxLayer: THREE.Object3D;
  readonly layerNames: ReadonlyMap<THREE.Object3D, string>;
  readonly blades?: ProbeBlades;
  /** Layer names whose rise may be full on its first frame (flashes, VFX_STANDARD §3.1 rule 5). */
  readonly flashLayers?: readonly string[];
}

export interface ProbeEvent {
  readonly f: number;
  readonly t: number;
  readonly kind: string;
  readonly detail: string;
}

export interface ProbeRelease {
  slot: string;
  lastKeyF: number;
  vfxF: number;
  bodyF: number;
  clip: string;
  releaseS: number;
  silhouettePct: number;
  /** Charge pose against the strike's extreme: the largest silhouette distance within STRIKE_WINDOW_S of the body release (%). */
  strikePct: number;
  note: string;
}

interface ClipInfo {
  key: string;
  name: string;
  duration: number;
  loop: boolean;
  releaseS: number;
  peakDegS: number;
  peakBone: string;
  /** Hand speed peaks measured by FK (s, m/s). */
  handR: [number, number];
  handL: [number, number];
  seamCm: number;
  minBindRmsDeg: number;
}

const Kind = { Sprite: 0, Beam: 1, Ribbon: 2, Sigil: 3, Other: 4 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Layer {
  readonly name: string;
  readonly mesh: THREE.Mesh;
  readonly kind: Kind;
  readonly flash: boolean;
  /** Points per ribbon (ribbon layers). */
  readonly ribbonPts: number;
  prev: number;
  peak: number;
  prevScale: number;
  popsOn: number;
  popsOff: number;
  popsScale: number;
  flashOn: number;
  maxEnergy: number;
}

/** Pop kinds in the pop log. */
export const POP_KINDS = ["on", "off", "scale", "flash-on", "blade-on", "blade-off", "blade-size", "blade-snap", "blade-jump"] as const;

const CAP = 36_000; // frames (5 min at 120 Hz)
/** A layer's "full level" is its running peak, halving every second (so it follows the skill on screen). */
const PEAK_HALF_LIFE_S = 1;
/** Clips that played within this time (s) still set the angular velocity scale. */
const REF_WINDOW_S = 0.2;
/** Transition window after a state change (s); one frame before it is included. */
const TRANSITION_S = 0.2;
const POP_CAP = 16_384;
/**
 * Fair layer pops (MOTION_PLAN step 3): a rise is judged against the level
 * the layer reaches within this time after it. The running peak alone counts
 * any rise from nothing as a pop (the first frame of a fade-in IS the peak so
 * far), so a slow fade-in scored worse than an instant pop.
 */
const RISE_LOOKAHEAD_S = 0.25;
const DEG = 180 / Math.PI;
const KEY_JOINTS = ["pelvis", "head", "hand_l", "hand_r", "lowerarm_l", "lowerarm_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"] as const;
const PLANT_M = 0.04;
/** The strike silhouette is the largest within this time after the body release (s). */
const STRIKE_WINDOW_S = 0.35;
/** Floats per blade life (bladeLife). */
const BL = 6;
const BONE_FLOOR_DEGS = 90;

function quatAngle(ax: number, ay: number, az: number, aw: number, bx: number, by: number, bz: number, bw: number): number {
  const d = Math.min(1, Math.abs(ax * bx + ay * by + az * bz + aw * bw));
  return 2 * Math.acos(d);
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Names the FX meshes after the fields that own them (`owner.glow.mesh` → "glow"); shared meshes join names. */
export function collectLayerNames(owner: object, into: Map<THREE.Object3D, string>): Map<THREE.Object3D, string> {
  for (const [key, value] of Object.entries(owner)) {
    if (value === null || typeof value !== "object") continue;
    const mesh = (value as { mesh?: unknown }).mesh;
    if (!(mesh instanceof THREE.Object3D)) continue;
    const had = into.get(mesh);
    into.set(mesh, had === undefined ? key : had + "+" + key);
  }
  return into;
}

export class MotionProbe {
  private ready = false;
  private setup: ProbeSetup | null = null;
  // Bones.
  private bones: THREE.Bone[] = [];
  private boneNames: string[] = [];
  private bind = new Float32Array(0);
  private prevQ = new Float32Array(0);
  private bonePeak = new Float32Array(0); // clips × bones (deg/s)
  private boneRef = new Float32Array(0);
  // Clips.
  private clipInfo: ClipInfo[] = [];
  private clipPeak = new Float32Array(0);
  /** Last time (s) each clip had weight (−1 never). */
  private clipSeen = new Float64Array(0);
  private nearBindDeg = 0;
  // Key joints (root-local) and feet.
  private joints: (THREE.Object3D | null)[] = [];
  private restY = new Float32Array(KEY_JOINTS.length);
  private pose = new Float32Array(KEY_JOINTS.length * 3);
  private chargePose = new Float32Array(KEY_JOINTS.length * 3);
  private footPrev = new Float32Array(8); // ankle xz, ball xz per side
  private plantedPrev = new Uint8Array(2);
  private readonly rootInv = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  // Root.
  private px = 0;
  private pz = 0;
  private pyaw = 0;
  private pspeed = 0;
  private has = false;
  // VFX.
  private layers: Layer[] = [];
  /** Energy per frame per layer (frame × layers), for the fair pop count in metrics(). */
  private layerE = new Float32Array(0);
  private bladePrevVis = new Uint8Array(0);
  private bladePrev = new Float32Array(0); // cx cy cz tx ty tz len per slot
  /** Per blade life: first length, peak length, largest one-frame length step, its frame, appear frame, snap frames. */
  private bladeLife = new Float32Array(0);
  private bladeCounts = { lives: 0, on: 0, off: 0, size: 0, snap: 0, jump: 0, livesWithSnap: 0 };
  private readonly popF = new Int32Array(POP_CAP);
  private readonly popL = new Int16Array(POP_CAP);
  private readonly popK = new Int8Array(POP_CAP);
  private readonly popA = new Float32Array(POP_CAP);
  private readonly popB = new Float32Array(POP_CAP);
  private pops = 0;
  // Series.
  private f = 0;
  private time = 0;
  private readonly sT = new Float32Array(CAP);
  private readonly sDt = new Float32Array(CAP);
  private readonly sSpeed = new Float32Array(CAP);
  private readonly sAccel = new Float32Array(CAP);
  private readonly sTurn = new Float32Array(CAP);
  private readonly sBoneW = new Float32Array(CAP);
  private readonly sBone = new Int16Array(CAP);
  private readonly sRef = new Float32Array(CAP);
  private readonly sRatio = new Float32Array(CAP);
  private readonly sBoneRatio = new Float32Array(CAP);
  private readonly sBind = new Float32Array(CAP);
  private readonly sWeight = new Float32Array(CAP);
  private readonly sSlide = new Float32Array(CAP);
  private readonly sStance = new Float32Array(CAP);
  private lowerPrev = -1;
  private readonly sPen = new Float32Array(CAP);
  private readonly sFootL = new Float32Array(CAP);
  private readonly sFootR = new Float32Array(CAP);
  private readonly sVfx = new Float32Array(CAP);
  private readonly sPops = new Int16Array(CAP);
  // Markers.
  private events: ProbeEvent[] = [];
  private releases: ProbeRelease[] = [];
  private pendingVfx: ProbeRelease | null = null;
  private pendingBody: ProbeRelease | null = null;
  private pendingClip = -1;
  private chargeSaved = false;
  /** The release whose strike silhouette is being measured, until this probe time. */
  private strikeRec: ProbeRelease | null = null;
  private strikeUntil = 0;

  /** Reads the rig and the clips (offline, at load, before the first mixer update) and the FX layer. */
  attach(setup: ProbeSetup): void {
    this.setup = setup;
    const model = setup.model;
    setup.root.updateMatrixWorld(true);
    const bones: THREE.Bone[] = [];
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    this.bones = bones;
    this.boneNames = bones.map((b) => b.name);
    const n = bones.length;
    this.bind = new Float32Array(n * 4);
    this.prevQ = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) bones[i]!.quaternion.toArray(this.bind, i * 4);
    this.joints = KEY_JOINTS.map((name) => model.getObjectByName(name) ?? null);
    this.analyseClips();
    this.boneRef = new Float32Array(n);
    this.clipSeen = new Float64Array(setup.clips.length).fill(-1);
    this.attachLayers();
    this.ready = true;
    this.reset();
  }

  /** Clears series and markers (a new run). */
  reset(): void {
    this.f = 0;
    this.time = 0;
    this.has = false;
    this.pspeed = 0;
    this.pops = 0;
    this.events = [];
    this.releases = [];
    this.pendingVfx = null;
    this.pendingBody = null;
    this.pendingClip = -1;
    this.chargeSaved = false;
    this.strikeRec = null;
    this.plantedPrev.fill(0);
    this.lowerPrev = -1;
    this.clipSeen.fill(-1);
    this.bladePrevVis.fill(0);
    this.bladeLife.fill(0);
    this.bladeCounts = { lives: 0, on: 0, off: 0, size: 0, snap: 0, jump: 0, livesWithSnap: 0 };
    for (const L of this.layers) {
      L.prev = 0;
      L.peak = 0;
      L.prevScale = 0;
      L.popsOn = 0;
      L.popsOff = 0;
      L.popsScale = 0;
      L.flashOn = 0;
      L.maxEnergy = 0;
    }
  }

  /** The index the next sample gets (the frame being built). */
  get frame(): number {
    return this.f;
  }

  /** The last sampled frame. */
  get lastFrame(): number {
    return this.f - 1;
  }

  event(kind: string, detail = ""): void {
    this.events.push({ f: this.f, t: r3(this.time), kind, detail });
  }

  /** A clip starts (LabCaster.play): a state change, and the body release to watch for after a last key. */
  clip(key: string): void {
    this.event("clip", key);
    const c = this.clipIndex(key);
    const rec = this.pendingBody;
    if (rec !== null && rec.clip !== "") {
      // Another clip before the strike: the release never showed.
      if (rec.bodyF < 0) rec.note = rec.note || "interrupted by " + key;
      this.pendingBody = null;
      this.pendingClip = -1;
    }
    const last = this.releases[this.releases.length - 1];
    if (last !== undefined && last.clip === "" && this.f - last.lastKeyF <= 1 && key !== "idle" && key !== "run") {
      last.clip = key;
      const info = c >= 0 ? this.clipInfo[c] : undefined;
      if (info !== undefined && info.releaseS >= 0) {
        last.releaseS = info.releaseS;
        this.pendingBody = last;
        this.pendingClip = c;
      } else {
        last.note = "clip has no release";
      }
    }
  }

  /** The word's last key, just before the cast (the charge pose is the last drawn frame). */
  lastKey(slot: string): void {
    this.event("lastKey", slot);
    const rec: ProbeRelease = { slot, lastKeyF: this.f, vfxF: -1, bodyF: -1, clip: "", releaseS: -1, silhouettePct: -1, strikePct: -1, note: "" };
    this.releases.push(rec);
    this.pendingVfx = rec;
    this.chargePose.set(this.pose);
    this.chargeSaved = this.has;
  }

  /** The host's flash (impact light); the first one after a last key is the VFX release. */
  flash(): void {
    const rec = this.pendingVfx;
    if (rec === null) return;
    rec.vfxF = this.f;
    this.pendingVfx = null;
  }

  sample(dt: number): void {
    const setup = this.setup;
    if (!this.ready || setup === null) return;
    const f = this.f;
    this.time += dt;
    const inv = dt > 0 ? 1 / dt : 0;
    const w = f < CAP;

    // Root.
    const m = setup.root.matrixWorld.elements;
    const x = m[12]!;
    const z = m[14]!;
    const yaw = Math.atan2(m[8]!, m[10]!);
    let speed = 0;
    let turn = 0;
    if (this.has) {
      speed = Math.hypot(x - this.px, z - this.pz) * inv;
      turn = Math.abs(wrapPi(yaw - this.pyaw)) * inv * DEG;
    }
    const accel = this.has ? Math.abs(speed - this.pspeed) * inv : 0;
    this.px = x;
    this.pz = z;
    this.pyaw = yaw;
    this.pspeed = speed;

    // Clips with weight now or in the last REF_WINDOW frames set the scale (a clip that just dropped out still counts).
    const clips = setup.clips;
    let refUse = 0;
    let wsum = 0;
    for (let c = 0; c < clips.length; c += 1) {
      const action = clips[c]!.action;
      // An action never played keeps weight 1 in three.js: only scheduled ones count.
      const ew = action.isScheduled() ? action.getEffectiveWeight() : 0;
      if (ew > 0.001) {
        wsum += ew;
        this.clipSeen[c] = this.time;
      }
      if (this.clipSeen[c]! >= 0 && this.time - this.clipSeen[c]! <= REF_WINDOW_S + 1e-6) refUse = Math.max(refUse, this.clipPeak[c]!);
    }

    // Bones: local angular velocity, the per-bone peak of the active clips, distance to bind.
    const bones = this.bones;
    const nb = bones.length;
    let maxW = 0;
    let maxB = -1;
    let maxBoneRatio = 0;
    let bindSq = 0;
    for (let i = 0; i < nb; i += 1) {
      const q = bones[i]!.quaternion;
      const o = i * 4;
      let peak = 0;
      for (let c = 0; c < clips.length; c += 1) {
        if (this.clipSeen[c]! >= 0 && this.time - this.clipSeen[c]! <= REF_WINDOW_S + 1e-6) peak = Math.max(peak, this.bonePeak[c * nb + i]!);
      }
      if (this.has) {
        const wDeg = quatAngle(q.x, q.y, q.z, q.w, this.prevQ[o]!, this.prevQ[o + 1]!, this.prevQ[o + 2]!, this.prevQ[o + 3]!) * inv * DEG;
        if (wDeg > maxW) {
          maxW = wDeg;
          maxB = i;
        }
        const br = wDeg / Math.max(BONE_FLOOR_DEGS, peak);
        if (br > maxBoneRatio) maxBoneRatio = br;
      }
      const b = quatAngle(q.x, q.y, q.z, q.w, this.bind[o]!, this.bind[o + 1]!, this.bind[o + 2]!, this.bind[o + 3]!) * DEG;
      bindSq += b * b;
      this.prevQ[o] = q.x;
      this.prevQ[o + 1] = q.y;
      this.prevQ[o + 2] = q.z;
      this.prevQ[o + 3] = q.w;
    }
    const bindRms = nb > 0 ? Math.sqrt(bindSq / nb) : 0;

    // Key joints in root space (silhouette) and feet in world space (slide, penetration).
    this.rootInv.copy(setup.root.matrixWorld).invert();
    let slide = -1;
    let pen = 0;
    let footL = 0;
    let footR = 0;
    let spL = -1;
    let spR = -1;
    for (let j = 0; j < KEY_JOINTS.length; j += 1) {
      const joint = this.joints[j];
      if (!joint) continue;
      const e = joint.matrixWorld.elements;
      this.v.set(e[12]!, e[13]!, e[14]!).applyMatrix4(this.rootInv);
      this.pose[j * 3] = this.v.x;
      this.pose[j * 3 + 1] = this.v.y;
      this.pose[j * 3 + 2] = this.v.z;
    }
    for (let side = 0; side < 2; side += 1) {
      const ja = 8 + side; // foot_l / foot_r
      const jb = 10 + side; // ball_l / ball_r
      const a = this.joints[ja];
      const b = this.joints[jb];
      if (!a) continue;
      const ea = a.matrixWorld.elements;
      const eb = b ? b.matrixWorld.elements : ea;
      const relA = ea[13]! - this.restY[ja]!;
      const relB = b ? eb[13]! - this.restY[jb]! : relA;
      const rel = Math.min(relA, relB);
      if (side === 0) footL = rel;
      else footR = rel;
      pen = Math.max(pen, -relA, -relB);
      const planted = rel < PLANT_M ? 1 : 0;
      const o = side * 4;
      if (planted && this.plantedPrev[side] && this.has) {
        // A foot rolling on its heel or toe is not sliding: the slower of ankle and ball.
        const sa = Math.hypot(ea[12]! - this.footPrev[o]!, ea[14]! - this.footPrev[o + 1]!) * inv;
        const sb = Math.hypot(eb[12]! - this.footPrev[o + 2]!, eb[14]! - this.footPrev[o + 3]!) * inv;
        slide = Math.max(slide, Math.min(sa, sb));
        if (side === 0) spL = Math.min(sa, sb);
        else spR = Math.min(sa, sb);
      }
      this.plantedPrev[side] = planted;
      this.footPrev[o] = ea[12]!;
      this.footPrev[o + 1] = ea[14]!;
      this.footPrev[o + 2] = eb[12]!;
      this.footPrev[o + 3] = eb[14]!;
    }
    // Stance slide: only the lower foot (the one bearing the weight), and only while it stays the lower one.
    // A low swing foot (a shuffling walk keeps both under 4 cm) is not a slide.
    const lower = footL <= footR ? 0 : 1;
    const lowerSp = lower === 0 ? spL : spR;
    const stance = lowerSp >= 0 && this.lowerPrev === lower ? lowerSp : -1;
    this.lowerPrev = lower;

    // Body release: the strike clip crosses its release time.
    const rec = this.pendingBody;
    if (rec !== null && this.pendingClip >= 0) {
      const action = clips[this.pendingClip]!.action;
      if (action.isScheduled() && action.getEffectiveWeight() > 0.001 && action.time + 1e-4 >= rec.releaseS) {
        rec.bodyF = f;
        if (this.chargeSaved) {
          let sum = 0;
          let cnt = 0;
          for (let j = 0; j < KEY_JOINTS.length; j += 1) {
            if (!this.joints[j]) continue;
            const dx = this.pose[j * 3]! - this.chargePose[j * 3]!;
            const dy = this.pose[j * 3 + 1]! - this.chargePose[j * 3 + 1]!;
            const dz = this.pose[j * 3 + 2]! - this.chargePose[j * 3 + 2]!;
            sum += Math.hypot(dx, dy, dz);
            cnt += 1;
          }
          rec.silhouettePct = cnt > 0 ? r1(((sum / cnt) / setup.heightM) * 100) : -1;
          this.strikeRec = rec;
          this.strikeUntil = this.time + STRIKE_WINDOW_S;
        }
        if (action.time - rec.releaseS > 0.02 && f === rec.lastKeyF) rec.note = rec.note || "clip started past its release";
        this.pendingBody = null;
        this.pendingClip = -1;
      }
    }

    // The strike's extreme against the charge pose (the silhouette contrast of §5.11).
    const sr = this.strikeRec;
    if (sr !== null) {
      if (this.time > this.strikeUntil + 1e-6) this.strikeRec = null;
      else {
        let sum = 0;
        let cnt = 0;
        for (let j = 0; j < KEY_JOINTS.length; j += 1) {
          if (!this.joints[j]) continue;
          const dx = this.pose[j * 3]! - this.chargePose[j * 3]!;
          const dy = this.pose[j * 3 + 1]! - this.chargePose[j * 3 + 1]!;
          const dz = this.pose[j * 3 + 2]! - this.chargePose[j * 3 + 2]!;
          sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
          cnt += 1;
        }
        const pct = cnt > 0 ? r1(((sum / cnt) / setup.heightM) * 100) : -1;
        if (pct > sr.strikePct) sr.strikePct = pct;
      }
    }

    // VFX.
    let vfx = 0;
    const popsBefore = this.pops;
    const decay = Math.pow(0.5, dt / PEAK_HALF_LIFE_S);
    for (let li = 0; li < this.layers.length; li += 1) {
      const L = this.layers[li]!;
      const e = this.energy(L);
      if (w) this.layerE[f * this.layers.length + li] = e;
      vfx += e;
      L.peak = Math.max(e, L.prev, L.peak * decay);
      if (e > L.maxEnergy) L.maxEnergy = e;
      if (this.has) {
        const d = e - L.prev;
        if (Math.abs(d) > MOTION_GATES.popShare * L.peak && L.peak > 1e-6) {
          if (d < 0) {
            L.popsOff += 1;
            this.pop(f, li, 1, L.prev, e);
          } else if (L.flash) {
            L.flashOn += 1;
            this.pop(f, li, 3, L.prev, e);
          } else {
            L.popsOn += 1;
            this.pop(f, li, 0, L.prev, e);
          }
        }
        if (L.kind === Kind.Sigil || L.kind === Kind.Other) {
          const s = L.mesh.visible ? L.mesh.matrixWorld.getMaxScaleOnAxis() : 0;
          if (s > 0 && L.prevScale > 0 && Math.abs(s - L.prevScale) > MOTION_GATES.popShare * Math.max(s, L.prevScale)) {
            L.popsScale += 1;
            this.pop(f, li, 2, L.prevScale, s);
          }
          L.prevScale = s;
        }
      }
      L.prev = e;
    }
    vfx += this.sampleBlades(f);
    const popsNow = this.pops - popsBefore;

    if (w) {
      this.sT[f] = this.time;
      this.sDt[f] = dt;
      this.sSpeed[f] = speed;
      this.sAccel[f] = accel;
      this.sTurn[f] = turn;
      this.sBoneW[f] = maxW;
      this.sBone[f] = maxB;
      this.sRef[f] = refUse;
      this.sRatio[f] = refUse > 0 ? maxW / refUse : 0;
      this.sBoneRatio[f] = maxBoneRatio;
      this.sBind[f] = bindRms;
      this.sWeight[f] = wsum;
      this.sSlide[f] = slide;
      this.sStance[f] = stance;
      this.sPen[f] = pen;
      this.sFootL[f] = footL;
      this.sFootR[f] = footR;
      this.sVfx[f] = vfx;
      this.sPops[f] = popsNow;
    }
    this.has = true;
    this.f = f + 1;
  }

  /** Layer pops with rises judged against the level reached within RISE_LOOKAHEAD_S (report time only, from layerE). */
  private fairPops(n: number): { summary: Record<string, unknown>; rows: Record<string, unknown>[] } {
    const nl = this.layers.length;
    const share = MOTION_GATES.popShare;
    const rows: Record<string, unknown>[] = [];
    const byLayer: Record<string, { on: number; off: number; flashOn: number }> = {};
    let on = 0;
    let off = 0;
    let flashOn = 0;
    for (let li = 0; li < nl; li += 1) {
      const L = this.layers[li]!;
      const row = { on: 0, off: 0, flashOn: 0 };
      let peak = 0;
      let prev = 0;
      for (let f = 0; f < n; f += 1) {
        const e = this.layerE[f * nl + li]!;
        const decay = f > 0 ? Math.pow(0.5, Math.max(0, this.sT[f]! - this.sT[f - 1]!) / PEAK_HALF_LIFE_S) : 1;
        const before = Math.max(prev, peak * decay);
        if (f > 0) {
          const d = e - prev;
          if (d < 0 && -d > share * before && before > 1e-6) {
            row.off += 1;
            if (rows.length < 4000) rows.push({ f, layer: L.name, kind: "off", a: r3(prev), b: r3(e), full: r3(before) });
          } else if (d > 0) {
            let full = Math.max(before, e);
            const tEnd = this.sT[f]! + RISE_LOOKAHEAD_S + 1e-6;
            for (let g = f + 1; g < n && this.sT[g]! <= tEnd; g += 1) full = Math.max(full, this.layerE[g * nl + li]!);
            if (d > share * full && full > 1e-6) {
              if (L.flash) row.flashOn += 1;
              else row.on += 1;
              if (rows.length < 4000) rows.push({ f, layer: L.name, kind: L.flash ? "flash-on" : "on", a: r3(prev), b: r3(e), full: r3(full) });
            }
          }
        }
        peak = Math.max(e, prev, peak * decay);
        prev = e;
      }
      on += row.on;
      off += row.off;
      flashOn += row.flashOn;
      byLayer[L.name] = row;
    }
    return { summary: { lookaheadS: RISE_LOOKAHEAD_S, layerPopsOn: on, layerPopsOff: off, flashOn, byLayer }, rows };
  }

  private pop(f: number, layer: number, kind: number, a: number, b: number): void {
    if (this.pops >= POP_CAP) return;
    const k = this.pops;
    this.popF[k] = f;
    this.popL[k] = layer;
    this.popK[k] = kind;
    this.popA[k] = a;
    this.popB[k] = b;
    this.pops = k + 1;
  }

  private sampleBlades(f: number): number {
    const bl = this.setup?.blades;
    if (bl === undefined) return 0;
    const li = this.layers.length; // the blades' row in the pop log
    const share = MOTION_GATES.popShare;
    let e = 0;
    for (let i = 0; i < bl.capacity; i += 1) {
      const vis = bl.isVisible(i) ? 1 : 0;
      const o = i * 7;
      const b = i * BL;
      const len = vis ? bl.len[i]! : 0;
      e += len;
      const pv = this.bladePrevVis[i]!;
      if (vis && !pv) {
        // A life starts: judged when it ends, against its full length.
        this.bladeLife[b] = len;
        this.bladeLife[b + 1] = len;
        this.bladeLife[b + 2] = 0;
        this.bladeLife[b + 3] = f;
        this.bladeLife[b + 4] = f;
        this.bladeLife[b + 5] = 0;
      } else if (vis && pv) {
        const L = this.bladeLife;
        const step = Math.abs(len - this.bladePrev[o + 6]!);
        if (len > L[b + 1]!) L[b + 1] = len;
        if (step > L[b + 2]!) {
          L[b + 2] = step;
          L[b + 3] = f;
        }
        const dot = bl.tx[i]! * this.bladePrev[o + 3]! + bl.ty[i]! * this.bladePrev[o + 4]! + bl.tz[i]! * this.bladePrev[o + 5]!;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * DEG;
        if (ang > MOTION_GATES.bladeSnapDeg) {
          this.bladeCounts.snap += 1;
          L[b + 5] = L[b + 5]! + 1;
          this.pop(f, li, 7, 0, ang);
        }
        const jump = Math.hypot(bl.cx[i]! - this.bladePrev[o]!, bl.cy[i]! - this.bladePrev[o + 1]!, bl.cz[i]! - this.bladePrev[o + 2]!);
        if (jump > MOTION_GATES.bladeJumpM) {
          this.bladeCounts.jump += 1;
          this.pop(f, li, 8, 0, jump);
        }
      } else if (!vis && pv) this.endBladeLife(i, f, li, share);
      this.bladePrevVis[i] = vis;
      if (vis) {
        this.bladePrev[o] = bl.cx[i]!;
        this.bladePrev[o + 1] = bl.cy[i]!;
        this.bladePrev[o + 2] = bl.cz[i]!;
        this.bladePrev[o + 3] = bl.tx[i]!;
        this.bladePrev[o + 4] = bl.ty[i]!;
        this.bladePrev[o + 5] = bl.tz[i]!;
        this.bladePrev[o + 6] = len;
      }
    }
    return e;
  }

  /** A blade's life ends: did it appear, vanish or change size by more than 30 % of its full length in one frame? */
  private endBladeLife(i: number, f: number, li: number, share: number): void {
    const L = this.bladeLife;
    const b = i * BL;
    const peak = L[b + 1]!;
    const last = this.bladePrev[i * 7 + 6]!;
    this.bladeCounts.lives += 1;
    if (L[b + 5]! > 0) this.bladeCounts.livesWithSnap += 1;
    if (peak <= 0.01) return;
    if (L[b]! > share * peak) {
      this.bladeCounts.on += 1;
      this.pop(L[b + 4]!, li, 4, 0, L[b]! / peak);
    }
    if (last > share * peak) {
      this.bladeCounts.off += 1;
      this.pop(f, li, 5, last / peak, 0);
    }
    if (L[b + 2]! > share * peak) {
      this.bladeCounts.size += 1;
      this.pop(L[b + 3]!, li, 6, peak, L[b + 2]! / peak);
    }
  }

  /** A layer's light (alpha × area, or alpha × length) from its own attributes or uniforms. */
  private energy(L: Layer): number {
    const mesh = L.mesh;
    if (!mesh.visible) return 0;
    const g = mesh.geometry;
    switch (L.kind) {
      case Kind.Sprite: {
        const n = (g as THREE.InstancedBufferGeometry).instanceCount;
        const pos = g.getAttribute("iPos").array;
        const col = g.getAttribute("iCol").array;
        let e = 0;
        for (let i = 0; i < n; i += 1) {
          const s = pos[i * 4 + 3]!;
          e += col[i * 4 + 3]! * s * s;
        }
        return e;
      }
      case Kind.Beam: {
        const n = (g as THREE.InstancedBufferGeometry).instanceCount;
        const base = g.getAttribute("iBase").array;
        const axis = g.getAttribute("iAxis").array;
        const core = g.getAttribute("iCore").array;
        const halo = g.getAttribute("iHalo").array;
        let e = 0;
        for (let i = 0; i < n; i += 1) {
          const a = i * 3;
          const len = Math.hypot(axis[a]!, axis[a + 1]!, axis[a + 2]!);
          const lum = (core[a]! + core[a + 1]! + core[a + 2]! + halo[a]! + halo[a + 1]! + halo[a + 2]!) / 6;
          e += lum * base[i * 4 + 3]! * len;
        }
        return e;
      }
      case Kind.Ribbon: {
        const pts = L.ribbonPts;
        if (pts < 2) return 0;
        const quads = g.drawRange.count === Infinity ? 0 : g.drawRange.count / 6;
        const ribbons = Math.round(quads / (pts - 1));
        const pos = g.getAttribute("position").array;
        const col = g.getAttribute("aCol").array;
        const tt = g.getAttribute("aT").array;
        let e = 0;
        for (let r = 0; r < ribbons; r += 1) {
          for (let k = 0; k < pts - 1; k += 1) {
            const v = (r * pts + k) * 2;
            const v2 = v + 2;
            const a = col[v * 4 + 3]! * (1 - tt[v]!);
            if (a <= 0) continue;
            e += a * Math.hypot(pos[v2 * 3]! - pos[v * 3]!, pos[v2 * 3 + 1]! - pos[v * 3 + 1]!, pos[v2 * 3 + 2]! - pos[v * 3 + 2]!);
          }
        }
        return e;
      }
      case Kind.Sigil: {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        const fade = u.uFade!.value as number;
        const glow = u.uGlow!.value as number;
        const ink = u.uInk!.value as number;
        const reveal = Math.min(1, Math.max(0, u.uReveal!.value as number));
        return fade * (glow + ink) * (0.3 + 0.7 * reveal);
      }
      default:
        return 1;
    }
  }

  private attachLayers(): void {
    const setup = this.setup!;
    const flash = new Set(setup.flashLayers ?? []);
    const layers: Layer[] = [];
    for (const child of setup.fxLayer.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) continue;
      if (setup.blades !== undefined && child === setup.blades.mesh) continue;
      const g = mesh.geometry;
      const name = setup.layerNames.get(child) ?? (child.name || "mesh");
      let kind: Kind = Kind.Other;
      let pts = 0;
      if (g.getAttribute("iPos") && g.getAttribute("iCol")) kind = Kind.Sprite;
      else if (g.getAttribute("iCore") && g.getAttribute("iHalo") && g.getAttribute("iBase")) kind = Kind.Beam;
      else if (g.getAttribute("aCol") && g.getAttribute("aT")) {
        kind = Kind.Ribbon;
        pts = ribbonPoints(g);
      } else {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        if (u && u.uFade && u.uGlow && u.uInk && u.uReveal) kind = Kind.Sigil;
      }
      const isFlash = name.split("+").some((part) => flash.has(part));
      layers.push({ name, mesh, kind, flash: isFlash, ribbonPts: pts, prev: 0, peak: 0, prevScale: 0, popsOn: 0, popsOff: 0, popsScale: 0, flashOn: 0, maxEnergy: 0 });
    }
    this.layers = layers;
    this.layerE = new Float32Array(CAP * layers.length);
    const cap = setup.blades?.capacity ?? 0;
    this.bladePrevVis = new Uint8Array(cap);
    this.bladePrev = new Float32Array(cap * 7);
    this.bladeLife = new Float32Array(cap * BL);
  }

  private clipIndex(key: string): number {
    const clips = this.setup?.clips ?? [];
    for (let c = 0; c < clips.length; c += 1) if (clips[c]!.key === key) return c;
    return -1;
  }

  /**
   * Samples every clip off-line on the rig itself (the mixer has not run yet):
   * per-bone angular velocity peaks (240 Hz), hand speed peaks by FK (120 Hz),
   * loop seams, the lowest bind distance, and the feet's standing heights
   * (Idle at 0). Restores the bind pose after.
   */
  private analyseClips(): void {
    const setup = this.setup!;
    const model = setup.model;
    const root = setup.root;
    const nodes: THREE.Object3D[] = [];
    model.traverse((o) => nodes.push(o));
    const saved = nodes.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()] as const);
    const bones = this.bones;
    const nb = bones.length;
    const clips = setup.clips;
    this.bonePeak = new Float32Array(clips.length * nb);
    this.clipPeak = new Float32Array(clips.length);
    const prev = new Float32Array(nb * 4);
    const v = new THREE.Vector3();
    const handR = model.getObjectByName("hand_r");
    const handL = model.getObjectByName("hand_l");
    const seamJoints = this.joints.filter((j): j is THREE.Object3D => j !== null);
    let minBindAll = Infinity;
    const infos: ClipInfo[] = [];
    for (let c = 0; c < clips.length; c += 1) {
      const pc = clips[c]!;
      // Reference peaks from the authored clip, so runs before and after the resampling share a scale.
      const clip = pc.refClip ?? pc.action.getClip();
      const writers = clip.tracks.map((track) => {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        const node = model.getObjectByName(parsed.nodeName) ?? null;
        const prop = parsed.propertyName;
        const interp = track.createInterpolant();
        return { node, prop, interp };
      });
      const poseAt = (t: number): void => {
        for (const wr of writers) {
          if (wr.node === null) continue;
          const val = wr.interp.evaluate(t) as ArrayLike<number>;
          if (wr.prop === "quaternion") wr.node.quaternion.set(val[0]!, val[1]!, val[2]!, val[3]!);
          else if (wr.prop === "position") wr.node.position.set(val[0]!, val[1]!, val[2]!);
          else if (wr.prop === "scale") wr.node.scale.set(val[0]!, val[1]!, val[2]!);
        }
      };
      const dur = clip.duration;
      // Angular velocity peaks and bind distance at 240 Hz (linear quaternion keys: constant rate inside a key).
      const steps = Math.max(2, Math.ceil(dur * 240));
      let peak = 0;
      let peakBone = -1;
      let minBind = Infinity;
      for (let k = 0; k <= steps + (pc.loop ? 1 : 0); k += 1) {
        const t = k > steps ? 0 : (k / steps) * dur;
        poseAt(t);
        let bindSq = 0;
        for (let i = 0; i < nb; i += 1) {
          const q = bones[i]!.quaternion;
          if (k > 0) {
            const wDeg = (quatAngle(q.x, q.y, q.z, q.w, prev[i * 4]!, prev[i * 4 + 1]!, prev[i * 4 + 2]!, prev[i * 4 + 3]!) / (dur / steps)) * DEG;
            if (wDeg > this.bonePeak[c * nb + i]!) this.bonePeak[c * nb + i] = wDeg;
            if (wDeg > peak) {
              peak = wDeg;
              peakBone = i;
            }
          }
          q.toArray(prev, i * 4);
          const b = quatAngle(q.x, q.y, q.z, q.w, this.bind[i * 4]!, this.bind[i * 4 + 1]!, this.bind[i * 4 + 2]!, this.bind[i * 4 + 3]!) * DEG;
          bindSq += b * b;
        }
        if (k <= steps) minBind = Math.min(minBind, Math.sqrt(bindSq / Math.max(1, nb)));
      }
      this.clipPeak[c] = peak;
      minBindAll = Math.min(minBindAll, minBind);
      // Hand speed peaks by FK at 120 Hz (the strike), in root space.
      const fk = Math.max(2, Math.ceil(dur * 120));
      const hr: [number, number] = [0, 0];
      const hl: [number, number] = [0, 0];
      const pr = new THREE.Vector3();
      const pl = new THREE.Vector3();
      for (let k = 0; k <= fk; k += 1) {
        const t = (k / fk) * dur;
        poseAt(t);
        root.updateMatrixWorld(true);
        for (const [hand, last, out] of [
          [handR, pr, hr],
          [handL, pl, hl],
        ] as const) {
          if (!hand) continue;
          root.worldToLocal(hand.getWorldPosition(v));
          if (k > 0) {
            const s = v.distanceTo(last) / (dur / fk);
            if (s > out[1]) {
              out[0] = r3(t);
              out[1] = r3(s);
            }
          }
          last.copy(v);
        }
      }
      // Loop seam: key joints at 0 and at the end.
      let seam = -1;
      if (pc.loop) {
        poseAt(0);
        root.updateMatrixWorld(true);
        const at0 = seamJoints.map((j) => root.worldToLocal(j.getWorldPosition(new THREE.Vector3())));
        poseAt(dur);
        root.updateMatrixWorld(true);
        seam = 0;
        seamJoints.forEach((j, i) => {
          seam = Math.max(seam, root.worldToLocal(j.getWorldPosition(v)).distanceTo(at0[i]!) * 100);
        });
      }
      if (pc.key === "idle") {
        poseAt(0);
        root.updateMatrixWorld(true);
        for (let j = 0; j < KEY_JOINTS.length; j += 1) {
          const joint = this.joints[j];
          if (joint) this.restY[j] = root.worldToLocal(joint.getWorldPosition(v)).y;
        }
      }
      infos.push({
        key: pc.key,
        name: clip.name,
        duration: r3(dur),
        loop: pc.loop,
        releaseS: pc.releaseS ?? -1,
        peakDegS: r1(peak),
        peakBone: peakBone >= 0 ? this.boneNames[peakBone]! : "",
        handR: hr,
        handL: hl,
        seamCm: seam < 0 ? -1 : r3(seam),
        minBindRmsDeg: r1(minBind),
      });
    }
    this.clipInfo = infos;
    this.nearBindDeg = Number.isFinite(minBindAll) ? minBindAll * MOTION_GATES.nearBindShare : 0;
    nodes.forEach((o, i) => {
      const s = saved[i]!;
      o.position.copy(s[0]);
      o.quaternion.copy(s[1]);
      o.scale.copy(s[2]);
    });
    root.updateMatrixWorld(true);
  }

  /** Summary, transitions, markers, pops and the per-frame series (JSON-safe). */
  metrics(): Record<string, unknown> {
    const n = Math.min(this.f, CAP);
    const G = MOTION_GATES;
    const peakOf = (key: string): number => {
      const c = this.clipIndex(key);
      return c >= 0 ? this.clipPeak[c]! : 0;
    };
    // State changes and the window after each (−1 … +12 frames).
    const transitions: Record<string, unknown>[] = [];
    let lastClip = "idle";
    for (const ev of this.events) {
      if (ev.kind !== "clip" && ev.kind !== "move" && ev.kind !== "face") continue;
      const from = lastClip;
      if (ev.kind === "clip") lastClip = ev.detail;
      const a = Math.max(1, ev.f - 1);
      let b = Math.min(n - 1, ev.f);
      const tEnd = (ev.f < n ? this.sT[ev.f]! : this.time) + TRANSITION_S;
      while (b + 1 < n && this.sT[b + 1]! <= tEnd + 1e-6) b += 1;
      const ref = ev.kind === "clip" ? Math.max(peakOf(from), peakOf(ev.detail)) : 0;
      let maxW = 0;
      let bone = -1;
      let minBind = Infinity;
      let minWeight = Infinity;
      let maxTurn = 0;
      let maxAccel = 0;
      let at = -1;
      for (let k = a; k <= b; k += 1) {
        if (this.sBoneW[k]! > maxW) {
          maxW = this.sBoneW[k]!;
          bone = this.sBone[k]!;
          at = k;
        }
        minBind = Math.min(minBind, this.sBind[k]!);
        minWeight = Math.min(minWeight, this.sWeight[k]!);
        maxTurn = Math.max(maxTurn, this.sTurn[k]!);
        maxAccel = Math.max(maxAccel, this.sAccel[k]!);
      }
      const refUse = ref > 0 ? ref : at >= 0 ? this.sRef[at]! : 0;
      const ratio = refUse > 0 ? maxW / refUse : 0;
      transitions.push({
        f: ev.f,
        t: ev.t,
        kind: ev.kind,
        detail: ev.detail,
        from: ev.kind === "clip" ? from : "",
        maxBoneDegS: r1(maxW),
        bone: bone >= 0 ? this.boneNames[bone] : "",
        atF: at,
        refPeakDegS: r1(refUse),
        ratio: r3(ratio),
        pass: ev.kind !== "clip" || ratio <= G.transitionRatio,
        minBindRmsDeg: r1(minBind),
        nearBind: minBind < this.nearBindDeg,
        minWeightSum: r3(minWeight),
        maxTurnDegS: r1(maxTurn),
        maxAccelMps2: r1(maxAccel),
      });
    }
    // Feet, root, bind.
    let planted = 0;
    let slideOver = 0;
    let slideMax = 0;
    const slides: number[] = [];
    let penMax = 0;
    let nearBind = 0;
    let minBind = Infinity;
    let maxTurn = 0;
    let snaps = 0;
    let teleports = 0;
    let maxSpeed = 0;
    let maxRatio = 0;
    let maxRatioF = -1;
    for (let k = 1; k < n; k += 1) {
      const s = this.sSlide[k]!;
      if (s >= 0) {
        planted += 1;
        slides.push(s);
        if (s > G.footSlideMps) slideOver += 1;
        slideMax = Math.max(slideMax, s);
      }
      penMax = Math.max(penMax, this.sPen[k]!);
      if (this.sBind[k]! < this.nearBindDeg) nearBind += 1;
      minBind = Math.min(minBind, this.sBind[k]!);
      maxTurn = Math.max(maxTurn, this.sTurn[k]!);
      if (this.sTurn[k]! > G.snapTurnDegS) snaps += 1;
      if (this.sSpeed[k]! > G.teleportMps) teleports += 1;
      maxSpeed = Math.max(maxSpeed, this.sSpeed[k]!);
      if (this.sRatio[k]! > maxRatio) {
        maxRatio = this.sRatio[k]!;
        maxRatioF = k;
      }
    }
    slides.sort((p, q) => p - q);
    const p95 = slides.length > 0 ? slides[Math.min(slides.length - 1, Math.floor(slides.length * 0.95))]! : 0;
    const stances: number[] = [];
    for (let k = 1; k < n; k += 1) if (this.sStance[k]! >= 0) stances.push(this.sStance[k]!);
    stances.sort((p, q) => p - q);
    const stanceQ = (x: number): number => (stances.length > 0 ? r3(stances[Math.min(stances.length - 1, Math.floor(stances.length * x))]!) : 0);
    const clipTr = transitions.filter((t) => t.kind === "clip");
    // Frame a to frame b in ms on the probe's own clock (any step size).
    const ms = (a: number, b: number): number => (a >= 0 && b >= 0 && a < n && b < n ? Math.round((this.sT[b]! - this.sT[a]!) * 1000) : -1);
    const releases = this.releases.map((r) => ({
      ...r,
      keyToVfxMs: ms(r.lastKeyF, r.vfxF),
      keyToBodyMs: ms(r.lastKeyF, r.bodyF),
      vfxToBodyMs: ms(r.vfxF, r.bodyF),
    }));
    const layerRows = this.layers.map((L) => ({ name: L.name, kind: ["sprite", "beam", "ribbon", "sigil", "other"][L.kind], flash: L.flash, popsOn: L.popsOn, popsOff: L.popsOff, popsScale: L.popsScale, flashOn: L.flashOn, maxEnergy: r3(L.maxEnergy) }));
    const popRows: Record<string, unknown>[] = [];
    for (let k = 0; k < Math.min(this.pops, 2000); k += 1) {
      const li = this.popL[k]!;
      popRows.push({ f: this.popF[k], layer: li < this.layers.length ? this.layers[li]!.name : "blades", kind: POP_KINDS[this.popK[k]!], a: r3(this.popA[k]!), b: r3(this.popB[k]!) });
    }
    const series = (arr: Float32Array | Int16Array, round = r3): number[] => Array.from(arr.subarray(0, n), (x) => round(x));
    // Per scenario phase (between "phase" markers).
    const marks = this.events.filter((e) => e.kind === "phase");
    const phases = marks.map((ev, i) => {
      const a = Math.min(n, ev.f);
      const b = Math.min(n, i + 1 < marks.length ? marks[i + 1]!.f : n);
      const sl: number[] = [];
      const st: number[] = [];
      let ratio = 0;
      let turn = 0;
      let speed = 0;
      let bind = Infinity;
      let near = 0;
      let pen = 0;
      for (let k = Math.max(1, a); k < b; k += 1) {
        if (this.sSlide[k]! >= 0) sl.push(this.sSlide[k]!);
        if (this.sStance[k]! >= 0) st.push(this.sStance[k]!);
        ratio = Math.max(ratio, this.sRatio[k]!);
        turn = Math.max(turn, this.sTurn[k]!);
        speed = Math.max(speed, this.sSpeed[k]!);
        bind = Math.min(bind, this.sBind[k]!);
        if (this.sBind[k]! < this.nearBindDeg) near += 1;
        pen = Math.max(pen, this.sPen[k]!);
      }
      sl.sort((p, q) => p - q);
      const q = (x: number): number => (sl.length > 0 ? r3(sl[Math.min(sl.length - 1, Math.floor(sl.length * x))]!) : 0);
      const pops: Record<string, number> = {};
      for (let k = 0; k < this.pops; k += 1) {
        const pf = this.popF[k]!;
        if (pf < a || pf >= b) continue;
        const li = this.popL[k]!;
        const kind = POP_KINDS[this.popK[k]!]!;
        if (kind === "flash-on") continue;
        const key = li < this.layers.length ? "layer-" + kind : kind;
        pops[key] = (pops[key] ?? 0) + 1;
      }
      return {
        phase: ev.detail,
        f0: a,
        f1: b,
        plantedFrames: sl.length,
        slideP50: q(0.5),
        slideP95: q(0.95),
        slideMax: q(1),
        slideOverGate: sl.filter((x) => x > G.footSlideMps).length,
        stanceFrames: st.length,
        stanceP95: st.length > 0 ? r3(st.sort((p, q) => p - q)[Math.min(st.length - 1, Math.floor(st.length * 0.95))]!) : 0,
        stanceOverGate: st.filter((x) => x > G.footSlideMps).length,
        maxRatio: r3(ratio),
        maxTurnDegS: r1(turn),
        maxSpeedMps: r3(speed),
        minBindRmsDeg: r1(bind),
        nearBindFrames: near,
        maxPenetrationPct: r3((pen / (this.setup?.heightM ?? 1)) * 100),
        pops,
      };
    });
    const fair = this.fairPops(n);
    let layerPopsOff = 0;
    let layerPopsOn = 0;
    for (const L of this.layers) {
      layerPopsOff += L.popsOff;
      layerPopsOn += L.popsOn + L.popsScale;
    }
    return {
      meta: {
        frames: this.f,
        recorded: n,
        timeS: r3(this.time),
        bones: this.bones.length,
        heightM: this.setup?.heightM ?? 0,
        nearBindDeg: r1(this.nearBindDeg),
        gates: G,
        notes: [
          "ratio: max bone local angular velocity / max clip peak of the clips involved (from, to); clip peaks sampled off-line at 240 Hz",
          "boneRatio (series): per-bone velocity / that bone's peak in the active clips, floor 90 deg/s",
          "foot slide: slower of ankle and ball horizontal speed while the foot is within 4 cm of its Idle standing height, on two planted frames running",
          "stance slide: the same speed for the lower foot only (the one bearing the weight), while it stays the lower one; a low swing foot in a shuffling walk is not counted",
          "penetration: joint drop below its Idle standing height (ankle, ball), a joint proxy for the mesh",
          "silhouette: mean distance of 12 key joints in caster space, charge pose (frame before the last key) vs the body release frame, % of height",
          "vfx energy: sprites alpha x size^2, beams luminance x width x length, ribbons alpha x (1 - t) x length, sigils fade x (glow + ink) x reveal",
          "layer pop: a layer's energy changes in one frame by more than 30 % of its full level (running peak, halving each second); rises of flash layers are flash-on (allowed); scale: a sigil's world scale jumps by more than 30 %",
          "fair layer pop (summary.vfx.fair, fairPops): falls as above; a rise is judged against max(the running peak before it, the highest level within " + RISE_LOOKAHEAD_S + " s after it), so a fade-in from nothing is not a pop unless one frame adds more than 30 % of the level it reaches",
          "blade pops, per blade life: appears above 30 % of its full (peak) length, vanishes above 30 %, or changes length by more than 30 % of it in one frame; snaps: direction turns more than 30 deg in one frame; jumps: centre moves more than 3 m in one frame",
          "weights: only scheduled actions count (three keeps weight 1 on actions never played); weightSum reads three's last effective weights, so on the frame a clip finishes it can miss the dip: bindRms is the ground truth; the angular velocity scale holds a clip for 0.2 s after it drops out",
          "transition window: one frame before the change to 0.2 s after it; ratio vs max(peak of from, peak of to) for clip changes",
        ],
      },
      clips: this.clipInfo,
      summary: {
        transitions: {
          count: clipTr.length,
          over: clipTr.filter((t) => t.pass === false).length,
          maxRatio: r3(Math.max(0, ...clipTr.map((t) => t.ratio as number))),
          nearBind: clipTr.filter((t) => t.nearBind === true).length,
        },
        frameRatioMax: { ratio: r3(maxRatio), f: maxRatioF },
        bind: { minRmsDeg: r1(minBind), nearBindFrames: nearBind },
        feet: {
          plantedFrames: planted,
          maxSlideMps: r3(slideMax),
          p95SlideMps: r3(p95),
          framesOverGate: slideOver,
          maxPenetrationPct: r3((penMax / (this.setup?.heightM ?? 1)) * 100),
          stanceFrames: stances.length,
          stanceP50Mps: stanceQ(0.5),
          stanceP95Mps: stanceQ(0.95),
          stanceMaxMps: stanceQ(1),
          stanceOverGate: stances.filter((x) => x > G.footSlideMps).length,
        },
        root: { maxSpeedMps: r3(maxSpeed), maxTurnDegS: r1(maxTurn), snapFrames: snaps, teleportFrames: teleports },
        loopSeamsCm: Object.fromEntries(this.clipInfo.filter((c) => c.loop).map((c) => [c.key, c.seamCm])),
        releases: {
          count: releases.length,
          keyToVfxMsMax: Math.max(-1, ...releases.map((r) => r.keyToVfxMs)),
          keyToBodyMsMax: Math.max(-1, ...releases.map((r) => r.keyToBodyMs)),
          overGate: releases.filter((r) => r.keyToBodyMs > G.keyToReleaseMs || r.keyToVfxMs > G.keyToReleaseMs).length,
          silhouetteUnderGate: releases.filter((r) => r.silhouettePct >= 0 && r.silhouettePct < G.silhouettePct).length,
          strikeUnderGate: releases.filter((r) => r.strikePct >= 0 && r.strikePct < G.silhouettePct).length,
        },
        vfx: { layerPopsOff, layerPopsOnOrScale: layerPopsOn, blades: this.bladeCounts, logged: this.pops, fair: fair.summary },
      },
      phases,
      transitions,
      releases,
      events: this.events,
      layers: layerRows,
      pops: popRows,
      fairPops: fair.rows,
      series: {
        t: series(this.sT),
        dt: series(this.sDt, (x) => Math.round(x * 1e5) / 1e5),
        rootSpeed: series(this.sSpeed),
        rootAccel: series(this.sAccel, r1),
        rootTurn: series(this.sTurn, r1),
        boneW: series(this.sBoneW, r1),
        bone: Array.from(this.sBone.subarray(0, n)),
        refPeak: series(this.sRef, r1),
        ratio: series(this.sRatio),
        boneRatio: series(this.sBoneRatio),
        bindRms: series(this.sBind, r1),
        weightSum: series(this.sWeight),
        footSlide: series(this.sSlide),
        stanceSlide: series(this.sStance),
        footPen: series(this.sPen),
        footRelL: series(this.sFootL),
        footRelR: series(this.sFootR),
        vfxEnergy: series(this.sVfx),
        pops: Array.from(this.sPops.subarray(0, n)),
        layerEnergy: Object.fromEntries(
          this.layers.map((L, li) => {
            const nl = this.layers.length;
            const out: number[] = new Array(n);
            for (let f = 0; f < n; f += 1) out[f] = r3(this.layerE[f * nl + li]!);
            return [L.name, out];
          }),
        ),
      },
      boneNames: this.boneNames,
    };
  }
}

/** Points per ribbon from the strip index (quad p of ribbon r starts at vertex (r·n + p)·2). */
function ribbonPoints(g: THREE.BufferGeometry): number {
  const index = g.getIndex();
  if (index === null) return 0;
  const a = index.array;
  for (let q = 1; q * 6 < a.length; q += 1) {
    if (a[q * 6]! !== a[(q - 1) * 6]! + 2) return a[q * 6]! / 2;
  }
  return 0;
}
