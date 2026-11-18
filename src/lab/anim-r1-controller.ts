/** Ticket 397: isolated input/marker adapter. No gameplay authority, timers or second mixer. */
import * as THREE from "three";
import type { Animator } from "./anim/animator";
import { criticalSpring, DEG, wrapPi } from "./anim/math";
import { R1_SLOT, swordASkill } from "./anim-r1-poses";
import { FAMILY_SLOT, FAMILY_WORD, FAMILIES, R2Author, type Family } from "./anim-r2-poses";
import { R3_NAMES } from "./anim-r3-poses";
import { FingerProbe, SealInspector } from "./anim-r2-hands";

const SIDES = ["l", "r"] as const;
const CURL_FINGERS = ["ring", "pinky"] as const;
const MOTION_BONES = ["pelvis", "upperarm_r", "lowerarm_r", "hand_r"] as const;

export interface R1Release {
  family: Family;
  id: number; keyMs: number; bodyMs: number; fxMs: number | null; drawMs: number | null;
  bodyFrame: number; fxFrame: number | null; drawFrame: number | null; tx: number; tz: number;
  keyPhase: number; motionMs: number | null; motionFrame: number | null; poseApplied: boolean;
  motionAtKey: number[]; motionDeltaRad: number;
}
export interface R1Host {
  now(): number;
  available(): boolean;
  cutStop(): void;
  release(tx: number, tz: number, family: Family): void;
  charge(progress: number, tx: number, tz: number): void;
  prop(visible: boolean): void;
  note(text: string): void;
}

export class AnimR1 {
  active = false;
  family: Family = "sword";
  readonly seals: SealInspector;
  readonly fingers: FingerProbe;
  get slot(): string { return FAMILY_SLOT[this.family]; }
  word = "sword";
  typed = 0;
  mistakes = 0;
  pulseCount = 0;
  readonly pulseKinds: number[] = [];
  readonly releases: R1Release[] = [];
  readonly contacts: { frame: number; timeMs: number; target: number }[] = [];
  frame = 0;
  private id = 0;
  private pending: { id: number; family: Family; keyMs: number; keyPhase: number; tx: number; tz: number; poseApplied: boolean; motionAtKey: number[] } | null = null;
  private drawn: R1Release | null = null;
  private targetX = 0;
  private targetZ = -5;
  private time = 0;
  private readonly energy = new Float64Array(4);
  private readonly spring = new Float64Array(8);
  private readonly q = new THREE.Quaternion();
  private readonly x = new THREE.Vector3(1, 0, 0);
  private readonly y = new THREE.Vector3(0, 1, 0);
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly baseApply: Animator["keyPoses"]["apply"];
  private slowCancel = false;
  private restoreProp = false;

  constructor(readonly anim: Animator, private readonly host: R1Host) {
    anim.keyPoses.add(R1_SLOT, swordASkill(anim.rig, anim.rig.model.parent ?? anim.rig.model));
    const author = new R2Author(anim.rig, anim.rig.model.parent ?? anim.rig.model);
    for (const family of ["palm", "array"] as const) anim.keyPoses.add(FAMILY_SLOT[family], author.family(family));
    // This per-instance hook is the existing extension point immediately before foot IK.
    // Always evaluate the original pose first; the idle source and other slots retain their normal path.
    this.baseApply = anim.keyPoses.apply.bind(anim.keyPoses);
    const baseUpdate = anim.keyPoses.update.bind(anim.keyPoses);
    anim.keyPoses.update = dt => {
      // The core's 120 ms cancel raises the hips before its 200 ms return step lands.
      // Only this skill's cancellation recovers over 267 ms; release timing is unaffected.
      baseUpdate(dt * (this.slowCancel && Object.values(FAMILY_SLOT).includes(anim.keyPoses.slotId) && anim.keyPoses.stage === "recover" ? 0.45 : 1));
    };
    anim.keyPoses.apply = (dt, scale = 1) => {
      const aim = anim.keyPoses.aimErr;
      // The generic sword cheat turns only the left clavicle. A two-hand seal must turn as one unit.
      if (anim.keyPoses.slotId.startsWith("anim-r")) anim.keyPoses.aimErr = 0;
      this.baseApply(dt, scale);
      anim.keyPoses.aimErr = aim;
      this.layers(dt, scale);
      if (this.pending && anim.keyPoses.slotId === FAMILY_SLOT[this.pending.family] && anim.keyPoses.releaseAge >= 0)
        this.pending.poseApplied = true;
    };
    this.seals = new SealInspector(anim, author);
    this.fingers = new FingerProbe(anim);
  }

