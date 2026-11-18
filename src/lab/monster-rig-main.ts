/**
 * Dev-only monster rig test (docs/work/tasks/monster-rig-test.md, owner 16/11/2026).
 * Three existing Wordwoven monsters (troll, tanuki, nuppeppo) rigged in Blender on the canonical bone names
 * (pelvis, spine_01-03, neck_01, head, clavicle/upperarm/lowerarm/hand, thigh/calf/foot/ball, tail_01-04),
 * each with Enemy_Idle / Enemy_Move / Enemy_Attack / Enemy_Hit clips. Attack events (windup_end, release, hit)
 * come from <id>.meta.json and fire on the frame the clip time crosses them.
 *
 * Scene: the game's renderer (createRenderer: tilt 55°, FOV 28°, Neutral tone mapping, bloom on High) with the lab
 * look (applyLook: HDRI and the north-east sun) and the paved field (buildField), as skills-main.ts uses them.
 * Camera: the play tilt and FOV, following the monster (as the game's zoom follows the hero) and fitted so the
 * rest mesh fills ~60 % of the frame height while every pose stays inside 80 % of the frame (10 % margins), centred.
 * The target follows the root exactly (a lagging camera cut the lunge off); only the distance is smoothed.
 * "side" is a closer side view at the same FOV. Plain mixer crossfades only: no inertialization yet.
 * Loaded from /monster-rig-test/ (a link to the owner-review folder).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAMERA } from "../content/rules";
import { createRenderer, placeCamera, VIEW } from "../view/renderer";
import { applyLook, buildField } from "./look";

type Id = "troll" | "tanuki" | "nuppeppo";
type State = "Enemy_Idle" | "Enemy_Move" | "Enemy_Attack" | "Enemy_Hit";
interface Ev { name: string; t: number }
interface Meta { clips: Record<string, { duration: number; loop: boolean; events?: Ev[] }> }

/** Display scale (1 u = 1 m), the stance-foot speed of the IK walk (stride / stance time, model units/s at scale 1), lane x. */
const MON: Record<Id, { scale: number; stance: number; x: number }> = {
  troll: { scale: 2.6, stance: 0.33, x: -2.1 },
  tanuki: { scale: 1.7, stance: 0.333, x: 0 },
  nuppeppo: { scale: 1.5, stance: 0.176, x: 1.9 },
};
const IDS = Object.keys(MON) as Id[];
/** Framing: the envelope's height share of the frame, and the most of the width or height it may take (8 % margins). */
const FRAME = { height: 0.6, maxShare: 0.8, halfLifeS: 0.18 } as const;

const host = document.getElementById("rig") as HTMLDivElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const q = new URLSearchParams(location.search);
const solo = q.get("mon") as Id | null;
const fixed = q.get("fixed") === "1";
if (q.get("hud") === "0") hud.style.display = "none";

const view = createRenderer(host, "high");
if (fixed) view.pinPixelRatio(1);
applyLook(view);
buildField(view, { tint: "#7c848b", repeat: 6 });
const camera = view.camera;

let camMode: "play" | "side" = q.get("cam") === "side" ? "side" : "play";

const flash = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 40), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
flash.rotation.x = -Math.PI / 2;
view.layers.fx.add(flash);
const log: string[] = [];

