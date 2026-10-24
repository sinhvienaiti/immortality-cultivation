// Source: games/space-typing/src/scene3d/hero.ts (kit copy: clip names are an option; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";
import { Ribbon } from "./particles";
import { approach, clamp, COLORS, damp } from "./util";

export type Locomotion = "idle" | "fly" | "boost";
export type ShotName = "attackL" | "attackR" | "attackBoth" | "spit" | "spitBig" | "cast" | "burst" | "hit" | "victory" | "death" | "intro";

const LOCOMOTIONS: readonly Locomotion[] = ["idle", "fly", "boost"];

/**
 * Clip names each layer looks for, first match wins (an exact name before a
 * substring): Space's heroes (Hero_*), the G01 stand-in (Boss_*), a ship
 * (Ship_Idle). A game's rig with other names passes its own (HeroOptions.clips).
 */
export const HERO_CLIPS: Readonly<Record<Locomotion | ShotName, readonly string[]>> = {
  idle: ["Idle_Hover", "Ship_Idle"],
  fly: ["Hero_Fly"],
  boost: ["Hero_Boost"],
  attackL: ["Attack_L"],
  attackR: ["Attack_R"],
  attackBoth: ["Attack_Both"],
  spit: ["Hero_Spit"],
  spitBig: ["Hero_Spit_Big"],
  cast: ["Hero_Cast"],
  burst: ["Prismatic_Burst", "Hero_Victory"],
  hit: ["Hero_Hit", "Boss_Hit"],
  victory: ["Hero_Victory"],
  death: ["Hero_Death", "Boss_Death"],
  intro: ["Hero_Intro", "Boss_Intro"],
};
/** Forward pitch (radians) per locomotion; actions stand the body up. */
const PITCH: Record<Locomotion, number> = { idle: -0.1, fly: -0.42, boost: -0.78 };

type Layer = {
  action: THREE.AnimationAction;
  duration: number;
  speed: number;
  weight: number;
  target: number;
  fadeIn: number;
  fadeOut: number;
  hold: boolean;
  upright: boolean;
  /** Added over the loops (the wings keep beating) instead of replacing them. */
  additive: boolean;
};

type Look = { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: number; hashed: boolean };

export type HeroOptions = {
  /** Ribbons per side when the rig has no FX_WING_* sockets (leaf bones are used). */
  tipsPerSide: number;
  /** Ribbon length (points). */
  trail: number;
  /** Ribbon colours, one per pair of tips. */
  palette?: readonly THREE.Color[];
  /** Longest side of the fitted model (units). */
  fitSize?: number;
  /** Sockets that draw ribbons (default: every FX_WING_* and FX_TAIL found). */
  trailSockets?: readonly string[];
  /**
   * Forward pitch of the body per locomotion (radians). A rig whose clips
   * already lie the body down in flight (blender make_flight_clips) uses 0.
   */
  pitch?: Record<Locomotion, number>;
  /** Clip time (s, at speed 1) when an action lets go: the palm is out, the jaws open. */
  release?: Partial<Record<ShotName, number>>;
  /**
   * Actions played additively over the flight loop: their clips start and
   * end in the still glide pose and only carry what the action changes.
   */
  additive?: readonly ShotName[];
  /** The code's wing-beat bob (off when the clips heave the body themselves). */
  bob?: boolean;
  /** How hard a hit knocks the body back (1 = the original jolt). */
  knock?: number;
  /**
   * Turn the model half round to fly away from the play camera (-Z). Heroes
   * are generated facing +Z; ships are authored nose -Z already (false).
   */
  faceAway?: boolean;
  /** Clip names per layer, over HERO_CLIPS (e.g. idle: ["Dragon_Idle"]). */
  clips?: Partial<Record<Locomotion | ShotName, readonly string[]>>;
};

