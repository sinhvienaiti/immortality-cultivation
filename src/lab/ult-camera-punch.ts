/** Ticket 433c: absolute, reversible lab camera shot, shared by ultimate recipes. */
import * as THREE from "three";

export interface UltCameraShot {
  centre: THREE.Vector3;
  distanceRatio: number;
  lowerAngleDeg: number;
  inS: number;
  holdUntilS: number;
  outS: number;
  /** Optional framing lens during the shot; restored with the exact original pose. */
  fovDeg?: number;
}
export interface UltCameraReport {
  enabled: boolean; bound: boolean; clock: number; weight: number;
  distanceM: number; distanceRatio: number; angleDeg: number; angleDropDeg: number;
  fovDeg: number; returnErrorM: number; active: boolean;
}
const ease = (t: number): number => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};

/** The host owns the camera outside this short shot. No rAF, timers, renderer or global prototype patches. */
export class UltCameraPunch {
  readonly report: UltCameraReport;
  private camera: THREE.PerspectiveCamera | null = null;
  private shot: UltCameraShot | null = null;
  private clock = -1;
  private captured = false;
  private readonly start = new THREE.Vector3();
  private readonly startQ = new THREE.Quaternion();
  private readonly startLocal = new THREE.Vector3();
  private readonly startLocalQ = new THREE.Quaternion();
  private readonly end = new THREE.Vector3();
  private readonly endQ = new THREE.Quaternion();
  private readonly centre = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly lookMatrix = new THREE.Matrix4();
  private readonly parentInverse = new THREE.Matrix4();
  private readonly parentQ = new THREE.Quaternion();
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldQ = new THREE.Quaternion();
  private readonly worldScale = new THREE.Vector3();
  private startFov = 28;
  private syncWorld: (() => void) | null = null;
  private startDistance = 1;
  private startAngle = 0;
  private width = 1280;
  private height = 720;
  private unbind: (() => void) | null = null;
  private unhook: (() => void) | null = null;
  constructor(parent: THREE.Object3D, search: string,
    private readonly presented: (camera: THREE.PerspectiveCamera, width: number, height: number) => void = () => {}) {
    const enabled = new URLSearchParams(search).get("ultCam") !== "0";
    this.report = { enabled, bound: false, clock: 0, weight: 0, distanceM: 0, distanceRatio: 1,
      angleDeg: 0, angleDropDeg: 0, fovDeg: 28, returnErrorM: 0, active: false };
    let root = parent;
    while (root.parent !== null) root = root.parent;
    if (!(root instanceof THREE.Scene)) return;
    // Existing lab hosts do not pass a camera. Learn their main camera on an idle draw, retaining stress's hook.
    const before = root.onBeforeRender, self = this;
    const hook: typeof root.onBeforeRender = function(this: THREE.Scene, ...args: Parameters<typeof before>) {
      before.apply(this, args);
      const [renderer, , camera] = args;
      if (!(camera instanceof THREE.PerspectiveCamera)) return;
      const canvas = renderer.domElement;
      self.bindCamera(camera, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
      camera.updateMatrixWorld(true);
    };
    root.onBeforeRender = hook;
    this.unhook = () => { if (root.onBeforeRender === hook) root.onBeforeRender = before; };
  }
  /** Also usable by hosts with an explicit camera, and CPU projection probes. */
  bindCamera(camera: THREE.PerspectiveCamera, width = 1280, height = 720): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    if (camera === this.camera) return;
    if (this.camera !== null) this.clear();
    this.unbind?.(); this.camera = camera; this.report.bound = true;
    const world = camera.updateMatrixWorld, parents = camera.updateWorldMatrix, self = this;
    this.syncWorld = () => parents.call(camera, true, false);
    const after = (): void => { self.measure(); self.presented(camera, self.width, self.height); };
    // A fixed absolute pose makes repeated host placements and mask/post draws idempotent. Refresh before DOM
    // projection too, rather than changing the camera only inside Scene.onBeforeRender (one frame too late).
    const update: typeof world = function(this: THREE.PerspectiveCamera, force) { self.apply(); world.call(this, force); after(); };
    const updateParents: typeof parents = function(this: THREE.PerspectiveCamera, up, down) { self.apply(); parents.call(this, up, down); after(); };
    camera.updateMatrixWorld = update; camera.updateWorldMatrix = updateParents;
    this.unbind = () => {
      if (camera.updateMatrixWorld === update) camera.updateMatrixWorld = world;
      if (camera.updateWorldMatrix === updateParents) camera.updateWorldMatrix = parents;
    };
  }
  startShot(shot: UltCameraShot): void {
    this.clear(); this.shot = { ...shot }; this.centre.copy(shot.centre); this.clock = 0;
    this.report.clock = 0; this.report.returnErrorM = 0;
    if (this.camera !== null && this.report.enabled) this.capture();
  }
  private capture(): void {
    const camera = this.camera!, shot = this.shot!;
    this.syncWorld?.();
    this.startLocal.copy(camera.position); this.startLocalQ.copy(camera.quaternion); this.startFov = camera.fov;
    camera.matrixWorld.decompose(this.start, this.startQ, this.worldScale);
    this.direction.set(0, 0, -1).applyQuaternion(this.startQ);
    this.startAngle = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-this.direction.y, -1, 1)));
    this.startDistance = Math.max(0.01, this.start.distanceTo(this.centre));
    const angle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(this.startAngle - shot.lowerAngleDeg, 2, 85));
    this.direction.subVectors(this.start, this.centre); this.direction.y = 0;
    if (this.direction.lengthSq() < 1e-8) this.direction.set(0, 0, 1);
    this.direction.normalize().multiplyScalar(Math.cos(angle)); this.direction.y = Math.sin(angle);
    this.end.copy(this.centre).addScaledVector(this.direction, this.startDistance * THREE.MathUtils.clamp(shot.distanceRatio, 0.1, 1));
    this.end.y = Math.max(0.5, this.end.y);
    this.endQ.setFromRotationMatrix(this.lookMatrix.lookAt(this.end, this.centre, camera.up));
    this.captured = true; this.report.active = true;
  }
  update(dt: number): void {
    if (this.shot === null || !Number.isFinite(dt) || dt < 0) return;
    this.clock = Math.min(this.shot.holdUntilS + this.shot.outS, this.clock + dt);
    this.report.clock = this.clock;
    if (this.clock >= this.shot.holdUntilS + this.shot.outS - 1e-9) {
      this.restore(); this.shot = null; this.report.active = false; this.report.weight = 0;
    }
  }
  private apply(): void {
    if (!this.report.enabled || this.camera === null || this.shot === null) return;
    if (!this.captured) this.capture();
    const s = this.shot, t = this.clock;
    const weight = THREE.MathUtils.clamp(t < s.inS ? ease(t / Math.max(1e-6, s.inS))
      : t <= s.holdUntilS ? 1 : 1 - ease((t - s.holdUntilS) / Math.max(1e-6, s.outS)), 0, 1);
    this.report.weight = weight;
    this.worldPosition.lerpVectors(this.start, this.end, weight);
    this.worldQ.slerpQuaternions(this.startQ, this.endQ, weight);
    if (this.camera.parent !== null) {
      this.camera.parent.updateWorldMatrix(true, false);
      this.parentInverse.copy(this.camera.parent.matrixWorld).invert();
      this.worldPosition.applyMatrix4(this.parentInverse);
      this.camera.parent.matrixWorld.decompose(this.direction, this.parentQ, this.worldScale);
      this.worldQ.premultiply(this.parentQ.invert());
    }
    this.camera.position.copy(this.worldPosition); this.camera.quaternion.copy(this.worldQ);
    const fov = THREE.MathUtils.lerp(this.startFov, s.fovDeg ?? this.startFov, weight);
    if (Math.abs(this.camera.fov - fov) > 1e-8) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }
  private measure(): void {
    if (!this.captured || this.camera === null) return;
    const r = this.report;
    this.camera.matrixWorld.decompose(this.worldPosition, this.worldQ, this.worldScale);
    r.distanceM = this.worldPosition.distanceTo(this.centre); r.distanceRatio = r.distanceM / this.startDistance;
    this.direction.set(0, 0, -1).applyQuaternion(this.worldQ);
    r.angleDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-this.direction.y, -1, 1)));
    r.angleDropDeg = this.startAngle - r.angleDeg;
    r.fovDeg = this.camera.fov;
  }
  private restore(): void {
    if (this.captured && this.camera !== null) {
      this.camera.position.copy(this.startLocal); this.camera.quaternion.copy(this.startLocalQ);
      this.camera.fov = this.startFov; this.camera.updateProjectionMatrix();
      // Use the original world update, including a possible camera parent, without reapplying the live shot.
      this.syncWorld?.();
      this.report.returnErrorM = this.worldPosition.setFromMatrixPosition(this.camera.matrixWorld).distanceTo(this.start);
      this.measure();
    }
    this.captured = false;
  }
  clear(): void {
    this.restore(); this.shot = null; this.clock = -1;
    this.report.weight = 0; this.report.active = false;
  }
  dispose(): void { this.clear(); this.unbind?.(); this.unhook?.(); this.camera = null; this.syncWorld = null; }
}