class Mon {
  readonly root = new THREE.Group();
  mixer!: THREE.AnimationMixer;
  actions = new Map<State, THREE.AnimationAction>();
  meta!: Meta;
  state: State = "Enemy_Idle";
  stateT = 0;
  auto = true;
  homeZ: number;
  fired = new Set<string>();
  /** Every pose of every clip, in root space (metres): the box the camera keeps in frame. */
  readonly envelope = new THREE.Box3();
  /** The rest mesh box in root space: what the 62 % height share is measured on. */
  readonly core = new THREE.Box3();
  /** Root-space framing points: a sample of the rest mesh (core) and every bone's box over all clips (all). */
  readonly corePts: THREE.Vector3[] = [];
  readonly allPts: THREE.Vector3[] = [];
  constructor(readonly id: Id) {
    this.homeZ = 1.6 - 2.5 * MON[id].stance * MON[id].scale;
  }
  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(`/monster-rig-test/${this.id}.glb`);
    this.meta = (await (await fetch(`/monster-rig-test/${this.id}.meta.json`)).json()) as Meta;
    const m = MON[this.id];
    this.root.add(gltf.scene);
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    this.root.scale.setScalar(m.scale);
    view.layers.actors.add(this.root);
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      const loop = this.meta.clips[clip.name]?.loop ?? true;
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      this.actions.set(clip.name as State, a);
    }
    this.measure(gltf.animations);
    this.root.position.set(m.x, 0, this.homeZ);
    this.set("Enemy_Idle");
  }
  /**
   * Framing points in root space: a sample of the rest mesh (core), and for each of ~200 sampled vertices the box it
   * sweeps when skinned through every frame of every clip (all). Bone boxes alone missed the tanuki's big head.
   */
  private measure(clips: THREE.AnimationClip[]): void {
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.envelope.setFromObject(this.root);
    this.core.copy(this.envelope);
    const meshes: THREE.SkinnedMesh[] = [];
    this.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    const samples: { mesh: THREE.SkinnedMesh; index: number; box: THREE.Box3 }[] = [];
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute("position");
      const coreStride = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += coreStride) this.corePts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
      const stride = Math.max(1, Math.floor(pos.count / 200));
      for (let i = 0; i < pos.count; i += stride) samples.push({ mesh, index: i, box: new THREE.Box3() });
    }
    const v = new THREE.Vector3();
    for (const clip of clips) {
      this.mixer.stopAllAction();
      this.mixer.clipAction(clip).reset().play();
      for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) {
        this.mixer.setTime(t);
        this.root.updateMatrixWorld(true);
        for (const sm of samples) {
          sm.mesh.getVertexPosition(sm.index, v);
          sm.box.expandByPoint(v.applyMatrix4(sm.mesh.matrixWorld));
        }
      }
    }
    this.mixer.stopAllAction();
    for (const sm of samples) {
      const b = sm.box;
      b.min.y = Math.max(0, b.min.y);
      this.envelope.union(b);
      for (let i = 0; i < 8; i += 1) this.allPts.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    }
  }
  set(s: State): void {
    const prev = this.actions.get(this.state);
    const next = this.actions.get(s)!;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, s === "Enemy_Attack" ? 0.12 : 0.18, false);
    this.state = s;
    this.stateT = 0;
    this.fired.clear();
  }
  /** Fire clip events on the frame the clip time crosses them (view only; the sim would own damage). */
  private events(t0: number, t1: number): void {
    const evs = this.meta.clips[this.state]?.events ?? [];
    for (const e of evs) {
      if (e.t > t0 && e.t <= t1 + 1e-6 && !this.fired.has(e.name)) {
        this.fired.add(e.name);
        log.unshift(`${this.id} ${this.state.replace("Enemy_", "")} ${e.name} @${e.t.toFixed(3)}s`);
        log.length = Math.min(log.length, 6);
        if (e.name === "hit") {
          flash.position.set(this.root.position.x, 0.04, this.root.position.z + 0.2 * MON[this.id].scale);
          (flash.material as THREE.MeshBasicMaterial).opacity = 1;
          flash.scale.setScalar(0.3 * MON[this.id].scale);
        }
      }
    }
  }
  update(dt: number): void {
    const t0 = this.stateT;
    this.stateT += dt;
    this.events(t0, this.stateT);
    if (this.state === "Enemy_Move") {
      // Zero-slide speed: the stance foot's measured ground speed times the model scale.
      this.root.position.z += MON[this.id].stance * MON[this.id].scale * dt;
    }
    if (this.auto) this.autoStep();
    this.mixer.update(dt);
  }
  private autoStep(): void {
    const dur = (s: State): number => this.meta.clips[s]?.duration ?? 1;
    if (this.state === "Enemy_Idle" && this.stateT > 0.8) this.set("Enemy_Move");
    else if (this.state === "Enemy_Move" && this.root.position.z > 1.6) this.set("Enemy_Attack");
    else if (this.state === "Enemy_Attack" && this.stateT > dur("Enemy_Attack") + 0.1) this.set("Enemy_Hit");
    else if (this.state === "Enemy_Hit" && this.stateT > dur("Enemy_Hit") + 0.2) { this.set("Enemy_Idle"); this.root.position.z = this.homeZ; camReady = false; }
  }
}

const mons = new Map<Id, Mon>();
let activeKey: Id = solo ?? "troll";

// Framing: the group's pose envelope, centred, at FRAME.height of the frame.
const groupBox = new THREE.Box3();
const coreBox = new THREE.Box3();
const corner = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();
const wantTarget = new THREE.Vector3();
const right = new THREE.Vector3();
const upV = new THREE.Vector3();
let camDist = 0;
let wantDist = 0;
let camReady = false;

