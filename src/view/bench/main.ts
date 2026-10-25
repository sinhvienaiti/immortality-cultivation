/**
 * bench.html entry: the HN0 bench (canon §20.3). `?case=` runs a case:
 * base (0), crowd-proc (A), crowd-vat (B), vankiem (C: B + a "vạn kiếm" every
 * 4 s from the tier's sword pool, ~60 hits a second with sparks and damage
 * numbers, ink smoke on deaths), impostor (D: C with the crowd as impostors),
 * skinned (E: C + the tier's SkinnedMesh cap through walker-rig). `?q=` tier,
 * `?count=` N (60 / 120 / 300), `?seconds=` (10), `?warmup=` (2), `?vat=` a
 * baked VAT for the confirmation pass (`{q}` becomes the tier), `?steps=`
 * ladder steps, `?motion=full` (set when measuring: the Dell's Windows
 * reports reduce). The result lands on `window.__icBench`; `__icBenchStop()`
 * ends the page's loop, `__icBenchCamera(preset)` moves the camera for
 * pictures (55° like the game, canon D48). Without `?case=` the page lists the
 * cases. Driven by scripts/visual/scenarios/ic-bench.mjs.
 * Owner: Lane 1.
 */
import * as THREE from "three";
import { createRenderer, fitCamera, placeCamera, type Renderer3D } from "../renderer";
import { CLIP, CROWD_LOOKS, createCrowd, type Crowd, type CrowdKindCounts, type ImpostorRule } from "../crowd";
import { disposeVat, loadVat, type VatAsset } from "../vat";
import { createSwords, type SwordPool } from "../swords";
import { STYLE, createDamageNumbers, createHitFx, createInkSmoke, type DamageNumbers, type HitFx, type InkSmoke } from "../hitfx";
import { createWalker, type Walker } from "../walker-rig";
import { CAMERA, TT_BUDGETS } from "../../content/rules";
import { BENCH_COUNTS, BENCH_CASE_IDS, BENCH_VANKIEM, BUILT_CASES, L4_KEEP, benchUrl, crowdModeOf, hasSwords, parseBenchCase, type BenchCase } from "./cases";
import { buildBenchField } from "./field";
import { benchRandom, HERD_MIX, Herd } from "./herd";
import { buildPlaceholderRig, skinnedRoles, type RigKind } from "./rigs";
import { budgetOf, FrameMeter, GpuTimer, heapMb, reducedMotion, round2, sceneTextureBytes, softwareRenderer, targetBytes, type BenchResult } from "./meter";

export type BenchCameraPreset = "default" | "close" | "heart";

export interface BenchError {
  readonly error: string;
}

declare global {
  interface Window {
    /** The finished run (or why it could not run). */
    __icBench?: BenchResult | BenchError;
    /** Stops the page's loop and frees the GPU. */
    __icBenchStop?: () => void;
    /** Moves the camera for pictures (never while measuring). */
    __icBenchCamera?: (preset: BenchCameraPreset) => void;
    /** Frames drawn so far (the scenario's allocation profile divides by it). */
    __icBenchFrame?: number;
  }
}

const MB = 1024 * 1024;

function pageStyle(doc: Document): HTMLElement {
  doc.body.style.cssText = "margin:0;overflow:hidden;background:#0b0f16;color:#d9dee8;font:14px/1.5 system-ui,sans-serif";
  const host = doc.getElementById("ic-bench") ?? doc.body.appendChild(doc.createElement("div"));
  host.style.cssText = "position:fixed;inset:0";
  return host;
}

function label(host: HTMLElement, text: string): HTMLElement {
  const tag = document.createElement("div");
  tag.dataset.role = "bench-label";
  tag.style.cssText = "position:absolute;left:10px;top:8px;z-index:2;padding:3px 8px;border-radius:4px;background:rgba(11,15,22,.72);color:#e8ecf4;font:12px/1.4 ui-monospace,monospace;pointer-events:none;white-space:pre";
  tag.textContent = text;
  host.append(tag);
  return tag;
}

