/**
 * The blow ring at the caster's chest (motion round 3; round-2 judges: "a red
 * ring at the chest" for the hit reaction). One camera-facing quad with a soft
 * ring drawn in its shader: it rises over 2 frames with the stagger, widens
 * from 0.14 to 0.42 m and thins as it fades over 0.32 s, in the enemy colour
 * (canon §21.1: red), a hot near-white edge on its first frames. Drawn over the
 * body (no depth test, after it), additive, its glow ≤ 0.9 except the thin hot
 * core of the first frames. No allocation per frame.
 */
import * as THREE from "three";

const LIFE_S = 0.32;
const RISE_S = 2 / 60;
const R0 = 0.14;
const R1 = 0.42;
const SIZE = 1.0;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv - 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uR;
uniform float uW;
uniform float uA;
uniform float uHot;
uniform vec3 uCol;
varying vec2 vUv;
void main() {
  float d = length(vUv) * ${SIZE.toFixed(2)};
  float ring = exp(-pow((d - uR) / uW, 2.0));
  float inner = exp(-pow((d - uR) / (uW * 0.35), 2.0));
  vec3 c = uCol * ring * 0.85 + vec3(1.0, 0.85, 0.8) * inner * uHot;
  gl_FragColor = vec4(c * uA, 1.0);
}`;

export class HitRing {
  readonly mesh: THREE.Mesh;
  private readonly u = { uR: { value: R0 }, uW: { value: 0.05 }, uA: { value: 0 }, uHot: { value: 0 }, uCol: { value: new THREE.Color(1, 0.12, 0.08) } };
  private t = -1;
  private readonly chest: THREE.Object3D | null;
  private readonly at = new THREE.Vector3();

  constructor(
    model: THREE.Object3D,
    private readonly root: THREE.Object3D,
  ) {
    this.chest = model.getObjectByName("spine_03") ?? model.getObjectByName("spine_02") ?? null;
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    // Faces the camera that draws it.
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.quaternion.copy(camera.quaternion);
      this.mesh.updateMatrixWorld(true);
    };
  }

  /** A blow landed: the ring starts at the chest. */
  start(): void {
    if (!this.mesh.parent && this.root.parent) this.root.parent.add(this.mesh);
    this.t = 0;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    if (t >= LIFE_S) {
      this.t = -1;
      this.mesh.visible = false;
      this.u.uA.value = 0;
      return;
    }
    if (this.chest) this.chest.getWorldPosition(this.at);
    else this.at.set(this.root.position.x, 0.95, this.root.position.z);
    this.mesh.position.copy(this.at);
    this.mesh.visible = true;
    const u = t / LIFE_S;
    const grow = 1 - (1 - u) * (1 - u) * (1 - u);
    this.u.uR.value = R0 + (R1 - R0) * grow;
    this.u.uW.value = 0.07 * (1 - 0.6 * u);
    const rise = Math.min(1, t / RISE_S);
    this.u.uA.value = rise * (1 - u) * (1 - u);
    this.u.uHot.value = 1.4 * Math.max(0, 1 - t / 0.08);
  }

  reset(): void {
    this.t = -1;
    this.mesh.visible = false;
  }
}
