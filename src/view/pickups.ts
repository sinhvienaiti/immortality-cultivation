/**
 * Linh Sa motes flying to the HUD (canon §9.3, §14.2, D34): visual only, the
 * sim booked the Linh Sa at the death tick into the seat's wallet. A `linh-sa`
 * event of this seat (reason "kill") sends a few money-gold motes (kit
 * semantic money) from where the beast fell (the `death` of the same tick; a
 * cluster pays at its last beast) along a short arc to the HUD's Linh Sa chip
 * (`target`); other rewards rise from the chip itself. DOM spans in the
 * overlay, positioned by transform each frame from the renderer's Projector
 * (no allocation per frame: a fixed pool). Reduced motion (canon §24): no
 * flight, the HUD chip only pulses.
 * Owner: Lane 6.
 */
import type { FrameInfo, Presenter, ScreenPoint } from "../app/contracts";
import type { SimEvent, World } from "../content/types";
import type { Renderer3D } from "./renderer";

export interface PickupsView extends Presenter {
  /** Motes in flight. */
  readonly live: number;
}

export interface PickupsOptions {
  readonly seat?: number;
  /** Where motes fly to (CSS px, the HUD's Linh Sa chip); null: the top-left corner. */
  readonly target?: () => { readonly x: number; readonly y: number } | null;
  readonly reduced?: () => boolean;
}

/** Motes per Linh Sa payout: one per 10, 1–6 (view only). */
export function motesFor(delta: number): number {
  return Math.max(1, Math.min(6, Math.round(delta / 10)));
}

/** A point on the mote's arc at t (0–1): a quadratic curve that lifts first, then eases into the target. */
export function moteAt(t: number, sx: number, sy: number, tx: number, ty: number, lift: number, out: { x: number; y: number }): { x: number; y: number } {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const e = 1 - (1 - k) * (1 - k);
  const cx = (sx + tx) / 2;
  const cy = Math.min(sy, ty) - lift;
  const u = 1 - e;
  out.x = u * u * sx + 2 * u * e * cx + e * e * tx;
  out.y = u * u * sy + 2 * u * e * cy + e * e * ty;
  return out;
}

interface Mote {
  node: HTMLElement;
  t: number;
  life: number;
  sx: number;
  sy: number;
  lift: number;
}

const POOL = 32;
const FLIGHT_S = 0.75;

export function createPickups(renderer: Renderer3D, host: HTMLElement, options: PickupsOptions = {}): PickupsView {
  const seat = options.seat ?? 0;
  const reduced = options.reduced ?? (() => false);
  const doc = host.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "ic-motes";
  layer.setAttribute("aria-hidden", "true");
  host.append(layer);
  const motes: Mote[] = [];
  for (let k = 0; k < POOL; k += 1) {
    const node = doc.createElement("span");
    node.className = "ic-mote";
    node.hidden = true;
    layer.append(node);
    motes.push({ node, t: 0, life: 0, sx: 0, sy: 0, lift: 0 });
  }
  const screen: ScreenPoint = { x: 0, y: 0, visible: false };
  const spot = { x: 0, y: 0 };
  /** Deaths of the last batch: tick and metres. */
  const deaths: { tick: number; x: number; z: number }[] = [];
  let next = 0;
  let live = 0;

  const launch = (sx: number, sy: number, count: number): void => {
    for (let k = 0; k < count; k += 1) {
      const mote = motes[next]!;
      next = (next + 1) % POOL;
      if (mote.life <= 0) live += 1;
      mote.t = -k * 0.06;
      mote.life = FLIGHT_S + k * 0.06;
      mote.sx = sx + (k % 3 - 1) * 8;
      mote.sy = sy + (k % 2) * 6;
      mote.lift = 60 + (k % 3) * 18;
      mote.node.hidden = false;
    }
  };

  return {
    get live() {
      return live;
    },
    onEvents(events: readonly SimEvent[], _world: World): void {
      deaths.length = 0;
      for (const event of events) if (event.type === "death") deaths.push({ tick: event.tick, x: event.x, z: event.z });
      if (reduced()) return;
      for (const event of events) {
        if (event.type !== "linh-sa" || event.seat !== seat || event.delta <= 0) continue;
        if (event.reason === "kill") {
          let death: { x: number; z: number } | null = null;
          for (const item of deaths) if (item.tick === event.tick) death = item;
          if (death === null) continue;
          renderer.project(death.x, 0.6, death.z, screen);
          if (!screen.visible) continue;
          launch(screen.x, screen.y, motesFor(event.delta));
        } else {
          const target = options.target?.() ?? { x: 24, y: 24 };
          launch(target.x + 40, target.y + 60, Math.min(3, motesFor(event.delta)));
        }
      }
    },
    frame(_world: World, info: FrameInfo): void {
      if (live === 0) return;
      const target = options.target?.() ?? { x: 24, y: 24 };
      for (const mote of motes) {
        if (mote.life <= 0) continue;
        mote.t += info.dt;
        mote.life -= info.dt;
        if (mote.life <= 0 || reduced()) {
          mote.life = 0;
          mote.node.hidden = true;
          live -= 1;
          continue;
        }
        moteAt(mote.t / FLIGHT_S, mote.sx, mote.sy, target.x, target.y, mote.lift, spot);
        mote.node.style.transform = "translate(" + spot.x.toFixed(1) + "px," + spot.y.toFixed(1) + "px)";
        mote.node.style.opacity = mote.t < 0 ? "0" : "1";
      }
    },
    dispose(): void {
      layer.remove();
    },
  };
}
