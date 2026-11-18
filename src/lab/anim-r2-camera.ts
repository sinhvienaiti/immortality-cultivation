/** Ticket 403: front/chest inspection only for the lab; restore all host state after each draw. */
import * as THREE from "three";
export class FrontHandsView {
  enabled = false;
  compare: "front" | "hands" | null = null;
  private readonly bounds = new THREE.Box3();
  private drawn = false;
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedQuaternion = new THREE.Quaternion();
  private readonly facing = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private fxVisible = true;
  constructor(private readonly camera: THREE.Camera, private readonly root: THREE.Object3D, private readonly fx: THREE.Object3D) {}
  beforeDraw(): void {
    if (!this.enabled || this.drawn) return;
    this.drawn = true;
    this.savedPosition.copy(this.camera.position); this.savedQuaternion.copy(this.camera.quaternion);
    this.root.getWorldPosition(this.at); this.at.y += this.compare === 'front' ? 1.24 : 1.13;
    let distance = this.compare === 'front' ? 2.0 : 2.15;
    if (this.compare === 'hands') {
      this.bounds.makeEmpty();
      this.root.traverse(o => { if ((o as THREE.Bone).isBone && /^(hand_[rl]|(index|middle|ring|pinky|thumb)_0[1-4].*)$/.test(o.name))
        this.bounds.expandByPoint(o.getWorldPosition(this.facing)); });
      if (!this.bounds.isEmpty()) {
        this.bounds.getCenter(this.at);
        const size = this.bounds.getSize(this.facing);
        // Capture crops to a 3:4 tile. Include both hands plus 4 cm of margin on every edge.
        const span = Math.max(size.y + .08, (Math.hypot(size.x, size.z) + .08) / .75);
        // Keep the camera outside the torso and near plane when the hands are close together.
        distance = Math.max(1.05, span / (2 * Math.tan(14 * Math.PI / 180)));
      }
    }
    this.facing.set(0, 0, -1).applyQuaternion(this.root.getWorldQuaternion(this.q)); this.facing.y = 0; this.facing.normalize();
    // FOV 28°, 0.95 m vertical span. Chest-level, following the actual facing even after a retarget.
    this.camera.position.copy(this.at).addScaledVector(this.facing, distance);
    this.camera.lookAt(this.at); this.camera.updateMatrixWorld(true);
    // Hand inspection isolates the rig from foreground swords, jade rings and skill cards. Events/audio still run.
    this.fxVisible = this.fx.visible; this.fx.visible = false;
  }
  afterDraw(): void {
    if (!this.drawn) return;
    this.camera.position.copy(this.savedPosition); this.camera.quaternion.copy(this.savedQuaternion);
    this.camera.updateMatrixWorld(true); this.fx.visible = this.fxVisible; this.drawn = false;
  }
  reset(): void { this.afterDraw(); this.enabled = false; this.compare = null; }
}