/** Without ?case=: links to every case and tier (Vietnamese UI). */
function showMenu(host: HTMLElement): void {
  host.style.cssText = "position:fixed;inset:0;overflow:auto;padding:24px;box-sizing:border-box";
  const title = document.createElement("h1");
  title.textContent = "Bench HN0 (canon §20.3)";
  title.style.cssText = "font-size:22px;margin:0 0 8px";
  const note = document.createElement("p");
  note.textContent = "Ca 0 nền, A đám đông procedural, B VAT, C vạn kiếm, D impostor, E có xương. Đo thật: scripts/visual/scenarios/ic-bench.mjs trên Chrome Windows có GPU.";
  note.style.color = "#aab3c5";
  const list = document.createElement("ul");
  const origin = location.origin;
  for (const quality of ["low", "medium", "high"] as const) {
    for (const id of BENCH_CASE_IDS) {
      const counts = id === "base" ? [0] : BENCH_COUNTS;
      for (const count of counts) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = benchUrl(origin, { id, quality, count: id === "base" ? undefined : count, motion: "full" });
        link.textContent = quality + " · " + id + (id === "base" ? "" : " · N " + count);
        link.style.color = BUILT_CASES.includes(id) ? "#7ff5e0" : "#6b7385";
        item.append(link);
        list.append(item);
      }
    }
  }
  host.append(title, note, list);
}

function showError(host: HTMLElement, error: string): void {
  window.__icBench = { error };
  label(host, "Bench HN0: " + error);
}

/** The impostor rule the ladder steps ask for (L5 over L4 over L3). */
function ruleOf(c: BenchCase): ImpostorRule {
  if (c.steps.includes("L5")) return { kind: "plain" };
  if (c.steps.includes("L4")) return { kind: "far", keep: L4_KEEP[c.quality] };
  if (c.steps.includes("L3")) return { kind: "swarm" };
  return { kind: "none" };
}

/** A walking rig of case E and its little routine (view only). */
interface Actor {
  readonly walker: Walker;
  readonly kind: RigKind;
  readonly role: number;
  x: number;
  z: number;
  /** Home spot and a second spot it walks to and from. */
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  t: number;
  leg: number;
}

/** Where each role stands and walks (m): the player circles near the heart, the others shuttle. */
const ACTOR_SPOTS: readonly (readonly [number, number, number, number])[] = [
  [0, 1.6, 0, 1.6],
  [-4, 2.5, -4, -1.5],
  [4, 2.5, 4, -1.5],
  [-12, -14, -5.5, -6],
  [7.5, -11, 7.5, -11],
  [-7, 4.5, -2.5, 5.5],
  [7, 4.5, 2.5, 5.5],
  [-10, 0, -10, -4],
  [10, 0, 10, -4],
  [0, 5.5, 0, 3.5],
];

/** Everything a case draws besides the field, updated once a frame. */
class BenchScene {
  crowd: Crowd | null = null;
  herd: Herd | null = null;
  swords: SwordPool | null = null;
  sparks: HitFx | null = null;
  numbers: DamageNumbers | null = null;
  smoke: InkSmoke | null = null;
  readonly actors: Actor[] = [];
  vat: VatAsset | null = null;
  private readonly struck = { index: -1, tier: 0 };
  private readonly random: () => number;
  private hitCarry = 0.5;
  /** The first cast lands in the warm-up (0.25 s in), then every 4 s: 3 casts in a 10 s window. */
  private castClock = BENCH_VANKIEM.everyS - 0.25;
  private zone = 0;
  readonly stats = { swordsMax: 0, sparksMax: 0, numbersMax: 0, smokeMax: 0, hits: 0, casts: 0 };
  readonly kinds: CrowdKindCounts = { procedural: 0, vat: 0, impostor: 0 };