/**
 * The flown character: the loaded rig inside a pivot that the code steers,
 * banks and pitches (the clips have no root motion), a weighted blend of the
 * locomotion loops under one-shot action clips, and the socket/wing-tip
 * anchors the VFX follow.
 *
 * Clip names: heroes (blender tool --kind heroes) use Hero_*; the G01 stand-in
 * keeps Boss_Hit / Boss_Death / Boss_Intro and its Idle_Hover / Prismatic_Burst;
 * a flown ship has only Ship_Idle (the code banks, bobs and knocks it).
 */
export class Hero {
  readonly root = new THREE.Group();
  readonly sockets: {
    core: THREE.Object3D | null;
    halo: THREE.Object3D | null;
    castL: THREE.Object3D | null;
    castR: THREE.Object3D | null;
    mouth: THREE.Object3D | null;
  };
  readonly tips: THREE.Object3D[];
  readonly ribbons: Ribbon[];
  readonly clipNames: string[];
  readonly bones: number;
  readonly span: number;
  locomotion: Locomotion = "idle";
  x = 0;
  /** A turn of the flight (set each frame by the game): the body rolls into it and the head leads round, radians. */
  turnBank = 0;
  turnYaw = 0;
  private vx = 0;
  private pitch = 0;
  private bank = 0;
  private knock = 0;
  private knockVelocity = 0;
  private readonly mixer: THREE.AnimationMixer;
  private readonly loops: Record<Locomotion, Layer | null>;
  private readonly shots = new Map<ShotName, Layer>();
  private readonly playing: Layer[] = [];
  private readonly loopWeight: Record<Locomotion, number> = { idle: 1, fly: 0, boost: 0 };
  private readonly looks: Look[] = [];
  private readonly pitchTable: Record<Locomotion, number>;
  private readonly releaseTable: Partial<Record<ShotName, number>>;
  private readonly bob: boolean;
  private readonly knockScale: number;

