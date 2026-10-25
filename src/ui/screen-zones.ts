// Source: games/dragon-hold/src/ui/screen-zones.ts @06cd4e6 (adapted: Thanh Thạch Ải corridors, sky routes, mechanism slots, heart and Tâm nhãn from StageDef; fixed DOM zones that keep the Bàn Quyết clear; view insets)
/**
 * Screen zones: where HUD, wave card, shop and learning panels may sit so the
 * Bàn Quyết is never covered (canon §21.1 layers: the DOM lies over the
 * canvas, the Bàn Quyết at the bottom, outside it).
 * - `screenZones(width, height)`: the fixed DOM layout in CSS px (HUD top
 *   left, Trận Lực and Thế top centre, notices under them, the wave card top
 *   right, the shop above the Bàn Quyết band, the Bàn Quyết band itself);
 *   `viewInsets` gives the renderer the band to keep the field out of.
 * - `publishZones(root, stage, project)`: what a floating card must not cover
 *   on the field: the ground corridors gate → heart, the sky routes, the 6
 *   mechanism slots, the Trận Tâm and the Tâm nhãn, projected each frame;
 *   `chooseSpot` picks the first clear candidate spot (keeping the current
 *   one while it stays clear). Pure geometry, no allocation per call beyond
 *   the published lists.
 * Owner: Lane 6.
 */
import type { Projector, ScreenPoint } from "../app/contracts";
import { FIELD } from "../content/rules";
import type { MechSlotKind, StageDef } from "../content/types";
import { uiScale } from "../kit/ui/tokens";
import { FLY_DRAW_M } from "../view/actors";

// ── Fixed DOM zones ─────────────────────────────────────────────────────────

export interface ScreenZone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** CSS px at --ui 1 (1600 × 900): the Bàn Quyết band (its cells are 28–32 px words + name + note, canon §24) and the panels. */
export const ZONE_PX = {
  margin: 12,
  /** Bàn Quyết band height at text scale 100 %: 12 px gap below, 8 + 8 padding, a cell of ~84 px. */
  quyet: 120,
  /** Extra band height per text-scale step above 100 % (the word line grows). */
  quyetPerScale: 40,
  /** Sinh lực, Chân Nguyên (and the down line), the Linh Sa chip above them. */
  hud: { width: 300, height: 120 },
  top: { width: 440, height: 92 },
  notices: { width: 520, height: 76 },
  card: { width: 340, height: 230 },
  shop: { width: 980, height: 156 },
} as const;

/** The Bàn Quyết band height in CSS px for a viewport and text scale (100 / 125 / 150). */
export function quyetBand(width: number, height: number, textScale = 100): number {
  const ui = uiScale(width, height);
  return Math.round((ZONE_PX.quyet + ZONE_PX.quyetPerScale * Math.max(0, textScale / 100 - 1)) * ui);
}

/**
 * The fixed DOM layout for a `width` × `height` CSS px view: "hud" (Sinh lực,
 * Chân Nguyên, Linh Sa) bottom left just above the Bàn Quyết, on the near
 * side of the field behind the Trận Tâm where no route runs (the far corners
 * hold the gates and the sky entries, canon D48); "top" (Trận Lực, Thế) and
 * "notices" top centre; "card" top right; "shop" centred above the band and
 * never as wide as to reach the HUD; "quyet" (the Bàn Quyết band, full width).
 * No zone but "quyet" reaches into the band.
 */
