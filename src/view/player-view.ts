/**
 * This machine's player and the Hộ thân rings (canon §9.1, §12.1, §21.1).
 * The player is a primitive placeholder (a capsule with a ground ring and a
 * facing mark; ink outline; ≥ 64 px tall at 1080p anywhere on the field)
 * read from the `local` layer (FrameInfo.local: position in u, facing in ‰,
 * Sinh lực, khiên, down), interpolated between ticks; it lies down while
 * down, shows a silver dome while a Kim Thân Phù shield holds, flashes on
 * `player-hit`, and marks its right-click goal. `ward` rings (r 2 m) are
 * drawn from `ward` events (start, block flash, end) with the world's list
 * as the truth for place, radius and charges left (3 pips). The real cultivator
 * walks through walker-rig at M0b (canon §21.2).
 * Owner: Lane 6.
 */
import * as THREE from "three";
import type { FrameInfo, Presenter } from "../app/contracts";
import type { LocalState, SimEvent, Ward, World } from "../content/types";
import { uToM } from "../sim/fixed";
import type { Renderer3D } from "./renderer";

/** The placeholder's size (metres): 1.8 m tall meets canon §21.1's 64 px at 1080p at the far edge (tests/view/actors-player.test.ts). */
export const PLAYER_LOOK = { heightM: 1.8, radiusM: 0.42, colour: "#ece6d6", down: "#8d8a82", ring: "#dfe8f0", ink: "#1b1d24", shield: "#cfe3ff", ward: "#cfe3ff" } as const;

/** Where the player is drawn, metres, from the local layer (u, between the last two ticks). */
export function playerPoint(local: Pick<LocalState, "x" | "z">): { x: number; z: number } {
  return { x: uToM(local.x), z: uToM(local.z) };
}

/** Yaw (radians about +y) of a facing given in ‰ (x east, z south). */
export function facingYaw(facingX: number, facingZ: number): number {
  return facingX === 0 && facingZ === 0 ? Math.PI : Math.atan2(facingX, facingZ);
}

export interface PlayerView extends Presenter {
  readonly root: THREE.Group;
  /** The drawn position (metres). */
  readonly position: THREE.Vector3;
  /** Live ward rings drawn. */
  readonly wards: number;
}

export interface PlayerViewOptions {
  readonly seat?: number;
  readonly reduced?: () => boolean;
}

interface WardRec {
  id: number;
  /** Radius (metres) from the world's ward. */
  r: number;
  ring: THREE.Mesh;
  pips: THREE.Mesh[];
  flash: number;
  fade: number;
  active: boolean;
}

const WARD_POOL = 4;
const FADE_S = 0.25;