function updateGroupBox(): void {
  groupBox.makeEmpty();
  coreBox.makeEmpty();
  for (const m of mons.values()) {
    coreBox.expandByPoint(corner.copy(m.core.min).add(m.root.position));
    coreBox.expandByPoint(corner.copy(m.core.max).add(m.root.position));
    groupBox.expandByPoint(corner.copy(m.envelope.min).add(m.root.position));
    groupBox.expandByPoint(corner.copy(m.envelope.max).add(m.root.position));
  }
}
function aim(target: THREE.Vector3, dist: number): void {
  if (camMode === "play") {
    placeCamera(camera, CAMERA.defaultTiltDeg, dist, target.x, target.z, target.y);
    return;
  }
  // Closer side view: from the monster's left (+x), 25° above the horizon (ground behind, no horizon).
  const up = THREE.MathUtils.degToRad(25);
  camDir.set(Math.cos(up), Math.sin(up), 0);
  camera.position.copy(target).addScaledVector(camDir, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}
/** NDC extents of the shown monsters' framing points (all poses, or the rest mesh only). */
interface Ext { minX: number; maxX: number; minY: number; maxY: number }
const extAll: Ext = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
const extCore: Ext = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
function extents(which: "all" | "core" = "all"): Ext {
  const ext = which === "all" ? extAll : extCore;
  ext.minX = ext.minY = Infinity;
  ext.maxX = ext.maxY = -Infinity;
  for (const m of mons.values()) {
    const pts = which === "all" ? m.allPts : m.corePts;
    for (const pt of pts) {
      corner.copy(pt).add(m.root.position).project(camera);
      if (corner.x < ext.minX) ext.minX = corner.x;
      if (corner.x > ext.maxX) ext.maxX = corner.x;
      if (corner.y < ext.minY) ext.minY = corner.y;
      if (corner.y > ext.maxY) ext.maxY = corner.y;
    }
  }
  return ext;
}
/** The distance and target that put the group box at FRAME.height of the frame (or the 80 % limit: 10 % margins), centred. */
function fit(): void {
  camera.fov = VIEW.fovDeg;
  camera.updateProjectionMatrix();
  groupBox.getCenter(wantTarget);
  wantTarget.y = (groupBox.getCenter(corner).y + coreBox.getCenter(corner).y) / 2;
  for (let pass = 0; pass < 3; pass += 1) {
    let lo = 1, hi = 200;
    for (let k = 0; k < 26; k += 1) {
      const mid = (lo + hi) / 2;
      aim(wantTarget, mid);
      const c = extents("core");
      const hc = (c.maxY - c.minY) / 2;
      const e = extents();
      const h = (e.maxY - e.minY) / 2, w = (e.maxX - e.minX) / 2;
      if (Math.max(hc / FRAME.height, h / FRAME.maxShare, w / FRAME.maxShare) > 1) lo = mid; else hi = mid;
    }
    wantDist = hi;
    aim(wantTarget, wantDist);
    const e = extents();
    const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * wantDist;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    upV.setFromMatrixColumn(camera.matrixWorld, 1);
    wantTarget.addScaledVector(right, cx * halfH * camera.aspect).addScaledVector(upV, cy * halfH);
  }
}
function placeView(dt: number): void {
  updateGroupBox();
  fit();
  if (!camReady || dt <= 0) { camTarget.copy(wantTarget); camDist = wantDist; camReady = true; }
  else {
    const k = 1 - Math.pow(0.5, dt / FRAME.halfLifeS);
    camTarget.copy(wantTarget);
    camDist += (wantDist - camDist) * k;
  }
  aim(camTarget, camDist);
}

function hudText(): string {
  const m = mons.get(activeKey);
  return `monster: ${activeKey}  state: ${m?.state ?? "-"} t=${(m?.stateT ?? 0).toFixed(2)}s  camera: ${camMode} (tilt ${CAMERA.defaultTiltDeg}°, FOV ${VIEW.fovDeg}°)\n` +
    `keys 1/2/3 monster  W walk  A attack  H hit  I idle  SPACE auto  C camera\n` + log.join("\n");
}
function manual(s: State): void {
  const m = mons.get(activeKey);
  if (!m) return;
  m.auto = false;
  if (s === "Enemy_Move") m.root.position.z = m.homeZ;
  m.set(s);
}
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "1") activeKey = "troll";
  else if (k === "2") activeKey = "tanuki";
  else if (k === "3") activeKey = "nuppeppo";
  else if (k === "w") manual("Enemy_Move");
  else if (k === "a") manual("Enemy_Attack");
  else if (k === "h") manual("Enemy_Hit");
  else if (k === "i") manual("Enemy_Idle");
  else if (k === " ") { for (const m of mons.values()) m.auto = true; }
  else if (k === "c") { camMode = camMode === "play" ? "side" : "play"; camReady = false; }
});

function advance(dt: number): void {
  for (const m of mons.values()) m.update(dt);
  const mat = flash.material as THREE.MeshBasicMaterial;
  mat.opacity = Math.max(0, mat.opacity - dt * 4);
  flash.scale.addScalar(dt * 1.5);
  placeView(dt);
  view.render(Math.max(dt, 1 / 60));
  hud.textContent = hudText();
}

async function main(): Promise<void> {
  const ids = solo ? [solo] : IDS;
  await Promise.all(ids.map(async (id) => { const m = new Mon(id); await m.load(); mons.set(id, m); }));
  // A slight stagger so the three do not act in lockstep, small enough to keep the group together.
  ids.forEach((id, i) => { mons.get(id)!.stateT = -i * 0.2; });
  const w = window as unknown as Record<string, unknown>;
  w.__rig = {
    advance,
    canvas: view.canvas,
    set: (id: Id, s: State) => { const m = mons.get(id)!; m.auto = false; m.root.position.z = m.homeZ; m.set(s); },
    setCam: (mode: "play" | "side") => { camMode = mode; camReady = false; },
    /** The group envelope's NDC extents from the camera as drawn (framing check). */
    frameShare: () => { const e = { ...extents() }; const c = extents("core"); return { ...e, coreH: (c.maxY - c.minY) / 2 }; },
    mons,
    camera,
    ready: true,
  };
  if (!fixed) {
    let last = performance.now();
    const loop = (now: number): void => {
      advance(Math.min((now - last) / 1000, 0.05));
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else advance(0);
}
void main();