export function screenZones(width: number, height: number, textScale = 100): readonly ScreenZone[] {
  const ui = uiScale(width, height);
  const m = Math.round(ZONE_PX.margin * ui);
  const quyet = quyetBand(width, height, textScale);
  const sized = (w: number, h: number): [number, number] => [Math.min(width - 2 * m, Math.round(w * ui)), Math.round(h * ui)];
  const [hudW, hudH] = sized(ZONE_PX.hud.width, ZONE_PX.hud.height);
  const [topW, topH] = sized(ZONE_PX.top.width, ZONE_PX.top.height);
  const [noteW, noteH] = sized(ZONE_PX.notices.width, ZONE_PX.notices.height);
  const [cardW, cardH] = sized(ZONE_PX.card.width, ZONE_PX.card.height);
  const [shopFullW, shopH] = sized(ZONE_PX.shop.width, ZONE_PX.shop.height);
  const shopW = Math.max(0, Math.min(shopFullW, width - 2 * (hudW + 2 * m)));
  const shopY = Math.max(m, height - quyet - m - shopH);
  const hudY = Math.max(m, height - quyet - m - hudH);
  return [
    { id: "hud", x: m, y: hudY, width: hudW, height: Math.min(hudH, height - quyet - m - hudY) },
    { id: "top", x: Math.round((width - topW) / 2), y: Math.round(10 * ui), width: topW, height: topH },
    { id: "notices", x: Math.round((width - noteW) / 2), y: Math.round(10 * ui) + topH + m, width: noteW, height: noteH },
    { id: "card", x: width - m - cardW, y: m, width: cardW, height: cardH },
    { id: "shop", x: Math.round((width - shopW) / 2), y: shopY, width: shopW, height: Math.min(shopH, height - quyet - m - shopY) },
    { id: "quyet", x: 0, y: height - quyet, width, height: quyet },
  ];
}

/** CSS px the renderer keeps clear at the top and bottom (renderer.setViewInsets): the Bàn Quyết band below; nothing above (the HUD floats over the far margin). */
export function viewInsets(width: number, height: number, textScale = 100): { readonly top: number; readonly bottom: number } {
  return { top: 0, bottom: quyetBand(width, height, textScale) };
}

// ── Field zones a floating card keeps off ───────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A corridor or route stretch on screen with its half-width in px. */
export interface LaneSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  half: number;
}

export interface ScreenZones {
  readonly lanes: LaneSegment[];
  readonly slots: Rect[];
  /** Bumped on every update (readers can tell a stale set). */
  stamp: number;
}

/** Ground size of a slot mark (metres, view/stage.ts) plus a margin; the heart disc and the node spot. */
const SLOT_SIZE_M: Readonly<Record<MechSlotKind, number>> = { strip: 4.0, post: 1.6 };
const SLOT_MARGIN_M = 0.6;
const HEART_M = FIELD.heartEdgeMm / 1000;
const NODE_M = 0.9;
/** A ground corridor's drawn half-width (view/ground.ts) and a sky route's (a flyer's body). */
export const CORRIDOR_HALF_M = 2.2;
const SKY_HALF_M = 1.6;

const registry = new WeakMap<HTMLElement, ScreenZones>();

/** The zones published for `root` (null before the first publish). */
export function zonesFor(root: HTMLElement): ScreenZones | null {
  return registry.get(root) ?? null;
}

/** Recomputes the zones of `root` from the stage and the projector (once a frame, by the card that needs them). */
export function publishZones(root: HTMLElement, stage: StageDef, project: Projector): ScreenZones {
  let zones = registry.get(root);
  if (zones === undefined) {
    zones = { lanes: [], slots: [], stamp: 0 };
    registry.set(root, zones);
  }
  const out = zones;
  out.lanes.length = 0;
  out.slots.length = 0;
  const a: ScreenPoint = { x: 0, y: 0, visible: false };
  const b: ScreenPoint = { x: 0, y: 0, visible: false };
  const c: ScreenPoint = { x: 0, y: 0, visible: false };
  const addSegment = (ax: number, az: number, bx: number, bz: number, y: number, halfM: number): void => {
    project(ax, y, az, a);
    project(bx, y, bz, b);
    if (a.x < -1e3 || b.x < -1e3) return;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    project(mx + ((bz - az) / len) * halfM, y, mz - ((bx - ax) / len) * halfM, c);
    const half = Math.max(6, Math.hypot(c.x - (a.x + b.x) / 2, c.y - (a.y + b.y) / 2));
    out.lanes.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, half });
  };
  const addSpot = (x: number, z: number, r: number): void => {
    project(x, 0.2, z, a);
    if (a.x < -1e3) return;
    project(x + r, 0.2, z, b);
    project(x, 0.2, z + r, c);
    const rx = Math.max(8, Math.abs(b.x - a.x));
    const ry = Math.max(8, Math.abs(c.y - a.y));
    out.slots.push({ x: a.x - rx, y: a.y - ry, w: rx * 2, h: ry * 2 });
  };
  const field = stage.field;
  for (const gate of field.gates) {
    if (!gate.ground) continue;
    addSegment(gate.at.xMm / 1000, gate.at.zMm / 1000, 0, 0, 0.3, CORRIDOR_HALF_M);
  }
  for (const entry of field.skyEntries) addSegment(entry.xMm / 1000, entry.zMm / 1000, 0, 0, FLY_DRAW_M, SKY_HALF_M);
  for (const slot of field.mechSlots) addSpot(slot.at.xMm / 1000, slot.at.zMm / 1000, SLOT_SIZE_M[slot.kind] / 2 + SLOT_MARGIN_M);
  addSpot(0, 0, HEART_M + SLOT_MARGIN_M);
  for (const node of field.nodes) addSpot(node.at.xMm / 1000, node.at.zMm / 1000, NODE_M + SLOT_MARGIN_M);
  out.stamp += 1;
  return out;
}