export function createPlayerView(renderer: Renderer3D, options: PlayerViewOptions = {}): PlayerView {
  const seat = options.seat ?? 0;
  const reduced = options.reduced ?? (() => false);
  const root = new THREE.Group();
  root.name = "player";
  const look = PLAYER_LOOK;
  const bodyGeometry = new THREE.CapsuleGeometry(look.radiusM, look.heightM - 2 * look.radiusM, 6, 16);
  bodyGeometry.translate(0, look.heightM / 2, 0);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: look.colour, emissive: "#000000" });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = "player-body";
  const hull = new THREE.Mesh(bodyGeometry, new THREE.MeshBasicMaterial({ color: look.ink, side: THREE.BackSide }));
  hull.scale.set(1.08, 1.03, 1.08);
  const figure = new THREE.Group();
  figure.add(hull, body);
  // A facing mark: a flat triangle in front of the feet.
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.28, 0.04, 0.55, 0.28, 0.04, 0.55, 0, 0.04, 1.05], 3));
  const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  const ringGeometry = new THREE.RingGeometry(0.62, 0.78, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.04;
  const shieldDome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: look.shield, transparent: true, opacity: 0.22, depthWrite: false }));
  shieldDome.visible = false;
  root.add(ring, arrow, figure, shieldDome);
  // The right-click goal.
  const goalGeometry = new THREE.RingGeometry(0.3, 0.42, 24);
  goalGeometry.rotateX(-Math.PI / 2);
  const goal = new THREE.Mesh(goalGeometry, new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.8, depthWrite: false }));
  goal.visible = false;
  goal.position.y = 0.05;

  // Ward rings (pool).
  const wardGroup = new THREE.Group();
  wardGroup.name = "wards";
  const wardRecs: WardRec[] = [];
  const unitRing = new THREE.RingGeometry(0.93, 1, 64);
  unitRing.rotateX(-Math.PI / 2);
  const pipGeometry = new THREE.CircleGeometry(0.16, 12);
  pipGeometry.rotateX(-Math.PI / 2);
  for (let k = 0; k < WARD_POOL; k += 1) {
    const wardRing = new THREE.Mesh(unitRing, new THREE.MeshBasicMaterial({ color: look.ward, transparent: true, opacity: 0.85, depthWrite: false }));
    wardRing.visible = false;
    wardRing.renderOrder = 2;
    const pips: THREE.Mesh[] = [];
    for (let p = 0; p < 3; p += 1) {
      const pip = new THREE.Mesh(pipGeometry, new THREE.MeshBasicMaterial({ color: look.ward, transparent: true, opacity: 0.95, depthWrite: false }));
      pip.visible = false;
      pips.push(pip);
      wardGroup.add(pip);
    }
    wardGroup.add(wardRing);
    wardRecs.push({ id: -1, r: 1, ring: wardRing, pips, flash: 0, fade: -1, active: false });
  }
  renderer.layers.actors.add(root, goal, wardGroup);

  const position = new THREE.Vector3();
  let prevX = 0;
  let prevZ = 0;
  let curX = 0;
  let curZ = 0;
  let lastTick = -1;
  let hitFlash = 0;
  let yaw = Math.PI;
  let drawnDown = false;

  const wardFor = (id: number): WardRec | null => {
    for (const rec of wardRecs) if (rec.active && rec.id === id) return rec;
    return null;
  };

  /** The world's ward `id` (null once it is gone). */
  const worldWard = (world: World, id: number): Ward | null => {
    const list = world.wards?.list;
    if (list === undefined) return null;
    for (let k = 0; k < list.length; k += 1) if (list[k]!.id === id) return list[k]!;
    return null;
  };

  return {
    root,
    position,
    get wards(): number {
      let count = 0;
      for (const rec of wardRecs) if (rec.active) count += 1;
      return count;
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      for (const event of events) {
        if (event.type === "player-hit" && event.seat === seat) hitFlash = event.blocked ? 0.5 : 1;
        else if (event.type === "ward" && event.seat === seat) {
          let rec = wardFor(event.wardId);
          if (event.stage === "start") {
            rec ??= wardRecs.find((item) => !item.active) ?? wardRecs[0]!;
            rec.active = true;
            rec.id = event.wardId;
            rec.fade = -1;
            rec.flash = 0.6;
          } else if (rec !== null) {
            if (event.stage === "block") rec.flash = 1;
            else rec.fade = FADE_S;
          }
        }
      }
    },
    frame(world: World, info: FrameInfo): void {
      const local = info.local;
      const x = uToM(local.x);
      const z = uToM(local.z);
      if (lastTick < 0 || world.tick - lastTick > 1) {
        prevX = curX = x;
        prevZ = curZ = z;
      } else if (world.tick !== lastTick) {
        prevX = curX;
        prevZ = curZ;
        curX = x;
        curZ = z;
      }
      lastTick = world.tick;
      const a = info.alpha < 0 ? 0 : info.alpha > 1 ? 1 : info.alpha;
      position.set(prevX + (curX - prevX) * a, 0, prevZ + (curZ - prevZ) * a);
      root.position.copy(position);
      const want = facingYaw(local.facingX, local.facingZ);
      let delta = want - yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      yaw += Math.abs(delta) < info.dt * 12 ? delta : Math.sign(delta) * info.dt * 12;
      root.rotation.y = yaw;
      // Down: lying on the ground, dim, no facing mark.
      if (local.down !== drawnDown) {
        drawnDown = local.down;
        figure.rotation.x = drawnDown ? -Math.PI / 2 : 0;
        figure.position.y = drawnDown ? look.radiusM : 0;
        arrow.visible = !drawnDown;
        bodyMaterial.color.set(drawnDown ? look.down : look.colour);
      }
      hitFlash = Math.max(0, hitFlash - info.dt * 5);
      bodyMaterial.emissive.setScalar(hitFlash * 0.7);
      shieldDome.visible = local.shield > 0 && !local.down;
      if (shieldDome.visible && !reduced()) shieldDome.rotation.y += info.dt * 0.6;
      const target = local.moveTarget;
      goal.visible = target !== null && !local.down;
      if (target !== null) goal.position.set(uToM(target.x), 0.05, uToM(target.z));
      // Wards: the world's list is the truth for place, radius and charges.
      for (let k = 0; k < wardRecs.length; k += 1) {
        const rec = wardRecs[k]!;
        if (!rec.active) continue;
        const ward = worldWard(world, rec.id);
        if (ward === null && rec.fade < 0) rec.fade = FADE_S;
        if (ward !== null) {
          const r = uToM(ward.radiusU);
          const wx = uToM(ward.originU.x);
          const wz = uToM(ward.originU.z);
          rec.ring.position.set(wx, 0.06, wz);
          rec.r = r;
          for (let p = 0; p < rec.pips.length; p += 1) {
            const pip = rec.pips[p]!;
            pip.visible = p < ward.charges;
            const angle = Math.PI / 2 + (p - 1) * 0.35;
            pip.position.set(wx + Math.cos(angle) * r, 0.07, wz + Math.sin(angle) * r);
          }
          if (ward.untilTick <= world.tick && rec.fade < 0) rec.fade = FADE_S;
        }
        rec.flash = Math.max(0, rec.flash - info.dt * 4);
        let alpha = 0.85;
        if (rec.fade >= 0) {
          rec.fade -= info.dt;
          alpha *= Math.max(0, rec.fade / FADE_S);
          if (rec.fade <= 0) {
            rec.active = false;
            rec.id = -1;
          }
        }
        rec.ring.visible = rec.active;
        for (const pip of rec.pips) if (!rec.active) pip.visible = false;
        const material = rec.ring.material as THREE.MeshBasicMaterial;
        material.opacity = Math.min(1, alpha + rec.flash * 0.15);
        // A block swells the ring a little (not with reduced motion).
        const grow = rec.r * (reduced() ? 1 : 1 + rec.flash * 0.06);
        rec.ring.scale.set(grow, 1, grow);
      }
    },
    dispose(): void {
      root.removeFromParent();
      goal.removeFromParent();
      wardGroup.removeFromParent();
      for (const object of [root, goal, wardGroup]) {
        object.traverse((node) => {
          const mesh = node as THREE.Mesh;
          mesh.geometry?.dispose();
          (mesh.material as THREE.Material | undefined)?.dispose();
        });
      }
    },
  };
}