  constructor(private readonly c: BenchCase) {
    this.random = benchRandom(c.seed + 3);
  }

  async build(renderer: Renderer3D): Promise<void> {
    const c = this.c;
    const mode = crowdModeOf(c.id);
    if (mode !== null) {
      if (c.vat !== null && mode !== "procedural") {
        const url = c.vat.replace("{q}", c.quality === "ultra" ? "high" : c.quality);
        this.vat = await loadVat(url);
      }
      const vat = this.vat;
      this.crowd = createCrowd(renderer, mode, {
        capacity: c.count + 8,
        lodTris: c.lodTris,
        seed: c.seed,
        ...(vat !== null ? { vat: () => vat } : {}),
        impostorRule: ruleOf(c),
      });
      // Bakes (VAT, atlases) before the clock starts.
      for (const species of HERD_MIX) this.crowd.prepare(species);
      this.herd = new Herd(this.crowd, c.count, benchRandom(c.seed));
      this.herd.update(0);
      this.crowd.update(0);
    }
    if (hasSwords(c.id)) {
      const budget = TT_BUDGETS[c.quality];
      const l1 = c.steps.includes("L1");
      this.swords = createSwords(renderer, c.swords, { seed: c.seed, vfxShare: l1 ? 0.5 : 1 });
      // Sparks share the tier's particle budget with the ink smoke (canon §20.2).
      this.sparks = createHitFx(renderer, { capacity: Math.round(budget.particles * 0.75), share: l1 ? 0.5 : 1, seed: c.seed });
      this.numbers = createDamageNumbers(renderer, budget.numbers);
      this.smoke = createInkSmoke(renderer, Math.round(budget.particles * 0.25), c.seed);
    }
    if (c.id === "skinned") {
      skinnedRoles(c.skinned).forEach((kind, role) => {
        const rig = buildPlaceholderRig(kind);
        const walker = createWalker(rig.object, rig.clips);
        const spot = ACTOR_SPOTS[role % ACTOR_SPOTS.length]!;
        walker.root.position.set(spot[0], 0, spot[1]);
        renderer.layers.actors.add(walker.root);
        this.actors.push({ walker, kind, role, x: spot[0], z: spot[1], ax: spot[0], az: spot[1], bx: spot[2], bz: spot[3], t: role * 0.37, leg: 0 });
      });
    }
  }

  /** Rigs drawn, their triangles and bones (case E). */
  skinnedSummary(): BenchResult["skinned"] {
    if (this.actors.length === 0) return null;
    let triangles = 0;
    let bones = 0;
    for (const actor of this.actors) {
      triangles += actor.walker.triangles;
      bones += actor.walker.bones;
    }
    return { count: this.actors.length, triangles, bones, kinds: this.actors.map((a) => a.kind + " " + Math.round(a.walker.triangles / 2) + " tam giác thân, " + a.walker.bones + " xương") };
  }

  update(dt: number, measuring: boolean): void {
    const herd = this.herd;
    if (herd !== null) herd.update(dt);
    if (this.swords !== null && herd !== null) this.vankiem(dt, herd, measuring);
    this.stepActors(dt);
    this.crowd?.update(dt);
    if (this.swords !== null) {
      this.swords.update(dt);
      this.sparks!.update(dt);
      this.numbers!.update(dt);
      this.smoke!.update(dt);
      if (measuring) {
        const s = this.stats;
        if (this.swords.live > s.swordsMax) s.swordsMax = this.swords.live;
        if (this.sparks!.live > s.sparksMax) s.sparksMax = this.sparks!.live;
        if (this.numbers!.live > s.numbersMax) s.numbersMax = this.numbers!.live;
        if (this.smoke!.live > s.smokeMax) s.smokeMax = this.smoke!.live;
      }
    }
  }

