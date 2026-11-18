/**
 * Perf stress scene (docs/work/tasks/perf-stress.md, 13/11/2026): stress.html loads this module before the skills lab
 * (skills-main.ts, unchanged) and adds, around the lab's own scene:
 * - a one-lane greybox (MAP1_WIDE §13: a 6 m corridor from the far north along x ≈ 0 into the ward edge at z −9) with
 *   ~200 instanced props (Dragonhold's pine-river kit, copied to art-src/lab/models/stress-props);
 * - 13 walkers marching down the lane (wolf, boar, kamaitachi; instanced, a waddle), so with the lab herd (86 beasts and the
 *   king, set to march) 100 foes live at once;
 * - with ?auto=1, Five Thunders (the lab's key G, five-thunder.ts as it is) cast into the herd every 6 s.
 * The lab's renderer, bloom and tone mapping are the game's (createRenderer, applyLook); nothing here changes them.
 * It finds the lab's scene through Scene.onBeforeRender (the first Scene with more than two children) and advances
 * the walkers once per main-scene render: 1/60 s with ?fixed=1 (captures step the lab), else the real time.
 * window.__stress: ready, show({ decor, walkers, actors, fx }), report(), cast(seed).
 * Dev only (not in the build inputs).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { StressOpt } from "./stress-opt";

const params = new URLSearchParams(location.search);
const FIXED = params.get("fixed") === "1";
const AUTO = params.get("auto") === "1";
const ASSETS = "/art-src/lab/";

/** Lane (MAP1_WIDE §13): x ≈ 0, 6 m wide, from the far north (z −46) to the ward edge (z −9). */
const LANE = { x: 0, width: 6, zFar: -46, zNear: -9 } as const;
/** Props: file (stress-props/), how many, target height (m), distance band from the lane centre (m). */
const PROPS: readonly { file: string; n: number; h: number; band: [number, number] }[] = [
  { file: "grass-tuft.glb", n: 50, h: 0.45, band: [3.4, 14] },
  { file: "wildflower-clump.glb", n: 30, h: 0.5, band: [3.4, 14] },
  { file: "reed-clump.glb", n: 22, h: 0.9, band: [3.6, 15] },
  { file: "bush-moss.glb", n: 28, h: 0.9, band: [4, 16] },
  { file: "rock-boulder.glb", n: 22, h: 1.2, band: [4, 17] },
  { file: "cliff-rock-a.glb", n: 10, h: 2.6, band: [7, 18] },
  { file: "cliff-rock-b.glb", n: 10, h: 2.8, band: [7, 18] },
  { file: "lantern-post.glb", n: 14, h: 2.2, band: [3.6, 4.2] },
  { file: "tree-violet.glb", n: 14, h: 4.6, band: [8, 19] },
];
const WALKERS: readonly { file: string; lengthM: number }[] = [
  { file: "blight-wolf.glb", lengthM: 1.55 },
  { file: "tusk-boar.glb", lengthM: 1.7 },
  { file: "kamaitachi.glb", lengthM: 1.05 },
];
const WALKER_COUNT = 13;
const WALK_MPS = 2.6;

interface Drawn { mesh: THREE.InstancedMesh; tris: number }

