/**
 * Screen-space pose probe for the skills lab (dev-only, never built; motion round 4, MOTION_PLAN "Vòng 4"). It
 * measures what the play camera shows of the caster's body, the pose rules of ChatGPT's step 1:
 * - silhouette width (the projected skinned body plus the held sword) against Idle's;
 * - hand and weapon separation outside the torso silhouette (px, and in character heights): the distance on screen
 *   from the palm and the sword's tip to the projected trunk and head (0 when they overlap it);
 * - hip drop (pelvis height against Idle's: share of the hip height and of the body height);
 * - coil (the shoulder line's heading against the pelvis line's, deg) and how it grows key by key;
 * - the longest stretch while typing in which no tracked point (hands, elbows, sword tip, head, chest) moves more than
 *   2 % of the hero's height on screen (1 px at 50 px): a "visually static" interval;
 * - key to body: frames from the last key to the first visible motion of the sword or hand, and to 85 % of the
 *   release's travel on screen.
 * The camera comes from the caster mesh's own onBeforeRender (no hook in the skills lab's main file); call
 * `sample()` after a frame drawn at the play camera. Skinned vertices are posed on the CPU (getVertexPosition), so
 * the silhouette is exact. Also hosts the authoring hooks (__labPose.preview, freeze, bodyOnly).
 */
import * as THREE from "three";
import { PoseAuthor, posesSource, type SkillSpec } from "./anim/pose-author";
import type { KeyPoser } from "./anim/key-pose";
import { HERO } from "./hero-select";
import type { LabCaster } from "./caster";

const TORSO = /^(pelvis|spine_0\d|neck_01|head|clavicle_[lr])$/;
const ARM_R = /_r$/;
const LEG = /^(thigh|calf|foot|ball)_/;

/** Tracked points for the static test and the release onset. */
const TRACK = ["hand_r", "hand_l", "lowerarm_r", "lowerarm_l", "head", "spine_03"];

