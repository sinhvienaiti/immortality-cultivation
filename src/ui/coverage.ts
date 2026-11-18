import type { Projector } from "../app/contracts";
import type { StageDef, World } from "../content/types";
import { TELEGRAPHS } from "../content/data/telegraphs";
import { uToM } from "../sim/fixed";
import { overlapArea, type Rect } from "./screen-zones";

export interface LandmarkRect extends Rect { readonly name: string }

/** The same conservative landmark bounds for layout regression tests and DOM reports. */
export function fieldLandmarks(stage: StageDef, project: Projector): LandmarkRect[] {
  const critical: LandmarkRect[] = [];
  const at = { x: 0, y: 0, visible: false };
  const edge = { x: 0, y: 0, visible: false };
  const add = (name: string, x: number, z: number, radius: number) => {
    project(x, .2, z, at);
    project(x + radius, .2, z + radius, edge);
    const r = Math.max(8, Math.abs(edge.x - at.x), Math.abs(edge.y - at.y));
    critical.push({ name, x: at.x - r, y: at.y - r, w: r * 2, h: r * 2 });
  };
  add("core", 0, 0, 1.6);
  for (const gate of stage.field.gates) add("gate-" + gate.id, gate.at.xMm / 1000, gate.at.zMm / 1000, 1);
  for (const slot of stage.field.mechSlots) add("slot-" + slot.index, slot.at.xMm / 1000, slot.at.zMm / 1000, slot.kind === "strip" ? 2 : 1);
  return critical;
}

/** Rectangle union: overlapping/nested HUD surfaces count only once. */
export function rectUnionArea(rects: readonly Rect[]): number {
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let k = 1; k < xs.length; k += 1) {
    const left = xs[k - 1]!;
    const right = xs[k]!;
    const spans = rects.filter(r => r.x < right && r.x + r.w > left).map(r => [r.y, r.y + r.h] as const).sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    let length = 0;
    for (const [a, b] of spans) {
      length += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
    area += (right - left) * length;
  }
  return area;
}

/** Shared by the measurement and the word canvas's hard clipping mask. */
export function protectedFieldRects(world: World, project: Projector): LandmarkRect[] {
  const critical = fieldLandmarks(world.stage, project);
  const at = { x: 0, y: 0, visible: false };
  // Conservative projected AABBs of active ground warnings, including their width.
  for (const warning of world.telegraphs.active) {
    if (warning.cancelled || warning.strikeTick < world.tick) continue;
    const shape = TELEGRAPHS[warning.def]?.shape;
    const toX = uToM(warning.to.x), toZ = uToM(warning.to.z);
    const fromX = shape === "circle" || shape === "cell" ? toX : uToM(warning.from.x);
    const fromZ = shape === "circle" || shape === "cell" ? toZ : uToM(warning.from.z);
    const radius = uToM(shape === "circle" ? warning.reachU : warning.widthU / 2);
    const xs: number[] = [], ys: number[] = [];
    for (const x of [Math.min(fromX, toX) - radius, Math.max(fromX, toX) + radius]) {
      for (const z of [Math.min(fromZ, toZ) - radius, Math.max(fromZ, toZ) + radius]) {
        project(x, .03, z, at);
        xs.push(at.x); ys.push(at.y);
      }
    }
    critical.push({ name: "warning-" + warning.id, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return critical;
}

/** Debug-only DOM measurement; gameplay never reads this report. */
export function measureUiCoverage(doc: Document, world: World, project: Projector) {
  const width = doc.defaultView?.innerWidth ?? 1280;
  const height = doc.defaultView?.innerHeight ?? 720;
  const surfaces = [...doc.querySelectorAll<HTMLElement>(".ic-panel, .ic-bq, .ic-lpanel, .kit-learning-frame, [data-keepout]")].flatMap(node => {
    const style = doc.defaultView?.getComputedStyle(node);
    if (node.closest("[hidden]") || style?.visibility === "hidden" || style?.display === "none" || style?.opacity === "0") return [];
    const box = node.getBoundingClientRect();
    const x = Math.max(0, box.left), y = Math.max(0, box.top);
    const w = Math.max(0, Math.min(width, box.right) - x), h = Math.max(0, Math.min(height, box.bottom) - y);
    return w > 0 && h > 0 ? [{ name: node.className, x, y, w, h }] : [];
  });
  const critical = protectedFieldRects(world, project);
  const overlaps = critical.flatMap(keep => surfaces.flatMap(surface => overlapArea(keep, surface) > 0 ? [{ landmark: keep.name, surface: surface.name, area: overlapArea(keep, surface) }] : []));
  const area = rectUnionArea(surfaces);
  const wordSizes = [...doc.querySelectorAll<HTMLElement>(".ic-bq__words .ic-bq__word, .ic-bq__extras .ic-bq__word")].map(node => parseFloat(doc.defaultView?.getComputedStyle(node).fontSize ?? "0"));
  return { width, height, area, percent: area * 100 / (width * height), surfaces, critical, overlaps, minimumWordPx: wordSizes.length ? Math.min(...wordSizes) : null };
}
