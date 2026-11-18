/** Tickets 415/415b: calibrated controls and one bounded curl per digit; rest geometry is unchanged. */
import * as THREE from "three";
import type { Rig } from "./anim/rig";
import { FINGERS } from "./anim-r2-poses";
import standard from "./anim-r3-seals.json";

export type FingerSide = "r" | "l";
export interface FingerSetting {
  curl: number;
  abduction: number;
  twist: number;
}
export function r3CurlAngles(finger: string, curl: number): readonly [number, number, number] {
  const { ratio, maxDeg } = standard.curlProfiles[finger === "thumb" ? "thumb" : "long"];
  // Scale the whole ratio to the tightest joint limit; never clip joints independently.
  const base = Math.min(...maxDeg.map((limit, j) => limit / ratio[j]!)) * THREE.MathUtils.clamp(curl, 0, 1);
  return [base * ratio[0]!, base * ratio[1]!, base * ratio[2]!];
}
interface JointFrame {
  rest: THREE.Quaternion;
  parent: THREE.Quaternion;
  neutral: THREE.Quaternion;
  forward: THREE.Vector3;
  normal: THREE.Vector3;
  bend: THREE.Vector3;
}

export class R3FingerControls {
  private readonly frames = new Map<string, JointFrame>();
  constructor(rig: Rig, root: THREE.Object3D) {
    const q = new Float32Array(rig.count * 4), p = new Float32Array(rig.count * 3);
    rig.readPose(q, p); rig.writePose(rig.restQ, rig.restP); root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), rq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const pos = (name: string) => rig.bone(name)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    for (const side of ["r", "l"] as const) {
      const wrist = pos(`hand_${side}`), forward = pos(`middle_01_${side}`).sub(wrist).normalize();
      const normal = new THREE.Vector3(0, -1, 0).addScaledVector(forward, forward.y).normalize();
      const bend = new THREE.Vector3().crossVectors(forward, normal).normalize();
      for (const finger of FINGERS) {
        // Cancel the measured rest fan/pitch, including the opposable thumb, before controls.
        const chord = pos(`${finger}_04_leaf_${side}`).sub(pos(`${finger}_01_${side}`)).normalize();
        const neutral = new THREE.Quaternion().setFromUnitVectors(chord, forward);
        for (let j = 0; j < 3; j++) {
          const b = rig.bone(`${finger}_0${j + 1}_${side}`)!;
          this.frames.set(b.name, { rest: b.quaternion.clone(), parent: b.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(rq),
            neutral: j === 0 ? neutral.clone() : new THREE.Quaternion(), forward, normal, bend });
        }
      }
    }
    rig.writePose(q, p); root.updateMatrixWorld(true);
  }
  quaternion(side: FingerSide, finger: string, joint: number, setting: FingerSetting): THREE.Quaternion {
    const f = this.frames.get(`${finger}_0${joint + 1}_${side}`)!;
    const rad = Math.PI / 180, sign = side === "r" ? 1 : -1;
    // Angles live in the calibrated palm frame, not an assumed bone Euler frame.
    const delta = new THREE.Quaternion().setFromAxisAngle(f.bend, r3CurlAngles(finger, setting.curl)[joint]! * rad);
    if (joint === 0) {
      delta.premultiply(new THREE.Quaternion().setFromAxisAngle(f.forward, sign * setting.twist * rad));
      delta.premultiply(new THREE.Quaternion().setFromAxisAngle(f.normal, sign * setting.abduction * rad));
    }
    return f.parent.clone().invert().multiply(delta).multiply(f.neutral).multiply(f.parent).multiply(f.rest);
  }
}