  /** Case C: a cast every 4 s from the caster to one gate's corridor, 60 hits a second, smoke on deaths. */
  private vankiem(dt: number, herd: Herd, measuring: boolean): void {
    this.castClock += dt;
    if (this.castClock >= BENCH_VANKIEM.everyS) {
      this.castClock -= BENCH_VANKIEM.everyS;
      this.zone = 1 - this.zone;
      const caster = this.actors[0];
      const x = caster !== undefined ? caster.x : 0;
      const z = caster !== undefined ? caster.z : 1.6;
      this.swords!.cast(x, z, this.zone === 0 ? -7.5 : 7.5, -10);
      caster?.walker.play("Cast_Short");
      if (measuring) this.stats.casts += 1;
    }
    this.hitCarry += BENCH_VANKIEM.hitsPerSecond * dt;
    while (this.hitCarry >= 1) {
      this.hitCarry -= 1;
      herd.strike(this.struck);
      const index = this.struck.index;
      if (index < 0) continue;
      const beast = herd.beasts[index]!;
      const look = CROWD_LOOKS[beast.species];
      const y = look.hoverM + look.sizeM[1] * 0.6;
      const tier = this.struck.tier;
      this.sparks!.spark(beast.x, y, beast.z, tier);
      const amount = Math.round(20 + this.random() * 380);
      this.numbers!.show(beast.serial, amount, beast.x, y, beast.z, tier, this.random() < 0.1 ? STYLE.perfect : STYLE.normal);
      if (measuring) this.stats.hits += 1;
    }
    for (let k = 0; k < herd.deaths; k += 1) this.smoke!.puff(herd.deathX[k]!, 0, herd.deathZ[k]!, herd.deathSize[k]!);
  }

  /** Case E's routines: the player circles and casts, bots and spares shuttle, the general paces a corridor, the Vương roars and bites. */
  private stepActors(dt: number): void {
    for (let k = 0; k < this.actors.length; k += 1) {
      const actor = this.actors[k]!;
      actor.t += dt;
      const walker = actor.walker;
      let vx = 0;
      let vz = 0;
      if (actor.role === 0) {
        const angle = actor.t * 0.6;
        const nx = actor.ax + Math.sin(angle) * 2.2;
        const nz = actor.az + Math.cos(angle) * 1.4;
        vx = nx - actor.x;
        vz = nz - actor.z;
        actor.x = nx;
        actor.z = nz;
        walker.setLocomotion(Math.sin(actor.t * 0.5) > 0.6 ? "dash" : "run");
      } else if (actor.kind === "boss") {
        walker.setLocomotion("idle");
        if (actor.t > 3) {
          actor.t -= 3;
          actor.leg = (actor.leg + 1) % 3;
          walker.play(actor.leg === 0 ? "Roar" : actor.leg === 1 ? "Attack" : "Stagger");
        }
      } else {
        // Shuttle between the two spots, a breath at each end.
        const legS = 3;
        const phase = actor.t % (legS * 2 + 2);
        const going = phase < legS ? 0 : phase < legS + 1 ? -1 : phase < legS * 2 + 1 ? 1 : -2;
        if (going === 0 || going === 1) {
          const u = going === 0 ? phase / legS : (phase - legS - 1) / legS;
          const fx = going === 0 ? actor.ax : actor.bx;
          const fz = going === 0 ? actor.az : actor.bz;
          const tx = going === 0 ? actor.bx : actor.ax;
          const tz = going === 0 ? actor.bz : actor.az;
          const nx = fx + (tx - fx) * u;
          const nz = fz + (tz - fz) * u;
          vx = nx - actor.x;
          vz = nz - actor.z;
          actor.x = nx;
          actor.z = nz;
          walker.setLocomotion("run");
        } else walker.setLocomotion("idle");
      }
      walker.root.position.set(actor.x, 0, actor.z);
      if (vx * vx + vz * vz > 1e-8) walker.root.rotation.y = Math.atan2(vx, vz);
      else if (actor.kind === "boss") walker.root.rotation.y = Math.atan2(-actor.x, -actor.z);
      walker.update(dt);
    }
  }

