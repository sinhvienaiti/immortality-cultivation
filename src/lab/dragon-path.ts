/**
 * Energy dragons running along curves (docs/work/tasks/energy-dragon-kit.md, step 2): the owner's "một con rồng khá dài
 * và đẹp … các dạng uốn lượn … số lượng rồng uốn lượn phù hợp" as components placed by code. Parts (Codex 375/376, in
 * the Firefly stills folder): a head, a seamless body tile, a tail and a claw, all line-drawn platinum light on black.
 *
 * Each dragon is a run of arc lengths along a 3D path: its head at the front, its body a strip bent along the path,
 * its tail card at the back, two pairs of claws under the body. Every part lies in the dragon's own frame at each point:
 * t (head → tail along the path) and s (across, at right angles to t and to the line of sight, turned to screen-up), so
 * the strip never shows its edge and the head, tail and claws stay joined to it. The body thins toward the tail and
 * sways a little. All dragons draw in four merged meshes (body, heads, tails, claws): one pass each, whatever the count.
 *
 * View only: no sim, no damage. Additive light (the parts are drawn on black).
 */
import * as THREE from "three";

export type DragonPattern = "around" | "dash" | "radial" | "spiral";
export const DRAGON_PATTERNS: readonly DragonPattern[] = ["around", "dash", "radial", "spiral"];

/** The parts' stills (folder `base`) and how they join (measured in the images, 15/11). */
const PARTS = {
  head: "energy-dragon-head.v1-try2.png",
  body: "energy-dragon-body.v2-try5.png",
  tail: "energy-dragon-tail.v2-try3.png",
  claw: "energy-dragon-claw.v1-try1.png",
} as const;
/** Body tile 2048 × 512: its scaled band spans rows 105–365 (centre 0.459 of the height). The strip is the tile's
 * whole height; the band is BAND of it. */
const BODY_ASPECT = 2048 / 512;
const BODY_V_CENTRE = 0.459;
/** Head 1024 × 1024: the neck at its right edge, rows 255–623 (centre 0.429 from the top, 368 px tall). */
const HEAD_NECK_V = 0.429;
const HEAD_NECK_H = 368 / 1024;
const BODY_BAND_H = 260 / 512;
/** Tail 1024 × 512: its left edge on the body's band, centred 0.467 from the top. */
const TAIL_ASPECT = 1024 / 512;
const TAIL_V = 0.467;
/** Claw 512 × 512: the wrist at the top right (x 0.72, y 0.12). */
const CLAW_WRIST: readonly [number, number] = [0.72, 0.12];

/** A dragon's shape: its strip width at the neck (m), its body length (m), how much it thins toward the tail, its sway. */
export interface DragonShape {
  widthM: number;
  bodyM: number;
  taper: number;
  swayM: number;
  swayWaveM: number;
}
/** Sized for the play camera (15/11: at 1.1 m wide they read as thin grey threads on the court). */
const DEFAULT_SHAPE: DragonShape = { widthM: 2.2, bodyM: 16, taper: 0.55, swayM: 0.35, swayWaveM: 8 };
/** Body segments along a dragon (the strip's resolution). */
const SEGMENTS = 56;
/** The seam of the body tile cross-faded over this share of a tile at each end (Codex 376's dark joins). */
const SEAM = 0.07;
/** Platinum, a little over 1 so the line art reads on the pale court (additive). */
const TINT = new THREE.Color(1.25, 1.18, 1.05);

interface Dragon {
  path: THREE.Curve<THREE.Vector3>;
  length: number;
  loop: boolean;
  speed: number;
  /** Head's arc position (m) now. */
  head: number;
  delay: number;
  shape: DragonShape;
  phase: number;
  light: number;
}

/** A merged quad mesh with its own texture (positions, uvs and alpha rewritten every frame; additive). */
class Batch {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly uv: Float32Array;
  private readonly alpha: Float32Array;
  private n = 0;

