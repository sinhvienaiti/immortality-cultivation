/**
 * Secondary motion on the tail, ears and bag (MOTION_PLAN step 2.9, appendix
 * C §2.5): small spring chains, our own code. No package: tests/boundary.test.ts
 * allows only three and @fontsource (canon D44), so @pixiv/three-vrm-springbone
 * is not imported (recorded in docs/SYNC_DEBT.md).
 *
 * Each joint's tip is a damped spring (frequency, damping ratio) pulled to
 * where the animated pose puts it, so the clip's own tail motion stays and the
 * spring adds the follow-through. Tips live in the frame of a centre object
 * (the caster root): a dash or a turn does not whip the chain, and a share of
 * the centre's own motion (clamped per step) still trails the tips. Gravity,
 * bone length, sphere and capsule colliders, a cone limit round the animated
 * direction and a turn-rate limit per step (both in the joint's animated frame)
 * keep it calm. Fixed 60 Hz steps; each joint is drawn between its last two
 * steps' directions. No allocation per frame.
 */
import * as THREE from "three";

export interface SpringSettings {
  /** Spring frequency (Hz) and damping ratio towards the animated tip. */
  hz: number;
  zeta: number;
  /** Downward pull (m/s²). */
  gravity: number;
  /** Share of the centre's own motion that trails the tip (0–1). */
  trail: number;
  /** Cone limit round the animated direction (deg) and turn-rate limit (deg/s). */
  maxDeg: number;
  maxDegS: number;
  /** Tip radius for the colliders (m). */
  radius: number;
}

interface Joint {
  readonly bone: THREE.Bone;
  /** Tip in the bone's local frame (the child's position, or the estimated tip of the last bone). */
  readonly tipLocal: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly s: SpringSettings;
  length: number;
  /** Tip and its velocity in centre space. */
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  /** The tip direction in the animated bone frame at the last two steps (the rate limit works on it; drawing blends them). */
  readonly local: THREE.Vector3;
  readonly lastLocal: THREE.Vector3;
  /** This frame's animated local pose. */
  readonly animQ: THREE.Quaternion;
  readonly animM: THREE.Matrix4;
}

interface Collider {
  readonly node: THREE.Object3D;
  readonly a: THREE.Vector3;
  /** Capsule end, null for a sphere. */
  readonly b: THREE.Vector3 | null;
  readonly r: number;
  readonly wa: THREE.Vector3;
  readonly wb: THREE.Vector3;
}

const STEP = 1 / 60;
const MAX_STEPS = 4;
const SETTLE_STEPS = 60;
const DEG = Math.PI / 180;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _head = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _cq = new THREE.Quaternion();

export class SpringChains {
  private readonly joints: Joint[] = [];
  private readonly colliders: Collider[] = [];
  private readonly roots: THREE.Object3D[] = [];
  private acc = 0;
  private ready = false;
  private readonly centerInv = new THREE.Matrix4();
  private readonly centerPrev = new THREE.Matrix4();
  enabled = true;

  /**
   * Multiplies each joint's trail share and the per-step trail clamp (1 normally): the dash raises it so the tail
   * streams behind the glide (motion round 2), within each joint's cone limit.
   */
  trailBoost = 1;

  constructor(private readonly center: THREE.Object3D) {}

  /** A chain parent → child; the last bone's tip is `tipLength` along its +Y (the Blender bone axis). */
  addChain(bones: THREE.Bone[], tipLength: number, settings: (i: number) => SpringSettings): void {
    if (bones.length === 0) return;
    this.roots.push(bones[0]!);
    for (let i = 0; i < bones.length; i += 1) {
      const bone = bones[i]!;
      const child = bones[i + 1];
      const tipLocal = child ? child.position.clone() : new THREE.Vector3(0, tipLength / Math.max(1e-6, bone.scale.y), 0);
      this.joints.push({
        bone,
        tipLocal,
        axis: tipLocal.clone().normalize(),
        s: settings(i),
        length: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        local: tipLocal.clone().normalize(),
        lastLocal: tipLocal.clone().normalize(),
        animQ: new THREE.Quaternion(),
        animM: new THREE.Matrix4(),
      });
    }
  }

  addSphere(node: THREE.Object3D, offset: THREE.Vector3, r: number): void {
    this.colliders.push({ node, a: offset.clone(), b: null, r, wa: new THREE.Vector3(), wb: new THREE.Vector3() });
  }

  addCapsule(node: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    this.colliders.push({ node, a: a.clone(), b: b.clone(), r, wa: new THREE.Vector3(), wb: new THREE.Vector3() });
  }

