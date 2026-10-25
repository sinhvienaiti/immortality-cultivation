// Source: src/kit/three/hero.ts (kit 0.1.0; adapted: only the clip blending and the sockets; locomotion idle | run | dash on the ground, no flight pitch, bank, bob, wing tips or ribbons)
/**
 * Walking rigged characters (canon §21.2, D44, PB-21): the player, bots,
 * generals and the boss are SkinnedMesh rigs that walk. A weighted blend of
 * three locomotion loops (Idle, Run, Dash; 0.3 s cross-fade, kit Hero's rate)
 * under one-shot clips (Cast_Short, Hit, …) that fade in and out and share the
 * body with the loops by weight; sockets by name (FX_*). Clip names follow
 * the local model contract (src/content/model-contracts.ts), first match wins
 * (an exact name before a substring). The kit's Hero is a flown character
 * (Hero_Fly, pitch, wing ribbons), so this stays local until a second game
 * needs a walker (canon D44; SYNC_DEBT.md).
 * Owner: Lane 1.
 */
import * as THREE from "three";

export type WalkerLocomotion = "idle" | "run" | "dash";

const LOCOMOTIONS: readonly WalkerLocomotion[] = ["idle", "run", "dash"];

/** Clip names each loop looks for (the contract's names first). */
export const WALKER_CLIPS: Readonly<Record<WalkerLocomotion, readonly string[]>> = {
  idle: ["Idle"],
  run: ["Run", "Move", "Walk"],
  dash: ["Dash", "Run", "Move"],
};

/** Loops cross-fade in 0.3 s (kit Hero); a one-shot fades in 0.08 s and out 0.25 s unless told. */
export const WALKER_BLEND = { loopS: 0.3, fadeInS: 0.08, fadeOutS: 0.25 } as const;

export interface WalkerOptions {
  /** Clip names per loop, over WALKER_CLIPS. */
  readonly clips?: Partial<Record<WalkerLocomotion, readonly string[]>>;
  /** Playback rate of each loop (dash runs the run clip faster when it has no Dash). */
  readonly rates?: Partial<Record<WalkerLocomotion, number>>;
}

export interface Walker {
  readonly root: THREE.Object3D;
  /** Bones and triangles of the rig (the bench reports them, canon §20.3). */
  readonly bones: number;
  readonly triangles: number;
  readonly clipNames: readonly string[];
  readonly locomotion: WalkerLocomotion;
  setLocomotion(state: WalkerLocomotion): void;
  /** Plays a one-shot clip by name; returns its length in seconds (0 when the rig lacks it). */
  play(clip: string, fadeS?: number): number;
  socket(name: string): THREE.Object3D | null;
  /** Weight of a loop now (0–1, before the one-shots take their share). */
  weight(state: WalkerLocomotion): number;
  update(dt: number): void;
  dispose(): void;
}

interface Layer {
  readonly action: THREE.AnimationAction;
  readonly duration: number;
  weight: number;
  target: number;
  fadeIn: number;
  fadeOut: number;
}

const approach = (current: number, target: number, step: number): number => (current < target ? Math.min(target, current + step) : Math.max(target, current - step));

class WalkerImpl implements Walker {
  readonly root = new THREE.Group();
  readonly bones: number;
  readonly triangles: number;
  readonly clipNames: string[];
  locomotion: WalkerLocomotion = "idle";
  private readonly mixer: THREE.AnimationMixer;
  private readonly loops: (Layer | null)[];
  private readonly loopWeight = new Float32Array(3);
  private readonly shots = new Map<string, Layer>();
  private readonly playing: Layer[] = [];

