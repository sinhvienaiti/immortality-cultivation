/**
 * Lab-only orbit camera (owner, 03/11/2026: "game lab đang không cho thay đổi góc nhìn kiểu 360 độ"): O turns it
 * on; dragging turns the view all the way round the point the play camera looks at and tilts it, the wheel keeps
 * zooming, O again returns to the play camera. It only re-aims the pose the zoom placed this frame, so the zoom,
 * a big skill's wide framing, the kick and the shake all still apply. The game keeps its fixed 3/4 camera (D48, D57).
 * No allocation per frame.
 */
import * as THREE from "three";

/** Lowest and highest elevation above the ground (deg) and drag speeds (deg per CSS px). */
const MIN_ELEV = 4;
const MAX_ELEV = 89;
const YAW_PER_PX = 0.35;
const ELEV_PER_PX = 0.25;
/** Half-life of the smoothing toward the dragged angles (s). */
const HALF_LIFE_S = 0.06;

export class LabOrbit {
  enabled = false;
  /** Yaw added round the vertical axis (deg) and the elevation over the ground (deg; NaN: the play camera's). */
  private yaw = 0;
  private elev = Number.NaN;
  private yawShown = 0;
  private elevShown = Number.NaN;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly off = new THREE.Vector3();

  constructor(private readonly el: HTMLElement) {
    el.addEventListener("pointerdown", (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw -= dx * YAW_PER_PX;
      if (Number.isNaN(this.elev)) this.elev = this.elevShown;
      this.elev = Math.max(MIN_ELEV, Math.min(MAX_ELEV, this.elev + dy * ELEV_PER_PX));
    });
    const stop = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  }

  /** O: on with the play camera's angles; off back to the play camera. */
  toggle(): void {
    this.enabled = !this.enabled;
    this.yaw = this.yawShown = 0;
    this.elev = this.elevShown = Number.NaN;
    this.el.style.cursor = this.enabled ? "grab" : "";
  }

  /**
   * Re-aims `camera` (already placed by the zoom this frame): round the ground point its centre ray meets, by the
   * dragged yaw and elevation, at the same distance.
   */
  apply(camera: THREE.PerspectiveCamera, dtS: number): void {
    if (!this.enabled) return;
    camera.getWorldDirection(this.fwd);
    if (this.fwd.y > -1e-3) return;
    const t = -camera.position.y / this.fwd.y;
    this.pivot.copy(camera.position).addScaledVector(this.fwd, t);
    this.off.copy(camera.position).sub(this.pivot);
    const dist = this.off.length();
    const baseYaw = Math.atan2(this.off.x, this.off.z);
    const baseElev = THREE.MathUtils.radToDeg(Math.asin(Math.min(1, this.off.y / dist)));
    if (Number.isNaN(this.elevShown)) this.elevShown = baseElev;
    const wantElev = Number.isNaN(this.elev) ? baseElev : this.elev;
    const k = dtS <= 0 ? 1 : 1 - Math.pow(0.5, dtS / HALF_LIFE_S);
    this.yawShown += (this.yaw - this.yawShown) * k;
    this.elevShown += (wantElev - this.elevShown) * k;
    const yaw = baseYaw + THREE.MathUtils.degToRad(this.yawShown);
    const elev = THREE.MathUtils.degToRad(this.elevShown);
    const h = Math.cos(elev) * dist;
    camera.position.set(this.pivot.x + Math.sin(yaw) * h, this.pivot.y + Math.sin(elev) * dist, this.pivot.z + Math.cos(yaw) * h);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.pivot);
    camera.updateMatrixWorld(true);
  }
}