class Stress {
  scene: THREE.Scene | null = null;
  ready = false;
  readonly decor = new THREE.Group();
  readonly walkers = new THREE.Group();
  private readonly drawn: Drawn[] = [];
  private readonly walkerMeshes: { mesh: THREE.InstancedMesh; ids: number[] }[] = [];
  private readonly wz = new Float32Array(WALKER_COUNT);
  private readonly wx = new Float32Array(WALKER_COUNT);
  private time = 0;
  private last = 0;
  private lastStamp = -1;
  private seed = 2001;
  casts = 0;
  /** Set by stress-opt while it redraws a frozen frame: the walkers do not step. */
  hold = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.decor.name = "stress-decor";
    this.walkers.name = "stress-walkers";
  }

  /** Called once per render of the lab's main scene: the walkers' step. */
  frame(): void {
    if (this.hold) return;
    const now = performance.now();
    if (now - this.lastStamp < 2) return;
    const dt = FIXED ? 1 / 60 : this.last === 0 ? 1 / 60 : Math.min(0.1, (now - this.last) / 1000);
    this.lastStamp = now;
    this.last = now;
    this.time += dt;
    if (!this.ready) return;
    for (let i = 0; i < WALKER_COUNT; i += 1) {
      this.wz[i] = this.wz[i]! + WALK_MPS * dt;
      if (this.wz[i]! > LANE.zNear) this.wz[i] = LANE.zFar + (this.wz[i]! - LANE.zNear);
    }
    for (const { mesh, ids } of this.walkerMeshes) {
      ids.forEach((i, slot) => {
        const bob = Math.abs(Math.sin(this.time * 9 + i)) * 0.05;
        const roll = Math.sin(this.time * 9 + i) * 0.05;
        this.e.set(roll, -Math.PI / 2, 0, "YXZ");
        this.q.setFromEuler(this.e);
        this.p.set(this.wx[i]!, bob, this.wz[i]!);
        mesh.setMatrixAt(slot, this.m.compose(this.p, this.q, this.s));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  async build(scene: THREE.Scene): Promise<void> {
    scene.add(this.decor, this.walkers);
    this.lane();
    // The kit3 props are meshopt-compressed (Dragonhold's LOD pipeline).
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const prop of PROPS) {
      const parts = await this.parts(loader, ASSETS + "models/stress-props/" + prop.file, (box) => prop.h / Math.max(0.01, box.max.y - box.min.y));
      const mats: THREE.Matrix4[] = [];
      for (let k = 0; k < prop.n; k += 1) {
        const side = k % 2 === 0 ? -1 : 1;
        const d = prop.band[0] + rnd() * (prop.band[1] - prop.band[0]);
        const z = LANE.zFar - 4 + rnd() * (LANE.zNear - LANE.zFar + 18);
        const sc = 0.8 + rnd() * 0.45;
        this.e.set(0, rnd() * Math.PI * 2, 0);
        this.q.setFromEuler(this.e);
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(LANE.x + side * d, 0, z), this.q.clone(), new THREE.Vector3(sc, sc, sc)));
      }
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, prop.n);
        mats.forEach((mt, i) => mesh.setMatrixAt(i, mt));
        mesh.name = "stress-prop:" + prop.file;
        mesh.frustumCulled = false;
        this.decor.add(mesh);
        this.drawn.push({ mesh, tris: (part.geometry.index?.count ?? part.geometry.attributes.position!.count) / 3 });
      }
    }
    // Walkers: one instanced mesh per species, ids dealt round-robin.
    for (let i = 0; i < WALKER_COUNT; i += 1) {
      this.wx[i] = LANE.x + (rnd() - 0.5) * (LANE.width - 1.5);
      this.wz[i] = LANE.zFar + (i / WALKER_COUNT) * (LANE.zNear - LANE.zFar);
    }
    for (let k = 0; k < WALKERS.length; k += 1) {
      const def = WALKERS[k]!;
      const ids = [...Array(WALKER_COUNT).keys()].filter((i) => i % WALKERS.length === k);
      const parts = await this.parts(loader, ASSETS + "models/" + def.file, (box) => def.lengthM / Math.max(box.max.x - box.min.x, box.max.z - box.min.z), true);
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, ids.length);
        mesh.name = "stress-walker:" + def.file;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.walkers.add(mesh);
        this.walkerMeshes.push({ mesh, ids });
        this.drawn.push({ mesh, tris: (part.geometry.index?.count ?? part.geometry.attributes.position!.count) / 3 });
      }
    }
    this.ready = true;
    this.frame();
  }

  /** A model's meshes as geometry in model space (feet on the ground, centred, scaled), materials kept. */
  private async parts(loader: GLTFLoader, url: string, scaleOf: (box: THREE.Box3) => number, alongX = false): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[]> {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const scale = scaleOf(box);
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[] = [];
    const turn = alongX && box.max.z - box.min.z > box.max.x - box.min.x;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      g.scale(scale, scale, scale);
      if (turn) g.rotateY(Math.PI / 2);
      out.push({ geometry: g, material: mesh.material });
    });
    return out;
  }

  /** The lane: a darker earth strip and two low stone kerbs (greybox). */
  private lane(): void {
    const len = LANE.zNear - LANE.zFar + 8;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE.width, len), new THREE.MeshStandardMaterial({ color: 0x4a3f31, roughness: 0.96 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(LANE.x, 0.012, (LANE.zFar - 4 + LANE.zNear + 4) / 2);
    strip.name = "stress-lane";
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.85 });
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, len), kerbMat);
      kerb.position.set(LANE.x + side * (LANE.width / 2 + 0.18), 0.09, strip.position.z);
      kerb.name = "stress-kerb";
      this.decor.add(kerb);
    }
    this.decor.add(strip);
  }

  show(o: { decor?: boolean; walkers?: boolean; actors?: boolean; fx?: boolean }): void {
    if (o.decor !== undefined) this.decor.visible = o.decor;
    if (o.walkers !== undefined) this.walkers.visible = o.walkers;
    const lab = window.__lab as unknown as { debugShow(part: string, on: boolean): void } | undefined;
    if (o.actors !== undefined) lab?.debugShow("actors", o.actors);
    if (o.fx !== undefined) lab?.debugShow("fx", o.fx);
  }

  cast(seed = this.seed++): void {
    (window.__lab as unknown as { thunder(cast: boolean, seed: number): unknown } | undefined)?.thunder(true, seed);
    this.casts += 1;
  }

  report(): Record<string, unknown> {
    const props = this.drawn.filter((d) => d.mesh.name.startsWith("stress-prop:"));
    const walk = this.drawn.filter((d) => d.mesh.name.startsWith("stress-walker:"));
    return {
      ready: this.ready,
      props: { meshes: props.length, instances: PROPS.reduce((a, p) => a + p.n, 0), trianglesDrawn: Math.round(props.reduce((a, d) => a + d.tris * d.mesh.count, 0)) },
      walkers: { meshes: walk.length, instances: WALKER_COUNT, trianglesDrawn: Math.round(walk.reduce((a, d) => a + d.tris * d.mesh.count, 0)) },
      perProp: PROPS.map((p) => ({ file: p.file, n: p.n, tris: Math.round(props.filter((d) => d.mesh.name.endsWith(p.file)).reduce((a, d) => a + d.tris, 0)) })),
      casts: this.casts,
      time: this.time,
    };
  }
}