  constructor(private readonly model: THREE.Object3D, clips: readonly THREE.AnimationClip[], options: WalkerOptions) {
    this.mixer = new THREE.AnimationMixer(model);
    this.clipNames = clips.map((clip) => clip.name);
    const find = (needles: readonly string[]): THREE.AnimationClip | null => {
      for (const needle of needles) {
        const clip = clips.find((item) => item.name === needle) ?? clips.find((item) => item.name.includes(needle));
        if (clip !== undefined) return clip;
      }
      return null;
    };
    const taken = new Set<THREE.AnimationClip>();
    this.loops = LOCOMOTIONS.map((state) => {
      const found = find(options.clips?.[state] ?? WALKER_CLIPS[state]);
      if (found === null) return null;
      // Two loops on one clip (a beast-king's run and dash both on Move) get their own action each.
      const clip = taken.has(found) ? found.clone() : found;
      taken.add(found);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      action.enabled = true;
      action.setEffectiveTimeScale(options.rates?.[state] ?? (state === "dash" && !clip.name.includes("Dash") ? 1.6 : 1));
      action.setEffectiveWeight(0);
      action.play();
      return { action, duration: clip.duration, weight: 0, target: 0, fadeIn: WALKER_BLEND.loopS, fadeOut: WALKER_BLEND.loopS };
    });
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      if (this.loops.some((layer) => layer?.action === action)) continue;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(0);
      this.shots.set(clip.name, { action, duration: clip.duration, weight: 0, target: 0, fadeIn: WALKER_BLEND.fadeInS, fadeOut: WALKER_BLEND.fadeOutS });
    }
    this.loopWeight[0] = 1;
    const idle = this.loops[0];
    if (idle !== null && idle !== undefined) {
      idle.weight = 1;
      idle.action.setEffectiveWeight(1);
    }
    this.mixer.update(0);
    let bones = 0;
    let triangles = 0;
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone) bones += 1;
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const index = mesh.geometry.getIndex();
      triangles += (index !== null ? index.count : mesh.geometry.getAttribute("position").count) / 3;
    });
    this.bones = bones;
    this.triangles = triangles;
    this.root.add(model);
  }

  setLocomotion(state: WalkerLocomotion): void {
    this.locomotion = state;
  }

  play(clip: string, fadeS?: number): number {
    const layer = this.shots.get(clip) ?? [...this.shots.entries()].find(([name]) => name.includes(clip))?.[1];
    if (layer === undefined) return 0;
    // A new one-shot ends the others.
    for (const other of this.playing) if (other !== layer) other.target = 0;
    if (fadeS !== undefined) layer.fadeIn = Math.max(0.01, fadeS);
    layer.action.reset();
    layer.action.play();
    layer.target = 1;
    if (!this.playing.includes(layer)) this.playing.push(layer);
    return layer.duration;
  }

  socket(name: string): THREE.Object3D | null {
    return this.model.getObjectByName(name) ?? null;
  }

  weight(state: WalkerLocomotion): number {
    return this.loopWeight[LOCOMOTIONS.indexOf(state)]!;
  }

  update(dt: number): void {
    const step = Math.max(0, dt);
    let shotSum = 0;
    for (let index = this.playing.length - 1; index >= 0; index -= 1) {
      const layer = this.playing[index]!;
      if (layer.duration - layer.action.time <= layer.fadeOut) layer.target = 0;
      const fade = layer.target > layer.weight ? layer.fadeIn : layer.fadeOut;
      layer.weight = approach(layer.weight, layer.target, step / Math.max(0.01, fade));
      if (layer.target === 0 && layer.weight <= 0) {
        layer.action.stop();
        this.playing.splice(index, 1);
        continue;
      }
      shotSum += layer.weight;
    }
    const shotScale = shotSum > 1 ? 1 / shotSum : 1;
    const baseShare = 1 - Math.min(1, shotSum);
    let loopSum = 0;
    for (let k = 0; k < 3; k += 1) {
      const target = LOCOMOTIONS[k] === this.locomotion ? 1 : 0;
      this.loopWeight[k] = approach(this.loopWeight[k]!, target, step / WALKER_BLEND.loopS);
      loopSum += this.loopWeight[k]!;
    }
    // Weights go to three.js only when they change (a settled walker passes no float to a call).
    for (let k = 0; k < 3; k += 1) {
      const loop = this.loops[k];
      if (loop === null || loop === undefined) continue;
      const weight = (baseShare * this.loopWeight[k]!) / Math.max(loopSum, 1e-4);
      if (weight !== loop.weight) {
        loop.weight = weight;
        loop.action.setEffectiveWeight(weight);
      }
    }
    for (let k = 0; k < this.playing.length; k += 1) {
      const layer = this.playing[k]!;
      layer.action.setEffectiveWeight(layer.weight * shotScale);
    }
    this.mixer.update(step);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    this.model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    });
  }
}

/** A walker on a loaded (or placeholder) rig and its clips. */
export function createWalker(rig: THREE.Object3D, clips: readonly THREE.AnimationClip[], options: WalkerOptions = {}): Walker {
  return new WalkerImpl(rig, clips, options);
}