  begin(word = "sword"): void {
    if (!this.host.available()) { this.host.note("Sword A: resume the lab and finish the cut-in before F2"); return; }
    const kp = this.anim.keyPoses;
    if (kp.active && !Object.values(FAMILY_SLOT).includes(kp.slotId) && this.seals.id < 0) { this.host.note("Animation lab: let the previous authored skill settle, then press F2"); return; }
    // The core retains a spacing flag after other authored skills. Reset only an already idle poser.
    if (!kp.active) kp.reset();
    if (!/^[a-z]{3,12}$/.test(word)) throw new Error("Round 1 expects an English word of 3–12 letters");
    this.active = true;
    this.seals.exit();
    this.word = word;
    this.host.cutStop();
    this.cancel();
    this.host.prop(false);
    this.restoreProp = false;
    this.show();
  }

  stop(): void {
    if (!this.active) return;
    this.seals.exit(); this.cancel();
    this.active = false;
    this.restoreProp = true;
    this.host.note("Animation lab: off · F2 to type again");
  }

  select(family: Family): void {
    if (!FAMILIES.includes(family) || !this.host.available() || this.pending) return;
    if (!this.active) this.begin(FAMILY_WORD[family]);
    if (!this.active) return;
    this.seals.exit();
    this.host.charge(-1, this.targetX, this.targetZ);
    this.family = family; this.word = FAMILY_WORD[family]; this.typed = 0;
    this.slowCancel = false; this.energy.fill(0);
    // Enter from the saved shown pose; FootLock retains the planted rear foot across families.
    this.anim.charge(this.slot, "attack", 0, this.word.length, this.targetX, this.targetZ);
    this.show();
  }

  inspect(id: number): void {
    if (!Number.isFinite(id) || !this.host.available() || this.pending) return;
    if (!this.active) this.begin();
    if (!this.active) return;
    this.cancel(); this.seals.select(id); this.show();
  }

  cancel(): void {
    this.seals.exit();
    this.pending = null;
    this.drawn = null;
    this.typed = 0;
    this.slowCancel = true;
    this.anim.cancelCharge();
    this.host.charge(-1, this.targetX, this.targetZ);
    this.energy.fill(0);
    this.show();
  }

  retarget(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.targetX = x;
    this.targetZ = z;
    // No charge() here: changing a target is not another accepted letter or pulse.
    this.anim.poseTarget.x = x;
    this.anim.poseTarget.z = z;
    this.anim.castFace(x, z);
    this.anim.lookAt(x, 1.25, z, 1);
  }