const stress = new Stress();
// Find the lab's scene: the first Scene with more than two children that the renderer draws (post passes draw a quad).
// WebGLRenderer.render is set per instance (three r170), so the hook is Scene.onBeforeRender, which render() calls once
// per scene drawn (meshes keep Object3D's own, so nothing runs per object).
THREE.Scene.prototype.onBeforeRender = function (this: THREE.Scene, renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera): void {
  if (stress.scene === null && this.children.length > 2) {
    stress.scene = this;
    opt.bind(this, renderer, stress);
    void stress.build(this).catch((error: unknown) => console.warn("[stress] build failed", error));
  }
  if (this === stress.scene) {
    opt.camera = camera;
    stress.frame();
  }
};
// Round 2 (keep the picture, cut the cost): stress-opt.ts, window.__opt.
const opt = new StressOpt();
window.__opt = opt;

declare global {
  interface Window {
    __stress?: Stress;
    __opt?: StressOpt;
  }
}
window.__stress = stress;

if (AUTO) {
  // Five Thunders into the herd every 6 s once the lab is up; the herd marches.
  const start = (): void => {
    const lab = window.__lab as unknown as { ready?: boolean; setHerd(mode: string): void } | undefined;
    if (lab?.ready !== true || !stress.ready) {
      setTimeout(start, 500);
      return;
    }
    lab.setHerd("march");
    stress.cast();
    setInterval(() => stress.cast(), 6000);
  };
  start();
}