  kindsNow(): CrowdKindCounts {
    if (this.crowd !== null) this.crowd.kinds(this.kinds);
    return this.kinds;
  }

  textureBytes(scene: THREE.Object3D): number {
    const skip = this.crowd?.textures().map((t) => t.uuid) ?? [];
    return sceneTextureBytes(scene, skip) + (this.crowd?.textureBytes() ?? 0) + (this.numbers?.textureBytes() ?? 0);
  }

  dispose(): void {
    this.crowd?.dispose();
    this.swords?.dispose();
    this.sparks?.dispose();
    this.numbers?.dispose();
    this.smoke?.dispose();
    for (const actor of this.actors) actor.walker.dispose();
    // A baked VAT is shared by every layer and owned by the page.
    if (this.vat !== null) disposeVat(this.vat);
  }
}

/** Runs one case; resolves with the result and keeps drawing until __icBenchStop(). */
export async function runBench(host: HTMLElement, c: BenchCase): Promise<BenchResult> {
  const renderer: Renderer3D = createRenderer(host, c.quality);
  const field = buildBenchField(c.seed);
  renderer.layers.ground.add(field);
  const scene = new BenchScene(c);
  await scene.build(renderer);
  const tag = label(
    host,
    "HN0 · " + c.id + " · " + c.quality + (c.count > 0 ? " · N " + c.count : "") + " · " + renderer.stage.size.width + "×" + renderer.stage.size.height + (c.steps.length > 0 ? " · " + c.steps.join("+") : "") + (scene.vat !== null ? " · VAT " + scene.vat.id : ""),
  );
  const gl = renderer.stage.renderer.getContext() as WebGL2RenderingContext;
  const gpuTimer = new GpuTimer(gl);
  // Every material compiled before the clock starts.
  renderer.stage.renderer.compile(renderer.scene, renderer.camera);
  const meter = new FrameMeter();
  const gpu = renderer.info().gpu;
  const invalid = softwareRenderer(gpu);
  let manualCamera = false;
  window.__icBenchCamera = (preset) => {
    manualCamera = preset !== "default";
    // Closer looks for pictures (readability), never measured, at the game's tilt: gate A's corridor, the heart.
    if (preset === "close") placeCamera(renderer.camera, CAMERA.defaultTiltDeg, 27, -8, -11, 0);
    else if (preset === "heart") placeCamera(renderer.camera, CAMERA.defaultTiltDeg, 26, 0, -3, 0);
    else fitCamera(renderer.camera, renderer.stage.size.width / renderer.stage.size.height);
  };

  // Chrome with --js-flags=--expose-gc: one full GC just before the window, so the heap growth
  // starts from a clean heap (live-heap drift). Uncapped, three.js alone allocates a few KB a
  // frame and young-generation GCs run inside the window: allocation per frame is measured by the
  // scenario's sampling heap profile (ALLOC), the criterion of record (M0A_PLAN §6.1 note).
  const forceGc = (window as Window & { gc?: () => void }).gc;
  const start = performance.now();
  let last = start;
  let frameIndex = 0;
  let gcFrame = -1;
  let heapStart: number | null = null;
  let measuringFrom = -1;
  let finished = false;
  let running = true;
  let resolveDone: (result: BenchResult) => void = () => {};
  const done = new Promise<BenchResult>((resolve) => (resolveDone = resolve));

  const finish = (): BenchResult => {
    finished = true;
    const summary = meter.summary();
    const heapEnd = heapMb();
    const size = renderer.stage.size;
    const kinds = scene.kindsNow();
    const swords = scene.swords;
    const result: BenchResult = {
      case: c.id,
      quality: c.quality,
      count: c.count,
      frames: meter.frames,
      ...summary,
      ...gpuTimer.reading(summary.frameMeanMs, gpu),
      drawCalls: meter.lastDrawCalls,
      triangles: meter.lastTriangles,
      drawCallsMax: meter.drawCallsMax,
      instances: { procedural: kinds.procedural, vat: kinds.vat, impostor: kinds.impostor, skinned: scene.actors.length },
      fx: swords === null ? null : { ...scene.stats, pool: swords.capacity },
      skinned: scene.skinnedSummary(),
      vatSource: scene.crowd === null || scene.crowd.mode === "procedural" ? null : (scene.vat?.source ?? "in-page"),
      crowdTris: scene.crowd === null ? null : (scene.vat?.triangles ?? c.lodTris),
      steps: c.steps,
      textureMb: round2(scene.textureBytes(renderer.scene) / MB),
      targetsMb: round2(targetBytes(renderer.stage) / MB),
      heapStartMb: heapStart === null ? null : round2(heapStart),
      heapEndMb: heapEnd === null ? null : round2(heapEnd),
      heapGrowthMb: heapStart === null || heapEnd === null ? null : round2(heapEnd - heapStart),
      heapGc: forceGc !== undefined,
      gpu,
      width: size.width,
      height: size.height,
      dpr: renderer.stage.renderer.getPixelRatio(),
      reducedMotion: reducedMotion(),
      motion: c.motion,
      valid: invalid === null,
      invalidReason: invalid,
      seconds: c.seconds,
      warmup: c.warmup,
      budget: budgetOf(c.quality),
      at: new Date().toISOString(),
    };
    tag.textContent += "\nTB " + result.frameMeanMs + " ms · p95 " + result.frameP95Ms + " ms · CPU p95 " + result.cpuP95Ms + " ms · " + result.drawCalls + " draw" + (result.valid ? "" : " · KHÔNG HỢP LỆ: " + invalid);
    return result;
  };

  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const interval = now - last;
    last = now;
    const elapsed = (now - start) / 1000;
    frameIndex += 1;
    window.__icBenchFrame = frameIndex;
    if (gcFrame < 0 && elapsed > c.warmup - 0.25) {
      gcFrame = frameIndex;
      forceGc?.();
    }
    // The frame after the GC carries its pause in its interval: the window starts one frame later.
    const measuring = !finished && !manualCamera && elapsed > c.warmup && gcFrame >= 0 && frameIndex > gcFrame + 1;
    if (measuring && measuringFrom < 0) {
      measuringFrom = now;
      heapStart = heapMb();
    }
    const t0 = performance.now();
    const dt = Math.min(0.05, interval / 1000);
    scene.update(dt, measuring);
    const query = gpuTimer.begin();
    renderer.render(dt);
    gpuTimer.end(query, measuring);
    gpuTimer.poll();
    const spent = performance.now() - t0;
    if (!measuring) return;
    // The first measured frame's interval still spans the warm-up's last frame: keep it (it is a real frame).
    const info = renderer.stage.renderer.info.render;
    meter.record(interval, spent, info.calls, info.triangles);
    if ((now - measuringFrom) / 1000 >= c.seconds) {
      const result = finish();
      window.__icBench = result;
      resolveDone(result);
    }
  };
  requestAnimationFrame(frame);
  window.__icBenchStop = () => {
    if (!running) return;
    running = false;
    gpuTimer.dispose();
    scene.dispose();
    renderer.dispose();
  };
  return done;
}

function main(): void {
  const host = pageStyle(document);
  const parsed = parseBenchCase(location.search);
  if (parsed === null) {
    showMenu(host);
    return;
  }
  if ("error" in parsed) {
    showError(host, parsed.error);
    return;
  }
  const fail = (error: unknown): void => showError(host, String(error instanceof Error ? error.message : error));
  try {
    void runBench(host, parsed).catch(fail);
  } catch (error) {
    fail(error);
  }
}

/** For tests: the clip ids the herd plays (re-exported so the bench keeps one CLIP table). */
export const BENCH_CLIPS = CLIP;

main();