  /** The next update puts the tips back on the pose and lets them settle (a reset or a teleport). */
  invalidate(): void {
    this.ready = false;
  }

  /**
   * After the base pose, the layers and the foot IK (fresh world matrices):
   * steps the springs at 60 Hz and poses the joints from the tips.
   */
  update(dt: number): void {
    if (!this.enabled || this.joints.length === 0) return;
    for (const j of this.joints) {
      j.animQ.copy(j.bone.quaternion);
      j.animM.compose(j.bone.position, j.animQ, j.bone.scale);
    }
    this.centerInv.copy(this.center.matrixWorld).invert();
    if (!this.ready) {
      this.place();
      for (let k = 0; k < SETTLE_STEPS; k += 1) this.step(false);
      this.ready = true;
    }
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(true);
    }
    this.draw(this.acc / STEP);
  }

  /** Tips on the animated pose, at rest. */
  private place(): void {
    for (const j of this.joints) {
      this.poseAnimated(j);
      _v.copy(j.tipLocal).applyMatrix4(j.bone.matrixWorld).applyMatrix4(this.centerInv);
      j.pos.copy(_v);
      j.vel.set(0, 0, 0);
      j.local.copy(j.axis);
      j.lastLocal.copy(j.axis);
    }
    this.centerPrev.copy(this.center.matrixWorld);
    this.acc = 0;
  }

  /** The joint on its animated local pose, world matrix from its (already posed) parent. */
  private poseAnimated(j: Joint): void {
    const bone = j.bone;
    bone.quaternion.copy(j.animQ);
    bone.matrix.copy(j.animM);
    bone.matrixWorld.multiplyMatrices(bone.parent!.matrixWorld, bone.matrix);
  }

  private step(trail: boolean): void {
    for (const c of this.colliders) {
      c.wa.copy(c.a).applyMatrix4(c.node.matrixWorld);
      if (c.b) c.wb.copy(c.b).applyMatrix4(c.node.matrixWorld);
    }
    const cw = this.center.matrixWorld;
    _cq.setFromRotationMatrix(_m.extractRotation(cw));
    for (const j of this.joints) {
      const s = j.s;
      this.poseAnimated(j);
      _head.setFromMatrixPosition(j.bone.matrixWorld);
      _rest.copy(j.tipLocal).applyMatrix4(j.bone.matrixWorld);
      j.length = _rest.distanceTo(_head);
      // Work in world space this step: the tip as the centre now carries it.
      _v.copy(j.pos).applyMatrix4(cw);
      if (trail && s.trail > 0) {
        // How far the centre carried the tip since the last step; a share of it trails (clamped).
        _w.copy(j.pos).applyMatrix4(this.centerPrev);
        _w.sub(_v);
        const l = _w.length();
        const lim = 0.03 * Math.max(1, this.trailBoost);
        if (l > lim) _w.multiplyScalar(lim / l);
        _v.addScaledVector(_w, Math.min(1, s.trail * this.trailBoost));
      }
      // Velocity to world, a damped spring to the animated tip, gravity (semi-implicit Euler).
      _w.copy(j.vel).applyQuaternion(_cq);
      const om = 2 * Math.PI * s.hz;
      _w.x += (om * om * (_rest.x - _v.x) - 2 * s.zeta * om * _w.x) * STEP;
      _w.y += (om * om * (_rest.y - _v.y) - 2 * s.zeta * om * _w.y - s.gravity) * STEP;
      _w.z += (om * om * (_rest.z - _v.z) - 2 * s.zeta * om * _w.z) * STEP;
      _v.addScaledVector(_w, STEP);
      this.collide(_v, j);
      // Bone length; in the animated bone frame the turn rate and the cone round the animated direction,
      // so the joint never turns against its parent faster than the clip plus maxDegS.
      _dir.copy(_v).sub(_head);
      if (_dir.lengthSq() < 1e-12) _dir.copy(_rest).sub(_head);
      _m.copy(j.bone.matrixWorld).invert();
      _dir.transformDirection(_m);
      limitAngle(_dir, j.local, s.maxDegS * DEG * STEP);
      limitAngle(_dir, j.axis, s.maxDeg * DEG);
      j.lastLocal.copy(j.local);
      j.local.copy(_dir);
      _dir.transformDirection(j.bone.matrixWorld);
      _v.copy(_head).addScaledVector(_dir, j.length);
      // Back to centre space; the velocity follows what the constraints left.
      _w.copy(_v).applyMatrix4(this.centerInv);
      j.vel.copy(_w).sub(j.pos).multiplyScalar(1 / STEP);
      j.pos.copy(_w);
      this.aim(j, _v);
    }
    this.centerPrev.copy(cw);
  }

  private collide(tip: THREE.Vector3, j: Joint): void {
    for (const c of this.colliders) {
      let px = c.wa.x;
      let py = c.wa.y;
      let pz = c.wa.z;
      if (c.b) {
        _seg.copy(c.wb).sub(c.wa);
        const l2 = _seg.lengthSq();
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((tip.x - c.wa.x) * _seg.x + (tip.y - c.wa.y) * _seg.y + (tip.z - c.wa.z) * _seg.z) / l2)) : 0;
        px += _seg.x * t;
        py += _seg.y * t;
        pz += _seg.z * t;
      }
      const dx = tip.x - px;
      const dy = tip.y - py;
      const dz = tip.z - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = c.r + j.s.radius;
      if (d < r && d > 1e-6) {
        const k = (r - d) / d;
        tip.x += dx * k;
        tip.y += dy * k;
        tip.z += dz * k;
      }
    }
  }

  /** Turns the joint from its animated pose so its tip points at `tipW` (world), and refreshes its world matrix. */
  private aim(j: Joint, tipW: THREE.Vector3): void {
    const bone = j.bone;
    _m.multiplyMatrices(bone.parent!.matrixWorld, j.animM).invert();
    _w.copy(tipW).applyMatrix4(_m).normalize();
    _q.setFromUnitVectors(j.axis, _w);
    bone.quaternion.copy(j.animQ).multiply(_q);
    bone.updateMatrix();
    bone.matrixWorld.multiplyMatrices(bone.parent!.matrixWorld, bone.matrix);
  }

  /**
   * Poses the joints `alpha` of the way from the last step to the current one, as directions in each joint's
   * animated frame: a joint follows its parent at once and keeps the rate and cone limits between steps.
   */
  private draw(alpha: number): void {
    for (const j of this.joints) {
      _dir.copy(j.lastLocal).lerp(j.local, alpha).normalize();
      _q.setFromUnitVectors(j.axis, _dir);
      const bone = j.bone;
      bone.quaternion.copy(j.animQ).multiply(_q);
      bone.updateMatrix();
      bone.matrixWorld.multiplyMatrices(bone.parent!.matrixWorld, bone.matrix);
    }
    for (const r of this.roots) r.updateMatrixWorld(true);
  }
}