  constructor(private readonly model: THREE.Group, clips: THREE.AnimationClip[], options: HeroOptions) {
    this.pitchTable = options.pitch ?? PITCH;
    this.releaseTable = options.release ?? {};
    this.bob = options.bob ?? true;
    this.knockScale = options.knock ?? 1;
    const additive = new Set(options.additive ?? []);
    this.mixer = new THREE.AnimationMixer(model);
    this.clipNames = clips.map((clip) => clip.name);
    const find = (layerName: Locomotion | ShotName): THREE.AnimationClip | null => {
      for (const needle of options.clips?.[layerName] ?? HERO_CLIPS[layerName]) {
        // An exact name first: "Hero_Spit" is also the start of "Hero_Spit_Big".
        const clip = clips.find((item) => item.name === needle) ?? clips.find((item) => item.name.includes(needle));
        if (clip !== undefined) return clip;
      }
      return null;
    };
    const layer = (
      clip: THREE.AnimationClip | null,
      loop: boolean,
      settings: { speed?: number; fadeIn?: number; fadeOut?: number; hold?: boolean; upright?: boolean; additive?: boolean } = {},
    ): Layer | null => {
      if (clip === null) return null;
      const action = settings.additive
        ? this.mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(clip.clone()), undefined, THREE.AdditiveAnimationBlendMode)
        : this.mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Number.POSITIVE_INFINITY : 1);
      action.clampWhenFinished = !loop;
      action.enabled = true;
      action.setEffectiveTimeScale(settings.speed ?? 1);
      action.setEffectiveWeight(0);
      if (loop) action.play();
      return {
        action,
        duration: clip.duration,
        speed: settings.speed ?? 1,
        weight: 0,
        target: 0,
        fadeIn: settings.fadeIn ?? 0.12,
        fadeOut: settings.fadeOut ?? 0.25,
        hold: settings.hold ?? false,
        upright: settings.upright ?? false,
        additive: settings.additive ?? false,
      };
    };
    this.loops = {
      idle: layer(find("idle"), true),
      fly: layer(find("fly"), true),
      boost: layer(find("boost"), true),
    };
    const add = (name: ShotName): boolean => additive.has(name);
    const shots: [ShotName, Layer | null][] = [
      ["attackL", layer(find("attackL"), false, { speed: 1.6, fadeIn: 0.04, fadeOut: 0.12, additive: add("attackL") })],
      ["attackR", layer(find("attackR"), false, { speed: 1.6, fadeIn: 0.04, fadeOut: 0.12, additive: add("attackR") })],
      ["attackBoth", layer(find("attackBoth"), false, { speed: 1.4, fadeIn: 0.04, fadeOut: 0.14, additive: add("attackBoth") })],
      ["spit", layer(find("spit"), false, { speed: 1.4, fadeIn: 0.04, fadeOut: 0.12, additive: add("spit") })],
      ["spitBig", layer(find("spitBig"), false, { speed: 1.2, fadeIn: 0.05, fadeOut: 0.16, additive: add("spitBig") })],
      ["cast", layer(find("cast"), false, { fadeIn: 0.12, fadeOut: 0.3, upright: true, additive: add("cast") })],
      ["burst", layer(find("burst"), false, { fadeIn: 0.15, fadeOut: 0.35, upright: true })],
      ["hit", layer(find("hit"), false, { speed: 1, fadeIn: 0.08, fadeOut: 0.3, additive: add("hit") })],
      ["victory", layer(find("victory"), false, { fadeIn: 0.2, fadeOut: 0.4, upright: true })],
      ["death", layer(find("death"), false, { fadeIn: 0.1, fadeOut: 0.3, hold: true, upright: true })],
      ["intro", layer(find("intro"), false, { fadeIn: 0.01, fadeOut: 0.45, upright: true })],
    ];
    for (const [name, value] of shots) if (value !== null) this.shots.set(name, value);

    // Fit: the longest side fitSize units, centred, turned to fly away from the play camera (-Z).
    const fit = new THREE.Group();
    this.loopWeight.idle = 1;
    this.loops.idle?.action.setEffectiveWeight(1);
    this.mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = (options.fitSize ?? 2.5) / Math.max(size.x, size.y, size.z, 0.001);
    model.position.sub(center);
    fit.scale.setScalar(scale);
    fit.rotation.y = options.faceAway === false ? 0 : Math.PI;
    fit.add(model);
    this.root.add(fit);
    this.root.updateMatrixWorld(true);
    this.span = size.x * scale;

    let bones = 0;
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone) bones += 1;
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const standard = material as THREE.MeshStandardMaterial;
        if (standard.isMeshStandardMaterial !== true) continue;
        this.looks.push({ material: standard, color: standard.color.clone(), emissive: standard.emissiveIntensity, hashed: false });
      }
    });
    this.bones = bones;
    const socket = (name: string): THREE.Object3D | null => model.getObjectByName(name) ?? null;
    this.sockets = {
      core: socket("FX_CORE"),
      halo: socket("FX_HALO"),
      // A ship has no hands or jaws: its guns stand in for them.
      castL: socket("FX_CAST_L") ?? socket("FX_MUZZLE_L") ?? socket("FX_MUZZLE"),
      castR: socket("FX_CAST_R") ?? socket("FX_MUZZLE_R") ?? socket("FX_MUZZLE"),
      mouth: socket("FX_MOUTH") ?? socket("FX_MUZZLE"),
    };
    // Authored trail sockets win (pairs left/right, then the tail); else leaf bones.
    const authored = (options.trailSockets ?? ["FX_WING_L", "FX_WING_R", "FX_WING_L2", "FX_WING_R2", "FX_TAIL"])
      .map(socket)
      .filter((object): object is THREE.Object3D => object !== null);
    this.tips = authored.length >= 2 ? authored : wingTips(model, this.root, options.tipsPerSide, this.span);
    const palette = options.palette ?? [COLORS.cyan, COLORS.pink, COLORS.gold];
    this.ribbons = this.tips.map((_, index) => new Ribbon(options.trail, palette[Math.floor(index / 2) % palette.length]!, 0.05));
  }

  /** Plays a one-shot clip; returns its length in seconds (0 when the model lacks it). */
  play(name: ShotName): number {
    const layer = this.shots.get(name);
    if (layer === undefined) return 0;
    // A new action ends the others, except that an added one (a punch) leaves
    // a full-body action and the cast running underneath it.
    const cast = this.shots.get("cast");
    for (const other of this.playing) {
      if (other === layer || (layer.additive && (!other.additive || other === cast))) continue;
      other.target = 0;
    }
    layer.action.reset();
    layer.action.setEffectiveTimeScale(layer.speed);
    layer.action.play();
    layer.target = 1;
    if (!this.playing.includes(layer)) this.playing.push(layer);
    return layer.duration / layer.speed;
  }

  has(name: ShotName): boolean {
    return this.shots.has(name);
  }

  /** Seconds from play(name) to the moment it lets go (0 when unknown). */
  releaseDelay(name: ShotName): number {
    const layer = this.shots.get(name);
    const at = this.releaseTable[name];
    return layer === undefined || at === undefined ? 0 : at / layer.speed;
  }

  hurt(strength: number): void {
    this.knockVelocity += 6 * strength * this.knockScale;
  }

  /** Seconds into the fly loop, and how much of the pose it holds (0..1). */
  flyTime(): number {
    return this.loops.fly?.action.time ?? 0;
  }

  flyWeight(): number {
    return this.loops.fly === null ? 0 : this.loopWeight.fly;
  }

  /** A named node of the rig (sockets, bones). */
  node(name: string): THREE.Object3D | null {
    return this.model.getObjectByName(name) ?? null;
  }

  /** Steer -1 … 1; time in seconds; `reach` is the lateral travel at full steer. */
  update(dt: number, time: number, steer: number, reach = 3.1): void {
    const targetX = steer * reach;
    this.vx += ((targetX - this.x) * 10 - this.vx * 6.2) * dt;
    this.x += this.vx * dt;
    const upright = this.playing.some((layer) => layer.upright && layer.weight > 0.3);
    this.pitch = damp(this.pitch, upright ? Math.min(-0.04, this.pitchTable.idle) : this.pitchTable[this.locomotion], 4.2, dt);
    const sway = Math.sin(time * 0.9) * 0.05;
    this.bank = damp(this.bank, clamp(-this.vx * 0.2, -0.75, 0.75) + sway, 7, dt);
    // A hit knocks the body back on a spring (a soft one when knock < 1).
    const stiffness = this.knockScale < 1 ? 30 : 60;
    const damping = this.knockScale < 1 ? 7.5 : 9;
    this.knockVelocity += (-this.knock * stiffness - this.knockVelocity * damping) * dt;
    this.knock += this.knockVelocity * dt;
    // Wing-beat bob: rises on each down-stroke of Hero_Fly (two beats a loop).
    // A rig with no fly loop (a ship) has no beat to bounce on: it glides on
    // a slow float instead.
    const fly = this.loops.fly;
    const bob = !this.bob
      ? 0
      : fly === null
        ? Math.sin(time * 1.3) * 0.035 + Math.sin(time * 0.6 + 1.3) * 0.025
        : Math.sin(time * 1.7) * 0.07 * this.loopWeight.idle +
          Math.sin((fly.action.time / fly.duration) * 2 * Math.PI * 2 + 2.2) * 0.075 * this.loopWeight.fly +
          Math.sin(time * 17) * 0.012 * this.loopWeight.boost;
    this.root.position.set(this.x, bob, this.knock * 0.6);
    this.root.rotation.set(this.pitch + this.knock * 0.5, -this.vx * 0.04 + this.turnYaw, this.bank + this.turnBank, "YXZ");
    this.animate(dt);
    this.root.updateMatrixWorld(true);
  }

  private animate(dt: number): void {
    let shotSum = 0;
    for (let index = this.playing.length - 1; index >= 0; index -= 1) {
      const layer = this.playing[index]!;
      const left = (layer.duration - layer.action.time) / layer.speed;
      if (!layer.hold && left <= layer.fadeOut) layer.target = 0;
      const fade = layer.target > layer.weight ? layer.fadeIn : layer.fadeOut;
      layer.weight = approach(layer.weight, layer.target, dt / Math.max(0.01, fade));
      if (layer.target === 0 && layer.weight <= 0) {
        layer.action.stop();
        this.playing.splice(index, 1);
        continue;
      }
      // Added actions sit on top of whatever plays: they take no share from the loops.
      if (!layer.additive) shotSum += layer.weight;
    }
    const shotScale = shotSum > 1 ? 1 / shotSum : 1;
    const baseShare = 1 - Math.min(1, shotSum);
    let loopSum = 0;
    for (const name of LOCOMOTIONS) {
      this.loopWeight[name] = approach(this.loopWeight[name], name === this.locomotion ? 1 : 0, dt / 0.3);
      loopSum += this.loopWeight[name];
    }
    for (const name of LOCOMOTIONS) {
      this.loops[name]?.action.setEffectiveWeight((baseShare * this.loopWeight[name]) / Math.max(loopSum, 1e-4));
    }
    for (const layer of this.playing) layer.action.setEffectiveWeight(layer.additive ? layer.weight : layer.weight * shotScale);
    this.mixer.update(dt);
  }

  /** Hit tint, extra glow (casts, victory) and a hashed dissolve (death). */
  setLook(hurt: number, glow: number, opacity: number): void {
    for (const look of this.looks) {
      look.material.color.copy(look.color).lerp(COLORS.hurt, hurt * 0.6);
      look.material.emissiveIntensity = look.emissive * (1 + glow * 0.9) + hurt * 0.25;
      const hashed = opacity < 0.999;
      if (hashed !== look.hashed) {
        look.hashed = hashed;
        look.material.alphaHash = hashed;
        look.material.needsUpdate = true;
      }
      look.material.opacity = opacity;
    }
  }

  socketWorld(socket: THREE.Object3D | null, out: THREE.Vector3, fallback: readonly [number, number, number]): THREE.Vector3 {
    if (socket !== null) return socket.getWorldPosition(out);
    return this.root.localToWorld(out.set(...fallback));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    for (const ribbon of this.ribbons) {
      ribbon.mesh.removeFromParent();
      ribbon.dispose();
    }
    this.model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  }
}