/** Overlap area of two rects (px²). */
export function overlapArea(p: Rect, q: Rect): number {
  const ox = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
  const oy = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
  return ox * oy;
}

/** Length (px) of segment a→b inside `rect` grown by `pad` on every side (Liang–Barsky clip). */
export function segmentInside(rect: Rect, s: LaneSegment, pad = s.half): number {
  const x0 = rect.x - pad;
  const y0 = rect.y - pad;
  const x1 = rect.x + rect.w + pad;
  const y1 = rect.y + rect.h + pad;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, s.ax - x0) || !clip(dx, x1 - s.ax) || !clip(-dy, s.ay - y0) || !clip(dy, y1 - s.ay)) return 0;
  return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
}

/** What covering things at `rect` costs: route px inside it, slot area, panel area, any part off the view. */
export function spotCost(rect: Rect, zones: ScreenZones | null, keepouts: readonly Rect[], view: { w: number; h: number }): { lanes: number; slots: number; panels: number; total: number } {
  let lanes = 0;
  let slots = 0;
  let panels = 0;
  if (zones !== null) {
    for (const segment of zones.lanes) lanes += segmentInside(rect, segment);
    for (const slot of zones.slots) slots += overlapArea(rect, slot);
  }
  for (const keep of keepouts) panels += overlapArea(rect, keep);
  const off = rect.w * rect.h - overlapArea(rect, { x: 0, y: 0, w: view.w, h: view.h });
  // Slots weigh most (a card over a mechanism slot hides where to build), then routes, then panels.
  const total = slots * 4 + lanes * 40 + panels + off * 8;
  return { lanes, slots, panels, total };
}

/** Index of the spot to use among `spots`: `current` while it stays clear, else the first clear one, else the cheapest. */
export function chooseSpot(spots: readonly Rect[], zones: ScreenZones | null, keepouts: readonly Rect[], view: { w: number; h: number }, current = -1): number {
  const costs = spots.map((spot) => spotCost(spot, zones, keepouts, view).total);
  if (current >= 0 && current < spots.length && costs[current]! <= 0.5) return current;
  let best = 0;
  for (let k = 0; k < costs.length; k += 1) {
    if (costs[k]! <= 0.5) return k;
    if (costs[k]! < costs[best]!) best = k;
  }
  return best;
}

/** Visible panels under `root` a card keeps off (HUD, shop, learning frame, other cards), except `self`. */
export function keepoutRects(root: HTMLElement, self: HTMLElement): Rect[] {
  const out: Rect[] = [];
  for (const node of root.ownerDocument.querySelectorAll<HTMLElement>("[data-keepout], .kit-learning-frame, .ic-bq")) {
    if (node === self || self.contains(node) || node.contains(self) || node.closest("[hidden]") !== null) continue;
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}
