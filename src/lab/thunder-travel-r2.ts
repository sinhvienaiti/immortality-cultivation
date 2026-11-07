/** R2 travel uses authored Thunder art; the existing Showcase still owns the pillar and hit clock. */
import * as THREE from "three";
import { FlipbookPool, ONE_FRAME, type FlipbookMeta, type FlipOptions } from "../view/skills/flipbook";

export const THUNDER_TRAVEL_TAIL_S = 0.12;
export const THUNDER_GUIDE_RISE_S = 0.12;
export const THUNDER_GUIDE_FLIGHT_S = 0.18;
export const THUNDER_GUIDE_WIDTH = 0.8;
const GUIDE_SEGMENTS = 12;
export const THUNDER_PILLAR_TAIL_S = 0.55;
export const THUNDER_PILLAR_SIZE = 10;
const IDS = ["thunder-ribbon-loop", "thunder-sparkle", "thunder-charge"] as const;
type CardMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

export class ThunderTravelR2 {
  readonly group = new THREE.Group();
  private readonly cards = IDS.map((id) => ({ id, pool: null as FlipbookPool | null }));
  private readonly blank = new THREE.Texture();
  private readonly hand = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly sky = new THREE.Vector3();
  private readonly summit = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly screenA = new THREE.Vector3();
  private readonly screenB = new THREE.Vector3();
  private readonly options: FlipOptions = { life: ONE_FRAME, rate: 0, alpha: 1, intensity: 0.75,
    fadeIn: 0, fadeOut: 0, cool: 0, erode: 0, occlude: 0, ground: -1e5, lift: 0.03 };
  private age = -1;
  private hitAge = -1;

  constructor(parent: THREE.Object3D, private readonly host: { hand(out: THREE.Vector3): void; camera?: THREE.Camera }) {
    this.group.name = "fx-thunder-travel-r2";
    parent.add(this.group);
  }

  adopt(meta: FlipbookMeta, texture: THREE.Texture): void {
    const card = this.cards.find((c) => c.id === meta.id);
    if (card === undefined || card.pool !== null) return;
    const pool = new FlipbookPool(meta.id, meta.mode, meta.id === "thunder-ribbon-loop" ? GUIDE_SEGMENTS + 1 : meta.id === "thunder-sparkle" ? 16 : 2, 14, this.blank);
    // Centre the strip on each socket-to-socket segment. No new texture, shader or library.
    pool.attach(meta.id === "thunder-ribbon-loop" ? { ...meta, pivot: [0.5, 0.5] } : meta, texture);
    card.pool = pool;
    this.group.add(pool.mesh);
  }

  cast(target: THREE.Vector3): void {
    this.target.copy(target); this.age = 0; this.hitAge = -1;
    this.render();
  }

  strike(): void {
    if (this.age < 0) return;
    this.hitAge = 0;
    this.render();
  }

  update(dt: number): void {
    if (this.age < 0) return;
    this.age += Math.max(0, dt);
    if (this.hitAge >= 0) this.hitAge += Math.max(0, dt);
    if (this.hitAge >= THUNDER_PILLAR_TAIL_S - 1e-8) { this.clear(); return; }
    if (this.host.camera === undefined) this.render();
  }

  private segment(pool: FlipbookPool, from: THREE.Vector3, to: THREE.Vector3, width: number): void {
    const o = this.options;
    this.dir.subVectors(to, from);
    o.span = this.dir.length(); o.dir = this.dir;
    this.at.copy(from).addScaledVector(this.dir, 0.5);
    const camera = this.host.camera;
    if (camera !== undefined) {
      // A billboard at the world midpoint misses perspective endpoints. Put both endpoints on its view plane.
      this.at.project(camera);
      const depth = this.at.z;
      this.screenA.copy(from).project(camera); this.screenA.z = depth; this.screenA.unproject(camera);
      this.screenB.copy(to).project(camera); this.screenB.z = depth; this.screenB.unproject(camera);
      this.dir.subVectors(this.screenB, this.screenA); o.span = this.dir.length();
      this.at.copy(this.screenA).addScaledVector(this.dir, 0.5);
    }
    pool.spawn(this.at, width, o);
  }

  /** One continuous head: first up from the hand, then across to the pillar's summit. */
  private guidePoint(t: number, out: THREE.Vector3): void {
    const corner = THUNDER_GUIDE_RISE_S / THUNDER_GUIDE_FLIGHT_S;
    if (t <= corner) out.lerpVectors(this.hand, this.sky, t / corner);
    else out.lerpVectors(this.sky, this.summit, (t - corner) / (1 - corner));
  }

  private guide(pool: FlipbookPool): void {
    const head = Math.min(1, this.age / THUNDER_GUIDE_FLIGHT_S);
    const tail = Math.max(0, head - 0.7), corner = THUNDER_GUIDE_RISE_S / THUNDER_GUIDE_FLIGHT_S;
    const o = this.options;
    o.frame = this.age * pool.meta!.fps % pool.meta!.frames;
    for (let i = 0; i < GUIDE_SEGMENTS; i += 1) {
      const a = tail + (head - tail) * i / GUIDE_SEGMENTS;
      const b = tail + (head - tail) * (i + 1) / GUIDE_SEGMENTS;
      if (b - a < 1e-6) continue;
      const fresh = (i + 0.5) / GUIDE_SEGMENTS;
      const width = 0.08 + (THUNDER_GUIDE_WIDTH - 0.08) * fresh;
      o.alpha = (0.12 + 0.7 * fresh) * Math.min(1, this.age / 0.025);
      this.guidePoint(a, this.from); this.guidePoint(b, this.to);
      // Split at the bend so the ribbon never cuts diagonally across the two sockets.
      if (a < corner && b > corner) {
        this.segment(pool, this.from, this.sky, width);
        this.segment(pool, this.sky, this.to, width);
      } else this.segment(pool, this.from, this.to, width);
    }
    pool.update(0);
  }

