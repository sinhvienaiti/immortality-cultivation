// Source: games/space-typing/src/scene3d/particles.ts (kit copy: no star streaks, random passed in, drift optional; log fixes in shared/game-kit/DRIFT.md)
import * as THREE from "three";
import {
  FLAME_FRAGMENT,
  FLAME_VERTEX,
  LIGHT_TRAIL_FRAGMENT,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  RIBBON_FRAGMENT,
  RIBBON_VERTEX,
  TURNING_PARTICLE_FRAGMENT,
  TURNING_PARTICLE_VERTEX,
} from "./materials";
import { rand, scratch, type Random } from "./util";

export type SpawnOptions = { drag?: number; gravity?: number; grow?: number; alpha?: number; flow?: number; spin?: number };

/**
 * A pool of additive point sprites updated on the CPU (one draw call).
 * `turning`: each sprite gets a random angle and turns at its `spin`. Sizes
 * are world units: setScale() with the stage's point scale.
 */
export class ParticlePool {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  limit: number;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly size0: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly drag: Float32Array;
  private readonly gravity: Float32Array;
  private readonly grow: Float32Array;
  private readonly flow: Float32Array;
  private readonly rot: Float32Array | null;
  private readonly spin: Float32Array | null;
  private cursor = 0;
  private live = 0;

