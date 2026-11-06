/** B4: existing Firefly paintings only; VFX_STANDARD, cut-in material table (07/11). */
import * as THREE from "three";
import { FlipbookPlayer, ONE_FRAME, type FlipbookLibrary, type FlipbookPool, type FlipOptions } from "../view/skills/flipbook";

const FOLDER = "cutin-mat";
const INK = "cutin-ink-wash-sweep";
const CLOUD = "cutin-cloud-wipe";
const SPEED = "cutin-speed-lines-loop";
const GOLD = "cutin-gold-rays";
const EMBER = "cutin-ember-drift";
const PETALS = "cutin-light-petals-drift";
const BLOOM = "cutin-ink-bloom";
export const CUTIN_MATERIAL_IDS = [INK, CLOUD, SPEED, GOLD, EMBER, PETALS, BLOOM] as const;
export type CutInMaterialId = typeof CUTIN_MATERIAL_IDS[number];
export interface CutInMaterialPlan {
  readonly open: CutInMaterialId;
  readonly shout: CutInMaterialId;
  readonly climax: CutInMaterialId | null;
  readonly drift: CutInMaterialId | null;
  readonly stamp: null; // Waiting for the replacement clip: the current take shows a stamp handle.
  readonly close: CutInMaterialId;
}

export function cutInMaterialPlan(element: string): CutInMaterialPlan {
  return {
    open: ["water", "wind", "light", "ice"].includes(element) ? CLOUD : INK,
    shout: SPEED,
    climax: ["light", "star", "metal"].includes(element) ? GOLD : null,
    drift: ["fire", "metal", "thunder", "blood"].includes(element) ? EMBER :
      ["wood", "light", "water", "wind"].includes(element) ? PETALS : null,
    stamp: null,
    close: BLOOM,
  };
}

export function cutInMaterialsEnabled(search: string): boolean {
  return new URLSearchParams(search).get("cutinmat") !== "0";
}

type Surface = Pick<THREE.WebGLRenderer, "domElement" | "setPixelRatio" | "setSize" | "setClearColor" | "render" | "clear">;
type RendererFactory = () => Surface;
type Slot = { id: CutInMaterialId; pool: FlipbookPool; options: FlipOptions; selected: boolean };
const INK_TINT = new THREE.Color(0.045, 0.06, 0.075);

