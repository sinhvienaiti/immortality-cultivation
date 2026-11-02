/**
 * Blade-only smear for a key-pose release (skills lab, dev-only, never built; motion round 4b, ChatGPT approach 2
 * §1: "F1: blade-only elongated smear; no opaque full-character smear"). On the frames the KeyPoser asks for (F1–F2
 * of a spaced release) a pale steel sheet joins the blade as it was last drawn to the blade as it is drawn now: the
 * sweep's path for one frame, brightest at the leading edge and the tip, fading to nothing at the trailing edge. It
 * is a shape of the weapon's motion, not a glow (no bloom: it stays under the bright threshold).
 *
 * The held sword (hand-sword.ts) turns in the hand after the caster's update, so the current line is read at draw
 * time (onBeforeRender, world matrices fresh) and the last one at the start of the caster's next update, before the
 * Animator moves the bones. No allocation per frame.
 */
import * as THREE from "three";

/** Smear colour (pale steel) and peak opacity at the leading edge. */
const COLOUR = new THREE.Color(0.82, 0.88, 0.93);
const PEAK = 0.62;
/** The blade starts this share of the way from the grip to the tip (the fist covers the rest). */
const BLADE_FROM = 0.2;

export class BladeSmear {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private sword: THREE.Mesh | null = null;
  private tipLocal = new THREE.Vector3();
  private baseLocal = new THREE.Vector3();
  /** The blade line last drawn (base, tip; world) and whether it was read. */
  private readonly lastA = new THREE.Vector3();
  private readonly lastB = new THREE.Vector3();
  private haveLast = false;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  /** Strength asked for this frame (0–1). */
  strength = 0;

  constructor(
    private readonly model: THREE.Object3D,
    parent: THREE.Object3D,
  ) {
    // Quad strip: 3 rows along the blade (base, middle, tip) × 2 edges (trailing, leading).
    this.pos = new Float32Array(6 * 3);
    this.col = new Float32Array(6 * 4);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    // Vertex k: row r = k >> 1, edge e = k & 1 (0 trailing, 1 leading).
    this.geo.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.name = "bladeSmear";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.onBeforeRender = () => this.build();
    parent.add(this.mesh);
  }

  /** Finds the held sword (once it exists) and its blade line in its own frame. */
  private find(): boolean {
    if (this.sword) return true;
    const sw = this.model.getObjectByName("handSwordMesh") as THREE.Mesh | undefined;
    if (!sw) return false;
    const p = sw.geometry.getAttribute("position");
    let best = -1;
    let d = -1;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).add(sw.position);
      if (v.lengthSq() > d) {
        d = v.lengthSq();
        best = i;
      }
    }
    if (best < 0) return false;
    this.tipLocal.fromBufferAttribute(p, best);
    // The grip's middle is the pivot (mesh.position = −grip): in the mesh's own frame it is −position.
    const grip = sw.position.clone().negate();
    this.baseLocal.copy(grip).lerp(this.tipLocal, BLADE_FROM);
    this.sword = sw;
    return true;
  }

  private line(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const sw = this.sword;
    if (!sw || !sw.visible) return false;
    a.copy(this.baseLocal).applyMatrix4(sw.matrixWorld);
    b.copy(this.tipLocal).applyMatrix4(sw.matrixWorld);
    return true;
  }

  /** Before the caster's update: the blade as it was last drawn. */
  capture(): void {
    this.haveLast = this.find() && this.line(this.lastA, this.lastB);
  }

  /** At draw time: the sheet from the last line to the current one (or nothing). */
  private build(): void {
    const k = this.strength;
    const ok = k > 0.01 && this.haveLast && this.find() && this.line(this.a, this.b);
    const P = this.pos;
    const C = this.col;
    for (let r = 0; r < 3; r += 1) {
      const t = r / 2;
      for (let e = 0; e < 2; e += 1) {
        const o = (r * 2 + e) * 3;
        const A = e === 0 ? this.lastA : this.a;
        const B = e === 0 ? this.lastB : this.b;
        P[o] = A.x + (B.x - A.x) * t;
        P[o + 1] = A.y + (B.y - A.y) * t;
        P[o + 2] = A.z + (B.z - A.z) * t;
        const c = (r * 2 + e) * 4;
        C[c] = COLOUR.r;
        C[c + 1] = COLOUR.g;
        C[c + 2] = COLOUR.b;
        // Leading edge and the tip brightest; the trailing edge fades out.
        C[c + 3] = ok ? PEAK * k * (e === 1 ? 1 : 0) * (0.35 + 0.65 * t) : 0;
      }
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}