  constructor(readonly capacityQuads: number, renderOrder: number, seam: boolean) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacityQuads * 4 * 3);
    this.uv = new Float32Array(capacityQuads * 4 * 2);
    this.alpha = new Float32Array(capacityQuads * 4);
    const index = new Uint32Array(capacityQuads * 6);
    for (let q = 0; q < capacityQuads; q += 1) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uTint: { value: TINT }, uSeam: { value: seam ? SEAM : 0 }, uVShift: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uTint;
        uniform float uSeam;
        uniform float uVShift;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vec2 uv = vec2(vUv.x, clamp(vUv.y + uVShift, 0.0, 1.0));
          vec3 c;
          if (uSeam > 0.0) {
            // A repeating tile: its own join cross-faded with the tile's middle (no dark seam).
            float f = fract(uv.x);
            vec3 a = texture2D(uMap, vec2(f, uv.y)).rgb;
            vec3 b = texture2D(uMap, vec2(fract(f + 0.5), uv.y)).rgb;
            float w = 1.0 - smoothstep(0.0, uSeam, min(f, 1.0 - f));
            c = mix(a, b, w);
          } else {
            c = texture2D(uMap, uv).rgb;
          }
          gl_FragColor = vec4(c * uTint * vAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  /** One quad: corners p00 (u0, v0) … p11 (u1, v1), the same light at all four. */
  quad(p00: THREE.Vector3, p10: THREE.Vector3, p01: THREE.Vector3, p11: THREE.Vector3, u0: number, u1: number, v0: number, v1: number, a: number, a1 = a): void {
    if (this.n >= this.capacityQuads) return;
    const o = this.n * 4;
    const P = this.pos;
    P.set([p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z], o * 3);
    this.uv.set([u0, v0, u0, v1, u1, v0, u1, v1], o * 2);
    this.alpha.set([a, a, a1, a1], o);
    this.n += 1;
  }

  end(): void {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 6);
    (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("uv") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  get quads(): number {
    return this.n;
  }
}

/** Scratch vectors (no allocation per frame). */
const pt = new THREE.Vector3();
const tan = new THREE.Vector3();
const side = new THREE.Vector3();
const view = new THREE.Vector3();
const camUp = new THREE.Vector3();
const a0 = new THREE.Vector3();
const a1 = new THREE.Vector3();
const b0 = new THREE.Vector3();
const b1 = new THREE.Vector3();
const c0 = new THREE.Vector3();
const c1 = new THREE.Vector3();
const prevL = new THREE.Vector3();
const prevR = new THREE.Vector3();

const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export class DragonPaths {
  readonly group = new THREE.Group();
  private readonly body = new Batch(16 * SEGMENTS, 20, true);
  private readonly heads = new Batch(16, 21, false);
  private readonly tails = new Batch(16, 20, false);
  private readonly claws = new Batch(16 * 4, 19, false);
  private readonly dragons: Dragon[] = [];
  private loaded = false;
  private loading = false;
  pattern: DragonPattern | null = null;
  /** Each part's quads drawn last frame (stats). */
  readonly stats = { dragons: 0, quads: 0, draws: 0 };

  constructor(parent: THREE.Object3D, private readonly camera: THREE.Camera, private readonly base: string) {
    this.group.name = "fx-energy-dragons";
    for (const b of [this.claws, this.body, this.tails, this.heads]) this.group.add(b.mesh);
    // The body strip spans the tile's whole height; its band sits a little above the middle.
    this.body.mesh.material.uniforms.uVShift!.value = 0.5 - BODY_V_CENTRE;
    parent.add(this.group);
  }

  /** The four stills (once, in the browser). */
  load(): void {
    if (this.loaded || this.loading || typeof document === "undefined") return;
    this.loading = true;
    const loader = new THREE.TextureLoader();
    const set = (batch: Batch, file: string, repeat: boolean): Promise<void> =>
      loader.loadAsync(this.base + file).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        batch.mesh.material.uniforms.uMap!.value = t;
      });
    void Promise.all([set(this.body, PARTS.body, true), set(this.heads, PARTS.head, false), set(this.tails, PARTS.tail, false), set(this.claws, PARTS.claw, false)])
      .then(() => { this.loaded = true; })
      .catch((e: unknown) => console.warn("[dragon-path] load", e))
      .finally(() => { this.loading = false; });
  }

  get ready(): boolean {
    return this.loaded;
  }

  clear(): void {
    this.dragons.length = 0;
    this.pattern = null;
    for (const b of [this.body, this.heads, this.tails, this.claws]) {
      b.begin();
      b.end();
    }
  }

  /**
   * `count` dragons on `pattern`: round the player at (px, pz); a dash from the player to the beasts' middle (tx, tz);
   * radial from that middle; a spiral rising round the player.
   */
  start(pattern: DragonPattern, count: number, px: number, pz: number, tx: number, tz: number): void {
    this.load();
    this.dragons.length = 0;
    this.pattern = pattern;
    const n = Math.max(1, Math.min(16, Math.round(count)));
    for (let k = 0; k < n; k += 1) {
      const f = k / n;
      const shape = { ...DEFAULT_SHAPE };
      let points: THREE.Vector3[];
      let loop = false;
      let speed: number;
      let delay = 0;
      if (pattern === "around") {
        // A ring round the player, rising and falling, each dragon on its own height and phase.
        loop = true;
        speed = 7;
        const r = 5 + (k % 2) * 1.2;
        const y = 2 + (k % 3) * 0.6;
        points = [];
        for (let i = 0; i < 16; i += 1) {
          const a = (i / 16) * Math.PI * 2 + f * Math.PI * 2;
          points.push(new THREE.Vector3(px + Math.cos(a) * r, y + 0.6 * Math.sin(a * 2), pz + Math.sin(a) * r));
        }
      } else if (pattern === "dash") {
        // From the player's hand out to the beasts, a shallow S, on through them; staggered when several.
        speed = 24;
        delay = k * 0.12;
        const dx = tx - px;
        const dz = tz - pz;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const lat = (k - (n - 1) / 2) * 1.4;
        points = [];
        for (let i = 0; i <= 11; i += 1) {
          const u = i / 6;
          const s = Math.sin(u * Math.PI) * 1.6 * (k % 2 === 0 ? 1 : -1) + lat * Math.min(1, u * 2);
          points.push(new THREE.Vector3(px + dx * u + nx * s, 1.5 + 1.2 * Math.sin(u * Math.PI) - 0.5 * u, pz + dz * u + nz * s));
        }
        shape.bodyM = 14;
      } else if (pattern === "radial") {
        // From the beasts' middle out in `n` directions, each bending the same way (a turning wheel), rising.
        speed = 15;
        const a0r = f * Math.PI * 2;
        points = [];
        for (let i = 0; i <= 8; i += 1) {
          const u = i / 8;
          const a = a0r + u * 1.1;
          const r = 0.4 + u * 26;
          points.push(new THREE.Vector3(tx + Math.cos(a) * r, 1 + u * 5, tz + Math.sin(a) * r));
        }
      } else {
        // A helix rising round the player, three turns.
        speed = 11;
        delay = k * 0.25;
        points = [];
        for (let i = 0; i <= 36; i += 1) {
          const u = i / 36;
          const a = u * Math.PI * 6 + f * Math.PI * 2;
          const r = 3.5 + u * 2;
          points.push(new THREE.Vector3(px + Math.cos(a) * r, 0.6 + u * 16, pz + Math.sin(a) * r));
        }
        shape.bodyM = 13;
        shape.widthM = 1.8;
      }
      const path = new THREE.CatmullRomCurve3(points, loop, "centripetal");
      const length = path.getLength();
      this.dragons.push({ path, length, loop, speed, head: 0, delay, shape, phase: k * 1.37, light: 1 });
    }
  }

  /** World time: the dragons move on and every part is rebuilt for this frame's camera. */
  update(dt: number): void {
    for (const b of [this.body, this.heads, this.tails, this.claws]) b.begin();
    this.stats.dragons = 0;
    if (this.loaded) {
      this.camera.updateMatrixWorld();
      camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      for (const d of this.dragons) {
        if (d.delay > 0) {
          d.delay -= dt;
          continue;
        }
        d.head += d.speed * dt;
        this.draw(d);
        this.stats.dragons += 1;
      }
    }
    let quads = 0;
    let draws = 0;
    for (const b of [this.body, this.heads, this.tails, this.claws]) {
      b.end();
      quads += b.quads;
      if (b.quads > 0) draws += 1;
    }
    this.stats.quads = quads;
    this.stats.draws = draws;
  }

  get active(): boolean {
    return this.dragons.length > 0;
  }

  /** The point and tangent (head → tail) `arc` m along the path; false where the dragon is not on it. */
  private at(d: Dragon, arc: number, out: THREE.Vector3, t: THREE.Vector3): boolean {
    let a = arc;
    if (d.loop) a = ((a % d.length) + d.length) % d.length;
    else if (a < 0 || a > d.length) return false;
    const u = a / d.length;
    d.path.getPointAt(u, out);
    d.path.getTangentAt(u, t).negate();
    return true;
  }

  /** The across vector at `p` for tangent `t`: at right angles to t and the line of sight, screen-up. */
  private across(p: THREE.Vector3, t: THREE.Vector3, sign: number, out: THREE.Vector3): void {
    view.copy(p).sub(this.camera.position).normalize();
    out.crossVectors(t, view);
    if (out.lengthSq() < 1e-8) out.copy(camUp);
    out.normalize().multiplyScalar(sign);
  }

  private draw(d: Dragon): void {
    const S = d.shape;
    const W = S.widthM;
    const headLen = W * (BODY_BAND_H / HEAD_NECK_H) * 1;
    // Light in and out: a one-way run fades over its last fifth (the dash goes on through the beasts and away).
    const total = headLen + S.bodyM + W * TAIL_ASPECT;
    const fadeOut = d.loop ? 1 : 1 - smooth((d.head - total - d.length * 0.8) / (d.length * 0.2));
    const light = d.light * fadeOut;
    if (light <= 0.002) return;
    // One sign for the whole dragon: s points screen-up along its head-to-tail chord (no twist mid-body).
    const sign = this.chordSign(d);
    // The body strip from the neck (arc = head − headLen) back SEGMENTS steps.
    const neck = d.head - headLen;
    const tileM = W * BODY_ASPECT;
    let have = false;
    let uPrev = 0;
    let aPrev = 0;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const s = i / SEGMENTS;
      const arc = neck - s * S.bodyM;
      if (!this.at(d, arc, pt, tan)) {
        have = false;
        continue;
      }
      this.across(pt, tan, sign, side);
      const w = W * (1 - S.taper * Math.pow(s, 1.4));
      // A travelling sway across the body (stronger toward the tail).
      pt.addScaledVector(side, this.sway(d, s));
      a0.copy(pt).addScaledVector(side, -w / 2);
      a1.copy(pt).addScaledVector(side, w / 2);
      const u = (s * S.bodyM) / tileM;
      // Fade in where the body leaves the path's start (radial, dash) and toward the tail's join.
      const alpha = light * (d.loop ? 1 : smooth((arc + 0.5) / 2));
      if (have) this.body.quad(prevL, a0, prevR, a1, uPrev, u, 0, 1, aPrev, alpha);
      prevL.copy(a0);
      prevR.copy(a1);
      uPrev = u;
      aPrev = alpha;
      have = true;
      // Claws: two pairs under the body at a fifth and a half of its length (they hang below, screen-down).
      if (i === Math.round(SEGMENTS * 0.18) || i === Math.round(SEGMENTS * 0.5)) this.claw(pt, tan, side, w, alpha, s);
    }
    // The head: its neck on the body's start, facing away from the tail.
    if (this.at(d, neck, pt, tan)) {
      this.across(pt, tan, sign, side);
      const H = W * (BODY_BAND_H / HEAD_NECK_H);
      const len = H; // the head still is square
      // Neck (u = 1, v = HEAD_NECK_V from the top) on the body's centre line.
      const vTop = HEAD_NECK_V * H;
      const vBot = (1 - HEAD_NECK_V) * H;
      c0.copy(pt).addScaledVector(tan, -len);
      b0.copy(c0).addScaledVector(side, -vBot);
      b1.copy(c0).addScaledVector(side, vTop);
      c1.copy(pt).addScaledVector(side, -vBot);
      a1.copy(pt).addScaledVector(side, vTop);
      const alpha = light * (d.loop ? 1 : smooth((neck + 0.5) / 2));
      this.heads.quad(b0, c1, b1, a1, 0, 1, 0, 1, alpha);
    }
    // The tail: its root on the body's end, running on away from the head.
    const end = neck - S.bodyM;
    if (this.at(d, end, pt, tan)) {
      this.across(pt, tan, sign, side);
      pt.addScaledVector(side, this.sway(d, 1));
      const w = W * (1 - S.taper);
      // The tail still is the body tile's height (its band the body's band).
      const H = w;
      const len = H * TAIL_ASPECT;
      const vTop = TAIL_V * H;
      const vBot = (1 - TAIL_V) * H;
      c0.copy(pt).addScaledVector(tan, len);
      b0.copy(pt).addScaledVector(side, -vBot);
      b1.copy(pt).addScaledVector(side, vTop);
      c1.copy(c0).addScaledVector(side, -vBot);
      a1.copy(c0).addScaledVector(side, vTop);
      const alpha = light * (d.loop ? 1 : smooth((end + 0.5) / 2));
      this.tails.quad(b0, c1, b1, a1, 0, 1, 0, 1, alpha);
    }
  }

  /** The body's travelling sway across itself `s` (0 neck … 1 tail) of its length, stronger toward the tail. */
  private sway(d: Dragon, s: number): number {
    const S = d.shape;
    return S.swayM * Math.sin(((s * S.bodyM) / S.swayWaveM) * Math.PI * 2 - d.head * 0.9 + d.phase) * (0.3 + s);
  }

  /** One claw hanging from the body at `p` (width `w`), its wrist under the band, its toes toward the head. */
  private claw(p: THREE.Vector3, t: THREE.Vector3, s: THREE.Vector3, w: number, alpha: number, along: number): void {
    const size = w * 0.9 * (1 - along * 0.3);
    // The wrist sits on the band's lower edge.
    c0.copy(p).addScaledVector(s, -w * BODY_BAND_H * 0.45);
    // Image x runs toes (left, toward the head) → wrist (right): along +t from the toes; image y up = +s.
    const left = CLAW_WRIST[0] * size;
    const right = (1 - CLAW_WRIST[0]) * size;
    const top = CLAW_WRIST[1] * size;
    const bottom = (1 - CLAW_WRIST[1]) * size;
    // x: toward the head is −t (image left). So image left = −t direction from the wrist.
    b0.copy(c0).addScaledVector(t, -left).addScaledVector(s, -bottom);
    b1.copy(c0).addScaledVector(t, -left).addScaledVector(s, top);
    a0.copy(c0).addScaledVector(t, right).addScaledVector(s, -bottom);
    a1.copy(c0).addScaledVector(t, right).addScaledVector(s, top);
    this.claws.quad(b0, a0, b1, a1, 0, 1, 0, 1, alpha * 0.9);
  }

  /** +1 or −1 so the dragon's across vector points screen-up along its head-to-tail chord. */
  private chordSign(d: Dragon): number {
    if (!this.at(d, d.head - 1, a0, tan)) {
      if (!this.at(d, d.loop ? d.head : Math.min(d.length, Math.max(0, d.head)), a0, tan)) return 1;
    }
    this.across(a0, tan, 1, side);
    return side.dot(camUp) >= 0 ? 1 : -1;
  }
}