/** A transparent, clipped DOM layer; all sprites live behind the painting and the title. */
export class CutInMaterials {
  readonly enabled: boolean;
  private player: FlipbookPlayer | null = null;
  private library: FlipbookLibrary | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly at = new THREE.Vector3();
  private readonly slots: Slot[] = [];
  private renderer: Surface | null = null;
  private failed = false;
  private running = false;
  private plan: CutInMaterialPlan = cutInMaterialPlan("metal");
  private seconds = 0;
  private shoutAt = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly parent: HTMLElement, search = "", private readonly makeRenderer: RendererFactory = () =>
    new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" })) {
    this.enabled = cutInMaterialsEnabled(search);
    this.camera.position.z = 2;
    this.camera.updateMatrixWorld();
  }

  private initialise(): boolean {
    if (this.renderer !== null) return true;
    if (this.failed) return false;
    try {
      this.renderer = this.makeRenderer();
    } catch (error) {
      this.failed = true;
      console.warn("[cutin-mat] WebGL unavailable", error);
      return false;
    }
    const r = this.renderer;
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none";
    // The parent already clips/translates the band. Keep the canvas before every portrait/title node.
    this.parent.prepend(r.domElement);
    this.player = new FlipbookPlayer("/art-src/lab/vfx/");
    this.scene.add(this.player.group);
    this.library = this.player.library(FOLDER, () => true);
    for (let i = 0; i < CUTIN_MATERIAL_IDS.length; i += 1) {
      const id = CUTIN_MATERIAL_IDS[i]!;
      const pool = this.player.pool(FOLDER, id, { mode: id === INK || id === BLOOM ? "smoke" : "fire", capacity: 1, renderOrder: i });
      const m = pool.mesh.material;
      m.depthTest = false;
      // The world pools preserve destination alpha. A transparent DOM canvas must write its own coverage.
      // Only adapt compositing; the existing shader still samples the painted atlas, with no new shapes.
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      m.uniforms.uTagK = { value: new THREE.Vector3(1, 1, 1) };
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("void main() {", "void cutinAtlasMain() {") +
          "\nvoid main() {\n cutinAtlasMain();\n gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 0.9);\n" +
          " gl_FragColor.a = max(gl_FragColor.a, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)) / 0.9);\n}\n";
      };
      m.customProgramCacheKey = () => "cutin-material-alpha-v1";
      this.slots.push({ id, pool, selected: false, options: {
        life: ONE_FRAME, rate: 0, frame: 0, fadeIn: 0, fadeOut: 0, occlude: 0,
        intensity: id === SPEED ? 0.18 : id === GOLD ? 0.16 : 0.14,
        tint: pool.mode === "smoke" ? INK_TINT : undefined,
      } });
    }
    return true;
  }

  /** Network work starts only on use, and fetches only the selected atlases, never the pending stamp. */
  start(element: string, seconds: number, shoutAt: number): boolean {
    this.stop();
    if (!this.enabled || !this.initialise()) return false;
    this.plan = cutInMaterialPlan(element);
    this.seconds = seconds;
    this.shoutAt = shoutAt;
    this.running = true;
    for (const s of this.slots) {
      const p = this.plan;
      s.selected = s.id === p.open || s.id === p.shout || s.id === p.climax || s.id === p.drift || s.id === p.close;
      if (s.selected) void this.prepare(s.id);
    }
    this.renderer!.domElement.style.display = "block";
    return true;
  }

  private async prepare(id: CutInMaterialId): Promise<void> {
    const lib = this.library!;
    await lib.load();
    if (lib.deferred(id)) await lib.fetchAtlas(id);
  }

  /** Absolute cut-in time: late atlas arrivals join the current frame and cannot restart cancelled effects. */
  draw(time: number, width: number, height: number, shoutAt = this.shoutAt): void {
    if (!this.running) return;
    if (time < 0 || time >= this.seconds) { this.stop(); return; }
    const r = this.renderer!;
    if (width !== this.width || height !== this.height) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      r.setSize(this.width, this.height, false);
      this.camera.left = -this.width / this.height;
      this.camera.right = this.width / this.height;
      this.camera.updateProjectionMatrix();
    }
    const closeAt = Math.max(0, this.seconds - 0.14);
    const openEnd = Math.min(0.2, closeAt);
    const p = this.plan;
    for (const s of this.slots) {
      const pool = s.pool;
      pool.clear();
      if (!s.selected || !pool.ready || this.library!.deferred(s.id)) continue;
      let age = time;
      let progress = -1;
      if (s.id === p.open) {
        if (time >= openEnd) continue;
        progress = time / openEnd;
      } else if (s.id === p.close) {
        if (time < closeAt) continue;
        progress = (time - closeAt) / (this.seconds - closeAt);
      } else if (s.id === p.shout) {
        if (time < openEnd || time >= closeAt) continue;
        age = time - openEnd;
      } else if (s.id === p.climax) {
        if (time < shoutAt || time >= closeAt) continue;
        age = time - shoutAt;
      }
      const m = pool.meta!;
      s.options.frame = m.start + (progress >= 0 ? progress * (m.frames - m.start - 1) : age * m.fps % (m.frames - m.start));
      // Full canvas coverage, while honouring the manifest's off-centre pivot.
      pool.mesh.scale.x = this.width / this.height / m.aspect;
      this.at.set((m.pivot[0] - 0.5) * 2 * m.aspect, (0.5 - m.pivot[1]) * 2, 0);
      pool.spawn(this.at, 2, s.options);
    }
    this.player!.update(0);
    r.render(this.scene, this.camera);
  }

  stop(): void {
    this.running = false;
    this.player?.clear();
    if (this.renderer !== null) {
      this.renderer.clear();
      this.renderer.domElement.style.display = "none";
    }
  }
}
