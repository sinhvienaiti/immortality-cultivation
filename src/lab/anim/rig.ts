/**
 * Rig access for the lab Animator: bones in parent-first order, rest pose,
 * a clip sampler that writes a pose into flat arrays (no mixer), and FK
 * helpers. Bone names follow the UE-mannequin set that Lam and Mesh2Motion
 * share (pelvis, spine_01…03, neck_01, head, clavicle/upperarm/lowerarm/hand,
 * thigh/calf/foot/ball); the Animator only needs names, so a later hero
 * with the same names reuses it (MOTION_PLAN step 5, "Animator separate
 * from the rig").
 */
import * as THREE from "three";

export class Rig {
  readonly bones: THREE.Bone[] = [];
  readonly names: string[] = [];
  readonly index = new Map<string, number>();
  /** Parent bone index, −1 for a bone whose parent is not a bone. */
  readonly parent: Int16Array;
  /** Rest local rotation (x y z w) and position per bone, read at load. */
  readonly restQ: Float32Array;
  readonly restP: Float32Array;

  constructor(readonly model: THREE.Object3D) {
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.index.set(o.name, this.bones.length);
        this.bones.push(o as THREE.Bone);
        this.names.push(o.name);
      }
    });
    const n = this.bones.length;
    this.parent = new Int16Array(n).fill(-1);
    this.restQ = new Float32Array(n * 4);
    this.restP = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const b = this.bones[i]!;
      const p = b.parent;
      if (p && (p as THREE.Bone).isBone) this.parent[i] = this.index.get(p.name) ?? -1;
      b.quaternion.toArray(this.restQ, i * 4);
      b.position.toArray(this.restP, i * 3);
    }
  }

  get count(): number {
    return this.bones.length;
  }

  /** Bone index by name, −1 when missing. */
  find(name: string): number {
    return this.index.get(name) ?? -1;
  }

  bone(name: string): THREE.Bone | null {
    const i = this.find(name);
    return i >= 0 ? this.bones[i]! : null;
  }

  /** Writes a pose (quaternions, positions) into the bones. */
  writePose(q: Float32Array, p: Float32Array): void {
    const bones = this.bones;
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i]!;
      b.quaternion.set(q[i * 4]!, q[i * 4 + 1]!, q[i * 4 + 2]!, q[i * 4 + 3]!);
      b.position.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
    }
  }

  /** Reads the bones' current local pose. */
  readPose(q: Float32Array, p: Float32Array): void {
    const bones = this.bones;
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i]!;
      b.quaternion.toArray(q, i * 4);
      b.position.toArray(p, i * 3);
    }
  }

  restPose(q: Float32Array, p: Float32Array): void {
    q.set(this.restQ);
    p.set(this.restP);
  }
}

/** Track kinds of a Writer. */
const QUAT = 0;
const POS = 1;

interface Writer {
  bone: number;
  kind: number;
  interp: THREE.Interpolant;
}

/** Evaluates a clip into flat pose arrays without a mixer (FK analysis, inertialization velocities, additive layers). */
export class ClipSampler {
  private readonly writers: Writer[] = [];
  readonly duration: number;

  constructor(
    readonly clip: THREE.AnimationClip,
    rig: Rig,
  ) {
    this.duration = clip.duration;
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const bone = rig.find(parsed.nodeName);
      if (bone < 0) continue;
      const prop = parsed.propertyName;
      if (prop === "quaternion") this.writers.push({ bone, kind: QUAT, interp: track.createInterpolant() });
      else if (prop === "position") this.writers.push({ bone, kind: POS, interp: track.createInterpolant() });
    }
  }

  /** Whether the clip animates bone `i`'s rotation. */
  animates(i: number): boolean {
    for (const w of this.writers) if (w.bone === i && w.kind === QUAT) return true;
    return false;
  }

  /** Writes the clip pose at time `t` (clamped) into q (bones × 4) and p (bones × 3); bones it does not animate are left as they are. */
  sample(t: number, q: Float32Array, p: Float32Array): void {
    const tt = t < 0 ? 0 : t > this.duration ? this.duration : t;
    for (const w of this.writers) {
      const v = w.interp.evaluate(tt) as ArrayLike<number>;
      if (w.kind === QUAT) {
        const o = w.bone * 4;
        q[o] = v[0]!;
        q[o + 1] = v[1]!;
        q[o + 2] = v[2]!;
        q[o + 3] = v[3]!;
      } else {
        const o = w.bone * 3;
        p[o] = v[0]!;
        p[o + 1] = v[1]!;
        p[o + 2] = v[2]!;
      }
    }
  }
}

const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

/** World rotation of `o` from its (fresh) world matrix. */
export function worldQuat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(_pos, out, _scl);
  return out;
}

const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();

/**
 * Rotates `bone` by the world-space rotation `d` (L' = P⁻¹·d·P·L, appendix C
 * §2.3), with P the parent's world rotation `parentWorld`. The rig's local
 * axes are not trusted.
 */
export function rotateBoneWorld(bone: THREE.Object3D, parentWorld: THREE.Quaternion, d: THREE.Quaternion): void {
  _pqi.copy(parentWorld).invert();
  _pq.copy(d).multiply(parentWorld); // d·P
  bone.quaternion.premultiply(_pq).premultiply(_pqi);
}