  /** Accepted Latin text only. The keyboard adapter rejects composition, repeat, paste and modifiers. */
  text(key: string, stamp = this.host.now()): void {
    if (!this.active) return;
    if (key === "Escape") { this.cancel(); return; }
    if (this.pending || !this.host.available()) return;
    if (this.seals.id >= 0) return;
    if (key === "Backspace") {
      this.slowCancel = false;
      this.typed = Math.max(0, this.typed - 1);
      // KeyPoser's charge goal is monotonic. Re-enter from its saved shown pose on a correction.
      this.anim.keyPoses.cancel();
      if (this.typed > 0) this.charge();
      else this.anim.cancelCharge();
      this.show();
      return;
    }
    if (!/^[a-z]$/i.test(key)) return;
    if (this.typed >= this.word.length) this.typed = 0;
    if (key.toLowerCase() !== this.word[this.typed]) {
      this.mistakes++;
      this.energy[3] = Math.min(1.4, this.energy[3]! + 0.8);
      this.show();
      return;
    }
    const kind = this.pulseCount++ % 3;
    this.pulseKinds.push(kind);
    if (this.pulseKinds.length > 300) this.pulseKinds.shift();
    this.energy[kind] = Math.min(1.6, this.energy[kind]! + 0.8);
    this.typed++;
    this.slowCancel = false;
    if (this.typed < this.word.length) this.charge();
    else {
      this.pending = { id: ++this.id, family: this.family, keyMs: stamp, keyPhase: this.anim.keyPoses.phase,
        tx: this.targetX, tz: this.targetZ, poseApplied: false,
        motionAtKey: MOTION_BONES.flatMap(name => this.anim.rig.bone(name)!.quaternion.toArray()) };
      this.host.cutStop();
      this.anim.release(this.slot, "attack", this.targetX, this.targetZ, true);
    }
    this.show();
  }

  private charge(): void {
    this.anim.charge(this.slot, "attack", this.typed / this.word.length,
      this.word.length - this.typed, this.targetX, this.targetZ);
  }

  /** Called once just after the body/IK update, before the host's VFX update. */
  afterBody(advanced = true): void {
    this.frame++;
    if (this.active) { this.anim.rig.model.updateWorldMatrix(true, true); this.fingers.sample(); }
    if (this.restoreProp && !this.anim.keyPoses.active) { this.host.prop(true); this.restoreProp = false; }
    const latest = this.releases.at(-1);
    if (latest && latest.motionMs === null && this.anim.keyPoses.slotId === FAMILY_SLOT[latest.family] &&
      this.anim.keyPoses.releaseAge >= 0 && this.anim.keyPoses.weight > 0.01 && this.anim.keyPoses.phase > latest.keyPhase + 0.002 && this.motionDelta(latest.motionAtKey) > .0001) {
      latest.motionDeltaRad = this.motionDelta(latest.motionAtKey);
      latest.motionMs = this.host.now(); latest.motionFrame = this.frame;
    }
    const p = this.pending;
    if (this.active && this.seals.id < 0 && this.anim.keyPoses.slotId === this.slot && this.anim.keyPoses.stage === "charge")
      this.host.charge(this.typed / this.word.length, this.targetX, this.targetZ);
    if (!p || !advanced || !p.poseApplied || !this.host.available()) return;
    this.pending = null;
    const r: R1Release = { ...p, bodyMs: this.host.now(), bodyFrame: this.frame,
      fxMs: null, fxFrame: null, drawMs: null, drawFrame: null, motionMs: null, motionFrame: null, motionDeltaRad: this.motionDelta(p.motionAtKey) };
    if (this.anim.keyPoses.weight > 0.01 && this.anim.keyPoses.phase > p.keyPhase + 0.002 && r.motionDeltaRad > .0001) {
      r.motionMs = r.bodyMs; r.motionFrame = this.frame;
    }
    this.releases.push(r);
    if (this.releases.length > 200) this.releases.shift();
    this.drawn = r;
    this.host.release(p.tx, p.tz, p.family);
    r.fxMs = this.host.now();
    r.fxFrame = this.frame;
  }

  afterDraw(): void {
    if (!this.drawn) return;
    this.drawn.drawMs = this.host.now();
    this.drawn.drawFrame = this.frame;
    this.drawn = null;
  }

  /** Contact is the existing projectile's actual impact, never a guessed clip timer. */
  hit(target: number): void {
    // The shared k1 bus has no per-projectile cast id: keep an honest chronological contact log.
    if (this.active) this.contacts.push({ frame: this.frame, timeMs: this.host.now(), target });
    if (this.contacts.length > 400) this.contacts.shift();
  }

