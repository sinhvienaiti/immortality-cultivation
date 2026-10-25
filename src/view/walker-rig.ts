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
  /** The weight three.js has (written only when it changes). */
  applied: number;
  target: number;
  fadeIn: number;
  fadeOut: number;
}

/**
 * Every layer from this one site, its number fields doubles from the start: loops and one-shots
 * share one hidden class, so the per-frame loops stay monomorphic and V8 stores the floats in place.
 */
function layerOf(action: THREE.AnimationAction, duration: number, fadeIn: number, fadeOut: number): Layer {
  const layer: { -readonly [K in keyof Layer]: Layer[K] } = { action, duration: 0.5, weight: 0.5, applied: 0.5, target: 0.5, fadeIn: 0.5, fadeOut: 0.5 };
  layer.duration = duration;
  layer.weight = 0;
  layer.applied = 0;
  layer.target = 0;
  layer.fadeIn = fadeIn;
  layer.fadeOut = fadeOut;
  return layer;
}

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
      return layerOf(action, clip.duration, WALKER_BLEND.loopS, WALKER_BLEND.loopS);
    });
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      if (this.loops.some((layer) => layer?.action === action)) continue;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.setEffectiveWeight(0);
      this.shots.set(clip.name, layerOf(action, clip.duration, WALKER_BLEND.fadeInS, WALKER_BLEND.fadeOutS));
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
      // approach(), written out: a call V8 does not inline boxes its float arguments and result.
      const move = step / Math.max(0.01, fade);
      layer.weight = layer.weight < layer.target ? Math.min(layer.target, layer.weight + move) : Math.max(layer.target, layer.weight - move);
      if (layer.target === 0 && layer.weight <= 0) {
        layer.action.stop();
        // Out of the list in place (splice builds an array of what it removed).
        for (let m = index; m < this.playing.length - 1; m += 1) this.playing[m] = this.playing[m + 1]!;
        this.playing.pop();
        continue;
      }
      shotSum += layer.weight;
    }
    const shotScale = shotSum > 1 ? 1 / shotSum : 1;
    const baseShare = 1 - Math.min(1, shotSum);
    let loopSum = 0;
    for (let k = 0; k < 3; k += 1) {
      const target = LOCOMOTIONS[k] === this.locomotion ? 1 : 0;
      const current = this.loopWeight[k]!;
      const move = step / WALKER_BLEND.loopS;
      this.loopWeight[k] = current < target ? Math.min(target, current + move) : Math.max(target, current - move);
      loopSum += this.loopWeight[k]!;
    }
    // Weights go to three.js only when they change, into the action's `weight` field (what
    // setEffectiveWeight sets; the mixer reads it into the effective weight every update): a
    // double passed to a call is boxed by V8 every time. No three.js weight fades are used.
    for (let k = 0; k < 3; k += 1) {
      const loop = this.loops[k];
      if (loop === null || loop === undefined) continue;
      const weight = (baseShare * this.loopWeight[k]!) / Math.max(loopSum, 1e-4);
      if (weight !== loop.applied) {
        loop.applied = weight;
        loop.action.weight = weight;
      }
    }
    for (let k = 0; k < this.playing.length; k += 1) {
      const layer = this.playing[k]!;
      const weight = layer.weight * shotScale;
      if (weight !== layer.applied) {
        layer.applied = weight;
        layer.action.weight = weight;
      }
    }
    // The caller's own number goes on as it came (a new double passed to a call is boxed by V8
    // every frame; even `dt > 0 ? dt : 0` makes one): a step below 0 is the caller's bug.
    this.mixer.update(dt);
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