/** Wing tips: the leaf bones farthest out to each side, kept apart from each other. */
function wingTips(model: THREE.Object3D, root: THREE.Object3D, perSide: number, span: number): THREE.Object3D[] {
  const leaves: { bone: THREE.Object3D; x: number; y: number }[] = [];
  model.traverse((object) => {
    if (!(object as THREE.Bone).isBone) return;
    if (object.children.some((child) => (child as THREE.Bone).isBone)) return;
    const at = root.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
    leaves.push({ bone: object, x: at.x, y: at.y });
  });
  const picked: THREE.Object3D[] = [];
  for (const sign of [-1, 1]) {
    const side = leaves
      .filter((leaf) => leaf.x * sign > span * 0.18)
      .sort((a, b) => Math.abs(b.x) + b.y * 0.4 - (Math.abs(a.x) + a.y * 0.4));
    const chosen: typeof side = [];
    for (const leaf of side) {
      if (chosen.length >= perSide) break;
      if (chosen.every((other) => Math.hypot(other.x - leaf.x, other.y - leaf.y) > span * 0.14)) chosen.push(leaf);
    }
    picked.push(...chosen.map((leaf) => leaf.bone));
  }
  // Interleave left/right so ribbon colours pair up across the body.
  const left = picked.slice(0, picked.length / 2);
  const right = picked.slice(picked.length / 2);
  return left.flatMap((bone, index) => (right[index] === undefined ? [bone] : [bone, right[index]!]));
}