  private turn(name: string, axis: THREE.Vector3, deg: number): void {
    this.anim.rig.bone(name)?.quaternion.multiply(this.q.setFromAxisAngle(axis, deg * DEG));
  }

  private motionDelta(reference: number[]): number {
    let delta = 0;
    MOTION_BONES.forEach((name, i) => { delta = Math.max(delta,
      this.anim.rig.bone(name)!.quaternion.angleTo(this.q.fromArray(reference, i * 4))); });
    return delta;
  }

  private layers(dt: number, scale: number): void {
    this.time += dt;
    for (let i = 0; i < 4; i++) {
      this.energy[i] = this.energy[i]! * Math.exp(-dt / (i === 3 ? 0.11 : 0.075));
      criticalSpring(this.spring, i * 2, this.energy[i]!, 0.025, dt);
    }
    const kp = this.anim.keyPoses;
    if (!this.active || kp.slotId !== this.slot || !kp.active) return;
    const weight = kp.weight * scale;
    const wrist = this.spring[0]! * 2.2 * weight;
    const elbow = this.spring[2]! * 2.5 * weight;
    const body = this.spring[4]! * 1.7 * weight;
    const error = this.spring[6]! * weight;
    this.turn("hand_l", this.z, wrist - error * 2.2);
    this.turn("lowerarm_r", this.x, elbow - error);
    this.turn("spine_03", this.y, body);
    for (const side of SIDES) {
      const sign = side === "r" ? -1 : 1;
      for (const finger of CURL_FINGERS) this.turn(`${finger}_02_${side}`, this.z, sign * error * 3);
    }
    // Key poses mask the old world layer at full weight. Restore small life after that mask, before IK.
    const breath = Math.sin(this.time * Math.PI * 0.5) * 0.35 * weight;
    this.turn("spine_02", this.x, breath);
    const yaw = Math.atan2(this.targetX - this.anim.loco.showX, this.targetZ - this.anim.loco.showZ);
    const aim = Math.max(-0.75, Math.min(0.75, wrapPi(yaw - this.anim.loco.yaw)));
    this.turn("pelvis", this.z, -aim * 1.5 * weight);
    const headAim = Math.max(-.6, Math.min(.6, aim)) * 180 / Math.PI * weight;
    this.turn("neck_01", this.y, headAim * .45);
    this.turn("head", this.y, headAim * .55);
  }

  report(): object {
    return { active: this.active, family: this.family, seal: this.seals.id, sealSettled: this.seals.settled,
      fingers: this.fingers.report(), word: this.word, typed: this.typed, mistakes: this.mistakes,
      pulseKinds: [...this.pulseKinds], energies: [...this.energy], frame: this.frame,
      phase: this.anim.keyPoses.phase, stage: this.anim.keyPoses.stage,
      contacts: [...this.contacts], contactAttribution: "k1 bus chronology only; no per-cast id",
      releases: this.releases.map(r => ({ ...r, keyToBodyMs: r.bodyMs - r.keyMs,
        keyToMotionMs: r.motionMs === null ? null : r.motionMs - r.keyMs,
        keyToDrawMs: r.drawMs === null ? null : r.drawMs - r.keyMs,
        syncFrames: r.fxFrame === null ? null : r.fxFrame - r.bodyFrame })) };
  }

  private show(): void {
    if (this.active) this.host.note(this.seals.id >= 0
      ? `S${this.seals.id} · ${R3_NAMES[this.seals.id]} · [ / ]: seals · F3: action · F4: front · Shift+F4: compare hands · F2: exit`
      : `${this.family === "sword" ? "Sword A" : this.family === "palm" ? "Palm" : "Ground Array"} · ${this.word.slice(0, this.typed)}|${this.word.slice(this.typed)} · F3: family · [ / ]: seals · F4: front · Backspace / Esc / Tab · F2: exit`);
  }
}