interface Sample {
  f: number;
  stage: string;
  phase: number;
  w: number;
  /** Screen points (px): tracked bones, then the sword tip, the palm. */
  pts: number[];
  widthPx: number;
  heightPx: number;
  handSepPx: number;
  handLSepPx: number;
  tipSepPx: number;
  hipDropM: number;
  coilDeg: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class PoseProbe {
  private readonly cam = new THREE.PerspectiveCamera();
  private haveCam = false;
  private mesh: THREE.SkinnedMesh | null = null;
  /** Per vertex: 0 torso, 1 right arm, 2 left arm, 3 legs. */
  private part: Uint8Array = new Uint8Array(0);
  /** Torso triangles (vertex indices). */
  private torsoTris: Uint32Array = new Uint32Array(0);
  /** Projected vertices (px), this sample. */
  private proj: Float32Array = new Float32Array(0);
  private idleHip = 0;
  private idleWidth = 0;
  private idleHeight = 0;
  private samples: Sample[] = [];
  private keyFrames: number[] = [];
  private f = 0;
  private readonly bones = new Map<string, THREE.Object3D>();
  private author: PoseAuthor | null = null;

  constructor(private readonly caster: LabCaster) {
    const model = caster.model;
    if (!model) return;
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && this.mesh === null) this.mesh = m;
      this.bones.set(o.name, o);
    });
    const mesh = this.mesh;
    if (!mesh) return;
    const prev = mesh.onBeforeRender;
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      prev.call(mesh, renderer, scene, camera, geometry, material, group);
      const c = camera as THREE.PerspectiveCamera;
      this.cam.matrixWorld.copy(c.matrixWorld);
      this.cam.matrixWorldInverse.copy(c.matrixWorldInverse);
      this.cam.projectionMatrix.copy(c.projectionMatrix);
      this.cam.projectionMatrixInverse.copy(c.projectionMatrixInverse);
      this.haveCam = true;
    };
    const g = mesh.geometry;
    const n = g.getAttribute("position").count;
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    this.part = new Uint8Array(n);
    this.proj = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      let best = 0;
      for (let k = 1; k < 4; k += 1) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      const name = mesh.skeleton.bones[si.getComponent(i, best)]?.name ?? "";
      this.part[i] = TORSO.test(name) ? 0 : LEG.test(name) ? 3 : ARM_R.test(name) ? 1 : 2;
    }
    const index = g.getIndex();
    const tris: number[] = [];
    if (index) {
      for (let t = 0; t + 2 < index.count; t += 3) {
        const a = index.getX(t);
        const b = index.getX(t + 1);
        const c = index.getX(t + 2);
        if (this.part[a] === 0 && this.part[b] === 0 && this.part[c] === 0) tris.push(a, b, c);
      }
    }
    this.torsoTris = Uint32Array.from(tris);
  }

  private get poser(): KeyPoser | null {
    return this.caster.anim ? this.caster.anim.keyPoses : null;
  }

  /** World point → screen px (CSS), into out[0..1]. */
  private project(p: THREE.Vector3, out: number[], o: number): void {
    _w.copy(p).applyMatrix4(this.cam.matrixWorldInverse).applyMatrix4(this.cam.projectionMatrix);
    out[o] = (_w.x * 0.5 + 0.5) * innerWidth;
    out[o + 1] = (-_w.y * 0.5 + 0.5) * innerHeight;
  }

  /** The held sword's tip and guard in world space (the hand-sword mesh's farthest vertex from the grip). */
  private swordTip(out: THREE.Vector3): boolean {
    const sw = this.caster.model?.getObjectByName("handSwordMesh") as THREE.Mesh | undefined;
    if (!sw || !sw.visible) return false;
    const pos = sw.geometry.getAttribute("position");
    if (this.tipIndex < 0) {
      // Farthest from the pivot (the grip's middle) along the blade: the tip.
      let best = -1;
      let d = -1;
      for (let i = 0; i < pos.count; i += 1) {
        _a.fromBufferAttribute(pos, i).add(sw.position);
        const l = _a.lengthSq();
        if (l > d) {
          d = l;
          best = i;
        }
      }
      this.tipIndex = best;
    }
    out.fromBufferAttribute(pos, this.tipIndex).applyMatrix4(sw.matrixWorld);
    return true;
  }
  private tipIndex = -1;

  /** Distance (px) from (x, y) to the projected torso (0 inside). */
  private torsoDistance(x: number, y: number): number {
    const P = this.proj;
    const T = this.torsoTris;
    let best = Infinity;
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t]! * 2;
      const b = T[t + 1]! * 2;
      const c = T[t + 2]! * 2;
      const ax = P[a]!, ay = P[a + 1]!, bx = P[b]!, by = P[b + 1]!, cx = P[c]!, cy = P[c + 1]!;
      // Inside test (either winding).
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) return 0;
      const e = Math.min(segDist(x, y, ax, ay, bx, by), segDist(x, y, bx, by, cx, cy), segDist(x, y, cx, cy, ax, ay));
      if (e < best) best = e;
    }
    return best;
  }

  /** Projects the body; returns [width, height] px and fills `proj`. */
  private projectBody(): [number, number] {
    const mesh = this.mesh;
    if (!mesh) return [0, 0];
    mesh.updateMatrixWorld(true);
    const n = this.part.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const P = this.proj;
    const tmp = [0, 0];
    for (let i = 0; i < n; i += 1) {
      mesh.getVertexPosition(i, _v);
      _v.applyMatrix4(mesh.matrixWorld);
      this.project(_v, tmp, 0);
      P[i * 2] = tmp[0]!;
      P[i * 2 + 1] = tmp[1]!;
      if (tmp[0]! < x0) x0 = tmp[0]!;
      if (tmp[0]! > x1) x1 = tmp[0]!;
      if (tmp[1]! < y0) y0 = tmp[1]!;
      if (tmp[1]! > y1) y1 = tmp[1]!;
    }
    if (this.swordTip(_a)) {
      this.project(_a, tmp, 0);
      x0 = Math.min(x0, tmp[0]!);
      x1 = Math.max(x1, tmp[0]!);
      y0 = Math.min(y0, tmp[1]!);
      y1 = Math.max(y1, tmp[1]!);
    }
    this.bbox = [x0, y0, x1, y1];
    return [x1 - x0, y1 - y0];
  }
  private bbox: [number, number, number, number] = [0, 0, 0, 0];

  private heading(a: string, b: string): number {
    const A = this.bones.get(a);
    const B = this.bones.get(b);
    if (!A || !B) return 0;
    A.getWorldPosition(_a);
    B.getWorldPosition(_b);
    return Math.atan2(_b.x - _a.x, _b.z - _a.z);
  }

  /** The hero's size on screen now (px; call standing at Idle) and its box. */
  size(): { widthPx: number; heightPx: number; box: number[] } {
    const [w, h] = this.projectBody();
    return { widthPx: round(w), heightPx: round(h), box: this.bbox.map(round) };
  }

  /** Starts a measured cast: reads Idle's width, height and hip height now (standing). */
  begin(): Record<string, number> {
    this.samples = [];
    this.keyFrames = [];
    this.f = 0;
    this.lastKeyCount = this.poser ? this.poser.keyCount : -1;
    const [w, h] = this.projectBody();
    this.idleWidth = w;
    this.idleHeight = h;
    const pelvis = this.bones.get("pelvis");
    this.idleHip = pelvis ? pelvis.getWorldPosition(_a).y : 1;
    return { widthPx: round(w), heightPx: round(h), hipM: round(this.idleHip) };
  }

  private lastKeyCount = -1;

  /** Screen direction (deg, 0 up, 90 right) from the caster's feet to the ground point (x, z) at the play camera. */
  screenDir(x: number, z: number): number {
    const a = [0, 0];
    const b = [0, 0];
    this.project(_a.set(this.caster.x, 0, this.caster.z), a, 0);
    this.project(_b.set(x, 0, z), b, 0);
    return round((Math.atan2(b[0]! - a[0]!, -(b[1]! - a[1]!)) * 180) / Math.PI);
  }

  /** One drawn frame at the play camera. Returns the frame's stage and numbers (for labelled captures). */
  sample(): Record<string, number | string> {
    if (!this.haveCam || !this.mesh) return { stage: "none" };
    const kpNow = this.poser;
    if (kpNow) {
      if (this.lastKeyCount >= 0 && kpNow.keyCount !== this.lastKeyCount) this.keyFrames.push(this.f);
      this.lastKeyCount = kpNow.keyCount;
    }
    const [w, h] = this.projectBody();
    const pts: number[] = [];
    for (const nm of TRACK) {
      const b = this.bones.get(nm);
      if (b) b.getWorldPosition(_v);
      else _v.set(0, 0, 0);
      this.project(_v, pts, pts.length);
    }
    const hasTip = this.swordTip(_a);
    this.project(hasTip ? _a : _v.set(0, 0, 0), pts, pts.length);
    const palm = this.caster.model?.getObjectByName("FX_HAND_R") ?? this.bones.get("hand_r");
    palm?.getWorldPosition(_b);
    this.project(_b, pts, pts.length);
    const palmL = this.caster.model?.getObjectByName("FX_HAND_L") ?? this.bones.get("hand_l");
    palmL?.getWorldPosition(_b);
    const pl = [0, 0];
    this.project(_b, pl, 0);
    const handSepPx = this.torsoDistance(pts[pts.length - 2]!, pts[pts.length - 1]!);
    const handLSepPx = this.torsoDistance(pl[0]!, pl[1]!);
    const tipSepPx = hasTip ? this.torsoDistance(pts[TRACK.length * 2]!, pts[TRACK.length * 2 + 1]!) : 0;
    const pelvis = this.bones.get("pelvis");
    const hip = pelvis ? pelvis.getWorldPosition(_a).y : this.idleHip;
    const coil = wrapDeg(((this.heading("upperarm_l", "upperarm_r") - this.heading("thigh_l", "thigh_r")) * 180) / Math.PI);
    const kp = this.poser;
    const s: Sample = {
      f: this.f,
      stage: kp && kp.active ? kp.stage : "off",
      phase: kp ? kp.phase : 0,
      w: kp ? kp.weight : 0,
      pts,
      widthPx: w,
      heightPx: h,
      handSepPx,
      handLSepPx,
      tipSepPx,
      hipDropM: this.idleHip - hip,
      coilDeg: coil,
    };
    this.samples.push(s);
    this.f += 1;
    return { f: s.f, stage: s.stage, phase: round(s.phase), w: round(s.w), widthPx: round(w), heightPx: round(h), handSepPx: round(handSepPx), tipSepPx: round(tipSepPx), hipDropM: round(s.hipDropM), coilDeg: round(coil), cx: round((this.bbox[0] + this.bbox[2]) / 2), cy: round((this.bbox[1] + this.bbox[3]) / 2) };
  }

  /** The measured cast's pose-rule numbers (MOTION_PLAN "Vòng 4"), with px at 30, 50 and 70 px hero heights. */
  report(): Record<string, unknown> {
    const S = this.samples;
    const H = this.idleHeight || 1;
    const at = (px: number, k: number): number => round((px / H) * k);
    const stageOf = (st: string[]): Sample[] => S.filter((s) => st.includes(s.stage));
    const charge = stageOf(["charge"]);
    const release = stageOf(["release", "hold"]);
    const follow = stageOf(["follow", "settle"]);
    const max = (arr: Sample[], f: (s: Sample) => number): number => arr.reduce((m, s) => Math.max(m, f(s)), 0);
    const lastCharge = charge[charge.length - 1];
    const hold = S.find((s) => s.stage === "hold");
    const sepAt = (s: Sample | undefined): Record<string, number> | null =>
      s ? { handPx: round(s.handSepPx), handLPx: round(s.handLSepPx), tipPx: round(s.tipSepPx), handH: round(s.handSepPx / H, 3), handLH: round(s.handLSepPx / H, 3), tipH: round(s.tipSepPx / H, 3), width: round(s.widthPx / (this.idleWidth || 1), 2) } : null;
    // Static stretches while typing: every tracked point within 2 % of the hero height of where the stretch began.
    const thr = 0.02 * H;
    let longest = 0;
    let longestAt = -1;
    let run = 0;
    let anchor: Sample | null = null;
    for (const s of charge) {
      if (anchor && s.pts.every((v, i) => Math.abs(v - anchor!.pts[i]!) <= thr)) run += 1;
      else {
        anchor = s;
        run = 1;
      }
      if (run > longest) {
        longest = run;
        longestAt = anchor.f;
      }
    }
    // Key to body: the last charge frame, the first visible motion of the tip or the palm, 85 % of the release travel.
    let onset = -1;
    let reach85 = -1;
    const first = S.findIndex((s) => s.stage === "release");
    const endRel = S.findIndex((s) => s.stage === "hold");
    if (first >= 0) {
      const p0 = S[Math.max(0, first - 1)]!;
      const ti = TRACK.length * 2;
      const pi = ti + 2;
      const p1 = endRel >= 0 ? S[endRel]! : S[Math.min(S.length - 1, first + 5)]!;
      const travel = Math.hypot(p1.pts[ti]! - p0.pts[ti]!, p1.pts[ti + 1]! - p0.pts[ti + 1]!);
      for (let k = first; k < S.length; k += 1) {
        const s = S[k]!;
        const dTip = Math.hypot(s.pts[ti]! - p0.pts[ti]!, s.pts[ti + 1]! - p0.pts[ti + 1]!);
        const dPalm = Math.hypot(s.pts[pi]! - p0.pts[pi]!, s.pts[pi + 1]! - p0.pts[pi + 1]!);
        if (onset < 0 && Math.max(dTip, dPalm) > thr) onset = k - first;
        if (reach85 < 0 && travel > 0 && dTip >= 0.85 * travel) reach85 = k - first;
      }
    }
    const coilAtKeys = this.keyFrames.map((f) => round(S[Math.min(S.length - 1, f + 3)]?.coilDeg ?? 0));
    return {
      idle: { widthPx: round(this.idleWidth), heightPx: round(H), hipM: round(this.idleHip) },
      frames: S.length,
      chargeFrames: charge.length,
      widthRatio: { charge: round(max(charge, (s) => s.widthPx) / (this.idleWidth || 1), 2), release: round(max(release, (s) => s.widthPx) / (this.idleWidth || 1), 2), follow: round(max(follow, (s) => s.widthPx) / (this.idleWidth || 1), 2) },
      hipDrop: { m: round(max(S, (s) => s.hipDropM), 3), hipShare: round(max(S, (s) => s.hipDropM) / (this.idleHip || 1), 3), heightShare: round(max(S, (s) => s.hipDropM) / HERO.heightM, 3) },
      coil: { maxDeg: round(max(charge, (s) => Math.abs(s.coilDeg))), atKeys: coilAtKeys, releaseDeg: round(hold ? hold.coilDeg : 0) },
      separation: { maxCoil: sepAt(lastCharge), release: sepAt(hold), follow: sepAt(follow[Math.floor(follow.length / 2)]) },
      separationPx: {
        maxCoil: lastCharge ? { hand: [at(lastCharge.handSepPx, 30), at(lastCharge.handSepPx, 50), at(lastCharge.handSepPx, 70)], handL: [at(lastCharge.handLSepPx, 30), at(lastCharge.handLSepPx, 50), at(lastCharge.handLSepPx, 70)], tip: [at(lastCharge.tipSepPx, 30), at(lastCharge.tipSepPx, 50), at(lastCharge.tipSepPx, 70)] } : null,
        release: hold ? { hand: [at(hold.handSepPx, 30), at(hold.handSepPx, 50), at(hold.handSepPx, 70)], handL: [at(hold.handLSepPx, 30), at(hold.handLSepPx, 50), at(hold.handLSepPx, 70)], tip: [at(hold.tipSepPx, 30), at(hold.tipSepPx, 50), at(hold.tipSepPx, 70)] } : null,
      },
      staticLongestMs: round((longest * 1000) / 60),
      staticFrom: longestAt,
      keyFrames: this.keyFrames,
      keyToBody: { onsetFrames: onset, reach85Frames: reach85 },
      note: "px at 30/50/70 scale the measured px by hero height (projection is affine at this size); static: all tracked points within 2 % of hero height",
    };
  }

  // ── Authoring (round 4) ────────────────────────────────────────────────

  /** Bakes a skill spec for this rig and plays it on `slot` now (no file written). Returns the baked source. */
  preview(slot: string, spec: SkillSpec): string {
    const anim = this.caster.anim;
    if (!anim) return "";
    if (!this.author) {
      const g = HERO.grip;
      const t = (g.tiltDeg * Math.PI) / 180;
      const local = new THREE.Vector3(0, Math.sin(t), Math.cos(t)).applyAxisAngle(new THREE.Vector3(0, 1, 0), (g.yawDeg * Math.PI) / 180);
      this.author = new PoseAuthor(anim.rig, this.caster.root, local);
    }
    const skill = this.author.skill(spec);
    anim.keyPoses.add(slot, skill);
    return posesSource(skill);
  }

  /** Holds the key-pose skill on `slot` at `phase` (0–5) at full weight (stills while authoring); null lets go. */
  freeze(slot: string | null, phase = 0): void {
    const kp = this.poser;
    if (!kp) return;
    if (slot === null) kp.unfreeze();
    else kp.freeze(slot, phase);
  }

  /** Body-only view: hides every actor but the caster and the sword's tassel (beasts), or shows them again. */
  bodyOnly(on: boolean): void {
    const layer = this.caster.root.parent;
    if (!layer) return;
    for (const c of layer.children) if (c !== this.caster.root && c.name !== "tassel") c.visible = !on;
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function wrapDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function round(v: number, k = 1): number {
  const m = Math.pow(10, k);
  return Math.round(v * m) / m;
}