  private render(): void {
    for (const card of this.cards) card.pool?.clear();
    this.host.hand(this.hand);
    this.sky.set(this.hand.x, Math.max(8, this.hand.y + 5), this.hand.z);
    this.summit.set(this.target.x, this.sky.y, this.target.z);
    const ribbon = this.cards[0]!.pool, sparkle = this.cards[1]!.pool, halo = this.cards[2]!.pool;
    const o = this.options;
    const travel = this.hitAge < 0 ? 1 : 0;
    if (ribbon?.meta != null && travel > 1e-6) {
      this.guide(ribbon);
    }
    o.dir = null; o.span = 0;
    if (sparkle?.meta != null) {
      if (travel > 0) {
        this.guidePoint(Math.min(1, this.age / THUNDER_GUIDE_FLIGHT_S), this.at);
        o.alpha = 0.9; o.frame = sparkle.meta.peak ?? sparkle.meta.start;
        sparkle.spawn(this.at, 0.32, o);
      }
      for (let i = 0; i < 8; i += 1) {
        const t = (this.age * 1.6 + i / 8) % 1;
        if (travel > 1e-6) {
          if (t < 0.5) this.at.lerpVectors(this.hand, this.sky, t * 2);
          else this.at.lerpVectors(this.sky, this.summit, t * 2 - 1);
          o.alpha = travel * Math.sin(Math.PI * t); o.frame = (i * 7 + this.age * sparkle.meta.fps) % sparkle.meta.frames;
          sparkle.spawn(this.at, 0.18, o);
        }
        if (this.hitAge >= 0) {
          const angle = i * 2.39996 + this.hitAge * 2;
          this.at.set(this.target.x + Math.cos(angle) * 0.65, this.target.y + 0.2 + t * 6, this.target.z + Math.sin(angle) * 0.65);
          o.alpha = Math.sin(Math.PI * t) * (1 - this.hitAge / THUNDER_PILLAR_TAIL_S);
          o.frame = (i * 11 + this.age * sparkle.meta.fps) % sparkle.meta.frames;
          sparkle.spawn(this.at, 0.2, o);
        }
      }
      sparkle.update(0);
    }
    if (halo?.meta != null && this.hitAge >= 0) {
      o.alpha = 0.16 * (1 - this.hitAge / THUNDER_PILLAR_TAIL_S);
      o.frame = halo.meta.peak ?? halo.meta.start;
      this.at.copy(this.target); this.at.y += 3;
      halo.spawn(this.at, 5, o); halo.update(0);
    }
  }

  private isPillar(mesh: CardMesh): boolean {
    if (mesh.name === "flipbook-pillar-thunder-single") return true;
    if (mesh.name !== "flipbook-video") return false;
    const texture = mesh.material.uniforms.uMap?.value as THREE.Texture | undefined;
    const image = texture?.image as { currentSrc?: string; src?: string } | undefined;
    return (image?.currentSrc || image?.src || "").includes("/pillar-thunder-single.mp4");
  }

  /** After the existing player/video update: tune its card in place, keeping its frame and all event clocks. */
  present(source: THREE.Group): void {
    if (this.host.camera !== undefined && this.age >= 0) this.render();
    let chosen: CardMesh | null = null, index = -1, youngest = Infinity;
    for (const child of source.children) {
      const mesh = child as CardMesh;
      if (!mesh.isMesh || !this.isPillar(mesh)) continue;
      const data = mesh.geometry.getAttribute("iData"), age = mesh.geometry.getAttribute("iAge");
      if (mesh.visible) for (let i = 0; i < mesh.geometry.instanceCount; i += 1) {
        if (age.getX(i) <= youngest) { chosen = mesh; index = i; youngest = age.getX(i); }
      }
      // Keep one existing body, including rapid recasts and video-to-atlas fallback.
      mesh.visible = false;
      for (let i = 0; i < mesh.geometry.instanceCount; i += 1) data.setW(i, 0);
      data.needsUpdate = true;
    }
    if (chosen === null || this.hitAge < 0 || this.hitAge >= THUNDER_PILLAR_TAIL_S) return;
    const data = chosen.geometry.getAttribute("iData"), pos = chosen.geometry.getAttribute("iPos");
    const colour = chosen.geometry.getAttribute("iColor");
    const tail = this.hitAge / THUNDER_PILLAR_TAIL_S;
    // Useful segment: the first 0.55 s on the existing atlas/video presentation clock.
    data.setX(index, THUNDER_PILLAR_SIZE); data.setW(index, 1 - tail * tail * (3 - 2 * tail));
    pos.setXYZ(index, this.target.x, this.target.y + 0.04, this.target.z);
    colour.setXYZ(index, 0.72, 0.72, 0.72);
    (chosen.material.uniforms.uPivot!.value as THREE.Vector2).set(0.5, 0.2);
    data.needsUpdate = pos.needsUpdate = colour.needsUpdate = true;
    chosen.visible = true;
  }

  clear(): void {
    this.age = this.hitAge = -1;
    for (const card of this.cards) card.pool?.clear();
  }
}