  constructor(private readonly max: number, map: THREE.Texture, turning = false, private readonly random: Random = Math.random) {
    this.limit = max;
    this.position = new Float32Array(max * 3);
    this.color = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.velocity = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.total = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.flow = new Float32Array(max);
    this.rot = turning ? new Float32Array(max) : null;
    this.spin = turning ? new Float32Array(max) : null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    if (this.rot !== null) geometry.setAttribute("aRot", new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: turning ? TURNING_PARTICLE_VERTEX : PARTICLE_VERTEX,
      fragmentShader: turning ? TURNING_PARTICLE_FRAGMENT : PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  get count(): number {
    return this.live;
  }

  spawn(at: THREE.Vector3, velocity: THREE.Vector3, color: THREE.Color, size: number, life: number, options: SpawnOptions = {}): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.limit;
    const i3 = index * 3;
    this.position[i3] = at.x;
    this.position[i3 + 1] = at.y;
    this.position[i3 + 2] = at.z;
    this.velocity[i3] = velocity.x;
    this.velocity[i3 + 1] = velocity.y;
    this.velocity[i3 + 2] = velocity.z;
    this.color[i3] = color.r;
    this.color[i3 + 1] = color.g;
    this.color[i3 + 2] = color.b;
    this.life[index] = life;
    this.total[index] = life;
    this.size0[index] = size;
    this.alpha0[index] = options.alpha ?? 1;
    this.drag[index] = options.drag ?? 1.5;
    this.gravity[index] = options.gravity ?? 0;
    this.grow[index] = options.grow ?? 0;
    this.flow[index] = options.flow ?? 0;
    if (this.rot !== null && this.spin !== null) {
      this.rot[index] = rand(0, Math.PI * 2, this.random);
      this.spin[index] = (options.spin ?? 0) * (this.random() < 0.5 ? -1 : 1);
    }
    this.points.geometry.getAttribute("aColor").needsUpdate = true;
  }

  /** `drift`: world flow this frame (units along +Z) that `flow`-tagged particles follow (0 in a still world). */
  update(dt: number, drift = 0): void {
    let live = 0;
    for (let index = 0; index < this.max; index += 1) {
      if (this.life[index]! <= 0) continue;
      const left = this.life[index]! - dt;
      this.life[index] = left;
      if (left <= 0) {
        this.alpha[index] = 0;
        this.size[index] = 0;
        continue;
      }
      live += 1;
      const i3 = index * 3;
      const keep = Math.exp(-this.drag[index]! * dt);
      this.velocity[i3] = this.velocity[i3]! * keep;
      this.velocity[i3 + 1] = this.velocity[i3 + 1]! * keep - this.gravity[index]! * dt;
      this.velocity[i3 + 2] = this.velocity[i3 + 2]! * keep;
      this.position[i3] = this.position[i3]! + this.velocity[i3]! * dt;
      this.position[i3 + 1] = this.position[i3 + 1]! + this.velocity[i3 + 1]! * dt;
      this.position[i3 + 2] = this.position[i3 + 2]! + this.velocity[i3 + 2]! * dt + drift * this.flow[index]!;
      const k = left / this.total[index]!;
      this.size[index] = this.size0[index]! * (1 + this.grow[index]! * (1 - k));
      this.alpha[index] = this.alpha0[index]! * k ** 1.3 * Math.min(1, (1 - k) * 14 + 0.05);
      if (this.rot !== null && this.spin !== null) this.rot[index] = this.rot[index]! + this.spin[index]! * dt;
    }
    this.live = live;
    const geometry = this.points.geometry;
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("aSize").needsUpdate = true;
    geometry.getAttribute("aAlpha").needsUpdate = true;
    if (this.rot !== null) geometry.getAttribute("aRot").needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.live = 0;
  }

  setScale(scale: number): void {
    this.points.material.uniforms.uScale!.value = scale;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** A camera-facing trail through a short position history (wing tips, bolts). */
export class Ribbon {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly points: THREE.Vector3[];
  private readonly position: Float32Array;
  private readonly alpha: Float32Array;
  private clock = 0;

  constructor(private readonly count: number, color: THREE.Color, private readonly width: number) {
    this.points = Array.from({ length: count }, () => new THREE.Vector3());
    this.position = new Float32Array(count * 6);
    this.alpha = new Float32Array(count * 2);
    const side = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i += 1) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < count - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() } },
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  reset(at: THREE.Vector3): void {
    for (const point of this.points) point.copy(at);
  }

  /** `reach` (0 … 1): the share of the points that shows; a short trail fades out sooner. */
  update(head: THREE.Vector3, dt: number, drift: number, eye: THREE.Vector3, intensity: number, reach = 1): void {
    for (const point of this.points) point.z += drift;
    this.clock += dt;
    if (this.clock >= 1 / 60) {
      this.clock = Math.min(1 / 60, this.clock - 1 / 60);
      const last = this.points.pop()!;
      this.points.unshift(last);
    }
    this.points[0]!.copy(head);
    const tangent = scratch.a;
    const toEye = scratch.b;
    const side = scratch.c;
    const n = this.count;
    for (let i = 0; i < n; i += 1) {
      const point = this.points[i]!;
      tangent.subVectors(this.points[Math.max(0, i - 1)]!, this.points[Math.min(n - 1, i + 1)]!);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      toEye.subVectors(eye, point);
      side.crossVectors(tangent, toEye);
      if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
      const k = Math.min(1, i / (n - 1) / reach);
      side.normalize().multiplyScalar(this.width * (1 - 0.75 * k));
      const o = i * 6;
      this.position[o] = point.x - side.x;
      this.position[o + 1] = point.y - side.y;
      this.position[o + 2] = point.z - side.z;
      this.position[o + 3] = point.x + side.x;
      this.position[o + 4] = point.y + side.y;
      this.position[o + 5] = point.z + side.z;
      const alpha = intensity * (1 - k) ** 1.6;
      this.alpha[i * 2] = alpha;
      this.alpha[i * 2 + 1] = alpha;
    }
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
    this.mesh.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  setColor(color: THREE.Color): void {
    (this.mesh.material.uniforms.uColor!.value as THREE.Color).copy(color);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * A trail of fire streaming back from a moving source (a dragon's paw): a
 * camera-facing strip through the source's recent positions, carried back
 * with the world flow, drawn with a noise flame shader (FLAME_FRAGMENT).
 */
export class FlameTrail {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly points: THREE.Vector3[];
  private readonly position: Float32Array;
  private readonly alpha: Float32Array;
  private clock = 0;
  private started = false;

  constructor(private readonly count: number, private readonly width: number, seed: number) {
    this.points = Array.from({ length: count }, () => new THREE.Vector3());
    this.position = new Float32Array(count * 6);
    this.alpha = new Float32Array(count * 2);
    const side = new Float32Array(count * 2);
    const along = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i += 1) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      along[i * 2] = along[i * 2 + 1] = i / (count - 1);
      if (i < count - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
    geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /**
   * `drift`: world flow this frame, of which `flow` carries the trail back;
   * `heat` 0..1 scales its width and brightness (a push-off flares it).
   */
  update(head: THREE.Vector3, dt: number, time: number, drift: number, flow: number, eye: THREE.Vector3, heat: number, visible: boolean, fade = 1): void {
    this.mesh.visible = visible;
    if (!visible) {
      this.started = false;
      return;
    }
    if (!this.started) {
      for (const point of this.points) point.copy(head);
      this.started = true;
    }
    for (const point of this.points) {
      point.z += drift * flow;
      // Flame rises a little as it trails off.
      point.y += dt * 0.35;
    }
    this.clock += dt;
    if (this.clock >= 1 / 60) {
      this.clock = Math.min(1 / 60, this.clock - 1 / 60);
      const last = this.points.pop()!;
      this.points.unshift(last);
    }
    this.points[0]!.copy(head);
    const tangent = scratch.a;
    const toEye = scratch.b;
    const side = scratch.c;
    const n = this.count;
    for (let i = 0; i < n; i += 1) {
      const point = this.points[i]!;
      tangent.subVectors(this.points[Math.max(0, i - 1)]!, this.points[Math.min(n - 1, i + 1)]!);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      toEye.subVectors(eye, point);
      side.crossVectors(tangent, toEye);
      if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
      const k = i / (n - 1);
      // Swells just behind the paw, then thins out to the tail.
      const swell = Math.sin(Math.min(1, k * 4 + 0.35) * Math.PI * 0.5) * (1 - 0.7 * k);
      side.normalize().multiplyScalar(this.width * swell * (0.7 + 0.5 * heat));
      const o = i * 6;
      this.position[o] = point.x - side.x;
      this.position[o + 1] = point.y - side.y;
      this.position[o + 2] = point.z - side.z;
      this.position[o + 3] = point.x + side.x;
      this.position[o + 4] = point.y + side.y;
      this.position[o + 5] = point.z + side.z;
      const alpha = (1 - k) ** 1.2 * Math.min(1, k * 10 + 0.3);
      this.alpha[i * 2] = alpha;
      this.alpha[i * 2 + 1] = alpha;
    }
    const uniforms = this.mesh.material.uniforms;
    uniforms.uTime!.value = time;
    uniforms.uIntensity!.value = (0.6 + 0.45 * heat) * fade;
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
    this.mesh.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  /** Out of sight; it starts afresh from wherever it next shows. */
  hide(): void {
    this.mesh.visible = false;
    this.started = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * A streak of light behind a fireball: a camera-facing strip through points
 * the caller lays along the flight path (fx.ts samples the fireball's own
 * curve, so it bends smoothly however fast the ball flies), widest at the
 * head and thinning to nothing, a white-gold core in an ember glow.
 */
export class LightTrail {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly points: THREE.Vector3[];
  private readonly position: Float32Array;
  private readonly alpha: Float32Array;

  constructor(readonly count: number, seed: number) {
    this.points = Array.from({ length: count }, () => new THREE.Vector3());
    this.position = new Float32Array(count * 6);
    this.alpha = new Float32Array(count * 2);
    const side = new Float32Array(count * 2);
    const along = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i += 1) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      along[i * 2] = along[i * 2 + 1] = i / (count - 1);
      if (i < count - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
    geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
      vertexShader: FLAME_VERTEX,
      fragmentShader: LIGHT_TRAIL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** Draws the strip through `points` (head first), `width` at the head. */
  update(eye: THREE.Vector3, width: number, intensity: number, time: number): void {
    this.mesh.visible = intensity > 0.001;
    if (!this.mesh.visible) return;
    const tangent = scratch.a;
    const toEye = scratch.b;
    const side = scratch.c;
    const n = this.count;
    for (let i = 0; i < n; i += 1) {
      const point = this.points[i]!;
      tangent.subVectors(this.points[Math.max(0, i - 1)]!, this.points[Math.min(n - 1, i + 1)]!);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      toEye.subVectors(eye, point);
      side.crossVectors(tangent, toEye);
      if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
      const k = i / (n - 1);
      // Full width just behind the head, then a long, soft taper.
      side.normalize().multiplyScalar(width * Math.min(1, 0.55 + k * 6) * (1 - k) ** 0.9);
      const o = i * 6;
      this.position[o] = point.x - side.x;
      this.position[o + 1] = point.y - side.y;
      this.position[o + 2] = point.z - side.z;
      this.position[o + 3] = point.x + side.x;
      this.position[o + 4] = point.y + side.y;
      this.position[o + 5] = point.z + side.z;
      const alpha = (1 - k) ** 1.4;
      this.alpha[i * 2] = alpha;
      this.alpha[i * 2 + 1] = alpha;
    }
    const uniforms = this.mesh.material.uniforms;
    uniforms.uTime!.value = time;
    uniforms.uIntensity!.value = intensity;
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
    this.mesh.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
