/**
 * Lab-only measuring tools for the sword aura's gates (docs/games/tu-tien/skills/SWORD_AURA.md §6). Nothing here runs
 * unless a scenario asks, and no time passes in any of them (the frame is redrawn as it stands, then put back):
 * - swordMask: the swords drawn alone, flat, coded by geometry (red the blade from bladeFrom to the tip, green the
 *   guard's band with the jade ring, blue the hilt; the blue channel's low bits tell lead blades from mid swords), on
 *   black, straight to the screen (no bloom), so a scenario can screenshot it next to the frame with the aura shown and
 *   hidden ("Kiếm đọc được": the blade's pixels kept, the ring and guard ≥ 95 % at every frame). Far swords (impostors)
 *   are left out: their mantle is drawn under the sword in the same pass, so it cannot cover them.
 * - partsCoverage: each aura part drawn alone (mantle cards, hull, tip stars, the ribbons), counting per pixel how
 *   many parts cover it ("Chồng lớp": ≤ 2 transparent layers per pixel in a sword's region).
 * - AuraGpuTimer: the GPU time of each aura layer's draw (EXT_disjoint_timer_query_webgl2), one layer a frame in turn;
 *   unavailable on ANGLE/Metal (Chrome on macOS), where the scenario falls back to layer-off A/B runs.
 */
import * as THREE from "three";
import { GpuTimer } from "../view/bench/meter";

const MASK_VERTEX = /* glsl */ `
varying float vY;
void main() {
  vY = position.y;
  #include <begin_vertex>
  #include <project_vertex>
}`;

const MASK_FRAGMENT = /* glsl */ `
uniform float uBladeFrom;
uniform float uGuardFrom;
uniform float uCls;
varying float vY;
void main() {
  // Blade red, guard band (the ring, the cloud guard) green, hilt blue; the class in blue's low bits (lead 0, mid 1/8).
  if (vY >= uBladeFrom) gl_FragColor = vec4(1.0, 0.0, uCls, 1.0);
  else if (vY >= uGuardFrom) gl_FragColor = vec4(0.0, 1.0, uCls, 1.0);
  else gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
}`;

function maskMaterial(bladeFrom: number, guardFrom: number, cls: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: MASK_VERTEX,
    fragmentShader: MASK_FRAGMENT,
    uniforms: { uBladeFrom: { value: bladeFrom }, uGuardFrom: { value: guardFrom }, uCls: { value: cls } },
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** Hides every mesh-like object of `scene` except `keep` (and their children); returns what it hid. */
function hideAllBut(scene: THREE.Object3D, keep: readonly THREE.Object3D[]): THREE.Object3D[] {
  const kept = new Set<THREE.Object3D>();
  for (const k of keep) k.traverse((o) => kept.add(o));
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) && o.visible && !kept.has(o)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  return hidden;
}

/**
 * Draws the swords' geometric mask straight to the screen (see the module comment). `lead` and `mid` are the instanced
 * meshes of lead and mid swords; `redraw` puts the frame back afterwards (call it after the screenshot).
 */
export function drawSwordMask(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, lead: readonly THREE.Mesh[], mid: readonly THREE.Mesh[], bladeFrom: number, guardFrom: number): () => void {
  const leadMat = maskMaterial(bladeFrom, guardFrom, 0);
  const midMat = maskMaterial(bladeFrom, guardFrom, 0.125);
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  for (const m of lead) {
    saved.set(m, m.material);
    m.material = leadMat;
  }
  for (const m of mid) {
    saved.set(m, m.material);
    m.material = midMat;
  }
  const hidden = hideAllBut(scene, [...lead, ...mid]);
  const bg = scene.background;
  const fog = scene.fog;
  const shadow = renderer.shadowMap.autoUpdate;
  scene.background = new THREE.Color(0, 0, 0);
  scene.fog = null;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  return () => {
    for (const [m, mat] of saved) m.material = mat;
    for (const o of hidden) o.visible = true;
    scene.background = bg;
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = shadow;
    leadMat.dispose();
    midMat.dispose();
  };
}