/** Rotates unit vector `v` towards unit vector `ref` so the angle between them is at most `max` (rad). */
function limitAngle(v: THREE.Vector3, ref: THREE.Vector3, max: number): void {
  const d = Math.max(-1, Math.min(1, v.dot(ref)));
  const a = Math.acos(d);
  if (a <= max || a < 1e-6) return;
  // v' = slerp(ref, v, max / a)
  const s = Math.sin(a);
  if (s < 1e-6) return;
  const t = max / a;
  const k0 = Math.sin((1 - t) * a) / s;
  const k1 = Math.sin(t * a) / s;
  v.set(ref.x * k0 + v.x * k1, ref.y * k0 + v.y * k1, ref.z * k0 + v.z * k1).normalize();
}

/**
 * Length of a childless bone from its skin: the 90th percentile, along the
 * bone's +Y in bind space, of the vertices it weighs most. `fallback` when the
 * skin says too little. Load time only.
 */
export function tipFromSkin(mesh: THREE.SkinnedMesh, bone: THREE.Bone, fallback: number): number {
  const skel = mesh.skeleton;
  const bi = skel.bones.indexOf(bone);
  const pos = mesh.geometry.getAttribute("position");
  const si = mesh.geometry.getAttribute("skinIndex");
  const sw = mesh.geometry.getAttribute("skinWeight");
  if (bi < 0 || !pos || !si || !sw) return fallback;
  const toBone = new THREE.Matrix4().multiplyMatrices(skel.boneInverses[bi]!, mesh.bindMatrix);
  const ys: number[] = [];
  const v = new THREE.Vector3();
  for (let k = 0; k < pos.count; k += 1) {
    let best = -1;
    let bw = 0;
    for (let c = 0; c < 4; c += 1) {
      const w = sw.getComponent(k, c);
      if (w > bw) {
        bw = w;
        best = si.getComponent(k, c);
      }
    }
    if (best !== bi) continue;
    ys.push(v.fromBufferAttribute(pos, k).applyMatrix4(toBone).y);
  }
  if (ys.length < 8) return fallback;
  ys.sort((a, b) => a - b);
  const y = ys[Math.floor(ys.length * 0.9)]!;
  return y > 1e-4 ? y : fallback;
}
