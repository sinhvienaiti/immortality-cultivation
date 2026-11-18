/**
 * The lab's three views (owner, 13/11 10:2x: "1 là góc nhìn từ trên xuống như hiện tại ở lab, 2 là góc nhìn dạng ngang
 * sau lưng gần như mắt nhìn của nhân vật, 3 là góc nhìn dạng ngang màn hình"), plus 2b, the behind view tipped to 25°,
 * to compare. View only: the sim, the herd's road and every skill's timing are the same in all of them.
 *
 * - "top": the lab's fixed camera (its fit and zoom, ~55°), untouched.
 * - "behind": behind the player at eye height, looking north along the beasts' road.
 * - "behind25": the same, raised so it looks down 25° at a point ahead on the road.
 * - "side": from the east, its axis across the road; the beasts walk from right (north) to left (south).
 *
 * A switch eases position, aim and field of view over SWITCH_S. Each view carries an effect profile the skills read:
 * how far flat cards (scars, formation, pools) are lifted and tipped toward the camera, how much bigger upright cards
 * (columns, bolts) are drawn, and the thin rim on bosses and elites that keeps them apart from the herd.
 */
import * as THREE from "three";

export type ViewMode = "top" | "behind" | "behind25" | "side";
export const VIEW_MODES: readonly ViewMode[] = ["top", "behind", "behind25", "side"];
export const VIEW_LABELS: Record<ViewMode, string> = { top: "1 · Top", behind: "2 · Behind", behind25: "2b · Behind 25°", side: "3 · Side" };

/** A switch's ease (s). */
export const SWITCH_S = 0.4;

/** Behind: the camera's height (m), its distance behind the player (m), how far ahead it aims (m) and at what height. */
const BEHIND = { heightM: 2.2, backM: 7, aheadM: 22, aimY: 1.1, fov: 50 };
/** Behind 25°: the same place behind, raised until the line to a point aheadM up the road falls 25°. */
const BEHIND25 = { backM: 7, aheadM: 12, pitchDeg: 25, fov: 50 };
/** Side: from the east, outM past the field's centre line, at heightM, aiming at the road's middle; field of view. */
const SIDE = { outM: 34, heightM: 3, aimY: 1, fov: 35 };

/** What a view asks of the effects (view only). */
export interface ViewProfile {
  /** Flat cards: lifted (m) and their far half tipped up toward the camera (rad, at most 35°). */
  readonly flatLiftM: number;
  readonly flatTilt: number;
  /** Upright cards (columns, bolts) drawn this much bigger. */
  readonly uprightK: number;
  /** A thin rim on bosses and elites (0: none). */
  readonly tierRim: number;
}

const DEG = Math.PI / 180;
export const VIEW_PROFILES: Record<ViewMode, ViewProfile> = {
  top: { flatLiftM: 0, flatTilt: 0, uprightK: 1, tierRim: 0 },
  behind: { flatLiftM: 0.02, flatTilt: 25 * DEG, uprightK: 1.2, tierRim: 0.55 },
  behind25: { flatLiftM: 0.02, flatTilt: 12 * DEG, uprightK: 1.2, tierRim: 0.55 },
  side: { flatLiftM: 0.02, flatTilt: 35 * DEG, uprightK: 1.2, tierRim: 0.55 },
};

interface Pose {
  readonly pos: THREE.Vector3;
  readonly aim: THREE.Vector3;
  fov: number;
}

const pose = (): Pose => ({ pos: new THREE.Vector3(), aim: new THREE.Vector3(), fov: 45 });

export class CameraModes {
  mode: ViewMode = "top";
  private from: ViewMode = "top";
  private t = SWITCH_S;
  private readonly a = pose();
  private readonly b = pose();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private topFov = 45;
  /** The ground point the camera looks at in the current view (for the flat cards' tilt toward it). */
  readonly toCam = new THREE.Vector2(0, 1);

  set(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.from = this.mode;
    this.mode = mode;
    this.t = 0;
  }

  /** The profile now: the target view's once the switch is past its middle. */
  get profile(): ViewProfile {
    return VIEW_PROFILES[this.t < SWITCH_S / 2 ? this.from : this.mode];
  }

  /** Whether the lab's own top camera is all that shows (no override). */
  get idle(): boolean {
    return this.mode === "top" && this.t >= SWITCH_S;
  }

  private place(mode: ViewMode, camera: THREE.PerspectiveCamera, px: number, pz: number, fieldX: number, fieldZ: number, out: Pose): void {
    if (mode === "top") {
      // The lab's own pose this frame (its fit and zoom just wrote it).
      out.pos.copy(camera.position);
      this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      // Its aim: where its forward line meets the ground.
      const k = this.fwd.y < -1e-3 ? -camera.position.y / this.fwd.y : 20;
      out.aim.copy(camera.position).addScaledVector(this.fwd, k);
      out.fov = this.topFov;
    } else if (mode === "behind") {
      out.pos.set(px, BEHIND.heightM, pz + BEHIND.backM);
      out.aim.set(px, BEHIND.aimY, pz - BEHIND.aheadM);
      out.fov = BEHIND.fov;
    } else if (mode === "behind25") {
      const run = BEHIND25.backM + BEHIND25.aheadM;
      out.pos.set(px, Math.tan(BEHIND25.pitchDeg * DEG) * run, pz + BEHIND25.backM);
      out.aim.set(px, 0, pz - BEHIND25.aheadM);
      out.fov = BEHIND25.fov;
    } else {
      out.pos.set(fieldX + SIDE.outM, SIDE.heightM, fieldZ);
      out.aim.set(fieldX, SIDE.aimY, fieldZ);
      out.fov = SIDE.fov;
    }
  }

  /**
   * After the lab placed its top camera this frame: the view's pose, eased from the last one over SWITCH_S. (px, pz)
   * is the player; (fieldX, fieldZ) the middle of the beasts' road.
   */
  apply(camera: THREE.PerspectiveCamera, px: number, pz: number, fieldX: number, fieldZ: number, dt: number): void {
    if (this.mode === "top" && this.from === "top") this.topFov = camera.fov;
    if (this.idle) {
      this.toCam.set(0, 1);
      return;
    }
    this.t = Math.min(SWITCH_S, this.t + dt);
    this.place(this.from, camera, px, pz, fieldX, fieldZ, this.a);
    this.place(this.mode, camera, px, pz, fieldX, fieldZ, this.b);
    const u = this.t / SWITCH_S;
    const k = u * u * (3 - 2 * u);
    camera.position.lerpVectors(this.a.pos, this.b.pos, k);
    this.look.lerpVectors(this.a.aim, this.b.aim, k);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);
    const fov = this.a.fov + (this.b.fov - this.a.fov) * k;
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    // Toward the camera across the ground, from what it looks at.
    this.toCam.set(camera.position.x - this.look.x, camera.position.z - this.look.z);
    if (this.toCam.lengthSq() < 1e-6) this.toCam.set(0, 1);
    this.toCam.normalize();
    if (this.mode === "top" && this.t >= SWITCH_S) {
      this.from = "top";
      camera.fov = this.topFov;
      camera.updateProjectionMatrix();
    }
  }
}
