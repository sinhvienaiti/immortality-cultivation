/**
 * The lab's showcase key (8; docs/work/tasks/lab-element-kits.md, owner 05/11/2026): the pillar skills and the element
 * ultimates of art-src/lab/vfx/ult/ (manifest roles "pillar" and "ultimate"; PRODUCTION_LIST_2026-11-05 §4 and §7),
 * each played as its Firefly video layer on the field at the play camera, one a press, in order. The clips were drawn
 * from the play camera's angle (55°), so they stand as camera-facing cards: a pillar on a beast, its column's foot on
 * the ground under it and its top leaving the frame's top edge; a field-wide pillar or an ultimate filling the view over
 * the ground at the screen's centre. Added light (the clips are on black). Not wired to the sim: nothing is struck.
 */
import * as THREE from "three";
import type { FlipbookPlayer, FlipbookPool } from "../view/skills/flipbook";

const FOLDER = "ult";
/** Where a pillar's column meets the ground in its cell (x from the left, y from the top). */
const FOOT: readonly [number, number] = [0.5, 0.8];
/** Seconds a pillar and a scene play (the 5 s Firefly clips, peak first, sped up). */
const PILLAR_S = 2.4;
const SCENE_S = 4.2;
/**
 * Ultimates the owner turned down (05/11 18:45: the eyes and the scroll); their redraws "-v2" play instead. Dropped even
 * when a manifest still lists them.
 */
const REJECTED: ReadonlySet<string> = new Set(["ult-water-profound-sea", "ult-thunder-nine-heavens"]);
/** The impact light by the clip's element (its id's word). */
const LIGHT: Readonly<Record<string, string>> = {
  thunder: "#c9b8ff", light: "#fff0c8", fire: "#ffb060", dark: "#b88ae0", ice: "#cfe6ff", wind: "#c4f2d6", water: "#7cc2ff",
};

const v = new THREE.Vector3();
const f = new THREE.Vector3();
const p = new THREE.Vector3();

export interface ShowcaseHost {
  readonly camera: THREE.PerspectiveCamera;
  /** The beast nearest (x, z) within r m, else −1, and its ground position. */
  nearest(x: number, z: number, r: number): number;
  at(i: number, out: THREE.Vector3): void;
  /** An impact light at a point (the lab's FlashLights). */
  light(at: THREE.Vector3, colour: string, intensity: number): void;
  /** The screen's big-hit flash (strength 0–1). */
  accent(strength: number): void;
}

export class UltShowcase {
  private readonly pools = new Map<string, FlipbookPool>();
  private readonly roles = new Map<string, string>();
  private turn = 0;

  constructor(private readonly player: FlipbookPlayer, private readonly host: ShowcaseHost) {
    const lib = player.library(FOLDER);
    lib.watch((id) => {
      const e = lib.get(id);
      const role = e?.meta.role;
      if (e === null || (role !== "pillar" && role !== "ultimate") || this.pools.has(id) || REJECTED.has(id)) return;
      const pool = player.pool(FOLDER, id, { mode: "fire", capacity: 2, renderOrder: 15 });
      if (role === "pillar" && !id.includes("field")) pool.attach({ ...e.meta, pivot: FOOT }, e.texture, e.controls);
      pool.vignette = 0.35;
      this.pools.set(id, pool);
      this.roles.set(id, role);
    });
  }

  /** The clips it can play, pillars first. */
  ids(): string[] {
    return [...this.pools.keys()].sort((a, b) => (this.roles.get(a) === this.roles.get(b) ? a.localeCompare(b) : this.roles.get(a) === "pillar" ? -1 : 1));
  }

  /** Plays `id` (none: the next in order); returns what it played, or null when it has no such clip loaded. */
  play(id?: string): string | null {
    const ids = this.ids();
    if (ids.length === 0 || (id !== undefined && !this.pools.has(id))) return null;
    const pick = id ?? ids[this.turn++ % ids.length]!;
    const pool = this.pools.get(pick)!;
    if (!pool.ready) return null;
    const meta = pool.meta!;
    const cam = this.host.camera;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // The ground under the screen's centre.
    cam.getWorldDirection(f);
    const t = f.y < -1e-3 ? -cam.position.y / f.y : 30;
    const cx = cam.position.x + f.x * t;
    const cz = cam.position.z + f.z * t;
    const field = this.roles.get(pick) === "ultimate" || pick.includes("field");
    const word = Object.keys(LIGHT).find((k) => pick.includes(k));
    const o = {
      rate: (meta.frames - meta.start) / (meta.fps * (field ? SCENE_S : PILLAR_S)),
      fadeOut: 0.45,
      occlude: 0.25,
      lift: 0,
    };
    let size: number;
    if (field) {
      // Over the ground at the screen's centre, as tall as the view there; drawn over the near ground (its lower half
      // stands behind it in depth).
      v.set(cx, 0, cz);
      const d = v.distanceTo(cam.position);
      size = 2 * d * tan;
      o.lift = d * 0.6;
    } else {
      // On the beast nearest the field's centre; tall enough that the column leaves the top of the frame.
      const i = this.host.nearest(cx, cz, 30);
      if (i >= 0) this.host.at(i, v);
      else v.set(cx, 0, cz);
      v.y = 0;
      const d = v.distanceTo(cam.position);
      // The column (FOOT[1] of the card above its foot) reaches past the frame's top edge.
      const ndc = p.copy(v).project(cam).y;
      size = THREE.MathUtils.clamp((1.15 * (1 - ndc) * d * tan) / FOOT[1], 8, 40);
      o.lift = 3;
    }
    pool.spawn(v, size, o);
    this.host.light(v.set(v.x, 1.5, v.z), LIGHT[word ?? "light"] ?? "#ffffff", field ? 8 : 6);
    this.host.accent(field ? 0.5 : 0.35);
    return pick;
  }
}
