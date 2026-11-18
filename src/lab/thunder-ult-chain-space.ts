/** Ticket 434b: world-space storm surfaces and pooled, round-section lightning. No camera-facing geometry. */
import * as THREE from "three";
import type { FlipbookMeta } from "../view/skills/flipbook";
import { TAG_UNIFORMS, withTagMask } from "../view/skills/tag-mask";

export const ease = (x: number): number => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const noise = (i: number): number => { let n = Math.imul(i ^ 0x48ae31, 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** Shared atlas sampler for cloud, ground illumination and scorch; the art supplies their silhouettes. */
class StormSurface {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  constructor(parent: THREE.Object3D, blank: THREE.Texture, count: number, kind: number, name: string, order: number) {
    const geometry = new THREE.PlaneGeometry(1, 1, 8, 6);
    geometry.rotateX(-Math.PI / 2);
    // A shallow curved surface gives each horizontal slice a real volume profile at the rear view.
    if (kind === 0) {
      const p = geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) p.setY(i, 0.14 * Math.max(0, 1 - (p.getX(i) * 2) ** 2 - (p.getZ(i) * 2) ** 2));
    }
    geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i * 5.7), 1));
    const material = new THREE.ShaderMaterial({ uniforms: { ...TAG_UNIFORMS,
      uMap: { value: blank }, uGrid: { value: new THREE.Vector2(1, 1) }, uFrames: { value: 1 },
      uFrame: { value: 0 }, uAlpha: { value: 0 }, uPulse: { value: 0 }, uKind: { value: kind },
    }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: kind !== 0, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float iPhase; varying vec2 vUv; varying float vPhase;
      void main() { vUv = uv; vPhase = iPhase;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: withTagMask(`uniform sampler2D uMap; uniform vec2 uGrid;
      uniform float uFrames; uniform float uFrame; uniform float uAlpha; uniform float uPulse; uniform float uKind;
      varying vec2 vUv; varying float vPhase;
      vec2 cell(float f) { return (vec2(mod(f, uGrid.x), uGrid.y - 1.0 - floor(f / uGrid.x)) + clamp(vUv, 0.004, 0.996)) / uGrid; }
      void main() {
        float f = uKind < 1.5 ? mod(uFrame + vPhase, uFrames) : clamp(uFrame, 0.0, uFrames - 1.0);
        float next = uKind < 1.5 ? mod(floor(f) + 1.0, uFrames) : min(floor(f) + 1.0, uFrames - 1.0);
        vec3 art = mix(texture2D(uMap, cell(floor(f))).rgb, texture2D(uMap, cell(next)).rgb, fract(f));
        float lum = max(art.r, max(art.g, art.b));
        float rim = uKind > 0.5 && uKind < 1.5
          ? smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0-vUv.x)
            * smoothstep(0.0, 0.16, vUv.y) * smoothstep(0.0, 0.16, 1.0-vUv.y)
          : 1.0 - smoothstep(0.72, 1.0, length((vUv - 0.5) * 2.0));
        float density = smoothstep(0.015, 0.28, sqrt(lum));
        float a; vec3 c;
        if (uKind < 0.5) {
          a = density * rim * uAlpha * 0.68;
          c = mix(vec3(0.035, 0.022, 0.07), vec3(0.21, 0.095, 0.34), sqrt(lum));
          c += vec3(0.22, 0.12, 0.43) * lum * uPulse;
        } else if (uKind < 1.5) {
          a = density * rim * uAlpha * 0.48;
          c = vec3(0.34, 0.16, 0.72) * (0.75 + 0.25 * uPulse);
        } else {
          // The source's blue fissures supply the thin scar; omit its broad grey rocky ridges.
          float fissure = smoothstep(0.035, 0.22, art.b - art.r);
          a = fissure * rim * uAlpha * 0.74;
          c = vec3(0.043, 0.035, 0.027);
        }
        if (a < 0.002) discard;
        gl_FragColor = vec4(c * a, a);
      }`) });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = name; this.mesh.renderOrder = order; this.mesh.frustumCulled = false; this.mesh.visible = false;
    parent.add(this.mesh);
  }
  attach(meta: FlipbookMeta, texture: THREE.Texture): void {
    const u = this.mesh.material.uniforms;
    u.uMap!.value = texture; (u.uGrid!.value as THREE.Vector2).set(meta.cols, meta.rows); u.uFrames!.value = meta.frames;
  }
  place(i: number, x: number, y: number, z: number, width: number, depth: number, yaw = 0): void {
    this.position.set(x, y, z); this.scale.set(width, 1, depth); this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.matrix.compose(this.position, this.rotation, this.scale); this.mesh.setMatrixAt(i, this.matrix); this.mesh.instanceMatrix.needsUpdate = true;
  }
  present(frame: number, alpha: number, pulse: number): void {
    const u = this.mesh.material.uniforms;
    u.uFrame!.value = frame; u.uAlpha!.value = alpha; u.uPulse!.value = pulse; this.mesh.visible = alpha > 0.001;
  }
  clear(): void { this.present(0, 0, 0); }
  dispose(): void { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}

