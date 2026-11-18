/** Owner 17/11: small qi blades surround one real Tripo sword; `?swordLook=aura|energy` keeps the comparisons.
 * Material only: shares the Tripo geometry and the rain's instance matrices. */
import * as THREE from "three";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";

export type SwordLook = "mix" | "aura" | "energy";
/** Capture-only isolation: 0 all, 1 small, 2 giant, 3 hidden. Shared with the real sword material. */
export const SWORD_LOOK_PROBE = { value: 0 };
let probeLayer: SwordLookLayer | null = null;
/** Linear, pre-bloom radiance on black; excludes scenery, damage numbers and temporal post effects. */
export const measureSwordLook = () => artProbeLayer?.measure() ?? probeLayer?.measure() ?? null;
export const swordArtSnapshot = () => artProbeLayer?.snapshot() ?? null;
export const swordLook = (): SwordLook => {
  const v = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("swordLook");
  return v === "aura" || v === "energy" ? v : "mix";
};

const VERTEX = /* glsl */ `
attribute float iSeed;
attribute vec2 iDissolve;
varying vec2 vDissolve;
uniform float uLook;
uniform float uCap;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vSeed;
void main() {
  vLocal = position; vSeed = iSeed; vDissolve = iDissolve;
  float giant = step(uCap - 0.5, iSeed);
  float look = uLook == 0.0 ? mix(2.0, 1.0, giant) : uLook;
  vec3 p = position + normal * (look == 1.0 ? 0.03 : 0.004);
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAGMENT = /* glsl */ `
varying vec2 vDissolve;
uniform float uTime; uniform float uLook; uniform float uCap;
uniform float uSwordProbe;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vSeed;
void main() {
  if (vLocal.y < 0.0) discard;
  float giant = step(uCap - 0.5, vSeed);
  if (uSwordProbe == 3.0 || (uSwordProbe == 1.0 && giant > 0.5) || (uSwordProbe == 2.0 && giant < 0.5)) discard;
  float look = uLook == 0.0 ? mix(2.0, 1.0, giant) : uLook;
  if ((look == 1.0 && gl_FrontFacing) || (look == 2.0 && !gl_FrontFacing)) discard;
  float decay = smoothstep(vDissolve.x, vDissolve.y, uTime);
  float grain = fract(sin(dot(floor(vLocal * 80.0), vec3(12.9898, 78.233, 37.719)) + vSeed) * 43758.5453);
  if (decay >= 1.0 || grain < decay) discard;
  float facing = abs(dot(normalize(vN), vV)), fres = pow(1.0 - facing, 2.0);
  float strength = mix(uLook == 0.0 ? 0.26 : 0.5, 1.0, giant) * (1.0 - 0.6 * decay);
  vec3 col;
  float alpha = 1.0;
  if (look == 1.0) {
    col = vec3(1.0, 0.7, 0.26) * (0.18 + 0.82 * fres) * strength;
  } else {
    float flow = 0.7 + 0.3 * sin(vLocal.y * 34.0 - uTime * 9.0 + vSeed * 1.7);
    // The Tripo silhouette supplies the shape; a narrow spine and soft rim dress it with qi.
    float core = uLook == 0.0 ? (1.0 - smoothstep(0.004, 0.022, abs(vLocal.x))) * (1.0 - smoothstep(0.58, 0.72, vLocal.y)) : pow(facing, 6.0);
    if (uLook == 0.0) {
      alpha = mix(0.32, 0.8, facing) * mix(0.7, 1.0, core);
      // 433f: a readable tip throughout the fall; body and soft rim retain the mixed look.
      alpha = max(alpha, 0.65 * (1.0 - smoothstep(0.03, 0.12, vLocal.y)));
    }
    float k = strength * (uLook == 2.0 ? 1.0 + 0.5 * (1.0 - giant) : 1.0);
    col = (vec3(1.0, 0.66, 0.18) * (0.4 + 0.9 * fres) * flow + vec3(1.0, 0.9, 0.62) * core * 0.6) * k;
  }
  gl_FragColor = vec4(min(col, vec3(0.9)), alpha);
}`;

export class SwordLookLayer {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  constructor(readonly look: SwordLook, private readonly base: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
    time: THREE.IUniform<number>, capacity: number) {
    const material = new THREE.ShaderMaterial({ uniforms: { ...TAG_UNIFORMS, uTime: time, uLook: { value: look === "mix" ? 0 : look === "aura" ? 1 : 2 },
      uCap: { value: capacity }, uSwordProbe: SWORD_LOOK_PROBE }, vertexShader: VERTEX, fragmentShader: withTagMask(FRAGMENT), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(base.geometry, material, capacity);
    this.mesh.instanceMatrix = base.instanceMatrix; this.mesh.count = 0;
    this.mesh.name = "fx-metal-rain-sword-" + look; this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    this.mesh.onBeforeRender = (renderer, scene, camera) => { this.renderer = renderer; this.scene = scene; this.camera = camera; };
    probeLayer = this;
    base.parent?.add(this.mesh);
    if (look === "energy") base.visible = false;
    
  }
  sync(count: number): void { this.mesh.count = count; }
  measure(): { small: number; giant: number; ratio: number | null; size: number[] } | null {
    const r = this.renderer, scene = this.scene, camera = this.camera;
    if (r === null || scene === null || camera === null) return null;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: true });
    const data = new Uint16Array(size.x * size.y * 4), shown = new Map<THREE.Object3D, boolean>();
    const previous = r.getRenderTarget(), background = scene.background, clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    const probe = SWORD_LOOK_PROBE.value, autoClear = r.autoClear, viewport = r.getViewport(new THREE.Vector4());
    const scissor = r.getScissor(new THREE.Vector4()), scissorTest = r.getScissorTest();
    const peaks: number[] = [];
    try {
      scene.traverse(o => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points || o instanceof THREE.Line)) return;
        shown.set(o, o.visible); o.visible = (o === this.base || o === this.mesh) && o.visible;
      });
      scene.background = null; r.setClearColor(0, 1); r.autoClear = true; r.setScissorTest(false);
      for (const mode of [1, 2]) {
        SWORD_LOOK_PROBE.value = mode; r.setRenderTarget(target); r.clear(); r.render(scene, camera);
        r.readRenderTargetPixels(target, 0, 0, size.x, size.y, data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 4) peak = Math.max(peak, 0.2126 * THREE.DataUtils.fromHalfFloat(data[i]!)
          + 0.7152 * THREE.DataUtils.fromHalfFloat(data[i + 1]!) + 0.0722 * THREE.DataUtils.fromHalfFloat(data[i + 2]!));
        peaks.push(peak);
      }
      return { small: peaks[0]!, giant: peaks[1]!, ratio: peaks[1]! > 0 && peaks[0]! > 0 ? peaks[1]! / peaks[0]! : null, size: size.toArray() };
    } finally {
      SWORD_LOOK_PROBE.value = probe; for (const [o, visible] of shown) o.visible = visible;
      scene.background = background; r.setClearColor(clear, alpha); r.autoClear = autoClear; r.setRenderTarget(previous);
      r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest); target.dispose();
    }
  }
  dispose(): void { if (probeLayer === this) probeLayer = null; this.mesh.removeFromParent(); this.mesh.material.dispose(); }
}

interface SwordAtlas { cols: number; rows: number; frames: number; fps: number; cell: number[]; }
let artProbeLayer: ArtSwordLookLayer | null = null;
/** 433g: original Tripo geometry, stock PBR emission and undistorted authored cards.
 * SwordLookLayer above is archived for comparison; the rain no longer constructs it. */
export class ArtSwordLookLayer {
  readonly group = new THREE.Group();
  private readonly swords: { root: THREE.Group; body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]; giant: boolean }[] = [];
  private readonly cardGeometry: THREE.PlaneGeometry[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly cameraAt = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly along = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private aura: THREE.Texture | null = null;
  private auraMeta: SwordAtlas | null = null;
  constructor(readonly look: SwordLook, private readonly base: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
    private readonly time: THREE.IUniform<number>, capacity: number) {
    this.group.name = "fx-metal-rain-art-swords"; base.parent?.add(this.group);
    base.visible = false; // Matrix carrier only, never rendered with the archived shader.
    const streakGeometry = new THREE.PlaneGeometry(0.42, 0.42 / 8); // qi-streak-1: 512 x 64.
    this.cardGeometry.push(streakGeometry);
    for (let i = 0; i < capacity; i++) {
      const giant = i === capacity - 1, energy = !giant && look !== "aura";
      const material = base.material.clone();
      material.transparent = true;
      if (energy) {
        material.emissiveMap = null; material.vertexColors = false;
        material.depthWrite = true; material.toneMapped = false;
        material.map = null; material.normalMap = null; material.roughnessMap = null; material.metalnessMap = null;
        material.color.setRGB(0.025, 0.012, 0.002); material.metalness = 0; material.roughness = 1;
        material.emissive.setRGB(1, 0.7, 0.15); material.emissiveIntensity = 0.55;
      }
      const body = new THREE.Mesh(base.geometry, material), root = new THREE.Group();
      root.matrixAutoUpdate = false; root.visible = false; root.add(body); this.group.add(root);
      body.name = giant ? "fx-metal-rain-giant-pbr" : "fx-metal-rain-small-pbr";
      body.renderOrder = 9; body.frustumCulled = false;
      body.onBeforeRender = (r, s, c) => { this.renderer = r; this.scene = s; this.camera = c; };
      const cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
      if (energy) for (let j = 0; j < 2; j++) {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.38, 0.26, 0.07), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const card = new THREE.Mesh(streakGeometry, m); card.position.y = 0.23 + j * 0.42;
        card.quaternion.copy(this.along); card.renderOrder = 10; root.add(card); cards.push(card);
      }
      this.swords.push({ root, body, cards, giant });
    }
    artProbeLayer = this;
  }
  attach(streak: THREE.Texture, aura: THREE.Texture, meta: SwordAtlas): void {
    this.aura = aura; this.auraMeta = meta;
    // Long source axis becomes the sword's vertical axis by rotation, never by stretching.
    const geometry = new THREE.PlaneGeometry(1, meta.cell[1]! / meta.cell[0]!); this.cardGeometry.push(geometry);
    aura.repeat.set(1 / meta.cols, 1 / meta.rows);
    for (const s of this.swords) {
      for (const c of s.cards) { c.material.map = streak; c.material.needsUpdate = true; }
      if (!(this.look === "aura" || (this.look === "mix" && s.giant))) continue;
      const material = new THREE.MeshBasicMaterial({ map: aura, color: new THREE.Color(0.9, 0.7, 0.3), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const card = new THREE.Mesh(geometry, material); card.name = "fx-metal-rain-authored-mantle";
      card.position.y = 0.5; card.scale.setScalar(1.3); card.quaternion.copy(this.along); card.renderOrder = 10;
      s.root.add(card); s.cards.push(card);
    }
  }
  sync(count: number): void {
    const decay = this.base.geometry.getAttribute("iDissolve");
    if (this.aura && this.auraMeta) {
      const a = this.auraMeta, frame = Math.floor(Math.max(0, this.time.value) * a.fps) % a.frames;
      this.aura.offset.set((frame % a.cols) / a.cols, (a.rows - 1 - Math.floor(frame / a.cols)) / a.rows);
    }
    for (let i = 0; i < this.swords.length; i++) {
      const s = this.swords[i]!; this.base.getMatrixAt(i, this.matrix);
      s.root.visible = i < count && Math.abs(this.matrix.determinant()) > 1e-9;
      if (!s.root.visible) continue;
      s.root.matrix.copy(this.matrix); s.root.matrixWorldNeedsUpdate = true;
      const fade = THREE.MathUtils.smoothstep(this.time.value, decay.getX(i), decay.getY(i));
      const opacity = 1 - fade; s.body.material.opacity = (s.giant ? 1 : 0.85) * opacity;
      if (this.camera) {
        this.camera.getWorldPosition(this.cameraAt);
        this.inverse.multiplyMatrices(this.group.matrixWorld, this.matrix).invert(); this.cameraAt.applyMatrix4(this.inverse);
        this.turn.setFromAxisAngle(this.up, Math.atan2(this.cameraAt.x, this.cameraAt.z));
      } else this.turn.identity();
      for (const c of s.cards) { c.material.opacity = opacity; c.quaternion.copy(this.turn).multiply(this.along); }
    }
  }
  snapshot() {
    const small = this.swords.find(s => !s.giant)!, giant = this.swords.find(s => s.giant)!;
    const material = (s: typeof small) => ({ type: s.body.material.type, emissive: s.body.material.emissive.toArray(),
      emissiveIntensity: s.body.material.emissiveIntensity, emissiveMap: s.body.material.emissiveMap?.name ?? null,
      vertexColors: s.body.material.vertexColors, stockShader: s.body.material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile });
    return { look: this.look, small: material(small), giant: material(giant),
      aura: this.aura?.image?.src,
      atlas: this.auraMeta ? { cols: this.auraMeta.cols, rows: this.auraMeta.rows,
        frames: this.auraMeta.frames, fps: this.auraMeta.fps, cell: this.auraMeta.cell } : null, mantleHeightRatio: 1.3,
      mantleWidthRatio: this.auraMeta ? 1.3 * this.auraMeta.cell[1]! / this.auraMeta.cell[0]! : null,
      streakRatio: 8, streakLengthPerSword: 0.42, streakCopies: small.cards.length,
      active: this.swords.filter(s => s.root.visible).length };
  }
  measure(): { small: number; giant: number; ratio: number | null; size: number[] } | null {
    const r = this.renderer, scene = this.scene, camera = this.camera;
    if (!r || !scene || !camera) return null;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: true });
    const data = new Uint16Array(size.x * size.y * 4), shown = new Map<THREE.Object3D, boolean>();
    const previous = r.getRenderTarget(), background = scene.background, clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    const autoClear = r.autoClear, viewport = r.getViewport(new THREE.Vector4());
    const scissor = r.getScissor(new THREE.Vector4()), scissorTest = r.getScissorTest(), peaks: number[] = [];
    try {
      scene.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points || o instanceof THREE.Line) {
          shown.set(o, o.visible); o.visible = false;
        }
      });
      scene.background = null; r.setClearColor(0, 1); r.autoClear = true; r.setScissorTest(false);
      for (const giant of [false, true]) {
        for (const s of this.swords) for (const o of [s.body, ...s.cards]) o.visible = s.giant === giant;
        r.setRenderTarget(target); r.clear(); r.render(scene, camera); r.readRenderTargetPixels(target, 0, 0, size.x, size.y, data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 4) peak = Math.max(peak, 0.2126 * THREE.DataUtils.fromHalfFloat(data[i]!)
          + 0.7152 * THREE.DataUtils.fromHalfFloat(data[i + 1]!) + 0.0722 * THREE.DataUtils.fromHalfFloat(data[i + 2]!));
        peaks.push(peak);
      }
      return { small: peaks[0]!, giant: peaks[1]!, ratio: peaks[0]! > 0 && peaks[1]! > 0 ? peaks[1]! / peaks[0]! : null, size: size.toArray() };
    } finally {
      for (const [o, visible] of shown) o.visible = visible;
      scene.background = background; r.setClearColor(clear, alpha); r.autoClear = autoClear; r.setRenderTarget(previous);
      r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest); target.dispose();
    }
  }
  dispose(): void {
    if (artProbeLayer === this) artProbeLayer = null;
    for (const s of this.swords) { s.body.material.dispose(); for (const c of s.cards) c.material.dispose(); }
    for (const g of this.cardGeometry) g.dispose(); this.group.removeFromParent();
  }
}
