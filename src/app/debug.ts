/**
 * Measurements for the `?debug=1` handle (`window.__ic`, app.ts) that Lane 7's
 * browser scenarios read: where the field, the gates, the sky entries, the
 * heart and every beast land on screen as the view draws them (ic-camera-frame,
 * canon D48: flyers and edge bodies are drawn where actors.ts puts them, so
 * this projects `actors.locate`, not the sim position), the drawn size of each
 * beast and of the player (ic-scale, canon §21.1), and percentiles of the
 * frame and key timings (ic-perf, ic-hitstop-keys). Reads only; never writes
 * the world.
 * Owner: integration (LANES.md).
 */
import type { ScreenPoint } from "./contracts";
import type { LocalState, World } from "../content/types";
import { uToM } from "../sim/fixed";
import { drawSize, FLY_DRAW_M, type ActorsView, type Point3 } from "../view/actors";
import { CROWD_LOOKS } from "../view/crowd";
import { PLAYER_LOOK } from "../view/player-view";
import type { Renderer3D } from "../view/renderer";

/** The p-th percentile (0–1) of `values` (0 for none). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))]!;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Keeps the last `cap` numbers. */
export function pushCapped(list: number[], value: number, cap: number): void {
  list.push(value);
  if (list.length > cap) list.splice(0, list.length - cap);
}

export interface ScreenXY {
  readonly x: number;
  readonly y: number;
}

export interface FrameReport {
  /** Viewport, CSS px; `band` is the top of the Bàn Quyết band (the field must stay above it). */
  readonly width: number;
  readonly height: number;
  readonly band: number;
  /** Field corners, gates, sky entries (at the flyers' drawn height), the heart. */
  readonly points: Readonly<Record<string, ScreenXY>>;
  /** Names of points outside [0, width] × [0, band]. */
  readonly outside: readonly string[];
  /** Live beasts and how many have their drawn base or top outside that box. */
  readonly beasts: number;
  readonly beastsOut: readonly { readonly slot: number; readonly serial: number; readonly species: string; readonly base: ScreenXY; readonly top: ScreenXY }[];
}

const inside = (point: ScreenXY, width: number, band: number): boolean => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= band;

/** ic-camera-frame: projects the field's landmarks and every live beast's drawn base and top (canon D48). */
export function frameReport(renderer: Renderer3D, actors: ActorsView, world: World, width: number, height: number, band: number): FrameReport {
  const out: ScreenPoint = { x: 0, y: 0, visible: false };
  const project = (x: number, y: number, z: number): ScreenXY => {
    renderer.project(x, y, z, out);
    return { x: Math.round(out.x * 10) / 10, y: Math.round(out.y * 10) / 10 };
  };
  const field = world.stage.field;
  const points: Record<string, ScreenXY> = {};
  points["corner-nw"] = project(field.minXMm / 1000, 0, field.minZMm / 1000);
  points["corner-ne"] = project(field.maxXMm / 1000, 0, field.minZMm / 1000);
  points["corner-sw"] = project(field.minXMm / 1000, 0, field.maxZMm / 1000);
  points["corner-se"] = project(field.maxXMm / 1000, 0, field.maxZMm / 1000);
  for (const gate of field.gates) points["gate-" + gate.id] = project(gate.at.xMm / 1000, 0, gate.at.zMm / 1000);
  field.skyEntries.forEach((entry, k) => (points["sky-" + k] = project(entry.xMm / 1000, FLY_DRAW_M, entry.zMm / 1000)));
  points["heart"] = project(0, 0, 0);
  const outside = Object.entries(points)
    .filter(([, point]) => !inside(point, width, band))
    .map(([name]) => name);
  const p: Point3 = { x: 0, y: 0, z: 0 };
  let beasts = 0;
  const beastsOut: FrameReport["beastsOut"][number][] = [];
  for (const beast of world.beasts.list) {
    if (!beast.alive) continue;
    beasts += 1;
    if (!actors.locate(beast.slot, beast.serial, "base", p)) continue;
    const base = project(p.x, p.y, p.z);
    actors.locate(beast.slot, beast.serial, "top", p);
    const top = project(p.x, p.y, p.z);
    if (!inside(base, width, band) || !inside(top, width, band)) beastsOut.push({ slot: beast.slot, serial: beast.serial, species: beast.species, base, top });
  }
  return { width, height, band, points, outside, beasts, beastsOut };
}

export interface FoeSize {
  readonly species: string;
  readonly tier: string;
  readonly elite: boolean;
  readonly general: boolean;
  /** Drawn height (base to top) and width on screen, CSS px. */
  readonly px: number;
  readonly widthPx: number;
  /** Ground distance to the heart, m. */
  readonly distM: number;
}

/** ic-scale (canon §21.1 sizes at 1080p): every live beast as drawn, and the player (species "player"). */
export function foeSizes(renderer: Renderer3D, actors: ActorsView, world: World, local: LocalState): FoeSize[] {
  const a: ScreenPoint = { x: 0, y: 0, visible: false };
  const b: ScreenPoint = { x: 0, y: 0, visible: false };
  const c: ScreenPoint = { x: 0, y: 0, visible: false };
  const base: Point3 = { x: 0, y: 0, z: 0 };
  const top: Point3 = { x: 0, y: 0, z: 0 };
  const sizes: FoeSize[] = [];
  for (const beast of world.beasts.list) {
    if (!beast.alive || !actors.locate(beast.slot, beast.serial, "base", base) || !actors.locate(beast.slot, beast.serial, "top", top)) continue;
    renderer.project(base.x, base.y, base.z, a);
    renderer.project(top.x, top.y, top.z, b);
    const look = CROWD_LOOKS[beast.species];
    const half = (Math.max(look.sizeM[0], look.sizeM[2]) * drawSize(beast)) / 2;
    renderer.project(base.x + half, base.y, base.z, c);
    sizes.push({
      species: beast.species,
      tier: beast.tier,
      elite: beast.elite !== null,
      general: beast.general,
      px: Math.abs(a.y - b.y),
      widthPx: Math.abs(c.x - a.x) * 2,
      distM: Math.hypot(base.x, base.z),
    });
  }
  const px = uToM(local.x);
  const pz = uToM(local.z);
  renderer.project(px, 0, pz, a);
  renderer.project(px, PLAYER_LOOK.heightM, pz, b);
  renderer.project(px + PLAYER_LOOK.radiusM, 0, pz, c);
  sizes.push({ species: "player", tier: "player", elite: false, general: false, px: Math.abs(a.y - b.y), widthPx: Math.abs(c.x - a.x) * 2, distM: Math.hypot(px, pz) });
  return sizes;
}