export interface StormEnvelope {
  viewport: [number, number]; centre: number[]; heightM: [number, number]; widthM: number; depthM: number;
  targetCentre: number[];
  boundsPx: number[]; widthFraction: number; inFrame: boolean; widthGate: boolean;
  measurement: "projected mesh envelope; alpha coverage requires GPU capture";
}
const LAYERS = [
  [0, 10.05, 0, 1, 1], [0.01, 11.5, 0.01, 0.96, 0.93], [-0.01, 13.7, 0, 0.88, 0.82],
  [-0.22, 10.8, 0.08, 0.52, 0.76], [0.22, 12.4, -0.07, 0.52, 0.76],
  [-0.18, 13, -0.08, 0.52, 0.7], [0.18, 10.5, 0.1, 0.52, 0.7],
] as const;

export class StormCloud {
  readonly centre = new THREE.Vector3();
  private readonly targetCentre = new THREE.Vector3();
  readonly body: StormSurface;
  readonly wash: StormSurface;
  width = 32;
  depth = 10;
  fps = 24;
  private readonly scratch = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  constructor(parent: THREE.Object3D, blank: THREE.Texture) {
    this.body = new StormSurface(parent, blank, LAYERS.length, 0, "thunder-cloud-world-slices", 10);
    this.wash = new StormSurface(parent, blank, 1, 1, "thunder-cloud-ground-light", 9);
  }
  attach(meta: FlipbookMeta, texture: THREE.Texture): void { this.fps = meta.fps; this.body.attach(meta, texture); this.wash.attach(meta, texture); }
  configure(at: THREE.Vector3, camera?: THREE.PerspectiveCamera): StormEnvelope | null {
    // Fixed world bank behind the herd; changing inspection camera never moves the cloud.
    this.targetCentre.copy(at); this.centre.copy(at).setY(13.2); this.centre.z -= 9.5;
    this.width = 52; this.depth = 18;
    const c = camera?.clone();
    if (camera !== undefined && c !== undefined) {
      camera.updateWorldMatrix(true, false); camera.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      c.aspect = 1280 / 720; c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    }
    this.place(); return c === undefined ? null : this.envelope(c);
  }
  private place(): void {
    for (let i = 0; i < LAYERS.length; i++) {
      const [x, y, z, w, d] = LAYERS[i]!;
      this.body.place(i, this.centre.x + x * this.width, y + this.centre.y - 11.9, this.centre.z + z * this.depth, this.width * w, this.depth * d);
    }
    this.wash.place(0, this.targetCentre.x, 0.035, this.targetCentre.z, 38, 28);
  }
  envelope(camera: THREE.PerspectiveCamera, width = 1280, height = 720): StormEnvelope {
    camera.updateMatrixWorld(true);
    this.body.mesh.updateWorldMatrix(true, false);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const p = this.body.mesh.geometry.getAttribute("position");
    // Full mesh bounds, deliberately stricter than the feathered texture's visible silhouette.
    for (let j = 0; j < LAYERS.length; j++) {
      this.body.mesh.getMatrixAt(j, this.matrix); this.matrix.premultiply(this.body.mesh.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        this.scratch.fromBufferAttribute(p, i).applyMatrix4(this.matrix).project(camera);
        if (this.scratch.z < -1 || this.scratch.z > 1) continue;
        const x = (this.scratch.x + 1) * width / 2, y = (1 - this.scratch.y) * height / 2;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const fraction = Math.max(0, Math.min(width, x1) - Math.max(0, x0)) / width;
    return { viewport: [width, height], centre: this.centre.toArray(), targetCentre: this.targetCentre.toArray(), heightM: [this.centre.y - 1.85, this.centre.y + 1.94], widthM: this.width, depthM: this.depth,
      boundsPx: [x0, y0, x1, y1], widthFraction: fraction, inFrame: x0 >= 0 && x1 <= width && y0 >= 0 && y1 <= height,
      widthGate: fraction >= 0.6, measurement: "projected mesh envelope; alpha coverage requires GPU capture" };
  }
  present(t: number, pulse: number): void {
    const alpha = ease(t / 0.38) * (1 - ease((t - 2.4) / 1.1));
    this.body.present(t * this.fps, alpha, pulse); this.wash.present(t * this.fps, alpha, pulse);
  }
  strikeOrigin(target: THREE.Vector3, out: THREE.Vector3): void {
    const x = (target.x - this.centre.x) / (this.width * 0.35), z = (target.z - this.centre.z) / (this.depth * 0.45);
    const k = Math.max(1, Math.hypot(x, z));
    out.set(this.centre.x + (target.x - this.centre.x) / k, this.centre.y - 6.2, this.centre.z + (target.z - this.centre.z) / k);
  }
  get live(): number { return (this.body.mesh.visible ? LAYERS.length : 0) + (this.wash.mesh.visible ? 1 : 0); }
  clear(): void { this.body.clear(); this.wash.clear(); }
  dispose(): void { this.body.dispose(); this.wash.dispose(); }
}

export class StormScorch {
  readonly surface: StormSurface;
  private born = -10;
  constructor(parent: THREE.Object3D, blank: THREE.Texture) { this.surface = new StormSurface(parent, blank, 1, 2, "thunder-ground-scorch-world", 11); }
  attach(meta: FlipbookMeta, texture: THREE.Texture): void { this.surface.attach(meta, texture); }
  spawn(at: THREE.Vector3, t: number): void { this.born = t; this.surface.place(0, at.x, 0.045, at.z, 10.5, 10.5, 0.37); }
  present(t: number): void {
    const age = t - this.born;
    // Hold a stable painted frame; the live ground arcs provide the electrical motion.
    const alpha = age >= 0.18 && age < 2 ? ease((age - 0.18) / 0.32) * (1 - ease((age - 0.5) / 1.5)) : 0;
    this.surface.present(18, alpha, 0);
  }
  get live(): number { return this.surface.mesh.visible ? 1 : 0; }
  clear(): void { this.born = -10; this.surface.clear(); }
  dispose(): void { this.surface.dispose(); }
}

const ARC_SLOTS = 48, SEGMENTS = 30, MAIN_SEGMENTS = 18;
/** One draw; round cross sections remain legible when a segment points along another inspection camera. */
export class ChainArcs {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly slots = Array.from({ length: ARC_SLOTS }, () => ({ born: -10, gain: 1, hold: 0.22, fade: 0.14, flash: false, count: 0, data: new Float32Array(SEGMENTS * 7) }));
  private readonly starts = new Float32Array(ARC_SLOTS * SEGMENTS * 3);
  private readonly ends = new Float32Array(ARC_SLOTS * SEGMENTS * 3);
  private readonly looks = new Float32Array(ARC_SLOTS * SEGMENTS * 3);
  private readonly points = Array.from({ length: MAIN_SEGMENTS + 1 }, () => new THREE.Vector3());
  private readonly direction = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  live = 0;
  dropped = 0;
  constructor(parent: THREE.Object3D) {
    // A world-space polyline drawn as a view-aligned ribbon: positions stay in the world, the cross profile stays soft.
    const tube = new THREE.PlaneGeometry(1, 1, 1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = tube.index;
    for (const name of ["position", "uv"]) geometry.setAttribute(name, tube.getAttribute(name));
    for (const [name, array] of [["iStart", this.starts], ["iEnd", this.ends], ["iLook", this.looks]] as const)
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, 3).setUsage(THREE.DynamicDrawUsage));
    tube.dispose(); geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({ uniforms: { ...TAG_UNIFORMS }, transparent: true,
      depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `attribute vec3 iStart; attribute vec3 iEnd; attribute vec3 iLook;
        varying float vAcross; varying float vAlong; varying vec2 vLook;
        void main() {
          vec3 d = normalize(iEnd - iStart + vec3(0.000001));
          vec3 mid = 0.5 * (iStart + iEnd);
          // The broad coloured sheath and the hairline core have separate profiles.
          float radius = max(iLook.x, distance(mid, cameraPosition) * 0.0028);
          vec3 axis = mix(iStart - d * radius * 0.35, iEnd + d * radius * 0.35, position.y + 0.5);
          vec3 view = normalize(cameraPosition - mid);
          vec3 side = cross(d, view);
          side = length(side) < 0.001 ? vec3(1, 0, 0) : normalize(side);
          vec3 p = axis + side * position.x * 2.0 * radius;
          vAcross = position.x * 2.0; vAlong = position.y + 0.5; vLook = iLook.yz;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1);
        }`,
      // No tag mask here: masking cut the bolts into dashes wherever a foe's tag box sat.
      fragmentShader: `varying float vAcross; varying float vAlong; varying vec2 vLook;
        void main() {
          float x2 = vAcross * vAcross;
          float core = exp(-x2 * 220.0);
          float halo = exp(-x2 * 3.8) * (1.0 - x2)
            * smoothstep(0.0, 0.28, vAlong) * (1.0 - smoothstep(0.72, 1.0, vAlong));
          float primary = step(1.5, vLook.y);
          float flash = mod(vLook.y, 2.0);
          vec3 col = vec3(0.46, 0.25, 0.9) * halo * mix(0.9, 0.86, primary)
            + mix(vec3(1.65, 1.45, 1.9), vec3(2.7, 2.6, 2.9), primary) * core * (1.0 + flash * 0.12);
          float a = min(1.0, vLook.x * (halo * 0.5 + core * 0.9));
          gl_FragColor = vec4(col * vLook.x, a);
        }` });
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = "thunder-chain-world-tubes";
    this.mesh.renderOrder = 14; this.mesh.frustumCulled = false; this.mesh.visible = false; parent.add(this.mesh);
  }
  spawn(a: THREE.Vector3, b: THREE.Vector3, t: number, seed: number, width = 0.38, gain = 1,
    branches = 3, hold = 0.22, fade = 0.14, flash = false, ground = false): void {
    const s = this.slots.find(s => t - s.born >= s.hold + s.fade - 1e-8);
    if (s === undefined) { this.dropped++; return; }
    s.born = t; s.gain = gain; s.hold = hold; s.fade = fade; s.flash = flash; s.count = 0;
    this.direction.subVectors(b, a).normalize();
    this.side.set(Math.abs(this.direction.y) > 0.9 ? 1 : 0, Math.abs(this.direction.y) > 0.9 ? 0 : 1, 0).cross(this.direction).normalize();
    this.up.crossVectors(this.direction, this.side).normalize();
    const jitter = Math.min(width > 1 ? 1.0 : 0.42, a.distanceTo(b) * 0.13);
    const segment = (p: THREE.Vector3, q: THREE.Vector3, w: number): void => {
      const o = s.count++ * 7;
      s.data[o] = p.x; s.data[o + 1] = p.y; s.data[o + 2] = p.z;
      s.data[o + 3] = q.x; s.data[o + 4] = q.y; s.data[o + 5] = q.z; s.data[o + 6] = w;
    };
    for (let i = 0; i <= MAIN_SEGMENTS; i++) {
      const p = this.points[i]!, k = i === 0 || i === MAIN_SEGMENTS ? 0 : jitter;
      p.lerpVectors(a, b, i / MAIN_SEGMENTS).addScaledVector(this.side, (noise(seed + i * 7) * 2 - 1) * k)
        .addScaledVector(this.up, (noise(seed + i * 11) * 2 - 1) * k);
      if (ground) p.y = a.y;
      if (i > 0) segment(this.points[i - 1]!, p, width);
    }
    for (let j = 0; j < Math.min(4, branches); j++) {
      this.a.copy(this.points[3 + j * 4]!);
      for (let k = 0; k < 3; k++) {
        this.b.copy(this.a).addScaledVector(this.side, (j % 2 === 0 ? -1 : 1) * (0.4 + noise(seed + j) * 0.35))
          .addScaledVector(this.up, (noise(seed + j * 17 + k) - 0.45) * 0.7).addScaledVector(this.direction, 0.15);
        segment(this.a, this.b, width * 0.5); this.a.copy(this.b);
      }
    }
  }
  /** Exact world segments for perpendicular image probes; allocated only when explicitly requested. */
  sections(t: number) {
    return this.slots.flatMap((s, slot) => {
      const age = Math.max(0, t - s.born);
      if (t < s.born - 1e-8 || age >= s.hold + s.fade - 1e-8) return [];
      return Array.from({ length: s.count }, (_, j) => ({ slot, segment: j, born: s.born, primary: s.flash,
        start: Array.from(s.data.slice(j * 7, j * 7 + 3)), end: Array.from(s.data.slice(j * 7 + 3, j * 7 + 6)),
        radiusM: s.data[j * 7 + 6]!, gain: s.gain * (1 - ease((age - s.hold) / s.fade)) }));
    });
  }
  /** Immediately after spawn: anchor a fork to the actual jagged trunk, without copying a second approximation. */
  pointAt(u: number, out: THREE.Vector3): void {
    const f = THREE.MathUtils.clamp(u, 0, 1) * MAIN_SEGMENTS, i = Math.min(MAIN_SEGMENTS - 1, Math.floor(f));
    out.lerpVectors(this.points[i]!, this.points[i + 1]!, f - i);
  }
  present(t: number): void {
    let n = 0; this.live = 0;
    for (const s of this.slots) {
      const age = Math.max(0, t - s.born);
      if (t < s.born - 1e-8 || age >= s.hold + s.fade - 1e-8) continue;
      this.live++;
      const alpha = s.gain * (1 - ease((age - s.hold) / s.fade));
      for (let j = 0; j < s.count; j++, n++) {
        const o = j * 7;
        for (let c = 0; c < 3; c++) { this.starts[n * 3 + c] = s.data[o + c]!; this.ends[n * 3 + c] = s.data[o + 3 + c]!; }
        this.looks[n * 3] = s.data[o + 6]!; this.looks[n * 3 + 1] = alpha;
        this.looks[n * 3 + 2] = s.flash ? 2 + (age < 2 / 60 - 1e-9 ? 1 : 0) : 0;
      }
    }
    this.mesh.geometry.instanceCount = n; this.mesh.visible = n > 0;
    if (n > 0) for (const name of ["iStart", "iEnd", "iLook"]) this.mesh.geometry.getAttribute(name).needsUpdate = true;
  }
  clear(): void { for (const s of this.slots) s.born = -10; this.live = 0; this.dropped = 0; this.mesh.geometry.instanceCount = 0; this.mesh.visible = false; }
  dispose(): void { this.clear(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}

/** Project a world-space circular diameter; this is geometry width before bloom and tag masking. */
export function arcPixels(a: THREE.Vector3, b: THREE.Vector3, widthM: number, camera?: THREE.PerspectiveCamera, height = 720): number | null {
  if (camera === undefined) return null;
  camera.updateWorldMatrix(true, false);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).applyMatrix4(camera.matrixWorldInverse);
  return mid.z < -camera.near ? widthM * height * camera.projectionMatrix.elements[5]! / (-2 * mid.z) : null;
}
