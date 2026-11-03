/**
 * Dash after-images for the lab caster (motion round 3; round-2 judges: "the
 * dash needs an after-image in the character's colour, and no white-out over
 * the body"). A small pool of frozen copies of the skinned body (the model's
 * skinned meshes only: no sword, halo or sprites), each posed from the live
 * rig when it spawns and drawn as a translucent emissive silhouette with a
 * bright fresnel rim in the hero's colour, fading out over its life. They
 * spawn every SPAWN_S while the dash glides fast, so a 0.2 s glide leaves a
 * trail of 4–6 poses. Additive, no depth write; the glow stays ≤ 0.9 (only thin
 * HDR cores may bloom, sword-skills.ts style rule). The copies are built on the first
 * dash (geometry shared with the body). No allocation per frame after that.
 */
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const POOL = 6;
/** Seconds between two after-images while the glide is faster than MIN_SPEED (m/s). */
const SPAWN_S = 0.034;
const MIN_SPEED = 2.5;
/** Life (s), peak opacity, rim strength. */
const LIFE_S = 0.3;
const PEAK = 0.5;
const RIM = 1.6;

interface Ghost {
  readonly root: THREE.Group;
  /** The copy's bones and, in the same order, the body's bones they copy (matched by name). */
  readonly bones: THREE.Bone[];
  readonly src: THREE.Bone[];
  readonly mat: THREE.MeshStandardMaterial;
  age: number;
}

export class AfterImages {
  private ghosts: Ghost[] = [];
  private next = 0;
  private since = 0;
  private readonly colour: THREE.Color;
  /** Spawned so far (for checks). */
  spawned = 0;

  constructor(
    private readonly model: THREE.Object3D,
    private readonly root: THREE.Object3D,
    colour: THREE.ColorRepresentation,
  ) {
    this.colour = new THREE.Color(colour);
  }

  private build(): void {
    const parent = this.root.parent;
    if (!parent) return;
    const byName = new Map<string, THREE.Bone>();
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone);
    });
    for (let i = 0; i < POOL; i += 1) {
      const copy = cloneSkinned(this.model);
      const drop: THREE.Object3D[] = [];
      const bones: THREE.Bone[] = [];
      const src: THREE.Bone[] = [];
      copy.traverse((o) => {
        const from = (o as THREE.Bone).isBone ? byName.get(o.name) : undefined;
        if (from) {
          bones.push(o as THREE.Bone);
          src.push(from);
        }
        else if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && !(o as THREE.SkinnedMesh).isSkinnedMesh) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();
      const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: this.colour, emissiveIntensity: 0.55, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>\n\tfloat ghostRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n\ttotalEmissiveRadiance *= 0.3 + ${RIM.toFixed(2)} * ghostRim * ghostRim;`,
        );
      };
      mat.customProgramCacheKey = () => "lab-afterimage";
      copy.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh) {
          m.material = mat;
          m.castShadow = false;
          m.receiveShadow = false;
          m.frustumCulled = false;
          m.renderOrder = 2;
        }
      });
      const g = new THREE.Group();
      g.add(copy);
      g.visible = false;
      g.matrixAutoUpdate = true;
      parent.add(g);
      this.ghosts.push({ root: g, bones, src, mat, age: -1 });
    }
  }

  /** One after-image now, posed as the body is drawn (call after the Animator's update). */
  spawn(): void {
    if (this.ghosts.length === 0) this.build();
    const g = this.ghosts[this.next];
    if (!g) return;
    this.next = (this.next + 1) % this.ghosts.length;
    for (let i = 0; i < g.bones.length; i += 1) {
      const s = g.src[i]!;
      const b = g.bones[i]!;
      b.position.copy(s.position);
      b.quaternion.copy(s.quaternion);
      b.scale.copy(s.scale);
    }
    g.root.position.copy(this.root.position);
    g.root.quaternion.copy(this.root.quaternion);
    g.root.scale.copy(this.root.scale);
    g.age = 0;
    g.root.visible = true;
    g.mat.opacity = PEAK;
    this.spawned += 1;
  }

  /** `gliding`: the dash moves the shown root at `speed` m/s. */
  update(dt: number, gliding: boolean, speed: number): void {
    this.since += dt;
    if (gliding && speed > MIN_SPEED && this.since >= SPAWN_S) {
      this.since = 0;
      this.spawn();
    }
    for (const g of this.ghosts) {
      if (g.age < 0) continue;
      g.age += dt;
      const u = g.age / LIFE_S;
      if (u >= 1) {
        g.age = -1;
        g.root.visible = false;
        g.mat.opacity = 0;
        continue;
      }
      // Eased out: bright at once (a new pose, no pop from nothing: it starts where the body is), gone smoothly.
      const k = 1 - u;
      g.mat.opacity = PEAK * k * k;
    }
  }

  reset(): void {
    for (const g of this.ghosts) {
      g.age = -1;
      g.root.visible = false;
      g.mat.opacity = 0;
    }
    this.since = 0;
  }
}
