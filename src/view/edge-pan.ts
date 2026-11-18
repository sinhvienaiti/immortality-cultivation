/** D66: view-only edge scrolling. No input focus, keys or simulation state. */
import type { Camera } from "three";

export const EDGE_PAN = { homeX: 0, homeZ: -7.55, minX: -4, maxX: 4, minZ: -16.8, maxZ: -7.55, bandPx: 24, delayS: 0.15, accelS: 0.15, stopS: 0.12, resetS: 0.35 } as const;
export interface PanRect { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
export interface PanState { readonly x: number; readonly z: number; readonly vx: number; readonly vz: number; readonly dwell: number; readonly resetAge: number; readonly resetX: number; readonly resetZ: number }
export interface PanInput {
  readonly pointer: { readonly x: number; readonly y: number } | null;
  readonly viewport: PanRect;
  readonly banQuyet: PanRect | null;
  readonly dt: number;
  readonly enabled: boolean;
  readonly focused: boolean;
  readonly zoom: number;
  readonly cutIn: boolean;
  readonly reducedMotion: boolean;
}
export const panHome = (): PanState => ({ x: EDGE_PAN.homeX, z: EDGE_PAN.homeZ, vx: 0, vz: 0, dwell: 0, resetAge: EDGE_PAN.resetS, resetX: 0, resetZ: EDGE_PAN.homeZ });
export const resetPan = (s: PanState): PanState => ({ ...s, vx: 0, vz: 0, dwell: 0, resetAge: 0, resetX: s.x, resetZ: s.z });
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const inside = (p: { x: number; y: number }, r: PanRect): boolean => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

/** Pure state step: CSS pointer + live panel rect + real dt → look position and velocity. */
export function stepEdgePan(s: PanState, i: PanInput): PanState {
  const dt = Math.max(0, i.dt);
  if (s.resetAge < EDGE_PAN.resetS) {
    const resetAge = Math.min(EDGE_PAN.resetS, s.resetAge + dt);
    const t = resetAge / EDGE_PAN.resetS;
    const e = t * t * (3 - 2 * t);
    return { ...s, x: s.resetX + (EDGE_PAN.homeX - s.resetX) * e, z: s.resetZ + (EDGE_PAN.homeZ - s.resetZ) * e, resetAge, vx: 0, vz: 0, dwell: 0 };
  }
  const p = i.pointer;
  const v = i.viewport;
  if (!i.enabled || !i.focused || i.zoom !== 0 || i.cutIn || !p || !inside(p, v) || (i.banQuyet && inside(p, i.banQuyet))) return { ...s, vx: 0, vz: 0, dwell: 0 };
  const b = EDGE_PAN.bandPx;
  const bottom = i.banQuyet?.top ?? v.bottom;
  let dx = clamp((p.x - (v.right - b)) / b, 0, 1) - clamp((v.left + b - p.x) / b, 0, 1);
  let dz = (p.y < bottom ? clamp((p.y - (bottom - b)) / b, 0, 1) : 0) - clamp((v.top + b - p.y) / b, 0, 1);
  const length = Math.hypot(dx, dz);
  if (length > 1) { dx /= length; dz /= length; }
  const inBand = length > 0;
  const dwell = inBand ? s.dwell + dt : 0;
  // Split the frame at the dwell boundary, so 30/60/144 Hz begin at the same instant.
  const wait = inBand ? clamp(EDGE_PAN.delayS - s.dwell, 0, dt) : 0;
  const movingDt = dt - wait;
  const speed = i.reducedMotion ? 6 : 12;
  const tx = inBand && dwell >= EDGE_PAN.delayS ? dx * speed : 0;
  const tz = inBand && dwell >= EDGE_PAN.delayS ? dz * speed : 0;
  const integrate = (velocity: number, target: number): { velocity: number; delta: number } => {
    const decayWait = Math.exp(-wait / EDGE_PAN.stopS);
    const start = velocity * decayWait;
    const tau = inBand ? EDGE_PAN.accelS : EDGE_PAN.stopS;
    const decay = Math.exp(-movingDt / tau);
    return { velocity: target + (start - target) * decay, delta: velocity * EDGE_PAN.stopS * (1 - decayWait) + target * movingDt + (start - target) * tau * (1 - decay) };
  };
  const previousSpeed = Math.hypot(s.vx, s.vz);
  const speedScale = previousSpeed > speed ? speed / previousSpeed : 1;
  const x = integrate(s.vx * speedScale, tx);
  const z = integrate(s.vz * speedScale, tz);
  const nextX = clamp(s.x + x.delta, EDGE_PAN.minX, EDGE_PAN.maxX);
  const nextZ = clamp(s.z + z.delta, EDGE_PAN.minZ, EDGE_PAN.maxZ);
  return { ...s, x: nextX, z: nextZ, vx: nextX !== s.x + x.delta ? 0 : Math.abs(x.velocity) < 1e-6 ? 0 : x.velocity, vz: nextZ !== s.z + z.delta ? 0 : Math.abs(z.velocity) < 1e-6 ? 0 : z.velocity, dwell };
}

export interface PanStatus { readonly enabled: boolean; readonly zoom?: number; readonly cutIn?: boolean; readonly reducedMotion?: boolean }
/** The DOM adapter reads the actual Bàn Quyết every frame, including text-scale/layout changes. */
export class EdgePan {
  state: PanState = panHome();
  /** Published by CameraZoom; explicit frame status may override them. */
  zoom = 0;
  cutIn = false;
  private pointer: { x: number; y: number } | null = null;
  private readonly doc: Document;
  private readonly win: Window | null;
  private readonly move = (e: PointerEvent): void => { this.pointer = { x: e.clientX, y: e.clientY }; };
  private readonly leave = (): void => { this.pointer = null; this.state = { ...this.state, vx: 0, vz: 0, dwell: 0 }; };
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.doc = canvas.ownerDocument;
    this.win = this.doc.defaultView;
    this.doc.addEventListener("pointermove", this.move);
    this.doc.documentElement.addEventListener("mouseleave", this.leave);
    this.win?.addEventListener("blur", this.leave);
  }
  reset(): void { this.state = resetPan(this.state); }
  update(dt: number, status: PanStatus): void {
    const rect = this.canvas.getBoundingClientRect();
    const panel = this.doc.getElementById("ic-quyet");
    this.state = stepEdgePan(this.state, { pointer: this.pointer, viewport: rect, banQuyet: panel?.getBoundingClientRect() ?? null, dt, focused: this.doc.hasFocus(), enabled: status.enabled, zoom: status.zoom ?? this.zoom, cutIn: status.cutIn ?? this.cutIn, reducedMotion: (status.reducedMotion ?? false) || (this.win?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false) });
  }
  dispose(): void {
    this.doc.removeEventListener("pointermove", this.move);
    this.doc.documentElement.removeEventListener("mouseleave", this.leave);
    this.win?.removeEventListener("blur", this.leave);
  }
}

// A zoom controller on this camera shares its panned whole-field origin and reset action.
const pans = new WeakMap<Camera, EdgePan>();
export const bindEdgePan = (camera: Camera, pan: EdgePan): void => { pans.set(camera, pan); };
export const edgePanFor = (camera: Camera): EdgePan | undefined => pans.get(camera);