/**
 * Each part alone (visible, everything else hidden) into a target: per pixel the number of parts covering it
 * (alpha or light > 1/255). Returns the counts of pixels covered by 1, 2, 3+ parts and the parts' own pixel counts.
 */
export function partsCoverage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, parts: Record<string, readonly THREE.Object3D[]>): { size: number[]; byCount: number[]; parts: Record<string, number> } {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(1, Math.floor(size.x / 2));
  const h = Math.max(1, Math.floor(size.y / 2));
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  const count = new Uint8Array(w * h);
  const buf = new Uint8Array(w * h * 4);
  const own: Record<string, number> = {};
  const bg = scene.background;
  const fog = scene.fog;
  const shadow = renderer.shadowMap.autoUpdate;
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  const clearA = renderer.getClearAlpha();
  // No background: the target clears to transparent black, so only what a part draws counts.
  scene.background = null;
  scene.fog = null;
  renderer.shadowMap.autoUpdate = false;
  for (const [name, objs] of Object.entries(parts)) {
    const shown = objs.filter((o) => o.visible);
    if (shown.length === 0) {
      own[name] = 0;
      continue;
    }
    const hidden = hideAllBut(scene, shown);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    let n = 0;
    for (let i = 0; i < w * h; i += 1) {
      if (buf[i * 4 + 3]! > 1 || buf[i * 4]! > 1 || buf[i * 4 + 1]! > 1 || buf[i * 4 + 2]! > 1) {
        count[i] = count[i]! + 1;
        n += 1;
      }
    }
    own[name] = n;
    for (const o of hidden) o.visible = true;
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearA);
  scene.background = bg;
  scene.fog = fog;
  renderer.shadowMap.autoUpdate = shadow;
  rt.dispose();
  const byCount = [0, 0, 0, 0];
  for (let i = 0; i < w * h; i += 1) {
    const c = Math.min(3, count[i]!);
    byCount[c] = byCount[c]! + 1;
  }
  return { size: [w, h], byCount, parts: own };
}

/** One aura layer's draw timed a frame, in turn (no nested queries: the composer itself issues none). */
export class AuraGpuTimer {
  private readonly timers = new Map<string, GpuTimer>();
  private turn = 0;
  private armed = false;
  private names: string[] = [];
  readonly available: boolean;

  constructor(private readonly renderer: THREE.WebGLRenderer, layers: readonly { readonly layer: string; readonly mesh: THREE.Object3D }[]) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.available = gl.getExtension("EXT_disjoint_timer_query_webgl2") !== null;
    if (!this.available) return;
    for (const { layer, mesh } of layers) {
      const t = new GpuTimer(gl, 4096);
      this.timers.set(layer, t);
      this.names.push(layer);
      let q: WebGLQuery | null = null;
      const before = mesh.onBeforeRender;
      mesh.onBeforeRender = (...args) => {
        before.apply(mesh, args);
        if (this.armed && this.names[this.turn % this.names.length] === layer) q = t.begin();
      };
      mesh.onAfterRender = () => {
        if (q !== null) {
          t.end(q, true);
          q = null;
        }
      };
    }
  }

  arm(on: boolean): void {
    this.armed = on && this.available;
  }

  /** Call once a frame after the draw: polls finished queries and moves to the next layer. */
  frame(): void {
    if (!this.armed) return;
    this.turn += 1;
    for (const t of this.timers.values()) t.poll();
  }

  /** The mean GPU ms per layer so far, or why it is not trusted (GpuTimer.reading; `gpu` the renderer string). */
  report(gpu: string): Record<string, unknown> {
    if (!this.available) return { available: false, note: "EXT_disjoint_timer_query_webgl2 missing (ANGLE/Metal on macOS)" };
    const out: Record<string, unknown> = { available: true };
    for (const [name, t] of this.timers) out[name] = t.reading(1e9, gpu);
    return out;
  }
}
