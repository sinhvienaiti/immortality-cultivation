/**
 * Dev-only stand-in caster for the skills lab: Wordwoven's Lam (Tripo, 25
 * bones, 13 clips) until the Kiếm tu model passes its gate (ART_AUDIO_VFX_PLAN
 * §7 #1). Plays the clip that matches each skill and gives the VFX a hand
 * point to release from.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAB_ASSETS } from "./look";

export type CasterClip = "attack" | "skill1" | "skill2" | "ult" | "dash" | "idle";

const CLIP_NAMES: Record<CasterClip, string> = {
  attack: "Hero_Attack",
  skill1: "Hero_Skill1",
  skill2: "Hero_Skill2",
  ult: "Hero_Ult",
  dash: "Hero_Dash",
  idle: "Hero_Idle",
};

export class LabCaster {
  readonly root = new THREE.Group();
  x = 0;
  z = 3;
  fx = 0;
  fz = -1;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<CasterClip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private handBone: THREE.Object3D | null = null;
  private heightM = 1.75;

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(LAB_ASSETS + "models/lam.glb");
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
      const name = o.name.toLowerCase();
      if (this.handBone === null && (o as THREE.Bone).isBone && name.includes("hand") && (name.includes("r") || name.includes("right"))) {
        if (name.includes("right") || /(^|[_.\s])r($|[_.\s])/.test(name) || name.endsWith("_r") || name.endsWith(".r") || name.includes("hand_r") || name.includes("righthand")) this.handBone = o;
      }
    });
    if (this.handBone === null) {
      model.traverse((o) => {
        if (this.handBone === null && (o as THREE.Bone).isBone && o.name.toLowerCase().includes("hand")) this.handBone = o;
      });
    }
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const key of Object.keys(CLIP_NAMES) as CasterClip[]) {
      const clip = gltf.animations.find((a) => a.name === CLIP_NAMES[key]);
      if (clip) this.actions.set(key, this.mixer.clipAction(clip));
    }
    this.play("idle");
    this.place();
  }

  play(clip: CasterClip): void {
    const next = this.actions.get(clip);
    if (!next || !this.mixer) return;
    if (clip !== "idle") {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = false;
      // Start near the clip's release so the strike never waits on the animation (VFX_STANDARD §3.1 rule 3).
      next.time = Math.min(next.getClip().duration * 0.3, 0.25);
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, 0.08, false);
    this.current = next;
    if (clip !== "idle") {
      const back = (): void => {
        this.mixer?.removeEventListener("finished", back);
        this.play("idle");
      };
      this.mixer.addEventListener("finished", back);
    }
  }

  moveTo(x: number, z: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    if (dx * dx + dz * dz > 1e-6) {
      const l = Math.hypot(dx, dz);
      this.fx = dx / l;
      this.fz = dz / l;
    }
    this.x = x;
    this.z = z;
    this.place();
  }

  face(fx: number, fz: number): void {
    const l = Math.hypot(fx, fz) || 1;
    this.fx = fx / l;
    this.fz = fz / l;
    this.place();
  }

  private place(): void {
    this.root.position.set(this.x, 0, this.z);
    // Model forward is +z.
    this.root.rotation.y = Math.atan2(this.fx, this.fz);
  }

  hand(out: THREE.Vector3): void {
    if (this.handBone) {
      this.handBone.getWorldPosition(out);
      return;
    }
    out.set(this.x + this.fx * 0.4 - this.fz * 0.25, 1.15, this.z + this.fz * 0.4 + this.fx * 0.25);
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}
