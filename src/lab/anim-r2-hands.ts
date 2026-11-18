/** Ticket 403: staged seal inspection and segment-distance probe; no second mixer or rig edits. */
import * as THREE from "three";
import { segmentDistance } from "./anim-r3-geometry";
export { segmentDistance } from "./anim-r3-geometry";
import type { Animator } from "./anim/animator";
import { BODY_BONES, type Euler3, type HandShape, type KeyPose } from "./anim/key-pose";
import { R3Hands } from "./anim-r3-poses";
import { FINGERS, R2Author, SEAL_HANDS, SEAL_NAMES } from "./anim-r2-poses";

const ROUTE = "anim-r2-seal-view";
const ease = (t: number): number => { const u = THREE.MathUtils.clamp(t, 0, 1); return u * u * (3 - 2 * u); };

export class SealInspector {
  id = -1;
  readonly reference: R3Hands;
  private age = 0;
  private readonly parentRest: THREE.Quaternion[];
  private readonly names: string[];
  private readonly snapshotQ: THREE.Quaternion[];
  private readonly snapshotP: THREE.Vector3[];
  private readonly previousQ: THREE.Quaternion[];
  private readonly previousPelvis: THREE.Vector3;
  private blendAge = 1;
  private readonly q = new THREE.Quaternion();
  private readonly t = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  constructor(private readonly anim: Animator, private readonly author: R2Author) {
    const rig = anim.rig, root = author.root;
    this.reference = new R3Hands(rig, root);
    this.names = [...BODY_BONES, ...["r", "l"].flatMap(side => FINGERS.flatMap(f => [1, 2, 3].map(j => `${f}_0${j}_${side}`)))];
    this.snapshotQ = this.names.map(() => new THREE.Quaternion());
    this.snapshotP = this.names.map(() => new THREE.Vector3());
    this.previousQ = this.names.map(name => anim.rig.bone(name)!.quaternion.clone());
    this.previousPelvis = anim.rig.bone("pelvis")!.position.clone();
    const savedQ = new Float32Array(rig.count * 4), savedP = new Float32Array(rig.count * 3);
    rig.readPose(savedQ, savedP); rig.writePose(rig.restQ, rig.restP); root.updateMatrixWorld(true);
    const inv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.parentRest = this.names.map(name => {
      const parent = rig.bone(name)?.parent;
      return parent ? parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv) : new THREE.Quaternion();
    });
    rig.writePose(savedQ, savedP); root.updateMatrixWorld(true);
    const update = anim.keyPoses.update.bind(anim.keyPoses);
    anim.keyPoses.update = dt => {
      if (this.id >= 0) {
        this.age += dt;
        // Separate fingers, separate wrists, rotate into the new seal, then close the fingers.
        const stage = Math.min(3, Math.floor(this.age / .07));
        const phase = Math.min(4, stage + ease((this.age - stage * .07) / .07));
        anim.keyPoses.freeze(ROUTE, phase);
      }
      update(dt);
    };
    const apply = anim.keyPoses.apply.bind(anim.keyPoses);
    anim.keyPoses.apply = (dt, scale = 1) => {
      apply(dt, scale);
      const blending = this.blendAge < .18;
      if (blending) this.blendAge += dt;
      const u = blending ? ease(this.blendAge / .18) : 1;
      this.names.forEach((name, i) => {
        const b = rig.bone(name); if (!b) return;
        if (blending) b.quaternion.slerp(this.snapshotQ[i]!, 1 - u);
        // Pelvis only: fingers/limbs retain the original rig lengths.
        if (blending && name === "pelvis") b.position.lerp(this.snapshotP[i]!, 1 - u);
        // Measured burst switches exceeded the source peak. Bound this instance's shown angular speed,
        // independent of Hz; a release still starts moving on its first frame.
        if (anim.keyPoses.slotId.startsWith("anim-r")) {
          const angle = b.quaternion.angleTo(this.previousQ[i]!);
          const max = Math.max(0, dt) * Math.PI * (name === "pelvis" ? 1 : 10);
          if (angle > max && angle > 1e-8) b.quaternion.slerp(this.previousQ[i]!, 1 - max / angle);
          if (name === "pelvis") {
            const delta = b.position.distanceTo(this.previousPelvis);
            const maxShift = .15 * Math.max(0, dt) / (b.parent?.matrixWorld.getMaxScaleOnAxis() || 1);
            if (delta > maxShift && delta > 1e-8) b.position.lerp(this.previousPelvis, 1 - maxShift / delta);
          }
        }
        if (name === "pelvis") this.previousPelvis.copy(b.position);
        this.previousQ[i]!.copy(b.quaternion);
      });
      this.reference.apply(dt);
      // The next combat/exit frame must limit from the pose actually shown by R3.
      if (this.reference.id >= 0) this.names.forEach((name, i) => {
        const b = rig.bone(name); if (b) this.previousQ[i]!.copy(b.quaternion);
      });
    };
  }
  private snapshot(): void {
    this.names.forEach((name, i) => {
      const b = this.anim.rig.bone(name); if (!b) return;
      this.snapshotQ[i]!.copy(b.quaternion); this.snapshotP[i]!.copy(b.position);
    });
  }
  private current(): { pose: KeyPose; hands: HandShape } {
    const rig = this.anim.rig, absolute = new Map<string, THREE.Quaternion>();
    const body: Record<string, Euler3> = {}, hands: Record<string, Euler3> = {};
    this.names.forEach((name, i) => {
      const b = rig.bone(name); if (!b) throw new Error(`403 missing bone ${name}`);
      const P = this.parentRest[i]!;
      this.t.fromArray(rig.restQ, rig.find(name) * 4).invert();
      this.q.copy(P).multiply(b.quaternion).multiply(this.t).multiply(this.t.copy(P).invert());
      if (BODY_BONES.includes(name)) {
        for (let parent = b.parent; parent; parent = parent.parent) {
          const a = absolute.get(parent.name); if (a) { this.q.premultiply(a); break; }
        }
        absolute.set(name, this.q.clone());
      }
      this.e.setFromQuaternion(this.q, "YZX");
      const v: Euler3 = [this.e.x * 180 / Math.PI, this.e.y * 180 / Math.PI, this.e.z * 180 / Math.PI];
      (BODY_BONES.includes(name) ? body : hands)[name] = v;
    });
    return { pose: { name: "Shown pose", body, hips: [.035, 0, 0], hands: ["shown", "shown"], stance: null }, hands };
  }
  select(id: number): void {
    const index = ((Math.trunc(id) % 10) + 10) % 10;
    const shown = this.current(), target = this.author.author.pose(this.author.seal(index));
    const bridge = this.author.author.pose(this.author.bridge());
    this.snapshot(); this.blendAge = 0;
    this.anim.keyPoses.unfreeze();
    this.anim.keyPoses.add(ROUTE, { id: ROUTE, name: `S${index} · ${SEAL_NAMES[index]}`,
      hands: { ...SEAL_HANDS, shown: shown.hands },
      poses: [shown.pose, { ...shown.pose, hands: ["open", "open"] }, bridge,
        { ...target, hands: ["open", "open"] }, target, target],
      releaseS: .18, holdS: .1, holdDrift: 0, followS: .1, settleS: .1, settleBack: 0, recoverS: .34,
      circle: { torso: 0, arm: 0, wrist: 0, hz: .4 }, armBone: "upperarm_r", wristBone: "hand_r" });
    this.reference.select(index);
    this.id = index; this.age = 0;
    this.anim.keyPoses.freeze(ROUTE, 0);
    this.anim.charge(ROUTE, "attack", .01, 9, this.anim.poseTarget.x, this.anim.poseTarget.z);
  }
  exit(): void {
    if (this.id < 0) return;
    this.snapshot(); this.blendAge = 0;
    this.id = -1; this.reference.exit();
    this.anim.keyPoses.unfreeze();
  }
  get settled(): boolean { return this.reference.settled; }
}


export class FingerProbe {
  private readonly points: { name: string; bone: THREE.Bone; p: THREE.Vector3 }[];
  private readonly segments: { a: number; b: number; finger: string; name: string }[] = [];
  private readonly pairs: [number, number][] = [];
  minM = Infinity;
  worst: { a: string; b: string; distanceM: number; frame: number } | null = null;
  frames = 0;
  violations = 0;
  constructor(anim: Animator) {
    this.points = [];
    for (const side of ["r", "l"]) for (const finger of FINGERS) {
      const start = this.points.length;
      for (let j = 1; j <= 4; j++) {
        const name = j === 4 ? `${finger}_04_leaf_${side}` : `${finger}_0${j}_${side}`;
        const bone = anim.rig.bone(name); if (!bone) throw new Error(`403 missing ${name}`);
        this.points.push({ name, bone, p: new THREE.Vector3() });
      }
      for (let j = 0; j < 3; j++) this.segments.push({ a: start + j, b: start + j + 1, finger: `${finger}_${side}`, name: `${finger}_${j + 1}_${side}` });
    }
    for (let i = 0; i < this.segments.length; i++) for (let j = i + 1; j < this.segments.length; j++)
      if (this.segments[i]!.finger !== this.segments[j]!.finger) this.pairs.push([i, j]);
  }
  sample(): number {
    this.frames++;
    this.points.forEach(p => p.bone.getWorldPosition(p.p));
    let min = Infinity;
    for (const [i, j] of this.pairs) {
      const a = this.segments[i]!, b = this.segments[j]!;
      const distanceM = segmentDistance(this.points[a.a]!.p, this.points[a.b]!.p, this.points[b.a]!.p, this.points[b.b]!.p);
      min = Math.min(min, distanceM);
      if (distanceM < this.minM) { this.minM = distanceM; this.worst = { a: a.name, b: b.name, distanceM, frame: this.frames }; }
    }
    if (min < .004) this.violations++;
    return min;
  }
  report(): object {
    return { frames: this.frames, segmentPairsPerFrame: this.pairs.length, minMm: this.minM * 1000, violations: this.violations, worst: this.worst,
      method: "All 3 phalange centreline segments per finger, including tips and cross-hand pairs; not a skin-surface collision proof" };
  }
}
